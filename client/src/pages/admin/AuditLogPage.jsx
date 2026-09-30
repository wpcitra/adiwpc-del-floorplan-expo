import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ScrollText, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { ROLE_LABELS } from '../../utils/roles';

const CATEGORY_STYLES = {
  Keamanan: 'bg-rose-50 text-rose-700 border-rose-200',
  Invoice: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Booking: 'bg-amber-50 text-amber-700 border-amber-200',
  Booth: 'bg-amber-50 text-amber-700 border-amber-200',
  Floorplan: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  User: 'bg-violet-50 text-violet-700 border-violet-200',
  Pengaturan: 'bg-slate-100 text-slate-700 border-slate-200',
  Fasilitas: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Operasional: 'bg-orange-50 text-orange-700 border-orange-200'
};

// SQLite CURRENT_TIMESTAMP is UTC without a timezone suffix
const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return isNaN(d) ? value : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const isSecurityWarning = (log) => log.action === 'Login gagal' || log.action === 'Akses ditolak';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({ userId: 'all', category: 'all', search: '', from: '', to: '' });

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    const res = await api.fetchAuditLogs({ ...filters, limit: 500 });
    setLogs(res.logs || []);
    setCategories(res.categories || []);
    setIsLoading(false);
  }, [filters]);

  useEffect(() => {
    api.fetchUsers().then(setUsers);
  }, []);

  // Debounce so typing in the search box does not fire a request per keystroke
  useEffect(() => {
    const timer = setTimeout(loadLogs, 300);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  const warningCount = logs.filter(isSecurityWarning).length;
  const controlClass = 'bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none shadow-2xs';

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-1">Log Audit Aktivitas</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Jejak siapa mengubah apa dan kapan: login, status pembayaran, booking, denah, user, dan pengaturan.
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="self-start lg:self-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Cari aksi, target, user..."
            className="bg-transparent text-xs text-slate-800 focus:outline-none w-52"
          />
        </div>
        <select value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} className={controlClass}>
          <option value="all">Semua User</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] || u.role})</option>)}
        </select>
        <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)} className={controlClass}>
          <option value="all">Semua Kategori</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={controlClass} title="Dari tanggal" />
          <span className="text-xs text-slate-400">s/d</span>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={controlClass} title="Sampai tanggal" />
        </div>
        {warningCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold">
            <ShieldAlert size={13} /> {warningCount} login gagal / akses ditolak
          </span>
        )}
      </div>

      {/* Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-3.5 py-3 w-6"></th>
                <th className="px-3.5 py-3 whitespace-nowrap">Waktu</th>
                <th className="px-3.5 py-3">User</th>
                <th className="px-3.5 py-3">Aksi</th>
                <th className="px-3.5 py-3">Target</th>
                <th className="px-3.5 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && logs.length === 0 ? (
                <tr><td colSpan={6} className="px-3.5 py-10 text-center text-xs text-slate-400">Memuat log audit...</td></tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center">
                    <ScrollText size={28} className="mx-auto text-slate-300 mb-2" />
                    <div className="text-xs text-slate-500">Belum ada aktivitas yang cocok dengan filter.</div>
                  </td>
                </tr>
              ) : logs.map(log => {
                const isExpanded = expandedId === log.id;
                const hasDetails = Boolean(log.details || log.ip || log.path);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`transition-colors ${hasDetails ? 'cursor-pointer' : ''} ${isSecurityWarning(log) ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50/60'}`}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : log.id)}
                    >
                      <td className="px-3.5 py-3 text-slate-400">
                        {hasDetails && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      </td>
                      <td className="px-3.5 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="px-3.5 py-3">
                        <div className="text-xs font-bold text-slate-900 truncate max-w-[180px]">{log.userName}</div>
                        <div className="text-[11px] text-slate-500">{ROLE_LABELS[log.userRole] || log.userRole || '-'}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border mb-1 ${CATEGORY_STYLES[log.category] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {log.category}
                        </span>
                        <div className="text-xs font-semibold text-slate-800">{log.action}</div>
                      </td>
                      <td className="px-3.5 py-3 text-xs text-slate-700 max-w-[260px]"><div className="truncate" title={log.target}>{log.target || '-'}</div></td>
                      <td className="px-3.5 py-3 text-xs text-slate-600 max-w-[260px]"><div className="truncate" title={log.summary}>{log.summary || '-'}</div></td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td></td>
                        <td colSpan={5} className="px-3.5 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                            <div><span className="font-bold text-slate-500">IP:</span> <span className="font-mono text-slate-700">{log.ip || '-'}</span></div>
                            <div className="md:col-span-2"><span className="font-bold text-slate-500">Endpoint:</span> <span className="font-mono text-slate-700">{log.method ? `${log.method} ${log.path}` : '-'}</span></div>
                          </div>
                          {log.details && (
                            <pre className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 overflow-x-auto">{JSON.stringify(log.details, null, 2)}</pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Menampilkan maksimal 500 aktivitas terbaru sesuai filter. Klik baris untuk melihat detail.</p>
    </div>
  );
}
