import express from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { envFileHas, setEnvFileValue } from '../utils/envFile.js';
import { waEnabled, sendText, normalizePhone, waMeta as metaOf, saveWaMeta as saveMeta } from '../utils/whatsapp.js';
import { getGeminiKey, isValidGeminiKeyFormat, isValidModelId, listGeminiModels, DEFAULT_GEMINI_MODEL } from '../utils/geminiApi.js';
import { geminiConfig, geminiReady } from '../utils/waGemini.js';
import { answerStaff, WEB_CHANNEL } from '../utils/waAgent.js';

// Setting > Integrasi WhatsApp (Fonnte), Super Admin only (AGENTS.md §45). Same rules as the Claude key (§23): the token and
// the Gemini API key are WRITE-ONLY (responses carry only "configured" and the last 4 characters) and live in the env
// file, never in the database. The webhook secret is shown to the Super Admin because it is part of the URL that is
// pasted into the Fonnte dashboard.
const router = express.Router();

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
    signature: meta.signature || '',
    updatedAt: meta.updatedAt || null, updatedBy: meta.updatedBy || '', lastTest: meta.lastTest || null,
    gemini: geminiStatus()
  };
}

function geminiStatus() {
  const key = getGeminiKey();
  const g = metaOf().gemini || {};
  const cfg = geminiConfig();
  return {
    configured: Boolean(key), hint: key ? `…${key.slice(-4)}` : '',
    source: key ? (envFileHas('GEMINI_API_KEY') ? 'env-file' : 'environment') : null,
    model: cfg.model, defaultModel: DEFAULT_GEMINI_MODEL, enabled: cfg.enabled, ready: geminiReady(),
    updatedAt: g.updatedAt || null, updatedBy: g.updatedBy || ''
  };
}
const lockedByEnvironment = () => Boolean(process.env.FONNTE_TOKEN) && !envFileHas('FONNTE_TOKEN');
const newSecret = () => crypto.randomBytes(24).toString('hex');
const touch = (req, extra = {}) => saveMeta({ updatedAt: new Date().toISOString(), updatedBy: req.user?.name || '', ...extra });

router.get('/', (req, res) => res.json({ success: true, status: status(req) }));

// PUT { token?, device?, signature? }: a new token also creates the webhook secret when there is none
router.put('/', (req, res) => {
  const token = String(req.body?.token ?? '').trim();
  const deviceRaw = req.body?.device;
  if (token && lockedByEnvironment()) return res.status(409).json({ success: false, error: 'Token Fonnte diatur dari environment server (di luar aplikasi) sehingga tidak dapat diganti dari sini.' });
  if (token && !/^[A-Za-z0-9._~+=-]{8,200}$/.test(token)) return res.status(400).json({ success: false, error: 'Format token tidak valid (tanpa spasi atau tanda kutip). Salin dari dashboard Fonnte > Device.' });
  // one line, shown under every WhatsApp message; '' removes it
  const signature = req.body?.signature === undefined ? null : String(req.body.signature ?? '').replace(/\s+/g, ' ').trim();
  if (signature !== null && signature.length > 80) return res.status(400).json({ success: false, error: 'Tanda tangan maksimal 80 karakter.' });
  let device = null;
  if (deviceRaw !== undefined) {
    device = normalizePhone(deviceRaw);
    if (device && !/^\d{8,16}$/.test(device)) return res.status(400).json({ success: false, error: 'Nomor device harus berupa angka (contoh 6281234567890).' });
  }
  if (!token && device === null && signature === null) return res.status(400).json({ success: false, error: 'Tidak ada yang diubah.' });
  try {
    if (token) {
      setEnvFileValue('FONNTE_TOKEN', token);
      if (!process.env.FONNTE_WEBHOOK_SECRET) setEnvFileValue('FONNTE_WEBHOOK_SECRET', newSecret());
    }
    if (device !== null) setEnvFileValue('FONNTE_DEVICE', device || null);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Pengaturan gagal disimpan ke file .env server.' });
  }
  touch(req, { ...(token ? { lastTest: null } : {}), ...(signature !== null ? { signature } : {}) });
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

// ---------- Agen Gemini ----------
const geminiLocked = () => Boolean(process.env.GEMINI_API_KEY) && !envFileHas('GEMINI_API_KEY');
const saveGemini = (req, patch) => saveMeta({ gemini: { ...(metaOf().gemini || {}), ...patch, updatedAt: new Date().toISOString(), updatedBy: req.user?.name || '' } });

// PUT /gemini { apiKey?, model?, enabled? }: a key is checked with Google first; a refused key is not stored
router.put('/gemini', async (req, res) => {
  const { apiKey, model, enabled } = req.body || {};
  const key = apiKey === undefined ? '' : String(apiKey).trim();
  if (apiKey !== undefined && !isValidGeminiKeyFormat(key)) return res.status(400).json({ success: false, error: 'Format API key Gemini tidak valid (tanpa spasi atau tanda kutip). Salin dari Google AI Studio.' });
  if (key && geminiLocked()) return res.status(409).json({ success: false, error: 'API key Gemini diatur dari environment server (di luar aplikasi) sehingga tidak dapat diganti dari sini.' });
  if (model !== undefined && !isValidModelId(model)) return res.status(400).json({ success: false, error: 'Nama model Gemini tidak valid.' });
  if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ success: false, error: 'Nilai aktif harus ya / tidak.' });
  if (!key && model === undefined && enabled === undefined) return res.status(400).json({ success: false, error: 'Tidak ada yang diubah.' });

  let warning = '';
  if (key) {
    const check = await listGeminiModels(key);
    if (!check.ok && ['INVALID_KEY', 'FORBIDDEN'].includes(check.code)) return res.status(400).json({ success: false, error: check.message });
    if (!check.ok) warning = `API key disimpan, tetapi belum bisa dicek: ${check.message}`;
    try { setEnvFileValue('GEMINI_API_KEY', key); } catch (e) { return res.status(500).json({ success: false, error: 'API key gagal disimpan ke file .env server.' }); }
  }
  saveGemini(req, {
    ...(model !== undefined ? { model } : {}),
    ...(enabled !== undefined ? { enabled } : key ? { enabled: true } : {})
  });
  res.json({ success: true, message: warning || 'Pengaturan agen Gemini tersimpan.', warning, status: status(req) });
});

// GET /gemini/models: the models the stored key can use (for the model dropdown)
router.get('/gemini/models', async (req, res) => {
  const out = await listGeminiModels();
  if (!out.ok) return res.status(out.code === 'NO_KEY' ? 409 : 502).json({ success: false, error: out.message });
  res.json({ success: true, models: out.models, defaultModel: DEFAULT_GEMINI_MODEL });
});

// POST /chat { message }: the assistant on this page, exactly as on WhatsApp for the logged-in staff member (commands,
// Gemini, booking / invoice saved only after YA). The saves go through the web endpoints, which audit them.
router.post('/chat', async (req, res) => {
  req.skipAudit = true;
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ success: false, error: 'Tulis pesan (maksimal 1.000 karakter).' });
  try {
    const out = await answerStaff(req.user, message, WEB_CHANNEL);
    const parts = [].concat(out).map(p => (typeof p === 'string' ? { text: p } : { invoiceId: p.invoiceId, invoiceNumber: p.invoiceNumber, filename: p.filename }));
    res.json({ success: true, parts });
  } catch (e) {
    console.error('Chat asisten gagal:', e);
    res.status(500).json({ success: false, error: 'Asisten gagal memproses pesan. Coba lagi.' });
  }
});

router.delete('/gemini', (req, res) => {
  if (geminiLocked()) return res.status(409).json({ success: false, error: 'API key Gemini diatur dari environment server (di luar aplikasi) sehingga tidak dapat dihapus dari sini.' });
  try { setEnvFileValue('GEMINI_API_KEY', null); } catch (e) { return res.status(500).json({ success: false, error: 'API key gagal dihapus dari file .env server.' }); }
  saveGemini(req, {});
  res.json({ success: true, status: status(req) });
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
