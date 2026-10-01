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

test('Sales: hanya melihat denah & mendaftarkan tenant; tidak bisa mengedit denah, harga, diskon, kategori', async () => {
  const FP = 'FP-TEST-SALES';
  const booth = (code, left) => ({
    type: 'Group', left, top: 0, width: 60, height: 60, isBooth: true, id: `booth_${code}`,
    boothData: { id: `booth_${code}`, code, category: 'Standard', price: 5000000, status: 'available', widthM: 3, heightM: 3 },
    objects: [{ type: 'Rect', left: -30, top: -30, width: 60, height: 60 }, { type: 'Text', left: 0, top: 0, text: code, fontSize: 10 }]
  });
  const body = { id: FP, eventId: `EVT-${FP}`, title: 'Tes Sales', status: 'draft', fabricJson: { version: '7.0.0', objects: [booth('S-01', 0), booth('S-02', 300)] } };
  assert.equal((await s.api('POST', '/floorplan/save', body, { as: 'superadmin' })).status, 200);
  assert.equal((await s.api('POST', `/floorplan/${FP}/publish`, {}, { as: 'superadmin' })).status, 200);

  // editing is refused
  assert.equal((await s.api('POST', '/floorplan/save', body, { as: 'sales' })).status, 403, 'sales tidak boleh menyimpan denah');
  assert.equal((await s.api('POST', `/floorplan/${FP}/unpublish`, {}, { as: 'sales' })).status, 403, 'sales tidak boleh publish / unpublish');
  assert.equal((await s.api('POST', '/invoices/sync-booth-discount', { floorplanId: FP, boothCode: 'S-01', discountValue: 1000 }, { as: 'sales' })).status, 403, 'sales tidak boleh memberi diskon');
  assert.equal((await s.api('POST', '/brand-categories/save-project', { projectId: FP, categories: [] }, { as: 'sales' })).status, 403, 'sales tidak boleh mengubah kategori');

  // viewing and manual registration are allowed
  assert.equal((await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'sales' })).status, 200);
  const reg = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['S-01'], fullName: 'Sari', brandName: 'Brand Sales', brandCategory: 'Lainnya',
    email: 'sari@contoh.test', phone: '081234567890', bookingType: 'booking', source: 'admin'
  }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  const row = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'sales' })).body.floorplan.booths.find(b => b.code === 'S-01');
  assert.equal(row.status, 'reserved');
  assert.equal(row.registration_source, 'admin', 'tercatat didaftarkan staf');
  // the invoice Finance / the registration issued can be opened by Sales
  assert.equal((await s.api('GET', `/invoices/${encodeURIComponent(reg.body.order.invoiceNumber)}`, undefined, { as: 'sales' })).status, 200);
});

test('Operasional: mengedit denah di Studio, tetapi tidak bisa mendaftarkan / mengubah tenant', async () => {
  const FP = 'FP-TEST-SALES'; // from the Sales test above: S-01 registered ("Brand Sales"), S-02 empty
  const booth = (code, left, data = {}) => ({
    type: 'Group', left, top: 0, width: 60, height: 60, isBooth: true, id: `booth_${code}`,
    boothData: { id: `booth_${code}`, code, category: 'Standard', price: 5000000, status: 'available', widthM: 3, heightM: 3, ...data },
    objects: [{ type: 'Rect', left: -30, top: -30, width: 60, height: 60 }, { type: 'Text', left: 0, top: 0, text: code, fontSize: 10 }]
  });
  // opens the Studio data of a floorplan as staff (also drafts), not as a visitor
  const view = await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'operations' });
  assert.equal(view.status, 200);
  assert.equal(view.body.floorplan.booths.find(b => b.code === 'S-01').pic_name, 'Sari', 'data staf, bukan tampilan publik');

  // edits and saves the layout: a moved / re-priced booth and a new booth; tenant fields in the payload are ignored
  const save = await s.api('POST', '/floorplan/save', {
    id: FP, eventId: `EVT-${FP}`, title: 'Tes Sales', status: 'published',
    fabricJson: { version: '7.0.0', objects: [
      booth('S-01', 0, { status: 'available', ownerName: '' }),
      booth('S-02', 420, { price: 6000000, status: 'sold', ownerName: 'Titipan Ops', picName: 'X', email: 'x@c.test', phone: '0811111111' }),
      booth('S-03', 600, { status: 'reserved', ownerName: 'Baru Ops' })
    ] }
  }, { as: 'operations' });
  assert.equal(save.status, 200, save.text);
  const booths = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths;
  const by = (code) => booths.find(b => b.code === code);
  assert.equal(by('S-01').owner_name, 'Brand Sales', 'tenant yang ada tidak hilang');
  assert.equal(by('S-01').status, 'reserved');
  assert.equal(by('S-02').price, 6000000, 'harga boleh diubah');
  assert.equal(by('S-02').status, 'available', 'tidak bisa mengisi tenant lewat denah');
  assert.equal(by('S-02').owner_name, '');
  assert.equal(by('S-03').status, 'available', 'booth baru mulai Available');
  assert.equal(by('S-03').owner_name, '');

  // registration is refused, also as a "visitor"
  const reg = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['S-02'], fullName: 'Ops', brandName: 'Brand Ops', email: 'ops@contoh.test', phone: '081234567890', bookingType: 'booking'
  }, { as: 'operations' });
  assert.equal(reg.status, 403);
  assert.match(reg.body.error, /tidak dapat mendaftarkan tenant/);
  // outside the Studio and Denah Operasional: nothing
  assert.equal((await s.api('GET', '/exhibitors?projectId=all', undefined, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', '/invoices/sync-booth-discount', { floorplanId: FP, boothCode: 'S-02', discountValue: 1000 }, { as: 'operations' })).status, 403);
  assert.equal((await s.api('GET', `/ops/${FP}`, undefined, { as: 'operations' })).status, 200);
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
