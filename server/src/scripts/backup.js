// Manual backup: npm run backup (from server/) or npm run backup (from the project root)
//   node src/scripts/backup.js [kind] [note]   kind: manual | pre-deploy | pre-migration
import { createBackup, listBackups } from '../utils/backup.js';

const kind = process.argv[2] || 'manual';
const note = process.argv.slice(3).join(' ');
const result = await createBackup(kind, note);
if (!result.ok) {
  console.error(`⛔ Backup gagal: ${result.error}`);
  process.exit(1);
}
console.log(`💾 Backup ${result.kind} dibuat: ${result.file} (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB, ${result.booths} booth, ${result.invoices} invoice, integrity ${result.integrity})`);
console.log(`   Total backup tersimpan: ${listBackups().length}`);
process.exit(0);
