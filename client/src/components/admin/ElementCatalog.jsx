import React from 'react';
import { Plus } from 'lucide-react';
import ElementIcon from './ElementIcon';
import { ELEMENTS, EXISTING_SHORTCUTS, TICKET_GROUPS, accentOf, elementsInTab } from '../../utils/elementLibrary';

const dragPayload = (e, payload) => {
  e.dataTransfer.effectAllowed = 'copy';
  const json = JSON.stringify(payload);
  e.dataTransfer.setData('text/plain', json);
  e.dataTransfer.setData('application/json', json);
};

const sizeBadge = (el) => el.kind === 'text' ? 'Teks bebas' : el.kind === 'queue' ? 'Titik belok' : `${el.w}×${el.h}m`;

// Catalog card for a library element (click = add to the canvas centre, drag = drop anywhere)
export function ElementCard({ id, onAdd }) {
  const el = ELEMENTS[id];
  const accent = accentOf(id);
  return (
    <div
      draggable
      style={{ WebkitUserDrag: 'element' }}
      onDragStart={(e) => dragPayload(e, { itemType: 'library', elementType: id })}
      onClick={() => onAdd(id)}
      className="p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group shadow-xs bg-slate-50 hover:bg-slate-100 border-slate-200"
      title={`${el.name} - Drag atau klik untuk menambah ke kanvas`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-xs bg-white border border-slate-200" style={{ color: accent }}>
          <ElementIcon type={id} size={18} />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{el.name}</h4>
          <p className="text-[10px] text-slate-500 truncate">{el.desc}</p>
          <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded font-medium">{sizeBadge(el)}</span>
          {!el.publicDefault && <span className="inline-block mt-0.5 ml-1 text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-medium">Internal</span>}
        </div>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onAdd(id); }}
        className="p-1 rounded-md bg-white border border-slate-200 text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors shrink-0 cursor-pointer">
        <Plus size={13} />
      </button>
    </div>
  );
}

// Shortcut to an element that already exists in another tab (same template, not a copy)
function ShortcutCard({ item, onAddVenueItem }) {
  return (
    <div
      draggable
      style={{ WebkitUserDrag: 'element' }}
      onDragStart={(e) => dragPayload(e, { itemType: 'venue', venueType: item.venueType })}
      onClick={() => onAddVenueItem(item.venueType)}
      className="p-2.5 rounded-xl border border-dashed cursor-pointer transition-all flex items-center justify-between group bg-white hover:bg-slate-50 border-slate-300"
      title={`${item.name} — elemen yang sudah ada (${item.note})`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base bg-slate-50 border border-slate-200">{item.icon}</div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-slate-800 truncate">{item.name}</h4>
          <p className="text-[10px] text-slate-500 truncate">Sudah ada: {item.note}</p>
        </div>
      </div>
      <Plus size={13} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
    </div>
  );
}

const Heading = ({ children }) => (
  <div className="px-1 pt-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">{children}</div>
);

// Content of one of the new tabs (Tiket & Akses is grouped with sub-headings)
export default function ElementCatalog({ tabId, title, onAdd, onAddVenueItem }) {
  const items = elementsInTab(tabId);
  const shortcuts = EXISTING_SHORTCUTS[tabId] || [];

  if (tabId === 'lib_tiket') {
    return (
      <div className="space-y-2">
        {TICKET_GROUPS.map(group => (
          <div key={group} className="space-y-2">
            <Heading>{group}</Heading>
            {items.filter(i => i.group === group).map(i => <ElementCard key={i.id} id={i.id} onAdd={onAdd} />)}
            {shortcuts.filter(s => s.group === group).map(s => <ShortcutCard key={s.venueType} item={s} onAddVenueItem={onAddVenueItem} />)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Heading>{title}</Heading>
      {items.map(i => <ElementCard key={i.id} id={i.id} onAdd={onAdd} />)}
      {shortcuts.map(s => <ShortcutCard key={s.venueType} item={s} onAddVenueItem={onAddVenueItem} />)}
    </div>
  );
}
