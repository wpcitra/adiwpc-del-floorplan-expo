import express from 'express';
import db from '../db.js';
import { getContract, invoiceCodeTokens, removeBoothFromInvoice } from '../utils/contractBilling.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';
import { getExhibitorsData } from './orderRoutes.js';

const router = express.Router();

// GET /api/stats - Dashboard metrics and charts data with project/floorplan filter
router.get('/', (req, res) => {
  try {
    // Ensure all booth and order statuses strictly follow the Invoice & Tenant Management page
    syncPaymentStatusFromInvoices();

    const rawProjectId = req.query.projectId || req.query.floorplanId;
    const floorplanId = rawProjectId && rawProjectId !== 'all' ? rawProjectId : null;

    // Fetch all project floorplans to populate the Project Selector list
    const floorplans = db.prepare(`
      SELECT fp.id, fp.event_id, fp.title, fp.status, fp.blueprint_json, fp.created_at, fp.updated_at,
             COALESCE(e.title, 'Event Expo') as event_title,
             COALESCE(e.venue, 'Jakarta Convention Center') as event_venue,
             COALESCE(e.start_date, fp.created_at) as start_date
      FROM floorplans fp
      LEFT JOIN events e ON fp.event_id = e.id
      WHERE fp.deleted_at IS NULL
      ORDER BY fp.created_at ASC, fp.updated_at DESC
    `).all();

    const floorplanList = floorplans.map(fp => {
      const booths = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL`).all(fp.id);
      const totalBooths = booths.length;
      const availableBooths = booths.filter(b => b.status === 'available').length;
      const reservedBooths = booths.filter(b => b.status === 'reserved').length;
      const soldBooths = booths.filter(b => b.status === 'sold').length;
      const freeBooths = booths.filter(b => b.category === 'Free' || b.price === 0).length;
      const totalRevenue = booths.filter(b => b.status === 'sold' && b.category !== 'Free' && b.price > 0)
        .reduce((acc, b) => acc + (b.price || 0), 0);
      const potentialRevenue = booths.filter(b => b.category !== 'Free' && b.price > 0)
        .reduce((acc, b) => acc + (b.price || 0), 0);

      return {
        id: fp.id,
        event_id: fp.event_id,
        event_title: fp.event_title,
        title: fp.title || 'Denah Tanpa Judul',
        venue: fp.event_venue,
        status: fp.status || 'draft',
        is_published: fp.status === 'published',
        start_date: fp.start_date || fp.created_at,
        totalBooths,
        availableBooths,
        reservedBooths,
        soldBooths,
        freeBooths,
        totalRevenue,
        potentialRevenue,
        paidPercentage: totalBooths > 0 ? Number(((soldBooths / totalBooths) * 100).toFixed(1)) : 0,
        bookedPercentage: totalBooths > 0 ? Number(((reservedBooths / totalBooths) * 100).toFixed(1)) : 0,
        freePercentage: totalBooths > 0 ? Number(((freeBooths / totalBooths) * 100).toFixed(1)) : 0,
        availablePercentage: totalBooths > 0 ? Number(((availableBooths / totalBooths) * 100).toFixed(1)) : 0,
        created_at: fp.created_at,
        updated_at: fp.updated_at
      };
    });

    const eventsList = db.prepare(`SELECT * FROM events ORDER BY created_at ASC`).all().map(evt => {
      const halls = floorplanList.filter(f => f.event_id === evt.id);
      return {
        id: evt.id,
        title: evt.title,
        venue: evt.venue,
        halls
      };
    });

    // Determine target project filter: can be an event ID (aggregates all halls) or a specific hall/floorplan ID
    let targetFloorplanIds = [];
    let selectedProjectInfo = null;

    if (rawProjectId && rawProjectId !== 'all' && rawProjectId !== 'global') {
      const matchingHalls = db.prepare('SELECT id FROM floorplans WHERE event_id = ? AND deleted_at IS NULL').all(rawProjectId);
      if (matchingHalls.length > 0) {
        targetFloorplanIds = matchingHalls.map(h => h.id);
        const evt = db.prepare('SELECT * FROM events WHERE id = ?').get(rawProjectId);
        selectedProjectInfo = {
          id: rawProjectId,
          title: evt ? `${evt.title} (Semua Hall)` : 'Event Pameran',
          venue: evt?.venue || 'Venue'
        };
      } else {
        targetFloorplanIds = [rawProjectId];
        selectedProjectInfo = floorplanList.find(p => p.id === rawProjectId) || null;
      }
    }

    const hasFilter = targetFloorplanIds.length > 0;
    const inPlaceholders = hasFilter ? targetFloorplanIds.map(() => '?').join(',') : '';
    const boothFilterClause = hasFilter 
      ? `WHERE floorplan_id IN (${inPlaceholders}) AND deleted_at IS NULL` 
      : `WHERE deleted_at IS NULL`;
    const boothParams = hasFilter ? targetFloorplanIds : [];

    const totalBooths = db.prepare(`SELECT COUNT(*) as count FROM booths ${boothFilterClause}`).get(...boothParams).count;
    
    const available = db.prepare(`
      SELECT COUNT(*) as count FROM booths 
      ${hasFilter ? `WHERE floorplan_id IN (${inPlaceholders}) AND status = 'available' AND deleted_at IS NULL` : "WHERE status = 'available' AND deleted_at IS NULL"}
    `).get(...boothParams).count;

    const reserved = db.prepare(`
      SELECT COUNT(*) as count FROM booths 
      ${hasFilter ? `WHERE floorplan_id IN (${inPlaceholders}) AND status = 'reserved' AND deleted_at IS NULL` : "WHERE status = 'reserved' AND deleted_at IS NULL"}
    `).get(...boothParams).count;

    const sold = db.prepare(`
      SELECT COUNT(*) as count FROM booths 
      ${hasFilter ? `WHERE floorplan_id IN (${inPlaceholders}) AND status = 'sold' AND deleted_at IS NULL` : "WHERE status = 'sold' AND deleted_at IS NULL"}
    `).get(...boothParams).count;
    
    // Free / Additional booths (category is 'Free' or price is 0)
    const freeCount = db.prepare(`
      SELECT COUNT(*) as count FROM booths 
      ${hasFilter ? `WHERE floorplan_id IN (${inPlaceholders}) AND (category = 'Free' OR price = 0) AND deleted_at IS NULL` : "WHERE (category = 'Free' OR price = 0) AND deleted_at IS NULL"}
    `).get(...boothParams).count;

    // Financial revenue: Invoices table is the single source of truth across website
    let paidInvoiceRevenue = 0;
    let unpaidInvoiceAmount = 0;
    if (hasFilter) {
      paidInvoiceRevenue = db.prepare(`
        SELECT SUM(CASE WHEN payment_status = 'PAID' THEN total_amount WHEN payment_status = 'PARTIAL' THEN paid_amount ELSE 0 END) as total FROM invoices 
        WHERE (floorplan_id IN (${inPlaceholders}) OR event_id = ?) AND deleted_at IS NULL
      `).get(...targetFloorplanIds, rawProjectId)?.total || 0;

      unpaidInvoiceAmount = db.prepare(`
        SELECT SUM(CASE WHEN payment_status IN ('UNPAID', 'PENDING') THEN total_amount WHEN payment_status = 'PARTIAL' THEN MAX(0, total_amount - paid_amount) ELSE 0 END) as total FROM invoices 
        WHERE (floorplan_id IN (${inPlaceholders}) OR event_id = ?) AND deleted_at IS NULL
      `).get(...targetFloorplanIds, rawProjectId)?.total || 0;
    } else {
      paidInvoiceRevenue = db.prepare("SELECT SUM(CASE WHEN payment_status = 'PAID' THEN total_amount WHEN payment_status = 'PARTIAL' THEN paid_amount ELSE 0 END) as total FROM invoices WHERE deleted_at IS NULL").get()?.total || 0;
      unpaidInvoiceAmount = db.prepare("SELECT SUM(CASE WHEN payment_status IN ('UNPAID', 'PENDING') THEN total_amount WHEN payment_status = 'PARTIAL' THEN MAX(0, total_amount - paid_amount) ELSE 0 END) as total FROM invoices WHERE deleted_at IS NULL").get()?.total || 0;
    }

    let orderRevenue = 0;
    if (hasFilter) {
      const row = db.prepare(`SELECT SUM(total_amount) as total FROM orders WHERE floorplan_id IN (${inPlaceholders}) AND payment_status = 'PAID' AND deleted_at IS NULL`).get(...targetFloorplanIds);
      orderRevenue = row?.total || 0;
    } else {
      const row = db.prepare("SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'PAID' AND deleted_at IS NULL").get();
      orderRevenue = row?.total || 0;
    }

    const soldBoothsRevenue = db.prepare(`
      SELECT SUM(price) as total FROM booths 
      WHERE ${hasFilter ? `floorplan_id IN (${inPlaceholders}) AND ` : ''} status = 'sold' AND (category != 'Free' OR category IS NULL) AND price > 0 AND deleted_at IS NULL
    `).get(...boothParams)?.total || 0;
    
    const reservedBoothsRevenue = db.prepare(`
      SELECT SUM(price) as total FROM booths 
      WHERE ${hasFilter ? `floorplan_id IN (${inPlaceholders}) AND ` : ''} status = 'reserved' AND (category != 'Free' OR category IS NULL) AND price > 0 AND deleted_at IS NULL
    `).get(...boothParams)?.total || 0;

    const remainingBill = unpaidInvoiceAmount > 0 ? unpaidInvoiceAmount : reservedBoothsRevenue;

    // Potential revenue excludes Free / 0 price booths
    const potentialRevenueRow = db.prepare(`
      SELECT SUM(price) as total FROM booths 
      WHERE ${hasFilter ? `floorplan_id IN (${inPlaceholders}) AND ` : ''} (category != 'Free' OR category IS NULL) AND price > 0 AND deleted_at IS NULL
    `).get(...boothParams);
    const potentialRevenue = potentialRevenueRow?.total || 0;
    const totalRevenue = paidInvoiceRevenue > 0 ? paidInvoiceRevenue : Math.max(orderRevenue, soldBoothsRevenue);

    // Percentage calculations
    const paidPercentage = totalBooths > 0 ? Number(((sold / totalBooths) * 100).toFixed(1)) : 0;
    const bookedPercentage = totalBooths > 0 ? Number(((reserved / totalBooths) * 100).toFixed(1)) : 0;
    const availablePercentage = totalBooths > 0 ? Number(((available / totalBooths) * 100).toFixed(1)) : 0;
    const freePercentage = totalBooths > 0 ? Number(((freeCount / totalBooths) * 100).toFixed(1)) : 0;
    const remainingPercentage = potentialRevenue > 0 ? Number(((remainingBill / potentialRevenue) * 100).toFixed(1)) : 0;

    // Synchronized Exhibitor Brand List (strictly matches Exhibitor Directory / order authority)
    const exhibitorsList = getExhibitorsData(rawProjectId && rawProjectId !== 'all' ? rawProjectId : null);

    // Category Breakdown (computed directly from booths table)
    const categoryRows = db.prepare(`
      SELECT category, status, COUNT(*) as count 
      FROM booths 
      ${boothFilterClause}
      GROUP BY category, status
    `).all(...boothParams);

    const categoryMap = {};
    categoryRows.forEach(r => {
      const cat = r.category || 'Standard';
      if (!categoryMap[cat]) categoryMap[cat] = { name: cat, total: 0, sold: 0, reserved: 0, free: 0, available: 0 };
      const c = Number(r.count) || 0;
      categoryMap[cat].total += c;
      if (r.status === 'sold') categoryMap[cat].sold += c;
      else if (r.status === 'reserved') categoryMap[cat].reserved += c;
      else if (r.status === 'available') categoryMap[cat].available += c;
    });
    const categoryBreakdown = Object.values(categoryMap).map(c => {
      const filled = c.sold + c.reserved;
      return {
        ...c,
        filled,
        occupancy: c.total > 0 ? Number(((filled / c.total) * 100).toFixed(1)) : 0,
        isSoldOut: c.available === 0 && c.total > 0
      };
    }).sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      selectedProjectId: rawProjectId || 'all',
      selectedProject: selectedProjectInfo,
      eventsList,
      floorplanList,
      exhibitorsList,
      categoryBreakdown,
      stats: {
        totalBooths,
        available,
        reserved,
        sold,
        paidCount: sold,
        bookedCount: reserved,
        availableCount: available,
        freeCount,
        paidPercentage,
        bookedPercentage,
        availablePercentage,
        freePercentage,
        occupancyRate: totalBooths > 0 ? Number((((sold + reserved) / totalBooths) * 100).toFixed(1)) : 0,
        totalRevenue,
        potentialRevenue,
        remainingBill,
        remainingPercentage
      }
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/stats/booth/:id/status - Update booth status and brand name directly from Dashboard
router.patch('/booth/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, owner_name } = req.body;
    
    let booth = db.prepare('SELECT * FROM booths WHERE id = ?').get(id);
    if (!booth) {
      booth = db.prepare(`
        SELECT b.* FROM booths b
        JOIN orders o ON (o.booth_id = b.id OR (o.floorplan_id = b.floorplan_id AND (o.booth_code = b.code OR ('+' || b.code || '+') LIKE ('%+' || o.booth_code || '+%'))))
        WHERE o.id = ? AND b.deleted_at IS NULL LIMIT 1
      `).get(id);
    }
    if (!booth) {
      booth = db.prepare('SELECT * FROM booths WHERE LOWER(TRIM(code)) = LOWER(TRIM(?)) AND deleted_at IS NULL LIMIT 1').get(id);
    }
    if (!booth) {
      // Check if it's an order record without an active booth row
      const ord = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(id);
      if (ord) {
        if (owner_name !== undefined) {
          db.prepare('UPDATE orders SET company_name = ? WHERE id = ?').run(owner_name, ord.id);
          db.prepare('UPDATE invoices SET company_name = ?, updated_at = CURRENT_TIMESTAMP WHERE invoice_number = ? OR (floorplan_id = ? AND booth_code = ?)').run(owner_name, ord.invoice_number, ord.floorplan_id, ord.booth_code);
        }
        return res.json({
          success: true,
          message: `Data brand order ${ord.id} berhasil diperbarui!`,
          boothId: id,
          newStatus: status
        });
      }
      return res.status(404).json({ success: false, error: 'Booth tidak ditemukan' });
    }

    const updates = [];
    const params = [];
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (owner_name !== undefined) {
      updates.push('owner_name = ?');
      params.push(owner_name);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(booth.id);

    db.prepare(`UPDATE booths SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Sync the booth CONTRACT invoices (DP + Pelunasan / Penuh) of this floorplan; add-on invoices are not touched
    const statusWarnings = [];
    if (status !== undefined || owner_name !== undefined) {
      const contract = getContract(booth.floorplan_id, booth.code, booth.id);
      const live = contract.invoices.filter(inv => String(inv.payment_status).toUpperCase() !== 'CANCELED');
      const setInvoice = db.prepare(`
        UPDATE invoices SET payment_status = ?, paid_amount = ?, remaining_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);

      if (status === 'sold') {
        live.forEach(inv => setInvoice.run('PAID', inv.total_amount, 0, inv.id));
      } else if (status === 'available') {
        // Unmerge (AGENTS.md §18): a multi-booth contract only loses this booth; its own contracts are canceled
        live.forEach(inv => {
          const shared = invoiceCodeTokens(inv.booth_code).length > 1 && String(inv.booth_code).trim().toLowerCase() !== String(booth.code).trim().toLowerCase();
          if (shared) {
            const { warning } = removeBoothFromInvoice(inv, booth.code, 'booth dikembalikan ke Available');
            if (warning) statusWarnings.push(warning);
          } else {
            setInvoice.run('CANCELED', inv.paid_amount || 0, 0, inv.id);
          }
        });
        db.prepare("UPDATE booths SET exhibitor_id = '', merge_separate = 0 WHERE id = ?").run(booth.id);
      } else if (status === 'reserved' && contract.status === 'PAID') {
        // Back from "Lunas": reopen the balance invoice, a paid DP stays paid
        const balance = live.find(inv => (inv.invoice_kind || 'full') !== 'dp');
        if (balance) setInvoice.run('UNPAID', 0, balance.total_amount, balance.id);
      }

      if (owner_name !== undefined) {
        live.forEach(inv => db.prepare('UPDATE invoices SET company_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(owner_name, inv.id));
      }

      const orderPaymentStatus = status === 'sold' ? 'PAID' : status === 'available' ? 'CANCELED' : null;
      db.prepare(`
        UPDATE orders
        SET ${orderPaymentStatus ? 'payment_status = ?,' : ''} company_name = COALESCE(?, company_name)
        WHERE floorplan_id = ? AND deleted_at IS NULL AND ((? != '' AND booth_id = ?) OR LOWER(TRIM(booth_code)) = LOWER(TRIM(?)))
      `).run(
        ...(orderPaymentStatus ? [orderPaymentStatus] : []),
        owner_name !== undefined ? owner_name : null,
        booth.floorplan_id, booth.id, booth.id, booth.code
      );
    }

    // Also sync canvas JSON if floorplan exists
    if (booth.floorplan_id) {
      const fpRecord = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(booth.floorplan_id);
      if (fpRecord && fpRecord.canvas_fabric_json) {
        try {
          const fabricData = JSON.parse(fpRecord.canvas_fabric_json);
          if (fabricData.objects) {
            fabricData.objects.forEach(obj => {
              if ((obj.isBooth || obj.boothData) && (obj.boothData?.code === booth.code || obj.boothData?.id === id)) {
                if (obj.boothData) {
                  if (status !== undefined) obj.boothData.status = status;
                  if (owner_name !== undefined) obj.boothData.ownerName = owner_name;
                }
              }
            });
            db.prepare('UPDATE floorplans SET canvas_fabric_json = ? WHERE id = ?').run(
              JSON.stringify(fabricData),
              booth.floorplan_id
            );
          }
        } catch (e) {
          console.error("Error updating canvas JSON in status patch:", e);
        }
      }
    }

    res.json({
      success: true,
      message: `Status booth ${booth.code} berhasil diperbarui ke '${status}'!`,
      boothId: id,
      newStatus: status,
      warnings: statusWarnings
    });
  } catch (error) {
    console.error("Update booth status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
