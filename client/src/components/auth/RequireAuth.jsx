import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canAccessPage, HOME_PAGE } from '../../utils/roles';

// Guards /admin: requires a login, and (when `page` is given) a role allowed to open that page.
export default function RequireAuth({ page, children }) {
  const { user, isVerifying, sessionExpired } = useAuth();
  const location = useLocation();

  if (isVerifying) {
    return (
      <div className="flex-1 flex items-center justify-center h-full min-h-[50vh] text-xs text-slate-400">
        Memeriksa sesi login...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search, expired: sessionExpired }} />;
  }

  if (page && !canAccessPage(user.role, page)) {
    return <Navigate to={HOME_PAGE[user.role] || '/login'} replace state={{ denied: page }} />;
  }

  return children;
}

// /admin index: send each role to its own landing page
export function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={HOME_PAGE[user?.role] || '/login'} replace />;
}
