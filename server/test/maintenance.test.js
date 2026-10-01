// Pusat Maintenance, error tracking (AGENTS.md §22): capture, scrubbing, grouping, priority, notifications, access
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createDeveloper } from './helpers.js';

let s;
before(async () => {
  s = await startServer();
  await createDeveloper(s.api);
});
after(async () => { await s?.stop(); });

const report = (body, opts) => s.api('POST', '/errors/report', { kind: 'error', stack: '', ...body }, opts);
const groups = async (query = 'status=semua') => (await s.api('GET', `/maintenance/errors?${query}`, undefined, { as: 'developer' })).body.errors;
const detail = async (id) => (await s.api('GET', `/maintenance/errors/${id}`, undefined, { as: 'developer' }));
const notifications = async (role) => (await s.api('GET', '/notifications', undefined, { as: role })).body.notifications;

test('hanya Developer dan Super Admin yang bisa membuka Pusat Maintenance', async () => {
  assert.equal((await s.api('GET', '/maintenance/errors')).status, 401);
  assert.equal((await s.api('GET', '/maintenance/errors', undefined, { as: 'sales' })).status, 403);
  assert.equal((await s.api('GET', '/maintenance/errors', undefined, { as: 'finance' })).status, 403);
  assert.equal((await s.api('GET', '/maintenance/errors', undefined, { as: 'operations' })).status, 403);
  assert.equal((await s.api('GET', '/maintenance/errors', undefined, { as: 'developer' })).status, 200);
  assert.equal((await s.api('GET', '/maintenance/errors', undefined, { as: 'superadmin' })).status, 200);
});

test('Developer tidak bisa membaca data tenant, invoice, atau user', async () => {
  for (const url of ['/invoices', '/orders', '/users', '/floorplan/list', '/stats', '/audit-logs']) {
    assert.equal((await s.api('GET', url, undefined, { as: 'developer' })).status, 403, `${url} harus 403 untuk developer`);
  }
});

test('data pribadi dan rahasia disamarkan sebelum disimpan', async () => {
  const r = await report({
    message: 'Gagal kirim ke budi@contoh.test telp 081234567890 password=rahasia123 key sk-ant-api03-ABCdef_123 NPWP 01.234.567.8-901.000',
    stack: 'Error: x\n    at kirim (http://localhost:3002/src/pages/admin/InvoicePage.jsx?t=1:10:5)\n    Authorization: Bearer abcdef0123456789abcdef0123456789',
    page: '/admin/invoices?email=budi@contoh.test&token=abc'
  }, { as: 'sales' });
  assert.equal(r.status, 200, r.text);
  const d = await detail(r.body.id);
  const text = d.text;
  for (const secret of ['budi@contoh.test', '081234567890', 'rahasia123', 'sk-ant-api03', '01.234.567.8-901.000', 'abcdef0123456789abcdef0123456789', 'token=abc', 'usr_sales', 'sales@expo.local']) {
    assert.ok(!text.includes(secret), `bocor: ${secret}`);
  }
  assert.equal(d.body.error.area, '/admin/invoices');
  assert.match(d.body.events[0].userRef, /^U-[0-9a-f]{8}$/);
  assert.equal(d.body.error.location, 'src/pages/admin/InvoicePage.jsx:kirim');
});

test('prioritas mengikuti fitur', async () => {
  const cases = [
    ['/admin/invoices', 'KRITIS'], ['/login', 'KRITIS'], ['/live/expo-2026', 'KRITIS'], ['/', 'KRITIS'],
    ['/admin/floorplan', 'TINGGI'], ['/admin/exhibitors', 'TINGGI'], ['/admin/analytics', 'TINGGI'],
    ['/admin/settings', 'NORMAL'], ['/admin/ops', 'NORMAL']
  ];
  for (const [page, expected] of cases) {
    const r = await report({ message: `Uji prioritas ${page}`, page });
    assert.equal((await detail(r.body.id)).body.error.priority, expected, `${page} harus ${expected}`);
  }
  const down = await report({ kind: 'unreachable', message: '/api/floorplan/active (Failed to fetch)', page: '/admin/settings' });
  const dd = (await detail(down.body.id)).body.error;
  assert.equal(dd.priority, 'KRITIS');
  assert.equal(dd.feature, 'Website tidak bisa diakses');
  const down2 = await report({ kind: 'unreachable', message: '/api/invoices (Failed to fetch)', page: '/admin/invoices' });
  assert.equal(down2.body.id, down.body.id, 'semua laporan server tidak terjangkau masuk satu grup');
});

test('error yang sama dikelompokkan, jumlah pengguna dihitung dari kode samaran', async () => {
  const a = await report({ message: 'Cannot read properties of undefined (reading "price") at booth 12', page: '/admin/floorplan' }, { as: 'sales' });
  const b = await report({ message: 'Cannot read properties of undefined (reading "price") at booth 57', page: '/admin/floorplan' }, { as: 'sales' });
  const c = await report({ message: 'Cannot read properties of undefined (reading "price") at booth 3', page: '/admin/floorplan' }, { as: 'superadmin' });
  assert.equal(a.body.id, b.body.id);
  assert.equal(a.body.id, c.body.id);
  const g = (await detail(a.body.id)).body.error;
  assert.equal(g.occurrences, 3);
  assert.equal(g.affectedUsers, 2);
});

test('error server tercatat otomatis dengan stack tanpa path lokal', async () => {
  const r = await s.api('POST', '/floorplan/save', { id: 'FP-RUSAK', fabricJson: { objects: [null] } }, { as: 'superadmin' });
  assert.equal(r.status, 500);
  const list = await groups('status=semua&source=server');
  const g = list.find(x => x.area === '/api/floorplan/save');
  assert.ok(g, 'error /api/floorplan/save harus tercatat');
  assert.equal(g.priority, 'TINGGI');
  assert.match(g.location, /server\/src\/routes\/floorplanRoutes\.js/);
  const d = await detail(g.id);
  assert.ok(!d.text.includes('/Users/'), 'path lokal (username) tidak boleh tersimpan');
  assert.match(d.body.error.stack, /TypeError/);
});

test('JSON rusak dari klien bukan error website (400, tidak dicatat)', async () => {
  const before = (await groups()).length;
  const res = await fetch(`${s.base}/orders/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak' });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.doesNotMatch(body, /SyntaxError|at JSON\.parse|node_modules/);
  assert.equal((await groups()).length, before);
});

test('notifikasi error KRITIS/TINGGI hanya ke Developer & Super Admin', async () => {
  await report({ message: 'Checkout gagal total', page: '/live/expo' });
  const dev = await notifications('developer');
  const sa = await notifications('superadmin');
  const sales = await notifications('sales');
  assert.ok(dev.some(n => n.type === 'error_alert' && /Checkout gagal total/.test(n.body)));
  assert.ok(sa.some(n => n.type === 'error_alert' && /Checkout gagal total/.test(n.body)));
  assert.ok(!sales.some(n => n.type === 'error_alert'));
  await report({ message: 'Error normal di pengaturan', page: '/admin/settings' });
  assert.ok(!(await notifications('developer')).some(n => /Error normal di pengaturan/.test(n.body)), 'NORMAL tidak dinotifikasi');
});

test('status: selesai terbuka lagi bila muncul kembali, diabaikan tetap diabaikan, tercatat di Audit', async () => {
  const r = await report({ message: 'Invoice PDF gagal dibuat', page: '/admin/invoices' });
  const id = r.body.id;
  assert.equal((await s.api('POST', `/maintenance/errors/${id}/status`, { status: 'selesai', note: 'sudah diperbaiki' }, { as: 'developer' })).status, 200);
  await report({ message: 'Invoice PDF gagal dibuat', page: '/admin/invoices' });
  let g = (await detail(id)).body.error;
  assert.equal(g.status, 'baru');
  assert.equal(g.reopenedCount, 1);
  assert.ok((await notifications('developer')).some(n => /muncul lagi/i.test(n.title) && n.link.includes(id)));

  assert.equal((await s.api('POST', `/maintenance/errors/${id}/status`, { status: 'diabaikan' }, { as: 'developer' })).status, 200);
  await report({ message: 'Invoice PDF gagal dibuat', page: '/admin/invoices' });
  g = (await detail(id)).body.error;
  assert.equal(g.status, 'diabaikan');
  assert.equal(g.occurrences, 3);

  assert.equal((await s.api('POST', `/maintenance/errors/${id}/status`, { status: 'hapus' }, { as: 'developer' })).status, 400);
  const audit = await s.api('GET', '/audit-logs?limit=100', undefined, { as: 'superadmin' });
  assert.match(audit.text, /Ubah status error/);
});

test('laporan dari satu IP dibatasi (anti-banjir)', async () => {
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    limited = (await report({ message: `banjir ${i}`, page: '/admin/settings' })).status === 429;
  }
  assert.ok(limited, 'harus 429 setelah 30 laporan per menit');
});
