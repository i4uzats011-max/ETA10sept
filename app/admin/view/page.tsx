'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ShieldCheck, Search, LogOut, Box, Calendar, RefreshCcw,
  AlertTriangle, FileSpreadsheet, Image as ImageIcon, FileText,
  X, SlidersHorizontal, FileType, Star, Bookmark, ChevronDown,
  LayoutGrid, Filter, Check, CheckCircle2, Clock, TrendingUp, ArrowUpDown,
  CheckSquare, Square, Eye, EyeOff, Lock
} from 'lucide-react';
import {
  calculateDaysToDeliver,
  parseReceiptDate,
  formatReceiptDate,
  formatGlobalDate,
  isContainerLate,
  getDeliveryTurnaroundStatus
} from '@/lib/dateUtils';
import CargoMasterTable from '@/components/CargoMasterTable';
import { ReduxProvider } from '@/store/ReduxProvider';

// Mark types for row marking
type MarkType = 'none' | 'bold' | 'sub';

// Generic Excel-style multi-select column dropdown
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  counts?: Record<string, number>;
  compact?: boolean;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  counts,
  compact = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(s));
  }, [options, search]);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(options));
  const clearAll = () => onChange(new Set());

  const isActive = selected.size > 0 && selected.size < options.length;

  if (compact) {
    // Column Header Excel Icon Mode
    return (
      <div className="relative inline-block ml-1" ref={ref}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          title={`Filter ${label}`}
          className={`p-1 rounded hover:bg-slate-700 transition inline-flex items-center ${
            isActive ? 'text-cyan-400 bg-slate-800' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Filter className={`w-3 h-3 ${isActive ? 'fill-cyan-400' : ''}`} />
          {isActive && (
            <span className="ml-0.5 text-[9px] font-black bg-cyan-500 text-slate-950 px-1 rounded-full">
              {selected.size}
            </span>
          )}
        </button>

        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full left-0 mt-1 z-50 bg-white text-slate-800 border border-slate-200 rounded-xl shadow-2xl min-w-[200px] max-w-[calc(100vw-2rem)] max-h-72 flex flex-col font-normal text-xs"
          >
            <div className="p-2.5 border-b border-slate-100 bg-slate-50 rounded-t-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                  {label} Filter
                </span>
                <div className="flex items-center space-x-1.5 text-[10px] font-bold">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={clearAll} className="text-red-500 hover:underline">Clear</button>
                </div>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 bg-white"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto flex-1 p-1 max-h-48">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs italic">No values match</div>
              ) : (
                filteredOptions.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-100 rounded-md cursor-pointer text-xs select-none"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <input
                        type="checkbox"
                        checked={selected.has(opt)}
                        onChange={() => toggle(opt)}
                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0"
                      />
                      <span className="truncate">{opt || '(Blank)'}</span>
                    </div>
                    {counts && counts[opt] !== undefined && (
                      <span className="text-[10px] text-slate-400 ml-2 font-mono">
                        {counts[opt]}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            {selected.size > 0 && (
              <div className="p-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between items-center rounded-b-xl px-2.5">
                <span>{selected.size} selected</span>
                <button
                  onClick={() => setOpen(false)}
                  className="px-2 py-0.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 text-[10px]"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Standard Toolbar Dropdown Mode
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition shadow-sm ${
          isActive
            ? 'border-blue-400 bg-blue-50 text-blue-800 ring-2 ring-blue-100'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        <span className="truncate">
          {selected.size === 0
            ? `All ${label}`
            : selected.size === options.length
            ? `All ${label} (${options.length})`
            : `${label}: ${selected.size} selected`}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-1 shrink-0 transition-transform text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[220px] max-w-[calc(100vw-2rem)] max-h-72 flex flex-col">
          <div className="p-2.5 border-b border-slate-100 bg-slate-50 rounded-t-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {label} Filter ({options.length})
              </span>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <button onClick={selectAll} className="text-blue-600 hover:underline">Select All</button>
                <span className="text-slate-300">|</span>
                <button onClick={clearAll} className="text-red-500 hover:underline">Clear</button>
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label}...`}
              className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
              autoFocus
            />
          </div>

          <div className="overflow-y-auto flex-1 p-1 max-h-48">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-xs italic">No matching values</div>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer text-xs font-medium text-slate-800"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={selected.has(opt)}
                      onChange={() => toggle(opt)}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="truncate">{opt || '(Blank)'}</span>
                  </div>
                  {counts && counts[opt] !== undefined && (
                    <span className="text-[10px] text-slate-400 ml-2 font-mono">
                      {counts[opt]}
                    </span>
                  )}
                </label>
              ))
            )}
          </div>

          <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 rounded-b-xl px-3">
            <span>{selected.size === 0 ? 'Showing all' : `${selected.size} of ${options.length} selected`}</span>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 text-xs"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InternalEmployeeViewPage() {
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'staff'>('staff');

  const [shipments, setShipments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExportingJpg, setIsExportingJpg] = useState(false);

  // Column Visibility: User can hide ANY column per requirement
  const [showMarks, setShowMarks] = useState(true);
  const [showMainMark, setShowMainMark] = useState(true);
  const [showSubMark, setShowSubMark] = useState(true);
  const [showReceiptNo, setShowReceiptNo] = useState(true);
  const [showContainer, setShowContainer] = useState(true);
  const [showActualContainer, setShowActualContainer] = useState(false);
  const [showShippingLine, setShowShippingLine] = useState(false);
  const [showCommodity, setShowCommodity] = useState(true);
  const [showCargoMetrics, setShowCargoMetrics] = useState(true);
  const [showReceiptDate, setShowReceiptDate] = useState(true);
  const [showEtaDate, setShowEtaDate] = useState(true);
  const [showDaysToDeliver, setShowDaysToDeliver] = useState(true);
  const [showStatus, setShowStatus] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Row Marking: 'bold' = primary mark (gold star), 'sub' = sub-mark (blue bookmark)
  const [rowMarks, setRowMarks] = useState<Record<string, MarkType>>({});

  // View Mode: Customer-friendly ETA buckets and delivery status filter
  type ViewFilter =
    | 'all'
    | 'within-2-days'
    | '2-to-7-days'
    | '7-to-15-days'
    | 'more-than-15-days'
    | 'arriving-soon'
    | 'delivered';
  const [viewMode, setViewMode] = useState<ViewFilter>('all');

  // Excel-Like Multi-Select Filters across all columns
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set());
  const [selectedActualContainers, setSelectedActualContainers] = useState<Set<string>>(new Set());
  const [selectedCarriers, setSelectedCarriers] = useState<Set<string>>(new Set());
  const [selectedCommodities, setSelectedCommodities] = useState<Set<string>>(new Set());
  const [selectedMainMarks, setSelectedMainMarks] = useState<Set<string>>(new Set());
  const [selectedSubMarks, setSelectedSubMarks] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedWarehouseEntries, setSelectedWarehouseEntries] = useState<Set<string>>(new Set());
  const [selectedRowMarks, setSelectedRowMarks] = useState<Set<string>>(new Set());
  const [selectedTurnaroundStatuses, setSelectedTurnaroundStatuses] = useState<Set<string>>(new Set());

  // Date Range Filters (Receipt Date & ETA Date)
  const [receiptDateFrom, setReceiptDateFrom] = useState('');
  const [receiptDateTo, setReceiptDateTo] = useState('');
  const [etaFrom, setEtaFrom] = useState('');
  const [etaTo, setEtaTo] = useState('');

  // Toolbar Filter Panel Visibility
  const [activeFilterPanel, setActiveFilterPanel] = useState(true);


  // ── MODULAR EMPLOYEE MENU TABS (Read-Only) ──
  type EmployeeTab = 'shipments' | 'containers';
  const [activeEmployeeTab, setActiveEmployeeTab] = useState<EmployeeTab>('shipments');

  // ── CONTAINER FLEET TABLE STATE ──
  const [containerFleet, setContainerFleet] = useState<any[]>([]);
  const [isContainerFleetLoading, setIsContainerFleetLoading] = useState(false);
  const [containerFleetSearch, setContainerFleetSearch] = useState('');

  // ── SET CHINA LOADING DATE & ETA FORM STATE ──
  const [setDatesContainer, setSetDatesContainer] = useState('');
  const [setDatesLoadingDate, setSetDatesLoadingDate] = useState('');
  const [setDatesEta, setSetDatesEta] = useState('');
  const [setDatesStatus, setSetDatesStatus] = useState('In Transit');
  const [setDatesShippedFrom, setSetDatesShippedFrom] = useState('Ningbo / Shanghai, China');
  const [setDatesShippedTo, setSetDatesShippedTo] = useState('India Port');
  const [setDatesShippingLine, setSetDatesShippingLine] = useState('MSC');
  const [setDatesBuffer, setSetDatesBuffer] = useState(true);
  const [isSavingDates, setIsSavingDates] = useState(false);
  const [setDatesFeedback, setSetDatesFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [shippingLinesList, setShippingLinesList] = useState<string[]>([
    'MSC', 'MAERSK', 'CMA_CGM', 'HAPAG_LLOYD', 'COSCO', 'ONE', 'EVERGREEN', 'YANG_MING', 'HMM', 'ZIM', 'PIL', 'WAN_HAI', 'OOCL'
  ]);

  useEffect(() => {
    fetch('/api/admin/shipping-lines')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.success && Array.isArray(d.shippingLines)) {
          const names = d.shippingLines.filter((l: any) => l.active !== false).map((l: any) => l.name);
          if (names.length > 0) setShippingLinesList(names);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Container Fleet
  const fetchContainerFleet = async () => {
    setIsContainerFleetLoading(true);
    try {
      const res = await fetch('/api/containers/list');
      const data = await res.json();
      if (res.ok && data.containers) {
        setContainerFleet(data.containers);
      }
    } catch {
      // silent
    } finally {
      setIsContainerFleetLoading(false);
    }
  };

  // Distinct containers for dropdown
  const distinctContainers = useMemo(() => {
    const set = new Set<string>();
    shipments.forEach((s) => {
      if (s.container) set.add(s.container);
    });
    containerFleet.forEach((c) => {
      if (c.container) set.add(c.container);
    });
    return Array.from(set).sort();
  }, [shipments, containerFleet]);

  // Filtered Container Fleet for Table View
  const filteredContainerFleet = useMemo(() => {
    if (!containerFleetSearch.trim()) return containerFleet;
    const q = containerFleetSearch.toLowerCase().trim();
    return containerFleet.filter((c) => {
      const alias = (c.container || '').toLowerCase();
      const num = (c.containerNumber || '').toLowerCase();
      const line = (c.shippingLine || '').toLowerCase();
      const dest = (c.destination || c.shippedTo || '').toLowerCase();
      const origin = (c.shippedFrom || '').toLowerCase();
      const status = (c.status || '').toLowerCase();
      return alias.includes(q) || num.includes(q) || line.includes(q) || dest.includes(q) || origin.includes(q) || status.includes(q);
    });
  }, [containerFleet, containerFleetSearch]);

  // Auto-fill form when employee selects container
  const handleEmployeeContainerSelect = (alias: string) => {
    setSetDatesContainer(alias);
    if (!alias) return;
    const found = containerFleet.find((c) => c.container === alias);
    if (found) {
      if (found.startDate) setSetDatesLoadingDate(found.startDate);
      if (found.eta && found.eta !== 'N/A') setSetDatesEta(found.eta);
      if (found.status) setSetDatesStatus(found.status);
      if (found.shippedFrom) setSetDatesShippedFrom(found.shippedFrom);
      if (found.shippedTo) setSetDatesShippedTo(found.shippedTo);
      if (found.shippingLine) setSetDatesShippingLine(found.shippingLine);
    } else {
      const s = shipments.find((item) => item.container === alias);
      if (s) {
        if (s.startDate) setSetDatesLoadingDate(s.startDate);
        if (s.eta && s.eta !== 'N/A') setSetDatesEta(s.eta);
        if (s.status) setSetDatesStatus(s.status);
        if (s.shippedFrom) setSetDatesShippedFrom(s.shippedFrom);
        if (s.shippedTo) setSetDatesShippedTo(s.shippedTo);
        if (s.shippingLine) setSetDatesShippingLine(s.shippingLine);
      }
    }
  };

  // Submit China Loading Date & ETA Override
  const handleEmployeeSaveDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setDatesContainer) {
      setSetDatesFeedback({ type: 'error', message: 'Please select a container identifier' });
      return;
    }
    if (!setDatesLoadingDate && !setDatesEta && !setDatesStatus) {
      setSetDatesFeedback({ type: 'error', message: 'Please provide at least a Loading Date from China, ETA Date, or Status' });
      return;
    }

    let deliveryDateToSend = '';
    if (setDatesStatus && setDatesStatus.toLowerCase().includes('deliver')) {
      const entered = prompt('Container is marked as Delivered. Please enter the Delivery Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
      if (!entered || !entered.trim()) {
        setSetDatesFeedback({ type: 'error', message: 'Delivery Date is mandatory when marking status as Delivered.' });
        return;
      }
      deliveryDateToSend = entered.trim();
    }

    setIsSavingDates(true);
    setSetDatesFeedback(null);

    try {
      const res = await fetch('/api/containers/manual-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: setDatesContainer,
          loadingDate: setDatesLoadingDate,
          startDate: setDatesLoadingDate,
          manualEta: setDatesEta,
          destinationDate: setDatesEta,
          status: setDatesStatus,
          deliveryDate: deliveryDateToSend,
          isDelivered: Boolean(deliveryDateToSend || setDatesStatus.toLowerCase().includes('deliver')),
          shippedFrom: setDatesShippedFrom,
          shippedTo: setDatesShippedTo,
          shippingLine: setDatesShippingLine,
          applyFilingBuffer: setDatesBuffer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update container dates');

      setSetDatesFeedback({
        type: 'success',
        message: data.message || `Successfully updated dates for container '${setDatesContainer}'!`,
      });

      fetchContainerFleet();
      fetchAllShipments();
    } catch (err: any) {
      setSetDatesFeedback({ type: 'error', message: err.message || 'Date update failed' });
    } finally {
      setIsSavingDates(false);
    }
  };

  // Auth verification
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) router.push('/admin/login');
        else return res.json();
      })
      .then((data) => {
        if (data) {
          setIsAuthenticated(true);
          setUserRole(data.role || 'staff');
          fetchAllShipments();
          fetchContainerFleet();
        }
      })
      .catch(() => router.push('/admin/login'));
  }, [router]);

  const fetchAllShipments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/shipments?all=true&limit=25000');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load shipments data');
      setShipments(data.shipments || []);
    } catch (err: any) {
      setError(err.message || 'Error connecting to database');
    } finally {
      setIsLoading(false);
    }
  };

  // Derive counts & unique values for Excel dropdowns
  const uniqueReceipts = useMemo(() => [...new Set(shipments.map((s) => s.receipt).filter(Boolean))].sort(), [shipments]);
  const uniqueContainers = useMemo(() => [...new Set(shipments.map((s) => s.container).filter(Boolean))].sort(), [shipments]);
  const uniqueActualContainers = useMemo(() => [...new Set(shipments.map((s) => s.containerNumber).filter(Boolean))].sort(), [shipments]);
  const uniqueCarriers = useMemo(() => [...new Set(shipments.map((s) => s.shippingLine).filter(Boolean))].sort(), [shipments]);
  const uniqueCommodities = useMemo(() => [...new Set(shipments.map((s) => s.english || s.commodity).filter(Boolean))].sort(), [shipments]);
  const uniqueMainMarks = useMemo(() => [...new Set(shipments.map((s) => s.mainMarka).filter(Boolean))].sort(), [shipments]);
  const uniqueSubMarks = useMemo(() => [...new Set(shipments.map((s) => s.subMarka).filter(Boolean))].sort(), [shipments]);
  const uniqueStatuses = useMemo(() => [...new Set(shipments.map((s) => s.status).filter(Boolean))].sort(), [shipments]);
  const uniqueWarehouseEntries = useMemo(() => [...new Set(shipments.map((s) => s.warehouseEntry).filter(Boolean))].sort(), [shipments]);

  // Container lookup map for synchronizing delivery & ETA status across shipments
  const containerFleetMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of containerFleet) {
      if (c.container) {
        map.set(String(c.container).toUpperCase().trim(), c);
      }
    }
    return map;
  }, [containerFleet]);

  // Customer-friendly delivery calculation (NO "Late" text shown to customers!)
  const getDeliveryInfo = useCallback(
    (item: any) => {
      const containerKey = String(item.container || '').toUpperCase().trim();
      const cFleet = containerFleetMap.get(containerKey);

      const isDelivered = Boolean(
        item.isDelivered ||
          cFleet?.isDelivered ||
          (item.deliveryDate && item.deliveryDate.trim() && item.deliveryDate !== '—' && item.deliveryDate !== 'N/A' && item.deliveryDate !== 'In Transit') ||
          (cFleet?.deliveryDate && cFleet?.deliveryDate.trim() && cFleet?.deliveryDate !== '—' && cFleet?.deliveryDate !== 'N/A' && cFleet?.deliveryDate !== 'In Transit') ||
          (item.status && item.status.toLowerCase().trim() === 'delivered') ||
          (cFleet?.status && cFleet?.status.toLowerCase().trim() === 'delivered')
      );

      const targetDateStr = item.destinationDate || item.eta || cFleet?.destinationDate || cFleet?.eta;
      let daysRemaining: number | null = null;
      if (targetDateStr && targetDateStr !== 'N/A' && targetDateStr !== 'Pending' && targetDateStr !== '—') {
        const targetDate = parseReceiptDate(targetDateStr) || new Date(targetDateStr);
        if (targetDate && !isNaN(targetDate.getTime())) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          targetDate.setHours(0, 0, 0, 0);
          daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      if (isDelivered) {
        return {
          daysRemaining,
          isDelivered: true,
          category: 'delivered',
          label: '✓ Delivered',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
        };
      }

      if (daysRemaining === null || daysRemaining === undefined) {
        return {
          daysRemaining: null,
          isDelivered: false,
          category: 'pending',
          label: '⏳ In Transit',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 font-medium',
        };
      }

      // Customer-friendly calculation: Direct ETA - TODAY countdown! (NO "container late" shown)
      if (daysRemaining < 0) {
        return {
          daysRemaining,
          isDelivered: false,
          category: 'arriving-soon',
          label: '⚡ Arriving Soon',
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        };
      }

      if (daysRemaining === 0) {
        return {
          daysRemaining: 0,
          isDelivered: false,
          category: 'within-2-days',
          label: '⚡ Today (0 Days)',
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        };
      }

      if (daysRemaining === 1) {
        return {
          daysRemaining: 1,
          isDelivered: false,
          category: 'within-2-days',
          label: '⚡ 1 Day (Tomorrow)',
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        };
      }

      return {
        daysRemaining,
        isDelivered: false,
        category: daysRemaining <= 7 ? '2-to-7-days' : daysRemaining <= 15 ? '7-to-15-days' : 'more-than-15-days',
        label: `🚢 ${daysRemaining} Days`,
        badgeClass: daysRemaining <= 7 ? 'bg-blue-100 text-blue-900 border-blue-300 font-bold' : daysRemaining <= 15 ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold' : 'bg-purple-100 text-purple-900 border-purple-300 font-bold',
      };
    },
    [containerFleetMap]
  );

  // Dynamic Fleet Delivery Counts for List-by-List View Tabs
  const deliveryCounts = useMemo(() => {
    let within2Days = 0;
    let twoToSeven = 0;
    let sevenToFifteen = 0;
    let moreThanFifteen = 0;
    let arrivingSoon = 0;
    let delivered = 0;
    const all = shipments.length;

    shipments.forEach((s) => {
      const info = getDeliveryInfo(s);
      if (info.isDelivered) delivered++;
      else if (info.category === 'within-2-days') within2Days++;
      else if (info.category === '2-to-7-days') twoToSeven++;
      else if (info.category === '7-to-15-days') sevenToFifteen++;
      else if (info.category === 'more-than-15-days') moreThanFifteen++;
      else if (info.category === 'arriving-soon') arrivingSoon++;
    });

    return { all, within2Days, twoToSeven, sevenToFifteen, moreThanFifteen, arrivingSoon, delivered };
  }, [shipments, getDeliveryInfo]);

  // Turnaround categories (customer-friendly, zero late text)
  const turnaroundOptions = [
    'Container Delivered',
    'In 1 to 2 Days',
    'In 2 to 7 Days',
    'In 7 to 15 Days',
    'More Than 15 Days',
    'Arriving Soon',
    'In Transit',
  ];
  const rowMarkOptions = ['★ Primary Mark', '◆ Sub-Mark', 'Unmarked'];

  // Counts for each column
  const mainMarkCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.mainMarka || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  const subMarkCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.subMarka || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  const carrierCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.shippingLine || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.status || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  // Counts and multi-container detection for duplicate receipts
  const receiptCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.receipt || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  const receiptContainers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    shipments.forEach((s) => {
      const r = s.receipt || '';
      if (r) {
        if (!map.has(r)) map.set(r, new Set());
        if (s.container) map.get(r)!.add(s.container);
      }
    });
    return map;
  }, [shipments]);

  // Master Filter Engine
  const filteredShipments = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();

    return shipments.filter((item) => {
      const deliveryInfo = getDeliveryInfo(item);

      // 1. Customer-Friendly View Mode (ETA Buckets & Delivered)
      if (viewMode !== 'all') {
        if (viewMode === 'delivered' && !deliveryInfo.isDelivered) return false;
        if (viewMode === 'within-2-days' && deliveryInfo.category !== 'within-2-days') return false;
        if (viewMode === '2-to-7-days' && deliveryInfo.category !== '2-to-7-days') return false;
        if (viewMode === '7-to-15-days' && deliveryInfo.category !== '7-to-15-days') return false;
        if (viewMode === 'more-than-15-days' && deliveryInfo.category !== 'more-than-15-days') return false;
        if (viewMode === 'arriving-soon' && deliveryInfo.category !== 'arriving-soon') return false;
      }

      // 2. Receipt No Filter
      if (selectedReceipts.size > 0 && !selectedReceipts.has(item.receipt)) return false;

      // 3. Container Alias Filter
      if (selectedContainers.size > 0 && !selectedContainers.has(item.container)) return false;

      // 4. Actual Container Filter
      if (selectedActualContainers.size > 0 && !selectedActualContainers.has(item.containerNumber)) return false;

      // 5. Shipping Line Filter
      if (selectedCarriers.size > 0 && !selectedCarriers.has(item.shippingLine)) return false;

      // 6. Commodity Filter
      const commodityName = item.english || item.commodity || '';
      if (selectedCommodities.size > 0 && !selectedCommodities.has(commodityName)) return false;

      // 7. Main Mark Filter (dedicated selectable list)
      if (selectedMainMarks.size > 0 && (!item.mainMarka || !selectedMainMarks.has(item.mainMarka))) return false;

      // 8. Sub Mark Filter (dedicated selectable list)
      if (selectedSubMarks.size > 0 && (!item.subMarka || !selectedSubMarks.has(item.subMarka))) return false;

      // 9. Status Filter
      if (selectedStatuses.size > 0 && !selectedStatuses.has(item.status)) return false;

      // 10. Warehouse Entry Filter
      if (selectedWarehouseEntries.size > 0 && !selectedWarehouseEntries.has(item.warehouseEntry)) return false;

      // 11. Row Mark Filter
      const curRowMark = rowMarks[item._id] || 'none';
      if (selectedRowMarks.size > 0) {
        let label = 'Unmarked';
        if (curRowMark === 'bold') label = '★ Primary Mark';
        else if (curRowMark === 'sub') label = '◆ Sub-Mark';
        if (!selectedRowMarks.has(label)) return false;
      }

      // 12. Turnaround / Delivery Status Dropdown Filter
      if (selectedTurnaroundStatuses.size > 0) {
        let catName = 'In Transit';
        if (deliveryInfo.isDelivered) catName = 'Container Delivered';
        else if (deliveryInfo.category === 'within-2-days') catName = 'In 1 to 2 Days';
        else if (deliveryInfo.category === '2-to-7-days') catName = 'In 2 to 7 Days';
        else if (deliveryInfo.category === '7-to-15-days') catName = 'In 7 to 15 Days';
        else if (deliveryInfo.category === 'more-than-15-days') catName = 'More Than 15 Days';
        else if (deliveryInfo.category === 'arriving-soon') catName = 'Arriving Soon';
        if (!selectedTurnaroundStatuses.has(catName)) return false;
      }

      // 13. Receipt Date Range Filter
      if (receiptDateFrom || receiptDateTo) {
        const rDate = parseReceiptDate(item.date) || (item.uploadedAt ? new Date(item.uploadedAt) : null);
        if (!rDate) return false;
        if (receiptDateFrom && rDate < new Date(receiptDateFrom)) return false;
        if (receiptDateTo && rDate > new Date(receiptDateTo + 'T23:59:59')) return false;
      }

      // 14. ETA Date Range Filter
      if (etaFrom || etaTo) {
        const etaDate = item.eta && item.eta !== 'N/A' ? new Date(item.eta) : null;
        if (!etaDate || isNaN(etaDate.getTime())) return false;
        if (etaFrom && etaDate < new Date(etaFrom)) return false;
        if (etaTo && etaDate > new Date(etaTo + 'T23:59:59')) return false;
      }

      // 15. Global Search across all fields
      if (q) {
        const fields = [
          item.receipt,
          item.container,
          item.containerNumber,
          item.shippingLine,
          item.commodity,
          item.english,
          item.status,
          item.eta,
          item.date,
          item.warehouseEntry,
          item.stockstatus,
          item.mainMarka,
          item.subMarka,
        ].map((f) => (f || '').toLowerCase());
        if (!fields.some((f) => f.includes(q))) return false;
      }

      return true;
    });
  }, [
    shipments,
    viewMode,
    globalSearch,
    selectedReceipts,
    selectedContainers,
    selectedActualContainers,
    selectedCarriers,
    selectedCommodities,
    selectedMainMarks,
    selectedSubMarks,
    selectedStatuses,
    selectedWarehouseEntries,
    selectedRowMarks,
    selectedTurnaroundStatuses,
    receiptDateFrom,
    receiptDateTo,
    etaFrom,
    etaTo,
    rowMarks,
    getDeliveryInfo,
  ]);

  // Mark row helper
  const cycleRowMark = useCallback((id: string) => {
    setRowMarks((prev) => {
      const cur = prev[id] || 'none';
      const next: MarkType = cur === 'none' ? 'bold' : cur === 'bold' ? 'sub' : 'none';
      return { ...prev, [id]: next };
    });
  }, []);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (globalSearch) c++;
    if (selectedReceipts.size > 0) c++;
    if (selectedContainers.size > 0) c++;
    if (selectedActualContainers.size > 0) c++;
    if (selectedCarriers.size > 0) c++;
    if (selectedCommodities.size > 0) c++;
    if (selectedMainMarks.size > 0) c++;
    if (selectedSubMarks.size > 0) c++;
    if (selectedStatuses.size > 0) c++;
    if (selectedWarehouseEntries.size > 0) c++;
    if (selectedRowMarks.size > 0) c++;
    if (selectedTurnaroundStatuses.size > 0) c++;
    if (receiptDateFrom || receiptDateTo) c++;
    if (etaFrom || etaTo) c++;
    if (viewMode !== 'all') c++;
    return c;
  }, [
    globalSearch,
    selectedReceipts,
    selectedContainers,
    selectedActualContainers,
    selectedCarriers,
    selectedCommodities,
    selectedMainMarks,
    selectedSubMarks,
    selectedStatuses,
    selectedWarehouseEntries,
    selectedRowMarks,
    selectedTurnaroundStatuses,
    receiptDateFrom,
    receiptDateTo,
    etaFrom,
    etaTo,
    viewMode,
  ]);

  const resetFilters = () => {
    setGlobalSearch('');
    setSelectedReceipts(new Set());
    setSelectedContainers(new Set());
    setSelectedActualContainers(new Set());
    setSelectedCarriers(new Set());
    setSelectedCommodities(new Set());
    setSelectedMainMarks(new Set());
    setSelectedSubMarks(new Set());
    setSelectedStatuses(new Set());
    setSelectedWarehouseEntries(new Set());
    setSelectedRowMarks(new Set());
    setSelectedTurnaroundStatuses(new Set());
    setReceiptDateFrom('');
    setReceiptDateTo('');
    setEtaFrom('');
    setEtaTo('');
    setViewMode('all');
  };

  // Mark stats
  const boldCount = useMemo(() => Object.values(rowMarks).filter((m) => m === 'bold').length, [rowMarks]);
  const subCount = useMemo(() => Object.values(rowMarks).filter((m) => m === 'sub').length, [rowMarks]);

  // --- EXPORTS WITH NEW FIELDS (Receipt Date, Days to Deliver, Marks) ---
  const getExportRows = () =>
    filteredShipments.map((s) => {
      const deliveryInfo = getDeliveryInfo(s);
      const row: Record<string, any> = {};
      if (showMarks) row['Mark'] = rowMarks[s._id] === 'bold' ? '★ Primary' : rowMarks[s._id] === 'sub' ? '◆ Sub-Mark' : '';
      if (showMainMark) row['Main Mark'] = s.mainMarka || '';
      if (showSubMark) row['Sub Mark'] = s.subMarka || '';
      if (showReceiptNo) row['Receipt No'] = s.receipt || '';
      if (showContainer) row['Container Alias'] = s.container || '';
      if (showActualContainer) row['Actual Container No'] = s.containerNumber || '';
      if (showShippingLine) row['Shipping Line'] = s.shippingLine || '';
      if (showCommodity) {
        row['Commodity (English)'] = s.english || s.commodity || '';
        row['Commodity (Chinese)'] = s.commodity || '';
      }
      if (showCargoMetrics) {
        row['Cartons (CTN)'] = s.quantity ?? '';
        row['Weight (KGS)'] = s.weight ?? '';
        row['Volume (CBM)'] = s.volume ?? '';
      }
      if (showReceiptDate) row['Receipt Date'] = s.date || 'N/A';
      if (showEtaDate) row['ETA Date'] = s.eta || '';
      if (showDaysToDeliver) row['Days to Deliver'] = deliveryInfo.label;
      if (showStatus) row['Status'] = s.status || '';
      if (showDestination) row['Destination'] = s.shippedTo || 'India Port';
      if (showSource) row['Warehouse Entry (Source)'] = s.warehouseEntry || '';
      return row;
    });

  const exportToCSV = () => {
    if (!filteredShipments.length) return;
    const rows = getExportRows();
    const headers = Object.keys(rows[0]);
    const csvContent =
      '\uFEFF' +
      [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((field) => {
              const val = row[field] ?? '';
              const escaped = String(val).replace(/"/g, '""');
              return `"${escaped}"`;
            })
            .join(',')
        ),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `USI_Cargo_Master_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const exportToExcel = () => {
    if (!filteredShipments.length) return;
    const rows = getExportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cargo Data');
    const colWidths = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 4, 16) }));
    ws['!cols'] = colWidths;
    XLSX.writeFile(wb, `USI_Cargo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportToJPG = async () => {
    if (!tableRef.current || !filteredShipments.length) return;
    setIsExportingJpg(true);
    try {
      const url = await toJpeg(tableRef.current, { quality: 0.95, backgroundColor: '#ffffff', cacheBust: true });
      const a = document.createElement('a');
      a.download = `USI_Cargo_${new Date().toISOString().slice(0, 10)}.jpg`;
      a.href = url;
      a.click();
    } catch (err: any) {
      alert(`JPG Export Failed: ${err.message}`);
    } finally {
      setIsExportingJpg(false);
    }
  };

  const exportToPDF = () => {
    if (!filteredShipments.length) return;
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text('US INTERNATIONAL LOGISTICS - Cargo Master Table', 14, 15);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Date: ${new Date().toLocaleDateString()}   |   Records: ${filteredShipments.length}`,
        190,
        14
      );

      const headers: string[] = [];
      if (showMarks) headers.push('Mark');
      if (showMainMark) headers.push('Main Mark');
      if (showSubMark) headers.push('Sub Mark');
      if (showReceiptNo) headers.push('Receipt No');
      if (showContainer) headers.push('Container');
      if (showActualContainer) headers.push('Actual Container');
      if (showShippingLine) headers.push('Line');
      if (showCommodity) headers.push('Commodity');
      if (showCargoMetrics) headers.push('CTN', 'Weight (KGS)', 'CBM');
      if (showReceiptDate) headers.push('Receipt Date');
      if (showEtaDate) headers.push('ETA Date');
      if (showDaysToDeliver) headers.push('Days to Deliver');
      if (showStatus) headers.push('Status');
      if (showDestination) headers.push('Destination');
      if (showSource) headers.push('Source');

      const body = filteredShipments.map((s) => {
        const mark = rowMarks[s._id] === 'bold' ? '★' : rowMarks[s._id] === 'sub' ? '◆' : '';
        const deliveryInfo = getDeliveryInfo(s);
        const row: string[] = [];
        if (showMarks) row.push(mark);
        if (showMainMark) row.push(s.mainMarka || '-');
        if (showSubMark) row.push(s.subMarka || '-');
        if (showReceiptNo) row.push(s.receipt || '');
        if (showContainer) row.push(s.container || '');
        if (showActualContainer) row.push(s.containerNumber || '-');
        if (showShippingLine) row.push(s.shippingLine || '-');
        if (showCommodity) row.push(s.english || s.commodity || '');
        if (showCargoMetrics) {
          row.push(
            s.quantity ? `${s.quantity} CTN` : '-',
            s.weight ? `${s.weight} KGS` : '-',
            s.volume ? `${s.volume} CBM` : '-'
          );
        }
        if (showReceiptDate) row.push(s.date || '-');
        if (showEtaDate) row.push(s.eta || 'Pending');
        if (showDaysToDeliver) row.push(deliveryInfo.label);
        if (showStatus) row.push(s.status || 'In Transit');
        if (showDestination) row.push(s.shippedTo || 'India Port');
        if (showSource) row.push(s.warehouseEntry || '-');
        return row;
      });

      autoTable(doc, {
        head: [headers],
        body,
        startY: 26,
        theme: 'grid',
        headStyles: { fillColor: [11, 25, 44], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const rowIdx = data.row.index;
            const s = filteredShipments[rowIdx];
            if (s && rowMarks[s._id] === 'bold') {
              data.cell.styles.fillColor = [255, 251, 235]; // amber-50
              data.cell.styles.fontStyle = 'bold';
            } else if (s && rowMarks[s._id] === 'sub') {
              data.cell.styles.fillColor = [239, 246, 255]; // blue-50
            }
          }
        },
      });

      doc.save(`USI_Cargo_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      alert(`PDF Error: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-semibold text-slate-700">Verifying Employee Session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      {/* ── NAVBAR ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-0 min-h-16 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shrink-0">
              <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-black text-sm sm:text-base text-slate-950 tracking-tight">US INTERNATIONAL</span>
                <span className="font-black text-sm sm:text-base text-blue-600 tracking-tight">LOGISTICS</span>
                <span className="text-[9px] sm:text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 uppercase">
                  Staff
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold hidden sm:block">
                Cargo Manifest Database &amp; Container Directory (Read-Only)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {(boldCount > 0 || subCount > 0) && (
              <div className="hidden md:flex items-center space-x-2 text-xs font-bold">
                {boldCount > 0 && (
                  <span className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>{boldCount} primary</span>
                  </span>
                )}
                {subCount > 0 && (
                  <span className="flex items-center space-x-1 px-2.5 py-1 bg-blue-50 border border-blue-300 text-blue-900 rounded-lg">
                    <Bookmark className="w-3.5 h-3.5 fill-blue-500 text-blue-500" />
                    <span>{subCount} sub-mark</span>
                  </span>
                )}
              </div>
            )}

            <Link
              href="/biller"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition flex items-center space-x-1"
            >
              <span>Biller (बिलर)</span>
            </Link>

            <Link
              href="/dispatcher"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold transition flex items-center space-x-1"
            >
              <span>Dispatcher (डिस्पैचर)</span>
            </Link>

            {userRole === 'admin' && (
              <Link
                href="/admin"
                className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm"
              >
                Super Admin
              </Link>
            )}
            <Link
              href="/"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition hidden xs:inline-flex"
            >
              Public Tracker
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 sm:p-2 rounded-xl border border-slate-200 hover:bg-red-50 text-slate-500 hover:text-red-600 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* ── EMPLOYEE NAVIGATION MENU BAR (Zero Scrollbars - Responsive Grid) ── */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveEmployeeTab('shipments')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                activeEmployeeTab === 'shipments'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-white" />
              <span className="truncate">Cargo Shipments</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeEmployeeTab === 'shipments' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {filteredShipments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveEmployeeTab('containers');
                fetchContainerFleet();
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
                activeEmployeeTab === 'containers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Box className="w-4 h-4 shrink-0 text-blue-500" />
              <span className="truncate">Container List</span>
              {containerFleet.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeEmployeeTab === 'containers' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {containerFleet.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium px-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Read-Only Staff Portal &bull; Date &amp; Cargo Edits Restricted to Super Admin</span>
          </div>
        </div>

        {/* ── TAB 1: CARGO SHIPMENTS TABLE & FILTERS ── */}
        {activeEmployeeTab === 'shipments' && (
          <div className="space-y-4 animate-fadeIn">
            {/* ── PRIMARY VIEW MODE TABS: CUSTOMER-FRIENDLY DELIVERY STAGES (List-by-List View) ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>All Shipments</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'all' ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {deliveryCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('within-2-days')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === 'within-2-days'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>⚡ 1 to 2 Days</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'within-2-days' ? 'bg-white text-amber-800' : 'bg-amber-200 text-amber-900'
                  }`}>
                    {deliveryCounts.within2Days}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('2-to-7-days')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === '2-to-7-days'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <span>🚢 2 to 7 Days</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === '2-to-7-days' ? 'bg-white text-blue-800' : 'bg-blue-200 text-blue-900'
                  }`}>
                    {deliveryCounts.twoToSeven}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('7-to-15-days')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === '7-to-15-days'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <span>🌊 7 to 15 Days</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === '7-to-15-days' ? 'bg-white text-indigo-800' : 'bg-indigo-200 text-indigo-900'
                  }`}>
                    {deliveryCounts.sevenToFifteen}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('more-than-15-days')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === 'more-than-15-days'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  <span>🌐 &gt; 15 Days</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'more-than-15-days' ? 'bg-white text-purple-800' : 'bg-purple-200 text-purple-900'
                  }`}>
                    {deliveryCounts.moreThanFifteen}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('arriving-soon')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === 'arriving-soon'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-orange-50 text-orange-900 border border-orange-200 hover:bg-orange-100'
                  }`}
                >
                  <span>⚡ Arriving Soon</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'arriving-soon' ? 'bg-white text-orange-800' : 'bg-orange-200 text-orange-900'
                  }`}>
                    {deliveryCounts.arrivingSoon}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('delivered')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    viewMode === 'delivered'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span>✓ Delivered</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    viewMode === 'delivered' ? 'bg-white text-emerald-800' : 'bg-emerald-200 text-emerald-900'
                  }`}>
                    {deliveryCounts.delivered}
                  </span>
                </button>
              </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-semibold">
              Showing <strong className="text-slate-900 font-bold">{filteredShipments.length}</strong> of {shipments.length} records
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs font-bold text-red-600 hover:underline flex items-center space-x-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset All ({activeFilterCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── TOOLBAR & DEDICATED SELECTABLE LISTS CARD ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          {/* Top Actions Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
            {/* Global Search */}
            <div className="flex-1 min-w-[280px] max-w-md relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Global search — Receipt, Container, Carrier, Commodity..."
                className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Export & Utility Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={exportToCSV}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                onClick={exportToExcel}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-green-700 hover:bg-green-800 text-white font-bold text-xs transition shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                onClick={exportToPDF}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition shadow-sm"
              >
                <FileType className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                onClick={exportToJPG}
                disabled={isExportingJpg}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition shadow-sm disabled:opacity-50"
              >
                {isExportingJpg ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                <span>JPG</span>
              </button>

              <div className="h-5 border-l border-slate-200" />

              <button
                onClick={() => setActiveFilterPanel((v) => !v)}
                className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl font-bold text-xs transition border ${
                  activeFilterPanel
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filter Panel</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-black">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <button
                onClick={fetchAllShipments}
                disabled={isLoading}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                title="Refresh Records"
              >
                <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* DEDICATED SELECTABLE LISTS FOR MAIN MARK, SUB MARK, RECEIPT NO, CONTAINER & DATES */}
          {activeFilterPanel && (
            <div className="p-4 space-y-4 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Dedicated Selectable Filter Lists</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Tick multiple values to filter across any combination
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Main Mark Selectable List */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1">
                    ★ Main Mark List
                  </label>
                  <MultiSelectDropdown
                    label="Main Marks"
                    options={uniqueMainMarks}
                    selected={selectedMainMarks}
                    onChange={setSelectedMainMarks}
                    counts={mainMarkCounts}
                  />
                </div>

                {/* 2. Sub Mark Selectable List */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-blue-700 mb-1">
                    ◆ Sub Mark List
                  </label>
                  <MultiSelectDropdown
                    label="Sub Marks"
                    options={uniqueSubMarks}
                    selected={selectedSubMarks}
                    onChange={setSelectedSubMarks}
                    counts={subMarkCounts}
                  />
                </div>

                {/* 3. Receipt No Selectable List */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Receipt No List
                  </label>
                  <MultiSelectDropdown
                    label="Receipts"
                    options={uniqueReceipts}
                    selected={selectedReceipts}
                    onChange={setSelectedReceipts}
                    counts={receiptCounts}
                  />
                </div>

                {/* 4. Container Alias Selectable List */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Container Alias List
                  </label>
                  <MultiSelectDropdown
                    label="Aliases"
                    options={uniqueContainers}
                    selected={selectedContainers}
                    onChange={setSelectedContainers}
                  />
                </div>

                {/* 5. Shipping Line Selectable List */}
                {showShippingLine && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                      Shipping Line List
                    </label>
                    <MultiSelectDropdown
                      label="Lines"
                      options={uniqueCarriers}
                      selected={selectedCarriers}
                      onChange={setSelectedCarriers}
                      counts={carrierCounts}
                    />
                  </div>
                )}

                {/* 6. Status Selectable List */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Status List
                  </label>
                  <MultiSelectDropdown
                    label="Statuses"
                    options={uniqueStatuses}
                    selected={selectedStatuses}
                    onChange={setSelectedStatuses}
                    counts={statusCounts}
                  />
                </div>
              </div>

              {/* Date Ranges & Turnaround Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                {/* Receipt Date Range Filter (Date of Receipt in DB) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Receipt Date Range (Date in DB)
                    </label>
                    {(receiptDateFrom || receiptDateTo) && (
                      <button
                        onClick={() => { setReceiptDateFrom(''); setReceiptDateTo(''); }}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="date"
                      value={receiptDateFrom}
                      onChange={(e) => setReceiptDateFrom(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-red-500 w-full"
                      title="Receipt Date From"
                    />
                    <span className="text-slate-400 text-xs">→</span>
                    <input
                      type="date"
                      value={receiptDateTo}
                      onChange={(e) => setReceiptDateTo(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-red-500 w-full"
                      title="Receipt Date To"
                    />
                  </div>
                </div>

                {/* ETA Date Range Filter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                      ETA Arrival Date Range
                    </label>
                    {(etaFrom || etaTo) && (
                      <button
                        onClick={() => { setEtaFrom(''); setEtaTo(''); }}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="date"
                      value={etaFrom}
                      onChange={(e) => setEtaFrom(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-red-500 w-full"
                      title="ETA From"
                    />
                    <span className="text-slate-400 text-xs">→</span>
                    <input
                      type="date"
                      value={etaTo}
                      onChange={(e) => setEtaTo(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-red-500 w-full"
                      title="ETA To"
                    />
                  </div>
                </div>

                {/* Turnaround / Delivery Status */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600">
                    Turnaround Status (Delivery Days)
                  </label>
                  <MultiSelectDropdown
                    label="Turnaround"
                    options={turnaroundOptions}
                    selected={selectedTurnaroundStatuses}
                    onChange={setSelectedTurnaroundStatuses}
                  />
                </div>
              </div>

              {/* Column Visibility & Row Mark Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700 text-xs flex items-center space-x-1">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                        <span>Column Visibility: Show/Hide Any Column</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMarks(true);
                          setShowMainMark(true);
                          setShowSubMark(true);
                          setShowReceiptNo(true);
                          setShowContainer(true);
                          setShowActualContainer(true);
                          setShowShippingLine(true);
                          setShowCommodity(true);
                          setShowCargoMetrics(true);
                          setShowReceiptDate(true);
                          setShowEtaDate(true);
                          setShowDaysToDeliver(true);
                          setShowStatus(true);
                          setShowDestination(true);
                          setShowSource(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold transition"
                      >
                        Show All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMarks(true);
                          setShowMainMark(true);
                          setShowSubMark(true);
                          setShowReceiptNo(true);
                          setShowContainer(true);
                          setShowActualContainer(false);
                          setShowShippingLine(false);
                          setShowCommodity(true);
                          setShowCargoMetrics(true);
                          setShowReceiptDate(true);
                          setShowEtaDate(true);
                          setShowDaysToDeliver(true);
                          setShowStatus(false);
                          setShowDestination(false);
                          setShowSource(false);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition"
                      >
                        Reset Defaults
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const isAnyRevealed =
                          showActualContainer ||
                          showShippingLine ||
                          showDestination ||
                          showSource ||
                          showStatus;
                        const next = !isAnyRevealed;
                        setShowActualContainer(next);
                        setShowShippingLine(next);
                        setShowDestination(next);
                        setShowSource(next);
                        setShowStatus(next);
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border shadow-2xs ${
                        showActualContainer || showShippingLine || showDestination || showSource || showStatus
                          ? 'bg-amber-100 text-amber-950 border-amber-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-950'
                      }`}
                      title="Carrier container, shipping line, destination, source, and current status"
                    >
                      {showActualContainer || showShippingLine || showDestination || showSource || showStatus ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                          <span>Hide Logistics (5 Columns)</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Quick Reveal Logistics</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showMarks ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Mark (★/◆)</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showMainMark ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showMainMark} onChange={(e) => setShowMainMark(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Main Mark</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showSubMark ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showSubMark} onChange={(e) => setShowSubMark(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Sub Mark</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showReceiptNo ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showReceiptNo} onChange={(e) => setShowReceiptNo(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Receipt No</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showContainer ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showContainer} onChange={(e) => setShowContainer(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Container Alias</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showActualContainer ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showActualContainer} onChange={(e) => setShowActualContainer(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Carrier Container</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showShippingLine ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showShippingLine} onChange={(e) => setShowShippingLine(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Shipping Line</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showCommodity ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showCommodity} onChange={(e) => setShowCommodity(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Commodity</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showCargoMetrics ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showCargoMetrics} onChange={(e) => setShowCargoMetrics(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Cargo (CTN/KGS/CBM)</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showReceiptDate ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showReceiptDate} onChange={(e) => setShowReceiptDate(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Receipt Date</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showEtaDate ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showEtaDate} onChange={(e) => setShowEtaDate(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>ETA Date</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showDaysToDeliver ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showDaysToDeliver} onChange={(e) => setShowDaysToDeliver(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Days to Deliver</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showStatus ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Status</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showDestination ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showDestination} onChange={(e) => setShowDestination(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Destination</span>
                    </label>
                    <label className={`inline-flex items-center space-x-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition select-none ${showSource ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'}`}>
                      <input type="checkbox" checked={showSource} onChange={(e) => setShowSource(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600" />
                      <span>Source (Warehouse)</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Row Marks:
                  </span>
                  <MultiSelectDropdown
                    label="Row Marks"
                    options={rowMarkOptions}
                    selected={selectedRowMarks}
                    onChange={setSelectedRowMarks}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ERROR STATE ── */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── DATA TABLE (WITH EXCEL MULTI-SELECT HEADERS ON ALL COLUMNS) ── */}
        <div ref={tableRef} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Table Header Banner */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600">
              <span className="font-black text-slate-900">US INTERNATIONAL LOGISTICS</span>
              <span className="text-slate-300">|</span>
              <span>Cargo Master Table</span>
              <span className="bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full font-black border border-red-200">
                {filteredShipments.length} records displayed
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{new Date().toLocaleDateString()}</span>
          </div>

          {isLoading ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-bold text-slate-600">Loading cargo shipments database...</p>
            </div>
          ) : filteredShipments.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <Box className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No matching cargo records</p>
              <p className="text-xs text-slate-400">
                Adjust your search parameters or select a different filter tab above.
              </p>
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition shadow-sm"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 select-none">
                    {/* 1. Mark */}
                    {showMarks && (
                      <th className="py-3 px-3 text-center w-12">
                        <div className="flex items-center justify-center">
                          <span>Mark</span>
                          <MultiSelectDropdown
                            label="Mark"
                            options={rowMarkOptions}
                            selected={selectedRowMarks}
                            onChange={setSelectedRowMarks}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 2. Main Mark */}
                    {showMainMark && (
                      <th className="py-3 px-3 text-left">
                        <div className="flex items-center">
                          <span>★ Main Mark</span>
                          <MultiSelectDropdown
                            label="Main Mark"
                            options={uniqueMainMarks}
                            selected={selectedMainMarks}
                            onChange={setSelectedMainMarks}
                            counts={mainMarkCounts}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 3. Sub Mark */}
                    {showSubMark && (
                      <th className="py-3 px-3 text-left">
                        <div className="flex items-center">
                          <span>◆ Sub Mark</span>
                          <MultiSelectDropdown
                            label="Sub Mark"
                            options={uniqueSubMarks}
                            selected={selectedSubMarks}
                            onChange={setSelectedSubMarks}
                            counts={subMarkCounts}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 4. Receipt No */}
                    {showReceiptNo && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Receipt No</span>
                          <MultiSelectDropdown
                            label="Receipt"
                            options={uniqueReceipts}
                            selected={selectedReceipts}
                            onChange={setSelectedReceipts}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 5. Container Alias */}
                    {showContainer && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Container Alias</span>
                          <MultiSelectDropdown
                            label="Container"
                            options={uniqueContainers}
                            selected={selectedContainers}
                            onChange={setSelectedContainers}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 6. Actual Carrier Container (Optional) */}
                    {showActualContainer && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Actual Container</span>
                          <MultiSelectDropdown
                            label="Actual Container"
                            options={uniqueActualContainers}
                            selected={selectedActualContainers}
                            onChange={setSelectedActualContainers}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 7. Shipping Line (Optional) */}
                    {showShippingLine && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Line</span>
                          <MultiSelectDropdown
                            label="Line"
                            options={uniqueCarriers}
                            selected={selectedCarriers}
                            onChange={setSelectedCarriers}
                            counts={carrierCounts}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 8. Commodity Description */}
                    {showCommodity && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Commodity</span>
                          <MultiSelectDropdown
                            label="Commodity"
                            options={uniqueCommodities}
                            selected={selectedCommodities}
                            onChange={setSelectedCommodities}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 9. Cartons (CTN) / Weight / Volume */}
                    {showCargoMetrics && <th className="py-3 px-4 text-left">Cartons (CTN) / KGS / CBM</th>}

                    {/* 10. Receipt Date (Date of Receipt in DB) */}
                    {showReceiptDate && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Receipt Date</span>
                        </div>
                      </th>
                    )}

                    {/* 11. ETA Arrival Date */}
                    {showEtaDate && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>ETA Date</span>
                        </div>
                      </th>
                    )}

                    {/* 12. Days to Deliver / Turnaround */}
                    {showDaysToDeliver && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Days to Deliver</span>
                          <MultiSelectDropdown
                            label="Turnaround"
                            options={turnaroundOptions}
                            selected={selectedTurnaroundStatuses}
                            onChange={setSelectedTurnaroundStatuses}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 13. Status */}
                    {showStatus && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Status</span>
                          <MultiSelectDropdown
                            label="Status"
                            options={uniqueStatuses}
                            selected={selectedStatuses}
                            onChange={setSelectedStatuses}
                            counts={statusCounts}
                            compact
                          />
                        </div>
                      </th>
                    )}

                    {/* 14. Destination */}
                    {showDestination && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Destination</span>
                        </div>
                      </th>
                    )}

                    {/* 15. Warehouse Entry */}
                    {showSource && (
                      <th className="py-3 px-4 text-left">
                        <div className="flex items-center">
                          <span>Warehouse Entry</span>
                          <MultiSelectDropdown
                            label="Warehouse"
                            options={uniqueWarehouseEntries}
                            selected={selectedWarehouseEntries}
                            onChange={setSelectedWarehouseEntries}
                            compact
                          />
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((item, idx) => {
                    const mark = rowMarks[item._id] || 'none';
                    const deliveryInfo = getDeliveryInfo(item);
                    const isArrived =
                      (item.status || '').toLowerCase().includes('arrived') ||
                      (item.status || '').toLowerCase().includes('custom') ||
                      deliveryInfo.isDelivered;

                    return (
                      <tr
                        key={item._id}
                        className={`border-b border-slate-100 transition-colors ${
                          mark === 'bold'
                            ? 'bg-amber-50 hover:bg-amber-100/70 font-semibold'
                            : mark === 'sub'
                            ? 'bg-blue-50 hover:bg-blue-100/70 font-semibold'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/50 hover:bg-slate-100/70'
                        }`}
                      >
                        {/* 1. Mark Toggle */}
                        {showMarks && (
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => cycleRowMark(item._id)}
                              title={
                                mark === 'none'
                                  ? 'Click to Primary Mark (★)'
                                  : mark === 'bold'
                                  ? 'Click to Sub-Mark (◆)'
                                  : 'Click to Unmark'
                              }
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:scale-110 mx-auto"
                            >
                              {mark === 'bold' ? (
                                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                              ) : mark === 'sub' ? (
                                <Bookmark className="w-4 h-4 fill-blue-500 text-blue-500" />
                              ) : (
                                <Star className="w-4 h-4 text-slate-200 hover:text-slate-400" />
                              )}
                            </button>
                          </td>
                        )}

                        {/* 2. Main Mark */}
                        {showMainMark && (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {item.mainMarka ? (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 max-w-[100px] truncate"
                                title={item.mainMarka}
                              >
                                ★ {item.mainMarka}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>
                        )}

                        {/* 3. Sub Mark */}
                        {showSubMark && (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {item.subMarka ? (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-300 max-w-[100px] truncate"
                                title={item.subMarka}
                              >
                                ◆ {item.subMarka}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>
                        )}

                        {/* 4. Receipt No */}
                        {showReceiptNo && (
                          <td className="py-2.5 px-4 font-mono font-black text-slate-950 whitespace-nowrap">
                            <span>{item.receipt}</span>
                            {item.party && (
                              <div className="font-sans font-medium text-[10px] text-slate-500 truncate max-w-[130px]" title={item.party}>
                                {item.party}
                              </div>
                            )}
                            {receiptContainers.get(item.receipt) && receiptContainers.get(item.receipt)!.size > 1 ? (
                              <span
                                className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center"
                                title={`Split Cargo: Loaded in ${receiptContainers.get(item.receipt)!.size} containers: ${Array.from(receiptContainers.get(item.receipt)!).join(', ')}`}
                              >
                                Split ({receiptContainers.get(item.receipt)!.size} Ctr)
                              </span>
                            ) : (receiptCounts[item.receipt] || 0) > 1 ? (
                              <span
                                className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300 inline-flex items-center"
                                title={`${receiptCounts[item.receipt]} items under this receipt`}
                              >
                                Multi ({receiptCounts[item.receipt]})
                              </span>
                            ) : null}
                          </td>
                        )}

                        {/* 5. Container Alias */}
                        {showContainer && (
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              {item.container}
                            </span>
                          </td>
                        )}

                        {/* 6. Actual Carrier Container */}
                        {showActualContainer && (
                          <td className="py-2.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap text-[11px]">
                            {item.containerNumber || (
                              <span className="text-slate-400 font-normal italic">Unassigned</span>
                            )}
                          </td>
                        )}

                        {/* 7. Shipping Line */}
                        {showShippingLine && (
                          <td className="py-2.5 px-4 whitespace-nowrap font-semibold text-slate-700">
                            {item.shippingLine || 'MSC'}
                          </td>
                        )}

                        {/* 8. Commodity Description */}
                        {showCommodity && (
                          <td className="py-2.5 px-4 max-w-[220px]">
                            <div className="font-bold text-slate-900 truncate">
                              {item.english || item.commodity}
                            </div>
                            {item.commodity && item.commodity !== item.english && (
                              <div className="text-[10px] text-slate-400 truncate">{item.commodity}</div>
                            )}
                          </td>
                        )}

                        {/* 9. Cartons (CTN) / KGS / CBM */}
                        {showCargoMetrics && (
                          <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                            <div>
                              <strong className="text-slate-900 font-bold">{item.quantity ?? '-'}</strong> CTN
                            </div>
                            <div className="text-slate-500 font-mono text-[10px]">
                              {item.weight ?? '-'} KGS | {item.volume ?? '-'} CBM
                            </div>
                          </td>
                        )}

                        {/* 10. Receipt Date */}
                        {showReceiptDate && (
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1 font-semibold text-slate-800">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{formatGlobalDate(item.date)}</span>
                            </div>
                          </td>
                        )}

                        {/* 11. ETA Date */}
                        {showEtaDate && (
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1 font-bold text-slate-950">
                              <Clock className="w-3 h-3 text-blue-500" />
                              <span>{formatGlobalDate(item.eta)}</span>
                            </div>
                          </td>
                        )}

                        {/* 12. Days to Deliver (Turnaround) */}
                        {showDaysToDeliver && (
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] border ${deliveryInfo.badgeClass}`}
                            >
                              <TrendingUp className="w-3 h-3 mr-1 shrink-0" />
                              {deliveryInfo.label}
                            </span>
                          </td>
                        )}

                        {/* 13. Status */}
                        {showStatus && (
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isArrived
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {item.status || 'In Transit'}
                            </span>
                          </td>
                        )}

                        {/* 14. Destination */}
                        {showDestination && (
                          <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-700 text-[11px]">
                            {item.shippedTo || 'India Port'}
                          </td>
                        )}

                        {/* 15. Warehouse Entry */}
                        {showSource && (
                          <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                            {item.warehouseEntry || '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </div>
        )}

        {/* ── TAB 2: CARGO MASTER TABLE (REDUX + TANSTACK TABLE + JS CHARTS) ── */}
        {activeEmployeeTab === 'containers' && (
          <div className="animate-fadeIn">
            <ReduxProvider>
              <CargoMasterTable isStaffOnly={userRole !== 'admin'} />
            </ReduxProvider>
          </div>
        )}

        {/* Footer info bar */}
        <div className="flex items-center justify-between py-3 px-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs text-slate-500 font-medium">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              <strong className="text-slate-800">Staff Portal (Read-Only)</strong> — Filter by Main Mark, Sub Mark, Receipt No, Container Alias, Turnaround days, or use the Excel column filter icon on any column.
            </span>
          </div>
          <span className="font-mono text-slate-400 hidden md:inline">USI LOGISTICS V2.0</span>
        </div>
      </div>
    </div>
  );
}
