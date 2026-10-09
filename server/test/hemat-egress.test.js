// Hemat egress (AGENTS.md §39): responses are gzipped, and the Studio polls a tiny booth fingerprint instead of
// downloading the whole floorplan every few seconds.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan, createDeveloper } from './helpers.js';

let s;
const FP = 'FP-HEMAT';
before(async () => {
  s = await startServer();
  await createDeveloper(s.api);
  await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 400, top: 0 })]);
});
after(async () => { await s.stop(); });

const version = async (id = FP, as = 'superadmin') => s.api('GET', `/floorplan/${id}/booth-version`, undefined, { as });

test('respons API dipampatkan (gzip) bila browser memintanya', async () => {
  const token = await s.login('superadmin');
  const res = await fetch(`${s.base}/floorplan/${FP}`, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.equal((await res.json()).floorplan.id, FP, 'isinya tetap sama');
});

test('sidik jari booth: kecil, stabil tanpa perubahan, berubah setelah booking & status', async () => {
  const first = await version();
  assert.equal(first.status, 200, first.text);
  assert.ok(first.text.length < 200, 'jauh lebih kecil dari denah penuh');
  assert.equal((await version()).body.version, first.body.version, 'tidak berubah tanpa perubahan');

  const booked = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['A-01'], boothCode: 'A-01', fullName: 'PIC Roti', brandName: 'Roti Maros', brandCategory: 'F&B',
    phone: '081234567890', bookingType: 'booking', source: 'admin', deferInvoice: true
  }, { as: 'superadmin' });
  assert.equal(booked.status, 200, booked.text);
  const afterBooking = (await version()).body.version;
  assert.notEqual(afterBooking, first.body.version, 'booking baru terdeteksi');

  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const moved = fp.canvas_fabric_json;
  moved.objects.forEach(o => { if (o.boothData?.code === 'A-02') o.left += 50; });
  assert.equal((await s.api('POST', '/floorplan/save', { id: FP, eventId: fp.event_id, title: fp.title, status: fp.status, fabricJson: moved }, { as: 'superadmin' })).status, 200);
  assert.equal((await version()).body.version, afterBooking, 'menggeser booth sendiri tidak memicu unduh ulang');
});

test('berlaku untuk denah draft; hanya staf yang membuka Studio', async () => {
  const draft = await s.api('POST', '/floorplan/save', { id: 'FP-DRAFT', eventId: 'EVT-2026-001', title: 'Draft', status: 'draft', fabricJson: { objects: [boothObject('B-01', { left: 0, top: 0 })] } }, { as: 'superadmin' });
  assert.equal(draft.status, 200, draft.text);
  const v = await version('FP-DRAFT');
  assert.equal(v.status, 200);
  assert.equal(v.body.id, 'FP-DRAFT');

  assert.equal((await version(FP, 'sales')).status, 200);
  assert.equal((await version(FP, 'operations')).status, 200);
  assert.equal((await version(FP, 'developer')).status, 403);
  assert.equal((await s.api('GET', `/floorplan/${FP}/booth-version`)).status, 401);
  assert.equal((await version('FP-TIDAK-ADA')).status, 404);
});
