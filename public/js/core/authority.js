// Client-side authority checks. The node is not trusted: every role assertion,
// announcement, message, document and public item is re-verified here against
// the signed directory, and admin powers require a majority of the elected
// admins (the same rule the node applies). This is what makes the admin panel
// genuinely decentralized rather than "the server says so".
import { canonical, pick, verifySignature } from './crypto.js';

const ROLE_KIND = new Set(['student', 'teacher', 'staff', 'admin', 'suspended']);
const verified = new Map(); // memo: sig -> boolean (signatures are immutable)

/**
 * Fields covered by the signature of each public item. Must stay identical to
 * server/store.js PUBLIC_FIELDS — a drift here would let a node tamper with
 * content the browser believes is signed.
 */
export const PUBLIC_SIGN_FIELDS = {
  channels: ['id', 'name', 'topic', 'createdBy', 'members', 'ts'],
  shorts: ['id', 'by', 'kind', 'mediaId', 'url', 'title', 'meta', 'ts'],
  streams: ['id', 'by', 'title', 'visibility', 'channelId', 'chatKey', 'wrappedChatKey', 'live', 'ended', 'ts'],
};

function memo(key, value) {
  if (verified.size > 5000) verified.clear();
  verified.set(key, value);
  return value;
}

async function verifyCached(pub, msg, sig) {
  const key = sig + '|' + msg.length;
  if (verified.has(key)) return verified.get(key);
  return memo(key, await verifySignature(pub, msg, sig));
}

export function isRoleName(role) {
  return ROLE_KIND.has(role);
}

export async function verifyRecord(rec) {
  if (!rec || !rec.userId || !rec.signPub || !rec.ecdhPub) return false;
  const msg = canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts']));
  return verifyCached(rec.signPub, msg, rec.sig);
}

export async function verifyEnvelope(env, directory) {
  if (!env || !env.id || !env.from || !env.to || !env.kind) return false;
  const rec = directory[env.from];
  if (!rec) return false;
  const msg = canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts']));
  return verifyCached(rec.signPub, msg, env.sig);
}

export async function verifyDoc(doc, directory) {
  if (!doc || !doc.id || !doc.by || !doc.to) return false;
  const rec = directory[doc.by];
  if (!rec) return false;
  const msg = canonical(pick(doc, ['id', 'by', 'kind', 'to', 'ct', 'iv', 'ts']));
  return verifyCached(rec.signPub, msg, doc.sig);
}

export async function verifyPublicItem(table, item, directory) {
  const rec = directory[item && item.by];
  const creator = directory[item && item.createdBy];
  // Must stay byte-identical to server/store.js PUBLIC_FIELDS, otherwise the
  // signature check would pass on the node but fail (or worse, be skipped)
  // in the browser.
  const fields = PUBLIC_SIGN_FIELDS[table];
  if (!fields || !item) return false;
  const signer = table === 'channels' ? creator : rec;
  if (!signer) return false;
  const msg = canonical(pick(item, fields));
  return verifyCached(signer.signPub, msg, item.sig);
}

export async function verifyRequest(r, directory) {
  const rec = directory[r && r.userId];
  if (!rec) return false;
  const msg = canonical(pick(r, ['id', 'userId', 'wantRole', 'ts']));
  return verifyCached(rec.signPub, msg, r.sig);
}

export async function verifyProposal(p, directory) {
  const proposer = directory[p && p.proposer];
  if (!proposer) return false;
  const msg = canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts']));
  return verifyCached(proposer.signPub, msg, p.sig);
}

// ---------- roles ----------

export async function validAssertion(a, roles, directory, seen = new Set(), depth = 0) {
  if (depth > 6) return false;
  if (!a || !a.userId || !isRoleName(a.role)) return false;
  if (seen.has(a.userId)) return false;
  seen.add(a.userId);
  const rec = directory[a.userId];
  if (!rec) return false;

  if (a.by === 'genesis' || a.by === 'self') {
    if (a.by === 'self' && a.role !== 'student') return false;
    const msg = canonical(pick(a, ['userId', 'role', 'ts', 'by']));
    if (!(await verifyCached(rec.signPub, msg, a.sig))) return false;
    if (a.by === 'genesis') {
      const earlier = Object.values(roles).some(
        r => r.role === 'admin' && r.by === 'genesis' && r.ts < a.ts
      );
      if (earlier) return false;
      const others = await adminsExcluding(a.userId, roles, directory, seen, depth + 1);
      if (others.length > 0) return false;
    }
    return true;
  }

  const admins = await adminsExcluding(a.userId, roles, directory, seen, depth + 1);
  if (admins.length === 0) return false;
  const need = Math.floor(admins.length / 2) + 1;
  const msg = canonical(pick(a, ['userId', 'role', 'ts']));
  let ok = 0;
  const got = new Set();
  for (const ap of a.approvals || []) {
    if (got.has(ap.admin) || !admins.includes(ap.admin)) continue;
    const arec = directory[ap.admin];
    if (!arec) continue;
    if (await verifyCached(arec.signPub, msg, ap.sig)) { ok++; got.add(ap.admin); }
  }
  return ok >= need;
}

export async function adminsExcluding(exclude, roles, directory, seen = new Set(), depth = 0) {
  const out = [];
  for (const [userId, a] of Object.entries(roles || {})) {
    if (userId === exclude || seen.has(userId)) continue;
    if (a.role !== 'admin') continue;
    if (depth < 6 && await validAssertion(a, roles, directory, new Set(seen), depth)) out.push(userId);
  }
  return out;
}

export async function adminsList(roles, directory) {
  return adminsExcluding(null, roles, directory);
}

export async function roleOf(userId, roles, directory) {
  const a = roles[userId];
  if (!a) return 'guest';
  return (await validAssertion(a, roles, directory, new Set())) ? a.role : 'guest';
}

export function roleLabel(role) {
  return { admin: 'Admin', teacher: 'Teacher', student: 'Student', staff: 'Staff', suspended: 'Suspended', guest: 'Unverified' }[role] || 'Unverified';
}

export const permissions = {
  announce: role => role === 'admin',
  issueReports: role => role === 'teacher' || role === 'staff' || role === 'admin',
  manageChannels: role => role === 'teacher' || role === 'admin',
  moderateMembers: role => role === 'admin',
  createStream: () => true,
  approve: role => role === 'admin',
};

// ---------- proposals ----------

export function threshold(adminCount) {
  if (adminCount === 0) return 1;
  return Math.floor(adminCount / 2) + 1;
}

export function proposalEffectMsg(p) {
  if (!p) return '';
  if (p.kind === 'set-role') {
    return canonical({ userId: p.payload.userId, role: p.payload.role, ts: p.ts });
  }
  if (p.kind === 'announce') return canonical(pick(p, ['id', 'payload', 'ts']));
  return '';
}

export async function verifyAnnouncement(ann, roles, directory) {
  if (!ann || !ann.id) return false;
  const admins = await adminsList(roles, directory);
  if (!admins.length) return false;
  const need = threshold(admins.length);
  const msg = canonical(pick(ann, ['id', 'payload', 'ts']));
  let ok = 0;
  const got = new Set();
  for (const ap of ann.approvals || []) {
    if (got.has(ap.admin) || !admins.includes(ap.admin)) continue;
    const rec = directory[ap.admin];
    if (!rec) continue;
    if (await verifyCached(rec.signPub, msg, ap.sig)) { ok++; got.add(ap.admin); }
  }
  return ok >= need;
}

export function approvalsCount(p) {
  return new Set((p && p.approvals || []).map(a => a.admin)).size;
}
