import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import floorplanRoutes from './routes/floorplanRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import brandCategoryRoutes from './routes/brandCategoryRoutes.js';
import paymentMethodRoutes from './routes/paymentMethodRoutes.js';
import facilityRoutes from './routes/facilityRoutes.js';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import opsRoutes from './routes/opsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import maintenanceRoutes, { reportRouter as errorReportRoutes } from './routes/maintenanceRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import boothActionRoutes from './routes/boothActionRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { migrateEmbeddedImages } from './utils/uploads.js';
import { createBackup } from './utils/backup.js';
import { authenticate, enforceAccessPolicy, stampActorIdentity } from './middleware/auth.js';
import { auditTrail } from './middleware/audit.js';
import { readBackupStatus, startBackupSchedule } from './utils/backup.js';
import { appVersion } from './utils/appVersion.js';
import { removeDemoDataIfUntouched } from './utils/demoCleanup.js';
import { storageKind } from './db.js';
import { installErrorCapture, errorCaptureMiddleware, expressErrorHandler } from './utils/errorTracker.js';

// Pusat Maintenance (AGENTS.md §22): record server errors (console.error(Error), 5xx responses, crashes)
installErrorCapture();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
// Error capture first, so every request (including CORS / body parser failures) has its context
app.use('/api', errorCaptureMiddleware);
// CORS (AGENTS.md §20): the website itself (same domain, e.g. the Railway / custom domain serving client/dist),
// this computer's localhost pages, and the origins listed in ALLOWED_ORIGINS (comma separated). Other websites
// cannot call the API from a visitor's browser. Logins do not depend on CORS: the token is sent in the
// Authorization header by the site's own pages.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
const isSameSite = (origin, req) => {
  try { return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch (e) { return false; }
};

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  callback(null, {
    origin: !origin || isLocalOrigin(origin) || allowedOrigins.includes(origin) || isSameSite(origin, req),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
}));

// Body parser with high limit for blueprints and canvas data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Authentication, role-based access control & audit trail for every /api route
app.use('/api', authenticate, enforceAccessPolicy, stampActorIdentity, auditTrail);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const backup = readBackupStatus().lastSuccess;
  res.json({
    status: 'online',
    database: 'SQLite 3 (Connected)',
    environment: process.env.APP_ENV || 'production',
    version: appVersion(),
    lastBackupAt: backup?.at || null,
    // 'volume' | 'ephemeral' (Railway without a Volume: data is lost on every deploy) | 'local'
    storage: storageKind,
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/floorplan', floorplanRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/exhibitors', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/booth-actions', boothActionRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brand-categories', brandCategoryRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/errors', errorReportRoutes);
app.use('/api/maintenance/agent', agentRoutes);
app.use('/api/maintenance', maintenanceRoutes);

// Unhandled route errors: recorded for the Pusat Maintenance, answered without internal details
app.use(expressErrorHandler);

// Serve static frontend build in production (Railway, Render, VPS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  startBackupSchedule();
  console.log(`🚀 Floorplan Backend API Server is running on port ${PORT}`);
  console.log(`📊 Database connected: server/data/floorplan.db`);
  // Production starts clean: an empty database is NOT filled with demo data (demo: `node server/src/seed.js`, local only).
  // Demo data auto-seeded earlier on Railway is removed once, only while nobody has entered real data yet.
  removeDemoDataIfUntouched().catch(error => console.error('Hapus data contoh gagal:', error))
    // Images stored as base64 in the database (blueprint, logo) move to files once, after a verified backup
    .then(() => migrateEmbeddedImages({ backup: () => (process.env.BACKUP_DISABLED === '1' ? { ok: true } : createBackup('pre-migration', 'Sebelum memindahkan gambar base64 ke file')) }))
    .then(result => {
      if (result?.rows) console.log(`🖼️  ${result.rows} data gambar base64 dipindahkan ke file (database ${Math.round(result.savedBytes / 1024)} KB lebih kecil).`);
      else if (result?.skipped) console.warn(`Pemindahan gambar base64 ditunda: ${result.skipped}`);
    })
    .catch(error => console.error('Pemindahan gambar base64 gagal:', error));
});
