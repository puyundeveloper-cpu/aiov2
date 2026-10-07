import template from './views/index.js';

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function first(value) {
  return String(value || '').split(',')[0].trim();
}

export function siteOrigin(req) {
  const fixed = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(fixed)) return fixed;
  const production = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (HOST_PATTERN.test(production)) return `https://${production}`;
  const headers = req.headers || {};
  let host = first(headers['x-forwarded-host']) || first(headers.host);
  if (!HOST_PATTERN.test(host)) host = 'localhost';
  const local = /^(localhost|127\.|0\.0\.0\.0|\[)/.test(host);
  const proto = first(headers['x-forwarded-proto']) || (local ? 'http' : 'https');
  return `${proto === 'http' && !local ? 'https' : proto}://${host}`;
}

export function renderIndex(origin) {
  return template.replaceAll('%%ORIGIN%%', origin);
}

export function robotsTxt(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${origin}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}
