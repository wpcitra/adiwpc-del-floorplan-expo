import db from '../db.js';
import { exhibitorIdFor } from './exhibitorIdentity.js';

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

// Contract value from the booth record: price - private discount, plus PPN
export function boothContractValue(booth, taxRate = 0) {
  const base = Math.max(0, (Number(booth?.price) || 0) - (Number(booth?.discount_amount) || 0));
  return Math.round(base * (1 + (Number(taxRate) || 0) / 100));
}

// Booth codes covered by an invoice: "A-01+A-03+A-04" -> ['A-01', 'A-03', 'A-04'] (auto-merge contracts, AGENTS.md §18)
export const invoiceCodeTokens = (code) => String(code || '').split('+').map(t => t.trim()).filter(Boolean);

/**
 * Contract value for an invoice booth code: the booth itself (also a manually merged booth "A-04+A-05"),
 * or, for a multi-booth contract "A-01+A-03+A-04", the sum of its booths. null when no booth is found.
 */
export function contractValueForCode(floorplanId, code, taxRate = 0) {
  const exact = db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(?))`).get(floorplanId, code || '');
  if (exact) return boothContractValue(exact, taxRate);
  const tokens = invoiceCodeTokens(code);
  if (tokens.length < 2) return null;
  const rows = tokens
    .map(t => db.prepare(`SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(?))`).get(floorplanId, t))
    .filter(Boolean);
  return rows.length ? rows.reduce((acc, b) => acc + boothContractValue(b, taxRate), 0) : null;
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

// Rewrites the settlement (or single "full") invoice when the contract value or the DP changes.
// Paid invoices are never touched. `contractTotal` is passed explicitly when a DP/Pelunasan is issued
// (the value the admin confirmed); otherwise, while the contract is not fully paid, it follows the
// booth's current price and private discount. Returns the updated contract summary.
export function recalcContract(floorplanId, boothCode, boothId, options = {}) {
  const booth = findBooth(floorplanId, boothCode, boothId);
  const invoices = getContractInvoices(floorplanId, booth?.code || boothCode, booth?.id || boothId);
  const live = invoices.filter(isLive);
  if (!live.length) return summarizeContract(invoices, booth);

  const latest = live[live.length - 1];
  const snapshot = Number(latest.contract_total ?? latest.total_amount) || 0;
  const taxRate = Number(options.taxRate ?? latest.contract_tax_rate ?? 0) || 0;
  const hasUnpaid = live.some(inv => statusOf(inv) !== 'PAID');
  const contractTotal = options.contractTotal !== undefined
    ? Math.round(Number(options.contractTotal))
    : (hasUnpaid
      ? (invoiceCodeTokens(latest.booth_code).length > 1
        ? (contractValueForCode(floorplanId, latest.booth_code, taxRate) ?? snapshot)
        : (booth ? boothContractValue(booth, taxRate) : snapshot))
      : snapshot);

  const dp = live.find(inv => kindOf(inv) === 'dp') || null;
  const dpTotal = dp ? Number(dp.total_amount) || 0 : 0;

  const setContractTotal = db.prepare('UPDATE invoices SET contract_total = ?, contract_tax_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  live.forEach(inv => setContractTotal.run(contractTotal, taxRate, inv.id));

  // The open balance invoice: settlement if any, otherwise the single full invoice
  const balance = live.find(inv => kindOf(inv) === 'settlement') || live.find(inv => kindOf(inv) === 'full');
  if (balance && ['UNPAID', 'PENDING'].includes(statusOf(balance))) {
    const isSettlement = kindOf(balance) === 'settlement' || Boolean(dp);
    const amount = Math.max(0, contractTotal - dpTotal);
    const items = isSettlement
      ? [{ id: 'item-1', description: `Pelunasan Sewa Booth #${balance.booth_code}${dp ? ` (setelah DP ${dp.invoice_number})` : ''}`, qty: 1, unitPrice: amount, amount }]
      : null;
    db.prepare(`
      UPDATE invoices
      SET invoice_kind = ?, related_invoice_id = ?, total_amount = ?, remaining_amount = ?, paid_amount = 0,
          contract_total = ?, ${items ? 'items_json = ?,' : ''}
          ${isSettlement ? "subtotal = ?, discount_value = 0, discount_amount = 0, discount_reason = '', tax_rate = 0, tax_amount = 0," : ''}
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      isSettlement ? 'settlement' : 'full',
      dp ? dp.id : null,
      isSettlement ? amount : contractTotal,
      isSettlement ? amount : contractTotal,
      contractTotal,
      ...(items ? [JSON.stringify(items)] : []),
      ...(isSettlement ? [amount] : []),
      balance.id
    );
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
