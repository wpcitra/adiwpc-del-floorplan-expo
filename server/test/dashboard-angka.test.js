// Dashboard angka (AGENTS.md §40): "Uang Masuk" dipecah lunas vs DP, booking yang belum punya invoice terlihat,
// nilai booth tersedia = booth Available saja, nomor booth tanpa spasi berlebih.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { cleanBoothCode } from '../../shared/boothCodes.js';

let s;
const FP = 'FP-DASH';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, [
    boothObject('A-01', { left: 0, top: 0, price: 10000000 }),
    boothObject('A-02', { left: 400, top: 0, price: 10000000 }),
    boothObject('A-03', { left: 800, top: 0, price: 10000000 }),
    boothObject('A-04', { left: 1200, top: 0, price: 8000000 })
  ]);
});
after(async () => { await s.stop(); });

const book = (code, extra = {}) => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], boothCode: code, fullName: `PIC ${code}`, brandName: `Brand ${code}`, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', source: 'admin', applyTax: false, ...extra
}, { as: 'superadmin' });
const stats = async () => (await s.api('GET', `/stats?projectId=${FP}`, undefined, { as: 'superadmin' })).body.stats;
const invoiceOf = async (code) => (await s.api('GET', '/invoices', undefined, { as: 'superadmin' })).body.invoices.find(i => i.booth_code === code);

test('cleanBoothCode: spasi di tepi dan spasi ganda hilang, isi nomor tetap', () => {
  assert.equal(cleanBoothCode('15                    '), '15');
  assert.equal(cleanBoothCode(' 9 '), '9');
  assert.equal(cleanBoothCode('20  -  29'), '20 - 29');
  assert.equal(cleanBoothCode(' A-01 + A-02 '), 'A-01+A-02');
  assert.equal(cleanBoothCode(''), '');
});

test('uang masuk dipecah: lunas vs DP; booking tanpa invoice dan nilai booth tersedia terlihat', async () => {
  assert.equal((await book('A-01')).status, 200);                      // invoice -> lunas
  assert.equal((await book('A-02')).status, 200);                      // invoice -> DP 4 jt
  assert.equal((await book('A-03', { deferInvoice: true })).status, 200); // Booking Manual, belum ada invoice
  const a1 = await invoiceOf('A-01');
  const a2 = await invoiceOf('A-02');
  assert.equal((await s.api('POST', `/invoices/${a1.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  assert.equal((await s.api('POST', `/invoices/${a2.id}/status`, { status: 'PARTIAL', paidAmount: 4000000 }, { as: 'finance' })).status, 200);

  const st = await stats();
  assert.equal(st.totalRevenue, 14000000, 'uang masuk = lunas + DP');
  assert.equal(st.paidInFullAmount, 10000000);
  assert.equal(st.paidInFullInvoices, 1);
  assert.equal(st.downPaymentAmount, 4000000);
  assert.equal(st.downPaymentInvoices, 1);
  assert.equal(st.remainingBill, 6000000, 'sisa tagihan hanya dari invoice yang terbit');
  assert.equal(st.unbilledCount, 1);
  assert.equal(st.unbilledValue, 10000000);
  assert.deepEqual(st.unbilledBooths.map(b => [b.code, b.status, b.ownerName]), [['A-03', 'reserved', 'Brand A-03']]);
  assert.equal(st.availableValue, 8000000, 'nilai booth tersedia = booth Available saja');
});

test('simpan Studio merapikan nomor booth berspasi; denah dan booth memakai nomor bersih', async () => {
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const canvas = fp.canvas_fabric_json;
  canvas.objects.push(boothObject('B-07      ', { left: 1600, top: 0 }));
  const saved = await s.api('POST', '/floorplan/save', { id: FP, eventId: fp.event_id, title: fp.title, status: fp.status, fabricJson: canvas }, { as: 'superadmin' });
  assert.equal(saved.status, 200, saved.text);
  const after = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  assert.ok(after.booths.some(b => b.code === 'B-07'));
  assert.ok(!after.booths.some(b => b.code !== b.code.trim()));
  assert.ok(after.canvas_fabric_json.objects.some(o => o.boothData?.code === 'B-07'));
});

test('migrasi: nomor booth berspasi di data lama dirapikan di booth, booking, invoice dan denah (sekali, dengan salinan)', async () => {
  const { default: Database } = await import('better-sqlite3');
  const path = await import('path');
  const fs = await import('fs');
  assert.equal((await book('A-04')).status, 200);
  // Old data: the same booth stored as "A-04      " everywhere (the save route cleans new data, so write it directly)
  const old = new Database(path.join(s.dataDir, 'floorplan.db'));
  old.prepare("UPDATE booths SET code = 'A-04      ' WHERE floorplan_id = ? AND code = 'A-04'").run(FP);
  old.prepare("UPDATE orders SET booth_code = 'A-04      ' WHERE floorplan_id = ? AND booth_code = 'A-04'").run(FP);
  old.prepare("UPDATE invoices SET booth_code = ' A-04 ' WHERE floorplan_id = ? AND booth_code = 'A-04'").run(FP);
  const fp = old.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(FP);
  old.prepare('UPDATE floorplans SET canvas_fabric_json = ? WHERE id = ?').run(fp.canvas_fabric_json.replace('"code":"A-04"', '"code":"A-04      "'), FP);
  await old.backup(path.join(s.dataDir, 'lama.db'));
  old.close();

  const s2 = await startServer({}, { prepare: (dir) => fs.copyFileSync(path.join(s.dataDir, 'lama.db'), path.join(dir, 'floorplan.db')) });
  try {
    const after = (await s2.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
    const booth = after.booths.find(b => b.code.trim() === 'A-04');
    assert.equal(booth.code, 'A-04');
    assert.equal(booth.status, 'reserved', 'booking tetap terhubung ke booth');
    assert.ok(after.canvas_fabric_json.objects.some(o => o.boothData?.code === 'A-04'));
    assert.ok((await s2.api('GET', '/invoices', undefined, { as: 'superadmin' })).body.invoices.some(i => i.booth_code === 'A-04'));
    assert.ok(fs.readdirSync(path.join(s2.dataDir, 'backups')).some(f => f.startsWith('pre-migration_nomor-booth_')), 'salinan dibuat sebelum merapikan');
  } finally {
    await s2.stop();
  }
});
