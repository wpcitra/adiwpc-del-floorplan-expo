import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

export function resetDatabase() {
  console.log('🧹 Clearing all dummy data, transactions, and project data...');

  db.transaction(() => {
    // 1. Clear dummy orders / bookings
    db.exec('DELETE FROM orders;');
    // 2. Clear dummy invoices
    db.exec('DELETE FROM invoices;');
    // 3. Clear dummy facility requests and non-template forms
    db.exec('DELETE FROM facility_requests;');
    db.exec('DELETE FROM facility_forms WHERE is_template = 0;');
    // 4. Clear all booths and venue items
    db.exec('DELETE FROM booths;');
    db.exec('DELETE FROM venue_items;');
    // 5. Clear all floorplans and events (projects)
    db.exec('DELETE FROM floorplans;');
    db.exec('DELETE FROM events;');
    // 6. Clear custom preset layouts (keep system presets)
    db.exec('DELETE FROM preset_layouts WHERE is_system = 0;');
    // 7. Clear project-scoped brand categories and booth categories
    db.exec("DELETE FROM brand_categories WHERE project_id IS NOT NULL AND project_id != 'global';");
    db.exec("DELETE FROM booth_categories WHERE project_id IS NOT NULL AND project_id != 'global';");
  })();

  // Reclaim disk space
  db.exec('VACUUM;');

  console.log('✨ All dummy & project data wiped successfully! Database is clean like a new application.');
}

// Safety lock (AGENTS.md §20): this script wipes every project, booth, order and invoice. It only runs with an
// explicit confirmation, never in production, and always writes a backup of the database first.
//   ALLOW_DB_RESET=yes node src/resetDb.js --confirm-wipe
if (process.argv[1]?.endsWith('resetDb.js')) {
  const confirmed = process.argv.includes('--confirm-wipe') && process.env.ALLOW_DB_RESET === 'yes';
  if (process.env.NODE_ENV === 'production') {
    console.error('⛔ resetDb.js tidak boleh dijalankan di production.');
    process.exit(1);
  }
  if (!confirmed) {
    console.error('⛔ Reset database dibatalkan. Script ini MENGHAPUS semua project, booth, order, dan invoice.');
    console.error('   Jika memang yakin: ALLOW_DB_RESET=yes node src/resetDb.js --confirm-wipe');
    process.exit(1);
  }
  const backupDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `pre-reset_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.backup(backupFile)
    .then(() => {
      console.log(`💾 Backup dibuat: ${backupFile}`);
      resetDatabase();
      process.exit(0);
    })
    .catch(err => {
      console.error('⛔ Backup gagal, reset dibatalkan:', err.message);
      process.exit(1);
    });
}
