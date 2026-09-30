import React, { useState, useMemo } from 'react';
import { 
  Trash2, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Calendar, 
  Receipt, 
  Layers, 
  Users, 
  X,
  FileSpreadsheet
} from 'lucide-react';

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  projectsToDelete = [], // Array of project objects
  getProjectStats,
  onConfirmDelete,
  isProcessing = false
}) {
  const [confirmInput, setConfirmInput] = useState('');

  // Reset input when opening
  React.useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  // Aggregate stats across all selected projects
  const aggregatedData = useMemo(() => {
    let totalInvoices = 0;
    let totalNominal = 0;
    let paidCount = 0;
    let dpCount = 0;
    let unpaidCount = 0;
    let totalBooths = 0;

    projectsToDelete.forEach(proj => {
      const stats = getProjectStats ? getProjectStats(proj.id) : { count: 0, totalAmount: 0, paidCount: 0, dpCount: 0, unpaidCount: 0 };
      totalInvoices += stats.count || 0;
      totalNominal += stats.totalAmount || 0;
      paidCount += stats.paidCount || 0;
      dpCount += stats.dpCount || 0;
      unpaidCount += stats.unpaidCount || 0;

      // Estimate booths
      if (proj.booth_count) totalBooths += proj.booth_count;
      else if (proj.metadata) {
        try {
          const meta = typeof proj.metadata === 'string' ? JSON.parse(proj.metadata) : proj.metadata;
          if (meta?.stats?.totalBooths) totalBooths += meta.stats.totalBooths;
          else if (meta?.booths?.length) totalBooths += meta.booths.length;
        } catch (e) {}
      }
    });

    const hasPaidOrDp = paidCount > 0 || dpCount > 0;
    const hasInvoices = totalInvoices > 0;

    return {
      totalInvoices,
      totalNominal,
      paidCount,
      dpCount,
      unpaidCount,
      totalBooths,
      hasPaidOrDp,
      hasInvoices
    };
  }, [projectsToDelete, getProjectStats]);

  if (!isOpen || projectsToDelete.length === 0) return null;

  const isSingle = projectsToDelete.length === 1;
  const targetProject = projectsToDelete[0];

  // Confirmation validation
  const requiredKeyword = isSingle ? targetProject.title : 'HAPUS';
  const isInputValid = !aggregatedData.hasInvoices 
    ? true 
    : (confirmInput.trim().toUpperCase() === 'HAPUS' || confirmInput.trim().toLowerCase() === targetProject.title.trim().toLowerCase());

  const handleConfirm = () => {
    if (!isInputValid || isProcessing) return;
    onConfirmDelete(projectsToDelete.map(p => p.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-rose-50 via-white to-amber-50/40 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {isSingle ? 'Hapus Project ke Sampah' : `Hapus ${projectsToDelete.length} Project Terpilih`}
              </h2>
              <p className="text-xs text-slate-500">
                Data akan dipindahkan ke panel Sampah (Soft Delete)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Target Project Info (Single) */}
          {isSingle ? (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-start gap-2.5">
                <Building2 size={16} className="text-indigo-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {targetProject.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" />
                      <span>{targetProject._dateInfo?.formattedDate || 'Tanggal tidak diset'}</span>
                    </span>
                    <span>📍 {targetProject.venue || 'Venue Expo'}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Target Projects List (Batch) */
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-36 overflow-y-auto space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">
                Daftar {projectsToDelete.length} Project yang akan dihapus:
              </span>
              {projectsToDelete.map(p => (
                <div key={p.id} className="text-xs text-slate-700 flex items-center justify-between py-0.5">
                  <span className="truncate font-semibold max-w-[280px]">📁 {p.title}</span>
                  <span className="text-[10px] text-slate-400">{p._dateInfo?.year || ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* Impacted Related Data Breakdown */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2.5">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
              Data Terkait yang Terdampak:
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                <Layers size={14} className="text-indigo-600" />
                <div>
                  <span className="text-slate-500 block text-[10px]">Denah Pameran</span>
                  <span className="font-bold text-slate-800">{projectsToDelete.length} Layout</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                <Receipt size={14} className="text-indigo-600" />
                <div>
                  <span className="text-slate-500 block text-[10px]">Dokumen Invoice</span>
                  <span className="font-bold text-slate-800">{aggregatedData.totalInvoices} Invoice</span>
                </div>
              </div>
            </div>

            {/* Invoices Breakdown */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Total Nominal Tagihan:</span>
              <span className="font-bold font-mono text-slate-900">
                Rp {aggregatedData.totalNominal.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] pt-1">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                {aggregatedData.paidCount} Lunas
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {aggregatedData.dpCount} DP
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-200">
                {aggregatedData.unpaidCount} Belum Lunas
              </span>
            </div>
          </div>

          {/* Financial Protection Notice */}
          {aggregatedData.hasPaidOrDp ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong className="font-bold block text-amber-950 mb-0.5">
                  Proteksi Keuangan & Audit Aktif
                </strong>
                Project ini memiliki <strong>{aggregatedData.paidCount} invoice Lunas</strong> dan/atau <strong>{aggregatedData.dpCount} pembayaran DP</strong>.
                Data akan disimpan aman di <strong>Sampah (Arsip Keuangan)</strong> dan <strong className="underline decoration-amber-600">tidak dapat dihapus permanen</strong> untuk menjaga integritas pembukuan finansial.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle size={15} className="text-slate-500 mt-0.5 shrink-0" />
              <span>
                Project akan dipindahkan ke Sampah dan dapat dipulihkan kapan saja dalam 30 hari sebelum dihapus permanen.
              </span>
            </div>
          )}

          {/* Typing confirmation if project has invoices */}
          {aggregatedData.hasInvoices && (
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Ketik <span className="font-bold text-rose-600">"{isSingle ? targetProject.title : 'HAPUS'}"</span> atau kata <span className="font-bold text-rose-600">"HAPUS"</span> untuk konfirmasi:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={isSingle ? `Ketik "${targetProject.title}" atau "HAPUS"` : 'Ketik "HAPUS"'}
                className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-900 placeholder-slate-400"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isInputValid || isProcessing}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              !isInputValid || isProcessing
                ? 'bg-rose-300 cursor-not-allowed opacity-60'
                : 'bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-600/20'
            }`}
          >
            <Trash2 size={14} />
            <span>{isProcessing ? 'Memproses...' : 'Pindahkan ke Sampah'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
