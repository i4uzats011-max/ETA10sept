'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal, Shield, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function DeveloperAdminLoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Invalid Developer Admin credentials.');
      }

      if (data.role !== 'developer' && data.role !== 'admin') {
        throw new Error('Access denied. This console is restricted exclusively to Developer Admins.');
      }

      router.push('/admin/visitors');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-cyan-500 selection:text-black">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-cyan-500/30 rounded-3xl p-8 shadow-2xl shadow-cyan-950/40 relative z-10">
        {/* Terminal Header Badge */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                Developer Console
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  ROOT
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">Visitor & Device Telemetry</p>
            </div>
          </div>
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
        </div>

        {/* Security Alert / Notice */}
        <div className="mb-6 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-start space-x-3">
          <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white block mb-0.5">Developer Admin Authentication</span>
            Enter the Developer Admin passkey to inspect live visitor IP addresses, location geo-maps, and mobile hardware telemetry.
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-xs font-mono animate-shake">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
              Developer Passkey
            </label>
            <div className="relative">
              <div className="absolute left-4 top-3.5 text-slate-500">
                <Lock className="w-4 h-4 text-cyan-400" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter developer password..."
                className="w-full pl-11 pr-11 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-slate-500 hover:text-slate-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-2 text-[11px] font-mono text-slate-500">
              Default password: <code className="text-cyan-400 font-bold">developer2026</code>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-2xl text-sm transition shadow-lg shadow-cyan-950/50 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="font-mono">Verifying Access...</span>
              </>
            ) : (
              <>
                <span>Unlock Developer Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs font-mono text-slate-500">
          <Link href="/admin/login" className="hover:text-cyan-400 transition">
            ← Staff Login
          </Link>
          <Link href="/" className="hover:text-cyan-400 transition">
            Public Website →
          </Link>
        </div>
      </div>
    </div>
  );
}
