// Booth status follows the WHOLE contract (AGENTS.md §14): a paid DP keeps the booth Reserved; it is Terjual (sold,
// also on the public floorplan) once DP + Pelunasan are paid. A DP chosen at registration is computed by the server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-STATUS';
const invoicesOf = async (code) => (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'finance' })).body.invoices
  .filter(i => i.booth_code === code && i.payment_status !== 'CANCELED');
const boothState = async (code) => {
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const pub = (await s.api('GET', `/floorplan/${FP}?view=public`)).body.floorplan;
  const canvas = typeof pub.canvas_fabric_json === 'string' ? JSON.parse(pub.canvas_fabric_json) : pub.canvas_fabric_json;
  return { db: fp.booths.find(b => b.code === code)?.status, denah: canvas.objects.find(o => o.boothData?.code === code)?.boothData?.status };
};

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [boothObject('S-01', { left: 0, top: 0, price: 5000000 })]);
});
after(async () => { await s?.stop(); });

test('DP saat pendaftaran dihitung server dari kontrak (estimasi form diabaikan)', async () => {
  const r = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['S-01'], fullName: 'Koni', brandName: 'koniciwa', email: 'k@c.test', phone: '081234567890',
    bookingType: 'payment_gateway', paymentType: 'dp', downPaymentPercent: 50, paidAmount: 1500000, applyTax: false
  }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  const [dp] = await invoicesOf('S-01');
  assert.equal(dp.invoice_kind, 'dp');
  assert.equal(dp.total_amount, 2500000, 'DP 50% dari kontrak Rp 5.000.000');
  assert.equal(dp.dp_percent, 50);
  assert.equal(dp.contract.status, 'PARTIAL');
  assert.equal(dp.contract.unbilled, 2500000);
});

test('DP lunas: booth tetap Reserved di database & denah; memaksa "Terjual" tidak menjual booth', async () => {
  assert.deepEqual(await boothState('S-01'), { db: 'reserved', denah: 'reserved' });
  const [dp] = await invoicesOf('S-01');
  const r = await s.api('POST', `/invoices/${dp.id}/status`, { status: 'PAID', boothStatus: 'sold' }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.boothStatus, 'reserved', 'server melaporkan status booth yang sebenarnya');
  assert.deepEqual(await boothState('S-01'), { db: 'reserved', denah: 'reserved' });
});

test('Pelunasan lunas: kontrak Lunas, booth Terjual di database & denah', async () => {
  const pl = await s.api('POST', '/invoices', { invoiceKind: 'settlement', floorplanId: FP, boothCode: 'S-01' }, { as: 'finance' });
  assert.equal(pl.status, 200, pl.text);
  assert.equal(pl.body.invoice.total_amount, 2500000);
  const r = await s.api('POST', `/invoices/${pl.body.invoice.id}/status`, { status: 'PAID' }, { as: 'finance' });
  assert.equal(r.body.boothStatus, 'sold');
  assert.equal(r.body.contractStatus, 'PAID');
  assert.deepEqual(await boothState('S-01'), { db: 'sold', denah: 'sold' });
});
