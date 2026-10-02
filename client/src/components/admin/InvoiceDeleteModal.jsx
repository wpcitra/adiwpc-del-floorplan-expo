import React, { useEffect, useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { canDeleteInvoice, canDeletePaidInvoice, cleanDeleteReason, sameInvoiceNumber, DELETE_REASON_MIN } from '../../utils/invoicePermissions';

// Hapus Invoice (AGENTS.md §31): one confirmation for Data Exhibitor, Manajemen Invoice and Katalog Invoice.
// `invoice` is the brief of invoiceBriefOf(). Only the invoice is deleted (soft delete): tenant, booking and booth stay.
export default function InvoiceDeleteModal({ invoice, onClose, onDeleted, showToast }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [typedNumber, setTypedNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReason('');
    setTypedNumber('');
    setError('');
    setIsSaving(false);
  }, [invoice?.id]);

  useEffect(() => {
    if (!invoice) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !isSaving) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [invoice, isSaving, onClose]);

  if (!invoice || !canDeleteInvoice(user)) return null;

  const hasPayment = invoice.paidAmount > 0;
  const blocked = hasPayment && !canDeletePaidInvoice(user);
  const reasonOk = Boolean(cleanDeleteReason(reason));
  const numberOk = !hasPayment || sameInvoiceNumber(typedNumber, invoice.invoiceNumber);
  const canSubmit = !blocked && reasonOk && numberOk && !isSaving;
  const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError('');
    const res = await api.deleteInvoice(invoice.id, { reason, confirmNumber: typedNumber });
    setIsSaving(false);
    if (res?.success) {
      showToast?.(`🗑️ ${res.message || `Invoice ${invoice.invoiceNumber} dipindahkan ke Tempat Sampah`}`);
      onDeleted?.(invoice, res);
    } else {
      const message = res?.error || 'Gagal menghapus invoice';
      setError(message);
      showToast?.(`⚠️ ${message}`);
    }
  };

  const rows = [
    ['Nomor Invoice', invoice.invoiceNumber || '-'],
    ['Brand / Tenant', invoice.companyName || '-'],
    ['Nomor Booth', invoice.boothCode ? `#${invoice.boothCode}` : '-'],
    ['Jenis Invoice', invoice.kindLabel],
    ['Nominal', rupiah(invoice.totalAmount)],
    ['Status Pembayaran', hasPayment && invoice.paymentStatus === 'PARTIAL' ? `${invoice.statusLabel} (dibayar ${rupiah(invoice.paidAmount)})` : invoice.statusLabel]
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" role="dialog" aria-modal="true" aria-label="Hapus Invoice">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-left">
        <div className="px-5 py-4 bg-gradient-to-r from-rose-50 via-white to-amber-50/40 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Hapus Invoice</h2>
              <p className="text-[11px] text-slate-500">Dipindahkan ke Tempat Sampah. Tenant, booking dan booth tidak berubah.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} title="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <dl className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-slate-500 shrink-0">{label}</dt>
                <dd className="font-semibold text-slate-900 text-right break-words min-w-0">{value}</dd>
              </div>
            ))}
          </dl>

          {hasPayment && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-700">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <p className="font-bold">Invoice ini sudah menerima pembayaran {rupiah(invoice.paidAmount)}.</p>
                <p>{blocked
                  ? 'Hanya Super Admin yang dapat menghapus invoice yang sudah ada pembayarannya.'
                  : 'Catatan pembayarannya ikut keluar dari laporan. Ketik ulang nomor invoice untuk melanjutkan.'}</p>
              </div>
            </div>
          )}

          {!blocked && (
            <>
              <div>
                <label htmlFor="invoice-delete-reason" className="block font-semibold text-slate-700 mb-1">Alasan penghapusan <span className="text-rose-600">*</span></label>
                <textarea id="invoice-delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus
                  placeholder="Contoh: invoice salah terbit, diganti invoice baru"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-400" />
                <p className={`mt-1 text-[11px] ${reason && !reasonOk ? 'text-rose-600' : 'text-slate-400'}`}>Minimal {DELETE_REASON_MIN} karakter.</p>
              </div>

              {hasPayment && (
                <div>
                  <label htmlFor="invoice-delete-number" className="block font-semibold text-slate-700 mb-1">
                    Ketik ulang nomor invoice: <span className="font-mono text-rose-700">{invoice.invoiceNumber}</span>
                  </label>
                  <input id="invoice-delete-number" type="text" value={typedNumber} onChange={(e) => setTypedNumber(e.target.value)} autoComplete="off"
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 ${typedNumber && !numberOk ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-200 focus:ring-rose-400'}`} />
                </div>
              )}
            </>
          )}

          {error && <p className="text-rose-600 font-medium" role="alert">{error}</p>}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSaving}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer">
            {blocked ? 'Tutup' : 'Batal'}
          </button>
          {!blocked && (
            <button type="button" onClick={submit} disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              <span>Hapus Invoice</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
