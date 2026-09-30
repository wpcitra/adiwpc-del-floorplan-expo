// Snap sesama booth (Floorplan Studio / Denah Sales). Everything works on the booth's real geometry (its
// rectangle: sides & square corners, after rotation), never on the rounded drawing, so "Sudut Booth" has no effect.
//
//   touch   a side of the moving box lands on the opposite side of another box (right -> left, top -> bottom...),
//           only when the two boxes face each other (their spans overlap or nearly overlap)
//   align   a side lines up with the same side of another box anywhere in the row / column ("sejajar")
// X and Y are solved independently: touch-X + touch-Y = corner to corner, touch-X + align-Y = rata sejajar ujung.
//
// Snap ke Elemen (AGENTS.md §25) uses the same functions in `elements` mode for everything that is not a booth
// (walls, doors, pillars, zones, queues, gates, utilities, signage, shapes...), in Denah Sales and Denah Operasional:
//   - align also with elements (not only booths), then, only when no side / corner candidate exists on an axis,
//     centre to centre and equal spacing ("jarak sama rata"), then the grid
//   - line elements (walls, aisles, queues, measures) snap their end points to other ends and to corners
//   - booths are only anchors: they never move because an element snapped to them
// Called without the `elements` option every function behaves exactly as for booth-to-booth snapping.

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
export function computeSnap(box, targets, threshold, { elements = false, center = null } = {}) {
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
    if (t.isBooth || elements) {
      consider('x', b.l - box.l, 'align', t);
      consider('x', b.r - box.r, 'align', t);
      consider('y', b.t - box.t, 'align', t);
      consider('y', b.b - box.b, 'align', t);
    }
  });
  if (elements) {
    // Second tier, only on an axis without a side / corner candidate: centre to centre, then equal spacing
    const c = center || boxCenter(box);
    const second = { x: null, y: null };
    const consider2 = (axis, d, kind) => {
      if (Math.abs(d) > threshold) return;
      const cur = second[axis];
      if (!cur || Math.abs(d) < Math.abs(cur.d) - 0.01 || (Math.abs(Math.abs(d) - Math.abs(cur.d)) <= 0.01 && kind === 'center' && cur.kind !== 'center')) second[axis] = { d, kind };
    };
    targets.forEach(t => {
      const tc = t.center || boxCenter(t.box);
      consider2('x', tc.x - c.x, 'center');
      consider2('y', tc.y - c.y, 'center');
    });
    equalSpacingCandidates(box, targets, 'x', threshold).forEach(d => consider2('x', d, 'equal'));
    equalSpacingCandidates(box, targets, 'y', threshold).forEach(d => consider2('y', d, 'equal'));
    if (!bestX && second.x) bestX = second.x;
    if (!bestY && second.y) bestY = second.y;
  }
  return { dx: bestX ? bestX.d : null, dy: bestY ? bestY.d : null, kindX: bestX?.kind || null, kindY: bestY?.kind || null };
}

/**
 * Smart guides for a (snapped) box: solid lines along touching sides / corners, dashed lines for sides that line
 * up with a booth further away, and the distance in metres to the nearest facing booth when not touching yet.
 */
export function computeGuides(box, targets, { gridScale = 20, eps = 0.6, elements = false, center = null, point = null } = {}) {
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
    if (t.isBooth || elements) {
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
  let distance = nearest && nearest.gap <= gridScale * 6
    ? { ...nearest, text: metres(nearest.gap, gridScale) }
    : null;
  if (elements) {
    // Centre to centre (nearest target per axis) and equal spacing along the row / column
    const c = center || boxCenter(box);
    let cx = null;
    let cy = null;
    targets.forEach(t => {
      const tc = t.center || boxCenter(t.box);
      if (Math.abs(tc.x - c.x) <= eps && (!cx || Math.abs(tc.y - c.y) < Math.abs(cx.y - c.y))) cx = tc;
      if (Math.abs(tc.y - c.y) <= eps && (!cy || Math.abs(tc.x - c.x) < Math.abs(cy.x - c.x))) cy = tc;
    });
    if (cx) lines.push({ x1: c.x, y1: Math.min(c.y, cx.y), x2: c.x, y2: Math.max(c.y, cx.y), kind: 'center' });
    if (cy) lines.push({ x1: Math.min(c.x, cy.x), y1: c.y, x2: Math.max(c.x, cy.x), y2: c.y, kind: 'center' });
    lines.push(...equalSpacingGuides(box, targets, 'x', gridScale, eps), ...equalSpacingGuides(box, targets, 'y', gridScale, eps));
    // Line end on an end point / corner: a cross on the shared point
    if (point) lines.push({ x1: point.x, y1: point.y, x2: point.x, y2: point.y, kind: 'touch' });
    // the centre / equal-spacing guides carry the information: no distance label on top of them
    if (lines.some(l => l.kind === 'center' || l.kind === 'equal')) distance = null;
  }
  return { lines, distance };
}

/** Largest step (px) the box may move in a direction before it touches a facing booth (arrow keys; `all`: any target). */
export function limitStepToTouch(box, targets, dir, step, { all = false } = {}) {
  let limit = step;
  // booths need a real shared stretch; elements (possibly a point) only need to face the anchor
  const minShared = all ? -0.01 : 0.5;
  targets.forEach(({ box: b, isBooth }) => {
    if (!isBooth && !all) return;
    if (dir === 'right' || dir === 'left') {
      if (rangeGap(box.t, box.b, b.t, b.b) > 0 || Math.min(box.b, b.b) - Math.max(box.t, b.t) <= minShared) return;
      const gap = dir === 'right' ? b.l - box.r : box.l - b.r;
      if (gap >= -0.5) limit = Math.min(limit, Math.max(0, gap));
    } else {
      if (rangeGap(box.l, box.r, b.l, b.r) > 0 || Math.min(box.r, b.r) - Math.max(box.l, b.l) <= minShared) return;
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

// ============================================================================================
// Snap ke Elemen: geometry of elements, equal spacing, line end points
// ============================================================================================
const boxCenter = (b) => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 });
const boxFromPoints = (pts) => {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
};
const metres = (px, gridScale) => `${(Math.round((px / gridScale) * 100) / 100).toLocaleString('id-ID')} m`;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Elements drawn as a line: their two ends snap to other ends and to corners
const LINE_TYPES = new Set(['wall', 'wall_line', 'aisle', 'vip_lane', 'measure', 'queue_line', 'wheelchair_path']);
const OBSTACLE_TYPES = new Set(WALL_TYPES);

const cornersOf = (obj) => {
  const c = typeof obj.calcACoords === 'function' ? obj.calcACoords() : null;
  return c ? [c.tl, c.tr, c.br, c.bl] : obj.getCoords();
};

// 2-D affine matrices [a, b, c, d, e, f] (same layout as Fabric)
const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
];
const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

// The element's body: for library elements the hit area (first child), so a CCTV's viewing cone does not count.
// A child's own coords are relative to its group: group matrix x child matrix gives canvas coordinates.
function bodyCorners(obj) {
  const vd = obj.venueData;
  if (vd?.lib && vd.type !== 'queue_line' && typeof obj.getObjects === 'function') {
    const hit = obj.getObjects()[0];
    if (hit && typeof hit.calcOwnMatrix === 'function' && typeof obj.calcTransformMatrix === 'function') {
      const m = multiply(obj.calcTransformMatrix(), hit.calcOwnMatrix());
      const w = (hit.width || 0) / 2;
      const h = (hit.height || 0) / 2;
      return [apply(m, -w, -h), apply(m, w, -h), apply(m, w, h), apply(m, -w, h)];
    }
  }
  return cornersOf(obj);
}

// Small point-like elements (Titik Listrik, WiFi, CCTV...: library elements up to 1 x 1 m) use their centre only
export function isPointElement(obj) {
  const vd = obj?.venueData;
  if (!vd?.lib || OBSTACLE_TYPES.has(vd.type) || LINE_TYPES.has(vd.type) || vd.type === 'text_label') return false;
  if ((obj.type || '').toLowerCase() === 'shapebox') return false;
  return Number(vd.widthM) <= 1 && Number(vd.heightM) <= 1;
}

function lineEnds(obj, corners) {
  if (obj.venueData?.type === 'queue_line' && Array.isArray(obj.points) && obj.points.length >= 2) {
    const m = obj.calcTransformMatrix();
    const off = obj.pathOffset || { x: 0, y: 0 };
    const abs = (p) => apply(m, p.x - off.x, p.y - off.y);
    return [abs(obj.points[0]), abs(obj.points[obj.points.length - 1])];
  }
  const [tl, tr, br, bl] = corners;
  return Math.hypot(tr.x - tl.x, tr.y - tl.y) >= Math.hypot(br.x - tr.x, br.y - tr.y)
    ? [mid(tl, bl), mid(tr, br)]
    : [mid(tl, tr), mid(bl, br)];
}

/** Snap geometry of one object: outer box, centre, anchor points (corners + line ends) and line ends. */
export function snapGeometry(obj) {
  if (obj.isBooth) {
    const box = boxOf(obj);
    return { box, center: boxCenter(box), points: [{ x: box.l, y: box.t }, { x: box.r, y: box.t }, { x: box.r, y: box.b }, { x: box.l, y: box.b }], ends: null };
  }
  const corners = bodyCorners(obj);
  const box = boxFromPoints(corners);
  const center = boxCenter(box);
  if (isPointElement(obj)) return { box: { l: center.x, r: center.x, t: center.y, b: center.y }, center, points: [center], ends: null };
  const ends = LINE_TYPES.has(obj.venueData?.type) ? lineEnds(obj, corners) : null;
  return { box, center, points: ends ? [...corners, ...ends] : corners, ends };
}

/** Geometry of what is being moved (one object or a multi-selection). */
export function movingGeometry(target) {
  if (isSelection(target)) {
    const box = boxOf(target);
    return { box, center: boxCenter(box), points: [], ends: null };
  }
  return snapGeometry(target);
}

/**
 * Anchors for an element being moved: booths (Snap ke Booth) and other elements of every layer (Snap ke Elemen),
 * incl. walls & pillars. The moving objects, hidden objects, the blueprint and grid lines are never anchors.
 */
export function elementSnapTargets(canvas, target, { booths = true, elements = true } = {}) {
  const moving = new Set(movingMembers(target));
  return canvas.getObjects()
    .filter(o => o.visible !== false && !moving.has(o) && !o.isBackgroundBlueprint && !o.isGridLine &&
      ((booths && o.isBooth) || (elements && !o.isBooth && (o.isVenueItem || o.isBasicShape))))
    .map(o => ({ obj: o, isBooth: Boolean(o.isBooth), ...snapGeometry(o) }));
}

// Targets sharing the moving box's row (axis 'x') or column (axis 'y'), its nearest neighbours and the gaps
function spacingInfo(box, targets, axis, slack) {
  const [lo, hi, plo, phi] = axis === 'x' ? ['l', 'r', 't', 'b'] : ['t', 'b', 'l', 'r'];
  const row = targets.filter(t => Math.min(box[phi], t.box[phi]) - Math.max(box[plo], t.box[plo]) >= 0);
  const before = row.filter(t => t.box[hi] <= box[lo] + slack).sort((a, b) => b.box[hi] - a.box[hi])[0] || null;
  const after = row.filter(t => t.box[lo] >= box[hi] - slack).sort((a, b) => a.box[lo] - b.box[lo])[0] || null;
  const sorted = [...row].sort((a, b) => a.box[lo] - b.box[lo]);
  const gaps = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const g = sorted[i + 1].box[lo] - sorted[i].box[hi];
    if (g > 0.5) gaps.push({ g, a: sorted[i], b: sorted[i + 1] });
  }
  return { before, after, gaps, lo, hi, plo, phi };
}

/** Offsets that give the moving box the same gap as its neighbours / as other gaps in the row (or column). */
export function equalSpacingCandidates(box, targets, axis, threshold) {
  const { before, after, gaps, lo, hi } = spacingInfo(box, targets, axis, threshold);
  const out = [];
  if (before && after) out.push(((after.box[lo] - box[hi]) - (box[lo] - before.box[hi])) / 2);
  gaps.forEach(({ g }) => {
    if (before) out.push(before.box[hi] + g - box[lo]);
    if (after) out.push(after.box[lo] - g - box[hi]);
  });
  return out;
}

// Orange guides with the gap in metres for every gap equal to the moving box's gap(s)
function equalSpacingGuides(box, targets, axis, gridScale, eps) {
  const { before, after, gaps, lo, hi, plo, phi } = spacingInfo(box, targets, axis, eps);
  const moving = { box };
  const own = [];
  if (before && box[lo] - before.box[hi] > 0.5) own.push({ g: box[lo] - before.box[hi], a: before, b: moving });
  if (after && after.box[lo] - box[hi] > 0.5) own.push({ g: after.box[lo] - box[hi], a: moving, b: after });
  const all = [...own, ...gaps.filter(x => x.a !== before || x.b !== after)];
  const out = [];
  own.forEach(o => {
    const equal = all.filter(x => x !== o && Math.abs(x.g - o.g) <= eps);
    if (!equal.length) return;
    [o, ...equal].forEach(x => {
      if (out.some(l => l.src === x)) return;
      const p = (Math.max(x.a.box[plo], x.b.box[plo]) + Math.min(x.a.box[phi], x.b.box[phi])) / 2;
      const [s, e] = [x.a.box[hi], x.b.box[lo]];
      out.push(axis === 'x'
        ? { x1: s, y1: p, x2: e, y2: p, kind: 'equal', text: metres(x.g, gridScale), src: x }
        : { x1: p, y1: s, x2: p, y2: e, kind: 'equal', text: metres(x.g, gridScale), src: x });
    });
  });
  return out.map(({ src, ...l }) => l);
}

/** Line elements: the closest pair (line end, anchor point) within the threshold -> { dx, dy, point } or null. */
export function snapLineEnds(ends, targets, threshold) {
  let best = null;
  targets.forEach(t => (t.points || []).forEach(p => ends.forEach(e => {
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (dist <= threshold && (!best || dist < best.dist)) best = { dist, dx: p.x - e.x, dy: p.y - e.y, point: p };
  })));
  return best;
}

/** Nearest anchor point (corner, line end, centre) to a free point, e.g. a queue line vertex being dragged. */
export function snapPoint(pt, targets, threshold) {
  let best = null;
  targets.forEach(t => [...(t.points || []), t.center].forEach(p => {
    if (!p) return;
    const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (dist <= threshold && (!best || dist < best.dist)) best = { dist, point: p };
  }));
  return best?.point || null;
}

