/**
 * Mezoteric LAN Network Transport & Synchronization
 * 
 * Manages:
 * 1. Persistent WebSocket connection to the local school node (/ws/client)
 * 2. Background outbox pumping (replaying queued actions when LAN reconnects)
 * 3. Real-time REST endpoints: /api/sync, /api/records, /api/publish, /api/media
 * 4. Dual-mode network detection: distinguishes between full Internet connectivity
 *    and local School LAN Mode (when MTN/ISP internet drops, the school network remains active).
 */

import { dropOut, listOutbox, queueOut } from './db.js';

const RETRY_MAX = 10000;

export class Net {
  constructor({ onState, onStatus } = {}) {
    this.onState = onState || (() => {});
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.userId = null;
    this.status = 'connecting'; // 'online' | 'lan_only' | 'offline'
    this.attempt = 0;
    this.pumpTimer = null;
    this.closed = false;
    this.pumping = false;
    this.infoData = null;
  }

  get origin() {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://127.0.0.1:3000';
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
        try {
          detail = (await res.json()).err || '';
        } catch {
          /* ignore */
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      this.checkConnectivity();
      return raw ? res : await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async checkConnectivity() {
    // Check if public internet is reachable vs local LAN only
    if (typeof window === 'undefined') return;
    const isWanOnline = typeof navigator !== 'undefined' && navigator.onLine;
    this.setStatus(isWanOnline ? 'online' : 'lan_only');
  }

  async info() {
    const data = await this.request('/api/info');
    this.infoData = data;
    return data;
  }

  async sync(userId) {
    return this.request(`/api/sync`, { method: 'POST', body: { userId } });
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
    if (!ids || !ids.length) return;
    return this.request('/api/acks', { method: 'POST', body: { ids } });
  }

  /**
   * Upload encrypted media byte buffer directly to the local LAN node
   */
  async uploadBlob(bytes) {
    const res = await this.request('/api/media', {
      method: 'POST',
      body: bytes,
      raw: true,
      timeout: 120000,
    });
    return res;
  }

  connect(userId) {
    if (typeof window === 'undefined') return;
    this.userId = userId;
    this.closed = false;
    this._connectWs();
    this._startPump();
  }

  _wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws/client`;
  }

  _connectWs() {
    if (this.closed || !this.userId) return;
    try {
      this.ws = new WebSocket(this._wsUrl());
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.attempt = 0;
      this.checkConnectivity();
      this.ws.send(JSON.stringify({ t: 'hello', userId: this.userId }));
      this.pump();
    };

    this.ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.t === 'ready') {
        this.checkConnectivity();
      } else if (msg.t === 'state') {
        this.onState(msg.table, msg.items);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('offline');
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setStatus('offline');
    };
  }

  _scheduleReconnect() {
    if (this.closed) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.attempt++), RETRY_MAX);
    setTimeout(() => this._connectWs(), delay);
  }

  _startPump() {
    if (this.pumpTimer) return;
    this.pumpTimer = setInterval(() => this.pump(), 4000);
  }

  /**
   * Replays any actions that were queued in IndexedDB while offline
   */
  async pump() {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    try {
      const pending = await listOutbox();
      for (const item of pending) {
        try {
          if (item.type === 'record') await this.putRecords([item.data]);
          else if (item.type === 'role') await this.putRole(item.data);
          else if (item.type === 'request') await this.putRequest(item.data);
          else if (item.type === 'proposal') await this.putProposal(item.data);
          else if (item.type === 'publish') await this.publish(item.table, [item.data]);
          else if (item.type === 'doc') await this.putDocs([item.data]);
          else if (item.type === 'envelope') {
            await this.request('/api/envelopes', { method: 'POST', body: { items: [item.data] } });
          }
          await dropOut(item.id);
        } catch (err) {
          console.warn('outbox delivery error, will retry:', err.message);
          break;
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /**
   * Post an item to the network, with automatic offline queueing if unreachable
   */
  async postOrQueue(type, data, table = null) {
    const item = { id: data.id || Date.now().toString(), type, data, table, ts: Date.now() };
    try {
      if (type === 'record') await this.putRecords([data]);
      else if (type === 'role') await this.putRole(data);
      else if (type === 'request') await this.putRequest(data);
      else if (type === 'proposal') await this.putProposal(data);
      else if (type === 'publish') await this.publish(table, [data]);
      else if (type === 'doc') await this.putDocs([data]);
      else if (type === 'envelope') {
        await this.request('/api/envelopes', { method: 'POST', body: { items: [data] } });
      }
    } catch {
      // Queue in local IndexedDB outbox so it sends automatically once connection returns
      await queueOut(item);
    }
  }

  close() {
    this.closed = true;
    if (this.pumpTimer) clearInterval(this.pumpTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}
