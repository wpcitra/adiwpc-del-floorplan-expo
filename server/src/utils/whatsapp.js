import crypto from 'crypto';
import db from '../db.js';

// WhatsApp through Fonnte (https://fonnte.com) for the staff assistant (AGENTS.md §45). Secrets only in server/.env:
// FONNTE_TOKEN (device token, sends the replies), FONNTE_WEBHOOK_SECRET (part of the webhook URL: Fonnte does not sign
// its calls), optional FONNTE_DEVICE (the connected number: messages from / to other devices are ignored).
// FONNTE_API_URL lets the tests point at a local mock; production uses https://api.fonnte.com.
const apiBase = () => (process.env.FONNTE_API_URL || 'https://api.fonnte.com').replace(/\/+$/, '');
const env = (name) => String(process.env[name] || '').trim();

export const waEnabled = () => Boolean(env('FONNTE_TOKEN') && env('FONNTE_WEBHOOK_SECRET'));

// Non-secret settings of Setting > Integrasi WhatsApp (who changed them, last test, the Gemini model / on-off)
export const waMeta = () => { try { return JSON.parse(db.prepare("SELECT value FROM maintenance_settings WHERE key = 'wa_meta'").get()?.value || '{}'); } catch (e) { return {}; } };
export const saveWaMeta = (patch) => db.prepare(`
  INSERT INTO maintenance_settings (key, value, updated_at) VALUES ('wa_meta', ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`).run(JSON.stringify({ ...waMeta(), ...patch }));

// The signature of Setting ("Tanda tangan di akhir pesan", e.g. halalfair.co.id) closes every WhatsApp message. Fonnte's
// own "Sent via fonnte.com" (Free package) is added by Fonnte after this and cannot be removed from here.
const withSignature = (text) => {
  const sig = String(waMeta().signature || '').trim();
  return sig ? `${text}\n\n${sig}` : text;
};

// The secret in the webhook URL, compared in constant time
export function secretMatches(given) {
  const secret = env('FONNTE_WEBHOOK_SECRET');
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(secret);
  return Boolean(secret) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Fonnte posts one message per call: { device, sender, message, member, url, filename, extension, inboxid, timestamp, ... }
// Voice notes and other audio Gemini can listen to (MIME types of its audio understanding)
const AUDIO_TYPES = { ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mp3', mpeg: 'audio/mpeg', m4a: 'audio/m4a', aac: 'audio/aac', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' };
const extensionOf = (body) => String(body?.extension || String(body?.filename || '').split('.').pop() || '').toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '');

// Groups (`member` set) and calls for another device are ignored. A message without text, or with an attachment, is
// "non-text": 'audio' (a voice note: Fonnte sends its file as `url` only on packages with attachments) or 'media'.
export function incomingMessage(body) {
  const sender = String(body?.sender || '').replace(/\D/g, '');
  if (!sender || body?.member) return null;
  const device = env('FONNTE_DEVICE');
  if (device && normalizePhone(body?.device) !== normalizePhone(device)) return null;
  if (device && sender === normalizePhone(device)) return null;
  const text = String(body?.message ?? '').trim();
  const isMedia = Boolean(body?.url || body?.extension || body?.filename) || !text;
  const extension = isMedia ? extensionOf(body) : '';
  const mimeType = AUDIO_TYPES[extension] || '';
  return {
    id: String(body?.inboxid || `${sender}|${body?.timestamp || ''}|${text}`),
    from: sender,
    type: mimeType ? 'audio' : isMedia ? 'media' : 'text',
    text: isMedia ? '' : text,
    url: isMedia ? String(body?.url || '') : '',
    extension,
    mimeType
  };
}

// The voice note file Fonnte links to: http(s) only, max 10 MB (Fonnte's own limit), 20 s. Returns { data } (base64) or { error }.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export async function downloadAudio(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { error: 'alamat file tidak valid' };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (Number(res.headers.get('content-length')) > MAX_AUDIO_BYTES) return { error: 'file lebih dari 10 MB' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return { error: 'file kosong' };
    if (buf.length > MAX_AUDIO_BYTES) return { error: 'file lebih dari 10 MB' };
    return { data: buf.toString('base64') };
  } catch (e) {
    return { error: 'file tidak dapat diunduh' };
  }
}

// 0812… / +62 812… / 62812… all compare equal
export const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
};

// Only an ACTIVE staff account (Sales, Keuangan, Super Admin) whose phone number is the sender; an ambiguous number
// (two accounts) is refused. Everyone else gets no answer at all.
export const ASSISTANT_ROLES = ['superadmin', 'finance', 'sales'];
export function staffByPhone(from) {
  const wanted = normalizePhone(from);
  if (!wanted) return null;
  const rows = db.prepare("SELECT id, name, email, role, phone FROM users WHERE is_active = 1 AND TRIM(COALESCE(phone, '')) != ''").all()
    .filter(u => ASSISTANT_ROLES.includes(u.role) && normalizePhone(u.phone) === wanted);
  return rows.length === 1 ? rows[0] : null;
}

// Returns { ok, reason } (reason = Fonnte's own explanation, e.g. "token invalid")
export async function sendText(to, text) {
  const chunks = withSignature(String(text || '')).match(/[\s\S]{1,3800}/g) || [''];
  for (const message of chunks) {
    try {
      const res = await fetch(`${apiBase()}/send`, {
        method: 'POST',
        headers: { Authorization: env('FONNTE_TOKEN'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: to, message, countryCode: '0' }),
        signal: AbortSignal.timeout(15000)
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.status === false) {
        const reason = String(out.reason || `HTTP ${res.status}`);
        console.error(`WhatsApp (Fonnte) kirim gagal: ${reason}`);
        return { ok: false, reason };
      }
    } catch (e) {
      console.error('WhatsApp (Fonnte) kirim gagal (jaringan)');
      return { ok: false, reason: 'Server tidak dapat menghubungi api.fonnte.com' };
    }
  }
  return { ok: true, reason: '' };
}

// A document (the invoice PDF) as an upload, so no public link is ever made. Fonnte allows files on its
// Super / Advanced / Ultra packages, max 4 MB; otherwise its `reason` comes back and the caller says so in text.
export async function sendFile(to, buffer, filename, caption = '') {
  const form = new FormData();
  form.append('target', to);
  form.append('message', withSignature(caption));
  form.append('filename', filename);
  form.append('countryCode', '0');
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  try {
    const res = await fetch(`${apiBase()}/send`, { method: 'POST', headers: { Authorization: env('FONNTE_TOKEN') }, body: form, signal: AbortSignal.timeout(60000) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.status === false) {
      const reason = String(out.reason || `HTTP ${res.status}`);
      console.error(`WhatsApp (Fonnte) kirim file gagal: ${reason}`);
      return { ok: false, reason };
    }
    return { ok: true, reason: '' };
  } catch (e) {
    console.error('WhatsApp (Fonnte) kirim file gagal (jaringan)');
    return { ok: false, reason: 'Server tidak dapat menghubungi api.fonnte.com' };
  }
}
