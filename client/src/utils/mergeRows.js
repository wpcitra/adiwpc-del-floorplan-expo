import { sortCodes } from '../../../shared/boothGroups.js';

// Data Exhibitor / Dashboard tenant lists (AGENTS.md §18): the API keeps ONE row per booth (§5). Rows that are one
// transaction are shown as ONE tenant row with the joined booth number "#A-04+A-07+A-08":
//   - booths of one auto-merge group (adjacent, same exhibitor), and
//   - booths of one multi-booth contract (one invoice "A-04+A-07+A-08"), also when they do not touch.
// Money fields are the per-booth shares of the contract, so summing them counts the contract exactly once.
const MONEY_KEYS = ['price', 'finalPrice', 'originalPrice', 'discountAmount', 'paidAmount', 'remainingAmount', 'dppAmount', 'taxAmount'];

function combine(group) {
  const first = group[0];
  const codes = sortCodes(group.map(r => r.booth || r.code).filter(Boolean));
  const merged = {
    ...first,
    booth: codes.join('+'),
    code: codes.join('+'),
    mergedBooths: [],
    isMerged: true,
    mergeLabel: first.mergeGroup?.label || `${codes.length} booth`,
    areaSqm: 0,
    invoiceNumbers: [],
    invoices: []
  };
  MONEY_KEYS.forEach(k => { merged[k] = 0; });
  group.forEach(row => {
    merged.mergedBooths.push({ id: row.id, code: row.booth, widthM: row.widthM, heightM: row.heightM, status: row.status, payment_status: row.payment_status, price: row.price });
    MONEY_KEYS.forEach(k => { merged[k] += Number(row[k]) || 0; });
    merged.areaSqm += Number(row.areaSqm) || (Number(row.widthM) || 0) * (Number(row.heightM) || 0);
    if (row.invoiceNumber && !merged.invoiceNumbers.includes(row.invoiceNumber)) merged.invoiceNumbers.push(row.invoiceNumber);
    (row.invoices || []).forEach(inv => { if (!merged.invoices.some(x => x.id === inv.id)) merged.invoices.push(inv); });
    merged.contractMismatch = Boolean(merged.contractMismatch || row.contractMismatch);
  });
  merged.areaSqm = Math.round(merged.areaSqm * 100) / 100;
  merged.invoiceNumber = merged.invoiceNumbers.join(', ');
  // Different statuses inside the group (e.g. two contracts, one paid): "Sebagian Lunas"
  const statuses = new Set(merged.mergedBooths.map(b => b.payment_status || b.status));
  if (statuses.size > 1) { merged.payment_status = 'PARTIAL'; merged.mergedStatusLabel = 'Sebagian Lunas'; }
  return merged;
}

export function collapseMergedRows(rows) {
  // Union-find: rows sharing a merge group or a multi-booth contract end up in one group
  const parent = rows.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map();
  rows.forEach((row, i) => {
    const fp = row.floorplanId || 'default';
    const keys = [];
    if (row.mergeGroup?.id) keys.push(`merge:${fp}:${row.mergeGroup.id}`);
    const contractCode = String(row.contractShare?.code || '');
    if (contractCode.includes('+')) keys.push(`contract:${fp}:${contractCode.trim().toLowerCase()}`);
    keys.forEach(key => {
      if (firstByKey.has(key)) parent[find(i)] = find(firstByKey.get(key));
      else firstByKey.set(key, i);
    });
  });

  const members = new Map();
  rows.forEach((row, i) => {
    const root = find(i);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(row);
  });
  const out = [];
  const done = new Set();
  rows.forEach((row, i) => {
    const root = find(i);
    if (done.has(root)) return;
    done.add(root);
    const group = members.get(root);
    out.push(group.length > 1 ? combine(group) : row);
  });
  return out;
}
