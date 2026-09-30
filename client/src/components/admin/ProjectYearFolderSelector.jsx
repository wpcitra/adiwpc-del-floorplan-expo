import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  LayoutGrid, 
  List, 
  Eye, 
  EyeOff, 
  Search, 
  Building2, 
  Check, 
  Minus, 
  SlidersHorizontal, 
  ArrowUpDown,
  Layers,
  Globe,
  MapPin,
  Info,
  Trash2,
  RotateCcw,
  MoreVertical,
  History,
  Lock,
  X
} from 'lucide-react';
import api from '../../services/api';
import DeleteConfirmModal from './DeleteConfirmModal';
import DeleteFolderConfirmModal from './DeleteFolderConfirmModal';
import TrashManagerModal from './TrashManagerModal';

// Folder years follow Indonesian Western Time (WIB)
const WIB = 'Asia/Jakarta';
export const currentYearWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric' }).format(new Date());

// SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS") are UTC without a zone marker
const parseProjectDate = (raw) => {
  if (!raw) return null;
  const str = String(raw);
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str) ? new Date(`${str.replace(' ', 'T')}Z`) : new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Helper to extract year, timestamp, and formatted date from project object
 */
export function getProjectDateInfo(proj) {
  let rawDate = proj.start_date || proj.startDate || proj.event_start_date || proj.date;
  if (!rawDate && proj.metadata) {
    try {
      const meta = typeof proj.metadata === 'string' ? JSON.parse(proj.metadata) : proj.metadata;
      rawDate = meta?.event?.startDate || meta?.event?.start_date || meta?.event?.date || meta?.event?.created_at;
    } catch (e) {}
  }
  if (!rawDate) {
    rawDate = proj.created_at || proj.createdAt || proj.updated_at;
  }
  let parsedYear = null;
  let formattedDate = null;
  let timestamp = 0;

  if (rawDate) {
    const d = parseProjectDate(rawDate);
    if (d) {
      parsedYear = new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric' }).format(d);
      timestamp = d.getTime();
      formattedDate = d.toLocaleDateString('id-ID', {
        timeZone: WIB,
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  }

  if (!parsedYear) {
    const yearMatch = (proj.title || '').match(/\b(20\d\d)\b/) || (proj.id || '').match(/\b(20\d\d)\b/);
    if (yearMatch) {
      parsedYear = yearMatch[1];
      formattedDate = `Tahun ${parsedYear}`;
      timestamp = new Date(`${parsedYear}-01-01`).getTime();
    }
  }

  return {
    year: parsedYear || 'Tanpa Tahun',
    formattedDate: formattedDate || 'Tanggal tidak diset',
    timestamp: timestamp || 0
  };
}

export default function ProjectYearFolderSelector({
  allAvailableProjects = [],
  selectedProjectIds = ['all'],
  setSelectedProjectIds,
  isAllSelected = true,
  isProjectActive,
  handleSelectSoloProject,
  handleToggleProject,
  handleSelectAllProjects,
  allStats = {},
  getProjectStats,
  onProjectsModified,
  showToast,
  // 'selector' (Manajemen Invoice: pick projects) | 'directory' (year folder -> project subfolder -> content)
  mode = 'selector',
  // localStorage key prefix, so each page remembers its own open folders / preferences
  storageKey = 'invoice_project',
  // directory mode only
  renderProjectContent,
  yearFilter = 'all',
  hideEmpty = false,
  autoOpenProjectIds = null,
  countLabel = 'Inv'
}) {
  const isDirectory = mode === 'directory';
  const storageItem = (suffix) => `${storageKey}_${suffix}`;
  // Local state for folder accordion & preferences with localStorage persistence
  const [openFolders, setOpenFolders] = useState(() => {
    try {
      const saved = localStorage.getItem(storageItem('open_folders'));
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    // Default: current year open, e.g. "2026"
    const currentYear = currentYearWIB();
    return { [currentYear]: true };
  });

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(storageItem('view_mode')) || 'grid';
    } catch (e) {
      return 'grid';
    }
  });

  const [hideEmptyProjects, setHideEmptyProjects] = useState(() => {
    try {
      return localStorage.getItem(storageItem('hide_empty')) === 'true';
    } catch (e) {
      return false;
    }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'
  const [sortBy, setSortBy] = useState(() => {
    try {
      return localStorage.getItem(storageItem('sort_by')) || 'date_desc';
    } catch (e) {
      return 'date_desc';
    }
  });

  // Modal states for delete, folder delete, and trash manager
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectsToDelete, setProjectsToDelete] = useState([]);
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Undo toast state
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = useRef(null);

  // Fetch trash count
  const loadTrashCount = async () => {
    try {
      const items = await api.fetchTrashProjects();
      setTrashCount(Array.isArray(items) ? items.length : 0);
    } catch (e) {
      console.warn("Failed to load trash count", e);
    }
  };

  useEffect(() => {
    if (!isDirectory) loadTrashCount();
  }, [isDirectory]);

  // Directory mode: open / closed project subfolders, persisted per page
  const [openProjects, setOpenProjects] = useState(() => {
    try {
      const saved = localStorage.getItem(storageItem('open_projects'));
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });
  useEffect(() => {
    try { localStorage.setItem(storageItem('open_projects'), JSON.stringify(openProjects)); } catch (e) {}
  }, [openProjects]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleProject = (projectId) => setOpenProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));

  // Directory mode: search results open their year folders and project subfolders
  const autoOpenKey = autoOpenProjectIds ? autoOpenProjectIds.join('|') : '';
  useEffect(() => {
    if (!isDirectory || !autoOpenProjectIds || autoOpenProjectIds.length === 0) return;
    const years = {};
    const projectsOpen = {};
    allAvailableProjects.forEach(p => {
      if (autoOpenProjectIds.includes(p.id)) {
        years[getProjectDateInfo(p).year] = true;
        projectsOpen[p.id] = true;
      }
    });
    setOpenFolders(prev => ({ ...prev, ...years }));
    setOpenProjects(prev => ({ ...prev, ...projectsOpen }));
  }, [autoOpenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageItem('open_folders'), JSON.stringify(openFolders));
    } catch (e) {}
  }, [openFolders]);

  useEffect(() => {
    try {
      localStorage.setItem(storageItem('view_mode'), viewMode);
    } catch (e) {}
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(storageItem('hide_empty'), hideEmptyProjects.toString());
    } catch (e) {}
  }, [hideEmptyProjects]);

  useEffect(() => {
    try {
      localStorage.setItem(storageItem('sort_by'), sortBy);
    } catch (e) {}
  }, [sortBy]);

  // Toggle folder open/close
  const toggleFolder = (year) => {
    setOpenFolders(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };

  // Group projects by year
  const groupedProjects = useMemo(() => {
    const groups = {};

    allAvailableProjects.forEach(proj => {
      const dateInfo = getProjectDateInfo(proj);
      const yr = dateInfo.year;
      if (!groups[yr]) {
        groups[yr] = [];
      }
      groups[yr].push({
        ...proj,
        _dateInfo: dateInfo
      });
    });

    // Ensure current year folder is present even if empty (according to specs)
    const currentYear = currentYearWIB();
    if (!groups[currentYear]) {
      groups[currentYear] = [];
    }

    // Sort years descending (newest to oldest, 'Tanpa Tahun' at end)
    const sortedYears = Object.keys(groups).sort((a, b) => {
      if (a === 'Tanpa Tahun') return 1;
      if (b === 'Tanpa Tahun') return -1;
      return Number(b) - Number(a);
    });

    return sortedYears.map(year => {
      let list = groups[year] || [];

      // Apply search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        list = list.filter(p => 
          (p.title || '').toLowerCase().includes(query) ||
          (p.venue || '').toLowerCase().includes(query) ||
          (p.event_title || '').toLowerCase().includes(query) ||
          (p.id || '').toLowerCase().includes(query)
        );
      }

      // Apply payment status filter
      if (statusFilter !== 'all') {
        list = list.filter(p => {
          const stats = getProjectStats(p.id);
          if (statusFilter === 'unpaid') {
            return stats.unpaidCount > 0 || stats.dpCount > 0;
          }
          if (statusFilter === 'paid') {
            return stats.count > 0 && stats.unpaidCount === 0 && stats.dpCount === 0;
          }
          return true;
        });
      }

      // Apply empty projects filter
      if (isDirectory ? hideEmpty : hideEmptyProjects) {
        list = list.filter(p => {
          const stats = getProjectStats(p.id);
          return stats.count > 0;
        });
      }

      // Apply sorting
      list = [...list].sort((a, b) => {
        if (isDirectory || sortBy === 'date_desc') {
          return b._dateInfo.timestamp - a._dateInfo.timestamp;
        }
        if (sortBy === 'date_asc') {
          return a._dateInfo.timestamp - b._dateInfo.timestamp;
        }
        if (sortBy === 'name_asc') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortBy === 'amount_desc') {
          const statsA = getProjectStats(a.id);
          const statsB = getProjectStats(b.id);
          return statsB.totalAmount - statsA.totalAmount;
        }
        if (sortBy === 'invoice_desc') {
          const statsA = getProjectStats(a.id);
          const statsB = getProjectStats(b.id);
          return statsB.count - statsA.count;
        }
        return 0;
      });

      return {
        year,
        projects: list,
        totalInYear: (groups[year] || []).length
      };
    });
  }, [allAvailableProjects, searchTerm, statusFilter, hideEmptyProjects, sortBy, getProjectStats, isDirectory, hideEmpty]);

  // Available years list for dropdown filter
  const allYears = useMemo(() => {
    const years = new Set();
    allAvailableProjects.forEach(p => {
      const d = getProjectDateInfo(p);
      years.add(d.year);
    });
    return Array.from(years).sort((a, b) => {
      if (a === 'Tanpa Tahun') return 1;
      if (b === 'Tanpa Tahun') return -1;
      return Number(b) - Number(a);
    });
  }, [allAvailableProjects]);

  // When searching, auto-expand folders that contain matching items
  useEffect(() => {
    if (searchTerm.trim().length > 0) {
      const nextOpen = {};
      groupedProjects.forEach(g => {
        if (g.projects.length > 0) {
          nextOpen[g.year] = true;
        }
      });
      setOpenFolders(prev => ({ ...prev, ...nextOpen }));
    }
  }, [searchTerm, groupedProjects]);

  // Calculate stats for a group of projects
  const computeGroupStats = (projectsList) => {
    let count = 0;
    let totalAmount = 0;
    let paidCount = 0;
    let dpCount = 0;
    let unpaidCount = 0;

    projectsList.forEach(p => {
      const s = getProjectStats(p.id);
      count += s.count;
      totalAmount += s.totalAmount;
      paidCount += s.paidCount;
      dpCount += s.dpCount;
      unpaidCount += s.unpaidCount;
    });

    return { count, totalAmount, paidCount, dpCount, unpaidCount };
  };

  // Toggle selection for an entire year folder
  const handleToggleYearGroup = (projectsInYear, e) => {
    e.stopPropagation();
    if (projectsInYear.length === 0) return;

    const groupIds = projectsInYear.map(p => p.id);
    const allInGroupSelected = groupIds.every(id => selectedProjectIds.includes(id));

    if (allInGroupSelected) {
      const remaining = selectedProjectIds.filter(id => !groupIds.includes(id));
      if (remaining.length === 0) {
        setSelectedProjectIds(['all']);
      } else {
        setSelectedProjectIds(remaining);
      }
    } else {
      const set = new Set(selectedProjectIds.filter(id => id !== 'all'));
      groupIds.forEach(id => set.add(id));
      setSelectedProjectIds(Array.from(set));
    }
  };

  // Filter groups by selected year filter
  const effectiveYearFilter = isDirectory ? yearFilter : selectedYearFilter;
  const displayedGroups = useMemo(() => {
    if (effectiveYearFilter === 'all') return groupedProjects;
    return groupedProjects.filter(g => g.year === effectiveYearFilter);
  }, [groupedProjects, effectiveYearFilter]);

  // Total visible projects count
  const totalVisibleProjects = useMemo(() => {
    return displayedGroups.reduce((acc, g) => acc + g.projects.length, 0);
  }, [displayedGroups]);

  // Total empty projects count
  const totalEmptyProjects = useMemo(() => {
    return allAvailableProjects.filter(p => getProjectStats(p.id).count === 0).length;
  }, [allAvailableProjects, getProjectStats]);

  // Get array of selected projects (for batch actions)
  const selectedProjectsList = useMemo(() => {
    if (isAllSelected) return [];
    return allAvailableProjects.filter(p => selectedProjectIds.includes(p.id));
  }, [allAvailableProjects, selectedProjectIds, isAllSelected]);

  // --- DELETE & SOFT-DELETE ACTIONS ---
  const triggerSingleDelete = (proj, e) => {
    e.stopPropagation();
    setProjectsToDelete([proj]);
    setIsDeleteModalOpen(true);
  };

  const triggerBatchDelete = () => {
    if (selectedProjectsList.length === 0) return;
    setProjectsToDelete(selectedProjectsList);
    setIsDeleteModalOpen(true);
  };

  const triggerFolderDelete = (group, e) => {
    e.stopPropagation();
    if (!group || group.projects.length === 0) {
      alert(`Folder ${group?.year} sudah kosong.`);
      return;
    }
    setFolderToDelete(group);
    setIsDeleteFolderModalOpen(true);
  };

  // Execute soft delete for single or multiple projects
  const handleConfirmSoftDelete = async (projectIds) => {
    setIsProcessingAction(true);
    try {
      const res = await api.softDeleteProjects(projectIds, 'Dihapus dari Pemilihan Project', 'Admin');
      if (res && res.success) {
        setIsDeleteModalOpen(false);
        setIsDeleteFolderModalOpen(false);

        // Deselect deleted projects
        const remaining = selectedProjectIds.filter(id => !projectIds.includes(id));
        if (remaining.length === 0 || isAllSelected) {
          setSelectedProjectIds(['all']);
        } else {
          setSelectedProjectIds(remaining);
        }

        // Setup undo toast
        const deletedNames = projectsToDelete.map(p => p.title).join(', ');
        const message = projectIds.length === 1 
          ? `Project "${deletedNames}" dipindahkan ke Sampah`
          : `${projectIds.length} project dipindahkan ke Sampah`;

        setUndoToast({
          projectIds,
          message
        });

        // Clear timer if exists
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => {
          setUndoToast(null);
        }, 8000);

        showToast?.(`🗑️ ${message}`);
        await loadTrashCount();
        onProjectsModified?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal menghapus project'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal menghubungi server');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Execute undo restore
  const handleUndo = async () => {
    if (!undoToast || !undoToast.projectIds) return;
    const ids = undoToast.projectIds;
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    try {
      const res = await api.restoreProjects(ids, 'Admin');
      if (res && res.success) {
        showToast?.(`✅ ${ids.length} project berhasil dipulihkan`);
        await loadTrashCount();
        onProjectsModified?.();
      } else {
        showToast?.(`⚠️ ${res?.error || 'Gagal memulihkan project'}`);
      }
    } catch (e) {
      showToast?.('⚠️ Gagal memulihkan project');
    }
  };

  // ------------------------------------------------------------------------------------------
  // DIRECTORY MODE: Folder Tahun -> Subfolder Project -> content rendered by the page
  // ------------------------------------------------------------------------------------------
  if (isDirectory) {
    const statusBadges = (st, size = 'text-[10px]') => (
      <div className={`flex items-center gap-1 ${size}`}>
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200" title="Lunas">{st.paidCount} Lunas</span>
        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200" title="Uang Muka (DP)">{st.dpCount} DP</span>
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200" title="Menunggu Bayar">{st.unpaidCount} Menunggu</span>
      </div>
    );
    const visibleGroups = displayedGroups.filter(group => {
      if (group.projects.length > 0) return true;
      return group.year === currentYearWIB() && !hideEmpty && effectiveYearFilter === 'all';
    });

    return (
      <div className="space-y-3">
        {visibleGroups.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            Tidak ada project yang cocok dengan filter.
          </div>
        )}
        {visibleGroups.map(group => {
          const isOpen = Boolean(openFolders[group.year]);
          const stats = computeGroupStats(group.projects);
          return (
            <div key={group.year} className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs transition-all duration-200">
              {/* Year folder header */}
              <div
                onClick={() => toggleFolder(group.year)}
                className={`p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none transition-colors border-b ${
                  isOpen ? 'bg-slate-50/90 border-slate-200' : 'bg-white hover:bg-slate-50/60 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-500'}`}>
                    {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 tracking-tight">
                      {group.year === 'Tanpa Tahun' ? 'Folder Tanpa Tahun' : `Tahun ${group.year}`}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {group.projects.length} Project
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3 justify-between sm:justify-end shrink-0">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-600">{stats.count} {countLabel}</span>
                    <span className="text-xs font-bold font-mono text-slate-900 ml-2 whitespace-nowrap">Rp {stats.totalAmount.toLocaleString('id-ID')}</span>
                  </div>
                  {statusBadges(stats)}
                  <div className="w-5 h-5 flex items-center justify-center text-slate-400">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="p-2.5 sm:p-4 bg-slate-50/40 animate-fadeIn space-y-2.5">
                  {group.projects.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      Folder ini kosong (Belum ada project aktif di tahun ini).
                    </div>
                  ) : group.projects.map(proj => {
                    const ps = getProjectStats(proj.id);
                    const isEmpty = ps.count === 0;
                    const projectOpen = Boolean(openProjects[proj.id]);
                    return (
                      <div key={proj.id} className={`border rounded-xl bg-white overflow-hidden transition-all ${
                        projectOpen ? 'border-slate-300 shadow-xs' : 'border-slate-200'
                      } ${isEmpty ? 'opacity-60' : ''}`}>
                        {/* Project subfolder header */}
                        <div
                          onClick={() => toggleProject(proj.id)}
                          className={`p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 cursor-pointer select-none transition-colors ${
                            projectOpen ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${projectOpen ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                              <Building2 size={14} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">{proj.title || proj.id}</span>
                                {proj.status && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${proj.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                    {proj.status === 'published' ? 'Live' : 'Draft'}
                                  </span>
                                )}
                                {isEmpty && <span className="text-[10px] italic text-slate-400">Belum ada tenant</span>}
                              </div>
                              {/* Date & venue always shown: many projects share the same name */}
                              <div className="text-[10px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                                <span className="inline-flex items-center gap-1"><Calendar size={10} /> {proj._dateInfo?.formattedDate || '-'}</span>
                                <span className="truncate inline-flex items-center gap-1"><MapPin size={10} className="text-slate-400" /> {proj.venue || 'Venue belum diisi'}</span>
                                <span className="font-mono text-slate-400">{proj.id}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 flex-wrap justify-between lg:justify-end shrink-0 pl-9 lg:pl-0">
                            {ps.totalBooths !== undefined && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                {ps.occupiedBooths} / {ps.totalBooths} booth terisi
                              </span>
                            )}
                            <span className="text-[11px] font-bold text-slate-600">{ps.count} {countLabel}</span>
                            <span className="text-xs font-bold font-mono text-slate-900 whitespace-nowrap">Rp {ps.totalAmount.toLocaleString('id-ID')}</span>
                            {statusBadges(ps)}
                            <div className="w-5 h-5 flex items-center justify-center text-slate-400">
                              {projectOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </div>
                          </div>
                        </div>

                        {projectOpen && (
                          <div className="border-t border-slate-100 animate-fadeIn">
                            {isEmpty ? (
                              <div className="p-5 text-center text-xs text-slate-400">Belum ada tenant di project ini.</div>
                            ) : renderProjectContent?.(proj)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={17} className="text-slate-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Pilih Project / Denah Pameran
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {allAvailableProjects.length} Project Terdaftar
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Dikelompokkan otomatis dalam folder per tahun. Klik kartu atau baris untuk filter invoice, centang untuk rekap gabungan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch Delete Action (Visible when projects are checked) */}
          {!isAllSelected && selectedProjectsList.length > 0 && (
            <button
              type="button"
              onClick={triggerBatchDelete}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer animate-fadeIn"
              title="Hapus project terpilih ke sampah"
            >
              <Trash2 size={13} className="text-rose-600" />
              <span>Hapus Terpilih ({selectedProjectsList.length})</span>
            </button>
          )}

          {/* Sampah (Trash) Manager Button with Badge */}
          <button
            type="button"
            onClick={() => setIsTrashModalOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Buka panel Sampah & Log Aktivitas"
          >
            <Trash2 size={13} className="text-slate-500" />
            <span>Sampah</span>
            {trashCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                {trashCount}
              </span>
            )}
          </button>

          {/* Select All Toggle Button */}
          <button
            type="button"
            onClick={handleSelectAllProjects}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
              isAllSelected
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {isAllSelected ? (
              <>
                <Check size={13} strokeWidth={3} />
                <span>Semua Terpilih</span>
              </>
            ) : (
              <span>Pilih Semua Project</span>
            )}
          </button>
        </div>
      </div>

      {/* Featured Global Card: "Semua Project" (Always on Top Outside Folders) */}
      <div
        onClick={() => handleSelectSoloProject('all')}
        className={`relative p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none group ${
          isAllSelected
            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
            : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isAllSelected ? 'bg-slate-800 text-white border border-slate-700/80' : 'bg-slate-100 border border-slate-200/70 text-slate-700'
            }`}>
              <Globe size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-xs sm:text-sm font-semibold leading-tight ${isAllSelected ? 'text-white' : 'text-slate-900'}`}>
                  Semua Project & Denah
                </h3>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                  isAllSelected ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  Global Rekap
                </span>
              </div>
              <span className={`text-[11px] ${isAllSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                Tampilkan rekap gabungan invoice dari seluruh project di semua tahun
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end">
            <div className="text-right">
              <span className={`text-[11px] font-medium block ${isAllSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                {allStats.count} Invoice Terbit
              </span>
              <span className={`text-xs sm:text-sm font-semibold font-mono ${isAllSelected ? 'text-white' : 'text-slate-900'}`}>
                Rp {allStats.totalAmount.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10px]">
              <span className={`px-2 py-0.5 rounded-md font-medium border ${
                isAllSelected ? 'bg-slate-800 text-emerald-400 border-slate-700' : 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
              }`}>
                {allStats.paidCount} Lunas
              </span>
              <span className={`px-2 py-0.5 rounded-md font-medium border ${
                isAllSelected ? 'bg-slate-800 text-blue-400 border-slate-700' : 'bg-blue-50 text-blue-700 border-blue-200/80'
              }`}>
                {allStats.dpCount} DP
              </span>
              <span className={`px-2 py-0.5 rounded-md font-medium border ${
                isAllSelected ? 'bg-slate-800 text-amber-400 border-slate-700' : 'bg-amber-50 text-amber-700 border-amber-200/80'
              }`}>
                {allStats.unpaidCount} Belum
              </span>
            </div>

            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
              isAllSelected ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300 bg-white group-hover:border-slate-400'
            }`}>
              {isAllSelected && <Check size={12} strokeWidth={2.5} />}
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter Toolbar & View Controls */}
      <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari project / venue / denah..."
            className="w-full pl-8.5 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters & Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <Calendar size={13} className="text-slate-400" />
            <select
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Tahun</option>
              {allYears.map(yr => (
                <option key={yr} value={yr}>
                  {yr === 'Tanpa Tahun' ? yr : `Tahun ${yr}`}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <SlidersHorizontal size={13} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Status</option>
              <option value="unpaid">Ada Belum Lunas</option>
              <option value="paid">Lunas Semua</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <ArrowUpDown size={13} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="date_desc">Tanggal (Terbaru)</option>
              <option value="date_asc">Tanggal (Terlama)</option>
              <option value="name_asc">Nama (A - Z)</option>
              <option value="amount_desc">Nilai Terbesar</option>
              <option value="invoice_desc">Invoice Terbanyak</option>
            </select>
          </div>

          {/* Hide Empty Projects Toggle */}
          <button
            type="button"
            onClick={() => setHideEmptyProjects(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              hideEmptyProjects
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Sembunyikan project dengan 0 Invoice"
          >
            {hideEmptyProjects ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>Sembunyikan Kosong</span>
            {totalEmptyProjects > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/80 text-slate-600">
                {totalEmptyProjects}
              </span>
            )}
          </button>

          {/* View Mode Switcher (Grid vs List) */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs ml-auto sm:ml-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tampilan Grid (Kartu)"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tampilan List (Baris)"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Empty Search Results Message */}
      {totalVisibleProjects === 0 && (
        <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <p className="text-xs font-semibold text-slate-500">
            Tidak ada project yang sesuai dengan filter atau pencarian Anda.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedYearFilter('all');
              setStatusFilter('all');
              setHideEmptyProjects(false);
            }}
            className="mt-2 text-xs font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      )}

      {/* Accordion Folder Per Tahun */}
      <div className="space-y-3">
        {displayedGroups.map(group => {
          // If group is empty, only render it if it's the current year and no search/filters are active!
          if (group.projects.length === 0) {
            const isCurrentYear = group.year === currentYearWIB();
            if (!isCurrentYear || searchTerm || statusFilter !== 'all' || hideEmptyProjects) {
              return null;
            }
          }

          const isOpen = Boolean(openFolders[group.year]);
          const stats = computeGroupStats(group.projects);
          const groupIds = group.projects.map(p => p.id);
          const selectedInGroupCount = groupIds.filter(id => isProjectActive(id)).length;
          const isGroupAllSelected = isAllSelected || (groupIds.length > 0 && selectedInGroupCount === groupIds.length);
          const isGroupIndeterminate = !isGroupAllSelected && selectedInGroupCount > 0;

          return (
            <div 
              key={group.year} 
              className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs transition-all duration-200"
            >
              {/* Folder Header */}
              <div 
                onClick={() => toggleFolder(group.year)}
                className={`p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none transition-colors border-b ${
                  isOpen 
                    ? 'bg-slate-50/90 border-slate-200' 
                    : 'bg-white hover:bg-slate-50/60 border-transparent'
                }`}
              >
                {/* Left: Folder Icon & Year Identity */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isOpen ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                  </div>

                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 tracking-tight">
                      {group.year === 'Tanpa Tahun' ? 'Folder Tanpa Tahun' : `Tahun ${group.year}`}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {group.projects.length} Project
                    </span>
                    {group.projects.length < group.totalInYear && (
                      <span className="text-[10px] text-slate-400">
                        (terfilter dari {group.totalInYear})
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Year Invoices Summary, Delete Folder Button & Select-All Checkbox */}
                <div className="flex items-center gap-2.5 sm:gap-3 justify-between sm:justify-end shrink-0">
                  {/* Stats Badges */}
                  <div className="flex items-center gap-2 text-right">
                    <div className="hidden md:block">
                      <span className="text-[11px] font-bold text-slate-600">
                        {stats.count} Inv
                      </span>
                      <span className="text-xs font-bold font-mono text-slate-900 ml-2">
                        Rp {stats.totalAmount.toLocaleString('id-ID')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200" title="Invoice Lunas">
                        {stats.paidCount} Lunas
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200" title="Uang Muka (DP)">
                        {stats.dpCount} DP
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200" title="Belum Lunas">
                        {stats.unpaidCount} Belum
                      </span>
                    </div>
                  </div>

                  {/* Delete Folder Action Button */}
                  {group.projects.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => triggerFolderDelete(group, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`Hapus seluruh folder ${group.year === 'Tanpa Tahun' ? 'Tanpa Tahun' : `Tahun ${group.year}`}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  {/* Select Entire Folder Checkbox */}
                  <div 
                    onClick={(e) => handleToggleYearGroup(group.projects, e)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                    title={isGroupAllSelected ? "Batalkan pilihan tahun ini" : "Pilih semua project di tahun ini"}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                      isGroupAllSelected 
                        ? 'bg-slate-900 border-slate-900 text-white' 
                        : (isGroupIndeterminate ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 bg-white')
                    }`}>
                      {isGroupAllSelected && <Check size={11} strokeWidth={3} />}
                      {isGroupIndeterminate && <Minus size={11} strokeWidth={3} />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 hidden lg:inline">
                      {isGroupAllSelected ? 'Semua Terpilih' : (isGroupIndeterminate ? `${selectedInGroupCount} Terpilih` : 'Pilih Tahun')}
                    </span>
                  </div>

                  {/* Expand / Collapse Chevron */}
                  <div className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-transform">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>
              </div>

              {/* Folder Content (Collapsible) */}
              {isOpen && (
                <div className="p-3 sm:p-4 bg-slate-50/40 animate-fadeIn">
                  {group.projects.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      Folder ini kosong (Belum ada project aktif di tahun ini).
                    </div>
                  ) : viewMode === 'grid' ? (
                    /* --- GRID VIEW (4 Cols on Desktop, 2 on Tablet, 1 on Mobile) --- */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {group.projects.map(proj => {
                        const projStats = getProjectStats(proj.id);
                        const isSelected = isProjectActive(proj.id);
                        const isEmpty = projStats.count === 0;

                        return (
                          <div
                            key={proj.id}
                            onClick={() => handleSelectSoloProject(proj.id)}
                            className={`relative p-3.5 rounded-xl border transition-all cursor-pointer select-none group flex flex-col justify-between ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : (isEmpty 
                                    ? 'bg-white/80 opacity-65 hover:opacity-100 border-slate-200 hover:border-slate-300' 
                                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90 hover:border-slate-300 shadow-2xs')
                            }`}
                          >
                            <div>
                              {/* Header Card */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-start gap-2 min-w-0">
                                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                    isSelected 
                                      ? 'bg-slate-800 text-white border border-slate-700' 
                                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                                  }`}>
                                    <Building2 size={13} />
                                  </div>
                                  <div className="min-w-0">
                                    {proj.event_title && (
                                      <span className={`text-[9px] font-medium uppercase tracking-wider block truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`} title={proj.event_title}>
                                        {proj.event_title}
                                      </span>
                                    )}
                                    <h3 className={`text-xs font-semibold leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-900'}`} title={proj.title}>
                                      {proj.title}
                                    </h3>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Delete Action button (appears on hover on desktop, always visible on mobile) */}
                                  <button
                                    type="button"
                                    onClick={(e) => triggerSingleDelete(proj, e)}
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                                    title="Hapus project ke sampah"
                                  >
                                    <Trash2 size={13} />
                                  </button>

                                  {/* Multi-selection checkbox */}
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleProject(proj.id, e)}
                                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer ${
                                      isSelected 
                                        ? 'bg-slate-800 border-slate-700 text-white' 
                                        : 'border-slate-300 bg-white hover:border-slate-400'
                                    }`}
                                    title={isSelected ? 'Keluarkan dari pilihan' : 'Tambahkan ke pilihan gabungan'}
                                  >
                                    {isSelected && <Check size={12} strokeWidth={2.5} />}
                                  </button>
                                </div>
                              </div>

                              {/* Date & Venue Badges */}
                              <div className="space-y-1 mb-2.5">
                                <div className={`flex items-center gap-1.5 text-[10px] font-medium ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                  <Calendar size={11} className={isSelected ? 'text-slate-400' : 'text-slate-400'} shrink-0 />
                                  <span className="truncate">{proj._dateInfo.formattedDate}</span>
                                </div>
                                <div className={`text-[10px] truncate flex items-center gap-1 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`} title={proj.venue || 'Venue Expo'}>
                                  <MapPin size={10} className="shrink-0" />
                                  <span className="truncate">{proj.venue || 'Venue Expo'}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              {/* Bottom Stats */}
                              <div className={`pt-2 border-t flex items-center justify-between ${isSelected ? 'border-slate-800' : 'border-slate-200/60'}`}>
                                <span className={`text-[11px] font-medium ${isEmpty ? 'text-slate-400' : (isSelected ? 'text-slate-300' : 'text-slate-600')}`}>
                                  {projStats.count} Invoice
                                </span>
                                <span className={`text-xs font-semibold font-mono ${isEmpty ? 'text-slate-400' : (isSelected ? 'text-white' : 'text-slate-900')}`}>
                                  Rp {projStats.totalAmount.toLocaleString('id-ID')}
                                </span>
                              </div>

                              {/* Status Badges */}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px]">
                                <span className={`px-1.5 py-0.2 rounded font-medium border ${
                                  isSelected ? 'bg-slate-800 text-emerald-400 border-slate-700' : 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                }`}>
                                  {projStats.paidCount} Lunas
                                </span>
                                <span className={`px-1.5 py-0.2 rounded font-medium border ${
                                  isSelected ? 'bg-slate-800 text-blue-400 border-slate-700' : 'bg-blue-50 text-blue-700 border-blue-200/80'
                                }`}>
                                  {projStats.dpCount} DP
                                </span>
                                <span className={`px-1.5 py-0.2 rounded font-medium border ${
                                  isSelected ? 'bg-slate-800 text-amber-400 border-slate-700' : 'bg-amber-50 text-amber-700 border-amber-200/80'
                                }`}>
                                  {projStats.unpaidCount} Belum
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* --- LIST VIEW (Compact Row Table) --- */
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="divide-y divide-slate-100">
                        {group.projects.map(proj => {
                          const projStats = getProjectStats(proj.id);
                          const isSelected = isProjectActive(proj.id);
                          const isEmpty = projStats.count === 0;

                          return (
                            <div
                              key={proj.id}
                              onClick={() => handleSelectSoloProject(proj.id)}
                              className={`p-2.5 sm:px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors cursor-pointer select-none group ${
                                isSelected 
                                  ? 'bg-slate-100 hover:bg-slate-100/90' 
                                  : (isEmpty 
                                      ? 'opacity-65 hover:opacity-100 hover:bg-slate-50/80' 
                                      : 'hover:bg-slate-50/80')
                              }`}
                            >
                              {/* Left Info */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleProject(proj.id, e)}
                                  className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${
                                    isSelected 
                                      ? 'bg-slate-900 border-slate-900 text-white' 
                                      : 'border-slate-300 bg-white hover:border-slate-400'
                                  }`}
                                >
                                  {isSelected && <Check size={12} strokeWidth={2.5} />}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className={`text-xs font-semibold truncate ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                                      {proj.title}
                                    </h4>
                                    {proj.event_title && (
                                      <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                        {proj.event_title}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                                    <span className="flex items-center gap-1 text-slate-500">
                                      <Calendar size={10} />
                                      <span>{proj._dateInfo.formattedDate}</span>
                                    </span>
                                    <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400" /> {proj.venue || 'Venue Expo'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Right Stats & Badges & Actions */}
                              <div className="flex items-center gap-3 sm:gap-4 justify-between sm:justify-end shrink-0 pl-7 sm:pl-0">
                                <div className="text-right">
                                  <span className={`text-[11px] font-bold block ${isEmpty ? 'text-slate-400' : 'text-slate-700'}`}>
                                    {projStats.count} Invoice
                                  </span>
                                  <span className={`text-xs font-bold font-mono ${isEmpty ? 'text-slate-400' : 'text-slate-900'}`}>
                                    Rp {projStats.totalAmount.toLocaleString('id-ID')}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 text-[9px]">
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                    {projStats.paidCount} Lunas
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                                    {projStats.dpCount} DP
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                                    {projStats.unpaidCount} Belum
                                  </span>
                                </div>

                                {/* Trash action button */}
                                <button
                                  type="button"
                                  onClick={(e) => triggerSingleDelete(proj, e)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                                  title="Hapus project ke sampah"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Undo Notification Toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <Trash2 size={15} className="text-rose-400" />
            <span className="font-medium">{undoToast.message}</span>
          </div>

          <button
            type="button"
            onClick={handleUndo}
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
          >
            <RotateCcw size={13} />
            <span>Batalkan</span>
          </button>

          <button
            type="button"
            onClick={() => setUndoToast(null)}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Delete Project Modal (Single or Batch) */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        projectsToDelete={projectsToDelete}
        getProjectStats={getProjectStats}
        onConfirmDelete={handleConfirmSoftDelete}
        isProcessing={isProcessingAction}
      />

      {/* Delete Folder Modal */}
      <DeleteFolderConfirmModal
        isOpen={isDeleteFolderModalOpen}
        onClose={() => setIsDeleteFolderModalOpen(false)}
        group={folderToDelete}
        getProjectStats={getProjectStats}
        onConfirmDeleteFolder={(projectIds) => handleConfirmSoftDelete(projectIds)}
        isProcessing={isProcessingAction}
      />

      {/* Trash & Activity Log Manager Modal */}
      <TrashManagerModal
        isOpen={isTrashModalOpen}
        onClose={() => {
          setIsTrashModalOpen(false);
          loadTrashCount();
        }}
        onProjectsChanged={() => {
          loadTrashCount();
          onProjectsModified?.();
        }}
        showToast={showToast}
      />
    </div>
  );
}
