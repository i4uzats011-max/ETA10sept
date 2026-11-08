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
  Share2,
  MessageSquare,
  Send,
  X,
  MessageCircle,
  Warehouse,
  CheckCircle2,
  Plus,
  CheckSquare,
  Square,
  Eye,
  EyeOff
} from 'lucide-react';
import { toJpeg } from 'html-to-image';

interface ITrackingQuery {
  id: string;
  receiptNo: string;
  senderName?: string;
  message: string;
  reply?: string;
  status: string;
  createdAt: string;
}

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

  // Multi-Receipt Selection State
  const [selectedReceiptNos, setSelectedReceiptNos] = useState<Set<string>>(new Set());

  // Delivery Visibility (Hidden by default) & Status Tabs
  const [showDelivered, setShowDelivered] = useState(false);
  const [activeStatusTab, setActiveStatusTab] = useState<'active' | 'transit' | 'warehouse' | 'delivered' | 'all'>('active');

  // Customer Query State (Supports multiple selected receipts)
  const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);
  const [queryReceipts, setQueryReceipts] = useState<string[]>([]);
  const [querySenderName, setQuerySenderName] = useState('');
  const [querySenderPhone, setQuerySenderPhone] = useState('');
  const [queryMessage, setQueryMessage] = useState('');
  const [submittingQuery, setSubmittingQuery] = useState(false);
  const [queriesList, setQueriesList] = useState<ITrackingQuery[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(false);

  const toggleSelectReceipt = (rNo: string) => {
    const next = new Set(selectedReceiptNos);
    if (next.has(rNo)) next.delete(rNo);
    else next.add(rNo);
    setSelectedReceiptNos(next);
  };

  const toggleSelectAllReceipts = () => {
    if (selectedReceiptNos.size === filteredReceipts.length && filteredReceipts.length > 0) {
      setSelectedReceiptNos(new Set());
    } else {
      setSelectedReceiptNos(new Set(filteredReceipts.map(r => r.receiptNo)));
    }
  };

  const fetchQueries = async () => {
    if (!token) return;
    try {
      setLoadingQueries(true);
      const res = await fetch(`/api/track/receipt-link/${encodeURIComponent(token)}/query`);
      const data = await res.json();
      if (data.success && Array.isArray(data.queries)) {
        setQueriesList(data.queries);
      }
    } catch (e) {
      console.error('Error fetching queries:', e);
    } finally {
      setLoadingQueries(false);
    }
  };

  const openQueryModal = (specificReceiptNo?: string) => {
    if (specificReceiptNo) {
      setQueryReceipts([specificReceiptNo]);
    } else if (selectedReceiptNos.size > 0) {
      setQueryReceipts(Array.from(selectedReceiptNos));
    } else if (receipts.length > 0) {
      setQueryReceipts([receipts[0].receiptNo]);
    } else {
      setQueryReceipts([]);
    }
    setQueryMessage('');
    setIsQueryModalOpen(true);
    fetchQueries();
  };

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryMessage.trim() || queryReceipts.length === 0) {
      showToast('Please select at least one Receipt No. and type your question.');
      return;
    }
    setSubmittingQuery(true);
    try {
      const res = await fetch(`/api/track/receipt-link/${encodeURIComponent(token)}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNos: queryReceipts,
          receiptNo: queryReceipts.join(', '),
          message: queryMessage,
          senderName: querySenderName,
          senderPhone: querySenderPhone,
          marka: linkName || ''
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✉️ Query sent for ${queryReceipts.length} receipt(s)! We will respond shortly.`);
        setQueryMessage('');
        fetchQueries();
      } else {
        showToast(data.message || 'Failed to send query.');
      }
    } catch (err) {
      showToast('Error sending query. Please retry.');
    } finally {
      setSubmittingQuery(false);
    }
  };

  // Self-Add Receipt State (Two parameters: Receipt No. and CTN)
  const [isAddReceiptOpen, setIsAddReceiptOpen] = useState(false);
  const [addReceiptNo, setAddReceiptNo] = useState('');
  const [addCtn, setAddCtn] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addReceiptNo.trim() || !addCtn.trim()) {
      setAddError('Both Receipt No. and Carton Count (CTN) are required.');
      return;
    }

    setSubmittingAdd(true);
    setAddError(null);

    try {
      const res = await fetch(`/api/track/receipt-link/${encodeURIComponent(token)}/add-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNo: addReceiptNo.trim(),
          ctn: addCtn.trim()
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || 'Receipt verified & added!');
        setAddReceiptNo('');
        setAddCtn('');
        setAddError(null);
        setIsAddReceiptOpen(false);
        // Refresh tracking details to show the newly added receipt
        fetchTrackingDetails(true);
      } else {
        setAddError(data.message || 'Verification failed. Please check Receipt No. and CTN.');
      }
    } catch (err) {
      setAddError('Network error while verifying receipt. Please retry.');
    } finally {
      setSubmittingAdd(false);
    }
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
    fetchQueries();
    const interval = setInterval(() => {
      fetchTrackingDetails();
      fetchQueries();
    }, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, [token]);

  // Helper to categorize receipt into Transit, Warehouse, or Delivered
  const getReceiptCategory = (r: IPublicReceipt): 'transit' | 'warehouse' | 'delivered' => {
    const s = (r.status || '').toLowerCase();
    const isDelivered = s.includes('deliver') || s.includes('arrived');
    if (isDelivered) return 'delivered';

    const hasContainer = r.containerNo && r.containerNo !== '-' && !r.containerNo.toLowerCase().includes('pending');
    if (hasContainer || s.includes('transit') || s.includes('loaded') || s.includes('sailing')) {
      return 'transit';
    }

    return 'warehouse';
  };

  // Helper to sort by ETA in Ascending order (earliest arrival date first)
  const compareEtaAsc = (a: IPublicReceipt, b: IPublicReceipt): number => {
    if (!a.eta && !b.eta) return 0;
    if (!a.eta) return 1; // Pending ETAs go to the bottom of group
    if (!b.eta) return -1;
    const timeA = new Date(a.eta).getTime();
    const timeB = new Date(b.eta).getTime();
    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    return timeA - timeB;
  };

  // Filtered and Sorted Receipts:
  // 1. In Transit (ETA Ascending)
  // 2. In Warehouse (Not loaded to container)
  // 3. Delivered (Hidden by default, shown when toggled)
  const filteredReceipts = useMemo(() => {
    let list = receipts;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter((r) => {
        return (
          r.marka?.toLowerCase().includes(q) ||
          r.receiptNo?.toLowerCase().includes(q) ||
          r.itemName?.toLowerCase().includes(q) ||
          r.containerNo?.toLowerCase().includes(q) ||
          r.status?.toLowerCase().includes(q)
        );
      });
    }

    const transitItems = list.filter(r => getReceiptCategory(r) === 'transit').sort(compareEtaAsc);
    const warehouseItems = list.filter(r => getReceiptCategory(r) === 'warehouse').sort(compareEtaAsc);
    const deliveredItems = list.filter(r => getReceiptCategory(r) === 'delivered').sort(compareEtaAsc);

    // Tab-based filtering
    if (activeStatusTab === 'transit') {
      return transitItems;
    }
    if (activeStatusTab === 'warehouse') {
      return warehouseItems;
    }
    if (activeStatusTab === 'delivered') {
      return deliveredItems;
    }
    if (activeStatusTab === 'all') {
      return [...transitItems, ...warehouseItems, ...deliveredItems];
    }

    // Default view ('active'): Show In Transit FIRST, then In Warehouse, and Delivered HIDDEN by default!
    if (showDelivered) {
      return [...transitItems, ...warehouseItems, ...deliveredItems];
    }
    return [...transitItems, ...warehouseItems];
  }, [receipts, filterQuery, activeStatusTab, showDelivered]);

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

  // Delivery, In Transit, and In Warehouse (Not loaded to container) Statistics for Public User
  const stats = useMemo(() => {
    let delivered = 0;
    let inTransit = 0;
    let inWarehouse = 0;

    receipts.forEach((r) => {
      const s = (r.status || '').toLowerCase();
      const hasContainer = r.containerNo && r.containerNo !== '-' && !r.containerNo.toLowerCase().includes('pending');
      const isDelivered = s.includes('deliver') || s.includes('arrived');

      if (isDelivered) {
        delivered++;
      } else if (hasContainer || s.includes('transit') || s.includes('loaded') || s.includes('sailing')) {
        inTransit++;
      } else {
        // In warehouse: not loaded to container
        inWarehouse++;
      }
    });

    return { delivered, inTransit, inWarehouse };
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
                onClick={() => {
                  setAddError(null);
                  setIsAddReceiptOpen(true);
                }}
                title="Add receipt to this tracking link with Receipt No & Carton Count (CTN)"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Receipt</span>
              </button>

              <button
                onClick={() => openQueryModal()}
                title="Send a message or query to dispatch"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Ask Query / Message {queriesList.length > 0 ? `(${queriesList.length})` : ''}</span>
              </button>

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

          {/* Real-time Shipment Statistics & Summary Cards for Public User */}
          {!loading && !error && receipts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100">
              {/* 1. In Transit */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center justify-between">
                  <span>In Transit</span>
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-xl font-black text-blue-900 mt-0.5">
                  {stats.inTransit}
                </div>
                <div className="text-[10px] text-blue-600 font-semibold mt-0.5">
                  Loaded to container
                </div>
              </div>

              {/* 2. In Warehouse */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
                  <span>In Warehouse</span>
                  <Warehouse className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-xl font-black text-amber-900 mt-0.5">
                  {stats.inWarehouse}
                </div>
                <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                  Not loaded to container
                </div>
              </div>

              {/* 3. Delivered */}
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                  <span>Delivered</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl font-black text-emerald-900 mt-0.5">
                  {stats.delivered}
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                  Completed arrivals
                </div>
              </div>

              {/* 4. Total Receipts */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                  <span>Total Receipts</span>
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {receipts.length}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  In this tracking link
                </div>
              </div>

              {/* 5. Total CTN */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                  <span>Total CTN</span>
                  <Box className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {totals.ctn} {totals.ctn !== '-' ? 'ctn' : ''}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Total cartons
                </div>
              </div>

              {/* 6. Total CBM */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                  <span>Total CBM</span>
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-0.5">
                  {totals.cbm} {totals.cbm !== '-' ? 'm³' : ''}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Total volume
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

            {/* Status Filter Tabs & Search Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 bg-slate-50/70">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 mr-1">
                    Shipment Status:
                  </span>
                  
                  {/* Status Tabs */}
                  <button
                    type="button"
                    onClick={() => { setActiveStatusTab('active'); setShowDelivered(false); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeStatusTab === 'active' && !showDelivered
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Active Cargo (Transit & Warehouse)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveStatusTab('transit')}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeStatusTab === 'transit'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>In Transit ({stats.inTransit})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveStatusTab('warehouse')}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeStatusTab === 'warehouse'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>In Warehouse ({stats.inWarehouse})</span>
                  </button>

                  {stats.delivered > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeStatusTab === 'delivered') {
                          setActiveStatusTab('active');
                          setShowDelivered(false);
                        } else {
                          setActiveStatusTab('delivered');
                          setShowDelivered(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        activeStatusTab === 'delivered' || showDelivered
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Delivered ({stats.delivered})</span>
                      <span className="text-[10px] opacity-80 font-normal">
                        ({activeStatusTab === 'delivered' || showDelivered ? 'Shown' : 'Hidden by Default'})
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setActiveStatusTab('all'); setShowDelivered(true); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeStatusTab === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All ({receipts.length})
                  </button>
                </div>

                {/* Search & Add Receipt Button */}
                <div className="flex items-center gap-2 flex-wrap">
                  {receipts.length > 1 && (
                    <div className="relative w-full sm:w-60">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search receipt, item, marka..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAddError(null);
                      setIsAddReceiptOpen(true);
                    }}
                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Receipt</span>
                  </button>
                </div>
              </div>

              {/* Multi-Select Floating / Sticky Action Bar for Customer */}
              {selectedReceiptNos.size > 0 && (
                <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-blue-900">
                      ✓ {selectedReceiptNos.size} Receipt(s) Selected:
                    </span>
                    <span className="font-mono font-bold text-blue-800 bg-white border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                      {Array.from(selectedReceiptNos).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openQueryModal()}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition shadow-xs cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Ask Question about Selected ({selectedReceiptNos.size})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedReceiptNos(new Set())}
                      className="text-slate-500 hover:text-slate-800 text-[11px] font-semibold underline cursor-pointer ml-1"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 text-center w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllReceipts}
                        className="cursor-pointer text-slate-400 hover:text-white transition"
                        title="Select / Deselect all visible receipts"
                      >
                        {selectedReceiptNos.size > 0 && selectedReceiptNos.size === filteredReceipts.length ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
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
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">
                      ETA & Remain Days
                      <span className="block text-[10px] text-slate-400 font-normal lowercase">(Ascending order)</span>
                    </th>
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((r, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/30 ${
                        selectedReceiptNos.has(r.receiptNo) ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-300' : ''
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectReceipt(r.receiptNo)}
                          className="cursor-pointer text-slate-400 hover:text-blue-600 transition"
                          title={`Select ${r.receiptNo} to ask a question`}
                        >
                          {selectedReceiptNos.has(r.receiptNo) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* 1. Marka */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-xs">
                          {r.marka || linkName || '-'}
                        </span>
                      </td>

                      {/* 2. Receipt No. (Clickable to send query) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openQueryModal(r.receiptNo)}
                          title="Click to ask a query about this receipt"
                          className="inline-flex items-center gap-1.5 font-mono font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-md text-xs cursor-pointer transition shadow-xs group"
                        >
                          <Package className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
                          <span>{r.receiptNo}</span>
                          <span className="text-[10px] text-blue-500 font-sans font-normal opacity-80 group-hover:opacity-100 flex items-center gap-0.5 ml-1">
                            <MessageCircle className="w-3 h-3" /> Ask
                          </span>
                        </button>
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

                      {/* 8. ETA & Remain Days (Ascending order) */}
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
                      <td className="py-3 px-4 font-black uppercase text-slate-700" colSpan={5}>
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

            {/* Delivered Shipments Hidden Notice (Delivered data hidden by default) */}
            {!showDelivered && stats.delivered > 0 && (activeStatusTab === 'active' || activeStatusTab === 'transit') && (
              <div className="p-3 bg-emerald-50/70 border-t border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-900">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    📦 <strong>{stats.delivered} Delivered shipment(s)</strong> are hidden by default to keep your active shipments focused.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDelivered(true)}
                  className="px-3 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold rounded-lg transition text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Show Delivered Shipments ({stats.delivered})</span>
                </button>
              </div>
            )}

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

      {/* Customer Query / Message Box Modal */}
      {isQueryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <MessageSquare className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Send Query to Dispatch</h3>
                  <p className="text-[11px] text-blue-200">
                    US INTERNATIONAL LOGISTICS Support
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQueryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
              <form onSubmit={handleSendQuery} className="space-y-4">
                {/* Multi-Receipt Selector Chips / Badges */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700">
                      Receipt(s) in this query * ({queryReceipts.length} selected)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (queryReceipts.length === receipts.length) {
                          setQueryReceipts([]);
                        } else {
                          setQueryReceipts(receipts.map(r => r.receiptNo));
                        }
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                    >
                      {queryReceipts.length === receipts.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap p-2.5 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto">
                    {receipts.map((r, i) => {
                      const isSelected = queryReceipts.includes(r.receiptNo);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setQueryReceipts(queryReceipts.filter(x => x !== r.receiptNo));
                            } else {
                              setQueryReceipts([...queryReceipts, r.receiptNo]);
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{r.receiptNo}</span>
                          <span className="text-[10px] opacity-80 font-sans font-normal">
                            ({r.ctn ? `${r.ctn} ctn` : `${r.cbm || '0'} m³`})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {queryReceipts.length === 0 && (
                    <span className="text-[10px] text-red-600 font-semibold mt-1 block">
                      ⚠️ Please select at least one receipt number to ask a question about.
                    </span>
                  )}
                </div>

                {/* Sender Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Your Name / Marka</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul / VIP"
                      value={querySenderName}
                      onChange={(e) => setQuerySenderName(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-blue-600 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Phone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210"
                      value={querySenderPhone}
                      onChange={(e) => setQuerySenderPhone(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-blue-600 font-medium"
                    />
                  </div>
                </div>

                {/* Message TextArea */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Message / Query *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Type your query regarding this receipt (e.g. delivery status, customs update, document request)..."
                    value={queryMessage}
                    onChange={(e) => setQueryMessage(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:border-blue-600 font-medium text-slate-800 placeholder-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingQuery}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingQuery ? 'Sending...' : 'Send Message to Dispatch'}</span>
                </button>
              </form>

              {/* Sent Queries History */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Query History & Dispatch Replies ({queriesList.length})
                  </span>
                  <button
                    type="button"
                    onClick={fetchQueries}
                    className="text-blue-600 hover:text-blue-800 font-bold text-[11px] cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                {loadingQueries && (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Loading queries...
                  </div>
                )}

                {!loadingQueries && queriesList.length === 0 && (
                  <div className="text-center py-4 text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No queries sent yet. Type a question above and send.
                  </div>
                )}

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {queriesList.map((q) => (
                    <div
                      key={q.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                          Receipt: {q.receiptNo}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.status === 'Answered'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {q.status === 'Answered' ? '✓ Replied' : 'Pending Response'}
                        </span>
                      </div>

                      <div className="text-slate-800 font-medium bg-white p-2.5 rounded-lg border border-slate-100">
                        <p className="text-[11px] text-slate-400 mb-0.5 font-bold">Question:</p>
                        {q.message}
                      </div>

                      {q.reply ? (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-2.5 rounded-lg">
                          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Dispatch Response:
                          </p>
                          <p className="font-semibold">{q.reply}</p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Awaiting dispatch reply...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── ADD RECEIPT MODAL (Two-Parameter Verification: Receipt No. + CTN) ── */}
      {isAddReceiptOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Add Receipt to Link</h3>
                  <p className="text-[11px] text-emerald-200">
                    Two-Parameter Verification (Receipt No. + CTN)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddReceiptOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl text-emerald-950 text-[11px] leading-relaxed">
                <span className="font-bold flex items-center gap-1 text-emerald-900 mb-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Security Verification:
                </span>
                Enter your <strong>Receipt Number</strong> and the exact <strong>Carton Count (CTN)</strong> as written on your warehouse slip. If both parameters match our records, the shipment will be added to your tracking link immediately.
              </div>

              {addError && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-red-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <form onSubmit={handleAddReceipt} className="space-y-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    1. Receipt No. *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. REC-9083 or 9083"
                    value={addReceiptNo}
                    onChange={(e) => setAddReceiptNo(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 font-mono font-bold text-slate-900 uppercase"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Printed at the top of your warehouse slip
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    2. Carton Count (CTN) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 15 or 15 ctn"
                    value={addCtn}
                    onChange={(e) => setAddCtn(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Exact number of packages / cartons
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddReceiptOpen(false)}
                    className="w-1/2 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAdd}
                    className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{submittingAdd ? 'Verifying...' : 'Verify & Add'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
