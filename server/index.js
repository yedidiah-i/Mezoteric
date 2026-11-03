#!/usr/bin/env node
// Mezoteric node: serves the app, relays end-to-end encrypted envelopes,
// gossips signed metadata with peer nodes, discovers peers on the LAN.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import selfsigned from 'selfsigned';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { Mesh } from './mesh.js';
import { startDiscovery } from './discovery.js';
import { randomId } from './util.js';

const PORT = Number(process.env.MZ_PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || 3000);
const PUBLIC_DIR = path.resolve('public');
const MAX_BODY = 220 * 1024 * 1024; // media uploads (LAN)

const store = new Store();

// ---- manual + discovered peers (persisted) ----
const peersFile = path.join(store.dir, 'peers.json');
let peers = [];
try { peers = JSON.parse(fs.readFileSync(peersFile, 'utf8')) || []; } catch {}
function savePeers() { try { fs.writeFileSync(peersFile, JSON.stringify(peers)); } catch {} }
function addPeer({ addr, port, via }) {
  if (!addr || !port) return;
  const key = `${addr}:${port}`;
  if (peers.some(p => `${p.addr}:${p.port}` === key)) return;
  peers.push({ addr, port: Number(port), via: via || 'manual', added: Date.now() });
  savePeers();
  console.log('peer added:', key, `(${via || 'manual'})`);
}
function allPeers() {
  const out = new Map();
  for (const p of peers) out.set(`${p.addr}:${p.port}`, { ...p, source: 'configured' });
  return out;
}

const mesh = new Mesh(store, {
  port: PORT,
  getPeers: () => [...allPeers().values()],
  addPeer,
});

startDiscovery({
  nodeId: store.state.node.id,
  port: PORT,
  onPeer: ({ addr, port, nodeId, name }) => {
    const key = `${addr}:${port}`;
    const known = allPeers().get(key);
    if (!known) addPeer({ addr, port, via: 'lan' });
    else if (known.source !== 'configured') { known.lastSeen = Date.now(); known.nodeId = nodeId; known.name = name; }
  },
});

// ---- HTTP helpers ----
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new Error('bad json'); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, urlPath);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback for extensionless paths
      if (!path.extname(urlPath)) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); res.end('not found'); return; }
          res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(html);
        });
        return;
      }
      res.writeHead(404); res.end('not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' };
    if (ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.pdf') headers['accept-ranges'] = 'bytes';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

function serveMedia(req, res, id) {
  let p;
  try { p = store.mediaPath(id); } catch { res.writeHead(400); res.end(); return; }
  fs.stat(p, (err, st) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const range = req.headers.range;
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('content-type', 'application/octet-stream');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start < st.size && end >= start) {
          res.writeHead(206, {
            'content-range': `bytes ${start}-${end}/${st.size}`,
            'content-length': end - start + 1,
          });
          fs.createReadStream(p, { start, end }).pipe(res);
          return;
        }
      }
    }
    res.writeHead(200, { 'content-length': st.size });
    fs.createReadStream(p).pipe(res);
  });
}

function lanAddress() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

function localIPv4s() {
  const out = ['127.0.0.1'];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal && !out.includes(i.address)) out.push(i.address);
    }
  }
  return out;
}

// Browsers only expose WebCrypto, camera/mic and service workers on a secure
// origin. A LAN IP over plain http is NOT secure, so the node serves HTTPS with
// a self-signed certificate it generates once and keeps in data/tls.
async function ensureTls() {
  if (process.env.MZ_INSECURE === '1') return null;
  const dir = path.join(store.dir, 'tls');
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  const altNames = [
    { type: 2, value: 'localhost' },
    ...(process.env.MZ_HOSTNAME ? [{ type: 2, value: process.env.MZ_HOSTNAME }] : []),
    ...localIPv4s().map(ip => ({ type: 7, ip })),
  ];
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: process.env.MZ_NODE_NAME || 'Mezoteric School Node' }],
    {
      days: 3650,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', keyCertSign: false, digitalSignature: true, keyEncipherment: true },
        { name: 'subjectAltName', altNames },
      ],
    }
  );
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  console.log('generated self-signed TLS certificate for', altNames.map(a => a.value || a.ip).join(', '));
  return { key: pems.private, cert: pems.cert };
}

// ---- REST ----
async function handleApi(req, res, pathname) {
  const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req, pathname === '/api/media' ? MAX_BODY : 8 * 1024 * 1024) : null;

  if (req.method === 'GET' && pathname === '/api/info') {
    return json(res, 200, {
      nodeId: store.state.node.id,
      nodeName: store.state.node.name,
      port: PORT,
      scheme,
      lanIp: lanAddress(),
      tls: !!tls,
      userCount: Object.keys(store.state.directory).length,
      envelopeCount: Object.keys(store.state.envelopes).length,
      docCount: Object.keys(store.state.docs).length,
      uptime: process.uptime(),
    });
  }

  if (req.method === 'GET' && pathname === '/api/peers') {
    const out = [];
    for (const p of allPeers().values()) {
      const key = `${p.addr}:${p.port}`;
      const live = mesh.conns.get(key);
      out.push({ ...p, connected: !!live, nodeId: live?.nodeId || p.nodeId || null, name: p.name || null });
    }
    return json(res, 200, { peers: out, meshConnections: mesh.conns.size });
  }

  if (req.method === 'POST' && pathname === '/api/peers') {
    const { addr, port } = body || {};
    if (!addr || !port) return json(res, 400, { err: 'addr and port required' });
    addPeer({ addr, port, via: 'manual' });
    return json(res, 200, { ok: true, peers });
  }

  if (req.method === 'POST' && pathname === '/api/sync') {
    const { userId } = body || {};
    const snap = store.snapshot();
    const envelopes = Object.values(snap.envelopes)
      .filter(e => e.to === userId || e.to === '*')
      .sort((a, b) => a.ts - b.ts);
    return json(res, 200, {
      node: snap.node,
      directory: snap.directory,
      roles: snap.roles,
      proposals: snap.proposals,
      announcements: snap.announcements,
      channels: snap.channels,
      shorts: snap.shorts,
      streams: snap.streams,
      requests: snap.requests,
      docs: Object.values(snap.docs).filter(d => d.to === userId || d.to === '*' || d.by === userId),
      envelopes,
      adminCount: await store.adminCount(),
      lanIp: lanAddress(),
      port: PORT,
    });
  }

  const collectors = {
    '/api/records': ['directory', store.ingestRecord.bind(store)],
    '/api/roles': ['roles', store.ingestRole.bind(store)],
    '/api/requests': ['requests', store.ingestRequest.bind(store)],
    '/api/proposals': ['proposals', store.ingestProposal.bind(store)],
    '/api/envelopes': ['envelopes', store.ingestEnvelope.bind(store)],
    '/api/docs': ['docs', store.ingestDoc.bind(store)],
    '/api/acks': null,
    '/api/publish': null,
  };

  if (req.method === 'POST' && pathname === '/api/acks') {
    const ids = (body && body.ids) || [];
    const got = store.ack(ids);
    return json(res, 200, { ok: true, acked: got });
  }

  if (req.method === 'POST' && pathname === '/api/publish') {
    const { table, items } = body || {};
    if (!['channels', 'shorts', 'streams'].includes(table)) return json(res, 400, { err: 'bad table' });
    const results = [];
    for (const item of items || []) results.push(await store.ingestPublic(table, item));
    return json(res, 200, { ok: results.every(r => r.ok), results });
  }

  if (req.method === 'POST' && collectors[pathname]) {
    const [, ingest] = collectors[pathname];
    const items = (body && (body.items || body.records || body.envelopes)) || [];
    const results = [];
    for (const item of items) results.push(await ingest(item));
    const okCount = results.filter(r => r.ok).length;
    return json(res, 200, { ok: okCount > 0 || items.length === 0, results });
  }

  if (req.method === 'POST' && pathname === '/api/media') {
    const buf = await readBody(req, MAX_BODY);
    if (!buf.length) return json(res, 400, { err: 'empty' });
    const id = store.mediaSave(buf);
    return json(res, 200, { ok: true, id, url: `/media/${id}` });
  }

  json(res, 404, { err: 'not found' });
}

// ---- server ----
const requestHandler = async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname.startsWith('/media/')) return serveMedia(req, res, pathname.slice(7));
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    return serveStatic(req, res);
  } catch (err) {
    json(res, 500, { err: err.message });
  }
};

let tls;
try { tls = await ensureTls(); } catch (err) { console.error('TLS setup failed:', err.message); tls = null; }
const server = tls ? https.createServer(tls, requestHandler) : http.createServer(requestHandler);
const scheme = tls ? 'https' : 'http';

// ---- client websockets (live push) ----
const wss = new WebSocketServer({ server, path: '/ws/client' });
const clients = new Map(); // ws -> userId

wss.on('connection', ws => {
  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.t === 'hello' && typeof msg.userId === 'string') {
      clients.set(ws, msg.userId);
      ws.send(JSON.stringify({ t: 'ready', nodeId: store.state.node.id }));
    } else if (msg.t === 'ack' && Array.isArray(msg.ids)) {
      store.ack(msg.ids);
    } else if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
    }
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function push(table, items) {
  const raw = JSON.stringify({ t: 'state', table, items });
  for (const [ws, userId] of clients) {
    if (ws.readyState !== 1) continue;
    if (table === 'envelopes' || table === 'docs') {
      const mine = items.filter(e => e && (e.to === userId || e.to === '*' || e.by === userId));
      if (mine.length) ws.send(JSON.stringify({ t: 'state', table, items: mine }));
    } else {
      ws.send(raw);
    }
  }
}
store.onChange((table, items) => push(table, items));

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log('');
  console.log('  Mezoteric school node is running');
  console.log(`  Local:   ${scheme}://localhost:${PORT}`);
  console.log(`  LAN:     ${scheme}://${lan}:${PORT}`);
  console.log('  Works with or without internet.');
  if (tls) {
    console.log('');
    console.log('  HTTPS is on with a local self-signed certificate (needed for');
    console.log('  encryption, camera and offline install). Each device shows a');
    console.log('  one-time "not private" warning: choose Advanced -> Proceed.');
  } else {
    console.log('  WARNING: MZ_INSECURE=1 - browsers disable encryption and camera');
    console.log('           on plain http LAN addresses.');
  }
  console.log(`  node id: ${store.state.node.id}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { store.flush(); process.exit(0); });
}
