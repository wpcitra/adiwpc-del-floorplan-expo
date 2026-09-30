import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  Send, 
  MessageSquare, 
  FileText, 
  Sparkles, 
  Layers, 
  Users, 
  Check, 
  AlertCircle, 
  ChevronDown,
  Building2,
  Phone,
  Plus,
  Minus
} from 'lucide-react';
import FacilityFormA4View from './FacilityFormA4View';
import { downloadInvoicePDF, printInvoiceElement } from '../../utils/invoicePrintUtils';
import { DEFAULT_INVOICE_CONFIG } from '../../utils/invoiceTemplateConfig';
import { api } from '../../services/api';

export default function GenerateTenantFacilityModal({
  isOpen,
  onClose,
  initialTenant = null,
  showToast
}) {
  const printRef = useRef(null);

  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(initialTenant || null);
  const [manualTenant, setManualTenant] = useState({
    boothCode: initialTenant?.boothCode || initialTenant?.code || 'A-01',
    companyName: initialTenant?.companyName || initialTenant?.tenant || initialTenant?.company_name || 'PT NAMA EXHIBITOR',
    picName: initialTenant?.picName || initialTenant?.ownerName || initialTenant?.pic_name || 'Bpk. PIC Lapangan',
    phone: initialTenant?.phone || initialTenant?.client_phone || '081234567890',
    email: initialTenant?.email || initialTenant?.client_email || ''
  });

  const [formsList, setFormsList] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [activeForm, setActiveForm] = useState(null);

  const [formMode, setFormMode] = useState('blank'); // 'blank' | 'filled'
  const [itemQuantities, setItemQuantities] = useState({});
  const [companyConfig, setCompanyConfig] = useState(() => {
    try {
      const cached = localStorage.getItem('invoice_template_config');
      if (cached) return { ...DEFAULT_INVOICE_CONFIG, ...JSON.parse(cached) };
    } catch (e) {}
    return DEFAULT_INVOICE_CONFIG;
  });

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [copiedWA, setCopiedWA] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(68);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen, initialTenant]);

  const loadInitialData = async () => {
    try {
      // 1. Load company settings for official Kop Surat
      const savedConfig = await api.fetchInvoiceConfig();
      if (savedConfig) {
        setCompanyConfig(prev => ({ ...prev, ...savedConfig }));
      }

      // 2. Load all forms and templates
      const forms = await api.fetchFacilityForms();
      setFormsList(forms || []);

      // Default to the active form or first template
      const defaultForm = (forms || []).find(f => f.is_active && !f.is_template) || (forms && forms[0]);
      if (defaultForm) {
        setSelectedFormId(defaultForm.id);
        setActiveForm(defaultForm);
      }

      // 3. Load registered exhibitors from stats
      const stats = await api.fetchStats('global');
      const list = stats?.exhibitorsList || [];
      const confirmed = list.filter(e => e.tenant || e.company_name || e.companyName || e.brandName || e.company);
      setTenants(confirmed);

      if (initialTenant) {
        setSelectedTenant(initialTenant);
        setManualTenant({
          boothCode: initialTenant.boothCode || initialTenant.code || initialTenant.booth || 'A-01',
          companyName: initialTenant.companyName || initialTenant.company || initialTenant.tenant || initialTenant.company_name || initialTenant.brandName || 'Nama Perusahaan',
          picName: initialTenant.picName || initialTenant.pic || initialTenant.ownerName || initialTenant.pic_name || 'PIC Tenant',
          phone: initialTenant.phone || initialTenant.contact || initialTenant.client_phone || '',
          email: initialTenant.email || initialTenant.client_email || ''
        });
      } else if (confirmed.length > 0) {
        const first = confirmed[0];
        setSelectedTenant(first);
        setManualTenant({
          boothCode: first.boothCode || first.code || first.booth || 'A-01',
          companyName: first.tenant || first.company_name || first.companyName || first.brandName || first.company || 'Nama Perusahaan',
          picName: first.ownerName || first.pic_name || first.picName || first.pic || 'PIC Tenant',
          phone: first.phone || first.client_phone || first.contact || '',
          email: first.email || first.client_email || ''
        });
      }
    } catch (e) {
      console.error('Error loading data for tenant facility modal:', e);
    }
  };

  if (!isOpen) return null;

  // Handle template selection change
  const handleTemplateChange = (formId) => {
    setSelectedFormId(formId);
    const chosen = formsList.find(f => f.id === formId);
    if (chosen) {
      setActiveForm(chosen);
      setItemQuantities({});
      if (showToast) {
        showToast(`📋 Template "${chosen.template_name || chosen.title}" diterapkan!`);
      }
    }
  };

  // Handle tenant dropdown change
  const handleTenantSelect = (boothCode) => {
    const t = tenants.find(item => (item.boothCode || item.code || item.booth) === boothCode);
    if (t) {
      setSelectedTenant(t);
      setManualTenant({
        boothCode: t.boothCode || t.code || t.booth || '',
        companyName: t.tenant || t.company_name || t.companyName || t.brandName || t.company || '',
        picName: t.ownerName || t.pic_name || t.picName || t.pic || '',
        phone: t.phone || t.client_phone || t.contact || '',
        email: t.email || t.client_email || ''
      });
    }
  };

  // Qty stepper for filled mode
  const handleQtyChange = (itemId, delta) => {
    setItemQuantities(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: next };
    });
  };

  // Items mapped with quantities if in filled mode
  const currentItems = (activeForm?.items || []).map(it => ({
    ...it,
    qty: itemQuantities[it.id] || 0
  }));

  // Format phone number for international WhatsApp
  const formatPhoneForWA = (rawPhone) => {
    let clean = (rawPhone || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (!clean.startsWith('62') && clean.length > 0) {
      clean = '62' + clean;
    }
    return clean;
  };

  // WhatsApp Message Generator
  const generateWAMessage = () => {
    const bCode = manualTenant.boothCode || 'Booth';
    const cName = manualTenant.companyName || 'Bapak/Ibu Exhibitor';
    const deadline = activeForm?.deadline_date ? `sebelum tanggal *${activeForm.deadline_date}*` : 'segera';
    const eventName = activeForm?.event_title || 'Indonesia International Expo 2026';
    const companyTitle = companyConfig.companyName || 'Panitia Pelaksana Expo';

    return encodeURIComponent(
      `Halo *${cName}* (Booth *#${bCode}*),\n\n` +
      `Salam hangat dari panitia *${eventName}*.\n\n` +
      `Bersama pesan ini kami lampirkan dokumen resmi *Formulir Permintaan Fasilitas Tambahan* untuk stan pameran Anda (terlampir dalam file PDF).\n\n` +
      `📌 *Petunjuk Pengisian & Konfirmasi:*\n` +
      `1. Silakan periksa daftar katalog fasilitas dan tarif resmi pada dokumen PDF terlampir.\n` +
      `2. Formulir mohon diisi dan dikonfirmasikan kembali kepada panitia ${deadline}.\n` +
      `3. Seluruh pesanan resmi akan disiapkan dan diuji coba oleh tim teknis kami saat hari persiapan (loading-in).\n\n` +
      `Terima kasih atas kerja samanya.\n_${companyTitle}_`
    );
  };

  // 1. Download PDF Handler
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    try {
      const safeBooth = manualTenant.boothCode ? manualTenant.boothCode.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Booth';
      const safeCompany = manualTenant.companyName ? manualTenant.companyName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Tenant';
      const fileName = `Formulir_Fasilitas_${safeBooth}_${safeCompany}.pdf`;

      const targetEl = document.getElementById('printable-facility-form-a4');
      await downloadInvoicePDF(targetEl, fileName);

      if (showToast) {
        showToast('📄 Dokumen PDF Formulir Fasilitas berhasil diunduh!');
      }
    } catch (e) {
      console.error(e);
      if (showToast) showToast('⚠️ Gagal membuat file PDF formulir');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 2. Download and Open WhatsApp Web Handler
  const handleDownloadAndOpenWhatsApp = async () => {
    // First trigger PDF download
    await handleDownloadPDF();

    // Generate WhatsApp Web link
    const waNumber = formatPhoneForWA(manualTenant.phone);
    const message = generateWAMessage();

    if (!waNumber) {
      if (showToast) showToast('⚠️ Nomor telepon tenant kosong. File PDF tetap berhasil diunduh.');
      return;
    }

    const waUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${message}`;
    window.open(waUrl, '_blank');

    if (showToast) {
      showToast('🚀 Mengunduh PDF & membuka WhatsApp Web...');
    }
  };

  // 3. Native Print Handler
  const handlePrint = () => {
    printInvoiceElement('printable-facility-form-a4');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Top Header Bar */}
        <div className="bg-slate-950 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Pembuat Dokumen Formulir Fasilitas Tenant (PDF & WhatsApp)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  Kop Surat Perusahaan Resmi
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pilih tenant dan katalog template fasilitas untuk dicetak atau dikirimkan via WhatsApp Web.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Print Langsung ke Dialog Cetak"
            >
              <Printer size={13} />
              <span>Print A4</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              title="Unduh Dokumen Format PDF A4"
            >
              <Download size={13} className={isGeneratingPDF ? 'animate-bounce' : ''} />
              <span>{isGeneratingPDF ? 'Membuat PDF...' : 'Download PDF A4'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadAndOpenWhatsApp}
              disabled={isGeneratingPDF}
              className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              title="Unduh PDF dan Otomatis Buka Obrolan WhatsApp Web"
            >
              <MessageSquare size={14} />
              <span>Kirim via WhatsApp Web</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Workspace (Left Sidebar Form Controls + Right A4 Canvas Preview) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Sidebar: Controls (W-80 to W-96) */}
          <div className="w-84 sm:w-96 bg-slate-900 border-r border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0 custom-scrollbar">
            
            {/* Control 1: Pilih Tenant */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Users size={14} className="text-indigo-400" />
                <span>Pilih Tenant / Exhibitor:</span>
              </label>

              {tenants.length > 0 && (
                <div className="relative">
                  <select
                    value={manualTenant.boothCode}
                    onChange={(e) => handleTenantSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                  >
                    {tenants.map((t, idx) => {
                      const code = t.boothCode || t.code || t.booth;
                      const name = t.tenant || t.company_name || t.companyName || t.brandName || t.company;
                      return (
                        <option key={idx} value={code}>
                          #{code} - {name}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              )}

              {/* Editable Fields for Tenant Info */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Kode Booth:</span>
                  <input
                    type="text"
                    value={manualTenant.boothCode}
                    onChange={(e) => setManualTenant({ ...manualTenant, boothCode: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-indigo-400 uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Nama Perusahaan:</span>
                  <input
                    type="text"
                    value={manualTenant.companyName}
                    onChange={(e) => setManualTenant({ ...manualTenant, companyName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">PIC Lapangan:</span>
                  <input
                    type="text"
                    value={manualTenant.picName}
                    onChange={(e) => setManualTenant({ ...manualTenant, picName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">No. WhatsApp:</span>
                  <input
                    type="tel"
                    value={manualTenant.phone}
                    onChange={(e) => setManualTenant({ ...manualTenant, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Control 2: Pilih Template Formulir Fasilitas */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Sparkles size={14} className="text-indigo-400" />
                <span>Pilih Katalog Template Fasilitas:</span>
              </label>

              <div className="relative">
                <select
                  value={selectedFormId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                >
                  {formsList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.is_template ? `[Template] ${f.template_name || f.title}` : `[Formulir Aktif] ${f.title}`}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              {activeForm && (
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">Total Item:</span>
                    <span className="font-mono text-indigo-400">{(activeForm.items || []).length} Fasilitas</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">Batas Pengajuan:</span>
                    <span className="text-rose-400">{activeForm.deadline_date || '-'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Control 3: Mode Tampilan Formulir */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-200">
                Format Isian Formulir:
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormMode('blank')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                    formMode === 'blank'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Checklist Kosong
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('filled')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                    formMode === 'filled'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Draf Terisi
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                {formMode === 'blank' 
                  ? 'Kolom pesanan dicetak titik-titik/centang untuk diisi dan ditandatangani manual oleh tenant.'
                  : 'Admin dapat langsung mengisi kuantitas item dan total biaya terhitung di formulir.'}
              </p>
            </div>

            {/* If in filled mode: Quick Quantity Stepper */}
            {formMode === 'filled' && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">Atur Jumlah Pesanan Fasilitas:</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {(activeForm?.items || []).map((it) => {
                    const qty = itemQuantities[it.id] || 0;
                    return (
                      <div key={it.id} className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                        <div className="pr-2 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-300 block truncate">{it.name}</span>
                          <span className="text-[10px] text-emerald-400 font-mono">Rp {(Number(it.price) || 0).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(it.id, -1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-white text-xs">{qty}</span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(it.id, 1)}
                            className="w-6 h-6 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick WhatsApp Preview Box */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-slate-300 font-bold">
                <span>Pesan Pengantar WA:</span>
                <span className="text-[10px] text-emerald-400 font-mono">{manualTenant.phone || '-'}</span>
              </div>
              <p className="text-[10px] text-slate-400 italic line-clamp-3">
                "Halo {manualTenant.companyName} (Booth #{manualTenant.boothCode}), berikut kami lampirkan dokumen resmi Formulir Pemesanan Fasilitas Tambahan..."
              </p>
            </div>

          </div>

          {/* Right Area: Real-Time Live Canvas A4 Preview */}
          <div className="flex-1 bg-slate-950 flex flex-col overflow-hidden relative">
            
            {/* Toolbar Zoom */}
            <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <FileText size={13} className="text-indigo-400" />
                <span>Pratinjau Lembar A4 (Kop Surat Perusahaan: {companyConfig.companyName})</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                <span>Zoom: {previewZoom}%</span>
              </div>
            </div>

            {/* Canvas Scroll Area */}
            <div className="flex-1 overflow-auto p-6 sm:p-8 flex justify-center items-start custom-scrollbar bg-radial from-slate-900 to-slate-950">
              <div 
                style={{ 
                  transform: `scale(${previewZoom / 100})`, 
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out'
                }}
                className="shadow-2xl rounded-sm overflow-hidden"
              >
                <FacilityFormA4View
                  tenant={manualTenant}
                  form={activeForm || {}}
                  selectedItems={currentItems}
                  mode={formMode}
                  companyConfig={companyConfig}
                  innerRef={printRef}
                />
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
