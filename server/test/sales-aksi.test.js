// Pop up aksi booth untuk Sales di Studio (AGENTS.md §27): Booking Manual, Beri Diskon (batas Sales), Buat Invoice
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-AKSI';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('A-01', { left: 0, top: 0 }),
    boothObject('A-02', { left: 200, top: 0 }),
    boothObject('A-03', { left: 400, top: 0, status: 'maintenance' }),
    boothObject('A-04', { left: 600, top: 0 }),
    boothObject('A-05', { left: 800, top: 0 })
  ]);
});
after(async () => { await s.stop(); });

const summary = async (code, as = 'sales') => s.api('GET', `/booth-actions/summary?floorplanId=${FP}&boothCode=${code}`, undefined, { as });
const book = (code, brand, extra = {}, as = 'sales') => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], boothCode: code, fullName: `PIC ${brand}`, brandName: brand, brandCategory: 'F&B',
  email: `${brand.toLowerCase().replace(/\W+/g, '')}@contoh.test`, phone: '081234567890', bookingType: 'booking', source: 'admin',
  deferInvoice: true, notes: 'Minta dekat pintu', ...extra
}, { as });
const boothRow = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const canvasBooth = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.canvas_fabric_json.objects.find(o => o.boothData?.code === code).boothData;

test('Available: semua tombol aktif; Buat Invoice mengarahkan ke Booking Manual', async () => {
  const r = await summary('A-01');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booth.status, 'available');
  assert.equal(r.body.booth.price, 10000000);
  assert.deepEqual([r.body.actions.invoice.enabled, r.body.actions.booking.enabled, r.body.actions.discount.enabled], [true, true, true]);
  assert.equal(r.body.actions.invoice.mode, 'booking');
  assert.equal(r.body.actions.booking.label, 'Booking Manual');
  const inv = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-01' }, { as: 'sales' });
  assert.equal(inv.status, 409);
  assert.equal(inv.body.code, 'NEED_BOOKING');
});

test('Booking Manual: booth jadi Reserved, nama tenant masuk denah, belum ada invoice; double booking ditolak', async () => {
  const r = await book('A-01', 'Kopi Satu');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.order.invoice, null, 'invoice diterbitkan belakangan lewat Buat Invoice');
  const row = await boothRow('A-01');
  assert.equal(row.status, 'reserved');
  assert.equal(row.owner_name, 'Kopi Satu');
  const cv = await canvasBooth('A-01');
  assert.equal(cv.status, 'reserved');
  assert.equal(cv.ownerName, 'Kopi Satu');
  assert.equal(cv.picName, 'PIC Kopi Satu');

  const again = await book('A-01', 'Brand Lain');
  assert.equal(again.status, 409, 'sales kedua ditolak');
  assert.equal(again.body.code, 'BOOTH_TAKEN');
  assert.equal((await boothRow('A-01')).owner_name, 'Kopi Satu');

  const sum = (await summary('A-01')).body;
  assert.equal(sum.actions.booking.label, 'Lihat/Ubah Booking');
  assert.equal(sum.actions.invoice.mode, 'create');
  assert.equal(sum.booth.notes, 'Minta dekat pintu');
  assert.equal(sum.invoices.length, 0);
});

test('Sales tidak bisa mencatat pembayaran langsung (Sold) saat booking', async () => {
  const r = await book('A-02', 'Lunas Langsung', { bookingType: 'payment_gateway', deferInvoice: false });
  assert.equal(r.status, 403);
  assert.equal((await boothRow('A-02')).status, 'available');
});

test('Beri Diskon: alasan wajib, batas Sales berlaku, Finance tidak dibatasi, tercatat di Audit', async () => {
  const post = (body, as = 'sales') => s.api('POST', '/booth-actions/discount', { floorplanId: FP, boothCode: 'A-01', ...body }, { as });
  assert.equal((await post({ discountType: 'percentage', discountValue: 5 })).body.code, 'REASON_REQUIRED');
  const over = await post({ discountType: 'percentage', discountValue: 15, discountReason: 'Promo' });
  assert.equal(over.status, 403);
  assert.equal(over.body.code, 'DISCOUNT_OVER_LIMIT');
  assert.equal((await post({ discountType: 'nominal', discountValue: 1500000, discountReason: 'Promo' })).status, 403, 'nominal di atas 10% juga ditolak');
  assert.equal((await boothRow('A-01')).discount_amount || 0, 0);

  const ok = await post({ discountType: 'percentage', discountValue: 10, discountReason: 'Early bird' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.discount.discountAmount, 1000000);
  assert.equal(ok.body.booth.netTotal, 9000000);
  assert.equal((await canvasBooth('A-01')).discountAmount, 1000000);

  // the Super Admin tightens the limit with a cap in rupiah
  const cfg = await s.api('POST', '/invoices/config', { config: { salesMaxDiscountPercent: 10, salesMaxDiscountAmount: 500000 } }, { as: 'superadmin' });
  assert.equal(cfg.status, 200, cfg.text);
  assert.equal((await post({ discountType: 'nominal', discountValue: 600000, discountReason: 'Promo' })).status, 403);
  // Finance cannot change the Sales limit, and is not limited itself
  await s.api('POST', '/invoices/config', { config: { salesMaxDiscountPercent: 90, salesMaxDiscountAmount: 0 } }, { as: 'finance' });
  assert.equal((await summary('A-01')).body.discountLimit.maxDiscount, 500000);
  assert.equal((await post({ discountType: 'percentage', discountValue: 30, discountReason: 'Kemitraan' }, 'finance')).status, 200);
  assert.equal((await post({ discountType: 'nominal', discountValue: 500000, discountReason: 'Early bird' })).status, 200);

  const logs = (await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' })).body;
  const entry = (logs.logs || logs.data || []).find(l => l.action === 'Beri diskon booth' && /A-01/.test(l.target));
  assert.ok(entry, 'tercatat di Audit');
  assert.match(entry.summary, /→/);
});

test('Buat Invoice: data dari booking & diskon, tidak bisa dobel, diskon sesudahnya ikut ke invoice', async () => {
  const pre = (await summary('A-01')).body.invoicePreview;
  const inv = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-01', totalAmount: 1 }, { as: 'sales' });
  assert.equal(inv.status, 200, inv.text);
  assert.equal(inv.body.invoice.company_name, 'Kopi Satu');
  assert.equal(inv.body.invoice.total_amount, pre.total, 'total dihitung server, bukan dari form');
  assert.equal(inv.body.invoice.discount_amount, 500000);
  assert.equal(inv.body.invoice.discount_reason, 'Early bird');
  assert.equal(inv.body.invoice.payment_status, 'UNPAID');
  assert.equal((await boothRow('A-01')).status, 'reserved');

  const dup = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-01' }, { as: 'sales' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'CONTRACT_HAS_INVOICES');
  assert.equal(dup.body.invoice.invoice_number, inv.body.invoice.invoice_number);
  const sum = (await summary('A-01')).body;
  assert.equal(sum.actions.invoice.label, 'Lihat Invoice');
  assert.equal(sum.invoices.length, 1);

  // a later discount follows into the unpaid invoice (recalcContract)
  const d = await s.api('POST', '/booth-actions/discount', { floorplanId: FP, boothCode: 'A-01', discountType: 'nominal', discountValue: 200000, discountReason: 'Revisi' }, { as: 'sales' });
  assert.equal(d.status, 200, d.text);
  assert.equal(d.body.invoices[0].discount_amount, 200000);
});

test('Sold: hanya Lihat Invoice; diskon dan booking ditolak', async () => {
  const number = (await summary('A-01')).body.invoices[0].id;
  const paid = await s.api('POST', `/invoices/${number}/status`, { status: 'PAID' }, { as: 'finance' });
  assert.equal(paid.status, 200, paid.text);
  const sum = (await summary('A-01')).body;
  assert.equal(sum.booth.status, 'sold');
  assert.equal(sum.actions.invoice.label, 'Lihat Invoice');
  assert.equal(sum.actions.invoice.enabled, true);
  assert.equal(sum.actions.booking.enabled, false);
  assert.equal(sum.actions.discount.enabled, false);
  assert.ok(sum.actions.discount.reason);
  const d = await s.api('POST', '/booth-actions/discount', { floorplanId: FP, boothCode: 'A-01', discountType: 'nominal', discountValue: 100000, discountReason: 'x' }, { as: 'sales' });
  assert.equal(d.status, 409);
  assert.equal((await book('A-01', 'Brand Lain')).status, 409);
});

test('Maintenance: semua aksi ditolak dengan keterangan', async () => {
  const sum = (await summary('A-03')).body;
  assert.equal(sum.booth.status, 'maintenance');
  for (const key of ['invoice', 'booking', 'discount']) {
    assert.equal(sum.actions[key].enabled, false);
    assert.equal(sum.actions[key].reason, 'Booth sedang maintenance');
  }
  assert.equal((await book('A-03', 'Coba')).status, 409);
  assert.equal((await s.api('POST', '/booth-actions/discount', { floorplanId: FP, boothCode: 'A-03', discountType: 'nominal', discountValue: 1000, discountReason: 'x' }, { as: 'sales' })).status, 409);
  assert.equal((await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-03' }, { as: 'sales' })).status, 409);
});

test('Booking tanpa invoice bertahan: simpan Studio, sinkron status, dan invoice lama yang dibatalkan', async () => {
  // A-04: registered with an invoice by the admin, then released (its invoice is canceled)
  const first = await book('A-04', 'Tenant Lama', { deferInvoice: false }, 'superadmin');
  assert.equal(first.status, 200, first.text);
  assert.equal((await s.api('POST', '/orders/detach-tenant', { floorplanId: FP, boothCode: 'A-04', force: true }, { as: 'superadmin' })).status, 200);
  assert.equal((await boothRow('A-04')).status, 'available');

  assert.equal((await book('A-04', 'Tenant Baru')).status, 200);
  // any status sync (here: a payment on another booth) must not undo the booking
  await book('A-05', 'Pemicu', { deferInvoice: false }, 'superadmin');
  let row = await boothRow('A-04');
  assert.equal(row.status, 'reserved');
  assert.equal(row.owner_name, 'Tenant Baru');

  // the Super Admin saves the Studio canvas as loaded
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const save = await s.api('POST', '/floorplan/save', { id: FP, eventId: `EVT-${FP}`, title: fp.title, status: 'published', fabricJson: fp.canvas_fabric_json }, { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  row = await boothRow('A-04');
  assert.equal(row.status, 'reserved');
  assert.equal(row.owner_name, 'Tenant Baru');

  // Ubah Booking
  const upd = await s.api('PUT', '/orders/update-tenant', { floorplanId: FP, boothCode: 'A-04', brandName: 'Tenant Baru Jaya', fullName: 'Budi', email: 'budi@contoh.test', phone: '0811111111', brandCategory: 'Fashion', notes: 'Catatan baru' }, { as: 'sales' });
  assert.equal(upd.status, 200, upd.text);
  const sum = (await summary('A-04')).body;
  assert.equal(sum.booth.ownerName, 'Tenant Baru Jaya');
  assert.equal(sum.booth.notes, 'Catatan baru');
});

test('Role: Operasional & pengunjung ditolak; Finance & Super Admin boleh', async () => {
  const url = `/booth-actions/summary?floorplanId=${FP}&boothCode=A-02`;
  assert.equal((await s.api('GET', url)).status, 401);
  assert.equal((await s.api('GET', url, undefined, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', '/booth-actions/discount', { floorplanId: FP, boothCode: 'A-02', discountType: 'nominal', discountValue: 1000, discountReason: 'x' }, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-02' }, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-02' })).status, 401);
  assert.equal((await s.api('GET', url, undefined, { as: 'finance' })).status, 200);
  assert.equal((await s.api('GET', url, undefined, { as: 'superadmin' })).body.discountLimit.limited, false);
});
