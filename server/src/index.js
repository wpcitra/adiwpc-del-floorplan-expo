import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { authenticate, enforceAccessPolicy, stampActorIdentity } from './middleware/auth.js';
import { auditTrail } from './middleware/audit.js';
import { readBackupStatus, startBackupSchedule } from './utils/backup.js';
import { appVersion } from './utils/appVersion.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
// CORS: only this computer's own pages (localhost / 127.0.0.1, any port) and the origins listed in ALLOWED_ORIGINS
// (comma separated, e.g. "https://expo.example.com"). Requests without an Origin header (curl, server-to-server)
// are not affected; other websites can no longer call the API from a visitor's browser.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || isLocalOrigin(origin) || allowedOrigins.includes(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/floorplan', floorplanRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/exhibitors', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brand-categories', brandCategoryRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/notifications', notificationRoutes);

// Start Server
app.listen(PORT, () => {
  startBackupSchedule();
  console.log(`🚀 Floorplan Backend API Server is running on http://localhost:${PORT}`);
  console.log(`📊 Database connected: server/data/floorplan.db`);
});
