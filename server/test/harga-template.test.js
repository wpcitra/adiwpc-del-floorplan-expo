// Harga booth mengikuti Katalog Template (AGENTS.md §32): shared/templatePrice.js + /api/template-prices + simpan denah
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import {
  sizeKeyOf, parseSizeLabel, buildTemplateIndex, resolveTemplatePrice, initialPriceMode, resolveGroupTemplatePrices,
  discountAmountOf, canSyncTemplatePrices
} from '../../shared/templatePrice.js';

let s;
const FP = 'FP-TEST-HARGA';
const booth = (code, i, widthM, heightM, price, extra = {}) => boothObject(code, { left: i * 200, top: extra.top || 0, widthM, heightM, price, extra: extra.boothData });
const rowsOf = async (as = 'superadmin') => (await s.api('GET', `/template-prices/${FP}/preview`, undefined, { as })).body;
const rowOf = async (code) => (await rowsOf()).rows.find(r => r.code === code);
const boothRow = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const categories = async () => (await s.api('GET', '/categories')).body.categories;

before(async () => {
  s = await startServer();
  // Catalog of this test: 3X2 = 9,7 jt, 6x3 = 12 jt, two 4x4 with different prices (conflict), no 5x5
  for (const c of await categories()) if (!['Premium', 'Custom'].includes(c.key)) await s.api('DELETE', `/categories/${c.id}`, undefined, { as: 'superadmin' });
  assert.equal((await s.api('POST', '/categories', { name: '3X2', key: 'T3X2', widthM: 3, heightM: 2, defaultPrice: 9700000 }, { as: 'superadmin' })).status, 200);
  assert.equal((await s.api('POST', '/categories', { name: '4x4 B', key: 'T4X4B', widthM: 4, heightM: 4, defaultPrice: 11000000 }, { as: 'superadmin' })).status, 200);
  await createPublishedFloorplan(s.api, FP, [
    booth('255A', 0, 3, 2, 5000000),           // differs from the template -> Harga Khusus (nothing changes silently)
    booth('255B', 1, 2, 3, 9700000),           // turned, already at the template price -> template
    booth('C-01', 2, 3, 2, 8000000),           // Harga Khusus
    booth('N-01', 3, 5, 5, 7000000),           // no template
    booth('K-01', 4, 4, 4, 10000000),          // conflict
    booth('L-01', 5, 3, 2, 5000000),           // will get an invoice -> locked
    booth('P-01', 6, 6, 3, 12000000)           // follows the 6x3 template
  ]);
});
after(async () => { await s?.stop(); });

test('pencocokan ukuran: huruf, spasi, satuan, desimal dan ukuran terbalik', () => {
  assert.equal(sizeKeyOf(3, 2), sizeKeyOf('2.0', '3'));
  assert.deepEqual(parseSizeLabel('3X2'), { widthM: 3, heightM: 2 });
  assert.deepEqual(parseSizeLabel(' 3 x 2 m '), { widthM: 3, heightM: 2 });
  assert.deepEqual(parseSizeLabel('3.0m×2,5m'), { widthM: 3, heightM: 2.5 });
  assert.equal(parseSizeLabel('Standard'), null);
  const catalog = [{ name: '3X2', widthM: 3, heightM: 2, defaultPrice: 9700000 }, { name: 'Gratis', width_m: 2, height_m: 2, default_price: 0, is_free: 1 }];
  assert.equal(resolveTemplatePrice({ widthM: 2, heightM: 3 }, catalog).price, 9700000);
  assert.equal(resolveTemplatePrice({ width_m: 3.0, height_m: 2.0 }, catalog).status, 'match');
  assert.equal(resolveTemplatePrice({ widthM: 3.3, heightM: 2 }, catalog).status, 'none', '3,3 m bukan 3 m');
  assert.equal(resolveTemplatePrice({ widthM: 2, heightM: 2 }, catalog).status, 'none', 'tier gratis bukan template harga');
});

test('duplikat ukuran: harga sama bukan konflik, harga berbeda (juga 2x3 vs 3x2) konflik', () => {
  const same = [{ widthM: 4, heightM: 3, defaultPrice: 5 }, { widthM: 3, heightM: 4, defaultPrice: 5 }];
  assert.equal(resolveTemplatePrice({ widthM: 4, heightM: 3 }, same).price, 5);
  const diff = [{ name: 'a', widthM: 2, heightM: 3, defaultPrice: 6 }, { name: 'b', widthM: 3, heightM: 2, defaultPrice: 9 }];
  const r = resolveTemplatePrice({ widthM: 3, heightM: 2 }, diff);
  assert.equal(r.status, 'conflict');
  assert.equal(r.price, null);
  assert.equal(buildTemplateIndex(diff).get(sizeKeyOf(2, 3)).templates.length, 2);
  assert.equal(initialPriceMode({ widthM: 3, heightM: 2, price: 6 }, diff), 'custom');
});

test('booth gabungan: ukuran total dulu, kalau tidak ada jumlah template tiap booth', () => {
  const catalog = [{ widthM: 3, heightM: 3, defaultPrice: 5000000 }, { widthM: 6, heightM: 3, defaultPrice: 9000000 }];
  const members = [{ code: 'A', widthM: 3, heightM: 3 }, { code: 'B', widthM: 3, heightM: 3 }];
  const whole = resolveGroupTemplatePrices(members, { widthM: 6, heightM: 3 }, catalog);
  assert.equal(whole.get('A').price + whole.get('B').price, 9000000);
  const each = resolveGroupTemplatePrices(members, null, catalog);
  assert.equal(each.get('A').price + each.get('B').price, 10000000);
  const three = [...members, { code: 'C', widthM: 3, heightM: 3 }];
  const sum = resolveGroupTemplatePrices(three, { widthM: 9, heightM: 3 }, catalog);
  assert.equal([...sum.values()].reduce((a, r) => a + r.price, 0), 15000000);
});

test('diskon: nominal tetap, persentase mengikuti harga baru', () => {
  assert.equal(discountAmountOf(9700000, 'nominal', 500000), 500000);
  assert.equal(discountAmountOf(9700000, 'percentage', 10), 970000);
  assert.equal(discountAmountOf(100, 'nominal', 500), 100);
});

test('data lama: sama dengan template = template, berbeda = Harga Khusus; harga tidak berubah diam-diam', async () => {
  assert.equal((await boothRow('255A')).price, 5000000);
  assert.equal((await boothRow('255A')).price_mode, 'custom');
  assert.equal((await boothRow('255B')).price_mode, 'template');
  assert.equal((await boothRow('P-01')).price_mode, 'template');
  assert.equal((await boothRow('N-01')).price_mode, 'custom');
  assert.equal((await boothRow('K-01')).price_mode, 'custom');
});

test('hak akses: Super Admin dan Keuangan; Operasional, Sales dan pengunjung ditolak', async () => {
  assert.equal(canSyncTemplatePrices({ role: 'operations' }), false);
  assert.equal(canSyncTemplatePrices({ role: 'finance' }), true);
  assert.equal((await s.api('GET', `/template-prices/${FP}/preview`, undefined, { as: 'finance' })).status, 200);
  assert.equal((await s.api('GET', `/template-prices/${FP}/preview`, undefined, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', `/template-prices/${FP}/apply`, { codes: ['255A'] }, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', `/template-prices/${FP}/apply`, { codes: ['255A'] }, { as: 'sales' })).status, 403);
  assert.equal((await s.api('POST', `/template-prices/${FP}/undo`, {}, { as: 'operations' })).status, 403);
  assert.equal((await s.api('POST', `/template-prices/${FP}/apply`, { codes: ['255A'] })).status, 401);
  assert.equal((await boothRow('255A')).price, 5000000);
});

test('pratinjau mengelompokkan booth dan tidak menyimpan apa pun', async () => {
  // L-01 gets a tenant and an invoice: locked
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['L-01'], fullName: 'Budi', brandName: 'Terkunci', brandCategory: 'F&B', phone: '0812', bookingType: 'booking', applyTax: false }, { as: 'superadmin' });
  assert.equal(reg.status, 200, reg.text);
  const p = await rowsOf();
  const group = (code) => p.rows.find(r => r.code === code).group;
  assert.equal(group('255A'), 'custom');
  assert.equal(group('C-01'), 'custom');
  assert.equal(group('255B'), 'same');
  assert.equal(group('P-01'), 'same');
  assert.equal(group('N-01'), 'none');
  assert.equal(group('K-01'), 'conflict');
  assert.equal(group('L-01'), 'locked');
  const a = p.rows.find(r => r.code === '255A');
  assert.equal(a.templatePrice, 9700000);
  assert.equal(a.diff, 4700000);
  assert.equal(a.checked, false, 'harga khusus tidak dicentang secara default');
  assert.equal((await boothRow('255A')).price, 5000000);
});

test('Booth 255A (3x2m) menjadi Rp 9.700.000; yang tidak dicentang, terkunci, konflik dan tanpa template tidak berubah', async () => {
  const r = await s.api('POST', `/template-prices/${FP}/apply`, { codes: ['255A', 'L-01', 'K-01', 'N-01'] }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.changes.map(c => c.code), ['255A']);
  assert.equal(r.body.skipped.length, 3);
  const a = await boothRow('255A');
  assert.equal(a.price, 9700000);
  assert.equal(a.price_mode, 'template');
  assert.equal((await boothRow('C-01')).price, 8000000, 'harga khusus yang tidak dicentang');
  assert.equal((await boothRow('L-01')).price, 5000000, 'terkunci invoice');
  assert.equal((await boothRow('K-01')).price, 10000000);
  assert.equal((await boothRow('N-01')).price, 7000000);
  // the saved canvas carries the same price
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const canvas = typeof fp.canvas_fabric_json === 'string' ? JSON.parse(fp.canvas_fabric_json) : (fp.fabricJson || fp.canvas_fabric_json);
  const obj = canvas.objects.find(o => o.boothData?.code === '255A');
  assert.equal(obj.boothData.price, 9700000);
  assert.equal(obj.boothData.priceMode, 'template');
  // invoice of the locked booth is untouched
  const inv = (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.find(i => i.booth_code === 'L-01');
  assert.equal(inv.total_amount, 5000000);

  const logs = (await s.api('GET', '/audit-logs?category=Floorplan', undefined, { as: 'superadmin' })).body.logs;
  const entry = logs.find(l => l.action === 'Samakan harga booth dengan template');
  assert.ok(entry, 'tercatat di Audit');
  assert.equal(entry.details.count, 1);
  assert.deepEqual(entry.details.changes.map(c => [c.code, c.oldPrice, c.newPrice]), [['255A', 5000000, 9700000]]);
});

test('harga template 3X2 diubah: semua booth 3x2 berstatus template ikut, Harga Khusus dan yang terkunci tidak', async () => {
  const tpl = (await categories()).find(c => c.key === 'T3X2');
  const r = await s.api('PUT', `/categories/${tpl.id}`, { defaultPrice: 10000000 }, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.priceChanges.find(f => f.floorplanId === FP).changes.map(c => c.code).sort(), ['255A', '255B']);
  assert.equal((await boothRow('255A')).price, 10000000);
  assert.equal((await boothRow('255B')).price, 10000000);
  assert.equal((await boothRow('C-01')).price, 8000000);
  assert.equal((await boothRow('L-01')).price, 5000000);
  await s.api('PUT', `/categories/${tpl.id}`, { defaultPrice: 9700000 }, { as: 'superadmin' });
  assert.equal((await boothRow('255A')).price, 9700000);
});

test('undo: perubahan terakhir dikembalikan dari catatannya, sekali saja', async () => {
  const apply = await s.api('POST', `/template-prices/${FP}/apply`, { codes: ['C-01'] }, { as: 'finance' });
  assert.equal(apply.status, 200, apply.text);
  assert.equal((await boothRow('C-01')).price, 9700000);
  assert.equal((await s.api('POST', `/template-prices/${FP}/undo`, {}, { as: 'sales' })).status, 403);
  const undo = await s.api('POST', `/template-prices/${FP}/undo`, {}, { as: 'finance' });
  assert.equal(undo.status, 200, undo.text);
  const c = await boothRow('C-01');
  assert.equal(c.price, 8000000);
  assert.equal(c.price_mode, 'custom');
  assert.equal((await boothRow('255A')).price, 9700000, 'batch sebelumnya tidak ikut dibatalkan');
  assert.equal((await s.api('POST', `/template-prices/${FP}/undo`, {}, { as: 'finance' })).status, 409);
  const logs = (await s.api('GET', '/audit-logs?category=Floorplan', undefined, { as: 'superadmin' })).body.logs;
  assert.ok(logs.some(l => l.action === 'Batalkan samakan harga booth'));
});

test('simpan dari Studio: booth template selalu memakai harga template, harga manual = Harga Khusus, ukuran baru = harga baru', async () => {
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const canvas = typeof fp.canvas_fabric_json === 'string' ? JSON.parse(fp.canvas_fabric_json) : (fp.fabricJson || fp.canvas_fabric_json);
  const of = (code) => canvas.objects.find(o => o.boothData?.code === code).boothData;
  of('255A').price = 1;                                  // stale canvas price of a template booth
  Object.assign(of('255B'), { price: 7777000, priceMode: 'custom' }); // typed by hand
  Object.assign(of('P-01'), { widthM: 3, heightM: 2 });  // resized 6x3 -> 3x2, still 'template'
  Object.assign(of('C-01'), { discountType: 'percentage', discountValue: 10, priceMode: 'template' }); // Reset ke Template
  const save = await s.api('POST', '/floorplan/save', { id: FP, eventId: `EVT-${FP}`, title: `Tes ${FP}`, status: 'published', fabricJson: canvas }, { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  assert.equal((await boothRow('255A')).price, 9700000);
  const b = await boothRow('255B');
  assert.equal(b.price, 7777000);
  assert.equal(b.price_mode, 'custom');
  assert.equal((await boothRow('P-01')).price, 9700000);
  const c = await boothRow('C-01');
  assert.equal(c.price, 9700000);
  assert.equal(c.discount_amount, 970000, 'diskon persentase dihitung ulang dari harga baru');
  assert.equal((await boothRow('L-01')).price, 5000000);
  assert.equal((await rowOf('255B')).group, 'custom');
});
