// Persistent node state + validation of all signed/encrypted items.
// Nothing readable is stored here except public metadata: message content
// only ever arrives as ciphertext envelopes (end-to-end encrypted).
import fs from 'node:fs';
import path from 'node:path';
import { canonical, randomId, sha256Hex, verifySig, pick } from './util.js';

const DATA_DIR = path.resolve(process.env.MZ_DATA || 'data');
const TABLES = [
  'directory', 'roles', 'proposals', 'announcements',
  'channels', 'shorts', 'streams', 'requests', 'envelopes', 'acks', 'docs'
];
const ENVELOPE_KIND = /^[a-z][a-z0-9-]{0,31}$/;
const DOC_KIND = /^(report|note|notice|certificate)$/;
const ROLE_KIND = /^(student|teacher|staff|admin|suspended)$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class Store {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'media'), { recursive: true });
    this.dir = DATA_DIR;
    this.state = this._load();
    this._saveTimer = null;
    this.listeners = new Set();
    this._prune();
    setInterval(() => this._prune(), 60_000).unref();
  }

  _load() {
    const state = { node: null };
    for (const t of TABLES) state[t] = {};
    try { state.node = JSON.parse(fs.readFileSync(path.join(this.dir, 'node.json'), 'utf8')); } catch {}
    for (const t of TABLES) {
      try { state[t] = JSON.parse(fs.readFileSync(path.join(this.dir, t + '.json'), 'utf8')) || {}; } catch {}
    }
    if (!state.node) {
      state.node = { id: randomId(9), created: Date.now(), name: process.env.MZ_NODE_NAME || 'school-node' };
      try { fs.writeFileSync(path.join(this.dir, 'node.json'), JSON.stringify(state.node)); } catch {}
    }
    return state;
  }

  onChange(fn) { this.listeners.add(fn); }
  _emit(table, items) { for (const fn of this.listeners) { try { fn(table, items); } catch (e) { console.error('listener error', e.message); } } }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this._persistNow(); }, 400);
  }

  _persistNow() {
    try {
      fs.writeFileSync(path.join(this.dir, 'node.json'), JSON.stringify(this.state.node));
      for (const t of TABLES) fs.writeFileSync(path.join(this.dir, t + '.json'), JSON.stringify(this.state[t]));
    } catch (err) { console.error('persist failed:', err.message); }
  }

  flush() { if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; } this._persistNow(); }

  // ---------- roles / admins (threshold, decentralized) ----------
  async validAssertion(a, seen = new Set()) {
    if (!a || !USER_ID.test(a.userId || '') || !ROLE_KIND.test(a.role || '')) return false;
    if (seen.has(a.userId)) return false;
    seen.add(a.userId);
    if (a.by === 'genesis' || a.by === 'self') {
      // Self-signed: a user may always claim plain student, nothing else.
      if (a.by === 'self' && a.role !== 'student') return false;
      const rec = this.state.directory[a.userId];
      if (!rec) return false;
      const msg = canonical(pick(a, ['userId', 'role', 'ts', 'by']));
      if (!(await verifySig(rec.signPub, msg, a.sig))) return false;
      if (a.by === 'genesis') {
        const earlier = Object.values(this.state.roles)
          .some(r => r.role === 'admin' && r.by === 'genesis' && r.ts < a.ts);
        if (earlier) return false;
        const others = await this.adminsExcluding(a.userId, seen);
        if (others.length > 0) return false;
      }
      return true;
    }
    const admins = await this.adminsExcluding(a.userId, seen);
    if (admins.length === 0) return false;
    const need = Math.floor(admins.length / 2) + 1;
    const msg = canonical(pick(a, ['userId', 'role', 'ts']));
    let ok = 0;
    const got = new Set();
    for (const ap of a.approvals || []) {
      if (got.has(ap.admin) || !admins.includes(ap.admin)) continue;
      const arec = this.state.directory[ap.admin];
      if (!arec) continue;
      if (await verifySig(arec.signPub, msg, ap.sig)) { ok++; got.add(ap.admin); }
    }
    return ok >= need;
  }

  async adminsExcluding(exclude, seen = new Set()) {
    const out = [];
    for (const [userId, a] of Object.entries(this.state.roles)) {
      if (userId === exclude || seen.has(userId)) continue;
      if (a.role === 'admin' && await this.validAssertion(a, seen)) out.push(userId);
    }
    return out;
  }

  async admins() { return this.adminsExcluding(null, new Set()); }

  async roleOf(userId) {
    const a = this.state.roles[userId];
    if (!a) return 'guest';
    return await this.validAssertion(a) ? a.role : 'guest';
  }

  async adminCount() { return (await this.admins()).length; }

  // ---------- ingest ----------
  async ingestRecord(rec) {
    if (!rec || !USER_ID.test(rec.userId || '') || !rec.name || !rec.ecdhPub || !rec.signPub || !rec.ts) return fail('bad record');
    const msg = canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts']));
    if (!(await verifySig(rec.signPub, msg, rec.sig))) return fail('bad record signature');
    const prev = this.state.directory[rec.userId];
    if (prev && prev.ts > rec.ts) return fail('stale record');
    const changed = !prev || canonical(prev) !== canonical(rec);
    this.state.directory[rec.userId] = rec;
    if (changed) { this._scheduleSave(); this._emit('directory', [rec]); }
    return { ok: true, changed };
  }

  async ingestRole(a) {
    if (!a || !USER_ID.test(a.userId || '') || !ROLE_KIND.test(a.role || '')) return fail('bad role');
    const prevBefore = this.state.roles[a.userId];
    if (a.by === 'self' && prevBefore && prevBefore.by !== 'self') return fail('admin decision stands');
    if (a.by !== 'genesis' && a.by !== 'self' && !Array.isArray(a.approvals)) return fail('missing approvals');
    if (!(await this.validAssertion(a))) return fail('threshold not met or bad signatures');
    const prev = this.state.roles[a.userId];
    if (prev && prev.ts > a.ts) return fail('stale role');
    const changed = !prev || canonical(prev) !== canonical(a);
    this.state.roles[a.userId] = a;
    if (changed) { this._scheduleSave(); this._emit('roles', [a]); }
    return { ok: true, changed };
  }

  async ingestRequest(r) {
    if (!r || !r.userId || !r.wantRole || !ROLE_KIND.test(r.wantRole) || r.wantRole === 'student') return fail('bad request');
    const rec = this.state.directory[r.userId];
    if (!rec) return fail('unknown user');
    const msg = canonical(pick(r, ['id', 'userId', 'wantRole', 'ts']));
    if (!(await verifySig(rec.signPub, msg, r.sig))) return fail('bad request signature');
    const changed = !this.state.requests[r.id];
    this.state.requests[r.id] = r;
    if (changed) { this._scheduleSave(); this._emit('requests', [r]); }
    return { ok: true, changed };
  }

  async ingestProposal(p) {
    if (!p || !p.id || !['set-role', 'announce'].includes(p.kind)) return fail('bad proposal');
    const proposer = this.state.directory[p.proposer];
    if (!proposer || await this.roleOf(p.proposer) !== 'admin') return fail('proposer not admin');
    const msg = canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts']));
    if (!(await verifySig(proposer.signPub, msg, p.sig))) return fail('bad proposal signature');
    const pl = p.payload || {};
    if (p.kind === 'set-role' && (!pl.userId || !ROLE_KIND.test(pl.role || ''))) return fail('bad payload');
    if (p.kind === 'announce' && (!pl.title || !pl.body)) return fail('bad payload');

    const prev = this.state.proposals[p.id];
    const approvals = [...((prev && prev.approvals) || [])];
    for (const ap of p.approvals || []) {
      if (approvals.some(x => x.admin === ap.admin)) continue;
      if (await this.roleOf(ap.admin) !== 'admin') continue;
      const arec = this.state.directory[ap.admin];
      if (!arec) continue;
      if (await verifySig(arec.signPub, effectMsg(p), ap.sig)) approvals.push(ap);
    }
    const vetoes = [...((prev && prev.vetoes) || [])];
    for (const vt of p.vetoes || []) {
      if (vetoes.some(x => x.admin === vt.admin)) continue;
      if (await this.roleOf(vt.admin) !== 'admin') continue;
      const vrec = this.state.directory[vt.admin];
      if (!vrec) continue;
      if (await verifySig(vrec.signPub, vetoMsg(p), vt.sig)) vetoes.push(vt);
    }
    const merged = { ...(prev || {}), ...p, approvals, vetoes };
    if (vetoes.length > 0) merged.vetoed = true;
    const changed = !prev || canonical(prev) !== canonical(merged);
    this.state.proposals[p.id] = merged;
    if (changed) { this._scheduleSave(); this._emit('proposals', [merged]); }

    if (vetoes.length > 0) {
      // A single admin veto kills the proposal: it is never applied.
      return { ok: true, changed };
    }

    if (!merged.executed) {
      const admins = await this.admins();
      const need = admins.length === 0 ? 1 : Math.floor(admins.length / 2) + 1;
      const valid = approvals.filter(ap => admins.includes(ap.admin));
      if (valid.length >= need) {
        merged.executed = true;
        if (p.kind === 'set-role') {
          await this.ingestRole({ userId: pl.userId, role: pl.role, ts: p.ts, approvals: valid, proposal: p.id });
        } else {
          const ann = { id: p.id, kind: 'announce', payload: { title: pl.title, body: pl.body }, ts: p.ts, approvals: valid, by: p.proposer };
          this.state.announcements[ann.id] = ann;
          this._emit('announcements', [ann]);
        }
        this._scheduleSave();
        this._emit('proposals', [merged]);
      }
    }
    return { ok: true, changed };
  }

  async ingestEnvelope(env) {
    if (!env || !env.id || !USER_ID.test(env.from || '') || !env.to || !env.ts) return fail('bad envelope');
    if (env.to !== '*' && !USER_ID.test(env.to)) return fail('bad recipient');
    if (!ENVELOPE_KIND.test(env.kind || '')) return fail('bad kind');
    const rec = this.state.directory[env.from];
    if (!rec) return fail('unknown sender');
    const msg = canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts']));
    if (!(await verifySig(rec.signPub, msg, env.sig))) return fail('bad envelope signature');
    if (this.state.acks[env.id] || this.state.envelopes[env.id]) return { ok: true, changed: false };
    this.state.envelopes[env.id] = env;
    this._scheduleSave();
    this._emit('envelopes', [env]);
    return { ok: true, changed: true };
  }

  // Durable end-to-end encrypted documents (report cards, notes, notices).
  // The node only ever holds ciphertext; recipients decrypt with their key.
  async ingestDoc(doc) {
    if (!doc || !doc.id || !USER_ID.test(doc.by || '') || !doc.to || !doc.ts) return fail('bad doc');
    if (doc.to !== '*' && !USER_ID.test(doc.to)) return fail('bad doc recipient');
    if (!DOC_KIND.test(doc.kind || '')) return fail('bad doc kind');
    const rec = this.state.directory[doc.by];
    if (!rec) return fail('unknown author');
    const msg = canonical(pick(doc, ['id', 'by', 'kind', 'to', 'ct', 'iv', 'ts']));
    if (!(await verifySig(rec.signPub, msg, doc.sig))) return fail('bad doc signature');
    const prev = this.state.docs[doc.id];
    if (prev && prev.ts > doc.ts) return fail('stale doc');
    const changed = !prev || canonical(prev) !== canonical(doc);
    this.state.docs[doc.id] = doc;
    if (changed) { this._scheduleSave(); this._emit('docs', [doc]); }
    return { ok: true, changed };
  }

  ack(ids) {
    const got = [];
    for (const id of ids || []) {
      if (typeof id !== 'string') continue;
      if (this.state.envelopes[id]) { delete this.state.envelopes[id]; got.push(id); }
      this.state.acks[id] = Date.now();
    }
    if (got.length) { this._scheduleSave(); this._emit('acks', got.map(id => ({ id, ts: this.state.acks[id] }))); }
    return got;
  }

  async ingestAck(items) {
    const got = [];
    for (const it of items || []) {
      if (!it || typeof it.id !== 'string') continue;
      if (this.state.envelopes[it.id]) { delete this.state.envelopes[it.id]; got.push(it.id); }
      this.state.acks[it.id] = it.ts || Date.now();
    }
    if (got.length) this._scheduleSave();
    return got;
  }

  async ingestPublic(table, item) {
    if (!item || !item.id || !USER_ID.test(item.by || '') || !item.ts || !item.sig) return fail('bad item');
    const rec = this.state.directory[item.by];
    if (!rec) return fail('unknown publisher');
    const fields = PUBLIC_FIELDS[table];
    if (!fields) return fail('bad table');
    const msg = canonical(pick(item, fields));
    if (!(await verifySig(rec.signPub, msg, item.sig))) return fail('bad item signature');
    const prev = this.state[table][item.id];
    if (prev && prev.ts > item.ts) return fail('stale item');
    const changed = !prev || canonical(prev) !== canonical(item);
    this.state[table][item.id] = item;
    if (changed) { this._scheduleSave(); this._emit(table, [item]); }
    return { ok: true, changed };
  }

  mediaSave(buffer) {
    const id = sha256Hex(buffer);
    const p = this.mediaPath(id);
    if (!fs.existsSync(p)) fs.writeFileSync(p, buffer);
    return id;
  }
  mediaPath(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('bad media id');
    return path.join(this.dir, 'media', id);
  }

  _prune() {
    const now = Date.now();
    let dirty = false;
    for (const [id, env] of Object.entries(this.state.envelopes)) {
      const ttl = env.kind === 'typing' ? 20_000 : 14 * 86400_000;
      if (now - env.ts > ttl || this.state.acks[id]) { delete this.state.envelopes[id]; dirty = true; }
    }
    for (const [id, ts] of Object.entries(this.state.acks)) {
      if (now - ts > 14 * 86400_000) { delete this.state.acks[id]; dirty = true; }
    }
    for (const [id, s] of Object.entries(this.state.streams)) {
      if (now - s.ts > 90_000) { delete this.state.streams[id]; dirty = true; this._emit('streams', [{ id, gone: true }]); }
    }
    if (dirty) this._scheduleSave();
  }

  snapshot() {
    const { node, ...rest } = this.state;
    return { node: { id: node.id, name: node.name }, ...rest };
  }
}

// Every field that carries security meaning must be inside the signed set,
// otherwise the node could swap an encryption key and read the content it
// protects. `meta` holds the AES key for an encrypted short, and the stream
// chat keys are what let anyone read a stream's chat.
const PUBLIC_FIELDS = {
  channels: ['id', 'name', 'topic', 'createdBy', 'members', 'ts'],
  shorts: ['id', 'by', 'kind', 'mediaId', 'url', 'title', 'meta', 'ts'],
  streams: ['id', 'by', 'title', 'visibility', 'channelId', 'chatKey', 'wrappedChatKey', 'live', 'ended', 'ts'],
};

// Message that admin co-signatures bind to, per proposal kind.
export function effectMsg(p) {
  if (p.kind === 'set-role') return canonical({ userId: p.payload.userId, role: p.payload.role, ts: p.ts });
  if (p.kind === 'announce') return canonical(pick(p, ['id', 'payload', 'ts']));
  return '';
}

// Message an admin's veto binds to. Deliberately different from effectMsg so
// an approval signature can never be replayed as a veto (or the other way round).
export function vetoMsg(p) {
  return canonical({ id: p.id, ts: p.ts, action: 'veto' });
}

function fail(err) { return { ok: false, err }; }
