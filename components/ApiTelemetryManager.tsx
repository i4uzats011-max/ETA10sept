'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Server,
  Layers,
  ArrowUpRight,
  Gauge,
  Sliders,
} from 'lucide-react';

interface PluginApiItem {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'idle' | 'not_configured';
  models?: string[];
  endpoints?: string[];
  dailyLimit: number;
  callsToday: number;
  remainingToday: number;
  usagePercent: number;
  tokensToday?: number;
  tokensTotal?: number;
  callsTotal: number;
  avgLatencyMs?: number;
  successRate?: number;
  description: string;
}

interface GeminiTelemetry {
  configured: boolean;
  modelPrimary: string;
  modelFallback: string;
  callsToday: number;
  callsThisMonth: number;
  callsTotal: number;
  limitDaily: number;
  remainingDaily: number;
  usagePercentDaily: number;
  tokensToday: number;
  tokensTotal: number;
  avgLatencyMs: number;
  successRate: number;
  recentLogs: Array<{
    _id: string;
    action: string;
    model: string;
    status: string;
    itemCount: number;
    tokensTotal: number;
    latencyMs: number;
    errorMessage?: string;
    metadata?: any;
    createdAt: string;
  }>;
}

export default function ApiTelemetryManager() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pluginApis, setPluginApis] = useState<PluginApiItem[]>([]);
  const [gemini, setGemini] = useState<GeminiTelemetry | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchTelemetry = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/api-telemetry', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access Denied: Only Developer accounts have access to API Telemetry.');
        }
        throw new Error(`Failed to load telemetry (HTTP ${res.status})`);
      }
      const data = await res.json();
      setPluginApis(data.pluginApis || []);
      setGemini(data.gemini || null);
      setLastRefreshed(new Date().toLocaleTimeString());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch API telemetry data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(() => fetchTelemetry(true), 30000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
        <p className="text-xs font-mono text-slate-400">Loading Developer API Telemetry & Plugin Quotas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 rounded-2xl space-y-2 text-red-200 text-xs">
        <div className="flex items-center space-x-2 font-bold text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span>Telemetry Access Error</span>
        </div>
        <p>{error}</p>
        <button
          onClick={() => fetchTelemetry()}
          className="mt-2 px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header & Refresh Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-black flex items-center justify-center font-black shadow-md">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white font-mono tracking-wide">
                PLUGINS & API USAGE TELEMETRY
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                DEVELOPER CONSOLE ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live quota limits, calls made, remaining calls, and call history for all integrated APIs.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {lastRefreshed && (
            <span className="text-[11px] font-mono text-slate-500">
              Updated: {lastRefreshed}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchTelemetry()}
            disabled={refreshing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── GOOGLE GEMINI AI HERO QUOTA CARD ── */}
      {gemini && (
        <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl space-y-6 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-500/20 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white font-mono">
                    Google Gemini AI Translation Engine
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Active Plugin</span>
                  </span>
                </div>
                <p className="text-xs text-indigo-200/70 mt-0.5">
                  Primary Model: <code className="text-cyan-300 font-mono font-bold">{gemini.modelPrimary}</code> | Fallback Model: <code className="text-purple-300 font-mono font-bold">{gemini.modelFallback}</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Daily Quota Limit:</span>
              <span className="text-sm font-mono font-black text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                {gemini.limitDaily.toLocaleString()} Calls/Day
              </span>
            </div>
          </div>

          {/* Progress Bar for Daily Limit */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Today&apos;s Usage: <strong>{gemini.callsToday}</strong> / {gemini.limitDaily} calls</span>
              </span>
              <span className="text-cyan-400 font-bold">
                {gemini.remainingDaily} calls remaining ({gemini.usagePercentDaily}%)
              </span>
            </div>
            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  gemini.usagePercentDaily > 90
                    ? 'bg-red-500'
                    : gemini.usagePercentDaily > 70
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(1, gemini.usagePercentDaily))}%` }}
              />
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Calls Today</span>
              <p className="text-lg font-mono font-black text-cyan-300">{gemini.callsToday}</p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Calls This Month</span>
              <p className="text-lg font-mono font-black text-indigo-300">{gemini.callsThisMonth}</p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Total All-Time Calls</span>
              <p className="text-lg font-mono font-black text-white">{gemini.callsTotal}</p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Tokens Today</span>
              <p className="text-lg font-mono font-black text-emerald-300">{gemini.tokensToday.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Avg Latency</span>
              <p className="text-lg font-mono font-black text-amber-300">{gemini.avgLatencyMs} ms</p>
            </div>
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400">Success Rate</span>
              <p className="text-lg font-mono font-black text-emerald-400">{gemini.successRate}%</p>
            </div>
          </div>
        </div>
      )}

      {/* ── ALL PLUGGED-IN APIS OVERVIEW ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>All Installed Plugins & APIs ({pluginApis.length})</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pluginApis.map((plugin) => (
            <div
              key={plugin.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-md space-y-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-white font-mono">{plugin.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        plugin.status === 'active'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {plugin.status === 'active' ? '● Connected' : '○ Standby'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 block">{plugin.category}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 block">Daily Limit</span>
                  <span className="text-xs font-mono font-bold text-white">
                    {plugin.dailyLimit ? plugin.dailyLimit.toLocaleString() : 'Unlimited'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">{plugin.description}</p>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    Used: <strong className="text-white">{plugin.callsToday}</strong> calls
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {plugin.remainingToday} remaining ({plugin.usagePercent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-cyan-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(1, plugin.usagePercent))}%` }}
                  />
                </div>
              </div>

              {plugin.endpoints && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {plugin.endpoints.map((ep) => (
                    <span
                      key={ep}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800"
                    >
                      {ep}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── LIVE GEMINI API LOGS TABLE ── */}
      {gemini && gemini.recentLogs && gemini.recentLogs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-2">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-white">
                Recent Gemini API Translation Logs (Last {gemini.recentLogs.length})
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Auto-recorded on every upload & sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3">Tokens</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Sample Input</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {gemini.recentLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-cyan-300">{log.action}</td>
                    <td className="py-2.5 px-3 text-purple-300">{log.model}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{log.itemCount} terms</td>
                    <td className="py-2.5 px-3 text-emerald-300">{log.tokensTotal || 0}</td>
                    <td className="py-2.5 px-3 text-amber-300">{log.latencyMs} ms</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'success'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">
                      {log.metadata?.itemsSample ? log.metadata.itemsSample.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
