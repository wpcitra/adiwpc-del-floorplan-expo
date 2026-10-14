import express from 'express';
import { waEnabled, secretMatches, incomingMessage, staffByPhone, sendText } from '../utils/whatsapp.js';
import { answerStaff } from '../utils/waAgent.js';

// WhatsApp (Fonnte) webhook of the staff assistant (AGENTS.md §45). Public path; Fonnte does not sign its calls, so the
// URL itself carries a secret: /api/whatsapp/webhook/<FONNTE_WEBHOOK_SECRET>.
const router = express.Router();

const seen = new Set(); // message ids already handled (Fonnte retries a call that did not get a 200)
const recent = new Map(); // sender -> timestamps, max 20 messages per 10 minutes
const allowed = (from) => {
  const now = Date.now();
  const list = (recent.get(from) || []).filter(t => now - t < 10 * 60 * 1000);
  list.push(now);
  recent.set(from, list);
  return list.length <= 20;
};

export async function processMessage(m) {
  if (seen.has(m.id)) return;
  seen.add(m.id);
  if (seen.size > 2000) seen.delete(seen.values().next().value);

  const user = staffByPhone(m.from);
  if (!user) return; // not a staff number: no answer, nothing revealed
  if (!allowed(m.from)) { await sendText(m.from, 'Terlalu banyak pesan dalam waktu singkat. Coba lagi beberapa menit lagi.'); return; }
  if (m.type !== 'text') {
    await sendText(m.from, 'Saat ini saya hanya membaca pesan teks. Voice note dan gambar belum didukung, silakan ketik pertanyaannya.');
    return;
  }
  await sendText(m.from, await answerStaff(user, m.text));
}

// POST: answered at once (200), the reply is sent afterwards through Fonnte. A wrong secret looks like a missing page.
router.post('/webhook/:secret', (req, res) => {
  if (!waEnabled() || !secretMatches(req.params.secret)) return res.sendStatus(404);
  res.sendStatus(200);
  const m = incomingMessage(req.body);
  if (m) processMessage(m).catch(e => console.error('WhatsApp proses pesan gagal:', e));
});

export default router;
