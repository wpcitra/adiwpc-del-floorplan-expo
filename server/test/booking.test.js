// Public booking (AGENTS.md §8, §12, §13), contract billing DP + Pelunasan + discount (§14) and auto-merge (§18)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-BOOKING';
const visitor = (codes, extra = {}) => ({
  floorplanId: FP, boothCodes: codes, fullName: 'Budi Tes', brandName: 'Kopi Tes', brandCategory: 'F&B',
  email: 'budi@contoh.test', phone: '081234567890', bookingType: 'booking', ...extra
});
const boothRow = async (code) => {
  const r = await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' });
  return r.body.floorplan.booths.find(b => b.code === code);
};

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('A-01', { left: 0, top: 0 }),
    boothObject('A-02', { left: 60, top: 0 }), // touches A-01 (auto-merge candidate)
    boothObject('A-03', { left: 200, top: 0 }),
    boothObject('B-01', { left: 0, top: 200, price: 20000000 }),
    boothObject('B-02', { left: 200, top: 200 })
  ]);
});
after(async () => { await s?.stop(); });

test('draft tidak bisa dibooking pengunjung', async () => {
  await s.api('POST', '/floorplan/save', {
    id: 'FP-TEST-DRAFT', eventId: 'EVT-D', title: 'Draft', status: 'draft',
    fabricJson: { version: '7.0.0', objects: [boothObject('D-01', { left: 0, top: 0 })] }
  }, { as: 'superadmin' });
  const r = await s.api('POST', '/orders/checkout', { ...visitor(['D-01']), floorplanId: 'FP-TEST-DRAFT' });
  assert.equal(r.status, 404);
});

test('pengunjung tidak boleh memakai pembayaran instan lunas', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['A-03'], { bookingType: 'payment_gateway' }));
  assert.equal(r.status, 400);
  assert.notEqual((await boothRow('A-03')).status, 'sold');
});

test('booth yang tidak ada ditolak 404', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['Z-99']));
  assert.equal(r.status, 404);
});

test('booking publik: booth menjadi reserved, belum ada pembayaran tercatat', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['A-03']));
  assert.equal(r.status, 200, r.text);
  const b = await boothRow('A-03');
  assert.equal(b.status, 'reserved');
  const c = await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=A-03`, undefined, { as: 'finance' });
  assert.equal(c.body.contract.paid, 0);
});

test('booth yang sudah dipesan tidak bisa dipesan pengunjung lain (409)', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['A-03'], { email: 'lain@contoh.test', brandName: 'Brand Lain' }));
  assert.equal(r.status, 409);
  assert.equal((await boothRow('A-03')).owner_name, 'Kopi Tes');
});

test('kode booth mirip tidak ikut terpengaruh (A-1 bukan A-10..)', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['A-0']));
  assert.equal(r.status, 404);
  assert.equal((await boothRow('A-01')).status, 'available');
});

test('kontrak DP + Pelunasan dengan diskon: nilai dihitung server, status mengikuti pembayaran', async () => {
  const code = 'B-01'; // price 20.000.000
  const reg = await s.api('POST', '/orders/checkout', visitor([code], { email: 'dp@contoh.test', brandName: 'Tenant DP' }));
  assert.equal(reg.status, 200, reg.text);

  const disc = await s.api('POST', '/invoices/sync-booth-discount', {
    floorplanId: FP, boothCode: code, price: 20000000, discountType: 'nominal', discountValue: 2000000, discountReason: 'Tes'
  }, { as: 'finance' });
  assert.equal(disc.status, 200, disc.text);

  // The checkout draft invoice is a 'full' invoice; a DP turns it into the Pelunasan
  const dp = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: code, dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  assert.equal(dp.status, 200, dp.text);
  let c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
  assert.equal(c.contractTotal, 18000000, 'kontrak = harga - diskon');
  assert.equal(c.dpInvoice.total_amount, 5400000, 'DP 30% dari 18 jt');
  assert.equal(c.status, 'UNPAID');

  // Second DP is rejected
  const dp2 = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: code, dpMode: 'percent', dpValue: 10 }, { as: 'finance' });
  assert.equal(dp2.status, 409);

  // DP paid -> PARTIAL, booth reserved
  assert.equal((await s.api('POST', `/invoices/${c.dpInvoice.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
  assert.equal(c.status, 'PARTIAL');
  assert.equal(c.paid, 5400000);
  assert.equal((await boothRow(code)).status, 'reserved');

  // Pelunasan = contract - DP; paid -> PAID, booth sold
  let settle = c.settlementInvoice;
  if (!settle) {
    const r = await s.api('POST', '/invoices', { invoiceKind: 'settlement', floorplanId: FP, boothCode: code }, { as: 'finance' });
    assert.equal(r.status, 200, r.text);
    c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
    settle = c.settlementInvoice;
  }
  assert.equal(settle.total_amount, 12600000, 'pelunasan = 18 jt - 5,4 jt');
  assert.equal((await s.api('POST', `/invoices/${settle.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
  assert.equal(c.status, 'PAID');
  assert.equal(c.remaining, 0);
  assert.equal((await boothRow(code)).status, 'sold');

  // A paid contract invoice cannot be deleted
  assert.equal((await s.api('DELETE', `/invoices/${settle.id}`, undefined, { as: 'finance' })).status, 409);
});

test('multi-booth berdampingan satu exhibitor: satu invoice untuk grup (auto-merge)', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor(['A-01', 'A-02'], { email: 'grup@contoh.test', brandName: 'Brand Grup' }));
  assert.equal(r.status, 200, r.text);
  const a1 = await boothRow('A-01');
  const a2 = await boothRow('A-02');
  assert.equal(a1.status, 'reserved');
  assert.equal(a2.status, 'reserved');
  assert.ok(a1.exhibitor_id && a1.exhibitor_id === a2.exhibitor_id, 'exhibitor ID sama');
  const inv = await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' });
  const list = inv.body.invoices || inv.body.data || [];
  const groupInvoices = list.filter(i => /A-01/.test(i.booth_code || '') && /A-02/.test(i.booth_code || ''));
  assert.equal(groupInvoices.length, 1, 'tepat satu invoice untuk A-01+A-02');
});
