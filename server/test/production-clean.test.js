// Production starts clean: no demo data on an empty database, the auto-seeded demo is removed once while untouched,
// the first Super Admin never uses a password from the public repository, and checkout issues its own invoice number
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runIn = (dataDir, args) => {
  const r = spawnSync(process.execPath, args, { cwd: SERVER_DIR, env: { ...process.env, DATA_DIR: dataDir, BACKUP_DISABLED: '1' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
};
const seedDemo = (dataDir) => runIn(dataDir, ['src/seed.js']);
const projectIds = async (s) => {
  const r = await s.api('GET', '/floorplan/events', undefined, { as: 'superadmin' });
  return JSON.stringify(r.body);
};
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise(r => setTimeout(r, 250));
  }
};

test('database kosong tidak lagi diisi data contoh', async () => {
  const s = await startServer();
  try {
    assert.ok(!(await projectIds(s)).includes('FP-2026-001'));
  } finally { await s.stop(); }
});

test('data contoh yang belum disentuh dihapus sekali di production (dengan backup)', async () => {
  const s = await startServer({ REMOVE_DEMO_DATA: 'yes' }, { prepare: seedDemo });
  try {
    assert.ok(await waitFor(async () => !(await projectIds(s)).includes('FP-2026-001')), 'project contoh FP-2026-001 terhapus');
    assert.match(s.output(), /Data contoh dihapus/);
  } finally { await s.stop(); }
});

test('data contoh TIDAK dihapus bila sudah ada data asli (invoice)', async () => {
  const addInvoice = (dataDir) => {
    seedDemo(dataDir);
    runIn(dataDir, ['--input-type=module', '-e', `
      const { default: db } = await import('./src/db.js');
      db.prepare("INSERT INTO invoices (id, invoice_number, floorplan_id, client_name, company_name, issue_date, due_date, subtotal, total_amount) VALUES ('INV-REAL', 'INV/REAL/1', 'FP-2026-001', 'Budi', 'Tenant Asli', '2026-09-30', '2026-10-07', 1000, 1000)").run();
    `]);
  };
  const s = await startServer({ REMOVE_DEMO_DATA: 'yes' }, { prepare: addInvoice });
  try {
    await new Promise(r => setTimeout(r, 1500));
    assert.ok((await projectIds(s)).includes('FP-2026-001'), 'project tetap ada');
    assert.doesNotMatch(s.output(), /Data contoh dihapus/);
  } finally { await s.stop(); }
});

test('production: hanya Super Admin pertama, password dari INITIAL_ADMIN_PASSWORD; nomor invoice dibuat server', async () => {
  const password = 'Rahasia-Awal-123';
  const s = await startServer({ INITIAL_ADMIN_PASSWORD: password }, { credentials: { superadmin: ['superadmin@expo.local', password] } });
  try {
    const bad = await s.api('POST', '/auth/login', { email: 'superadmin@expo.local', password: 'superadmin123' });
    assert.equal(bad.status, 401, 'password bawaan repo tidak berlaku');
    const finance = await s.api('POST', '/auth/login', { email: 'keuangan@expo.local', password: 'keuangan123' });
    assert.equal(finance.status, 401, 'akun contoh lain tidak dibuat');

    // Checkout: a visitor cannot choose (and so overwrite) an invoice number
    const FP = 'FP-TEST-CLEAN';
    await createPublishedFloorplan(s.api, FP, [boothObject('Q-01', { left: 0, top: 0 }), boothObject('Q-02', { left: 300, top: 0 })]);
    const reg = (code, extra = {}) => ({
      floorplanId: FP, boothCodes: [code], fullName: 'Ani', brandName: `Brand ${code}`, email: `${code}@contoh.test`,
      phone: '081234567890', bookingType: 'booking', ...extra
    });
    const first = await s.api('POST', '/orders/checkout', reg('Q-01'));
    assert.equal(first.status, 200, first.text);
    const taken = first.body.order.invoiceNumber;
    const second = await s.api('POST', '/orders/checkout', reg('Q-02', { invoiceNumber: taken }));
    assert.equal(second.status, 200, second.text);
    assert.notEqual(second.body.order.invoiceNumber, taken);
    const list = (await s.api('GET', `/invoices?floorplanId=${FP}`, undefined, { as: 'superadmin' })).body.invoices;
    assert.equal(list.find(i => i.invoice_number === taken)?.booth_code, 'Q-01', 'invoice pertama tidak tertimpa');
  } finally { await s.stop(); }
});

test('rekening utama sinkron: Setting (Bank 1) dan Desain Layout Invoice mengubah rekening yang sama', async () => {
  const s = await startServer();
  try {
    const cfg = async () => (await s.api('GET', '/invoices/config', undefined, { as: 'superadmin' })).body.config;
    await s.api('POST', '/invoices/config', { config: { bank1AccHolder: 'PT Contoh Satu', bank1AccNumber: '111-222' } }, { as: 'superadmin' });
    let c = await cfg();
    assert.equal(c.accountName, 'PT Contoh Satu', 'nama di invoice mengikuti Setting');
    assert.equal(c.accountNumber, '111-222');
    await s.api('POST', '/invoices/config', { config: { accountName: 'PT Contoh Dua' } }, { as: 'superadmin' });
    c = await cfg();
    assert.equal(c.bank1AccHolder, 'PT Contoh Dua', 'Setting mengikuti Desain Layout Invoice');
    // Pengunjung tetap menerima rekening (untuk transfer), tanpa tanda tangan
    const pub = (await s.api('GET', '/invoices/config')).body.config;
    assert.equal(pub.bank1AccHolder, 'PT Contoh Dua');
  } finally { await s.stop(); }
});

test('RESET_ADMIN_PASSWORD mengatur ulang password Super Admin (akses darurat dari panel hosting)', async () => {
  const fresh = 'Reset-Darurat-2026';
  const s = await startServer({ RESET_ADMIN_PASSWORD: fresh }, { credentials: { superadmin: ['superadmin@expo.local', fresh] } });
  try {
    const old = await s.api('POST', '/auth/login', { email: 'superadmin@expo.local', password: 'superadmin123' });
    assert.equal(old.status, 401, 'password lama tidak berlaku lagi');
    const ok = await s.api('POST', '/auth/login', { email: 'superadmin@expo.local', password: fresh });
    assert.ok(ok.body?.token, ok.text);
    assert.doesNotMatch(s.output(), new RegExp(fresh), 'password tidak pernah ditulis ke log');
  } finally { await s.stop(); }
});
