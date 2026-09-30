import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Copy, Trash2, RotateCw, FlipHorizontal2 } from 'lucide-react';
import DoorSymbol from './DoorSymbol';
import CaptionSection from './CaptionSection';
import { captionText } from '../../utils/elementCaptions';
import { DOOR_TYPES, DOOR_WIDTH_PRESETS, clampDoorWidth } from '../../utils/doorSymbols';

const CAPTION_SUGGESTIONS = ['Pintu Masuk Utama', 'Pintu Keluar', 'Pintu Darurat', 'Pintu Loading'];
const ROTATIONS = [0, 90, 180, 270];

const optionClass = (active) => `py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
  active ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
}`;

// Right-panel inspector for a selected door symbol
export default function DoorInspector({ door, captionsEnabled = true, onUpdateProperty, onBringForward, onSendBackward, onDeleteSelected, onDuplicateSelected, propertyTick = 0 }) {
  const data = door.venueData || {};
  const typeInfo = DOOR_TYPES[data.doorType] || DOOR_TYPES.single;
  const angle = ((Math.round(door.angle || 0) % 360) + 360) % 360;

  // Buffered text fields: applied on blur / Enter so typing does not redraw the door on every key
  const [widthInput, setWidthInput] = useState(String(data.widthM ?? 0.9));
  useEffect(() => {
    setWidthInput(String(data.widthM ?? 0.9));
  }, [data.id, data.widthM, propertyTick]);

  const applyWidth = (value) => {
    const widthM = clampDoorWidth(value);
    if (widthM === null) {
      setWidthInput(String(data.widthM));
      return;
    }
    setWidthInput(String(widthM));
    if (widthM !== data.widthM) onUpdateProperty({ widthM });
  };

  const onEnter = (apply) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply(e.currentTarget.value);
      e.currentTarget.blur();
    }
  };

  return (
    <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            🚪 Simbol Pintu
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onDuplicateSelected} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors" title="Duplikasi Pintu">
              <Copy size={14} />
            </button>
            <button type="button" onClick={onDeleteSelected} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Hapus Pintu">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <h2 className="font-semibold text-slate-800 text-base mt-2">{captionText(door)}</h2>
        <p className="text-[11px] text-slate-500">{typeInfo.name} • {typeInfo.nameEn} • {data.widthM} m</p>
        <div className="mt-3 h-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-900 p-2">
          <DoorSymbol doorType={data.doorType} mirrored={data.mirrored} swing={data.swing} className="w-full h-full" />
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Door type (swap without deleting) */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">Jenis Pintu</label>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.values(DOOR_TYPES).map(t => {
              const active = t.id === data.doorType;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !active && onUpdateProperty({ doorType: t.id })}
                  className={`p-1.5 rounded-lg border flex flex-col items-center transition-all cursor-pointer ${
                    active ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-400' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  title={`${t.name} (${t.nameEn})`}
                >
                  <DoorSymbol doorType={t.id} className="w-full h-7" />
                  <span className="text-[9px] font-bold mt-0.5 leading-tight">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Width */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">Lebar Bukaan</label>
          <div className="grid grid-cols-5 gap-1 mb-1.5">
            {DOOR_WIDTH_PRESETS.map(w => (
              <button key={w} type="button" onClick={() => applyWidth(w)} className={optionClass(Math.abs((data.widthM || 0) - w) < 0.001)}>
                {w.toLocaleString('id-ID')}m
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={(e) => applyWidth(e.target.value)}
              onKeyDown={onEnter(applyWidth)}
              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">meter</span>
          </div>
        </div>

        {/* Rotation */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium flex items-center gap-1">
            <RotateCw size={12} /> Rotasi <span className="text-slate-400 font-normal">({angle}°)</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {ROTATIONS.map(deg => (
              <button key={deg} type="button" onClick={() => onUpdateProperty({ angle: deg })} className={optionClass(angle === deg)}>
                {deg}°
              </button>
            ))}
          </div>
        </div>

        {/* Hinge side (mirror) */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium flex items-center gap-1">
            <FlipHorizontal2 size={12} /> Cerminkan (Sisi Engsel)
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => data.mirrored && onUpdateProperty({ mirrored: false })} className={optionClass(!data.mirrored)}>
              Engsel Kiri
            </button>
            <button type="button" onClick={() => !data.mirrored && onUpdateProperty({ mirrored: true })} className={optionClass(Boolean(data.mirrored))}>
              Engsel Kanan
            </button>
          </div>
        </div>

        {/* Swing direction */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5 font-medium">Arah Bukaan</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => data.swing === 'out' && onUpdateProperty({ swing: 'in' })} className={optionClass(data.swing !== 'out')}>
              Ke Dalam
            </button>
            <button type="button" onClick={() => data.swing !== 'out' && onUpdateProperty({ swing: 'out' })} className={optionClass(data.swing === 'out')}>
              Ke Luar
            </button>
          </div>
        </div>

        {/* Caption (short name next to the door symbol) */}
        <div>
          <CaptionSection element={door} onUpdateProperty={onUpdateProperty} captionsEnabled={captionsEnabled} />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {CAPTION_SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onUpdateProperty({ caption: s })}
                className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-700 cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Layer order */}
        <div className="pt-1 flex gap-2">
          <button type="button" onClick={onBringForward} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer">
            <ArrowUp size={13} /> Bawa ke Depan
          </button>
          <button type="button" onClick={onSendBackward} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer">
            <ArrowDown size={13} /> Kirim ke Belakang
          </button>
        </div>

        <button
          type="button"
          onClick={onDeleteSelected}
          className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 size={13} /> Hapus Pintu
        </button>
      </div>
    </aside>
  );
}
