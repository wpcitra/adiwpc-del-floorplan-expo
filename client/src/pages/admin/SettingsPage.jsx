import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Building2, 
  CreditCard, 
  Sliders, 
  Tag, 
  Send, 
  Database, 
  Save, 
  Upload, 
  CheckCircle2, 
  Sparkles, 
  HelpCircle, 
  Plus, 
  Trash2, 
  Edit2, 
  RefreshCw, 
  Download, 
  AlertTriangle,
  FileText,
  ShieldCheck,
  UserCheck,
  Mail,
  Phone,
  MapPin,
  Clock,
  Percent,
  Check,
  Copy,
  RotateCcw,
  X,
  Bot,
  Palette
} from 'lucide-react';
import { api } from '../../services/api';
import { updateBoothCategoriesRegistry } from '../../utils/floorplanUtils';
import InvoiceEditorModal from '../../components/admin/InvoiceEditorModal';
import InvoiceA4View from '../../components/admin/InvoiceA4View';
import ClaudeApiKeySettings from '../../components/admin/ClaudeApiKeySettings';
import SectionErrorBoundary from '../../components/common/SectionErrorBoundary';
import TaxOptionsField from '../../components/admin/TaxOptionsField';
import { DEFAULT_TAX_NOTE } from '../../utils/invoiceTax';
import { looksLikeTypo } from '../../utils/nameCheck';

// Account holder very similar to (but not the same as) the company name: probably a typo. Only a warning.
function HolderNameWarning({ holder, companyName }) {
  if (!looksLikeTypo(holder, companyName)) return null;
  return (
    <p className="mt-1 text-[11px] font-semibold text-amber-700">
      ⚠ Nama pemilik rekening sangat mirip tetapi tidak sama dengan nama perusahaan "{companyName}". Cek ulang sesuai buku rekening.
    </p>
  );
}

export default function SettingsPage() {
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [selectedInvoiceForA4Preview, setSelectedInvoiceForA4Preview] = useState(null);
  const [activeTab, setActiveTab] = useState('organizer'); // 'organizer' | 'payment' | 'rules' | 'categories' | 'whatsapp' | 'system' | 'ai'
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullInvoiceConfig, setFullInvoiceConfig] = useState({});

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // 1. Organizer & Company Identity
  const [companyName, setCompanyName] = useState('PT EXPO KARYA INDONESIA');
  const [organizerBrand, setOrganizerBrand] = useState('Floorplan & Exhibition Studio');
  const [companyAddress, setCompanyAddress] = useState('Jl. Jend. Sudirman No. 45, Jakarta Pusat 10210, Indonesia');
  const [supportEmail, setSupportEmail] = useState('support@expokarya.co.id');
  const [supportPhone, setSupportPhone] = useState('021-555-8899');
  const [supportWhatsapp, setSupportWhatsapp] = useState('081234567890');
  const [signatoryName, setSignatoryName] = useState('Budi Santoso, S.E.');
  const [signatoryTitle, setSignatoryTitle] = useState('Head of Exhibition & Operation');
  const [signatureImage, setSignatureImage] = useState('');

  // 2. Bank Accounts & Official Invoice Instructions
  const [bank1Name, setBank1Name] = useState('Bank Central Asia (BCA)');
  const [bank1AccNumber, setBank1AccNumber] = useState('882-019-3321');
  const [bank1AccHolder, setBank1AccHolder] = useState('PT EXPO KARYA INDONESIA');
  const [bank1Branch, setBank1Branch] = useState('KCP Sudirman Jakarta');

  const [bank2Name, setBank2Name] = useState('Bank Mandiri');
  const [bank2AccNumber, setBank2AccNumber] = useState('122-00-9988776-5');
  const [bank2AccHolder, setBank2AccHolder] = useState('PT EXPO KARYA INDONESIA');
  const [bank2Branch, setBank2Branch] = useState('KCP Thamrin Jakarta');

  const [paymentInstructions, setPaymentInstructions] = useState(
    'Transfer dilakukan ke rekening resmi di atas. Cantumkan Nomor Invoice sebagai berita transfer. Kirimkan bukti pembayaran melalui WhatsApp Hotline Official kami untuk verifikasi otomatis.'
  );
  const [invoiceTerms, setInvoiceTerms] = useState(
    '1. Uang muka (DP) minimal 50% dibayarkan saat pendaftaran.\n2. Pelunasan sisa 50% wajib diselesaikan maksimal 14 hari sebelum hari H pendaftaran.\n3. Pembatalan kepesertaan setelah invoice diterbitkan akan dikenakan biaya administrasi 25%.'
  );

  // 3. System & Booking Rules
  const [taxRate, setTaxRate] = useState(11);
  const [bookingExpiryMinutes, setBookingExpiryMinutes] = useState(15);
  // Smallest DP a visitor may choose when registering online (% of the total)
  const [publicMinDpPercent, setPublicMinDpPercent] = useState(20);
  // Largest private discount the Sales role may give per booth (Studio pop up "Beri Diskon")
  const [salesMaxDiscountPercent, setSalesMaxDiscountPercent] = useState(10);
  const [salesMaxDiscountAmount, setSalesMaxDiscountAmount] = useState(0);
  const [isPublicBookingActive, setIsPublicBookingActive] = useState(true);
  // Online registrations by visitors are charged PPN (staff choose per invoice)
  const [publicBookingTax, setPublicBookingTax] = useState(true);
  // Default PPN for NEW invoices (method 'none' = Tanpa PPN) and the note printed when the breakdown is hidden
  const [taxDefault, setTaxDefault] = useState({ method: 'none', display: 'show' });
  const [taxNote, setTaxNote] = useState(DEFAULT_TAX_NOTE);
  const [isPaymentActive, setIsPaymentActive] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState('Rp');

  // 4. WhatsApp Web DeepLink Template
  const [waTemplate, setWaTemplate] = useState(
    `📌 *INVOICE & BUKTI RESERVASI BOOTH PAMERAN*
--------------------------------------------
No. Invoice : *{invoiceNo}*
Nama Brand  : *{brandName}*
PIC / Pemesan : {picName} ({contact})
Nomor Booth : *#{boothCode}*
Kategori Brand : {brandCategory}
Total Tagihan: *Rp {price}*
Status Pembayaran : *{statusText}*

{statusMessage}

Salam hangat,
*Tim Event Organizer & Floorplan Studio*`
  );

  // 5. Load Settings from SQLite backend / local storage
  useEffect(() => {
    async function loadSettings() {
      try {
        const config = await api.fetchInvoiceConfig();
        if (config) {
          setFullInvoiceConfig(config);
          if (config.companyName) setCompanyName(config.companyName);
          if (config.organizerBrand) setOrganizerBrand(config.organizerBrand);
          if (config.companyAddress) setCompanyAddress(config.companyAddress);
          if (config.supportEmail) setSupportEmail(config.supportEmail);
          if (config.supportPhone) setSupportPhone(config.supportPhone);
          if (config.supportWhatsapp) setSupportWhatsapp(config.supportWhatsapp);
          if (config.signatoryName) setSignatoryName(config.signatoryName);
          if (config.signatoryTitle) setSignatoryTitle(config.signatoryTitle);
          if (config.signatureImage) setSignatureImage(config.signatureImage);

          if (config.bank1Name) setBank1Name(config.bank1Name);
          if (config.bank1AccNumber) setBank1AccNumber(config.bank1AccNumber);
          if (config.bank1AccHolder) setBank1AccHolder(config.bank1AccHolder);
          if (config.bank1Branch) setBank1Branch(config.bank1Branch);

          if (config.bank2Name) setBank2Name(config.bank2Name);
          if (config.bank2AccNumber) setBank2AccNumber(config.bank2AccNumber);
          if (config.bank2AccHolder) setBank2AccHolder(config.bank2AccHolder);
          if (config.bank2Branch) setBank2Branch(config.bank2Branch);

          if (config.paymentInstructions) setPaymentInstructions(config.paymentInstructions);
          if (config.invoiceTerms) setInvoiceTerms(config.invoiceTerms);

          if (config.taxRate !== undefined) setTaxRate(config.taxRate);
          if (config.publicBookingTax !== undefined) setPublicBookingTax(config.publicBookingTax !== false);
          {
            const method = config.defaultTaxMethod === 'inclusive' ? 'inclusive' : 'exclusive';
            setTaxDefault({
              method: config.defaultTaxEnabled === true ? method : 'none',
              display: method === 'inclusive' && config.defaultTaxDisplay === 'hide' ? 'hide' : 'show'
            });
          }
          if (config.taxNote) setTaxNote(config.taxNote);
          if (config.bookingExpiryMinutes !== undefined) setBookingExpiryMinutes(config.bookingExpiryMinutes);
          if (config.publicMinDpPercent !== undefined) setPublicMinDpPercent(config.publicMinDpPercent);
          if (config.salesMaxDiscountPercent !== undefined) setSalesMaxDiscountPercent(config.salesMaxDiscountPercent);
          if (config.salesMaxDiscountAmount !== undefined) setSalesMaxDiscountAmount(config.salesMaxDiscountAmount);
          if (config.isPublicBookingActive !== undefined) setIsPublicBookingActive(config.isPublicBookingActive);
          if (config.isPaymentActive !== undefined) setIsPaymentActive(config.isPaymentActive);
          if (config.waTemplate) setWaTemplate(config.waTemplate);
        }
      } catch (e) {
        console.warn("Failed to load settings:", e);
      }
    }
    loadSettings();
  }, []);

  // Save all settings to SQLite server
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);

    const configData = {
      ...fullInvoiceConfig,
      companyName,
      organizerBrand,
      companyAddress,
      supportEmail,
      supportPhone,
      supportWhatsapp,
      signatoryName,
      signatoryTitle,
      signatureImage,

      bank1Name,
      bank1AccNumber,
      bank1AccHolder,
      bank1Branch,

      bank2Name,
      bank2AccNumber,
      bank2AccHolder,
      bank2Branch,

      paymentInstructions,
      invoiceTerms,

      taxRate,
      publicBookingTax,
      defaultTaxEnabled: taxDefault.method !== 'none',
      defaultTaxMethod: taxDefault.method === 'none' ? (fullInvoiceConfig?.defaultTaxMethod || 'exclusive') : taxDefault.method,
      defaultTaxDisplay: taxDefault.method === 'inclusive' ? taxDefault.display : 'show',
      taxNote: taxNote.trim() || DEFAULT_TAX_NOTE,
      bookingExpiryMinutes,
      publicMinDpPercent: Math.min(99, Math.max(1, Number(publicMinDpPercent) || 20)),
      salesMaxDiscountPercent: Math.min(100, Math.max(0, Number(salesMaxDiscountPercent) || 0)),
      salesMaxDiscountAmount: Math.max(0, Math.round(Number(salesMaxDiscountAmount) || 0)),
      isPublicBookingActive,
      isPaymentActive,
      currencySymbol,
      waTemplate,
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await api.saveInvoiceConfig(configData);
      if (res.success) {
        showToast('✨ Konfigurasi sistem berhasil disimpan ke database SQLite!');
      } else {
        showToast(`⚠️ Gagal menyimpan: ${res.error || 'Server error'}`);
      }
    } catch (err) {
      showToast('⚠️ Gagal terhubung ke server');
    } finally {
      setSaving(false);
    }
  };

  // Handle signature file upload
  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Ukuran file tanda tangan terlalu besar. Maksimal 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSignatureImage(reader.result);
        showToast('Tanda tangan digital berhasil diunggah!');
      };
      reader.readAsDataURL(file);
    }
  };

  // Reseed Database
  const handleReseed = async () => {
    if (window.confirm('⚠️ Apakah Anda yakin ingin me-reset database dan mengisi ulang dengan data sample awal? Semua data akan dikembalikan ke posisi semula.')) {
      setSaving(true);
      const res = await api.reseedDatabase();
      setSaving(false);
      if (res.success) {
        showToast('✅ Database berhasil di-reset dan diisi ulang!');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        alert('Gagal me-reset database.');
      }
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full animate-fadeIn space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-bold border border-slate-700 animate-bounce">
          <Sparkles size={16} className="text-amber-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
            <Settings size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pengaturan & Konfigurasi Sistem</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              Atur identitas penyelenggara, rekening bank, PPN, instruksi invoice, WhatsApp gateway, dan database
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
          <span>{saving ? 'Memproses...' : 'Simpan Semua Pengaturan'}</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('organizer')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'organizer'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 size={15} />
          <span>Identitas Penyelenggara & EO</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payment')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'payment'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CreditCard size={15} />
          <span>No. Rekening & Instruksi Pembayaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payment_methods')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'payment_methods'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CreditCard size={15} />
          <span>Form Metode Pembayaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sliders size={15} />
          <span>Aturan Booking, PPN & Pajak</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Tag size={15} />
          <span>Kelola Master Kategori Brand & Tier</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'whatsapp'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Send size={15} />
          <span>Template WhatsApp Web Invoice</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'system'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database size={15} />
          <span>Database & Maintenance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'ai'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Bot size={15} />
          <span>Integrasi AI (Claude)</span>
        </button>
      </div>

      {/* TAB CONTENT AREAS: an error in one tab stays inside that tab (header & tab bar keep working) */}
      <SectionErrorBoundary resetKey={activeTab} label="Tab ini">
      <div className="space-y-6">
        {/* TAB 1: IDENTITAS PENYELENGGARA */}
        {activeTab === 'organizer' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Building2 className="text-indigo-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Profil & Identitas Penyelenggara Pameran (EO)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Nama Perusahaan / Legal Entity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Building2 size={13} className="text-indigo-600" /> Nama Badan Hukum / Perusahaan EO *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Contoh: PT EXPO KARYA INDONESIA"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  required
                />
              </div>

              {/* Nama Brand Event / Studio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Sparkles size={13} className="text-indigo-600" /> Nama Brand Studio / Penyelenggara *
                </label>
                <input
                  type="text"
                  value={organizerBrand}
                  onChange={(e) => setOrganizerBrand(e.target.value)}
                  placeholder="Contoh: Floorplan & Exhibition Studio"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  required
                />
              </div>

              {/* Alamat Sekretariat */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <MapPin size={13} className="text-indigo-600" /> Alamat Lengkap Sekretariat Penyelenggara *
                </label>
                <textarea
                  rows={2}
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Jl. Jend. Sudirman No. 45, Jakarta Pusat..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  required
                />
              </div>

              {/* Email Support */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Mail size={13} className="text-indigo-600" /> Email Resmi Customer Support *
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@expokarya.co.id"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  required
                />
              </div>

              {/* Telepon Kantor */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Phone size={13} className="text-indigo-600" /> Telepon Kantor / Hotline *
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="021-555-8899"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  required
                />
              </div>
            </div>

            {/* Sub-section: Penandatangan Resmi (Authorized Signatory) */}
            <div className="pt-5 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-2">
                <UserCheck className="text-emerald-600" size={18} />
                <h3 className="text-sm font-bold text-slate-900">Identitas Penandatangan Invoice & Kontrak Resmi</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nama Lengkap Penandatangan (Signatory Name) *
                  </label>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    placeholder="Contoh: Budi Santoso, S.E."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Jabatan Resmi (Signatory Title) *
                  </label>
                  <input
                    type="text"
                    value={signatoryTitle}
                    onChange={(e) => setSignatoryTitle(e.target.value)}
                    placeholder="Contoh: Head of Exhibition & Operation"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                  />
                </div>
              </div>

              {/* Upload Tanda Tangan & Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tanda Tangan Digital / Stempel Resmi (JPG/PNG)
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="w-44 h-20 bg-white rounded-lg border border-slate-300 flex items-center justify-center p-2 relative overflow-hidden shadow-xs shrink-0">
                    {signatureImage ? (
                      <img src={signatureImage} alt="Tanda Tangan" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Belum ada TTD</span>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <input
                      type="file"
                      id="signature-file"
                      accept="image/*"
                      onChange={handleSignatureUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="signature-file"
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-indigo-200"
                    >
                      <Upload size={14} />
                      <span>{signatureImage ? 'Ganti Tanda Tangan' : 'Upload Tanda Tangan Digital'}</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Gambar ini akan tercetak otomatis di bagian bawah Invoice A4 & bukti pembayaran.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REKENING BANK & INSTRUKSI PEMBAYARAN */}
        {activeTab === 'payment' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            {/* Banner Integrasi Desain Visual & Layout Editor Invoice */}
            <div className="p-5 rounded-xl bg-slate-950 text-white border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Palette size={16} className="text-slate-300" />
                  <h3 className="text-sm font-semibold tracking-tight text-white">
                    Desain Layout Visual & Template Invoice A4
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                    Visual Editor
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Kustomisasi tata letak, logo kantor, tema warna, stempel digital, dan syarat ketentuan pembayaran invoice secara visual.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInvoiceForA4Preview({
                      id: 'INV-PREVIEW-01',
                      invoice_number: 'INV/2026/09/PREVIEW',
                      issue_date: new Date().toISOString().split('T')[0],
                      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                      client_name: 'Budi Santoso (PIC)',
                      company_name: 'PT Teknologi Nusantara',
                      email: 'budi@teknologi.co.id',
                      phone: '081234567890',
                      address: companyAddress,
                      booth_code: 'A-01',
                      booth_category: 'VIP Gold',
                      event_name: 'Indonesia International Expo 2026',
                      event_venue: 'Jakarta Convention Center (Hall A)',
                      subtotal: 15000000,
                      discount: 1000000,
                      tax_amount: 1540000,
                      grand_total: 15540000,
                      payment_status: 'UNPAID',
                      items: [
                        { description: 'Sewa Booth Pameran A-01 (VIP Gold 6x3m)', price: 15000000, qty: 1, total: 15000000 },
                        { description: 'Fasilitas Tambahan: Daya Listrik 2200W & Lampu Spot', price: 1000000, qty: 1, total: 1000000 }
                      ]
                    });
                  }}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700/80 transition-colors cursor-pointer"
                  title="Pratinjau Hasil Cetak Invoice A4 saat ini"
                >
                  <FileText size={14} className="text-slate-400" />
                  <span>Preview Invoice A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsInvoiceEditorOpen(true)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Buka Visual Editor untuk Edit Layout, Warna & Logo Invoice"
                >
                  <Sliders size={14} className="text-slate-700" />
                  <span>Edit Layout Invoice</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <CreditCard className="text-emerald-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Rekening Bank Kantor & Instruksi Pembayaran Resmi</h2>
            </div>

            {/* The invoice document prints "Atas Nama" from Desain Layout Invoice (accountName), not from Bank 1 */}
            {fullInvoiceConfig?.accountName && (
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${looksLikeTypo(fullInvoiceConfig.accountName, companyName) ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                <div>
                  Nama pemilik rekening yang tercetak di invoice (diatur di <b>Desain Layout Invoice</b>): <b>{fullInvoiceConfig.accountName}</b>
                  {fullInvoiceConfig.accountNumber ? <> • No. {fullInvoiceConfig.accountNumber}</> : null}
                </div>
                {looksLikeTypo(fullInvoiceConfig.accountName, companyName) && (
                  <div className="font-semibold">⚠ Sangat mirip tetapi tidak sama dengan nama perusahaan "{companyName}". Cek ulang sesuai buku rekening.</div>
                )}
              </div>
            )}

            {/* Bank 1 */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} className="text-blue-600" /> Bank Rekening Utama (Bank 1)
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Primary</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Bank</label>
                  <input
                    type="text"
                    value={bank1Name}
                    onChange={(e) => setBank1Name(e.target.value)}
                    placeholder="Bank Central Asia (BCA)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Rekening</label>
                  <input
                    type="text"
                    value={bank1AccNumber}
                    onChange={(e) => setBank1AccNumber(e.target.value)}
                    placeholder="882-019-3321"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Atas Nama (Account Holder)</label>
                  <input
                    type="text"
                    value={bank1AccHolder}
                    onChange={(e) => setBank1AccHolder(e.target.value)}
                    placeholder="PT EXPO KARYA INDONESIA"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                  <HolderNameWarning holder={bank1AccHolder} companyName={companyName} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cabang Bank</label>
                  <input
                    type="text"
                    value={bank1Branch}
                    onChange={(e) => setBank1Branch(e.target.value)}
                    placeholder="KCP Sudirman Jakarta"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Bank 2 */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} className="text-amber-600" /> Bank Rekening Kedua (Bank 2 - Opsional)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Bank</label>
                  <input
                    type="text"
                    value={bank2Name}
                    onChange={(e) => setBank2Name(e.target.value)}
                    placeholder="Bank Mandiri"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Rekening</label>
                  <input
                    type="text"
                    value={bank2AccNumber}
                    onChange={(e) => setBank2AccNumber(e.target.value)}
                    placeholder="122-00-9988776-5"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Atas Nama (Account Holder)</label>
                  <input
                    type="text"
                    value={bank2AccHolder}
                    onChange={(e) => setBank2AccHolder(e.target.value)}
                    placeholder="PT EXPO KARYA INDONESIA"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                  <HolderNameWarning holder={bank2AccHolder} companyName={companyName} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cabang Bank</label>
                  <input
                    type="text"
                    value={bank2Branch}
                    onChange={(e) => setBank2Branch(e.target.value)}
                    placeholder="KCP Thamrin Jakarta"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Instruksi & Catatan Syarat Pembayaran */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Instruksi Pembayaran Resmi (Payment Instructions)
                </label>
                <textarea
                  rows={3}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Syarat & Ketentuan Pembayaran (Terms & Conditions Invoice)
                </label>
                <textarea
                  rows={4}
                  value={invoiceTerms}
                  onChange={(e) => setInvoiceTerms(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white"
                />
              </div>

              {/* Dedicated Save Button for Tab 2 */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>{saving ? 'Memproses...' : 'Simpan Rekening Bank & Instruksi Pembayaran'}</span>
                </button>
              </div>
            </div>

            {/* Kelola Formulir Opsi Metode Pembayaran */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="text-emerald-600" size={18} />
                <h3 className="text-sm font-bold text-slate-900">Kelola Formulir & Opsi Metode Pembayaran Checkout</h3>
              </div>
              <PaymentMethodManagerSettings />
            </div>
          </div>
        )}

        {/* TAB: FORM METODE PEMBAYARAN */}
        {activeTab === 'payment_methods' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <CreditCard className="text-emerald-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Form & Opsi Metode Pembayaran Publik</h2>
            </div>

            <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-xs text-emerald-900 flex items-start gap-3">
              <Sparkles size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Pengaturan Form Metode Pembayaran</span>
                <p className="text-slate-600 mt-0.5 text-[11px]">
                  Kelola opsi pembayaran yang muncul di formulir checkout booking publik. Anda dapat menambah, mengedit, mengaktifkan, atau meng-non-aktifkan opsi pembayaran kapan saja.
                </p>
              </div>
            </div>

            <PaymentMethodManagerSettings />
          </div>
        )}

        {/* TAB 3: ATURAN BOOKING & PPN */}
        {activeTab === 'rules' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Sliders className="text-violet-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Pengaturan Aturan Booking, Pajak & PPN Pameran</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Persentase PPN */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Percent size={15} className="text-indigo-600" /> Tarif PPN / Pajak Pertambahan Nilai (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-28 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-indigo-700"
                  />
                  <span className="text-xs text-slate-600 font-semibold">% dari total sewa booth</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tarif default untuk invoice. Saat membuat invoice, admin tetap bisa memilih <b>Dengan PPN</b> atau <b>Tanpa PPN</b>.
                </p>
                <label className="flex items-start gap-2 pt-1 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={publicBookingTax} onChange={(e) => setPublicBookingTax(e.target.checked)} className="mt-0.5 accent-indigo-600" />
                  <span><b>Kenakan PPN pada pemesanan online</b> (pengunjung di Live Denah). Jika tidak dicentang, pemesanan online ditagih tanpa PPN.</span>
                </label>
              </div>

              {/* Default PPN untuk invoice baru */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Percent size={15} className="text-indigo-600" /> Default Pajak untuk Invoice Baru
                </label>
                <TaxOptionsField compact value={taxDefault} onChange={setTaxDefault} rate={taxRate} />
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan pajak yang tercetak di invoice</label>
                  <input
                    type="text"
                    value={taxNote}
                    onChange={(e) => setTaxNote(e.target.value)}
                    placeholder={DEFAULT_TAX_NOTE}
                    maxLength={120}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Dicetak di bawah total untuk invoice dengan metode "Harga sudah termasuk PPN".</p>
                </div>
                <p className="text-[11px] text-slate-500">
                  Default ini juga dipakai pemesanan online yang dikenai PPN. Perubahan tarif &amp; pengaturan pajak hanya berlaku untuk invoice <b>BARU</b>;
                  invoice yang sudah diterbitkan tetap memakai tarif dan pengaturan saat diterbitkan.
                </p>
              </div>

              {/* DP minimal pendaftaran online */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Percent size={15} className="text-blue-600" /> DP Minimal Pendaftaran Online (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={publicMinDpPercent}
                    onChange={(e) => setPublicMinDpPercent(Number(e.target.value))}
                    className="w-28 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-blue-700"
                  />
                  <span className="text-xs text-slate-600 font-semibold">% dari total harga</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Pengunjung Live Denah bisa memilih Bayar Penuh atau Uang Muka (DP) sendiri, minimal persentase ini.
                  Invoice DP langsung bisa diunduh setelah pemesanan; sisanya ditagih lewat Invoice Pelunasan.
                </p>
              </div>

              {/* Batas diskon Sales */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Percent size={15} className="text-emerald-600" /> Batas Diskon untuk Role Sales
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={salesMaxDiscountPercent}
                    onChange={(e) => setSalesMaxDiscountPercent(Number(e.target.value))}
                    aria-label="Batas diskon Sales dalam persen"
                    className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-emerald-700"
                  />
                  <span className="text-xs text-slate-600 font-semibold">% dari harga booth, dan maks. Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={100000}
                    value={salesMaxDiscountAmount}
                    onChange={(e) => setSalesMaxDiscountAmount(Number(e.target.value))}
                    aria-label="Batas diskon Sales dalam rupiah"
                    className="w-40 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-emerald-700"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Sales memberi diskon lewat pop up booth di Studio. Diskon di atas batas ini tidak bisa disimpan oleh Sales
                  (Finance / Super Admin tidak dibatasi). Isi 0 pada kolom Rp bila batasnya hanya persentase; isi 0% untuk
                  melarang Sales memberi diskon.
                </p>
              </div>

              {/* Expiry Timer Booking */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock size={15} className="text-amber-600" /> Batas Waktu Kunci Booking (Timer Menit)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bookingExpiryMinutes}
                    onChange={(e) => setBookingExpiryMinutes(Number(e.target.value))}
                    className="w-28 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-amber-700"
                  />
                  <span className="text-xs text-slate-600 font-semibold">Menit per pemesanan</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Timer hitung mundur saat peserta melakukan booking booth di halaman publik.
                </p>
              </div>

              {/* Status Fitur 1: Registrasi & Booking Booth Publik Toggle */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-900">
                      Status Fitur Booking Booth Publik
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Jika dinonaktifkan, peserta publik hanya dapat melihat denah tanpa bisa mengklik formulir booking booth.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPublicBookingActive(!isPublicBookingActive)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isPublicBookingActive
                        ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                        : 'bg-slate-300 text-slate-700 hover:bg-slate-400'
                    }`}
                  >
                    <CheckCircle2 size={15} />
                    <span>{isPublicBookingActive ? 'Booking Aktif' : 'Booking Non-Aktif'}</span>
                  </button>
                </div>
              </div>

              {/* Status Fitur 2: Mode Pembayaran & Checkout Bayar Toggle */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-900">
                      Status Mode Pembayaran & Checkout Bayar
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Jika dinonaktifkan, formulir pendaftaran akan langsung dikonfirmasi tanpa tahap pembayaran online.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPaymentActive(!isPaymentActive)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isPaymentActive
                        ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                        : 'bg-slate-300 text-slate-700 hover:bg-slate-400'
                    }`}
                  >
                    <CreditCard size={15} />
                    <span>{isPaymentActive ? 'Pembayaran Aktif' : 'Pembayaran Non-Aktif'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KELOLA MASTER KATEGORI BRAND & BOOTH TIERS */}
        {activeTab === 'categories' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-8 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Tag className="text-violet-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Kelola Master Kategori Brand & Tier Harga Booth</h2>
            </div>

            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs text-indigo-900 flex items-start gap-3">
              <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Informasi Pengelolaan Master Kategori & Tier Harga</span>
                <p className="text-slate-600 mt-0.5 text-[11px]">
                  Di sini Anda dapat mengelola Master Kategori Brand per-project dan Spesifikasi Tier Harga Booth Pameran (Ukuran m², Harga Default, & Warna Accent). Pilihan yang diatur akan langsung menjadi opsi pada Formulir Booking Publik dan Floorplan Studio.
                </p>
              </div>
            </div>

            {/* Sub-Section 1: Master Kategori Brand Industri */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Tag size={16} className="text-indigo-600" />
                <span>1. Master Kategori Brand Industri (Per Project / Global)</span>
              </h3>
              <BrandCategoryManagerSettings />
            </div>

            {/* Sub-Section 2: Master Tier Harga & Ukuran Booth */}
            <div className="space-y-4 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Sliders size={16} className="text-violet-600" />
                <span>2. Master Tier Harga, Spesifikasi Ukuran, & Warna Accent Booth Pameran</span>
              </h3>
              <BoothTierManagerSettings />
            </div>
          </div>
        )}

        {/* TAB 5: WHATSAPP WEB INTEGRATION */}
        {activeTab === 'whatsapp' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Send className="text-emerald-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Integrasi WhatsApp Web API & Template Invoice Otomatis</h2>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Layanan pengiriman invoice ini menggunakan <b>Official WhatsApp Web DeepLink API (100% Gratis Tanpa Biaya Berlangganan)</b>. Pesan invoice resmi disusun secara otomatis dan langsung membuka obrolan WhatsApp Web atau Aplikasi WhatsApp.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Template Pesan WhatsApp Web Invoice
              </label>
              <textarea
                rows={12}
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                className="w-full p-4 bg-slate-900 text-emerald-400 font-mono rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 leading-relaxed shadow-inner"
              />
              <p className="text-[11px] text-slate-500 mt-2">
                Placeholder yang tersedia: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{invoiceNo}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{brandName}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{picName}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{contact}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{boothCode}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{brandCategory}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{price}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">{'{statusText}'}</code>.
              </p>
            </div>
          </div>
        )}

        {/* TAB: INTEGRASI AI (Claude API key, Super Admin only: the Settings page is superadmin-only) */}
        {activeTab === 'ai' && <ClaudeApiKeySettings />}

        {/* TAB 6: DATABASE & MAINTENANCE */}
        {activeTab === 'system' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Database className="text-rose-600" size={20} />
              <h2 className="text-base font-bold text-slate-900">Pemeliharaan Database SQLite & System Reset</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Backup Database */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Download size={18} className="text-indigo-600" /> Backup Snapshot Database
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Unduh cadangan data denah, transaksi booth, exhibitor, dan invoice dalam format file JSON.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const data = await api.fetchExhibitors('all');
                    const jsonStr = JSON.stringify(data, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Floorplan-Database-Backup-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Download size={14} /> Unduh Backup JSON
                </button>
              </div>

              {/* Reset Database */}
              <div className="p-5 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-3">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                  <AlertTriangle size={18} className="text-rose-600" /> Reset Database ke Preset Sample
                </div>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Mengosongkan database SQLite dan memuat ulang data sample awal 15 booth pameran & transaksi demo.
                </p>
                <button
                  type="button"
                  onClick={handleReseed}
                  disabled={saving}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={14} className={saving ? "animate-spin" : ""} />
                  <span>Reset & Seed Database</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </SectionErrorBoundary>

      {/* Invoice Layout Visual Editor Modal */}
      <InvoiceEditorModal
        isOpen={isInvoiceEditorOpen}
        onClose={() => setIsInvoiceEditorOpen(false)}
        onSaveSuccess={(savedConfig) => {
          showToast('🎉 Konfigurasi & Layout Visual Invoice berhasil diperbarui!');
          if (savedConfig) {
            setFullInvoiceConfig(prev => ({ ...prev, ...savedConfig }));
            if (savedConfig.companyName) setCompanyName(savedConfig.companyName);
            if (savedConfig.companyAddress) setCompanyAddress(savedConfig.companyAddress);
            if (savedConfig.supportPhone) setSupportPhone(savedConfig.supportPhone);
            if (savedConfig.supportEmail) setSupportEmail(savedConfig.supportEmail);
            if (savedConfig.signatoryName) setSignatoryName(savedConfig.signatoryName);
            if (savedConfig.signatoryTitle) setSignatoryTitle(savedConfig.signatoryTitle);
            if (savedConfig.signatureImage) setSignatureImage(savedConfig.signatureImage);
          }
        }}
        showToast={showToast}
      />

      {/* Invoice A4 Preview Modal */}
      {selectedInvoiceForA4Preview && (
        <InvoiceA4View
          invoice={selectedInvoiceForA4Preview}
          onClose={() => setSelectedInvoiceForA4Preview(null)}
          onOpenEditor={() => {
            setSelectedInvoiceForA4Preview(null);
            setIsInvoiceEditorOpen(true);
          }}
        />
      )}
    </div>
  );
}

// Subcomponent: Brand Category Manager inside Settings Page (with Project Isolation)
function BrandCategoryManagerSettings() {
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    return new URLSearchParams(window.location.search).get('projectId') || 
           new URLSearchParams(window.location.search).get('project') || 
           'global';
  });
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  // Load Projects list
  useEffect(() => {
    async function loadProjects() {
      try {
        const list = await api.fetchFloorplanList();
        if (Array.isArray(list) && list.length > 0) {
          setProjects(list);
        }
      } catch (e) {
        console.warn("Failed to load projects list in BrandCategoryManagerSettings:", e);
      }
    }
    loadProjects();
  }, []);

  // Load Categories whenever selectedProjectId changes
  const loadCategories = async () => {
    try {
      const cats = await api.fetchBrandCategories(false, selectedProjectId);
      if (Array.isArray(cats)) setCategories(cats);
    } catch (e) {}
  };

  useEffect(() => {
    loadCategories();
  }, [selectedProjectId]);

  const handleAdd = async (e) => {
    if (e) e.preventDefault();
    if (!newCatName.trim()) {
      alert('Mohon isi nama kategori brand terlebih dahulu.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.createBrandCategory({ 
        name: newCatName.trim(), 
        isActive: true,
        projectId: selectedProjectId 
      });
      setLoading(false);
      if (res && res.success) {
        setNewCatName('');
        await loadCategories();
      } else {
        alert(res?.error || 'Gagal menambahkan kategori');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan sistem saat menambah kategori');
    }
  };

  const handleCopyDefault = async () => {
    if (selectedProjectId === 'global') return;
    setLoading(true);
    try {
      const res = await api.copyDefaultBrandCategories(selectedProjectId);
      setLoading(false);
      if (res && res.success) {
        await loadCategories();
      } else {
        alert(res?.error || 'Gagal menyalin kategori default');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan');
    }
  };

  const handleToggle = async (cat) => {
    try {
      const res = await api.updateBrandCategory(cat.id, { isActive: !cat.isActive });
      if (res && res.success) loadCategories();
    } catch (e) {}
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      const res = await api.updateBrandCategory(id, { name: editName.trim() });
      if (res && res.success) {
        setEditingId(null);
        await loadCategories();
      } else {
        alert(res?.error || 'Gagal mengubah kategori');
      }
    } catch (err) {
      alert(err?.message || 'Terjadi kesalahan');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus kategori brand ini?')) return;
    try {
      const res = await api.deleteBrandCategory(id);
      if (res && res.success) loadCategories();
      else alert(res?.error || 'Gagal menghapus kategori');
    } catch (err) {
      alert(err?.message || 'Terjadi kesalahan');
    }
  };

  const handleSaveProjectCategories = async () => {
    setLoading(true);
    try {
      const res = await api.saveProjectBrandCategories(selectedProjectId, categories);
      setLoading(false);
      if (res && res.success) {
        await loadCategories();
        alert(`✅ ${res.message || `Kategori brand berhasil disimpan khusus untuk project "${currentProjectName}"!`}`);
      } else {
        alert(res?.error || 'Gagal menyimpan kategori project');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan sistem saat menyimpan');
    }
  };

  const currentProjectName = selectedProjectId === 'global' 
    ? '📌 Default Sistem (Global)' 
    : (projects.find(p => p.id === selectedProjectId)?.title || projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId);

  return (
    <div className="space-y-4">
      {/* Project Selector Bar */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="space-y-0.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block flex items-center gap-1.5">
            <Building2 size={14} /> Pilih Project / Denah Pameran:
          </label>
          <span className="text-xs text-slate-300">
            Mengatur kategori brand secara terpisah khusus untuk project terpilih.
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[220px]"
          >
            <option value="global">📌 Default Sistem (Global - Semua Project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                🏬 {p.id}: {p.title || p.name || 'Denah Pameran'}
              </option>
            ))}
          </select>

          {selectedProjectId !== 'global' && (
            <button
              type="button"
              onClick={handleCopyDefault}
              disabled={loading}
              title="Salin kategori brand default ke project ini"
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Copy size={13} />
              <span className="hidden md:inline">Salin Default</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveProjectCategories}
            disabled={loading}
            title={`Simpan dan pisahkan kategori brand khusus untuk project ${currentProjectName}`}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Save size={14} />
            <span>Simpan Kategori Project</span>
          </button>
        </div>
      </div>

      {/* Active Project Info Badge */}
      <div className="flex items-center justify-between bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs">
        <div className="flex items-center gap-2 text-indigo-900 font-bold">
          <Sparkles size={15} className="text-indigo-600" />
          <span>Mengelola Kategori Brand untuk: <span className="underline decoration-indigo-300">{currentProjectName}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded font-mono font-bold">
            Total {categories.length} Kategori
          </span>
          <button
            type="button"
            onClick={handleSaveProjectCategories}
            disabled={loading}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs disabled:opacity-50"
          >
            <Save size={13} /> Simpan Kategori Project
          </button>
        </div>
      </div>

      {/* Form Add Brand Category */}
      <div className="flex gap-2 max-w-md">
        <input
          type="text"
          placeholder={`Tambah Kategori Brand untuk ${selectedProjectId === 'global' ? 'Global' : selectedProjectId}...`}
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd(e);
          }}
          className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <Plus size={14} /> Tambah Kategori
        </button>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
              cat.isActive
                ? 'bg-slate-50/80 border-slate-200'
                : 'bg-slate-100/60 border-slate-200 opacity-60'
            }`}
          >
            {editingId === cat.id ? (
              <div className="flex items-center gap-1.5 w-full">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-2.5 py-1 bg-white border border-indigo-400 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(cat.id)}
                  className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                >
                  <Check size={13} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cat.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span className="font-bold text-slate-800 text-xs truncate">{cat.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggle(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                      cat.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-200 text-slate-600 border-slate-300'
                    }`}
                  >
                    {cat.isActive ? 'Aktif' : 'Off'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Subcomponent: Payment Method Manager inside Settings Page
function PaymentMethodManagerSettings() {
  const [methods, setMethods] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIconType, setNewIconType] = useState('va');
  const [newIsActive, setNewIsActive] = useState(true);

  // Edit Mode state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIconType, setEditIconType] = useState('va');
  const [editIsActive, setEditIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMethods = async () => {
    try {
      const data = await api.fetchPaymentMethods(false);
      if (Array.isArray(data)) setMethods(data);
    } catch (e) {
      console.warn("Failed to load payment methods in manager:", e);
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    const key = newKey.trim() 
      ? newKey.trim().toLowerCase().replace(/\s+/g, '_') 
      : newName.trim().toLowerCase().replace(/\s+/g, '_');
    const res = await api.createPaymentMethod({
      key,
      name: newName.trim(),
      description: newDescription.trim(),
      icon_type: newIconType,
      is_active: newIsActive,
      sort_order: methods.length + 1
    });
    setLoading(false);
    if (res.success) {
      setNewKey('');
      setNewName('');
      setNewDescription('');
      setNewIconType('va');
      setNewIsActive(true);
      loadMethods();
    }
  };

  const handleToggle = async (pm) => {
    const res = await api.updatePaymentMethod(pm.id, { is_active: !pm.is_active });
    if (res.success) loadMethods();
  };

  const startEdit = (pm) => {
    setEditingId(pm.id);
    setEditName(pm.name);
    setEditDescription(pm.description || '');
    setEditIconType(pm.icon_type || 'va');
    setEditIsActive(pm.is_active !== false);
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    const res = await api.updatePaymentMethod(id, {
      name: editName.trim(),
      description: editDescription.trim(),
      icon_type: editIconType,
      is_active: editIsActive
    });
    if (res.success) {
      setEditingId(null);
      loadMethods();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus metode pembayaran ini?')) return;
    const res = await api.deletePaymentMethod(id);
    if (res.success) loadMethods();
  };

  return (
    <div className="space-y-5">
      {/* Form Tambah Metode Pembayaran */}
      <form onSubmit={handleAdd} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Plus size={14} className="text-indigo-600" /> Tambah Formulir Opsi Metode Pembayaran Baru
          </h4>
          <span className="text-[10px] text-slate-500 font-medium">Auto-Sync ke Checkout Booking</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Nama Metode Pembayaran *</label>
            <input
              type="text"
              placeholder="Contoh: Permata Virtual Account"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Deskripsi Ringkas</label>
            <input
              type="text"
              placeholder="Contoh: Transfer Bank Permata"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipe Ikon</label>
            <select
              value={newIconType}
              onChange={(e) => setNewIconType(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
            >
              <option value="qris">QRIS (QrCode)</option>
              <option value="va">Virtual Account (Bank)</option>
              <option value="cc">Kartu Kredit/Debit</option>
              <option value="manual">Transfer Manual</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || !newName.trim()}
              className="w-full py-1.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 transition-all shadow-sm"
            >
              <Plus size={14} /> Simpan Metode
            </button>
          </div>
        </div>
      </form>

      {/* Daftar Metode Pembayaran (View & Edit Mode) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {methods.map((pm) => (
          <div
            key={pm.id}
            className={`p-4 rounded-2xl border transition-all ${
              editingId === pm.id
                ? 'bg-indigo-50/40 border-indigo-300 ring-2 ring-indigo-500/20'
                : pm.is_active
                ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                : 'bg-slate-100/70 border-slate-200 opacity-60'
            }`}
          >
            {editingId === pm.id ? (
              /* MODE EDIT */
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Edit2 size={13} className="text-indigo-600" /> Mode Edit Metode Pembayaran (#{pm.id})
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold">
                    Key: {pm.key}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Metode</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      placeholder="Nama Metode Pembayaran"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Deskripsi Ringkas</label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none"
                      placeholder="Deskripsi Metode"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Tipe Ikon</label>
                      <select
                        value={editIconType}
                        onChange={(e) => setEditIconType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                      >
                        <option value="qris">QRIS (QrCode)</option>
                        <option value="va">Virtual Account (Bank)</option>
                        <option value="cc">Kartu Kredit/Debit</option>
                        <option value="manual">Transfer Manual</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Status Keaktifan</label>
                      <button
                        type="button"
                        onClick={() => setEditIsActive(!editIsActive)}
                        className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          editIsActive
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                      >
                        <CheckCircle2 size={13} />
                        <span>{editIsActive ? 'Aktif' : 'Non-Aktif'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-indigo-100">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(pm.id)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                  >
                    <Check size={14} /> Simpan Perubahan
                  </button>
                </div>
              </div>
            ) : (
              /* MODE DISPLAY / VIEW */
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${pm.is_active ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-400'}`} />
                    <span className="font-bold text-slate-900 text-xs tracking-tight">{pm.name}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono border border-slate-200">
                      {pm.key}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 pl-4">{pm.description || 'Tidak ada deskripsi'}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Mode Aktif / Non-Aktif Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(pm)}
                    title="Klik untuk mengubah status Aktif / Non-Aktif"
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      pm.is_active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${pm.is_active ? 'bg-emerald-600' : 'bg-slate-500'}`} />
                    <span>{pm.is_active ? 'Aktif' : 'Non-Aktif'}</span>
                  </button>

                  {/* Mode Edit Button */}
                  <button
                    type="button"
                    onClick={() => startEdit(pm)}
                    title="Edit Metode Pembayaran"
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer border border-transparent hover:border-indigo-200"
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Hapus Button */}
                  <button
                    type="button"
                    onClick={() => handleDelete(pm.id)}
                    title="Hapus Metode Pembayaran"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer border border-transparent hover:border-rose-200"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Subcomponent: Booth Tier & Price Category Manager inside Settings Page
function BoothTierManagerSettings() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Form State for new Tier
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [widthM, setWidthM] = useState('3');
  const [heightM, setHeightM] = useState('3');
  const [defaultPrice, setDefaultPrice] = useState('5000000');
  const [isFree, setIsFree] = useState(false);
  const [color, setColor] = useState('#3b82f6');
  const [description, setDescription] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const loadTiers = async () => {
    try {
      const data = await api.fetchCategories();
      if (Array.isArray(data)) {
        setTiers(data);
        updateBoothCategoriesRegistry(data);
      }
    } catch (e) {
      console.warn("Failed to load booth tiers:", e);
    }
  };

  useEffect(() => {
    loadTiers();
  }, []);

  const handleAddTier = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      alert('Mohon isi nama tier harga booth terlebih dahulu.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.createCategory({
        name: name.trim(),
        key: key.trim() || name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        widthM: parseFloat(widthM) || 3,
        heightM: parseFloat(heightM) || 3,
        defaultPrice: isFree ? 0 : parseInt(defaultPrice, 10) || 0,
        isFree,
        color,
        borderColor: color,
        description: description.trim()
      });
      setLoading(false);
      if (res && res.success) {
        setName('');
        setKey('');
        setWidthM('3');
        setHeightM('3');
        setDefaultPrice('5000000');
        setIsFree(false);
        setColor('#3b82f6');
        setDescription('');
        await loadTiers();
        alert(`✨ Tier harga booth "${res.category?.name || name}" berhasil ditambahkan!`);
      } else {
        alert(res?.error || 'Gagal menambahkan tier harga booth');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan sistem saat menambah tier booth');
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editData.name?.trim()) {
      alert('Nama tier wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const res = await api.updateCategory(id, {
        name: editData.name.trim(),
        widthM: parseFloat(editData.widthM) || 3,
        heightM: parseFloat(editData.heightM) || 3,
        defaultPrice: editData.isFree ? 0 : parseInt(editData.defaultPrice, 10) || 0,
        isFree: editData.isFree,
        color: editData.color,
        borderColor: editData.color,
        description: editData.description || ''
      });
      setLoading(false);
      if (res && res.success) {
        setEditingId(null);
        await loadTiers();
      } else {
        alert(res?.error || 'Gagal mengubah tier booth');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan');
    }
  };

  const handleDeleteTier = async (id, tierName) => {
    if (!window.confirm(`Hapus tier harga booth "${tierName}"?`)) return;
    setLoading(true);
    try {
      const res = await api.deleteCategory(id);
      setLoading(false);
      if (res && res.success) {
        await loadTiers();
      } else {
        alert(res?.error || 'Gagal menghapus tier booth');
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || 'Terjadi kesalahan');
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Kembalikan seluruh tier harga booth ke preset standar sistem?')) return;
    setLoading(true);
    try {
      const res = await api.resetCategories();
      setLoading(false);
      if (res && res.success) {
        await loadTiers();
        alert('Preset tier harga booth berhasil di-reset!');
      }
    } catch (e) {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Form Add New Booth Tier */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Plus size={14} className="text-indigo-600" /> Form Tambah Tier Harga & Ukuran Booth Baru:
          </span>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={loading}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={12} /> Reset ke Preset Default
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Tier Booth *</label>
            <input
              type="text"
              placeholder="cth: VVIP Grand Stand"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTier(e);
              }}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Ukuran (M): Lebar x Panjang</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.5"
                min="1"
                placeholder="W"
                value={widthM}
                onChange={(e) => setWidthM(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none text-center"
              />
              <span className="text-slate-400 text-xs font-bold">x</span>
              <input
                type="number"
                step="0.5"
                min="1"
                placeholder="H"
                value={heightM}
                onChange={(e) => setHeightM(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none text-center"
              />
              <span className="text-slate-500 text-xs font-semibold">m</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Harga Default (Rp)</label>
            <input
              type="number"
              step="100000"
              disabled={isFree}
              placeholder="5000000"
              value={isFree ? 0 : defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Warna Accent & Gratis</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5 shrink-0"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="rounded text-indigo-600 cursor-pointer"
                />
                <span>Gratis / Sponsor</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <input
            type="text"
            placeholder="Deskripsi singkat tier (opsional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 max-w-md px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddTier}
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus size={14} />
            <span>Tambah Tier Booth</span>
          </button>
        </div>
      </div>

      {/* Grid of Existing Booth Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {tiers.map((t) => (
          <div
            key={t.id}
            className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs hover:border-indigo-300 transition-all"
            style={{ borderLeftWidth: '4px', borderLeftColor: t.color || '#3b82f6' }}
          >
            {editingId === t.id ? (
              <div className="space-y-2 w-full">
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-indigo-400 rounded text-xs font-bold text-slate-900"
                />
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="number"
                    value={editData.widthM}
                    onChange={(e) => setEditData({ ...editData, widthM: e.target.value })}
                    className="w-14 px-1.5 py-0.5 border rounded text-center text-xs"
                  />
                  <span>x</span>
                  <input
                    type="number"
                    value={editData.heightM}
                    onChange={(e) => setEditData({ ...editData, heightM: e.target.value })}
                    className="w-14 px-1.5 py-0.5 border rounded text-center text-xs"
                  />
                  <span>m</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="number"
                    disabled={editData.isFree}
                    value={editData.isFree ? 0 : editData.defaultPrice}
                    onChange={(e) => setEditData({ ...editData, defaultPrice: e.target.value })}
                    className="w-28 px-1.5 py-0.5 border rounded text-xs"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(t.id)}
                      className="p-1 bg-emerald-600 text-white rounded cursor-pointer"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 bg-slate-200 text-slate-700 rounded cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 text-xs truncate">{t.name}</span>
                    {t.isFree && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                        Gratis
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {t.widthM}m x {t.heightM}m ({t.widthM * t.heightM} m²)
                  </div>
                  <div className="text-xs font-black text-indigo-700">
                    {t.isFree ? 'Rp 0 (Sponsor)' : `Rp ${(t.defaultPrice || 0).toLocaleString('id-ID')}`}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditData({ ...t });
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTier(t.id, t.name)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
