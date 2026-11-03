// Shared server helpers: canonical JSON, ids, hashing, signature verification.
import crypto from 'node:crypto';

// Deterministic JSON: sorted keys, no whitespace. Clients sign this exact form.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Verify an ECDSA P-256 signature (WebCrypto raw r||s format) over `message`.
export async function verifySig(signPubB64, message, sigB64) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      b64ToBytes(signPubB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64ToBytes(sigB64),
      new TextEncoder().encode(message)
    );
  } catch {
    return false;
  }
}

export function b64ToBytes(b64) {
  return Buffer.from(b64, 'base64');
}

export function bytesToB64(buf) {
  return Buffer.from(buf).toString('base64');
}

// Stable key order for anything we re-hash server side.
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
