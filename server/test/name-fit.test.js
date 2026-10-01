// Tenant name inside a booth (client/src/utils/boothNameFit.js): one rule for single and merged booths.
// Without a browser canvas the widths are estimated (0.6 x font size per character), which is enough for the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTenantName } from '../../client/src/utils/boothNameFit.js';

const screenAngle = (fit, frameAngle) => { let a = (((frameAngle + fit.localAngle) % 360) + 360) % 360; if (a >= 180) a -= 360; return a; };

test('booth tinggi-sempit: nama satu kata ditulis vertikal (bawah ke atas) dan lebih besar', () => {
  const fit = fitTenantName('BRELONNNA', 52, 140, { maxSize: 25, minSize: 5 });
  assert.equal(fit.vertical, true);
  assert.equal(fit.localAngle, -90);
  assert.deepEqual(fit.lines, ['BRELONNNA'], 'satu kata tidak dipotong');
  const horizontal = fitTenantName('BRELONNNA', 52, 140, { maxSize: 25, minSize: 5, direction: 'horizontal' });
  assert.ok(fit.size > horizontal.size * 1.1);
});

test('booth persegi / lebar: horizontal; selisih di bawah 10% tetap horizontal', () => {
  assert.equal(fitTenantName('BSI', 52, 30, { maxSize: 25, minSize: 5 }).vertical, false);
  assert.equal(fitTenantName('Kopi Nusantara', 150, 30, { maxSize: 25, minSize: 5 }).vertical, false);
  // 50 x 54: vertical is only ~8 % larger -> horizontal
  const near = fitTenantName('ABCDEFGHIJ', 50, 54, { maxSize: 100, minSize: 1 });
  assert.equal(near.vertical, false);
});

test('nama beberapa kata boleh menjadi 2 baris bila hurufnya lebih besar', () => {
  const fit = fitTenantName('Roti Maros', 52, 100, { maxSize: 25, minSize: 5 });
  assert.deepEqual(fit.lines, ['Roti', 'Maros']);
  assert.equal(fit.vertical, true);
});

test('booth diputar: arah dihitung dari tampilan layar, tidak pernah terbalik / atas ke bawah', () => {
  for (const frameAngle of [0, 90, 180, 270, 45, 135]) {
    for (const direction of ['auto', 'horizontal', 'vertical']) {
      for (const [w, h] of [[52, 140], [140, 52], [52, 52]]) {
        const fit = fitTenantName('BRELONNNA', w, h, { frameAngle, direction, maxSize: 25, minSize: 5 });
        const a = screenAngle(fit, frameAngle);
        assert.ok(a >= -90.001 && a < 90, `sudut layar ${a} (frame ${frameAngle}, ${direction}, ${w}x${h})`);
      }
    }
  }
  // tall booth rotated 90 deg looks wide on the screen: the name is horizontal there
  const rotated = fitTenantName('BRELONNNA', 52, 140, { frameAngle: 90, maxSize: 25, minSize: 5 });
  assert.equal(rotated.vertical, false);
  assert.equal(screenAngle(rotated, 90), 0);
});

test('"Arah Nama Tenant" manual hanya mengatur arah; ukuran tetap otomatis', () => {
  const v = fitTenantName('BSI', 52, 30, { direction: 'vertical', maxSize: 25, minSize: 5 });
  assert.equal(v.vertical, true);
  assert.ok(v.size <= 25 && v.size >= 5);
});

test('nama yang tidak muat di ukuran minimum dipotong dengan "…"', () => {
  const fit = fitTenantName('PT Sangat Panjang Sekali Namanya Indonesia Raya', 52, 28, { maxSize: 25, minSize: 5 });
  assert.equal(fit.size, 5);
  assert.equal(fit.truncated, true);
  assert.ok(fit.lines.every(l => l.length < 30) && fit.lines.some(l => l.endsWith('…')));
  assert.equal(fitTenantName('', 52, 28), null);
});
