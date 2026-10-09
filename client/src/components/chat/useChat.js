import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatApi, openChatSocket } from '../../services/chat';

const byNewest = (a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')) || b.id - a.id;

// Ticks of my own message: everyone else (active) read it -> 'read', received it -> 'delivered', else 'sent'
export function tickOf(message, conversation, meId) {
  if (message.pending) return message.failed ? 'failed' : 'sending';
  const others = (conversation?.members || []).filter(m => m.id !== meId && m.isActive);
  if (!others.length) return 'sent';
  if (others.every(m => m.lastReadId >= message.id)) return 'read';
  if (others.every(m => m.lastDeliveredId >= message.id)) return 'delivered';
  return 'sent';
}

// Chat state for the whole admin area (AGENTS.md §38): one socket per tab, REST for every write.
export function useChat(me, { panelOpen }) {
  const [conversations, setConversations] = useState([]);
  const [threads, setThreads] = useState({}); // id -> { items, hasMore, loaded, loading }
  const [activeId, setActiveId] = useState(null);
  const [connected, setConnected] = useState(true);
  const [users, setUsers] = useState([]);
  const live = useRef({});
  live.current = { activeId, panelOpen, threads };

  const upsertConversation = useCallback((conv) => {
    setConversations(list => [conv, ...list.filter(c => c.id !== conv.id)].sort(byNewest));
  }, []);

  const loadConversations = useCallback(async () => {
    const r = await chatApi.conversations();
    if (r.success) setConversations(r.conversations.sort(byNewest));
  }, []);

  const addMessage = useCallback((conversationId, message) => {
    setThreads(t => {
      const th = t[conversationId];
      if (!th || th.items.some(m => m.id === message.id)) return t;
      return { ...t, [conversationId]: { ...th, items: [...th.items, message] } };
    });
  }, []);

  const markRead = useCallback(async (conversationId) => {
    const items = live.current.threads[conversationId]?.items || [];
    const last = [...items].reverse().find(m => !m.pending);
    setConversations(list => list.map(c => (c.id === conversationId ? { ...c, unread: 0 } : c)));
    if (last) await chatApi.read(conversationId, last.id);
  }, []);

  const isWatching = (conversationId) => live.current.panelOpen && live.current.activeId === conversationId && document.visibilityState === 'visible';

  useEffect(() => {
    if (!me?.id) return undefined;
    const socket = openChatSocket();
    socket.on('connect', () => {
      setConnected(true);
      loadConversations();
      const open = live.current.activeId;
      if (open) loadThread(open, { refresh: true }); // messages sent while the connection was down
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('chat:message', ({ conversationId, message }) => {
      addMessage(conversationId, message);
      const mine = message.senderId === me.id;
      setConversations(list => {
        const conv = list.find(c => c.id === conversationId);
        if (!conv) { loadConversations(); return list; }
        // A new direct chat arrives (chat:conversation) already counting its first message
        const counted = conv.lastMessage?.id === message.id;
        const unread = mine || isWatching(conversationId) ? 0 : conv.unread + (counted ? 0 : 1);
        return [{ ...conv, lastMessage: message, lastMessageAt: message.createdAt, unread }, ...list.filter(c => c.id !== conversationId)];
      });
      if (!mine && isWatching(conversationId)) chatApi.read(conversationId, message.id);
    });
    socket.on('chat:receipt', ({ conversationId, userId, lastReadId, lastDeliveredId }) => {
      setConversations(list => list.map(c => (c.id !== conversationId ? c : {
        ...c, members: c.members.map(m => (m.id === userId ? { ...m, lastReadId, lastDeliveredId } : m))
      })));
    });
    socket.on('chat:conversation', ({ conversation }) => {
      if (conversation.removed) {
        setConversations(list => list.filter(c => c.id !== conversation.id));
        setActiveId(id => (id === conversation.id ? null : id));
      } else {
        upsertConversation(conversation);
      }
    });
    return () => { socket.close(); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadThread = useCallback(async (conversationId, { older = false, refresh = false } = {}) => {
    const th = live.current.threads[conversationId];
    if (th?.loading || (th?.loaded && !older && !refresh)) return;
    setThreads(t => ({ ...t, [conversationId]: { items: [], hasMore: false, loaded: false, ...t[conversationId], loading: true } }));
    const before = older ? th?.items.find(m => !m.pending)?.id : undefined;
    const r = await chatApi.messages(conversationId, before);
    if (!r.success) {
      setThreads(t => ({ ...t, [conversationId]: { ...t[conversationId], loading: false, error: r.error } }));
      return;
    }
    setThreads(t => {
      const prev = t[conversationId]?.items || [];
      const pending = prev.filter(m => m.pending);
      const items = older ? [...r.messages, ...prev] : [...r.messages, ...pending];
      return { ...t, [conversationId]: { items, hasMore: r.hasMore, loaded: true, loading: false } };
    });
    setConversations(list => list.map(c => (c.id === conversationId ? { ...c, members: r.members } : c)));
  }, []);

  const send = useCallback(async (conversationId, body, attachment, retryOf) => {
    const tmpId = retryOf || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const draft = { id: tmpId, conversationId, senderId: me.id, body, attachment, createdAt: new Date().toISOString(), pending: true };
    setThreads(t => {
      const th = t[conversationId] || { items: [], hasMore: false, loaded: true };
      return { ...t, [conversationId]: { ...th, items: [...th.items.filter(m => m.id !== tmpId), draft] } };
    });
    const r = await chatApi.send(conversationId, body, attachment);
    setThreads(t => {
      const th = t[conversationId];
      const items = th.items.filter(m => m.id !== tmpId);
      if (!r.success) return { ...t, [conversationId]: { ...th, items: [...items, { ...draft, failed: true, error: r.error }] } };
      return { ...t, [conversationId]: { ...th, items: items.some(m => m.id === r.message.id) ? items : [...items, r.message] } };
    });
    if (r.success) {
      setConversations(list => {
        const conv = list.find(c => c.id === conversationId);
        return conv ? [{ ...conv, lastMessage: r.message, lastMessageAt: r.message.createdAt }, ...list.filter(c => c.id !== conversationId)] : list;
      });
    }
    return r;
  }, [me?.id]);

  const discardFailed = useCallback((conversationId, tmpId) => {
    setThreads(t => ({ ...t, [conversationId]: { ...t[conversationId], items: t[conversationId].items.filter(m => m.id !== tmpId) } }));
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await chatApi.users();
    if (r.success) setUsers(r.users);
    return r;
  }, []);

  const startDirect = useCallback(async (userId) => {
    const r = await chatApi.openDirect(userId);
    if (r.success) { upsertConversation(r.conversation); setActiveId(r.conversation.id); }
    return r;
  }, [upsertConversation]);

  const createGroup = useCallback(async (title, memberIds) => {
    const r = await chatApi.createGroup(title, memberIds);
    if (r.success) { upsertConversation(r.conversation); setActiveId(r.conversation.id); }
    return r;
  }, [upsertConversation]);

  // The open conversation is read while the panel is open and the tab visible
  useEffect(() => {
    if (!panelOpen || !activeId) return undefined;
    loadThread(activeId);
    const readNow = () => { if (document.visibilityState === 'visible') markRead(activeId); };
    readNow();
    document.addEventListener('visibilitychange', readNow);
    return () => document.removeEventListener('visibilitychange', readNow);
  }, [panelOpen, activeId, threads[activeId]?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadTotal = useMemo(() => conversations.reduce((sum, c) => sum + (c.unread || 0), 0), [conversations]);

  return {
    conversations, threads, activeId, setActiveId, connected, users, unreadTotal,
    loadThread, send, discardFailed, loadUsers, startDirect, createGroup, reload: loadConversations
  };
}
