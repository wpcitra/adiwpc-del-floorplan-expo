import express from 'express';
import db from '../db.js';

// In-app notifications of the logged-in user (e.g. "Denah Sales berubah" for the operations team)
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, type, floorplan_id, title, body, link, is_read, created_at, updated_at
    FROM notifications WHERE user_id = ? ORDER BY is_read ASC, updated_at DESC, id DESC LIMIT 30
  `).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  res.json({
    success: true,
    unreadCount: unread,
    notifications: rows.map(r => ({
      id: r.id, type: r.type, floorplanId: r.floorplan_id, title: r.title, body: r.body, link: r.link,
      isRead: Boolean(r.is_read), createdAt: r.updated_at || r.created_at
    }))
  });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ success: true });
});

router.post('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
