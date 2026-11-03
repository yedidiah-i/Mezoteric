// Small helpers shared by core modules and views. Kept side-effect-free so the
// Node integration test runner can also use them.

/** Random bytes encoded as base64url (no padding). */
export function randomId (bytes = 9) {
  const src = new Uint8Array(bytes);
  crypto.getRandomValues(src);
  return toBase64url(src);
}

export function toBase64url (src) {
  const u8 = src instanceof Uint8Array ? src : new Uint8Array(src);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i];
    const b = i + 1 < u8.length ? u8[i + 1] : 0;
    const c = i + 2 < u8.length ? u8[i + 2] : 0;
    out += chars[a >>> 2];
    out += chars[((a & 0x3) << 4) | (b >>> 4)];
    if (i + 1 < u8.length) out += chars[((b & 0xf) << 2) | (c >>> 6)];
    if (i + 2 < u8.length) out += chars[c & 0x3f];
  }
  return out;
}

export function fromBase64url(str) {
  if (!str) return new Uint8Array(0);
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = Buffer.from(s, 'base64');
  return new Uint8Array(bin);
}

/** Hex id (10 hex chars ≈ 40 bits). */
export function hexId () {
  const src = new Uint8Array(5);
  crypto.getRandomValues(src);
  let out = '';
  for (let i = 0; i < src.length; i++) {
    out += src[i].toString(16).padStart(2, '0');
  }
  return out.slice(0, 10);
}

/** Random 32-byte AES-256 key (Uint8Array). */
export function randomAesKey () {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
}

/** SHA-256 hex digest. */
export async function sha256Hex (message) {
  const data = message instanceof Uint8Array ? message : new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Pick a display name from a directory record, falling back to the id. */
export function peerName (id, directory = {}) {
  const rec = directory[id];
  return rec && rec.name ? rec.name : '???';
}

/** Clean a user id for display (last segment after the final '/'). */
export function userSnippet (id) {
  return id && id.lastIndexOf('/') === -1 ? id : id.split('/').pop();
}

/** Pretty bytes. */
export function fmtBytes (bytes) {
  if (bytes == null || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
}

/** Stable sort comparator by property descending. */
export function by (prop, fallback = null) {
  return (a, b) => {
    const av = a && a[prop] != null ? a[prop] : fallback;
    const bv = b && b[prop] != null ? b[prop] : fallback;
    if (av < bv) return 1;
    if (av > bv) return -1;
    return 0;
  };
}
