// Snap ke Booth / Snap ke Elemen (AGENTS.md §19, §25): pure snap math of client/src/utils/boothSnap.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSnap, computeGuides, limitStepToTouch, snapLineEnds, snapPoint, snapGeometry, isPointElement, elementSnapTargets
} from '../../client/src/utils/boothSnap.js';

const box = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
const center = (b) => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 });
const booth = (l, t, w, h) => { const b = box(l, t, w, h); return { box: b, center: center(b), isBooth: true }; };
const element = (l, t, w, h) => { const b = box(l, t, w, h); return { box: b, center: center(b), isBooth: false }; };
const THR = 9;

test('snap booth tidak berubah: tanpa mode elemen, elemen (dinding) hanya untuk menempel, bukan sejajar', () => {
  // wall far to the right, same top: booth mode must NOT align with it
  const wall = element(300, 0, 10, 100);
  assert.deepEqual(computeSnap(box(0, 4, 60, 60), [wall], THR).dy, null);
  // booth next to a booth: touch (3 px gap) and align tops (4 px)
  const res = computeSnap(box(63, 4, 60, 60), [booth(0, 0, 60, 60)], THR);
  assert.equal(res.dx, -3);
  assert.equal(res.dy, -4);
  // guides for booths: no centre / equal-spacing guides without the elements option
  const g = computeGuides(box(60, 0, 60, 60), [booth(0, 0, 60, 60)], { gridScale: 20 });
  assert.ok(g.lines.every(l => l.kind === 'touch' || l.kind === 'align'));
});

test('elemen sejajar ujung dengan elemen lain (jarak jauh)', () => {
  const zone = element(0, 100, 80, 40);
  const r = computeSnap(box(300, 105, 40, 20), [zone], THR, { elements: true });
  assert.equal(r.dy, -5);
  assert.equal(r.kindY, 'align');
});

test('sisi / sudut menang atas tengah; tengah dipakai bila tidak ada sisi', () => {
  // right side 4 px from the booth's left side, centres 3 px apart vertically -> x: touch, y: centre
  const b = booth(100, 0, 60, 60);
  const r = computeSnap(box(56, 23, 40, 20), [b], THR, { elements: true });
  assert.equal(r.dx, 4);
  assert.equal(r.kindX, 'touch');
  assert.equal(r.kindY, 'center');
  assert.equal(r.dy, 30 - 33);
  // small point (CCTV) inside a booth: centre to centre on both axes
  const p = computeSnap({ l: 133, r: 133, t: 26, b: 26 }, [b], THR, { elements: true, center: { x: 133, y: 26 } });
  assert.equal(p.dx, -3);
  assert.equal(p.dy, 4);
});

test('jarak sama rata: di antara dua elemen, dan sama dengan jarak yang sudah ada', () => {
  const a = element(0, 0, 20, 20);
  const b = element(80, 0, 20, 20);
  // between A and B: 13 px left gap, 27 px right gap -> moves 7 px, both gaps 20
  const mid = computeSnap(box(33, 0, 20, 20), [a, b], THR, { elements: true });
  assert.equal(mid.kindX, 'equal');
  assert.equal(mid.dx, 7);
  const guides = computeGuides(box(40, 0, 20, 20), [a, b], { gridScale: 20, elements: true });
  const equal = guides.lines.filter(l => l.kind === 'equal');
  assert.equal(equal.length, 2);
  assert.ok(equal.every(l => l.text === '1 m'));
  // a third element after B: same 20 px gap as A-B
  const c = computeSnap(box(121, 0, 20, 20), [a, element(40, 0, 20, 20)].concat([element(80, 0, 20, 20)]), THR, { elements: true });
  assert.equal(c.kindX, 'equal');
  assert.equal(c.dx, -1);
});

test('ujung garis menempel ke ujung garis lain / sudut booth', () => {
  const t = [{ ...booth(100, 100, 60, 60), points: [{ x: 100, y: 100 }, { x: 160, y: 100 }] }];
  const s = snapLineEnds([{ x: 5, y: 50 }, { x: 96, y: 103 }], t, THR);
  assert.deepEqual([s.dx, s.dy], [4, -3]);
  assert.equal(snapLineEnds([{ x: 0, y: 0 }], t, THR), null);
  assert.deepEqual(snapPoint({ x: 158, y: 97 }, t, THR), { x: 160, y: 100 });
});

test('tombol panah berhenti tepat saat elemen menempel, juga untuk elemen titik', () => {
  const b = booth(100, 0, 60, 60);
  assert.equal(limitStepToTouch({ l: 97, r: 97, t: 30, b: 30 }, [b], 'right', 20, { all: true }), 3);
  // booth mode ignores elements (unchanged)
  assert.equal(limitStepToTouch(box(0, 0, 60, 60), [element(62, 0, 20, 60)], 'right', 20), 20);
  assert.equal(limitStepToTouch(box(0, 0, 60, 60), [element(62, 0, 20, 60)], 'right', 20, { all: true }), 2);
});

// Minimal Fabric-like objects for the geometry helpers
const coords = (l, t, w, h) => ({ tl: { x: l, y: t }, tr: { x: l + w, y: t }, br: { x: l + w, y: t + h }, bl: { x: l, y: t + h } });
const fake = (props, c) => ({ visible: true, calcACoords: () => c, ...props });

test('geometri: CCTV & titik listrik memakai titik tengah, garis punya dua ujung, booth jadi patokan', () => {
  // CCTV: the group includes a wide viewing cone, the body (hit area) is 16 x 16 at (100, 100)
  // (group centred on (150, 110); the hit area is its first child, 16 x 16, offset (-42, -2) inside the group)
  const hit = { width: 16, height: 16, calcOwnMatrix: () => [1, 0, 0, 1, -42, -2] };
  const cctv = fake({ isVenueItem: true, venueData: { lib: true, type: 'cctv', widthM: 0.8, heightM: 0.8 }, getObjects: () => [hit], calcTransformMatrix: () => [1, 0, 0, 1, 150, 110] }, coords(100, 60, 200, 100));
  assert.ok(isPointElement(cctv));
  assert.deepEqual(snapGeometry(cctv).box, { l: 108, r: 108, t: 108, b: 108 });
  // wall: 200 x 6 -> ends are the middles of the short sides
  const wall = fake({ isVenueItem: true, venueData: { type: 'wall' } }, coords(0, 0, 200, 6));
  assert.deepEqual(snapGeometry(wall).ends, [{ x: 0, y: 3 }, { x: 200, y: 3 }]);
  // shapes are never "points", even when small
  const shape = fake({ type: 'ShapeBox', isVenueItem: true, venueData: { lib: true, type: 'shape_ellipse', widthM: 0.5, heightM: 0.5 } }, coords(0, 0, 10, 10));
  assert.equal(isPointElement(shape), false);
  // targets: moving element excluded, hidden excluded, booths only when Snap ke Booth is on
  const b = fake({ isBooth: true }, coords(300, 0, 60, 60));
  const hidden = fake({ isVenueItem: true, visible: false, venueData: { type: 'stage' } }, coords(0, 0, 10, 10));
  const canvas = { getObjects: () => [cctv, wall, shape, b, hidden] };
  const names = (list) => list.map(t => (t.isBooth ? 'booth' : t.obj.venueData.type)).sort();
  assert.deepEqual(names(elementSnapTargets(canvas, shape, { booths: true, elements: true })), ['booth', 'cctv', 'wall']);
  assert.deepEqual(names(elementSnapTargets(canvas, shape, { booths: false, elements: true })), ['cctv', 'wall']);
  assert.deepEqual(names(elementSnapTargets(canvas, shape, { booths: true, elements: false })), ['booth']);
});
