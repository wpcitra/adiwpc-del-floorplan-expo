import express from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { envFileHas, setEnvFileValue } from '../utils/envFile.js';
import { waEnabled, sendText, normalizePhone } from '../utils/whatsapp.js';

// Setting > Integrasi WhatsApp (Fonnte), Super Admin only (AGENTS.md §45). Same rules as the Claude key (§23): the token is
// WRITE-ONLY (responses carry only "configured" and its last 4 characters) and lives in server/.env, never in the database.
// The webhook secret is shown to the Super Admin because it is part of the URL that is pasted into the Fonnte dashboard.
const router = express.Router();

const metaOf = () => { try { return JSON.parse(db.prepare("SELECT value FROM maintenance_settings WHERE key = 'wa_meta'").get()?.value || '{}'); } catch (e) { return {}; } };
const saveMeta = (patch) => db.prepare(`
  INSERT INTO maintenance_settings (key, value, updated_at) VALUES ('wa_meta', ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`).run(JSON.stringify({ ...metaOf(), ...patch }));

const baseUrl = (req) => `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;

function status(req) {
  const token = String(process.env.FONNTE_TOKEN || '');
  const secret = String(process.env.FONNTE_WEBHOOK_SECRET || '');
  const meta = metaOf();
  return {
    tokenConfigured: Boolean(token),
    tokenHint: token ? `…${token.slice(-4)}` : '',
    source: token ? (envFileHas('FONNTE_TOKEN') ? 'env-file' : 'environment') : null,
    device: String(process.env.FONNTE_DEVICE || ''),
    secretConfigured: Boolean(secret),
    webhookUrl: secret ? `${baseUrl(req)}/api/whatsapp/webhook/${secret}` : '',
    enabled: waEnabled(),
    staff: db.prepare("SELECT name, role, phone FROM users WHERE is_active = 1 AND role IN ('superadmin', 'finance', 'sales')").all()
      .map(u => ({ name: u.name, role: u.role, hasPhone: Boolean(normalizePhone(u.phone)) })),
    updatedAt: meta.updatedAt || null, updatedBy: meta.updatedBy || '', lastTest: meta.lastTest || null
  };
}
const lockedByEnvironment = () => Boolean(process.env.FONNTE_TOKEN) && !envFileHas('FONNTE_TOKEN');
const newSecret = () => crypto.randomBytes(24).toString('hex');
const touch = (req, extra = {}) => saveMeta({ updatedAt: new Date().toISOString(), updatedBy: req.user?.name || '', ...extra });

router.get('/', (req, res) => res.json({ success: true, status: status(req) }));

// PUT { token?, device? }: a new token also creates the webhook secret when there is none
router.put('/', (req, res) => {
  if (lockedByEnvironment()) return res.status(409).json({ success: false, error: 'Token Fonnte diatur dari environment server (di luar aplikasi) sehingga tidak dapat diganti dari sini.' });
  const token = String(req.body?.token ?? '').trim();
  const deviceRaw = req.body?.device;
  if (token && !/^[A-Za-z0-9._~+=-]{8,200}$/.test(token)) return res.status(400).json({ success: false, error: 'Format token tidak valid (tanpa spasi atau tanda kutip). Salin dari dashboard Fonnte > Device.' });
  let device = null;
  if (deviceRaw !== undefined) {
    device = normalizePhone(deviceRaw);
    if (device && !/^\d{8,16}$/.test(device)) return res.status(400).json({ success: false, error: 'Nomor device harus berupa angka (contoh 6281234567890).' });
  }
  if (!token && device === null) return res.status(400).json({ success: false, error: 'Tidak ada yang diubah.' });
  try {
    if (token) {
      setEnvFileValue('FONNTE_TOKEN', token);
      if (!process.env.FONNTE_WEBHOOK_SECRET) setEnvFileValue('FONNTE_WEBHOOK_SECRET', newSecret());
    }
    if (device !== null) setEnvFileValue('FONNTE_DEVICE', device || null);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Pengaturan gagal disimpan ke file .env server.' });
  }
  touch(req, token ? { lastTest: null } : {});
  res.json({ success: true, status: status(req) });
});

// POST /secret: a new webhook secret (the old URL stops working at once; paste the new one into Fonnte)
router.post('/secret', (req, res) => {
  try { setEnvFileValue('FONNTE_WEBHOOK_SECRET', newSecret()); } catch (e) { return res.status(500).json({ success: false, error: 'Rahasia webhook gagal disimpan.' }); }
  touch(req);
  res.json({ success: true, status: status(req) });
});

// POST /test { target }: sends one message, which also proves the token
router.post('/test', async (req, res) => {
  const target = normalizePhone(req.body?.target);
  if (!/^\d{8,16}$/.test(target)) return res.status(400).json({ success: false, error: 'Nomor tujuan tidak valid (contoh 081234567890).' });
  if (!process.env.FONNTE_TOKEN) return res.status(409).json({ success: false, error: 'Token Fonnte belum diisi.' });
  const out = await sendText(target, 'Tes asisten WhatsApp: koneksi Fonnte berhasil. ✅');
  const lastTest = { ok: out.ok, at: new Date().toISOString(), target: `…${target.slice(-4)}`, message: out.ok ? 'Pesan tes terkirim.' : `Gagal: ${out.reason}` };
  saveMeta({ lastTest });
  res.json({ success: true, ok: out.ok, message: lastTest.message, status: status(req) });
});

router.delete('/', (req, res) => {
  if (lockedByEnvironment()) return res.status(409).json({ success: false, error: 'Token Fonnte diatur dari environment server (di luar aplikasi) sehingga tidak dapat dihapus dari sini.' });
  try {
    ['FONNTE_TOKEN', 'FONNTE_WEBHOOK_SECRET', 'FONNTE_DEVICE'].forEach(n => setEnvFileValue(n, null));
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Pengaturan gagal dihapus dari file .env server.' });
  }
  touch(req, { lastTest: null });
  res.json({ success: true, status: status(req) });
});

export default router;
