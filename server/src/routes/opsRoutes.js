import express from 'express';
import db from '../db.js';
import { writeAuditLog } from '../middleware/audit.js';
import { clientIp } from '../middleware/auth.js';
import {
  SETUP_STATUSES, INTERNET_OPTIONS, parseJson, sanitizeSalesCanvas, opsBoothRows, boothSummaryFromFabric
} from '../utils/opsLayer.js';

// Denah Operasional API (see AGENTS.md §17). The sales canvas is read-only here; only the operational
// layer (ops_elements) and operations booth data (ops_booth_data) are written.
const router = express.Router();

const SETUP_LABELS = { belum_datang: 'Belum Datang', proses_setup: 'Proses Setup', siap: 'Siap', bongkar: 'Bongkar' };
const INTERNET_LABELS = { tidak: 'Tidak', wifi: 'WiFi', lan: 'LAN' };
const COALESCE_MINUTES = 10;

const activeFloorplan = (id) => db.prepare(`
  SELECT id, title, status, metadata_json, canvas_fabric_json, updated_at, public_slug
  FROM floorplans WHERE id = ? AND deleted_at IS NULL
`).get(id);

const layerOf = (floorplanId) => db.prepare('SELECT version, updated_by, updated_at FROM ops_layers WHERE floorplan_id = ?').get(floorplanId)
  || { version: 0, updated_by: null, updated_at: null };

const elementDto = (r) => ({
  id: r.id,
  type: r.type,
  label: r.label || '',
  object: parseJson(r.object_json, null),
  anchorBoothId: r.anchor_booth_id || null,
  anchorBoothCode: r.anchor_booth_code || null,
  publicVisible: Boolean(r.public_visible),
  createdBy: r.created_by,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at
});

const boothOpsDto = (r) => ({
  boothKey: r.booth_key,
  boothCode: r.booth_code || '',
  powerWatt: Number(r.power_watt) || 0,
  waterNeeded: Boolean(r.water_needed),
  internet: r.internet || 'tidak',
  setupStatus: r.setup_status || 'belum_datang',
  notes: r.notes || '',
  updatedBy: r.updated_by,
  updatedAt: r.updated_at
});

const venueOf = (fp) => {
  const meta = parseJson(fp.metadata_json, {}) || {};
  return meta?.event?.venue || meta?.venue || '';
};

// GET /api/ops/floorplans - projects the operations team can open
router.get('/floorplans', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT fp.id, fp.title, fp.status, fp.metadata_json, fp.updated_at, l.updated_at AS ops_updated_at,
        (SELECT COUNT(*) FROM ops_elements e WHERE e.floorplan_id = fp.id AND e.deleted_at IS NULL) AS ops_count
      FROM floorplans fp LEFT JOIN ops_layers l ON l.floorplan_id = fp.id
      WHERE fp.deleted_at IS NULL
      ORDER BY fp.updated_at DESC
    `).all();
    res.json({
      success: true,
      floorplans: rows.map(r => ({
        id: r.id, title: r.title, status: r.status, venue: venueOf(r), updatedAt: r.updated_at,
        opsUpdatedAt: r.ops_updated_at, opsCount: r.ops_count
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ops/:id/version - cheap polling: has the sales layer or the operational layer changed?
router.get('/:id/version', (req, res) => {
  const fp = activeFloorplan(req.params.id);
  if (!fp) return res.status(404).json({ success: false, error: 'Denah tidak ditemukan' });
  const layer = layerOf(fp.id);
  res.json({ success: true, salesUpdatedAt: fp.updated_at, opsVersion: layer.version, opsUpdatedBy: layer.updated_by, opsUpdatedAt: layer.updated_at });
});

// GET /api/ops/:id/public - operational elements the admin chose to show on the Live Floorplan
router.get('/:id/public', (req, res) => {
  const fp = db.prepare(`SELECT id FROM floorplans WHERE id = ? AND status = 'published' AND deleted_at IS NULL`).get(req.params.id);
  if (!fp) return res.json({ success: true, elements: [] });
  const rows = db.prepare(`
    SELECT * FROM ops_elements WHERE floorplan_id = ? AND deleted_at IS NULL AND public_visible = 1 ORDER BY sort_order
  `).all(fp.id);
  res.json({ success: true, elements: rows.map(r => ({ id: r.id, object: parseJson(r.object_json, null) })).filter(e => e.object) });
});

// GET /api/ops/:id - sales layer (read-only, no prices) + operational layer
//   ?markSeen=1  store the current booth snapshot as "last opened" for this user (changes are listed against the previous one)
//   ?elementsOnly=1  only the operational elements (sales Studio overlay "Tampilkan Lapisan Operasional")
router.get('/:id', (req, res) => {
  try {
    const fp = activeFloorplan(req.params.id);
    if (!fp) return res.status(404).json({ success: false, error: 'Denah tidak ditemukan atau sudah dihapus' });
    const layer = layerOf(fp.id);
    const elements = db.prepare(`
      SELECT * FROM ops_elements WHERE floorplan_id = ? AND deleted_at IS NULL ORDER BY sort_order
    `).all(fp.id).map(elementDto).filter(e => e.object);

    if (req.query.elementsOnly === '1') {
      return res.json({ success: true, elements, layer: { version: layer.version, updatedBy: layer.updated_by, updatedAt: layer.updated_at } });
    }

    const boothSummary = boothSummaryFromFabric(fp.canvas_fabric_json);
    const seen = req.user
      ? db.prepare('SELECT snapshot_json, seen_at FROM ops_seen WHERE user_id = ? AND floorplan_id = ?').get(req.user.id, fp.id)
      : null;
    if (req.user && req.query.markSeen === '1') {
      db.prepare(`
        INSERT INTO ops_seen (user_id, floorplan_id, snapshot_json, seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, floorplan_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, seen_at = CURRENT_TIMESTAMP
      `).run(req.user.id, fp.id, JSON.stringify(boothSummary));
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND floorplan_id = ? AND type = 'sales_change' AND is_read = 0`)
        .run(req.user.id, fp.id);
    }

    res.json({
      success: true,
      floorplan: { id: fp.id, title: fp.title, status: fp.status, venue: venueOf(fp), salesUpdatedAt: fp.updated_at, display: parseJson(fp.metadata_json, {})?.display || {} },
      salesCanvas: sanitizeSalesCanvas(fp.canvas_fabric_json),
      booths: opsBoothRows(fp.id),
      elements,
      boothOps: db.prepare('SELECT * FROM ops_booth_data WHERE floorplan_id = ?').all(fp.id).map(boothOpsDto),
      layer: { version: layer.version, updatedBy: layer.updated_by, updatedAt: layer.updated_at },
      boothSummary,
      previousSummary: parseJson(seen?.snapshot_json, null),
      lastSeenAt: seen?.seen_at || null
    });
  } catch (error) {
    console.error('GET ops layer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- save helpers ----------
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const displayNameOf = (el, obj) => String(el.displayName || obj?.venueData?.caption || obj?.venueData?.label || obj?.venueData?.type || 'Elemen').slice(0, 80);

// Human summary of what changed on one element
function describeElementChange(before, after) {
  const changes = [];
  if (!before || !after) return '';
  if (Math.abs(num(before.left) - num(after.left)) > 0.5 || Math.abs(num(before.top) - num(after.top)) > 0.5) changes.push('dipindah');
  if (Math.round(num(before.angle)) !== Math.round(num(after.angle))) changes.push(`diputar ${Math.round(num(before.angle))}° → ${Math.round(num(after.angle))}°`);
  const bv = before.venueData || {};
  const av = after.venueData || {};
  if (bv.widthM !== av.widthM || bv.heightM !== av.heightM) changes.push(`ukuran ${bv.widthM ?? '?'}×${bv.heightM ?? '?'} → ${av.widthM ?? '?'}×${av.heightM ?? '?'} m`);
  if ((bv.caption || bv.label || '') !== (av.caption || av.label || '')) changes.push(`nama → "${av.caption || av.label || 'default'}"`);
  if (JSON.stringify(bv.props || {}) !== JSON.stringify(av.props || {})) changes.push('properti diubah');
  if ((bv.anchor?.boothCode || '') !== (av.anchor?.boothCode || '')) changes.push(av.anchor?.boothCode ? `ditempel ke booth ${av.anchor.boothCode}` : 'dilepas dari booth');
  if (Boolean(bv.publicVisible) !== Boolean(av.publicVisible)) changes.push(av.publicVisible ? 'ditampilkan di Live' : 'disembunyikan dari Live');
  if ((before.visible !== false) !== (after.visible !== false)) changes.push(after.visible === false ? 'disembunyikan' : 'ditampilkan');
  if (Boolean(before.isLocked) !== Boolean(after.isLocked)) changes.push(after.isLocked ? 'dikunci' : 'dibuka kuncinya');
  return changes.join(', ') || 'detail tampilan diubah';
}

function logOps(req, action, target, summary, coalesce = false) {
  const user = req.user;
  if (coalesce) {
    const recent = db.prepare(`
      SELECT id, details_json FROM audit_logs
      WHERE user_id = ? AND action = ? AND target = ? AND created_at >= datetime('now', ?)
      ORDER BY id DESC LIMIT 1
    `).get(user.id, action, target, `-${COALESCE_MINUTES} minutes`);
    if (recent) {
      const count = (parseJson(recent.details_json, {})?.saveCount || 1) + 1;
      db.prepare('UPDATE audit_logs SET created_at = CURRENT_TIMESTAMP, summary = ?, details_json = ? WHERE id = ?')
        .run(`${summary} (${count}x dalam ${COALESCE_MINUTES} menit terakhir)`, JSON.stringify({ saveCount: count }), recent.id);
      return;
    }
  }
  writeAuditLog({
    user, action, category: 'Operasional', target, summary,
    method: req.method, path: `/api/ops/${req.params.id}`, statusCode: 200, ip: clientIp(req)
  });
}

// PUT /api/ops/:id - save the whole operational layer (elements + booth operations data)
router.put('/:id', (req, res) => {
  req.skipAudit = true; // detailed per-element entries are written below
  try {
    const fp = activeFloorplan(req.params.id);
    if (!fp) return res.status(404).json({ success: false, error: 'Denah tidak ditemukan atau sudah dihapus' });
    const { baseVersion, elements = [], boothOps = [] } = req.body || {};
    if (!Array.isArray(elements) || !Array.isArray(boothOps)) {
      return res.status(400).json({ success: false, error: 'Format data lapisan operasional tidak valid' });
    }

    const layer = layerOf(fp.id);
    if (baseVersion !== undefined && baseVersion !== null && Number(baseVersion) !== Number(layer.version)) {
      return res.status(409).json({
        success: false, code: 'OPS_VERSION_CONFLICT', version: layer.version,
        error: `Lapisan operasional baru saja disimpan oleh ${layer.updated_by || 'pengguna lain'}. Muat ulang denah untuk melihat versi terbaru sebelum menyimpan.`
      });
    }

    const isAdmin = req.user?.role === 'superadmin';
    const actor = req.user?.name || 'Sistem';
    const fpLabel = fp.title || fp.id;
    const existingRows = db.prepare('SELECT * FROM ops_elements WHERE floorplan_id = ? AND deleted_at IS NULL').all(fp.id);
    const existingMap = new Map(existingRows.map(r => [r.id, r]));
    const boothRows = db.prepare('SELECT * FROM ops_booth_data WHERE floorplan_id = ?').all(fp.id);
    const boothMap = new Map(boothRows.map(r => [r.booth_key, r]));
    const logs = [];
    const counts = { added: 0, changed: 0, deleted: 0, booths: 0 };

    const tx = db.transaction(() => {
      const seenIds = new Set();
      elements.forEach((el, index) => {
        const obj = el?.object && typeof el.object === 'object' ? el.object : null;
        const id = String(obj?.venueData?.id || el?.id || '').trim();
        if (!obj || !id || seenIds.has(id)) return;
        seenIds.add(id);
        const prev = existingMap.get(id);
        // Only the Super Admin decides which operational elements appear on the public Live Floorplan
        const publicVisible = isAdmin ? Boolean(obj.venueData?.publicVisible) : Boolean(prev?.public_visible);
        obj.venueData = { ...(obj.venueData || {}), id, publicVisible };
        obj.isOpsItem = true;
        delete obj.isSalesLayer;
        const anchor = obj.venueData.anchor || null;
        const label = String(obj.venueData.caption || obj.venueData.label || '').slice(0, 120);
        const json = JSON.stringify(obj);
        const name = displayNameOf(el, obj);

        if (!prev) {
          db.prepare(`
            INSERT INTO ops_elements (id, floorplan_id, type, label, object_json, anchor_booth_id, anchor_booth_code, public_visible, sort_order, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, fp.id, obj.venueData.type || obj.type || '', label, json, anchor?.boothId || null, anchor?.boothCode || null,
            publicVisible ? 1 : 0, index, actor, actor);
          counts.added++;
          logs.push(['Tambah elemen operasional', `${name} — ${fpLabel}`, anchor?.boothCode ? `Ditempel ke booth ${anchor.boothCode}` : '', false]);
        } else if (prev.object_json !== json || prev.sort_order !== index || Boolean(prev.public_visible) !== publicVisible) {
          const before = parseJson(prev.object_json, {});
          db.prepare(`
            UPDATE ops_elements SET type = ?, label = ?, object_json = ?, anchor_booth_id = ?, anchor_booth_code = ?, public_visible = ?,
              sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE floorplan_id = ? AND id = ?
          `).run(obj.venueData.type || obj.type || '', label, json, anchor?.boothId || null, anchor?.boothCode || null,
            publicVisible ? 1 : 0, index, actor, fp.id, id);
          if (prev.object_json !== json || Boolean(prev.public_visible) !== publicVisible) {
            counts.changed++;
            logs.push(['Ubah elemen operasional', `${name} — ${fpLabel}`, describeElementChange(before, obj), true]);
          }
        }
      });

      existingRows.forEach(r => {
        if (seenIds.has(r.id)) return;
        db.prepare('UPDATE ops_elements SET deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE floorplan_id = ? AND id = ?').run(actor, fp.id, r.id);
        counts.deleted++;
        const obj = parseJson(r.object_json, {});
        logs.push(['Hapus elemen operasional', `${displayNameOf({}, obj)} — ${fpLabel}`, r.anchor_booth_code ? `Sebelumnya ditempel ke booth ${r.anchor_booth_code}` : '', false]);
      });

      boothOps.forEach(b => {
        const key = String(b?.boothKey || '').trim();
        if (!key) return;
        const next = {
          booth_code: String(b.boothCode || '').slice(0, 60),
          power_watt: Math.max(0, Math.round(num(b.powerWatt))),
          water_needed: b.waterNeeded ? 1 : 0,
          internet: INTERNET_OPTIONS.includes(b.internet) ? b.internet : 'tidak',
          setup_status: SETUP_STATUSES.includes(b.setupStatus) ? b.setupStatus : 'belum_datang',
          notes: String(b.notes || '').slice(0, 1000)
        };
        const prev = boothMap.get(key);
        const diff = [];
        const prevState = prev || { power_watt: 0, water_needed: 0, internet: 'tidak', setup_status: 'belum_datang', notes: '' };
        if (prevState.setup_status !== next.setup_status) diff.push(`status setup ${SETUP_LABELS[prevState.setup_status]} → ${SETUP_LABELS[next.setup_status]}`);
        if (Number(prevState.power_watt) !== next.power_watt) diff.push(`listrik ${prevState.power_watt || 0} → ${next.power_watt} W`);
        if (Number(prevState.water_needed) !== next.water_needed) diff.push(next.water_needed ? 'butuh air' : 'tidak butuh air');
        if (prevState.internet !== next.internet) diff.push(`internet ${INTERNET_LABELS[prevState.internet]} → ${INTERNET_LABELS[next.internet]}`);
        if ((prevState.notes || '') !== next.notes) diff.push('catatan diubah');
        if (!diff.length) return;
        db.prepare(`
          INSERT INTO ops_booth_data (floorplan_id, booth_key, booth_code, power_watt, water_needed, internet, setup_status, notes, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(floorplan_id, booth_key) DO UPDATE SET booth_code = excluded.booth_code, power_watt = excluded.power_watt,
            water_needed = excluded.water_needed, internet = excluded.internet, setup_status = excluded.setup_status,
            notes = excluded.notes, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(fp.id, key, next.booth_code, next.power_watt, next.water_needed, next.internet, next.setup_status, next.notes, actor);
        counts.booths++;
        logs.push(['Ubah data operasional booth', `Booth ${next.booth_code || key} — ${fpLabel}`, diff.join(', '), false]);
      });

      if (counts.added || counts.changed || counts.deleted || counts.booths) {
        db.prepare(`
          INSERT INTO ops_layers (floorplan_id, version, updated_by, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(floorplan_id) DO UPDATE SET version = version + 1, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(fp.id, actor);
      }
    });
    tx();
    logs.forEach(([action, target, summary, coalesce]) => logOps(req, action, target, summary, coalesce));

    const after = layerOf(fp.id);
    res.json({ success: true, version: after.version, updatedAt: after.updated_at, updatedBy: after.updated_by, counts });
  } catch (error) {
    console.error('Save ops layer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ops/:id/copy-from { sourceId } - "Salin dari Template Lain": copy the source's operational elements
router.post('/:id/copy-from', (req, res) => {
  req.skipAudit = true;
  try {
    const target = activeFloorplan(req.params.id);
    const sourceId = String(req.body?.sourceId || '');
    const source = sourceId ? db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(sourceId) : null;
    if (!target || !source) return res.status(404).json({ success: false, error: 'Denah sumber atau tujuan tidak ditemukan' });
    const rows = db.prepare('SELECT * FROM ops_elements WHERE floorplan_id = ? AND deleted_at IS NULL ORDER BY sort_order').all(source.id);
    const actor = req.user?.name || 'Sistem';
    db.transaction(() => {
      rows.forEach(r => {
        db.prepare(`
          INSERT OR REPLACE INTO ops_elements (id, floorplan_id, type, label, object_json, anchor_booth_id, anchor_booth_code, public_visible, sort_order, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(r.id, target.id, r.type, r.label, r.object_json, r.anchor_booth_id, r.anchor_booth_code, r.public_visible, r.sort_order, actor, actor);
      });
      if (rows.length) {
        db.prepare(`
          INSERT INTO ops_layers (floorplan_id, version, updated_by, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(floorplan_id) DO UPDATE SET version = version + 1, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(target.id, actor);
      }
    })();
    logOps(req, 'Salin lapisan operasional', `${source.title} → ${target.title}`, `${rows.length} elemen operasional disalin`);
    res.json({ success: true, copied: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
