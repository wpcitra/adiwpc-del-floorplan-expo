// Online registration with a DP chosen by the visitor (Setting "DP minimal"), and the issued invoice returned so the
// registrant can download it right away (AGENTS.md §12: a DP chosen at registration is a plan, nothing is paid yet)
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

test('pengunjung memilih DP 20%: Invoice DP diterbitkan & dikembalikan untuk diunduh, belum ada pembayaran', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor('D-01', { paymentType: 'dp', dpPercent: 20, paidAmount: 999 }));
  assert.equal(r.status, 200, r.text);
  const inv = r.body.order.invoice;
  assert.ok(inv, 'invoice ikut dikirim ke pendaftar');
  assert.equal(inv.invoice_number, r.body.order.invoiceNumber);
  assert.equal(inv.invoice_kind, 'dp');
  assert.equal(inv.total_amount, 1110000, 'DP 20% dari 5.550.000 (harga + PPN 11%)');
  assert.equal(inv.dp_percent, 20);
  assert.equal(inv.payment_status, 'UNPAID');
  assert.equal(inv.paid_amount, 0, 'DP masih rencana sampai keuangan mengonfirmasi');
  assert.ok(inv.tax_view, 'lengkap untuk dokumen A4');
  // the same invoice as in Manajemen Invoice
  const same = (await s.api('GET', `/invoices/${inv.id}`, undefined, { as: 'finance' })).body.invoice;
  assert.equal(same.total_amount, inv.total_amount);
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

test('bayar penuh tetap satu invoice penuh', async () => {
  const r = await s.api('POST', '/orders/checkout', visitor('D-04', { paymentType: 'full' }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.order.invoice.invoice_kind, 'full');
  assert.equal(r.body.order.invoice.total_amount, 5550000);
});
