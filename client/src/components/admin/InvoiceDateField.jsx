import React from 'react';
import { invoiceDates } from '../../utils/invoiceNumbering';

const longDate = (iso) => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

// Tanggal Terbit / Jatuh Tempo of one invoice (AGENTS.md §44): "Otomatis" (the day the invoice is downloaded,
// + N days for Jatuh Tempo) or "Tanggal tetap" typed by hand. Used by Buat Invoice, the DP / Pelunasan wizard and
// Edit Invoice, so the three forms speak the same way.
//   which: 'issue' | 'due'; value = { issueDate, dueDate, issueDateFixed, dueDateFixed }
export default function InvoiceDateField({ which, value, dueDays, onChange, inputClassName = '' }) {
  const key = which === 'issue' ? 'issueDate' : 'dueDate';
  const fixed = Boolean(value[`${key}Fixed`]);
  const shown = invoiceDates(value, { dueDays });
  const today = invoiceDates({}, { dueDays }).issueDate;
  const title = which === 'issue' ? 'Tanggal Terbit' : 'Jatuh Tempo';
  const autoText = which === 'issue' ? 'Otomatis' : `Otomatis (+${dueDays} hari)`;
  const autoHint = which === 'issue'
    ? `Tanggal saat invoice diunduh / dicetak (hari ini: ${longDate(today)})`
    : `${dueDays} hari setelah Tanggal Terbit (saat ini: ${longDate(shown.dueDate)})`;
  // Switching to "Tanggal tetap" starts from the date the invoice shows now
  const setFixed = (on) => onChange({ [`${key}Fixed`]: on, ...(on && !fixed ? { [key]: shown[key] } : {}) });

  return (
    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
      <div className="text-[11px] font-bold text-slate-600">{title}</div>
      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-200/60" role="radiogroup" aria-label={title}>
        {[[false, autoText], [true, 'Tanggal tetap']].map(([val, text]) => (
          <button key={text} type="button" role="radio" aria-checked={fixed === val} onClick={() => setFixed(val)}
            className={`px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors ${fixed === val ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {text}
          </button>
        ))}
      </div>
      {fixed
        ? <input type="date" aria-label={`${title} (tanggal tetap)`} className={inputClassName || 'w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white'} value={value[key] || ''} onChange={(e) => onChange({ [key]: e.target.value })} />
        : <p className="text-[10px] text-slate-500 leading-snug">{autoHint}</p>}
    </div>
  );
}
