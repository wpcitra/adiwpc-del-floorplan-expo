import db from '../db.js';
import { getContract, invoiceCodeTokens, removeBoothFromInvoice } from './contractBilling.js';

// Booth status set by staff (Dashboard, Property Inspector of the Studio). The booking / invoice contract is the
// authority for a booked booth's status (AGENTS.md §10, §14), so the change is written there too; otherwise the next
// sync or Studio save brings the old status back. Returns warnings of an unmerged multi-booth contract.
export function applyBoothStatusToContract(booth, status, ownerName) {
  const warnings = [];
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
        if (warning) warnings.push(warning);
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

  if (ownerName !== undefined) {
    live.forEach(inv => db.prepare('UPDATE invoices SET company_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ownerName, inv.id));
  }

  // Orders: Sold = paid, Reserved = not paid (a paid booking without invoice is reopened), Available = canceled.
  // A canceled order (an earlier tenant) is never brought back.
  const orderPaymentStatus = status === 'sold' ? "'PAID'"
    : status === 'reserved' ? "CASE WHEN UPPER(COALESCE(payment_status, '')) = 'PAID' THEN 'PENDING' ELSE payment_status END"
    : status === 'available' ? "'CANCELED'" : null;
  db.prepare(`
    UPDATE orders
    SET ${orderPaymentStatus ? `payment_status = ${orderPaymentStatus},` : ''} company_name = COALESCE(?, company_name)
    WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
      AND ((? != '' AND booth_id = ?) OR LOWER(TRIM(booth_code)) = LOWER(TRIM(?)))
  `).run(ownerName !== undefined ? ownerName : null, booth.floorplan_id, booth.id, booth.id, booth.code);

  return warnings;
}
