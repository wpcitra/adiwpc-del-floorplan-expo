import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  X, 
  LayoutTemplate, 
  Layers, 
  Copy, 
  FilePlus, 
  Globe, 
  FileText,
  Check,
  Trash2,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Building2,
  Calendar,
  Sparkles
} from 'lucide-react';
import { api } from '../../services/api';
import { getProjectDateInfo } from './ProjectYearFolderSelector';

const DEFAULT_STATIC_PRESETS = [
  {
    id: 'blank',
    key: 'blank',
    title: 'Kanvas Kosong (Blank)',
    desc: 'Mulai dari kanvas bersih dengan grid 1 meter untuk mendesain denah dari nol.',
    icon: <FilePlus size={22} className="text-slate-500" />,
    tag: 'Kanvas Bersih',
    isSystem: true
  },
  {
    id: 'duplicate',
    key: 'duplicate',
    title: 'Salin dari Template Lain',
    desc: 'Gunakan denah yang sudah pernah dibuat sebelumnya sebagai titik awal.',
    icon: <Copy size={22} className="text-indigo-500" />,
    tag: 'Duplikasi',
    isSystem: true
  }
];

export default function NewTemplateModal({
  isOpen,
  onClose,
  onCreateTemplate,
  showToast
}) {
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('Jakarta Convention Center (Hall A)');
  const [presetType, setPresetType] = useState('blank'); // 'blank' | 'duplicate' | custom preset id
  const [selectedSourceId, setSelectedSourceId] = useState('');
  // Also copy the source's Denah Operasional layer (ops elements); booth operations data stays with the source
  const [copyOpsLayer, setCopyOpsLayer] = useState(false);
  const [existingTemplates, setExistingTemplates] = useState([]);
  const [presets, setPresets] = useState(DEFAULT_STATIC_PRESETS);
  const [status, setStatus] = useState('draft'); // 'draft' | 'published'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & folder state for template duplicate selection
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [openFolders, setOpenFolders] = useState(() => {
    const currentYear = new Date().getFullYear().toString();
    return { [currentYear]: true };
  });

  const loadPresetLayouts = async () => {
    try {
      const dbPresets = await api.fetchPresetLayouts();
      if (dbPresets && Array.isArray(dbPresets) && dbPresets.length > 0) {
        const combined = [...DEFAULT_STATIC_PRESETS];
        dbPresets.forEach(p => {
          // Only include valid presets and ignore any legacy deleted presets
          if (['standard', 'jobfair', 'tech_mega'].includes(p.key || p.id)) return;
          if (!combined.some(c => c.id === p.id || c.key === p.key)) {
            combined.push({
              id: p.id,
              key: p.key || p.id,
              title: p.title,
              desc: p.description || p.desc || 'Preset layout kustom pilihan admin',
              icon: <LayoutTemplate size={22} className="text-purple-500" />,
              tag: p.tag || 'Preset Custom',
              isSystem: Boolean(p.is_system || p.isSystem),
              fabricJson: p.fabricJson,
              metadata: p.metadata
            });
          }
        });
        setPresets(combined);
      }
    } catch (e) {
      console.warn("Failed to load preset layouts:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTitle(`Denah Pameran ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`);
      setVenue('Jakarta Convention Center (Hall A)');
      setPresetType('blank');
      setStatus('draft');
      setIsSubmitting(false);
      setTemplateSearchQuery('');

      loadPresetLayouts();

      // Load existing templates for duplicate option
      api.fetchFloorplanList().then(list => {
        const templatesList = list || [];
        setExistingTemplates(templatesList);
        if (templatesList.length > 0) {
          setSelectedSourceId(templatesList[0].id);
        }
      });
    }
  }, [isOpen]);

  // Group templates by year using getProjectDateInfo
  const templatesByYear = useMemo(() => {
    const groups = {};
    const q = templateSearchQuery.trim().toLowerCase();

    const filtered = existingTemplates.filter(t => {
      if (!q) return true;
      return (
        (t.title || '').toLowerCase().includes(q) ||
        (t.venue || '').toLowerCase().includes(q) ||
        (t.event_title || '').toLowerCase().includes(q)
      );
    });

    filtered.forEach(t => {
      const dateInfo = getProjectDateInfo(t);
      const year = dateInfo.year || 'Tanpa Tahun';
      if (!groups[year]) groups[year] = [];
      groups[year].push({ ...t, dateInfo });
    });

    return groups;
  }, [existingTemplates, templateSearchQuery]);

  // Sort years: newest first, "Tanpa Tahun" at the bottom
  const sortedYears = useMemo(() => {
    const years = Object.keys(templatesByYear);
    return years.sort((a, b) => {
      if (a === 'Tanpa Tahun') return 1;
      if (b === 'Tanpa Tahun') return -1;
      return Number(b) - Number(a);
    });
  }, [templatesByYear]);

  // Auto-expand folder if searching
  useEffect(() => {
    if (templateSearchQuery.trim()) {
      const allOpen = {};
      sortedYears.forEach(y => {
        allOpen[y] = true;
      });
      setOpenFolders(allOpen);
    }
  }, [templateSearchQuery, sortedYears]);

  const toggleFolder = (year) => {
    setOpenFolders(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };

  if (!isOpen) return null;

  const handleDeletePreset = async (presetItem, e) => {
    e.stopPropagation();
    if (!window.confirm(`Apakah Anda yakin ingin menghapus preset layout "${presetItem.title}"?`)) {
      return;
    }

    try {
      const res = await api.deletePresetLayout(presetItem.id);
      if (res.success) {
        showToast?.(`🗑️ Preset layout "${presetItem.title}" berhasil dihapus`);
        setPresets(prev => prev.filter(p => p.id !== presetItem.id));
        if (presetType === presetItem.id) {
          setPresetType('blank');
        }
      } else {
        showToast?.(`⚠️ Gagal menghapus preset: ${res.error || 'Server error'}`);
      }
    } catch (err) {
      showToast?.('⚠️ Gagal menghapus preset layout');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedPresetObj = presets.find(p => p.id === presetType || p.key === presetType);

      await onCreateTemplate({
        title: title.trim(),
        venue: venue.trim(),
        presetType: selectedPresetObj?.key || presetType,
        presetObj: selectedPresetObj,
        sourceId: selectedSourceId,
        copyOpsLayer: presetType === 'duplicate' && copyOpsLayer,
        status
      });
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('⚠️ Gagal membuat template baru');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl sm:max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <PlusCircle size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold">Buat Template Denah Baru</h2>
              <p className="text-xs text-slate-300">Tentukan nama pameran dan pilih titik awal denah kanvas Anda.</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {/* 1. Template Title & Venue */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama / Judul Template Denah <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Indonesia International Auto Show 2026, Job Fair Hall B..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Lokasi / Venue Gedung
              </label>
              <input
                type="text"
                placeholder="Contoh: Jakarta Convention Center (Hall A)"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 2. Choose Starting Layout (Pilih Titik Awal Denah) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Titik Awal Denah
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presets.map((p) => {
                const isSelected = presetType === p.id || presetType === p.key;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPresetType(p.id)}
                    className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 relative group ${
                      isSelected 
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-500' 
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-slate-100 shrink-0 mt-0.5">
                      {p.icon}
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">
                          {p.title}
                        </h4>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-semibold shrink-0">
                          {p.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {p.desc}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 absolute top-3 right-3">
                      {!p.isSystem && (
                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(p, e)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Hapus Preset Layout ini"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* If duplicate selected, show template selector grouped by year with search */}
          {presetType === 'duplicate' && (
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-200/80 space-y-3 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Layers size={14} className="text-indigo-600" />
                    Pilih Denah Sumber untuk Diduplikasi
                  </h3>
                  <p className="text-[11px] text-indigo-700/80">
                    Semua booth, partisi, panggung, dan tata letak akan disalin ke template baru Anda.
                  </p>
                </div>

                {/* Search box for templates */}
                <div className="relative min-w-[200px] sm:min-w-[240px]">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari denah..."
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-7 py-1.5 bg-white border border-indigo-200 focus:border-indigo-500 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 shadow-2xs"
                  />
                  {templateSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTemplateSearchQuery('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Yearly Folder Accordion for Templates */}
              {existingTemplates.length === 0 ? (
                <div className="p-6 bg-white rounded-xl border border-dashed border-indigo-200 text-center text-xs text-slate-500">
                  Belum ada template denah lain yang tersedia untuk disalin.
                </div>
              ) : sortedYears.length === 0 ? (
                <div className="p-6 bg-white rounded-xl border border-dashed border-indigo-200 text-center text-xs text-slate-500">
                  Tidak ada template yang cocok dengan kata kunci "{templateSearchQuery}".
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {sortedYears.map((year) => {
                    const yearTemplates = templatesByYear[year] || [];
                    const isOpen = Boolean(openFolders[year]);

                    return (
                      <div 
                        key={year} 
                        className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-2xs transition-all"
                      >
                        {/* Folder Header */}
                        <div
                          onClick={() => toggleFolder(year)}
                          className="px-3 py-2.5 bg-slate-50/80 hover:bg-indigo-50/60 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <FolderOpen size={16} className="text-indigo-600" />
                            ) : (
                              <Folder size={16} className="text-slate-500" />
                            )}
                            <span className="text-xs font-bold text-slate-800">
                              {year === 'Tanpa Tahun' ? 'Tanpa Tahun' : `Tahun ${year}`}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-indigo-100/70 text-indigo-700">
                              {yearTemplates.length} Template
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-slate-400">
                            <span className="text-[10px]">
                              {isOpen ? 'Tutup' : 'Buka'}
                            </span>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                        </div>

                        {/* Folder Contents */}
                        {isOpen && (
                          <div className="p-2 space-y-1.5 bg-white divide-y divide-slate-100">
                            {yearTemplates.map((item) => {
                              const isPicked = selectedSourceId === item.id;
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => setSelectedSourceId(item.id)}
                                  className={`p-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                    isPicked
                                      ? 'bg-indigo-50/90 border border-indigo-300 ring-1 ring-indigo-400/30'
                                      : 'hover:bg-slate-50 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                    {/* Radio Indicator */}
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                      isPicked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                                    }`}>
                                      {isPicked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>

                                    {/* Template Details */}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-xs font-bold text-slate-900 leading-snug">
                                          {item.title}
                                        </h4>
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                          item.is_published
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                                        }`}>
                                          {item.is_published ? '🟢 Live' : '⚪ Draft'}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                                        <span className="flex items-center gap-1 truncate max-w-[200px]" title={item.venue || 'Venue Belum Ditentukan'}>
                                          <Building2 size={11} className="text-slate-400 shrink-0" />
                                          {item.venue || 'Venue Belum Ditentukan'}
                                        </span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 text-slate-400 shrink-0">
                                          <Calendar size={11} />
                                          {item.dateInfo?.formattedDate || 'Tanggal tidak diset'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Booth Count Badge */}
                                  <div className="shrink-0 text-right">
                                    <span className="text-xs font-bold text-slate-800 block">
                                      {item.totalBooths || 0} Booth
                                    </span>
                                    <span className="text-[10px] text-indigo-600 font-semibold">
                                      {isPicked ? '✓ Terpilih' : 'Pilih'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-amber-200 text-[11px] text-slate-700 cursor-pointer">
                <input type="checkbox" checked={copyOpsLayer} onChange={(e) => setCopyOpsLayer(e.target.checked)} className="mt-0.5 accent-amber-500" />
                <span>
                  <b className="text-slate-900">Salin juga Lapisan Operasional</b><br />
                  Elemen tim operasional (titik listrik, CCTV, APAR, dll) ikut disalin beserta tempelannya ke booth. Data setup per booth tidak ikut disalin.
                </span>
              </label>
            </div>
          )}

          {/* 3. Initial Publication Status */}
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Status Awal Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  status === 'draft' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-400' : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={status === 'draft'}
                  onChange={() => setStatus('draft')}
                  className="accent-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText size={13} className="text-slate-500" /> Simpan sebagai Draft
                  </div>
                  <div className="text-[10px] text-slate-500">Edit bebas tanpa memengaruhi portal live</div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  status === 'published' ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-400' : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={status === 'published'}
                  onChange={() => setStatus('published')}
                  className="accent-emerald-600"
                />
                <div>
                  <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <Globe size={13} className="text-emerald-600" /> Langsung Publikasikan
                  </div>
                  <div className="text-[10px] text-emerald-600">Jadikan denah resmi yang tayang untuk umum</div>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Submit Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle size={15} />
              <span>{isSubmitting ? 'Membuat Denah...' : 'Buat & Buka di Editor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
