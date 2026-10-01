import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db, { dataDir } from '../db.js';

// Uploaded images (blueprint / floorplan background, invoice logo, images placed on the canvas) are FILES in
// DATA_DIR/uploads (on Railway: the Volume). The database and the browser only keep their URL, never base64:
// a base64 blueprint made every floorplan save megabytes large and once filled the browser storage.
//   name = sha256 of the content + extension, so the same image is stored once and the URL never changes
//   URL  = /api/uploads/<name> (relative: it survives a domain change)
export const uploadsDir = path.join(dataDir, 'uploads');
export const UPLOAD_URL_PREFIX = '/api/uploads/';
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
export const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
export const UPLOAD_NAME_RE = /^[0-9a-f]{64}\.(png|jpg|webp|gif|svg)$/;

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/;
// Inside serialized JSON (canvas, blueprint, settings): every embedded base64 image
const EMBEDDED_RE = /data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+/g;
// A URL saved with its domain (the browser resolves img.src): keep only the path
const ABSOLUTE_UPLOAD_RE = /https?:\/\/[^/"'\\\s]+\/api\/uploads\/(?=[0-9a-f]{64}\.)/g;
// Small inline images (icons) stay inline
const MIN_EMBEDDED_CHARS = 4096;

/** Store one base64 data URL as a file; returns its URL, or null when it is not a supported image. */
export function saveDataUrl(dataUrl) {
  const m = DATA_URL_RE.exec(String(dataUrl || ''));
  if (!m) return null;
  const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) return null;
  const name = `${crypto.createHash('sha256').update(buffer).digest('hex')}.${EXT_BY_MIME[m[1]]}`;
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, file);
  }
  return `${UPLOAD_URL_PREFIX}${name}`;
}

/** In a JSON string: embedded base64 images become upload URLs, absolute upload URLs become relative. */
export function externalizeImagesInJson(json) {
  if (typeof json !== 'string' || !json) return json;
  let out = json;
  if (out.includes(';base64,')) {
    out = out.replace(EMBEDDED_RE, (match) => (match.length < MIN_EMBEDDED_CHARS ? match : (saveDataUrl(match) || match)));
  }
  if (out.includes('/api/uploads/')) out = out.replace(ABSOLUTE_UPLOAD_RE, UPLOAD_URL_PREFIX);
  return out;
}

/** The same for a value that is about to be stored (object / array / string). `skipKeys`: properties left as they are. */
export function externalizeImages(value, { skipKeys = null } = {}) {
  if (value == null) return value;
  if (typeof value === 'string') return externalizeImagesInJson(value);
  if (typeof value !== 'object') return value;
  if (!skipKeys) return JSON.parse(externalizeImagesInJson(JSON.stringify(value)));
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) out[k] = skipKeys.test(k) ? v : externalizeImages(v, { skipKeys });
  return out;
}

// The signature image is never public (AGENTS.md §20): it stays inside the invoice configuration
export const CONFIG_INLINE_KEYS = /signature/i;

// Rows that still hold base64 images (or upload URLs saved with a domain), with their rewritten value
function pendingImageChanges() {
  const targets = [
    { table: 'floorplans', columns: ['canvas_fabric_json', 'blueprint_json', 'metadata_json'] },
    { table: 'preset_layouts', columns: ['canvas_fabric_json', 'metadata_json'] },
    { table: 'ops_elements', columns: ['object_json'] }
  ];
  const changes = [];
  for (const t of targets) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${t.table})`).all().map(c => c.name));
    for (const column of t.columns.filter(c => existing.has(c))) {
      const rows = db.prepare(`SELECT rowid AS rid FROM ${t.table} WHERE ${column} LIKE '%;base64,%' OR ${column} LIKE '%://%/api/uploads/%'`).all();
      for (const { rid } of rows) {
        const before = db.prepare(`SELECT ${column} AS v FROM ${t.table} WHERE rowid = ?`).get(rid)?.v;
        const after = externalizeImagesInJson(before);
        if (after !== before) changes.push({ sql: `UPDATE ${t.table} SET ${column} = ? WHERE rowid = ?`, params: [after, rid], saved: before.length - after.length });
      }
    }
  }
  // Invoice configuration: logo etc. (never the signature)
  for (const row of db.prepare("SELECT id, config_json FROM invoice_settings WHERE config_json LIKE '%;base64,%'").all()) {
    try {
      const after = JSON.stringify(externalizeImages(JSON.parse(row.config_json), { skipKeys: CONFIG_INLINE_KEYS }));
      if (after !== row.config_json) changes.push({ sql: 'UPDATE invoice_settings SET config_json = ? WHERE id = ?', params: [after, row.id], saved: row.config_json.length - after.length });
    } catch (e) { /* unreadable configuration: left as it is */ }
  }
  return changes;
}

/**
 * One-time move of images already stored as base64 in the database into files (runs at every start; after the first
 * run nothing is left to move). `backup()` must return { ok } and runs only when there is something to move; the rows
 * are read again after it and rewritten in one transaction. Returns { rows, savedBytes }.
 */
export async function migrateEmbeddedImages({ backup } = {}) {
  if (!pendingImageChanges().length) return { rows: 0, savedBytes: 0 };
  if (backup) {
    const result = await backup();
    if (!result?.ok) return { rows: 0, savedBytes: 0, skipped: 'backup gagal' };
  }
  let changes = [];
  db.transaction(() => {
    changes = pendingImageChanges();
    changes.forEach(c => db.prepare(c.sql).run(...c.params));
  })();
  return { rows: changes.length, savedBytes: changes.reduce((acc, c) => acc + c.saved, 0) };
}
