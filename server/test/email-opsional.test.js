// Email exhibitor opsional (AGENTS.md §29): kosong = NULL, diisi = harus valid, bisa diwajibkan dari Setting
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
const FP = 'FP-EMAIL';
before(async () => {
  s = await startServer();
  await createPublishedFloorplan(s.api, FP, ['E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'E-06'].map((c, i) => boothObject(c, { left: i * 200, top: 0 })));
});
after(async () => { await s.stop(); });

const book = (code, extra = {}, as) => s.api('POST', '/orders/checkout', {
  floorplanId: FP, boothCodes: [code], boothCode: code, fullName: 'Rina', brandName: `Brand ${code}`, brandCategory: 'F&B',
  phone: '081234567890', bookingType: 'booking', ...extra
}, as ? { as } : undefined);
const rawDb = (fn) => { const db = new Database(path.join(s.dataDir, 'floorplan.db'), { readonly: true }); try { return fn(db); } finally { db.close(); } };

test('tanpa email: pendaftaran online berhasil, tersimpan NULL di pesanan, booth dan invoice', async () => {
  const r = await book('E-01');
  assert.equal(r.status, 200, r.text);
  const spaces = await book('E-02', { email: '   ' });
  assert.equal(spaces.status, 200, 'spasi saja dianggap kosong');
  rawDb(db => {
    for (const code of ['E-01', 'E-02']) {
      assert.equal(db.prepare('SELECT email FROM orders WHERE floorplan_id = ? AND booth_code = ?').get(FP, code).email, null, `orders ${code}`);
      assert.equal(db.prepare('SELECT email FROM booths WHERE floorplan_id = ? AND code = ?').get(FP, code).email, null, `booths ${code}`);
      assert.equal(db.prepare('SELECT client_email FROM invoices WHERE floorplan_id = ? AND booth_code = ?').get(FP, code).client_email, null, `invoices ${code}`);
    }
  });
  assert.ok(!r.body.order.invoice.client_email, 'invoice tanpa baris email');
});

test('email valid tersimpan (tanpa spasi); email salah format ditolak', async () => {
  const ok = await book('E-03', { email: '  rina@contoh.co.id ' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(rawDb(db => db.prepare('SELECT email FROM orders WHERE floorplan_id = ? AND booth_code = ?').get(FP, 'E-03').email), 'rina@contoh.co.id');
  for (const bad of ['rina', 'rina@', 'rina@contoh', 'rina @contoh.id', '@contoh.id']) {
    const r = await book('E-04', { email: bad });
    assert.equal(r.status, 400, `"${bad}" harus ditolak`);
    assert.equal(r.body.error, 'Format email tidak valid');
  }
  assert.equal((await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === 'E-04').status, 'available');
});

test('Data Exhibitor, pencarian klien dan simpan Studio tetap jalan tanpa email', async () => {
  const ex = await s.api('GET', `/exhibitors?floorplanId=${FP}`, undefined, { as: 'superadmin' });
  assert.equal(ex.status, 200, ex.text);
  const row = ex.body.exhibitors.find(e => e.booth === 'E-01' || e.boothCode === 'E-01' || e.booth_code === 'E-01');
  assert.ok(row, 'booth tanpa email tetap tampil');
  assert.notEqual(String(row.email), 'null');
  assert.equal((await s.api('GET', '/orders/registered-clients', undefined, { as: 'sales' })).status, 200);
  assert.equal((await s.api('GET', '/orders/check-client?phone=081234567890', undefined, { as: 'sales' })).status, 200);

  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const save = await s.api('POST', '/floorplan/save', { id: FP, eventId: `EVT-${FP}`, title: fp.title, status: 'published', fabricJson: fp.canvas_fabric_json }, { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  const after = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan.booths.find(b => b.code === 'E-01');
  assert.equal(after.status, 'reserved');
  assert.equal(after.owner_name, 'Brand E-01');
  assert.equal(rawDb(db => db.prepare('SELECT email FROM booths WHERE floorplan_id = ? AND code = ?').get(FP, 'E-01').email), null);
});

test('Ubah Booking dan Booking Manual Sales: email boleh kosong, salah format ditolak', async () => {
  const upd = (email) => s.api('PUT', '/orders/update-tenant', { floorplanId: FP, boothCode: 'E-03', brandName: 'Brand E-03', fullName: 'Rina', phone: '081234567890', brandCategory: 'F&B', email }, { as: 'sales' });
  assert.equal((await upd('salah@format')).status, 400);
  assert.equal((await upd('')).status, 200);
  assert.equal(rawDb(db => db.prepare('SELECT email FROM orders WHERE floorplan_id = ? AND booth_code = ?').get(FP, 'E-03').email), null);
  const manual = await book('E-04', { deferInvoice: true, source: 'admin' }, 'sales');
  assert.equal(manual.status, 200, manual.text);
  const inv = await s.api('POST', '/booth-actions/invoice', { floorplanId: FP, boothCode: 'E-04' }, { as: 'sales' });
  assert.equal(inv.status, 200, inv.text);
  assert.equal(rawDb(db => db.prepare('SELECT client_email FROM invoices WHERE id = ?').get(inv.body.invoice.id).client_email), null);
});

test('Setting "Email exhibitor: Wajib": tanpa email ditolak, dengan email diterima; kembali Opsional', async () => {
  assert.equal((await s.api('GET', '/invoices/config')).body.config.exhibitorEmailRequired, false, 'default Opsional, terbaca form publik');
  assert.equal((await s.api('POST', '/invoices/config', { config: { exhibitorEmailRequired: true } }, { as: 'superadmin' })).status, 200);
  const none = await book('E-05');
  assert.equal(none.status, 400);
  assert.equal(none.body.error, 'Email wajib diisi');
  assert.equal((await book('E-05', { email: 'ada@contoh.id' })).status, 200);
  assert.equal((await s.api('POST', '/invoices/config', { config: { exhibitorEmailRequired: false } }, { as: 'superadmin' })).status, 200);
  assert.equal((await book('E-06')).status, 200);
});

test('migrasi: tabel orders lama (email NOT NULL) dibangun ulang tanpa kehilangan data', async () => {
  const s2 = await startServer({}, {
    prepare: (dir) => {
      const db = new Database(path.join(dir, 'floorplan.db'));
      db.exec(`CREATE TABLE floorplans (id TEXT PRIMARY KEY);
        CREATE TABLE orders (
          id TEXT PRIMARY KEY, floorplan_id TEXT NOT NULL, booth_id TEXT, booth_code TEXT NOT NULL, company_name TEXT NOT NULL,
          pic_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, total_amount INTEGER NOT NULL,
          payment_method TEXT DEFAULT 'qris', payment_status TEXT DEFAULT 'PAID', invoice_number TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (floorplan_id) REFERENCES floorplans(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_orders_lama ON orders(floorplan_id, booth_code);
        ALTER TABLE orders ADD COLUMN brand_category TEXT DEFAULT '';
        INSERT INTO floorplans (id) VALUES ('FP-LAMA');
        INSERT INTO orders (id, floorplan_id, booth_code, company_name, pic_name, email, phone, total_amount, invoice_number, brand_category)
        VALUES ('ORD-LAMA', 'FP-LAMA', 'Z-01', 'Tenant Lama', 'Pak Lama', 'lama@contoh.id', '0811', 5000000, 'INV/LAMA', 'Fashion');`);
      db.close();
    }
  });
  try {
    const db = new Database(path.join(s2.dataDir, 'floorplan.db'), { readonly: true });
    assert.equal(db.prepare('PRAGMA table_info(orders)').all().find(c => c.name === 'email').notnull, 0);
    const row = db.prepare("SELECT * FROM orders WHERE id = 'ORD-LAMA'").get();
    assert.equal(row.email, 'lama@contoh.id');
    assert.equal(row.brand_category, 'Fashion');
    assert.equal(row.total_amount, 5000000);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_lama'").get(), 'index dipertahankan');
    db.close();
    assert.ok(fs.readdirSync(path.join(s2.dataDir, 'backups')).some(f => f.startsWith('pre-migration_email-opsional_')), 'salinan sebelum migrasi dibuat');
    assert.match(s2.output(), /Kolom email pesanan kini opsional \(1 baris/);
  } finally { await s2.stop(); }
});
