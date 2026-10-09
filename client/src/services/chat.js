import { io } from 'socket.io-client';
import { apiFetch, getSession } from './session';

// Chat antar staf (AGENTS.md §38): messages go through the REST API, the socket only receives pushed events.
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api');
const SOCKET_ORIGIN = /^https?:\/\//.test(API_BASE_URL) ? new URL(API_BASE_URL).origin : undefined; // undefined = this site

async function call(method, path, body) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/chat${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    return { ...json, success: res.ok && json.success !== false, status: res.status, error: json.error || (res.ok ? '' : `Gagal (HTTP ${res.status})`) };
  } catch (e) {
    return { success: false, status: 0, error: 'Server tidak dapat dihubungi' };
  }
}

export const chatApi = {
  users: () => call('GET', '/users'),
  conversations: () => call('GET', '/conversations'),
  openDirect: (userId) => call('POST', '/direct', { userId }),
  messages: (id, before) => call('GET', `/conversations/${id}/messages${before ? `?before=${before}` : ''}`),
  send: (id, body, attachment) => call('POST', `/conversations/${id}/messages`, { body, attachment }),
  read: (id, messageId) => call('POST', `/conversations/${id}/read`, { messageId }),
  createGroup: (title, memberIds) => call('POST', '/groups', { title, memberIds }),
  renameGroup: (id, title) => call('PUT', `/groups/${id}`, { title }),
  addMembers: (id, userIds) => call('POST', `/groups/${id}/members`, { userIds }),
  removeMember: (id, userId) => call('DELETE', `/groups/${id}/members/${encodeURIComponent(userId)}`),
  attachment: (params) => call('GET', `/attachment?${new URLSearchParams(params)}`)
};

// One socket per tab; the token is read again on every (re)connect, so a new login is picked up
export function openChatSocket() {
  return io(SOCKET_ORIGIN, { auth: (cb) => cb({ token: getSession()?.token || '' }), transports: ['websocket', 'polling'] });
}
