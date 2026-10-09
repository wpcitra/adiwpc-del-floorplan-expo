import { Server } from 'socket.io';
import { userFromToken } from '../middleware/auth.js';

// Chat realtime (AGENTS.md §38). Messages are written through the REST API (login, access policy, validation);
// the socket only pushes events to the members' rooms `user:<id>`. A socket logs in with the same session token.
let io = null;
const room = (userId) => `user:${userId}`;

export function attachChatSocket(httpServer, corsDelegate) {
  io = new Server(httpServer, { cors: corsDelegate, serveClient: false });
  io.use((socket, next) => {
    const session = userFromToken(socket.handshake.auth?.token);
    if (!session) return next(new Error('Sesi login sudah berakhir, silakan login kembali'));
    socket.data.user = session.user;
    next();
  });
  io.on('connection', (socket) => { socket.join(room(socket.data.user.id)); });
  return io;
}

export function emitToUsers(userIds, event, payload) {
  if (!io) return;
  [...new Set(userIds)].forEach(id => io.to(room(id)).emit(event, payload));
}

export const isOnline = (userId) => Boolean(io?.sockets.adapter.rooms.get(room(userId))?.size);

// Deactivation / role change / password reset ends the user's sessions: their open chats close too
export function disconnectUser(userId) {
  io?.in(room(userId)).disconnectSockets(true);
}
