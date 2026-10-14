import crypto from 'crypto';
import db from '../db.js';

// WhatsApp through Fonnte (https://fonnte.com) for the staff assistant (AGENTS.md §45). Secrets only in server/.env:
// FONNTE_TOKEN (device token, sends the replies), FONNTE_WEBHOOK_SECRET (part of the webhook URL: Fonnte does not sign
// its calls), optional FONNTE_DEVICE (the connected number: messages from / to other devices are ignored).
// FONNTE_API_URL lets the tests point at a local mock; production uses https://api.fonnte.com.
const apiBase = () => (process.env.FONNTE_API_URL || 'https://api.fonnte.com').replace(/\/+$/, '');
const env = (name) => String(process.env[name] || '').trim();

export const waEnabled = () => Boolean(env('FONNTE_TOKEN') && env('FONNTE_WEBHOOK_SECRET'));

// The secret in the webhook URL, compared in constant time
export function secretMatches(given) {
  const secret = env('FONNTE_WEBHOOK_SECRET');
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(secret);
  return Boolean(secret) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Fonnte posts one message per call: { device, sender, message, member, url, filename, extension, inboxid, timestamp, ... }
// Groups (`member` set) and calls for another device are ignored. A message without text, or with an attachment, is "non-text".
export function incomingMessage(body) {
  const sender = String(body?.sender || '').replace(/\D/g, '');
  if (!sender || body?.member) return null;
  const device = env('FONNTE_DEVICE');
  if (device && normalizePhone(body?.device) !== normalizePhone(device)) return null;
  if (device && sender === normalizePhone(device)) return null;
  const text = String(body?.message ?? '').trim();
  const isMedia = Boolean(body?.url || body?.extension || body?.filename) || !text;
  return {
    id: String(body?.inboxid || `${sender}|${body?.timestamp || ''}|${text}`),
    from: sender,
    type: isMedia ? 'media' : 'text',
    text: isMedia ? '' : text
  };
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
  const chunks = String(text || '').match(/[\s\S]{1,3800}/g) || [''];
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
  form.append('message', caption);
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
