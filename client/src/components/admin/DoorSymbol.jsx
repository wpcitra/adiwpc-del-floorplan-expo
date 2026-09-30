import React from 'react';
import { getDoorSvgData } from '../../utils/doorSymbols';

// Inline SVG preview of a door symbol, drawn from the same geometry as the canvas object.
// `currentColor` lets the symbol follow the surrounding text colour (e.g. on selected cards).
export default function DoorSymbol({ doorType, mirrored = false, swing = 'in', className = 'w-full h-10' }) {
  const { viewBox, paths } = getDoorSvgData(doorType, { mirrored, swing });
  return (
    <svg viewBox={viewBox} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={p.strokeWidth}
          strokeDasharray={p.strokeDashArray ? p.strokeDashArray.join(' ') : undefined}
          strokeLinecap={p.strokeLineCap || 'butt'}
          strokeLinejoin={p.strokeLineJoin || 'miter'}
        />
      ))}
    </svg>
  );
}
