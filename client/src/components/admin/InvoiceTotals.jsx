import React from 'react';

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

// Total block of the invoice document: booth price and PPN shown separately (shared/invoiceTax.js `invoiceTaxView`).
// Used by the A4 document and by the "Tampilan di Invoice" preview in the invoice forms, so both always match.
//   Tampilkan rincian PPN : Subtotal Harga Booth, Diskon, DPP (only with a discount), PPN x%, TOTAL TAGIHAN
//   Sembunyikan rincian   : TOTAL TAGIHAN + the note "Harga sudah termasuk PPN"
//   Tanpa PPN             : no PPN line at all
export default function InvoiceTotals({ view, primaryColor = '#4f46e5', discountLabel = 'Diskon Khusus', discountReason = '', subtotalLabel, totalLabel = 'TOTAL TAGIHAN:' }) {
  if (!view) return null;
  const hasDiscount = view.discount > 0;
  const showSubtotal = view.showBreakdown || view.method === 'none' || hasDiscount;
  const reason = discountReason || view.discountReason;

  return (
    <div className="space-y-2">
      {showSubtotal && (
        <div className="flex justify-between gap-3 text-slate-600">
          <span>{subtotalLabel || (view.showBreakdown ? 'Subtotal Harga Booth:' : 'Subtotal:')}</span>
          <span className="font-mono font-bold text-slate-800 whitespace-nowrap">{rp(view.subtotal)}</span>
        </div>
      )}

      {hasDiscount && (
        <div className="flex justify-between items-center text-emerald-700 bg-emerald-50/80 px-2.5 py-1.5 rounded-lg border border-emerald-200">
          <div>
            <span className="font-bold block text-xs">{discountLabel}:</span>
            {reason && <span className="text-[10px] text-emerald-600 italic block">{reason}</span>}
          </div>
          <span className="font-mono font-bold text-xs whitespace-nowrap">- {rp(view.discount)}</span>
        </div>
      )}

      {view.showBreakdown && hasDiscount && (
        <div className="flex justify-between gap-3 text-slate-600">
          <span>DPP (Dasar Pengenaan Pajak):</span>
          <span className="font-mono font-bold text-slate-800 whitespace-nowrap">{rp(view.dpp)}</span>
        </div>
      )}

      {view.showBreakdown && (
        <div className="flex justify-between gap-3 text-slate-600">
          <span>PPN {view.rate}%{view.method === 'inclusive' ? ' (termasuk dalam harga)' : ''}:</span>
          <span className="font-mono font-medium text-slate-800 whitespace-nowrap">{view.method === 'inclusive' ? '' : '+ '}{rp(view.ppn)}</span>
        </div>
      )}

      <div className="border-t-2 pt-2 flex justify-between items-baseline gap-3" style={{ borderColor: primaryColor }}>
        <span className="text-xs font-black uppercase tracking-wider" style={{ color: primaryColor }}>{totalLabel}</span>
        <span className="text-base font-black font-mono text-slate-950 whitespace-nowrap">{rp(view.total)}</span>
      </div>

      {view.method === 'inclusive' && (
        <div className="text-[10px] italic text-slate-500 text-right">{view.note}</div>
      )}
    </div>
  );
}
