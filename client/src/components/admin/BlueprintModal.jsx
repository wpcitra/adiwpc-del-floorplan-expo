import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  X, 
  Eye, 
  Lock, 
  Unlock, 
  Image as ImageIcon, 
  Sliders, 
  CheckCircle, 
  Trash2, 
  AlertTriangle, 
  Calendar, 
  HardDrive, 
  Sparkles,
  Layers,
  RefreshCw
} from 'lucide-react';

// Sample SVG architectural floorplan blueprint (JCC Convention Hall)
export const SAMPLE_JCC_BLUEPRINT = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="%23f8fafc" stroke="%2394a3b8" stroke-width="4"/>
  <!-- Outer Hall Walls -->
  <rect x="40" y="40" width="1120" height="720" fill="none" stroke="%23334155" stroke-width="6"/>
  <!-- Hall Entrance & Exits -->
  <rect x="520" y="32" width="160" height="16" fill="%2310b981"/>
  <text x="600" y="24" font-family="sans-serif" font-size="12" font-weight="bold" fill="%23047857" text-anchor="middle">MAIN ENTRANCE / LOBBY</text>
  
  <!-- Stage Area Outline -->
  <rect x="100" y="100" width="1000" height="140" fill="%23e2e8f0" stroke="%2364748b" stroke-dasharray="8 6" stroke-width="2"/>
  <text x="600" y="175" font-family="sans-serif" font-size="20" font-weight="bold" fill="%23475569" text-anchor="middle">MAIN STAGE & EXHIBITOR PRESENTATION ZONE</text>
  
  <!-- Hall Pillars -->
  <circle cx="250" cy="380" r="16" fill="%2364748b"/>
  <circle cx="600" cy="380" r="16" fill="%2364748b"/>
  <circle cx="950" cy="380" r="16" fill="%2364748b"/>
  <circle cx="250" cy="580" r="16" fill="%2364748b"/>
  <circle cx="600" cy="580" r="16" fill="%2364748b"/>
  <circle cx="950" cy="580" r="16" fill="%2364748b"/>
  
  <!-- Restroom & Cafe zones -->
  <rect x="60" y="660" width="220" height="80" fill="%23e0f2fe" stroke="%230284c7" stroke-width="2"/>
  <text x="170" y="705" font-family="sans-serif" font-size="14" font-weight="bold" fill="%230369a1" text-anchor="middle">RESTROOMS & VIP LOUNGE</text>
  
  <rect x="920" y="660" width="220" height="80" fill="%23fef3c7" stroke="%23d97706" stroke-width="2"/>
  <text x="1030" y="705" font-family="sans-serif" font-size="14" font-weight="bold" fill="%23b45309" text-anchor="middle">CAFE & FOOD COURT</text>
  
  <!-- Scale Bar -->
  <line x1="950" y1="760" x2="1130" y2="760" stroke="%230f172a" stroke-width="3"/>
  <text x="1040" y="750" font-family="sans-serif" font-size="11" fill="%230f172a" text-anchor="middle">SCALE: 10 METERS</text>
</svg>`;

// Helper: Format byte sizes nicely
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (typeof bytes === 'string' && (bytes.includes('KB') || bytes.includes('MB'))) return bytes;
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

// Helper: Format dates in Indonesian format
function formatDateIndo(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB';
  } catch (e) {
    return null;
  }
}

export default function BlueprintModal({ isOpen, onClose, onApplyBlueprint, currentBlueprint }) {
  // Working state
  const [imageUrl, setImageUrl] = useState('');
  const [sourceType, setSourceType] = useState(null); // 'sample' | 'upload' | null
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(null);
  const [uploadedAt, setUploadedAt] = useState(null);
  const [opacity, setOpacity] = useState(0.35);
  const [scale, setScale] = useState(1);
  const [isLocked, setIsLocked] = useState(true);

  // Initial snapshot to detect changes
  const [initialState, setInitialState] = useState(null);

  // Delete confirmation modal state
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Synchronize state only when the modal opens. currentBlueprint is a fresh object on every
  // parent render, so depending on it would reset in-progress edits (e.g. the lock toggle).
  useEffect(() => {
    if (isOpen) {
      setIsConfirmingDelete(false);
      if (currentBlueprint && currentBlueprint.url) {
        const isSample = currentBlueprint.sourceType === 'sample' || 
          currentBlueprint.url.startsWith('data:image/svg') || 
          currentBlueprint.url.includes('JCC');
        
        const init = {
          url: currentBlueprint.url,
          sourceType: isSample ? 'sample' : (currentBlueprint.sourceType || 'upload'),
          name: currentBlueprint.name || (isSample ? 'Contoh Denah – JCC Convention Hall' : (currentBlueprint.fileName || 'File Cetak Biru')),
          fileName: currentBlueprint.fileName || (isSample ? 'jcc-convention-hall.svg' : 'blueprint.png'),
          fileSize: currentBlueprint.fileSize || (isSample ? '12 KB' : null),
          uploadedAt: currentBlueprint.uploadedAt || null,
          opacity: currentBlueprint.opacity ?? 0.35,
          scale: currentBlueprint.scale ?? 1,
          isLocked: currentBlueprint.isLocked ?? true
        };

        setImageUrl(init.url);
        setSourceType(init.sourceType);
        setFileName(init.fileName);
        setFileSize(init.fileSize);
        setUploadedAt(init.uploadedAt);
        setOpacity(init.opacity);
        setScale(init.scale);
        setIsLocked(init.isLocked);
        setInitialState(init);
      } else {
        // Empty state
        setImageUrl('');
        setSourceType(null);
        setFileName('');
        setFileSize(null);
        setUploadedAt(null);
        setOpacity(0.35);
        setScale(1);
        setIsLocked(true);
        setInitialState(null);
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Change detection
  const hasChanges = (() => {
    if (!initialState && !imageUrl) return false;
    if (!initialState && imageUrl) return true;
    if (initialState && !imageUrl) return true;
    
    // Both exist, check fields
    if (imageUrl !== initialState.url) return true;
    if (sourceType !== initialState.sourceType) return true;
    if (Math.abs(parseFloat(opacity) - parseFloat(initialState.opacity)) > 0.01) return true;
    if (Math.abs(parseFloat(scale) - parseFloat(initialState.scale)) > 0.01) return true;
    if (Boolean(isLocked) !== Boolean(initialState.isLocked)) return true;

    return false;
  })();

  const hasActiveBlueprint = Boolean(initialState && initialState.url);

  // Switch to sample blueprint
  const loadSampleBlueprint = () => {
    setImageUrl(SAMPLE_JCC_BLUEPRINT);
    setSourceType('sample');
    setFileName('jcc-convention-hall.svg');
    setFileSize('12 KB');
    setUploadedAt(null);
  };

  // Switch to user uploaded file
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target.result);
      setSourceType('upload');
      setFileName(file.name);
      setFileSize(file.size);
      setUploadedAt(new Date().toISOString());
    };
    reader.readAsDataURL(file);
    // Reset file input target value so the same file can be re-selected if desired
    e.target.value = '';
  };

  // Apply changes to canvas
  const handleSave = () => {
    if (!hasChanges) return;

    if (!imageUrl) {
      onApplyBlueprint(null);
      onClose();
      return;
    }

    const isSample = sourceType === 'sample';
    onApplyBlueprint({
      url: imageUrl,
      name: isSample ? 'Contoh Denah – JCC Convention Hall' : (fileName || 'File Cetak Biru'),
      sourceType: isSample ? 'sample' : 'upload',
      fileName: fileName || (isSample ? 'jcc-convention-hall.svg' : 'blueprint.png'),
      fileSize: fileSize,
      uploadedAt: uploadedAt || (isSample ? null : new Date().toISOString()),
      opacity: parseFloat(opacity),
      scale: parseFloat(scale),
      isLocked: Boolean(isLocked)
    });
    onClose();
  };

  // Delete blueprint action
  const handleConfirmDelete = () => {
    setImageUrl('');
    setSourceType(null);
    setFileName('');
    setFileSize(null);
    setUploadedAt(null);
    setInitialState(null);
    setIsConfirmingDelete(false);
    onApplyBlueprint(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col my-auto transition-all">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Import Cetak Biru (Blueprint Denah)</h3>
              <p className="text-xs text-slate-500">Pasang blueprint gedung sebagai panduan transparan di latar belakang kanvas</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/80 transition-colors"
            title="Tutup (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-140px)] overflow-y-auto">

          {/* Section: Blueprint Aktif (hanya tampil jika blueprint sudah terpasang) */}
          {hasActiveBlueprint && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-white relative overflow-hidden shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Blueprint Aktif di Kanvas</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {initialState.sourceType === 'sample' ? 'Contoh Bawaan' : 'File Unggahan'}
                </span>
              </div>

              <div className="flex items-center gap-3.5">
                {/* Thumbnail Preview */}
                <div className="w-20 h-16 rounded-lg bg-slate-950 border border-slate-700/80 overflow-hidden flex-shrink-0 flex items-center justify-center p-1 relative">
                  <img 
                    src={initialState.url} 
                    alt="Active Blueprint" 
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none"></div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-slate-100 truncate" title={initialState.name}>
                    {initialState.name || 'Blueprint Denah Gedung'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                    {initialState.sourceType === 'upload' && initialState.fileSize && (
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <HardDrive size={12} className="text-slate-500" />
                        {formatFileSize(initialState.fileSize)}
                      </span>
                    )}
                    {initialState.sourceType === 'upload' && initialState.uploadedAt && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <Calendar size={12} className="text-slate-500" />
                        {formatDateIndo(initialState.uploadedAt)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Eye size={12} className="text-slate-500" />
                      Transparansi {Math.round(initialState.opacity * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Sliders size={12} className="text-slate-500" />
                      Skala {Math.round(initialState.scale * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Pilih Sumber Blueprint */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {hasActiveBlueprint ? 'Ganti / Pilih Sumber Blueprint' : 'Pilih Sumber Blueprint'}
              </label>
              {sourceType && (
                <span className="text-[11px] font-medium text-slate-500">
                  Sumber terpilih: <span className="text-indigo-600 font-semibold">{sourceType === 'sample' ? 'Contoh Denah JCC' : 'File Gambar Unggahan'}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card 1: Upload / Ganti Gambar */}
              <label 
                className={`relative flex flex-col items-center justify-center border-2 rounded-xl p-4 cursor-pointer transition-all group ${
                  sourceType === 'upload' 
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20' 
                    : 'border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-slate-100/60'
                }`}
              >
                {sourceType === 'upload' && (
                  <span className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow-xs">
                    <CheckCircle size={11} /> Aktif
                  </span>
                )}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                  sourceType === 'upload' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                }`}>
                  {hasActiveBlueprint ? <RefreshCw size={20} /> : <Upload size={20} />}
                </div>
                <span className="text-xs font-bold text-slate-800 text-center">
                  {hasActiveBlueprint ? 'Ganti Gambar' : 'Unggah Gambar (PNG, JPG, SVG)'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 text-center">
                  Maks. 15MB • PNG, JPG, WebP, SVG
                </span>
                <input 
                  type="file" 
                  accept="image/png,image/jpeg,image/webp,image/svg+xml" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </label>

              {/* Card 2: Gunakan Contoh Denah (JCC Convention Hall) */}
              <button
                type="button"
                onClick={loadSampleBlueprint}
                className={`relative flex flex-col items-center justify-center border-2 rounded-xl p-4 text-center transition-all group ${
                  sourceType === 'sample'
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-indigo-300 bg-slate-50/60 hover:bg-indigo-50/30'
                }`}
              >
                {sourceType === 'sample' && (
                  <span className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow-xs">
                    <CheckCircle size={11} /> Aktif
                  </span>
                )}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                  sourceType === 'sample' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 group-hover:scale-105'
                }`}>
                  <Sparkles size={20} />
                </div>
                <span className="text-xs font-bold text-indigo-950">Gunakan Contoh Denah</span>
                <span className="text-[11px] text-indigo-700 font-medium mt-1">JCC Convention Hall (Standar)</span>
              </button>
            </div>
          </div>

          {/* Section: Preview & Display Settings (jika ada gambar yang aktif atau baru dipilih) */}
          {imageUrl && (
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pratinjau & Penyesuaian Kanvas
                </span>
                <span className="text-[11px] font-mono text-slate-500 truncate max-w-[200px]" title={fileName}>
                  {fileName || 'Denah Terpilih'}
                </span>
              </div>

              {/* Visual Preview Box */}
              <div className="relative rounded-xl border border-slate-300/80 overflow-hidden bg-slate-900 h-36 flex items-center justify-center shadow-inner">
                {/* Canvas grid pattern background */}
                <div 
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage: 'linear-gradient(to right, #475569 1px, transparent 1px), linear-gradient(to bottom, #475569 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                  }}
                />
                <img
                  src={imageUrl}
                  alt="Blueprint Preview"
                  className="max-h-full max-w-full object-contain transition-opacity relative z-10"
                  style={{ opacity: opacity }}
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-slate-300 text-[10px] font-medium backdrop-blur-sm z-20 border border-slate-800">
                  Pratinjau Latar Belakang ({Math.round(opacity * 100)}%)
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-700 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5"><Eye size={14} className="text-indigo-600" /> Transparansi</span>
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded text-[11px]">
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Samar (5%)</span>
                    <span>Jelas (100%)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs text-slate-700 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5"><Sliders size={14} className="text-indigo-600" /> Skala Ukuran</span>
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded text-[11px]">
                      {Math.round(scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3"
                    step="0.05"
                    value={scale}
                    onChange={(e) => setScale(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Kecil (20%)</span>
                    <span>Besar (300%)</span>
                  </div>
                </div>
              </div>

              {/* Lock Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isLocked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Kunci Latar Belakang (Lock Layer)</div>
                    <div className="text-[11px] text-slate-500">Mencegah gambar denah tergeser secara tidak sengaja saat menggambar booth</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLocked(!isLocked)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                    isLocked 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {isLocked ? 'Terkunci' : 'Bisa Digeser'}
                </button>
              </div>
            </div>
          )}

          {/* Inline Delete Confirmation Dialog */}
          {isConfirmingDelete && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-red-900">Hapus Blueprint dari Denah?</h4>
                  <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
                    Gambar blueprint panduan di latar belakang kanvas akan dihapus dan tidak lagi ditampilkan. Booth dan elemen denah lainnya tetap aman dan tidak akan terhapus.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                    >
                      Ya, Hapus Blueprint
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-3 py-1.5 bg-white border border-red-300 text-red-800 hover:bg-red-100/50 text-xs font-medium rounded-lg transition-colors"
                    >
                      Batalkan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div>
            {(hasActiveBlueprint || imageUrl) && !isConfirmingDelete && (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Hapus Blueprint
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors"
            >
              Batal
            </button>

            <button
              type="button"
              disabled={!hasChanges}
              onClick={handleSave}
              title={!hasChanges ? 'Blueprint sudah diterapkan' : 'Terapkan perubahan ke kanvas'}
              className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 ${
                hasChanges 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {hasChanges ? (
                <>
                  <CheckCircle size={14} />
                  Terapkan ke Kanvas
                </>
              ) : (
                'Blueprint sudah diterapkan'
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
