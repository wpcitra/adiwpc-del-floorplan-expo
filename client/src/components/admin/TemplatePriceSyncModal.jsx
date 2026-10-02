import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Scale, X, Loader2, Undo2, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

// "Samakan Semua Harga dengan Template" (AGENTS.md §32). Opening this window saves nothing: it shows what would
// change, grouped, and only the ticked booths are changed after "Terapkan" (one transaction on the server).
const GROUPS = [
  { key: 'change', title: 'Akan diubah', tone: 'text-blue-700 bg-blue-50 border-blue-200' },
  { key: 'custom', title: 'Harga khusus (tidak dicentang, kecuali Anda pilih)', tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  { key: 'locked', title: 'Terkunci karena sudah ada invoice', tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  { key: 'conflict', title: 'Konflik template', tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  { key: 'none', title: 'Tidak ada template', tone: 'text-slate-600 bg-slate-50 border-slate-200' },
  { key: 'same', title: 'Sudah sesuai (tidak berubah)', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
];

const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
const signed = (n) => (n === 0 ? rupiah(0) : `${n > 0 ? '+' : '−'}${rupiah(Math.abs(n))}`);

export default function TemplatePriceSyncModal({ isOpen, floorplanId, floorplanTitle, onClose, onPricesChanged, showToast }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const take = useCallback((res) => {
    setData(res);
    setPicked(new Set((res.rows || []).filter(r => r.checked).map(r => r.code)));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const res = await api.fetchTemplatePricePreview(floorplanId);
    setIsLoading(false);
    if (res?.success) take(res);
    else setError(res?.error || 'Gagal memuat pratinjau');
  }, [floorplanId, take]);

  useEffect(() => { if (isOpen && floorplanId) load(); }, [isOpen, floorplanId, load]);

  const rows = useMemo(() => data?.rows || [], [data]);
  const selectable = useMemo(() => rows.filter(r => r.selectable), [rows]);
  const chosen = useMemo(() => selectable.filter(r => picked.has(r.code)), [selectable, picked]);
  const totalDiff = chosen.reduce((acc, r) => acc + r.diff, 0);
  const totalNetDiff = chosen.reduce((acc, r) => acc + r.netDiff, 0);

  if (!isOpen) return null;

  const toggle = (code) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const setMany = (list, on) => setPicked(prev => {
    const next = new Set(prev);
    list.forEach(r => (on ? next.add(r.code) : next.delete(r.code)));
    return next;
  });

  const apply = async () => {
    if (!chosen.length || isSaving) return;
    setIsSaving(true);
    const res = await api.applyTemplatePrices(floorplanId, chosen.map(r => r.code));
    setIsSaving(false);
    if (res?.success) {
      onPricesChanged?.(res.changes || []);
      showToast?.(`✅ ${res.message}`);
      take(res);
    } else {
      showToast?.(`⚠️ ${res?.error || 'Gagal menyamakan harga'}`);
      setError(res?.error || 'Gagal menyamakan harga');
    }
  };

  const undo = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const res = await api.undoTemplatePrices(floorplanId);
    setIsSaving(false);
    if (res?.success) {
      onPricesChanged?.(res.changes || []);
      showToast?.(`↩️ ${res.message}`);
      take(res);
    } else {
      showToast?.(`⚠️ ${res?.error || 'Gagal membatalkan perubahan'}`);
    }
  };

  const last = data?.lastBatch && !data.lastBatch.undoneAt ? data.lastBatch : null;
  const allPicked = selectable.length > 0 && selectable.every(r => picked.has(r.code));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" role="dialog" aria-modal="true" aria-label="Samakan harga dengan template">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-left">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <Scale size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Samakan Semua Harga dengan Template</h2>
              <p className="text-[11px] text-slate-500 truncate">{floorplanTitle} • pratinjau, belum ada yang disimpan</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} title="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto text-xs flex-1">
          {isLoading && <div className="p-10 text-center text-slate-500"><Loader2 size={18} className="animate-spin inline-block mr-2" />Memuat pratinjau…</div>}
          {!isLoading && error && <div className="p-6 text-center text-rose-600 font-medium" role="alert">{error}</div>}
          {!isLoading && data && rows.length === 0 && <div className="p-10 text-center text-slate-500">Denah ini belum punya booth.</div>}
          {!isLoading && data && rows.length > 0 && (
            <>
              {selectable.length > 0 && (
                <label className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 text-slate-700 font-semibold cursor-pointer">
                  <input type="checkbox" checked={allPicked} onChange={(e) => setMany(selectable, e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Pilih semua yang bisa diubah ({selectable.length} booth, termasuk harga khusus)
                </label>
              )}
              {GROUPS.map(g => {
                const list = rows.filter(r => r.group === g.key);
                if (!list.length) return null;
                const canPick = list.some(r => r.selectable);
                return (
                  <section key={g.key} className="border-b border-slate-100">
                    <div className="px-5 py-2 flex items-center gap-2 bg-slate-50/70">
                      {canPick && (
                        <input type="checkbox" aria-label={`Pilih semua: ${g.title}`} className="w-3.5 h-3.5 accent-blue-600"
                          checked={list.every(r => picked.has(r.code))} onChange={(e) => setMany(list, e.target.checked)} />
                      )}
                      <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${g.tone}`}>{g.title}</span>
                      <span className="text-slate-500 font-semibold">{list.length} booth</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] table-fixed text-left border-collapse">
                        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="pl-5 pr-2 py-1.5 w-10"></th>
                            <th className="px-2 py-1.5 w-24">Booth</th>
                            <th className="px-2 py-1.5 w-20">Ukuran</th>
                            <th className="px-2 py-1.5 w-32 text-right">Harga Sekarang</th>
                            <th className="px-2 py-1.5 w-32 text-right">Harga Template</th>
                            <th className="px-2 py-1.5 w-32 text-right">Selisih</th>
                            <th className="px-2 py-1.5 w-44">Status</th>
                            <th className="px-2 pr-5 py-1.5">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.map(r => (
                            <tr key={r.id || r.code} className={r.selectable && picked.has(r.code) ? 'bg-blue-50/40' : ''}>
                              <td className="pl-5 pr-2 py-1.5">
                                {r.selectable && (
                                  <input type="checkbox" aria-label={`Ubah harga booth ${r.code}`} className="w-3.5 h-3.5 accent-blue-600"
                                    checked={picked.has(r.code)} onChange={() => toggle(r.code)} />
                                )}
                              </td>
                              <td className="px-2 py-1.5 font-mono font-bold text-slate-900 whitespace-nowrap">#{r.code}</td>
                              <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{r.sizeLabel}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-800 whitespace-nowrap">{rupiah(r.currentPrice)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-800 whitespace-nowrap">{r.templatePrice === null ? '-' : rupiah(r.templatePrice)}</td>
                              <td className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${r.diff > 0 ? 'text-emerald-700' : r.diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{r.templatePrice === null ? '-' : signed(r.diff)}</td>
                              <td className="px-2 py-1.5 text-slate-700 truncate" title={r.ownerName || undefined}>{r.statusLabel}{r.ownerName ? ` • ${r.ownerName}` : ''}</td>
                              <td className="px-2 pr-5 py-1.5 text-slate-500">
                                {r.note}
                                {r.selectable && r.discountAmount !== r.newDiscountAmount && (
                                  <span className="block">Diskon {rupiah(r.discountAmount)} → {rupiah(r.newDiscountAmount)}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-700">
            <span className="font-bold text-slate-900">{chosen.length} booth</span> akan diubah • selisih nilai penjualan{' '}
            <span className={`font-bold font-mono ${totalDiff > 0 ? 'text-emerald-700' : totalDiff < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{signed(totalDiff)}</span>
            {totalNetDiff !== totalDiff && <span className="text-slate-500"> (setelah diskon {signed(totalNetDiff)})</span>}
            {last && (
              <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-amber-600" />
                Perubahan terakhir: {last.count} booth oleh {last.userName || '-'}.
                <button type="button" onClick={undo} disabled={isSaving} className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer disabled:opacity-50">
                  <Undo2 size={11} /> Batalkan perubahan terakhir
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button type="button" onClick={onClose} disabled={isSaving}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer">
              Tutup
            </button>
            <button type="button" onClick={apply} disabled={!chosen.length || isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Scale size={13} />}
              <span>Terapkan ke {chosen.length} booth</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
