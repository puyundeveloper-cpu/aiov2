import { fetchMedia, contentType } from '../lib/downav.js';
import { Readable } from 'node:stream';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const raw = String(req.query?.url || '');
    if (!raw) return res.status(400).json({ ok: false, message: 'url wajib diisi.' });

    const { response } = await fetchMedia(raw, {
      range: req.headers.range,
      'if-range': req.headers['if-range'],
      accept: req.headers.accept
    });

    res.status(response.status);
    res.setHeader('Content-Type', contentType(response));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (req.method === 'HEAD' || !response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error('[media]', error);
    return res.status(400).json({ ok: false, message: error?.message || 'gagal mengambil media.' });
  }
}
