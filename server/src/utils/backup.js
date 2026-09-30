import fs from 'fs';
import path from 'path';
import db, { dataDir } from '../db.js';

// Database backups (AGENTS.md §21): consistent online copies made with SQLite's backup API (safe while the server
// runs), verified with PRAGMA integrity_check. Kinds:
//   daily       made by the server once a day (kept BACKUP_KEEP_DAILY days, default 14)
//   pre-deploy  / pre-migration / manual   kept BACKUP_KEEP_OTHER days (default 90)
export const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(dataDir, 'backups');
const statusFile = () => path.join(backupDir, 'backup-status.json');
const DAY = 24 * 3600 * 1000;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function readBackupStatus() {
  try { return JSON.parse(fs.readFileSync(statusFile(), 'utf8')); } catch (e) { return { last: null, lastSuccess: null }; }
}

function writeStatus(entry) {
  const status = readBackupStatus();
  status.last = entry;
  if (entry.ok) status.lastSuccess = entry;
  fs.writeFileSync(statusFile(), JSON.stringify(status, null, 2));
}

async function verify(file) {
  const { default: Database } = await import('better-sqlite3');
  const copy = new Database(file, { readonly: true });
  try {
    const result = copy.pragma('integrity_check', { simple: true });
    const booths = copy.prepare('SELECT COUNT(*) AS c FROM booths').get().c;
    const invoices = copy.prepare('SELECT COUNT(*) AS c FROM invoices').get().c;
    return { integrity: result, booths, invoices };
  } finally {
    copy.close();
  }
}

/** Create a verified backup. kind: 'daily' | 'pre-deploy' | 'pre-migration' | 'manual'. Returns the status entry. */
export async function createBackup(kind = 'manual', note = '') {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${kind}_${stamp()}.db`);
  const started = Date.now();
  try {
    await db.backup(file);
    const check = await verify(file);
    if (check.integrity !== 'ok') throw new Error(`integrity_check: ${check.integrity}`);
    const entry = { ok: true, kind, note, file: path.basename(file), sizeBytes: fs.statSync(file).size, ...check, at: new Date().toISOString(), durationMs: Date.now() - started };
    writeStatus(entry);
    pruneBackups();
    return entry;
  } catch (error) {
    try { fs.unlinkSync(file); } catch (e) {}
    const entry = { ok: false, kind, note, error: error.message, at: new Date().toISOString() };
    writeStatus(entry);
    return entry;
  }
}

export function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ file: f, kind: f.split('_')[0], sizeBytes: fs.statSync(path.join(backupDir, f)).size, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
}

export function pruneBackups() {
  const keepDaily = Number(process.env.BACKUP_KEEP_DAILY || 14) * DAY;
  const keepOther = Number(process.env.BACKUP_KEEP_OTHER || 90) * DAY;
  const now = Date.now();
  listBackups().forEach(b => {
    const age = now - new Date(b.mtime).getTime();
    if ((b.kind === 'daily' && age > keepDaily) || (b.kind !== 'daily' && age > keepOther)) {
      try { fs.unlinkSync(path.join(backupDir, b.file)); } catch (e) {}
    }
  });
}

// Daily backup while the server runs: one at start-up when the last one is older than 24 h, then every 24 h
export function startBackupSchedule() {
  if (process.env.BACKUP_DISABLED === '1') return null;
  const run = async () => {
    const last = readBackupStatus().lastSuccess;
    if (last && Date.now() - new Date(last.at).getTime() < DAY - 60000) return;
    const result = await createBackup('daily');
    console.log(result.ok ? `💾 Backup harian: ${result.file}` : `⚠️ Backup harian gagal: ${result.error}`);
  };
  setTimeout(run, 5000);
  return setInterval(run, 60 * 60 * 1000); // checked hourly, runs once a day
}
