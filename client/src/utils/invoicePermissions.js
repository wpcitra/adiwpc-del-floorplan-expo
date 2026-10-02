// Who may delete / restore an invoice: the same rule as the server (see shared/invoicePermissions.js, AGENTS.md §31)
export * from '../../../shared/invoicePermissions.js';

const KIND_LABELS = { dp: 'DP', settlement: 'Pelunasan', full: 'Penuh', facility: 'Fasilitas' };
const STATUS_LABELS = { PAID: 'Lunas', PARTIAL: 'Uang Muka / DP', PENDING: 'Menunggu Verifikasi', UNPAID: 'Menunggu Bayar', CANCELED: 'Batal' };

/** One shape for the delete confirmation, whatever the page holds: an invoice row (snake_case) or a booth invoice. */
export function invoiceBriefOf(inv, fallback = {}) {
  if (!inv) return null;
  const paymentStatus = String(inv.paymentStatus || inv.payment_status || 'UNPAID').toUpperCase();
  const totalAmount = Number(inv.totalAmount ?? inv.total_amount) || 0;
  const kind = inv.kind || inv.invoice_kind || 'full';
  const paidAmount = paymentStatus === 'PAID' ? totalAmount
    : paymentStatus === 'PARTIAL' ? Number(inv.paidAmount ?? inv.paid_amount) || 0
      : 0;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber || inv.invoice_number || '',
    kind,
    kindLabel: KIND_LABELS[kind] || 'Invoice',
    companyName: inv.companyName || inv.company_name || fallback.companyName || '',
    boothCode: inv.boothCode || inv.booth_code || fallback.boothCode || '',
    totalAmount,
    paidAmount,
    paymentStatus,
    statusLabel: STATUS_LABELS[paymentStatus] || paymentStatus
  };
}
