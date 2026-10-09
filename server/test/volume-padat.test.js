// Volume padat (AGENTS.md §43): the database is compacted at start when a quarter of it is free pages, backups are
// compact copies (VACUUM INTO), and old bloated backups are compacted in the background with their content intact.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { startServer } from './helpers.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1024 * 1024;
let s;

// A database that once held ~15 MB (base64 images, since moved to files) and still carries the space
function bloated(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE old_images (id INTEGER PRIMARY KEY, data BLOB)');
  const add = db.prepare('INSERT INTO old_images (data) VALUES (?)');
  for (let i = 0; i < 15; i++) add.run(Buffer.alloc(MB, i));
  db.exec('CREATE TABLE keep_me (v TEXT)');
  db.prepare('INSERT INTO keep_me (v) VALUES (?)').run('isi lama tetap ada');
  db.exec('DELETE FROM old_images');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

before(async () => {
  s = await startServer({}, {
    prepare: (dir) => {
      bloated(path.join(dir, 'floorplan.db'));
      fs.mkdirSync(path.join(dir, 'backups'));
      const old = path.join(dir, 'backups', 'daily_2026-10-01T02-25-17-473Z.db');
      bloated(old);
      fs.writeFileSync(`${old}-shm`, Buffer.alloc(32768));
      fs.writeFileSync(`${old}-wal`, '');
    }
  });
});
after(async () => { await s.stop(); });

const size = (f) => fs.statSync(f).size;

test('database dipadatkan saat start: ruang kosong dibuang, data tetap', async () => {
  const file = path.join(s.dataDir, 'floorplan.db');
  assert.ok(size(file) < 6 * MB, `database ${Math.round(size(file) / 1024)} KB, sebelumnya > 15 MB`);
  const db = new Database(file, { readonly: true });
  assert.equal(db.prepare('SELECT v FROM keep_me').get().v, 'isi lama tetap ada');
  db.close();
});

test('backup lama dipadatkan di latar belakang, isinya utuh, file sampah -shm / -wal hilang', async () => {
  const old = path.join(s.dataDir, 'backups', 'daily_2026-10-01T02-25-17-473Z.db');
  for (let i = 0; i < 40 && size(old) > 6 * MB; i++) await new Promise(r => setTimeout(r, 250));
  assert.ok(size(old) < 6 * MB, `backup ${Math.round(size(old) / 1024)} KB`);
  const db = new Database(old, { readonly: true });
  assert.equal(db.prepare('SELECT v FROM keep_me').get().v, 'isi lama tetap ada');
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();
  assert.ok(!fs.existsSync(`${old}-shm`) && !fs.existsSync(`${old}-wal`));
});

test('backup baru dibuat padat dan terverifikasi', async () => {
  const out = execFileSync(process.execPath, ['src/scripts/backup.js', 'manual'], {
    cwd: SERVER_DIR, env: { ...process.env, DATA_DIR: s.dataDir, APP_ENV: 'test', BACKUP_DISABLED: '1', ENV_FILE: path.join(s.dataDir, '.env'), ANTHROPIC_API_KEY: '' }
  }).toString();
  assert.match(out, /integrity ok/);
  const file = fs.readdirSync(path.join(s.dataDir, 'backups')).find(f => f.startsWith('manual_') && f.endsWith('.db'));
  assert.ok(size(path.join(s.dataDir, 'backups', file)) < 6 * MB);
  assert.ok(!fs.readdirSync(path.join(s.dataDir, 'backups')).some(f => f.startsWith('manual_') && /-(shm|wal)$/.test(f)), 'tanpa file -shm / -wal');
});
