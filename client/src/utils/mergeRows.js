// Data Exhibitor / dashboard lists (AGENTS.md §18): the API keeps ONE row per booth (§5); rows of an auto-merge
// group are shown as one exhibitor row with the joined booth number "#A-01+A-03+A-04". Money fields are the
// per-booth shares of the contract, so summing them counts the contract exactly once.
export function collapseMergedRows(rows) {
  const out = [];
  const groups = new Map();
  rows.forEach(row => {
    const g = row.mergeGroup;
    if (!g?.id) { out.push(row); return; }
    const key = `${row.floorplanId || 'default'}_${g.id}`;
    if (!groups.has(key)) {
      const merged = {
        ...row,
        booth: g.joinedCode || g.codes.join('+'),
        code: g.joinedCode || g.codes.join('+'),
        mergedBooths: [],
        isMerged: true,
        mergeLabel: g.label,
        areaSqm: g.totalAreaM2 ?? row.areaSqm,
        price: 0, finalPrice: 0, originalPrice: 0, paidAmount: 0, remainingAmount: 0, dppAmount: 0, taxAmount: 0,
        invoiceNumbers: [],
        invoices: []
      };
      groups.set(key, merged);
      out.push(merged);
    }
    const m = groups.get(key);
    m.mergedBooths.push({ code: row.booth, widthM: row.widthM, heightM: row.heightM, status: row.status, payment_status: row.payment_status, price: row.price });
    ['price', 'finalPrice', 'originalPrice', 'paidAmount', 'remainingAmount', 'dppAmount', 'taxAmount'].forEach(k => { m[k] += Number(row[k]) || 0; });
    if (row.invoiceNumber && !m.invoiceNumbers.includes(row.invoiceNumber)) m.invoiceNumbers.push(row.invoiceNumber);
    (row.invoices || []).forEach(inv => { if (!m.invoices.some(x => x.id === inv.id)) m.invoices.push(inv); });
    m.invoiceNumber = m.invoiceNumbers.join(', ');
    m.contractMismatch = Boolean(m.contractMismatch || row.contractMismatch);
    // Different statuses inside the group: "Sebagian Lunas"
    const statuses = new Set(m.mergedBooths.map(b => b.payment_status || b.status));
    if (statuses.size > 1) { m.payment_status = 'PARTIAL'; m.mergedStatusLabel = 'Sebagian Lunas'; }
  });
  return out;
}
