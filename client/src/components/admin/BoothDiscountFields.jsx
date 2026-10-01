import React from 'react';
import { Percent } from 'lucide-react';

// Private booth discount: the amount for a price, type ('nominal' | 'percentage') and value (same rule as the server,
// utils/boothDiscount.js)
export function boothDiscountAmount(price, discountType, discountValue) {
  const p = Math.max(0, Number(price) || 0);
  const v = parseFloat(discountValue) || 0;
  return discountType === 'percentage'
    ? Math.round((p * Math.min(100, Math.max(0, v))) / 100)
    : Math.min(p, Math.max(0, Math.round(v)));
}

/**
 * "Diskon & Potongan Tagihan": ONE form for the Property Inspector and the Sales booth pop up ("Beri Diskon").
 * Controlled: onChange(type, value, reason). `children` is the save area shown under "Tagihan Bersih".
 *   limit           { limited, maxDiscount, maxPercent, maxAmount } - largest discount this user may save (Sales)
 *   reasonRequired  marks the reason as mandatory
 */
export default function BoothDiscountFields({ price, discountType, discountValue, discountReason, onChange, limit = null, reasonRequired = false, children }) {
  const numPrice = Math.max(0, Number(price) || 0);
  const numDiscVal = parseFloat(discountValue) || 0;
  const calculatedDiscountAmount = boothDiscountAmount(numPrice, discountType, discountValue);
  const netFinalPrice = Math.max(0, numPrice - calculatedDiscountAmount);
  const hasDiscount = calculatedDiscountAmount > 0;
  const overLimit = Boolean(limit?.limited) && calculatedDiscountAmount > limit.maxDiscount;

  return (
    <div className="bg-gradient-to-br from-emerald-50/70 via-slate-50 to-teal-50/50 p-3.5 rounded-2xl border border-emerald-200/80 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
          <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
            <Percent size={11} />
          </div>
          <span>Diskon & Potongan Tagihan</span>
        </div>
        {hasDiscount ? (
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            -Rp {calculatedDiscountAmount.toLocaleString('id-ID')}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 font-medium">Non-diskon</span>
        )}
      </div>

      {/* Toggle Type: Nominal vs Percentage */}
      <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-0.5 rounded-xl">
        <button
          type="button"
          onClick={() => onChange('nominal', discountValue, discountReason)}
          className={`py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
            discountType === 'nominal'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Nominal (Rp)</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('percentage', discountValue, discountReason)}
          className={`py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
            discountType === 'percentage'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Persentase (%)</span>
        </button>
      </div>

      {/* Discount Value Input */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
          {discountType === 'percentage' ? 'Besaran Diskon (%)' : 'Nominal Potongan Diskon (Rp)'}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-slate-400 font-medium text-xs">
            {discountType === 'percentage' ? '%' : 'Rp'}
          </span>
          <input
            type="number"
            min="0"
            max={discountType === 'percentage' ? 100 : numPrice}
            value={discountValue}
            onChange={(e) => onChange(discountType, e.target.value, discountReason)}
            placeholder={discountType === 'percentage' ? 'Contoh: 10' : 'Contoh: 500000'}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
          />
        </div>

        {/* Quick Preset Buttons */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {discountType === 'percentage' ? (
            <>
              {[5, 10, 15, 20, 25, 50].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => onChange('percentage', pct, discountReason)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                    numDiscVal === pct
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange('percentage', 0, '')}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-400 hover:text-rose-600 border border-slate-200 bg-white hover:bg-rose-50 transition-colors cursor-pointer"
                title="Reset Diskon"
              >
                Reset
              </button>
            </>
          ) : (
            <>
              {[
                { label: '500rb', val: 500000 },
                { label: '1jt', val: 1000000 },
                { label: '2jt', val: 2000000 },
                { label: '3jt', val: 3000000 }
              ].map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange('nominal', preset.val, discountReason)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                    numDiscVal === preset.val
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange('nominal', 0, '')}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-400 hover:text-rose-600 border border-slate-200 bg-white hover:bg-rose-50 transition-colors cursor-pointer"
                title="Reset Diskon"
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Discount Reason / Catatan Promo */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
          Catatan / Alasan Diskon (Tercantum di Invoice){reasonRequired && <span className="text-rose-600"> *wajib</span>}
        </label>
        <input
          type="text"
          value={discountReason}
          onChange={(e) => onChange(discountType, discountValue, e.target.value)}
          placeholder="Contoh: Early Bird Promo, Diskon Kemitraan Khusus..."
          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400 shadow-2xs"
        />
      </div>

      {/* Live Calculation Summary & Invoice Direct Button */}
      <div className="p-2.5 bg-white/90 rounded-xl border border-emerald-100 shadow-2xs space-y-1.5">
        <div className="flex justify-between items-center text-[11px] text-slate-500">
          <span>Subtotal Normal:</span>
          <span className="font-mono">Rp {numPrice.toLocaleString('id-ID')}</span>
        </div>
        {hasDiscount && (
          <div className="flex justify-between items-center text-[11px] text-emerald-700 font-medium">
            <span>Potongan Diskon {discountType === 'percentage' ? `(${numDiscVal}%)` : ''}:</span>
            <span className="font-mono font-bold">- Rp {calculatedDiscountAmount.toLocaleString('id-ID')}</span>
          </div>
        )}
        {limit?.limited && (
          <div className={`text-[10px] font-semibold ${overLimit ? 'text-rose-700' : 'text-slate-500'}`}>
            Batas diskon Sales: maks. {limit.maxPercent}%{limit.maxAmount > 0 ? ` atau Rp ${limit.maxAmount.toLocaleString('id-ID')}` : ''} = Rp {limit.maxDiscount.toLocaleString('id-ID')} untuk booth ini.
            {overLimit && ' Diskon ini melebihi batas dan tidak bisa disimpan.'}
          </div>
        )}
        <div className="pt-1 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-slate-900">
          <span>Tagihan Bersih:</span>
          <span className="font-mono text-emerald-700 text-sm font-extrabold">
            Rp {netFinalPrice.toLocaleString('id-ID')}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
