import React, { useRef, useEffect } from 'react';

export default function CanvasRuler({
  viewportTransform = [1, 0, 0, 1, 0, 0],
  width = 800,
  height = 600,
  mousePos = { x: 0, y: 0 },
  visible = true,
  gridScale = 20, // dynamic pixels per meter
  unit = 'm'
}) {
  const topCanvasRef = useRef(null);
  const leftCanvasRef = useRef(null);

  const RULER_SIZE = 24; // thickness of ruler in pixels

  useEffect(() => {
    if (!visible) return;

    const zoom = viewportTransform[0] || 1;
    const panX = viewportTransform[4] || 0;
    const panY = viewportTransform[5] || 0;

    const rulerW = Math.max(1, width - RULER_SIZE);
    const rulerH = Math.max(1, height - RULER_SIZE);

    // --- Draw Horizontal (Top) Ruler ---
    const topCanvas = topCanvasRef.current;
    if (topCanvas) {
      topCanvas.width = rulerW;
      topCanvas.height = RULER_SIZE;
      const ctx = topCanvas.getContext('2d');
      ctx.clearRect(0, 0, rulerW, RULER_SIZE);

      // Background
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.fillRect(0, 0, rulerW, RULER_SIZE);

      // Bottom border line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, RULER_SIZE - 0.5);
      ctx.lineTo(rulerW, RULER_SIZE - 0.5);
      ctx.stroke();

      const meterPx = gridScale * zoom;
      
      let stepMeters = 1;
      if (meterPx < 8) stepMeters = 5;
      if (meterPx < 4) stepMeters = 10;
      if (meterPx > 60) stepMeters = 1;

      const startMeter = Math.floor((-panX) / (gridScale * zoom)) - 1;
      const endMeter = Math.ceil((width - panX) / (gridScale * zoom)) + 1;

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let m = startMeter; m <= endMeter; m += stepMeters) {
        // Offset by RULER_SIZE because top ruler starts at left: RULER_SIZE
        const canvasX = m * gridScale * zoom + panX;
        const drawX = canvasX - RULER_SIZE;
        if (drawX < -20 || drawX > rulerW + 20) continue;

        const isMajor = m % 5 === 0;
        const tickHeight = isMajor ? 14 : 7;

        ctx.strokeStyle = isMajor ? '#64748b' : '#334155';
        ctx.beginPath();
        ctx.moveTo(Math.round(drawX) + 0.5, RULER_SIZE - tickHeight);
        ctx.lineTo(Math.round(drawX) + 0.5, RULER_SIZE);
        ctx.stroke();

        if (isMajor && drawX >= 10 && drawX <= rulerW - 10) {
          ctx.fillText(`${m}m`, drawX, 3);
        }
      }

      // Cursor position indicator on top ruler
      const cursorDrawX = mousePos.x - RULER_SIZE;
      if (cursorDrawX >= 0 && cursorDrawX <= rulerW) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(Math.round(cursorDrawX) - 1, 0, 2, RULER_SIZE);
      }
    }

    // --- Draw Vertical (Left) Ruler ---
    const leftCanvas = leftCanvasRef.current;
    if (leftCanvas) {
      leftCanvas.width = RULER_SIZE;
      leftCanvas.height = rulerH;
      const ctx = leftCanvas.getContext('2d');
      ctx.clearRect(0, 0, RULER_SIZE, rulerH);

      // Background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, RULER_SIZE, rulerH);

      // Right border line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RULER_SIZE - 0.5, 0);
      ctx.lineTo(RULER_SIZE - 0.5, rulerH);
      ctx.stroke();

      const meterPx = gridScale * zoom;
      let stepMeters = 1;
      if (meterPx < 8) stepMeters = 5;
      if (meterPx < 4) stepMeters = 10;
      if (meterPx > 60) stepMeters = 1;

      const startMeter = Math.floor((-panY) / (gridScale * zoom)) - 1;
      const endMeter = Math.ceil((height - panY) / (gridScale * zoom)) + 1;

      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let m = startMeter; m <= endMeter; m += stepMeters) {
        // Offset by RULER_SIZE because vertical ruler starts at top: RULER_SIZE
        const canvasY = m * gridScale * zoom + panY;
        const drawY = canvasY - RULER_SIZE;
        if (drawY < -20 || drawY > rulerH + 20) continue;

        const isMajor = m % 5 === 0;
        const tickWidth = isMajor ? 14 : 7;

        ctx.strokeStyle = isMajor ? '#64748b' : '#334155';
        ctx.beginPath();
        ctx.moveTo(RULER_SIZE - tickWidth, Math.round(drawY) + 0.5);
        ctx.lineTo(RULER_SIZE, Math.round(drawY) + 0.5);
        ctx.stroke();

        if (isMajor && drawY >= 10 && drawY <= rulerH - 10) {
          ctx.save();
          ctx.translate(10, drawY);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(`${m}m`, 0, 0);
          ctx.restore();
        }
      }

      // Cursor position indicator on left ruler
      const cursorDrawY = mousePos.y - RULER_SIZE;
      if (cursorDrawY >= 0 && cursorDrawY <= rulerH) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(0, Math.round(cursorDrawY) - 1, RULER_SIZE, 2);
      }
    }
  }, [viewportTransform, width, height, mousePos, visible, gridScale, unit]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Top-Left Corner Box with unit badge */}
      <div 
        className="pointer-events-auto absolute top-0 left-0 bg-slate-950 border-r border-b border-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-blue-400 select-none shadow-sm cursor-help"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
        title={`Skala: ${gridScale}px = 1 Meter`}
      >
        m
      </div>

      {/* Horizontal Top Ruler */}
      <div 
        className="absolute top-0 overflow-hidden" 
        style={{ left: RULER_SIZE, width: `calc(100% - ${RULER_SIZE}px)`, height: RULER_SIZE }}
      >
        <canvas ref={topCanvasRef} className="block w-full h-full" />
      </div>

      {/* Vertical Left Ruler */}
      <div 
        className="absolute left-0 overflow-hidden" 
        style={{ top: RULER_SIZE, width: RULER_SIZE, height: `calc(100% - ${RULER_SIZE}px)` }}
      >
        <canvas ref={leftCanvasRef} className="block w-full h-full" />
      </div>
    </div>
  );
}
