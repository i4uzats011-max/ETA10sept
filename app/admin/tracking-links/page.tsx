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
  AlertCircle
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

  // Add Form State
  const [formData, setFormData] = useState({
    receiptNo: '',
    itemName: '',
    cbm: '',
    ctn: '',
    weight: '',
    containerNo: '',
    actualContainerNo: '',
    eta: '',
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
    adminNotes: ''
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const [lookingUp, setLookingUp] = useState(false);
  const [availableReceipts, setAvailableReceipts] = useState<string[]>([]);

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

  const handleLookup = async (receiptOverride?: string) => {
    const targetReceipt = (receiptOverride || formData.receiptNo).trim();
    if (!targetReceipt) {
      return;
    }
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
          eta: result.data.eta || ''
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
    if (!formData.receiptNo.trim()) {
      alert('Receipt No. is required');
      return;
    }
    if (formData.trackingTokenOption === 'existing' && !formData.existingToken) {
      alert('Please select an existing tracking link');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Receipt ${data.receipt.receiptNo} created!`);
        setIsAddOpen(false);
        setFormData({
          receiptNo: '',
          itemName: '',
          cbm: '',
          ctn: '',
          weight: '',
          containerNo: '',
          actualContainerNo: '',
          eta: '',
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
        showToast('ETA and receipt details updated!');
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
    if (!confirm(`Are you sure you want to delete Receipt "${receiptNo}"?`)) return;

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
      r.trackingToken?.toLowerCase().includes(q)
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
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Main Admin
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                <Truck className="w-6 h-6 text-blue-600" /> Public ETA Tracking Links Manager
              </h1>
              <p className="text-xs text-slate-500">
                Generate restricted tracking links for receipts & update ETA in real time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" /> Add New Receipt
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
              <div className="text-xs font-medium text-slate-500">Active Shareable Links</div>
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
            placeholder="Search by receipt no, item name, container, or link token..."
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
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">CBM / CTN / Weight</th>
                  <th className="py-3 px-4">
                    Container No. <br />
                    <span className="text-[10px] text-slate-400 font-normal">(Public Display)</span>
                  </th>
                  <th className="py-3 px-4">
                    Actual Container <br />
                    <span className="text-[10px] text-slate-400 font-normal">(Admin Only)</span>
                  </th>
                  <th className="py-3 px-4">ETA</th>
                  <th className="py-3 px-4">Remain Days</th>
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
                      No receipts found. Click <strong>&quot;Add New Receipt&quot;</strong> to generate a link!
                    </td>
                  </tr>
                )}

                {!loading && filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {r.receiptNo}
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
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {r.actualContainerNo || '(none)'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {r.eta || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      {r.remainDays !== null && r.remainDays !== undefined ? (
                        r.remainDays >= 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">
                            ⏳ {r.remainDays}d left
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                            Passed ({Math.abs(r.remainDays)}d)
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                          {r.trackingToken}
                        </span>
                        <button
                          onClick={() => copyLink(r.trackingToken)}
                          title="Copy Public Link"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md transition"
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
                          title="Update ETA & Details"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition"
                        >
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.receiptNo)}
                          title="Delete Receipt"
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
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

      {/* Modal: Add New Receipt */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              Add New Receipt to Public Tracking
            </h3>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Receipt No. *</label>
                    <span className="text-[10px] text-blue-600 font-bold">
                      {lookingUp ? 'Auto-filling...' : '✨ Select receipt to auto-fill'}
                    </span>
                  </div>
                  <input
                    type="text"
                    list="dbReceiptsList"
                    required
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
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CTN (Cartons)</label>
                  <input
                    type="text"
                    placeholder="e.g. 18"
                    value={formData.ctn}
                    onChange={(e) => setFormData({ ...formData, ctn: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Weight</label>
                  <input
                    type="text"
                    placeholder="e.g. 350 kg"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Container No. (not actual) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CONT-****612"
                    value={formData.containerNo}
                    onChange={(e) => setFormData({ ...formData, containerNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
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
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                  />
                  <span className="text-[10px] text-emerald-600">🔒 Strictly hidden from public link</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ETA (Estimated Time of Arrival) *</label>
                <input
                  type="date"
                  required
                  value={formData.eta}
                  onChange={(e) => setFormData({ ...formData, eta: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
              </div>

              {/* Tracking Link Options: New vs Existing */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                <label className="block font-bold text-slate-900 mb-1">Tracking Link Assignment</label>
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
                    <p className="text-[11px] text-slate-500">Creates a brand-new unique link for this receipt.</p>
                  </div>
                </label>

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
                    <span className="font-bold text-slate-800">Add to Existing Tracking Link (Same Link Given)</span>
                    <p className="text-[11px] text-slate-500">Customer sees this new receipt under the exact same link already provided!</p>
                  </div>
                </label>

                {formData.trackingTokenOption === 'existing' && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">Select Existing Tracking Link:</label>
                    <select
                      value={formData.existingToken}
                      onChange={(e) => setFormData({ ...formData, existingToken: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white outline-none"
                    >
                      <option value="">-- Choose existing tracking link --</option>
                      {tokens.map((t) => (
                        <option key={t.token} value={t.token}>
                          {t.token} (Receipts: {t.receipts.join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Admin Internal Notes (Hidden from public)</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes for admin only"
                  value={formData.adminNotes}
                  onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Receipt & Update ETA */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
              Update Receipt Details & ETA
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt No. *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.receiptNo}
                    onChange={(e) => setEditFormData({ ...editFormData, receiptNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
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
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Actual Container No. (Admin)</label>
                  <input
                    type="text"
                    value={editFormData.actualContainerNo}
                    onChange={(e) => setEditFormData({ ...editFormData, actualContainerNo: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <label className="block font-bold text-emerald-900 mb-1">⚡ Update ETA (Estimated Time of Arrival) *</label>
                <input
                  type="date"
                  required
                  value={editFormData.eta}
                  onChange={(e) => setEditFormData({ ...editFormData, eta: e.target.value })}
                  className="w-full p-2.5 border border-emerald-300 bg-white rounded-lg outline-none font-bold text-emerald-900"
                />
                <p className="text-[11px] text-emerald-700 mt-1">
                  Updating this date immediately updates the public tracking link.
                </p>
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
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50"
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
