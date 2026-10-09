import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Save, 
  RotateCcw, 
  Printer, 
  Download,
  Palette, 
  Layout, 
  Building2, 
  CreditCard, 
  FileText, 
  FileCheck,
  CheckCircle2, 
  Sparkles, 
  Eye, 
  Sliders, 
  Upload, 
  Image as ImageIcon,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  QrCode,
  Layers,
  HelpCircle
} from 'lucide-react';
import { 
  DEFAULT_INVOICE_CONFIG, 
  INVOICE_PRESETS 
} from '../../utils/invoiceTemplateConfig';
import { downloadInvoicePdf, printInvoice } from '../../utils/invoicePdf';
import { api } from '../../services/api';
import InvoiceA4View from './InvoiceA4View';
import { looksLikeTypo } from '../../utils/nameCheck';

// Realistic sample invoice data for the live preview
const SAMPLE_INVOICE_DATA = {
  id: 999,
  invoice_number: 'INV/2026/09/EXP-0089',
  issue_date: new Date().toISOString().split('T')[0],
  due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  payment_status: 'UNPAID',
  company_name: 'PT NUSA INOVASI DIGITAL',
  client_name: 'Rian Pratama, S.Kom',
  client_email: 'rian.pratama@nusadigital.co.id',
  client_phone: '+62 813-8877-6655',
  client_address: 'Gedung Cyber 2 Lt. 12, Jl. HR Rasuna Said Blok X-5, Kuningan, Jakarta Selatan 12950',
  client_npwp: '02.456.789.1-015.000',
  booth_code: 'A-12',
  booth_label: 'Main Hall Premium Island',
  booth_size: '6m x 6m (36 m²)',
  category: 'Diamond VIP',
  subtotal: 45000000,
  discount_amount: 5000000,
  discount_note: 'Diskon Khusus Early Bird Partnership (Admin Special)',
  tax_rate: 11,
  tax_amount: 4400000,
  total_amount: 44400000,
  admin_notes: 'Layout stand island bebas partisi dengan fasilitas listrik 3500W & free 2 slot parkir VIP.',
  items: [
    {
      description: 'Sewa Booth Pameran - Stand Diamond VIP (A-12)',
      dimensions: '6m x 6m (36 m²)',
      facilities: 'Listrik 3500W, Carpet Tile, 2 Meja Resepsionis, 4 Kursi, Spotlight LED',
      qty: 1,
      unitPrice: 45000000,
      total: 45000000
    }
  ]
};

export default function InvoiceEditorModal({
  isOpen,
  onClose,
  onSaveSuccess,
  showToast
}) {
  const [config, setConfig] = useState(DEFAULT_INVOICE_CONFIG);
  const [activeTab, setActiveTab] = useState('theme'); // 'theme' | 'header' | 'company' | 'client' | 'table' | 'payment' | 'signature'
  // Kop surat upload state (hooks stay above the early return below)
  const [kopBusy, setKopBusy] = useState(false);
  const [kopNotice, setKopNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(70); // percentage
  const [savedSuccessAlert, setSavedSuccessAlert] = useState(false);
  const previewContainerRef = useRef(null);

  // Dedicated Print handler (prints ONLY the invoice area via isolated A4 frame)
  const handlePrintA4 = () => {
    printInvoice({ invoice: SAMPLE_INVOICE_DATA, config });
  };

  // Dedicated PDF Download handler (generates official A4 PDF)
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    try {
      // the design as it is in the editor now (saved or not), rendered by the server from the print route
      const res = await downloadInvoicePdf({ invoice: SAMPLE_INVOICE_DATA, config, preview: true, fileName: 'Invoice-Preview-Layout.pdf' });
      if (res.success) {
        if (showToast) showToast('📄 Dokumen PDF invoice berhasil dibuat & diunduh!');
      } else if (res.unavailable) {
        if (showToast) showToast(`⚠️ ${res.error}`);
        printInvoice({ invoice: SAMPLE_INVOICE_DATA, config });
      } else if (showToast) {
        showToast(`⚠️ ${res.error}`);
      }
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Load existing config on open
  useEffect(() => {
    if (isOpen) {
      api.fetchInvoiceConfig().then(saved => {
        if (saved && Object.keys(saved).length > 0) {
          setConfig(prev => ({ ...prev, ...saved }));
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const applyPreset = (preset) => {
    setConfig(prev => ({
      ...prev,
      presetId: preset.id,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
      headerLayout: preset.headerLayout,
      tableHeaderStyle: preset.tableHeaderStyle,
      signaturePosition: preset.signaturePosition,
      fontFamily: preset.fontFamily || 'font-sans'
    }));
    if (showToast) {
      showToast(`🎨 Preset "${preset.name}" diterapkan!`);
    }
  };

  const handleReset = () => {
    if (confirm('Kembalikan seluruh pengaturan layout invoice ke standar bawaan?')) {
      setConfig(DEFAULT_INVOICE_CONFIG);
      if (showToast) showToast('🔄 Pengaturan invoice direset ke standar');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.saveInvoiceConfig(config);
      if (res && res.success) {
        if (res.config) {
          setConfig(res.config);
        }
        setSavedSuccessAlert(true);
        setTimeout(() => setSavedSuccessAlert(false), 3500);
        if (showToast) {
          showToast('✅ Desain & Layout Invoice berhasil disimpan!');
        }
        if (onSaveSuccess) {
          onSaveSuccess(res.config || config);
        }
      }
    } catch (e) {
      console.error('Failed to save invoice config:', e);
      if (showToast) {
        showToast('⚠️ Gagal menyimpan pengaturan');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Kop surat (AGENTS.md §42): an A4 image behind the whole invoice; stored as a file, the layout keeps its URL
  const handleLetterheadUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setKopNotice('Pilih gambar PNG, JPG atau WEBP. Kop dalam PDF: ekspor dulu menjadi gambar.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setKopBusy(true);
      setKopNotice('');
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalHeight / img.naturalWidth;
        if (Math.abs(ratio - 297 / 210) > 0.05) setKopNotice(`Ukuran gambar ${img.naturalWidth} × ${img.naturalHeight} px bukan rasio A4 (210 × 297): gambar akan ditarik menyesuaikan kertas.`);
        else if (img.naturalWidth < 1240) setKopNotice(`Resolusi ${img.naturalWidth} px agak rendah untuk cetak; disarankan minimal 1240 px lebar (150 dpi).`);
      };
      img.src = dataUrl;
      const res = await api.uploadImage(dataUrl);
      handleChange('letterheadUrl', res?.url || dataUrl);
      setKopBusy(false);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (uploadEvent) => {
        // The logo is stored as a file on the server; the layout keeps its URL only (AGENTS.md §28)
        const res = await api.uploadImage(uploadEvent.target.result);
        handleChange('logoUrl', res?.url || uploadEvent.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        handleChange('signatureImageUrl', uploadEvent.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-between overflow-hidden animate-fadeIn print:p-0 print:m-0 print:bg-white print:static print:overflow-visible">
      {/* Top Header Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-md print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Sliders size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Invoice Template & Layout Visual Editor
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                A4 Live Preview
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kustomisasi tata letak, posisi logo, identitas perusahaan, rekening, dan gaya warna invoice secara real-time.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            title="Reset ke Standar"
          >
            <RotateCcw size={13} />
            <span>Reset Default</span>
          </button>

          {/* 1. Tombol Download PDF */}
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Download invoice resmi dalam format PDF"
          >
            <Download size={13} className={isGeneratingPDF ? 'animate-bounce' : ''} />
            <span>{isGeneratingPDF ? 'Membuat PDF...' : 'Download PDF'}</span>
          </button>

          {/* 2. Tombol Print Invoice */}
          <button
            type="button"
            onClick={handlePrintA4}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
            title="Kirim area invoice ke Printer fisik / Dialog Cetak"
          >
            <Printer size={13} />
            <span>Print Invoice</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50 ml-1"
          >
            <Save size={14} />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Desain'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-2"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Workspace: Left Controls (Accordion/Tabs) + Right Live Preview */}
      <div className="flex-1 flex overflow-hidden print:overflow-visible print:block">
        {/* Left Side: Customization Navigation & Panels */}
        <div className="w-115 sm:w-125 md:w-135 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden print:hidden">
          {/* Tab Navigation Icons - 2 Columns Grid so all tabs are 100% visible */}
          <div className="grid grid-cols-2 gap-1.5 p-2.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
            {[
              { id: 'theme', label: 'Tema & Warna', icon: Palette },
              { id: 'header', label: 'Logo & Posisi', icon: Layout },
              { id: 'company', label: 'Penyelenggara', icon: Building2 },
              { id: 'client', label: 'Tagihan Client', icon: FileText },
              { id: 'table', label: 'Tabel & Rincian', icon: Layers },
              { id: 'payment', label: 'Rekening Bank', icon: CreditCard },
              { id: 'instructions', label: 'Instruksi Pembayaran', icon: FileCheck },
              { id: 'signature', label: 'Tanda Tangan', icon: ShieldCheck },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
                      : 'bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-white shrink-0' : 'text-indigo-400 shrink-0'} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar text-slate-300 text-xs">
            {/* 1. TEMA & WARNA */}
            {activeTab === 'theme' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-400" />
                    Pilihan Preset Desain Cepat
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Pilih palet warna dan gaya tipografi resmi dalam 1-klik:
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {INVOICE_PRESETS.map(preset => {
                      const isSelected = config.presetId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => applyPreset(preset)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                              : 'bg-slate-800/50 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <span 
                                className="w-5 h-5 rounded-full border border-white/20 shadow-xs block"
                                style={{ backgroundColor: preset.primaryColor }}
                              />
                              <span 
                                className="w-5 h-5 rounded-full border border-white/20 shadow-xs block -ml-2"
                                style={{ backgroundColor: preset.secondaryColor }}
                              />
                              <span 
                                className="w-5 h-5 rounded-full border border-white/20 shadow-xs block -ml-2"
                                style={{ backgroundColor: preset.accentColor }}
                              />
                            </div>
                            <div>
                              <span className="font-semibold text-white block text-xs">
                                {preset.name}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {preset.headerLayout.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-4">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Kustomisasi Warna Manual
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                        Warna Utama (Brand / Header)
                      </label>
                      <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                        <input
                          type="color"
                          value={config.primaryColor || '#4f46e5'}
                          onChange={(e) => handleChange('primaryColor', e.target.value)}
                          className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={config.primaryColor || '#4f46e5'}
                          onChange={(e) => handleChange('primaryColor', e.target.value)}
                          className="bg-transparent text-white font-mono text-xs w-full focus:outline-none uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                        Warna Sekunder (Sub-heading)
                      </label>
                      <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                        <input
                          type="color"
                          value={config.secondaryColor || '#0f172a'}
                          onChange={(e) => handleChange('secondaryColor', e.target.value)}
                          className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={config.secondaryColor || '#0f172a'}
                          onChange={(e) => handleChange('secondaryColor', e.target.value)}
                          className="bg-transparent text-white font-mono text-xs w-full focus:outline-none uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Warna Aksen (Badge & Status)
                    </label>
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                      <input
                        type="color"
                        value={config.accentColor || '#10b981'}
                        onChange={(e) => handleChange('accentColor', e.target.value)}
                        className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={config.accentColor || '#10b981'}
                        onChange={(e) => handleChange('accentColor', e.target.value)}
                        className="bg-transparent text-white font-mono text-xs w-full focus:outline-none uppercase"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. LOGO & HEADER */}
            {activeTab === 'header' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Tata Letak & Posisi Header
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Atur penempatan logo berbanding info perusahaan dan nomor invoice:
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      {
                        id: 'logo_left_info_right',
                        label: 'Logo Kiri, Info Kanan',
                        desc: 'Standar formal paling populer'
                      },
                      {
                        id: 'logo_right_info_left',
                        label: 'Logo Kanan, Info Kiri',
                        desc: 'Gaya korporat eksekutif'
                      },
                      {
                        id: 'logo_center_stacked',
                        label: 'Logo Tengah (Center)',
                        desc: 'Elegan simetris & mewah'
                      },
                      {
                        id: 'clean_minimal',
                        label: 'Minimalis Modern',
                        desc: 'Desain bersih tanpa garis berat'
                      }
                    ].map(layout => {
                      const isSelected = config.headerLayout === layout.id;
                      return (
                        <div
                          key={layout.id}
                          onClick={() => handleChange('headerLayout', layout.id)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                              : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <span className="font-semibold text-white block text-xs">
                            {layout.label}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {layout.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-4">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Kop Surat (Background)
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Gambar kop satu lembar A4 dipasang sebagai latar seluruh invoice (juga di setiap halaman saat dicetak / PDF). Isi invoice tampil di atasnya seperti biasa.
                  </p>

                  <div className="flex items-start gap-3">
                    <div className="w-[70px] h-[99px] shrink-0 rounded-md border border-slate-700 bg-slate-950 overflow-hidden flex items-center justify-center">
                      {config.letterheadUrl
                        ? <img src={config.letterheadUrl} alt="Kop surat" className="w-full h-full object-fill" />
                        : <span className="text-[10px] text-slate-500 text-center px-1">Belum ada kop</span>}
                    </div>
                    <div className="space-y-2 min-w-0">
                      <label className={`inline-flex items-center gap-2 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg transition-colors font-medium ${kopBusy ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
                        <Upload size={14} />
                        <span>{kopBusy ? 'Mengunggah…' : (config.letterheadUrl ? 'Ganti Kop Surat' : 'Upload Kop Surat')}</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLetterheadUpload} disabled={kopBusy} className="hidden" />
                      </label>
                      {config.letterheadUrl && (
                        <button type="button" onClick={() => { handleChange('letterheadUrl', ''); setKopNotice(''); }}
                          className="block text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer">
                          Hapus Kop Surat
                        </button>
                      )}
                      <p className="text-[10px] text-slate-500">PNG / JPG / WEBP, rasio A4, maks. 15 MB.</p>
                    </div>
                  </div>
                  {kopNotice && <p className="text-[11px] text-amber-300 leading-relaxed">{kopNotice}</p>}

                </div>

                <div className="pt-3 border-t border-slate-800 space-y-4">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Logo & Brand Asset
                  </h4>

                  {/* Toggle Show Logo */}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showLogo ?? true}
                      onChange={(e) => handleChange('showLogo', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Logo di Header</span>
                  </label>

                  {/* Logo Image Upload or URL */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Upload Logo Perusahaan (PNG/JPG/SVG)
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg cursor-pointer transition-colors font-medium">
                        <Upload size={14} />
                        <span>Pilih Gambar File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                      {config.logoUrl && (
                        <button
                          type="button"
                          onClick={() => handleChange('logoUrl', '')}
                          className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                        >
                          Hapus Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Atau Masukkan URL Logo Web
                    </label>
                    <input
                      type="text"
                      placeholder="https://example.com/logo.png"
                      value={config.logoUrl || ''}
                      onChange={(e) => handleChange('logoUrl', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  {/* Logo Size Range */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-medium text-slate-400">
                        Ukuran / Tinggi Logo
                      </label>
                      <span className="text-slate-300 font-mono text-[11px]">
                        {config.logoSize || 44} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="24"
                      max="90"
                      step="2"
                      value={config.logoSize || 44}
                      onChange={(e) => handleChange('logoSize', Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Brand Titles */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Teks Judul Brand (Header)
                      </label>
                      <input
                        type="text"
                        value={config.logoText || ''}
                        onChange={(e) => handleChange('logoText', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Tagline / Subtitle Brand
                      </label>
                      <input
                        type="text"
                        value={config.logoTagline || ''}
                        onChange={(e) => handleChange('logoTagline', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. INFORMASI PENYELENGGARA & REKENING KANTOR */}
            {activeTab === 'company' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Identitas & Alamat Penyelenggara
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Informasi ini dicetak sebagai pihak penerbit resmi tagihan:
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Nama Perusahaan / Organizer (Penyelenggara)
                  </label>
                  <input
                    type="text"
                    value={config.companyName || ''}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Alamat Lengkap Kantor
                  </label>
                  <textarea
                    rows={3}
                    value={config.companyAddress || ''}
                    onChange={(e) => handleChange('companyAddress', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Email Finance / Info
                    </label>
                    <input
                      type="email"
                      value={config.companyEmail || ''}
                      onChange={(e) => handleChange('companyEmail', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Nomor Telepon / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={config.companyPhone || ''}
                      onChange={(e) => handleChange('companyPhone', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Situs Web Resmi
                    </label>
                    <input
                      type="text"
                      value={config.companyWebsite || ''}
                      onChange={(e) => handleChange('companyWebsite', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      NPWP Penyelenggara
                    </label>
                    <input
                      type="text"
                      value={config.companyNpwp || ''}
                      onChange={(e) => handleChange('companyNpwp', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Sub-section: Rekening Bank Kantor Penyelenggara */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <CreditCard size={14} className="text-indigo-400" />
                    Nomor Rekening Bank Kantor Penyelenggara
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Nomor rekening ini akan tercantum di bagian penerbit resmi tagihan untuk pembayaran biaya booth:
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Nama Bank Kantor
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Bank BCA"
                        value={config.bankName || ''}
                        onChange={(e) => handleChange('bankName', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Nomor Rekening Kantor
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: 882-019-3321"
                        value={config.accountNumber || ''}
                        onChange={(e) => handleChange('accountNumber', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono font-bold text-indigo-300"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Atas Nama (Pemilik Rekening)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: PT EXPO KARYA INDONESIA"
                        value={config.accountName || ''}
                        onChange={(e) => handleChange('accountName', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                      {looksLikeTypo(config.accountName, config.companyName) && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-400">⚠ Sangat mirip tetapi tidak sama dengan nama perusahaan "{config.companyName}". Cek ulang sesuai buku rekening.</p>
                    )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Cabang Bank (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: KCP Sudirman Tower"
                        value={config.bankBranch || ''}
                        onChange={(e) => handleChange('bankBranch', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DATA TAGIHAN CLIENT */}
            {activeTab === 'client' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Posisi & Field Tagihan (Bill To)
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Atur susunan informasi penerima tagihan dan rincian invoice:
                  </p>
                </div>

                {/* Grid Layout Position */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-2">
                    Tata Letak Kolom "Ditagihkan Kepada"
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div
                      onClick={() => handleChange('clientSectionPosition', 'grid_2col')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        config.clientSectionPosition === 'grid_2col'
                          ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                          : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-semibold text-white block text-xs">
                        2 Kolom Berdampingan
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Client di kiri, nomor invoice di kanan
                      </span>
                    </div>

                    <div
                      onClick={() => handleChange('clientSectionPosition', 'stacked')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        config.clientSectionPosition === 'stacked'
                          ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                          : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-semibold text-white block text-xs">
                        1 Kolom Berurutan (Stacked)
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Rincian invoice di atas, data tenant di bawah
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Toggle Tampilan Field Client
                  </h4>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showClientAddress ?? true}
                      onChange={(e) => handleChange('showClientAddress', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Alamat Lengkap Client</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showClientPhone ?? true}
                      onChange={(e) => handleChange('showClientPhone', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan No. Telepon / WA Client</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showClientEmail ?? true}
                      onChange={(e) => handleChange('showClientEmail', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Email Kontak Client</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showClientNpwp ?? true}
                      onChange={(e) => handleChange('showClientNpwp', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan NPWP Perusahaan Client</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showWatermark ?? true}
                      onChange={(e) => handleChange('showWatermark', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Watermark Status ("PAID" / "UNPAID")</span>
                  </label>
                </div>
              </div>
            )}

            {/* 5. TABEL & RINCIAN ITEM */}
            {activeTab === 'table' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Gaya & Desain Tabel Rincian
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Pilih gaya visual baris judul tabel (Table Header):
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { id: 'solid_primary', label: 'Solid Warna Utama', desc: 'Warna brand dengan teks putih' },
                      { id: 'solid_dark', label: 'Solid Dark Slate', desc: 'Warna gelap kontras tinggi' },
                      { id: 'tinted', label: 'Tinted / Halus', desc: 'Latar belakang transparan elegan' },
                      { id: 'bordered', label: 'Border Garis Bersih', desc: 'Minimalis garis batas' },
                      { id: 'minimal', label: 'Ultra Minimal', desc: 'Tanpa background' }
                    ].map(style => {
                      const isSelected = config.tableHeaderStyle === style.id;
                      return (
                        <div
                          key={style.id}
                          onClick={() => handleChange('tableHeaderStyle', style.id)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                              : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800'
                          }`}
                        >
                          <span className="font-semibold text-white block text-xs">
                            {style.label}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {style.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Kolom & Informasi Rincian
                  </h4>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showDimensionsCol ?? true}
                      onChange={(e) => handleChange('showDimensionsCol', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Kolom Dimensi / Ukuran Stand</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFacilitiesCol ?? true}
                      onChange={(e) => handleChange('showFacilitiesCol', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Kolom Fasilitas & Spesifikasi</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showTerbilang ?? true}
                      onChange={(e) => handleChange('showTerbilang', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Teks "Terbilang Rupiah"</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showDiscountBadge ?? true}
                      onChange={(e) => handleChange('showDiscountBadge', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Badge Potongan Diskon</span>
                  </label>
                </div>
              </div>
            )}

            {/* 6. REKENING & PEMBAYARAN */}
            {activeTab === 'payment' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 font-sans">
                    Rekening Pembayaran Bank Kantor
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Informasi akun bank tujuan transfer untuk pelunasan biaya stand:
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Nama Bank Utama
                  </label>
                  <input
                    type="text"
                    value={config.bankName || ''}
                    onChange={(e) => handleChange('bankName', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Nomor Rekening Kantor
                    </label>
                    <input
                      type="text"
                      value={config.accountNumber || ''}
                      onChange={(e) => handleChange('accountNumber', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono font-bold text-indigo-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Atas Nama Rekening
                    </label>
                    <input
                      type="text"
                      value={config.accountName || ''}
                      onChange={(e) => handleChange('accountName', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                    {looksLikeTypo(config.accountName, config.companyName) && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-400">⚠ Sangat mirip tetapi tidak sama dengan nama perusahaan "{config.companyName}". Cek ulang sesuai buku rekening.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Cabang Bank (Opsional)
                  </label>
                  <input
                    type="text"
                    value={config.bankBranch || ''}
                    onChange={(e) => handleChange('bankBranch', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            )}

            {/* 7. INSTRUKSI PEMBAYARAN RESMI */}
            {activeTab === 'instructions' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Instruksi Pembayaran Resmi & Judul Dokumen
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Atur petunjuk pembayaran transfer, judul invoice, dan catatan resmi dokumen:
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Judul Utama Dokumen
                    </label>
                    <input
                      type="text"
                      value={config.invoiceTitle || ''}
                      onChange={(e) => handleChange('invoiceTitle', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Sub-Judul Dokumen
                    </label>
                    <input
                      type="text"
                      value={config.invoiceSubtitle || ''}
                      onChange={(e) => handleChange('invoiceSubtitle', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Label Teks "Ditagihkan Kepada"
                    </label>
                    <input
                      type="text"
                      value={config.billToLabel || ''}
                      onChange={(e) => handleChange('billToLabel', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Label Teks "Penerbit / Rekening Tujuan"
                    </label>
                    <input
                      type="text"
                      value={config.issuedByLabel || ''}
                      onChange={(e) => handleChange('issuedByLabel', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 font-semibold">
                    Instruksi & Petunjuk Pembayaran Resmi
                  </label>
                  <textarea
                    rows={4}
                    value={config.paymentInstructions || ''}
                    onChange={(e) => handleChange('paymentInstructions', e.target.value)}
                    placeholder="Instruksi transfer bank, batas konfirmasi, nomor WhatsApp finance..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 font-semibold">
                    Catatan Kaki Dokumen (Footer Note)
                  </label>
                  <textarea
                    rows={2}
                    value={config.footerNotes || ''}
                    onChange={(e) => handleChange('footerNotes', e.target.value)}
                    placeholder="Catatan verifikasi keaslian atau copyright perusahaan..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            )}

            {/* 8. TANDA TANGAN & OTORISASI */}
            {activeTab === 'signature' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Otorisasi, Tanda Tangan & Pejabat Penandatangan
                  </h3>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Upload tanda tangan digital, atur nama pejabat, jabatan, dan stempel resmi:
                  </p>
                </div>

                {/* Fitur Upload Tanda Tangan */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon size={14} className="text-indigo-400" />
                    Upload Gambar Tanda Tangan Digital
                  </h4>

                  {config.signatureImageUrl ? (
                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-12 bg-white rounded flex items-center justify-center p-1 border border-slate-300">
                          <img
                            src={config.signatureImageUrl}
                            alt="Tanda tangan preview"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-emerald-400 block">
                            ✓ Tanda Tangan Terpasang
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Siap dicetak pada lembar A4 invoice
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleChange('signatureImageUrl', '')}
                        className="text-xs text-rose-400 hover:text-rose-300 underline font-medium cursor-pointer"
                      >
                        Hapus Tanda Tangan
                      </button>
                    </div>
                  ) : (
                    <div className="text-center p-4 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/40">
                      <p className="text-slate-400 text-[11px] mb-2">
                        Belum ada file tanda tangan. Format PNG transparan direkomendasikan.
                      </p>
                      <label className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer text-xs font-bold transition-all">
                        <Upload size={14} />
                        <span>Upload File Tanda Tangan</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Nama Pejabat / Penandatangan
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Budi Santoso, S.E."
                      value={config.signerName || ''}
                      onChange={(e) => handleChange('signerName', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Jabatan Pejabat / Signer
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Head of Finance & Exhibition"
                      value={config.signerTitle || ''}
                      onChange={(e) => handleChange('signerTitle', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Kota Penerbitan Invoice
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Jakarta"
                      value={config.signerCity || ''}
                      onChange={(e) => handleChange('signerCity', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Posisi Blok Tanda Tangan
                    </label>
                    <select
                      value={config.signaturePosition || 'right'}
                      onChange={(e) => handleChange('signaturePosition', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs cursor-pointer"
                    >
                      <option value="right">Kanan (Penyelenggara)</option>
                      <option value="left">Kiri</option>
                      <option value="split">2 Sisi (Client & Organizers)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showStamp ?? true}
                      onChange={(e) => handleChange('showStamp', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan Stempel Digital Resmi</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showQrCode ?? true}
                      onChange={(e) => handleChange('showQrCode', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-medium text-slate-200">Tampilkan QR Code Verifikasi Keaslian</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Real-time Live A4 Preview */}
        <div className="flex-1 bg-slate-950 flex flex-col overflow-hidden relative print:overflow-visible print:bg-white print:p-0 print:m-0">
          {/* Preview Toolbar */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs shrink-0 z-10 print:hidden">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Eye size={14} className="text-emerald-400" />
              <span>Real-Time Live Canvas Preview (Ukuran Standar Kertas A4)</span>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewZoom(z => Math.max(40, z - 10))}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <span className="font-mono text-[11px] text-slate-300 w-10 text-center">
                {previewZoom}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoom(z => Math.min(130, z + 10))}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewZoom(70)}
                className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 hover:text-white rounded ml-1 cursor-pointer font-medium"
              >
                Fit
              </button>
            </div>
          </div>

          {/* Canvas Scroll Area */}
          <div className="flex-1 overflow-auto p-8 flex justify-center items-start custom-scrollbar bg-radial from-slate-900 to-slate-950 print:p-0 print:m-0 print:bg-white print:overflow-visible">
            <div 
              style={{ 
                transform: `scale(${previewZoom / 100})`, 
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out'
              }}
              className="shadow-2xl rounded-sm overflow-hidden print:transform-none print:shadow-none print:overflow-visible print:m-0 print:p-0"
            >
              <InvoiceA4View
                invoice={SAMPLE_INVOICE_DATA}
                config={config}
                isLivePreview={true}
              />
            </div>
          </div>

          {/* Success Save Banner */}
          {savedSuccessAlert && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 px-5 py-2.5 rounded-xl shadow-2xl font-bold text-xs flex items-center gap-2 animate-bounce z-20 print:hidden">
              <CheckCircle2 size={16} />
              <span>Desain layout invoice berhasil disimpan ke database!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
