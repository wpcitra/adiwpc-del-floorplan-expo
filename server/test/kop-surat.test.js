// Kop surat (AGENTS.md §42): the letterhead of Desain Layout Invoice is stored as a file (the layout keeps its URL)
// and is part of the public configuration (the registrant's PDF shows it too).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s.stop(); });

import crypto from 'crypto';
import zlib from 'zlib';

// A real PNG of a few KB (tiny inline images under ~3 KB stay inline by design, a letterhead never is that small)
function noisePng(w = 64, h = 64) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) crypto.randomBytes(w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = table[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = `data:image/png;base64,${noisePng().toString('base64')}`;

test('kop surat tersimpan sebagai file dan ikut di konfigurasi publik', async () => {
  const saved = await s.api('POST', '/invoices/config', { config: { letterheadUrl: PNG } }, { as: 'finance' });
  assert.equal(saved.status, 200, saved.text);

  const staff = (await s.api('GET', '/invoices/config', undefined, { as: 'finance' })).body.config;
  assert.match(staff.letterheadUrl, /^\/api\/uploads\/[0-9a-f]{64}\.png$/, 'gambar disimpan sebagai file, bukan base64');

  const img = await fetch(`${s.base.replace(/\/api$/, '')}${staff.letterheadUrl}`);
  assert.equal(img.status, 200);

  const pub = (await s.api('GET', '/invoices/config')).body.config;
  assert.equal(pub.letterheadUrl, staff.letterheadUrl, 'PDF pendaftar online juga memakai kop');
  assert.equal(pub.signatureImageUrl, '', 'tanda tangan tetap tidak publik');

  // Removing it
  assert.equal((await s.api('POST', '/invoices/config', { config: { letterheadUrl: '' } }, { as: 'finance' })).status, 200);
  assert.equal((await s.api('GET', '/invoices/config', undefined, { as: 'finance' })).body.config.letterheadUrl, '');
});
