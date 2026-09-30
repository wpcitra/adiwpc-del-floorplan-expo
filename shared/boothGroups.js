// Auto-merge booth (see AGENTS.md §18). Pure geometry, shared by the server (Data Exhibitor, checkout contracts)
// and the client (Live Floorplan, Studio, Denah Operasional). No Fabric / DB imports here.
//
// Booths never move: a merge group is only computed from the booth rectangles on the canvas.
//   adjacency   two booths share a side segment (collinear edges, gap <= MERGE_GAP_M, overlap >= MIN_SHARED_M);
//               touching at a corner only is not enough; a wall / pillar / aisle lying on the shared side blocks it
//   group       connected components (chained: A-B, B-C => A+B+C) of Reserved/Sold booths with the same exhibitorId
//   outline     every booth edge minus the parts shared with another member => one outline for L / T / any shape

export const MERGE_GAP_M = 0.1;       // snap-grid tolerance between two booth sides
export const MIN_SHARED_M = 0.3;      // shortest shared side that counts as "berbagi sisi"
export const MERGEABLE_STATUSES = ['reserved', 'sold'];
// Sales-layer elements that separate two booths even when their sides line up
export const MERGE_OBSTACLE_TYPES = ['wall', 'wall_line', 'pillar', 'pilar_persegi', 'aisle', 'vip_lane', 'wheelchair_path', 'queue_line', 'stanchion'];

const PARALLEL_SIN = Math.sin((2 * Math.PI) / 180); // edges within 2 degrees are parallel

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);

export function edgesOf(poly) {
  return poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] }));
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

export function bboxOf(poly) {
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += cross(poly[i], poly[(i + 1) % poly.length]);
  return Math.abs(s) / 2;
}

/**
 * Portions of polygon A's edges that lie on an edge of polygon B (collinear within `tol`).
 * Returns [{ edge, t0, t1, a, b }] where t0..t1 is the covered range along A's edge `edge`.
 */
export function sharedSegments(polyA, polyB, tol) {
  const out = [];
  edgesOf(polyA).forEach((eA, edge) => {
    const vA = sub(eA.b, eA.a);
    const lA = len(vA);
    if (lA < 1e-6) return;
    const dA = { x: vA.x / lA, y: vA.y / lA };
    const nA = { x: -dA.y, y: dA.x };
    edgesOf(polyB).forEach(eB => {
      const vB = sub(eB.b, eB.a);
      const lB = len(vB);
      if (lB < 1e-6 || Math.abs(cross(dA, vB) / lB) > PARALLEL_SIN) return;
      // Touching sides of two neighbouring rectangles run in opposite directions (same winding order);
      // collinear sides running the same way (e.g. the top sides of a row of booths) are not shared
      if (dot(dA, vB) > 0) return;
      const d1 = dot(sub(eB.a, eA.a), nA);
      const d2 = dot(sub(eB.b, eA.a), nA);
      if (Math.abs(d1) > tol || Math.abs(d2) > tol) return;
      const t1 = dot(sub(eB.a, eA.a), dA);
      const t2 = dot(sub(eB.b, eA.a), dA);
      const lo = Math.max(0, Math.min(t1, t2));
      const hi = Math.min(lA, Math.max(t1, t2));
      if (hi - lo <= 1e-6) return;
      out.push({ edge, t0: lo, t1: hi, a: { x: eA.a.x + dA.x * lo, y: eA.a.y + dA.y * lo }, b: { x: eA.a.x + dA.x * hi, y: eA.a.y + dA.y * hi } });
    });
  });
  return out;
}

// Share of a segment covered by obstacles (sampled)
function blockedShare(seg, obstacles) {
  if (!obstacles?.length) return 0;
  const samples = 7;
  let blocked = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples;
    const p = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    if (obstacles.some(o => pointInPolygon(p, o))) blocked++;
  }
  return blocked / samples;
}

/**
 * Do two booth polygons share a side (not only a corner) that is not separated by a wall / pillar / aisle?
 * Lengths are in canvas px: gridScale px = 1 m.
 */
export function boothsShareSide(polyA, polyB, { gridScale = 20, obstacles = [] } = {}) {
  const tol = MERGE_GAP_M * gridScale + 0.5;
  const segs = sharedSegments(polyA, polyB, tol);
  const free = segs.reduce((acc, s) => acc + (s.t1 - s.t0) * (1 - (blockedShare(s, obstacles) >= 0.5 ? 1 : 0)), 0);
  return free >= MIN_SHARED_M * gridScale;
}

const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
export const sortCodes = (codes) => [...codes].sort(naturalCompare);

// "A-01+A-03+A-04", or "A-01 s/d A-04 (3 booth)" when the joined code is too long for a label
export function mergeCodeLabel(codes, maxLength = 22) {
  const sorted = sortCodes(codes);
  const joined = sorted.join('+');
  if (joined.length <= maxLength) return joined;
  return `${sorted[0]} s/d ${sorted[sorted.length - 1]} (${sorted.length} booth)`;
}

export const MERGE_STATUS_LABELS = { sold: 'Sold', reserved: 'Reserved', partial: 'Sebagian Lunas' };

/**
 * Merge groups of a floorplan.
 *   booths: [{ key, code, exhibitorId, status, poly, separate }]
 *   returns { groups: [{ id, exhibitorId, keys, codes, status, separate }], byKey: Map(key -> group) }
 * Only Reserved / Sold booths with an exhibitorId take part; Available / Maintenance booths never merge.
 */
export function computeMergeGroups(booths, { gridScale = 20, obstacles = [] } = {}) {
  const eligible = booths.filter(b => b.exhibitorId && MERGEABLE_STATUSES.includes(String(b.status || '').toLowerCase()) && b.poly?.length >= 3);
  const parent = new Map(eligible.map(b => [b.key, b.key]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const tol = MERGE_GAP_M * gridScale + 1;
  const boxes = new Map(eligible.map(b => [b.key, bboxOf(b.poly)]));

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (a.exhibitorId !== b.exhibitorId) continue;
      const ba = boxes.get(a.key);
      const bb = boxes.get(b.key);
      if (ba.minX > bb.maxX + tol || bb.minX > ba.maxX + tol || ba.minY > bb.maxY + tol || bb.minY > ba.maxY + tol) continue;
      if (boothsShareSide(a.poly, b.poly, { gridScale, obstacles })) parent.set(find(a.key), find(b.key));
    }
  }

  const buckets = new Map();
  eligible.forEach(b => {
    const root = find(b.key);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(b);
  });

  const groups = [];
  const byKey = new Map();
  buckets.forEach(members => {
    if (members.length < 2) return;
    const statuses = [...new Set(members.map(m => String(m.status).toLowerCase()))];
    const keys = members.map(m => m.key).sort(naturalCompare);
    const group = {
      id: `${members[0].exhibitorId}|${keys.join(',')}`,
      exhibitorId: members[0].exhibitorId,
      keys,
      codes: sortCodes(members.map(m => m.code)),
      status: statuses.length === 1 ? statuses[0] : 'partial',
      separate: members.some(m => m.separate)
    };
    groups.push(group);
    keys.forEach(k => byKey.set(k, group));
  });
  return { groups, byKey };
}

/**
 * Outline of a merged group: each polygon edge minus the parts lying on another member's edge.
 * Works for L, T, U and irregular shapes, and for booths of different sizes or rotations.
 */
export function outlineSegments(polys, { tol = 3 } = {}) {
  const segments = [];
  polys.forEach((poly, i) => {
    const covered = new Map(); // edge index -> [[t0, t1]]
    polys.forEach((other, j) => {
      if (i === j) return;
      sharedSegments(poly, other, tol).forEach(s => {
        if (!covered.has(s.edge)) covered.set(s.edge, []);
        covered.get(s.edge).push([s.t0, s.t1]);
      });
    });
    edgesOf(poly).forEach((e, edge) => {
      const v = sub(e.b, e.a);
      const l = len(v);
      if (l < 1e-6) return;
      const ranges = (covered.get(edge) || []).sort((a, b) => a[0] - b[0]);
      let cursor = 0;
      const pushPiece = (t0, t1) => {
        if (t1 - t0 <= 0.5) return;
        segments.push({ a: { x: e.a.x + (v.x * t0) / l, y: e.a.y + (v.y * t0) / l }, b: { x: e.a.x + (v.x * t1) / l, y: e.a.y + (v.y * t1) / l } });
      };
      ranges.forEach(([t0, t1]) => {
        if (t0 > cursor) pushPiece(cursor, t0);
        cursor = Math.max(cursor, t1);
      });
      if (cursor < l) pushPiece(cursor, l);
    });
  });
  return segments;
}

/**
 * Chain outline pieces into closed loops of vertices (collinear points removed), e.g. an L-shaped group gives one
 * 6-vertex loop. Used to draw the merged outline with rounded OUTER (convex) corners only.
 */
export function outlineLoops(segments, { tol = 3 } = {}) {
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const unused = segments.map(s => ({ a: s.a, b: s.b }));
  const loops = [];
  while (unused.length) {
    const first = unused.shift();
    const pts = [first.a, first.b];
    let closed = false;
    for (let guard = 0; guard < 10000; guard++) {
      const end = pts[pts.length - 1];
      if (pts.length > 2 && dist(end, pts[0]) <= tol) { pts.pop(); closed = true; break; }
      let bestI = -1;
      let flip = false;
      let bestD = Infinity;
      unused.forEach((s, i) => {
        const da = dist(end, s.a);
        const db = dist(end, s.b);
        if (da < bestD) { bestD = da; bestI = i; flip = false; }
        if (db < bestD) { bestD = db; bestI = i; flip = true; }
      });
      if (bestI < 0 || bestD > tol) break;
      const s = unused.splice(bestI, 1)[0];
      pts.push(flip ? s.a : s.b);
    }
    if (!closed) continue;
    // drop points on a straight line (pieces split at booth boundaries along one side)
    const clean = pts.filter((p, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const v1 = sub(p, prev);
      const v2 = sub(next, p);
      return Math.abs(cross(v1, v2)) > 1e-3 * Math.max(1, len(v1) * len(v2)) || dot(v1, v2) < 0;
    });
    if (clean.length >= 3) loops.push(clean);
  }
  return loops;
}

// Signed area (sign gives the loop orientation; a vertex is convex when its turn has the same sign)
export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += cross(poly[i], poly[(i + 1) % poly.length]);
  return s / 2;
}

export function isConvexVertex(prev, cur, next, orientation) {
  return Math.sign(cross(sub(cur, prev), sub(next, cur))) === Math.sign(orientation);
}

// Corners of a serialized Fabric object (any origin / rotation / scale), in canvas coordinates
export function polygonFromSerialized(o) {
  const w = (Number(o.width) || 0) * Math.abs(Number(o.scaleX) || 1);
  const h = (Number(o.height) || 0) * Math.abs(Number(o.scaleY) || 1);
  const ox = o.originX === 'center' ? 0 : o.originX === 'right' ? -w / 2 : w / 2;
  const oy = o.originY === 'center' ? 0 : o.originY === 'bottom' ? -h / 2 : h / 2;
  const a = ((Number(o.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = (Number(o.left) || 0) + ox * cos - oy * sin;
  const cy = (Number(o.top) || 0) + ox * sin + oy * cos;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos }));
}

export const isMergeObstacleData = (venueData) => Boolean(venueData && MERGE_OBSTACLE_TYPES.includes(venueData.type));
