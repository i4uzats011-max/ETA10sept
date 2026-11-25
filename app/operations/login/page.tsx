'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, ShieldAlert, Boxes, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { saveMobileSession, getSavedMobileSession, clearMobileSession } from '@/lib/mobileBridge';

export default function OperationsLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('logged_out') === 'true' || search.get('logout') === 'true') {
        clearMobileSession();
        return;
      }
    }

    getSavedMobileSession().then((sess) => {
      if (isMounted && sess.token && sess.role) {
        if (sess.role === 'operations_head' || sess.role === 'developer') {
          router.replace('/operations');
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('Please enter your username');
      setIsLoading(false);
      return;
    }

    if (!password) {
      setError('Please enter your password');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await saveMobileSession(data.token, data.role || 'operations_head', data);
        router.push(data.redirectTo || '/operations');
      } else {
        setError(data.error || 'Authentication failed. Please check credentials.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error during login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/20 via-slate-950 to-slate-950 z-0" />

      <div className="max-w-md w-full space-y-8 bg-slate-900/90 backdrop-blur-md p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-900/50 mb-4">
            <Boxes className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Operations Portal</h2>
          <p className="mt-1 text-xs text-slate-400">
            Sign in with your Operations Head credentials to access Container Fleet & Cargo Tracking.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/50 border border-red-700/60 rounded-xl text-red-200 text-xs flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Username <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. operationshead"
                className="w-full pl-10 pr-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Password <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/40 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <span>{isLoading ? 'Signing In...' : 'Sign In to Operations Portal'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <Link
            href="/admin/login"
            className="text-xs text-slate-400 hover:text-white transition"
          >
            ← Switch to Admin / Staff Login
          </Link>
        </div>
      </div>
    </div>
  );
}
