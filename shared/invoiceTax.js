// PPN (Pajak Pertambahan Nilai) for booth contracts and invoice documents. Pure JS, shared by the server
// (amounts stored per invoice) and the client (form preview, invoice A4, WhatsApp, CSV), so every place
// shows the same numbers.
//
// Methods:
//   'none'       Tanpa PPN
//   'exclusive'  PPN ditambahkan ke harga: DPP = harga - diskon, PPN = DPP x tarif, total = DPP + PPN
//   'inclusive'  Harga sudah termasuk PPN: total = harga - diskon, DPP = total x 100 / (100 + tarif), PPN = total - DPP
// Display: 'show' (Subtotal / DPP / PPN / Total on the document) or 'hide' (total only + a short note).
// 'hide' is only allowed with 'inclusive': PPN added on top of the price must always be shown.

export const TAX_METHODS = ['none', 'exclusive', 'inclusive'];
export const TAX_DISPLAYS = ['show', 'hide'];
export const DEFAULT_TAX_NOTE = 'Harga sudah termasuk PPN';
export const TAX_METHOD_LABELS = {
  none: 'Tanpa PPN',
  exclusive: 'PPN ditambahkan ke harga',
  inclusive: 'Harga sudah termasuk PPN'
};

const num = (v) => Number(v) || 0;

export const cleanRate = (value, fallback = 11) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
};

/**
 * Normalizes tax options from a form / request / setting.
 * Accepts { method | taxMethod, rate | taxRate, display | taxDisplay } or the older { applyTax, taxRate }.
 */
export function normalizeTaxOptions(opts = {}, defaults = {}) {
  const fallbackRate = cleanRate(defaults.rate ?? defaults.taxRate, 11);
  const rate = cleanRate(opts.rate ?? opts.taxRate, fallbackRate);
  let method = opts.method ?? opts.taxMethod;
  if (!TAX_METHODS.includes(method)) {
    if (opts.applyTax !== undefined) method = opts.applyTax ? (TAX_METHODS.includes(defaults.method) && defaults.method !== 'none' ? defaults.method : 'exclusive') : 'none';
    else method = TAX_METHODS.includes(defaults.method) ? defaults.method : 'none';
  }
  if (method !== 'none' && !(rate > 0)) method = 'none';
  let display = opts.display ?? opts.taxDisplay ?? defaults.display ?? 'show';
  if (method !== 'inclusive' || display !== 'hide') display = 'show';
  return { method, rate: method === 'none' ? 0 : rate, display };
}

/**
 * Contract value from the booth price(s) and the private discount (discount is applied BEFORE PPN).
 * `subtotal` / `discount` are the prices as written on the booths. Returns pre-tax figures:
 *   { method, rate, subtotal, discount, dpp, ppn, total }  with  subtotal - discount = dpp  and  dpp + ppn = total
 */
export function computeContractTax({ subtotal = 0, discount = 0, rate = 0, method = 'none' } = {}) {
  const gross = Math.max(0, Math.round(num(subtotal)));
  const disc = Math.min(gross, Math.max(0, Math.round(num(discount))));
  const base = gross - disc;
  const r = num(rate);
  if (method === 'exclusive' && r > 0) {
    const ppn = Math.round((base * r) / 100);
    return { method, rate: r, subtotal: gross, discount: disc, dpp: base, ppn, total: base + ppn };
  }
  if (method === 'inclusive' && r > 0) {
    const dpp = Math.round((base * 100) / (100 + r));
    const subtotalPre = Math.round((gross * 100) / (100 + r));
    return { method, rate: r, subtotal: subtotalPre, discount: subtotalPre - dpp, dpp, ppn: base - dpp, total: base };
  }
  return { method: 'none', rate: 0, subtotal: gross, discount: disc, dpp: base, ppn: 0, total: base };
}

/** Part of a contract billed by one invoice (e.g. the DP): PPN proportional to the amount. */
export function taxPortion(contract, amount) {
  const total = Math.round(num(amount));
  if (!(num(contract?.total) > 0) || !num(contract?.ppn)) return { dpp: total, ppn: 0, total };
  const ppn = Math.round((num(contract.ppn) * total) / num(contract.total));
  return { dpp: total - ppn, ppn, total };
}

/** What is left of the contract after `part` (e.g. Pelunasan after DP): DP + Pelunasan add up exactly. */
export function taxRemainder(contract, part) {
  return {
    dpp: num(contract?.dpp) - num(part?.dpp),
    ppn: num(contract?.ppn) - num(part?.ppn),
    total: num(contract?.total) - num(part?.total)
  };
}

/**
 * Splits an integer `target` over `values` proportionally (largest remainder), so the parts add up exactly.
 * Negative lines (e.g. a manual discount line) are kept as they are; the positive lines absorb the rest.
 */
export function allocate(values = [], target = 0) {
  const t = Math.round(num(target));
  if (!values.length) return [];
  const clean = values.map(v => num(v));
  const sum = clean.reduce((a, v) => a + v, 0);
  if (sum === t && clean.every(Number.isInteger)) return clean;
  const negatives = clean.reduce((a, v) => a + (v < 0 ? v : 0), 0);
  const posIdx = clean.map((v, i) => (v >= 0 ? i : -1)).filter(i => i >= 0);
  const posSum = posIdx.reduce((a, i) => a + clean[i], 0);
  const posTarget = t - negatives;
  const out = clean.map(v => (v < 0 ? Math.round(v) : 0));
  if (!posIdx.length) return out;
  const raw = posIdx.map(i => (posSum > 0 ? (clean[i] * posTarget) / posSum : posTarget / posIdx.length));
  const floors = raw.map(Math.floor);
  let rest = posTarget - floors.reduce((a, v) => a + v, 0);
  const order = raw.map((v, k) => [v - Math.floor(v), k]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) floors[order[k][1]] += 1;
  posIdx.forEach((i, k) => { out[i] = floors[k]; });
  return out;
}

const impliedRate = (total, base) => (base > 0 && total > base + 1 ? Math.round(((total / base) - 1) * 10000) / 100 : 0);

/**
 * Contract breakdown carried by one contract invoice (DP / Pelunasan / Penuh). Stored snapshot when present;
 * older invoices only stored contract_total + contract_tax_rate (PPN was always added on top), so the split is
 * computed from those. `discountHint` = the booth's private discount for older invoices.
 */
export function contractTaxOf(inv = {}, discountHint = 0) {
  const total = num(inv.contract_total ?? inv.total_amount);
  if (inv.contract_dpp !== null && inv.contract_dpp !== undefined && inv.contract_tax_method) {
    const dpp = num(inv.contract_dpp);
    const discount = num(inv.contract_discount);
    const method = inv.contract_tax_method;
    return {
      method, rate: num(inv.contract_tax_rate), display: method === 'inclusive' && inv.contract_tax_display === 'hide' ? 'hide' : 'show',
      subtotal: num(inv.contract_subtotal) || dpp + discount, discount, dpp, ppn: total - dpp, total, derived: false
    };
  }
  const rate = num(inv.contract_tax_rate);
  const dpp = rate > 0 ? Math.round((total * 100) / (100 + rate)) : total;
  const discount = Math.max(0, Math.round(num(discountHint)));
  return {
    method: rate > 0 ? 'exclusive' : 'none', rate, display: 'show',
    subtotal: dpp + discount, discount, dpp, ppn: total - dpp, total, derived: rate > 0
  };
}

/** DPP / PPN of a DP invoice (stored, or proportional to its contract for older invoices). */
export function dpTaxOf(dp = {}, contract) {
  if (dp.tax_method && dp.dpp_amount !== null && dp.dpp_amount !== undefined) {
    return { dpp: num(dp.dpp_amount), ppn: num(dp.tax_amount), total: num(dp.total_amount) };
  }
  return taxPortion(contract, dp.total_amount);
}

/**
 * Everything an invoice document needs to show the booth price and the PPN separately.
 * `inv` uses the snake_case invoice fields (+ `items`, `related_invoice`, `contract_discount_hint`).
 * The TOTAL never changes: only how it is split. Result:
 *   { method, rate, display, note, showBreakdown, derived, asFull,
 *     lines, subtotal, discount, discountReason, dpp, ppn, total,   <- this document
 *     contract, dpPart }                                             <- DP / Pelunasan contract box
 */
export function invoiceTaxView(inv = {}) {
  const kind = inv.invoice_kind || 'full';
  const total = Math.round(num(inv.total_amount));
  const items = Array.isArray(inv.items) ? inv.items : [];
  const itemAmounts = items.map(it => num(it.amount ?? it.total ?? (num(it.qty || 1) * num(it.unitPrice ?? it.price))));
  const itemSum = itemAmounts.reduce((a, v) => a + v, 0);
  const isSplit = kind === 'dp' || kind === 'settlement';
  const related = inv.related_invoice || null;
  // A Pelunasan without an active DP is the whole contract paid at once
  const asFull = kind === 'settlement' && !inv.related_invoice_id;

  let contract = null;
  let own;
  let derived = false;
  let grossDiscount = 0;
  let discountReason = inv.discount_reason || '';

  if (isSplit) {
    contract = contractTaxOf(inv, inv.contract_discount_hint);
    derived = contract.derived;
    if (inv.tax_method && inv.dpp_amount !== null && inv.dpp_amount !== undefined) {
      own = { dpp: num(inv.dpp_amount), ppn: num(inv.tax_amount), total };
    } else if (kind === 'dp') {
      own = taxPortion(contract, total);
    } else if (related && Math.abs(contract.total - num(related.total_amount) - total) <= 1) {
      own = taxRemainder(contract, dpTaxOf(related, contract));
    } else if (asFull && Math.abs(contract.total - total) <= 1) {
      own = { dpp: contract.dpp, ppn: contract.ppn, total };
    } else {
      own = taxPortion(contract, total);
    }
    if (asFull) {
      own.discount = contract.discount;
      grossDiscount = contract.method === 'inclusive' ? Math.round(num(inv.contract_discount_gross ?? inv.contract_discount_hint)) : contract.discount;
    } else {
      own.discount = 0;
    }
  } else {
    // Invoice Penuh / add-on: its own subtotal, discount and PPN
    const gross = itemSum || num(inv.subtotal) || total;
    grossDiscount = Math.round(num(inv.discount_amount));
    const base = Math.max(0, num(inv.subtotal) || gross) - grossDiscount;
    let method = inv.tax_method;
    let ppn;
    let rate = num(inv.tax_rate);
    if (method) {
      ppn = Math.round(num(inv.tax_amount));
    } else if (num(inv.tax_amount) > 0) {
      method = 'exclusive';
      ppn = Math.round(num(inv.tax_amount));
      rate = rate || impliedRate(total, total - ppn);
    } else if (impliedRate(total, base) > 0 && num(inv.subtotal) > 0) {
      // Older invoice: PPN inside the total but not stored (total > subtotal - discount)
      method = 'exclusive';
      rate = impliedRate(total, base);
      ppn = total - base;
      derived = true;
    } else if (num(inv.contract_tax_rate) > 0 && kind !== 'facility') {
      method = 'exclusive';
      rate = num(inv.contract_tax_rate);
      ppn = total - Math.round((total * 100) / (100 + rate));
      derived = true;
    } else {
      method = 'none';
      ppn = 0;
      rate = 0;
    }
    const dpp = inv.dpp_amount !== null && inv.dpp_amount !== undefined && inv.tax_method ? num(inv.dpp_amount) : total - ppn;
    const discountPre = method === 'inclusive'
      ? Math.max(0, Math.round(((gross * 100) / (100 + rate))) - dpp)
      : grossDiscount;
    own = { dpp, ppn, total, discount: grossDiscount > 0 ? discountPre : 0, method, rate };
  }

  const method = isSplit ? (own.ppn > 0 || contract.ppn > 0 ? (inv.tax_method || contract.method) : 'none') : own.method;
  const rate = method === 'none' ? 0 : (isSplit ? (num(inv.tax_rate) || contract.rate) : own.rate);
  const displaySetting = inv.tax_display || (isSplit ? contract.display : 'show');
  const display = method === 'inclusive' && displaySetting === 'hide' ? 'hide' : 'show';
  const showBreakdown = method !== 'none' && display === 'show';

  // Lines are shown before PPN (DPP basis) when the breakdown is shown; otherwise as the prices the client pays
  const shownDiscount = showBreakdown || method === 'none' ? own.discount : grossDiscount;
  const subtotal = showBreakdown ? own.dpp + own.discount : own.total + shownDiscount;
  const amounts = allocate(itemAmounts.length ? itemAmounts : [subtotal], subtotal);
  const lines = (items.length ? items : [{}]).map((it, i) => {
    const qty = Math.max(1, num(it.qty) || 1);
    return { ...it, qty, amount: amounts[i], unitPrice: qty > 1 ? Math.round(amounts[i] / qty) : amounts[i] };
  });

  return {
    method,
    rate,
    display,
    note: inv.tax_note || DEFAULT_TAX_NOTE,
    showBreakdown,
    derived,
    asFull,
    lines,
    subtotal,
    discount: shownDiscount,
    discountReason,
    dpp: own.dpp,
    ppn: own.ppn,
    total,
    contract,
    dpPart: kind === 'dp' ? { dpp: own.dpp, ppn: own.ppn, total } : (related && contract ? dpTaxOf(related, contract) : null)
  };
}

/** PPN inside the money received for one invoice (proportional for a partly paid invoice). */
export function paidTaxOf(view, paid) {
  if (!view || !(view.total > 0) || !view.ppn) return 0;
  return Math.round((view.ppn * Math.min(num(paid), view.total)) / view.total);
}
