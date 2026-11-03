/**
 * Mezoteric Local-First Storage (IndexedDB)
 * 
 * Manages local persistence for:
 * 1. User Identity & Encrypted Key Vault
 * 2. Decrypted Message History (DMs & Channels)
 * 3. Offline Outbox (queues messages when school Wi-Fi or MTN internet flaps)
 * 4. School Documents (notes, study materials, report cards) for offline viewing
 */

const DB_NAME = 'mezoteric_app';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('msgs')) {
        const s = db.createObjectStore('msgs', { keyPath: 'id' });
        s.createIndex('conv', 'conv');
      }
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try {
        out = fn(s);
      } catch (err) {
        reject(err);
        return;
      }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  });
}

export const idb = {
  get: (store, k) => tx(store, 'readonly', (s) => s.get(k)),
  set: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  del: (store, k) => tx(store, 'readwrite', (s) => s.delete(k)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  allByIndex: (store, index, value) => tx(store, 'readonly', (s) => s.index(index).getAll(value)),
};

// ---- Key/Value Settings ----
export async function kvGet(key, fallback = null) {
  try {
    const row = await idb.get('kv', key);
    return row ? row.v : fallback;
  } catch {
    return fallback;
  }
}

export async function kvSet(key, value) {
  try {
    return await idb.set('kv', { k: key, v: value });
  } catch (e) {
    console.warn('kvSet error', e);
  }
}

export async function kvDel(key) {
  try {
    return await idb.del('kv', key);
  } catch (e) {
    console.warn('kvDel error', e);
  }
}

// ---- Identity & Vault ----
export async function loadIdentity() {
  return kvGet('identity', null);
}

export async function saveIdentity(identity) {
  return kvSet('identity', identity);
}

export async function clearLocalAccount() {
  for (const s of ['kv', 'msgs', 'outbox', 'docs', 'meta']) {
    try {
      await idb.clear(s);
    } catch {
      /* ignore */
    }
  }
}

// ---- Messages ----
export async function putMessage(msg) {
  try {
    await idb.set('msgs', msg);
  } catch (e) {
    console.warn('message save failed', e);
  }
}

export async function loadMessages(conv) {
  try {
    return (await idb.allByIndex('msgs', 'conv', conv)) || [];
  } catch {
    return [];
  }
}

export async function loadAllMessages() {
  try {
    return (await idb.all('msgs')) || [];
  } catch {
    return [];
  }
}

export async function deleteMessage(id) {
  return idb.del('msgs', id);
}

// ---- Offline Outbox Queue ----
export async function queueOut(op) {
  return idb.set('outbox', op);
}

export async function listOutbox() {
  try {
    return (await idb.all('outbox')) || [];
  } catch {
    return [];
  }
}

export async function dropOut(id) {
  return idb.del('outbox', id);
}

// ---- School Documents & Report Cards ----
export async function putDoc(doc) {
  try {
    await idb.set('docs', doc);
  } catch (e) {
    console.warn('doc save failed', e);
  }
}

export async function loadDocs() {
  try {
    return (await idb.all('docs')) || [];
  } catch {
    return [];
  }
}
