import * as fabric from 'fabric';
import { applyDoorBehavior } from './doorSymbols';
import { isLibraryElement, applyLibraryBehavior } from './elementLibrary';
import { isCaptionable, customCaption, captionText } from './elementCaptions';
import { fitTenantName, nameDirectionOf, maxNameSize, MIN_NAME_M, NAME_FONT_FAMILY } from './boothNameFit';

export const DEFAULT_GRID_SCALE = 20; // 20px = 1 meter (1 grid box = 1 meter)

export const DEFAULT_BOOTH_CATEGORIES = {
  Standard: { key: 'Standard', name: 'Standard (3x3m)', widthM: 3, heightM: 3, defaultPrice: 5000000, color: '#3b82f6', border: '#1d4ed8' },
  Corner: { key: 'Corner', name: 'Corner Booth (3x3m)', widthM: 3, heightM: 3, defaultPrice: 7500000, color: '#06b6d4', border: '#0891b2' },
  Premium: { key: 'Premium', name: 'Premium (6x3m)', widthM: 6, heightM: 3, defaultPrice: 12000000, color: '#8b5cf6', border: '#6d28d9' },
  Island: { key: 'Island', name: 'VIP Island (6x6m)', widthM: 6, heightM: 6, defaultPrice: 25000000, color: '#f59e0b', border: '#d97706' },
  Free: { key: 'Free', name: 'Free / Additional (Gratis)', widthM: 2, heightM: 2, defaultPrice: 0, color: '#10b981', border: '#059669', isFree: true, desc: 'Booth gratis / sponsor / fasilitas tambahan (Rp 0)' },
  Custom: { key: 'Custom', name: 'Custom Shape', widthM: 4, heightM: 4, defaultPrice: 10000000, color: '#ec4899', border: '#be185d' }
};

export const BOOTH_CATEGORIES = { ...DEFAULT_BOOTH_CATEGORIES };

export function updateBoothCategoriesRegistry(categories) {
  if (!categories) return BOOTH_CATEGORIES;
  const catMap = Array.isArray(categories) 
    ? categories.reduce((acc, c) => {
        if (!c || !c.key) return acc;
        acc[c.key] = {
          id: c.id || `cat_${c.key}`,
          key: c.key,
          name: c.name || c.key,
          widthM: parseFloat(c.widthM || c.width_m) || 3,
          heightM: parseFloat(c.heightM || c.height_m) || 3,
          defaultPrice: parseInt(c.defaultPrice !== undefined ? c.defaultPrice : c.default_price, 10) || 0,
          color: c.color || '#3b82f6',
          border: c.border || c.borderColor || c.border_color || '#1d4ed8',
          isFree: Boolean(c.isFree || c.is_free),
          desc: c.description || c.desc || ''
        };
        return acc;
      }, {})
    : categories;

  for (const k of Object.keys(BOOTH_CATEGORIES)) {
    delete BOOTH_CATEGORIES[k];
  }
  Object.assign(BOOTH_CATEGORIES, catMap);

  // Guarantee that Standard category always exists as a safe fallback
  if (!BOOTH_CATEGORIES.Standard) {
    BOOTH_CATEGORIES.Standard = { ...DEFAULT_BOOTH_CATEGORIES.Standard };
  }

  return BOOTH_CATEGORIES;
}

export const BOOTH_SHAPES = {
  rectangle: {
    id: 'rectangle',
    name: 'Kotak Standar',
    tag: 'Standar 90°',
    desc: 'Booth 4 sudut siku standar pameran',
    icon: 'Square'
  },
  rounded: {
    id: 'rounded',
    name: 'Sudut Membulat',
    tag: 'Modern / Pill',
    desc: 'Desain modern dengan sudut lengkung halus',
    icon: 'Circle'
  },
  l_shape: {
    id: 'l_shape',
    name: 'Bentuk L',
    tag: 'Corner Hook',
    desc: 'Booth siku sudut 2 sisi lorong terbuka',
    icon: 'CornerDownRight'
  },
  island_open: {
    id: 'island_open',
    name: 'Pulau Terbuka',
    tag: '4-Side Open',
    desc: 'VIP Island 4 arah terbuka tanpa partisi dinding',
    icon: 'Maximize'
  },
  hexagon: {
    id: 'hexagon',
    name: 'Heksagon / Poligon',
    tag: 'Tech Pavilion',
    desc: 'Pavilion futuristik poligon heksagonal',
    icon: 'Hexagon'
  }
};

export const STATUS_CONFIG = {
  available: {
    label: 'Available',
    bg: '#ecfdf5',
    border: '#10b981',
    text: '#065f46',
    pillBg: '#10b981',
    pillText: '#ffffff'
  },
  reserved: {
    label: 'Reserved',
    bg: '#fffbeb',
    border: '#f59e0b',
    text: '#92400e',
    pillBg: '#f59e0b',
    pillText: '#ffffff'
  },
  sold: {
    label: 'Sold',
    bg: '#fef2f2',
    border: '#ef4444',
    text: '#991b1b',
    pillBg: '#ef4444',
    pillText: '#ffffff'
  },
  maintenance: {
    label: 'Maintenance',
    bg: '#f1f5f9',
    border: '#64748b',
    text: '#334155',
    pillBg: '#64748b',
    pillText: '#ffffff'
  }
};

// Comprehensive Venue Templates with Vector Walls and Infrastructure
export const VENUE_TEMPLATES = {
  // 🧱 1. Walls & Structures (Vector Lines & Partitions)
  wall_line: {
    category: 'structures',
    title: 'Dinding Garis Vektor (Vector Wall)',
    widthM: 6,
    heightM: 0.3,
    bg: '#1e293b',
    border: '#0f172a',
    strokeWidth: 4,
    text: '━━━ WALL',
    desc: 'Dinding garis vektor presisi tinggi (resolusi tajam)'
  },
  wall: {
    category: 'structures',
    title: 'Dinding Partisi Aula (5m)',
    widthM: 5,
    heightM: 0.4,
    bg: '#334155',
    border: '#0f172a',
    strokeWidth: 2,
    text: '━ PARTITION WALL',
    desc: 'Partisi pembatas antar hall/blok pameran'
  },
  pillar: {
    category: 'structures',
    title: 'Tiang Gedung (Structural Column)',
    widthM: 2,
    heightM: 2,
    bg: '#334155',
    border: '#0f172a',
    strokeWidth: 2,
    text: '■ PILLAR',
    desc: 'Kolom struktur bangunan gedung'
  },
  exit: {
    category: 'structures',
    title: 'Pintu Darurat & Evakuasi K3',
    widthM: 4,
    heightM: 1.8,
    bg: '#052e16',
    border: '#22c55e',
    strokeWidth: 2,
    text: '🚨 EMERGENCY EXIT',
    desc: 'Jalur evakuasi keselamatan wajib K3'
  },
  stairs: {
    category: 'structures',
    title: 'Tangga / Elevasi Lantai',
    widthM: 3,
    heightM: 2,
    bg: '#e2e8f0',
    border: '#94a3b8',
    strokeWidth: 2,
    text: '🪜 ELEVATION STAIRS',
    desc: 'Beda ketinggian lantai pameran'
  },

  // ⚡ 2. Utilitas & Infrastruktur Gedung
  floorbox: {
    category: 'utilities',
    title: 'Floor Box (Listrik & LAN)',
    widthM: 1.5,
    heightM: 1.5,
    bg: '#fffbeb',
    border: '#f59e0b',
    strokeWidth: 2,
    text: '⚡ FLOOR BOX',
    desc: 'Main power drop, LAN, water inlet'
  },
  apar: {
    category: 'utilities',
    title: 'APAR (Alat Pemadam Api Ringan)',
    widthM: 1,
    heightM: 1,
    bg: '#fef2f2',
    border: '#ef4444',
    strokeWidth: 2,
    text: '🧯 APAR K3',
    desc: 'Wajib penempatan standar keselamatan K3'
  },
  hydrant: {
    category: 'utilities',
    title: 'Hydrant & Pos Medis P3K',
    widthM: 2,
    heightM: 1.5,
    bg: '#eff6ff',
    border: '#3b82f6',
    strokeWidth: 2,
    text: '🚰 HYDRANT / P3K',
    desc: 'Akses pemadam dan pertolongan medis'
  },
  waste: {
    category: 'utilities',
    title: 'Bin Center / Tempat Sampah',
    widthM: 2.5,
    heightM: 2,
    bg: '#f8fafc',
    border: '#64748b',
    strokeWidth: 2,
    text: '🗑️ BIN CENTER',
    desc: 'Waste disposal & transit sampah'
  },

  // 📐 3. Struktur & Rigging Panggung
  stage: {
    category: 'stage',
    title: 'Panggung Utama (Main Stage)',
    widthM: 12,
    heightM: 6,
    bg: '#1e1b4b',
    border: '#6366f1',
    strokeWidth: 2,
    text: '🎤 MAIN STAGE',
    desc: 'Panggung seminar & opening ceremony'
  },
  rigging: {
    category: 'stage',
    title: 'Rigging / Box Truss Overhead',
    widthM: 10,
    heightM: 1.2,
    bg: '#334155',
    border: '#94a3b8',
    strokeWidth: 2,
    text: '🏗️ RIGGING TRUSS',
    desc: 'Gantungan lampu & sound overhead'
  },
  sound: {
    category: 'stage',
    title: 'Sound System / Line Array',
    widthM: 2,
    heightM: 2.5,
    bg: '#0f172a',
    border: '#38bdf8',
    strokeWidth: 2,
    text: '🔊 LINE ARRAY',
    desc: 'Speaker tower audio panggung'
  },
  lighting: {
    category: 'stage',
    title: 'Lighting Tower / Follow Spot',
    widthM: 2,
    heightM: 2,
    bg: '#312e81',
    border: '#a855f7',
    strokeWidth: 2,
    text: '💡 SPOTLIGHT',
    desc: 'Menara lampu sorot panggung'
  },
  foh: {
    category: 'stage',
    title: 'FOH Control & Kamera',
    widthM: 4,
    heightM: 3,
    bg: '#18181b',
    border: '#52525b',
    strokeWidth: 2,
    text: '🎛️ FOH AUDIO VISUAL',
    desc: 'Meja operator sound, lighting & live feed'
  },

  // 🍽️ 4. Fasilitas Pengunjung & Operasional
  regdesk: {
    category: 'amenities',
    title: 'Information / Registration Counter',
    widthM: 5,
    heightM: 2,
    bg: '#f0fdf4',
    border: '#22c55e',
    strokeWidth: 2,
    text: 'ℹ️ REGISTRATION',
    desc: 'Meja registrasi & penukaran badge'
  },
  toilet: {
    category: 'amenities',
    title: 'Toilet & Restroom Zones',
    widthM: 4,
    heightM: 3,
    bg: '#ecfeff',
    border: '#06b6d4',
    strokeWidth: 2,
    text: '🚻 RESTROOM ZONE',
    desc: 'Toilet pria, wanita, & disabilitas'
  },
  atm: {
    category: 'amenities',
    title: 'ATM Center & Charging Station',
    widthM: 3,
    heightM: 2,
    bg: '#faf5ff',
    border: '#c084fc',
    strokeWidth: 2,
    text: '🏧 ATM & CHARGING',
    desc: 'Fasilitas umum pengunjung'
  },
  signage: {
    category: 'amenities',
    title: 'Signage & Wayfinding (You Are Here)',
    widthM: 1.5,
    heightM: 1.5,
    bg: '#fff7ed',
    border: '#ea580c',
    strokeWidth: 2,
    text: '📍 SIGNAGE',
    desc: 'Papan petunjuk arah & denah lokasi'
  },
  plants: {
    category: 'amenities',
    title: 'Tanaman Dekorasi / Greenery',
    widthM: 1.5,
    heightM: 1.5,
    bg: '#ecfdf5',
    border: '#059669',
    strokeWidth: 2,
    text: '🪴 GREENERY',
    desc: 'Elemen estetika & pembatas lorong'
  },

  // 🚚 5. Area Logistik & Loading
  loading: {
    category: 'logistics',
    title: 'Loading Dock / Bongkar Muat',
    widthM: 8,
    heightM: 4,
    bg: '#451a03',
    border: '#f97316',
    strokeWidth: 2,
    text: '🚛 LOADING DOCK',
    desc: 'Akses truk kontainer logistik'
  },
  storage: {
    category: 'logistics',
    title: 'Gudang Panitia / Storage',
    widthM: 5,
    heightM: 4,
    bg: '#1e293b',
    border: '#64748b',
    strokeWidth: 2,
    text: '📦 GUDANG STORAGE',
    desc: 'Penyimpanan barang & kardus tenant'
  },
  greenroom: {
    category: 'logistics',
    title: 'Green Room (VIP & Artist Transit)',
    widthM: 6,
    heightM: 4,
    bg: '#14532d',
    border: '#4ade80',
    strokeWidth: 2,
    text: '🧑‍💼 GREEN ROOM VIP',
    desc: 'Ruang transit pembicara & artis'
  },
  security: {
    category: 'logistics',
    title: 'Security Post / Pos Satpam',
    widthM: 2.5,
    heightM: 2.5,
    bg: '#030712',
    border: '#dc2626',
    strokeWidth: 2,
    text: '🔒 SECURITY POST',
    desc: 'Titik pengawasan keamanan'
  }
};

// 🪑 5. Furniture & Seating (Kursi)
export const FURNITURE_TEMPLATES = {
  chair_square: {
    category: 'furniture',
    title: 'Kursi Persegi',
    widthM: 0.5,
    heightM: 0.5,
    bg: '#ffffff',
    border: '#475569',
    strokeWidth: 2,
    text: '',
    desc: 'Kursi standar (kotak)',
    svgPath: 'M -25 -25 h 50 v 50 h -50 z M -20 -20 h 40 v 15 h -40 z'
  },
  chair_round: {
    category: 'furniture',
    title: 'Kursi Bulat',
    widthM: 0.5,
    heightM: 0.5,
    bg: '#ffffff',
    border: '#475569',
    strokeWidth: 2,
    text: '',
    desc: 'Kursi cafe (bulat)',
    svgPath: 'M 0 -25 A 25 25 0 1 1 -0.1 -25 Z M -20 -15 C -20 -25 20 -25 20 -15 V -5 C 20 5 -20 5 -20 -5 Z'
  },
  chair_office: {
    category: 'furniture',
    title: 'Kursi Kantor',
    widthM: 0.6,
    heightM: 0.6,
    bg: '#ffffff',
    border: '#475569',
    strokeWidth: 2,
    text: '',
    desc: 'Kursi dengan sandaran tangan',
    svgPath: 'M -20 -15 h 40 v 30 h -40 z M -25 -25 h 50 v 15 h -50 z M -30 -10 h 10 v 20 h -10 z M 20 -10 h 10 v 20 h -10 z'
  },
  chair_lounge: {
    category: 'furniture',
    title: 'Sofa / Lounge',
    widthM: 0.8,
    heightM: 0.7,
    bg: '#ffffff',
    border: '#475569',
    strokeWidth: 2,
    text: '',
    desc: 'Sofa single elegan',
    svgPath: 'M -20 -5 h 40 v 30 h -40 z M -30 -20 C -20 -35 20 -35 30 -20 V 10 C 30 15 25 20 20 20 H -20 C -25 20 -30 15 -30 10 Z'
  },
  chair_dining: {
    category: 'furniture',
    title: 'Kursi Makan',
    widthM: 0.5,
    heightM: 0.5,
    bg: '#ffffff',
    border: '#475569',
    strokeWidth: 2,
    text: '',
    desc: 'Kursi banquet melengkung',
    svgPath: 'M -20 -10 C -10 -20 10 -20 20 -10 V 25 H -20 Z M -25 -25 C -15 -35 15 -35 25 -25 V -15 C 15 -25 -15 -25 -25 -15 Z'
  }
};

// Shape Catalog: 11 Geometric Shapes & Annotations
export const BASIC_SHAPES = [
  { id: 'rect', label: 'Kotak (Rectangle)', category: 'basic' },
  { id: 'circle', label: 'Lingkaran (Circle)', category: 'basic' },
  { id: 'diamond', label: 'Belah Ketupat (Diamond)', category: 'basic' },
  { id: 'triangle', label: 'Segitiga (Triangle)', category: 'basic' },
  { id: 'star', label: 'Bintang (5-Point Star)', category: 'symbol' },
  { id: 'cross', label: 'Palang Medis (Cross)', category: 'symbol' },
  { id: 'arrow_left', label: 'Panah Kiri (Left Arrow)', category: 'arrow' },
  { id: 'arrow_right', label: 'Panah Kanan (Right Arrow)', category: 'arrow' },
  { id: 'speech_bubble', label: 'Balon Kata (Speech Bubble)', category: 'annotation' },
  { id: 'line', label: 'Garis Lurus (Line)', category: 'line' },
  { id: 'arrow_line', label: 'Garis Berpanah (Arrow Line)', category: 'line' }
];

// Factory to create any of the 11 basic shapes
export function createBasicShapeObject(shapeId, {
  left = 200,
  top = 200,
  gridScale = DEFAULT_GRID_SCALE,
  fill = '#ffffff',
  stroke = '#0f172a'
} = {}) {
  let shapeObj;
  const commonOpts = {
    fill,
    stroke,
    strokeWidth: 2,
    strokeUniform: true,
    noScaleCache: true,
    objectCaching: false,
    originX: 'center',
    originY: 'center',
    cornerColor: '#2563eb',
    cornerSize: 8,
    transparentCorners: false
  };

  switch (shapeId) {
    case 'rect':
      shapeObj = new fabric.Rect({
        ...commonOpts,
        width: 60,
        height: 60,
        rx: 4,
        ry: 4
      });
      break;

    case 'circle':
      shapeObj = new fabric.Circle({
        ...commonOpts,
        radius: 30
      });
      break;

    case 'diamond':
      shapeObj = new fabric.Polygon([
        { x: 30, y: 0 },
        { x: 60, y: 30 },
        { x: 30, y: 60 },
        { x: 0, y: 30 }
      ], {
        ...commonOpts
      });
      break;

    case 'triangle':
      shapeObj = new fabric.Triangle({
        ...commonOpts,
        width: 60,
        height: 52
      });
      break;

    case 'star': {
      // 5-point star
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 30 : 13;
        points.push({
          x: 30 + r * Math.cos(angle),
          y: 30 + r * Math.sin(angle)
        });
      }
      shapeObj = new fabric.Polygon(points, {
        ...commonOpts
      });
      break;
    }

    case 'cross': {
      // Plus / Cross polygon
      const points = [
        { x: 20, y: 0 }, { x: 40, y: 0 },
        { x: 40, y: 20 }, { x: 60, y: 20 },
        { x: 60, y: 40 }, { x: 40, y: 40 },
        { x: 40, y: 60 }, { x: 20, y: 60 },
        { x: 20, y: 40 }, { x: 0, y: 40 },
        { x: 0, y: 20 }, { x: 20, y: 20 }
      ];
      shapeObj = new fabric.Polygon(points, {
        ...commonOpts
      });
      break;
    }

    case 'arrow_left': {
      const points = [
        { x: 0, y: 22 }, { x: 25, y: 0 },
        { x: 25, y: 12 }, { x: 60, y: 12 },
        { x: 60, y: 32 }, { x: 25, y: 32 },
        { x: 25, y: 44 }
      ];
      shapeObj = new fabric.Polygon(points, {
        ...commonOpts
      });
      break;
    }

    case 'arrow_right': {
      const points = [
        { x: 0, y: 12 }, { x: 35, y: 12 },
        { x: 35, y: 0 }, { x: 60, y: 22 },
        { x: 35, y: 44 }, { x: 35, y: 32 },
        { x: 0, y: 32 }
      ];
      shapeObj = new fabric.Polygon(points, {
        ...commonOpts
      });
      break;
    }

    case 'speech_bubble': {
      // SVG path for speech bubble
      const pathStr = 'M 12 0 L 48 0 C 55 0 60 5 60 12 L 60 32 C 60 39 55 44 48 44 L 28 44 L 14 54 L 18 44 L 12 44 C 5 44 0 39 0 32 L 0 12 C 0 5 5 0 12 0 Z';
      shapeObj = new fabric.Path(pathStr, {
        ...commonOpts
      });
      break;
    }

    case 'line':
      // Draw horizontally and rotate so bounding box is tight
      shapeObj = new fabric.Line([0, 0, 78, 0], {
        stroke,
        strokeWidth: 2.5,
        strokeUniform: true,
        originX: 'center',
        originY: 'center',
        cornerColor: '#2563eb',
        cornerSize: 8,
        transparentCorners: false,
        angle: -39.8 // Diagonal angle
      });
      break;

    case 'arrow_line': {
      // Draw horizontally and rotate
      const line = new fabric.Line([0, 0, 65, 0], {
        stroke,
        strokeWidth: 2.5,
        strokeUniform: true,
        originX: 'center',
        originY: 'center'
      });
      const head = new fabric.Triangle({
        width: 14,
        height: 14,
        fill: stroke,
        originX: 'center',
        originY: 'center',
        left: 32.5,
        top: 0,
        angle: 90
      });
      shapeObj = new fabric.Group([line, head], {
        ...commonOpts,
        angle: -39.8
      });
      break;
    }


    default:
      shapeObj = new fabric.Rect({
        ...commonOpts,
        width: 50,
        height: 50
      });
  }

  shapeObj.set({ left, top });
  shapeObj.isBasicShape = true;
  shapeObj.shapeType = shapeId;

  return shapeObj;
}

/**
 * Proportional Booth Typography Calculator
 * Scales all text elements dynamically based on booth dimensions (pixelW, pixelH)
 * Guarantees zero text truncation/cut-off and proportional visual hierarchy:
 * - Large booths (e.g. 6x6m, 120px+) get bold, grand, highly visible typography
 * - Standard booths (3x3m, 60px) get clean, balanced typography
 * - Small booths (2x2m, 40px) get compact, readable typography
 * - Tenant names wrap cleanly into 2 lines if needed rather than cutting off with ellipses.
 */
export function getProportionalBoothTypography(pixelW, pixelH, {
  code = '',
  widthM = 3,
  heightM = 3,
  ownerName = '',
  status = 'available'
} = {}) {
  const w = Math.max(20, pixelW);
  const h = Math.max(20, pixelH);
  const minDim = Math.min(w, h);
  // Reference: 60px represents standard 3x3m at 20px/m
  const scale = minDim / 60;
  // Sub-linear scale power so text grows gracefully without overflowing or shrinking too small
  const scaleFactor = Math.pow(Math.max(0.4, scale), 0.78);

  const padX = Math.max(3, Math.round(w * 0.06));
  const padY = Math.max(3, Math.round(h * 0.06));

  const dimStr = `${widthM}x${heightM}m`;
  const codeStr = String(code || 'A-01').trim();
  const rawOwner = String(ownerName || '').trim();
  const statusStr = String(status || 'available').toUpperCase();

  // 1. Dimensions (Top-Left)
  const baseDimSize = Math.max(6, Math.round(8.5 * scaleFactor));
  const maxDimW = Math.max(8, (w * 0.42) - padX);
  const dimFontSize = Math.min(baseDimSize, Math.max(4.5, maxDimW / (Math.max(1, dimStr.length) * 0.62)));

  // 2. Booth Code (Top-Right)
  const baseCodeSize = Math.max(7, Math.round(11 * scaleFactor));
  const maxCodeW = Math.max(10, (w * 0.54) - padX);
  const codeFontSize = Math.min(baseCodeSize, Math.max(5, maxCodeW / (Math.max(1, codeStr.length) * 0.65)));

  // 3. Status (Bottom-Center)
  const baseStatusSize = Math.max(6, Math.round(8.5 * scaleFactor));
  const maxStatusW = Math.max(10, w - (padX * 2) - 4);
  const statusFontSize = Math.min(baseStatusSize, Math.max(4.5, maxStatusW / (Math.max(1, statusStr.length) * 0.62)));

  // 4. Owner / Tenant Name (Center) - Strictly bounded horizontally and vertically
  const baseOwnerSize = Math.max(7, Math.round(10.5 * scaleFactor));
  const maxOwnerW = Math.max(10, w - (padX * 2) - 4);
  const topClearance = Math.max(dimFontSize, codeFontSize) + Math.max(2, Math.round(h * 0.04)) + 3;
  const bottomClearance = statusFontSize + 3;
  const maxOwnerH = Math.max(6, h - (padY * 2) - topClearance - bottomClearance);

  let finalOwnerText = rawOwner;
  let ownerFontSize = baseOwnerSize;
  let isMultiLine = false;

  if (rawOwner) {
    const words = rawOwner.split(/\s+/).filter(Boolean);

    // If multi-word and too long for single line or booth dimensions suggest wrapping
    if (words.length >= 2) {
      // Find optimal split point that balances line lengths
      let minSplit = 1;
      if ((words[0].toUpperCase() === 'PT' || words[0].toUpperCase() === 'CV') && words.length > 2) {
        minSplit = 2;
      }
      let bestSplit = minSplit;
      let bestDiff = Infinity;
      for (let i = minSplit; i < words.length; i++) {
        const l1 = words.slice(0, i).join(' ');
        const l2 = words.slice(i).join(' ');
        const diff = Math.abs(l1.length - l2.length);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = i;
        }
      }

      const line1 = words.slice(0, bestSplit).join(' ');
      const line2 = words.slice(bestSplit).join(' ');
      const longestLine = Math.max(line1.length, line2.length);

      const singleEstW = rawOwner.length * baseOwnerSize * 0.62;
      const wrappedEstW = longestLine * baseOwnerSize * 0.62;

      // Wrap if single line overflows or wrapped version is significantly more legible
      if (singleEstW > maxOwnerW || (w >= 50 && h >= 45 && words.length > 2) || wrappedEstW < singleEstW * 0.75) {
        finalOwnerText = `${line1}\n${line2}`;
        isMultiLine = true;
        // Strictly fit longest line within maxOwnerW
        ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (longestLine * 0.62));
      } else {
        ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
      }
    } else {
      ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
    }

    // Height constraint: make sure multi-line or tall text never touches top dim/code or bottom status
    const linesCount = isMultiLine ? 2 : 1;
    const totalLineHeightUnits = linesCount * 1.15;
    if (ownerFontSize * totalLineHeightUnits > maxOwnerH) {
      ownerFontSize = Math.min(ownerFontSize, maxOwnerH / totalLineHeightUnits);
    }

    ownerFontSize = Math.max(4, ownerFontSize);
  }

  return {
    padX,
    padY,
    dimStr,
    codeStr,
    statusStr,
    finalOwnerText,
    dimFontSize,
    codeFontSize,
    ownerFontSize,
    statusFontSize,
    isMultiLine
  };
}

// Strict layout of booth internals ensuring text NEVER overflows the booth boundaries
// Layout specification:
// - Top-Left: Ukuran Booth (e.g. "3x3m")
// - Top-Right: Kode Booth (e.g. "A-01")
// - Center: Nama Pemilik Booth (e.g. "PT Telkom Indonesia" or "(Nama Pemilik)")
// - Bottom: Status Booth (e.g. "AVAILABLE")
// ---------- Sudut Booth (corner rounding, display only) ----------
// Percent of the booth's shortest side (0 = siku). Global per floorplan (metadata.display.boothCornerPct, kept on
// canvas.boothCornerPct) or per booth (boothData.cornerPct; null/undefined = "Ikuti Pengaturan Denah").
// Size, area, position, adjacency and price never depend on it.
export const BOOTH_CORNER_MAX_PCT = 50;
export const clampCornerPct = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(BOOTH_CORNER_MAX_PCT, Math.max(0, Math.round(n * 10) / 10)) : 0;
};
export const hasOwnCornerPct = (boothData) => boothData?.cornerPct !== undefined && boothData?.cornerPct !== null && boothData?.cornerPct !== '';

// Effective corner % of one booth. The legacy "Sudut Membulat" shape keeps a rounded look (20%) until an
// explicit value is set for the booth.
export function effectiveCornerPct(boothData, globalPct = 0) {
  if (hasOwnCornerPct(boothData)) return clampCornerPct(boothData.cornerPct);
  if (boothData?.shape === 'rounded') return 20;
  return clampCornerPct(globalPct);
}

// Radius in px: pct of the shortest side, never more than half of it
export const cornerRadiusPx = (pct, width, height) => {
  const shortest = Math.max(0, Math.min(width, height));
  return Math.min(shortest / 2, (clampCornerPct(pct) / 100) * shortest);
};

// Horizontal inset of a rounded corner at `depth` px below the top edge (keeps the top strip inside the corner)
const cornerInsetAt = (radius, depth) => {
  if (radius <= 0 || depth >= radius) return 0;
  const dy = radius - Math.max(0, depth);
  return radius - Math.sqrt(Math.max(0, radius * radius - dy * dy));
};

// Apply a corner % to a booth group: background rect radius + category strip that stays inside the corners
export function applyBoothCornerGeometry(group, pct) {
  const objects = typeof group?.getObjects === 'function' ? group.getObjects() : [];
  const bg = objects[0];
  const strip = objects[1];
  if (!bg || (bg.type || '').toLowerCase() !== 'rect') return false;
  const w = bg.width || group.width || 0;
  const h = bg.height || group.height || 0;
  const r = cornerRadiusPx(pct, w, h);
  let changed = false;
  if (Math.abs((bg.rx || 0) - r) > 0.01 || Math.abs((bg.ry || 0) - r) > 0.01) {
    bg.set({ rx: r, ry: r });
    changed = true;
  }
  if (strip && (strip.type || '').toLowerCase() === 'rect' && strip.height <= 8) {
    const depth = (strip.top - strip.height / 2) + h / 2;
    const stripW = Math.max(8, w - 2 * (cornerInsetAt(r, depth) + 3));
    const stripR = Math.min(2, strip.height / 2);
    if (Math.abs((strip.width || 0) - stripW) > 0.01 || strip.rx !== stripR) {
      strip.set({ width: stripW, rx: stripR, ry: stripR });
      changed = true;
    }
  }
  if (changed) group.dirty = true;
  return changed;
}

// Apply the floorplan setting to every booth of a canvas. Returns the number of booths redrawn.
export function applyBoothCorners(canvas, globalPct = 0) {
  if (!canvas) return 0;
  canvas.boothCornerPct = clampCornerPct(globalPct);
  let changed = 0;
  canvas.getObjects().forEach(o => {
    if (o.isBooth && o.boothData && applyBoothCornerGeometry(o, effectiveCornerPct(o.boothData, canvas.boothCornerPct))) changed++;
  });
  if (changed) canvas.requestRenderAll();
  return changed;
}

/**
 * Tenant name of a booth: ONE rule for every booth and every view (Studio, Denah Operasional, Live, exports; merged
 * groups use the same fitTenantName in boothMerge.js). The name fills the free area between the header (strip, size,
 * number) and the status with the largest font that fits, horizontal or vertical (bottom to top), decided from what
 * is seen on the screen: a rotated booth never shows the name upside down. `boothData.nameDirection` ("Arah Nama
 * Tenant": auto / horizontal / vertical) only fixes the direction; the size stays automatic.
 */
export function layoutTenantName(group, ownerText, {
  name, pixelWidth, pixelHeight, padX = 4, headerBottom, statusTop, gridScale = DEFAULT_GRID_SCALE, smallSize = 8, fill = '#0f172a', visible = true
}) {
  const minDim = Math.min(pixelWidth, pixelHeight);
  const gap = Math.max(2, minDim * 0.03);
  const top = headerBottom + gap;
  const bottom = statusTop - gap;
  const fit = visible
    ? fitTenantName(name, (pixelWidth - padX * 2) * 0.96, Math.max(1, bottom - top), {
      frameAngle: (group.angle || 0) + (group.group?.angle || 0),
      direction: nameDirectionOf(group.boothData),
      maxSize: maxNameSize(minDim, smallSize),
      minSize: gridScale * MIN_NAME_M,
      weight: '800',
      family: NAME_FONT_FAMILY
    })
    : null;
  // Cut with "…" at the minimum size: the full name stays in boothData (hover card / panel)
  group.__nameTruncated = Boolean(fit?.truncated);
  ownerText.set({
    left: 0,
    top: (top + bottom) / 2,
    angle: fit ? fit.localAngle : 0,
    text: fit ? fit.lines.join('\n') : String(name || ''),
    fontSize: fit ? fit.size : smallSize,
    fontFamily: NAME_FONT_FAMILY,
    fontWeight: '800',
    fontStyle: 'normal',
    textAlign: 'center',
    // Fabric multiplies the line height by 1.13: keep the same line spacing as the measurement
    lineHeight: fit ? fit.lineHeight / 1.13 : 1.05,
    fill,
    originX: 'center',
    originY: 'center',
    visible: Boolean(fit)
  });
  return fit;
}

export function layoutBoothInternals(group, {
  widthM = 3,
  heightM = 3,
  shape = 'rectangle',
  code = 'A-01',
  category = 'Standard',
  status = 'available',
  statusCfg,
  catColor,
  gridScale = DEFAULT_GRID_SCALE,
  ownerName = ''
}) {
  const pixelWidth = Math.max(16, Math.round(widthM * gridScale));
  const pixelHeight = Math.max(16, Math.round(heightM * gridScale));
  const resolvedStatusCfg = statusCfg || STATUS_CONFIG[status] || STATUS_CONFIG.available;
  const resolvedCatColor = catColor || BOOTH_CATEGORIES[category]?.border || '#3b82f6';
  const resolvedShape = shape || group.boothData?.shape || 'rectangle';

  const objects = group.getObjects();
  if (objects.length < 5) return;

  // Handle upgrade from legacy 5-element group to 6-element group seamlessly
  let bgRect = objects[0];
  let headerStrip = objects[1];
  let dimText, codeText, ownerText, statusText;

  if (objects.length === 5) {
    // Legacy: [bgRect, headerStrip, codeText, dimText, statusText]
    codeText = objects[2];
    dimText = objects[3];
    statusText = objects[4];
    ownerText = new fabric.FabricText(ownerName || '(Nama Pemilik)', {
      fontSize: 10,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fill: '#94a3b8',
      originX: 'center',
      originY: 'center'
    });
    group.add(ownerText);
  } else {
    // Current 6-element: [bgRect, headerStrip, dimText, codeText, ownerText, statusText]
    dimText = objects[2];
    codeText = objects[3];
    ownerText = objects[4];
    statusText = objects[5];
  }

  // 1. Background Rect: corners follow "Sudut Booth" (default siku), island booths keep their dashed border
  const cornerPct = effectiveCornerPct({ ...(group.boothData || {}), shape: resolvedShape }, group.canvas?.boothCornerPct ?? 0);
  const rx = cornerRadiusPx(cornerPct, pixelWidth, pixelHeight);
  const ry = rx;
  let strokeDashArray = null;
  let strokeWidth = 2;

  if (resolvedShape === 'island_open') {
    strokeDashArray = [6, 4];
    strokeWidth = 2.5;
  }

  bgRect.set({
    left: 0,
    top: 0,
    width: pixelWidth,
    height: pixelHeight,
    fill: resolvedStatusCfg.bg,
    stroke: resolvedStatusCfg.border,
    strokeWidth: strokeWidth,
    strokeDashArray: strokeDashArray,
    rx: rx,
    ry: ry,
    originX: 'center',
    originY: 'center',
    strokeUniform: true
  });

  // 2. Top Color Category Strip
  const stripH = Math.min(6, Math.max(3, Math.floor(pixelHeight * 0.08)));
  // The strip stays inside the booth's (rounded) corners, never sticking out
  const stripDepth = Math.min(5, stripH) - stripH / 2;
  const stripW = Math.max(8, pixelWidth - 2 * (cornerInsetAt(rx, stripDepth) + 3));
  headerStrip.set({
    left: 0,
    width: stripW,
    height: stripH,
    fill: resolvedCatColor,
    rx: Math.min(2, stripH / 2),
    ry: Math.min(2, stripH / 2),
    top: -(pixelHeight / 2) + Math.min(5, stripH),
    originX: 'center',
    originY: 'center',
    visible: pixelHeight >= 24
  });

  const halfW = pixelWidth / 2;
  const halfH = pixelHeight / 2;
  const headerSpace = pixelHeight >= 24 ? stripH + 4 : 4;
  const topY = -halfH + headerSpace;

  const isCustomOwner = Boolean(ownerName && String(ownerName).trim());
  const rawOwner = isCustomOwner ? String(ownerName).trim() : '(Nama Pemilik)';

  const typo = getProportionalBoothTypography(pixelWidth, pixelHeight, {
    code,
    widthM,
    heightM,
    ownerName: rawOwner,
    status
  });

  const canShowHeaderItems = pixelWidth >= 30 && pixelHeight >= 22;
  const canShowOwner = pixelWidth >= 28 && pixelHeight >= 24;
  const canShowStatus = pixelHeight >= 46 && pixelWidth >= 36;

  // 3. Top-Left: Ukuran Booth (dimText)
  dimText.set({
    left: -halfW + typo.padX,
    top: topY,
    text: typo.dimStr,
    fontSize: typo.dimFontSize,
    fill: '#475569',
    originX: 'left',
    originY: 'top',
    visible: canShowHeaderItems
  });

  // 4. Top-Right: Kode Booth (codeText)
  codeText.set({
    left: halfW - typo.padX,
    top: topY,
    text: typo.codeStr,
    fontSize: typo.codeFontSize,
    fontWeight: 'bold',
    fill: '#0f172a',
    originX: 'right',
    originY: 'top',
    visible: canShowHeaderItems
  });

  // 5. Center: tenant name, laid out by the one shared rule (layoutTenantName above)
  const headerBottom = topY + (canShowHeaderItems ? Math.max(typo.dimFontSize, typo.codeFontSize) * 1.15 : 0);
  const statusTop = halfH - typo.padY - (canShowStatus ? typo.statusFontSize * 1.1 : 0);
  if (isCustomOwner) {
    layoutTenantName(group, ownerText, {
      name: rawOwner, pixelWidth, pixelHeight, padX: typo.padX, headerBottom, statusTop, gridScale,
      smallSize: Math.max(typo.dimFontSize, typo.codeFontSize), visible: canShowOwner
    });
  } else {
    // Placeholder of an empty booth: always horizontal and small
    ownerText.set({
      left: 0,
      top: typo.isMultiLine ? 0 : (canShowHeaderItems ? 1 : 0),
      angle: 0,
      text: typo.finalOwnerText,
      fontSize: typo.ownerFontSize,
      fontWeight: 'normal',
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 1.05,
      fill: '#94a3b8',
      originX: 'center',
      originY: 'center',
      visible: canShowOwner
    });
  }

  // 6. Bottom-Center: Status (statusText)
  statusText.set({
    left: 0,
    top: halfH - typo.padY,
    text: typo.statusStr,
    fontSize: typo.statusFontSize,
    fontWeight: 'bold',
    fill: resolvedStatusCfg.pillBg,
    originX: 'center',
    originY: 'bottom',
    visible: canShowStatus
  });

  // Update Group Dimensions
  group.set({
    width: pixelWidth,
    height: pixelHeight,
    scaleX: 1,
    scaleY: 1
  });
  group.setCoords();
  group.dirty = true;
}

// Create an interactive Booth Group with strict boundary clipping & unscaled border
export function createBoothObject({
  code = 'A-01',
  category = 'Standard',
  shape = 'rectangle',
  status = 'available',
  price = null,
  widthM = 3,
  heightM = 3,
  left = 100,
  top = 100,
  gridScale = DEFAULT_GRID_SCALE,
  ownerName = ''
}) {
  const catConfig = BOOTH_CATEGORIES[category] || BOOTH_CATEGORIES.Standard;
  const resolvedPrice = (price !== null && price !== undefined) ? price : (catConfig?.defaultPrice || 5000000);
  const pixelWidth = Math.max(20, widthM * gridScale);
  const pixelHeight = Math.max(20, heightM * gridScale);
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
  const catColor = catConfig?.border || '#3b82f6';

  const bgRect = new fabric.Rect({
    width: pixelWidth,
    height: pixelHeight,
    fill: statusCfg.bg,
    stroke: statusCfg.border,
    strokeWidth: 2,
    strokeUniform: true,
    rx: 0,
    ry: 0,
    originX: 'center',
    originY: 'center',
    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.06)', blur: 6, offsetX: 0, offsetY: 2 })
  });

  const headerStrip = new fabric.Rect({
    width: Math.max(10, pixelWidth - 4),
    height: 6,
    fill: catColor,
    rx: 2,
    ry: 2,
    top: -(pixelHeight / 2) + 5,
    originX: 'center',
    originY: 'center',
    strokeUniform: true
  });

  // Top-left: Ukuran Booth (e.g. "3x3m")
  const dimText = new fabric.FabricText(`${widthM}x${heightM}m`, {
    fontSize: 9,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fill: '#475569',
    originX: 'left',
    originY: 'top'
  });

  // Top-right: Kode Booth (e.g. "A-01")
  const codeText = new fabric.FabricText(code, {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fill: '#0f172a',
    originX: 'right',
    originY: 'top'
  });

  // Center: Nama Pemilik Booth (e.g. "PT Telkom Indonesia" or "(Nama Pemilik)")
  const ownerText = new fabric.FabricText(ownerName || '(Nama Pemilik)', {
    fontSize: 11,
    fontWeight: ownerName ? 'bold' : 'normal',
    fontStyle: ownerName ? 'normal' : 'italic',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fill: ownerName ? '#0f172a' : '#94a3b8',
    originX: 'center',
    originY: 'center'
  });

  // Bottom: Status (e.g. "AVAILABLE")
  const statusText = new fabric.FabricText(status.toUpperCase(), {
    fontSize: 8,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fill: statusCfg.pillText,
    originX: 'center',
    originY: 'bottom'
  });

  const group = new fabric.Group([bgRect, headerStrip, dimText, codeText, ownerText, statusText], {
    left,
    top,
    subTargetCheck: false,
    cornerColor: '#2563eb',
    cornerSize: 8,
    transparentCorners: false,
    borderColor: '#3b82f6',
    borderScaleFactor: 2,
    strokeUniform: true,
    noScaleCache: true,
    objectCaching: false
  });

  layoutBoothInternals(group, {
    widthM,
    heightM,
    shape,
    code,
    category,
    status,
    statusCfg,
    catColor,
    gridScale,
    ownerName
  });

  group.isBooth = true;
  group.boothData = {
    id: `booth_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    category,
    shape,
    status,
    price: resolvedPrice,
    widthM,
    heightM,
    gridScale,
    ownerName: ownerName || ''
  };

  return group;
}

// Update existing booth appearance and layout (supporting direct width/height edits)
export function updateBoothAppearance(group, newProps) {
  if (!group || !group.isBooth) return;

  const current = group.boothData || {};
  const updated = { ...current, ...newProps };
  group.boothData = updated;

  const statusCfg = STATUS_CONFIG[updated.status] || STATUS_CONFIG.available;
  const catColor = BOOTH_CATEGORIES[updated.category]?.border || '#3b82f6';

  // The rotation is applied first: the tenant name's direction is decided from the booth as seen on the screen
  if (newProps.angle !== undefined) group.set('angle', newProps.angle);

  layoutBoothInternals(group, {
    widthM: parseFloat(updated.widthM) || 3,
    heightM: parseFloat(updated.heightM) || 3,
    shape: updated.shape || current.shape || 'rectangle',
    code: updated.code,
    category: updated.category,
    status: updated.status,
    statusCfg,
    catColor,
    gridScale: updated.gridScale || DEFAULT_GRID_SCALE,
    ownerName: updated.ownerName !== undefined ? updated.ownerName : (current.ownerName || '')
  });

  if (newProps.angle !== undefined) {
    group.set('angle', newProps.angle);
    group.setCoords();
  }

  group.dirty = true;
  group.canvas?.requestRenderAll();
}

// Normalize a scaled object so border width never changes, geometry is native vector, and text never overflows
export function normalizeScaledObject(obj, gridScale = DEFAULT_GRID_SCALE) {
  if (!obj) return;
  // Doors and library elements are redrawn at their new size by the editor, never stretched here
  if (obj.venueData?.type === 'door' || isLibraryElement(obj)) return;
  // Only a real resize is normalized: a plain move must never change size, label font or drawing
  if (Math.abs((obj.scaleX || 1) - 1) < 0.001 && Math.abs((obj.scaleY || 1) - 1) < 0.001) return;

  const newWidth = Math.round(obj.width * (obj.scaleX || 1));
  const newHeight = Math.round(obj.height * (obj.scaleY || 1));

  if (newWidth <= 0 || newHeight <= 0) return;

  const widthM = parseFloat((newWidth / gridScale).toFixed(1));
  const heightM = parseFloat((newHeight / gridScale).toFixed(1));

  if (obj.isBooth && obj.boothData) {
    obj.boothData.widthM = widthM;
    obj.boothData.heightM = heightM;

    const statusCfg = STATUS_CONFIG[obj.boothData.status] || STATUS_CONFIG.available;
    const catColor = BOOTH_CATEGORIES[obj.boothData.category]?.border || '#3b82f6';

    layoutBoothInternals(obj, {
      widthM,
      heightM,
      shape: obj.boothData.shape || 'rectangle',
      code: obj.boothData.code,
      category: obj.boothData.category,
      status: obj.boothData.status,
      statusCfg,
      catColor,
      gridScale,
      ownerName: obj.boothData.ownerName || ''
    });
  } else if (obj.isVenueItem && obj.venueData) {
    obj.venueData.widthM = widthM;
    obj.venueData.heightM = heightM;
    obj.venueData.width = newWidth;
    obj.venueData.height = newHeight;

    const objects = obj.getObjects();
    if (objects.length >= 1) {
      const shape = objects[0];
      const labelText = objects[1];
      
      if (shape instanceof fabric.Path) {
        shape.set({
          scaleX: newWidth / 50,
          scaleY: newHeight / 50
        });
      } else if (shape && shape.set) {
        shape.set({
          width: newWidth,
          height: newHeight
        });
      }

      if (labelText) {
        const labelStr = String(obj.venueData.label || labelText.text || '');
        const maxLabelWidth = Math.max(10, newWidth - 8);
        const fitLabelFont = Math.floor(maxLabelWidth / (labelStr.length * 0.65));
        const maxFontHeight = Math.floor(newHeight * 0.5);
        const labelFont = Math.max(6, Math.min(13, Math.min(fitLabelFont, maxFontHeight)));

        let displayLabel = labelStr;
        if (displayLabel.length * 0.65 * labelFont > maxLabelWidth && displayLabel.length > 3) {
          while (displayLabel.length > 2 && (displayLabel.length + 1) * 0.65 * labelFont > maxLabelWidth) {
            displayLabel = displayLabel.slice(0, -1);
          }
          displayLabel += '…';
        }

        labelText.set({
          text: displayLabel,
          fontSize: labelFont,
          visible: newHeight >= 14 && newWidth >= 24
        });
      }
    }

    obj.set({
      width: newWidth,
      height: newHeight,
      scaleX: 1,
      scaleY: 1
    });
  } else if (obj.isBasicShape) {
    // Basic shapes: preserve crisp vector scaling
    obj.set({
      width: newWidth,
      height: newHeight,
      scaleX: 1,
      scaleY: 1
    });
  }

  obj.setCoords();
  obj.canvas?.requestRenderAll();
}

// Create Venue Facility Object
export function createVenueObject({
  type = 'stage',
  left = 200,
  top = 200,
  gridScale = DEFAULT_GRID_SCALE,
  customLabel = null
}) {
  const config = VENUE_TEMPLATES[type] || FURNITURE_TEMPLATES[type] || VENUE_TEMPLATES.stage;
  const widthM = config.widthM || 3;
  const heightM = config.heightM || 2;
  const width = Math.max(10, widthM * gridScale);
  const height = Math.max(6, heightM * gridScale);

  const isRound = type === 'pillar' || type === 'plants' || type === 'apar';
  const isWall = type === 'wall' || type === 'wall_line';

  let shape;
  
  if (config.svgPath) {
    shape = new fabric.Path(config.svgPath, {
      fill: config.bg,
      stroke: config.border,
      strokeWidth: config.strokeWidth || 2,
      scaleX: width / 50,
      scaleY: height / 50,
      originX: 'center',
      originY: 'center',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.12)', blur: 6, offsetX: 0, offsetY: 2 })
    });
  } else {
    shape = new fabric.Rect({
      width,
      height,
      fill: config.bg,
      stroke: config.border,
    strokeWidth: config.strokeWidth || 2,
    strokeUniform: true,
    rx: isRound ? Math.min(width, height) / 2 : isWall ? 2 : 6,
    ry: isRound ? Math.min(width, height) / 2 : isWall ? 2 : 6,
    originX: 'center',
    originY: 'center',
    shadow: isWall ? undefined : new fabric.Shadow({ color: 'rgba(0,0,0,0.12)', blur: 6, offsetX: 0, offsetY: 2 })
  });
  }

  const labelStr = String(customLabel || config.text);
  const maxLabelWidth = Math.max(10, width - 8);
  const fitFontWidth = Math.floor(maxLabelWidth / (labelStr.length * 0.65));
  const maxFontHeight = Math.floor(height * 0.55);
  const labelFont = Math.max(6, Math.min(12, Math.min(fitFontWidth, maxFontHeight)));

  let displayLabel = labelStr;
  if (displayLabel.length * 0.65 * labelFont > maxLabelWidth && displayLabel.length > 3) {
    while (displayLabel.length > 2 && (displayLabel.length + 1) * 0.65 * labelFont > maxLabelWidth) {
      displayLabel = displayLabel.slice(0, -1);
    }
    displayLabel += '…';
  }

  const label = new fabric.FabricText(displayLabel, {
    fontSize: labelFont,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fill: config.bg.startsWith('#0') || config.bg.startsWith('#1') || config.bg.startsWith('#3') || config.bg.startsWith('#4') ? '#f1f5f9' : '#1e293b',
    originX: 'center',
    originY: 'center',
    visible: height >= 14 && width >= 20
  });

  const objectsToGroup = [shape];
  if (!config.svgPath) {
    objectsToGroup.push(label); // only push label for non-SVG stuff to keep furniture clean
  }

  const group = new fabric.Group(objectsToGroup, {
    left,
    top,
    subTargetCheck: false,
    cornerColor: '#6366f1',
    cornerSize: 8,
    transparentCorners: false,
    strokeUniform: true,
    noScaleCache: true,
    objectCaching: false
  });

  group.isVenueItem = true;
  group.venueData = {
    id: `venue_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    category: config.category,
    label: customLabel || config.text,
    caption: '',        // custom caption ('' = default short name, see elementCaptions.js)
    showCaption: true,
    widthM,
    heightM,
    width,
    height,
    gridScale
  };

  return group;
}

// Universal helper to hydrate and restore booth / venue metadata on Fabric objects
export function hydrateBoothObject(obj, rawObj = null, dbBooths = []) {
  if (!obj) return false;

  // 1. Direct transfer from rawObj if available
  if (rawObj?.isBooth && rawObj?.boothData) {
    obj.isBooth = true;
    obj.boothData = { ...rawObj.boothData };
  }
  if (rawObj?.isVenueItem && rawObj?.venueData) {
    obj.isVenueItem = true;
    obj.venueData = { ...rawObj.venueData };
  }
  // Interaction rules (90° rotation steps, width-only handles) are not serialized: restore them
  if (obj.venueData?.type === 'door') {
    applyDoorBehavior(obj);
  }
  // Layer lock (Layers panel) and element-specific handles (queue vertices, width-only measure) are not serialized
  if (rawObj?.isLocked) obj.isLocked = true;
  if (isLibraryElement(obj)) {
    applyLibraryBehavior(obj);
  } else if (obj.isLocked) {
    obj.set({ selectable: false, lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true, hasControls: false, hoverCursor: 'not-allowed' });
  }
  if (rawObj?.isBackgroundBlueprint) {
    obj.isBackgroundBlueprint = true;
    if (rawObj.blueprintData) {
      obj.blueprintData = { ...rawObj.blueprintData };
    }
    if (rawObj.src && !obj.src) {
      obj.src = rawObj.src;
    }
  }
  // Legacy saves (canvas.toJSON ignored custom props) dropped the blueprint flag;
  // the blueprint is the only image object placed on the canvas, so re-flag it.
  if (!obj.isBackgroundBlueprint && obj.type?.toLowerCase() === 'image' && !obj.isBooth && !obj.isVenueItem) {
    obj.isBackgroundBlueprint = true;
  }

  // 2. Sub-object inspection if booth properties are not yet established. Venue items (zones, gates, markers...)
  //    may carry booth-like labels such as "A-12" and must never be turned into booths.
  if ((!obj.isBooth || !obj.boothData) && !obj.isVenueItem) {
    const subObjects = obj._objects || obj.objects || rawObj?.objects || [];
    const textObjs = subObjects.filter(s => {
      const t = (s.type || '').toLowerCase();
      return t === 'text' || t === 'fabrictext' || t === 'i-text';
    });
    const texts = textObjs.map(s => (s.text || '').trim()).filter(Boolean);

    const statuses = ['AVAILABLE', 'RESERVED', 'SOLD', 'FREE', 'MAINTENANCE'];
    const statusMatch = texts.find(t => statuses.includes(t.toUpperCase()));
    const dimMatch = texts.find(t => /^\d+(\.\d+)?x\d+(\.\d+)?m$/i.test(t));
    const codeMatch = texts.find(t => 
      /^[A-Z0-9]+-[0-9]+$/i.test(t) || 
      /^(VIP|BOOTH|STAND|SP)-[0-9]+$/i.test(t)
    );

    if (codeMatch && (statusMatch || dimMatch || subObjects.length >= 4)) {
      obj.isBooth = true;
      const code = codeMatch;
      const status = (statusMatch || 'available').toLowerCase();

      let widthM = 3;
      let heightM = 3;
      if (dimMatch) {
        const parts = dimMatch.toLowerCase().replace('m', '').split('x');
        widthM = parseFloat(parts[0]) || 3;
        heightM = parseFloat(parts[1]) || 3;
      } else if (obj.width && obj.height) {
        widthM = Math.round(obj.width / 20) || 3;
        heightM = Math.round(obj.height / 20) || 3;
      }

      const otherTexts = texts.filter(t => t !== statusMatch && t !== dimMatch && t !== codeMatch);
      let rawOwner = otherTexts[0] || '';
      if (rawOwner.includes('(Nama') || rawOwner === 'Tersedia' || rawOwner === '-') {
        rawOwner = '';
      }

      const ownerName = obj.boothData?.ownerName || rawOwner;

      let category = 'Standard';
      if (code.startsWith('VIP') || (widthM >= 6 && heightM >= 6)) {
        category = 'Island';
      } else if (widthM >= 6 || heightM >= 6) {
        category = 'Premium';
      } else if (code.startsWith('B') && (code === 'B-01' || code === 'B-05')) {
        category = 'Corner';
      } else if (status === 'free') {
        category = 'Free';
      }

      let defaultPrice = 5000000;
      if (category === 'Island') defaultPrice = 25000000;
      else if (category === 'Premium') defaultPrice = 12000000;
      else if (category === 'Corner') defaultPrice = 7500000;
      else if (category === 'Free') defaultPrice = 0;

      obj.boothData = {
        id: obj.boothData?.id || rawObj?.boothData?.id || `booth_${code.toLowerCase().replace('-', '_')}`,
        code,
        booth_number: code,
        category,
        shape: obj.boothData?.shape || rawObj?.boothData?.shape || 'rectangle',
        status,
        price: obj.boothData?.price !== undefined ? obj.boothData.price : defaultPrice,
        ownerName,
        widthM,
        heightM,
        facilities: obj.boothData?.facilities || ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']
      };
    } else if (!obj.isVenueItem) {
      // Check venue items
      const firstText = texts[0] || '';
      if (firstText.includes('STAGE')) {
        obj.isVenueItem = true;
        obj.venueData = { id: 'venue_stage', type: 'stage', label: 'MAIN STAGE & PRESENTATION', category: 'facility', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      } else if (firstText.includes('ENTRANCE') || firstText.includes('REGISTR')) {
        obj.isVenueItem = true;
        obj.venueData = { id: 'venue_entrance', type: 'entrance', label: 'MAIN ENTRANCE / REGISTRATION', category: 'facility', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      } else if (firstText.includes('EXIT')) {
        obj.isVenueItem = true;
        obj.venueData = { id: 'venue_exit', type: 'exit', label: 'EMERGENCY EXIT', category: 'facility', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      } else if (firstText.includes('RESTROOM') || firstText.includes('VIP LOUNGE')) {
        obj.isVenueItem = true;
        obj.venueData = { id: 'venue_restroom', type: 'toilet', label: 'RESTROOM & VIP LOUNGE', category: 'facility', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      } else if (firstText.includes('FOOD COURT') || firstText.includes('CAFE')) {
        obj.isVenueItem = true;
        obj.venueData = { id: 'venue_cafe', type: 'cafe', label: 'FOOD COURT & CAFE', category: 'facility', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      } else if (firstText.includes('■ P') || firstText.includes('PILLAR') || firstText.includes('TIANG')) {
        obj.isVenueItem = true;
        obj.venueData = { id: `venue_pillar_${Math.round(obj.left || 0)}`, type: 'pillar', label: 'PILLAR', category: 'structures', widthM: Math.round(obj.width / 20), heightM: Math.round(obj.height / 20) };
      }
    }
  }

  // 3. Sync with dbBooths if available
  if (obj.isBooth && obj.boothData && Array.isArray(dbBooths) && dbBooths.length > 0) {
    const objCode = (obj.boothData.code || obj.boothData.booth_number || '').trim().toLowerCase();
    const objId = String(obj.boothData.id || '');

    const match = dbBooths.find(b => {
      const bCode = (b.code || b.booth_number || '').trim().toLowerCase();
      const bId = String(b.id || '');

      const matchId = objId && (bId === objId || bId.endsWith(`_${objId}`) || objId.endsWith(`_${bId}`));
      const matchCode = objCode && bCode && (
        bCode === objCode ||
        (objCode.includes('+') && objCode.split('+').map(s=>s.trim().toLowerCase()).includes(bCode)) ||
        (bCode.includes('+') && bCode.split('+').map(s=>s.trim().toLowerCase()).includes(objCode))
      );

      return matchId || matchCode;
    });

    if (match) {
      obj.boothData.status = match.status || obj.boothData.status;
      obj.boothData.ownerName = match.owner_name !== undefined ? match.owner_name : (match.ownerName !== undefined ? match.ownerName : obj.boothData.ownerName);
      if (match.price !== undefined) obj.boothData.price = match.price;
      // Harga mengikuti template (§32): the mode, and whether an invoice locks the price (runtime only)
      if (match.price_mode) obj.boothData.priceMode = match.price_mode;
      if (match.price_locked !== undefined) obj.boothData.priceLocked = Boolean(match.price_locked);
      if (match.category) obj.boothData.category = match.category;
      if (match.shape) obj.boothData.shape = match.shape;
      if (match.brand_category || match.brandCategory) obj.boothData.brandCategory = match.brand_category || match.brandCategory;
      if (match.discount_type || match.discountType) obj.boothData.discountType = match.discount_type || match.discountType;
      if (match.discount_value !== undefined || match.discountValue !== undefined) obj.boothData.discountValue = match.discount_value !== undefined ? match.discount_value : match.discountValue;
      if (match.discount_amount !== undefined || match.discountAmount !== undefined) obj.boothData.discountAmount = match.discount_amount !== undefined ? match.discount_amount : match.discountAmount;
      if (match.discount_reason || match.discountReason) obj.boothData.discountReason = match.discount_reason || match.discountReason;
      if (match.pic_name || match.picName) obj.boothData.picName = match.pic_name || match.picName;
      if (match.email) obj.boothData.email = match.email;
      if (match.phone) obj.boothData.phone = match.phone;
      if (match.registration_source || match.registrationSource) obj.boothData.registrationSource = match.registration_source || match.registrationSource;
      if (match.registered_by || match.registeredBy) obj.boothData.registeredBy = match.registered_by || match.registeredBy;
      // Auto-merge (AGENTS.md §18): exhibitor identity & "Tampilkan Terpisah" come from the booths table
      if (match.exhibitor_id !== undefined) obj.boothData.exhibitorId = match.exhibitor_id || '';
      if (match.merge_separate !== undefined) obj.boothData.mergeSeparate = Boolean(match.merge_separate);
      
      // Sync Fabric.js group visual elements (colors, status text, owner name)
      updateBoothAppearance(obj, obj.boothData);
      obj.dirty = true;
    }
  }

  return Boolean(obj.isBooth || obj.boothData);
}

// Convert canvas state to PRD-compliant JSON
export function exportToPRDJson(canvas, eventInfo = {}, gridScale = DEFAULT_GRID_SCALE) {
  if (!canvas) return null;

  const allObjects = canvas.getObjects();
  const booths = [];
  const venueElements = [];

  allObjects.forEach((obj) => {
    // Operational layer objects (read-only overlay in the sales Studio) belong to ops_elements, not to this floorplan
    if (obj.isGridLine || obj.isBackgroundBlueprint || obj.isOpsOverlay || obj.isOpsItem) return;
    hydrateBoothObject(obj);

    const coords = {
      x: Math.round(obj.left),
      y: Math.round(obj.top),
      width: Math.round(obj.width * (obj.scaleX || 1)),
      height: Math.round(obj.height * (obj.scaleY || 1)),
      rotation: Math.round(obj.angle || 0)
    };

    if (obj.isBooth && obj.boothData) {
      booths.push({
        id: obj.boothData.id,
        booth_number: obj.boothData.code,
        category: obj.boothData.category,
        brand_category: obj.boothData.brandCategory || '',
        shape: obj.boothData.shape || 'rectangle',
        price: obj.boothData.price,
        priceMode: obj.boothData.priceMode,
        discount_type: obj.boothData.discountType || obj.boothData.discount_type || 'nominal',
        discount_value: obj.boothData.discountValue !== undefined ? obj.boothData.discountValue : (obj.boothData.discount_value || 0),
        discount_amount: obj.boothData.discountAmount !== undefined ? obj.boothData.discountAmount : (obj.boothData.discount_amount || 0),
        discount_reason: obj.boothData.discountReason || obj.boothData.discount_reason || '',
        discountType: obj.boothData.discountType || obj.boothData.discount_type || 'nominal',
        discountValue: obj.boothData.discountValue !== undefined ? obj.boothData.discountValue : (obj.boothData.discount_value || 0),
        discountAmount: obj.boothData.discountAmount !== undefined ? obj.boothData.discountAmount : (obj.boothData.discount_amount || 0),
        discountReason: obj.boothData.discountReason || obj.boothData.discount_reason || '',
        status: obj.boothData.status,
        owner_name: obj.boothData.ownerName || '',
        exhibitorId: obj.boothData.exhibitorId || '',
        mergeSeparate: Boolean(obj.boothData.mergeSeparate),
        dimensions_meters: {
          width: obj.boothData.widthM,
          height: obj.boothData.heightM
        },
        coordinates: coords,
        facilities: obj.boothData.facilities || []
      });
    } else if (obj.isVenueItem && obj.venueData) {
      const isDoor = obj.venueData.type === 'door';
      venueElements.push({
        id: obj.venueData.id,
        type: obj.venueData.type,
        category: obj.venueData.category,
        label: obj.venueData.label,
        dimensions_meters: {
          width: obj.venueData.widthM,
          height: obj.venueData.heightM
        },
        coordinates: coords,
        // Element-specific attributes, stored in venue_items.properties_json
        properties: isDoor ? {
          doorType: obj.venueData.doorType,
          widthM: obj.venueData.widthM,
          swing: obj.venueData.swing,
          mirrored: Boolean(obj.venueData.mirrored),
          angle: Math.round(obj.angle || 0)
        } : isLibraryElement(obj) ? {
          ...(obj.venueData.props || {}),
          publicVisible: obj.venueData.publicVisible !== false,
          visible: obj.visible !== false,
          locked: Boolean(obj.isLocked),
          angle: Math.round(obj.angle || 0),
          ...(obj.venueData.connections ? { connections: obj.venueData.connections } : {})
        } : undefined
      });
      // Caption: custom text ('' = default name), per-element switch and the text shown on the floorplan
      const exported = venueElements[venueElements.length - 1];
      if (isCaptionable(obj)) {
        exported.properties = {
          ...(exported.properties || {}),
          caption: customCaption(obj.venueData),
          captionText: captionText(obj),
          showCaption: obj.venueData.showCaption !== false
        };
      }
    }
  });

  return {
    schema_version: '1.0',
    event: {
      id: eventInfo.id || 'EVT-2026-001',
      title: eventInfo.title || 'Indonesia International Exhibition 2026',
      venue: eventInfo.venue || 'Jakarta Convention Center (Hall A)',
      created_at: new Date().toISOString()
    },
    floorplan: {
      scale: `${gridScale}px = 1m`,
      grid_size_px: gridScale,
      total_booths: booths.length,
      total_venue_elements: venueElements.length,
      summary: {
        available: booths.filter(b => b.status === 'available').length,
        reserved: booths.filter(b => b.status === 'reserved').length,
        sold: booths.filter(b => b.status === 'sold').length,
        maintenance: booths.filter(b => b.status === 'maintenance').length,
        total_potential_revenue: booths.reduce((acc, b) => acc + (b.price || 0), 0)
      }
    },
    booths,
    venue_elements: venueElements
  };
}

export function snapCoords(val, gridScale, origin, dimension) {
  let edge = val;
  if (origin === 'center') edge -= dimension / 2;
  else if (origin === 'right' || origin === 'bottom') edge -= dimension;

  let snappedEdge = Math.round(edge / gridScale) * gridScale;

  let snappedVal = snappedEdge;
  if (origin === 'center') snappedVal += dimension / 2;
  else if (origin === 'right' || origin === 'bottom') snappedVal += dimension;

  return snappedVal;
}
