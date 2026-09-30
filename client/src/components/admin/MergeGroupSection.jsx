import React, { useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { formatArea, groupDetails, MERGE_STATUS_LABELS } from '../../utils/boothMerge';

// Booth inspector block for an auto-merged booth group (AGENTS.md §18): members, total area, status and the
// "Tampilkan Terpisah" / "Gabungkan Kembali" switch. Booths, prices and invoices are never changed by it.
export default function MergeGroupSection({ group, autoMergeEnabled = true, onToggle }) {
  const [busy, setBusy] = useState(false);
  if (!group) return null;
  const details = groupDetails(group);
  const statusLabel = group.status === 'partial' ? 'Sebagian Lunas' : MERGE_STATUS_LABELS[group.status];
  const toggle = async (separate) => {
    setBusy(true);
    await onToggle?.(group, separate);
    setBusy(false);
  };

  return (
    <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5"><Link2 size={13} /> Booth Gabungan (Auto-Merge)</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-indigo-700">{statusLabel}</span>
      </div>
      <div className="text-xs font-extrabold text-slate-900 break-words">{group.codes.join('+')}</div>
      <div className="text-[11px] text-slate-600">{details.length} booth • total {formatArea(group.totalAreaM2)}</div>
      <div className="space-y-0.5">
        {details.map(d => (
          <div key={d.code} className="flex items-center justify-between text-[11px] text-slate-700">
            <span className="font-semibold">{d.code}</span>
            <span>{d.widthM}×{d.heightM} m • {d.status === 'sold' ? 'Sold' : 'Reserved'}</span>
          </div>
        ))}
      </div>
      {!autoMergeEnabled ? (
        <p className="text-[10px] text-amber-700">Auto-merge sedang dinonaktifkan untuk project ini (menu Grid &amp; Skala), semua booth tampil terpisah.</p>
      ) : group.separate ? (
        <button type="button" disabled={busy} onClick={() => toggle(false)}
          className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Link2 size={12} /> Gabungkan Kembali
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => toggle(true)}
          className="w-full py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-indigo-300 text-indigo-700 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Unlink size={12} /> Tampilkan Terpisah
        </button>
      )}
      <p className="text-[10px] text-slate-500">Posisi, harga per booth, dan invoice tidak berubah; hanya tampilan di denah.</p>
    </div>
  );
}
