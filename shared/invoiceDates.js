import { wibParts } from './invoiceNumbering.js';

// Tanggal invoice (AGENTS.md §44). Tanggal Terbit = the day the invoice is downloaded / printed / opened (WIB);
// Jatuh Tempo = Tanggal Terbit + `invoiceDueDays` (Setting, default 14). Per invoice either date can be fixed by
// hand (issue_date_fixed / due_date_fixed = 1), then the stored issue_date / due_date is shown instead.
export const DEFAULT_DUE_DAYS = 14;

export const cleanDueDays = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : DEFAULT_DUE_DAYS;
};

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const isFixed = (v) => v === true || v === 1 || v === '1';
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : null;

/** { issueDate, dueDate } (YYYY-MM-DD) as the invoice shows them at `now`. */
export function invoiceDates(inv = {}, { dueDays = DEFAULT_DUE_DAYS, now = new Date() } = {}) {
  const issueFixed = isFixed(inv.issue_date_fixed ?? inv.issueDateFixed) && validDate(inv.issue_date ?? inv.issueDate);
  const issueDate = issueFixed || wibParts(now).date;
  const dueFixed = isFixed(inv.due_date_fixed ?? inv.dueDateFixed) && validDate(inv.due_date ?? inv.dueDate);
  return { issueDate, dueDate: dueFixed || addDays(issueDate, cleanDueDays(dueDays)), issueFixed: Boolean(issueFixed), dueFixed: Boolean(dueFixed) };
}
