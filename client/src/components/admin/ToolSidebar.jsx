import React, { useState } from 'react';
import { getSession } from '../../services/session';
import { canAccessPage } from '../../utils/roles';
import { 
  Box, 
  Layers, 
  Plus, 
  Search, 
  Trash2, 
  Mic, 
  Zap, 
  Flame, 
  ShieldAlert, 
  Sparkles,
  Footprints,
  Info,
  Warehouse,
  Truck,
  Armchair,
  Grid,
  Lock,
  Building2,
  Construction,
  Sliders,
  Edit3,
  Check,
  Maximize2,
  FileText,
  Printer,
  CreditCard,
  Square,
  Circle,
  CornerDownRight,
  Maximize,
  Hexagon,
  RotateCw,
  Minus,
  Shapes,
  Eye,
  EyeOff,
  Unlock, Scale } from 'lucide-react';
import { BOOTH_CATEGORIES, BOOTH_SHAPES, VENUE_TEMPLATES, STATUS_CONFIG, updateBoothCategoriesRegistry } from '../../utils/floorplanUtils';
import ShapePalette from './ShapePalette';
import DoorSymbol from './DoorSymbol';
import ElementCatalog, { ElementCard } from './ElementCatalog';
import ElementIcon from './ElementIcon';
import { LIBRARY_TABS, ELEMENTS, searchElements, isLibraryElement, accentOf } from '../../utils/elementLibrary';
import { OPS_SIDEBAR_TABS, OPS_LIBRARY_TABS, OPS_VENUE_TYPES } from '../../utils/opsLayer';
import { FURNITURE_TEMPLATES } from '../../utils/floorplanUtils';
import { DOOR_TYPES, DOOR_WIDTH_PRESETS, clampDoorWidth } from '../../utils/doorSymbols';
import { api } from '../../services/api';

const LIBRARY_TAB_BY_ID = Object.fromEntries(LIBRARY_TABS.map(t => [t.id, t]));

// Tab order: Booths, Walls, Struktur, Pintu, Stage, Zona & Jalur, Tiket & Akses, Utilitas, Signage & Media,
// Operasional, Safety, Amenities, Furniture, Shapes, Layers
const SIDEBAR_TABS = [
    { id: 'booths', label: '🎪 Booths', title: 'Katalog Ukuran Booth' },
    { id: 'structures', label: '🧱 Walls', title: 'Dinding, Pintu & Struktur' },
    LIBRARY_TAB_BY_ID.lib_struktur,
    { id: 'doors', label: '🚪 Pintu', title: 'Katalog Simbol Pintu' },
    { id: 'stage', label: '🎤 Stage', title: 'Panggung, Rigging & Sound' },
    LIBRARY_TAB_BY_ID.lib_zona,
    LIBRARY_TAB_BY_ID.lib_tiket,
    LIBRARY_TAB_BY_ID.lib_utilitas,
    LIBRARY_TAB_BY_ID.lib_signage,
    LIBRARY_TAB_BY_ID.lib_operasional,
    { id: 'utilities', label: '⚡ Safety', title: 'Listrik, APAR & Utilitas' },
    { id: 'amenities', label: '🪑 Amenities', title: 'Fasilitas Umum & Logistik' },
    { id: 'furniture', label: '🪑 Furniture', title: 'Furnitur & Tempat Duduk' },
    { id: 'shapes', label: '🔷 Shapes', title: 'Bentuk Geometris & Anotasi' },
    { id: 'layers', label: '📑 Layers', title: 'Daftar Objek di Kanvas' }
];

export default function ToolSidebar({ 
  onAddBooth, 
  onAddVenueItem, 
  onAddBasicShape,
  onAddDoor,
  onAddLibraryElement,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onOpenInvoiceModal,
  onOpenInvoiceEditorModal,
  onOpenCategoryModal,
  // "Samakan Semua Harga dengan Template": passed only for roles that may do it (not rendered otherwise)
  onSyncTemplatePrices,
  objectsList = [], 
  onSelectObject, 
  onDeleteObject,
  activeObjectId,
  selectedObject,
  onUpdateProperty,
  propertyTick = 0,
  gridScale = 20,
  // 'ops' = Denah Operasional: only operational tabs (no Booths / Walls / Struktur / Pintu / Stage), no price or invoice data
  mode = 'sales'
}) {
  const isOps = mode === 'ops';
  // The invoice catalogue is only for roles that may open Manajemen Invoice (not Operasional)
  const canSeeInvoices = !isOps && canAccessPage(getSession()?.user?.role, 'invoices');
  const visibleTabs = isOps
    ? SIDEBAR_TABS.filter(t => OPS_SIDEBAR_TABS.includes(t.id))
    : SIDEBAR_TABS.filter(t => t.id !== 'invoices' || canSeeInvoices);
  // Tabs: 'booths' | 'invoices' | 'structures' | 'doors' | 'stage' | 'utilities' | 'amenities' | 'shapes' | 'layers'
  const [activeTab, setActiveTab] = useState(isOps ? 'lib_utilitas' : 'booths');
  const [searchQuery, setSearchQuery] = useState('');
  // Element search across every tab ("pilar", "wifi", "gate", ...)
  const [elementSearch, setElementSearch] = useState('');
  const [sidebarInvoices, setSidebarInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [catTick, setCatTick] = useState(0); // force re-render when categories load from API
  const [tierCategories, setTierCategories] = useState(() => Object.values(BOOTH_CATEGORIES));

  // Fetch Master Tier Harga from database on mount and sync into BOOTH_CATEGORIES
  React.useEffect(() => {
    if (isOps) return; // price tiers are sales data
    async function loadTierCategories() {
      try {
        const data = await api.fetchCategories();
        if (Array.isArray(data) && data.length > 0) {
          updateBoothCategoriesRegistry(data);
          setTierCategories(data.map(c => ({
            id: c.id || `cat_${c.key}`,
            key: c.key,
            name: c.name || c.key,
            widthM: parseFloat(c.widthM || c.width_m) || 3,
            heightM: parseFloat(c.heightM || c.height_m) || 3,
            defaultPrice: parseInt(c.defaultPrice !== undefined ? c.defaultPrice : c.default_price, 10) || 0,
            color: c.color || '#3b82f6',
            border: c.border || c.borderColor || c.border_color || '#1d4ed8',
            isFree: Boolean(c.isFree || c.is_free),
            description: c.description || c.desc || ''
          })));
          setCatTick(t => t + 1); // trigger re-render with fresh data
        } else {
          setTierCategories(Object.values(BOOTH_CATEGORIES));
        }
      } catch (e) {
        console.warn('ToolSidebar: failed to load booth tier categories from API:', e);
        setTierCategories(Object.values(BOOTH_CATEGORIES));
      }
    }
    loadTierCategories();
  }, [propertyTick]);

  const catalogTiers = (tierCategories && tierCategories.length > 0)
    ? tierCategories
    : Object.values(BOOTH_CATEGORIES);

  // Custom booth designer state (string states for uninhibited backspacing and typing)
  const [customShape, setCustomShape] = useState('rectangle');
  const [customCategory, setCustomCategory] = useState('Standard');
  const [customWidth, setCustomWidth] = useState('3');
  const [customHeight, setCustomHeight] = useState('3');
  const [customOwner, setCustomOwner] = useState('');

  // Door catalog width (string state so the field can be cleared while typing)
  const [doorWidthInput, setDoorWidthInput] = useState('0.9');
  const doorWidthM = clampDoorWidth(doorWidthInput) || 0.9;

  const selectedBooth = selectedObject?.isBooth ? selectedObject.boothData : null;
  const customCatCfg = BOOTH_CATEGORIES[customCategory] || BOOTH_CATEGORIES.Standard;
  const customPrice = customCatCfg?.defaultPrice || 5000000;
  const customArea = ((parseFloat(customWidth) || 3) * (parseFloat(customHeight) || 3)).toFixed(1);

  // Selected booth sidebar local buffer
  const [sbShape, setSbShape] = useState('rectangle');
  const [sbWidthM, setSbWidthM] = useState('3');
  const [sbHeightM, setSbHeightM] = useState('3');

  React.useEffect(() => {
    if (selectedBooth) {
      setSbShape(selectedBooth.shape || 'rectangle');
      setSbWidthM(String(selectedBooth.widthM || 3));
      setSbHeightM(String(selectedBooth.heightM || 3));
    }
  }, [selectedBooth?.id, selectedBooth?.shape, selectedBooth?.widthM, selectedBooth?.heightM, propertyTick]);

  // Load invoices when invoices tab is clicked or sidebar mounted
  const loadSidebarInvoices = React.useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const data = await api.fetchInvoices();
      setSidebarInvoices(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  React.useEffect(() => {
    if (canSeeInvoices) loadSidebarInvoices();
  }, [loadSidebarInvoices, canSeeInvoices]);

  React.useEffect(() => {
    if (activeTab === 'invoices' && canSeeInvoices) {
      loadSidebarInvoices();
    }
  }, [activeTab, loadSidebarInvoices, canSeeInvoices]);

  const filteredObjects = objectsList.filter((item) => {
    if (!searchQuery) return true;
    const name = item.boothData?.code || item.venueData?.label || (item.venueData?.type === 'door' ? DOOR_TYPES[item.venueData.doorType]?.name : '') || item.type || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Reusable Item Card Component
  const VenueCard = ({ type, title, subtitle, icon, badge, colorClass = 'bg-slate-50 hover:bg-slate-100 border-slate-200' }) => {
    const config = VENUE_TEMPLATES[type];
    return (
      <div
        draggable
        style={{ WebkitUserDrag: 'element' }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          const payload = JSON.stringify({ itemType: 'venue', venueType: type });
          e.dataTransfer.setData('text/plain', payload);
          e.dataTransfer.setData('application/json', payload);
        }}
        onClick={() => onAddVenueItem(type)}
        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group shadow-xs ${colorClass}`}
        title={`${title} - Drag atau klik untuk menambah ke kanvas`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-xs text-base">
            {icon}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
              {title}
            </h4>
            <p className="text-[10px] text-slate-500 truncate">{subtitle || config?.desc}</p>
            {badge && (
              <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded font-medium">
                {badge}
              </span>
            )}
          </div>
        </div>
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddVenueItem(type);
          }}
          className="p-1 rounded-md bg-white border border-slate-200 text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors shrink-0 cursor-pointer"
        >
          <Plus size={13} />
        </button>
      </div>
    );
  };

  return (
    <aside className="w-72 lg:w-80 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full select-none z-10 shadow-sm overflow-hidden">
      {/* Element search: find any element without opening tabs one by one */}
      <div className="px-2 pt-2 bg-slate-50/80 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={elementSearch}
            onChange={(e) => setElementSearch(e.target.value)}
            placeholder='Cari elemen: "pilar", "wifi", "gate"...'
            className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {elementSearch && (
            <button type="button" onClick={() => setElementSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold" title="Hapus pencarian">×</button>
          )}
        </div>
      </div>

      {/* Tabs Menu (wraps onto extra rows in a narrow panel) */}
      <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/80 p-1 gap-1 text-[11px] shrink-0">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setElementSearch(''); }}
            className={`py-1.5 px-2.5 rounded-lg font-semibold flex items-center gap-1 shrink-0 transition-all ${
              activeTab === tab.id && !elementSearch
                ? 'bg-white text-blue-600 shadow-xs border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
            title={tab.title}
          >
            {tab.label}
            {tab.id === 'layers' && objectsList.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[10px] rounded-full font-bold">
                {objectsList.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {elementSearch.trim() && (() => {
          const q = elementSearch.trim().toLowerCase();
          const libraryHits = searchElements(q).filter(el => !isOps || OPS_LIBRARY_TABS.has(el.tab));
          const venueHits = Object.entries({ ...VENUE_TEMPLATES, ...FURNITURE_TEMPLATES })
            .filter(([type, cfg]) => (!isOps || OPS_VENUE_TYPES.has(type)) && `${type} ${cfg.title || ''} ${cfg.desc || ''}`.toLowerCase().includes(q));
          return (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Hasil Pencarian ({libraryHits.length + venueHits.length})
              </div>
              {libraryHits.map(el => <ElementCard key={el.id} id={el.id} onAdd={(id) => onAddLibraryElement?.(id)} />)}
              {venueHits.map(([type, cfg]) => (
                <VenueCard key={type} type={type} title={cfg.title} subtitle={cfg.desc} icon={cfg.icon || '▦'} badge={`${cfg.widthM}x${cfg.heightM}m`} />
              ))}
              {libraryHits.length + venueHits.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">Tidak ada elemen yang cocok dengan "{elementSearch}"</div>
              )}
            </div>
          );
        })()}

        {!elementSearch.trim() && LIBRARY_TAB_BY_ID[activeTab] && (
          <ElementCatalog
            tabId={activeTab}
            title={LIBRARY_TAB_BY_ID[activeTab].title}
            onAdd={(id) => onAddLibraryElement?.(id)}
            onAddVenueItem={onAddVenueItem}
          />
        )}

        {/* ACTIVE SELECTED BOOTH QUICK EDITOR IN SIDEBAR */}
        {selectedBooth && (
          <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50/80 border-2 border-blue-400 rounded-xl space-y-2.5 shadow-sm mb-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
                <span className="font-bold text-xs text-blue-950 truncate">
                  Edit Booth Terpilih: {selectedBooth.code}
                </span>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                Aktif
              </span>
            </div>

            {/* Bentuk Geometri (5 Shapes) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Shapes size={11} className="text-blue-600" /> Bentuk Booth
                </label>
                <span className="text-[9px] font-bold text-blue-700 bg-blue-100/90 px-1.5 py-0.2 rounded border border-blue-200">
                  {BOOTH_SHAPES[sbShape]?.name || 'Kotak'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Object.values(BOOTH_SHAPES).map((item) => {
                  const isSelected = (sbShape || 'rectangle') === item.id;
                  const ShapeIcon = item.id === 'rounded' ? Circle
                    : item.id === 'l_shape' ? CornerDownRight
                    : item.id === 'island_open' ? Maximize
                    : item.id === 'hexagon' ? Hexagon
                    : Square;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSbShape(item.id);
                        onUpdateProperty({ shape: item.id });
                      }}
                      className={`p-1.5 rounded-lg border text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                      title={`${item.name} (${item.desc})`}
                    >
                      <ShapeIcon size={14} className={isSelected ? 'text-white' : 'text-blue-600'} />
                      <span className="text-[8px] font-bold mt-0.5 truncate max-w-full">
                        {item.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Kategori Booth */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                  Kategori / Tier Booth
                </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCategoryModal) onOpenCategoryModal();
                      else window.location.href = '/admin/settings?tab=categories';
                    }}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                    title="Pengaturan Kategori / Tier Harga di Pengaturan Sistem"
                  >
                    ⚙️ Kelola Tier
                  </button>
              </div>
              <select
                value={selectedBooth.category || 'Standard'}
                onChange={(e) => {
                  const newCat = e.target.value;
                  const catCfg = BOOTH_CATEGORIES[newCat];
                  if (catCfg) {
                    onUpdateProperty({
                      category: newCat,
                      price: catCfg.defaultPrice,
                      widthM: catCfg.widthM,
                      heightM: catCfg.heightM
                    });
                  } else {
                    onUpdateProperty({ category: newCat });
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
              >
                {Object.keys(BOOTH_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {BOOTH_CATEGORIES[cat]?.name || cat} - Rp {(BOOTH_CATEGORIES[cat]?.defaultPrice || 0).toLocaleString('id-ID')}
                  </option>
                ))}
              </select>
            </div>

            {/* Nama Pemilik (Tenant) */}
            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Nama Pemilik (Tenant)
              </label>
              <input
                type="text"
                placeholder="Nama Perusahaan / Tenant..."
                value={selectedBooth.ownerName || ''}
                onChange={(e) => onUpdateProperty({ ownerName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>

            {/* Ukuran (Lebar & Panjang Meter) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Ukuran Booth (Meter)
                </label>
                <span className="text-[10px] font-bold text-emerald-700">
                  Luas: {(parseFloat(selectedBooth.widthM || 3) * parseFloat(selectedBooth.heightM || 3)).toFixed(1)} m²
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-slate-500 font-medium block mb-0.5">Lebar (m)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={sbWidthM}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSbWidthM(val);
                        const w = parseFloat(val);
                        if (!isNaN(w) && w > 0) onUpdateProperty({ widthM: w });
                      }}
                      onBlur={() => {
                        const w = parseFloat(sbWidthM);
                        if (isNaN(w) || w <= 0) {
                          setSbWidthM(String(selectedBooth.widthM || 3));
                          onUpdateProperty({ widthM: selectedBooth.widthM || 3 });
                        }
                      }}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 pr-5 shadow-xs"
                    />
                    <span className="absolute right-1.5 top-1 text-[9px] text-slate-400 font-medium">m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 font-medium block mb-0.5">Panjang (m)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={sbHeightM}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSbHeightM(val);
                        const h = parseFloat(val);
                        if (!isNaN(h) && h > 0) onUpdateProperty({ heightM: h });
                      }}
                      onBlur={() => {
                        const h = parseFloat(sbHeightM);
                        if (isNaN(h) || h <= 0) {
                          setSbHeightM(String(selectedBooth.heightM || 3));
                          onUpdateProperty({ heightM: selectedBooth.heightM || 3 });
                        }
                      }}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 pr-5 shadow-xs"
                    />
                    <span className="absolute right-1.5 top-1 text-[9px] text-slate-400 font-medium">m</span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="grid grid-cols-5 gap-1 mt-1.5">
                {[
                  { label: '2x2', w: 2, h: 2 },
                  { label: '3x3', w: 3, h: 3 },
                  { label: '4x3', w: 4, h: 3 },
                  { label: '6x3', w: 6, h: 3 },
                  { label: '6x6', w: 6, h: 6 }
                ].map((p) => {
                  const isActive = parseFloat(sbWidthM) === p.w && parseFloat(sbHeightM) === p.h;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setSbWidthM(String(p.w));
                        setSbHeightM(String(p.h));
                        onUpdateProperty({ widthM: p.w, heightM: p.h });
                      }}
                      className={`py-1 rounded text-[10px] font-semibold border transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {p.label}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Harga Sewa */}
            <div className="flex items-center justify-between pt-1.5 border-t border-blue-200/80 text-[11px]">
              <span className="text-slate-600">
                Harga: <b className="text-blue-700">Rp {(selectedBooth.price || 0).toLocaleString('id-ID')}</b>
              </span>
              <button
                type="button"
                onClick={() => onUpdateProperty({ priceMode: 'template' })}
                title="Kembali mengikuti harga template ukuran booth ini"
                className="text-[10px] text-blue-600 font-bold hover:underline"
              >
                Reset Template
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: BOOTHS */}
        {!elementSearch.trim() && activeTab === 'booths' && (
          <div className="space-y-3">
            {/* 1. Interactive Custom Shape & Size Designer */}
            <div className="p-3 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-blue-600" /> Kustom Bentuk & Ukuran
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                  {customArea} m²
                </span>
              </div>



              {/* Kategori / Tier & Harga Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold text-slate-600">
                    Kategori / Tier & Harga:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCategoryModal) onOpenCategoryModal();
                      else window.location.href = '/admin/settings?tab=categories';
                    }}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                    title="Kelola Kategori / Tier Harga di Pengaturan Sistem"
                  >
                    ⚙️ Kelola Tier
                  </button>
                </div>
                <select
                  value={customCategory}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setCustomCategory(cat);
                    const cfg = BOOTH_CATEGORIES[cat];
                    if (cfg) {
                      setCustomWidth(String(cfg.widthM));
                      setCustomHeight(String(cfg.heightM));
                    }
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                >
                  {Object.keys(BOOTH_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {BOOTH_CATEGORIES[cat]?.name || cat} - Rp {(BOOTH_CATEGORIES[cat]?.defaultPrice || 0).toLocaleString('id-ID')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lebar & Panjang Inputs dengan Stepper & Sliders */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-slate-600">Lebar (Meter)</label>
                    <span className="text-[10px] font-bold text-blue-700 font-mono">{customWidth}m</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nextW = Math.max(0.5, (parseFloat(customWidth) || 3) - 0.5);
                        setCustomWidth(String(nextW));
                      }}
                      className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      title="Kurang 0.5m"
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      onBlur={() => {
                        const num = parseFloat(customWidth);
                        if (isNaN(num) || num <= 0) setCustomWidth('3');
                      }}
                      className="flex-1 px-1 py-1 bg-white border border-slate-300 rounded text-center text-xs font-bold text-slate-800 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextW = Math.min(50, (parseFloat(customWidth) || 3) + 0.5);
                        setCustomWidth(String(nextW));
                      }}
                      className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      title="Tambah 0.5m"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={parseFloat(customWidth) || 3}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-slate-600">Panjang (Meter)</label>
                    <span className="text-[10px] font-bold text-blue-700 font-mono">{customHeight}m</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nextH = Math.max(0.5, (parseFloat(customHeight) || 3) - 0.5);
                        setCustomHeight(String(nextH));
                      }}
                      className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      title="Kurang 0.5m"
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      onBlur={() => {
                        const num = parseFloat(customHeight);
                        if (isNaN(num) || num <= 0) setCustomHeight('3');
                      }}
                      className="flex-1 px-1 py-1 bg-white border border-slate-300 rounded text-center text-xs font-bold text-slate-800 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextH = Math.min(50, (parseFloat(customHeight) || 3) + 0.5);
                        setCustomHeight(String(nextH));
                      }}
                      className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                      title="Tambah 0.5m"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={parseFloat(customHeight) || 3}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[9px] text-slate-400 font-semibold block mb-1 uppercase">Pilihan Ukuran Cepat:</span>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: '2x2', w: 2, h: 2 },
                    { label: '3x3', w: 3, h: 3 },
                    { label: '4x3', w: 4, h: 3 },
                    { label: '5x4', w: 5, h: 4 },
                    { label: '6x3', w: 6, h: 3 },
                    { label: '6x6', w: 6, h: 6 },
                    { label: '8x4', w: 8, h: 4 },
                    { label: '9x6', w: 9, h: 6 },
                    { label: '12x6', w: 12, h: 6 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setCustomWidth(String(p.w));
                        setCustomHeight(String(p.h));
                      }}
                      className={`py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                        parseFloat(customWidth) === p.w && parseFloat(customHeight) === p.h
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {p.label}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Nama Pemilik */}
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                  Nama Pemilik Booth (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Telkom Indonesia..."
                  value={customOwner}
                  onChange={(e) => setCustomOwner(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs placeholder:text-slate-400"
                />
              </div>

              {/* Draggable Preview & Action Buttons */}
              <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    draggable
                    style={{ WebkitUserDrag: 'element' }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy';
                      const payload = JSON.stringify({ 
                        itemType: 'booth', 
                        category: customCategory, 
                        shape: customShape,
                        widthM: parseFloat(customWidth) || 3, 
                        heightM: parseFloat(customHeight) || 3, 
                        price: customPrice,
                        ownerName: customOwner || ''
                      });
                      e.dataTransfer.setData('text/plain', payload);
                      e.dataTransfer.setData('application/json', payload);
                    }}
                    onClick={() => onAddBooth({
                      category: customCategory,
                      shape: customShape,
                      widthM: parseFloat(customWidth) || 3,
                      heightM: parseFloat(customHeight) || 3,
                      price: customPrice,
                      ownerName: customOwner || ''
                    })}
                    className="flex-1 py-2 px-2 bg-white hover:bg-blue-50 border border-blue-400 rounded-lg cursor-grab active:cursor-grabbing text-center text-xs font-bold text-blue-700 transition-colors shadow-xs flex items-center justify-center gap-1"
                    title="Drag kotak ini langsung ke denah atau klik untuk tambah cepat"
                  >
                    <span>✋ Drag / Klik ({customWidth}x{customHeight}m, {BOOTH_SHAPES[customShape]?.name?.split(' ')[0] || 'Kotak'})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddBooth({
                      category: customCategory,
                      shape: customShape,
                      widthM: parseFloat(customWidth) || 3,
                      heightM: parseFloat(customHeight) || 3,
                      price: customPrice,
                      ownerName: customOwner || ''
                    })}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                    title="Tambah booth baru dengan ukuran dan bentuk ini ke denah"
                  >
                    <Plus size={14} /> Tambah ke Denah
                  </button>
                </div>

                {/* If a booth is selected, provide one-click apply custom shape & size */}
                {selectedBooth && (
                  <button
                    type="button"
                    onClick={() => onUpdateProperty({
                      category: customCategory,
                      shape: customShape,
                      widthM: parseFloat(customWidth) || 3,
                      heightM: parseFloat(customHeight) || 3,
                      price: customPrice,
                      ownerName: customOwner || selectedBooth.ownerName || ''
                    })}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    title={`Terapkan bentuk ${BOOTH_SHAPES[customShape]?.name} & ukuran ${customWidth}x${customHeight}m ke Booth ${selectedBooth.code}`}
                  >
                    <Check size={14} /> Terapkan Bentuk & Ukuran ke Booth Terpilih ({selectedBooth.code})
                  </button>
                )}
              </div>
            </div>

            {/* 2. Standard Catalog with Quick Customize (Sourced from Master Tier in Settings) */}
            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Katalog Template Standar</span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium">Master Tier</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCategoryModal) onOpenCategoryModal();
                      else window.location.href = '/admin/settings?tab=categories';
                    }}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium cursor-pointer"
                    title="Atur Master Tier Harga & Ukuran di Menu Settings"
                  >
                    ⚙️ Settings
                  </button>
                  <span className="text-[10px] text-slate-400 font-medium">Klik / Drag</span>
                </div>
              </div>
              {onSyncTemplatePrices && (
                <button
                  type="button"
                  onClick={onSyncTemplatePrices}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  title="Pratinjau dulu: bandingkan harga setiap booth dengan template ukurannya, lalu pilih yang diubah"
                >
                  <Scale size={12} />
                  <span>Samakan Semua Harga dengan Template</span>
                </button>
              )}

              {/* Dynamic Catalog Cards from Master Tier Settings */}
              {catalogTiers.map((tier) => {
                const isFree = Boolean(tier.isFree);
                const price = isFree ? 0 : (tier.defaultPrice !== undefined ? tier.defaultPrice : 5000000);
                const widthM = parseFloat(tier.widthM) || 3;
                const heightM = parseFloat(tier.heightM) || 3;
                const color = tier.color || '#3b82f6';
                const formattedPrice = isFree 
                  ? 'Rp 0' 
                  : `Rp ${Number(price).toLocaleString('id-ID')}`;

                return (
                  <div
                    key={tier.key || tier.id}
                    draggable
                    style={{ 
                      WebkitUserDrag: 'element',
                      borderLeft: `4px solid ${color}`
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy';
                      const payload = JSON.stringify({ 
                        itemType: 'booth', 
                        category: tier.key, 
                        widthM, 
                        heightM, 
                        price,
                        color 
                      });
                      e.dataTransfer.setData('text/plain', payload);
                      e.dataTransfer.setData('application/json', payload);
                    }}
                    onClick={() => onAddBooth({ 
                      category: tier.key, 
                      widthM, 
                      heightM, 
                      price,
                      color 
                    })}
                    className="p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-slate-300 rounded-xl cursor-pointer transition-all group flex items-center justify-between shadow-xs"
                    title={`Klik untuk tambah ${tier.name || tier.key} ke denah atau drag ke posisi tertentu`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="w-10 h-10 rounded-lg flex flex-col items-center justify-center font-bold text-xs shadow-xs shrink-0 border"
                        style={{ 
                          backgroundColor: `${color}15`, 
                          borderColor: `${color}40`,
                          color: color 
                        }}
                      >
                        {isFree ? (
                          <>
                            <span className="text-xs">🎁</span>
                            <span className="text-[7px] font-black uppercase tracking-wider">FREE</span>
                          </>
                        ) : (
                          <>
                            <span className="leading-tight">{widthM}x{heightM}</span>
                            <span className="text-[8px] font-normal opacity-80">meter</span>
                          </>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                            {tier.name || tier.key}
                          </h4>
                          {isFree && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-600 text-white rounded-full font-bold">
                              Gratis
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-slate-500">
                          Harga <span className="font-semibold text-slate-700">{formattedPrice}</span>
                          {isFree && <span className="text-[9px] text-slate-400 font-normal"> (Non-Revenue)</span>}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span 
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-[150px]"
                            style={{
                              backgroundColor: `${color}15`,
                              color: color
                            }}
                          >
                            {tier.description || tier.desc || `${widthM}x${heightM}m • ${widthM * heightM} m²`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {selectedBooth && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateProperty({ category: tier.key, widthM, heightM, price, color });
                          }}
                          className="px-1.5 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer border shadow-2xs"
                          style={{
                            backgroundColor: `${color}15`,
                            borderColor: `${color}40`,
                            color: color
                          }}
                          title={`Ubah Booth ${selectedBooth.code} menjadi ${tier.name || tier.key}`}
                        >
                          Terapkan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomCategory(tier.key);
                          setCustomWidth(String(widthM));
                          setCustomHeight(String(heightM));
                        }}
                        className="p-1 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors cursor-pointer shadow-2xs"
                        title="Edit ukuran template ini di panel atas"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddBooth({ category: tier.key, widthM, heightM, price, color });
                        }}
                        className="p-1 rounded-md bg-white border border-slate-200 text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors cursor-pointer shadow-2xs"
                        title={`Tambah ${tier.name || tier.key} ke denah`}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: WALLS & STRUCTURES */}
        {!elementSearch.trim() && activeTab === 'structures' && (
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Dinding, Pembatas & Struktur
            </div>
            <VenueCard type="wall_line" title="Dinding Garis Vektor (Wall Line)" subtitle="Dapat ditarik panjang tanpa pecah" icon="━" badge="Vektor Tajam" colorClass="bg-slate-900 text-white border-slate-700 hover:bg-slate-800" />
            <VenueCard type="wall" title="Dinding Partisi Modular (5m)" subtitle="Partisi pembatas antar aula/blok" icon="🧱" badge="5x0.4m" />
            <VenueCard type="pillar" title="Tiang Gedung (Column)" subtitle="Tiang struktural gedung" icon="■" badge="2x2m" />
            <VenueCard type="exit" title="Pintu Darurat (Exit K3)" subtitle="Jalur evakuasi keselamatan" icon="🚨" badge="4x1.8m" colorClass="bg-emerald-50/60 border-emerald-200" />
            <VenueCard type="stairs" title="Tangga / Elevasi Lantai" subtitle="Beda elevasi lantai pameran" icon="🪜" badge="3x2m" />
          </div>
        )}

        {/* TAB: DOOR SYMBOLS */}
        {!elementSearch.trim() && activeTab === 'doors' && (
          <div className="space-y-3">
            {/* Door width designer */}
            <div className="p-3 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-blue-600" /> Lebar Pintu
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                  {doorWidthM.toLocaleString('id-ID')} m
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {DOOR_WIDTH_PRESETS.map(w => {
                  const isSelected = Math.abs(doorWidthM - w) < 0.001;
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setDoorWidthInput(String(w))}
                      className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {w.toLocaleString('id-ID')}m
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">Lebar manual (0,5 – 10 m):</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDoorWidthInput(String(clampDoorWidth(doorWidthM - 0.1)))}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-bold cursor-pointer"
                  >−</button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={doorWidthInput}
                    onChange={(e) => setDoorWidthInput(e.target.value)}
                    onBlur={() => setDoorWidthInput(String(doorWidthM))}
                    className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-center font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setDoorWidthInput(String(clampDoorWidth(doorWidthM + 0.1)))}
                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-bold cursor-pointer"
                  >+</button>
                  <span className="text-[10px] text-slate-500">m</span>
                </div>
              </div>
            </div>

            <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Katalog Simbol Pintu
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(DOOR_TYPES).map(door => (
                <div
                  key={door.id}
                  draggable
                  style={{ WebkitUserDrag: 'element' }}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    const payload = JSON.stringify({ itemType: 'door', doorType: door.id, widthM: doorWidthM });
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.setData('application/json', payload);
                  }}
                  onClick={() => onAddDoor?.(door.id, doorWidthM)}
                  className="p-2 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all flex flex-col items-center text-center group shadow-xs"
                  title={`${door.name} (${doorWidthM.toLocaleString('id-ID')} m) - Klik atau drag ke kanvas`}
                >
                  <div className="w-full h-11 flex items-center justify-center text-slate-900 group-hover:text-blue-700">
                    <DoorSymbol doorType={door.id} className="w-full h-10" />
                  </div>
                  <span className="mt-1 text-[10px] font-bold text-slate-800 leading-tight">{door.name}</span>
                  <span className="text-[9px] text-slate-400 leading-tight">{door.nameEn}</span>
                </div>
              ))}
            </div>
            <p className="px-1 text-[10px] text-slate-500 leading-relaxed">
              Klik kartu untuk menaruh pintu di tengah kanvas, atau drag ke posisi tertentu. Pintu otomatis menempel pada dinding (tab Walls) di dekatnya.
            </p>
          </div>
        )}

        {/* TAB 3: STAGE & RIGGING */}
        {!elementSearch.trim() && activeTab === 'stage' && (
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Struktur Panggung & Audio Visual
            </div>
            <VenueCard type="stage" title="Panggung Utama (12x6m)" subtitle="Main stage & seminar" icon="🎤" badge="12x6m" colorClass="bg-indigo-950/20 border-indigo-300" />
            <VenueCard type="rigging" title="Rigging / Box Truss" subtitle="Gantungan lampu overhead" icon="🏗️" badge="10x1.2m" />
            <VenueCard type="sound" title="Sound Line Array" subtitle="Menara speaker panggung" icon="🔊" badge="2x2.5m" />
            <VenueCard type="lighting" title="Lighting Tower / Spot" subtitle="Follow spot lampu sorot" icon="💡" badge="2x2m" />
            <VenueCard type="foh" title="FOH Control Booth" subtitle="Meja operator AV & kamera" icon="🎛️" badge="4x3m" />
          </div>
        )}

        {/* TAB 4: UTILITIES & SAFETY */}
        {!elementSearch.trim() && activeTab === 'utilities' && (
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              ⚡ Utilitas & Keamanan Gedung
            </div>
            <VenueCard type="floorbox" title="Floor Box (Listrik & LAN)" subtitle="Power drop & kabel optik" icon="🔌" badge="1.5x1.5m" colorClass="bg-amber-50 border-amber-200" />
            <VenueCard type="apar" title="APAR Pemadam Api K3" subtitle="Wajib standar keselamatan" icon="🧯" badge="1x1m" colorClass="bg-rose-50 border-rose-200" />
            <VenueCard type="hydrant" title="Hydrant & Kotak P3K" subtitle="Akses pemadam & medis darurat" icon="🚰" badge="2x1.5m" colorClass="bg-blue-50 border-blue-200" />
            <VenueCard type="waste" title="Bin Center / Tempat Sampah" subtitle="Area pembuangan sampah tenant" icon="🗑️" badge="2.5x2m" />
          </div>
        )}

        {/* TAB 5: AMENITIES & LOGISTICS */}
        {!elementSearch.trim() && activeTab === 'amenities' && (
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Fasilitas Pengunjung & Logistik
            </div>
            <VenueCard type="regdesk" title="Registration Counter" subtitle="Meja registrasi & tiket panitia" icon="ℹ️" badge="5x2m" colorClass="bg-emerald-50 border-emerald-200" />
            <VenueCard type="toilet" title="Toilet & Restroom Zones" subtitle="Pria, wanita & disabilitas" icon="🚽" badge="4x3m" colorClass="bg-cyan-50 border-cyan-200" />
            <VenueCard type="atm" title="ATM & Charging Station" subtitle="Fasilitas umum pengunjung" icon="🏧" badge="3x2m" colorClass="bg-purple-50 border-purple-200" />
            <VenueCard type="signage" title="Signage / You Are Here" subtitle="Peta petunjuk arah lorong" icon="🪧" badge="1.5x1.5m" />
            <VenueCard type="plants" title="Tanaman Dekorasi (Greenery)" subtitle="Pot estetika & pembatas" icon="🪴" badge="1.5x1.5m" colorClass="bg-emerald-50 border-emerald-200" />
            <VenueCard type="loading" title="Loading Dock (Bongkar Muat)" subtitle="Akses kontainer logistik" icon="🚛" badge="8x4m" colorClass="bg-orange-50 border-orange-200" />
            <VenueCard type="storage" title="Gudang Panitia (Storage)" subtitle="Penyimpanan barang & kardus" icon="📦" badge="5x4m" />
            <VenueCard type="greenroom" title="Green Room (Transit Artis)" subtitle="Ruang tunggu VIP pembicara" icon="🧑‍💼" badge="6x4m" colorClass="bg-emerald-50 border-emerald-200" />
            <VenueCard type="security" title="Pos Keamanan / Security" subtitle="Titik pengawasan keamanan" icon="🔒" badge="2.5x2.5m" colorClass="bg-slate-100 border-slate-300" />
            <ElementCard id="musholla" onAdd={(id) => onAddLibraryElement?.(id)} />
            <ElementCard id="wudhu" onAdd={(id) => onAddLibraryElement?.(id)} />
          </div>
        )}

        {/* TAB: FURNITURE */}
        {!elementSearch.trim() && activeTab === 'furniture' && (
          <div className="space-y-1.5 pr-0.5 pb-4 max-h-[calc(100vh-210px)] overflow-y-auto">
            <VenueCard type="chair_square" title="Kursi Persegi" subtitle="Kursi kotak standar" icon="🪑" />
            <VenueCard type="chair_round" title="Kursi Bulat" subtitle="Kursi cafe membulat" icon="🪑" />
            <VenueCard type="chair_office" title="Kursi Kantor" subtitle="Kursi sandaran tangan" icon="💺" />
            <VenueCard type="chair_lounge" title="Sofa / Lounge" subtitle="Sofa single tebal" icon="🛋️" />
            <VenueCard type="chair_dining" title="Kursi Makan" subtitle="Kursi banquet lengkung" icon="🪑" />
          </div>
        )}

        {/* TAB 6: LAYERS TREE */}
        {!elementSearch.trim() && activeTab === 'layers' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari kode booth / objek..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5 pr-0.5 max-h-[calc(100vh-210px)] overflow-y-auto">
              {filteredObjects.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {searchQuery ? 'Tidak ada objek cocok' : 'Belum ada objek di kanvas'}
                </div>
              ) : (
                filteredObjects.map((item, idx) => {
                  const isBooth = item.isBooth;
                  const isVenue = item.isVenueItem;
                  const isDoor = item.venueData?.type === 'door';
                  const libEl = isLibraryElement(item) ? ELEMENTS[item.venueData.type] : null;
                  const code = item.boothData?.code || item.venueData?.label || (isDoor ? DOOR_TYPES[item.venueData.doorType]?.name : null) || libEl?.name || `Object #${idx + 1}`;
                  const isHidden = item.visible === false;
                  const status = item.boothData?.status || 'available';
                  const statusCfg = STATUS_CONFIG[status];
                  const isSelected = activeObjectId === (item.boothData?.id || item.venueData?.id);

                  return (
                    <div
                      key={item.boothData?.id || item.venueData?.id || idx}
                      onClick={() => onSelectObject(item)}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400/50' 
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {libEl ? (
                          <span className="shrink-0" style={{ color: accentOf(item.venueData.type) }}><ElementIcon type={item.venueData.type} size={14} /></span>
                        ) : (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: isBooth ? statusCfg?.pillBg : '#6366f1' }}
                          />
                        )}
                        <div className={`truncate ${isHidden ? 'opacity-50' : ''}`}>
                          <div className="font-semibold text-slate-800 truncate">{code}</div>
                          <div className="text-[10px] text-slate-400">
                            {isBooth 
                              ? `${item.boothData.category} • Rp ${(item.boothData.price || 0).toLocaleString('id-ID')}` 
                              : isDoor ? `🚪 ${DOOR_TYPES[item.venueData.doorType]?.name || 'Pintu'} • ${item.venueData.widthM} m`
                              : libEl ? `${libEl.name}${item.venueData.publicVisible === false ? ' • internal' : ''}`
                              : isVenue ? 'Fasilitas Venue' : 'Elemen'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {isVenue && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onToggleLayerVisibility?.(item); }}
                              className={`p-1 rounded hover:bg-slate-100 transition-colors ${isHidden ? 'text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}
                              title={isHidden ? 'Tampilkan di kanvas' : 'Sembunyikan di kanvas'}
                            >
                              {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onToggleLayerLock?.(item); }}
                              className={`p-1 rounded hover:bg-slate-100 transition-colors ${item.isLocked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'}`}
                              title={item.isLocked ? 'Buka kunci' : 'Kunci posisi'}
                            >
                              {item.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteObject(item);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB INVOICES: INVOICE HUB IN LEFT SIDEBAR */}
        {!elementSearch.trim() && activeTab === 'invoices' && (
          <div className="space-y-3 animate-fadeIn">
            {/* Header with Add Button */}
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileText size={15} className="text-amber-700" />
                  <span className="font-bold text-xs text-amber-950">
                    Katalog Invoice ({sidebarInvoices.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => loadSidebarInvoices()}
                  className="p-1 text-amber-700 hover:text-amber-900 rounded transition-colors text-[10px]"
                  title="Segarkan Data"
                >
                  🔄
                </button>
              </div>

              <p className="text-[11px] text-amber-800 leading-tight">
                Buat tagihan resmi dengan diskon privat khusus admin & cetak ukuran A4.
              </p>

              <button
                type="button"
                onClick={() => onOpenInvoiceModal?.()}
                className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Terbitkan Invoice Baru</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenInvoiceEditorModal?.()}
                className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer border border-slate-700"
                title="Kustomisasi Tata Letak, Logo & Warna Invoice A4"
              >
                <Sliders size={13} className="text-amber-400" />
                <span>Desain Layout Invoice</span>
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[9px] uppercase font-bold text-amber-600 block">Belum Lunas</span>
                <span className="text-sm font-black text-slate-800">
                  {sidebarInvoices.filter(i => (i.payment_status || '').toUpperCase() === 'UNPAID').length}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[9px] uppercase font-bold text-emerald-600 block">Lunas (Paid)</span>
                <span className="text-sm font-black text-slate-800">
                  {sidebarInvoices.filter(i => (i.payment_status || '').toUpperCase() === 'PAID').length}
                </span>
              </div>
            </div>

            {/* Invoice List Items in Sidebar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Daftar Tagihan Tenant:
                </span>
                <button
                  type="button"
                  onClick={() => onOpenInvoiceModal?.()}
                  className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                >
                  Buka Lengkap ↗
                </button>
              </div>

              {loadingInvoices ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Memuat invoice...
                </div>
              ) : sidebarInvoices.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <FileText size={24} className="mx-auto text-slate-300 mb-1" />
                  <p className="text-xs font-semibold text-slate-600">Belum ada invoice</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Klik tombol di atas untuk menerbitkan invoice pertama.</p>
                </div>
              ) : (
                sidebarInvoices.map((inv) => {
                  const isPaid = (inv.payment_status || '').toUpperCase() === 'PAID';
                  const hasDiscount = Boolean(inv.discount_amount && inv.discount_amount > 0);

                  return (
                    <div
                      key={inv.id}
                      onClick={() => onOpenInvoiceModal?.()}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-amber-300 hover:shadow-xs transition-all cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-slate-900 text-xs truncate">
                          {inv.invoice_number}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${
                          isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300'
                        }`}>
                          {isPaid ? 'LUNAS' : 'UNPAID'}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {inv.company_name}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        {inv.booth_code ? (
                          <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 text-[10px]">
                            Booth #{inv.booth_code}
                          </span>
                        ) : (
                          <span>Manual</span>
                        )}
                        <span className="font-mono font-bold text-slate-900">
                          Rp {(inv.total_amount || 0).toLocaleString('id-ID')}
                        </span>
                      </div>

                      {hasDiscount && (
                        <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 truncate">
                          🔒 Diskon: -Rp {(inv.discount_amount || 0).toLocaleString('id-ID')}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Full Manager Button */}
            <button
              type="button"
              onClick={() => onOpenInvoiceModal?.()}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={13} />
              <span>Buka Layar Penuh & Cetak A4</span>
            </button>
          </div>
        )}

        {/* TAB 7: SHAPES & ANNOTATIONS */}
        {!elementSearch.trim() && activeTab === 'shapes' && (
          <div className="space-y-3">
            {!isOps && (
              <>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Bentuk & Anotasi Vektor
                  </span>
                  <span className="text-[10px] text-slate-400">11 Bentuk</span>
                </div>
                <p className="text-xs text-slate-500 px-1">
                  Pilih bentuk geometris atau simbol untuk menandai denah. Klik atau drag langsung ke kanvas.
                </p>
                <div className="flex justify-center p-2 bg-slate-50 rounded-2xl border border-slate-200">
                  <ShapePalette onAddShape={onAddBasicShape} isSidebar={true} />
                </div>
              </>
            )}
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">Teks & Pengukuran</div>
              <ElementCard id="text_label" onAdd={(id) => onAddLibraryElement?.(id)} />
              <ElementCard id="textbox" onAdd={(id) => onAddLibraryElement?.(id)} />
              <ElementCard id="measure" onAdd={(id) => onAddLibraryElement?.(id)} />
            </div>
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">Bentuk</div>
              {['shape_rect', 'shape_triangle', 'shape_parallelogram', 'shape_ellipse'].map(id => (
                <ElementCard key={id} id={id} onAdd={(elId) => onAddLibraryElement?.(elId)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer scale indicator with dynamic scale */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Grid size={13} className="text-slate-400" />
          <span>Skala: <b>{gridScale}px = 1m</b></span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 font-semibold rounded">
          Ctrl + Drag = Copy
        </span>
      </div>
    </aside>
  );
}
