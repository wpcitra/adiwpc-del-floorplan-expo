import React, { useRef, useState, useEffect } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  Building2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Edit3, 
  ShieldCheck, 
  CreditCard,
  QrCode,
  Sparkles,
  Palette,
  Phone,
  Mail,
  Globe,
  MapPin,
  FileCheck
} from 'lucide-react';
import { terbilang } from '../../utils/numberToWords';
import { DEFAULT_INVOICE_CONFIG } from '../../utils/invoiceTemplateConfig';
import { printInvoiceElement, downloadInvoicePDF } from '../../utils/invoicePrintUtils';
import { api } from '../../services/api';
import { invoiceTaxView, allocate } from '../../utils/invoiceTax';
import InvoiceTotals from './InvoiceTotals';

export default function InvoiceA4View({
  invoice,
  config: propConfig = null,
  onClose,
  onEdit,
  onOpenEditor,
  isLivePreview = false
}) {
  const printRef = useRef(null);
  const [activeConfig, setActiveConfig] = useState(propConfig || DEFAULT_INVOICE_CONFIG);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (propConfig) {
      setActiveConfig(propConfig);
    } else {
      // Load saved template configuration
      api.fetchInvoiceConfig().then(saved => {
        if (saved) {
          setActiveConfig({ ...DEFAULT_INVOICE_CONFIG, ...saved });
        }
      });
    }
  }, [propConfig]);

  if (!invoice) return null;

  // 1. Dedicated Print Handler (Isolated A4 single-page print dialog)
  const handlePrint = () => {
    printInvoiceElement(printRef.current || 'printable-invoice-a4');
  };

  // 2. Dedicated PDF Download Handler (Generates exact A4 PDF with logo, stamp & colors)
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    try {
      const fileName = `Invoice-${invoice.invoice_number ? invoice.invoice_number.replace(/[\/\\]/g, '_') : 'Doc'}.pdf`;
      await downloadInvoicePDF(printRef.current || 'printable-invoice-a4', fileName);
    } catch (err) {
      console.error('Gagal download PDF invoice:', err);
      alert('Terjadi kendala saat export PDF. Silakan gunakan tombol Print Invoice (lalu pilih Save as PDF).');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Per-invoice choices (Edit Invoice > "Yang Ditampilkan di Invoice") override Desain Layout Invoice for this invoice
  const displayChoice = (invoice && typeof invoice.display === 'object' && invoice.display) || {};
  const layoutOverrides = Object.fromEntries(Object.entries(displayChoice).filter(([, v]) => typeof v === 'boolean'));
  const cfg = { ...(activeConfig || DEFAULT_INVOICE_CONFIG), ...layoutOverrides };
  const showDiscountLine = displayChoice.showDiscount !== false;
  const showContractBox = displayChoice.showContractBox !== false;
  const showBank = displayChoice.showBank !== false;
  const showNotes = displayChoice.showNotes !== false;

  const inv = {
    id: invoice.id || invoice._id || 'INV-DOC',
    invoice_number: invoice.invoice_number || invoice.invoiceNumber || 'INV/EXP/2026/001',
    issue_date: invoice.issue_date || invoice.issueDate || new Date().toISOString().split('T')[0],
    due_date: invoice.due_date || invoice.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    client_name: invoice.client_name || invoice.clientName || '-',
    company_name: invoice.company_name || invoice.companyName || '-',
    client_email: invoice.client_email || invoice.clientEmail || '',
    client_phone: invoice.client_phone || invoice.clientPhone || '',
    client_address: invoice.client_address || invoice.clientAddress || '',
    client_npwp: invoice.client_npwp || invoice.clientNpwp || '',
    booth_code: invoice.booth_code || invoice.boothCode || '',
    booth_category: invoice.booth_category || invoice.boothCategory || '',
    event_title: invoice.event_title || invoice.eventTitle || 'Indonesia International Expo 2026',
    event_venue: invoice.event_venue || invoice.eventVenue || 'Jakarta Convention Center (Hall A)',
    subtotal: Number(invoice.subtotal || invoice.subtotalAmount || invoice.total_amount || invoice.totalAmount || invoice.grand_total || invoice.grandTotal) || 0,
    discount_type: invoice.discount_type || invoice.discountType || 'nominal',
    discount_value: Number(invoice.discount_value || invoice.discountValue) || 0,
    discount_amount: Number(invoice.discount_amount || invoice.discountAmount) || 0,
    discount_reason: invoice.discount_reason || invoice.discountReason || '',
    tax_rate: Number(invoice.tax_rate || invoice.taxRate) || 0,
    tax_amount: Number(invoice.tax_amount || invoice.taxAmount) || 0,
    total_amount: Number(invoice.total_amount || invoice.totalAmount || invoice.grand_total || invoice.grandTotal || invoice.subtotal) || 0,
    payment_status: (invoice.payment_status || invoice.paymentStatus || 'UNPAID').toUpperCase(),
    payment_method: invoice.payment_method || invoice.paymentMethod || 'Bank Transfer',
    notes: invoice.notes || '',
    items: Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : (
      invoice.items_json ? (typeof invoice.items_json === 'string' ? JSON.parse(invoice.items_json) : invoice.items_json) : []
    ),
    bankDetails: invoice.bankDetails || (invoice.bank_details_json ? (typeof invoice.bank_details_json === 'string' ? JSON.parse(invoice.bank_details_json) : invoice.bank_details_json) : null),
    // DP / Pelunasan contract data (camelCase & snake_case)
    invoice_kind: invoice.invoice_kind || invoice.invoiceKind || 'full',
    payment_type: invoice.payment_type || invoice.paymentType || 'full',
    dp_percent: Number(invoice.dp_percent ?? invoice.dpPercent) || 0,
    paid_amount: Number(invoice.paid_amount ?? invoice.paidAmount) || 0,
    remaining_amount: invoice.remaining_amount ?? invoice.remainingAmount,
    contract_total: Number(invoice.contract?.total ?? invoice.contract_total ?? invoice.contractTotal) || 0,
    related_invoice: invoice.related_invoice || invoice.relatedInvoice || null,
    // PPN stored per invoice (older invoices have none: split from their total and stored rate)
    related_invoice_id: invoice.related_invoice_id || invoice.relatedInvoiceId || invoice.related_invoice?.id || null,
    tax_method: invoice.tax_method || invoice.taxMethod || null,
    tax_display: invoice.tax_display || invoice.taxDisplay || null,
    tax_note: invoice.tax_note || invoice.taxNote || '',
    dpp_amount: invoice.dpp_amount ?? invoice.dppAmount ?? null,
    contract_tax_rate: Number(invoice.contract_tax_rate ?? invoice.contractTaxRate) || 0,
    contract_subtotal: invoice.contract_subtotal ?? null,
    contract_discount: invoice.contract_discount ?? null,
    contract_dpp: invoice.contract_dpp ?? null,
    contract_tax_method: invoice.contract_tax_method || null,
    contract_tax_display: invoice.contract_tax_display || null,
    contract_discount_hint: Number(invoice.contract_discount_hint) || 0,
    booth_specs: invoice.booth_specs || {}
  };

  const isDpInvoice = inv.invoice_kind === 'dp';
  const isSettlementInvoice = inv.invoice_kind === 'settlement';
  const isSplitInvoice = isDpInvoice || isSettlementInvoice;
  const docTitle = (fallback) => isDpInvoice ? 'INVOICE UANG MUKA (DP)' : isSettlementInvoice ? 'INVOICE PELUNASAN' : (cfg.invoiceTitle || fallback);
  const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
  const relatedDpStatus = String(inv.related_invoice?.payment_status || '').toUpperCase();

  const isPaid = inv.payment_status === 'PAID';
  const isCanceled = inv.payment_status === 'CANCELED';

  const rawItems = inv.items || [];
  // Booth price and PPN shown separately: lines before PPN (DPP basis) when the breakdown is shown (shared/invoiceTax.js)
  const fullTaxView = invoice.tax_view || invoiceTaxView(inv);
  // "Baris diskon" hidden: the lines and subtotal are shown after the discount (the total never changes)
  const taxView = !showDiscountLine && fullTaxView.discount > 0
    ? (() => {
      const net = fullTaxView.subtotal - fullTaxView.discount;
      const amounts = allocate(fullTaxView.lines.map(l => l.amount), net);
      return {
        ...fullTaxView, subtotal: net, discount: 0,
        lines: fullTaxView.lines.map((l, i) => ({ ...l, amount: amounts[i], unitPrice: (l.qty || 1) > 1 ? Math.round(amounts[i] / l.qty) : amounts[i] }))
      };
    })()
    : fullTaxView;
  const items = taxView.lines.map(line => rawItems.length > 0 ? line : {
    ...line,
    description: `Sewa Booth Pameran ${inv.booth_code ? inv.booth_code : ''} (${inv.booth_category || 'Standard'})`
  });
  const kindLabel = isDpInvoice ? 'Uang Muka / DP' : isSettlementInvoice ? 'Pelunasan' : 'Sewa Booth';
  const contractTax = taxView.contract;
  const dpPart = taxView.dpPart;

  // "Spesifikasi & Fasilitas": booth category, size and included facilities from the booth data
  const boothCodes = String(inv.booth_code || '').split('+').map(c => c.trim()).filter(Boolean);
  const specText = (spec) => {
    if (!spec) return '';
    const w = Number(spec.widthM) || 0;
    const h = Number(spec.heightM) || 0;
    const size = w && h ? `${w} × ${h} m (${Math.round(w * h * 100) / 100} m²)` : '';
    return [spec.category, size].filter(Boolean).join(' • ');
  };
  const specsForLine = (item) => {
    const codes = item.boothCode ? [item.boothCode] : boothCodes;
    return codes.map(code => ({ code, spec: inv.booth_specs[code] })).filter(x => x.spec);
  };

  const bankDetails = inv.bankDetails || {
    bankName: cfg.bankName || 'Bank Central Asia (BCA)',
    accountNumber: cfg.accountNumber || '882-019-3321',
    accountName: cfg.accountName || cfg.companyName || 'PT EXPO KARYA INDONESIA'
  };

  const formattedDate = (dStr) => {
    if (!dStr) return '-';
    try {
      return new Date(dStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return dStr;
    }
  };

  const primaryColor = cfg.primaryColor || '#4f46e5';
  const secondaryColor = cfg.secondaryColor || '#0f172a';
  const accentColor = cfg.accentColor || '#10b981';

  // Table header background & text styles
  const getTableHeaderStyles = () => {
    switch (cfg.tableHeaderStyle) {
      case 'solid_primary':
        return { backgroundColor: primaryColor, color: '#ffffff' };
      case 'solid_dark':
        return { backgroundColor: '#0f172a', color: '#ffffff' };
      case 'tinted':
        return { backgroundColor: `${primaryColor}15`, color: primaryColor, borderBottom: `2px solid ${primaryColor}` };
      case 'bordered':
        return { backgroundColor: '#f8fafc', color: '#1e293b', borderBottom: '2px solid #0f172a' };
      case 'minimal':
        return { backgroundColor: 'transparent', color: '#475569', borderBottom: '1px solid #cbd5e1' };
      default:
        return { backgroundColor: primaryColor, color: '#ffffff' };
    }
  };

  const tableHeaderStyle = getTableHeaderStyles();

  return (
    <div className={`${isLivePreview ? 'w-full flex justify-center' : 'fixed inset-0 z-50 flex flex-col items-center justify-start bg-slate-950/85 backdrop-blur-md overflow-y-auto p-4 sm:p-6 animate-fadeIn print:p-0 print:bg-white print:static'}`}>
      
      {/* Top Floating Control Bar (Hidden on Print and in Live Preview Embed) */}
      {!isLivePreview && (
        <div className="w-full max-w-[210mm] mb-4 bg-slate-900 text-white px-4 py-3 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20"
              style={{ backgroundColor: primaryColor }}
            >
              <Printer size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">Pratinjau Layout Invoice A4</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  Format Standar A4 (210 x 297 mm)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Diskon privat tertera & layout siap dicetak atau diekspor ke PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenEditor && (
              <button
                type="button"
                onClick={onOpenEditor}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Buka Invoice Editor untuk Mengubah Logo, Warna & Tata Letak"
              >
                <Palette size={13} />
                <span>Desain Layout Invoice</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(invoice)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 size={13} />
                <span>Edit Diskon & Data</span>
              </button>
            )}

            {/* 1. Tombol Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-600/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Unduh dokumen invoice resmi dalam format PDF"
            >
              <Download size={14} className={isGeneratingPDF ? 'animate-bounce' : ''} />
              <span>{isGeneratingPDF ? 'Membuat PDF...' : 'Download PDF'}</span>
            </button>

            {/* 2. Tombol Print Invoice */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title="Kirim area invoice ke Printer fisik / Dialog Cetak Browser"
            >
              <Printer size={14} />
              <span>Print Invoice</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Tutup"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* A4 Sheet Paper Container (Standard ISO A4: 210mm x 297mm) */}
      <div 
        ref={printRef}
        id="printable-invoice-a4"
        className={`bg-white text-slate-900 shadow-2xl rounded-sm border border-slate-200 relative flex flex-col justify-between font-sans print:shadow-none print:border-none print:m-0 ${cfg.fontFamily || 'font-sans'}`}
        style={{
          boxSizing: 'border-box',
          width: '210mm',
          minHeight: '297mm',
          maxWidth: '210mm',
          padding: '12mm 14mm'
        }}
      >
        {/* TOP WATERMARK IF ENABLED */}
        {cfg.showWatermark && isPaid && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.06] rotate-[-25deg] text-emerald-800 font-black text-8xl tracking-widest border-8 border-emerald-800 p-8 rounded-3xl">
            LUNAS (PAID)
          </div>
        )}
        {cfg.showWatermark && isCanceled && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.07] rotate-[-25deg] text-red-800 font-black text-8xl tracking-widest border-8 border-red-800 p-8 rounded-3xl">
            DIBATALKAN
          </div>
        )}

        <div>
          {/* SECTION 1: DYNAMIC HEADER & LOGO */}
          {cfg.headerLayout === 'logo_center_stacked' ? (
            // Layout A: Center Stacked Header
            <div className="text-center border-b-2 pb-5 mb-5" style={{ borderColor: primaryColor }}>
              {cfg.showLogo && (
                <div className="flex justify-center mb-2">
                  {cfg.logoUrl ? (
                    <img 
                      src={cfg.logoUrl} 
                      alt="Logo" 
                      style={{ height: `${cfg.logoSize || 44}px` }} 
                      className="object-contain" 
                    />
                  ) : (
                    <div 
                      className="px-4 py-2 rounded-xl text-white font-black text-sm tracking-wider uppercase shadow-md flex items-center gap-2"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Building2 size={18} />
                      <span>{cfg.logoText || 'FLOORPLAN STUDIO'}</span>
                    </div>
                  )}
                </div>
              )}
              <h1 className="text-lg font-black uppercase text-slate-900 tracking-tight">
                {cfg.companyName || 'PT EXPO KARYA INDONESIA'}
              </h1>
              <p className="text-[11px] text-slate-500 max-w-lg mx-auto">
                {cfg.companyAddress} • Telp: {cfg.companyPhone} • Email: {cfg.companyEmail}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="text-left">
                  <span className="font-bold text-slate-800 text-sm">{inv.event_title}</span>
                  <p className="text-slate-500 text-[11px]">Venue: {inv.event_venue}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 text-sm">{inv.invoice_number}</span>
                  <div className="text-[10px] text-slate-500">Terbit: {formattedDate(inv.issue_date)} • Tempo: {formattedDate(inv.due_date)}</div>
                </div>
              </div>
            </div>
          ) : cfg.headerLayout === 'logo_right_info_left' ? (
            // Layout B: Logo on Right, Invoice Info on Left
            <div className="flex items-start justify-between border-b-2 pb-6 mb-6" style={{ borderColor: primaryColor }}>
              <div className="space-y-1 max-w-[60%]">
                <div className="inline-block text-white px-3 py-1 rounded-md text-xs font-black tracking-wider uppercase mb-1 shadow-sm" style={{ backgroundColor: primaryColor }}>
                  {docTitle('INVOICE RESMI')}
                </div>
                <div className="text-sm font-mono font-bold text-slate-900">
                  {inv.invoice_number}
                </div>

                <div className="text-xs text-slate-600 space-y-0.5 pt-1">
                  <p className="font-bold text-slate-800 text-sm">
                    {inv.event_title}
                  </p>
                  <p className="text-slate-500">
                    Venue: {inv.event_venue}
                  </p>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Tanggal Terbit: <b>{formattedDate(inv.issue_date)}</b> • Jatuh Tempo: <b className="text-rose-700">{formattedDate(inv.due_date)}</b>
                  </div>
                </div>
              </div>

              {/* Logo / Company on Right */}
              <div className="text-right space-y-1.5 flex flex-col items-end">
                {cfg.showLogo && (
                  cfg.logoUrl ? (
                    <img src={cfg.logoUrl} alt="Logo" style={{ height: `${cfg.logoSize || 44}px` }} className="object-contain" />
                  ) : (
                    <div className="px-3 py-1.5 rounded-lg text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: secondaryColor }}>
                      <Building2 size={14} />
                      <span>{cfg.logoText || 'FLOORPLAN STUDIO'}</span>
                    </div>
                  )
                )}
                <h2 className="text-xs font-bold uppercase text-slate-800 tracking-tight">
                  {cfg.companyName}
                </h2>
                <p className="text-[10px] text-slate-500 max-w-[220px]">
                  {cfg.companyAddress}
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : (isCanceled ? 'bg-red-50 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300')
                }`}>
                  {isPaid ? '● LUNAS (PAID)' : (isCanceled ? '● DIBATALKAN' : '● MENUNGGU PEMBAYARAN')}
                </span>
              </div>
            </div>
          ) : cfg.headerLayout === 'clean_minimal' ? (
            // Layout C: Clean Minimal
            <div className="border-b pb-5 mb-5 border-slate-300">
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-xl font-black uppercase text-slate-900 tracking-tighter">
                  {docTitle('INVOICE')}
                </h1>
                <span className="font-mono font-bold text-slate-800 text-sm">
                  #{inv.invoice_number}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <div>
                  <span className="font-bold text-slate-800">{inv.event_title}</span>
                  <p className="text-slate-500 text-[11px]">{inv.event_venue}</p>
                </div>
                <div className="text-right">
                  <div>Terbit: <b>{formattedDate(inv.issue_date)}</b></div>
                  <div>Jatuh Tempo: <b className="text-rose-700">{formattedDate(inv.due_date)}</b></div>
                </div>
              </div>
            </div>
          ) : (
            // Layout Standard: Logo on Left, Invoice Info on Right
            <div className="flex items-start justify-between border-b-2 pb-6 mb-6" style={{ borderColor: primaryColor }}>
              <div className="space-y-1 max-w-[60%]">
                <div className="flex items-center gap-2.5 mb-2">
                  {cfg.showLogo && (
                    cfg.logoUrl ? (
                      <img src={cfg.logoUrl} alt="Logo" style={{ height: `${cfg.logoSize || 44}px` }} className="object-contain rounded-md" />
                    ) : (
                      <div 
                        className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-md"
                        style={{ backgroundColor: primaryColor }}
                      >
                        FS
                      </div>
                    )
                  )}
                  <div>
                    <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                      {cfg.companyName || 'FLOORPLAN STUDIO INDONESIA'}
                    </h1>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-medium">
                      {cfg.logoTagline || 'Official Event Management & Exhibition Services'}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-0.5 pt-1">
                  <p className="font-bold text-slate-800 text-sm">
                    {inv.event_title}
                  </p>
                  <p className="text-slate-500">
                    Venue: {inv.event_venue}
                  </p>
                </div>
              </div>

              {/* Right: Invoice Info */}
              <div className="text-right space-y-1">
                <div 
                  className="inline-block text-white px-3 py-1 rounded-md text-xs font-black tracking-wider uppercase mb-1 shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  {docTitle('INVOICE RESMI')}
                </div>
                <div className="text-sm font-mono font-bold text-slate-900">
                  {inv.invoice_number}
                </div>

                <div className="pt-2 text-xs space-y-0.5 text-slate-600">
                  <div>
                    <span className="text-slate-400">Tanggal Terbit: </span>
                    <b className="text-slate-800">{formattedDate(inv.issue_date)}</b>
                  </div>
                  <div>
                    <span className="text-slate-400">Jatuh Tempo: </span>
                    <b className="text-rose-700">{formattedDate(inv.due_date)}</b>
                  </div>
                  <div className="pt-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isPaid 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                        : (isCanceled ? 'bg-red-50 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300')
                    }`}>
                      {isPaid ? '● LUNAS (PAID)' : (isCanceled ? '● DIBATALKAN' : '● MENUNGGU PEMBAYARAN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: DYNAMIC BILL TO & ISSUED BY */}
          <div className={`${cfg.clientSectionPosition === 'stacked' ? 'space-y-3' : 'grid grid-cols-2 gap-6'} p-4 bg-slate-50/80 rounded-xl border border-slate-200 mb-6 text-xs`}>
            {/* Bill To */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                {cfg.billToLabel || 'Ditagihkan Kepada (Client / Tenant):'}
              </span>
              <h2 className="text-sm font-bold text-slate-900 mb-0.5">
                {inv.company_name}
              </h2>
              <div className="text-slate-600 space-y-0.5">
                <p><span className="text-slate-400">PIC / Kontak:</span> <b className="text-slate-800">{inv.client_name}</b></p>
                {cfg.showClientEmail && inv.client_email && <p><span className="text-slate-400">Email:</span> {inv.client_email}</p>}
                {cfg.showClientPhone && inv.client_phone && <p><span className="text-slate-400">No. Kontak / WA:</span> {inv.client_phone}</p>}
                {cfg.showClientNpwp && inv.client_npwp && <p><span className="text-slate-400">NPWP:</span> {inv.client_npwp}</p>}
                {cfg.showClientAddress && inv.client_address && <p className="text-slate-500 mt-1 line-clamp-2">{inv.client_address}</p>}
              </div>
            </div>

            {/* Issued By */}
            <div className={cfg.clientSectionPosition === 'stacked' ? 'pt-3 border-t border-slate-200' : 'border-l border-slate-200 pl-6'}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                {cfg.issuedByLabel || 'Penyelenggara / Rekening Tujuan:'}
              </span>
              <h3 className="text-sm font-bold text-slate-900 mb-0.5">
                {cfg.companyName || 'PT EXPO KARYA INDONESIA'}
              </h3>
              <div className="text-slate-600 space-y-0.5">
                {showBank && (
                  <>
                    <p><span className="text-slate-400">Bank:</span> <b>{bankDetails.bankName || cfg.bankName}</b></p>
                    <p><span className="text-slate-400">No. Rekening:</span> <b className="font-mono text-slate-900">{bankDetails.accountNumber || cfg.accountNumber}</b></p>
                    <p><span className="text-slate-400">Atas Nama:</span> <b>{bankDetails.accountName || cfg.accountName}</b></p>
                  </>
                )}
                <p className="text-[11px] text-slate-500 mt-1">{cfg.companyAddress}</p>
              </div>
            </div>
          </div>

          {/* SECTION 3: LINE ITEMS TABLE */}
          <div className="mb-6">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="font-bold uppercase text-[10px] tracking-wider" style={tableHeaderStyle}>
                  {cfg.showItemNumber && <th className="py-2.5 px-3 rounded-l-lg">No</th>}
                  <th className="py-2.5 px-3">Deskripsi Layanan / Booth</th>
                  <th className="py-2.5 px-3">Spesifikasi & Fasilitas</th>
                  <th className="py-2.5 px-2 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                  <th className="py-2.5 px-3 text-right rounded-r-lg">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item, idx) => {
                  const itemPrice = item.unitPrice ?? item.price ?? 0;
                  const itemQty = item.qty || 1;
                  const itemTotal = item.amount ?? item.total ?? (itemQty * itemPrice);

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      {cfg.showItemNumber && <td className="py-3 px-3 font-semibold text-slate-500 align-top">{idx + 1}</td>}
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900 text-xs">{item.description || `Sewa Booth ${inv.booth_code}`}</div>
                        {(item.boothCode || inv.booth_code) && (
                          <span 
                            className="inline-block mt-0.5 text-[10px] px-1.5 py-0.2 font-bold rounded border"
                            style={{ color: primaryColor, backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30` }}
                          >
                            Booth #{item.boothCode || inv.booth_code}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 align-top text-[11px]">
                        {cfg.showDimensionsCol && item.dimensions && <div className="font-medium text-slate-700">Ukuran: {item.dimensions}</div>}
                        {cfg.showFacilitiesCol && item.facilities && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {Array.isArray(item.facilities) ? item.facilities.join(', ') : item.facilities}
                          </div>
                        )}
                        {!item.dimensions && !item.facilities && specsForLine(item).map(({ code, spec }) => (
                          <div key={code} className="mb-0.5">
                            {cfg.showDimensionsCol !== false && (
                              <div className="font-medium text-slate-700">{specsForLine(item).length > 1 ? `#${code}: ` : ''}{specText(spec)}</div>
                            )}
                            {cfg.showFacilitiesCol !== false && spec.facilities?.length > 0 && (
                              <div className="text-[10px] text-slate-500">Termasuk: {spec.facilities.join(', ')}</div>
                            )}
                          </div>
                        ))}
                        {item.notes && <div className="text-[10px] text-slate-500 italic mt-0.5">{item.notes}</div>}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-700 align-top">{itemQty}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 align-top">
                        Rp {itemPrice.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 align-top">
                        Rp {itemTotal.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SECTION 4: FINANCIAL CALCULATIONS & PRIVATE DISCOUNT */}
          <div className="flex items-start justify-between gap-6 border-t-2 border-slate-200 pt-4 mb-6 text-xs">
            {/* Left: Terbilang & Notes */}
            <div className="flex-1 space-y-3">
              {cfg.showTerbilang && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Terbilang (Amount in Words):
                  </span>
                  <p className="font-semibold text-slate-800 italic text-[11px] leading-relaxed">
                    "{terbilang(inv.total_amount || 0)}"
                  </p>
                </div>
              )}

              {showNotes && inv.notes && (
                <div className="text-[11px] text-slate-600">
                  <span className="font-bold text-slate-700 block mb-0.5">Catatan & Ketentuan:</span>
                  <p className="text-slate-500 whitespace-pre-line leading-relaxed">{inv.notes}</p>
                </div>
              )}
            </div>

            {/* Right: Subtotal, Discount, PPN & Total Box (booth price and PPN shown separately) */}
            <div className="w-64 sm:w-72 space-y-2 shrink-0">
              <InvoiceTotals
                view={taxView}
                primaryColor={primaryColor}
                subtotalLabel={isSplitInvoice && !taxView.asFull ? `Subtotal ${kindLabel}${taxView.showBreakdown ? ' (sebelum PPN)' : ''}:` : undefined}
                discountLabel={`Diskon Khusus${!isSplitInvoice && inv.discount_type === 'percentage' && inv.discount_value ? ` (${inv.discount_value}%)` : ''}`}
                discountReason={inv.discount_reason}
              />

              {/* Booth contract breakdown for Invoice DP / Invoice Pelunasan */}
              {showContractBox && isSplitInvoice && inv.contract_total > 0 && contractTax && (
                <div className="mt-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/90 space-y-1.5 text-[11px]">
                  <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Rincian Kontrak Booth {inv.booth_code}</div>
                  {taxView.showBreakdown ? (
                    <>
                      <div className="flex justify-between gap-3 text-slate-700">
                        <span>Harga Booth (sebelum PPN):</span>
                        <span className="whitespace-nowrap font-mono">{rp(contractTax.subtotal)}</span>
                      </div>
                      {contractTax.discount > 0 && (
                        <div className="flex justify-between gap-3 text-emerald-700">
                          <span>Diskon:</span>
                          <span className="whitespace-nowrap font-mono">- {rp(contractTax.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-3 text-slate-700">
                        <span>PPN {contractTax.rate}%:</span>
                        <span className="whitespace-nowrap font-mono">{rp(contractTax.ppn)}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-800 font-bold border-t border-slate-200 pt-1.5">
                        <span>Total Kontrak:</span>
                        <span className="whitespace-nowrap font-mono">{rp(contractTax.total)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between gap-3 text-slate-700">
                      <span>Total Kontrak (setelah diskon{contractTax.method === 'inclusive' ? ', sudah termasuk PPN' : ''}):</span>
                      <span className="whitespace-nowrap font-mono font-bold">{rp(inv.contract_total)}</span>
                    </div>
                  )}
                  {isDpInvoice ? (
                    <>
                      <div className="flex justify-between gap-3 text-blue-700 font-bold">
                        <span>Nilai DP ({inv.contract_total > 0 ? Math.round((inv.total_amount / inv.contract_total) * 1000) / 10 : inv.dp_percent}%) — invoice ini:</span>
                        <span className="whitespace-nowrap font-mono">{rp(inv.total_amount)}</span>
                      </div>
                      {taxView.showBreakdown && dpPart && (
                        <div className="text-right text-[10px] text-blue-700/80 font-mono -mt-1">DPP {rp(dpPart.dpp)} + PPN {rp(dpPart.ppn)} = {rp(dpPart.total)}</div>
                      )}
                      <div className="flex justify-between gap-3 text-amber-800 font-bold border-t border-slate-200 pt-1.5">
                        <span>Sisa pembayaran (ditagihkan kemudian melalui Invoice Pelunasan):</span>
                        <span className="whitespace-nowrap font-mono">{rp(Math.max(0, inv.contract_total - inv.total_amount))}</span>
                      </div>
                    </>
                  ) : inv.related_invoice ? (
                    <>
                      <div className="flex justify-between gap-3 text-slate-700">
                        <span>
                          Dikurangi DP {inv.related_invoice.invoice_number}
                          <span className={`ml-1 font-bold ${relatedDpStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            ({relatedDpStatus === 'PAID' ? 'sudah dibayar' : relatedDpStatus === 'CANCELED' ? 'dibatalkan' : 'belum dibayar'})
                          </span>:
                        </span>
                        <span className="whitespace-nowrap font-mono font-bold">- {rp(inv.related_invoice.total_amount)}</span>
                      </div>
                      {taxView.showBreakdown && dpPart && (
                        <div className="text-right text-[10px] text-slate-500 font-mono -mt-1">DP: DPP {rp(dpPart.dpp)} + PPN {rp(dpPart.ppn)}</div>
                      )}
                      <div className="flex justify-between gap-3 text-violet-800 font-black border-t border-slate-200 pt-1.5">
                        <span className="uppercase tracking-wide">Sisa yang harus dilunasi:</span>
                        <span className="whitespace-nowrap font-mono text-sm">{rp(inv.total_amount)}</span>
                      </div>
                      {taxView.showBreakdown && (
                        <div className="text-right text-[10px] text-violet-800/80 font-mono -mt-1">DPP {rp(taxView.dpp)} + PPN {rp(taxView.ppn)}</div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between gap-3 text-violet-800 font-bold border-t border-slate-200 pt-1.5">
                      <span>Pembayaran penuh 100% (tanpa DP):</span>
                      <span className="whitespace-nowrap font-mono">{rp(inv.total_amount)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Uang Muka (DP) & Sisa Tagihan Pelunasan (single "Penuh" invoice paid in part) */}
              {!isSplitInvoice && Boolean((inv.paid_amount && Number(inv.paid_amount) > 0) || inv.payment_type === 'dp' || (inv.payment_status || '').toUpperCase() === 'PARTIAL') && (inv.payment_status || '').toUpperCase() !== 'PAID' && (
                <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1.5 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center text-emerald-700 font-bold">
                    <span className="text-[11px]">Uang Muka Diterima (DP):</span>
                    <span className="font-mono text-xs">
                      - Rp {(Number(inv.paid_amount) || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-amber-800 font-black border-t border-amber-200/80 pt-1.5">
                    <span className="uppercase text-[11px] tracking-wide text-amber-900">SISA TAGIHAN PELUNASAN:</span>
                    <span className="font-mono text-sm text-amber-700">
                      Rp {(inv.remaining_amount !== undefined && inv.remaining_amount !== null ? Number(inv.remaining_amount) : Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0))).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              )}

              {(inv.payment_status || '').toUpperCase() === 'PAID' && (
                <div className="mt-2 p-2 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-emerald-800 font-bold text-xs">
                  <span className="uppercase text-[10px] tracking-wide">Status Pembayaran:</span>
                  <span className="font-mono">LUNAS (PAID) • Sisa: Rp 0</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 5: INSTRUCTIONS & SIGNATURES */}
        <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-6 items-end text-xs shrink-0">
          {/* Payment Instructions (hidden together with the bank account: they refer to it) */}
          <div className={`space-y-1.5 text-slate-600 ${showBank ? '' : 'invisible'}`}>
            <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
              <ShieldCheck size={14} style={{ color: primaryColor }} />
              <span>Instruksi Pembayaran Resmi</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-line">
              {cfg.paymentInstructions || 'Mohon transfer sesuai nominal total tagihan ke rekening di atas.'}
            </p>
          </div>

          {/* Signature Box */}
          <div className={`flex flex-col ${cfg.signaturePosition === 'left' ? 'items-start text-left' : (cfg.signaturePosition === 'split' ? 'items-center text-center' : 'items-end text-right')}`}>
            <p className="text-[11px] text-slate-500 mb-1">
              {cfg.signerCity || 'Jakarta'}, {formattedDate(inv.issue_date)}
            </p>
            <p className="text-xs font-bold text-slate-800 mb-2">
              {cfg.companyName || 'PT EXPO KARYA INDONESIA'}
            </p>
            
            {/* Signature line, stamp & uploaded signature image */}
            <div className="border-b-2 border-slate-800 w-48 min-h-[60px] pb-1 relative flex flex-col justify-end items-center">
              {cfg.showStamp && (
                <span 
                  className="absolute top-1 -left-3 border-2 border-dashed px-1.5 py-0.5 rounded text-[9px] font-black uppercase rotate-[-12deg] pointer-events-none opacity-75 z-0"
                  style={{ borderColor: primaryColor, color: primaryColor }}
                >
                  OFFICIAL STAMP
                </span>
              )}
              
              {cfg.signatureImageUrl ? (
                <img 
                  src={cfg.signatureImageUrl} 
                  alt="Tanda Tangan Official" 
                  className="max-h-16 max-w-[160px] object-contain mb-1 relative z-10"
                />
              ) : (
                <div className="h-10"></div>
              )}

              <span className="font-bold text-slate-900 text-xs relative z-10">{cfg.signerName || 'Budi Santoso, S.E.'}</span>
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block mt-0.5">
              {cfg.signerTitle || 'Head of Finance & Exhibition'}
            </span>
          </div>
        </div>

        {/* Optional Footer Tagline */}
        {cfg.footerNotes && (
          <div className="pt-4 mt-4 border-t border-slate-100 text-center text-[10px] text-slate-400">
            {cfg.footerNotes}
          </div>
        )}
      </div>
    </div>
  );
}
