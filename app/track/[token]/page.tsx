'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Package,
  Clock,
  Calendar,
  Box,
  Layers,
  Weight,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Truck
} from 'lucide-react';

interface IPublicReceipt {
  receiptNo: string;
  itemName: string;
  cbm: string;
  ctn: string;
  weight: string;
  containerNo: string; // Container No. (not actual)
  eta: string | null;
  status?: string;
  remainDays: number | null;
  updatedAt?: string;
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return 'Pending Schedule';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function renderRemainDaysBadge(remainDays: number | null) {
  if (remainDays === null || remainDays === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3.5 h-3.5" /> ETA Pending
      </span>
    );
  }
  if (remainDays > 1) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <Clock className="w-3.5 h-3.5" /> {remainDays} Days Remaining
      </span>
    );
  } else if (remainDays === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
        ⚡ 1 Day Remaining (Tomorrow)
      </span>
    );
  } else if (remainDays === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
        📦 Arriving Today
      </span>
    );
  } else {
    const passed = Math.abs(remainDays);
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        Past ETA ({passed} {passed === 1 ? 'day' : 'days'} ago)
      </span>
    );
  }
}

export default function PublicReceiptTrackingPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : Array.isArray(params.token) ? params.token[0] : '';

  const [receipts, setReceipts] = useState<IPublicReceipt[]>([]);
  const [linkName, setLinkName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrackingDetails = async (isManual = false) => {
    if (!token) return;
    if (isManual) setRefreshing(true);

    try {
      const res = await fetch(`/api/track/receipt-link/${encodeURIComponent(token)}`, {
        cache: 'no-store'
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.receipts || data.receipts.length === 0) {
        setError(data.message || 'Tracking link not found or expired.');
        setReceipts([]);
        setLinkName(null);
      } else {
        setError(null);
        setReceipts(data.receipts);
        setLinkName(data.name || null);
        const now = new Date();
        setLastUpdated(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error('Error fetching receipt tracking:', err);
      setError('Unable to connect to tracking server. Please try again.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrackingDetails();
    const interval = setInterval(() => {
      fetchTrackingDetails();
    }, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">

        {/* Top Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 mb-3">
            <Truck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Shipment ETA Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time Estimated Time of Arrival & Package Information
          </p>
          {linkName && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-100 text-blue-900 text-xs font-bold mt-2.5 border border-blue-200">
              <span className="text-blue-600 font-medium">Link Reference:</span>
              <span className="font-extrabold">{linkName}</span>
            </div>
          )}
        </div>

        {/* Status Banner */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm mb-6">
          <div className="text-xs text-slate-500">
            {lastUpdated ? `Live status • Updated at ${lastUpdated}` : 'Checking live ETA...'}
          </div>
          <button
            onClick={() => fetchTrackingDetails(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Retrieving verified shipment details...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-white border border-red-200 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{error}</h3>
            <p className="text-xs text-slate-500">
              Please double-check the link or contact your shipment administrator.
            </p>
          </div>
        )}

        {/* Multiple Receipts Info Banner */}
        {!loading && !error && receipts.length > 1 && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold px-4 py-2.5 rounded-xl mb-4 flex items-center justify-between">
            <span>📦 Total Receipts under this tracking link:</span>
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md">{receipts.length}</span>
          </div>
        )}

        {/* Receipts Cards */}
        {!loading && !error && receipts.length > 0 && (
          <div className="space-y-6">
            {receipts.map((r, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden transition-all hover:shadow-lg"
              >
                {/* Card Header: Receipt Number & Status Badge */}
                <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-blue-400" />
                      <span className="text-base sm:text-lg font-bold tracking-wide">
                        Receipt No. {r.receiptNo}
                      </span>
                    </div>
                    {r.status && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-950 text-blue-200 border border-blue-500/30">
                        {r.status}
                      </span>
                    )}
                  </div>
                  <div>{renderRemainDaysBadge(r.remainDays)}</div>
                </div>

                {/* Highlighted ETA Box */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-600 m-5 p-4 rounded-xl flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">
                      Estimated Time of Arrival (ETA)
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-blue-950 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      {formatDisplayDate(r.eta)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      Remain Days
                    </div>
                    <div className="text-lg sm:text-xl font-extrabold text-slate-900">
                      {r.remainDays !== null ? (
                        r.remainDays >= 0 ? `${r.remainDays} Days` : `Overdue (${Math.abs(r.remainDays)}d)`
                      ) : (
                        'N/A'
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid of Allowed Fields */}
                <div className="p-5 pt-0 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Package className="w-3.5 h-3.5 text-slate-400" /> Item Name
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate" title={r.itemName}>
                      {r.itemName || '-'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Layers className="w-3.5 h-3.5 text-slate-400" /> CBM
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {r.cbm ? `${r.cbm} m³` : '0 m³'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Box className="w-3.5 h-3.5 text-slate-400" /> CTN
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {r.ctn ? `${r.ctn} Cartons` : '0 Cartons'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Weight className="w-3.5 h-3.5 text-slate-400" /> Weight
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {r.weight || '-'}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 col-span-2 sm:col-span-2">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Truck className="w-3.5 h-3.5 text-slate-400" /> Container No. (not actual)
                    </div>
                    <div className="text-sm font-mono font-bold text-blue-700">
                      {r.containerNo || '-'}
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Public Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Verified Public Tracking Link • Only authorized shipment details are displayed.</span>
        </div>

      </div>
    </div>
  );
}
