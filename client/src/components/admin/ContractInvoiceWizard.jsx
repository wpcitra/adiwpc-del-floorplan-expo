import React, { useEffect, useMemo, useState } from 'react';
import { X, Wallet, BadgeCheck, ArrowLeft, AlertTriangle, FileText, Building2, Loader2, Info } from 'lucide-react';
import { api } from '../../services/api';
import { getProjectDateInfo } from './ProjectYearFolderSelector';
import TaxOptionsField from './TaxOptionsField';
import InvoiceTotals from './InvoiceTotals';
import { computeContractTax, taxPortion, taxRemainder, invoiceTaxView, DEFAULT_TAX_NOTE } from '../../utils/invoiceTax';

const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const DP_PERCENT_PRESETS = [30, 50];
const STATUS_TEXT = { PAID: 'Lunas', PARTIAL: 'Dibayar sebagian', UNPAID: 'Belum dibayar', PENDING: 'Menunggu verifikasi', CANCELED: 'Batal' };

const TYPE_CARDS = [
  {
    kind: 'dp',
    icon: Wallet,
    title: 'Invoice DP / Uang Muka',
    description: 'Tagihan sebagian di awal untuk mengamankan booth. Sisa kontrak ditagihkan kemudian lewat Invoice Pelunasan.',
    tone: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/50',
    iconTone: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    kind: 'settlement',
    icon: BadgeCheck,
    title: 'Invoice Pelunasan',
    description: 'Tagihan sisa pembayaran setelah DP, atau pembayaran penuh sekaligus bila booth tidak memakai DP.',
    tone: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50/50',
    iconTone: 'bg-violet-50 text-violet-700 border-violet-200'
  }
];

const plusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

// "+ Buat Invoice Baru": choose Invoice DP or Invoice Pelunasan, then pick project & booth. All amounts come
// from the booth contract (price - private discount, + optional PPN) and are recomputed by the server.
export default function ContractInvoiceWizard({ isOpen, onClose, projects = [], defaultProjectId = '', defaultBoothCode = '', onCreated, onOpenInvoice }) {
  const [kind, setKind] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [booths, setBooths] = useState([]);
  const [boothsLoading, setBoothsLoading] = useState(false);
  const [boothCode, setBoothCode] = useState('');
  const [contract, setContract] = useState(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState('');
  // PPN of the contract: Tanpa / Dengan PPN, method and display (defaults from Setting > Aturan Booking, PPN & Pajak)
  const [taxCfg, setTaxCfg] = useState({ rate: 11, enabled: false, method: 'exclusive', display: 'show', note: DEFAULT_TAX_NOTE });
  const [taxOpt, setTaxOpt] = useState({ method: 'none', display: 'show' });
  const [ackTaxChange, setAckTaxChange] = useState(false);
  useEffect(() => {
    api.fetchInvoiceConfig().then(cfg => {
      const rate = Number(cfg?.taxRate);
      const method = cfg?.defaultTaxMethod === 'inclusive' ? 'inclusive' : 'exclusive';
      setTaxCfg({
        rate: Number.isFinite(rate) && rate >= 0 ? rate : 11,
        enabled: cfg?.defaultTaxEnabled === true,
        method,
        display: method === 'inclusive' && cfg?.defaultTaxDisplay === 'hide' ? 'hide' : 'show',
        note: String(cfg?.taxNote || '').trim() || DEFAULT_TAX_NOTE
      });
    });
  }, []);
  const [dpMode, setDpMode] = useState('percent');
  const [dpInput, setDpInput] = useState('30');
  const [dueDate, setDueDate] = useState(plusDays(7));
  const [notes, setNotes] = useState('');
  const [ackUnpaidDp, setAckUnpaidDp] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKind(null);
    setProjectId(defaultProjectId || '');
    setBoothCode(defaultBoothCode || '');
    setContract(null);
    setDpMode('percent');
    setDpInput('30');
    setDueDate(plusDays(7));
    setNotes('');
    setAckUnpaidDp(false);
    setError('');
  }, [isOpen, defaultProjectId, defaultBoothCode]);

  // Projects grouped by year, same folders as the invoice page
  const projectGroups = useMemo(() => {
    const groups = new Map();
    projects.forEach(p => {
      const { year, timestamp } = getProjectDateInfo(p);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push({ ...p, _ts: timestamp });
    });
    return [...groups.entries()]
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([year, list]) => [year, list.sort((a, b) => b._ts - a._ts)]);
  }, [projects]);

  // Booths with a tenant (Reserved / Sold) in the chosen project
  useEffect(() => {
    if (!projectId) { setBooths([]); return; }
    let cancelled = false;
    setBoothsLoading(true);
    api.fetchFloorplanById(projectId).then(fp => {
      if (cancelled) return;
      const list = (fp?.booths || [])
        .filter(b => (b.owner_name || b.ownerName || '').trim() || ['reserved', 'sold'].includes(String(b.status).toLowerCase()))
        .sort((a, b) => String(a.code).localeCompare(String(b.code), 'id', { numeric: true }));
      setBooths(list);
      setBoothsLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Contract summary for the chosen booth. Every PPN option is previewed here from the booth prices it returns.
  useEffect(() => {
    if (!projectId || !boothCode) { setContract(null); return; }
    let cancelled = false;
    setContractLoading(true);
    setContractError('');
    api.fetchContract({ floorplanId: projectId, boothCode }).then(res => {
      if (cancelled) return;
      setContractLoading(false);
      if (res?.success) setContract(res.contract);
      else { setContract(null); setContractError(res?.error || 'Gagal memuat data kontrak booth'); }
    });
    return () => { cancelled = true; };
  }, [projectId, boothCode]);

  // A running contract keeps its PPN setting (the Pelunasan follows the DP); a new one starts from the Setting defaults
  useEffect(() => {
    if (!contract) return;
    setTaxOpt(contract.tax
      ? { method: contract.tax.method, display: contract.tax.display }
      : { method: taxCfg.enabled ? taxCfg.method : 'none', display: taxCfg.display });
    setAckTaxChange(false);
  }, [contract, taxCfg]);

  useEffect(() => { setAckUnpaidDp(false); setError(''); }, [boothCode, kind]);

  if (!isOpen) return null;

  // Contract value with the chosen PPN setting (the stored contract when unchanged)
  const running = contract?.tax || null;
  const taxRate = running && running.method !== 'none' ? running.rate : taxCfg.rate;
  const taxChanged = Boolean(running) && (taxOpt.method !== running.method || (taxOpt.method !== 'none' && taxOpt.display !== running.display));
  const contractTax = contract
    ? (running && !taxChanged
      ? { method: running.method, rate: running.rate, subtotal: running.subtotal, discount: Math.max(0, running.subtotal - running.dpp), dpp: running.dpp, ppn: running.ppn, total: running.total }
      : computeContractTax({ subtotal: contract.base?.subtotal, discount: contract.base?.discount, rate: taxRate, method: taxOpt.method }))
    : null;
  const contractView = contractTax ? { ...contractTax, display: taxOpt.display } : null;
  const total = contractTax?.total || 0;
  const dpRaw = parseFloat(String(dpInput).replace(/\./g, '').replace(',', '.')) || 0;
  const dpAmount = dpMode === 'percent' ? Math.round((total * (parseFloat(String(dpInput).replace(',', '.')) || 0)) / 100) : Math.round(dpRaw);
  const dpPercentShown = total > 0 ? Math.round((dpAmount / total) * 10000) / 100 : 0;
  const dpInvoice = contract?.dpInvoice;
  const dpPaid = dpInvoice && ['PAID', 'PARTIAL'].includes(String(dpInvoice.payment_status).toUpperCase());
  const settlementAmount = Math.max(0, total - (dpInvoice ? Number(dpInvoice.total_amount) || 0 : 0));
  // DPP / PPN of the DP and of the Pelunasan: PPN proportional to the DP, Pelunasan = contract - DP (no Rp 1 gap)
  const existingDpTax = dpInvoice && contractTax
    ? (dpInvoice.tax_method && dpInvoice.dpp_amount != null && !taxChanged
      ? { dpp: Number(dpInvoice.dpp_amount) || 0, ppn: Number(dpInvoice.tax_amount) || 0, total: Number(dpInvoice.total_amount) || 0 }
      : taxPortion(contractTax, dpInvoice.total_amount))
    : null;
  const dpTax = contractTax ? taxPortion(contractTax, dpAmount) : null;
  const settlementTax = contractTax ? taxRemainder(contractTax, existingDpTax || { dpp: 0, ppn: 0, total: 0 }) : null;

  // Summary cards follow the PPN setting live. A change only rewrites the unpaid balance invoice.
  const billedNow = contract ? (taxChanged && contract.settlementInvoice ? total : contract.billed) : 0;
  const unbilledNow = Math.max(0, total - billedNow);
  const withTax = contractTax && contractTax.ppn > 0;
  const totalHint = !contractTax ? '' : !withTax
    ? 'setelah diskon, tanpa PPN'
    : contractTax.method === 'inclusive'
      ? `sudah termasuk PPN ${rupiah(contractTax.ppn)}`
      : `DPP ${rupiah(contractTax.dpp)} + PPN ${rupiah(contractTax.ppn)}`;

  // "Tampilan di Invoice": the total block exactly as it will be printed on the A4 document
  const previewView = contractTax && kind ? invoiceTaxView({
    invoice_kind: kind,
    total_amount: kind === 'dp' ? dpAmount : settlementAmount,
    tax_method: taxOpt.method,
    tax_display: taxOpt.display,
    tax_rate: taxOpt.method === 'none' ? 0 : taxRate,
    tax_note: running?.note || taxCfg.note,
    dpp_amount: kind === 'dp' ? dpTax.dpp : settlementTax.dpp,
    tax_amount: kind === 'dp' ? dpTax.ppn : settlementTax.ppn,
    related_invoice_id: kind === 'settlement' && dpInvoice ? dpInvoice.id : null,
    related_invoice: kind === 'settlement' ? dpInvoice : null,
    items: kind === 'settlement' && !dpInvoice ? [{ amount: (contract.base?.subtotal || 0) }] : [{ amount: kind === 'dp' ? dpAmount : settlementAmount }],
    contract_total: total,
    contract_tax_rate: contractTax.rate,
    contract_subtotal: contractTax.subtotal,
    contract_discount: contractTax.discount,
    contract_dpp: contractTax.dpp,
    contract_tax_method: contractTax.method,
    contract_tax_display: taxOpt.display,
    contract_discount_hint: contract.base?.discount || 0
  }) : null;

  // Blocking reasons for the chosen invoice type
  let blocker = null;
  if (contract) {
    if (contract.status === 'PAID') blocker = { text: `Kontrak booth ${contract.booth.code} sudah lunas penuh.` };
    else if (total <= 0) blocker = { text: 'Nilai kontrak Rp 0 (booth gratis), tidak perlu ditagih.' };
    else if (kind === 'dp' && dpInvoice) blocker = { text: `Booth ini sudah memiliki Invoice DP aktif (${dpInvoice.invoice_number}).`, invoice: dpInvoice };
    else if (kind === 'dp' && contract.paid > 0) blocker = { text: 'Kontrak ini sudah menerima pembayaran, Invoice DP tidak dapat dibuat lagi.' };
    else if (kind === 'settlement' && contract.settlementInvoice) blocker = { text: `Booth ini sudah memiliki invoice pelunasan / penuh aktif (${contract.settlementInvoice.invoice_number}).`, invoice: contract.settlementInvoice };
    else if (!contract.tenant.companyName) blocker = { text: 'Booth belum memiliki tenant / exhibitor. Daftarkan tenant terlebih dahulu.' };
  }

  let dpError = '';
  if (kind === 'dp' && contract && !blocker) {
    if (dpAmount <= 0) dpError = 'Nilai DP tidak boleh 0.';
    else if (dpAmount >= total) dpError = 'Nilai DP harus lebih kecil dari total kontrak.';
  }
  const needsDpAck = kind === 'settlement' && dpInvoice && !dpPaid;
  const canSubmit = contract && !blocker && !dpError && !contractLoading && (!needsDpAck || ackUnpaidDp) && (!taxChanged || ackTaxChange) && !isSubmitting;

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);
    const res = await api.createInvoice({
      invoiceKind: kind,
      floorplanId: projectId,
      boothCode: contract.booth.code,
      boothId: contract.booth.id,
      dpMode,
      dpValue: dpMode === 'percent' ? String(dpInput).replace(',', '.') : dpAmount,
      taxMethod: taxOpt.method,
      taxDisplay: taxOpt.display,
      taxRate,
      changeContractTax: taxChanged && ackTaxChange,
      dueDate,
      notes,
      confirmUnpaidDp: ackUnpaidDp
    });
    setIsSubmitting(false);
    if (!res?.success) {
      setError(res?.error || 'Gagal membuat invoice');
      return;
    }
    onCreated?.(res.invoice, res.message);
  };

  const cardInput = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {kind && (
              <button type="button" onClick={() => setKind(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Kembali pilih jenis">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><FileText size={17} /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {!kind ? 'Buat Invoice Baru' : kind === 'dp' ? 'Invoice DP / Uang Muka' : 'Invoice Pelunasan'}
              </h3>
              <p className="text-xs text-slate-500">{!kind ? 'Pilih jenis invoice yang akan diterbitkan' : 'Data tenant & nilai kontrak diambil otomatis dari booth'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>

        {/* Step 1: invoice type */}
        {!kind && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TYPE_CARDS.map(card => {
              const Icon = card.icon;
              return (
                <button key={card.kind} type="button" onClick={() => setKind(card.kind)}
                  className={`text-left p-4 rounded-2xl border-2 bg-white transition-all cursor-pointer ${card.tone}`}>
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-3 ${card.iconTone}`}><Icon size={20} /></div>
                  <div className="font-bold text-slate-900 text-sm">{card.title}</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{card.description}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: form */}
        {kind && (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Project</label>
                <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setBoothCode(''); }} className={cardInput}>
                  <option value="">— Pilih project —</option>
                  {projectGroups.map(([year, list]) => (
                    <optgroup key={year} label={`📁 ${year}`}>
                      {list.map(p => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Booth / Exhibitor</label>
                <select value={boothCode} onChange={(e) => setBoothCode(e.target.value)} disabled={!projectId || boothsLoading} className={`${cardInput} disabled:bg-slate-50 disabled:text-slate-400`}>
                  <option value="">{boothsLoading ? 'Memuat booth...' : !projectId ? 'Pilih project dulu' : booths.length ? '— Pilih booth —' : 'Belum ada booth bertenant'}</option>
                  {booths.map(b => (
                    <option key={b.id || b.code} value={b.code}>
                      #{b.code} — {b.owner_name || b.ownerName || '(tanpa nama)'} ({String(b.status).toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {contractLoading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Memuat data kontrak booth...</div>}
            {contractError && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">{contractError}</div>}

            {contract && (
              <>
                {/* Tenant & booth (read-only, from booth & exhibitor data) */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Building2 size={11} /> Tenant / Exhibitor</div>
                    <div className="font-bold text-slate-900">{contract.tenant.companyName || '-'}</div>
                    <div className="text-slate-600">PIC: {contract.tenant.picName || '-'}</div>
                    <div className="text-slate-500">{contract.tenant.email || '-'} • {contract.tenant.phone || '-'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Booth</div>
                    <div className="font-bold text-slate-900">#{contract.booth.code} • {contract.booth.category || 'Standard'} • {contract.booth.widthM} × {contract.booth.heightM} m</div>
                    <div className="text-slate-600">Harga sewa: {rupiah(contract.booth.price)}</div>
                    {contract.booth.discountAmount > 0 && (
                      <div className="text-rose-600">Diskon privat: −{rupiah(contract.booth.discountAmount)}{contract.booth.discountReason ? ` (${contract.booth.discountReason})` : ''}</div>
                    )}
                  </div>
                </div>

                {/* Pajak bertingkat: berlaku untuk seluruh kontrak (DP & Pelunasan memakai pengaturan yang sama) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">Pajak (PPN)</span>
                    <span className="text-[11px] text-slate-500">
                      {running ? 'Mengikuti pengaturan pajak kontrak ini (ditetapkan saat invoice pertama).' : 'Berlaku untuk seluruh kontrak (DP & Pelunasan).'}
                    </span>
                  </div>
                  <TaxOptionsField value={taxOpt} onChange={(v) => { setTaxOpt(v); setAckTaxChange(false); }} rate={taxRate} defaultMethod={taxCfg.method} />
                  {taxChanged && (
                    <label className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs cursor-pointer">
                      <input type="checkbox" checked={ackTaxChange} onChange={(e) => setAckTaxChange(e.target.checked)} className="mt-0.5 accent-amber-600" />
                      <span>
                        <b>Pengaturan pajak kontrak akan diubah.</b> Invoice yang belum dibayar akan dihitung ulang dengan pengaturan baru.
                        Invoice yang sudah DP / Lunas tidak berubah otomatis. Saya mengerti dan ingin melanjutkan.
                      </span>
                    </label>
                  )}
                </div>

                {/* Contract summary (recomputed live from the PPN setting) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Total Kontrak', total, 'text-slate-900', totalHint],
                    ['Sudah Ditagih', billedNow, 'text-indigo-700'],
                    ['Sudah Dibayar', contract.paid, 'text-emerald-700', withTax && contract.paidTax > 0 && !taxChanged ? `termasuk PPN ${rupiah(contract.paidTax)}` : ''],
                    ['Belum Ditagih', unbilledNow, 'text-amber-700']
                  ].map(([label, value, tone, hint]) => (
                    <div key={label} className="p-2.5 rounded-xl border border-slate-200 bg-white">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
                      <div className={`font-mono font-bold text-sm mt-0.5 ${tone}`}>{rupiah(value)}</div>
                      {hint && <div className="text-[9px] text-slate-400 mt-0.5">{hint}</div>}
                    </div>
                  ))}
                </div>

                {blocker && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1">
                      {blocker.text}
                      {blocker.invoice && (
                        <button type="button" onClick={() => onOpenInvoice?.(blocker.invoice.id)} className="ml-2 font-bold text-indigo-700 hover:underline">
                          Buka {blocker.invoice.invoice_number} →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* DP amount */}
                {kind === 'dp' && !blocker && (
                  <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Besaran DP</span>
                      <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
                        {[['percent', 'Persentase (%)'], ['nominal', 'Nominal (Rp)']].map(([m, label]) => (
                          <button key={m} type="button" onClick={() => { setDpMode(m); setDpInput(m === 'percent' ? '30' : String(Math.round(total * 0.3))); }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${dpMode === m ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {DP_PERCENT_PRESETS.map(pct => (
                        <button key={pct} type="button"
                          onClick={() => dpMode === 'percent' ? setDpInput(String(pct)) : setDpInput(String(Math.round((total * pct) / 100)))}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${Math.abs(dpPercentShown - pct) < 0.01 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                          {pct}%
                        </button>
                      ))}
                      <input type="text" inputMode="decimal" value={dpInput} onChange={(e) => setDpInput(e.target.value)} className={`${cardInput} flex-1`}
                        placeholder={dpMode === 'percent' ? 'contoh: 40' : 'contoh: 2000000'} />
                      <span className="text-xs text-slate-500 w-6">{dpMode === 'percent' ? '%' : 'Rp'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-slate-500">Nilai DP{dpMode === 'nominal' && dpAmount > 0 ? ` (${dpPercentShown}%)` : ''}</div>
                        <div className="font-mono font-bold text-blue-700 text-sm">{rupiah(dpAmount)}</div>
                        {withTax && dpAmount > 0 && <div className="text-[10px] text-slate-500 font-mono">DPP {rupiah(dpTax.dpp)} + PPN {rupiah(dpTax.ppn)}</div>}
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-slate-500">Sisa via Invoice Pelunasan</div>
                        <div className="font-mono font-bold text-violet-700 text-sm">{rupiah(Math.max(0, total - dpAmount))}</div>
                        {withTax && dpAmount > 0 && <div className="text-[10px] text-slate-500 font-mono">DPP {rupiah(contractTax.dpp - dpTax.dpp)} + PPN {rupiah(contractTax.ppn - dpTax.ppn)}</div>}
                      </div>
                    </div>
                    {dpError && <div className="text-xs font-medium text-rose-600">{dpError}</div>}
                  </div>
                )}

                {/* Pelunasan amount */}
                {kind === 'settlement' && !blocker && (
                  <div className="p-3.5 rounded-xl border border-violet-200 bg-violet-50/40 space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-slate-600">Total Kontrak</span><span className="font-mono font-bold">{rupiah(total)}</span></div>
                    {dpInvoice ? (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          Dikurangi DP {dpInvoice.invoice_number}{' '}
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${dpPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                            {STATUS_TEXT[String(dpInvoice.payment_status).toUpperCase()] || dpInvoice.payment_status}
                          </span>
                        </span>
                        <span className="font-mono font-bold text-blue-700">−{rupiah(dpInvoice.total_amount)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500"><Info size={12} /> Booth tanpa DP: invoice ini berlaku sebagai pembayaran penuh 100%.</div>
                    )}
                    <div className="h-px bg-violet-200" />
                    <div className="flex justify-between text-sm"><span className="font-bold text-slate-800">Sisa yang harus dilunasi</span><span className="font-mono font-black text-violet-700">{rupiah(settlementAmount)}</span></div>
                    {withTax && settlementTax && (
                      <div className="text-right text-[10px] text-slate-500 font-mono">DPP {rupiah(settlementTax.dpp)} + PPN {rupiah(settlementTax.ppn)}</div>
                    )}
                    {needsDpAck && (
                      <label className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 cursor-pointer">
                        <input type="checkbox" checked={ackUnpaidDp} onChange={(e) => setAckUnpaidDp(e.target.checked)} className="mt-0.5 accent-amber-600" />
                        <span><b>DP belum diterima.</b> Invoice DP {dpInvoice.invoice_number} belum dibayar. Saya tetap ingin menerbitkan invoice pelunasan.</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Tampilan di Invoice: the total block as printed on the A4 document */}
                {!blocker && previewView && (kind === 'settlement' || (dpAmount > 0 && !dpError)) && (
                  <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-white">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tampilan di Invoice</div>
                    <div className="ml-auto max-w-[300px] text-xs">
                      <InvoiceTotals
                        view={previewView}
                        subtotalLabel={previewView.asFull ? undefined : `Subtotal ${kind === 'dp' ? 'Uang Muka / DP' : 'Pelunasan'}${previewView.showBreakdown ? ' (sebelum PPN)' : ''}:`}
                      />
                    </div>
                  </div>
                )}

                {!blocker && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cardInput} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (opsional)</label>
                      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={cardInput} placeholder="contoh: Termin 1 sesuai kontrak" />
                    </div>
                  </div>
                )}
              </>
            )}

            {error && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{error}</div>}
          </div>
        )}

        {kind && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Batal</button>
            <button type="button" disabled={!canSubmit} onClick={handleSubmit}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Menerbitkan...' : kind === 'dp' ? `Terbitkan Invoice DP${dpAmount > 0 && !dpError ? ` ${rupiah(dpAmount)}` : ''}` : `Terbitkan Invoice Pelunasan${settlementAmount > 0 && contract && !blocker ? ` ${rupiah(settlementAmount)}` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
