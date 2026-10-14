import React, { useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

const inputCls = 'w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500';

// Company & PIC cell of an invoice row, editable in place. One save updates the tenant everywhere: the booths of the
// invoice (booth rows, orders, every invoice of the booth, the saved canvas: PUT /orders/update-tenant) and this
// invoice itself, which also covers a multi-booth code such as "A-01+A-02".
export default function InlineTenantEdit({ inv, onSaved, children }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ brandName: '', fullName: '', phone: '' });
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const open = () => {
    setForm({ brandName: inv.company_name || '', fullName: inv.client_name || '', phone: inv.client_phone || '' });
    setError('');
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
    if (!data.brandName || !data.fullName || !data.phone) { setError('Perusahaan, PIC, dan WhatsApp wajib diisi.'); return; }
    setSaving(true);
    setError('');
    const codes = String(inv.booth_code || '').split('+').map(c => c.trim()).filter(Boolean);
    let failed = '';
    if (inv.floorplan_id) {
      for (const boothCode of codes) {
        const res = await api.updateTenantBiodata({ floorplanId: inv.floorplan_id, boothCode, ...data });
        if (!res?.success) { failed = res?.error || 'Gagal memperbarui tenant.'; break; }
      }
    }
    if (!failed) {
      const res = await api.updateInvoice(inv.id, { clientName: data.fullName, companyName: data.brandName, clientPhone: data.phone });
      if (res?.success === false) failed = res.error || 'Gagal memperbarui invoice.';
    }
    setSaving(false);
    if (failed) { setError(failed); return; }
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <div className="group relative pr-5">
        {children}
        <button type="button" onClick={open} title="Edit tenant langsung" aria-label="Edit perusahaan dan PIC"
          className="absolute top-0 right-0 p-0.5 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-1" onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
      <input autoFocus value={form.brandName} onChange={set('brandName')} className={inputCls} placeholder="Perusahaan / brand" aria-label="Perusahaan" />
      <input value={form.fullName} onChange={set('fullName')} className={inputCls} placeholder="Nama PIC" aria-label="Nama PIC" />
      <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="No. WhatsApp" aria-label="No. WhatsApp" inputMode="tel" />
      {error && <div className="text-[10px] font-semibold text-rose-600">{error}</div>}
      <div className="flex gap-1">
        <button type="submit" disabled={saving} className="flex-1 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-60 cursor-pointer">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Simpan
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 text-[11px] font-bold cursor-pointer" aria-label="Batal"><X size={11} /></button>
      </div>
    </form>
  );
}
