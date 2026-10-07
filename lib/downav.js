import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

export const SOURCE_API = process.env.DOWNAV_SOURCE_API || 'https://api.ikyyxd.my.id/download/all-in-one';

const PRIVATE_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', '0.0.0.0', '::1']);

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower === '::ffff:127.0.0.1';
  }
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const ranges = [
    ['10.0.0.0', '10.255.255.255'],
    ['100.64.0.0', '100.127.255.255'],
    ['127.0.0.0', '127.255.255.255'],
    ['169.254.0.0', '169.254.255.255'],
    ['172.16.0.0', '172.31.255.255'],
    ['192.0.0.0', '192.0.0.255'],
    ['192.168.0.0', '192.168.255.255'],
    ['198.18.0.0', '198.19.255.255'],
    ['224.0.0.0', '255.255.255.255']
  ];
  return ranges.some(([start, end]) => {
    const a = ipv4ToInt(start);
    const b = ipv4ToInt(end);
    return a !== null && b !== null && n >= a && n <= b;
  });
}

export async function assertPublicUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('hanya url http/https yang didukung.');
  if (process.env.DOWNAV_ALLOW_PRIVATE_URLS === 'true') return parsed;
  if (PRIVATE_HOSTNAMES.has(parsed.hostname.toLowerCase())) throw new Error('alamat lokal tidak diizinkan.');
  if (isPrivateIp(parsed.hostname)) throw new Error('alamat jaringan privat tidak diizinkan.');

  const answers = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (answers.some(answer => isPrivateIp(answer.address))) throw new Error('host tujuan mengarah ke jaringan privat.');
  return parsed;
}

export function getSourceUrl(input) {
  const url = new URL(SOURCE_API);
  url.searchParams.set('url', input);
  return url.toString();
}

function requestJsonHttp1(source, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirect source api terlalu banyak.'));
    const req = https.get(source, {
      headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.8', 'user-agent': 'downav/1.0' },
      timeout: 30000
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.resume();
        if (!location) return reject(new Error('source api memberi redirect tanpa tujuan.'));
        return requestJsonHttp1(new URL(location, source).toString(), redirects + 1).then(resolve, reject);
      }
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; if (text.length > 8 * 1024 * 1024) req.destroy(new Error('respons source api terlalu besar.')); });
      res.on('end', () => resolve({ status: res.statusCode || 0, text }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('source api timeout.')));
    req.on('error', reject);
  });
}

export async function resolveSource(input) {
  const source = getSourceUrl(input);
  let result;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { result = await requestJsonHttp1(source); break; }
    catch (error) { lastError = error; if (attempt === 0) await new Promise(r => setTimeout(r, 350)); }
  }
  if (!result) throw new Error(`source api tidak bisa dihubungi: ${lastError?.message || 'koneksi gagal'}`);
  let data = null;
  try { data = JSON.parse(result.text); } catch {}
  if (result.status < 200 || result.status >= 300) throw new Error(`source api mengembalikan ${result.status}.`);
  if (data == null) throw new Error('source api tidak mengembalikan json.');
  if (data?.status === false) throw new Error(data.message || data.error || 'source api gagal memproses link.');
  return data;
}

function requestMediaHttp1(target, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(target);
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request(parsed, { method: 'GET', headers, timeout: 30000 }, res => {
      const headersMap = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) value.forEach(v => headersMap.append(key, v));
        else if (value != null) headersMap.set(key, String(value));
      }
      resolve({
        status: res.statusCode || 0,
        ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
        headers: headersMap,
        body: Readable.toWeb(res)
      });
    });
    req.on('timeout', () => req.destroy(new Error('media server timeout.')));
    req.on('error', reject);
    req.end();
  });
}


function extractUrlFromJson(value, depth = 0) {
  if (!value || depth > 7) return '';
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : '';
  if (Array.isArray(value)) {
    for (const item of value) { const found = extractUrlFromJson(item, depth + 1); if (found) return found; }
    return '';
  }
  if (typeof value !== 'object') return '';
  const keys = ['url','downloadUrl','download_url','fileUrl','file_url','directUrl','direct_url','href','src','no_watermark','nowm','mp4','mp3','audio','video','file','result','data','media','medias','items','formats','links'];
  for (const key of keys) { const found = extractUrlFromJson(value[key], depth + 1); if (found) return found; }
  return '';
}

async function unwrapMediaJson(response, currentTarget) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('json') && !type.includes('text/plain')) return null;
  const text = await new Response(response.body).text();
  if (text.length > 8 * 1024 * 1024) throw new Error('respons media JSON terlalu besar.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('upstream tidak mengembalikan media binary.'); }
  const next = extractUrlFromJson(parsed);
  if (!next) throw new Error('upstream hanya mengembalikan JSON tanpa URL media.');
  return await assertPublicUrl(new URL(next, currentTarget).toString());
}

export async function fetchMedia(rawUrl, requestHeaders = {}) {
  let target = await assertPublicUrl(rawUrl);
  const headers = {
    'user-agent': 'downav/1.1',
    accept: requestHeaders.accept || '*/*'
  };
  if (requestHeaders.range) headers.range = requestHeaders.range;
  if (requestHeaders['if-range']) headers['if-range'] = requestHeaders['if-range'];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await requestMediaHttp1(target, headers);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('media server memberi redirect tanpa tujuan.');
      target = await assertPublicUrl(new URL(location, target).toString());
      continue;
    }
    if (!response.ok && response.status !== 206) throw new Error(`media server mengembalikan ${response.status}.`);
    const unwrapped = await unwrapMediaJson(response, target);
    if (unwrapped) { target = unwrapped; continue; }
    return { response, target };
  }

  throw new Error('redirect media terlalu banyak.');
}

export function contentType(response, fallback = 'application/octet-stream') {
  return response.headers.get('content-type') || fallback;
}

export function safeFilename(raw, fallback = 'downav-file.bin') {
  const cleaned = String(raw || fallback)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return (cleaned || fallback).slice(0, 120);
}
