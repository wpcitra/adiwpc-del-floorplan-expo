import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  MessageSquare, 
  ExternalLink, 
  Search, 
  Users, 
  Building2, 
  Calendar, 
  Sparkles,
  CheckSquare,
  Square,
  AlertCircle,
  FileText
} from 'lucide-react';
import { api } from '../../services/api';

export default function BroadcastTenantModal({
  isOpen,
  onClose,
  activeForm,
  projectId = 'global',
  showToast,
  onOpenTenantForm = null
}) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBoothIds, setSelectedBoothIds] = useState(new Set());
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedBroadcastText, setCopiedBroadcastText] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTenants();
    }
  }, [isOpen, projectId]);

  const loadTenants = async () => {
    setLoading(true);
    try {
      // Fetch stats / exhibitors
      const res = await api.fetchStats(projectId);
      const list = res?.exhibitorsList || [];
      
      // Filter exhibitors that have reserved or sold booths
      const confirmed = list.filter(e => 
        (e.status === 'sold' || e.status === 'reserved') && 
        (e.tenant || e.company_name || e.companyName)
      );

      setTenants(confirmed);
      // Default select all confirmed tenants
      setSelectedBoothIds(new Set(confirmed.map(t => t.boothCode || t.code)));
    } catch (e) {
      console.error('Error loading tenants for broadcast:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const baseUrl = window.location.origin;
  const formId = activeForm?.id || 'form_active_default';
  const generalFormUrl = `${baseUrl}/facility-request?formId=${encodeURIComponent(formId)}`;

  const getPersonalizedUrl = (tenant) => {
    const booth = encodeURIComponent(tenant.boothCode || tenant.code || '');
    const company = encodeURIComponent(tenant.tenant || tenant.company_name || tenant.companyName || '');
    return `${baseUrl}/facility-request?formId=${encodeURIComponent(formId)}&booth=${booth}&company=${company}`;
  };

  const getWhatsAppMessage = (tenant) => {
    const booth = tenant.boothCode || tenant.code || 'Booth';
    const company = tenant.tenant || tenant.company_name || tenant.companyName || 'Bapak/Ibu Exhibitor';
    const url = getPersonalizedUrl(tenant);
    const deadline = activeForm?.deadline_date ? `sebelum ${activeForm.deadline_date}` : 'segera';

    return encodeURIComponent(
      `Halo *${company}* (Booth *#${booth}*),\n\n` +
      `Panitia *${activeForm?.event_title || 'Indonesia International Expo 2026'}* menginformasikan bahwa formulir pengajuan fasilitas tambahan booth (listrik, meja, kursi, spotlight, dll) telah dibuka.\n\n` +
      `📋 *Link Formulir Pesanan Fasilitas:*\n${url}\n\n` +
      `Mohon submit kebutuhan fasilitas Anda ${deadline} agar dapat dipersiapkan tim teknis sebelum hari loading-in.\n\n` +
      `Terima kasih.\n_Panitia Pelaksana Exhibition_`
    );
  };

  const handleCopyGeneralLink = () => {
    navigator.clipboard.writeText(generalFormUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    if (showToast) showToast('🔗 Tautan formulir umum berhasil disalin!');
  };

  const handleCopyBroadcastText = () => {
    const deadline = activeForm?.deadline_date ? `sebelum tanggal *${activeForm.deadline_date}*` : 'segera';
    const broadcastText = 
      `📢 *PENGUMUMAN RESMI: PENGAJUAN FASILITAS TAMBAHAN EXHIBITION*\n\n` +
      `Yth. Seluruh Tenant & Exhibitor *${activeForm?.event_title || 'Indonesia International Expo 2026'}*,\n\n` +
      `Formulir pemesanan fasilitas tambahan untuk stan pameran Anda (Daya Listrik ekstra, Meja IBM, Kursi Futura, Spotlight LED, Wastafel, Karpet, dll.) saat ini telah dibuka secara resmi.\n\n` +
      `🔗 *Tautan Formulir Online:*\n${generalFormUrl}\n\n` +
      `⚠️ *Catatan Penting:*\n` +
      `1. Pengajuan fasilitas tambahan paling lambat diserahkan ${deadline}.\n` +
      `2. Seluruh pesanan resmi akan diterbitkan invoice A4 dan wajib diselesaikan sebelum jadwal loading-in.\n` +
      `3. Untuk pertanyaan seputar spesifikasi teknis, silakan hubungi tim Helpdesk Panitia.\n\n` +
      `Terima kasih atas kerja samanya.\n_Management Exhibition Committee_`;

    navigator.clipboard.writeText(broadcastText);
    setCopiedBroadcastText(true);
    setTimeout(() => setCopiedBroadcastText(false), 2500);
    if (showToast) showToast('📋 Teks pengumuman broadcast berhasil disalin ke clipboard!');
  };

  const toggleSelectAll = () => {
    if (selectedBoothIds.size === filteredTenants.length) {
      setSelectedBoothIds(new Set());
    } else {
      setSelectedBoothIds(new Set(filteredTenants.map(t => t.boothCode || t.code)));
    }
  };

  const toggleSelectBooth = (code) => {
    const updated = new Set(selectedBoothIds);
    if (updated.has(code)) {
      updated.delete(code);
    } else {
      updated.add(code);
    }
    setSelectedBoothIds(updated);
  };

  const filteredTenants = tenants.filter(t => {
    const cName = (t.tenant || t.company_name || t.companyName || '').toLowerCase();
    const bCode = (t.boothCode || t.code || '').toLowerCase();
    const q = search.toLowerCase().trim();
    return !q || cName.includes(q) || bCode.includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Send size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Kirim Formulir ke Semua Tenant</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Distribusi Broadcast
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Bagikan tautan formulir fasilitas tambahan ke seluruh exhibitor yang telah terdaftar di denah.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Link & Broadcast Action Strip */}
        <div className="p-6 bg-slate-950/40 border-b border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
            <div className="flex-1 min-w-0 pr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Tautan Formulir Publik (Umum):
              </span>
              <p className="text-xs font-mono text-indigo-300 truncate select-all">
                {generalFormUrl}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyGeneralLink}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedLink ? 'Tersalin!' : 'Salin Link'}</span>
              </button>
              <a
                href={generalFormUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <ExternalLink size={13} />
                <span>Buka Form</span>
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopyBroadcastText}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              {copiedBroadcastText ? <Check size={16} /> : <MessageSquare size={16} />}
              <span>{copiedBroadcastText ? 'Teks Broadcast Tersalin ke Clipboard!' : 'Salin Teks Broadcast WhatsApp / Email Grup'}</span>
            </button>
          </div>
        </div>

        {/* Tenant List Header & Search */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              {selectedBoothIds.size === filteredTenants.length && filteredTenants.length > 0 ? (
                <CheckSquare size={16} className="text-indigo-400" />
              ) : (
                <Square size={16} className="text-slate-500" />
              )}
              <span>Pilih Semua ({filteredTenants.length})</span>
            </button>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-slate-400">
              Terpilih: <strong className="text-indigo-400">{selectedBoothIds.size}</strong> tenant
            </span>
          </div>

          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari tenant / booth..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Tenant List Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Memuat daftar tenant terdaftar...
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <Users size={28} className="mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="font-semibold text-slate-400">Tidak ada tenant ditemukan</p>
              <p className="text-[11px] mt-1 text-slate-600">Pastikan sudah ada booth berstatus Sold/Reserved di denah.</p>
            </div>
          ) : (
            filteredTenants.map((t, idx) => {
              const bCode = t.boothCode || t.code;
              const cName = t.tenant || t.company_name || t.companyName || 'Nama Tenant';
              const isSelected = selectedBoothIds.has(bCode);
              const phone = t.phone || t.client_phone || '';
              const waUrl = phone 
                ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${getWhatsAppMessage(t)}` 
                : null;

              return (
                <div 
                  key={idx}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected 
                      ? 'bg-slate-800/60 border-indigo-500/40' 
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleSelectBooth(bCode)}
                      className="cursor-pointer text-slate-400 hover:text-white shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare size={16} className="text-indigo-400" />
                      ) : (
                        <Square size={16} className="text-slate-600" />
                      )}
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-800/40 flex items-center justify-center font-mono font-bold text-xs text-indigo-300 shrink-0">
                      {bCode}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200 truncate">{cName}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                          t.status === 'sold' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {t.status === 'sold' ? 'Terjual (Lunas)' : 'Reserved'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        PIC: <span className="text-slate-300">{t.ownerName || t.pic_name || '-'}</span>
                        {phone && <span className="ml-2 font-mono text-slate-500">WA: {phone}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(getPersonalizedUrl(t));
                        if (showToast) showToast(`🔗 Tautan khusus booth ${bCode} disalin!`);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                      title="Salin Link Khusus Tenant Ini"
                    >
                      <Copy size={14} />
                    </button>

                    {onOpenTenantForm && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTenantForm(t);
                        }}
                        className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        title="Buat Lembar Formulir PDF A4 & WA untuk Tenant Ini"
                      >
                        <FileText size={13} />
                        <span>Form PDF</span>
                      </button>
                    )}

                    {waUrl ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                        title="Kirim Pesan WhatsApp Langsung"
                      >
                        <MessageSquare size={13} />
                        <span>Kirim WA</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic px-2">No WA kosong</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar size={13} className="text-indigo-400" />
            <span>
              Batas Pengajuan: <strong className="text-slate-200">{activeForm?.deadline_date || 'Belum diatur'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
