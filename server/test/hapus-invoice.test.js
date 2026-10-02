// Hapus Invoice, Tempat Sampah & Pulihkan (AGENTS.md §31): role, alasan, konfirmasi nomor, soft delete, audit
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { canDeleteInvoice, canDeletePaidInvoice, canRestoreInvoice, cleanDeleteReason, sameInvoiceNumber } from '../../shared/invoicePermissions.js';

let s;
const FP = 'FP-TEST-HAPUS';
const REASON = 'Invoice salah terbit, diganti yang baru';
const register = (code, brand) => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], fullName: 'Budi Tes', brandName: brand, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', applyTax: false
}, { as: 'superadmin' });
const contractOf = async (code) => (await s.api('GET', `/invoices/contract?floorplanId=${FP}&boothCode=${code}`, undefined, { as: 'finance' })).body.contract;
const liveInvoices = async () => (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices;
const trash = async () => (await s.api('GET', '/invoices/trash', undefined, { as: 'superadmin' })).body.invoices;
const boothRow = async (code) => (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === code);
const exhibitorRow = async (code) => (await s.api('GET', '/exhibitors', undefined, { as: 'finance' })).body.exhibitors.find(e => e.floorplanId === FP && e.booth === code);
const del = (id, body, as) => s.api('DELETE', `/invoices/${id}`, body, as ? { as } : {});

before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, ['H-01', 'H-02', 'H-03', 'H-04'].map((code, i) => boothObject(code, { left: i * 100, top: 0 })));
});
after(async () => { await s?.stop(); });

test('satu aturan role: Keuangan dan Super Admin menghapus, hanya Super Admin untuk invoice berbayar dan pemulihan', () => {
  assert.equal(canDeleteInvoice({ role: 'finance' }), true);
  assert.equal(canDeleteInvoice({ role: 'superadmin' }), true);
  for (const role of ['sales', 'operations', 'developer', undefined]) assert.equal(canDeleteInvoice({ role }), false);
  assert.equal(canDeleteInvoice(null), false);
  assert.equal(canDeletePaidInvoice({ role: 'finance' }), false);
  assert.equal(canDeletePaidInvoice({ role: 'superadmin' }), true);
  assert.equal(canRestoreInvoice({ role: 'finance' }), false);
  assert.equal(cleanDeleteReason('  salah  '), null);
  assert.equal(cleanDeleteReason(' salah   terbit  ya '), 'salah terbit ya');
  assert.equal(sameInvoiceNumber(' inv/exp/2026/00001 ', 'INV/EXP/2026/00001'), true);
  assert.equal(sameInvoiceNumber('', ''), false);
});

test('invoice belum dibayar: role lain ditolak, alasan wajib, hanya invoice yang hilang', async () => {
  assert.equal((await register('H-01', 'Kopi Hapus')).status, 200);
  const inv = (await contractOf('H-01')).fullInvoice || (await liveInvoices()).find(i => i.booth_code === 'H-01');
  assert.ok(inv?.id, 'invoice pendaftaran ada');

  assert.equal((await del(inv.id, { reason: REASON })).status, 401);
  assert.equal((await del(inv.id, { reason: REASON }, 'sales')).status, 403);
  assert.equal((await del(inv.id, { reason: REASON }, 'operations')).status, 403);
  const noReason = await del(inv.id, {}, 'finance');
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.code, 'REASON_REQUIRED');
  assert.equal((await del(inv.id, { reason: 'pendek' }, 'finance')).status, 400);
  assert.ok((await liveInvoices()).some(i => i.id === inv.id), 'penolakan tidak menghapus apa pun');

  const ok = await del(inv.id, { reason: REASON }, 'finance');
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await liveInvoices()).some(i => i.id === inv.id), false);

  // tenant, booking and booth status stay
  const booth = await boothRow('H-01');
  assert.equal(booth.status, 'reserved');
  assert.equal(booth.owner_name, 'Kopi Hapus');
  const row = await exhibitorRow('H-01');
  assert.ok(row, 'tenant tetap di direktori');
  assert.equal(row.company, 'Kopi Hapus');
  assert.deepEqual(row.invoices, []);

  // Tempat Sampah: Super Admin only, with who / role / reason
  assert.equal((await s.api('GET', '/invoices/trash', undefined, { as: 'finance' })).status, 403);
  const t = (await trash()).find(i => i.id === inv.id);
  assert.equal(t.deleteReason, REASON);
  assert.equal(t.deletedByRole, 'finance');
  assert.ok(t.deletedBy);

  // Audit: who, role, number, amount, reason
  const logs = (await s.api('GET', '/audit-logs?category=Invoice', undefined, { as: 'superadmin' })).body;
  const entry = (logs.logs || logs.items || logs.data || []).find(l => l.action === 'Hapus invoice');
  assert.ok(entry, 'tercatat di Audit');
  assert.equal(entry.userRole, 'finance');
  assert.equal(entry.details.reason, REASON);
  assert.equal(entry.details.totalAmount, inv.total_amount);
  assert.match(entry.target, new RegExp(inv.invoice_number.replace(/\//g, '\\/')));
  assert.match(entry.summary, /Alasan: Invoice salah terbit/);
});

test('pulihkan: hanya Super Admin, invoice kembali dan tercatat', async () => {
  const t = (await trash()).find(i => i.boothCode === 'H-01');
  assert.equal((await s.api('POST', `/invoices/${t.id}/restore`, {}, { as: 'finance' })).status, 403);
  assert.equal((await s.api('POST', `/invoices/${t.id}/restore`, {}, { as: 'sales' })).status, 403);
  const r = await s.api('POST', `/invoices/${t.id}/restore`, {}, { as: 'superadmin' });
  assert.equal(r.status, 200, r.text);
  assert.ok((await liveInvoices()).some(i => i.id === t.id));
  assert.equal((await trash()).some(i => i.id === t.id), false);
  assert.equal((await exhibitorRow('H-01')).invoices.length, 1);
  const logs = (await s.api('GET', '/audit-logs?category=Invoice', undefined, { as: 'superadmin' })).body;
  assert.ok((logs.logs || logs.items || logs.data || []).some(l => l.action === 'Pulihkan invoice'));
});

test('invoice yang sudah dibayar: Keuangan ditolak, Super Admin wajib mengetik nomor; booth tetap Sold', async () => {
  assert.equal((await register('H-02', 'Batik Lunas')).status, 200);
  const inv = (await liveInvoices()).find(i => i.booth_code === 'H-02');
  assert.equal((await s.api('POST', `/invoices/${inv.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  assert.equal((await boothRow('H-02')).status, 'sold');

  const fin = await del(inv.id, { reason: REASON, confirmNumber: inv.invoice_number }, 'finance');
  assert.equal(fin.status, 409);
  assert.equal(fin.body.code, 'INVOICE_PAID');
  const noNumber = await del(inv.id, { reason: REASON }, 'superadmin');
  assert.equal(noNumber.status, 400);
  assert.equal(noNumber.body.code, 'CONFIRM_NUMBER');
  assert.equal((await del(inv.id, { reason: REASON, confirmNumber: 'INV/SALAH' }, 'superadmin')).status, 400);
  assert.equal((await del(inv.id, { confirmNumber: inv.invoice_number }, 'superadmin')).status, 400, 'alasan tetap wajib');

  const ok = await del(inv.id, { reason: REASON, confirmNumber: inv.invoice_number }, 'superadmin');
  assert.equal(ok.status, 200, ok.text);
  const booth = await boothRow('H-02');
  assert.equal(booth.status, 'sold');
  assert.equal(booth.owner_name, 'Batik Lunas');
  assert.ok(await exhibitorRow('H-02'));
});

test('DP dibayar: Keuangan tidak bisa menghapus DP, tetapi bisa menghapus Pelunasan yang belum dibayar', async () => {
  assert.equal((await register('H-03', 'Tenant DP')).status, 200);
  const dp = await s.api('POST', '/invoices', { invoiceKind: 'dp', floorplanId: FP, boothCode: 'H-03', dpMode: 'percent', dpValue: 30 }, { as: 'finance' });
  assert.equal(dp.status, 200, dp.text);
  let c = await contractOf('H-03');
  assert.equal((await s.api('POST', `/invoices/${c.dpInvoice.id}/status`, { status: 'PAID' }, { as: 'finance' })).status, 200);
  assert.equal((await del(c.dpInvoice.id, { reason: REASON }, 'finance')).status, 409);
  c = await contractOf('H-03');
  const row = await exhibitorRow('H-03');
  assert.equal(row.invoices.length, 2, 'DP dan Pelunasan dipilih satu per satu');
  assert.equal((await del(c.settlementInvoice.id, { reason: REASON }, 'finance')).status, 200);
  assert.equal((await exhibitorRow('H-03')).invoices.length, 1);
  assert.equal((await boothRow('H-03')).status, 'reserved');
});

test('pulihkan ditolak bila booth sudah punya invoice pengganti; nomor lama tidak dipakai ulang', async () => {
  assert.equal((await register('H-04', 'Tenant Ganti')).status, 200);
  const old = (await liveInvoices()).find(i => i.booth_code === 'H-04');
  assert.equal((await del(old.id, { reason: REASON }, 'finance')).status, 200);
  const made = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'H-04' }, { as: 'finance' });
  assert.equal(made.status, 200, made.text);
  const fresh = (await liveInvoices()).find(i => i.booth_code === 'H-04');
  assert.notEqual(fresh.invoice_number, old.invoice_number);
  const r = await s.api('POST', `/invoices/${old.id}/restore`, {}, { as: 'superadmin' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CONTRACT_HAS_INVOICES');
});

test('memulihkan project dari sampah tidak menghidupkan invoice yang dihapus sendiri', async () => {
  const before = (await trash()).filter(i => i.floorplanId === FP).map(i => i.id).sort();
  assert.ok(before.length >= 2);
  assert.equal((await s.api('POST', '/floorplan/soft-delete', { projectIds: [FP], reason: 'tes' }, { as: 'superadmin' })).status, 200);
  assert.equal((await s.api('POST', '/floorplan/restore', { projectIds: [FP] }, { as: 'superadmin' })).status, 200);
  assert.deepEqual((await trash()).filter(i => i.floorplanId === FP).map(i => i.id).sort(), before);
  assert.ok((await liveInvoices()).some(i => i.booth_code === 'H-01'), 'invoice aktif project kembali');
});
