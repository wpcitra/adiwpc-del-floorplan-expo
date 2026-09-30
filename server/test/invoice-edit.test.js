// Editing an issued invoice (POST /invoices/:id/terms, PUT /invoices/:id): DP amount while unpaid, contract PPN,
// per-invoice display choices, and the same invoice from Manajemen Invoice (list) and Data Exhibitor (single)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-EDIT';
const reg = (code, extra = {}) => ({
  floorplanId: FP, boothCodes: [code], fullName: 'Rina', brandName: `Brand ${code}`, email: `${code}@contoh.test`,
  phone: '081234567890', bookingType: 'booking', ...extra
});
const list = async (code) => (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' })).body.invoices
  .filter(i => i.booth_code === code && i.payment_status !== 'CANCELED');
const byKind = (rows, kind) => rows.find(i => i.invoice_kind === kind);

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('E-01', { left: 0, top: 0, price: 5000000 }),
    boothObject('E-02', { left: 300, top: 0, price: 5000000 }),
    boothObject('E-03', { left: 600, top: 0, price: 5000000 }),
    boothObject('M-01', { left: 0, top: 300, price: 5000000 }),
    boothObject('M-02', { left: 60, top: 300, price: 5000000 })
  ]);
});
after(async () => { await s?.stop(); });

test('DP bisa diubah selama belum dibayar; Pelunasan ikut = kontrak - DP, PPN tetap pas', async () => {
  await s.api('POST', '/orders/checkout', reg('E-01', { taxMethod: 'exclusive' }), { as: 'superadmin' });
  await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'E-01', dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  const dp = byKind(await list('E-01'), 'dp');
  const r = await s.api('POST', `/invoices/${dp.id}/terms`, { dpMode: 'percent', dpValue: 50 }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  const rows = await list('E-01');
  const d = byKind(rows, 'dp');
  const pl = byKind(rows, 'settlement');
  assert.equal(d.total_amount, 2775000, 'DP 50% dari 5.550.000');
  assert.equal(d.dp_percent, 50);
  assert.equal(pl.total_amount, 2775000);
  assert.equal(d.tax_amount + pl.tax_amount, 550000);
  assert.match(JSON.stringify(d.items), /DP 50%/);
});

test('DP yang sudah dibayar tidak bisa diubah nominalnya', async () => {
  const dp = byKind(await list('E-01'), 'dp');
  await s.api('POST', `/invoices/${dp.id}/status`, { status: 'PAID' }, { as: 'finance' });
  const r = await s.api('POST', `/invoices/${dp.id}/terms`, { dpMode: 'percent', dpValue: 20 }, { as: 'finance' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DP_ALREADY_PAID');
});

test('pajak kontrak diubah dari Invoice Pelunasan: butuh konfirmasi, DP yang belum dibayar ikut dihitung ulang', async () => {
  await s.api('POST', '/orders/checkout', reg('E-02', { taxMethod: 'exclusive' }), { as: 'superadmin' });
  await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'E-02', dpMode: 'nominal', dpValue: 1500000 }, { as: 'finance' });
  const pl = byKind(await list('E-02'), 'settlement');
  const body = { taxMethod: 'inclusive', taxDisplay: 'hide', taxRate: 11 };
  const ask = await s.api('POST', `/invoices/${pl.id}/terms`, body, { as: 'finance' });
  assert.equal(ask.body.code, 'TAX_CHANGE_CONFIRM');
  const ok = await s.api('POST', `/invoices/${pl.id}/terms`, { ...body, changeContractTax: true }, { as: 'finance' });
  assert.equal(ok.status, 200, ok.text);
  const rows = await list('E-02');
  const d = byKind(rows, 'dp');
  const p = byKind(rows, 'settlement');
  assert.equal(d.tax_method, 'inclusive');
  assert.equal(d.total_amount + p.total_amount, 5000000, 'kontrak baru: harga sudah termasuk PPN');
  assert.equal(d.tax_amount + p.tax_amount, 495495);
});

test('pilihan tampil/tidak disimpan per invoice; invoice dari daftar = invoice dari detail (menu Exhibitor)', async () => {
  await s.api('POST', '/orders/checkout', reg('E-03'), { as: 'superadmin' });
  const [inv] = await list('E-03');
  const r = await s.api('POST', `/invoices/${inv.id}/terms`, { display: { showBank: false, showDiscount: false, bukanKunci: true } }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  const [fromList] = await list('E-03');
  const single = (await s.api('GET', `/invoices/${encodeURIComponent(inv.invoice_number)}`, undefined, { as: 'finance' })).body.invoice;
  assert.deepEqual(fromList.display, { showBank: false, showDiscount: false });
  for (const k of ['id', 'invoice_number', 'total_amount', 'subtotal', 'discount_amount', 'paid_amount', 'remaining_amount', 'display', 'tax_view', 'contract', 'booth_specs']) {
    assert.deepEqual(single[k], fromList[k], `field ${k} sama di kedua menu`);
  }
});

test('edit data klien tanpa mengirim item tidak menghapus item invoice', async () => {
  const [inv] = await list('E-03');
  const before = JSON.stringify(inv.items);
  const r = await s.api('PUT', `/invoices/${inv.id}`, { clientName: 'Rina Baru', notes: 'catatan' }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  const [after] = await list('E-03');
  assert.equal(after.client_name, 'Rina Baru');
  assert.equal(JSON.stringify(after.items), before);
  assert.equal(after.total_amount, inv.total_amount);
});

test('invoice multi-booth / booth gabungan ("M-01+M-02") bisa dibuka & diedit, tidak lagi "booth tidak ditemukan"', async () => {
  const r = await s.api('POST', '/orders/checkout', { ...reg('M-01'), boothCodes: ['M-01', 'M-02'] }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const [inv] = (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' })).body.invoices.filter(i => i.booth_code === 'M-01+M-02');
  const c = await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${encodeURIComponent(inv.booth_code)}`, undefined, { as: 'finance' });
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.contract.contractCode, 'M-01+M-02');
  assert.equal(c.body.contract.base.subtotal, 10000000, 'kontrak = kedua booth');
  const split = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: c.body.contract.booth.code, dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  assert.equal(split.status, 200, split.text);
  assert.equal(split.body.invoice.booth_code, 'M-01+M-02');
  const t = await s.api('POST', `/invoices/${inv.id}/terms`, { display: { showBank: false } }, { as: 'finance' });
  assert.equal(t.status, 200, t.text);
});

test('Sales melihat & membuka invoice buatan Keuangan di Data Exhibitor, tetapi tidak bisa mengubahnya', async () => {
  const ex = await s.api('GET', '/exhibitors?projectId=all', undefined, { as: 'sales' });
  assert.equal(ex.status, 200, ex.text);
  const rows = ex.body.exhibitors || ex.body.data || [];
  const row = rows.find(e => e.booth === 'E-03');
  assert.ok(row?.invoices?.length >= 1, 'baris exhibitor memuat invoice');
  const one = await s.api('GET', `/invoices/${row.invoices[0].id}`, undefined, { as: 'sales' });
  assert.equal(one.status, 200, 'Sales bisa membuka / mengunduh');
  assert.equal(one.body.invoice.invoice_number, row.invoices[0].invoiceNumber);
  const edit = await s.api('POST', `/invoices/${row.invoices[0].id}/terms`, { display: { showBank: true } }, { as: 'sales' });
  assert.equal(edit.status, 403, 'mengubah invoice hanya untuk Keuangan');
});
