import express from 'express';
import db from '../db.js';
import { publicInvoiceConfig } from '../utils/publicData.js';
import {
  CONTRACT_KINDS, kindOf, getContract, invoiceCodeTokens, summarizeContract, getContractInvoices, recalcContract, boothContractValue,
  impliedTaxRate, invoicePaidAmount, nextInvoiceNumber, contractStatusLabel
} from '../utils/contractBilling.js';
import { writeAuditLog } from '../middleware/audit.js';
import { clientIp } from '../middleware/auth.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';

const router = express.Router();

const DEFAULT_SYSTEM_CONFIG = {
  templateName: 'Modern Corporate A4',
  presetId: 'indigo_modern',
  primaryColor: '#4f46e5',
  secondaryColor: '#0f172a',
  accentColor: '#10b981',
  backgroundColor: '#ffffff',
  fontFamily: 'font-sans',

  headerLayout: 'logo_left_info_right',
  showLogo: true,
  logoUrl: '',
  logoSize: 44,
  logoText: 'FLOORPLAN STUDIO INDONESIA',
  logoTagline: 'Official Event Management & Exhibition Services',

  companyName: 'PT EXPO KARYA INDONESIA',
  organizerBrand: 'Floorplan & Exhibition Studio',
  companyAddress: 'Jl. Jend. Sudirman No. 45, Jakarta Pusat 10210, Indonesia',
  supportEmail: 'support@expokarya.co.id',
  supportPhone: '021-555-8899',
  supportWhatsapp: '081234567890',
  companyWebsite: 'www.expokarya.id',
  companyNpwp: '01.345.678.9-012.000',

  signatoryName: 'Budi Santoso, S.E.',
  signatoryTitle: 'Head of Exhibition & Operation',
  signatureImage: '',
  signatureImageUrl: '',

  tableHeaderStyle: 'solid_primary',
  signaturePosition: 'right',
  clientSectionPosition: 'grid_2col',
  showClientNpwp: true,
  showClientAddress: true,
  showClientPhone: true,
  showClientEmail: true,
  showWatermark: true,
  showStamp: true,
  showSignatureImage: true,
  showPaymentInstructions: true,
  showBankDetails: true,
  showInvoiceTerms: true,
  showQrCode: true,

  bank1Name: 'Bank Central Asia (BCA)',
  bank1AccNumber: '882-019-3321',
  bank1AccHolder: 'PT EXPO KARYA INDONESIA',
  bank1Branch: 'KCP Sudirman Jakarta',

  bank2Name: 'Bank Mandiri',
  bank2AccNumber: '122-00-9988776-5',
  bank2AccHolder: 'PT EXPO KARYA INDONESIA',
  bank2Branch: 'KCP Thamrin Jakarta',

  bankName: 'Bank Central Asia (BCA)',
  accountNumber: '882-019-3321',
  accountName: 'PT EXPO KARYA INDONESIA',
  bankBranch: 'KCP Sudirman Jakarta',

  paymentInstructions: 'Transfer dilakukan ke rekening resmi di atas. Cantumkan Nomor Invoice sebagai berita transfer. Kirimkan bukti pembayaran melalui WhatsApp Hotline Official kami untuk verifikasi otomatis.',
  invoiceTerms: '1. Uang muka (DP) minimal 50% dibayarkan saat pendaftaran.\n2. Pelunasan sisa 50% wajib diselesaikan maksimal 14 hari sebelum hari H pendaftaran.\n3. Pembatalan kepesertaan setelah invoice diterbitkan akan dikenakan biaya administrasi 25%.',

  taxRate: 11,
  bookingExpiryMinutes: 15,
  isPublicBookingActive: true,
  isPaymentActive: true,
  currencySymbol: 'Rp'
};

// GET /api/invoices/config - Get invoice layout & template settings
router.get('/config', (req, res) => {
  try {
    const row = db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template');
    if (row && row.config_json) {
      try {
        const parsed = JSON.parse(row.config_json);
        const config = { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
        // Visitors never receive the signatory's signature image (AGENTS.md §20)
        return res.json({ success: true, config: req.user ? config : publicInvoiceConfig(config) });
      } catch (e) {}
    }
    return res.json({ success: true, config: req.user ? DEFAULT_SYSTEM_CONFIG : publicInvoiceConfig(DEFAULT_SYSTEM_CONFIG) });
  } catch (error) {
    console.error("Fetch invoice config error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/invoices/config - Save invoice layout & template settings (atomic merge)
router.post('/config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ success: false, error: 'Konfigurasi template wajib diisi' });
    }

    const row = db.prepare('SELECT config_json FROM invoice_settings WHERE id = ?').get('default_template');
    let existingConfig = {};
    if (row && row.config_json) {
      try {
        existingConfig = JSON.parse(row.config_json);
      } catch (e) {}
    }

    // Merge: DEFAULT_SYSTEM_CONFIG + existingConfig + incoming config so visual template settings are preserved
    const merged = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...existingConfig,
      ...config,
      updatedAt: new Date().toISOString()
    };

    db.prepare(`
      INSERT INTO invoice_settings (id, config_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP
    `).run('default_template', JSON.stringify(merged));

    res.json({
      success: true,
      message: 'Desain layout invoice berhasil disimpan!',
      config: merged
    });
  } catch (error) {
    console.error("Save invoice config error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/invoices - List all invoices
router.get('/', (req, res) => {
  try {
    const { status, search, floorplanId, projectId } = req.query;
    let query = `
      SELECT inv.*,
        (
          SELECT b.status 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS current_booth_status,
        (
          SELECT b.discount_amount 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS booth_discount_amount,
        (
          SELECT b.discount_type 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS booth_discount_type,
        (
          SELECT b.discount_value 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS booth_discount_value,
        (
          SELECT b.discount_reason 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS booth_discount_reason,
        (
          SELECT b.price 
          FROM booths b 
          WHERE (b.code = inv.booth_code OR b.id = inv.booth_id)
            AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001'))
          LIMIT 1
        ) AS booth_price,
        -- Booth size: match by booth id, then exact code, then merged code (invoice A-04 -> booth A-04+A-05)
        COALESCE(
          (SELECT b.width_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND b.id = inv.booth_id LIMIT 1),
          (SELECT b.width_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND b.code = inv.booth_code LIMIT 1),
          (SELECT b.width_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND ('+' || b.code || '+') LIKE ('%+' || inv.booth_code || '+%') LIMIT 1)
        ) AS booth_width_m,
        COALESCE(
          (SELECT b.height_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND b.id = inv.booth_id LIMIT 1),
          (SELECT b.height_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND b.code = inv.booth_code LIMIT 1),
          (SELECT b.height_m FROM booths b WHERE b.deleted_at IS NULL AND (b.floorplan_id = inv.floorplan_id OR (inv.floorplan_id IS NULL AND b.floorplan_id = 'FP-2026-001')) AND ('+' || b.code || '+') LIKE ('%+' || inv.booth_code || '+%') LIMIT 1)
        ) AS booth_height_m,
        (
          SELECT fp.title 
          FROM floorplans fp 
          WHERE fp.id = COALESCE(inv.floorplan_id, 'FP-2026-001')
          LIMIT 1
        ) AS project_title
      FROM invoices inv
    `;

    const conditions = ['inv.deleted_at IS NULL'];
    const params = [];

    const targetFp = floorplanId || projectId;
    if (targetFp && targetFp !== 'all') {
      conditions.push("(inv.floorplan_id = ? OR inv.event_id = ? OR inv.floorplan_id IN (SELECT id FROM floorplans WHERE event_id = ?) OR (inv.floorplan_id IS NULL AND ? = 'FP-2026-001'))");
      params.push(targetFp, targetFp, targetFp, targetFp);
    }

    if (status && status !== 'all') {
      conditions.push('inv.payment_status = ?');
      params.push(status.toUpperCase());
    }

    if (search) {
      conditions.push('(inv.invoice_number LIKE ? OR inv.client_name LIKE ? OR inv.company_name LIKE ? OR inv.booth_code LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY inv.created_at DESC';

    const rawInvoices = db.prepare(query).all(...params);

    // One contract summary per booth, shared by its DP / Pelunasan / Penuh invoices
    const contractCache = new Map();
    const contractFor = (inv) => {
      if (!CONTRACT_KINDS.includes(kindOf(inv)) || !inv.booth_code || !inv.floorplan_id) return null;
      const key = `${inv.floorplan_id}_${String(inv.booth_code).trim().toLowerCase()}`;
      if (!contractCache.has(key)) {
        const c = getContract(inv.floorplan_id, inv.booth_code, inv.booth_id);
        contractCache.set(key, {
          key,
          total: c.contractTotal,
          paid: c.paid,
          remaining: c.remaining,
          billed: c.billed,
          unbilled: c.unbilled,
          discountAmount: c.discountAmount,
          status: c.status,
          statusLabel: contractStatusLabel(c.status),
          boothWidthM: c.booth?.width_m ?? null,
          boothHeightM: c.booth?.height_m ?? null
        });
      }
      return contractCache.get(key);
    };
    const relatedById = new Map();
    const relatedInvoice = (relatedId) => {
      if (!relatedId) return null;
      if (!relatedById.has(relatedId)) {
        relatedById.set(relatedId, db.prepare('SELECT id, invoice_number, payment_status, total_amount, dp_percent FROM invoices WHERE id = ?').get(relatedId) || null);
      }
      return relatedById.get(relatedId);
    };

    const invoices = rawInvoices.map(inv => {
      // Auto-merge contract "A-01+A-03+A-04" (AGENTS.md §18): size of every booth + total area
      const codeTokens = invoiceCodeTokens(inv.booth_code);
      if (codeTokens.length > 1 && !(Number(inv.booth_width_m) > 0) && inv.floorplan_id) {
        const rows = codeTokens
          .map(t => db.prepare('SELECT code, width_m, height_m FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(?))').get(inv.floorplan_id, t))
          .filter(Boolean);
        if (rows.length) {
          inv.merged_booths = rows.map(r => ({ code: r.code, widthM: r.width_m, heightM: r.height_m }));
          inv.booth_area_m2 = Math.round(rows.reduce((acc, r) => acc + (Number(r.width_m) || 0) * (Number(r.height_m) || 0), 0) * 100) / 100;
        }
      }
      let items = [];
      try { if (inv.items_json) items = JSON.parse(inv.items_json); } catch (e) {}
      let bankDetails = null;
      try { if (inv.bank_details_json) bankDetails = JSON.parse(inv.bank_details_json); } catch (e) {}

      const effectiveDiscountAmount = (inv.discount_amount && Number(inv.discount_amount) > 0)
        ? Number(inv.discount_amount)
        : Number(inv.booth_discount_amount || 0);
      const effectiveDiscountType = inv.discount_type || inv.booth_discount_type || 'nominal';
      const effectiveDiscountValue = (inv.discount_value !== null && inv.discount_value !== undefined && Number(inv.discount_value) > 0)
        ? Number(inv.discount_value)
        : Number(inv.booth_discount_value || 0);
      const effectiveDiscountReason = inv.discount_reason || inv.booth_discount_reason || '';

      const kind = kindOf(inv);
      const isSplitInvoice = kind === 'dp' || kind === 'settlement';
      if (isSplitInvoice) {
        // The private discount belongs to the contract (shown in its breakdown), never to a DP / Pelunasan line
        inv.booth_discount_amount = 0;
        inv.booth_discount_value = 0;
        inv.booth_discount_reason = '';
      }
      const sub = inv.subtotal || (effectiveDiscountAmount > 0 ? (inv.total_amount + effectiveDiscountAmount) : inv.total_amount) || inv.booth_price || 5000000;
      let effectiveTotal = inv.total_amount;
      // DP / Pelunasan amounts are already net of the contract's private discount: never subtract it again
      if (!isSplitInvoice && kind !== 'facility' && (!inv.discount_amount || Number(inv.discount_amount) === 0) && effectiveDiscountAmount > 0) {
        effectiveTotal = Math.max(0, sub - effectiveDiscountAmount);
      }

      // Resolve Down Payment & Remaining Balance
      const pStatus = (inv.payment_status || 'UNPAID').toUpperCase();
      let paidAmt = inv.paid_amount !== undefined && inv.paid_amount !== null ? Number(inv.paid_amount) : 0;
      let remainingAmt = inv.remaining_amount !== undefined && inv.remaining_amount !== null ? Number(inv.remaining_amount) : 0;

      if (pStatus === 'PAID') {
        paidAmt = effectiveTotal;
        remainingAmt = 0;
      } else if (pStatus === 'CANCELED') {
        // A canceled invoice is neither money received nor a receivable (DB paid_amount is kept for audit)
        paidAmt = 0;
        remainingAmt = 0;
      } else if (pStatus === 'PARTIAL' || pStatus === 'DP' || pStatus === 'DP_PAID' || (inv.payment_type === 'dp' && kind === 'full')) {
        if (paidAmt === 0 && remainingAmt === 0) {
          paidAmt = Math.round(effectiveTotal / 2);
        }
        remainingAmt = Math.max(0, effectiveTotal - paidAmt);
      } else if (pStatus === 'UNPAID' || pStatus === 'PENDING') {
        if (paidAmt === 0 && remainingAmt === 0) {
          remainingAmt = effectiveTotal;
        } else {
          remainingAmt = Math.max(0, effectiveTotal - paidAmt);
        }
      } else {
        remainingAmt = Math.max(0, effectiveTotal - paidAmt);
      }

      const paymentType = inv.payment_type || (pStatus === 'PARTIAL' || (paidAmt > 0 && paidAmt < effectiveTotal) ? 'dp' : 'full');
      const dpPercent = inv.dp_percent || (effectiveTotal > 0 && paidAmt > 0 ? Number(((paidAmt / effectiveTotal) * 100).toFixed(0)) : 0);

      return {
        ...inv,
        invoice_kind: kind,
        contract: contractFor(inv),
        related_invoice: relatedInvoice(inv.related_invoice_id),
        subtotal: sub,
        discount_amount: effectiveDiscountAmount,
        discount_type: effectiveDiscountType,
        discount_value: effectiveDiscountValue,
        discount_reason: effectiveDiscountReason,
        total_amount: effectiveTotal,
        paid_amount: paidAmt,
        remaining_amount: remainingAmt,
        payment_type: paymentType,
        dp_percent: dpPercent,
        items,
        bankDetails
      };
    });

    res.json({
      success: true,
      total: invoices.length,
      invoices
    });
  } catch (error) {
    console.error("Fetch invoices error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/invoices/contract?floorplanId=&boothCode=&boothId=&taxRate= - Booth contract summary for the DP / Pelunasan wizard
router.get('/contract', (req, res) => {
  try {
    const { floorplanId, boothCode = '', boothId = '', taxRate = 0 } = req.query;
    if (!floorplanId || (!boothCode && !boothId)) {
      return res.status(400).json({ success: false, error: 'Project dan booth wajib dipilih' });
    }
    const c = getContract(floorplanId, boothCode, boothId, { taxRate: Number(taxRate) || 0 });
    if (!c.booth) return res.status(404).json({ success: false, error: 'Booth tidak ditemukan di project ini' });

    const toLite = (inv) => inv && ({
      id: inv.id, invoice_number: inv.invoice_number, invoice_kind: kindOf(inv), payment_status: inv.payment_status,
      total_amount: inv.total_amount, paid_amount: invoicePaidAmount(inv), dp_percent: inv.dp_percent, created_at: inv.created_at
    });
    const exhibitor = c.latestInvoice || {};
    res.json({
      success: true,
      contract: {
        booth: {
          id: c.booth.id, code: c.booth.code, category: c.booth.category, status: c.booth.status,
          widthM: c.booth.width_m, heightM: c.booth.height_m, price: c.booth.price,
          discountType: c.booth.discount_type, discountValue: c.booth.discount_value,
          discountAmount: c.booth.discount_amount || 0, discountReason: c.booth.discount_reason || ''
        },
        // Tenant data comes from the booth / exhibitor record, falling back to the contract's latest invoice
        tenant: {
          companyName: c.booth.owner_name || exhibitor.company_name || '',
          picName: c.booth.pic_name || exhibitor.client_name || c.booth.owner_name || '',
          email: c.booth.email || exhibitor.client_email || '',
          phone: c.booth.phone || exhibitor.client_phone || '',
          address: exhibitor.client_address || '',
          npwp: exhibitor.client_npwp || ''
        },
        hasInvoices: c.invoiceCount > 0,
        contractTotal: c.contractTotal,
        taxRate: c.invoiceCount > 0 ? c.taxRate : Number(taxRate) || 0,
        billed: c.billed,
        paid: c.paid,
        remaining: c.remaining,
        unbilled: c.unbilled,
        status: c.status,
        statusLabel: contractStatusLabel(c.status),
        dpInvoice: toLite(c.dpInvoice),
        settlementInvoice: toLite(c.settlementInvoice),
        invoices: c.invoices.map(toLite)
      }
    });
  } catch (error) {
    console.error('Fetch contract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/invoices/:id - Get single invoice with parsed items & bank details
router.get('/:id', (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(req.params.id, req.params.id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice tidak ditemukan' });
    }

    // Parse JSON fields
    let items = [];
    try {
      if (invoice.items_json) items = JSON.parse(invoice.items_json);
    } catch (e) {
      items = [];
    }

    let bankDetails = null;
    try {
      if (invoice.bank_details_json) bankDetails = JSON.parse(invoice.bank_details_json);
    } catch (e) {
      bankDetails = null;
    }

    // Resolve Down Payment & Remaining Balance
    const pStatus = (invoice.payment_status || 'UNPAID').toUpperCase();
    const effectiveTotal = Number(invoice.total_amount) || 0;
    let paidAmt = invoice.paid_amount !== undefined && invoice.paid_amount !== null ? Number(invoice.paid_amount) : 0;
    let remainingAmt = invoice.remaining_amount !== undefined && invoice.remaining_amount !== null ? Number(invoice.remaining_amount) : 0;

    if (pStatus === 'PAID') {
      paidAmt = effectiveTotal;
      remainingAmt = 0;
    } else if (pStatus === 'PARTIAL' || pStatus === 'DP' || pStatus === 'DP_PAID' || (invoice.payment_type === 'dp' && kindOf(invoice) === 'full')) {
      if (paidAmt === 0 && remainingAmt === 0) {
        paidAmt = Math.round(effectiveTotal / 2);
      }
      remainingAmt = Math.max(0, effectiveTotal - paidAmt);
    } else if (pStatus === 'UNPAID' || pStatus === 'PENDING') {
      if (paidAmt === 0 && remainingAmt === 0) {
        remainingAmt = effectiveTotal;
      } else {
        remainingAmt = Math.max(0, effectiveTotal - paidAmt);
      }
    } else {
      remainingAmt = Math.max(0, effectiveTotal - paidAmt);
    }

    const paymentType = invoice.payment_type || (pStatus === 'PARTIAL' || (paidAmt > 0 && paidAmt < effectiveTotal) ? 'dp' : 'full');
    const dpPercent = invoice.dp_percent || (effectiveTotal > 0 && paidAmt > 0 ? Number(((paidAmt / effectiveTotal) * 100).toFixed(0)) : 0);

    const kind = kindOf(invoice);
    const c = CONTRACT_KINDS.includes(kind) && invoice.floorplan_id && invoice.booth_code
      ? getContract(invoice.floorplan_id, invoice.booth_code, invoice.booth_id)
      : null;
    const related = invoice.related_invoice_id
      ? db.prepare('SELECT id, invoice_number, payment_status, total_amount, dp_percent FROM invoices WHERE id = ?').get(invoice.related_invoice_id)
      : null;

    res.json({
      success: true,
      invoice: {
        ...invoice,
        invoice_kind: kind,
        related_invoice: related || null,
        contract: c ? { total: c.contractTotal, paid: c.paid, remaining: c.remaining, status: c.status, statusLabel: contractStatusLabel(c.status) } : null,
        paid_amount: paidAmt,
        remaining_amount: remainingAmt,
        payment_type: paymentType,
        dp_percent: dpPercent,
        items,
        bankDetails
      }
    });
  } catch (error) {
    console.error("Fetch single invoice error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/invoices - Create new invoice
// Creates an "Invoice DP" or "Invoice Pelunasan" for a booth contract. All amounts are computed here
// from the booth contract (never trusted from the client).
function createContractInvoice(req, res) {
  const {
    invoiceKind,
    floorplanId,
    boothId = '',
    boothCode = '',
    dpMode = 'percent',
    dpValue,
    taxRate = 0,
    issueDate = new Date().toISOString().split('T')[0],
    dueDate,
    paymentMethod = 'Bank Transfer',
    bankDetails = null,
    clientAddress = '',
    clientNpwp = '',
    notes = '',
    confirmUnpaidDp = false
  } = req.body;

  if (!floorplanId || (!boothCode && !boothId)) {
    return res.status(400).json({ success: false, error: 'Pilih project dan booth terlebih dahulu' });
  }

  const c = getContract(floorplanId, boothCode, boothId, { taxRate: Number(taxRate) || 0 });
  if (!c.booth) return res.status(404).json({ success: false, error: 'Booth tidak ditemukan di project ini' });

  const latest = c.latestInvoice || {};
  const companyName = c.booth.owner_name || latest.company_name || '';
  const clientName = c.booth.pic_name || latest.client_name || companyName;
  if (!companyName) {
    return res.status(400).json({ success: false, error: `Booth ${c.booth.code} belum memiliki tenant / exhibitor. Daftarkan tenant terlebih dahulu.` });
  }
  if (c.status === 'PAID') {
    return res.status(409).json({ success: false, code: 'CONTRACT_PAID', error: `Kontrak booth ${c.booth.code} sudah lunas penuh.` });
  }

  // Contract value: the running contract if it already has invoices, otherwise booth price - discount (+ PPN)
  const contractTotal = c.invoiceCount > 0 ? c.contractTotal : boothContractValue(c.booth, taxRate);
  const contractTaxRate = c.invoiceCount > 0 ? (c.taxRate || impliedTaxRate(contractTotal, c.booth)) : (Number(taxRate) || 0);
  if (contractTotal <= 0) {
    return res.status(400).json({ success: false, error: 'Nilai kontrak booth Rp 0 (booth gratis) sehingga tidak perlu ditagih.' });
  }

  const size = c.booth.width_m && c.booth.height_m ? ` (${c.booth.width_m}x${c.booth.height_m}m)` : '';
  let kind;
  let amount;
  let dpPercent = 0;
  let relatedId = null;
  let description;

  if (invoiceKind === 'dp') {
    if (c.dpInvoice) {
      return res.status(409).json({
        success: false, code: 'DP_EXISTS', existingInvoiceId: c.dpInvoice.id, existingInvoiceNumber: c.dpInvoice.invoice_number,
        error: `Booth ${c.booth.code} sudah memiliki Invoice DP aktif (${c.dpInvoice.invoice_number}).`
      });
    }
    if (c.paid > 0) {
      return res.status(409).json({ success: false, code: 'ALREADY_PAID', error: 'Kontrak ini sudah menerima pembayaran, Invoice DP tidak dapat dibuat lagi.' });
    }
    const raw = Number(String(dpValue ?? '').replace(',', '.'));
    amount = dpMode === 'nominal' ? Math.round(raw) : Math.round((contractTotal * raw) / 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Nilai DP tidak boleh 0.' });
    }
    if (amount >= contractTotal) {
      return res.status(400).json({ success: false, error: 'Nilai DP harus lebih kecil dari total kontrak. Untuk pembayaran penuh gunakan Invoice Pelunasan.' });
    }
    kind = 'dp';
    dpPercent = dpMode === 'nominal' ? Math.round((amount / contractTotal) * 10000) / 100 : raw;
    description = `Uang Muka (DP ${dpPercent}%) Sewa Booth #${c.booth.code} ${c.booth.category || ''}${size}`.replace(/\s+/g, ' ');
  } else if (invoiceKind === 'settlement') {
    if (c.settlementInvoice) {
      return res.status(409).json({
        success: false, code: 'SETTLEMENT_EXISTS', existingInvoiceId: c.settlementInvoice.id, existingInvoiceNumber: c.settlementInvoice.invoice_number,
        error: `Booth ${c.booth.code} sudah memiliki invoice pelunasan / penuh aktif (${c.settlementInvoice.invoice_number}).`
      });
    }
    const dp = c.dpInvoice;
    const dpStatus = String(dp?.payment_status || '').toUpperCase();
    if (dp && !['PAID', 'PARTIAL'].includes(dpStatus) && !confirmUnpaidDp) {
      return res.status(409).json({
        success: false, code: 'DP_UNPAID', requireConfirmation: true,
        error: `Invoice DP ${dp.invoice_number} belum dibayar. Pelunasan tetap dapat dibuat, tetapi DP belum diterima.`
      });
    }
    amount = Math.max(0, contractTotal - (dp ? Number(dp.total_amount) || 0 : 0));
    if (amount <= 0) {
      return res.status(409).json({ success: false, code: 'CONTRACT_PAID', error: 'Tidak ada sisa kontrak yang perlu dilunasi.' });
    }
    kind = 'settlement';
    relatedId = dp ? dp.id : null;
    description = dp
      ? `Pelunasan Sewa Booth #${c.booth.code}${size} (setelah DP ${dp.invoice_number})`
      : `Pembayaran Penuh 100% Sewa Booth #${c.booth.code} ${c.booth.category || ''}${size}`.replace(/\s+/g, ' ');
  } else {
    return res.status(400).json({ success: false, error: 'Jenis invoice tidak dikenal' });
  }

  const id = `INV-${Date.now()}`;
  const invoiceNumber = nextInvoiceNumber(kind);
  const calculatedDueDate = dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const fp = db.prepare(`
    SELECT fp.event_id, COALESCE(e.title, fp.title) AS event_title, COALESCE(e.venue, '') AS event_venue
    FROM floorplans fp LEFT JOIN events e ON e.id = fp.event_id WHERE fp.id = ?
  `).get(floorplanId) || {};
  const items = [{ id: 'item-1', description, qty: 1, unitPrice: amount, amount }];

  db.transaction(() => {
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, floorplan_id, booth_id, booth_code, event_id, event_title, event_venue,
        client_name, company_name, client_email, client_phone, client_address, client_npwp,
        issue_date, due_date, items_json, subtotal, discount_type, discount_value, discount_amount, discount_reason,
        tax_rate, tax_amount, total_amount, paid_amount, remaining_amount, payment_type, dp_percent,
        payment_status, payment_method, bank_details_json, notes,
        invoice_kind, related_invoice_id, contract_total, contract_tax_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nominal', 0, 0, '', 0, 0, ?, 0, ?, ?, ?, 'UNPAID', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, invoiceNumber, floorplanId, c.booth.id, c.booth.code, fp.event_id || null, fp.event_title || null, fp.event_venue || null,
      clientName, companyName, c.booth.email || latest.client_email || '', c.booth.phone || latest.client_phone || '', clientAddress || latest.client_address || '', clientNpwp || latest.client_npwp || '',
      issueDate, calculatedDueDate, JSON.stringify(items), amount,
      amount, amount, kind === 'dp' ? 'dp' : 'full', dpPercent,
      paymentMethod, bankDetails ? JSON.stringify(bankDetails) : (latest.bank_details_json || null), notes,
      kind, relatedId, contractTotal, contractTaxRate
    );
    // A DP turns an unpaid single invoice of this booth into its Pelunasan (contract total - DP)
    recalcContract(floorplanId, c.booth.code, c.booth.id, { contractTotal, taxRate: contractTaxRate });
  })();
  syncPaymentStatusFromInvoices();

  const created = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  return res.json({
    success: true,
    message: `${kind === 'dp' ? 'Invoice DP' : 'Invoice Pelunasan'} ${invoiceNumber} berhasil diterbitkan!`,
    invoice: { ...created, items, bankDetails: created.bank_details_json ? JSON.parse(created.bank_details_json) : null }
  });
}

router.post('/', (req, res) => {
  try {
    if (['dp', 'settlement'].includes(req.body?.invoiceKind)) {
      return createContractInvoice(req, res);
    }

    const {
      floorplanId,
      boothId,
      boothCode,
      eventId = 'EVT-2026-001',
      eventTitle = 'Indonesia International Expo 2026',
      eventVenue = 'Jakarta Convention Center (Hall A)',
      clientName,
      companyName,
      clientEmail = '',
      clientPhone = '',
      clientAddress = '',
      clientNpwp = '',
      issueDate = new Date().toISOString().split('T')[0],
      dueDate,
      items = [],
      subtotal = 0,
      discountType = 'nominal',
      discountValue = 0,
      discountAmount = 0,
      discountReason = '',
      taxRate = 0,
      taxAmount = 0,
      totalAmount = 0,
      paidAmount,
      remainingAmount,
      paymentType = 'full',
      dpPercent = 0,
      paymentStatus = 'UNPAID',
      paymentMethod = 'Bank Transfer',
      bankDetails = {
        bankName: 'Bank Central Asia (BCA)',
        accountNumber: '882-019-3321',
        accountName: 'PT EXPO KARYA INDONESIA'
      },
      notes = ''
    } = req.body;

    if (!companyName || !clientName) {
      return res.status(400).json({ success: false, error: 'Nama PIC dan Nama Perusahaan wajib diisi' });
    }

    if (floorplanId && (boothCode || boothId)) {
      const existing = summarizeContract(getContractInvoices(floorplanId, boothCode, boothId));
      if (existing.invoiceCount > 0) {
        return res.status(409).json({
          success: false,
          code: 'CONTRACT_HAS_INVOICES',
          error: `Booth ${boothCode || ''} sudah memiliki invoice kontrak. Gunakan "Invoice DP" atau "Invoice Pelunasan" agar total kontrak tidak tertagih dua kali.`
        });
      }
    }

    const id = `INV-${Date.now()}`;
    const invoiceNumber = nextInvoiceNumber('full');

    // Default due date: 7 days from issue date if not provided
    const calculatedDueDate = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const resolvedPaymentType = paymentType || (paidAmount > 0 && paidAmount < totalAmount ? 'dp' : 'full');
    let resolvedPaidAmount = paidAmount !== undefined ? Number(paidAmount) : 0;
    let resolvedRemainingAmount = remainingAmount !== undefined ? Number(remainingAmount) : 0;
    const resolvedDpPercent = dpPercent ? Number(dpPercent) : (resolvedPaymentType === 'dp' && totalAmount > 0 && resolvedPaidAmount > 0 ? Math.round((resolvedPaidAmount / totalAmount) * 100) : 0);

    let effectivePaymentStatus = paymentStatus;
    if (effectivePaymentStatus === 'PAID') {
      resolvedPaidAmount = totalAmount;
      resolvedRemainingAmount = 0;
    } else if (resolvedPaidAmount > 0 && resolvedPaidAmount < totalAmount) {
      resolvedRemainingAmount = Math.max(0, totalAmount - resolvedPaidAmount);
      if (effectivePaymentStatus === 'UNPAID') effectivePaymentStatus = 'PARTIAL';
    } else if (resolvedPaidAmount === 0 && effectivePaymentStatus !== 'PAID') {
      resolvedRemainingAmount = totalAmount;
    }

    const createTransaction = db.transaction(() => {
      // 1. Insert into invoices
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, floorplan_id, booth_id, booth_code, event_id, event_title, event_venue,
          client_name, company_name, client_email, client_phone, client_address, client_npwp,
          issue_date, due_date, items_json, subtotal, discount_type, discount_value, discount_amount, discount_reason,
          tax_rate, tax_amount, total_amount, paid_amount, remaining_amount, payment_type, dp_percent,
          payment_status, payment_method, bank_details_json, notes,
          invoice_kind, contract_total, contract_tax_rate
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          'full', ?, ?
        )
      `).run(
        id, invoiceNumber, floorplanId || null, boothId || null, boothCode || null, eventId, eventTitle, eventVenue,
        clientName, companyName, clientEmail, clientPhone, clientAddress, clientNpwp,
        issueDate, calculatedDueDate, JSON.stringify(items), subtotal, discountType, discountValue, discountAmount, discountReason,
        taxRate, taxAmount, totalAmount, resolvedPaidAmount, resolvedRemainingAmount, resolvedPaymentType, resolvedDpPercent,
        effectivePaymentStatus, paymentMethod, JSON.stringify(bankDetails), notes,
        totalAmount, taxRate
      );

      // Booth status / tenant / canvas follow the contract via syncPaymentStatusFromInvoices() below

      return { id, invoiceNumber };
    });

    const result = createTransaction();
    syncPaymentStatusFromInvoices();

    const createdRecord = db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.id);
    let parsedItems = items;
    let parsedBankDetails = bankDetails;

    res.json({
      success: true,
      message: `Invoice ${result.invoiceNumber} berhasil diterbitkan!`,
      invoice: {
        ...createdRecord,
        items: parsedItems,
        bankDetails: parsedBankDetails
      }
    });
  } catch (error) {
    console.error("Create invoice error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/invoices/:id - Update invoice details
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    let {
      clientName,
      companyName,
      clientEmail,
      clientPhone,
      clientAddress,
      clientNpwp,
      issueDate,
      dueDate,
      items = [],
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      discountReason,
      taxRate,
      taxAmount,
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentType,
      dpPercent,
      paymentStatus,
      paymentMethod,
      bankDetails,
      notes
    } = req.body;

    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Invoice tidak ditemukan' });
    }

    // DP / Pelunasan amounts come from the booth contract: the edit form may change client data, dates
    // and notes, but not the money (use the status control, or change the booth price / discount).
    if (['dp', 'settlement'].includes(kindOf(existing))) {
      items = subtotal = discountType = discountValue = discountAmount = discountReason = undefined;
      taxRate = taxAmount = totalAmount = paidAmount = remainingAmount = paymentType = dpPercent = paymentStatus = undefined;
    }

    const currentTotal = totalAmount !== undefined ? Number(totalAmount) : Number(existing.total_amount);
    let resolvedPaid = paidAmount !== undefined ? Number(paidAmount) : existing.paid_amount;
    let resolvedRemaining = remainingAmount !== undefined ? Number(remainingAmount) : existing.remaining_amount;

    if (paymentStatus === 'PAID') {
      resolvedPaid = currentTotal;
      resolvedRemaining = 0;
    } else if (paidAmount !== undefined && currentTotal !== undefined) {
      resolvedRemaining = Math.max(0, currentTotal - resolvedPaid);
    }

    db.prepare(`
      UPDATE invoices
      SET 
        client_name = COALESCE(?, client_name),
        company_name = COALESCE(?, company_name),
        client_email = COALESCE(?, client_email),
        client_phone = COALESCE(?, client_phone),
        client_address = COALESCE(?, client_address),
        client_npwp = COALESCE(?, client_npwp),
        issue_date = COALESCE(?, issue_date),
        due_date = COALESCE(?, due_date),
        items_json = COALESCE(?, items_json),
        subtotal = COALESCE(?, subtotal),
        discount_type = COALESCE(?, discount_type),
        discount_value = COALESCE(?, discount_value),
        discount_amount = COALESCE(?, discount_amount),
        discount_reason = COALESCE(?, discount_reason),
        tax_rate = COALESCE(?, tax_rate),
        tax_amount = COALESCE(?, tax_amount),
        total_amount = COALESCE(?, total_amount),
        paid_amount = COALESCE(?, paid_amount),
        remaining_amount = COALESCE(?, remaining_amount),
        payment_type = COALESCE(?, payment_type),
        dp_percent = COALESCE(?, dp_percent),
        payment_status = COALESCE(?, payment_status),
        payment_method = COALESCE(?, payment_method),
        bank_details_json = COALESCE(?, bank_details_json),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      clientName,
      companyName,
      clientEmail,
      clientPhone,
      clientAddress,
      clientNpwp,
      issueDate,
      dueDate,
      items ? JSON.stringify(items) : null,
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      discountReason,
      taxRate,
      taxAmount,
      totalAmount,
      resolvedPaid,
      resolvedRemaining,
      paymentType,
      dpPercent,
      paymentStatus,
      paymentMethod,
      bankDetails ? JSON.stringify(bankDetails) : null,
      notes,
      id
    );

    const updatedRecord = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    syncPaymentStatusFromInvoices();
    let parsedItems = items;
    let parsedBankDetails = bankDetails;
    try { if (updatedRecord.items_json) parsedItems = JSON.parse(updatedRecord.items_json); } catch (e) {}
    try { if (updatedRecord.bank_details_json) parsedBankDetails = JSON.parse(updatedRecord.bank_details_json); } catch (e) {}

    res.json({
      success: true,
      message: 'Invoice berhasil diperbarui!',
      invoice: {
        ...updatedRecord,
        items: parsedItems,
        bankDetails: parsedBankDetails
      }
    });
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/invoices/:id/status - Update invoice and linked booth status
router.post('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, boothStatus, paidAmount, remainingAmount } = req.body;

    if (!status && !boothStatus) {
      return res.status(400).json({ success: false, error: 'Status pembayaran atau status booth wajib diisi' });
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice tidak ditemukan' });
    }

    const totalAmt = Number(invoice.total_amount) || 0;
    const validStatus = status ? status.toUpperCase() : (boothStatus === 'sold' ? 'PAID' : (boothStatus === 'available' ? 'CANCELED' : 'UNPAID'));
    const invoiceKind = kindOf(invoice);
    const wasPaid = ['PAID', 'PARTIAL'].includes(String(invoice.payment_status || '').toUpperCase());
    if (invoiceKind === 'dp' && validStatus === 'CANCELED' && wasPaid && !req.body.confirmCancelPaidDp) {
      return res.status(409).json({
        success: false, code: 'CONFIRM_CANCEL_PAID_DP', requireConfirmation: true,
        error: `Invoice DP ${invoice.invoice_number} sudah dibayar. Membatalkannya akan mengembalikan kontrak ke belum dibayar dan menghitung ulang invoice pelunasan.`
      });
    }
    const fpId = invoice.floorplan_id;
    const bCode = invoice.booth_code;
    const bId = invoice.booth_id;

    let targetPaid = invoice.paid_amount;
    let targetRemaining = invoice.remaining_amount;

    if (validStatus === 'PAID') {
      targetPaid = totalAmt;
      targetRemaining = 0;
    } else if (validStatus === 'UNPAID') {
      targetPaid = 0;
      targetRemaining = totalAmt;
    } else if (validStatus === 'PARTIAL') {
      targetPaid = paidAmount !== undefined ? Number(paidAmount) : (targetPaid > 0 ? targetPaid : Math.round(totalAmt / 2));
      targetRemaining = Math.max(0, totalAmt - targetPaid);
    } else if (validStatus === 'CANCELED') {
      // Nothing left to collect; paid_amount is kept as audit trail of what was received before canceling
      targetRemaining = 0;
    } else if (paidAmount !== undefined) {
      targetPaid = Number(paidAmount);
      targetRemaining = Math.max(0, totalAmt - targetPaid);
    }

    const updateTransaction = db.transaction(() => {
      // 1. Update invoice
      db.prepare(`
        UPDATE invoices 
        SET payment_status = ?, paid_amount = ?, remaining_amount = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(
        validStatus,
        targetPaid,
        targetRemaining,
        id
      );

      // 2. DP / Pelunasan / Penuh: recompute the open balance (e.g. a canceled DP raises the Pelunasan back);
      //    booth status, tenant, orders and canvas then follow the whole contract via the sync below.
      //    Add-on (facility) invoices never change the booth.
      if (CONTRACT_KINDS.includes(invoiceKind) && fpId && (bCode || bId)) {
        recalcContract(fpId, bCode, bId);
      }
    });

    updateTransaction();
    syncPaymentStatusFromInvoices();

    const contract = CONTRACT_KINDS.includes(invoiceKind) && fpId ? getContract(fpId, bCode, bId) : null;
    const finalBoothStatus = contract?.boothStatus || null;
    if (invoiceKind === 'dp' && validStatus === 'CANCELED' && wasPaid) {
      writeAuditLog({
        user: req.user, category: 'Invoice', action: 'Batalkan Invoice DP yang sudah dibayar',
        target: `${invoice.invoice_number} (${invoice.company_name}, booth ${bCode})`,
        summary: `DP Rp ${totalAmt.toLocaleString('id-ID')} dibatalkan; pelunasan dihitung ulang`, ip: clientIp(req)
      });
    }

    res.json({
      success: true,
      message: `Status invoice ${invoice.invoice_number} diubah menjadi ${validStatus}${finalBoothStatus ? `; kontrak booth #${bCode}: ${contractStatusLabel(contract.status)} (booth ${finalBoothStatus.toUpperCase()})` : ''}`,
      invoiceStatus: validStatus,
      boothStatus: finalBoothStatus,
      contractStatus: contract?.status || null
    });
  } catch (error) {
    console.error("Update invoice status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/invoices/sync-booth-discount - Direct save discount from Property Inspector & instant invoice sync
router.post('/sync-booth-discount', (req, res) => {
  try {
    const {
      floorplanId = 'FP-2026-001',
      boothCode,
      boothId,
      price = 5000000,
      discountType = 'nominal',
      discountValue = 0,
      discountAmount = 0,
      discountReason = ''
    } = req.body;

    if (!boothCode && !boothId) {
      return res.status(400).json({ success: false, error: 'Kode booth atau ID booth wajib diisi' });
    }

    const numPrice = Number(price) || 5000000;
    const numDiscVal = Number(discountValue) || 0;
    let calcDiscountAmount = Number(discountAmount) || 0;

    if (discountType === 'percentage') {
      calcDiscountAmount = Math.round((numPrice * Math.min(100, Math.max(0, numDiscVal))) / 100);
    } else {
      calcDiscountAmount = Math.min(numPrice, Math.max(0, Math.round(numDiscVal)));
    }

    const netTotal = Math.max(0, numPrice - calcDiscountAmount);

    const syncTransaction = db.transaction(() => {
      // 1. Update the booth in this floorplan only (price + private discount define the contract value)
      db.prepare(`
        UPDATE booths 
        SET price = COALESCE(?, price), discount_type = ?, discount_value = ?, discount_amount = ?, discount_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE floorplan_id = ? AND deleted_at IS NULL AND (LOWER(TRIM(code)) = LOWER(TRIM(?)) OR (? != '' AND id = ?))
      `).run(req.body.price !== undefined ? numPrice : null, discountType, numDiscVal, calcDiscountAmount, discountReason.trim(), floorplanId, boothCode || '', boothId || '', boothId || '');

      // 2. Contract invoices: keep the discount on the single "full" invoice for display, then recompute the open
      //    balance (unpaid Pelunasan / Penuh). DP and paid invoices are never rewritten; add-on invoices are untouched.
      const contractInvoices = getContractInvoices(floorplanId, boothCode, boothId);
      contractInvoices
        .filter(inv => kindOf(inv) === 'full' && ['UNPAID', 'PENDING'].includes(String(inv.payment_status).toUpperCase()))
        .forEach(inv => {
          db.prepare(`
            UPDATE invoices SET discount_type = ?, discount_value = ?, discount_amount = ?, discount_reason = ?, subtotal = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(discountType, numDiscVal, calcDiscountAmount, discountReason.trim(), numPrice, inv.id);
        });
      recalcContract(floorplanId, boothCode, boothId);

      // 3. Update active floorplan canvas_fabric_json if exists
      if (floorplanId) {
        const fp = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(floorplanId);
        if (fp && fp.canvas_fabric_json) {
          try {
            const fabric = JSON.parse(fp.canvas_fabric_json);
            if (fabric.objects) {
              fabric.objects.forEach(obj => {
                if (obj.isBooth && (obj.boothData?.code === boothCode || obj.boothData?.id === boothId)) {
                  if (obj.boothData) {
                    obj.boothData.discountType = discountType;
                    obj.boothData.discountValue = numDiscVal;
                    obj.boothData.discountAmount = calcDiscountAmount;
                    obj.boothData.discountReason = discountReason.trim();
                  }
                }
              });
              db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
                JSON.stringify(fabric),
                floorplanId
              );
            }
          } catch (e) {}
        }
      }
    });

    syncTransaction();
    syncPaymentStatusFromInvoices();

    res.json({
      success: true,
      message: `Diskon booth #${boothCode} berhasil disimpan & disinkronkan langsung ke Invoice!`,
      discount: {
        discountType,
        discountValue: numDiscVal,
        discountAmount: calcDiscountAmount,
        discountReason: discountReason.trim(),
        subtotal: numPrice,
        netTotal
      }
    });
  } catch (error) {
    console.error("Sync booth discount error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice tidak ditemukan' });
    }

    const kind = kindOf(invoice);
    if (CONTRACT_KINDS.includes(kind) && invoicePaidAmount(invoice) > 0) {
      return res.status(409).json({
        success: false,
        code: 'INVOICE_PAID',
        error: `Invoice ${invoice.invoice_number} sudah menerima pembayaran sehingga tidak dapat dihapus. Ubah statusnya menjadi "Batal" (dengan konfirmasi) bila memang harus dibatalkan.`
      });
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.transaction(() => {
      db.prepare('UPDATE invoices SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nowStr, id);
      if (kind === 'dp') {
        // The Pelunasan no longer has a DP to subtract
        db.prepare("UPDATE invoices SET related_invoice_id = NULL WHERE related_invoice_id = ? AND deleted_at IS NULL").run(id);
      }
      if (CONTRACT_KINDS.includes(kind) && invoice.floorplan_id && invoice.booth_code) {
        recalcContract(invoice.floorplan_id, invoice.booth_code, invoice.booth_id);
      }
    })();
    syncPaymentStatusFromInvoices();

    res.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} dipindahkan ke Sampah.`
    });
  } catch (error) {
    console.error("Delete invoice error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
