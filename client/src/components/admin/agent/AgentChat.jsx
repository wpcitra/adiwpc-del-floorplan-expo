import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Plus, Search, Send, Paperclip, Square, Maximize2, Minimize2, AlertOctagon, LayoutGrid, FileCode2, X,
  Pencil, Check, Loader2, Info, Wallet, FileText, RotateCcw, Ban, Sparkles, BookOpen
} from 'lucide-react';
import { api } from '../../../services/api';
import Markdown from './Markdown';

// Pusat Maintenance > Chat Agent AI (AGENTS.md §27). Tahap 1: questions & code reading; the agent cannot change
// anything yet. One conversation = one "Tugas" with its own history, attachments and cost.

const STATUS = {
  diskusi: { label: 'Diskusi', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  menunggu_rencana: { label: 'Menunggu Persetujuan Rencana', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  dikerjakan: { label: 'Dikerjakan', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  siap_ditinjau: { label: 'Siap Ditinjau', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  dideploy: { label: 'Di-deploy', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  dibatalkan: { label: 'Dibatalkan', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
};
const EXAMPLES = [
  { icon: AlertOctagon, title: 'Perbaiki error terbaru', text: 'Tolong analisis error terbaru di Pusat Maintenance: apa penyebabnya dan bagaimana memperbaikinya?' },
  { icon: Sparkles, title: 'Buat fitur baru', text: 'Saya ingin menambahkan fitur: ' },
  { icon: BookOpen, title: 'Jelaskan bagian kode ini', text: 'Jelaskan cara kerja bagian kode ini: ' }
];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const POLL_MS = 1200;

const toDate = (v) => (v ? new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`) : null);
const timeLabel = (v) => {
  const d = toDate(v);
  if (!d || isNaN(d)) return '';
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
};
const usd = (n) => `USD ${(Number(n) || 0).toFixed((Number(n) || 0) < 1 ? 3 : 2)}`;
const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = reject;
  r.readAsDataURL(file);
});

const StatusBadge = ({ status }) => (
  <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${STATUS[status]?.cls || STATUS.diskusi.cls}`}>{STATUS[status]?.label || status}</span>
);

function AttachmentView({ att }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoked = null;
    let alive = true;
    api.agentAttachmentUrl(att.id).then(u => { if (alive) { setUrl(u); revoked = u; } else if (u) URL.revokeObjectURL(u); });
    return () => { alive = false; if (revoked) URL.revokeObjectURL(revoked); };
  }, [att.id]);
  if (att.kind === 'image') {
    return url
      ? <a href={url} target="_blank" rel="noopener noreferrer" title={att.name}><img src={url} alt={att.name} className="max-h-40 max-w-[220px] rounded-lg border border-white/30 object-contain bg-white" /></a>
      : <div className="w-24 h-16 rounded-lg bg-slate-200/60 animate-pulse" />;
  }
  return (
    <a href={url || undefined} download={att.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-[11px] text-slate-700 max-w-[220px]">
      <FileText size={12} className="shrink-0" /><span className="truncate">{att.name}</span>
    </a>
  );
}

function Picker({ title, onClose, children }) {
  return (
    <div className="absolute bottom-full mb-2 left-0 w-[360px] max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-2xl z-30 overflow-hidden animate-fadeIn">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-bold text-slate-700">{title}</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Tutup"><X size={14} /></button>
      </div>
      <div className="max-h-72 overflow-y-auto">{children}</div>
    </div>
  );
}

export default function AgentChat() {
  const [tasks, setTasks] = useState([]);
  const [usage, setUsage] = useState(null);
  const [filter, setFilter] = useState({ status: 'semua', q: '' });
  const [taskId, setTaskId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState([]); // [{ file, name, mime, preview }]
  const [context, setContext] = useState([]); // [{ type, id|key|path, label }]
  const [picker, setPicker] = useState(null); // 'error' | 'module' | 'file'
  const [pickerData, setPickerData] = useState([]);
  const [fileQuery, setFileQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const listEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textRef = useRef(null);

  const running = detail?.run?.status === 'berjalan';

  const loadTasks = useCallback(async () => {
    const res = await api.agentListTasks(filter);
    if (res.success) { setTasks(res.tasks || []); setUsage(res.usage || null); }
  }, [filter]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    const res = await api.agentGetTask(id);
    if (res.success) { setDetail(res); setUsage(u => ({ ...(u || {}), ...res.usage })); }
  }, []);

  useEffect(() => { const t = setTimeout(loadTasks, 250); return () => clearTimeout(t); }, [loadTasks]);
  useEffect(() => { loadDetail(taskId); }, [taskId, loadDetail]);
  // While the agent works: follow its progress, then refresh the list once it is done
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      const res = await api.agentGetTask(taskId);
      if (res.success) {
        setDetail(res);
        if (res.run?.status !== 'berjalan') loadTasks();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, taskId, loadTasks]);
  useEffect(() => { listEndRef.current?.scrollIntoView({ block: 'end' }); }, [detail?.messages?.length, running]);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);
  useEffect(() => () => pending.forEach(p => p.preview && URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };

  const addFiles = (files) => {
    const next = [];
    for (const f of files) {
      const isImage = IMAGE_TYPES.includes(f.type);
      if (isImage && f.size > MAX_IMAGE) { flash(`${f.name}: gambar maksimal 5 MB`); continue; }
      if (!isImage && f.type !== 'application/pdf' && f.size > MAX_FILE) { flash(`${f.name}: file teks maksimal 1 MB`); continue; }
      if (f.type === 'application/pdf' && f.size > 10 * 1024 * 1024) { flash(`${f.name}: PDF maksimal 10 MB`); continue; }
      next.push({ file: f, name: f.name || `tempelan-${Date.now()}.png`, mime: f.type || 'text/plain', preview: isImage ? URL.createObjectURL(f) : null });
    }
    setPending(prev => [...prev, ...next].slice(0, 6));
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files.map(f => (f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`, { type: f.type }))));
    }
  };

  const newTask = async () => {
    const res = await api.agentCreateTask();
    if (res.success) {
      setTaskId(res.task.id);
      loadTasks();
      setTimeout(() => textRef.current?.focus(), 50);
    } else flash(res.error || 'Tugas gagal dibuat');
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending.length) || sending || running) return;
    setSending(true);
    let id = taskId;
    if (!id) {
      const created = await api.agentCreateTask();
      if (!created.success) { setSending(false); flash(created.error || 'Tugas gagal dibuat'); return; }
      id = created.task.id;
      setTaskId(id);
    }
    const attachments = [];
    for (const p of pending) attachments.push({ name: p.name, mime: p.mime, dataBase64: await readAsBase64(p.file) });
    const res = await api.agentSendMessage(id, { text: body, context: context.map(({ type, id: cid, key, path }) => ({ type, id: cid, key, path })), attachments });
    setSending(false);
    if (!res.success) { flash(res.error || 'Pesan gagal dikirim'); return; }
    pending.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
    setText('');
    setPending([]);
    setContext([]);
    await loadDetail(id);
    loadTasks();
  };

  const stop = async () => {
    await api.agentStop(taskId);
    setTimeout(() => loadDetail(taskId), 400);
  };

  const openPicker = async (kind) => {
    if (picker === kind) { setPicker(null); return; }
    setPicker(kind);
    setPickerData([]);
    if (kind === 'error') {
      const res = await api.fetchMaintenanceErrors({ status: 'aktif' });
      setPickerData(res.errors || []);
    } else if (kind === 'module') {
      const res = await api.agentModules();
      setPickerData(res.modules || []);
    } else {
      setFileQuery('');
      const res = await api.agentFiles('');
      setPickerData(res.files || []);
    }
  };
  useEffect(() => {
    if (picker !== 'file') return undefined;
    const t = setTimeout(async () => { const res = await api.agentFiles(fileQuery); setPickerData(res.files || []); }, 250);
    return () => clearTimeout(t);
  }, [fileQuery, picker]);

  const addContext = (item) => {
    setContext(prev => (prev.some(c => c.type === item.type && (c.id || c.key || c.path) === (item.id || item.key || item.path)) ? prev : [...prev, item].slice(0, 10)));
    setPicker(null);
  };

  const saveTitle = async () => {
    const title = (editingTitle || '').trim();
    setEditingTitle(null);
    if (!title || title === detail?.task?.title) return;
    const res = await api.agentUpdateTask(taskId, { title });
    if (res.success) { loadDetail(taskId); loadTasks(); } else flash(res.error || 'Judul gagal diubah');
  };
  const setStatus = async (status) => {
    const res = await api.agentUpdateTask(taskId, { status });
    if (res.success) { loadDetail(taskId); loadTasks(); } else flash(res.error || 'Status gagal diubah');
  };

  const task = detail?.task;
  const messages = detail?.messages || [];
  const chipBtn = 'flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 cursor-pointer disabled:opacity-40';

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-slate-100 p-2 sm:p-3' : 'h-[calc(100vh-150px)] min-h-[560px]'}>
      <div className="flex h-full bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* ---------- task list ---------- */}
        <aside className="w-64 xl:w-72 shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/60">
          <div className="p-3 border-b border-slate-200 space-y-2">
            <button type="button" onClick={newTask} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer">
              <Plus size={14} /> Tugas Baru
            </button>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input value={filter.q} onChange={(e) => setFilter(f => ({ ...f, q: e.target.value }))} placeholder="Cari tugas..." className="bg-transparent text-xs focus:outline-none w-full" />
            </div>
            <select value={filter.status} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))} className="w-full bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none">
              <option value="semua">Semua status</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {tasks.length === 0 && <div className="text-[11px] text-slate-400 text-center py-8">Belum ada tugas.</div>}
            {tasks.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTaskId(t.id)}
                className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${t.id === taskId ? 'bg-white border-slate-300 shadow-xs' : 'border-transparent hover:bg-white'}`}
              >
                <div className="flex items-start gap-1.5">
                  {t.running && <Loader2 size={12} className="mt-0.5 animate-spin text-indigo-500 shrink-0" />}
                  <div className="text-xs font-semibold text-slate-800 line-clamp-2 flex-1">{t.title}</div>
                </div>
                <div className="flex items-center justify-between mt-1 gap-1">
                  <StatusBadge status={t.status} />
                  <span className="text-[10px] text-slate-400">{timeLabel(t.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
          {usage && (
            <div className={`p-3 border-t text-[11px] ${usage.exhausted ? 'bg-rose-50 border-rose-200 text-rose-700' : usage.warning ? 'bg-amber-50 border-amber-200 text-amber-800' : 'border-slate-200 text-slate-500'}`}>
              <div className="flex items-center gap-1 font-bold"><Wallet size={12} /> Biaya bulan ini (perkiraan)</div>
              <div>{usd(usage.monthCostUsd)} dari batas {usd(usage.budgetUsd)}</div>
              <div className="h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden"><div className={`h-full ${usage.exhausted ? 'bg-rose-500' : usage.warning ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (usage.ratio || 0) * 100)}%` }} /></div>
            </div>
          )}
        </aside>

        {/* ---------- conversation ---------- */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
            <Bot size={18} className="text-violet-600 shrink-0" />
            <div className="min-w-0 flex-1">
              {task && editingTitle !== null ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(null); }} maxLength={120}
                    className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none" />
                  <button type="button" onClick={saveTitle} className="p-1 text-emerald-600 cursor-pointer" aria-label="Simpan judul"><Check size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 truncate">{task ? task.title : 'Chat Agent AI'}</h2>
                  {task && <button type="button" onClick={() => setEditingTitle(task.title)} className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer" title="Ubah judul"><Pencil size={12} /></button>}
                  {task && <StatusBadge status={task.status} />}
                </div>
              )}
              {task && <div className="text-[10px] text-slate-400">{task.id} · dibuat oleh {task.createdByName || '-'}{detail?.usage?.task ? ` · biaya tugas ${usd(detail.usage.task.costUsd)}` : ''}</div>}
            </div>
            {task && task.status !== 'dibatalkan' && !running && (
              <button type="button" onClick={() => setStatus('dibatalkan')} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer" title="Batalkan tugas"><Ban size={12} /> Batalkan</button>
            )}
            {task?.status === 'dibatalkan' && (
              <button type="button" onClick={() => setStatus('diskusi')} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"><RotateCcw size={12} /> Buka Kembali</button>
            )}
            <button type="button" onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" title={fullscreen ? 'Keluar layar penuh (Esc)' : 'Layar penuh'}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          <div className="px-4 py-1.5 bg-violet-50 border-b border-violet-100 text-[11px] text-violet-800 flex items-center gap-1.5">
            <Info size={12} className="shrink-0" /> Tahap 1: agent bisa menjawab pertanyaan dan membaca kode, error, serta struktur database. Agent belum bisa mengubah kode atau data.
          </div>
          {usage?.warning && <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">Pemakaian Claude API bulan ini sudah {Math.round(usage.ratio * 100)}% dari batas {usd(usage.budgetUsd)}.</div>}
          {usage?.exhausted && <div className="px-4 py-1.5 bg-rose-50 border-b border-rose-200 text-[11px] text-rose-700">Batas biaya bulanan tercapai. Super Admin dapat menaikkan batas di Setting &gt; Integrasi AI.</div>}

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/40">
            {messages.length === 0 && (
              <div className="max-w-xl mx-auto text-center pt-8">
                <Bot size={34} className="mx-auto text-violet-400 mb-2" />
                <h3 className="text-sm font-bold text-slate-800">Tanya atau beri perintah ke AI agent</h3>
                <p className="text-xs text-slate-500 mt-1">Lampirkan error, halaman, file kode, atau screenshot agar agent memahami konteksnya.</p>
                <div className="grid sm:grid-cols-3 gap-2 mt-4">
                  {EXAMPLES.map(ex => (
                    <button key={ex.title} type="button" onClick={() => { setText(ex.text); textRef.current?.focus(); }}
                      className="text-left p-3 rounded-xl bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 cursor-pointer">
                      <ex.icon size={16} className="text-violet-600 mb-1" />
                      <div className="text-xs font-bold text-slate-800">{ex.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">{ex.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => {
              if (m.role === 'system') {
                return <div key={m.id} className="mx-auto max-w-xl text-center text-[11px] px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900"><Markdown text={m.content} /></div>;
              }
              const mine = m.role === 'user';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-slate-900 text-white rounded-br-md' : 'bg-white border border-slate-200 rounded-bl-md shadow-2xs'}`}>
                      {mine ? <div className="text-[13px] whitespace-pre-wrap break-words">{m.content}</div> : <Markdown text={m.content} />}
                      {(m.context.length > 0 || m.attachments.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.context.map((c, i) => <span key={i} className="px-1.5 py-0.5 rounded-md bg-white/15 border border-white/20 text-[10px]">{c.type === 'error' ? '⚠️' : c.type === 'module' ? '🧩' : '📄'} {c.label}</span>)}
                          {m.attachments.map(a => <AttachmentView key={a.id} att={a} />)}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 px-1 flex flex-wrap gap-x-2">
                      <span>{mine ? m.byName : 'Agent'} · {timeLabel(m.createdAt)}</span>
                      {!mine && m.toolsUsed.length > 0 && <span title={m.toolsUsed.map(t => `${t.name} ${t.target}`).join('\n')}>🔍 {m.toolsUsed.length} langkah baca</span>}
                      {!mine && m.costUsd !== null && <span>≈ {usd(m.costUsd)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {running && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-violet-200 text-xs text-violet-800 shadow-2xs">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="truncate max-w-[360px]">{detail.run.phase || 'Bekerja…'}</span>
                  <button type="button" onClick={stop} className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold cursor-pointer"><Square size={10} /> Hentikan</button>
                </div>
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* ---------- composer ---------- */}
          <div className="border-t border-slate-200 p-3 bg-white">
            {notice && <div className="mb-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{notice}</div>}
            {(context.length > 0 || pending.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {context.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-800">
                    {c.type === 'error' ? '⚠️' : c.type === 'module' ? '🧩' : '📄'} <span className="max-w-[220px] truncate">{c.label}</span>
                    <button type="button" onClick={() => setContext(prev => prev.filter((_, j) => j !== i))} className="p-0.5 cursor-pointer" aria-label="Hapus konteks"><X size={11} /></button>
                  </span>
                ))}
                {pending.map((p, i) => (
                  <span key={i} className="flex items-center gap-1 pl-1 pr-1 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                    {p.preview ? <img src={p.preview} alt="" className="w-8 h-8 object-cover rounded" /> : <FileText size={13} />}
                    <span className="max-w-[160px] truncate">{p.name}</span>
                    <button type="button" onClick={() => { if (p.preview) URL.revokeObjectURL(p.preview); setPending(prev => prev.filter((_, j) => j !== i)); }} className="p-0.5 cursor-pointer" aria-label="Hapus lampiran"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative flex flex-wrap items-center gap-1.5 mb-2">
              <button type="button" className={chipBtn} onClick={() => fileInputRef.current?.click()}><Paperclip size={12} /> Lampiran</button>
              <button type="button" className={chipBtn} onClick={() => openPicker('error')}><AlertOctagon size={12} /> Lampirkan Error</button>
              <button type="button" className={chipBtn} onClick={() => openPicker('module')}><LayoutGrid size={12} /> Pilih Halaman/Modul</button>
              <button type="button" className={chipBtn} onClick={() => openPicker('file')}><FileCode2 size={12} /> Pilih File Kode</button>
              <input ref={fileInputRef} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.txt,.log,.json,.csv,.md,.js,.jsx,.css,.html,.sql"
                onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
              {picker === 'error' && (
                <Picker title="Lampirkan error yang tertangkap" onClose={() => setPicker(null)}>
                  {pickerData.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">Tidak ada error aktif.</div>}
                  {pickerData.map(e => (
                    <button key={e.id} type="button" onClick={() => addContext({ type: 'error', id: e.id, label: `${e.id} ${e.message.slice(0, 50)}` })} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 cursor-pointer">
                      <div className="text-[10px] font-bold text-slate-500">{e.priority} · {e.feature}</div>
                      <div className="text-xs text-slate-800 line-clamp-2">{e.message}</div>
                    </button>
                  ))}
                </Picker>
              )}
              {picker === 'module' && (
                <Picker title="Pilih halaman / modul" onClose={() => setPicker(null)}>
                  {pickerData.map(m => (
                    <button key={m.key} type="button" onClick={() => addContext({ type: 'module', key: m.key, label: m.label })} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 cursor-pointer">
                      <div className="text-xs font-semibold text-slate-800">{m.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{m.files.join(', ')}</div>
                    </button>
                  ))}
                </Picker>
              )}
              {picker === 'file' && (
                <Picker title="Pilih file kode" onClose={() => setPicker(null)}>
                  <div className="p-2 border-b border-slate-100">
                    <input autoFocus value={fileQuery} onChange={(e) => setFileQuery(e.target.value)} placeholder="Ketik nama file, mis. SettingsPage" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                  {pickerData.map(f => (
                    <button key={f} type="button" onClick={() => addContext({ type: 'file', path: f, label: f })} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-[11px] font-mono text-slate-700 truncate cursor-pointer">{f}</button>
                  ))}
                </Picker>
              )}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                rows={Math.min(8, Math.max(2, text.split('\n').length))}
                disabled={task?.status === 'dibatalkan'}
                placeholder={task?.status === 'dibatalkan' ? 'Tugas dibatalkan. Klik "Buka Kembali" untuk melanjutkan.' : 'Tulis perintah atau pertanyaan… (Enter kirim, Shift+Enter baris baru, tempel screenshot dengan Ctrl/Cmd+V)'}
                className="flex-1 resize-none px-3 py-2 border border-slate-200 rounded-xl text-[13px] focus:outline-none focus:border-violet-400 disabled:bg-slate-50"
              />
              <button type="button" onClick={send} disabled={sending || running || (!text.trim() && !pending.length) || task?.status === 'dibatalkan'}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kirim
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Screenshot & file dikirim ke Claude sebagai data. Hindari melampirkan data pribadi tenant yang tidak diperlukan. Isi lampiran tidak pernah dijalankan sebagai perintah.</p>
          </div>
        </section>
      </div>
      {running && <span className="sr-only" aria-live="polite">{detail.run.phase}</span>}
    </div>
  );
}
