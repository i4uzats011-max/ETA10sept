'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  Truck,
  Search,
  Tag,
  Download,
  Copy,
  Check,
  Share2
} from 'lucide-react';
import { toJpeg } from 'html-to-image';

interface IPublicReceipt {
  marka: string;
  receiptNo: string;
  itemName: string;
  containerNo: string; // Container No. (not actual)
  cbm: string;
  weight: string;
  ctn: string;
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
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" /> ETA Pending
      </span>
    );
  }
  if (remainDays > 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
        <Clock className="w-3 h-3" /> {remainDays} Days Remaining
      </span>
    );
  } else if (remainDays === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse whitespace-nowrap">
        ⚡ 1 Day (Tomorrow)
      </span>
    );
  } else if (remainDays === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 whitespace-nowrap">
        📦 Arriving Today
      </span>
    );
  } else {
    const passed = Math.abs(remainDays);
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
        Past ETA ({passed}d ago)
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
  const [filterQuery, setFilterQuery] = useState('');
  const [downloadingJpg, setDownloadingJpg] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tableCardRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

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

  // Client-side filter
  const filteredReceipts = useMemo(() => {
    if (!filterQuery.trim()) return receipts;
    const q = filterQuery.toLowerCase();
    return receipts.filter((r) => {
      return (
        r.marka?.toLowerCase().includes(q) ||
        r.receiptNo?.toLowerCase().includes(q) ||
        r.itemName?.toLowerCase().includes(q) ||
        r.containerNo?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
      );
    });
  }, [receipts, filterQuery]);

  // Aggregate Totals
  const totals = useMemo(() => {
    let totalCbm = 0;
    let totalCtn = 0;
    let totalWeight = 0;

    receipts.forEach((r) => {
      const cbmNum = parseFloat(r.cbm);
      if (!isNaN(cbmNum)) totalCbm += cbmNum;

      const ctnNum = parseFloat(r.ctn);
      if (!isNaN(ctnNum)) totalCtn += ctnNum;

      const weightNum = parseFloat(r.weight);
      if (!isNaN(weightNum)) totalWeight += weightNum;
    });

    return {
      cbm: totalCbm > 0 ? totalCbm.toFixed(2) : '-',
      ctn: totalCtn > 0 ? totalCtn : '-',
      weight: totalWeight > 0 ? `${totalWeight.toFixed(1)} kg` : '-'
    };
  }, [receipts]);

  // Copy shareable customer message ending with "you can track this via link 24 hrs"
  const copyTrackingMessage = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const receiptList = receipts.map((r) => r.receiptNo).join(', ');
    const msg = `US INTERNATIONAL LOGISTICS 📦\nShipment Tracking Update\nMarka / Reference: ${linkName || '-'}\nReceipt No.: ${receiptList}\n\nTrack your shipment live here:\n${url}\n\nyou can track this via link 24 hrs`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(() => {
        showToast('📋 Message copied! "you can track this via link 24 hrs"');
      });
    } else {
      window.prompt('Copy tracking message:', msg);
    }
  };

  // Download entire table as high-resolution JPG image to send to anyone
  const handleDownloadJpg = async () => {
    if (!tableCardRef.current) return;
    setDownloadingJpg(true);
    try {
      const node = tableCardRef.current;

      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      const cleanName = (linkName || 'Cargo_Tracking').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanName}_${new Date().toISOString().slice(0, 10)}.jpg`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();

      showToast('📸 Table downloaded as JPG! Ready to send on WhatsApp or email.');
    } catch (err) {
      console.error('Error generating JPG:', err);
      alert('Unable to generate JPG image. Please try again.');
    } finally {
      setDownloadingJpg(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Shipment ETA & Cargo Table
                  </h1>
                  {linkName && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-900 text-xs font-extrabold">
                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                      Marka / Client: {linkName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-xs text-slate-500">
                    US INTERNATIONAL LOGISTICS • Live Estimated Time of Arrival & Package Tracking
                  </p>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    You can track this via link 24 hrs
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyTrackingMessage}
                title="Copy shareable message"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>Copy Message</span>
              </button>

              <button
                onClick={handleDownloadJpg}
                disabled={downloadingJpg || loading || receipts.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Download className={`w-3.5 h-3.5 ${downloadingJpg ? 'animate-bounce' : ''}`} />
                <span>{downloadingJpg ? 'Generating JPG...' : 'Download JPG'}</span>
              </button>

              <button
                onClick={() => fetchTrackingDetails(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

          </div>

          {/* Quick Metrics Cards */}
          {!loading && !error && receipts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-blue-600" /> Total Receipts
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {receipts.length}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" /> Total CBM
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {totals.cbm} {totals.cbm !== '-' ? 'm³' : ''}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Box className="w-3.5 h-3.5 text-emerald-600" /> Total CTN
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {totals.ctn} {totals.ctn !== '-' ? 'ctn' : ''}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Weight className="w-3.5 h-3.5 text-amber-600" /> Total Weight
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {totals.weight}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
            <RefreshCw className="w-9 h-9 text-blue-600 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Retrieving Live Cargo Details...</h3>
            <p className="text-xs text-slate-500 mt-1">Please wait while your verified shipment status is loaded.</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-white border border-red-200 rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{error}</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Please double-check the URL or contact US International Logistics for an updated tracking link.
            </p>
          </div>
        )}

        {/* Main Cargo Master Table Card (Capturable as JPG) */}
        {!loading && !error && receipts.length > 0 && (
          <div
            ref={tableCardRef}
            className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-1"
          >
            {/* JPG Report Header Banner (renders in JPG) */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-t-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-400" />
                  <span className="text-sm sm:text-base font-black tracking-wide uppercase">
                    US INTERNATIONAL LOGISTICS
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Cargo Master Status Table • Live Shipment Tracking
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {linkName && (
                  <span className="bg-blue-600/60 border border-blue-400/40 text-white font-bold text-xs px-3 py-1 rounded-full">
                    Marka: {linkName}
                  </span>
                )}
                <span className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-xs px-3 py-1 rounded-full">
                  24 hrs Live Tracking
                </span>
              </div>
            </div>

            {/* Table Control Header (excluded from JPG via style if needed, or shown nicely) */}
            <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Cargo Receipts Table
                </span>
                <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {filteredReceipts.length} {filteredReceipts.length === 1 ? 'record' : 'records'}
                </span>
              </div>

              {/* Search / Filter Bar */}
              {receipts.length > 1 && (
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by Marka, Receipt, Item..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition"
                  />
                </div>
              )}
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 whitespace-nowrap">Marka</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Receipt No.</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Item Name</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">
                      Container No.
                      <span className="block text-[10px] text-slate-400 font-normal lowercase">(not actual)</span>
                    </th>
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">CBM</th>
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">Weight</th>
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">CTN</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">ETA & Remain Days</th>
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((r, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/30"
                    >
                      {/* 1. Marka */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-xs">
                          {r.marka || linkName || '-'}
                        </span>
                      </td>

                      {/* 2. Receipt No. */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md text-xs">
                          <Package className="w-3.5 h-3.5 text-blue-500" />
                          {r.receiptNo}
                        </span>
                      </td>

                      {/* 3. Item Name */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {r.itemName || '-'}
                      </td>

                      {/* 4. Container No. (not actual) */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                        {r.containerNo && r.containerNo !== '-' ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                            {r.containerNo}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Pending Allocation</span>
                        )}
                      </td>

                      {/* 5. CBM */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {r.cbm && r.cbm !== '-' ? `${r.cbm} m³` : '-'}
                      </td>

                      {/* 6. Weight */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-semibold text-slate-700">
                        {r.weight || '-'}
                      </td>

                      {/* 7. CTN */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {r.ctn && r.ctn !== '-' ? `${r.ctn} ctn` : '-'}
                      </td>

                      {/* 8. ETA & Remain Days */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            {formatDisplayDate(r.eta)}
                          </div>
                          <div>{renderRemainDaysBadge(r.remainDays)}</div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {r.status || 'In Transit'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Table Footer Summary Row */}
                {filteredReceipts.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/90 text-slate-800 font-bold border-t-2 border-slate-300 text-xs">
                      <td className="py-3 px-4 font-black uppercase text-slate-700" colSpan={4}>
                        Summary ({filteredReceipts.length} {filteredReceipts.length === 1 ? 'Receipt' : 'Receipts'})
                      </td>
                      <td className="py-3 px-4 text-center font-black text-slate-900 whitespace-nowrap">
                        {totals.cbm} {totals.cbm !== '-' ? 'm³' : ''}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800 whitespace-nowrap">
                        {totals.weight}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-slate-900 whitespace-nowrap">
                        {totals.ctn} {totals.ctn !== '-' ? 'ctn' : ''}
                      </td>
                      <td className="py-3 px-4" colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* JPG Report Footer Notice (renders in JPG) */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 rounded-b-xl flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-700">
                  Verified Tracking Link • US INTERNATIONAL LOGISTICS
                </span>
              </div>
              <div className="font-bold text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                you can track this via link 24 hrs
              </div>
            </div>

          </div>
        )}

        {/* Public Verified Footer */}
        <div className="text-center py-4 text-xs text-slate-400 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Verified Public Tracking • US INTERNATIONAL LOGISTICS • Only authorized shipment details are shown.
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-semibold">
            you can track this via link 24 hrs
          </p>
        </div>

      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 animate-bounce border border-slate-700">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
