import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { getSession, saveSession, clearSession, isStorageBlocked } from '../services/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user || null);
  const [isVerifying, setIsVerifying] = useState(() => Boolean(getSession()));
  const [sessionExpired, setSessionExpired] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  // Re-validate a stored session with the server (it may have been revoked or the role changed)
  useEffect(() => {
    if (!getSession()) return;
    api.fetchCurrentUser().then((serverUser) => {
      if (serverUser === null) {
        clearSession();
        setUser(null);
      } else if (serverUser) {
        saveSession({ ...getSession(), user: serverUser });
        setUser(serverUser);
      }
      setIsVerifying(false);
    });
  }, []);

  useEffect(() => {
    const onExpired = () => { setUser(null); setSessionExpired(true); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    if (res?.success) {
      // localExpiresAt: session length counted on this computer's clock (safe with a wrong date / time)
      saveSession({ token: res.token, expiresAt: res.expiresAt, localExpiresAt: Date.now() + (Number(res.sessionHours) || 12) * 3600 * 1000, user: res.user });
      setStorageBlocked(isStorageBlocked());
      setUser(res.user);
      setSessionExpired(false);
    }
    return res;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isVerifying, sessionExpired, storageBlocked, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
