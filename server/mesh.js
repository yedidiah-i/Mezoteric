// Peer mesh: nodes connect to each other (auto-discovered on LAN or manually
// added for internet peers) and gossip signed metadata + encrypted envelopes.
// No node is special: any node can go down and the mesh keeps working.
import { WebSocket } from 'ws';

const SYNC_TABLES = ['directory', 'roles', 'proposals', 'announcements', 'channels', 'shorts', 'streams', 'requests', 'docs'];

export class Mesh {
  constructor(store, { port, getPeers, addPeer }) {
    this.store = store;
    this.port = port;
    this.getPeers = getPeers;
    this.addPeer = addPeer;
    this.conns = new Map();   // key -> { ws, nodeId, addr, port }
    this.retryAt = new Map(); // key -> ts
    this.buffer = new Map();  // table -> items (batched forwarding)
    this.flushTimer = null;

    store.onChange((table, items) => this._queue(table, items));

    setInterval(() => this._connectLoop(), 4000).unref();
    this._connectLoop();
  }

  _queue(table, items) {
    if (table === 'acks') table = 'acks';
    const arr = this.buffer.get(table) || [];
    for (const it of items) arr.push(it);
    this.buffer.set(table, arr);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this._flush(), 120);
    }
  }

  _flush() {
    this.flushTimer = null;
    if (!this.conns.size) { this.buffer.clear(); return; }
    for (const [table, items] of this.buffer) {
      if (!items.length) continue;
      this._broadcast({ t: 'fwd', table, items });
    }
    this.buffer.clear();
  }

  _broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const { ws } of this.conns.values()) {
      if (ws.readyState === 1) ws.send(raw);
    }
  }

  _connectLoop() {
    for (const peer of this.getPeers()) {
      const key = `${peer.addr}:${peer.port}`;
      if (this.conns.has(key)) continue;
      const next = this.retryAt.get(key) || 0;
      if (Date.now() < next) continue;
      this._dial(peer, key);
    }
  }

  _dial(peer, key) {
    let ws;
    try {
      ws = new WebSocket(`ws://${peer.addr}:${peer.port}/ws/peer`, { handshakeTimeout: 4000 });
    } catch {
      this.retryAt.set(key, Date.now() + 10_000);
      return;
    }
    const entry = { ws, nodeId: peer.nodeId, addr: peer.addr, port: peer.port, key };
    ws.on('open', () => {
      this.conns.set(key, entry);
      this.retryAt.delete(key);
      console.log('mesh connected to', key);
      ws.send(JSON.stringify({ t: 'hello', nodeId: this.store.state.node.id, port: this.port }));
      this._sendSync(ws);
    });
    ws.on('message', raw => this._onMessage(entry, raw));
    ws.on('close', () => {
      if (this.conns.get(key) === entry) this.conns.delete(key);
      this.retryAt.set(key, Date.now() + 5000);
    });
    ws.on('error', () => { /* close handler retries */ });
  }

  _sendSync(ws) {
    const s = this.store.state;
    const payload = { t: 'sync', tables: {}, envelopes: [], acks: [] };
    for (const name of SYNC_TABLES) payload.tables[name] = Object.values(s[name]);
    payload.envelopes = Object.values(s.envelopes).slice(-2000);
    payload.acks = Object.entries(s.acks).slice(-3000).map(([id, ts]) => ({ id, ts }));
    try { ws.send(JSON.stringify(payload)); } catch {}
  }

  async _onMessage(entry, raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const s = this.store;
    switch (msg.t) {
      case 'hello': {
        entry.nodeId = msg.nodeId;
        // Remember this peer's advertised address so we can redial it.
        if (msg.port) this.addPeer({ addr: entry.addr, port: Number(msg.port), via: 'mesh' });
        break;
      }
      case 'sync': {
        for (const [table, items] of Object.entries(msg.tables || {})) {
          for (const item of items || []) await this._ingest(table, item, entry);
        }
        for (const env of msg.envelopes || []) await this._ingest('envelopes', env, entry);
        await this._ingest('acks', { bulk: msg.acks || [] }, entry);
        break;
      }
      case 'fwd': {
        for (const item of msg.items || []) await this._ingest(msg.table, item, entry);
        break;
      }
    }
  }

  async _ingest(table, item, entry) {
    const s = this.store;
    let res = { ok: false };
    switch (table) {
      case 'directory': res = await s.ingestRecord(item); break;
      case 'roles': res = await s.ingestRole(item); break;
      case 'requests': res = await s.ingestRequest(item); break;
      case 'proposals': res = await s.ingestProposal(item); break;
      case 'envelopes': res = await s.ingestEnvelope(item); break;
      case 'channels': case 'shorts': case 'streams':
        res = await s.ingestPublic(table, item); break;
      case 'docs': res = await s.ingestDoc(item); break;
      case 'announcements': {
        // Announcements only enter via executed proposals; accept verified copies.
        if (item && item.id && !s.state.announcements[item.id] && Array.isArray(item.approvals)) {
          res = await s.ingestProposal({ id: item.id, kind: 'announce', payload: item.payload, ts: item.ts, proposer: item.by, approvals: item.approvals, sig: item.bySig || item.sig, executed: true });
          if (!res.ok && verifyAnnouncement(s, item)) {
            s.state.announcements[item.id] = item;
            s._scheduleSave();
            s._emit('announcements', [item]);
            res = { ok: true, changed: true };
          }
        }
        break;
      }
      case 'acks': {
        const items = item && item.bulk ? item.bulk : [item];
        const got = await s.ingestAck(items);
        res = { ok: true, changed: got.length > 0 };
        break;
      }
      default: return;
    }
    if (res.ok && res.changed) {
      // Relay onward (only truly-new items, so duplicates die out).
      // Do not bounce back to the peer we got it from.
      this._queueExcept(table, item, entry);
    }
  }

  _queueExcept(table, item, fromEntry) {
    const arr = this.buffer.get(table) || [];
    arr.push(item);
    this.buffer.set(table, arr);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this._flushExcept(fromEntry), 120);
  }

  _flushExcept(fromEntry) {
    this.flushTimer = null;
    for (const [table, items] of this.buffer) {
      if (!items.length) continue;
      const raw = JSON.stringify({ t: 'fwd', table, items });
      for (const [key, entry] of this.conns) {
        if (entry === fromEntry || entry.ws.readyState !== 1) continue;
        try { entry.ws.send(raw); } catch {}
      }
    }
    this.buffer.clear();
  }
}

import { canonical, verifySig, pick } from './util.js';

async function verifyAnnouncement(s, ann) {
  const admins = await s.admins();
  if (!admins.length) return false;
  const need = Math.floor(admins.length / 2) + 1;
  const msg = canonical(pick(ann, ['id', 'payload', 'ts']));
  let ok = 0;
  const got = new Set();
  for (const ap of ann.approvals || []) {
    if (got.has(ap.admin) || !admins.includes(ap.admin)) continue;
    const rec = s.state.directory[ap.admin];
    if (!rec) continue;
    if (await verifySig(rec.signPub, msg, ap.sig)) { ok++; got.add(ap.admin); }
  }
  return ok >= need;
}
