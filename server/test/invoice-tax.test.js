// One invoice per registration (all booths, adjacent or not) and the PPN choice (AGENTS.md §14)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-INVOICE';
const reg = (codes, extra = {}) => ({
  floorplanId: FP, boothCodes: codes, fullName: 'Budi', brandName: `Brand ${codes.join('')}`,
  email: `${codes.join('').toLowerCase()}@contoh.test`, phone: '081234567890', bookingType: 'booking', ...extra
});
const invoicesOf = async (codeFragment) => {
  const r = await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' });
  return (r.body.invoices || r.body.data || []).filter(i => (i.booth_code || '').includes(codeFragment) && i.payment_status !== 'CANCELED');
};

before(async () => {
  s = await startServer();
  // far apart from each other: A-01 / B-01 / C-01 never touch
  await createPublishedFloorplan(s.api, FP, [
    boothObject('A-01', { left: 0, top: 0, price: 10000000 }),
    boothObject('B-01', { left: 300, top: 0, price: 12000000 }),
    boothObject('C-01', { left: 0, top: 300, price: 8000000 }),
    boothObject('D-01', { left: 600, top: 0, price: 10000000 }),
    boothObject('D-02', { left: 600, top: 300, price: 10000000 }),
    boothObject('E-01', { left: 900, top: 0, price: 10000000 }),
    boothObject('E-02', { left: 900, top: 300, price: 5000000 })
  ]);
});
after(async () => { await s?.stop(); });

test('pesanan 3 booth yang tidak bersebelahan menghasilkan SATU invoice berisi semua booth', async () => {
  const r = await s.api('POST', '/orders/checkout', reg(['C-01', 'A-01', 'B-01']));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.order.invoiceNumbers.length, 1);
  const inv = await invoicesOf('A-01');
  assert.equal(inv.length, 1);
  assert.equal(inv[0].booth_code, 'A-01+B-01+C-01');
  const items = typeof inv[0].items_json === 'string' ? JSON.parse(inv[0].items_json) : (inv[0].items || inv[0].items_json);
  assert.deepEqual(items.map(i => i.boothCode), ['A-01', 'B-01', 'C-01']);
  // every booth's contract is that one invoice
  for (const code of ['A-01', 'B-01', 'C-01']) {
    const c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
    assert.equal(c.invoices.length, 1, code);
    assert.equal(c.invoices[0].invoice_number, inv[0].invoice_number, code);
  }
});

test('pengunjung: PPN mengikuti Setting (default 11%), dihitung server; total dari form diabaikan', async () => {
  const r = await s.api('POST', '/orders/checkout', reg(['D-01'], { totalAmount: 1000 }));
  assert.equal(r.status, 200, r.text);
  const [inv] = await invoicesOf('D-01');
  assert.equal(inv.subtotal, 10000000);
  assert.equal(inv.tax_rate, 11);
  assert.equal(inv.tax_amount, 1100000);
  assert.equal(inv.total_amount, 11100000, 'total palsu dari form tidak dipakai');
  assert.equal(inv.contract_tax_rate, 11);
  assert.equal(r.body.order.totalAmount, 11100000);
  // a visitor cannot switch the tax off
  const r2 = await s.api('POST', '/orders/checkout', reg(['D-02'], { applyTax: false, taxRate: 0 }));
  assert.equal(r2.status, 200, r2.text);
  assert.equal((await invoicesOf('D-02'))[0].tax_rate, 11);
});

test('staf memilih Tanpa PPN atau Dengan PPN (tarif sendiri)', async () => {
  const noTax = await s.api('POST', '/orders/checkout', reg(['E-01'], { applyTax: false }), { as: 'superadmin' });
  assert.equal(noTax.status, 200, noTax.text);
  const [a] = await invoicesOf('E-01');
  assert.equal(a.tax_rate, 0);
  assert.equal(a.tax_amount, 0);
  assert.equal(a.total_amount, 10000000);
  const withTax = await s.api('POST', '/orders/checkout', reg(['E-02'], { applyTax: true, taxRate: 12 }), { as: 'superadmin' });
  assert.equal(withTax.status, 200, withTax.text);
  const [b] = await invoicesOf('E-02');
  assert.equal(b.tax_rate, 12);
  assert.equal(b.tax_amount, 600000);
  assert.equal(b.total_amount, 5600000);
});

test('Setting "PPN pemesanan online" nonaktif: pengunjung tidak dikenakan PPN', async () => {
  const cfg = await s.api('POST', '/invoices/config', { config: { publicBookingTax: false } }, { as: 'superadmin' });
  assert.equal(cfg.status, 200, cfg.text);
  // release E-02 first so it can be booked again by a visitor
  const detach = await s.api('POST', '/orders/detach-tenant', { floorplanId: FP, boothCode: 'E-02' }, { as: 'superadmin' });
  assert.equal(detach.status, 200, detach.text);
  const r = await s.api('POST', '/orders/checkout', reg(['E-02'], { email: 'baru@contoh.test', brandName: 'Baru' }));
  assert.equal(r.status, 200, r.text);
  const inv = (await invoicesOf('E-02')).find(i => i.company_name === 'Baru');
  assert.equal(inv.tax_rate, 0);
  assert.equal(inv.total_amount, 5000000);
});

test('mengedit invoice penuh menjadi Tanpa PPN: nilai kontrak ikut berubah, lunas = PAID', async () => {
  const [inv] = await invoicesOf('D-01'); // 10.000.000 + PPN 11%
  const r = await s.api('PUT', `/invoices/${inv.id}`, { taxRate: 0, taxAmount: 0, totalAmount: 10000000 }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  let c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=D-01`, undefined, { as: 'finance' })).body.contract;
  assert.equal(c.contractTotal, 10000000);
  assert.equal((await s.api('POST', `/invoices/${inv.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  c = (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=D-01`, undefined, { as: 'finance' })).body.contract;
  assert.equal(c.status, 'PAID');
  assert.equal(c.remaining, 0);
});
