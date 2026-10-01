// Tenant name inside a booth: ONE logic for every booth (single booths in floorplanUtils.js, merged groups in
// boothMerge.js), in the Studio, Denah Operasional, Live Floorplan and exports.
//
// The name is shown as large as the free area of the booth allows:
//   - 1 line, or 2 lines for a name of several words (a single word is never cut in the middle);
//   - horizontal, or vertical (rotated 90 deg counter-clockwise, read from bottom to top);
//   - vertical only when it is clearly larger (> 10 %), otherwise horizontal, which is easier to read;
//   - never upside down or read from top to bottom: the direction is decided from what is seen on the screen,
//     so a rotated booth is handled through `frameAngle` (the on-screen angle of the booth's own frame);
//   - between a minimum and a maximum size; a name that does not fit at the minimum is cut with "…".
// `direction` ("Arah Nama Tenant"): 'auto' (default) | 'horizontal' | 'vertical'; the size is always automatic.

export const NAME_DIRECTIONS = ['auto', 'horizontal', 'vertical'];
export const NAME_DIRECTION_LABELS = { auto: 'Otomatis', horizontal: 'Horizontal', vertical: 'Vertikal' };
export const nameDirectionOf = (boothData) => (NAME_DIRECTIONS.includes(boothData?.nameDirection) ? boothData.nameDirection : 'auto');

// Smallest / largest name, relative to the floorplan scale: 0,25 m high at least; at most 42 % of the booth's shortest side
export const MIN_NAME_M = 0.25;
export const maxNameSize = (shortestSidePx, smallLabelPx = 0) => Math.max(smallLabelPx * 1.2, shortestSidePx * 0.42);

const LINE_HEIGHT = 1.12;
const VERTICAL_GAIN = 1.1; // vertical must be > 10 % larger than horizontal to be chosen
export const NAME_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Text width per 1 px of font size, measured once per text + font (the canvas stays light with many booths)
let measureCtx = null;
const widthCache = new Map();
function unitWidth(text, weight, family) {
  const key = `${weight}|${family}|${text}`;
  if (widthCache.has(key)) return widthCache.get(key);
  let w;
  try {
    if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
    if (measureCtx) {
      measureCtx.font = `${weight} 100px ${family}`;
      w = measureCtx.measureText(text).width / 100;
    }
  } catch (e) { /* no canvas (tests): estimate below */ }
  if (!Number.isFinite(w) || w <= 0) w = text.length * 0.6;
  if (widthCache.size > 4000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

// 1 line, and for several words the most balanced 2-line split ("PT" / "CV" stay with the next word)
function lineOptions(name) {
  const words = name.split(/\s+/).filter(Boolean);
  const options = [[words.join(' ')]];
  if (words.length > 1) {
    const minSplit = /^(PT|CV|UD|TB)\.?$/i.test(words[0]) && words.length > 2 ? 2 : 1;
    let best = null;
    for (let i = minSplit; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const diff = Math.abs(l1.length - l2.length);
      if (!best || diff < best.diff) best = { lines: [l1, l2], diff };
    }
    if (best) options.push(best.lines);
  }
  return options;
}

const norm180 = (deg) => {
  let a = ((deg % 360) + 360) % 360;
  if (a >= 180) a -= 360;
  return a; // [-180, 180)
};
// Readable on screen: between -90 (bottom to top) and just below +90; never upside down, never top to bottom
const readable = (screenDeg) => { const a = norm180(screenDeg); return a >= -90.001 && a < 89.999; };

function truncate(line, maxUnits, weight, family) {
  if (unitWidth(line, weight, family) <= maxUnits) return { text: line, cut: false };
  let t = line;
  while (t.length > 1 && unitWidth(`${t}…`, weight, family) > maxUnits) t = t.slice(0, -1);
  return { text: `${t.trimEnd()}…`, cut: true };
}

const resultCache = new Map();

/**
 * Fit a tenant name in a box of the booth's own frame.
 *   boxW / boxH   free area for the name, in the booth's frame (canvas px)
 *   frameAngle    on-screen angle of that frame in degrees (booth angle; 0 for an unrotated booth)
 * Returns { lines, size, localAngle (deg, to rotate the text inside the frame), vertical, truncated } or null.
 */
export function fitTenantName(name, boxW, boxH, {
  frameAngle = 0, direction = 'auto', maxSize = 40, minSize = 5, weight = '800', family = NAME_FONT_FAMILY
} = {}) {
  const text = String(name || '').trim();
  if (!text || !(boxW > 0) || !(boxH > 0)) return null;
  const key = [text, Math.round(boxW * 2) / 2, Math.round(boxH * 2) / 2, Math.round(norm180(frameAngle)), direction, Math.round(maxSize * 10) / 10, minSize, weight, family].join('|');
  if (resultCache.has(key)) return resultCache.get(key);

  // The two ways to lay the text in the frame (along its width or along its height), each in its readable variant
  const layouts = [
    { along: boxW, across: boxH, local: readable(frameAngle) ? 0 : 180 },
    { along: boxH, across: boxW, local: readable(frameAngle - 90) ? -90 : 90 }
  ].map(l => ({ ...l, screen: norm180(frameAngle + l.local) }));
  // "Horizontal" = the layout closest to level on the screen, "vertical" = the other one
  const [first, second] = layouts;
  const horizontal = Math.abs(first.screen) <= Math.abs(second.screen) ? first : second;
  const vertical = horizontal === first ? second : first;

  const best = (layout) => lineOptions(text).reduce((acc, lines) => {
    const widest = Math.max(...lines.map(l => unitWidth(l, weight, family)));
    const size = Math.min(maxSize, layout.along / widest, layout.across / (lines.length * LINE_HEIGHT));
    return !acc || size > acc.size + 0.01 ? { size, lines, layout } : acc;
  }, null);
  const h = best(horizontal);
  const v = best(vertical);
  let pick = direction === 'horizontal' ? h : direction === 'vertical' ? v : (v.size > h.size * VERTICAL_GAIN ? v : h);

  let truncated = false;
  // No room for even one line at the minimum size: nothing is shown
  if (pick.layout.across < minSize * 0.9) { resultCache.set(key, null); return null; }
  if (pick.size < minSize) {
    // Does not fit at the minimum size: keep the minimum and cut the line(s) with "…"
    const maxLines = Math.max(1, Math.min(pick.lines.length, Math.floor(pick.layout.across / (minSize * LINE_HEIGHT))));
    const lines = (maxLines < pick.lines.length ? [pick.lines.join(' ')] : pick.lines)
      .map(l => { const t = truncate(l, pick.layout.along / minSize, weight, family); truncated = truncated || t.cut; return t.text; });
    pick = { ...pick, size: minSize, lines };
  }
  const result = {
    lines: pick.lines,
    size: Math.round(pick.size * 100) / 100,
    localAngle: pick.layout.local,
    vertical: pick.layout === vertical,
    truncated,
    lineHeight: LINE_HEIGHT
  };
  if (resultCache.size > 4000) resultCache.clear();
  resultCache.set(key, result);
  return result;
}
