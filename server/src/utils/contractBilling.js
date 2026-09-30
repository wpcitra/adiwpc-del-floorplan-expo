import db from '../db.js';
import { exhibitorIdFor } from './exhibitorIdentity.js';
import { computeContractTax, contractTaxOf, dpTaxOf, invoiceTaxView, paidTaxOf, taxPortion, taxRemainder } from '../../../shared/invoiceTax.js';

// ---------------------------------------------------------------------------
// Booth contract billing (DP + Pelunasan)
//
// A contract = one booth in one floorplan. Its invoices are:
//   'dp'         Invoice DP / Uang Muka            (at most one active)
//   'settlement' Invoice Pelunasan = total - DP     (at most one active, linked to the DP)
//   'full'       Invoice Penuh: one invoice for 100% (legacy invoices and checkout drafts)
// 'facility' invoices (add-ons) share the booth code but are NOT part of the contract.
//
// Payment status is computed per contract from all its active invoices, never from "the latest
// invoice": paid >= contract total -> PAID (booth sold); paid > 0 -> PARTIAL (DP, booth reserved);
// unpaid invoices -> UNPAID/PENDING (reserved); everything canceled -> CANCELED (available).
// ---------------------------------------------------------------------------

export const CONTRACT_KINDS = ['full', 'dp', 'settlement'];
export const CONTRACT_KIND_SQL = "COALESCE(invoice_kind, 'full') IN ('full', 'dp', 'settlement')";
export const INVOICE_KIND_LABELS = { full: 'Penuh', dp: 'DP', settlement: 'Pelunasan', facility: 'Fasilitas' };

const EPSILON = 1; // rupiah rounding tolerance

// Precise booth <-> invoice matching (see AGENTS.md §12): exact code, merged-code tokens, or a non-empty booth id
const INVOICE_MATCHES_BOOTH = `
  floorplan_id = @floorplanId AND deleted_at IS NULL AND ${CONTRACT_KIND_SQL} AND (
    LOWER(TRIM(booth_code)) = LOWER(TRIM(@boothCode))
    OR ('+' || LOWER(TRIM(@boothCode)) || '+') LIKE ('%+' || LOWER(TRIM(booth_code)) || '+%')
    OR ('+' || LOWER(TRIM(booth_code)) || '+') LIKE ('%+' || LOWER(TRIM(@boothCode)) || '+%')
    OR (@boothId != '' AND booth_id = @boothId)
  ) AND TRIM(COALESCE(booth_code, '')) != ''`;

const BOOTH_MATCH = `
  floorplan_id = @floorplanId AND deleted_at IS NULL AND (
    LOWER(TRIM(code)) = LOWER(TRIM(@boothCode))
    OR ('+' || LOWER(TRIM(code)) || '+') LIKE ('%+' || LOWER(TRIM(@boothCode)) || '+%')
    OR (@boothId != '' AND id = @boothId)
  )`;

export const kindOf = (inv) => inv?.invoice_kind || 'full';
const statusOf = (inv) => String(inv?.payment_status || 'UNPAID').toUpperCase();
const isLive = (inv) => statusOf(inv) !== 'CANCELED';

// Money actually received for one invoice
export const invoicePaidAmount = (inv) => {
  const status = statusOf(inv);
  if (status === 'PAID') return Number(inv.total_amount) || 0;
  if (status === 'PARTIAL') return Number(inv.paid_amount) || 0;
  return 0;
};

export function findBooth(floorplanId, boothCode, boothId) {
  return db.prepare(`SELECT * FROM booths WHERE ${BOOTH_MATCH} ORDER BY CASE WHEN LOWER(TRIM(code)) = LOWER(TRIM(@boothCode)) THEN 0 ELSE 1 END LIMIT 1`)
    .get({ floorplanId, boothCode: boothCode || '', boothId: boothId || '' });
}

export function getContractInvoices(floorplanId, boothCode, boothId) {
  return db.prepare(`SELECT * FROM invoices WHERE ${INVOICE_MATCHES_BOOTH} ORDER BY created_at ASC, id ASC`)
    .all({ floorplanId, boothCode: boothCode || '', boothId: boothId || '' });
}

// Contract value from the booth record: price - private discount, plus PPN (added on top unless `method` is 'inclusive')
export function boothContractValue(booth, taxRate = 0, method = 'exclusive') {
  return computeContractTax({ subtotal: booth?.price, discount: booth?.discount_amount, rate: taxRate, method }).total;
}

// Booth codes covered by an invoice: "A-01+A-03+A-04" -> ['A-01', 'A-03', 'A-04'] (auto-merge contracts, AGENTS.md §18)
export const invoiceCodeTokens = (code) => String(code || '').split('+').map(t => t.trim()).filter(Boolean);

const boothByCode = (floorplanId, code) => db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(?))`).get(floorplanId, code || '');

/** Booth rows of a contract code: the booth itself (also a manually merged booth "A-04+A-05") or each booth of "A-01+A-03". */
export function boothsForCode(floorplanId, code) {
  const exact = boothByCode(floorplanId, code);
  if (exact) return [exact];
  return invoiceCodeTokens(code).map(t => boothByCode(floorplanId, t)).filter(Boolean);
}

/** Contract breakdown (see shared/invoiceTax.js) from the booth prices and private discounts. null when no booth is found. */
export function contractTaxFor(floorplanId, code, { rate = 0, method = 'none' } = {}) {
  const rows = boothsForCode(floorplanId, code);
  if (!rows.length) return null;
  const subtotal = rows.reduce((acc, b) => acc + (Number(b.price) || 0), 0);
  const discount = rows.reduce((acc, b) => acc + Math.min(Number(b.price) || 0, Number(b.discount_amount) || 0), 0);
  return { ...computeContractTax({ subtotal, discount, rate, method }), grossDiscount: discount };
}

/**
 * Contract value for an invoice booth code: the booth itself (also a manually merged booth "A-04+A-05"),
 * or, for a multi-booth contract "A-01+A-03+A-04", the sum of its booths. null when no booth is found.
 */
export function contractValueForCode(floorplanId, code, taxRate = 0, method = 'exclusive') {
  return contractTaxFor(floorplanId, code, { rate: taxRate, method })?.total ?? null;
}

// Invoice line per booth, as priced on the booth (before discount; the discount is its own line)
export function contractItems(rows, label = 'Sewa Booth') {
  return rows.map((b, i) => ({
    id: `item-${i + 1}`,
    boothCode: b.code,
    description: `${label} #${b.code}`,
    qty: 1,
    unitPrice: Number(b.price) || 0,
    amount: Number(b.price) || 0
  }));
}

// Snapshot columns every live invoice of a contract carries (UPDATE ... SET contract_* = ...)
const CONTRACT_SNAPSHOT_SQL = `contract_total = @total, contract_tax_rate = @rate, contract_subtotal = @subtotal, contract_discount = @discount,
  contract_dpp = @dpp, contract_tax_method = @method, contract_tax_display = @display`;
export const contractSnapshotParams = (c) => ({
  total: c.total, rate: c.method === 'none' ? 0 : c.rate, subtotal: c.subtotal, discount: c.discount, dpp: c.dpp,
  method: c.method, display: c.method === 'inclusive' && c.display === 'hide' ? 'hide' : 'show'
});

// DPP / PPN of every live invoice of a contract (each DP / Pelunasan knows its DP through related_invoice)
function contractInvoiceViews(live, contractDiscount) {
  const byId = new Map(live.map(inv => [inv.id, inv]));
  return live.map(inv => {
    let items = [];
    try { items = JSON.parse(inv.items_json || '[]'); } catch (e) {}
    return invoiceTaxView({ ...inv, items, related_invoice: byId.get(inv.related_invoice_id) || null, contract_discount_hint: contractDiscount });
  });
}

// Full contract summary for one booth (works from the invoice rows; booth row is optional)
export function summarizeContract(invoices, booth = null, { taxRate = 0 } = {}) {
  const live = invoices.filter(isLive);
  const latestLive = live[live.length - 1] || null;
  const dp = live.find(inv => kindOf(inv) === 'dp') || null;
  const settlement = live.find(inv => kindOf(inv) === 'settlement') || null;
  const full = live.find(inv => kindOf(inv) === 'full') || null;

  // All live invoices of a contract carry the same contract_total snapshot (kept in sync by recalcContract)
  const contractTotal = latestLive
    ? Number(latestLive.contract_total ?? latestLive.total_amount) || 0
    : boothContractValue(booth, taxRate);

  const billed = live.reduce((acc, inv) => acc + (Number(inv.total_amount) || 0), 0);
  const paid = live.reduce((acc, inv) => acc + invoicePaidAmount(inv), 0);

  // Contract PPN split (shared/invoiceTax.js): DPP, PPN, and the PPN inside the money received
  const tax = latestLive
    ? contractTaxOf(latestLive, booth?.discount_amount)
    : { ...computeContractTax({ subtotal: booth?.price, discount: booth?.discount_amount, rate: taxRate, method: taxRate > 0 ? 'exclusive' : 'none' }), display: 'show' };
  const views = contractInvoiceViews(live, booth?.discount_amount);
  const paidTax = live.reduce((acc, inv, i) => acc + paidTaxOf(views[i], invoicePaidAmount(inv)), 0);

  let status = null;
  if (live.length) {
    if (contractTotal > 0 ? paid >= contractTotal - EPSILON : live.every(inv => statusOf(inv) === 'PAID')) status = 'PAID';
    else if (paid > 0) status = 'PARTIAL';
    else status = live.some(inv => statusOf(inv) === 'PENDING') ? 'PENDING' : 'UNPAID';
  } else if (invoices.length) {
    status = 'CANCELED';
  }

  const boothStatus = status === 'PAID' ? 'sold' : status === 'CANCELED' ? 'available' : status ? 'reserved' : null;

  return {
    contractTotal,
    taxRate: Number(latestLive?.contract_tax_rate ?? taxRate) || 0,
    taxMethod: tax.method,
    taxDisplay: tax.display || 'show',
    taxNote: latestLive?.tax_note || '',
    subtotal: tax.subtotal,
    dpp: tax.dpp,
    ppn: tax.ppn,
    paidTax,
    discountAmount: Number(booth?.discount_amount ?? latestLive?.discount_amount) || 0,
    billed,
    paid,
    remaining: Math.max(0, contractTotal - paid),
    unbilled: Math.max(0, contractTotal - billed),
    status,
    boothStatus,
    ownerName: status && status !== 'CANCELED' ? (latestLive?.company_name || '') : '',
    exhibitorId: status && status !== 'CANCELED' && latestLive ? exhibitorIdFor(latestLive.client_email, latestLive.company_name) : '',
    dpInvoice: dp,
    settlementInvoice: settlement || full,
    latestInvoice: latestLive || invoices[invoices.length - 1] || null,
    invoiceCount: live.length
  };
}

export function getContract(floorplanId, boothCode, boothId, options = {}) {
  const booth = findBooth(floorplanId, boothCode, boothId);
  const invoices = getContractInvoices(floorplanId, booth?.code || boothCode, booth?.id || boothId);
  return { booth, invoices, ...summarizeContract(invoices, booth, options) };
}

// Label for the payment status of a contract
export const contractStatusLabel = (status) => ({
  PAID: 'Lunas', PARTIAL: 'Uang Muka / DP', UNPAID: 'Belum Lunas', PENDING: 'Menunggu Verifikasi', CANCELED: 'Batal'
}[status] || 'Belum Ditagih');

// Rewrites the settlement (or single "full") invoice when the contract value, its PPN or the DP changes.
// Paid invoices are never touched. `options.contract` (a breakdown from contractTaxFor / computeContractTax) is
// passed when a DP / Pelunasan is issued or the contract's PPN setting is changed; otherwise, while the contract
// is not fully paid, it follows the booth's current price and private discount with the contract's PPN method.
// Returns the updated contract summary.
export function recalcContract(floorplanId, boothCode, boothId, options = {}) {
  const booth = findBooth(floorplanId, boothCode, boothId);
  const invoices = getContractInvoices(floorplanId, booth?.code || boothCode, booth?.id || boothId);
  const live = invoices.filter(isLive);
  if (!live.length) return summarizeContract(invoices, booth);

  const latest = live[live.length - 1];
  const current = { ...contractTaxOf(latest, booth?.discount_amount), note: latest.tax_note || null };
  const hasUnpaid = live.some(inv => statusOf(inv) !== 'PAID');
  let contract = options.contract || null;
  if (!contract && hasUnpaid) {
    const fromBooths = contractTaxFor(floorplanId, invoiceCodeTokens(latest.booth_code).length > 1 ? latest.booth_code : (booth?.code || latest.booth_code), current);
    if (fromBooths) contract = { ...fromBooths, display: current.display, note: current.note };
  }
  if (!contract) contract = current;
  contract = { ...contract, display: contract.method === 'inclusive' && contract.display === 'hide' ? 'hide' : 'show' };

  const dp = live.find(inv => kindOf(inv) === 'dp') || null;
  const dpPart = dp ? dpTaxOf(dp, contract) : { dpp: 0, ppn: 0, total: 0 };

  const setSnapshot = db.prepare(`UPDATE invoices SET ${CONTRACT_SNAPSHOT_SQL}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
  live.forEach(inv => setSnapshot.run({ ...contractSnapshotParams(contract), id: inv.id }));

  // The open balance invoice: settlement if any, otherwise the single full invoice
  const balance = live.find(inv => kindOf(inv) === 'settlement') || live.find(inv => kindOf(inv) === 'full');
  if (balance && ['UNPAID', 'PENDING'].includes(statusOf(balance))) {
    const isSettlement = kindOf(balance) === 'settlement' || Boolean(dp);
    const part = dp ? taxRemainder(contract, dpPart) : { dpp: contract.dpp, ppn: contract.ppn, total: contract.total };
    const amount = Math.max(0, part.total);
    // Pelunasan after a DP: one line. Pelunasan without DP (= the whole contract): one line per booth, discount on its own
    const rows = !dp && isSettlement ? boothsForCode(floorplanId, balance.booth_code) : [];
    const items = isSettlement
      ? (rows.length
        ? contractItems(rows, 'Pelunasan Sewa Booth')
        : [{ id: 'item-1', description: `Pelunasan Sewa Booth #${balance.booth_code}${dp ? ` (setelah DP ${dp.invoice_number})` : ''}`, qty: 1, unitPrice: amount, amount }])
      : null;
    const rowsPrice = rows.reduce((acc, b) => acc + (Number(b.price) || 0), 0);
    const rowsDiscount = rows.reduce((acc, b) => acc + Math.min(Number(b.price) || 0, Number(b.discount_amount) || 0), 0);
    // A single invoice keeps its own lines; its discount follows the booths when the contract was recomputed from them
    const fullDiscount = !isSettlement && contract.grossDiscount !== undefined ? contract.grossDiscount : null;
    db.prepare(`
      UPDATE invoices
      SET invoice_kind = @kind, related_invoice_id = @relatedId, total_amount = @amount, remaining_amount = @amount, paid_amount = 0,
          ${items ? 'items_json = @items,' : ''}
          ${isSettlement ? "subtotal = @subtotal, discount_value = 0, discount_amount = @discount, discount_reason = '', discount_type = 'nominal'," : ''}
          ${fullDiscount !== null ? 'discount_amount = @discount,' : ''}
          tax_rate = @rate, tax_amount = @ppn, dpp_amount = @dpp, tax_method = @method, tax_display = @display,
          tax_note = COALESCE(tax_note, @note),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      kind: isSettlement ? 'settlement' : 'full',
      relatedId: dp ? dp.id : null,
      amount,
      ...(items ? { items: JSON.stringify(items) } : {}),
      ...(isSettlement ? { subtotal: rows.length ? rowsPrice : amount, discount: rows.length ? rowsDiscount : 0 } : {}),
      ...(fullDiscount !== null ? { discount: fullDiscount } : {}),
      rate: part.ppn > 0 ? contract.rate : 0,
      ppn: part.ppn,
      dpp: part.dpp,
      method: contract.method,
      display: contract.display,
      note: contract.note || null,
      id: balance.id
    });
  }

  return summarizeContract(getContractInvoices(floorplanId, booth?.code || boothCode, booth?.id || boothId), booth);
}

// PPN rate implied by a contract value vs. the booth's net price (legacy invoices stored PPN inside the total)
export function impliedTaxRate(contractTotal, booth) {
  const base = Math.max(0, (Number(booth?.price) || 0) - (Number(booth?.discount_amount) || 0));
  if (!base || !contractTotal || contractTotal <= base) return 0;
  return Math.round(((contractTotal / base) - 1) * 10000) / 100;
}

// Next invoice number with a type marker, following the existing INV/<TYPE>/<YEAR>/<n> format
export function nextInvoiceNumber(kind) {
  const marker = kind === 'dp' ? 'DP' : kind === 'settlement' ? 'PL' : 'EXP';
  return `INV/${marker}/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;
}

/**
 * Unmerge (AGENTS.md §18): take one booth out of a multi-booth contract invoice ("A-01+A-03+A-04").
 * - unpaid invoice: the booth's item and amount are removed, totals follow (existing change rules)
 * - DP / Lunas / partially paid invoice: amounts are NEVER changed automatically; only the booth leaves the
 *   invoice's booth list and a warning is returned so the admin can settle the difference manually.
 * Returns { changed, warning }.
 */
export function removeBoothFromInvoice(inv, boothCode, reason = '') {
  const tokens = invoiceCodeTokens(inv.booth_code);
  const code = String(boothCode || '').trim().toLowerCase();
  const rest = tokens.filter(t => t.toLowerCase() !== code);
  if (tokens.length < 2 || rest.length === tokens.length) return { changed: false, warning: null };
  const newCode = rest.join('+');
  const note = ` [Booth ${boothCode} dikeluarkan dari kontrak gabungan${reason ? `: ${reason}` : ''}]`;
  const status = statusOf(inv);

  if (['UNPAID', 'PENDING'].includes(status) && kindOf(inv) === 'full') {
    let items = [];
    try { items = JSON.parse(inv.items_json || '[]'); } catch (e) { items = []; }
    const mine = items.filter(it => String(it.boothCode || '').toLowerCase() === code
      || (!it.boothCode && new RegExp(`#${String(boothCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|\\s|\\)|$)`, 'i').test(it.description || '')));
    const removedAmount = mine.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const keep = items.filter(it => !mine.includes(it));
    const ratio = Number(inv.subtotal) > 0 ? Math.max(0, (Number(inv.subtotal) - removedAmount) / Number(inv.subtotal)) : (rest.length / tokens.length);
    const subtotal = Math.max(0, Number(inv.subtotal || 0) - removedAmount);
    const discount = Math.round((Number(inv.discount_amount) || 0) * ratio);
    const total = Math.round((Number(inv.total_amount) || 0) * ratio);
    db.prepare(`
      UPDATE invoices SET booth_code = ?, booth_id = NULL, items_json = ?, subtotal = ?, discount_amount = ?, total_amount = ?,
        remaining_amount = ?, contract_total = ?, notes = COALESCE(notes, '') || ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newCode, JSON.stringify(keep), subtotal, discount, total, total, total, note, inv.id);
    return { changed: true, warning: null };
  }

  db.prepare(`UPDATE invoices SET booth_code = ?, booth_id = NULL, notes = COALESCE(notes, '') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(newCode, note, inv.id);
  return {
    changed: true,
    warning: `Invoice ${inv.invoice_number} (${status === 'PAID' ? 'Lunas' : kindOf(inv) === 'dp' ? 'DP' : status}) mencakup booth ${boothCode} yang dilepas. Nominal invoice tidak diubah otomatis — sesuaikan manual (refund / nota kredit) bila perlu.`
  };
}
