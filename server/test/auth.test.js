// Login, role access and actor identity (AGENTS.md §11)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s?.stop(); });

test('health terbuka dan menyebut environment + versi', async () => {
  const r = await s.api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.environment, 'test');
  assert.ok(r.body.version);
});

test('login salah ditolak dengan pesan yang sama untuk email tak dikenal', async () => {
  const wrong = await s.api('POST', '/auth/login', { email: 'superadmin@expo.local', password: 'salah' });
  const unknown = await s.api('POST', '/auth/login', { email: 'tidak-ada@expo.local', password: 'salah' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
  assert.equal(wrong.body.token, undefined);
});

test('login benar memberi token, respons tidak memuat password hash', async () => {
  const r = await s.api('POST', '/auth/login', { email: 'superadmin@expo.local', password: 'superadmin123' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.doesNotMatch(r.text, /password_hash|pbkdf2|scrypt/i);
});

test('endpoint admin menolak pengunjung tanpa login', async () => {
  for (const url of ['/invoices', '/orders', '/users', '/audit-logs', '/floorplan/list']) {
    const r = await s.api('GET', url);
    assert.equal(r.status, 401, `${url} harus 401 tanpa login`);
  }
});

test('token palsu ditolak', async () => {
  const r = await fetch(`${s.base}/invoices`, { headers: { Authorization: 'Bearer palsu' } });
  assert.equal(r.status, 401);
});

test('hak akses per role', async () => {
  assert.equal((await s.api('GET', '/users', undefined, { as: 'sales' })).status, 403, 'sales tidak boleh kelola user');
  assert.equal((await s.api('GET', '/users', undefined, { as: 'finance' })).status, 403, 'finance tidak boleh kelola user');
  assert.equal((await s.api('GET', '/users', undefined, { as: 'superadmin' })).status, 200);
  assert.equal((await s.api('POST', '/invoices', { companyName: 'X', clientName: 'Y' }, { as: 'sales' })).status, 403, 'sales tidak boleh membuat invoice');
  assert.equal((await s.api('POST', '/floorplan/save', { id: 'FP-X' }, { as: 'finance' })).status, 403, 'finance tidak boleh menyimpan denah');
  assert.equal((await s.api('GET', '/invoices', undefined, { as: 'operations' })).status, 403, 'operasional hanya area ops');
  assert.equal((await s.api('GET', '/audit-logs', undefined, { as: 'superadmin' })).status, 200);
});

test('login gagal dan berhasil tercatat di Audit, tanpa password', async () => {
  const r = await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' });
  assert.equal(r.status, 200);
  assert.match(r.text, /Login gagal/);
  assert.doesNotMatch(r.text, /superadmin123|"salah"/);
});
