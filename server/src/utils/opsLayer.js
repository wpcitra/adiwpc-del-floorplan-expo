import db from '../db.js';

// Operational floorplan helpers (see AGENTS.md §17).
// The operational layer never copies booths: it reads the sales floorplan's canvas and stores only its own
// elements (ops_elements) and per-booth operations data (ops_booth_data).

export const SETUP_STATUSES = ['belum_datang', 'proses_setup', 'siap', 'bongkar'];
export const INTERNET_OPTIONS = ['tidak', 'wifi', 'lan'];

// Booth fields the operations team may see (no price, discount or billing data)
const OPS_BOOTH_FIELDS = ['id', 'code', 'booth_number', 'category', 'status', 'ownerName', 'widthM', 'heightM', 'shape',
  'brandCategory', 'facilities', 'pillarConflict', 'pillarNote', 'isMerged', 'mergedFrom', 'exhibitorId', 'mergeSeparate', 'nameDirection'];

export const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return fallback; }
};

export const boothKeyOf = (boothData = {}) => String(boothData.id || boothData.code || '').trim();

// Sales canvas without prices / discounts / billing data inside boothData
export function sanitizeSalesCanvas(fabricJson) {
  const json = parseJson(fabricJson, { version: '7.4.0', objects: [] }) || { objects: [] };
  const objects = (json.objects || []).map(o => {
    if (!o?.isBooth || !o.boothData) return o;
    const safe = {};
    OPS_BOOTH_FIELDS.forEach(k => { if (o.boothData[k] !== undefined) safe[k] = o.boothData[k]; });
    return { ...o, boothData: safe };
  });
  return { ...json, objects };
}

// Booth rows for the operations team: identity, size, tenant, category and PIC contact only
export function opsBoothRows(floorplanId) {
  return db.prepare(`
    SELECT id, code, category, status, owner_name, brand_category, pic_name, email, phone, width_m, height_m, exhibitor_id, merge_separate
    FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL
  `).all(floorplanId);
}

// Centre of a serialized Fabric object (any origin, any rotation)
function objectCenter(o) {
  const w = (Number(o.width) || 0) * Math.abs(Number(o.scaleX) || 1);
  const h = (Number(o.height) || 0) * Math.abs(Number(o.scaleY) || 1);
  const ox = o.originX === 'center' ? 0 : o.originX === 'right' ? -w / 2 : w / 2;
  const oy = o.originY === 'center' ? 0 : o.originY === 'bottom' ? -h / 2 : h / 2;
  const a = ((Number(o.angle) || 0) * Math.PI) / 180;
  return {
    x: (Number(o.left) || 0) + ox * Math.cos(a) - oy * Math.sin(a),
    y: (Number(o.top) || 0) + ox * Math.sin(a) + oy * Math.cos(a),
    w,
    h
  };
}

// Compact snapshot of every booth of a sales canvas: used to list "Perubahan dari Sales"
export function boothSummaryFromFabric(fabricJson) {
  const json = parseJson(fabricJson, { objects: [] }) || { objects: [] };
  const out = {};
  (json.objects || []).forEach(o => {
    if (!o?.isBooth || !o.boothData) return;
    const key = boothKeyOf(o.boothData);
    if (!key) return;
    const c = objectCenter(o);
    out[key] = {
      id: o.boothData.id || '',
      code: o.boothData.code || '',
      cx: Math.round(c.x * 10) / 10,
      cy: Math.round(c.y * 10) / 10,
      w: Math.round(c.w * 10) / 10,
      h: Math.round(c.h * 10) / 10,
      angle: Math.round(Number(o.angle) || 0),
      widthM: o.boothData.widthM ?? null,
      heightM: o.boothData.heightM ?? null,
      tenant: String(o.boothData.ownerName || '').trim()
    };
  });
  return out;
}

// Number of booths added / removed / moved / resized / re-assigned between two snapshots
export function countBoothChanges(prev = {}, next = {}) {
  let count = 0;
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  keys.forEach(k => {
    const a = prev?.[k];
    const b = next?.[k];
    if (!a || !b) { count++; return; }
    if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > 2 || Math.abs(a.w - b.w) > 1 || Math.abs(a.h - b.h) > 1 ||
      a.angle !== b.angle || a.tenant !== b.tenant || a.code !== b.code) count++;
  });
  return count;
}

// In-app notification to every active operations user (one unread notification per floorplan, updated in place)
export function notifyOpsOfSalesChange(floorplanId, changedCount, actorName = '') {
  if (!floorplanId || !changedCount) return;
  try {
    const fp = db.prepare('SELECT title FROM floorplans WHERE id = ?').get(floorplanId);
    const users = db.prepare("SELECT id FROM users WHERE role = 'operations' AND is_active = 1").all();
    const link = `/admin/ops?templateId=${encodeURIComponent(floorplanId)}`;
    users.forEach(u => {
      const existing = db.prepare(`
        SELECT id, meta_json FROM notifications
        WHERE user_id = ? AND floorplan_id = ? AND type = 'sales_change' AND is_read = 0
        ORDER BY id DESC LIMIT 1
      `).get(u.id, floorplanId);
      const total = (parseJson(existing?.meta_json, {})?.count || 0) + changedCount;
      const body = `${total} perubahan booth di "${fp?.title || floorplanId}"${actorName ? ` (terakhir oleh ${actorName})` : ''}. Buka Denah Operasional untuk meninjau.`;
      if (existing) {
        db.prepare('UPDATE notifications SET body = ?, meta_json = ?, updated_at = CURRENT_TIMESTAMP, created_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(body, JSON.stringify({ count: total }), existing.id);
      } else {
        db.prepare(`
          INSERT INTO notifications (user_id, type, floorplan_id, title, body, link, meta_json)
          VALUES (?, 'sales_change', ?, ?, ?, ?, ?)
        `).run(u.id, floorplanId, 'Denah Sales berubah', body, link, JSON.stringify({ count: total }));
      }
    });
  } catch (e) {
    console.error('notifyOpsOfSalesChange failed:', e.message);
  }
}

// Compare a floorplan's booths before/after a sales change and notify the operations team
export function notifyIfBoothsChanged(floorplanId, previousFabricJson, actorName = '') {
  try {
    const current = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(floorplanId)?.canvas_fabric_json;
    const changed = countBoothChanges(boothSummaryFromFabric(previousFabricJson), boothSummaryFromFabric(current));
    if (changed) notifyOpsOfSalesChange(floorplanId, changed, actorName);
  } catch (e) {
    console.error('notifyIfBoothsChanged failed:', e.message);
  }
}
