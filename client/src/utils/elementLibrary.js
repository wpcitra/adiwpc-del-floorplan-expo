import * as fabric from 'fabric';

// ============================================================================================
// Floorplan element library: every new element (Struktur, Zona & Jalur, Tiket & Akses, Utilitas,
// Signage & Media, Operasional, Musholla/Wudhu, Teks, Alat Ukur, Text Box & Bentuk) is defined once here:
//   - ICONS: hand-drawn 24x24 outline icons (viewBox 0 0 24 24, stroke 1.8, round caps/joins,
//     currentColor). The same path data renders the catalog card (React <svg>) and the canvas symbol.
//   - ELEMENTS: tab, group, default size in metres, layer, public visibility, inspector properties.
//   - createLibraryElement / rebuildLibraryElement: Fabric objects drawn at the metre scale.
// Canvas objects are venue items: isVenueItem = true, venueData = { type, lib: true, widthM, heightM,
// label, props, publicVisible, ... } so they are saved, copied, exported and listed like the others.
// ============================================================================================

// ---------- SVG path helpers (24x24 space) ----------
const r2 = (n) => Math.round(n * 100) / 100;
const L = (x1, y1, x2, y2) => ({ d: `M${x1} ${y1}L${x2} ${y2}` });
const P = (...pts) => {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
  return { d };
};
const C = (cx, cy, r, fill = false) => ({ d: `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`, fill });
const R = (x, y, w, h, rr = 0, extra = {}) => ({
  d: rr
    ? `M${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h - rr}Q${x + w} ${y + h} ${x + w - rr} ${y + h}H${x + rr}Q${x} ${y + h} ${x} ${y + h - rr}V${y + rr}Q${x} ${y} ${x + rr} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
  ...extra
});
const D = (d, extra = {}) => ({ d, ...extra });
const dashed = (p) => ({ ...p, dash: true });

// ---------- Icons (catalog & canvas) ----------
export const ICONS = {
  // Struktur
  pilar_persegi: [R(5, 5, 14, 14, 1), L(5, 5, 19, 19), L(19, 5, 5, 19)],
  ramp: [R(3, 6, 18, 12, 1.5), L(7, 15, 16, 9), P(12.5, 9, 16, 9, 16, 12.5)],
  lift: [R(5, 3, 14, 18, 2), L(12, 6, 12, 11), P(9.5, 8.5, 12, 6, 14.5, 8.5), L(12, 13, 12, 18), P(9.5, 15.5, 12, 18, 14.5, 15.5)],
  eskalator: [P(3, 19, 7, 19, 7, 16, 10, 16, 10, 13, 13, 13, 13, 10, 16, 10, 16, 7, 21, 7), L(4, 11, 10, 5), P(7, 5, 10, 5, 10, 8)],

  // Zona & Jalur
  zone: [dashed(R(4, 4, 16, 16, 2)), P(4, 8, 4, 4, 8, 4), P(16, 4, 20, 4, 20, 8), P(20, 16, 20, 20, 16, 20), P(8, 20, 4, 20, 4, 16)],
  aisle: [L(3, 5, 21, 5), L(3, 19, 21, 19), L(6, 12, 18, 12), P(8.5, 9.5, 6, 12, 8.5, 14.5), P(15.5, 9.5, 18, 12, 15.5, 14.5)],
  flow_arrow: [D('M4 19C4 11 9 6 18 6'), P(14.5, 2.5, 18, 6, 14.5, 9.5)],
  wheelchair_path: [C(10, 3.8, 1.6), P(10, 7, 10, 12, 15, 12, 17, 16.5), D('M7 11a5 5 0 1 0 6.5 5.5'), dashed(L(2, 21, 22, 21))],
  assembly_point: [L(4, 4, 9, 9), P(9, 5.5, 9, 9, 5.5, 9), L(20, 4, 15, 9), P(15, 5.5, 15, 9, 18.5, 9), L(4, 20, 9, 15), P(5.5, 15, 9, 15, 9, 18.5), L(20, 20, 15, 15), P(18.5, 15, 15, 15, 15, 18.5), C(12, 12, 1.6, true)],

  // Tiket & Akses
  ticket_area: [dashed(R(3, 5, 18, 14, 2)), D('M12 8h7v1.5a1 1 0 0 0 0 2V13h-7v-1.5a1 1 0 0 0 0-2Z')],
  ticket_box: [P(3, 7, 12, 3, 21, 7), D('M5 7V21H19V7'), R(8, 9, 8, 5, 1), D('M9 16h6v1a1 1 0 0 0 0 2v1H9v-1a1 1 0 0 0 0-2Z')],
  wristband_exchange: [D('M4 12a8 5 0 1 0 16 0a8 5 0 1 0-16 0Z'), P(8.5, 12, 11, 14.5, 15.5, 9.5)],
  queue_line: [P(3, 5, 17, 5, 17, 11, 7, 11, 7, 17, 20, 17), P(17, 14, 20, 17, 17, 20)],
  stanchion: [L(6, 8, 6, 20), L(18, 8, 18, 20), L(3.5, 20.5, 8.5, 20.5), L(15.5, 20.5, 20.5, 20.5), C(6, 6, 1.6), C(18, 6, 1.6), D('M7.5 7Q12 13 16.5 7')],
  vip_lane: [L(3, 16, 21, 16), L(3, 21, 21, 21), D('M12 3l1.8 3.6l4 .6l-2.9 2.8l.7 4l-3.6-1.9l-3.6 1.9l.7-4l-2.9-2.8l4-.6Z')],
  ticket_checker: [R(7, 6, 10, 5, 1.5), D('M9.5 11h5v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1Z'), dashed(L(4, 3, 20, 3))],
  entrance_gate: [D('M5 21V9a7 7 0 0 1 14 0V21'), L(1.5, 15, 12, 15), P(9, 12, 12, 15, 9, 18)],
  turnstile: [C(12, 12, 2), L(12, 10, 12, 3), L(10.3, 13, 4.2, 16.5), L(13.7, 13, 19.8, 16.5), L(12, 14, 12, 21)],
  bag_check: [D('M5 21V4H19V21'), D('M10 10a3 3 0 0 0 0 4'), D('M14 10a3 3 0 0 1 0 4'), D('M8 8a6 6 0 0 0 0 8'), D('M16 8a6 6 0 0 1 0 8'), C(12, 12, 0.9, true)],
  exit_gate: [D('M4 21V9a7 7 0 0 1 14 0V21'), L(11, 15, 22.5, 15), P(19.5, 12, 22.5, 15, 19.5, 18)],
  reg_exhibitor: [L(3, 14, 21, 14), L(5, 14, 5, 21), L(19, 14, 19, 21), R(9, 3, 6, 8.5, 1), C(12, 6.3, 1.1), L(10.5, 9.2, 13.5, 9.2)],
  reg_media: [L(3, 15, 21, 15), L(5, 15, 5, 21), L(19, 15, 19, 21), R(6.5, 6, 11, 6.5, 1.2), C(12, 9.2, 1.9), D('M9.5 6l1-1.8h3l1 1.8')],
  cloakroom: [R(4, 9, 13, 12, 2), D('M8 9V7a2.5 2.5 0 0 1 5 0v2'), L(17, 12, 20, 15), C(20.6, 16.4, 1.3)],

  // Utilitas
  power_point: [C(12, 12, 9), D('M13 6.5L8.5 13H12L11 17.5L15.5 11H12Z')],
  water_point: [C(12, 12, 9), D('M12 6.5C14.5 9.5 16 11.5 16 13.5a4 4 0 0 1-8 0C8 11.5 9.5 9.5 12 6.5Z')],
  wifi: [D('M3.5 9.5a12 12 0 0 1 17 0'), D('M6.5 12.5a8 8 0 0 1 11 0'), D('M9.5 15.5a3.8 3.8 0 0 1 5 0'), C(12, 18.8, 1.1, true)],
  lan_point: [R(4, 5, 16, 14, 1.5), D('M8 9h8v5h-2v2h-4v-2H8Z')],
  rigging_point: [L(7, 3, 17, 3), L(12, 3, 12, 11), C(12, 15, 4)],
  electric_panel: [R(5, 3, 14, 18, 1.5), D('M13 6.5L9.5 12H12.5L11 17.5L14.5 12H11.5Z')],

  // Signage & Media
  led_screen: [R(3, 4, 18, 11, 1.5), L(12, 15, 12, 20), L(8, 20, 16, 20)],
  backdrop: [R(5, 5, 14, 10, 0.5), L(3, 3, 3, 21), L(21, 3, 21, 21), L(1.5, 21, 4.5, 21), L(19.5, 21, 22.5, 21)],
  rollup_banner: [R(7, 3, 10, 14, 0.8), R(5, 17, 14, 4, 1), L(10, 7, 14, 7), L(10, 10, 14, 10)],
  umbul: [L(6, 2, 6, 22), D('M6 3h8v16l-4-2.5L6 19')],
  photo_booth: [R(3, 7, 18, 13, 2), C(12, 13.5, 3.6), C(12, 13.5, 1, true), D('M8 7l1.5-2.5h5L16 7')],
  totem: [L(12, 9, 12, 21), L(9, 21, 15, 21), D('M5 3.5h11l3 2.5l-3 2.5H5Z')],

  // Operasional
  committee_room: [R(4, 6, 16, 14, 2), R(10, 3, 4, 3, 1), C(9, 12, 2), L(13, 11, 17, 11), L(13, 14, 17, 14), L(7, 17, 17, 17)],
  cctv: [L(3, 4, 3, 13), L(3, 8.5, 7, 8.5), D('M7 5L19 8.5L17.5 12.5L7 10Z'), dashed(D('M18.5 11l3 5'))],

  // Amenities
  musholla: [D('M5 20V13a7 7 0 0 1 14 0V20Z'), L(3, 20, 21, 20), L(12, 6, 12, 4), D('M13.3 1.2a1.6 1.6 0 1 0 0 2.9a1.3 1.3 0 1 1 0-2.9Z')],
  wudhu: [D('M3 7h8a3 3 0 0 1 3 3v2'), L(7, 4, 7, 7), L(5, 4, 9, 4), D('M14 15.5c1.1 1.4 1.6 2.2 1.6 2.9a1.6 1.6 0 0 1-3.2 0c0-.7.5-1.5 1.6-2.9Z'), D('M19 12c.8 1 1.2 1.6 1.2 2.1a1.2 1.2 0 0 1-2.4 0c0-.5.4-1.1 1.2-2.1Z')],

  // Shapes
  text_label: [R(4, 4, 16, 16, 2), L(8, 8, 16, 8), L(12, 8, 12, 17)],
  textbox: [dashed(R(3, 5, 18, 14, 2)), L(7, 10, 17, 10), L(7, 14, 14, 14)],
  shape_rect: [R(4, 5, 16, 14, 1.5)],
  shape_triangle: [D('M12 4L21 19.5H3Z')],
  shape_parallelogram: [D('M8.5 6H21L15.5 18H3Z')],
  shape_ellipse: [C(12, 12, 8.5)],
  measure: [L(3, 15, 21, 15), L(3, 11.5, 3, 18.5), L(21, 11.5, 21, 18.5), L(9, 15, 9, 13), L(15, 15, 15, 13), R(8, 4.5, 8, 5, 1)]
};

// ---------- Tabs ----------
export const LIBRARY_TABS = [
  { id: 'lib_struktur', label: '🏛️ Struktur', title: 'Pilar, Ramp, Lift & Eskalator', accent: '#475569' },
  { id: 'lib_zona', label: '🗺️ Zona & Jalur', title: 'Zona, Lorong, Alur Pengunjung & Titik Kumpul', accent: '#059669' },
  { id: 'lib_tiket', label: '🎟️ Tiket & Akses', title: 'Loket, Antrean, Gerbang & Registrasi', accent: '#4f46e5' },
  { id: 'lib_utilitas', label: '⚡ Utilitas', title: 'Listrik, Air, Internet & Rigging', accent: '#d97706' },
  { id: 'lib_signage', label: '📺 Signage & Media', title: 'Layar LED, Backdrop, Banner & Penunjuk', accent: '#7c3aed' },
  { id: 'lib_operasional', label: '🛠️ Operasional', title: 'Ruang Panitia, CCTV & Logistik', accent: '#334155' }
];
export const TAB_ACCENT = Object.fromEntries(LIBRARY_TABS.map(t => [t.id, t.accent]));

const PAYMENT_OPTIONS = [['tunai', 'Tunai'], ['qris', 'QRIS'], ['kartu', 'Kartu Debit/Kredit']];
const ZONE_CATEGORIES = ['Umum', 'Pameran', 'Kuliner', 'VIP', 'Istirahat', 'Panggung', 'Lainnya'];

// Text settings of Text Box & Bentuk (colours live in the "Warna" section, see SHAPE_STYLE_KEYS)
function SHAPE_TEXT_PROPS(fontSize) {
  return [
    { key: 'fontSize', label: 'Ukuran Huruf (px)', type: 'number', min: 6, max: 120, step: 1, default: fontSize },
    { key: 'bold', label: 'Tebal', type: 'toggle', default: false }
  ];
}

// kind: marker (footprint + centred icon) | hatch (obstacle) | area (resizable tinted block) | aisle | lane
//       | curve (flow arrow) | path (dashed route + icon) | queue (editable polyline) | measure | text | cctv
//       | shape (Text Box & Bentuk: one ShapeBox, freely resizable, colours in props)
// layer: 'bottom' (behind booths) | 'top'
export const ELEMENTS = {
  // ---------------- Struktur ----------------
  pilar_persegi: { tab: 'lib_struktur', name: 'Pilar Persegi', desc: 'Kolom persegi berarsir, penghalang booth', kind: 'hatch', w: 1, h: 1, layer: 'top', publicDefault: true, obstacle: true, keywords: 'pilar kolom tiang column penghalang' },
  ramp: { tab: 'lib_struktur', name: 'Ramp', desc: 'Jalur landai / akses difabel', kind: 'marker', w: 3, h: 1.5, layer: 'bottom', publicDefault: true, keywords: 'ramp landai difabel' },
  lift: { tab: 'lib_struktur', name: 'Lift', desc: 'Elevator antar lantai', kind: 'marker', w: 2, h: 2, layer: 'top', publicDefault: true, keywords: 'lift elevator' },
  eskalator: { tab: 'lib_struktur', name: 'Eskalator', desc: 'Tangga berjalan', kind: 'marker', w: 1.2, h: 5, layer: 'top', publicDefault: true, keywords: 'eskalator escalator tangga berjalan' },

  // ---------------- Zona & Jalur ----------------
  zone: {
    tab: 'lib_zona', name: 'Zona / Area', desc: 'Blok area berwarna transparan', kind: 'area', w: 8, h: 6, layer: 'bottom', publicDefault: true, color: '#10b981',
    keywords: 'zona area blok wilayah',
    props: [{ key: 'color', label: 'Warna Zona', type: 'color' }, { key: 'category', label: 'Kategori', type: 'select', options: ZONE_CATEGORIES.map(c => [c, c]), default: 'Umum' }]
  },
  aisle: {
    tab: 'lib_zona', name: 'Lorong / Aisle', desc: 'Jalur pengunjung antar blok', kind: 'aisle', w: 10, h: 3, layer: 'bottom', publicDefault: true,
    keywords: 'lorong aisle koridor jalan', props: [{ key: 'heightM', label: 'Lebar Lorong (m)', type: 'number', min: 1, step: 0.5, geometry: true }]
  },
  flow_arrow: { tab: 'lib_zona', name: 'Panah Alur Pengunjung', desc: 'Arah sirkulasi pengunjung', kind: 'curve', w: 4, h: 3, layer: 'top', publicDefault: true, keywords: 'panah alur arah sirkulasi flow' },
  wheelchair_path: { tab: 'lib_zona', name: 'Jalur Kursi Roda', desc: 'Rute ramah difabel', kind: 'path', w: 6, h: 1.2, layer: 'bottom', publicDefault: true, keywords: 'kursi roda difabel wheelchair aksesibel' },
  assembly_point: { tab: 'lib_zona', name: 'Titik Kumpul', desc: 'Assembly point evakuasi', kind: 'marker', w: 3, h: 3, layer: 'top', publicDefault: true, keywords: 'titik kumpul assembly evakuasi darurat' },

  // ---------------- Tiket & Akses ----------------
  ticket_area: {
    tab: 'lib_tiket', group: 'Pembelian & Penukaran', name: 'Area Ticketing', desc: 'Area loket & penukaran tiket', kind: 'area', w: 8, h: 5, layer: 'bottom', publicDefault: true, color: '#6366f1',
    keywords: 'area ticketing tiket loket', props: [{ key: 'color', label: 'Warna Area', type: 'color' }]
  },
  ticket_box: {
    tab: 'lib_tiket', group: 'Pembelian & Penukaran', name: 'Ticket Box / Loket Tiket', desc: 'Bilik pembelian tiket', kind: 'marker', w: 2, h: 2, layer: 'top', publicDefault: true, queueTarget: true,
    keywords: 'ticket box loket tiket kasir',
    props: [{ key: 'counters', label: 'Jumlah Loket', type: 'number', min: 1, step: 1, default: 1 }, { key: 'payments', label: 'Metode Bayar', type: 'multi', options: PAYMENT_OPTIONS, default: ['tunai', 'qris'] }]
  },
  wristband_exchange: { tab: 'lib_tiket', group: 'Pembelian & Penukaran', name: 'Penukaran Tiket / Gelang', desc: 'Tukar tiket online jadi gelang', kind: 'marker', w: 3, h: 1.5, layer: 'top', publicDefault: true, keywords: 'penukaran tiket gelang wristband redeem' },
  queue_line: {
    tab: 'lib_tiket', group: 'Antrean', name: 'Queue Line / Jalur Antre', desc: 'Jalur antre berkelok, titik belok bisa diatur', kind: 'queue', w: 6, h: 4, layer: 'bottom', publicDefault: true,
    keywords: 'queue antre antrean jalur antri',
    props: [{ key: 'laneWidth', label: 'Lebar Jalur (m)', type: 'number', min: 0.6, step: 0.1, default: 1.2 }, { key: 'capacity', label: 'Perkiraan Kapasitas (orang)', type: 'number', min: 0, step: 5, default: 50 }]
  },
  stanchion: { tab: 'lib_tiket', group: 'Antrean', name: 'Barikade / Stanchion', desc: 'Tiang pembatas dengan tali', kind: 'marker', w: 3, h: 0.4, layer: 'top', publicDefault: true, keywords: 'barikade stanchion pembatas tali tiang' },
  vip_lane: { tab: 'lib_tiket', group: 'Antrean', name: 'Jalur VIP / Fast Track', desc: 'Jalur khusus prioritas', kind: 'lane', w: 8, h: 1.5, layer: 'bottom', publicDefault: true, keywords: 'vip fast track prioritas jalur' },
  ticket_checker: {
    tab: 'lib_tiket', group: 'Pemeriksaan & Masuk-Keluar', name: 'Checker In / Pemindai Tiket', desc: 'Petugas pemindai tiket', kind: 'marker', w: 1, h: 1, layer: 'top', publicDefault: true, queueTarget: true,
    keywords: 'checker scan pemindai tiket', props: [{ key: 'staff', label: 'Jumlah Petugas / Perangkat', type: 'number', min: 1, step: 1, default: 2 }]
  },
  entrance_gate: {
    tab: 'lib_tiket', group: 'Pemeriksaan & Masuk-Keluar', name: 'Entrance Gate / Gerbang Masuk', desc: 'Gerbang masuk pengunjung', kind: 'marker', w: 4, h: 1, layer: 'top', publicDefault: true, snapToWall: true, queueTarget: true,
    keywords: 'entrance gate gerbang masuk pintu', props: [{ key: 'widthM', label: 'Lebar Gerbang (m)', type: 'number', min: 1, step: 0.5, geometry: true }]
  },
  turnstile: { tab: 'lib_tiket', group: 'Pemeriksaan & Masuk-Keluar', name: 'Turnstile', desc: 'Palang putar tiga lengan', kind: 'marker', w: 1.2, h: 1.2, layer: 'top', publicDefault: true, snapToWall: true, keywords: 'turnstile palang putar' },
  bag_check: { tab: 'lib_tiket', group: 'Pemeriksaan & Masuk-Keluar', name: 'Pemeriksaan Tas / Metal Detector', desc: 'Gerbang pemeriksaan keamanan', kind: 'marker', w: 1.5, h: 1.2, layer: 'top', publicDefault: true, keywords: 'pemeriksaan tas metal detector security x-ray' },
  exit_gate: {
    tab: 'lib_tiket', group: 'Pemeriksaan & Masuk-Keluar', name: 'Exit Gate / Gerbang Keluar', desc: 'Gerbang keluar pengunjung', kind: 'marker', w: 4, h: 1, layer: 'top', publicDefault: true, snapToWall: true,
    keywords: 'exit gate gerbang keluar', props: [{ key: 'widthM', label: 'Lebar Gerbang (m)', type: 'number', min: 1, step: 0.5, geometry: true }]
  },
  reg_exhibitor: { tab: 'lib_tiket', group: 'Registrasi & Layanan', name: 'Registrasi Exhibitor', desc: 'Meja registrasi peserta pameran', kind: 'marker', w: 3, h: 1.2, layer: 'top', publicDefault: false, keywords: 'registrasi exhibitor tenant peserta id card' },
  reg_media: { tab: 'lib_tiket', group: 'Registrasi & Layanan', name: 'Registrasi Media / Pers', desc: 'Meja registrasi wartawan', kind: 'marker', w: 3, h: 1.2, layer: 'top', publicDefault: false, keywords: 'registrasi media pers wartawan kamera' },
  cloakroom: { tab: 'lib_tiket', group: 'Registrasi & Layanan', name: 'Penitipan Barang', desc: 'Tempat penitipan tas & barang', kind: 'marker', w: 3, h: 2, layer: 'top', publicDefault: true, keywords: 'penitipan barang tas cloakroom loker' },

  // ---------------- Utilitas ----------------
  power_point: {
    tab: 'lib_utilitas', name: 'Titik Listrik', desc: 'Sumber daya listrik booth', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'listrik power stop kontak watt',
    props: [{ key: 'watt', label: 'Kapasitas (Watt)', type: 'number', min: 0, step: 100, default: 2200 }, { key: 'sockets', label: 'Jumlah Stop Kontak', type: 'number', min: 1, step: 1, default: 2 }]
  },
  water_point: { tab: 'lib_utilitas', name: 'Titik Air', desc: 'Sumber air bersih', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'air water keran' },
  wifi: { tab: 'lib_utilitas', name: 'Internet / WiFi', desc: 'Titik akses WiFi', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'wifi internet hotspot' },
  lan_point: { tab: 'lib_utilitas', name: 'Titik LAN', desc: 'Port jaringan kabel', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'lan jaringan kabel ethernet port' },
  rigging_point: {
    tab: 'lib_utilitas', name: 'Rigging Point', desc: 'Titik gantung beban overhead', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'rigging gantung hook beban',
    props: [{ key: 'maxLoad', label: 'Beban Maksimal (kg)', type: 'number', min: 0, step: 50, default: 500 }]
  },
  electric_panel: { tab: 'lib_utilitas', name: 'Panel Listrik', desc: 'Panel distribusi (MDP/SDP)', kind: 'marker', w: 1.2, h: 0.6, layer: 'top', publicDefault: false, keywords: 'panel listrik mdp sdp distribusi' },

  // ---------------- Signage & Media ----------------
  led_screen: { tab: 'lib_signage', name: 'LED Screen', desc: 'Layar LED dengan penyangga', kind: 'marker', w: 4, h: 0.6, layer: 'top', publicDefault: true, keywords: 'led screen layar videotron' },
  backdrop: { tab: 'lib_signage', name: 'Backdrop', desc: 'Bingkai backdrop foto / panggung', kind: 'marker', w: 6, h: 0.6, layer: 'top', publicDefault: true, keywords: 'backdrop latar' },
  rollup_banner: { tab: 'lib_signage', name: 'Banner / Roll Up', desc: 'Banner berdiri', kind: 'marker', w: 1, h: 0.6, layer: 'top', publicDefault: true, keywords: 'banner roll up x-banner' },
  umbul: { tab: 'lib_signage', name: 'Umbul-umbul', desc: 'Bendera tiang tinggi', kind: 'marker', w: 0.6, h: 0.6, layer: 'top', publicDefault: true, keywords: 'umbul bendera flag' },
  photo_booth: { tab: 'lib_signage', name: 'Photo Booth', desc: 'Area foto pengunjung', kind: 'marker', w: 3, h: 3, layer: 'top', publicDefault: true, keywords: 'photo booth foto kamera' },
  totem: { tab: 'lib_signage', name: 'Totem Penunjuk', desc: 'Tiang penunjuk arah', kind: 'marker', w: 0.8, h: 0.8, layer: 'top', publicDefault: true, keywords: 'totem penunjuk arah wayfinding signage' },

  // ---------------- Operasional ----------------
  committee_room: { tab: 'lib_operasional', name: 'Ruang Panitia', desc: 'Ruang kerja panitia / EO', kind: 'marker', w: 5, h: 4, layer: 'top', publicDefault: false, keywords: 'ruang panitia committee eo id card' },
  cctv: {
    tab: 'lib_operasional', name: 'CCTV', desc: 'Kamera pengawas + sudut pandang', kind: 'cctv', w: 0.8, h: 0.8, layer: 'top', publicDefault: false, keywords: 'cctv kamera pengawas keamanan',
    props: [{ key: 'fov', label: 'Sudut Pandang (°)', type: 'number', min: 10, max: 180, step: 5, default: 70 }, { key: 'range', label: 'Jangkauan (m)', type: 'number', min: 1, step: 1, default: 8 }]
  },

  // ---------------- Tambahan tab lama ----------------
  musholla: { tab: 'amenities', name: 'Musholla', desc: 'Ruang ibadah', kind: 'marker', w: 5, h: 4, layer: 'top', publicDefault: true, accent: '#0d9488', keywords: 'musholla mushola masjid sholat ibadah' },
  wudhu: { tab: 'amenities', name: 'Tempat Wudhu', desc: 'Area wudhu & keran air', kind: 'marker', w: 3, h: 1.5, layer: 'top', publicDefault: true, accent: '#0d9488', keywords: 'wudhu keran air sholat' },
  text_label: {
    tab: 'shapes', name: 'Teks / Label', desc: 'Teks bebas di denah', kind: 'text', w: 4, h: 1, layer: 'top', publicDefault: true, accent: '#0f172a', keywords: 'teks label tulisan text',
    props: [{ key: 'fontSize', label: 'Ukuran Huruf (px)', type: 'number', min: 6, max: 120, step: 1, default: 16 }, { key: 'bold', label: 'Tebal', type: 'toggle', default: true }, { key: 'textColor', label: 'Warna Teks', type: 'color', default: '#0f172a' }]
  },
  measure: { tab: 'shapes', name: 'Alat Ukur / Dimensi', desc: 'Garis ukur, jarak otomatis dalam meter', kind: 'measure', w: 5, h: 0.6, layer: 'top', publicDefault: false, accent: '#e11d48', keywords: 'ukur dimensi jarak meter measure' },

  // ---------------- Text Box & Bentuk (kind 'shape': one ShapeBox object, text wraps inside the shape) ----------------
  textbox: {
    tab: 'shapes', name: 'Text Box', desc: 'Kotak teks, teks mengikuti lebar kotak', kind: 'shape', shape: 'textbox', w: 4, h: 1, layer: 'top', publicDefault: true, accent: '#0f172a',
    defaultLabel: 'Ketik teks di sini', keywords: 'text box textbox kotak teks paragraf tulisan keterangan',
    style: { fillNone: true, strokeNone: true, textColor: '#0f172a' }, props: SHAPE_TEXT_PROPS(16)
  },
  shape_rect: {
    tab: 'shapes', name: 'Kotak', desc: 'Persegi / persegi panjang', kind: 'shape', shape: 'rect', w: 3, h: 3, layer: 'top', publicDefault: true, accent: '#4f46e5',
    keywords: 'kotak persegi panjang segi empat rectangle square box bentuk', props: SHAPE_TEXT_PROPS(14)
  },
  shape_triangle: {
    tab: 'shapes', name: 'Segitiga', desc: 'Bentuk segitiga', kind: 'shape', shape: 'triangle', w: 3, h: 3, layer: 'top', publicDefault: true, accent: '#4f46e5',
    keywords: 'segitiga triangle bentuk', props: SHAPE_TEXT_PROPS(14)
  },
  shape_parallelogram: {
    tab: 'shapes', name: 'Jajaran Genjang', desc: 'Bentuk miring (parallelogram)', kind: 'shape', shape: 'parallelogram', w: 4, h: 2, layer: 'top', publicDefault: true, accent: '#4f46e5',
    keywords: 'jajaran genjang parallelogram miring bentuk', props: SHAPE_TEXT_PROPS(14)
  },
  shape_ellipse: {
    tab: 'shapes', name: 'Bulat', desc: 'Lingkaran / elips', kind: 'shape', shape: 'ellipse', w: 3, h: 3, layer: 'top', publicDefault: true, accent: '#4f46e5',
    keywords: 'bulat lingkaran elips oval circle ellipse bundar bentuk', props: SHAPE_TEXT_PROPS(14)
  }
};

// Existing elements shown as shortcuts in the new tabs (same template, not a duplicate)
export const EXISTING_SHORTCUTS = {
  lib_struktur: [
    { venueType: 'pillar', name: 'Pilar Bulat', note: 'Tiang Gedung (tab Walls)', icon: '●' },
    { venueType: 'stairs', name: 'Tangga', note: 'Tangga / Elevasi Lantai (tab Walls)', icon: '🪜' }
  ],
  lib_zona: [{ venueType: 'signage', name: 'Titik "Anda di Sini"', note: 'Signage & Wayfinding (tab Amenities)', icon: '🪧' }],
  lib_tiket: [{ venueType: 'regdesk', name: 'Meja Registrasi / Informasi', note: 'Information / Registration Counter (tab Amenities)', icon: 'ℹ️', group: 'Registrasi & Layanan' }],
  lib_operasional: [
    { venueType: 'loading', name: 'Loading Dock', note: 'tab Amenities', icon: '🚛' },
    { venueType: 'storage', name: 'Gudang', note: 'Gudang Panitia (tab Amenities)', icon: '📦' },
    { venueType: 'security', name: 'Pos Keamanan', note: 'Security Post (tab Amenities)', icon: '🔒' }
  ]
};
export const TICKET_GROUPS = ['Pembelian & Penukaran', 'Antrean', 'Pemeriksaan & Masuk-Keluar', 'Registrasi & Layanan'];

export const accentOf = (type) => ELEMENTS[type]?.accent || TAB_ACCENT[ELEMENTS[type]?.tab] || '#475569';
export const isLibraryElement = (obj) => Boolean(obj?.venueData?.lib && ELEMENTS[obj.venueData.type]);
export const elementsInTab = (tabId) => Object.entries(ELEMENTS).filter(([, e]) => e.tab === tabId).map(([id, e]) => ({ id, ...e }));

// Search across the new elements (name, description, keywords)
export function searchElements(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return Object.entries(ELEMENTS)
    .filter(([, e]) => `${e.name} ${e.desc} ${e.keywords || ''}`.toLowerCase().includes(q))
    .map(([id, e]) => ({ id, ...e }));
}

const withAlpha = (hex, alpha) => {
  const h = String(hex || '#475569').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export function defaultProps(type) {
  const out = {};
  (ELEMENTS[type]?.props || []).forEach(p => { if (p.default !== undefined && !p.geometry) out[p.key] = p.default; });
  if (ELEMENTS[type]?.color) out.color = ELEMENTS[type].color;
  // Text Box & Bentuk: built-in colours, then the style this browser saved with "Jadikan Default"
  if (ELEMENTS[type]?.kind === 'shape') Object.assign(out, baseShapeStyle(type), readShapeDefault(type));
  return out;
}

// ---------- Queue Line: editable polyline (vertex handles), registered for JSON load ----------
export class QueueLine extends fabric.Polyline {
  static type = 'QueueLine';
  _render(ctx) {
    super._render(ctx);
    // Direction arrow at the last point
    const pts = this.points;
    if (!pts || pts.length < 2) return;
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const off = this.pathOffset || { x: 0, y: 0 };
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const size = Math.max(8, (this.strokeWidth || 10) * 0.9);
    ctx.save();
    ctx.translate(b.x - off.x, b.y - off.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size * 0.6, 0);
    ctx.lineTo(-size * 0.6, -size * 0.7);
    ctx.lineTo(-size * 0.6, size * 0.7);
    ctx.closePath();
    ctx.fillStyle = this.arrowColor || '#4f46e5';
    ctx.fill();
    ctx.restore();
  }
}
fabric.classRegistry.setClass(QueueLine);

// Vertex editing for queue lines (restored after load too)
export function applyLibraryBehavior(obj) {
  if (!isLibraryElement(obj)) return;
  if (obj.venueData.type === 'queue_line' && fabric.controlsUtils?.createPolyControls) {
    obj.controls = fabric.controlsUtils.createPolyControls(obj);
    obj.hasBorders = true;
    obj.objectCaching = false;
  }
  if (obj.venueData.type === 'text_label') {
    obj.lockScalingFlip = true;
  }
  if (ELEMENTS[obj.venueData.type].kind === 'shape') {
    obj.controls = shapeControls();
    obj.set({ lockScalingFlip: true, objectCaching: false, strokeWidth: 0 });
  }
  // Elements saved before captions existed carry a baked-in label text: the caption overlay replaces it
  if (obj.venueData.type !== 'measure' && typeof obj.getObjects === 'function') {
    obj.getObjects().forEach(child => { if ((child.type || '').toLowerCase() === 'text') child.visible = false; });
  }
  if (obj.venueData.type === 'measure') {
    obj.set({ lockScalingY: true, lockScalingFlip: true });
    obj.setControlsVisibility?.({ mt: false, mb: false, tl: false, tr: false, bl: false, br: false, ml: true, mr: true, mtr: true });
  }
  if (obj.isLocked) {
    obj.set({ selectable: false, evented: true, lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true, hasControls: false, hoverCursor: 'not-allowed' });
  }
}

// ---------- Fabric builders ----------
// Fabric positions a path by its bounding box; shift each icon part so the 24x24 frame maps onto the target box
function placeIcon(type, cx, cy, size, stroke, strokeWidth) {
  const scale = size / 24;
  const originX = cx - 12 * scale;
  const originY = cy - 12 * scale;
  return (ICONS[type] || []).map(part => {
    const path = new fabric.Path(part.d, {
      fill: part.fill ? stroke : '',
      stroke,
      strokeWidth: strokeWidth / scale,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeDashArray: part.dash ? [2.2, 2] : null,
      scaleX: scale,
      scaleY: scale,
      objectCaching: false
    });
    // pathOffset = centre of the path's own bounds in icon units
    const po = path.pathOffset;
    path.set({ originX: 'center', originY: 'center', left: originX + po.x * scale, top: originY + po.y * scale });
    return path;
  });
}

const labelText = (text, { left, top, fontSize, fill, originX = 'center', originY = 'center', bold = true }) => new fabric.FabricText(String(text), {
  left, top, originX, originY, fontSize, fill,
  fontWeight: bold ? 'bold' : 'normal',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  objectCaching: false
});

// Shared transparent hit area: first child, centred on (0,0), keeps the group centre on the element centre
const hitArea = (w, h) => new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: w, height: h, fill: 'rgba(0,0,0,0)', strokeWidth: 0, selectable: false, evented: false });

function buildChildren(type, def, W, H, data, gridScale) {
  const accent = data.props?.color || accentOf(type);
  const thin = Math.max(1, gridScale * 0.06);
  const children = [hitArea(W, H)];
  const minDim = Math.min(W, H);
  const fontSize = Math.max(7, Math.min(13, gridScale * 0.5));

  switch (def.kind) {
    case 'hatch': {
      children.push(new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: W, height: H, fill: '#e2e8f0', stroke: '#334155', strokeWidth: thin * 1.4, objectCaching: false }));
      children.push(new fabric.Path(`M${-W / 2} ${-H / 2}L${W / 2} ${H / 2}M${W / 2} ${-H / 2}L${-W / 2} ${H / 2}`, { stroke: '#334155', strokeWidth: thin, fill: '', objectCaching: false }));
      break;
    }
    case 'area': {
      children.push(new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: W, height: H, rx: 4, ry: 4, fill: withAlpha(accent, 0.14), stroke: accent, strokeWidth: thin * 1.3, strokeDashArray: [gridScale * 0.4, gridScale * 0.25], objectCaching: false }));
      const iconSize = Math.min(gridScale * 1.1, minDim * 0.35);
      children.push(...placeIcon(type, W / 2 - iconSize * 0.75, -H / 2 + iconSize * 0.75, iconSize, accent, 1.8));
      break;
    }
    case 'aisle':
    case 'lane': {
      const isLane = def.kind === 'lane';
      const tone = isLane ? '#d97706' : accent;
      if (isLane) children.push(new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: W, height: H, fill: withAlpha(tone, 0.1), strokeWidth: 0, objectCaching: false }));
      children.push(new fabric.Path(`M${-W / 2} ${-H / 2}H${W / 2}M${-W / 2} ${H / 2}H${W / 2}`, { stroke: tone, strokeWidth: thin * 1.3, fill: '', objectCaching: false }));
      const aw = Math.min(W * 0.4, gridScale * 3);
      const ah = Math.min(H * 0.3, gridScale * 0.6);
      if (!isLane) {
        children.push(new fabric.Path(`M${-aw} 0H${aw}M${-aw + ah} ${-ah}L${-aw} 0L${-aw + ah} ${ah}M${aw - ah} ${-ah}L${aw} 0L${aw - ah} ${ah}`, { stroke: tone, strokeWidth: thin * 1.2, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round', strokeDashArray: null, objectCaching: false }));
      } else {
        children.push(...placeIcon('vip_lane', 0, 0, Math.min(H * 0.9, gridScale * 1.4), tone, 1.8).slice(2));
      }
      break;
    }
    case 'curve': {
      children.push(new fabric.Path(`M${-W / 2} ${H / 2}C${-W / 2} ${-H / 6} ${-W / 6} ${-H / 2} ${W / 2 - gridScale * 0.2} ${-H / 2 + gridScale * 0.1}`, { stroke: accent, strokeWidth: thin * 2.2, fill: '', strokeLineCap: 'round', objectCaching: false }));
      const hs = gridScale * 0.6;
      children.push(new fabric.Path(`M${W / 2 - hs * 1.2} ${-H / 2 - hs * 0.6}L${W / 2} ${-H / 2 + gridScale * 0.1}L${W / 2 - hs * 1.2} ${-H / 2 + hs * 0.9}`, { stroke: accent, strokeWidth: thin * 2.2, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round', objectCaching: false }));
      break;
    }
    case 'path': {
      children.push(new fabric.Path(`M${-W / 2} 0H${W / 2}`, { stroke: '#2563eb', strokeWidth: thin * 2, fill: '', strokeDashArray: [gridScale * 0.35, gridScale * 0.2], objectCaching: false }));
      const s = Math.min(H * 0.95, gridScale * 1.2);
      children.push(new fabric.Circle({ left: 0, top: 0, originX: 'center', originY: 'center', radius: s * 0.6, fill: '#eff6ff', stroke: '#2563eb', strokeWidth: thin, objectCaching: false }));
      children.push(...placeIcon('wheelchair_path', 0, 0, s * 0.9, '#2563eb', 1.8).slice(0, 3));
      break;
    }
    case 'measure': {
      const tick = Math.max(4, gridScale * 0.35);
      children.push(new fabric.Path(`M${-W / 2} 0H${W / 2}M${-W / 2} ${-tick}V${tick}M${W / 2} ${-tick}V${tick}`, { stroke: accent, strokeWidth: thin * 1.4, fill: '', strokeLineCap: 'round', objectCaching: false }));
      const meters = (W / gridScale).toFixed(2).replace(/\.?0+$/, '');
      children.push(new fabric.Rect({ left: 0, top: -tick - fontSize * 0.2, originX: 'center', originY: 'bottom', width: (meters.length + 2) * fontSize * 0.62 + 6, height: fontSize + 4, rx: 3, ry: 3, fill: '#fff1f2', stroke: accent, strokeWidth: thin * 0.8, objectCaching: false }));
      children.push(labelText(`${meters.replace('.', ',')} m`, { left: 0, top: -tick - fontSize * 0.2 - 2, originY: 'bottom', fontSize, fill: accent }));
      break;
    }
    case 'cctv': {
      const range = (Number(data.props?.range) || 8) * gridScale;
      const fov = Math.min(180, Math.max(10, Number(data.props?.fov) || 70));
      const a = fabric.util.degreesToRadians(fov / 2);
      // Viewing cone pointing along +x (the element's rotation sets the direction)
      children.push(new fabric.Path(`M0 0L${range * Math.cos(-a)} ${range * Math.sin(-a)}A${range} ${range} 0 0 1 ${range * Math.cos(a)} ${range * Math.sin(a)}Z`, { fill: withAlpha(accent, 0.12), stroke: withAlpha(accent, 0.45), strokeWidth: thin, strokeDashArray: [4, 3], objectCaching: false }));
      children.push(new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: W, height: H, rx: 3, ry: 3, fill: '#ffffff', stroke: accent, strokeWidth: thin, objectCaching: false }));
      children.push(...placeIcon(type, 0, 0, minDim * 0.85, accent, 1.8));
      break;
    }
    case 'marker':
    default: {
      children.push(new fabric.Rect({ left: 0, top: 0, originX: 'center', originY: 'center', width: W, height: H, rx: Math.min(4, minDim * 0.15), ry: Math.min(4, minDim * 0.15), fill: withAlpha(accent, 0.08), stroke: withAlpha(accent, 0.8), strokeWidth: thin, objectCaching: false }));
      const iconSize = Math.max(8, Math.min(minDim * 0.8, H - 2, gridScale * 2.2));
      children.push(...placeIcon(type, 0, 0, iconSize, accent, 1.8));
    }
  }
  return children;
}

// Normalised element data (size in metres, label, props, public visibility)
export function normalizeElementData(type, data = {}) {
  const def = ELEMENTS[type];
  return {
    type,
    lib: true,
    category: def.tab,
    widthM: Math.max(0.2, Number(data.widthM) || def.w),
    heightM: Math.max(0.2, Number(data.heightM) || def.h),
    label: typeof data.label === 'string' ? data.label : (def.defaultLabel || ''),
    props: { ...defaultProps(type), ...(data.props || {}) },
    publicVisible: data.publicVisible !== undefined ? Boolean(data.publicVisible) : def.publicDefault,
    // Caption (see elementCaptions.js): custom text ('' = default name) and per-element visibility
    caption: typeof data.caption === 'string' ? data.caption : (def.kind === 'text' || def.kind === 'shape' ? '' : String(data.label || '')),
    showCaption: data.showCaption !== false
  };
}

// Create a library element centred on (cx, cy)
export function createLibraryElement(type, { cx = 200, cy = 200, angle = 0, gridScale = 20, id = null, ...data } = {}) {
  const def = ELEMENTS[type];
  if (!def) return null;
  const vd = normalizeElementData(type, data);
  const W = vd.widthM * gridScale;
  const H = vd.heightM * gridScale;
  let obj;

  if (def.kind === 'text') {
    obj = new fabric.IText(vd.label || 'Teks Label', {
      originX: 'center', originY: 'center', left: cx, top: cy, angle,
      fontSize: Number(vd.props.fontSize) || 16,
      fontWeight: vd.props.bold ? 'bold' : 'normal',
      fill: vd.props.textColor || '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      editable: true
    });
    if (!vd.label) vd.label = 'Teks Label';
  } else if (def.kind === 'shape') {
    obj = new ShapeBox(vd.label, {
      originX: 'center', originY: 'center', left: cx, top: cy, angle,
      width: W, boxHeight: H,
      fontSize: Number(vd.props.fontSize) || 14,
      fontWeight: vd.props.bold ? 'bold' : 'normal',
      fill: vd.props.textColor || '#0f172a',
      textAlign: def.shape === 'textbox' ? 'left' : 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      styles: data.textStyles ? JSON.parse(JSON.stringify(data.textStyles)) : {},
      // the shape kind is read from venueData while the text is measured
      venueData: { ...vd },
      cornerColor: '#6366f1', cornerSize: 8, transparentCorners: false
    });
  } else if (def.kind === 'queue') {
    const lane = (Number(vd.props.laneWidth) || 1.2) * gridScale;
    const pts = Array.isArray(data.points) && data.points.length >= 2
      ? data.points
      : [{ x: -W / 2, y: -H / 2 }, { x: W / 2, y: -H / 2 }, { x: W / 2, y: 0 }, { x: -W / 2, y: 0 }, { x: -W / 2, y: H / 2 }, { x: W / 2, y: H / 2 }];
    obj = new QueueLine(pts.map(p => ({ x: p.x, y: p.y })), {
      fill: '', stroke: withAlpha(accentOf(type), 0.22), strokeWidth: lane, strokeLineJoin: 'round', strokeLineCap: 'round',
      objectCaching: false, strokeUniform: true
    });
    obj.arrowColor = accentOf(type);
    obj.setPositionByOrigin(new fabric.Point(cx, cy), 'center', 'center');
    obj.set({ angle });
  } else {
    obj = new fabric.Group(buildChildren(type, def, W, H, vd, gridScale), {
      subTargetCheck: false, cornerColor: '#6366f1', cornerSize: 8, transparentCorners: false, noScaleCache: true, objectCaching: false
    });
    // First child (hit area) is centred on the element centre
    const off = obj.getObjects()[0].getRelativeCenterPoint();
    const rot = fabric.util.rotateVector(off, fabric.util.degreesToRadians(angle));
    obj.set({ angle });
    obj.setPositionByOrigin(new fabric.Point(cx - rot.x, cy - rot.y), 'center', 'center');
  }
  obj.setCoords();
  obj.isVenueItem = true;
  obj.venueData = { id: id || `el_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`, ...vd, gridScale };
  applyLibraryBehavior(obj);
  return obj;
}

// Element centre in canvas coordinates (for groups: the hit-area centre)
export function elementCenter(obj) {
  const first = obj.getObjects?.()[0];
  if (first && obj.venueData?.lib) return fabric.util.transformPoint(first.getRelativeCenterPoint(), obj.calcTransformMatrix());
  return obj.getCenterPoint();
}

// Rebuild with changed data (size, label, props...) keeping id, centre, rotation, z-order, lock & visibility
export function rebuildLibraryElement(canvas, obj, changes = {}) {
  const current = obj.venueData;
  const def = ELEMENTS[current.type];
  // Text Box & Bentuk change in place: the text, its per-character colours and an ongoing edit are kept
  if (def.kind === 'shape') return updateShapeElement(obj, changes);
  const gridScale = current.gridScale || 20;
  const center = elementCenter(obj);
  const merged = {
    ...current,
    ...changes,
    props: { ...current.props, ...(changes.props || {}) }
  };
  if (def.kind === 'queue') {
    // keep the user's vertices (relative to the centre), scaled by any stretch
    const off = obj.pathOffset;
    merged.points = obj.points.map(p => ({ x: (p.x - off.x) * (obj.scaleX || 1), y: (p.y - off.y) * (obj.scaleY || 1) }));
  }
  if (def.kind === 'text' && obj.text !== undefined && changes.label === undefined) merged.label = obj.text;
  const next = createLibraryElement(current.type, {
    ...merged,
    cx: center.x,
    cy: center.y,
    angle: changes.angle !== undefined ? changes.angle : (obj.angle || 0),
    gridScale,
    id: current.id
  });
  next.visible = obj.visible !== false;
  // Keep data that is not part of the element definition (operational layer anchor, queue connections, layer flag)
  ['anchor', 'anchorOrphaned', 'connections'].forEach(k => { if (current[k] !== undefined && changes[k] === undefined) next.venueData[k] = current[k]; });
  if (obj.isOpsItem) next.isOpsItem = true;
  if (obj.isLocked) {
    next.isLocked = true;
    applyLibraryBehavior(next);
  }
  const index = canvas.getObjects().indexOf(obj);
  canvas.remove(obj);
  if (index >= 0) canvas.insertAt(index, next);
  else canvas.add(next);
  return next;
}

// Place new elements on their layer: zones / aisles / queues behind booths, markers on top
export function placeOnLayer(canvas, obj) {
  const def = ELEMENTS[obj.venueData?.type];
  if (!def) return;
  if (def.layer === 'bottom') {
    canvas.sendObjectToBack(obj);
    // stay above the background blueprint image
    const bp = canvas.getObjects().find(o => o.isBackgroundBlueprint);
    if (bp) canvas.sendObjectToBack(bp);
  } else {
    canvas.bringObjectToFront(obj);
  }
}

// Gates & turnstiles stick to walls (like doors) and align with doors placed on a wall
export function snapGateToWallOrDoor(obj, canvas, gridScale = 20) {
  const center = elementCenter(obj);
  const half = ((obj.venueData?.widthM || 1) * gridScale) / 2;
  let best = null;
  canvas.getObjects().forEach(target => {
    if (target === obj || !target.isVenueItem) return;
    const type = target.venueData?.type;
    const isWall = type === 'wall' || type === 'wall_line';
    const isDoor = type === 'door';
    if (!isWall && !isDoor) return;
    const tc = isDoor
      ? fabric.util.transformPoint(target.getObjects()[0].getRelativeCenterPoint(), target.calcTransformMatrix())
      : target.getCenterPoint();
    const theta = fabric.util.degreesToRadians(target.angle || 0);
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const halfLen = isDoor ? 0 : (target.width * Math.abs(target.scaleX || 1)) / 2;
    const halfThick = isDoor ? gridScale * 0.5 : (target.height * Math.abs(target.scaleY || 1)) / 2;
    const dx = center.x - tc.x;
    const dy = center.y - tc.y;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (Math.abs(along) > halfLen + (isDoor ? gridScale : half * 0.5)) return;
    const distance = Math.abs(across) + (isDoor ? Math.abs(along) : 0);
    if (distance > halfThick + gridScale) return;
    if (best && distance >= best.distance) return;
    const clamped = isDoor ? 0 : (halfLen > half ? Math.max(-halfLen + half, Math.min(halfLen - half, along)) : 0);
    best = { distance, point: new fabric.Point(tc.x + ux * clamped, tc.y + uy * clamped), angle: target.angle || 0 };
  });
  if (!best) return false;
  const current = ((obj.angle || 0) % 360 + 360) % 360;
  const options = [best.angle, best.angle + 180].map(a => ((a % 360) + 360) % 360);
  const diff = (a) => Math.min(Math.abs(a - current), 360 - Math.abs(a - current));
  obj.rotate(diff(options[0]) <= diff(options[1]) ? options[0] : options[1]);
  const after = elementCenter(obj);
  obj.set({ left: obj.left + (best.point.x - after.x), top: obj.top + (best.point.y - after.y) });
  obj.setCoords();
  return true;
}

// Queue line ends stick to a Ticket Box, Checker In or Entrance Gate within ~1 m.
// Returns the rebuilt queue (or null when no end is near a target).
export function connectQueueEnds(queue, canvas, gridScale = 20) {
  if (queue.venueData?.type !== 'queue_line') return null;
  const matrix = queue.calcTransformMatrix();
  const off = queue.pathOffset;
  const abs = queue.points.map(p => fabric.util.transformPoint(new fabric.Point(p.x - off.x, p.y - off.y), matrix));
  const targets = canvas.getObjects().filter(o => o !== queue && ELEMENTS[o.venueData?.type]?.queueTarget);
  const links = {};
  [0, abs.length - 1].forEach(i => {
    let best = null;
    targets.forEach(t => {
      const c = elementCenter(t);
      const r = Math.max(t.width * (t.scaleX || 1), t.height * (t.scaleY || 1)) / 2;
      const dist = Math.hypot(abs[i].x - c.x, abs[i].y - c.y);
      if (dist <= r + gridScale && (!best || dist < best.dist)) best = { dist, c, r, t };
    });
    if (!best) return;
    // Snap onto the target's edge, on the side the queue comes from
    const neighbour = abs[i === 0 ? 1 : abs.length - 2];
    const vx = neighbour.x - best.c.x;
    const vy = neighbour.y - best.c.y;
    const len = Math.hypot(vx, vy) || 1;
    abs[i] = new fabric.Point(best.c.x + (vx / len) * best.r, best.c.y + (vy / len) * best.r);
    links[i === 0 ? 'start' : 'end'] = best.t.venueData.id;
  });
  if (!Object.keys(links).length) return null;

  // Rebuild from absolute points (rotation is baked into the points)
  const minX = Math.min(...abs.map(p => p.x)); const maxX = Math.max(...abs.map(p => p.x));
  const minY = Math.min(...abs.map(p => p.y)); const maxY = Math.max(...abs.map(p => p.y));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const next = createLibraryElement('queue_line', {
    ...queue.venueData,
    points: abs.map(p => ({ x: p.x - cx, y: p.y - cy })),
    cx, cy, angle: 0,
    gridScale: queue.venueData.gridScale || gridScale,
    id: queue.venueData.id
  });
  next.venueData.connections = links;
  const index = canvas.getObjects().indexOf(queue);
  canvas.remove(queue);
  canvas.insertAt(Math.max(0, index), next);
  return next;
}

// Booths overlapping a pillar (new "Pilar Persegi" or the existing "Tiang Gedung")
export function findPillarConflicts(canvas) {
  const pillars = canvas.getObjects().filter(o => o.visible !== false && (ELEMENTS[o.venueData?.type]?.obstacle || o.venueData?.type === 'pillar'));
  const conflicts = new Set();
  if (!pillars.length) return conflicts;
  canvas.getObjects().forEach(o => {
    if (!o.isBooth) return;
    if (pillars.some(p => o.intersectsWithObject(p) || o.isContainedWithinObject(p) || p.isContainedWithinObject(o))) conflicts.add(o);
  });
  return conflicts;
}

// ============================================================================================
// Text Box & Bentuk (kind 'shape')
//   One ShapeBox object = a Fabric Textbox that paints its own shape (kotak, segitiga, jajaran genjang,
//   bulat, or none for the Text Box) behind the text. The text wraps to the shape's width and is edited
//   in place; per-character colours are Fabric text `styles`. Size is real width / boxHeight (never a
//   scale): side handles resize one direction, corners freely, Shift keeps the proportion, Alt resizes
//   from the centre, 0,2 m minimum. Colours live in venueData.props (SHAPE_STYLE_KEYS).
// ============================================================================================
export const MIN_SHAPE_M = 0.2;
export const SHAPE_STYLE_KEYS = ['fillColor', 'fillOpacity', 'fillNone', 'strokeColor', 'strokeOpacity', 'strokeWidth', 'strokeStyle', 'strokeNone', 'textColor'];
const SHAPE_BASE_STYLE = {
  fillColor: '#4f46e5', fillOpacity: 15, fillNone: false,
  strokeColor: '#4f46e5', strokeOpacity: 100, strokeWidth: 2, strokeStyle: 'solid', strokeNone: false,
  textColor: '#1e1b4b'
};
// Share of the width the text wraps in (the text stays inside round / slanted shapes)
const SHAPE_TEXT_AREA = { textbox: 1, rect: 0.9, ellipse: 0.72, triangle: 0.56, parallelogram: 0.66 };
const SHAPE_DEFAULTS_KEY = 'floorplan_shape_defaults';

export const isShapeElement = (obj) => Boolean(isLibraryElement(obj) && ELEMENTS[obj.venueData.type].kind === 'shape');
const baseShapeStyle = (type) => ({ ...SHAPE_BASE_STYLE, ...(ELEMENTS[type]?.style || {}) });
const pickStyle = (src = {}) => Object.fromEntries(SHAPE_STYLE_KEYS.filter(k => src[k] !== undefined).map(k => [k, src[k]]));

// Current colours of a shape element (built-in defaults filled in)
export const shapeStyleOf = (vd = {}) => ({ ...baseShapeStyle(vd.type), ...pickStyle(vd.props) });

// "Jadikan Default": per element type, in this browser
function readShapeDefault(type) {
  try { return pickStyle(JSON.parse(localStorage.getItem(SHAPE_DEFAULTS_KEY) || '{}')[type]); } catch (e) { return {}; }
}
export function saveShapeDefault(type, style) {
  try {
    const all = JSON.parse(localStorage.getItem(SHAPE_DEFAULTS_KEY) || '{}');
    all[type] = pickStyle(style);
    localStorage.setItem(SHAPE_DEFAULTS_KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

const dashFor = (style, width) => (style === 'dashed' ? [width * 4, width * 2.5] : style === 'dotted' ? [0.01, width * 2.2] : []);

export class ShapeBox extends fabric.Textbox {
  static type = 'ShapeBox';
  // boxHeight = height of the shape; the object grows taller only when the text needs more room
  static customProperties = ['boxHeight'];

  get shapeKind() { return ELEMENTS[this.venueData?.type]?.shape || 'rect'; }

  _textPadding() { return this.shapeKind === 'textbox' ? Math.min(8, this.width * 0.06) : 0; }
  _wrapWidth(width) { return Math.max(8, width * (SHAPE_TEXT_AREA[this.shapeKind] ?? 0.9) - 2 * this._textPadding()); }
  _wrapText(lines, desiredWidth) { return super._wrapText(lines, this._wrapWidth(desiredWidth)); }

  initDimensions() {
    if (!this.initialized) return;
    super.initDimensions();
    this.textHeight = this.height;
    this.height = Math.max(Number(this.boxHeight) || 0, this.textHeight);
  }

  // Text block centred in the shape (a triangle's text sits lower, where the shape is wider)
  _getTopOffset() {
    const textHeight = this.textHeight ?? this.height;
    return -textHeight / 2 + (this.shapeKind === 'triangle' ? this.height / 6 : 0);
  }

  _getLineLeftOffset(lineIndex) {
    const base = super._getLineLeftOffset(lineIndex);
    const inset = (this.width - this._wrapWidth(this.width)) / 2;
    if (this.textAlign === 'left' || this.textAlign === 'justify-left') return base + inset;
    if (this.textAlign === 'right' || this.textAlign === 'justify-right') return base - inset;
    return base;
  }

  _shapePath(ctx, inset) {
    const w = Math.max(0.5, this.width / 2 - inset);
    const h = Math.max(0.5, this.height / 2 - inset);
    ctx.beginPath();
    switch (this.shapeKind) {
      case 'ellipse':
        ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
        break;
      case 'triangle':
        ctx.moveTo(0, -h); ctx.lineTo(w, h); ctx.lineTo(-w, h); ctx.closePath();
        break;
      case 'parallelogram': {
        const slant = Math.min(w, w * 2 * 0.22);
        ctx.moveTo(-w + slant, -h); ctx.lineTo(w, -h); ctx.lineTo(w - slant, h); ctx.lineTo(-w, h); ctx.closePath();
        break;
      }
      default:
        ctx.rect(-w, -h, w * 2, h * 2);
    }
  }

  _render(ctx) {
    const s = shapeStyleOf(this.venueData);
    ctx.save();
    if (!s.fillNone && Number(s.fillOpacity) > 0) {
      this._shapePath(ctx, 0);
      ctx.fillStyle = withAlpha(s.fillColor, Math.min(100, Number(s.fillOpacity)) / 100);
      ctx.fill();
    }
    const sw = Math.max(0, Number(s.strokeWidth) || 0);
    if (!s.strokeNone && sw > 0 && Number(s.strokeOpacity) > 0) {
      this._shapePath(ctx, sw / 2); // stroke inside the outline: the size stays the size
      ctx.lineWidth = sw;
      ctx.strokeStyle = withAlpha(s.strokeColor, Math.min(100, Number(s.strokeOpacity)) / 100);
      ctx.lineJoin = this.shapeKind === 'triangle' || this.shapeKind === 'parallelogram' ? 'round' : 'miter';
      ctx.lineCap = s.strokeStyle === 'dotted' ? 'round' : 'butt';
      ctx.setLineDash(dashFor(s.strokeStyle, sw));
      ctx.stroke();
    }
    ctx.restore();
    super._render(ctx);
  }
}
fabric.classRegistry.setClass(ShapeBox);

// Resize without scaling: the pointer sets width / boxHeight directly (text re-wraps live)
const resizeShapeAction = (axis) => (eventData, transform, x, y) => {
  const t = transform.target;
  const min = MIN_SHAPE_M * (t.venueData?.gridScale || 20);
  if (!t.__resizeStart || t.__resizeStart.transform !== transform) t.__resizeStart = { transform, w: t.width, h: t.boxHeight || t.height };
  const start = t.__resizeStart;
  const local = fabric.controlsUtils.getLocalPoint(transform, transform.originX, transform.originY, x, y);
  // Pointer dragged past the opposite side: stop at the minimum instead of flipping
  const along = (value, origin, low, high) => (origin === low ? Math.max(0, value) : origin === high ? Math.max(0, -value) : Math.abs(value) * 2);
  let w = t.width;
  let h = t.boxHeight || t.height;
  if (axis !== 'y') w = along(local.x, transform.originX, 'left', 'right');
  if (axis !== 'x') h = along(local.y, transform.originY, 'top', 'bottom');
  if (axis === 'both' && eventData.shiftKey && start.w > 0 && start.h > 0) {
    const ratio = Math.max(w / start.w, h / start.h);
    w = start.w * ratio;
    h = start.h * ratio;
  } else if (!eventData.altKey && typeof t.canvas?.__snapShapeResize === 'function') {
    ({ w, h } = t.canvas.__snapShapeResize(t, transform, { w, h, axis }) || { w, h });
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (Math.abs(w - t.width) < 0.01 && Math.abs(h - (t.boxHeight || 0)) < 0.01) return false;
  t.set('width', w);
  t.boxHeight = h;
  t.initDimensions();
  t.dirty = true;
  return true;
};

let cachedShapeControls = null;
function shapeControls() {
  if (cachedShapeControls) return cachedShapeControls;
  const cu = fabric.controlsUtils;
  // Alt / Option pressed or released during the drag switches between resizing from the centre and from the
  // opposite side (Fabric only reads it when the drag starts). Done before the anchor is fixed for this step.
  const followAltKey = (handler) => (eventData, transform, x, y) => {
    if (!transform.__startOrigin) transform.__startOrigin = { x: transform.originX, y: transform.originY };
    const centred = Boolean(eventData.altKey);
    transform.originX = centred ? 'center' : transform.__startOrigin.x;
    transform.originY = centred ? 'center' : transform.__startOrigin.y;
    return handler(eventData, transform, x, y);
  };
  const wrap = (axis) => cu.wrapWithFireEvent('scaling', followAltKey(cu.wrapWithFixedAnchor(resizeShapeAction(axis))));
  const axisOf = { tl: 'both', tr: 'both', bl: 'both', br: 'both', ml: 'x', mr: 'x', mt: 'y', mb: 'y' };
  const actionOf = { both: 'scale', x: 'scaleX', y: 'scaleY' };
  const controls = {};
  Object.entries(cu.createObjectDefaultControls()).forEach(([key, control]) => {
    controls[key] = axisOf[key]
      ? new fabric.Control({ ...control, actionHandler: wrap(axisOf[key]), cursorStyleHandler: cu.scaleCursorStyleHandler, actionName: actionOf[axisOf[key]] })
      : control;
  });
  cachedShapeControls = controls;
  return controls;
}

// Size / text / props / rotation changes applied to the same object (keeps id, z-order, text styles)
export function updateShapeElement(obj, changes = {}) {
  const vd = obj.venueData;
  const gs = vd.gridScale || 20;
  const center = obj.getCenterPoint();
  const { props, label, widthM, heightM, angle, ...rest } = changes;
  Object.assign(vd, rest);
  if (label !== undefined) {
    obj.set('text', String(label));
    vd.label = obj.text;
  }
  if (props) {
    vd.props = { ...vd.props, ...props };
    if (props.fontSize !== undefined) obj.set('fontSize', Math.max(6, Math.min(120, Number(props.fontSize) || 14)));
    if (props.bold !== undefined) obj.set('fontWeight', props.bold ? 'bold' : 'normal');
    if (props.textColor !== undefined) obj.set('fill', props.textColor);
  }
  if (widthM !== undefined) {
    vd.widthM = Math.max(MIN_SHAPE_M, Math.round(Number(widthM) * 100) / 100);
    obj.set('width', vd.widthM * gs);
  }
  if (heightM !== undefined) {
    vd.heightM = Math.max(MIN_SHAPE_M, Math.round(Number(heightM) * 100) / 100);
    obj.boxHeight = vd.heightM * gs;
  }
  if (angle !== undefined) obj.set('angle', Number(angle) || 0);
  obj.initDimensions();
  obj.setPositionByOrigin(center, 'center', 'center');
  obj.setCoords();
  obj.dirty = true;
  return obj;
}

// After a drag / resize: any scale (e.g. from a multi-selection) becomes real size, then size & text go to venueData
export function syncShapeElement(obj) {
  const vd = obj.venueData;
  const gs = vd.gridScale || 20;
  const sx = Math.abs(obj.scaleX || 1);
  const sy = Math.abs(obj.scaleY || 1);
  if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
    const center = obj.getCenterPoint();
    obj.set({ width: obj.width * sx, scaleX: 1, scaleY: 1, flipX: false, flipY: false });
    obj.boxHeight = (obj.boxHeight || obj.height) * sy;
    obj.initDimensions();
    obj.setPositionByOrigin(center, 'center', 'center');
  }
  vd.widthM = Math.max(MIN_SHAPE_M, Math.round((obj.width / gs) * 100) / 100);
  vd.heightM = Math.max(MIN_SHAPE_M, Math.round(((obj.boxHeight || obj.height) / gs) * 100) / 100);
  vd.label = obj.text;
  delete obj.__resizeStart;
  obj.setCoords();
  return obj;
}

/**
 * Colours of a shape element. `textColor` goes to the selected characters while the text is being edited
 * with a selection, otherwise to the whole text (per-character colours are then cleared).
 */
export function applyShapeStyle(obj, style = {}) {
  const vd = obj.venueData;
  const { textColor, ...rest } = pickStyle(style);
  const next = { ...vd.props, ...rest };
  if (textColor !== undefined) {
    const start = obj.selectionStart;
    const end = obj.selectionEnd;
    if (obj.isEditing && end > start) {
      obj.setSelectionStyles({ fill: textColor }, start, end);
    } else {
      next.textColor = textColor;
      obj.set('fill', textColor);
      if (obj.styles && Object.keys(obj.styles).length) obj.removeStyle('fill');
    }
  }
  vd.props = next;
  obj.dirty = true;
  return obj;
}

