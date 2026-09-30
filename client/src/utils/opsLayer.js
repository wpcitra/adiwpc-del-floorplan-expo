import * as fabric from 'fabric';
import { ELEMENTS, elementCenter, isLibraryElement, ICONS, accentOf } from './elementLibrary';
import { getDoorOpeningCenter } from './doorSymbols';
import { captionText, defaultCaption } from './elementCaptions';
import { VENUE_TEMPLATES, FURNITURE_TEMPLATES } from './floorplanUtils';

// Denah Operasional (see AGENTS.md §17)
// One floorplan, two layers: the sales layer (booths, walls, structures, doors, stage, blueprint) is read-only in
// operations mode and always comes live from the sales floorplan; the operational layer (isOpsItem objects) is
// stored separately (ops_elements) and drawn on top. Elements can be anchored to a booth and follow it.

// Sidebar tabs available to the operations team (Booths, Walls, Struktur, Pintu and Stage stay with Sales)
export const OPS_SIDEBAR_TABS = ['lib_zona', 'lib_tiket', 'lib_utilitas', 'lib_signage', 'lib_operasional', 'utilities', 'amenities', 'furniture', 'shapes', 'layers'];
export const OPS_LIBRARY_TABS = new Set(['lib_zona', 'lib_tiket', 'lib_utilitas', 'lib_signage', 'lib_operasional', 'amenities', 'shapes']);
// Original venue items the operations team may place (Safety, Amenities, Furniture and the shortcuts in the library tabs)
export const OPS_VENUE_TYPES = new Set([
  'floorbox', 'apar', 'hydrant', 'waste',
  'regdesk', 'toilet', 'atm', 'signage', 'plants', 'loading', 'storage', 'greenroom', 'security',
  'chair_square', 'chair_round', 'chair_office', 'chair_lounge', 'chair_dining'
]);

export const SETUP_STATUS = {
  belum_datang: { label: 'Belum Datang', color: '#94a3b8' },
  proses_setup: { label: 'Proses Setup', color: '#f59e0b' },
  siap: { label: 'Siap', color: '#10b981' },
  bongkar: { label: 'Bongkar', color: '#8b5cf6' }
};
export const INTERNET_LABELS = { tidak: 'Tidak', wifi: 'WiFi', lan: 'LAN (kabel)' };
// Special design booths (custom stand built by the tenant's contractor): coloured by the operations team
export const SPECIAL_DESIGN_DEFAULT_COLOR = '#7c3aed';
export const SPECIAL_DESIGN_COLORS = ['#7c3aed', '#db2777', '#0ea5e9', '#0d9488', '#ea580c', '#ca8a04', '#dc2626', '#1e293b'];
export const OPS_LOCK_MESSAGE = 'Booth hanya bisa diubah di Denah Sales. Hubungi tim Sales untuk mengubah layout.';

// Canvas properties kept with operational objects & history snapshots
export const OPS_SERIALIZE_PROPS = ['isBooth', 'boothData', 'isVenueItem', 'venueData', 'isCustomGroup', 'isBackgroundBlueprint', 'blueprintData',
  'strokeUniform', 'noScaleCache', 'id', 'name', 'src', 'isLocked', 'isOpsItem', 'isSalesLayer', 'opsOrigOpacity'];

export const SALES_DIM_OPACITY = 0.45;

export const boothKeyOf = (bd) => String(bd?.id || bd?.code || '').trim();
export const emptyBoothOps = (booth) => ({
  boothKey: boothKeyOf(booth), boothCode: booth?.code || '', powerWatt: 0, waterNeeded: false, internet: 'tidak', setupStatus: 'belum_datang', notes: '',
  specialDesign: false, specialColor: ''
});

// ---------- geometry ----------
// Element centre in scene coordinates (library groups & doors are centred on their hit area)
export function objectCenterOf(obj) {
  if (!obj) return new fabric.Point(0, 0);
  if (obj.venueData?.type === 'door') return getDoorOpeningCenter(obj);
  if (isLibraryElement(obj) && typeof obj.getObjects === 'function') return elementCenter(obj);
  return obj.getCenterPoint();
}

export function setObjectCenter(obj, point) {
  const c = objectCenterOf(obj);
  obj.set({ left: obj.left + (point.x - c.x), top: obj.top + (point.y - c.y) });
  obj.setCoords();
}

const rotate = (x, y, deg) => {
  const r = fabric.util.degreesToRadians(deg || 0);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

// Anchor = offset of the element in the booth's own (unrotated) frame + relative angle
export function captureAnchor(el, booth) {
  const bc = booth.getCenterPoint();
  const ec = objectCenterOf(el);
  const local = rotate(ec.x - bc.x, ec.y - bc.y, -(booth.angle || 0));
  return {
    boothId: booth.boothData?.id || '',
    boothCode: booth.boothData?.code || '',
    dx: Math.round(local.x * 100) / 100,
    dy: Math.round(local.y * 100) / 100,
    dAngle: Math.round(((el.angle || 0) - (booth.angle || 0)) * 100) / 100
  };
}

export function applyAnchor(el, booth, anchor) {
  const bc = booth.getCenterPoint();
  const off = rotate(anchor.dx || 0, anchor.dy || 0, booth.angle || 0);
  const angle = (((booth.angle || 0) + (anchor.dAngle || 0)) % 360 + 360) % 360;
  if (Math.abs((el.angle || 0) - angle) > 0.01) el.rotate(angle);
  setObjectCenter(el, new fabric.Point(bc.x + off.x, bc.y + off.y));
}

export function findAnchorBooth(anchor, booths) {
  if (!anchor) return null;
  if (anchor.boothId) {
    const byId = booths.find(b => String(b.boothData?.id || '') === String(anchor.boothId));
    if (byId) return byId;
  }
  const code = String(anchor.boothCode || '').trim().toLowerCase();
  return code ? booths.find(b => String(b.boothData?.code || '').trim().toLowerCase() === code) || null : null;
}

const salesBooths = (canvas) => canvas.getObjects().filter(o => o.isBooth && o.boothData && o.visible !== false);

// Move every anchored operational element onto its booth.
// Returns { orphans: elements whose booth was deleted, moved: number of elements that followed their booth }
export function resolveAnchors(canvas, objects) {
  const booths = salesBooths(canvas);
  const orphans = new Set();
  let moved = 0;
  objects.forEach(el => {
    const anchor = el.venueData?.anchor;
    if (!anchor) { if (el.venueData) delete el.venueData.anchorOrphaned; return; }
    const booth = findAnchorBooth(anchor, booths);
    if (!booth) {
      el.venueData.anchorOrphaned = true;
      orphans.add(el);
      return;
    }
    delete el.venueData.anchorOrphaned;
    // keep the anchor pointing at the booth's current id / code (booth renumbered by Sales)
    anchor.boothId = booth.boothData.id || anchor.boothId;
    anchor.boothCode = booth.boothData.code || anchor.boothCode;
    const before = objectCenterOf(el);
    const beforeAngle = el.angle || 0;
    applyAnchor(el, booth, anchor);
    const after = objectCenterOf(el);
    if (Math.hypot(after.x - before.x, after.y - before.y) > 0.5 || Math.abs((el.angle || 0) - beforeAngle) > 0.01) moved++;
  });
  return { orphans, moved };
}

function polygonOf(obj) {
  return obj.getCoords().map(p => ({ x: p.x, y: p.y }));
}

// Physical footprint of an element (library groups: their hit area, so a CCTV viewing cone or a caption
// never counts as "covering" a booth); scene coordinates
export function footprintPolygon(obj) {
  if (isLibraryElement(obj) && typeof obj.getObjects === 'function' && ELEMENTS[obj.venueData.type]?.kind !== 'queue') {
    const hit = obj.getObjects()[0];
    if (hit) {
      const m = fabric.util.multiplyTransformMatrices(obj.calcTransformMatrix(), hit.calcOwnMatrix());
      const w = hit.width || 0;
      const h = hit.height || 0;
      return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
        .map(([x, y]) => fabric.util.transformPoint(new fabric.Point(x, y), m));
    }
  }
  return polygonOf(obj);
}

const rectOfPolygon = (poly) => {
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

// Elements whose drawing reaches far beyond their footprint (CCTV viewing cone) must not steal clicks on booths:
// only their footprint is clickable in the operations mode
export const hasWideDrawing = (obj) => isLibraryElement(obj) && ELEMENTS[obj.venueData.type]?.kind === 'cctv';

// The booth whose area contains the element centre (suggested anchor)
export function boothUnder(el, canvas) {
  const c = objectCenterOf(el);
  return salesBooths(canvas).find(b => pointInPolygon(c, polygonOf(b))) || null;
}

// Kinds that never conflict with booths: zones are drawn over booths on purpose, text & measure lines are annotations
const NON_CONFLICT_KINDS = new Set(['area', 'text', 'measure']);

// Operational elements overlapping a booth they are not anchored to (e.g. a new booth now covers a CCTV)
export function findOpsConflicts(canvas, objects) {
  const booths = salesBooths(canvas).map(b => ({ b, poly: polygonOf(b), rect: b.getBoundingRect() }));
  const conflicts = new Map();
  objects.forEach(el => {
    if (el.visible === false) return;
    const kind = isLibraryElement(el) ? ELEMENTS[el.venueData.type]?.kind : null;
    if (kind && NON_CONFLICT_KINDS.has(kind)) return;
    const poly = footprintPolygon(el);
    const r = rectOfPolygon(poly);
    const c = objectCenterOf(el);
    const anchorBooth = findAnchorBooth(el.venueData?.anchor, booths.map(x => x.b));
    const hit = [];
    booths.forEach(({ b, poly: bp, rect: br }) => {
      if (b === anchorBooth) return;
      const ix = Math.min(r.left + r.width, br.left + br.width) - Math.max(r.left, br.left);
      const iy = Math.min(r.top + r.height, br.top + br.height) - Math.max(r.top, br.top);
      if (ix <= 0 || iy <= 0) return;
      const overlap = ix * iy;
      const smaller = Math.max(1, Math.min(r.width * r.height, br.width * br.height));
      if (pointInPolygon(c, bp) || pointInPolygon(b.getCenterPoint(), poly) || overlap / smaller >= 0.3) hit.push(b.boothData.code || '?');
    });
    if (hit.length) conflicts.set(el, hit);
  });
  return conflicts;
}

// ---------- "Perubahan dari Sales" ----------
const fmtM = (px, scale = 20) => `${(px / scale).toFixed(1).replace('.', ',')} m`;

// Differences between two booth snapshots ({ key: { code, cx, cy, w, h, angle, widthM, heightM, tenant } })
export function diffBoothSummaries(prev, next, { gridScale = 20, at = null } = {}) {
  if (!prev || !next) return [];
  const out = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  keys.forEach(key => {
    const a = prev[key];
    const b = next[key];
    if (!a && b) {
      out.push({ id: `${key}_add_${at || ''}`, type: 'added', key, code: b.code, text: `Booth ${b.code} ditambahkan`, detail: b.widthM && b.heightM ? `${b.widthM}×${b.heightM} m${b.tenant ? ` • ${b.tenant}` : ''}` : '', x: b.cx, y: b.cy, at });
      return;
    }
    if (a && !b) {
      out.push({ id: `${key}_del_${at || ''}`, type: 'removed', key, code: a.code, text: `Booth ${a.code} dihapus`, detail: a.tenant ? `Tenant sebelumnya: ${a.tenant}` : '', x: a.cx, y: a.cy, at });
      return;
    }
    const code = b.code || a.code;
    if (a.code !== b.code) out.push({ id: `${key}_code_${at || ''}`, type: 'renamed', key, code, text: `Nomor booth ${a.code} → ${b.code}`, detail: '', x: b.cx, y: b.cy, at });
    const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    if (dist > 2) out.push({ id: `${key}_move_${at || ''}`, type: 'moved', key, code, text: `Booth ${code} dipindah`, detail: `bergeser ${fmtM(dist, gridScale)}`, x: b.cx, y: b.cy, at });
    if (Math.abs(a.w - b.w) > 1 || Math.abs(a.h - b.h) > 1 || a.widthM !== b.widthM || a.heightM !== b.heightM) {
      out.push({ id: `${key}_size_${at || ''}`, type: 'resized', key, code, text: `Ukuran booth ${code} diubah`, detail: `${a.widthM ?? '?'}×${a.heightM ?? '?'} → ${b.widthM ?? '?'}×${b.heightM ?? '?'} m`, x: b.cx, y: b.cy, at });
    }
    if (a.angle !== b.angle) out.push({ id: `${key}_rot_${at || ''}`, type: 'rotated', key, code, text: `Booth ${code} diputar`, detail: `${a.angle}° → ${b.angle}°`, x: b.cx, y: b.cy, at });
    if ((a.tenant || '') !== (b.tenant || '')) {
      out.push({
        id: `${key}_tenant_${at || ''}`, type: 'tenant', key, code,
        text: b.tenant ? (a.tenant ? `Ganti tenant booth ${code}` : `Tenant baru di booth ${code}`) : `Tenant booth ${code} dilepas`,
        detail: a.tenant && b.tenant ? `${a.tenant} → ${b.tenant}` : (b.tenant || a.tenant), x: b.cx, y: b.cy, at
      });
    }
  });
  return out;
}

// Booth snapshot straight from the live canvas (same shape as the server's boothSummaryFromFabric)
export function boothSummaryFromCanvas(canvas) {
  const out = {};
  salesBooths(canvas).forEach(b => {
    const key = boothKeyOf(b.boothData);
    if (!key) return;
    const c = b.getCenterPoint();
    out[key] = {
      id: b.boothData.id || '', code: b.boothData.code || '',
      cx: Math.round(c.x * 10) / 10, cy: Math.round(c.y * 10) / 10,
      w: Math.round((b.width || 0) * Math.abs(b.scaleX || 1) * 10) / 10, h: Math.round((b.height || 0) * Math.abs(b.scaleY || 1) * 10) / 10,
      angle: Math.round(b.angle || 0), widthM: b.boothData.widthM ?? null, heightM: b.boothData.heightM ?? null,
      tenant: String(b.boothData.ownerName || '').trim()
    };
  });
  return out;
}

// ---------- summary & legend ----------
export const opsTypeKey = (obj) => (obj.venueData?.lib ? `lib:${obj.venueData.type}` : `venue:${obj.venueData?.type || obj.type}`);

// Element counts per type (for the Inspector summary & export legend)
export function opsTypeCounts(objects) {
  const map = new Map();
  objects.forEach(o => {
    if (!o.venueData) return;
    const key = opsTypeKey(o);
    const cur = map.get(key) || { key, type: o.venueData.type, lib: Boolean(o.venueData.lib), name: defaultCaption(o.venueData), count: 0 };
    cur.count++;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Emoji used by an original venue item template ("🧯 APAR K3" -> "🧯")
export function venueEmoji(type) {
  const text = String(VENUE_TEMPLATES[type]?.text || '').trim();
  const first = text.split(' ')[0];
  if (first && !/^[A-Za-z0-9]/.test(first)) return first;
  if (FURNITURE_TEMPLATES[type]) return '🪑';
  return '▦';
}

// Draw a library icon (24x24 path data) on a 2D context
export function drawLibraryIcon(ctx, type, x, y, size, color) {
  const parts = ICONS[type] || [];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color || accentOf(type);
  ctx.fillStyle = color || accentOf(type);
  parts.forEach(part => {
    const path = new Path2D(part.d);
    ctx.setLineDash(part.dash ? [2.2, 2] : []);
    if (part.fill) ctx.fill(path);
    ctx.stroke(path);
  });
  ctx.restore();
}

// ---------- canvas overlay (setup status colours, conflicts, orphans, locked sales selection) ----------
function badge(ctx, x, y, r, fill, glyph) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(r * 1.25)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x, y + r * 0.05);
  ctx.restore();
}

function screenPoly(obj, vpt) {
  return (obj.isBooth ? obj.getCoords() : footprintPolygon(obj)).map(p => fabric.util.transformPoint(p, vpt));
}

/**
 * Paint the operational overlay on ctx (canvas 'after:render'): setup-status colour per booth, warning badges on
 * conflicting / orphaned elements, lock badge on the inspected sales object and a pulse at a focused point.
 */
export function drawOpsOverlay(canvas, ctx, { boothOps = {}, conflicts = new Map(), orphans = new Set(), inspected = null, focus = null, showSetup = true } = {}) {
  if (!canvas || !ctx || ctx === canvas.contextTop) return;
  const vpt = canvas.viewportTransform;
  const zoom = Math.hypot(vpt[0], vpt[1]) || 1;
  const isExport = ctx !== canvas.contextContainer;
  const screenZoom = isExport ? (canvas.__captionScreenZoom || zoom) : zoom;
  const scale = isExport ? zoom / screenZoom : 1;
  ctx.save();

  if (showSetup) {
    salesBooths(canvas).forEach(b => {
      const data = boothOps[boothKeyOf(b.boothData)];
      const status = SETUP_STATUS[data?.setupStatus || 'belum_datang'] || SETUP_STATUS.belum_datang;
      const pts = screenPoly(b, vpt);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = status.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, 2.5 * scale);
      ctx.strokeStyle = status.color;
      ctx.setLineDash([]);
      ctx.stroke();
      // status pill in the booth's top-left corner once the booth is big enough on screen
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const w = Math.max(...xs) - Math.min(...xs);
      if (w > 70 * scale && data) {
        const font = 9 * scale;
        ctx.font = `bold ${font}px system-ui, sans-serif`;
        const tw = ctx.measureText(status.label).width + 8 * scale;
        const x0 = Math.min(...xs) + 3 * scale;
        const y0 = Math.max(...ys) - font - 7 * scale;
        ctx.fillStyle = status.color;
        if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x0, y0, tw, font + 4 * scale, 3 * scale); ctx.fill(); } else ctx.fillRect(x0, y0, tw, font + 4 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(status.label, x0 + 4 * scale, y0 + (font + 4 * scale) / 2 + 0.5);
      }
    });
  }

  // Special design booths: their own colour (always shown, also with the setup status hidden) + a label
  salesBooths(canvas).forEach(b => {
    const data = boothOps[boothKeyOf(b.boothData)];
    if (!data?.specialDesign) return;
    const color = data.specialColor || SPECIAL_DESIGN_DEFAULT_COLOR;
    const pts = screenPoly(b, vpt);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(3, 3.5 * scale);
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.stroke();
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    if (w > 56 * scale) {
      const font = 8.5 * scale;
      const label = 'SPECIAL DESIGN';
      ctx.font = `bold ${font}px system-ui, sans-serif`;
      const tw = Math.min(w - 6 * scale, ctx.measureText(label).width + 8 * scale);
      const x0 = Math.max(...xs) - tw - 3 * scale;
      const y0 = Math.min(...ys) + 3 * scale;
      ctx.fillStyle = color;
      if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x0, y0, tw, font + 4 * scale, 3 * scale); ctx.fill(); } else ctx.fillRect(x0, y0, tw, font + 4 * scale);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, tw, font + 4 * scale);
      ctx.clip();
      ctx.fillText(label, x0 + 4 * scale, y0 + (font + 4 * scale) / 2 + 0.5);
      ctx.restore();
    }
  });

  const r = Math.max(7, 9 * scale);
  conflicts.forEach((codes, el) => {
    if (!el.canvas || el.visible === false) return;
    const pts = screenPoly(el, vpt);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.setLineDash([5 * scale, 3 * scale]);
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = '#e11d48';
    ctx.stroke();
    ctx.setLineDash([]);
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    badge(ctx, Math.max(...xs), Math.min(...ys), r, '#e11d48', '!');
  });
  orphans.forEach(el => {
    if (!el.canvas || el.visible === false) return;
    const pts = screenPoly(el, vpt);
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    badge(ctx, Math.min(...xs), Math.min(...ys), r, '#f97316', '?');
  });

  if (inspected && inspected.canvas && !isExport) {
    const pts = screenPoly(inspected, vpt);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#334155';
    ctx.stroke();
    ctx.setLineDash([]);
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    badge(ctx, Math.max(...xs), Math.min(...ys), 11, '#334155', '🔒');
  }

  if (focus && !isExport && Date.now() - focus.at < 2600) {
    const p = fabric.util.transformPoint(new fabric.Point(focus.x, focus.y), vpt);
    const t = ((Date.now() - focus.at) % 900) / 900;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12 + t * 26, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(79, 70, 229, ${1 - t})`;
    ctx.stroke();
  }
  ctx.restore();
}

export const opsDisplayName = (obj) => captionText(obj);
