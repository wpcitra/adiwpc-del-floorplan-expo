import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Download, 
  Image as ImageIcon, 
  Trash2,
  Eye,
  Save,
  CheckCircle2,
  Globe,
  FolderKanban,
  PlusCircle,
  FileText,
  Tag,
  Zap,
  Loader2,
  Clock,
  Edit2,
  Check,
  X,
  MapPin,
  LayoutTemplate,
  Building2,
  Layers,
  HardHat
} from 'lucide-react';

export default function TopNavbar({
  onOpenBlueprintModal,
  hasBlueprint,
  onOpenTemplatesModal,
  // Read-only Studio (Sales): no editing / saving / publishing controls, only viewing, switching project and export
  readOnly = false,
  onOpenNewTemplateModal,
  onOpenInvoiceModal,
  onOpenCategoryModal,
  currentFloorplanTitle,
  currentFloorplanVenue = '',
  currentFloorplanStatus,
  currentFloorplanId,
  currentEvent,
  allEvents = [],
  siblingHalls = [],
  onSelectEvent,
  onSelectHall,
  onOpenCreateHall,
  onUpdateFloorplanTitle,
  onUpdateFloorplanVenue,
  onOpenExportModal,
  onOpenPublishModal,
  onSaveDraft,
  saveStatus = 'saved',
  autoSaveEnabled = true,
  onToggleAutoSave,
  onNewFloorplan,
  onSaveAsPreset,
  isPreviewMode,
  onTogglePreviewMode,
  // Denah Operasional: read-only overlay toggle (Admin & Sales) and switch to the operations mode (Admin)
  opsLayerVisible = false,
  onToggleOpsLayer,
  onOpenOpsMode
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(currentFloorplanTitle || '');

  const [isEditingVenue, setIsEditingVenue] = useState(false);
  const [venueInput, setVenueInput] = useState(currentFloorplanVenue || '');

  useEffect(() => {
    setTitleInput(currentFloorplanTitle || '');
  }, [currentFloorplanTitle]);

  useEffect(() => {
    setVenueInput(currentFloorplanVenue || '');
  }, [currentFloorplanVenue]);

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== currentFloorplanTitle) {
      if (onUpdateFloorplanTitle) {
        onUpdateFloorplanTitle(trimmed);
      }
    }
    setIsEditingTitle(false);
  };

  const handleSaveVenue = () => {
    const trimmed = venueInput.trim();
    if (trimmed && trimmed !== currentFloorplanVenue) {
      if (onUpdateFloorplanVenue) {
        onUpdateFloorplanVenue(trimmed);
      }
    }
    setIsEditingVenue(false);
  };

  return (
    <header className="h-14 bg-slate-900 text-white border-b border-slate-800 flex items-center px-3 sm:px-4 justify-between select-none z-30 shadow-md relative w-full min-w-0 overflow-hidden">
      {/* 1. Left Section: Logo & Event / Template Info */}
      <div className="flex items-center gap-2.5 min-w-0 shrink">
        <div className="w-8 h-8 bg-slate-800 text-slate-100 border border-slate-700/80 rounded-lg flex items-center justify-center shrink-0">
          <LayoutDashboard size={16} className="text-slate-200" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-semibold text-slate-100 text-xs sm:text-sm tracking-tight truncate">Floorplan Studio</h1>
            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700/80 shrink-0">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
            {/* Project Title (Editable) */}
            {isEditingTitle ? (
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitleInput(currentFloorplanTitle || '');
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="bg-slate-800 text-white border border-blue-500 text-xs px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-medium w-32 sm:w-44"
                  placeholder="Nama Project..."
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer"
                  title="Simpan Nama Project"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(currentFloorplanTitle || '');
                    setIsEditingTitle(false);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors cursor-pointer"
                  title="Batal"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group shrink-0">
                <span 
                  className="text-slate-200 font-semibold truncate max-w-[100px] sm:max-w-[160px] cursor-pointer hover:text-blue-300 transition-colors" 
                  title={`Klik untuk edit nama project (${currentFloorplanTitle})`}
                  onClick={() => !readOnly && setIsEditingTitle(true)}
                >
                  {currentFloorplanTitle || 'Denah Utama'}
                </span>
                <button
                  type="button"
                  onClick={() => !readOnly && setIsEditingTitle(true)}
                  className="p-0.5 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                  title="Edit Nama Project"
                >
                  <Edit2 size={11} />
                </button>
              </div>
            )}

            <span>•</span>

            {/* Venue Location (Editable) */}
            {isEditingVenue ? (
              <div className="flex items-center gap-1 shrink-0">
                <MapPin size={11} className="text-indigo-400 shrink-0" />
                <input
                  type="text"
                  value={venueInput}
                  onChange={(e) => setVenueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveVenue();
                    if (e.key === 'Escape') {
                      setVenueInput(currentFloorplanVenue || '');
                      setIsEditingVenue(false);
                    }
                  }}
                  autoFocus
                  className="bg-slate-800 text-white border border-indigo-500 text-xs px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 font-medium w-36 sm:w-52"
                  placeholder="Lokasi / Venue Gedung..."
                />
                <button
                  type="button"
                  onClick={handleSaveVenue}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer"
                  title="Simpan Lokasi / Venue Gedung"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVenueInput(currentFloorplanVenue || '');
                    setIsEditingVenue(false);
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors cursor-pointer"
                  title="Batal"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group shrink-0">
                <MapPin size={11} className="text-indigo-400 shrink-0" />
                <span 
                  className="text-slate-300 font-medium truncate max-w-[100px] sm:max-w-[160px] cursor-pointer hover:text-indigo-300 transition-colors" 
                  title={`Klik untuk edit lokasi venue (${currentFloorplanVenue})`}
                  onClick={() => !readOnly && setIsEditingVenue(true)}
                >
                  {currentFloorplanVenue || 'Tambah Lokasi Venue...'}
                </span>
                <button
                  type="button"
                  onClick={() => !readOnly && setIsEditingVenue(true)}
                  className="p-0.5 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                  title="Edit Lokasi / Venue Gedung"
                >
                  <Edit2 size={11} />
                </button>
              </div>
            )}

            <span>•</span>
            <span className={`shrink-0 ${currentFloorplanStatus === 'published' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-medium'}`}>
              {currentFloorplanStatus === 'published' ? '🟢 Live' : '📝 Draft'}
            </span>
            <span>•</span>
            <div className="flex items-center gap-1 shrink-0">
              {saveStatus === 'saving' ? (
                <span className="text-amber-400 flex items-center gap-1 font-medium animate-pulse">
                  <Loader2 size={11} className="animate-spin" /> Otosafe...
                </span>
              ) : saveStatus === 'unsaved' ? (
                <span className="text-amber-400/90 flex items-center gap-1 font-medium">
                  <Clock size={11} /> Ada perubahan
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 size={11} /> Tersimpan
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1.5 Middle Section: Project Switcher */}
      {allEvents && allEvents.length > 1 && (
        <div className="hidden md:flex items-center gap-2 mx-2 min-w-0">
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 shrink-0 shadow-2xs">
            <Building2 size={13} className="text-blue-400 shrink-0" />
            <select
              value={currentEvent?.id || ''}
              onChange={(e) => onSelectEvent && onSelectEvent(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              title="Pilih Project Event"
            >
              {allEvents.map((evt) => (
                <option key={evt.id} value={evt.id} className="bg-slate-900 text-white">
                  🏢 {evt.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 2. Right Section: Action Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {!readOnly && (<>
        {/* Template Catalog Button */}
        <button
          type="button"
          onClick={onOpenTemplatesModal}
          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer border border-indigo-500/40"
          title="Buka Katalog Template Denah & Pilih Denah yang Ingin Di-publish"
        >
          <FolderKanban size={13} />
          <span>Template</span>
        </button>

        {/* Category & Tier Manager Button */}
        <button
          type="button"
          onClick={() => {
            if (onOpenCategoryModal) onOpenCategoryModal();
            else window.location.href = '/admin/settings?tab=categories';
          }}
          className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-violet-600/20 transition-all active:scale-95 cursor-pointer border border-violet-500/40"
          title="Pengaturan Kategori, Ukuran Standar & Tier Harga Booth"
        >
          <Tag size={13} />
          <span>Tier Harga</span>
        </button>

        {/* Save as Preset Button */}
        <button
          type="button"
          onClick={onSaveAsPreset}
          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all active:scale-95 cursor-pointer border border-purple-500/40"
          title="Simpan denah kanvas saat ini sebagai Preset Layout baru"
        >
          <LayoutTemplate size={13} />
          <span>Jadikan Preset</span>
        </button>



        {/* Import Blueprint Button */}
        <button
          type="button"
          onClick={onOpenBlueprintModal}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            hasBlueprint
              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/50'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
          title="Unggah Gambar / PDF Denah Gedung"
        >
          <ImageIcon size={13} className={hasBlueprint ? 'text-indigo-400' : 'text-slate-400'} />
          <span>Blueprint</span>
          {hasBlueprint && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>}
        </button>

        {/* Save Draft & Auto-Save Toggle */}
        <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 p-0.5 shadow-xs">
          <button
            type="button"
            onClick={() => onSaveDraft(false)}
            className="px-2.5 py-1 text-slate-200 hover:text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Simpan perubahan manual ke database"
          >
            <Save size={13} className={saveStatus === 'saving' ? 'text-amber-400 animate-spin' : 'text-slate-400'} />
            <span>Simpan</span>
          </button>
          
          <button
            type="button"
            onClick={onToggleAutoSave}
            className={`px-1.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
              autoSaveEnabled 
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/90' 
                : 'bg-slate-700/60 text-slate-400 border-slate-600 hover:text-slate-200'
            }`}
            title={autoSaveEnabled ? 'Auto-Save Aktif (Tersimpan otomatis 2.5s setelah diedit)' : 'Auto-Save Dinonaktifkan (Klik untuk mengaktifkan auto-save)'}
          >
            <Zap size={10} className={autoSaveEnabled ? 'text-emerald-400 fill-emerald-400' : 'text-slate-500'} />
            <span>{autoSaveEnabled ? 'Auto' : 'Off'}</span>
          </button>
        </div>

        {/* Save & Publish Button */}
        <button
          type="button"
          onClick={onOpenPublishModal}
          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
          title="Simpan ke database dan publikasikan ke portal tenant"
        >
          <Globe size={13} />
          <span>Publish</span>
        </button>

        </>)}

        {/* Export Layout Button */}
        <button
          type="button"
          onClick={onOpenExportModal}
          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
          title="Ekspor ke JSON, SVG, atau PNG"
        >
          <Download size={13} />
          <span>Export</span>
        </button>

        {/* Operational layer (read-only here) & switch to Denah Operasional */}
        {onToggleOpsLayer && (
          <button
            type="button"
            onClick={onToggleOpsLayer}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
              opsLayerVisible
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
            title={opsLayerVisible ? 'Sembunyikan Lapisan Operasional' : 'Tampilkan Lapisan Operasional (hanya-baca)'}
            aria-pressed={opsLayerVisible}
          >
            <Layers size={13} />
            <span className="hidden xl:inline">Lapisan Ops</span>
          </button>
        )}
        {onOpenOpsMode && (
          <button
            type="button"
            onClick={onOpenOpsMode}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-500/50 bg-slate-800 text-amber-300 hover:bg-amber-500 hover:text-slate-950 text-[11px] font-semibold transition-colors cursor-pointer"
            title="Buka Denah Operasional untuk denah ini"
          >
            <HardHat size={13} />
            <span className="hidden xl:inline">Denah Operasional</span>
          </button>
        )}

        {!readOnly && (<>
        {/* Preview Mode Switcher */}
        <button
          type="button"
          onClick={onTogglePreviewMode}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            isPreviewMode 
              ? 'bg-emerald-600 text-white border-emerald-500' 
              : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
          }`}
          title={isPreviewMode ? 'Keluar dari Mode Preview' : 'Pratinjau Tampilan Tenant'}
        >
          <Eye size={15} />
        </button>

        {/* New Template / Floorplan Modal Trigger */}
        <button
          type="button"
          onClick={onOpenNewTemplateModal || onNewFloorplan}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
          title="Buat Template Denah Baru (Kanvas Kosong atau Preset Layout)"
        >
          <PlusCircle size={13} />
          <span>+ Buat Baru</span>
        </button>
        </>)}
      </div>
    </header>
  );
}
