import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, CalendarPlus, Percent, RefreshCw, AlertCircle, Search, UserPlus, Users, ArrowLeft, Save, Eye } from 'lucide-react';
import { api } from '../../services/api';
import BoothDiscountFields, { boothDiscountAmount } from './BoothDiscountFields';
import InvoiceA4View from './InvoiceA4View';

// Booth pop up of the read-only Studio (role Sales, AGENTS.md §27): header with the booth's data and three actions,
// "Buat Invoice", "Booking Manual", "Beri Diskon". Which buttons are active is decided by the server
// (GET /booth-actions/summary), so the pop up and the API never disagree. Popover next to the booth on a wide
// screen, bottom sheet on a phone. Closes with a click outside, the X button or Esc.

const rp = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
const STATUS_BADGE = {
  available: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  free: 'bg-blue-100 text-blue-800 border-blue-300',
  reserved: 'bg-amber-100 text-amber-800 border-amber-300',
  booked: 'bg-amber-100 text-amber-800 border-amber-300',
  sold: 'bg-rose-100 text-rose-800 border-rose-300',
  maintenance: 'bg-slate-200 text-slate-700 border-slate-300'
};
const POPOVER_W = 340;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 768;
const inputCls = 'w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400';
const labelCls = 'block text-[11px] font-semibold text-slate-600 mb-1';

function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-semibold flex items-start gap-1.5">
      <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// Centered dialog on a wide screen, bottom sheet on a phone
function Sheet({ title, onBack, onClose, wide = false, children }) {
  return (
    <div className="fixed inset-0 z-[53] flex items-end md:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'md:max-w-4xl' : 'md:max-w-md'} max-h-[92vh] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button type="button" onClick={onBack} className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer" title="Kembali" aria-label="Kembali">
                <ArrowLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-bold text-slate-900 truncate">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer" title="Tutup" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">{children}</div>
      </div>
    </div>
  );
}

function BookingForm({ floorplanId, summary, onSaved, onError }) {
  const b = summary.booth;
  const editing = summary.actions.booking.mode === 'edit';
  const [tenantMode, setTenantMode] = useState('new'); // 'new' | 'existing'
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    brandName: b.ownerName || '', fullName: b.picName || '', phone: b.phone || '', email: b.email || '',
    brandCategory: b.brandCategory || '', notes: b.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    let alive = true;
    api.fetchBrandCategories(true, floorplanId).then(cats => { if (alive && Array.isArray(cats)) setCategories(cats.filter(c => c.isActive !== false)); });
    if (!editing) api.fetchRegisteredClients().then(list => { if (alive) setClients(list || []); });
    return () => { alive = false; };
  }, [floorplanId, editing]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? clients.filter(c => [c.company_name, c.pic_name, c.email, c.phone].some(v => String(v || '').toLowerCase().includes(q))) : clients;
    return list.slice(0, 8);
  }, [clients, query]);

  const pick = (c) => {
    setForm(f => ({ ...f, brandName: c.company_name || '', fullName: c.pic_name || '', phone: c.phone || '', email: c.email || '', brandCategory: c.brand_category || f.brandCategory }));
    setTenantMode('new');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v || '').trim()]));
    if (!data.brandName || !data.fullName || !data.phone || !data.email) { setError('Nama tenant / brand, nama PIC, no. WhatsApp dan email wajib diisi.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) { setError('Format email tidak valid.'); return; }
    setSaving(true);
    const payload = { floorplanId, boothId: b.id, boothCode: b.code, ...data };
    const res = editing
      ? await api.updateTenantBiodata(payload)
      : await api.checkoutOrder({ ...payload, boothCodes: [b.code], boothIds: [b.id], bookingType: 'booking', deferInvoice: true, source: 'admin' });
    setSaving(false);
    if (res?.success) { onSaved(editing ? `Booking booth ${b.code} diperbarui.` : `Booth ${b.code} dibooking untuk "${data.brandName}" (Reserved).`); return; }
    setError(res?.error || 'Booking gagal disimpan.');
    onError?.(res);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {!editing && (
        <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-0.5 rounded-xl">
          {[['new', 'Tenant Baru', UserPlus], ['existing', 'Pilih Tenant Terdaftar', Users]].map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTenantMode(id)}
              className={`py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer ${tenantMode === id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      )}

      {tenantMode === 'existing' && !editing ? (
        <div className="space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama brand, PIC, email, atau no. WhatsApp" className={`${inputCls} pl-8`} aria-label="Cari tenant terdaftar" />
          </div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {matches.length === 0 && <div className="p-3 text-[11px] text-slate-500">Tidak ada tenant yang cocok. Pilih "Tenant Baru" untuk mengisi data baru.</div>}
            {matches.map((c) => (
              <button key={`${c.company_name}|${c.email}`} type="button" onClick={() => pick(c)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 cursor-pointer">
                <div className="text-xs font-bold text-slate-900">{c.company_name}</div>
                <div className="text-[11px] text-slate-500 truncate">{[c.pic_name, c.phone, c.email].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls} htmlFor="sb-brand">Nama Tenant / Brand *</label>
            <input id="sb-brand" type="text" value={form.brandName} onChange={set('brandName')} className={inputCls} placeholder="Contoh: Kopi Nusantara" />
          </div>
          <div>
            <label className={labelCls} htmlFor="sb-pic">Nama PIC *</label>
            <input id="sb-pic" type="text" value={form.fullName} onChange={set('fullName')} className={inputCls} placeholder="Nama penanggung jawab" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="sb-phone">No. WhatsApp *</label>
              <input id="sb-phone" type="tel" value={form.phone} onChange={set('phone')} className={inputCls} placeholder="08xxxxxxxxxx" />
            </div>
            <div>
              <label className={labelCls} htmlFor="sb-email">Email *</label>
              <input id="sb-email" type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="nama@perusahaan.com" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="sb-cat">Kategori Produk</label>
            <select id="sb-cat" value={form.brandCategory} onChange={set('brandCategory')} className={inputCls}>
              <option value="">Pilih kategori</option>
              {form.brandCategory && !categories.some(c => c.name === form.brandCategory) && <option value={form.brandCategory}>{form.brandCategory}</option>}
              {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="sb-notes">Catatan</label>
            <textarea id="sb-notes" rows={2} value={form.notes} onChange={set('notes')} className={inputCls} placeholder="Catatan booking (opsional)" maxLength={500} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" disabled={saving} className={`w-full py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-1.5 cursor-pointer ${saving ? 'opacity-70 cursor-wait' : ''}`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan Booking' : 'Simpan Booking (Reserved)'}
          </button>
        </>
      )}
    </form>
  );
}

function DiscountForm({ floorplanId, summary, onSaved }) {
  const b = summary.booth;
  const [type, setType] = useState(b.discountType || 'nominal');
  const [value, setValue] = useState(String(b.discountValue || 0));
  const [reason, setReason] = useState(b.discountReason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = boothDiscountAmount(b.price, type, value);
  const overLimit = summary.discountLimit?.limited && amount > summary.discountLimit.maxDiscount;

  const save = async () => {
    setError('');
    if (amount > 0 && !reason.trim()) { setError('Catatan alasan diskon wajib diisi.'); return; }
    setSaving(true);
    const res = await api.saveBoothActionDiscount({ floorplanId, boothId: b.id, boothCode: b.code, discountType: type, discountValue: parseFloat(value) || 0, discountReason: reason.trim() });
    setSaving(false);
    if (res?.success) onSaved(`Diskon booth ${b.code} tersimpan. Tagihan bersih ${rp(res.discount.netTotal)}.`, res);
    else setError(res?.error || 'Diskon gagal disimpan.');
  };

  return (
    <BoothDiscountFields
      price={b.price} discountType={type} discountValue={value} discountReason={reason}
      onChange={(t, v, r) => { setType(t); setValue(String(v)); setReason(r); setError(''); }}
      limit={summary.discountLimit} reasonRequired
    >
      <div className="pt-1.5 space-y-1.5">
        <button type="button" onClick={save} disabled={saving || overLimit}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 ${overLimit ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 cursor-pointer'} ${saving ? 'opacity-70 cursor-wait' : ''}`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Menyimpan...' : 'Simpan Diskon'}
        </button>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </BoothDiscountFields>
  );
}

function InvoicePreview({ floorplanId, summary, onIssued }) {
  const b = summary.booth;
  const p = summary.invoicePreview;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const generate = async () => {
    setError('');
    setSaving(true);
    const res = await api.generateBoothInvoice({ floorplanId, boothId: b.id, boothCode: b.code });
    setSaving(false);
    if (res?.success || res?.code === 'CONTRACT_HAS_INVOICES') onIssued(res);
    else setError(res?.error || 'Invoice gagal diterbitkan.');
  };
  const rows = [
    ['Tenant / Brand', b.ownerName], ['PIC', [b.picName, b.phone].filter(Boolean).join(' · ')],
    ['Booth', `#${b.code} · ${b.widthM}x${b.heightM}m${b.hall ? ` · ${b.hall}` : ''}`],
    ['Harga Sewa', rp(p.subtotal)],
    ['Diskon', p.discount > 0 ? `- ${rp(p.discount)}${b.discountReason ? ` (${b.discountReason})` : ''}` : 'Tidak ada'],
    ...(p.taxAmount > 0 ? [[`PPN ${p.taxRate}%${p.taxMethod === 'inclusive' ? ' (termasuk)' : ''}`, rp(p.taxAmount)]] : []),
    ['Total Tagihan', rp(p.total)]
  ];
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-[260px_1fr] gap-3">
        <div className="space-y-2">
          <dl className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-[11px]">
            {rows.map(([k, v], i) => (
              <div key={k} className={`px-3 py-2 ${i === rows.length - 1 ? 'bg-emerald-50 font-bold text-slate-900' : ''}`}>
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-slate-900 font-semibold break-words">{v || '-'}</dd>
              </div>
            ))}
          </dl>
          <ErrorNote>{error}</ErrorNote>
          <button type="button" onClick={generate} disabled={saving} className={`w-full py-2.5 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 flex items-center justify-center gap-1.5 cursor-pointer ${saving ? 'opacity-70 cursor-wait' : ''}`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
            {saving ? 'Menerbitkan...' : 'Generate Invoice'}
          </button>
          <p className="text-[10px] text-slate-500">Setelah terbit, invoice bisa diunduh sebagai PDF dan dikirim lewat WhatsApp. Nomor invoice diberikan saat terbit.</p>
        </div>
        <div className="border border-slate-200 rounded-xl bg-slate-100 overflow-auto max-h-[60vh] hidden md:block">
          <div style={{ zoom: 0.62 }}>
            <InvoiceA4View invoice={p.invoice} isLivePreview />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SalesBoothActions({ floorplanId, booth, anchor, onClose, onChanged, showToast }) {
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('menu'); // 'menu' | 'booking' | 'discount' | 'invoice' | 'invoices'
  const [thenInvoice, setThenInvoice] = useState(false);
  const [a4Invoice, setA4Invoice] = useState(null);
  const [narrow, setNarrow] = useState(isNarrow());
  const popRef = useRef(null);
  const code = booth?.code || booth?.booth_number || '';

  const load = useCallback(async () => {
    const res = await api.fetchBoothActionSummary({ floorplanId, boothCode: code, boothId: '' });
    if (res?.success) { setSummary(res); setLoadError(''); onChanged?.(res.booth); return res; }
    setLoadError(res?.error || 'Data booth gagal dimuat.');
    return null;
  }, [floorplanId, code, onChanged]);

  useEffect(() => { setSummary(null); setView('menu'); setA4Invoice(null); load(); }, [floorplanId, code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => setNarrow(isNarrow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc: back to the menu from a form, otherwise close. A click outside the pop up closes it (capture phase, so a
  // click on another booth closes this one before the canvas opens the next).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (a4Invoice) setA4Invoice(null);
      else if (view !== 'menu') setView('menu');
      else onClose();
    };
    const onDown = (e) => {
      if (view !== 'menu' || a4Invoice) return;
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true); };
  }, [view, a4Invoice, onClose]);

  const openInvoiceAction = () => {
    const act = summary.actions.invoice;
    if (act.mode === 'booking') { setThenInvoice(true); setView('booking'); showToast?.('Booth belum punya tenant: isi Booking Manual dulu, lalu lanjut ke invoice.'); return; }
    if (act.mode === 'create') { setView('invoice'); return; }
    if (summary.invoices.length === 1) setA4Invoice(summary.invoices[0]);
    else setView('invoices');
  };

  const b = summary?.booth;
  // Beside the booth: to its right, or to its left when there is no room; never on top of it when avoidable
  const style = useMemo(() => {
    if (narrow || !anchor) return undefined;
    const r = anchor.rect || { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const gap = 12;
    const fitsRight = r.right + gap + POPOVER_W <= window.innerWidth - 8;
    const fitsLeft = r.left - gap - POPOVER_W >= 8;
    const left = fitsRight ? r.right + gap : fitsLeft ? r.left - gap - POPOVER_W : Math.max(8, window.innerWidth - POPOVER_W - 8);
    return { left, top: Math.max(8, Math.min(r.top, window.innerHeight - 400)) };
  }, [narrow, anchor]);
  const actionBtn = (key, Icon, color, onClick) => {
    const act = summary.actions[key];
    return (
      <div key={key}>
        <button type="button" disabled={!act.enabled} onClick={onClick} aria-describedby={act.reason ? `sba-${key}-reason` : undefined}
          className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${act.enabled ? `${color} text-white cursor-pointer` : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          <Icon size={14} /> <span>{act.label}</span>
        </button>
        {!act.enabled && act.reason && <p id={`sba-${key}-reason`} className="mt-0.5 px-1 text-[10px] text-slate-500">{act.reason}</p>}
      </div>
    );
  };

  return (
    <>
      {!a4Invoice && <div
        ref={popRef}
        role="dialog"
        aria-label={`Aksi booth ${code}`}
        style={style}
        className={narrow
          ? 'fixed inset-x-0 bottom-0 z-[52] bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 p-4 max-h-[80vh] overflow-y-auto'
          : 'fixed z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5'}
      >
        <div style={narrow ? undefined : { width: POPOVER_W - 30 }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-slate-900">Booth {code}</span>
                {b && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE[b.status] || STATUS_BADGE.maintenance}`}>{b.statusLabel}</span>}
              </div>
              {b && <div className="text-[11px] text-slate-500 mt-0.5">{b.widthM}x{b.heightM}m{b.category ? ` · ${b.category}` : ''}{b.hall ? ` · ${b.hall}` : ''}</div>}
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0" title="Tutup (Esc)" aria-label="Tutup">
              <X size={16} />
            </button>
          </div>

          {!summary && !loadError && <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500"><RefreshCw size={14} className="animate-spin" /> Memuat data booth...</div>}
          {loadError && <div className="mt-3"><ErrorNote>{loadError}</ErrorNote></div>}

          {summary && (
            <>
              <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border ${b.ownerName ? 'font-semibold text-indigo-900 bg-indigo-50 border-indigo-100' : 'text-slate-400 italic bg-slate-50 border-slate-100'}`}>
                {b.ownerName ? <>Tenant: <b>{b.ownerName}</b></> : 'Belum ada tenant'}
              </div>
              <dl className="mt-2 text-[11px] space-y-1">
                <div className="flex justify-between"><dt className="text-slate-500">Harga sewa</dt><dd className="font-mono text-slate-800">{rp(b.price)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Diskon aktif</dt><dd className={`font-mono ${b.discountAmount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>{b.discountAmount > 0 ? `- ${rp(b.discountAmount)}${b.discountType === 'percentage' ? ` (${b.discountValue}%)` : ''}` : 'Tidak ada'}</dd></div>
                <div className="flex justify-between pt-1 border-t border-slate-100 text-xs font-bold"><dt className="text-slate-900">Tagihan bersih</dt><dd className="font-mono text-emerald-700">{rp(b.netTotal)}</dd></div>
              </dl>
              <div className="mt-3 space-y-1.5">
                {actionBtn('invoice', summary.actions.invoice.mode === 'view' ? Eye : FileText, 'bg-amber-500 hover:bg-amber-600', openInvoiceAction)}
                {actionBtn('booking', CalendarPlus, 'bg-indigo-600 hover:bg-indigo-700', () => { setThenInvoice(false); setView('booking'); })}
                {actionBtn('discount', Percent, 'bg-emerald-600 hover:bg-emerald-700', () => setView('discount'))}
              </div>
            </>
          )}
        </div>
      </div>}

      {summary && view === 'booking' && (
        <Sheet title={`${summary.actions.booking.mode === 'edit' ? 'Lihat / Ubah Booking' : 'Booking Manual'} · Booth ${code}`} onBack={() => setView('menu')} onClose={onClose}>
          <BookingForm
            floorplanId={floorplanId}
            summary={summary}
            onSaved={async (msg) => {
              showToast?.(msg);
              const fresh = await load();
              setView(thenInvoice && fresh?.actions.invoice.mode === 'create' ? 'invoice' : 'menu');
              setThenInvoice(false);
            }}
            onError={(res) => { if (res?.code === 'BOOTH_TAKEN' || res?.code === 'BOOTH_MAINTENANCE') load(); }}
          />
        </Sheet>
      )}

      {summary && view === 'discount' && (
        <Sheet title={`Beri Diskon · Booth ${code}`} onBack={() => setView('menu')} onClose={onClose}>
          <DiscountForm floorplanId={floorplanId} summary={summary} onSaved={(msg, res) => { showToast?.(msg); setSummary(s => ({ ...s, ...res })); onChanged?.(res.booth); setView('menu'); }} />
        </Sheet>
      )}

      {summary && view === 'invoice' && (
        <Sheet title={`Buat Invoice · Booth ${code}`} wide onBack={() => setView('menu')} onClose={onClose}>
          <InvoicePreview
            floorplanId={floorplanId}
            summary={summary}
            onIssued={async (res) => {
              showToast?.(res.success ? res.message : 'Booth ini sudah punya invoice: menampilkan invoice yang ada.');
              await load();
              setView('menu');
              if (res.invoice) setA4Invoice(res.invoice);
            }}
          />
        </Sheet>
      )}

      {summary && view === 'invoices' && (
        <Sheet title={`Invoice · Booth ${code}`} onBack={() => setView('menu')} onClose={onClose}>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {summary.invoices.map(inv => (
              <button key={inv.id} type="button" onClick={() => setA4Invoice(inv)} className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between gap-2">
                <span>
                  <span className="block text-xs font-bold text-slate-900">{inv.invoice_number}</span>
                  <span className="block text-[11px] text-slate-500">{rp(inv.total_amount)} · {inv.payment_status}</span>
                </span>
                <Eye size={14} className="text-slate-400" />
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {a4Invoice && <InvoiceA4View invoice={a4Invoice} allowSend onClose={() => setA4Invoice(null)} />}
    </>
  );
}
