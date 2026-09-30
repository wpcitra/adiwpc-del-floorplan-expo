import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  Trash2, 
  AlertTriangle, 
  ShieldAlert, 
  Receipt, 
  Layers, 
  X 
} from 'lucide-react';

export default function DeleteFolderConfirmModal({
  isOpen,
  onClose,
  group, // { year, projects: [] }
  getProjectStats,
  onConfirmDeleteFolder,
  isProcessing = false
}) {
  const [confirmInput, setConfirmInput] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  const folderName = useMemo(() => {
    if (!group) return '';
    return group.year === 'Tanpa Tahun' ? 'Folder Tanpa Tahun' : `Tahun ${group.year}`;
  }, [group]);

  const folderStats = useMemo(() => {
    if (!group || !group.projects) {
      return { totalProjects: 0, totalInvoices: 0, totalNominal: 0, paidCount: 0, dpCount: 0, unpaidCount: 0, hasPaidOrDp: false };
    }

    let totalInvoices = 0;
    let totalNominal = 0;
    let paidCount = 0;
    let dpCount = 0;
    let unpaidCount = 0;

    group.projects.forEach(p => {
      const stats = getProjectStats ? getProjectStats(p.id) : { count: 0, totalAmount: 0, paidCount: 0, dpCount: 0, unpaidCount: 0 };
      totalInvoices += stats.count || 0;
      totalNominal += stats.totalAmount || 0;
      paidCount += stats.paidCount || 0;
      dpCount += stats.dpCount || 0;
      unpaidCount += stats.unpaidCount || 0;
    });

    return {
      totalProjects: group.projects.length,
      totalInvoices,
      totalNominal,
      paidCount,
      dpCount,
      unpaidCount,
      hasPaidOrDp: paidCount > 0 || dpCount > 0
    };
  }, [group, getProjectStats]);

  if (!isOpen || !group) return null;

  // Validation: user must type folderName or year (e.g. "Tahun 2026", "2026", or "Folder Tanpa Tahun")
  const normalizedInput = confirmInput.trim().toLowerCase();
  const normalizedTarget = folderName.trim().toLowerCase();
  const isInputValid = (
    normalizedInput === normalizedTarget ||
    normalizedInput === String(group.year).trim().toLowerCase() ||
    normalizedInput === 'hapus'
  );

  const handleConfirm = () => {
    if (!isInputValid || isProcessing) return;
    const projectIds = group.projects.map(p => p.id);
    onConfirmDeleteFolder(projectIds, folderName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-rose-50 via-white to-amber-50/40 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <Folder size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Hapus Seluruh {folderName}
              </h2>
              <p className="text-xs text-slate-500">
                Menghapus {folderStats.totalProjects} project di dalam folder ini ke Sampah
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
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              Semua project di dalam folder <strong>{folderName}</strong> akan dipindahkan ke Sampah. Folder akan otomatis tersembunyi setelah semua project di dalamnya terhapus.
            </div>
          </div>

          {/* List of projects inside folder */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 block">
              Daftar Project di {folderName} ({group.projects.length}):
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {group.projects.map(p => {
                const s = getProjectStats ? getProjectStats(p.id) : { count: 0 };
                return (
                  <div key={p.id} className="text-xs flex items-center justify-between py-1 px-2 bg-white rounded-lg border border-slate-200/70">
                    <span className="font-semibold text-slate-800 truncate max-w-[280px]">
                      📁 {p.title}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {s.count} Invoice
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
              Total Invoice & Keuangan Terdampak:
            </span>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500">Total Invoice Terbit:</span>
              <span className="font-bold text-slate-900">{folderStats.totalInvoices} Dokumen</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total Nominal Tagihan:</span>
              <span className="font-bold font-mono text-slate-900">
                Rp {folderStats.totalNominal.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] pt-1">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                {folderStats.paidCount} Lunas
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {folderStats.dpCount} DP
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-200">
                {folderStats.unpaidCount} Belum Lunas
              </span>
            </div>
          </div>

          {/* Financial protection message if any Lunas/DP */}
          {folderStats.hasPaidOrDp && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong className="font-bold block text-amber-950 mb-0.5">
                  Proteksi Keuangan Berantai
                </strong>
                Folder ini berisi project dengan invoice <strong>Lunas / DP</strong>. Semua invoice dan project tersebut tetap diarsipkan secara aman di panel Sampah dan tidak akan dihapus permanen.
              </div>
            </div>
          )}

          {/* Confirmation input */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-slate-700 block">
              Ketik nama folder <span className="font-bold text-rose-600">"{folderName}"</span> untuk mengonfirmasi:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={`Ketik "${folderName}"`}
              className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-900 placeholder-slate-400"
            />
          </div>
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
            <span>{isProcessing ? 'Memproses...' : 'Hapus Semua di Folder Ini'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
