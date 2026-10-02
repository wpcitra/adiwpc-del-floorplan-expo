import express from 'express';
import db from '../db.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Helper to safely parse JSON
 */
function safeJsonParse(data, fallback = []) {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

/**
 * 1. GET /api/facilities/forms
 * Fetch all facility forms and templates
 */
router.get('/forms', (req, res) => {
  try {
    const { projectId, isTemplate } = req.query;
    
    let query = 'SELECT * FROM facility_forms WHERE 1=1';
    const params = [];

    if (projectId) {
      query += " AND (project_id = ? OR project_id = 'global')";
      params.push(projectId);
    }

    if (isTemplate !== undefined) {
      query += ' AND is_template = ?';
      params.push(isTemplate === 'true' || isTemplate === '1' ? 1 : 0);
    }

    query += ' ORDER BY is_active DESC, is_template ASC, created_at DESC';

    const forms = db.prepare(query).all(...params).map(f => ({
      ...f,
      items: safeJsonParse(f.items_json, [])
    }));

    res.json({ success: true, forms });
  } catch (error) {
    console.error('Error fetching facility forms:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat formulir fasilitas' });
  }
});

/**
 * 2. GET /api/facilities/forms/:id
 * Fetch single facility form by ID
 */
router.get('/forms/:id', (req, res) => {
  try {
    const { id } = req.params;
    const form = db.prepare('SELECT * FROM facility_forms WHERE id = ?').get(id);

    if (!form) {
      return res.status(404).json({ success: false, message: 'Formulir tidak ditemukan' });
    }

    res.json({
      success: true,
      form: {
        ...form,
        items: safeJsonParse(form.items_json, [])
      }
    });
  } catch (error) {
    console.error('Error fetching facility form:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat detail formulir' });
  }
});

/**
 * 3. POST /api/facilities/forms
 * Create or update facility form or template
 */
router.post('/forms', (req, res) => {
  try {
    const {
      id,
      project_id = 'global',
      title,
      description = '',
      event_title = 'Indonesia International Expo 2026',
      deadline_date = '',
      terms_notes = '',
      is_active = 1,
      is_template = 0,
      template_name = '',
      items = []
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul formulir wajib diisi' });
    }

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    const formId = id || (is_template ? `tpl_${Date.now()}` : `form_${Date.now()}`);

    // If making this form active, deactivate other forms in the same project if requested
    if (is_active && !is_template) {
      db.prepare('UPDATE facility_forms SET is_active = 0 WHERE project_id = ? AND is_template = 0').run(project_id);
    }

    const existing = db.prepare('SELECT id FROM facility_forms WHERE id = ?').get(formId);

    if (existing) {
      db.prepare(`
        UPDATE facility_forms SET
          project_id = ?,
          title = ?,
          description = ?,
          event_title = ?,
          deadline_date = ?,
          terms_notes = ?,
          is_active = ?,
          is_template = ?,
          template_name = ?,
          items_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        project_id,
        title.trim(),
        description,
        event_title,
        deadline_date,
        terms_notes,
        is_active ? 1 : 0,
        is_template ? 1 : 0,
        template_name || '',
        itemsJson,
        formId
      );
    } else {
      db.prepare(`
        INSERT INTO facility_forms (
          id, project_id, title, description, event_title, deadline_date, terms_notes, is_active, is_template, template_name, items_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        formId,
        project_id,
        title.trim(),
        description,
        event_title,
        deadline_date,
        terms_notes,
        is_active ? 1 : 0,
        is_template ? 1 : 0,
        template_name || '',
        itemsJson
      );
    }

    const saved = db.prepare('SELECT * FROM facility_forms WHERE id = ?').get(formId);

    res.json({
      success: true,
      message: is_template ? 'Template formulir berhasil disimpan' : 'Formulir fasilitas berhasil disimpan',
      form: {
        ...saved,
        items: safeJsonParse(saved.items_json, [])
      }
    });
  } catch (error) {
    console.error('Error saving facility form:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan formulir fasilitas' });
  }
});

/**
 * 4. DELETE /api/facilities/forms/:id
 * Delete facility form or template
 */
router.delete('/forms/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Check if form has associated requests
    const reqCount = db.prepare('SELECT COUNT(*) as count FROM facility_requests WHERE form_id = ?').get(id).count;
    if (reqCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak dapat menghapus formulir karena terdapat ${reqCount} pengajuan tenant yang terkait. Nonaktifkan saja formulir ini.`
      });
    }

    db.prepare('DELETE FROM facility_forms WHERE id = ?').run(id);
    res.json({ success: true, message: 'Formulir berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting facility form:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus formulir' });
  }
});

/**
 * 5. GET /api/facilities/requests
 * Fetch all tenant facility requests
 */
router.get('/requests', (req, res) => {
  try {
    const { formId, status, projectId, search } = req.query;

    // requests of a deleted tenant are archived (Hapus Tenant, AGENTS.md §33)
    let query = 'SELECT * FROM facility_requests WHERE deleted_at IS NULL';
    const params = [];

    if (formId) {
      query += ' AND form_id = ?';
      params.push(formId);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status.toUpperCase());
    }

    if (projectId && projectId !== 'all') {
      query += " AND (project_id = ? OR project_id = 'global')";
      params.push(projectId);
    }

    if (search && search.trim()) {
      query += ' AND (booth_code LIKE ? OR company_name LIKE ? OR pic_name LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY created_at DESC';

    const requests = db.prepare(query).all(...params).map(r => ({
      ...r,
      items: safeJsonParse(r.items_json, [])
    }));

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error fetching facility requests:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar pengajuan fasilitas' });
  }
});

/**
 * 6. POST /api/facilities/requests/submit
 * Public endpoint for tenants to submit extra facility orders
 */
router.post('/requests/submit', (req, res) => {
  try {
    const {
      form_id,
      project_id = 'global',
      booth_code,
      company_name,
      pic_name,
      phone = '',
      email = '',
      items = [],
      total_amount = 0,
      notes = ''
    } = req.body;

    if (!booth_code || !booth_code.trim()) {
      return res.status(400).json({ success: false, message: 'Nomor/Kode Booth wajib diisi' });
    }

    if (!company_name || !company_name.trim()) {
      return res.status(400).json({ success: false, message: 'Nama Perusahaan / Brand wajib diisi' });
    }

    if (!pic_name || !pic_name.trim()) {
      return res.status(400).json({ success: false, message: 'Nama PIC Kontak wajib diisi' });
    }

    const selectedItems = Array.isArray(items) 
      ? items.filter(i => (Number(i.qty) || 0) > 0)
      : [];

    if (selectedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal 1 item fasilitas tambahan' });
    }

    // Calculate verified total amount
    const verifiedTotal = selectedItems.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.qty) || 1;
      return sum + (price * qty);
    }, 0);

    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const itemsJson = JSON.stringify(selectedItems);

    db.prepare(`
      INSERT INTO facility_requests (
        id, form_id, project_id, booth_code, company_name, pic_name, phone, email, items_json, total_amount, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      requestId,
      form_id || 'form_active_default',
      project_id,
      booth_code.trim().toUpperCase(),
      company_name.trim(),
      pic_name.trim(),
      phone.trim(),
      email.trim(),
      itemsJson,
      verifiedTotal || total_amount,
      notes.trim()
    );

    const created = db.prepare('SELECT * FROM facility_requests WHERE id = ?').get(requestId);

    res.json({
      success: true,
      message: 'Permintaan fasilitas tambahan Anda berhasil dikirim ke panitia expo!',
      request: {
        ...created,
        items: safeJsonParse(created.items_json, [])
      }
    });
  } catch (error) {
    console.error('Error submitting facility request:', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim formulir fasilitas' });
  }
});

/**
 * 7. PUT /api/facilities/requests/:id/status
 * Update status of tenant request (PENDING, APPROVED, REJECTED, COMPLETED)
 */
router.put('/requests/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status wajib ditentukan' });
    }

    const validStatuses = ['PENDING', 'APPROVED', 'INVOICED', 'COMPLETED', 'REJECTED'];
    const upperStatus = status.toUpperCase();

    if (!validStatuses.includes(upperStatus)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    db.prepare('UPDATE facility_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(upperStatus, id);

    res.json({ success: true, message: `Status pengajuan berhasil diubah menjadi ${upperStatus}` });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pengajuan' });
  }
});

/**
 * 8. POST /api/facilities/requests/:id/generate-invoice
 * Convert facility request into official A4 invoice record in `invoices` table
 */
router.post('/requests/:id/generate-invoice', (req, res) => {
  try {
    const { id } = req.params;

    const request = db.prepare('SELECT * FROM facility_requests WHERE id = ?').get(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Pengajuan fasilitas tidak ditemukan' });
    }

    // Get form details for event info
    const form = db.prepare('SELECT * FROM facility_forms WHERE id = ?').get(request.form_id);
    const eventTitle = form?.event_title || 'Indonesia International Expo 2026';

    const items = safeJsonParse(request.items_json, []);
    const invoiceItems = items.map(item => ({
      description: `[Add-on] ${item.name} (${item.category || 'Fasilitas'})`,
      unitPrice: Number(item.price) || 0,
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
      unit: item.unit || 'Unit',
      amount: (Number(item.price) || 0) * (Number(item.qty) || 1),
      total: (Number(item.price) || 0) * (Number(item.qty) || 1)
    }));

    const invoiceId = `inv_fac_${Date.now()}`;
    const invoiceNumber = `INV/FAC/${new Date().getFullYear()}/${request.booth_code}-${Math.floor(100 + Math.random() * 900)}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const insertInvoice = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, floorplan_id, booth_code, event_title, client_name, company_name, client_email, client_phone,
        issue_date, due_date, items_json, subtotal, discount_type, discount_value, discount_amount,
        tax_rate, tax_amount, total_amount, payment_status, payment_method, notes, invoice_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nominal', 0, 0, 0, 0, ?, 'UNPAID', 'Bank Transfer', ?, 'facility')
    `);

    insertInvoice.run(
      invoiceId,
      invoiceNumber,
      request.project_id || 'global',
      request.booth_code,
      eventTitle,
      request.pic_name,
      request.company_name,
      request.email || '',
      request.phone || '',
      issueDate,
      dueDate,
      JSON.stringify(invoiceItems),
      request.total_amount,
      request.total_amount,
      `Tagihan Fasilitas Tambahan Booth ${request.booth_code}.\nCatatan: ${request.notes || '-'}`
    );

    // Update request status to INVOICED
    db.prepare("UPDATE facility_requests SET status = 'INVOICED', invoice_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(invoiceId, id);

    const createdInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);

    res.json({
      success: true,
      message: `Invoice resmi ${invoiceNumber} berhasil dibuat untuk booth ${request.booth_code}!`,
      invoice: createdInvoice,
      invoiceId
    });
  } catch (error) {
    console.error('Error generating invoice for facility request:', error);
    res.status(500).json({ success: false, message: `Gagal membuat invoice fasilitas: ${error.message}` });
  }
});

export default router;
