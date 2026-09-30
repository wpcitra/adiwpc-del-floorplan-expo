import React, { useState } from 'react';

export default function ShapePalette({ onAddShape, className = '', defaultMinimized = true, isSidebar = false }) {
  const [isMinimized, setIsMinimized] = useState(isSidebar ? false : defaultMinimized);
  const [hoveredShape, setHoveredShape] = useState(null);

  const shapes = [
    // Row 1
    {
      id: 'rect',
      title: 'Kotak (Square / Rectangle)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
        </svg>
      )
    },
    {
      id: 'circle',
      title: 'Lingkaran (Circle / Ellipse)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      )
    },
    {
      id: 'diamond',
      title: 'Belah Ketupat (Diamond / Rhombus)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2.5 21.5 12 12 21.5 2.5 12" />
        </svg>
      )
    },
    {
      id: 'triangle',
      title: 'Segitiga (Triangle)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 3.5 21.5 20.5 2.5 20.5" />
        </svg>
      )
    },

    // Row 2
    {
      id: 'star',
      title: 'Bintang (5-Point Star)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )
    },
    {
      id: 'cross',
      title: 'Palang Medis / Plus (Cross)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 2.5h7v6h6v7h-6v6h-7v-6h-6v-7h6v-6z" />
        </svg>
      )
    },
    {
      id: 'arrow_left',
      title: 'Panah Blok Kiri (Left Arrow)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 5L3 12l6.5 7v-4.5h11.5v-5H9.5V5z" />
        </svg>
      )
    },
    {
      id: 'arrow_right',
      title: 'Panah Blok Kanan (Right Arrow)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 5l6.5 7-6.5 7v-4.5H3v-5h11.5V5z" />
        </svg>
      )
    },

    // Row 3
    {
      id: 'speech_bubble',
      title: 'Balon Kata / Anotasi (Speech Bubble)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14.5 C 20.8 14.5 22 13.2 22 11.2 L 22 7.8 C 22 5.8 20.8 4.5 19 4.5 L 5 4.5 C 3.2 4.5 2 5.8 2 7.8 L 2 11.2 C 2 13.2 3.2 14.5 5 14.5 L 6.8 14.5 L 4.8 18.2 C 4.6 18.6 5 19 5.4 18.7 L 9.8 14.5 L 19 14.5 Z" />
        </svg>
      )
    },
    {
      id: 'line',
      title: 'Garis Lurus Vektor (Line)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      )
    },
    {
      id: 'arrow_line',
      title: 'Garis Panah Vektor (Arrow Line)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4.5" y1="19.5" x2="19.5" y2="4.5" />
          <polyline points="11 4.5 19.5 4.5 19.5 13" />
        </svg>
      )
    }
  ];

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 px-3 py-1.5 rounded-full shadow-lg border border-slate-200/90 text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-105 select-none"
        title="Buka Palet Bentuk & Anotasi"
      >
        <span className="text-blue-600">🔷</span>
        <span>Bentuk ({shapes.length})</span>
      </button>
    );
  }

  return (
    <div className={`relative group/palette bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-3 select-none transition-all duration-200 ${className}`}>
      {/* Subtle minimize / collapse button on top right */}
      <button
        type="button"
        onClick={() => setIsMinimized(true)}
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-500 hover:text-slate-800 text-[10px] flex items-center justify-center opacity-0 group-hover/palette:opacity-100 transition-opacity shadow-xs"
        title="Sembunyikan / Minimalkan"
      >
        ✕
      </button>

      {/* Grid of 4 columns matching the user's screenshot */}
      <div className="grid grid-cols-4 gap-1.5">
        {shapes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onAddShape?.(item.id)}
            onMouseEnter={() => setHoveredShape(item.title)}
            onMouseLeave={() => setHoveredShape(null)}
            draggable
            style={{ WebkitUserDrag: 'element' }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'copy';
              const payload = JSON.stringify({ itemType: 'basic_shape', shapeId: item.id });
              e.dataTransfer.setData('text/plain', payload);
              e.dataTransfer.setData('application/json', payload);
            }}
            className="w-10 h-10 rounded-xl text-slate-800 hover:text-blue-600 hover:bg-slate-100/90 active:scale-95 flex items-center justify-center transition-all duration-150 cursor-pointer"
            title={`${item.title} (Klik atau Drag ke Kanvas)`}
          >
            {item.icon}
          </button>
        ))}
        {/* 12th empty slot in 4x3 grid */}
        <div className="w-10 h-10" />
      </div>

      {/* Subtle Tooltip at bottom on hover */}
      {hoveredShape && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded shadow pointer-events-none transition-opacity">
          {hoveredShape}
        </div>
      )}
    </div>
  );
}
