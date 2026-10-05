'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Calendar,
  Search,
  Copy,
  Check,
  Phone,
  Save,
  CheckCircle2,
  Clock,
  Package,
  Boxes,
  ExternalLink,
  RefreshCw,
  Send,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { formatGlobalDate } from '@/lib/dateUtils';

export interface NotificationReceipt {
  _id: string;
  receipt: string;
  warehouse: string;
  date: string;
  mainMarka?: string;
  subMarka?: string;
  party?: string;
  english?: string;
  commodity?: string;
  chinese?: string;
  quantity: number | string;
  weight: string | number;
  volume: string | number;
  phone?: string;
  messageSent: boolean;
  messageSentAt?: string | null;
  messageSentDate?: string;
}

interface Stats {
  total: number;
  pending: number;
  sent: number;
  totalCartons: number;
  totalWeight: number;
  totalVolume: number;
}

interface Props {
  initialDate?: string;
  onClose?: () => void;
}

export default function PartyArrivalNotifications({ initialDate, onClose }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || '');
  const [distinctDates, setDistinctDates] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<NotificationReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    sent: 0,
    totalCartons: 0,
    totalWeight: 0,
    totalVolume: 0,
  });

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent'>('all');

  // Local phone inputs per receipt
  const [phoneInputs, setPhoneInputs] = useState<Record<string, string>>({});
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);
  const [phoneSaveSuccess, setPhoneSaveSuccess] = useState<Record<string, boolean>>({});

  // Copy status per receipt
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Default warehouse label for message
  const [customWarehouse, setCustomWarehouse] = useState<string>('RS-21 Warehouse');

  // Fetch receipts for the selected date
  const fetchReceipts = useCallback(async (dateToFetch?: string) => {
    setLoading(true);
    try {
      const targetDate = dateToFetch !== undefined ? dateToFetch : selectedDate;
      const params = new URLSearchParams();
      if (targetDate) params.set('date', targetDate);

      const res = await fetch(`/api/warehouse/notifications?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setReceipts(data.receipts || []);
        setStats(data.stats || {
          total: 0,
          pending: 0,
          sent: 0,
          totalCartons: 0,
          totalWeight: 0,
          totalVolume: 0,
        });

        if (data.distinctDates && data.distinctDates.length > 0) {
          setDistinctDates(data.distinctDates);
          // If no date was selected yet, select the most recent date
          if (!targetDate && data.distinctDates[0]) {
            setSelectedDate(data.distinctDates[0]);
          }
        }

        // Initialize phone inputs
        const initialPhones: Record<string, string> = {};
        (data.receipts || []).forEach((r: NotificationReceipt) => {
          if (r.phone) initialPhones[r._id] = r.phone;
        });
        setPhoneInputs((prev) => ({ ...initialPhones, ...prev }));
      }
    } catch (err: any) {
      console.error('Failed to fetch notification receipts:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchReceipts();
  }, [selectedDate, fetchReceipts]);

  // Construct message according to user's exact specification
  const generateMessage = (r: NotificationReceipt): string => {
    const wh = (r.warehouse && r.warehouse.trim() && r.warehouse.trim() !== 'China Warehouse')
      ? r.warehouse.trim()
      : (customWarehouse.trim() || 'RS-21 Warehouse');
    
    // Ensure warehouse formatting
    const effectiveWarehouse = wh.toLowerCase().includes('warehouse') ? wh : `${wh} Warehouse`;
    const dateStr = r.date || selectedDate || new Date().toISOString().slice(0, 10);
    const mark = [r.mainMarka, r.subMarka].filter(Boolean).join(' / ') || r.party || '-';
    const desc = r.english || r.commodity || (r.chinese ? `${r.chinese}` : 'General Goods');
    const ctn = r.quantity || '0';
    const wt = r.weight || '0';
    const vol = r.volume || '0';

    return `Item Arrival Notification 📦 Item with following details has arrived in ${effectiveWarehouse} on* ${dateStr}
Receipt ID: ${r.receipt || ''}
Mark: ${mark}
Description ${desc}
CTN ${ctn}
Weight: ${wt}
Volume: ${vol}
Please share the Warehouse Slip , Packing List ,Item Name and Item Image for our records.

Please note without above details goods will not be load`;
  };

  // Copy message & mark as sent
  const handleCopyAndMarkSent = async (r: NotificationReceipt) => {
    const message = generateMessage(r);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedId(r._id);
      setTimeout(() => setCopiedId(null), 3000);

      // Record in database that message was copied & sent
      const res = await fetch('/api/warehouse/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-sent',
          receiptId: r._id,
          receipt: r.receipt,
          warehouse: r.warehouse,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReceipts((prev) =>
          prev.map((item) =>
            item._id === r._id
              ? {
                  ...item,
                  messageSent: true,
                  messageSentAt: data.messageSentAt,
                  messageSentDate: data.messageSentDate,
                }
              : item
          )
        );
        setStats((prev) => ({
          ...prev,
          pending: Math.max(0, prev.pending - 1),
          sent: prev.sent + 1,
        }));
        setActionMessage(`Message for Receipt ${r.receipt} copied & marked as Sent!`);
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err: any) {
      alert(`Could not copy to clipboard: ${err.message}`);
    }
  };

  // Direct WhatsApp sending
  const handleSendWhatsApp = async (r: NotificationReceipt) => {
    const phone = phoneInputs[r._id] || r.phone || '';
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = generateMessage(r);

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Ignore clipboard error
    }

    // Mark as sent in database
    try {
      const res = await fetch('/api/warehouse/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-sent',
          receiptId: r._id,
          receipt: r.receipt,
          warehouse: r.warehouse,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReceipts((prev) =>
          prev.map((item) =>
            item._id === r._id
              ? {
                  ...item,
                  messageSent: true,
                  messageSentAt: data.messageSentAt,
                  messageSentDate: data.messageSentDate,
                }
              : item
          )
        );
      }
    } catch {
      // Non-critical
    }

    // Open WhatsApp link
    const encoded = encodeURIComponent(message);
    let waUrl = `https://wa.me/?text=${encoded}`;
    if (cleanPhone) {
      // If phone starts without country code and is 10 digits, assume India (+91)
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.replace(/^\+/, '');
      waUrl = `https://wa.me/${formattedPhone}?text=${encoded}`;
    }
    window.open(waUrl, '_blank');
  };

  // Save party mobile number for future reference
  const handleSaveMobile = async (r: NotificationReceipt) => {
    const phone = phoneInputs[r._id] || '';
    if (!phone.trim()) {
      alert('Please enter a mobile / WhatsApp number to save.');
      return;
    }

    setSavingPhoneId(r._id);
    try {
      const marka = r.mainMarka || r.subMarka || r.party || '';
      const res = await fetch('/api/warehouse/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-mobile',
          receiptId: r._id,
          receipt: r.receipt,
          marka,
          party: r.party,
          phone: phone.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save mobile');

      // Update receipts locally with saved phone
      setReceipts((prev) =>
        prev.map((item) => {
          const itemMark = item.mainMarka || item.subMarka || item.party || '';
          if (item._id === r._id || (marka && itemMark.toUpperCase() === marka.toUpperCase())) {
            return { ...item, phone: phone.trim() };
          }
          return item;
        })
      );

      setPhoneSaveSuccess((prev) => ({ ...prev, [r._id]: true }));
      setTimeout(() => {
        setPhoneSaveSuccess((prev) => ({ ...prev, [r._id]: false }));
      }, 3000);

      setActionMessage(`Mobile ${phone.trim()} saved for Mark '${marka || r.receipt}' for future reference!`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Error saving mobile number');
    } finally {
      setSavingPhoneId(null);
    }
  };

  // Toggle mark as unsent
  const handleMarkUnsent = async (r: NotificationReceipt) => {
    try {
      const res = await fetch('/api/warehouse/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-unsent',
          receiptId: r._id,
        }),
      });
      if (res.ok) {
        setReceipts((prev) =>
          prev.map((item) =>
            item._id === r._id
              ? {
                  ...item,
                  messageSent: false,
                  messageSentAt: null,
                  messageSentDate: '',
                }
              : item
          )
        );
        setStats((prev) => ({
          ...prev,
          pending: prev.pending + 1,
          sent: Math.max(0, prev.sent - 1),
        }));
      }
    } catch {
      // Non-critical
    }
  };

  // Bulk copy all messages for selected date
  const handleCopyAllMessages = async () => {
    const listToCopy = filteredReceipts;
    if (listToCopy.length === 0) return;

    const allText = listToCopy
      .map((r, i) => `--- ITEM #${i + 1} (${r.receipt}) ---\n${generateMessage(r)}`)
      .join('\n\n════════════════════════════════════\n\n');

    try {
      await navigator.clipboard.writeText(allText);

      // Mark all as sent in DB
      const ids = listToCopy.map((r) => r._id);
      await fetch('/api/warehouse/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-sent',
          receiptIds: ids,
        }),
      });

      setReceipts((prev) =>
        prev.map((item) =>
          ids.includes(item._id)
            ? {
                ...item,
                messageSent: true,
                messageSentDate: formatGlobalDate(new Date()),
              }
            : item
        )
      );

      setActionMessage(`Copied all ${listToCopy.length} messages and marked them as Sent!`);
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      alert(`Could not copy all: ${err.message}`);
    }
  };

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    let result = receipts;

    if (statusFilter === 'pending') {
      result = result.filter((r) => !r.messageSent);
    } else if (statusFilter === 'sent') {
      result = result.filter((r) => r.messageSent);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.receipt.toLowerCase().includes(q) ||
          (r.mainMarka && r.mainMarka.toLowerCase().includes(q)) ||
          (r.subMarka && r.subMarka.toLowerCase().includes(q)) ||
          (r.party && r.party.toLowerCase().includes(q)) ||
          (r.english && r.english.toLowerCase().includes(q)) ||
          (r.commodity && r.commodity.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q))
      );
    }

    return result;
  }, [receipts, statusFilter, searchQuery]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden space-y-6 p-4 sm:p-6 lg:p-8 animate-fadeIn">
      {/* ── TOP HEADER BANNER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Item Arrival Notification (माल प्राप्ति पार्टी सूचना)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                WhatsApp Ready
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select receipt date to view received goods, generate formatted party messages, copy &amp; record sending timestamps.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => fetchReceipts()}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
            title="Refresh receipts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* ── ACTION MESSAGE TOAST ── */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* ── STEP 1: RECEIPT DATE SELECTOR & SEARCH TOOLBAR ── */}
      <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          {/* Date Picker Input */}
          <div className="md:col-span-4">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Select Receipt Date (प्राप्ति तारीख चुनें) *</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs font-mono"
            />
          </div>

          {/* Quick Dates Dropdown */}
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Or Choose From Inward Dates ({distinctDates.length})
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            >
              <option value="">-- Choose Date with Inward Receipts --</option>
              {distinctDates.map((d) => (
                <option key={d} value={d}>
                  {formatGlobalDate(d)} ({d})
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse Name Setting */}
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Warehouse Name in Message
            </label>
            <input
              type="text"
              value={customWarehouse}
              onChange={(e) => setCustomWarehouse(e.target.value)}
              placeholder="e.g. RS-21 Warehouse"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="relative flex-1 w-full sm:w-auto">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Mark, Receipt ID, Party, Description..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({receipts.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <span>Pending ({stats.pending})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('sent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                statusFilter === 'sent'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span>Sent ({stats.sent})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── METRICS SUMMARY BAR ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Selected Date
          </span>
          <span className="text-sm font-black text-slate-900 font-mono">
            {selectedDate ? formatGlobalDate(selectedDate) : 'All Dates'}
          </span>
        </div>

        <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
            Total Receipts
          </span>
          <span className="text-xl font-black text-blue-950">{stats.total}</span>
        </div>

        <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
            Total Cartons
          </span>
          <span className="text-xl font-black text-indigo-950">
            {stats.totalCartons} <span className="text-xs font-semibold text-slate-500">CTN</span>
          </span>
        </div>

        <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
            Pending Messages
          </span>
          <span className="text-xl font-black text-amber-950">{stats.pending}</span>
        </div>

        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Messages Sent
          </span>
          <span className="text-xl font-black text-emerald-950">{stats.sent}</span>
        </div>

        <div className="flex items-center justify-center p-2 bg-slate-50 rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
          <button
            type="button"
            onClick={handleCopyAllMessages}
            disabled={filteredReceipts.length === 0}
            className="w-full h-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-2xs disabled:opacity-50"
            title="Copy all formatted messages for this date to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy All ({filteredReceipts.length})</span>
          </button>
        </div>
      </div>

      {/* ── STEP 2: RECEIPT CARDS & LIVE MESSAGE COPIER ── */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold">Loading inward receipts for date...</p>
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="py-16 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 p-8">
          <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No Inward Goods Found for Selected Date</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {selectedDate
              ? `No goods receipts recorded on ${formatGlobalDate(selectedDate)} (${selectedDate}). Please select another date from the dropdown above or enter received goods in Loader Hub.`
              : 'Please select a receipt date above to preview goods and copy arrival messages.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
            <span>
              Showing {filteredReceipts.length} received items on {selectedDate ? formatGlobalDate(selectedDate) : 'all dates'}
            </span>
            <span className="text-[11px] text-slate-400">
              Click &ldquo;Copy Message&rdquo; to automatically record the message send date
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {filteredReceipts.map((r) => {
              const messageText = generateMessage(r);
              const currentPhone = phoneInputs[r._id] !== undefined ? phoneInputs[r._id] : r.phone || '';
              const isCopied = copiedId === r._id;
              const isSaved = phoneSaveSuccess[r._id];
              const isSaving = savingPhoneId === r._id;

              return (
                <div
                  key={r._id}
                  className={`bg-white rounded-2xl border transition shadow-xs overflow-hidden ${
                    r.messageSent
                      ? 'border-emerald-300 ring-1 ring-emerald-200'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {/* Card Top Header */}
                  <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Receipt:</span>
                        <span className="font-mono text-sm font-black text-slate-950 px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs">
                          {r.receipt}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Mark:</span>
                        <span className="font-mono text-xs font-black text-indigo-900 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                          {[r.mainMarka, r.subMarka].filter(Boolean).join(' / ') || r.party || '-'}
                        </span>
                      </div>

                      <span className="text-[11px] font-medium text-slate-500">
                        {r.warehouse || customWarehouse} • {formatGlobalDate(r.date)}
                      </span>
                    </div>

                    {/* Sent Status Badge */}
                    <div>
                      {r.messageSent ? (
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Message Sent ({r.messageSentDate || 'Recorded'})</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Pending Notification</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Column: Cargo Details & Mobile Number */}
                    <div className="lg:col-span-5 space-y-4">
                      {/* Cargo Summary Stats */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Cartons</span>
                          <span className="text-base font-black text-slate-900">{r.quantity}</span>
                          <span className="text-[10px] text-slate-400 block font-semibold">CTN</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Weight</span>
                          <span className="text-base font-black text-slate-900">{r.weight}</span>
                          <span className="text-[10px] text-slate-400 block font-semibold">KG</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">Volume</span>
                          <span className="text-base font-black text-slate-900">{r.volume}</span>
                          <span className="text-[10px] text-slate-400 block font-semibold">CBM</span>
                        </div>
                      </div>

                      {/* Item Description */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Description (वस्तु विवरण)
                        </span>
                        <p className="text-xs font-bold text-slate-900">
                          {r.english || r.commodity || 'General Goods'}
                        </p>
                        {r.chinese && (
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">{r.chinese}</p>
                        )}
                      </div>

                      {/* Party Mobile Number & Save for Future Reference */}
                      <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-amber-950 uppercase flex items-center space-x-1.5">
                            <Phone className="w-3.5 h-3.5 text-amber-600" />
                            <span>Party Mobile / WhatsApp No.</span>
                          </label>
                          {r.phone && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.2 rounded">
                              ✓ Saved
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <input
                            type="tel"
                            value={currentPhone}
                            onChange={(e) =>
                              setPhoneInputs((prev) => ({ ...prev, [r._id]: e.target.value }))
                            }
                            placeholder="e.g. 9810012345 or +91..."
                            className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono shadow-2xs"
                          />

                          <button
                            type="button"
                            onClick={() => handleSaveMobile(r)}
                            disabled={isSaving}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs shrink-0 disabled:opacity-50"
                            title="Save mobile number for this receipt and for this Mark in future reference"
                          >
                            {isSaved ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Saved!</span>
                              </>
                            ) : isSaving ? (
                              <span>Saving...</span>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5" />
                                <span>Save Mobile</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] text-amber-800">
                          Saving associates this mobile with Mark &lsquo;{r.mainMarka || r.party || r.receipt}&rsquo; for future inward arrivals automatically.
                        </p>
                      </div>
                    </div>

                    {/* Right Column: Exact Message Preview & Action Buttons */}
                    <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Party Message Preview (मैसेज प्रारूप)</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">WhatsApp Standard Format</span>
                        </div>

                        {/* Exact Message Box */}
                        <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200 font-mono text-xs text-slate-900 whitespace-pre-wrap leading-relaxed shadow-inner">
                          {messageText}
                        </div>
                      </div>

                      {/* Copy & Send Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Copy Message Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyAndMarkSent(r)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-2xs ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-900 hover:bg-black text-white'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-200" />
                                <span>Copied &amp; Marked as Sent!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                <span>Copy Message &amp; Mark as Sent</span>
                              </>
                            )}
                          </button>

                          {/* WhatsApp Direct Button */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(r)}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-2xs"
                            title="Open direct WhatsApp chat with prefilled message"
                          >
                            <Send className="w-4 h-4" />
                            <span>Send on WhatsApp</span>
                            <ExternalLink className="w-3 h-3 text-emerald-200 ml-0.5" />
                          </button>
                        </div>

                        {/* Revert Sent Status */}
                        {r.messageSent && (
                          <button
                            type="button"
                            onClick={() => handleMarkUnsent(r)}
                            className="text-[11px] text-slate-400 hover:text-slate-700 underline font-medium"
                          >
                            Mark as Unsent
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
