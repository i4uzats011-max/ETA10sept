'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Check,
  X,
  Search,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  Calendar,
  Warehouse,
  ArrowRight,
  Database,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

interface MismatchItem {
  _id: string;
  receipt: string;
  warehouse: 'GZ' | 'YW' | 'YW-55' | string;
  mismatchType: string;
  diffSummary: string;
  dbData?: {
    quantity?: number;
    weight?: string;
    volume?: string;
    commodity?: string;
    mainMarka?: string;
    status?: string;
    stockstatus?: string;
  };
  portalData?: {
    actualQuantity?: number;
    weight?: string;
    volume?: string;
    commodity?: string;
    packaging?: string;
    mark?: string;
    stockState?: number;
    date?: string;
  };
  auditPeriod: string;
  status: 'PENDING' | 'RESOLVED' | 'IGNORED';
  detectedAt: string;
  resolutionNotes?: string;
}

interface SyncStats {
  gz: { total: number; verified: number; unverified: number };
  yw: { total: number; verified: number; unverified: number };
  yw55?: { total: number; verified: number; unverified: number };
  pendingMismatchesCount: number;
  lastChinaSyncAt: string | null;
}

export default function ChinaWarehouseSyncManager() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [mismatches, setMismatches] = useState<MismatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters for Mismatch List
  const [selectedWarehouse, setSelectedWarehouse] = useState<'ALL' | 'GZ' | 'YW' | 'YW-55'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'PENDING' | 'RESOLVED' | 'IGNORED' | 'ALL'>('PENDING');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 1-Click Single Receipt Fetch state
  const [fetchReceiptInput, setFetchReceiptInput] = useState('');
  const [fetchWhInput, setFetchWhInput] = useState<'ALL' | 'GZ' | 'YW' | 'YW-55'>('ALL');
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [singleFetchResult, setSingleFetchResult] = useState<any | null>(null);

  // 1-Click Single Receipt Fetch handler
  const handleFetchSingleReceipt = async (codeToFetch?: string, whToFetch?: 'GZ' | 'YW' | 'YW-55' | 'ALL' | string) => {
    const code = (codeToFetch || fetchReceiptInput).trim();
    const wh = whToFetch || fetchWhInput;
    if (!code) {
      alert('Please enter a receipt number to fetch');
      return;
    }
    setIsFetchingSingle(true);
    setSingleFetchResult(null);
    setError(null);
    try {
      const res = await fetch('/api/warehouse/china-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch_receipt', receipt: code, warehouse: wh }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch receipt from China portal');
      }
      setSingleFetchResult(data);
      if (!codeToFetch) setFetchReceiptInput('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error fetching receipt');
    } finally {
      setIsFetchingSingle(false);
    }
  };

  // Fetch Stats & Mismatches
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load stats
      const statsRes = await fetch('/api/warehouse/china-sync');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      // Load mismatches with current filters
      const params = new URLSearchParams();
      if (selectedWarehouse !== 'ALL') params.set('warehouse', selectedWarehouse);
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (selectedPeriod !== 'ALL') params.set('period', selectedPeriod);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const mismatchesRes = await fetch(`/api/warehouse/mismatches?${params.toString()}`);
      if (mismatchesRes.ok) {
        const misData = await mismatchesRes.json();
        setMismatches(misData.mismatches || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sync status');
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse, selectedStatus, selectedPeriod, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Trigger Sync
  const handleTriggerSync = async (mode: 'sync' | 'verify_24h' | 'audit_sunday' | 'audit_month') => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/warehouse/china-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, warehouse: selectedWarehouse }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sync request failed');
      }

      setSyncResult(data.result);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error executing sync');
    } finally {
      setSyncing(false);
    }
  };

  // Resolve Mismatch Action
  const handleResolveMismatch = async (id: string, action: 'ACCEPT_CHINA' | 'KEEP_DB' | 'IGNORE') => {
    try {
      const res = await fetch('/api/warehouse/mismatches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resolve mismatch');
      }
      await loadData();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Warehouse className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-900">
                China Warehouse Auto-Sync & Gemini Translation
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
                Gemini Flash AI Active
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Automated ingestion from China Warehouse Portal (zg.kuaisongkj.com) for GZ (RS-21) and YW (AS-14),
              with Gemini AI commodity translation, mismatch anomaly detection, and Sunday audit reconciliation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData()}
              disabled={loading || syncing}
              className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
          {/* GZ Card */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Guangzhou (GZ / RS-21)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Connected" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {stats?.gz.total.toLocaleString() ?? '—'}
              </span>
              <span className="text-xs text-slate-500">receipts</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
              <span className="text-emerald-700 font-medium">
                ✓ {stats?.gz.verified.toLocaleString() ?? 0} Verified
              </span>
              <span className="text-amber-700 font-medium">
                {stats?.gz.unverified.toLocaleString() ?? 0} Pending
              </span>
            </div>
          </div>

          {/* YW Card */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Yiwu (YW / AS-14)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Connected" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {stats?.yw.total.toLocaleString() ?? '—'}
              </span>
              <span className="text-xs text-slate-500">receipts</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
              <span className="text-emerald-700 font-medium">
                ✓ {stats?.yw.verified.toLocaleString() ?? 0} Verified
              </span>
              <span className="text-amber-700 font-medium">
                {stats?.yw.unverified.toLocaleString() ?? 0} Pending
              </span>
            </div>
          </div>

          {/* YW-55 Card */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Yiwu 55 (YW-55)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Connected" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {stats?.yw55?.total.toLocaleString() ?? '—'}
              </span>
              <span className="text-xs text-slate-500">receipts</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
              <span className="text-emerald-700 font-medium">
                ✓ {stats?.yw55?.verified.toLocaleString() ?? 0} Verified
              </span>
              <span className="text-amber-700 font-medium">
                {stats?.yw55?.unverified.toLocaleString() ?? 0} Pending
              </span>
            </div>
          </div>

          {/* Pending Mismatches Card */}
          <div className={`rounded-lg p-4 border ${
            (stats?.pendingMismatchesCount || 0) > 0
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Mismatches
              </span>
              <AlertTriangle className={`w-4 h-4 ${
                (stats?.pendingMismatchesCount || 0) > 0 ? 'text-amber-600' : 'text-slate-400'
              }`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${
                (stats?.pendingMismatchesCount || 0) > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}>
                {stats?.pendingMismatchesCount ?? 0}
              </span>
              <span className="text-xs text-slate-500">discrepancies</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Needs review in Mismatch List
            </div>
          </div>

          {/* Last Sync Heartbeat Card */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Last Sync Heartbeat
              </span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2">
              <span className="text-sm font-semibold text-slate-800">
                {stats?.lastChinaSyncAt
                  ? new Date(stats.lastChinaSyncAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Pending first sync'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Automated every 5h (2h night)
            </div>
          </div>
        </div>

        {/* 1-Click Single Receipt Fetch from China Portal */}
        <div className="mt-5 p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  1-Click Direct Fetch Receipt from China Portal to DB
                </h4>
                <p className="text-[11px] text-slate-500">
                  Enter any receipt number to fetch directly from China warehouse, translate via Gemini AI, and save to DB.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={fetchWhInput}
                onChange={(e) => setFetchWhInput(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">Auto-Detect WH</option>
                <option value="GZ">Guangzhou (GZ)</option>
                <option value="YW">Yiwu (YW)</option>
                <option value="YW-55">Yiwu 55 (YW-55)</option>
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Receipt # (e.g. 261121020)"
                  value={fetchReceiptInput}
                  onChange={(e) => setFetchReceiptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFetchSingleReceipt();
                  }}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 w-44 sm:w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleFetchSingleReceipt()}
                  disabled={isFetchingSingle || !fetchReceiptInput.trim()}
                  className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  <ArrowRight className={`w-3.5 h-3.5 mr-1 ${isFetchingSingle ? 'animate-pulse' : ''}`} />
                  {isFetchingSingle ? 'Fetching...' : 'Fetch to DB'}
                </button>
              </div>
            </div>
          </div>

          {/* Single Fetch Success Banner */}
          {singleFetchResult && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-300 text-xs flex items-center justify-between gap-3 shadow-xs animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Receipt #{singleFetchResult.receipt?.receipt}</strong> ({singleFetchResult.warehouse} Warehouse) —
                  Commodity: <strong>{singleFetchResult.receipt?.commodity}</strong> {singleFetchResult.receipt?.chinese && `(${singleFetchResult.receipt.chinese})`} •
                  Qty: <strong>{singleFetchResult.receipt?.quantity} ctn</strong> •
                  Mark: <strong>{singleFetchResult.receipt?.mainMarka || '—'}</strong>
                </span>
                <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  {singleFetchResult.isNew ? 'New Inward Saved' : 'Updated from China'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSingleFetchResult(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons Toolbar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 uppercase">Target:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              {(['ALL', 'GZ', 'YW', 'YW-55'] as const).map((wh) => (
                <button
                  key={wh}
                  onClick={() => setSelectedWarehouse(wh)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    selectedWarehouse === wh
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {wh === 'ALL' ? 'All Warehouses' : `${wh} Warehouse`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerSync('sync')}
              disabled={syncing}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now (Recent)
            </button>

            <button
              onClick={() => handleTriggerSync('verify_24h')}
              disabled={syncing}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg shadow-sm disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
              10 AM 24h Verification Sync
            </button>

            <button
              onClick={() => handleTriggerSync('audit_sunday')}
              disabled={syncing}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-lg shadow-sm disabled:opacity-50"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-purple-700" />
              Sunday Weekly Audit
            </button>

            <button
              onClick={() => handleTriggerSync('audit_month')}
              disabled={syncing}
              className="inline-flex items-center px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg disabled:opacity-50"
            >
              Monthly Audit (30D)
            </button>
          </div>
        </div>

        {/* Sync Result Banner */}
        {syncResult && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">
                Sync Execution Finished ({syncResult.mode.toUpperCase()}) in {(syncResult.durationMs / 1000).toFixed(1)}s
              </div>
              <div className="mt-1 text-xs text-emerald-800 flex flex-wrap gap-x-4 gap-y-1">
                <span>Total Checked: <strong>{syncResult.totalChecked}</strong></span>
                <span>New Receipts Saved: <strong>{syncResult.insertedCount}</strong></span>
                <span>Matched: <strong>{syncResult.matchedCount}</strong></span>
                <span>Mismatches Logged: <strong className={syncResult.mismatchCount > 0 ? 'text-amber-800' : ''}>{syncResult.mismatchCount}</strong></span>
                <span>Verified Clean: <strong>{syncResult.verifiedCount}</strong></span>
              </div>
              {syncResult.details && syncResult.details.length > 0 && (
                <div className="mt-2 text-xs text-slate-600 border-t border-emerald-200/60 pt-1.5">
                  {syncResult.details.map((d: string, idx: number) => (
                    <div key={idx}>• {d}</div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setSyncResult(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Mismatch Dropdown & Filterable List Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg font-bold text-slate-900">
                Mismatch Dropdown List
              </h3>
              <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                {mismatches.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Discrepancies detected between China Portal receiving and local DB. Protected against blind overwrites.
            </p>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="PENDING">Pending (Unresolved)</option>
                <option value="RESOLVED">Resolved</option>
                <option value="IGNORED">Ignored</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>

            {/* Audit Period Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Period:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Periods</option>
                <option value="REALTIME">Realtime Sync</option>
                <option value="DAILY_24H">Daily 24h Check</option>
                <option value="WEEKLY_7D">Sunday Weekly</option>
                <option value="MONTHLY_30D">Sunday Monthly</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search receipt / mark..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
              />
            </div>
          </div>
        </div>

        {/* Mismatch Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Receipt # / WH</th>
                <th className="py-3 px-4">Marka</th>
                <th className="py-3 px-4">Mismatch Description</th>
                <th className="py-3 px-4">Local DB Data</th>
                <th className="py-3 px-4">China Portal Data</th>
                <th className="py-3 px-4">Detected At</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {mismatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                      <span className="text-sm font-medium text-slate-700">No Mismatches Found</span>
                      <span className="text-xs text-slate-400 mt-1">
                        All receipts in this view match China portal data cleanly.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                mismatches.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Receipt & Warehouse */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{m.receipt}</div>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.warehouse === 'GZ'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.warehouse} Warehouse
                      </span>
                    </td>

                    {/* Marka */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {m.dbData?.mainMarka || m.portalData?.mark || '—'}
                      </span>
                    </td>

                    {/* Mismatch Type & Diff */}
                    <td className="py-3 px-4 max-w-xs">
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 mb-1">
                        {m.mismatchType}
                      </span>
                      <div className="text-slate-800 font-medium leading-relaxed">
                        {m.diffSummary}
                      </div>
                    </td>

                    {/* DB Snapshot */}
                    <td className="py-3 px-4 bg-slate-50/50 whitespace-nowrap">
                      <div className="text-[11px] space-y-0.5">
                        <div>
                          Qty: <span className="font-semibold text-slate-900">{m.dbData?.quantity ?? '—'}</span> ctn
                        </div>
                        {m.dbData?.weight && <div>Wt: {m.dbData.weight} kg</div>}
                        {m.dbData?.volume && <div>Vol: {m.dbData.volume} m³</div>}
                      </div>
                    </td>

                    {/* China Portal Snapshot */}
                    <td className="py-3 px-4 bg-indigo-50/30 whitespace-nowrap">
                      <div className="text-[11px] space-y-0.5">
                        <div>
                          Qty: <span className="font-semibold text-indigo-900">{m.portalData?.actualQuantity ?? '—'}</span> ctn
                        </div>
                        {m.portalData?.weight && <div>Wt: {m.portalData.weight} kg</div>}
                        {m.portalData?.volume && <div>Vol: {m.portalData.volume} m³</div>}
                      </div>
                    </td>

                    {/* Detected At */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      <div>
                        {new Date(m.detectedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </div>
                      <span className="text-[10px] text-slate-400">{m.auditPeriod}</span>
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {m.status === 'PENDING' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleFetchSingleReceipt(m.receipt, m.warehouse)}
                            title="Re-fetch this receipt directly from China portal and update DB"
                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded"
                          >
                            Re-Fetch
                          </button>
                          <button
                            onClick={() => handleResolveMismatch(m._id, 'ACCEPT_CHINA')}
                            title="Update local DB to match China numbers"
                            className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded"
                          >
                            Accept China
                          </button>
                          <button
                            onClick={() => handleResolveMismatch(m._id, 'KEEP_DB')}
                            title="Keep local DB data and mark resolved"
                            className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded"
                          >
                            Keep DB
                          </button>
                          <button
                            onClick={() => handleResolveMismatch(m._id, 'IGNORE')}
                            title="Ignore discrepancy"
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <Check className="w-3 h-3 mr-1" />
                          {m.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
