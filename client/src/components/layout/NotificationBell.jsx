import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../services/api';

const POLL_MS = 45000;

const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return isNaN(d) ? value : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// In-app notifications (e.g. "Denah Sales berubah" for the operations team)
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });

  const load = useCallback(async () => setData(await api.fetchNotifications()), []);
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.isRead) await api.markNotificationRead(n.id);
    load();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className="w-full py-2 flex flex-col items-center rounded-xl text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 transition-all relative" title="Notifikasi">
        <Bell size={19} />
        {data.unreadCount > 0 && (
          <span className="absolute top-1 right-4 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{data.unreadCount}</span>
        )}
        <span className="text-[10px] tracking-tight mt-1 font-medium">Notifikasi</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute left-full bottom-0 ml-2 z-[60] w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Notifikasi</span>
              {data.unreadCount > 0 && (
                <button type="button" onClick={async () => { await api.markAllNotificationsRead(); load(); }} className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                  <CheckCheck size={12} /> Tandai semua dibaca
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.notifications.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada notifikasi</p>}
              {data.notifications.map(n => (
                <button key={n.id} type="button" onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${n.isRead ? '' : 'bg-amber-50/60'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />} {n.title}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">{n.body}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{formatTime(n.createdAt)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
