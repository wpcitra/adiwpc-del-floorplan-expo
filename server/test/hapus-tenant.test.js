// Hapus Tenant & Urungkan (AGENTS.md §33): Super Admin only, soft delete, booth back to Available, restore
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { canDeleteTenant, sameBoothNumber } from '../../shared/tenantPermissions.js';

let s;
const FP = 'FP-TEST-TENANT';
const FP2 = 'FP-TEST-TENANT-2';
const register = (codes, brand, extra = {}, fp = FP) => s.api('POST', '/orders/checkout', {
  floorplanId: fp, boothCodes: codes, fullName: `PIC ${brand}`, brandName: brand, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', applyTax: false, ...extra
}, { as: 'superadmin' });
const boothRow = async (code, fp = FP) => (await s.api('GET', `/floorplan/${fp}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const exhibitors = async (fp = FP) => (await s.api('GET', '/exhibitors', undefined, { as: 'finance' })).body.exhibitors.filter(e => e.floorplanId === fp);
const rowOf = async (code, fp = FP) => (await exhibitors(fp)).find(e => e.booth === code);
const invoices = async () => (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices;
const del = (id, body, as) => s.api('DELETE', `/tenants/${id}`, body, as ? { as } : {});
const restore = (id, as = 'superadmin') => s.api('POST', `/tenants/${id}/restore`, {}, { as });
const audits = async () => (await s.api('GET', '/audit-logs?category=Exhibitor', undefined, { as: 'superadmin' })).body.logs;

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, ['119', 'A-01', 'A-02', 'B-01', 'B-02', 'C-01', 'D-01', 'D-02', 'E-01'].map((code, i) => boothObject(code, { left: i * 100, top: 0 })));
  await createPublishedFloorplan(s.api, FP2, [boothObject('Z-01', { left: 0, top: 0 })]);
});
after(async () => { await s?.stop(); });

test('satu aturan: hanya Super Admin; nomor booth harus diketik persis', () => {
  assert.equal(canDeleteTenant({ role: 'superadmin' }), true);
  for (const role of ['finance', 'sales', 'operations', 'developer', undefined]) assert.equal(canDeleteTenant({ role }), false);
  assert.equal(canDeleteTenant(null), false);
  assert.equal(sameBoothNumber(' A-01 ', ['A-01']), true);
  assert.equal(sameBoothNumber('a-01', ['A-01']), false);
  assert.equal(sameBoothNumber('A-1', ['A-01']), false);
  assert.equal(sameBoothNumber('A-02+A-01', ['A-01', 'A-02']), true);
  assert.equal(sameBoothNumber('', []), false);
});

test('tenant tanpa invoice (Booking Manual): role lain 403, Super Admin langsung hapus, booth kembali Available', async () => {
  assert.equal((await register(['119'], 'sfsd', { deferInvoice: true })).status, 200);
  const row = await rowOf('119');
  assert.ok(row?.id);

  assert.equal((await del(row.id, {})).status, 401);
  for (const role of ['finance', 'sales', 'operations']) {
    assert.equal((await del(row.id, {}, role)).status, 403, role);
    assert.equal((await s.api('POST', '/tenants/bulk-delete', { ids: [row.id], confirmText: 'HAPUS' }, { as: role })).status, 403, role);
    assert.equal((await restore(row.id, role)).status, 403, role);
    assert.equal((await s.api('GET', `/tenants/${row.id}/summary`, undefined, { as: role })).status, 403, role);
  }
  assert.equal((await boothRow('119')).owner_name, 'sfsd', 'penolakan tidak mengubah apa pun');

  const sum = (await s.api('GET', `/tenants/${row.id}/summary`, undefined, { as: 'superadmin' })).body.tenant;
  assert.equal(sum.company, 'sfsd');
  assert.equal(sum.hasInvoice, false);
  assert.equal(sum.hasFacilityForm, false);
  assert.equal(sum.needsConfirmation, false);
  assert.equal(sum.paymentStatus, 'Menunggu Bayar');

  const ok = await del(row.id, {}, 'superadmin');
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.message, 'Tenant sfsd dihapus');
  const b = await boothRow('119');
  assert.equal(b.status, 'available');
  assert.equal(b.owner_name, '');
  assert.equal((await rowOf('119')), undefined, 'hilang dari direktori');
  const live = (await s.api('GET', `/floorplan/${FP}?view=public`)).body.floorplan.booths.find(x => x.code === '119');
  assert.equal(live.status, 'available', 'denah publik');
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const canvas = typeof fp.canvas_fabric_json === 'string' ? JSON.parse(fp.canvas_fabric_json) : (fp.fabricJson || fp.canvas_fabric_json);
  assert.equal(canvas.objects.find(o => o.boothData?.code === '119').boothData.status, 'available');
  assert.equal((await del(row.id, {}, 'superadmin')).status, 404, 'sudah dihapus');

  const entry = (await audits()).find(l => l.action === 'Hapus tenant');
  assert.ok(entry, 'tercatat di Audit');
  assert.equal(entry.userRole, 'superadmin');
  assert.equal(entry.details.company, 'sfsd');
  assert.deepEqual(entry.details.boothCodes, ['119']);
  assert.equal(entry.details.paymentStatus, 'Menunggu Bayar');
  assert.equal(entry.details.totalAmount, 10000000);
  assert.ok(entry.details.project);
});

test('Urungkan: tenant, booth dan pesanan kembali; ditolak bila booth sudah diambil tenant lain', async () => {
  const deleted = (await s.api('GET', '/tenants/trash', undefined, { as: 'superadmin' })).body.tenants.find(t => t.company === 'sfsd');
  const r = await restore(deleted.tenantRef);
  assert.equal(r.status, 200, r.text);
  const b = await boothRow('119');
  assert.equal(b.status, 'reserved');
  assert.equal(b.owner_name, 'sfsd');
  const row = await rowOf('119');
  assert.equal(row.company, 'sfsd');
  assert.equal((await restore(deleted.tenantRef)).status, 404, 'sudah dipulihkan');
  assert.ok((await audits()).some(l => l.action === 'Pulihkan tenant'));

  // delete again, another tenant takes the booth: undo is refused and nothing changes
  assert.equal((await del(row.id, {}, 'superadmin')).status, 200);
  assert.equal((await register(['119'], 'Penghuni Baru', { deferInvoice: true })).status, 200);
  const refused = await restore(row.id);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'BOOTH_TAKEN');
  assert.match(refused.body.error, /Penghuni Baru/);
  assert.equal((await boothRow('119')).owner_name, 'Penghuni Baru');
});

test('tenant dengan invoice: wajib mengetik nomor booth persis; invoice belum dibayar ke Tempat Sampah, diskon khusus hilang', async () => {
  assert.equal((await register(['A-01'], 'Roti Maros')).status, 200);
  const disc = await s.api('POST', '/invoices/sync-booth-discount', { floorplanId: FP, boothCode: 'A-01', price: 10000000, discountType: 'nominal', discountValue: 500000, discountReason: 'Khusus' }, { as: 'finance' });
  assert.equal(disc.status, 200, disc.text);
  const row = await rowOf('A-01');
  const inv = (await invoices()).find(i => i.booth_code === 'A-01');
  const sum = (await s.api('GET', `/tenants/${row.id}/summary`, undefined, { as: 'superadmin' })).body.tenant;
  assert.equal(sum.hasInvoice, true);
  assert.equal(sum.needsConfirmation, true);

  const none = await del(row.id, {}, 'superadmin');
  assert.equal(none.status, 400);
  assert.equal(none.body.code, 'CONFIRM_BOOTH');
  assert.equal((await del(row.id, { confirmBooth: 'a-01' }, 'superadmin')).status, 400);
  assert.equal((await del(row.id, { confirmBooth: 'A-1' }, 'superadmin')).status, 400);
  assert.equal((await boothRow('A-01')).owner_name, 'Roti Maros');

  const ok = await del(row.id, { confirmBooth: 'A-01' }, 'superadmin');
  assert.equal(ok.status, 200, ok.text);
  const b = await boothRow('A-01');
  assert.equal(b.status, 'available');
  assert.equal(b.discount_amount, 0);
  assert.equal(b.price, 10000000);
  assert.equal((await invoices()).some(i => i.id === inv.id), false);
  const trashed = (await s.api('GET', '/invoices/trash', undefined, { as: 'superadmin' })).body.invoices.find(i => i.id === inv.id);
  assert.match(trashed.deleteReason, /Tenant Roti Maros dihapus/);

  // undo brings the invoice and the discount back
  assert.equal((await restore(row.id)).status, 200);
  assert.ok((await invoices()).some(i => i.id === inv.id));
  assert.equal((await boothRow('A-01')).discount_amount, 500000);
});

test('tenant dengan DP dibayar: invoice berbayar tidak dihapus, tetap tercatat sebagai batal', async () => {
  assert.equal((await register(['C-01'], 'Tenant DP')).status, 200);
  assert.equal((await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'C-01', dpMode: 'percent', dpValue: 30 }, { as: 'finance' })).status, 200);
  const c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=C-01`, undefined, { as: 'finance' })).body.contract;
  assert.equal((await s.api('POST', `/invoices/${c.dpInvoice.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  const row = await rowOf('C-01');
  const sum = (await s.api('GET', `/tenants/${row.id}/summary`, undefined, { as: 'superadmin' })).body.tenant;
  assert.equal(sum.paymentStatus, 'Uang Muka (DP)');
  assert.equal(sum.hasPayment, true);
  assert.equal((await del(row.id, {}, 'superadmin')).status, 400);

  const ok = await del(row.id, { confirmBooth: 'C-01' }, 'superadmin');
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await boothRow('C-01')).status, 'available');
  const kept = (await invoices()).find(i => i.id === c.dpInvoice.id);
  assert.ok(kept, 'invoice berbayar tidak dihapus');
  assert.equal(kept.payment_status, 'CANCELED');
  assert.match(kept.notes, /Dibatalkan – tenant dihapus/);
  assert.equal((await invoices()).some(i => i.id === c.settlementInvoice.id), false);
  const entry = (await audits()).find(l => l.action === 'Hapus tenant' && l.details.company === 'Tenant DP');
  assert.equal(entry.details.paymentStatus, 'Uang Muka (DP)');
  assert.equal(entry.details.paidAmount, 3000000);
});

test('satu tenant di dua booth (satu invoice): menghapus satu baris hanya melepas booth itu', async () => {
  assert.equal((await register(['B-01', 'B-02'], 'Dua Booth')).status, 200);
  const row = await rowOf('B-02');
  const ok = await del(row.id, { confirmBooth: 'B-02' }, 'superadmin');
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await boothRow('B-02')).status, 'available');
  const b1 = await boothRow('B-01');
  assert.equal(b1.status, 'reserved');
  assert.equal(b1.owner_name, 'Dua Booth');
  const inv = (await invoices()).find(i => i.company_name === 'Dua Booth');
  assert.equal(inv.booth_code, 'B-01');
  assert.equal(inv.total_amount, 10000000);
});

test('hapus massal: satu transaksi, berhasil semua atau gagal semua; HAPUS wajib bila ada invoice', async () => {
  assert.equal((await register(['D-01'], 'Uji Satu', { deferInvoice: true })).status, 200);
  assert.equal((await register(['D-02'], 'Uji Dua', { deferInvoice: true })).status, 200);
  assert.equal((await register(['E-01'], 'Uji Invoice')).status, 200);
  const ids = [(await rowOf('D-01')).id, (await rowOf('D-02')).id, (await rowOf('E-01')).id];

  const noWord = await s.api('POST', '/tenants/bulk-delete', { ids }, { as: 'superadmin' });
  assert.equal(noWord.status, 400);
  assert.equal(noWord.body.code, 'CONFIRM_REQUIRED');
  assert.equal((await boothRow('D-01')).owner_name, 'Uji Satu', 'gagal satu = tidak ada yang dihapus');
  assert.equal((await boothRow('D-02')).owner_name, 'Uji Dua');

  const missing = await s.api('POST', '/tenants/bulk-delete', { ids: [ids[0], 'ORD-TIDAK-ADA'], confirmText: 'HAPUS' }, { as: 'superadmin' });
  assert.equal(missing.status, 404);
  assert.equal((await boothRow('D-01')).owner_name, 'Uji Satu');

  const plain = await s.api('POST', '/tenants/bulk-delete', { ids: ids.slice(0, 1) }, { as: 'superadmin' });
  assert.equal(plain.status, 200, 'tanpa invoice tidak perlu mengetik HAPUS');
  const ok = await s.api('POST', '/tenants/bulk-delete', { ids: ids.slice(1), confirmText: 'HAPUS' }, { as: 'superadmin' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.deleted.length, 2);
  for (const code of ['D-01', 'D-02', 'E-01']) assert.equal((await boothRow(code)).status, 'available', code);
  assert.equal((await exhibitors()).some(e => ['Uji Satu', 'Uji Dua', 'Uji Invoice'].includes(e.company)), false);
  assert.ok((await audits()).filter(l => l.action === 'Hapus tenant' && l.details.bulk).length >= 3);
});

test('tenant di project lain tidak tersentuh; booth milik tenant lain tidak diubah', async () => {
  assert.equal((await register(['Z-01'], 'Dua Booth', { deferInvoice: true }, FP2)).status, 200);
  const row = await rowOf('B-01');
  assert.equal((await del(row.id, { confirmBooth: 'B-01' }, 'superadmin')).status, 200);
  assert.equal((await boothRow('Z-01', FP2)).owner_name, 'Dua Booth');
  const clients = (await s.api('GET', '/orders/registered-clients', undefined, { as: 'superadmin' })).body.clients;
  assert.ok(clients.some(c => c.company === 'Dua Booth'), 'masih terdaftar lewat project lain');
  assert.equal((await boothRow('119')).owner_name, 'Penghuni Baru');
});
