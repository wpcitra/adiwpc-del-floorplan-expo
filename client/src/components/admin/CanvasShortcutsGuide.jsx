import React from 'react';
import { Info } from 'lucide-react';

// "Panduan & Pintasan Kanvas": the same list in Denah Sales (booths editable) and Denah Operasional (booths locked)
export default function CanvasShortcutsGuide({ mode = 'sales' }) {
  const isOps = mode === 'ops';
  const items = [
    [<b key="k">Tahan Spasi + Drag:</b>, ' Geser tampilan (Pan)'],
    [<b key="k">Scroll Mouse:</b>, ' Zoom In & Out'],
    [<b key="k">Drag Seleksi Kotak:</b>, isOps ? ' Pilih banyak elemen' : ' Pilih banyak booth'],
    [<b key="k">Backspace / Del:</b>, ' Hapus objek'],
    [<b key="k">Snap to Grid:</b>, ' Sejajar tiap 1m (20px)'],
    isOps
      ? [<b key="k">Snap ke Booth:</b>, ' Elemen menempel ke sisi / sudut / tengah booth; booth tetap terkunci']
      : [<b key="k">Snap ke Booth:</b>, ' Booth menempel rapat ke sisi / sudut booth lain; elemen memakai booth sebagai patokan'],
    [<b key="k">Snap ke Elemen:</b>, ' Elemen menempel & sejajar dengan elemen lain (dinding, pilar, zona, utilitas, shapes...); ujung garis menempel ke ujung garis / sudut'],
    [<b key="k">Garis panduan:</b>, <span key="v"> <span className="font-bold text-pink-600">pink</span> = menempel, <span className="font-bold text-indigo-600">ungu putus-putus</span> = sejajar, <span className="font-bold text-emerald-600">hijau</span> = tengah ke tengah, <span className="font-bold text-orange-600">oranye</span> = jarak sama rata</span>],
    [<b key="k">Tahan Alt / Option saat menggeser:</b>, ' Nonaktifkan semua snap sementara'],
    [<b key="k">Panah:</b>, <span key="v"> Geser 0,1 m • <b>Shift + Panah:</b> 1 m, berhenti tepat saat menempel {isOps ? 'elemen atau booth' : 'booth lain / elemen'}</span>],
    [<b key="k">Ctrl / Cmd + Drag:</b>, ' Salin objek']
  ];
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/80 space-y-2 text-xs">
      <span className="font-semibold text-slate-700 flex items-center gap-1.5 text-xs">
        <Info size={14} className="text-blue-500 shrink-0" /> Panduan & Pintasan Kanvas
      </span>
      <ul className="space-y-1.5 text-slate-600 text-[11px] leading-relaxed">
        {items.map((parts, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>{parts}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
