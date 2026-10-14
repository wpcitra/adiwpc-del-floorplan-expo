// Setting > Integrasi WhatsApp (Fonnte), Super Admin saja (AGENTS.md §45): token write-only, rahasia webhook, pesan tes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './helpers.js';

const TOKEN = 'TokenFonnteRahasia1234567890';
let s;
let fonnte;
const sent = [];

before(async () => {
  fonnte = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    sent.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.headers.authorization === TOKEN ? { status: true, detail: 'success! message in queue' } : { status: false, reason: 'token invalid' }));
  });
  await new Promise(r => fonnte.listen(0, '127.0.0.1', r));
  s = await startServer({ FONNTE_API_URL: `http://127.0.0.1:${fonnte.address().port}` });
});
after(async () => { await s?.stop(); fonnte?.close(); });

test('hanya Super Admin: Sales, Keuangan, dan pengunjung ditolak', async () => {
  assert.equal((await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'sales' })).status, 403);
  assert.equal((await s.api('PUT', '/maintenance/whatsapp', { token: TOKEN }, { as: 'finance' })).status, 403);
  assert.equal((await s.api('GET', '/maintenance/whatsapp')).status, 401);
});

test('belum diisi: tidak aktif, tanpa webhook URL', async () => {
  const st = (await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'superadmin' })).body.status;
  assert.equal(st.tokenConfigured, false);
  assert.equal(st.enabled, false);
  assert.equal(st.webhookUrl, '');
});

test('format token salah ditolak; token benar disimpan, rahasia webhook dibuat, token tidak pernah dikembalikan', async () => {
  assert.equal((await s.api('PUT', '/maintenance/whatsapp', { token: 'a b' }, { as: 'superadmin' })).status, 400);
  assert.equal((await s.api('PUT', '/maintenance/whatsapp', { token: 'x\nFONNTE_DEVICE=1' }, { as: 'superadmin' })).status, 400, 'tanpa suntikan baris .env');
  const r = await s.api('PUT', '/maintenance/whatsapp', { token: TOKEN, device: '0812-3456-7890' }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.status.tokenConfigured, true);
  assert.equal(r.body.status.tokenHint, `…${TOKEN.slice(-4)}`);
  assert.equal(r.body.status.device, '6281234567890');
  assert.equal(r.body.status.enabled, true);
  assert.match(r.body.status.webhookUrl, /\/api\/whatsapp\/webhook\/[0-9a-f]{48}$/);
  assert.ok(!r.text.includes(TOKEN), 'token tidak ada di respons');
  const env = fs.readFileSync(path.join(s.dataDir, '.env'), 'utf8');
  assert.match(env, new RegExp(`FONNTE_TOKEN=${TOKEN}`));
});

test('rahasia webhook yang dibuat langsung berlaku; menggantinya mematikan URL lama', async () => {
  const url = (await s.api('GET', '/maintenance/whatsapp', undefined, { as: 'superadmin' })).body.status.webhookUrl;
  const secret = url.split('/').pop();
  const post = (sec) => fetch(`${s.base}/whatsapp/webhook/${sec}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await post(secret)).status, 200);
  const changed = await s.api('POST', '/maintenance/whatsapp/secret', {}, { as: 'superadmin' });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.body.status.webhookUrl.split('/').pop(), secret);
  assert.equal((await post(secret)).status, 404, 'URL lama mati');
});

test('pesan tes: token benar terkirim; nomor salah ditolak; hasil tersimpan', async () => {
  assert.equal((await s.api('POST', '/maintenance/whatsapp/test', { target: 'abc' }, { as: 'superadmin' })).status, 400);
  const ok = await s.api('POST', '/maintenance/whatsapp/test', { target: '081200000009' }, { as: 'superadmin' });
  assert.equal(ok.body.ok, true, ok.text);
  assert.equal(sent.at(-1).auth, TOKEN);
  assert.equal(sent.at(-1).body.target, '6281200000009');
  assert.equal(ok.body.status.lastTest.ok, true);
});

test('token salah: pesan tes gagal dengan alasan dari Fonnte', async () => {
  await s.api('PUT', '/maintenance/whatsapp', { token: 'TokenSalahSalahSalah1' }, { as: 'superadmin' });
  const bad = await s.api('POST', '/maintenance/whatsapp/test', { target: '081200000009' }, { as: 'superadmin' });
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.message, /token invalid/);
});

test('hapus: token, nomor, dan rahasia hilang dari .env; asisten mati', async () => {
  const r = await s.api('DELETE', '/maintenance/whatsapp', undefined, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.status.tokenConfigured, false);
  assert.equal(r.body.status.enabled, false);
  assert.ok(!/FONNTE_/.test(fs.readFileSync(path.join(s.dataDir, '.env'), 'utf8')));
});
