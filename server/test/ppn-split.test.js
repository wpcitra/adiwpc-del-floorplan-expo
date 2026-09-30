// PPN split per invoice (shared/invoiceTax.js, AGENTS.md §14): method (added / included), display (show / hide),
// DP + Pelunasan PPN adding up exactly, and older invoices split from their stored total and rate
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { invoiceTaxView, computeContractTax, taxPortion, taxRemainder } from '../../shared/invoiceTax.js';

let s;
const FP = 'FP-TEST-PPN';
const staffReg = (code, extra = {}) => ({
  floorplanId: FP, boothCodes: [code], fullName: 'Sari', brandName: `Brand ${code}`,
  email: `${code.toLowerCase()}@contoh.test`, phone: '081234567890', bookingType: 'booking', ...extra
});
const invoicesOf = async (code) => {
  const r = await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' });
  return (r.body.invoices || []).filter(i => i.booth_code === code && i.payment_status !== 'CANCELED');
};
const byKind = (list, kind) => list.find(i => i.invoice_kind === kind);
const sumLines = (view) => view.lines.reduce((a, l) => a + l.amount, 0);

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('P-01', { left: 0, top: 0, price: 5000000 }),
    boothObject('P-02', { left: 300, top: 0, price: 5000000 }),
    boothObject('P-03', { left: 600, top: 0, price: 5000000 }),
    boothObject('P-04', { left: 900, top: 0, price: 10000000 }),
    boothObject('P-05', { left: 0, top: 300, price: 5000000 }),
    boothObject('P-06', { left: 300, top: 300, price: 5000000 })
  ]);
});
after(async () => { await s?.stop(); });

test('PPN ditambahkan ke harga: 5 jt + PPN 550 rb; DP 30% dan Pelunasan membagi PPN tanpa selisih', async () => {
  const r = await s.api('POST', '/orders/checkout', staffReg('P-01', { taxMethod: 'exclusive', taxDisplay: 'show' }), { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  let [full] = await invoicesOf('P-01');
  assert.equal(full.total_amount, 5550000);
  assert.equal(full.dpp_amount, 5000000);
  assert.equal(full.tax_amount, 550000);
  assert.equal(full.tax_method, 'exclusive');
  // Document: booth price before PPN in the table, PPN in the total block
  assert.equal(full.tax_view.lines[0].amount, 5000000);
  assert.equal(full.tax_view.subtotal, 5000000);
  assert.equal(full.tax_view.ppn, 550000);
  assert.equal(full.tax_view.total, 5550000);
  assert.equal(full.tax_view.showBreakdown, true);

  const dp = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'P-01', dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  assert.equal(dp.status, 200, dp.text);
  const list = await invoicesOf('P-01');
  const d = byKind(list, 'dp');
  const pl = byKind(list, 'settlement');
  assert.equal(d.total_amount, 1665000, 'DP 30% dari total kontrak termasuk PPN');
  assert.equal(d.dpp_amount, 1500000);
  assert.equal(d.tax_amount, 165000);
  assert.equal(pl.total_amount, 3885000);
  assert.equal(pl.dpp_amount, 3500000);
  assert.equal(pl.tax_amount, 385000);
  assert.equal(d.tax_amount + pl.tax_amount, 550000, 'PPN DP + PPN Pelunasan = PPN kontrak');
  // Pelunasan document: DPP line, the DP split and the contract box
  assert.equal(sumLines(pl.tax_view), 3500000);
  assert.deepEqual(pl.tax_view.dpPart, { dpp: 1500000, ppn: 165000, total: 1665000 });
  assert.equal(pl.tax_view.contract.subtotal, 5000000);
  assert.equal(pl.tax_view.contract.ppn, 550000);
});

test('Harga sudah termasuk PPN + sembunyikan rincian: total tetap 5 jt, DPP 4.504.505 + PPN 495.495', async () => {
  const r = await s.api('POST', '/orders/checkout', staffReg('P-02', { taxMethod: 'inclusive', taxDisplay: 'hide' }), { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const [full] = await invoicesOf('P-02');
  assert.equal(full.total_amount, 5000000);
  assert.equal(full.dpp_amount, 4504505);
  assert.equal(full.tax_amount, 495495);
  assert.equal(full.tax_display, 'hide');
  assert.equal(full.tax_view.showBreakdown, false);
  assert.equal(sumLines(full.tax_view), 5000000, 'tanpa rincian: tabel memakai harga yang dibayar');

  await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'P-02', dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  const list = await invoicesOf('P-02');
  const d = byKind(list, 'dp');
  const pl = byKind(list, 'settlement');
  assert.equal(d.total_amount, 1500000);
  assert.equal(d.tax_amount, 148649);
  assert.equal(pl.total_amount, 3500000);
  assert.equal(d.tax_amount + pl.tax_amount, 495495);
  assert.equal(d.dpp_amount + pl.dpp_amount, 4504505);
  assert.equal(d.tax_display, 'hide');
});

test('"Sembunyikan rincian" tidak bisa dipakai bila PPN ditambahkan ke harga', async () => {
  const r = await s.api('POST', '/orders/checkout', staffReg('P-03', { taxMethod: 'exclusive', taxDisplay: 'hide' }), { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const [full] = await invoicesOf('P-03');
  assert.equal(full.tax_display, 'show');
  assert.equal(full.tax_view.showBreakdown, true);
});

test('diskon privat diterapkan sebelum PPN: 10 jt - 1 jt = DPP 9 jt, PPN 990 rb', async () => {
  const r = await s.api('POST', '/orders/checkout', staffReg('P-04', { taxMethod: 'exclusive' }), { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const disc = await s.api('POST', '/invoices/sync-booth-discount', {
    floorplanId: FP, boothCode: 'P-04', price: 10000000, discountType: 'nominal', discountValue: 1000000, discountReason: 'Mitra'
  }, { as: 'finance' });
  assert.equal(disc.status, 200, disc.text);
  const [full] = await invoicesOf('P-04');
  assert.equal(full.total_amount, 9990000);
  assert.equal(full.tax_view.subtotal, 10000000);
  assert.equal(full.tax_view.discount, 1000000);
  assert.equal(full.tax_view.dpp, 9000000);
  assert.equal(full.tax_view.ppn, 990000);
});

test('mengubah pajak kontrak yang berjalan butuh konfirmasi; invoice belum dibayar dihitung ulang', async () => {
  const r = await s.api('POST', '/orders/checkout', staffReg('P-05', { taxMethod: 'exclusive' }), { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const body = { invoiceKind: 'dp', floorplanId: FP, boothCode: 'P-05', dpMode: 'percent', dpValue: 30, taxMethod: 'inclusive', taxDisplay: 'show', taxRate: 11 };
  const ask = await s.api('POST', '/invoices', body, { as: 'finance' });
  assert.equal(ask.status, 409);
  assert.equal(ask.body.code, 'TAX_CHANGE_CONFIRM');
  const ok = await s.api('POST', '/invoices', { ...body, changeContractTax: true }, { as: 'finance' });
  assert.equal(ok.status, 200, ok.text);
  const list = await invoicesOf('P-05');
  const d = byKind(list, 'dp');
  const pl = byKind(list, 'settlement');
  assert.equal(d.contract_total, 5000000, 'kontrak mengikuti metode baru');
  assert.equal(d.total_amount + pl.total_amount, 5000000);
  assert.equal(d.tax_amount + pl.tax_amount, 495495);
  assert.equal(pl.tax_method, 'inclusive');
});

test('pengunjung mengikuti default Setting: harga sudah termasuk PPN', async () => {
  const cfg = await s.api('POST', '/invoices/config', { config: { defaultTaxMethod: 'inclusive', defaultTaxDisplay: 'show', publicBookingTax: true } }, { as: 'superadmin' });
  assert.equal(cfg.status, 200, cfg.text);
  const r = await s.api('POST', '/orders/checkout', staffReg('P-06', { taxMethod: 'none' }));
  assert.equal(r.status, 200, r.text);
  const [full] = await invoicesOf('P-06');
  assert.equal(full.tax_method, 'inclusive', 'pengunjung tidak bisa memilih');
  assert.equal(full.total_amount, 5000000);
  assert.equal(full.tax_amount, 495495);
});

test('invoice lama: PPN hanya di total kontrak dipisah ulang dari tarif yang tersimpan (total tidak berubah)', () => {
  // INV/PL/2026/88393: Pelunasan tanpa DP, item 5.550.000, tax 0, contract_tax_rate 11
  const v = invoiceTaxView({
    invoice_kind: 'settlement', total_amount: 5550000, subtotal: 5550000, tax_rate: 0, tax_amount: 0,
    contract_total: 5550000, contract_tax_rate: 11, items: [{ description: 'Pelunasan Sewa Booth #A-03', qty: 1, unitPrice: 5550000, amount: 5550000 }]
  });
  assert.equal(v.derived, true);
  assert.equal(v.lines[0].amount, 5000000);
  assert.equal(v.ppn, 550000);
  assert.equal(v.total, 5550000);
  // Invoice Penuh lama: total 11,1 jt dari subtotal 10 jt tanpa tax_amount tersimpan
  const f = invoiceTaxView({ invoice_kind: 'full', total_amount: 11100000, subtotal: 10000000, discount_amount: 0, tax_amount: 0, contract_tax_rate: 0, items: [{ amount: 5000000 }, { amount: 5000000 }] });
  assert.equal(f.rate, 11);
  assert.equal(f.ppn, 1100000);
  assert.equal(f.derived, true);
  // Lama dengan DP: DP + Pelunasan = kontrak
  const contract = computeContractTax({ subtotal: 5000000, rate: 11, method: 'exclusive' });
  const dp = taxPortion(contract, 1665000);
  const rest = taxRemainder(contract, dp);
  assert.equal(dp.ppn + rest.ppn, 550000);
  assert.equal(dp.dpp + rest.dpp, 5000000);
});
