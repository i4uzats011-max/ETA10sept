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
  Ship,
  Plus,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  FileSpreadsheet,
  ChevronDown
} from 'lucide-react';
import { toJpeg, toPng } from 'html-to-image';

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
  id?: string;
  marka: string;
  receiptNo: string;
  warehouse?: string; // Origin warehouse e.g. "GZ", "YW"
  itemName: string;
  containerNo: string; // Container No. (not actual)
  cbm: string;
  weight: string;
  ctn: string;
  eta: string | null;
  deliveryDate?: string | null;
  markedDate?: string | null;
  status?: string;
  remainDays: number | null;
  updatedAt?: string;
  isSplit?: boolean;
  splitInfo?: string;
}

function isReceiptDelivered(r: IPublicReceipt): boolean {
  const s = (r.status || '').toLowerCase();
  return s.includes('deliver') || s.includes('arrived');
}

// User Delivery Date Rule:
// "if user make deliver then show deliver date , dilivery data = if marked availabe then delivery data is marked date if not available then eta is deilvery date"
function getEffectiveDeliveryDate(r: IPublicReceipt): string | null {
  if (!isReceiptDelivered(r)) return null;
  if (r.deliveryDate && r.deliveryDate.trim() && r.deliveryDate.trim() !== '-') {
    return r.deliveryDate.trim();
  }
  if (r.markedDate && r.markedDate.trim() && r.markedDate.trim() !== '-') {
    return r.markedDate.trim();
  }
  if (r.eta && r.eta.trim() && r.eta.trim() !== '-') {
    return r.eta.trim();
  }
  return null;
}

// Clean shipping line names (e.g. "(COSCO)", "(ONE)", "(MAERSK)") from public status display
function cleanDisplayStatus(status?: string): string {
  if (!status) return 'In Transit';
  // Strip any shipping line name in parentheses, e.g. "(COSCO)", "(ONE)", "(MAERSK)"
  return status.replace(/\s*\([^)]*\)/g, '').trim() || 'In Transit';
}

interface IReceiptColorTheme {
  borderHex: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  badgeHex: string;
  dotBg: string;
}

const RECEIPT_PALETTES: IReceiptColorTheme[] = [
  {
    borderHex: '#2563eb', // Blue
    pillBg: '#eff6ff',
    pillBorder: '#bfdbfe',
    pillText: '#1e40af',
    badgeHex: 'FFEBF8FF',
    dotBg: 'bg-blue-600'
  },
  {
    borderHex: '#16a34a', // Emerald Green
    pillBg: '#f0fdf4',
    pillBorder: '#bbf7d0',
    pillText: '#166534',
    badgeHex: 'FFF0FDF4',
    dotBg: 'bg-emerald-600'
  },
  {
    borderHex: '#9333ea', // Purple
    pillBg: '#f5f3ff',
    pillBorder: '#ddd6fe',
    pillText: '#6b21a8',
    badgeHex: 'FFF5F3FF',
    dotBg: 'bg-purple-600'
  },
  {
    borderHex: '#ea580c', // Orange / Amber
    pillBg: '#fff7ed',
    pillBorder: '#fed7aa',
    pillText: '#9a3412',
    badgeHex: 'FFFFF7ED',
    dotBg: 'bg-orange-600'
  },
  {
    borderHex: '#e11d48', // Rose / Red
    pillBg: '#fff1f2',
    pillBorder: '#fecdd3',
    pillText: '#9f1239',
    badgeHex: 'FFFFF1F2',
    dotBg: 'bg-rose-600'
  },
  {
    borderHex: '#0891b2', // Cyan / Teal
    pillBg: '#ecfeff',
    pillBorder: '#a5f3fc',
    pillText: '#155e75',
    badgeHex: 'FFECFEFF',
    dotBg: 'bg-cyan-600'
  },
  {
    borderHex: '#4f46e5', // Indigo
    pillBg: '#eef2ff',
    pillBorder: '#c7d2fe',
    pillText: '#3730a3',
    badgeHex: 'FFEEF2FF',
    dotBg: 'bg-indigo-600'
  },
  {
    borderHex: '#0d9488', // Teal
    pillBg: '#f0fdfa',
    pillBorder: '#99f6e4',
    pillText: '#115e59',
    badgeHex: 'FFF0FDFA',
    dotBg: 'bg-teal-600'
  }
];

// Returns consistent color theme for rows sharing the same Receipt No.
function getReceiptColorTheme(receiptNo: string, allList: IPublicReceipt[]): IReceiptColorTheme {
  const clean = (receiptNo || '').trim().toUpperCase();
  const distinct = Array.from(new Set(allList.map(r => (r.receiptNo || '').trim().toUpperCase()))).filter(Boolean);
  const idx = distinct.indexOf(clean);
  const colorIdx = idx >= 0
    ? idx % RECEIPT_PALETTES.length
    : Math.abs(clean.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % RECEIPT_PALETTES.length;
  return RECEIPT_PALETTES[colorIdx];
}

// Robust ETA Date Parser supporting chronological sorting (e.g. 12 sep, 10 oct, 4 nov, 8 nov)
function parseEtaTimestamp(val?: string | null): number | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'n/a') return null;

  const currentYear = new Date().getFullYear();

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  // Match: Day + MonthName (e.g. "12 sep", "12sep", "4 nov", "4nov", "12-sep", "12/sep", "12 sep 2026")
  const dmMatch = str.match(/^(\d{1,2})\s*[-/ ]?\s*([a-zA-Z]+)(?:\s*[-/ ,]?\s*(\d{2,4}))?$/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const mKey = dmMatch[2].toLowerCase();
    let year = dmMatch[3] ? parseInt(dmMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  // Match: MonthName + Day (e.g. "sep 12", "nov 4", "nov 4, 2026", "November 4 2026")
  const mdMatch = str.match(/^([a-zA-Z]+)\s*[-/ ]?\s*(\d{1,2})(?:[,\s]+(\d{2,4}))?$/);
  if (mdMatch) {
    const mKey = mdMatch[1].toLowerCase();
    const day = parseInt(mdMatch[2], 10);
    let year = mdMatch[3] ? parseInt(mdMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  // Match: YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  // Match: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  // Standard JavaScript Date parse fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    if (d.getFullYear() === 2001 && !str.includes('2001')) {
      d.setFullYear(currentYear);
    }
    return d.getTime();
  }

  return null;
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return 'Pending Schedule';
  const ts = parseEtaTimestamp(dateStr);
  if (ts === null) return dateStr;
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getEffectiveRemainDays(r: IPublicReceipt): number | null {
  if (r.remainDays !== null && r.remainDays !== undefined && Math.abs(r.remainDays) < 1000) {
    return r.remainDays;
  }
  if (!r.eta) return null;
  const ts = parseEtaTimestamp(r.eta);
  if (ts === null) return null;
  const etaDate = new Date(ts);
  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = etaStart.getTime() - nowStart.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function renderRemainDaysBadge(remainDays: number | null) {
  if (remainDays === null || remainDays === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3 text-amber-500" /> ETA Pending
      </span>
    );
  }
  if (remainDays > 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
        <Clock className="w-3 h-3 text-blue-600" /> {remainDays} Days to come ({remainDays}d left)
      </span>
    );
  } else if (remainDays === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse whitespace-nowrap">
        ⚡ 1 Day to come (Tomorrow)
      </span>
    );
  } else if (remainDays === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 whitespace-nowrap">
        📦 Arriving Today
      </span>
    );
  } else {
    const passed = Math.abs(remainDays);
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
        Past ETA ({passed}d ago)
      </span>
    );
  }
}

type SortField = 'eta' | 'receiptNo' | 'marka' | 'itemName' | 'containerNo' | 'cbm' | 'weight' | 'ctn' | 'status';
type SortDirection = 'asc' | 'desc';

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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [isShareDropdownOpen, setIsShareDropdownOpen] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tableCardRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Table Column Sorting State
  // Default is ETA in chronological ascending order (e.g. 12 sep, 10 oct, 4 nov, 8 nov)
  const [sortField, setSortField] = useState<SortField>('eta');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const resetSortToDefault = () => {
    setSortField('eta');
    setSortDirection('asc');
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
  const [existingLinkDetails, setExistingLinkDetails] = useState<{
    linkName?: string;
    linkToken?: string;
    linkUrl?: string;
  } | null>(null);

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addReceiptNo.trim() || !addCtn.trim()) {
      setAddError('Both Receipt No. and Carton Count (CTN) are required.');
      setExistingLinkDetails(null);
      return;
    }

    setSubmittingAdd(true);
    setAddError(null);
    setExistingLinkDetails(null);

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
        setExistingLinkDetails(null);
        setIsAddReceiptOpen(false);
        // Refresh tracking details to show the newly added receipt
        fetchTrackingDetails(true);
      } else {
        setAddError(data.message || 'Verification failed. Please check Receipt No. and CTN.');
        if (data.alreadyLinked && data.linkUrl) {
          setExistingLinkDetails({
            linkName: data.linkName,
            linkToken: data.linkToken,
            linkUrl: data.linkUrl
          });
        } else {
          setExistingLinkDetails(null);
        }
      }
    } catch (err) {
      setAddError('Network error while verifying receipt. Please retry.');
      setExistingLinkDetails(null);
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

  // Auto-focus / scroll directly to ETA cargo cards on mobile so users immediately see their ETA without scrolling down
  useEffect(() => {
    if (!loading && receipts.length > 0) {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        const timer = setTimeout(() => {
          const el = document.getElementById('cargo-data-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, receipts.length]);

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

  // Compare function supporting interactive A-Z, Z-A, Min-Max, and chronological ETA
  const compareItems = (a: IPublicReceipt, b: IPublicReceipt): number => {
    // 1. ETA / Delivery Date sorting (Ascending = earliest calendar date first: 12 sep, 10 oct, 4 nov, 8 nov)
    if (sortField === 'eta') {
      const dateA = isReceiptDelivered(a) ? getEffectiveDeliveryDate(a) : a.eta;
      const dateB = isReceiptDelivered(b) ? getEffectiveDeliveryDate(b) : b.eta;
      const timeA = parseEtaTimestamp(dateA);
      const timeB = parseEtaTimestamp(dateB);
      if (timeA === null && timeB === null) return 0;
      if (timeA === null) return 1; // Pending dates placed at bottom
      if (timeB === null) return -1;
      if (timeA !== timeB) {
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      return a.receiptNo.localeCompare(b.receiptNo, undefined, { numeric: true });
    }

    // 2. Numeric columns: CBM, Weight, CTN
    if (sortField === 'cbm' || sortField === 'weight' || sortField === 'ctn') {
      const numA = parseFloat(String(a[sortField] || '').replace(/[^0-9.-]/g, '')) || 0;
      const numB = parseFloat(String(b[sortField] || '').replace(/[^0-9.-]/g, '')) || 0;
      if (numA !== numB) {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }
      const timeA = parseEtaTimestamp(a.eta);
      const timeB = parseEtaTimestamp(b.eta);
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      return a.receiptNo.localeCompare(b.receiptNo, undefined, { numeric: true });
    }

    // 3. String columns: Marka, Receipt No, Item Name, Container No, Status
    const strA = String(a[sortField] || '').trim();
    const strB = String(b[sortField] || '').trim();
    const diff = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    if (diff !== 0) {
      return sortDirection === 'asc' ? diff : -diff;
    }
    const timeA = parseEtaTimestamp(a.eta);
    const timeB = parseEtaTimestamp(b.eta);
    if (timeA && timeB && timeA !== timeB) return timeA - timeB;
    return a.receiptNo.localeCompare(b.receiptNo, undefined, { numeric: true });
  };

  // Filtered and Sorted Receipts:
  // - Default view: Delivered data hidden, In Transit shown first sorted by ETA ascending (e.g. 12 sep, 10 oct, 4 nov, 8 nov), then In Warehouse.
  // - Public user can toggle or click Delivered tab to view delivered data (appended at bottom in sequence: Transit -> Warehouse -> Delivered).
  // - User can click column headers to sort table data A to Z and Z to A (or toggle ETA asc/desc).
  const filteredReceipts = useMemo(() => {
    let list = receipts;
    if (filterQuery.trim()) {
      const terms = filterQuery.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((r) => {
        const fullText = `${r.marka || ''} ${r.receiptNo || ''} ${r.warehouse || ''} ${r.itemName || ''} ${r.containerNo || ''} ${cleanDisplayStatus(r.status)}`.toLowerCase();
        return terms.every(term => fullText.includes(term));
      });
    }

    const transitItems = list.filter((r) => getReceiptCategory(r) === 'transit');
    const warehouseItems = list.filter((r) => getReceiptCategory(r) === 'warehouse');
    const deliveredItems = list.filter((r) => getReceiptCategory(r) === 'delivered');

    // Tab-based single category views
    if (activeStatusTab === 'transit') {
      return [...transitItems].sort(compareItems);
    }
    if (activeStatusTab === 'warehouse') {
      return [...warehouseItems].sort(compareItems);
    }
    if (activeStatusTab === 'delivered') {
      return [...deliveredItems].sort(compareItems);
    }

    // Default ETA Ascending Sort:
    // Respects status hierarchy: Transit -> Warehouse -> Delivered (if shown)
    // Within each group, items are strictly ordered chronologically by ETA ascending (e.g. 12 sep, 10 oct, 4 nov, 8 nov)
    if (sortField === 'eta' && sortDirection === 'asc') {
      const sortedTransit = [...transitItems].sort(compareItems);
      const sortedWarehouse = [...warehouseItems].sort(compareItems);
      const sortedDelivered = [...deliveredItems].sort(compareItems);

      if (activeStatusTab === 'all' || showDelivered) {
        return [...sortedTransit, ...sortedWarehouse, ...sortedDelivered];
      }
      // Default view: Active Cargo (Transit then Warehouse; Delivered hidden)
      return [...sortedTransit, ...sortedWarehouse];
    }

    // Custom Column Sort (A to Z / Z to A / Descending ETA):
    // Determines the visible rows (active cargo by default, or all if delivered is enabled)
    let visibleList: IPublicReceipt[] = [];
    if (activeStatusTab === 'all' || showDelivered) {
      visibleList = [...transitItems, ...warehouseItems, ...deliveredItems];
    } else {
      visibleList = [...transitItems, ...warehouseItems];
    }

    return [...visibleList].sort(compareItems);
  }, [receipts, filterQuery, activeStatusTab, showDelivered, sortField, sortDirection]);

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

  // Download entire table as high-resolution JPG image without any scrollbars
  const handleDownloadJpg = async (isForShare = false): Promise<File | null> => {
    if (!tableCardRef.current) return null;
    setDownloadingJpg(true);
    let container: HTMLElement | null = null;
    try {
      const originalNode = tableCardRef.current;
      const clone = originalNode.cloneNode(true) as HTMLElement;

      // 1. Remove all elements with 'no-jpg' (mobile cards, toggles, interactive buttons)
      const noJpgElements = clone.querySelectorAll('.no-jpg');
      noJpgElements.forEach((el) => el.remove());

      // 2. Unhide all hidden containers & ensure table container is fully expanded
      clone.querySelectorAll('.hidden').forEach((el) => {
        el.classList.remove('hidden');
      });

      const tableContainers = clone.querySelectorAll('[data-role="jpg-cargo-table"], .overflow-x-auto');
      tableContainers.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.classList.remove('hidden');
        htmlEl.style.setProperty('display', 'block', 'important');
        htmlEl.style.setProperty('visibility', 'visible', 'important');
        htmlEl.style.setProperty('width', '100%', 'important');
        htmlEl.style.setProperty('overflow', 'visible', 'important');
        htmlEl.style.setProperty('max-width', 'none', 'important');
      });

      // 3. Force table and all rows/cells to be completely rendered with fixed layout
      const tables = clone.querySelectorAll('table');
      tables.forEach((tbl) => {
        const htmlTbl = tbl as HTMLElement;
        htmlTbl.style.setProperty('display', 'table', 'important');
        htmlTbl.style.setProperty('width', '100%', 'important');
        htmlTbl.style.setProperty('min-width', '100%', 'important');
        htmlTbl.style.setProperty('visibility', 'visible', 'important');
        htmlTbl.style.setProperty('table-layout', 'fixed', 'important');
      });

      // Distribute fixed widths across all 9 columns in the cloned header so CBM, Weight, and CTN are 100% visible
      const ths = clone.querySelectorAll('thead th');
      const colWidths = ['13%', '10%', '11%', '23%', '11%', '18%', '5%', '4.5%', '4.5%'];
      ths.forEach((th, idx) => {
        if (colWidths[idx]) {
          (th as HTMLElement).style.setProperty('width', colWidths[idx], 'important');
        }
      });

      const tableRows = clone.querySelectorAll('tr');
      tableRows.forEach((tr) => {
        const htmlTr = tr as HTMLElement;
        htmlTr.style.setProperty('display', 'table-row', 'important');
        htmlTr.style.setProperty('visibility', 'visible', 'important');
      });

      const cells = clone.querySelectorAll('th, td');
      cells.forEach((cell) => {
        const htmlCell = cell as HTMLElement;
        htmlCell.style.setProperty('visibility', 'visible', 'important');
      });

      // 4. Create an invisible offscreen sandbox container at (0, 0) with z-index: -99999
      // Wide 1450px container ensures all 9 columns (including CBM, Weight, CTN) are fully visible without clipping
      const exportWidth = 1450;
      container = document.createElement('div');
      container.id = 'jpg-render-sandbox';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = `${exportWidth}px`;
      container.style.zIndex = '-99999';
      container.style.pointerEvents = 'none';
      container.style.opacity = '1';
      container.style.overflow = 'visible';
      container.style.backgroundColor = '#ffffff';

      clone.style.position = 'relative';
      clone.style.top = '0';
      clone.style.left = '0';
      clone.style.width = `${exportWidth}px`;
      clone.style.minWidth = `${exportWidth}px`;
      clone.style.maxWidth = `${exportWidth}px`;
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      clone.style.backgroundColor = '#ffffff';

      // 5. Inject styles in clone to guarantee full visibility & suppress scrollbars
      const style = document.createElement('style');
      style.innerHTML = `
        [data-role="jpg-cargo-table"], .overflow-x-auto {
          display: block !important;
          visibility: visible !important;
          width: 100% !important;
          max-width: none !important;
          overflow: visible !important;
        }
        table {
          display: table !important;
          width: 100% !important;
          min-width: 100% !important;
          table-layout: fixed !important;
          visibility: visible !important;
          border-collapse: collapse !important;
        }
        thead, tbody, tfoot, tr, th, td {
          visibility: visible !important;
        }
        th, td {
          overflow: visible !important;
        }
        th:nth-child(7), td:nth-child(7),
        th:nth-child(8), td:nth-child(8),
        th:nth-child(9), td:nth-child(9) {
          white-space: nowrap !important;
          text-align: center !important;
          font-weight: 800 !important;
          visibility: visible !important;
        }
        *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `;
      clone.appendChild(style);

      container.appendChild(clone);
      document.body.appendChild(container);

      // Allow DOM to compute complete layout and fonts
      await new Promise((r) => setTimeout(r, 120));

      const targetHeight = Math.max(clone.offsetHeight, clone.scrollHeight, 400);

      let dataUrl = '';
      try {
        dataUrl = await toJpeg(clone, {
          quality: 0.96,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true, // Prevents CORS or font loader hanging on mobile
          width: exportWidth,
          height: targetHeight
        });
      } catch (jpegErr) {
        console.warn('toJpeg error, attempting toPng fallback:', jpegErr);
        dataUrl = await toPng(clone, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
          width: exportWidth,
          height: targetHeight
        });
      }

      if (!dataUrl || dataUrl.length < 500) {
        // Fallback directly to toPng
        dataUrl = await toPng(clone, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
          width: exportWidth,
          height: targetHeight
        });
      }

      const cleanName = (linkName || 'Cargo_Tracking').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanName}_${new Date().toISOString().slice(0, 10)}.jpg`;

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/jpeg' });

      if (!isForShare) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        showToast('📸 Table downloaded as JPG (data view complete & scrollbar-free)!');
      }

      return file;
    } catch (err) {
      console.error('Error generating JPG:', err);
      alert('Unable to generate JPG image. Please try again.');
      return null;
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      setDownloadingJpg(false);
    }
  };

  // Download entire table as vector PDF document with separate Status & ETA columns
  const handleDownloadPdf = async (isForShare = false): Promise<File | null> => {
    setDownloadingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const cleanMarka = linkName || 'Cargo Tracking';

      // Header Banner
      doc.setFillColor(15, 23, 42); // Navy #0f172a
      doc.rect(0, 0, pageWidth, 58, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text('US INTERNATIONAL LOGISTICS', 30, 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('Cargo Master Status Table • Live Shipment Tracking', 30, 42);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(56, 189, 248);
      doc.text(`Marka: ${cleanMarka}`, pageWidth - 30, 26, { align: 'right' });

      doc.setFontSize(8.5);
      doc.setTextColor(52, 211, 153);
      doc.text('24 hrs Live Tracking Link', pageWidth - 30, 42, { align: 'right' });

      // 9 Separate Columns: Status and ETA (Days to Come) separated!
      const tableHeaders = [
        'Receipt No.',
        'Marka',
        'Container No.',
        'Item Name',
        'Status',
        'ETA & Days to Come',
        'CBM',
        'Weight',
        'CTN'
      ];

      const tableRows = filteredReceipts.map((r) => {
        const isDelivered = isReceiptDelivered(r);
        const effDate = isDelivered ? getEffectiveDeliveryDate(r) : r.eta;
        const dateText = effDate ? formatDisplayDate(effDate) : 'Pending Schedule';
        const cleanStat = cleanDisplayStatus(r.status);
        const remDays = getEffectiveRemainDays(r);
        const daysText = isDelivered
          ? 'Completed'
          : remDays !== null
          ? `${remDays} days to come`
          : 'Pending Schedule';

        return [
          (r.receiptNo ? (r.warehouse ? `${r.receiptNo} (${r.warehouse} WH)` : r.receiptNo) : '-'),
          r.marka || linkName || '-',
          r.containerNo && r.containerNo !== '-' ? r.containerNo : 'Pending Allocation',
          r.itemName || '-',
          isDelivered ? 'Delivered' : cleanStat,
          isDelivered ? `Delivered: ${dateText}` : `${dateText} (${daysText})`,
          r.cbm && r.cbm !== '-' ? `${r.cbm} m³` : '-',
          r.weight || '-',
          r.ctn && r.ctn !== '-' ? `${r.ctn} ctn` : '-'
        ];
      });

      autoTable(doc, {
        head: [tableHeaders],
        body: tableRows,
        startY: 70,
        margin: { left: 26, right: 26 },
        styles: {
          fontSize: 8,
          cellPadding: 5.5,
          valign: 'middle'
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [29, 78, 216] },
          1: { fontStyle: 'bold' },
          2: { fontStyle: 'bold', textColor: [51, 65, 85] },
          3: { cellWidth: 130 },
          4: { fontStyle: 'bold', cellWidth: 90 },
          5: { cellWidth: 160 },
          6: { halign: 'center', fontStyle: 'bold' },
          7: { halign: 'center' },
          8: { halign: 'center', fontStyle: 'bold' }
        },
        foot: [
          [
            `Summary (${filteredReceipts.length} Receipts)`,
            '',
            '',
            '',
            '',
            '',
            `${totals.cbm} ${totals.cbm !== '-' ? 'm³' : ''}`,
            `${totals.weight}`,
            `${totals.ctn} ${totals.ctn !== '-' ? 'ctn' : ''}`
          ]
        ],
        footStyles: {
          fillColor: [226, 232, 240],
          textColor: [15, 23, 42],
          fontStyle: 'bold'
        }
      });

      const filename = `${cleanMarka.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (!isForShare) {
        doc.save(filename);
        showToast('📄 PDF downloaded successfully!');
      }

      return file;
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Unable to generate PDF. Please try again.');
      return null;
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Download colorful Excel spreadsheet with separate Status and ETA columns
  const handleDownloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'US International Logistics';
      workbook.created = new Date();

      const cleanMarka = linkName || 'Cargo Tracking';
      const worksheet = workbook.addWorksheet(cleanMarka.slice(0, 31) || 'Cargo Status');

      // Title Banner Row (Spans 9 columns A to I)
      worksheet.mergeCells('A1:I1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'US INTERNATIONAL LOGISTICS - CARGO MASTER STATUS';
      titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 30;

      // Subheader Row: Marka, Export Date, 24-hr link info (Spans 9 columns A to I)
      worksheet.mergeCells('A2:I2');
      const subCell = worksheet.getCell('A2');
      subCell.value = `Marka: ${cleanMarka}  |  Exported: ${new Date().toLocaleDateString()}  |  Track Live 24/7: ${typeof window !== 'undefined' ? window.location.href : ''}`;
      subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF334155' } };
      subCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 20;

      // Column Headers (Row 4) - 9 Separate Columns
      worksheet.getRow(3).height = 8;
      const headerRow = worksheet.getRow(4);
      headerRow.values = [
        'Receipt No.',
        'Marka',
        'Container No.',
        'Item Name',
        'Status',
        'ETA & Days to Come',
        'CBM',
        'Weight',
        'CTN'
      ];
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E40AF' } // Royal Blue
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });

      // Data Rows
      filteredReceipts.forEach((r, idx) => {
        const isDelivered = isReceiptDelivered(r);
        const effDate = isDelivered ? getEffectiveDeliveryDate(r) : r.eta;
        const dateText = effDate ? formatDisplayDate(effDate) : 'Pending Schedule';
        const cleanStat = cleanDisplayStatus(r.status);
        const remDays = getEffectiveRemainDays(r);
        const etaWithDays = isDelivered
          ? `Delivered: ${dateText}`
          : remDays !== null
          ? `${dateText} (${remDays} days to come)`
          : `${dateText} (Pending Schedule)`;

        const row = worksheet.addRow([
          (r.receiptNo ? (r.warehouse ? `${r.receiptNo} (${r.warehouse} WH)` : r.receiptNo) : '-'),
          r.marka || linkName || '-',
          r.containerNo && r.containerNo !== '-' ? r.containerNo : 'Pending Allocation',
          r.itemName || '-',
          isDelivered ? 'Delivered' : cleanStat,
          etaWithDays,
          r.cbm && r.cbm !== '-' ? parseFloat(r.cbm) || r.cbm : '-',
          r.weight || '-',
          r.ctn && r.ctn !== '-' ? parseInt(r.ctn, 10) || r.ctn : '-'
        ]);

        row.height = 22;
        const isEven = idx % 2 === 0;

        // Color coding for status column (Col 5)
        let statusBg = isDelivered ? 'FFD1FAE5' : cleanStat.toLowerCase().includes('warehouse') ? 'FFFEF3C7' : 'FFDBEAFE';
        let statusFg = isDelivered ? 'FF065F46' : cleanStat.toLowerCase().includes('warehouse') ? 'FF92400E' : 'FF1E40AF';

        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Arial', size: 9 };
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 4 ? 'left' : 'center' };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (colNumber === 1) {
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
          } else if (colNumber === 5) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: statusBg }
            };
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: statusFg } };
          } else if (!isEven) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }
        });
      });

      // Summary Row (Cols 1-6 merged for label, Cols 7-9 for totals)
      const summaryRow = worksheet.addRow([
        `Summary (${filteredReceipts.length} Receipts)`,
        '',
        '',
        '',
        '',
        '',
        totals.cbm !== '-' ? `${totals.cbm} m³` : '-',
        totals.weight !== '-' ? totals.weight : '-',
        totals.ctn !== '-' ? `${totals.ctn} ctn` : '-'
      ]);
      summaryRow.height = 24;
      summaryRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'medium', color: { argb: 'FF94A3B8' } }
        };
      });

      worksheet.columns = [
        { width: 16 }, // Receipt No
        { width: 14 }, // Marka
        { width: 18 }, // Container
        { width: 26 }, // Item Name
        { width: 18 }, // Status
        { width: 28 }, // ETA & Days to Come
        { width: 14 }, // CBM
        { width: 14 }, // Weight
        { width: 14 }  // CTN
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanMarka.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('📊 Colorful Excel (.xlsx) file downloaded!');
    } catch (err) {
      console.error('Error generating Excel:', err);
      alert('Failed to generate Excel file. Please try again.');
    } finally {
      setDownloadingExcel(false);
    }
  };

  // WhatsApp Share Handler (JPG, PDF, or Direct Link)
  const handleShareWhatsApp = async (format: 'jpg' | 'pdf' | 'link') => {
    setIsShareDropdownOpen(false);
    setSharingWhatsApp(true);
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const cleanMarka = linkName || 'Shipment';
    const receiptsSummary = filteredReceipts.slice(0, 5).map(r => r.receiptNo).join(', ') + (filteredReceipts.length > 5 ? ` +${filteredReceipts.length - 5} more` : '');

    const shareText = `*US INTERNATIONAL LOGISTICS* 📦\n*Track Live ETA 24 hrs:* ${url}\n\n📍 *Marka:* ${cleanMarka}\n📦 *Receipts (${filteredReceipts.length}):* ${receiptsSummary}\n📊 *Total CTN:* ${totals.ctn} | *CBM:* ${totals.cbm} | *Weight:* ${totals.weight}\n\n🔗 *Live Tracking Link:* \n${url}\n\n_you can track this via link 24 hrs_`;

    try {
      if (format === 'link') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
        showToast('💬 Opening WhatsApp to share tracking link!');
        return;
      }

      let fileToShare: File | null = null;
      if (format === 'jpg') {
        fileToShare = await handleDownloadJpg(true);
      } else if (format === 'pdf') {
        fileToShare = await handleDownloadPdf(true);
      }

      if (fileToShare) {
        if (navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
          await navigator.share({
            files: [fileToShare],
            title: `US Logistics - Cargo Update (${cleanMarka})`,
            text: shareText
          });
          showToast('✓ Shared to WhatsApp successfully!');
          return;
        }
      }

      // Fallback: download file and open WhatsApp Web with message
      if (fileToShare) {
        const fileUrl = URL.createObjectURL(fileToShare);
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileToShare.name;
        a.click();
        URL.revokeObjectURL(fileUrl);
      }

      const note = format === 'jpg'
        ? '\n\n*(📸 JPG Table Image downloaded to attach)*'
        : '\n\n*(📄 PDF Cargo Table downloaded to attach)*';

      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + note)}`, '_blank');
      showToast(`📁 ${format.toUpperCase()} downloaded & opening WhatsApp!`);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('WhatsApp share error:', err);
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
      }
    } finally {
      setSharingWhatsApp(false);
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

            {/* Header Actions: Add Receipt, Query, Copy, JPG, PDF, Excel, WhatsApp */}
            <div className="flex items-center gap-2 flex-wrap relative">
              <button
                onClick={() => {
                  setAddError(null);
                  setExistingLinkDetails(null);
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
                <span>Ask Query {queriesList.length > 0 ? `(${queriesList.length})` : ''}</span>
              </button>

              <button
                onClick={copyTrackingMessage}
                title="Copy shareable message"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>Copy Message</span>
              </button>

              {/* Download JPG (No Scrollbar) */}
              <button
                onClick={() => handleDownloadJpg(false)}
                disabled={downloadingJpg || loading || receipts.length === 0}
                title="Download table image (no scrollbars)"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Download className={`w-3.5 h-3.5 ${downloadingJpg ? 'animate-bounce' : ''}`} />
                <span>{downloadingJpg ? 'JPG...' : 'JPG'}</span>
              </button>

              {/* Download PDF */}
              <button
                onClick={() => handleDownloadPdf(false)}
                disabled={downloadingPdf || loading || receipts.length === 0}
                title="Download as clean printable PDF"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <FileText className={`w-3.5 h-3.5 text-red-600 ${downloadingPdf ? 'animate-spin' : ''}`} />
                <span>{downloadingPdf ? 'PDF...' : 'PDF'}</span>
              </button>

              {/* Download Excel */}
              <button
                onClick={handleDownloadExcel}
                disabled={downloadingExcel || loading || receipts.length === 0}
                title="Download colorful Excel spreadsheet"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 text-emerald-600 ${downloadingExcel ? 'animate-spin' : ''}`} />
                <span>{downloadingExcel ? 'Excel...' : 'Excel'}</span>
              </button>

              {/* Share on WhatsApp Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsShareDropdownOpen(!isShareDropdownOpen)}
                  disabled={sharingWhatsApp || loading || receipts.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Share on WhatsApp (JPG / PDF / Link)"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-white" />
                  <span>{sharingWhatsApp ? 'Sharing...' : 'WhatsApp'}</span>
                  <ChevronDown className="w-3 h-3 text-white/80" />
                </button>

                {isShareDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp('jpg')}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 font-bold flex items-center gap-2 cursor-pointer transition"
                    >
                      <Download className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div>Share JPG Image</div>
                        <div className="text-[10px] text-slate-400 font-normal">Clean image without scrollbar</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp('pdf')}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 font-bold flex items-center gap-2 cursor-pointer transition"
                    >
                      <FileText className="w-4 h-4 text-red-600" />
                      <div>
                        <div>Share PDF Document</div>
                        <div className="text-[10px] text-slate-400 font-normal">Vector table document</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp('link')}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 font-bold flex items-center gap-2 cursor-pointer transition border-t border-slate-100"
                    >
                      <Share2 className="w-4 h-4 text-blue-600" />
                      <div>
                        <div>Share Live Link</div>
                        <div className="text-[10px] text-slate-400 font-normal">Cargo summary with URL</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

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

          {/* Mobile-optimized Compact Status Strip & Quick Jump */}
          {!loading && !error && receipts.length > 0 && (
            <div className="sm:hidden mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold">
                <span className="text-blue-800">🚢 {stats.inTransit} Transit</span>
                <span className="text-amber-800">📦 {stats.inWarehouse} Warehouse</span>
                <span className="text-emerald-800">✓ {stats.delivered} Done</span>
                <span className="text-slate-700">{totals.ctn} CTN</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('cargo-data-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <span>⚡ View ETA &amp; Cargo Details ({receipts.length} Receipts)</span>
                <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
              </button>
            </div>
          )}

          {/* Real-time Shipment Statistics & Summary Cards for Public User (Desktop & Tablet) */}
          {!loading && !error && receipts.length > 0 && (
            <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100">
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
            id="cargo-data-section"
            ref={tableCardRef}
            className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-1 scroll-mt-4"
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
            <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 bg-slate-50/70 no-jpg">
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
                      setExistingLinkDetails(null);
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
                <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs no-jpg">
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

            {/* Sorting Info & Quick Reset Bar */}
            <div className="px-3 sm:px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 no-jpg">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-[11px] uppercase tracking-wider text-slate-500">
                  Current Sort:
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-800 border border-slate-300 shadow-2xs">
                  {sortField === 'eta' ? (
                    <>
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>ETA Date ({sortDirection === 'asc' ? 'Earliest First • Ascending' : 'Latest First • Descending'})</span>
                      {sortDirection === 'asc' && (
                        <span className="text-[10px] text-blue-600 font-extrabold bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">DEFAULT</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="uppercase text-blue-700">{sortField}</span>
                      <span>({sortDirection === 'asc' ? 'A to Z / Min to Max' : 'Z to A / Max to Min'})</span>
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-400">
                  (Click any column header to sort A-Z or Z-A)
                </span>
              </div>

              {(sortField !== 'eta' || sortDirection !== 'asc') && (
                <button
                  type="button"
                  onClick={resetSortToDefault}
                  className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer shadow-2xs"
                  title="Reset table to default chronological ETA ascending sort"
                >
                  <RefreshCw className="w-3 h-3 text-blue-600" />
                  <span>Reset to Default (ETA Ascending)</span>
                </button>
              )}
            </div>

            {/* Mobile View Toggle (Cards vs Full Table) */}
            <div className="flex md:hidden items-center justify-between p-2.5 bg-slate-100/90 border-b border-slate-200 text-xs no-jpg">
              <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                <span>📱 Mobile Layout:</span>
              </span>
              <div className="inline-flex bg-slate-200 p-0.5 rounded-lg font-bold">
                <button
                  type="button"
                  onClick={() => setMobileViewMode('cards')}
                  className={`px-3 py-1 rounded-md transition cursor-pointer ${
                    mobileViewMode === 'cards' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Cards View
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewMode('table')}
                  className={`px-3 py-1 rounded-md transition cursor-pointer ${
                    mobileViewMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Table View
                </button>
              </div>
            </div>

            {/* ── MOBILE CARDS VIEW (Clean, touch-friendly, no horizontal scrolling needed) ── */}
            {mobileViewMode === 'cards' && (
              <div className="md:hidden p-2.5 space-y-3 bg-slate-50/60 no-jpg">
                {filteredReceipts.map((r, idx) => {
                  const isDelivered = isReceiptDelivered(r);
                  const effDate = isDelivered ? getEffectiveDeliveryDate(r) : r.eta;
                  const dateText = effDate ? formatDisplayDate(effDate) : 'Pending Schedule';
                  const cleanStat = cleanDisplayStatus(r.status);
                  const isSelected = selectedReceiptNos.has(r.receiptNo);
                  const colorTheme = getReceiptColorTheme(r.receiptNo, receipts);

                  return (
                    <div
                      key={`card-${r.id || r.receiptNo}-${idx}`}
                      style={{ borderLeft: `5px solid ${colorTheme.borderHex}` }}
                      className={`p-3.5 bg-white border rounded-xl shadow-xs transition ${
                        isSelected ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-300' : 'border-slate-200'
                      }`}
                    >
                      {/* Top Row: Checkbox, Receipt No, Marka, Status */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => toggleSelectReceipt(r.receiptNo)}
                            className="cursor-pointer text-slate-400 hover:text-blue-600 transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openQueryModal(r.receiptNo)}
                            style={{
                              backgroundColor: colorTheme.pillBg,
                              borderColor: colorTheme.pillBorder,
                              color: colorTheme.pillText
                            }}
                            className="inline-flex items-center gap-1 font-mono font-black border px-2 py-0.5 rounded-md text-xs cursor-pointer hover:opacity-80 transition"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${colorTheme.dotBg} inline-block shrink-0`} />
                            <span>#{r.receiptNo}</span>
                          </button>
                          {r.warehouse && (
                            <span className="font-bold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded text-[10px] uppercase">
                              {r.warehouse} WH
                            </span>
                          )}
                          {r.splitInfo && (
                            <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px]">
                              {r.splitInfo}
                            </span>
                          )}
                          <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {r.marka || linkName || '-'}
                          </span>
                        </div>

                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isDelivered
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : cleanStat.toLowerCase().includes('warehouse')
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}>
                          {isDelivered ? '✓ Delivered' : cleanStat}
                        </span>
                      </div>

                      {/* Item Name */}
                      <div className="font-bold text-slate-900 text-xs mb-2 leading-snug">
                        {r.itemName || 'Cargo Item'}
                      </div>

                      {/* Container & ETA Box */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 mb-2.5 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-semibold">Container (Loading Plan):</span>
                          <span className="font-mono font-bold text-slate-800">
                            {r.containerNo && r.containerNo !== '-' ? r.containerNo : 'Pending Allocation'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-semibold">
                            {isDelivered ? 'Delivered Date:' : 'Estimated Arrival (ETA):'}
                          </span>
                          <span className="font-extrabold text-blue-950 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-blue-600" />
                            {dateText}
                          </span>
                        </div>

                        {!isDelivered && (
                          <div className="flex items-center justify-between pt-0.5 border-t border-slate-200/60">
                            <span className="text-slate-500 font-semibold">Countdown:</span>
                            {renderRemainDaysBadge(getEffectiveRemainDays(r))}
                          </div>
                        )}
                      </div>

                      {/* Cargo Metrics Grid: CBM / Weight / CTN */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2.5">
                        <div className="bg-slate-100/90 p-1.5 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 uppercase font-extrabold">CBM</div>
                          <div className="font-black text-slate-900 mt-0.5">
                            {r.cbm && r.cbm !== '-' ? `${r.cbm} m³` : '-'}
                          </div>
                        </div>
                        <div className="bg-slate-100/90 p-1.5 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 uppercase font-extrabold">Weight</div>
                          <div className="font-bold text-slate-800 mt-0.5">
                            {r.weight || '-'}
                          </div>
                        </div>
                        <div className="bg-slate-100/90 p-1.5 rounded-lg border border-slate-200">
                          <div className="text-[10px] text-slate-400 uppercase font-extrabold">CTN</div>
                          <div className="font-black text-slate-900 mt-0.5">
                            {r.ctn && r.ctn !== '-' ? `${r.ctn} ctn` : '-'}
                          </div>
                        </div>
                      </div>

                      {/* Touch action to ask query */}
                      <button
                        type="button"
                        onClick={() => openQueryModal(r.receiptNo)}
                        className="w-full py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                        <span>Ask Question about Receipt #{r.receiptNo}</span>
                      </button>
                    </div>
                  );
                })}

                {/* Mobile Cards Summary Bar */}
                <div className="p-3 bg-slate-900 text-white rounded-xl text-xs space-y-2">
                  <div className="font-bold uppercase tracking-wider text-[11px] text-blue-300">
                    Summary ({filteredReceipts.length} Receipts)
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/10 p-1.5 rounded-lg">
                      <div className="text-[10px] text-slate-300 font-bold">TOTAL CBM</div>
                      <div className="font-black text-sm text-white">{totals.cbm} {totals.cbm !== '-' ? 'm³' : ''}</div>
                    </div>
                    <div className="bg-white/10 p-1.5 rounded-lg">
                      <div className="text-[10px] text-slate-300 font-bold">TOTAL WEIGHT</div>
                      <div className="font-black text-sm text-white">{totals.weight}</div>
                    </div>
                    <div className="bg-white/10 p-1.5 rounded-lg">
                      <div className="text-[10px] text-slate-300 font-bold">TOTAL CTN</div>
                      <div className="font-black text-sm text-white">{totals.ctn} {totals.ctn !== '-' ? 'ctn' : ''}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Swipe hint when table view is active on mobile */}
            {mobileViewMode === 'table' && (
              <div className="md:hidden text-[11px] text-slate-500 bg-blue-50/70 px-3 py-1.5 flex items-center justify-between border-b border-slate-200 no-jpg">
                <span>👉 Swipe left / right to see all 9 table columns</span>
                <span className="font-bold text-blue-700">9 Columns</span>
              </div>
            )}

            {/* Responsive Table */}
            <div data-role="jpg-cargo-table" className={`overflow-x-auto touch-pan-x ${mobileViewMode === 'cards' ? 'hidden md:block' : 'block'}`}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 text-center w-10 no-jpg">
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

                    {/* 1. Receipt No. */}
                    <th className="py-3.5 px-4 whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('receiptNo')}
                        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'receiptNo' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Receipt No. (A to Z / Z to A)"
                      >
                        <span>Receipt No.</span>
                        {sortField === 'receiptNo' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> A-Z
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Z-A
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 2. Marka */}
                    <th className="py-3.5 px-4 whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('marka')}
                        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'marka' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Marka (A to Z / Z to A)"
                      >
                        <span>Marka</span>
                        {sortField === 'marka' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> A-Z
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Z-A
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 3. Container No. */}
                    <th className="py-3.5 px-4 whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('containerNo')}
                        className={`inline-flex flex-col items-start gap-0.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'containerNo' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Container No. (A to Z / Z to A)"
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <span>Container No.</span>
                          {sortField === 'containerNo' ? (
                            sortDirection === 'asc' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                                <ArrowUp className="w-3 h-3" /> A-Z
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                                <ArrowDown className="w-3 h-3" /> Z-A
                              </span>
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal lowercase">(loading plan container)</span>
                      </button>
                    </th>

                    {/* 4. Item Name */}
                    <th className="py-3.5 px-4 min-w-[170px] select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('itemName')}
                        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'itemName' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Item Name (A to Z / Z to A)"
                      >
                        <span>Item Name</span>
                        {sortField === 'itemName' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> A-Z
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Z-A
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 5. Status */}
                    <th className="py-3.5 px-4 whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'status' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Status (In Transit, Received in Warehouse, Delivered)"
                      >
                        <span>Status</span>
                        {sortField === 'status' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> A-Z
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Z-A
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 6. ETA & Days to Come */}
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[210px] select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('eta')}
                        className={`inline-flex flex-col items-start gap-0.5 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group ${
                          sortField === 'eta' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Date (Default: Chronological Ascending: Earliest First)"
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <span>ETA & Days to Come</span>
                          {sortField === 'eta' ? (
                            sortDirection === 'asc' ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-500/30 border border-blue-400/60 rounded text-[10px] font-bold text-blue-200">
                                <ArrowUp className="w-3.5 h-3.5 text-blue-300" /> Earliest First (Default)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-500/30 border border-blue-400/60 rounded text-[10px] font-bold text-blue-200">
                                <ArrowDown className="w-3.5 h-3.5 text-blue-300" /> Latest First
                              </span>
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                          )}
                        </div>
                        <span className="text-[10px] text-blue-300 font-semibold lowercase">
                          (eta date & how days to come)
                        </span>
                      </button>
                    </th>

                    {/* 7. CBM */}
                    <th className="py-3.5 px-4 text-center whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('cbm')}
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group mx-auto ${
                          sortField === 'cbm' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by CBM (Volume)"
                      >
                        <span>CBM</span>
                        {sortField === 'cbm' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> Min
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Max
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 8. Weight */}
                    <th className="py-3.5 px-4 text-center whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('weight')}
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group mx-auto ${
                          sortField === 'weight' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Weight"
                      >
                        <span>Weight</span>
                        {sortField === 'weight' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> Min
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Max
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>

                    {/* 9. CTN */}
                    <th className="py-3.5 px-4 text-center whitespace-nowrap select-none">
                      <button
                        type="button"
                        onClick={() => handleSort('ctn')}
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[11px] hover:text-blue-300 transition cursor-pointer group mx-auto ${
                          sortField === 'ctn' ? 'text-blue-400' : 'text-white'
                        }`}
                        title="Sort by Carton Count (CTN)"
                      >
                        <span>CTN</span>
                        {sortField === 'ctn' ? (
                          sortDirection === 'asc' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowUp className="w-3 h-3" /> Min
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-500/20 border border-blue-400/40 rounded text-[10px] font-mono text-blue-300">
                              <ArrowDown className="w-3 h-3" /> Max
                            </span>
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((r, idx) => {
                    const colorTheme = getReceiptColorTheme(r.receiptNo, receipts);
                    return (
                    <tr
                      key={`row-${r.id || r.receiptNo}-${idx}`}
                      style={{ borderLeft: `5px solid ${colorTheme.borderHex}` }}
                      className={`hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/30 ${
                        selectedReceiptNos.has(r.receiptNo) ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-300' : ''
                      }`}
                    >
                      {/* Checkbox Column (Hidden in JPG download) */}
                      <td className="py-3.5 px-3 text-center no-jpg">
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

                      {/* 1. Receipt No. */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openQueryModal(r.receiptNo)}
                          title="Click to ask a query about this receipt"
                          style={{
                            backgroundColor: colorTheme.pillBg,
                            borderColor: colorTheme.pillBorder,
                            color: colorTheme.pillText
                          }}
                          className="inline-flex items-center gap-1.5 font-mono font-bold border px-2.5 py-1 rounded-md text-xs cursor-pointer hover:opacity-85 transition shadow-xs group"
                        >
                          <span className={`w-2 h-2 rounded-full ${colorTheme.dotBg} inline-block shrink-0`} />
                          <Package className="w-3.5 h-3.5 opacity-80 group-hover:scale-110 transition-transform" />
                          <span>{r.receiptNo}</span>
                          {r.warehouse && (
                            <span className="text-[10px] font-bold bg-white/90 border border-current px-1.5 py-0.2 rounded ml-1 uppercase">
                              {r.warehouse} WH
                            </span>
                          )}
                          {r.splitInfo && (
                            <span className="text-[10px] font-extrabold bg-white/80 border border-current px-1.5 py-0.2 rounded ml-1">
                              {r.splitInfo}
                            </span>
                          )}
                          <span className="no-jpg text-[10px] font-sans font-normal opacity-80 group-hover:opacity-100 flex items-center gap-0.5 ml-1">
                            <MessageCircle className="w-3 h-3" /> Ask
                          </span>
                        </button>
                      </td>

                      {/* 2. Marka */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-xs">
                          {r.marka || linkName || '-'}
                        </span>
                      </td>

                      {/* 3. Container No. (not actual) */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                        {r.containerNo && r.containerNo !== '-' ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                            {r.containerNo}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Pending Allocation</span>
                        )}
                      </td>

                      {/* 4. Item Name */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {r.itemName || '-'}
                      </td>

                      {/* 5. Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isReceiptDelivered(r) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Delivered</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-2xs ${
                            cleanDisplayStatus(r.status).toLowerCase().includes('warehouse')
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}>
                            {cleanDisplayStatus(r.status).toLowerCase().includes('warehouse') ? (
                              <Warehouse className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            ) : (
                              <Ship className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            )}
                            <span>{cleanDisplayStatus(r.status)}</span>
                          </span>
                        )}
                      </td>

                      {/* 6. ETA & Days to Come */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isReceiptDelivered(r) ? (
                          <div className="flex flex-col gap-1 items-start">
                            <div className="font-extrabold text-emerald-900 flex items-center gap-1.5 text-xs">
                              <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Delivered: {formatDisplayDate(getEffectiveDeliveryDate(r))}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>Completed</span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <div className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>ETA: {formatDisplayDate(r.eta)}</span>
                            </div>
                            <div>
                              {renderRemainDaysBadge(getEffectiveRemainDays(r))}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 7. CBM */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {r.cbm && r.cbm !== '-' ? `${r.cbm} m³` : '-'}
                      </td>

                      {/* 8. Weight */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-semibold text-slate-700">
                        {r.weight || '-'}
                      </td>

                      {/* 9. CTN */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {r.ctn && r.ctn !== '-' ? `${r.ctn} ctn` : '-'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>

                {/* Table Footer Summary Row */}
                {filteredReceipts.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/90 text-slate-800 font-bold border-t-2 border-slate-300 text-xs">
                      <td className="py-3 px-3 text-center no-jpg"></td>
                      <td className="py-3 px-4 font-black uppercase text-slate-700" colSpan={4}>
                        Summary ({filteredReceipts.length} {filteredReceipts.length === 1 ? 'Receipt' : 'Receipts'})
                      </td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-center font-black text-slate-900 whitespace-nowrap">
                        {totals.cbm} {totals.cbm !== '-' ? 'm³' : ''}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800 whitespace-nowrap">
                        {totals.weight}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-slate-900 whitespace-nowrap">
                        {totals.ctn} {totals.ctn !== '-' ? 'ctn' : ''}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Delivered Shipments Visibility Toggle Banner */}
            {stats.delivered > 0 && (activeStatusTab === 'active' || activeStatusTab === 'transit') && (
              <div className="p-3 bg-emerald-50/70 border-t border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-900 no-jpg">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    📦 <strong>{stats.delivered} Delivered shipment(s)</strong> {showDelivered ? 'are currently displayed at the bottom.' : 'are hidden by default to keep active shipments focused.'}
                  </span>
                </div>
                {showDelivered ? (
                  <button
                    type="button"
                    onClick={() => setShowDelivered(false)}
                    className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-lg transition text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Hide Delivered Shipments</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDelivered(true)}
                    className="px-3 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold rounded-lg transition text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Show Delivered Shipments ({stats.delivered})</span>
                  </button>
                )}
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
                Enter your <strong>Receipt Number</strong> and the exact <strong>Carton Count (CTN)</strong> as written on your warehouse slip. Since receipts can be issued across different China warehouses (e.g. Guangzhou vs Yiwu), Carton Count ensures your exact warehouse receipt is verified and linked.
              </div>

              {addError && (
                <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl text-red-900 text-xs flex flex-col gap-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-semibold">{addError}</span>
                  </div>
                  {existingLinkDetails?.linkUrl && (
                    <div className="bg-white border border-red-200 p-2.5 rounded-lg flex items-center justify-between gap-3 shadow-xs">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Already Added To Link</span>
                        <span className="font-extrabold text-slate-900 truncate block text-xs">
                          {existingLinkDetails.linkName || existingLinkDetails.linkToken}
                        </span>
                      </div>
                      <a
                        href={existingLinkDetails.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow-xs shrink-0 transition"
                      >
                        <span>Find Details Here</span>
                        <span aria-hidden="true">&rarr;</span>
                      </a>
                    </div>
                  )}
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
                    2. Total Received CTN (Cartons Received in Warehouse) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 15 or 15 ctn"
                    value={addCtn}
                    onChange={(e) => setAddCtn(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-emerald-600 font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block font-medium">
                    Enter the total carton count received in warehouse as per warehouse receipt slip.
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
