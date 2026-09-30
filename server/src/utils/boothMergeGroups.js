import db from '../db.js';
import {
  computeMergeGroups, polygonFromSerialized, isMergeObstacleData, mergeCodeLabel, polygonArea, boothsShareSide, sortCodes
} from '../../../shared/boothGroups.js';

// Auto-merge booth on the server (AGENTS.md §18): merge groups computed from the sales canvas geometry plus the
// booths table (exhibitor_id, status, merge_separate). Booth rows are never changed by a merge.

const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return fallback; }
};
const codeKey = (code) => String(code || '').trim().toLowerCase();

export const autoMergeEnabled = (metadataJson) => parseJson(metadataJson, {})?.display?.autoMerge !== false;

// Booth polygons + DB state of one floorplan (key = lower-case booth code, unique within a floorplan)
export function floorplanBoothGeometry(floorplanId) {
  const fp = db.prepare('SELECT id, canvas_fabric_json, metadata_json FROM floorplans WHERE id = ?').get(floorplanId);
  if (!fp) return null;
  const canvas = parseJson(fp.canvas_fabric_json, { objects: [] }) || { objects: [] };
  const rows = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId);
  const rowByCode = new Map(rows.map(r => [codeKey(r.code), r]));
  const booths = [];
  const obstacles = [];
  (canvas.objects || []).forEach(o => {
    if (o?.isBooth && o.boothData) {
      const row = rowByCode.get(codeKey(o.boothData.code));
      if (!row) return;
      booths.push({
        key: codeKey(row.code), code: row.code, id: row.id, exhibitorId: row.exhibitor_id || '', status: row.status,
        separate: Boolean(row.merge_separate), poly: polygonFromSerialized(o), row
      });
    } else if (isMergeObstacleData(o?.venueData)) {
      obstacles.push(polygonFromSerialized(o));
    }
  });
  const gridScale = Number(parseJson(fp.metadata_json, {})?.floorplan?.grid_size_px) || 20;
  return { fp, booths, obstacles, gridScale, enabled: autoMergeEnabled(fp.metadata_json) };
}

// Merge groups with display info; `onlyActive` drops groups shown separately (per group or for the whole project)
export function computeFloorplanMergeGroups(floorplanId, { onlyActive = true } = {}) {
  const geo = floorplanBoothGeometry(floorplanId);
  if (!geo) return { groups: [], byCode: new Map(), enabled: true };
  const { groups } = computeMergeGroups(geo.booths, { gridScale: geo.gridScale, obstacles: geo.obstacles });
  const boothByKey = new Map(geo.booths.map(b => [b.key, b]));
  const out = groups
    .filter(g => !onlyActive || (geo.enabled && !g.separate))
    .map(g => {
      const members = g.keys.map(k => boothByKey.get(k)).filter(Boolean);
      const areaM2 = members.reduce((acc, m) => acc + (Number(m.row.width_m) || 0) * (Number(m.row.height_m) || 0), 0);
      return {
        id: g.id,
        exhibitorId: g.exhibitorId,
        codes: g.codes,
        label: mergeCodeLabel(g.codes),
        joinedCode: g.codes.join('+'),
        status: g.status,
        separate: g.separate,
        boothCount: members.length,
        totalAreaM2: Math.round(areaM2 * 100) / 100,
        booths: members.map(m => ({ code: m.code, widthM: m.row.width_m, heightM: m.row.height_m, status: m.status }))
      };
    });
  const byCode = new Map();
  out.forEach(g => g.codes.forEach(c => byCode.set(codeKey(c), g)));
  return { groups: out, byCode, enabled: geo.enabled };
}

/**
 * Checkout clustering: which of `targetCodes` touch each other or an existing booth of the same exhibitor.
 * Returns [{ targets: [codes], existing: [codes] }] (connected components that contain at least one target).
 */
export function clusterCheckoutBooths(floorplanId, targetCodes, exhibitorId) {
  const geo = floorplanBoothGeometry(floorplanId);
  const targets = new Set(targetCodes.map(codeKey));
  const nodes = (geo?.booths || []).filter(b =>
    targets.has(b.key) ||
    (exhibitorId && b.exhibitorId === exhibitorId && ['reserved', 'sold'].includes(String(b.status).toLowerCase()))
  );
  // targets without geometry (not on the canvas yet) are their own cluster
  const missing = targetCodes.filter(c => !nodes.some(n => n.key === codeKey(c)));
  const parent = new Map(nodes.map(n => [n.key, n.key]));
  const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boothsShareSide(nodes[i].poly, nodes[j].poly, { gridScale: geo.gridScale, obstacles: geo.obstacles })) parent.set(find(nodes[i].key), find(nodes[j].key));
    }
  }
  const buckets = new Map();
  nodes.forEach(n => {
    const r = find(n.key);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(n);
  });
  const clusters = [];
  buckets.forEach(members => {
    const t = members.filter(m => targets.has(m.key)).map(m => m.code);
    if (!t.length) return;
    clusters.push({ targets: sortCodes(t), existing: sortCodes(members.filter(m => !targets.has(m.key)).map(m => m.code)) });
  });
  missing.forEach(c => clusters.push({ targets: [c], existing: [] }));
  return clusters;
}

export { polygonArea };
