import db from '../db.js';
import { floorplanBoothGeometry, computeFloorplanMergeGroups } from './boothMergeGroups.js';
import { invoiceCodeTokens, CONTRACT_KINDS } from './contractBilling.js';
import {
  buildTemplateIndex, resolveTemplatePrice, resolveGroupTemplatePrices, discountAmountOf, sizeLabelOf, priceModeOf, initialPriceMode
} from '../../../shared/templatePrice.js';

// Harga booth mengikuti Katalog Template (AGENTS.md §32): preview, apply, undo and the follow-up after a template
// changes. The matching itself is shared/templatePrice.js `resolveTemplatePrice`.

const lower = (v) => String(v || '').trim().toLowerCase();

/** Katalog Template of a project: its own tiers plus the shared ('global') ones. */
export function catalogFor(floorplanId) {
  return db.prepare(`SELECT * FROM booth_categories WHERE project_id IS NULL OR project_id = 'global' OR project_id = ? ORDER BY sort_order ASC, created_at ASC`).all(floorplanId || '');
}

/** Booth numbers (lower case) that have a live contract invoice (Menunggu Bayar, DP or Lunas): their price is locked. */
export function lockedBoothCodes(floorplanId) {
  const rows = db.prepare(`
    SELECT booth_code, invoice_number FROM invoices
    WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
      AND COALESCE(invoice_kind, 'full') IN (${CONTRACT_KINDS.map(k => `'${k}'`).join(', ')}) AND TRIM(COALESCE(booth_code, '')) != ''
  `).all(floorplanId);
  const locked = new Map();
  rows.forEach(r => invoiceCodeTokens(r.booth_code).forEach(t => { if (!locked.has(lower(t))) locked.set(lower(t), r.invoice_number); }));
  return locked;
}

const lockOf = (locked, code) => {
  for (const t of invoiceCodeTokens(code)) if (locked.has(lower(t))) return locked.get(lower(t));
  return null;
};

// Auto-merge groups: Map(code -> { codes, total }) where total = the group's size when it forms a rectangle
function mergeTotals(floorplanId) {
  const out = new Map();
  let geo = null;
  let groups = [];
  try {
    geo = floorplanBoothGeometry(floorplanId);
    groups = computeFloorplanMergeGroups(floorplanId).groups;
  } catch (e) {
    return out;
  }
  const polyOf = new Map((geo?.booths || []).map(b => [lower(b.code), b.poly]));
  groups.forEach(g => {
    const polys = g.codes.map(c => polyOf.get(lower(c))).filter(Boolean);
    let total = null;
    if (polys.length === g.codes.length && polys.length > 1) {
      const xs = polys.flat().map(p => p.x);
      const ys = polys.flat().map(p => p.y);
      const w = (Math.max(...xs) - Math.min(...xs)) / geo.gridScale;
      const h = (Math.max(...ys) - Math.min(...ys)) / geo.gridScale;
      // a rectangle when the members fill their outer box
      if (Math.abs(w * h - g.totalAreaM2) <= Math.max(0.05, g.totalAreaM2 * 0.01)) total = { widthM: Math.round(w * 10) / 10, heightM: Math.round(h * 10) / 10 };
    }
    g.codes.forEach(c => out.set(lower(c), { codes: g.codes, total, booths: g.booths }));
  });
  return out;
}

const STATUS_LABELS = { available: 'Available', reserved: 'Reserved', sold: 'Sold', free: 'Gratis', maintenance: 'Maintenance' };
export const GROUP_ORDER = ['change', 'same', 'custom', 'none', 'conflict', 'locked'];

/**
 * One row per booth: current price, template price and the group it falls in.
 *   change   template price differs, will be changed (ticked by default)
 *   same     already at the template price
 *   custom   Harga Khusus: differs, only changed when ticked
 *   none     no template of this size (also free booths)
 *   conflict several templates of this size with different prices
 *   locked   has an invoice: never changed here
 */
export function templatePriceRows(floorplanId) {
  const index = buildTemplateIndex(catalogFor(floorplanId));
  const locked = lockedBoothCodes(floorplanId);
  const groups = mergeTotals(floorplanId);
  const booths = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId);
  const groupPrices = new Map();

  return booths.map(b => {
    const key = lower(b.code);
    const merge = groups.get(key);
    if (merge && !groupPrices.has(merge)) groupPrices.set(merge, resolveGroupTemplatePrices(merge.booths, merge.total, index));
    const r = merge ? (groupPrices.get(merge).get(b.code) || resolveTemplatePrice(b, index)) : resolveTemplatePrice(b, index);
    const price = Math.round(Number(b.price) || 0);
    const mode = priceModeOf(b.price_mode) || initialPriceMode(b, index);
    const status = lower(b.status) || 'available';
    const isFree = status === 'free' || lower(b.category) === 'free';
    const invoiceNumber = lockOf(locked, b.code);

    let group;
    let note = '';
    if (isFree) { group = 'none'; note = 'Booth gratis: tidak memakai harga template'; }
    else if (r.status === 'none') { group = 'none'; note = `Tidak ada template ukuran ${r.label}`; }
    else if (r.status === 'conflict') { group = 'conflict'; note = `Ada ${r.templates.length} template ukuran ini dengan harga berbeda: ${r.templates.map(t => `${t.name} Rp ${t.price.toLocaleString('id-ID')}`).join(', ')}`; }
    else if (price === r.price) { group = 'same'; note = mode === 'custom' ? 'Harga khusus, kebetulan sama dengan template' : ''; }
    else if (invoiceNumber) { group = 'locked'; note = `Sudah ada invoice ${invoiceNumber}. Bila harga memang harus diubah, hapus lalu terbitkan ulang invoice lewat menu Invoice.`; }
    else if (mode === 'custom') { group = 'custom'; note = 'Harga khusus: hanya diubah bila dicentang'; }
    else { group = 'change'; }
    if (r.fromGroup && r.status === 'match') note = [`Gabungan ${merge.codes.join('+')} (${r.groupLabel}): Rp ${r.groupPrice.toLocaleString('id-ID')} dibagi menurut luas`, note].filter(Boolean).join('. ');
    else if (merge && r.status === 'match') note = [`Gabungan ${merge.codes.join('+')}: harga template tiap booth`, note].filter(Boolean).join('. ');

    // A share of a group's template price is not the booth's own template price: it is kept as Harga Khusus, so a
    // later save or template change never replaces it with the price of the booth's own size
    const own = r.fromGroup ? resolveTemplatePrice(b, index) : r;
    const newMode = r.fromGroup && r.status === 'match' && !(own.status === 'match' && own.price === r.price) ? 'custom' : 'template';
    const templatePrice = r.status === 'match' ? r.price : null;
    const newDiscount = templatePrice === null ? Number(b.discount_amount) || 0 : discountAmountOf(templatePrice, b.discount_type, b.discount_value);
    return {
      id: b.id, code: b.code, sizeLabel: sizeLabelOf(b.width_m, b.height_m), widthM: b.width_m, heightM: b.height_m,
      status, statusLabel: STATUS_LABELS[status] || status, ownerName: b.owner_name || '',
      priceMode: mode, newMode, currentPrice: price, templatePrice, diff: templatePrice === null ? 0 : templatePrice - price,
      discountAmount: Number(b.discount_amount) || 0, newDiscountAmount: newDiscount,
      netDiff: templatePrice === null ? 0 : (templatePrice - newDiscount) - (price - (Number(b.discount_amount) || 0)),
      group, note, invoiceNumber: invoiceNumber || '', selectable: group === 'change' || group === 'custom', checked: group === 'change'
    };
  }).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || String(a.code).localeCompare(String(b.code), 'id', { numeric: true }));
}

// Write prices to the booths table and the saved canvas (boothData). `changes`: [{ code, price, priceMode, discountAmount }]
function writePrices(floorplanId, changes) {
  if (!changes.length) return;
  const update = db.prepare(`UPDATE booths SET price = ?, price_mode = ?, discount_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = ?`);
  changes.forEach(c => update.run(c.price, c.priceMode, c.discountAmount, floorplanId, lower(c.code)));
  const fp = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(floorplanId);
  if (!fp?.canvas_fabric_json) return;
  const fabric = JSON.parse(fp.canvas_fabric_json);
  if (!Array.isArray(fabric.objects)) return;
  const byCode = new Map(changes.map(c => [lower(c.code), c]));
  let touched = false;
  fabric.objects.forEach(o => {
    const c = o?.isBooth && o.boothData ? byCode.get(lower(o.boothData.code || o.boothData.booth_number)) : null;
    if (!c) return;
    Object.assign(o.boothData, { price: c.price, priceMode: c.priceMode, discountAmount: c.discountAmount });
    touched = true;
  });
  if (touched) db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fabric), floorplanId);
}

const batchDto = (row) => row ? {
  id: row.id, kind: row.kind, userName: row.user_name || '', userRole: row.user_role || '', createdAt: row.created_at,
  undoneAt: row.undone_at || null, undoneBy: row.undone_by || '', changes: JSON.parse(row.changes_json || '[]')
} : null;

/** The latest batch of this floorplan (the only one "Batalkan perubahan terakhir" can undo), or null. */
export function lastPriceBatch(floorplanId) {
  return batchDto(db.prepare(`SELECT * FROM price_sync_batches WHERE floorplan_id = ? AND kind = 'sync' ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(floorplanId));
}

/**
 * Apply the template price to the chosen booths in ONE transaction (all or nothing). Only booths of the groups
 * 'change' and 'custom' can be changed; they become price_mode 'template'. Returns { batch, changes, skipped }.
 */
export function applyTemplatePrices(floorplanId, codes, user, { kind = 'sync' } = {}) {
  return db.transaction(() => {
    const wanted = new Set([...codes].map(lower));
    const rows = templatePriceRows(floorplanId).filter(r => wanted.has(lower(r.code)));
    const skipped = rows.filter(r => !r.selectable).map(r => ({ code: r.code, group: r.group, note: r.note }));
    const changes = rows.filter(r => r.selectable).map(r => ({
      id: r.id, code: r.code, sizeLabel: r.sizeLabel, oldPrice: r.currentPrice, newPrice: r.templatePrice, oldMode: r.priceMode, newMode: r.newMode,
      oldDiscountAmount: r.discountAmount, newDiscountAmount: r.newDiscountAmount
    }));
    if (!changes.length) return { batch: null, changes, skipped };
    writePrices(floorplanId, changes.map(c => ({ code: c.code, price: c.newPrice, priceMode: c.newMode, discountAmount: c.newDiscountAmount })));
    const id = `PSB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(`INSERT INTO price_sync_batches (id, floorplan_id, kind, user_id, user_name, user_role, changes_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, floorplanId, kind, user?.id || null, user?.name || '', user?.role || '', JSON.stringify(changes));
    return { batch: batchDto(db.prepare('SELECT * FROM price_sync_batches WHERE id = ?').get(id)), changes, skipped };
  })();
}

/**
 * Undo the latest batch: every booth that still has the price that batch gave it (and got no invoice since) returns
 * to its old price and mode. Returns { batch, restored, skipped } or null when there is nothing to undo.
 */
export function undoLastPriceBatch(floorplanId, user) {
  return db.transaction(() => {
    const row = db.prepare(`SELECT * FROM price_sync_batches WHERE floorplan_id = ? AND kind = 'sync' ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(floorplanId);
    if (!row || row.undone_at) return null;
    const locked = lockedBoothCodes(floorplanId);
    const restored = [];
    const skipped = [];
    JSON.parse(row.changes_json || '[]').forEach(c => {
      const booth = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = ?').get(floorplanId, lower(c.code));
      if (!booth) return skipped.push({ code: c.code, note: 'Booth sudah tidak ada' });
      if (Math.round(Number(booth.price) || 0) !== c.newPrice) return skipped.push({ code: c.code, note: 'Harga sudah diubah lagi setelah itu' });
      if (lockOf(locked, booth.code)) return skipped.push({ code: c.code, note: 'Sudah ada invoice' });
      return restored.push({ code: booth.code, oldPrice: c.newPrice, newPrice: c.oldPrice, priceMode: priceModeOf(c.oldMode) || 'custom',
        discountAmount: discountAmountOf(c.oldPrice, booth.discount_type, booth.discount_value) });
    });
    writePrices(floorplanId, restored.map(r => ({ code: r.code, price: r.newPrice, priceMode: r.priceMode, discountAmount: r.discountAmount })));
    db.prepare('UPDATE price_sync_batches SET undone_at = CURRENT_TIMESTAMP, undone_by = ? WHERE id = ?').run(user?.name || '', row.id);
    return { batch: batchDto(row), restored, skipped };
  })();
}

/**
 * A template was added, changed or removed: every booth that follows the template ('template', no invoice) takes the
 * new price, in every project that uses the catalog. Returns [{ floorplanId, changes }].
 */
export function followTemplateChange(user) {
  const out = [];
  db.prepare('SELECT id FROM floorplans WHERE deleted_at IS NULL').all().forEach(fp => {
    const codes = templatePriceRows(fp.id).filter(r => r.group === 'change').map(r => r.code);
    if (!codes.length) return;
    const res = applyTemplatePrices(fp.id, codes, user, { kind: 'template-change' });
    if (res.changes.length) out.push({ floorplanId: fp.id, changes: res.changes });
  });
  return out;
}
