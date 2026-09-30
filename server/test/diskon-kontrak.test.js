// Private discount on booth contracts (AGENTS.md §14, §18): a multi-booth / merged invoice follows the price and
// discount of ALL its booths, from "Simpan Diskon" (sync-booth-discount) and from a Studio save; paid invoices never change
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-DISKON';
const objects = (extra = {}) => [
  boothObject('G-01', { left: 0, top: 0, price: 5000000, extra: extra['G-01'] }),
  boothObject('G-02', { left: 60, top: 0, price: 5000000, extra: extra['G-02'] }),
  boothObject('H-01', { left: 400, top: 0, price: 5000000, extra: extra['H-01'] })
];
const invoiceOf = async (code) => (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' })).body.invoices
  .find(i => i.booth_code === code && i.payment_status !== 'CANCELED');
const discount = (boothCode, amount, reason = '') => s.api('POST', '/invoices/sync-booth-discount', {
  floorplanId: FP, boothCode, price: 5000000, discountType: 'nominal', discountValue: amount, discountReason: reason
}, { as: 'finance' });

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, objects());
  const reg = (codes) => ({ floorplanId: FP, boothCodes: codes, fullName: 'Tono', brandName: `Brand ${codes[0]}`, email: `${codes[0]}@c.test`, phone: '081234567890', bookingType: 'booking', taxMethod: 'exclusive' });
  assert.equal((await s.api('POST', '/orders/checkout', reg(['G-01', 'G-02']), { as: 'superadmin' })).status, 200);
  assert.equal((await s.api('POST', '/orders/checkout', reg(['H-01']), { as: 'superadmin' })).status, 200);
});
after(async () => { await s?.stop(); });

test('Simpan Diskon pada satu booth invoice gabungan: diskon = jumlah diskon semua booth, subtotal = semua booth', async () => {
  assert.equal((await discount('G-01', 1000000, 'Mitra')).status, 200);
  let inv = await invoiceOf('G-01+G-02');
  assert.equal(inv.subtotal, 10000000, 'subtotal tetap dua booth');
  assert.equal(inv.discount_amount, 1000000, 'kolom Diskon Privat terisi');
  assert.equal(inv.total_amount, 9990000, '(10 jt - 1 jt) + PPN 11%');
  assert.deepEqual(inv.items.map(i => i.amount), [5000000, 5000000]);

  assert.equal((await discount('G-02', 500000)).status, 200);
  inv = await invoiceOf('G-01+G-02');
  assert.equal(inv.discount_amount, 1500000);
  assert.equal(inv.total_amount, 9435000, '(10 jt - 1,5 jt) + PPN 11%');
  assert.equal(inv.tax_view.discount, 1500000);
});

test('diskon yang diubah lewat Simpan Denah di Studio ikut masuk ke invoice gabungan (PPN tidak hilang)', async () => {
  const save = await s.api('POST', '/floorplan/save', {
    id: FP, eventId: `EVT-${FP}`, title: `Tes ${FP}`, status: 'published',
    fabricJson: { version: '7.0.0', objects: objects({ 'G-01': { discountType: 'nominal', discountValue: 2000000, discountAmount: 2000000 }, 'G-02': { discountType: 'nominal', discountValue: 500000, discountAmount: 500000 } }) }
  }, { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  const inv = await invoiceOf('G-01+G-02');
  assert.equal(inv.discount_amount, 2500000);
  assert.equal(inv.total_amount, 8325000, '(10 jt - 2,5 jt) + PPN 11%');
});

test('invoice yang sudah lunas tidak berubah saat diskon booth diubah di Studio', async () => {
  const paid = await invoiceOf('H-01');
  await s.api('POST', `/invoices/${paid.id}/status`, { status: 'PAID' }, { as: 'finance' });
  const save = await s.api('POST', '/floorplan/save', {
    id: FP, eventId: `EVT-${FP}`, title: `Tes ${FP}`, status: 'published',
    fabricJson: { version: '7.0.0', objects: objects({ 'H-01': { discountType: 'nominal', discountValue: 3000000, discountAmount: 3000000 } }) }
  }, { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  const after = await invoiceOf('H-01');
  assert.equal(after.total_amount, 5550000, 'total lunas tetap');
  assert.equal(after.payment_status, 'PAID');
});
