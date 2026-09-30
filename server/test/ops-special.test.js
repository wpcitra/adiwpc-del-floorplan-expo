// Denah Operasional: special design booths (AGENTS.md §17). Operations mark a booth and give it a colour; the
// sales booth, tenant and invoices never change.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-TEST-OPS';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [boothObject('S-01', { left: 0, top: 0 }), boothObject('S-02', { left: 200, top: 0 })]);
});
after(async () => { await s?.stop(); });

const opsLayer = async (as = 'operations') => (await s.api('GET', `/ops/${FP}`, undefined, { as })).body;
const boothRow = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);

test('Operasional menandai booth special design dengan warna; tersimpan & tercatat di Audit', async () => {
  const before = await boothRow('S-01');
  const layer = await opsLayer();
  const r = await s.api('PUT', `/ops/${FP}`, {
    baseVersion: layer.layer.version, elements: [],
    boothOps: [{ boothKey: before.id, boothCode: 'S-01', specialDesign: true, specialColor: '#DB2777' }]
  }, { as: 'operations' });
  assert.equal(r.status, 200, r.text);
  const after = await opsLayer();
  const d = after.boothOps.find(b => b.boothCode === 'S-01');
  assert.equal(d.specialDesign, true);
  assert.equal(d.specialColor, '#db2777');
  const audit = await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' });
  assert.match(audit.text, /special design \(warna #db2777\)/);
  // the sales booth is untouched
  const row = await boothRow('S-01');
  assert.deepEqual({ status: row.status, price: row.price, owner: row.owner_name }, { status: before.status, price: before.price, owner: before.owner_name });
});

test('warna tidak valid memakai warna default; menonaktifkan special design menghapus warnanya', async () => {
  const row = await boothRow('S-02');
  let layer = await opsLayer();
  await s.api('PUT', `/ops/${FP}`, { baseVersion: layer.layer.version, elements: [], boothOps: [{ boothKey: row.id, boothCode: 'S-02', specialDesign: true, specialColor: 'javascript:alert(1)' }] }, { as: 'operations' });
  layer = await opsLayer();
  assert.equal(layer.boothOps.find(b => b.boothCode === 'S-02').specialColor, '#7c3aed');
  await s.api('PUT', `/ops/${FP}`, { baseVersion: layer.layer.version, elements: [], boothOps: [{ boothKey: row.id, boothCode: 'S-02', specialDesign: false, specialColor: '#7c3aed' }] }, { as: 'operations' });
  const d = (await opsLayer()).boothOps.find(b => b.boothCode === 'S-02');
  assert.equal(d.specialDesign, false);
  assert.equal(d.specialColor, '');
});

test('Sales tidak bisa mengubah data operasional booth', async () => {
  const layer = await opsLayer();
  const r = await s.api('PUT', `/ops/${FP}`, { baseVersion: layer.layer.version, elements: [], boothOps: [] }, { as: 'sales' });
  assert.equal(r.status, 403);
});
