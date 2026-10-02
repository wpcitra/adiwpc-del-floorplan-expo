import crypto from 'crypto';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { appVersion } from './appVersion.js';

// Error tracking for the Pusat Maintenance (AGENTS.md §22).
//   - Server errors are captured from console.error(Error), 5xx responses, the Express error handler and crashes.
//   - Browser errors arrive through POST /api/errors/report.
//   - Everything is scrubbed (passwords, tokens, API keys, emails, phone numbers, NPWP, long numbers, query strings)
//     BEFORE it is stored. Users are stored only as masked references ("U-3f9a1c20"), never id / email / IP.
//   - Errors are grouped by fingerprint (type + normalized message + first app stack frame) and prioritized:
//     KRITIS (login, pembayaran, invoice, pemesanan booth, website tidak bisa diakses), TINGGI (Studio, Data
//     Exhibitor, Dashboard), NORMAL (lainnya). New / returning KRITIS and TINGGI errors notify Developer + Super Admin.
// Recording never throws: a failure inside the tracker must not break the request that failed.

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_EVENTS_PER_GROUP = 100;
const EVENT_RETENTION_DAYS = 90;
const RENOTIFY_HOURS = 6;
export const PRIORITIES = ['KRITIS', 'TINGGI', 'NORMAL'];
export const ERROR_STATUSES = ['baru', 'ditangani', 'selesai', 'diabaikan'];

// Request context (method, path, user) for errors logged anywhere while a request is handled
export const requestContext = new AsyncLocalStorage();

// ---------------------------------------------------------------------------------------------------------------
// Scrubbing: personal data and secrets never reach the database
// ---------------------------------------------------------------------------------------------------------------
const SCRUBBERS = [
  [/sk-ant-[A-Za-z0-9_-]+/g, '[api-key]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [token]'],
  [/(["']?(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|x-api-key|password_hash|token_hash)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi, '$1[disamarkan]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, '[npwp]'],
  [/(?<![\w.:/-])(?:\+62|62|0)8\d{7,12}\b/g, '[telepon]'],
  [/\b[a-f0-9]{32,}\b/gi, '[token]'],
  [/\b\d{10,}\b/g, '[angka]']
];

export function scrubText(value, max = MAX_MESSAGE) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  SCRUBBERS.forEach(([re, rep]) => { text = text.replace(re, rep); });
  // Local paths: keep project-relative paths only (no home folder / username)
  text = text.split(PROJECT_ROOT + path.sep).join('').split(PROJECT_ROOT).join('');
  text = text.replace(/https?:\/\/[^/\s)]+\//g, '/'); // browser stacks: drop the origin
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// URL -> path only (query strings carry emails, tokens, search terms)
export const scrubUrl = (url) => scrubText(String(url || '').split(/[?#]/)[0], 300);

// ---------------------------------------------------------------------------------------------------------------
// Masked user references
// ---------------------------------------------------------------------------------------------------------------
let maskSalt = null;
function getMaskSalt() {
  if (maskSalt) return maskSalt;
  try {
    const row = db.prepare("SELECT value FROM maintenance_settings WHERE key = 'mask_salt'").get();
    maskSalt = row?.value;
    if (!maskSalt) {
      maskSalt = crypto.randomBytes(16).toString('hex');
      db.prepare("INSERT OR REPLACE INTO maintenance_settings (key, value) VALUES ('mask_salt', ?)").run(maskSalt);
    }
  } catch (e) {
    maskSalt = crypto.randomBytes(16).toString('hex');
  }
  return maskSalt;
}
const maskHash = (value) => crypto.createHash('sha256').update(`${getMaskSalt()}:${value}`).digest('hex').slice(0, 8);
// Logged-in user -> "U-xxxxxxxx"; anonymous visitor -> "V-xxxxxxxx" (from IP + browser, only to count distinct visitors)
export const maskUser = (userId) => (userId ? `U-${maskHash(`user:${userId}`)}` : '');
export const maskVisitor = (ip, userAgent) => (ip || userAgent ? `V-${maskHash(`visitor:${ip}|${userAgent}`)}` : '');

export function browserLabel(userAgent = '') {
  const ua = String(userAgent);
  const browser = (ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/(\d+)/) || [])[0]?.replace('Edg', 'Edge').replace('OPR', 'Opera') || '';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  if (/^(curl|node|undici)/i.test(ua)) return ua.split(' ')[0].slice(0, 30);
  return [browser, os].filter(Boolean).join(' · ') || 'Tidak diketahui';
}

// ---------------------------------------------------------------------------------------------------------------
// Priority by area (API route or browser page)
// ---------------------------------------------------------------------------------------------------------------
const AREA_RULES = [
  // KRITIS
  { re: /^\/api\/auth\//, priority: 'KRITIS', feature: 'Login' },
  { re: /^\/login\b/, priority: 'KRITIS', feature: 'Login' },
  { re: /^\/api\/(orders|exhibitors)\/checkout/, priority: 'KRITIS', feature: 'Pemesanan booth' },
  { re: /^\/api\/invoices/, priority: 'KRITIS', feature: 'Invoice & pembayaran' },
  { re: /^\/api\/booth-actions/, priority: 'KRITIS', feature: 'Aksi booth Sales (booking, diskon, invoice)' },
  { re: /^\/api\/payment-methods/, priority: 'KRITIS', feature: 'Pembayaran' },
  { re: /^\/admin\/invoices/, priority: 'KRITIS', feature: 'Invoice & pembayaran' },
  { re: /^\/(live\/[^/]+|portal)?\/?$/, priority: 'KRITIS', feature: 'Live Floorplan & pemesanan booth' },
  { re: /^\/api\/floorplan\/(active|events)$/, priority: 'KRITIS', feature: 'Live Floorplan & pemesanan booth' },
  // TINGGI
  { re: /^\/(api\/floorplan|admin\/floorplan)/, priority: 'TINGGI', feature: 'Floorplan Studio' },
  { re: /^\/api\/(template-prices|categories)/, priority: 'TINGGI', feature: 'Harga booth & katalog template' },
  { re: /^\/(api\/(orders|exhibitors|tenants)|admin\/exhibitors)/, priority: 'TINGGI', feature: 'Data Exhibitor' },
  { re: /^\/(api\/stats|admin\/analytics)/, priority: 'TINGGI', feature: 'Dashboard' },
  // NORMAL (named for readability)
  { re: /^\/(api\/ops|admin\/ops)/, priority: 'NORMAL', feature: 'Denah Operasional' },
  { re: /^\/(api\/facilities|admin\/facilities|facility-request)/, priority: 'NORMAL', feature: 'Fasilitas tambahan' },
  { re: /^\/(api\/users|admin\/users)/, priority: 'NORMAL', feature: 'Manajemen user' },
  { re: /^\/(api\/audit-logs|admin\/audit)/, priority: 'NORMAL', feature: 'Audit' },
  { re: /^\/(api\/(categories|brand-categories)|admin\/settings)/, priority: 'NORMAL', feature: 'Pengaturan' },
  { re: /^\/(api\/maintenance|admin\/maintenance)/, priority: 'NORMAL', feature: 'Pusat Maintenance' }
];
// Errors that break the whole website regardless of where they happen
const SITE_DOWN_RE = /SQLITE_(CORRUPT|FULL|CANTOPEN|NOTADB|IOERR)|EADDRINUSE|ENOSPC|out of memory/i;

export function classify(area, { kind = '', message = '' } = {}) {
  if (kind === 'crash' || kind === 'unreachable') return { priority: 'KRITIS', feature: 'Website tidak bisa diakses' };
  if (SITE_DOWN_RE.test(message)) return { priority: 'KRITIS', feature: 'Website tidak bisa diakses' };
  const rule = AREA_RULES.find(r => r.re.test(area || ''));
  return rule ? { priority: rule.priority, feature: rule.feature } : { priority: 'NORMAL', feature: 'Lainnya' };
}

// ---------------------------------------------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------------------------------------------
const normalizeMessage = (msg) => String(msg || '')
  .replace(/(["'`]).*?\1/g, '…')
  .replace(/\b[0-9a-f]{8,}\b/gi, '#')
  .replace(/\d+/g, '#')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 300);

// First stack frame inside the app (not node_modules / node internals): "server/src/routes/x.js:fnName"
export function topFrame(stack) {
  const lines = String(stack || '').split('\n').slice(1);
  for (const line of lines) {
    if (/node_modules|node:internal|\(native\)|<anonymous>/.test(line)) continue;
    const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/) || line.match(/^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/);
    if (!m) continue;
    const file = scrubText(m[2], 200).replace(/^file:\/\//, '').replace(/^\/+/, '').replace(/\?.*$/, '');
    const fn = (m[1] || '').replace(/^async\s+/, '').trim();
    return `${file}${fn ? `:${fn}` : ''}`;
  }
  return '';
}

const fingerprintOf = ({ source, errorType, message, location, area }) => crypto.createHash('sha256')
  .update([source, errorType, normalizeMessage(message), location || area || ''].join('|'))
  .digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------------------------------------------
// Notifications to Developer + Super Admin (in-app bell)
// ---------------------------------------------------------------------------------------------------------------
function notifyMaintainers(group, reason) {
  try {
    const users = db.prepare("SELECT id FROM users WHERE role IN ('superadmin', 'developer') AND is_active = 1").all();
    const title = `${reason === 'reopened' ? 'Error muncul lagi' : 'Error baru'} ${group.priority}: ${group.feature || 'Website'}`;
    const body = `${group.message.slice(0, 160)}${group.message.length > 160 ? '…' : ''} (${group.occurrences}x). Buka Pusat Maintenance untuk meninjau.`;
    const link = `/admin/maintenance?error=${encodeURIComponent(group.id)}`;
    const insert = db.prepare(`
      INSERT INTO notifications (user_id, type, floorplan_id, title, body, link, meta_json)
      VALUES (?, 'error_alert', NULL, ?, ?, ?, ?)
    `);
    users.forEach(u => insert.run(u.id, title, body, link, JSON.stringify({ errorId: group.id, priority: group.priority })));
    db.prepare('UPDATE error_groups SET last_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(group.id);
  } catch (e) {
    // no console.error here: it would be captured again
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------------------------------------------
let recording = false;
let insertsSincePrune = 0;

/**
 * Store one error occurrence.
 *   source: 'server' | 'browser'
 *   kind: 'exception' | 'response' | 'crash' | 'unreachable' | 'react' | 'rejection' | 'error'
 *   area: API path ("/api/orders/checkout") or browser page ("/admin/invoices")
 *   user: { id, role } of the logged-in user (masked here), or visitor { ip, userAgent }
 *   allowNewGroup: false drops occurrences that would create a new group (flood guard of the public report endpoint)
 */
export function recordError({
  source = 'server', kind = 'exception', errorType = 'Error', message = '', stack = '', area = '', method = '',
  statusCode = null, user = null, visitor = null, userAgent = '', context = null, allowNewGroup = true
} = {}) {
  if (recording) return null;
  recording = true;
  try {
    const cleanMessage = scrubText(message || errorType || 'Error tanpa pesan') || 'Error tanpa pesan';
    const cleanStack = scrubText(stack, MAX_STACK);
    const cleanArea = scrubUrl(area);
    const location = topFrame(stack);
    const { priority, feature } = classify(cleanArea, { kind, message: cleanMessage });
    // An outage is one problem, whatever page or endpoint noticed it
    const fingerprint = kind === 'unreachable'
      ? fingerprintOf({ source, errorType: 'unreachable', message: 'server-unreachable', location: '', area: '' })
      : fingerprintOf({ source, errorType, message: cleanMessage, location, area: cleanArea });
    const id = `ERR-${fingerprint.slice(0, 10).toUpperCase()}`;
    const userRef = user?.id ? maskUser(user.id) : (visitor ? maskVisitor(visitor.ip, visitor.userAgent) : '');
    const environment = process.env.APP_ENV || 'production';
    const version = appVersion();
    const safeContext = context ? scrubText(JSON.stringify(context), 2000) : null;

    let notify = null;
    const group = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM error_groups WHERE fingerprint = ?').get(fingerprint);
      if (!existing && !allowNewGroup) return null; // public report flood guard
      if (!existing) {
        db.prepare(`
          INSERT INTO error_groups (id, fingerprint, source, error_type, message, location, area, feature, priority, status,
            occurrences, sample_stack, environment, app_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'baru', 1, ?, ?, ?)
        `).run(id, fingerprint, source, scrubText(errorType, 80), cleanMessage, location, cleanArea, feature, priority, cleanStack, environment, version);
        if (priority !== 'NORMAL') notify = 'new';
      } else {
        // A fixed error that happens again is re-opened; an ignored one stays ignored (still counted)
        const reopened = existing.status === 'selesai';
        db.prepare(`
          UPDATE error_groups SET occurrences = occurrences + 1, last_seen_at = CURRENT_TIMESTAMP,
            status = CASE WHEN status = 'selesai' THEN 'baru' ELSE status END,
            reopened_count = reopened_count + ?, app_version = ?, environment = ?,
            sample_stack = CASE WHEN ? != '' THEN ? ELSE sample_stack END
          WHERE id = ?
        `).run(reopened ? 1 : 0, version, environment, cleanStack, cleanStack, existing.id);
        const stale = !existing.last_notified_at || (Date.now() - new Date(`${existing.last_notified_at.replace(' ', 'T')}Z`).getTime()) > RENOTIFY_HOURS * 3600000;
        if (existing.priority !== 'NORMAL' && existing.status !== 'diabaikan' && (reopened || (stale && existing.status === 'baru'))) {
          notify = reopened ? 'reopened' : 'new';
        }
      }
      const groupId = existing?.id || id;
      db.prepare(`
        INSERT INTO error_events (group_id, user_ref, user_role, method, url, status_code, browser, app_version, environment, stack, context_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(groupId, userRef, user?.role || '', method || '', cleanArea, statusCode, browserLabel(userAgent), version, environment, cleanStack, safeContext);
      if (userRef) {
        const added = db.prepare('INSERT OR IGNORE INTO error_group_users (group_id, user_ref) VALUES (?, ?)').run(groupId, userRef).changes;
        if (added) db.prepare('UPDATE error_groups SET affected_users = affected_users + 1 WHERE id = ?').run(groupId);
      }
      return db.prepare('SELECT * FROM error_groups WHERE id = ?').get(groupId);
    })();

    if (!group) return null;
    if (notify) notifyMaintainers(group, notify);
    if (++insertsSincePrune >= 200) { insertsSincePrune = 0; pruneErrorEvents(); }
    return group;
  } catch (e) {
    return null;
  } finally {
    recording = false;
  }
}

export function pruneErrorEvents() {
  try {
    db.prepare(`DELETE FROM error_events WHERE occurred_at < datetime('now', ?)`).run(`-${EVENT_RETENTION_DAYS} days`);
    db.prepare(`
      DELETE FROM error_events WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY id DESC) AS rn FROM error_events
        ) WHERE rn > ?
      )
    `).run(MAX_EVENTS_PER_GROUP);
  } catch (e) {}
}

// ---------------------------------------------------------------------------------------------------------------
// Server capture
// ---------------------------------------------------------------------------------------------------------------
const requestInfo = () => {
  const ctx = requestContext.getStore();
  const req = ctx?.req;
  if (!req) return { area: '(latar belakang server)' };
  return {
    area: ctx.path,
    method: req.method,
    user: req.user || req.restrictedUser || null,
    visitor: req.user || req.restrictedUser ? null : { ip: req.socket?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' },
    userAgent: req.headers['user-agent'] || '',
    ctx
  };
};

function recordServerError(err, extra = {}) {
  const info = requestInfo();
  if (info.ctx) info.ctx.errorRecorded = true;
  return recordError({
    source: 'server',
    kind: extra.kind || 'exception',
    errorType: err?.name || 'Error',
    message: err?.message || String(err),
    stack: err?.stack || '',
    area: info.area,
    method: info.method,
    user: info.user,
    visitor: info.visitor,
    userAgent: info.userAgent,
    statusCode: extra.statusCode || null
  });
}

// Middleware (first in the chain): request context + fallback capture of 5xx responses without a logged Error
export function errorCaptureMiddleware(req, res, next) {
  // Path fixed here: inside a router req.path is relative to that router ("/save" instead of "/floorplan/save")
  const ctx = { req, path: `/api${(req.path || '').replace(/\/+$/, '')}`, errorRecorded: false, responseError: '' };
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object') ctx.responseError = String(body.error || body.message || '');
    return originalJson(body);
  };
  res.on('finish', () => {
    if (res.statusCode < 500 || ctx.errorRecorded) return;
    recordError({
      source: 'server', kind: 'response', errorType: `HTTP ${res.statusCode}`,
      message: ctx.responseError || `Server merespons ${res.statusCode}`,
      area: ctx.path, method: req.method, statusCode: res.statusCode,
      user: req.user || req.restrictedUser || null,
      visitor: req.user || req.restrictedUser ? null : { ip: req.socket?.remoteAddress || '', userAgent: req.headers['user-agent'] || '' },
      userAgent: req.headers['user-agent'] || ''
    });
  });
  requestContext.run(ctx, next);
}

// Express error handler (last): thrown errors / next(err). Client mistakes (bad JSON, too large) are not errors of the site.
// eslint-disable-next-line no-unused-vars
export function expressErrorHandler(err, req, res, next) {
  const status = err?.status || err?.statusCode || 500;
  if (status < 500) {
    return res.status(status).json({ success: false, error: status === 413 ? 'Data yang dikirim terlalu besar' : 'Permintaan tidak valid' });
  }
  recordServerError(err, { statusCode: 500 });
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server. Tim teknis sudah menerima laporan otomatis.' });
}

// console.error(..., Error, ...) anywhere in the server is recorded (routes log their caught errors this way)
let installed = false;
export function installErrorCapture() {
  if (installed) return;
  installed = true;
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    if (recording) return;
    const err = args.find(a => a instanceof Error);
    if (err) recordServerError(err);
  };
  // Crashes: recorded synchronously before Node's default handling (the process still exits as before)
  process.on('uncaughtExceptionMonitor', (err, origin) => {
    recordError({
      source: 'server', kind: 'crash', errorType: err?.name || 'Error',
      message: `${origin === 'unhandledRejection' ? 'Promise ditolak tanpa penanganan' : 'Server berhenti'}: ${err?.message || err}`,
      stack: err?.stack || '', area: requestInfo().area
    });
  });
}
