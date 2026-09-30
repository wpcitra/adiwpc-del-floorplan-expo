import React, { useState } from 'react';
import { Palette, Copy, ClipboardPaste, Star } from 'lucide-react';
import ShapeColorPicker from './ShapeColorPicker';
import { ELEMENTS, SHAPE_STYLE_KEYS, shapeStyleOf, saveShapeDefault } from '../../utils/elementLibrary';

// "Warna" section of Text Box & Bentuk: fill, border (width + line style) and text colour, for one element or
// every Text Box / Bentuk of a multi-selection at once. Changes are applied live through onApply(style).
// Salin / Tempel Gaya share the colours between elements; "Jadikan Default" is used by the next new element
// of the same type (saved in this browser).

const CLIPBOARD_KEY = 'floorplan_shape_style_clipboard';
const LINE_STYLES = [
  ['solid', 'Penuh', null],
  ['dashed', 'Putus-putus', '6 4'],
  ['dotted', 'Titik-titik', '0.1 4']
];

const readClipboard = () => {
  try { return JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || 'null'); } catch (e) { return null; }
};

export default function ShapeStyleSection({ elements = [], onApply }) {
  const [clipboard, setClipboard] = useState(readClipboard);
  const [notice, setNotice] = useState('');
  if (!elements.length) return null;

  const styles = elements.map(o => shapeStyleOf(o.venueData));
  const s = styles[0];
  const mixed = (keys) => styles.some(x => keys.some(k => String(x[k]) !== String(s[k])));
  const single = elements.length === 1 ? elements[0] : null;
  const partialText = Boolean(single?.isEditing && single.selectionEnd > single.selectionStart);
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice(''), 2500); };

  const copyStyle = () => {
    const style = Object.fromEntries(SHAPE_STYLE_KEYS.map(k => [k, s[k]]));
    try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(style)); } catch (e) {}
    setClipboard(style);
    flash('Gaya disalin. Pilih elemen lain lalu klik "Tempel Gaya".');
  };
  const pasteStyle = () => {
    if (!clipboard) return;
    onApply(clipboard);
    flash(`Gaya ditempel ke ${elements.length} elemen.`);
  };
  const makeDefault = () => {
    const types = [...new Set(elements.map(o => o.venueData.type))];
    types.forEach(type => saveShapeDefault(type, shapeStyleOf(elements.find(o => o.venueData.type === type).venueData)));
    flash(`Elemen ${types.map(t => ELEMENTS[t]?.name).join(', ')} berikutnya memakai gaya ini.`);
  };

  const sw = Number(s.strokeWidth) || 0;
  const btn = 'flex-1 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5"><Palette size={13} /> Warna</label>
        {elements.length > 1 && <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">{elements.length} elemen</span>}
      </div>

      <ShapeColorPicker
        label="Warna Isi (Box)"
        value={{ color: s.fillColor, opacity: s.fillOpacity, none: s.fillNone }}
        mixed={mixed(['fillColor', 'fillOpacity', 'fillNone'])}
        showOpacity
        allowNone
        noneLabel="Tanpa Isi"
        onChange={(v) => onApply({
          ...(v.color !== undefined ? { fillColor: v.color } : {}),
          ...(v.opacity !== undefined ? { fillOpacity: v.opacity } : {}),
          ...(v.none !== undefined ? { fillNone: v.none } : {})
        })}
      />

      <div>
        <ShapeColorPicker
          label="Warna Border"
          value={{ color: s.strokeColor, opacity: s.strokeOpacity, none: s.strokeNone }}
          mixed={mixed(['strokeColor', 'strokeOpacity', 'strokeNone'])}
          showOpacity
          allowNone
          noneLabel="Tanpa Border"
          onChange={(v) => onApply({
            ...(v.color !== undefined ? { strokeColor: v.color } : {}),
            ...(v.opacity !== undefined ? { strokeOpacity: v.opacity } : {}),
            ...(v.none !== undefined ? { strokeNone: v.none } : {})
          })}
        />
        <div className={`mt-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 ${s.strokeNone ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 w-20 shrink-0">Ketebalan</span>
            <input
              type="range" min={0.5} max={10} step={0.5} value={Math.min(10, Math.max(0.5, sw))}
              onChange={(e) => onApply({ strokeWidth: Number(e.target.value) })}
              className="flex-1 accent-violet-600 cursor-pointer"
              aria-label="Ketebalan border"
            />
            <span className="text-[10px] font-mono text-slate-600 w-10 text-right">{sw.toString().replace('.', ',')} px</span>
          </div>
          <svg width="100%" height="14" className="block" aria-hidden="true">
            <line x1="4" y1="7" x2="96%" y2="7" stroke={s.strokeColor} strokeOpacity={(s.strokeOpacity ?? 100) / 100} strokeWidth={Math.min(10, sw)}
              strokeDasharray={s.strokeStyle === 'dashed' ? `${sw * 4} ${sw * 2.5}` : s.strokeStyle === 'dotted' ? `0.1 ${sw * 2.2}` : undefined}
              strokeLinecap={s.strokeStyle === 'dotted' ? 'round' : 'butt'} />
          </svg>
          <div className="grid grid-cols-3 gap-1.5">
            {LINE_STYLES.map(([key, name, dash]) => (
              <button
                key={key}
                type="button"
                onClick={() => onApply({ strokeStyle: key })}
                className={`py-1.5 rounded-lg border flex flex-col items-center gap-0.5 cursor-pointer transition-all ${s.strokeStyle === key ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                title={name}
              >
                <svg width="36" height="6" aria-hidden="true"><line x1="1" y1="3" x2="35" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={dash || undefined} strokeLinecap={key === 'dotted' ? 'round' : 'butt'} /></svg>
                <span className="text-[10px] font-bold">{name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ShapeColorPicker
        label="Warna Tulisan"
        value={{ color: s.textColor }}
        mixed={mixed(['textColor'])}
        onChange={(v) => v.color !== undefined && onApply({ textColor: v.color })}
        hint={partialText
          ? 'Diterapkan hanya ke teks yang sedang dipilih.'
          : 'Untuk seluruh teks. Blok sebagian teks saat mengetik untuk mewarnai sebagian saja.'}
      />

      <div className="flex gap-1.5">
        <button type="button" onClick={copyStyle} disabled={elements.length > 1 && mixed(SHAPE_STYLE_KEYS)} className={btn} title="Salin warna isi, border, dan tulisan">
          <Copy size={12} /> Salin Gaya
        </button>
        <button type="button" onClick={pasteStyle} disabled={!clipboard} className={btn} title="Tempel gaya yang disalin ke elemen terpilih">
          <ClipboardPaste size={12} /> Tempel Gaya
        </button>
        <button type="button" onClick={makeDefault} className={btn} title="Elemen baru dengan jenis yang sama memakai gaya ini">
          <Star size={12} /> Jadikan Default
        </button>
      </div>
      {notice && <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">{notice}</div>}
    </div>
  );
}
