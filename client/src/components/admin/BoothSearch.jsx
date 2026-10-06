import { useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { STATUS_CONFIG } from '../../utils/floorplanUtils';
import { searchBooths } from '../../utils/boothSearch';

// "Cari tenant / booth" over the canvas (AGENTS.md §36). `getBooths()` returns the booth objects of the canvas at
// the moment of the search; `onPick(obj)` centres and opens the chosen booth.
export default function BoothSearch({ getBooths, onPick }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const results = open && query.trim() ? searchBooths(getBooths(), query) : [];

  const pick = (obj) => {
    if (!obj) return;
    setOpen(false);
    inputRef.current?.blur();
    onPick(obj);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') { setQuery(''); setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className="absolute top-8 left-9 z-30 w-[min(280px,calc(100%-3rem))]" onMouseDown={(e) => e.stopPropagation()}>
      <div className="relative">
        <Search size={14} className="absolute z-10 left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Cari tenant atau nomor booth"
          aria-label="Cari tenant atau nomor booth"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="booth-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full pl-8 pr-8 py-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-500 shadow-[0_2px_8px_rgba(15,23,42,0.08)] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Hapus pencarian"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <ul id="booth-search-results" role="listbox" className="mt-1.5 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1">
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-slate-500">Tidak ada tenant atau booth yang cocok.</li>
          ) : results.map((obj, i) => {
            const data = obj.boothData;
            const status = String(data.status || 'available').toLowerCase();
            const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
            return (
              <li
                key={data.id || data.code}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(obj); }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${i === active ? 'bg-indigo-50' : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.border }} title={cfg.label} />
                <span className="font-mono text-[11px] font-bold text-slate-900 tabular-nums shrink-0">#{data.code}</span>
                <span className={`text-xs truncate min-w-0 ${data.ownerName ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                  {data.ownerName || 'Belum ada tenant'}
                </span>
                <span className="ml-auto text-[10px] font-semibold shrink-0" style={{ color: cfg.text }}>{cfg.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
