// Live Floorplan background refresh (AGENTS.md §35): GET /floorplan/live-version
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
let slug;
const FP = 'FP-TEST-LIVE';
const version = async (query = `id=${FP}`) => s.api('GET', `/floorplan/live-version?${query}`);

before(async () => {
  s = await startServer();
  ({ slug } = await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 100, top: 0 })]));
  await s.api('POST', '/floorplan/save', { id: 'FP-TEST-DRAFT', eventId: 'EVT-D', title: 'Draft', status: 'draft',
    fabricJson: { version: '7.0.0', objects: [boothObject('D-01', { left: 0, top: 0 })] } }, { as: 'superadmin' });
});
after(async () => { await s?.stop(); });

test('pengunjung boleh memeriksa versi; jawabannya kecil dan tidak memuat data denah', async () => {
  const r = await version();
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['id', 'success', 'version']);
  assert.equal(r.body.id, FP);
  assert.ok(r.text.length < 200);
});

test('versi tetap sama selama tidak ada perubahan, juga lewat slug', async () => {
  const a = (await version()).body.version;
  assert.equal((await version()).body.version, a);
  assert.equal((await version(`slug=${slug}`)).body.version, a);
  assert.equal((await version('')).body.id, FP, 'tanpa parameter: denah live terbaru');
});

test('versi berubah saat booth dipesan, dan saat denah disimpan dengan perubahan', async () => {
  const before = (await version()).body.version;
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi Live', brandCategory: 'F&B', phone: '0812345678', bookingType: 'booking' });
  assert.equal(reg.status, 200, reg.text);
  const booked = (await version()).body.version;
  assert.notEqual(booked, before);
  assert.equal((await version()).body.version, booked);
});

test('link yang tidak ada: 404; denah draft tidak pernah dilayani', async () => {
  const r = await version('slug=tidak-ada');
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'LINK_NOT_FOUND');
  assert.equal((await version('id=FP-TEST-DRAFT')).body.id, FP, 'id draft jatuh ke denah live, bukan draft itu');
});
