import React, { useEffect, useRef, useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { canDeleteTenant, sameBoothNumber, tenantRowIds, tenantRowCodes, BULK_CONFIRM_WORD } from '../../utils/tenantPermissions';

// Hapus Tenant (AGENTS.md §33), Super Admin only. `tenant` = one table row: the confirmation of a single tenant.
// `tenants` (several rows) = the bulk confirmation. `onConfirm(payload)` performs the delete and returns { success, error }.
const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
// what the page already knows about a row (the server decides in the end)
const looksBilled = (exh) => (exh.invoices?.length || 0) > 0 || ['PAID', 'PARTIAL'].includes(String(exh.payment_status || '').toUpperCase()) || exh.status === 'sold';

export default function TenantDeleteModal({ tenant = null, tenants = null, statusLabel, onClose, onConfirm }) {
  const { user } = useAuth();
  const isBulk = Array.isArray(tenants) && tenants.length > 0;
  const open = Boolean(tenant) || isBulk;
  const [summary, setSummary] = useState(null);
  const [typed, setTyped] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);
  const ids = tenant ? tenantRowIds(tenant) : [];
  const codes = tenant ? tenantRowCodes(tenant) : [];
  const key = isBulk ? `bulk:${tenants.length}` : ids.join(',');

  useEffect(() => {
    setSummary(null);
    setTyped('');
    setError('');
    setIsSaving(false);
    if (!open) return undefined;
    cancelRef.current?.focus();
    if (isBulk || !ids.length) return undefined;
    let alive = true;
    api.fetchTenantSummary(ids[0], ids.slice(1)).then(res => { if (alive && res?.success) setSummary(res.tenant); });
    return () => { alive = false; };
  }, [key, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !isSaving) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open || !canDeleteTenant(user)) return null;

  const risky = isBulk ? tenants.filter(looksBilled) : [];
  const needsTyping = isBulk ? risky.length > 0 : (summary ? summary.needsConfirmation : looksBilled(tenant));
  const boothLabel = codes.join('+');
  const typedOk = !needsTyping || (isBulk ? typed.trim() === BULK_CONFIRM_WORD : sameBoothNumber(typed, codes));
  const canSubmit = typedOk && !isSaving;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError('');
    const res = await onConfirm?.(isBulk ? { confirmText: typed.trim() } : { confirmBooth: typed.trim() });
    if (res?.success === false) {
      setIsSaving(false);
      setError(res.error || 'Gagal menghapus tenant');
    }
  };

  const yesNo = (v) => (v ? 'Ada' : 'Tidak ada');
  const rows = !isBulk ? [
    ['PIC', summary?.picName || tenant.pic || '-'],
    ['Kategori', summary?.brandCategory || tenant.brandCategory || '-'],
    ['Total Tagihan', rupiah(summary ? summary.totalAmount : tenant.price)],
    ['Status Pembayaran', summary?.paymentStatus || statusLabel?.(tenant) || '-'],
    ['Invoice', summary ? (summary.hasInvoice ? `Ada (${summary.invoices.map(i => i.invoiceNumber).join(', ')})` : 'Tidak ada') : yesNo((tenant.invoices?.length || 0) > 0)],
    ['Form Fasilitas terisi', summary ? yesNo(summary.hasFacilityForm) : 'Memeriksa…']
  ] : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" role="dialog" aria-modal="true" aria-label="Hapus tenant">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-left">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <h2 className="text-sm font-bold text-slate-900 leading-snug break-words min-w-0">
              {isBulk ? `Hapus ${tenants.length} tenant terpilih?` : `Hapus tenant ${tenant.company} di booth #${boothLabel}?`}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} title="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {isBulk ? (
            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {tenants.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900 truncate">{t.company}</span>
                    <span className="block text-[11px] text-slate-500">#{t.booth} • {rupiah(t.price)} • {statusLabel?.(t) || '-'}</span>
                  </span>
                  {looksBilled(t) && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-bold">
                      <AlertTriangle size={10} /> Ada pembayaran / invoice
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <dl className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="text-slate-500 shrink-0">{label}</dt>
                  <dd className="font-semibold text-slate-900 text-right break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-slate-700 leading-relaxed">Booth akan kembali tersedia di denah. Data tenant, form fasilitas, dan riwayatnya akan dihapus.</p>

          {needsTyping && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                <p className="font-semibold leading-relaxed">
                  {isBulk ? `${risky.length} tenant terpilih sudah memiliki pembayaran/invoice.` : 'Tenant ini sudah memiliki pembayaran/invoice.'}
                </p>
              </div>
              <label htmlFor="tenant-delete-confirm" className="block font-semibold text-slate-700">
                {isBulk ? <>Ketik <span className="font-mono text-rose-700">{BULK_CONFIRM_WORD}</span> untuk melanjutkan</> : <>Ketik nomor booth <span className="font-mono text-rose-700">{boothLabel}</span> untuk melanjutkan</>}
              </label>
              <input id="tenant-delete-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 ${typed && !typedOk ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-200 focus:ring-rose-400'}`} />
            </div>
          )}

          {error && <p className="text-rose-600 font-medium" role="alert">{error}</p>}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={isSaving}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400">
            Batal
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            <span>{isSaving ? 'Menghapus…' : 'Hapus'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
