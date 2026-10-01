// Unsaved floorplan drafts of this browser, in IndexedDB (no 5 MB limit, never in localStorage; AGENTS.md §28).
// Used only as a safety net: when a save could not reach the server, the canvas is kept here and offered again the
// next time that floorplan is opened. The server stays the only source of truth.
const DB_NAME = 'floorplan_local';
const STORE = 'drafts';
const MAX_DRAFTS = 5;
const MAX_AGE_MS = 14 * 86400000;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB tidak tersedia')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB terkunci'));
  });
}

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keep the payload of a save that did not reach the server. Never throws; returns true when kept. */
export async function keepDraft(id, payload, reason = '') {
  if (!id) return false;
  try {
    await run('readwrite', store => store.put({ id: String(id), savedAt: Date.now(), reason, payload }));
    await pruneDrafts();
    return true;
  } catch (e) {
    return false;
  }
}

export async function readDraft(id) {
  if (!id) return null;
  try {
    const draft = await run('readonly', store => store.get(String(id)));
    return draft && Date.now() - draft.savedAt < MAX_AGE_MS ? draft : null;
  } catch (e) {
    return null;
  }
}

export async function dropDraft(id) {
  if (!id) return;
  try { await run('readwrite', store => store.delete(String(id))); } catch (e) { /* nothing kept */ }
}

// At most MAX_DRAFTS, none older than MAX_AGE_MS
export async function pruneDrafts() {
  try {
    const all = (await run('readonly', store => store.getAll())) || [];
    const sorted = all.sort((a, b) => b.savedAt - a.savedAt);
    const stale = sorted.filter((d, i) => i >= MAX_DRAFTS || Date.now() - d.savedAt >= MAX_AGE_MS);
    if (stale.length) await run('readwrite', store => { stale.forEach(d => store.delete(d.id)); });
  } catch (e) { /* nothing to prune */ }
}
