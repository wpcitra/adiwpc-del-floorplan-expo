import db from '../db.js';
import { boothSummary } from '../routes/boothActionRoutes.js';
import { findBooth } from './contractBilling.js';
import { createSession, hashToken } from '../middleware/auth.js';
import { writeAuditLog } from '../middleware/audit.js';
import { invoiceDates } from '../../../shared/invoiceDates.js';

// WhatsApp assistant for staff (AGENTS.md §45): fixed commands, no AI. MENU, TERSEDIA [ukuran], BOOTH <nomor>,
// CARI <nama>, RINGKASAN read the data; BOOKING <nomor> asks the tenant data one question at a time and INVOICE <nomor>
// prepares the booth's first invoice. A booking / invoice is only saved when the staff member answers YA, through the
// same web endpoints in that user's name.
const lower = (v) => String(v || '').trim().toLowerCase();
const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
// = canRegisterTenant (client utils/roles.js) for the roles this assistant serves; Keuangan does not book
const CAN_BOOK = ['superadmin', 'sales'];
const WAIT_MS = 10 * 60 * 1000;
const CONFIRM_HINT = 'Balas YA untuk menyimpan atau BATAL. Berlaku 10 menit.';
const YES = ['ya', 'iya', 'yes'];
const NO = ['batal', 'tidak', 'no', 'cancel', 'gajadi', 'tidakjadi'];
const STATUS_LABEL = { available: 'Tersedia', reserved: 'Reserved', booked: 'Reserved', sold: 'Sold', free: 'Free', maintenance: 'Maintenance' };
const pending = new Map(); // user id -> prepared request waiting for YA { kind, label, body, expires }
const drafts = new Map(); // user id -> booking being asked { fp, booths, step, data, expires }

const openPlanOf = (floorplanId, code) => db.prepare(`
  SELECT payment_type, dp_percent FROM orders
  WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
    AND TRIM(COALESCE(invoice_number, '')) = '' AND LOWER(TRIM(booth_code)) = LOWER(TRIM(?))
  ORDER BY created_at DESC LIMIT 1`).get(floorplanId, code);

// The project the assistant works on: the latest published floorplan (else the latest one)
const currentProject = () => db.prepare(`
  SELECT id, title FROM floorplans WHERE deleted_at IS NULL
  ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`).get();

// Booth numbers after a command. Numbers may contain spaces ("UH 13 14"), so the whole text is tried first, then a
// list separated by commas or spaces ("A-01, A-02" / "A-01 A-02").
function boothCodesFrom(rest, fp) {
  const whole = String(rest || '').trim().replace(/^#/, '');
  if (!whole || findBooth(fp.id, whole, '')) return whole ? [whole] : [];
  const parts = whole.includes(',') ? whole.split(',') : whole.split(/\s+/);
  return [...new Set(parts.map(p => p.trim().replace(/^#/, '')).filter(Boolean))];
}

function bookableBooths(codes, fp) {
  if (!codes.length) return { error: 'Sebutkan nomor booth, misalnya: BOOKING A-12' };
  if (codes.length > 10) return { error: 'Maksimal 10 booth dalam satu booking.' };
  const booths = [];
  for (const code of codes) {
    const b = findBooth(fp.id, code, '');
    if (!b) return { error: `Booth ${code} tidak ditemukan di project ${fp.title}. Ketik TERSEDIA untuk melihat booth yang kosong.` };
    if (lower(b.status) !== 'available' || String(b.owner_name || '').trim()) return { error: `Booth ${b.code} sudah ${STATUS_LABEL[lower(b.status)] || b.status}${b.owner_name ? ` (${b.owner_name})` : ''}, tidak bisa dibooking.` };
    booths.push(b);
  }
  return { booths };
}

// ---------- Reading ----------
const menuText = (fp) => [
  `Asisten Floorplan · project ${fp.title}`,
  'Ketik salah satu perintah:',
  '- TERSEDIA : booth yang masih kosong (TERSEDIA 3x3 untuk ukuran tertentu)',
  '- BOOTH A-12 : detail satu booth',
  '- CARI kopi : cari tenant / brand',
  '- RINGKASAN : ringkasan project',
  '- BOOKING A-12 : booking booth (Sales / Super Admin)',
  '- INVOICE A-12 : terbitkan invoice booth',
  'Booking dan invoice baru disimpan setelah Anda membalas YA.'
].join('\n');

function availableText(fp, sizeText) {
  const size = lower(sizeText).replace(/\s|m/g, '').replace('×', 'x');
  const rows = db.prepare(`
    SELECT code, width_m, height_m, category, price, discount_amount FROM booths
    WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(status) = 'available' AND TRIM(COALESCE(owner_name, '')) = ''
    ORDER BY code`).all(fp.id)
    .filter(b => !size || [`${b.width_m}x${b.height_m}`, `${b.height_m}x${b.width_m}`].includes(size));
  if (!rows.length) return `Tidak ada booth kosong${size ? ` berukuran ${size}` : ''} di project ${fp.title}.`;
  const lines = rows.slice(0, 40).map(b => `- ${b.code} · ${b.width_m}x${b.height_m} m · ${b.category || '-'} · ${rupiah(Math.max(0, (Number(b.price) || 0) - (Number(b.discount_amount) || 0)))}`);
  if (rows.length > 40) lines.push(`…dan ${rows.length - 40} booth lainnya. Persempit dengan ukuran, misalnya TERSEDIA 3x3.`);
  return [`Booth tersedia${size ? ` ukuran ${size}` : ''} · ${fp.title}: ${rows.length} booth`, ...lines, 'Untuk booking ketik BOOKING <nomor booth>.'].join('\n');
}

function searchText(fp, query) {
  const q = lower(query).replace(/^#/, '');
  if (!q) return 'Ketik kata yang dicari, misalnya: CARI kopi';
  const words = q.split(/\s+/).filter(Boolean);
  const escape = (w) => w.replace(/[\\%_]/g, '\\$&');
  const rows = db.prepare(`
    SELECT code, status, owner_name FROM booths
    WHERE floorplan_id = ? AND deleted_at IS NULL
      AND (LOWER(TRIM(code)) = ? OR ${words.map(() => "LOWER(COALESCE(owner_name, '')) LIKE ? ESCAPE '\\'").join(' AND ')})
    ORDER BY code LIMIT 15`).all(fp.id, q, ...words.map(w => `%${escape(w)}%`));
  if (!rows.length) return `Tidak ditemukan tenant / booth "${query.trim()}" di project ${fp.title}.`;
  return [`Hasil "${query.trim()}" · ${fp.title}:`, ...rows.map(r => `- ${r.code} · ${STATUS_LABEL[lower(r.status)] || r.status} · ${r.owner_name || '(belum ada tenant)'}`), 'Detail: ketik BOOTH <nomor>.'].join('\n');
}

function boothText(fp, code, role) {
  const s = code ? boothSummary(fp.id, code.trim().replace(/^#/, ''), '', role) : null;
  if (!s) return code ? `Booth ${code.trim()} tidak ditemukan di project ${fp.title}.` : 'Ketik nomor booth, misalnya: BOOTH A-12';
  const b = s.booth;
  const plan = db.prepare(`
    SELECT payment_type, dp_percent FROM orders
    WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED' AND LOWER(TRIM(booth_code)) = LOWER(TRIM(?))
    ORDER BY created_at DESC LIMIT 1`).get(fp.id, b.code);
  return [
    `Booth ${b.code} · ${fp.title}`,
    `- Status: ${b.statusLabel}`,
    `- Ukuran: ${b.widthM}x${b.heightM} m · ${b.category || '-'}`,
    `- Tenant: ${b.ownerName || '(belum ada)'}`,
    b.picName && `- PIC: ${b.picName}${b.phone ? ` (${b.phone})` : ''}`,
    `- Harga: ${rupiah(b.price)}${b.discountAmount > 0 ? ` · diskon ${rupiah(b.discountAmount)}${b.discountReason ? ` (${b.discountReason})` : ''}` : ''} · tagihan ${rupiah(b.netTotal)}`,
    plan && `- Rencana bayar: ${plan.payment_type === 'dp' ? `DP ${plan.dp_percent}%` : 'Bayar Penuh'}`,
    s.invoices.length
      ? `- Invoice: ${s.invoices.map(i => `${i.invoice_number} (${rupiah(i.total_amount)}, ${String(i.payment_status).toUpperCase() === 'PAID' ? 'lunas' : 'belum lunas'})`).join('; ')}`
      : '- Invoice: belum ada',
    s.invoices.length && `- Kontrak: dibayar ${rupiah(s.contract.paid)} dari ${rupiah(s.contract.total)}, sisa ${rupiah(s.contract.remaining)}`,
    b.notes && `- Catatan: ${b.notes}`
  ].filter(Boolean).join('\n');
}

function summaryText(fp) {
  const byStatus = db.prepare('SELECT LOWER(status) AS status, COUNT(*) AS n FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL GROUP BY 1').all(fp.id);
  const money = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(paid_amount), 0) AS paid
    FROM invoices WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(payment_status) != 'CANCELED' AND COALESCE(invoice_kind, 'full') != 'facility'`).get(fp.id);
  const count = {};
  byStatus.forEach(r => { const label = STATUS_LABEL[r.status] || r.status; count[label] = (count[label] || 0) + r.n; });
  return [
    `Ringkasan ${fp.title}`,
    ...Object.entries(count).map(([label, n]) => `- ${label}: ${n}`),
    `- Invoice: ${money.n} · tagihan ${rupiah(money.total)} · sudah dibayar ${rupiah(money.paid)}`
  ].join('\n');
}

// ---------- Booking (asked one question at a time) and invoice ----------
const BOOKING_STEPS = [
  ['brand', 'Nama brand / tenant?'],
  ['nama_pic', 'Nama PIC?'],
  ['whatsapp', 'Nomor WhatsApp tenant? (contoh 081234567890)'],
  ['kategori', 'Kategori brand? (contoh: F&B, Fashion, Kosmetik)'],
  ['rencana', 'Rencana bayar? Balas PENUH, atau DP dengan persennya, misalnya DP 30.']
];

function startBooking(user, fp, rest) {
  if (!CAN_BOOK.includes(user.role)) return `Akun ${user.role} tidak dapat membuat booking. Booking dibuat oleh Sales atau Super Admin.`;
  const found = bookableBooths(boothCodesFrom(rest, fp), fp);
  if (found.error) return found.error;
  pending.delete(user.id);
  drafts.set(user.id, { fp, booths: found.booths, step: 0, data: {}, expires: Date.now() + WAIT_MS });
  const total = found.booths.reduce((sum, b) => sum + Math.max(0, (Number(b.price) || 0) - (Number(b.discount_amount) || 0)), 0);
  return [
    `Booking booth ${found.booths.map(b => `${b.code} (${b.width_m}x${b.height_m} m)`).join(', ')} · ${rupiah(total)}.`,
    `Saya tanyakan datanya satu per satu (ketik BATAL untuk berhenti).`,
    BOOKING_STEPS[0][1]
  ].join('\n');
}

function answerBookingStep(user, d, text) {
  const value = String(text || '').trim().slice(0, 100);
  const [key, question] = BOOKING_STEPS[d.step];
  if (!value) return question;
  if (key === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return 'Nomor WhatsApp tenant belum benar. Ketik nomornya, contoh 081234567890.';
    d.data.whatsapp = value;
  } else if (key === 'rencana') {
    const dp = /dp\D*(\d{1,3})/i.exec(value);
    if (dp) {
      const pct = Number(dp[1]);
      if (!(pct >= 1 && pct <= 99)) return 'DP harus 1 sampai 99 persen. Balas PENUH, atau misalnya DP 30.';
      d.data.dp = pct;
    } else if (/penuh|lunas|full/i.test(value)) {
      d.data.dp = 0;
    } else {
      return 'Balas PENUH, atau DP dengan persennya, misalnya DP 30.';
    }
  } else {
    d.data[key] = value;
  }
  d.step += 1;
  d.expires = Date.now() + WAIT_MS;
  if (d.step < BOOKING_STEPS.length) return BOOKING_STEPS[d.step][1];
  drafts.delete(user.id);
  return prepareBooking(user, d);
}

// The finished booking waits for YA. The booths are checked again: someone may have booked them meanwhile.
function prepareBooking(user, d) {
  const found = bookableBooths(d.booths.map(b => b.code), d.fp);
  if (found.error) return found.error;
  const { fp } = d;
  const { brand, nama_pic: pic, whatsapp, kategori, dp } = d.data;
  const total = found.booths.reduce((sum, b) => sum + Math.max(0, (Number(b.price) || 0) - (Number(b.discount_amount) || 0)), 0);
  pending.set(user.id, {
    kind: 'booking', label: `booking booth ${found.booths.map(b => b.code).join(', ')} untuk ${brand}`, expires: Date.now() + WAIT_MS,
    body: {
      floorplanId: fp.id, boothCodes: found.booths.map(b => b.code), boothIds: found.booths.map(b => b.id), boothCode: found.booths[0].code,
      brandName: brand, fullName: pic, phone: whatsapp, brandCategory: kategori,
      bookingType: 'booking', deferInvoice: true, source: 'admin', paymentType: dp ? 'dp' : 'full', dpPercent: dp || 0, notes: 'Dibuat via WhatsApp'
    }
  });
  return [
    `Konfirmasi BOOKING (project ${fp.title}):`,
    `- Booth: ${found.booths.map(b => `${b.code} (${b.width_m}x${b.height_m} m)`).join(', ')}`,
    `- Tenant: ${brand} · kategori ${kategori}`,
    `- PIC: ${pic} (${whatsapp})`,
    `- Rencana bayar: ${dp ? `DP ${dp}%` : 'Bayar Penuh'}`,
    `- Harga booth: ${rupiah(total)} (sebelum PPN; invoice dibuat terpisah)`,
    CONFIRM_HINT
  ].join('\n');
}

function prepareInvoice(user, fp, rest) {
  const code = String(rest || '').trim().replace(/^#/, '');
  if (!code) return 'Ketik nomor booth, misalnya: INVOICE A-12';
  const s = boothSummary(fp.id, code, '', user.role);
  if (!s) return `Booth ${code} tidak ditemukan di project ${fp.title}.`;
  if (s.invoices.length) return `Booth ${s.booth.code} sudah punya invoice (${s.invoices.map(i => i.invoice_number).join(', ')}). Ketik BOOTH ${s.booth.code} untuk detailnya.`;
  const act = s.actions.invoice;
  if (!act.enabled) return act.reason;
  if (act.mode === 'booking') return `Booth ${s.booth.code} belum punya tenant. Booking dulu: BOOKING ${s.booth.code}`;
  const plan = openPlanOf(fp.id, s.booth.code);
  const pct = plan?.payment_type === 'dp' ? Number(plan.dp_percent) || 0 : 0;
  const total = s.invoicePreview.total;
  pending.set(user.id, { kind: 'invoice', label: `invoice booth ${s.booth.code}`, expires: Date.now() + WAIT_MS, body: { floorplanId: fp.id, boothCode: s.booth.code } });
  return [
    `Konfirmasi INVOICE (project ${fp.title}):`,
    `- Booth: ${s.booth.code} · ${s.booth.ownerName}`,
    pct ? `- Jenis: Invoice DP ${pct}% (sekitar ${rupiah((total * pct) / 100)} dari total kontrak ${rupiah(total)})` : `- Jenis: Invoice Penuh, total ${rupiah(total)}`,
    'PDF invoice dikirim ke WhatsApp ini setelah terbit.',
    CONFIRM_HINT.replace('menyimpan', 'menerbitkan')
  ].join('\n');
}

// YA: the prepared request goes through the web endpoint itself, with a short session of this staff member, so the
// role rules, the checks (booth taken, double invoice) and the audit log are exactly those of the web pages.
async function runConfirmed(user, action) {
  const session = createSession(user.id, { headers: { 'user-agent': 'Asisten WhatsApp' }, socket: {} });
  const call = (method, path, body) => fetch(`http://127.0.0.1:${process.env.PORT || 5001}/api${path}`, {
    method, headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
  });
  const audit = (summary) => writeAuditLog({ user, category: 'WhatsApp', action: `${action.kind === 'booking' ? 'Booking' : 'Buat invoice'} via WhatsApp`, target: action.label, summary });
  try {
    if (action.kind === 'booking') {
      const res = await call('POST', '/orders/checkout', action.body);
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.success === false) return `Booking gagal: ${out.error || `HTTP ${res.status}`}`;
      audit(`Booth ${action.body.boothCodes.join(', ')} Reserved untuk ${action.body.brandName} (${action.body.paymentType === 'dp' ? `DP ${action.body.dpPercent}%` : 'Bayar Penuh'})`);
      return `Booking tersimpan: booth ${action.body.boothCodes.join(', ')} sekarang Reserved untuk ${action.body.brandName}.\nUntuk menerbitkan invoice, ketik: INVOICE ${action.body.boothCodes[0]}`;
    }
    const res = await call('POST', '/booth-actions/invoice', action.body);
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.success === false) return `Invoice gagal diterbitkan: ${out.error || `HTTP ${res.status}`}`;
    const inv = out.invoice;
    let cfg = {};
    try { cfg = JSON.parse(db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template')?.config_json || '{}'); } catch (e) {}
    const due = invoiceDates(inv, { dueDays: cfg.invoiceDueDays }).dueDate;
    const kind = inv.invoice_kind === 'dp' ? 'Invoice DP' : 'Invoice Penuh';
    audit(`${kind} ${inv.invoice_number} untuk booth ${action.body.boothCode}, total ${rupiah(inv.total_amount)}`);
    const parts = [`${kind} ${inv.invoice_number} terbit untuk booth ${action.body.boothCode} (${inv.company_name || '-'}).\n- Total: ${rupiah(inv.total_amount)}\n- Jatuh tempo: ${new Date(`${due}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`];
    const pdf = await call('GET', `/invoices/${encodeURIComponent(inv.id)}/pdf`);
    if (pdf.ok) parts.push({ file: Buffer.from(await pdf.arrayBuffer()), filename: `Invoice-${String(inv.invoice_number).replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`, caption: `${kind} ${inv.invoice_number}` });
    else parts.push(`PDF belum bisa dibuat di server (${(await pdf.json().catch(() => ({}))).error || `HTTP ${pdf.status}`}). Unduh dari aplikasi.`);
    return parts;
  } finally {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(session.token));
  }
}

// YA / BATAL: only the staff member's own answer saves a prepared request
async function answerConfirmation(user, yes) {
  const p = pending.get(user.id);
  pending.delete(user.id);
  const live = p && Date.now() <= p.expires ? p : null;
  if (!live) return p ? 'Konfirmasi sudah kedaluwarsa (lebih dari 10 menit). Ulangi permintaannya.' : 'Tidak ada permintaan yang menunggu konfirmasi. Ketik MENU untuk daftar perintah.';
  if (!yes) return `Permintaan ${live.label} dibatalkan. Tidak ada yang disimpan.`;
  try { return await runConfirmed(user, live); } catch (e) { console.error('WhatsApp aksi gagal:', e); return 'Maaf, permintaan gagal diproses. Coba lagi atau pakai aplikasi web.'; }
}

/** Answer one staff message: one text, or several parts (texts and { file, filename, caption }). */
export async function answerStaff(user, text) {
  const raw = String(text || '').trim();
  const word = lower(raw).replace(/[^a-z]/g, '');

  // A booking being asked: every message is the answer to the current question, BATAL stops it
  const d = drafts.get(user.id);
  if (d && Date.now() > d.expires) drafts.delete(user.id);
  else if (d) {
    if (NO.includes(word)) { drafts.delete(user.id); return 'Booking dibatalkan. Tidak ada yang disimpan.'; }
    return answerBookingStep(user, d, raw);
  }
  if (YES.includes(word)) return answerConfirmation(user, true);
  if (NO.includes(word)) return answerConfirmation(user, false);

  const fp = currentProject();
  if (!fp) return 'Belum ada project / denah di aplikasi.';
  const [, cmd = '', rest = ''] = /^(\S+)\s*([\s\S]*)$/.exec(raw) || [];
  switch (lower(cmd)) {
    case 'tersedia': case 'kosong': return availableText(fp, rest);
    case 'booth': return boothText(fp, rest, user.role);
    case 'cari': return searchText(fp, rest);
    case 'ringkasan': return summaryText(fp);
    case 'booking': return startBooking(user, fp, rest);
    case 'invoice': return prepareInvoice(user, fp, rest);
    default: return menuText(fp);
  }
}
