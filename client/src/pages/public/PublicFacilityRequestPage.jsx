import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Building2, 
  PackageCheck, 
  Calendar, 
  Clock, 
  Plus, 
  Minus, 
  CheckCircle2, 
  Send, 
  FileText, 
  Zap, 
  Layers, 
  Sparkles, 
  Info, 
  AlertCircle,
  Phone,
  Mail,
  User,
  MapPin,
  Check,
  Download,
  Printer,
  ArrowLeft
} from 'lucide-react';
import { api } from '../../services/api';

export default function PublicFacilityRequestPage() {
  const [searchParams] = useSearchParams();
  const formIdParam = searchParams.get('formId') || '';
  const boothParam = searchParams.get('booth') || '';
  const companyParam = searchParams.get('company') || '';

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  // Tenant Form Information
  const [boothCode, setBoothCode] = useState(boothParam);
  const [companyName, setCompanyName] = useState(companyParam);
  const [picName, setPicName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Selected item quantities: { [itemId]: qty }
  const [itemQuantities, setItemQuantities] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadForm();
  }, [formIdParam]);

  const loadForm = async () => {
    setLoading(true);
    try {
      if (formIdParam) {
        const res = await api.fetchFacilityFormById(formIdParam);
        if (res) {
          setForm(res);
          return;
        }
      }
      // Fallback to active forms
      const list = await api.fetchFacilityForms({ isTemplate: '0' });
      const active = list.find(f => f.is_active) || list[0];
      setForm(active || null);
    } catch (e) {
      console.error('Failed to load facility form:', e);
    } finally {
      setLoading(false);
    }
  };

  const items = form?.items || [];
  
  // Categories derived from items
  const categories = ['ALL', ...new Set(items.map(i => i.category || 'Lainnya'))];

  const handleQtyChange = (itemId, change) => {
    const item = items.find(i => i.id === itemId);
    const max = item?.max_qty || 99;
    const current = itemQuantities[itemId] || 0;
    const next = Math.max(0, Math.min(max, current + change));
    
    setItemQuantities(prev => ({
      ...prev,
      [itemId]: next
    }));
  };

  // Calculations
  const selectedItemsList = items
    .filter(i => (itemQuantities[i.id] || 0) > 0)
    .map(i => ({
      ...i,
      qty: itemQuantities[i.id],
      total: (itemQuantities[i.id] || 0) * (Number(i.price) || 0)
    }));

  const totalAmount = selectedItemsList.reduce((sum, i) => sum + i.total, 0);
  const totalQty = selectedItemsList.reduce((sum, i) => sum + i.qty, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!boothCode.trim()) {
      setErrorMessage('Nomor / Kode Booth wajib diisi');
      return;
    }
    if (!companyName.trim()) {
      setErrorMessage('Nama Perusahaan / Brand wajib diisi');
      return;
    }
    if (!picName.trim()) {
      setErrorMessage('Nama PIC Kontak wajib diisi');
      return;
    }
    if (!phone.trim()) {
      setErrorMessage('Nomor WhatsApp / Telepon wajib diisi untuk koordinasi teknis');
      return;
    }
    if (selectedItemsList.length === 0) {
      setErrorMessage('Silakan pilih minimal 1 item fasilitas tambahan');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        form_id: form?.id || 'form_active_default',
        project_id: form?.project_id || 'global',
        booth_code: boothCode.trim().toUpperCase(),
        company_name: companyName.trim(),
        pic_name: picName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        items: selectedItemsList,
        total_amount: totalAmount,
        notes: notes.trim()
      };

      const res = await api.submitFacilityRequest(payload);
      if (res && res.success) {
        setSubmittedData({
          ...res.request,
          eventTitle: form?.event_title || 'Indonesia International Expo 2026'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setErrorMessage(res?.message || 'Terjadi kesalahan saat mengirim pengajuan');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Gagal menghubungi server. Silakan coba beberapa saat lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (selectedCategory === 'ALL') return true;
    return item.category === selectedCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Memuat formulir fasilitas tambahan...</p>
      </div>
    );
  }

  if (!form && !loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={44} className="text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">Formulir Tidak Ditemukan</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Formulir pemesanan fasilitas belum dipublikasikan oleh panitia atau tautan yang Anda buka tidak valid.
        </p>
        <Link 
          to="/"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2"
        >
          <ArrowLeft size={14} />
          <span>Kembali ke Denah Expo</span>
        </Link>
      </div>
    );
  }

  // Confirmation Success View
  if (submittedData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 flex flex-col items-center">
        <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 size={36} />
          </div>

          <div className="text-center space-y-1 mb-8">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Pengajuan Berhasil Terkirim</span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Permintaan Fasilitas Tambahan Diterima
            </h1>
            <p className="text-xs text-slate-400 max-w-md mx-auto pt-1">
              Terima kasih, formulir Anda telah masuk ke sistem operasional pameran. Tim panitia akan memverifikasi dan menerbitkan invoice resmi.
            </p>
          </div>

          {/* Details Card */}
          <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-5 space-y-4 mb-6">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">ID Permintaan:</span>
                <span className="font-mono font-bold text-xs text-indigo-400">{submittedData.id}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Status:</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Clock size={12} /> MENUNGGU VERIFIKASI
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Booth & Tenant:</span>
                <p className="font-bold text-slate-200">
                  Booth #{submittedData.booth_code} • {submittedData.company_name}
                </p>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">PIC & Kontak:</span>
                <p className="font-bold text-slate-200">
                  {submittedData.pic_name} ({submittedData.phone || '-'})
                </p>
              </div>
            </div>

            {/* Selected items table */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Rincian Fasilitas Tambahan:
              </span>
              <div className="space-y-2">
                {submittedData.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="font-bold text-slate-200 block">{item.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {item.qty} {item.unit || 'unit'} x Rp {(Number(item.price) || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-100">
                      Rp {((Number(item.price) || 0) * (Number(item.qty) || 1)).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-300">Total Biaya Fasilitas:</span>
                <span className="font-mono font-black text-emerald-400 text-base">
                  Rp {(submittedData.total_amount || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {submittedData.notes && (
              <div className="pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-500 block text-[11px]">Catatan / Instruksi Khusus:</span>
                <p className="text-slate-300 italic">{submittedData.notes}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={15} />
              <span>Cetak Bukti Pengajuan</span>
            </button>
            <Link
              to="/"
              className="w-full sm:flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 text-center"
            >
              <span>Kembali ke Denah Pameran</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border border-indigo-900/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Portal Exhibitor & Tenant
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-300 font-medium">{form.event_title}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {form.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                {form.description || 'Silakan pilih fasilitas penunjang booth pameran Anda. Tim panitia operasional akan menyiapkan seluruh pesanan sebelum hari persiapan (loading-in).'}
              </p>
            </div>

            {form.deadline_date && (
              <div className="bg-slate-900/90 border border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-3 shrink-0 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <Calendar size={18} />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Batas Pengajuan:</span>
                  <span className="text-xs font-bold text-rose-400">{form.deadline_date}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Alert if any */}
        {errorMessage && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-2xl flex items-center gap-3 text-xs text-rose-200 animate-fadeIn">
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Area: Tenant Info + Item Catalog (Col span 2) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Identitas Tenant */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <h2 className="text-sm font-bold text-white">Identitas Tenant & Stan Pameran</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nomor / Kode Booth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: A-01, B-05, VIP-01"
                    value={boothCode}
                    onChange={(e) => setBoothCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-indigo-300 uppercase placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Perusahaan / Brand <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="PT / CV / Nama Brand Pameran"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama PIC Penanggung Jawab <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama lengkap PIC lapangan"
                    value={picName}
                    onChange={(e) => setPicName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    No. WhatsApp / Telepon <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0812xxxx (untuk konfirmasi panitia)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Katalog Fasilitas Tambahan */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Pilih Fasilitas Tambahan</h2>
                    <p className="text-[11px] text-slate-400">Atur jumlah unit fasilitas yang Anda perlukan untuk booth.</p>
                  </div>
                </div>

                {/* Category Pills Filter */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {cat === 'ALL' ? 'Semua Kategori' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items Grid */}
              <div className="space-y-3">
                {filteredItems.map(item => {
                  const qty = itemQuantities[item.id] || 0;
                  const price = Number(item.price) || 0;
                  const itemSubtotal = qty * price;
                  const isSelected = qty > 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-white">{item.name}</h3>
                          {item.category && (
                            <span className="text-[9px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                              {item.category}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>
                        )}
                        <div className="pt-1 flex items-center gap-3 text-xs">
                          <span className="font-mono font-bold text-emerald-400">
                            Rp {price.toLocaleString('id-ID')}
                          </span>
                          <span className="text-slate-500 text-[11px]">/ {item.unit || 'Unit'}</span>
                          {item.max_qty && (
                            <span className="text-[10px] text-slate-500 italic">
                              (Maks: {item.max_qty} {item.unit || 'unit'})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Stepper & Subtotal */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        {isSelected && (
                          <div className="text-left sm:text-right">
                            <span className="text-[9px] uppercase font-bold text-slate-500 block">Subtotal:</span>
                            <span className="font-mono font-bold text-xs text-slate-200">
                              Rp {itemSubtotal.toLocaleString('id-ID')}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.id, -1)}
                            disabled={qty === 0}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          
                          <span className="w-9 text-center font-mono font-bold text-xs text-white">
                            {qty}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.id, 1)}
                            disabled={qty >= (item.max_qty || 99)}
                            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shadow-sm"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Catatan Penempatan Teknis */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Instruksi & Catatan Khusus Penempatan</h2>
                  <p className="text-[11px] text-slate-400">Jelaskan letak penempatan colokan, posisi meja, atau permintaan teknis lainnya.</p>
                </div>
              </div>

              <textarea
                rows={3}
                placeholder="Contoh: Titik colokan mohon ditaruh di dinding belakang sebelah kanan. Meja diletakkan di depan dekat lorong."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Right Sidebar: Order Summary & Checkout (Col span 1) */}
          <div className="lg:sticky lg:top-8 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Ringkasan Pesanan</h3>
                <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                  {totalQty} Item
                </span>
              </div>

              {/* Selected items breakdown */}
              {selectedItemsList.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <PackageCheck size={28} className="mx-auto text-slate-600 mb-2 opacity-50" />
                  <p className="font-semibold text-slate-400">Belum Ada Fasilitas Dipilih</p>
                  <p className="text-[11px] mt-1 text-slate-600">Gunakan tombol (+) pada katalog fasilitas untuk menambahkan pesanan.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedItemsList.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                      <div className="pr-2">
                        <span className="font-semibold text-slate-200 block text-[11px] line-clamp-1">{item.name}</span>
                        <span className="text-[10px] text-slate-400">{item.qty} {item.unit || 'unit'} x Rp {Number(item.price).toLocaleString('id-ID')}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-200 text-xs shrink-0">
                        Rp {item.total.toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Grand Total */}
              <div className="pt-4 border-t border-slate-800 space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400 font-medium">Total Tagihan:</span>
                  <span className="text-lg font-black font-mono text-emerald-400">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  *Harga di atas resmi dari panitia expo dan akan diterbitkan invoice resmi A4.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || selectedItemsList.length === 0}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Mengirimkan Pesanan...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Kirimkan Formulir Fasilitas</span>
                  </>
                )}
              </button>
            </div>

            {/* Terms and Conditions Card */}
            {form.terms_notes && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-300">
                  <Info size={13} className="text-indigo-400 shrink-0" />
                  <span>Syarat & Ketentuan Panitia:</span>
                </div>
                <p className="whitespace-pre-line leading-relaxed text-slate-400">{form.terms_notes}</p>
              </div>
            )}
          </div>
        </form>

      </div>
    </div>
  );
}
