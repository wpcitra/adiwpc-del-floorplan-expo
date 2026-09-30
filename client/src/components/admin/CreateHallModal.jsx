import React, { useState } from 'react';
import { X, Building2, Plus, Copy, Sparkles, Loader2, Check } from 'lucide-react';

export default function CreateHallModal({
  isOpen,
  onClose,
  currentEvent,
  existingHalls = [],
  onCreateHall
}) {
  const [hallTitle, setHallTitle] = useState('');
  const [creationMode, setCreationMode] = useState('blank'); // 'blank' | 'clone'
  const [selectedSourceId, setSelectedSourceId] = useState(existingHalls[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hallTitle.trim()) {
      setErrorMsg('Nama Hall / Ruangan wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        eventId: currentEvent?.id,
        title: hallTitle.trim(),
        venue: currentEvent?.venue || 'Jakarta Convention Center',
        sourceId: creationMode === 'clone' ? selectedSourceId : null
      };

      const result = await onCreateHall(payload);
      if (result && result.success) {
        setHallTitle('');
        setCreationMode('blank');
        onClose();
      } else {
        setErrorMsg(result?.error || 'Gagal menambahkan hall baru.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Tambah Hall / Ruangan Baru</h2>
              <p className="text-xs text-blue-200/80 truncate max-w-xs">
                Event: {currentEvent?.title || 'Project Aktif'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nama Hall / Ruangan <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={hallTitle}
              onChange={(e) => setHallTitle(e.target.value)}
              placeholder="Contoh: Hall B - Robotics & Startup Arena"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all font-medium placeholder:text-slate-400"
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Beri nama yang jelas agar tenant dan pengunjung mudah membedakan hall pameran.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Tata Letak Awal
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Blank Canvas */}
              <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                creationMode === 'blank'
                  ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className={creationMode === 'blank' ? 'text-blue-600' : 'text-slate-400'} />
                    <span className="text-xs font-bold text-slate-800">Kanvas Kosong</span>
                  </div>
                  <input
                    type="radio"
                    name="creationMode"
                    value="blank"
                    checked={creationMode === 'blank'}
                    onChange={() => setCreationMode('blank')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Mulai dari lembar denah kosong dengan grid skala 1m = 20px.
                </p>
              </label>

              {/* Option 2: Clone from Existing Hall */}
              <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                creationMode === 'clone'
                  ? 'border-indigo-500 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-500/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Copy size={16} className={creationMode === 'clone' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-xs font-bold text-slate-800">Salin dari Hall Lain</span>
                  </div>
                  <input
                    type="radio"
                    name="creationMode"
                    value="clone"
                    checked={creationMode === 'clone'}
                    onChange={() => setCreationMode('clone')}
                    disabled={existingHalls.length === 0}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Salin susunan booth & fasilitas dari hall yang sudah ada di event ini.
                </p>
              </label>
            </div>
          </div>

          {creationMode === 'clone' && (
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 animate-fadeIn">
              <label className="block text-xs font-bold text-indigo-900 mb-1.5">
                Pilih Hall Sumber yang Ingin Disalin:
              </label>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {existingHalls.map((h) => (
                  <option key={h.id} value={h.id}>
                    🏛️ {h.title} ({h.totalBooths || 0} Booth)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-indigo-600 mt-1.5">
                ℹ️ Semua booth akan disalin dengan status "Tersedia" (siap dipasarkan).
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !hallTitle.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Membuat Hall...</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Buat Hall Baru</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
