import express from 'express';
import db from '../db.js';
import { getContract, recalcContract } from '../utils/contractBilling.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';
import { notifyIfBoothsChanged } from '../utils/opsLayer.js';
import { exhibitorIdFor } from '../utils/exhibitorIdentity.js';
import { computeFloorplanMergeGroups } from '../utils/boothMergeGroups.js';
import { publicFloorplanPayload } from '../utils/publicData.js';

const router = express.Router();

// Booth row for staff (Studio, Dashboard): includes the tenant biodata filled at registration (PIC, email, phone,
// brand category, source) and the private discount, so hydrateBoothObject shows the tenant as complete.
// The public view only receives PUBLIC_BOOTH_ROW_FIELDS (utils/publicData.js, AGENTS.md §20).
function boothRowDto(b) {
  return {
    id: b.id,
    booth_number: b.code,
    code: b.code,
    category: b.category,
    shape: b.shape || 'rectangle',
    price: b.price,
    status: b.status,
    owner_name: b.owner_name,
    ownerName: b.owner_name,
    brand_category: b.brand_category || '',
    pic_name: b.pic_name || '',
    email: b.email || '',
    phone: b.phone || '',
    registration_source: b.registration_source || '',
    registered_by: b.registered_by || '',
    discount_type: b.discount_type || 'nominal',
    discount_value: b.discount_value ?? 0,
    discount_amount: b.discount_amount ?? 0,
    discount_reason: b.discount_reason || '',
    // Auto-merge (AGENTS.md §18): exhibitor identity (opaque ID, not the email) and the display switch
    exhibitor_id: b.exhibitor_id || '',
    merge_separate: b.merge_separate ? 1 : 0,
    dimensions_meters: {
      width: b.width_m,
      height: b.height_m
    },
    widthM: b.width_m,
    heightM: b.height_m,
    facilities: b.facilities_json ? JSON.parse(b.facilities_json) : [],
    coordinates: b.coordinates_json ? JSON.parse(b.coordinates_json) : {}
  };
}


// Safety lock: extract booths from fabric JSON objects if booths array is omitted or empty
function extractBoothsFromFabricJson(objects) {
  if (!Array.isArray(objects)) return [];
  const booths = [];
  const statuses = ['AVAILABLE', 'RESERVED', 'SOLD', 'FREE', 'MAINTENANCE'];

  objects.forEach((o, i) => {
    if (o.isBooth && o.boothData) {
      booths.push({
        id: o.boothData.id || `booth_${i}`,
        code: o.boothData.code || `A-${i}`,
        booth_number: o.boothData.code || `A-${i}`,
        category: o.boothData.category || 'Standard',
        brand_category: o.boothData.brandCategory || o.boothData.brand_category || '',
        shape: o.boothData.shape || 'rectangle',
        price: o.boothData.price || 5000000,
        status: o.boothData.status || 'available',
        owner_name: o.boothData.ownerName || '',
        widthM: o.boothData.widthM || 3,
        heightM: o.boothData.heightM || 3,
        discount_type: o.boothData.discountType || o.boothData.discount_type || 'nominal',
        discount_value: o.boothData.discountValue !== undefined ? o.boothData.discountValue : (o.boothData.discount_value || 0),
        discount_amount: o.boothData.discountAmount !== undefined ? o.boothData.discountAmount : (o.boothData.discount_amount || 0),
        discount_reason: o.boothData.discountReason || o.boothData.discount_reason || '',
        discountType: o.boothData.discountType || o.boothData.discount_type || 'nominal',
        discountValue: o.boothData.discountValue !== undefined ? o.boothData.discountValue : (o.boothData.discount_value || 0),
        discountAmount: o.boothData.discountAmount !== undefined ? o.boothData.discountAmount : (o.boothData.discount_amount || 0),
        discountReason: o.boothData.discountReason || o.boothData.discount_reason || '',
        facilities: o.boothData.facilities || [],
        coordinates: { x: Math.round(o.left || 0), y: Math.round(o.top || 0), width: Math.round(o.width || 60), height: Math.round(o.height || 60) }
      });
      return;
    }

    const subObjects = o.objects || [];
    const textObjs = subObjects.filter(s => {
      const t = (s.type || '').toLowerCase();
      return t === 'text' || t === 'fabrictext' || t === 'i-text';
    });
    const texts = textObjs.map(s => (s.text || '').trim()).filter(Boolean);

    const statusMatch = texts.find(t => statuses.includes(t.toUpperCase()));
    const dimMatch = texts.find(t => /^\d+(\.\d+)?x\d+(\.\d+)?m$/i.test(t));
    const codeMatch = texts.find(t => 
      /^[A-Z0-9]+-[0-9]+$/i.test(t) || 
      /^(VIP|BOOTH|STAND|SP)-[0-9]+$/i.test(t)
    );

    if (codeMatch && (statusMatch || dimMatch || subObjects.length >= 4)) {
      const code = codeMatch;
      const status = (statusMatch || 'available').toLowerCase();
      let widthM = 3, heightM = 3;
      if (dimMatch) {
        const parts = dimMatch.toLowerCase().replace('m', '').split('x');
        widthM = parseFloat(parts[0]) || 3;
        heightM = parseFloat(parts[1]) || 3;
      } else if (o.width && o.height) {
        widthM = Math.round(o.width / 20) || 3;
        heightM = Math.round(o.height / 20) || 3;
      }

      const otherTexts = texts.filter(t => t !== statusMatch && t !== dimMatch && t !== codeMatch);
      let rawOwner = otherTexts[0] || '';
      if (rawOwner.includes('(Nama') || rawOwner === 'Tersedia' || rawOwner === '-') rawOwner = '';

      let category = 'Standard';
      if (code.startsWith('VIP') || (widthM >= 6 && heightM >= 6)) category = 'Island';
      else if (widthM >= 6 || heightM >= 6) category = 'Premium';
      else if (code.startsWith('B') && (code === 'B-01' || code === 'B-05')) category = 'Corner';
      else if (status === 'free') category = 'Free';

      let price = 5000000;
      if (category === 'Island') price = 25000000;
      else if (category === 'Premium') price = 12000000;
      else if (category === 'Corner') price = 7500000;
      else if (category === 'Free') price = 0;

      booths.push({
        id: `booth_${code.toLowerCase().replace('-', '_')}`,
        code,
        booth_number: code,
        category,
        shape: 'rectangle',
        price,
        status,
        owner_name: rawOwner,
        widthM,
        heightM,
        facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL'],
        coordinates: { x: Math.round(o.left || 0), y: Math.round(o.top || 0), width: Math.round(o.width || 60), height: Math.round(o.height || 60) }
      });
    }
  });

  return booths;
}

// Live Denah (public portal) only ever shows what the admin published. Anonymous visitors always get this view;
// logged-in staff get it when the page asks for it (?view=public), otherwise the Studio sees every project.
const isPublicView = (req) => !req.user || req.query.view === 'public';

// Stable public link slug: "<title>-<last 5 of id>", e.g. "kanvas-baru-95799" (kept when re-published)
function ensurePublicSlug(floorplan) {
  if (floorplan.public_slug) return floorplan.public_slug;
  const base = String(floorplan.title || 'denah')
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'denah';
  const suffix = String(floorplan.id).replace(/[^a-zA-Z0-9]/g, '').slice(-5).toLowerCase();
  let slug = `${base}-${suffix}`;
  for (let i = 2; db.prepare('SELECT 1 FROM floorplans WHERE public_slug = ? AND id != ?').get(slug, floorplan.id); i++) {
    slug = `${base}-${suffix}-${i}`;
  }
  db.prepare('UPDATE floorplans SET public_slug = ? WHERE id = ?').run(slug, floorplan.id);
  return slug;
}
const PUBLIC_HALL_FILTER = "AND status = 'published'";

// GET /api/floorplan/events - List all events/projects with their halls/floorplans
router.get('/events', (req, res) => {
  try {
    const publicView = isPublicView(req);
    const events = db.prepare(`SELECT * FROM events ORDER BY created_at ASC`).all();
    const result = events.map(evt => {
      const halls = db.prepare(`
        SELECT id, event_id, title, status, public_slug, updated_at, created_at 
        FROM floorplans 
        WHERE event_id = ? AND deleted_at IS NULL ${publicView ? PUBLIC_HALL_FILTER : ''}
        ORDER BY created_at ASC, title ASC
      `).all(evt.id).map(h => {
        const booths = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL`).all(h.id);
        return {
          id: h.id,
          eventId: h.event_id,
          title: h.title,
          status: h.status,
          slug: h.status === 'published' ? h.public_slug || null : null,
          totalBooths: booths.length,
          availableBooths: booths.filter(b => b.status === 'available').length,
          reservedBooths: booths.filter(b => b.status === 'reserved').length,
          soldBooths: booths.filter(b => b.status === 'sold').length,
          updated_at: h.updated_at
        };
      });

      return {
        id: evt.id,
        title: evt.title,
        venue: evt.venue,
        startDate: evt.start_date,
        endDate: evt.end_date,
        status: evt.status,
        halls
      };
    });

    // The public portal only lists events that have a published floorplan
    res.json({ success: true, events: publicView ? result.filter(evt => evt.halls.length > 0) : result });
  } catch (error) {
    console.error("List events error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/floorplan/list - List all saved floorplan templates with event metadata
router.get('/list', (req, res) => {
  try {
    const targetEventId = req.query.eventId || req.query.projectId;
    let query = `
      SELECT fp.id, fp.event_id, fp.title, fp.metadata_json, fp.status, fp.public_slug, fp.blueprint_json, fp.created_at, fp.updated_at,
             COALESCE(e.title, 'Event Expo') as event_title,
             COALESCE(e.venue, 'Jakarta Convention Center') as event_venue
      FROM floorplans fp
      LEFT JOIN events e ON fp.event_id = e.id
      WHERE fp.deleted_at IS NULL
    `;
    const params = [];
    if (targetEventId && targetEventId !== 'all') {
      query += ` AND fp.event_id = ? `;
      params.push(targetEventId);
    }
    query += ` ORDER BY fp.created_at ASC, fp.updated_at DESC`;

    const floorplans = db.prepare(query).all(...params);

    const result = floorplans.map(fp => {
      const booths = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL`).all(fp.id);
      const venueItems = db.prepare(`SELECT * FROM venue_items WHERE floorplan_id = ? AND deleted_at IS NULL`).all(fp.id);
      
      const meta = fp.metadata_json ? (typeof fp.metadata_json === 'string' ? JSON.parse(fp.metadata_json) : fp.metadata_json) : null;
      const venue = fp.event_venue || meta?.event?.venue || meta?.venue || 'Jakarta Convention Center (Hall A)';

      const totalBooths = booths.length;
      const availableBooths = booths.filter(b => b.status === 'available').length;
      const reservedBooths = booths.filter(b => b.status === 'reserved').length;
      const soldBooths = booths.filter(b => b.status === 'sold').length;
      const totalRevenue = booths.reduce((acc, b) => acc + (b.price || 0), 0);

      return {
        id: fp.id,
        event_id: fp.event_id,
        event_title: fp.event_title,
        title: fp.title || 'Denah Tanpa Judul',
        venue,
        status: fp.status || 'draft',
        is_published: fp.status === 'published',
        // Floorplans published before public links existed get theirs on first listing
        public_slug: fp.status === 'published' ? (fp.public_slug || ensurePublicSlug(fp)) : null,
        has_blueprint: Boolean(fp.blueprint_json),
        totalBooths,
        availableBooths,
        reservedBooths,
        soldBooths,
        totalRevenue,
        venueItemCount: venueItems.length,
        created_at: fp.created_at,
        updated_at: fp.updated_at
      };
    });

    res.json({ success: true, floorplans: result });
  } catch (error) {
    console.error("List floorplans error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/floorplan/active - Fetch current active/published floorplan with sibling halls
router.get('/active', (req, res) => {
  try {
    // Ensure all booth and order statuses strictly follow the Invoice & Tenant Management page
    syncPaymentStatusFromInvoices();

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const targetFloorplanId = req.query.floorplanId || req.query.hallId || req.query.templateId;
    const targetEventId = req.query.eventId || req.query.projectId;
    const publicView = isPublicView(req);
    const hallFilter = publicView ? PUBLIC_HALL_FILTER : '';

    let floorplan = null;
    // Public link /live/<slug>: only a published, non-trashed floorplan; an unknown link is a 404, never another denah
    if (req.query.slug) {
      floorplan = db.prepare(`SELECT * FROM floorplans WHERE public_slug = ? AND deleted_at IS NULL ${hallFilter}`).get(String(req.query.slug));
      if (!floorplan) {
        return res.status(404).json({ success: false, code: 'LINK_NOT_FOUND', error: 'Link denah tidak ditemukan atau sudah tidak dipublikasikan.' });
      }
    }
    if (!floorplan && targetFloorplanId) {
      floorplan = db.prepare(`SELECT * FROM floorplans WHERE id = ? AND deleted_at IS NULL ${hallFilter}`).get(targetFloorplanId);
    }
    
    if (!floorplan && targetEventId && targetEventId !== 'all') {
      floorplan = db.prepare(`
        SELECT * FROM floorplans 
        WHERE event_id = ? AND status = 'published' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1
      `).get(targetEventId) || (publicView ? null : db.prepare(`
        SELECT * FROM floorplans 
        WHERE event_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1
      `).get(targetEventId));
    }

    if (!floorplan) {
      floorplan = db.prepare(`
        SELECT * FROM floorplans 
        WHERE status = 'published' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1
      `).get();
    }

    // Only the Studio falls back to the latest draft; the public portal shows nothing until something is published
    if (!floorplan && !publicView) {
      floorplan = db.prepare(`
        SELECT * FROM floorplans 
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1
      `).get();
    }

    if (!floorplan) {
      return res.status(404).json({ 
        success: false, 
        error: publicView ? 'Belum ada denah yang dipublikasikan.' : 'Belum ada floorplan tersimpan.' 
      });
    }

    // Resolve parent Event info
    const parentEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(floorplan.event_id) || {
      id: floorplan.event_id || 'EVT-2026-001',
      title: floorplan.title || 'Indonesia International Expo 2026',
      venue: 'Jakarta Convention Center'
    };

    // Get all sibling halls in this same event (public portal: published only)
    const siblingHalls = db.prepare(`
      SELECT id, event_id, title, status, public_slug, updated_at 
      FROM floorplans 
      WHERE event_id = ? AND deleted_at IS NULL ${hallFilter}
      ORDER BY created_at ASC, title ASC
    `).all(floorplan.event_id).map(h => {
      const bCount = db.prepare('SELECT COUNT(*) as cnt FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').get(h.id)?.cnt || 0;
      const bAvail = db.prepare(`SELECT COUNT(*) as cnt FROM booths WHERE floorplan_id = ? AND status = 'available' AND deleted_at IS NULL`).get(h.id)?.cnt || 0;
      return {
        id: h.id,
        eventId: h.event_id,
        title: h.title,
        status: h.status,
        slug: h.status === 'published' ? h.public_slug || null : null,
        totalBooths: bCount,
        availableBooths: bAvail
      };
    });

    // Get all booths belonging to this floorplan
    const booths = db.prepare(`
      SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL
    `).all(floorplan.id).map(boothRowDto);

    // Get venue items
    const venueItems = db.prepare(`
      SELECT * FROM venue_items WHERE floorplan_id = ? AND deleted_at IS NULL
    `).all(floorplan.id).map(v => ({
      id: v.id,
      type: v.type,
      category: v.category,
      label: v.label,
      dimensions_meters: {
        width: v.width_m,
        height: v.height_m
      },
      coordinates: v.coordinates_json ? JSON.parse(v.coordinates_json) : {},
      properties: v.properties_json ? JSON.parse(v.properties_json) : null
    }));

    const meta = floorplan.metadata_json ? JSON.parse(floorplan.metadata_json) : null;
    const venue = parentEvent.venue || meta?.event?.venue || meta?.venue || 'Jakarta Convention Center';

    return res.json({
      success: true,
      event: {
        id: parentEvent.id,
        title: parentEvent.title,
        venue
      },
      halls: siblingHalls,
      // Public view: no PIC / email / phone, private discounts or internal elements (AGENTS.md §20)
      floorplan: (publicView ? publicFloorplanPayload : (x) => x)({
        id: floorplan.id,
        event_id: floorplan.event_id,
        title: floorplan.title,
        venue,
        status: floorplan.status,
        public_slug: floorplan.status === 'published' ? floorplan.public_slug || null : null,
        canvas_fabric_json: floorplan.canvas_fabric_json ? JSON.parse(floorplan.canvas_fabric_json) : null,
        metadata: meta,
        blueprint: floorplan.blueprint_json ? JSON.parse(floorplan.blueprint_json) : null,
        updated_at: floorplan.updated_at,
        created_at: floorplan.created_at,
        booths,
        venueItems
      })
    });
  } catch (error) {
    console.error("Failed to fetch active floorplan:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/floorplan/presets - List all preset layouts
router.get('/presets', (req, res) => {
  try {
    const rawPresets = db.prepare(`
      SELECT * FROM preset_layouts ORDER BY sort_order ASC, created_at DESC
    `).all();

    const presets = rawPresets.map(p => {
      let fabricJson = null;
      let metadata = null;
      try { if (p.canvas_fabric_json) fabricJson = JSON.parse(p.canvas_fabric_json); } catch (e) {}
      try { if (p.metadata_json) metadata = JSON.parse(p.metadata_json); } catch (e) {}
      return {
        id: p.id,
        key: p.key || p.id,
        title: p.title,
        desc: p.description || '',
        description: p.description || '',
        tag: p.tag || 'Preset Custom',
        is_system: Boolean(p.is_system),
        isSystem: Boolean(p.is_system),
        fabricJson,
        metadata,
        created_at: p.created_at
      };
    });

    res.json({ success: true, presets });
  } catch (error) {
    console.error("Fetch preset layouts error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/presets - Create new preset layout directly
router.post('/presets', (req, res) => {
  try {
    const { title, description = '', tag = 'Preset Custom', fabricJson, metadata } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Judul preset wajib diisi' });
    }

    const id = `preset_custom_${Date.now()}`;
    const key = `custom_${Date.now()}`;

    db.prepare(`
      INSERT INTO preset_layouts (id, key, title, description, tag, canvas_fabric_json, metadata_json, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 99)
    `).run(
      id,
      key,
      title.trim(),
      description.trim(),
      tag.trim(),
      fabricJson ? JSON.stringify(fabricJson) : null,
      metadata ? JSON.stringify(metadata) : null
    );

    res.json({
      success: true,
      message: `Preset layout "${title}" berhasil dibuat dan tersimpan!`,
      preset: { id, key, title, description, tag, isSystem: false }
    });
  } catch (error) {
    console.error("Create preset layout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/save-as-preset - Save an existing floorplan or fabric JSON as a Preset Layout
router.post('/save-as-preset', (req, res) => {
  try {
    const { floorplanId, title, description = '', tag = 'Preset Admin', fabricJson, metadata } = req.body;

    let targetFabricJson = fabricJson;
    let targetMetadata = metadata;
    let presetTitle = title;

    if (floorplanId && (!targetFabricJson || !targetMetadata)) {
      const fp = db.prepare('SELECT * FROM floorplans WHERE id = ?').get(floorplanId);
      if (fp) {
        if (!presetTitle) presetTitle = `Preset Layout: ${fp.title}`;
        if (!targetFabricJson && fp.canvas_fabric_json) {
          try { targetFabricJson = JSON.parse(fp.canvas_fabric_json); } catch (e) {}
        }
        if (!targetMetadata && fp.metadata_json) {
          try { targetMetadata = JSON.parse(fp.metadata_json); } catch (e) {}
        }
      }
    }

    if (!presetTitle || !presetTitle.trim()) {
      presetTitle = `Preset Custom ${new Date().toLocaleDateString('id-ID')}`;
    }

    const id = `preset_custom_${Date.now()}`;
    const key = `custom_${Date.now()}`;

    db.prepare(`
      INSERT INTO preset_layouts (id, key, title, description, tag, canvas_fabric_json, metadata_json, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 50)
    `).run(
      id,
      key,
      presetTitle.trim(),
      description.trim() || 'Preset layout khusus yang dibuat oleh admin',
      tag.trim() || 'Preset Admin',
      targetFabricJson ? JSON.stringify(targetFabricJson) : null,
      targetMetadata ? JSON.stringify(targetMetadata) : null
    );

    res.json({
      success: true,
      message: `Berhasil menyimpan denah sebagai Preset Layout "${presetTitle}"!`,
      presetId: id
    });
  } catch (error) {
    console.error("Save floorplan as preset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/floorplan/presets/:id - Delete a preset layout
router.delete('/presets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const preset = db.prepare('SELECT * FROM preset_layouts WHERE id = ? OR key = ?').get(id, id);

    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset layout tidak ditemukan' });
    }

    db.prepare('DELETE FROM preset_layouts WHERE id = ? OR key = ?').run(id, id);

    res.json({
      success: true,
      message: `Preset layout "${preset.title}" berhasil dihapus!`
    });
  } catch (error) {
    console.error("Delete preset layout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/floorplan/trash - Fetch soft-deleted projects
router.get('/trash', (req, res) => {
  try {
    const trashedFloorplans = db.prepare(`
      SELECT fp.*, 
             COALESCE(e.title, 'Event Expo') as event_title,
             COALESCE(e.venue, 'Jakarta Convention Center') as event_venue
      FROM floorplans fp
      LEFT JOIN events e ON fp.event_id = e.id
      WHERE fp.deleted_at IS NOT NULL
      ORDER BY fp.deleted_at DESC
    `).all();

    const items = trashedFloorplans.map(fp => {
      const booths = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ?`).all(fp.id);
      const invoices = db.prepare(`SELECT * FROM invoices WHERE floorplan_id = ?`).all(fp.id);
      const orders = db.prepare(`SELECT * FROM orders WHERE floorplan_id = ?`).all(fp.id);
      
      const paidInvoices = invoices.filter(i => (i.payment_status || '').toUpperCase() === 'PAID');
      const dpInvoices = invoices.filter(i => {
        const st = (i.payment_status || '').toUpperCase();
        return st === 'PARTIAL' || st === 'DP' || (Number(i.paid_amount) > 0 && Number(i.remaining_amount) > 0);
      });
      const unpaidInvoices = invoices.filter(i => {
        const st = (i.payment_status || '').toUpperCase();
        return (st === 'UNPAID' || st === 'PENDING') && !(Number(i.paid_amount) > 0);
      });

      const totalNominal = invoices.reduce((acc, i) => acc + (Number(i.total_amount) || 0), 0);
      const totalPaid = invoices.reduce((acc, i) => acc + (Number(i.paid_amount) || 0), 0);
      const totalRemaining = invoices.reduce((acc, i) => acc + (Number(i.remaining_amount) || 0), 0);

      const hasPaidOrDp = paidInvoices.length > 0 || dpInvoices.length > 0;

      // Calculate days in trash (30-day retention before permanent delete)
      const deletedTime = new Date(fp.deleted_at).getTime();
      const nowTime = Date.now();
      const daysInTrash = Math.floor((nowTime - deletedTime) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 30 - daysInTrash);

      return {
        id: fp.id,
        title: fp.title,
        venue: fp.event_venue || 'Jakarta Convention Center',
        deleted_at: fp.deleted_at,
        days_remaining: daysRemaining,
        daysInTrash,
        daysRemaining,
        boothsCount: booths.length,
        invoicesCount: invoices.length,
        invoice_count: invoices.length,
        ordersCount: orders.length,
        totalNominal,
        total_invoiced: totalNominal,
        totalPaid,
        totalRemaining,
        paidCount: paidInvoices.length,
        paid_count: paidInvoices.length,
        dpCount: dpInvoices.length,
        dp_count: dpInvoices.length,
        unpaidCount: unpaidInvoices.length,
        unpaid_count: unpaidInvoices.length,
        hasPaidOrDpInvoice: hasPaidOrDp,
        has_paid_or_dp: hasPaidOrDp,
        canPermanentDelete: !hasPaidOrDp
      };
    });

    res.json({ success: true, trash: items });
  } catch (err) {
    console.error("Fetch trash error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/floorplan/soft-delete - Move project(s) to trash with cascade
router.post('/soft-delete', (req, res) => {
  try {
    const { projectIds = [], reason = '', deletedBy = 'Admin' } = req.body;
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Project IDs wajib disertakan' });
    }

    const tx = db.transaction(() => {
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const softDeleteFp = db.prepare(`UPDATE floorplans SET deleted_at = ? WHERE id = ?`);
      const softDeleteBooths = db.prepare(`UPDATE booths SET deleted_at = ? WHERE floorplan_id = ?`);
      const softDeleteOrders = db.prepare(`UPDATE orders SET deleted_at = ? WHERE floorplan_id = ?`);
      const softDeleteInvoices = db.prepare(`UPDATE invoices SET deleted_at = ? WHERE floorplan_id = ?`);
      const softDeleteVenues = db.prepare(`UPDATE venue_items SET deleted_at = ? WHERE floorplan_id = ?`);
      const insertLog = db.prepare(`
        INSERT INTO activity_logs (id, action, target_type, target_id, target_title, user_name, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const deletedProjects = [];

      for (const id of projectIds) {
        const fp = db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(id);
        const title = fp ? fp.title : `Project #${id}`;

        softDeleteFp.run(nowStr, id);
        softDeleteBooths.run(nowStr, id);
        softDeleteOrders.run(nowStr, id);
        softDeleteInvoices.run(nowStr, id);
        softDeleteVenues.run(nowStr, id);

        const logId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        insertLog.run(
          logId,
          'SOFT_DELETE',
          'project',
          id,
          title,
          deletedBy,
          JSON.stringify({ reason }),
          nowStr
        );

        deletedProjects.push({ id, title });
      }

      return deletedProjects;
    });

    const deleted = tx();
    res.json({
      success: true,
      message: `Berhasil memindahkan ${deleted.length} project ke Sampah.`,
      deletedProjects: deleted
    });
  } catch (err) {
    console.error("Soft delete error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/floorplan/restore - Restore project(s) from trash with cascade
router.post('/restore', (req, res) => {
  try {
    const { projectIds = [], restoredBy = 'Admin' } = req.body;
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Project IDs wajib disertakan' });
    }

    const tx = db.transaction(() => {
      const restoreFp = db.prepare(`UPDATE floorplans SET deleted_at = NULL WHERE id = ?`);
      const restoreBooths = db.prepare(`UPDATE booths SET deleted_at = NULL WHERE floorplan_id = ?`);
      const restoreOrders = db.prepare(`UPDATE orders SET deleted_at = NULL WHERE floorplan_id = ?`);
      const restoreInvoices = db.prepare(`UPDATE invoices SET deleted_at = NULL WHERE floorplan_id = ?`);
      const restoreVenues = db.prepare(`UPDATE venue_items SET deleted_at = NULL WHERE floorplan_id = ?`);
      const insertLog = db.prepare(`
        INSERT INTO activity_logs (id, action, target_type, target_id, target_title, user_name, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const restoredProjects = [];

      for (const id of projectIds) {
        const fp = db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(id);
        const title = fp ? fp.title : `Project #${id}`;

        restoreFp.run(id);
        restoreBooths.run(id);
        restoreOrders.run(id);
        restoreInvoices.run(id);
        restoreVenues.run(id);

        const logId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        insertLog.run(
          logId,
          'RESTORE',
          'project',
          id,
          title,
          restoredBy,
          JSON.stringify({ restoredAt: new Date().toISOString() })
        );

        restoredProjects.push({ id, title });
      }

      return restoredProjects;
    });

    const restored = tx();
    res.json({
      success: true,
      message: `Berhasil memulihkan ${restored.length} project dari Sampah.`,
      restoredProjects: restored
    });
  } catch (err) {
    console.error("Restore error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/floorplan/permanent-delete - Permanently delete projects without paid/DP invoices
router.post('/permanent-delete', (req, res) => {
  try {
    const { projectIds = [], confirmedBy = 'Admin' } = req.body;
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Project IDs wajib disertakan' });
    }

    // Safety check: ensure none of the requested projects have PAID or PARTIAL/DP invoices
    for (const id of projectIds) {
      const fp = db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(id);
      const title = fp ? fp.title : `Project #${id}`;
      const invoices = db.prepare('SELECT * FROM invoices WHERE floorplan_id = ?').all(id);

      const hasPaid = invoices.some(i => (i.payment_status || '').toUpperCase() === 'PAID');
      const hasDp = invoices.some(i => {
        const st = (i.payment_status || '').toUpperCase();
        return st === 'PARTIAL' || st === 'DP' || (Number(i.paid_amount) > 0);
      });

      if (hasPaid || hasDp) {
        return res.status(400).json({
          success: false,
          error: `Project "${title}" memiliki tagihan berstatus Lunas atau DP. Demi keamanan pembukuan keuangan, project ini TIDAK boleh dihapus permanen dan wajib disimpan sebagai arsip.`
        });
      }
    }

    const tx = db.transaction(() => {
      const deleteBooths = db.prepare(`DELETE FROM booths WHERE floorplan_id = ?`);
      const deleteOrders = db.prepare(`DELETE FROM orders WHERE floorplan_id = ?`);
      const deleteInvoices = db.prepare(`DELETE FROM invoices WHERE floorplan_id = ?`);
      const deleteVenues = db.prepare(`DELETE FROM venue_items WHERE floorplan_id = ?`);
      const deleteFp = db.prepare(`DELETE FROM floorplans WHERE id = ?`);
      const insertLog = db.prepare(`
        INSERT INTO activity_logs (id, action, target_type, target_id, target_title, user_name, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const purged = [];

      for (const id of projectIds) {
        const fp = db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(id);
        const title = fp ? fp.title : `Project #${id}`;

        deleteBooths.run(id);
        deleteOrders.run(id);
        deleteInvoices.run(id);
        deleteVenues.run(id);
        deleteFp.run(id);

        const logId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        insertLog.run(
          logId,
          'PERMANENT_DELETE',
          'project',
          id,
          title,
          confirmedBy,
          JSON.stringify({ permanentDeletedAt: new Date().toISOString() })
        );

        purged.push({ id, title });
      }

      return purged;
    });

    const purged = tx();
    res.json({
      success: true,
      message: `Berhasil menghapus permanen ${purged.length} project.`,
      purged
    });
  } catch (err) {
    console.error("Permanent delete error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/floorplan/activity-logs - Fetch activity logs for audit trail
router.get('/activity-logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM activity_logs 
      ORDER BY created_at DESC 
      LIMIT 100
    `).all();
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/floorplan/:id - Get specific floorplan by ID
router.get('/:id', (req, res) => {
  try {
    // Ensure all booth and order statuses strictly follow the Invoice & Tenant Management page
    syncPaymentStatusFromInvoices();

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { id } = req.params;
    const publicView = isPublicView(req);
    const floorplan = db.prepare(`SELECT * FROM floorplans WHERE id = ?`).get(id);
    // Drafts and trashed projects are not viewable from the public portal
    if (!floorplan || (publicView && (floorplan.status !== 'published' || floorplan.deleted_at))) {
      return res.status(404).json({ success: false, error: 'Floorplan tidak ditemukan' });
    }

    const booths = db.prepare(`
      SELECT * FROM booths WHERE floorplan_id = ?
    `).all(floorplan.id).map(boothRowDto);

    const venueItems = db.prepare(`
      SELECT * FROM venue_items WHERE floorplan_id = ?
    `).all(floorplan.id).map(v => ({
      id: v.id,
      type: v.type,
      category: v.category,
      label: v.label,
      dimensions_meters: {
        width: v.width_m,
        height: v.height_m
      },
      coordinates: v.coordinates_json ? JSON.parse(v.coordinates_json) : {},
      properties: v.properties_json ? JSON.parse(v.properties_json) : null
    }));

    const meta = floorplan.metadata_json ? JSON.parse(floorplan.metadata_json) : null;
    const venue = meta?.event?.venue || meta?.venue || 'Jakarta Convention Center (Hall A)';

    const parentEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(floorplan.event_id) || {
      id: floorplan.event_id || 'EVT-2026-001',
      title: floorplan.title || 'Event Expo 2026',
      venue
    };

    const siblingHalls = db.prepare(`
      SELECT id, event_id, title, status, public_slug, updated_at 
      FROM floorplans 
      WHERE event_id = ? AND deleted_at IS NULL ${publicView ? PUBLIC_HALL_FILTER : ''}
      ORDER BY created_at ASC, title ASC
    `).all(floorplan.event_id).map(h => {
      const bCount = db.prepare('SELECT COUNT(*) as cnt FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').get(h.id)?.cnt || 0;
      const bAvail = db.prepare(`SELECT COUNT(*) as cnt FROM booths WHERE floorplan_id = ? AND status = 'available' AND deleted_at IS NULL`).get(h.id)?.cnt || 0;
      return {
        id: h.id,
        eventId: h.event_id,
        title: h.title,
        status: h.status,
        slug: h.status === 'published' ? h.public_slug || null : null,
        totalBooths: bCount,
        availableBooths: bAvail
      };
    });

    return res.json({
      success: true,
      event: parentEvent,
      halls: siblingHalls,
      // Public view: no PIC / email / phone, private discounts or internal elements (AGENTS.md §20)
      floorplan: (publicView ? publicFloorplanPayload : (x) => x)({
        id: floorplan.id,
        event_id: floorplan.event_id,
        title: floorplan.title,
        venue,
        status: floorplan.status,
        public_slug: floorplan.status === 'published' ? floorplan.public_slug || null : null,
        canvas_fabric_json: floorplan.canvas_fabric_json ? JSON.parse(floorplan.canvas_fabric_json) : null,
        metadata: meta,
        blueprint: floorplan.blueprint_json ? JSON.parse(floorplan.blueprint_json) : null,
        updated_at: floorplan.updated_at,
        created_at: floorplan.created_at,
        booths,
        venueItems
      })
    });
  } catch (error) {
    console.error("Failed to fetch floorplan by id:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/:id/publish - Set specific template as live published
router.post('/:id/publish', (req, res) => {
  try {
    const { id } = req.params;
    const floorplan = db.prepare(`SELECT * FROM floorplans WHERE id = ?`).get(id);
    if (!floorplan) {
      return res.status(404).json({ success: false, error: 'Floorplan tidak ditemukan' });
    }

    // Several floorplans can be live at the same time, each on its own link
    const slug = db.transaction(() => {
      db.prepare(`UPDATE floorplans SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
      return ensurePublicSlug(floorplan);
    })();
    const liveCount = db.prepare(`SELECT COUNT(*) AS c FROM floorplans WHERE status = 'published' AND deleted_at IS NULL`).get().c;

    res.json({
      success: true,
      message: `Denah "${floorplan.title}" berhasil dipublikasikan di /live/${slug}`,
      floorplanId: id,
      slug,
      publicPath: `/live/${slug}`,
      liveCount
    });
  } catch (error) {
    console.error("Publish floorplan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/:id/unpublish - Stop publishing: back to draft, its public link stops working
// POST /api/floorplan/:id/merge-display { boothCodes: [...], separate: true|false }
// "Tampilkan Terpisah" / "Gabungkan Kembali" for one auto-merge group (AGENTS.md §18). Only the display flag changes:
// booths, prices, contracts and invoices stay as they are.
router.post('/:id/merge-display', (req, res) => {
  try {
    const { id } = req.params;
    const codes = (Array.isArray(req.body?.boothCodes) ? req.body.boothCodes : []).map(c => String(c || '').trim()).filter(Boolean);
    const separate = Boolean(req.body?.separate);
    const fp = db.prepare('SELECT id, canvas_fabric_json FROM floorplans WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!fp) return res.status(404).json({ success: false, error: 'Denah tidak ditemukan' });
    if (!codes.length) return res.status(400).json({ success: false, error: 'Pilih booth dari kelompok gabungan' });
    const lowerCodes = new Set(codes.map(c => c.toLowerCase()));
    db.transaction(() => {
      const setFlag = db.prepare('UPDATE booths SET merge_separate = ?, updated_at = CURRENT_TIMESTAMP WHERE floorplan_id = ? AND LOWER(TRIM(code)) = LOWER(TRIM(?))');
      codes.forEach(c => setFlag.run(separate ? 1 : 0, id, c));
      if (fp.canvas_fabric_json) {
        const canvas = JSON.parse(fp.canvas_fabric_json);
        (canvas.objects || []).forEach(o => {
          if (o?.isBooth && o.boothData && lowerCodes.has(String(o.boothData.code || '').trim().toLowerCase())) o.boothData.mergeSeparate = separate;
        });
        db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(canvas), id);
      }
    })();
    const { groups } = computeFloorplanMergeGroups(id, { onlyActive: false });
    res.json({ success: true, separate, groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/unpublish', (req, res) => {
  try {
    const { id } = req.params;
    const floorplan = db.prepare('SELECT id, title FROM floorplans WHERE id = ?').get(id);
    if (!floorplan) return res.status(404).json({ success: false, error: 'Floorplan tidak ditemukan' });
    db.prepare(`UPDATE floorplans SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    res.json({ success: true, message: `Publikasi denah "${floorplan.title}" dihentikan. Link publiknya tidak dapat dibuka lagi.`, floorplanId: id });
  } catch (error) {
    console.error('Unpublish floorplan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/:id/duplicate - Clone template as draft
router.post('/:id/duplicate', (req, res) => {
  try {
    const { id } = req.params;
    const source = db.prepare(`SELECT * FROM floorplans WHERE id = ?`).get(id);
    if (!source) {
      return res.status(404).json({ success: false, error: 'Floorplan sumber tidak ditemukan' });
    }

    const newId = `FP-${Date.now()}`;
    const newTitle = `Salinan ${source.title}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO floorplans (id, event_id, title, canvas_fabric_json, metadata_json, blueprint_json, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
      `).run(newId, source.event_id, newTitle, source.canvas_fabric_json, source.metadata_json, source.blueprint_json);

      const booths = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ?`).all(id);
      const insertBooth = db.prepare(`
        INSERT INTO booths (id, floorplan_id, code, category, shape, price, status, owner_name, width_m, height_m, facilities_json, coordinates_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      booths.forEach((b, idx) => {
        insertBooth.run(
          `booth_${Date.now()}_${idx + 1}`,
          newId,
          b.code,
          b.category,
          b.shape || 'rectangle',
          b.price,
          b.status,
          b.owner_name,
          b.width_m,
          b.height_m,
          b.facilities_json,
          b.coordinates_json
        );
      });

      const venueItems = db.prepare(`SELECT * FROM venue_items WHERE floorplan_id = ?`).all(id);
      const insertVenue = db.prepare(`
        INSERT INTO venue_items (id, floorplan_id, type, category, label, width_m, height_m, coordinates_json, properties_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      venueItems.forEach((v, idx) => {
        insertVenue.run(
          `venue_${Date.now()}_${idx + 1}`,
          newId,
          v.type,
          v.category,
          v.label,
          v.width_m,
          v.height_m,
          v.coordinates_json,
          v.properties_json || null
        );
      });
    })();

    res.json({
      success: true,
      message: `Template "${newTitle}" berhasil diduplikasi!`,
      newFloorplanId: newId
    });
  } catch (error) {
    console.error("Duplicate floorplan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/floorplan/:id - Delete a template
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const fp = db.prepare(`SELECT * FROM floorplans WHERE id = ?`).get(id);
    if (!fp) {
      return res.status(404).json({ success: false, error: 'Floorplan tidak ditemukan' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM orders WHERE floorplan_id = ?').run(id);
      db.prepare('DELETE FROM booths WHERE floorplan_id = ?').run(id);
      db.prepare('DELETE FROM venue_items WHERE floorplan_id = ?').run(id);
      db.prepare('DELETE FROM floorplans WHERE id = ?').run(id);
    })();

    res.json({ success: true, message: `Template "${fp.title}" berhasil dihapus.` });
  } catch (error) {
    console.error("Delete floorplan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/create-hall - Add a new Hall/Floorplan to an existing Event
router.post('/create-hall', (req, res) => {
  try {
    const { 
      eventId, 
      title = 'Hall Baru', 
      venue, 
      presetType = 'blank', 
      sourceId, 
      status = 'published' 
    } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'Project / Event ID wajib disertakan.' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Project / Event tidak ditemukan.' });
    }

    const newId = `FP-${Date.now()}`;
    const hallTitle = title.trim();

    // Check if copying from source
    let fabricJson = { version: '7.4.0', objects: [] };
    let booths = [];
    let venueItems = [];

    if (sourceId) {
      const source = db.prepare('SELECT * FROM floorplans WHERE id = ?').get(sourceId);
      if (source) {
        try { fabricJson = JSON.parse(source.canvas_fabric_json); } catch (e) {}
        const srcBooths = db.prepare('SELECT * FROM booths WHERE floorplan_id = ?').all(sourceId);
        const srcVenue = db.prepare('SELECT * FROM venue_items WHERE floorplan_id = ?').all(sourceId);
        booths = srcBooths.map(b => ({
          ...b,
          id: `booth_${newId}_${b.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          status: 'available',
          owner_name: ''
        }));
        venueItems = srcVenue.map(v => ({
          ...v,
          id: `venue_${newId}_${v.type}_${Date.now()}`
        }));
      }
    }

    const meta = {
      schema_version: '1.0',
      event: {
        id: event.id,
        title: event.title,
        venue: venue || event.venue,
        created_at: new Date().toISOString()
      },
      floorplan: {
        title: hallTitle,
        scale: '20px = 1m',
        grid_size_px: 20
      }
    };

    db.transaction(() => {
      db.prepare(`
        INSERT INTO floorplans (id, event_id, title, canvas_fabric_json, metadata_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(newId, event.id, hallTitle, JSON.stringify(fabricJson), JSON.stringify(meta), status);

      // Insert booths if cloned
      const insertBooth = db.prepare(`
        INSERT INTO booths (id, floorplan_id, code, category, price, status, owner_name, width_m, height_m, shape, facilities_json, coordinates_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of booths) {
        insertBooth.run(
          b.id,
          newId,
          b.code,
          b.category || 'Standard',
          b.price || 5000000,
          b.status || 'available',
          b.owner_name || '',
          b.width_m || 3,
          b.height_m || 3,
          b.shape || 'rectangle',
          b.facilities_json || '[]',
          b.coordinates_json || '{}'
        );
      }
    })();

    const hallObj = {
      id: newId,
      eventId: event.id,
      eventTitle: event.title,
      title: hallTitle,
      venue: venue || event.venue,
      status
    };

    res.json({
      success: true,
      hall: hallObj,
      floorplan: hallObj
    });
  } catch (error) {
    console.error("Create hall error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/floorplan/save - Save draft or publish floorplan
router.post('/save', (req, res) => {
  try {
    const id = req.body.id || `FP-${Date.now()}`;
    const eventId = req.body.eventId || 'EVT-2026-001';
    const title = req.body.title || 'Denah Utama Hall A';
    const status = req.body.status || 'published';
    const blueprint = req.body.blueprint || null;

    let fabricJson = req.body.fabricJson || req.body.canvas_fabric_json || req.body.fabric_json || null;
    if (typeof fabricJson === 'string') {
      try { fabricJson = JSON.parse(fabricJson); } catch (e) {}
    }
    let metadata = req.body.metadata || req.body.metadata_json || null;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch (e) {}
    }
    let booths = req.body.booths || metadata?.booths || [];
    let venueElements = req.body.venueElements || req.body.venue_elements || metadata?.venue_elements || metadata?.venueElements || [];

    // Booth layout before this save: the operations team is notified when booths change (Denah Operasional)
    const previousCanvasJson = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(id)?.canvas_fabric_json || null;

    const saveTransaction = db.transaction(() => {
      // 1. Insert or update floorplan
      const existing = db.prepare('SELECT id FROM floorplans WHERE id = ?').get(id);
      const floorplanId = existing ? existing.id : id;

      // Safety Lock: Resolve booths from payload or extract from fabricJson
      let resolvedBooths = Array.isArray(booths) ? [...booths] : [];
      if (resolvedBooths.length === 0 && fabricJson?.objects?.length > 0) {
        resolvedBooths = extractBoothsFromFabricJson(fabricJson.objects);
      }

      // Safety Lock: Ensure booth objects in fabricJson have isBooth: true and boothData populated
      if (fabricJson && Array.isArray(fabricJson.objects)) {
        fabricJson.objects.forEach(o => {
          // Never convert venue items (stage, toilet, exit, pillar, wall, etc.) into booths!
          if (o.isVenueItem || o.venueData) return;

          if (!o.isBooth && resolvedBooths.length > 0) {
            const subObjects = o.objects || [];
            const textObjs = subObjects.filter(s => {
              const t = (s.type || '').toLowerCase();
              return t === 'text' || t === 'fabrictext' || t === 'i-text';
            });
            const texts = textObjs.map(s => (s.text || '').trim()).filter(Boolean);

            const match = resolvedBooths.find(b => {
              const bCode = (b.code || b.booth_number || '').trim().toLowerCase();
              if (!bCode) return false;
              return texts.some(t => t.toLowerCase() === bCode);
            });

            if (match) {
              o.isBooth = true;
              o.boothData = {
                id: match.id,
                code: match.code || match.booth_number,
                category: match.category || 'Standard',
                shape: match.shape || 'rectangle',
                price: match.price || 5000000,
                status: match.status || 'available',
                ownerName: match.owner_name || match.ownerName || '',
                widthM: match.widthM || match.dimensions_meters?.width || 3,
                heightM: match.heightM || match.dimensions_meters?.height || 3
              };
            }
          }
        });
      }

      if (existing) {
        db.prepare(`
          UPDATE floorplans 
          SET title = ?, canvas_fabric_json = ?, metadata_json = ?, blueprint_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title,
          fabricJson ? JSON.stringify(fabricJson) : null,
          metadata ? JSON.stringify(metadata) : null,
          blueprint ? JSON.stringify(blueprint) : null,
          status,
          floorplanId
        );
      } else {
        // Ensure parent event exists in events table to prevent foreign key violation
        const parentEvt = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);
        if (!parentEvt) {
          db.prepare(`
            INSERT INTO events (id, title, venue, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            eventId,
            title || 'Event Pameran Baru',
            metadata?.event?.venue || metadata?.venue || 'Jakarta Convention Center',
            new Date().toISOString().split('T')[0],
            new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            'active'
          );
        }

        db.prepare(`
          INSERT INTO floorplans (id, event_id, title, canvas_fabric_json, metadata_json, blueprint_json, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          floorplanId,
          eventId,
          title,
          fabricJson ? JSON.stringify(fabricJson) : null,
          metadata ? JSON.stringify(metadata) : null,
          blueprint ? JSON.stringify(blueprint) : null,
          status
        );
      }

      // Safety Lock: Preserve active booth bookings & orders to prevent stale editor saves from erasing live bookings
      const existingBoothsInDb = db.prepare('SELECT code, status, owner_name, brand_category, pic_name, email, phone, registration_source, registered_by, exhibitor_id, merge_separate FROM booths WHERE floorplan_id = ?').all(floorplanId);
      const existingDbMap = new Map(existingBoothsInDb.map(b => [b.code, b]));

      // Safety Lock: Invoices take highest priority, followed by active orders & database state
      // Booth status / tenant restored from the booth CONTRACT (DP + Pelunasan / Penuh), not a single invoice
      const contractStateCache = new Map();
      const contractStateFor = (code) => {
        const key = String(code || '').trim().toLowerCase();
        if (!key) return null;
        if (!contractStateCache.has(key)) {
          const c = getContract(floorplanId, code);
          const inv = c.latestInvoice;
          // Only canceled invoices + an open booking without invoice (Booking Manual by Sales): the booking decides
          const openBooking = c.status === 'CANCELED' && db.prepare(`
            SELECT 1 FROM orders WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
              AND TRIM(COALESCE(invoice_number, '')) = '' AND LOWER(TRIM(booth_code)) = ? LIMIT 1
          `).get(floorplanId, key);
          contractStateCache.set(key, c.status && !openBooking ? {
            derived_status: c.boothStatus,
            company_name: c.ownerName,
            client_name: inv?.client_name || '',
            client_email: inv?.client_email || '',
            client_phone: inv?.client_phone || ''
          } : null);
        }
        return contractStateCache.get(key);
      };

      const activeOrders = db.prepare(`
        SELECT booth_code, company_name, pic_name, email, phone, brand_category, payment_status, source, admin_name, exhibitor_id,
               CASE WHEN payment_status = 'PAID' THEN 'sold' ELSE 'reserved' END as derived_status
        FROM orders 
        WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
        ORDER BY created_at ASC
      `).all(floorplanId);
      const activeOrderMap = new Map(activeOrders.map(o => [o.booth_code, o]));

      // Merge preserved booking & invoice info into resolvedBooths
      resolvedBooths.forEach(b => {
        const bCode = (b.booth_number || b.code || '').trim().toLowerCase();
        const activeInv = contractStateFor(bCode);
        const activeOrder = activeOrders.find(o => (o.booth_code || '').trim().toLowerCase() === bCode);
        const existingDb = existingDbMap.get(b.booth_number || b.code);

        // Auto-merge (AGENTS.md §18): exhibitor ID follows the contract; "Tampilkan Terpisah" comes from the editor or the DB
        const payloadSeparate = b.mergeSeparate !== undefined ? b.mergeSeparate : b.merge_separate;
        b.merge_separate = payloadSeparate !== undefined ? (payloadSeparate ? 1 : 0) : (existingDb?.merge_separate ? 1 : 0);
        b.exhibitor_id = existingDb?.exhibitor_id || '';

        // If invoice exists, it is the single authority
        if (activeInv) {
          b.status = activeInv.derived_status;
          b.owner_name = activeInv.derived_status === 'available' ? '' : activeInv.company_name;
          b.exhibitor_id = activeInv.derived_status === 'available' ? '' : exhibitorIdFor(activeInv.client_email, activeInv.company_name);
          b.pic_name = activeInv.client_name || '';
          b.email = activeInv.client_email || '';
          b.phone = activeInv.client_phone || '';
        } else if (activeOrder) {
          b.status = activeOrder.derived_status;
          b.owner_name = activeOrder.company_name;
          b.exhibitor_id = activeOrder.exhibitor_id || exhibitorIdFor(activeOrder.email, activeOrder.company_name);
          b.pic_name = activeOrder.pic_name || '';
          b.email = activeOrder.email || '';
          b.phone = activeOrder.phone || '';
          b.registration_source = activeOrder.source || 'online';
          b.registered_by = activeOrder.admin_name || '';
          if (activeOrder.brand_category) b.brand_category = activeOrder.brand_category;
        } else if (existingDb) {
          b.pic_name = b.pic_name || existingDb.pic_name || '';
          b.email = b.email || existingDb.email || '';
          b.phone = b.phone || existingDb.phone || '';
          b.registration_source = b.registration_source || existingDb.registration_source || 'online';
          b.registered_by = b.registered_by || existingDb.registered_by || '';
        }
      });

      // Also ensure fabricJson booth objects reflect preserved status
      if (fabricJson && Array.isArray(fabricJson.objects)) {
        fabricJson.objects.forEach(o => {
          if (o.isBooth || o.boothData) {
            const bCode = (o.boothData?.code || o.boothData?.booth_number || '').trim().toLowerCase();
            const activeInv = contractStateFor(bCode);
            const activeOrder = activeOrders.find(o => (o.booth_code || '').trim().toLowerCase() === bCode);

            if (activeInv) {
              o.boothData.status = activeInv.derived_status;
              o.boothData.ownerName = activeInv.derived_status === 'available' ? '' : activeInv.company_name;
              o.boothData.exhibitorId = activeInv.derived_status === 'available' ? '' : exhibitorIdFor(activeInv.client_email, activeInv.company_name);
              o.boothData.picName = activeInv.client_name || '';
              o.boothData.email = activeInv.client_email || '';
              o.boothData.phone = activeInv.client_phone || '';
            } else if (activeOrder) {
              o.boothData.status = activeOrder.derived_status;
              o.boothData.ownerName = activeOrder.company_name;
              o.boothData.picName = activeOrder.pic_name || '';
              o.boothData.email = activeOrder.email || '';
              o.boothData.phone = activeOrder.phone || '';
              o.boothData.registrationSource = activeOrder.source || 'online';
              o.boothData.registeredBy = activeOrder.admin_name || '';
              if (activeOrder.brand_category) o.boothData.brandCategory = activeOrder.brand_category;
            }
          }
        });
      }

      // Role Operasional edits the layout (also sizes, numbers, prices) but never registers or changes a tenant:
      // tenant, status and private discount of every booth stay exactly as stored; a new booth starts Available.
      if (req.user?.role === 'operations') {
        const stored = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId);
        const storedFor = (code, id) => stored.find(r => String(r.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase())
          || (id ? stored.find(r => r.id === id || String(r.id).endsWith(`_${id}`)) : null) || null;
        const tenantOf = (row) => ({
          status: row?.status || 'available', ownerName: row?.owner_name || '', brandCategory: row?.brand_category || '',
          picName: row?.pic_name || '', email: row?.email || '', phone: row?.phone || '',
          registrationSource: row?.registration_source || '', registeredBy: row?.registered_by || '', exhibitorId: row?.exhibitor_id || '',
          discountType: row?.discount_type || 'nominal', discountValue: row?.discount_value || 0,
          discountAmount: row?.discount_amount || 0, discountReason: row?.discount_reason || ''
        });
        resolvedBooths.forEach(b => {
          const t = tenantOf(storedFor(b.booth_number || b.code, b.id));
          Object.assign(b, t, {
            owner_name: t.ownerName, brand_category: t.brandCategory, pic_name: t.picName, registration_source: t.registrationSource,
            registered_by: t.registeredBy, exhibitor_id: t.exhibitorId, discount_type: t.discountType, discount_value: t.discountValue,
            discount_amount: t.discountAmount, discount_reason: t.discountReason
          });
        });
        (fabricJson?.objects || []).forEach(o => {
          if (!(o?.isBooth || o?.boothData) || !o.boothData) return;
          Object.assign(o.boothData, tenantOf(storedFor(o.boothData.code || o.boothData.booth_number, o.boothData.id)));
        });
      }

      // 2. Sync booths table (price / discount before this save: changed booths get their contract recomputed)
      const pricingBefore = new Map(db.prepare('SELECT code, price, discount_amount FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId)
        .map(r => [String(r.code || '').trim().toLowerCase(), r]));
      const repriced = [];
      db.prepare('DELETE FROM booths WHERE floorplan_id = ?').run(floorplanId);

      const insertBooth = db.prepare(`
        INSERT OR REPLACE INTO booths (
          id, floorplan_id, code, category, brand_category, shape, price, status, owner_name, pic_name, email, phone, registration_source, registered_by, width_m, height_m, facilities_json, coordinates_json, discount_type, discount_value, discount_amount, discount_reason,
          exhibitor_id, merge_separate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const usedBoothIds = new Set();
      for (let i = 0; i < resolvedBooths.length; i++) {
        const b = resolvedBooths[i];
        const rawCode = b.booth_number || b.code || `B-${i + 1}`;
        let candidateId = b.id 
          ? (b.id.startsWith(floorplanId) ? b.id : `${floorplanId}_${b.id}`)
          : `${floorplanId}_booth_${rawCode}`;
        if (usedBoothIds.has(candidateId)) {
          candidateId = `${candidateId}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
        }
        usedBoothIds.add(candidateId);

        insertBooth.run(
          candidateId,
          floorplanId,
          rawCode,
          b.category || 'Standard',
          b.brand_category || b.brandCategory || '',
          b.shape || 'rectangle',
          b.price || 5000000,
          b.status || 'available',
          b.owner_name || b.ownerName || '',
          b.pic_name || b.picName || '',
          b.email || '',
          b.phone || '',
          b.registration_source || b.registrationSource || 'online',
          b.registered_by || b.registeredBy || '',
          b.dimensions_meters?.width || b.widthM || 3,
          b.dimensions_meters?.height || b.heightM || 3,
          JSON.stringify(b.facilities || []),
          JSON.stringify(b.coordinates || {}),
          b.discount_type || b.discountType || 'nominal',
          b.discount_value !== undefined ? b.discount_value : (b.discountValue !== undefined ? b.discountValue : 0),
          b.discount_amount !== undefined ? b.discount_amount : (b.discountAmount !== undefined ? b.discountAmount : 0),
          b.discount_reason || b.discountReason || '',
          ['sold', 'reserved', 'booked'].includes(String(b.status || '').toLowerCase()) ? (b.exhibitor_id || '') : '',
          b.merge_separate ? 1 : 0
        );

        // Price / private discount changed in the Studio: the booth's contract is recomputed after the loop
        // (only its unpaid balance invoice follows; paid invoices never change, multi-booth contracts included)
        const before = pricingBefore.get(String(rawCode || '').trim().toLowerCase());
        const newPrice = Number(b.price || 5000000) || 0;
        const newDiscount = Number(b.discount_amount !== undefined ? b.discount_amount : (b.discountAmount !== undefined ? b.discountAmount : 0)) || 0;
        if (before && (Number(before.price) !== newPrice || Number(before.discount_amount || 0) !== newDiscount)) repriced.push(rawCode);
      }

      // Contracts of repriced booths: the unpaid Penuh / Pelunasan follows price - discount (+ PPN) of ALL its booths
      [...new Set(repriced)].forEach(code => recalcContract(floorplanId, code, ''));

      // 3. Sync venue items
      db.prepare('DELETE FROM venue_items WHERE floorplan_id = ?').run(floorplanId);
      const insertVenue = db.prepare(`
        INSERT OR REPLACE INTO venue_items (id, floorplan_id, type, category, label, width_m, height_m, coordinates_json, properties_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const usedVenueIds = new Set();
      for (let i = 0; i < venueElements.length; i++) {
        const v = venueElements[i];
        let candidateId = v.id ? `${floorplanId}_${v.id}` : `${floorplanId}_venue_${v.type || 'item'}_${i + 1}`;
        if (usedVenueIds.has(candidateId)) {
          candidateId = `${candidateId}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
        }
        usedVenueIds.add(candidateId);

        insertVenue.run(
          candidateId,
          floorplanId,
          v.type || 'generic',
          v.category || 'facility',
          v.label || '',
          v.dimensions_meters?.width || 3,
          v.dimensions_meters?.height || 3,
          JSON.stringify(v.coordinates || {}),
          v.properties ? JSON.stringify(v.properties) : null
        );
      }

      return floorplanId;
    });

    const savedId = saveTransaction();
    if (previousCanvasJson) notifyIfBoothsChanged(savedId, previousCanvasJson, req.user?.name || '');

    res.json({
      success: true,
      message: status === 'published' ? `Template "${title}" berhasil dipublikasikan!` : `Draft template "${title}" berhasil disimpan!`,
      id: savedId,
      floorplanId: savedId,
      floorplan: { id: savedId, title, status }
    });
  } catch (error) {
    console.error("Save floorplan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto cleanup routine: permanently delete soft-deleted projects > 30 days old without PAID/DP invoices
function cleanupExpiredTrash() {
  try {
    const expiredProjects = db.prepare(`
      SELECT id, title FROM floorplans 
      WHERE deleted_at IS NOT NULL 
        AND deleted_at < datetime('now', '-30 days')
        AND NOT EXISTS (
          SELECT 1 FROM invoices 
          WHERE floorplan_id = floorplans.id 
            AND (UPPER(payment_status) = 'PAID' OR UPPER(payment_status) = 'PARTIAL' OR paid_amount > 0)
        )
    `).all();

    if (expiredProjects.length > 0) {
      const deleteBooths = db.prepare(`DELETE FROM booths WHERE floorplan_id = ?`);
      const deleteOrders = db.prepare(`DELETE FROM orders WHERE floorplan_id = ?`);
      const deleteInvoices = db.prepare(`DELETE FROM invoices WHERE floorplan_id = ?`);
      const deleteVenues = db.prepare(`DELETE FROM venue_items WHERE floorplan_id = ?`);
      const deleteFp = db.prepare(`DELETE FROM floorplans WHERE id = ?`);

      for (const p of expiredProjects) {
        deleteBooths.run(p.id);
        deleteOrders.run(p.id);
        deleteInvoices.run(p.id);
        deleteVenues.run(p.id);
        deleteFp.run(p.id);
        console.log(`[AutoCleanup] Purged expired trash project: ${p.title} (${p.id})`);
      }
    }
  } catch (e) {
    console.warn("[AutoCleanup] Error cleaning expired trash:", e);
  }
}
cleanupExpiredTrash();

export default router;
