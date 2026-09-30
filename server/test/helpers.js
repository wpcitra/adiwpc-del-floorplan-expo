// Test harness (AGENTS.md §21): every test file starts its own server on a free port with an EMPTY temporary
// database (DATA_DIR), so tests never touch server/data/floorplan.db. Default seeded accounts are used to log in.
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ACCOUNTS = {
  superadmin: ['superadmin@expo.local', 'superadmin123'],
  finance: ['keuangan@expo.local', 'keuangan123'],
  sales: ['sales@expo.local', 'sales123'],
  operations: ['operasional@expo.local', 'operasional123'],
  developer: ['developer@expo.test', 'developer123'] // created by tests that need it (createDeveloper)
};

export async function createDeveloper(api) {
  const r = await api('POST', '/users', { name: 'Dev Tes', email: ACCOUNTS.developer[0], role: 'developer', password: ACCOUNTS.developer[1] }, { as: 'superadmin' });
  if (r.status !== 200 && r.status !== 201) throw new Error(`Buat akun developer gagal: ${r.text}`);
}

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

// `prepare(dataDir)` runs before the server starts (e.g. to put a database in the temporary DATA_DIR)
export async function startServer(extraEnv = {}, { prepare, credentials = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-test-'));
  if (prepare) await prepare(dataDir);
  const port = await freePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env, PORT: String(port), DATA_DIR: dataDir, APP_ENV: 'test', BACKUP_DISABLED: '1',
      PUBLIC_ALIAS_SALT: 'test-salt', ANTHROPIC_API_KEY: '',
      // own .env file and a dead Anthropic URL: tests never touch server/.env or call the real API
      ENV_FILE: path.join(dataDir, '.env'), ANTHROPIC_API_URL: 'http://127.0.0.1:9', ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const base = `http://localhost:${port}/api`;
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch (e) {}
    if (child.exitCode !== null || Date.now() - t0 > 20000) throw new Error(`Server tes gagal start:\n${output}`);
    await new Promise(r => setTimeout(r, 200));
  }

  const tokens = {};
  const api = async (method, url, body, { as } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (as) headers.Authorization = `Bearer ${tokens[as] || (tokens[as] = await login(as))}`;
    const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, body: json, text };
  };
  const login = async (role) => {
    const [email, password] = credentials[role] || ACCOUNTS[role];
    const res = await api('POST', '/auth/login', { email, password });
    if (!res.body?.token) throw new Error(`Login ${role} gagal: ${res.text}`);
    return res.body.token;
  };

  const stop = () => new Promise(resolve => {
    child.once('exit', () => { fs.rmSync(dataDir, { recursive: true, force: true }); resolve(); });
    child.kill();
  });
  return { base, api, login, stop, dataDir, output: () => output };
}

// A minimal Studio canvas: booths as Fabric groups with boothData (what the editor saves)
export function boothObject(code, { left, top, widthM = 3, heightM = 3, price = 10000000, status = 'available', ownerName = '', extra = {} }) {
  const w = widthM * 20;
  const h = heightM * 20;
  return {
    type: 'Group', left, top, width: w, height: h, originX: 'left', originY: 'top', scaleX: 1, scaleY: 1, angle: 0,
    isBooth: true, id: `booth_${code}`,
    boothData: { id: `booth_${code}`, code, category: 'Standard', shape: 'rectangle', price, status, ownerName, widthM, heightM, ...extra },
    objects: [
      { type: 'Rect', left: -w / 2, top: -h / 2, width: w, height: h, fill: '#fff', stroke: '#333' },
      { type: 'Text', left: 0, top: 0, text: code, fontSize: 10 }
    ]
  };
}

// Save + publish a floorplan, returns its id and public slug
export async function createPublishedFloorplan(api, id, objects, extra = {}) {
  const save = await api('POST', '/floorplan/save', {
    id, eventId: `EVT-${id}`, title: `Tes ${id}`, status: 'draft',
    fabricJson: { version: '7.0.0', objects }, metadata: { title: `Tes ${id}`, ...extra.metadata }
  }, { as: 'superadmin' });
  if (save.status !== 200) throw new Error(`Simpan denah gagal: ${save.text}`);
  const pub = await api('POST', `/floorplan/${id}/publish`, {}, { as: 'superadmin' });
  if (pub.status !== 200) throw new Error(`Publish gagal: ${pub.text}`);
  return { id, slug: pub.body.slug };
}
