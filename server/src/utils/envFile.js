import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// server/.env: server-only settings and secrets (AGENTS.md §21). Loaded before anything else (db.js imports this
// first). ENV_FILE points tests at their own file so they never touch the real one. Values already present in the
// process environment win over the file (dotenv default).
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const envFilePath = () => (process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(SERVER_DIR, '.env'));

dotenv.config({ path: envFilePath(), quiet: true });

const lineRe = (name) => new RegExp(`^\\s*(export\\s+)?${name}\\s*=`);

// Whether the variable is written in the .env file (as opposed to only the process environment)
export function envFileHas(name) {
  try {
    return fs.readFileSync(envFilePath(), 'utf8').split(/\r?\n/).some(l => lineRe(name).test(l));
  } catch (e) {
    return false;
  }
}

// Set (value) or remove (null) one variable in the .env file, keeping every other line. Written to a temp file with
// owner-only permissions (600), then renamed, so a crash never leaves a half-written file. The caller validates the
// value: it must not contain line breaks, quotes or spaces.
export function setEnvFileValue(name, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Nama variabel tidak valid');
  if (value !== null && !/^[\x21-\x7e]+$/.test(value)) throw new Error('Nilai tidak valid');
  const file = envFilePath();
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch (e) {}
  const kept = lines.filter(l => !lineRe(name).test(l));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  if (value !== null) kept.push(`${name}=${value}`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${kept.join('\n')}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
  if (value === null) delete process.env[name];
  else process.env[name] = value;
}
