import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { canRestoreInvoice } from '../../utils/invoicePermissions';
import { ROLE_LABELS } from '../../utils/roles';

// Tempat Sampah Invoice (AGENTS.md §31): invoices deleted with "Hapus Invoice"; the Super Admin restores them.
export default function InvoiceTrashModal({ isOpen, onClose, onRestored, showToast }) {
  const { user } = useAuth();
  const allowed = canRestoreInvoice(user);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const res = await api.fetchInvoiceTrash();
    setIsLoading(false);
    if (res?.success) setItems(res.invoices || []);
    else setError(res?.error || 'Gagal memuat Tempat Sampah Invoice');
  }, []);

  useEffect(() => { if (isOpen && allowed) load(); }, [isOpen, allowed, load]);

  if (!isOpen || !allowed) return null;

  const restore = async (inv) => {
    setRestoringId(inv.id);
    const res = await api.restoreInvoice(inv.id);
    setRestoringId(null);
    if (res?.success) {
      showToast?.(`✅ ${res.message || `Invoice ${inv.invoiceNumber} dipulihkan`}`);
      setItems(list => list.filter(i => i.id !== inv.id));
      onRestored?.(inv);
    } else {
      showToast?.(`⚠️ ${res?.error || 'Gagal memulihkan invoice'}`);
    }
  };

  // SQLite stores UTC ("YYYY-MM-DD HH:MM:SS")
  const when = (value) => {
    const d = new Date(`${String(value || '').replace(' ', 'T')}Z`);
    return Number.isNaN(d.getTime()) ? (value || '-') : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" role="dialog" aria-modal="true" aria-label="Tempat Sampah Invoice">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] text-left">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Tempat Sampah Invoice</h2>
              <p className="text-[11px] text-slate-500">Invoice yang dihapus. Nomornya tidak dipakai ulang; pemulihan tercatat di Audit.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 text-xs">
          {isLoading && <div className="p-8 text-center text-slate-500"><Loader2 size={18} className="animate-spin inline-block mr-2" />Memuat…</div>}
          {!isLoading && error && <div className="p-8 text-center text-rose-600 font-medium">{error}</div>}
          {!isLoading && !error && items.length === 0 && (
            <div className="p-10 text-center text-slate-500">Tempat Sampah Invoice kosong.</div>
          )}
          {!isLoading && !error && items.map(inv => (
            <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono font-bold text-slate-900">{inv.invoiceNumber}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">{inv.kindLabel}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">{inv.statusLabel}</span>
                </div>
                <div className="text-slate-700">
                  <span className="font-semibold">{inv.companyName || '-'}</span>
                  {inv.boothCode && <span> • booth #{inv.boothCode}</span>}
                  <span> • {rupiah(inv.totalAmount)}</span>
                  {inv.paidAmount > 0 && <span className="text-rose-600 font-semibold"> • sudah dibayar {rupiah(inv.paidAmount)}</span>}
                </div>
                {inv.projectTitle && <div className="text-slate-500">Project: {inv.projectTitle}{inv.projectInTrash ? ' (di Tempat Sampah)' : ''}</div>}
                <div className="text-slate-500">
                  Dihapus {when(inv.deletedAt)} oleh <span className="font-semibold text-slate-700">{inv.deletedBy || '-'}</span>
                  {inv.deletedByRole ? ` (${ROLE_LABELS[inv.deletedByRole] || inv.deletedByRole})` : ''}
                </div>
                <div className="text-slate-600"><span className="text-slate-500">Alasan:</span> {inv.deleteReason || '-'}</div>
              </div>
              <button type="button" onClick={() => restore(inv)} disabled={restoringId !== null}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold cursor-pointer disabled:opacity-50">
                {restoringId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                <span>Pulihkan</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
