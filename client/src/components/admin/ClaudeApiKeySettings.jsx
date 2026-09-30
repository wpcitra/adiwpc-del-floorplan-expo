import React, { useState, useEffect } from 'react';
import { Bot, KeyRound, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, Trash2, Eye, EyeOff, Save, Cpu, Wallet } from 'lucide-react';
import { api } from '../../services/api';

// Setting > Integrasi AI (Claude): the Super Admin enters the Claude API key (AGENTS.md §23).
// The key is WRITE-ONLY: it is sent once to the server, verified against Anthropic, stored in server/.env and never
// shown again. The page only ever receives "configured" + the last 4 characters.

// SQLite / ISO timestamps to local time
const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return isNaN(d) ? value : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Model (from GET /v1/models), monthly budget and price estimates of the AI agent (AGENTS.md §27)
function AiModelBudgetSettings() {
  const [data, setData] = useState(null);
  const [models, setModels] = useState([]);
  const [modelError, setModelError] = useState('');
  const [form, setForm] = useState({ model: '', monthlyBudgetUsd: '', priceInputPerMTok: '', priceOutputPerMTok: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    const [cfg, list] = await Promise.all([api.fetchAiConfig(), api.fetchAiModels()]);
    if (cfg.success) {
      setData(cfg);
      setForm({
        model: cfg.config.model || '',
        monthlyBudgetUsd: String(cfg.config.monthlyBudgetUsd ?? ''),
        priceInputPerMTok: cfg.config.priceInputPerMTok ?? '',
        priceOutputPerMTok: cfg.config.priceOutputPerMTok ?? ''
      });
    }
    if (list.success) { setModels(list.models || []); setModelError(''); } else setModelError(list.error || 'Daftar model tidak dapat diambil');
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    const res = await api.saveAiConfig(form);
    setBusy(false);
    if (res.success) { setData(res); setNotice({ type: 'success', text: 'Pengaturan AI disimpan.' }); } else setNotice({ type: 'error', text: res.error || 'Gagal menyimpan' });
  };

  const usage = data?.usage;
  const input = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-violet-400';
  return (
    <div className="p-4 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Cpu size={16} className="text-violet-600" /> Model &amp; Batas Biaya AI Agent</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Model Claude</label>
          <select value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))} className={input}>
            <option value="">— Pilih model —</option>
            {form.model && !models.some(m => m.id === form.model) && <option value={form.model}>{form.model}</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">{modelError || 'Daftar diambil langsung dari Anthropic (/v1/models) untuk API key ini.'}</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Batas biaya per bulan (USD)</label>
          <input type="text" inputMode="decimal" value={form.monthlyBudgetUsd} onChange={(e) => setForm(f => ({ ...f, monthlyBudgetUsd: e.target.value }))} className={input} placeholder="10" />
          <p className="text-[11px] text-slate-500 mt-1">Agent berhenti memanggil Claude saat batas tercapai; peringatan muncul di chat pada 80%.</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Harga input per 1 juta token (USD, opsional)</label>
          <input type="text" inputMode="decimal" value={form.priceInputPerMTok} onChange={(e) => setForm(f => ({ ...f, priceInputPerMTok: e.target.value }))} className={input} placeholder={data?.price ? String(data.price.input) : ''} />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Harga output per 1 juta token (USD, opsional)</label>
          <input type="text" inputMode="decimal" value={form.priceOutputPerMTok} onChange={(e) => setForm(f => ({ ...f, priceOutputPerMTok: e.target.value }))} className={input} placeholder={data?.price ? String(data.price.output) : ''} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Biaya dihitung sebagai <b>perkiraan</b> dari jumlah token × harga di atas (kosong = harga umum per jenis model). Cocokkan dengan harga resmi di anthropic.com/pricing; tagihan sebenarnya ada di console.anthropic.com.
      </p>
      {usage && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border ${usage.exhausted ? 'bg-rose-50 border-rose-200 text-rose-700' : usage.warning ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
          <Wallet size={14} /> Terpakai bulan ini ± USD {Number(usage.monthCostUsd || 0).toFixed(3)} dari batas USD {Number(usage.budgetUsd || 0).toFixed(2)} ({usage.monthCalls} panggilan)
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer">
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Simpan Pengaturan AI
        </button>
        {notice && <span className={`text-xs font-semibold ${notice.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</span>}
      </div>
    </div>
  );
}

export default function ClaudeApiKeySettings() {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'warning' | 'error', text }

  const load = async () => {
    const res = await api.fetchClaudeKeyStatus();
    if (res.success) { setStatus(res.status); setLoadError(''); } else setLoadError(res.error || 'Gagal memuat status API key');
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const value = keyInput.trim();
    if (!/^sk-ant-/.test(value)) {
      setNotice({ type: 'error', text: 'API key Claude diawali "sk-ant-". Salin dari console.anthropic.com → API Keys.' });
      return;
    }
    setBusy('save');
    setNotice(null);
    const res = await api.saveClaudeKey(value);
    setBusy('');
    if (res.success) {
      setKeyInput('');
      setShowKey(false);
      setStatus(res.status);
      setNotice(res.warning ? { type: 'warning', text: res.warning } : { type: 'success', text: 'API key tersimpan dan terhubung ke Claude API.' });
    } else {
      setNotice({ type: 'error', text: res.error || 'API key gagal disimpan' });
    }
  };

  const test = async () => {
    setBusy('test');
    setNotice(null);
    const res = await api.testClaudeKey();
    setBusy('');
    if (res.status) setStatus(res.status);
    setNotice({ type: res.ok ? 'success' : 'error', text: res.message || res.error || 'Uji koneksi gagal' });
  };

  const remove = async () => {
    if (!window.confirm('Hapus API key Claude dari server? Analisis error dengan AI berhenti sampai key baru diisi.')) return;
    setBusy('delete');
    setNotice(null);
    const res = await api.deleteClaudeKey();
    setBusy('');
    if (res.success) {
      setStatus(res.status);
      setNotice({ type: 'success', text: 'API key dihapus dari server.' });
    } else {
      setNotice({ type: 'error', text: res.error || 'API key gagal dihapus' });
    }
  };

  const noticeStyle = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-rose-50 border-rose-200 text-rose-700'
  };
  const lockedByEnvironment = status?.source === 'environment';
  const lastCheck = status?.lastCheck;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fadeIn">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <Bot className="text-violet-600" size={20} />
        <h2 className="text-base font-bold text-slate-900">Integrasi AI: Claude API (Pusat Maintenance)</h2>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        API key dipakai server untuk menganalisis error website dengan Claude. Key hanya disimpan di server (file <code className="bg-slate-100 px-1 py-0.5 rounded">server/.env</code>),
        tidak masuk database maupun Git, dan <b>tidak pernah ditampilkan lagi</b> setelah disimpan. Buat key di{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-violet-700 font-semibold underline">console.anthropic.com</a>.
      </p>

      {loadError && <div className="px-3 py-2 rounded-xl border text-xs font-semibold bg-rose-50 border-rose-200 text-rose-700">{loadError}</div>}

      {/* Current status */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</div>
          {!status ? (
            <div className="text-xs text-slate-400">Memuat...</div>
          ) : status.configured ? (
            <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><ShieldCheck size={16} /> Tersimpan <span className="font-mono text-xs text-slate-500">({status.hint})</span></div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-500"><KeyRound size={16} /> Belum diisi</div>
          )}
          {status?.updatedAt && <div className="text-[11px] text-slate-500 mt-1">Diubah {formatDateTime(status.updatedAt)}{status.updatedBy ? ` oleh ${status.updatedBy}` : ''}</div>}
        </div>
        <div className="sm:col-span-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Uji koneksi terakhir</div>
          {lastCheck ? (
            <div className={`flex items-start gap-1.5 text-xs font-semibold ${lastCheck.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {lastCheck.ok ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
              <span>{lastCheck.message} <span className="font-normal text-slate-500">· {formatDateTime(lastCheck.at)}</span></span>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Belum pernah diuji</div>
          )}
          {status?.configured && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={test} disabled={Boolean(busy)} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                <RefreshCw size={13} className={busy === 'test' ? 'animate-spin' : ''} /> Uji Koneksi
              </button>
              {!lockedByEnvironment && (
                <button type="button" onClick={remove} disabled={Boolean(busy)} className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                  <Trash2 size={13} /> Hapus Key
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {lockedByEnvironment ? (
        <div className="px-3 py-2 rounded-xl border text-xs font-semibold bg-amber-50 border-amber-200 text-amber-800">
          API key saat ini diatur dari environment server (di luar aplikasi), sehingga tidak dapat diganti atau dihapus dari halaman ini.
        </div>
      ) : (
        <form onSubmit={save} className="space-y-2" autoComplete="off">
          <label className="block text-xs font-bold text-slate-700">{status?.configured ? 'Ganti API key' : 'Isi API key'}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-xl px-3 focus-within:border-violet-400">
              <KeyRound size={14} className="text-slate-400 shrink-0" />
              <input
                type={showKey ? 'text' : 'password'}
                name="claude-api-key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="new-password"
                spellCheck={false}
                className="flex-1 bg-transparent px-2 py-2.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <button type="button" onClick={() => setShowKey(v => !v)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label={showKey ? 'Sembunyikan key' : 'Tampilkan key'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button type="submit" disabled={!keyInput.trim() || Boolean(busy)} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {busy === 'save' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{busy === 'save' ? 'Menguji key...' : 'Uji & Simpan'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Key diuji ke Anthropic sebelum disimpan. Key yang ditolak tidak akan disimpan. Setiap penyimpanan, pengujian, dan penghapusan tercatat di menu Audit tanpa nilai key.
          </p>
        </form>
      )}

      {notice && <div className={`px-3 py-2 rounded-xl border text-xs font-semibold ${noticeStyle[notice.type]}`}>{notice.text}</div>}

      {status?.configured && <AiModelBudgetSettings key={status.hint} />}
    </div>
  );
}
