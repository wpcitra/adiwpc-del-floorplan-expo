import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Plus, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Trash2, 
  Lock, 
  DollarSign, 
  Download, 
  Filter,
  RefreshCw,
  Building2,
  Tag,
  ArrowUpDown,
  Layers,
  Check,
  CheckSquare,
  Square,
  X,
  Sparkles
} from 'lucide-react';
import { api } from '../../services/api';
import InvoiceModal from '../../components/admin/InvoiceModal';
import InvoiceA4View from '../../components/admin/InvoiceA4View';
import InvoiceEditorModal from '../../components/admin/InvoiceEditorModal';
import ProjectYearFolderSelector from '../../components/admin/ProjectYearFolderSelector';
import ContractInvoiceWizard from '../../components/admin/ContractInvoiceWizard';
import InvoiceEditModal from '../../components/admin/InvoiceEditModal';
import { INVOICE_KIND_BADGE, invoiceKind, summarizeInvoices, matchesStatusTab, groupByContract } from '../../utils/invoiceSummary';
import { Palette } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import InvoiceDeleteModal from '../../components/admin/InvoiceDeleteModal';
import InvoiceTrashModal from '../../components/admin/InvoiceTrashModal';
import { canDeleteInvoice, canRestoreInvoice, invoiceBriefOf } from '../../utils/invoicePermissions';

// Canceled invoices are neither billed revenue, money received, nor a receivable
const isBillable = (inv) => (inv.payment_status || '').toUpperCase() !== 'CANCELED';

export default function InvoicePage() {
  const [invoices, setInvoices] = useState([]);
  const [projects, setProjects] = useState([]);
  // 'all' or array of selected project IDs, e.g. ['FP-2026-001', 'FP-1789237963230']
  const [selectedProjectIds, setSelectedProjectIds] = useState(['all']);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'UNPAID' | 'PAID'
  
  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedInvoiceForA4, setSelectedInvoiceForA4] = useState(null);
  const [activeBoothForModal, setActiveBoothForModal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  // Hapus Invoice & Tempat Sampah Invoice (AGENTS.md §31)
  const { user } = useAuth();
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const list = await api.fetchInvoices();
      setInvoices(list || []);
    } catch (e) {
      console.error("Failed to load invoices:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const res = await api.fetchFloorplanList();
      const list = Array.isArray(res) ? res : (res?.floorplans || res?.data || []);
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  };

  useEffect(() => {
    loadInvoices();
    loadProjects();
  }, []);

  // Ensure all projects from floorplans and any referenced in invoices are represented
  const allAvailableProjects = useMemo(() => {
    const list = [...projects];
    const knownIds = new Set(list.map(p => p.id));

    // Check if any invoice references a project not yet in list
    invoices.forEach(inv => {
      const fId = inv.floorplan_id;
      if (fId && fId !== 'global' && !knownIds.has(fId)) {
        list.push({
          id: fId,
          title: inv.project_title || `Project #${fId}`,
          venue: 'Pameran Expo'
        });
        knownIds.add(fId);
      }
    });

    return list;
  }, [projects, invoices]);

  // Project selection helpers
  const isAllSelected = selectedProjectIds.includes('all') || 
    (allAvailableProjects.length > 0 && selectedProjectIds.length === allAvailableProjects.length);

  const isProjectActive = (projId) => {
    if (isAllSelected) return true;
    return selectedProjectIds.includes(projId);
  };

  const handleSelectSoloProject = (projId) => {
    if (projId === 'all') {
      setSelectedProjectIds(['all']);
    } else {
      setSelectedProjectIds([projId]);
    }
  };

  const handleToggleProject = (projId, e) => {
    if (e) e.stopPropagation();
    if (projId === 'all') {
      setSelectedProjectIds(['all']);
      return;
    }

    if (isAllSelected) {
      setSelectedProjectIds([projId]);
      return;
    }

    if (selectedProjectIds.includes(projId)) {
      const next = selectedProjectIds.filter(id => id !== projId);
      setSelectedProjectIds(next.length === 0 ? ['all'] : next);
    } else {
      const next = [...selectedProjectIds, projId];
      if (next.length === allAvailableProjects.length) {
        setSelectedProjectIds(['all']);
      } else {
        setSelectedProjectIds(next);
      }
    }
  };

  const handleSelectAllProjects = () => {
    setSelectedProjectIds(['all']);
  };

  // Stats per project / overall, counted per booth contract (DP + Pelunasan never double the contract)
  const getProjectStats = (projId) => summarizeInvoices(invoices.filter(inv => (inv.floorplan_id || 'FP-2026-001') === projId));
  const allStats = summarizeInvoices(invoices);

  // Filter invoices by selected projects
  const projectInvoices = invoices.filter(inv => {
    if (isAllSelected) return true;
    const invFp = inv.floorplan_id || 'FP-2026-001';
    return selectedProjectIds.includes(invFp);
  });

  // Filter by search query & payment status
  const filteredInvoices = projectInvoices.filter(inv => {
    const matchSearch = (
      (inv.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.booth_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.project_title || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    // Tabs follow the contract status (a paid DP + unpaid Pelunasan is "Uang Muka" for both invoices)
    return matchSearch && matchesStatusTab(inv, statusFilter);
  });
  const displayedInvoices = groupByContract(filteredInvoices);

  // Summary cards for the selected projects: contract value once per booth, money received across its invoices
  const selectedSummary = summarizeInvoices(projectInvoices);
  const totalRevenue = selectedSummary.totalAmount;
  const paidRevenue = selectedSummary.totalPaid;
  const unpaidRevenue = selectedSummary.totalRemaining;
  const totalDiscounts = selectedSummary.totalDiscount;
  const totalTax = selectedSummary.totalTax;
  const paidTax = selectedSummary.paidTax;

  // Handler: Finance updates payment status (with automatic booth sync & DP input)
  const handleUpdatePaymentStatus = async (inv, newPaymentStatus) => {
    setIsUpdatingStatus(inv.id);
    try {
      let targetBoothStatus = null;
      let customPaidAmount = undefined;
      let customRemainingAmount = undefined;

      if (newPaymentStatus === 'PARTIAL') {
        const defaultDp = Number(inv.paid_amount) > 0 ? Number(inv.paid_amount) : Math.round(Number(inv.total_amount) / 2);
        const inputStr = prompt(
          `Masukkan jumlah Uang Muka (DP) yang dibayarkan untuk invoice ${inv.invoice_number}:\n(Total Tagihan: Rp ${Number(inv.total_amount).toLocaleString('id-ID')})`,
          defaultDp.toString()
        );
        if (inputStr === null) {
          setIsUpdatingStatus(null);
          return;
        }
        const parsed = parseFloat(inputStr.replace(/[^0-9]/g, ''));
        if (isNaN(parsed) || parsed <= 0) {
          showToast('⚠️ Nominal Uang Muka (DP) tidak valid');
          setIsUpdatingStatus(null);
          return;
        }
        customPaidAmount = Math.min(Number(inv.total_amount), parsed);
        customRemainingAmount = Math.max(0, Number(inv.total_amount) - customPaidAmount);
      }

      if (inv.booth_code) {
        if (newPaymentStatus === 'PAID') {
          targetBoothStatus = 'sold';
        } else if (newPaymentStatus === 'CANCELED') {
          targetBoothStatus = 'available';
        } else {
          targetBoothStatus = 'reserved';
        }
      }

      let res = await api.updateInvoiceStatus(inv.id, newPaymentStatus, targetBoothStatus, customPaidAmount, customRemainingAmount);
      if (res?.code === 'CONFIRM_CANCEL_PAID_DP') {
        if (!confirm(`${res.error}\n\nTetap batalkan Invoice DP ${inv.invoice_number}? Tindakan ini dicatat di log aktivitas.`)) return;
        res = await api.updateInvoiceStatus(inv.id, newPaymentStatus, targetBoothStatus, customPaidAmount, customRemainingAmount, { confirmCancelPaidDp: true });
      }
      if (res && res.success) {
        showToast(`✅ ${res.message || `Status invoice ${inv.invoice_number} diubah ke ${newPaymentStatus}`}`);
        await loadInvoices();
      } else {
        showToast(`⚠️ ${res?.error || 'Gagal mengubah status invoice'}`);
      }
    } catch (e) {
      console.error(e);
      showToast('⚠️ Gagal menghubungi server');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  // Handler: Finance directly updates booth status on floorplan
  const handleUpdateBoothStatus = async (inv, newBoothStatus) => {
    setIsUpdatingStatus(inv.id);
    try {
      let nextPaymentStatus = inv.payment_status;
      if (newBoothStatus === 'sold' && inv.payment_status !== 'PAID') {
        nextPaymentStatus = 'PAID';
      } else if (newBoothStatus === 'available' && inv.payment_status !== 'CANCELED') {
        if (!confirm(`Lepas status booth #${inv.booth_code} menjadi TERSEDIA (AVAILABLE)?\nData tenant pada denah akan dikosongkan.`)) {
          setIsUpdatingStatus(null);
          return;
        }
        nextPaymentStatus = 'CANCELED';
      }

      const res = await api.updateInvoiceStatus(inv.id, nextPaymentStatus, newBoothStatus);
      if (res && res.success) {
        // The booth follows the whole contract (DP + Pelunasan): report what the server actually set, never the request
        const actual = res.boothStatus || newBoothStatus;
        const c = inv.contract;
        if (newBoothStatus === 'sold' && actual !== 'sold') {
          const sisa = c ? Math.max(0, Number(c.total) - Number(c.paid)) : 0;
          showToast(`⚠️ Booth #${inv.booth_code} tetap RESERVED: kontrak belum lunas${c ? ` (dibayar Rp ${Number(c.paid).toLocaleString('id-ID')} dari Rp ${Number(c.total).toLocaleString('id-ID')}, sisa Rp ${sisa.toLocaleString('id-ID')})` : ''}. Terbitkan & lunasi Invoice Pelunasan agar booth Terjual.`);
        } else {
          showToast(`✅ Status Booth #${inv.booth_code}: ${actual.toUpperCase()} (sinkron ke denah & database)`);
        }
        await loadInvoices();
      } else {
        showToast(`⚠️ ${res?.error || 'Gagal mengubah status booth'}`);
      }
    } catch (e) {
      console.error(e);
      showToast('⚠️ Gagal menghubungi server');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  // Delete invoice: the shared confirmation (reason, typed number for a paid invoice), see InvoiceDeleteModal
  const handleDeleteInvoice = (inv) => setInvoiceToDelete(invoiceBriefOf(inv));

  return (
    <div className={`p-4 sm:p-6 lg:p-8 w-full max-w-none space-y-6 ${(selectedInvoiceForA4 || isEditorModalOpen) ? 'print:p-0 print:m-0 print:max-w-none' : ''}`}>
      {/* Background Page Content (Hidden on Print when A4 Modal or Editor Modal is Open) */}
      <div className={`space-y-6 ${(selectedInvoiceForA4 || isEditorModalOpen) ? 'print:hidden' : ''}`}>
        {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 text-xs animate-fadeIn">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Manajemen Invoice & Tagihan Tenant
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Format Kertas A4
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Terbitkan invoice resmi pameran, atur diskon khusus admin (privat), dan cetak dokumen A4 siap kirim.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditorModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Edit Layout, Logo, Warna & Tata Letak Invoice"
          >
            <Palette size={14} className="text-slate-500" />
            <span>Desain Layout Invoice</span>
          </button>

          {canRestoreInvoice(user) && (
            <button
              type="button"
              onClick={() => setIsTrashOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Invoice yang dihapus: lihat dan pulihkan"
            >
              <Trash2 size={14} className="text-slate-500" />
              <span>Sampah Invoice</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadInvoices}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Segarkan Data"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-slate-600' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>Buat Invoice Baru</span>
          </button>
        </div>
      </div>

      {/* Visual Project Showcase & Multi-Selection Bar with Folder Per Year */}
      <ProjectYearFolderSelector
        allAvailableProjects={allAvailableProjects}
        selectedProjectIds={selectedProjectIds}
        setSelectedProjectIds={setSelectedProjectIds}
        isAllSelected={isAllSelected}
        isProjectActive={isProjectActive}
        handleSelectSoloProject={handleSelectSoloProject}
        handleToggleProject={handleToggleProject}
        handleSelectAllProjects={handleSelectAllProjects}
        allStats={allStats}
        getProjectStats={getProjectStats}
        onProjectsModified={async () => {
          await loadProjects();
          await loadInvoices();
        }}
        showToast={showToast}
      />

      {/* Stats Summary Cards (Rekap Invoice & Tagihan) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Tagihan */}
        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 block mb-1 uppercase tracking-wider">
            Total Tagihan Kontrak
          </span>
          <div className="text-xl font-semibold font-mono text-slate-900">
            Rp {totalRevenue.toLocaleString('id-ID')}
          </div>
          {totalTax > 0 && (
            <span className="text-[11px] text-slate-500 mt-1 block">
              Sebelum PPN Rp {(totalRevenue - totalTax).toLocaleString('id-ID')} • <b className="text-slate-700">Total PPN Rp {totalTax.toLocaleString('id-ID')}</b>
            </span>
          )}
          <span className="text-[11px] text-slate-400 mt-1 block">
            {projectInvoices.length} Dokumen Diterbitkan
          </span>
        </div>

        {/* Card 2: Pembayaran Diterima / Uang Masuk */}
        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 block mb-1 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Pembayaran Diterima / Uang Masuk</span>
          </span>
          <div className="text-xl font-semibold font-mono text-emerald-600">
            Rp {paidRevenue.toLocaleString('id-ID')}
          </div>
          {paidTax > 0 && (
            <span className="text-[11px] text-emerald-800/80 mt-1 block">
              Pendapatan sebelum PPN Rp {(paidRevenue - paidTax).toLocaleString('id-ID')} • PPN Rp {paidTax.toLocaleString('id-ID')}
            </span>
          )}
          <span className="text-[11px] text-emerald-700/80 font-medium mt-1 block">
            {/* Counted per booth contract: a paid DP is "Uang Muka", only a fully paid contract is "Lunas" */}
            {selectedSummary.paidCount} Lunas • {selectedSummary.dpCount} Uang Muka (DP)
          </span>
        </div>

        {/* Card 3: Sisa Tagihan (Piutang) */}
        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700 block mb-1 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={13} className="text-amber-600" />
            <span>Sisa Tagihan (Belum Lunas)</span>
          </span>
          <div className="text-xl font-semibold font-mono text-amber-600">
            Rp {unpaidRevenue.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-amber-700/80 font-medium mt-1 block">
            {selectedSummary.unpaidCount + selectedSummary.dpCount} Kontrak Belum Lunas
          </span>
        </div>

        {/* Card 4: Diskon Privat Admin */}
        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-700 block mb-1 uppercase tracking-wider flex items-center gap-1.5">
            <Lock size={12} className="text-slate-500" /> 
            <span>Diskon Privat Diberikan</span>
          </span>
          <div className="text-xl font-semibold font-mono text-slate-800">
            Rp {totalDiscounts.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Potongan Khusus Negosiasi Admin
          </span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden w-full">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-3">
            {/* Project / Event Category Filter */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-xs transition-colors">
              <Building2 size={14} className="text-slate-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Filter:</span>
              <select
                value={isAllSelected ? 'all' : (selectedProjectIds.length === 1 ? selectedProjectIds[0] : 'custom')}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    handleSelectAllProjects();
                  } else if (e.target.value !== 'custom') {
                    handleSelectSoloProject(e.target.value);
                  }
                }}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-[200px] truncate"
                title="Filter data tenant & invoice berdasarkan project"
              >
                <option value="all">Semua Project ({invoices.length} Invoice)</option>
                {!isAllSelected && selectedProjectIds.length > 1 && (
                  <option value="custom">{selectedProjectIds.length} Project Terpilih ({projectInvoices.length} Invoice)</option>
                )}
                {allAvailableProjects.map((proj) => {
                  const count = invoices.filter(inv => (inv.floorplan_id || 'FP-2026-001') === proj.id).length;
                  return (
                    <option key={proj.id} value={proj.id}>
                      {proj.event_title ? `${proj.event_title} • ${proj.title}` : proj.title} ({count} Invoice)
                    </option>
                  );
                })}
              </select>
              {!isAllSelected && (
                <button
                  type="button"
                  onClick={handleSelectAllProjects}
                  className="text-slate-400 hover:text-slate-600 ml-1 p-0.5 transition-colors cursor-pointer"
                  title="Kembalikan ke semua project"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({projectInvoices.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNPAID')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'UNPAID' ? 'bg-white text-amber-800 shadow-xs font-semibold ring-1 ring-amber-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Belum Lunas ({projectInvoices.filter(i => matchesStatusTab(i, 'UNPAID')).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PARTIAL')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'PARTIAL' ? 'bg-white text-slate-900 shadow-xs font-semibold ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Uang Muka / DP ({projectInvoices.filter(i => matchesStatusTab(i, 'PARTIAL')).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAID')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === 'PAID' ? 'bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lunas ({projectInvoices.filter(i => matchesStatusTab(i, 'PAID')).length})
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Cari no invoice, tenant, PIC, booth..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8.5 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors shadow-xs"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto w-full">
          {isLoading ? (
            <div className="py-24 text-center text-slate-400 space-y-2">
              <RefreshCw size={26} className="animate-spin mx-auto text-slate-400" />
              <p className="text-xs font-medium">Memuat data invoice...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-20 text-center p-8">
              <FileText size={40} className="mx-auto text-slate-300 mb-2" />
              <h3 className="text-sm font-bold text-slate-700">Tidak ada invoice ditemukan</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm ? 'Sesuaikan kata kunci pencarian Anda.' : 'Klik tombol "+ Buat Invoice Baru" untuk menerbitkan invoice pertama Anda.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-3.5 whitespace-nowrap">No. Invoice & Tanggal</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap">Ukuran Booth</th>
                  <th className="px-3.5 py-3.5">Perusahaan & PIC</th>
                  <th className="px-2.5 py-3.5 text-center whitespace-nowrap">Booth & Denah</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">Subtotal</th>
                  <th className="px-3 py-3.5 whitespace-nowrap">Diskon Privat</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">Total Tagihan</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap text-emerald-700">Uang Dibayar (DP)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap text-amber-700">Sisa Tagihan</th>
                  <th className="px-3 py-3.5 text-center whitespace-nowrap">Status Pembayaran</th>
                  <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((inv) => {
                  const isPaid = (inv.payment_status || '').toUpperCase() === 'PAID';
                  const isCanceled = (inv.payment_status || '').toUpperCase() === 'CANCELED';
                  // DP / Pelunasan: the private discount belongs to the booth CONTRACT (all its booths), shown here too
                  const isContractSplit = ['dp', 'settlement'].includes(invoiceKind(inv)) && inv.contract;
                  const effectiveDiscountAmount = isContractSplit
                    ? Number(inv.contract.discountAmount) || 0
                    : (inv.discount_amount && Number(inv.discount_amount) > 0)
                      ? Number(inv.discount_amount)
                      : Number(inv.booth_discount_amount || 0);
                  const effectiveDiscountReason = inv.discount_reason || inv.booth_discount_reason || '';
                  const hasDiscount = effectiveDiscountAmount > 0;
                  const effectiveBoothStatus = inv.current_booth_status || (isPaid ? 'sold' : 'reserved');
                  const isRowUpdating = isUpdatingStatus === inv.id;
                  const displaySubtotal = Number(inv.subtotal) || (hasDiscount ? (Number(inv.total_amount) + effectiveDiscountAmount) : Number(inv.total_amount || 0));
                  const displayTotal = Number(inv.total_amount) || (hasDiscount ? Math.max(0, displaySubtotal - effectiveDiscountAmount) : displaySubtotal);

                  // Uang Dibayar & Sisa Tagihan Resolution
                  const paidAmt = isPaid ? displayTotal : isCanceled ? 0 : (Number(inv.paid_amount) || 0);
                  const remainingAmt = isPaid || isCanceled ? 0 : (inv.remaining_amount !== undefined && inv.remaining_amount !== null ? Number(inv.remaining_amount) : Math.max(0, displayTotal - paidAmt));
                  const isDp = !isPaid && (paidAmt > 0 && remainingAmt > 0);
                  const dpPercentCalc = inv.dp_percent || (displayTotal > 0 && paidAmt > 0 ? Math.round((paidAmt / displayTotal) * 100) : 0);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Invoice No & Date */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${INVOICE_KIND_BADGE[invoiceKind(inv)]?.className || INVOICE_KIND_BADGE.full.className}`}>
                            {INVOICE_KIND_BADGE[invoiceKind(inv)]?.label || 'Penuh'}
                          </span>
                          <span className="font-mono font-bold text-slate-900 text-xs">{inv.invoice_number}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Terbit: {Number(inv.issue_date_fixed) === 1 ? inv.issue_date : 'saat diunduh'} • Tempo: <span className="text-rose-600 font-medium">{Number(inv.due_date_fixed) === 1 ? inv.due_date : 'otomatis'}</span>
                        </div>
                        {inv.contract && ['dp', 'settlement'].includes(invoiceKind(inv)) && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {/* DP share from the amounts (an older registration could store a percentage that did not match) */}
                            {invoiceKind(inv) === 'dp' ? `DP ${Number(inv.contract.total) > 0 ? Math.round((Number(inv.total_amount) / Number(inv.contract.total)) * 1000) / 10 : (inv.dp_percent || 0)}% • ` : inv.related_invoice ? `Setelah DP ${inv.related_invoice.invoice_number} • ` : 'Tanpa DP (100%) • '}
                            Kontrak Rp {Number(inv.contract.total).toLocaleString('id-ID')} • <span className="font-semibold">{inv.contract.statusLabel}</span>
                            {Number(inv.contract.unbilled) > 0 && (
                              <span className="block text-amber-700 font-semibold">Sisa Rp {Number(inv.contract.unbilled).toLocaleString('id-ID')} belum ditagih — buat Invoice Pelunasan agar booth bisa Terjual</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Booth Size (from linked booth record) */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        {Number(inv.booth_width_m) > 0 && Number(inv.booth_height_m) > 0 ? (
                          <>
                            <div className="font-bold text-slate-800 text-xs">
                              {Number(inv.booth_width_m)} × {Number(inv.booth_height_m)} m
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {Number((inv.booth_width_m * inv.booth_height_m).toFixed(2))} m²
                            </div>
                          </>
                        ) : Number(inv.booth_area_m2) > 0 ? (
                          <>
                            <div className="font-bold text-slate-800 text-xs" title={(inv.merged_booths || []).map(b => `${b.code}: ${b.widthM}×${b.heightM} m`).join(', ')}>
                              {Number(inv.booth_area_m2)} m²
                            </div>
                            <div className="text-[10px] text-indigo-500 mt-0.5">🔗 {(inv.merged_booths || []).length} booth gabungan</div>
                          </>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Company & PIC */}
                      <td className="px-3.5 py-3.5 min-w-[160px]">
                        <div className="font-bold text-slate-900 text-xs leading-snug line-clamp-1" title={inv.company_name}>
                          {inv.company_name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-1" title={`PIC: ${inv.client_name} ${inv.client_phone ? `(${inv.client_phone})` : ''}`}>
                          PIC: {inv.client_name} {inv.client_phone ? `(${inv.client_phone})` : ''}
                        </div>
                        {/* Project Category Tag */}
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-600 font-medium">
                          <Building2 size={11} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]" title={inv.project_title || 'Denah Utama Pameran'}>
                            {inv.project_title || 'Denah Utama Pameran'}
                          </span>
                        </div>
                      </td>

                      {/* Booth Code & Live Floorplan Status Control for Finance */}
                      <td className="px-2.5 py-3.5 text-center whitespace-nowrap">
                        {inv.booth_code ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                              #{inv.booth_code}
                            </span>
                            {/* Finance Interactive Booth Status */}
                            <select
                              value={effectiveBoothStatus}
                              onChange={(e) => handleUpdateBoothStatus(inv, e.target.value)}
                              disabled={isRowUpdating}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer focus:outline-none transition-all shadow-2xs ${
                                effectiveBoothStatus === 'sold'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : effectiveBoothStatus === 'reserved'
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                              } ${isRowUpdating ? 'opacity-50 cursor-wait' : ''}`}
                              title="Akses Keuangan: Ubah status booth di denah pameran"
                            >
                              <option value="sold">Terjual (Sold)</option>
                              <option value="reserved">Booking (Reserved)</option>
                              <option value="available">Tersedia (Available)</option>
                            </select>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Manual (Tanpa Booth)</span>
                        )}
                      </td>

                      {/* Subtotal */}
                      <td className="px-3 py-3.5 text-right font-mono text-slate-600 whitespace-nowrap text-xs">
                        Rp {displaySubtotal.toLocaleString('id-ID')}
                      </td>

                      {/* Private Discount */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {hasDiscount ? (
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200" title={effectiveDiscountReason || 'Diskon Khusus'}>
                            <Lock size={10} className="text-emerald-600 shrink-0" />
                            <span>-Rp {effectiveDiscountAmount.toLocaleString('id-ID')}</span>
                            {isContractSplit && <span className="text-emerald-600 font-normal">(kontrak)</span>}
                            {effectiveDiscountReason && (
                              <span className="text-emerald-600 font-normal max-w-[100px] truncate">({effectiveDiscountReason})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Grand Total Tagihan */}
                      <td className="px-3 py-3.5 text-right font-mono font-bold text-slate-900 text-xs whitespace-nowrap">
                        Rp {displayTotal.toLocaleString('id-ID')}
                      </td>

                      {/* Uang yang Baru / Sudah Dibayar (DP) */}
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        {paidAmt > 0 ? (
                          <div>
                            <div className="font-mono font-bold text-emerald-700 text-xs">
                              Rp {paidAmt.toLocaleString('id-ID')}
                            </div>
                            {isDp ? (
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                DP {dpPercentCalc}%
                              </span>
                            ) : isPaid ? (
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Lunas 100%
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">Rp 0</span>
                        )}
                      </td>

                      {/* Sisa Tagihan */}
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        {remainingAmt > 0 ? (
                          <div>
                            <div className="font-mono font-bold text-amber-700 text-xs">
                              Rp {remainingAmt.toLocaleString('id-ID')}
                            </div>
                            <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              {isDp ? 'Sisa Pelunasan' : 'Belum Dibayar'}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className={`font-mono font-bold text-xs ${isCanceled ? 'text-slate-400' : 'text-emerald-600'}`}>
                              Rp 0
                            </div>
                            <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                              isCanceled ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {isCanceled ? 'Batal' : 'Lunas'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Payment Status & Finance Sync Control */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          <select
                            value={(inv.payment_status || 'UNPAID').toUpperCase()}
                            onChange={(e) => handleUpdatePaymentStatus(inv, e.target.value)}
                            disabled={isRowUpdating}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer focus:outline-none shadow-2xs ${
                              isPaid 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                                : isDp || (inv.payment_status || '').toUpperCase() === 'PARTIAL'
                                ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                : inv.payment_status === 'PENDING'
                                ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                : inv.payment_status === 'CANCELED'
                                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                            } ${isRowUpdating ? 'opacity-50 cursor-wait' : ''}`}
                            title="Akses Keuangan: Ubah status invoice & otomatis sinkron status booth"
                          >
                            <option value="PAID">LUNAS (Paid 100%)</option>
                            {!['dp', 'settlement'].includes(invoiceKind(inv)) && <option value="PARTIAL">UANG MUKA (DP)</option>}
                            <option value="UNPAID">BELUM LUNAS (Unpaid)</option>
                            <option value="PENDING">PENDING (Menunggu)</option>
                            <option value="CANCELED">BATAL (Canceled)</option>
                          </select>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {isPaid ? '✓ Booth Terjual' : isDp ? 'Uang Muka Diterima' : 'Menunggu Pelunasan'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Print A4 */}
                          <button
                            type="button"
                            onClick={async () => {
                              const full = await api.fetchInvoiceById(inv.id);
                              setSelectedInvoiceForA4(full || inv);
                            }}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                            title="Cetak Dokumen Format A4"
                          >
                            <Printer size={13} />
                            <span>Cetak A4</span>
                          </button>

                          {/* Edit: client data, DP, PPN, what the document shows */}
                          <button
                            type="button"
                            onClick={() => setEditingInvoice(inv)}
                            className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-indigo-200"
                            title="Edit Invoice (data klien, DP, pajak, tampilan)"
                          >
                            <Edit3 size={14} />
                          </button>

                          {/* Delete */}
                          {canDeleteInvoice(user) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(inv)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-200"
                              title="Hapus Invoice"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>

      {/* A4 Fullscreen View Modal */}
      {selectedInvoiceForA4 && (
        <InvoiceA4View
          invoice={selectedInvoiceForA4}
          allowSend
          onClose={() => setSelectedInvoiceForA4(null)}
          onEdit={(inv) => setEditingInvoice(inv)}
          onOpenEditor={() => setIsEditorModalOpen(true)}
        />
      )}

      {/* Edit Invoice: the same form (and the same invoice) as in Data Exhibitor */}
      <InvoiceEditModal
        isOpen={Boolean(editingInvoice)}
        invoice={editingInvoice}
        onClose={() => setEditingInvoice(null)}
        onSaved={async (updated, message) => {
          setEditingInvoice(null);
          showToast(`✅ ${message}`);
          await loadInvoices();
          if (selectedInvoiceForA4) setSelectedInvoiceForA4(await api.fetchInvoiceById(selectedInvoiceForA4.id) || updated);
        }}
      />

      {/* Invoice Generator Modal */}
      <ContractInvoiceWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        projects={allAvailableProjects}
        defaultProjectId={!isAllSelected && selectedProjectIds.length === 1 ? selectedProjectIds[0] : ''}
        onCreated={async (invoice, message) => {
          setIsWizardOpen(false);
          showToast(`✅ ${message || `Invoice ${invoice?.invoice_number} diterbitkan`}`);
          await loadInvoices();
        }}
        onOpenInvoice={(invoiceId) => {
          const existing = invoices.find(i => i.id === invoiceId);
          if (existing) {
            setIsWizardOpen(false);
            setSelectedInvoiceForA4(existing);
          }
        }}
      />

      <InvoiceDeleteModal
        invoice={invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        showToast={showToast}
        onDeleted={async () => {
          setInvoiceToDelete(null);
          await loadInvoices();
        }}
      />

      <InvoiceTrashModal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        showToast={showToast}
        onRestored={loadInvoices}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          loadInvoices();
        }}
        initialBooth={activeBoothForModal}
        currentFloorplanId={
          (!isAllSelected && selectedProjectIds.length === 1)
            ? selectedProjectIds[0]
            : (allAvailableProjects[0]?.id || 'FP-2026-001')
        }
        currentFloorplanTitle={
          allAvailableProjects.find(p => p.id === (
            (!isAllSelected && selectedProjectIds.length === 1)
              ? selectedProjectIds[0]
              : (allAvailableProjects[0]?.id || 'FP-2026-001')
          ))?.title || 'Indonesia International Expo 2026'
        }
        showToast={showToast}
        onOpenEditor={() => setIsEditorModalOpen(true)}
      />

      {/* Invoice Visual Layout Editor Modal with Live Preview */}
      <InvoiceEditorModal
        isOpen={isEditorModalOpen}
        onClose={() => setIsEditorModalOpen(false)}
        showToast={showToast}
        onSaveSuccess={() => {
          loadInvoices();
        }}
      />
    </div>
  );
}
