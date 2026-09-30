import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Copy, Trash2, RotateCw, Globe, EyeOff, Link2, Info } from 'lucide-react';
import ElementIcon from './ElementIcon';
import CaptionSection from './CaptionSection';
import ShapeStyleSection from './ShapeStyleSection';
import { captionText } from '../../utils/elementCaptions';
import { ELEMENTS, LIBRARY_TABS, accentOf } from '../../utils/elementLibrary';

const ROTATIONS = [0, 90, 180, 270];
const TAB_NAMES = { ...Object.fromEntries(LIBRARY_TABS.map(t => [t.id, t.label])), amenities: '🪑 Amenities', shapes: '🔷 Shapes' };
const inputClass = 'w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500';
const optionClass = (active) => `py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
  active ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
}`;

// Text / number field that applies on blur or Enter (each change redraws the element)
function BufferedInput({ value, onApply, type = 'text', multiline = false, ...rest }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const apply = () => { if (String(draft) !== String(value ?? '')) onApply(draft); };
  const common = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: apply,
    className: inputClass,
    ...rest
  };
  return multiline
    ? <textarea rows={2} {...common} />
    : <input type={type} {...common} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); e.currentTarget.blur(); } }} />;
}

// Right-panel inspector for the new library elements
export default function ElementInspector({ element, canvasObjects = [], captionsEnabled = true, extraTop = null, hidePublicToggle = false, onUpdateProperty, onApplyShapeStyle, onBringForward, onSendBackward, onDeleteSelected, onDuplicateSelected }) {
  const data = element.venueData || {};
  const def = ELEMENTS[data.type];
  const accent = accentOf(data.type);
  const angle = ((Math.round(element.angle || 0) % 360) + 360) % 360;
  const isText = def.kind === 'text';
  const isQueue = def.kind === 'queue';
  const isMeasure = def.kind === 'measure';
  const isShape = def.kind === 'shape'; // Text Box & Bentuk: own text, free size, "Warna" section

  const num = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const setProp = (key, value) => onUpdateProperty({ props: { [key]: value } });

  const linkedName = (id) => {
    const o = canvasObjects.find(x => x.venueData?.id === id);
    return o ? captionText(o) : null;
  };

  const renderProp = (p) => {
    if (p.geometry) {
      const current = data[p.key];
      return (
        <BufferedInput type="text" inputMode="decimal" value={current}
          onApply={(v) => { const n = num(v); if (n !== null && n >= (p.min || 0.2)) onUpdateProperty({ [p.key]: n }); }} />
      );
    }
    const value = data.props?.[p.key] ?? p.default;
    switch (p.type) {
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input type="color" value={value || accent} onChange={(e) => setProp(p.key, e.target.value)} className="w-9 h-8 rounded border border-slate-200 cursor-pointer" />
            <span className="text-[11px] font-mono text-slate-500">{value || accent}</span>
          </div>
        );
      case 'select':
        return (
          <select value={value} onChange={(e) => setProp(p.key, e.target.value)} className={inputClass}>
            {p.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        );
      case 'multi': {
        const list = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {p.options.map(([v, label]) => {
              const on = list.includes(v);
              return (
                <button key={v} type="button" onClick={() => setProp(p.key, on ? list.filter(x => x !== v) : [...list, v])} className={`px-2.5 ${optionClass(on)}`}>
                  {label}
                </button>
              );
            })}
          </div>
        );
      }
      case 'toggle':
        return (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => !value && setProp(p.key, true)} className={optionClass(Boolean(value))}>Ya</button>
            <button type="button" onClick={() => value && setProp(p.key, false)} className={optionClass(!value)}>Tidak</button>
          </div>
        );
      case 'number':
      default:
        return (
          <BufferedInput type="text" inputMode="decimal" value={value}
            onApply={(v) => { const n = num(v); if (n !== null) setProp(p.key, Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, n))); }} />
        );
    }
  };

  const connections = data.connections || {};

  return (
    <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border bg-white" style={{ color: accent, borderColor: accent }}>
            {TAB_NAMES[def.tab] || 'Elemen Denah'}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onDuplicateSelected} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors" title="Duplikasi"><Copy size={14} /></button>
            <button type="button" onClick={onDeleteSelected} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Hapus"><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2.5 mt-2">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center" style={{ color: accent }}>
            <ElementIcon type={data.type} size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-800 text-base truncate">{isText ? (data.label || def.name) : isShape ? def.name : captionText(element)}</h2>
            <p className="text-[11px] text-slate-500">{def.name}{!isText && !isQueue ? ` • ${data.widthM} × ${data.heightM} m` : ''}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {extraTop}
        {/* Free text content / caption (short name shown next to the icon) */}
        {isText || isShape ? (
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-medium">Isi Teks</label>
            <BufferedInput value={element.text ?? data.label} multiline placeholder={isShape ? 'Teks di dalam bentuk (opsional)' : 'Tulis teks...'}
              onApply={(v) => onUpdateProperty({ label: v })} />
            {isShape && <p className="text-[11px] text-slate-400 mt-1">Atau klik dua kali elemen di kanvas untuk mengetik langsung.</p>}
          </div>
        ) : (
          <CaptionSection element={element} onUpdateProperty={onUpdateProperty} captionsEnabled={captionsEnabled} />
        )}

        {/* Size in metres */}
        {!isText && !isQueue && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-medium">{isMeasure ? 'Panjang (m)' : 'Lebar (m)'}</label>
              <BufferedInput type="text" inputMode="decimal" value={data.widthM}
                onApply={(v) => { const n = num(v); if (n !== null && n >= 0.2) onUpdateProperty({ widthM: n }); }} />
            </div>
            {!isMeasure && (
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-medium">{def.kind === 'aisle' ? 'Lebar Lorong (m)' : 'Panjang (m)'}</label>
                <BufferedInput type="text" inputMode="decimal" value={data.heightM}
                  onApply={(v) => { const n = num(v); if (n !== null && n >= 0.2) onUpdateProperty({ heightM: n }); }} />
              </div>
            )}
          </div>
        )}
        {isMeasure && <p className="text-[11px] text-slate-500 flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Jarak di kanvas diperbarui otomatis saat garis ditarik atau diubah panjangnya.</p>}
        {isQueue && (
          <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 space-y-1">
            <div className="flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Seret titik pada jalur untuk mengatur belokan. Ujung jalur menempel ke Ticket Box, Checker In, atau Entrance Gate yang berjarak ±1 m.</div>
            {(connections.start || connections.end) && (
              <div className="flex items-center gap-1 font-semibold"><Link2 size={12} /> Terhubung: {[connections.start, connections.end].filter(Boolean).map(linkedName).filter(Boolean).join(' → ') || '—'}</div>
            )}
          </div>
        )}

        {/* Type-specific properties */}
        {(def.props || []).filter(p => !(p.geometry && (p.key === 'heightM' || p.key === 'widthM'))).map(p => (
          <div key={p.key}>
            <label className="block text-xs text-slate-500 mb-1 font-medium">{p.label}</label>
            {renderProp(p)}
          </div>
        ))}

        {/* Text Box & Bentuk: fill, border & text colours */}
        {isShape && onApplyShapeStyle && <ShapeStyleSection elements={[element]} onApply={onApplyShapeStyle} />}
        {isShape && (
          <p className="text-[11px] text-slate-500 flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" /> Tarik handle sisi untuk lebar / tinggi saja, handle sudut untuk keduanya. Tahan Shift untuk menjaga proporsi, Alt (Option) untuk menarik dari tengah.</p>
        )}

        {/* Rotation */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium flex items-center gap-1">
            <RotateCw size={12} /> Rotasi {def.kind === 'cctv' && <span className="text-slate-400 font-normal">(arah kamera)</span>}
          </label>
          <div className="grid grid-cols-4 gap-1.5 mb-1.5">
            {ROTATIONS.map(deg => (
              <button key={deg} type="button" onClick={() => onUpdateProperty({ angle: deg })} className={optionClass(angle === deg)}>{deg}°</button>
            ))}
          </div>
          <BufferedInput type="text" inputMode="numeric" value={angle}
            onApply={(v) => { const n = num(v); if (n !== null) onUpdateProperty({ angle: ((n % 360) + 360) % 360 }); }} />
        </div>

        {/* Public visibility on Live Floorplan */}
        {!hidePublicToggle && (
        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              {data.publicVisible !== false ? <Globe size={13} className="text-emerald-600" /> : <EyeOff size={13} className="text-slate-500" />}
              Tampil di Live Floorplan
            </div>
            <div className="text-[11px] text-slate-500">{data.publicVisible !== false ? 'Terlihat oleh pengunjung' : 'Internal: hanya terlihat di Studio'}</div>
          </div>
          <button type="button" onClick={() => onUpdateProperty({ publicVisible: data.publicVisible === false })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${data.publicVisible !== false ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-500 hover:bg-slate-600'}`}>
            {data.publicVisible !== false ? 'Tampil' : 'Sembunyi'}
          </button>
        </div>
        )}

        {/* Layer order */}
        <div className="pt-1 flex gap-2">
          <button type="button" onClick={onBringForward} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer">
            <ArrowUp size={13} /> Bawa ke Depan
          </button>
          <button type="button" onClick={onSendBackward} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer">
            <ArrowDown size={13} /> Kirim ke Belakang
          </button>
        </div>

        <button type="button" onClick={onDeleteSelected}
          className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
          <Trash2 size={13} /> Hapus Elemen
        </button>
      </div>
    </aside>
  );
}
