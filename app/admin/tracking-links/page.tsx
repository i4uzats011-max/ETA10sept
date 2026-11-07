'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  RefreshCw,
  Copy,
  ExternalLink,
  Edit,
  Trash2,
  Calendar,
  Layers,
  Box,
  Weight,
  Truck,
  ArrowLeft,
  Search,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
  Tag,
  CheckSquare,
  Square
} from 'lucide-react';

interface IAdminReceipt {
  id: string;
  receiptNo: string;
  itemName?: string;
  cbm?: string;
  ctn?: string;
  weight?: string;
  containerNo?: string;
  actualContainerNo?: string;
  eta?: string;
  status?: string;
  adminNotes?: string;
  trackingToken: string;
  trackingName?: string;
  remainDays?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ITokenOption {
  token: string;
  name?: string;
  receipts: string[];
}

export default function AdminTrackingLinksPage() {
  const [receipts, setReceipts] = useState<IAdminReceipt[]>([]);
  const [tokens, setTokens] = useState<ITokenOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add Mode: 'marka' = batch add by Marka (just like Cargo Master Table), 'single' = single receipt
  const [addMode, setAddMode] = useState<'marka' | 'single'>('marka');

  // Marka Batch Selection States
  const [markaInput, setMarkaInput] = useState('');
  const [availableMarkas, setAvailableMarkas] = useState<string[]>([]);
  const [markaReceipts, setMarkaReceipts] = useState<any[]>([]);
  const [selectedMarkaReceiptNos, setSelectedMarkaReceiptNos] = useState<Set<string>>(new Set());
  const [loadingMarka, setLoadingMarka] = useState(false);

  // Single Add Form State
  const [formData, setFormData] = useState({
    receiptNo: '',
    itemName: '',
    cbm: '',
    ctn: '',
    weight: '',
    containerNo: '',
    actualContainerNo: '',
    eta: '',
    status: 'In Transit',
    adminNotes: '',
    trackingTokenOption: 'new',
    existingToken: '',
    trackingName: ''
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    id: '',
    receiptNo: '',
    itemName: '',
    cbm: '',
    ctn: '',
    weight: '',
    containerNo: '',
    actualContainerNo: '',
    eta: '',
    status: 'In Transit',
    trackingName: '',
    adminNotes: ''
  });

  const [lookingUp, setLookingUp] = useState(false);
  const [availableReceipts, setAvailableReceipts] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadAvailableReceipts = async () => {
    try {
      const res = await fetch('/api/admin/tracking-links/lookup?list=true');
      const data = await res.json();
      if (data.success && data.receipts) {
        setAvailableReceipts(data.receipts);
      }
    } catch {
      // ignore
    }
  };

  const loadAvailableMarkas = async () => {
    try {
      const res = await fetch('/api/admin/tracking-links/lookup?markas=true');
      const data = await res.json();
      if (data.success && data.markas) {
        setAvailableMarkas(data.markas);
      }
    } catch {
      // ignore
    }
  };

  const handleLookup = async (receiptOverride?: string) => {
    const targetReceipt = (receiptOverride || formData.receiptNo).trim();
    if (!targetReceipt) return;
    setLookingUp(true);
    try {
      const res = await fetch(`/api/admin/tracking-links/lookup?receipt=${encodeURIComponent(targetReceipt)}`);
      const result = await res.json();
      if (res.ok && result.success && result.data) {
        setFormData(prev => ({
          ...prev,
          receiptNo: result.data.receiptNo || targetReceipt,
          itemName: result.data.itemName || '',
          cbm: result.data.cbm || '',
          ctn: result.data.ctn || '',
          weight: result.data.weight || '',
          containerNo: result.data.containerNo || '',
          actualContainerNo: result.data.actualContainerNo || '',
          eta: result.data.eta || '',
          status: result.data.status || 'In Transit'
        }));
        showToast('All fields auto-filled from database!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSelectReceiptNo = (val: string) => {
    setFormData(prev => ({ ...prev, receiptNo: val }));
    if (val.trim()) {
      handleLookup(val.trim());
    }
  };

  const handleSelectMarka = async (marka: string) => {
    setMarkaInput(marka);
    const clean = marka.trim();
    if (!clean) {
      setMarkaReceipts([]);
      setSelectedMarkaReceiptNos(new Set());
      return;
    }

    setLoadingMarka(true);
    try {
      const res = await fetch(`/api/admin/tracking-links/lookup?marka=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (res.ok && data.success && data.receipts) {
        setMarkaReceipts(data.receipts);
        // By default select all receipts under this Marka
        setSelectedMarkaReceiptNos(new Set(data.receipts.map((r: any) => r.receiptNo)));
        // Auto-fill Allocated Link Name with this Marka
        setFormData(prev => ({
          ...prev,
          trackingName: prev.trackingName || clean
        }));
        showToast(`Loaded ${data.receipts.length} receipts for Marka "${clean}"!`);
      } else {
        setMarkaReceipts([]);
        setSelectedMarkaReceiptNos(new Set());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMarka(false);
    }
  };

  const toggleSelectMarkaReceipt = (rNo: string) => {
    const next = new Set(selectedMarkaReceiptNos);
    if (next.has(rNo)) next.delete(rNo);
    else next.add(rNo);
    setSelectedMarkaReceiptNos(next);
  };

  const toggleSelectAllMarkaReceipts = () => {
    if (selectedMarkaReceiptNos.size === markaReceipts.length) {
      setSelectedMarkaReceiptNos(new Set());
    } else {
      setSelectedMarkaReceiptNos(new Set(markaReceipts.map(r => r.receiptNo)));
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tracking-links');
      const data = await res.json();
      if (data.success) {
        setReceipts(data.receipts || []);
        setTokens(data.tokens || []);
      }
    } catch (err) {
      console.error('Failed to load tracking links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadAvailableReceipts();
    loadAvailableMarkas();
  }, []);

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/track/${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Tracking link copied to clipboard!');
      });
    } else {
      window.prompt('Copy tracking link:', url);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.trackingTokenOption === 'existing' && !formData.existingToken) {
      alert('Please select an existing tracking link to map this receipt.');
      return;
    }

    let payload: any = {};

    if (addMode === 'marka') {
      const itemsToSave = markaReceipts.filter(r => selectedMarkaReceiptNos.has(r.receiptNo));
      if (itemsToSave.length === 0) {
        alert('Please select at least one receipt from the table to generate link.');
        return;
      }
      payload = {
        trackingTokenOption: formData.trackingTokenOption,
        existingToken: formData.existingToken,
        trackingName: formData.trackingName.trim() || markaInput.trim() || 'Client Shipment',
        items: itemsToSave
      };
    } else {
      if (!formData.receiptNo.trim()) {
        alert('Receipt No. is required');
        return;
      }
      payload = {
        ...formData,
        trackingName: formData.trackingName.trim() || `Receipt #${formData.receiptNo.trim()}`
      };
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Tracking link saved successfully!');
        setIsAddOpen(false);
        setMarkaInput('');
        setMarkaReceipts([]);
        setSelectedMarkaReceiptNos(new Set());
        setFormData({
          receiptNo: '',
          itemName: '',
          cbm: '',
          ctn: '',
          weight: '',
          containerNo: '',
          actualContainerNo: '',
          eta: '',
          status: 'In Transit',
          adminNotes: '',
          trackingTokenOption: 'new',
          existingToken: '',
          trackingName: ''
        });
        loadData();
      } else {
        alert(data.message || 'Failed to save receipt.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tracking-links/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('ETA, Status and details updated!');
        setIsEditOpen(false);
        loadData();
      } else {
        alert(data.message || 'Failed to update receipt.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while updating.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, receiptNo: string) => {
    if (!confirm(`Are you sure you want to delete Receipt "${receiptNo}" from tracking?`)) return;

    try {
      const res = await fetch(`/api/admin/tracking-links/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Receipt ${receiptNo} deleted.`);
        loadData();
      } else {
        alert(data.message || 'Failed to delete.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting.');
    }
  };

  const openEdit = (r: IAdminReceipt) => {
    setEditFormData({
      id: r.id,
      receiptNo: r.receiptNo || '',
      itemName: r.itemName || '',
      cbm: r.cbm || '',
      ctn: r.ctn || '',
      weight: r.weight || '',
      containerNo: r.containerNo || '',
      actualContainerNo: r.actualContainerNo || '',
      eta: r.eta || '',
      status: r.status || 'In Transit',
      trackingName: r.trackingName || '',
      adminNotes: r.adminNotes || ''
    });
    setIsEditOpen(true);
  };

  const filteredReceipts = receipts.filter(r => {
    const q = searchQuery.toLowerCase();
    return (
      r.receiptNo?.toLowerCase().includes(q) ||
      r.itemName?.toLowerCase().includes(q) ||
      r.containerNo?.toLowerCase().includes(q) ||
      r.trackingToken?.toLowerCase().includes(q) ||
      r.trackingName?.toLowerCase().includes(q)
    );
  });

  const uniqueLinksCount = new Set(receipts.map(r => r.trackingToken)).size;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Navigation Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/view"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Cargo Master Table
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                <Truck className="w-6 h-6 text-blue-600" /> Public ETA Tracking Links Manager
              </h1>
              <p className="text-xs text-slate-500">
                Allocate named links to parties/markas & map new receipts to the same link anytime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAddMode('marka');
                setIsAddOpen(true);
              }}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add / Map Receipts by Marka
            </button>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl hover:bg-slate-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{receipts.length}</div>
              <div className="text-xs font-medium text-slate-500">Total Tracked Receipts</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl">
              <ExternalLink className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{uniqueLinksCount}</div>
              <div className="text-xs font-medium text-slate-500">Allocated Tracking Links</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">
                {receipts.filter(r => typeof r.remainDays === 'number' && r.remainDays >= 0 && r.remainDays <= 7).length}
              </div>
              <div className="text-xs font-medium text-slate-500">Arriving Within 7 Days</div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm mb-6 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            placeholder="Search by receipt no, marka, allocated link name, item, or container..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm bg-transparent border-none outline-none text-slate-800 placeholder-slate-400"
          />
        </div>

        {/* Table Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Receipt No.</th>
                  <th className="py-3 px-4">Allocated Link Name / Marka</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">CBM / CTN / Weight</th>
                  <th className="py-3 px-4">
                    Container No. <br />
                    <span className="text-[10px] text-slate-400 font-normal">(Public Display)</span>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">ETA & Remain Days</th>
                  <th className="py-3 px-4">Public Tracking Link</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      Loading tracking records...
                    </td>
                  </tr>
                )}

                {!loading && filteredReceipts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500">
                      No receipts found. Click <strong>&quot;Add / Map Receipts by Marka&quot;</strong> to generate a link!
                    </td>
                  </tr>
                )}

                {!loading && filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {r.receiptNo}
                    </td>
                    <td className="py-3.5 px-4">
                      {r.trackingName ? (
                        <span className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full text-[11px]">
                          <Tag className="w-3 h-3 text-blue-600" />
                          {r.trackingName}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Default Link</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {r.itemName || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {r.cbm ? `${r.cbm} m³` : '-'} / {r.ctn ? `${r.ctn} ctn` : '-'} / {r.weight || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {r.containerNo || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {r.status || 'In Transit'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{r.eta || '-'}</div>
                      <div className="text-[11px]">
                        {typeof r.remainDays === 'number' ? (
                          r.remainDays >= 0 ? (
                            <span className="text-blue-600 font-bold">⏳ {r.remainDays}d left</span>
                          ) : (
                            <span className="text-amber-600 font-semibold">Passed ({Math.abs(r.remainDays)}d)</span>
                          )
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                          {r.trackingToken}
                        </span>
                        <button
                          onClick={() => copyLink(r.trackingToken)}
                          title="Copy Public Link"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md transition cursor-pointer"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        <a
                          href={`/track/${r.trackingToken}`}
                          target="_blank"
                          rel="noreferrer"
                          title="View what public sees"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-md transition"
                        >
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(r)}
                          title="Update ETA, Status & Link Name"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                        >
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.receiptNo)}
                          title="Delete Receipt"
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal: Add / Map Receipts by Marka */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Add Receipts to Tracking Link
                </h3>
                <p className="text-xs text-slate-500">
                  Select receipts by Marka or enter single receipt with auto-fill.
                </p>
              </div>

              {/* Mode Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAddMode('marka')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    addMode === 'marka' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔖 By Marka (Cargo Master)
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('single')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    addMode === 'single' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📄 Single Receipt
                </button>
              </div>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">

              {/* ── MODE A: BATCH ADD BY MARKA ── */}
              {addMode === 'marka' && (
                <div className="space-y-4">
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2">
                    <label className="block font-bold text-blue-950">
                      Step 1: Select Marka / Party from Cargo Master Table:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        list="availableMarkasList"
                        placeholder="Type or choose Marka (e.g. VIP, SHANTI, etc.)..."
                        value={markaInput}
                        onChange={(e) => handleSelectMarka(e.target.value)}
                        className="w-full p-2.5 border border-blue-300 rounded-lg outline-none bg-white font-bold text-slate-900"
                      />
                      <datalist id="availableMarkasList">
                        {availableMarkas.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <p className="text-[11px] text-blue-700">
                      Selecting a Marka automatically loads all its receipts from the database with item names, CBM, weights, and ETA!
                    </p>
                  </div>

                  {loadingMarka && (
                    <div className="py-8 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Loading receipts for this Marka...
                    </div>
                  )}

                  {!loadingMarka && markaReceipts.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>
                          Step 2: Select one or more receipts to link ({selectedMarkaReceiptNos.size} of {markaReceipts.length} selected):
                        </span>
                        <button
                          type="button"
                          onClick={toggleSelectAllMarkaReceipts}
                          className="text-blue-600 hover:underline cursor-pointer"
                        >
                          {selectedMarkaReceiptNos.size === markaReceipts.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200 font-bold">
                            <tr>
                              <th className="p-2 w-8 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedMarkaReceiptNos.size === markaReceipts.length && markaReceipts.length > 0}
                                  onChange={toggleSelectAllMarkaReceipts}
                                  className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                                />
                              </th>
                              <th className="p-2">Receipt No.</th>
                              <th className="p-2">Item Name</th>
                              <th className="p-2">CBM / CTN / Wt</th>
                              <th className="p-2">Container</th>
                              <th className="p-2">ETA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {markaReceipts.map((r) => (
                              <tr
                                key={r.receiptNo}
                                onClick={() => toggleSelectMarkaReceipt(r.receiptNo)}
                                className={`cursor-pointer transition-colors ${
                                  selectedMarkaReceiptNos.has(r.receiptNo) ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedMarkaReceiptNos.has(r.receiptNo)}
                                    onChange={() => toggleSelectMarkaReceipt(r.receiptNo)}
                                    className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                                  />
                                </td>
                                <td className="p-2 font-bold font-mono text-slate-900">{r.receiptNo}</td>
                                <td className="p-2 text-slate-700 truncate max-w-[140px]" title={r.itemName}>
                                  {r.itemName || '-'}
                                </td>
                                <td className="p-2 text-slate-600">
                                  {r.cbm ? `${r.cbm}m³` : '-'} / {r.ctn ? `${r.ctn}ctn` : '-'}
                                </td>
                                <td className="p-2 font-mono text-blue-700">{r.containerNo || '-'}</td>
                                <td className="p-2 font-bold text-slate-800">{r.eta || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── MODE B: SINGLE RECEIPT AUTO-FILL ── */}
              {addMode === 'single' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700">Receipt No. *</label>
                        <span className="text-[10px] text-blue-600 font-bold">
                          {lookingUp ? 'Auto-filling...' : '✨ Auto-fill on select'}
                        </span>
                      </div>
                      <input
                        type="text"
                        list="dbReceiptsList"
                        required={addMode === 'single'}
                        placeholder="Type or select Receipt No..."
                        value={formData.receiptNo}
                        onChange={(e) => handleSelectReceiptNo(e.target.value)}
                        onBlur={() => {
                          if (formData.receiptNo.trim()) {
                            handleLookup(formData.receiptNo.trim());
                          }
                        }}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600 font-bold"
                      />
                      <datalist id="dbReceiptsList">
                        {availableReceipts.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Item Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Garments & Fabrics"
                        value={formData.itemName}
                        onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CBM (m³)</label>
                      <input
                        type="text"
                        placeholder="e.g. 2.45"
                        value={formData.cbm}
                        onChange={(e) => setFormData({ ...formData, cbm: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CTN (Cartons)</label>
                      <input
                        type="text"
                        placeholder="e.g. 18"
                        value={formData.ctn}
                        onChange={(e) => setFormData({ ...formData, ctn: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Weight</label>
                      <input
                        type="text"
                        placeholder="e.g. 350 kg"
                        value={formData.weight}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Container No. (not actual) *</label>
                      <input
                        type="text"
                        required={addMode === 'single'}
                        placeholder="e.g. CONT-****612"
                        value={formData.containerNo}
                        onChange={(e) => setFormData({ ...formData, containerNo: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                      <span className="text-[10px] text-slate-400">Public masked display name</span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Actual Container No. (Admin only)</label>
                      <input
                        type="text"
                        placeholder="e.g. MSCU-8849612"
                        value={formData.actualContainerNo}
                        onChange={(e) => setFormData({ ...formData, actualContainerNo: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                      <span className="text-[10px] text-emerald-600">🔒 Strictly hidden from public link</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ETA *</label>
                      <input
                        type="date"
                        required={addMode === 'single'}
                        value={formData.eta}
                        onChange={(e) => setFormData({ ...formData, eta: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg bg-white outline-none"
                      >
                        <option value="In Transit">In Transit</option>
                        <option value="Loaded">Loaded</option>
                        <option value="Customs Clearance">Customs Clearance</option>
                        <option value="Arrived at Port">Arrived at Port</option>
                        <option value="Out for Delivery">Out for Delivery</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TRACKING LINK ALLOCATION & MAPPING ── */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <label className="block font-bold text-slate-900">
                  Step 3: Tracking Link Allocation & Next-time Mapping
                </label>

                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="trackingTokenOption"
                      value="new"
                      checked={formData.trackingTokenOption === 'new'}
                      onChange={() => setFormData({ ...formData, trackingTokenOption: 'new' })}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-slate-800">Generate New Tracking Link</span>
                      <p className="text-[11px] text-slate-500">Allocates a new shareable link with a custom name for this customer.</p>
                    </div>
                  </label>

                  {formData.trackingTokenOption === 'new' && (
                    <div className="pl-6 pt-1">
                      <label className="block font-bold text-slate-700 mb-1">
                        Allocate Link Name / Marka (to map new receipts next time):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rahul Electronics / Marka SHANTI"
                        value={formData.trackingName}
                        onChange={(e) => setFormData({ ...formData, trackingName: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg outline-none bg-white font-semibold text-slate-900"
                      />
                      <span className="text-[10px] text-slate-500">
                        Give this link an allocated name so next time you can easily find and map new receipts to the same link.
                      </span>
                    </div>
                  )}

                  <label className="flex items-start gap-2 cursor-pointer pt-2">
                    <input
                      type="radio"
                      name="trackingTokenOption"
                      value="existing"
                      checked={formData.trackingTokenOption === 'existing'}
                      onChange={() => setFormData({ ...formData, trackingTokenOption: 'existing' })}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-slate-800">Map to Existing Link (Same Link Given to Customer)</span>
                      <p className="text-[11px] text-slate-500">Select previously allocated link name so customer sees new receipt under the SAME link!</p>
                    </div>
                  </label>

                  {formData.trackingTokenOption === 'existing' && (
                    <div className="pl-6 pt-1">
                      <label className="block font-bold text-slate-700 mb-1">
                        Select Existing Link by Allocated Name:
                      </label>
                      <select
                        value={formData.existingToken}
                        onChange={(e) => setFormData({ ...formData, existingToken: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white outline-none font-semibold text-slate-900"
                      >
                        <option value="">-- Choose previously allocated link --</option>
                        {tokens.map((t) => (
                          <option key={t.token} value={t.token}>
                            {t.name ? `🏷️ [${t.name}]` : 'Unnamed Link'} ({t.token}) — Receipts: {t.receipts.join(', ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Generating...'
                    : addMode === 'marka'
                    ? `Generate Link for (${selectedMarkaReceiptNos.size}) Selected Receipts`
                    : 'Save Receipt to Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Receipt & Update ETA / Status */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              Update Receipt Details, ETA & Status
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Allocated Link Name / Client</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Electronics"
                  value={editFormData.trackingName}
                  onChange={(e) => setEditFormData({ ...editFormData, trackingName: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-bold text-blue-900 bg-blue-50/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt No. *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.receiptNo}
                    onChange={(e) => setEditFormData({ ...editFormData, receiptNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={editFormData.itemName}
                    onChange={(e) => setEditFormData({ ...editFormData, itemName: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CBM</label>
                  <input
                    type="text"
                    value={editFormData.cbm}
                    onChange={(e) => setEditFormData({ ...editFormData, cbm: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CTN</label>
                  <input
                    type="text"
                    value={editFormData.ctn}
                    onChange={(e) => setEditFormData({ ...editFormData, ctn: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Weight</label>
                  <input
                    type="text"
                    value={editFormData.weight}
                    onChange={(e) => setEditFormData({ ...editFormData, weight: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Container No. (not actual) *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.containerNo}
                    onChange={(e) => setEditFormData({ ...editFormData, containerNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Actual Container No. (Admin)</label>
                  <input
                    type="text"
                    value={editFormData.actualContainerNo}
                    onChange={(e) => setEditFormData({ ...editFormData, actualContainerNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">⚡ Update ETA *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.eta}
                    onChange={(e) => setEditFormData({ ...editFormData, eta: e.target.value })}
                    className="w-full p-2.5 border border-emerald-300 bg-white rounded-lg outline-none font-bold text-emerald-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">⚡ Update Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full p-2.5 border border-emerald-300 bg-white rounded-lg outline-none font-bold text-emerald-900"
                  >
                    <option value="In Transit">In Transit</option>
                    <option value="Loaded">Loaded</option>
                    <option value="Customs Clearance">Customs Clearance</option>
                    <option value="Arrived at Port">Arrived at Port</option>
                    <option value="Out for Delivery">Out for Delivery</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Admin Notes (Hidden)</label>
                <textarea
                  rows={2}
                  value={editFormData.adminNotes}
                  onChange={(e) => setEditFormData({ ...editFormData, adminNotes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Update Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 z-50 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
