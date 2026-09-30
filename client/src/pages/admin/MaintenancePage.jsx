import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Search, RefreshCw, X, Server, Globe, AlertOctagon, AlertTriangle, Info, CheckCircle2, EyeOff, RotateCcw, Wrench, Users, Clock } from 'lucide-react';
import { api } from '../../services/api';
import AgentChat from '../../components/admin/agent/AgentChat';

// Pusat Maintenance (AGENTS.md §22): errors of the website, grouped and prioritized. Only Developer / Super Admin.
// Error messages and stacks are shown as plain text (data from the website, never instructions).

const PRIORITY_STYLES = {
  KRITIS: { badge: 'bg-rose-600 text-white border-rose-600', card: 'border-rose-200 bg-rose-50 text-rose-700', icon: AlertOctagon },
  TINGGI: { badge: 'bg-amber-100 text-amber-800 border-amber-300', card: 'border-amber-200 bg-amber-50 text-amber-700', icon: AlertTriangle },
  NORMAL: { badge: 'bg-slate-100 text-slate-600 border-slate-200', card: 'border-slate-200 bg-white text-slate-600', icon: Info }
};
const STATUS_LABELS = { baru: 'Baru', ditangani: 'Sedang Ditangani', selesai: 'Selesai', diabaikan: 'Diabaikan' };
const STATUS_STYLES = {
  baru: 'bg-rose-50 text-rose-700 border-rose-200',
  ditangani: 'bg-sky-50 text-sky-700 border-sky-200',
  selesai: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  diabaikan: 'bg-slate-100 text-slate-500 border-slate-200'
};
const TABS = [
  { key: 'aktif', label: 'Aktif' },
  { key: 'baru', label: 'Baru' },
  { key: 'ditangani', label: 'Ditangani' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'diabaikan', label: 'Diabaikan' },
  { key: 'semua', label: 'Semua' }
];
const REFRESH_MS = 30000;

// SQLite CURRENT_TIMESTAMP is UTC without a timezone suffix
const toDate = (value) => (value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`) : null);
const formatDateTime = (value) => {
  const d = toDate(value);
  return !d || isNaN(d) ? '-' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const timeAgo = (value) => {
  const d = toDate(value);
  if (!d || isNaN(d)) return '-';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};

const PriorityBadge = ({ priority }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide border ${PRIORITY_STYLES[priority]?.badge || PRIORITY_STYLES.NORMAL.badge}`}>{priority}</span>
);
const StatusBadge = ({ status }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${STATUS_STYLES[status] || STATUS_STYLES.baru}`}>{STATUS_LABELS[status] || status}</span>
);
const SourceIcon = ({ source }) => (source === 'browser'
  ? <Globe size={13} className="text-violet-500 shrink-0" title="Browser pengunjung / admin" />
  : <Server size={13} className="text-slate-500 shrink-0" title="Server" />);

function ErrorDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await api.fetchMaintenanceError(id);
    setData(res);
  }, [id]);
  useEffect(() => { setData(null); setNote(''); setMessage(''); load(); }, [load]);

  const changeStatus = async (status) => {
    setBusy(true);
    const res = await api.setMaintenanceErrorStatus(id, status, note);
    setBusy(false);
    if (res.success) {
      setMessage(`Status diubah menjadi "${STATUS_LABELS[status]}".`);
      setNote('');
      load();
      onChanged();
    } else {
      setMessage(res.error || 'Gagal mengubah status');
    }
  };

  const err = data?.error && typeof data.error === 'object' ? data.error : null;
  const maxDaily = Math.max(1, ...(data?.daily || []).map(d => d.c));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col animate-fadeIn">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            {err && <PriorityBadge priority={err.priority} />}
            {err && <StatusBadge status={err.status} />}
            <span className="font-mono text-xs text-slate-500 truncate">{id}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!data ? (
            <div className="text-xs text-slate-400 py-10 text-center">Memuat detail error...</div>
          ) : !err ? (
            <div className="text-xs text-rose-600 py-10 text-center">{data.error || 'Error tidak ditemukan'}</div>
          ) : (
            <>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{err.feature || 'Lainnya'} · {err.errorType}</div>
                <div className="text-sm font-semibold text-slate-900 whitespace-pre-wrap break-words">{err.message}</div>
                {err.source === 'browser' && (
                  <p className="mt-1.5 text-[11px] text-violet-600">Laporan dari browser: dikirim otomatis oleh halaman website, belum diverifikasi di server.</p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[10px] text-slate-500 font-bold uppercase">Kejadian</div><div className="text-lg font-bold text-slate-900">{err.occurrences}</div></div>
                <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[10px] text-slate-500 font-bold uppercase">Pengguna</div><div className="text-lg font-bold text-slate-900">{err.affectedUsers}</div></div>
                <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[10px] text-slate-500 font-bold uppercase">Pertama</div><div className="text-xs font-semibold text-slate-800">{formatDateTime(err.firstSeenAt)}</div></div>
                <div className="rounded-xl border border-slate-200 p-2.5"><div className="text-[10px] text-slate-500 font-bold uppercase">Terakhir</div><div className="text-xs font-semibold text-slate-800">{formatDateTime(err.lastSeenAt)}</div></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><span className="text-slate-500">Sumber:</span> <span className="font-semibold text-slate-800">{err.source === 'browser' ? 'Browser' : 'Server'}</span></div>
                <div><span className="text-slate-500">Halaman / endpoint:</span> <span className="font-mono text-slate-800 break-all">{err.area || '-'}</span></div>
                <div className="sm:col-span-2"><span className="text-slate-500">Lokasi kode:</span> <span className="font-mono text-slate-800 break-all">{err.location || '-'}</span></div>
                <div><span className="text-slate-500">Versi:</span> <span className="font-mono text-slate-800">{err.appVersion || '-'}</span> <span className="text-slate-400">({err.environment || '-'})</span></div>
                <div><span className="text-slate-500">Muncul lagi setelah selesai:</span> <span className="font-semibold text-slate-800">{err.reopenedCount}x</span></div>
                {err.statusBy && (
                  <div className="sm:col-span-2"><span className="text-slate-500">Status terakhir:</span> <span className="font-semibold text-slate-800">{STATUS_LABELS[err.status]}</span> oleh {err.statusBy} · {formatDateTime(err.statusAt)}{err.statusNote ? ` · "${err.statusNote}"` : ''}</div>
                )}
              </div>

              {data.daily?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Kejadian 14 hari terakhir</div>
                  <div className="flex items-end gap-1 h-16 border-b border-slate-200">
                    {data.daily.map(d => (
                      <div key={d.day} className="flex-1 min-w-[10px] max-w-[28px] bg-rose-400/80 rounded-t" style={{ height: `${Math.max(8, (d.c / maxDaily) * 100)}%` }} title={`${d.day}: ${d.c} kejadian`} />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Stack trace (data pribadi sudah disamarkan)</div>
                <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 text-[11px] leading-relaxed overflow-x-auto max-h-72 whitespace-pre">{err.stack || 'Tidak ada stack trace (error dari respons server).'}</pre>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Kejadian terbaru</div>
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold">
                      <tr><th className="px-2.5 py-2">Waktu</th><th className="px-2.5 py-2">Pengguna</th><th className="px-2.5 py-2">Halaman / endpoint</th><th className="px-2.5 py-2">Browser</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.events.map(e => (
                        <tr key={e.id}>
                          <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-600">{formatDateTime(e.occurredAt)}</td>
                          <td className="px-2.5 py-1.5 font-mono text-slate-700">{e.userRef || '-'}{e.userRole ? <span className="font-sans text-slate-400"> ({e.userRole})</span> : ''}</td>
                          <td className="px-2.5 py-1.5 font-mono text-slate-700 break-all">{e.method ? `${e.method} ` : ''}{e.url}{e.statusCode ? ` → ${e.statusCode}` : ''}</td>
                          <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{e.browser}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Pengguna ditampilkan sebagai kode samaran (U- = staf login, V- = pengunjung). Nama, email, dan IP tidak pernah disimpan.</p>
              </div>
            </>
          )}
        </div>

        {err && (
          <div className="border-t border-slate-200 px-5 py-3.5 space-y-2 bg-slate-50/60">
            {message && <div className="text-xs font-semibold text-slate-700">{message}</div>}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Catatan (opsional), mis. penyebab atau rencana perbaikan"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-slate-400"
            />
            <div className="flex flex-wrap gap-2">
              {err.status !== 'ditangani' && err.status !== 'selesai' && (
                <button disabled={busy} onClick={() => changeStatus('ditangani')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50"><Wrench size={13} /> Sedang Ditangani</button>
              )}
              {err.status !== 'selesai' && (
                <button disabled={busy} onClick={() => changeStatus('selesai')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"><CheckCircle2 size={13} /> Tandai Selesai</button>
              )}
              {err.status !== 'diabaikan' && (
                <button disabled={busy} onClick={() => changeStatus('diabaikan')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-50"><EyeOff size={13} /> Abaikan</button>
              )}
              {(err.status === 'selesai' || err.status === 'diabaikan') && (
                <button disabled={busy} onClick={() => changeStatus('baru')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-50"><RotateCcw size={13} /> Buka Kembali</button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Error yang ditandai Selesai otomatis terbuka lagi bila muncul kembali. Setiap perubahan status tercatat di menu Audit.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'aktif', priority: 'all', source: 'all', q: '' });
  const selectedId = searchParams.get('error');
  // "Error Website" (list) or "Chat Agent AI" (?tab=chat)
  const view = searchParams.get('tab') === 'chat' ? 'chat' : 'errors';
  const setView = (v) => setSearchParams(v === 'chat' ? { tab: 'chat' } : {});

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const openError = (id) => setSearchParams(id ? { error: id } : {});

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await api.fetchMaintenanceErrors(filters);
    setErrors(res.errors || []);
    setSummary(res.summary || null);
    setLoadError(res.error || '');
    setIsLoading(false);
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const controlClass = 'bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none shadow-2xs';
  const open = summary?.open || { KRITIS: 0, TINGGI: 0, NORMAL: 0 };
  const counts = summary?.counts || {};
  const tabCount = (key) => (key === 'aktif' ? (counts.baru || 0) + (counts.ditangani || 0)
    : key === 'semua' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[key] || 0);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-1 flex items-center gap-2"><Activity size={22} className="text-sky-600" /> Pusat Maintenance</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Error website yang tercatat otomatis dari server dan browser, dikelompokkan dan diurutkan menurut prioritas.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <div className="flex bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            {[['errors', 'Error Website'], ['chat', 'Chat Agent AI']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${view === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          {view === 'errors' && (
            <button onClick={load} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
        </div>
      </div>

      {view === 'chat' ? <AgentChat /> : (<>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {['KRITIS', 'TINGGI', 'NORMAL'].map(p => {
          const Icon = PRIORITY_STYLES[p].icon;
          return (
            <button
              key={p}
              onClick={() => setFilters(prev => ({ ...prev, status: 'aktif', priority: prev.priority === p ? 'all' : p }))}
              className={`text-left rounded-2xl border p-3.5 shadow-2xs transition-all ${PRIORITY_STYLES[p].card} ${filters.priority === p ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide"><Icon size={14} /> {p}</div>
              <div className="text-2xl font-bold mt-1">{open[p] || 0}</div>
              <div className="text-[11px] opacity-80">error aktif</div>
            </button>
          );
        })}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-slate-600"><Clock size={14} /> 24 JAM</div>
          <div className="text-2xl font-bold mt-1 text-slate-900">{summary?.last24h ?? 0}</div>
          <div className="text-[11px] text-slate-500">kejadian error</div>
        </div>
      </div>

      {/* Tabs & filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter('status', t.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${filters.status === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {t.label} <span className={filters.status === t.key ? 'text-slate-300' : 'text-slate-400'}>{tabCount(t.key)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input type="text" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Cari pesan, halaman, fitur, ID..." className="bg-transparent text-xs text-slate-800 focus:outline-none w-56" />
        </div>
        <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className={controlClass}>
          <option value="all">Semua Prioritas</option>
          <option value="KRITIS">KRITIS</option>
          <option value="TINGGI">TINGGI</option>
          <option value="NORMAL">NORMAL</option>
        </select>
        <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className={controlClass}>
          <option value="all">Server & Browser</option>
          <option value="server">Server</option>
          <option value="browser">Browser</option>
        </select>
      </div>

      {loadError && <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{loadError}</div>}

      {/* Error list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-3.5 py-3">Prioritas</th>
                <th className="px-3.5 py-3">Error</th>
                <th className="px-3.5 py-3">Fitur</th>
                <th className="px-3.5 py-3 text-right">Kejadian</th>
                <th className="px-3.5 py-3 text-right">Pengguna</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Terakhir</th>
                <th className="px-3.5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && errors.length === 0 ? (
                <tr><td colSpan={7} className="px-3.5 py-10 text-center text-xs text-slate-400">Memuat daftar error...</td></tr>
              ) : errors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-12 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                    <div className="text-xs text-slate-500">Tidak ada error pada filter ini.</div>
                  </td>
                </tr>
              ) : errors.map(e => (
                <tr key={e.id} onClick={() => openError(e.id)} className={`cursor-pointer transition-colors hover:bg-slate-50 ${e.priority === 'KRITIS' && e.status === 'baru' ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-3.5 py-3"><PriorityBadge priority={e.priority} /></td>
                  <td className="px-3.5 py-3 max-w-[420px]">
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={e.source} />
                      <div className="text-xs font-semibold text-slate-900 truncate" title={e.message}>{e.message}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5" title={e.location || e.area}>{e.id} · {e.location || e.area || '-'}</div>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-slate-700">
                    <div className="font-semibold whitespace-nowrap">{e.feature || '-'}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]" title={e.area}>{e.area}</div>
                  </td>
                  <td className="px-3.5 py-3 text-xs font-bold text-slate-900 text-right">{e.occurrences}{e.reopenedCount > 0 && <div className="text-[10px] font-semibold text-rose-600">muncul lagi {e.reopenedCount}x</div>}</td>
                  <td className="px-3.5 py-3 text-xs text-slate-700 text-right"><span className="inline-flex items-center gap-1"><Users size={11} className="text-slate-400" />{e.affectedUsers}</span></td>
                  <td className="px-3.5 py-3 text-xs text-slate-600 whitespace-nowrap" title={formatDateTime(e.lastSeenAt)}>{timeAgo(e.lastSeenAt)}</td>
                  <td className="px-3.5 py-3"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        Data pribadi (password, token, API key, email, nomor telepon, NPWP) disamarkan sebelum disimpan. Error KRITIS dan TINGGI yang baru atau muncul lagi dikirim ke notifikasi Developer & Super Admin. Daftar diperbarui otomatis setiap 30 detik.
      </p>

      {selectedId && <ErrorDetail id={selectedId} onClose={() => openError(null)} onChanged={load} />}
      </>)}
    </div>
  );
}
