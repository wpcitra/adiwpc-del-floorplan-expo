// Agen Gemini untuk asisten WhatsApp staf (AGENTS.md §45): pesan bebas dijawab Gemini dengan alat baca data dan alat
// siapkan booking / invoice; konfirmasinya buatan sistem dan hanya YA yang menyimpan. Kata perintah tetap dijawab sistem.
// Kunci Gemini hanya-tulis (Setting > Integrasi WhatsApp, Super Admin). Gemini dan Fonnte adalah tiruan lokal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

const SECRET = 'rahasia-webhook-gemini';
const FP = 'FP-TEST-GEMINI';
const SALES = '6281234567890';
const FINANCE = '6281311112222';
const GOOD_KEY = 'AIzaTesKunciGeminiBenar0001';
const BAD_KEY = 'AIzaTesKunciGeminiSalah0002';
const AUTH_KEY = 'AQ.Ab8RN6TesKunciAuthBaru-Google.0003'; // new AI Studio "auth key" format (dots)
const OPEN_KEY = 'AIzaTesKunciTanpaBatasan0004'; // a standard key without restrictions: Google answers 403
let s;
let wa;
let gm;
const sent = []; // messages sent through the (mock) Fonnte API
const geminiCalls = []; // generateContent requests received by the (mock) Gemini API: { model, key, body }
const replies = []; // scripted Gemini answers, one per generateContent call ({ status, body } for an error)

const listen = (handler) => new Promise(resolve => { const srv = http.createServer(handler); srv.listen(0, '127.0.0.1', () => resolve(srv)); });
const readRaw = async (req) => { const parts = []; for await (const c of req) parts.push(c); return Buffer.concat(parts).toString(); };
const modelSays = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
const modelCalls = (name, args, thoughtSignature = 'sig-1') => ({
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args, id: `call-${name}` }, thoughtSignature }] }, finishReason: 'STOP' }]
});
const toolNames = (call) => (call.body.tools?.[0]?.functionDeclarations || []).map(d => d.name);

before(async () => {
  wa = await listen(async (req, res) => {
    sent.push(JSON.parse(await readRaw(req) || '{}'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: true }));
  });
  gm = await listen(async (req, res) => {
    const raw = await readRaw(req);
    const key = req.headers['x-goog-api-key'];
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (key === BAD_KEY) return send(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } });
    if (key === OPEN_KEY) return send(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Requests from unrestricted API keys are not allowed.' } });
    if (req.method === 'GET' && req.url.startsWith('/v1beta/models')) {
      return send(200, { models: [
        { name: 'models/gemini-3-flash-preview', displayName: 'Gemini 3 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] }
      ] });
    }
    const m = /^\/v1beta\/models\/([^/:]+):generateContent$/.exec(req.url);
    if (req.method === 'POST' && m) {
      geminiCalls.push({ model: m[1], key, body: JSON.parse(raw) });
      const next = replies.shift() || modelSays('(tidak ada jawaban tiruan)');
      return next.status ? send(next.status, next.body) : send(200, next);
    }
    send(404, {});
  });
  s = await startServer({
    FONNTE_TOKEN: 'tok-fonnte', FONNTE_WEBHOOK_SECRET: SECRET, FONNTE_API_URL: `http://127.0.0.1:${wa.address().port}`,
    GEMINI_API_URL: `http://127.0.0.1:${gm.address().port}`
  });
  await createPublishedFloorplan(s.api, FP, ['A-01', 'A-02', 'A-03'].map((c, i) => boothObject(c, { left: i * 300, top: 0 })));
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Satu', brandCategory: 'F&B', phone: '081200000001', bookingType: 'booking', deferInvoice: true }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  for (const [name, email, phone, role] of [['Sari Sales', 'sari@expo.test', '0812-3456-7890', 'sales'], ['Fina Keuangan', 'fina@expo.test', '0813-1111-2222', 'finance']]) {
    const u = await s.api('POST', '/users', { name, email, phone, role, password: 'rahasia123' }, { as: 'superadmin' });
    assert.ok([200, 201].includes(u.status), u.text);
  }
  const key = await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: GOOD_KEY }, { as: 'superadmin' });
  assert.equal(key.status, 200, key.text);
});
after(async () => { await s?.stop(); wa?.close(); gm?.close(); });

let counter = 0;
// Send one WhatsApp message from `sender` and return the text of the reply
async function say(sender, message) {
  const n = sent.length;
  const r = await fetch(`${s.base}/whatsapp/webhook/${SECRET}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: '628111000111', sender, message, inboxid: `g${++counter}`, timestamp: Date.now() })
  });
  assert.equal(r.status, 200);
  for (let i = 0; i < 300 && sent.length < n + 1; i++) await new Promise(res => setTimeout(res, 50));
  return sent.slice(n).map(m => m.message || '').join('\n');
}
const booth = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const geminiStatus = async () => (await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'superadmin' })).body.status.gemini;

test('pengaturan Gemini: hanya Super Admin; kunci hanya-tulis (4 huruf terakhir); kunci salah ditolak dan kunci lama tetap; pilihan model', async () => {
  assert.equal((await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'sales' })).status, 403);
  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: GOOD_KEY }, { as: 'finance' })).status, 403);

  const st = await geminiStatus();
  assert.equal(st.configured, true);
  assert.equal(st.hint, '…0001');
  assert.equal(st.enabled, true);
  assert.equal(st.model, 'gemini-flash-latest');
  const full = await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'superadmin' });
  assert.ok(!full.text.includes(GOOD_KEY), 'kunci tidak pernah dikirim balik');

  const bad = await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: BAD_KEY }, { as: 'superadmin' });
  assert.equal(bad.status, 400, bad.text);
  assert.match(bad.body.error, /ditolak|tidak valid/i);
  assert.equal((await geminiStatus()).hint, '…0001', 'kunci lama tetap');
  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: 'ada spasi di sini' }, { as: 'superadmin' })).status, 400);

  // a key Google refuses because it has no restrictions: the answer says how to fix it in AI Studio
  const open = await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: OPEN_KEY }, { as: 'superadmin' });
  assert.equal(open.status, 400, open.text);
  assert.match(open.body.error, /Restrict to Gemini API only/);
  assert.match(open.body.error, /unrestricted API keys/, 'alasan dari Google ikut ditampilkan');
  // the new AI Studio key format (with dots) is accepted and checked with Google
  const auth = await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: AUTH_KEY }, { as: 'superadmin' });
  assert.equal(auth.status, 200, auth.text);
  assert.equal(auth.body.status.gemini.hint, '…0003');
  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { apiKey: GOOD_KEY }, { as: 'superadmin' })).status, 200);

  const models = await s.api('GET', '/maintenance/whatsapp/gemini/models', undefined, { as: 'superadmin' });
  assert.equal(models.status, 200, models.text);
  assert.deepEqual(models.body.models.map(m => m.id), ['gemini-3-flash-preview'], 'hanya model yang bisa generateContent');
  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { model: 'models/../x y' }, { as: 'superadmin' })).status, 400);
  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { model: 'gemini-3-flash-preview' }, { as: 'superadmin' })).status, 200);
  assert.equal((await geminiStatus()).model, 'gemini-3-flash-preview');

  const logs = await s.api('GET', '/audit-logs?category=Maintenance', undefined, { as: 'superadmin' });
  assert.ok(logs.body.logs.some(l => /gemini/i.test(l.action)), 'tercatat di Log Aktivitas');
  assert.ok(![GOOD_KEY, BAD_KEY, AUTH_KEY, OPEN_KEY].some(k => logs.text.includes(k)), 'nilai kunci tidak tercatat');
});

test('pesan bebas dijawab Gemini memakai alat data; balasan model dikembalikan apa adanya; **tebal** jadi *tebal*', async () => {
  const n = geminiCalls.length;
  replies.push(modelCalls('detail_booth', { nomor_booth: 'A-01' }, 'sig-A'), modelSays('Booth A-01 dipakai **Kopi Satu**.'));
  assert.equal(await say(SALES, 'siapa yang ada di booth A-01 ya?'), 'Booth A-01 dipakai *Kopi Satu*.');

  const calls = geminiCalls.slice(n);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, GOOD_KEY);
  assert.equal(calls[0].model, 'gemini-3-flash-preview');
  assert.ok(calls[0].body.systemInstruction?.parts?.[0]?.text, 'instruksi sistem dikirim');
  assert.ok(toolNames(calls[0]).includes('siapkan_booking'));
  const contents = calls[1].body.contents;
  const modelTurn = contents[contents.length - 2];
  assert.equal(modelTurn.role, 'model');
  assert.equal(modelTurn.parts[0].thoughtSignature, 'sig-A', 'thought signature dikembalikan');
  const answer = contents[contents.length - 1].parts[0].functionResponse;
  assert.equal(answer.name, 'detail_booth');
  assert.equal(answer.id, 'call-detail_booth');
  assert.match(JSON.stringify(answer.response), /Kopi Satu/);
});

test('kata perintah tetap dijawab sistem tanpa Gemini; kalimat yang bukan perintah diteruskan ke Gemini; riwayat obrolan ikut', async () => {
  const n = geminiCalls.length;
  assert.match(await say(SALES, 'TERSEDIA'), /Booth tersedia/);
  assert.match(await say(SALES, 'BOOTH A-01'), /Kopi Satu/);
  assert.match(await say(SALES, 'RINGKASAN'), /Ringkasan/);
  assert.equal(geminiCalls.length, n, 'perintah tidak memanggil Gemini');

  replies.push(modelSays('Ada 2 booth kosong.'));
  assert.equal(await say(SALES, 'booth mana yang masih kosong?'), 'Ada 2 booth kosong.');
  replies.push(modelSays('Sama-sama.'));
  assert.equal(await say(SALES, 'terima kasih'), 'Sama-sama.');
  const last = geminiCalls[geminiCalls.length - 1].body.contents;
  assert.ok(JSON.stringify(last).includes('booth mana yang masih kosong?') && JSON.stringify(last).includes('Ada 2 booth kosong.'), 'pesan sebelumnya ikut');
});

test('booking lewat obrolan: Gemini menyiapkan, sistem mengirim konfirmasinya sendiri, hanya YA yang menyimpan', async () => {
  const n = geminiCalls.length;
  replies.push(modelCalls('siapkan_booking', { nomor_booth: ['A-02'], brand: 'Teh Dua', nama_pic: 'Rina', whatsapp: '081200000002', kategori: 'F&B', rencana: 'dp', dp_persen: 30 }));
  const confirm = await say(SALES, 'tolong bookingkan A-02 untuk Teh Dua, PIC Rina 081200000002, F&B, DP 30');
  assert.match(confirm, /Konfirmasi BOOKING/);
  assert.match(confirm, /A-02/);
  assert.match(confirm, /Teh Dua/);
  assert.match(confirm, /DP 30%/);
  assert.match(confirm, /Balas YA/);
  assert.equal(geminiCalls.length, n + 1, 'loop berhenti setelah booking disiapkan');
  assert.equal((await booth('A-02')).status, 'available', 'belum tersimpan sebelum YA');

  const saved = await say(SALES, 'ya');
  assert.match(saved, /Booking tersimpan/);
  assert.equal(geminiCalls.length, n + 1, 'YA dijawab sistem, bukan Gemini');
  const b = await booth('A-02');
  assert.equal(b.status, 'reserved');
  assert.equal(b.owner_name, 'Teh Dua');
});

test('Keuangan tidak bisa booking lewat Gemini: alasannya kembali ke Gemini, YA tidak menyimpan apa pun', async () => {
  const n = geminiCalls.length;
  replies.push(
    modelCalls('siapkan_booking', { nomor_booth: ['A-03'], brand: 'Roti Tiga', nama_pic: 'Tono', whatsapp: '081200000003', kategori: 'F&B', rencana: 'penuh' }),
    modelSays('Maaf, akun Keuangan tidak bisa membuat booking.')
  );
  assert.equal(await say(FINANCE, 'bookingkan A-03 untuk Roti Tiga'), 'Maaf, akun Keuangan tidak bisa membuat booking.');
  const toolAnswer = geminiCalls[n + 1].body.contents.at(-1).parts[0].functionResponse;
  assert.match(JSON.stringify(toolAnswer.response), /tidak dapat membuat booking/);

  replies.push(modelSays('Ada lagi yang bisa dibantu?'));
  assert.equal(await say(FINANCE, 'ya'), 'Ada lagi yang bisa dibantu?', 'tanpa permintaan menunggu, "ya" diteruskan ke Gemini');
  assert.equal((await booth('A-03')).status, 'available');
});

test('Gemini gagal (kuota habis): staf mendapat alasannya dan diarahkan ke MENU', async () => {
  replies.push({ status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } });
  const r = await say(SALES, 'halo');
  assert.match(r, /kuota/i);
  assert.match(r, /MENU/);
});

test('coba tanya dari halaman Setting: hanya alat baca, jawabannya kembali ke halaman', async () => {
  replies.push(modelSays('Ada 1 booth kosong.'));
  const r = await s.api('POST', '/maintenance/whatsapp/gemini/test', { question: 'booth kosong ada berapa?' }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.answer, 'Ada 1 booth kosong.');
  const names = toolNames(geminiCalls.at(-1));
  assert.ok(names.includes('booth_tersedia'));
  assert.ok(!names.includes('siapkan_booking') && !names.includes('siapkan_invoice'), 'tanpa alat yang menyiapkan aksi');
  assert.equal((await s.api('POST', '/maintenance/whatsapp/gemini/test', { question: 'x' }, { as: 'sales' })).status, 403);
});

test('agen dimatikan lalu kunci dihapus: pesan bebas dijawab MENU tanpa memanggil Gemini', async () => {
  const off = await s.api('PUT', '/maintenance/whatsapp/gemini', { enabled: false }, { as: 'superadmin' });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.body.status.gemini.enabled, false);
  const n = geminiCalls.length;
  assert.match(await say(SALES, 'halo lagi'), /Ketik salah satu perintah/);
  assert.equal(geminiCalls.length, n);

  assert.equal((await s.api('PUT', '/maintenance/whatsapp/gemini', { enabled: true }, { as: 'superadmin' })).status, 200);
  const del = await s.api('DELETE', '/maintenance/whatsapp/gemini', undefined, { as: 'superadmin' });
  assert.equal(del.status, 200, del.text);
  assert.equal(del.body.status.gemini.configured, false);
  assert.match(await say(SALES, 'halo sekali lagi'), /Ketik salah satu perintah/);
  assert.equal(geminiCalls.length, n);
});
