// Server helpers (server/util.js): the deterministic wire format that every
// client signature is computed over, plus the field-picking helper.
//
// These tests are the client/server contract guard: if canonical() or pick()
// ever drift between public/js/core/crypto.js and server/util.js, the whole
// signature scheme silently stops verifying.
import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import {
  canonical, pick, randomId, sha256Hex, verifySig, b64ToBytes, bytesToB64,
} from '../server/util.js';
import {
  canonical as clientCanonical,
  pick as clientPick,
  randomId as clientRandomId,
} from '../public/js/core/crypto.js';

// The node's own user-id rule (server/store.js:16 USER_ID).
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

// ---------- canonical ----------

test('canonical() sorts keys and does not depend on insertion order', () => {
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}',
    'canonical() must sort object keys alphabetically');
  assert.equal(canonical({ a: 2, b: 1 }), canonical({ b: 1, a: 2 }),
    'canonical() must be independent of key insertion order');
});

test('canonical() emits no whitespace and sorts nested objects too', () => {
  assert.equal(canonical({ b: [1, 2], a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":[1,2]}',
    'canonical() must be compact JSON with recursively sorted keys');
});

test('canonical() keeps array order and encodes primitives as JSON', () => {
  assert.equal(canonical([3, 1, 2]), '[3,1,2]', 'canonical() must preserve array order');
  assert.equal(canonical(null), 'null');
  assert.equal(canonical('x'), '"x"');
  assert.equal(canonical(5), '5');
  assert.equal(canonical(true), 'true');
});

test('canonical() is deterministic across repeated calls', () => {
  const value = { z: { y: [1, { x: 'q' }] }, a: 'r', m: null };
  assert.equal(canonical(value), canonical(value));
});

test('client canonical() is byte-identical to the server one (wire compatibility)', () => {
  const value = {
    userId: 'u1', ts: 1700000000000, meta: { key: 'k', iv: 'i' }, list: [1, 2, 3], live: true,
  };
  assert.equal(clientCanonical(value), canonical(value),
    'public/js/core/crypto.js canonical() must match server/util.js canonical() exactly');
});

test('client pick() matches server pick() (wire compatibility)', () => {
  const obj = { a: 1, b: undefined, c: 3, d: 0 };
  const keys = ['a', 'b', 'c', 'd', 'missing'];
  assert.deepEqual(clientPick(obj, keys), pick(obj, keys));
});

// ---------- pick ----------

test('pick() skips undefined values', () => {
  const out = pick({ a: 1, b: undefined, c: 3 }, ['a', 'b', 'c']);
  assert.deepEqual(out, { a: 1, c: 3 },
    'pick() must not copy keys whose value is undefined');
  assert.ok(!('b' in out), 'pick() must not create the key at all for undefined values');
});

test('pick() skips keys that are missing from the source object', () => {
  const out = pick({ a: 1 }, ['a', 'nope']);
  assert.deepEqual(out, { a: 1 });
  assert.deepEqual(Object.keys(out), ['a']);
});

test('pick() keeps falsy-but-defined values', () => {
  const out = pick({ zero: 0, empty: '', no: false, nul: null }, ['zero', 'empty', 'no', 'nul']);
  assert.deepEqual(out, { zero: 0, empty: '', no: false, nul: null },
    'only undefined is skipped - 0, "", false and null are real values');
});

test('pick() tolerates a missing source object', () => {
  assert.deepEqual(pick(null, ['a', 'b']), {});
  assert.deepEqual(pick(undefined, ['a']), {});
});

test('pick() preserves the requested key order', () => {
  const out = pick({ b: 2, a: 1 }, ['b', 'a']);
  assert.deepEqual(Object.keys(out), ['b', 'a']);
});

// ---------- ids and hashing ----------

test('randomId() returns a node-compatible, unique, url-safe id', () => {
  const id = randomId();
  assert.match(id, USER_ID,
    'randomId() must satisfy the node USER_ID rule (A-Za-z0-9_-)');
  assert.ok(id.length >= 12, 'randomId() must not be trivially short');
  assert.notEqual(id, randomId(), 'randomId() must not repeat');
});

test('client randomId() also satisfies the node USER_ID rule', () => {
  const id = clientRandomId();
  assert.match(id, USER_ID, 'the browser id generator must produce node-acceptable ids');
});

test('sha256Hex() matches the known SHA-256 vector for "abc"', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('bytesToB64()/b64ToBytes() round-trip binary data', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 255]);
  assert.deepEqual([...b64ToBytes(bytesToB64(bytes))], [...bytes]);
});

// ---------- signature verification (server format) ----------

function p256KeyPair() {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  // The last 65 bytes of a P-256 SPKI DER are the uncompressed point, which is
  // exactly the "raw" public key format WebCrypto expects.
  return { pubB64: bytesToB64(spki.subarray(spki.length - 65)), privateKey };
}

// Raw r||s ECDSA signature: the exact byte layout WebCrypto produces.
function signRaw(privateKey, message) {
  return bytesToB64(nodeCrypto.sign(
    'sha256', Buffer.from(message, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' },
  ));
}

test('verifySig() accepts a valid P-256 raw r||s signature', async () => {
  const { pubB64, privateKey } = p256KeyPair();
  const msg = canonical({ hello: 'world', ts: 42 });
  const sig = signRaw(privateKey, msg);
  assert.equal(await verifySig(pubB64, msg, sig), true,
    'the node must accept a correctly produced WebCrypto-format signature');
});

test('verifySig() rejects a signature over a different message', async () => {
  const { pubB64, privateKey } = p256KeyPair();
  const sig = signRaw(privateKey, 'the original message');
  assert.equal(await verifySig(pubB64, 'a different message', sig), false,
    'a signature must not verify over a tampered message');
});

test('verifySig() rejects garbage instead of throwing', async () => {
  const { pubB64 } = p256KeyPair();
  assert.equal(await verifySig(pubB64, 'msg', 'not-base64-$$$'), false);
  assert.equal(await verifySig('not-a-key', 'msg', 'AAAA'), false);
});
