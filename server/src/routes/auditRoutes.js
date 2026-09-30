import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/audit-logs?userId=&category=&search=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=
router.get('/', (req, res) => {
  try {
    const { userId, category, search, from, to } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);

    const conditions = [];
    const params = [];
    if (userId && userId !== 'all') { conditions.push('user_id = ?'); params.push(userId); }
    if (category && category !== 'all') { conditions.push('category = ?'); params.push(category); }
    if (from) { conditions.push("created_at >= datetime(?, 'utc')"); params.push(`${from} 00:00:00`); }
    if (to) { conditions.push("created_at <= datetime(?, 'utc')"); params.push(`${to} 23:59:59`); }
    if (search) {
      conditions.push('(action LIKE ? OR target LIKE ? OR summary LIKE ? OR user_name LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const logs = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, limit)
      .map(l => ({
        id: l.id,
        userId: l.user_id,
        userName: l.user_name,
        userRole: l.user_role,
        action: l.action,
        category: l.category,
        target: l.target,
        summary: l.summary,
        method: l.method,
        path: l.path,
        ip: l.ip,
        details: l.details_json ? JSON.parse(l.details_json) : null,
        createdAt: l.created_at
      }));
    const categories = db.prepare('SELECT DISTINCT category FROM audit_logs ORDER BY category').all().map(r => r.category);

    res.json({ success: true, logs, categories });
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
