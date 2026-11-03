// Client state: verified metadata, decrypted conversations, channel keys,
// school documents, streams and the decentralized admin workflow.
// Nothing from the node is trusted until its signature has been checked.
import {
  canonical, pick, signMessage, pairKey, aesEncrypt, aesDecrypt,
  randomId, hexId, randomAesKey, importAesKey, exportAesKey, encryptBytes, decryptBytes,
  sealVault, openVault,
} from './crypto.js';
import {
  verifyRecord, verifyEnvelope, verifyDoc, verifyPublicItem, verifyRequest,
  verifyProposal, verifyAnnouncement, roleOf, adminsList, threshold, proposalEffectMsg,
  approvalsCount, PUBLIC_SIGN_FIELDS,
} from './authority.js';
import {
  kvGet, kvSet, loadIdentity, saveIdentity, loadMessages, loadAllMessages,
  putMessage, putDoc, loadDocs, listOutbox,
} from './db.js';
import { StreamMesh } from './rtc.js';

const norm = id => (id || '').replace(/[^A-Za-z0-9_-]/g, '');

export class AppState {
  constructor() {
    this.me = null;
    this.keys = null;
    this.net = null;

    this.directory = {};
    this.roles = {};
    this.proposals = {};
    this.announcements = {};
    this.channels = {};
    this.shorts = {};
    this.streams = {};
    this.requests = {};
    this.docs = {};

    this.roleMap = {};
    this.admins = [];

    this.msgsByConv = new Map();
    this.msgIndex = new Map();
    this.docsLocal = new Map();
    this.channelKeys = new Map();
    this.readMarks = new Map();
    this.typing = new Map();
    this.readReceipts = new Map();
    this.streamKeyCache = new Map();

    this.listeners = new Set();
    this.handled = new Set();
    this.pendingEnv = [];
    this.ackQueue = new Set();
    this.ackTimer = null;
    this.ready = false;
    this.syncError = null;
  }

  // ---------- events ----------
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(evt) {
    for (const fn of this.listeners) {
      try { fn(evt); } catch (err) { console.error('listener failed', err); }
    }
  }

  // ---------- boot ----------
  async boot(net, identity, keys) {
    this.net = net;
    this.me = {
      userId: identity.userId,
      name: identity.name,
      signPub: identity.signPub,
      ecdhPub: identity.ecdhPub,
    };
    this.keys = keys;

    // local message history
    for (const m of await loadAllMessages()) {
      this.msgIndex.set(m.id, m);
      if (!this.msgsByConv.has(m.conv)) this.msgsByConv.set(m.conv, []);
      this.msgsByConv.get(m.conv).push(m);
    }
    for (const arr of this.msgsByConv.values()) arr.sort((a, b) => a.ts - b.ts);

    for (const d of await loadDocs()) this.docsLocal.set(d.id, d);
    for (const [channelId, raw] of await kvGet('channelKeys', [])) {
      if (this.channelKeys.has(channelId)) continue;
      try { this.channelKeys.set(channelId, await importAesKey(raw)); } catch { /* bad key */ }
    }
    for (const [conv, ts] of await kvGet('readMarks', [])) this.readMarks.set(conv, ts);

    net.onState = (table, items) => this.handleState(table, items);
    // Chain rather than replace: the shell uses net.onStatus to drive the
    // online/offline dot, and replacing it here would leave the indicator
    // permanently dead.
    const prevStatus = net.onStatus;
    net.onStatus = (s) => { if (prevStatus) prevStatus(s); this.emit({ type: 'status', status: s }); };
    net.connect(this.me.userId);

    // Live video mesh. Signalling rides the same encrypted envelopes as chat.
    this.rtc = new StreamMesh(this);
    await this.rtc.loadConfig();
    this.subscribe(evt => {
      if (evt.type === 'rtc') this.rtc.handleSignal(evt.env, evt.body).catch(() => {});
    });

    await this.fullSync();
    return this;
  }

  async fullSync() {
    try {
      const snap = await this.net.sync(this.me.userId);
      if (this.pendingEnv.length) {
        // Re-run parked envelopes now that the directory may be complete.
        const parked = this.pendingEnv.splice(0);
        for (const env of parked) await this.handleEnvelope(env);
      }
      await this.applySnapshot(snap);
      this.syncError = null;
      await this.flushAcks();
      return true;
    } catch (err) {
      this.syncError = err.message;
      this.emit({ type: 'status' });
      return false;
    }
  }

  async applySnapshot(snap) {
    // 1. directory first: signatures and decryption depend on it.
    for (const rec of Object.values(snap.directory || {})) {
      if (!(await verifyRecord(rec))) continue;
      const prev = this.directory[rec.userId];
      if (!prev || prev.ts <= rec.ts) this.directory[rec.userId] = rec;
    }

    for (const [table, value] of Object.entries({
      roles: snap.roles, proposals: snap.proposals, announcements: snap.announcements,
      channels: snap.channels, shorts: snap.shorts, streams: snap.streams,
      requests: snap.requests, docs: snap.docs,
    })) {
      if (value) this[table] = { ...this[table], ...value };
    }

    // 2. verify what we can only verify with the directory loaded.
    await this.verifyMeta();
    await this.recomputeRoles();

    // 3. personal encrypted items.
    for (const env of snap.envelopes || []) await this.handleEnvelope(env);
    for (const doc of snap.docs || []) await this.handleDoc(doc);

    // 4. documents published before we had the author's record.
    if (this.pendingDocs) {
      const parked = this.pendingDocs.splice(0);
      for (const doc of parked) await this.handleDoc(doc);
    }

    this.ready = true;
    this.emit({ type: 'snapshot' });
  }

  async verifyMeta() {
    for (const t of ['channels', 'shorts', 'streams']) {
      for (const [id, item] of Object.entries(this[t])) {
        if (!(await verifyPublicItem(t, item, this.directory))) delete this[t][id];
      }
    }
    for (const [id, ann] of Object.entries(this.announcements)) {
      if (!(await verifyAnnouncement(ann, this.roles, this.directory))) delete this.announcements[id];
    }
    for (const [id, p] of Object.entries(this.proposals)) {
      if (!(await verifyProposal(p, this.directory))) delete this.proposals[id];
    }
    for (const [id, r] of Object.entries(this.requests)) {
      if (!(await verifyRequest(r, this.directory))) delete this.requests[id];
    }
  }

  async recomputeRoles() {
    const map = {};
    const ids = new Set([...Object.keys(this.directory), ...Object.keys(this.roles)]);
    for (const id of ids) {
      map[id] = await roleOf(id, this.roles, this.directory);
    }
    this.roleMap = map;
    this.admins = await adminsList(this.roles, this.directory);
    this.emit({ type: 'roles' });
  }

  roleOf(userId) {
    return this.roleMap[userId] || 'guest';
  }
  role() {
    return this.roleOf(this.me.userId);
  }
  nameOf(userId) {
    if (userId === this.me?.userId) return this.me.name;
    return this.directory[userId]?.name || 'Unknown';
  }
  userOf(userId) {
    return this.directory[userId] || null;
  }

  // ---------- live pushes ----------
  async handleState(table, items) {
    if (!items || !items.length) return;
    if (table === 'directory') {
      let changed = false;
      for (const rec of items) {
        if (!(await verifyRecord(rec))) continue;
        const prev = this.directory[rec.userId];
        if (!prev || prev.ts <= rec.ts) {
          this.directory[rec.userId] = rec;
          changed = true;
        }
      }
      if (changed) {
        await this.recomputeRoles();
        const parked = this.pendingEnv.splice(0);
        for (const env of parked) await this.handleEnvelope(env);
        this.emit({ type: 'directory' });
      }
      return;
    }
    if (table === 'envelopes') {
      for (const env of items) await this.handleEnvelope(env);
      return;
    }
    if (table === 'docs') {
      for (const doc of items) await this.handleDoc(doc);
      return;
    }
    if (table === 'acks') return;
    if (table === 'streams') {
      // A "gone" marker means the node pruned that stream. It must be removed
      // and must not be written back by the generic merge below.
      const alive = [];
      let dropped = false;
      for (const item of items) {
        if (item && item.gone) { delete this.streams[item.id]; dropped = true; }
        else alive.push(item);
      }
      if (dropped) this.emit({ type: 'stream-gone' });
      items = alive;
      if (!items.length) return;
    }

    const map = this[table];
    if (!map) return;
    for (const item of items) {
      if (!item || !item.id) continue;
      const prev = map[item.id];
      if (prev && prev.ts > item.ts) continue;
      map[item.id] = item;
    }
    if (['roles', 'proposals', 'requests'].includes(table)) {
      await this.verifyMeta();
      await this.recomputeRoles();
      this.emit({ type: 'state', table });
    } else if (table === 'channels' || table === 'shorts' || table === 'streams') {
      await this.verifyMeta();
      this.emit({ type: 'state', table });
    } else {
      this.emit({ type: 'state', table });
    }
  }

  // ---------- envelopes ----------
  async handleEnvelope(env) {
    if (!env || !env.id) return;
    if (this.handled.has(env.id)) return;
    if (this.msgIndex.has(env.id)) { this.handled.add(env.id); return; }
    if (!(await verifyEnvelope(env, this.directory))) {
      // Sender's signed directory record may still be in flight. Park briefly.
      if (!this.pendingEnv.some(e => e.id === env.id)) this.pendingEnv.push(env);
      return;
    }
    this.handled.add(env.id);
    try {
      if (env.kind === 'dm') await this.receiveDm(env);
      else if (env.kind.startsWith('ch-')) await this.receiveChannel(env);
      else if (env.kind.startsWith('sc-')) await this.receiveStreamChat(env);
      else if (env.kind === 'chkey') await this.receiveChannelKey(env);
      else if (env.kind === 'chkey-req') await this.receiveKeyRequest(env);
      else if (env.kind === 'typing') await this.receiveTyping(env);
      else if (env.kind === 'read') await this.receiveRead(env);
      else if (env.kind.startsWith('rtc-')) {
        this.emit({ type: 'rtc', env, body: await this.decryptPairBody(env) });
      }
      this.queueAck(env.id);
    } catch (err) {
      console.warn('could not process envelope', env.kind, err.message);
      this.pendingEnv.push(env);
    }
  }

  async decryptPairBody(env) {
    const other = env.from === this.me.userId ? env.to : env.from;
    const rec = this.directory[other];
    if (!rec) throw new Error('no key for ' + other);
    const key = await pairKey(this.keys.ecdhPriv, rec.ecdhPub, env.from, env.to, env.kind.startsWith('rtc-') ? 'rtc' : 'wrap');
    return JSON.parse(await aesDecrypt(key, env.ct, env.iv));
  }

  queueAck(id) {
    this.ackQueue.add(id);
    if (this.ackTimer) return;
    this.ackTimer = setTimeout(() => { this.ackTimer = null; this.flushAcks(); }, 800);
  }

  async flushAcks() {
    if (!this.ackQueue.size) return;
    const ids = [...this.ackQueue];
    this.ackQueue.clear();
    try { await this.net.ack(ids); } catch { for (const id of ids) this.ackQueue.add(id); }
  }

  async receiveDm(env) {
    const peer = env.from === this.me.userId ? env.to : env.from;
    const rec = this.directory[peer];
    if (!rec) throw new Error('missing peer record');
    const key = await pairKey(this.keys.ecdhPriv, rec.ecdhPub, env.from, env.to, 'dm');
    const body = JSON.parse(await aesDecrypt(key, env.ct, env.iv));
    await this.addMessage({
      id: env.id,
      conv: 'dm:' + peer,
      from: env.from,
      to: env.to,
      ts: env.ts,
      kind: 'text',
      text: body.text || '',
      attachments: body.attachments || [],
      replyTo: body.replyTo || null,
      mine: env.from === this.me.userId,
    });
    this.notify(env.from, body.text || 'Sent an attachment');
  }

  async receiveChannel(env) {
    const channelId = env.kind.slice(3);
    const key = await this.getChannelKey(channelId);
    if (!key) return; // no key = cannot read, nothing leaks
    const body = JSON.parse(await aesDecrypt(key, env.ct, env.iv));
    await this.addMessage({
      id: env.id,
      conv: 'ch:' + channelId,
      channelId,
      from: env.from,
      to: '*',
      ts: env.ts,
      kind: 'text',
      text: body.text || '',
      attachments: body.attachments || [],
      replyTo: body.replyTo || null,
      mine: env.from === this.me.userId,
    });
    this.notify(env.from, `${body.text || 'Attachment'} · #${this.channels[channelId]?.name || 'channel'}`);
  }

  async receiveStreamChat(env) {
    const streamId = env.kind.slice(3);
    const key = await this.getStreamChatKey(streamId);
    if (!key) return;
    const body = JSON.parse(await aesDecrypt(key, env.ct, env.iv));
    await this.addMessage({
      id: env.id,
      conv: 'sc:' + streamId,
      streamId,
      from: env.from,
      to: '*',
      ts: env.ts,
      kind: 'text',
      text: body.text || '',
      mine: env.from === this.me.userId,
    });
    this.emit({ type: 'stream-chat', streamId });
  }

  async getStreamChatKey(streamId) {
    if (this.streamKeyCache.has(streamId)) return this.streamKeyCache.get(streamId);
    const stream = this.streams[streamId];
    if (!stream) return null;
    let raw = null;
    if (stream.chatKey) raw = stream.chatKey;
    if (!raw && stream.wrappedChatKey && stream.channelId) {
      const chKey = await this.getChannelKey(stream.channelId);
      if (chKey) {
        try {
          raw = await aesDecrypt(chKey, stream.wrappedChatKey.ct, stream.wrappedChatKey.iv);
        } catch { return null; }
      }
    }
    if (!raw) return null;
    try {
      const key = await importAesKey(raw);
      this.streamKeyCache.set(streamId, key);
      return key;
    } catch { return null; }
  }

  async receiveChannelKey(env) {
    if (env.to !== this.me.userId) return; // a group key copy meant for someone else
    const body = await this.decryptPairBody(env);
    if (!body.channelId || !body.key) return;
    try {
      const key = await importAesKey(body.key);
      this.channelKeys.set(body.channelId, key);
      const stored = await kvGet('channelKeys', []);
      const map = new Map(stored);
      map.set(body.channelId, body.key);
      await kvSet('channelKeys', [...map]);
      this.emit({ type: 'channel-key', channelId: body.channelId });
      this.notify(env.from, `You were given access to #${this.channels[body.channelId]?.name || 'a channel'}`);
      await this.fullSync();
    } catch (err) {
      console.warn('bad channel key', err.message);
    }
  }

  async receiveKeyRequest(env) {
    const body = await this.decryptPairBody(env);
    if (!body.channelId) return;
    this.emit({ type: 'key-request', channelId: body.channelId, from: env.from });
  }

  async receiveTyping(env) {
    const body = await this.decryptPairBody(env);
    if (!body.conv) return;
    const map = this.typing.get(body.conv) || new Map();
    map.set(env.from, Date.now() + 6000);
    this.typing.set(body.conv, map);
    this.emit({ type: 'typing', conv: body.conv, from: env.from });
    setTimeout(() => {
      const m = this.typing.get(body.conv);
      if (!m) return;
      m.delete(env.from);
      this.emit({ type: 'typing', conv: body.conv, from: env.from });
    }, 6000);
  }

  async receiveRead(env) {
    const body = await this.decryptPairBody(env);
    if (!body.conv) return;
    const map = this.readReceipts.get(body.conv) || new Map();
    map.set(env.from, body.upTo || Date.now());
    this.readReceipts.set(body.conv, map);
    this.emit({ type: 'read', conv: body.conv });
  }

  // ---------- messages ----------
  async addMessage(msg) {
    if (this.msgIndex.has(msg.id)) return;
    this.msgIndex.set(msg.id, msg);
    const arr = this.msgsByConv.get(msg.conv) || [];
    arr.push(msg);
    arr.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
    this.msgsByConv.set(msg.conv, arr);
    await putMessage(msg);
    this.emit({ type: 'message', msg });
  }

  messages(conv) {
    return this.msgsByConv.get(conv) || [];
  }

  lastMessage(conv) {
    const arr = this.messages(conv);
    return arr[arr.length - 1] || null;
  }

  unread(conv) {
    const mark = this.readMarks.get(conv) || 0;
    return this.messages(conv).filter(m => !m.mine && m.ts > mark).length;
  }

  totalUnread() {
    let n = 0;
    for (const conv of this.msgsByConv.keys()) n += this.unread(conv);
    return n;
  }

  async markRead(conv) {
    const last = this.lastMessage(conv);
    const ts = last ? last.ts : Date.now();
    if ((this.readMarks.get(conv) || 0) >= ts) return;
    this.readMarks.set(conv, ts);
    await kvSet('readMarks', [...this.readMarks]);
    this.emit({ type: 'read-marks', conv });
  }

  async buildEnvelope({ to, kind, body, purpose, plainBody }) {
    const rec = this.directory[to];
    let key;
    if (to === '*') throw new Error('broadcast requires an explicit key');
    if (!rec) throw new Error('Unknown recipient');
    key = await pairKey(this.keys.ecdhPriv, rec.ecdhPub, this.me.userId, to, purpose);
    const { ct, iv } = await aesEncrypt(key, JSON.stringify(plainBody ?? body));
    const env = {
      id: randomId(12),
      from: this.me.userId,
      to,
      kind,
      ct,
      iv,
      ts: Date.now(),
    };
    env.sig = await signMessage(this.keys.signPriv, canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts'])));
    return env;
  }

  async sendDm(peerId, text, attachments = []) {
    const conv = 'dm:' + peerId;
    const env = await this.buildEnvelope({ to: peerId, kind: 'dm', purpose: 'dm', body: { text, attachments } });
    const msg = {
      id: env.id, conv, from: this.me.userId, to: peerId, ts: env.ts,
      kind: 'text', text, attachments, mine: true, pending: true,
    };
    await this.addMessage(msg);
    this.handled.add(env.id);
    const ok = await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
    if (ok) await this.markDelivered(env.id);
    return msg;
  }

  async markDelivered(id) {
    const msg = this.msgIndex.get(id);
    if (!msg) return;
    msg.pending = false;
    await putMessage(msg);
    this.emit({ type: 'message-updated', id });
  }

  async sendChannelMessage(channelId, text, attachments = []) {
    const key = await this.getChannelKey(channelId);
    if (!key) throw new Error('You do not have the key for this channel yet.');
    const { ct, iv } = await aesEncrypt(key, JSON.stringify({ text, attachments }));
    const env = {
      id: randomId(12), from: this.me.userId, to: '*', kind: 'ch-' + channelId,
      ct, iv, ts: Date.now(),
    };
    env.sig = await signMessage(this.keys.signPriv, canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts'])));
    await this.addMessage({
      id: env.id, conv: 'ch:' + channelId, channelId, from: this.me.userId, to: '*',
      ts: env.ts, kind: 'text', text, attachments, mine: true, pending: true,
    });
    this.handled.add(env.id);
    const ok = await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
    if (ok) await this.markDelivered(env.id);
  }

  async sendStreamMessage(streamId, text, attachments = []) {
    const key = await this.getStreamChatKey(streamId);
    if (!key) throw new Error('You do not have the stream chat key yet.');
    const { ct, iv } = await aesEncrypt(key, JSON.stringify({ text }));
    const env = {
      id: randomId(12), from: this.me.userId, to: '*', kind: 'sc-' + streamId,
      ct, iv, ts: Date.now(),
    };
    env.sig = await signMessage(this.keys.signPriv, canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts'])));
    await this.addMessage({
      id: env.id, conv: 'sc:' + streamId, streamId, from: this.me.userId, to: '*',
      ts: env.ts, kind: 'text', text, attachments, mine: true,
    });
    this.handled.add(env.id);
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  async sendTyping(peerId, conv) {
    const env = await this.buildEnvelope({
      to: peerId, kind: 'typing', purpose: 'wrap', body: { conv },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  async sendReadReceipt(peerId, conv) {
    const last = this.lastMessage(conv);
    if (!last) return;
    const env = await this.buildEnvelope({
      to: peerId, kind: 'read', purpose: 'wrap', body: { conv, upTo: last.ts },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  /** Encrypt a file locally, then upload only ciphertext to the node. */
  async uploadAttachment(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { ct, key, iv } = await encryptBytes(bytes);
    const up = await this.net.uploadBlob(ct);
    return {
      mediaId: up.id, key, iv, name: file.name,
      type: file.type || 'application/octet-stream', size: file.size,
    };
  }

  async downloadAttachment(att) {
    const res = await fetch(`/media/${att.mediaId}`);
    if (!res.ok) throw new Error('Attachment missing on this node');
    const buf = new Uint8Array(await res.arrayBuffer());
    return decryptBytes(buf, att.key, att.iv);
  }

  // ---------- channels ----------
  channelList() {
    return Object.values(this.channels).sort((a, b) => a.name.localeCompare(b.name));
  }

  myChannels() {
    return this.channelList().filter(c => this.channelKeys.has(c.id));
  }

  async getChannelKey(channelId) {
    return this.channelKeys.get(channelId) || null;
  }

  async createChannel(name, topic, inviteIds = []) {
    const id = hexId('c', 5);
    const rawKey = await exportAesKey(await randomAesKey());
    const ts = Date.now();
    const item = {
      id, name, topic: topic || '', createdBy: this.me.userId, ts,
      members: [this.me.userId, ...inviteIds],
    };
    item.sig = await signMessage(this.keys.signPriv, canonical(pick(item, PUBLIC_SIGN_FIELDS.channels)));

    // key first, so an invitee can read the channel the moment it appears
    this.channelKeys.set(id, await importAesKey(rawKey));
    const stored = new Map(await kvGet('channelKeys', []));
    stored.set(id, rawKey);
    await kvSet('channelKeys', [...stored]);

    await this.net.publish('channels', [item]);
    this.channels[id] = item;
    this.emit({ type: 'state', table: 'channels' });

    for (const userId of inviteIds) await this.sendChannelKey(id, userId);
    return item;
  }

  async sendChannelKey(channelId, userId) {
    const raw = await kvGet('channelKeys', []);
    const rawKey = raw.find(([id]) => id === channelId)?.[1];
    if (!rawKey) throw new Error('You do not hold this channel key');
    const rec = this.directory[userId];
    if (!rec) throw new Error('Unknown member');
    // buildEnvelope already encrypts the body to this member's ECDH key.
    const env = await this.buildEnvelope({
      to: userId, kind: 'chkey', purpose: 'wrap',
      body: { channelId, key: rawKey },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
    const ch = this.channels[channelId];
    if (ch && !(ch.members || []).includes(userId)) {
      const updated = { ...ch, members: [...(ch.members || []), userId], ts: Date.now() };
      updated.sig = await signMessage(this.keys.signPriv, canonical(pick(updated, ['id', 'name', 'topic', 'createdBy', 'ts'])));
      await this.net.publish('channels', [updated]);
      this.channels[channelId] = updated;
    }
  }

  async requestChannelKey(channelId) {
    const ch = this.channels[channelId];
    if (!ch) throw new Error('Unknown channel');
    const env = await this.buildEnvelope({
      to: ch.createdBy, kind: 'chkey-req', purpose: 'wrap',
      body: { channelId, note: 'Please add me to this channel' },
    });
    // carry the channel id in a signature-covered field? kind cannot hold the id here,
    // so the request body is decrypted by the owner instead.
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
    this.emit({ type: 'key-requested', channelId });
  }

  async handleKeyRequestEnv(env) {
    const body = await this.decryptPairBody(env);
    return body;
  }

  // ---------- directory / profile ----------
  async publishProfile(name) {
    const ts = Date.now();
    const rec = {
      userId: this.me.userId,
      name,
      ecdhPub: this.me.ecdhPub,
      signPub: this.me.signPub,
      ts,
    };
    rec.sig = await signMessage(this.keys.signPriv, canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts'])));
    await this.net.transmit({ id: rec.userId, type: 'record', payload: rec });
    this.directory[rec.userId] = rec;
    this.me.name = name;
    const identity = await loadIdentity();
    identity.name = name;
    await saveIdentity(identity);
    this.emit({ type: 'directory' });
    return rec;
  }

  async claimStudent() {
    const ts = Date.now();
    const a = { userId: this.me.userId, role: 'student', ts, by: 'self' };
    a.sig = await signMessage(this.keys.signPriv, canonical(pick(a, ['userId', 'role', 'ts', 'by'])));
    await this.net.transmit({ id: a.userId, type: 'role', payload: a });
    this.roles[a.userId] = a;
    await this.recomputeRoles();
  }

  async becomeGenesisAdmin() {
    const ts = Date.now();
    const a = { userId: this.me.userId, role: 'admin', ts, by: 'genesis' };
    a.sig = await signMessage(this.keys.signPriv, canonical(pick(a, ['userId', 'role', 'ts', 'by'])));
    const res = await this.net.putRole(a);
    if (res && res.ok === false && res.results && res.results[0] && !res.results[0].ok) {
      throw new Error(res.results[0].err || 'Node rejected the first-admin claim');
    }
    this.roles[a.userId] = a;
    await this.recomputeRoles();
  }

  async requestRole(wantRole) {
    const ts = Date.now();
    const r = { id: randomId(9), userId: this.me.userId, wantRole, ts };
    r.sig = await signMessage(this.keys.signPriv, canonical(pick(r, ['id', 'userId', 'wantRole', 'ts'])));
    await this.net.transmit({ id: r.id, type: 'request', payload: r });
    this.requests[r.id] = r;
    this.emit({ type: 'state', table: 'requests' });
    return r;
  }

  /** All role requests as an array (for the admin UI). */
  get roleRequests() {
    return Object.values(this.requests).filter(r => r.kind === 'role');
  }

  pendingRequests() {
    return Object.values(this.requests)
      .filter(r => this.roleOf(r.userId) === 'student')
      .sort((a, b) => b.ts - a.ts);
  }

  activeProposals() {
    return Object.values(this.proposals)
      .filter(p => !p.executed)
      .sort((a, b) => b.ts - a.ts);
  }

  async proposeSetRole(userId, role) {
    const ts = Date.now();
    const p = {
      id: randomId(9), kind: 'set-role',
      payload: { userId, role }, proposer: this.me.userId, ts,
    };
    p.sig = await signMessage(this.keys.signPriv, canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts'])));
    await this.net.transmit({ id: p.id, type: 'proposal', payload: p });
    this.proposals[p.id] = p;
    this.emit({ type: 'state', table: 'proposals' });
    return p;
  }

  async proposeAnnouncement(title, body, pinned = false) {
    const ts = Date.now();
    const p = {
      id: randomId(9), kind: 'announce',
      payload: { title, body, pinned }, proposer: this.me.userId, ts,
    };
    p.sig = await signMessage(this.keys.signPriv, canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts'])));
    await this.net.transmit({ id: p.id, type: 'proposal', payload: p });
    this.proposals[p.id] = p;
    this.emit({ type: 'state', table: 'proposals' });
    return p;
  }

  async approveProposal(proposal) {
    if (proposal.vetoed || (proposal.vetoes || []).length) throw new Error('This proposal was vetoed and cannot be approved.');
    if (proposal.executed) return proposal;
    const effect = proposalEffectMsg(proposal);
    const sig = await signMessage(this.keys.signPriv, effect);
    const approvals = [...(proposal.approvals || []).filter(a => a.admin !== this.me.userId),
      { admin: this.me.userId, sig }];
    const updated = { ...proposal, approvals };
    await this.net.transmit({ id: proposal.id, type: 'proposal', payload: updated });
    this.proposals[proposal.id] = updated;
    this.emit({ type: 'state', table: 'proposals' });
    return updated;
  }

  async createAnnouncementNow(title, body, pinned) {
    if (this.admins.length === 0) throw new Error('No admins exist yet');
    if (this.admins.length === 1) {
      // A single admin is the whole electorate: sign the proposal yourself.
      const p = await this.proposeAnnouncement(title, body, pinned);
      await this.approveProposal(p);
      return;
    }
    return this.proposeAnnouncement(title, body, pinned);
  }

  /**
   * Announcements flattened for the views: the signed payload is unwrapped so
   * a card can read `ann.title` / `ann.body` / `ann.pinned` directly.
   */
  announcementList() {
    return Object.values(this.announcements)
      .map(a => ({
        id: a.id,
        title: a.payload?.title || '',
        body: a.payload?.body || '',
        pinned: !!a.payload?.pinned,
        by: a.by,
        byName: this.nameOf(a.by),
        ts: a.ts,
        approvals: a.approvals || [],
        raw: a,
      }))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
  }

  // ---------- streams ----------
  /** Every stream the node knows about, newest first. */
  allStreams() {
    return Object.values(this.streams).sort((a, b) => b.ts - a.ts);
  }

  /** Streams that are actually running right now. */
  liveStreams() {
    return this.allStreams().filter(s => s.live && !s.ended);
  }

  /** The stream this user is currently broadcasting, if any. */
  myLiveStream() {
    return this.allStreams().find(s => s.by === this.me?.userId && s.live && !s.ended) || null;
  }

  async createStream({ title, visibility, channelId }) {
    const id = hexId('s', 5);
    const chatKey = await exportAesKey(await randomAesKey());
    const ts = Date.now();
    const item = {
      id, by: this.me.userId, title, visibility,
      channelId: channelId || '', live: true, ended: false, ts,
    };
    if (visibility === 'class' && channelId) {
      const chKey = await this.getChannelKey(channelId);
      if (!chKey) throw new Error('You need this channel key to stream to the class');
      item.wrappedChatKey = await aesEncrypt(chKey, chatKey);
    } else {
      // A public stream's chat key is published on purpose: the chat of a
      // public broadcast is public, exactly like a Twitch chat. It is still
      // signed, so the node cannot swap it for a key of its own.
      item.chatKey = chatKey;
    }
    item.sig = await signMessage(this.keys.signPriv, canonical(pick(item, PUBLIC_SIGN_FIELDS.streams)));
    await this.net.transmit({ id: id, type: 'publish', table: 'streams', payload: item });
    this.streams[id] = item;
    this.streamKeyCache.set(id, await importAesKey(chatKey));
    this.emit({ type: 'state', table: 'streams' });
    return { item, chatKey };
  }

  /** Keepalive: the node prunes streams that stop being refreshed. */
  async refreshStream(stream) {
    const updated = { ...stream, ts: Date.now() };
    updated.sig = await signMessage(this.keys.signPriv, canonical(pick(updated, PUBLIC_SIGN_FIELDS.streams)));
    await this.net.transmit({ id: updated.id, type: 'publish', table: 'streams', payload: updated });
    this.streams[updated.id] = updated;
  }

  async endStream(streamId) {
    const stream = this.streams[streamId];
    if (!stream) return;
    const updated = { ...stream, live: false, ended: true, ts: Date.now() };
    updated.sig = await signMessage(this.keys.signPriv, canonical(pick(updated, PUBLIC_SIGN_FIELDS.streams)));
    await this.net.transmit({ id: updated.id, type: 'publish', table: 'streams', payload: updated });
    this.streams[updated.id] = updated;
    this.streamKeyCache.delete(streamId);
    this.emit({ type: 'state', table: 'streams' });
  }

  /**
   * Resolve the AES key that protects a stream's chat. Class streams keep it
   * wrapped with the channel key; public streams publish it openly.
   */
  async streamChatKey(stream) {
    if (!stream) return null;
    return this.getStreamChatKey(stream.id);
  }

  async sendSdp(to, kind, streamId, sdp, extra = {}) {
    const env = await this.buildEnvelope({
      to, kind, purpose: 'rtc', body: { streamId, sdp, ...extra },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  async sendIce(to, streamId, candidate) {
    const env = await this.buildEnvelope({
      to, kind: 'rtc-ice', purpose: 'rtc', body: { streamId, candidate },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  /** Announce that we want to watch a stream (the broadcaster then offers). */
  async requestStream(streamId, broadcasterId) {
    const env = await this.buildEnvelope({
      to: broadcasterId, kind: 'rtc-watch', purpose: 'rtc', body: { streamId },
    });
    await this.net.transmit({ id: env.id, type: 'envelope', payload: env });
  }

  // ---------- shorts ----------
  shortList() {
    return Object.values(this.shorts).sort((a, b) => b.ts - a.ts);
  }

  async addShortFile(file, title) {
    const att = await this.uploadAttachment(file);
    return this.addShort({
      kind: 'upload', mediaId: att.mediaId, key: att.key, iv: att.iv,
      mime: att.type, title,
    });
  }

  async addShortLink(url, title) {
    return this.addShort({ kind: 'link', url, title });
  }

  async addShort(fields) {
    const id = hexId('p', 5);
    const ts = Date.now();
    const item = { id, by: this.me.userId, kind: fields.kind, mediaId: fields.mediaId || '', url: fields.url || '', title: fields.title || '', ts };
    // The media key has to be part of the signed payload, otherwise the node
    // could swap it and decrypt the encrypted upload it protects.
    if (fields.kind === 'upload') item.meta = { key: fields.key, iv: fields.iv, mime: fields.mime };
    item.sig = await signMessage(this.keys.signPriv, canonical(pick(item, PUBLIC_SIGN_FIELDS.shorts)));
    await this.net.transmit({ id, type: 'publish', table: 'shorts', payload: item });
    this.shorts[id] = item;
    this.emit({ type: 'state', table: 'shorts' });
    return item;
  }

  // ---------- documents (report cards, notes) ----------
  async issueDoc({ kind, to, body }) {
    if (!this.directory[to]) throw new Error('Unknown recipient');
    const make = async recipient => {
      const key = await pairKey(this.keys.ecdhPriv, this.directory[recipient].ecdhPub,
        this.me.userId, recipient, 'doc');
      const { ct, iv } = await aesEncrypt(key, JSON.stringify(body));
      const doc = { id: randomId(12), by: this.me.userId, kind, to: recipient, ct, iv, ts: Date.now() };
      doc.sig = await signMessage(this.keys.signPriv, canonical(pick(doc, ['id', 'by', 'kind', 'to', 'ct', 'iv', 'ts'])));
      await this.net.transmit({ id: doc.id, type: 'doc', payload: doc });
      return doc;
    };
    const out = await make(to);
    // keep a durable copy for the author, readable only by the author
    if (to !== this.me.userId) await make(this.me.userId);
    await this.handleDoc(out);
    return out;
  }

  async handleDoc(doc) {
    if (!doc || !doc.id) return;
    if (this.docsLocal.has(doc.id)) return;
    if (!(await verifyDoc(doc, this.directory))) {
      (this.pendingDocs = this.pendingDocs || []).push(doc);
      return;
    }
    if (doc.to !== this.me.userId) return; // someone else's document
    const other = doc.by;
    const rec = this.directory[other];
    if (!rec) return;
    try {
      const key = await pairKey(this.keys.ecdhPriv, rec.ecdhPub, doc.by, doc.to, 'doc');
      const body = JSON.parse(await aesDecrypt(key, doc.ct, doc.iv));
      const local = { id: doc.id, kind: doc.kind, by: doc.by, to: doc.to, ts: doc.ts, body };
      this.docsLocal.set(doc.id, local);
      await putDoc(local);
      this.emit({ type: 'doc', doc: local });
    } catch (err) {
      console.warn('document not decryptable', err.message);
    }
  }

  /** Documents (notes, report cards) flattened for the views. */
  docsOf(kind) {
    return [...this.docsLocal.values()]
      .filter(d => !kind || d.kind === kind)
      .map(d => ({
        id: d.id,
        kind: d.kind,
        by: d.by,
        byName: this.nameOf(d.by),
        to: d.to,
        toName: this.nameOf(d.to),
        ts: d.ts,
        title: d.body?.title || '',
        body: d.body?.body || '',
        rows: Array.isArray(d.body?.rows) ? d.body.rows : [],
        raw: d.body || {},
      }))
      .sort((a, b) => b.ts - a.ts);
  }

  // ---------- notifications ----------
  notify(fromUserId, text) {
    this.emit({ type: 'notify', from: fromUserId, text });
  }

  // ---------- misc ----------
  onlineCount() {
    return Object.keys(this.directory).length;
  }

  attachmentsForMe() {
    const out = [];
    for (const [conv, arr] of this.msgsByConv) {
      for (const m of arr) {
        for (const att of m.attachments || []) {
          out.push({ ...att, conv, msg: m });
        }
      }
    }
    return out.sort((a, b) => b.msg.ts - a.msg.ts);
  }

  directoryList() {
    return Object.values(this.directory)
      .filter(u => u.userId !== this.me.userId)
      .map(u => ({ ...u, role: this.roleOf(u.userId) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Everyone the mesh knows about, including this user. */
  membersList() {
    return Object.values(this.directory)
      .map(u => ({ ...u, role: this.roleOf(u.userId), mine: u.userId === this.me.userId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every role request, with its resolved status. */
  allRequests() {
    return Object.values(this.requests)
      .map(r => ({
        id: r.id,
        userId: r.userId,
        name: this.nameOf(r.userId),
        wantRole: r.wantRole,
        currentRole: this.roleOf(r.userId),
        ts: r.ts,
        decided: this.roleOf(r.userId) !== 'student',
      }))
      .sort((a, b) => b.ts - a.ts);
  }

  /** Every proposal, open, applied or vetoed. */
  allProposals() {
    return Object.values(this.proposals)
      .map(p => ({
        id: p.id,
        kind: p.kind,
        payload: p.payload || {},
        proposer: p.proposer,
        proposerName: this.nameOf(p.proposer),
        ts: p.ts,
        approvals: p.approvals || [],
        vetoes: p.vetoes || [],
        executed: !!p.executed,
        vetoed: !!p.vetoed,
        status: p.vetoed ? 'vetoed' : p.executed ? 'approved' : 'pending',
        ...this.proposalProgress(p),
      }))
      .sort((a, b) => b.ts - a.ts);
  }

  /**
   * Veto a proposal. One admin is enough to kill it: the decision cannot be
   * pushed through by the majority while someone responsible is against it.
   */
  async vetoProposal(proposal) {
    const msg = canonical({ id: proposal.id, ts: proposal.ts, action: 'veto' });
    const sig = await signMessage(this.keys.signPriv, msg);
    const vetoes = [...(proposal.vetoes || []).filter(v => v.admin !== this.me.userId),
      { admin: this.me.userId, sig }];
    const updated = { ...proposal, vetoes };
    await this.net.transmit({ id: proposal.id, type: 'proposal', payload: updated });
    this.proposals[proposal.id] = updated;
    this.emit({ type: 'state', table: 'proposals' });
    return updated;
  }

  /**
   * Numbers behind the dashboards: what this user is part of, what is waiting
   * for them, and how healthy the mesh is.
   */
  dashboardStats() {
    const me = this.me?.userId;
    const members = this.membersList();
    const byRole = r => members.filter(m => m.role === r).length;
    const docs = this.docsOf();
    const proposals = this.allProposals();
    return {
      role: this.role(),
      people: members.length,
      students: byRole('student'),
      teachers: byRole('teacher'),
      staff: byRole('staff'),
      admins: this.admins.length,
      channels: this.channelList().length,
      myChannels: this.myChannels().length,
      streamsLive: this.liveStreams().length,
      shorts: this.shortList().length,
      announcements: this.announcementList().length,
      notes: docs.filter(d => d.kind === 'note').length,
      reports: docs.filter(d => d.kind === 'report').length,
      myNotes: docs.filter(d => d.kind === 'note' && d.to === me).length,
      myReports: docs.filter(d => d.kind === 'report' && d.to === me).length,
      unread: this.totalUnread(),
      openProposals: proposals.filter(p => p.status === 'pending').length,
      pendingRequests: this.allRequests().filter(r => !r.decided).length,
      lastSync: this.lastSync || 0,
    };
  }

  proposalProgress(p) {
    return { have: approvalsCount(p), need: threshold(this.admins.length) };
  }  // ---------- aliases for view compatibility ----------

  /** Event subscription alias — views call state.on(type, fn). */
  on(type, fn) {
    return this.subscribe(evt => { if (evt.type === type || type === '*') fn(evt); });
  }

  /** Sorted DM conversations for the chats sidebar. */
  sortedConvos() {
    const out = [];
    const seen = new Set();
    for (const [conv, msgs] of this.msgsByConv) {
      if (!conv.startsWith('dm:')) continue;
      const peerId = conv.slice(3);
      const last = msgs[msgs.length - 1];
      if (!last) continue;
      seen.add(peerId);
      out.push({
        userId: peerId,
        name: this.nameOf(peerId),
        lastText: last.text || (last.attachments?.length ? 'Attachment' : ''),
        ts: last.ts,
        unread: this.unread(conv),
      });
    }
    // Also include directory contacts who have no messages yet
    for (const u of this.directoryList()) {
      if (!seen.has(u.userId)) {
        out.push({ userId: u.userId, name: u.name, lastText: '', ts: 0, unread: 0 });
      }
    }
    return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  /** Alias for messages() — views call state.msgList(conv). */
  msgList(conv) { return this.messages(conv); }

  /** Upload a short video (encrypted). */
  async uploadShort(file, title) { return this.addShortFile(file, title); }

  /** Create a short from a link. */
  async createShortFromLink(url, title) { return this.addShortLink(url, title); }

  /** Send stream chat message. */
  async sendStreamChat(streamId, text, files = []) {
    const attachments = [];
    for (const f of files) attachments.push(await this.uploadAttachment(f));
    return this.sendStreamMessage(streamId, text, attachments);
  }

  /** Connect to a stream via WebRTC — returns a MediaStream or null. */
  async connectStreamStream(streamId) {
    const stream = this.streams[streamId];
    if (!stream) return null;
    if (!this.rtc) return null;
    return this.rtc.watch(streamId, stream.by);
  }

  /** Leave a channel (drop the key locally). */
  async leaveChannel(channelId) {
    this.channelKeys.delete(channelId);
    const stored = await kvGet('channelKeys', []);
    const map = new Map(stored);
    map.delete(channelId);
    await kvSet('channelKeys', [...map]);
    this.emit({ type: 'channel-key', channelId });
  }

  /** Members of a channel (people who have been invited). */
  channelMembers(channelId) {
    const ch = this.channels[channelId];
    if (!ch || !ch.members) return [];
    return ch.members.map(id => ({
      userId: id,
      name: this.nameOf(id),
      role: this.roleOf(id),
    }));
  }

  /** Download a decrypted document as a file. */
  async downloadDoc(docId) {
    const doc = this.docsLocal.get(docId);
    if (!doc) throw new Error('Document not found');
    const blob = new Blob([JSON.stringify(doc.body, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (doc.body?.title || doc.kind || 'document') + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  /** Export an encrypted backup of the identity. */
  async exportEncryptedBackup(pass) {
    const vault = await sealVault(pass, { signPriv: this.keys.signPriv, ecdhPriv: this.keys.ecdhPriv });
    const identity = await loadIdentity();
    const backup = {
      app: 'mezoteric', version: 1,
      userId: this.me.userId, name: this.me.name,
      signPub: this.me.signPub, ecdhPub: this.me.ecdhPub,
      vault, created: identity?.created || Date.now(),
    };
    return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  }

  /** Open a backup vault with a passphrase. */
  async openBackupVault(pass, vault) { return openVault(pass, vault); }

  /** Import a backup and replace the current identity. */
  async importBackup(data, keys, pass) {
    const identity = {
      userId: data.userId, name: data.name || 'Restored user',
      signPub: data.signPub, ecdhPub: data.ecdhPub,
      vault: data.vault || await sealVault(pass, keys),
      created: data.created || Date.now(), published: true,
    };
    await saveIdentity(identity);
  }

  /** Add a peer node. */
  async addPeer(addr, port, httpPort) {
    return this.net.request('/api/peers', { method: 'POST', body: { addr, port: httpPort || port } });
  }

  /** Get known peers from the node. */
  async getPeers() {
    try { return (await this.net.request('/api/peers')).peers || []; } catch { return []; }
  }

  /** Sign out — disconnect and clear session. */
  async signOut() {
    if (this.net) this.net.disconnect();
    this.me = null;
    this.keys = null;
  }

  /** Set display name (alias for publishProfile). */
  async setDisplayName(name) { return this.publishProfile(name); }
}