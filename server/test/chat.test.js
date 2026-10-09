// Chat antar staf (AGENTS.md §38): chat pribadi & grup, kiriman realtime lewat socket.io, tanda dibaca,
// grup hanya oleh Super Admin, privasi (hanya peserta), kartu booth / invoice mengikuti hak akses pembaca.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, boothObject, createPublishedFloorplan, createDeveloper } from './helpers.js';

let s;
const ids = {};
const sockets = [];
const FP = 'FP-CHAT';
before(async () => {
  s = await startServer();
  await createDeveloper(s.api);
  await createPublishedFloorplan(s.api, FP, [boothObject('A-01', { left: 0, top: 0 })]);
  const users = (await s.api('GET', '/chat/users', undefined, { as: 'superadmin' })).body.users;
  for (const role of ['superadmin', 'finance', 'sales', 'operations', 'developer']) ids[role] = users.find(u => u.role === role)?.id;
  const me = (await s.api('GET', '/auth/me', undefined, { as: 'superadmin' })).body;
  ids.superadmin = me.user?.id || me.id;
});
after(async () => { sockets.forEach(x => x.close()); await s.stop(); });

const connect = async (role) => {
  const token = await s.login(role);
  const socket = io(s.base.replace(/\/api$/, ''), { auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
};
const nextEvent = (socket, event, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`tidak menerima ${event}`)), ms);
  socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
});
const direct = async (from, to) => (await s.api('POST', '/chat/direct', { userId: ids[to] }, { as: from })).body.conversation;
const send = (as, convId, body, attachment) => s.api('POST', `/chat/conversations/${convId}/messages`, { body, attachment }, { as });

test('daftar staf untuk memilih lawan bicara: tanpa email / nomor HP, tanpa diri sendiri', async () => {
  const r = await s.api('GET', '/chat/users', undefined, { as: 'sales' });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.users.length >= 4);
  assert.ok(r.body.users.every(u => u.id && u.name && u.role && !('email' in u) && !('phone' in u)));
  assert.ok(!r.body.users.some(u => u.role === 'sales'), 'diri sendiri tidak ada di daftar');
  assert.equal((await s.api('GET', '/chat/users')).status, 401, 'tanpa login ditolak');
});

test('chat pribadi: satu percakapan per pasangan, pesan sampai realtime, belum dibaca & centang biru', async () => {
  const a = await direct('sales', 'finance');
  const b = await direct('finance', 'sales');
  assert.equal(a.id, b.id, 'dua orang selalu berbagi satu percakapan');

  const financeSocket = await connect('finance');
  const salesSocket = await connect('sales');
  const incoming = nextEvent(financeSocket, 'chat:message');
  const delivered = nextEvent(salesSocket, 'chat:receipt');
  const r = await send('sales', a.id, '  Halo, invoice A-01 sudah dibayar?  ');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.message.body, 'Halo, invoice A-01 sudah dibayar?');
  const got = await incoming;
  assert.equal(got.conversationId, a.id);
  assert.equal(got.message.body, 'Halo, invoice A-01 sudah dibayar?');
  const receipt = await delivered;
  assert.equal(receipt.userId, ids.finance);
  assert.ok(receipt.lastDeliveredId >= r.body.message.id, 'penerima online = centang dua (terkirim ke perangkat)');

  const list = (await s.api('GET', '/chat/conversations', undefined, { as: 'finance' })).body.conversations;
  const conv = list.find(c => c.id === a.id);
  assert.equal(conv.unread, 1);
  assert.equal(conv.lastMessage.body, 'Halo, invoice A-01 sudah dibayar?');

  const read = nextEvent(salesSocket, 'chat:receipt');
  assert.equal((await s.api('POST', `/chat/conversations/${a.id}/read`, { messageId: r.body.message.id }, { as: 'finance' })).status, 200);
  assert.equal((await read).lastReadId, r.body.message.id, 'pengirim menerima tanda dibaca (centang biru)');
  assert.equal((await s.api('GET', '/chat/conversations', undefined, { as: 'finance' })).body.conversations.find(c => c.id === a.id).unread, 0);

  const msgs = (await s.api('GET', `/chat/conversations/${a.id}/messages`, undefined, { as: 'sales' })).body;
  assert.equal(msgs.messages.length, 1);
  assert.ok(msgs.members.find(m => m.id === ids.finance).lastReadId >= r.body.message.id);
});

test('pesan kosong / terlalu panjang ditolak; isi pesan tidak masuk Audit Trail', async () => {
  const a = await direct('sales', 'finance');
  assert.equal((await send('sales', a.id, '   ')).status, 400);
  assert.equal((await send('sales', a.id, 'x'.repeat(4001))).status, 400);
  assert.equal((await send('sales', a.id, 'rahasia-dagang-123')).status, 200);
  const logs = await s.api('GET', '/audit-logs?limit=200', undefined, { as: 'superadmin' });
  assert.ok(!logs.text.includes('rahasia-dagang-123'));
});

test('privasi: bukan peserta tidak bisa membaca atau mengirim, Super Admin pun tidak', async () => {
  const a = await direct('sales', 'finance');
  assert.equal((await s.api('GET', `/chat/conversations/${a.id}/messages`, undefined, { as: 'operations' })).status, 403);
  assert.equal((await s.api('GET', `/chat/conversations/${a.id}/messages`, undefined, { as: 'superadmin' })).status, 403);
  assert.equal((await send('operations', a.id, 'menyusup')).status, 403);
  assert.ok(!(await s.api('GET', '/chat/conversations', undefined, { as: 'superadmin' })).body.conversations.some(c => c.id === a.id));
  assert.ok(!(await s.api('GET', '/audit-logs?limit=200', undefined, { as: 'superadmin' })).text.includes('menyusup'), 'isi pesan yang ditolak tidak tersimpan');
});

test('grup: hanya Super Admin membuat & mengatur; anggota menerima pesan; yang dikeluarkan kehilangan akses', async () => {
  assert.equal((await s.api('POST', '/chat/groups', { title: 'Tim Sales', memberIds: [ids.finance] }, { as: 'sales' })).status, 403);
  const created = await s.api('POST', '/chat/groups', { title: 'Tim Halal Fair', memberIds: [ids.sales, ids.finance] }, { as: 'superadmin' });
  assert.equal(created.status, 200, created.text);
  const g = created.body.conversation;
  assert.equal(g.type, 'group');
  assert.deepEqual(g.members.map(m => m.id).sort(), [ids.superadmin, ids.sales, ids.finance].sort());

  const opsSocket = await connect('operations');
  const added = nextEvent(opsSocket, 'chat:conversation');
  assert.equal((await s.api('POST', `/chat/groups/${g.id}/members`, { userIds: [ids.operations] }, { as: 'superadmin' })).status, 200);
  assert.equal((await added).conversation.id, g.id, 'anggota baru langsung melihat grupnya');
  assert.equal((await send('operations', g.id, 'Siap, booth sudah dicek')).status, 200);
  assert.equal((await s.api('PUT', `/chat/groups/${g.id}`, { title: 'Tim Lapangan' }, { as: 'finance' })).status, 403);
  assert.equal((await s.api('PUT', `/chat/groups/${g.id}`, { title: 'Tim Lapangan' }, { as: 'superadmin' })).body.conversation.title, 'Tim Lapangan');

  assert.equal((await s.api('DELETE', `/chat/groups/${g.id}/members/${ids.operations}`, undefined, { as: 'superadmin' })).status, 200);
  assert.equal((await send('operations', g.id, 'masih bisa?')).status, 403);
  assert.equal((await s.api('GET', `/chat/conversations/${g.id}/messages`, undefined, { as: 'operations' })).status, 403);

  const logs = await s.api('GET', '/audit-logs?limit=200', undefined, { as: 'superadmin' });
  assert.ok(logs.text.includes('Buat grup chat'), 'pembuatan grup tercatat di audit');
});

test('lampiran booth / invoice: pengirim harus punya akses; kartu mengikuti hak akses pembaca', async () => {
  const booked = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['A-01'], boothCode: 'A-01', fullName: 'PIC Roti', brandName: 'Roti Maros', brandCategory: 'F&B',
    phone: '081234567890', bookingType: 'booking', source: 'admin'
  }, { as: 'superadmin' });
  assert.equal(booked.status, 200, booked.text);
  const invoiceId = (await s.api('GET', '/invoices', undefined, { as: 'finance' })).body.invoices.find(i => (i.booth_code || i.boothCode) === 'A-01').id;

  const toOps = await direct('finance', 'operations');
  const sent = await send('finance', toOps.id, 'Cek ini', { type: 'invoice', invoiceId });
  assert.equal(sent.status, 200, sent.text);
  assert.deepEqual(sent.body.message.attachment, { type: 'invoice', invoiceId }, 'pesan hanya menyimpan rujukan');

  const asFinance = await s.api('GET', `/chat/attachment?type=invoice&invoiceId=${invoiceId}`, undefined, { as: 'finance' });
  assert.equal(asFinance.body.allowed, true);
  assert.equal(asFinance.body.card.companyName, 'Roti Maros');
  const asOps = await s.api('GET', `/chat/attachment?type=invoice&invoiceId=${invoiceId}`, undefined, { as: 'operations' });
  assert.equal(asOps.body.allowed, false);
  assert.equal(asOps.body.card, undefined, 'tanpa akses tidak ada data invoice');

  const booth = await s.api('GET', `/chat/attachment?type=booth&floorplanId=${FP}&boothCode=A-01`, undefined, { as: 'operations' });
  assert.equal(booth.body.allowed, true);
  assert.equal(booth.body.card.ownerName, 'Roti Maros');
  assert.equal((await s.api('GET', `/chat/attachment?type=booth&floorplanId=${FP}&boothCode=A-01`, undefined, { as: 'developer' })).body.allowed, false);

  const fromOps = await send('operations', toOps.id, 'invoice?', { type: 'invoice', invoiceId });
  assert.equal(fromOps.status, 403, 'tidak bisa melampirkan yang tidak boleh dibuka');
  assert.equal((await send('finance', toOps.id, 'x', { type: 'booth', floorplanId: FP, boothCode: 'Z-99' })).status, 404);
});

test('socket tanpa token sah ditolak; akun nonaktif tidak bisa dikirimi pesan', async () => {
  const bad = io(s.base.replace(/\/api$/, ''), { auth: { token: 'palsu' }, transports: ['websocket'], reconnection: false });
  sockets.push(bad);
  const err = await new Promise(resolve => bad.once('connect_error', resolve));
  assert.match(err.message, /login/i);

  const devChat = await direct('superadmin', 'developer');
  assert.equal((await s.api('PUT', `/users/${ids.developer}`, { isActive: false }, { as: 'superadmin' })).status, 200);
  const r = await send('superadmin', devChat.id, 'halo?');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'USER_INACTIVE');
});
