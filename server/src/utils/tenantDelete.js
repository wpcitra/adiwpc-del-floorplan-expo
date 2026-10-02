import db from '../db.js';
import { CONTRACT_KINDS, kindOf, invoiceCodeTokens, invoicePaidAmount, removeBoothFromInvoice, recalcContract } from './contractBilling.js';
import { syncPaymentStatusFromInvoices, applyBoothChangesToCanvas } from './syncPaymentStatus.js';
import { templatePriceRows, applyTemplatePrices } from './templatePricing.js';

// Hapus Tenant (AGENTS.md §33): remove a tenant's participation in ONE project. The booths return to Available, the
// bookings are archived, unpaid invoices go to the invoice trash, paid invoices stay as "Dibatalkan – tenant dihapus".
// Everything is planned first (`planTenantDelete`, also the preview of the confirmation) and executed in one transaction.

const lower = (v) => String(v || '').trim().toLowerCase();
const statusOf = (inv) => String(inv?.payment_status || 'UNPAID').toUpperCase();
const KIND_LABELS = { dp: 'DP', settlement: 'Pelunasan', full: 'Penuh', facility: 'Fasilitas' };
const STATUS_LABELS = { PAID: 'Lunas', PARTIAL: 'Uang Muka / DP', PENDING: 'Menunggu Verifikasi', UNPAID: 'Menunggu Bayar', CANCELED: 'Batal' };
const BOOTH_TENANT_COLUMNS = ['status', 'owner_name', 'brand_category', 'pic_name', 'email', 'phone', 'registration_source', 'registered_by',
  'exhibitor_id', 'merge_separate', 'discount_type', 'discount_value', 'discount_amount', 'discount_reason'];

const liveBooths = (floorplanId) => db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId);
const liveOrders = (floorplanId) => db.prepare('SELECT * FROM orders WHERE floorplan_id = ? AND deleted_at IS NULL').all(floorplanId);
const boothHasCode = (booth, codeSet) => invoiceCodeTokens(booth.code).some(t => codeSet.has(lower(t))) || codeSet.has(lower(booth.code));

/**
 * A tenant row of Data Exhibitor (its `id` is a booking id, or the booth id for a tenant set in the Studio) ->
 * { floorplanId, company, codes }. null when the id is unknown or already deleted.
 */
export function tenantOfRow(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(String(id || ''));
  if (order) return { ref: order.id, floorplanId: order.floorplan_id, company: order.company_name, codes: invoiceCodeTokens(order.booth_code) };
  const booth = db.prepare(`SELECT * FROM booths WHERE id = ? AND deleted_at IS NULL AND TRIM(COALESCE(owner_name, '')) != ''`).get(String(id || ''));
  if (booth) return { ref: booth.id, floorplanId: booth.floorplan_id, company: booth.owner_name, codes: [booth.code] };
  return null;
}

/** Every booth number of this tenant (brand) in the project: booths it holds now plus booths of its bookings. */
export function tenantBoothCodes(floorplanId, company, seedCodes = []) {
  const brand = lower(company);
  const booths = liveBooths(floorplanId);
  const seed = new Set(seedCodes.map(lower));
  // the same exhibitor under another spelling of the brand: follow the exhibitor ID of the row's own booth
  const exhibitorIds = new Set(booths.filter(b => boothHasCode(b, seed) && lower(b.owner_name) === brand && b.exhibitor_id).map(b => b.exhibitor_id));
  const codes = new Map();
  const add = (code) => { if (String(code || '').trim()) codes.set(lower(code), String(code).trim()); };
  seedCodes.forEach(add);
  booths.filter(b => lower(b.status) !== 'available' && (lower(b.owner_name) === brand || exhibitorIds.has(b.exhibitor_id))).forEach(b => add(b.code));
  liveOrders(floorplanId).filter(o => lower(o.company_name) === brand).forEach(o => invoiceCodeTokens(o.booth_code).forEach(add));
  return [...codes.values()].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
}

/**
 * What deleting `company` from the booths `codes` of the project would do. Nothing is written.
 * A booth that meanwhile belongs to another tenant is never touched: only this tenant's bookings and invoices go.
 */
export function planTenantDelete(floorplanId, company, codes) {
  const brand = lower(company);
  const codeSet = new Set(codes.map(lower));
  const booths = liveBooths(floorplanId).filter(b => boothHasCode(b, codeSet));
  const owned = booths.filter(b => lower(b.status) !== 'available' && lower(b.owner_name) === brand);
  const ownedCodes = new Set(owned.flatMap(b => [lower(b.code), ...invoiceCodeTokens(b.code).map(lower)]));
  const orders = liveOrders(floorplanId).filter(o => lower(o.company_name) === brand && invoiceCodeTokens(o.booth_code).some(t => codeSet.has(lower(t))));

  const invoices = db.prepare(`
    SELECT * FROM invoices WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED' AND TRIM(COALESCE(booth_code, '')) != ''
    ORDER BY created_at ASC
  `).all(floorplanId).filter(inv => {
    const tokens = invoiceCodeTokens(inv.booth_code).map(lower);
    if (!tokens.some(t => codeSet.has(t))) return false;
    // this tenant's invoice by name, or the invoice of a booth this tenant holds now
    return lower(inv.company_name) === brand || tokens.some(t => ownedCodes.has(t));
  }).map(inv => {
    const tokens = invoiceCodeTokens(inv.booth_code);
    const paid = invoicePaidAmount(inv);
    const leaving = tokens.filter(t => codeSet.has(lower(t)));
    const shared = CONTRACT_KINDS.includes(kindOf(inv)) && leaving.length < tokens.length;
    return { inv, paid, leaving, action: shared ? 'unshare' : paid > 0 ? 'cancel' : 'delete' };
  });

  const facilityRequests = db.prepare(`
    SELECT * FROM facility_requests WHERE deleted_at IS NULL AND (project_id = ? OR project_id = 'global' OR project_id IS NULL)
  `).all(floorplanId).filter(r => lower(r.company_name) === brand && invoiceCodeTokens(r.booth_code).some(t => codeSet.has(lower(t))));

  const contract = invoices.filter(i => CONTRACT_KINDS.includes(kindOf(i.inv)));
  const first = owned[0] || null;
  const order = orders[0] || null;
  return {
    floorplanId, company: owned[0]?.owner_name || orders[0]?.company_name || String(company || '').trim(), brand,
    picName: first?.pic_name || order?.pic_name || '', phone: first?.phone || order?.phone || '', email: first?.email || order?.email || '',
    brandCategory: first?.brand_category || order?.brand_category || '',
    codes: [...codeSet].map(c => codes.find(x => lower(x) === c) || c),
    booths, owned, orders, invoices, facilityRequests,
    totalAmount: contract.length
      ? contract.reduce((acc, i) => acc + (Number(i.inv.total_amount) || 0), 0)
      : owned.reduce((acc, b) => acc + Math.max(0, (Number(b.price) || 0) - (Number(b.discount_amount) || 0)), 0),
    paidAmount: invoices.reduce((acc, i) => acc + i.paid, 0),
    hasPayment: invoices.some(i => i.paid > 0),
    hasInvoice: invoices.length > 0,
    // "Lunas" / "Uang Muka (DP)" / "Menunggu Bayar", from the money received on the tenant's invoices
    paymentStatus: (() => {
      const paid = invoices.reduce((acc, i) => acc + i.paid, 0);
      const billed = contract.reduce((acc, i) => acc + (Number(i.inv.total_amount) || 0), 0);
      return paid > 0 && billed > 0 && paid >= billed - 1 ? 'Lunas' : paid > 0 ? 'Uang Muka (DP)' : 'Menunggu Bayar';
    })(),
    empty: !owned.length && !orders.length && !invoices.length
  };
}

/** The plan as the confirmation shows it. */
export const planDto = (plan) => ({
  company: plan.company, picName: plan.picName, phone: plan.phone, email: plan.email, brandCategory: plan.brandCategory,
  boothCodes: plan.codes,
  booths: plan.codes.map(code => {
    const b = plan.booths.find(x => lower(x.code) === lower(code) || invoiceCodeTokens(x.code).some(t => lower(t) === lower(code)));
    const mine = Boolean(b && plan.owned.includes(b));
    return { code, status: b ? lower(b.status) : 'missing', ownedByTenant: mine, willBeReleased: mine,
      note: !b ? 'Booth sudah tidak ada di denah' : mine ? '' : lower(b.status) === 'available' ? 'Booth sudah Available' : `Booth sekarang milik ${b.owner_name || 'tenant lain'}: tidak diubah` };
  }),
  invoices: plan.invoices.map(i => ({
    id: i.inv.id, invoiceNumber: i.inv.invoice_number, kind: kindOf(i.inv), kindLabel: KIND_LABELS[kindOf(i.inv)] || 'Invoice', boothCode: i.inv.booth_code,
    totalAmount: Number(i.inv.total_amount) || 0, paidAmount: i.paid, paymentStatus: statusOf(i.inv), statusLabel: STATUS_LABELS[statusOf(i.inv)] || statusOf(i.inv), action: i.action
  })),
  facilityRequestCount: plan.facilityRequests.length,
  hasFacilityForm: plan.facilityRequests.length > 0,
  totalAmount: plan.totalAmount, paidAmount: plan.paidAmount, hasPayment: plan.hasPayment, hasInvoice: plan.hasInvoice,
  paymentStatus: plan.paymentStatus,
  // typed confirmation (booth number / "HAPUS") is needed for a tenant with a payment or an issued invoice
  needsConfirmation: plan.hasPayment || plan.hasInvoice,
  empty: plan.empty
});

const BOOTH_RESET = `
  UPDATE booths SET status = 'available', owner_name = '', brand_category = '', pic_name = '', email = '', phone = '',
    discount_type = 'nominal', discount_value = 0, discount_amount = 0, discount_reason = '', exhibitor_id = '', merge_separate = 0,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?`;
const CANVAS_EMPTY = { picName: '', email: '', phone: '', brandCategory: '', mergeSeparate: false, discountType: 'nominal', discountValue: 0, discountAmount: 0, discountReason: '', priceLocked: false };

/**
 * Execute a plan in ONE transaction (any failure rolls everything back). Returns the deleted_tenants record id,
 * the released booths and the warnings (e.g. a shared paid invoice that kept its amount).
 */
export function executeTenantDelete(plan, user, { reason = '', scope = 'booth', ref = '' } = {}) {
  const actor = user?.name || user?.role || 'Admin';
  const warnings = [];
  const id = `DT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  db.transaction(() => {
    const snapshot = { booths: [], orders: [], invoices: [], facilityRequests: [] };

    // 1. Invoices: unpaid -> invoice trash; paid -> kept as "Dibatalkan – tenant dihapus"; shared contract -> the booth leaves it
    plan.invoices.forEach(({ inv, paid, action, leaving }) => {
      if (action === 'unshare') {
        leaving.forEach(code => {
          const fresh = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id);
          const { warning } = removeBoothFromInvoice(fresh, code, `tenant dihapus oleh ${actor}`);
          if (warning) warnings.push(warning);
        });
        snapshot.invoices.push({ id: inv.id, invoiceNumber: inv.invoice_number, action, boothCode: inv.booth_code, removedCodes: leaving });
        return;
      }
      if (action === 'cancel') {
        db.prepare(`UPDATE invoices SET payment_status = 'CANCELED', remaining_amount = 0,
            notes = COALESCE(notes, '') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(` [Dibatalkan – tenant dihapus oleh ${actor} pada ${nowStr}${reason ? `: ${reason}` : ''}]`, inv.id);
      } else {
        db.prepare('UPDATE invoices SET deleted_at = ?, deleted_by = ?, deleted_by_role = ?, delete_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(nowStr, actor, user?.role || '', `Tenant ${plan.company} dihapus${reason ? `: ${reason}` : ''}`, inv.id);
        if (kindOf(inv) === 'dp') db.prepare('UPDATE invoices SET related_invoice_id = NULL WHERE related_invoice_id = ? AND deleted_at IS NULL').run(inv.id);
      }
      snapshot.invoices.push({ id: inv.id, invoiceNumber: inv.invoice_number, action, kind: kindOf(inv), boothCode: inv.booth_code,
        totalAmount: Number(inv.total_amount) || 0, paidAmount: paid, previousStatus: statusOf(inv), previousRemaining: Number(inv.remaining_amount) || 0 });
    });

    // 2. Bookings of this tenant on these booths: archived
    plan.orders.forEach(o => {
      db.prepare('UPDATE orders SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(nowStr, actor, o.id);
      snapshot.orders.push({ id: o.id, boothCode: o.booth_code, paymentStatus: o.payment_status });
    });

    // 3. Booths this tenant holds: back to Available, without the tenant's private discount
    plan.owned.forEach(b => {
      snapshot.booths.push({ id: b.id, code: b.code, ...Object.fromEntries(BOOTH_TENANT_COLUMNS.map(k => [k, b[k]])) });
      db.prepare(BOOTH_RESET).run(b.id);
    });
    applyBoothChangesToCanvas(plan.floorplanId, plan.owned.map(b => ({ id: String(b.id || ''), code: b.code, boothStatus: 'available', ownerName: '', exhibitorId: '', extra: CANVAS_EMPTY })));

    // 4. Facility requests of the tenant: archived
    plan.facilityRequests.forEach(r => {
      db.prepare('UPDATE facility_requests SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(nowStr, actor, r.id);
      snapshot.facilityRequests.push({ id: r.id, boothCode: r.booth_code });
    });

    // 5. The contracts that remain (shared invoices) and the booth statuses follow the invoices
    plan.invoices.filter(i => i.action === 'unshare').forEach(i => {
      const fresh = db.prepare('SELECT * FROM invoices WHERE id = ?').get(i.inv.id);
      if (fresh?.booth_code) recalcContract(plan.floorplanId, fresh.booth_code, '');
    });

    // 6. The released booths follow their price rule again: 'template' booths take the template price (§32)
    const released = new Set(plan.owned.map(b => lower(b.code)));
    const follow = templatePriceRows(plan.floorplanId).filter(r => r.group === 'change' && released.has(lower(r.code))).map(r => r.code);
    if (follow.length) applyTemplatePrices(plan.floorplanId, follow, user, { kind: 'template-change' });

    db.prepare(`
      INSERT INTO deleted_tenants (id, floorplan_id, company_name, pic_name, phone, email, brand_category, scope, booth_codes, total_amount, paid_amount,
        snapshot_json, tenant_ref, payment_status, delete_reason, deleted_by, deleted_by_role, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, plan.floorplanId, plan.company, plan.picName, plan.phone, plan.email || null, plan.brandCategory, scope, plan.codes.join(', '),
      plan.totalAmount, plan.paidAmount, JSON.stringify(snapshot), String(ref || ''), plan.paymentStatus, reason, actor, user?.role || '', nowStr);
  })();
  syncPaymentStatusFromInvoices();
  return { id, released: plan.owned.map(b => b.code), warnings };
}

const recordDto = (r) => {
  const snap = JSON.parse(r.snapshot_json || '{}');
  return {
    id: r.id, floorplanId: r.floorplan_id, company: r.company_name, picName: r.pic_name || '', phone: r.phone || '', brandCategory: r.brand_category || '',
    scope: r.scope, boothCodes: String(r.booth_codes || '').split(',').map(s => s.trim()).filter(Boolean),
    totalAmount: Number(r.total_amount) || 0, paidAmount: Number(r.paid_amount) || 0,
    invoices: (snap.invoices || []).map(i => ({ invoiceNumber: i.invoiceNumber, action: i.action, paidAmount: i.paidAmount || 0 })),
    deleteReason: r.delete_reason || '', deletedBy: r.deleted_by || '', deletedByRole: r.deleted_by_role || '', deletedAt: r.deleted_at,
    paymentStatus: r.payment_status || '', tenantRef: r.tenant_ref || '',
    restoredAt: r.restored_at || null, restoredBy: r.restored_by || '', restoreNote: r.restore_note || '',
    projectTitle: r.project_title || '', projectInTrash: Boolean(r.project_deleted_at)
  };
};

/** Tempat Sampah Tenant: deletions that were not restored yet, newest first. */
export function deletedTenants() {
  return db.prepare(`
    SELECT dt.*, fp.title AS project_title, fp.deleted_at AS project_deleted_at
    FROM deleted_tenants dt LEFT JOIN floorplans fp ON fp.id = dt.floorplan_id
    WHERE dt.restored_at IS NULL ORDER BY dt.deleted_at DESC, dt.rowid DESC LIMIT 500
  `).all().map(recordDto);
}

/**
 * Restore a deleted tenant ("Urungkan"): bookings, booths, invoices and facility requests return as they were.
 * Refused (`code: 'BOOTH_TAKEN'`) when a booth is no longer Available and empty. Returns null when the record is
 * unknown or already restored.
 */
export function restoreTenant(id, user) {
  // `id` is the deletion record, or the tenant row id that was deleted (its latest deletion)
  const row = db.prepare('SELECT * FROM deleted_tenants WHERE (id = ? OR tenant_ref = ?) AND restored_at IS NULL ORDER BY deleted_at DESC, rowid DESC LIMIT 1').get(String(id || ''), String(id || ''));
  if (!row) return null;
  const fp = db.prepare('SELECT id, title, deleted_at FROM floorplans WHERE id = ?').get(row.floorplan_id);
  if (!fp || fp.deleted_at) return { error: `Project tenant ini ${fp ? `("${fp.title}") ada di Tempat Sampah` : 'sudah tidak ada'}. Pulihkan project-nya lebih dulu.`, code: 'PROJECT_IN_TRASH' };
  const snap = JSON.parse(row.snapshot_json || '{}');
  // A booth another tenant took meanwhile is never taken back: nothing is restored
  const taken = (snap.booths || []).map(b => {
    const now = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = ?').get(row.floorplan_id, lower(b.code));
    if (!now) return { code: b.code, note: 'booth sudah tidak ada di denah' };
    return lower(now.status) !== 'available' || String(now.owner_name || '').trim() ? { code: b.code, note: `sudah dipakai ${now.owner_name || 'tenant lain'}` } : null;
  }).filter(Boolean);
  if (taken.length) {
    return { code: 'BOOTH_TAKEN', conflicts: taken, error: `Tenant ${row.company_name} tidak dapat dipulihkan: booth ${taken.map(t => `${t.code} ${t.note}`).join('; ')}.` };
  }
  const actor = user?.name || 'Super Admin';
  const restoredBooths = [];
  const conflicts = [];
  const notes = [];

  db.transaction(() => {
    (snap.booths || []).forEach(b => {
      const now = db.prepare('SELECT * FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = ?').get(row.floorplan_id, lower(b.code));
      if (!now) return conflicts.push({ code: b.code, note: 'Booth sudah tidak ada di denah' });
      if (lower(now.status) !== 'available' || String(now.owner_name || '').trim()) return conflicts.push({ code: b.code, note: `Booth sudah dipakai ${now.owner_name || 'tenant lain'}` });
      db.prepare(`UPDATE booths SET ${BOOTH_TENANT_COLUMNS.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...BOOTH_TENANT_COLUMNS.map(k => b[k] ?? (k === 'merge_separate' || k.startsWith('discount_v') || k === 'discount_amount' ? 0 : '')), now.id);
      restoredBooths.push({ id: String(now.id), code: now.code, snap: b });
    });
    const back = new Set(restoredBooths.flatMap(b => [lower(b.code), ...invoiceCodeTokens(b.code).map(lower)]));
    const boothBack = (code) => invoiceCodeTokens(code).every(t => back.has(lower(t)));

    (snap.orders || []).forEach(o => {
      // booth still free: the booking is active again; booth taken: the booking returns canceled (tenant without booth)
      if (boothBack(o.boothCode)) db.prepare('UPDATE orders SET deleted_at = NULL WHERE id = ?').run(o.id);
      else db.prepare("UPDATE orders SET deleted_at = NULL, payment_status = 'CANCELED' WHERE id = ?").run(o.id);
    });

    (snap.invoices || []).forEach(i => {
      if (i.action === 'unshare') return notes.push(`Invoice ${i.invoiceNumber} adalah kontrak gabungan: booth ${(i.removedCodes || []).join(', ')} tidak dimasukkan kembali otomatis.`);
      if (!boothBack(i.boothCode)) return notes.push(`Invoice ${i.invoiceNumber} tidak dipulihkan karena booth-nya bentrok.`);
      if (i.action === 'delete') {
        db.prepare('UPDATE invoices SET deleted_at = NULL, deleted_by = NULL, deleted_by_role = NULL, restored_at = CURRENT_TIMESTAMP, restored_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NOT NULL')
          .run(actor, i.id);
      } else if (i.action === 'cancel') {
        db.prepare(`UPDATE invoices SET payment_status = ?, remaining_amount = ?, notes = COALESCE(notes, '') || ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND UPPER(COALESCE(payment_status, '')) = 'CANCELED'`)
          .run(i.previousStatus || 'UNPAID', i.previousRemaining || 0, ` [Dipulihkan bersama tenant oleh ${actor}]`, i.id);
      }
      return null;
    });
    // a restored DP is subtracted by its Pelunasan again
    db.prepare(`
      UPDATE invoices SET related_invoice_id = (
        SELECT d.id FROM invoices d WHERE d.floorplan_id = invoices.floorplan_id AND d.deleted_at IS NULL AND d.invoice_kind = 'dp'
          AND UPPER(COALESCE(d.payment_status, '')) != 'CANCELED' AND LOWER(TRIM(d.booth_code)) = LOWER(TRIM(invoices.booth_code)) LIMIT 1)
      WHERE floorplan_id = ? AND deleted_at IS NULL AND invoice_kind = 'settlement' AND related_invoice_id IS NULL
    `).run(row.floorplan_id);

    (snap.facilityRequests || []).forEach(r => {
      if (boothBack(r.boothCode)) db.prepare('UPDATE facility_requests SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').run(r.id);
    });

    applyBoothChangesToCanvas(row.floorplan_id, restoredBooths.map(b => ({
      id: b.id, code: b.code, boothStatus: lower(b.snap.status) || 'reserved', ownerName: b.snap.owner_name || '', exhibitorId: b.snap.exhibitor_id || '',
      extra: { picName: b.snap.pic_name || '', email: b.snap.email || '', phone: b.snap.phone || '', brandCategory: b.snap.brand_category || '',
        mergeSeparate: Boolean(b.snap.merge_separate), discountType: b.snap.discount_type || 'nominal', discountValue: b.snap.discount_value || 0,
        discountAmount: b.snap.discount_amount || 0, discountReason: b.snap.discount_reason || '' }
    })));
    restoredBooths.forEach(b => recalcContract(row.floorplan_id, b.code, ''));

    const note = [conflicts.length ? `Booth bentrok: ${conflicts.map(c => `${c.code} (${c.note})`).join('; ')}` : '', ...notes].filter(Boolean).join(' ');
    db.prepare('UPDATE deleted_tenants SET restored_at = CURRENT_TIMESTAMP, restored_by = ?, restore_note = ? WHERE id = ?').run(actor, note, row.id);
  })();
  syncPaymentStatusFromInvoices();
  return { record: recordDto({ ...row, project_title: fp.title }), restoredBooths: restoredBooths.map(b => b.code), conflicts, notes };
}
