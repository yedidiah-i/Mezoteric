// Node state validation (server/store.js).
//
// The node is not trusted by the browser, but it must still refuse anything
// that is not properly signed: proposals from non-admins, tampered payloads,
// approval signatures replayed as vetoes and public items whose signature
// does not cover the fields that carry security meaning.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, pick } from '../server/util.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = path.join(HERE, '.tmp');

// The fields the node signs over (server/store.js PUBLIC_FIELDS). Spelled out
// here on purpose: if the node's list ever changes, this test must fail
// instead of silently signing something the node no longer accepts.
const PUBLIC_FIELDS = {
  channels: ['id', 'name', 'topic', 'createdBy', 'members', 'ts'],
  shorts: ['id', 'by', 'kind', 'mediaId', 'url', 'title', 'meta', 'ts'],
  streams: ['id', 'by', 'title', 'visibility', 'channelId', 'chatKey', 'wrappedChatKey', 'live', 'ended', 'ts'],
};

let Store, effectMsg, vetoMsg, signMessage, generateIdentity;
let store;
let dataDir;
let users = {};
let BASE = 0;

before(async () => {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  dataDir = fs.mkdtempSync(path.join(TMP_ROOT, 'store-'));
  // server/store.js resolves its data directory at import time.
  process.env.MZ_DATA = dataDir;

  ({ Store, effectMsg, vetoMsg } = await import('../server/store.js'));
  ({ signMessage, generateIdentity } = await import('../public/js/core/crypto.js'));

  store = new Store();
  BASE = Date.now();

  for (const [userId, name] of [['admin1', 'Admin One'], ['student1', 'Student One'], ['student2', 'Student Two']]) {
    const keys = await generateIdentity();
    const rec = {
      userId, name, ecdhPub: keys.ecdhPub, signPub: keys.signPub, ts: BASE,
    };
    rec.sig = await signMessage(keys.signPriv, canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts'])));
    const res = await store.ingestRecord(rec);
    assert.equal(res.ok, true, `ingestRecord(${userId}) must succeed: ${res.err || ''}`);
    users[userId] = { keys, rec };
  }

  // The one genesis admin (the first user of the school network).
  const role = { userId: 'admin1', role: 'admin', ts: BASE + 1, by: 'genesis' };
  role.sig = await signMessage(users.admin1.keys.signPriv, canonical(pick(role, ['userId', 'role', 'ts', 'by'])));
  const roleRes = await store.ingestRole(role);
  assert.equal(roleRes.ok, true, `ingestRole(genesis admin) must succeed: ${roleRes.err || ''}`);
});

after(() => {
  try { if (store) store.flush(); } catch { /* the temp dir may already be gone */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
});

const sign = (user, message) => signMessage(users[user].keys.signPriv, message);

async function makeProposal(over) {
  const p = {
    id: over.id,
    kind: over.kind,
    payload: over.payload,
    proposer: over.proposer || 'admin1',
    ts: over.ts,
  };
  // The signer defaults to the proposer; a proposal for an unknown user is
  // still signed by a real key so the node can reject it on other grounds.
  const signer = over.signer && users[over.signer] ? over.signer : 'admin1';
  p.sig = await sign(signer, canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts'])));
  return p;
}

// ---------- effect / veto message separation ----------

test('effectMsg() and vetoMsg() produce different messages for the same proposal', () => {
  const p = { id: 'p-1', kind: 'announce', payload: { title: 'T', body: 'B' }, proposer: 'admin1', ts: BASE + 10 };
  assert.notEqual(effectMsg(p), vetoMsg(p),
    'an approval signature must never be usable as a veto signature');
  assert.equal(effectMsg(p), canonical(pick(p, ['id', 'payload', 'ts'])),
    'announce approvals bind to id/payload/ts');
  assert.equal(vetoMsg(p), canonical({ id: p.id, ts: p.ts, action: 'veto' }));
});

test('effectMsg() for a set-role proposal binds to user, role and ts', () => {
  const p = { id: 'p-2', kind: 'set-role', payload: { userId: 'student1', role: 'teacher' }, proposer: 'admin1', ts: BASE + 11 };
  assert.equal(effectMsg(p), canonical({ userId: 'student1', role: 'teacher', ts: p.ts }));
  assert.notEqual(effectMsg(p), vetoMsg(p));
});

// ---------- proposal intake ----------

test('ingestProposal() rejects a proposal with a bad signature', async () => {
  const p = await makeProposal({ id: 'prop-badsig', kind: 'announce', payload: { title: 'T', body: 'B' }, ts: BASE + 20 });
  p.sig = await sign('student1', canonical(pick(p, ['id', 'kind', 'payload', 'proposer', 'ts'])));
  const res = await store.ingestProposal(p);
  assert.equal(res.ok, false, 'a proposal signed by a non-proposer must be rejected');
  assert.equal(res.err, 'bad proposal signature');
  assert.equal(store.state.proposals['prop-badsig'], undefined);
});

test('ingestProposal() rejects a proposal from a non-admin proposer', async () => {
  const p = await makeProposal({ id: 'prop-nonadmin', kind: 'announce', payload: { title: 'T', body: 'B' }, proposer: 'student1', ts: BASE + 21 });
  const res = await store.ingestProposal(p);
  assert.equal(res.ok, false);
  assert.equal(res.err, 'proposer not admin');
  assert.equal(store.state.proposals['prop-nonadmin'], undefined);
});

test('ingestProposal() rejects a malformed payload', async () => {
  const badRole = await makeProposal({ id: 'prop-badrole', kind: 'set-role', payload: { role: 'teacher' }, ts: BASE + 22 });
  const resRole = await store.ingestProposal(badRole);
  assert.equal(resRole.ok, false);
  assert.equal(resRole.err, 'bad payload');

  const badAnnounce = await makeProposal({ id: 'prop-badannounce', kind: 'announce', payload: { title: 'T' }, ts: BASE + 23 });
  const resAnnounce = await store.ingestProposal(badAnnounce);
  assert.equal(resAnnounce.ok, false);
  assert.equal(resAnnounce.err, 'bad payload');

  const badKind = await makeProposal({ id: 'prop-badkind', kind: 'delete-everything', payload: {}, ts: BASE + 24 });
  const resKind = await store.ingestProposal(badKind);
  assert.equal(resKind.ok, false);
  assert.equal(resKind.err, 'bad proposal');
});

test('ingestProposal() rejects an unknown proposer', async () => {
  const p = await makeProposal({ id: 'prop-unknown', kind: 'announce', payload: { title: 'T', body: 'B' }, proposer: 'ghost', ts: BASE + 25 });
  const res = await store.ingestProposal(p);
  assert.equal(res.ok, false);
  assert.equal(res.err, 'proposer not admin');
});

// ---------- proposal execution ----------

test('a proposal that reaches the admin threshold is executed and announces', async () => {
  const p = await makeProposal({
    id: 'prop-announce', kind: 'announce', payload: { title: 'School closed', body: 'Snow day' }, ts: BASE + 30,
  });
  const approvals = [{ admin: 'admin1', sig: await sign('admin1', effectMsg(p)) }];
  const res = await store.ingestProposal({ ...p, approvals });
  assert.equal(res.ok, true, `the proposal must be accepted: ${res.err || ''}`);
  assert.equal(store.state.proposals['prop-announce'].executed, true,
    'the proposal must be marked as executed once the threshold is reached');
  const ann = store.state.announcements['prop-announce'];
  assert.ok(ann, 'an executed announce proposal must create an announcement');
  assert.equal(ann.payload.title, 'School closed');
  assert.equal(ann.payload.body, 'Snow day');
});

test('an executed set-role proposal applies the role', async () => {
  const p = await makeProposal({
    id: 'prop-role', kind: 'set-role', payload: { userId: 'student2', role: 'teacher' }, ts: BASE + 31,
  });
  const approvals = [{ admin: 'admin1', sig: await sign('admin1', effectMsg(p)) }];
  const res = await store.ingestProposal({ ...p, approvals });
  assert.equal(res.ok, true, `the proposal must be accepted: ${res.err || ''}`);
  assert.equal(store.state.proposals['prop-role'].executed, true);
  assert.equal(store.state.roles['student2'].role, 'teacher',
    'the role of the target user must be applied by the node');
});

test('a proposal without enough admin approvals is not executed', async () => {
  const p = await makeProposal({
    id: 'prop-noapprovals', kind: 'announce', payload: { title: 'Nope', body: 'Nope' }, ts: BASE + 32,
  });
  const res = await store.ingestProposal({ ...p, approvals: [] });
  assert.equal(res.ok, true, 'the proposal itself is stored, it is just not applied');
  assert.ok(!store.state.proposals['prop-noapprovals'].executed,
    'a proposal without the required approvals must not be executed');
  assert.equal(store.state.announcements['prop-noapprovals'], undefined);
});

test('an approval from a non-admin does not count towards the threshold', async () => {
  const p = await makeProposal({
    id: 'prop-studentapprove', kind: 'announce', payload: { title: 'Nope', body: 'Nope' }, ts: BASE + 33,
  });
  const approvals = [{ admin: 'student1', sig: await sign('student1', effectMsg(p)) }];
  const res = await store.ingestProposal({ ...p, approvals });
  assert.equal(res.ok, true);
  assert.ok(!store.state.proposals['prop-studentapprove'].executed,
    'only admins may approve a proposal');
  assert.equal(store.state.announcements['prop-studentapprove'], undefined);
});

// ---------- veto ----------

test('a proposal carrying a valid admin veto is never applied', async () => {
  const p = await makeProposal({
    id: 'prop-veto', kind: 'announce', payload: { title: 'Vetoed', body: 'Vetoed' }, ts: BASE + 34,
  });
  const approvals = [{ admin: 'admin1', sig: await sign('admin1', effectMsg(p)) }];
  const vetoes = [{ admin: 'admin1', sig: await sign('admin1', vetoMsg(p)) }];
  const res = await store.ingestProposal({ ...p, approvals, vetoes });
  assert.equal(res.ok, true);
  assert.equal(store.state.proposals['prop-veto'].vetoes.length, 1,
    'the veto must be recorded on the proposal');
  assert.ok(!store.state.proposals['prop-veto'].executed,
    'a vetoed proposal must never be applied, even with enough approvals');
  assert.equal(store.state.announcements['prop-veto'], undefined,
    'a vetoed proposal must not create an announcement');
});

test('an approval signature cannot be replayed as a veto', async () => {
  const p = await makeProposal({
    id: 'prop-replay', kind: 'announce', payload: { title: 'Replayed', body: 'Replayed' }, ts: BASE + 35,
  });
  const approvalSig = await sign('admin1', effectMsg(p));
  const res = await store.ingestProposal({
    ...p,
    approvals: [{ admin: 'admin1', sig: approvalSig }],
    vetoes: [{ admin: 'admin1', sig: approvalSig }],
  });
  assert.equal(res.ok, true);
  assert.equal(store.state.proposals['prop-replay'].vetoes.length, 0,
    'an approval signature must not be accepted as a veto signature');
  assert.equal(store.state.proposals['prop-replay'].executed, true,
    'the proposal itself is still valid and must be applied');
});

// ---------- public items ----------

async function publishItem(table, item, user, fields) {
  const signed = { ...item };
  signed.sig = await sign(user, canonical(pick(signed, fields)));
  return store.ingestPublic(table, signed);
}

test('ingestPublic() accepts a short whose signature covers all signed fields', async () => {
  const item = {
    id: 'short-1',
    by: 'student1',
    kind: 'upload',
    mediaId: 'a'.repeat(64),
    url: '/media/abc',
    title: 'Science trip',
    meta: { key: 'media-key', iv: 'media-iv', mime: 'video/mp4' },
    ts: BASE + 40,
  };
  const res = await publishItem('shorts', item, 'student1', PUBLIC_FIELDS.shorts);
  assert.equal(res.ok, true, `the short must be accepted: ${res.err || ''}`);
  assert.ok(store.state.shorts['short-1'], 'the short must be stored');
  assert.equal(store.state.shorts['short-1'].meta.key, 'media-key');
});

test('ingestPublic() rejects a short whose meta (media key) is not signed', async () => {
  const item = {
    id: 'short-2',
    by: 'student1',
    kind: 'upload',
    mediaId: 'b'.repeat(64),
    url: '/media/def',
    title: 'Unprotected',
    meta: { key: 'media-key', iv: 'media-iv', mime: 'video/mp4' },
    ts: BASE + 41,
  };
  const withoutMeta = PUBLIC_FIELDS.shorts.filter(f => f !== 'meta');
  const res = await publishItem('shorts', item, 'student1', withoutMeta);
  assert.equal(res.ok, false, 'a short signed without its media key must be rejected');
  assert.equal(res.err, 'bad item signature');
  assert.equal(store.state.shorts['short-2'], undefined);
});

test('ingestPublic() rejects a short whose meta was swapped after signing', async () => {
  const item = {
    id: 'short-3',
    by: 'student1',
    kind: 'upload',
    mediaId: 'c'.repeat(64),
    url: '/media/ghi',
    title: 'Swapped',
    meta: { key: 'media-key', iv: 'media-iv', mime: 'video/mp4' },
    ts: BASE + 42,
  };
  const signed = { ...item };
  signed.sig = await sign('student1', canonical(pick(signed, PUBLIC_FIELDS.shorts)));
  const tampered = { ...signed, meta: { key: 'attacker-key', iv: 'media-iv', mime: 'video/mp4' } };
  const res = await store.ingestPublic('shorts', tampered);
  assert.equal(res.ok, false);
  assert.equal(res.err, 'bad item signature');
  assert.equal(store.state.shorts['short-3'], undefined);
});

test('ingestPublic() accepts a stream and rejects an unsigned chat key', async () => {
  const item = {
    id: 'stream-1',
    by: 'student1',
    title: 'Study hall',
    visibility: 'public',
    channelId: 'chan-1',
    chatKey: 'chat-key',
    wrappedChatKey: 'wrapped-chat-key',
    live: true,
    ended: false,
    ts: BASE + 43,
  };
  const ok = await publishItem('streams', item, 'student1', PUBLIC_FIELDS.streams);
  assert.equal(ok.ok, true, `the stream must be accepted: ${ok.err || ''}`);
  assert.ok(store.state.streams['stream-1'], 'the stream must be stored');

  const item2 = { ...item, id: 'stream-2', ts: BASE + 44 };
  const withoutChatKey = PUBLIC_FIELDS.streams.filter(f => f !== 'chatKey' && f !== 'wrappedChatKey');
  const bad = await publishItem('streams', item2, 'student1', withoutChatKey);
  assert.equal(bad.ok, false, 'a stream signed without its chat keys must be rejected');
  assert.equal(bad.err, 'bad item signature');
  assert.equal(store.state.streams['stream-2'], undefined);
});

test('ingestPublic() accepts a channel and rejects a channel with a swapped member list', async () => {
  const item = {
    id: 'chan-1',
    by: 'admin1',
    createdBy: 'admin1',
    name: 'Mathematics',
    topic: 'Room 2',
    members: ['admin1', 'student1'],
    ts: BASE + 45,
  };
  const ok = await publishItem('channels', item, 'admin1', PUBLIC_FIELDS.channels);
  assert.equal(ok.ok, true, `the channel must be accepted: ${ok.err || ''}`);
  assert.ok(store.state.channels['chan-1'], 'the channel must be stored');

  const item2 = { ...item, id: 'chan-2', ts: BASE + 46 };
  const signed = { ...item2 };
  signed.sig = await sign('admin1', canonical(pick(signed, PUBLIC_FIELDS.channels)));
  const tampered = { ...signed, members: ['admin1'] };
  const bad = await store.ingestPublic('channels', tampered);
  assert.equal(bad.ok, false, 'the member list is signed and must not be changeable by the node');
  assert.equal(bad.err, 'bad item signature');
});

test('ingestPublic() requires a by field on every public item', async () => {
  // The browser publishes channels without a `by` field (only `createdBy`),
  // while the node keys every public item by `by` - see the report.
  const item = {
    id: 'chan-3',
    createdBy: 'admin1',
    name: 'History',
    topic: 'Room 3',
    members: ['admin1'],
    ts: BASE + 47,
  };
  const res = await publishItem('channels', item, 'admin1', PUBLIC_FIELDS.channels);
  assert.equal(res.ok, false, 'the node keys public items by "by" and needs it');
  assert.equal(res.err, 'bad item');
});

test('ingestPublic() rejects an item from an unknown publisher', async () => {
  const item = {
    id: 'short-4',
    by: 'ghost',
    kind: 'upload',
    mediaId: 'd'.repeat(64),
    url: '/media/jkl',
    title: 'Ghost',
    meta: { key: 'k', iv: 'i', mime: 'image/png' },
    ts: BASE + 48,
  };
  const res = await publishItem('shorts', item, 'student1', PUBLIC_FIELDS.shorts);
  assert.equal(res.ok, false);
  assert.equal(res.err, 'unknown publisher');
});
