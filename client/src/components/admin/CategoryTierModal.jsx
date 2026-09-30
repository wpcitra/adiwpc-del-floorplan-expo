import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Tag, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Sliders, 
  DollarSign, 
  Layers, 
  Box,
  Palette
} from 'lucide-react';
import { api } from '../../services/api';
import { updateBoothCategoriesRegistry } from '../../utils/floorplanUtils';

const PRESET_PALETTES = [
  { label: 'Biru Royal', color: '#eff6ff', border: '#3b82f6' },
  { label: 'Emerald Hijau', color: '#ecfdf5', border: '#10b981' },
  { label: 'Amber / Gold', color: '#fffbeb', border: '#f59e0b' },
  { label: 'Indigo / VVIP', color: '#eef2ff', border: '#6366f1' },
  { label: 'Rose / Pink', color: '#fff1f2', border: '#f43f5e' },
  { label: 'Cyan / Teal', color: '#ecfeff', border: '#06b6d4' },
  { label: 'Purple / Violet', color: '#faf5ff', border: '#a855f7' },
  { label: 'Netral / Slate', color: '#f8fafc', border: '#64748b' }
];

export default function CategoryTierModal({
  isOpen,
  onClose,
  onCategoriesUpdated,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = Add, number = Edit
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    widthM: 3,
    heightM: 3,
    defaultPrice: 5000000,
    isFree: false,
    color: '#eff6ff',
    border: '#3b82f6',
    description: ''
  });

  // Load categories from backend API
  const loadCategories = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.fetchCategories();
      if (data && Array.isArray(data)) {
        setCategories(data);
        updateBoothCategoriesRegistry(data);
        if (onCategoriesUpdated) onCategoriesUpdated(data);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar kategori:', err);
      setErrorMsg('Gagal memuat kategori dari server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      setIsFormOpen(false);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Slug generator helper
  const generateKeyFromName = (name) => {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const handleStartAdd = () => {
    setEditingId(null);
    setFormData({
      name: '',
      key: '',
      widthM: 3,
      heightM: 3,
      defaultPrice: 5000000,
      isFree: false,
      color: '#eff6ff',
      border: '#3b82f6',
      description: ''
    });
    setIsFormOpen(true);
  };

  const handleStartEdit = (cat) => {
    setEditingId(cat.id);
    setFormData({
      name: cat.name || '',
      key: cat.key || '',
      widthM: Number(cat.widthM || cat.width_m) || 3,
      heightM: Number(cat.heightM || cat.height_m) || 3,
      defaultPrice: Number(cat.defaultPrice || cat.default_price) || 0,
      isFree: Boolean(cat.isFree || cat.is_free),
      color: cat.color || '#eff6ff',
      border: cat.border || cat.border_color || '#3b82f6',
      description: cat.description || ''
    });
    setIsFormOpen(true);
  };

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Mohon isi nama kategori booth!');
      return;
    }

    const payloadKey = formData.key.trim() || generateKeyFromName(formData.name);

    const payload = {
      name: formData.name.trim(),
      key: payloadKey,
      widthM: Number(formData.widthM) || 3,
      heightM: Number(formData.heightM) || 3,
      defaultPrice: formData.isFree ? 0 : Number(formData.defaultPrice) || 0,
      isFree: formData.isFree,
      color: formData.color || '#eff6ff',
      borderColor: formData.border || '#3b82f6',
      description: formData.description.trim()
    };

    setIsSaving(true);
    try {
      if (editingId) {
        // Update existing
        await api.updateCategory(editingId, payload);
        if (showToast) showToast(`✅ Kategori "${payload.name}" berhasil diperbarui!`);
      } else {
        // Create new
        await api.createCategory(payload);
        if (showToast) showToast(`🎉 Kategori baru "${payload.name}" berhasil ditambahkan!`);
      }
      setIsFormOpen(false);
      setEditingId(null);
      await loadCategories();
    } catch (err) {
      console.error('Gagal menyimpan kategori:', err);
      alert(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (categories.length <= 1) {
      alert('Tidak dapat menghapus! Minimal harus ada 1 kategori booth di sistem.');
      return;
    }

    if (!window.confirm(`Hapus kategori "${cat.name}"? Perubahan ini akan menghapus opsi tier ini dari denah.`)) {
      return;
    }

    try {
      await api.deleteCategory(cat.id);
      if (showToast) showToast(`🗑️ Kategori "${cat.name}" berhasil dihapus.`);
      if (editingId === cat.id) {
        setIsFormOpen(false);
        setEditingId(null);
      }
      await loadCategories();
    } catch (err) {
      console.error('Gagal menghapus kategori:', err);
      alert(`Gagal menghapus: ${err.message || 'Terjadi kesalahan'}`);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Kembalikan semua kategori ke 6 tier bawaan (Standard, Corner, Premium, Island, Free, Custom)? Kategori tambahan kustom akan direset.')) {
      return;
    }

    setIsLoading(true);
    try {
      await api.resetCategories();
      if (showToast) showToast('🔄 Kategori berhasil direset ke standar bawaan!');
      setIsFormOpen(false);
      setEditingId(null);
      await loadCategories();
    } catch (err) {
      console.error('Gagal mereset kategori:', err);
      alert(`Gagal mereset: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Tag size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 tracking-tight">
                  Kelola Kategori & Tier Harga Booth
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                  {categories.length} Tingkatan
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur klasifikasi tier, dimensi standar (m), tarif sewa (IDR), dan visual badge untuk katalog booth.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Two-Column / Split Layout */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6 min-h-0 bg-slate-50/30">
          
          {/* Left Column: Category List */}
          <div className={`flex-1 flex flex-col min-w-0 ${isFormOpen ? 'hidden md:flex' : 'flex'}`}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" />
                Daftar Kategori Aktif
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset ke pengaturan awal bawaan sistem"
                >
                  <RotateCcw size={12} />
                  <span>Reset Default</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Tambah Tier</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* List Cards */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {isLoading && categories.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Memuat data kategori...
                </div>
              ) : categories.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  Belum ada kategori. Klik "+ Tambah Tier" untuk membuat baru.
                </div>
              ) : (
                categories.map((cat) => {
                  const width = Number(cat.widthM || cat.width_m) || 3;
                  const height = Number(cat.heightM || cat.height_m) || 3;
                  const price = Number(cat.defaultPrice || cat.default_price) || 0;
                  const isFree = Boolean(cat.isFree || cat.is_free);
                  const isSelectedForEdit = editingId === cat.id;

                  return (
                    <div
                      key={cat.id || cat.key}
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between group ${
                        isSelectedForEdit
                          ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20'
                          : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Swatch & Dimensions Preview Box */}
                        <div 
                          className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border text-center shadow-xs transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: cat.color || '#eff6ff',
                            borderColor: cat.border || cat.border_color || '#3b82f6',
                            borderWidth: '2px'
                          }}
                        >
                          <span 
                            className="text-[11px] font-black leading-tight"
                            style={{ color: cat.border || cat.border_color || '#1e40af' }}
                          >
                            {width}×{height}
                          </span>
                          <span className="text-[8px] font-semibold text-slate-500 uppercase">
                            {width * height} m²
                          </span>
                        </div>

                        {/* Title & Metadata */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              {cat.name}
                            </h4>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                              {cat.key}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] mt-0.5">
                            {isFree ? (
                              <span className="text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.2 rounded text-[10px]">
                                GRATIS (Sponsorship)
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-800">
                                Rp {price.toLocaleString('id-ID')}
                              </span>
                            )}
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400 text-[10px]">
                              Ukuran: {width} x {height} meter
                            </span>
                          </div>

                          {cat.description && (
                            <p className="text-[10px] text-slate-500 truncate max-w-[280px] mt-0.5">
                              {cat.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(cat)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 transition-colors cursor-pointer"
                          title="Ubah Kategori Ini"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cat)}
                          disabled={categories.length <= 1}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Hapus Kategori"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Add / Edit Form Drawer */}
          {isFormOpen ? (
            <div className="w-full md:w-[360px] bg-white border border-indigo-200 rounded-2xl p-4 shadow-sm flex flex-col shrink-0 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {editingId ? <Edit3 size={13} /> : <Plus size={13} />}
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    {editingId ? 'Edit Kategori Booth' : 'Tambah Kategori Baru'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="space-y-3 flex-1 overflow-y-auto pr-1">
                {/* 1. Category Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Kategori / Tier <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: VVIP Diamond 8x6m"
                    value={formData.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        name: val,
                        // Auto-generate key if creating new
                        key: !editingId && (!prev.key || prev.key === generateKeyFromName(prev.name)) 
                          ? generateKeyFromName(val) 
                          : prev.key
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                {/* 2. Key Identifier */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Kode Unik (Key) <span className="text-slate-400 text-[10px] font-normal">(Auto/ID)</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: VVIP_DIAMOND"
                    value={formData.key}
                    onChange={(e) => setFormData(prev => ({ ...prev, key: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-semibold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                {/* 3. Dimensions (Width x Height Meter) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Lebar (m)
                    </label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="0.5"
                        value={formData.widthM}
                        onChange={(e) => setFormData(prev => ({ ...prev, widthM: parseFloat(e.target.value) || 1 }))}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400 ml-1.5">m</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Panjang (m)
                    </label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="0.5"
                        value={formData.heightM}
                        onChange={(e) => setFormData(prev => ({ ...prev, heightM: parseFloat(e.target.value) || 1 }))}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400 ml-1.5">m</span>
                    </div>
                  </div>
                </div>

                {/* Area Preview Badge */}
                <div className="px-2.5 py-1.5 bg-indigo-50/60 rounded-lg border border-indigo-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">Total Luas Standar:</span>
                  <span className="font-bold text-indigo-700">
                    {(Number(formData.widthM) * Number(formData.heightM)).toFixed(1)} m²
                  </span>
                </div>

                {/* 4. Pricing (Free toggle & Default Price IDR) */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-700">
                      Tarif Harga Sewa
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 select-none">
                      <input
                        type="checkbox"
                        checked={formData.isFree}
                        onChange={(e) => setFormData(prev => ({ ...prev, isFree: e.target.checked }))}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Booth Gratis (Rp 0)</span>
                    </label>
                  </div>

                  {!formData.isFree ? (
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Rp
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="50000"
                        value={formData.defaultPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, defaultPrice: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-full pl-9 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles size={13} />
                      <span>Tier Sponsorship / Tenant Tanpa Biaya Sewa</span>
                    </div>
                  )}

                  {!formData.isFree && formData.defaultPrice > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Format: Rp {formData.defaultPrice.toLocaleString('id-ID')}
                    </p>
                  )}
                </div>

                {/* 5. Color Swatch & Border Customizer */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Warna Badge & Denah
                  </label>
                  
                  {/* Preset Swatches */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {PRESET_PALETTES.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color: p.color, border: p.border }))}
                        className={`h-7 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                          formData.color === p.color && formData.border === p.border
                            ? 'ring-2 ring-indigo-500 scale-105 shadow-xs'
                            : 'hover:opacity-80'
                        }`}
                        style={{ backgroundColor: p.color, borderColor: p.border }}
                        title={p.label}
                      >
                        {formData.color === p.color && formData.border === p.border && (
                          <Check size={12} style={{ color: p.border }} />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Manual Hex Inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">Warna Isi (Fill)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={formData.color}
                          onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                          className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={formData.color}
                          onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                          className="w-full px-1.5 py-0.5 text-[10px] font-mono border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-0.5">Garis Tepi (Border)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={formData.border}
                          onChange={(e) => setFormData(prev => ({ ...prev, border: e.target.value }))}
                          className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={formData.border}
                          onChange={(e) => setFormData(prev => ({ ...prev, border: e.target.value }))}
                          className="w-full px-1.5 py-0.5 text-[10px] font-mono border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. Description / Notes */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Deskripsi / Fasilitas Bawaan <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <textarea
                    rows="2"
                    placeholder="Contoh: Partisi R8, 1 meja, 2 kursi, listrik 2A, karpet buana"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                  />
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="flex-1 py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isSaving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Buat Kategori'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="hidden md:flex w-[260px] border border-dashed border-slate-200 rounded-2xl p-5 flex-col items-center justify-center text-center text-slate-400">
              <Box size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-600 mb-1">Pilih atau Tambah Kategori</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                Klik tombol edit pada salah satu kartu untuk mengubah harga atau klik tombol di bawah untuk menambah tier baru.
              </p>
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Tambah Tier Baru</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tersinkronisasi otomatis dengan SQLite database</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
