import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  DollarSign, Users, CheckCircle2, TrendingUp, Gift, Layers,
  RefreshCw, Sparkles, Building2, PieChart as PieChartIcon,
  FolderKanban, ArrowRight, LayoutGrid, Search,
  Tag, Percent, Store, Edit, CheckCircle, Clock3, CircleDot, ChevronDown,
  ChevronRight, Folder, FolderOpen, Globe, Calendar, MapPin, X, ArrowUpRight,
  BarChart2, AlertTriangle
} from 'lucide-react';
import { api } from '../../services/api';
import { getProjectDateInfo, currentYearWIB } from '../../components/admin/ProjectYearFolderSelector';
import { collapseMergedRows } from '../../utils/mergeRows';

const WIB = 'Asia/Jakarta';
function fmtRupiah(n) {
  if (!n || isNaN(n)) return 'Rp 0';
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}
function fmtDate(raw) {
  if (!raw) return '—';
  try {
    const d = new Date(String(raw).includes('T') ? raw : `${String(raw).replace(' ', 'T')}Z`);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

// ── DashboardProjectPicker ────────────────────────────────────────────────────
function DashboardProjectPicker({ floorplanList, selection, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openYears, setOpenYears] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dash_picker_years') || '{}'); } catch { return {}; }
  });
  const ref = useRef(null);

  useEffect(() => {
    const cur = currentYearWIB();
    setOpenYears(prev => prev[cur] !== undefined ? prev : { [cur]: true, ...prev });
  }, []);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const grouped = useMemo(() => {
    const groups = {};
    floorplanList.forEach(fp => {
      const { year } = getProjectDateInfo(fp);
      (groups[year] = groups[year] || []).push(fp);
    });
    const cur = currentYearWIB();
    if (!groups[cur]) groups[cur] = [];
    return Object.keys(groups)
      .sort((a, b) => { if (a === 'Tanpa Tahun') return 1; if (b === 'Tanpa Tahun') return -1; return Number(b) - Number(a); })
      .map(year => ({
        year,
        projects: groups[year]
          .filter(fp => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (fp.title||'').toLowerCase().includes(q)||(fp.venue||'').toLowerCase().includes(q)||(fp.event_title||'').toLowerCase().includes(q);
          })
          .sort((a, b) => getProjectDateInfo(b).timestamp - getProjectDateInfo(a).timestamp)
      }));
  }, [floorplanList, search]);

  const toggleYear = year => {
    setOpenYears(prev => {
      const next = { ...prev, [year]: !prev[year] };
      try { localStorage.setItem('dash_picker_years', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const breadcrumb = useMemo(() => {
    if (!selection || selection.type === 'all') return 'Semua Tahun (Global Overview)';
    if (selection.type === 'year') return `Tahun ${selection.year}`;
    const fp = floorplanList.find(f => f.id === selection.id);
    if (!fp) return selection.id;
    const { year, formattedDate } = getProjectDateInfo(fp);
    return `${year} › ${fp.title} (${formattedDate})`;
  }, [selection, floorplanList]);

  const select = val => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors cursor-pointer">
        <div className="flex items-center gap-2 min-w-0">
          {(!selection || selection.type === 'all') && <Globe size={14} className="text-slate-500 shrink-0" />}
          {selection?.type === 'year' && <Folder size={14} className="text-slate-500 shrink-0" />}
          {selection?.type === 'project' && <Building2 size={14} className="text-slate-500 shrink-0" />}
          <span className="truncate text-left">{breadcrumb}</span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari project / venue..."
                className="w-full pl-7 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"><X size={13} /></button>}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            <button type="button" onClick={() => select({ type: 'all' })}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-bold transition-colors cursor-pointer ${(!selection || selection.type === 'all') ? 'bg-blue-50 text-blue-800 border-l-2 border-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}>
              <Globe size={15} className="text-blue-600 shrink-0" />
              <span>🌐 Semua Tahun (Global Overview)</span>
              {(!selection || selection.type === 'all') && <CheckCircle size={13} className="ml-auto text-blue-600 shrink-0" />}
            </button>

            {grouped.map(({ year, projects }) => (
              <div key={year}>
                <div className="flex items-center">
                  <button type="button" onClick={() => toggleYear(year)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
                    {openYears[year] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {openYears[year] ? <FolderOpen size={13} className="text-amber-500" /> : <Folder size={13} className="text-amber-500" />}
                  </button>
                  <button type="button" onClick={() => select({ type: 'year', year })}
                    className={`flex-1 flex items-center justify-between gap-2 px-2 py-2 text-left transition-colors cursor-pointer ${selection?.type === 'year' && selection.year === year ? 'bg-amber-50 text-amber-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className="text-xs font-bold">📅 Tahun {year} <span className="text-[10px] font-normal text-slate-500">({projects.length} project)</span></span>
                    {selection?.type === 'year' && selection.year === year && <CheckCircle size={13} className="text-amber-600 shrink-0" />}
                  </button>
                </div>

                {openYears[year] && (
                  <div className="border-l-2 border-amber-200 ml-5 mb-1">
                    {projects.length === 0 && <div className="px-3 py-2 text-[11px] text-slate-400 italic">Tidak ada project</div>}
                    {projects.map(fp => {
                      const { formattedDate } = getProjectDateInfo(fp);
                      const isSel = selection?.type === 'project' && selection.id === fp.id;
                      return (
                        <button key={fp.id} type="button" onClick={() => select({ type: 'project', id: fp.id })}
                          className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${isSel ? 'bg-slate-100 border-l-2 border-slate-900 -ml-0.5' : 'hover:bg-slate-50'}`}>
                          <Building2 size={13} className={`mt-0.5 shrink-0 ${isSel ? 'text-slate-900' : 'text-slate-400'}`} />
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold truncate ${isSel ? 'text-slate-900' : 'text-slate-800'}`}>
                              {fp.status === 'published' && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded mr-1 font-bold">LIVE</span>}
                              {fp.title}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="flex items-center gap-0.5"><Calendar size={9} />{formattedDate}</span>
                              {fp.venue && fp.venue !== 'Jakarta Convention Center' && <span className="flex items-center gap-0.5 truncate max-w-[120px]"><MapPin size={9} />{fp.venue}</span>}
                              <span className="flex items-center gap-0.5"><Layers size={9} />{fp.totalBooths || 0} booth</span>
                            </div>
                          </div>
                          {isSel && <CheckCircle size={13} className="text-slate-900 shrink-0 mt-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {search && grouped.every(g => g.projects.length === 0) && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                <Search size={24} className="mx-auto mb-2 opacity-40" />
                Tidak ada project cocok dengan "{search}"
              </div>
            )}
          </div>

          <div className="px-3.5 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1.5">
            <Sparkles size={11} className="text-blue-500" />
            <span>{floorplanList.length} project tersedia · Klik untuk memilih cakupan</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── YearlySummaryTable ────────────────────────────────────────────────────────
function YearlySummaryTable({ year, floorplanList, onSelectProject }) {
  const projects = floorplanList
    .filter(fp => getProjectDateInfo(fp).year === year)
    .sort((a, b) => getProjectDateInfo(b).timestamp - getProjectDateInfo(a).timestamp);
  if (!projects.length) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="px-4 py-3 bg-slate-50/75 border-b border-slate-200 flex items-center gap-2">
        <FolderOpen size={15} className="text-slate-600" />
        <h3 className="text-xs font-semibold text-slate-900">Ringkasan Project Tahun {year}</h3>
        <span className="text-xs text-slate-500 ml-auto font-medium">{projects.length} project</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-2.5 px-3.5">Nama Project</th>
              <th className="py-2.5 px-3 text-center">Booth</th>
              <th className="py-2.5 px-3 text-center">Lunas/Booking</th>
              <th className="py-2.5 px-3 text-center">Okupansi</th>
              <th className="py-2.5 px-3 text-right">Pendapatan Real</th>
              <th className="py-2.5 px-3 text-right">Sisa Tagihan</th>
              <th className="py-2.5 px-3 text-right">Potensi</th>
              <th className="py-2.5 px-2 text-center w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map(fp => {
              const occ = fp.totalBooths > 0 ? Math.round((fp.soldBooths + fp.reservedBooths) / fp.totalBooths * 100) : 0;
              const sisa = fp.reservedBooths > 0 ? Math.max(0, fp.potentialRevenue - fp.totalRevenue) : 0;
              return (
                <tr key={fp.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onSelectProject(fp.id)}>
                  <td className="py-2.5 px-3.5">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      {fp.status === 'published' && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">LIVE</span>}
                      <span className="truncate max-w-[150px]">{fp.title}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <Calendar size={9} />{fmtDate(fp.start_date)}
                      {fp.venue && fp.venue !== 'Jakarta Convention Center' && <span className="ml-1 flex items-center gap-0.5 truncate max-w-[80px]"><MapPin size={9} />{fp.venue}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-900">{fp.totalBooths}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="text-red-700 font-bold">{fp.soldBooths}</span>
                    <span className="text-slate-400 mx-0.5">/</span>
                    <span className="text-amber-700 font-bold">{fp.reservedBooths}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${occ >= 80 ? 'bg-emerald-500' : occ >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${occ}%` }} />
                      </div>
                      <span className="font-bold text-slate-700 text-[11px] w-8">{occ}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900 text-[11px]">{fmtRupiah(fp.totalRevenue)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-[11px]">
                    <span className={sisa > 0 ? 'text-amber-700' : 'text-slate-400'}>{sisa > 0 ? fmtRupiah(sisa) : '—'}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900 text-[11px]">{fmtRupiah(fp.potentialRevenue)}</td>
                  <td className="py-2.5 px-2 text-center">
                    <button type="button" onClick={e => { e.stopPropagation(); onSelectProject(fp.id); }} className="text-slate-600 hover:text-slate-900 cursor-pointer">
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200">
            <tr>
              <td className="py-2 px-3.5 text-[11px] font-bold text-slate-700">TOTAL {year}</td>
              <td className="py-2 px-3 text-center font-bold text-slate-900">{projects.reduce((s, f) => s + f.totalBooths, 0)}</td>
              <td className="py-2 px-3 text-center">
                <span className="font-bold text-red-700">{projects.reduce((s, f) => s + f.soldBooths, 0)}</span>
                <span className="text-slate-400 mx-0.5">/</span>
                <span className="font-bold text-amber-700">{projects.reduce((s, f) => s + f.reservedBooths, 0)}</span>
              </td>
              <td />
              <td className="py-2 px-3 text-right font-bold text-slate-900 text-[11px]">{fmtRupiah(projects.reduce((s, f) => s + f.totalRevenue, 0))}</td>
              <td className="py-2 px-3 text-right font-bold text-amber-700 text-[11px]">{fmtRupiah(projects.reduce((s, f) => s + (f.reservedBooths > 0 ? Math.max(0, f.potentialRevenue - f.totalRevenue) : 0), 0))}</td>
              <td className="py-2 px-3 text-right font-bold text-slate-900 text-[11px]">{fmtRupiah(projects.reduce((s, f) => s + f.potentialRevenue, 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── GlobalYearComparisonCharts ────────────────────────────────────────────────
function GlobalYearComparisonCharts({ floorplanList }) {
  const yearData = useMemo(() => {
    const map = {};
    floorplanList.forEach(fp => {
      const { year } = getProjectDateInfo(fp);
      if (!map[year]) map[year] = { year, totalRevenue: 0, potentialRevenue: 0, soldBooths: 0, reservedBooths: 0, totalBooths: 0, projectCount: 0 };
      map[year].totalRevenue += fp.totalRevenue || 0;
      map[year].potentialRevenue += fp.potentialRevenue || 0;
      map[year].soldBooths += fp.soldBooths || 0;
      map[year].reservedBooths += fp.reservedBooths || 0;
      map[year].totalBooths += fp.totalBooths || 0;
      map[year].projectCount++;
    });
    return Object.values(map).sort((a, b) => Number(a.year) - Number(b.year));
  }, [floorplanList]);
  if (yearData.length < 2) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <BarChart2 size={15} className="text-slate-600" />
          <h3 className="text-xs font-semibold text-slate-900">Perbandingan Pendapatan per Tahun</h3>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={yearData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}Jt` : v} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <RechartsTooltip formatter={(v, name) => [fmtRupiah(v), name === 'totalRevenue' ? 'Pendapatan Real' : 'Potensi']} />
            <Legend formatter={v => <span className="text-xs text-slate-600">{v === 'totalRevenue' ? 'Pendapatan Real' : 'Potensi'}</span>} />
            <Bar dataKey="totalRevenue" name="totalRevenue" fill="#0f172a" radius={[3,3,0,0]} />
            <Bar dataKey="potentialRevenue" name="potentialRevenue" fill="#94a3b8" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Layers size={15} className="text-slate-600" />
          <h3 className="text-xs font-semibold text-slate-900">Booth Terjual & Project per Tahun</h3>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={yearData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <RechartsTooltip />
            <Legend formatter={v => <span className="text-xs text-slate-600">{v === 'soldBooths' ? 'Booth Lunas' : v === 'reservedBooths' ? 'Booth Booking' : 'Jml Project'}</span>} />
            <Bar dataKey="soldBooths" name="soldBooths" fill="#10b981" radius={[3,3,0,0]} />
            <Bar dataKey="reservedBooths" name="reservedBooths" fill="#f59e0b" radius={[3,3,0,0]} />
            <Bar dataKey="projectCount" name="projectCount" fill="#334155" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── ProjectYearComparison ─────────────────────────────────────────────────────
function ProjectYearComparison({ projectId, floorplanList }) {
  const fp = floorplanList.find(f => f.id === projectId);
  if (!fp) return null;
  const { year } = getProjectDateInfo(fp);
  const peers = floorplanList.filter(f => getProjectDateInfo(f).year === year && f.id !== projectId);
  if (!peers.length) return null;

  const avgOcc = (peers.reduce((s, p) => s + (p.totalBooths > 0 ? (p.soldBooths + p.reservedBooths) / p.totalBooths * 100 : 0), 0) / peers.length).toFixed(1);
  const avgRpB = peers.reduce((s, p) => s + (p.totalBooths > 0 ? p.totalRevenue / p.totalBooths : 0), 0) / peers.length;
  const thisOcc = fp.totalBooths > 0 ? ((fp.soldBooths + fp.reservedBooths) / fp.totalBooths * 100).toFixed(1) : 0;
  const thisRpB = fp.totalBooths > 0 ? fp.totalRevenue / fp.totalBooths : 0;

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={14} className="text-slate-600" />
        <span className="text-xs font-semibold text-slate-800">Perbandingan dengan {peers.length} project lain di Tahun {year}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Tingkat Okupansi</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-slate-900">{thisOcc}%</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${Number(thisOcc) >= Number(avgOcc) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {Number(thisOcc) >= Number(avgOcc) ? '▲' : '▼'} avg {avgOcc}%
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">vs rata-rata tahun {year}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Pendapatan / Booth</div>
          <div className="text-xl font-semibold text-slate-900">{fmtRupiah(thisRpB)}</div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded inline-block mt-0.5 ${thisRpB >= avgRpB ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {thisRpB >= avgRpB ? '▲' : '▼'} avg {fmtRupiah(avgRpB)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main SalesCharts ──────────────────────────────────────────────────────────
export default function SalesCharts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const SELECTION_KEY = 'dashboard_selection';
  const [selection, setSelection] = useState(() => {
    const urlProj = searchParams.get('project') || searchParams.get('projectId');
    const urlYear = searchParams.get('year');
    if (urlProj) return { type: 'project', id: urlProj };
    if (urlYear) return { type: 'year', year: urlYear };
    try { const s = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null'); if (s?.type) return s; } catch {}
    return { type: 'all' };
  });

  const [floorplanList, setFloorplanList] = useState([]);
  const [exhibitors, setExhibitors] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchBrand, setSearchBrand] = useState('');
  const [updatingBoothId, setUpdatingBoothId] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [stats, setStats] = useState({
    totalBooths: 0, paidCount: 0, paidPercentage: 0,
    bookedCount: 0, bookedPercentage: 0, availableCount: 0, availablePercentage: 0,
    freeCount: 0, freePercentage: 0, occupancyRate: 0,
    totalRevenue: 0, potentialRevenue: 0, remainingBill: 0, remainingPercentage: 0
  });
  const [loading, setLoading] = useState(true);
  const [showUnbilled, setShowUnbilled] = useState(false);

  const loadStats = useCallback(async (projId) => {
    setLoading(true);
    try {
      const s = await api.fetchStats(projId && projId !== 'all' ? projId : null);
      if (s) {
        setStats({
          totalBooths: s.totalBooths || 0,
          paidCount: s.paidCount ?? s.sold ?? 0,
          paidPercentage: s.paidPercentage ?? 0,
          bookedCount: s.bookedCount ?? s.reserved ?? 0,
          bookedPercentage: s.bookedPercentage ?? 0,
          availableCount: s.availableCount ?? s.available ?? 0,
          availablePercentage: s.availablePercentage ?? 0,
          freeCount: s.freeCount || 0,
          freePercentage: s.freePercentage ?? 0,
          occupancyRate: s.occupancyRate || 0,
          totalRevenue: s.totalRevenue || 0,
          revenueExclTax: s.revenueExclTax ?? s.totalRevenue ?? 0,
          taxCollected: s.taxCollected || 0,
          totalTaxBilled: s.totalTaxBilled || 0,
          potentialRevenue: s.potentialRevenue || 0,
          remainingBill: s.remainingBill ?? 0,
          remainingPercentage: s.remainingPercentage ?? 0,
          // AGENTS.md §40: received money split, booked booths without invoice, value of the empty booths
          paidInFullAmount: s.paidInFullAmount,
          paidInFullInvoices: s.paidInFullInvoices,
          downPaymentAmount: s.downPaymentAmount,
          downPaymentInvoices: s.downPaymentInvoices,
          unbilledBooths: s.unbilledBooths || [],
          unbilledCount: s.unbilledCount || 0,
          unbilledValue: s.unbilledValue || 0,
          availableValue: s.availableValue
        });
        if (s.floorplanList?.length > 0) setFloorplanList(s.floorplanList);
        if (s.categoryBreakdown) setCategoryBreakdown(s.categoryBreakdown);
        if (s.exhibitorsList) {
          const seen = new Set();
          setExhibitors(s.exhibitorsList.filter(item => {
            const k = `${item.floorplanId||'x'}_${item.code||item.booth||item.id}`;
            return seen.has(k) ? false : (seen.add(k), true);
          }));
        }
      }
    } catch (e) { console.error('Dashboard stats error', e); }
    finally { setLoading(false); }
  }, []);

  // Load on mount + when selection changes to project scope
  useEffect(() => {
    if (selection?.type === 'project' && selection?.id) {
      loadStats(selection.id);
    } else {
      loadStats(null);
    }
  }, [selection?.type === 'project' ? selection?.id : '__global__', loadStats]);

  // Year-level aggregate (from already-loaded floorplanList)
  const yearStats = useMemo(() => {
    if (selection?.type !== 'year') return null;
    const fps = floorplanList.filter(fp => getProjectDateInfo(fp).year === selection.year);
    const t = fps.reduce((s, f) => s + (f.totalBooths || 0), 0);
    const paid = fps.reduce((s, f) => s + (f.soldBooths || 0), 0);
    const booked = fps.reduce((s, f) => s + (f.reservedBooths || 0), 0);
    const avail = fps.reduce((s, f) => s + (f.availableBooths || 0), 0);
    const free = fps.reduce((s, f) => s + (f.freeBooths || 0), 0);
    const rev = fps.reduce((s, f) => s + (f.totalRevenue || 0), 0);
    const pot = fps.reduce((s, f) => s + (f.potentialRevenue || 0), 0);
    const rem = booked > 0 ? Math.max(0, pot - rev) : 0;
    return {
      totalBooths: t, paidCount: paid, bookedCount: booked, availableCount: avail, freeCount: free,
      totalRevenue: rev, potentialRevenue: pot, remainingBill: rem,
      paidPercentage: t > 0 ? Number(((paid/t)*100).toFixed(1)) : 0,
      bookedPercentage: t > 0 ? Number(((booked/t)*100).toFixed(1)) : 0,
      availablePercentage: t > 0 ? Number(((avail/t)*100).toFixed(1)) : 0,
      freePercentage: t > 0 ? Number(((free/t)*100).toFixed(1)) : 0,
      occupancyRate: t > 0 ? Number((((paid+booked)/t)*100).toFixed(1)) : 0,
      remainingPercentage: pot > 0 ? Number(((rem/pot)*100).toFixed(1)) : 0
    };
  }, [selection, floorplanList]);

  const es = yearStats || stats || {
    totalBooths: 0, paidCount: 0, paidPercentage: 0,
    bookedCount: 0, bookedPercentage: 0, availableCount: 0, availablePercentage: 0,
    freeCount: 0, freePercentage: 0, occupancyRate: 0,
    totalRevenue: 0, potentialRevenue: 0, remainingBill: 0, remainingPercentage: 0
  };

  const handleSelectionChange = sel => {
    setSelection(sel);
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify(sel)); } catch {}
    const params = new URLSearchParams();
    if (sel.type === 'project') params.set('project', sel.id);
    else if (sel.type === 'year') params.set('year', sel.year);
    setSearchParams(params);
  };

  const handleUpdateBoothStatus = async (boothId, newStatus, brandName) => {
    setUpdatingBoothId(boothId);
    try {
      const res = await api.updateBoothStatus(boothId, { status: newStatus, owner_name: brandName });
      if (res.success) {
        showToast(res.message || `Status diubah ke ${newStatus}!`);
        if (selection?.type === 'project') loadStats(selection.id); else loadStats(null);
      } else showToast(`⚠️ ${res.error}`);
    } catch { showToast('⚠️ Gagal menghubungi server'); }
    finally { setUpdatingBoothId(null); }
  };

  const handleEditBrandName = async booth => {
    const n = window.prompt(`Nama Brand Booth ${booth.code}:`, booth.brandName || '');
    if (n !== null) {
      setUpdatingBoothId(booth.id);
      try {
        // One transaction (merged booths) = one brand: rename every booth of the row
        const targets = booth.isMerged ? booth.mergedBooths.filter(m => m.id) : [booth];
        const results = await Promise.all(targets.map(t => api.updateBoothStatus(t.id, { status: t.status || booth.status, owner_name: n.trim() })));
        const res = { success: results.length > 0 && results.every(r => r?.success) };
        if (res.success) { showToast(`✨ Brand diperbarui: "${n}"`); if (selection?.type === 'project') loadStats(selection.id); else loadStats(null); }
      } catch { showToast('⚠️ Gagal memperbarui'); }
      finally { setUpdatingBoothId(null); }
    }
  };

  const yearExhibitors = useMemo(() => {
    if (selection?.type === 'year') {
      return exhibitors.filter(b => {
        const fp = floorplanList.find(f => f.id === b.floorplanId);
        return fp && getProjectDateInfo(fp).year === selection.year;
      });
    }
    return exhibitors;
  }, [exhibitors, selection, floorplanList]);

  const resolveExhibitorStatus = (e) => {
    const paymentStatus = (e.payment_status || e.paymentStatus || e.invoicePaymentStatus || '').toUpperCase();
    if (e.status === 'free' || e.isFree || e.category === 'Free' || e.price === 0) return 'free';
    if (paymentStatus === 'PAID' || e.status === 'sold' || e.status === 'paid') return 'sold';
    if (paymentStatus === 'PARTIAL' || e.status === 'dp') return 'dp';
    if (paymentStatus === 'CANCELED' || e.status === 'canceled') return 'canceled';
    return 'reserved';
  };

  // Tenant table: one row per TRANSACTION (merged booths / one multi-booth invoice = one row, AGENTS.md §18);
  // booth counts (occupancy, categories) keep using the per-booth rows
  const tenantRows = useMemo(() => collapseMergedRows(yearExhibitors), [yearExhibitors]);

  const statusCounts = useMemo(() => {
    const counts = { all: tenantRows.length, sold: 0, dp: 0, reserved: 0, free: 0, canceled: 0 };
    tenantRows.forEach(b => {
      const st = resolveExhibitorStatus(b);
      if (counts[st] !== undefined) counts[st]++;
      if (st === 'dp') counts.reserved++;
    });
    return counts;
  }, [tenantRows]);

  const filteredExhibitors = useMemo(() => {
    return tenantRows.filter(b => {
      const st = resolveExhibitorStatus(b);
      let ok = true;
      if (statusFilter === 'sold') ok = st === 'sold';
      else if (statusFilter === 'dp') ok = st === 'dp';
      else if (statusFilter === 'reserved') ok = st === 'reserved' || st === 'dp';
      else if (statusFilter === 'free') ok = st === 'free';
      else if (statusFilter === 'canceled') ok = st === 'canceled';

      const q = searchBrand.toLowerCase().trim();
      const ms = !q ||
        (b.brandName || b.company || '').toLowerCase().includes(q) ||
        (b.code || b.booth || '').toLowerCase().includes(q) ||
        (b.category || b.brandCategory || '').toLowerCase().includes(q) ||
        (b.picName || b.pic || '').toLowerCase().includes(q) ||
        (b.floorplanTitle || b.projectName || '').toLowerCase().includes(q);
      return ok && ms;
    });
  }, [tenantRows, statusFilter, searchBrand]);

  const pieData = [
    { name: 'Sudah Dibayar (Paid)', value: es.paidCount, color: '#10b981' },
    { name: 'Di-booking (Reserved)', value: es.bookedCount, color: '#f59e0b' },
    { name: 'Tersedia (Available)', value: Math.max(0, es.availableCount - es.freeCount), color: '#3b82f6' },
    { name: 'Free / Sponsor', value: es.freeCount, color: '#64748b' },
  ].filter(d => d.value > 0);

  const categoryPerf = useMemo(() => {
    if (categoryBreakdown && categoryBreakdown.length > 0 && (!selection || selection.type === 'all' || selection.type === 'project')) {
      return categoryBreakdown;
    }
    const map = {};
    yearExhibitors.forEach(b => {
      const cat = b.category || b.brandCategory || 'Standard';
      if (!map[cat]) map[cat] = { name: cat, total: 0, sold: 0, reserved: 0, free: 0, available: 0 };
      map[cat].total++;
      const st = resolveExhibitorStatus(b);
      if (st === 'sold') map[cat].sold++;
      else if (st === 'reserved' || st === 'dp') map[cat].reserved++;
      else if (st === 'free') map[cat].free++;
    });
    return Object.values(map).map(c => {
      const filled = c.sold + c.reserved + c.free;
      return { ...c, filled, occupancy: c.total > 0 ? Number(((filled / c.total) * 100).toFixed(1)) : 0, isSoldOut: c.available === 0 && c.total > 0 };
    }).sort((a, b) => b.total - a.total);
  }, [categoryBreakdown, yearExhibitors, selection]);

  const unsoldVal = useMemo(() => {
    return Math.max(0, (es.potentialRevenue || 0) - (es.totalRevenue || 0) - (es.remainingBill || 0));
  }, [es]);
  const filledCount = es.paidCount + es.bookedCount + es.freeCount;
  const overallOcc = es.totalBooths > 0 ? Number(((filledCount/es.totalBooths)*100).toFixed(1)) : 0;
  const cashRate = es.potentialRevenue > 0 ? Number(((es.totalRevenue/es.potentialRevenue)*100).toFixed(1)) : 0;

  const scopeLabel = useMemo(() => {
    if (!selection || selection.type === 'all') return 'Seluruh Tahun (Global)';
    if (selection.type === 'year') return `Tahun ${selection.year}`;
    const fp = floorplanList.find(f => f.id === selection.id);
    return fp ? `${fp.title} (${fmtDate(fp.start_date)})` : 'Project Terpilih';
  }, [selection, floorplanList]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-xs font-medium border border-slate-800">
          <CheckCircle size={14} className="text-emerald-400" /><span>{toast}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center border border-slate-200/70 shrink-0"><Building2 size={20} /></span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Dashboard &amp; Analytics</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Statistik penjualan, pemesanan, data brand peserta, harga, diskon, dan status booth</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { if (selection?.type === 'project') loadStats(selection.id); else loadStats(null); }} disabled={loading}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /><span>Refresh</span>
            </button>
            {selection?.type === 'project' ? (
              <button onClick={() => navigate(`/admin/floorplan?templateId=${selection.id}`)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0">
                <LayoutGrid size={14} /><span>Buka di Floorplan Editor</span><ArrowRight size={12} />
              </button>
            ) : (
              <button onClick={() => navigate('/admin/floorplan')}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0">
                <LayoutGrid size={14} /><span>Pilih Project di Editor</span><ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>

        {/* PROJECT PICKER */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-md bg-slate-200/80 text-slate-700 flex items-center justify-center"><FolderKanban size={14} /></div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cakupan Tampilan:</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {(!selection || selection.type === 'all') && (
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1"><Globe size={12} className="text-slate-500" />Semua Tahun (Global)</span>
                  )}
                  {selection?.type === 'year' && (
                    <>
                      <button onClick={() => handleSelectionChange({ type: 'all' })} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer font-medium">Semua</button>
                      <ChevronRight size={11} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1"><Calendar size={11} className="text-slate-500" />Tahun {selection.year}</span>
                    </>
                  )}
                  {selection?.type === 'project' && (() => {
                    const fp = floorplanList.find(f => f.id === selection.id);
                    const year = fp ? getProjectDateInfo(fp).year : '—';
                    return (
                      <>
                        <button onClick={() => handleSelectionChange({ type: 'all' })} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer font-medium">Semua</button>
                        <ChevronRight size={11} className="text-slate-400" />
                        <button onClick={() => handleSelectionChange({ type: 'year', year })} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer font-medium">{year}</button>
                        <ChevronRight size={11} className="text-slate-400" />
                        <span className="text-xs font-semibold text-slate-900 max-w-[200px] truncate">{fp?.title || selection.id}</span>
                        {fp?.status === 'published' && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-medium border border-emerald-200">Live</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="md:ml-auto w-full md:w-72">
              <DashboardProjectPicker floorplanList={floorplanList} selection={selection} onChange={handleSelectionChange} />
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL: Year comparison charts */}
      {(!selection || selection.type === 'all') && floorplanList.length >= 2 && (
        <GlobalYearComparisonCharts floorplanList={floorplanList} />
      )}

      {/* YEAR: Project summary table */}
      {selection?.type === 'year' && (
        <YearlySummaryTable year={selection.year} floorplanList={floorplanList} onSelectProject={id => handleSelectionChange({ type: 'project', id })} />
      )}

      {/* METRICS */}
      <div>
      {/* METRICS */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <span>Metrik Okupansi &amp; Status Booth — {scopeLabel}</span>
            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium">
              Live
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Total Booth</span>
              <div className="w-7 h-7 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center"><Layers size={14} /></div>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{es.totalBooths}</h3>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">Kapasitas Denah</p>
          </div>
          {/* Paid */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Lunas (Paid)</span>
              <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center"><CheckCircle2 size={14} /></div>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{es.paidCount}</h3>
              <span className="text-[11px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200/60">{es.paidPercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, es.paidPercentage)}%` }} />
            </div>
          </div>
          {/* Booking */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Di-Booking</span>
              <div className="w-7 h-7 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center"><Users size={14} /></div>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{es.bookedCount}</h3>
              <span className="text-[11px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200/60">{es.bookedPercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, es.bookedPercentage)}%` }} />
            </div>
          </div>
          {/* Available */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Tersedia</span>
              <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><CircleDot size={14} /></div>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{es.availableCount}</h3>
              <span className="text-[11px] font-medium px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200/60">{es.availablePercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, es.availablePercentage)}%` }} />
            </div>
          </div>
          {/* Free */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Free / Sponsor</span>
              <div className="w-7 h-7 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center"><Gift size={14} /></div>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{es.freeCount}</h3>
              <span className="text-[11px] font-medium px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">{es.freePercentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-slate-400 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, es.freePercentage)}%` }} />
            </div>
          </div>
        </div>

        {/* Validation row */}
        <div className="mt-2 px-1 text-[11px] text-slate-400 flex items-center gap-1.5">
          <CheckCircle size={12} className="text-slate-400" />
          <span>
            Lunas {es.paidCount} · Booking {es.bookedCount} · Tersedia {es.availableCount} · Free {es.freeCount} = <strong className="text-slate-600 font-semibold">{es.paidCount + es.bookedCount + es.availableCount + es.freeCount}</strong> total
          </span>
        </div>
      </div>

      {/* FINANCIAL CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* Card 1: Total Pendapatan Real (Linear Dark Card) */}
        <div className="bg-slate-950 text-white p-5 rounded-xl border border-slate-800 shadow-xs flex items-center justify-between relative overflow-hidden">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">Uang Masuk (Diterima){es.taxCollected > 0 ? ' · Sebelum PPN' : ''}</div>
            {/* PPN is collected for the state, not revenue: the headline is the amount before PPN */}
            <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-1 font-sans">{fmtRupiah(es.taxCollected > 0 ? es.revenueExclTax : es.totalRevenue)}</h3>
            {es.paidInFullInvoices !== undefined ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-emerald-400 font-medium">Lunas {fmtRupiah(es.paidInFullAmount)}</span> ({es.paidInFullInvoices} invoice)
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="text-sky-300 font-medium">DP {fmtRupiah(es.downPaymentAmount)}</span> ({es.downPaymentInvoices} invoice)
              </p>
            ) : (
              <p className="text-xs text-slate-400 flex items-center gap-1.5"><span className="text-emerald-400 font-medium">{es.paidCount || 0} booth</span><span>sudah lunas terbayar</span></p>
            )}
            {es.taxCollected > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">Diterima {fmtRupiah(es.totalRevenue)}, termasuk PPN {fmtRupiah(es.taxCollected)}</p>
            )}
            {es.totalTaxBilled > 0 && (
              <p className="text-[11px] text-slate-400">Total PPN (semua invoice aktif): <span className="text-slate-200 font-medium">{fmtRupiah(es.totalTaxBilled)}</span></p>
            )}
          </div>
          <div className="w-10 h-10 bg-slate-800 text-slate-200 rounded-lg flex items-center justify-center shrink-0 border border-slate-700"><DollarSign size={20} /></div>
        </div>

        {/* Card 2: Sisa Tagihan */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Total Sisa Tagihan (Pending)</div>
            <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 mb-1 font-sans">{fmtRupiah(es.remainingBill)}</h3>
            <p className="text-xs text-slate-500">Belum dibayar dari invoice yang sudah terbit</p>
            {es.unbilledCount > 0 && (
              <p className="text-xs text-amber-700 font-medium mt-0.5">+ {es.unbilledCount} booth booking belum ditagih ({fmtRupiah(es.unbilledValue)})</p>
            )}
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center shrink-0 border border-amber-100"><Clock3 size={20} /></div>
        </div>

        {/* Card 3: Estimasi Total Potensi Pendapatan */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">Estimasi Total Potensi Pendapatan</div>
            <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 mb-1 font-sans">{fmtRupiah(es.potentialRevenue)}</h3>
            <p className="text-xs text-slate-500">Kapasitas {Math.max(0, (es.totalBooths || 0) - (es.freeCount || 0))} booth berbayar (Free excluded)</p>
          </div>
          <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center shrink-0 border border-slate-200/60"><TrendingUp size={20} /></div>
        </div>
      </div>

      {/* PROJECT COMPARISON (single-project view only) */}
      {selection?.type === 'project' && (
        <ProjectYearComparison projectId={selection.id} floorplanList={floorplanList} />
      )}

      {/* DISTRIBUSI STATUS BOOTH */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Distribusi Status Booth</h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">Total: {es.totalBooths}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Proporsi booth per status — {scopeLabel}</p>
          </div>
          <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg"><PieChartIcon size={16} /></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 h-60 w-full flex flex-col items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={3} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v, name) => [`${v} Booth (${es.totalBooths > 0 ? ((v/es.totalBooths)*100).toFixed(1) : 0}%)`, name]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={v => <span className="text-xs text-slate-600 font-medium">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-center py-8"><PieChartIcon size={40} className="mx-auto mb-2 opacity-40" /><p className="text-xs">Belum ada data booth</p></div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tingkat Okupansi Stan</span>
                  <span className="text-xs font-semibold text-slate-800 px-1.5 py-0.5 rounded bg-white border border-slate-200/70">{overallOcc}%</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div><span className="text-xl font-semibold text-slate-900">{filledCount}</span><span className="text-xs text-slate-500 ml-1">/ {es.totalBooths} Booth Terisi</span></div>
                  <span className="text-[11px] font-medium text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200/70">Sisa {es.availableCount}</span>
                </div>
                <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden"><div className="bg-slate-900 h-full rounded-full transition-all duration-500" style={{ width: `${overallOcc}%` }} /></div>
                <p className="text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Terbayar: {es.paidCount} · Booking: {es.bookedCount}</span>
                  <span>Free: {es.freeCount}</span>
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{es.availableValue !== undefined ? 'Nilai Booth Tersedia' : 'Nilai Belum Terjual'}</span>
                  <span className="p-1 bg-white text-slate-600 rounded border border-slate-200/70"><TrendingUp size={12} /></span>
                </div>
                <span className="text-xl font-semibold text-slate-900">{fmtRupiah(es.availableValue ?? unsoldVal)}</span>
                <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${cashRate}%` }} /></div>
                <p className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Realisasi Kas: <strong className="text-slate-800 font-semibold">{cashRate}%</strong></span>
                  <span>Potensi {es.availableCount} stan</span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><Layers size={13} className="text-slate-500" />Keterisian per Kategori:</span>
                <span className="text-[11px] text-slate-400 font-medium">{categoryPerf.length} Kategori</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {categoryPerf.map((cat, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-slate-200/70 bg-white hover:border-slate-300 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-900 truncate">{cat.name}</span>
                        {cat.isSoldOut ? <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">Sold Out</span>
                          : <span className="text-[11px] text-slate-500">Sisa {cat.available} stan</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-slate-500 text-[11px]">{cat.filled}/{cat.total}</span>
                        <span className="font-medium text-slate-800 text-[11px] w-10 text-right">{cat.occupancy}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${cat.isSoldOut ? 'bg-emerald-500' : 'bg-slate-900'}`} style={{ width: `${cat.occupancy}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {es.bookedCount > 0 && (
              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/70 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center shrink-0"><Clock3 size={13} /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-amber-900 font-medium">Ada <strong>{es.bookedCount || 0} booth booking</strong>; sisa tagihan dari invoice yang terbit <strong>{fmtRupiah(es.remainingBill)}</strong>.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setStatusFilter('reserved')}
                  className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-md text-[11px] shrink-0 transition-colors cursor-pointer">
                  Lihat Booking
                </button>
              </div>
            )}

            {/* Booked booths without any invoice (AGENTS.md §40): their value is in no invoice total yet */}
            {es.unbilledCount > 0 && (
              <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 text-xs">
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center shrink-0"><AlertTriangle size={13} /></div>
                    <p className="text-rose-900 font-medium">
                      <strong>{es.unbilledCount} booth</strong> sudah dibooking tapi <strong>belum ada invoice</strong> ({fmtRupiah(es.unbilledValue)})
                      {es.unbilledBooths.some(b => b.status === 'sold') && <> — termasuk <strong>{es.unbilledBooths.filter(b => b.status === 'sold').length} booth Sold</strong> tanpa pembayaran tercatat</>}.
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowUnbilled(v => !v)} aria-expanded={showUnbilled}
                    className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white font-medium rounded-md text-[11px] shrink-0 transition-colors cursor-pointer">
                    {showUnbilled ? 'Tutup' : 'Lihat Daftar'}
                  </button>
                </div>
                {showUnbilled && (
                  <div className="border-t border-rose-200/80 bg-white rounded-b-lg">
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {es.unbilledBooths.map(b => (
                        <div key={`${b.floorplanId}_${b.code}`} className="flex items-center gap-3 px-3 py-1.5">
                          <span className="w-16 shrink-0 font-semibold text-slate-900">#{b.code}</span>
                          <span className="flex-1 min-w-0 truncate text-slate-700">{b.ownerName || 'Tanpa nama tenant'}</span>
                          <span className={`shrink-0 px-1.5 py-px rounded text-[10px] font-semibold ${b.status === 'sold' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>{b.status === 'sold' ? 'Sold' : 'Reserved'}</span>
                          <span className="w-28 shrink-0 text-right tabular-nums text-slate-700">{fmtRupiah(b.value)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>Terbitkan invoicenya dari Data Exhibitor ("Buat Invoice").</span>
                      <button type="button" onClick={() => navigate('/admin/exhibitors')} className="font-semibold text-indigo-700 hover:underline cursor-pointer">Buka Data Exhibitor</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DAFTAR BRAND / TENANT */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/80 shadow-xs w-full space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Daftar Brand / Tenant Peserta Pameran</h3>
              <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 font-medium rounded-md">{filteredExhibitors.length} Tenant</span>
              <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 font-medium rounded-md border border-amber-200/60">Sisa: {fmtRupiah(es.remainingBill)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Daftar brand terdaftar, ukuran booth, harga, diskon, dan status tagihan</p>
          </div>
          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
            <input type="text" placeholder="Cari brand, booth, atau PIC..." value={searchBrand} onChange={e => setSearchBrand(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors" />
          </div>
        </div>

        {/* STATUS FILTER (Sleek SaaS Segmented Controls) */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/70 border border-slate-200/60 rounded-lg">
          {[
            { key: 'all', label: 'Semua', count: statusCounts.all },
            { key: 'sold', label: 'Lunas', count: statusCounts.sold, dot: 'bg-emerald-500' },
            { key: 'dp', label: 'Uang Muka', count: statusCounts.dp, dot: 'bg-blue-500' },
            { key: 'reserved', label: 'Booking', count: statusCounts.reserved, dot: 'bg-amber-500' },
            { key: 'free', label: 'Free', count: statusCounts.free, dot: 'bg-slate-400' },
            { key: 'canceled', label: 'Batal', count: statusCounts.canceled, dot: 'bg-rose-500' },
          ].map(f => {
            const isActive = statusFilter === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive 
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}>
                {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
                <span>{f.label}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${isActive ? 'bg-slate-100 text-slate-700' : 'text-slate-400'}`}>{f.count}</span>
              </button>
            );
          })}
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto border border-slate-200/80 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 font-medium uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3.5">Nama Brand / Tenant</th>
                <th className="py-2.5 px-3">Booth &amp; Ukuran</th>
                <th className="py-2.5 px-3">Harga, Diskon &amp; Sisa Tagihan</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredExhibitors.length > 0 ? filteredExhibitors.map(booth => {
                const st = resolveExhibitorStatus(booth);
                const isPaid = st === 'sold';
                const isDp = st === 'dp';
                const isRes = st === 'reserved';
                const isCanceled = st === 'canceled';
                const isFree = st === 'free';
                const brandName = booth.brandName || booth.company;
                const boothCode = booth.code || booth.booth;
                const hasDsc = (booth.discountAmount || 0) > 0;
                const widthM = booth.widthM || 3;
                const heightM = booth.heightM || 3;
                const areaSqm = booth.areaSqm || Number((widthM * heightM).toFixed(1));
                const price = booth.finalPrice || booth.price || 0;
                const remaining = booth.remainingAmount != null ? Number(booth.remainingAmount) : (isRes ? price : 0);

                return (
                  <tr key={booth.id || `${booth.floorplanId}_${boothCode}`} className="hover:bg-slate-50/60 transition-colors">
                    {/* 1. Nama Brand / Tenant */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center font-mono font-medium text-xs border border-slate-200/80 shrink-0">
                          {brandName ? brandName.charAt(0).toUpperCase() : <Store size={13} className="text-slate-500" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 text-xs truncate">{brandName || <span className="text-slate-400 italic font-normal">(Belum ada brand)</span>}</span>
                            <button type="button" onClick={() => handleEditBrandName(booth)} className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer" title="Edit Nama Brand"><Edit size={11} /></button>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                            {booth.brandCategory && <span className="text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded text-[10px] font-medium">{booth.brandCategory}</span>}
                            {(booth.picName || booth.pic) && <span>PIC: <strong className="font-medium text-slate-700">{booth.picName || booth.pic}</strong></span>}
                            {(selection?.type === 'all' || selection?.type === 'year') && <span className="text-slate-400 truncate max-w-[120px]">· {booth.floorplanTitle || booth.projectName}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Booth & Ukuran */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-xs">#{boothCode}</span>
                        <span className="text-xs text-slate-600">{booth.category || 'Standard'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {booth.isMerged ? `${booth.mergedBooths.length} booth gabungan · ${areaSqm} m²` : `${widthM}m × ${heightM}m · ${areaSqm} m²`}
                      </div>
                    </td>

                    {/* 3. Harga, Diskon & Sisa Tagihan */}
                    <td className="py-3 px-3">
                      {isFree ? (
                        <div><span className="font-semibold text-slate-800 text-xs font-mono">Rp 0</span><div className="text-[10px] text-slate-500 font-medium">Bebas Tagihan (Free)</div></div>
                      ) : (
                        <div className="space-y-0.5">
                          {hasDsc ? (
                            <div>
                              <div className="text-[10px] text-slate-400 line-through font-mono">{fmtRupiah(booth.originalPrice || price)}</div>
                              <div className="font-semibold text-slate-900 text-xs font-mono">{fmtRupiah(price)}</div>
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 px-1 rounded border border-rose-200/60"><Percent size={9} />Diskon {fmtRupiah(booth.discountAmount)}</span>
                            </div>
                          ) : <div className="font-semibold text-slate-900 text-xs font-mono">{fmtRupiah(price)}</div>}

                          {isDp && (
                            <div className="mt-0.5 text-[11px] text-slate-600 font-mono">
                              <span>Dibayar: {fmtRupiah(booth.paidAmount)}</span> · <span className="font-medium text-amber-700">Sisa: {fmtRupiah(remaining)}</span>
                            </div>
                          )}
                          {isRes && (
                            <div className="mt-0.5"><span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60"><Clock3 size={10} />Sisa: {fmtRupiah(remaining)}</span></div>
                          )}
                          {isPaid && (
                            <div className="mt-0.5"><span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60"><CheckCircle size={10} />Lunas</span></div>
                          )}
                          {isCanceled && (
                            <div className="mt-0.5"><span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200/60"><AlertTriangle size={10} />Dibatalkan</span></div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 4. Status */}
                    <td className="py-3 px-3 text-center">
                      {isFree && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Free</span>}
                      {isPaid && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/70"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Lunas</span>}
                      {isDp && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/70"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Uang Muka</span>}
                      {isRes && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/70"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Di-Booking</span>}
                      {isCanceled && <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/70"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />Batal</span>}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400"><Store size={32} className="mx-auto mb-2 opacity-30" /><p className="text-xs">Tidak ada brand / tenant yang cocok</p></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-lg flex items-center justify-between text-xs text-slate-600">
          <div>
            <span>Menampilkan <strong>{filteredExhibitors.length}</strong> dari <strong>{tenantRows.length}</strong> tenant. Sisa Tagihan: <strong className="font-mono text-slate-900">{fmtRupiah(es.remainingBill)}</strong>.</span>
          </div>
          <button type="button" onClick={() => { if (selection?.type === 'project') navigate(`/admin/floorplan?templateId=${selection.id}`); else navigate('/admin/floorplan'); }}
            className="text-slate-700 hover:text-slate-900 font-medium hover:underline flex items-center gap-1 shrink-0 cursor-pointer">
            <span>Edit Layout Denah</span><ArrowRight size={12} />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
