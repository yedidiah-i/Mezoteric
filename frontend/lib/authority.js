/**
 * Mezoteric Authority & Decentralized Governance Verification
 * 
 * CORE PRINCIPLE: The school LAN node is UNTRUSTED.
 * Every assertion, document, message, and administrative decision is re-verified
 * directly in the user's browser using cryptographic signatures against the local public keys.
 * 
 * DECENTRALIZED MULTI-ADMIN RULE:
 * School admin powers are never concentrated in a single account. Critical administrative
 * actions (promoting teachers/admins, revoking roles, issuing school-wide emergency announcements)
 * require an M-of-N majority threshold of verified active administrators.
 */

import { canonical, pick, verifySignature } from './crypto.js';

const ROLE_KIND = new Set(['student', 'teacher', 'staff', 'admin', 'suspended']);
const verified = new Map(); // LRU/memo cache: signature -> boolean

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

/**
 * Verifies a user's signed public profile record (directory entry)
 */
export async function verifyRecord(rec) {
  if (!rec || !rec.userId || !rec.signPub || !rec.ecdhPub) return false;
  const msg = canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts']));
  return verifyCached(rec.signPub, msg, rec.sig);
}

/**
 * Verifies that an E2EE envelope was authentically signed by its claimed sender
 */
export async function verifyEnvelope(env, directory) {
  if (!env || !env.id || !env.from || !env.to || !env.kind) return false;
  const rec = directory[env.from];
  if (!rec) return false;
  const msg = canonical(pick(env, ['id', 'from', 'to', 'kind', 'ct', 'iv', 'ts']));
  return verifyCached(rec.signPub, msg, env.sig);
}

/**
 * Verifies digital school documents (report cards, lecture notes, certificates)
 */
export async function verifyDoc(doc, directory) {
  if (!doc || !doc.id || !doc.by || !doc.to) return false;
  const rec = directory[doc.by];
  if (!rec) return false;
  const msg = canonical(pick(doc, ['id', 'by', 'kind', 'to', 'ct', 'iv', 'ts']));
  return verifyCached(rec.signPub, msg, doc.sig);
}

/**
 * Verifies publicly broadcasted school items (channels, shorts, streams)
 */
export async function verifyPublicItem(table, item, directory) {
  const rec = directory[item && item.by];
  const creator = directory[item && item.createdBy];
  const fields = PUBLIC_SIGN_FIELDS[table];
  if (!fields || !item) return false;
  const signer = table === 'channels' ? creator : rec;
  if (!signer) return false;
  const msg = canonical(pick(item, fields));
  return verifyCached(signer.signPub, msg, item.sig);
}

/**
 * Verifies role elevation requests submitted by students/staff
 */
export async function verifyRequest(r, directory) {
  const rec = directory[r && r.userId];
  if (!rec) return false;
  const msg = canonical(pick(r, ['id', 'userId', 'wantRole', 'ts']));
  return verifyCached(rec.signPub, msg, r.sig);
}

/**
 * Verifies an administrative proposal signed by proposing admin
 */
export async function verifyProposal(p, directory) {
  const proposer = directory[p && p.proposer];
  if (!proposer) return false;
  const msg = canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts']));
  return verifyCached(proposer.signPub, msg, p.sig);
}

/**
 * Validates a role assertion using threshold consensus:
 * - 'self' assertion: can only claim 'student'
 * - 'genesis' admin: only valid if it's the very first root admin
 * - 'promoted' admin or teacher: must have signatures from a strict majority (M-of-N) of current admins
 */
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
        (r) => r.role === 'admin' && r.by === 'genesis' && r.ts < a.ts
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
    if (await verifyCached(arec.signPub, msg, ap.sig)) {
      ok++;
      got.add(ap.admin);
    }
  }
  return ok >= need;
}

export async function adminsExcluding(exclude, roles, directory, seen = new Set(), depth = 0) {
  const out = [];
  for (const [userId, a] of Object.entries(roles || {})) {
    if (userId === exclude || seen.has(userId)) continue;
    if (a.role !== 'admin') continue;
    if (depth < 6 && (await validAssertion(a, roles, directory, new Set(seen), depth))) {
      out.push(userId);
    }
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
  return (
    {
      admin: 'Administrator',
      teacher: 'Teacher',
      student: 'Student',
      staff: 'Staff',
      suspended: 'Suspended',
      guest: 'Unverified',
    }[role] || 'Unverified'
  );
}

export const permissions = {
  announce: (role) => role === 'admin',
  issueReports: (role) => role === 'teacher' || role === 'staff' || role === 'admin',
  manageChannels: (role) => role === 'teacher' || role === 'admin',
  moderateMembers: (role) => role === 'admin',
  createStream: () => true,
  approve: (role) => role === 'admin',
};

/**
 * Calculates majority threshold for M-of-N governance
 */
export function threshold(adminCount) {
  if (adminCount <= 0) return 1;
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
    if (await verifyCached(rec.signPub, msg, ap.sig)) {
      ok++;
      got.add(ap.admin);
    }
  }
  return ok >= need;
}

export function approvalsCount(p) {
  return new Set((p && p.approvals || []).map((a) => a.admin)).size;
}
