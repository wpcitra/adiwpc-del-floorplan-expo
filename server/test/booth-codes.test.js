// Booth numbers are unique per floorplan (AGENTS.md §30): shared/boothCodes.js + POST /floorplan/save
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject } from './helpers.js';
import { boothCodeTaken, boothCodeTokens, duplicateBoothCodes } from '../../shared/boothCodes.js';
import { nextBoothCode } from '../../client/src/utils/copyRules.js';

let s;
before(async () => { s = await startServer(); });
after(async () => { await s?.stop(); });

const save = (id, codes) => s.api('POST', '/floorplan/save', {
  id, eventId: 'EVT-KODE', title: 'Nomor Booth', status: 'draft',
  fabricJson: { version: '7.0.0', objects: codes.map((code, i) => boothObject(code, { left: i * 80, top: 0 })) }
}, { as: 'superadmin' });

test('nomor sama: huruf besar / kecil dan spasi tidak membedakan, nomor kosong diabaikan', () => {
  assert.deepEqual(duplicateBoothCodes(['A-01', 'a-01 ', 'A-02', '', '']), ['A-01']);
  assert.deepEqual(duplicateBoothCodes(['A-1', 'A-10', 'A-11']), []);
  assert.deepEqual(duplicateBoothCodes(['B-02', 'A-10', 'A-2', 'b-02', 'A-10', 'A-2']), ['A-2', 'A-10', 'B-02']);
});

test('nomor gabungan "A-01+A-02" memakai kedua nomornya', () => {
  assert.deepEqual(boothCodeTokens(' a-01 + A-02 '), ['A-01', 'A-02']);
  assert.equal(boothCodeTaken('A-02', ['A-01+A-02']), true);
  assert.equal(boothCodeTaken('A-03+A-01', ['A-01', 'B-01']), true);
  assert.equal(boothCodeTaken('A-03', ['A-01+A-02']), false);
  assert.equal(boothCodeTaken('', ['A-01']), false);
  assert.deepEqual(duplicateBoothCodes(['A-01+A-02', 'A-02']), ['A-02']);
});

test('nomor booth baru melompati nomor yang sudah dipakai', () => {
  assert.equal(nextBoothCode('A-02', ['A-01', 'A-02', 'A-03', 'a-04']), 'A-05');
  assert.equal(nextBoothCode('A-00', []), 'A-01');
});

test('simpan denah dengan nomor booth ganda ditolak dan tidak mengubah apa pun', async () => {
  const ok = await save('FP-KODE', ['K-01', 'K-02']);
  assert.equal(ok.status, 200);

  const dup = await save('FP-KODE', ['K-01', 'K-02', 'k-02']);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE_BOOTH_CODE');
  assert.deepEqual(dup.body.duplicates, ['K-02']);
  assert.match(dup.body.error, /K-02/);

  const merged = await save('FP-KODE', ['K-01+K-02', 'K-02']);
  assert.equal(merged.status, 409);

  const fp = await s.api('GET', '/floorplan/FP-KODE', undefined, { as: 'superadmin' });
  assert.deepEqual(fp.body.floorplan.booths.map(b => b.code).sort(), ['K-01', 'K-02']);
});

test('nomor yang sama di denah lain tetap boleh', async () => {
  const other = await save('FP-KODE-2', ['K-01', 'K-02']);
  assert.equal(other.status, 200);
});
