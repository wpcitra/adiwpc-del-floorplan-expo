// Who may delete / restore an invoice (AGENTS.md §31). One rule for the pages (which buttons are rendered) and the
// server (DELETE /api/invoices/:id, POST /api/invoices/:id/restore, GET /api/invoices/trash).
// Roles are the ones stored in users.role: 'superadmin' (Super Admin) and 'finance' (Keuangan).

export const INVOICE_DELETE_ROLES = ['superadmin', 'finance'];
export const DELETE_REASON_MIN = 10;

/** Keuangan and Super Admin delete invoices (Keuangan: only invoices without any payment). */
export const canDeleteInvoice = (user) => INVOICE_DELETE_ROLES.includes(user?.role);

/** An invoice that already received a payment (DP / Lunas) is deleted by the Super Admin only. */
export const canDeletePaidInvoice = (user) => user?.role === 'superadmin';

/** Tempat Sampah Invoice (list and restore): Super Admin only. */
export const canRestoreInvoice = (user) => user?.role === 'superadmin';

/** The reason as stored, or null when it is shorter than DELETE_REASON_MIN characters. */
export function cleanDeleteReason(value) {
  const reason = String(value ?? '').replace(/\s+/g, ' ').trim();
  return reason.length >= DELETE_REASON_MIN ? reason.slice(0, 500) : null;
}

/** The typed invoice number matches (outer spaces and letter case ignored). */
export const sameInvoiceNumber = (typed, invoiceNumber) =>
  String(typed ?? '').trim().toUpperCase() === String(invoiceNumber ?? '').trim().toUpperCase() && String(invoiceNumber ?? '').trim() !== '';
