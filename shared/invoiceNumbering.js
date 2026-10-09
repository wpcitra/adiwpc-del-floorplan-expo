// Nomor invoice (AGENTS.md §44): one format for every invoice the application issues (registration, Buat Invoice,
// DP / Pelunasan, facility). Set in Setting > Aturan Booking; a number can also be changed by hand per invoice.
//   {JENIS}  EXP (penuh) · DP · PL (pelunasan) · FAC (fasilitas)
//   {TAHUN}  2026 · {BULAN} 10   (the date in WIB)
//   {NOMOR}  running number, at least 4 digits (0007); required, so two invoices never get the same number
export const DEFAULT_INVOICE_NUMBER_FORMAT = 'INV/{JENIS}/{TAHUN}/{NOMOR}';
export const INVOICE_NUMBER_TOKENS = ['{JENIS}', '{TAHUN}', '{BULAN}', '{NOMOR}'];
export const KIND_MARKERS = { full: 'EXP', dp: 'DP', settlement: 'PL', facility: 'FAC' };
const NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]{1,58}[A-Za-z0-9]$/;

/** Year and month of `now` in WIB (the organiser's calendar), whatever the server clock's zone. */
export function wibParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return { year: p.year, month: p.month, day: p.day, date: `${p.year}-${p.month}-${p.day}` };
}

/** null when the format is usable, otherwise the reason (Indonesian, shown in Setting). */
export function invoiceFormatProblem(format) {
  const f = String(format ?? '').trim();
  if (!f.includes('{NOMOR}')) return 'Format nomor invoice wajib memuat {NOMOR} (nomor urut)';
  const sample = formatInvoiceNumber(f, { kind: 'settlement', seq: 1234 });
  if (!NUMBER_RE.test(sample)) return 'Format hanya boleh berisi huruf, angka, dan tanda / . _ - (maksimal 60 karakter, tanpa spasi)';
  return null;
}

export function formatInvoiceNumber(format, { kind = 'full', seq = 1, now = new Date() } = {}) {
  const { year, month } = wibParts(now);
  return String(format || DEFAULT_INVOICE_NUMBER_FORMAT).trim()
    .replaceAll('{JENIS}', KIND_MARKERS[kind] || KIND_MARKERS.full)
    .replaceAll('{TAHUN}', year)
    .replaceAll('{BULAN}', month)
    .replaceAll('{NOMOR}', String(Math.max(1, Math.floor(Number(seq) || 1))).padStart(4, '0'));
}

/** The running number stored in Setting: a whole number from 1, otherwise 1. */
export const cleanNumberNext = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 99999999 ? n : 1;
};

/** A number typed by hand: trimmed, or null when it is not a usable invoice number. */
export function cleanInvoiceNumber(value) {
  const v = String(value ?? '').trim();
  return NUMBER_RE.test(v) ? v : null;
}
