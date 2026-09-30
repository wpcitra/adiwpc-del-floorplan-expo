import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  History, 
  Clock, 
  Receipt, 
  Building2, 
  Calendar, 
  X, 
  RefreshCw, 
  Check, 
  Lock,
  Search,
  Layers
} from 'lucide-react';
import api from '../../services/api';

export default function TrashManagerModal({
  isOpen,
  onClose,
  onProjectsChanged, // Callback to refresh projects in parent
  showToast
}) {
  const [activeTab, setActiveTab] = useState('trash'); // 'trash' | 'logs'
  const [trashList, setTrashList] = useState([]);
  const [logsList, setLogsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTrash, setSearchTrash] = useState('');

  const loadTrash = async () => {
    setIsLoading(true);
    try {
      const items = await api.fetchTrashProjects();
      setTrashList(items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const logs = await api.fetchActivityLogs(100);
      setLogsList(logs || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrash();
      loadLogs();
      setSelectedTrashIds([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtered trash items
  const filteredTrash = trashList.filter(item => {
    if (!searchTrash.trim()) return true;
    const q = searchTrash.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.venue || '').toLowerCase().includes(q) ||
      (item.id || '').toLowerCase().includes(q)
    );
  });

  // Handle single restore
  const handleRestore = async (id, title) => {
    setIsProcessing(true);
    try {
      const res = await api.restoreProjects([id], 'Admin');
      if (res && res.success) {
        showToast?.(`✅ Project "${title}" berhasil dipulihkan`);
        await loadTrash();
        await loadLogs();
        onProjectsChanged?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal memulihkan project'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghubungi server');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle batch restore
  const handleBatchRestore = async () => {
    if (selectedTrashIds.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await api.restoreProjects(selectedTrashIds, 'Admin');
      if (res && res.success) {
        showToast?.(`✅ ${selectedTrashIds.length} project berhasil dipulihkan`);
        setSelectedTrashIds([]);
        await loadTrash();
        await loadLogs();
        onProjectsChanged?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal memulihkan project'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghubungi server');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle single permanent delete
  const handlePermanentDelete = async (id, title, isFinancialProtected) => {
    if (isFinancialProtected) {
      alert(`Project "${title}" memiliki invoice Lunas atau DP dan tidak dapat dihapus permanen sesuai aturan keuangan.`);
      return;
    }
    if (!confirm(`HAPUS PERMANEN "${title}"?\n\nPeringatan: Tindakan ini tidak dapat dibatalkan dan seluruh data terkait akan dihapus selamanya dari database.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const res = await api.permanentDeleteProjects([id], 'Admin');
      if (res && res.success) {
        showToast?.(`🗑️ Project "${title}" dihapus permanen`);
        await loadTrash();
        await loadLogs();
        onProjectsChanged?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal menghapus permanen'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghubungi server');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle batch permanent delete
  const handleBatchPermanentDelete = async () => {
    const protectedItems = trashList.filter(t => selectedTrashIds.includes(t.id) && t.has_paid_or_dp);
    if (protectedItems.length > 0) {
      alert(`Terdapat ${protectedItems.length} project terpilih yang memiliki invoice Lunas/DP sehingga tidak dapat dihapus permanen.`);
      return;
    }

    if (!confirm(`HAPUS PERMANEN ${selectedTrashIds.length} project terpilih?\n\nPeringatan: Data akan dihapus selamanya dari SQLite.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const res = await api.permanentDeleteProjects(selectedTrashIds, 'Admin');
      if (res && res.success) {
        showToast?.(`🗑️ ${selectedTrashIds.length} project dihapus permanen`);
        setSelectedTrashIds([]);
        await loadTrash();
        await loadLogs();
        onProjectsChanged?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal menghapus permanen'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghubungi server');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectTrash = (id) => {
    setSelectedTrashIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllTrash = () => {
    if (selectedTrashIds.length === filteredTrash.length) {
      setSelectedTrashIds([]);
    } else {
      setSelectedTrashIds(filteredTrash.map(t => t.id));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white leading-tight">
                  Manajemen Sampah & Arsip Project
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {trashList.length} Item di Sampah
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pulihkan project yang terhapus atau pantau riwayat log aktivitas penghapusan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { loadTrash(); loadLogs(); }}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Segarkan data"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Sub-toolbar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('trash')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'trash'
                  ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Trash2 size={13} />
              <span>Daftar Sampah ({trashList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <History size={13} />
              <span>Log Aktivitas ({logsList.length})</span>
            </button>
          </div>

          {activeTab === 'trash' && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTrash}
                  onChange={(e) => setSearchTrash(e.target.value)}
                  placeholder="Cari di sampah..."
                  className="pl-7.5 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 w-44"
                />
              </div>

              {selectedTrashIds.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleBatchRestore}
                    disabled={isProcessing}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Pulihkan ({selectedTrashIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBatchPermanentDelete}
                    disabled={isProcessing}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Hapus Permanen</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab 1: Trash List */}
        {activeTab === 'trash' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            {/* Banner Rules */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
              <Clock size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Aturan Otomatis Sampah:</strong> Item di sampah otomatis dihapus permanen setelah <strong>30 hari</strong>, <em>kecuali</em> project yang memiliki transaksi <strong>Lunas atau DP</strong> yang disimpan permanen sebagai arsip pembukuan terlindungi.
              </div>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin text-indigo-600" />
                <span>Memuat data sampah...</span>
              </div>
            ) : filteredTrash.length === 0 ? (
              <div className="p-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2 text-xl">
                  ✨
                </div>
                <h4 className="text-sm font-bold text-slate-700">Sampah Kosong</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tidak ada project yang sedang berada di folder sampah.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All Checkbox */}
                <div className="flex items-center justify-between px-2 text-xs text-slate-500 font-semibold">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAllTrash}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-all cursor-pointer ${
                        selectedTrashIds.length === filteredTrash.length && filteredTrash.length > 0
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {selectedTrashIds.length === filteredTrash.length && filteredTrash.length > 0 && <Check size={11} strokeWidth={3} />}
                    </button>
                    <span>Pilih Semua ({filteredTrash.length})</span>
                  </div>
                  <span>{filteredTrash.length} project</span>
                </div>

                {filteredTrash.map(item => {
                  const isSelected = selectedTrashIds.includes(item.id);
                  const isProtected = Boolean(item.has_paid_or_dp);
                  const daysRemaining = item.days_remaining !== undefined ? item.days_remaining : 30;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-indigo-50/70 border-indigo-300' 
                          : 'bg-white hover:bg-slate-50 border-slate-200 shadow-2xs'
                      }`}
                    >
                      {/* Left: Info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSelectTrash(item.id)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all mt-0.5 cursor-pointer shrink-0 ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white' 
                              : 'border-slate-300 bg-white hover:border-indigo-400'
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {item.title}
                            </h4>

                            {isProtected ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <Lock size={10} className="text-amber-600" />
                                <span>Arsip Finansial (Lunas/DP)</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1">
                                <Clock size={10} className="text-slate-400" />
                                <span>{daysRemaining} hari tersisa</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                            <span>📍 {item.venue || 'Venue Expo'}</span>
                            <span>• Dihapus: {item.deleted_at ? new Date(item.deleted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</span>
                          </div>

                          {/* Impact Badges */}
                          <div className="flex items-center gap-2 mt-2 text-[10px]">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                              {item.invoice_count} Invoice (Rp {Number(item.total_invoiced || 0).toLocaleString('id-ID')})
                            </span>
                            {item.paid_count > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                {item.paid_count} Lunas
                              </span>
                            )}
                            {item.dp_count > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                {item.dp_count} DP
                              </span>
                            )}
                            {item.unpaid_count > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                                {item.unpaid_count} Belum
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleRestore(item.id, item.title)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw size={13} />
                          <span>Pulihkan</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePermanentDelete(item.id, item.title, isProtected)}
                          disabled={isProtected || isProcessing}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                            isProtected
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200 hover:border-rose-300 cursor-pointer'
                          }`}
                          title={isProtected ? 'Terkunci: Memiliki invoice Lunas/DP' : 'Hapus permanen dari SQLite'}
                        >
                          {isProtected ? <Lock size={13} /> : <Trash2 size={13} />}
                          <span>Hapus Permanen</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Activity Logs */}
        {activeTab === 'logs' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Riwayat Audit Aksi Hapus, Pulihkan & Hapus Permanen
            </span>

            {logsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                Belum ada aktivitas tercatat.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {logsList.map(log => {
                  let badge = (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {log.action}
                    </span>
                  );
                  if (log.action === 'SOFT_DELETE') {
                    badge = (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        Ke Sampah
                      </span>
                    );
                  } else if (log.action === 'RESTORE') {
                    badge = (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Dipulihkan
                      </span>
                    );
                  } else if (log.action === 'PERMANENT_DELETE') {
                    badge = (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-900 border border-red-300">
                        Hapus Permanen
                      </span>
                    );
                  }

                  let detailObj = {};
                  try {
                    detailObj = typeof log.details_json === 'string' ? JSON.parse(log.details_json) : (log.details_json || {});
                  } catch (e) {}

                  return (
                    <div key={log.id} className="p-3 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {badge}
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate">
                            {log.target_title || `Project #${log.target_id}`}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Oleh: <strong>{log.user_name || 'Admin'}</strong>
                            {detailObj?.reason ? ` • Catatan: ${detailObj.reason}` : ''}
                            {detailObj?.count ? ` • ${detailObj.count} project` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 shrink-0 text-right">
                        {new Date(log.created_at).toLocaleString('id-ID', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Soft Delete & Proteksi Finansial SQLite Berjalan Otomatis</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
