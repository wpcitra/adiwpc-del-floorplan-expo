import React from 'react';
import { X, PlusSquare, MinusSquare, Move, Maximize2, RotateCw, UserRound, Hash, AlertTriangle, MapPin, CheckCheck } from 'lucide-react';
import { captionText } from '../../utils/elementCaptions';

const TYPE_STYLE = {
  added: { icon: PlusSquare, color: 'text-emerald-600' },
  removed: { icon: MinusSquare, color: 'text-rose-600' },
  moved: { icon: Move, color: 'text-indigo-600' },
  resized: { icon: Maximize2, color: 'text-indigo-600' },
  rotated: { icon: RotateCw, color: 'text-indigo-600' },
  tenant: { icon: UserRound, color: 'text-amber-600' },
  renamed: { icon: Hash, color: 'text-slate-600' }
};

const formatSeen = (value) => {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return isNaN(d) ? value : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// "Perubahan dari Sales": booth changes since the operations team last opened this floorplan (+ live updates while open)
// and the operational elements that now conflict with a booth. Clicking an item zooms to its location.
export default function SalesChangesPanel({ changes = [], conflicts = new Map(), orphans = new Set(), lastSeenAt, firstOpen = false, onFocus, onFocusElement, onClear, onClose }) {
  const warnings = [
    ...[...conflicts.entries()].map(([el, codes]) => ({ el, text: `${captionText(el)} bertabrakan dengan booth ${codes.join(', ')}`, tone: 'rose' })),
    ...[...orphans].map(el => ({ el, text: `${captionText(el)}: booth induk sudah dihapus`, tone: 'orange' }))
  ];
  return (
    <div className="absolute top-3 left-3 z-30 w-[340px] max-h-[70%] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Perubahan dari Sales</h3>
          <p className="text-[11px] text-slate-500">
            {firstOpen ? 'Pertama kali membuka denah ini: perubahan berikutnya akan tampil di sini.' : `Sejak terakhir dibuka${lastSeenAt ? ` (${formatSeen(lastSeenAt)})` : ''}`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200" title="Tutup"><X size={16} /></button>
      </div>
      <div className="overflow-y-auto p-3 space-y-3">
        {warnings.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1"><AlertTriangle size={11} /> Konflik ({warnings.length})</div>
            {warnings.map((w, i) => (
              <button key={i} type="button" onClick={() => onFocusElement?.(w.el)}
                className={`w-full text-left px-2.5 py-2 rounded-lg border text-[11px] flex items-start gap-1.5 ${w.tone === 'rose' ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100' : 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'}`}>
                <MapPin size={12} className="shrink-0 mt-0.5" /> {w.text}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Perubahan Booth ({changes.length})</div>
          {changes.length === 0 && <p className="text-[11px] text-slate-400 py-2">Tidak ada perubahan booth dari tim Sales.</p>}
          {changes.map(c => {
            const style = TYPE_STYLE[c.type] || TYPE_STYLE.moved;
            const Icon = style.icon;
            return (
              <button key={c.id} type="button" onClick={() => onFocus?.(c)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 flex items-start gap-2">
                <Icon size={14} className={`${style.color} shrink-0 mt-0.5`} />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">{c.text}{c.live && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold align-middle">BARU</span>}</span>
                  {c.detail && <span className="block text-[11px] text-slate-500 truncate">{c.detail}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {changes.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button type="button" onClick={onClear} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-200 flex items-center gap-1"><CheckCheck size={12} /> Tandai sudah ditinjau</button>
        </div>
      )}
    </div>
  );
}
