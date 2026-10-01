import db from '../db.js';
import { normalizeTaxOptions, cleanRate, DEFAULT_TAX_NOTE, TAX_METHODS } from '../../../shared/invoiceTax.js';

// PPN settings (Setting > Aturan Booking, PPN & Pajak), stored in the invoice configuration (invoice_settings):
//   taxRate            PPN rate in % (default 11)
//   publicBookingTax   online registrations by visitors are charged PPN (default true). Staff choose per invoice.
//   defaultTaxEnabled  new staff invoices start as "Dengan PPN" (default false)
//   defaultTaxMethod   'exclusive' (PPN ditambahkan ke harga) | 'inclusive' (harga sudah termasuk PPN)
//   defaultTaxDisplay  'show' | 'hide' (hide only with 'inclusive')
//   taxNote            note printed when the PPN breakdown is hidden
// A change only applies to NEW invoices: every invoice stores its own rate, method, display and note.
export function readTaxSettings() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
  const rate = Number(cfg.taxRate);
  const taxRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 11;
  const method = ['exclusive', 'inclusive'].includes(cfg.defaultTaxMethod) ? cfg.defaultTaxMethod : 'exclusive';
  return {
    taxRate,
    publicBookingTax: cfg.publicBookingTax !== false,
    defaultTaxEnabled: cfg.defaultTaxEnabled === true,
    defaultTaxMethod: method,
    defaultTaxDisplay: method === 'inclusive' && cfg.defaultTaxDisplay === 'hide' ? 'hide' : 'show',
    taxNote: String(cfg.taxNote || '').trim() || DEFAULT_TAX_NOTE
  };
}

// Rate sent by a staff form (0-100), falling back to the setting
export const cleanTaxRate = (value, fallback) => cleanRate(value, fallback);

/**
 * Tax options of a new invoice / contract. Staff may choose (taxMethod / taxDisplay / taxRate, or the older
 * applyTax); visitors never choose: publicBookingTax + the default method / display decide.
 * Returns { method, rate, display, note }.
 */
export function taxOptionsFrom(body = {}, { isStaff = false, publicBooking = false } = {}) {
  const s = readTaxSettings();
  const defaults = { rate: s.taxRate, method: s.defaultTaxMethod, display: s.defaultTaxDisplay };
  let opts;
  if (!isStaff) {
    opts = normalizeTaxOptions({ applyTax: publicBooking ? s.publicBookingTax : s.defaultTaxEnabled, rate: s.taxRate, display: s.defaultTaxDisplay }, defaults);
  } else if (TAX_METHODS.includes(body.taxMethod)) {
    opts = normalizeTaxOptions({ method: body.taxMethod, rate: body.taxRate ?? s.taxRate, display: body.taxDisplay }, defaults);
  } else if (body.applyTax !== undefined) {
    opts = normalizeTaxOptions({ applyTax: Boolean(body.applyTax), rate: body.taxRate ?? s.taxRate, display: body.taxDisplay ?? s.defaultTaxDisplay }, defaults);
  } else {
    opts = normalizeTaxOptions({ applyTax: publicBooking ? s.publicBookingTax : s.defaultTaxEnabled, rate: s.taxRate, display: s.defaultTaxDisplay }, defaults);
  }
  return { ...opts, note: s.taxNote };
}

// Online registration rules (Setting > Aturan Booking): the smallest DP a visitor may choose, in % of the contract
export function readBookingRules() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
  const min = Number(cfg.publicMinDpPercent);
  return { minDpPercent: Number.isFinite(min) && min >= 1 && min <= 99 ? Math.round(min * 100) / 100 : 20 };
}

// Largest private discount the Sales role may give on one booth (Setting > Aturan Booking, Super Admin only):
// `maxPercent` of the booth price (default 10) and, when > 0, at most `maxAmount` rupiah.
export function readSalesDiscountLimit() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
  const pct = Number(cfg.salesMaxDiscountPercent);
  const amount = Number(cfg.salesMaxDiscountAmount);
  return {
    maxPercent: Number.isFinite(pct) && pct >= 0 && pct <= 100 && cfg.salesMaxDiscountPercent !== '' && cfg.salesMaxDiscountPercent != null ? Math.round(pct * 100) / 100 : 10,
    maxAmount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
  };
}

// Exhibitor email: optional by default; "Wajib" when the Super Admin / Finance turns it on (Setting > Aturan Booking)
export function readEmailRequired() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
  return cfg.exhibitorEmailRequired === true;
}
