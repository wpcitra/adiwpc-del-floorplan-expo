// Menu Fasilitas (AGENTS.md §46): Sales dan Operasional memakai seluruh menu (form, pengajuan, status, invoice
// fasilitas, daftar tenant untuk broadcast); invoice fasilitas yang dihapus membuat pengajuannya REJECTED, dan
// memulihkan invoice itu mengembalikan pengajuan ke INVOICED.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-FASILITAS';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 300, top: 0 })]);
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Satu', brandCategory: 'F&B', phone: '081200000001', bookingType: 'booking', deferInvoice: true }, { as: 'sales' });
  assert.equal(reg.status, 200, reg.text);
});
after(async () => { await s?.stop(); });

const ITEMS = [{ id: 'listrik', name: 'Tambahan Listrik 900W', category: 'Listrik', unit: 'Unit', price: 750000 }];
const submit = (booth = 'A-01') => s.api('POST', '/facilities/requests/submit', {
  form_id: 'form_tes', project_id: FP, booth_code: booth, company_name: 'Kopi Satu', pic_name: 'Budi', phone: '081200000001',
  items: [{ ...ITEMS[0], qty: 2 }]
});
const requestOf = async (id, as = 'finance') => (await s.api('GET', '/facilities/requests', undefined, { as })).body.requests.find(r => r.id === id);

test('Sales dan Operasional memakai seluruh menu Fasilitas: form, pengajuan, status, invoice', async () => {
  for (const role of ['sales', 'operations']) {
    const form = await s.api('POST', '/facilities/forms', { project_id: FP, title: `Form ${role}`, items: ITEMS, is_active: 0 }, { as: role });
    assert.equal(form.status, 200, `${role} simpan form: ${form.text}`);
    assert.equal((await s.api('GET', '/facilities/forms', undefined, { as: role })).status, 200, `${role} lihat form`);
    const sub = await submit();
    assert.equal(sub.status, 200, sub.text);
    const id = sub.body.requestId || sub.body.request?.id || (await s.api('GET', '/facilities/requests', undefined, { as: role })).body.requests[0].id;
    assert.equal((await s.api('GET', '/facilities/requests', undefined, { as: role })).status, 200, `${role} lihat pengajuan`);
    const st = await s.api('PUT', `/facilities/requests/${id}/status`, { status: 'APPROVED' }, { as: role });
    assert.equal(st.status, 200, `${role} ubah status: ${st.text}`);
    const inv = await s.api('POST', `/facilities/requests/${id}/generate-invoice`, {}, { as: role });
    assert.equal(inv.status, 200, `${role} terbitkan invoice fasilitas: ${inv.text}`);
    assert.equal((await requestOf(id, role)).status, 'INVOICED');
  }
});

test('daftar tenant untuk broadcast / form: booth terisi dengan kontak, tanpa harga; Dashboard tetap tertutup untuk Operasional', async () => {
  for (const role of ['sales', 'operations']) {
    const r = await s.api('GET', `/facilities/tenants?projectId=${FP}`, undefined, { as: role });
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    const t = r.body.tenants.find(x => x.boothCode === 'A-01');
    assert.ok(t, 'tenant A-01 ada');
    assert.equal(t.tenant, 'Kopi Satu');
    assert.equal(t.phone, '081200000001');
    assert.ok(!r.body.tenants.some(x => x.boothCode === 'A-02'), 'booth kosong tidak ikut');
    assert.ok(!/price|discount|total/i.test(Object.keys(t).join(',')), 'tanpa harga / diskon');
  }
  assert.equal((await s.api('GET', '/facilities/tenants?projectId=global', undefined, { as: 'operations' })).status, 200);
  assert.equal((await s.api('GET', `/stats?projectId=${FP}`, undefined, { as: 'operations' })).status, 403, 'Dashboard tetap tertutup');
  assert.equal((await s.api('GET', '/facilities/tenants')).status, 401, 'pengunjung tidak boleh');
});

test('invoice fasilitas dihapus di menu Invoice: pengajuan jadi REJECTED; dipulihkan: kembali INVOICED', async () => {
  const sub = await submit();
  assert.equal(sub.status, 200, sub.text);
  const id = sub.body.requestId || sub.body.request?.id;
  assert.ok(id, `id pengajuan: ${sub.text}`);
  assert.equal((await s.api('POST', `/facilities/requests/${id}/generate-invoice`, {}, { as: 'finance' })).status, 200);
  const req = await requestOf(id);
  assert.equal(req.status, 'INVOICED');
  assert.ok(req.invoice_id);

  const del = await s.api('DELETE', `/invoices/${req.invoice_id}`, { reason: 'salah input fasilitas tenant' }, { as: 'finance' });
  assert.equal(del.status, 200, del.text);
  assert.equal((await requestOf(id)).status, 'REJECTED');
  const other = (await s.api('GET', '/facilities/requests', undefined, { as: 'finance' })).body.requests.filter(r => r.id !== id && r.invoice_id);
  assert.ok(other.every(r => r.status === 'INVOICED'), 'pengajuan lain tidak tersentuh');

  const restore = await s.api('POST', `/invoices/${req.invoice_id}/restore`, {}, { as: 'superadmin' });
  assert.equal(restore.status, 200, restore.text);
  assert.equal((await requestOf(id)).status, 'INVOICED');
});

test('kategori fasilitas: awalnya 9 bawaan; daftar bisa diubah (tambah, hapus) oleh staf menu Fasilitas; isian dibersihkan dan divalidasi', async () => {
  const first = await s.api('GET', '/facilities/categories', undefined, { as: 'sales' });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.categories.length, 9);
  assert.ok(first.body.categories.includes('Listrik & Pencahayaan'));

  const next = first.body.categories.filter(c => c !== 'Keamanan & Safety').concat(['  Catering  ']);
  const put = await s.api('PUT', '/facilities/categories', { categories: next }, { as: 'operations' });
  assert.equal(put.status, 200, put.text);
  const saved = (await s.api('GET', '/facilities/categories', undefined, { as: 'finance' })).body.categories;
  assert.ok(saved.includes('Catering'), 'dirapikan');
  assert.ok(!saved.includes('Keamanan & Safety'), 'kategori bawaan bisa dihapus');
  assert.equal(saved.length, 9);

  for (const bad of [[], ['A', 'a'], ['x'.repeat(61)], ['  ']]) {
    assert.equal((await s.api('PUT', '/facilities/categories', { categories: bad }, { as: 'sales' })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await s.api('GET', '/facilities/categories')).status, 401, 'pengunjung tidak boleh');
});

test('ganti nama kategori: daftar dan item semua formulir / template ikut; jumlah pemakaian dilaporkan; tercatat di Log Aktivitas', async () => {
  const form = await s.api('POST', '/facilities/forms', {
    project_id: FP, title: 'Form Kategori', is_active: 0,
    items: [{ id: 'k1', name: 'Lampu Sorot', category: 'Listrik & Pencahayaan', unit: 'Unit', price: 100000 }, { id: 'k2', name: 'Meja', category: 'Furnitur & Meja-Kursi', unit: 'Unit', price: 50000 }]
  }, { as: 'sales' });
  assert.equal(form.status, 200, form.text);
  const usage = (await s.api('GET', '/facilities/categories', undefined, { as: 'sales' })).body.usage;
  assert.ok(usage['Listrik & Pencahayaan'] >= 1, 'jumlah item pemakai');

  assert.equal((await s.api('POST', '/facilities/categories/rename', { from: 'Listrik & Pencahayaan', to: 'Catering' }, { as: 'sales' })).status, 409, 'nama yang sudah ada ditolak');
  const ren = await s.api('POST', '/facilities/categories/rename', { from: 'Listrik & Pencahayaan', to: 'Listrik' }, { as: 'sales' });
  assert.equal(ren.status, 200, ren.text);
  assert.ok(ren.body.updatedItems >= 1);
  const cats = (await s.api('GET', '/facilities/categories', undefined, { as: 'sales' })).body.categories;
  assert.ok(cats.includes('Listrik') && !cats.includes('Listrik & Pencahayaan'));
  const forms = (await s.api('GET', '/facilities/forms', undefined, { as: 'sales' })).body.forms;
  const items = forms.flatMap(f => f.items || []);
  assert.ok(items.some(i => i.name === 'Lampu Sorot' && i.category === 'Listrik'));
  assert.ok(!items.some(i => i.category === 'Listrik & Pencahayaan'), 'tidak ada item tertinggal dengan nama lama');
  assert.ok(items.some(i => i.name === 'Meja' && i.category === 'Furnitur & Meja-Kursi'), 'kategori lain tidak tersentuh');

  const logs = (await s.api('GET', '/audit-logs?category=Fasilitas', undefined, { as: 'superadmin' })).body.logs;
  assert.ok(logs.some(l => /kategori/i.test(l.action) && /Listrik & Pencahayaan → Listrik/.test(l.summary)));
});
