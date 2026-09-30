import React from 'react';

// Pengaturan pajak bertingkat (shared/invoiceTax.js):
//   Pajak: Tanpa PPN / Dengan PPN (tarif dari Setting)
//   Metode Perhitungan: PPN ditambahkan ke harga / Harga sudah termasuk PPN
//   Tampilan di Invoice: Tampilkan / Sembunyikan rincian PPN (sembunyikan hanya untuk "sudah termasuk PPN")
// value = { method: 'none' | 'exclusive' | 'inclusive', display: 'show' | 'hide' }
export default function TaxOptionsField({ value, onChange, rate = 11, defaultMethod = 'exclusive', disabled = false, compact = false }) {
  const method = value?.method || 'none';
  const display = method === 'inclusive' && value?.display === 'hide' ? 'hide' : 'show';
  const withTax = method !== 'none';
  const set = (next) => {
    const m = next.method ?? method;
    const d = next.display ?? display;
    onChange?.({ method: m, display: m === 'inclusive' && d === 'hide' ? 'hide' : 'show' });
  };

  const pill = (active) => `px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`;
  const option = (active, off) => `flex-1 min-w-[180px] text-left p-2.5 rounded-lg border text-[11px] transition-colors ${off
    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
    : active ? 'border-indigo-500 bg-indigo-50/70 text-slate-800 ring-1 ring-indigo-500/30' : `border-slate-200 bg-white text-slate-600 ${disabled ? 'cursor-not-allowed' : 'hover:border-indigo-300 cursor-pointer'}`}`;
  const dot = (active) => <span className={`inline-block w-3 h-3 rounded-full border-2 mr-1.5 align-[-1px] ${active ? 'border-indigo-600 bg-indigo-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300 bg-white'}`} />;

  return (
    <div className={`space-y-2.5 ${compact ? '' : 'p-3.5 rounded-xl border border-slate-200 bg-slate-50/60'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
        <span className="font-bold w-40 shrink-0">Pajak</span>
        <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
          <button type="button" disabled={disabled} onClick={() => set({ method: 'none' })} className={pill(!withTax)}>Tanpa PPN</button>
          <button type="button" disabled={disabled} onClick={() => set({ method: withTax ? method : defaultMethod })} className={pill(withTax)}>Dengan PPN {rate}%</button>
        </div>
      </div>

      {withTax && (
        <>
          <div className="flex flex-wrap items-start gap-2 text-xs text-slate-700">
            <span className="font-bold w-40 shrink-0 pt-2">Metode Perhitungan</span>
            <div className="flex flex-wrap gap-2 flex-1">
              <button type="button" disabled={disabled} onClick={() => set({ method: 'exclusive', display: 'show' })} className={option(method === 'exclusive')}>
                <div className="font-bold">{dot(method === 'exclusive')}PPN ditambahkan ke harga</div>
                <div className="mt-0.5 text-slate-500">Harga sewa = harga sebelum pajak. Total = harga + PPN.</div>
              </button>
              <button type="button" disabled={disabled} onClick={() => set({ method: 'inclusive' })} className={option(method === 'inclusive')}>
                <div className="font-bold">{dot(method === 'inclusive')}Harga sudah termasuk PPN</div>
                <div className="mt-0.5 text-slate-500">Total tetap sama dengan harga sewa. PPN dihitung dari dalamnya.</div>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2 text-xs text-slate-700">
            <span className="font-bold w-40 shrink-0 pt-2">Tampilan di Invoice</span>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => set({ display: 'show' })} className={option(display === 'show')}>
                  <div className="font-bold">{dot(display === 'show')}Tampilkan rincian PPN</div>
                  <div className="mt-0.5 text-slate-500">Subtotal / DPP, PPN ({rate}%), dan Total.</div>
                </button>
                <button type="button" disabled={disabled || method === 'exclusive'} onClick={() => set({ display: 'hide' })} className={option(display === 'hide', method === 'exclusive')}>
                  <div className="font-bold">{dot(display === 'hide')}Sembunyikan rincian PPN</div>
                  <div className="mt-0.5">Hanya total, dengan keterangan kecil "Harga sudah termasuk PPN".</div>
                </button>
              </div>
              {method === 'exclusive' && (
                <div className="text-[11px] text-slate-500">Rincian PPN wajib ditampilkan karena pajak ditambahkan di atas harga.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
