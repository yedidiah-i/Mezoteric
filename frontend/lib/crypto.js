/**
 * Mezoteric Cryptographic Core
 * 
 * Implements client-side, zero-knowledge cryptographic primitives:
 * - Identity: ECDSA P-256 key pair for digital signatures & verifiable credentials
 * - Encryption: ECDH P-256 key pair for Diffie-Hellman key agreement
 * - Symmetric Ciphers: AES-256-GCM for envelope encryption and media byte protection
 * - Key Derivation: HKDF-SHA256 for directional pairwise keys; PBKDF2 for local passphrase vault
 * - Hashing: SHA-256 for canonical message serialization
 * 
 * The school LAN server only relays opaque ciphertext envelopes. It NEVER possesses
 * the private keys and CANNOT inspect messages, report cards, or documents.
 */

const TE = new TextEncoder();
const TD = new TextDecoder();

export const utf8 = (s) => TE.encode(s);
export const fromUtf8 = (b) => TD.decode(b);

/**
 * Deterministic JSON stringifier (sorted object keys, no whitespace).
 * Required for byte-exact digital signature verification across devices and nodes.
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

/**
 * Picks only the specified keys from an object to ensure canonical signing
 */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/**
 * Generates cryptographically secure random bytes
 */
export function randomBytes(n = 16) {
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(b);
  }
  return b;
}

/**
 * Base64 encode an ArrayBuffer or Uint8Array
 */
export function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/**
 * Base64 decode to a Uint8Array
 */
export function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * URL-safe unique identifier (base64url format)
 */
export function randomId(bytes = 12) {
  return b64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Lowercase hex identifier, safe for envelope kinds and doc IDs
 */
export function hexId(prefix = '', bytes = 6) {
  let s = prefix;
  for (const b of randomBytes(bytes)) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * Generate a new device identity containing:
 * - ECDSA P-256 for identity & signatures
 * - ECDH P-256 for end-to-end encryption
 */
export async function generateIdentity() {
  const signPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const ecdhPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  return {
    signPub: b64(await crypto.subtle.exportKey('raw', signPair.publicKey)),
    ecdhPub: b64(await crypto.subtle.exportKey('raw', ecdhPair.publicKey)),
    signPriv: await crypto.subtle.exportKey('jwk', signPair.privateKey),
    ecdhPriv: await crypto.subtle.exportKey('jwk', ecdhPair.privateKey),
  };
}

// In-memory key caches for faster signature checks and derivations
const sigKeyCache = new Map();
async function signKey(jwk, usages) {
  const cacheKey = usages.join(',') + ':' + (jwk.d || '').slice(0, 24);
  let k = sigKeyCache.get(cacheKey);
  if (!k) {
    k = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      usages
    );
    sigKeyCache.set(cacheKey, k);
  }
  return k;
}

/**
 * Signs a canonical message string with the user's ECDSA private key
 */
export async function signMessage(signPrivJwk, message) {
  const key = await signKey(signPrivJwk, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(message));
  return b64(sig);
}

const verifyKeyCache = new Map();
/**
 * Verifies an ECDSA P-256 signature using the signer's raw public key
 */
export async function verifySignature(signPubB64, message, sigB64) {
  try {
    let key = verifyKeyCache.get(signPubB64);
    if (!key) {
      key = await crypto.subtle.importKey(
        'raw',
        unb64(signPubB64),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      verifyKeyCache.set(signPubB64, key);
    }
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      unb64(sigB64),
      utf8(message)
    );
  } catch {
    return false;
  }
}

/**
 * Derives a directional shared AES-256-GCM key between two users via ECDH + HKDF.
 * Binding direction (fromId > toId) ensures keys/nonces are never reused symmetrically.
 */
export async function pairKey(myEcdhPrivJwk, theirEcdhPubB64, fromId, toId, purpose = 'dm') {
  const priv = await crypto.subtle.importKey(
    'jwk',
    myEcdhPrivJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const pub = await crypto.subtle.importKey(
    'raw',
    unb64(theirEcdhPubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
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

/**
 * Encrypt plaintext string using AES-256-GCM
 */
export async function aesEncrypt(key, plaintext) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext));
  return { ct: b64(ct), iv: b64(iv) };
}

/**
 * Decrypt ciphertext string using AES-256-GCM
 */
export async function aesDecrypt(key, ctB64, ivB64) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(ivB64) },
    key,
    unb64(ctB64)
  );
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

/**
 * Encrypt binary attachment (document, image, voice note) before uploading to the LAN node
 */
export async function encryptBytes(bytes) {
  const key = await randomAesKey();
  const iv = randomBytes(12);
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  return { ct: new Uint8Array(ct), key: await exportAesKey(key), iv: b64(iv) };
}

/**
 * Decrypt binary attachment downloaded from the LAN node
 */
export async function decryptBytes(ctBytes, keyB64, ivB64) {
  const key = await importAesKey(keyB64);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, ctBytes)
  );
}

// ---------- Local Passphrase Vault for Private Keys ----------

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

/**
 * Seals private keys using a user's passphrase with PBKDF2 (250k rounds) + AES-GCM
 */
export async function sealVault(passphrase, payload) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passKey(passphrase, salt, false);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(payload)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/**
 * Unlocks the private key vault using the user's passphrase
 */
export async function openVault(passphrase, vault) {
  const key = await passKey(passphrase, unb64(vault.salt), false);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(vault.iv) },
    key,
    unb64(vault.ct)
  );
  return JSON.parse(fromUtf8(pt));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', utf8(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Human-verifiable safety number / cryptographic fingerprint for WhatsApp-style contact verification
 */
export async function safetyNumber(userId, signPub, ecdhPub) {
  const hex = await sha256Hex(`${userId}|${signPub}|${ecdhPub}`);
  const groups = [];
  for (let i = 0; i < 12; i += 4) groups.push(hex.slice(i * 2, i * 2 + 4).toUpperCase());
  return groups.join(' ');
}
