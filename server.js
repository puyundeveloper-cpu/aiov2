import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, pipeline } from 'node:stream';
import { contentType, fetchMedia, resolveSource, safeFilename, assertPublicUrl } from './lib/downav.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function stamp() { return new Date().toISOString(); }
function log(level, message, meta = '') {
  const suffix = meta ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}` : '';
  console.log(`[${stamp()}] [${level}] ${message}${suffix}`);
}
function requestId() { return Math.random().toString(36).slice(2, 8); }

function sendJson(res, status, payload) {
  if (res.headersSent) { try { res.end(); } catch {} return; }
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function getUrl(req) { return new URL(req.url, `http://${req.headers.host || 'localhost'}`); }

async function proxyMedia(req, res, download, rid) {
  const u = getUrl(req);
  const raw = u.searchParams.get('url') || '';
  if (!raw) return sendJson(res, 400, { ok: false, message: 'url wajib diisi.', requestId: rid });
  log('INFO', `${rid} media ${download ? 'download' : 'preview'} start`, raw.slice(0, 180));
  const { response } = await fetchMedia(raw, {
    range: req.headers.range,
    'if-range': req.headers['if-range'],
    accept: req.headers.accept || '*/*'
  });

  const filename = safeFilename(u.searchParams.get('filename') || 'downav-file.bin');
  const asciiFallback = filename
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/[\r\n\"]+/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'downav-file.bin';
  const encodedFilename = encodeURIComponent(filename);
  const headers = {
    'content-type': download ? (u.searchParams.get('type') === 'audio' ? 'audio/mpeg' : 'video/mp4') : contentType(response),
    'cache-control': 'private, no-store',
    'x-downav-request-id': rid,
    'content-disposition': download ? `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}` : 'inline'
  };
  for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }

  res.writeHead(response.status, headers);
  if (req.method === 'HEAD' || !response.body) return res.end();

  const source = Readable.fromWeb(response.body);
  source.on('error', error => {
    log('ERROR', `${rid} upstream stream error`, error?.stack || error?.message || error);
    try { res.destroy(); } catch {}
  });
  res.on('error', error => log('WARN', `${rid} client response error`, error?.message || error));
  pipeline(source, res, error => {
    if (error) log('WARN', `${rid} stream ended with error`, error?.message || error);
    else log('INFO', `${rid} stream finished`);
  });
}

async function handleApi(req, res, pathname, rid) {
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'downav', uptime: Math.round(process.uptime()), time: stamp() });
  }
  if (pathname === '/api/resolve' && req.method === 'GET') {
    try {
      const url = getUrl(req).searchParams.get('url') || '';
      if (!url) return sendJson(res, 400, { ok: false, message: 'url wajib diisi.', requestId: rid });
      log('INFO', `${rid} resolve start`, url.slice(0, 180));
      await assertPublicUrl(url);
      const data = await resolveSource(url);
      log('INFO', `${rid} resolve ok`);
      return sendJson(res, 200, { ok: true, data, requestId: rid });
    } catch (error) {
      log('ERROR', `${rid} resolve failed`, error?.stack || error?.message || error);
      return sendJson(res, 400, { ok: false, message: error?.message || 'gagal memproses link.', requestId: rid });
    }
  }
  if (pathname === '/api/media' && ['GET', 'HEAD'].includes(req.method)) {
    try { return await proxyMedia(req, res, false, rid); }
    catch (error) {
      log('ERROR', `${rid} media failed`, error?.stack || error?.message || error);
      return sendJson(res, 502, { ok: false, message: error?.message || 'gagal mengambil media.', requestId: rid });
    }
  }
  if (pathname === '/api/download' && ['GET', 'HEAD'].includes(req.method)) {
    try { return await proxyMedia(req, res, true, rid); }
    catch (error) {
      log('ERROR', `${rid} download failed`, error?.stack || error?.message || error);
      return sendJson(res, 502, { ok: false, message: error?.message || 'gagal mengunduh media.', requestId: rid });
    }
  }
  return sendJson(res, 404, { ok: false, message: 'api route tidak ditemukan.', requestId: rid });
}

function serveStatic(req, res, pathname, rid) {
  const cleanRoutes = { '/': '/index.html' };
  const legacyRoutes = { '/index.html': '/', '/cara-guna': '/#cara', '/cara-guna.html': '/#cara' };
  if (legacyRoutes[pathname]) {
    res.writeHead(301, { location: legacyRoutes[pathname], 'cache-control': 'no-store' });
    return res.end();
  }
  let requested = cleanRoutes[pathname] || pathname;
  try { requested = decodeURIComponent(requested); }
  catch { return sendJson(res, 400, { ok: false, message: 'path tidak valid.', requestId: rid }); }
  const filePath = path.normalize(path.join(__dirname, requested));
  if (!filePath.startsWith(__dirname)) return sendJson(res, 403, { ok: false, message: 'forbidden.', requestId: rid });
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) return sendJson(res, 404, { ok: false, message: 'not found.', requestId: rid });
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': pathname === '/' ? 'no-store' : 'public, max-age=300', 'x-downav-request-id': rid });
    const stream = fs.createReadStream(filePath);
    stream.on('error', error => { log('ERROR', `${rid} static stream failed`, error?.stack || error?.message || error); try { res.destroy(); } catch {} });
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const rid = requestId();
  res.setHeader('x-downav-request-id', rid);
  try {
    const url = getUrl(req);
    log('INFO', `${rid} ${req.method} ${url.pathname}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, rid);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, message: 'method tidak didukung.', requestId: rid });
    return serveStatic(req, res, url.pathname, rid);
  } catch (error) {
    log('ERROR', `${rid} request crashed`, error?.stack || error?.message || error);
    return sendJson(res, 500, { ok: false, message: 'internal server error.', requestId: rid });
  }
});

server.on('clientError', (error, socket) => {
  log('WARN', 'client protocol error', error?.message || error);
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {}
});
server.on('error', error => log('ERROR', 'server error', error?.stack || error?.message || error));
process.on('unhandledRejection', reason => log('ERROR', 'unhandled rejection (server tetap hidup)', reason?.stack || reason?.message || reason));
process.on('uncaughtException', error => log('ERROR', 'uncaught exception (server tetap hidup)', error?.stack || error?.message || error));
server.listen(PORT, HOST, () => {
  log('OK', `downav running at http://127.0.0.1:${PORT}`);
  log('OK', 'console logging aktif — error request tidak otomatis mematikan server');
});
