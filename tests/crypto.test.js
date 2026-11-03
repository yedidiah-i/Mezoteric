// Client crypto primitives (public/js/core/crypto.js).
//
// The file uses WebCrypto plus btoa/atob/TextEncoder, all of which exist as
// globals in Node 18+, so it can be imported directly by the Node test runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonical, pick, signMessage, verifySignature, pairKey,
  aesEncrypt, aesDecrypt, randomAesKey, importAesKey, exportAesKey,
  encryptBytes, decryptBytes, sealVault, openVault,
  generateIdentity, hexId, randomId,
} from '../public/js/core/crypto.js';

// The node's own user-id rule (server/store.js:16 USER_ID).
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

const b64ToBuf = b64 => Buffer.from(b64, 'base64');

// ---------- canonical / pick ----------

test('canonical() sorts keys and is independent of insertion order', () => {
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}',
    'canonical() must sort object keys alphabetically');
  assert.equal(canonical({ a: 2, b: 1 }), canonical({ b: 1, a: 2 }));
});

test('canonical() is compact, recursive and array-order preserving', () => {
  assert.equal(canonical({ b: [1, 2], a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":[1,2]}');
  assert.equal(canonical([3, 1, 2]), '[3,1,2]');
  assert.equal(canonical(null), 'null');
  assert.equal(canonical('x'), '"x"');
});

test('pick() skips undefined values', () => {
  const out = pick({ a: 1, b: undefined, c: 3 }, ['a', 'b', 'c']);
  assert.deepEqual(out, { a: 1, c: 3 });
  assert.ok(!('b' in out));
});

// ---------- signatures ----------

test('signMessage()/verifySignature() round-trips', async () => {
  const id = await generateIdentity();
  const msg = canonical({ hello: 'world', n: 1 });
  const sig = await signMessage(id.signPriv, msg);
  assert.ok(sig.length > 0, 'signMessage() must produce a signature');
  assert.equal(await verifySignature(id.signPub, msg, sig), true,
    'a signature must verify over the exact message it was made for');
});

test('verifySignature() fails over a different message', async () => {
  const id = await generateIdentity();
  const sig = await signMessage(id.signPriv, 'the original message');
  assert.equal(await verifySignature(id.signPub, 'a different message', sig), false,
    'a signature must not verify over a different message');
});

test('verifySignature() fails over a tampered message of the same length', async () => {
  const id = await generateIdentity();
  const sig = await signMessage(id.signPriv, 'hello world');
  assert.equal(await verifySignature(id.signPub, 'hello worle', sig), false,
    'a one-character tamper must break verification');
});

test('verifySignature() fails for another key and for a corrupted signature', async () => {
  const id = await generateIdentity();
  const other = await generateIdentity();
  const msg = 'shared message';
  const sig = await signMessage(id.signPriv, msg);
  assert.equal(await verifySignature(other.signPub, msg, sig), false,
    'a signature must not verify under a different public key');
  const corrupted = sig.slice(0, -2) + (sig.slice(-2, -1) === 'A' ? 'BB' : 'AA');
  assert.equal(await verifySignature(id.signPub, msg, corrupted), false,
    'a corrupted signature must not verify');
});

// ---------- AES-GCM ----------

test('aesEncrypt()/aesDecrypt() round-trips', async () => {
  const key = await randomAesKey();
  const { ct, iv } = await aesEncrypt(key, 'the secret message');
  assert.notEqual(ct, 'the secret message', 'the ciphertext must not be the plaintext');
  assert.equal(await aesDecrypt(key, ct, iv), 'the secret message');
});

test('aesEncrypt()/aesDecrypt() round-trips unicode and empty strings', async () => {
  const key = await randomAesKey();
  for (const text of ['héllo 🌍 ünïcode', '', 'a'.repeat(5000)]) {
    const { ct, iv } = await aesEncrypt(key, text);
    assert.equal(await aesDecrypt(key, ct, iv), text);
  }
});

test('aesEncrypt() produces a fresh iv (and therefore fresh ciphertext) every time', async () => {
  const key = await randomAesKey();
  const a = await aesEncrypt(key, 'same plaintext');
  const b = await aesEncrypt(key, 'same plaintext');
  assert.notEqual(a.iv, b.iv, 'each encryption must use a new random iv');
  assert.notEqual(a.ct, b.ct, 'the same plaintext must not produce the same ciphertext twice');
});

test('aesDecrypt() fails with the wrong key instead of returning garbage', async () => {
  const key = await randomAesKey();
  const other = await randomAesKey();
  const { ct, iv } = await aesEncrypt(key, 'top secret');
  await assert.rejects(() => aesDecrypt(other, ct, iv),
    'AES-GCM authentication must fail with a different key');
});

test('aesDecrypt() fails when the ciphertext was tampered with', async () => {
  const key = await randomAesKey();
  const { ct, iv } = await aesEncrypt(key, 'top secret');
  const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  await assert.rejects(() => aesDecrypt(key, flipped, iv),
    'AES-GCM authentication must fail on a modified ciphertext');
});

// ---------- key agreement / domain separation ----------

test('pairKey() is deterministic for the same identities and purpose', async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const k1 = await pairKey(a.ecdhPriv, b.ecdhPub, 'alice', 'bob', 'dm');
  const k2 = await pairKey(a.ecdhPriv, b.ecdhPub, 'alice', 'bob', 'dm');
  const { ct, iv } = await aesEncrypt(k1, 'shared secret');
  assert.equal(await aesDecrypt(k2, ct, iv), 'shared secret',
    'the same pair + direction + purpose must derive the same key');
});

test('pairKey() derives a different key for a different purpose (domain separation)', async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const chatKey = await pairKey(a.ecdhPriv, b.ecdhPub, 'alice', 'bob', 'dm');
  const rtcKey = await pairKey(a.ecdhPriv, b.ecdhPub, 'alice', 'bob', 'rtc');
  const { ct, iv } = await aesEncrypt(chatKey, 'chat payload');
  await assert.rejects(() => aesDecrypt(rtcKey, ct, iv),
    'a chat key must never decrypt an RTC payload (and vice versa)');
});

test('pairKey() derives a different key for the opposite direction', async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const ab = await pairKey(a.ecdhPriv, b.ecdhPub, 'alice', 'bob', 'dm');
  const ba = await pairKey(b.ecdhPriv, a.ecdhPub, 'bob', 'alice', 'dm');
  const { ct, iv } = await aesEncrypt(ab, 'alice to bob');
  await assert.rejects(() => aesDecrypt(ba, ct, iv),
    'the salt binds the key to the direction, so the two directions differ');
});

// ---------- raw key import/export ----------

test('importAesKey()/exportAesKey() round-trip', async () => {
  const key = await randomAesKey();
  const raw = await exportAesKey(key);
  assert.equal(b64ToBuf(raw).length, 32, 'an AES-256 key must export as 32 raw bytes');
  const imported = await importAesKey(raw);
  const { ct, iv } = await aesEncrypt(key, 'round trip');
  assert.equal(await aesDecrypt(imported, ct, iv), 'round trip');
});

test('importAesKey() rejects a key that was not exported', async () => {
  await assert.rejects(() => importAesKey(b64ToBuf('not a key').toString('base64')));
});

// ---------- attachment path ----------

test('encryptBytes()/decryptBytes() round-trip binary data', async () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128]);
  const { ct, key, iv } = await encryptBytes(bytes);
  const out = await decryptBytes(ct, key, iv);
  assert.deepEqual([...out], [...bytes]);
});

// ---------- passphrase vault ----------

test('sealVault()/openVault() round-trip', async () => {
  const vault = await sealVault('correct horse', { signPriv: 'x', ecdhPriv: 'y' });
  const out = await openVault('correct horse', vault);
  assert.deepEqual(out, { signPriv: 'x', ecdhPriv: 'y' });
});

test('openVault() fails with the wrong passphrase', async () => {
  const vault = await sealVault('correct horse', { a: 1 });
  await assert.rejects(() => openVault('wrong horse', vault));
});

// ---------- identity ----------

test('generateIdentity() produces two usable P-256 public keys', async () => {
  const id = await generateIdentity();
  assert.ok(id.signPub, 'the identity must expose the signature public key');
  assert.ok(id.ecdhPub, 'the identity must expose the ECDH public key');
  assert.equal(b64ToBuf(id.signPub).length, 65, 'a raw P-256 point is 65 bytes');
  assert.equal(b64ToBuf(id.ecdhPub).length, 65, 'a raw P-256 point is 65 bytes');
  assert.equal(b64ToBuf(id.signPub)[0], 0x04, 'the raw point must be uncompressed');
  assert.notEqual(id.signPub, id.ecdhPub,
    'signing and ECDH must use two independent key pairs');
});

test('generateIdentity() produces an identity usable for signing and key agreement', async () => {
  const id = await generateIdentity();
  const sig = await signMessage(id.signPriv, 'identity works');
  assert.equal(await verifySignature(id.signPub, 'identity works', sig), true);
  const peer = await generateIdentity();
  const key = await pairKey(id.ecdhPriv, peer.ecdhPub, 'me', 'peer', 'dm');
  const { ct, iv } = await aesEncrypt(key, 'e2e');
  assert.equal(await aesDecrypt(key, ct, iv), 'e2e');
});

test('the browser builds a node-acceptable identity (user id + signed record)', async () => {
  // generateIdentity() returns key material only; the browser derives the user
  // id separately (randomId) and signs the directory record with it.
  const id = await generateIdentity();
  const userId = randomId();
  assert.match(userId, USER_ID, 'the browser user id must satisfy the node USER_ID rule');
  const rec = {
    userId, name: 'Alice', ecdhPub: id.ecdhPub, signPub: id.signPub, ts: 1700000000000,
  };
  rec.sig = await signMessage(id.signPriv, canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts'])));
  assert.equal(await verifySignature(rec.signPub, canonical(pick(rec, ['userId', 'name', 'ecdhPub', 'signPub', 'ts'])), rec.sig), true);
});

test('hexId() produces an id usable inside an envelope kind', () => {
  const id = hexId('msg-', 4);
  assert.match(id, /^[a-z0-9-]+$/,
    'envelope kinds only allow lowercase letters, digits and dashes');
});
