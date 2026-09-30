import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { Map, Eye, EyeOff, LogIn, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canAccessPage, HOME_PAGE } from '../../utils/roles';

// Only redirect back to an admin page the user's role may open
const resolveRedirect = (from, role) => {
  const page = from?.match(/^\/admin\/([^/?#]+)/)?.[1];
  return page && canAccessPage(role, page) ? from : (HOME_PAGE[role] || '/admin');
};

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to={resolveRedirect(from, user.role)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi');
      return;
    }
    setIsSubmitting(true);
    const res = await login(email.trim(), password);
    setIsSubmitting(false);
    if (!res?.success) {
      setError(res?.error || 'Login gagal');
      return;
    }
    navigate(resolveRedirect(from, res.user.role), { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-white/10 mb-3">
            <Map className="text-white" size={22} />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Admin Expo Floorplan</h1>
          <p className="text-xs text-slate-400 mt-1">Masuk untuk mengelola denah, booking, dan invoice</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4 border border-slate-200/80">
          {location.state?.expired && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              Sesi login Anda sudah berakhir. Silakan masuk kembali.
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.com"
              autoComplete="username"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full pl-3 pr-10 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer"
          >
            <LogIn size={16} />
            {isSubmitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <Link to="/" className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
          <ArrowLeft size={13} /> Kembali ke Live Floorplan
        </Link>
      </div>
    </div>
  );
}
