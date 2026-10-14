// Asisten WhatsApp staf, Tahap 2 (AGENTS.md §45): booth tersedia, booking dan invoice lewat chat. Booking / invoice
// hanya disimpan setelah staf membalas YA (dibaca sistem, bukan AI), memakai jalur web yang sama atas nama staf itu,
// dan PDF invoice dikirim sebagai file. Fonnte dan Claude adalah tiruan lokal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

const FAKE_KEY = 'sk-ant-api03-FAKEKEYforWhatsappTests_0123456789abcdef';
const MODEL = 'claude-test-model';
const SECRET = 'rahasia-webhook-tahap2';
const FP = 'FP-TEST-WA2';
const SALES = '6281234567890';
const FINANCE = '6281311112222';
let s;
let claude;
let wa;
const sent = []; // what the server sent through the (mock) Fonnte API: { json } or { form }

const reply = (res, content, stop = 'end_turn') => res.end(JSON.stringify({
  id: 'm', type: 'message', role: 'assistant', model: MODEL, stop_reason: stop, content, usage: { input_tokens: 500, output_tokens: 100 }
}));
const tool = (res, name, input) => reply(res, [{ type: 'tool_use', id: 't1', name, input: { floorplan_id: FP, ...input } }], 'tool_use');
const listen = (handler) => new Promise(resolve => { const srv = http.createServer(handler); srv.listen(0, '127.0.0.1', () => resolve(srv)); });
const readRaw = async (req) => { const parts = []; for await (const c of req) parts.push(c); return Buffer.concat(parts); };
const BOOKING = { brand: 'Teh Dua', nama_pic: 'Rina', whatsapp: '081299990000', kategori: 'F&B', rencana: 'dp', dp_persen: 30 };

before(async () => {
  claude = await listen(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/v1/models')) return res.end(JSON.stringify({ data: [{ id: MODEL, display_name: 'Tes' }] }));
    const body = JSON.parse((await readRaw(req)).toString() || '{}');
    const last = body.messages[body.messages.length - 1];
    // after a tool: the mock just repeats the data, so the tests can read what the tool returned
    if (Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result')) return reply(res, [{ type: 'text', text: `JAWAB ${last.content[0].content}` }]);
    const text = typeof last.content === 'string' ? last.content : '';
    if (text.includes('TERSEDIA')) return tool(res, 'booth_tersedia', {});
    if (text.includes('BOOKING KURANG')) return tool(res, 'siapkan_booking', { ...BOOKING, booth_codes: ['A-03'], whatsapp: '' });
    const booking = /BOOKING (\S+)/.exec(text);
    if (booking) return tool(res, 'siapkan_booking', { ...BOOKING, booth_codes: [booking[1]] });
    const invoice = /INVOICE (\S+)/.exec(text);
    if (invoice) return tool(res, 'siapkan_invoice', { booth_code: invoice[1] });
    return reply(res, [{ type: 'text', text: 'halo' }]);
  });
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
  s = await startServer({
    ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_API_URL: `http://127.0.0.1:${claude.address().port}`,
    FONNTE_TOKEN: 'tok-fonnte', FONNTE_WEBHOOK_SECRET: SECRET, FONNTE_API_URL: `http://127.0.0.1:${wa.address().port}`
  });
  assert.equal((await s.api('PUT', '/maintenance/ai-config', { model: MODEL }, { as: 'superadmin' })).status, 200);
  await createPublishedFloorplan(s.api, FP, ['A-01', 'A-02', 'A-03'].map((c, i) => boothObject(c, { left: i * 300, top: 0 })));
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Satu', brandCategory: 'F&B', phone: '081200000001', bookingType: 'booking', deferInvoice: true }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  for (const [name, email, phone, role] of [['Sari Sales', 'sari@expo.test', '0812-3456-7890', 'sales'], ['Fina Keuangan', 'fina@expo.test', '0813-1111-2222', 'finance']]) {
    const u = await s.api('POST', '/users', { name, email, phone, role, password: 'rahasia123' }, { as: 'superadmin' });
    assert.ok([200, 201].includes(u.status), u.text);
  }
});
after(async () => { await s?.stop(); claude?.close(); wa?.close(); });

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
const textOf = (out) => out.map(m => m.json?.message || m.form?.message || '').join('\n');
const booth = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const invoicesOf = async (code) => (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.filter(i => i.floorplan_id === FP && i.booth_code === code);

test('booth tersedia: hanya booth Available, dengan ukuran dan harga', async () => {
  const msg = textOf(await chat(SALES, 'booth apa saja yang TERSEDIA?'));
  assert.match(msg, /A-02/);
  assert.match(msg, /A-03/);
  assert.ok(!/"A-01"/.test(msg), 'booth yang sudah dibooking tidak ikut');
  assert.match(msg, /10000000/);
});

test('booking: AI hanya menyiapkan; tersimpan setelah staf membalas YA, atas nama staf itu', async () => {
  const ask = textOf(await chat(SALES, 'tolong BOOKING A-02'));
  assert.match(ask, /Balas YA/);
  assert.match(ask, /Teh Dua/);
  assert.match(ask, /DP 30%/);
  assert.equal((await booth('A-02')).status, 'available', 'belum ada yang tersimpan sebelum YA');

  const done = textOf(await chat(SALES, 'Ya'));
  assert.match(done, /tersimpan/i);
  const b = await booth('A-02');
  assert.equal(b.status, 'reserved');
  assert.equal(b.owner_name, 'Teh Dua');
  const plan = (await s.api('GET', `/booth-actions/summary?floorplanId=${FP}&boothCode=A-02`, undefined, { as: 'superadmin' })).body;
  assert.equal(plan.booth.ownerName, 'Teh Dua');
  const logs = (await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' })).body.logs;
  assert.ok(logs.some(l => l.userName === 'Sari Sales' && /WhatsApp/.test(`${l.action} ${l.summary}`)), 'tercatat atas nama Sari, via WhatsApp');
});

test('YA tanpa permintaan yang menunggu, dan BATAL: tidak ada yang tersimpan', async () => {
  assert.match(textOf(await chat(SALES, 'ya')), /tidak ada/i);
  assert.match(textOf(await chat(SALES, 'BOOKING A-03')), /Balas YA/);
  assert.match(textOf(await chat(SALES, 'batal')), /dibatalkan/i);
  assert.match(textOf(await chat(SALES, 'ya')), /tidak ada/i);
  assert.equal((await booth('A-03')).status, 'available');
});

test('data kurang, booth sudah diambil, dan role tanpa hak booking: ditolak sebelum konfirmasi', async () => {
  assert.match(textOf(await chat(SALES, 'BOOKING KURANG')), /WhatsApp tenant/);
  assert.match(textOf(await chat(SALES, 'BOOKING A-01')), /sudah/);
  assert.match(textOf(await chat(FINANCE, 'BOOKING A-03')), /tidak dapat membuat booking/i);
  assert.match(textOf(await chat(FINANCE, 'ya')), /tidak ada/i);
  assert.equal((await booth('A-03')).status, 'available');
});

test('invoice: rencana DP 30% menerbitkan Invoice DP setelah YA; nomor, total dan PDF dikirim ke WhatsApp', async () => {
  const ask = textOf(await chat(FINANCE, 'INVOICE A-02'));
  assert.match(ask, /Balas YA/);
  assert.match(ask, /DP 30%/);
  assert.equal((await invoicesOf('A-02')).length, 0);

  const out = await chat(FINANCE, 'YA', 2);
  const [inv] = await invoicesOf('A-02');
  assert.ok(inv, 'invoice terbit');
  assert.equal(inv.invoice_kind, 'dp');
  const msg = textOf(out);
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
  assert.match(textOf(await chat(FINANCE, 'INVOICE A-02')), /sudah/, 'tidak bisa dobel');
});
