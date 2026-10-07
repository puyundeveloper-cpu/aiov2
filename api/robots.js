import { robotsTxt, siteOrigin } from '../lib/site.js';

export const config = { maxDuration: 10 };

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.status(200).send(robotsTxt(siteOrigin(req)));
}
