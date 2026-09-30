import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Version shown in /api/health and attached to error reports: package version + git commit (when in a repository)
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
let cached = null;

export function appVersion() {
  if (cached) return cached;
  let pkg = '0.0.0';
  try { pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8')).version || pkg; } catch (e) {}
  let commit = process.env.APP_COMMIT || '';
  if (!commit) {
    try { commit = execSync('git rev-parse --short HEAD', { cwd: serverDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  }
  cached = commit ? `${pkg}+${commit}` : pkg;
  return cached;
}
