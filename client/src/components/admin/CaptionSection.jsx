import React, { useEffect, useState } from 'react';
import { MessageSquareText, RotateCcw } from 'lucide-react';
import { customCaption, defaultCaption } from '../../utils/elementCaptions';

// Right-panel "Caption" block shared by every element inspector (library elements, doors, venue items)
export default function CaptionSection({ element, onUpdateProperty, captionsEnabled = true }) {
  const data = element?.venueData || {};
  const defaultText = defaultCaption(data);
  const custom = customCaption(data);
  const shown = data.showCaption !== false;
  const [draft, setDraft] = useState(custom || defaultText);

  useEffect(() => { setDraft(custom || defaultText); }, [data.id, custom, defaultText]);

  const apply = () => {
    const text = draft.trim();
    // Typing the default name (or clearing the field) means "use the default"
    const next = !text || text === defaultText ? '' : text;
    if (next !== custom) onUpdateProperty({ caption: next });
    else setDraft(custom || defaultText);
  };

  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <MessageSquareText size={13} className="text-indigo-600" /> Caption
        </span>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={shown} onChange={() => onUpdateProperty({ showCaption: !shown })} className="accent-indigo-600" />
          Tampilkan Caption
        </label>
      </div>
      <input
        type="text"
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        placeholder={defaultText}
        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500 truncate">
          {custom ? <>Default: <b>{defaultText}</b></> : 'Memakai nama default'}
        </span>
        <button
          type="button"
          disabled={!custom}
          onClick={() => { setDraft(defaultText); onUpdateProperty({ caption: '' }); }}
          className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <RotateCcw size={11} /> Kembalikan ke Nama Default
        </button>
      </div>
      {!captionsEnabled && (
        <p className="text-[10px] text-amber-700">Semua caption sedang disembunyikan lewat tombol “Caption” di toolbar bawah.</p>
      )}
    </div>
  );
}
