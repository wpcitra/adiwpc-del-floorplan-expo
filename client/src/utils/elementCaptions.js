import * as fabric from 'fabric';
import { ELEMENTS, elementCenter } from './elementLibrary';
import { DOOR_TYPES, getDoorOpeningCenter } from './doorSymbols';
import { VENUE_TEMPLATES } from './floorplanUtils';

// Element captions: the short Indonesian name shown next to every element icon on the Studio canvas,
// the Live Floorplan and exported images/PDF. Captions are painted as an overlay in 'after:render'
// (screen-space), so they never change an element's shape, selection box or saved geometry.
//
// Data per element (venueData, saved with the canvas JSON and venue_items.properties_json):
//   caption      custom text from the admin ('' = use the default name)
//   showCaption  false hides this element's caption (default: shown)
// Library elements & doors mirror the custom caption in venueData.label (Layers panel, exports).
// Floorplan-wide switch: metadata.display.showCaptions (false = all captions hidden).

export const CAPTION_HIDE_ZOOM = 0.45; // below this zoom the canvas is too small to read captions

// Short default names for the library elements
const LIB_CAPTIONS = {
  pilar_persegi: 'Pilar', ramp: 'Ramp', lift: 'Lift', eskalator: 'Eskalator',
  zone: 'Zona', aisle: 'Lorong', flow_arrow: 'Alur Pengunjung', wheelchair_path: 'Jalur Kursi Roda', assembly_point: 'Titik Kumpul',
  ticket_area: 'Area Ticketing', ticket_box: 'Loket Tiket', wristband_exchange: 'Penukaran Gelang', queue_line: 'Jalur Antre',
  stanchion: 'Barikade', vip_lane: 'Jalur VIP', ticket_checker: 'Pemindai Tiket', entrance_gate: 'Gerbang Masuk',
  turnstile: 'Turnstile', bag_check: 'Pemeriksaan Tas', exit_gate: 'Gerbang Keluar', reg_exhibitor: 'Registrasi Exhibitor',
  reg_media: 'Registrasi Media', cloakroom: 'Penitipan Barang',
  power_point: 'Titik Listrik', water_point: 'Titik Air', wifi: 'WiFi', lan_point: 'Titik LAN', rigging_point: 'Rigging Point',
  electric_panel: 'Panel Listrik', led_screen: 'Layar LED', backdrop: 'Backdrop', rollup_banner: 'Roll Up Banner',
  umbul: 'Umbul-umbul', photo_booth: 'Photo Booth', totem: 'Totem Penunjuk', committee_room: 'Ruang Panitia', cctv: 'CCTV',
  musholla: 'Musholla', wudhu: 'Tempat Wudhu', measure: 'Alat Ukur'
};

// Short default names for the original venue & furniture items
const VENUE_CAPTIONS = {
  stage: 'Panggung Utama', regdesk: 'Meja Registrasi', toilet: 'Toilet', exit: 'Pintu Darurat', stairs: 'Tangga',
  apar: 'APAR', hydrant: 'Hydrant & P3K', waste: 'Tempat Sampah', pillar: 'Tiang', loading: 'Loading Dock',
  storage: 'Gudang', greenroom: 'Green Room', security: 'Pos Keamanan', signage: 'Papan Petunjuk', plants: 'Tanaman',
  atm: 'ATM & Charging', floorbox: 'Floor Box', rigging: 'Rigging Truss', sound: 'Sound System', lighting: 'Lampu Sorot',
  foh: 'FOH', entrance: 'Pintu Masuk', cafe: 'Food Court & Kafe',
  chair_square: 'Kursi', chair_round: 'Kursi Bulat', chair_office: 'Kursi Kantor', chair_lounge: 'Sofa', chair_dining: 'Kursi Makan'
};

// Labels written automatically by older versions (not a custom name from the admin)
const LEGACY_AUTO_LABELS = new Set([
  'MAIN STAGE & PRESENTATION', 'MAIN ENTRANCE / REGISTRATION', 'EMERGENCY EXIT', 'RESTROOM & VIP LOUNGE', 'FOOD COURT & CAFE', 'PILLAR'
]);

// No caption: walls are plain lines and a free text label is already text
const NO_CAPTION_TYPES = new Set(['wall', 'wall_line', 'text_label']);
// Large original venue blocks: caption inside the block, under their own emoji label
const VENUE_AREA_TYPES = new Set(['stage', 'loading', 'storage', 'greenroom', 'toilet', 'cafe', 'entrance']);
const LINE_KINDS = new Set(['aisle', 'lane', 'queue', 'measure', 'path']);

export function isCaptionable(obj) {
  return Boolean(obj && obj.isVenueItem && !obj.isBooth && obj.venueData?.type && !NO_CAPTION_TYPES.has(obj.venueData.type));
}

export function defaultCaption(vd = {}) {
  if (vd.type === 'door') return DOOR_TYPES[vd.doorType]?.name || 'Pintu';
  if (vd.lib) return LIB_CAPTIONS[vd.type] || ELEMENTS[vd.type]?.name || 'Elemen';
  return VENUE_CAPTIONS[vd.type] || 'Fasilitas';
}

// Custom caption set by the admin ('' when the default name is used)
export function customCaption(vd = {}) {
  if (typeof vd.caption === 'string') return vd.caption.trim();
  // Saved before captions existed: library elements & doors used their label as the name
  if (vd.type === 'door' || vd.lib) return String(vd.label || '').trim();
  // Original venue items: a label the admin edited (different from the template text) is the custom name
  const label = String(vd.label || '').trim();
  const templateText = VENUE_TEMPLATES[vd.type]?.text;
  if (label && label !== templateText && !LEGACY_AUTO_LABELS.has(label)) return label;
  return '';
}

export const captionText = (obj) => customCaption(obj?.venueData) || defaultCaption(obj?.venueData);
export const isCaptionShown = (obj) => obj?.venueData?.showCaption !== false;

// Caption placement family of an element
function placementOf(vd) {
  if (vd.type === 'door') return 'point';
  if (vd.lib) {
    const kind = ELEMENTS[vd.type]?.kind;
    if (kind === 'area') return 'area';
    if (LINE_KINDS.has(kind)) return 'line';
    return 'point';
  }
  return VENUE_AREA_TYPES.has(vd.type) ? 'area' : 'point';
}

// ---------- geometry helpers (screen space) ----------
const norm360 = (a) => ((Math.round(a || 0) % 360) + 360) % 360;
const aabbOf = (pts) => {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const inRect = (r, x, y) => r && x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

// Screen AABB of a local box (w x h centred on the object's own centre) through a full matrix
function boxAabb(matrix, w, h) {
  return aabbOf([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => fabric.util.transformPoint(new fabric.Point(x, y), matrix)));
}

// Screen rectangles of the booth number / tenant texts: captions must never cover them
function boothLabelRects(canvas, vpt) {
  const rects = [];
  canvas.getObjects().forEach(o => {
    if (!o.isBooth || o.visible === false || typeof o.getObjects !== 'function') return;
    o.getObjects().forEach(child => {
      const t = (child.type || '').toLowerCase();
      if (child.visible === false || !(t === 'text' || t === 'i-text' || t === 'textbox' || t === 'fabrictext')) return;
      if (!String(child.text || '').trim()) return;
      const m = fabric.util.multiplyTransformMatrices(vpt, child.calcTransformMatrix());
      rects.push(boxAabb(m, child.width || 0, child.height || 0));
    });
  });
  return rects;
}

// Element footprint in screen space: centre, rotation, size along its own axes and AABB
function footprint(obj, vpt, zoom) {
  const vd = obj.venueData;
  const angle = obj.angle || 0;
  let centre;
  let w;
  let h;
  if (vd.type === 'door') {
    centre = getDoorOpeningCenter(obj);
    const hit = obj.getObjects?.()[0];
    w = (hit?.width || obj.width || 0) * Math.abs(obj.scaleX || 1);
    h = (hit?.height || obj.height || 0) * Math.abs(obj.scaleY || 1);
  } else if (vd.lib && ELEMENTS[vd.type]?.kind !== 'queue' && typeof obj.getObjects === 'function') {
    centre = elementCenter(obj);
    const hit = obj.getObjects()[0];
    w = (hit?.width || obj.width || 0) * Math.abs(obj.scaleX || 1);
    h = (hit?.height || obj.height || 0) * Math.abs(obj.scaleY || 1);
  } else {
    centre = obj.getCenterPoint();
    w = (obj.width || 0) * Math.abs(obj.scaleX || 1);
    h = (obj.height || 0) * Math.abs(obj.scaleY || 1);
  }
  const c = fabric.util.transformPoint(centre, vpt);
  const rad = fabric.util.degreesToRadians(angle);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const sw = w * zoom;
  const sh = h * zoom;
  const halfX = (sw * cos + sh * sin) / 2;
  const halfY = (sw * sin + sh * cos) / 2;
  return { cx: c.x, cy: c.y, angle, sw, sh, rect: { minX: c.x - halfX, minY: c.y - halfY, maxX: c.x + halfX, maxY: c.y + halfY } };
}

// Readable caption rotation: 90° / 270° elements keep a sideways caption, every other angle stays horizontal
function sidewaysRotation(angle) {
  const a = norm360(angle);
  if (Math.abs(a - 90) <= 2) return 90;
  if (Math.abs(a - 270) <= 2) return -90;
  return 0;
}

// Line direction normalised so the text never reads upside down
function lineRotation(angle) {
  let a = norm360(angle);
  if (a > 90 && a <= 270) a -= 180;
  else if (a > 270) a -= 360;
  return a;
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return { shown: text, truncated: false };
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return { shown: `${s.trimEnd()}…`, truncated: true };
}

function rotatedBoxAabb(cx, cy, w, h, deg) {
  const rad = fabric.util.degreesToRadians(deg);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const hx = (w * cos + h * sin) / 2;
  const hy = (w * sin + h * cos) / 2;
  return { minX: cx - hx, minY: cy - hy, maxX: cx + hx, maxY: cy + hy };
}

function drawBadge(ctx, { cx, cy, w, h, rot, text, font, scale, highlight }) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(fabric.util.degreesToRadians(rot));
  const r = Math.min(4 * scale, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -h / 2, w, h, r);
  else ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = highlight ? 'rgba(238, 242, 255, 0.96)' : 'rgba(255, 255, 255, 0.86)';
  ctx.fill();
  ctx.lineWidth = Math.max(0.75, 0.9 * scale);
  ctx.strokeStyle = highlight ? 'rgba(79, 70, 229, 0.85)' : 'rgba(15, 23, 42, 0.18)';
  ctx.stroke();
  ctx.fillStyle = '#1e293b';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.5 * scale);
  ctx.restore();
}

/**
 * Paint every element caption on ctx (called from the canvas 'after:render' event).
 * Returns hit info for hover / tap: [{ obj, text, truncated, drawn, rect, elementRect }].
 *   enabled     global "Tampilkan Semua Caption"
 *   highlightId venueData.id of the caption to emphasise (hovered / tapped element)
 */
export function drawElementCaptions(canvas, ctx, { enabled = true, highlightId = null } = {}) {
  if (!canvas || !ctx || !enabled) return [];
  // renderTop() also fires after:render for the selection layer: captions belong to the main layer only
  if (ctx === canvas.contextTop) return null;

  const vpt = canvas.viewportTransform;
  const zoom = Math.hypot(vpt[0], vpt[1]) || 1;
  // Exports (toDataURL / PDF) render through a temporary viewport scaled by the export multiplier
  const isExport = ctx !== canvas.contextContainer;
  const screenZoom = isExport ? (canvas.__captionScreenZoom || zoom) : zoom;
  if (!isExport) canvas.__captionScreenZoom = zoom;
  const scale = isExport ? zoom / screenZoom : 1;
  const tooSmall = !isExport && zoom < CAPTION_HIDE_ZOOM;

  const fontPx = Math.max(9, Math.min(14, 11 * Math.pow(screenZoom, 0.35))) * scale;
  const font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padX = 5 * scale;
  const boxH = fontPx + 6 * scale;
  const gap = 3 * scale;

  const hits = [];
  const obstacles = tooSmall ? [] : boothLabelRects(canvas, vpt);
  ctx.save();
  ctx.font = font;

  canvas.getObjects().forEach(obj => {
    if (!isCaptionable(obj) || obj.visible === false || !isCaptionShown(obj)) return;
    const vd = obj.venueData;
    const text = captionText(obj);
    if (!text) return;
    const fp = footprint(obj, vpt, zoom);
    const hit = { obj, text, truncated: false, drawn: false, rect: null, elementRect: fp.rect };
    hits.push(hit);
    if (tooSmall) return;

    const place = placementOf(vd);
    const def = vd.lib ? ELEMENTS[vd.type] : null;
    // rot: caption angle. A rotated caption follows the element's own axes; a horizontal one uses the screen box.
    const rot = place === 'line' ? lineRotation(fp.angle) : sidewaysRotation(fp.angle);
    const aligned = place === 'line' || rot !== 0;
    const availW = aligned ? fp.sw : fp.rect.maxX - fp.rect.minX;
    const halfAcross = (aligned ? fp.sh : fp.rect.maxY - fp.rect.minY) / 2;
    let maxW;
    if (place === 'line') maxW = Math.max(60 * scale, (def?.kind === 'queue' ? Math.max(fp.sw, fp.sh) : fp.sw) * 0.85);
    else if (place === 'area') maxW = Math.max(40 * scale, availW - 10 * scale);
    else maxW = Math.min(170 * scale, Math.max(90 * scale, availW * 1.6));
    const { shown, truncated } = truncate(ctx, text, maxW - padX * 2);
    hit.truncated = truncated;
    const boxW = ctx.measureText(shown).width + padX * 2;

    // Candidate centres, best first (offsets along the caption's axes, converted to screen)
    const rad = fabric.util.degreesToRadians(rot);
    const localToScreen = (dx, dy) => ({
      x: fp.cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: fp.cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    });
    const candidates = [];
    if (place === 'line') {
      if (def?.kind === 'measure') {
        const tick = Math.max(4, (vd.gridScale || 20) * 0.35) * zoom;
        candidates.push(localToScreen(0, tick + gap + boxH / 2), localToScreen(0, -(tick + gap + boxH * 1.9)));
      } else {
        candidates.push(localToScreen(0, 0), localToScreen(0, halfAcross + gap + boxH / 2), localToScreen(0, -(halfAcross + gap + boxH / 2)));
      }
    } else if (place === 'area') {
      // Original blocks carry their own emoji label in the middle: sit just under it
      const down = vd.lib ? 0 : Math.min(12, (vd.height || fp.sh / zoom) * 0.55) * zoom * 0.5 + gap + boxH / 2;
      candidates.push(localToScreen(0, down));
      if (down + boxH * 1.5 + gap < halfAcross) candidates.push(localToScreen(0, down + boxH + gap));
      candidates.push(localToScreen(0, -(down || boxH + gap)));
      candidates.push(localToScreen(0, halfAcross + gap + boxH / 2));
    } else if (rot) {
      // Sideways element (90° / 270°): caption along its long side, on the element's "below" side first
      const off = halfAcross + gap + boxH / 2;
      candidates.push(localToScreen(0, off), localToScreen(0, -off));
    } else {
      candidates.push(
        { x: fp.cx, y: fp.rect.maxY + gap + boxH / 2 },
        { x: fp.cx, y: fp.rect.minY - gap - boxH / 2 },
        { x: fp.rect.maxX + gap + boxW / 2, y: fp.cy },
        { x: fp.rect.minX - gap - boxW / 2, y: fp.cy }
      );
    }

    // First spot that covers no booth label and no other caption (auto-shift); otherwise skip (hover/tap still shows it)
    let chosen = null;
    for (const c of candidates) {
      const r = rotatedBoxAabb(c.x, c.y, boxW, boxH, rot);
      if (!obstacles.some(o => overlaps(o, r))) { chosen = { ...c, r }; break; }
    }
    if (!chosen) return;
    obstacles.push(chosen.r);
    drawBadge(ctx, { cx: chosen.x, cy: chosen.y, w: boxW, h: boxH, rot, text: shown, font, scale, highlight: highlightId && vd.id === highlightId });
    hit.drawn = true;
    hit.rect = chosen.r;
  });

  ctx.restore();
  return hits;
}

// Caption under the pointer (viewport coordinates). Captions win over element bodies; topmost element first.
export function findCaptionHit(hits, x, y) {
  if (!Array.isArray(hits)) return null;
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i].drawn && inRect(hits[i].rect, x, y)) return { ...hits[i], on: 'caption' };
  for (let i = hits.length - 1; i >= 0; i--) if (inRect(hits[i].elementRect, x, y)) return { ...hits[i], on: 'element' };
  return null;
}
