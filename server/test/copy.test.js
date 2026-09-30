// Copies of canvas objects (AGENTS.md §26): client/src/utils/copyRules.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCopy, nextBoothCode, BOOTH_TENANT_FIELDS } from '../../client/src/utils/copyRules.js';

// Serialized Kotak as the editor saves it: purple 40 % fill, dashed green border, red text, partial text style,
// rotated, flipped, skewed, with a caption, hidden flag, lock and an anchor to a booth
const kotak = () => ({
  type: 'ShapeBox', version: '7.4.0', left: 150, top: 650, width: 30, height: 30, boxHeight: 30, angle: 15,
  flipX: true, flipY: false, skewX: 5, skewY: 0, opacity: 0.8, visible: true, text: 'Garyda', fontSize: 18,
  fontWeight: 'bold', fill: '#ef4444', textAlign: 'center', styles: [{ start: 0, end: 3, style: { fill: '#16a34a' } }],
  isVenueItem: true, isLocked: false,
  venueData: {
    id: 'el_shape_rect_1', type: 'shape_rect', lib: true, widthM: 1.5, heightM: 1.5, label: 'Garyda',
    caption: 'Kotak Garyda', showCaption: true, publicVisible: true, gridScale: 20,
    props: { fillColor: '#7c3aed', fillOpacity: 40, strokeColor: '#16a34a', strokeWidth: 4, strokeStyle: 'dashed', textColor: '#ef4444', fontSize: 18, bold: true },
    anchor: { boothId: 'b1', boothCode: 'A-01', dx: 1, dy: 2, dAngle: 0 }
  }
});

const withoutIdentity = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  delete c.left; delete c.top; delete c.id;
  if (c.venueData) { delete c.venueData.id; delete c.venueData.anchor; delete c.venueData.anchorOrphaned; delete c.venueData.connections; }
  return c;
};

test('salinan elemen = aslinya, kecuali ID dan posisi', () => {
  const original = kotak();
  const copy = prepareCopy(original, { dx: 20, dy: 20 });
  assert.deepEqual(withoutIdentity(copy), withoutIdentity(original));
  assert.equal(copy.left, 170);
  assert.equal(copy.top, 670);
  assert.notEqual(copy.venueData.id, original.venueData.id);
  // all style & size data kept, no template / default applied
  assert.equal(copy.type, 'ShapeBox');
  assert.equal(copy.width, 30);
  assert.equal(copy.venueData.widthM, 1.5);
  assert.deepEqual(copy.venueData.props, original.venueData.props);
  assert.deepEqual(copy.styles, original.styles);
  assert.equal(copy.angle, 15);
  assert.equal(copy.flipX, true);
  assert.equal(copy.skewX, 5);
  assert.equal(copy.venueData.caption, 'Kotak Garyda');
  // links to other objects are not copied
  assert.equal(copy.venueData.anchor, undefined);
});

test('salinan adalah objek terpisah (deep copy)', () => {
  const original = kotak();
  const copy = prepareCopy(original);
  copy.venueData.props.fillColor = '#000000';
  copy.styles[0].style.fill = '#000000';
  assert.equal(original.venueData.props.fillColor, '#7c3aed');
  assert.equal(original.styles[0].style.fill, '#16a34a');
});

test('booth: ukuran & pengaturan ikut, nomor baru, tenant & kontrak kosong', () => {
  const booth = {
    type: 'Group', left: 0, top: 0, width: 60, height: 40, angle: 90, isBooth: true,
    boothData: {
      id: 'booth_1', code: 'A-04', category: 'Premium', shape: 'rectangle', price: 12000000, widthM: 3, heightM: 2, gridScale: 20,
      cornerPct: 20, facilities: ['Listrik 2A'], status: 'sold', ownerName: 'Kopi Tes', brandCategory: 'F&B', exhibitorId: 'EXH-1',
      picName: 'Budi', email: 'budi@contoh.test', phone: '0812', discountAmount: 500000, discountReason: 'Promo'
    }
  };
  const used = new Set(['A-01', 'A-04', 'A-05']);
  const copy = prepareCopy(booth, { dx: 20, dy: 20, usedCodes: used });
  assert.equal(copy.boothData.code, 'A-06');
  assert.ok(used.has('A-06'));
  assert.notEqual(copy.boothData.id, 'booth_1');
  assert.equal(copy.boothData.status, 'available');
  assert.equal(copy.boothData.ownerName, '');
  for (const f of BOOTH_TENANT_FIELDS.filter(f => f !== 'ownerName')) assert.equal(copy.boothData[f], undefined, f);
  for (const k of ['category', 'shape', 'price', 'widthM', 'heightM', 'gridScale', 'cornerPct']) assert.equal(copy.boothData[k], booth.boothData[k], k);
  assert.deepEqual(copy.boothData.facilities, ['Listrik 2A']);
  assert.equal(copy.angle, 90);
  assert.equal(copy.width, 60);
});

test('Denah Operasional: booth tidak bisa disalin, salinan masuk lapisan operasional', () => {
  assert.equal(prepareCopy({ isBooth: true, boothData: { code: 'A-01' } }, { allowBooths: false }), null);
  // element from Denah Sales pasted into Denah Operasional: operational & internal
  const fromSales = prepareCopy(kotak(), { opsLayer: true });
  assert.equal(fromSales.isOpsItem, true);
  assert.equal(fromSales.venueData.publicVisible, false);
  // operational element copied inside Denah Operasional keeps its visibility
  const opsItem = { ...kotak(), isOpsItem: true };
  assert.equal(prepareCopy(opsItem, { opsLayer: true }).venueData.publicVisible, true);
  // operational element pasted into Denah Sales becomes a sales element
  assert.equal(prepareCopy(opsItem, { opsLayer: false }).isOpsItem, undefined);
});

test('nomor booth berikutnya mengikuti awalan & jumlah digit, melewati yang sudah dipakai', () => {
  assert.equal(nextBoothCode('A-04', new Set(['A-05'])), 'A-06');
  assert.equal(nextBoothCode('VIP-9', new Set()), 'VIP-10');
  assert.equal(nextBoothCode('B-001', new Set(['b-002'])), 'B-003');
  assert.equal(nextBoothCode('A-04+A-05', new Set(['A-05'])), 'A-06');
  assert.equal(nextBoothCode('STAGE', new Set()), 'STAGE-01');
});
