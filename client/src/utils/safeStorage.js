// Browser storage rules (AGENTS.md §28):
//   - localStorage holds SMALL preferences only (open folders, toggles, recent colours, the session). It is limited
//     to about 5 MB per site; Safari counts 2 bytes per character.
//   - Floorplan data, images and settings live on the server. Nothing large is mirrored in the browser.
//   - Every write goes through safeSet(): a full or blocked storage never stops the action that triggered it.
export const STORAGE_FULL_MESSAGE = 'Penyimpanan browser penuh. Data tetap tersimpan di server.';

export const isQuotaError = (e) => Boolean(e) && (
  e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 ||
  /quota/i.test(String(e.message || ''))
);

/** Readable Indonesian message for an error shown to the user (a raw "The quota has been exceeded." never is). */
export const friendlyError = (e, fallback = 'Terjadi kesalahan.') => (isQuotaError(e) ? STORAGE_FULL_MESSAGE : (e?.message || fallback));

export function safeGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function safeGetJson(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

// Largest value written to localStorage (characters). Anything bigger belongs on the server or in IndexedDB.
export const MAX_LOCAL_VALUE = 200 * 1024;

/** Returns true when stored. Never throws; a value above `maxSize` is not written at all. */
export function safeSet(key, value, { maxSize = MAX_LOCAL_VALUE } = {}) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.length > maxSize) return false;
    localStorage.setItem(key, text);
    return true;
  } catch (e) {
    return false;
  }
}

export function safeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
}

// Keys written by older versions: full copies of the floorplan canvas (with base64 images), the invoice layout
// (with logo / signature) and an offline exhibitor list. They filled the 5 MB quota and are no longer read.
export const LEGACY_KEYS = [
  'published_floorplan_fabric', 'published_floorplan_data', 'floorplan_draft_fabric', 'floorplan_draft_data',
  'invoice_template_config', 'registered_exhibitors'
];

/** Size of every key in this browser's storage, largest first: [{ key, chars, approxBytes }] (2 bytes per character). */
export function storageReport(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const rows = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const chars = key.length + (storage.getItem(key) || '').length;
      rows.push({ key, chars, approxBytes: chars * 2 });
    }
  } catch (e) { /* storage blocked */ }
  return rows.sort((a, b) => b.chars - a.chars);
}
