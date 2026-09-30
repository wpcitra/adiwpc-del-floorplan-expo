import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  X, 
  Plus, 
  Search, 
  Globe, 
  Check, 
  Copy, 
  Trash2, 
  FolderOpen, 
  Sparkles, 
  Clock, 
  Layers, 
  DollarSign, 
  CheckCircle2, 
  FileText,
  AlertCircle,
  RefreshCw,
  ImageIcon,
  LayoutTemplate,
  ExternalLink,
  PauseCircle,
  Link2
} from 'lucide-react';
import { api } from '../../services/api';

export default function TemplateManagerModal({
  isOpen,
  onClose,
  currentFloorplanId,
  currentFloorplanTitle,
  onLoadTemplate,
  onSaveAsNewTemplate,
  onOpenNewTemplateModal,
  onFloorplanPublished,
  showToast
}) {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'published' | 'draft'
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const list = await api.fetchFloorplanList();
      setTemplates(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchList();
      setIsSavingNew(false);
      setNewTitle('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredTemplates = templates.filter(t => {
    const matchSearch = (t.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'published') return matchSearch && t.is_published;
    if (activeTab === 'draft') return matchSearch && !t.is_published;
    return matchSearch;
  });

  const publishedCount = templates.filter(t => t.is_published).length;
  const draftCount = templates.filter(t => !t.is_published).length;

  const handlePublish = async (template) => {
    if (template.is_published) return;
    setActionLoadingId(template.id);
    try {
      const res = await api.publishFloorplan(template.id);
      if (res.success) {
        showToast?.(`🚀 "${template.title}" live di /live/${res.slug} (denah lain yang live tetap tayang)`);
        await fetchList();
        onFloorplanPublished?.(template.id);
      } else {
        showToast?.(`⚠️ Gagal mempublikasikan: ${res.error || 'Server error'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Terjadi kesalahan saat mempublikasikan');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Stop publishing one floorplan; the other live floorplans keep their links
  const handleUnpublish = async (template) => {
    if (!confirm(`Hentikan publikasi "${template.title}"?\nLink /live/${template.public_slug || ''} tidak dapat dibuka lagi sampai dipublikasikan ulang.`)) return;
    setActionLoadingId(template.id);
    try {
      const res = await api.unpublishFloorplan(template.id);
      showToast?.(res.success ? `⏸️ ${res.message}` : `⚠️ ${res.error || 'Gagal menghentikan publikasi'}`);
      if (res.success) await fetchList();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCopyLink = (template) => {
    const url = `${window.location.origin}/live/${template.public_slug}`;
    navigator.clipboard.writeText(url);
    showToast?.(`🔗 Link disalin: ${url}`);
  };

  const handleDuplicate = async (template) => {
    setActionLoadingId(template.id);
    try {
      const res = await api.duplicateFloorplan(template.id);
      if (res.success) {
        showToast?.(`✨ Berhasil menduplikasi "${template.title}"`);
        await fetchList();
      } else {
        showToast?.(`⚠️ Gagal menduplikasi: ${res.error || 'Server error'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Terjadi kesalahan saat menduplikasi');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveAsPreset = async (template) => {
    const customTitle = window.prompt(`Masukkan nama Preset Layout untuk "${template.title}":`, `Preset: ${template.title}`);
    if (!customTitle || !customTitle.trim()) return;

    setActionLoadingId(template.id);
    try {
      const res = await api.saveFloorplanAsPreset({
        floorplanId: template.id,
        title: customTitle.trim(),
        description: `Preset layout turunan dari denah "${template.title}"`,
        tag: 'Preset Admin'
      });
      if (res.success) {
        showToast?.(`✨ Denah "${template.title}" berhasil dijadikan Preset Layout baru!`);
      } else {
        showToast?.(`⚠️ Gagal menyimpan preset: ${res.error || 'Server error'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menyimpan preset layout');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (template) => {
    if (template.is_published && templates.length > 1) {
      if (!confirm(`⚠️ Perhatian: "${template.title}" saat ini berstatus LIVE (sedang tayang untuk pengunjung). Yakin ingin menghapusnya?`)) {
        return;
      }
    } else {
      if (!confirm(`Hapus template "${template.title}"?`)) {
        return;
      }
    }

    setActionLoadingId(template.id);
    try {
      const res = await api.deleteFloorplan(template.id);
      if (res.success) {
        showToast?.(`🗑️ Template "${template.title}" berhasil dihapus`);
        await fetchList();
      } else {
        showToast?.(`⚠️ Gagal menghapus: ${res.error || 'Server error'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Terjadi kesalahan saat menghapus');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateNew = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await onSaveAsNewTemplate?.(newTitle.trim());
      setIsSavingNew(false);
      setNewTitle('');
      await fetchList();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <FolderKanban size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Katalog Template & Denah Pameran
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {templates.length} Tersimpan
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Pilih denah yang ingin diedit atau tentukan template mana yang sedang aktif dipublikasikan ke publik.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({templates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('published')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'published' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Dipublikasikan ({publishedCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('draft')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'draft' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Draft ({draftCount})
            </button>
          </div>

          {/* Search & Create New Button */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 sm:w-56"
              />
            </div>
            
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewTemplateModal?.();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Buat Template Baru dari Kanvas Kosong atau Preset Layout"
            >
              <Plus size={14} />
              <span>+ Buat Baru (Preset/Blank)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSavingNew(!isSavingNew)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
              title="Simpan kondisi kanvas saat ini sebagai template terpisah"
            >
              <Copy size={13} className="text-slate-300" />
              <span>Simpan Kanvas Ini Sebagai Baru</span>
            </button>
          </div>
        </div>

        {/* Save As New Template Form Prompt */}
        {isSavingNew && (
          <form onSubmit={handleCreateNew} className="p-4 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center gap-3 animate-fadeIn">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                Beri Nama Template Denah Baru:
              </label>
              <input
                type="text"
                placeholder="Contoh: Denah Hall B - 40 Booth, Template Pameran Otomotif..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Simpan Template
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSavingNew(false);
                  setNewTitle('');
                }}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Template List Cards */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RefreshCw size={24} className="animate-spin mx-auto text-blue-500" />
              <p className="text-xs font-medium">Memuat katalog template denah...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
              <FolderKanban size={36} className="mx-auto text-slate-300 mb-2" />
              <h3 className="text-sm font-bold text-slate-700">Tidak ada template ditemukan</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchQuery ? 'Coba sesuaikan kata kunci pencarian Anda.' : 'Klik tombol "+ Simpan Denah Ini Sebagai Template Baru" di atas untuk membuat template pertama Anda.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((item) => {
                const isCurrentActive = currentFloorplanId === item.id;
                const isActionLoading = actionLoadingId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border p-4.5 transition-all shadow-xs flex flex-col justify-between relative ${
                      item.is_published 
                        ? 'border-emerald-300 ring-2 ring-emerald-500/20 bg-emerald-50/10' 
                        : (isCurrentActive ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300 hover:shadow-md')
                    }`}
                  >
                    <div>
                      {/* Top Header Card */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm truncate" title={item.title}>
                              {item.title}
                            </h3>
                            {isCurrentActive && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-200 shrink-0">
                                Di Editor
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock size={11} /> {new Date(item.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {item.has_blueprint && (
                              <span className="flex items-center gap-0.5 text-indigo-600 font-medium">
                                • <ImageIcon size={11} /> Blueprint
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {item.is_published ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.8 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              LIVE (Aktif)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.8 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              <FileText size={10} />
                              Draft
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-4 gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100 mb-3 text-center">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">Total</span>
                          <span className="text-sm font-bold text-slate-800">{item.totalBooths}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-emerald-600 block font-semibold">Tersedia</span>
                          <span className="text-sm font-bold text-emerald-600">{item.availableBooths}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-rose-600 block font-semibold">Terjual</span>
                          <span className="text-sm font-bold text-rose-600">{item.soldBooths}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-amber-600 block font-semibold">Reserved</span>
                          <span className="text-sm font-bold text-amber-600">{item.reservedBooths}</span>
                        </div>
                      </div>

                      {/* Revenue Summary */}
                      <div className="flex items-center justify-between text-xs mb-4 px-1">
                        <span className="text-slate-500 text-[11px]">Potensi Revenue:</span>
                        <span className="font-bold text-emerald-700 font-mono text-xs">
                          Rp {(item.totalRevenue || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {/* Open in editor */}
                      <button
                        type="button"
                        onClick={() => {
                          onLoadTemplate?.(item.id);
                          onClose();
                        }}
                        className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                        title="Muat denah ini ke layar editor untuk diedit"
                      >
                        <FolderOpen size={13} className="text-blue-600" />
                        <span>Buka di Editor</span>
                      </button>

                      {/* Publish / Set as Active Live */}
                      {item.is_published ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.public_slug && (
                            <>
                              <button type="button" onClick={() => handleCopyLink(item)}
                                className="py-1.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center gap-1 border border-emerald-200 max-w-[220px]"
                                title="Salin link publik denah ini">
                                <Link2 size={12} className="shrink-0" />
                                <span className="truncate font-mono">/live/{item.public_slug}</span>
                              </button>
                              <a href={`/live/${item.public_slug}`} target="_blank" rel="noreferrer"
                                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200" title="Buka link publik">
                                <ExternalLink size={13} />
                              </a>
                            </>
                          )}
                          <button type="button" disabled={isActionLoading} onClick={() => handleUnpublish(item)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 disabled:opacity-50" title="Hentikan publikasi (jadikan draft)">
                            <PauseCircle size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handlePublish(item)}
                          className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          title="Tayangkan denah ini di link publiknya sendiri (denah lain yang live tetap tayang)"
                        >
                          <Globe size={13} />
                          <span>Publish Denah Ini</span>
                        </button>
                      )}

                      {/* Preset, Duplicate & Delete icons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleSaveAsPreset(item)}
                          className="px-2 py-1 text-slate-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                          title="Simpan denah ini sebagai Preset Layout baru"
                        >
                          <LayoutTemplate size={12} className="text-purple-600" />
                          <span>Preset</span>
                        </button>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleDuplicate(item)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Duplikasi template ini"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus template ini"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Template dengan status <b>LIVE</b> adalah yang otomatis ditampilkan saat pengunjung membuka portal registrasi booth.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
