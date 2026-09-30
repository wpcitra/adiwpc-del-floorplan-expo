import React, { useState } from 'react';
import { 
  Download, 
  Copy, 
  Check, 
  X, 
  FileJson, 
  FileCode, 
  Image as ImageIcon, 
  Database,
  FileText,
  Printer,
  Sparkles,
  Layers,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export default function ExportModal({ 
  isOpen, 
  onClose, 
  jsonData, 
  onExportSvg, 
  onExportPng, 
  onExportPdf,
  currentFloorplanTitle,
  currentEventTitle,
  currentVenue
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('pdf'); // PDF as primary default!
  const [pdfOrientation, setPdfOrientation] = useState('landscape');
  const [includeDirectory, setIncludeDirectory] = useState(false); // Default to single page floorplan
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  if (!isOpen || !jsonData) return null;

  const jsonString = JSON.stringify(jsonData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floorplan-${jsonData.event?.id || 'export'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTriggerPdfExport = async () => {
    if (!onExportPdf) return;
    setIsExportingPdf(true);
    try {
      await onExportPdf({
        orientation: pdfOrientation,
        includeDirectory
      });
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const stats = jsonData.floorplan?.summary || { 
    available: 0, 
    reserved: 0, 
    sold: 0, 
    maintenance: 0, 
    total_potential_revenue: 0 
  };

  const totalBooths = jsonData.booths?.length || (stats.available + stats.reserved + stats.sold) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
              <Download size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">Ekspor Denah & Dokumen Floorplan</h3>
              <p className="text-xs text-slate-500">
                Simpan denah resmi dalam format PDF, gambar grafis SVG/PNG, atau skema JSON.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats strip */}
        <div className="bg-slate-900 text-white px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Available: <b>{stats.available}</b></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Reserved: <b>{stats.reserved}</b></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span>Sold: <b>{stats.sold}</b></span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-slate-400">Estimasi Omzet: </span>
            <span className="font-bold text-emerald-400">
              Rp {(stats.total_potential_revenue || 0).toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex border-b border-slate-200 px-6 pt-3 gap-2 bg-slate-50">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`pb-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'pdf' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={15} className={activeTab === 'pdf' ? 'text-red-600' : 'text-slate-400'} />
            <span>Dokumen PDF Resmi (A4)</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 font-bold ml-1">
              Rekomendasi
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('graphics')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'graphics' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileCode size={14} /> Grafis (SVG & PNG)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'json' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileJson size={14} /> Skema Data JSON (PRD)
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 flex-1 overflow-auto">
          {/* TAB 1: PDF EXPORT */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-orange-50/50 border border-red-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-600/20">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 text-sm">Dokumen Denah Arsitektural ISO A4</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Dokumen siap cetak dengan resolusi tajam, dilengkapi kop event resmi, legenda ketersediaan unit booth, skala grid, dan tabel direktori tenant exhibitor.
                    </p>
                  </div>
                </div>
              </div>

              {/* Options Box */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pengaturan Halaman PDF
                </h5>

                {/* 1. Orientation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Orientasi Kertas:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPdfOrientation('landscape')}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        pdfOrientation === 'landscape'
                          ? 'border-red-500 bg-white shadow-xs ring-2 ring-red-500/20 text-slate-900'
                          : 'border-slate-200 bg-white/60 hover:bg-white text-slate-600'
                      }`}
                    >
                      <div>
                        <span className="block text-xs font-bold">A4 Landscape (297 x 210 mm)</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">Sangat optimal untuk denah pameran</span>
                      </div>
                      {pdfOrientation === 'landscape' && <Check size={16} className="text-red-600" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfOrientation('portrait')}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        pdfOrientation === 'portrait'
                          ? 'border-red-500 bg-white shadow-xs ring-2 ring-red-500/20 text-slate-900'
                          : 'border-slate-200 bg-white/60 hover:bg-white text-slate-600'
                      }`}
                    >
                      <div>
                        <span className="block text-xs font-bold">A4 Portrait (210 x 297 mm)</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">Format tegak standar dokumen kantor</span>
                      </div>
                      {pdfOrientation === 'portrait' && <Check size={16} className="text-red-600" />}
                    </button>
                  </div>
                </div>

                {/* 2. Include Directory Table */}
                <label className="flex items-center gap-2.5 pt-2 border-t border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDirectory}
                    onChange={(e) => setIncludeDirectory(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Sertakan Halaman Direktori Tenant & Booth Exhibitor
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Menambahkan tabel lengkap daftar booth, tenant penyewa, ukuran, dan status pembayaran di halaman ke-2.
                    </span>
                  </div>
                </label>
              </div>

              {/* Preview Info Pill */}
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 text-xs text-slate-600">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  Format Dokumen: {pdfOrientation === 'landscape' ? 'A4 Landscape' : 'A4 Portrait'} • {includeDirectory ? '2+ Halaman' : '1 Halaman'}
                </span>
                <span className="font-semibold text-slate-800">
                  Total {totalBooths} Booth
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: GRAPHICS (SVG & PNG) */}
          {activeTab === 'graphics' && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-500 transition-all bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mb-3">
                    <FileCode size={20} />
                  </div>
                  <h4 className="font-semibold text-slate-800 text-sm">Vektor SVG (Scalable)</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Cetak resolusi tak terbatas untuk keperluan banner, pamflet pameran, atau integrasi web front-end.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportSvg}
                  className="mt-6 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download size={14} /> Unduh File SVG
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-500 transition-all bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                    <ImageIcon size={20} />
                  </div>
                  <h4 className="font-semibold text-slate-800 text-sm">Gambar Gambar PNG</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Format gambar raster siap kirim via WhatsApp atau lampiran proposal ke calon exhibitor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportPng}
                  className="mt-6 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download size={14} /> Unduh Gambar PNG
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: JSON DATABASE */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Database size={14} className="text-blue-500" />
                  Struktur JSON siap disinkronkan ke tabel <code>events</code>, <code>floorplans</code>, dan <code>booths</code>
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 flex items-center gap-1 text-slate-700 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  {copied ? 'Tersalin!' : 'Salin JSON'}
                </button>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-lg text-[11px] font-mono overflow-auto max-h-72 border border-slate-800 shadow-inner">
                  {jsonString}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Total {totalBooths} unit booth terdeteksi
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-xl transition-colors cursor-pointer"
            >
              Tutup
            </button>
            {activeTab === 'pdf' ? (
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleTriggerPdfExport}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-red-600/20 cursor-pointer"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Mempersiapkan PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Unduh Dokumen PDF (A4)</span>
                  </>
                )}
              </button>
            ) : activeTab === 'json' ? (
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-xl hover:bg-blue-700 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Download size={14} /> Unduh Berkas JSON
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
