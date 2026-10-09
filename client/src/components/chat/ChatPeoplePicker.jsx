import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Search, UserMinus, Loader2 } from 'lucide-react';
import { ROLE_LABELS } from '../../utils/roles';
import { chatApi } from '../../services/chat';
import { Avatar } from './ChatAvatar';

// Sheet inside the chat panel. mode: 'direct' (pick one staff member), 'group' (new group, Super Admin),
// 'manage' (rename / add / remove members of `conversation`, Super Admin)
export default function ChatPeoplePicker({ mode, users, conversation, meId, onDirect, onCreateGroup, onClose }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState(mode === 'manage' ? conversation.title : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setError(''); }, [query, picked, title]);

  const memberIds = useMemo(() => new Set((conversation?.members || []).map(m => m.id)), [conversation]);
  const q = query.trim().toLowerCase();
  const candidates = users
    .filter(u => u.isActive && !(mode === 'manage' && memberIds.has(u.id)))
    .filter(u => !q || u.name.toLowerCase().includes(q) || (ROLE_LABELS[u.role] || u.role).toLowerCase().includes(q));

  const toggle = (id) => setPicked(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  const run = async (fn) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.success) setError(r.error);
    return r;
  };

  const submit = async () => {
    if (mode === 'group') {
      const r = await run(() => onCreateGroup(title.trim(), picked));
      if (r.success) onClose();
      return;
    }
    if (title.trim() && title.trim() !== conversation.title) {
      const r = await run(() => chatApi.renameGroup(conversation.id, title.trim()));
      if (!r.success) return;
    }
    if (picked.length) {
      const r = await run(() => chatApi.addMembers(conversation.id, picked));
      if (!r.success) return;
    }
    onClose();
  };

  const remove = (userId) => run(() => chatApi.removeMember(conversation.id, userId));

  const heading = mode === 'direct' ? 'Chat Baru' : mode === 'group' ? 'Grup Baru' : 'Atur Grup';
  const canSubmit = mode === 'group' ? title.trim() && picked.length : (title.trim() && title.trim() !== conversation.title) || picked.length;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="h-14 shrink-0 flex items-center gap-2 px-3 border-b border-slate-200">
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Kembali"><ArrowLeft size={18} /></button>
        <h3 className="text-sm font-bold text-slate-900">{heading}</h3>
      </div>

      {mode !== 'direct' && (
        <div className="px-4 pt-3">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nama grup</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Contoh: Tim Halal Fair"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
        </div>
      )}

      {mode === 'manage' && (
        <div className="px-4 pt-4">
          <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Anggota ({conversation.members.length})</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {conversation.members.map(m => (
              <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={m.name} id={m.id} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800 truncate">{m.name}{m.id === meId ? ' (Anda)' : ''}</span>
                  <span className="block text-[11px] text-slate-500">{ROLE_LABELS[m.role] || m.role}</span>
                </span>
                {m.id !== meId && (
                  <button type="button" onClick={() => remove(m.id)} disabled={busy}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={`Keluarkan ${m.name}`} aria-label={`Keluarkan ${m.name}`}>
                    <UserMinus size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 pt-4">
        {mode !== 'direct' && <p className="text-[11px] font-semibold text-slate-600 mb-1.5">{mode === 'manage' ? 'Tambah anggota' : 'Pilih anggota'}</p>}
        <label className="relative block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau peran" autoFocus={mode === 'direct'}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
        </label>
      </div>

      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {!candidates.length && <li className="px-3 py-6 text-center text-xs text-slate-500">{users.length ? 'Tidak ada staf yang cocok' : 'Memuat daftar staf…'}</li>}
        {candidates.map(u => {
          const on = picked.includes(u.id);
          return (
            <li key={u.id}>
              <button type="button" disabled={busy}
                onClick={() => (mode === 'direct' ? run(() => onDirect(u.id)) : toggle(u.id))}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                <Avatar name={u.name} id={u.id} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{u.name}</span>
                  <span className="block text-xs text-slate-500">{ROLE_LABELS[u.role] || u.role}</span>
                </span>
                {mode !== 'direct' && (
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {mode !== 'direct' && (
        <div className="shrink-0 border-t border-slate-200 p-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
          <button type="button" onClick={submit} disabled={!canSubmit || busy}
            className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5 active:scale-[0.97] transition-transform duration-150">
            {busy && <Loader2 size={13} className="animate-spin" />}
            {mode === 'group' ? `Buat Grup${picked.length ? ` (${picked.length + 1} orang)` : ''}` : 'Simpan'}
          </button>
        </div>
      )}
    </div>
  );
}
