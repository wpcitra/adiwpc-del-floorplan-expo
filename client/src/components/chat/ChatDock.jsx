import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, MessageSquarePlus, Search, Users, WifiOff, X, Paperclip } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/roles';
import { useChat } from './useChat';
import { Avatar } from './ChatAvatar';
import ChatThread from './ChatThread';
import ChatPeoplePicker from './ChatPeoplePicker';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

function listTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function preview(conv, meId) {
  const m = conv.lastMessage;
  if (!m) return conv.type === 'group' ? 'Grup dibuat' : 'Belum ada pesan';
  const who = m.senderId === meId ? 'Anda: ' : conv.type === 'group' ? `${conv.members.find(x => x.id === m.senderId)?.name?.split(' ')[0] || ''}: ` : '';
  return { who, text: m.body || (m.attachment?.type === 'booth' ? `Booth ${m.attachment.boothCode}` : 'Invoice'), attach: Boolean(m.attachment) };
}

// Chat antar staf (AGENTS.md §38): rail button with the unread count + a panel beside the rail on every admin page
export default function ChatDock() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // entry transition
  const [sheet, setSheet] = useState(null); // 'direct' | 'group' | 'manage'
  const [query, setQuery] = useState('');
  const chat = useChat(user, { panelOpen: open });
  const active = chat.conversations.find(c => c.id === chat.activeId) || null;

  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sheet) setSheet(null); else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sheet]);

  // "(3) Floorplan Studio": unread messages are visible from another tab too
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s/, '');
    document.title = chat.unreadTotal ? `(${chat.unreadTotal > 99 ? '99+' : chat.unreadTotal}) ${base}` : base;
  }, [chat.unreadTotal]);

  const openSheet = (mode) => { setSheet(mode); if (mode !== 'manage' || !chat.users.length) chat.loadUsers(); };
  const q = query.trim().toLowerCase();
  const list = useMemo(() => chat.conversations.filter(c => !q || c.title.toLowerCase().includes(q)), [chat.conversations, q]);

  if (!user) return null;
  const badge = chat.unreadTotal > 99 ? '99+' : chat.unreadTotal;

  return (
    <>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`Chat${chat.unreadTotal ? `, ${chat.unreadTotal} pesan belum dibaca` : ''}`}
        className={`w-full py-2 flex flex-col items-center rounded-xl transition-colors relative ${open ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'}`} title="Chat">
        <MessageCircle size={19} />
        {chat.unreadTotal > 0 && (
          <span className="absolute top-1 right-3.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
        )}
        <span className="text-[10px] tracking-tight mt-1 font-medium">Chat</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[58]" onClick={() => setOpen(false)} />
          <section
            aria-label="Chat"
            style={{ transition: `opacity 200ms ${EASE_OUT}, transform 200ms ${EASE_OUT}`, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateX(-12px)' }}
            className="fixed top-0 bottom-0 left-20 z-[60] w-[calc(100vw-5rem)] md:w-[min(780px,calc(100vw-6rem))] md:top-3 md:bottom-3 md:rounded-2xl bg-white border-r md:border border-slate-200 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] overflow-hidden flex"
          >
            {/* Conversation list (on a phone: hidden while a conversation is open) */}
            <div className={`relative w-full md:w-72 md:shrink-0 md:border-r border-slate-200 flex-col ${active ? 'hidden md:flex' : 'flex'}`}>
              <div className="h-14 shrink-0 flex items-center gap-1 px-3 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900 mr-auto">Chat</h2>
                <button type="button" onClick={() => openSheet('direct')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Chat baru" aria-label="Chat baru"><MessageSquarePlus size={18} /></button>
                {user.role === 'superadmin' && (
                  <button type="button" onClick={() => openSheet('group')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Grup baru" aria-label="Grup baru"><Users size={18} /></button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Tutup chat"><X size={18} /></button>
              </div>
              {!chat.connected && (
                <p className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-amber-800 bg-amber-50 border-b border-amber-200"><WifiOff size={12} /> Menyambungkan ulang…</p>
              )}
              <div className="p-2.5">
                <label className="relative block">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari chat"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
                </label>
              </div>
              <ul className="flex-1 overflow-y-auto">
                {!list.length && (
                  <li className="px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">{q ? 'Tidak ada chat yang cocok' : 'Belum ada chat'}</p>
                    {!q && (
                      <button type="button" onClick={() => openSheet('direct')} className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97] transition-transform duration-150">
                        Mulai chat
                      </button>
                    )}
                  </li>
                )}
                {list.map(c => {
                  const p = preview(c, user.id);
                  const selected = c.id === chat.activeId;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => chat.setActiveId(c.id)} aria-current={selected ? 'true' : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${selected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        <Avatar name={c.title} id={c.peer?.id || c.id} size={42} group={c.type === 'group'} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="flex-1 truncate text-sm font-semibold text-slate-900">{c.title}</span>
                            <span className={`text-[11px] tabular-nums ${c.unread ? 'font-bold text-indigo-700' : 'text-slate-500'}`}>{listTime(c.lastMessage?.createdAt || c.lastMessageAt)}</span>
                          </span>
                          <span className="flex items-center gap-2 mt-0.5">
                            <span className="flex-1 truncate text-xs text-slate-600">
                              {typeof p === 'string' ? p : (
                                <>{p.who}{p.attach && <Paperclip size={11} className="inline -mt-0.5 mr-0.5" />}{p.text}</>
                              )}
                            </span>
                            {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{c.unread > 99 ? '99+' : c.unread}</span>}
                          </span>
                          {c.type === 'direct' && <span className="sr-only">{ROLE_LABELS[c.peer?.role] || ''}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(sheet === 'direct' || sheet === 'group') && (
                <ChatPeoplePicker mode={sheet} users={chat.users} meId={user.id}
                  onDirect={async (id) => { const r = await chat.startDirect(id); if (r.success) setSheet(null); return r; }}
                  onCreateGroup={chat.createGroup} onClose={() => setSheet(null)} />
              )}
            </div>

            {/* Open conversation */}
            <div className={`relative flex-1 min-w-0 ${active ? 'flex' : 'hidden md:flex'} flex-col`}>
              {active ? (
                <ChatThread chat={chat} conversation={active} me={user} onBack={() => chat.setActiveId(null)} onManage={() => openSheet('manage')} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-center px-8">
                  <MessageCircle size={28} className="text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">Pilih chat di sebelah kiri</p>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">Pesan hanya bisa dibaca oleh peserta percakapan.</p>
                </div>
              )}
              {sheet === 'manage' && active && (
                <ChatPeoplePicker mode="manage" users={chat.users} conversation={active} meId={user.id} onClose={() => setSheet(null)} />
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
