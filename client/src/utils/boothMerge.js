import {
  computeMergeGroups, outlineSegments, mergeCodeLabel, MERGE_STATUS_LABELS, isMergeObstacleData, polygonArea, sortCodes, boothsShareSide,
  outlineLoops, signedArea, isConvexVertex
} from '../../../shared/boothGroups.js';
import { STATUS_CONFIG, effectiveCornerPct, cornerRadiusPx } from './floorplanUtils';

// Auto-merge booth on the canvas (AGENTS.md §18). Booth objects never move or change size: each member of a
// merge group draws itself as part of one shape (its own rectangle filled, no inner border, no own label), and
// the top-most member also paints the group outline (edges not shared with another member) and ONE label.
// The drawing replaces the member's render() at runtime only, so nothing of it is saved in the canvas JSON;
// exports (toDataURL / PDF) go through the same render and print the merged look.

export const PARTIAL_STYLE = { fill: '#e0f2fe', stroke: '#0284c7', text: '#075985' };
export { mergeCodeLabel, MERGE_STATUS_LABELS, sortCodes };

const codeKey = (code) => String(code || '').trim().toLowerCase();
// Fresh corners (getCoords() can be stale while an object is being dragged)
const coordsOf = (obj) => {
  const c = typeof obj.calcACoords === 'function' ? obj.calcACoords() : null;
  const pts = c ? [c.tl, c.tr, c.br, c.bl] : obj.getCoords();
  return pts.map(p => ({ x: p.x, y: p.y }));
};
const areaM2Of = (bd = {}) => (Number(bd.widthM) || 0) * (Number(bd.heightM) || 0);
export const formatArea = (m2) => `${(Math.round(m2 * 100) / 100).toLocaleString('id-ID')} m²`;

/**
 * Merge groups of the booths on a canvas.
 *   enabled  project switch (metadata.display.autoMerge); groups are still returned, flagged active: false
 * Each group: { id, exhibitorId, codes, status, separate, active, members: [booth objects], label, totalAreaM2 }
 */
export function canvasMergeGroups(canvas, { enabled = true, gridScale = 20 } = {}) {
  if (!canvas) return [];
  const booths = canvas.getObjects().filter(o => o.isBooth && o.boothData && o.visible !== false);
  const byKey = new Map();
  const items = booths.map(o => {
    const key = codeKey(o.boothData.code || o.boothData.booth_number);
    byKey.set(key, o);
    return {
      key,
      code: o.boothData.code || o.boothData.booth_number || '',
      exhibitorId: o.boothData.exhibitorId || '',
      status: String(o.boothData.status || '').toLowerCase(),
      separate: Boolean(o.boothData.mergeSeparate),
      poly: coordsOf(o)
    };
  });
  const obstacles = canvas.getObjects()
    .filter(o => !o.isBooth && o.visible !== false && isMergeObstacleData(o.venueData))
    .map(coordsOf);
  const { groups } = computeMergeGroups(items, { gridScale, obstacles });
  return groups.map(g => {
    const members = g.keys.map(k => byKey.get(k)).filter(Boolean);
    return {
      ...g,
      active: enabled && !g.separate,
      members,
      label: mergeCodeLabel(g.codes),
      totalAreaM2: members.reduce((acc, m) => acc + areaM2Of(m.boothData), 0)
    };
  });
}

// Group of a booth object (active groups only unless `includeInactive`)
export function groupOfBooth(canvas, booth, { includeInactive = false } = {}) {
  const groups = canvas?.__mergeGroups || [];
  return groups.find(g => (includeInactive || g.active) && g.members.includes(booth)) || null;
}

// Do the given booth objects touch each other (side by side)? Used for the multi-booth selection preview
export function selectionClusters(canvas, boothObjs, { gridScale = 20 } = {}) {
  const obstacles = (canvas?.getObjects() || []).filter(o => !o.isBooth && o.visible !== false && isMergeObstacleData(o.venueData)).map(coordsOf);
  const parent = boothObjs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i]; return i; };
  for (let i = 0; i < boothObjs.length; i++) {
    for (let j = i + 1; j < boothObjs.length; j++) {
      if (boothsShareSide(coordsOf(boothObjs[i]), coordsOf(boothObjs[j]), { gridScale, obstacles })) parent[find(i)] = find(j);
    }
  }
  const buckets = new Map();
  boothObjs.forEach((b, i) => {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(b);
  });
  return [...buckets.values()];
}

function groupStyle(group, leader) {
  if (group.status === 'partial') return PARTIAL_STYLE;
  const rect = typeof leader.getObjects === 'function'
    ? leader.getObjects().find(o => (o.type || '').toLowerCase() === 'rect' && (o.height || 0) > 6)
    : null;
  const cfg = STATUS_CONFIG[group.status] || STATUS_CONFIG.reserved;
  const fill = typeof rect?.fill === 'string' ? rect.fill : cfg.bg;
  const stroke = typeof rect?.stroke === 'string' ? rect.stroke : cfg.border;
  return { fill, stroke, text: cfg.text };
}

function tracePolygon(ctx, poly) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, size, weight, minSize = 3.5) {
  let s = size;
  ctx.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 0.5;
    ctx.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return { text: `${t.trimEnd()}…`, size: s };
}

// The member with the biggest area carries the label (centre of the largest part of the shape)
function labelHost(group) {
  return group.members.reduce((best, m) => (polygonArea(coordsOf(m)) > polygonArea(coordsOf(best)) ? m : best), group.members[0]);
}

// Largest axis-aligned rectangle inside the merged shape, in the frame of the biggest booth (so an L / T shape
// gets its label block in its widest part, and rotated groups are handled in their own orientation).
function labelFrame(group) {
  const host = labelHost(group);
  let angle = ((host.angle || 0) % 360 + 360) % 360;
  if (angle > 90 && angle <= 270) angle -= 180; // keep the text readable (a rectangle looks the same at +180 deg)
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const toLocal = (p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const polys = group.members.map(m => coordsOf(m).map(toLocal));
  const uniq = (vals) => [...new Set(vals.map(v => Math.round(v * 2) / 2))].sort((x, y) => x - y);
  const xs = uniq(polys.flat().map(p => p.x));
  const ys = uniq(polys.flat().map(p => p.y));
  const inside = (x, y) => polys.some(poly => pointInPoly({ x, y }, poly));
  const covered = xs.slice(0, -1).map((x0, i) => ys.slice(0, -1).map((y0, j) => inside((x0 + xs[i + 1]) / 2, (y0 + ys[j + 1]) / 2)));
  let best = null;
  for (let i1 = 0; i1 < xs.length - 1; i1++) {
    for (let i2 = i1; i2 < xs.length - 1; i2++) {
      for (let j1 = 0; j1 < ys.length - 1; j1++) {
        for (let j2 = j1; j2 < ys.length - 1; j2++) {
          let ok = true;
          for (let i = i1; i <= i2 && ok; i++) for (let j = j1; j <= j2 && ok; j++) ok = covered[i][j];
          if (!ok) break;
          const area = (xs[i2 + 1] - xs[i1]) * (ys[j2 + 1] - ys[j1]);
          if (!best || area > best.area) best = { l: xs[i1], r: xs[i2 + 1], t: ys[j1], b: ys[j2 + 1], area };
        }
      }
    }
  }
  if (!best) {
    const c = toLocal(host.getCenterPoint());
    const w = (host.width || 0) * Math.abs(host.scaleX || 1);
    const h = (host.height || 0) * Math.abs(host.scaleY || 1);
    best = { l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2, area: w * h };
  }
  const unionArea = polys.reduce((acc, poly) => acc + polygonArea(poly), 0);
  return { rect: best, rad, isRectangle: Math.abs(unionArea - best.area) <= Math.max(4, unionArea * 0.01) };
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

const FONT = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

// Brand name as big as possible: 1 or 2 lines, horizontal or vertical, whichever gives the larger font
function fitBrand(ctx, text, boxW, boxH, maxSize) {
  const words = text.split(/\s+/).filter(Boolean);
  const options = [[text]];
  if (words.length > 1) {
    let bestSplit = null;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const diff = Math.abs(l1.length - l2.length);
      if (!bestSplit || diff < bestSplit.diff) bestSplit = { lines: [l1, l2], diff };
    }
    options.push(bestSplit.lines);
  }
  ctx.font = FONT('800', 100);
  let best = null;
  options.forEach(lines => {
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width)) / 100; // width per 1px of font size
    const lineH = 1.12;
    [false, true].forEach(vertical => {
      const along = vertical ? boxH : boxW;
      const across = vertical ? boxW : boxH;
      const size = Math.min(maxSize, along / widest, across / (lines.length * lineH));
      if (!best || size > best.size + 0.01) best = { size, lines, vertical };
    });
  });
  return best;
}

function drawGroupLabel(ctx, group, style) {
  const { rect, rad, isRectangle } = labelFrame(group);
  const W = rect.r - rect.l;
  const H = rect.b - rect.t;
  const minDim = Math.min(W, H);
  const pad = Math.max(3, minDim * 0.06);
  const small = Math.max(5, Math.min(13, minDim * 0.12));
  const gridScale = group.members[0]?.boothData?.gridScale || 20;
  const round1 = (v) => Math.round(v * 10) / 10;
  const sizeText = isRectangle
    ? `${round1(W / gridScale)}x${round1(H / gridScale)}m`.replace(/\./g, ',')
    : formatArea(group.totalAreaM2);
  const owner = group.members.map(m => m.boothData?.ownerName).find(Boolean) || '';
  const statusText = (group.status === 'partial' ? 'SEBAGIAN LUNAS' : (MERGE_STATUS_LABELS[group.status] || group.status).toUpperCase());

  ctx.save();
  if (rad) ctx.rotate(rad); // local frame: the rectangle above is in these coordinates
  ctx.textBaseline = 'top';

  // Top-left: size | top-right: booth numbers. A long joined number wraps onto a few right-aligned lines
  // ("A-01+A-04+" / "A-05") instead of shrinking until it is unreadable.
  const headerW = W - pad * 2;
  const sizeFit = fitText(ctx, sizeText, headerW * 0.42, small, '600');
  ctx.font = FONT('600', sizeFit.size);
  const sizeW = ctx.measureText(sizeFit.text).width;
  const codeRoom = Math.max(10, headerW - sizeW - pad);
  const tokens = group.codes;
  ctx.font = FONT('800', 100);
  let codeLines = null;
  let codeSize = 0;
  for (let k = 1; k <= Math.min(4, tokens.length); k++) {
    const per = Math.ceil(tokens.length / k);
    const lines = [];
    for (let i = 0; i < tokens.length; i += per) lines.push(tokens.slice(i, i + per).join('+') + (i + per < tokens.length ? '+' : ''));
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width)) / 100;
    const size = Math.min(small, codeRoom / widest);
    if (size > codeSize + 0.01) { codeSize = size; codeLines = lines; }
    if (size >= small * 0.85) break;
  }
  if (codeSize < 4.5) {
    const fit = fitText(ctx, group.label, codeRoom, small, '800');
    codeLines = [fit.text];
    codeSize = fit.size;
  }
  ctx.font = FONT('600', sizeFit.size);
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'left';
  ctx.fillText(sizeFit.text, rect.l + pad, rect.t + pad);
  ctx.font = FONT('800', codeSize);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'right';
  codeLines.forEach((line, i) => ctx.fillText(line, rect.r - pad, rect.t + pad + i * codeSize * 1.1));
  const headerH = Math.max(sizeFit.size, codeSize * 1.1 * codeLines.length);

  // Bottom-centre: status
  const statusFit = fitText(ctx, statusText, headerW, small * 0.95, '800');
  ctx.font = FONT('800', statusFit.size);
  ctx.fillStyle = style.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(statusFit.text, (rect.l + rect.r) / 2, rect.b - pad);

  // Centre: brand, as large as the free space allows
  if (owner) {
    const top = rect.t + pad + headerH + pad * 0.6;
    const bottom = rect.b - pad - statusFit.size - pad * 0.6;
    const boxW = W - pad * 2;
    const boxH = Math.max(4, bottom - top);
    const brand = fitBrand(ctx, owner, boxW, boxH, Math.max(small * 1.2, minDim * 0.42));
    if (brand && brand.size >= 3.5) {
      const cx = (rect.l + rect.r) / 2;
      const cy = (top + bottom) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (brand.vertical) ctx.rotate(-Math.PI / 2);
      ctx.font = FONT('800', brand.size);
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineH = brand.size * 1.12;
      brand.lines.forEach((line, i) => ctx.fillText(line, 0, (i - (brand.lines.length - 1) / 2) * lineH));
      ctx.restore();
    }
  }
  ctx.restore();
}

// "Sudut Booth" of a merged outline: the members' own value when they all agree, otherwise the floorplan setting
function groupCornerRadius(group, canvas) {
  const globalPct = canvas?.boothCornerPct ?? 0;
  const pcts = [...new Set(group.members.map(m => effectiveCornerPct(m.boothData, globalPct)))];
  const pct = pcts.length === 1 ? pcts[0] : globalPct;
  const shortest = Math.min(...group.members.map(m => Math.min((m.width || 0) * Math.abs(m.scaleX || 1), (m.height || 0) * Math.abs(m.scaleY || 1))));
  return cornerRadiusPx(pct, shortest, shortest);
}

// One closed loop, rounding only the outer (convex) corners; inner (concave) corners of an L / T stay siku
function traceRoundedLoop(ctx, pts, radius) {
  const n = pts.length;
  const orientation = signedArea(pts);
  const first = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2 };
  ctx.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const r = isConvexVertex(prev, cur, next, orientation)
      ? Math.min(radius, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2)
      : 0;
    if (r > 0.1) ctx.arcTo(cur.x, cur.y, next.x, next.y, r);
    else ctx.lineTo(cur.x, cur.y);
  }
  ctx.closePath();
}

// Runtime render of a merge group (ctx already carries the viewport transform: scene coordinates). The top-most
// member paints the whole shape (fill + outline + label); the other members draw nothing of their own, so no inner
// border, no double line on touching sides and one set of corners for the whole group.
function renderMergedMember(obj, ctx) {
  const { group, leader } = obj.__merge;
  if (obj !== leader) return;
  const style = groupStyle(group, leader);
  const polys = group.members.map(coordsOf);
  const loops = outlineLoops(outlineSegments(polys, { tol: 3 }), { tol: 3 });
  ctx.save();
  ctx.globalAlpha *= obj.opacity ?? 1;
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 2;
  if (loops.length) {
    const radius = groupCornerRadius(group, obj.canvas);
    ctx.beginPath();
    loops.forEach(loop => traceRoundedLoop(ctx, loop, radius));
    ctx.fill('evenodd');
    ctx.stroke();
  } else {
    // Fallback: members filled one by one, outline pieces as lines
    polys.forEach(poly => { tracePolygon(ctx, poly); ctx.fill(); });
    ctx.beginPath();
    outlineSegments(polys, { tol: 3 }).forEach(s => { ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); });
    ctx.stroke();
  }
  drawGroupLabel(ctx, group, style);
  ctx.restore();
}

function patchRender(obj) {
  if (obj.__mergePatched) return;
  const original = obj.render;
  obj.render = function renderWithMerge(ctx) {
    if (this.__merge && this.visible !== false && this.canvas) return renderMergedMember(this, ctx);
    return original.call(this, ctx);
  };
  obj.__mergePatched = true;
}

/** Compute the groups of a canvas and switch the members' rendering on/off accordingly. Returns the groups. */
export function refreshMergeRendering(canvas, { enabled = true, gridScale = 20 } = {}) {
  if (!canvas) return [];
  const groups = canvasMergeGroups(canvas, { enabled, gridScale });
  canvas.getObjects().forEach(o => { if (o.__merge) o.__merge = null; });
  const order = canvas.getObjects();
  groups.filter(g => g.active).forEach(g => {
    const leader = g.members.reduce((top, m) => (order.indexOf(m) > order.indexOf(top) ? m : top), g.members[0]);
    g.members.forEach(m => {
      patchRender(m);
      m.__merge = { group: g, leader };
    });
  });
  canvas.__mergeGroups = groups;
  canvas.requestRenderAll();
  return groups;
}

// Detail rows of a group for panels / modals
export function groupDetails(group) {
  return group.members
    .map(m => ({
      code: m.boothData.code || '',
      widthM: m.boothData.widthM,
      heightM: m.boothData.heightM,
      areaM2: areaM2Of(m.boothData),
      status: String(m.boothData.status || '').toLowerCase(),
      price: m.boothData.price
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'id', { numeric: true }));
}
