import React, { useEffect, useState } from 'react';
import { BOOTH_CORNER_MAX_PCT, clampCornerPct } from '../../utils/floorplanUtils';

const PRESETS = [
  { value: 0, label: '0% (Siku)' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' }
];

/**
 * "Sudut Booth": corner rounding in % of the booth's shortest side (0% = siku, max 50%), previewed live.
 *   value       number, or null when the booth follows the floorplan setting (allowFollow)
 *   globalPct   the floorplan setting (shown in "Ikuti Pengaturan Denah")
 *   theme       'dark' (canvas toolbar) | 'light' (property panel)
 */
export default function BoothCornerControl({ value, globalPct = 0, allowFollow = false, onChange, theme = 'light', mixed = false }) {
  const follows = allowFollow && (value === null || value === undefined);
  const current = follows ? globalPct : clampCornerPct(value ?? 0);
  const [draft, setDraft] = useState(String(current));
  useEffect(() => { setDraft(String(current)); }, [current]);

  const dark = theme === 'dark';
  const chip = (active) => `px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
    active
      ? (dark ? 'bg-blue-600 border-blue-500 text-white' : 'bg-blue-600 border-blue-600 text-white')
      : (dark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')
  }`;
  const applyDraft = () => {
    const n = parseFloat(String(draft).replace(',', '.'));
    if (Number.isFinite(n)) onChange?.(clampCornerPct(n));
    else setDraft(String(current));
  };

  return (
    <div className="space-y-2">
      {allowFollow && (
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => !follows && onChange?.(null)} className={chip(follows)}>Ikuti Pengaturan Denah ({globalPct}%)</button>
          <button type="button" onClick={() => follows && onChange?.(globalPct)} className={chip(!follows && !mixed)}>Nilai Khusus</button>
        </div>
      )}
      <div className={`flex flex-wrap gap-1.5 ${follows ? 'opacity-50 pointer-events-none' : ''}`}>
        {PRESETS.map(p => (
          <button key={p.value} type="button" onClick={() => onChange?.(p.value)} className={chip(!mixed && current === p.value)}>{p.label}</button>
        ))}
      </div>
      <div className={`flex items-center gap-2 ${follows ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          type="range" min={0} max={BOOTH_CORNER_MAX_PCT} step={1} value={current}
          onChange={(e) => onChange?.(clampCornerPct(e.target.value))}
          className="flex-1 accent-blue-600 cursor-pointer" aria-label="Kelengkungan sudut booth (%)"
        />
        <div className="flex items-center gap-0.5">
          <input
            type="text" inputMode="decimal" value={mixed ? '' : draft} placeholder={mixed ? 'campur' : ''}
            onChange={(e) => setDraft(e.target.value)} onBlur={applyDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyDraft(); e.currentTarget.blur(); } }}
            className={`w-12 px-1.5 py-1 rounded-md text-xs text-right border focus:outline-none focus:ring-1 focus:ring-blue-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
          />
          <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>%</span>
        </div>
      </div>
      <p className={`text-[10px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
        Dihitung dari sisi terpendek booth (maks. 50%). Hanya tampilan: ukuran, luas, posisi &amp; harga tidak berubah.
      </p>
    </div>
  );
}
