import React from 'react';
import { Users } from 'lucide-react';

// Initials on a muted tone picked from the user id, so one person keeps one colour everywhere
const TONES = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700'];
const toneOf = (id) => TONES[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function Avatar({ name, id, size = 40, group = false }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (group) {
    return <span style={style} className="shrink-0 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center"><Users size={Math.round(size * 0.45)} /></span>;
  }
  return <span style={style} className={`shrink-0 rounded-full font-bold flex items-center justify-center ${toneOf(id)}`}>{initials(name)}</span>;
}
