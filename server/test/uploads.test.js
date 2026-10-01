// Gambar disimpan sebagai file, database hanya menyimpan URL (AGENTS.md §28)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { startServer, boothObject } from './helpers.js';

// a real 1x1 PNG, repeated in a comment chunk so it is larger than the "small inline icon" limit
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const bigPng = () => `data:image/png;base64,${Buffer.concat([Buffer.from(PNG_1PX, 'base64'), Buffer.alloc(6000, 7)]).toString('base64')}`;
const FP = 'FP-IMG';
let s;
before(async () => { s = await startServer(); });
after(async () => { await s.stop(); });

const blueprintObject = (src) => ({ type: 'Image', left: 0, top: 0, width: 10, height: 10, src, isBackgroundBlueprint: true, blueprintData: { url: src, fileName: 'denah.png' } });
const saveBody = (src) => ({
  id: FP, eventId: `EVT-${FP}`, title: 'Tes Gambar', status: 'draft',
  fabricJson: { version: '7.0.0', objects: [blueprintObject(src), boothObject('A-01', { left: 100, top: 100 })] },
  blueprint: { url: src, fileName: 'denah.png' }
});

test('upload: file tersimpan, URL relatif, bisa dibuka publik; bukan gambar / tanpa login ditolak', async () => {
  const up = await s.api('POST', '/uploads', { dataUrl: bigPng() }, { as: 'superadmin' });
  assert.equal(up.status, 200, up.text);
  assert.match(up.body.url, /^\/api\/uploads\/[0-9a-f]{64}\.png$/);
  const again = await s.api('POST', '/uploads', { dataUrl: bigPng() }, { as: 'operations' });
  assert.equal(again.body.url, up.body.url, 'gambar yang sama = file yang sama');
  const res = await fetch(s.base.replace(/\/api$/, '') + up.body.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /immutable/);
  assert.ok(fs.existsSync(path.join(s.dataDir, 'uploads', up.body.url.split('/').pop())));

  assert.equal((await s.api('POST', '/uploads', { dataUrl: bigPng() })).status, 401);
  assert.equal((await s.api('POST', '/uploads', { dataUrl: bigPng() }, { as: 'sales' })).status, 403);
  assert.equal((await s.api('POST', '/uploads', { dataUrl: 'data:text/html;base64,PGI+' }, { as: 'superadmin' })).status, 400);
  assert.equal((await fetch(`${s.base}/uploads/..%2Ffloorplan.db`)).status, 404);
  assert.equal((await fetch(`${s.base}/uploads/${'a'.repeat(64)}.png`)).status, 404);
});

test('simpan denah: base64 di kanvas / blueprint menjadi URL, booth tetap utuh', async () => {
  const save = await s.api('POST', '/floorplan/save', saveBody(bigPng()), { as: 'superadmin' });
  assert.equal(save.status, 200, save.text);
  const fp = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  const img = fp.canvas_fabric_json.objects.find(o => o.isBackgroundBlueprint);
  assert.match(img.src, /^\/api\/uploads\/[0-9a-f]{64}\.png$/);
  assert.equal(img.blueprintData.url, img.src);
  assert.equal(fp.blueprint.url, img.src);
  assert.equal(JSON.stringify(fp).includes(';base64,'), false, 'tidak ada base64 tersisa');
  assert.equal(fp.booths.length, 1);

  // a URL saved with its domain (img.src in the browser) is stored without the domain
  const abs = await s.api('POST', '/floorplan/save', saveBody(`https://contoh-lama.up.railway.app${img.src}`), { as: 'superadmin' });
  assert.equal(abs.status, 200, abs.text);
  const fp2 = (await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
  assert.equal(fp2.canvas_fabric_json.objects.find(o => o.isBackgroundBlueprint).src, img.src);
});

test('logo invoice menjadi URL, tanda tangan tetap di konfigurasi dan tidak pernah publik', async () => {
  const cfg = await s.api('POST', '/invoices/config', { config: { logoUrl: bigPng(), signatureImageUrl: bigPng() } }, { as: 'superadmin' });
  assert.equal(cfg.status, 200, cfg.text);
  const staff = (await s.api('GET', '/invoices/config', undefined, { as: 'finance' })).body.config;
  assert.match(staff.logoUrl, /^\/api\/uploads\//);
  assert.match(staff.signatureImageUrl, /^data:image\/png;base64,/);
  const visitor = (await s.api('GET', '/invoices/config')).body.config;
  assert.equal(JSON.stringify(visitor).includes(';base64,'), false);
});

test('migrasi saat start: base64 lama di database dipindahkan ke file sekali saja', async () => {
  // put base64 straight into the stopped server's database, as older versions stored it
  const dataDir = s.dataDir;
  const s2 = await startServer({}, {
    prepare: (dir) => {
      // WAL mode: the latest writes live in the -wal file
      for (const f of ['floorplan.db', 'floorplan.db-wal', 'floorplan.db-shm']) {
        if (fs.existsSync(path.join(dataDir, f))) fs.copyFileSync(path.join(dataDir, f), path.join(dir, f));
      }
      const db = new Database(path.join(dir, 'floorplan.db'));
      const row = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(FP);
      const old = row.canvas_fabric_json.replace(/\/api\/uploads\/[0-9a-f]{64}\.png/g, bigPng());
      assert.ok(old.includes(';base64,'));
      db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, blueprint_json = ? WHERE id = ?').run(old, JSON.stringify({ url: bigPng() }), FP);
      db.close();
    }
  });
  try {
    let fp;
    for (let i = 0; i < 30; i++) {
      fp = (await s2.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' })).body.floorplan;
      if (!JSON.stringify(fp).includes(';base64,')) break;
      await new Promise(r => setTimeout(r, 200));
    }
    assert.equal(JSON.stringify(fp).includes(';base64,'), false, 'base64 lama sudah dipindahkan');
    const src = fp.canvas_fabric_json.objects.find(o => o.isBackgroundBlueprint).src;
    assert.match(src, /^\/api\/uploads\//);
    assert.equal(fp.blueprint.url, src);
    assert.equal((await fetch(s2.base.replace(/\/api$/, '') + src)).status, 200);
    assert.match(s2.output(), /gambar base64 dipindahkan ke file/);
  } finally { await s2.stop(); }
});
