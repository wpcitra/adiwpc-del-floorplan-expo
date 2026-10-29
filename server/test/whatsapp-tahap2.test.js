// Asisten WhatsApp staf, booking & invoice dengan kata perintah (AGENTS.md §45): BOOKING menanyakan data satu per satu,
// INVOICE menyiapkan invoice; keduanya hanya disimpan setelah staf membalas YA, lewat jalur web yang sama atas nama staf
// itu, dan PDF invoice dikirim sebagai file. Tanpa AI. Fonnte adalah tiruan lokal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

const SECRET = 'rahasia-webhook-tahap2';
const FP = 'FP-TEST-WA2';
const SALES = '6281234567890';
const FINANCE = '6281311112222';
let s;
let wa;
const sent = []; // what the server sent through the (mock) Fonnte API: { json } or { form }

const listen = (handler) => new Promise(resolve => { const srv = http.createServer(handler); srv.listen(0, '127.0.0.1', () => resolve(srv)); });
const readRaw = async (req) => { const parts = []; for await (const c of req) parts.push(c); return Buffer.concat(parts); };

before(async () => {
  wa = await listen(async (req, res) => {
    const raw = await readRaw(req);
    const type = req.headers['content-type'] || '';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Response(raw, { headers: { 'content-type': type } }).formData();
      const file = form.get('file');
      sent.push({ form: { target: form.get('target'), filename: form.get('filename'), message: form.get('message'), size: file?.size || 0, head: file ? Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString() : '' } });
    } else {
      sent.push({ json: JSON.parse(raw.toString() || '{}') });
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: true }));
  });
  s = await startServer({ FONNTE_TOKEN: 'tok-fonnte', FONNTE_WEBHOOK_SECRET: SECRET, FONNTE_API_URL: `http://127.0.0.1:${wa.address().port}` });
  await createPublishedFloorplan(s.api, FP, ['A-01', 'A-02', 'A-03'].map((c, i) => boothObject(c, { left: i * 300, top: 0 })));
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Satu', brandCategory: 'F&B', phone: '081200000001', bookingType: 'booking', deferInvoice: true }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  for (const [name, email, phone, role] of [['Sari Sales', 'sari@expo.test', '0812-3456-7890', 'sales'], ['Fina Keuangan', 'fina@expo.test', '0813-1111-2222', 'finance']]) {
    const u = await s.api('POST', '/users', { name, email, phone, role, password: 'rahasia123' }, { as: 'superadmin' });
    assert.ok([200, 201].includes(u.status), u.text);
  }
});
after(async () => { await s?.stop(); wa?.close(); });

let counter = 0;
// Send one WhatsApp message from `sender` and wait for the replies it produces
async function chat(sender, message, replies = 1) {
  const n = sent.length;
  const r = await fetch(`${s.base}/whatsapp/webhook/${SECRET}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: '628111000111', sender, message, inboxid: ++counter, timestamp: Date.now() })
  });
  assert.equal(r.status, 200);
  for (let i = 0; i < 300 && sent.length < n + replies; i++) await new Promise(res => setTimeout(res, 100));
  return sent.slice(n);
}
const say = async (sender, message, replies) => (await chat(sender, message, replies)).map(m => m.json?.message || m.form?.message || '').join('\n');
const booth = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const invoicesOf = async (code) => (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.filter(i => i.floorplan_id === FP && i.booth_code === code);

test('BOOKING menanyakan data satu per satu; tersimpan setelah YA, atas nama staf itu', async () => {
  assert.match(await say(SALES, 'booking a-02'), /brand/i);
  assert.match(await say(SALES, 'Teh Dua'), /PIC/);
  assert.match(await say(SALES, 'Rina'), /WhatsApp/);
  assert.match(await say(SALES, 'bukan nomor'), /WhatsApp/, 'nomor tidak valid ditanya ulang');
  assert.match(await say(SALES, '0812-9999-0000'), /[Kk]ategori/);
  assert.match(await say(SALES, 'F&B'), /PENUH|DP/);
  assert.match(await say(SALES, 'DP 150'), /DP/, 'persen di luar 1-99 ditanya ulang');
  const ask = await say(SALES, 'dp 30');
  assert.match(ask, /Balas YA/);
  assert.match(ask, /Teh Dua/);
  assert.match(ask, /DP 30%/);
  assert.equal((await booth('A-02')).status, 'available', 'belum ada yang tersimpan sebelum YA');

  assert.match(await say(SALES, 'Ya'), /tersimpan/i);
  const b = await booth('A-02');
  assert.equal(b.status, 'reserved');
  assert.equal(b.owner_name, 'Teh Dua');
  const logs = (await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' })).body.logs;
  assert.ok(logs.some(l => l.userName === 'Sari Sales' && /WhatsApp/.test(`${l.action} ${l.summary}`)), 'tercatat atas nama Sari, via WhatsApp');
});

test('YA tanpa permintaan yang menunggu, dan BATAL di tengah pertanyaan: tidak ada yang tersimpan', async () => {
  assert.match(await say(SALES, 'ya'), /tidak ada/i);
  assert.match(await say(SALES, 'BOOKING A-03'), /brand/i);
  assert.match(await say(SALES, 'Batal'), /dibatalkan/i);
  assert.match(await say(SALES, 'ya'), /tidak ada/i);
  assert.equal((await booth('A-03')).status, 'available');
});

test('booth sudah diambil, booth tidak ada, dan role tanpa hak booking: ditolak sebelum bertanya', async () => {
  assert.match(await say(SALES, 'BOOKING A-01'), /sudah/);
  assert.match(await say(SALES, 'BOOKING Z-99'), /tidak ditemukan/i);
  assert.match(await say(FINANCE, 'BOOKING A-03'), /tidak dapat membuat booking/i);
  assert.match(await say(FINANCE, 'ya'), /tidak ada/i);
  assert.equal((await booth('A-03')).status, 'available');
});

test('INVOICE: rencana DP 30% menerbitkan Invoice DP setelah YA; nomor, total dan PDF dikirim ke WhatsApp', async () => {
  const ask = await say(FINANCE, 'invoice A-02');
  assert.match(ask, /Balas YA/);
  assert.match(ask, /DP 30%/);
  assert.equal((await invoicesOf('A-02')).length, 0);

  const out = await chat(FINANCE, 'YA', 2);
  const [inv] = await invoicesOf('A-02');
  assert.ok(inv, 'invoice terbit');
  assert.equal(inv.invoice_kind, 'dp');
  const msg = out.map(m => m.json?.message || m.form?.message || '').join('\n');
  assert.match(msg, new RegExp(inv.invoice_number.replace(/[/.]/g, '\\$&')));
  const pdfEngine = (await (await fetch(`${s.base}/health`)).json()).pdfEngine;
  const file = out.find(m => m.form);
  if (pdfEngine) {
    assert.ok(file, 'mesin PDF tersedia: PDF wajib dikirim sebagai file');
    assert.equal(file.form.target, FINANCE);
    assert.match(file.form.filename, /\.pdf$/);
    assert.equal(file.form.head, '%PDF-');
  } else {
    assert.match(msg, /PDF/, 'tanpa mesin PDF: alasannya dikabarkan, nomor invoice tetap terkirim');
  }
  // the invoice exists: INVOICE sends it again (by booth or by invoice number), no second invoice, no YA
  for (const ask of ['INVOICE A-02', `INVOICE ${inv.invoice_number}`]) {
    const again = await chat(FINANCE, ask, 2);
    const againMsg = again.map(m => m.json?.message || m.form?.message || '').join('\n');
    assert.match(againMsg, /sudah ada/, ask);
    assert.match(againMsg, new RegExp(inv.invoice_number.replace(/[/.]/g, '\\$&')));
    if (pdfEngine) assert.ok(again.some(m => m.form?.head === '%PDF-'), `${ask}: PDF dikirim lagi`);
  }
  assert.equal((await invoicesOf('A-02')).length, 1, 'tidak dobel');
  assert.match(await say(FINANCE, 'INVOICE A-03'), /belum punya tenant/i);
});
