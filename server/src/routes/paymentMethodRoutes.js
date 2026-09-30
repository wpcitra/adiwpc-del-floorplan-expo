import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/payment-methods - List all payment methods
router.get('/', (req, res) => {
  try {
    const { activeOnly } = req.query;
    let sql = `SELECT * FROM payment_methods`;
    if (activeOnly === 'true') {
      sql += ` WHERE is_active = 1`;
    }
    sql += ` ORDER BY sort_order ASC, created_at ASC`;

    const raw = db.prepare(sql).all();
    const paymentMethods = raw.map(pm => ({
      id: pm.id,
      key: pm.key,
      name: pm.name,
      description: pm.description || '',
      iconType: pm.icon_type || 'qris',
      isActive: Boolean(pm.is_active),
      sortOrder: pm.sort_order || 0,
      instructions: pm.instructions || ''
    }));

    res.json({ success: true, paymentMethods });
  } catch (error) {
    console.error("Fetch payment methods error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/payment-methods - Create a new payment method
router.post('/', (req, res) => {
  try {
    const { name, description = '', iconType = 'qris', isActive = true, instructions = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama metode pembayaran wajib diisi' });
    }

    const id = `pm_${Date.now()}`;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const sortOrder = db.prepare('SELECT COUNT(*) as count FROM payment_methods').get().count + 1;

    db.prepare(`
      INSERT INTO payment_methods (id, key, name, description, icon_type, is_active, sort_order, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, key, name.trim(), description.trim(), iconType, isActive ? 1 : 0, sortOrder, instructions.trim());

    res.json({
      success: true,
      message: `Metode pembayaran "${name}" berhasil ditambahkan!`,
      paymentMethod: { id, key, name: name.trim(), description: description.trim(), iconType, isActive, sortOrder, instructions: instructions.trim() }
    });
  } catch (error) {
    console.error("Create payment method error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/payment-methods/:id - Update a payment method
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, iconType, isActive, instructions, sortOrder } = req.body;

    const pm = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
    if (!pm) {
      return res.status(404).json({ success: false, error: 'Metode pembayaran tidak ditemukan' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
      updates.push('key = ?');
      params.push(name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (iconType !== undefined) {
      updates.push('icon_type = ?');
      params.push(iconType);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (instructions !== undefined) {
      updates.push('instructions = ?');
      params.push(instructions.trim());
    }
    if (sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(sortOrder);
    }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({
      success: true,
      message: 'Metode pembayaran berhasil diperbarui!'
    });
  } catch (error) {
    console.error("Update payment method error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/payment-methods/:id - Delete a payment method
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const pm = db.prepare('SELECT name FROM payment_methods WHERE id = ?').get(id);
    if (!pm) {
      return res.status(404).json({ success: false, error: 'Metode pembayaran tidak ditemukan' });
    }

    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);

    res.json({
      success: true,
      message: `Metode pembayaran "${pm.name}" berhasil dihapus.`
    });
  } catch (error) {
    console.error("Delete payment method error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
