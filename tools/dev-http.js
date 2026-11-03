// Development helper: serve the app over plain HTTP on localhost.
//
// The school node uses a self-signed certificate so that encryption, the
// camera and offline install work on every device. That certificate is not
// trusted by the browser, so every visit shows a "not private" warning.
//
// localhost is treated as a secure context by browsers even over plain HTTP,
// so WebCrypto, service workers and the camera all keep working. This proxy
// serves the static app and forwards /api and /media to the real node, which
// makes local development far less noisy.
//
//   node tools/dev-http.js
//   open http://localhost:3001
//
// It is a development convenience only — the real node keeps serving HTTPS.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const TARGET = new URL(process.env.MEZOTERIC_TARGET || 'https://127.0.0.1:3000');
const PORT = Number(process.env.MEZOTERIC_DEV_PORT || 3001);

const isHttps = TARGET.protocol === 'https:';
const client = isHttps ? https : http;
const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    const options = {
      hostname: TARGET.hostname,
      port: TARGET.port || (isHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: TARGET.host },
      agent,
    };
    const upstream = client.request(options, up => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ err: 'node unreachable: ' + err.message }));
    });
    req.pipe(upstream);
    return;
  }

  let filePath = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (url.pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC, 'index.html');
  }
  const type = TYPES[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Mezoteric dev server on http://localhost:${PORT}`);
  console.log(`Forwarding /api and /media to ${TARGET.origin}`);
  console.log('The real node keeps serving HTTPS on ' + TARGET.port);
});
