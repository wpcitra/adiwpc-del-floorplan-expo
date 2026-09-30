import express from 'express';
import db from '../db.js';

const router = express.Router();

// 1. GET /api/brand-categories - List brand categories (filtered by projectId if supplied)
router.get('/', (req, res) => {
  try {
    const { activeOnly, projectId } = req.query;
    let sql = `SELECT * FROM brand_categories`;
    const params = [];
    const conditions = [];

    if (projectId && projectId !== 'all' && projectId !== 'global') {
      // Check if project-specific categories exist
      const projectSpecific = db.prepare(`SELECT * FROM brand_categories WHERE project_id = ?`).all(projectId);
      if (projectSpecific && projectSpecific.length > 0) {
        conditions.push(`project_id = ?`);
        params.push(projectId);
      } else {
        conditions.push(`(project_id = 'global' OR project_id IS NULL OR project_id = '')`);
      }
    } else if (projectId === 'global') {
      conditions.push(`(project_id = 'global' OR project_id IS NULL OR project_id = '')`);
    }

    if (activeOnly === 'true' || activeOnly === '1') {
      conditions.push(`is_active = 1`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` ORDER BY sort_order ASC, name ASC`;

    const rows = db.prepare(sql).all(...params);
    const categories = rows.map(r => ({
      id: r.id,
      name: r.name,
      isActive: Boolean(r.is_active),
      sortOrder: r.sort_order,
      projectId: r.project_id || 'global',
      createdAt: r.created_at
    }));

    res.json({ success: true, categories });
  } catch (error) {
    console.error("Error fetching brand categories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/brand-categories - Add new brand category for a specific project or global
router.post('/', (req, res) => {
  try {
    const { name, isActive = true, projectId = 'global' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama kategori brand wajib diisi.' });
    }

    const cleanName = name.trim();
    const resolvedProjectId = projectId && projectId.trim() ? projectId.trim() : 'global';

    const existing = db.prepare('SELECT id FROM brand_categories WHERE LOWER(name) = LOWER(?) AND project_id = ?').get(cleanName, resolvedProjectId);
    if (existing) {
      return res.status(400).json({ success: false, error: `Kategori "${cleanName}" sudah ada pada project ini.` });
    }

    const id = `bcat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const maxSort = db.prepare('SELECT MAX(sort_order) as maxSort FROM brand_categories WHERE project_id = ?').get(resolvedProjectId)?.maxSort || 0;

    db.prepare(`
      INSERT INTO brand_categories (id, name, is_active, sort_order, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, cleanName, isActive ? 1 : 0, maxSort + 1, resolvedProjectId);

    const created = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(id);

    res.json({
      success: true,
      message: `Kategori brand "${cleanName}" berhasil ditambahkan ke project ${resolvedProjectId}.`,
      category: {
        id: created.id,
        name: created.name,
        isActive: Boolean(created.is_active),
        sortOrder: created.sort_order,
        projectId: created.project_id
      }
    });
  } catch (error) {
    console.error("Error creating brand category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /api/brand-categories/copy-default - Copy global brand categories to a target project
router.post('/copy-default', (req, res) => {
  try {
    const { targetProjectId } = req.body;
    if (!targetProjectId || targetProjectId === 'global') {
      return res.status(400).json({ success: false, error: 'Target project ID wajib ditentukan.' });
    }

    const globals = db.prepare(`SELECT * FROM brand_categories WHERE (project_id = 'global' OR project_id IS NULL OR project_id = '') AND is_active = 1`).all();
    if (globals.length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada kategori global default untuk disalin.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO brand_categories (id, name, is_active, sort_order, project_id)
      VALUES (?, ?, 1, ?, ?)
    `);

    let copiedCount = 0;
    globals.forEach((g, idx) => {
      const existing = db.prepare(`SELECT id FROM brand_categories WHERE LOWER(name) = LOWER(?) AND project_id = ?`).get(g.name, targetProjectId);
      if (!existing) {
        insertStmt.run(`bcat_${Date.now()}_${idx}_${Math.floor(Math.random() * 100)}`, g.name, idx + 1, targetProjectId);
        copiedCount++;
      }
    });

    res.json({
      success: true,
      message: `Berhasil menyalin ${copiedCount} kategori brand default ke project ${targetProjectId}.`
    });
  } catch (error) {
    console.error("Error copying default brand categories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3.1 POST /api/brand-categories/save-project - Save and isolate brand categories for a specific project
router.post('/save-project', (req, res) => {
  try {
    const { projectId, categories } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Project ID wajib ditentukan.' });
    }

    const resolvedProjectId = projectId.trim();

    if (Array.isArray(categories) && categories.length > 0) {
      const insertOrUpdate = db.prepare(`
        INSERT INTO brand_categories (id, name, is_active, sort_order, project_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          name = excluded.name, 
          is_active = excluded.is_active, 
          sort_order = excluded.sort_order, 
          project_id = excluded.project_id
      `);

      const tx = db.transaction(() => {
        categories.forEach((cat, idx) => {
          const catId = cat.id || `bcat_${Date.now()}_${idx}_${Math.floor(Math.random() * 100)}`;
          insertOrUpdate.run(catId, cat.name.trim(), cat.isActive ? 1 : 0, idx + 1, resolvedProjectId);
        });
      });
      tx();

      return res.json({
        success: true,
        message: `Kategori brand berhasil disimpan khusus untuk project "${resolvedProjectId}".`
      });
    } else {
      const globals = db.prepare(`SELECT * FROM brand_categories WHERE (project_id = 'global' OR project_id IS NULL OR project_id = '')`).all();
      const insertStmt = db.prepare(`
        INSERT INTO brand_categories (id, name, is_active, sort_order, project_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      let count = 0;
      globals.forEach((g, idx) => {
        const existing = db.prepare(`SELECT id FROM brand_categories WHERE LOWER(name) = LOWER(?) AND project_id = ?`).get(g.name, resolvedProjectId);
        if (!existing) {
          insertStmt.run(`bcat_${Date.now()}_${idx}_${Math.floor(Math.random() * 100)}`, g.name, g.is_active, idx + 1, resolvedProjectId);
          count++;
        }
      });

      return res.json({
        success: true,
        message: `Kategori brand berhasil disimpan khusus untuk project "${resolvedProjectId}".`
      });
    }
  } catch (error) {
    console.error("Error saving project categories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PUT /api/brand-categories/:id - Update brand category
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cat = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(id);
    if (!cat) {
      return res.status(404).json({ success: false, error: 'Kategori brand tidak ditemukan.' });
    }

    const { name, isActive } = req.body;
    const updatedName = name !== undefined ? name.trim() : cat.name;
    const updatedActive = isActive !== undefined ? (isActive ? 1 : 0) : cat.is_active;

    if (!updatedName) {
      return res.status(400).json({ success: false, error: 'Nama kategori tidak boleh kosong.' });
    }

    // Check duplicate if name changed
    if (name !== undefined && updatedName.toLowerCase() !== cat.name.toLowerCase()) {
      const existing = db.prepare('SELECT id FROM brand_categories WHERE LOWER(name) = LOWER(?) AND project_id = ? AND id != ?').get(updatedName, cat.project_id || 'global', id);
      if (existing) {
        return res.status(400).json({ success: false, error: `Nama kategori "${updatedName}" sudah digunakan pada project ini.` });
      }
    }

    db.prepare(`
      UPDATE brand_categories 
      SET name = ?, is_active = ?
      WHERE id = ?
    `).run(updatedName, updatedActive, id);

    const updated = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(id);

    res.json({
      success: true,
      message: `Kategori brand "${updated.name}" berhasil diperbarui.`,
      category: {
        id: updated.id,
        name: updated.name,
        isActive: Boolean(updated.is_active),
        sortOrder: updated.sort_order,
        projectId: updated.project_id
      }
    });
  } catch (error) {
    console.error("Error updating brand category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. DELETE /api/brand-categories/:id - Delete brand category
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cat = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(id);
    if (!cat) {
      return res.status(404).json({ success: false, error: 'Kategori brand tidak ditemukan.' });
    }

    db.prepare('DELETE FROM brand_categories WHERE id = ?').run(id);

    res.json({
      success: true,
      message: `Kategori brand "${cat.name}" berhasil dihapus.`
    });
  } catch (error) {
    console.error("Error deleting brand category:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
