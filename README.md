# downav — download any video

Lightweight web-only video/audio downloader.

## Pages

- `/` — landing page: download, platform, cara guna, kenapa downav
- `/cara-guna` — redirect ke bagian cara guna

Desktop and mobile use different navigation/layouts through responsive CSS: desktop shows links in the top navbar; mobile uses a hamburger menu.

## Run locally / Termux

```bash
npm start
```

Open `http://127.0.0.1:3000`.

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

The server logs request IDs, status, endpoint, resolver errors, media stream errors, and keeps the process alive after request-level failures.

## Termux one-paste

```bash
cd ~ && rm -rf downav && unzip -o ~/downloads/downav-v7.zip -d downav && cd downav && npm start
```

## Download behavior

The download endpoint is `/api/download`. It streams binary media and sends `Content-Disposition: attachment`.

It rejects JSON/HTML responses instead of saving them as `.mp4` or `.mp3`. Audio downloads are only accepted when the upstream response is an audio media type or the source is explicitly an `.mp3` URL. No fake extension conversion is performed.

## Vercel

Push this directory to GitHub and import the repository into Vercel. `package.json` pins Node.js 24.x and `vercel.json` sets the API timeout. Canonical URL, `robots.txt` and `sitemap.xml` follow the production domain automatically (override with `SITE_URL`).

Optional source resolver override:

`DOWNAV_SOURCE_API=https://your-resolver.example/api`

## VPS

Use Node.js 20+:

```bash
npm start
```

Put Nginx/Caddy in front of port 3000 for HTTPS if exposing it publicly.

## Important

The resolver determines which sources/formats are actually supported. downav does not guarantee that every website or every URL can be resolved.


## Catatan source
HTML/CSS/JS di browser tetap dapat diperiksa karena memang harus dikirim ke client. v10 memakai clean routes dan tidak menyediakan URL `index.html` sebagai URL normal; logic resolver/download tetap diproses di server.
