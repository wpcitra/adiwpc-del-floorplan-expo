import React, { useEffect, useState } from 'react';
import { X, Pencil, Trash2, Plus, Check, Tags, ChevronRight, Save } from 'lucide-react';
import { api } from '../../services/api';

// "Kelola Kategori" of the Fasilitas menu (AGENTS.md §46).
// - Categories: add, rename and delete every name, the 9 built-in ones included. Renaming also renames the category in
//   every saved form and template (server); deleting only removes it from the list, items that use it keep it.
// - Items: each category opens to the items of the form being edited (builder), with edit / delete and "+ Tambah item".
//   Item changes are part of that form: "Simpan formulir" saves them (also from here).
const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

export default function FacilityCategoryManager({
  isOpen, onClose, categories, usage = {}, onChange,
  items = [], formTitle = '', onAddItem, onEditItem, onDeleteItem, itemsDirty = false, onSaveForm
}) {
  const [editing, setEditing] = useState(null); // category being renamed
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null); // item index waiting for "Hapus?"
  const [expanded, setExpanded] = useState(() => new Set());
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // fresh state each time the window opens (not on every render of the page)
  useEffect(() => {
    if (isOpen) { setEditing(null); setConfirmDelete(null); setConfirmItem(null); setNewName(''); setError(''); }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Items of the form grouped by category; categories that only exist on items (deleted from the list) are shown too
  const indexed = items.map((item, idx) => ({ item, idx, cat: clean(item.category) || 'Lainnya' }));
  const groups = [...categories, ...[...new Set(indexed.map(x => x.cat))].filter(c => !categories.includes(c))];
  const itemsOf = (c) => indexed.filter(x => x.cat === c);

  const toggle = (c) => setExpanded(prev => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; });

  const run = async (call, after) => {
    setBusy(true);
    setError('');
    const res = await call();
    setBusy(false);
    if (!res?.success) { setError(res?.message || 'Gagal menyimpan kategori'); return; }
    onChange?.(res, after);
    setEditing(null); setConfirmDelete(null);
  };
  const saveList = (list) => run(() => api.facilityCategories('PUT', '', { categories: list }));
  const rename = (from) => {
    const to = clean(draft);
    if (!to || to === from) { setEditing(null); return; }
    run(() => api.facilityCategories('POST', '/rename', { from, to }), { renamed: { from, to } });
    setExpanded(prev => { const next = new Set(prev); if (next.delete(from)) next.add(to); return next; });
  };
  const add = (e) => {
    e.preventDefault();
    const name = clean(newName);
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) { setError(`Kategori "${name}" sudah ada.`); return; }
    saveList([...categories, name]);
    setNewName('');
  };
  const saveForm = async () => {
    setSaving(true);
    try { await onSaveForm?.(); } finally { setSaving(false); }
  };

  const iconBtn = 'p-1.5 rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 cursor-pointer';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="facility-cat-title" className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <Tags size={16} className="text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <h3 id="facility-cat-title" className="text-sm font-bold text-slate-900">Kelola Kategori & Item</h3>
              {formTitle && <p className="text-[11px] text-slate-500 truncate">Item formulir “{formTitle}”</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} text-slate-400 hover:bg-slate-100`} aria-label="Tutup"><X size={16} /></button>
        </div>

        <p className="px-5 pt-3 text-[11px] text-slate-500 leading-snug">
          Klik kategori untuk melihat dan mengedit itemnya. Ganti nama kategori berlaku di semua formulir dan template; menghapus kategori hanya menghilangkannya dari pilihan.
        </p>

        <ul className="px-3 py-2 overflow-y-auto overscroll-contain">
          {groups.map(c => {
            const inList = categories.includes(c);
            const rows = itemsOf(c);
            const open = expanded.has(c);
            const globalUse = usage[c] || 0;

            if (editing === c) {
              return (
                <li key={c} className="flex items-center gap-1.5 px-2 py-1.5">
                  <input autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label={`Nama baru untuk ${c}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(c); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                    className="flex-1 min-w-0 bg-white border border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <button type="button" disabled={busy} onClick={() => rename(c)} className={`${iconBtn} text-emerald-700 hover:bg-emerald-50`} aria-label="Simpan nama"><Check size={15} /></button>
                  <button type="button" onClick={() => setEditing(null)} className={`${iconBtn} text-slate-400 hover:bg-slate-100`} aria-label="Batal ubah"><X size={15} /></button>
                </li>
              );
            }

            return (
              <li key={c} className="rounded-xl">
                {confirmDelete === c ? (
                  <div className="mx-2 my-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 space-y-1.5">
                    <div className="text-[11px] text-rose-800">
                      Hapus <b>{c}</b> dari pilihan?{globalUse ? ` Dipakai ${globalUse} item di semua formulir & template; item itu tetap memakai nama ini.` : ''}
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button type="button" autoFocus onClick={() => setConfirmDelete(null)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.97] transition-transform cursor-pointer">Batal</button>
                      <button type="button" disabled={busy || categories.length <= 1} onClick={() => saveList(categories.filter(x => x !== c))}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.97] transition-transform disabled:opacity-40 cursor-pointer">Hapus</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-50">
                    <button type="button" onClick={() => toggle(c)} aria-expanded={open}
                      className="flex flex-1 min-w-0 items-center gap-1.5 py-1 text-left cursor-pointer">
                      <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
                      <span className="truncate text-xs font-semibold text-slate-800">{c}</span>
                      {!inList && <span className="shrink-0 rounded bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">tidak ada di daftar</span>}
                      <span className="ml-auto shrink-0 pl-2 text-[10px] text-slate-400 tabular-nums">{rows.length ? `${rows.length} item` : 'kosong'}</span>
                    </button>
                    {!inList && (
                      <button type="button" disabled={busy} onClick={() => saveList([...categories, c])}
                        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-slate-100 active:scale-[0.97] transition-transform disabled:opacity-40 cursor-pointer">
                        Tambah ke daftar
                      </button>
                    )}
                    {inList && (
                      <>
                        <button type="button" onClick={() => { setEditing(c); setDraft(c); setConfirmDelete(null); }} className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-indigo-700`} aria-label={`Ubah nama ${c}`}><Pencil size={13} /></button>
                        <button type="button" onClick={() => { setConfirmDelete(c); setEditing(null); }} className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-rose-700`} aria-label={`Hapus kategori ${c}`}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                )}

                {open && (
                  <div className="ml-7 mr-2 mb-2 border-l border-slate-200 pl-3">
                    {rows.length === 0 && <p className="py-1.5 text-[11px] text-slate-400">Belum ada item di kategori ini.</p>}
                    {rows.map(({ item, idx }) => (
                      <div key={item.id || idx} className="flex items-center gap-1 py-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-800">{item.name || '(tanpa nama)'}</p>
                          <p className="text-[10px] text-slate-500 tabular-nums">{rupiah(item.price)} / {item.unit || 'unit'}{item.max_qty ? ` · maks. ${item.max_qty}` : ''}</p>
                        </div>
                        {confirmItem === idx ? (
                          <>
                            <button type="button" onClick={() => setConfirmItem(null)} className="px-2 py-1 rounded-md text-[10px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Batal</button>
                            <button type="button" onClick={() => { onDeleteItem?.(idx); setConfirmItem(null); }} className="px-2 py-1 rounded-md text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.97] transition-transform cursor-pointer">Hapus item</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => onEditItem?.(idx)} className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-indigo-700`} aria-label={`Edit item ${item.name}`}><Pencil size={13} /></button>
                            <button type="button" onClick={() => setConfirmItem(idx)} className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-rose-700`} aria-label={`Hapus item ${item.name}`}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => onAddItem?.(c)} className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 active:scale-[0.97] transition-transform cursor-pointer">
                      <Plus size={12} /> Tambah item ke {c}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {itemsDirty && (
          <div className="mx-5 mb-1 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
            <span className="text-[11px] font-medium text-amber-800">Ada perubahan item yang belum disimpan.</span>
            <button type="button" disabled={saving} onClick={saveForm}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 active:scale-[0.97] transition-transform disabled:opacity-50 cursor-pointer">
              <Save size={12} /> {saving ? 'Menyimpan…' : 'Simpan formulir'}
            </button>
          </div>
        )}

        <form onSubmit={add} className="px-5 py-4 border-t border-slate-100 space-y-2">
          {error && <div role="alert" className="text-[11px] font-semibold text-rose-700">{error}</div>}
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Kategori baru, mis. Catering" aria-label="Nama kategori baru"
              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={busy || !newName.trim()}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 active:scale-[0.97] transition-transform disabled:opacity-40 cursor-pointer">
              <Plus size={13} /> Tambah kategori
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
