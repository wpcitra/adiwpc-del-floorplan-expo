import express from 'express';
import db from '../db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createSession, clientIp, SESSION_TTL_HOURS } from '../middleware/auth.js';
import { writeAuditLog } from '../middleware/audit.js';

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const failedAttempts = new Map(); // key: email|ip -> { count, lockedUntil }

const toSessionUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// POST /api/auth/login
router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = clientIp(req);
  const key = `${email}|${ip}`;

  const attempt = failedAttempts.get(key);
  if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
    const minutes = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ success: false, error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.` });
  }

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const valid = user && verifyPassword(password, user.password_hash);

  if (!valid || !user.is_active) {
    const count = (attempt?.count || 0) + 1;
    failedAttempts.set(key, { count, lockedUntil: count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MINUTES * 60000 : null });
    writeAuditLog({
      user: user ? toSessionUser(user) : { name: email || '(kosong)' },
      category: 'Keamanan',
      action: 'Login gagal',
      target: email,
      summary: !user ? 'Email tidak terdaftar' : (!valid ? 'Password salah' : 'Akun nonaktif'),
      ip
    });
    // Same message for unknown email / wrong password so accounts cannot be enumerated
    const error = valid && !user.is_active ? 'Akun Anda dinonaktifkan. Hubungi Super Admin.' : 'Email atau password salah';
    return res.status(401).json({ success: false, error });
  }

  failedAttempts.delete(key);
  const { token, expiresAt } = createSession(user.id, req);
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  writeAuditLog({ user: toSessionUser(user), category: 'Keamanan', action: 'Login', target: user.email, ip });

  res.json({ success: true, token, expiresAt, sessionHours: SESSION_TTL_HOURS, user: toSessionUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionTokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
    writeAuditLog({ user: req.user, category: 'Keamanan', action: 'Logout', target: req.user.email, ip: clientIp(req) });
  }
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  const { currentPassword = '', newPassword = '' } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(400).json({ success: false, error: 'Password saat ini salah' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter' });
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashPassword(newPassword), user.id);
  // Sign out other devices, keep the current session
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, req.sessionTokenHash);
  writeAuditLog({ user: req.user, category: 'Keamanan', action: 'Ganti password sendiri', target: req.user.email, ip: clientIp(req) });
  res.json({ success: true, message: 'Password berhasil diganti' });
});

export default router;
