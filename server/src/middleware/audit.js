import db from '../db.js';
import { clientIp } from './auth.js';

const COALESCE_MINUTES = 10;
const SENSITIVE_KEYS = /password|token|secret/i;
const BULKY_KEYS = /fabric|canvas|blueprint|metadata|objects|items|logo|signature|image|base64/i;

const invoiceById = (id) => db.prepare('SELECT invoice_number, company_name, booth_code, payment_status FROM invoices WHERE id = ? OR invoice_number = ?').get(id, id);
const userById = (id) => db.prepare('SELECT name, email, role, is_active FROM users WHERE id = ?').get(id);
const floorplanTitle = (id) => db.prepare('SELECT title FROM floorplans WHERE id = ?').get(id)?.title;
const invoiceLabel = (inv, id) => inv ? `${inv.invoice_number} (${inv.company_name || '-'}, booth ${inv.booth_code || '-'})` : id;

// Human-readable labels for mutations; `before` snapshots state so the log can show "from -> to".
const AUDIT_RULES = [
  // Invoices & payments
  { method: 'POST', path: /^\/invoices\/([^/]+)\/status$/, category: 'Invoice', action: 'Ubah status pembayaran',
    before: (m) => invoiceById(m[1]),
    describe: (req, m, before) => ({
      target: invoiceLabel(before, m[1]),
      summary: `${before?.payment_status || '?'} → ${(req.body.status || '').toUpperCase() || '?'}${req.body.boothStatus ? `, booth → ${req.body.boothStatus}` : ''}`
    }) },
  { method: 'POST', path: /^\/invoices\/sync-booth-discount$/, category: 'Invoice', action: 'Atur diskon booth',
    describe: (req) => ({ target: `Booth ${req.body.boothCode || req.body.booth_code || '-'}` }) },
  { method: 'POST', path: /^\/invoices\/config$/, category: 'Invoice', action: 'Ubah pengaturan/template invoice' },
  { method: 'POST', path: /^\/invoices$/, category: 'Invoice', action: 'Buat invoice',
    describe: (req) => ({ target: `${req.body.invoiceNumber || req.body.invoice_number || ''} ${req.body.companyName || req.body.company_name || ''}`.trim() }) },
  { method: 'PUT', path: /^\/invoices\/([^/]+)$/, category: 'Invoice', action: 'Edit invoice',
    before: (m) => invoiceById(m[1]), describe: (req, m, before) => ({ target: invoiceLabel(before, m[1]) }) },
  { method: 'DELETE', path: /^\/invoices\/([^/]+)$/, category: 'Invoice', action: 'Hapus invoice',
    before: (m) => invoiceById(m[1]), describe: (req, m, before) => ({ target: invoiceLabel(before, m[1]) }) },

  // Booths, tenants & bookings
  { method: 'PATCH', path: /^\/stats\/booth\/([^/]+)\/status$/, category: 'Booth', action: 'Ubah status booth',
    before: (m) => db.prepare('SELECT code, status, floorplan_id FROM booths WHERE id = ?').get(m[1]),
    describe: (req, m, before) => ({ target: `Booth ${before?.code || m[1]}`, summary: `${before?.status || '?'} → ${req.body.status || '?'}` }) },
  { method: 'POST', path: /^\/(orders|exhibitors)\/checkout$/, category: 'Booking', action: 'Daftarkan tenant ke booth',
    describe: (req) => ({ target: `Booth ${req.body.boothCode || '-'}`, summary: `${req.body.brandName || '-'} (${req.body.bookingType || 'booking'})` }) },
  { method: 'PUT', path: /^\/(orders|exhibitors)\/update-tenant$/, category: 'Booking', action: 'Edit data tenant',
    describe: (req) => ({ target: `Booth ${req.body.boothCode || '-'}`, summary: req.body.brandName || '' }) },
  { method: 'POST', path: /^\/(orders|exhibitors)\/detach-tenant$/, category: 'Booking', action: 'Lepas tenant dari booth',
    describe: (req) => ({ target: `Booth ${req.body.boothCode || '-'}` }) },

  // Floorplans
  { method: 'POST', path: /^\/floorplan\/save$/, category: 'Floorplan', action: 'Simpan denah', coalesce: true,
    describe: (req) => ({ target: `${req.body.title || floorplanTitle(req.body.id) || 'Denah'} (${req.body.id || 'baru'})` }) },
  { method: 'POST', path: /^\/floorplan\/([^/]+)\/publish$/, category: 'Floorplan', action: 'Publish denah',
    describe: (req, m) => ({ target: `${floorplanTitle(m[1]) || ''} (${m[1]})` }) },
  { method: 'POST', path: /^\/floorplan\/([^/]+)\/merge-display$/, category: 'Booth', action: 'Atur tampilan booth gabungan',
    describe: (req, m) => ({ target: `Booth ${(req.body.boothCodes || []).join('+')} — ${floorplanTitle(m[1]) || m[1]}`, summary: req.body.separate ? 'Tampilkan Terpisah' : 'Gabungkan Kembali' }) },
  { method: 'POST', path: /^\/floorplan\/([^/]+)\/unpublish$/, category: 'Floorplan', action: 'Hentikan publikasi denah',
    describe: (req, m) => ({ target: `${floorplanTitle(m[1]) || ''} (${m[1]})` }) },
  { method: 'POST', path: /^\/floorplan\/([^/]+)\/duplicate$/, category: 'Floorplan', action: 'Duplikat denah',
    describe: (req, m) => ({ target: `${floorplanTitle(m[1]) || ''} (${m[1]})` }) },
  { method: 'DELETE', path: /^\/floorplan\/presets\/([^/]+)$/, category: 'Floorplan', action: 'Hapus preset layout' },
  { method: 'DELETE', path: /^\/floorplan\/([^/]+)$/, category: 'Floorplan', action: 'Hapus denah',
    before: (m) => ({ title: floorplanTitle(m[1]) }), describe: (req, m, before) => ({ target: `${before?.title || ''} (${m[1]})` }) },
  { method: 'POST', path: /^\/floorplan\/create-hall$/, category: 'Floorplan', action: 'Buat hall baru' },
  { method: 'POST', path: /^\/floorplan\/(save-as-preset|presets)$/, category: 'Floorplan', action: 'Simpan preset layout' },
  { method: 'POST', path: /^\/floorplan\/soft-delete$/, category: 'Floorplan', action: 'Pindahkan project ke tempat sampah',
    describe: (req) => ({ target: (req.body.projectIds || []).join(', ') }) },
  { method: 'POST', path: /^\/floorplan\/restore$/, category: 'Floorplan', action: 'Pulihkan project',
    describe: (req) => ({ target: (req.body.projectIds || []).join(', ') }) },
  { method: 'POST', path: /^\/floorplan\/permanent-delete$/, category: 'Floorplan', action: 'Hapus permanen project',
    describe: (req) => ({ target: (req.body.projectIds || []).join(', ') }) },

  // Master data & settings
  { method: '*', path: /^\/categories(\/.*)?$/, category: 'Pengaturan', action: 'Ubah kategori/tier harga booth' },
  { method: '*', path: /^\/brand-categories(\/.*)?$/, category: 'Pengaturan', action: 'Ubah kategori brand' },
  { method: '*', path: /^\/payment-methods(\/.*)?$/, category: 'Pengaturan', action: 'Ubah metode pembayaran' },
  { method: '*', path: /^\/facilities\/forms(\/.*)?$/, category: 'Fasilitas', action: 'Ubah formulir fasilitas' },
  { method: 'PUT', path: /^\/facilities\/requests\/([^/]+)\/status$/, category: 'Fasilitas', action: 'Ubah status permintaan fasilitas',
    describe: (req, m) => ({ target: m[1], summary: `→ ${req.body.status || '?'}` }) },
  { method: 'POST', path: /^\/facilities\/requests\/([^/]+)\/generate-invoice$/, category: 'Fasilitas', action: 'Terbitkan invoice fasilitas',
    describe: (req, m) => ({ target: m[1] }) },

  // Pusat Maintenance
  { method: 'POST', path: /^\/maintenance\/errors\/([^/]+)\/status$/, category: 'Maintenance', action: 'Ubah status error',
    before: (m) => db.prepare('SELECT id, status, priority, message FROM error_groups WHERE id = ?').get(m[1]),
    describe: (req, m, before) => ({
      target: `${m[1]} (${before?.priority || '?'}) ${String(before?.message || '').slice(0, 80)}`,
      summary: `${before?.status || '?'} → ${req.body.status || '?'}${req.body.note ? ` · ${String(req.body.note).slice(0, 120)}` : ''}`
    }) },

  // Users
  { method: 'POST', path: /^\/users$/, category: 'User', action: 'Tambah user',
    describe: (req) => ({ target: `${req.body.name || ''} <${req.body.email || ''}>`, summary: `Role: ${req.body.role || '-'}` }) },
  { method: 'PUT', path: /^\/users\/([^/]+)$/, category: 'User', action: 'Edit user',
    before: (m) => userById(m[1]),
    describe: (req, m, before) => {
      const changes = [];
      if (req.body.role !== undefined && req.body.role !== before?.role) changes.push(`role ${before?.role} → ${req.body.role}`);
      if (req.body.isActive !== undefined && Boolean(req.body.isActive) !== Boolean(before?.is_active)) changes.push(req.body.isActive ? 'diaktifkan' : 'dinonaktifkan');
      if (req.body.email !== undefined && req.body.email.trim().toLowerCase() !== before?.email) changes.push(`email → ${req.body.email}`);
      if (req.body.name !== undefined && req.body.name.trim() !== before?.name) changes.push(`nama → ${req.body.name}`);
      if (req.body.password) changes.push('password diganti');
      return { target: `${before?.name || m[1]} <${before?.email || ''}>`, summary: changes.join(', ') || 'Tidak ada perubahan data' };
    } }
];

const findAuditRule = (method, path) => {
  for (const rule of AUDIT_RULES) {
    if (rule.method !== '*' && rule.method !== method) continue;
    const match = path.match(rule.path);
    if (match) return { rule, match };
  }
  return null;
};

// Small, safe snapshot of the request payload (no passwords, no canvas/blueprint blobs)
const safeDetails = (body) => {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.test(key) || BULKY_KEYS.test(key)) continue;
    if (value === null || ['number', 'boolean'].includes(typeof value)) out[key] = value;
    else if (typeof value === 'string' && value.length <= 200) out[key] = value;
    else if (Array.isArray(value) && value.length <= 20 && value.every(v => typeof v !== 'object')) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
};

export function writeAuditLog({ user, action, category, target = '', summary = '', method = null, path = null, statusCode = null, ip = '', details = null }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, category, target, summary, method, path, status_code, ip, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user?.id || null, user?.name || 'Publik (tanpa login)', user?.role || null, action, category, target, summary,
      method, path, statusCode, ip, details ? JSON.stringify(details) : null);
  } catch (e) {
    console.error('Audit log write failed:', e.message);
  }
}

// Records every mutation made by a logged-in user, plus denied attempts (403).
export function auditTrail(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const path = req.path.replace(/\/+$/, '') || '/';
  if (path.startsWith('/auth/')) return next(); // login/logout are logged by the auth routes

  const found = findAuditRule(req.method, path);
  let before = null;
  try { before = found?.rule.before ? found.rule.before(found.match) : null; } catch (e) { before = null; }
  const bodySnapshot = safeDetails(req.body);

  res.on('finish', () => {
    const user = req.user;
    const status = res.statusCode;
    if (!user) return;
    // Routes that write their own detailed entries (operational layer) or are not worth logging (notification reads)
    if ((req.skipAudit || path.startsWith('/notifications')) && status !== 403) return; // anonymous public actions (bookings, facility requests) are tracked in their own tables
    if (status >= 400 && status !== 403) return;

    const base = { user, method: req.method, path: `/api${path}`, statusCode: status, ip: clientIp(req), details: bodySnapshot };
    if (status === 403) {
      writeAuditLog({ ...base, category: 'Keamanan', action: 'Akses ditolak', target: `${req.method} /api${path}` });
      return;
    }

    let described = {};
    try { described = found?.rule.describe ? found.rule.describe(req, found.match, before) : {}; } catch (e) { described = {}; }
    const action = found?.rule.action || `${req.method} /api${path}`;
    const category = found?.rule.category || 'Lainnya';
    const target = described.target || '';

    if (found?.rule.coalesce) {
      // Collapse repeated autosaves of the same target by the same user into one entry
      const recent = db.prepare(`
        SELECT id, details_json FROM audit_logs
        WHERE user_id = ? AND action = ? AND target = ? AND created_at >= datetime('now', ?)
        ORDER BY id DESC LIMIT 1
      `).get(user.id, action, target, `-${COALESCE_MINUTES} minutes`);
      if (recent) {
        const count = (JSON.parse(recent.details_json || '{}').saveCount || 1) + 1;
        db.prepare(`UPDATE audit_logs SET created_at = CURRENT_TIMESTAMP, summary = ?, details_json = ? WHERE id = ?`)
          .run(`${count}x disimpan dalam ${COALESCE_MINUTES} menit terakhir`, JSON.stringify({ ...(bodySnapshot || {}), saveCount: count }), recent.id);
        return;
      }
    }

    writeAuditLog({ ...base, category, action, target, summary: described.summary || '' });
  });
  next();
}
