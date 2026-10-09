import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock, MapPin, Search, X, Loader2 } from 'lucide-react';
import { chatApi } from '../../services/chat';
import { api } from '../../services/api';
import { STATUS_CONFIG } from '../../utils/floorplanUtils';
import { canAccessPage } from '../../utils/roles';
import InvoiceA4View from '../admin/InvoiceA4View';

// Which attachments a role may send / open (the server checks the same lists, AGENTS.md §38)
export const canAttachBooth = (role) => ['superadmin', 'finance', 'sales', 'operations'].includes(role);
export const canAttachInvoice = (role) => ['superadmin', 'finance', 'sales'].includes(role);

const PAYMENT_LABELS = { PAID: 'Lunas', PARTIAL: 'Uang Muka', UNPAID: 'Belum Bayar', PENDING: 'Menunggu', CANCELED: 'Dibatalkan' };
const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const cardKey = (a) => (a.type === 'booth' ? `booth:${a.floorplanId}:${a.boothCode}` : `invoice:${a.invoiceId}`);
const cardCache = new Map(); // ponytail: per tab, never refreshed; a status change shows after a page reload

export function attachmentLabel(a) {
  if (!a) return '';
  return a.type === 'booth' ? `Booth ${a.boothCode}` : 'Invoice';
}

// The card inside a bubble, resolved with the READER's rights
export function AttachmentCard({ attachment, mine, role }) {
  const navigate = useNavigate();
  const key = cardKey(attachment);
  const [state, setState] = useState(() => cardCache.get(key) || null);
  const [invoice, setInvoice] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (cardCache.has(key)) return;
    const params = attachment.type === 'booth'
      ? { type: 'booth', floorplanId: attachment.floorplanId, boothCode: attachment.boothCode }
      : { type: 'invoice', invoiceId: attachment.invoiceId };
    chatApi.attachment(params).then(r => {
      const value = r.success ? r : { allowed: true, missing: true };
      cardCache.set(key, value);
      setState(value);
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = mine ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-50 border-slate-200 text-slate-800';
  const sub = mine ? 'text-indigo-100' : 'text-slate-500';
  const Icon = attachment.type === 'booth' ? MapPin : FileText;

  if (!state) {
    return <div className={`mt-1 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${tone}`}><Loader2 size={13} className="animate-spin" /> Memuat {attachmentLabel(attachment).toLowerCase()}…</div>;
  }
  if (!state.allowed || state.missing) {
    return (
      <div className={`mt-1 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${tone}`}>
        <Lock size={13} className="shrink-0" />
        <span>{state.missing ? `${attachmentLabel(attachment)} sudah tidak ada` : `${attachmentLabel(attachment)} · Tidak ada akses`}</span>
      </div>
    );
  }

  const card = state.card;
  const canOpen = card.type === 'invoice' || canAccessPage(role, 'floorplan');
  const open = async () => {
    if (card.type === 'booth') {
      navigate(`/admin/floorplan?templateId=${encodeURIComponent(card.floorplanId)}&booth=${encodeURIComponent(card.code)}`);
      return;
    }
    setOpening(true);
    setInvoice(await api.fetchInvoiceById(card.id));
    setOpening(false);
  };
  const status = card.type === 'booth' ? STATUS_CONFIG[card.status] || STATUS_CONFIG.available : null;

  return (
    <>
      <button
        type="button"
        onClick={canOpen ? open : undefined}
        disabled={!canOpen || opening}
        className={`mt-1 w-full text-left rounded-lg border px-3 py-2 flex items-start gap-2.5 transition-[background-color,transform] duration-150 ${tone} ${canOpen ? 'cursor-pointer hover:bg-black/5 active:scale-[0.98]' : 'cursor-default'}`}
        title={canOpen ? (card.type === 'booth' ? 'Buka booth di Floorplan Studio' : 'Buka invoice') : undefined}
      >
        <Icon size={15} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {card.type === 'booth' ? (
            <>
              <span className="block text-xs font-bold">Booth {card.code}</span>
              <span className={`block text-[11px] truncate ${sub}`}>{card.ownerName || 'Belum ada tenant'} · {card.floorplanTitle}</span>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold bg-white text-slate-700 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.pillBg }} />{status.label}
              </span>
            </>
          ) : (
            <>
              <span className="block text-xs font-bold">{card.invoiceNumber}</span>
              <span className={`block text-[11px] truncate ${sub}`}>{card.companyName || '-'}{card.boothCode ? ` · #${card.boothCode}` : ''}</span>
              <span className="block text-[11px] font-semibold tabular-nums">{rupiah(card.totalAmount)} · {PAYMENT_LABELS[card.paymentStatus] || card.paymentStatus}</span>
            </>
          )}
        </span>
        {opening && <Loader2 size={13} className="animate-spin mt-0.5" />}
      </button>
      {invoice && (
        <div className="relative z-[90]">
          <InvoiceA4View invoice={invoice} allowSend onClose={() => setInvoice(null)} />
        </div>
      )}
    </>
  );
}

// Picker above the composer: a booth of a floorplan, or an invoice (search by number / brand / booth)
export function AttachmentPicker({ role, onPick, onClose }) {
  const tabs = [canAttachBooth(role) && 'booth', canAttachInvoice(role) && 'invoice'].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]);
  const [query, setQuery] = useState('');
  const [floorplans, setFloorplans] = useState([]);
  const [floorplanId, setFloorplanId] = useState('');
  const [booths, setBooths] = useState([]);
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    if (tab !== 'booth' || floorplans.length) return;
    api.fetchFloorplanList().then(list => {
      setFloorplans(list);
      if (list[0]) setFloorplanId(list[0].id);
    });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!floorplanId) return;
    setBooths([]);
    api.fetchFloorplanById(floorplanId).then(fp => setBooths(fp?.booths || []));
  }, [floorplanId]);

  useEffect(() => {
    if (tab === 'invoice' && invoices === null) api.fetchInvoices().then(setInvoices);
  }, [tab, invoices]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (tab === 'booth') {
      return booths
        .filter(b => !q || String(b.code).toLowerCase().includes(q) || String(b.owner_name || '').toLowerCase().includes(q))
        .slice(0, 8)
        .map(b => ({ key: b.code, title: `Booth ${b.code}`, sub: b.owner_name || 'Belum ada tenant', value: { type: 'booth', floorplanId, boothCode: b.code } }));
    }
    return (invoices || [])
      .filter(i => !q || [i.invoice_number, i.company_name, i.booth_code].some(v => String(v || '').toLowerCase().includes(q)))
      .slice(0, 8)
      .map(i => ({ key: i.id, title: i.invoice_number, sub: `${i.company_name || '-'} · #${i.booth_code || '-'} · ${rupiah(i.total_amount)}`, value: { type: 'invoice', invoiceId: i.id } }));
  }, [tab, booths, invoices, q, floorplanId]);

  const loading = tab === 'booth' ? !booths.length && Boolean(floorplanId) : invoices === null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.25)] overflow-hidden" role="dialog" aria-label="Lampirkan booth atau invoice">
      <div className="flex items-center gap-1 px-2 pt-2">
        {tabs.map(t => (
          <button key={t} type="button" onClick={() => { setTab(t); setQuery(''); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t === 'booth' ? 'Booth' : 'Invoice'}
          </button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X size={15} /></button>
      </div>
      <div className="p-2 flex gap-2">
        {tab === 'booth' && floorplans.length > 1 && (
          <select value={floorplanId} onChange={(e) => setFloorplanId(e.target.value)} className="max-w-[45%] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700">
            {floorplans.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        )}
        <label className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'booth' ? 'Nomor booth atau tenant' : 'Nomor invoice, brand, atau booth'}
            className="w-full rounded-lg border border-slate-200 pl-8 pr-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
        </label>
      </div>
      <div className="max-h-56 overflow-y-auto pb-1">
        {loading && <p className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Memuat…</p>}
        {!loading && !results.length && <p className="px-3 py-3 text-xs text-slate-500">Tidak ada yang cocok</p>}
        {results.map(r => (
          <button key={r.key} type="button" onClick={() => onPick(r.value, r.title)}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
            <span className="block text-xs font-semibold text-slate-800">{r.title}</span>
            <span className="block text-[11px] text-slate-500 truncate">{r.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
