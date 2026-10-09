import React, { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Loader2, AlertTriangle, Eye, Wallet, Info } from 'lucide-react';
import { api } from '../../services/api';
import TaxOptionsField from './TaxOptionsField';
import { computeContractTax, taxPortion, DEFAULT_TAX_NOTE } from '../../utils/invoiceTax';
import { cleanDueDays } from '../../utils/invoiceNumbering';
import InvoiceDateField from './InvoiceDateField';

const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const kindOf = (inv) => inv?.invoice_kind || 'full';
const isFixed = (v) => v === true || v === 1 || v === '1';
const isUnpaid = (inv) => ['UNPAID', 'PENDING'].includes(String(inv?.payment_status || 'UNPAID').toUpperCase());

// What the A4 document may show, per invoice. "layout" keys default to the Desain Layout Invoice setting.
const DISPLAY_OPTIONS = [
  { key: 'showContractBox', label: 'Rincian kontrak booth (DP / Pelunasan)', contractOnly: true },
  { key: 'showDiscount', label: 'Baris diskon' },
  { key: 'showDimensionsCol', label: 'Ukuran booth', layout: true },
  { key: 'showFacilitiesCol', label: 'Fasilitas booth', layout: true },
  { key: 'showTerbilang', label: 'Terbilang', layout: true },
  { key: 'showBank', label: 'Rekening tujuan transfer' },
  { key: 'showNotes', label: 'Catatan' },
  { key: 'showClientNpwp', label: 'NPWP klien', layout: true },
  { key: 'showClientAddress', label: 'Alamat klien', layout: true },
  { key: 'showClientPhone', label: 'No. telepon klien', layout: true },
  { key: 'showClientEmail', label: 'Email klien', layout: true },
  { key: 'showStamp', label: 'Stempel status (LUNAS / BELUM LUNAS)', layout: true },
  { key: 'showWatermark', label: 'Watermark', layout: true }
];

// Edit an issued invoice. The same form (and the same invoice) from Manajemen Invoice and Data Exhibitor:
//  - client data, dates, notes (PUT /invoices/:id)
//  - DP amount while the DP is unpaid; the Pelunasan follows (contract - DP), paid invoices never change
//  - the contract's PPN setting (unpaid invoices are recomputed)
//  - what the A4 document shows for this invoice
// All amounts are computed by the server (POST /invoices/:id/terms).
export default function InvoiceEditModal({ invoice, isOpen, onClose, onSaved }) {
  const kind = kindOf(invoice);
  const isContract = ['full', 'dp', 'settlement'].includes(kind) && Boolean(invoice?.floorplan_id) && Boolean(invoice?.booth_code);

  const [form, setForm] = useState({});
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [layoutCfg, setLayoutCfg] = useState({});
  const [taxCfg, setTaxCfg] = useState({ rate: 11, method: 'exclusive', note: DEFAULT_TAX_NOTE });
  const [taxOpt, setTaxOpt] = useState({ method: 'none', display: 'show' });
  const [ackTax, setAckTax] = useState(false);
  const [dpMode, setDpMode] = useState('percent');
  const [dpInput, setDpInput] = useState('');
  const [splitToDp, setSplitToDp] = useState(false);
  const [display, setDisplay] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !invoice) return;
    setForm({
      companyName: invoice.company_name || '', clientName: invoice.client_name || '', clientEmail: invoice.client_email || '',
      clientPhone: invoice.client_phone || '', clientAddress: invoice.client_address || '', clientNpwp: invoice.client_npwp || '',
      invoiceNumber: invoice.invoice_number || '', notes: invoice.notes || '',
      issueDate: invoice.issue_date || '', dueDate: invoice.due_date || '',
      issueDateFixed: isFixed(invoice.issue_date_fixed), dueDateFixed: isFixed(invoice.due_date_fixed)
    });
    setDisplay(invoice.display || {});
    setError(''); setAckTax(false); setSplitToDp(false); setContract(null);
    api.fetchInvoiceConfig().then(cfg => {
      if (!cfg) return;
      setLayoutCfg(cfg);
      const rate = Number(cfg.taxRate);
      setTaxCfg({ rate: Number.isFinite(rate) && rate >= 0 ? rate : 11, method: cfg.defaultTaxMethod === 'inclusive' ? 'inclusive' : 'exclusive', note: cfg.taxNote || DEFAULT_TAX_NOTE });
    });
    if (isContract) {
      setLoading(true);
      api.fetchContract({ floorplanId: invoice.floorplan_id, boothCode: invoice.booth_code, boothId: invoice.booth_id || '' }).then(res => {
        setLoading(false);
        if (res?.success) setContract(res.contract);
        else setError(res?.error || 'Gagal memuat kontrak booth');
      });
    }
  }, [isOpen, invoice, isContract]);

  // Contract PPN setting (a running contract keeps its own; changing it needs confirmation)
  useEffect(() => {
    if (!contract) return;
    setTaxOpt(contract.tax ? { method: contract.tax.method, display: contract.tax.display } : { method: 'none', display: 'show' });
    const dp = contract.dpInvoice;
    const dpNow = kind === 'dp' ? invoice.total_amount : dp?.total_amount;
    const total = contract.contractTotal || 0;
    setDpMode('percent');
    setDpInput(dpNow && total ? String(Math.round((Number(dpNow) / total) * 10000) / 100) : '30');
  }, [contract, kind, invoice]);

  const running = contract?.tax || null;
  const rate = running && running.method !== 'none' ? running.rate : taxCfg.rate;
  const taxChanged = Boolean(running) && (taxOpt.method !== running.method || (taxOpt.method !== 'none' && taxOpt.display !== running.display));
  const contractTax = useMemo(() => {
    if (!contract) return null;
    if (running && !taxChanged) return { method: running.method, rate: running.rate, dpp: running.dpp, ppn: running.ppn, total: running.total };
    return computeContractTax({ subtotal: contract.base?.subtotal, discount: contract.base?.discount, rate, method: taxOpt.method });
  }, [contract, running, taxChanged, rate, taxOpt.method]);

  // Which DP invoice this form edits: the DP itself, or the DP behind a Pelunasan
  const dpInvoice = kind === 'dp' ? invoice : (kind === 'settlement' ? contract?.dpInvoice : null);
  const dpEditable = Boolean(dpInvoice) && isUnpaid(dpInvoice);
  const canSplit = kind === 'full' && isUnpaid(invoice) && contract && !contract.dpInvoice && !(contract.paid > 0);
  const contractPaid = contract?.status === 'PAID';

  const total = contractTax?.total || 0;
  const dpAmount = dpMode === 'percent'
    ? Math.round((total * (parseFloat(String(dpInput).replace(',', '.')) || 0)) / 100)
    : Math.round(parseFloat(String(dpInput).replace(/\./g, '').replace(',', '.')) || 0);
  const dpTax = contractTax ? taxPortion(contractTax, dpAmount) : null;
  const showDpEditor = (dpEditable || (canSplit && splitToDp)) && contractTax;
  let dpError = '';
  if (showDpEditor) {
    if (dpAmount <= 0) dpError = 'Nilai DP tidak boleh 0.';
    else if (dpAmount >= total) dpError = 'Nilai DP harus lebih kecil dari total kontrak.';
  }
  const dpChanged = showDpEditor && dpInvoice && Math.round(Number(dpInvoice.total_amount)) !== dpAmount;
  const withTax = contractTax && contractTax.ppn > 0;

  if (!isOpen || !invoice) return null;

  const shown = (opt) => display[opt.key] ?? (opt.layout ? layoutCfg[opt.key] !== false : true);
  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const dueDays = cleanDueDays(layoutCfg.invoiceDueDays);

  const handleSave = async () => {
    setError('');
    if (taxChanged && !ackTax) { setError('Centang konfirmasi perubahan pajak kontrak terlebih dahulu.'); return; }
    if (showDpEditor && dpError) { setError(dpError); return; }
    setSaving(true);
    const messages = [];
    try {
      // 1. Client data, dates, notes
      const details = await api.saveInvoiceDetails(invoice.id, form);
      if (!details?.success) throw new Error(details?.error || 'Gagal menyimpan data invoice');

      // 2. Split an unpaid "Penuh" invoice into DP + Pelunasan (the server issues the DP; this invoice becomes the Pelunasan)
      if (canSplit && splitToDp) {
        const res = await api.createInvoice({
          invoiceKind: 'dp', floorplanId: invoice.floorplan_id, boothCode: contract.booth.code, boothId: contract.booth.id,
          dpMode, dpValue: dpMode === 'percent' ? String(dpInput).replace(',', '.') : dpAmount,
          taxMethod: taxOpt.method, taxDisplay: taxOpt.display, taxRate: rate, changeContractTax: taxChanged && ackTax
        });
        if (!res?.success) throw new Error(res?.error || 'Gagal membuat Invoice DP');
        messages.push(res.message);
      }

      // 3. DP amount (on the DP invoice) and the contract PPN
      const termsTarget = dpChanged ? dpInvoice.id : invoice.id;
      if (isContract && !(canSplit && splitToDp) && (dpChanged || taxChanged)) {
        const res = await api.updateInvoiceTerms(termsTarget, {
          ...(dpChanged ? { dpMode, dpValue: dpMode === 'percent' ? String(dpInput).replace(',', '.') : dpAmount } : {}),
          ...(taxChanged ? { taxMethod: taxOpt.method, taxDisplay: taxOpt.display, taxRate: rate, changeContractTax: true } : {})
        });
        if (!res?.success) throw new Error(res?.error || 'Gagal mengubah DP / pajak');
        messages.push(res.message);
      }

      // 4. What this invoice's document shows
      const shownNow = Object.fromEntries(DISPLAY_OPTIONS.map(o => [o.key, shown(o)]));
      const res = await api.updateInvoiceTerms(invoice.id, { display: shownNow });
      if (!res?.success) throw new Error(res?.error || 'Gagal menyimpan pengaturan tampilan');

      const numberNow = details.invoice?.invoice_number || invoice.invoice_number;
      if (numberNow !== invoice.invoice_number) messages.unshift(`Nomor invoice diubah: ${invoice.invoice_number} → ${numberNow}.`);
      onSaved?.(res.invoice, messages.filter(Boolean).join(' ') || `Invoice ${numberNow} berhasil diperbarui.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white';
  const label = 'block text-[11px] font-bold text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col my-auto max-h-[94vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Pencil size={16} /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Edit Invoice {invoice.invoice_number}</h3>
              <p className="text-xs text-slate-500">
                {kind === 'dp' ? 'Invoice DP / Uang Muka' : kind === 'settlement' ? 'Invoice Pelunasan' : kind === 'facility' ? 'Invoice Fasilitas' : 'Invoice Penuh'}
                {invoice.booth_code ? ` • Booth #${invoice.booth_code}` : ''} • {invoice.company_name}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Data klien */}
          <section className="space-y-2.5">
            <div className="text-xs font-bold text-slate-800">Data Klien</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div><label className={label}>Nama Perusahaan / Brand</label><input className={input} value={form.companyName || ''} onChange={setField('companyName')} /></div>
              <div><label className={label}>Nama PIC</label><input className={input} value={form.clientName || ''} onChange={setField('clientName')} /></div>
              <div><label className={label}>Email</label><input className={input} value={form.clientEmail || ''} onChange={setField('clientEmail')} /></div>
              <div><label className={label}>No. Telepon / WA</label><input className={input} value={form.clientPhone || ''} onChange={setField('clientPhone')} /></div>
              <div><label className={label}>NPWP</label><input className={input} value={form.clientNpwp || ''} onChange={setField('clientNpwp')} /></div>
              <div><label className={label}>Alamat</label><input className={input} value={form.clientAddress || ''} onChange={setField('clientAddress')} /></div>
            </div>
            <div><label className={label}>Catatan</label><textarea rows={2} className={input} value={form.notes || ''} onChange={setField('notes')} /></div>
          </section>

          {/* Nomor & tanggal (AGENTS.md §44) */}
          <section className="space-y-2.5">
            <div className="text-xs font-bold text-slate-800">Nomor & Tanggal Invoice</div>
            <div>
              <label className={label} htmlFor="inv-edit-number">Nomor Invoice</label>
              <input id="inv-edit-number" className={`${input} font-mono`} value={form.invoiceNumber || ''} onChange={setField('invoiceNumber')} spellCheck={false} autoComplete="off" />
              <p className="mt-1 text-[10px] text-slate-500">Huruf, angka, dan tanda / . _ - tanpa spasi. Tidak boleh sama dengan nomor invoice lain. Booking ikut memakai nomor baru, dan perubahan tercatat di Log Aktivitas.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {['issue', 'due'].map(which => (
                <InvoiceDateField key={which} which={which} value={form} dueDays={dueDays} inputClassName={input} onChange={(patch) => setForm(f => ({ ...f, ...patch }))} />
              ))}
            </div>
          </section>

          {/* Tagihan: DP & PPN */}
          {isContract && (
            <section className="space-y-2.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Wallet size={14} className="text-blue-600" /> Tagihan Kontrak Booth</div>
              {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Memuat kontrak...</div>}
              {contract && contractTax && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[['Total Kontrak', total], ['Sudah Dibayar', contract.paid], ['Sisa', Math.max(0, total - contract.paid)]].map(([l, v]) => (
                      <div key={l} className="p-2 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">{l}</div>
                        <div className="font-mono font-bold text-slate-900">{rupiah(v)}</div>
                      </div>
                    ))}
                  </div>
                  {withTax && (
                    <div className="text-[11px] text-slate-500">
                      {contractTax.method === 'inclusive' ? `Sudah termasuk PPN ${rupiah(contractTax.ppn)}` : `DPP ${rupiah(contractTax.dpp)} + PPN ${rupiah(contractTax.ppn)}`}
                    </div>
                  )}

                  {!contractPaid && (
                    <div className="space-y-1.5">
                      <TaxOptionsField value={taxOpt} onChange={(v) => { setTaxOpt(v); setAckTax(false); }} rate={rate} defaultMethod={taxCfg.method} />
                      {taxChanged && (
                        <label className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs cursor-pointer">
                          <input type="checkbox" checked={ackTax} onChange={(e) => setAckTax(e.target.checked)} className="mt-0.5 accent-amber-600" />
                          <span><b>Pajak kontrak akan diubah.</b> Invoice yang belum dibayar dihitung ulang; invoice yang sudah DP / Lunas tidak berubah otomatis.</span>
                        </label>
                      )}
                    </div>
                  )}

                  {canSplit && (
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={splitToDp} onChange={(e) => setSplitToDp(e.target.checked)} className="accent-blue-600" />
                      <span><b>Bagi menjadi DP + Pelunasan</b> (invoice ini menjadi Invoice Pelunasan untuk sisanya)</span>
                    </label>
                  )}

                  {dpInvoice && !dpEditable && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      <Info size={13} className="shrink-0 mt-0.5" />
                      <span>DP {dpInvoice.invoice_number} ({rupiah(dpInvoice.total_amount)}) sudah dibayar, nominalnya tidak bisa diubah. Pelunasan = kontrak − DP.</span>
                    </div>
                  )}

                  {showDpEditor && (
                    <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">DP yang harus dibayar{kind === 'settlement' && dpInvoice ? ` (Invoice ${dpInvoice.invoice_number})` : ''}</span>
                        <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
                          {[['percent', '%'], ['nominal', 'Rp']].map(([m, l]) => (
                            <button key={m} type="button" onClick={() => { setDpMode(m); setDpInput(m === 'percent' ? String(total ? Math.round((dpAmount / total) * 10000) / 100 : 30) : String(dpAmount)); }}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${dpMode === m ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {[30, 50].map(p => (
                          <button key={p} type="button" onClick={() => { setDpMode('percent'); setDpInput(String(p)); }}
                            className="px-3 py-1.5 rounded-lg border text-xs font-bold bg-white text-slate-700 border-slate-200 hover:bg-slate-50">{p}%</button>
                        ))}
                        <input className={`${input} flex-1`} inputMode="decimal" value={dpInput} onChange={(e) => setDpInput(e.target.value)} />
                        <span className="text-xs text-slate-500 w-6">{dpMode === 'percent' ? '%' : 'Rp'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          <div className="text-slate-500">Nilai DP ({total ? Math.round((dpAmount / total) * 10000) / 100 : 0}%)</div>
                          <div className="font-mono font-bold text-blue-700">{rupiah(dpAmount)}</div>
                          {withTax && dpAmount > 0 && <div className="text-[10px] text-slate-500 font-mono">DPP {rupiah(dpTax.dpp)} + PPN {rupiah(dpTax.ppn)}</div>}
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          <div className="text-slate-500">Sisa via Invoice Pelunasan</div>
                          <div className="font-mono font-bold text-violet-700">{rupiah(Math.max(0, total - dpAmount))}</div>
                        </div>
                      </div>
                      {dpError && <div className="text-xs font-medium text-rose-600">{dpError}</div>}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Tampilan dokumen */}
          <section className="space-y-2">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Eye size={14} className="text-emerald-600" /> Yang Ditampilkan di Invoice</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {DISPLAY_OPTIONS.filter(o => !o.contractOnly || ['dp', 'settlement'].includes(kind)).map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={shown(opt)} onChange={(e) => setDisplay(d => ({ ...d, [opt.key]: e.target.checked }))} className="accent-emerald-600" />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Hanya untuk invoice ini. Rincian PPN diatur lewat "Tampilan di Invoice" pada pajak di atas (hanya bisa disembunyikan untuk harga yang sudah termasuk PPN).
            </p>
          </section>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Batal</button>
          <button type="button" disabled={saving || loading} onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
}
