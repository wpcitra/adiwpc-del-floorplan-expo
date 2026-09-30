import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, ExternalLink, X, Copy, Check, ShieldCheck, PauseCircle, AlertTriangle } from 'lucide-react';

// Publish the open floorplan on its own public link (/live/<slug>). Several floorplans can be live at the
// same time; publishing this one does not take the others offline. "Hentikan Publikasi" turns it back into a draft.
export default function PublishModal({ isOpen, onClose, floorplanStats = {}, floorplanTitle = '', isPublished = false, publicSlug = null, onConfirmPublish, onUnpublish }) {
  const [copied, setCopied] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    if (isOpen) { setError(''); setCopied(false); setJustPublished(false); setIsWorking(false); }
  }, [isOpen]);

  if (!isOpen) return null;

  const publicUrl = publicSlug ? `${window.location.origin}/live/${publicSlug}` : '';
  const showLink = (isPublished || justPublished) && publicUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Waits for the server: success is only shown once the floorplan is really saved & published
  const handlePublish = async () => {
    setIsWorking(true);
    setError('');
    const res = await onConfirmPublish?.();
    setIsWorking(false);
    if (res?.success) setJustPublished(true);
    else setError(res?.error || 'Gagal mempublikasikan denah');
  };

  const handleUnpublish = async () => {
    if (!confirm(`Hentikan publikasi "${floorplanTitle}"?\nLink publiknya tidak dapat dibuka lagi sampai dipublikasikan ulang. Denah lain yang sedang live tidak terpengaruh.`)) return;
    setIsWorking(true);
    const res = await onUnpublish?.();
    setIsWorking(false);
    if (res?.success) onClose?.();
    else setError(res?.error || 'Gagal menghentikan publikasi');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn select-none p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Globe size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">{isPublished && !justPublished ? 'Denah Sedang Live' : 'Simpan & Publikasikan Denah'}</h3>
              <p className="text-xs text-slate-500 truncate max-w-[320px]">{floorplanTitle || 'Denah'} — tayang di link publiknya sendiri</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {justPublished && (
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="font-bold text-slate-900 text-base">Denah Berhasil Dipublikasikan!</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Bagikan link di bawah ke calon exhibitor. Denah lain yang sudah live tetap tayang di link masing-masing.
              </p>
            </div>
          )}

          {showLink && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Link Publik Denah Ini</span>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-indigo-700 truncate">{publicUrl}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={handleCopy}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 flex items-center gap-1 transition-colors">
                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copied ? 'Tersalin' : 'Salin'}
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer"
                    className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 flex items-center gap-1">
                    <ExternalLink size={12} /> Buka
                  </a>
                </div>
              </div>
            </div>
          )}

          {!justPublished && (
            <>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <span className="font-semibold text-slate-700 block">Ringkasan Denah:</span>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>• Total Unit Booth: <b>{floorplanStats.totalBooths || 0} unit</b></div>
                  <div>• Siap Dipesan: <b>{floorplanStats.available || 0} booth</b></div>
                  <div>• Terkunci / Reserved: <b>{floorplanStats.reserved || 0} booth</b></div>
                  <div>• Estimasi Omzet: <b>Rp {(floorplanStats.potentialRevenue || 0).toLocaleString('id-ID')}</b></div>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
                <span>
                  {isPublished
                    ? 'Menyimpan ulang akan memperbarui denah yang tayang di link yang sama.'
                    : 'Denah akan tayang di link publiknya sendiri. Denah lain yang sedang live tidak ikut berubah.'}
                </span>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <div>
            {isPublished && !justPublished && (
              <button type="button" disabled={isWorking} onClick={handleUnpublish}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                <PauseCircle size={14} /> Hentikan Publikasi
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-lg transition-colors">
              {justPublished ? 'Selesai' : 'Batal'}
            </button>
            {!justPublished && (
              <button type="button" disabled={isWorking} onClick={handlePublish}
                className="px-5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50">
                {isWorking ? 'Menyimpan ke Server...' : (<><Globe size={14} /> {isPublished ? 'Simpan & Perbarui' : 'Simpan & Publikasikan'}</>)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
