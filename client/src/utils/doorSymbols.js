import * as fabric from 'fabric';

// ---------------------------------------------------------------------------
// Architectural door symbols (plan view).
//
// Every symbol is described once, as vector primitives in a local frame where the door
// opening runs from x = 0 to x = W along the wall line y = 0 and the door swings toward -y.
// The same primitives render the SVG previews in the catalog and the Fabric paths on the
// canvas, so both always look identical. Mirroring (hinge side) and swing direction are
// baked into the geometry instead of flipping the Fabric group, so labels never mirror.
// ---------------------------------------------------------------------------

export const DOOR_TYPES = {
  single: { id: 'single', name: 'Pintu Tunggal', nameEn: 'Single Door', defaultWidthM: 0.9 },
  double: { id: 'double', name: 'Pintu Ganda', nameEn: 'Double Door', defaultWidthM: 1.8 },
  sliding: { id: 'sliding', name: 'Pintu Geser', nameEn: 'Sliding Door', defaultWidthM: 1.8 },
  pocket: { id: 'pocket', name: 'Pintu Kantong', nameEn: 'Pocket Door', defaultWidthM: 0.9 },
  bifold: { id: 'bifold', name: 'Pintu Lipat', nameEn: 'Bifold Door', defaultWidthM: 1.2 },
  revolving: { id: 'revolving', name: 'Pintu Putar', nameEn: 'Revolving Door', defaultWidthM: 2.4 }
};

export const DOOR_WIDTH_PRESETS = [0.9, 1.2, 1.8, 2.4, 3];
export const DOOR_MIN_WIDTH_M = 0.5;
export const DOOR_MAX_WIDTH_M = 10;

const INK = '#0f172a';
const WALL_TYPES = ['wall', 'wall_line'];
const WALL_CUT_NAME = 'door-wall-cut'; // child located by name ('name' is serialized with the canvas)

export const clampDoorWidth = (value) => {
  const n = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(DOOR_MAX_WIDTH_M, Math.max(DOOR_MIN_WIDTH_M, Math.round(n * 100) / 100));
};

// Primitives: { kind: 'wall' | 'leaf' | 'swing' | 'panel' | 'outline', ... one geometry key }
//   line: [x1, y1, x2, y2] | polyline: [[x, y], ...] | arc: { from, to, r, sweep }
//   rect: [x, y, w, h]     | circle: { cx, cy, r }
function doorPrimitives(doorType, W) {
  const S = W * 0.3;                 // wall stub drawn on each side of the opening
  const p = Math.max(W * 0.07, 2.5); // sliding / pocket panel thickness
  const walls = [{ kind: 'wall', line: [-S, 0, 0, 0] }, { kind: 'wall', line: [W, 0, W + S, 0] }];

  switch (doorType) {
    case 'double':
      return [
        ...walls,
        { kind: 'leaf', line: [0, 0, 0, -W / 2] },
        { kind: 'leaf', line: [W, 0, W, -W / 2] },
        { kind: 'swing', arc: { from: [0, -W / 2], to: [W / 2, 0], r: W / 2, sweep: 1 } },
        { kind: 'swing', arc: { from: [W, -W / 2], to: [W / 2, 0], r: W / 2, sweep: 0 } }
      ];
    case 'sliding':
      return [
        ...walls,
        { kind: 'panel', rect: [0, -p, W * 0.58, p] },
        { kind: 'panel', rect: [W * 0.42, 0, W * 0.58, p] }
      ];
    case 'pocket':
      return [
        { kind: 'wall', line: [-W - S, 0, -W, 0] },
        { kind: 'outline', rect: [-W, -p, W, p * 2] },     // wall cavity
        { kind: 'panel', rect: [-W * 0.75, -p / 2, W, p] }, // panel, mostly slid into the cavity
        { kind: 'wall', line: [W, 0, W + S, 0] }
      ];
    case 'bifold': {
      const h = W * 0.2;
      return [
        ...walls,
        { kind: 'leaf', polyline: [[0, 0], [W / 4, -h], [W / 2, 0], [(3 * W) / 4, -h], [W, 0]] },
        { kind: 'swing', arc: { from: [0, 0], to: [W / 2, 0], r: W / 4, sweep: 1 } },
        { kind: 'swing', arc: { from: [W / 2, 0], to: [W, 0], r: W / 4, sweep: 1 } }
      ];
    }
    case 'revolving': {
      const R = W / 2;
      const cx = W / 2;
      const d = R * 0.7 * Math.SQRT1_2;
      return [
        ...walls,
        { kind: 'swing', circle: { cx, cy: 0, r: R } },
        { kind: 'leaf', arc: { from: [cx - R * 0.866, R * 0.5], to: [cx - R * 0.866, -R * 0.5], r: R, sweep: 1 } },
        { kind: 'leaf', arc: { from: [cx + R * 0.866, -R * 0.5], to: [cx + R * 0.866, R * 0.5], r: R, sweep: 1 } },
        { kind: 'leaf', line: [cx - d, -d, cx + d, d] },
        { kind: 'leaf', line: [cx - d, d, cx + d, -d] },
        // rotation arrow on top of the circle, pointing clockwise
        { kind: 'leaf', polyline: [[cx - R * 0.2, -R - R * 0.14], [cx, -R], [cx - R * 0.2, -R + R * 0.14]] }
      ];
    }
    case 'single':
    default:
      return [
        ...walls,
        { kind: 'leaf', line: [0, 0, 0, -W] },
        { kind: 'swing', arc: { from: [0, -W], to: [W, 0], r: W, sweep: 1 } }
      ];
  }
}

const fmt = (n) => Number(n.toFixed(2));

// Converts a primitive to SVG path data, applying hinge mirroring and swing direction
function primitiveToPath(prim, W, { mirrored, swing }) {
  const tx = (x) => (mirrored ? W - x : x);
  const ty = (y) => (swing === 'out' ? -y : y);
  const pt = ([x, y]) => `${fmt(tx(x))} ${fmt(ty(y))}`;
  const flipSweep = (sweep) => (mirrored !== (swing === 'out') ? 1 - sweep : sweep);

  if (prim.line) {
    const [x1, y1, x2, y2] = prim.line;
    return `M ${pt([x1, y1])} L ${pt([x2, y2])}`;
  }
  if (prim.polyline) {
    return prim.polyline.map((point, i) => `${i ? 'L' : 'M'} ${pt(point)}`).join(' ');
  }
  if (prim.arc) {
    const { from, to, r, sweep } = prim.arc;
    return `M ${pt(from)} A ${fmt(r)} ${fmt(r)} 0 0 ${flipSweep(sweep)} ${pt(to)}`;
  }
  if (prim.rect) {
    const [x, y, w, h] = prim.rect;
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    return `${corners.map((c, i) => `${i ? 'L' : 'M'} ${pt(c)}`).join(' ')} Z`;
  }
  if (prim.circle) {
    const { cx, cy, r } = prim.circle;
    return `M ${pt([cx - r, cy])} A ${fmt(r)} ${fmt(r)} 0 1 1 ${pt([cx + r, cy])} A ${fmt(r)} ${fmt(r)} 0 1 1 ${pt([cx - r, cy])}`;
  }
  return '';
}

// Stroke styles, scaled from the drawing's unit (1 m = `unit` px) so symbols stay proportional
function primitiveStyle(kind, unit) {
  const leaf = Math.max(1.6, unit * 0.1);
  switch (kind) {
    case 'wall': return { stroke: INK, strokeWidth: Math.max(3, unit * 0.2), fill: '', strokeLineCap: 'butt' };
    case 'panel': return { stroke: INK, strokeWidth: Math.max(0.8, unit * 0.04), fill: INK };
    case 'outline': return { stroke: INK, strokeWidth: Math.max(1, unit * 0.06), fill: '' };
    case 'swing': return { stroke: INK, strokeWidth: Math.max(1, unit * 0.06), fill: '', strokeDashArray: [unit * 0.18, unit * 0.12] };
    case 'leaf':
    default: return { stroke: INK, strokeWidth: leaf, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round' };
  }
}

// Half extents of a symbol around the centre of the opening (W/2, 0), symmetric so that the
// Fabric group's centre is always the midpoint of the opening on the wall line.
function symbolExtents(prims, W) {
  let maxDx = W / 2;
  let maxDy = 0;
  const visit = (x, y) => { maxDx = Math.max(maxDx, Math.abs(x - W / 2)); maxDy = Math.max(maxDy, Math.abs(y)); };
  prims.forEach(prim => {
    if (prim.line) { visit(prim.line[0], prim.line[1]); visit(prim.line[2], prim.line[3]); }
    if (prim.polyline) prim.polyline.forEach(([x, y]) => visit(x, y));
    if (prim.arc) { visit(...prim.arc.from); visit(...prim.arc.to); maxDy = Math.max(maxDy, prim.arc.r); }
    if (prim.rect) { const [x, y, w, h] = prim.rect; visit(x, y); visit(x + w, y + h); }
    if (prim.circle) { visit(prim.circle.cx - prim.circle.r, prim.circle.r); visit(prim.circle.cx + prim.circle.r, prim.circle.r); }
  });
  return { halfW: maxDx, halfH: maxDy };
}

// SVG markup data for catalog / property-panel previews (unit-free, fits any viewBox)
export function getDoorSvgData(doorType, { mirrored = false, swing = 'in' } = {}) {
  const W = 100;
  const prims = doorPrimitives(doorType, W);
  const { halfW, halfH } = symbolExtents(prims, W);
  const pad = 8;
  const paths = prims.map(prim => ({
    d: primitiveToPath(prim, W, { mirrored, swing }),
    ...primitiveStyle(prim.kind, 30)
  }));
  const h = Math.max(halfH, 12);
  return { viewBox: `${fmt(W / 2 - halfW - pad)} ${fmt(-h - pad)} ${fmt(halfW * 2 + pad * 2)} ${fmt(h * 2 + pad * 2)}`, paths };
}

// Default door properties merged with overrides
export function normalizeDoorData(data = {}) {
  const doorType = DOOR_TYPES[data.doorType] ? data.doorType : 'single';
  return {
    doorType,
    widthM: clampDoorWidth(data.widthM) || DOOR_TYPES[doorType].defaultWidthM,
    mirrored: Boolean(data.mirrored),
    swing: data.swing === 'out' ? 'out' : 'in',
    label: typeof data.label === 'string' ? data.label : '',
    onWall: Boolean(data.onWall),
    // Caption (see elementCaptions.js): custom text ('' = door type name) and per-door visibility
    caption: typeof data.caption === 'string' ? data.caption : (typeof data.label === 'string' ? data.label : ''),
    showCaption: data.showCaption !== false
  };
}

// Interaction rules for doors: rotate in 90° steps, width via side handles only
export function applyDoorBehavior(obj) {
  obj.set({
    snapAngle: 90,
    snapThreshold: 12,
    lockScalingY: true,
    lockScalingFlip: true,
    hoverCursor: 'move'
  });
  obj.setControlsVisibility?.({ mt: false, mb: false, tl: false, tr: false, bl: false, br: false, ml: true, mr: true, mtr: true });
  // Doors saved before captions existed carry a baked-in label text: the caption overlay replaces it
  obj.getObjects?.().forEach(child => { if ((child.type || '').toLowerCase() === 'text') child.visible = false; });
}

// Build a door as a Fabric group centred on the opening midpoint (cx, cy)
export function createDoorObject({
  doorType = 'single',
  widthM,
  mirrored = false,
  swing = 'in',
  label = '',
  caption,
  showCaption,
  cx = 200,
  cy = 200,
  angle = 0,
  gridScale = 20,
  id = null
} = {}) {
  const data = normalizeDoorData({ doorType, widthM, mirrored, swing, label, caption, showCaption });
  const W = data.widthM * gridScale;
  const prims = doorPrimitives(data.doorType, W);
  const { halfW, halfH } = symbolExtents(prims, W);
  const hitHalfH = Math.max(halfH, gridScale * 0.4);

  const children = [
    // [0] Transparent hit area: keeps the group symmetric around the opening centre and easy to grab
    new fabric.Rect({
      left: W / 2,
      top: 0,
      originX: 'center',
      originY: 'center',
      width: halfW * 2,
      height: hitHalfH * 2,
      fill: 'rgba(0,0,0,0)',
      stroke: '',
      strokeWidth: 0,
      selectable: false,
      evented: false
    }),
    // [1] Wall cut: masks the wall under the opening (shown only while the door sits on a wall)
    new fabric.Rect({
      left: W / 2,
      top: 0,
      originX: 'center',
      originY: 'center',
      width: W,
      height: gridScale * 0.5,
      name: WALL_CUT_NAME,
      fill: '#f8fafc', // canvas floor colour
      stroke: '',
      strokeWidth: 0,
      visible: data.onWall,
      selectable: false,
      evented: false
    }),
    ...prims.map(prim => new fabric.Path(primitiveToPath(prim, W, data), {
      ...primitiveStyle(prim.kind, gridScale),
      strokeUniform: true,
      objectCaching: false
    }))
  ];

  const group = new fabric.Group(children, {
    subTargetCheck: false,
    cornerColor: '#6366f1',
    cornerSize: 8,
    transparentCorners: false,
    noScaleCache: true,
    objectCaching: false
  });

  // The hit area (first child) is centred on the opening midpoint; the swing can shift the group's
  // own centre, so position the group such that the opening midpoint lands exactly on (cx, cy).
  const openingOffset = children[0].getRelativeCenterPoint();
  const rotatedOffset = fabric.util.rotateVector(openingOffset, fabric.util.degreesToRadians(angle));
  group.set({ angle });
  group.setPositionByOrigin(new fabric.Point(cx - rotatedOffset.x, cy - rotatedOffset.y), 'center', 'center');
  group.setCoords();

  group.isVenueItem = true;
  group.venueData = {
    id: id || `door_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: 'door',
    category: 'doors',
    ...data,
    heightM: parseFloat((W > 0 ? (hitHalfH * 2) / gridScale : 0).toFixed(2)),
    gridScale
  };
  applyDoorBehavior(group);
  return group;
}

// Midpoint of the opening on the wall line, in canvas coordinates
export function getDoorOpeningCenter(door) {
  const hitArea = door.getObjects?.()[0];
  if (!hitArea) return door.getCenterPoint();
  return fabric.util.transformPoint(hitArea.getRelativeCenterPoint(), door.calcTransformMatrix());
}

// Rebuild a door with changed properties, keeping its position, rotation, id and z-order
export function rebuildDoorObject(canvas, door, changes = {}) {
  const current = door.venueData || {};
  const scale = Math.max(Math.abs(door.scaleX || 1), 0.01);
  const gridScale = current.gridScale || 20;
  const opening = getDoorOpeningCenter(door);
  const next = createDoorObject({
    ...normalizeDoorData({ ...current, ...changes }),
    widthM: changes.widthM !== undefined ? changes.widthM : (current.widthM || 0.9) * scale,
    cx: opening.x,
    cy: opening.y,
    angle: changes.angle !== undefined ? changes.angle : (door.angle || 0),
    gridScale,
    id: current.id
  });

  const index = canvas.getObjects().indexOf(door);
  canvas.remove(door);
  if (index >= 0) canvas.insertAt(index, next);
  else canvas.add(next);
  return next;
}

// Snap a door onto the nearest wall (tab Walls) when it is dropped/moved close to one:
// the opening centre moves onto the wall axis and the door takes the wall's angle.
export function snapDoorToWall(door, canvas, gridScale = 20) {
  const center = getDoorOpeningCenter(door);
  const doorHalf = ((door.venueData?.widthM || 0.9) * gridScale) / 2;
  let best = null;

  canvas.getObjects().forEach(wall => {
    if (!wall.isVenueItem || !WALL_TYPES.includes(wall.venueData?.type)) return;
    const wc = wall.getCenterPoint();
    const theta = fabric.util.degreesToRadians(wall.angle || 0);
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const halfLen = (wall.width * Math.abs(wall.scaleX || 1)) / 2;
    const halfThick = (wall.height * Math.abs(wall.scaleY || 1)) / 2;

    const dx = center.x - wc.x;
    const dy = center.y - wc.y;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (Math.abs(along) > halfLen + doorHalf * 0.5) return;

    const distance = Math.abs(across);
    if (distance > halfThick + gridScale) return;
    if (best && distance >= best.distance) return;

    const clampedAlong = halfLen > doorHalf ? Math.max(-halfLen + doorHalf, Math.min(halfLen - doorHalf, along)) : 0;
    best = { distance, point: new fabric.Point(wc.x + ux * clampedAlong, wc.y + uy * clampedAlong), wallAngle: wall.angle || 0 };
  });

  const wallCut = door.getObjects?.().find(o => o.name === WALL_CUT_NAME);
  if (!best) {
    if (door.venueData) door.venueData.onWall = false;
    wallCut?.set({ visible: false });
    return false;
  }
  if (door.venueData) door.venueData.onWall = true;
  wallCut?.set({ visible: true });

  // Keep the swing on the side the user had it: pick the wall angle or its opposite, whichever is closer
  const current = ((door.angle || 0) % 360 + 360) % 360;
  const candidates = [best.wallAngle, best.wallAngle + 180].map(a => ((a % 360) + 360) % 360);
  const diff = (a) => Math.min(Math.abs(a - current), 360 - Math.abs(a - current));
  const targetAngle = diff(candidates[0]) <= diff(candidates[1]) ? candidates[0] : candidates[1];

  door.rotate(targetAngle);
  const after = getDoorOpeningCenter(door);
  door.set({ left: door.left + (best.point.x - after.x), top: door.top + (best.point.y - after.y) });
  door.setCoords();
  return true;
}
