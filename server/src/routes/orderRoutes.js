import express from 'express';
import db from '../db.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';
import { getContractInvoices, getContract, boothContractValue, invoicePaidAmount, invoiceCodeTokens, removeBoothFromInvoice, kindOf, contractValueForCode } from '../utils/contractBilling.js';
import { exhibitorIdFor } from '../utils/exhibitorIdentity.js';
import { clusterCheckoutBooths, computeFloorplanMergeGroups } from '../utils/boothMergeGroups.js';
import { sortCodes } from '../../../shared/boothGroups.js';
import { notifyOpsOfSalesChange } from '../utils/opsLayer.js';

const router = express.Router();

// POST /api/orders/checkout - Process booth order & payment
router.post('/checkout', (req, res) => {
  try {
    const {
      boothId,
      boothCode,
      fullName,
      brandName,
      brandCategory = '',
      email,
      phone,
      totalAmount,
      bookingType = 'booking',
      paymentMethod = 'qris',
      transferBank = '',
      transferSenderName = '',
      notes = '',
      invoiceNumber = `INV/EXP-${Date.now().toString().slice(-6)}`
    } = req.body;

    const hasBooths = Boolean(boothCode) || (Array.isArray(req.body.boothCodes) && req.body.boothCodes.some(Boolean));
    if (!hasBooths || !brandName || !email || !phone) {
      return res.status(400).json({ success: false, error: 'Data formulir tidak lengkap' });
    }

    // Public registration offers only "Booking Dulu" and "Transfer Bank Manual": neither records a payment.
    // There is no real payment gateway, so an instantly-PAID booking is reserved for logged-in staff
    // (e.g. "Pendaftaran Langsung Admin (Lunas)" from the Studio).
    const PUBLIC_BOOKING_TYPES = ['booking', 'manual_transfer'];
    if (!req.user && !PUBLIC_BOOKING_TYPES.includes(bookingType)) {
      return res.status(400).json({ success: false, error: 'Metode pembayaran tidak tersedia. Pilih "Booking Dulu" atau "Transfer Bank Manual".' });
    }

    // Determine status based on bookingType:
    // 1. 'payment_gateway' -> PAID & sold immediately
    // 2. 'manual_transfer' -> PENDING verification & reserved
    // 3. 'booking' -> UNPAID & reserved (Hold 24 Jam)
    let resolvedBoothStatus = 'sold';
    let resolvedPaymentStatus = 'PAID';
    let resolvedPaymentMethod = paymentMethod;

    if (bookingType === 'booking') {
      resolvedBoothStatus = 'reserved';
      resolvedPaymentStatus = 'UNPAID';
      resolvedPaymentMethod = 'Booking Hold (Belum Bayar)';
    } else if (bookingType === 'manual_transfer') {
      resolvedBoothStatus = 'reserved';
      resolvedPaymentStatus = 'PENDING';
      resolvedPaymentMethod = `Transfer Bank Manual (${transferBank || 'BCA/Mandiri'})`;
    }

    let resolvedNotes = notes;
    if (!resolvedNotes) {
      if (bookingType === 'booking') {
        resolvedNotes = `Booking sementara (Hold 24 Jam) - Menunggu konfirmasi pembayaran exhibitor`;
      } else if (bookingType === 'manual_transfer') {
        resolvedNotes = `Transfer Bank Manual ke rekening panitia. Pengirim: ${transferSenderName || fullName || brandName} (${transferBank || 'Bank'}). Menunggu verifikasi mutasi.`;
      } else {
        resolvedNotes = `Pemesanan langsung via Payment Gateway Instan (${brandCategory || 'Umum'})`;
      }
    }

    // Booths of this registration: one or several (multi-booth selection). A manually merged code such as
    // "A-04+A-05" is still ONE booth. Each requested code may carry its canvas booth id in `boothIds`.
    const requestedCodes = [...new Set((Array.isArray(req.body.boothCodes) && req.body.boothCodes.length ? req.body.boothCodes : [boothCode])
      .map(c => String(c || '').trim()).filter(Boolean))];
    const requestedIds = Array.isArray(req.body.boothIds) ? req.body.boothIds : [];
    // Auto-merge groups booths per exhibitor ID (derived from the email), never per brand-name text (AGENTS.md §18)
    const exhibitorId = exhibitorIdFor(email, brandName);
    const stamp = Date.now();
    const lower = (v) => String(v || '').trim().toLowerCase();
    const upper = (v) => String(v || '').trim().toUpperCase();
    const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { httpStatus: status, extra });

    const checkoutTransaction = db.transaction(() => {
      // 1. Get active or specified floorplan
      const targetFp = req.body.floorplanId 
        ? db.prepare('SELECT id FROM floorplans WHERE id = ?').get(req.body.floorplanId)
        : null;
      const floorplan = targetFp 
        || db.prepare("SELECT id FROM floorplans WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1").get()
        || db.prepare("SELECT id FROM floorplans ORDER BY updated_at DESC LIMIT 1").get();
      const floorplanId = floorplan ? floorplan.id : (req.body.floorplanId || 'FP-DEFAULT');
      // Visitors can only book the floorplan the admin published
      if (!req.user) {
        const fpStatus = db.prepare('SELECT status, deleted_at FROM floorplans WHERE id = ?').get(floorplanId);
        if (!fpStatus || fpStatus.status !== 'published' || fpStatus.deleted_at) {
          throw httpError(404, 'Denah ini belum dipublikasikan sehingga belum bisa dibooking.');
        }
      }

      const registrationSource = req.body.source || (req.body.isAdmin ? 'admin' : 'online');
      const adminName = req.body.adminName || (registrationSource === 'admin' ? 'Admin' : '');

      // 2. Resolve every requested booth: exact code (case-insensitive), merged-code tokens (A-04 <-> A-04+A-05)
      //    or a non-empty booth id, always scoped to this floorplan (AGENTS.md §12)
      const boothMatch = `
        floorplan_id = ? AND deleted_at IS NULL AND (
          LOWER(TRIM(code)) = LOWER(TRIM(?))
          OR ('+' || LOWER(TRIM(code)) || '+') LIKE ('%+' || LOWER(TRIM(?)) || '+%')
          OR (? != '' AND (id = ? OR id LIKE '%\\_' || ? ESCAPE '\\'))
        )`;
      const targets = new Map();
      const notFound = [];
      requestedCodes.forEach((code, i) => {
        const id = String(requestedIds[i] || (requestedCodes.length === 1 ? boothId : '') || '');
        const rows = db.prepare(`SELECT * FROM booths WHERE ${boothMatch}`).all(floorplanId, code, code, id, id, id);
        if (!rows.length) notFound.push(code);
        rows.forEach(r => targets.set(r.id, r));
      });
      if (notFound.length) {
        throw httpError(404, `Booth ${notFound.join(', ')} tidak ditemukan di denah ini`, { unavailable: notFound });
      }
      const targetBooths = [...targets.values()];

      // 3. Public visitors may only book open booths (another visitor may have just booked one of the selection);
      //    staff can (re)assign a booth from the Studio
      const taken = targetBooths.filter(b => ['sold', 'reserved', 'booked'].includes(lower(b.status)));
      if (taken.length && !req.user) {
        throw httpError(409, `Booth ${taken.map(b => b.code).join(', ')} baru saja dipesan / terjual oleh pengunjung lain. Booth tersebut dikeluarkan dari pilihan Anda.`, { unavailable: taken.map(b => b.code) });
      }
      // A booth in a project belongs to one exhibitor: if another exhibitor already paid for it, it must be released
      // first ("Lepas Tenant"), otherwise both exhibitors' invoices would count toward the same booth.
      for (const b of targetBooths) {
        const paidByOther = getContractInvoices(floorplanId, b.code, b.id).filter(inv =>
          invoicePaidAmount(inv) > 0 && upper(inv.payment_status) !== 'CANCELED' &&
          exhibitorIdFor(inv.client_email, inv.company_name) !== exhibitorId
        );
        if (paidByOther.length) {
          throw httpError(409, `Booth ${b.code} sudah dimiliki ${paidByOther[0].company_name} dan sudah ada pembayaran (${paidByOther.map(i => i.invoice_number).join(', ')}). Lepas tenant tersebut terlebih dahulu.`, { unavailable: [b.code] });
        }
      }

      // 4. A (re)registration replaces the booths' previous unpaid contract invoices (previous tenant / draft).
      //    A multi-booth contract only loses the re-registered booth; the rest of that group keeps its contract.
      const targetCodeSet = new Set(targetBooths.map(b => lower(b.code)));
      targetBooths.forEach(b => {
        getContractInvoices(floorplanId, b.code, b.id)
          .filter(inv => ['UNPAID', 'PENDING'].includes(upper(inv.payment_status)))
          .forEach(inv => {
            const tokens = invoiceCodeTokens(inv.booth_code);
            if (tokens.length > 1 && lower(inv.booth_code) !== lower(b.code) && !tokens.every(t => targetCodeSet.has(lower(t)))) {
              removeBoothFromInvoice(inv, b.code, `didaftarkan ulang untuk ${brandName}`);
              return;
            }
            db.prepare(`
              UPDATE invoices SET payment_status = 'CANCELED', remaining_amount = 0,
                notes = COALESCE(notes, '') || ' [Dibatalkan otomatis: booth didaftarkan ulang untuk ' || ? || ']', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(brandName, inv.id);
          });
      });

      // 5. Assign the booths to the exhibitor
      const updateBooth = db.prepare(`
        UPDATE booths
        SET status = ?, owner_name = ?, brand_category = ?, pic_name = ?, email = ?, phone = ?,
            registration_source = ?, registered_by = ?, exhibitor_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      targetBooths.forEach(b => updateBooth.run(resolvedBoothStatus, brandName, brandCategory || '', fullName || brandName, email, phone, registrationSource, adminName, exhibitorId, b.id));

      // 6. Payment plan (the same for every contract of this registration)
      const resolvedPaymentType = req.body.paymentType || req.body.payment_type || 'full';
      const resolvedDpPercent = req.body.downPaymentPercent || req.body.dpPercent || (resolvedPaymentType === 'dp' ? 50 : 0);
      // A DP is only money received when it was actually paid now (status PAID -> PARTIAL). For a booking hold or a
      // manual transfer awaiting verification the DP is just the plan: nothing is paid until finance confirms it.
      if (resolvedPaymentType === 'dp' && resolvedPaymentStatus === 'PAID') {
        resolvedPaymentStatus = 'PARTIAL';
        resolvedBoothStatus = 'reserved';
      }
      const isDpInvoice = resolvedPaymentType === 'dp';
      const invoiceStatus = isDpInvoice && resolvedPaymentStatus === 'PARTIAL' ? 'PAID' : resolvedPaymentStatus;
      const todayStr = new Date().toISOString().split('T')[0];
      const dueDateStr = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

      // Booth value = price - private discount. Without discounts the total sent by the form (incl. PPN) is
      // shared over the booths by price, as for single-booth registrations before.
      const priced = targetBooths.map(b => ({ b, price: Number(b.price) || 0, discount: Number(b.discount_amount) || 0 }));
      const allPriceSum = priced.reduce((acc, p) => acc + p.price, 0);
      const anyDiscount = priced.some(p => p.discount > 0);
      const clientTotal = Number(totalAmount) || 0;

      // 7. One contract per cluster of adjacent booths (auto-merge). A cluster that touches booths the exhibitor
      //    already has on an UNPAID contract extends that contract; a paid / DP contract is never changed.
      const clusters = clusterCheckoutBooths(floorplanId, targetBooths.map(b => b.code), exhibitorId);
      const warnings = [];
      const invoiceNumbers = [];
      const orderIds = [];
      const clusterInfo = [];
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          id, floorplan_id, booth_id, booth_code, company_name, pic_name, email, phone, total_amount, payment_method, payment_status,
          invoice_number, brand_category, source, admin_name, exhibitor_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      clusters.forEach((cluster, ci) => {
        const members = priced.filter(p => cluster.targets.some(c => lower(c) === lower(p.b.code)));
        if (!members.length) return;
        const subtotal = members.reduce((acc, p) => acc + p.price, 0);
        const discount = members.reduce((acc, p) => acc + p.discount, 0);
        const share = allPriceSum > 0 ? subtotal / allPriceSum : members.length / priced.length;
        const clusterFinal = anyDiscount || !clientTotal ? Math.max(0, subtotal - discount) : Math.round(clientTotal * share);
        const items = members.map((p, i) => ({
          id: `item-${i + 1}`,
          boothCode: p.b.code,
          description: `Sewa Booth #${p.b.code} (${p.b.width_m || 3}×${p.b.height_m || 3} m, ${p.b.category || 'Standar'})${p.discount > 0 ? ` - diskon Rp ${p.discount.toLocaleString('id-ID')}` : ''}`,
          qty: 1,
          unitPrice: p.price,
          amount: p.price
        }));

        // Existing contracts of adjacent booths of this exhibitor
        const existingInvoices = [];
        cluster.existing.forEach(code => getContractInvoices(floorplanId, code, '')
          .filter(inv => upper(inv.payment_status) !== 'CANCELED')
          .forEach(inv => { if (!existingInvoices.some(x => x.id === inv.id)) existingInvoices.push(inv); }));
        const existingSet = new Set(cluster.existing.map(lower));
        const canExtend = cluster.existing.length > 0 && !isDpInvoice && ['UNPAID', 'PENDING'].includes(invoiceStatus) &&
          existingInvoices.length > 0 &&
          existingInvoices.every(inv => kindOf(inv) === 'full' && ['UNPAID', 'PENDING'].includes(upper(inv.payment_status)) &&
            invoiceCodeTokens(inv.booth_code).every(t => existingSet.has(lower(t))));

        let contractCodes = cluster.targets;
        let invoiceNo;
        if (canExtend) {
          // Extend the unpaid contract: one invoice for the whole group (old items + new booths)
          const [base, ...others] = existingInvoices;
          let allItems = [];
          existingInvoices.forEach(inv => { try { allItems.push(...JSON.parse(inv.items_json || '[]')); } catch (e) {} });
          allItems = [...allItems, ...items].map((it, i) => ({ ...it, id: `item-${i + 1}` }));
          contractCodes = sortCodes([...new Set([...existingInvoices.flatMap(inv => invoiceCodeTokens(inv.booth_code)), ...cluster.targets])]);
          const oldTotal = existingInvoices.reduce((acc, inv) => acc + (Number(inv.total_amount) || 0), 0);
          const newTotal = oldTotal + clusterFinal;
          const status = [invoiceStatus, ...existingInvoices.map(inv => upper(inv.payment_status))].includes('PENDING') ? 'PENDING' : 'UNPAID';
          db.prepare(`
            UPDATE invoices SET booth_code = ?, booth_id = NULL, items_json = ?, subtotal = ?, discount_amount = ?, total_amount = ?,
              paid_amount = 0, remaining_amount = ?, contract_total = ?, payment_status = ?,
              notes = COALESCE(notes, '') || ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(contractCodes.join('+'), JSON.stringify(allItems),
            existingInvoices.reduce((acc, inv) => acc + (Number(inv.subtotal) || 0), 0) + subtotal,
            existingInvoices.reduce((acc, inv) => acc + (Number(inv.discount_amount) || 0), 0) + discount,
            newTotal, newTotal, newTotal, status,
            ` [Kontrak gabungan: booth ${cluster.targets.join(', ')} ditambahkan]`, base.id);
          others.forEach(inv => db.prepare(`
            UPDATE invoices SET payment_status = 'CANCELED', remaining_amount = 0,
              notes = COALESCE(notes, '') || ' [Digabung ke invoice ' || ? || ']', updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(base.invoice_number, inv.id));
          invoiceNo = base.invoice_number;
        } else {
          if (cluster.existing.length) {
            warnings.push(`Booth ${cluster.targets.join(', ')} menempel dengan booth ${cluster.existing.join(', ')} milik ${brandName} yang ${isDpInvoice ? 'dibayar dengan skema DP' : 'kontraknya sudah memiliki pembayaran / DP'}: ditagih sebagai kontrak terpisah, tetap tampil tergabung di denah.`);
          }
          invoiceNo = ci === 0 ? invoiceNumber : `${invoiceNumber}-${ci + 1}`;
          const dpAmount = isDpInvoice
            ? Math.round(req.body.paidAmount !== undefined && resolvedPaymentStatus === 'PARTIAL' ? Number(req.body.paidAmount) * share : (clusterFinal * (resolvedDpPercent || 50)) / 100)
            : 0;
          const invoiceTotal = isDpInvoice ? dpAmount : clusterFinal;
          const invoicePaid = invoiceStatus === 'PAID' ? invoiceTotal : 0;
          const codeLabel = cluster.targets.join('+');
          const invoiceItems = isDpInvoice
            ? [{ id: 'item-1', description: `Uang Muka (DP ${resolvedDpPercent}%) Sewa Booth #${codeLabel} - ${resolvedPaymentMethod}`, qty: 1, unitPrice: dpAmount, amount: dpAmount }]
            : items;
          db.prepare(`
            INSERT OR REPLACE INTO invoices (
              id, invoice_number, floorplan_id, booth_id, booth_code,
              client_name, company_name, client_email, client_phone,
              issue_date, due_date, items_json, subtotal, discount_type, discount_value, discount_amount, discount_reason, total_amount,
              paid_amount, remaining_amount, payment_type, dp_percent,
              payment_status, payment_method, notes,
              invoice_kind, contract_total, contract_tax_rate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(
            `INV-REC-${stamp}${ci ? `-${ci + 1}` : ''}`,
            invoiceNo,
            floorplanId,
            members.length === 1 ? members[0].b.id : null,
            codeLabel,
            fullName || brandName,
            brandName,
            email,
            phone,
            todayStr,
            dueDateStr,
            JSON.stringify(invoiceItems),
            isDpInvoice ? dpAmount : subtotal,
            members.length === 1 ? (members[0].b.discount_type || 'nominal') : 'nominal',
            isDpInvoice ? 0 : (members.length === 1 ? Number(members[0].b.discount_value) || 0 : discount),
            isDpInvoice ? 0 : discount,
            isDpInvoice ? '' : members.map(p => p.b.discount_reason).filter(Boolean).join('; '),
            invoiceTotal,
            invoicePaid,
            invoiceTotal - invoicePaid,
            resolvedPaymentType,
            resolvedDpPercent,
            invoiceStatus,
            resolvedPaymentMethod,
            resolvedNotes,
            isDpInvoice ? 'dp' : 'full',
            clusterFinal
          );
        }
        invoiceNumbers.push(invoiceNo);
        clusterInfo.push({ codes: contractCodes, newBooths: cluster.targets, invoiceNumber: invoiceNo, extended: canExtend });

        // One order row per booth (dashboard & reports count booths, not groups)
        members.forEach((p, i) => {
          const orderId = `ORD-${stamp}${clusters.length > 1 || members.length > 1 ? `-${ci + 1}-${i + 1}` : ''}`;
          orderIds.push(orderId);
          insertOrder.run(orderId, floorplanId, p.b.id, p.b.code, brandName, fullName || brandName, email, phone,
            Math.round(subtotal > 0 ? clusterFinal * (p.price / subtotal) : clusterFinal / members.length),
            resolvedPaymentMethod, resolvedPaymentStatus, invoiceNo, brandCategory || '', registrationSource, adminName, exhibitorId);
        });
      });

      // 8. Booth status, tenant & canvas follow the contracts (precise matching, AGENTS.md §12)
      try {
        syncPaymentStatusFromInvoices();
      } catch (err) {
        console.error("Error running syncPaymentStatusFromInvoices inside checkout transaction:", err);
      }

      return { orderIds, invoiceNumbers, floorplanId, clusters: clusterInfo, warnings, boothCodes: targetBooths.map(b => b.code) };
    });

    const result = checkoutTransaction();
    // A new tenant on a booth is a sales change the operations team should see
    notifyOpsOfSalesChange(result.floorplanId, result.boothCodes.length, req.user?.name || 'Pendaftaran online');
    const boothLabel = result.boothCodes.join(', ');

    let successMessage = `Pemesanan booth ${boothLabel} atas nama ${brandName} berhasil terverifikasi!`;
    if (bookingType === 'booking') {
      successMessage = `Booth ${boothLabel} berhasil di-hold (Booking) atas nama ${brandName}. Menunggu pembayaran.`;
    } else if (bookingType === 'manual_transfer') {
      successMessage = `Pemesanan booth ${boothLabel} berhasil diajukan! Menunggu verifikasi transfer finance.`;
    }

    res.json({
      success: true,
      message: successMessage,
      warnings: result.warnings,
      order: {
        id: result.orderIds[0],
        orderIds: result.orderIds,
        invoiceNumber: result.invoiceNumbers[0],
        invoiceNumbers: result.invoiceNumbers,
        contracts: result.clusters,
        boothCodes: result.boothCodes,
        boothCode: result.boothCodes.join('+'),
        brandName,
        brandCategory,
        fullName,
        email,
        phone,
        totalAmount,
        bookingType,
        paymentMethod: resolvedPaymentMethod,
        status: resolvedPaymentStatus,
        boothStatus: resolvedBoothStatus,
        date: new Date().toLocaleDateString('id-ID')
      }
    });
  } catch (error) {
    if (!error.httpStatus) console.error("Checkout order error:", error);
    res.status(error.httpStatus || 500).json({ success: false, error: error.message, ...(error.extra || {}) });
  }
});

// GET /api/orders/registered-clients - List all registered clients for admin selector & deduplication
router.get('/registered-clients', (req, res) => {
  try {
    const clientMap = new Map();

    const orderRows = db.prepare(`
      SELECT 
        company_name, pic_name, email, phone, brand_category, 
        source, admin_name, booth_code, created_at
      FROM orders 
      WHERE deleted_at IS NULL AND company_name IS NOT NULL AND TRIM(company_name) != ''
      ORDER BY created_at DESC
    `).all();

    orderRows.forEach(r => {
      const key = (r.company_name || '').trim().toLowerCase();
      if (!key) return;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          company_name: r.company_name.trim(),
          pic_name: r.pic_name ? r.pic_name.trim() : r.company_name.trim(),
          email: r.email ? r.email.trim() : '',
          phone: r.phone ? r.phone.trim() : '',
          brand_category: r.brand_category ? r.brand_category.trim() : '',
          source: r.source || 'online',
          admin_name: r.admin_name || '',
          booth_codes: r.booth_code ? [r.booth_code] : [],
          last_booking: r.created_at
        });
      } else {
        const existing = clientMap.get(key);
        if (!existing.email && r.email) existing.email = r.email.trim();
        if (!existing.phone && r.phone) existing.phone = r.phone.trim();
        if (!existing.pic_name && r.pic_name) existing.pic_name = r.pic_name.trim();
        if (!existing.brand_category && r.brand_category) existing.brand_category = r.brand_category.trim();
        if (r.booth_code && !existing.booth_codes.includes(r.booth_code)) {
          existing.booth_codes.push(r.booth_code);
        }
      }
    });

    const boothRows = db.prepare(`
      SELECT 
        owner_name, pic_name, email, phone, brand_category,
        registration_source, registered_by, code, updated_at
      FROM booths 
      WHERE deleted_at IS NULL AND owner_name IS NOT NULL AND TRIM(owner_name) != ''
      ORDER BY updated_at DESC
    `).all();

    boothRows.forEach(r => {
      const key = (r.owner_name || '').trim().toLowerCase();
      if (!key) return;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          company_name: r.owner_name.trim(),
          pic_name: r.pic_name ? r.pic_name.trim() : r.owner_name.trim(),
          email: r.email ? r.email.trim() : '',
          phone: r.phone ? r.phone.trim() : '',
          brand_category: r.brand_category ? r.brand_category.trim() : '',
          source: r.registration_source || 'admin',
          admin_name: r.registered_by || '',
          booth_codes: r.code ? [r.code] : [],
          last_booking: r.updated_at
        });
      } else {
        const existing = clientMap.get(key);
        if (!existing.email && r.email) existing.email = r.email.trim();
        if (!existing.phone && r.phone) existing.phone = r.phone.trim();
        if (!existing.pic_name && r.pic_name) existing.pic_name = r.pic_name.trim();
        if (!existing.brand_category && r.brand_category) existing.brand_category = r.brand_category.trim();
        if (r.code && !existing.booth_codes.includes(r.code)) {
          existing.booth_codes.push(r.code);
        }
      }
    });

    const clients = Array.from(clientMap.values())
      .sort((a, b) => a.company_name.localeCompare(b.company_name))
      .map(c => ({
        // camelCase fields expected by frontend (PropertyPanel / SelectRegisteredClientModal)
        company: c.company_name,
        brandName: c.company_name,
        pic: c.pic_name,
        fullName: c.pic_name,
        email: c.email,
        phone: c.phone,
        contact: c.phone,
        brandCategory: c.brand_category,
        boothsCount: (c.booth_codes || []).length,
        boothCodes: c.booth_codes || [],
        registrationSource: c.source,
        source: c.source,
        adminName: c.admin_name,
        lastBooking: c.last_booking,
        // also keep snake_case for compatibility
        company_name: c.company_name,
        pic_name: c.pic_name,
        brand_category: c.brand_category,
        booth_codes: c.booth_codes || []
      }));
    res.json({ success: true, clients });
  } catch (err) {
    console.error("Error fetching registered clients:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders/check-client - Prevent duplicate registrations by checking email or phone
router.get('/check-client', (req, res) => {
  try {
    const { email, phone } = req.query;
    if (!email && !phone) {
      return res.json({ success: true, exists: false });
    }
    let match = null;
    if (email && email.trim()) {
      match = db.prepare(`
        SELECT company_name, pic_name, email, phone, brand_category 
        FROM orders 
        WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1
      `).get(email.trim());

      if (!match) {
        match = db.prepare(`
          SELECT owner_name as company_name, pic_name, email, phone, brand_category 
          FROM booths 
          WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT 1
        `).get(email.trim());
      }
    }
    if (!match && phone && phone.trim()) {
      match = db.prepare(`
        SELECT company_name, pic_name, email, phone, brand_category 
        FROM orders 
        WHERE LOWER(REPLACE(REPLACE(phone, '-', ''), ' ', '')) = LOWER(REPLACE(REPLACE(?, '-', ''), ' ', '')) AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1
      `).get(phone.trim());

      if (!match) {
        match = db.prepare(`
          SELECT owner_name as company_name, pic_name, email, phone, brand_category 
          FROM booths 
          WHERE LOWER(REPLACE(REPLACE(phone, '-', ''), ' ', '')) = LOWER(REPLACE(REPLACE(?, '-', ''), ' ', '')) AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT 1
        `).get(phone.trim());
      }
    }
    // Visitors only learn THAT the email / phone is already registered, never whose it is (name, email, phone):
    // otherwise anyone could look up another exhibitor's contact details by typing a phone number
    if (!req.user) {
      return res.json({ success: true, exists: Boolean(match), client: null });
    }
    const normalizedClient = match ? {
      company: match.company_name,
      brandName: match.company_name,
      company_name: match.company_name,
      pic: match.pic_name,
      fullName: match.pic_name,
      pic_name: match.pic_name,
      email: match.email,
      phone: match.phone,
      contact: match.phone,
      brandCategory: match.brand_category,
      brand_category: match.brand_category
    } : null;
    res.json({ success: true, exists: Boolean(match), client: normalizedClient });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/detach-tenant - Detach tenant from booth, cancel unpaid invoice, revert booth to available
router.post('/detach-tenant', (req, res) => {
  try {
    const { floorplanId, boothId, boothCode, force = false, adminName = 'Admin' } = req.body;
    if (!boothCode && !boothId) {
      return res.status(400).json({ success: false, error: 'boothCode atau boothId wajib diberikan' });
    }

    const fpId = floorplanId || 'FP-2026-001';

    // All live contract invoices of this booth (DP + Pelunasan / Penuh); add-on invoices are not touched
    const contractInvoices = getContractInvoices(fpId, boothCode || '', boothId || '')
      .filter(inv => String(inv.payment_status || '').toUpperCase() !== 'CANCELED');
    const paidInvoices = contractInvoices.filter(inv => ['PAID', 'PARTIAL'].includes(String(inv.payment_status).toUpperCase()));
    const linkedInvoice = paidInvoices[paidInvoices.length - 1] || contractInvoices[contractInvoices.length - 1] || null;
    const paidTotal = paidInvoices.reduce((acc, inv) => acc + (String(inv.payment_status).toUpperCase() === 'PAID' ? Number(inv.total_amount) || 0 : Number(inv.paid_amount) || 0), 0);

    const isPaidOrDp = paidInvoices.length > 0;
    // A multi-booth contract ("A-01+A-03+A-04", auto-merge) is shared with other booths: only this booth leaves it
    const isSharedInvoice = (inv) => invoiceCodeTokens(inv.booth_code).length > 1 &&
      String(inv.booth_code || '').trim().toLowerCase() !== String(boothCode || '').trim().toLowerCase();
    const sharedPaid = paidInvoices.filter(isSharedInvoice);

    if (isPaidOrDp && !force) {
      return res.status(400).json({
        success: false,
        requireConfirmation: true,
        invoiceStatus: linkedInvoice.payment_status,
        paidAmount: paidTotal,
        message: sharedPaid.length === paidInvoices.length
          ? `Perhatian: Booth ${boothCode} termasuk kontrak gabungan yang sudah dibayar (${sharedPaid.map(inv => `${inv.invoice_number} #${inv.booth_code}`).join(', ')}). Booth akan dikeluarkan dari kontrak dan tampil terpisah; nominal invoice TIDAK diubah otomatis.`
          : `Perhatian: Booth ${boothCode} sudah menerima pembayaran Rp ${paidTotal.toLocaleString('id-ID')} (${paidInvoices.map(inv => inv.invoice_number).join(', ')}). Melepas tenant akan membatalkan seluruh invoice kontrak booth ini.`
      });
    }
    const warnings = [];

    // Atomic detach transaction
    const detachTransaction = db.transaction(() => {
      // 1. Cancel every live contract invoice of the booth (DP, Pelunasan, Penuh); a shared multi-booth contract
      //    only loses this booth (unmerge): unpaid -> item & amount removed, paid / DP -> amounts kept + warning
      contractInvoices.forEach(inv => {
        if (isSharedInvoice(inv)) {
          const { warning } = removeBoothFromInvoice(inv, boothCode, `tenant dilepas oleh ${adminName}`);
          if (warning) warnings.push(warning);
          return;
        }
        db.prepare(`
          UPDATE invoices 
          SET payment_status = 'CANCELED', remaining_amount = 0,
              notes = COALESCE(notes, '') || ' [Tenant dilepas oleh ' || ? || ' pada ' || datetime('now') || ']',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(adminName, inv.id);
      });

      // 2. Mark the booth's orders in this floorplan as canceled
      db.prepare(`
        UPDATE orders 
        SET payment_status = 'CANCELED'
        WHERE floorplan_id = ? AND ((? != '' AND booth_id = ?) OR LOWER(TRIM(booth_code)) = LOWER(TRIM(?)))
      `).run(fpId, boothId || '', boothId || '', boothCode || '');

      // 3. Reset booth in booths table back to Available
      db.prepare(`
        UPDATE booths 
        SET status = 'available', 
            owner_name = '', 
            brand_category = '', 
            pic_name = '', 
            email = '', 
            phone = '', 
            discount_type = 'nominal', 
            discount_value = 0, 
            discount_amount = 0, 
            discount_reason = '', 
            exhibitor_id = '',
            merge_separate = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE (id = ? OR (floorplan_id = ? AND code = ?))
      `).run(boothId || '', fpId, boothCode || '');

      // 4. Update canvas_fabric_json in floorplans table
      const fpRecord = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(fpId);
      if (fpRecord && fpRecord.canvas_fabric_json) {
        try {
          const fabricData = JSON.parse(fpRecord.canvas_fabric_json);
          if (fabricData.objects) {
            fabricData.objects.forEach(obj => {
              if (obj.isBooth || obj.boothData) {
                const bCode = (obj.boothData?.code || obj.boothData?.booth_number || '').trim().toLowerCase();
                const targetCode = (boothCode || '').trim().toLowerCase();
                const bId = String(obj.boothData?.id || '');
                const targetId = String(boothId || '');

                if ((targetCode && bCode === targetCode) || (targetId && bId === targetId)) {
                  obj.boothData.status = 'available';
                  obj.boothData.ownerName = '';
                  obj.boothData.exhibitorId = '';
                  obj.boothData.mergeSeparate = false;
                  obj.boothData.picName = '';
                  obj.boothData.email = '';
                  obj.boothData.phone = '';

                  if (Array.isArray(obj.objects)) {
                    const bgRect = obj.objects.find(s => (s.type || '').toLowerCase() === 'rect' && (s.height || 0) > 6);
                    if (bgRect) {
                      bgRect.fill = '#ffffff';
                      bgRect.stroke = '#10b981';
                      bgRect.strokeWidth = 2;
                    }
                    const textElements = obj.objects.filter(s => {
                      const t = (s.type || '').toLowerCase();
                      return t === 'text' || t === 'fabrictext' || t === 'i-text';
                    });
                    if (textElements.length >= 4) {
                      textElements[2].text = '';
                      textElements[3].text = 'AVAILABLE';
                      textElements[3].fill = '#059669';
                    }
                  }
                }
              }
            });
            db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
              JSON.stringify(fabricData),
              fpId
            );
          }
        } catch (e) {
          console.error("Error updating canvas JSON on detach:", e);
        }
      }

      // 5. Sync payment status
      syncPaymentStatusFromInvoices();

      // 6. Log to activity_logs
      db.prepare(`
        INSERT INTO activity_logs (id, action, target_type, target_id, target_title, user_name, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        'DETACH_TENANT',
        'booth',
        boothCode || boothId,
        `Pelepasan Tenant Booth #${boothCode}`,
        adminName,
        JSON.stringify({
          boothCode,
          boothId,
          floorplanId: fpId,
          cancelledInvoice: linkedInvoice ? linkedInvoice.invoice_number : null,
          detachedAt: new Date().toISOString()
        })
      );
    });

    detachTransaction();
    notifyOpsOfSalesChange(fpId, 1, req.user?.name || '');
    res.json({ success: true, warnings, message: `Tenant pada Booth #${boothCode} berhasil dilepas dan booth kembali ke status Available.` });
  } catch (err) {
    console.error("Error detaching tenant:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/orders/update-tenant - Update tenant biodata across booths, orders, invoices, and canvas
router.put('/update-tenant', (req, res) => {
  try {
    const {
      floorplanId,
      boothId,
      boothCode,
      fullName,
      brandName,
      brandCategory,
      email,
      phone,
      adminName = 'Admin'
    } = req.body;

    if (!brandName || !fullName || !email || !phone) {
      return res.status(400).json({ success: false, error: 'Data biodata tenant wajib diisi lengkap' });
    }

    const fpId = floorplanId || 'FP-2026-001';

    const updateTransaction = db.transaction(() => {
      // 1. Update booths
      db.prepare(`
        UPDATE booths 
        SET owner_name = ?, 
            brand_category = ?, 
            pic_name = ?, 
            email = ?, 
            phone = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE (id = ? OR (floorplan_id = ? AND code = ?))
      `).run(brandName, brandCategory || '', fullName, email, phone, boothId || '', fpId, boothCode || '');

      // 2. Update orders
      db.prepare(`
        UPDATE orders 
        SET company_name = ?, 
            pic_name = ?, 
            brand_category = ?, 
            email = ?, 
            phone = ?
        WHERE (booth_id = ? OR (floorplan_id = ? AND booth_code = ?))
      `).run(brandName, fullName, brandCategory || '', email, phone, boothId || '', fpId, boothCode || '');

      // 3. Update invoices
      db.prepare(`
        UPDATE invoices 
        SET client_name = ?, 
            company_name = ?, 
            client_email = ?, 
            client_phone = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE (booth_id = ? OR (floorplan_id = ? AND booth_code = ?))
      `).run(fullName, brandName, email, phone, boothId || '', fpId, boothCode || '');

      // 4. Update canvas_fabric_json
      const fpRecord = db.prepare('SELECT canvas_fabric_json FROM floorplans WHERE id = ?').get(fpId);
      if (fpRecord && fpRecord.canvas_fabric_json) {
        try {
          const fabricData = JSON.parse(fpRecord.canvas_fabric_json);
          if (fabricData.objects) {
            fabricData.objects.forEach(obj => {
              if (obj.isBooth || obj.boothData) {
                const bCode = (obj.boothData?.code || obj.boothData?.booth_number || '').trim().toLowerCase();
                const targetCode = (boothCode || '').trim().toLowerCase();
                const bId = String(obj.boothData?.id || '');
                const targetId = String(boothId || '');

                if ((targetCode && bCode === targetCode) || (targetId && bId === targetId)) {
                  obj.boothData.ownerName = brandName;
                  obj.boothData.picName = fullName;
                  obj.boothData.email = email;
                  obj.boothData.phone = phone;
                  if (brandCategory) obj.boothData.brandCategory = brandCategory;

                  if (Array.isArray(obj.objects)) {
                    const textElements = obj.objects.filter(s => {
                      const t = (s.type || '').toLowerCase();
                      return t === 'text' || t === 'fabrictext' || t === 'i-text';
                    });
                    if (textElements.length >= 4) {
                      textElements[2].text = brandName;
                    }
                  }
                }
              }
            });
            db.prepare('UPDATE floorplans SET canvas_fabric_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
              JSON.stringify(fabricData),
              fpId
            );
          }
        } catch (e) {
          console.error("Error updating canvas JSON on update-tenant:", e);
        }
      }

      // 5. Activity log
      db.prepare(`
        INSERT INTO activity_logs (id, action, target_type, target_id, target_title, user_name, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        'UPDATE_TENANT_BIODATA',
        'booth',
        boothCode || boothId,
        `Update Biodata Tenant Booth #${boothCode} (${brandName})`,
        adminName,
        JSON.stringify({ boothCode, brandName, fullName, email, phone, brandCategory })
      );
    });

    updateTransaction();
    res.json({ success: true, message: `Biodata tenant untuk Booth #${boothCode} berhasil diperbarui.` });
  } catch (err) {
    console.error("Error updating tenant biodata:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Master synchronized exhibitor list (orders + assigned booths, contract billing authority)
export function getExhibitorsData(targetId) {
  // Ensure all booth and order statuses strictly follow the Invoice & Tenant Management page
  syncPaymentStatusFromInvoices();

  // 1. Fetch all bookings/orders from orders table
  let orderSql = `
    SELECT 
      o.id,
      o.floorplan_id as floorplanId,
      COALESCE(f.title, 'Denah Utama') as projectName,
      COALESCE(NULLIF(TRIM(b.owner_name), ''), o.company_name) as company,
      COALESCE(NULLIF(TRIM(o.pic_name), ''), b.pic_name, o.company_name) as pic,
      COALESCE(NULLIF(TRIM(o.email), ''), b.email, '-') as email,
      COALESCE(NULLIF(TRIM(o.phone), ''), b.phone, '-') as contact,
      COALESCE(b.code, o.booth_code) as booth,
      COALESCE(b.category, 'Standard') as category,
      CASE 
        WHEN b.brand_category IS NOT NULL AND TRIM(b.brand_category) != '' THEN b.brand_category
        WHEN o.brand_category IS NOT NULL AND TRIM(o.brand_category) != '' THEN o.brand_category
        ELSE 'Teknologi & Gadget'
      END as brandCategory,
      o.total_amount as price,
      o.payment_method as paymentMethod,
      COALESCE(o.source, b.registration_source, 'online') as source,
      COALESCE(o.admin_name, b.registered_by, '') as adminName,
      COALESCE(b.width_m, 3) as widthM,
      COALESCE(b.height_m, 3) as heightM,
      COALESCE(b.discount_amount, 0) as discountAmount,
      COALESCE(b.discount_type, 'nominal') as discountType,
      COALESCE(b.discount_reason, '') as discountReason,
      COALESCE(
        (
          SELECT inv.invoice_number 
          FROM invoices inv 
          WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
          ORDER BY inv.created_at DESC LIMIT 1
        ),
        o.invoice_number
      ) as invoiceNumber,
      (
        SELECT inv.payment_status 
        FROM invoices inv 
        WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
        ORDER BY inv.created_at DESC LIMIT 1
      ) as invoicePaymentStatus,
      CASE 
        WHEN b.category = 'Free' OR b.price = 0 THEN 'free'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) = 'PAID' THEN 'sold'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) = 'CANCELED' THEN 'canceled'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) IN ('UNPAID', 'PENDING') THEN 'reserved'
        WHEN LOWER(b.status) IN ('sold', 'paid') THEN 'sold'
        WHEN LOWER(o.payment_status) IN ('paid', 'sold', 'lunas') THEN 'sold'
        ELSE 'reserved'
      END as status,
      COALESCE(
        (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.invoice_number = o.invoice_number OR inv.booth_id = o.booth_id OR (inv.floorplan_id = o.floorplan_id AND inv.booth_code = o.booth_code))
          ORDER BY inv.created_at DESC LIMIT 1
        ),
        o.payment_status,
        'UNPAID'
      ) as payment_status,
      o.created_at as createdAt,
      strftime('%d/%m/%Y', o.created_at) as date
    FROM orders o
    LEFT JOIN booths b ON b.deleted_at IS NULL AND ((o.booth_id IS NOT NULL AND o.booth_id = b.id) OR (o.floorplan_id = b.floorplan_id AND (o.booth_code = b.code OR ('+' || b.code || '+') LIKE ('%+' || o.booth_code || '+%'))))
    LEFT JOIN floorplans f ON o.floorplan_id = f.id
    WHERE o.deleted_at IS NULL AND (f.deleted_at IS NULL OR f.id IS NULL)
  `;

  const orderParams = [];
  if (targetId && targetId !== 'all') {
    orderSql += ` AND o.floorplan_id = ? `;
    orderParams.push(targetId);
  }
  orderSql += ` ORDER BY o.created_at DESC `;

  const orders = db.prepare(orderSql).all(...orderParams);

  // 2. Fetch booths directly assigned to a tenant/brand in canvas or floorplan database
  let boothSql = `
    SELECT 
      b.id,
      b.floorplan_id as floorplanId,
      COALESCE(f.title, 'Denah Utama') as projectName,
      b.owner_name as company,
      COALESCE(NULLIF(TRIM(b.pic_name), ''), b.owner_name) as pic,
      COALESCE(NULLIF(TRIM(b.email), ''), '-') as email,
      COALESCE(NULLIF(TRIM(b.phone), ''), '-') as contact,
      b.code as booth,
      b.category as category,
      CASE 
        WHEN b.brand_category IS NOT NULL AND TRIM(b.brand_category) != '' THEN b.brand_category
        ELSE 'Teknologi & Gadget'
      END as brandCategory,
      b.price as price,
      'manual' as paymentMethod,
      COALESCE(b.registration_source, 'admin') as source,
      COALESCE(b.registered_by, 'Admin') as adminName,
      COALESCE(b.width_m, 3) as widthM,
      COALESCE(b.height_m, 3) as heightM,
      COALESCE(b.discount_amount, 0) as discountAmount,
      COALESCE(b.discount_type, 'nominal') as discountType,
      COALESCE(b.discount_reason, '') as discountReason,
      COALESCE(
        (
          SELECT inv.invoice_number 
          FROM invoices inv 
          WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
          ORDER BY inv.created_at DESC LIMIT 1
        ),
        'INV/MANUAL'
      ) as invoiceNumber,
      (
        SELECT inv.payment_status 
        FROM invoices inv 
        WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
        ORDER BY inv.created_at DESC LIMIT 1
      ) as invoicePaymentStatus,
      CASE 
        WHEN b.category = 'Free' OR b.price = 0 THEN 'free'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) = 'PAID' THEN 'sold'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) = 'CANCELED' THEN 'canceled'
        WHEN (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
          ORDER BY inv.created_at DESC LIMIT 1
        ) IN ('UNPAID', 'PENDING') THEN 'reserved'
        WHEN LOWER(b.status) IN ('sold', 'paid') THEN 'sold'
        ELSE 'reserved'
      END as status,
      COALESCE(
        (
          SELECT inv.payment_status 
          FROM invoices inv 
          WHERE (inv.booth_id = b.id OR (inv.floorplan_id = b.floorplan_id AND inv.booth_code = b.code))
          ORDER BY inv.created_at DESC LIMIT 1
        ),
        CASE WHEN LOWER(b.status) IN ('sold', 'paid') THEN 'PAID' ELSE 'UNPAID' END
      ) as payment_status,
      b.updated_at as createdAt,
      strftime('%d/%m/%Y', b.updated_at) as date
    FROM booths b
    LEFT JOIN floorplans f ON b.floorplan_id = f.id
    WHERE b.deleted_at IS NULL
      AND (f.deleted_at IS NULL OR f.id IS NULL)
      AND LOWER(b.status) IN ('sold', 'reserved', 'booked') 
      AND b.owner_name IS NOT NULL 
      AND TRIM(b.owner_name) != ''
  `;

  const boothParams = [];
  if (targetId && targetId !== 'all') {
    boothSql += ` AND b.floorplan_id = ? `;
    boothParams.push(targetId);
  }

  const bookedBooths = db.prepare(boothSql).all(...boothParams);

  // Strict deduplication by project and booth code
  const uniqueMap = new Map();
  orders.forEach(item => {
    const key = `${item.floorplanId || 'default'}_${item.booth}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });

  bookedBooths.forEach(item => {
    const key = `${item.floorplanId || 'default'}_${item.booth}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });

  // Auto-merge display groups per floorplan (AGENTS.md §18): rows stay one per booth (§5), each row says which group it belongs to
  const mergeCache = new Map();
  const mergeGroupOf = (fpId, code) => {
    if (!mergeCache.has(fpId)) mergeCache.set(fpId, computeFloorplanMergeGroups(fpId));
    const g = mergeCache.get(fpId).byCode.get(String(code || '').trim().toLowerCase());
    return g ? { id: g.id, codes: g.codes, label: g.label, joinedCode: g.joinedCode, boothCount: g.boothCount, totalAreaM2: g.totalAreaM2, status: g.status, booths: g.booths } : null;
  };

  // Payment status per booth CONTRACT (DP + Pelunasan / Penuh), not the latest single invoice
  const exhibitors = Array.from(uniqueMap.values()).map(item => {
    if (!item.floorplanId || !item.booth) return item;
    const c = getContract(item.floorplanId, item.booth);
    let boothValue = c.booth ? boothContractValue(c.booth, c.taxRate) : null;
    let effectivePrice = c.contractTotal || (boothValue ?? item.price ?? 0);
    let paid = c.paid || 0;
    let remaining = c.remaining != null ? c.remaining : Math.max(0, effectivePrice - paid);
    // One contract for several booths ("A-01+A-03+A-04"): each booth row carries its share (by booth value),
    // so totals over rows / the dashboard count the contract once; the mismatch check uses the group value
    const contractCode = c.latestInvoice?.booth_code || '';
    const contractTokens = invoiceCodeTokens(contractCode);
    let contractShare = null;
    let contractValue = boothValue;
    if (c.status && contractTokens.length > 1 && contractCode.trim().toLowerCase() !== String(item.booth).trim().toLowerCase()) {
      const groupValue = contractValueForCode(item.floorplanId, contractCode, c.taxRate);
      const ratio = groupValue && boothValue !== null ? boothValue / groupValue : 1 / contractTokens.length;
      contractShare = { code: contractCode, codes: contractTokens, ratio, contractTotal: c.contractTotal, paid: c.paid || 0 };
      contractValue = groupValue;
      effectivePrice = Math.round((c.contractTotal || 0) * ratio);
      paid = Math.round((c.paid || 0) * ratio);
      remaining = Math.max(0, effectivePrice - paid);
    }

    const baseItem = !c.status ? {
      ...item,
      price: effectivePrice,
      boothValue,
      contractMismatch: false,
      paidAmount: paid,
      remainingAmount: remaining
    } : {
      ...item,
      boothValue,
      contractMismatch: contractValue !== null && contractValue > 0 && Math.abs(contractValue - c.contractTotal) > 1,
      contractShare,
      payment_status: c.status,
      invoicePaymentStatus: c.status,
      status: item.status === 'free' ? 'free' : c.status === 'PAID' ? 'sold' : c.status === 'CANCELED' ? 'canceled' : 'reserved',
      price: effectivePrice,
      paidAmount: paid,
      remainingAmount: remaining,
      invoiceNumber: c.latestInvoice?.invoice_number || item.invoiceNumber
    };

    const dsc = baseItem.discountAmount || 0;
    return {
      ...baseItem,
      brandName: baseItem.company,
      code: baseItem.booth,
      floorplanTitle: baseItem.projectName,
      picName: baseItem.pic,
      finalPrice: baseItem.price,
      originalPrice: (baseItem.price || 0) + dsc,
      areaSqm: Number(((baseItem.widthM || 3) * (baseItem.heightM || 3)).toFixed(1)),
      mergeGroup: mergeGroupOf(baseItem.floorplanId, baseItem.booth),
      isFree: baseItem.status === 'free' || baseItem.category === 'Free' || baseItem.price === 0
    };
  });

  return exhibitors;
}

// GET /api/orders or /api/exhibitors - List all exhibitor orders & booked booth tenants with project filter
router.get(['/', '/exhibitors'], (req, res) => {
  try {
    // Ensure all booth and order statuses strictly follow the Invoice & Tenant Management page
    syncPaymentStatusFromInvoices();

    const { floorplanId, projectId } = req.query;
    const targetId = floorplanId || projectId;

    // 0. Fetch all projects/floorplans to populate Project Selector
    const projects = db.prepare(`
      SELECT id, title, status, updated_at 
      FROM floorplans 
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all();

    const projectsList = projects.map(p => ({
      id: p.id,
      title: p.title || 'Denah Tanpa Judul',
      status: p.status || 'draft'
    }));

    const exhibitors = getExhibitorsData(targetId);

    res.json({
      success: true,
      total: exhibitors.length,
      exhibitors: exhibitors,
      projectsList,
      selectedProjectId: targetId || 'all'
    });
  } catch (error) {
    console.error("Fetch orders error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
