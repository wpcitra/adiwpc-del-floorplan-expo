import express from 'express';
import db from '../db.js';
import { recordError, ERROR_STATUSES, PRIORITIES } from '../utils/errorTracker.js';
import { clientIp } from '../middleware/auth.js';

// Pusat Maintenance (AGENTS.md §22)
//   POST /api/errors/report                 browser error reports (public, rate limited, scrubbed server-side)
//   GET  /api/maintenance/errors            error groups + summary          (Developer / Super Admin)
//   GET  /api/maintenance/errors/:id        one group with recent events
//   POST /api/maintenance/errors/:id/status baru | ditangani | selesai | diabaikan (audited)
export const reportRouter = express.Router();
const router = express.Router();

const REPORT_KINDS = ['error', 'rejection', 'react', 'unreachable'];
const REPORTS_PER_MINUTE = 30;
const NEW_BROWSER_GROUPS_PER_HOUR = 60;
const reportWindows = new Map();

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

reportRouter.post('/report', (req, res) => {
  req.skipAudit = true;
  // Rate limit per IP: a broken page in a loop (or a spammer) cannot flood the error list
  const ip = clientIp(req);
  const now = Date.now();
  const win = reportWindows.get(ip);
  if (!win || now - win.start > 60000) reportWindows.set(ip, { start: now, count: 1 });
  else if (++win.count > REPORTS_PER_MINUTE) return res.status(429).json({ success: false, error: 'Terlalu banyak laporan' });
  if (reportWindows.size > 5000) reportWindows.clear();

  const b = req.body || {};
  const message = str(b.message, 2000);
  if (!message) return res.status(400).json({ success: false, error: 'Pesan error kosong' });
  const kind = REPORT_KINDS.includes(b.kind) ? b.kind : 'error';

  // Public endpoint: cap the number of NEW browser error groups per hour
  const recentNew = db.prepare(`SELECT COUNT(*) AS c FROM error_groups WHERE source = 'browser' AND first_seen_at > datetime('now', '-1 hour')`).get().c;
  const user = req.user || req.restrictedUser || null;
  const group = recordError({
    source: 'browser',
    kind,
    errorType: str(b.errorType, 80) || (kind === 'unreachable' ? 'NetworkError' : 'Error'),
    message: kind === 'unreachable' ? `Website tidak dapat menghubungi server: ${message}` : message,
    stack: [str(b.stack, 10000), b.componentStack ? `Komponen React:${str(b.componentStack, 3000)}` : ''].filter(Boolean).join('\n'),
    area: str(b.page, 300) || '/',
    user,
    visitor: user ? null : { ip, userAgent: req.headers['user-agent'] || '' },
    userAgent: req.headers['user-agent'] || '',
    context: { kind, occurredAt: str(b.occurredAt, 40), offlineQueued: Boolean(b.queued) },
    allowNewGroup: recentNew < NEW_BROWSER_GROUPS_PER_HOUR
  });
  res.json({ success: true, id: group?.id || null });
});

// ---------------------------------------------------------------------------------------------------------------
const toGroup = (g) => ({
  id: g.id,
  source: g.source,
  errorType: g.error_type,
  message: g.message,
  location: g.location,
  area: g.area,
  feature: g.feature,
  priority: g.priority,
  status: g.status,
  statusNote: g.status_note,
  statusBy: g.status_by,
  statusAt: g.status_at,
  occurrences: g.occurrences,
  affectedUsers: g.affected_users,
  reopenedCount: g.reopened_count,
  environment: g.environment,
  appVersion: g.app_version,
  firstSeenAt: g.first_seen_at,
  lastSeenAt: g.last_seen_at
});

const PRIORITY_ORDER = "CASE priority WHEN 'KRITIS' THEN 0 WHEN 'TINGGI' THEN 1 ELSE 2 END";

router.get('/errors', (req, res) => {
  const { status = 'aktif', priority = 'all', source = 'all', q = '' } = req.query;
  const where = [];
  const params = [];
  if (status === 'aktif') where.push("status IN ('baru', 'ditangani')");
  else if (ERROR_STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
  if (PRIORITIES.includes(priority)) { where.push('priority = ?'); params.push(priority); }
  if (['server', 'browser'].includes(source)) { where.push('source = ?'); params.push(source); }
  if (String(q).trim()) {
    where.push('(message LIKE ? OR area LIKE ? OR feature LIKE ? OR location LIKE ? OR id LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like, like, like);
  }
  const rows = db.prepare(`
    SELECT * FROM error_groups ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE status WHEN 'baru' THEN 0 WHEN 'ditangani' THEN 1 ELSE 2 END, ${PRIORITY_ORDER}, last_seen_at DESC
    LIMIT 300
  `).all(...params);

  const open = { KRITIS: 0, TINGGI: 0, NORMAL: 0 };
  db.prepare("SELECT priority, COUNT(*) AS c FROM error_groups WHERE status IN ('baru', 'ditangani') GROUP BY priority").all()
    .forEach(r => { open[r.priority] = r.c; });
  const counts = Object.fromEntries(ERROR_STATUSES.map(s => [s, 0]));
  db.prepare('SELECT status, COUNT(*) AS c FROM error_groups GROUP BY status').all().forEach(r => { counts[r.status] = r.c; });
  const last24h = db.prepare("SELECT COUNT(*) AS c FROM error_events WHERE occurred_at > datetime('now', '-1 day')").get().c;

  res.json({ success: true, errors: rows.map(toGroup), summary: { open, counts, last24h } });
});

router.get('/errors/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM error_groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ success: false, error: 'Error tidak ditemukan' });
  const events = db.prepare(`
    SELECT id, occurred_at, user_ref, user_role, method, url, status_code, browser, app_version, environment, context_json
    FROM error_events WHERE group_id = ? ORDER BY id DESC LIMIT 50
  `).all(g.id);
  const daily = db.prepare(`
    SELECT date(occurred_at) AS day, COUNT(*) AS c FROM error_events
    WHERE group_id = ? AND occurred_at > datetime('now', '-14 days') GROUP BY day ORDER BY day
  `).all(g.id);
  res.json({
    success: true,
    error: { ...toGroup(g), stack: g.sample_stack },
    daily,
    events: events.map(e => ({
      id: e.id, occurredAt: e.occurred_at, userRef: e.user_ref, userRole: e.user_role, method: e.method, url: e.url,
      statusCode: e.status_code, browser: e.browser, appVersion: e.app_version, environment: e.environment,
      context: (() => { try { return e.context_json ? JSON.parse(e.context_json) : null; } catch (x) { return null; } })()
    }))
  });
});

router.post('/errors/:id/status', (req, res) => {
  const { status, note = '' } = req.body || {};
  if (!ERROR_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'Status tidak valid' });
  }
  const g = db.prepare('SELECT id FROM error_groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ success: false, error: 'Error tidak ditemukan' });
  db.prepare(`
    UPDATE error_groups SET status = ?, status_note = ?, status_by = ?, status_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, String(note).slice(0, 500), req.user?.name || '', g.id);
  res.json({ success: true, error: toGroup(db.prepare('SELECT * FROM error_groups WHERE id = ?').get(g.id)) });
});

export default router;
