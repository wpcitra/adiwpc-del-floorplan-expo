// Browser error reporting for the Pusat Maintenance (AGENTS.md §22).
// Sends uncaught errors, unhandled promise rejections, React render crashes and "server unreachable" events to
// POST /api/errors/report. Only the message, stack and page PATH are sent: no query string, no form data, no
// user data (the server identifies a logged-in user from the session and stores a masked reference only).
// Reports made while the server is unreachable wait in localStorage and are sent once it is back.
import { getSession } from './session';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const QUEUE_KEY = 'expo_error_queue';
const MAX_QUEUE = 20;
const MAX_REPORTS_PER_PAGE = 25;
const SAME_ERROR_LIMIT = 3;

let sentCount = 0;
const seen = new Map();

// Noise that is not an error of this website (browser extensions, cross-origin scripts, benign layout warnings)
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i, /Non-Error promise rejection captured/i];

const currentPage = () => window.location.pathname || '/';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function writeQueue(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE))); } catch (e) {}
}

async function send(report) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getSession()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/errors/report`, { method: 'POST', headers, body: JSON.stringify(report), keepalive: true });
  return res.ok || res.status === 429 || res.status === 400; // 429 / 400: drop, never retry
}

export const queuedReportsPending = () => {
  try { return Boolean(localStorage.getItem(QUEUE_KEY)) && readQueue().length > 0; } catch (e) { return false; }
};

let flushing = false;
export async function flushQueuedReports() {
  if (flushing) return;
  const queue = readQueue();
  if (!queue.length) return;
  flushing = true;
  try {
    const rest = [];
    for (const report of queue) {
      try { if (!(await send({ ...report, queued: true }))) rest.push(report); } catch (e) { rest.push(report); break; }
    }
    writeQueue(rest.concat(readQueue().slice(queue.length)));
  } finally {
    flushing = false;
  }
}

export function reportError(error, { kind = 'error', componentStack = '' } = {}) {
  try {
    const message = String(error?.message || error || '').slice(0, 2000);
    if (!message || IGNORED.some(re => re.test(message))) return;
    const key = `${kind}|${message}`;
    const times = (seen.get(key) || 0) + 1;
    seen.set(key, times);
    if (times > SAME_ERROR_LIMIT || sentCount >= MAX_REPORTS_PER_PAGE) return;
    sentCount += 1;
    const report = {
      kind,
      errorType: error?.name || 'Error',
      message,
      stack: String(error?.stack || '').slice(0, 10000),
      componentStack: String(componentStack || '').slice(0, 3000),
      page: currentPage(),
      occurredAt: new Date().toISOString()
    };
    send(report).catch(() => writeQueue([...readQueue(), report]));
  } catch (e) {
    // reporting must never break the page
  }
}

// apiFetch calls this when the API cannot be reached at all (server down / network): queued until it is back
let lastUnreachableAt = 0;
export function reportUnreachable(url, error) {
  const now = Date.now();
  if (now - lastUnreachableAt < 60000) return; // one report per minute is enough
  lastUnreachableAt = now;
  let endpoint = '';
  try { endpoint = new URL(url, window.location.origin).pathname; } catch (e) {}
  writeQueue([...readQueue(), {
    kind: 'unreachable',
    errorType: 'NetworkError',
    message: `${endpoint || 'API'} (${error?.message || 'gagal terhubung'})`,
    stack: '',
    page: currentPage(),
    occurredAt: new Date().toISOString()
  }]);
}

let installed = false;
export function installErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    // resource load failures (img/script) have no error object: not reported
    if (event.error || event.message) reportError(event.error || new Error(event.message), { kind: 'error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason ?? 'Promise ditolak'));
    reportError(reason, { kind: 'rejection' });
  });
  window.addEventListener('online', () => { flushQueuedReports(); });
  setTimeout(() => { flushQueuedReports(); }, 3000);
}
