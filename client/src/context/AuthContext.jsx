import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { getSession, saveSession, clearSession } from '../services/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user || null);
  const [isVerifying, setIsVerifying] = useState(() => Boolean(getSession()));
  const [sessionExpired, setSessionExpired] = useState(false);

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
      saveSession({ token: res.token, expiresAt: res.expiresAt, user: res.user });
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
    <AuthContext.Provider value={{ user, isVerifying, sessionExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
