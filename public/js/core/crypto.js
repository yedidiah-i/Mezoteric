// Mezoteric crypto core.
// Every device owns two P-256 key pairs: one for signatures (identity) and one
// for ECDH (message encryption). The node only ever relays signed ciphertext,
// so it cannot read messages, documents or attachments.
//
// Wire compatibility with server/util.js:
//   * public keys  -> raw uncompressed point, standard base64
//   * signatures   -> WebCrypto ECDSA P-256, raw r||s, standard base64
//   * signed text  -> canonical JSON (sorted keys, no whitespace), UTF-8

const TE = new TextEncoder();
const TD = new TextDecoder();

export const utf8 = s => TE.encode(s);
export const fromUtf8 = b => TD.decode(b);

/** Deterministic JSON identical to server/util.js canonical(). */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function randomBytes(n = 16) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** URL-safe id (base64url, no padding) — accepted by the node's USER_ID rule. */
export function randomId(bytes = 12) {
  return b64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Lowercase hex id, safe inside an envelope `kind` (a-z0-9- only). */
export function hexId(prefix = '', bytes = 6) {
  let s = prefix;
  for (const b of randomBytes(bytes)) s += b.toString(16).padStart(2, '0');
  return s;
}

export async function generateIdentity() {
  const signPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  const ecdhPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  return {
    signPub: b64(await crypto.subtle.exportKey('raw', signPair.publicKey)),
    ecdhPub: b64(await crypto.subtle.exportKey('raw', ecdhPair.publicKey)),
    signPriv: await crypto.subtle.exportKey('jwk', signPair.privateKey),
    ecdhPriv: await crypto.subtle.exportKey('jwk', ecdhPair.privateKey),
  };
}

const sigKeyCache = new Map();
async function signKey(jwk, usages) {
  const cacheKey = usages.join(',') + ':' + (jwk.d || '').slice(0, 24);
  let k = sigKeyCache.get(cacheKey);
  if (!k) {
    k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, usages);
    sigKeyCache.set(cacheKey, k);
  }
  return k;
}

export async function signMessage(signPrivJwk, message) {
  const key = await signKey(signPrivJwk, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(message));
  return b64(sig);
}

const verifyKeyCache = new Map();
export async function verifySignature(signPubB64, message, sigB64) {
  try {
    let key = verifyKeyCache.get(signPubB64);
    if (!key) {
      key = await crypto.subtle.importKey(
        'raw', unb64(signPubB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
      );
      verifyKeyCache.set(signPubB64, key);
    }
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, unb64(sigB64), utf8(message)
    );
  } catch {
    return false;
  }
}

/**
 * Shared AES-GCM key for a pair of users. The salt binds the key to the
 * direction (from -> to), so the two directions never reuse a key/nonce.
 */
export async function pairKey(myEcdhPrivJwk, theirEcdhPubB64, fromId, toId, purpose = 'dm') {
  const priv = await crypto.subtle.importKey(
    'jwk', myEcdhPrivJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  const pub = await crypto.subtle.importKey(
    'raw', unb64(theirEcdhPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(`${fromId}>${toId}`),
      info: utf8(`mezoteric/${purpose}/v1`),
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function aesEncrypt(key, plaintext) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext));
  return { ct: b64(ct), iv: b64(iv) };
}

export async function aesDecrypt(key, ctB64, ivB64) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
  return fromUtf8(pt);
}

export async function randomAesKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function importAesKey(rawB64) {
  return crypto.subtle.importKey('raw', unb64(rawB64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function exportAesKey(key) {
  return b64(await crypto.subtle.exportKey('raw', key));
}

/** Wrap a raw AES key to a user's ECDH public key (for channel invitations). */
export async function wrapKeyFor(myPrivJwk, theirPubB64, keyB64, fromId, toId) {
  const key = await pairKey(myPrivJwk, theirPubB64, fromId, toId, 'key');
  return aesEncrypt(key, keyB64);
}

export async function unwrapKeyFrom(myPrivJwk, theirPubB64, ct, iv, fromId, toId) {
  const key = await pairKey(myPrivJwk, theirPubB64, fromId, toId, 'key');
  return aesDecrypt(key, ct, iv);
}

/** Encrypt arbitrary bytes (attachments) before they touch the node. */
export async function encryptBytes(bytes) {
  const key = await randomAesKey();
  const iv = randomBytes(12);
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  return { ct: new Uint8Array(ct), key: await exportAesKey(key), iv: b64(iv) };
}

export async function decryptBytes(ctBytes, keyB64, ivB64) {
  const key = await importAesKey(keyB64);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(ivB64) }, key, ctBytes
  ));
}

// ---------- local passphrase vault for the private keys ----------

async function passKey(passphrase, salt, extractable) {
  const base = await crypto.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function sealVault(passphrase, payload) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passKey(passphrase, salt, false);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(payload)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function openVault(passphrase, vault) {
  const key = await passKey(passphrase, unb64(vault.salt), false);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct)
  );
  return JSON.parse(fromUtf8(pt));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', utf8(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Short human-checkable fingerprint of a user's identity keys. */
export async function safetyNumber(userId, signPub, ecdhPub) {
  const hex = await sha256Hex(`${userId}|${signPub}|${ecdhPub}`);
  const groups = [];
  for (let i = 0; i < 12; i += 4) groups.push(hex.slice(i * 2, i * 2 + 4).toUpperCase());
  return groups.join(' ');
}
