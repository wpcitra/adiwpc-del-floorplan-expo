import crypto from 'crypto';
import db from '../db.js';

export const SESSION_TTL_HOURS = 12;

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, ip, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashToken(token), userId, clientIp(req), (req.headers['user-agent'] || '').slice(0, 250), expiresAt);
  return { token, expiresAt };
}

export const revokeUserSessions = (userId) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

export const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

const readBearer = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

// Resolves req.user from the bearer token when present. Never rejects on its own:
// access decisions are made by `enforceAccessPolicy` so public endpoints keep working.
export function authenticate(req, res, next) {
  const token = readBearer(req);
  if (!token) return next();

  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT s.token_hash, s.expires_at, u.id, u.name, u.email, u.role, u.is_active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!row || !row.is_active || new Date(row.expires_at) < new Date()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    req.authError = 'Sesi login sudah berakhir, silakan login kembali';
    return next();
  }

  db.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
  req.user = { id: row.id, name: row.name, email: row.email, role: row.role };
  req.sessionTokenHash = tokenHash;
  next();
}

// ---------------------------------------------------------------------------
// Access policy (first matching rule wins; anything unmatched requires login).
//   'public' = no login, 'staff' = any logged-in user, or a list of roles.
//   Super Admin is allowed everywhere.
// ---------------------------------------------------------------------------
const SALES = ['sales'];
const FINANCE = ['finance'];
const OPERATIONS = ['operations'];
const DEVELOPER = ['developer'];
const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];

const ACCESS_RULES = [
  // Auth
  { methods: ['POST'], path: /^\/auth\/login$/, access: 'public' },

  // Health
  { methods: ['GET'], path: /^\/health$/, access: 'public' },

  // Floorplan: admin-only listings first, then public read-only views used by the Live Floorplan portal
  { methods: ['GET'], path: /^\/floorplan\/(list|presets|trash|activity-logs)$/, access: 'staff' },
  { methods: ['GET'], path: /^\/floorplan\/(events|active|[^/]+)$/, access: 'public' },
  { methods: ['POST'], path: /^\/floorplan\/permanent-delete$/, access: [] },
  { methods: ['DELETE'], path: /^\/floorplan\/presets\/[^/]+$/, access: [] },
  // Editing a floorplan (save, publish, presets, merge display...): Super Admin and Operations. Sales only views the
  // Studio and registers tenants (POST /orders/checkout below); Operations edits but never registers a tenant.
  { methods: WRITE, path: /^\/floorplan(\/.*)?$/, access: OPERATIONS },

  // Public booking checkout (staff bookings are recognised via the session) & returning-client lookup
  { methods: ['POST'], path: /^\/(orders|exhibitors)\/checkout$/, access: 'public', denyRoles: OPERATIONS,
    denyMessage: 'Role Operasional tidak dapat mendaftarkan tenant / brand.' },
  { methods: ['GET'], path: /^\/(orders|exhibitors)\/check-client$/, access: 'public' },

  // Invoices: finance owns billing, including the private booth discount (sales reads invoices only)
  { methods: ['GET'], path: /^\/invoices\/config$/, access: 'public' },
  { methods: ['POST'], path: /^\/invoices\/sync-booth-discount$/, access: FINANCE },
  { methods: WRITE, path: /^\/invoices(\/.*)?$/, access: FINANCE },

  // Master data read by the public booking form; edited by the Super Admin only (Studio tiers & brand categories)
  { methods: ['GET'], path: /^\/(categories|brand-categories|payment-methods)$/, access: 'public' },
  { methods: WRITE, path: /^\/(categories|brand-categories)(\/.*)?$/, access: OPERATIONS },
  { methods: WRITE, path: /^\/payment-methods(\/.*)?$/, access: [] },

  // Facility portal
  { methods: ['GET'], path: /^\/facilities\/forms(\/[^/]+)?$/, access: 'public' },
  { methods: ['POST'], path: /^\/facilities\/requests\/submit$/, access: 'public' },
  { methods: ['POST'], path: /^\/facilities\/requests\/[^/]+\/generate-invoice$/, access: FINANCE },

  // Denah Operasional: the operations team edits its own layer; sales only views it (overlay in the sales Studio)
  { methods: ['GET'], path: /^\/ops\/[^/]+\/public$/, access: 'public' },
  { methods: ['GET'], path: /^\/ops(\/.*)?$/, access: [...OPERATIONS, ...SALES] },
  { methods: ['POST'], path: /^\/ops\/[^/]+\/copy-from$/, access: OPERATIONS },
  { methods: WRITE, path: /^\/ops(\/.*)?$/, access: OPERATIONS },

  // Pusat Maintenance: browser error reports are public (scrubbed + rate limited), the center itself is Developer / Super Admin
  { methods: ['POST'], path: /^\/errors\/report$/, access: 'public' },
  // The Claude API key is managed by the Super Admin only (write-only, never returned)
  { methods: ['GET', ...WRITE], path: /^\/maintenance\/(ai-key|ai-config|ai-models)(\/.*)?$/, access: [] },
  { methods: ['GET', ...WRITE], path: /^\/maintenance(\/.*)?$/, access: DEVELOPER },

  // In-app notifications of the logged-in user
  { methods: ['GET', 'POST'], path: /^\/notifications(\/.*)?$/, access: 'staff' },

  // User management & audit trail
  { methods: ['GET'], path: /^\/users\/roles$/, access: 'staff' },
  { methods: ['GET', ...WRITE], path: /^\/(users|audit-logs)(\/.*)?$/, access: [] }
];

// Operations: Denah Operasional, plus the Studio (floorplan, tiers, brand categories) as an editor. Never tenant
// registration, orders, invoices or users.
const OPERATIONS_AREA = [
  /^\/ops(\/.*)?$/, /^\/floorplan(\/.*)?$/, /^\/(categories|brand-categories)(\/.*)?$/,
  /^\/notifications(\/.*)?$/, /^\/auth\//, /^\/users\/roles$/, /^\/health$/
];
// Developer: only the Pusat Maintenance (never tenant, price, invoice or user data)
const DEVELOPER_AREA = [/^\/maintenance(\/.*)?$/, /^\/notifications(\/.*)?$/, /^\/auth\//, /^\/users\/roles$/, /^\/health$/];
// Roles limited to their own area; on public endpoints they are treated as anonymous visitors
const RESTRICTED_AREAS = {
  operations: { area: OPERATIONS_AREA, error: 'Role Operasional hanya dapat mengakses Studio dan Denah Operasional' },
  developer: { area: DEVELOPER_AREA, error: 'Role Developer hanya dapat mengakses Pusat Maintenance' }
};

const findRule = (method, path) =>
  ACCESS_RULES.find(r => r.methods.includes(method) && r.path.test(path));

export function enforceAccessPolicy(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const path = req.path.replace(/\/+$/, '') || '/';
  const rule = findRule(req.method, path);
  const access = rule ? rule.access : 'staff';

  const restricted = RESTRICTED_AREAS[req.user?.role];
  if (rule?.denyRoles?.includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: rule.denyMessage || 'Role Anda tidak memiliki akses untuk tindakan ini', code: 'FORBIDDEN' });
  }
  if (access === 'public') {
    // Operations / developer accounts see public endpoints outside their own area exactly like a visitor (published
    // data only, no staff extras). `restrictedUser` keeps who they are for masked error reports only.
    // Inside their area (e.g. the floorplan for Operations) they stay staff: the Studio needs drafts and full data.
    if (restricted && !restricted.area.some(re => re.test(path))) {
      req.restrictedUser = req.user;
      req.user = undefined;
    }
    return next();
  }

  // Operations / developer accounts only reach their own area (plus notifications and their own account), never
  // sales / billing data behind generic "staff" endpoints (prices, discounts, invoices, exhibitors)
  if (restricted && !restricted.area.some(re => re.test(path))) {
    return res.status(403).json({ success: false, error: restricted.error, code: 'FORBIDDEN' });
  }

  if (!req.user) {
    return res.status(401).json({ success: false, error: req.authError || 'Silakan login terlebih dahulu', code: 'UNAUTHENTICATED' });
  }
  if (access === 'staff' || req.user.role === 'superadmin' || access.includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Role Anda tidak memiliki akses untuk tindakan ini', code: 'FORBIDDEN' });
}

// Names recorded on bookings, deletions, etc. come from the session, never from the request body.
const ACTOR_FIELDS = ['adminName', 'deletedBy', 'restoredBy', 'confirmedBy', 'registeredBy'];

export function stampActorIdentity(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next();

  if (req.user) {
    ACTOR_FIELDS.forEach(field => {
      if (field in req.body || field === 'adminName') req.body[field] = req.user.name;
    });
  } else {
    // Anonymous visitors cannot register a booking "as admin"
    ACTOR_FIELDS.forEach(field => { delete req.body[field]; });
    if (req.body.source === 'admin') req.body.source = 'online';
    delete req.body.isAdmin;
  }
  next();
}
