'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  Ship,
  Boxes,
  Warehouse,
  Calendar,
  FileSpreadsheet,
  Search,
  RefreshCw,
  LogOut,
  Download,
  AlertTriangle,
  MessageSquare,
  Truck,
  CheckCircle2,
  Lock,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  Info,
  Clock,
  Sparkles,
  Bell,
  X,
  Tag,
  Eye,
  Send,
  Navigation,
  Anchor,
  HelpCircle,
  FileText,
  Filter,
} from 'lucide-react';
import SalesDatePickerCalendar from '@/components/SalesDatePickerCalendar';
import SearchableContainerSelect from '@/components/SearchableContainerSelect';
import CustomerQueriesManager from '@/components/CustomerQueriesManager';
import { parseMetricNumber } from '@/lib/metricUtils';
import { clearMobileSession } from '@/lib/mobileBridge';

export default function OperationsPortalPage() {
  const router = useRouter();

  // Session State
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    role: string;
    name?: string;
  } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Active Main Navigation Tab:
  // 'containers' (Fleet & Status) | 'warehouse_date' (Wh Date View) | 'container_wise' (Container Sheet) | 'marka_wise' (Marka View) | 'public_queries' (Public Links & Queries)
  const [activeTab, setActiveTab] = useState<
    'containers' | 'warehouse_date' | 'container_wise' | 'marka_wise' | 'public_queries'
  >('containers');

  // Badge Counters
  const [pendingQueriesCount, setPendingQueriesCount] = useState<number>(0);

  // ----------------------------------------------------
  // TAB 1: CONTAINER FLEET & LIVE STATUS DATA
  // ----------------------------------------------------
  const [fleetContainers, setFleetContainers] = useState<any[]>([]);
  const [loadingFleet, setLoadingFleet] = useState(false);
  const [containerSearch, setContainerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [portFilter, setPortFilter] = useState('ALL');
  // Remarks Modal State
  const [remarksModalContainer, setRemarksModalContainer] = useState<any | null>(null);

  // ----------------------------------------------------
  // TAB 2, 3, 4: WAREHOUSE DATE, CONTAINER & MARKA (LIKE SALES HEAD - VIEW ONLY)
  // ----------------------------------------------------
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>(['Guangzhou']);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
  const [markaQuery, setMarkaQuery] = useState('');

  // Options from backend
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [containersOptions, setContainersOptions] = useState<any[]>([]);
  const [markas, setMarkas] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Receipts sheet data (Loaded strictly on-demand)
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [hasLoadedReceiptsOnce, setHasLoadedReceiptsOnce] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState('');

  // ----------------------------------------------------
  // TAB 5: PUBLIC LINK & RECEIPT QUERY LOOKUP
  // ----------------------------------------------------
  const [receiptLookupQuery, setReceiptLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [publicQuerySubTab, setPublicQuerySubTab] = useState<'lookup' | 'manager'>('lookup');

  // Single Container Cargo Sheet Drilldown Modal
  const [drilldownContainer, setDrilldownContainer] = useState<string | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownData, setDrilldownData] = useState<any | null>(null);

  // Copy toast feedback
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const showToast = (text: string) => {
    setCopiedToast(text);
    setTimeout(() => setCopiedToast(null), 3000);
  };

  // ----------------------------------------------------
  // 1. AUTHENTICATION CHECK
  // ----------------------------------------------------
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            // Accessible by operations_head, developer, admin, or staff
            const allowed = ['operations_head', 'developer', 'admin', 'staff'];
            if (!allowed.includes(data.role)) {
              setAccessDenied(true);
              setAuthChecking(false);
              return;
            }
            setCurrentUser({
              username: data.username || 'operations_user',
              role: data.role || 'operations_head',
              name: data.name || data.username || 'Operations Head',
            });
          } else {
            router.push('/admin/login');
            return;
          }
        } else {
          router.push('/admin/login');
          return;
        }
      } catch (e) {
        console.error('Operations auth check error:', e);
      } finally {
        setAuthChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  // Fetch pending queries count
  const fetchQueriesBadge = async () => {
    try {
      const res = await fetch('/api/admin/tracking-queries');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.queries)) {
          const pending = data.queries.filter((q: any) => q.status === 'Pending').length;
          setPendingQueriesCount(pending);
        }
      }
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchQueriesBadge();
    const interval = setInterval(fetchQueriesBadge, 30000);
    return () => clearInterval(interval);
  }, []);

  // ----------------------------------------------------
  // 2. FETCH FLEET CONTAINERS (FOR CONTAINER STATUS TAB)
  // ----------------------------------------------------
  const fetchFleetContainers = async () => {
    setLoadingFleet(true);
    try {
      const res = await fetch('/api/operations/containers');
      const data = await res.json();
      if (data.success && Array.isArray(data.containers)) {
        setFleetContainers(data.containers);
      }
    } catch (e) {
      console.error('Failed to fetch fleet containers:', e);
    } finally {
      setLoadingFleet(false);
    }
  };

  useEffect(() => {
    fetchFleetContainers();
  }, []);

  // ----------------------------------------------------
  // 3. FETCH WAREHOUSE & DATE DROPDOWN OPTIONS
  // ----------------------------------------------------
  const fetchOptions = async (whs?: string[]) => {
    try {
      setLoadingOptions(true);
      const whParam = whs && whs.length > 0 ? `?warehouse=${encodeURIComponent(whs.join(','))}` : '';
      const res = await fetch(`/api/sales/options${whParam}`);
      const data = await res.json();
      if (data.success) {
        if (!whs || whs.length === 0) {
          setWarehouses(data.warehouses || ['Guangzhou', 'Yiwu', 'Ningbo', 'Shenzhen', 'Foshan']);
          if (data.warehouses && data.warehouses.length > 0 && selectedWarehouses.length === 0) {
            setSelectedWarehouses([data.warehouses[0]]);
          }
        }
        setDates(data.dates || []);
        setContainersOptions(data.containers || []);
        if (data.markas) setMarkas(data.markas || []);
      }
    } catch (e) {
      console.error('Failed to fetch options:', e);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  const handleWarehouseToggle = (wh: string) => {
    let next: string[];
    if (wh === 'ALL') {
      next = ['ALL'];
    } else {
      const cleaned = selectedWarehouses.filter((w) => w !== 'ALL');
      if (cleaned.includes(wh)) {
        next = cleaned.filter((w) => w !== wh);
      } else {
        next = [...cleaned, wh];
      }
    }
    setSelectedWarehouses(next);
    fetchOptions(next);
  };

  // ----------------------------------------------------
  // 4. LOAD ON-DEMAND RECEIPTS DATA (STRICTLY READ-ONLY)
  // ----------------------------------------------------
  const executeLoadReceipts = async (
    targetMode: 'warehouse_date' | 'container' | 'marka',
    customDates?: string[],
    customContainers?: string[],
    customMarka?: string
  ) => {
    const activeDates = customDates !== undefined ? customDates : selectedDates;
    const activeContainers = customContainers !== undefined ? customContainers : selectedContainers;
    const activeMarka = customMarka !== undefined ? customMarka : markaQuery;

    if (targetMode === 'warehouse_date' && (selectedWarehouses.length === 0 || activeDates.length === 0)) {
      return;
    }
    if (targetMode === 'container' && activeContainers.length === 0) {
      return;
    }
    if (targetMode === 'marka' && !activeMarka.trim()) {
      return;
    }

    setLoadingReceipts(true);
    try {
      let url = `/api/sales/receipts?mode=${targetMode}`;
      if (targetMode === 'warehouse_date') {
        url += `&warehouses=${encodeURIComponent(selectedWarehouses.join(','))}&dates=${encodeURIComponent(activeDates.join(','))}`;
      } else if (targetMode === 'container') {
        url += `&containers=${encodeURIComponent(activeContainers.join(','))}`;
      } else if (targetMode === 'marka') {
        url += `&marka=${encodeURIComponent(activeMarka.trim())}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.receipts)) {
        setReceipts(data.receipts);
        setHasLoadedReceiptsOnce(true);
      } else {
        setReceipts([]);
      }
    } catch (e) {
      console.error('Failed to load receipts:', e);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const handleDatesChange = (newDates: string[]) => {
    setSelectedDates(newDates);
    if (newDates.length > 0 && selectedWarehouses.length > 0) {
      executeLoadReceipts('warehouse_date', newDates, undefined, undefined);
    }
  };

  const handleContainersChange = (newContainers: string[]) => {
    setSelectedContainers(newContainers);
    if (newContainers.length > 0) {
      executeLoadReceipts('container', undefined, newContainers, undefined);
    } else {
      setReceipts([]);
      setHasLoadedReceiptsOnce(false);
    }
  };

  const handleToggleMarka = (mName: string) => {
    const currentList = markaQuery.split(/[,+]/).map((m) => m.trim()).filter(Boolean);
    let nextList: string[];
    if (currentList.includes(mName)) {
      nextList = currentList.filter((m) => m !== mName);
    } else {
      nextList = [...currentList, mName];
    }
    const nextQuery = nextList.join(', ');
    setMarkaQuery(nextQuery);
    if (nextList.length > 0) {
      executeLoadReceipts('marka', undefined, undefined, nextQuery);
    } else {
      setReceipts([]);
      setHasLoadedReceiptsOnce(false);
    }
  };

  // ----------------------------------------------------
  // 5. PUBLIC LINK LOOKUP (ASKING PUBLIC LINK QUERY)
  // ----------------------------------------------------
  const handleLookupReceipt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = receiptLookupQuery.trim();
    if (!query) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      // 1. Check tracking link lookup endpoint
      const res = await fetch(`/api/admin/tracking-links/lookup?receipt=${encodeURIComponent(query)}`);
      const data = await res.json();

      // 2. Fetch queries specifically for this receipt
      const queryRes = await fetch('/api/admin/tracking-queries');
      const queryData = await queryRes.json();
      let receiptQueries: any[] = [];
      if (queryData.success && Array.isArray(queryData.queries)) {
        receiptQueries = queryData.queries.filter(
          (q: any) => String(q.receiptNo || '').toLowerCase().trim() === query.toLowerCase()
        );
      }

      if (data.success && data.found) {
        setLookupResult({
          ...data,
          customerQueries: receiptQueries,
        });
      } else {
        // Fallback: Check if there are customer queries recorded even if not linked
        setLookupResult({
          found: false,
          receiptNo: query,
          customerQueries: receiptQueries,
          message: data.message || `No active public tracking link found for receipt "${query}".`,
        });
      }
    } catch (err: any) {
      console.error('Error looking up receipt tracking link:', err);
      setLookupError(err?.message || 'Server error looking up receipt.');
    } finally {
      setLookupLoading(false);
    }
  };

  // ----------------------------------------------------
  // 6. DRILLDOWN SINGLE CONTAINER CARGO SHEET
  // ----------------------------------------------------
  const handleOpenDrilldown = async (cName: string) => {
    setDrilldownContainer(cName);
    setDrilldownLoading(true);
    setDrilldownData(null);
    try {
      const res = await fetch(`/api/operations/containers?container=${encodeURIComponent(cName)}`);
      const data = await res.json();
      if (data.success) {
        setDrilldownData(data);
      }
    } catch (e) {
      console.error('Drilldown container fetch error:', e);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // ----------------------------------------------------
  // 7. EXPORT TO EXCEL
  // ----------------------------------------------------
  const handleExportContainersExcel = () => {
    if (filteredFleetContainers.length === 0) return;
    const exportRows = filteredFleetContainers.map((c, i) => ({
      '#': i + 1,
      'Container No.': c.container,
      'Actual Carrier No.': c.containerNumber || '—',
      'Container Status': c.status,
      'Port Name': c.portName,
      'Last Status / Remark': c.latestRemark?.remarks || '—',
      'Remark Date': c.latestRemark?.date || '—',
      'Remark By': c.latestRemark?.createdBy || '—',
      ETA: c.eta,
      'Port Date': c.portDate,
      Destination: c.destination,
      'Total CTN': c.totalCartons,
      'Total CBM': c.totalVolume,
      'Total Weight (KG)': c.totalWeight,
      'Shipping Line': c.shippingLine,
      'Loading Date': c.loadingDate,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Container_Fleet');
    XLSX.writeFile(wb, `Operations_Containers_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Containers exported to Excel!');
  };

  const handleExportSheetExcel = () => {
    if (filteredReceipts.length === 0) return;
    const exportRows = filteredReceipts.map((r, i) => ({
      '#': i + 1,
      'Receipt No.': r.receipt,
      'Receipt Date': r.date || '—',
      Warehouse: r.warehouse,
      'Container No.': r.container || '—',
      'Loading Date': r.loadingDate || '—',
      ETA: r.eta || '—',
      'Marks (Marka)': r.mainMarka || r.subMarka || '—',
      'Item Name': r.commodity || '—',
      CBM: r.volume || '0',
      'Weight (KG)': r.weight || '0',
      CTN: r.quantity || 0,
      Rate: r.rate || '—',
      'Sales Person': r.salesPerson || '—',
      Status: r.salesStatus || r.status || '—',
      Remarks: r.salesRemarks || r.remarks || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cargo_Sheet');
    XLSX.writeFile(wb, `Operations_Cargo_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Cargo sheet exported to Excel!');
  };

  // ----------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearMobileSession();
      router.push('/admin/login?logged_out=true');
    } catch {
      router.push('/admin/login');
    }
  };

  // ----------------------------------------------------
  // FILTERED DATA COMPUTATION
  // ----------------------------------------------------
  // Filtered fleet containers
  const filteredFleetContainers = useMemo(() => {
    return fleetContainers.filter((c) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        const cStatus = (c.status || '').toLowerCase();
        if (statusFilter === 'In Transit' && !cStatus.includes('transit')) return false;
        if (statusFilter === 'Arrived' && !cStatus.includes('arrived') && !cStatus.includes('port')) return false;
        if (statusFilter === 'Customs Clearance' && !cStatus.includes('custom')) return false;
        if (statusFilter === 'Delivered' && !c.isDelivered && !cStatus.includes('deliver')) return false;
      }

      // Port Filter
      if (portFilter !== 'ALL') {
        if (!c.portName?.toLowerCase().includes(portFilter.toLowerCase())) return false;
      }

      // Search Filter
      if (containerSearch.trim()) {
        const q = containerSearch.toLowerCase().trim();
        const inContainer = (c.container || '').toLowerCase().includes(q);
        const inActual = (c.containerNumber || '').toLowerCase().includes(q);
        const inStatus = (c.status || '').toLowerCase().includes(q);
        const inPort = (c.portName || '').toLowerCase().includes(q);
        const inDest = (c.destination || '').toLowerCase().includes(q);
        const inEta = (c.eta || '').toLowerCase().includes(q);
        const inPortDate = (c.portDate || '').toLowerCase().includes(q);
        const inRemark = (c.latestRemark?.remarks || '').toLowerCase().includes(q);
        if (!inContainer && !inActual && !inStatus && !inPort && !inDest && !inEta && !inPortDate && !inRemark) {
          return false;
        }
      }

      return true;
    });
  }, [fleetContainers, statusFilter, portFilter, containerSearch]);

  // Distinct Ports for filter dropdown
  const distinctPorts = useMemo(() => {
    const set = new Set<string>();
    fleetContainers.forEach((c) => {
      if (c.portName && c.portName !== '—') set.add(c.portName);
    });
    return Array.from(set).sort();
  }, [fleetContainers]);

  // Filtered Sheet Receipts
  const filteredReceipts = useMemo(() => {
    if (!sheetSearchQuery.trim()) return receipts;
    const q = sheetSearchQuery.toLowerCase().trim();
    return receipts.filter((r) => {
      return (
        (r.receipt || '').toLowerCase().includes(q) ||
        (r.commodity || '').toLowerCase().includes(q) ||
        (r.mainMarka || '').toLowerCase().includes(q) ||
        (r.subMarka || '').toLowerCase().includes(q) ||
        (r.container || '').toLowerCase().includes(q) ||
        (r.salesPerson || '').toLowerCase().includes(q) ||
        (r.rate || '').toLowerCase().includes(q) ||
        (r.salesStatus || '').toLowerCase().includes(q)
      );
    });
  }, [receipts, sheetSearchQuery]);

  // Summary Metrics for Sheet
  const sheetSummary = useMemo(() => {
    let totalCtn = 0;
    let totalCbm = 0;
    let totalWeight = 0;

    receipts.forEach((r) => {
      totalCtn += Number(r.quantity) || 0;
      const cbmVal = parseMetricNumber(r.volume);
      const wtVal = parseMetricNumber(r.weight);
      totalCbm += cbmVal;
      totalWeight += wtVal;
    });

    const avgKgsPerCbm = totalCbm > 0 && totalWeight > 0 ? (totalWeight / totalCbm).toFixed(1) : '0';

    return {
      totalReceipts: receipts.length,
      totalCtn,
      totalCbm: totalCbm.toFixed(3),
      totalWeight: totalWeight.toFixed(1),
      avgKgsPerCbm,
    };
  }, [receipts]);

  // ----------------------------------------------------
  // AUTH CHECK LOADING & DENIED STATES
  // ----------------------------------------------------
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          <p className="text-sm font-semibold tracking-wide text-slate-300">
            Verifying Operations Head Access...
          </p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-800/80 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 mx-auto bg-red-950/60 border border-red-700 text-red-400 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Access Restricted</h2>
          <p className="text-xs text-red-300 leading-relaxed">
            The Operations Head Portal is restricted to authorized <strong>Operations Head</strong> or <strong>Developer Admin</strong> accounts.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout & Switch Account</span>
            </button>
            <Link
              href="/admin/login"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-800 font-sans selection:bg-orange-500 selection:text-white">
      {/* Toast Notification */}
      {copiedToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-orange-500 flex items-center space-x-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* Top Application Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-5 py-2.5 shadow-md sticky top-0 z-40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Portal Title */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white shadow-md shadow-orange-950/40">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-sm tracking-wide text-white">
                  US International Logistics — Operations Portal
                </h1>
                <span className="text-[10px] bg-orange-600 text-white font-mono uppercase px-2 py-0.5 rounded-full font-black tracking-wider shadow-xs">
                  Operations Head
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  View-Only
                </span>
              </div>
              <div className="text-[11px] text-slate-400 hidden sm:block">
                Container Status, Port Dates, ETA, Destination, Warehouse Inward & Public Tracking Inquiries
              </div>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3 ml-auto">
            <div className="bg-slate-800/90 p-0.5 rounded-xl flex items-center border border-slate-700 text-xs shrink-0 overflow-x-auto shadow-inner">
              {/* Tab 1: Container Fleet Status */}
              <button
                onClick={() => setActiveTab('containers')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 shrink-0 ${
                  activeTab === 'containers'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Container Status, No., Port, Last Remark Status, ETA, Port Date & Destination"
              >
                <Ship className="w-3.5 h-3.5 text-orange-300" />
                <span>Container Fleet Status</span>
              </button>

              {/* Tab 2: Warehouse Date Wise View (Like Sales Head, View Only) */}
              <button
                onClick={() => {
                  setActiveTab('warehouse_date');
                  if (selectedWarehouses.length > 0 && selectedDates.length > 0 && receipts.length === 0) {
                    executeLoadReceipts('warehouse_date');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 shrink-0 ${
                  activeTab === 'warehouse_date'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Warehouse & Date-Wise Cargo Sheet (View Only)"
              >
                <Warehouse className="w-3.5 h-3.5 text-amber-300" />
                <span>Warehouse Date Wise</span>
              </button>

              {/* Tab 3: Container Wise Data (Like Sales Head, View Only) */}
              <button
                onClick={() => {
                  setActiveTab('container_wise');
                  if (selectedContainers.length > 0 && receipts.length === 0) {
                    executeLoadReceipts('container');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 shrink-0 ${
                  activeTab === 'container_wise'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Container Cargo Sheet (View Only)"
              >
                <Boxes className="w-3.5 h-3.5 text-blue-300" />
                <span>Container Wise Data</span>
              </button>

              {/* Tab 4: Marka Wise View (Like Sales Head, View Only) */}
              <button
                onClick={() => {
                  setActiveTab('marka_wise');
                  if (markaQuery.trim() && receipts.length === 0) {
                    executeLoadReceipts('marka');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 shrink-0 ${
                  activeTab === 'marka_wise'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Marka-Wise Cargo Sheet (View Only)"
              >
                <Tag className="w-3.5 h-3.5 text-purple-300" />
                <span>Marka Wise Data</span>
              </button>

              {/* Tab 5: Receipt Public Link & Queries */}
              <button
                onClick={() => setActiveTab('public_queries')}
                className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 shrink-0 ${
                  activeTab === 'public_queries'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Query About Receipt by Asking Public Link"
              >
                <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
                <span>Public Link Queries</span>
                {pendingQueriesCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-rose-600 text-white text-[10px] rounded-full font-bold animate-pulse">
                    {pendingQueriesCount}
                  </span>
                )}
              </button>
            </div>

            {/* Developer link back to Admin if applicable */}
            {currentUser?.role === 'developer' && (
              <Link
                href="/admin"
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition shrink-0"
              >
                Admin Panel
              </Link>
            )}

            {/* User Profile Pill */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs shrink-0">
              <div className="w-6 h-6 rounded-full bg-orange-600/30 text-orange-400 flex items-center justify-center font-bold text-[11px]">
                {(currentUser?.name || currentUser?.username || 'O')[0].toUpperCase()}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-slate-200 font-semibold leading-tight text-[11px] truncate max-w-[110px]">
                  {currentUser?.name || currentUser?.username}
                </span>
                <span className="text-[9px] text-orange-400 font-mono">Operations Head</span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold border border-red-500 rounded-lg text-xs transition flex items-center space-x-1.5 shadow-md shrink-0 cursor-pointer"
              title="Logout from Operations Portal"
            >
              <LogOut className="w-3.5 h-3.5 text-white" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
        {/* ========================================================================= */}
        {/* TAB 1: CONTAINER FLEET STATUS (PRIMARY USER REQUEST)                     */}
        {/* ========================================================================= */}
        {activeTab === 'containers' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Top Toolbar: Search, Filters, Stats & Export */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                    <Ship className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                      <span>Operations Container Tracking Fleet</span>
                      <span className="text-xs bg-orange-100 text-orange-800 font-mono font-bold px-2 py-0.5 rounded-full">
                        {filteredFleetContainers.length} of {fleetContainers.length} Containers
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Monitor live Container Status, Carrier Numbers, Port Names, Current Status Remarks, ETA, Port Dates, and Destinations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchFleetContainers}
                    disabled={loadingFleet}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-300"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFleet ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={handleExportContainersExcel}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={containerSearch}
                    onChange={(e) => setContainerSearch(e.target.value)}
                    placeholder="Search Container, Carrier No, Port, Remark..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                  {containerSearch && (
                    <button
                      onClick={() => setContainerSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  >
                    <option value="ALL">All Statuses (सभी स्टेटस)</option>
                    <option value="In Transit">In Transit (रास्ते में)</option>
                    <option value="Arrived">Arrived at Port (पोर्ट पर पहुंचा)</option>
                    <option value="Customs Clearance">Customs Clearance (कस्टम प्रक्रिया)</option>
                    <option value="Delivered">Delivered (डिलीवर हो गया)</option>
                  </select>
                </div>

                {/* Port Filter */}
                <div>
                  <select
                    value={portFilter}
                    onChange={(e) => setPortFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  >
                    <option value="ALL">All Ports / Locations</option>
                    {distinctPorts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Active Info Badge */}
                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="font-semibold">Showing:</span>
                  <span className="font-mono font-bold text-orange-700">
                    {filteredFleetContainers.length} Active Records
                  </span>
                </div>
              </div>
            </div>

            {/* Container Fleet Table */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-300 overflow-hidden">
              <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs select-text">
                  <thead className="sticky top-0 z-20 bg-slate-900 text-white font-semibold text-[11px] tracking-wide uppercase shadow-md">
                    <tr>
                      <th className="py-3 px-2 border-r border-slate-800 text-center w-10">#</th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap bg-slate-950 font-bold text-orange-300">
                        CONTAINER NO.
                      </th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">CONTAINER STATUS</th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">PORT NAME</th>
                      <th className="py-3 px-3 border-r border-slate-800 min-w-[220px] bg-slate-950 text-amber-300 font-bold">
                        REMARKS (CURRENT STATUS) 💬
                      </th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap bg-orange-950/80 text-orange-200 font-bold">
                        ETA
                      </th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">PORT DATE</th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">DESTINATION</th>
                      <th className="py-3 px-3 border-r border-slate-800 text-right whitespace-nowrap">TOTAL CTN</th>
                      <th className="py-3 px-3 border-r border-slate-800 text-right whitespace-nowrap">CBM</th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">SHIPPING LINE</th>
                      <th className="py-3 px-3 border-r border-slate-800 whitespace-nowrap">LOADING DATE</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap bg-slate-950">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loadingFleet ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
                            <span className="text-xs font-semibold">Loading Container Fleet...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredFleetContainers.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-slate-500">
                          No containers found matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredFleetContainers.map((c, idx) => {
                        const isDelivered = c.isDelivered;
                        const hasLatestRemark = Boolean(c.latestRemark?.remarks);
                        const remarksCount = Array.isArray(c.remarks) ? c.remarks.length : 0;

                        return (
                          <tr
                            key={c.container}
                            className={`transition hover:bg-orange-50/50 ${
                              isDelivered
                                ? 'bg-emerald-50/20'
                                : idx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/40'
                            }`}
                          >
                            {/* Row Index */}
                            <td className="py-2.5 px-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px] bg-slate-50">
                              {idx + 1}
                            </td>

                            {/* 1. CONTAINER NO. (Alias & Actual Carrier Number) */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-black text-slate-900 text-xs">{c.container}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(c.container);
                                    showToast(`Copied ${c.container}!`);
                                  }}
                                  className="text-slate-400 hover:text-slate-700"
                                  title="Copy Container Alias"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                              {c.containerNumber && c.containerNumber !== '—' && (
                                <div className="text-[10px] text-slate-500 font-medium tracking-tight">
                                  Carrier: <span className="text-slate-700 font-bold">{c.containerNumber}</span>
                                </div>
                              )}
                            </td>

                            {/* 2. CONTAINER STATUS */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isDelivered
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : c.status?.toLowerCase().includes('arrived')
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : c.status?.toLowerCase().includes('custom')
                                    ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>

                            {/* 3. PORT NAME */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium text-slate-800">
                              <div className="flex items-center space-x-1">
                                <Anchor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{c.portName}</span>
                              </div>
                            </td>

                            {/* 4. REMARKS (CURRENT STATUS) - "SHOW LAST STATUS" */}
                            <td className="py-2.5 px-3 border-r border-slate-200 min-w-[220px]">
                              {hasLatestRemark ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-semibold text-slate-900 bg-amber-50/80 border border-amber-200/80 rounded-lg p-1.5 leading-snug">
                                    <span className="text-[10px] font-bold uppercase text-amber-800 block">
                                      Latest Status:
                                    </span>
                                    {c.latestRemark.remarks}
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                                    <span>
                                      {c.latestRemark.date} ({c.latestRemark.createdBy})
                                    </span>
                                    {remarksCount > 1 && (
                                      <button
                                        onClick={() => setRemarksModalContainer(c)}
                                        className="text-orange-600 hover:text-orange-800 font-bold underline ml-2"
                                      >
                                        History ({remarksCount})
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-slate-400 text-xs italic">
                                  <span>No special remark recorded</span>
                                </div>
                              )}
                            </td>

                            {/* 5. ETA */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono">
                              <div className="font-bold text-orange-700 text-xs">{c.eta}</div>
                              {c.daysRemaining !== null && !isDelivered && (
                                <div
                                  className={`text-[10px] font-bold ${
                                    c.daysRemaining <= 0
                                      ? 'text-rose-600'
                                      : c.daysRemaining <= 3
                                      ? 'text-amber-600'
                                      : 'text-emerald-600'
                                  }`}
                                >
                                  {c.daysRemaining <= 0
                                    ? 'Arrived / Overdue'
                                    : `${c.daysRemaining} days left`}
                                </div>
                              )}
                            </td>

                            {/* 6. PORT DATE */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono font-medium text-slate-700">
                              {c.portDate}
                            </td>

                            {/* 7. DESTINATION */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-slate-800 font-medium">
                              <div className="flex items-center space-x-1">
                                <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{c.destination}</span>
                              </div>
                            </td>

                            {/* Total CTN */}
                            <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {c.totalCartons}
                            </td>

                            {/* Total Volume */}
                            <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono text-slate-700 whitespace-nowrap">
                              {c.totalVolume} CBM
                            </td>

                            {/* Shipping Line */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-slate-700">
                              {c.shippingLine || 'MSC'}
                            </td>

                            {/* Loading Date */}
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-slate-600">
                              {c.loadingDate}
                            </td>

                            {/* Action Button: Open Single Container Cargo Sheet */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => handleOpenDrilldown(c.container)}
                                className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold text-[11px] shadow-xs transition inline-flex items-center space-x-1 cursor-pointer"
                                title="View All Shipments Inside This Container"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Cargo Sheet</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: WAREHOUSE DATE WISE VIEW (LIKE SALES HEAD - READ ONLY)            */}
        {/* ========================================================================= */}
        {activeTab === 'warehouse_date' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Top Toolbar */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Warehouse className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                      <span>Warehouse & Loading Date Wise View</span>
                      <span className="text-[10px] bg-slate-800 text-amber-400 font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Sales Head Mirror (View-Only)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Operations Head can view full warehouse receipts by date exactly like Sales Head, strictly read-only.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportSheetExcel}
                    disabled={filteredReceipts.length === 0}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Warehouse & Date Picker Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
                {/* Warehouse Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Select Warehouse(s) *
                  </label>
                  <div className="flex flex-wrap gap-1 p-1 bg-slate-50 border border-slate-300 rounded-xl min-h-[36px] items-center">
                    <button
                      type="button"
                      onClick={() => handleWarehouseToggle('ALL')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                        selectedWarehouses.includes('ALL')
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ALL
                    </button>
                    {warehouses.map((w) => {
                      const isSel = selectedWarehouses.includes(w);
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => handleWarehouseToggle(w)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            isSel
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {w}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Calendar Date Picker */}
                <div className="lg:col-span-2">
                  <SalesDatePickerCalendar
                    selectedDates={selectedDates}
                    onChangeDates={handleDatesChange}
                    availableDates={dates}
                    warehouseName={selectedWarehouses.join(', ')}
                  />
                </div>
              </div>

              {/* Search in loaded sheet */}
              {receipts.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={sheetSearchQuery}
                      onChange={(e) => setSheetSearchQuery(e.target.value)}
                      placeholder="Type-search in sheet..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <span>
                      Total Receipts: <strong>{sheetSummary.totalReceipts}</strong>
                    </span>
                    <span>
                      Cartons: <strong>{sheetSummary.totalCtn}</strong>
                    </span>
                    <span>
                      Volume: <strong>{sheetSummary.totalCbm} CBM</strong>
                    </span>
                    <span>
                      Weight: <strong>{sheetSummary.totalWeight} KG</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Receipts Spreadsheet Table */}
            {loadingReceipts ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 p-12 text-center text-slate-500">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold">Loading Warehouse Date Cargo Records...</p>
              </div>
            ) : !hasLoadedReceiptsOnce || selectedDates.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xs border border-dashed border-slate-300 p-12 text-center">
                <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Select Warehouse & Date(s) to View Cargo</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Click on any available green date in the calendar above. Records will load instantly in view-only mode.
                </p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center text-slate-500 text-xs">
                No receipts found for the selected dates and warehouse.
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    <thead className="sticky top-0 z-20 bg-[#0f5132] text-white font-semibold text-[11px] tracking-wide uppercase shadow-sm">
                      <tr>
                        <th className="py-2.5 px-2 border-r border-emerald-800 text-center w-10">#</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Receipt No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Receipt Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Warehouse</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Container No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Loading Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap bg-[#0d452b] text-emerald-200">
                          ETA
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Marks (Marka)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 min-w-[160px]">Item Name</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">CBM</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">Weight (KG)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap bg-[#0d452b] text-amber-300 font-bold">
                          KGS/CBM
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap font-bold">CTN</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Rate (View Only 🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Sales Person (🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap text-center">Status</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-slate-300 bg-[#0d452b]">Remarks (🔒)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredReceipts.map((row, idx) => {
                        const cbmVal = parseMetricNumber(row.volume);
                        const wtVal = parseMetricNumber(row.weight);
                        const kgsPerCbm = cbmVal > 0 ? (wtVal / cbmVal).toFixed(1) : '—';

                        return (
                          <tr
                            key={row.receipt}
                            className={`transition hover:bg-emerald-50/40 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                            }`}
                          >
                            <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px] bg-slate-100/50">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {row.receipt}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap">
                              {row.date || 'N/A'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800 font-medium whitespace-nowrap">
                              {row.warehouse}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-blue-700 whitespace-nowrap">
                              {row.container || '—'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                              {row.loadingDate || '—'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono text-emerald-700 font-bold whitespace-nowrap">
                              {row.eta || 'Pending'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                              {row.mainMarka || row.subMarka || '—'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800 min-w-[160px]">
                              {row.commodity || '—'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {row.volume || '0'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap">
                              {row.weight || '0'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                              {kgsPerCbm}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                              {row.quantity || 0}
                            </td>
                            {/* Rate (View Only) */}
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-700 whitespace-nowrap bg-slate-50/50">
                              {row.rate ? `₹${row.rate}` : '—'}
                            </td>
                            {/* Sales Person (View Only) */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap bg-slate-50/50">
                              {row.salesPerson || '—'}
                            </td>
                            {/* Status */}
                            <td className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                {row.salesStatus || row.status || 'Pending'}
                              </span>
                            </td>
                            {/* Remarks */}
                            <td className="py-2 px-3 text-slate-600 text-xs min-w-[140px] bg-slate-50/50">
                              {row.salesRemarks || row.remarks || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CONTAINER WISE DATA (LIKE SALES HEAD - READ ONLY)                 */}
        {/* ========================================================================= */}
        {activeTab === 'container_wise' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Top Container Selector Bar */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                    <Boxes className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                      <span>Container Wise Cargo Sheet</span>
                      <span className="text-[10px] bg-slate-800 text-blue-300 font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Sales Head Mirror (View-Only)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Search and select any container to inspect all shipments packed inside, strictly view-only.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportSheetExcel}
                    disabled={filteredReceipts.length === 0}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Type-Searchable Multi-Container Selector */}
              <div>
                <SearchableContainerSelect
                  containers={containersOptions}
                  selectedContainers={selectedContainers}
                  onChangeContainers={handleContainersChange}
                />
              </div>

              {/* Search in loaded container sheet */}
              {receipts.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={sheetSearchQuery}
                      onChange={(e) => setSheetSearchQuery(e.target.value)}
                      placeholder="Type-search in sheet..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <span>
                      Total Receipts: <strong>{sheetSummary.totalReceipts}</strong>
                    </span>
                    <span>
                      Cartons: <strong>{sheetSummary.totalCtn}</strong>
                    </span>
                    <span>
                      Volume: <strong>{sheetSummary.totalCbm} CBM</strong>
                    </span>
                    <span>
                      Weight: <strong>{sheetSummary.totalWeight} KG</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Container Sheet Display */}
            {loadingReceipts ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 p-12 text-center text-slate-500">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold">Loading Container Cargo Sheet...</p>
              </div>
            ) : selectedContainers.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xs border border-dashed border-slate-300 p-12 text-center">
                <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Boxes className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Select Container(s) Above</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Type or select one or more containers to see their complete item breakdown, packages, weights, and ETAs.
                </p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center text-slate-500 text-xs">
                No items found inside the selected container(s).
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    <thead className="sticky top-0 z-20 bg-[#0f5132] text-white font-semibold text-[11px] tracking-wide uppercase shadow-sm">
                      <tr>
                        <th className="py-2.5 px-2 border-r border-emerald-800 text-center w-10">#</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Receipt No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Warehouse</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Container No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Loading Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap bg-[#0d452b] text-emerald-200">
                          ETA
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Marks (Marka)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 min-w-[160px]">Item Name</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">CBM</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">Weight (KG)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap font-bold">CTN</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Rate (🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Sales Person (🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap text-center">Status</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-slate-300 bg-[#0d452b]">Remarks (🔒)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredReceipts.map((row, idx) => (
                        <tr
                          key={row.receipt}
                          className={`transition hover:bg-emerald-50/40 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                          }`}
                        >
                          <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px] bg-slate-100/50">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {row.receipt}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-800 font-medium whitespace-nowrap">
                            {row.warehouse}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {row.container || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                            {row.loadingDate || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono text-emerald-700 font-bold whitespace-nowrap">
                            {row.eta || 'Pending'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                            {row.mainMarka || row.subMarka || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-800 min-w-[160px]">
                            {row.commodity || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {row.volume || '0'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap">
                            {row.weight || '0'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {row.quantity || 0}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-700 whitespace-nowrap bg-slate-50/50">
                            {row.rate ? `₹${row.rate}` : '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap bg-slate-50/50">
                            {row.salesPerson || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              {row.salesStatus || row.status || 'Pending'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600 text-xs min-w-[140px] bg-slate-50/50">
                            {row.salesRemarks || row.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MARKA WISE VIEW (LIKE SALES HEAD - READ ONLY)                     */}
        {/* ========================================================================= */}
        {activeTab === 'marka_wise' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Top Toolbar */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
                    <Tag className="w-5 h-5 text-purple-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                      <span>Marka Wise Cargo Sheet</span>
                      <span className="text-[10px] bg-slate-800 text-purple-300 font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Sales Head Mirror (View-Only)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Search any Shipping Mark (Marka) across all containers and warehouses, strictly view-only.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportSheetExcel}
                    disabled={filteredReceipts.length === 0}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Marka Input & Quick Suggestion Chips */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Tag className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={markaQuery}
                      onChange={(e) => setMarkaQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          executeLoadReceipts('marka');
                        }
                      }}
                      placeholder="Type Shipping Mark (e.g. VIP, SHANTI, RK, GUANGZHOU)..."
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => executeLoadReceipts('marka')}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition shrink-0 cursor-pointer"
                  >
                    Load Marka Cargo
                  </button>
                </div>

                {/* Popular Marka Suggestion Chips */}
                {markas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-500 mr-1">Quick Select:</span>
                    {markas.slice(0, 15).map((m) => {
                      const isSel = markaQuery.split(',').map((s) => s.trim()).includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleToggleMarka(m)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                            isSel
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-purple-50'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Search in loaded marka sheet */}
              {receipts.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={sheetSearchQuery}
                      onChange={(e) => setSheetSearchQuery(e.target.value)}
                      placeholder="Type-search in sheet..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <span>
                      Total Receipts: <strong>{sheetSummary.totalReceipts}</strong>
                    </span>
                    <span>
                      Cartons: <strong>{sheetSummary.totalCtn}</strong>
                    </span>
                    <span>
                      Volume: <strong>{sheetSummary.totalCbm} CBM</strong>
                    </span>
                    <span>
                      Weight: <strong>{sheetSummary.totalWeight} KG</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Marka Sheet Display */}
            {loadingReceipts ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 p-12 text-center text-slate-500">
                <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold">Loading Marka Cargo Records...</p>
              </div>
            ) : !markaQuery.trim() ? (
              <div className="bg-white rounded-2xl shadow-xs border border-dashed border-slate-300 p-12 text-center">
                <div className="w-12 h-12 bg-purple-50 text-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Tag className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Enter a Shipping Mark (Marka) Above</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Type a marka or click any suggested chip to retrieve all shipments for that marka across containers and warehouses.
                </p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center text-slate-500 text-xs">
                No shipments found matching Marka &quot;{markaQuery}&quot;.
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto max-h-[75vh] scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    <thead className="sticky top-0 z-20 bg-[#0f5132] text-white font-semibold text-[11px] tracking-wide uppercase shadow-sm">
                      <tr>
                        <th className="py-2.5 px-2 border-r border-emerald-800 text-center w-10">#</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Receipt No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Warehouse</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Container No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Loading Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap bg-[#0d452b] text-emerald-200">
                          ETA
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap bg-purple-950 text-purple-200 font-bold">
                          Marks (Marka)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 min-w-[160px]">Item Name</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">CBM</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">Weight (KG)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap font-bold">CTN</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Rate (🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                          Sales Person (🔒)
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap text-center">Status</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-slate-300 bg-[#0d452b]">Remarks (🔒)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredReceipts.map((row, idx) => (
                        <tr
                          key={row.receipt}
                          className={`transition hover:bg-emerald-50/40 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                          }`}
                        >
                          <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px] bg-slate-100/50">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {row.receipt}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-800 font-medium whitespace-nowrap">
                            {row.warehouse}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {row.container || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                            {row.loadingDate || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono text-emerald-700 font-bold whitespace-nowrap">
                            {row.eta || 'Pending'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-black text-purple-900 whitespace-nowrap bg-purple-50/40">
                            {row.mainMarka || row.subMarka || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-800 min-w-[160px]">
                            {row.commodity || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {row.volume || '0'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap">
                            {row.weight || '0'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {row.quantity || 0}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-700 whitespace-nowrap bg-slate-50/50">
                            {row.rate ? `₹${row.rate}` : '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap bg-slate-50/50">
                            {row.salesPerson || '—'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              {row.salesStatus || row.status || 'Pending'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600 text-xs min-w-[140px] bg-slate-50/50">
                            {row.salesRemarks || row.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PUBLIC LINK RECEIPT LOOKUP & CUSTOMER QUERIES                     */}
        {/* ========================================================================= */}
        {activeTab === 'public_queries' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Sub-navigation bar */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPublicQuerySubTab('lookup')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    publicQuerySubTab === 'lookup'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Query Receipt by Public Link</span>
                </button>
                <button
                  onClick={() => setPublicQuerySubTab('manager')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    publicQuerySubTab === 'manager'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Customer Questions Feed ({pendingQueriesCount} Pending)</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 flex items-center space-x-1">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>
                  Query any receipt to get its customer public link, live status, and party inquiries.
                </span>
              </div>
            </div>

            {publicQuerySubTab === 'manager' ? (
              <CustomerQueriesManager currentUser={currentUser} standalone={true} />
            ) : (
              <div className="space-y-4">
                {/* Search Bar Card */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold">
                      <ExternalLink className="w-5 h-5 text-cyan-700" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">
                        Query Receipt Public Tracking Link
                      </h2>
                      <p className="text-xs text-slate-500">
                        Enter any receipt number to check its public tracking link, customer-visible details, and messages.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleLookupReceipt} className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={receiptLookupQuery}
                        onChange={(e) => setReceiptLookupQuery(e.target.value)}
                        placeholder="Enter Receipt No. (e.g. 1001, 2045, or exact receipt code)..."
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={lookupLoading || !receiptLookupQuery.trim()}
                      className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 shrink-0 cursor-pointer"
                    >
                      <Search className={`w-3.5 h-3.5 ${lookupLoading ? 'animate-spin' : ''}`} />
                      <span>{lookupLoading ? 'Querying...' : 'Ask Public Link'}</span>
                    </button>
                  </form>

                  {lookupError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>{lookupError}</span>
                    </div>
                  )}
                </div>

                {/* Lookup Result Display */}
                {lookupResult && (
                  <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4 animate-in fade-in">
                    {lookupResult.found ? (
                      <div className="space-y-4">
                        {/* Status Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-emerald-950 flex items-center space-x-2">
                                <span>Public Tracking Link Active</span>
                                <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-mono text-[10px]">
                                  Token: {lookupResult.token}
                                </span>
                              </div>
                              <div className="text-[11px] text-emerald-800">
                                Allocated Party / Link Name: <strong>{lookupResult.name || 'Universal Link'}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Link Actions */}
                          <div className="flex items-center space-x-2 shrink-0">
                            <button
                              onClick={() => {
                                const fullUrl = `${window.location.origin}/track/${lookupResult.token}`;
                                navigator.clipboard.writeText(fullUrl);
                                setCopiedLink(true);
                                showToast('Public link copied to clipboard!');
                                setTimeout(() => setCopiedLink(false), 2500);
                              }}
                              className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition"
                            >
                              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedLink ? 'Copied Link' : 'Copy Public Link'}</span>
                            </button>

                            <Link
                              href={`/track/${lookupResult.token}`}
                              target="_blank"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Live Public View</span>
                            </Link>
                          </div>
                        </div>

                        {/* Public Link Cargo Card Details */}
                        <div>
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                            What the Customer Sees on the Public Link:
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Receipt Number</span>
                              <span className="font-mono font-black text-slate-900 text-sm">
                                {lookupResult.matchedReceipt?.receiptNo || receiptLookupQuery}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Public Status</span>
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {lookupResult.matchedReceipt?.status || 'In Transit'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Container No.</span>
                              <span className="font-mono font-bold text-blue-700">
                                {lookupResult.matchedReceipt?.containerNo || 'USI-Pending'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Estimated Arrival (ETA)</span>
                              <span className="font-mono font-bold text-orange-700">
                                {lookupResult.matchedReceipt?.eta || 'Pending'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Marka (Mark)</span>
                              <span className="font-bold text-slate-800">
                                {lookupResult.matchedReceipt?.marka || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Cartons (CTN)</span>
                              <span className="font-mono font-bold text-slate-900">
                                {lookupResult.matchedReceipt?.ctn || '0'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Volume (CBM)</span>
                              <span className="font-mono font-bold text-slate-900">
                                {lookupResult.matchedReceipt?.cbm || '0'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold">Weight (KG)</span>
                              <span className="font-mono font-bold text-slate-900">
                                {lookupResult.matchedReceipt?.weight || '0'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Customer Questions specifically for this receipt */}
                        <div className="pt-2">
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Questions / Inquiries Asked for this Receipt:</span>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">
                              {lookupResult.customerQueries?.length || 0} Inquiries
                            </span>
                          </h3>

                          {lookupResult.customerQueries?.length === 0 ? (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                              No customer queries or questions asked for this receipt yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {lookupResult.customerQueries.map((q: any) => (
                                <div
                                  key={q._id || q.id}
                                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-slate-900">
                                        {q.senderName || 'Customer'}
                                      </span>
                                      {q.senderPhone && (
                                        <span className="text-[11px] text-slate-500 font-mono">
                                          ({q.senderPhone})
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        q.status === 'Answered'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {q.status}
                                    </span>
                                  </div>
                                  <p className="text-slate-800 font-medium bg-white p-2.5 rounded-lg border border-slate-200">
                                    &ldquo;{q.message}&rdquo;
                                  </p>
                                  {q.reply && (
                                    <div className="text-[11px] text-emerald-900 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                                      <strong>Reply:</strong> {q.reply}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-center py-6">
                        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                          <HelpCircle className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          No Public Link Found for Receipt #{receiptLookupQuery}
                        </h3>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          {lookupResult.message || 'This receipt has not been added to any customer public tracking link yet.'}
                        </p>
                        <div className="pt-2">
                          <Link
                            href="/admin/tracking-links"
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 transition"
                          >
                            <span>Manage Public Tracking Links</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: CONTAINER REMARKS HISTORY MODAL                                  */}
      {/* ========================================================================= */}
      {remarksModalContainer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-xl w-full overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Ship className="w-5 h-5 text-orange-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    Container Status & Remarks History: {remarksModalContainer.container}
                  </h3>
                  <div className="text-[10px] text-slate-400">
                    Carrier No: {remarksModalContainer.containerNumber || '—'} | Status: {remarksModalContainer.status}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRemarksModalContainer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content: Chronological Remarks List */}
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
              {remarksModalContainer.remarks && remarksModalContainer.remarks.length > 0 ? (
                remarksModalContainer.remarks.map((r: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span className="font-bold text-slate-800">Date: {r.date}</span>
                      <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px]">
                        Recorded by: {r.createdBy || 'Admin'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 bg-white p-2 rounded-lg border border-slate-200 leading-relaxed">
                      {r.remarks}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 py-6">
                  No previous remarks found for this container.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-3 flex justify-end border-t border-slate-200">
              <button
                onClick={() => setRemarksModalContainer(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SINGLE CONTAINER DRILLDOWN CARGO SHEET                           */}
      {/* ========================================================================= */}
      {drilldownContainer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-bold">
                  <Boxes className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm flex items-center space-x-2">
                    <span>Container Cargo Sheet: {drilldownContainer}</span>
                    <span className="text-[10px] bg-slate-800 text-orange-400 font-mono px-2 py-0.5 rounded">
                      View-Only 🔒
                    </span>
                  </h3>
                  <div className="text-[10px] text-slate-400">
                    Inspecting all inward shipments packed inside this container
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDrilldownContainer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {drilldownLoading ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-7 h-7 text-orange-500 animate-spin mx-auto mb-2" />
                  <span>Loading Container Shipments...</span>
                </div>
              ) : !drilldownData || drilldownData.items.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  No shipments found packed in container {drilldownContainer}.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span>
                      Total Packed Items: <strong>{drilldownData.totalItems}</strong>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Operations Head Access — Data strictly read-only
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#0f5132] text-white font-semibold text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="py-2.5 px-2 border-r border-emerald-800 text-center w-8">#</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Receipt No.</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Date</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Warehouse</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap">Marks (Marka)</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 min-w-[140px]">Item Name</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">CTN</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">Weight (KG)</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 text-right whitespace-nowrap">CBM</th>
                          <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] text-slate-300 whitespace-nowrap">
                            Rate (🔒)
                          </th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {drilldownData.items.map((it: any) => (
                          <tr key={it.receipt + it.idx} className="hover:bg-slate-50">
                            <td className="py-2 px-2 border-r border-slate-200 text-center font-mono text-[10px] text-slate-400">
                              {it.idx}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {it.receipt}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-600 whitespace-nowrap font-mono">
                              {it.date}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800 whitespace-nowrap">
                              {it.warehouse}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                              {it.mainMarka || it.subMarka || it.party || '—'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800 min-w-[140px]">
                              {it.commodity}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {it.quantity}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-700 whitespace-nowrap">
                              {it.weight}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {it.volume}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-600 whitespace-nowrap bg-slate-50/50">
                              {it.rate ? `₹${it.rate}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                                {it.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-3 flex justify-end border-t border-slate-200 shrink-0">
              <button
                onClick={() => setDrilldownContainer(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition"
              >
                Close Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: LOGOUT CONFIRMATION                                              */}
      {/* ========================================================================= */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto bg-red-950/60 border border-red-700 text-red-400 rounded-xl flex items-center justify-center">
              <LogOut className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-base font-bold text-white">Confirm Logout</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to log out from the Operations Head Portal?
            </p>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                Logout Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
