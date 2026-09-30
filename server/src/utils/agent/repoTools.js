import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrubText } from '../errorTracker.js';

// Read-only access to the source code for the AI agent (AGENTS.md §27).
//   - only inside the repository (AGENT_REPO_DIR, default: the project folder), symlinks resolved
//   - never secrets or data: .env*, .git, databases, backups, staging copies, node_modules, builds, keys
//   - text files only, size-limited; every result is scrubbed (API keys, tokens, emails...) before it leaves
export const REPO_ROOT = path.resolve(process.env.AGENT_REPO_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../..'));

const DENIED_SEGMENTS = new Set(['.git', 'node_modules', '.staging', 'dist', 'backups', 'agent-files', '.agent', 'coverage']);
const DENIED_NAME = /^\.env(\..*)?$|\.(db|db-wal|db-shm|sqlite|pem|key|p12|pfx|crt|log)$|^id_(rsa|ed25519)|\.db\.backup_|^\.DS_Store$|^\.npmrc$/i;
const DENIED_PATH = /^server\/data(\/|$)/;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_READ_CHARS = 60000;
const MAX_SEARCH_RESULTS = 60;
const MAX_LIST = 400;

export class RepoAccessError extends Error {}

const rel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

function isDenied(relPath) {
  const parts = relPath.split('/');
  if (parts.some(p => DENIED_SEGMENTS.has(p))) return true;
  if (DENIED_NAME.test(parts[parts.length - 1] || '')) return true;
  return DENIED_PATH.test(relPath);
}

/** Absolute path of an allowed repository file / folder, or a RepoAccessError. */
export function resolveRepoPath(input, { dir = false } = {}) {
  const raw = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').trim() || '.';
  const abs = path.resolve(REPO_ROOT, raw);
  if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + path.sep)) throw new RepoAccessError('Path di luar repository tidak diizinkan.');
  if (!fs.existsSync(abs)) throw new RepoAccessError(`Tidak ditemukan: ${raw}`);
  const real = fs.realpathSync(abs);
  if (real !== REPO_ROOT && !real.startsWith(REPO_ROOT + path.sep)) throw new RepoAccessError('Path di luar repository tidak diizinkan.');
  const r = rel(real);
  if (r && isDenied(r)) throw new RepoAccessError(`Akses ditolak: ${r} (file rahasia / data / hasil build tidak boleh dibaca agent).`);
  const stat = fs.statSync(real);
  if (dir && !stat.isDirectory()) throw new RepoAccessError(`${raw} bukan folder.`);
  if (!dir && !stat.isFile()) throw new RepoAccessError(`${raw} bukan file.`);
  return real;
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

function* walk(absDir) {
  let entries = [];
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(absDir, e.name);
    const r = rel(abs);
    if (isDenied(r) || e.isSymbolicLink()) continue;
    if (e.isDirectory()) yield* walk(abs);
    else if (e.isFile()) yield r;
  }
}

/** read_file: numbered lines (optionally a range), scrubbed. */
export function readFile(filePath, { startLine = 1, endLine = null } = {}) {
  const abs = resolveRepoPath(filePath);
  const size = fs.statSync(abs).size;
  if (size > MAX_FILE_BYTES) throw new RepoAccessError(`File terlalu besar (${Math.round(size / 1024)} KB). Baca per bagian dengan start_line / end_line setelah mencari dengan search_code.`);
  const buf = fs.readFileSync(abs);
  if (isBinary(buf)) throw new RepoAccessError('File biner tidak dapat dibaca.');
  const lines = buf.toString('utf8').split('\n');
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.min(lines.length, Number(endLine) || lines.length);
  let out = '';
  for (let i = start; i <= end; i++) {
    const line = `${i}\t${lines[i - 1]}\n`;
    if (out.length + line.length > MAX_READ_CHARS) {
      out += `… (dipotong di baris ${i - 1} dari ${lines.length}; lanjutkan dengan start_line=${i})\n`;
      break;
    }
    out += line;
  }
  return { path: rel(abs), totalLines: lines.length, content: scrubText(out, MAX_READ_CHARS + 500) };
}

/** search_code: case-insensitive text (or regex) search across allowed text files. */
export function searchCode(query, { pathPrefix = '', regex = false } = {}) {
  const q = String(query || '');
  if (q.trim().length < 2) throw new RepoAccessError('Kata kunci pencarian minimal 2 karakter.');
  let re;
  try {
    re = regex ? new RegExp(q, 'i') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  } catch (e) {
    throw new RepoAccessError('Pola regex tidak valid.');
  }
  const base = pathPrefix ? resolveRepoPath(pathPrefix, { dir: true }) : REPO_ROOT;
  const results = [];
  for (const file of walk(base)) {
    const abs = path.join(REPO_ROOT, file);
    let buf;
    try { if (fs.statSync(abs).size > MAX_FILE_BYTES) continue; buf = fs.readFileSync(abs); } catch (e) { continue; }
    if (isBinary(buf)) continue;
    const lines = buf.toString('utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        results.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        if (results.length >= MAX_SEARCH_RESULTS) return { results: results.map(r => scrubText(r, 400)), truncated: true };
      }
    }
  }
  return { results: results.map(r => scrubText(r, 400)), truncated: false };
}

/** list_files: allowed files under a folder, optionally filtered by a name fragment. */
export function listFiles(dir = '', { contains = '' } = {}) {
  const base = dir ? resolveRepoPath(dir, { dir: true }) : REPO_ROOT;
  const needle = String(contains || '').toLowerCase();
  const files = [];
  for (const f of walk(base)) {
    if (needle && !f.toLowerCase().includes(needle)) continue;
    files.push(f);
    if (files.length >= MAX_LIST) return { files, truncated: true };
  }
  return { files, truncated: false };
}
