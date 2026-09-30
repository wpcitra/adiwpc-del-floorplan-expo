// Auto-merge adjacency rules (AGENTS.md §18), pure module shared by client and server
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMergeGroups, mergeCodeLabel } from '../../shared/boothGroups.js';

// 3x3 m booth at (x, y) in pixels, 20 px per meter
const square = (x, y, size = 60) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
const booth = (code, x, y, extra = {}) => ({ key: code, code, exhibitorId: 'EXH-1', status: 'reserved', poly: square(x, y), ...extra });

test('booth berdampingan milik exhibitor yang sama digabung', () => {
  const { groups } = computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 60, 0), booth('A-03', 120, 0)]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].codes, ['A-01', 'A-02', 'A-03']);
});

test('celah kecil (≤ 0,1 m) masih dihitung menempel, celah lorong tidak', () => {
  assert.equal(computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 62, 0)]).groups.length, 1);
  assert.equal(computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 100, 0)]).groups.length, 0);
});

test('hanya bersentuhan di sudut tidak digabung', () => {
  assert.equal(computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 60, 60)]).groups.length, 0);
});

test('exhibitor berbeda atau booth Available tidak digabung', () => {
  assert.equal(computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 60, 0, { exhibitorId: 'EXH-2' })]).groups.length, 0);
  assert.equal(computeMergeGroups([booth('A-01', 0, 0), booth('A-02', 60, 0, { status: 'available' })]).groups.length, 0);
});

test('status campuran menjadi partial, label kode tersusun alami', () => {
  const { groups } = computeMergeGroups([booth('A-10', 0, 0, { status: 'sold' }), booth('A-9', 60, 0)]);
  assert.equal(groups[0].status, 'partial');
  assert.equal(mergeCodeLabel(groups[0].codes), 'A-9+A-10');
});
