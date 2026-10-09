import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, Loader2, Paperclip, SendHorizontal, Settings2, X } from 'lucide-react';
import { ROLE_LABELS } from '../../utils/roles';
import { Avatar } from './ChatAvatar';
import { tickOf } from './useChat';
import { AttachmentCard, AttachmentPicker, attachmentLabel, canAttachBooth, canAttachInvoice } from './ChatAttachment';

const MAX_LENGTH = 4000;
const dayKey = (iso) => new Date(iso).toDateString();
const timeOf = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hari ini';
  if (d.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Tick({ state }) {
  if (state === 'sending') return <Clock size={13} className="text-indigo-200" aria-label="Mengirim" />;
  if (state === 'read') return <CheckCheck size={15} className="text-sky-300" aria-label="Dibaca" />;
  if (state === 'delivered') return <CheckCheck size={15} className="text-indigo-200" aria-label="Terkirim ke perangkat" />;
  return <Check size={15} className="text-indigo-200" aria-label="Terkirim" />;
}

export default function ChatThread({ chat, conversation, me, onBack, onManage }) {
  const thread = chat.threads[conversation.id] || { items: [], loaded: false };
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scroller = useRef(null);
  const input = useRef(null);
  const nearBottom = useRef(true);
  const prevHeight = useRef(0);
  const isGroup = conversation.type === 'group';
  const peer = conversation.peer;
  const canAttach = canAttachBooth(me.role) || canAttachInvoice(me.role);
  const peerInactive = !isGroup && peer && !peer.isActive;

  useEffect(() => { setText(''); setAttachment(null); setPickerOpen(false); nearBottom.current = true; input.current?.focus(); }, [conversation.id]);

  // Stay at the bottom for new messages; keep the reading position when older ones are loaded above
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current && !nearBottom.current) el.scrollTop += el.scrollHeight - prevHeight.current;
    else el.scrollTop = el.scrollHeight;
    prevHeight.current = el.scrollHeight;
  }, [thread.items.length, conversation.id]);

  const onScroll = () => {
    const el = scroller.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = el.scrollHeight;
  };

  const submit = () => {
    const body = text.trim();
    if ((!body && !attachment) || body.length > MAX_LENGTH || peerInactive) return;
    chat.send(conversation.id, body, attachment?.value || null);
    nearBottom.current = true;
    setText('');
    setAttachment(null);
    input.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };

  const autoGrow = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const subtitle = isGroup
    ? conversation.members.map(m => (m.id === me.id ? 'Anda' : m.name)).join(', ')
    : `${ROLE_LABELS[peer?.role] || peer?.role || ''}${peerInactive ? ' · Akun nonaktif' : ''}`;
  const nameOf = (id) => conversation.members.find(m => m.id === id)?.name || 'Mantan anggota';

  let lastDay = null;
  return (
    <div className="flex h-full min-w-0 flex-col bg-slate-50">
      <header className="h-14 shrink-0 flex items-center gap-2.5 px-3 border-b border-slate-200 bg-white">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Kembali ke daftar chat"><ArrowLeft size={18} /></button>
        <Avatar name={conversation.title} id={peer?.id || conversation.id} size={36} group={isGroup} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 truncate">{conversation.title}</h3>
          <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
        </div>
        {isGroup && me.role === 'superadmin' && (
          <button type="button" onClick={onManage} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Atur grup" aria-label="Atur grup"><Settings2 size={17} /></button>
        )}
      </header>

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 [overflow-anchor:none]">
        {thread.hasMore && (
          <div className="flex justify-center pb-2">
            <button type="button" onClick={() => chat.loadThread(conversation.id, { older: true })}
              className="px-3 py-1 rounded-full text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">
              {thread.loading ? 'Memuat…' : 'Muat pesan sebelumnya'}
            </button>
          </div>
        )}
        {!thread.loaded && <div className="h-full flex items-center justify-center text-slate-500"><Loader2 size={18} className="animate-spin" /></div>}
        {thread.loaded && !thread.items.length && (
          <p className="h-full flex items-center justify-center text-center text-xs text-slate-500 px-6">
            {isGroup ? 'Belum ada pesan di grup ini.' : `Mulai percakapan dengan ${conversation.title}.`}
          </p>
        )}
        {thread.items.map((m, i) => {
          const mine = m.senderId === me.id;
          const showDay = dayKey(m.createdAt) !== lastDay;
          lastDay = dayKey(m.createdAt);
          const prev = thread.items[i - 1];
          const grouped = prev && !showDay && prev.senderId === m.senderId;
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600">{dayLabel(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                <div className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 py-1.5 shadow-[0_1px_1px_rgba(15,23,42,0.06)] ${mine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'} ${m.failed ? 'opacity-80' : ''}`}>
                  {isGroup && !mine && !grouped && <p className="text-[11px] font-bold text-indigo-700 mb-0.5">{nameOf(m.senderId)}</p>}
                  {m.body && <p className="text-[13px] leading-snug whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.attachment && <AttachmentCard attachment={m.attachment} mine={mine} role={me.role} />}
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums ${mine ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {timeOf(m.createdAt)}
                    {mine && !m.failed && <Tick state={tickOf(m, conversation, me.id)} />}
                  </div>
                </div>
              </div>
              {m.failed && (
                <div className="flex justify-end items-center gap-2 mt-1 text-[11px] text-rose-700">
                  <AlertCircle size={13} /> Gagal terkirim{m.error ? `: ${m.error}` : ''}
                  <button type="button" onClick={() => chat.send(conversation.id, m.body, m.attachment, m.id)} className="font-bold underline underline-offset-2">Kirim ulang</button>
                  <button type="button" onClick={() => chat.discardFailed(conversation.id, m.id)} className="font-semibold text-slate-600 underline underline-offset-2">Hapus</button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <footer className="relative shrink-0 border-t border-slate-200 bg-white px-3 py-2.5">
        {pickerOpen && (
          <AttachmentPicker role={me.role} onClose={() => setPickerOpen(false)}
            onPick={(value, label) => { setAttachment({ value, label }); setPickerOpen(false); input.current?.focus(); }} />
        )}
        {attachment && (
          <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-800">
            <Paperclip size={12} /> <span className="truncate">{attachment.label || attachmentLabel(attachment.value)}</span>
            <button type="button" onClick={() => setAttachment(null)} className="p-0.5 rounded hover:bg-indigo-100" aria-label="Hapus lampiran"><X size={12} /></button>
          </div>
        )}
        {peerInactive ? (
          <p className="py-2 text-center text-xs text-slate-500">Akun ini sudah nonaktif. Pesan baru tidak dapat dikirim.</p>
        ) : (
          <div className="flex items-end gap-2">
            {canAttach && (
              <button type="button" onClick={() => setPickerOpen(v => !v)}
                className={`p-2 rounded-xl text-slate-600 hover:bg-slate-100 ${pickerOpen ? 'bg-slate-100' : ''}`} title="Lampirkan booth / invoice" aria-label="Lampirkan booth atau invoice">
                <Paperclip size={18} />
              </button>
            )}
            <textarea ref={input} rows={1} value={text} maxLength={MAX_LENGTH} onChange={(e) => { setText(e.target.value); autoGrow(e); }} onKeyDown={onKeyDown}
              placeholder="Ketik pesan" aria-label="Ketik pesan"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-snug text-slate-800 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
            <button type="button" onClick={submit} disabled={!text.trim() && !attachment}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 active:scale-[0.95] transition-[transform,background-color] duration-150" aria-label="Kirim">
              <SendHorizontal size={17} />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
