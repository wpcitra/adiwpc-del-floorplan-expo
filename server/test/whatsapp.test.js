// Asisten WhatsApp (Fonnte) untuk staf, Tahap 1 (AGENTS.md §45): rahasia di URL webhook, hanya nomor staf, hanya membaca,
// voice note ditolak sopan. Fonnte dan Claude adalah tiruan lokal: tes tidak memanggil layanan asli.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

const FAKE_KEY = 'sk-ant-api03-FAKEKEYforWhatsappTests_0123456789abcdef';
const MODEL = 'claude-test-model';
const SECRET = 'rahasia-webhook-tes';
const FP = 'FP-TEST-WA';
let s;
let claude;
let wa;
const sent = []; // messages the server sent through the (mock) Fonnte API
const claudeSeen = [];

const reply = (res, content, stop = 'end_turn') => res.end(JSON.stringify({
  id: 'm', type: 'message', role: 'assistant', model: MODEL, stop_reason: stop, content, usage: { input_tokens: 500, output_tokens: 100 }
}));
const listen = (handler) => new Promise(resolve => { const srv = http.createServer(handler); srv.listen(0, '127.0.0.1', () => resolve(srv)); });
const readJson = async (req) => { let raw = ''; for await (const c of req) raw += c; return JSON.parse(raw || '{}'); };

before(async () => {
  claude = await listen(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/v1/models')) return res.end(JSON.stringify({ data: [{ id: MODEL, display_name: 'Tes' }] }));
    const body = await readJson(req);
    claudeSeen.push(body);
    const last = body.messages[body.messages.length - 1];
    if (Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result')) {
      const data = last.content[0].content;
      return reply(res, [{ type: 'text', text: `Hasil: ${data.includes('Kopi Satu') ? 'Kopi Satu di A-01' : 'tidak ada'}` }]);
    }
    const text = typeof last.content === 'string' ? last.content : '';
    if (text.includes('BUATKAN')) return reply(res, [{ type: 'tool_use', id: 't1', name: 'buat_invoice', input: { booth_code: 'A-01' } }], 'tool_use');
    if (text.includes('DETAIL')) return reply(res, [{ type: 'tool_use', id: 't1', name: 'detail_booth', input: { booth_code: 'A-01', floorplan_id: FP } }], 'tool_use');
    return reply(res, [{ type: 'tool_use', id: 't1', name: 'cari_booth', input: { query: 'kopi', floorplan_id: FP } }], 'tool_use');
  });
  wa = await listen(async (req, res) => { sent.push({ url: req.url, auth: req.headers.authorization, body: await readJson(req) }); res.end(JSON.stringify({ status: true })); });
  s = await startServer({
    ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_API_URL: `http://127.0.0.1:${claude.address().port}`,
    FONNTE_TOKEN: 'tok-fonnte', FONNTE_WEBHOOK_SECRET: SECRET, FONNTE_API_URL: `http://127.0.0.1:${wa.address().port}`
  });
  assert.equal((await s.api('PUT', '/maintenance/ai-config', { model: MODEL }, { as: 'superadmin' })).status, 200);
  await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 300, top: 0 })]);
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Satu', brandCategory: 'F&B', phone: '081200000001', bookingType: 'booking', deferInvoice: true, paymentType: 'dp', dpPercent: 30 }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  const u = await s.api('POST', '/users', { name: 'Sari Sales', email: 'sari@expo.test', phone: '0812-3456-7890', role: 'sales', password: 'rahasia123' }, { as: 'superadmin' });
  assert.ok([200, 201].includes(u.status), u.text);
});
after(async () => { await s?.stop(); claude?.close(); wa?.close(); });

const call = (payload, secret = SECRET) => fetch(`${s.base}/whatsapp/webhook/${secret}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
});
let counter = 0;
// the body Fonnte posts: one message per call
const text = (sender, message, extra = {}) => ({ device: '628111000111', sender, message, inboxid: ++counter, timestamp: Date.now(), ...extra });
async function waitSent(count) {
  for (let i = 0; i < 60 && sent.length < count; i++) await new Promise(r => setTimeout(r, 100));
  return sent.slice(count - 1);
}

test('rahasia di URL salah: 404 dan tidak diproses (Fonnte tidak menandatangani panggilannya)', async () => {
  const before = sent.length;
  assert.equal((await call(text('6281234567890', 'halo'), 'salah')).status, 404);
  assert.ok([401, 404].includes((await fetch(`${s.base}/whatsapp/webhook`, { method: 'POST' })).status), 'tanpa rahasia tidak bisa masuk');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(sent.length, before);
});

test('nomor yang bukan staf tidak dijawab sama sekali', async () => {
  const before = sent.length;
  assert.equal((await call(text('6285555555555', 'cari booth kopi'))).status, 200);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(sent.length, before);
});

test('staf (nomor 0812-3456-7890 = 6281234567890): pertanyaan dijawab dari data, balasan lewat WhatsApp API', async () => {
  const n = sent.length;
  assert.equal((await call(text('6281234567890', 'booth kopi ada di mana?'))).status, 200);
  const [msg] = await waitSent(n + 1);
  assert.equal(msg.url, '/send');
  assert.equal(msg.auth, 'tok-fonnte', 'token Fonnte tanpa Bearer');
  assert.equal(msg.body.target, '6281234567890');
  assert.match(msg.body.message, /Kopi Satu di A-01/);
});

test('detail booth memuat rencana pembayaran DP dan tidak membocorkan email', async () => {
  const n = sent.length;
  claudeSeen.length = 0;
  await call(text('6281234567890', 'DETAIL A-01'));
  await waitSent(n + 1);
  const toolResult = JSON.stringify(claudeSeen[claudeSeen.length - 1].messages.at(-1));
  assert.match(toolResult, /DP 30%/);
  assert.ok(!/email/i.test(toolResult), 'tanpa email');
});

test('Tahap 1 hanya membaca: tool tulis seperti buat_invoice tidak ada, tidak ada invoice yang lahir', async () => {
  const tools = claudeSeen[0].tools.map(t => t.name).sort();
  assert.deepEqual(tools, ['cari_booth', 'daftar_project', 'detail_booth', 'ringkasan_project']);
  const n = sent.length;
  await call(text('6281234567890', 'BUATKAN invoice A-01'));
  await waitSent(n + 1);
  const invoices = (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' })).body.invoices || [];
  assert.equal(invoices.length, 0);
});

test('voice note dijawab sopan: belum didukung', async () => {
  const n = sent.length;
  await call(text('6281234567890', '', { url: 'https://example.test/vn.ogg', extension: 'ogg' }));
  const [msg] = await waitSent(n + 1);
  assert.match(msg.body.message, /voice note/i);
});

test('grup (member terisi) dan perangkat lain diabaikan', async () => {
  const n = sent.length;
  await call(text('6281234567890', 'cari kopi', { member: '6281111' }));
  await call(text('6281234567890', 'cari kopi'));
  await waitSent(n + 1);
  await new Promise(r => setTimeout(r, 400));
  assert.equal(sent.length, n + 1, 'hanya pesan pribadi yang dijawab');
});

test('pesan yang sama (retry Fonnte) hanya diproses sekali', async () => {
  const payload = text('6281234567890', 'booth kopi?', { inboxid: 99999 });
  const n = sent.length;
  await call(payload);
  await waitSent(n + 1);
  await call(payload);
  await new Promise(r => setTimeout(r, 500));
  assert.equal(sent.length, n + 1);
});
