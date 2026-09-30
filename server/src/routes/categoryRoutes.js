import express from 'express';
import db from '../db.js';

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { id: 'cat_standard', key: 'Standard', name: 'Standard (3x3m)', width_m: 3, height_m: 3, default_price: 5000000, color: '#3b82f6', border_color: '#1d4ed8', is_free: 0, description: 'Booth standar partisi 3x3m', sort_order: 1 },
  { id: 'cat_corner', key: 'Corner', name: 'Corner Booth (3x3m)', width_m: 3, height_m: 3, default_price: 7500000, color: '#06b6d4', border_color: '#0891b2', is_free: 0, description: 'Booth sudut hook 2 sisi terbuka', sort_order: 2 },
  { id: 'cat_premium', key: 'Premium', name: 'Premium (6x3m)', width_m: 6, height_m: 3, default_price: 12000000, color: '#8b5cf6', border_color: '#6d28d9', is_free: 0, description: 'Booth premium medium frontage lebar', sort_order: 3 },
  { id: 'cat_island', key: 'Island', name: 'VIP Island (6x6m)', width_m: 6, height_m: 6, default_price: 25000000, color: '#f59e0b', border_color: '#d97706', is_free: 0, description: 'VIP Island pulau 4 sisi terbuka', sort_order: 4 },
  { id: 'cat_free', key: 'Free', name: 'Free / Additional (Gratis)', width_m: 2, height_m: 2, default_price: 0, color: '#10b981', border_color: '#059669', is_free: 1, description: 'Booth gratis / sponsor / fasilitas tambahan (Rp 0)', sort_order: 5 },
  { id: 'cat_custom', key: 'Custom', name: 'Custom Shape', width_m: 4, height_m: 4, default_price: 10000000, color: '#ec4899', border_color: '#be185d', is_free: 0, description: 'Kategori bentuk khusus fleksibel', sort_order: 6 }
];

// 1. GET /api/categories - List all booth categories
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM booth_categories 
      ORDER BY sort_order ASC, created_at ASC
    `).all();

    const categories = rows.map(r => ({
      id: r.id,
      key: r.key,
      name: r.name,
      widthM: r.width_m,
      heightM: r.height_m,
      defaultPrice: r.default_price,
      color: r.color,
      border: r.border_color,
      isFree: Boolean(r.is_free),
      description: r.description || '',
      sortOrder: r.sort_order
    }));

    res.json({ success: true, categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/categories - Add a new category tier
router.post('/', (req, res) => {
  try {
    const {
      key,
      name,
      widthM = 3,
      heightM = 3,
      defaultPrice = 5000000,
      color = '#3b82f6',
      border,
      borderColor,
      isFree = false,
      description = ''
    } = req.body;

    const resolvedBorder = borderColor || border || '#1d4ed8';

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama kategori wajib diisi.' });
    }

    // Generate sanitized key if not provided
    const cleanKey = (key && key.trim()) 
      ? key.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);

    // Check if key already exists
    const existing = db.prepare('SELECT id FROM booth_categories WHERE key = ?').get(cleanKey);
    if (existing) {
      return res.status(400).json({ success: false, error: `Kode kategori "${cleanKey}" sudah digunakan.` });
    }

    const id = `cat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const maxSort = db.prepare('SELECT MAX(sort_order) as maxSort FROM booth_categories').get().maxSort || 0;

    const resolvedPrice = isFree ? 0 : parseInt(defaultPrice, 10) || 0;

    db.prepare(`
      INSERT INTO booth_categories (
        id, key, name, width_m, height_m, default_price, color, border_color, is_free, description, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanKey,
      name.trim(),
      parseFloat(widthM) || 3,
      parseFloat(heightM) || 3,
      resolvedPrice,
      color || '#3b82f6',
      resolvedBorder,
      isFree ? 1 : 0,
      description ? description.trim() : '',
      maxSort + 1
    );

    const created = db.prepare('SELECT * FROM booth_categories WHERE id = ?').get(id);

    res.json({
      success: true,
      message: `Kategori "${name}" berhasil ditambahkan.`,
      category: {
        id: created.id,
        key: created.key,
        name: created.name,
        widthM: created.width_m,
        heightM: created.height_m,
        defaultPrice: created.default_price,
        color: created.color,
        border: created.border_color,
        isFree: Boolean(created.is_free),
        description: created.description || '',
        sortOrder: created.sort_order
      }
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. PUT /api/categories/:id - Update an existing category tier
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const category = db.prepare('SELECT * FROM booth_categories WHERE id = ? OR key = ?').get(id, id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Kategori tidak ditemukan.' });
    }

    const {
      name,
      widthM,
      heightM,
      defaultPrice,
      color,
      border,
      borderColor,
      isFree,
      description
    } = req.body;

    const updatedName = name !== undefined ? name.trim() : category.name;
    const updatedWidth = widthM !== undefined ? parseFloat(widthM) || category.width_m : category.width_m;
    const updatedHeight = heightM !== undefined ? parseFloat(heightM) || category.height_m : category.height_m;
    const updatedIsFree = isFree !== undefined ? (isFree ? 1 : 0) : category.is_free;
    const updatedPrice = updatedIsFree ? 0 : (defaultPrice !== undefined ? parseInt(defaultPrice, 10) || 0 : category.default_price);
    const updatedColor = color !== undefined ? color : category.color;
    const targetBorder = borderColor !== undefined ? borderColor : border;
    const updatedBorder = targetBorder !== undefined ? targetBorder : category.border_color;
    const updatedDesc = description !== undefined ? description : category.description;

    db.prepare(`
      UPDATE booth_categories 
      SET name = ?, width_m = ?, height_m = ?, default_price = ?, color = ?, border_color = ?, is_free = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updatedName,
      updatedWidth,
      updatedHeight,
      updatedPrice,
      updatedColor,
      updatedBorder,
      updatedIsFree,
      updatedDesc,
      category.id
    );

    const updated = db.prepare('SELECT * FROM booth_categories WHERE id = ?').get(category.id);

    res.json({
      success: true,
      message: `Kategori "${updated.name}" berhasil diperbarui.`,
      category: {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        widthM: updated.width_m,
        heightM: updated.height_m,
        defaultPrice: updated.default_price,
        color: updated.color,
        border: updated.border_color,
        isFree: Boolean(updated.is_free),
        description: updated.description || '',
        sortOrder: updated.sort_order
      }
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. DELETE /api/categories/:id - Delete a category
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const count = db.prepare('SELECT COUNT(*) as count FROM booth_categories').get().count;
    if (count <= 1) {
      return res.status(400).json({ success: false, error: 'Minimal harus ada 1 kategori tersisa di sistem.' });
    }

    const cat = db.prepare('SELECT * FROM booth_categories WHERE id = ? OR key = ?').get(id, id);
    if (!cat) {
      return res.status(404).json({ success: false, error: 'Kategori tidak ditemukan.' });
    }

    db.prepare('DELETE FROM booth_categories WHERE id = ?').run(cat.id);

    res.json({
      success: true,
      message: `Kategori "${cat.name}" berhasil dihapus.`
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST /api/categories/reset - Reset back to default 6 categories
router.post('/reset', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM booth_categories').run();

      const insertCat = db.prepare(`
        INSERT INTO booth_categories (id, key, name, width_m, height_m, default_price, color, border_color, is_free, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      DEFAULT_CATEGORIES.forEach(c => {
        insertCat.run(c.id, c.key, c.name, c.width_m, c.height_m, c.default_price, c.color, c.border_color, c.is_free, c.description, c.sort_order);
      });
    })();

    const rows = db.prepare('SELECT * FROM booth_categories ORDER BY sort_order ASC').all();
    const categories = rows.map(r => ({
      id: r.id,
      key: r.key,
      name: r.name,
      widthM: r.width_m,
      heightM: r.height_m,
      defaultPrice: r.default_price,
      color: r.color,
      border: r.border_color,
      isFree: Boolean(r.is_free),
      description: r.description || '',
      sortOrder: r.sort_order
    }));

    res.json({
      success: true,
      message: 'Kategori & tier harga berhasil di-reset ke standar.',
      categories
    });
  } catch (error) {
    console.error("Error resetting categories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
