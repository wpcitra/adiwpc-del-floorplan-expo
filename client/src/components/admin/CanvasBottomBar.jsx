import React, { useState } from 'react';
import { 
  Undo2, 
  Redo2, 
  MousePointer, 
  Hand, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Compass, 
  ChevronDown, 
  Check, 
  Combine,
  Shapes,
  Sparkles,
  FileText,
  Captions,
  CaptionsOff
} from 'lucide-react';
import ShapePalette from './ShapePalette';
import BoothCornerControl from './BoothCornerControl';

export default function CanvasBottomBar({
  zoomLevel = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  isPanMode = false,
  onTogglePanMode,
  snapToGrid = true,
  onToggleSnapToGrid,
  showGrid = true,
  onToggleShowGrid,
  showRuler = true,
  onToggleShowRuler,
  showDimensions = true,
  onToggleShowDimensions,
  showCaptions = true,
  onToggleShowCaptions,
  // Auto-merge booth for this project (undefined = not offered, e.g. Denah Operasional)
  autoMerge = true,
  onToggleAutoMerge,
  // "Sudut Booth" for the whole floorplan and booth-to-booth snapping (Floorplan Studio only; undefined = hidden)
  boothCornerPct = 0,
  onChangeBoothCornerPct,
  snapToBooths = true,
  onToggleSnapToBooths,
  snapToWalls = false,
  onToggleSnapToWalls,
  gridScale = 20,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  isMultiSelection = false,
  isGroupSelection = false,
  onGroupSelected,
  onUngroupSelected,
  onMergeBooths,
  onAddShape,
  onExportPdf
}) {
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isCornerOpen, setIsCornerOpen] = useState(false);
  const [isShapeOpen, setIsShapeOpen] = useState(false);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center gap-2 select-none animate-fadeIn">
      {/* Popover Shape Palette (if toggled open) */}
      {isShapeOpen && (
        <div className="mb-1 animate-fadeIn">
          <ShapePalette
            onAddShape={(shapeId) => {
              onAddShape?.(shapeId);
            }}
          />
        </div>
      )}

      {/* Main Floating Bottom Toolbar */}
      <div className="flex items-center gap-1.5 bg-slate-900/95 text-white p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md">
        {/* 1. Undo / Redo */}
        <div className="flex items-center">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer"
            title="Undo / Urungkan (Ctrl+Z / Cmd+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors cursor-pointer"
            title="Redo / Ulangi (Ctrl+Y / Cmd+Shift+Z)"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <div className="w-px h-5 bg-slate-700/80 mx-0.5" />

        {/* 2. Select (Pointer) vs Pan (Hand) */}
        <div className="flex items-center bg-slate-950/70 rounded-xl p-0.5 border border-slate-800">
          <button
            type="button"
            onClick={() => isPanMode && onTogglePanMode?.()}
            className={`px-2 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              !isPanMode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Select Tool (V) • Tahan Ctrl + Drag untuk Duplikasi Objek"
          >
            <MousePointer size={13} />
            <span className="text-[11px] font-medium hidden sm:inline">Pilih</span>
          </button>
          <button
            type="button"
            onClick={() => !isPanMode && onTogglePanMode?.()}
            className={`px-2 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              isPanMode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Hand / Pan Tool (H / Tahan Spasi + Drag)"
          >
            <Hand size={13} />
            <span className="text-[11px] font-medium hidden sm:inline">Geser</span>
          </button>
        </div>

        <div className="w-px h-5 bg-slate-700/80 mx-0.5" />

        {/* 3. Zoom Controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono text-slate-200 px-1.5 min-w-12 text-center font-semibold">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={onZoomReset}
            className="px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Reset ke 100%"
          >
            100%
          </button>
          <button
            type="button"
            onClick={onZoomFit}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Paskan ke Layar (Fit to Screen)"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="w-px h-5 bg-slate-700/80 mx-0.5" />

        {/* 4. Precision, Grid & Scale Dropdown Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              isViewMenuOpen || snapToGrid || showRuler
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Compass size={14} />
            <span>Grid & Skala</span>
            <ChevronDown size={12} className={`transition-transform ${isViewMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* View Dropdown Menu */}
          {isViewMenuOpen && (
            <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 space-y-1.5 text-xs z-50 animate-fadeIn">
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Alat Bantu Ukur (Precision)
              </div>

              {/* Snap-to-Grid Toggle */}
              <button
                type="button"
                onClick={() => onToggleSnapToGrid?.()}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🧲</span>
                  <div className="text-left">
                    <div className="font-medium">Snap to Grid (Magnet)</div>
                    <div className="text-[10px] text-slate-400">Menempel tiap {gridScale}px (1m)</div>
                  </div>
                </div>
                {snapToGrid && <Check size={14} className="text-emerald-400" />}
              </button>

              {/* Snap booth to booth (edges & corners), separate from Snap to Grid */}
              {onToggleSnapToBooths && (
                <button
                  type="button"
                  onClick={() => onToggleSnapToBooths?.()}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🧩</span>
                    <div className="text-left">
                      <div className="font-medium">Snap ke Booth</div>
                      <div className="text-[10px] text-slate-400">Tempel rapat ke sisi / sudut booth lain (Alt = lepas)</div>
                    </div>
                  </div>
                  {snapToBooths && <Check size={14} className="text-emerald-400" />}
                </button>
              )}
              {onToggleSnapToWalls && (
                <button
                  type="button"
                  onClick={() => onToggleSnapToWalls?.()}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🧱</span>
                    <div className="text-left">
                      <div className="font-medium">Snap ke Dinding &amp; Pilar</div>
                      <div className="text-[10px] text-slate-400">Dinding dan pilar ikut jadi patokan snap booth</div>
                    </div>
                  </div>
                  {snapToWalls && <Check size={14} className="text-emerald-400" />}
                </button>
              )}

              {/* Show/Hide Grid Toggle */}
              <button
                type="button"
                onClick={() => onToggleShowGrid?.()}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📏</span>
                  <div className="text-left">
                    <div className="font-medium">Garis Kisi (Show Grid)</div>
                    <div className="text-[10px] text-slate-400">Tampilkan kisi panduan</div>
                  </div>
                </div>
                {showGrid && <Check size={14} className="text-emerald-400" />}
              </button>

              {/* Show/Hide Rulers */}
              <button
                type="button"
                onClick={() => onToggleShowRuler?.()}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📐</span>
                  <div className="text-left">
                    <div className="font-medium">Penggaris (Rulers)</div>
                    <div className="text-[10px] text-slate-400">Penggaris meter di sisi kanvas</div>
                  </div>
                </div>
                {showRuler && <Check size={14} className="text-emerald-400" />}
              </button>

              {/* Auto-merge booth (project setting, saved with the floorplan) */}
              {onToggleAutoMerge && (
                <button
                  type="button"
                  onClick={() => onToggleAutoMerge?.()}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🔗</span>
                    <div className="text-left">
                      <div className="font-medium">Auto-Merge Booth</div>
                      <div className="text-[10px] text-slate-400">Gabungkan booth bersebelahan 1 exhibitor (project ini)</div>
                    </div>
                  </div>
                  {autoMerge && <Check size={14} className="text-emerald-400" />}
                </button>
              )}

              {/* Dimension Guide */}
              <button
                type="button"
                onClick={() => onToggleShowDimensions?.()}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏷️</span>
                  <div className="text-left">
                    <div className="font-medium">Panduan Dimensi Dinamis</div>
                    <div className="text-[10px] text-slate-400">Meter & koordinat objek aktif</div>
                  </div>
                </div>
                {showDimensions && <Check size={14} className="text-emerald-400" />}
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-slate-700/80 mx-0.5" />

        {/* "Sudut Booth" for the whole floorplan (live preview on the canvas) */}
        {onChangeBoothCornerPct && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCornerOpen(!isCornerOpen)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isCornerOpen ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Sudut Booth: kelengkungan sudut semua booth di denah ini"
            >
              <span className="text-sm leading-none">▢</span>
              <span>Sudut {boothCornerPct}%</span>
            </button>
            {isCornerOpen && (
              <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-72 bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl space-y-2 text-xs z-30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Sudut Booth (Denah Ini)</span>
                  <button type="button" onClick={() => setIsCornerOpen(false)} className="text-slate-400 hover:text-white text-sm leading-none">×</button>
                </div>
                <BoothCornerControl value={boothCornerPct} onChange={onChangeBoothCornerPct} theme="dark" />
                <p className="text-[10px] text-slate-400">Booth dengan nilai khusus (panel kanan) tidak ikut berubah.</p>
              </div>
            )}
          </div>
        )}

        {/* Global caption switch: "Tampilkan Semua Caption" */}
        <button
          type="button"
          onClick={() => onToggleShowCaptions?.()}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            showCaptions ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title={showCaptions ? 'Tampilkan Semua Caption: AKTIF (klik untuk menyembunyikan)' : 'Tampilkan Semua Caption: NONAKTIF (klik untuk menampilkan)'}
          aria-pressed={showCaptions}
        >
          {showCaptions ? <Captions size={14} /> : <CaptionsOff size={14} />}
          <span>Caption</span>
        </button>

        <div className="w-px h-5 bg-slate-700/80 mx-0.5" />

        {/* 5. Shapes Palette Toggle Button (hidden when the page offers no free shapes, e.g. Denah Operasional) */}
        {onAddShape && (
          <button
            type="button"
            onClick={() => setIsShapeOpen(!isShapeOpen)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isShapeOpen 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Buka / Tutup Palet Bentuk & Anotasi"
          >
            <Shapes size={14} />
            <span>Bentuk</span>
          </button>
        )}

        {/* Quick Export to PDF Button */}
        {onExportPdf && (
          <button
            type="button"
            onClick={() => onExportPdf()}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 text-red-300 hover:text-white hover:bg-red-950/80 border border-red-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Simpan & Unduh Denah Lantai ke Dokumen PDF Resmi (A4)"
          >
            <FileText size={13} className="text-red-400" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        )}

        {/* 6. Group / Ungroup & Merge Contextual Actions */}
        {isMultiSelection && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onGroupSelected}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              title="Gabung Blok Booth (Group)"
            >
              <Combine size={13} />
              <span>Group</span>
            </button>
            {onMergeBooths && (
              <button
                type="button"
                onClick={onMergeBooths}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                title="Gabungkan Booth yang Bersebelahan Menjadi 1 Booth Besar (Merge)"
              >
                <Sparkles size={13} />
                <span>Merge Booth</span>
              </button>
            )}
          </div>
        )}

        {isGroupSelection && (
          <button
            type="button"
            onClick={onUngroupSelected}
            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
            title="Pisahkan Blok Booth (Ungroup)"
          >
            <Combine size={13} className="rotate-45" />
            <span>Ungroup</span>
          </button>
        )}
      </div>
    </div>
  );
}
