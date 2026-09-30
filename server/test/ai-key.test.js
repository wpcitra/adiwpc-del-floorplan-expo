// Claude API key via the admin (AGENTS.md §23): Super Admin only, write-only, verified, stored in .env, never leaked
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { startServer, createDeveloper } from './helpers.js';

const VALID = 'sk-ant-api03-VALIDkeyForTests_0123456789abcdefWXYZ';
const REVOKED = 'sk-ant-api03-REVOKEDkeyForTests_0123456789abcdef';
let s;
let mock;
let mockCalls = [];

before(async () => {
  // Fake Anthropic API: GET /v1/models accepts only VALID, and requires the documented headers
  mock = http.createServer((req, res) => {
    mockCalls.push({ url: req.url, version: req.headers['anthropic-version'], key: req.headers['x-api-key'] });
    res.setHeader('Content-Type', 'application/json');
    if (!req.url.startsWith('/v1/models') || req.headers['anthropic-version'] !== '2023-06-01') {
      res.statusCode = 400;
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'bad request' } }));
    }
    if (req.headers['x-api-key'] !== VALID) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    }
    res.end(JSON.stringify({ data: [{ id: 'claude-model-a', display_name: 'Model A' }, { id: 'claude-model-b', display_name: 'Model B' }] }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  s = await startServer({ ANTHROPIC_API_URL: `http://127.0.0.1:${mock.address().port}` });
  await createDeveloper(s.api);
  // an existing .env with other settings must be kept intact
  fs.writeFileSync(path.join(s.dataDir, '.env'), 'PORT=5001\nAPP_ENV=production\n');
});
after(async () => {
  await s?.stop();
  mock?.close();
});

const envFile = () => fs.readFileSync(path.join(s.dataDir, '.env'), 'utf8');
const status = async () => (await s.api('GET', '/maintenance/ai-key', undefined, { as: 'superadmin' })).body.status;

test('hanya Super Admin yang bisa melihat status dan mengisi API key', async () => {
  assert.equal((await s.api('GET', '/maintenance/ai-key')).status, 401);
  for (const role of ['developer', 'sales', 'finance', 'operations']) {
    assert.equal((await s.api('GET', '/maintenance/ai-key', undefined, { as: role })).status, 403, `GET ${role}`);
    assert.equal((await s.api('PUT', '/maintenance/ai-key', { apiKey: VALID }, { as: role })).status, 403, `PUT ${role}`);
  }
  assert.equal((await status()).configured, false);
});

test('format salah ditolak tanpa menyentuh .env', async () => {
  for (const bad of ['', 'abc', 'sk-ant-short', `${VALID}\nADMIN=1`, `${VALID} x`, `"${VALID}"`]) {
    const r = await s.api('PUT', '/maintenance/ai-key', { apiKey: bad }, { as: 'superadmin' });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(envFile(), 'PORT=5001\nAPP_ENV=production\n');
});

test('key yang ditolak Anthropic (401) tidak disimpan', async () => {
  const r = await s.api('PUT', '/maintenance/ai-key', { apiKey: REVOKED }, { as: 'superadmin' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'INVALID_KEY');
  assert.doesNotMatch(envFile(), /ANTHROPIC_API_KEY/);
  assert.equal((await status()).configured, false);
});

test('key valid diuji ke /v1/models, disimpan di .env (izin 600), tidak pernah dikirim kembali', async () => {
  mockCalls = [];
  const r = await s.api('PUT', '/maintenance/ai-key', { apiKey: VALID }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.verified, true);
  assert.ok(!r.text.includes(VALID), 'respons tidak boleh memuat key');
  assert.equal(mockCalls[0].version, '2023-06-01');
  assert.equal(mockCalls[0].key, VALID);

  assert.match(envFile(), /^PORT=5001\nAPP_ENV=production\nANTHROPIC_API_KEY=sk-ant-api03-VALID/);
  assert.equal(fs.statSync(path.join(s.dataDir, '.env')).mode & 0o777, 0o600);

  const st = await status();
  assert.equal(st.configured, true);
  assert.equal(st.hint, '…WXYZ');
  assert.equal(st.source, 'env-file');
  assert.equal(st.lastCheck.ok, true);
  assert.equal(st.lastCheck.modelCount, 2);
});

test('uji koneksi memakai key tersimpan', async () => {
  const r = await s.api('POST', '/maintenance/ai-key/test', {}, { as: 'superadmin' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(!r.text.includes(VALID));
});

test('key tidak muncul di Audit, log server, daftar error, atau endpoint publik', async () => {
  const audit = await s.api('GET', '/audit-logs?limit=200', undefined, { as: 'superadmin' });
  assert.match(audit.text, /Simpan API key Claude/);
  assert.ok(!audit.text.includes(VALID), 'audit');
  assert.ok(!s.output().includes(VALID), 'log server');
  const errors = await s.api('GET', '/maintenance/errors?status=semua', undefined, { as: 'superadmin' });
  assert.ok(!errors.text.includes(VALID), 'error tracking');
  for (const url of ['/health', '/invoices/config', '/floorplan/events']) {
    assert.ok(!(await s.api('GET', url)).text.includes(VALID), url);
  }
});

test('hapus key menghapus baris dari .env dan menjaga setelan lain', async () => {
  const r = await s.api('DELETE', '/maintenance/ai-key', undefined, { as: 'superadmin' });
  assert.equal(r.status, 200);
  assert.equal(envFile(), 'PORT=5001\nAPP_ENV=production\n');
  assert.equal((await status()).configured, false);
  const audit = await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' });
  assert.match(audit.text, /Hapus API key Claude/);
});
