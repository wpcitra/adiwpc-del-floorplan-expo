// STAGING on this computer (AGENTS.md §21): a separate copy of the website, built from a git branch / commit,
// with its own anonymized database. Production (ports 3002 / 5001, server/data) is never touched.
//   node ops/staging.mjs up [ref]      build & start staging from a git ref (default: main)
//   node ops/staging.mjs refresh-db    new anonymized copy of the production database
//   node ops/staging.mjs status
//   node ops/staging.mjs down
// Staging: web http://localhost:3101  •  API http://localhost:5101/api
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = path.join(ROOT, '.staging');
const APP = path.join(STAGING, 'app');
const DATA = path.join(STAGING, 'data');
const LOGS = path.join(STAGING, 'logs');
const PROD_DB = path.join(ROOT, 'server/data/floorplan.db');
const API_PORT = Number(process.env.STAGING_API_PORT || 5101);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 3101);

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim();
const log = (msg) => console.log(msg);
const pidFile = (name) => path.join(STAGING, `${name}.pid`);

function stop(name) {
  try {
    const pid = Number(fs.readFileSync(pidFile(name), 'utf8'));
    if (pid) { try { process.kill(-pid); } catch (e) { try { process.kill(pid); } catch (e2) {} } }
  } catch (e) {}
  try { fs.unlinkSync(pidFile(name)); } catch (e) {}
}

function start(name, cmd, args, cwd, env) {
  fs.mkdirSync(LOGS, { recursive: true });
  const out = fs.openSync(path.join(LOGS, `${name}.log`), 'a');
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  fs.writeFileSync(pidFile(name), String(child.pid));
  return child.pid;
}

async function waitFor(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// node_modules: reuse production's when the lockfile is identical, otherwise a clean install for the branch
function linkOrInstall(sub) {
  const target = path.join(APP, sub, 'node_modules');
  const sameLock = fs.existsSync(path.join(APP, sub, 'package-lock.json')) &&
    fs.readFileSync(path.join(APP, sub, 'package-lock.json'), 'utf8') === fs.readFileSync(path.join(ROOT, sub, 'package-lock.json'), 'utf8');
  if (fs.existsSync(target)) return;
  if (sameLock) fs.symlinkSync(path.join(ROOT, sub, 'node_modules'), target, 'dir');
  else { log(`   npm ci (${sub}): dependensi branch berbeda dari production`); sh('npm ci --silent', { cwd: path.join(APP, sub), stdio: 'inherit' }); }
}

async function refreshDb() {
  log('🕶️  Menyalin database production ke staging (data pribadi disamarkan)...');
  execSync(`node ops/mask-db.mjs "${PROD_DB}" "${path.join(DATA, 'floorplan.db')}"`, { cwd: ROOT, stdio: 'inherit' });
}

async function up(ref = 'main') {
  sh('git rev-parse --verify HEAD'); // must be a git repository with commits
  const commit = sh(`git rev-parse --short ${ref}`);
  stop('server');
  stop('web');
  if (!fs.existsSync(APP)) sh(`git worktree add --detach "${APP}" ${ref}`);
  else sh(`git -C "${APP}" checkout --detach --force ${ref}`);
  log(`🧪 Staging dari ${ref} (${commit})`);
  linkOrInstall('server');
  linkOrInstall('client');
  if (!fs.existsSync(path.join(DATA, 'floorplan.db'))) await refreshDb();

  log('🏗️  Build web staging...');
  execSync('npx vite build --logLevel error', {
    cwd: path.join(APP, 'client'), stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}/api` }
  });

  start('server', process.execPath, ['src/index.js'], path.join(APP, 'server'), {
    PORT: String(API_PORT), DATA_DIR: DATA, APP_ENV: 'staging', APP_COMMIT: commit, BACKUP_DISABLED: '1',
    ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`, ANTHROPIC_API_KEY: ''
  });
  start('web', process.execPath, [path.join(APP, 'client/node_modules/vite/bin/vite.js'), 'preview', '--port', String(WEB_PORT), '--strictPort'], path.join(APP, 'client'), {});
  const okApi = await waitFor(`http://localhost:${API_PORT}/api/health`);
  const okWeb = await waitFor(`http://localhost:${WEB_PORT}/`);
  fs.writeFileSync(path.join(STAGING, 'current.json'), JSON.stringify({ ref, commit, startedAt: new Date().toISOString() }, null, 2));
  log(okApi && okWeb
    ? `✅ Staging berjalan: web http://localhost:${WEB_PORT} • API http://localhost:${API_PORT}/api`
    : `⚠️ Staging belum merespons (lihat ${LOGS})`);
  if (!okApi || !okWeb) process.exitCode = 1;
}

async function status() {
  let current = null;
  try { current = JSON.parse(fs.readFileSync(path.join(STAGING, 'current.json'), 'utf8')); } catch (e) {}
  let health = null;
  try { health = await (await fetch(`http://localhost:${API_PORT}/api/health`)).json(); } catch (e) {}
  log(JSON.stringify({ running: Boolean(health), current, health }, null, 2));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'up') await up(arg);
else if (cmd === 'down') { stop('server'); stop('web'); log('🛑 Staging dihentikan'); }
else if (cmd === 'refresh-db') await refreshDb();
else if (cmd === 'status') await status();
else { log('Pemakaian: node ops/staging.mjs up [ref] | refresh-db | status | down'); process.exitCode = 1; }
