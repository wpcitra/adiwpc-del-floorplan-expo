import db from '../db.js';

// PPN settings (Setting > Aturan Booking, PPN & Pajak), stored in the invoice configuration (invoice_settings):
//   taxRate           PPN rate in % (default 11)
//   publicBookingTax  online registrations by visitors are charged PPN (default true). Staff choose per invoice.
export function readTaxSettings() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
  const rate = Number(cfg.taxRate);
  return {
    taxRate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 11,
    publicBookingTax: cfg.publicBookingTax !== false
  };
}

// Rate sent by a staff form (0-100), falling back to the setting
export const cleanTaxRate = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
};
