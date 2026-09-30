// Copy a database and anonymize personal data (AGENTS.md §21). Used for STAGING: a realistic copy of production
// without names, emails, phone numbers, addresses, NPWP or login sessions of real people.
//   node ops/mask-db.mjs <source.db> <target.db>
// Brand / company names and booth data are kept (they are public on the Live Floorplan anyway).
// Every staff account gets the staging password STAGING_PASSWORD (default "staging123").
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const Database = require('better-sqlite3');

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('Pemakaian: node ops/mask-db.mjs <sumber.db> <tujuan.db>');
  process.exit(1);
}
if (path.resolve(source) === path.resolve(target)) {
  console.error('⛔ Sumber dan tujuan sama: data production tidak boleh disamarkan di tempat.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(`${target}${suffix}`); } catch (e) {} }
const src = new Database(source, { readonly: true });
await src.backup(target);
src.close();

const db = new Database(target);
const short = (value) => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex').slice(0, 8);
// the same person always gets the same fake data, so relations (same exhibitor on several booths) stay intact
const fakeEmail = (v) => (v ? `tenant-${short(v)}@staging.invalid` : v);
const fakePhone = (v) => (v ? `0800${parseInt(short(v), 16).toString().padStart(8, '0').slice(-8)}` : v);
const fakeName = (v) => (v ? `PIC ${short(v).slice(0, 5).toUpperCase()}` : v);
const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
const tableExists = (table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

function maskTable(table, rules) {
  if (!tableExists(table)) return 0;
  const cols = columns(table);
  const active = Object.entries(rules).filter(([col]) => cols.has(col));
  if (!active.length) return 0;
  const rows = db.prepare(`SELECT rowid AS _rid, ${active.map(([c]) => c).join(', ')} FROM ${table}`).all();
  const update = db.prepare(`UPDATE ${table} SET ${active.map(([c]) => `${c} = ?`).join(', ')} WHERE rowid = ?`);
  rows.forEach(r => update.run(...active.map(([c, fn]) => fn(r[c])), r._rid));
  return rows.length;
}

const stats = {};
db.transaction(() => {
  stats.booths = maskTable('booths', { pic_name: fakeName, email: fakeEmail, phone: fakePhone });
  stats.orders = maskTable('orders', { pic_name: fakeName, email: fakeEmail, phone: fakePhone });
  stats.invoices = maskTable('invoices', {
    client_name: fakeName, client_email: fakeEmail, client_phone: fakePhone,
    client_address: (v) => (v ? 'Alamat disamarkan (staging)' : v), client_npwp: (v) => (v ? '00.000.000.0-000.000' : v)
  });
  stats.facility_requests = maskTable('facility_requests', { pic_name: fakeName, email: fakeEmail, phone: fakePhone });
  stats.users = maskTable('users', { phone: fakePhone });

  // Contact data copied into the canvas (boothData) of every floorplan
  const fps = db.prepare('SELECT id, canvas_fabric_json FROM floorplans WHERE canvas_fabric_json IS NOT NULL').all();
  const saveCanvas = db.prepare('UPDATE floorplans SET canvas_fabric_json = ? WHERE id = ?');
  fps.forEach(fp => {
    try {
      const canvas = JSON.parse(fp.canvas_fabric_json);
      (canvas.objects || []).forEach(o => {
        if (!o?.boothData) return;
        if (o.boothData.picName) o.boothData.picName = fakeName(o.boothData.picName);
        if (o.boothData.email) o.boothData.email = fakeEmail(o.boothData.email);
        if (o.boothData.phone) o.boothData.phone = fakePhone(o.boothData.phone);
      });
      saveCanvas.run(JSON.stringify(canvas), fp.id);
    } catch (e) {}
  });
  stats.floorplans = fps.length;

  // No real logins, IP addresses or request payloads in staging
  if (tableExists('sessions')) db.prepare('DELETE FROM sessions').run();
  if (tableExists('audit_logs')) db.prepare("UPDATE audit_logs SET ip = '', details_json = NULL").run();
})();

// Staff accounts keep their email / role, with the staging password
const password = process.env.STAGING_PASSWORD || 'staging123';
const { hashPassword } = await import(new URL('../server/src/utils/password.js', import.meta.url));
db.prepare('UPDATE users SET password_hash = ?').run(hashPassword(password));
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

console.log(`🕶️  Database staging siap: ${target}`);
console.log(`   Disamarkan: ${JSON.stringify(stats)}`);
console.log(`   Password semua akun staf di staging: ${password}`);
