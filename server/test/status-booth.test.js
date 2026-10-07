// Status booth dari Property Inspector Studio (AGENTS.md §37): perubahan status booth yang punya tenant harus tetap
// setelah halaman di-refresh, karena booking / invoice (otoritas status) ikut diubah, bukan hanya kanvas.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-STATUS';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('A-01', { left: 0, top: 0 }),
    boothObject('A-02', { left: 400, top: 0 }),
    boothObject('A-03', { left: 800, top: 0 }),
    boothObject('A-04', { left: 1200, top: 0 })
  ]);
});
after(async () => { await s.stop(); });

const book = (code, brand, extra = {}) => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], boothCode: code, fullName: `PIC ${brand}`, brandName: brand, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', source: 'admin', ...extra
}, { as: 'superadmin' });
const floorplan = async () => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
const boothRow = async (code) => (await floorplan()).booths.find(b => b.code === code);
const setStatus = (code, status, as = 'superadmin', extra = {}) => s.api('POST', `/floorplan/${FP}/booth-status`, { boothCode: code, status, ...extra }, { as });
// The Studio autosave right after the change: the canvas as the editor holds it, with the new status
const studioSave = async (code, status) => {
  const fp = await floorplan();
  const fabricJson = fp.canvas_fabric_json;
  fabricJson.objects.forEach(o => { if (o.boothData?.code === code) o.boothData.status = status; });
  return s.api('POST', '/floorplan/save', { id: FP, eventId: fp.event_id, title: fp.title, status: fp.status, fabricJson }, { as: 'superadmin' });
};

test('Booking tanpa invoice: Reserved -> Sold -> Reserved bertahan setelah simpan Studio', async () => {
  assert.equal((await book('A-01', 'Teh Melati', { deferInvoice: true })).status, 200);
  const r = await setStatus('A-01', 'sold');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.booth.status, 'sold');
  assert.equal((await studioSave('A-01', 'sold')).status, 200);
  assert.equal((await boothRow('A-01')).status, 'sold', 'status tidak kembali ke Reserved');

  assert.equal((await setStatus('A-01', 'reserved')).status, 200);
  assert.equal((await studioSave('A-01', 'reserved')).status, 200);
  const row = await boothRow('A-01');
  assert.equal(row.status, 'reserved', 'order lunas dikembalikan ke belum bayar');
  assert.equal(row.owner_name, 'Teh Melati');
});

test('Booth dengan invoice: Sold menandai kontrak lunas, Reserved membukanya lagi; kanvas ikut', async () => {
  assert.equal((await book('A-02', 'Roti Maros')).status, 200);
  const ask = await setStatus('A-02', 'sold');
  assert.equal(ask.status, 409, 'menandai invoice lunas harus dikonfirmasi');
  assert.equal(ask.body.code, 'CONFIRM_PAYMENT');
  assert.equal((await boothRow('A-02')).status, 'reserved');
  const r = await setStatus('A-02', 'sold', 'superadmin', { confirmPayment: true });
  assert.equal(r.status, 200, r.text);
  assert.equal((await studioSave('A-02', 'sold')).status, 200);
  const fp = await floorplan();
  assert.equal(fp.booths.find(b => b.code === 'A-02').status, 'sold');
  assert.equal(fp.canvas_fabric_json.objects.find(o => o.boothData?.code === 'A-02').boothData.status, 'sold');
  const invs = (await s.api('GET', '/invoices', undefined, { as: 'superadmin' })).body.invoices.filter(i => (i.booth_code || i.boothCode) === 'A-02');
  assert.ok(invs.length && invs.every(i => String(i.payment_status || i.paymentStatus).toUpperCase() === 'PAID'));

  assert.equal((await setStatus('A-02', 'reserved', 'superadmin', { confirmPayment: true })).status, 200);
  assert.equal((await studioSave('A-02', 'reserved')).status, 200);
  assert.equal((await boothRow('A-02')).status, 'reserved');
});

test('Available / Maintenance pada booth bertenant ditolak (pakai Lepas Tenant); booth kosong bebas', async () => {
  assert.equal((await book('A-03', 'Kopi Nusantara', { deferInvoice: true })).status, 200);
  for (const st of ['available', 'maintenance']) {
    const r = await setStatus('A-03', st);
    assert.equal(r.status, 409, r.text);
    assert.equal(r.body.code, 'DETACH_TENANT_FIRST');
  }
  assert.equal((await boothRow('A-03')).status, 'reserved');

  const free = await setStatus('A-04', 'maintenance');
  assert.equal(free.status, 200, free.text);
  assert.equal((await boothRow('A-04')).status, 'maintenance');
  assert.equal((await setStatus('A-04', 'sold')).body.code, 'NEED_TENANT');
});

test('Operasional: booking tanpa invoice boleh, status yang mencatat pembayaran invoice tidak; Sales ditolak', async () => {
  assert.equal((await setStatus('A-01', 'sold', 'operations')).status, 200);
  assert.equal((await setStatus('A-01', 'reserved', 'operations')).status, 200);
  const inv = await setStatus('A-02', 'sold', 'operations');
  assert.equal(inv.status, 403);
  assert.equal(inv.body.code, 'STATUS_FOLLOWS_INVOICE');
  assert.equal((await setStatus('A-01', 'sold', 'sales')).status, 403);
});
