// Nama event di invoice = nama project (judul denah, AGENTS.md §13): every invoice row (list, detail, PDF, the
// registrant's copy) carries the floorplan title and venue, never the shared event title or a built-in default.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject } from './helpers.js';

let s;
const FP = 'FP-NAMA';
before(async () => {
  s = await startServer();
  // The first floorplan ever saved creates the shared event with its title ("Kanvas Baru"), then it is renamed
  const canvas = { objects: [boothObject('A-01', { left: 0, top: 0 })] };
  const first = await s.api('POST', '/floorplan/save', { id: FP, eventId: 'EVT-2026-001', title: 'Kanvas Baru', status: 'draft', fabricJson: canvas,
    metadata: { event: { venue: 'JIExpo Kemayoran Hall B' } } }, { as: 'superadmin' });
  assert.equal(first.status, 200, first.text);
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const renamed = await s.api('POST', '/floorplan/save', { id: FP, eventId: 'EVT-2026-001', title: 'Halal Fair Jakarta 2026 x Rihla', status: 'draft',
    fabricJson: fp.canvas_fabric_json, metadata: { event: { venue: 'JIExpo Kemayoran Hall B' } } }, { as: 'superadmin' });
  assert.equal(renamed.status, 200, renamed.text);
  const booked = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], boothCode: 'A-01', fullName: 'Muhammad', brandName: 'SAMASE',
    brandCategory: 'F&B', phone: '081234567890', bookingType: 'booking', source: 'admin' }, { as: 'superadmin' });
  assert.equal(booked.status, 200, booked.text);
});
after(async () => { await s.stop(); });

test('invoice memakai nama dan venue project, bukan judul event lama atau teks bawaan', async () => {
  const list = (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.filter(i => i.floorplan_id === FP);
  assert.ok(list.length, 'ada invoice');
  for (const inv of list) {
    assert.equal(inv.event_title, 'Halal Fair Jakarta 2026 x Rihla');
    assert.equal(inv.event_venue, 'JIExpo Kemayoran Hall B');
  }
  const one = (await s.api('GET', `/invoices/${list[0].id}`, undefined, { as: 'finance' })).body.invoice;
  assert.equal(one.event_title, 'Halal Fair Jakarta 2026 x Rihla', 'detail = daftar (§6)');
});
