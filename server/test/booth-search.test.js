// "Cari tenant / booth" (AGENTS.md §36): client/src/utils/boothSearch.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchBooths } from '../../client/src/utils/boothSearch.js';

const booth = (code, ownerName = '') => ({ boothData: { code, ownerName } });
const booths = [booth('A-10', 'Kopi Nusantara'), booth('A-01', 'Roti Maros'), booth('A-02'), booth('B-01+B-02', 'Batik Sejahtera'), booth('119', 'sfsd'), { venueData: { type: 'stage' } }];
const codes = (q) => searchBooths(booths, q).map(o => o.boothData.code);

test('nomor booth: persis dulu, lalu awalan; "#" dan huruf besar/kecil diabaikan', () => {
  assert.deepEqual(codes('a-01'), ['A-01']);
  assert.deepEqual(codes('#A-0'), ['A-01', 'A-02']);
  assert.deepEqual(codes('A-1'), ['A-10'], 'A-1 bukan A-01');
  assert.deepEqual(codes('B-02'), ['B-01+B-02'], 'booth gabungan ditemukan lewat salah satu nomornya');
});

test('nama tenant: awal kata lebih dulu dari potongan di tengah', () => {
  assert.deepEqual(codes('maros'), ['A-01']);
  assert.deepEqual(codes('  KOPI  '), ['A-10']);
  assert.deepEqual(codes('s').slice(0, 2), ['119', 'B-01+B-02'], 'awal kata: sfsd, Sejahtera');
  assert.deepEqual(codes('ati'), ['B-01+B-02'], 'potongan di tengah kata');
});

test('tanpa kata kunci atau tanpa hasil: kosong; elemen bukan booth diabaikan', () => {
  assert.deepEqual(codes(''), []);
  assert.deepEqual(codes('   '), []);
  assert.deepEqual(codes('tidak ada'), []);
  assert.equal(searchBooths(booths, 'a', 2).length, 2);
});
