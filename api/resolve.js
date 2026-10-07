import { assertPublicUrl, resolveSource } from '../lib/downav.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'method tidak didukung.' });

    const raw = String(req.query?.url || '');
    if (!raw) return res.status(400).json({ ok: false, message: 'url wajib diisi.' });
    await assertPublicUrl(raw);

    const data = await resolveSource(raw);
    return res.status(200).setHeader('Cache-Control', 'no-store').json({ ok: true, data });
  } catch (error) {
    console.error('[resolve]', error);
    return res.status(400).json({ ok: false, message: error?.message || 'gagal memproses link.' });
  }
}
