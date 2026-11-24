'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, ShieldAlert, Ship, User, Eye, EyeOff, Briefcase, ArrowRight, CheckCircle2 } from 'lucide-react';
import { saveMobileSession, getSavedMobileSession } from '@/lib/mobileBridge';

export default function SalesLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Auto-restore persistent mobile session if already logged in as sales
  useEffect(() => {
    let isMounted = true;
    getSavedMobileSession().then((sess) => {
      if (isMounted && sess.token && sess.role) {
        if (sess.role === 'sales_head' || sess.role === 'sales_person' || sess.role === 'developer') {
          router.replace('/sales');
        }
      }
    });
    return () => { isMounted = false; };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('कृपया अपना यूजरनेम दर्ज करें (Username is mandatory)');
      setIsLoading(false);
      return;
    }

    if (!password) {
      setError('कृपया अपना पासवर्ड दर्ज करें (Password is mandatory)');
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

      if (!res.ok) {
        throw new Error(data.error || 'लॉगिन विफल: यूजरनेम या पासवर्ड गलत है (Invalid username or password)');
      }

      // Check role policy: Super Admin cannot access Sales Head; must be sales_head, sales_person, or developer
      if (data.role === 'admin') {
        throw new Error('सुपर एडमिन सेल्स पोर्टल में लॉगिन नहीं कर सकता। कृपया सेल्स हेड या एग्जीक्यूटिव अकाउंट से लॉगिन करें।');
      }

      // Persist session to native mobile device preferences
      if (data.token) {
        await saveMobileSession(data.token, data.role || 'sales_head', data);
      }

      // Direct redirection to /sales
      router.push('/sales');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'यूजरनेम या पासवर्ड गलत है (Invalid username or password)');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-md">
        {/* Header */}
        <div className="p-7 text-center bg-slate-950/80 border-b border-slate-800">
          <div className="inline-flex p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 mb-3 shadow-md">
            <Briefcase className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="flex items-center justify-center space-x-1.5 mb-1">
            <span className="font-black text-lg tracking-tight text-white">US INTERNATIONAL</span>
            <span className="font-black text-lg tracking-tight text-emerald-500">SALES</span>
          </div>
          <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold mt-1">
            <span>सेल्स हेड एवं एग्जीक्यूटिव लॉगिन पोर्टल</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="p-7 space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2.5 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              यूजरनेम (Username) <span className="text-emerald-500 font-bold">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter sales username (e.g. saleshead)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-xs font-semibold"
                required
                autoComplete="username"
              />
              <div className="absolute left-3.5 top-3 text-slate-500">
                <User className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              पासवर्ड (Password) <span className="text-emerald-500 font-bold">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password..."
                className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-xs font-semibold"
                required
                autoComplete="current-password"
              />
              <div className="absolute left-3.5 top-3 text-slate-500">
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-200 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-lg shadow-emerald-900/30 transition duration-200 flex items-center justify-center space-x-2 text-xs uppercase tracking-wider disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>सेल्स पोर्टल में लॉगिन करें</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Switch to Unified Admin Login */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>सुपर एडमिन या अन्य स्टाफ?</span>
            <Link
              href="/admin/login"
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition flex items-center space-x-1"
            >
              <span>एडमिन लॉगिन पर जाएं</span>
              <span>→</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
