'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Smartphone,
  Laptop,
  Tablet,
  Globe,
  MapPin,
  Clock,
  Shield,
  Search,
  RefreshCw,
  Download,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  Radio,
  Wifi,
  Terminal,
  LogOut,
  Layers,
  BarChart3,
  ListFilter,
  MonitorSmartphone,
  Info,
  X,
  Key,
  Users,
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import UserManager from '@/components/UserManager';

interface VisitorLogItem {
  _id: string;
  ip: string;
  visitorId: string;
  sessionCount: number;
  path: string;
  referrer: string;
  userAgent: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  isp: string;
  org: string;
  timezone: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  brand: string;
  deviceModel: string;
  model?: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  screenResolution: string;
  viewport: string;
  devicePixelRatio: number;
  orientation: string;
  touchSupport: boolean;
  maxTouchPoints: number;
  networkEffectiveType: string;
  language: string;
  createdAt: string;
}

interface StatsSummary {
  totalVisits: number;
  uniqueIpsCount: number;
  uniqueVisitorsCount: number;
  mobileCount: number;
  desktopCount: number;
  tabletCount: number;
  otherCount: number;
  mobilePercentage: number;
  desktopPercentage: number;
}

interface TopIpItem {
  ip: string;
  visitCount: number;
  lastSeen: string;
  country: string;
  city: string;
  isp: string;
  latestDevice: string;
  isMobile: boolean;
  browser: string;
}

export default function VisitorLogsPage() {
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // State
  const [logs, setLogs] = useState<VisitorLogItem[]>([]);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [topIps, setTopIps] = useState<TopIpItem[]>([]);
  const [topMobileModels, setTopMobileModels] = useState<any[]>([]);
  const [topCountries, setTopCountries] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [activeTab, setActiveTab] = useState<'stream' | 'ips' | 'analytics' | 'users'>('stream');
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'desktop' | 'tablet'>('all');
  const [period, setPeriod] = useState<'all' | 'today' | '24h' | '7d' | '30d'>('all');
  const [filterIp, setFilterIp] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Live Auto Refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Inspection modal
  const [selectedLog, setSelectedLog] = useState<VisitorLogItem | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Copy IP helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/visitors/stats?period=${period}`);
      if (res.status === 401) {
        router.push('/admin/visitors/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.summary);
        setTopIps(data.topIpAddresses || []);
        setTopMobileModels(data.topMobileModels || []);
        setTopCountries(data.topCountries || []);
        setTopPages(data.topPages || []);
      }
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  }, [period, router]);

  // Fetch Logs
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        period,
        device: deviceFilter,
      });
      if (search) params.append('search', search);
      if (filterIp) params.append('ip', filterIp);

      const res = await fetch(`/api/visitors/logs?${params.toString()}`);
      if (res.status === 401) {
        router.push('/admin/visitors/login');
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch visitor logs');
      }

      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error fetching visitor logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, period, deviceFilter, search, filterIp, router]);

  // Initial load & filter effect
  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [fetchStats, fetchLogs]);

  // Auto-refresh interval (every 10s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
      fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs, fetchStats]);

  // Clear Logs handler
  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to delete visitor logs? This action cannot be undone.')) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await fetch('/api/visitors/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      alert('Error clearing logs');
    } finally {
      setIsClearing(false);
    }
  };

  // Export to CSV
  const exportToCsv = () => {
    if (!logs.length) return;
    const headers = [
      'Timestamp',
      'IP Address',
      'Country',
      'City',
      'ISP',
      'Device Type',
      'Mobile/Desktop',
      'Brand',
      'Model',
      'OS',
      'OS Version',
      'Browser',
      'Screen Resolution',
      'Page Path',
      'Referrer',
    ];

    const rows = logs.map((l) => [
      `"${new Date(l.createdAt).toLocaleString()}"`,
      `"${l.ip}"`,
      `"${l.country}"`,
      `"${l.city}"`,
      `"${l.isp || ''}"`,
      `"${l.deviceType}"`,
      `"${l.isMobile ? 'Mobile' : 'Desktop'}"`,
      `"${l.brand}"`,
      `"${l.deviceModel || l.model || ''}"`,
      `"${l.os}"`,
      `"${l.osVersion || ''}"`,
      `"${l.browser}"`,
      `"${l.screenResolution || ''}"`,
      `"${l.path}"`,
      `"${l.referrer || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `visitor_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for country flag emoji or code
  const getFlagEmoji = (countryCode: string) => {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Dev Badge */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 rounded-2xl border border-cyan-500/30 shadow-inner">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-sm tracking-wide text-white uppercase">US International</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  DEVELOPER ADMIN
                </span>
              </div>
              <h1 className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                <span>Visitor & Mobile Telemetry Console</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </h1>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl border flex items-center space-x-1.5 transition font-mono ${
                autoRefresh
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Automatically refresh every 10 seconds"
            >
              <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`} />
              <span>{autoRefresh ? 'Live: ON (10s)' : 'Live: OFF'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => {
                fetchStats();
                fetchLogs();
              }}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={exportToCsv}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-medium transition flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Clear logs */}
            <button
              onClick={handleClearLogs}
              disabled={isClearing}
              className="px-2.5 py-1.5 rounded-xl bg-red-950/40 border border-red-900/60 hover:bg-red-900/50 text-red-300 font-medium transition flex items-center space-x-1"
              title="Purge logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Link to Super Admin */}
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-800/60 hover:bg-cyan-900/50 text-cyan-300 font-medium transition flex items-center space-x-1.5 text-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Cargo Admin</span>
            </Link>

            {/* Users & Role Management */}
            <button
              onClick={() => setActiveTab('users')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl border font-medium transition flex items-center space-x-1.5 text-xs ${
                activeTab === 'users'
                  ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-md'
                  : 'bg-emerald-950/60 border-emerald-800/60 hover:bg-emerald-900/50 text-emerald-300'
              }`}
              title="User & Role Management"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Users & Roles</span>
            </button>

            {/* Change Passwords */}
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-800/60 hover:bg-amber-900/50 text-amber-300 font-medium transition flex items-center space-x-1.5 text-xs"
              title="Change Password & Manage Role Credentials"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Role Passwords</span>
            </button>

            {/* Logout */}
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.push('/admin/visitors/login');
              }}
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 flex-1">
        {/* KPI Summary Cards: "how many and also their ip address" */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Visits */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-cyan-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Visits</span>
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Eye className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {stats?.totalVisits ?? '—'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">hits</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Total website page impressions</p>
          </div>

          {/* Card 2: Unique IP Addresses */}
          <div
            onClick={() => setActiveTab('ips')}
            className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-blue-500/40 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Unique IPs</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                {stats?.uniqueIpsCount ?? '—'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">addresses</span>
            </div>
            <p className="mt-1 text-[11px] text-blue-300/70 underline flex items-center gap-1">
              <span>View IP Address Directory →</span>
            </p>
          </div>

          {/* Card 3: Mobile Visitors */}
          <div
            onClick={() => {
              setDeviceFilter('mobile');
              setActiveTab('stream');
            }}
            className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/40 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Mobile Visitors</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Smartphone className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                {stats?.mobileCount ?? '—'}
              </span>
              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {stats?.mobilePercentage ?? 0}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Phones & handheld devices</p>
          </div>

          {/* Card 4: Desktop & Other */}
          <div
            onClick={() => {
              setDeviceFilter('desktop');
              setActiveTab('stream');
            }}
            className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-purple-500/40 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Desktop / PC</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Laptop className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-purple-400">
                {stats?.desktopCount ?? '—'}
              </span>
              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {stats?.desktopPercentage ?? 0}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Laptops, Macs, & Tablets ({stats?.tabletCount ?? 0})</p>
          </div>
        </div>

        {/* Tab Switcher & Filter Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            {/* View Tabs */}
            <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('stream')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center space-x-1.5 ${
                  activeTab === 'stream'
                    ? 'bg-cyan-500 text-black shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MonitorSmartphone className="w-3.5 h-3.5" />
                <span>Live Visitor Stream ({totalCount})</span>
              </button>

              <button
                onClick={() => setActiveTab('ips')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center space-x-1.5 ${
                  activeTab === 'ips'
                    ? 'bg-blue-500 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>IP Address Directory ({topIps.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center space-x-1.5 ${
                  activeTab === 'analytics'
                    ? 'bg-purple-500 text-white shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Device & Location Insights</span>
              </button>

              <button
                onClick={() => setActiveTab('users')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center space-x-1.5 ${
                  activeTab === 'users'
                    ? 'bg-emerald-500 text-black shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>User & Role Management</span>
              </button>
            </div>

            {/* Time Period Filter */}
            {activeTab !== 'users' && (
              <div className="flex items-center space-x-2 text-xs font-mono">
                <span className="text-slate-400 hidden sm:inline">Period:</span>
                <select
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value as any);
                    setPage(1);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="24h">Past 24 Hours</option>
                  <option value="7d">Past 7 Days</option>
                  <option value="30d">Past 30 Days</option>
                </select>
              </div>
            )}
          </div>

          {/* Search & Device Quick-Filters */}
          {activeTab !== 'users' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search IP, City, Country, Mobile Model, Browser, URL..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Device Filter Buttons */}
              <div className="flex items-center space-x-1.5 text-xs font-mono">
                <button
                  onClick={() => {
                    setDeviceFilter('all');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border transition ${
                    deviceFilter === 'all'
                      ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setDeviceFilter('mobile');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border transition flex items-center space-x-1 ${
                    deviceFilter === 'mobile'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Mobile</span>
                </button>
                <button
                  onClick={() => {
                    setDeviceFilter('desktop');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border transition flex items-center space-x-1 ${
                    deviceFilter === 'desktop'
                      ? 'bg-purple-950 border-purple-500 text-purple-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Laptop className="w-3 h-3" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => {
                    setDeviceFilter('tablet');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border transition flex items-center space-x-1 ${
                    deviceFilter === 'tablet'
                      ? 'bg-blue-950 border-blue-500 text-blue-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Tablet className="w-3 h-3" />
                  <span>Tablet</span>
                </button>
              </div>

              {filterIp && (
                <div className="flex items-center space-x-2 bg-blue-950/60 border border-blue-800 text-blue-300 px-3 py-1 rounded-xl text-xs font-mono">
                  <span>Filtering by IP: <strong>{filterIp}</strong></span>
                  <button
                    onClick={() => setFilterIp('')}
                    className="hover:text-white ml-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TAB 1: Live Visitor Stream (Detailed Log Table) */}
        {activeTab === 'stream' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">IP Address & ISP</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Device & Mobile Details</th>
                    <th className="py-3 px-4">Browser & OS</th>
                    <th className="py-3 px-4">Visited Page</th>
                    <th className="py-3 px-4 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          <p>Loading visitor telemetry stream...</p>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No visitor logs found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const visitDate = new Date(log.createdAt);
                      const isRecent = Date.now() - visitDate.getTime() < 5 * 60 * 1000;

                      return (
                        <tr
                          key={log._id}
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-slate-800/50 cursor-pointer transition group"
                        >
                          {/* Time */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              {isRecent && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              )}
                              <span className="text-slate-300">
                                {visitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 block">
                              {visitDate.toLocaleDateString()}
                            </span>
                          </td>

                          {/* IP Address & ISP */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-cyan-300 font-mono text-xs">
                                {log.ip}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(log.ip);
                                }}
                                className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 transition"
                                title="Copy IP"
                              >
                                {copiedIp === log.ip ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            {log.isp && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[180px] block" title={log.isp}>
                                {log.isp}
                              </span>
                            )}
                          </td>

                          {/* Location */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-base">{getFlagEmoji(log.countryCode)}</span>
                              <span className="font-semibold text-slate-200">
                                {log.city && log.city !== 'Unknown' ? log.city : log.country}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 block">
                              {[log.region, log.country].filter(Boolean).join(', ')}
                            </span>
                          </td>

                          {/* Device & Mobile Details */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-2 mb-1">
                              {log.isMobile ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  <Smartphone className="w-3 h-3" /> Mobile
                                </span>
                              ) : log.isTablet ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                                  <Tablet className="w-3 h-3" /> Tablet
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                  <Laptop className="w-3 h-3" /> Desktop
                                </span>
                              )}
                              <span className="text-xs font-semibold text-white">
                                {(log.deviceModel || log.model) !== 'Unknown' ? (log.deviceModel || log.model) : log.brand}
                              </span>
                            </div>

                            {/* Screen & Hardware details */}
                            <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                              {log.screenResolution && (
                                <span>{log.screenResolution}</span>
                              )}
                              {log.touchSupport && (
                                <span className="text-cyan-400">• Touch</span>
                              )}
                              {log.networkEffectiveType && (
                                <span className="uppercase text-amber-400">• {log.networkEffectiveType}</span>
                              )}
                            </div>
                          </td>

                          {/* Browser & OS */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="text-slate-200 font-medium">
                              {log.browser} {log.browserVersion ? log.browserVersion.split('.')[0] : ''}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {log.os} {log.osVersion}
                            </div>
                          </td>

                          {/* Page Visited */}
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-[11px] block truncate max-w-[150px]" title={log.path}>
                              {log.path}
                            </span>
                            {log.referrer && log.referrer !== 'Direct' && (
                              <span className="text-[10px] text-slate-500 truncate block max-w-[150px] mt-0.5" title={log.referrer}>
                                from: {log.referrer}
                              </span>
                            )}
                          </td>

                          {/* View details action */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 group-hover:bg-slate-700 transition"
                              title="Inspect full details"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">
                Showing page {page} of {totalPages} ({totalCount} total entries)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-slate-300 px-2 font-bold">{page}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: IP Address Directory ("how many and also their ip address") */}
        {activeTab === 'ips' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span>Distinct IP Address Directory ({topIps.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  List of every IP address that visited the site, their location, mobile device, and visit count.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Total Visits (How Many)</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">ISP / Network</th>
                    <th className="py-3 px-4">Last Device Used</th>
                    <th className="py-3 px-4">Last Active</th>
                    <th className="py-3 px-4 text-center">Filter By IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {topIps.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No distinct IP data available for selected period.
                      </td>
                    </tr>
                  ) : (
                    topIps.map((ipItem, idx) => (
                      <tr key={ipItem.ip + idx} className="hover:bg-slate-800/40 transition">
                        {/* IP Address */}
                        <td className="py-3 px-4 font-bold text-cyan-300">
                          <div className="flex items-center space-x-2">
                            <span>{ipItem.ip}</span>
                            <button
                              onClick={() => copyToClipboard(ipItem.ip)}
                              className="text-slate-500 hover:text-white"
                              title="Copy IP"
                            >
                              {copiedIp === ipItem.ip ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Visit Count */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                            {ipItem.visitCount} visits
                          </span>
                        </td>

                        {/* Location */}
                        <td className="py-3 px-4 text-slate-200">
                          {ipItem.city ? `${ipItem.city}, ${ipItem.country}` : ipItem.country}
                        </td>

                        {/* ISP */}
                        <td className="py-3 px-4 text-slate-400">
                          {ipItem.isp || '—'}
                        </td>

                        {/* Device */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            {ipItem.isMobile ? (
                              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Laptop className="w-3.5 h-3.5 text-purple-400" />
                            )}
                            <span className="text-white font-medium">
                              {ipItem.latestDevice || 'Unknown'}
                            </span>
                          </div>
                        </td>

                        {/* Last Seen */}
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(ipItem.lastSeen).toLocaleString()}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              setFilterIp(ipItem.ip);
                              setActiveTab('stream');
                              setPage(1);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300 hover:bg-cyan-900/60 transition text-[11px]"
                          >
                            Filter Stream
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Analytics & Mobile Device Insights */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Mobile Brands & Models */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Top Mobile Phones & Models</span>
              </h3>
              <p className="text-xs text-slate-400">
                Most popular mobile devices used by your website visitors.
              </p>
              <div className="space-y-2.5 pt-2">
                {topMobileModels.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No mobile phone telemetry captured yet.</p>
                ) : (
                  topMobileModels.map((item, idx) => (
                    <div
                      key={item._id || idx}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between font-mono text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-white block">{item._id || 'Unknown Mobile'}</span>
                          <span className="text-[10px] text-slate-400">{item.brand}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        {item.count} visits
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Countries & Locations */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>Visitor Geographic Origins</span>
              </h3>
              <p className="text-xs text-slate-400">
                Countries where visitors are connecting from.
              </p>
              <div className="space-y-2.5 pt-2">
                {topCountries.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No geographic data available yet.</p>
                ) : (
                  topCountries.map((item, idx) => (
                    <div
                      key={item._id || idx}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between font-mono text-xs"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="text-lg">{getFlagEmoji(item.countryCode)}</span>
                        <span className="font-bold text-white">{item._id || 'Unknown Location'}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                        {item.count} visits
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Visited Pages */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 md:col-span-2">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Most Visited Website Pages</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {topPages.map((pageItem, idx) => (
                  <div
                    key={pageItem._id || idx}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between font-mono text-xs"
                  >
                    <span className="text-cyan-300 font-bold truncate max-w-[200px]">{pageItem._id}</span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      {pageItem.count} hits
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: User & Role Management */}
        {activeTab === 'users' && (
          <div className="pt-2">
            <UserManager />
          </div>
        )}
      </main>

      {/* INSPECTION MODAL: Full Mobile & Geolocation Telemetry */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl font-mono text-xs">
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between z-10">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Visitor Telemetry Inspection
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Network & IP Section */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 border-b border-slate-800 pb-1 flex items-center justify-between">
                  <span>1. IP Address & Geolocation</span>
                  <button
                    onClick={() => copyToClipboard(selectedLog.ip)}
                    className="text-slate-400 hover:text-white flex items-center gap-1 font-normal"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy IP</span>
                  </button>
                </h4>
                <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">IP Address:</span>
                    <span className="font-bold text-white text-sm">{selectedLog.ip}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ISP / Provider:</span>
                    <span className="text-slate-200">{selectedLog.isp || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Country & City:</span>
                    <span className="text-slate-200">
                      {getFlagEmoji(selectedLog.countryCode)} {selectedLog.city}, {selectedLog.country}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">State / Region:</span>
                    <span className="text-slate-200">{selectedLog.region || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Timezone:</span>
                    <span className="text-slate-200">{selectedLog.timezone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Coordinates:</span>
                    <span className="text-slate-200">
                      {selectedLog.latitude && selectedLog.longitude
                        ? `${selectedLog.latitude.toFixed(4)}, ${selectedLog.longitude.toFixed(4)}`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile & Hardware Telemetry */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-1">
                  2. Mobile Device & Hardware Telemetry
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Form Factor:</span>
                    <span className="font-bold text-white uppercase">{selectedLog.deviceType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Phone Brand:</span>
                    <span className="font-bold text-white">{selectedLog.brand}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Phone Model:</span>
                    <span className="font-bold text-emerald-400">{selectedLog.deviceModel || selectedLog.model}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Operating System:</span>
                    <span className="text-white">{selectedLog.os} {selectedLog.osVersion}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Browser:</span>
                    <span className="text-white">{selectedLog.browser} {selectedLog.browserVersion}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Screen Resolution:</span>
                    <span className="text-cyan-300 font-bold">{selectedLog.screenResolution || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Viewport Size:</span>
                    <span className="text-slate-300">{selectedLog.viewport || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Pixel Ratio (DPR):</span>
                    <span className="text-slate-300">{selectedLog.devicePixelRatio}x</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Touchscreen:</span>
                    <span className="text-slate-300">
                      {selectedLog.touchSupport ? `Yes (${selectedLog.maxTouchPoints} pts)` : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Network Type:</span>
                    <span className="text-amber-400 font-bold uppercase">{selectedLog.networkEffectiveType || 'WiFi / Cable'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Orientation:</span>
                    <span className="text-slate-300 capitalize">{selectedLog.orientation || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Language:</span>
                    <span className="text-slate-300">{selectedLog.language || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Session & Navigation */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-400 border-b border-slate-800 pb-1">
                  3. Session & Page Details
                </h4>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Page Visited:</span>
                    <span className="text-cyan-300 font-bold">{selectedLog.path}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Referrer:</span>
                    <span className="text-slate-300">{selectedLog.referrer || 'Direct'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Visitor UUID:</span>
                    <span className="text-slate-400">{selectedLog.visitorId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Visit / Session Count:</span>
                    <span className="text-white font-bold">{selectedLog.sessionCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timestamp:</span>
                    <span className="text-white">{new Date(selectedLog.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Raw User Agent */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1">
                  4. Raw User-Agent Header
                </h4>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-400 break-all">
                  {selectedLog.userAgent}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-950 px-6 py-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        currentRole="developer"
      />
    </div>
  );
}
