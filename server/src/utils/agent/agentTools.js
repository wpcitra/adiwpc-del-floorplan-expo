import db from '../../db.js';
import { readFile, searchCode, listFiles, RepoAccessError } from './repoTools.js';

// Tools the AI agent may call (AGENTS.md §27). Each stage has a whitelist; the model can only call tools that are
// in the list sent with the request, and the executor refuses anything else. Tahap 1: read-only.
//   Tool results are DATA for the model (wrapped by the runner), never instructions.

// Pages / modules the user can attach as context ("Pilih Halaman/Modul"): the main files of each feature
export const MODULES = [
  { key: 'pengaturan', label: 'Pengaturan & Konfigurasi', files: ['client/src/pages/admin/SettingsPage.jsx', 'client/src/components/admin/ClaudeApiKeySettings.jsx'] },
  { key: 'studio', label: 'Floorplan Studio (Denah Sales)', files: ['client/src/pages/app/AdminDashboard.jsx', 'client/src/components/admin/CanvasEditor.jsx', 'client/src/components/admin/ToolSidebar.jsx', 'client/src/components/admin/PropertyPanel.jsx'] },
  { key: 'operasional', label: 'Denah Operasional', files: ['client/src/pages/app/OpsFloorplanStudio.jsx', 'server/src/routes/opsRoutes.js', 'client/src/utils/opsLayer.js'] },
  { key: 'shapes', label: 'Shapes, Text Box & Warna', files: ['client/src/utils/elementLibrary.js', 'client/src/components/admin/ShapeStyleSection.jsx', 'client/src/components/admin/ShapeColorPicker.jsx'] },
  { key: 'snap', label: 'Snap ke Booth / Elemen', files: ['client/src/utils/boothSnap.js'] },
  { key: 'salin', label: 'Salin / Duplikat Elemen', files: ['client/src/utils/copyRules.js'] },
  { key: 'live', label: 'Live Floorplan & Booking', files: ['client/src/pages/public/LiveFloorplan.jsx', 'client/src/components/public/BookingModal.jsx', 'server/src/routes/orderRoutes.js'] },
  { key: 'invoice', label: 'Invoice & Pembayaran', files: ['client/src/pages/admin/InvoicePage.jsx', 'server/src/routes/invoiceRoutes.js', 'server/src/utils/contractBilling.js'] },
  { key: 'exhibitor', label: 'Data Exhibitor', files: ['client/src/pages/admin/ExhibitorTable.jsx'] },
  { key: 'dashboard', label: 'Dashboard', files: ['client/src/pages/admin/SalesCharts.jsx', 'server/src/routes/statsRoutes.js'] },
  { key: 'user', label: 'Login, User & Hak Akses', files: ['server/src/middleware/auth.js', 'server/src/routes/authRoutes.js', 'client/src/utils/roles.js'] },
  { key: 'maintenance', label: 'Pusat Maintenance', files: ['client/src/pages/admin/MaintenancePage.jsx', 'server/src/routes/maintenanceRoutes.js', 'server/src/utils/errorTracker.js'] }
];

const TOOL_DEFS = {
  read_file: {
    description: 'Baca isi satu file kode di repository (dengan nomor baris). Gunakan start_line/end_line untuk file besar. File rahasia (.env), database, backup, dan node_modules tidak bisa dibaca.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relatif dari root repository, mis. client/src/pages/admin/SettingsPage.jsx' },
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 }
      },
      required: ['path']
    }
  },
  search_code: {
    description: 'Cari teks (tidak peka huruf besar/kecil) di seluruh kode, atau di dalam satu folder. Mengembalikan file:baris: potongan baris.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path_prefix: { type: 'string', description: 'Folder opsional, mis. client/src' },
        regex: { type: 'boolean', description: 'true jika query adalah regular expression' }
      },
      required: ['query']
    }
  },
  list_files: {
    description: 'Daftar file di repository (atau di satu folder), opsional disaring dengan potongan nama.',
    input_schema: {
      type: 'object',
      properties: { dir: { type: 'string' }, contains: { type: 'string' } }
    }
  },
  list_errors: {
    description: 'Daftar error website yang tertangkap di Pusat Maintenance (data pribadi sudah disamarkan).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['aktif', 'baru', 'ditangani', 'selesai', 'diabaikan', 'semua'] },
        priority: { type: 'string', enum: ['KRITIS', 'TINGGI', 'NORMAL'] }
      }
    }
  },
  get_error: {
    description: 'Detail satu error (pesan, lokasi kode, stack trace tersamarkan, kejadian terakhir).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  db_schema: {
    description: 'Struktur database (CREATE TABLE) tanpa isi data. Opsional satu tabel.',
    input_schema: { type: 'object', properties: { table: { type: 'string' } } }
  }
};

// Tahap 1: read-only. Later stages add plan / write / test tools to their own whitelist.
export const STAGE_TOOLS = { 1: ['read_file', 'search_code', 'list_files', 'list_errors', 'get_error', 'db_schema'] };
export const CURRENT_STAGE = 1;

export function toolDefinitions(stage = CURRENT_STAGE) {
  const names = STAGE_TOOLS[stage] || [];
  return names.map((name, i) => ({
    name,
    description: TOOL_DEFS[name].description,
    input_schema: TOOL_DEFS[name].input_schema,
    // cache the (stable) tool list with the system prompt: cheaper follow-up calls
    ...(i === names.length - 1 ? { cache_control: { type: 'ephemeral' } } : {})
  }));
}

// Progress text shown in the chat while a tool runs
export const TOOL_PHASES = {
  read_file: (i) => `Membaca kode… ${i.path || ''}`,
  search_code: (i) => `Mencari di kode… "${String(i.query || '').slice(0, 40)}"`,
  list_files: () => 'Melihat daftar file…',
  list_errors: () => 'Membaca daftar error…',
  get_error: (i) => `Membaca error ${i.id || ''}…`,
  db_schema: () => 'Membaca struktur database…'
};

function errorRows(status = 'aktif', priority) {
  const where = [];
  const params = [];
  if (status === 'aktif') where.push("status IN ('baru', 'ditangani')");
  else if (status && status !== 'semua') { where.push('status = ?'); params.push(status); }
  if (priority) { where.push('priority = ?'); params.push(priority); }
  return db.prepare(`
    SELECT id, priority, status, feature, area, message, location, occurrences, affected_users, last_seen_at
    FROM error_groups ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE priority WHEN 'KRITIS' THEN 0 WHEN 'TINGGI' THEN 1 ELSE 2 END, last_seen_at DESC LIMIT 40
  `).all(...params);
}

export function errorContext(id) {
  const g = db.prepare('SELECT * FROM error_groups WHERE id = ?').get(String(id || ''));
  if (!g) return null;
  const events = db.prepare('SELECT occurred_at, user_role, method, url, status_code, browser, app_version FROM error_events WHERE group_id = ? ORDER BY id DESC LIMIT 8').all(g.id);
  return {
    id: g.id, priority: g.priority, status: g.status, feature: g.feature, source: g.source, type: g.error_type,
    message: g.message, location: g.location, area: g.area, occurrences: g.occurrences, affectedUsers: g.affected_users,
    firstSeen: g.first_seen_at, lastSeen: g.last_seen_at, stack: g.sample_stack, recentEvents: events
  };
}

/**
 * Run one tool call. Unknown tools and tools outside the stage whitelist are refused (the model cannot invent
 * capabilities). Returns { ok, content } where content is a JSON-able value.
 */
export function executeTool(name, input = {}, { stage = CURRENT_STAGE } = {}) {
  if (!(STAGE_TOOLS[stage] || []).includes(name)) {
    return { ok: false, content: `Tool "${name}" tidak tersedia. Agent pada tahap ini hanya bisa membaca kode, error, dan struktur database; tidak bisa mengubah apa pun.` };
  }
  try {
    switch (name) {
      case 'read_file': return { ok: true, content: readFile(input.path, { startLine: input.start_line, endLine: input.end_line }) };
      case 'search_code': return { ok: true, content: searchCode(input.query, { pathPrefix: input.path_prefix, regex: Boolean(input.regex) }) };
      case 'list_files': return { ok: true, content: listFiles(input.dir || '', { contains: input.contains }) };
      case 'list_errors': return { ok: true, content: errorRows(input.status, input.priority) };
      case 'get_error': {
        const e = errorContext(input.id);
        return e ? { ok: true, content: e } : { ok: false, content: `Error ${input.id} tidak ditemukan.` };
      }
      case 'db_schema': {
        const rows = input.table
          ? db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = ?").all(String(input.table))
          : db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
        return { ok: true, content: rows };
      }
      default: return { ok: false, content: `Tool "${name}" tidak dikenal.` };
    }
  } catch (e) {
    if (e instanceof RepoAccessError) return { ok: false, content: e.message };
    return { ok: false, content: `Tool gagal: ${String(e.message || e).slice(0, 300)}` };
  }
}
