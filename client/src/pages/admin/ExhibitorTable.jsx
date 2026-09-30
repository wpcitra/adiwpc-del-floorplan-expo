import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Download, Send, Filter, Users, Layers, Tag, FileText, Sliders, Calendar, Eye, EyeOff, AlertTriangle, ChevronDown } from 'lucide-react';
import { api } from '../../services/api';
import ProjectYearFolderSelector, { getProjectDateInfo } from '../../components/admin/ProjectYearFolderSelector';
import InvoiceEditorModal from '../../components/admin/InvoiceEditorModal';
import InvoiceA4View from '../../components/admin/InvoiceA4View';
import GenerateTenantFacilityModal from '../../components/admin/GenerateTenantFacilityModal';
import { collapseMergedRows } from '../../utils/mergeRows';

export default function ExhibitorTable() {
  const [exhibitors, setExhibitors] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [brandCategoriesList, setBrandCategoriesList] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedBrandCategory, setSelectedBrandCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'sold' | 'dp' | 'reserved' | 'free'
  const [yearFilter, setYearFilter] = useState('all');
  const [floorplans, setFloorplans] = useState([]); // project details: event date, venue, booth counts
  const [hideEmpty, setHideEmpty] = useState(() => {
    try { return localStorage.getItem('exhibitor_directory_hide_empty') === 'true'; } catch (e) { return false; }
  });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [selectedInvoiceForA4, setSelectedInvoiceForA4] = useState(null);
  const [isGenerateFacilityModalOpen, setIsGenerateFacilityModalOpen] = useState(false);
  const [selectedTenantForFacility, setSelectedTenantForFacility] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const targetProj = selectedProject !== 'all' ? selectedProject : null;
        const cats = await api.fetchBrandCategories(false, targetProj);
        if (cats && Array.isArray(cats)) {
          setBrandCategoriesList(cats);
        } else {
          setBrandCategoriesList([]);
        }
      } catch (e) {
        console.warn("Failed to load brand categories for exhibitor filter:", e);
      }
    };
    loadCategories();
  }, [selectedProject]);

  // Derive categories strictly belonging to the currently selected project
  const projectCategories = React.useMemo(() => {
    const catMap = new Map();
    // 1. From database brand categories configured for this project
    brandCategoriesList.forEach(c => {
      if (c && c.name && c.name.trim()) {
        catMap.set(c.name.trim().toLowerCase(), c.name.trim());
      }
    });
    // 2. From actual exhibitors belonging to this project
    exhibitors.filter(e => selectedProject === 'all' || e.floorplanId === selectedProject).forEach(e => {
      const cat = (e.brandCategory || '').trim();
      if (cat && !catMap.has(cat.toLowerCase())) {
        catMap.set(cat.toLowerCase(), cat);
      }
    });
    return Array.from(catMap.values()).sort((a, b) => a.localeCompare(b));
  }, [brandCategoriesList, exhibitors, selectedProject]);

  // Auto-reset category filter if the selected category is not in the active project's categories
  useEffect(() => {
    if (selectedBrandCategory !== 'all') {
      const exists = projectCategories.some(c => c.toLowerCase() === selectedBrandCategory.toLowerCase());
      if (!exists) {
        setSelectedBrandCategory('all');
      }
    }
  }, [projectCategories, selectedBrandCategory]);

  useEffect(() => {
    try { localStorage.setItem('exhibitor_directory_hide_empty', String(hideEmpty)); } catch (e) {}
  }, [hideEmpty]);

  useEffect(() => {
    const onClickOutside = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setIsExportMenuOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    api.fetchFloorplanList().then(res => {
      const list = Array.isArray(res) ? res : (res?.floorplans || res?.data || []);
      setFloorplans(list);
    });
  }, []);

  // All tenants of all (non-deleted) projects are loaded once and grouped Tahun -> Project on the client,
  // so every folder, badge and filter works on the same data as Manajemen Invoice / Studio / Live Floorplan.
  useEffect(() => {
    const loadData = async () => {
      const res = await api.fetchExhibitors('all');
      let list = [];
      if (res && res.exhibitors) {
        list = res.exhibitors || [];
        if (res.projectsList && res.projectsList.length > 0) {
          setProjectsList(res.projectsList);
        }
      } else if (Array.isArray(res)) {
        list = res;
      }
      
      const uniqueList = [];
      const seen = new Set();
      list.forEach(item => {
        const key = `${item.floorplanId || item.projectId || 'default'}_${item.booth || item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueList.push(item);
        }
      });

      // Auto-merge: booths of one merge group become one exhibitor row "#A-01+A-03+A-04"
      setExhibitors(collapseMergedRows(uniqueList));
    };

    loadData();
  }, []);

  // Projects shown as subfolders: /floorplan/list (date, venue, booth counts) + any project referenced by a tenant
  const allProjects = useMemo(() => {
    const byId = new Map(floorplans.map(fp => [fp.id, fp]));
    projectsList.forEach(p => { if (!byId.has(p.id)) byId.set(p.id, { ...p }); });
    return [...byId.values()];
  }, [floorplans, projectsList]);

  const projectYear = useMemo(() => {
    const map = new Map();
    allProjects.forEach(p => map.set(p.id, getProjectDateInfo(p).year));
    return map;
  }, [allProjects]);

  const allYears = useMemo(() => [...new Set(projectYear.values())].sort((a, b) => {
    if (a === 'Tanpa Tahun') return 1;
    if (b === 'Tanpa Tahun') return -1;
    return Number(b) - Number(a);
  }), [projectYear]);

  const exhStatus = (e) => {
    const paymentStatus = (e.payment_status || e.invoicePaymentStatus || '').toUpperCase();
    if (e.status === 'free' || e.category === 'Free' || e.price === 0) return 'free';
    if (paymentStatus === 'PAID' || e.status === 'sold' || e.status === 'paid') return 'sold';
    if (paymentStatus === 'PARTIAL') return 'dp';
    if (paymentStatus === 'CANCELED') return 'canceled';
    return 'reserved';
  };

  const filteredExhibitors = exhibitors.filter(e => {
    const matchesProject = selectedProject === 'all' || e.floorplanId === selectedProject;
    const matchesYear = yearFilter === 'all' || projectYear.get(e.floorplanId) === yearFilter;
    const matchesCategory = 
      selectedBrandCategory === 'all' || 
      (e.brandCategory || '').toLowerCase() === selectedBrandCategory.toLowerCase();

    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      (e.booth || '').toLowerCase().includes(q) ||
      (e.company || '').toLowerCase().includes(q) || 
      (e.pic || '').toLowerCase().includes(q) ||
      (e.brandCategory || '').toLowerCase().includes(q) ||
      (e.contact || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'all' || exhStatus(e) === statusFilter;
    return matchesProject && matchesYear && matchesSearch && matchesCategory && matchesStatus;
  });

  const exhibitorsByProject = useMemo(() => {
    const map = new Map();
    filteredExhibitors.forEach(e => {
      if (!map.has(e.floorplanId)) map.set(e.floorplanId, []);
      map.get(e.floorplanId).push(e);
    });
    map.forEach(list => list.sort((a, b) => String(a.booth).localeCompare(String(b.booth), 'id', { numeric: true })));
    return map;
  }, [filteredExhibitors]);

  const filtersActive = Boolean(searchTerm.trim()) || selectedBrandCategory !== 'all' || statusFilter !== 'all';

  // Folder / subfolder header numbers follow the active filters
  const getProjectStats = useCallback((projId) => {
    const list = exhibitorsByProject.get(projId) || [];
    const fp = allProjects.find(p => p.id === projId) || {};
    return {
      count: list.length,
      totalAmount: list.reduce((acc, e) => acc + (Number(e.price) || 0), 0),
      paidCount: list.filter(e => exhStatus(e) === 'sold').length,
      dpCount: list.filter(e => exhStatus(e) === 'dp').length,
      unpaidCount: list.filter(e => exhStatus(e) === 'reserved').length,
      occupiedBooths: (Number(fp.reservedBooths) || 0) + (Number(fp.soldBooths) || 0),
      totalBooths: fp.totalBooths !== undefined ? Number(fp.totalBooths) : undefined
    };
  }, [exhibitorsByProject, allProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleProjects = allProjects.filter(p => selectedProject === 'all' || p.id === selectedProject);

  // Search results open their year folder and project subfolder
  const autoOpenProjectIds = searchTerm.trim() ? [...exhibitorsByProject.keys()] : null;

  const statusLabel = (e) => ({
    free: 'Gratis (Sponsor)', sold: 'Lunas (Sold)', dp: 'Uang Muka (DP)', canceled: 'Batal', reserved: 'Menunggu Bayar (Reserved)'
  }[exhStatus(e)] || 'Menunggu Bayar');

  // Export Exhibitor Directory to CSV: scope 'all' (current filters) | { year } | { projectId }
  const handleExportCSV = (scope = 'all') => {
    setIsExportMenuOpen(false);
    const list = scope === 'all'
      ? filteredExhibitors
      : scope.year
        ? filteredExhibitors.filter(e => projectYear.get(e.floorplanId) === scope.year)
        : filteredExhibitors.filter(e => e.floorplanId === scope.projectId);
    if (list.length === 0) {
      showToast('⚠️ Tidak ada data tenant untuk diekspor');
      return;
    }

    const csvCell = (v) => `"${String(v ?? '-').replace(/"/g, '""')}"`;
    const projectOf = (id) => allProjects.find(p => p.id === id) || {};
    const headers = ['Tahun', 'Nama Project', 'Tanggal Event', 'ID Project', 'Nomor Booth', 'Nama Brand / Tenant', 'Kategori Brand', 'Total Tagihan', 'Status Pembayaran', 'Kontak PIC', 'Email', 'Tanggal Booking'];
    const rows = list.map(e => {
      const proj = projectOf(e.floorplanId);
      return [
        projectYear.get(e.floorplanId) || 'Tanpa Tahun',
        proj.title || e.projectName || '-',
        getProjectDateInfo(proj).formattedDate,
        e.floorplanId,
        e.booth || '-',
        e.company || '-',
        e.brandCategory || '-',
        e.price || 0,
        statusLabel(e),
        e.pic || '-',
        e.email || '-',
        e.date || '-'
      ].map(csvCell);
    });

    const suffix = scope === 'all' ? 'Semua' : scope.year ? `Tahun-${scope.year}` : `Project-${scope.projectId}`;
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Tenant-Exhibitor-${suffix}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Send Official Invoice via WhatsApp Web API (100% Gratis via Official WA Web DeepLink API)
  const handleSendWhatsAppInvoice = (exh) => {
    const contact = exh.contact || exh.phone || '';
    if (!contact || contact === '-') {
      alert('Nomor WhatsApp / HP kontak PIC tidak tersedia');
      return;
    }
    const cleanPhone = contact.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;

    const invoiceNo = exh.invoiceNumber || `INV/EXP-${Date.now().toString().slice(-6)}`;
    const isPaid = exh.status === 'sold' || exh.status === 'paid';
    const isFree = exh.status === 'free' || exh.category === 'Free' || exh.price === 0;
    const statusText = isFree ? '🎁 GRATIS (SPONSOR)' : isPaid ? '✅ LUNAS (PAID)' : '⏳ MENUNGGU PEMBAYARAN (UNPAID)';

    const messageText = 
`📌 *INVOICE & BUKTI RESERVASI BOOTH PAMERAN*
--------------------------------------------
No. Invoice : *${invoiceNo}*
Nama Brand  : *${exh.company}*
PIC / Penanggung Jawab : ${exh.pic || exh.company} (${exh.contact})
Nomor Booth : *#${exh.booth}*
Kategori Brand : ${exh.brandCategory || 'Umum'}
Total Tagihan: *Rp ${(exh.price || 0).toLocaleString('id-ID')}*
Status Pembayaran : *${statusText}*

${isFree ? 'Booth ini merupakan booth fasilitas sponsor / gratis.' : isPaid ? 'Terima kasih atas pembayaran Anda! Booth resmi terkonfirmasi.' : 'Mohon segera lakukan konfirmasi pembayaran untuk mengamankan lokasi booth Anda.'}

Salam hangat,
*Tim Event Organizer & Floorplan Studio*`;

    const encodedMsg = encodeURIComponent(messageText);

    // Official WhatsApp Web & Mobile DeepLink API (Gratis tanpa biaya berlangganan)
    const waWebUrl = `https://web.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodedMsg}`;
    const waApiUrl = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodedMsg}`;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    window.open(isMobile ? waApiUrl : waWebUrl, '_blank');
  };

  const handleViewTenantInvoice = async (exh) => {
    // Open the real invoice when the booth has one (DP / Pelunasan / Penuh with the contract breakdown)
    if (exh.invoiceNumber && exh.invoiceNumber !== 'INV/MANUAL') {
      const real = await api.fetchInvoiceById(exh.invoiceNumber);
      if (real) {
        setSelectedInvoiceForA4(real);
        return;
      }
    }
    const isFree = exh.price === 0 || exh.category === 'Free';
    const paymentStatus = (exh.payment_status || exh.invoicePaymentStatus || '').toUpperCase();
    const isPaid = paymentStatus === 'PAID' || exh.status === 'sold' || exh.status === 'paid';
    const effectivePaymentStatus = isPaid ? 'PAID' : (paymentStatus === 'PENDING' ? 'PENDING' : (paymentStatus === 'CANCELED' ? 'CANCELED' : (isFree ? 'FREE' : 'UNPAID')));
    const priceVal = exh.price || 5000000;

    const invObj = {
      id: `INV-${exh.booth || '01'}`,
      invoice_number: exh.invoiceNumber && exh.invoiceNumber !== 'INV/MANUAL' ? exh.invoiceNumber : `INV/2026/${exh.booth || '01'}`,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      client_name: exh.pic || exh.owner_name || 'Penanggung Jawab Tenant',
      company_name: exh.company || exh.brandName || 'Brand Tenant',
      email: exh.email || 'tenant@exhibitor.co.id',
      phone: exh.contact || exh.phone || '-',
      address: exh.address || 'Alamat Peserta Pameran',
      booth_code: exh.booth || 'A-01',
      booth_category: exh.category || 'Standard',
      event_name: selectedProjectInfo?.title || 'Indonesia International Expo 2026',
      event_venue: selectedProjectInfo?.venue || 'Jakarta Convention Center (Hall A)',
      subtotal: priceVal,
      discount: 0,
      tax_amount: Math.round(priceVal * 0.11),
      grand_total: isFree ? 0 : Math.round(priceVal * 1.11),
      payment_status: effectivePaymentStatus,
      items: [
        {
          description: `Sewa Booth Pameran ${exh.booth || 'A-01'} (${exh.category || 'Standard'})`,
          price: priceVal,
          qty: 1,
          total: priceVal
        }
      ]
    };
    setSelectedInvoiceForA4(invObj);
  };

  const handleOpenFacilityForm = (exh = null) => {
    if (exh) {
      setSelectedTenantForFacility({
        boothCode: exh.booth || 'A-01',
        companyName: exh.company || 'Nama Perusahaan',
        picName: exh.pic || exh.owner_name || 'PIC Tenant',
        phone: exh.contact || exh.phone || '',
        email: exh.email || ''
      });
    } else {
      setSelectedTenantForFacility(null);
    }
    setIsGenerateFacilityModalOpen(true);
  };

  const renderStatusBadge = (exh) => {
    const st = exhStatus(exh);
    const tone = {
      free: 'bg-blue-50 text-blue-700 border-blue-300', sold: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      dp: 'bg-blue-50 text-blue-700 border-blue-300', canceled: 'bg-rose-50 text-rose-700 border-rose-300',
      reserved: 'bg-amber-50 text-amber-700 border-amber-300'
    }[st];
    const dot = { free: 'bg-blue-500', sold: 'bg-emerald-500', dp: 'bg-blue-500', canceled: 'bg-rose-500', reserved: 'bg-amber-500' }[st];
    const isPending = (exh.payment_status || '').toUpperCase() === 'PENDING';
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border ${tone}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {st === 'reserved' && isPending ? 'Pending (Verifikasi)' : statusLabel(exh).replace(' (Reserved)', '')}
      </span>
    );
  };

  // Contract issued before the booth was re-priced / merged (e.g. invoice for A-04 on booth A-04+A-05)
  const renderMismatch = (exh) => exh.contractMismatch ? (
    <div className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-rose-600 font-sans font-medium min-w-[160px] max-w-[220px]" title="Periksa invoice booth ini di Manajemen Invoice">
      <AlertTriangle size={11} className="shrink-0 mt-0.5" />
      <span>Nilai kontrak berbeda dari harga booth saat ini (Rp {(exh.boothValue || 0).toLocaleString('id-ID')})</span>
    </div>
  ) : null;

  const renderActions = (exh) => (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      <button 
        type="button"
        onClick={() => handleOpenFacilityForm(exh)}
        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
        title="Buat Dokumen PDF Formulir Permintaan Fasilitas Tenant Ini (Kop Surat Resmi & WA)"
      >
        <FileText size={12} className="text-slate-600" />
        <span>Form Fasilitas</span>
      </button>
      <button 
        type="button"
        onClick={() => handleViewTenantInvoice(exh)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-2xs hover:shadow transition-all cursor-pointer"
        title="Lihat & Cetak Invoice A4 Resmi"
      >
        <FileText size={12} />
        <span>Invoice A4</span>
      </button>
      <button 
        type="button"
        onClick={() => handleSendWhatsAppInvoice(exh)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs hover:shadow transition-all cursor-pointer"
        title="Kirim Invoice resmi via WhatsApp Web API"
      >
        <Send size={12} />
        <span>Kirim WA</span>
      </button>
    </div>
  );

  // Level 3: tenant table of one project (cards on phones)
  const renderTenantTable = (project) => {
    const list = exhibitorsByProject.get(project.id) || [];
    return (
      <>
        {/* Desktop / tablet: table */}
        <div className="hidden md:block overflow-x-auto custom-scrollbar w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/90 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3 w-20">Booth</th>
                <th className="px-3.5 py-3 min-w-[170px]">Nama Brand / Tenant</th>
                <th className="px-3.5 py-3 w-36">Kategori Brand</th>
                <th className="px-3.5 py-3 w-32">Total Tagihan</th>
                <th className="px-3.5 py-3 w-36">Status</th>
                <th className="px-3.5 py-3 min-w-[130px]">Kontak / PIC</th>
                <th className="px-3.5 py-3 text-right min-w-[240px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((exh) => (
                <tr key={exh.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3.5 py-3">
                    <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-xs whitespace-nowrap"
                      title={exh.isMerged ? exh.mergedBooths.map(b => `${b.code} (${b.widthM}×${b.heightM} m)`).join(', ') : undefined}>
                      #{exh.booth || '-'}
                    </span>
                    {exh.isMerged && (
                      <div className="text-[10px] text-indigo-600 font-semibold mt-1">🔗 Gabungan {exh.mergedBooths.length} booth • {exh.areaSqm} m²{exh.mergedStatusLabel ? ` • ${exh.mergedStatusLabel}` : ''}</div>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="font-bold text-slate-900 text-xs truncate max-w-[200px]" title={exh.company}>{exh.company}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                      PIC: <span className="font-medium text-slate-700">{exh.pic || exh.company}</span> • {exh.date || '-'}
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    {exh.brandCategory ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        <Tag size={10} /> {exh.brandCategory}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px] italic bg-slate-100 px-2 py-0.5 rounded">Belum Diatur</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-slate-900 font-mono font-bold text-xs">
                    Rp {(exh.price || 0).toLocaleString('id-ID')}
                    {renderMismatch(exh)}
                  </td>
                  <td className="px-3.5 py-3">{renderStatusBadge(exh)}</td>
                  <td className="px-3.5 py-3 text-slate-600 text-xs">
                    <div className="font-semibold text-slate-800 text-xs truncate max-w-[140px]">{exh.contact || '-'}</div>
                    {exh.email && exh.email !== '-' && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={exh.email}>{exh.email}</div>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-right">{renderActions(exh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: stacked cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {list.map((exh) => (
            <div key={exh.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-[11px]">#{exh.booth || '-'}</span>
                  <div className="font-bold text-slate-900 text-sm mt-1.5 break-words">{exh.company}</div>
                  <div className="text-[11px] text-slate-500">PIC: {exh.pic || exh.company} • {exh.contact || '-'}</div>
                </div>
                {renderStatusBadge(exh)}
              </div>
              <div className="flex items-center justify-between text-xs">
                {exh.brandCategory ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"><Tag size={10} /> {exh.brandCategory}</span>
                ) : <span className="text-slate-400 text-[10px] italic">Kategori belum diatur</span>}
                <span className="font-mono font-bold text-slate-900">Rp {(exh.price || 0).toLocaleString('id-ID')}</span>
              </div>
              {renderMismatch(exh)}
              {renderActions(exh)}
            </div>
          ))}
        </div>
      </>
    );
  };

  const selectedProjectInfo = projectsList.find(p => p.id === selectedProject);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full animate-fadeIn">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Tenant & Exhibitor Directory</h1>
            {selectedProject !== 'all' && selectedProjectInfo && (
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium text-xs border border-slate-200 truncate max-w-[200px]">
                {selectedProjectInfo.title}
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm">
            Daftar peserta pameran dan brand tenant yang telah membooking/membeli booth.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* 1. PROJECT SELECTOR DROPDOWN */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs transition-colors">
            <Layers size={14} className="text-slate-500 shrink-0" />
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Semua Project ({allProjects.length})</option>
              {allProjects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.title} • {getProjectDateInfo(proj).formattedDate}
                </option>
              ))}
            </select>
          </div>

          {/* 1b. TAHUN FILTER DROPDOWN */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs transition-colors">
            <Calendar size={14} className="text-slate-500 shrink-0" />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Semua Tahun</option>
              {allYears.map(y => <option key={y} value={y}>{y === 'Tanpa Tahun' ? 'Tanpa Tahun' : `Tahun ${y}`}</option>)}
            </select>
          </div>

          {/* 2. KATEGORI BRAND FILTER DROPDOWN */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs transition-colors">
            <Tag size={14} className="text-slate-500 shrink-0" />
            <select
              value={selectedBrandCategory}
              onChange={(e) => setSelectedBrandCategory(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Semua Kategori ({projectCategories.length})</option>
              {projectCategories.map((catName) => (
                <option key={catName} value={catName}>
                  {catName}
                </option>
              ))}
            </select>
          </div>

          {/* 3. STATUS FILTER DROPDOWN */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-xs transition-colors">
            <Filter size={14} className="text-slate-500 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">Semua Status</option>
              <option value="sold">Lunas (Sold)</option>
              <option value="dp">Uang Muka (DP)</option>
              <option value="reserved">Menunggu Bayar</option>
              <option value="free">Gratis (Sponsor)</option>
            </select>
          </div>

          {/* BUTTON: FORMULIR PERMINTAAN FASILITAS TAMBAHAN */}
          <button
            type="button"
            onClick={() => handleOpenFacilityForm(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
            title="Buat Dokumen PDF Formulir Permintaan Fasilitas Tenant Resmi (Kop Surat & WhatsApp)"
          >
            <FileText size={13} className="text-slate-500" />
            <span>Form Fasilitas Tenant</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInvoiceEditorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
            title="Kustomisasi Visual Layout, Logo, Warna & Stempel Invoice A4"
          >
            <Sliders size={13} className="text-slate-500" />
            <span>Layout Invoice</span>
          </button>

          <div className="relative shrink-0" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Download size={13} /> 
              <span>CSV</span>
              <ChevronDown size={12} />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-72 max-h-80 overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 z-40 text-xs py-1">
                <button type="button" onClick={() => handleExportCSV('all')} className="w-full text-left px-3 py-2 hover:bg-slate-50 font-bold text-slate-800">
                  Semua data ({filteredExhibitors.length} tenant, sesuai filter)
                </button>
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Per Tahun</div>
                {allYears.map(y => (
                  <button key={y} type="button" onClick={() => handleExportCSV({ year: y })} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700">
                    {y === 'Tanpa Tahun' ? 'Tanpa Tahun' : `Tahun ${y}`}
                  </button>
                ))}
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Per Project</div>
                {allProjects.filter(p => (exhibitorsByProject.get(p.id) || []).length > 0).map(p => (
                  <button key={p.id} type="button" onClick={() => handleExportCSV({ projectId: p.id })} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700">
                    {p.title} <span className="text-slate-400">• {getProjectDateInfo(p).formattedDate}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: search, year filter, hide-empty toggle, active-filter total */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Cari nomer booth, brand, kategori, PIC..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setHideEmpty(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              hideEmpty ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
            title="Sembunyikan project yang belum punya tenant"
          >
            {hideEmpty ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>Sembunyikan Kosong</span>
          </button>
          <span className="text-xs text-slate-500 font-semibold bg-slate-200/60 px-3 py-1.5 rounded-lg">
            Total: <span className="text-slate-900 font-bold">{filteredExhibitors.length}</span> Tenant / Exhibitor
          </span>
        </div>
      </div>

      {/* Folder Tahun -> Subfolder Project -> Tabel Tenant */}
      {exhibitors.length === 0 && allProjects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 text-center text-slate-500">
          <Users size={32} className="text-slate-300 mb-3 mx-auto" />
          <p className="font-semibold text-slate-700 text-sm">Tidak Ada Tenant / Exhibitor Terdaftar</p>
          <p className="text-xs text-slate-400 mt-1">Belum ada transaksi pendaftaran booth atau data exhibitor.</p>
        </div>
      ) : (
        <ProjectYearFolderSelector
          mode="directory"
          storageKey="exhibitor_directory"
          allAvailableProjects={visibleProjects}
          getProjectStats={getProjectStats}
          renderProjectContent={renderTenantTable}
          yearFilter={yearFilter}
          hideEmpty={hideEmpty || filtersActive}
          autoOpenProjectIds={autoOpenProjectIds}
          countLabel="Tenant"
          showToast={showToast}
        />
      )}

      {/* Invoice Layout Visual Editor Modal */}
      <InvoiceEditorModal
        isOpen={isInvoiceEditorOpen}
        onClose={() => setIsInvoiceEditorOpen(false)}
      />

      {/* Invoice A4 View Modal */}
      {selectedInvoiceForA4 && (
        <InvoiceA4View
          invoice={selectedInvoiceForA4}
          onClose={() => setSelectedInvoiceForA4(null)}
          onOpenEditor={() => {
            setSelectedInvoiceForA4(null);
            setIsInvoiceEditorOpen(true);
          }}
        />
      )}

      {/* Generate Tenant Facility Modal (PDF & WA with Company Letterhead & Template Catalog) */}
      <GenerateTenantFacilityModal
        isOpen={isGenerateFacilityModalOpen}
        onClose={() => {
          setIsGenerateFacilityModalOpen(false);
          setSelectedTenantForFacility(null);
        }}
        initialTenant={selectedTenantForFacility}
        showToast={showToast}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 text-xs animate-fadeIn backdrop-blur-md">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
