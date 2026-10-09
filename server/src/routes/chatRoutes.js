import express from 'express';
import db from '../db.js';
import { emitToUsers, isOnline } from '../utils/chatSocket.js';

// Chat antar staf (AGENTS.md §38). Private: only the members of a conversation read or write it (the Super Admin
// too). Groups are created and managed by the Super Admin. A message stores only a reference to a booth / invoice;
// its card is resolved with the reader's own rights (GET /chat/attachment).
const router = express.Router();

export const MAX_MESSAGE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 80;
const PAGE_SIZE = 50;
const CAN_SEE_BOOTH = ['superadmin', 'finance', 'sales', 'operations'];
const CAN_SEE_INVOICE = ['superadmin', 'finance', 'sales'];

const iso = (t) => (t ? `${String(t).replace(' ', 'T')}Z` : null);
const fail = (res, status, error, code) => res.status(status).json({ success: false, error, ...(code ? { code } : {}) });

const userById = (id) => db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(id);
const conversationById = (id) => db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id);
const isMember = (conversationId, userId) => Boolean(db.prepare(
  'SELECT 1 FROM chat_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL'
).get(conversationId, userId));
const memberIds = (conversationId) => db.prepare(
  'SELECT user_id FROM chat_members WHERE conversation_id = ? AND left_at IS NULL'
).pluck().all(conversationId);
const latestMessageId = (conversationId) => db.prepare(
  'SELECT COALESCE(MAX(id), 0) FROM chat_messages WHERE conversation_id = ?'
).pluck().get(conversationId);

function members(conversationId) {
  return db.prepare(`
    SELECT u.id, u.name, u.role, u.is_active, m.last_read_id, m.last_delivered_id
    FROM chat_members m JOIN users u ON u.id = m.user_id
    WHERE m.conversation_id = ? AND m.left_at IS NULL ORDER BY u.name
  `).all(conversationId).map(m => ({
    id: m.id, name: m.name, role: m.role, isActive: Boolean(m.is_active),
    lastReadId: m.last_read_id || 0, lastDeliveredId: m.last_delivered_id || 0
  }));
}

function messageDto(row) {
  if (!row) return null;
  let attachment = null;
  try { attachment = row.attachment_json ? JSON.parse(row.attachment_json) : null; } catch (e) { attachment = null; }
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, attachment, createdAt: iso(row.created_at) };
}

function conversationDto(conv, viewerId) {
  const list = members(conv.id);
  const me = db.prepare('SELECT last_read_id FROM chat_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, viewerId);
  const last = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(conv.id);
  const unread = db.prepare(
    'SELECT COUNT(*) FROM chat_messages WHERE conversation_id = ? AND id > ? AND sender_id != ?'
  ).pluck().get(conv.id, me?.last_read_id || 0, viewerId);
  const peer = conv.type === 'direct' ? list.find(m => m.id !== viewerId) || null : null;
  return {
    id: conv.id, type: conv.type, title: conv.type === 'group' ? conv.title : (peer?.name || 'Chat'),
    peer, members: list, unread, lastMessage: messageDto(last), lastMessageAt: iso(conv.last_message_at || conv.created_at)
  };
}

const receiptOf = (conversationId, userId) => {
  const m = db.prepare('SELECT last_read_id, last_delivered_id FROM chat_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
  return { conversationId, userId, lastReadId: m?.last_read_id || 0, lastDeliveredId: m?.last_delivered_id || 0 };
};

// Delivered ("centang dua") = the message reached one of the member's open pages; read implies delivered
function markDelivered(conversationId, userId, messageId) {
  const changed = db.prepare(`
    UPDATE chat_members SET last_delivered_id = ? WHERE conversation_id = ? AND user_id = ? AND last_delivered_id < ?
  `).run(messageId, conversationId, userId, messageId).changes;
  if (changed) emitToUsers(memberIds(conversationId), 'chat:receipt', receiptOf(conversationId, userId));
}

// Sends each member the conversation as THEY see it (title, unread count)
const pushConversation = (conversationId, userIds) => {
  const conv = conversationById(conversationId);
  userIds.forEach(id => emitToUsers([id], 'chat:conversation', { conversation: conversationDto(conv, id) }));
};

function validateAttachment(attachment, role) {
  if (!attachment) return { ok: true, value: null };
  if (attachment.type === 'booth') {
    if (!CAN_SEE_BOOTH.includes(role)) return { status: 403, error: 'Anda tidak punya akses ke data booth' };
    const floorplanId = String(attachment.floorplanId || '');
    const boothCode = String(attachment.boothCode || '').trim();
    const booth = db.prepare('SELECT code FROM booths WHERE floorplan_id = ? AND deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(?)').get(floorplanId, boothCode);
    if (!booth) return { status: 404, error: `Booth ${boothCode || '-'} tidak ditemukan` };
    return { ok: true, value: { type: 'booth', floorplanId, boothCode: booth.code } };
  }
  if (attachment.type === 'invoice') {
    if (!CAN_SEE_INVOICE.includes(role)) return { status: 403, error: 'Anda tidak punya akses ke data invoice' };
    const invoice = db.prepare('SELECT id FROM invoices WHERE id = ? AND deleted_at IS NULL').get(String(attachment.invoiceId || ''));
    if (!invoice) return { status: 404, error: 'Invoice tidak ditemukan' };
    return { ok: true, value: { type: 'invoice', invoiceId: invoice.id } };
  }
  return { status: 400, error: 'Jenis lampiran tidak dikenal' };
}

const requireSuperadmin = (req, res) => {
  if (req.user?.role === 'superadmin') return true;
  fail(res, 403, 'Grup chat hanya dapat diatur oleh Super Admin');
  return false;
};

const activeUserIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String))]
  .filter(id => userById(id)?.is_active);

// GET /api/chat/users - staff to start a chat with (no email / phone)
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, role, is_active FROM users WHERE id != ? ORDER BY is_active DESC, name').all(req.user.id)
    .map(u => ({ id: u.id, name: u.name, role: u.role, isActive: Boolean(u.is_active) }));
  res.json({ success: true, users });
});

// GET /api/chat/conversations - my conversations, newest first; opening the list marks everything as delivered
router.get('/conversations', (req, res) => {
  const me = req.user.id;
  const convs = db.prepare(`
    SELECT c.* FROM chat_conversations c JOIN chat_members m ON m.conversation_id = c.id
    WHERE m.user_id = ? AND m.left_at IS NULL
      AND (c.type = 'group' OR c.last_message_at IS NOT NULL OR c.created_by = ?)
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
  `).all(me, me);
  convs.forEach(c => { const latest = latestMessageId(c.id); if (latest) markDelivered(c.id, me, latest); });
  const conversations = convs.map(c => conversationDto(c, me));
  res.json({ success: true, conversations, unreadTotal: conversations.reduce((sum, c) => sum + c.unread, 0) });
});

// POST /api/chat/direct { userId } - the private chat with that user (created on first use)
router.post('/direct', (req, res) => {
  req.skipAudit = true;
  const me = req.user.id;
  const other = userById(String(req.body?.userId || ''));
  if (!other || other.id === me) return fail(res, 400, 'Pilih staf lain untuk diajak chat');
  const key = [me, other.id].sort().join('|');
  let conv = db.prepare('SELECT * FROM chat_conversations WHERE direct_key = ?').get(key);
  if (!conv) {
    db.transaction(() => {
      const id = db.prepare("INSERT INTO chat_conversations (type, direct_key, created_by) VALUES ('direct', ?, ?)").run(key, me).lastInsertRowid;
      const add = db.prepare('INSERT INTO chat_members (conversation_id, user_id) VALUES (?, ?)');
      add.run(id, me);
      add.run(id, other.id);
      conv = conversationById(id);
    })();
  }
  res.json({ success: true, conversation: conversationDto(conv, me) });
});

// GET /api/chat/conversations/:id/messages?before=<messageId> - 50 at a time, oldest first
router.get('/conversations/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  if (!isMember(id, req.user.id)) return fail(res, 403, 'Anda bukan peserta percakapan ini');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(id, before, PAGE_SIZE + 1);
  res.json({
    success: true,
    messages: rows.slice(0, PAGE_SIZE).reverse().map(messageDto),
    hasMore: rows.length > PAGE_SIZE,
    members: members(id)
  });
});

// POST /api/chat/conversations/:id/messages { body, attachment }
router.post('/conversations/:id/messages', (req, res) => {
  req.skipAudit = true;
  const id = Number(req.params.id);
  const me = req.user;
  if (!isMember(id, me.id)) return fail(res, 403, 'Anda bukan peserta percakapan ini');
  const conv = conversationById(id);
  const body = String(req.body?.body ?? '').trim();
  if (body.length > MAX_MESSAGE_LENGTH) return fail(res, 400, `Pesan maksimal ${MAX_MESSAGE_LENGTH} karakter`);
  const att = validateAttachment(req.body?.attachment, me.role);
  if (!att.ok) return fail(res, att.status, att.error);
  if (!body && !att.value) return fail(res, 400, 'Pesan kosong');
  const others = memberIds(id).filter(uid => uid !== me.id);
  if (conv.type === 'direct' && others.every(uid => !userById(uid)?.is_active)) {
    return fail(res, 409, 'Akun ini sudah nonaktif dan tidak dapat menerima pesan', 'USER_INACTIVE');
  }

  let message;
  db.transaction(() => {
    const msgId = db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, body, attachment_json) VALUES (?, ?, ?, ?)')
      .run(id, me.id, body, att.value ? JSON.stringify(att.value) : null).lastInsertRowid;
    message = messageDto(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(msgId));
    db.prepare('UPDATE chat_conversations SET last_message_at = (SELECT created_at FROM chat_messages WHERE id = ?) WHERE id = ?').run(msgId, id);
    db.prepare('UPDATE chat_members SET last_read_id = ?, last_delivered_id = ? WHERE conversation_id = ? AND user_id = ?').run(msgId, msgId, id, me.id);
  })();

  // A direct chat appears in the peer's list with its first message
  if (conv.type === 'direct' && !conv.last_message_at) pushConversation(id, others);
  emitToUsers([me.id, ...others], 'chat:message', { conversationId: id, message });
  others.filter(isOnline).forEach(uid => markDelivered(id, uid, message.id));
  res.json({ success: true, message });
});

// POST /api/chat/conversations/:id/read { messageId } - read up to that message (blue ticks for the sender)
router.post('/conversations/:id/read', (req, res) => {
  req.skipAudit = true;
  const id = Number(req.params.id);
  const me = req.user.id;
  if (!isMember(id, me)) return fail(res, 403, 'Anda bukan peserta percakapan ini');
  const upTo = Math.min(Number(req.body?.messageId) || 0, latestMessageId(id));
  const changed = db.prepare(`
    UPDATE chat_members SET last_read_id = ?, last_delivered_id = MAX(last_delivered_id, ?)
    WHERE conversation_id = ? AND user_id = ? AND last_read_id < ?
  `).run(upTo, upTo, id, me, upTo).changes;
  const receipt = receiptOf(id, me);
  if (changed) emitToUsers(memberIds(id), 'chat:receipt', receipt);
  res.json({ success: true, receipt });
});

// POST /api/chat/groups { title, memberIds } - Super Admin
router.post('/groups', (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const title = String(req.body?.title || '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return fail(res, 400, `Nama grup wajib diisi (maksimal ${MAX_TITLE_LENGTH} karakter)`);
  const ids = activeUserIds([req.user.id, ...(req.body?.memberIds || [])]);
  if (ids.length < 2) return fail(res, 400, 'Pilih minimal satu anggota');
  let convId;
  db.transaction(() => {
    convId = db.prepare("INSERT INTO chat_conversations (type, title, created_by) VALUES ('group', ?, ?)").run(title, req.user.id).lastInsertRowid;
    const add = db.prepare('INSERT INTO chat_members (conversation_id, user_id) VALUES (?, ?)');
    ids.forEach(uid => add.run(convId, uid));
  })();
  pushConversation(convId, ids);
  res.json({ success: true, conversation: conversationDto(conversationById(convId), req.user.id) });
});

const groupOr404 = (req, res) => {
  const conv = conversationById(Number(req.params.id));
  if (!conv || conv.type !== 'group') { fail(res, 404, 'Grup tidak ditemukan'); return null; }
  return conv;
};

// PUT /api/chat/groups/:id { title } - Super Admin
router.put('/groups/:id', (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const conv = groupOr404(req, res);
  if (!conv) return;
  const title = String(req.body?.title || '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return fail(res, 400, `Nama grup wajib diisi (maksimal ${MAX_TITLE_LENGTH} karakter)`);
  db.prepare('UPDATE chat_conversations SET title = ? WHERE id = ?').run(title, conv.id);
  pushConversation(conv.id, memberIds(conv.id));
  res.json({ success: true, conversation: conversationDto(conversationById(conv.id), req.user.id) });
});

// POST /api/chat/groups/:id/members { userIds } - Super Admin; a new member starts with no unread backlog
router.post('/groups/:id/members', (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const conv = groupOr404(req, res);
  if (!conv) return;
  const ids = activeUserIds(req.body?.userIds);
  if (!ids.length) return fail(res, 400, 'Pilih staf yang akan ditambahkan');
  const latest = latestMessageId(conv.id);
  const add = db.prepare(`
    INSERT INTO chat_members (conversation_id, user_id, last_read_id, last_delivered_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP,
      last_read_id = excluded.last_read_id, last_delivered_id = excluded.last_delivered_id
    WHERE chat_members.left_at IS NOT NULL
  `);
  db.transaction(() => ids.forEach(uid => add.run(conv.id, uid, latest, latest)))();
  pushConversation(conv.id, memberIds(conv.id));
  res.json({ success: true, conversation: conversationDto(conv, req.user.id) });
});

// DELETE /api/chat/groups/:id/members/:userId - Super Admin; the removed member loses access to the group
router.delete('/groups/:id/members/:userId', (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const conv = groupOr404(req, res);
  if (!conv) return;
  const removed = db.prepare('UPDATE chat_members SET left_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL')
    .run(conv.id, req.params.userId).changes;
  if (!removed) return fail(res, 404, 'Staf ini bukan anggota grup');
  emitToUsers([req.params.userId], 'chat:conversation', { conversation: { id: conv.id, removed: true } });
  pushConversation(conv.id, memberIds(conv.id));
  res.json({ success: true });
});

// GET /api/chat/attachment?type=booth&floorplanId=&boothCode= | ?type=invoice&invoiceId=
// The card of an attachment, resolved with the READER's rights: without access only { allowed: false }.
router.get('/attachment', (req, res) => {
  const role = req.user.role;
  if (req.query.type === 'booth') {
    if (!CAN_SEE_BOOTH.includes(role)) return res.json({ success: true, allowed: false });
    const booth = db.prepare(`
      SELECT b.code, b.status, b.owner_name, b.floorplan_id, f.title AS floorplan_title
      FROM booths b LEFT JOIN floorplans f ON f.id = b.floorplan_id
      WHERE b.floorplan_id = ? AND b.deleted_at IS NULL AND LOWER(TRIM(b.code)) = LOWER(?)
    `).get(String(req.query.floorplanId || ''), String(req.query.boothCode || '').trim());
    if (!booth) return res.json({ success: true, allowed: true, missing: true });
    return res.json({ success: true, allowed: true, card: {
      type: 'booth', code: booth.code, status: booth.status, ownerName: booth.owner_name || '',
      floorplanId: booth.floorplan_id, floorplanTitle: booth.floorplan_title || ''
    } });
  }
  if (req.query.type === 'invoice') {
    if (!CAN_SEE_INVOICE.includes(role)) return res.json({ success: true, allowed: false });
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(String(req.query.invoiceId || ''));
    if (!inv) return res.json({ success: true, allowed: true, missing: true });
    return res.json({ success: true, allowed: true, card: {
      type: 'invoice', id: inv.id, invoiceNumber: inv.invoice_number, companyName: inv.company_name || '',
      boothCode: inv.booth_code || '', totalAmount: Number(inv.total_amount) || 0,
      paymentStatus: String(inv.payment_status || 'UNPAID').toUpperCase(), floorplanId: inv.floorplan_id
    } });
  }
  fail(res, 400, 'Jenis lampiran tidak dikenal');
});

export default router;
