import db from '../db.js';
import { createBackup } from './backup.js';

// One-time removal of the demo data (src/seed.js: event EVT-2026-001, floorplan FP-2026-001, 15 booths, demo orders)
// from a production database that was auto-seeded while it was empty. Production starts clean and the real
// projects / tenants are entered on the website.
//
// Runs only on Railway (RAILWAY_ENVIRONMENT) or with REMOVE_DEMO_DATA=yes, only once per database, and only
// while the demo is untouched: it is the only floorplan, there are no invoices, and every order is a demo order.
// Anything else means real data was entered: nothing is deleted (the demo project can then be deleted in the Studio).
// A verified backup is taken first; without it nothing is deleted.
const DEMO_EVENT = 'EVT-2026-001';
const DEMO_FLOORPLAN = 'FP-2026-001';
const DONE_KEY = 'demo_cleanup_done';

const count = (sql, ...args) => db.prepare(sql).get(...args)?.n || 0;

export function demoCleanupPlan() {
  if (!process.env.RAILWAY_ENVIRONMENT && process.env.REMOVE_DEMO_DATA !== 'yes') return { run: false, reason: 'bukan production Railway' };
  if (db.prepare('SELECT 1 FROM maintenance_settings WHERE key = ?').get(DONE_KEY)) return { run: false, reason: 'sudah pernah dibersihkan' };
  const fp = db.prepare('SELECT id, event_id FROM floorplans WHERE id = ?').get(DEMO_FLOORPLAN);
  if (!fp || fp.event_id !== DEMO_EVENT) return { run: false, reason: 'data contoh tidak ada' };
  if (count('SELECT COUNT(*) AS n FROM floorplans') !== 1) return { run: false, reason: 'sudah ada project lain (data asli)' };
  if (count('SELECT COUNT(*) AS n FROM invoices') !== 0) return { run: false, reason: 'sudah ada invoice (data asli)' };
  if (count("SELECT COUNT(*) AS n FROM orders WHERE floorplan_id != ? OR id NOT LIKE 'ORD-2026-%'", DEMO_FLOORPLAN) !== 0) {
    return { run: false, reason: 'sudah ada pesanan asli' };
  }
  return { run: true };
}

export async function removeDemoDataIfUntouched() {
  const plan = demoCleanupPlan();
  if (!plan.run) return plan;

  const backup = await createBackup('pre-migration', 'Sebelum menghapus data contoh (seed) di production');
  if (!backup.ok) {
    console.error('Hapus data contoh dibatalkan: backup gagal', new Error(backup.error));
    return { run: false, reason: 'backup gagal' };
  }

  // Re-check after the async backup, then delete in one transaction
  if (!demoCleanupPlan().run) return { run: false, reason: 'data berubah selama backup' };
  const removed = db.transaction(() => {
    const out = {};
    for (const table of ['orders', 'booths', 'venue_items', 'ops_elements', 'ops_booth_data', 'ops_layers', 'ops_seen']) {
      try { out[table] = db.prepare(`DELETE FROM ${table} WHERE floorplan_id = ?`).run(DEMO_FLOORPLAN).changes; } catch (e) { /* table not present */ }
    }
    out.floorplans = db.prepare('DELETE FROM floorplans WHERE id = ?').run(DEMO_FLOORPLAN).changes;
    out.events = db.prepare('DELETE FROM events WHERE id = ? AND NOT EXISTS (SELECT 1 FROM floorplans WHERE event_id = ?)').run(DEMO_EVENT, DEMO_EVENT).changes;
    db.prepare('INSERT OR REPLACE INTO maintenance_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .run(DONE_KEY, JSON.stringify({ at: new Date().toISOString(), backup: backup.file, removed: out }), 'system');
    return out;
  })();
  console.log(`🧹 Data contoh dihapus dari production (backup: ${backup.file}):`, JSON.stringify(removed));
  return { run: true, removed, backup: backup.file };
}
