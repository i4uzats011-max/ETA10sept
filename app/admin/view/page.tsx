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
  CheckSquare, Square
} from 'lucide-react';
import {
  calculateDaysToDeliver,
  parseReceiptDate,
  formatReceiptDate,
  isContainerLate,
  getDeliveryTurnaroundStatus
} from '@/lib/dateUtils';

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
            className="absolute top-full left-0 mt-1 z-50 bg-white text-slate-800 border border-slate-200 rounded-xl shadow-2xl min-w-[220px] max-w-[280px] max-h-72 flex flex-col font-normal text-xs"
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
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[240px] max-w-[320px] max-h-72 flex flex-col">
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

  // Column Visibility
  const [showActualContainer, setShowActualContainer] = useState(true);
  const [showShippingLine, setShowShippingLine] = useState(true);

  // Row Marking: 'bold' = primary mark (gold star), 'sub' = sub-mark (blue bookmark)
  const [rowMarks, setRowMarks] = useState<Record<string, MarkType>>({});

  // View Mode: 'all' vs 'late_default' (Default late list requested by user)
  const [viewMode, setViewMode] = useState<'all' | 'late'>('late');

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

  // Late containers summary state
  const [lateContainers, setLateContainers] = useState<any[]>([]);
  const [lateContainersLoading, setLateContainersLoading] = useState(false);

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
  const [setDatesShippedTo, setSetDatesShippedTo] = useState('Nhava Sheva / Mundra, India');
  const [setDatesShippingLine, setSetDatesShippingLine] = useState('MSC');
  const [setDatesBuffer, setSetDatesBuffer] = useState(true);
  const [isSavingDates, setIsSavingDates] = useState(false);
  const [setDatesFeedback, setSetDatesFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const SHIPPING_LINES_LIST = ['MSC', 'MAERSK', 'CMA_CGM', 'HAPAG_LLOYD', 'COSCO', 'ONE', 'EVERGREEN', 'YANG_MING', 'HMM', 'ZIM', 'PIL', 'WAN_HAI', 'OOCL'];

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
  const [showLatePanel, setShowLatePanel] = useState(true);

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
          fetchLateContainers();
        }
      })
      .catch(() => router.push('/admin/login'));
  }, [router]);

  const fetchLateContainers = async () => {
    setLateContainersLoading(true);
    try {
      const res = await fetch('/api/admin/late-containers');
      const data = await res.json();
      if (res.ok) setLateContainers(data.lateContainers || []);
    } catch {
      // silent
    } finally {
      setLateContainersLoading(false);
    }
  };

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

  // Turnaround categories
  const turnaroundOptions = ['Late (>35 days)', 'On Time (<=35 days)', 'Pending ETA'];
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
      const turnaround = getDeliveryTurnaroundStatus(item.date, item.eta, item.uploadedAt);
      const isLate = turnaround.isLate;

      // 1. Default Late List View Filter
      if (viewMode === 'late' && !isLate) return false;

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

      // 12. Turnaround / Late Status Filter
      if (selectedTurnaroundStatuses.size > 0) {
        let cat = 'Pending ETA';
        if (turnaround.days !== null) {
          cat = turnaround.isLate ? 'Late (>35 days)' : 'On Time (<=35 days)';
        } else if (turnaround.isLate) {
          cat = 'Late (>35 days)';
        }
        if (!selectedTurnaroundStatuses.has(cat)) return false;
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
  ]);

  // Mark row helper
  const cycleRowMark = useCallback((id: string) => {
    setRowMarks((prev) => {
      const cur = prev[id] || 'none';
      const next: MarkType = cur === 'none' ? 'bold' : cur === 'bold' ? 'sub' : 'none';
      return { ...prev, [id]: next };
    });
  }, []);

  // Total late count in entire dataset
  const totalLateCount = useMemo(() => {
    return shipments.filter((s) => isContainerLate(s.date, s.eta, s.uploadedAt)).length;
  }, [shipments]);

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
    if (viewMode === 'late') c++;
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
      const turnaround = getDeliveryTurnaroundStatus(s.date, s.eta, s.uploadedAt);
      const row: Record<string, any> = {
        Mark: rowMarks[s._id] === 'bold' ? '★ Primary' : rowMarks[s._id] === 'sub' ? '◆ Sub-Mark' : '',
        'Main Mark': s.mainMarka || '',
        'Sub Mark': s.subMarka || '',
        'Receipt No': s.receipt || '',
        'Container Alias': s.container || '',
      };
      if (showActualContainer) row['Actual Container No'] = s.containerNumber || '';
      if (showShippingLine) row['Shipping Line'] = s.shippingLine || '';
      row['Commodity (English)'] = s.english || s.commodity || '';
      row['Commodity (Chinese)'] = s.commodity || '';
      row['Quantity'] = s.quantity ?? '';
      row['Weight (kg)'] = s.weight ?? '';
      row['Volume (cbm)'] = s.volume ?? '';
      row['Receipt Date'] = s.date || 'N/A';
      row['ETA Date'] = s.eta || '';
      row['Days to Deliver'] = turnaround.label;
      row['Status'] = s.status || '';
      row['Warehouse Entry'] = s.warehouseEntry || '';
      return row;
    });

  const exportToCSV = () => {
    if (!filteredShipments.length) return;
    const rows = getExportRows();
    const headers = Object.keys(rows[0]);
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => headers.map((h) => `"${r[h] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `USI_Cargo_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFillColor(11, 25, 44);
      doc.rect(0, 0, 297, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('US INTERNATIONAL LOGISTICS — CARGO REPORT', 14, 14);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Date: ${new Date().toLocaleDateString()}   |   Records: ${filteredShipments.length}   |   Late: ${totalLateCount}`,
        190,
        14
      );

      const headers = ['Mark', 'Main Mark', 'Sub Mark', 'Receipt No', 'Container'];
      if (showActualContainer) headers.push('Actual Container');
      if (showShippingLine) headers.push('Line');
      headers.push('Commodity', 'Receipt Date', 'ETA Date', 'Turnaround', 'Status');

      const body = filteredShipments.map((s) => {
        const mark = rowMarks[s._id] === 'bold' ? '★' : rowMarks[s._id] === 'sub' ? '◆' : '';
        const turnaround = getDeliveryTurnaroundStatus(s.date, s.eta, s.uploadedAt);
        const row = [mark, s.mainMarka || '-', s.subMarka || '-', s.receipt || '', s.container || ''];
        if (showActualContainer) row.push(s.containerNumber || '-');
        if (showShippingLine) row.push(s.shippingLine || '-');
        row.push(
          s.english || s.commodity || '',
          s.date || '-',
          s.eta || 'Pending',
          turnaround.label,
          s.status || 'In Transit'
        );
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-base text-slate-950 tracking-tight">US INTERNATIONAL</span>
                <span className="font-black text-base text-blue-600 tracking-tight">LOGISTICS</span>
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 uppercase">
                  Staff Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold">
                Cargo Manifest Database &amp; Container Directory (Read-Only)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
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

            {userRole === 'admin' && (
              <Link
                href="/admin"
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm"
              >
                Super Admin
              </Link>
            )}
            <Link
              href="/"
              className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
            >
              Public Tracker
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl border border-slate-200 hover:bg-red-50 text-slate-500 hover:text-red-600 transition"
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

        {/* ── LATE CONTAINERS COLLAPSIBLE ALERT PANEL ── */}
        {(lateContainers.length > 0 || lateContainersLoading) && (
          <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 bg-red-50 border-b border-red-200 cursor-pointer"
              onClick={() => setShowLatePanel((v) => !v)}
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="font-black text-sm text-red-900">
                  Late Shipments Priority Alert ({lateContainers.length})
                </span>
                <span className="text-xs text-red-700 font-semibold hidden sm:inline">
                  — ETA exceeds 35 days from receipt date
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs font-bold text-red-600">
                <span>{showLatePanel ? 'Hide Alert' : 'Show Details'}</span>
                <span>{showLatePanel ? '▲' : '▼'}</span>
              </div>
            </div>

            {showLatePanel && (
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs">
                  <thead className="bg-red-100/50 border-b border-red-200 text-[10px] uppercase font-bold text-red-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4 text-left">Receipt</th>
                      <th className="py-2.5 px-4 text-left">Container</th>
                      <th className="py-2.5 px-4 text-left">Main Mark</th>
                      <th className="py-2.5 px-4 text-left">Sub Mark</th>
                      <th className="py-2.5 px-4 text-left">Commodity</th>
                      <th className="py-2.5 px-4 text-left">Receipt Date</th>
                      <th className="py-2.5 px-4 text-left">ETA Date</th>
                      <th className="py-2.5 px-4 text-left">Days to Deliver</th>
                      <th className="py-2.5 px-4 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateContainers.map((lc, i) => (
                      <tr
                        key={String(lc._id)}
                        className={`border-b border-red-100 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}`}
                      >
                        <td className="py-2 px-4 font-mono font-black text-slate-900">{lc.receipt}</td>
                        <td className="py-2 px-4 font-mono font-bold text-slate-700">{lc.container}</td>
                        <td className="py-2 px-4">
                          {lc.mainMarka ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                              ★ {lc.mainMarka}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {lc.subMarka ? (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded border border-blue-300">
                              ◆ {lc.subMarka}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4 max-w-[160px] truncate text-slate-700">
                          {lc.commodity || '—'}
                        </td>
                        <td className="py-2 px-4 text-slate-600 font-mono">{lc.receiptDate || 'N/A'}</td>
                        <td className="py-2 px-4 font-bold text-red-700 font-mono">{lc.eta || 'N/A'}</td>
                        <td className="py-2 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white">
                            {lc.daysToDeliver}d (+{lc.daysOverLimit}d over 35d)
                          </span>
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-600">{lc.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 1: CARGO SHIPMENTS TABLE & FILTERS ── */}
        {activeEmployeeTab === 'shipments' && (
          <div className="space-y-4 animate-fadeIn">
{/* ── PRIMARY VIEW MODE TABS (Default: Late Containers) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('late')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
                viewMode === 'late'
                  ? 'bg-red-600 text-white shadow-red-600/20'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-300" />
              <span>Late Containers (&gt;35 Days)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                viewMode === 'late' ? 'bg-white text-red-700' : 'bg-red-100 text-red-700'
              }`}>
                {totalLateCount}
              </span>
            </button>

            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
                viewMode === 'all'
                  ? 'bg-slate-900 text-white shadow-slate-900/20'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Box className="w-4 h-4 text-blue-400" />
              <span>All Shipments</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                viewMode === 'all' ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
              }`}>
                {shipments.length}
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
                <div className="flex items-center space-x-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Columns:
                  </span>
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showActualContainer}
                      onChange={(e) => setShowActualContainer(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-red-600"
                    />
                    <span className="font-semibold text-slate-700">Carrier Container</span>
                  </label>
                  <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showShippingLine}
                      onChange={(e) => setShowShippingLine(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-red-600"
                    />
                    <span className="font-semibold text-slate-700">Shipping Line</span>
                  </label>
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
                {viewMode === 'late'
                  ? 'No late containers found. Switch to "All Shipments" to view full database.'
                  : 'Adjust your search parameters or click "Reset All" above.'}
              </p>
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition shadow-sm"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 select-none">
                    {/* 1. Mark */}
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

                    {/* 2. Main Mark */}
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

                    {/* 3. Sub Mark */}
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

                    {/* 4. Receipt No */}
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

                    {/* 5. Container Alias */}
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

                    {/* 9. Qty / Weight / Vol */}
                    <th className="py-3 px-4 text-left">Qty / Wt / Vol</th>

                    {/* 10. Receipt Date (Date of Receipt in DB) */}
                    <th className="py-3 px-4 text-left">
                      <div className="flex items-center">
                        <span>Receipt Date</span>
                      </div>
                    </th>

                    {/* 11. ETA Arrival Date */}
                    <th className="py-3 px-4 text-left">
                      <div className="flex items-center">
                        <span>ETA Date</span>
                      </div>
                    </th>

                    {/* 12. Days to Deliver / Turnaround */}
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

                    {/* 13. Status */}
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

                    {/* 14. Warehouse Entry */}
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
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((item, idx) => {
                    const mark = rowMarks[item._id] || 'none';
                    const turnaround = getDeliveryTurnaroundStatus(item.date, item.eta, item.uploadedAt);
                    const isArrived =
                      (item.status || '').toLowerCase().includes('arrived') ||
                      (item.status || '').toLowerCase().includes('custom');

                    return (
                      <tr
                        key={item._id}
                        className={`border-b border-slate-100 transition-colors ${
                          mark === 'bold'
                            ? 'bg-amber-50 hover:bg-amber-100/70 font-semibold'
                            : mark === 'sub'
                            ? 'bg-blue-50 hover:bg-blue-100/70 font-semibold'
                            : turnaround.isLate
                            ? 'bg-red-50/40 hover:bg-red-50/70'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/50 hover:bg-slate-100/70'
                        }`}
                      >
                        {/* 1. Mark Toggle */}
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

                        {/* 2. Main Mark */}
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

                        {/* 3. Sub Mark */}
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

                        {/* 4. Receipt No */}
                        <td className="py-2.5 px-4 font-mono font-black text-slate-950 whitespace-nowrap">
                          <span>{item.receipt}</span>
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

                        {/* 5. Container Alias */}
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {item.container}
                          </span>
                        </td>

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
                        <td className="py-2.5 px-4 max-w-[220px]">
                          <div className="font-bold text-slate-900 truncate">
                            {item.english || item.commodity}
                          </div>
                          {item.commodity && item.commodity !== item.english && (
                            <div className="text-[10px] text-slate-400 truncate">{item.commodity}</div>
                          )}
                        </td>

                        {/* 9. Qty / Weight / Vol */}
                        <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                          <div>
                            <strong className="text-slate-900">{item.quantity ?? '-'}</strong> pcs
                          </div>
                          <div className="text-slate-400">
                            {item.weight ?? '-'}kg | {item.volume ?? '-'}cbm
                          </div>
                        </td>

                        {/* 10. Receipt Date */}
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-1 font-semibold text-slate-800">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{item.date || 'N/A'}</span>
                          </div>
                        </td>

                        {/* 11. ETA Date */}
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-1 font-bold text-slate-950">
                            <Clock className="w-3 h-3 text-red-500" />
                            <span>{item.eta || 'Pending'}</span>
                          </div>
                        </td>

                        {/* 12. Days to Deliver (Turnaround) */}
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] border ${turnaround.badgeClass}`}
                          >
                            <TrendingUp className="w-3 h-3 mr-1 shrink-0" />
                            {turnaround.label}
                          </span>
                        </td>

                        {/* 13. Status */}
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

                        {/* 14. Warehouse Entry */}
                        <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                          {item.warehouseEntry || '—'}
                        </td>
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

        {/* ── TAB 2: CONTAINER FLEET (TABLE VIEW) ── */}
        {activeEmployeeTab === 'containers' && (
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden space-y-4 animate-fadeIn">
            {/* Header & Controls */}
            <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Container Fleet &amp; Transit Directory</h3>
                  <p className="text-xs text-slate-500">
                    Table format view with ETA dates, destinations, current status, shipping company name, and China loading dates.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={containerFleetSearch}
                    onChange={(e) => setContainerFleetSearch(e.target.value)}
                    placeholder="Search container, line, port, status..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {containerFleetSearch && (
                    <button
                      onClick={() => setContainerFleetSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  onClick={fetchContainerFleet}
                  disabled={isContainerFleetLoading}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                  title="Refresh Fleet Data"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isContainerFleetLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              {isContainerFleetLoading ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-semibold">Loading container directory...</p>
                </div>
              ) : filteredContainerFleet.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <Box className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">No Containers Found</p>
                  <p className="text-xs">
                    {containerFleetSearch ? 'Try clearing your search query' : 'No active containers in the database yet'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Container Alias</th>
                      <th className="py-3 px-4">Carrier Container No</th>
                      <th className="py-3 px-4">Company Name (Line)</th>
                      <th className="py-3 px-4">Loading Date (China)</th>
                      <th className="py-3 px-4">Route (Origin → Destination)</th>
                      <th className="py-3 px-4">Destination ETA</th>
                      <th className="py-3 px-4">Current Status &amp; Location</th>
                      <th className="py-3 px-4 text-center">Packages</th>
                      <th className="py-3 px-4 text-center">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredContainerFleet.map((c, idx) => {
                      const daysLeft = c.eta && c.eta !== 'N/A' ? Math.ceil((new Date(c.eta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                      return (
                        <tr key={c.container || idx} className="hover:bg-blue-50/40 transition">
                          {/* Container Alias */}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                              <strong className="font-mono font-bold text-sm text-slate-950">{c.container}</strong>
                            </div>
                          </td>

                          {/* Carrier Container No */}
                          <td className="py-3 px-4">
                            {c.containerNumber ? (
                              <span className="font-mono text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                {c.containerNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Unmapped</span>
                            )}
                          </td>

                          {/* Shipping Company Name */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              {c.shippingLine || 'MSC'}
                            </span>
                          </td>

                          {/* Loading Date from China */}
                          <td className="py-3 px-4">
                            {c.startDate ? (
                              <span className="inline-flex items-center space-x-1.5 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{c.startDate}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Not entered</span>
                            )}
                          </td>

                          {/* Route */}
                          <td className="py-3 px-4">
                            <div className="text-slate-700 font-medium text-[11px]">
                              <span className="text-slate-900 font-semibold">{c.shippedFrom || 'China'}</span>
                              <span className="text-slate-400 mx-1.5">→</span>
                              <span className="text-blue-900 font-semibold">{c.destination || c.shippedTo || 'India'}</span>
                            </div>
                          </td>

                          {/* Destination ETA */}
                          <td className="py-3 px-4">
                            {c.eta && c.eta !== 'N/A' ? (
                              <div>
                                <div className="font-bold font-mono text-slate-900">{c.eta}</div>
                                {daysLeft !== null && (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      daysLeft < 0
                                        ? 'bg-slate-100 text-slate-600'
                                        : daysLeft <= 5
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {daysLeft < 0 ? 'Arrived' : daysLeft === 0 ? 'Arriving Today' : `${daysLeft}d left`}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Pending ETA</span>
                            )}
                          </td>

                          {/* Current Status & Location */}
                          <td className="py-3 px-4">
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900">
                                {c.status || 'In Transit'}
                              </span>
                              {c.currentLocation && (
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]" title={c.currentLocation}>
                                  📍 {c.currentLocation}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Cargo Items */}
                          <td className="py-3 px-4 text-center">
                            <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                              {c.shipmentCount ?? 0}
                            </span>
                          </td>

                          {/* Action / Mode */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold">
                              Read-Only
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
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
