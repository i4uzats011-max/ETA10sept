'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  calculateDaysToDeliver,
  parseReceiptDate,
  formatReceiptDate,
  formatGlobalDate,
  isContainerLate,
  getDeliveryTurnaroundStatus,
} from '@/lib/dateUtils';
import CargoMasterTable from '@/components/CargoMasterTable';
import { ReduxProvider } from '@/store/ReduxProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  Upload,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  CheckSquare,
  Square,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  X,
  Truck,
  Box,
  Layers,
  ArrowRight,
  Globe,
  Anchor,
  Navigation,
  Activity,
  Zap,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  FileSpreadsheet,
  Check,
  Settings2,
  Table,
  Plus,
} from 'lucide-react';

const SHIPPING_LINES = [
  'MSC',
  'MAERSK',
  'CMA_CGM',
  'HAPAG_LLOYD',
  'COSCO',
  'ONE',
  'EVERGREEN',
  'YANG_MING',
  'HMM',
  'ZIM',
  'PIL',
];


// Reusable MultiSelect Dropdown for Admin Filter Lists
function AdminMultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  counts,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  counts?: Record<string, number>;
}) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition ${
          isActive
            ? 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-100'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        }`}
      >
        <span className="truncate">
          {selected.size === 0
            ? `All ${label}`
            : selected.size === options.length
            ? `All ${label} (${options.length})`
            : `${label}: ${selected.size} sel.`}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-1 shrink-0 transition-transform text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl min-w-[220px] max-w-[300px] max-h-72 flex flex-col font-normal text-xs">
          <div className="p-2.5 border-b border-slate-100 bg-slate-50 rounded-t-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                {label} Filter ({options.length})
              </span>
              <div className="flex items-center space-x-1.5 text-[10px] font-bold">
                <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">Select All</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={clearAll} className="text-red-500 hover:underline">Clear</button>
              </div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label}...`}
              className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 bg-white"
              autoFocus
            />
          </div>

          <div className="overflow-y-auto flex-1 p-1 max-h-48">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-xs italic">No matches</div>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer text-xs font-medium text-slate-800"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <input
                      type="checkbox"
                      checked={selected.has(opt)}
                      onChange={() => toggle(opt)}
                      className="w-3.5 h-3.5 rounded text-red-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="truncate">{opt || '(Blank)'}</span>
                  </div>
                  {counts && counts[opt] !== undefined && (
                    <span className="text-[10px] text-slate-400 ml-2 font-mono">{counts[opt]}</span>
                  )}
                </label>
              ))
            )}
          </div>

          <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 rounded-b-xl px-3">
            <span>{selected.size === 0 ? 'All' : `${selected.size} selected`}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-0.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 text-[11px]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // 3-Column Container Update state
  const [distinctContainers, setDistinctContainers] = useState<string[]>([]);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [actualContainerNo, setActualContainerNo] = useState('');
  const [shippingLine, setShippingLine] = useState('MSC');
  const [isUpdatingContainer, setIsUpdatingContainer] = useState(false);
  const [containerUpdateStatus, setContainerUpdateStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Manual Container ETA Fetch Tool state
  const [manualSyncContainer, setManualSyncContainer] = useState('');
  const [detectedActualNo, setDetectedActualNo] = useState('');
  const [manualSyncLine, setManualSyncLine] = useState('MSC');
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncStatus, setManualSyncStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [liveJsonCargoDetails, setLiveJsonCargoDetails] = useState<any | null>(null);

  // Modern Modular Menu Bar Tabs state
  type AdminTab = 'shipments' | 'containers' | 'upload' | 'api-sync' | 'manual-eta' | 'alerts';
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('shipments');

  // Container Fleet Directory state (Table view)
  const [containerFleet, setContainerFleet] = useState<any[]>([]);
  const [isContainerFleetLoading, setIsContainerFleetLoading] = useState(false);
  const [containerFleetSearch, setContainerFleetSearch] = useState('');

  // Manual ETA & Loading Date from China Tool state
  const [manualEtaContainer, setManualEtaContainer] = useState('');
  const [manualLoadingDate, setManualLoadingDate] = useState('');
  const [manualEtaDateInput, setManualEtaDateInput] = useState('');
  const [manualStatusInput, setManualStatusInput] = useState('In Transit');
  const [manualShippedFrom, setManualShippedFrom] = useState('Ningbo / Shanghai, China');
  const [manualShippedTo, setManualShippedTo] = useState('Nhava Sheva / Mundra, India');
  const [manualShippingCompany, setManualShippingCompany] = useState('MSC');
  const [applyFilingBuffer, setApplyFilingBuffer] = useState(true);
  const [isSettingManualEta, setIsSettingManualEta] = useState(false);
  const [manualEtaStatus, setManualEtaStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // JSONCargo API Key Stats state
  const [apiStats, setApiStats] = useState<any | null>(null);

  // CSV / Excel Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uploadMode, setUploadMode] = useState<'append' | 'update'>('append');
  // --- FILE HEADER INSPECTION & VALIDATION BEFORE UPLOADING ---
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileSheets, setFileSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [totalFileRows, setTotalFileRows] = useState<number>(0);
  const [isInspectingFile, setIsInspectingFile] = useState(false);
  const [headerCheckError, setHeaderCheckError] = useState<string | null>(null);
  const [showMappingDetail, setShowMappingDetail] = useState(false);

  // Column Mappings (System Field -> File Column Name)
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({
    container: '',
    receipt: '',
    mainMarka: '',
    subMarka: '',
    date: '',
    commodity: '',
    english: '',
    quantity: '',
    weight: '',
    volume: '',
    warehouseEntry: '',
    warehouse: '',
    stockstatus: '',
    packaging: '',
    eta: '',
    status: '',
    shippingLine: '',
    containerNumber: '',
  });

  // Candidate alias dictionary for automatic header matching
  const HEADER_CANDIDATES: Record<string, string[]> = {
    container: ['container', 'containernumber', 'container_number', 'container no', 'container_no', 'container alias', 'container_alias', 'cntr', 'cntr no', 'cntr_no', 'cntrno', 'container id', 'container_id'],
    receipt: ['receipt', 'receipt no', 'receipt_no', 'receipt number', 'receipt_number', 'bill_no', 'bill no', 'bill_number', 'bill number', 'bl no', 'bl_no', 'b/l no', 'b/l', 'rcpt', 'bill'],
    mainMarka: ['main_marka', 'main marka', 'main_mark', 'main mark', 'mainmarka', 'mainmark', 'marks', 'mark', 'marka', 'main_mark_name', 'shipper mark', 'shipping mark'],
    subMarka: ['sub_marka', 'sub marka', 'sub_mark', 'sub mark', 'submarka', 'submark', 'sub marks', 'sub_marks', 'sub'],
    date: ['date', 'receipt date', 'receipt_date', 'date of receipt', 'rcpt date', 'receiving date', 'entry date', 'inward date'],
    commodity: ['commodity', '中文品名', '中文', 'goods', 'cargo', 'item', 'description', 'chinese', 'chineseName', 'commodity_cn'],
    english: ['english', 'english description', 'english name', 'description in english', 'item english'],
    quantity: ['quantity', 'qty', 'ctns', 'cartons', 'pcs', 'packages', 'pkg qty', 'total qty', 'total packages', 'boxes', 'no of pkgs'],
    weight: ['weight', 'gross weight', 'gw', 'wt', 'weight (kg)', 'weight(kg)', 'kgs', 'gross wt', 'total weight'],
    volume: ['volumem', 'volumem³', 'volumemü', 'volume', 'vol', 'cbm', 'volume (cbm)', 'volume(cbm)', 'm3', 'cbm volume'],
    warehouseEntry: ['warehouse entry', 'warehouseentry', 'warehouse_entry', 'entry no', 'entry_no', 'wh entry', 'wh_entry'],
    warehouse: ['warehouse', 'wh', 'warehouse name', 'godown'],
    stockstatus: ['stockstatus', 'stock status', 'stock_status', 'status of stock', 'stock'],
    packaging: ['packaging', 'pkg', 'package type', 'packing', 'packing type'],
    eta: ['eta', 'eta date', 'arrival date', 'expected arrival'],
    status: ['status', 'container status', 'delivery status'],
    shippingLine: ['shippingline', 'shipping line', 'shipping_line', 'carrier', 'line'],
    containerNumber: ['containernumber', 'container_number', 'actual container', 'actual container no', 'carrier container'],
  };

  const autoMatchHeaders = (rawHeaders: string[]) => {
    const matched: Record<string, string> = {
      container: '',
      receipt: '',
      mainMarka: '',
      subMarka: '',
      date: '',
      commodity: '',
      english: '',
      quantity: '',
      weight: '',
      volume: '',
      warehouseEntry: '',
      warehouse: '',
      stockstatus: '',
      packaging: '',
      eta: '',
      status: '',
      shippingLine: '',
      containerNumber: '',
    };

    Object.entries(HEADER_CANDIDATES).forEach(([fieldKey, candidates]) => {
      const found = rawHeaders.find((h) => {
        const cleaned = h.trim().replace(/^[\uFEFF\uFFFE]/, '').toLowerCase();
        return candidates.some((c) => c.trim().toLowerCase() === cleaned);
      });
      if (found) {
        matched[fieldKey] = found;
      }
    });

    return matched;
  };

  // Inspect selected file headers before uploading
  const inspectSelectedFile = async (file: File, sheetOverride?: string) => {
    setIsInspectingFile(true);
    setHeaderCheckError(null);
    try {
      const buffer = await file.arrayBuffer();
      const fn = file.name.toLowerCase();
      const isExcel = fn.endsWith('.xlsx') || fn.endsWith('.xls');

      let headers: string[] = [];
      let rows: Record<string, any>[] = [];
      let sheets: string[] = [];
      let activeSheet = '';

      if (isExcel) {
        const wb = XLSX.read(buffer, { type: 'array' });
        sheets = wb.SheetNames;
        activeSheet = sheetOverride || sheets[0];
        const ws = wb.Sheets[activeSheet];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      } else {
        // CSV parsing using XLSX (handles diverse encodings & BOM)
        const wb = XLSX.read(buffer, { type: 'array', raw: false });
        sheets = wb.SheetNames;
        activeSheet = sheets[0];
        const ws = wb.Sheets[activeSheet];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      if (rows.length === 0) {
        throw new Error('File has no data rows');
      }

      headers = Object.keys(rows[0]).filter((h) => h && !h.startsWith('__EMPTY'));
      setFileHeaders(headers);
      setFileSheets(sheets);
      setSelectedSheet(activeSheet);
      setTotalFileRows(rows.length);
      setSampleRows(rows.slice(0, 3));

      // Auto match headers
      const matched = autoMatchHeaders(headers);
      setHeaderMapping(matched);

      if (!matched.container) {
        setHeaderCheckError(
          "Could not auto-detect 'Container' column. Please select which column represents the Container alias below."
        );
      }
    } catch (err: any) {
      setHeaderCheckError(err?.message || 'Failed to inspect file headers');
      setFileHeaders([]);
      setSampleRows([]);
      setTotalFileRows(0);
    } finally {
      setIsInspectingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    setUploadStatus(null);
    if (file) {
      inspectSelectedFile(file);
    } else {
      setFileHeaders([]);
      setSampleRows([]);
      setTotalFileRows(0);
    }
  };

  const handleSheetSwitch = (newSheet: string) => {
    if (!uploadFile || !newSheet) return;
    setSelectedSheet(newSheet);
    inspectSelectedFile(uploadFile, newSheet);
  };

  const handleUpdateMapping = (fieldKey: string, columnHeader: string) => {
    setHeaderMapping((prev) => ({
      ...prev,
      [fieldKey]: columnHeader,
    }));
    if (fieldKey === 'container' && columnHeader) {
      setHeaderCheckError(null);
    }
  };

  const resetUploadFile = () => {
    setUploadFile(null);
    setFileHeaders([]);
    setFileSheets([]);
    setSelectedSheet('');
    setSampleRows([]);
    setTotalFileRows(0);
    setHeaderCheckError(null);
    setUploadStatus(null);
  };


  // Search-First Table state
  const [searchQuery, setSearchQuery] = useState('');
  // Filter States for Dedicated Selectable Lists (Main Mark, Sub Mark, Receipt, etc.)
  const [selectedMainMarks, setSelectedMainMarks] = useState<Set<string>>(new Set());
  const [selectedSubMarks, setSelectedSubMarks] = useState<Set<string>>(new Set());
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [selectedContainersFilter, setSelectedContainersFilter] = useState<Set<string>>(new Set());
  const [selectedCarriersFilter, setSelectedCarriersFilter] = useState<Set<string>>(new Set());
  const [selectedStatusesFilter, setSelectedStatusesFilter] = useState<Set<string>>(new Set());
  const [receiptDateFrom, setReceiptDateFrom] = useState('');
  const [receiptDateTo, setReceiptDateTo] = useState('');
  const [showLateOnly, setShowLateOnly] = useState(false);
  const [activeAdminFilterPanel, setActiveAdminFilterPanel] = useState(true);

  const [shipments, setShipments] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [tableStatus, setTableStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Multi-select & Bulk actions state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [editingShipment, setEditingShipment] = useState<any | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    container: '',
    containerNumber: '',
    shippingLine: '',
    warehouse: '',
    stockstatus: '',
  });
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [newEntryData, setNewEntryData] = useState({
    receipt: '',
    container: '',
    containerNumber: '',
    shippingLine: 'MSC',
    mainMarka: '',
    subMarka: '',
    date: '',
    english: '',
    commodity: '',
    quantity: '',
    weight: '',
    volume: '',
    warehouse: '',
    warehouseEntry: '',
    stockstatus: 'In stock',
    packaging: '',
    eta: 'N/A',
    status: 'Pending',
  });

  // Manual Sync State
  const [isSyncingCron, setIsSyncingCron] = useState(false);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);

  // Late Containers & ETA Sync Schedule State
  const [lateContainers, setLateContainers] = useState<any[]>([]);
  const [needsSyncContainers, setNeedsSyncContainers] = useState<any[]>([]);
  // Carrier Outage Alerts (>5 errors in 7 days) & Failed Sync List
  const [carrierOutageAlerts, setCarrierOutageAlerts] = useState<any[]>([]);
  const [failedSyncList, setFailedSyncList] = useState<any[]>([]);
  const [syncAlertsLoading, setSyncAlertsLoading] = useState(false);
  const [showCarrierOutageBanner, setShowCarrierOutageBanner] = useState(true);

  const [lateContainersLoading, setLateContainersLoading] = useState(false);
  const [showLatePanel, setShowLatePanel] = useState(true);
  const [showSyncPanel, setShowSyncPanel] = useState(true);

  // 1. Check Authentication on Mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.push('/admin/login');
        } else {
          return res.json();
        }
      })
      .then((data) => {
        if (data) {
          if (data.role === 'staff') {
            router.push('/admin/view');
          } else {
            setIsAuthenticated(true);
            fetchDistinctContainers();
            fetchContainerFleet();
            fetchApiStats();
            fetchLateContainers();
            fetchSyncAlerts();
          }
        }
      })
      .catch(() => {
        router.push('/admin/login');
      });
  }, [router]);

  const fetchDistinctContainers = async () => {
    try {
      const res = await fetch('/api/admin/containers');
      const data = await res.json();
      if (res.ok && data.containers && data.containers.length > 0) {
        setDistinctContainers(data.containers);
        if (!selectedContainer) {
          setSelectedContainer(data.containers[0]);
          setManualEtaContainer(data.containers[0]);
          handleContainerSelectionChange(data.containers[0]);
        }
      }
    } catch {
      // Ignore initial container list errors
    }
  };

  const fetchContainerFleet = async () => {
    setIsContainerFleetLoading(true);
    try {
      const res = await fetch('/api/containers/list');
      const data = await res.json();
      if (res.ok && data.containers) {
        setContainerFleet(data.containers);
      }
    } catch {
      // Ignore fleet error
    } finally {
      setIsContainerFleetLoading(false);
    }
  };

  
  const fetchSyncAlerts = async () => {
    setSyncAlertsLoading(true);
    try {
      const res = await fetch('/api/admin/sync-alerts');
      const data = await res.json();
      if (res.ok) {
        setCarrierOutageAlerts(data.carrierOutageAlerts || []);
        setFailedSyncList(data.failedSyncList || []);
      }
    } catch {
      // Non-critical, fail silently
    } finally {
      setSyncAlertsLoading(false);
    }
  };

  const handleJumpToManualEta = (containerAlias: string, company?: string) => {
    setActiveAdminTab('manual-eta');
    if (containerAlias) {
      setManualEtaContainer(containerAlias);
      setSelectedContainer(containerAlias);
    }
    if (company) {
      setManualShippingCompany(company);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchLateContainers = async () => {
    setLateContainersLoading(true);
    try {
      const res = await fetch('/api/admin/late-containers');
      const data = await res.json();
      if (res.ok) {
        setLateContainers(data.lateContainers || []);
        setNeedsSyncContainers(data.needsSyncContainers || []);
      }
    } catch {
      // Non-critical, silent fail
    } finally {
      setLateContainersLoading(false);
    }
  };

  // Auto Lookup actual container & company when user selects from dropdown
  const handleContainerSelectionChange = async (alias: string) => {
    setManualSyncContainer(alias);
    setManualEtaContainer(alias);
    if (!alias) return;

    try {
      const res = await fetch(`/api/admin/container-details?container=${encodeURIComponent(alias)}`);
      const data = await res.json();
      if (res.ok) {
        setDetectedActualNo(data.containerNumber || alias);
        setManualSyncLine(data.shippingLine || 'MSC');
        if (data.startDate) setManualLoadingDate(data.startDate);
        if (data.eta && data.eta !== 'N/A') setManualEtaDateInput(data.eta);
        if (data.shippedFrom) setManualShippedFrom(data.shippedFrom);
        if (data.shippedTo) setManualShippedTo(data.shippedTo);
        if (data.shippingLine) setManualShippingCompany(data.shippingLine);
        if (data.status) setManualStatusInput(data.status);
      }
    } catch {
      // Fallback
    }
  };

  const fetchApiStats = async () => {
    try {
      const res = await fetch('/api/admin/jsoncargo-stats');
      const data = await res.json();
      if (res.ok && !data.error) {
        setApiStats(data);
      }
    } catch {
      // Ignore stats fetch error
    }
  };

  // 2. Handle 3-Column Container Update
  const handleUpdateContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContainer || !actualContainerNo || !shippingLine) {
      setContainerUpdateStatus({ type: 'error', message: 'All 3 fields are required' });
      return;
    }

    setIsUpdatingContainer(true);
    setContainerUpdateStatus(null);

    try {
      const res = await fetch('/api/containers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: selectedContainer,
          actualContainerNo,
          shippingLine,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update container mapping');
      }

      setContainerUpdateStatus({
        type: 'success',
        message: `Mapped alias '${selectedContainer}' to actual container '${actualContainerNo}' (${shippingLine}) and fetched live ETA from JSONCargo! (${data.syncedTracking.eta})`,
      });

      setActualContainerNo('');
      fetchDistinctContainers();
      fetchApiStats();

      if (searchQuery) {
        handleSearch();
      }
    } catch (err: any) {
      setContainerUpdateStatus({ type: 'error', message: err.message || 'Container mapping failed' });
    } finally {
      setIsUpdatingContainer(false);
    }
  };

  // 3. Handle Manual Container ETA Fetch Tool (JSONCargo API)
  const handleManualContainerEtaSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSyncContainer) {
      setManualSyncStatus({ type: 'error', message: 'Please select a container from the dropdown list' });
      return;
    }

    setIsManualSyncing(true);
    setManualSyncStatus(null);
    setLiveJsonCargoDetails(null);

    try {
      const res = await fetch('/api/containers/sync-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: manualSyncContainer,
          shippingLine: manualSyncLine,
        }),
      });

      const data = await res.json();

      if (data.warning) {
        setManualSyncStatus({
          type: 'warning',
          message: data.message,
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Manual ETA sync failed');

      setManualSyncStatus({
        type: 'success',
        message: `Selected '${data.publicAlias}' → Found Actual Container '${data.containerNumber}' (${data.shippingLine}) in Database → Called JSONCargo API → Updated ETA to '${data.eta}' in Database!`,
      });

      setLiveJsonCargoDetails(data.dataDetails);
      fetchApiStats();

      if (searchQuery) handleSearch();
    } catch (err: any) {
      setManualSyncStatus({ type: 'error', message: err.message || 'Failed to sync ETA via JSONCargo' });
    } finally {
      setIsManualSyncing(false);
    }
  };

  // 4. Handle Manual ETA Date & China Loading Date Override
  const handleManualEtaOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEtaContainer) {
      setManualEtaStatus({ type: 'error', message: 'Please select a container identifier' });
      return;
    }

    if (!manualEtaDateInput && !manualLoadingDate && !manualStatusInput) {
      setManualEtaStatus({ type: 'error', message: 'Please enter at least a Loading Date from China or ETA Date' });
      return;
    }

    setIsSettingManualEta(true);
    setManualEtaStatus(null);

    try {
      const res = await fetch('/api/containers/manual-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: manualEtaContainer,
          loadingDate: manualLoadingDate,
          startDate: manualLoadingDate,
          manualEta: manualEtaDateInput,
          destinationDate: manualEtaDateInput,
          status: manualStatusInput,
          shippedFrom: manualShippedFrom,
          shippedTo: manualShippedTo,
          shippingLine: manualShippingCompany,
          applyFilingBuffer,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to update container dates');

      setManualEtaStatus({
        type: 'success',
        message: data.message || `Successfully updated dates & details for container '${manualEtaContainer}'!`,
      });

      fetchContainerFleet();
      if (searchQuery) handleSearch();
    } catch (err: any) {
      setManualEtaStatus({ type: 'error', message: err.message || 'Container date update failed' });
    } finally {
      setIsSettingManualEta(false);
    }
  };

  // 5. Handle Single Row Manual ETA Re-sync
  const handleSingleRowSyncEta = async (shipment: any) => {
    setSyncingRowId(shipment._id);
    try {
      const res = await fetch('/api/containers/sync-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          container: shipment.container,
          containerNumber: shipment.containerNumber,
          shippingLine: shipment.shippingLine,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync ETA');

      setShipments(
        shipments.map((s) =>
          s._id === shipment._id ? { ...s, eta: data.eta, status: data.status, lastApiSync: data.lastApiSync } : s
        )
      );
      setTableStatus({ type: 'success', message: `Synced ETA for ${shipment.receipt}: ${data.eta}` });
      if (data.dataDetails) {
        setLiveJsonCargoDetails(data.dataDetails);
      }
      fetchApiStats();
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'ETA sync failed' });
    } finally {
      setSyncingRowId(null);
    }
  };

  // 6. Handle CSV Upload
  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadStatus({ type: 'error', message: 'Please select a CSV file to upload' });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('mode', uploadMode);
    if (selectedSheet) {
      formData.append('sheet', selectedSheet);
    }
    formData.append('mapping', JSON.stringify(headerMapping));

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadStatus({
        type: 'success',
        message: data.message || `Successfully imported shipment records!`,
      });

      setUploadFile(null);
      setFileHeaders([]);
      setFileSheets([]);
      setSelectedSheet('');
      setSampleRows([]);
      setTotalFileRows(0);
      setHeaderCheckError(null);
      fetchDistinctContainers();
      fetchApiStats();
    } catch (err: any) {
      setUploadStatus({ type: 'error', message: err.message || 'CSV upload failed' });
    } finally {
      setIsUploading(false);
    }
  };


  // Fetch All Shipments for Full Filter Experience
  const handleFetchAllShipments = async () => {
    setIsSearching(true);
    setTableStatus(null);
    setSelectedIds([]);
    try {
      const res = await fetch('/api/admin/shipments?all=true&limit=25000');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load all shipments');
      setShipments(data.shipments || []);
      setHasSearched(true);
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Error loading shipments' });
    } finally {
      setIsSearching(false);
    }
  };

  // 7. Handle Search-First Data Table
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setShipments([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setTableStatus(null);
    setSelectedIds([]);

    try {
      const res = await fetch(`/api/admin/shipments?search=${encodeURIComponent(searchQuery.trim())}&limit=5000`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Search query failed');
      }

      setShipments(data.shipments || []);
      setHasSearched(true);
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Failed to fetch search results' });
    } finally {
      setIsSearching(false);
    }
  };


  // Derived Options for Filter Dropdowns
  const adminUniqueMainMarks = useMemo(() => [...new Set(shipments.map((s) => s.mainMarka).filter(Boolean))].sort(), [shipments]);
  const adminUniqueSubMarks = useMemo(() => [...new Set(shipments.map((s) => s.subMarka).filter(Boolean))].sort(), [shipments]);
  const adminUniqueReceipts = useMemo(() => [...new Set(shipments.map((s) => s.receipt).filter(Boolean))].sort(), [shipments]);
  const adminUniqueContainers = useMemo(() => [...new Set(shipments.map((s) => s.container).filter(Boolean))].sort(), [shipments]);
  const adminUniqueCarriers = useMemo(() => [...new Set(shipments.map((s) => s.shippingLine).filter(Boolean))].sort(), [shipments]);
  const adminUniqueStatuses = useMemo(() => [...new Set(shipments.map((s) => s.status).filter(Boolean))].sort(), [shipments]);

  // Counts and multi-container detection for duplicate receipts
  const adminReceiptCounts = useMemo(() => {
    const c: Record<string, number> = {};
    shipments.forEach((s) => {
      const k = s.receipt || '';
      if (k) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [shipments]);

  const adminReceiptContainers = useMemo(() => {
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

  // Filtered shipments based on selectable lists
  const filteredAdminShipments = useMemo(() => {
    return shipments.filter((item) => {
      const turnaround = getDeliveryTurnaroundStatus(item.date, item.eta, item.uploadedAt);

      if (showLateOnly && !turnaround.isLate) return false;
      if (selectedMainMarks.size > 0 && (!item.mainMarka || !selectedMainMarks.has(item.mainMarka))) return false;
      if (selectedSubMarks.size > 0 && (!item.subMarka || !selectedSubMarks.has(item.subMarka))) return false;
      if (selectedReceipts.size > 0 && !selectedReceipts.has(item.receipt)) return false;
      if (selectedContainersFilter.size > 0 && !selectedContainersFilter.has(item.container)) return false;
      if (selectedCarriersFilter.size > 0 && !selectedCarriersFilter.has(item.shippingLine)) return false;
      if (selectedStatusesFilter.size > 0 && !selectedStatusesFilter.has(item.status)) return false;

      // Receipt Date Range Filter
      if (receiptDateFrom || receiptDateTo) {
        const rDate = parseReceiptDate(item.date) || (item.uploadedAt ? new Date(item.uploadedAt) : null);
        if (!rDate) return false;
        if (receiptDateFrom && rDate < new Date(receiptDateFrom)) return false;
        if (receiptDateTo && rDate > new Date(receiptDateTo + 'T23:59:59')) return false;
      }

      return true;
    });
  }, [
    shipments,
    showLateOnly,
    selectedMainMarks,
    selectedSubMarks,
    selectedReceipts,
    selectedContainersFilter,
    selectedCarriersFilter,
    selectedStatusesFilter,
    receiptDateFrom,
    receiptDateTo,
  ]);

  const activeAdminFiltersCount = useMemo(() => {
    let c = 0;
    if (selectedMainMarks.size > 0) c++;
    if (selectedSubMarks.size > 0) c++;
    if (selectedReceipts.size > 0) c++;
    if (selectedContainersFilter.size > 0) c++;
    if (selectedCarriersFilter.size > 0) c++;
    if (selectedStatusesFilter.size > 0) c++;
    if (receiptDateFrom || receiptDateTo) c++;
    if (showLateOnly) c++;
    return c;
  }, [
    selectedMainMarks,
    selectedSubMarks,
    selectedReceipts,
    selectedContainersFilter,
    selectedCarriersFilter,
    selectedStatusesFilter,
    receiptDateFrom,
    receiptDateTo,
    showLateOnly,
  ]);

  const resetAdminFilters = () => {
    setSelectedMainMarks(new Set());
    setSelectedSubMarks(new Set());
    setSelectedReceipts(new Set());
    setSelectedContainersFilter(new Set());
    setSelectedCarriersFilter(new Set());
    setSelectedStatusesFilter(new Set());
    setReceiptDateFrom('');
    setReceiptDateTo('');
    setShowLateOnly(false);
  };

  // Checkbox Helpers
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAdminShipments.length && filteredAdminShipments.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAdminShipments.map((s) => s._id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Single Row Operations
  const handleDeleteShipment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shipment record?')) return;

    try {
      const res = await fetch(`/api/admin/shipments?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setShipments(shipments.filter((s) => s._id !== id));
      setSelectedIds(selectedIds.filter((i) => i !== id));
      setTableStatus({ type: 'success', message: 'Shipment deleted successfully' });
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Delete failed' });
    }
  };

  const handleSaveSingleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShipment) return;

    try {
      const res = await fetch('/api/admin/shipments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingShipment._id,
          receipt: editingShipment.receipt,
          container: editingShipment.container,
          containerNumber: editingShipment.containerNumber,
          shippingLine: editingShipment.shippingLine,
          english: editingShipment.english,
          commodity: editingShipment.commodity,
          quantity: editingShipment.quantity,
          weight: editingShipment.weight,
          volume: editingShipment.volume,
          warehouse: editingShipment.warehouse,
          stockstatus: editingShipment.stockstatus,
          date: editingShipment.date,
          mainMarka: editingShipment.mainMarka,
          subMarka: editingShipment.subMarka,
          warehouseEntry: editingShipment.warehouseEntry,
          eta: editingShipment.eta,
          status: editingShipment.status,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      setShipments(shipments.map((s) => (s._id === editingShipment._id ? data.shipment : s)));
      setEditingShipment(null);
      setTableStatus({ type: 'success', message: 'Shipment updated successfully' });
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Update failed' });
    }
  };

  const handleCreateNewEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntryData.receipt || !newEntryData.container) {
      alert('Receipt No and Container are required');
      return;
    }

    try {
      const res = await fetch('/api/admin/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          shipment: newEntryData,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create shipment');

      setShipments([data.shipment, ...shipments]);
      setIsAddEntryOpen(false);
      setNewEntryData({
        receipt: '',
        container: '',
        containerNumber: '',
        shippingLine: 'MSC',
        mainMarka: '',
        subMarka: '',
        date: '',
        english: '',
        commodity: '',
        quantity: '',
        weight: '',
        volume: '',
        warehouse: '',
        warehouseEntry: '',
        stockstatus: 'In stock',
        packaging: '',
        eta: 'N/A',
        status: 'Pending',
      });
      setTableStatus({ type: 'success', message: 'New shipment added directly to database (Zero API calls)' });
      fetchDistinctContainers();
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Failed to create shipment' });
    }
  };

  // Bulk Actions
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected shipment(s)?`)) return;

    try {
      const res = await fetch('/api/admin/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-delete', ids: selectedIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk delete failed');

      setShipments(shipments.filter((s) => !selectedIds.includes(s._id)));
      setSelectedIds([]);
      setTableStatus({ type: 'success', message: `Bulk deleted ${data.count} shipments` });
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Bulk delete failed' });
    }
  };

  const handleBulkEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    try {
      const res = await fetch('/api/admin/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-edit',
          ids: selectedIds,
          updateData: bulkEditData,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk edit failed');

      setIsBulkEditOpen(false);
      setSelectedIds([]);
      handleSearch();
      setTableStatus({ type: 'success', message: `Bulk updated ${data.count} shipments` });
    } catch (err: any) {
      setTableStatus({ type: 'error', message: err.message || 'Bulk edit failed' });
    }
  };

  // Manual Sync Trigger
  const handleTriggerCronSync = async () => {
    setIsSyncingCron(true);
    try {
      const res = await fetch('/api/cron/sync-eta', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      alert(`ETA Sync Engine Completed!\nSynced: ${data.syncedCount} containers\nSkipped: ${data.skippedCount} containers`);
      if (searchQuery) handleSearch();
    } catch (err: any) {
      alert(`Sync Engine Error: ${err.message}`);
    } finally {
      setIsSyncingCron(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const filteredContainerFleet = useMemo(() => {
    if (!containerFleetSearch.trim()) return containerFleet;
    const q = containerFleetSearch.toLowerCase();
    return containerFleet.filter((c) =>
      c.container?.toLowerCase().includes(q) ||
      c.containerNumber?.toLowerCase().includes(q) ||
      c.shippingLine?.toLowerCase().includes(q) ||
      c.shippedFrom?.toLowerCase().includes(q) ||
      c.shippedTo?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q)
    );
  }, [containerFleet, containerFleetSearch]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Verifying Admin Authorization...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Admin Navbar */}
      <header className="bg-white text-slate-800 shadow-sm sticky top-0 z-30 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-black text-sm tracking-tight text-slate-900">US INTERNATIONAL</span>
                <span className="font-black text-sm tracking-tight text-blue-600">LOGISTICS</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">China to India Super Admin Dashboard</p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* JSONCargo API Stats Badge */}
            {apiStats && (
              <button
                type="button"
                onClick={() => {
                  setActiveAdminTab('api-sync');
                  fetchApiStats();
                }}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs"
                title="Click to view API calls & quota monitor"
              >
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-slate-700">
                  Calls: <strong className="text-blue-700 font-mono font-black">{apiStats.requests_made ?? 0}</strong> / {apiStats.requests_total ?? '∞'}
                </span>
              </button>
            )}

            <button
              onClick={handleTriggerCronSync}
              disabled={isSyncingCron}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCron ? 'animate-spin' : ''}`} />
              <span>{isSyncingCron ? 'Syncing...' : 'Trigger Full Cron ETA Sync'}</span>
            </button>

            <Link
              href="/admin/view"
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
            >
              Employee View
            </Link>

            <Link
              href="/"
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
            >
              Public Site
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── MODERN ADMIN MENU BAR (Zero Scrollbars - Responsive Grid) ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full">
            <button
              type="button"
              onClick={() => setActiveAdminTab('shipments')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'shipments'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Table className="w-4 h-4 shrink-0" />
              <span className="truncate">Cargo Manifest</span>
              {shipments.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeAdminTab === 'shipments' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {shipments.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminTab('containers');
                fetchContainerFleet();
              }}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'containers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Box className="w-4 h-4 shrink-0" />
              <span className="truncate">Container List</span>
              {containerFleet.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeAdminTab === 'containers' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {containerFleet.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('manual-eta')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'manual-eta'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span className="truncate">Set Loading Date</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('upload')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="truncate">Upload Manifest</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('api-sync')}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'api-sync'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span className="truncate">API Sync</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminTab('alerts');
                fetchLateContainers();
                fetchSyncAlerts();
              }}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 w-full ${
                activeAdminTab === 'alerts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">Alerts & Schedule</span>
              {(lateContainers.length > 0 || needsSyncContainers.length > 0 || carrierOutageAlerts.length > 0) && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                  {lateContainers.length + needsSyncContainers.length + carrierOutageAlerts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── HIGH-PRIORITY CARRIER OUTAGE ALERT BANNER (>5 failures within 7 days) ── */}
        {carrierOutageAlerts.length > 0 && showCarrierOutageBanner && (
          <div className="space-y-3">
            {carrierOutageAlerts.map((outage) => (
              <div
                key={outage.shippingLine}
                className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 shadow-sm animate-fadeIn"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                          Carrier Outage Alert: {outage.shippingLine} API Sync Failing
                        </h3>
                        <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-black rounded-full uppercase">
                          {outage.failureCount} Failures in 7 Days
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 mt-1 font-medium leading-relaxed">
                        Containers under <strong>{outage.shippingLine}</strong> have failed automated &amp; manual API tracking <strong>{outage.failureCount} times</strong> within the past week (threshold: &gt;5). Please reach out to the <strong>{outage.shippingLine} sales/tech support team</strong> or JSONCargo support to check integration status.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-800">
                        <span className="font-bold">Affected Containers ({outage.affectedCount}):</span>
                        {outage.affectedContainers.slice(0, 8).map((c: string) => (
                          <span key={c} className="px-2 py-0.5 bg-white border border-amber-300 rounded font-mono font-bold text-amber-950">
                            {c}
                          </span>
                        ))}
                        {outage.affectedContainers.length > 8 && (
                          <span className="font-bold text-amber-700">+{outage.affectedContainers.length - 8} more</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (outage.affectedContainers.length > 0) {
                          handleJumpToManualEta(outage.affectedContainers[0], outage.shippingLine);
                        } else {
                          setActiveAdminTab('manual-eta');
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 transition"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Update ETA Manually</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAdminTab('alerts')}
                      className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-xl border border-amber-300 transition"
                    >
                      View All Errors
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ALERTS ROW: Late Containers + Needs Sync (OPEN BY DEFAULT) ── */}
        {(activeAdminTab === 'alerts' || lateContainers.length > 0 || lateContainersLoading) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">

          {/* LATE CONTAINERS PANEL */}
          <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 bg-red-50 border-b border-red-200 cursor-pointer"
              onClick={() => setShowLatePanel((v) => !v)}
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="font-black text-sm text-red-800">Late Containers</span>
                {lateContainersLoading ? (
                  <span className="text-[11px] text-red-400">Loading...</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white">
                    {lateContainers.length}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-red-600 font-semibold">
                <span>ETA &gt; 35 days from receipt</span>
                <span>{showLatePanel ? '▲' : '▼'}</span>
              </div>
            </div>

            {showLatePanel && (
              <div className="overflow-auto max-h-72">
                {lateContainers.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400 font-medium">
                    ✓ No late containers — all ETA within 35-day limit
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 border-b border-red-200 text-[10px] uppercase tracking-wide text-red-700">
                      <tr>
                        <th className="py-2 px-3 text-left font-bold">Receipt</th>
                        <th className="py-2 px-3 text-left font-bold">Container</th>
                        <th className="py-2 px-3 text-left font-bold">Commodity</th>
                        <th className="py-2 px-3 text-left font-bold">ETA</th>
                        <th className="py-2 px-3 text-left font-bold">Days Over</th>
                        <th className="py-2 px-3 text-left font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lateContainers.map((lc, i) => (
                        <tr key={lc._id} className={`border-b border-red-50 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}`}>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{lc.receipt}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{lc.container}</span>
                          </td>
                          <td className="py-2 px-3 text-gray-700 max-w-[140px] truncate">{lc.commodity || '—'}</td>
                          <td className="py-2 px-3 font-bold text-red-700 whitespace-nowrap">{formatGlobalDate(lc.eta)}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white">+{lc.daysOverLimit}d</span>
                          </td>
                          <td className="py-2 px-3 text-gray-600">{lc.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* NEEDS SYNC PANEL */}
          <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200 cursor-pointer"
              onClick={() => setShowSyncPanel((v) => !v)}
            >
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="font-black text-sm text-amber-800">ETA Sync Required</span>
                {lateContainersLoading ? (
                  <span className="text-[11px] text-amber-400">Loading...</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-white">
                    {needsSyncContainers.length}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleTriggerCronSync(); }}
                  disabled={isSyncingCron}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition"
                >
                  {isSyncingCron ? 'Syncing...' : 'Sync All Now'}
                </button>
                <span className="text-xs text-amber-600 font-semibold">{showSyncPanel ? '▲' : '▼'}</span>
              </div>
            </div>

            {showSyncPanel && (
              <>
                {/* Smart Interval Legend */}
                <div className="px-4 py-2 bg-amber-50/50 border-b border-amber-100">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-amber-800">
                    <span>📅 1–5d → Daily</span>
                    <span>📅 5–11d → Every 2d</span>
                    <span>📅 11–17d → Every 5d</span>
                    <span>📅 17–25d → Every 7d</span>
                    <span>📅 25+d → Every 10d</span>
                  </div>
                </div>
                <div className="overflow-auto max-h-60">
                  {needsSyncContainers.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400 font-medium">
                      ✓ All containers are synced per schedule
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 border-b border-amber-200 text-[10px] uppercase tracking-wide text-amber-700">
                        <tr>
                          <th className="py-2 px-3 text-left font-bold">Container No</th>
                          <th className="py-2 px-3 text-left font-bold">Line</th>
                          <th className="py-2 px-3 text-left font-bold">ETA</th>
                          <th className="py-2 px-3 text-left font-bold">Days Left</th>
                          <th className="py-2 px-3 text-left font-bold">Required Update</th>
                          <th className="py-2 px-3 text-left font-bold">Last Sync</th>
                        </tr>
                      </thead>
                      <tbody>
                        {needsSyncContainers.map((ns, i) => (
                          <tr key={ns.containerNumber} className={`border-b border-amber-50 ${i % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}`}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 text-[11px]">{ns.containerNumber}</td>
                            <td className="py-2 px-3 text-gray-700">{ns.shippingLine}</td>
                            <td className="py-2 px-3 font-bold text-amber-700 whitespace-nowrap">{formatGlobalDate(ns.eta)}</td>
                            <td className="py-2 px-3">
                              {ns.daysUntilEta !== null ? (
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${ns.daysUntilEta <= 5 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {ns.daysUntilEta}d
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                Every {ns.requiredIntervalDays}d
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-500 whitespace-nowrap">
                              {ns.neverSynced ? (
                                <span className="text-[10px] font-bold text-red-600">Never synced</span>
                              ) : (
                                formatGlobalDate(ns.lastApiSync)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

          {/* CARRIER OUTAGE & FAILED SYNC DIRECTORY PANEL */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 gap-2">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Failed API Syncs &amp; Carrier Outage Log (Last 7 Days)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Automatically tracks every failed JSONCargo sync. Shipping companies with &gt;5 failures trigger priority outage alerts.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={fetchSyncAlerts}
                  disabled={syncAlertsLoading}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${syncAlertsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh Errors</span>
                </button>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800">
                  {failedSyncList.length} failing
                </span>
              </div>
            </div>

            <div className="overflow-auto max-h-80">
              {failedSyncList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  ✓ No recent API sync failures — all containers synced cleanly with carriers!
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-bold">Container</th>
                      <th className="py-2.5 px-3 text-left font-bold">Carrier (Line)</th>
                      <th className="py-2.5 px-3 text-left font-bold">Latest Error Reason</th>
                      <th className="py-2.5 px-3 text-left font-bold">Failures</th>
                      <th className="py-2.5 px-3 text-left font-bold">Last Attempt</th>
                      <th className="py-2.5 px-3 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {failedSyncList.map((item, idx) => (
                      <tr key={item.containerNumber || idx} className="hover:bg-amber-50/30 transition">
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{item.container || item.containerNumber}</div>
                          {item.container && item.containerNumber && item.container !== item.containerNumber && (
                            <div className="font-mono text-[10px] text-slate-400">{item.containerNumber}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold text-slate-800 text-[10px]">
                            {item.shippingLine}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-xs text-red-700 font-medium truncate" title={item.latestError}>
                          {item.latestError}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            item.failureCount >= 5 ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.failureCount}x
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                          {new Date(item.lastFailedAt).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleJumpToManualEta(item.container || item.containerNumber, item.shippingLine)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-sm flex items-center space-x-1 mx-auto transition"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>Update ETA Manually</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── TAB 2: CARGO MASTER TABLE & FLEET ANALYTICS (REDUX + TANSTACK TABLE + JS CHARTS) ── */}
        {activeAdminTab === 'containers' && (
          <div className="animate-fadeIn">
            <ReduxProvider>
              <CargoMasterTable
                onEditDates={(alias) => {
                  setManualEtaContainer(alias);
                  setSelectedContainer(alias);
                  handleContainerSelectionChange(alias);
                  setActiveAdminTab('manual-eta');
                }}
                onSyncApi={(alias) => {
                  setManualSyncContainer(alias);
                  setSelectedContainer(alias);
                  handleContainerSelectionChange(alias);
                  setActiveAdminTab('api-sync');
                }}
              />
            </ReduxProvider>
          </div>
        )}

        {/* ── TAB 3: SET LOADING DATE (CHINA) & ARRIVAL ETA ── */}
        {activeAdminTab === 'manual-eta' && (
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8 space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-lg">Set Loading Date (China) &amp; Arrival ETA</h2>
                  <p className="text-xs text-slate-500">
                    Enter or update China loading date, destination ETA, ports, and carrier line for all receipts under this container.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
                Direct DB Update
              </span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2.5">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Zero JSONCargo API Calls:</strong> Updating dates and details here modifies MongoDB directly across all receipts under this container without consuming API tracking credits.
              </div>
            </div>

            {manualEtaStatus && (
              <div
                className={`p-4 rounded-xl text-xs font-medium flex items-start space-x-2.5 ${
                  manualEtaStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                    : 'bg-red-50 text-red-900 border border-red-300'
                }`}
              >
                {manualEtaStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <span>{manualEtaStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleManualEtaOverrideSubmit} className="space-y-6">
              {/* Container Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Select Container Alias *
                </label>
                <select
                  value={manualEtaContainer}
                  onChange={(e) => {
                    setManualEtaContainer(e.target.value);
                    setSelectedContainer(e.target.value);
                    handleContainerSelectionChange(e.target.value);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                >
                  <option value="">-- Choose Container --</option>
                  {distinctContainers.map((alias) => (
                    <option key={alias} value={alias}>
                      {alias}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Selecting a container automatically fills existing dates, status, and ports from the database.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Loading Date from China */}
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-1.5">
                  <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Loading Date from China (Departure)</span>
                  </label>
                  <input
                    type="date"
                    value={manualLoadingDate}
                    onChange={(e) => setManualLoadingDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-emerald-300 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-emerald-700">Date the container was loaded and dispatched from China</p>
                </div>

                {/* Target Arrival ETA Date */}
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 space-y-1.5">
                  <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Destination Arrival ETA Date</span>
                  </label>
                  <input
                    type="date"
                    value={manualEtaDateInput}
                    onChange={(e) => setManualEtaDateInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-blue-300 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-blue-700">Expected arrival date at destination port in India</p>
                </div>

                {/* Shipping Line / Company Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Shipping Line / Carrier Company
                  </label>
                  <select
                    value={manualShippingCompany}
                    onChange={(e) => setManualShippingCompany(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {SHIPPING_LINES.map((line) => (
                      <option key={line} value={line}>{line}</option>
                    ))}
                  </select>
                </div>

                {/* Current Status */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Current Container Status
                  </label>
                  <input
                    type="text"
                    value={manualStatusInput}
                    onChange={(e) => setManualStatusInput(e.target.value)}
                    placeholder="e.g. In Transit, Customs Clearance, Arrived"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Origin Port China */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Shipped From (Origin Port China)
                  </label>
                  <input
                    type="text"
                    value={manualShippedFrom}
                    onChange={(e) => setManualShippedFrom(e.target.value)}
                    placeholder="e.g. Ningbo / Shanghai, China"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Destination Port India */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Shipped To (Destination Port India)
                  </label>
                  <input
                    type="text"
                    value={manualShippedTo}
                    onChange={(e) => setManualShippedTo(e.target.value)}
                    placeholder="e.g. Nhava Sheva / Mundra, India"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Filing Buffer Toggle */}
              <div className="flex items-center space-x-2.5 text-xs font-medium text-slate-700 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
                <input
                  type="checkbox"
                  id="admin-filing-buffer-toggle"
                  checked={applyFilingBuffer}
                  onChange={(e) => setApplyFilingBuffer(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <label htmlFor="admin-filing-buffer-toggle" className="cursor-pointer select-none">
                  Automatically add <strong>+7 Days Filing Buffer</strong> to the destination ETA date
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSettingManualEta || !manualEtaContainer}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isSettingManualEta ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Updating All Container Receipts &amp; Fleet...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Loading Date &amp; ETA Across All Receipts for this Container</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── TAB 4: IMPORT MANIFEST (.XLSX / .CSV) ── */}
        {activeAdminTab === 'upload' && (
          <div className="animate-fadeIn">
{/* SECTION 2: EXCEL & CSV IMPORT WITH HEADER INSPECTION & VALIDATION */}
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold text-slate-900 text-base">Import Manifest (.xlsx / .csv)</h2>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Header Check & Preview
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Upload your manifest file. Headers are automatically checked and mapped before importing. Container column is strictly validated.
              </p>
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>Zero JSONCargo API calls during upload. API calls are reserved for 7:00 AM daily sync or manual trigger.</span>
              </div>
            </div>

            {uploadStatus && (
              <div
                className={`p-3.5 rounded-xl text-xs font-medium flex items-start space-x-2 ${
                  uploadStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {uploadStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <span>{uploadStatus.message}</span>
              </div>
            )}

            {headerCheckError && (
              <div className="p-3.5 rounded-xl text-xs font-medium flex items-start space-x-2 bg-amber-50 text-amber-900 border border-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-amber-800 mb-0.5">Header Verification Notice:</strong>
                  <span>{headerCheckError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleCsvUpload} className="space-y-4">
              {!uploadFile ? (
                /* FILE SELECTION DROPZONE */
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/70 hover:bg-emerald-50/30 relative group">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-100/70 text-emerald-600 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Choose Excel (.xlsx / .xls) or CSV File
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Drag & drop or click to browse
                      </p>
                    </div>
                    <div className="inline-flex items-center space-x-2 text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60 font-medium">
                      <span>✓ Previews headers & rows before upload</span>
                    </div>
                  </div>
                </div>
              ) : isInspectingFile ? (
                /* INSPECTING LOADER */
                <div className="border border-slate-200 rounded-2xl p-8 text-center bg-slate-50 space-y-3">
                  <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-bold text-slate-700">Inspecting file structure and headers...</p>
                  <p className="text-[11px] text-slate-400">Verifying columns, sheets, and date formats</p>
                </div>
              ) : (
                /* FILE INSPECTED - PREVIEW & MAPPING CARD */
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                  {/* File Metadata Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center space-x-2 min-w-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" title={uploadFile.name}>
                          {uploadFile.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {(uploadFile.size / 1024).toFixed(1)} KB •{' '}
                          <span className="font-semibold text-slate-600 font-mono">
                            {totalFileRows.toLocaleString()}
                          </span>{' '}
                          records detected
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetUploadFile}
                      className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      Change File
                    </button>
                  </div>

                  {/* Multi-Sheet Selector (if Excel has multiple sheets) */}
                  {fileSheets.length > 1 && (
                    <div className="flex items-center justify-between gap-2 bg-blue-50/60 p-2.5 rounded-xl border border-blue-200 text-xs">
                      <span className="font-bold text-blue-900 text-[11px]">Select Sheet:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetSwitch(e.target.value)}
                        className="text-xs font-semibold px-2 py-1 bg-white border border-blue-300 rounded-lg text-blue-950 focus:outline-none"
                      >
                        {fileSheets.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Header Validation & Auto-Match Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Detected Headers ({fileHeaders.length}):</span>
                      {headerMapping.container ? (
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center">
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Ready to Ingest
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-red-600 flex items-center">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                          Container mapping required
                        </span>
                      )}
                    </div>

                    {/* Mapped Fields Badges */}
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div
                        className={`p-2 rounded-lg border font-medium flex items-center justify-between ${
                          headerMapping.container
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-800 animate-pulse'
                        }`}
                      >
                        <span className="font-bold">Container *:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.container || 'Missing'}>
                          {headerMapping.container || '⚠️ Required'}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg border bg-white border-slate-200 text-slate-700 font-medium flex items-center justify-between">
                        <span className="font-bold">Receipt No:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.receipt || 'Unmapped'}>
                          {headerMapping.receipt || 'None'}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg border bg-white border-slate-200 text-slate-700 font-medium flex items-center justify-between">
                        <span className="font-bold">Main Mark:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.mainMarka || 'Unmapped'}>
                          {headerMapping.mainMarka || 'None'}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg border bg-white border-slate-200 text-slate-700 font-medium flex items-center justify-between">
                        <span className="font-bold">Sub Mark:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.subMarka || 'Unmapped'}>
                          {headerMapping.subMarka || 'None'}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg border bg-white border-slate-200 text-slate-700 font-medium flex items-center justify-between">
                        <span className="font-bold">Receipt Date:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.date || 'Unmapped'}>
                          {headerMapping.date || 'None'}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg border bg-white border-slate-200 text-slate-700 font-medium flex items-center justify-between">
                        <span className="font-bold">Volume / M³:</span>
                        <span className="font-mono truncate ml-1 max-w-[100px]" title={headerMapping.volume || 'Unmapped'}>
                          {headerMapping.volume || 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Customize Mapping Accordion */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowMappingDetail((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold text-xs transition"
                      >
                        <span className="flex items-center space-x-1.5">
                          <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                          <span>
                            {showMappingDetail ? 'Hide Column Mapping' : 'Customize Column Mapping'}
                          </span>
                        </span>
                        {showMappingDetail ? (
                          <ChevronUp className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      {showMappingDetail && (
                        <div className="mt-2 p-3 bg-white rounded-xl border border-slate-200 space-y-2.5 max-h-60 overflow-y-auto">
                          <p className="text-[10px] text-slate-500">
                            Select which file column matches each system field:
                          </p>

                          {[
                            { key: 'container', label: 'Container (Mandatory *)' },
                            { key: 'receipt', label: 'Receipt No' },
                            { key: 'mainMarka', label: 'Main Marka' },
                            { key: 'subMarka', label: 'Sub Marka' },
                            { key: 'date', label: 'Date of Receipt' },
                            { key: 'commodity', label: 'Commodity (Chinese)' },
                            { key: 'english', label: 'English Description' },
                            { key: 'quantity', label: 'Quantity / Packages' },
                            { key: 'weight', label: 'Weight (KG)' },
                            { key: 'volume', label: 'Volume (CBM / M³)' },
                            { key: 'warehouseEntry', label: 'Warehouse Entry No' },
                            { key: 'warehouse', label: 'Warehouse' },
                            { key: 'stockstatus', label: 'Stock Status' },
                            { key: 'packaging', label: 'Packaging' },
                            { key: 'shippingLine', label: 'Shipping Line' },
                            { key: 'containerNumber', label: 'Actual Container No' },
                          ].map(({ key, label }) => (
                            <div key={key} className="flex items-center justify-between text-xs gap-2">
                              <label className="text-[11px] font-semibold text-slate-700 truncate w-36">
                                {label}:
                              </label>
                              <select
                                value={headerMapping[key] || ''}
                                onChange={(e) => handleUpdateMapping(key, e.target.value)}
                                className="flex-1 text-xs py-1 px-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white text-slate-800 focus:outline-none"
                              >
                                <option value="">-- None / Skip --</option>
                                {fileHeaders.map((hdr) => (
                                  <option key={hdr} value={hdr}>
                                    {hdr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sample Rows Preview (First 3 Data Rows) */}
                    {sampleRows.length > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                          <span className="flex items-center space-x-1">
                            <Table className="w-3.5 h-3.5 text-slate-500" />
                            <span>Sample Data Preview (First 3 Rows):</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">Scroll horizontally</span>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-36">
                          <table className="min-w-full divide-y divide-slate-200 text-[10px]">
                            <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                {fileHeaders.slice(0, 10).map((h) => (
                                  <th key={h} className="px-2.5 py-1.5 text-left truncate whitespace-nowrap font-mono">
                                    {h}
                                  </th>
                                ))}
                                {fileHeaders.length > 10 && (
                                  <th className="px-2.5 py-1.5 text-left text-slate-400">
                                    +{fileHeaders.length - 10} more
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-600">
                              {sampleRows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  {fileHeaders.slice(0, 10).map((h) => (
                                    <td key={h} className="px-2.5 py-1 text-left whitespace-nowrap truncate max-w-[140px]">
                                      {String(row[h] ?? '')}
                                    </td>
                                  ))}
                                  {fileHeaders.length > 10 && (
                                    <td className="px-2.5 py-1 text-slate-400">...</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {/* Ingestion Mode Option */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="block text-[11px] font-bold text-slate-700">Ingestion Mode:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label className={`p-2 rounded-lg border cursor-pointer flex items-start space-x-2 transition ${uploadMode === 'append' ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <input
                            type="radio"
                            name="uploadMode"
                            value="append"
                            checked={uploadMode === 'append'}
                            onChange={() => setUploadMode('append')}
                            className="mt-0.5 text-emerald-600"
                          />
                          <div>
                            <span className="block">Add All Rows (Default)</span>
                            <span className="text-[10px] font-normal text-slate-500">Preserves and accepts duplicate receipts across multiple containers</span>
                          </div>
                        </label>

                        <label className={`p-2 rounded-lg border cursor-pointer flex items-start space-x-2 transition ${uploadMode === 'update' ? 'bg-blue-50 border-blue-300 text-blue-950 font-bold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <input
                            type="radio"
                            name="uploadMode"
                            value="update"
                            checked={uploadMode === 'update'}
                            onChange={() => setUploadMode('update')}
                            className="mt-0.5 text-blue-600"
                          />
                          <div>
                            <span className="block">Update Existing</span>
                            <span className="text-[10px] font-normal text-slate-500">Updates existing rows by Receipt + Container + Commodity</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile || !headerMapping.container || isInspectingFile}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Ingesting & Processing...</span>
                    </>
                  ) : (
                    <span>
                      Upload & Ingest {totalFileRows > 0 ? `${totalFileRows.toLocaleString()} Records` : 'File'}
                    </span>
                  )}
                </button>

                {uploadFile && (
                  <button
                    type="button"
                    onClick={resetUploadFile}
                    className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition"
                    title="Clear selected file"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        )}

        {/* ── TAB 5: JSONCARGO API SYNC & 3-COLUMN MAPPING ── */}
        {activeAdminTab === 'api-sync' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
            {/* JSONCargo API Calls & Plan Quota Monitor Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-800 space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center shadow-inner">
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-black text-white tracking-tight">
                        JSON Cargo API Quota &amp; Call Counter
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        {apiStats?.plan || 'MARINER PLAN'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time tracker of carrier tracking requests consumed, quota remaining, and zero-cost protection.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5">
                  <button
                    type="button"
                    onClick={fetchApiStats}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border border-slate-700 shadow-sm"
                    title="Refresh live API counter from JSONCargo"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                    <span>Refresh Counter</span>
                  </button>
                  <a
                    href="https://jsoncargo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-blue-600/20"
                  >
                    <span>JSONCargo Portal ↗</span>
                  </a>
                </div>
              </div>

              {/* 3 Metric Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">API Calls Consumed</span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                      {apiStats?.requests_made ?? 0}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">requests used</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Calls Remaining</span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                      {apiStats?.requests_available ?? 921}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">available credits</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Plan Allowance</span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                      {apiStats?.requests_total ?? 1000}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">total / month</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Quota Consumed</span>
                  <span className="text-blue-300 font-mono font-bold">
                    {apiStats?.requests_total
                      ? `${Math.round(((apiStats.requests_made ?? 0) / apiStats.requests_total) * 100)}% Used`
                      : '7.9% Used'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        apiStats?.requests_total
                          ? Math.min(100, Math.max(2, Math.round(((apiStats.requests_made ?? 0) / apiStats.requests_total) * 100)))
                          : 8
                      }%`,
                    }}
                  ></div>
                </div>
              </div>

              {/* Zero-Cost & Quota Protection Guide */}
              <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-900/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
                <div className="flex items-start space-x-2">
                  <span className="text-emerald-400 font-black">✓ 0 API Calls:</span>
                  <span>Public searches &amp; Excel uploads cost 0 credits (direct MongoDB read).</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400 font-black">⏰ 7:00 AM Cron:</span>
                  <span>Queries active en-route containers once daily per smart schedule.</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-amber-400 font-black">📦 Delivered:</span>
                  <span>Marking container delivered permanently stops API calls for that container.</span>
                </div>
              </div>
            </div>

            {/* Daily Cron Schedule Banner */}
            <div className="bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Daily Automated Sync at 7:00 AM IST</h4>
                  <p className="text-xs text-slate-500">Scheduled sync queries JSONCargo API every morning at 7:00 AM. Manual fetch available below.</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-white text-blue-700 border border-slate-200 rounded-full text-xs font-mono font-bold shadow-xs">
                Cron: 0 7 * * *
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
{/* 3-Column Mapping Form */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Box className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold text-slate-900 text-base">Update Actual Container & Shipping Line</h2>
                </div>
                <span className="text-xs text-slate-400">3-Column Mapping</span>
              </div>

              {containerUpdateStatus && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-medium flex items-start space-x-2 ${
                    containerUpdateStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : containerUpdateStatus.type === 'warning'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {containerUpdateStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{containerUpdateStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdateContainer} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Column 1: Public Container Alias Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      1. Select Container
                    </label>
                    <select
                      value={selectedContainer}
                      onChange={(e) => {
                        setSelectedContainer(e.target.value);
                        handleContainerSelectionChange(e.target.value);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">-- Select Container --</option>
                      {distinctContainers.map((alias) => (
                        <option key={alias} value={alias}>
                          {alias}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Column 2: Actual Container Number Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      2. Actual Container No
                    </label>
                    <input
                      type="text"
                      value={actualContainerNo}
                      onChange={(e) => setActualContainerNo(e.target.value)}
                      placeholder="e.g. MSCU1234567"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                      required
                    />
                  </div>

                  {/* Column 3: Shipping Line Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      3. Shipping Line
                    </label>
                    <select
                      value={shippingLine}
                      onChange={(e) => {
                        setShippingLine(e.target.value);
                        setManualSyncLine(e.target.value);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SHIPPING_LINES.map((line) => (
                        <option key={line} value={line}>
                          {line}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingContainer}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isUpdatingContainer ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Updating & Fetching ETA...</span>
                    </>
                  ) : (
                    <>
                      <span>Map Container & Trigger Immediate ETA Sync</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
{/* MANUAL CONTAINER ETA FETCH TOOL (JSONCargo API) */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                    Fetch Live Status from JSONCargo API by Container Dropdown
                  </h3>
                </div>
                <span className="text-[10px] text-indigo-600 bg-indigo-50 font-bold px-2 py-0.5 rounded">
                  API Auto-Lookup
                </span>
              </div>

              {manualSyncStatus && (
                <div
                  className={`p-4 rounded-xl text-xs font-medium space-y-2.5 ${
                    manualSyncStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                      : manualSyncStatus.type === 'warning'
                      ? 'bg-amber-50 text-amber-900 border border-amber-300'
                      : 'bg-red-50 text-red-900 border border-red-300'
                  }`}
                >
                  <div className="flex items-start space-x-2.5">
                    {manualSyncStatus.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 font-semibold leading-relaxed">{manualSyncStatus.message}</div>
                  </div>

                  {manualSyncStatus.type === 'error' && (
                    <div className="pt-2.5 border-t border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <p className="text-[11px] text-red-800 font-medium">
                        JSONCargo API is currently unable to track this container. You can set the China departure date and destination ETA manually:
                      </p>
                      <button
                        type="button"
                        onClick={() => handleJumpToManualEta(manualSyncContainer || selectedContainer, manualSyncLine)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-sm flex items-center justify-center space-x-1.5 shrink-0 transition"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Update ETA Manually</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleManualContainerEtaSync} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Select Container from Database
                    </label>
                    <select
                      value={manualSyncContainer}
                      onChange={(e) => {
                        setSelectedContainer(e.target.value);
                        handleContainerSelectionChange(e.target.value);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium bg-slate-50 focus:bg-white"
                      required
                    >
                      <option value="">-- Select Container --</option>
                      {distinctContainers.map((alias) => (
                        <option key={alias} value={alias}>
                          {alias}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Auto-detected actual container & company preview box */}
                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Auto-Found in DB</span>
                      <p className="font-mono font-bold text-slate-900">{detectedActualNo || 'Not Mapped'}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Company</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">{manualSyncLine}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isManualSyncing || !manualSyncContainer}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isManualSyncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Calling JSONCargo API & Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      <span>Fetch Live Status & Update ETA in Database</span>
                    </>
                  )}
                </button>
              </form>

              {/* Live JSONCargo Details Display Card */}
              {liveJsonCargoDetails && (
                <div className="bg-slate-50 text-slate-800 p-5 rounded-2xl space-y-3 text-xs animate-fadeIn shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center space-x-2">
                      <Anchor className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-sm text-slate-900">
                        {liveJsonCargoDetails.container_id || manualSyncContainer}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {liveJsonCargoDetails.container_status || 'Synced'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-slate-600">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block font-semibold">Shipping Line</span>
                      <p className="font-bold text-slate-800">{liveJsonCargoDetails.shipping_line_name || manualSyncLine}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block font-semibold">ETA Final Destination</span>
                      <p className="font-bold text-emerald-700">
                        {liveJsonCargoDetails.eta_final_destination || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block font-semibold">Shipped From</span>
                      <p className="font-medium text-slate-700">{liveJsonCargoDetails.shipped_from || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block font-semibold">Shipped To</span>
                      <p className="font-medium text-slate-700">{liveJsonCargoDetails.shipped_to || 'N/A'}</p>
                    </div>
                    {liveJsonCargoDetails.current_vessel_name && (
                      <div className="col-span-2 bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                        <span className="text-slate-500 flex items-center space-x-1 font-medium">
                          <Navigation className="w-3.5 h-3.5 text-blue-600" />
                          <span>Vessel / Voyage:</span>
                        </span>
                        <strong className="text-slate-800">
                          {liveJsonCargoDetails.current_vessel_name} ({liveJsonCargoDetails.current_voyage_number || 'N/A'})
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── TAB 1: SEARCH-FIRST CARGO SHIPMENTS TABLE ── */}
        {activeAdminTab === 'shipments' && (
          <div className="animate-fadeIn">
{/* SECTION 3: SEARCH-FIRST DATA TABLE */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden space-y-4">
          
          {/* Table Toolbar */}
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <span>Shipment Records</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Search-First Table: Query by Receipt, Public Container Alias, or Actual Container Number.
                </p>
              </div>

              {/* Bulk Actions Controls */}
              {selectedIds.length > 0 && (
                <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 p-2 rounded-xl text-xs">
                  <span className="font-bold text-blue-900 px-2">{selectedIds.length} Selected</span>
                  <button
                    onClick={() => setIsBulkEditOpen(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center space-x-1"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Bulk Edit</span>
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Bulk Delete</span>
                  </button>
                </div>
              )}
            </div>

            {/* Search Input Bar */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={handleSearch} className="flex-1 min-w-[280px] flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search shipments by Receipt, Container, Marks, etc..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
                  >
                    {isSearching ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Search</span>
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => setIsAddEntryOpen(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center space-x-1.5"
                  title="Add new shipment record directly to database"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Entry</span>
                </button>

                <button
                  type="button"
                  onClick={handleFetchAllShipments}
                  disabled={isSearching}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center space-x-1.5"
                  title="Load all shipments into table for dropdown filtering"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Load All Records</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLateOnly((v) => !v)}
                  className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition border flex items-center space-x-1.5 ${
                    showLateOnly
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Late Only (&gt;35d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAdminFilterPanel((v) => !v)}
                  className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition border flex items-center space-x-1.5 ${
                    activeAdminFilterPanel
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filter Lists</span>
                  {activeAdminFiltersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-black">
                      {activeAdminFiltersCount}
                    </span>
                  )}
                </button>
              </div>

              {/* DEDICATED SELECTABLE FILTER LISTS FOR ADMIN PANEL */}
              {activeAdminFilterPanel && shipments.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase text-slate-500">
                    <span>Dedicated Selectable Filter Lists (Admin)</span>
                    {activeAdminFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={resetAdminFilters}
                        className="text-red-600 hover:underline font-bold text-[11px]"
                      >
                        Reset Filters ({activeAdminFiltersCount})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {/* Main Mark Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-amber-700 mb-1">
                        ★ Main Mark
                      </label>
                      <AdminMultiSelectDropdown
                        label="Main Mark"
                        options={adminUniqueMainMarks}
                        selected={selectedMainMarks}
                        onChange={setSelectedMainMarks}
                      />
                    </div>

                    {/* Sub Mark Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-blue-700 mb-1">
                        ◆ Sub Mark
                      </label>
                      <AdminMultiSelectDropdown
                        label="Sub Mark"
                        options={adminUniqueSubMarks}
                        selected={selectedSubMarks}
                        onChange={setSelectedSubMarks}
                      />
                    </div>

                    {/* Receipt No Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Receipt No
                      </label>
                      <AdminMultiSelectDropdown
                        label="Receipts"
                        options={adminUniqueReceipts}
                        selected={selectedReceipts}
                        onChange={setSelectedReceipts}
                        counts={adminReceiptCounts}
                      />
                    </div>

                    {/* Container Alias Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Container
                      </label>
                      <AdminMultiSelectDropdown
                        label="Containers"
                        options={adminUniqueContainers}
                        selected={selectedContainersFilter}
                        onChange={setSelectedContainersFilter}
                      />
                    </div>

                    {/* Shipping Line Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Shipping Line
                      </label>
                      <AdminMultiSelectDropdown
                        label="Lines"
                        options={adminUniqueCarriers}
                        selected={selectedCarriersFilter}
                        onChange={setSelectedCarriersFilter}
                      />
                    </div>

                    {/* Status Filter List */}
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Status
                      </label>
                      <AdminMultiSelectDropdown
                        label="Statuses"
                        options={adminUniqueStatuses}
                        selected={selectedStatusesFilter}
                        onChange={setSelectedStatusesFilter}
                      />
                    </div>
                  </div>

                  {/* Receipt Date Range Filter */}
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-[10px] font-black uppercase text-slate-500">
                      Receipt Date Range:
                    </span>
                    <input
                      type="date"
                      value={receiptDateFrom}
                      onChange={(e) => setReceiptDateFrom(e.target.value)}
                      className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white"
                      title="From Date"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                      type="date"
                      value={receiptDateTo}
                      onChange={(e) => setReceiptDateTo(e.target.value)}
                      className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white"
                      title="To Date"
                    />
                    {(receiptDateFrom || receiptDateTo) && (
                      <button
                        type="button"
                        onClick={() => { setReceiptDateFrom(''); setReceiptDateTo(''); }}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        Clear Dates
                      </button>
                    )}

                    <div className="ml-auto text-[11px] text-slate-500 font-semibold">
                      Showing <strong className="text-slate-900">{filteredAdminShipments.length}</strong> of {shipments.length} loaded records
                    </div>
                  </div>
                </div>
              )}
            </div>

            {tableStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  tableStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                }`}
              >
                {tableStatus.message}
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[300px]">
            {!hasSearched && shipments.length === 0 ? (
              // Initial Empty Search State per Prompt Requirement
              <div className="p-16 text-center text-slate-400 space-y-3">
                <Search className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-700 text-base">Search-First Data Table</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No records are displayed on initial load. Please enter a receipt or container identifier in the search box above to fetch cargo records.
                </p>
              </div>
            ) : shipments.length === 0 ? (
              <div className="p-16 text-center text-slate-400 space-y-2">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                <p className="font-semibold text-slate-700">No shipments found matching '{searchQuery}'</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                  <tr>
                    <th className="p-3 w-10">
                      <button type="button" onClick={toggleSelectAll} className="text-slate-600 hover:text-slate-900">
                        {selectedIds.length === filteredAdminShipments.length && filteredAdminShipments.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3">★ Main Mark</th>
                    <th className="p-3">◆ Sub Mark</th>
                    <th className="p-3">Receipt</th>
                    <th className="p-3">Container (Public)</th>
                    <th className="p-3">Container No (Actual)</th>
                    <th className="p-3">Carrier</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Weight/Vol</th>
                    <th className="p-3">Receipt Date</th>
                    <th className="p-3">ETA</th>
                    <th className="p-3">Turnaround</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Warehouse Entry</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAdminShipments.map((shipment) => {
                    const turnaround = getDeliveryTurnaroundStatus(shipment.date, shipment.eta, shipment.uploadedAt);
                    const isSelected = selectedIds.includes(shipment._id);
                    const isSyncingRow = syncingRowId === shipment._id;
                    return (
                      <tr
                        key={shipment._id}
                        className={`hover:bg-slate-50 transition ${isSelected ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="p-3">
                          <button type="button" onClick={() => toggleSelectRow(shipment._id)}>
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {shipment.mainMarka ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                              ★ {shipment.mainMarka}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {shipment.subMarka ? (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded border border-blue-300">
                              ◆ {shipment.subMarka}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <span>{shipment.receipt}</span>
                          {adminReceiptContainers.get(shipment.receipt) && adminReceiptContainers.get(shipment.receipt)!.size > 1 ? (
                            <span
                              className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center"
                              title={`Split Cargo: Appears in ${adminReceiptContainers.get(shipment.receipt)!.size} containers: ${Array.from(adminReceiptContainers.get(shipment.receipt)!).join(', ')}`}
                            >
                              Split ({adminReceiptContainers.get(shipment.receipt)!.size} Ctr)
                            </span>
                          ) : (adminReceiptCounts[shipment.receipt] || 0) > 1 ? (
                            <span
                              className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300 inline-flex items-center"
                              title={`${adminReceiptCounts[shipment.receipt]} cargo items under this receipt`}
                            >
                              Multi ({adminReceiptCounts[shipment.receipt]})
                            </span>
                          ) : null}
                        </td>
                        <td className="p-4 font-semibold text-blue-700">{shipment.container}</td>
                        <td className="p-4 font-mono text-slate-800 bg-slate-100/80 px-2 py-1 rounded w-fit">
                          {shipment.containerNumber}
                        </td>
                        <td className="p-4 font-medium text-slate-600">{shipment.shippingLine}</td>
                        <td className="p-4 max-w-xs truncate" title={shipment.english || shipment.commodity}>
                          {shipment.english || shipment.commodity || '-'}
                        </td>
                        <td className="p-4 font-medium">{shipment.quantity || '0'}</td>
                        <td className="p-4 text-slate-500">
                          {shipment.weight || '-'} / {shipment.volume || '-'}
                        </td>
                        <td className="p-3 font-medium text-slate-700 whitespace-nowrap">{formatGlobalDate(shipment.date)}</td>
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">{formatGlobalDate(shipment.eta)}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${turnaround.badgeClass}`}>
                            {turnaround.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                            {shipment.status || 'Pending'}
                          </span>
                        </td>
                        <td className="p-3">{shipment.warehouseEntry || '-'}</td>
                        <td className="p-4 text-right space-x-1">
                          <button
                            onClick={() => handleSingleRowSyncEta(shipment)}
                            disabled={isSyncingRow}
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition"
                            title="Sync ETA via JSONCargo API"
                          >
                            <RefreshCw className={`w-4 h-4 ${isSyncingRow ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => setEditingShipment({ ...shipment })}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-200 transition"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteShipment(shipment._id)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-slate-200 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
          </div>
        )}

        </main>

      {/* SINGLE ROW EDIT MODAL */}
      {editingShipment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-lg text-slate-900">Edit Shipment ({editingShipment.receipt})</h3>
              <button onClick={() => setEditingShipment(null)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleEdit} className="grid grid-cols-2 gap-4 text-xs font-semibold">
              <div>
                <label className="text-slate-600">Receipt No</label>
                <input
                  type="text"
                  value={editingShipment.receipt}
                  onChange={(e) => setEditingShipment({ ...editingShipment, receipt: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600">★ Main Mark</label>
                <input
                  type="text"
                  value={editingShipment.mainMarka || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, mainMarka: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm bg-amber-50/50 border-amber-200"
                  placeholder="e.g. MARK-A"
                />
              </div>

              <div>
                <label className="text-slate-600">◆ Sub Mark</label>
                <input
                  type="text"
                  value={editingShipment.subMarka || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, subMarka: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm bg-blue-50/50 border-blue-200"
                  placeholder="e.g. SUB-01"
                />
              </div>

              <div>
                <label className="text-slate-600">Receipt Date (Date in DB)</label>
                <input
                  type="text"
                  value={editingShipment.date || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, date: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono"
                  placeholder="DD-MM-YY or YYYY-MM-DD"
                />
              </div>

              <div>
                <label className="text-slate-600">Public Container Alias</label>
                <input
                  type="text"
                  value={editingShipment.container}
                  onChange={(e) => setEditingShipment({ ...editingShipment, container: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600">Actual Container Number (Confidential)</label>
                <input
                  type="text"
                  value={editingShipment.containerNumber}
                  onChange={(e) => setEditingShipment({ ...editingShipment, containerNumber: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600">Shipping Line</label>
                <select
                  value={editingShipment.shippingLine}
                  onChange={(e) => setEditingShipment({ ...editingShipment, shippingLine: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-medium"
                >
                  {SHIPPING_LINES.map((line) => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-600">Description (English)</label>
                <input
                  type="text"
                  value={editingShipment.english || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, english: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-slate-600">Quantity</label>
                <input
                  type="text"
                  value={editingShipment.quantity || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, quantity: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-slate-600">Weight</label>
                <input
                  type="text"
                  value={editingShipment.weight || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, weight: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-slate-600">Volume (CBM)</label>
                <input
                  type="text"
                  value={editingShipment.volume || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, volume: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-slate-600">ETA</label>
                <input
                  type="text"
                  value={editingShipment.eta || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, eta: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 font-semibold"
                />
              </div>

              <div>
                <label className="text-slate-600">Status</label>
                <input
                  type="text"
                  value={editingShipment.status || ''}
                  onChange={(e) => setEditingShipment({ ...editingShipment, status: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div className="col-span-2 flex justify-end space-x-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingShipment(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK EDIT MODAL */}
      {isBulkEditOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-lg text-slate-900">Bulk Edit ({selectedIds.length} records)</h3>
              <button onClick={() => setIsBulkEditOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Only filled fields will be applied to all selected {selectedIds.length} records.
            </p>

            <form onSubmit={handleBulkEditSubmit} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-600">Public Container Alias</label>
                <input
                  type="text"
                  value={bulkEditData.container}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, container: e.target.value })}
                  placeholder="Leave empty to keep existing"
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-slate-600">Actual Container Number</label>
                <input
                  type="text"
                  value={bulkEditData.containerNumber}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, containerNumber: e.target.value })}
                  placeholder="Leave empty to keep existing"
                  className="w-full p-2.5 border rounded-lg mt-1 font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-slate-600">Shipping Line</label>
                <select
                  value={bulkEditData.shippingLine}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, shippingLine: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1"
                >
                  <option value="">-- Keep Existing Shipping Line --</option>
                  {SHIPPING_LINES.map((line) => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-600">Warehouse Location</label>
                <input
                  type="text"
                  value={bulkEditData.warehouse}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, warehouse: e.target.value })}
                  placeholder="Leave empty to keep existing"
                  className="w-full p-2.5 border rounded-lg mt-1"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Apply Bulk Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD NEW SHIPMENT MODAL (Direct DB Entry - Zero API Calls) */}
      {isAddEntryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">+ Add New Shipment Entry</h3>
                <p className="text-[11px] text-emerald-600 font-semibold">Direct MongoDB insertion • Zero JSONCargo API calls</p>
              </div>
              <button onClick={() => setIsAddEntryOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleCreateNewEntry} className="grid grid-cols-2 gap-4 text-xs font-semibold">
              <div className="col-span-2 bg-blue-50 border border-blue-200 text-blue-900 px-3 py-2 rounded-xl text-[11px] font-medium">
                ℹ️ <strong>Duplicate Receipts Accepted:</strong> The same receipt number can be entered for multiple containers or distinct cargo items (split shipments).
              </div>

              <div>
                <label className="text-slate-600">Receipt No *</label>
                <input
                  type="text"
                  value={newEntryData.receipt}
                  onChange={(e) => setNewEntryData({ ...newEntryData, receipt: e.target.value })}
                  placeholder="e.g. 2506068"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600">Public Container Alias *</label>
                <input
                  type="text"
                  value={newEntryData.container}
                  onChange={(e) => setNewEntryData({ ...newEntryData, container: e.target.value })}
                  placeholder="e.g. USI-01"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-slate-600">★ Main Mark</label>
                <input
                  type="text"
                  value={newEntryData.mainMarka}
                  onChange={(e) => setNewEntryData({ ...newEntryData, mainMarka: e.target.value })}
                  placeholder="e.g. ADISON"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm bg-amber-50/40 border-amber-200"
                />
              </div>

              <div>
                <label className="text-slate-600">◆ Sub Mark</label>
                <input
                  type="text"
                  value={newEntryData.subMarka}
                  onChange={(e) => setNewEntryData({ ...newEntryData, subMarka: e.target.value })}
                  placeholder="e.g. ADISON-SUB"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm bg-blue-50/40 border-blue-200"
                />
              </div>

              <div>
                <label className="text-slate-600">Receipt Date (Date in DB)</label>
                <input
                  type="text"
                  value={newEntryData.date}
                  onChange={(e) => setNewEntryData({ ...newEntryData, date: e.target.value })}
                  placeholder="e.g. DD-MM-YY or YYYY-MM-DD"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-slate-600">Carrier Container No (Optional)</label>
                <input
                  type="text"
                  value={newEntryData.containerNumber}
                  onChange={(e) => setNewEntryData({ ...newEntryData, containerNumber: e.target.value })}
                  placeholder="e.g. MSCU1234567"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-slate-600">Shipping Line</label>
                <select
                  value={newEntryData.shippingLine}
                  onChange={(e) => setNewEntryData({ ...newEntryData, shippingLine: e.target.value })}
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-medium"
                >
                  {SHIPPING_LINES.map((line) => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-600">Commodity (Chinese/Original)</label>
                <input
                  type="text"
                  value={newEntryData.commodity}
                  onChange={(e) => setNewEntryData({ ...newEntryData, commodity: e.target.value })}
                  placeholder="e.g. 电源"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">English Description</label>
                <input
                  type="text"
                  value={newEntryData.english}
                  onChange={(e) => setNewEntryData({ ...newEntryData, english: e.target.value })}
                  placeholder="e.g. Power Supply"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">Quantity / Packages</label>
                <input
                  type="text"
                  value={newEntryData.quantity}
                  onChange={(e) => setNewEntryData({ ...newEntryData, quantity: e.target.value })}
                  placeholder="e.g. 4"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">Weight (KG)</label>
                <input
                  type="text"
                  value={newEntryData.weight}
                  onChange={(e) => setNewEntryData({ ...newEntryData, weight: e.target.value })}
                  placeholder="e.g. 42"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">Volume (CBM / M³)</label>
                <input
                  type="text"
                  value={newEntryData.volume}
                  onChange={(e) => setNewEntryData({ ...newEntryData, volume: e.target.value })}
                  placeholder="e.g. 0.15"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">Warehouse</label>
                <input
                  type="text"
                  value={newEntryData.warehouse}
                  onChange={(e) => setNewEntryData({ ...newEntryData, warehouse: e.target.value })}
                  placeholder="e.g. Main Warehouse"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">Warehouse Entry No</label>
                <input
                  type="text"
                  value={newEntryData.warehouseEntry}
                  onChange={(e) => setNewEntryData({ ...newEntryData, warehouseEntry: e.target.value })}
                  placeholder="e.g. SH-55"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-slate-600">ETA Date</label>
                <input
                  type="text"
                  value={newEntryData.eta}
                  onChange={(e) => setNewEntryData({ ...newEntryData, eta: e.target.value })}
                  placeholder="YYYY-MM-DD or N/A"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-slate-600">Status</label>
                <input
                  type="text"
                  value={newEntryData.status}
                  onChange={(e) => setNewEntryData({ ...newEntryData, status: e.target.value })}
                  placeholder="e.g. In Transit / Pending"
                  className="w-full p-2.5 border rounded-lg mt-1 text-sm"
                />
              </div>

              <div className="col-span-2 flex justify-end space-x-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddEntryOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Add Shipment to Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
