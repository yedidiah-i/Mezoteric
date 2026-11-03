// Node transport: REST sync, live WebSocket push, and a persistent outbox.
// If the school node is unreachable (node restarting, Wi-Fi flap, power cut)
// outgoing work is queued in IndexedDB and replayed as soon as it returns.
import { dropOut, listOutbox, queueOut } from './db.js';

const RETRY_MAX = 15000;

export class Net {
  constructor({ onState, onStatus } = {}) {
    this.onState = onState || (() => {});
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.userId = null;
    this.status = 'connecting';
    this.attempt = 0;
    this.pumpTimer = null;
    this.closed = false;
    this.pumping = false;
    this.info = null;
  }

  get origin() {
    return location.origin;
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  async request(path, { method = 'GET', body, timeout = 25000, raw = false } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.origin + path, {
        method,
        credentials: 'same-origin',
        headers: body && !raw ? { 'content-type': 'application/json' } : undefined,
        body: body ? (raw ? body : JSON.stringify(body)) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).err || ''; } catch { /* ignore */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      this.setStatus('online');
      return raw ? res : await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async info() {
    const data = await this.request('/api/info');
    this.info = data;
    return data;
  }

  async sync(userId) {
    return this.request(`/api/sync?userId=${encodeURIComponent(userId)}`);
  }

  async putRecords(records) {
    return this.request('/api/records', { method: 'POST', body: { items: records } });
  }

  async putRole(assertion) {
    return this.request('/api/roles', { method: 'POST', body: { items: [assertion] } });
  }

  async putRequest(req) {
    return this.request('/api/requests', { method: 'POST', body: { items: [req] } });
  }

  async putProposal(proposal) {
    return this.request('/api/proposals', { method: 'POST', body: { items: [proposal] } });
  }

  async publish(table, items) {
    return this.request('/api/publish', { method: 'POST', body: { table, items } });
  }

  async putDocs(docs) {
    return this.request('/api/docs', { method: 'POST', body: { items: docs } });
  }

  async ack(ids) {
    if (!ids.length) return;
    return this.request('/api/acks', { method: 'POST', body: { ids } });
  }

  /** Encrypted bytes only: the node stores opaque blobs and cannot open them. */
  async uploadBlob(bytes) {
    const res = await this.request('/api/media', {
      method: 'POST',
      body: bytes,
      raw: true,
      timeout: 180000,
    });
    return res.json();
  }

  // ---------- outbox ----------

  async send(op) {
    switch (op.type) {
      case 'envelope': return this.request('/api/envelopes', { method: 'POST', body: { items: [op.payload] } });
      case 'doc': return this.putDocs([op.payload]);
      case 'record': return this.putRecords([op.payload]);
      case 'role': return this.putRole(op.payload);
      case 'request': return this.putRequest(op.payload);
      case 'proposal': return this.putProposal(op.payload);
      case 'publish': return this.publish(op.table, [op.payload]);
      default: return null;
    }
  }

  /** Send now, or persist for replay. Never throws for transport errors. */
  async transmit(op) {
    try {
      const res = await this.send(op);
      if (res && res.ok === false && res.results) {
        const bad = res.results.find(r => r && r.ok === false);
        if (bad) console.warn('node rejected item:', bad.err);
      }
      this.setStatus('online');
      return true;
    } catch (err) {
      this.setStatus('offline');
      await queueOut({ ...op, id: op.id || crypto.randomUUID(), tries: 0, nextAt: 0, queuedAt: Date.now() });
      this.schedulePump(1500);
      return false;
    }
  }

  schedulePump(delay = 3000) {
    if (this.pumpTimer) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pump();
    }, delay);
  }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const ops = await listOutbox();
      if (!ops.length) return;
      ops.sort((a, b) => a.queuedAt - b.queuedAt);
      for (const op of ops) {
        if (op.nextAt && op.nextAt > Date.now()) continue;
        try {
          await this.send(op);
          await dropOut(op.id);
          this.setStatus('online');
        } catch {
          this.setStatus('offline');
          const tries = (op.tries || 0) + 1;
          await queueOut({ ...op, tries, nextAt: Date.now() + Math.min(RETRY_MAX, 1000 * 2 ** Math.min(tries, 4)) });
          break;
        }
      }
    } finally {
      this.pumping = false;
      const left = await listOutbox().catch(() => []);
      if (left.length) this.schedulePump(4000);
    }
  }

  // ---------- live socket ----------

  connect(userId) {
    this.userId = userId;
    this.closed = false;
    // Keep the ping loop to a single instance: booting twice used to leak an
    // extra interval and orphan the first socket.
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        try { this.ws.send(JSON.stringify({ t: 'ping' })); } catch { /* ignore */ }
      }
    }, 20000);
    if (!this.ws || this.ws.readyState > 1) this.openSocket();
  }

  openSocket() {
    if (this.closed || !this.userId) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws/client`);
    } catch {
      this.reconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('online');
      ws.send(JSON.stringify({ t: 'hello', userId: this.userId }));
      this.pump();
    };
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'state') this.onState(msg.table, msg.items || []);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.setStatus('offline');
      this.reconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  reconnect() {
    if (this.closed) return;
    const delay = Math.min(10000, 600 * 2 ** this.attempt++);
    setTimeout(() => this.openSocket(), delay);
  }

  disconnect() {
    this.closed = true;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } }
  }
}
