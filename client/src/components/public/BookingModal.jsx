import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Tag, 
  Maximize, 
  ShieldCheck, 
  CreditCard, 
  QrCode, 
  Building, 
  User, 
  Mail, 
  Phone, 
  Briefcase, 
  ArrowRight, 
  ArrowLeft, 
  Clock, 
  Copy, 
  Check, 
  Receipt, 
  Download, 
  Sparkles,
  AlertCircle,
  FileText,
  Send,
  BookmarkCheck,
  Wallet,
  Landmark,
  Zap,
  HelpCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { computeContractTax, DEFAULT_TAX_NOTE } from '../../utils/invoiceTax';

// Organizer's bank accounts, company name and WhatsApp come from Setting (database), never from this file
const banksFromConfig = (cfg = {}) => [
  { id: 'bank1', bankName: cfg.bank1Name || cfg.bankName, accountNumber: cfg.bank1AccNumber || cfg.accountNumber, accountHolder: cfg.bank1AccHolder || cfg.accountName, branch: cfg.bank1Branch || cfg.bankBranch },
  { id: 'bank2', bankName: cfg.bank2Name, accountNumber: cfg.bank2AccNumber, accountHolder: cfg.bank2AccHolder, branch: cfg.bank2Branch }
].filter(b => String(b.bankName || '').trim() && String(b.accountNumber || '').trim());
const waNumber = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
};

export default function BookingModal({ 
  booth, 
  booths = [], 
  isPaymentActive = true, 
  onClose, 
  onSuccessBooking, 
  projectId = null,
  isAdmin = false,
  mode = 'register', // 'register' | 'edit'
  initialData = null,
  onUpdateBiodata = null
}) {
  // Steps: 'form' | 'payment' | 'success'
  const [step, setStep] = useState('form');
  // PPN from Setting (rate, and whether online registrations are taxed). Admins choose per registration.
  const [taxCfg, setTaxCfg] = useState({ rate: 11, publicTax: true, method: 'exclusive', display: 'show', note: DEFAULT_TAX_NOTE });
  const [orgCfg, setOrgCfg] = useState({ companyName: '', whatsapp: '', banks: [] });
  const [issuedTotal, setIssuedTotal] = useState(null);
  const [adminApplyTax, setAdminApplyTax] = useState(null); // null = follow the setting
  useEffect(() => {
    api.fetchInvoiceConfig().then(cfg => {
      if (!cfg) return;
      const rate = Number(cfg.taxRate);
      const method = cfg.defaultTaxMethod === 'inclusive' ? 'inclusive' : 'exclusive';
      const minDp = Number(cfg.publicMinDpPercent);
      if (Number.isFinite(minDp) && minDp >= 1 && minDp < 100) {
        setMinDpPercent(minDp);
        setDpPercentInput(prev => (Number(prev) >= minDp ? prev : String(minDp)));
      }
      const banks = banksFromConfig(cfg);
      setOrgCfg({ companyName: cfg.companyName || '', whatsapp: waNumber(cfg.supportWhatsapp || cfg.supportPhone), banks });
      setTransferBank(prev => prev || banks[0]?.bankName || '');
      setTaxCfg({
        rate: Number.isFinite(rate) && rate >= 0 ? rate : 11,
        publicTax: cfg.publicBookingTax !== false,
        method,
        display: method === 'inclusive' && cfg.defaultTaxDisplay === 'hide' ? 'hide' : 'show',
        note: String(cfg.taxNote || '').trim() || DEFAULT_TAX_NOTE
      });
    });
  }, []);

  const boothList = Array.isArray(booths) && booths.length > 0 
    ? booths 
    : (booth ? [booth] : []);

  // Form Fields - initialized from initialData if provided
  const [fullName, setFullName] = useState(initialData?.fullName || initialData?.picName || initialData?.pic || '');
  const [brandName, setBrandName] = useState(initialData?.brandName || initialData?.company || initialData?.ownerName || booth?.ownerName || '');
  const [brandCategory, setBrandCategory] = useState(initialData?.brandCategory || booth?.brandCategory || '');
  const [brandCategories, setBrandCategories] = useState([]);
  // No email field in the form (AGENTS.md §29). An email already on file (editing a tenant, or a registered client
  // picked from the duplicate warning) is carried along unchanged.
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || initialData?.contact || '');
  const [formErrors, setFormErrors] = useState({});
  // Server refused the booking (e.g. a booth of the selection was just booked by someone else)
  const [submitError, setSubmitError] = useState('');

  // Duplicate exhibitor warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [adminStatusChoice, setAdminStatusChoice] = useState('reserved'); // 'reserved' | 'sold'

  // Public options: 'booking' | 'manual_transfer' ('payment_gateway' is only used internally for admin "Lunas" registrations)
  const [bookingType, setBookingType] = useState('booking');

  // Manual Transfer state
  const [transferBank, setTransferBank] = useState('');
  const [transferSenderName, setTransferSenderName] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [copiedBankId, setCopiedBankId] = useState(null);

  // Payment Gateway Method
  const [paymentMethod, setPaymentMethod] = useState('qris'); // default key
  const [paymentMethodsList, setPaymentMethodsList] = useState([
    { id: 1, key: 'qris', name: 'QRIS Instan', description: 'GoPay, OVO, Dana, Shopee, BCA QR', icon_type: 'qris' },
    { id: 2, key: 'bca_va', name: 'BCA Virtual Account', description: 'Verifikasi Otomatis', icon_type: 'va' },
    { id: 3, key: 'mandiri_va', name: 'Mandiri / BNI VA', description: 'Virtual Account Bank', icon_type: 'va' },
    { id: 4, key: 'cc', name: 'Kartu Kredit / Debit', description: 'Visa, Mastercard, JCB', icon_type: 'cc' }
  ]);
  const [copiedVA, setCopiedVA] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Timer for payment
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes

  // Skema Pembayaran: 'full' (100%) | 'dp' (Uang Muka 50%)
  const [paymentScheme, setPaymentScheme] = useState('full');
  // DP chosen by the registrant (% of the total), at least the minimum from Setting > Aturan Booking
  const [minDpPercent, setMinDpPercent] = useState(20);
  const [dpPercentInput, setDpPercentInput] = useState('20');

  const firstBooth = boothList[0];
  const activeProjectId = projectId || firstBooth?.floorplan_id || firstBooth?.floorplanId || firstBooth?.projectId || new URLSearchParams(window.location.search).get('templateId') || new URLSearchParams(window.location.search).get('project') || 'FP-2026-001';

  // Live duplicate check on the phone number
  useEffect(() => {
    let cancel = false;
    const checkDuplicate = async () => {
      if (phone && phone.length >= 9) {
        try {
          const res = await api.checkExistingExhibitor({ phone });
          // Visitors only get "already registered" (no name / contact of the other exhibitor)
          if (!cancel && res && res.exists && !res.client) {
            setDuplicateWarning({ generic: true });
            return;
          }
          if (!cancel && res && res.exists && res.client) {
            // Only warn if different from current initialData
            if (!initialData || initialData.phone !== res.client.phone) {
              setDuplicateWarning(res.client);
              return;
            }
          }
        } catch (e) {}
      }
      if (!cancel) setDuplicateWarning(null);
    };

    const timer = setTimeout(checkDuplicate, 450);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [phone, initialData]);

  useEffect(() => {
    async function loadData() {
      try {
        const cats = await api.fetchBrandCategories(true, activeProjectId);
        if (cats && Array.isArray(cats) && cats.length > 0) {
          const activeOnly = cats.filter(c => c.isActive !== false);
          setBrandCategories(activeOnly);
          if (activeOnly.length > 0) {
            setBrandCategory(prev => {
              const exists = activeOnly.some(c => c.name === prev);
              return exists ? prev : activeOnly[0].name;
            });
          } else {
            setBrandCategory('');
          }
        } else {
          setBrandCategories([]);
          setBrandCategory('');
        }
      } catch (e) {
        console.warn("Failed to load active brand categories for project:", activeProjectId, e);
      }

      try {
        const pms = await api.fetchPaymentMethods(true);
        if (Array.isArray(pms) && pms.length > 0) {
          setPaymentMethodsList(pms);
          if (pms.length > 0) {
            setPaymentMethod(pms[0].key);
          }
        }
      } catch (e) {
        console.warn("Failed to load payment methods:", e);
      }
    }
    loadData();
  }, [activeProjectId, firstBooth?.id, firstBooth?.code]);

  useEffect(() => {
    if (step === 'payment') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step]);

  if (boothList.length === 0) return null;

  const isMultiBooth = boothList.length > 1;
  const boothCode = boothList.map(b => b.booth_number || b.code).join(', ');
  const totalArea = boothList.reduce((acc, b) => {
    const w = b.widthM || b.dimensions_meters?.width || 3;
    const h = b.heightM || b.dimensions_meters?.height || 3;
    return acc + (w * h);
  }, 0);
  const width = firstBooth?.widthM || firstBooth?.dimensions_meters?.width || 3;
  const height = firstBooth?.heightM || firstBooth?.dimensions_meters?.height || 3;
  const area = totalArea;
  const price = boothList.reduce((acc, b) => acc + (b.price || 5000000), 0);
  // Estimate shown in the form; the server computes the invoice itself (price - private discount, PPN added on top
  // of or included in the price according to the Setting default)
  const applyTax = isAdmin ? (adminApplyTax ?? taxCfg.publicTax) : taxCfg.publicTax;
  const taxSplit = computeContractTax({ subtotal: price, rate: taxCfg.rate, method: applyTax ? taxCfg.method : 'none' });
  const ppn = taxSplit.ppn;
  const grandTotal = taxSplit.total;
  const taxIncluded = applyTax && taxCfg.method === 'inclusive';
  const dpPercent = Math.round((parseFloat(String(dpPercentInput).replace(',', '.')) || 0) * 100) / 100;
  const dpAmount = Math.round((grandTotal * dpPercent) / 100);
  const dpInvalid = paymentScheme === 'dp' && !(dpPercent >= minDpPercent && dpPercent < 100);
  const invoiceNumber = `INV/EXP-${Date.now().toString().slice(-6)}`;
  // Total computed by the server (price - private discount + PPN), shown after the registration was saved
  const shownTotal = issuedTotal ?? grandTotal;
  const planLabel = paymentScheme === 'dp' ? `Uang Muka (DP ${dpPercent}%) Rp ${dpAmount.toLocaleString('id-ID')}, sisanya Pelunasan` : 'Bayar Penuh (100%)';
  const vaNumber = `8809${Math.floor(100000000000 + Math.random() * 900000000000)}`;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!fullName.trim()) errors.fullName = 'Nama lengkap wajib diisi';
    if (!brandName.trim()) errors.brandName = 'Nama brand / perusahaan wajib diisi';
    if (!brandCategory.trim()) errors.brandCategory = 'Kategori brand wajib dipilih';
    if (!phone.trim() || phone.length < 9) errors.phone = 'Nomor HP / WhatsApp wajib diisi (minimal 9 digit)';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAdminDirectSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validateForm()) return;

    if (mode === 'edit') {
      setIsProcessing(true);
      try {
        const payload = {
          floorplanId: activeProjectId,
          boothId: boothList[0]?.id,
          boothCode: boothList[0]?.code || boothCode,
          oldEmail: initialData?.email,
          fullName: fullName.trim(),
          brandName: brandName.trim(),
          brandCategory: brandCategory.trim(),
          email: email.trim(),
          phone: phone.trim()
        };
        const res = await api.updateTenantBiodata(payload);
        if (res && res.success) {
          onUpdateBiodata?.({
            ...payload,
            picName: fullName.trim(),
            ownerName: brandName.trim()
          });
          onClose();
        } else {
          alert(res?.error || 'Gagal memperbarui biodata');
        }
      } catch (err) {
        console.error('Update tenant error:', err);
        alert('Terjadi kesalahan saat memperbarui biodata');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Mode is admin registration
    if (adminStatusChoice !== 'sold' && dpInvalid) { setSubmitError(`DP minimal ${minDpPercent}% dan kurang dari 100%. Untuk 100% pilih "Bayar Penuh".`); return; }
    setIsProcessing(true);
    const isSold = adminStatusChoice === 'sold';
    const resolvedPaymentStatus = isSold ? 'PAID' : 'UNPAID';
    const resolvedBookingType = isSold ? 'payment_gateway' : 'booking';
    const resolvedPaymentMethod = isSold ? 'Pendaftaran Langsung Admin (Lunas)' : 'Booking Admin (Draft Tagihan)';

    onSuccessBooking?.({
      boothIds: boothList.map(b => b.id),
      boothCodes: boothList.map(b => b.code || b.booth_number),
      boothId: boothList[0]?.id,
      boothCode,
      fullName: fullName.trim(),
      brandName: brandName.trim(),
      brandCategory: brandCategory.trim(),
      email: email.trim(),
      phone: phone.trim(),
      price,
      grandTotal,
      applyTax,
      taxRate: taxCfg.rate,
      paymentType: !isSold && paymentScheme === 'dp' ? 'dp' : 'full',
      dpPercent: !isSold && paymentScheme === 'dp' ? dpPercent : 0,
      paidAmount: isSold ? grandTotal : 0,
      remainingAmount: isSold ? 0 : grandTotal,
      bookingType: resolvedBookingType,
      paymentMethod: resolvedPaymentMethod,
      paymentStatus: resolvedPaymentStatus,
      invoiceNumber,
      bookingDate: new Date().toISOString(),
      floorplanId: activeProjectId,
      source: 'admin',
      adminName: 'Admin'
    });
    setIsProcessing(false);
  };

  const handleProceedToPayment = (e) => {
    e.preventDefault();
    if (validateForm()) {
      if (isAdmin && mode === 'edit') {
        handleAdminDirectSubmit(e);
      } else if (isAdmin) {
        handleAdminDirectSubmit(e);
      } else {
        setStep('payment');
      }
    }
  };

  const handleCopyVA = () => {
    navigator.clipboard.writeText(vaNumber);
    setCopiedVA(true);
    setTimeout(() => setCopiedVA(false), 2000);
  };

  const handleCopyBank = (accNum, id) => {
    navigator.clipboard.writeText(accNum.replace(/-/g, ''));
    setCopiedBankId(id);
    setTimeout(() => setCopiedBankId(null), 2000);
  };

  const handleConfirmPayment = async () => {
    setIsProcessing(true);
    setSubmitError('');
    await new Promise(r => setTimeout(r, 600));
    {
      let resolvedPaymentMethod = paymentMethod;
      let resolvedPaymentStatus = 'PAID';

      if (bookingType === 'booking') {
        resolvedPaymentMethod = 'Booking Hold (Belum Bayar)';
        resolvedPaymentStatus = 'UNPAID';
      } else if (bookingType === 'manual_transfer') {
        resolvedPaymentMethod = `Transfer Bank Manual (${transferBank})`;
        resolvedPaymentStatus = 'PENDING';
      }

      const isDp = paymentScheme === 'dp';
      const paidAmt = isDp ? dpAmount : grandTotal;
      const remAmt = isDp ? Math.max(0, grandTotal - paidAmt) : 0;
      const finalPaymentStatus = isDp 
        ? (resolvedPaymentStatus === 'PAID' ? 'PARTIAL' : resolvedPaymentStatus) 
        : resolvedPaymentStatus;

      // One request for every selected booth; the page answers once the server confirmed (or refused) it
      const result = await onSuccessBooking?.({
        // multi-booth arrays (primary)
        boothIds: boothList.map(b => b.id),
        boothCodes: boothList.map(b => b.code || b.booth_number),
        // single-booth fallback for backward compat
        boothId: boothList[0]?.id,
        boothCode,
        fullName,
        brandName,
        brandCategory,
        email: email.trim(),
        phone,
        price,
        grandTotal,
        applyTax,
        taxRate: taxCfg.rate,
        paymentType: isDp ? 'dp' : 'full',
        dpPercent: isDp ? dpPercent : 0,
        paidAmount: paidAmt,
        remainingAmount: remAmt,
        bookingType,
        paymentMethod: resolvedPaymentMethod,
        paymentStatus: finalPaymentStatus,
        transferBank,
        transferSenderName,
        notes: transferNotes,
        invoiceNumber,
        bookingDate: new Date().toISOString(),
        floorplanId: activeProjectId
      });
      setIsProcessing(false);
      if (result && result.success === false) {
        setSubmitError(result.unavailable?.length
          ? `Booth ${result.unavailable.join(', ')} baru saja dipesan orang lain dan dikeluarkan dari pilihan Anda. Periksa kembali pilihan booth lalu kirim ulang.`
          : (result.error || 'Pemesanan gagal diproses. Silakan coba lagi.'));
        setStep('form');
        return;
      }
      setIssuedTotal(Number.isFinite(Number(result?.order?.totalAmount)) ? Number(result.order.totalAmount) : null);
      setStep('success');
    }
  };

  // Payment plan chooser (Bayar Penuh / Uang Muka with a percentage): the same for visitors and staff
  const schemePanel = (
    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-700">Pilihan Skema Pembayaran:</span>
        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
          Bisa Uang Muka (DP)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPaymentScheme('full')}
          className={`p-2 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
            paymentScheme === 'full'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div>Bayar Penuh (100%)</div>
          <div className={`text-[10px] mt-0.5 font-normal ${paymentScheme === 'full' ? 'text-indigo-100' : 'text-slate-400'}`}>
            Dibayar Sekaligus
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentScheme('dp')}
          className={`p-2 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
            paymentScheme === 'dp'
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div>Uang Muka / DP</div>
          <div className={`text-[10px] mt-0.5 font-normal ${paymentScheme === 'dp' ? 'text-blue-100' : 'text-slate-400'}`}>
            Minimal {minDpPercent}% dari total
          </div>
        </button>
      </div>

      {/* Rincian Biaya */}
      <div className="pt-2 border-t border-slate-200 space-y-1.5">
        {isMultiBooth && (
          <div className="space-y-1 mb-2">
            <span className="text-[11px] font-bold text-slate-700 block">Rincian Per Unit Booth:</span>
            {boothList.map((b, idx) => (
              <div key={b.id || idx} className="flex justify-between text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80">
                <span>Booth {b.code || b.booth_number} ({b.category || 'Standard'} • {b.widthM || 3}x{b.heightM || 3}m)</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {b.status === 'free' ? 'GRATIS' : `Rp ${(b.price || 5000000).toLocaleString('id-ID')}`}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>Total Sewa {isMultiBooth ? `${boothList.length} Booth` : `Booth ${boothCode}`} {brandName ? `(${brandName})` : ''}</span>
          <span className="font-semibold text-slate-800 font-mono">Rp {price.toLocaleString('id-ID')}</span>
        </div>
        {isAdmin && (
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-slate-600">Pajak (PPN)</span>
            <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
              {[[true, `Dengan PPN ${taxCfg.rate}%`], [false, 'Tanpa PPN']].map(([val, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAdminApplyTax(val)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${applyTax === val ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!(taxIncluded && taxCfg.display === 'hide') && (
          <div className="flex justify-between text-slate-600">
            <span>{applyTax ? `PPN ${taxCfg.rate}%${taxIncluded ? ' (sudah termasuk dalam harga)' : ''}` : 'PPN'}</span>
            <span className="font-semibold text-slate-800 font-mono">{applyTax ? `Rp ${ppn.toLocaleString('id-ID')}` : 'Tidak dikenakan'}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>Biaya Administrasi</span>
          <span className="font-semibold text-emerald-600">GRATIS</span>
        </div>

        <div className="h-px bg-slate-200 my-1" />
        <div className="flex justify-between text-sm font-black text-slate-900 pt-0.5">
          <span>Total Tagihan Kontrak:</span>
          <span className="font-mono text-base text-slate-900">
            Rp {grandTotal.toLocaleString('id-ID')}
          </span>
        </div>
        {taxIncluded && <div className="text-[10px] italic text-slate-500 text-right">{taxCfg.note}</div>}

        {paymentScheme === 'dp' && (
          <div className="mt-2 p-2.5 bg-blue-50/90 rounded-xl border border-blue-200 space-y-2 animate-fadeIn">
            <div className="font-bold text-blue-900 text-xs">Berapa DP yang akan dibayarkan?</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[...new Set([minDpPercent, 30, 50].filter(p => p >= minDpPercent && p < 100))].map(p => (
                <button key={p} type="button" onClick={() => setDpPercentInput(String(p))}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${dpPercent === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                  {p}%
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <input type="text" inputMode="decimal" value={dpPercentInput} onChange={(e) => setDpPercentInput(e.target.value)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                <span className="text-xs font-bold text-slate-600">%</span>
              </div>
            </div>
            {dpInvalid && (
              <div className="text-[11px] font-semibold text-rose-600">DP minimal {minDpPercent}% dan kurang dari 100%. Untuk 100% pilih "Bayar Penuh".</div>
            )}
            <div className="flex justify-between font-bold text-blue-900 text-xs">
              <span>Uang Muka (DP {dpPercent}%):</span>
              <span className="font-mono font-black text-emerald-700">Rp {dpAmount.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between font-bold text-amber-800 text-xs border-t border-blue-200/60 pt-1">
              <span>Sisa ditagih lewat Invoice Pelunasan:</span>
              <span className="font-mono font-black text-amber-700">Rp {Math.max(0, grandTotal - dpAmount).toLocaleString('id-ID')}</span>
            </div>
            <div className="text-[10px] text-slate-500">Nominal akhir dihitung sistem dari harga resmi booth.</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white rounded-full transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="bg-indigo-500/30 border border-indigo-400/40 text-indigo-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase">
              {isAdmin ? (mode === 'edit' ? 'Mode Admin: Edit Biodata' : 'Mode Admin: Pendaftaran') : (isMultiBooth ? `${boothList.length} Booth Dipilih` : (firstBooth?.category || 'Standar'))}
            </span>
            <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={13} /> {mode === 'edit' ? 'Sinkron Multi-Menu' : 'Unit Tersedia'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">
                {mode === 'edit' ? `Edit Biodata Booth ${boothCode}` : (isMultiBooth ? `Pemesanan ${boothList.length} Booth` : `Pemesanan Booth ${boothCode}`)}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {mode === 'edit' ? (
                  <>Perubahan biodata akan otomatis terupdate di Denah, Data Exhibitor, dan Invoice</>
                ) : isMultiBooth ? (
                  <>Kode: <b className="text-white">{boothCode}</b> • Total Luas <b className="text-white">{area} m²</b></>
                ) : (
                  <>Ukuran {width}x{height}m ({area} m²) • Pameran Internasional 2026</>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Total Harga Sewa</div>
              <div className="text-lg font-black text-emerald-400">Rp {price.toLocaleString('id-ID')}</div>
            </div>
          </div>

          {/* Stepper Indicator - only shown for public / registration flow */}
          {mode !== 'edit' && (
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/10 text-xs">
              <div className={`flex items-center gap-1.5 font-bold ${step === 'form' ? 'text-indigo-400' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'form' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-300'}`}>1</span>
                Data Peserta
              </div>
              <div className="w-8 h-px bg-white/20" />
              <div className={`flex items-center gap-1.5 font-bold ${step === 'payment' ? 'text-indigo-400' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'payment' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-300'}`}>2</span>
                Pembayaran
              </div>
              <div className="w-8 h-px bg-white/20" />
              <div className={`flex items-center gap-1.5 font-bold ${step === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'success' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300'}`}>3</span>
                Selesai
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: FORM DATA PESERTA */}
          {step === 'form' && submitError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">⚠️ {submitError}</div>
          )}
          {step === 'form' && (
            <form onSubmit={handleProceedToPayment} className="space-y-4">
              <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 flex items-start gap-3 text-xs text-indigo-950">
                <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {mode === 'edit' ? 'Perbarui Biodata Exhibitor Resmi' : 'Lengkapi Formulir Registrasi Exhibitor'}
                  </span>
                  <p className="text-slate-600 mt-0.5 text-[11px]">
                    Data ini wajib dan identik dengan formulir pendaftaran online. Tercatat otomatis di Data Exhibitor & Invoice.
                  </p>
                </div>
              </div>

              {/* Warning: Exhibitor Duplication Detected */}
              {duplicateWarning?.generic && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-950 animate-fadeIn">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">No. HP / WhatsApp ini sudah pernah terdaftar.</span>
                    <p className="text-amber-800 text-[11px] mt-0.5">Jika ini data Anda, lanjutkan pendaftaran dengan data yang sama agar tercatat sebagai exhibitor yang sama.</p>
                  </div>
                </div>
              )}
              {duplicateWarning && !duplicateWarning.generic && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-950 animate-fadeIn">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">No. HP / WhatsApp Ini Sudah Terdaftar di Sistem!</span>
                    <p className="text-amber-800 text-[11px] mt-0.5">
                      Client <b>{duplicateWarning.company || duplicateWarning.brandName}</b> (PIC: {duplicateWarning.pic || duplicateWarning.fullName}) telah terdaftar sebelumnya. Gunakan data ini untuk menghindari data ganda.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFullName(duplicateWarning.pic || duplicateWarning.fullName || fullName);
                        setBrandName(duplicateWarning.company || duplicateWarning.brandName || brandName);
                        if (duplicateWarning.brandCategory) setBrandCategory(duplicateWarning.brandCategory);
                        if (duplicateWarning.email) setEmail(duplicateWarning.email);
                        if (duplicateWarning.phone) setPhone(duplicateWarning.phone);
                        setDuplicateWarning(null);
                      }}
                      className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Check size={13} /> Terapkan Data Exhibitor Terdaftar Ini
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Booth Summary Card */}
              {isMultiBooth && (
                <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600" />
                      Daftar {boothList.length} Unit Booth Terpilih
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      Total Luas: {area} m²
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {boothList.map((b, idx) => (
                      <div key={b.id || idx} className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
                        <div>
                          <div className="font-black text-xs text-slate-900">Booth {b.code || b.booth_number}</div>
                          <div className="text-[10px] text-slate-500">
                            {b.category || 'Standard'} • {(b.widthM || 3)}x{(b.heightM || 3)}m
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-600 font-mono">
                            {b.status === 'free' ? 'GRATIS' : `Rp ${(b.price || 5000000).toLocaleString('id-ID')}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User size={13} className="text-indigo-600" /> Nama Lengkap (PIC / Penanggung Jawab) *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Santoso"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                    formErrors.fullName 
                      ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30' 
                      : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-100'
                  }`}
                />
                {formErrors.fullName && <p className="text-rose-500 text-[11px] mt-1">{formErrors.fullName}</p>}
              </div>

              {/* Nama Brand */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Briefcase size={13} className="text-indigo-600" /> Nama Brand / Perusahaan *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Kopi Nusantara / Artisan Coffee"
                  value={brandName}
                  onChange={(e) => { setBrandName(e.target.value); if (mode !== 'edit') setEmail(''); }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                    formErrors.brandName 
                      ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30' 
                      : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-100'
                  }`}
                />
                {formErrors.brandName && <p className="text-rose-500 text-[11px] mt-1">{formErrors.brandName}</p>}
              </div>

              {/* Kategori Brand */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={13} className="text-indigo-600" /> Kategori Brand / Industri *
                </label>
                <select
                  value={brandCategory}
                  onChange={(e) => setBrandCategory(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all bg-white font-medium text-slate-800 ${
                    formErrors.brandCategory 
                      ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30' 
                      : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-100'
                  }`}
                >
                  <option value="" disabled>-- Pilih Kategori Brand --</option>
                  {brandCategories.map((cat) => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {formErrors.brandCategory && <p className="text-rose-500 text-[11px] mt-1">{formErrors.brandCategory}</p>}
              </div>

              {/* Phone (the registration form has no email field: WhatsApp is the contact, AGENTS.md §29) */}
              <div className="grid grid-cols-1 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Phone size={13} className="text-indigo-600" /> Nomor HP / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    placeholder="08123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                      formErrors.phone 
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30' 
                        : 'border-slate-200 focus:border-indigo-600 focus:ring-indigo-100'
                    }`}
                  />
                  {formErrors.phone && <p className="text-rose-500 text-[11px] mt-1">{formErrors.phone}</p>}
                </div>
              </div>

              {/* Admin status choice (only when admin registers) */}
              {isAdmin && mode !== 'edit' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Status Booth yang Ditetapkan:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdminStatusChoice('reserved')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        adminStatusChoice === 'reserved'
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold ring-2 ring-amber-400/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Reserved (Hold)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Terbitkan Draft Tagihan</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAdminStatusChoice('sold')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        adminStatusChoice === 'sold'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold ring-2 ring-emerald-400/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Sold (Lunas)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Sudah Bayar Penuh</p>
                    </button>
                  </div>
                </div>
              )}

              {isAdmin && mode !== 'edit' && adminStatusChoice === 'reserved' && schemePanel}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>Memproses Data...</>
                ) : mode === 'edit' ? (
                  <><CheckCircle2 size={16} /> Simpan Perubahan Biodata</>
                ) : isAdmin ? (
                  <><CheckCircle2 size={16} /> Daftarkan Tenant & Terbitkan Invoice</>
                ) : (
                  <>Lanjut: Pilih DP atau Bayar Penuh <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: MENU PEMBAYARAN */}
          {step === 'payment' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 text-[11px] text-amber-950 flex gap-2">
                <BookmarkCheck size={18} className="text-amber-600 shrink-0" />
                <p className="leading-relaxed">
                  Booth <b>{boothCode}</b> akan langsung ditandai <b>Reserved</b>. Pilih skema pembayaran di bawah, lalu hubungi admin lewat WhatsApp untuk konfirmasi. <b>Invoice diterbitkan oleh admin</b> setelah konfirmasi.
                </p>
              </div>

              {schemePanel}

              {/* Actions Button */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="px-4 py-3 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-2xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={14} /> Kembali
                </button>

                <button
                  type="button"
                  disabled={isProcessing || dpInvalid}
                  onClick={handleConfirmPayment}
                  className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold text-xs shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? 'Memproses Pendaftaran...' : <><BookmarkCheck size={16} /> Konfirmasi Pendaftaran Booth</>}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUKSES. Pendaftar tidak menerima invoice: admin menerbitkannya setelah konfirmasi WhatsApp */}
          {step === 'success' && (
            <div className="text-center py-3 space-y-4 animate-fadeIn">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-50">
                <BookmarkCheck size={36} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Pendaftaran Berhasil Diterima!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Booth <b>{boothCode}</b> sudah ditandai Reserved untuk <b>{brandName}</b>.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between"><span className="text-slate-500">EXHIBITOR</span><span className="font-bold text-slate-800">{brandName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">PIC / PEMESAN</span><span className="font-bold text-slate-800">{fullName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">NO. WHATSAPP</span><span className="font-bold text-slate-800">{phone}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">BOOTH DI PESAN</span><span className="font-bold text-indigo-600">{boothCode} ({firstBooth?.category || 'Standar'})</span></div>
                <div className="flex justify-between"><span className="text-slate-500">SKEMA PEMBAYARAN</span><span className="font-bold text-slate-800">{planLabel}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">TOTAL TAGIHAN</span><span className="font-bold text-slate-800">Rp {shownTotal.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-sans">
                  <span className="text-slate-500 font-bold">STATUS</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-black text-[11px]">🟡 RESERVED, MENUNGGU KONFIRMASI ADMIN</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-left text-xs space-y-2">
                <div className="text-[11px] text-emerald-950">
                  <span className="font-bold block">Langkah selanjutnya: konfirmasi ke admin via WhatsApp</span>
                  <p className="text-slate-600 text-[10px]">Invoice diterbitkan oleh admin penyelenggara setelah Anda mengonfirmasi pendaftaran.</p>
                </div>
                {orgCfg.whatsapp ? (
                  <a
                    href={`https://wa.me/${orgCfg.whatsapp}?text=${encodeURIComponent(
                      `Halo Admin${orgCfg.companyName ? ` ${orgCfg.companyName}` : ''}, saya telah mendaftar booth pameran:\n\n• Perusahaan: ${brandName}\n• PIC: ${fullName}\n• No. Booth: ${boothCode}\n• Skema Pembayaran: ${planLabel}\n• Total: Rp ${shownTotal.toLocaleString('id-ID')}\n\nMohon konfirmasi dan penerbitan invoice. Terima kasih.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Send size={13} /> Konfirmasi via WhatsApp Admin
                  </a>
                ) : (
                  <p className="text-[11px] font-semibold text-emerald-900">Silakan hubungi admin penyelenggara untuk konfirmasi.</p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
