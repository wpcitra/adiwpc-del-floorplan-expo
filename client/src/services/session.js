// Login session storage + authenticated fetch for the API.
const STORAGE_KEY = 'expo_auth_session';

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (session?.expiresAt && new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

export function saveSession(session) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) {}
}

export function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

// Adds the bearer token to every API call. A 401 on a request that carried a token means the
// session was revoked or expired: drop it and let the app send the user back to the login page.
export async function apiFetch(url, options = {}) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && session?.token) {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return res;
}
