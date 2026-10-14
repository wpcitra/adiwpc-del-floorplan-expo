import React, { useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

const inputCls = 'w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500';
const labelCls = 'block text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-0.5';

// Shared shell of the in-place editors of the invoice table: the value with a pencil on hover, and a small form
// (Simpan / Batal / Esc) in its place. `onSubmit` returns an error message, or '' when saved.
function EditShell({ display, renderFields, onSubmit, onSaved, align = 'left', title }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const failed = await onSubmit();
    setSaving(false);
    if (failed) { setError(failed); return; }
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <div className="group relative inline-block max-w-full">
        {display}
        <button type="button" onClick={() => { setError(''); setEditing(true); }} title={title} aria-label={title}
          className={`absolute -top-1 ${align === 'right' ? '-left-5' : '-right-5'} p-0.5 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer`}>
          <Pencil size={12} />
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="space-y-1 text-left min-w-[150px]" onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
      {renderFields()}
      {error && <div className="text-[10px] font-semibold text-rose-600 whitespace-normal max-w-[220px]">{error}</div>}
      <div className="flex gap-1">
        <button type="submit" disabled={saving} className="flex-1 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-60 cursor-pointer">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Simpan
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer" aria-label="Batal"><X size={11} /></button>
      </div>
    </form>
  );
}

// Nomor invoice + Tanggal Terbit / Jatuh Tempo (empty date = otomatis, AGENTS.md §44)
export function InlineInvoiceNumberEdit({ inv, onSaved, children }) {
  const [form, setForm] = useState({});
  const reset = () => setForm({
    number: inv.invoice_number || '',
    issue: Number(inv.issue_date_fixed) === 1 ? String(inv.issue_date || '').slice(0, 10) : '',
    due: Number(inv.due_date_fixed) === 1 ? String(inv.due_date || '').slice(0, 10) : ''
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <div onFocusCapture={() => form.number === undefined && reset()} onMouseEnter={() => form.number === undefined && reset()}>
      <EditShell
        title="Edit nomor & tanggal invoice"
        display={children}
        onSaved={() => { setForm({}); onSaved?.(); }}
        onSubmit={async () => {
          const body = { issueDateFixed: Boolean(form.issue), dueDateFixed: Boolean(form.due) };
          if (form.issue) body.issueDate = form.issue;
          if (form.due) body.dueDate = form.due;
          if (form.number.trim() && form.number.trim() !== inv.invoice_number) body.invoiceNumber = form.number.trim();
          const res = await api.updateInvoice(inv.id, body);
          return res?.success === false ? (res.error || 'Gagal menyimpan invoice.') : '';
        }}
        renderFields={() => (
          <>
            <div><label className={labelCls}>No. Invoice</label><input autoFocus value={form.number ?? ''} onChange={set('number')} className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>Tanggal Terbit (kosong = saat diunduh)</label><input type="date" value={form.issue ?? ''} onChange={set('issue')} className={inputCls} /></div>
            <div><label className={labelCls}>Jatuh Tempo (kosong = otomatis)</label><input type="date" value={form.due ?? ''} onChange={set('due')} className={inputCls} /></div>
          </>
        )}
      />
    </div>
  );
}

// Diskon privat of the booth (the same save as "Simpan Diskon" in the Property Inspector: booth, unpaid invoices, canvas)
export function InlineDiscountEdit({ inv, onSaved, children }) {
  const single = inv.floorplan_id && inv.booth_code && !String(inv.booth_code).includes('+') && Number(inv.booth_price) > 0;
  const [form, setForm] = useState(null);
  const open = () => setForm({
    type: inv.booth_discount_type === 'percentage' ? 'percentage' : 'nominal',
    value: String(Number(inv.booth_discount_value) || ''),
    reason: inv.booth_discount_reason || ''
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  if (!single) return children;
  return (
    <div onMouseEnter={() => !form && open()} onFocusCapture={() => !form && open()}>
      <EditShell
        title="Edit diskon privat booth"
        display={children}
        onSaved={() => { setForm(null); onSaved?.(); }}
        onSubmit={async () => {
          const value = Math.max(0, Number(String(form.value).replace(',', '.')) || 0);
          const price = Number(inv.booth_price);
          if (form.type === 'percentage' && value > 100) return 'Diskon persen maksimal 100%.';
          if (form.type === 'nominal' && value > price) return 'Diskon melebihi harga booth.';
          if (value > 0 && !form.reason.trim()) return 'Alasan diskon wajib diisi.';
          const res = await api.syncBoothDiscount({
            floorplanId: inv.floorplan_id, boothCode: inv.booth_code, price,
            discountType: form.type, discountValue: value, discountReason: form.reason.trim()
          });
          return res?.success ? '' : (res?.error || 'Gagal menyimpan diskon.');
        }}
        renderFields={() => (
          <>
            <div className="flex gap-1">
              {[['nominal', 'Rp'], ['percentage', '%']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setForm(f => ({ ...f, type: id }))}
                  className={`px-2 py-1 rounded-md border text-[11px] font-bold cursor-pointer ${form.type === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>{label}</button>
              ))}
              <input autoFocus inputMode="decimal" value={form.value} onChange={set('value')} className={`${inputCls} text-right`} placeholder="0" aria-label="Nilai diskon" />
            </div>
            <input value={form.reason} onChange={set('reason')} className={inputCls} placeholder="Alasan diskon" aria-label="Alasan diskon" maxLength={200} />
          </>
        )}
      />
    </div>
  );
}

// Nominal of an UNPAID Invoice DP, as a percentage of the contract (POST /invoices/:id/terms; the Pelunasan follows)
export function InlineDpEdit({ inv, onSaved, children }) {
  const contractTotal = Number(inv.contract?.total) || 0;
  const status = String(inv.payment_status || '').toUpperCase();
  const editable = inv.invoice_kind === 'dp' && ['UNPAID', 'PENDING'].includes(status) && contractTotal > 0;
  const [pct, setPct] = useState('');
  if (!editable) return children;
  const current = Math.round((Number(inv.total_amount) / contractTotal) * 1000) / 10;
  return (
    <div onMouseEnter={() => pct === '' && setPct(String(current))} onFocusCapture={() => pct === '' && setPct(String(current))}>
      <EditShell
        title="Edit persen DP"
        align="right"
        display={children}
        onSaved={() => { setPct(''); onSaved?.(); }}
        onSubmit={async () => {
          const value = Number(String(pct).replace(',', '.'));
          if (!(value > 0 && value < 100)) return 'DP harus lebih dari 0% dan kurang dari 100%.';
          const res = await api.updateInvoiceTerms(inv.id, { dpMode: 'percent', dpValue: value });
          return res?.success === false ? (res.error || 'Gagal mengubah DP.') : '';
        }}
        renderFields={() => (
          <div>
            <label className={labelCls}>DP (% dari kontrak)</label>
            <div className="flex items-center gap-1">
              <input autoFocus inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={`${inputCls} text-right`} aria-label="Persen DP" />
              <span className="text-xs font-bold text-slate-600">%</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
