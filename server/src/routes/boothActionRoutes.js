import express from 'express';
import db from '../db.js';
import { findBooth, getContractInvoices, summarizeContract, nextInvoiceNumber } from '../utils/contractBilling.js';
import { computeContractTax } from '../../../shared/invoiceTax.js';
import { taxOptionsFrom, readSalesDiscountLimit } from '../utils/taxSettings.js';
import { saveBoothDiscount, discountAmountFor } from '../utils/boothDiscount.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';
import { buildInvoiceRow } from './invoiceRoutes.js';
import { writeAuditLog } from '../middleware/audit.js';
import { clientIp } from '../middleware/auth.js';

// Booth actions of the Sales pop up in the (read-only) Studio: summary, "Beri Diskon", "Buat Invoice".
// "Booking Manual" is POST /orders/checkout with `deferInvoice` (AGENTS.md §27). Access: Sales, Finance, Super Admin.
const router = express.Router();

const lower = (v) => String(v || '').trim().toLowerCase();
const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
const isLive = (inv) => String(inv.payment_status || '').toUpperCase() !== 'CANCELED';
const STATUS_LABELS = { available: 'Available', reserved: 'Reserved', sold: 'Sold', free: 'Free', maintenance: 'Maintenance', booked: 'Reserved' };
const statusLabel = (s) => STATUS_LABELS[lower(s)] || s || '-';

// Note of the booking that is still open on this booth (written by "Booking Manual")
const bookingNoteOf = (booth) => db.prepare(`
  SELECT notes FROM orders
  WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED' AND LOWER(TRIM(booth_code)) = LOWER(TRIM(?))
  ORDER BY created_at DESC LIMIT 1
`).get(booth.floorplan_id, booth.code)?.notes || '';

// The invoice "Buat Invoice" issues for this booth: price - private discount, PPN as set in Setting. The same row is
// shown as the preview and inserted, so what Sales sees is what gets issued.
function draftInvoiceRow(booth, taxBody = {}) {
  const tax = taxOptionsFrom(taxBody, { isStaff: true });
  const price = Number(booth.price) || 0;
  const discount = Math.min(price, Number(booth.discount_amount) || 0);
  const contract = { ...computeContractTax({ subtotal: price, discount, rate: tax.rate, method: tax.method }), display: tax.display };
  return {
    floorplan_id: booth.floorplan_id, booth_id: booth.id, booth_code: booth.code,
    client_name: booth.pic_name || booth.owner_name || '', company_name: booth.owner_name || '',
    client_email: booth.email || '', client_phone: booth.phone || '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    items: [{
      id: 'item-1', boothCode: booth.code,
      description: `Sewa Booth #${booth.code} (${booth.width_m || 3}×${booth.height_m || 3} m, ${booth.category || 'Standar'})${discount > 0 ? ` - diskon ${rupiah(discount)}` : ''}`,
      qty: 1, unitPrice: price, amount: price
    }],
    subtotal: price, discount_type: booth.discount_type || 'nominal', discount_value: Number(booth.discount_value) || 0,
    discount_amount: discount, discount_reason: discount > 0 ? (booth.discount_reason || '') : '',
    tax_rate: contract.ppn > 0 ? contract.rate : 0, tax_amount: contract.ppn, total_amount: contract.total,
    paid_amount: 0, remaining_amount: contract.total, payment_type: 'full', dp_percent: 0,
    payment_status: 'UNPAID', payment_method: 'Bank Transfer', notes: bookingNoteOf(booth),
    invoice_kind: 'full', contract_total: contract.total, contract_tax_rate: contract.rate,
    dpp_amount: contract.dpp, tax_method: contract.method, tax_display: contract.display, tax_note: tax.note,
    contract_subtotal: contract.subtotal, contract_discount: contract.discount, contract_dpp: contract.dpp,
    contract_tax_method: contract.method, contract_tax_display: contract.display
  };
}

function limitFor(role, price) {
  if (role !== 'sales') return { limited: false, maxPercent: 100, maxAmount: 0, maxDiscount: price };
  const { maxPercent, maxAmount } = readSalesDiscountLimit();
  const byPercent = Math.floor((price * maxPercent) / 100);
  return { limited: true, maxPercent, maxAmount, maxDiscount: maxAmount > 0 ? Math.min(byPercent, maxAmount) : byPercent };
}

// Which buttons the pop up offers for this booth (decided here, so the UI and the API never disagree)
function actionsFor(booth, liveInvoices) {
  const status = lower(booth.status);
  const hasTenant = Boolean(String(booth.owner_name || '').trim());
  const hasInvoice = liveInvoices.length > 0;
  const off = (reason) => ({ enabled: false, reason });
  if (status === 'maintenance') {
    const reason = 'Booth sedang maintenance';
    return { invoice: { ...off(reason), mode: 'create', label: 'Buat Invoice' }, booking: { ...off(reason), mode: 'create', label: 'Booking Manual' }, discount: { ...off(reason), label: 'Beri Diskon' } };
  }
  if (status === 'sold') {
    return {
      invoice: hasInvoice ? { enabled: true, mode: 'view', label: 'Lihat Invoice' } : { ...off('Belum ada invoice untuk booth ini. Hubungi Finance.'), mode: 'view', label: 'Lihat Invoice' },
      booking: { ...off('Booth sudah terjual (Sold); booking tidak bisa diubah.'), mode: 'edit', label: 'Booking Manual' },
      discount: { ...off('Booth sudah lunas (Sold); diskon tidak bisa diubah.'), label: 'Beri Diskon' }
    };
  }
  const booked = ['reserved', 'booked'].includes(status) || hasTenant;
  return {
    invoice: hasInvoice
      ? { enabled: true, mode: 'view', label: 'Lihat Invoice' }
      : { enabled: true, mode: hasTenant ? 'create' : 'booking', label: 'Buat Invoice' },
    booking: booked ? { enabled: true, mode: 'edit', label: 'Lihat/Ubah Booking' } : { enabled: true, mode: 'create', label: 'Booking Manual' },
    discount: { enabled: true, label: 'Beri Diskon' }
  };
}

function boothSummary(floorplanId, boothCode, boothId, role) {
  const booth = findBooth(floorplanId, boothCode, boothId);
  if (!booth) return null;
  const invoices = getContractInvoices(floorplanId, booth.code, booth.id);
  const live = invoices.filter(isLive);
  const contract = summarizeContract(invoices, booth);
  const fp = db.prepare('SELECT title FROM floorplans WHERE id = ?').get(floorplanId);
  const price = Number(booth.price) || 0;
  const discountAmount = Math.min(price, Number(booth.discount_amount) || 0);
  const draft = draftInvoiceRow(booth);
  return {
    booth: {
      id: booth.id, code: booth.code, widthM: booth.width_m, heightM: booth.height_m, category: booth.category || '',
      hall: fp?.title || '', status: lower(booth.status) || 'available', statusLabel: statusLabel(booth.status),
      ownerName: booth.owner_name || '', picName: booth.pic_name || '', email: booth.email || '', phone: booth.phone || '',
      brandCategory: booth.brand_category || '', exhibitorId: booth.exhibitor_id || '', notes: bookingNoteOf(booth),
      price, discountType: booth.discount_type || 'nominal', discountValue: Number(booth.discount_value) || 0,
      discountAmount, discountReason: booth.discount_reason || '', netTotal: Math.max(0, price - discountAmount)
    },
    contract: { status: contract.status, total: contract.contractTotal, paid: contract.paid, remaining: contract.remaining, invoiceCount: contract.invoiceCount },
    invoices: live.map(inv => buildInvoiceRow(inv.id)).filter(Boolean),
    invoicePreview: {
      subtotal: draft.subtotal, discount: draft.discount_amount, dpp: draft.dpp_amount, taxRate: draft.tax_rate, taxAmount: draft.tax_amount,
      taxMethod: draft.tax_method, total: draft.total_amount,
      // the document as it will be issued (number assigned on "Generate Invoice")
      invoice: { ...draft, id: 'PREVIEW', invoice_number: 'PREVIEW (belum terbit)', bankDetails: null }
    },
    discountLimit: limitFor(role, price),
    actions: actionsFor(booth, live)
  };
}

const audit = (req, action, target, summary, details) => {
  req.skipAudit = true; // written here with the values before and after
  writeAuditLog({ user: req.user, action, category: 'Booth', target, summary, method: req.method, path: `/api/booth-actions${req.path}`, statusCode: 200, ip: clientIp(req), details });
};

// GET /api/booth-actions/summary?floorplanId=&boothCode=&boothId=
router.get('/summary', (req, res) => {
  try {
    const { floorplanId, boothCode, boothId } = req.query;
    if (!floorplanId || (!boothCode && !boothId)) return res.status(400).json({ success: false, error: 'floorplanId dan kode booth wajib diisi' });
    const summary = boothSummary(floorplanId, boothCode, boothId, req.user.role);
    if (!summary) return res.status(404).json({ success: false, error: `Booth ${boothCode || ''} tidak ditemukan di denah ini` });
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('Booth action summary error:', error);
    res.status(500).json({ success: false, error: 'Gagal memuat data booth' });
  }
});

// POST /api/booth-actions/discount - private discount with the Sales limit (Setting > Aturan Booking)
router.post('/discount', (req, res) => {
  try {
    const { floorplanId, boothCode, boothId, discountType = 'nominal', discountValue = 0 } = req.body || {};
    const reason = String(req.body?.discountReason || '').trim();
    if (!floorplanId || (!boothCode && !boothId)) return res.status(400).json({ success: false, error: 'floorplanId dan kode booth wajib diisi' });
    if (!['nominal', 'percentage'].includes(discountType)) return res.status(400).json({ success: false, error: 'Jenis diskon tidak dikenal' });
    const booth = findBooth(floorplanId, boothCode, boothId);
    if (!booth) return res.status(404).json({ success: false, error: `Booth ${boothCode || ''} tidak ditemukan di denah ini` });

    const action = actionsFor(booth, getContractInvoices(floorplanId, booth.code, booth.id).filter(isLive)).discount;
    if (!action.enabled) return res.status(409).json({ success: false, code: 'ACTION_NOT_ALLOWED', error: action.reason });

    const price = Number(booth.price) || 0;
    const amount = discountAmountFor(price, discountType, discountValue);
    if (amount > 0 && !reason) return res.status(400).json({ success: false, code: 'REASON_REQUIRED', error: 'Catatan alasan diskon wajib diisi.' });
    const limit = limitFor(req.user.role, price);
    if (limit.limited && amount > limit.maxDiscount) {
      return res.status(403).json({
        success: false, code: 'DISCOUNT_OVER_LIMIT', limit,
        error: `Diskon ${rupiah(amount)} melebihi batas Sales (maks. ${limit.maxPercent}%${limit.maxAmount > 0 ? ` atau ${rupiah(limit.maxAmount)}` : ''} = ${rupiah(limit.maxDiscount)} untuk booth ini). Minta Finance / Super Admin untuk diskon yang lebih besar.`
      });
    }

    const before = { discountType: booth.discount_type || 'nominal', discountValue: Number(booth.discount_value) || 0, discountAmount: Number(booth.discount_amount) || 0, discountReason: booth.discount_reason || '' };
    const discount = saveBoothDiscount({ floorplanId, boothCode: booth.code, boothId: booth.id, numPrice: price, discountType, discountValue, discountReason: amount > 0 ? reason : '' });
    audit(req, 'Beri diskon booth', `Booth ${booth.code}`,
      `Diskon ${rupiah(before.discountAmount)} → ${rupiah(discount.discountAmount)}${discountType === 'percentage' ? ` (${discount.discountValue}%)` : ''}; tagihan bersih ${rupiah(price - before.discountAmount)} → ${rupiah(discount.netTotal)}${reason ? ` · ${reason}` : ''}`,
      { floorplanId, boothCode: booth.code, before, after: discount });

    res.json({ success: true, message: `Diskon booth ${booth.code} tersimpan.`, discount, ...boothSummary(floorplanId, booth.code, booth.id, req.user.role) });
  } catch (error) {
    console.error('Booth action discount error:', error);
    res.status(500).json({ success: false, error: 'Gagal menyimpan diskon' });
  }
});

// POST /api/booth-actions/invoice - issue the booth's invoice (Penuh, unpaid) from the booking; never a second one
router.post('/invoice', (req, res) => {
  try {
    const { floorplanId, boothCode, boothId } = req.body || {};
    if (!floorplanId || (!boothCode && !boothId)) return res.status(400).json({ success: false, error: 'floorplanId dan kode booth wajib diisi' });

    const result = db.transaction(() => {
      const booth = findBooth(floorplanId, boothCode, boothId);
      if (!booth) return { status: 404, body: { success: false, error: `Booth ${boothCode || ''} tidak ditemukan di denah ini` } };
      const live = getContractInvoices(floorplanId, booth.code, booth.id).filter(isLive);
      if (live.length) {
        return { status: 409, body: { success: false, code: 'CONTRACT_HAS_INVOICES', error: `Booth ${booth.code} sudah memiliki invoice (${live.map(i => i.invoice_number).join(', ')}).`, invoice: buildInvoiceRow(live[live.length - 1].id) } };
      }
      const action = actionsFor(booth, live).invoice;
      if (!action.enabled) return { status: 409, body: { success: false, code: 'ACTION_NOT_ALLOWED', error: action.reason } };
      if (action.mode === 'booking') return { status: 409, body: { success: false, code: 'NEED_BOOKING', error: `Booth ${booth.code} belum punya tenant. Buat Booking Manual terlebih dahulu.` } };

      // Sales always follows the PPN setting; Finance / Super Admin may choose (applyTax / taxMethod)
      const row = draftInvoiceRow(booth, req.user.role === 'sales' ? {} : req.body);
      const id = `INV-${Date.now()}`;
      const invoiceNumber = nextInvoiceNumber('full');
      const { items, ...columns } = row;
      const values = { id, invoice_number: invoiceNumber, ...columns, items_json: JSON.stringify(items) };
      const names = Object.keys(values);
      db.prepare(`INSERT INTO invoices (${names.join(', ')}) VALUES (${names.map(n => `@${n}`).join(', ')})`).run(values);
      const contract = { total: row.total_amount };
      const discount = row.discount_amount;
      // The open booking of this booth now has its invoice
      db.prepare(`
        UPDATE orders SET invoice_number = ?, total_amount = ?
        WHERE floorplan_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(payment_status, '')) != 'CANCELED'
          AND TRIM(COALESCE(invoice_number, '')) = '' AND LOWER(TRIM(booth_code)) = LOWER(TRIM(?))
      `).run(invoiceNumber, contract.total, floorplanId, booth.code);
      return { status: 200, booth, id, invoiceNumber, total: contract.total, discount };
    })();

    if (result.status !== 200) return res.status(result.status).json(result.body);
    syncPaymentStatusFromInvoices();
    audit(req, 'Buat invoice booth', `Booth ${result.booth.code}`,
      `Belum ada invoice → ${result.invoiceNumber} (${result.booth.owner_name}), total ${rupiah(result.total)}${result.discount > 0 ? `, diskon ${rupiah(result.discount)}` : ''}`,
      { floorplanId, boothCode: result.booth.code, before: { invoice: null }, after: { invoiceNumber: result.invoiceNumber, totalAmount: result.total, discountAmount: result.discount } });

    res.json({ success: true, message: `Invoice ${result.invoiceNumber} berhasil diterbitkan.`, invoice: buildInvoiceRow(result.id), ...boothSummary(floorplanId, result.booth.code, result.booth.id, req.user.role) });
  } catch (error) {
    console.error('Booth action invoice error:', error);
    res.status(500).json({ success: false, error: 'Gagal menerbitkan invoice' });
  }
});

export { boothSummary };
export default router;
