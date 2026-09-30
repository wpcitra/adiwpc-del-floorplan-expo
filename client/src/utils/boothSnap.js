// Snap sesama booth (Floorplan Studio / Denah Sales). Everything works on the booth's real geometry (its
// rectangle: sides & square corners, after rotation), never on the rounded drawing, so "Sudut Booth" has no effect.
//
//   touch   a side of the moving box lands on the opposite side of another box (right -> left, top -> bottom...),
//           only when the two boxes face each other (their spans overlap or nearly overlap)
//   align   a side lines up with the same side of another box anywhere in the row / column ("sejajar")
// X and Y are solved independently: touch-X + touch-Y = corner to corner, touch-X + align-Y = rata sejajar ujung.

export const SNAP_SCREEN_PX = 9;          // snap threshold in screen pixels (divided by the zoom)
export const SNAP_ROUND_M = 0.01;         // positions are stored on a 0,01 m step
const WALL_TYPES = ['wall', 'wall_line', 'pillar', 'pilar_persegi'];

export function boxOf(obj) {
  const c = typeof obj.calcACoords === 'function' ? obj.calcACoords() : null;
  const pts = c ? [c.tl, c.tr, c.br, c.bl] : obj.getCoords();
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

const isSelection = (obj) => (obj?.type || '').toLowerCase() === 'activeselection';
export const movingMembers = (target) => (isSelection(target) ? target.getObjects() : [target]);
export const containsBooth = (target) => movingMembers(target).some(o => o?.isBooth);

// Other booths (and, optionally, walls & pillars) the moving object can snap to
export function snapTargets(canvas, target, { includeWalls = false } = {}) {
  const moving = new Set(movingMembers(target));
  return canvas.getObjects()
    .filter(o => o.visible !== false && !moving.has(o) && !o.isBackgroundBlueprint && !o.isOpsOverlay &&
      (o.isBooth || (includeWalls && WALL_TYPES.includes(o.venueData?.type))))
    .map(o => ({ obj: o, box: boxOf(o), isBooth: Boolean(o.isBooth) }));
}

// Distance between two 1-D ranges (0 when they overlap)
const rangeGap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

/**
 * Best snap offsets for a moving box. Returns { dx, dy } (null on an axis without a candidate within threshold).
 * Among several candidates the closest wins; on a tie a touching candidate beats an alignment.
 */
export function computeSnap(box, targets, threshold) {
  let bestX = null;
  let bestY = null;
  const consider = (axis, d, kind, t) => {
    if (Math.abs(d) > threshold) return;
    const best = axis === 'x' ? bestX : bestY;
    const better = !best || Math.abs(d) < Math.abs(best.d) - 0.01 || (Math.abs(Math.abs(d) - Math.abs(best.d)) <= 0.01 && kind === 'touch' && best.kind !== 'touch');
    if (!better) return;
    if (axis === 'x') bestX = { d, kind, t };
    else bestY = { d, kind, t };
  };
  targets.forEach(t => {
    const b = t.box;
    const facingY = rangeGap(box.t, box.b, b.t, b.b) <= threshold; // side by side (horizontally)
    const facingX = rangeGap(box.l, box.r, b.l, b.r) <= threshold; // above / below
    if (facingY) {
      consider('x', b.l - box.r, 'touch', t);
      consider('x', b.r - box.l, 'touch', t);
    }
    if (facingX) {
      consider('y', b.t - box.b, 'touch', t);
      consider('y', b.b - box.t, 'touch', t);
    }
    if (t.isBooth) {
      consider('x', b.l - box.l, 'align', t);
      consider('x', b.r - box.r, 'align', t);
      consider('y', b.t - box.t, 'align', t);
      consider('y', b.b - box.b, 'align', t);
    }
  });
  return { dx: bestX ? bestX.d : null, dy: bestY ? bestY.d : null };
}

/**
 * Smart guides for a (snapped) box: solid lines along touching sides / corners, dashed lines for sides that line
 * up with a booth further away, and the distance in metres to the nearest facing booth when not touching yet.
 */
export function computeGuides(box, targets, { gridScale = 20, eps = 0.6 } = {}) {
  const lines = [];
  let nearest = null;
  targets.forEach(t => {
    const b = t.box;
    const vOverlap = [Math.max(box.t, b.t), Math.min(box.b, b.b)];
    const hOverlap = [Math.max(box.l, b.l), Math.min(box.r, b.r)];
    // touching sides (a zero-length overlap = corner to corner)
    [[box.r, b.l], [box.l, b.r]].forEach(([x1, x2]) => {
      if (Math.abs(x1 - x2) <= eps && vOverlap[1] >= vOverlap[0] - eps) lines.push({ x1, y1: vOverlap[0], x2: x1, y2: Math.max(vOverlap[0], vOverlap[1]), kind: 'touch' });
    });
    [[box.b, b.t], [box.t, b.b]].forEach(([y1, y2]) => {
      if (Math.abs(y1 - y2) <= eps && hOverlap[1] >= hOverlap[0] - eps) lines.push({ x1: hOverlap[0], y1, x2: Math.max(hOverlap[0], hOverlap[1]), y2: y1, kind: 'touch' });
    });
    if (t.isBooth) {
      // aligned sides (same row / column)
      [[box.l, b.l], [box.r, b.r]].forEach(([x1, x2]) => {
        if (Math.abs(x1 - x2) <= eps) lines.push({ x1, y1: Math.min(box.t, b.t), x2: x1, y2: Math.max(box.b, b.b), kind: 'align' });
      });
      [[box.t, b.t], [box.b, b.b]].forEach(([y1, y2]) => {
        if (Math.abs(y1 - y2) <= eps) lines.push({ x1: Math.min(box.l, b.l), y1, x2: Math.max(box.r, b.r), y2: y1, kind: 'align' });
      });
    }
    // gap to a facing booth (not touching yet)
    if (rangeGap(box.t, box.b, b.t, b.b) === 0) {
      const gapRight = b.l - box.r;
      const gapLeft = box.l - b.r;
      const yMid = (Math.max(box.t, b.t) + Math.min(box.b, b.b)) / 2;
      if (gapRight > eps && (!nearest || gapRight < nearest.gap)) nearest = { gap: gapRight, x1: box.r, y1: yMid, x2: b.l, y2: yMid };
      if (gapLeft > eps && (!nearest || gapLeft < nearest.gap)) nearest = { gap: gapLeft, x1: b.r, y1: yMid, x2: box.l, y2: yMid };
    }
    if (rangeGap(box.l, box.r, b.l, b.r) === 0) {
      const gapDown = b.t - box.b;
      const gapUp = box.t - b.b;
      const xMid = (Math.max(box.l, b.l) + Math.min(box.r, b.r)) / 2;
      if (gapDown > eps && (!nearest || gapDown < nearest.gap)) nearest = { gap: gapDown, x1: xMid, y1: box.b, x2: xMid, y2: b.t };
      if (gapUp > eps && (!nearest || gapUp < nearest.gap)) nearest = { gap: gapUp, x1: xMid, y1: b.b, x2: xMid, y2: box.t };
    }
  });
  const distance = nearest && nearest.gap <= gridScale * 6
    ? { ...nearest, text: `${(Math.round((nearest.gap / gridScale) * 100) / 100).toLocaleString('id-ID')} m` }
    : null;
  return { lines, distance };
}

/** Largest step (px) the box may move in a direction before it touches a facing booth (arrow keys). */
export function limitStepToTouch(box, targets, dir, step) {
  let limit = step;
  targets.forEach(({ box: b, isBooth }) => {
    if (!isBooth) return;
    if (dir === 'right' || dir === 'left') {
      if (rangeGap(box.t, box.b, b.t, b.b) > 0 || Math.min(box.b, b.b) - Math.max(box.t, b.t) <= 0.5) return;
      const gap = dir === 'right' ? b.l - box.r : box.l - b.r;
      if (gap >= -0.5) limit = Math.min(limit, Math.max(0, gap));
    } else {
      if (rangeGap(box.l, box.r, b.l, b.r) > 0 || Math.min(box.r, b.r) - Math.max(box.l, b.l) <= 0.5) return;
      const gap = dir === 'down' ? b.t - box.b : box.t - b.b;
      if (gap >= -0.5) limit = Math.min(limit, Math.max(0, gap));
    }
  });
  return limit;
}

/** Booth pairs whose areas overlap (touching sides do not count). Returns [{ a, b, rect }]. */
export function findBoothOverlaps(canvas, { eps = 0.6 } = {}) {
  const booths = canvas.getObjects().filter(o => o.isBooth && o.visible !== false).map(o => ({ o, box: boxOf(o) }));
  const out = [];
  for (let i = 0; i < booths.length; i++) {
    for (let j = i + 1; j < booths.length; j++) {
      const a = booths[i].box;
      const b = booths[j].box;
      const l = Math.max(a.l, b.l);
      const r = Math.min(a.r, b.r);
      const t = Math.max(a.t, b.t);
      const bt = Math.min(a.b, b.b);
      if (r - l > eps && bt - t > eps) out.push({ a: booths[i].o, b: booths[j].o, rect: { l, r, t, b: bt } });
    }
  }
  return out;
}

// Round a coordinate to the 0,01 m step
export const roundToStep = (value, gridScale = 20) => {
  const step = SNAP_ROUND_M * gridScale;
  return Math.round(value / step) * step;
};
