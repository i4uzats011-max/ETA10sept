'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldAlert, Ship } from 'lucide-react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      router.push(data.redirectTo || (data.role === 'staff' ? '/admin/view' : '/admin'));
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Invalid password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-8 text-center bg-slate-950 border-b border-slate-800">
          <div className="inline-flex p-3 bg-red-600/20 text-red-500 rounded-2xl border border-red-500/30 mb-3 shadow-md">
            <Ship className="w-8 h-8" />
          </div>
          <div className="flex items-center justify-center space-x-1.5 mb-1">
            <span className="font-black text-lg tracking-tight text-white">US INTERNATIONAL</span>
            <span className="font-black text-lg tracking-tight text-red-600">LOGISTICS</span>
          </div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Internal Admin & Staff Portal</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-sm flex items-start space-x-3">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Access Password (Admin / Employee)
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access password..."
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent text-sm font-semibold"
                required
              />
              <div className="absolute left-4 top-3.5 text-slate-500">
                <Lock className="w-4 h-4 text-red-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-400">
                <span className="font-bold text-red-400 block mb-0.5">Super Admin</span>
                <span>Full Read, Write, Edit & Sync access</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-400">
                <span className="font-bold text-blue-400 block mb-0.5">Employee (EADMIN)</span>
                <span>Read-Only Table & Multi-field search (`admin123`)</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm transition shadow-lg shadow-red-950/50 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In to Portal</span>
            )}
          </button>

          <div className="text-center">
            <a href="/" className="text-xs text-slate-400 hover:text-white transition">
              ← Return to Public Tracker
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
