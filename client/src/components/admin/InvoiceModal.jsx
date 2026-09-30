import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  X, 
  Plus, 
  Search, 
  Printer, 
  DollarSign, 
  Percent, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  Copy, 
  Lock, 
  Building2, 
  Tag, 
  ArrowLeft,
  Calendar,
  CreditCard,
  Eye,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { api } from '../../services/api';
import InvoiceA4View from './InvoiceA4View';

export default function InvoiceModal({
  isOpen,
  onClose,
  initialBooth = null,
  allCanvasObjects = [],
  currentFloorplanId = 'FP-2026-001',
  currentFloorplanTitle = 'Indonesia International Expo 2026',
  showToast,
  onOpenEditor
}) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form' | 'a4_preview'
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'UNPAID' | 'PAID' | 'CANCELED'

  // Selected Invoice for A4 Preview or Editing
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form States
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [selectedBoothId, setSelectedBoothId] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientNpwp, setClientNpwp] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  
  // Line items
  const [items, setItems] = useState([
    {
      description: 'Sewa Booth Pameran Standar',
      boothCode: '',
      dimensions: '3x3m (9m²)',
      facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL'],
      qty: 1,
      unitPrice: 5000000,
      amount: 5000000
    }
  ]);

  // Private Admin Discount States
  const [discountType, setDiscountType] = useState('nominal'); // 'nominal' | 'percentage'
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('Diskon Khusus Mitra');
  
  // Tax / PPN State
  const [applyTax, setApplyTax] = useState(false);
  const [taxRate, setTaxRate] = useState(11);
  // PPN rate from Setting (used when an invoice without PPN is switched to "Dengan PPN")
  const [taxRateSetting, setTaxRateSetting] = useState(11);
  useEffect(() => {
    api.fetchInvoiceConfig().then(cfg => {
      const rate = Number(cfg?.taxRate);
      if (Number.isFinite(rate) && rate >= 0) setTaxRateSetting(rate);
    });
  }, []);

  // Down Payment / Uang Muka States
  const [paymentType, setPaymentType] = useState('full'); // 'full' | 'dp'
  const [dpPercent, setDpPercent] = useState(50); // 30, 50, custom
  const [customPaidAmount, setCustomPaidAmount] = useState('');

  // Payment & Booth sync options
  const [paymentStatus, setPaymentStatus] = useState('UNPAID'); // 'UNPAID' | 'PAID' | 'PARTIAL'
  const [updateBoothStatus, setUpdateBoothStatus] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [notes, setNotes] = useState('1. Pembayaran DP minimal 50% saat konfirmasi invoice.\n2. Pelunasan paling lambat H-7 sebelum acara pameran berlangsung.\n3. Harap mencantumkan nomor invoice pada berita transfer.');

  // Extract all booth objects from canvas
  const availableBooths = useMemo(() => {
    return allCanvasObjects
      .filter(o => o.isBooth && o.boothData)
      .map(o => o.boothData);
  }, [allCanvasObjects]);

  // Fetch invoice list from backend
  const fetchInvoiceList = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchInvoices();
      setInvoices(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvoiceList();
      if (initialBooth) {
        initFormWithBooth(initialBooth);
        setViewMode('form');
      } else {
        setViewMode('list');
      }
    }
  }, [isOpen, initialBooth]);

  // Initialize form with a specific booth
  const initFormWithBooth = (booth) => {
    setEditingInvoiceId(null);
    setSelectedBoothId(booth.id || '');
    setCompanyName(booth.ownerName || '');
    setClientName(booth.ownerName || '');
    setClientEmail('');
    setClientPhone('');
    setClientAddress('');
    setClientNpwp('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    
    const price = booth.price || 5000000;
    const dim = `${booth.widthM || 3}x${booth.heightM || 3}m (${((booth.widthM || 3) * (booth.heightM || 3)).toFixed(1)}m²)`;
    const facilities = booth.facilities || ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL'];

    setItems([
      {
        description: `Sewa Booth Pameran - Kategori ${booth.category || 'Standar'} (${booth.code || 'A-01'})`,
        boothCode: booth.code || '',
        dimensions: dim,
        facilities: facilities,
        qty: 1,
        unitPrice: price,
        amount: price
      }
    ]);

    const dType = booth.discountType || booth.discount_type || 'nominal';
    const dVal = booth.discountValue !== undefined ? booth.discountValue : (booth.discount_value !== undefined ? booth.discount_value : (booth.discountAmount || booth.discount_amount || 0));
    const dReason = booth.discountReason || booth.discount_reason || 'Diskon Kemitraan Khusus';

    setDiscountType(dType);
    setDiscountValue(dVal);
    setDiscountReason(dReason);
    setApplyTax(false);
    setPaymentType('full');
    setDpPercent(50);
    setCustomPaidAmount('');
    setPaymentStatus(booth.status === 'sold' ? 'PAID' : 'UNPAID');
    setUpdateBoothStatus(true);
  };

  // Open Edit Form for existing invoice
  const handleEditInvoice = async (inv) => {
    setEditingInvoiceId(inv.id);
    setSelectedBoothId(inv.booth_id || '');
    setCompanyName(inv.company_name || '');
    setClientName(inv.client_name || '');
    setClientEmail(inv.client_email || '');
    setClientPhone(inv.client_phone || '');
    setClientAddress(inv.client_address || '');
    setClientNpwp(inv.client_npwp || '');
    setIssueDate(inv.issue_date || new Date().toISOString().split('T')[0]);
    setDueDate(inv.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    // Parse items
    let parsedItems = [];
    try {
      parsedItems = typeof inv.items === 'object' ? inv.items : JSON.parse(inv.items_json || '[]');
    } catch (e) {
      parsedItems = [];
    }

    if (!parsedItems || parsedItems.length === 0) {
      parsedItems = [{
        description: `Sewa Booth ${inv.booth_code || 'Standar'}`,
        boothCode: inv.booth_code || '',
        dimensions: '3x3m',
        facilities: ['Karpet', 'Listrik', 'Meja & Kursi'],
        qty: 1,
        unitPrice: inv.subtotal || inv.total_amount,
        amount: inv.subtotal || inv.total_amount
      }];
    }
    setItems(parsedItems);

    setDiscountType(inv.discount_type || 'nominal');
    setDiscountValue(inv.discount_value || 0);
    setDiscountReason(inv.discount_reason || 'Diskon Khusus Mitra');
    setApplyTax(Boolean(inv.tax_amount && inv.tax_amount > 0));
    setTaxRate(inv.tax_rate || 11);

    const isDp = inv.payment_type === 'dp' || inv.payment_status === 'PARTIAL' || (Number(inv.paid_amount) > 0 && Number(inv.remaining_amount) > 0);
    setPaymentType(isDp ? 'dp' : 'full');
    setDpPercent(inv.dp_percent || 50);
    setCustomPaidAmount(inv.paid_amount ? inv.paid_amount.toString() : '');
    setPaymentStatus(inv.payment_status || 'UNPAID');
    setNotes(inv.notes || '');

    setViewMode('form');
  };

  // Financial Calculations
  const calculations = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    let discountAmount = 0;
    const numDiscVal = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') {
      discountAmount = Math.round((subtotal * Math.min(100, Math.max(0, numDiscVal))) / 100);
    } else {
      discountAmount = Math.min(subtotal, Math.max(0, Math.round(numDiscVal)));
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const taxAmount = applyTax ? Math.round((afterDiscount * (taxRate || 11)) / 100) : 0;
    const grandTotal = afterDiscount + taxAmount;

    // Uang Muka (DP) & Sisa Pelunasan
    let dpAmt = 0;
    let remAmt = 0;

    if (paymentType === 'dp') {
      if (customPaidAmount !== '' && !isNaN(Number(customPaidAmount)) && Number(customPaidAmount) > 0) {
        dpAmt = Math.min(grandTotal, Math.round(Number(customPaidAmount)));
      } else {
        dpAmt = Math.round((grandTotal * (parseFloat(dpPercent) || 50)) / 100);
      }
      remAmt = Math.max(0, grandTotal - dpAmt);
    } else {
      if (paymentStatus === 'PAID') {
        dpAmt = grandTotal;
        remAmt = 0;
      } else {
        dpAmt = 0;
        remAmt = grandTotal;
      }
    }

    return {
      subtotal,
      discountAmount,
      afterDiscount,
      taxAmount,
      grandTotal,
      dpAmt,
      remAmt
    };
  }, [items, discountType, discountValue, applyTax, taxRate, paymentType, dpPercent, customPaidAmount, paymentStatus]);

  // Line items handlers
  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === 'qty' || field === 'unitPrice') {
        const q = parseFloat(field === 'qty' ? value : updated.qty) || 0;
        const p = parseFloat(field === 'unitPrice' ? value : updated.unitPrice) || 0;
        updated.amount = q * p;
      }
      next[index] = updated;
      return next;
    });
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        description: 'Layanan Tambahan (Daya Listrik 10A / Extra Pass / Kursi)',
        dimensions: '-',
        facilities: [],
        qty: 1,
        unitPrice: 500000,
        amount: 500000
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Booth selection handler in form
  const handleBoothSelect = (boothId) => {
    setSelectedBoothId(boothId);
    const target = availableBooths.find(b => b.id === boothId);
    if (target) {
      if (!companyName && target.ownerName) setCompanyName(target.ownerName);
      if (!clientName && target.ownerName) setClientName(target.ownerName);
      
      const price = target.price || 5000000;
      const dim = `${target.widthM || 3}x${target.heightM || 3}m`;
      const facilities = target.facilities || ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi'];

      setItems(prev => [
        {
          ...prev[0],
          description: `Sewa Booth Pameran - Kategori ${target.category || 'Standar'} (${target.code || 'A-01'})`,
          boothCode: target.code || '',
          dimensions: dim,
          facilities: facilities,
          unitPrice: price,
          amount: (prev[0]?.qty || 1) * price
        },
        ...prev.slice(1)
      ]);
    }
  };

  // Submit handler
  const handleSubmitInvoice = async (e) => {
    e.preventDefault();
    if (!companyName.trim() || !clientName.trim()) {
      showToast?.('⚠️ Harap isi Nama PIC dan Nama Perusahaan');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedBooth = availableBooths.find(b => b.id === selectedBoothId);

      const payload = {
        floorplanId: currentFloorplanId,
        boothId: selectedBoothId || null,
        boothCode: selectedBooth?.code || items[0]?.boothCode || '',
        eventId: 'EVT-2026-001',
        eventTitle: currentFloorplanTitle || 'Indonesia International Expo 2026',
        eventVenue: 'Jakarta Convention Center (Hall A)',
        clientName: clientName.trim(),
        companyName: companyName.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim(),
        clientAddress: clientAddress.trim(),
        clientNpwp: clientNpwp.trim(),
        issueDate,
        dueDate,
        items,
        subtotal: calculations.subtotal,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        discountAmount: calculations.discountAmount,
        discountReason: discountReason.trim(),
        taxRate: applyTax ? taxRate : 0,
        taxAmount: calculations.taxAmount,
        totalAmount: calculations.grandTotal,
        paidAmount: calculations.dpAmt,
        remainingAmount: calculations.remAmt,
        paymentType,
        dpPercent: paymentType === 'dp' ? (parseFloat(dpPercent) || (calculations.grandTotal > 0 ? Math.round((calculations.dpAmt / calculations.grandTotal) * 100) : 50)) : 0,
        paymentStatus: paymentType === 'dp' ? (calculations.remAmt === 0 ? 'PAID' : 'PARTIAL') : paymentStatus,
        paymentMethod,
        notes,
        updateBoothStatus
      };

      let res;
      if (editingInvoiceId) {
        res = await api.updateInvoice(editingInvoiceId, payload);
      } else {
        res = await api.createInvoice(payload);
      }

      if (res && (res.success || res.invoice)) {
        showToast?.(editingInvoiceId ? '✨ Invoice berhasil diperbarui!' : '🎉 Invoice resmi berhasil diterbitkan!');
        await fetchInvoiceList();

        // Open A4 preview of the newly created/updated invoice
        const createdInv = res.invoice || {
          ...payload,
          id: editingInvoiceId || res.id,
          invoice_number: res.invoiceNumber || editingInvoiceId
        };
        setSelectedInvoice(createdInv);
        setViewMode('a4_preview');
      } else {
        showToast?.(`⚠️ Gagal menyimpan invoice: ${res?.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      showToast?.('⚠️ Terjadi kesalahan saat menyimpan invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status toggle handler
  const handleToggleStatus = async (inv) => {
    const nextStatus = inv.payment_status === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      const res = await api.updateInvoiceStatus(inv.id, nextStatus);
      if (res.success) {
        showToast?.(`Status invoice ${inv.invoice_number} diubah menjadi ${nextStatus}`);
        await fetchInvoiceList();
      }
    } catch (e) {
      showToast?.('⚠️ Gagal memperbarui status');
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (inv) => {
    if (!confirm(`Hapus invoice ${inv.invoice_number} atas nama "${inv.company_name}"?`)) return;
    try {
      const res = await api.deleteInvoice(inv.id);
      if (res.success) {
        showToast?.(`🗑️ Invoice ${inv.invoice_number} berhasil dihapus`);
        await fetchInvoiceList();
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghapus invoice');
    }
  };

  if (!isOpen) return null;

  // Mode 3: A4 Fullscreen Print View
  if (viewMode === 'a4_preview' && selectedInvoice) {
    return (
      <InvoiceA4View
        invoice={selectedInvoice}
        onClose={() => setViewMode('list')}
        onEdit={() => handleEditInvoice(selectedInvoice)}
        onOpenEditor={onOpenEditor}
      />
    );
  }

  // Filtered invoices in list mode
  const filteredInvoices = invoices.filter(inv => {
    const matchSearch = (
      (inv.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.company_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.booth_code || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (statusFilter === 'all') return matchSearch;
    return matchSearch && (inv.payment_status || '').toUpperCase() === statusFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <FileText size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  {viewMode === 'form' 
                    ? (editingInvoiceId ? 'Edit Invoice & Diskon Khusus' : 'Buat Invoice Booth Baru') 
                    : 'Manajemen & Penerbitan Invoice Pameran'}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-400/30">
                  Layout Standar A4
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {viewMode === 'form'
                  ? 'Admin dapat memberikan diskon privat khusus untuk tenant ini tanpa mengubah harga publik.'
                  : 'Kelola seluruh invoice tenant, terbitkan tagihan resmi, dan cetak dokumen layout A4.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'form' && (
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Kembali ke Daftar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* VIEW MODE 1: LIST / CATALOG OF INVOICES */}
        {viewMode === 'list' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({invoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('UNPAID')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === 'UNPAID' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Belum Lunas ({invoices.filter(i => i.payment_status === 'UNPAID').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PAID')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lunas ({invoices.filter(i => i.payment_status === 'PAID').length})
                </button>
              </div>

              {/* Search & Add New Invoice */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari no invoice, tenant, PIC, booth..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56 sm:w-64"
                  />
                </div>

                {onOpenEditor && (
                  <button
                    type="button"
                    onClick={onOpenEditor}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-300 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    title="Buka Invoice Visual Editor untuk atur posisi logo, header, warna dan rekening"
                  >
                    <Sparkles size={13} className="text-indigo-600" />
                    <span>Desain Layout A4</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    initFormWithBooth(availableBooths[0] || { code: 'A-01', price: 5000000 });
                    setViewMode('form');
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Buat Invoice Baru</span>
                </button>
              </div>
            </div>

            {/* Invoices List Table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {isLoading ? (
                <div className="py-20 text-center text-slate-400 space-y-2">
                  <RefreshCw size={24} className="animate-spin mx-auto text-blue-500" />
                  <p className="text-xs font-medium">Memuat data invoice...</p>
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
                  <FileText size={36} className="mx-auto text-slate-300 mb-2" />
                  <h3 className="text-sm font-bold text-slate-700">Belum ada invoice diterbitkan</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchQuery ? 'Tidak ada invoice yang sesuai dengan pencarian.' : 'Klik tombol "+ Buat Invoice Baru" untuk membuat tagihan resmi dengan diskon khusus admin.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredInvoices.map((inv) => {
                    const isPaid = (inv.payment_status || '').toUpperCase() === 'PAID';
                    const hasDiscount = Boolean(inv.discount_amount && inv.discount_amount > 0);

                    return (
                      <div
                        key={inv.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        {/* Left: Invoice Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
                              {inv.invoice_number}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isPaid 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                                : 'bg-amber-50 text-amber-700 border-amber-300'
                            }`}>
                              {isPaid ? '● LUNAS' : '● BELUM LUNAS'}
                            </span>
                            {inv.booth_code && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200">
                                Booth #{inv.booth_code}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-bold text-slate-800">{inv.company_name}</span>
                            <span className="text-slate-400">•</span>
                            <span>PIC: {inv.client_name}</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-400">Jatuh Tempo: {inv.due_date || '-'}</span>
                          </div>

                          {/* Private Discount Tag if applied */}
                          {hasDiscount && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                              <Lock size={11} className="text-emerald-600" />
                              <span>
                                <b>Diskon Khusus:</b> - Rp {(inv.discount_amount || 0).toLocaleString('id-ID')}
                                {inv.discount_reason ? ` (${inv.discount_reason})` : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Middle: Amount */}
                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Tagihan</span>
                          <span className="font-mono font-black text-slate-900 text-sm sm:text-base">
                            Rp {(inv.total_amount || 0).toLocaleString('id-ID')}
                          </span>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {/* View A4 Print Button */}
                          <button
                            type="button"
                            onClick={async () => {
                              const full = await api.fetchInvoiceById(inv.id);
                              setSelectedInvoice(full || inv);
                              setViewMode('a4_preview');
                            }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="Lihat & Cetak Layout A4"
                          >
                            <Printer size={13} />
                            <span>Cetak A4</span>
                          </button>

                          {/* Toggle status button */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(inv)}
                            className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                              isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                            title={isPaid ? 'Ubah status ke Belum Lunas' : 'Tandai sebagai Lunas'}
                          >
                            <CheckCircle2 size={15} />
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleEditInvoice(inv)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                            title="Edit Invoice"
                          >
                            <Edit3 size={15} />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(inv)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                            title="Hapus Invoice"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW MODE 2: CREATE / EDIT FORM */}
        {viewMode === 'form' && (
          <form onSubmit={handleSubmitInvoice} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            
            {/* Section 1: Booth Selection & Client Info */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Building2 size={15} className="text-blue-600" />
                <span>1. Pemilihan Booth & Data Tenant (Client)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Booth selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pilih Booth Terkait:
                  </label>
                  <select
                    value={selectedBoothId}
                    onChange={(e) => handleBoothSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Buat Manual (Tanpa Tautan Booth) --</option>
                    {availableBooths.map(b => (
                      <option key={b.id} value={b.id}>
                        Booth #{b.code} ({b.category || 'Standar'} - {b.widthM}x{b.heightM}m - Rp {(b.price || 0).toLocaleString('id-ID')})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Company Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Perusahaan / Brand <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Telkom Indonesia Tbk"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* PIC Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama PIC / Kontak <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Bpk. Ahmad Hidayat"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Email PIC / Keuangan:
                  </label>
                  <input
                    type="email"
                    placeholder="finance@perusahaan.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    No. WhatsApp / HP:
                  </label>
                  <input
                    type="text"
                    placeholder="0812-3456-7890"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* NPWP */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    NPWP Perusahaan (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="01.234.567.8-901.000"
                    value={clientNpwp}
                    onChange={(e) => setClientNpwp(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tanggal Terbit Invoice:
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tanggal Jatuh Tempo:
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-rose-700"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Items Table */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Tag size={15} className="text-blue-600" />
                  <span>2. Rincian Layanan & Sewa Booth</span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
                >
                  <Plus size={13} />
                  <span>+ Tambah Item / Layanan</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Item #{idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          title="Hapus Item"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Deskripsi Item</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Harga Satuan (Rp)</label>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Jumlah</label>
                        <div className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 text-right">
                          Rp {(item.amount || 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: PRIVATE ADMIN DISCOUNT PANEL (Special Feature) */}
            <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/50 rounded-xl p-5 border-2 border-emerald-300 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                    <Lock size={15} className="text-emerald-700" />
                    <span>3. Diskon Khusus Admin (Private Negotiated Discount)</span>
                  </h3>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Diskon ini <b>bersifat privat</b> dan hanya tertera pada invoice resmi klien ini. Klien lain di portal publik <b>tetap melihat harga katalog standar</b>.
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 shrink-0">
                  🔒 Rahasia Admin
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Discount Type Toggle */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                    Tipe Diskon:
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-emerald-300">
                    <button
                      type="button"
                      onClick={() => setDiscountType('nominal')}
                      className={`py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        discountType === 'nominal' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Nominal (Rp)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={`py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        discountType === 'percentage' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Persen (%)
                    </button>
                  </div>
                </div>

                {/* Discount Value */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                    {discountType === 'percentage' ? 'Besaran Diskon (%)' : 'Nominal Potongan Diskon (Rp)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : calculations.subtotal}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="text-[10px] text-emerald-700 mt-1">
                    Total Potongan: <b>- Rp {calculations.discountAmount.toLocaleString('id-ID')}</b>
                  </div>
                </div>

                {/* Reason Note */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                    Keterangan Diskon (Internal / Tampil di Invoice):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Diskon Kemitraan VIP, Early Bird 15%..."
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Pajak: with or without PPN */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Pajak (PPN)</span>
              <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                {[[true, `Dengan PPN ${applyTax ? taxRate : taxRateSetting}%`], [false, 'Tanpa PPN']].map(([val, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setApplyTax(val); if (val && !applyTax) setTaxRate(taxRateSetting); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${applyTax === val ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500">PPN dihitung dari nilai setelah diskon. Tarif default diatur di Setting &gt; Aturan Booking, PPN &amp; Pajak.</span>
            </div>

            {/* Section 4: Summary, Down Payment (DP) & Sync Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment Settings & Down Payment Panel */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    4. Skema Pembayaran & Status
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Bisa Uang Muka (DP)
                  </span>
                </div>

                {/* Payment Scheme Toggle: Full vs DP */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Pilihan Skema Pembayaran:
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('full');
                        setPaymentStatus('UNPAID');
                      }}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        paymentType === 'full' 
                          ? 'bg-white text-slate-900 shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bayar Penuh (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('dp');
                        setPaymentStatus('PARTIAL');
                        if (!customPaidAmount && dpPercent === 50) {
                          setCustomPaidAmount(Math.round(calculations.grandTotal * 0.5).toString());
                        }
                      }}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        paymentType === 'dp' 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>Uang Muka (DP)</span>
                      <span className="text-[10px] opacity-80">(Cicil)</span>
                    </button>
                  </div>
                </div>

                {/* If DP is Selected: Configure DP Amount */}
                {paymentType === 'dp' && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-900">
                        Pilihan Persentase DP:
                      </span>
                      <div className="flex gap-1">
                        {[30, 50, 70].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setDpPercent(pct);
                              setCustomPaidAmount(Math.round((calculations.grandTotal * pct) / 100).toString());
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                              dpPercent === pct && customPaidAmount === Math.round((calculations.grandTotal * pct) / 100).toString()
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-blue-900 mb-1">
                        Nominal Uang Muka (DP) yang Dibayarkan (Rp):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={calculations.grandTotal}
                        value={customPaidAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPaidAmount(val);
                          const num = parseFloat(val) || 0;
                          if (calculations.grandTotal > 0) {
                            setDpPercent(Math.round((num / calculations.grandTotal) * 100));
                          }
                        }}
                        placeholder={`Contoh: ${Math.round(calculations.grandTotal * 0.5)}`}
                        className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-blue-200/60">
                      <span className="text-blue-800">Sisa Tagihan Pelunasan:</span>
                      <span className="font-mono font-bold text-amber-700">
                        Rp {calculations.remAmt.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Booth Status Sync Option */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateBoothStatus}
                      onChange={(e) => setUpdateBoothStatus(e.target.checked)}
                      className="rounded text-blue-600 accent-blue-600"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Otomatis kunci status booth di denah menjadi <b>{paymentType === 'dp' ? 'Reserved (DP Masuk)' : (paymentStatus === 'PAID' ? 'Sold' : 'Reserved')}</b>
                    </span>
                  </label>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">Status Awal:</span>
                    <div className="flex gap-1.5">
                      {paymentType === 'dp' ? (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300">
                          🔵 Uang Muka (DP)
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setPaymentStatus('UNPAID')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              paymentStatus === 'UNPAID' ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            Belum Lunas
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentStatus('PAID')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              paymentStatus === 'PAID' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            Lunas (Paid)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Final Financial Breakdown (Dark Card) */}
              <div className="bg-slate-900 text-white rounded-xl p-5 shadow-md flex flex-col justify-between space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                  Ringkasan Tagihan & Pelunasan (Final)
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal:</span>
                    <span className="font-mono">Rp {calculations.subtotal.toLocaleString('id-ID')}</span>
                  </div>

                  {calculations.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Diskon Khusus ({discountReason || 'Mitra'}):</span>
                      <span className="font-mono">- Rp {calculations.discountAmount.toLocaleString('id-ID')}</span>
                    </div>
                  )}

                  {calculations.taxAmount > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>PPN ({taxRate}%):</span>
                      <span className="font-mono">+ Rp {calculations.taxAmount.toLocaleString('id-ID')}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                    <span className="font-black text-xs uppercase text-slate-200">TOTAL TAGIHAN:</span>
                    <span className="font-mono font-black text-lg text-white">
                      Rp {calculations.grandTotal.toLocaleString('id-ID')}
                    </span>
                  </div>

                  {paymentType === 'dp' && (
                    <div className="bg-slate-800/80 rounded-lg p-2.5 space-y-1.5 border border-slate-700 animate-fadeIn">
                      <div className="flex justify-between text-emerald-400 font-bold">
                        <span>Uang Muka (DP) Dibayarkan:</span>
                        <span className="font-mono">Rp {calculations.dpAmt.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-amber-300 font-black border-t border-slate-700/80 pt-1">
                        <span>SISA TAGIHAN (PELUNASAN):</span>
                        <span className="font-mono text-sm text-amber-300">
                          Rp {calculations.remAmt.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Action Buttons */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <Printer size={15} />
                <span>{isSubmitting ? 'Menyimpan...' : 'Terbitkan & Buka Layout A4'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
