// Live Floorplan cepat (AGENTS.md §41): big PNG uploads are also served as lossless WebP to browsers that accept it,
// and the built website files are cached by the browser (hashed /assets/* immutable, index.html revalidated).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { startServer } from './helpers.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s.stop(); });

const hasCwebp = (() => { try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

function testPng(w = 700, h = 700) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3; const line = x % 50 === 0 || y % 50 === 0;
    raw[o] = line ? 40 : (x * y) % 251; raw[o + 1] = line ? 40 : (x * 7 + y * 3) % 253; raw[o + 2] = line ? 40 : (x ^ y) & 255; } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG besar: browser yang mendukung WebP menerima salinan WebP lossless yang lebih kecil; yang lain tetap PNG', { skip: !hasCwebp && 'cwebp tidak terpasang' }, async () => {
  const png = testPng();
  const up = await s.api('POST', '/uploads', { dataUrl: `data:image/png;base64,${png.toString('base64')}` }, { as: 'superadmin' });
  assert.equal(up.status, 200, up.text);
  const url = `${s.base.replace(/\/api$/, '')}${up.body.url}`;

  const plain = await fetch(url);
  assert.equal(plain.headers.get('content-type'), 'image/png', 'tanpa dukungan WebP: PNG asli');
  assert.equal(Buffer.from(await plain.arrayBuffer()).length, png.length);

  let webp = null;
  for (let i = 0; i < 40 && !webp; i++) { // the copy is made in the background on the first request
    const r = await fetch(url, { headers: { Accept: 'image/avif,image/webp,*/*' } });
    if (r.headers.get('content-type') === 'image/webp') webp = Buffer.from(await r.arrayBuffer());
    else await new Promise(res => setTimeout(res, 250));
  }
  assert.ok(webp, 'salinan WebP dikirim');
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
  assert.ok(webp.length < png.length / 2, `WebP ${webp.length} byte vs PNG ${png.length} byte`);
  const r = await fetch(url, { headers: { Accept: 'image/webp' } });
  assert.match(r.headers.get('vary') || '', /Accept/, 'cache membedakan PNG dan WebP');
});

test('file website: /assets/* di-cache permanen, index.html selalu dicek ulang', { skip: !fs.existsSync(path.join(clientDist, 'index.html')) && 'client/dist belum dibangun' }, async () => {
  const root = s.base.replace(/\/api$/, '');
  const page = await fetch(`${root}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('cache-control') || '', /no-cache/);
  const asset = (await page.text()).match(/\/assets\/[^"]+\.js/)?.[0];
  assert.ok(asset, 'halaman memuat file /assets');
  const a = await fetch(`${root}${asset}`);
  assert.match(a.headers.get('cache-control') || '', /immutable/);
  assert.match((await fetch(`${root}/live/apa-saja`)).headers.get('cache-control') || '', /no-cache/, 'rute aplikasi = index.html');
});
