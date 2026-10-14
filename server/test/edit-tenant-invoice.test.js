// Inline edit of Perusahaan / PIC / WhatsApp in Manajemen Invoice: one save reaches booth, orders, invoices and canvas,
// and keeps the brand category (AGENTS.md §6, §10)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-EDITTENANT';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 300, top: 0 })]);
});
after(async () => { await s?.stop(); });

test('edit tenant dari baris invoice: booth, pesanan, invoice dan kategori brand tetap sinkron', async () => {
  const reg = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['A-01', 'A-02'], fullName: 'Budi', brandName: 'Lama', brandCategory: 'F&B', phone: '081234567890', bookingType: 'booking'
  }, { as: 'superadmin' });
  assert.equal(reg.status, 200, reg.text);
  const inv = reg.body.order.invoice;
  assert.equal(inv.booth_code, 'A-01+A-02');
  for (const boothCode of ['A-01', 'A-02']) {
    const r = await s.api('PUT', '/orders/update-tenant', { floorplanId: FP, boothCode, brandName: 'Baru', fullName: 'Sari', phone: '081999888777' }, { as: 'finance' });
    assert.equal(r.status, 200, r.text);
  }
  const put = await s.api('PUT', `/invoices/${inv.id}`, { clientName: 'Sari', companyName: 'Baru', clientPhone: '081999888777' }, { as: 'finance' });
  assert.equal(put.status, 200, put.text);
  const got = (await s.api('GET', `/invoices/${inv.id}`, undefined, { as: 'finance' })).body.invoice;
  assert.equal(got.company_name, 'Baru');
  assert.equal(got.client_name, 'Sari');
  assert.equal(got.client_phone, '081999888777');
  assert.equal(got.total_amount, inv.total_amount, 'tagihan tidak berubah');
  const booths = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths;
  for (const code of ['A-01', 'A-02']) {
    const b = booths.find(x => x.code === code);
    assert.equal(b.owner_name, 'Baru');
    assert.equal(b.pic_name, 'Sari');
    assert.equal(b.brand_category, 'F&B', 'kategori brand tidak terhapus');
  }
});
