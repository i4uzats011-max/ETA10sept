'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  Phone,
  Copy,
  Check,
  Filter,
  X,
  AlertCircle,
  HelpCircle,
  Boxes,
  Warehouse,
  Truck,
  Edit2,
  Calendar,
  Share2,
} from 'lucide-react';

export interface ICustomerQuery {
  id: string;
  token: string;
  receiptNo: string;
  marka?: string;
  senderName?: string;
  senderPhone?: string;
  message: string;
  reply?: string;
  replyAt?: string | null;
  repliedBy?: string;
  status: 'Pending' | 'Answered' | 'Closed' | string;
  createdAt: string;
  updatedAt: string;
  commodity?: string;
  warehouse?: string;
  container?: string;
  shipmentStatus?: string;
  eta?: string | null;
  party?: string;
  quantity?: number | null;
}

interface CustomerQueriesManagerProps {
  currentUser?: {
    role?: string;
    username?: string;
    name?: string;
  } | null;
  onClose?: () => void;
  standalone?: boolean;
}

export default function CustomerQueriesManager({
  currentUser,
  onClose,
  standalone = false,
}: CustomerQueriesManagerProps) {
  const [queries, setQueries] = useState<ICustomerQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'Answered' | 'Closed'>('ALL');
  const [replyInputMap, setReplyInputMap] = useState<Record<string, string>>({});
  const [activeReplyingId, setActiveReplyingId] = useState<string | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch queries from backend
  const fetchQueries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tracking-queries');
      const data = await res.json();
      if (data.success && Array.isArray(data.queries)) {
        setQueries(data.queries);
      } else {
        showToast(data.message || 'Failed to load queries', 'error');
      }
    } catch (err: any) {
      console.error('Error fetching customer queries:', err);
      showToast(err.message || 'Error loading queries', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueries();
  }, []);

  // Quick stats
  const stats = useMemo(() => {
    const total = queries.length;
    const pending = queries.filter((q) => q.status === 'Pending').length;
    const answered = queries.filter((q) => q.status === 'Answered').length;
    const closed = queries.filter((q) => q.status === 'Closed').length;
    return { total, pending, answered, closed };
  }, [queries]);

  // Filtered queries
  const filteredQueries = useMemo(() => {
    return queries.filter((q) => {
      // Status filter
      if (statusFilter !== 'ALL' && q.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const receiptMatch = (q.receiptNo || '').toLowerCase().includes(query);
        const nameMatch = (q.senderName || '').toLowerCase().includes(query);
        const phoneMatch = (q.senderPhone || '').toLowerCase().includes(query);
        const markaMatch = (q.marka || '').toLowerCase().includes(query);
        const commodityMatch = (q.commodity || '').toLowerCase().includes(query);
        const containerMatch = (q.container || '').toLowerCase().includes(query);
        const messageMatch = (q.message || '').toLowerCase().includes(query);
        const replyMatch = (q.reply || '').toLowerCase().includes(query);
        const partyMatch = (q.party || '').toLowerCase().includes(query);

        return (
          receiptMatch ||
          nameMatch ||
          phoneMatch ||
          markaMatch ||
          commodityMatch ||
          containerMatch ||
          messageMatch ||
          replyMatch ||
          partyMatch
        );
      }
      return true;
    });
  }, [queries, statusFilter, searchQuery]);

  // Handle Save Reply
  const handleSaveReply = async (queryId: string, replyText: string) => {
    if (!replyText.trim()) {
      showToast('Please type a reply message first.', 'error');
      return;
    }

    const responder = currentUser?.name || currentUser?.username || 'Staff';
    setIsSubmittingReply(true);
    try {
      const res = await fetch(`/api/admin/tracking-queries/${queryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reply: replyText.trim(),
          repliedBy: responder,
          status: 'Answered',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send reply');
      }

      const nowIso = new Date().toISOString();
      setQueries((prev) =>
        prev.map((q) =>
          q.id === queryId
            ? {
                ...q,
                reply: replyText.trim(),
                replyAt: nowIso,
                repliedBy: responder,
                status: 'Answered',
                updatedAt: nowIso,
              }
            : q
        )
      );
      setActiveReplyingId(null);
      showToast('✓ Reply successfully sent and published to customer tracking link!');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit reply', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Handle Status Update (e.g., Closed / Pending)
  const handleUpdateStatus = async (queryId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/tracking-queries/${queryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update status');

      setQueries((prev) =>
        prev.map((q) => (q.id === queryId ? { ...q, status: newStatus } : q))
      );
      showToast(`Status updated to ${newStatus}`);
    } catch (err: any) {
      showToast(err.message || 'Error updating status', 'error');
    }
  };

  // Handle Delete Query
  const handleDeleteQuery = async (queryId: string) => {
    if (!confirm('Are you sure you want to permanently delete this customer query?')) return;

    try {
      const res = await fetch(`/api/admin/tracking-queries/${queryId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete query');

      setQueries((prev) => prev.filter((q) => q.id !== queryId));
      showToast('✓ Query deleted successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete query', 'error');
    }
  };

  // Copy receipt number
  const handleCopyReceipt = (rc: string) => {
    navigator.clipboard.writeText(rc);
    setCopiedReceipt(rc);
    setTimeout(() => setCopiedReceipt(null), 2000);
  };

  // Generate WhatsApp message
  const getWhatsAppUrl = (q: ICustomerQuery) => {
    const cleanPhone = (q.senderPhone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return '#';
    const text =
      `Hello ${q.senderName || 'Customer'},\n` +
      `Regarding your inquiry on Receipt #${q.receiptNo}${q.container ? ` (Container: ${q.container})` : ''}:\n` +
      `${q.reply ? `Reply: ${q.reply}\n` : ''}` +
      `You can track live cargo status here: https://cargo-tracker-v2.vercel.app/track/${q.token}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className={`space-y-4 ${standalone ? 'p-4 max-w-7xl mx-auto' : ''}`}>
      {/* Toast notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center space-x-2 transition animate-bounce ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Stats Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Customer Tracking Queries</span>
                {stats.pending > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                    {stats.pending} Needs Reply
                  </span>
                )}
              </h2>
              <p className="text-xs text-indigo-200/80">
                Live customer questions submitted from public tracking links. Reply here to publish answers to customer links.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchQueries}
              disabled={loading}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-xl border transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-indigo-600/30 border-indigo-400/80 ring-2 ring-indigo-400/50'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-slate-300 block">Total Queries</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black font-mono text-white">{stats.total}</span>
              <span className="text-[10px] text-slate-400">All inquiries</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('Pending')}
            className={`p-3 rounded-xl border transition cursor-pointer ${
              statusFilter === 'Pending'
                ? 'bg-amber-500/30 border-amber-400 ring-2 ring-amber-400/50'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-amber-300 block">Pending Reply</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black font-mono text-amber-300">{stats.pending}</span>
              <span className="text-[10px] text-amber-200">Awaiting response</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('Answered')}
            className={`p-3 rounded-xl border transition cursor-pointer ${
              statusFilter === 'Answered'
                ? 'bg-emerald-500/30 border-emerald-400 ring-2 ring-emerald-400/50'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-emerald-300 block">Replied</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black font-mono text-emerald-300">{stats.answered}</span>
              <span className="text-[10px] text-emerald-200">Published answers</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('Closed')}
            className={`p-3 rounded-xl border transition cursor-pointer ${
              statusFilter === 'Closed'
                ? 'bg-slate-500/30 border-slate-400 ring-2 ring-slate-400/50'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-slate-300 block">Closed</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black font-mono text-slate-300">{stats.closed}</span>
              <span className="text-[10px] text-slate-400">Resolved queries</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Receipt #, Customer, Phone, Marka, Container..."
            className="w-full pl-9 pr-8 py-2 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {(['ALL', 'Pending', 'Answered', 'Closed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center space-x-1 cursor-pointer shrink-0 ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>{st === 'ALL' ? 'All Queries' : st === 'Pending' ? 'Needs Reply' : st}</span>
              {st === 'Pending' && stats.pending > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">
                  {stats.pending}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Queries Table Card */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-600">Loading customer queries from database...</p>
          </div>
        ) : filteredQueries.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto text-indigo-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Customer Queries Found</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'ALL'
                ? `No queries matched your search filter "${searchQuery || statusFilter}". Try resetting your filter.`
                : 'When customers submit a question from their public tracking link, their inquiries will appear here in real time.'}
            </p>
            {(searchQuery || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="mt-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100"
              >
                Clear Search &amp; Filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredQueries.map((q) => {
              const isReplying = activeReplyingId === q.id;
              const cleanPhone = (q.senderPhone || '').replace(/[^0-9]/g, '');
              const draftReply =
                replyInputMap[q.id] !== undefined ? replyInputMap[q.id] : q.reply || '';

              return (
                <div
                  key={q.id}
                  className={`p-4 sm:p-5 transition ${
                    q.status === 'Pending' ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Top Bar: Receipt, Customer, Status, Actions */}
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Receipt No Badge */}
                      <div className="flex items-center space-x-1 bg-slate-900 text-white px-2.5 py-1 rounded-lg text-xs font-mono font-black shadow-xs">
                        <span>#{q.receiptNo}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyReceipt(q.receiptNo)}
                          title="Copy Receipt #"
                          className="text-slate-400 hover:text-white p-0.5 transition"
                        >
                          {copiedReceipt === q.receiptNo ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {/* Customer / Sender info */}
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className="font-bold text-slate-900">
                          {q.senderName || 'Anonymous Customer'}
                        </span>
                        {q.senderPhone && (
                          <div className="flex items-center space-x-1 text-slate-500 font-mono text-[11px]">
                            <span>({q.senderPhone})</span>
                            <a
                              href={`tel:${q.senderPhone}`}
                              className="text-slate-400 hover:text-indigo-600 p-0.5"
                              title="Call Customer"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                            {cleanPhone && (
                              <a
                                href={getWhatsAppUrl(q)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 font-bold px-1.5 py-0.2 bg-emerald-50 border border-emerald-200 rounded text-[10px] flex items-center space-x-0.5"
                                title="Chat on WhatsApp"
                              >
                                <span>WA</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Marka Tag */}
                      {q.marka && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Marka: {q.marka}
                        </span>
                      )}

                      {/* Origin Warehouse */}
                      {q.warehouse && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 flex items-center space-x-1">
                          <Warehouse className="w-3 h-3 text-slate-500" />
                          <span>{q.warehouse}</span>
                        </span>
                      )}

                      {/* Container Badge */}
                      {q.container && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200 flex items-center space-x-1 font-mono">
                          <Boxes className="w-3 h-3 text-blue-600" />
                          <span>Container: {q.container}</span>
                        </span>
                      )}

                      {/* ETA if available */}
                      {q.eta && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span>ETA: {q.eta}</span>
                        </span>
                      )}
                    </div>

                    {/* Status Pill & Action Buttons */}
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center space-x-1 ${
                          q.status === 'Answered'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : q.status === 'Closed'
                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                        }`}
                      >
                        {q.status === 'Answered' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Replied</span>
                          </>
                        ) : q.status === 'Closed' ? (
                          <span>Closed</span>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>Needs Reply</span>
                          </>
                        )}
                      </span>

                      {/* View Tracking Link */}
                      <Link
                        href={`/track/${q.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 transition"
                        title="Open Customer Live Tracking Link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      {/* Status toggle dropdown */}
                      <select
                        value={q.status}
                        onChange={(e) => handleUpdateStatus(q.id, e.target.value)}
                        className="py-1 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="Pending">Mark Pending</option>
                        <option value="Answered">Mark Answered</option>
                        <option value="Closed">Mark Closed</option>
                      </select>

                      {/* Delete Query Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteQuery(q.id)}
                        className="p-1.5 text-slate-300 hover:text-red-600 transition cursor-pointer"
                        title="Delete Query"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Customer Question Bubble */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold mb-2 pb-1.5 border-b border-slate-200">
                      <span className="uppercase tracking-wider flex items-center space-x-1.5 text-indigo-700">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Customer Question</span>
                      </span>
                      <span className="flex items-center space-x-1.5 text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-200 font-mono text-[11px] shadow-2xs">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-slate-400 font-sans font-medium">Date &amp; Time:</span>
                        <strong>
                          {new Date(q.createdAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </strong>
                        <span className="text-slate-300">•</span>
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <strong>
                          {new Date(q.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </strong>
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">
                      &ldquo;{q.message}&rdquo;
                    </p>
                  </div>

                  {/* Existing Reply Display */}
                  {q.reply && !isReplying && (
                    <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3.5 mb-2.5 space-y-2 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold pb-1.5 border-b border-emerald-200">
                        <span className="uppercase tracking-wider flex items-center space-x-1.5 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Staff Response Published</span>
                          {q.repliedBy && (
                            <span className="text-emerald-700 font-medium font-sans">
                              (by {q.repliedBy})
                            </span>
                          )}
                        </span>
                        <span className="flex items-center space-x-1.5 text-emerald-950 bg-white px-2.5 py-1 rounded-md border border-emerald-300 font-mono text-[11px] shadow-2xs">
                          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-sans font-medium">Reply Date &amp; Time:</span>
                          <strong>
                            {new Date(q.replyAt || q.updatedAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </strong>
                          <span className="text-emerald-300">•</span>
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <strong>
                            {new Date(q.replyAt || q.updatedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3 pt-0.5">
                        <p className="text-xs font-semibold text-emerald-950 whitespace-pre-wrap leading-relaxed">
                          {q.reply}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReplyingId(q.id);
                            setReplyInputMap((prev) => ({ ...prev, [q.id]: q.reply || '' }));
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold border border-emerald-300 flex items-center space-x-1 shrink-0 cursor-pointer shadow-2xs"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Reply</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reply Input Form (When replying or editing) */}
                  {(isReplying || (!q.reply && q.status === 'Pending')) && (
                    <div className="pt-1.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Type Reply for Customer Tracking Link:
                        </span>
                        {/* Quick Auto-Template Pills */}
                        <div className="flex items-center space-x-1.5 text-[10px]">
                          <span className="text-slate-400 font-semibold">Quick template:</span>
                          {q.container && (
                            <button
                              type="button"
                              onClick={() => {
                                const template = `Your cargo is loaded in Container ${q.container}${q.eta ? `, expected arrival is ${q.eta}` : ''}.`;
                                setReplyInputMap((prev) => ({ ...prev, [q.id]: template }));
                              }}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                            >
                              + Container Info
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const template = `Goods received at ${q.warehouse || 'China'} warehouse. We are currently planning container loading.`;
                              setReplyInputMap((prev) => ({ ...prev, [q.id]: template }));
                            }}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                          >
                            + In China Warehouse
                          </button>
                        </div>
                      </div>

                      <div className="flex items-end gap-2">
                        <textarea
                          rows={2}
                          value={draftReply}
                          onChange={(e) =>
                            setReplyInputMap((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Type answer here... Customer will see this on their tracking page."
                          className="flex-1 p-2.5 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 bg-white"
                        />
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSaveReply(q.id, draftReply)}
                            disabled={isSubmittingReply || !draftReply.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{q.reply ? 'Update Reply' : 'Send Reply'}</span>
                          </button>
                          {isReplying && (
                            <button
                              type="button"
                              onClick={() => setActiveReplyingId(null)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
