import db from '../db.js';
import { CONTRACT_KIND_SQL, getContractInvoices, summarizeContract } from './contractBilling.js';

// Booths that have at least one booth-contract invoice (precise matching, see AGENTS.md §12)
const BOOTHS_WITH_CONTRACT_INVOICES = `
  SELECT b.* FROM booths b
  WHERE b.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.floorplan_id = b.floorplan_id AND i.deleted_at IS NULL AND ${CONTRACT_KIND_SQL.replace(/invoice_kind/g, 'i.invoice_kind')}
      AND TRIM(COALESCE(i.booth_code, '')) != ''
      AND (
        LOWER(TRIM(i.booth_code)) = LOWER(TRIM(b.code))
        OR ('+' || LOWER(TRIM(b.code)) || '+') LIKE ('%+' || LOWER(TRIM(i.booth_code)) || '+%')
        OR ('+' || LOWER(TRIM(i.booth_code)) || '+') LIKE ('%+' || LOWER(TRIM(b.code)) || '+%')
        OR (TRIM(COALESCE(i.booth_id, '')) != '' AND i.booth_id = b.id)
      )
  )`;

const tokens = (code) => String(code || '').toLowerCase().split('+').map(t => t.trim()).filter(Boolean);
const sameBooth = (a, b) => {
  const ta = tokens(a); const tb = tokens(b);
  return ta.length > 0 && (ta.join('+') === tb.join('+') || ta.every(t => tb.includes(t)) || tb.every(t => ta.includes(t)));
};

// Repaint a booth group in canvas_fabric_json for a new status / tenant
function applyBoothVisual(obj, targetBoothStatus, targetOwner) {
  // Update visual appearance
  if (obj.objects && Array.isArray(obj.objects)) {
    const bgRect = obj.objects.find(o => o.type?.toLowerCase() === 'rect');
    if (bgRect) {
      if (targetBoothStatus === 'sold') {
        bgRect.fill = '#f1f5f9';
        bgRect.stroke = '#94a3b8';
      } else if (targetBoothStatus === 'reserved') {
        bgRect.fill = '#fffbeb';
        bgRect.stroke = '#f59e0b';
      } else {
        bgRect.fill = '#ffffff';
        bgRect.stroke = '#10b981';
      }
    }
    // Update owner text and status text accurately with proportional typography
    const textObjs = obj.objects.filter(o => o.type?.toLowerCase() === 'text' || o.type?.toLowerCase() === 'i-text' || o.type?.toLowerCase() === 'fabrictext');
    if (textObjs.length >= 4) {
      const ownerTextObj = textObjs[2]; // 3rd text element is always owner
      const statusTextObj = textObjs[3]; // 4th text element is always status badge

      const w = obj.width || 60;
      const h = obj.height || 60;
      const minDim = Math.min(w, h);
      const scaleFactor = Math.pow(Math.max(0.4, minDim / 60), 0.78);
      const padX = Math.max(3, Math.round(w * 0.06));
      const padY = Math.max(3, Math.round(h * 0.06));

      const baseOwnerSize = Math.max(7, Math.round(10.5 * scaleFactor));
      const maxOwnerW = Math.max(10, w - (padX * 2) - 4);
      const baseStatusSize = Math.max(6, Math.round(8.5 * scaleFactor));
      const maxStatusW = Math.max(10, w - (padX * 2) - 4);

      const statusStr = targetBoothStatus.toUpperCase();
      const statusFontSize = Math.min(baseStatusSize, Math.max(4.5, maxStatusW / (statusStr.length * 0.62)));

      if (statusTextObj) {
        statusTextObj.text = statusStr;
        statusTextObj.fontSize = statusFontSize;
        statusTextObj.fill = targetBoothStatus === 'sold' ? '#15803d' : (targetBoothStatus === 'reserved' ? '#d97706' : '#10b981');
      }

      if (ownerTextObj) {
        const rawOwner = targetOwner || (targetBoothStatus === 'available' ? '' : '(Booking)');
        let finalOwner = rawOwner;
        let ownerFontSize = baseOwnerSize;
        let isMultiLine = false;

        if (rawOwner) {
          const words = rawOwner.split(/\s+/).filter(Boolean);
          if (words.length >= 2) {
            let minSplit = 1;
            if ((words[0].toUpperCase() === 'PT' || words[0].toUpperCase() === 'CV') && words.length > 2) {
              minSplit = 2;
            }
            let bestSplit = minSplit;
            let bestDiff = Infinity;
            for (let i = minSplit; i < words.length; i++) {
              const l1 = words.slice(0, i).join(' ');
              const l2 = words.slice(i).join(' ');
              const diff = Math.abs(l1.length - l2.length);
              if (diff < bestDiff) {
                bestDiff = diff;
                bestSplit = i;
              }
            }
            const line1 = words.slice(0, bestSplit).join(' ');
            const line2 = words.slice(bestSplit).join(' ');
            const longest = Math.max(line1.length, line2.length);
            const singleEstW = rawOwner.length * baseOwnerSize * 0.62;
            const wrappedEstW = longest * baseOwnerSize * 0.62;
            if (singleEstW > maxOwnerW || (w >= 50 && h >= 45 && words.length > 2) || wrappedEstW < singleEstW * 0.75) {
              finalOwner = `${line1}\n${line2}`;
              isMultiLine = true;
              ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (longest * 0.62));
            } else {
              ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
            }
          } else {
            ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
          }

          const maxOwnerH = Math.max(6, h - (padY * 2) - 18 - statusFontSize);
          const totalHUnits = (isMultiLine ? 2 : 1) * 1.15;
          if (ownerFontSize * totalHUnits > maxOwnerH) {
            ownerFontSize = Math.min(ownerFontSize, maxOwnerH / totalHUnits);
          }
          ownerFontSize = Math.max(4, ownerFontSize);
        }

        ownerTextObj.text = finalOwner;
        ownerTextObj.fontSize = ownerFontSize;
        ownerTextObj.lineHeight = 1.05;
        ownerTextObj.textAlign = 'center';
        ownerTextObj.fill = targetBoothStatus === 'sold' ? '#0f172a' : (targetBoothStatus === 'reserved' ? '#b45309' : '#059669');
      }
    }
  }
}

/**
 * Write booth status / tenant changes into a floorplan's canvas_fabric_json (only when something changed).
 * changes: [{ code, id, boothStatus, ownerName, exhibitorId, extra }] - `extra` (optional) is merged into boothData
 * (tenant biodata of a booking that has no invoice yet).
 */
export function applyBoothChangesToCanvas(fpId, changes) {
  const fp = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(fpId);
  if (!fp?.canvas_fabric_json) return;
  try {
    const fabric = JSON.parse(fp.canvas_fabric_json);
    if (!Array.isArray(fabric.objects)) return;
    let changed = false;
    fabric.objects.forEach(obj => {
      if (!obj.boothData) return;
      const code = obj.boothData.code || obj.boothData.booth_number;
      const change = changes.find(c => (obj.boothData.id && (obj.boothData.id === c.id || c.id.endsWith(`_${obj.boothData.id}`))) || sameBooth(code, c.code));
      if (!change) return;
      const extra = change.extra || {};
      const extraSame = Object.keys(extra).every(k => (obj.boothData[k] ?? '') === (extra[k] ?? ''));
      if (extraSame && obj.boothData.status === change.boothStatus && (obj.boothData.ownerName || '') === change.ownerName && (obj.boothData.exhibitorId || '') === change.exhibitorId) return;
      Object.assign(obj.boothData, extra);
      obj.boothData.status = change.boothStatus;
      obj.boothData.ownerName = change.ownerName;
      obj.boothData.exhibitorId = change.exhibitorId;
      applyBoothVisual(obj, change.boothStatus, change.ownerName);
      changed = true;
    });
    if (changed) {
      db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fabric), fpId);
    }
  } catch (e) {
    console.error(`Error updating canvas fabric in sync for floorplan ${fpId}:`, e);
  }
}

// A manual booking by Sales has no invoice until "Buat Invoice" (orders.invoice_number = ''). Older, canceled invoices
// of the same booth must not turn that new booking back into Available.
const openBookingWithoutInvoice = (booth) => Boolean(db.prepare(`
  SELECT 1 FROM orders
  WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
    AND TRIM(COALESCE(invoice_number, '')) = '' AND LOWER(TRIM(booth_code)) = LOWER(TRIM(?))
  LIMIT 1
`).get(booth.floorplan_id, booth.code));

/**
 * Universal Payment & Booth Status Synchronizer
 * Booth status, tenant and order payment status follow the booth CONTRACT computed from all its
 * active invoices (DP + Pelunasan / Penuh), not from a single "latest" invoice. Add-on (facility)
 * invoices are not part of the contract. Only rows that actually change are written.
 */
export function syncPaymentStatusFromInvoices() {
  try {
    const booths = db.prepare(BOOTHS_WITH_CONTRACT_INVOICES).all();
    const canvasChanges = new Map(); // floorplanId -> [{ code, id, boothStatus, ownerName }]

    const syncTransaction = db.transaction(() => {
      const updateBooth = db.prepare('UPDATE booths SET status = ?, owner_name = ?, exhibitor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const updateOrders = db.prepare(`
        UPDATE orders SET payment_status = ?
        WHERE floorplan_id = ? AND deleted_at IS NULL AND payment_status != ?
          AND (LOWER(TRIM(booth_code)) = LOWER(TRIM(?)) OR ('+' || LOWER(TRIM(?)) || '+') LIKE ('%+' || LOWER(TRIM(booth_code)) || '+%'))
          AND TRIM(COALESCE(booth_code, '')) != ''
      `);

      for (const booth of booths) {
        const contract = summarizeContract(getContractInvoices(booth.floorplan_id, booth.code, booth.id), booth);
        if (!contract.boothStatus) continue;
        if (contract.status === 'CANCELED' && openBookingWithoutInvoice(booth)) continue;

        // Exhibitor ID follows the contract (auto-merge groups booths per exhibitor, AGENTS.md §18)
        const exhibitorId = contract.boothStatus === 'available' ? '' : (contract.exhibitorId || booth.exhibitor_id || '');
        if (booth.status !== contract.boothStatus || (booth.owner_name || '') !== contract.ownerName || (booth.exhibitor_id || '') !== exhibitorId) {
          updateBooth.run(contract.boothStatus, contract.ownerName, exhibitorId, booth.id);
        }
        updateOrders.run(contract.status, booth.floorplan_id, contract.status, booth.code, booth.code);

        if (!canvasChanges.has(booth.floorplan_id)) canvasChanges.set(booth.floorplan_id, []);
        canvasChanges.get(booth.floorplan_id).push({ code: booth.code, id: booth.id, boothStatus: contract.boothStatus, ownerName: contract.ownerName, exhibitorId });
      }

      // Keep canvas_fabric_json in sync, writing a floorplan only when one of its booths changed
      for (const [fpId, changes] of canvasChanges) applyBoothChangesToCanvas(fpId, changes);
    });

    syncTransaction();
    return { success: true };
  } catch (error) {
    console.error('syncPaymentStatusFromInvoices error:', error);
    return { success: false, error: error.message };
  }
}
