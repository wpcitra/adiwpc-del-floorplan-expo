// Nomor & tanggal invoice (AGENTS.md §44): one number format for every invoice (Setting), a running number, a number
// changed by hand per invoice, Tanggal Terbit = the day it is downloaded, Jatuh Tempo = that day + N days.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { formatInvoiceNumber, invoiceFormatProblem, cleanInvoiceNumber, wibParts } from '../../shared/invoiceNumbering.js';
import { invoiceDates } from '../../shared/invoiceDates.js';

let s;
const FP = 'FP-NOMOR';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, ['A-01', 'A-02', 'A-03'].map((c, i) => boothObject(c, { left: i * 400, top: 0 })));
});
after(async () => { await s.stop(); });

const book = (code, extra = {}) => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], boothCode: code, fullName: `PIC ${code}`, brandName: `Brand ${code}`, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', source: 'admin', ...extra
}, { as: 'superadmin' });
const invoicesOf = async (code) => (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.filter(i => i.booth_code === code);

test('format nomor: kode isian, nomor urut, dan penolakan format tanpa {NOMOR}', () => {
  const now = new Date('2026-10-09T20:00:00Z'); // 10 Oct 03:00 WIB
  assert.equal(formatInvoiceNumber('WPC/{JENIS}/{TAHUN}/{BULAN}/{NOMOR}', { kind: 'dp', seq: 7, now }), 'WPC/DP/2026/10/0007');
  assert.equal(formatInvoiceNumber('INV-{NOMOR}', { seq: 12345 }), 'INV-12345');
  assert.match(invoiceFormatProblem('INV/{TAHUN}'), /\{NOMOR\}/);
  assert.match(invoiceFormatProblem('INV {NOMOR}'), /tanpa spasi/);
  assert.equal(invoiceFormatProblem('INV/{JENIS}/{NOMOR}'), null);
  assert.equal(cleanInvoiceNumber('  INV/KHUSUS/001 '), 'INV/KHUSUS/001');
  assert.equal(cleanInvoiceNumber('INV 001'), null);
  assert.equal(cleanInvoiceNumber('<script>'), null);
});

test('tanggal: terbit = hari diunduh (WIB), jatuh tempo = +N hari; tanggal tetap dipakai bila dikunci', () => {
  const now = new Date('2026-10-09T20:00:00Z'); // 10 Oct WIB
  assert.deepEqual(invoiceDates({ issue_date: '2026-09-01', due_date: '2026-09-15' }, { dueDays: 14, now }), { issueDate: '2026-10-10', dueDate: '2026-10-24', issueFixed: false, dueFixed: false });
  assert.equal(invoiceDates({}, { dueDays: 30, now }).dueDate, '2026-11-09');
  assert.deepEqual(invoiceDates({ issue_date: '2026-09-01', issue_date_fixed: 1, due_date: '2026-09-05', due_date_fixed: 0 }, { dueDays: 14, now }), { issueDate: '2026-09-01', dueDate: '2026-09-15', issueFixed: true, dueFixed: false });
  assert.equal(invoiceDates({ issue_date_fixed: 0, due_date: '2026-12-31', due_date_fixed: 1 }, { now }).dueDate, '2026-12-31');
});

test('Setting: format, nomor berikutnya dan jatuh tempo disimpan; format tanpa {NOMOR} ditolak', async () => {
  const bad = await s.api('POST', '/invoices/config', { config: { invoiceNumberFormat: 'WPC/{TAHUN}' } }, { as: 'finance' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_NUMBER_FORMAT');
  const ok = await s.api('POST', '/invoices/config', { config: { invoiceNumberFormat: 'WPC/{JENIS}/{TAHUN}/{BULAN}/{NOMOR}', invoiceDueDays: 21 }, invoiceNumberNext: 7 }, { as: 'finance' });
  assert.equal(ok.status, 200, ok.text);
  const cfg = (await s.api('GET', '/invoices/config')).body.config;
  assert.equal(cfg.invoiceNumberFormat, 'WPC/{JENIS}/{TAHUN}/{BULAN}/{NOMOR}');
  assert.equal(cfg.invoiceNumberNext, 7);
  assert.equal(cfg.invoiceDueDays, 21, 'publik juga: PDF pendaftar memakai jatuh tempo yang sama');
  // A page saving the whole configuration with an older copy of the counter never moves it back
  await s.api('POST', '/invoices/config', { config: { ...cfg, invoiceNumberNext: 2 } }, { as: 'finance' });
  assert.equal((await s.api('GET', '/invoices/config')).body.config.invoiceNumberNext, 7);
});

test('semua invoice baru memakai format dan nomor urut; tanggalnya otomatis', async () => {
  const { year, month } = wibParts();
  assert.equal((await book('A-01')).status, 200);
  const full = (await invoicesOf('A-01'))[0];
  assert.equal(full.invoice_number, `WPC/EXP/${year}/${month}/0007`);
  assert.equal(Number(full.issue_date_fixed || 0), 0);
  assert.equal(Number(full.due_date_fixed || 0), 0);

  assert.equal((await book('A-02', { deferInvoice: true })).status, 200);
  const made = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'A-02' }, { as: 'superadmin' });
  assert.equal(made.status, 200, made.text);
  assert.equal(made.body.invoice.invoice_number, `WPC/EXP/${year}/${month}/0008`);

  assert.equal((await book('A-03', { deferInvoice: true })).status, 200);
  const dp = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'A-03', dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  assert.equal(dp.status, 200, dp.text);
  assert.equal((await invoicesOf('A-03')).find(i => i.invoice_kind === 'dp').invoice_number, `WPC/DP/${year}/${month}/0009`);
  assert.equal((await s.api('GET', '/invoices/config')).body.config.invoiceNumberNext, 10);
});

test('nomor invoice diubah manual: unik, booking ikut, tercatat di Audit; tanggal bisa dikunci per invoice', async () => {
  const inv = (await invoicesOf('A-01'))[0];
  const other = (await invoicesOf('A-02'))[0];
  assert.equal((await s.api('PUT', `/invoices/${inv.id}`, { invoiceNumber: other.invoice_number }, { as: 'finance' })).body.code, 'INVOICE_NUMBER_TAKEN');
  assert.equal((await s.api('PUT', `/invoices/${inv.id}`, { invoiceNumber: 'INV 001' }, { as: 'finance' })).body.code, 'INVALID_INVOICE_NUMBER');

  const r = await s.api('PUT', `/invoices/${inv.id}`, { invoiceNumber: 'INV/KHUSUS/001', issueDate: '2026-10-01', issueDateFixed: true, dueDate: '2026-10-31', dueDateFixed: true }, { as: 'finance' });
  assert.equal(r.status, 200, r.text);
  const after = (await s.api('GET', `/invoices/${inv.id}`, undefined, { as: 'finance' })).body.invoice;
  assert.equal(after.invoice_number, 'INV/KHUSUS/001');
  assert.deepEqual([after.issue_date, Number(after.issue_date_fixed), after.due_date, Number(after.due_date_fixed)], ['2026-10-01', 1, '2026-10-31', 1]);
  const exh = (await s.api('GET', `/exhibitors?projectId=${FP}`, undefined, { as: 'finance' })).body;
  assert.ok(JSON.stringify(exh).includes('INV/KHUSUS/001'), 'booking / Data Exhibitor memakai nomor baru');

  assert.equal((await s.api('PUT', `/invoices/${inv.id}`, { issueDateFixed: false, dueDateFixed: false }, { as: 'finance' })).status, 200);
  const auto = (await s.api('GET', `/invoices/${inv.id}`, undefined, { as: 'finance' })).body.invoice;
  assert.deepEqual([Number(auto.issue_date_fixed), Number(auto.due_date_fixed)], [0, 0]);

  const logs = (await s.api('GET', '/audit-logs?limit=50', undefined, { as: 'superadmin' })).text;
  assert.ok(logs.includes('Ubah nomor invoice') && logs.includes('INV/KHUSUS/001'));
});
