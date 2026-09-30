// Invoice summaries per BOOTH CONTRACT (DP + Pelunasan / Penuh).
// The server attaches `inv.contract` (one shared summary per booth) to every contract invoice. A contract
// is counted once: its total, discount, paid and remaining never double up across its DP and Pelunasan.
// Add-on (facility) and other non-contract invoices are counted on their own.

export const INVOICE_KIND_BADGE = {
  dp: { label: 'DP', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  settlement: { label: 'Pelunasan', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  full: { label: 'Penuh', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  facility: { label: 'Fasilitas', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' }
};

export const invoiceKind = (inv) => inv?.invoice_kind || 'full';

const ownStatus = (inv) => String(inv?.payment_status || 'UNPAID').toUpperCase();

const ownPaid = (inv) => {
  const st = ownStatus(inv);
  if (st === 'PAID') return Number(inv.total_amount) || 0;
  if (st === 'CANCELED') return 0;
  return Number(inv.paid_amount) || 0;
};

// Status used by the tabs / badges: the contract's status for booth contract invoices, else the invoice's own
export function billingStatus(inv) {
  if (inv?.contract?.status) return inv.contract.status;
  const st = ownStatus(inv);
  if (st === 'PARTIAL' || st === 'DP' || (st !== 'PAID' && st !== 'CANCELED' && Number(inv.paid_amount) > 0)) return 'PARTIAL';
  if (st === 'PENDING') return 'UNPAID';
  return st;
}

export function matchesStatusTab(inv, tab) {
  if (tab === 'all') return true;
  const st = billingStatus(inv);
  if (tab === 'UNPAID') return st === 'UNPAID' || st === 'PENDING';
  return st === tab;
}

export function summarizeInvoices(list = []) {
  const contracts = new Map();
  const others = [];
  list.forEach(inv => {
    if (inv.contract?.key) contracts.set(inv.contract.key, inv.contract);
    else others.push(inv);
  });

  const activeContracts = [...contracts.values()].filter(c => c.status && c.status !== 'CANCELED');
  const activeOthers = others.filter(inv => ownStatus(inv) !== 'CANCELED');
  const sum = (arr, fn) => arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);

  const statuses = [
    ...activeContracts.map(c => c.status),
    ...activeOthers.map(billingStatus)
  ];

  return {
    count: list.length,
    contractCount: activeContracts.length,
    paidCount: statuses.filter(st => st === 'PAID').length,
    dpCount: statuses.filter(st => st === 'PARTIAL').length,
    unpaidCount: statuses.filter(st => st === 'UNPAID' || st === 'PENDING').length,
    // Total Tagihan Kontrak: the contract value, not the sum of its DP + Pelunasan invoices
    totalAmount: sum(activeContracts, c => c.total) + sum(activeOthers, inv => inv.total_amount),
    totalPaid: sum(activeContracts, c => c.paid) + sum(activeOthers, ownPaid),
    totalRemaining: sum(activeContracts, c => c.remaining) + sum(activeOthers, inv => Math.max(0, (Number(inv.total_amount) || 0) - ownPaid(inv))),
    // Private discount belongs to the contract: counted once, never per DP / Pelunasan invoice
    totalDiscount: sum(activeContracts, c => c.discountAmount) + sum(activeOthers, inv => inv.discount_amount),
    // PPN is not revenue: contract value and money received split into DPP (before PPN) and PPN
    totalTax: sum(activeContracts, c => c.ppn) + sum(activeOthers, inv => inv.tax_view?.ppn),
    paidTax: sum(activeContracts, c => c.paidTax) + sum(activeOthers, inv => {
      const v = inv.tax_view;
      return v?.ppn && v.total > 0 ? Math.round((v.ppn * Math.min(ownPaid(inv), v.total)) / v.total) : 0;
    })
  };
}

// Keeps the invoices of one booth contract next to each other (DP above Pelunasan), newest contract first
export function groupByContract(list = []) {
  const order = { dp: 0, settlement: 1, full: 2, facility: 3 };
  const groupKey = (inv) => inv.contract?.key || `single_${inv.id}`;
  const latest = new Map();
  list.forEach(inv => {
    const key = groupKey(inv);
    const t = String(inv.created_at || '');
    if (!latest.has(key) || t > latest.get(key)) latest.set(key, t);
  });
  return [...list].sort((a, b) => {
    const ka = groupKey(a); const kb = groupKey(b);
    if (ka !== kb) return latest.get(kb).localeCompare(latest.get(ka)) || ka.localeCompare(kb);
    return (order[invoiceKind(a)] ?? 9) - (order[invoiceKind(b)] ?? 9);
  });
}
