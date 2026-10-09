import React, { useState, useEffect } from 'react';
import BoothDiscountFields, { boothDiscountAmount } from './BoothDiscountFields';
import { 
  Tag, 
  DollarSign, 
  Layers, 
  Trash2, 
  Copy, 
  Check, 
  Sliders, 
  Info, 
  Sparkles, 
  Zap, 
  Wifi, 
  Lamp, 
  Combine, 
  Ungroup,
  ArrowUp,
  ArrowDown,
  FileText,
  Square,
  Circle,
  CornerDownRight,
  Maximize,
  Hexagon,
  RotateCw,
  Minus,
  Plus,
  Shapes,
  Edit2,
  X,
  Percent,
  Receipt,
  BadgePercent,
  Save,
  CheckCircle2,
  RefreshCw,
  User,
  Building,
  Phone,
  Mail,
  AlertCircle,
  UserCheck,
  UserPlus,
  Search,
  Unlink,
  ExternalLink
} from 'lucide-react';
import DoorInspector from './DoorInspector';
import ElementInspector from './ElementInspector';
import ShapeStyleSection from './ShapeStyleSection';
import CanvasShortcutsGuide from './CanvasShortcutsGuide';
import CaptionSection from './CaptionSection';
import MergeGroupSection from './MergeGroupSection';
import BoothCornerControl from './BoothCornerControl';
import { isCaptionable } from '../../utils/elementCaptions';
import { isLibraryElement, isShapeElement } from '../../utils/elementLibrary';
import { BOOTH_CATEGORIES, BOOTH_SHAPES, STATUS_CONFIG } from '../../utils/floorplanUtils';
import { api } from '../../services/api';
import { NAME_DIRECTIONS, NAME_DIRECTION_LABELS, nameDirectionOf } from '../../utils/boothNameFit';
import { nextBoothCode, boothCodeTaken, cleanBoothCode } from '../../utils/copyRules';
import { resolveTemplatePrice, studioCatalog } from '../../utils/templatePrice';

export default function PropertyPanel({ 
  selectedObject, 
  selectedObjects = [], 
  currentFloorplanId,
  onUpdateProperty, 
  onBatchUpdate, 
  // Text Box & Bentuk colours (single element or every one in a multi-selection)
  onApplyShapeStyle,
  onDeleteSelected, 
  onDuplicateSelected,
  onGroupSelected,
  onUngroupSelected,
  onMergeBooths,
  onBringForward,
  onSendBackward,
  onOpenInvoiceForBooth,
  onOpenBookingForBooth,
  onDetachTenant,
  onOpenCategoryModal,
  // Operations: the tenant, the booth status and the private discount are read-only
  tenantLocked = false,
  canvasSummary = {},
  canvasObjects = [],
  showCaptions = true,
  // Denah Operasional: extra section at the top of element inspectors & no public toggle for non-admins
  extraTop = null,
  hidePublicToggle = false,
  // Auto-merge group of the selected booth (active or shown separately) and its display switch
  mergeGroup = null,
  autoMergeEnabled = true,
  onToggleMergeDisplay,
  // "Sudut Booth" of the floorplan (per-booth values override it)
  boothCornerPct = 0,
  propertyTick = 0
}) {
  const isMulti = selectedObjects.length > 1;

  // Case 1: Multiple booths selected (Batch mode)
  if (isMulti) {
    const boothCount = selectedObjects.filter(o => o.isBooth).length;

    return (
      <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
        <div className="p-4 border-b border-slate-200 bg-blue-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                {selectedObjects.length}
              </span>
              <h2 className="font-semibold text-slate-800 text-sm">Multi-Selection</h2>
            </div>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
              Batch Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {boothCount > 0
              ? `Mengatur ${boothCount} booth terpilih secara bersamaan`
              : `Mengatur ${selectedObjects.length} elemen terpilih secara bersamaan`}
          </p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Text Box & Bentuk in the selection: one colour setting for all of them */}
          {onApplyShapeStyle && selectedObjects.some(isShapeElement) && (
            <ShapeStyleSection elements={selectedObjects.filter(isShapeElement)} onApply={onApplyShapeStyle} />
          )}

          {/* "Sudut Booth" for every selected booth at once */}
          {boothCount > 0 && (() => {
            const values = [...new Set(selectedObjects.filter(o => o.isBooth).map(o => o.boothData?.cornerPct ?? null))];
            return (
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Sudut Booth ({boothCount} booth)</label>
                <BoothCornerControl
                  value={values.length === 1 ? values[0] : boothCornerPct}
                  mixed={values.length > 1}
                  allowFollow
                  globalPct={boothCornerPct}
                  onChange={(v) => onBatchUpdate({ cornerPct: v })}
                />
              </div>
            );
          })()}

          {/* Grouping Actions */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Pengelompokan (Grouping)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onGroupSelected}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
              >
                <Combine size={14} className="text-blue-600" /> Group Objek
              </button>
              <button
                type="button"
                onClick={onUngroupSelected}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
              >
                <Ungroup size={14} className="text-amber-600" /> Pisahkan (Ungroup)
              </button>
            </div>
            {boothCount >= 2 && (
              <button
                type="button"
                onClick={onMergeBooths}
                className="w-full mt-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-indigo-200"
                title="Gabungkan 2 booth atau lebih menjadi 1 booth besar (harus bersebelahan)"
              >
                <Sparkles size={14} /> Merge Menjadi 1 Booth
              </button>
            )}
          </div>

          {/* Batch Status Change */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Ubah Status Massal
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onBatchUpdate({ status: key })}
                  className="px-2.5 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 hover:opacity-90 transition-all text-left"
                  style={{ backgroundColor: val.bg, borderColor: val.border, color: val.text }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: val.pillBg }} />
                  <span>{val.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Batch Category Change */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Ubah Kategori / Tier Massal
              </label>
              {onOpenCategoryModal && (
                <button
                  type="button"
                  onClick={onOpenCategoryModal}
                  className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                  title="Kelola & Tambah Kategori / Tier Harga"
                >
                  ⚙️ Kelola Tier
                </button>
              )}
            </div>
            <select
              onChange={(e) => {
                if (e.target.value) onBatchUpdate({ category: e.target.value });
              }}
              defaultValue=""
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>Pilih Kategori untuk Semua...</option>
              {Object.keys(BOOTH_CATEGORIES).map((cat) => (
                <option key={cat} value={cat}>
                  {BOOTH_CATEGORIES[cat]?.name || cat} - Rp {BOOTH_CATEGORIES[cat]?.defaultPrice?.toLocaleString('id-ID')}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Terapkan Harga Sewa Massal
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Contoh: 8000000"
                id="batch-price-input"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('batch-price-input');
                  const val = parseInt(el?.value, 10);
                  if (!isNaN(val) && val > 0) {
                    onBatchUpdate({ price: val });
                    el.value = '';
                  }
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Terapkan
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <button
              type="button"
              onClick={onDuplicateSelected}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Copy size={13} /> Duplikasi Semua ({selectedObjects.length})
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} /> Hapus Semua Objek Terpilih
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Case 2: No selection -> Show Canvas Overview & Stats
  if (!selectedObject) {
    return (
      <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-800 text-sm">Floorplan Inspector</h2>
          <p className="text-xs text-slate-500 mt-0.5">Pilih booth atau elemen denah untuk diedit</p>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Summary Box */}
          <div className="bg-slate-900 text-white rounded-xl p-3.5 shadow-sm">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2.5">
              Status Keseluruhan Booth
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60 min-w-0">
                <span className="text-[10px] text-slate-400 block truncate">Total Booth</span>
                <div className="text-lg font-bold text-white mt-0.5">{canvasSummary.totalBooths || 0}</div>
              </div>
              <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60 min-w-0">
                <span className="text-[10px] text-emerald-400 block truncate">Tersedia</span>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">{canvasSummary.available || 0}</div>
              </div>
              <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60 min-w-0">
                <span className="text-[10px] text-amber-400 block truncate">Reserved</span>
                <div className="text-lg font-bold text-amber-400 mt-0.5">{canvasSummary.reserved || 0}</div>
              </div>
              <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60 min-w-0">
                <span className="text-[10px] text-rose-400 block truncate">Terjual</span>
                <div className="text-lg font-bold text-rose-400 mt-0.5">{canvasSummary.sold || 0}</div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-800 flex flex-col gap-0.5 text-xs">
              <span className="text-slate-400 text-[11px]">Estimasi Revenue:</span>
              <span className="font-bold text-emerald-400 text-sm font-mono tracking-tight break-all">
                Rp {(canvasSummary.potentialRevenue || 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Notice Pengaturan Kategori */}
          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
              <Tag size={14} className="text-indigo-600 shrink-0" />
              <span>Pengaturan Kategori</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Penambahan dan edit Kategori Brand & Tier Booth hanya dapat dilakukan di menu <b>Pengaturan & Konfigurasi Sistem</b>.
            </p>
            <a
              href={`/admin/settings?tab=categories${currentFloorplanId ? `&projectId=${currentFloorplanId}` : ''}`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 mt-1 hover:underline cursor-pointer"
            >
              <span>Buka Pengaturan Kategori Project Ini</span> →
            </a>
          </div>

          {/* Quick Guide & Shortcuts */}
          <CanvasShortcutsGuide />
        </div>
      </aside>
    );
  }

  // Case 2.3: New floorplan elements (Struktur, Zona, Tiket & Akses, Utilitas, Signage, Operasional, Teks, Alat Ukur)
  if (isLibraryElement(selectedObject)) {
    return (
      <ElementInspector
        element={selectedObject}
        canvasObjects={canvasObjects}
        captionsEnabled={showCaptions}
        extraTop={extraTop}
        hidePublicToggle={hidePublicToggle}
        onUpdateProperty={onUpdateProperty}
        onApplyShapeStyle={onApplyShapeStyle}
        onBringForward={onBringForward}
        onSendBackward={onSendBackward}
        onDeleteSelected={onDeleteSelected}
        onDuplicateSelected={onDuplicateSelected}
      />
    );
  }

  // Case 2.4: Door symbol selected
  if (selectedObject.venueData?.type === 'door') {
    return (
      <DoorInspector
        door={selectedObject}
        captionsEnabled={showCaptions}
        onUpdateProperty={onUpdateProperty}
        onBringForward={onBringForward}
        onSendBackward={onSendBackward}
        onDeleteSelected={onDeleteSelected}
        onDuplicateSelected={onDuplicateSelected}
        propertyTick={propertyTick}
      />
    );
  }

  // Case 2.5: Custom Group Selected (Group of Booths or Objects). Venue items (stage, walls, doors...) are
  // Fabric groups internally but have their own inspector below and must not be ungrouped into raw shapes.
  if ((selectedObject.type || '').toLowerCase() === 'group' && !selectedObject.isVenueItem && (!selectedObject.isBooth || selectedObject.isCustomGroup)) {
    const subObjects = selectedObject.getObjects ? selectedObject.getObjects() : [];
    const boothSubCount = subObjects.filter(o => o.isBooth || o.boothData).length;

    return (
      <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
        <div className="p-4 border-b border-slate-200 bg-purple-50/60">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
              Grup Objek Tergabung
            </span>
            <span className="text-xs font-semibold text-purple-700">
              {subObjects.length} Objek
            </span>
          </div>
          <h2 className="font-bold text-slate-900 text-base mt-1">Blok Booth Terkelompok</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Grup ini berisi {boothSubCount > 0 ? `${boothSubCount} booth pameran` : `${subObjects.length} elemen`}.
          </p>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Action Pisahkan Group */}
          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
              <Ungroup size={16} className="text-amber-600" />
              <span>Pisahkan Grup Ini (Ungroup)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Bongkar kembali grup ini menjadi booth dan objek individual yang dapat digeser atau diedit secara terpisah.
            </p>
            <button
              type="button"
              onClick={onUngroupSelected}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
            >
              <Ungroup size={15} /> Pisahkan (Ungroup) Sekarang
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/80 space-y-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Combine size={14} className="text-purple-600" /> Rincian Anggota Grup:
            </span>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {subObjects.map((obj, i) => {
                const bCode = obj.boothData?.code || obj.boothData?.booth_number;
                return (
                  <div key={i} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-800">{bCode ? `Booth ${bCode}` : (obj.venueData?.label || `Objek #${i + 1}`)}</span>
                    <span className="text-[10px] text-slate-500">{obj.type || 'Object'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onDeleteSelected}
              className="w-full py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={14} /> Hapus Seluruh Grup
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Case 3: Venue Element Selected (Stage, Restroom, Exit, Pillar, Aisle)
  if (selectedObject.isVenueItem) {
    const venue = selectedObject.venueData || {};
    return (
      <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            Fasilitas Venue
          </span>
          <h2 className="font-semibold text-slate-800 text-base mt-1">{venue.label || 'Elemen Venue'}</h2>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {extraTop}
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-medium">Teks Label Fasilitas</label>
            <input
              type="text"
              value={venue.label || ''}
              onChange={(e) => onUpdateProperty({ label: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {isCaptionable(selectedObject) && (
            <CaptionSection element={selectedObject} onUpdateProperty={onUpdateProperty} captionsEnabled={showCaptions} />
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Lebar (px)</label>
              <input type="text" readOnly value={Math.round(selectedObject.width * selectedObject.scaleX)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Tinggi (px)</label>
              <input type="text" readOnly value={Math.round(selectedObject.height * selectedObject.scaleY)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-600" />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2">
            {onDuplicateSelected && (
              <button
                type="button"
                onClick={onDuplicateSelected}
                title="Duplikasi (salinan persis, 1 m ke kanan bawah)"
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Copy size={13} /> Duplikasi Fasilitas
              </button>
            )}
            <button
              type="button"
              onClick={onDeleteSelected}
              className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} /> Hapus Fasilitas
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Case 3.5: Basic Shape / Annotation Selected
  if (selectedObject.isBasicShape) {
    const shapeNames = {
      rect: 'Kotak (Rectangle / Square)',
      circle: 'Lingkaran (Circle)',
      diamond: 'Belah Ketupat (Diamond)',
      triangle: 'Segitiga (Triangle)',
      star: 'Bintang (5-Point Star)',
      cross: 'Palang Medis (Cross)',
      arrow_left: 'Panah Kiri (Left Arrow)',
      arrow_right: 'Panah Kanan (Right Arrow)',
      speech_bubble: 'Balon Kata (Speech Bubble)',
      line: 'Garis Vektor (Line)',
      arrow_line: 'Garis Berpanah (Arrow Line)'
    };
    const shapeLabel = shapeNames[selectedObject.shapeType] || 'Bentuk Geometris';
    const currentFill = selectedObject.fill || '#ffffff';
    const currentStroke = selectedObject.stroke || '#0f172a';
    const currentStrokeWidth = selectedObject.strokeWidth || 2;
    const currentOpacity = Math.round((selectedObject.opacity ?? 1) * 100);

    const presetColors = [
      '#ffffff', '#f8fafc', '#f1f5f9', '#cbd5e1', '#64748b', '#0f172a',
      '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];

    return (
      <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
              Bentuk & Anotasi
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
                title="Duplikasi (Clone)"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Hapus Bentuk"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <h2 className="font-semibold text-slate-800 text-base mt-2">{shapeLabel}</h2>
        </div>

        <div className="p-4 space-y-5 flex-1 text-xs">
          {/* Warna Isi (Fill) */}
          {selectedObject.shapeType !== 'line' && selectedObject.shapeType !== 'arrow_line' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                  Warna Isi (Fill)
                </label>
                <input
                  type="color"
                  value={currentFill.startsWith('#') ? currentFill : '#ffffff'}
                  onChange={(e) => onUpdateProperty({ fill: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                  title="Pilih warna kustom"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onUpdateProperty({ fill: color })}
                    className={`w-6 h-6 rounded-md border transition-all ${
                      currentFill === color ? 'ring-2 ring-blue-500 scale-110 shadow-xs' : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Warna Garis Tepi (Stroke) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Warna Garis (Stroke)
              </label>
              <input
                type="color"
                value={currentStroke.startsWith('#') ? currentStroke : '#0f172a'}
                onChange={(e) => onUpdateProperty({ stroke: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                title="Pilih warna garis kustom"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onUpdateProperty({ stroke: color })}
                  className={`w-6 h-6 rounded-md border transition-all ${
                    currentStroke === color ? 'ring-2 ring-blue-500 scale-110 shadow-xs' : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Ketebalan Garis (Stroke Width) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Ketebalan Garis
              </label>
              <span className="font-mono font-bold text-slate-600">{currentStrokeWidth}px</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 5].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onUpdateProperty({ strokeWidth: w })}
                  className={`py-1.5 rounded-lg border font-medium text-xs transition-all ${
                    currentStrokeWidth === w ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          {/* Transparansi (Opacity) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Transparansi / Opacity
              </label>
              <span className="font-mono font-bold text-slate-600">{currentOpacity}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={currentOpacity}
              onChange={(e) => onUpdateProperty({ opacity: parseInt(e.target.value, 10) / 100 })}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Layer order actions */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onBringForward}
              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowUp size={13} /> Ke Depan
            </button>
            <button
              type="button"
              onClick={onSendBackward}
              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowDown size={13} /> Ke Belakang
            </button>
          </div>

          {/* Delete Action */}
          <button
            type="button"
            onClick={onDeleteSelected}
            className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Trash2 size={13} /> Hapus Bentuk Ini
          </button>
        </div>
      </aside>
    );
  }

  // Case 4: Single Booth Selected (Full Inspector with buffered local states)
  return (
    <BoothInspector
      booth={selectedObject.boothData || {}}
      otherBoothCodes={canvasObjects.filter(o => o.isBooth && o !== selectedObject).map(o => o.boothData?.code).filter(Boolean)}
      currentFloorplanId={currentFloorplanId}
      onUpdateProperty={onUpdateProperty}
      onBringForward={onBringForward}
      onSendBackward={onSendBackward}
      onDeleteSelected={onDeleteSelected}
      onDuplicateSelected={onDuplicateSelected}
      onOpenInvoiceForBooth={onOpenInvoiceForBooth}
      onOpenBookingForBooth={onOpenBookingForBooth}
      onDetachTenant={onDetachTenant}
      onOpenCategoryModal={onOpenCategoryModal}
      propertyTick={propertyTick}
      tenantLocked={tenantLocked}
      mergeSection={mergeGroup ? <MergeGroupSection group={mergeGroup} autoMergeEnabled={autoMergeEnabled} onToggle={onToggleMergeDisplay} /> : null}
      cornerSection={(
        <div>
          <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">Sudut Booth</label>
          <BoothCornerControl
            value={selectedObject.boothData?.cornerPct ?? null}
            allowFollow
            globalPct={boothCornerPct}
            onChange={(v) => onUpdateProperty({ cornerPct: v })}
          />
          {/* Arah Nama Tenant: the font size is always automatic; a merged booth shares the setting */}
          <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mt-3 mb-1.5">Arah Nama Tenant</label>
          <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            {NAME_DIRECTIONS.map(dir => (
              <button
                key={dir}
                type="button"
                onClick={() => onUpdateProperty({ nameDirection: dir })}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${nameDirectionOf(selectedObject.boothData) === dir ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-white'}`}
              >
                {NAME_DIRECTION_LABELS[dir]}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Otomatis memilih arah yang membuat nama paling besar. Ukuran huruf selalu dihitung otomatis.
            {mergeGroup ? ' Berlaku untuk seluruh booth gabungan.' : ''}
          </p>
        </div>
      )}
    />
  );
}

// Subcomponent: BrandCategoryManager for Floorplan Studio Right Sidebar
function BrandCategoryManager() {
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadCategories = async () => {
    try {
      const cats = await api.fetchBrandCategories(false);
      if (Array.isArray(cats)) {
        setCategories(cats);
      }
    } catch (e) {
      console.warn("Failed to load brand categories:", e);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsLoading(true);
    const res = await api.createBrandCategory({ name: newCatName.trim(), isActive: true });
    setIsLoading(false);
    if (res.success) {
      setNewCatName('');
      loadCategories();
    } else {
      alert(res.error || 'Gagal menambahkan kategori brand');
    }
  };

  const handleToggleActive = async (cat) => {
    const nextState = !cat.isActive;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isActive: nextState } : c));
    const res = await api.updateBrandCategory(cat.id, { isActive: nextState });
    if (!res.success) {
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isActive: !nextState } : c));
      alert(res.error || 'Gagal mengubah status kategori');
    }
  };

  const handleSaveRename = async (id) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const res = await api.updateBrandCategory(id, { name: editName.trim() });
    if (res.success) {
      setEditingId(null);
      loadCategories();
    } else {
      alert(res.error || 'Gagal mengubah nama kategori');
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Hapus kategori brand "${cat.name}"?`)) return;
    const res = await api.deleteBrandCategory(cat.id);
    if (res.success) {
      loadCategories();
    } else {
      alert(res.error || 'Gagal menghapus kategori');
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-3 text-xs shadow-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
          <Tag size={14} className="text-indigo-600 shrink-0" /> Fitur Kategori Brand
        </span>
        <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
          {categories.filter(c => c.isActive).length} Aktif / {categories.length} Total
        </span>
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        Kelola pilihan kategori brand (misal Fashion, Kuliner, Travel, Education) yang tampil saat pengguna mengisi formulir pendaftaran.
      </p>

      <form onSubmit={handleAddCategory} className="flex gap-1.5">
        <input
          type="text"
          placeholder="Tambah Kategori Brand Baru..."
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={isLoading || !newCatName.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer"
        >
          <Plus size={13} /> Tambah
        </button>
      </form>

      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-all ${
              cat.isActive
                ? 'bg-slate-50/80 border-slate-200'
                : 'bg-slate-100/60 border-slate-200 opacity-60'
            }`}
          >
            {editingId === cat.id ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-2 py-1 bg-white border border-indigo-300 rounded text-xs text-slate-900 font-semibold focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveRename(cat.id)}
                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                  title="Simpan"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                  title="Batal"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cat.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span className="font-semibold text-slate-800 text-xs truncate" title={cat.name}>
                    {cat.name}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Status Toggle Switch / Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      cat.isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                    }`}
                    title={cat.isActive ? 'Non-aktifkan kategori' : 'Aktifkan kategori'}
                  >
                    {cat.isActive ? 'Aktif' : 'Non-Aktif'}
                  </button>

                  {/* Edit Name */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    title="Edit nama kategori"
                  >
                    <Edit2 size={12} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(cat)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title="Hapus kategori"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Subcomponent: BoothInspector with responsive local states
function BoothInspector({
  booth,
  // Numbers of the other booths of this floorplan: a booth number is unique (AGENTS.md §30)
  otherBoothCodes = [],
  currentFloorplanId,
  onUpdateProperty,
  onBringForward,
  onSendBackward,
  onDeleteSelected,
  onDuplicateSelected,
  onOpenInvoiceForBooth,
  onOpenBookingForBooth,
  onDetachTenant,
  onOpenCategoryModal,
  propertyTick = 0,
  tenantLocked = false,
  mergeSection = null,
  cornerSection = null
}) {
  const [code, setCode] = useState(booth.code || '');
  // A number another booth already has stays in the field with a warning and is not applied to the booth
  const codeTaken = boothCodeTaken(code, otherBoothCodes);
  // Harga mengikuti template (AGENTS.md §32): the template of this booth's size, and whether the booth follows it
  const templateInfo = resolveTemplatePrice(booth, studioCatalog());
  const isCustomPrice = booth.priceMode !== 'template';
  const [shape, setShape] = useState(booth.shape || 'rectangle');
  const [widthM, setWidthM] = useState(String(booth.widthM || 3));
  const [heightM, setHeightM] = useState(String(booth.heightM || 3));
  const [price, setPrice] = useState(String(booth.price || 0));
  const [ownerName, setOwnerName] = useState(booth.ownerName || '');
  const [brandCategory, setBrandCategory] = useState(booth.brandCategory || '');
  const [discountType, setDiscountType] = useState(booth.discountType || booth.discount_type || 'nominal');
  const [discountValue, setDiscountValue] = useState(String(booth.discountValue !== undefined ? booth.discountValue : (booth.discount_value !== undefined ? booth.discount_value : (booth.discountAmount || booth.discount_amount || 0))));
  const [discountReason, setDiscountReason] = useState(booth.discountReason || booth.discount_reason || '');
  const [availableBrandCats, setAvailableBrandCats] = useState([]);

  // Tenant biodata state
  const picName = booth.picName || '';
  const email = booth.email || '';
  const phone = booth.phone || '';
  const registrationSource = booth.registrationSource || 'online';
  const registeredBy = booth.registeredBy || '';

  const hasOwner = Boolean(ownerName && ownerName.trim());
  const isTenantComplete = Boolean(
    hasOwner && 
    picName.trim() && 
    phone.trim() && 
    (brandCategory || booth.brandCategory)
  );
  const isLegacyIncomplete = hasOwner && !isTenantComplete;

  const [isSelectClientModalOpen, setIsSelectClientModalOpen] = useState(false);
  const [isDetachConfirmOpen, setIsDetachConfirmOpen] = useState(false);
  const [statusValidationError, setStatusValidationError] = useState(null);
  // { message, confirmStatus? }: why a status was not applied, or the payment confirmation of a booth with invoices
  const [statusNotice, setStatusNotice] = useState(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [discountValidationError, setDiscountValidationError] = useState(null);

  useEffect(() => {
    async function loadBrandCats() {
      try {
        const targetProjectId = booth.floorplan_id || booth.floorplanId || currentFloorplanId;
        const cats = await api.fetchBrandCategories(false, targetProjectId);
        if (cats && Array.isArray(cats)) {
          setAvailableBrandCats(cats);
        }
      } catch (e) {}
    }
    loadBrandCats();
  }, [booth.floorplan_id, booth.floorplanId, currentFloorplanId]);

  useEffect(() => {
    setCode(booth.code || '');
    setShape(booth.shape || 'rectangle');
    setWidthM(String(booth.widthM || 3));
    setHeightM(String(booth.heightM || 3));
    setPrice(String(booth.price || 0));
    setOwnerName(booth.ownerName || '');
    setBrandCategory(booth.brandCategory || '');
    setDiscountType(booth.discountType || booth.discount_type || 'nominal');
    setDiscountValue(String(booth.discountValue !== undefined ? booth.discountValue : (booth.discount_value !== undefined ? booth.discount_value : (booth.discountAmount || booth.discount_amount || 0))));
    setDiscountReason(booth.discountReason || booth.discount_reason || '');
  }, [
    booth.id, 
    booth.code, 
    booth.shape, 
    booth.widthM, 
    booth.heightM, 
    booth.price, 
    booth.category, 
    booth.status, 
    booth.ownerName, 
    booth.brandCategory, 
    booth.discountType, 
    booth.discount_type, 
    booth.discountValue, 
    booth.discount_value, 
    booth.discountAmount, 
    booth.discount_amount, 
    booth.discountReason, 
    booth.discount_reason, 
    propertyTick
  ]);

  useEffect(() => { setStatusNotice(null); }, [booth.id, booth.code]);

  const statusCfg = STATUS_CONFIG[booth.status] || STATUS_CONFIG.available;
  const currentArea = ((parseFloat(widthM) || 3) * (parseFloat(heightM) || 3)).toFixed(1);

  const numPrice = parseInt(price, 10) || 0;
  const templateDiff = templateInfo.status === 'match' ? numPrice - templateInfo.price : 0;
  const numDiscVal = parseFloat(discountValue) || 0;
  const calculatedDiscountAmount = boothDiscountAmount(numPrice, discountType, discountValue);
  const netFinalPrice = Math.max(0, numPrice - calculatedDiscountAmount);
  const hasDiscount = calculatedDiscountAmount > 0;

  const handleDiscountChange = (newType, newVal, newReason) => {
    const t = newType !== undefined ? newType : discountType;
    const v = newVal !== undefined ? newVal : discountValue;
    const r = newReason !== undefined ? newReason : discountReason;

    const p = parseInt(price, 10) || 0;
    const nVal = parseFloat(v) || 0;
    let discAmt = 0;
    if (t === 'percentage') {
      discAmt = Math.round((p * Math.min(100, Math.max(0, nVal))) / 100);
    } else {
      discAmt = Math.min(p, Math.max(0, Math.round(nVal)));
    }

    setDiscountType(t);
    setDiscountValue(String(v));
    setDiscountReason(r);

    onUpdateProperty({
      discountType: t,
      discountValue: nVal,
      discountAmount: discAmt,
      discountReason: r.trim()
    });
  };

  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  const [saveDiscountStatus, setSaveDiscountStatus] = useState(null); // 'success' | 'error' | null

  const handleStatusChange = async (newStatus, extra = {}) => {
    if (tenantLocked) return; // the booth status follows the tenant / payment: not changed by Operations
    setStatusValidationError(null);
    setStatusNotice(null);
    if (newStatus === booth.status) return;
    // A booked booth: Available = "Lepas Tenant" (cancels the booking / invoice), Maintenance only once it is empty
    const booked = (booth.status === 'reserved' || booth.status === 'sold') && Boolean(booth.ownerName?.trim());
    if (booked && newStatus === 'available') {
      setIsDetachConfirmOpen(true);
      return;
    }
    if (booked && newStatus === 'maintenance') {
      setStatusNotice({ message: `Booth ini masih punya tenant (${booth.ownerName}). Lepas tenant dulu sebelum menjadikannya Maintenance.` });
      return;
    }
    if (newStatus === 'reserved' || newStatus === 'sold') {
      if (!isTenantComplete) {
        const missing = [];
        if (!ownerName?.trim()) missing.push('Nama Brand / Perusahaan');
        if (!picName?.trim()) missing.push('Nama Lengkap (PIC)');
        if (!brandCategory?.trim() && !booth.brandCategory?.trim()) missing.push('Kategori Brand');
        if (!phone?.trim() || phone.trim().length < 9) missing.push('Nomor WhatsApp (min 9 digit)');

        setStatusValidationError({
          targetStatus: newStatus,
          missingFields: missing
        });
        return;
      }
    }

    // Reserved / Sold of a tenant: the booking / invoice contract decides the status on every save, so the server
    // changes it there (Sold = paid, Reserved = not paid). Only changing the canvas came back after a refresh.
    if (booth.ownerName?.trim()) {
      setIsSavingStatus(true);
      const r = await api.setBoothStatus(booth.floorplan_id || booth.floorplanId || currentFloorplanId, code || booth.code, newStatus, extra);
      setIsSavingStatus(false);
      if (r.code === 'CONFIRM_PAYMENT') {
        setStatusNotice({ message: r.error, confirmStatus: newStatus });
        return;
      }
      if (r.code !== 'BOOTH_NOT_SAVED') { // a booth not saved yet has no booking: the canvas is all there is
        if (!r.success) {
          setStatusNotice({ message: r.error });
          return;
        }
        onUpdateProperty({ status: r.booth.status });
        return;
      }
    }

    onUpdateProperty({ status: newStatus });
  };

  const handleSelectClient = (client) => {
    setIsSelectClientModalOpen(false);
    setStatusValidationError(null);
    setDiscountValidationError(null);

    const clientBrand = client.company || client.brandName || '';
    const clientPic = client.pic || client.fullName || '';
    const clientEmail = client.email || '';
    const clientPhone = client.phone || client.contact || '';
    const clientCategory = client.brandCategory || brandCategory || '';

    setOwnerName(clientBrand);
    setBrandCategory(clientCategory);

    const targetStatus = booth.status === 'available' ? 'reserved' : booth.status;

    // Update active property on canvas immediately
    onUpdateProperty({
      ownerName: clientBrand,
      picName: clientPic,
      email: clientEmail,
      phone: clientPhone,
      brandCategory: clientCategory,
      registrationSource: client.registrationSource || 'admin',
      registeredBy: 'Admin',
      status: targetStatus
    });

    // Also trigger instant backend order checkout to link invoice & exhibitor
    api.checkoutOrder({
      floorplanId: booth.floorplan_id || booth.floorplanId || currentFloorplanId || 'FP-2026-001',
      boothId: booth.id,
      boothCode: code || booth.code,
      fullName: clientPic,
      brandName: clientBrand,
      brandCategory: clientCategory,
      email: clientEmail,
      phone: clientPhone,
      totalAmount: netFinalPrice || parseInt(price, 10) || 5000000,
      paidAmount: targetStatus === 'sold' ? (netFinalPrice || parseInt(price, 10)) : 0,
      remainingAmount: targetStatus === 'sold' ? 0 : (netFinalPrice || parseInt(price, 10)),
      paymentType: 'full',
      downPaymentPercent: 0,
      bookingType: targetStatus === 'sold' ? 'payment_gateway' : 'booking',
      paymentMethod: targetStatus === 'sold' ? 'Pendaftaran Langsung Admin (Lunas)' : 'Booking Admin (Draft Tagihan)',
      invoiceNumber: `INV/EXP-${Date.now().toString().slice(-6)}`,
      source: 'admin',
      adminName: 'Admin'
    }).catch(err => console.warn("Error auto-checkout assigned client:", err));
  };

  const handleExecuteDetach = async () => {
    setIsDetachConfirmOpen(false);
    setStatusValidationError(null);
    setDiscountValidationError(null);
    if (onDetachTenant) {
      onDetachTenant(booth);
    } else {
      try {
        await api.detachTenantFromBooth({
          floorplanId: booth.floorplan_id || booth.floorplanId || currentFloorplanId || 'FP-2026-001',
          boothId: booth.id,
          boothCode: code || booth.code,
          adminName: 'Admin'
        });
        setOwnerName('');
        onUpdateProperty({
          ownerName: '',
          picName: '',
          email: '',
          phone: '',
          status: 'available',
          registrationSource: null,
          registeredBy: null
        });
      } catch (e) {
        console.error("Detach error:", e);
      }
    }
  };

  const handleSaveDiscount = async () => {
    if (tenantLocked) return; // the private discount is set by Finance / Super Admin
    setDiscountValidationError(null);
    if (!isTenantComplete) {
      setDiscountValidationError('Save Diskon terintegrasi hanya dapat dilakukan jika booth memiliki tenant dengan biodata lengkap.');
      return;
    }

    setIsSavingDiscount(true);
    setSaveDiscountStatus(null);
    try {
      const p = parseInt(price, 10) || 0;
      const nVal = parseFloat(discountValue) || 0;
      let discAmt = 0;
      if (discountType === 'percentage') {
        discAmt = Math.round((p * Math.min(100, Math.max(0, nVal))) / 100);
      } else {
        discAmt = Math.min(p, Math.max(0, Math.round(nVal)));
      }

      // 1. Update active property on canvas immediately
      onUpdateProperty({
        discountType,
        discountValue: nVal,
        discountAmount: discAmt,
        discountReason: discountReason.trim()
      });

      // 2. Direct instant sync to database & invoices table
      const res = await api.syncBoothDiscount({
        floorplanId: booth.floorplan_id || booth.floorplanId || currentFloorplanId || 'FP-2026-001',
        boothCode: code || booth.code,
        boothId: booth.id,
        price: p,
        discountType,
        discountValue: nVal,
        discountAmount: discAmt,
        discountReason: discountReason.trim()
      });

      if (res && res.success) {
        setSaveDiscountStatus('success');
        setTimeout(() => setSaveDiscountStatus(null), 3500);
      } else {
        setSaveDiscountStatus('error');
        setTimeout(() => setSaveDiscountStatus(null), 3500);
      }
    } catch (err) {
      console.error("Error saving discount:", err);
      setSaveDiscountStatus('error');
      setTimeout(() => setSaveDiscountStatus(null), 3500);
    } finally {
      setIsSavingDiscount(false);
    }
  };

  return (
    <aside className="w-80 lg:w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm z-10 select-none overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            Property Inspector
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicateSelected}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
              title="Duplikasi (Clone)"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Hapus Booth"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Booth {booth.code || 'N/A'}
          </h2>
          <div
            className="text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
            style={{ backgroundColor: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}` }}
          >
            {statusCfg.label}
          </div>
        </div>
      </div>

      {/* Form sections */}
      <div className="p-4 space-y-5 flex-1 text-xs">
        {mergeSection}
        {/* Booth Code & Auto Generate */}
        <div>
          <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
            Nomor / Kode Booth
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                const val = e.target.value;
                setCode(val);
                if (!boothCodeTaken(val, otherBoothCodes)) onUpdateProperty({ code: val });
              }}
              onBlur={() => {
                if (codeTaken) { setCode(booth.code || ''); return; }
                // Stored without outer / repeated spaces (AGENTS.md §40)
                const clean = cleanBoothCode(code);
                if (clean && clean !== code) { setCode(clean); onUpdateProperty({ code: clean }); }
              }}
              aria-invalid={codeTaken}
              className={`flex-1 px-3 py-1.5 bg-slate-50 border rounded-lg font-bold text-slate-800 text-sm focus:outline-none focus:ring-1 ${codeTaken ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-200 focus:ring-blue-500'}`}
            />
            <button
              type="button"
              onClick={() => {
                const currentCode = code || booth.code || 'A-01';
                const match = currentCode.match(/([A-Za-z]+)[-_]?(\d+)/i);
                if (match) {
                  const prefix = match[1];
                  const num = parseInt(match[2], 10);
                  // the next number no other booth uses
                  const nextCode = nextBoothCode(`${prefix}-${String(num).padStart(2, '0')}`, otherBoothCodes.flatMap(c => String(c).split('+')));
                  setCode(nextCode);
                  onUpdateProperty({ code: nextCode });
                }
              }}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-[10px] font-medium transition-colors"
              title="Buat kode berikutnya"
            >
              +Next
            </button>
          </div>
          {codeTaken && (
            <p className="mt-1.5 text-[11px] font-medium text-rose-600">
              Nomor {code.trim()} sudah dipakai booth lain. Booth ini tetap bernomor {booth.code || '-'}.
            </p>
          )}
        </div>

        {/* BAGIAN B: Pemilik / Tenant Booth */}
        <div className="bg-slate-50/90 rounded-2xl border border-slate-200/90 p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Building size={13} className="text-indigo-600" />
              Pemilik / Tenant Booth
            </label>
            {hasOwner && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isTenantComplete
                  ? (registrationSource === 'admin' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {isTenantComplete
                  ? (registrationSource === 'admin' ? 'Didaftarkan Admin' : 'Online')
                  : 'Biodata Belum Lengkap'}
              </span>
            )}
          </div>

          {/* Operations: tenant shown read-only, registration is done by Sales */}
          {tenantLocked ? (
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5 shadow-2xs text-xs">
              <div className="font-extrabold text-slate-900 text-sm truncate" title={ownerName}>{hasOwner ? ownerName : 'Belum ada tenant'}</div>
              {(brandCategory || booth.brandCategory) && hasOwner && <div className="text-[11px] text-slate-600">{brandCategory || booth.brandCategory}</div>}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pendaftaran dan perubahan tenant / brand dilakukan oleh tim Sales. Role Operasional hanya dapat melihatnya.
              </p>
            </div>
          ) : isTenantComplete ? (
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5 shadow-2xs">
              <div>
                <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
                  <span className="truncate" title={ownerName}>{ownerName}</span>
                </div>
                {(brandCategory || booth.brandCategory) && (
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 bg-violet-50 text-violet-700 rounded-md border border-violet-200">
                    <Tag size={10} className="inline mr-1" />
                    {brandCategory || booth.brandCategory}
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                <div className="flex items-center gap-1.5 truncate">
                  <User size={12} className="text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-800">{picName}</span>
                  <span className="text-[10px] text-slate-400">(PIC)</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Phone size={12} className="text-slate-400 shrink-0" />
                  <span className="font-mono text-[11px]">{phone}</span>
                </div>
                {email.trim() && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail size={12} className="text-slate-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 truncate" title={email}>{email}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenBookingForBooth?.(booth, {
                    isAdmin: true,
                    mode: 'edit',
                    initialData: {
                      fullName: picName,
                      brandName: ownerName,
                      brandCategory: brandCategory || booth.brandCategory,
                      email,
                      phone
                    }
                  })}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-lg border border-indigo-200 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Lihat & Edit Biodata Tenant"
                >
                  <Edit2 size={12} />
                  <span>Lihat / Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDetachConfirmOpen(true)}
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg border border-rose-200 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Lepas Tenant dari Booth Ini"
                >
                  <Unlink size={12} />
                  <span>Lepas Tenant</span>
                </button>
              </div>
            </div>
          ) : isLegacyIncomplete ? (
            /* Subcase 2: Legacy Booth (Teks Bebas / Biodata Belum Lengkap) */
            <div className="bg-amber-50/80 rounded-xl border border-amber-200 p-3 space-y-2.5 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900">Nama Teks Bebas: "{ownerName}"</div>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                    Booth ini memiliki nama pemilik teks bebas dari data lama. Lengkapi biodata agar otomatis tercatat di Data Exhibitor & Invoicing.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenBookingForBooth?.(booth, {
                    isAdmin: true,
                    mode: 'register',
                    initialData: {
                      brandName: ownerName,
                      brandCategory: brandCategory || booth.brandCategory
                    }
                  })}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Lengkapi Biodata Sekarang</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDetachConfirmOpen(true)}
                  className="w-full py-1.5 px-3 bg-white hover:bg-amber-100 text-amber-800 font-medium text-[11px] rounded-lg border border-amber-300 text-center cursor-pointer transition-colors"
                >
                  Hapus / Lepas Nama Ini
                </button>
              </div>
            </div>
          ) : (
            /* Subcase 3: No Tenant Assigned Yet */
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 leading-snug">
                Pilih exhibitor yang sudah terdaftar di database, atau daftarkan client baru menggunakan formulir resmi.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setIsSelectClientModalOpen(true)}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <UserCheck size={14} className="text-blue-600" />
                  <span>Pilih Tenant Terdaftar</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenBookingForBooth?.(booth, { isAdmin: true, mode: 'register' })}
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>+ Daftarkan Client Baru</span>
                </button>
              </div>
            </div>
          )}
        </div>

          {/* Quick Rotation Buttons */}
          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
            <span className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1">
              <RotateCw size={11} className="text-blue-600" /> Rotasi Sudut:
            </span>
            <div className="flex gap-1">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => onUpdateProperty({ angle: deg })}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
                  title={`Putar denah booth ${deg}°`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>

        {cornerSection}

        {/* Price Sewa (Disesuaikan dengan Template) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Harga Sewa
            </label>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold whitespace-nowrap ${isCustomPrice ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                {isCustomPrice ? 'Harga Khusus' : 'Ikut Template'}
              </span>
              {templateInfo.status === 'match' && (isCustomPrice || templateInfo.price !== (parseInt(price, 10) || 0)) && (
                <button
                  type="button"
                  onClick={() => {
                    setPrice(String(templateInfo.price));
                    onUpdateProperty({ price: templateInfo.price, priceMode: 'template' });
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer whitespace-nowrap"
                  title={`Kembali mengikuti harga template ukuran ${templateInfo.label}`}
                >
                  Reset ke Template
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-400 font-medium">Rp</span>
            <input
              type="number"
              value={price}
              onChange={(e) => {
                const val = e.target.value;
                setPrice(val);
                const p = parseInt(val, 10);
                if (!isNaN(p) && p >= 0) {
                  onUpdateProperty({ price: p });
                }
              }}
              onBlur={() => {
                const p = parseInt(price, 10);
                if (isNaN(p) || p < 0) {
                  setPrice(String(booth.price || 0));
                  onUpdateProperty({ price: booth.price || 0 });
                }
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex flex-col gap-0.5">
            <div className="flex justify-between items-center">
              <span>Terbaca:</span>
              <b className="font-mono text-slate-700">Rp {(parseInt(price, 10) || 0).toLocaleString('id-ID')}</b>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 gap-2">
              <span>Template {templateInfo.label}:</span>
              <span className="text-right">
                {templateInfo.status === 'match' && `Rp ${templateInfo.price.toLocaleString('id-ID')}`}
                {templateInfo.status === 'none' && 'tidak ada template ukuran ini'}
                {templateInfo.status === 'conflict' && `konflik: ${templateInfo.templates.map(t => `${t.name} Rp ${t.price.toLocaleString('id-ID')}`).join(' / ')}`}
              </span>
            </div>
            {templateInfo.status === 'match' && templateDiff !== 0 && (
              <div className={`flex justify-between items-center text-[10px] font-semibold ${templateDiff > 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                <span>Selisih dari template:</span>
                <span>{templateDiff > 0 ? '+' : '−'}Rp {Math.abs(templateDiff).toLocaleString('id-ID')}</span>
              </div>
            )}
            {booth.priceLocked && (
              <div className="text-[10px] text-slate-500">Booth ini sudah punya invoice: harganya tidak ikut berubah saat template diubah.</div>
            )}
          </div>
        </div>

        {/* Section: Diskon & Potongan Tagihan (Terintegrasi Invoice) */}
        <BoothDiscountFields
          price={numPrice}
          discountType={discountType}
          discountValue={discountValue}
          discountReason={discountReason}
          onChange={handleDiscountChange}
        >
            {/* Direct Save Discount & Sync to Invoice Button */}
            <div className="pt-1.5 space-y-1.5">
              <button
                type="button"
                onClick={handleSaveDiscount}
                disabled={isSavingDiscount || tenantLocked}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                  saveDiscountStatus === 'success'
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
                    : saveDiscountStatus === 'error'
                    ? 'bg-rose-600 text-white shadow-rose-600/30'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/25 border border-emerald-500/40'
                } ${isSavingDiscount ? 'opacity-70 cursor-wait' : ''}`}
                title="Simpan diskon booth ini dan sinkronkan langsung ke invoice resmi"
              >
                {isSavingDiscount ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Menyimpan & Sinkron Invoice...</span>
                  </>
                ) : saveDiscountStatus === 'success' ? (
                  <>
                    <CheckCircle2 size={14} className="text-white" />
                    <span>✅ Diskon Tersimpan & Terintegrasi ke Invoice!</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Diskon (Terintegrasi Invoice)</span>
                  </>
                )}
              </button>

              {discountValidationError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-semibold flex items-start gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{discountValidationError}</span>
                </div>
              )}

              {saveDiscountStatus === 'success' && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 font-semibold flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span>Diskon Booth #{code || booth.code} tersimpan & invoice terupdate!</span>
                </div>
              )}
            </div>
        </BoothDiscountFields>

        {/* Status Pills */}
        <div>
          <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
            Status Ketersediaan
          </label>

          {/* Validation Warning Alert */}
          {statusValidationError && (
            <div className="mb-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-800">
                    Tidak Dapat Mengubah Status ke "{statusValidationError.targetStatus.toUpperCase()}"
                  </div>
                  <p className="text-[11px] text-rose-700 leading-snug">
                    Status Reserved / Sold wajib memiliki tenant dengan biodata lengkap. Field berikut belum diisi:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-rose-800 font-semibold space-y-0.5">
                    {statusValidationError.missingFields.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusValidationError(null);
                      if (hasOwner) {
                        onOpenBookingForBooth?.(booth, {
                          isAdmin: true,
                          mode: 'register',
                          initialData: { brandName: ownerName, brandCategory: brandCategory || booth.brandCategory }
                        });
                      } else {
                        onOpenBookingForBooth?.(booth, { isAdmin: true, mode: 'register' });
                      }
                    }}
                    className="mt-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <UserPlus size={12} />
                    <span>Lengkapi Biodata Tenant</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {statusNotice && (
            <div role="alert" className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-snug animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p>{statusNotice.message}</p>
                  {statusNotice.confirmStatus && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(statusNotice.confirmStatus, { confirmPayment: true })}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Ya, ubah ke {STATUS_CONFIG[statusNotice.confirmStatus]?.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusNotice(null)}
                        className="px-2.5 py-1 bg-white border border-amber-300 text-amber-900 font-semibold rounded-lg cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, val]) => {
              const isSelected = booth.status === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleStatusChange(key)}
                  disabled={tenantLocked || isSavingStatus}
                  title={tenantLocked ? 'Status booth mengikuti tenant & pembayaran (diubah oleh Sales / Keuangan)' : undefined}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    isSelected ? 'ring-2 ring-blue-500 shadow-sm' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: val.bg, borderColor: val.border, color: val.text }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: val.pillBg }} />
                    <span>{val.label}</span>
                  </div>
                  {isSelected && <Check size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Layer order actions */}
        <div className="pt-1 flex gap-2">
          <button
            type="button"
            onClick={onBringForward}
            className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <ArrowUp size={13} /> Bawa ke Depan
          </button>
          <button
            type="button"
            onClick={onSendBackward}
            className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <ArrowDown size={13} /> Kirim ke Belakang
          </button>
        </div>
      </div>

      {/* Modal Pilih Tenant Terdaftar */}
      <SelectRegisteredClientModal
        isOpen={isSelectClientModalOpen}
        onClose={() => setIsSelectClientModalOpen(false)}
        onSelectClient={handleSelectClient}
        currentProjectId={currentFloorplanId}
      />

      {/* Modal Konfirmasi Lepas Tenant */}
      <DetachConfirmModal
        isOpen={isDetachConfirmOpen}
        onClose={() => setIsDetachConfirmOpen(false)}
        onConfirm={handleExecuteDetach}
        boothCode={code || booth.code}
        tenantName={ownerName}
      />
    </aside>
  );
}

// Subcomponent: SelectRegisteredClientModal
function SelectRegisteredClientModal({ isOpen, onClose, onSelectClient, currentProjectId }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.fetchRegisteredClients()
      .then(res => {
        if (res && res.clients) {
          setClients(res.clients);
        } else if (Array.isArray(res)) {
          setClients(res);
        }
      })
      .catch(e => console.warn('Fetch clients error:', e))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = clients.filter(c => {
    const term = searchTerm.toLowerCase();
    const name = (c.company || c.brandName || '').toLowerCase();
    const pic = (c.pic || c.fullName || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const phone = (c.phone || c.contact || '').toLowerCase();
    const cat = (c.brandCategory || '').toLowerCase();
    return name.includes(term) || pic.includes(term) || email.includes(term) || phone.includes(term) || cat.includes(term);
  });

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-scaleIn">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <UserCheck size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Pilih Tenant / Exhibitor Terdaftar</h3>
              <p className="text-[11px] text-slate-300">Pilih dari client yang sudah memiliki biodata lengkap</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama brand, PIC, email, atau no. WhatsApp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
              autoFocus
            />
          </div>
        </div>

        {/* Client List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw size={16} className="animate-spin text-indigo-600" />
              <span>Memuat data tenant terdaftar...</span>
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((client, idx) => (
              <div 
                key={client.id || idx}
                className="p-3 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-xs truncate">
                      {client.company || client.brandName}
                    </span>
                    {client.brandCategory && (
                      <span className="text-[10px] font-bold px-2 py-0.2 bg-violet-50 text-violet-700 rounded border border-violet-200 shrink-0">
                        {client.brandCategory}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
                    <span>PIC: <b>{client.pic || client.fullName || '-'}</b></span>
                    <span>• {client.phone || client.contact || '-'}</span>
                    {client.email && <span className="text-slate-400 truncate max-w-[150px]">• {client.email}</span>}
                  </div>
                  {client.boothsCount > 0 && (
                    <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                      Sudah memiliki {client.boothsCount} booth di pameran
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectClient(client)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow transition-all shrink-0 cursor-pointer"
                >
                  Pilih Tenant
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Tidak ada data exhibitor yang cocok dengan "{searchTerm}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Subcomponent: DetachConfirmModal
function DetachConfirmModal({ isOpen, onClose, onConfirm, boothCode, tenantName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 p-5 space-y-4 animate-scaleIn">
        <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <Unlink size={22} />
        </div>

        <div className="text-center space-y-1.5">
          <h3 className="font-extrabold text-base text-slate-900">Lepas Tenant dari Booth?</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Apakah Anda yakin ingin melepas tenant <b>"{tenantName}"</b> dari Booth <b>#{boothCode}</b>?
          </p>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 text-left mt-2">
            • Status booth akan kembali ke <b>"Available"</b>.<br />
            • Invoice yang berstatus draft/belum bayar akan dibatalkan.<br />
            • Biodata exhibitor tetap tersimpan di riwayat.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            Ya, Lepas Tenant
          </button>
        </div>
      </div>
    </div>
  );
}
