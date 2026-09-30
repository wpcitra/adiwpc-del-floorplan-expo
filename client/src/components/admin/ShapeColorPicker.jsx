import React, { useEffect, useState } from 'react';
import { Ban, ChevronDown, ChevronUp } from 'lucide-react';
import { STATUS_CONFIG } from '../../utils/floorplanUtils';

// Colour picker of the "Warna" section (Text Box & Bentuk): app palette, booth status colours, HEX input,
// the last 8 colours used (this browser), optional transparency and "Tanpa ..." (no colour at all).

const APP_COLORS = [
  ['#4f46e5', 'Indigo'], ['#7c3aed', 'Ungu'], ['#16a34a', 'Hijau'], ['#f97316', 'Oranye'],
  ['#ef4444', 'Merah'], ['#2563eb', 'Biru'], ['#0ea5e9', 'Biru Muda'], ['#f59e0b', 'Kuning'],
  ['#64748b', 'Abu-abu'], ['#cbd5e1', 'Abu Muda'], ['#0f172a', 'Hitam'], ['#ffffff', 'Putih']
];
const STATUS_COLORS = ['available', 'reserved', 'sold'].map(k => [STATUS_CONFIG[k].border, `Status ${STATUS_CONFIG[k].label}`]);

const RECENT_KEY = 'floorplan_recent_colors';
const RECENT_EVENT = 'floorplan-recent-colors';
const MAX_RECENT = 8;

const readRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_RECENT); } catch (e) { return []; }
};
export function rememberColor(color) {
  const c = normalizeHex(color);
  if (!c) return;
  const next = [c, ...readRecent().filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch (e) {}
  window.dispatchEvent(new Event(RECENT_EVENT));
}
function useRecentColors() {
  const [recent, setRecent] = useState(readRecent);
  useEffect(() => {
    const update = () => setRecent(readRecent());
    window.addEventListener(RECENT_EVENT, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(RECENT_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return recent;
}

// "#abc" / "abc" / "#aabbcc" -> "#aabbcc" (null when not a colour)
export function normalizeHex(value) {
  let h = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

const CHECKER = 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 8px 8px';

function Swatch({ color, title, active, onClick }) {
  return (
    <button
      type="button"
      title={`${title} (${color})`}
      onClick={onClick}
      className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 cursor-pointer ${active ? 'ring-2 ring-offset-1 ring-violet-500 border-violet-500' : 'border-slate-300'}`}
      style={{ background: color }}
    />
  );
}

/**
 * value: { color, opacity (0-100), none }  (opacity / none only when enabled)
 * onChange(partial) is called for every change (live preview on the canvas)
 */
export default function ShapeColorPicker({ label, value, mixed = false, allowNone = false, noneLabel = 'Tanpa Warna', showOpacity = false, onChange, hint = null }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value.color || '');
  const recent = useRecentColors();
  useEffect(() => { setHex(value.color || ''); }, [value.color]);

  const pick = (color) => {
    const c = normalizeHex(color);
    if (!c) return;
    onChange({ color: c, ...(allowNone ? { none: false } : {}) });
    rememberColor(c);
  };
  const applyHex = () => {
    const c = normalizeHex(hex);
    if (c) pick(c);
    else setHex(value.color || '');
  };
  const isNone = allowNone && value.none;
  const current = (value.color || '').toLowerCase();
  const alpha = showOpacity ? Math.round((Number(value.opacity ?? 100) / 100) * 255).toString(16).padStart(2, '0') : 'ff';

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="relative w-8 h-8 rounded-lg border border-slate-300 overflow-hidden shrink-0 cursor-pointer"
          style={{ background: CHECKER }}
          title="Pilih warna"
        >
          {isNone
            ? <span className="absolute inset-0 flex items-center justify-center bg-white text-rose-500"><Ban size={16} /></span>
            : <span className="absolute inset-0" style={{ background: `${value.color || '#000000'}${alpha}` }} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-slate-700">{label}</div>
          <div className="text-[10px] text-slate-500 truncate">
            {mixed ? 'Beberapa warna berbeda' : isNone ? noneLabel : `${(value.color || '').toUpperCase()}${showOpacity ? ` · ${Math.round(value.opacity ?? 100)}%` : ''}`}
          </div>
        </div>
        <button type="button" onClick={() => setOpen(o => !o)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label={open ? 'Tutup pilihan warna' : 'Buka pilihan warna'}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 border-t border-slate-100">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 mb-1">Warna Aplikasi</div>
            <div className="flex flex-wrap gap-1.5">
              {APP_COLORS.map(([c, name]) => <Swatch key={c} color={c} title={name} active={!isNone && current === c} onClick={() => pick(c)} />)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 mb-1">Warna Status Booth</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_COLORS.map(([c, name]) => <Swatch key={name} color={c} title={name} active={!isNone && current === c.toLowerCase()} onClick={() => pick(c)} />)}
            </div>
          </div>
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 mb-1">Warna Terakhir Dipakai</div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map(c => <Swatch key={c} color={c} title="Terakhir dipakai" active={!isNone && current === c} onClick={() => pick(c)} />)}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(value.color) || '#000000'}
              onChange={(e) => onChange({ color: e.target.value, ...(allowNone ? { none: false } : {}) })}
              onBlur={(e) => rememberColor(e.target.value)}
              className="w-8 h-8 rounded border border-slate-200 cursor-pointer shrink-0"
              title="Warna lain"
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={applyHex}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } }}
              placeholder="#4F46E5"
              maxLength={7}
              spellCheck={false}
              className="flex-1 min-w-0 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
              aria-label={`Kode HEX ${label}`}
            />
          </div>
        </div>
      )}

      {(showOpacity || allowNone) && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {showOpacity && (
            <div className={`flex items-center gap-2 ${isNone ? 'opacity-40 pointer-events-none' : ''}`}>
              <span className="text-[10px] font-semibold text-slate-500 w-20 shrink-0">Transparansi</span>
              <input
                type="range" min={0} max={100} step={5}
                value={Math.round(100 - Number(value.opacity ?? 100))}
                onChange={(e) => onChange({ opacity: 100 - Number(e.target.value) })}
                className="flex-1 accent-violet-600 cursor-pointer"
                aria-label={`Transparansi ${label}`}
              />
              <span className="text-[10px] font-mono text-slate-600 w-9 text-right">{Math.round(100 - Number(value.opacity ?? 100))}%</span>
            </div>
          )}
          {allowNone && (
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={Boolean(value.none)} onChange={(e) => onChange({ none: e.target.checked })} className="accent-violet-600" />
              {noneLabel}
            </label>
          )}
        </div>
      )}
      {hint && <div className="px-2.5 pb-2 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}
