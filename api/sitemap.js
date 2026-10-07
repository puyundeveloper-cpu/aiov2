import { sitemapXml, siteOrigin } from '../lib/site.js';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.status(200).send(sitemapXml(siteOrigin(req)));
}
