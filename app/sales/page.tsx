'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Users,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  Download,
  AlertTriangle,
  MessageSquare,
  Truck,
  PauseCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Warehouse,
  Boxes,
  Lock,
  Save,
  Check,
  ChevronDown,
  Info,
  Clock,
  Sparkles,
  Bell,
  X,
  Tag,
} from 'lucide-react';
import SalesWhatsAppChat from '@/components/SalesWhatsAppChat';
import SalesDiscrepancyModal from '@/components/SalesDiscrepancyModal';
import SalesHoldModal from '@/components/SalesHoldModal';
import SalesTeamMaster from '@/components/SalesTeamMaster';
import SalesDatePickerCalendar from '@/components/SalesDatePickerCalendar';
import SearchableContainerSelect from '@/components/SearchableContainerSelect';
import SalesExceptionReport from '@/components/SalesExceptionReport';
import { parseMetricNumber } from '@/lib/metricUtils';
import { clearMobileSession } from '@/lib/mobileBridge';

export default function SalesPortalPage() {
  const router = useRouter();

  // Current User Session State
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    role: string;
    name?: string;
  } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Active Tab: 'sheet' | 'team' | 'mismatch'
  const [activeTab, setActiveTab] = useState<'sheet' | 'team' | 'mismatch'>('sheet');
  const [mismatchBadgeCount, setMismatchBadgeCount] = useState<number>(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Filter & Selection Bar State (NO PRELOAD)
  const [mode, setMode] = useState<'warehouse_date' | 'container' | 'marka'>('warehouse_date');
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
  const [markaQuery, setMarkaQuery] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('ALL');

  // Options from backend
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [salesTeam, setSalesTeam] = useState<any[]>([]);
  const [markas, setMarkas] = useState<string[]>([]);
  const [containerSearch, setContainerSearch] = useState('');
  const [containerViewMode, setContainerViewMode] = useState<'directory' | 'sheet'>('directory');
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Grid Data (Loaded On Demand ONLY)
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Notifications State (Receipt-wise on login)
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Inline Edits Tracking
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [savedSuccessCells, setSavedSuccessCells] = useState<Record<string, boolean>>({});

  // Modals State
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatReceiptNo, setChatReceiptNo] = useState<string | undefined>(undefined);
  const [chatContainerNo, setChatContainerNo] = useState<string | undefined>(undefined);
  const [chatPartnerName, setChatPartnerName] = useState<string | undefined>(undefined);

  const [discrepancyModalOpen, setDiscrepancyModalOpen] = useState(false);
  const [discrepancyTarget, setDiscrepancyTarget] = useState<any | null>(null);

  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [holdTarget, setHoldTarget] = useState<any | null>(null);

  // Close notifications on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check auth session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            // STRICT POLICY: Sales Head can ONLY be accessed by Developer Admin or Sales Head/Executive!
            // Super Admin ('admin') CANNOT access Sales Head!
            if (data.role === 'admin' || (!['developer', 'sales_head', 'sales_person'].includes(data.role))) {
              setAccessDenied(true);
              setAuthChecking(false);
              return;
            }
            setCurrentUser({
              username: data.username || 'sales_user',
              role: data.role || 'sales_head',
              name: data.name || data.username || 'Sales Head',
            });
          } else {
            router.push('/sales/login');
            return;
          }
        } else {
          router.push('/sales/login');
          return;
        }
      } catch (e) {
        console.error('Auth check error:', e);
      } finally {
        setAuthChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  // Fetch notifications on login (receipt-wise communications)
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/sales/notifications');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        setUnreadCount(data.totalUnread || 0);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live count of discrepancies for Sales Head Exception Report badge
  const fetchMismatchBadge = async () => {
    try {
      const res = await fetch('/api/sales/exception-report');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.summary) {
          setMismatchBadgeCount(data.summary.totalMismatches || 0);
        }
      }
    } catch (e) {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchMismatchBadge();
    const interval = setInterval(fetchMismatchBadge, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load lightweight dropdown options on mount
  const fetchOptions = async (whs?: string[]) => {
    try {
      setLoadingOptions(true);
      const whParam = whs && whs.length > 0 ? `?warehouse=${encodeURIComponent(whs.join(','))}` : '';
      const res = await fetch(`/api/sales/options${whParam}`);
      const data = await res.json();
      if (data.success) {
        if (!whs || whs.length === 0) {
          setWarehouses(data.warehouses || []);
          if (data.warehouses && data.warehouses.length > 0 && selectedWarehouses.length === 0) {
            setSelectedWarehouses([data.warehouses[0]]);
          }
        }
        setDates(data.dates || []);
        setContainers(data.containers || []);
        if (data.markas) setMarkas(data.markas || []);
        setSalesTeam(data.salesTeam || []);
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

  // LOAD DATA ON-DEMAND (Never preloaded)
  const executeLoadData = async (
    customMode?: 'warehouse_date' | 'container' | 'marka',
    customDates?: string[],
    customContainers?: string[],
    customMarka?: string
  ) => {
    const activeM = customMode || mode;
    const activeDates = customDates !== undefined ? customDates : selectedDates;
    const activeContainers = customContainers !== undefined ? customContainers : selectedContainers;
    const activeMarka = customMarka !== undefined ? customMarka : markaQuery;

    if (activeM === 'warehouse_date' && (selectedWarehouses.length === 0 || activeDates.length === 0)) {
      return;
    }
    if (activeM === 'container' && activeContainers.length === 0) {
      return;
    }
    if (activeM === 'marka' && !activeMarka.trim()) {
      return;
    }

    setLoadingData(true);
    try {
      let url = `/api/sales/receipts?mode=${activeM}`;
      if (activeM === 'warehouse_date') {
        url += `&warehouses=${encodeURIComponent(selectedWarehouses.join(','))}&dates=${encodeURIComponent(activeDates.join(','))}`;
      } else if (activeM === 'container') {
        url += `&containers=${encodeURIComponent(activeContainers.join(','))}`;
      } else if (activeM === 'marka') {
        url += `&marka=${encodeURIComponent(activeMarka.trim())}`;
      }

      if (salesPersonFilter && salesPersonFilter !== 'ALL') {
        url += `&salesPerson=${encodeURIComponent(salesPersonFilter)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.receipts)) {
        setReceipts(data.receipts);
        setHasLoadedOnce(true);
      }
    } catch (e) {
      console.error('Failed to load receipts:', e);
    } finally {
      setLoadingData(false);
    }
  };

  // Auto-load triggers when user selects dates or containers
  const handleDatesChange = (newDates: string[]) => {
    setSelectedDates(newDates);
    if (newDates.length > 0 && selectedWarehouses.length > 0) {
      executeLoadData('warehouse_date', newDates, undefined, undefined);
    }
  };

  const handleContainersChange = (newContainers: string[]) => {
    setSelectedContainers(newContainers);
    if (newContainers.length > 0) {
      setContainerViewMode('sheet');
      executeLoadData('container', undefined, newContainers, undefined);
    } else {
      setReceipts([]);
      setHasLoadedOnce(false);
      setContainerViewMode('directory');
    }
  };

  const handleSelectContainerRow = (cName: string) => {
    const isSelected = selectedContainers.includes(cName);
    let next: string[];
    if (isSelected) {
      next = selectedContainers.filter((c) => c !== cName);
    } else {
      next = [...selectedContainers, cName];
    }
    handleContainersChange(next);
  };

  const handleOpenSingleContainer = (cName: string) => {
    handleContainersChange([cName]);
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
      executeLoadData('marka', undefined, undefined, nextQuery);
    } else {
      setReceipts([]);
      setHasLoadedOnce(false);
    }
  };

  // Save Inline Field (Rate, SalesPerson, Remarks)
  const handleCellSave = async (receiptNo: string, warehouseName: string, field: string, value: any) => {
    const cellKey = `${receiptNo}_${field}`;
    setSavingCells((prev) => ({ ...prev, [cellKey]: true }));

    try {
      const payload: Record<string, any> = {
        receipt: receiptNo,
        warehouse: warehouseName,
      };

      if (field === 'rate') payload.rate = value;
      if (field === 'remarks') payload.remarks = value;
      if (field === 'salesPerson') {
        payload.salesPerson = value;
        const matched = salesTeam.find((m) => m.name === value || m.username === value);
        if (matched) {
          payload.salesPersonUsername = matched.username;
        }
      }

      const res = await fetch('/api/sales/receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setReceipts((prev) =>
          prev.map((r) => {
            if (r.receipt === receiptNo) {
              const updated = { ...r };
              if (field === 'rate') updated.rate = value;
              if (field === 'remarks') updated.salesRemarks = value;
              if (field === 'salesPerson') {
                updated.salesPerson = value;
                if (payload.salesPersonUsername) updated.salesPersonUsername = payload.salesPersonUsername;
              }
              return updated;
            }
            return r;
          })
        );
        setSavedSuccessCells((prev) => ({ ...prev, [cellKey]: true }));
        setTimeout(() => {
          setSavedSuccessCells((prev) => ({ ...prev, [cellKey]: false }));
        }, 2000);
      }
    } catch (e) {
      console.error('Failed to save cell:', e);
    } finally {
      setSavingCells((prev) => ({ ...prev, [cellKey]: false }));
    }
  };

  // Confirmed Logout Handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    try {
      await clearMobileSession();
    } catch (e) {
      console.error('Clear mobile session error:', e);
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('user_logged_out', 'true');
        const past = 'Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = `admin_token=; path=/; expires=${past}; max-age=0; SameSite=Lax`;
        document.cookie = `admin_token=; path=/; expires=${past}; max-age=0`;
      } catch (err) {}
    }
    setShowLogoutConfirm(false);
    window.location.href = '/sales/login?logged_out=true';
  };

  // Excel Export
  const handleExportExcel = () => {
    if (receipts.length === 0) return;

    const exportRows = receipts.map((r, i) => ({
      '#': i + 1,
      'Receipt No.': r.receipt,
      'Receipt Date': r.date,
      'Warehouse': r.warehouse,
      'Container No.': r.container || 'Not Loaded',
      'Container Carrier No.': r.containerNumber || '',
      'Date of Loading': r.loadingDate || '',
      'ETA': r.eta || 'Pending',
      'Main Marka': r.mainMarka || '',
      'Sub Marka': r.subMarka || '',
      'Item Name': r.commodity || '',
      'CBM': r.volume || '',
      'Weight (KG)': r.weight || '',
      'KGS/CBM': (() => {
        const w = parseMetricNumber(r.weight);
        const v = parseMetricNumber(r.volume);
        if (v <= 0 || w <= 0) return '—';
        const ratio = w / v;
        return ratio > 200 ? `${ratio.toFixed(2)} [HEAVY]` : ratio.toFixed(2);
      })(),
      'Heavy Item (>200)': (() => {
        const w = parseMetricNumber(r.weight);
        const v = parseMetricNumber(r.volume);
        return v > 0 && w / v > 200 ? 'YES (HEAVY)' : 'NO';
      })(),
      'CTN': r.quantity || 0,
      'Rate': r.rate || '',
      'Sales Person': r.salesPerson || '',
      'Sales Remarks': r.salesRemarks || '',
      'Sales Status': r.salesStatus || 'Normal',
      'Hold Reason': r.holdReason || '',
      'Discrepancy': r.salesDiscrepancy?.hasDiscrepancy ? 'Yes' : 'No',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Sheet');
    XLSX.writeFile(wb, `Sales_Cargo_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filtered rows by search query
  const filteredReceipts = useMemo(() => {
    if (!searchQuery.trim()) return receipts;
    const q = searchQuery.toLowerCase().trim();
    return receipts.filter((r) => {
      return (
        (r.receipt || '').toLowerCase().includes(q) ||
        (r.commodity || '').toLowerCase().includes(q) ||
        (r.mainMarka || '').toLowerCase().includes(q) ||
        (r.subMarka || '').toLowerCase().includes(q) ||
        (r.container || '').toLowerCase().includes(q) ||
        (r.containerNumber || '').toLowerCase().includes(q) ||
        (r.salesPerson || '').toLowerCase().includes(q) ||
        (r.salesRemarks || '').toLowerCase().includes(q) ||
        (r.rate || '').toLowerCase().includes(q)
      );
    });
  }, [receipts, searchQuery]);

  // Filtered containers for Directory Table
  const filteredContainers = useMemo(() => {
    if (!containerSearch.trim()) return containers;
    const q = containerSearch.toLowerCase().trim();
    return containers.filter((c) => {
      return (
        (c.container || '').toLowerCase().includes(q) ||
        (c.containerNumber || '').toLowerCase().includes(q) ||
        (c.eta || '').toLowerCase().includes(q) ||
        (c.loadingDate || '').toLowerCase().includes(q) ||
        (c.portName || '').toLowerCase().includes(q) ||
        (c.portDate || '').toLowerCase().includes(q) ||
        (c.lastUpdate || '').toLowerCase().includes(q) ||
        (c.warehouse || '').toLowerCase().includes(q) ||
        (c.planStatus || '').toLowerCase().includes(q)
      );
    });
  }, [containers, containerSearch]);

  // Aggregated Summary Counters
  const summary = useMemo(() => {
    let totalCtn = 0;
    let totalCbm = 0;
    let totalWeight = 0;
    let holdCount = 0;
    let availableCount = 0;
    let heavyCount = 0;

    receipts.forEach((r) => {
      totalCtn += Number(r.quantity) || 0;
      const cbmVal = parseMetricNumber(r.volume);
      const wtVal = parseMetricNumber(r.weight);
      totalCbm += cbmVal;
      totalWeight += wtVal;
      if (cbmVal > 0 && wtVal / cbmVal > 200) heavyCount++;
      if (r.salesStatus === 'Hold') holdCount++;
      if (r.salesStatus === 'Available to Deliver') availableCount++;
    });

    const avgKgsPerCbm = totalCbm > 0 && totalWeight > 0 ? (totalWeight / totalCbm).toFixed(1) : '0';

    return {
      totalReceipts: receipts.length,
      totalCtn,
      totalCbm: totalCbm.toFixed(3),
      totalWeight: totalWeight.toFixed(1),
      avgKgsPerCbm,
      heavyCount,
      holdCount,
      availableCount,
    };
  }, [receipts]);

  // STRICT POLICY: Only Sales Head and Developer Admin can perform administrative sales tasks.
  // Super Admin ('admin') CANNOT access Sales Head!
  const isSalesHeadOrDev =
    currentUser?.role === 'sales_head' ||
    currentUser?.role === 'developer';

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-800/80 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 mx-auto bg-red-950/60 border border-red-700 text-red-400 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-white">अनाधिकृत प्रवेश (Access Restricted)</h2>
          <p className="text-xs text-red-300 leading-relaxed">
            सेल्स हेड पोर्टल सिर्फ और सिर्फ <strong>डेवलपर एडमिन (Developer Admin)</strong> या अधिकृत <strong>सेल्स हेड</strong> द्वारा ही एक्सेस किया जा सकता है।
          </p>
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">सुपर एडमिन एक्सेस पॉलिसी:</p>
            <p>सुपर एडमिन केवल <strong>एम्प्लॉई व्यू</strong>, <strong>डिस्पैचर</strong>, और <strong>बिलर</strong> एक्सेस कर सकता है।</p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
            >
              <LogOut className="w-4 h-4" />
              <span>लॉगआउट करें (Logout & Switch Account)</span>
            </button>
            <Link
              href="/admin"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
            >
              ← वापस एडमिन पोर्टल
            </Link>
            <Link
              href="/dispatcher"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold transition"
            >
              डिस्पैचर पोर्टल
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col text-slate-800 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Application Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-4 py-2.5 shadow-md sticky top-0 z-40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-sm tracking-wide text-white">
                  US International Logistics — Sales Portal
                </h1>
                <span className="text-[10px] bg-emerald-700 text-white font-mono uppercase px-2 py-0.5 rounded-full font-bold tracking-wider">
                  {currentUser?.role === 'sales_head'
                    ? 'Sales Head'
                    : currentUser?.role === 'sales_person'
                    ? 'Sales Executive'
                    : currentUser?.role || 'Admin'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 hidden sm:block">
                China Inward Cargo, Rate Sheet, Hold & Two-Way Live Communications
              </div>
            </div>
          </div>

          {/* Tab Switcher, Notification Bell, User Profile & Always-Visible Solid Logout */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3 ml-auto">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition relative"
                title="Recent Receipt Communications & Remarks"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-300 text-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                  <div className="bg-slate-900 text-white p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Bell className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-xs">Recent Communications & Remarks</span>
                    </div>
                    <span className="text-[10px] bg-emerald-700 px-1.5 py-0.5 rounded font-mono">
                      Receipt-Wise
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1 text-xs">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        No communications yet. Start a chat on any receipt.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.receiptNo}
                          onClick={() => {
                            setChatReceiptNo(n.receiptNo);
                            setChatContainerNo(n.container);
                            setChatPartnerName(n.senderName);
                            setChatModalOpen(true);
                            setShowNotifications(false);
                          }}
                          className={`p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition flex flex-col space-y-1 ${
                            n.unreadCount > 0 ? 'bg-emerald-50/60' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-emerald-800">
                              Receipt #{n.receiptNo}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-700 text-xs truncate font-medium">
                            <strong className="text-slate-900">{n.senderName}:</strong> {n.latestMessage}
                          </p>
                          {n.container && (
                            <div className="text-[10px] text-slate-500">Container: {n.container}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {isSalesHeadOrDev && (
              <div className="bg-slate-800 p-0.5 rounded-lg flex items-center border border-slate-700 text-xs shrink-0 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('sheet')}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 shrink-0 ${
                    activeTab === 'sheet'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Working Sheet</span>
                </button>
                <button
                  onClick={() => setActiveTab('team')}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 shrink-0 ${
                    activeTab === 'team'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Team Master</span>
                </button>
                <button
                  onClick={() => setActiveTab('mismatch')}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 shrink-0 ${
                    activeTab === 'mismatch'
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'text-amber-400 hover:text-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                  <span>Exception Report</span>
                  {mismatchBadgeCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-rose-600 text-white text-[10px] rounded-full font-bold">
                      {mismatchBadgeCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Quick link back to Admin if Developer */}
            {currentUser?.role === 'developer' && (
              <Link
                href="/admin"
                className="text-xs text-slate-300 hover:text-white px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition shrink-0"
              >
                Admin Dashboard
              </Link>
            )}

            {/* User Profile Pill */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs shrink-0">
              <div className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-bold text-[11px]">
                {(currentUser?.name || currentUser?.username || 'U')[0].toUpperCase()}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-slate-200 font-semibold leading-tight text-[11px] truncate max-w-[110px]">
                  {currentUser?.name || currentUser?.username}
                </span>
                <span className="text-[9px] text-emerald-400 font-mono">
                  {currentUser?.role === 'sales_head'
                    ? 'Sales Head'
                    : currentUser?.role === 'developer'
                    ? 'Developer Admin'
                    : 'Sales Executive'}
                </span>
              </div>
            </div>

            {/* SOLID HIGH-PROMINENCE RED LOGOUT BUTTON */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold border border-red-500 rounded-lg text-xs transition flex items-center space-x-1.5 shadow-md shrink-0 cursor-pointer"
              title="सेल्स पोर्टल से लॉगआउट करें (Logout from Sales Portal)"
            >
              <LogOut className="w-3.5 h-3.5 text-white" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto">
        {activeTab === 'team' && isSalesHeadOrDev ? (
          <SalesTeamMaster />
        ) : activeTab === 'mismatch' && isSalesHeadOrDev ? (
          <SalesExceptionReport currentUser={currentUser} />
        ) : (
          <div className="space-y-4">
            {/* GOOGLE SHEET TOOLBAR & MULTI-SELECT ON-DEMAND BAR */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
              {/* Mode Toggle & Description */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Load Cargo By:
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100 text-xs">
                    <button
                      onClick={() => setMode('warehouse_date')}
                      className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center space-x-1.5 ${
                        mode === 'warehouse_date'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Warehouse className="w-3.5 h-3.5" />
                      <span>Warehouse & Date(s)</span>
                    </button>
                    <button
                      onClick={() => setMode('container')}
                      className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center space-x-1.5 ${
                        mode === 'container'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>Container(s) Multi-Select</span>
                    </button>
                    <button
                      onClick={() => setMode('marka')}
                      className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center space-x-1.5 ${
                        mode === 'marka'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>Marka Search</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-500 flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    डेटा पहले से लोड नहीं होगा। सेलेक्ट करते ही ऑटोमैटिक लोड होगा ताकि पेज फास्ट रहे।
                  </span>
                </div>
              </div>

              {/* Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                {mode === 'warehouse_date' ? (
                  <>
                    {/* Warehouse Selector (Multi-Select Chips) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          Select Warehouse(s) *
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {selectedWarehouses.length} Active
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 p-1 bg-slate-50 border border-slate-300 rounded-lg min-h-[34px] items-center">
                        <button
                          type="button"
                          onClick={() => handleWarehouseToggle('ALL')}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                            selectedWarehouses.includes('ALL')
                              ? 'bg-emerald-700 text-white shadow-2xs'
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
                              className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                                isSel
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {w}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Calendar Date Picker (Green = Entry Available, Gray = No Entry) */}
                    <div className="lg:col-span-2">
                      <SalesDatePickerCalendar
                        selectedDates={selectedDates}
                        onChangeDates={handleDatesChange}
                        availableDates={dates}
                        warehouseName={selectedWarehouses.join(', ')}
                      />
                    </div>
                  </>
                ) : mode === 'container' ? (
                  <>
                    {/* Type-Searchable Multi-Container Selector */}
                    <div className="lg:col-span-3">
                      <SearchableContainerSelect
                        containers={containers}
                        selectedContainers={selectedContainers}
                        onChangeContainers={handleContainersChange}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Marka Search Mode */}
                    <div className="lg:col-span-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Search by Marka (Main Marka / Sub Marka) *
                        </label>
                        {markaQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setMarkaQuery('');
                              setReceipts([]);
                              setHasLoadedOnce(false);
                            }}
                            className="text-[10px] text-rose-600 hover:underline font-semibold"
                          >
                            Clear Query
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Tag className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={markaQuery}
                          onChange={(e) => setMarkaQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              executeLoadData('marka', undefined, undefined, markaQuery);
                            }
                          }}
                          placeholder="Type or click marks below (e.g. SMA, GTG26115, AS-14)..."
                          className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>

                      {/* Interactive Marka List Suggestions (Multi-marka query) */}
                      {markas.length > 0 && (
                        <div className="pt-0.5">
                          <div className="text-[10px] text-slate-500 font-semibold mb-1 flex items-center justify-between">
                            <span>Available Marks ({markas.length}) — Click to add/remove multiple marks:</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg scrollbar-thin">
                            {markas
                              .filter(
                                (m) =>
                                  !markaQuery ||
                                  m.toLowerCase().includes(markaQuery.toLowerCase().trim().split(',').pop()?.trim() || '')
                              )
                              .slice(0, 30)
                              .map((m) => {
                                const isSel = markaQuery
                                  .split(/[,+]/)
                                  .map((s) => s.trim().toLowerCase())
                                  .includes(m.toLowerCase());
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => handleToggleMarka(m)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition flex items-center space-x-1 ${
                                      isSel
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300'
                                    }`}
                                  >
                                    <span>{m}</span>
                                    {isSel && <Check className="w-2.5 h-2.5" />}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Sales Person Filter (for Sales Head & Developer) */}
                {isSalesHeadOrDev && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Filter by Sales Person
                    </label>
                    <select
                      value={salesPersonFilter}
                      onChange={(e) => {
                        setSalesPersonFilter(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="ALL">All Sales Persons</option>
                      {salesTeam.map((sp) => (
                        <option key={sp.username} value={sp.name || sp.username}>
                          {sp.name || sp.username}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* LOAD DATA / REFRESH BUTTON */}
                <div>
                  <button
                    onClick={() => executeLoadData()}
                    disabled={loadingData}
                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                    <span>{loadingData ? 'Loading...' : '⚡ Load Data'}</span>
                  </button>
                </div>
              </div>

              {/* Quick Search within Loaded Data Bar */}
              {hasLoadedOnce && receipts.length > 0 && (
                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-slate-900">
                      Loaded Receipts: <strong className="text-emerald-700">{summary.totalReceipts}</strong>
                    </span>
                    <span>|</span>
                    <span>
                      Total CTN: <strong>{summary.totalCtn}</strong>
                    </span>
                    <span>|</span>
                    <span>
                      Total CBM: <strong>{summary.totalCbm} m³</strong>
                    </span>
                    <span>|</span>
                    <span>
                      Total Wt: <strong>{summary.totalWeight} KG</strong>
                    </span>
                    <span>|</span>
                    <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Avg KGS/CBM: <strong className="text-amber-900">{summary.avgKgsPerCbm}</strong>
                    </span>
                    <span>|</span>
                    <span className="text-emerald-700 font-semibold">
                      Available: {summary.availableCount}
                    </span>
                    <span>|</span>
                    <span className="text-rose-700 font-semibold">
                      On Hold: {summary.holdCount}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Type-search in sheet..."
                        className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={handleExportExcel}
                      className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-semibold text-slate-700 flex items-center space-x-1 shadow-2xs transition"
                      title="Download as Excel Sheet"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CONTAINER DIRECTORY TABLE (Shown when in Container mode and either Directory view is chosen OR no container selected yet) */}
            {mode === 'container' && (containerViewMode === 'directory' || selectedContainers.length === 0) ? (
              <div className="bg-white rounded-xl shadow-xs border border-slate-300 overflow-hidden space-y-3 p-4 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Boxes className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                        <span>Sales Head Container Directory (कंटेनर लिस्ट)</span>
                        <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">
                          {containers.length} Containers
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        कंटेनर पर क्लिक करते ही उसकी वर्किंग शीट लोड होगी। चेकबॉक्स से एक से अधिक कंटेनर भी खोल सकते हैं।
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={containerSearch}
                        onChange={(e) => setContainerSearch(e.target.value)}
                        placeholder="Search Container, Carrier No, ETA, Port..."
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    {selectedContainers.length > 0 && (
                      <button
                        onClick={() => {
                          setContainerViewMode('sheet');
                          executeLoadData('container', undefined, selectedContainers, undefined);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center space-x-1.5 shrink-0"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Open Selected Sheet ({selectedContainers.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[66vh] scrollbar-thin border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    <thead className="sticky top-0 z-10 bg-slate-900 text-white font-semibold text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 border-r border-slate-800 text-center w-12">Select</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">CONTAINER NO.</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">ACTUAL CONTAINER</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">ETA</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">LOADING DATE</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">PORT NAME</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">PORT DATE</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 whitespace-nowrap">LAST UPDATE</th>
                        <th className="py-2.5 px-3 border-r border-slate-800 text-right whitespace-nowrap">TOTAL CTN</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredContainers.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500 text-xs">
                            No containers found matching &quot;{containerSearch}&quot;.
                          </td>
                        </tr>
                      ) : (
                        filteredContainers.map((c, idx) => {
                          const isSelected = selectedContainers.includes(c.container);
                          return (
                            <tr
                              key={c.container}
                              onClick={() => handleOpenSingleContainer(c.container)}
                              className={`cursor-pointer transition hover:bg-emerald-50/70 ${
                                isSelected
                                  ? 'bg-emerald-50/80 font-semibold'
                                  : idx % 2 === 0
                                  ? 'bg-white'
                                  : 'bg-slate-50/50'
                              }`}
                            >
                              <td
                                className="py-2 px-3 border-r border-slate-200 text-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectContainerRow(c.container);
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleSelectContainerRow(c.container)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                                />
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-emerald-800 whitespace-nowrap">
                                {c.container}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-700 whitespace-nowrap">
                                {c.containerNumber || '—'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono text-emerald-700 whitespace-nowrap font-bold">
                                {c.eta || 'Pending'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                                {c.loadingDate || '—'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-slate-800 whitespace-nowrap">
                                {c.portName || '—'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                                {c.portDate || '—'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                                {c.lastUpdate || '—'}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {c.totalQuantity || 0}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSingleContainer(c.container);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] shadow-2xs transition inline-flex items-center space-x-1"
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                  <span>Open Sheet</span>
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
            ) : !hasLoadedOnce ? (
              /* EMPTY STATE BANNER (NO DATA PRELOADED) */
              <div className="bg-white rounded-xl shadow-xs border border-dashed border-slate-300 p-12 text-center">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  No Data Preloaded (डेटा अभी लोड नहीं किया गया है)
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  कृपया ऊपर फ़िल्टर बार से वेयरहाउस और डेट (कैलेंडर से ग्रीन डेट) चुनें, या मार्का सर्च करें। सेलेक्ट करते ही आपका गूगल शीट डेटा ऑटोमैटिक लोड होगा।
                </p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-10 text-center text-slate-500 text-xs">
                No receipts found for the selected criteria.
              </div>
            ) : (
              /* GOOGLE SHEET TABLE */
              <div className="bg-white rounded-xl shadow-xs border border-slate-300 overflow-hidden space-y-2">
                {/* Active Container Sheet Toolbar if in Container Mode */}
                {mode === 'container' && selectedContainers.length > 0 && (
                  <div className="bg-emerald-50/80 border-b border-emerald-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-emerald-950">Active Container(s):</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedContainers.map((cName) => (
                          <span
                            key={cName}
                            className="bg-white text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-mono font-bold text-[11px] shadow-2xs"
                          >
                            {cName}
                          </span>
                        ))}
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        ({receipts.length} items loaded)
                      </span>
                    </div>

                    <button
                      onClick={() => setContainerViewMode('directory')}
                      className="px-3 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-semibold text-xs transition flex items-center space-x-1.5 shadow-2xs"
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>📋 View Container Fleet Directory</span>
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto max-h-[74vh] scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    {/* Sticky Table Header (Google Sheet Green Styling) */}
                    <thead className="sticky top-0 z-20 bg-[#0f5132] text-white font-semibold text-[11px] tracking-wide uppercase shadow-sm">
                      <tr>
                        <th className="py-2.5 px-2 border-r border-emerald-800 text-center w-10">#</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Receipt No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Receipt Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Warehouse</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Container No.</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Loading Date</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 whitespace-nowrap bg-[#0d452b] text-emerald-200">
                          ETA
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800">Marks (Marka)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 min-w-[160px]">Item Name</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right">CBM</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right">Weight (KG)</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right bg-[#0d452b] text-amber-300 font-bold whitespace-nowrap">
                          KGS/CBM
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-right">CTN</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] min-w-[110px]">
                          Rate (दर) {isSalesHeadOrDev ? '✏️' : '🔒'}
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] min-w-[140px]">
                          Sales Person 👤
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 bg-[#0d452b] min-w-[150px]">
                          Remarks (सेल्स हेड) 💬
                        </th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-center">Status</th>
                        <th className="py-2.5 px-3 border-r border-emerald-800 text-center">Discrepancy</th>
                        <th className="py-2.5 px-3 text-center">Chat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {filteredReceipts.map((row, idx) => {
                        const rowNum = idx + 1;
                        const isHold = row.salesStatus === 'Hold';
                        const isAvailable = row.salesStatus === 'Available to Deliver';
                        const hasDisc = row.salesDiscrepancy?.hasDiscrepancy;
                        const discStatus = row.salesDiscrepancy?.status || 'Pending';

                        const rateKey = `${row.receipt}_rate`;
                        const personKey = `${row.receipt}_salesPerson`;
                        const remarksKey = `${row.receipt}_remarks`;

                        return (
                          <tr
                            key={row.receipt}
                            className={`transition hover:bg-emerald-50/40 ${
                              isHold
                                ? 'bg-rose-50/50'
                                : isAvailable
                                ? 'bg-emerald-50/30'
                                : idx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50/50'
                            }`}
                          >
                            {/* Row Index */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px] bg-slate-100/50">
                              {rowNum}
                            </td>

                            {/* Receipt No */}
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {row.receipt}
                            </td>

                            {/* Receipt Date */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap">
                              {row.date || 'N/A'}
                            </td>

                            {/* Warehouse */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800 font-medium whitespace-nowrap">
                              {row.warehouse}
                            </td>

                            {/* Container No */}
                            <td className="py-2 px-3 border-r border-slate-200 whitespace-nowrap">
                              {row.container ? (
                                <span className="inline-flex items-center space-x-1 font-mono font-bold text-blue-700">
                                  <span>{row.container}</span>
                                  {row.containerNumber && (
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      ({row.containerNumber})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Not Loaded</span>
                              )}
                            </td>

                            {/* Date of Loading */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                              {row.loadingDate || '-'}
                            </td>

                            {/* ETA (Estimated Time of Arrival) */}
                            <td className="py-2 px-3 border-r border-slate-200 text-emerald-800 font-mono font-semibold whitespace-nowrap text-[11px] bg-emerald-50/20">
                              {row.eta && row.eta !== 'N/A' && row.eta !== 'Pending' ? (
                                <span>{row.eta}</span>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">Pending</span>
                              )}
                            </td>

                            {/* Marks */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-900 font-semibold whitespace-nowrap">
                              {row.mainMarka || row.subMarka || '-'}
                            </td>

                            {/* Item Name */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800">
                              <span className="font-medium">{row.commodity || 'N/A'}</span>
                              {row.chinese && (
                                <span className="block text-[10px] text-slate-400">{row.chinese}</span>
                              )}
                            </td>

                            {/* CBM */}
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-medium text-slate-900">
                              {row.volume || '0'}
                            </td>

                            {/* Weight */}
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-medium text-slate-900">
                              {row.weight || '0'}
                            </td>

                            {/* KGS/CBM (Marked in RED if > 200 KGS/CBM Heavy Item) */}
                            <td className={`py-2 px-3 border-r border-slate-200 text-right font-mono font-bold whitespace-nowrap ${
                              (() => {
                                const w = parseMetricNumber(row.weight);
                                const v = parseMetricNumber(row.volume);
                                return v > 0 && w / v > 200 ? 'bg-red-50 text-red-700' : 'bg-amber-50/20 text-slate-900';
                              })()
                            }`}>
                              {(() => {
                                const w = parseMetricNumber(row.weight);
                                const v = parseMetricNumber(row.volume);
                                if (v <= 0 || w <= 0) return <span className="text-slate-400 font-normal">—</span>;
                                const ratio = w / v;
                                const isHeavy = ratio > 200;

                                if (isHeavy) {
                                  return (
                                    <span
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 font-black shadow-2xs"
                                      title={`Heavy Cargo (>200 KG/CBM): ${w} kg ÷ ${v} m³ = ${ratio.toFixed(1)} KGS/CBM`}
                                    >
                                      <span className="text-red-700 font-extrabold">{ratio.toFixed(1)}</span>
                                      <span className="text-[9px] bg-red-600 text-white font-black px-1 py-0.2 rounded uppercase tracking-wider">
                                        HEAVY
                                      </span>
                                    </span>
                                  );
                                }

                                return (
                                  <span className="text-slate-900 font-semibold" title={`${w} kg ÷ ${v} m³`}>
                                    {ratio.toFixed(1)}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* CTN */}
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                              {row.quantity || 0}
                            </td>

                            {/* RATE (Direct Inline Editable Cell by Sales Head & Developer) */}
                            <td className="py-1 px-2 border-r border-slate-200 bg-amber-50/20 relative">
                              {isSalesHeadOrDev ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="text"
                                    defaultValue={row.rate || ''}
                                    onBlur={(e) => {
                                      if (e.target.value !== (row.rate || '')) {
                                        handleCellSave(row.receipt, row.warehouse, 'rate', e.target.value);
                                      }
                                    }}
                                    placeholder="Enter rate..."
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                  {savingCells[rateKey] && (
                                    <span className="text-[10px] text-amber-600 animate-pulse">💾</span>
                                  )}
                                  {savedSuccessCells[rateKey] && (
                                    <span className="text-[10px] text-emerald-600 font-bold">✓</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between px-1">
                                  <span className="font-bold text-emerald-800">
                                    {row.rate || <span className="text-slate-400 italic font-normal">Unassigned</span>}
                                  </span>
                                  <Lock className="w-3 h-3 text-slate-400 shrink-0 ml-1" title="रेट (Rate) निर्धारित या बदलने का अधिकार केवल सेल्स हेड को है" />
                                </div>
                              )}
                            </td>

                            {/* SALES PERSON (Dropdown Select by Sales Head & Developer) */}
                            <td className="py-1 px-2 border-r border-slate-200 relative">
                              {isSalesHeadOrDev ? (
                                <div className="flex items-center space-x-1">
                                  <select
                                    defaultValue={row.salesPerson || ''}
                                    onChange={(e) => {
                                      handleCellSave(row.receipt, row.warehouse, 'salesPerson', e.target.value);
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  >
                                    <option value="">-- Assign Person --</option>
                                    {salesTeam.map((sp) => (
                                      <option key={sp.username} value={sp.name || sp.username}>
                                        {sp.name || sp.username}
                                      </option>
                                    ))}
                                  </select>
                                  {savingCells[personKey] && (
                                    <span className="text-[10px] text-amber-600 animate-pulse">💾</span>
                                  )}
                                  {savedSuccessCells[personKey] && (
                                    <span className="text-[10px] text-emerald-600 font-bold">✓</span>
                                  )}
                                </div>
                              ) : (
                                <span className="font-medium text-slate-800">
                                  {row.salesPerson || 'Unassigned'}
                                </span>
                              )}
                            </td>

                            {/* REMARKS (Strictly blank unless Sales Head typed) */}
                            <td className="py-1 px-2 border-r border-slate-200 relative">
                              {isSalesHeadOrDev ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="text"
                                    defaultValue={row.salesRemarks || ''}
                                    onBlur={(e) => {
                                      if (e.target.value !== (row.salesRemarks || '')) {
                                        handleCellSave(row.receipt, row.warehouse, 'remarks', e.target.value);
                                      }
                                    }}
                                    placeholder="Type remark..."
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                  />
                                  {savingCells[remarksKey] && (
                                    <span className="text-[10px] text-amber-600 animate-pulse">💾</span>
                                  )}
                                  {savedSuccessCells[remarksKey] && (
                                    <span className="text-[10px] text-emerald-600 font-bold">✓</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-700 text-xs">
                                  {row.salesRemarks || '-'}
                                </span>
                              )}
                            </td>

                            {/* STATUS CONTROL (Normal, Available to Deliver, Hold) */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center whitespace-nowrap">
                              {isSalesHeadOrDev ? (
                                <button
                                  onClick={() => {
                                    setHoldTarget({
                                      receipt: row.receipt,
                                      warehouse: row.warehouse,
                                      currentStatus: row.salesStatus,
                                      currentHoldReason: row.holdReason,
                                    });
                                    setHoldModalOpen(true);
                                  }}
                                  className={`px-2 py-1 rounded-md text-[10px] font-bold shadow-2xs transition inline-flex items-center space-x-1 ${
                                    isHold
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                                      : isAvailable
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                      : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                                  }`}
                                  title="Click to toggle status (Normal, Hold, Available to Deliver)"
                                >
                                  {isHold ? (
                                    <>
                                      <PauseCircle className="w-3 h-3 text-rose-600" />
                                      <span>HOLD</span>
                                    </>
                                  ) : isAvailable ? (
                                    <>
                                      <Truck className="w-3 h-3 text-emerald-600" />
                                      <span>AVAILABLE</span>
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw className="w-3 h-3 text-blue-600" />
                                      <span>NORMAL</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isHold
                                      ? 'bg-rose-100 text-rose-800'
                                      : isAvailable
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-blue-50 text-blue-800'
                                  }`}
                                >
                                  {row.salesStatus || 'Normal'}
                                </span>
                              )}
                              {row.holdReason && isHold && (
                                <div className="text-[9px] text-rose-700 truncate max-w-[120px] mx-auto mt-0.5">
                                  {row.holdReason}
                                </div>
                              )}
                            </td>

                            {/* DISCREPANCY (Data Entry Wrong Button / Status) */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center whitespace-nowrap">
                              {hasDisc ? (
                                <button
                                  onClick={() => {
                                    setDiscrepancyTarget({
                                      receipt: row.receipt,
                                      warehouse: row.warehouse,
                                      volume: row.volume,
                                      weight: row.weight,
                                      quantity: row.quantity,
                                      commodity: row.commodity,
                                      mainMarka: row.mainMarka,
                                      existingDiscrepancy: row.salesDiscrepancy,
                                    });
                                    setDiscrepancyModalOpen(true);
                                  }}
                                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center space-x-1 mx-auto transition ${
                                    discStatus === 'Approved'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : discStatus === 'Rejected'
                                      ? 'bg-slate-200 text-slate-700'
                                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                                  }`}
                                  title="View discrepancy request details"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  <span>
                                    {discStatus === 'Approved'
                                      ? 'Resolved'
                                      : `Act ${row.salesDiscrepancy.actualCbm || ''} CBM`}
                                  </span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setDiscrepancyTarget({
                                      receipt: row.receipt,
                                      warehouse: row.warehouse,
                                      volume: row.volume,
                                      weight: row.weight,
                                      quantity: row.quantity,
                                      commodity: row.commodity,
                                      mainMarka: row.mainMarka,
                                    });
                                    setDiscrepancyModalOpen(true);
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border border-slate-300 rounded text-[10px] font-semibold transition inline-flex items-center space-x-1"
                                  title="Report incorrect CBM / Weight / CTN to Admin & Warehouse"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  <span>Entry Wrong</span>
                                </button>
                              )}
                            </td>

                            {/* CHAT (Two-Way WhatsApp Style Chat) */}
                            <td className="py-2 px-2 text-center whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setChatReceiptNo(row.receipt);
                                  setChatContainerNo(row.container);
                                  setChatPartnerName(row.salesPerson || 'Sales Team');
                                  setChatModalOpen(true);
                                }}
                                className="p-1.5 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-full shadow-xs transition inline-flex items-center justify-center"
                                title={`Open WhatsApp chat for Receipt #${row.receipt}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
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
      </main>

      {/* WHATSAPP TWO-WAY CHAT DRAWER */}
      <SalesWhatsAppChat
        isOpen={chatModalOpen}
        onClose={() => setChatModalOpen(false)}
        receiptNo={chatReceiptNo}
        containerNo={chatContainerNo}
        partnerName={chatPartnerName}
        currentUser={
          currentUser || {
            username: 'sales_user',
            role: 'sales_head',
            name: 'Sales Head',
          }
        }
      />

      {/* DATA ENTRY WRONG DISCREPANCY MODAL */}
      <SalesDiscrepancyModal
        isOpen={discrepancyModalOpen}
        onClose={() => setDiscrepancyModalOpen(false)}
        onSuccess={() => {
          executeLoadData();
        }}
        receiptData={discrepancyTarget}
      />

      {/* HOLD & DELIVERY CONTROL MODAL */}
      <SalesHoldModal
        isOpen={holdModalOpen}
        onClose={() => setHoldModalOpen(false)}
        onSuccess={() => {
          executeLoadData();
        }}
        receiptData={holdTarget}
      />

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <LogOut className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">लॉगआउट की पुष्टि करें (Confirm Logout)</h3>
                <p className="text-xs text-slate-500 mt-1">
                  क्या आप वाकई सेल्स पोर्टल से लॉगआउट करना चाहते हैं, <strong>{currentUser?.name || currentUser?.username}</strong>?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>हाँ, लॉगआउट करें</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
