import React from 'react';
import { ICONS } from '../../utils/elementLibrary';

// 24x24 outline icon from the central element library (stroke follows currentColor)
export default function ElementIcon({ type, size = 20, strokeWidth = 1.8, className = '' }) {
  const parts = ICONS[type] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {parts.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} strokeDasharray={p.dash ? '2.2 2' : undefined} />
      ))}
    </svg>
  );
}
