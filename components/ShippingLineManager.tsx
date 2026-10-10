'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Anchor,
  Plus,
  Search,
  RefreshCw,
  Edit,
  Trash2,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Building2,
  X,
  Save,
  Check,
} from 'lucide-react';

export interface ShippingLineItem {
  _id: string;
  name: string;
  displayName: string;
  prefix?: string;
  website?: string;
  notes?: string;
  active: boolean;
  containerCount: number;
  shipmentCount: number;
  isMapped: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  onLinesUpdated?: () => void;
}

export default function ShippingLineManager({ onLinesUpdated }: Props) {
  const [lines, setLines] = useState<ShippingLineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [bannerStatus, setBannerStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Add Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    displayName: '',
    prefix: '',
    website: '',
    notes: '',
  });
  const [isAdding, setIsAdding] = useState(false);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ShippingLineItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    displayName: '',
    prefix: '',
    website: '',
    notes: '',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Delete Confirmation Modal State
  const [lineToDelete, setLineToDelete] = useState<ShippingLineItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all shipping lines
  const fetchShippingLines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping-lines');
      const data = await res.json();
      if (res.ok && data.success) {
        setLines(data.shippingLines || []);
        if (onLinesUpdated) onLinesUpdated();
      } else {
        throw new Error(data.error || 'Failed to fetch shipping lines');
      }
    } catch (err: any) {
      setBannerStatus({ type: 'error', message: err.message || 'Error fetching shipping lines' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShippingLines();
  }, []);

  // Filtered lines
  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (filterType === 'mapped' && !line.isMapped) return false;
      if (filterType === 'unmapped' && line.isMapped) return false;

      if (!q) return true;
      const matchName = line.name.toLowerCase().includes(q);
      const matchDisplay = (line.displayName || '').toLowerCase().includes(q);
      const matchPrefix = (line.prefix || '').toLowerCase().includes(q);
      const matchNotes = (line.notes || '').toLowerCase().includes(q);
      return matchName || matchDisplay || matchPrefix || matchNotes;
    });
  }, [lines, search, filterType]);

  // Statistics
  const totalCount = lines.length;
  const mappedCount = lines.filter((l) => l.isMapped).length;
  const unmappedCount = lines.filter((l) => !l.isMapped).length;

  // Handle Add Form Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      alert('Please enter a Carrier Code / Identifier (e.g. WAN_HAI, COSCO)');
      return;
    }

    setIsAdding(true);
    setBannerStatus(null);
    try {
      const res = await fetch('/api/admin/shipping-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add shipping line company');
      }

      setBannerStatus({
        type: 'success',
        message: data.message || `Shipping Line "${addForm.name.trim().toUpperCase()}" created successfully!`,
      });
      setIsAddOpen(false);
      setAddForm({ name: '', displayName: '', prefix: '', website: '', notes: '' });
      fetchShippingLines();
    } catch (err: any) {
      alert(err.message || 'Failed to create shipping line');
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (line: ShippingLineItem) => {
    setEditingLine(line);
    setEditForm({
      name: line.name,
      displayName: line.displayName || line.name,
      prefix: line.prefix || '',
      website: line.website || '',
      notes: line.notes || '',
    });
    setIsEditOpen(true);
  };

  // Handle Edit Form Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLine) return;
    if (!editForm.name.trim()) {
      alert('Please enter a Carrier Code / Identifier');
      return;
    }

    setIsEditing(true);
    setBannerStatus(null);
    try {
      const res = await fetch('/api/admin/shipping-lines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingLine._id,
          ...editForm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update shipping line company');
      }

      setBannerStatus({
        type: 'success',
        message: data.message || `Shipping line "${editForm.name}" updated successfully!`,
      });
      setIsEditOpen(false);
      setEditingLine(null);
      fetchShippingLines();
    } catch (err: any) {
      alert(err.message || 'Failed to update shipping line');
    } finally {
      setIsEditing(false);
    }
  };

  // Trigger Delete
  const handleRequestDelete = (line: ShippingLineItem) => {
    if (line.isMapped) {
      alert(
        `⛔ CANNOT DELETE SHIPPING LINE "${line.name}":\n\n` +
          `This shipping line is currently mapped to ${line.containerCount} container(s) and ${line.shipmentCount} shipment(s).\n\n` +
          `Per referential integrity rules, you can only delete a shipping line if it has NOT been mapped in any container or company.`
      );
      return;
    }
    setLineToDelete(line);
  };

  // Execute Delete
  const handleConfirmDelete = async () => {
    if (!lineToDelete) return;

    setIsDeleting(true);
    setBannerStatus(null);
    try {
      const res = await fetch(`/api/admin/shipping-lines?id=${lineToDelete._id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete shipping line');
      }

      setBannerStatus({
        type: 'success',
        message: data.message || `Shipping Line "${lineToDelete.name}" deleted successfully!`,
      });
      setLineToDelete(null);
      fetchShippingLines();
    } catch (err: any) {
      alert(err.message || 'Failed to delete shipping line');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert Message */}
      {bannerStatus && (
        <div
          className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-between ${
            bannerStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : bannerStatus.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {bannerStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{bannerStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerStatus(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & Stats */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Shipping Line Companies (शिपिंग लाइन कंपनी प्रबंधन)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Carrier Directory
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Add new shipping lines, edit company information, and delete unused shipping lines.
                <strong> Referential Safety:</strong> A shipping line cannot be deleted if it is mapped to any container or shipment.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={fetchShippingLines}
              disabled={loading}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              title="Refresh list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Shipping Line</span>
            </button>
          </div>
        </div>

        {/* 3 Quick Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-6 pt-5 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Shipping Lines</span>
              <span className="text-xl font-black text-slate-900">{totalCount}</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <Anchor className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-700 uppercase block">Currently Mapped / In-Use</span>
              <span className="text-xl font-black text-amber-950">{mappedCount}</span>
              <span className="text-[10px] text-amber-600 font-semibold block">🔒 Protected from deletion</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
              <Lock className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">Unmapped / Deletable</span>
              <span className="text-xl font-black text-emerald-950">{unmappedCount}</span>
              <span className="text-[10px] text-emerald-600 font-semibold block">✓ Safe to edit or delete</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-200 text-emerald-900 flex items-center justify-center font-bold">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code (MSC, COSCO), company name, or container prefix..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterType === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('mapped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
              filterType === 'mapped'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Mapped ({mappedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('unmapped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
              filterType === 'unmapped'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Unmapped ({unmappedCount})</span>
          </button>
        </div>
      </div>

      {/* Shipping Lines Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-bold">Loading shipping line companies...</p>
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Anchor className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No Shipping Lines Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {search
                ? `No shipping lines matching "${search}". Try clearing search.`
                : 'Click "+ Add Shipping Line" to create your first carrier company.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3.5 px-4">Carrier Code / ID</th>
                  <th className="py-3.5 px-4">Company Name</th>
                  <th className="py-3.5 px-4">Container Prefix(es)</th>
                  <th className="py-3.5 px-4">Mapped Status</th>
                  <th className="py-3.5 px-4">Website</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {filteredLines.map((line) => {
                  return (
                    <tr key={line._id} className="hover:bg-slate-50/70 transition">
                      {/* Carrier Code */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-sm text-slate-900 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200">
                            {line.name}
                          </span>
                        </div>
                      </td>

                      {/* Company Name */}
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {line.displayName || line.name}
                        {line.notes && (
                          <span className="text-[10px] text-slate-400 block font-normal">{line.notes}</span>
                        )}
                      </td>

                      {/* Prefixes */}
                      <td className="py-3.5 px-4">
                        {line.prefix ? (
                          <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {line.prefix}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Mapped Status Badge */}
                      <td className="py-3.5 px-4">
                        {line.isMapped ? (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>
                              Mapped in {line.containerCount} Cont. &amp; {line.shipmentCount} Ship.
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Not Mapped (Deletable)</span>
                          </div>
                        )}
                      </td>

                      {/* Website */}
                      <td className="py-3.5 px-4">
                        {line.website ? (
                          <a
                            href={line.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 hover:underline text-xs"
                          >
                            <span className="truncate max-w-[140px]">{line.website.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(line)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                            title="Edit Shipping Line details"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleRequestDelete(line)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                              line.isMapped
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                            }`}
                            title={
                              line.isMapped
                                ? `Cannot delete: Mapped in ${line.containerCount} containers & ${line.shipmentCount} shipments`
                                : 'Delete this unmapped shipping line'
                            }
                          >
                            {line.isMapped ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Locked</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL 1: ADD NEW SHIPPING LINE COMPANY ── */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Anchor className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Add New Shipping Line Company</h3>
                  <p className="text-[11px] text-slate-500">Create a carrier company for fleet containers and shipments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Carrier Code / ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value.toUpperCase() })}
                  placeholder="e.g. WAN_HAI, KMTC, SITC, ZIM"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Short code used in dropdowns (e.g. MSC, MAERSK, WAN_HAI). Automatically converted to uppercase.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company / Commercial Name
                </label>
                <input
                  type="text"
                  value={addForm.displayName}
                  onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
                  placeholder="e.g. Wan Hai Lines Ltd, KMTC Line"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Common Container Prefix(es)
                </label>
                <input
                  type="text"
                  value={addForm.prefix}
                  onChange={(e) => setAddForm({ ...addForm, prefix: e.target.value.toUpperCase() })}
                  placeholder="e.g. WHLU, KMTU, SITU"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  4-letter ISO container prefixes separated by commas.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Official Website / Tracking URL
                </label>
                <input
                  type="url"
                  value={addForm.website}
                  onChange={(e) => setAddForm({ ...addForm, website: e.target.value })}
                  placeholder="https://www.wanhai.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes / Internal Instructions
                </label>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Optional internal remarks or carrier contact info..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isAdding ? <span>Creating...</span> : <span>Create Shipping Line</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: EDIT SHIPPING LINE COMPANY ── */}
      {isEditOpen && editingLine && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Edit Shipping Line: {editingLine.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">Update company profile, code, or tracking information</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingLine.isMapped && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start space-x-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Note:</strong> This carrier is currently mapped to <strong>{editingLine.containerCount} container(s)</strong> and <strong>{editingLine.shipmentCount} shipment(s)</strong>. If you rename the Carrier Code, the system will automatically cascade and update all linked records across the database.
                </span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Carrier Code / ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company / Commercial Name
                </label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Container Prefix(es)
                </label>
                <input
                  type="text"
                  value={editForm.prefix}
                  onChange={(e) => setEditForm({ ...editForm, prefix: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Official Website / Tracking URL
                </label>
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isEditing ? <span>Saving...</span> : <span>Save Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: DELETE CONFIRMATION MODAL ── */}
      {lineToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-fadeIn space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Shipping Line?</h3>
                <p className="text-xs text-slate-500 font-medium">This will permanently remove this carrier.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete shipping line{' '}
              <strong className="text-slate-900 font-mono px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                {lineToDelete.name}
              </strong>
              ? Since this shipping line is not mapped to any container or shipment, it can be safely removed.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLineToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-sm disabled:opacity-50 flex items-center space-x-1"
              >
                {isDeleting ? <span>Deleting...</span> : <span>Yes, Delete</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
