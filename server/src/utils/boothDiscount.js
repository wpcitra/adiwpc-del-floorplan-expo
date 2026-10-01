import db from '../db.js';
import { recalcContract } from './contractBilling.js';
import { syncPaymentStatusFromInvoices } from './syncPaymentStatus.js';

// Private booth discount: ONE logic for the Property Inspector ("Simpan Diskon") and the Sales booth pop up ("Beri Diskon")
export function discountAmountFor(price, discountType, discountValue) {
  const numPrice = Math.max(0, Number(price) || 0);
  const value = Number(discountValue) || 0;
  return discountType === 'percentage'
    ? Math.round((numPrice * Math.min(100, Math.max(0, value))) / 100)
    : Math.min(numPrice, Math.max(0, Math.round(value)));
}

/**
 * Save the discount on the booth (this floorplan only), recompute the unpaid invoice of its contract (also a multi-booth
 * "A-01+A-04" invoice; DP and paid invoices are never rewritten) and mirror it into canvas_fabric_json.
 * `price` (optional) also re-prices the booth; without it the stored booth price is kept.
 */
export function saveBoothDiscount({ floorplanId, boothCode, boothId, price, numPrice, discountType = 'nominal', discountValue = 0, discountReason = '' }) {
  const numDiscVal = Number(discountValue) || 0;
  const reason = String(discountReason || '').trim();
  const calcDiscountAmount = discountAmountFor(numPrice, discountType, numDiscVal);

  db.transaction(() => {
    db.prepare(`
      UPDATE booths
      SET price = COALESCE(?, price), discount_type = ?, discount_value = ?, discount_amount = ?, discount_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE floorplan_id = ? AND deleted_at IS NULL AND (LOWER(TRIM(code)) = LOWER(TRIM(?)) OR (? != '' AND id = ?))
    `).run(price !== undefined ? numPrice : null, discountType, numDiscVal, calcDiscountAmount, reason, floorplanId, boothCode || '', boothId || '', boothId || '');

    recalcContract(floorplanId, boothCode, boothId);

    const fp = floorplanId ? db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(floorplanId) : null;
    if (fp?.canvas_fabric_json) {
      try {
        const fabric = JSON.parse(fp.canvas_fabric_json);
        if (fabric.objects) {
          fabric.objects.forEach(obj => {
            if (obj.isBooth && obj.boothData && (obj.boothData.code === boothCode || (boothId && obj.boothData.id === boothId))) {
              obj.boothData.discountType = discountType;
              obj.boothData.discountValue = numDiscVal;
              obj.boothData.discountAmount = calcDiscountAmount;
              obj.boothData.discountReason = reason;
            }
          });
          db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fabric), floorplanId);
        }
      } catch (e) {}
    }
  })();
  syncPaymentStatusFromInvoices();

  return {
    discountType, discountValue: numDiscVal, discountAmount: calcDiscountAmount, discountReason: reason,
    subtotal: numPrice, netTotal: Math.max(0, numPrice - calcDiscountAmount)
  };
}
