import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, KeyRound, ShieldCheck, RefreshCw, Trash2, Eye, EyeOff, Save, Send, ExternalLink, Power, AlertTriangle, FileDown, Check, X } from 'lucide-react';
import { api } from '../../services/api';
import { downloadInvoicePdf } from '../../utils/invoicePdf';

// Setting > Integrasi WhatsApp > "Agen AI (Gemini)" (AGENTS.md §45). The Google AI Studio key is WRITE-ONLY like the
// Fonnte token: sent once, checked with Google, stored in the env file and never shown again (only its last 4
// characters). Model and on / off are plain settings. "Chat dengan asisten" is the WhatsApp assistant on this page:
// questions, booking and invoice, saved only after YA, in the logged-in user's name.
const input = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-400';
const noticeStyle = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-rose-50 border-rose-200 text-rose-700'
};

export default function GeminiAgentSettings({ gemini, assistant, onStatus }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [models, setModels] = useState([]);
  const [modelsError, setModelsError] = useState('');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]); // { from: 'me' | 'bot', text } or { from: 'bot', invoiceId, invoiceNumber, filename }
  const logRef = useRef(null);

  const configured = Boolean(gemini?.configured);
  const locked = gemini?.source === 'environment';
  const defaultModel = gemini?.defaultModel || 'gemini-3.5-flash';

  useEffect(() => {
    if (!configured) { setModels([]); setModelsError(''); return; }
    let alive = true;
    api.waSettings('GET', '/gemini/models').then(res => {
      if (!alive) return;
      if (res.success) { setModels(res.models || []); setModelsError(''); } else setModelsError(res.error || 'Daftar model belum bisa dimuat.');
    });
    return () => { alive = false; };
  }, [configured, gemini?.hint]);

  const run = async (name, call, okText) => {
    setBusy(name);
    setNotice(null);
    const res = await call();
    setBusy('');
    if (res.success) {
      if (res.status) onStatus(res.status);
      setNotice({ type: res.warning ? 'warning' : 'success', text: res.message || okText });
    } else {
      setNotice({ type: 'error', text: res.error || 'Gagal menyimpan pengaturan Gemini.' });
    }
    return res;
  };

  const saveKey = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    const res = await run('key', () => api.waSettings('PUT', '/gemini', { apiKey: apiKey.trim() }), 'API key Gemini tersimpan.');
    if (res.success) { setApiKey(''); setShowKey(false); }
  };

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [chat, busy]);

  const send = async (text) => {
    const msg = String(text || '').trim();
    if (!msg || busy) return;
    setMessage('');
    setChat(c => [...c, { from: 'me', text: msg }]);
    setBusy('chat');
    const res = await api.waSettings('POST', '/chat', { message: msg });
    setBusy('');
    if (res.success) setChat(c => [...c, ...(res.parts || []).map(p => ({ from: 'bot', ...p }))]);
    else setChat(c => [...c, { from: 'bot', text: res.error || 'Asisten gagal menjawab. Coba lagi.', error: true }]);
  };

  const downloadPdf = async (m) => {
    setBusy('pdf');
    const res = await downloadInvoicePdf({ invoice: { id: m.invoiceId, invoice_number: m.invoiceNumber }, fileName: m.filename });
    setBusy('');
    if (!res.success) setChat(c => [...c, { from: 'bot', text: `${res.error}. Invoice ${m.invoiceNumber} bisa dibuka dari menu Invoice.`, error: true }]);
  };

  // WhatsApp-style *bold* in the assistant's answers
  const rich = (t) => String(t || '').split(/(\*[^*\n]+\*)/g).map((part, i) => (/^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : part));
  const lastBot = [...chat].reverse().find(m => m.from === 'bot' && m.text);
  const awaitingYes = Boolean(lastBot && /Balas YA/.test(lastBot.text));

  // The dropdown: the recommended default first, then the models the key can use, and the saved one if Google no longer lists it
  const modelOptions = [
    { id: defaultModel, name: 'Bawaan, disarankan' },
    ...models.filter(m => m.id !== defaultModel)
  ];
  if (gemini?.model && !modelOptions.some(m => m.id === gemini.model)) modelOptions.push({ id: gemini.model, name: gemini.model });

  const agentState = !configured ? { text: 'Menunggu API key', tone: 'text-slate-500' }
    : gemini.enabled ? { text: 'Aktif menjawab', tone: 'text-emerald-700' }
      : { text: 'Dimatikan', tone: 'text-amber-700' };

  return (
    <div className="p-4 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-900">Agen AI (Gemini)</h3>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed max-w-[75ch]">
        Dengan agen ini staf bisa bertanya bebas lewat WhatsApp, misalnya <i>"booth 3x3 yang masih kosong mana saja?"</i> atau <i>"bookingkan A-12 untuk Kopi Satu"</i>. Kata perintah seperti MENU dan TERSEDIA tetap berjalan. Booking dan invoice tetap baru disimpan setelah staf membalas <b>YA</b>; agen tidak bisa memberi diskon atau mengubah status pembayaran.
      </p>

      {/* Status */}
      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">API key Gemini</div>
          {configured ? (
            <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><ShieldCheck size={15} /> Tersimpan <span className="font-mono text-xs text-slate-500">({gemini.hint})</span></div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-500"><KeyRound size={15} /> Belum diisi</div>
          )}
          {gemini?.updatedBy && <div className="text-[11px] text-slate-500 mt-1">Diubah oleh {gemini.updatedBy}</div>}
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Agen</div>
          <div className={`text-sm font-bold ${agentState.tone}`}>{agentState.text}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Model</div>
          <div className="text-xs font-mono text-slate-700 truncate" title={gemini?.model}>{gemini?.model || defaultModel}</div>
        </div>
      </div>

      {/* API key */}
      {locked ? (
        <div className="px-3 py-2 rounded-xl border text-xs font-semibold bg-amber-50 border-amber-200 text-amber-800">
          API key Gemini diatur dari environment server (misalnya Variables di Railway), sehingga tidak dapat diganti atau dihapus dari halaman ini.
        </div>
      ) : (
        <form onSubmit={saveKey} className="space-y-2" autoComplete="off">
          <label htmlFor="gemini-key" className="block text-xs font-bold text-slate-700">{configured ? 'Ganti API key Gemini' : 'API key Gemini'}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 flex items-center bg-white border border-slate-200 rounded-xl px-3 focus-within:border-emerald-400">
              <KeyRound size={14} className="text-slate-400 shrink-0" />
              <input id="gemini-key" type={showKey ? 'text' : 'password'} name="gemini-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? `Tersimpan (${gemini.hint}). Isi hanya untuk mengganti.` : 'Tempel API key dari Google AI Studio (diawali AQ. atau AIza)'}
                autoComplete="new-password" spellCheck={false}
                className="flex-1 min-w-0 bg-transparent px-2 py-2.5 text-xs font-mono text-slate-800 placeholder:text-slate-500 focus:outline-none" />
              <button type="button" onClick={() => setShowKey(v => !v)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button type="submit" disabled={Boolean(busy) || !apiKey.trim()} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0 transition-transform">
              {busy === 'key' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {busy === 'key' ? 'Mengecek ke Google...' : 'Simpan'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Ambil key di{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold underline underline-offset-2">
              Google AI Studio <ExternalLink size={11} />
            </a>
            : login akun Google, klik <b>Create API key</b>, salin key-nya, lalu tempel di sini. Key dicek ke Google dulu; key yang ditolak tidak disimpan. Setelah tersimpan, key tidak pernah ditampilkan lagi.
          </p>
        </form>
      )}

      {notice && <div role="status" className={`px-3 py-2 rounded-xl border text-xs font-semibold ${noticeStyle[notice.type]}`}>{notice.text}</div>}

      {configured && (
        <>
          {/* Model and on / off */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label htmlFor="gemini-model" className="block text-xs font-bold text-slate-700 mb-1">Model</label>
              <select id="gemini-model" value={gemini.model} disabled={Boolean(busy)}
                onChange={(e) => run('model', () => api.waSettings('PUT', '/gemini', { model: e.target.value }), 'Model Gemini diganti.')}
                className={`${input} cursor-pointer disabled:opacity-60`}>
                {modelOptions.map(m => <option key={m.id} value={m.id}>{`${m.name} (${m.id})`}</option>)}
              </select>
              {modelsError ? <p className="text-[11px] text-amber-700 mt-1">{modelsError}</p>
                : <p className="text-[11px] text-slate-500 mt-1">Kalau agen lambat, tidak menjawab, atau kuotanya habis, pilih model lain lalu coba lagi di chat di bawah. Model "lite" paling hemat kuota.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)}
                onClick={() => run('toggle', () => api.waSettings('PUT', '/gemini', { enabled: !gemini.enabled }), gemini.enabled ? 'Agen Gemini dimatikan. Staf tetap bisa memakai kata perintah.' : 'Agen Gemini diaktifkan.')}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform ${gemini.enabled ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700' : 'bg-emerald-600 border-emerald-600 hover:bg-emerald-700 text-white'}`}>
                {busy === 'toggle' ? <RefreshCw size={13} className="animate-spin" /> : <Power size={13} />} {gemini.enabled ? 'Matikan agen' : 'Aktifkan agen'}
              </button>
              {!locked && (
                <button type="button" disabled={Boolean(busy)}
                  onClick={() => window.confirm('Hapus API key Gemini dari server? Pertanyaan bebas tidak dijawab lagi; kata perintah tetap berjalan.') && run('delete', () => api.waSettings('DELETE', '/gemini'), 'API key Gemini dihapus.')}
                  className="px-3 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                  <Trash2 size={13} /> Hapus key
                </button>
              )}
            </div>
          </div>

        </>
      )}

      {/* The assistant on this page: the same answers, booking and invoice as on WhatsApp */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700">Chat dengan {assistant?.call || 'asisten'}</div>
        <p className="text-[11px] text-slate-500 leading-relaxed max-w-[75ch]">
          Sama seperti di WhatsApp: tanya data, minta booking, atau minta invoice. Booking dan invoice baru disimpan setelah Anda membalas <b>YA</b>, tercatat atas nama Anda di Log Aktivitas.{!configured && ' Tanpa API key Gemini, asisten hanya mengerti kata perintah (ketik MENU).'}
        </p>
        <div ref={logRef} className="h-80 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2" aria-live="polite">
          {!chat.length && (
            <div className="h-full flex items-center justify-center text-center text-[11px] text-slate-500 px-6 leading-relaxed">
              Contoh: "booth 3x3 yang kosong apa saja?", "bookingkan A-12 untuk Teh Dua, PIC Rina 081234567890, F&amp;B, DP 30", atau "buatkan invoice booth A-12".
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              {m.invoiceId ? (
                <button type="button" disabled={Boolean(busy)} onClick={() => downloadPdf(m)}
                  className="px-3 py-2 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform">
                  {busy === 'pdf' ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />} Download PDF {m.invoiceNumber}
                </button>
              ) : (
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${m.from === 'me' ? 'bg-emerald-600 text-white rounded-br-sm' : m.error ? 'bg-rose-50 border border-rose-200 text-rose-800 rounded-bl-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                  {m.from === 'me' ? m.text : rich(m.text)}
                </div>
              )}
            </div>
          ))}
          {busy === 'chat' && <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><RefreshCw size={12} className="animate-spin" /> {assistant?.name || 'Asisten'} sedang menjawab…</div>}
        </div>
        {awaitingYes && !busy && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => send('YA')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-transform">
              <Check size={14} /> Ya, simpan
            </button>
            <button type="button" onClick={() => send('BATAL')} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 active:scale-[0.98] text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-transform">
              <X size={14} /> Batal
            </button>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(message); }} className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="assistant-message" className="sr-only">Pesan untuk asisten</label>
          <input id="assistant-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} className={input} autoComplete="off"
            placeholder="Tulis pesan, misalnya: bookingkan A-12 untuk Teh Dua" />
          <button type="submit" disabled={Boolean(busy) || !message.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0 transition-transform">
            {busy === 'chat' ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />} Kirim
          </button>
        </form>
      </div>

      <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-800 leading-relaxed">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>Paket gratis Gemini boleh dipakai Google untuk meningkatkan produknya, termasuk isi obrolan (nama tenant, nomor PIC). Agar data tidak dipakai, aktifkan billing (paket berbayar) di project Google yang memiliki API key ini.</span>
      </div>
    </div>
  );
}
