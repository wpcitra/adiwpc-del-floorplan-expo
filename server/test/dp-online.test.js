// Online registration with a DP chosen by the visitor (Setting "DP minimal"), and the issued invoice returned so the
// registrant gets NO invoice: staff issue it after the WhatsApp confirmation (AGENTS.md §12)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-DPONLINE';
const visitor = (code, extra = {}) => ({
  floorplanId: FP, boothCodes: [code], fullName: 'Dewi', brandName: `Brand ${code}`, brandCategory: 'Fashion & Apparel',
  email: `${code}@contoh.test`, phone: '081234567890', bookingType: 'booking', ...extra
});

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, ['D-01', 'D-02', 'D-03', 'D-04'].map((c, i) => boothObject(c, { left: i * 300, top: 0, price: 5000000 })));
});
after(async () => { await s?.stop(); });

test('pengunjung memilih DP 20%: booth Reserved, TIDAK ada invoice, rencana DP dicatat untuk admin', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor('D-01', { paymentType: 'dp', dpPercent: 20, paidAmount: 999 }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.order.invoice, null, 'pendaftar tidak menerima invoice');
  assert.equal(r.body.order.invoiceNumber, null);
  assert.equal(r.body.order.boothStatus, 'reserved');
  const invoices = (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices || [];
  assert.equal(invoices.filter(i => /D-01/.test(i.booth_code)).length, 0, 'invoice hanya diterbitkan staf');
  const sum = await s.api('GET', `/booth-actions/summary?floorplanId=${FP}&boothCode=D-01`, undefined, { as: 'sales' });
  assert.match(JSON.stringify(sum.body), /DP 20%/, 'rencana pembayaran tersimpan di catatan booking');
});

test('DP di bawah minimal atau 100% ditolak untuk pengunjung', async () => {
  const low = await s.api('POST', '/orders/checkout', visitor('D-02', { paymentType: 'dp', dpPercent: 10 }));
  assert.equal(low.status, 400);
  assert.match(low.body.error, /minimal 20%/);
  const full = await s.api('POST', '/orders/checkout', visitor('D-02', { paymentType: 'dp', dpPercent: 100 }));
  assert.equal(full.status, 400);
});

test('DP minimal mengikuti Setting', async () => {
  await s.api('POST', '/invoices/config', { config: { publicMinDpPercent: 30 } }, { as: 'superadmin' });
  const r = await s.api('POST', '/orders/checkout', visitor('D-03', { paymentType: 'dp', dpPercent: 25 }));
  assert.equal(r.status, 400);
  const ok = await s.api('POST', '/orders/checkout', visitor('D-03', { paymentType: 'dp', dpPercent: 30 }));
  assert.equal(ok.status, 200, ok.text);
  const pub = (await s.api('GET', '/invoices/config')).body.config;
  assert.equal(pub.publicMinDpPercent, 30, 'form pengunjung membaca minimal dari Setting');
});

test('bayar penuh dari pengunjung juga tanpa invoice', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor('D-04', { paymentType: 'full' }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.order.invoice, null);
  assert.equal(r.body.order.boothStatus, 'reserved');
});
