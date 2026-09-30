// Login session storage + authenticated fetch for the API.
import { reportUnreachable, flushQueuedReports, queuedReportsPending } from './errorReporter';

const STORAGE_KEY = 'expo_auth_session';

// Also kept in memory: when the browser blocks site storage (privacy settings, some private modes) the session
// still works in this tab instead of silently sending API calls without a token ("Silakan login terlebih dahulu").
let memorySession = null;
let storageBlocked = false;

// Expiry measured on this computer's own clock (login time + session length). Comparing the server's expiresAt
// with a computer whose date / time is wrong threw fresh sessions away right after login. The server stays the
// authority: an expired or revoked token is answered with 401 "Sesi login sudah berakhir" and cleared below.
const isExpired = (session) => Number.isFinite(session?.localExpiresAt) && Date.now() > session.localExpiresAt;

export function getSession() {
  let session = memorySession;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) session = JSON.parse(raw);
  } catch (e) {
    // storage blocked or corrupt: use the in-memory session
  }
  if (session && isExpired(session)) {
    clearSession();
    return null;
  }
  return session;
}

export function saveSession(session) {
  memorySession = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    storageBlocked = localStorage.getItem(STORAGE_KEY) === null;
  } catch (e) {
    storageBlocked = true;
  }
}

// true when the browser refused to store the session: it only lasts until this tab is reloaded / closed
export const isStorageBlocked = () => storageBlocked;

export function clearSession() {
  memorySession = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

// Adds the bearer token to every API call. A 401 on a request that carried a token means the
// session was revoked or expired: drop it and let the app send the user back to the login page.
export async function apiFetch(url, options = {}) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (error) {
    // Server unreachable (down / network): noted for the Pusat Maintenance, sent once the server is back
    if (!options.signal?.aborted) reportUnreachable(url, error);
    throw error;
  }
  if (queuedReportsPending()) flushQueuedReports();
  if (res.status === 401 && session?.token) {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return res;
}
