import React, { useEffect, useState } from 'react';
import { X, Pencil, Trash2, Plus, Check, Tags } from 'lucide-react';
import { api } from '../../services/api';

// "Kelola Kategori" of the Fasilitas menu (AGENTS.md §46): add, rename and delete the item categories, the 9 built-in
// ones included. Renaming also renames the category in every saved form and template (server); deleting only removes
// it from the list, items that use it keep it.
export default function FacilityCategoryManager({ isOpen, onClose, categories, usage = {}, onChange }) {
  const [editing, setEditing] = useState(null); // category being renamed
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // fresh state each time the window opens (not on every render of the page)
  useEffect(() => {
    if (isOpen) { setEditing(null); setConfirmDelete(null); setNewName(''); setError(''); }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const run = async (call, after) => {
    setBusy(true);
    setError('');
    const res = await call();
    setBusy(false);
    if (!res?.success) { setError(res?.message || 'Gagal menyimpan kategori'); return; }
    onChange?.(res, after);
    setEditing(null); setConfirmDelete(null);
  };
  const saveList = (list, note) => run(() => api.facilityCategories('PUT', '', { categories: list }), note);
  const rename = (from) => {
    const to = draft.trim().replace(/\s+/g, ' ');
    if (!to || to === from) { setEditing(null); return; }
    run(() => api.facilityCategories('POST', '/rename', { from, to }), { renamed: { from, to } });
  };
  const add = (e) => {
    e.preventDefault();
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) { setError(`Kategori "${name}" sudah ada.`); return; }
    saveList([...categories, name]);
    setNewName('');
  };

  const btn = 'p-1.5 rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 cursor-pointer';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="facility-cat-title" className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Tags size={16} className="text-indigo-600" />
            <h3 id="facility-cat-title" className="text-sm font-bold text-slate-900">Kelola Kategori Fasilitas</h3>
          </div>
          <button type="button" onClick={onClose} className={`${btn} text-slate-400 hover:bg-slate-100`} aria-label="Tutup"><X size={16} /></button>
        </div>

        <p className="px-5 pt-3 text-[11px] text-slate-500 leading-snug">
          Mengubah nama juga mengganti kategori itu di semua formulir dan template. Menghapus hanya menghilangkannya dari pilihan; item yang memakainya tetap memakai nama itu.
        </p>

        <ul className="px-5 py-3 space-y-1.5 overflow-y-auto">
          {categories.map(c => {
            const used = usage[c] || 0;
            if (editing === c) {
              return (
                <li key={c} className="flex items-center gap-1.5">
                  <input autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label={`Nama baru untuk ${c}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(c); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                    className="flex-1 min-w-0 bg-white border border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <button type="button" disabled={busy} onClick={() => rename(c)} className={`${btn} text-emerald-700 hover:bg-emerald-50`} aria-label="Simpan nama"><Check size={15} /></button>
                  <button type="button" onClick={() => setEditing(null)} className={`${btn} text-slate-400 hover:bg-slate-100`} aria-label="Batal ubah"><X size={15} /></button>
                </li>
              );
            }
            if (confirmDelete === c) {
              return (
                <li key={c} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 space-y-1.5">
                  <div className="text-[11px] text-rose-800">
                    Hapus <b>{c}</b> dari pilihan?{used ? ` Dipakai ${used} item; item itu tetap memakai nama ini.` : ''}
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" autoFocus onClick={() => setConfirmDelete(null)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.97] transition-transform cursor-pointer">Batal</button>
                    <button type="button" disabled={busy || categories.length <= 1} onClick={() => saveList(categories.filter(x => x !== c))}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.97] transition-transform disabled:opacity-40 cursor-pointer">Hapus</button>
                  </div>
                </li>
              );
            }
            return (
              <li key={c} className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                <span className="flex-1 min-w-0 truncate text-xs font-medium text-slate-800">{c}</span>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{used ? `${used} item` : 'belum dipakai'}</span>
                <button type="button" onClick={() => { setEditing(c); setDraft(c); setConfirmDelete(null); }} className={`${btn} text-slate-500 hover:bg-indigo-50 hover:text-indigo-700`} aria-label={`Ubah nama ${c}`}><Pencil size={13} /></button>
                <button type="button" onClick={() => { setConfirmDelete(c); setEditing(null); }} className={`${btn} text-slate-500 hover:bg-rose-50 hover:text-rose-700`} aria-label={`Hapus ${c}`}><Trash2 size={13} /></button>
              </li>
            );
          })}
        </ul>

        <form onSubmit={add} className="px-5 py-4 border-t border-slate-100 space-y-2">
          {error && <div role="alert" className="text-[11px] font-semibold text-rose-700">{error}</div>}
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Kategori baru, mis. Catering" aria-label="Nama kategori baru"
              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={busy || !newName.trim()}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 active:scale-[0.97] transition-transform disabled:opacity-40 cursor-pointer">
              <Plus size={13} /> Tambah
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
