import { fetchMedia, contentType, safeFilename } from '../lib/downav.js';
import { Readable } from 'node:stream';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const raw = String(req.query?.url || '');
    if (!raw) return res.status(400).json({ ok: false, message: 'url wajib diisi.' });

    const { response } = await fetchMedia(raw, { accept: '*/*' });
    const contentTypeHeader = contentType(response);
    const requestedType = String(req.query?.type || '').toLowerCase();
    const requestedName = safeFilename(req.query?.filename || 'downav-file');
    const lowerUrl = raw.toLowerCase();
    const isAudio = contentTypeHeader.toLowerCase().startsWith('audio/') || /\.mp3(?:$|\?)/i.test(lowerUrl);
    const isVideo = contentTypeHeader.toLowerCase().startsWith('video/') || /\.(mp4|webm|mov|mkv)(?:$|\?)/i.test(lowerUrl);
    if (!isAudio && !isVideo) return res.status(502).json({ ok: false, message: 'upstream tidak mengembalikan file video/audio. JSON atau halaman web tidak dianggap sebagai media.' });
    if (requestedType === 'audio' && !/audio\/mpeg/i.test(contentTypeHeader) && !/\.mp3(?:$|\?)/i.test(lowerUrl)) return res.status(502).json({ ok: false, message: 'resolver tidak menyediakan MP3 yang valid.' });
    if (requestedType === 'video' && !/video\/(mp4|webm|quicktime)/i.test(contentTypeHeader) && !/\.(mp4|webm|mov)(?:$|\?)/i.test(lowerUrl)) return res.status(502).json({ ok: false, message: 'resolver tidak menyediakan file video binary yang valid.' });
    const fallbackExt = isAudio ? 'mp3' : 'mp4';
    const filename = /\.[a-z0-9]{2,8}$/i.test(requestedName) ? requestedName : `${requestedName}.${fallbackExt}`;

    res.status(response.status);
    res.setHeader('Content-Type', 'application/octet-stream');
    const asciiName = filename.replace(/[^A-Za-z0-9._ -]/g, '_');
    const encodedName = encodeURIComponent(filename).replace(/%20/g, ' ');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Cache-Control', 'private, no-store');
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (req.method === 'HEAD' || !response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error('[download]', error);
    return res.status(400).json({ ok: false, message: error?.message || 'gagal mengunduh media.' });
  }
}
