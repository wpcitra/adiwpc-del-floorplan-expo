import React, { useState, useEffect } from 'react';
import { X, ShoppingCart, Trash2, Clock, ArrowRight } from 'lucide-react';

export default function CartDrawer({ cart, onClose, onRemove, onCheckout }) {
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes (600 seconds)

  useEffect(() => {
    if (cart.length === 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose(); // Auto close when expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cart.length, onClose]);

  const total = cart.reduce((acc, curr) => acc + (curr.price || 0), 0);
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCheckoutClick = () => {
    if (cart.length > 0) {
      onCheckout?.(cart[0]);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] animate-fadeIn" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-[101] flex flex-col animate-slideInRight">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Keranjang Booth</h2>
              <p className="text-xs text-slate-500 font-medium">{cart.length} item dipilih</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Timer Alert */}
        {cart.length > 0 && (
          <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 flex items-center gap-3">
            <Clock size={16} className="text-amber-600 animate-pulse" />
            <p className="text-xs text-amber-800 font-medium leading-tight">
              Selesaikan pemesanan dalam <strong className="text-amber-700 text-sm ml-1 font-mono">{formatTime(timeLeft)}</strong><br/>
              sebelum booth dilepas ke exhibitor lain.
            </p>
          </div>
        )}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart size={48} className="mb-4 opacity-20" />
              <p className="font-medium text-sm">Keranjang masih kosong</p>
              <p className="text-xs text-slate-400 mt-1 text-center max-w-xs">
                Klik booth berwarna hijau di denah untuk memilih dan memesan booth.
              </p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex gap-4 relative group hover:border-indigo-200 transition-all">
                <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center shadow-sm shrink-0">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Booth</span>
                  <span className="text-sm font-black text-indigo-600">{item.booth_number || item.code}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800 text-sm truncate">{item.category || 'Standar'}</h4>
                  <p className="text-xs text-slate-500 mb-1">{(item.dimensions_meters?.width) || 3}x{(item.dimensions_meters?.height) || 3}m ({(item.dimensions_meters?.width || 3) * (item.dimensions_meters?.height || 3)}m²)</p>
                  <p className="font-bold text-emerald-600 text-sm">Rp {(item.price || 0).toLocaleString('id-ID')}</p>
                </div>

                <button 
                  onClick={() => onRemove(item.id)}
                  title="Hapus dari keranjang"
                  className="absolute top-3 right-3 w-7 h-7 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-rose-500 hover:border-rose-200 shadow-sm flex items-center justify-center transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer / Checkout */}
        {cart.length > 0 && (
          <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tagihan</span>
              <span className="text-xl font-black text-indigo-600">
                Rp {total.toLocaleString('id-ID')}
              </span>
            </div>
            
            <button 
              onClick={handleCheckoutClick}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 hover:-translate-y-0.5 transition-all"
            >
              Isi Data & Lanjut Bayar <ArrowRight size={16} />
            </button>
            <p className="text-center text-[10px] text-slate-400 font-medium">
              🔒 Terhubung dengan Payment Gateway Resmi Expo
            </p>
          </div>
        )}
      </div>
    </>
  );
}
