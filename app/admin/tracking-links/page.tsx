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
  Square,
  MessageSquare,
  Send,
  X,
  Filter,
  Warehouse,
  CheckCircle2,
  FolderX,
  Trash,
  Link2,
  Sparkles,
  Share2,
  Globe,
  Eye
} from 'lucide-react';

interface IAdminQuery {
  id: string;
  token: string;
  receiptNo: string;
  marka?: string;
  senderName?: string;
  senderPhone?: string;
  message: string;
  reply?: string;
  status: string;
  createdAt: string;
}

interface IAdminReceipt {
  id: string;
  receiptNo: string;
  marka?: string;
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

  // View Mode: 'links' (Allocated links table overview) vs 'receipts' (Detailed cargo receipts table)
  const [viewMode, setViewMode] = useState<'links' | 'receipts'>('links');

  // Generate Link Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [newLinkNameInput, setNewLinkNameInput] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  // Link Status Filter: 'all' | 'active' | 'inactive'
  const [linkStatusFilter, setLinkStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Marka Filter for Table
  const [selectedMarkaFilter, setSelectedMarkaFilter] = useState<string | null>(null);

  // Dedicated Receipt No. Filter
  const [receiptNoFilter, setReceiptNoFilter] = useState<string>('');

  // Nick Name / Allocated Link Focused Filter
  const [selectedNickName, setSelectedNickName] = useState<string | null>(null);

  // Multi-Select Receipts for Bulk Actions
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Allocated Links Management (Delete one or more links)
  const [isLinksManagerOpen, setIsLinksManagerOpen] = useState(false);
  const [selectedLinkTokens, setSelectedLinkTokens] = useState<Set<string>>(new Set());
  const [deletingLinks, setDeletingLinks] = useState(false);

  // Customer Queries State
  const [isQueriesModalOpen, setIsQueriesModalOpen] = useState(false);
  const [queriesList, setQueriesList] = useState<IAdminQuery[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);

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
    marka: '',
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
    marka: '',
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
          marka: result.data.marka || prev.marka || '',
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

  const loadQueries = async () => {
    setLoadingQueries(true);
    try {
      const res = await fetch('/api/admin/tracking-queries');
      const data = await res.json();
      if (data.success && Array.isArray(data.queries)) {
        setQueriesList(data.queries);
      }
    } catch (err) {
      console.error('Failed to load customer queries:', err);
    } finally {
      setLoadingQueries(false);
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
    loadQueries();
    loadAvailableReceipts();
    loadAvailableMarkas();
  }, []);

  // Multi-select Receipts Handlers
  const toggleSelectReceipt = (id: string) => {
    const next = new Set(selectedReceiptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedReceiptIds(next);
  };

  const toggleSelectAllReceipts = () => {
    if (selectedReceiptIds.size === filteredReceipts.length && filteredReceipts.length > 0) {
      setSelectedReceiptIds(new Set());
    } else {
      setSelectedReceiptIds(new Set(filteredReceipts.map(r => r.id)));
    }
  };

  const handleBulkDeleteReceipts = async () => {
    if (selectedReceiptIds.size === 0) return;
    const confirmMsg = `Are you sure you want to delete ${selectedReceiptIds.size} selected receipt(s)? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingBulk(true);
    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: Array.from(selectedReceiptIds) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🗑️ ${data.message || 'Deleted successfully'}`);
        setSelectedReceiptIds(new Set());
        loadData();
      } else {
        alert(data.message || 'Failed to delete selected receipts');
      }
    } catch (err) {
      alert('Network error while deleting selected receipts');
    } finally {
      setDeletingBulk(false);
    }
  };

  // Generate a brand new tracking link in advance
  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const linkName = newLinkNameInput.trim();
    if (!linkName) {
      alert('Please enter an Allocated Link Name or Marka');
      return;
    }
    setGeneratingLink(true);
    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_link',
          trackingName: linkName
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🔗 Tracking link "${linkName}" generated successfully!`);
        setIsGenerateModalOpen(false);
        setNewLinkNameInput('');
        loadData();
      } else {
        alert(data.message || 'Failed to generate link');
      }
    } catch (err) {
      alert('Network error while generating link');
    } finally {
      setGeneratingLink(false);
    }
  };

  // Allocated Link Management Handlers
  const handleDeleteLink = async (token: string, name?: string) => {
    const confirmMsg = `Are you sure you want to delete Allocated Link "${name || token}"? Associated receipts will be deleted.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🗑️ Allocated Link "${name || token}" deleted.`);
        if (selectedNickName === (name || token)) {
          setSelectedNickName(null);
        }
        loadData();
      } else {
        alert(data.message || 'Failed to delete link');
      }
    } catch (e) {
      alert('Network error while deleting link');
    }
  };

  const toggleSelectLinkToken = (token: string) => {
    const next = new Set(selectedLinkTokens);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    setSelectedLinkTokens(next);
  };

  const handleBulkDeleteLinks = async () => {
    if (selectedLinkTokens.size === 0) return;
    const confirmMsg = `Delete ${selectedLinkTokens.size} selected Allocated Tracking Link(s) and their receipts?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingLinks(true);
    try {
      const res = await fetch('/api/admin/tracking-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: Array.from(selectedLinkTokens) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🗑️ ${data.message || 'Links deleted successfully'}`);
        setSelectedLinkTokens(new Set());
        setSelectedNickName(null);
        loadData();
      } else {
        alert(data.message || 'Failed to delete selected links');
      }
    } catch (e) {
      alert('Network error while deleting links');
    } finally {
      setDeletingLinks(false);
    }
  };

  // Customer Query Handlers
  const handleSendReply = async (queryId: string) => {
    const replyText = replyTextMap[queryId];
    if (!replyText || !replyText.trim()) return;
    setSavingReplyId(queryId);
    try {
      const res = await fetch(`/api/admin/tracking-queries/${queryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim(), status: 'Answered' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('✓ Dispatch reply sent to customer!');
        loadQueries();
      } else {
        alert(data.message || 'Failed to send reply');
      }
    } catch (e) {
      alert('Network error while saving reply');
    } finally {
      setSavingReplyId(null);
    }
  };

  const handleDeleteQuery = async (queryId: string) => {
    if (!window.confirm('Delete this customer query?')) return;
    try {
      const res = await fetch(`/api/admin/tracking-queries/${queryId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Query deleted');
        loadQueries();
      }
    } catch (e) {
      console.error(e);
    }
  };

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

  const copyMessage = (r: IAdminReceipt) => {
    const url = `${window.location.origin}/track/${r.trackingToken}`;
    const msg = `US INTERNATIONAL LOGISTICS 📦\nShipment Tracking Update\nMarka: ${r.marka || r.trackingName || '-'}\nReceipt No.: ${r.receiptNo}\nItem: ${r.itemName || '-'}\nETA: ${r.eta || 'Pending'}\n\nTrack your shipment live here:\n${url}\n\nyou can track this via link 24 hrs`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(() => {
        showToast('📋 Message copied! "you can track this via link 24 hrs"');
      });
    } else {
      window.prompt('Copy tracking message:', msg);
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
          marka: '',
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
      marka: r.marka || '',
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

  // Unique Markas across all receipts
  const uniqueMarkas = Array.from(
    new Set(receipts.map(r => (r.marka || '').trim()).filter(Boolean))
  ).sort();

  // Active vs Inactive links calculation
  const activeLinks = tokens.filter(t => (t.receipts && t.receipts.length > 0) || receipts.some(r => r.trackingToken === t.token));
  const inactiveLinks = tokens.filter(t => (!t.receipts || t.receipts.length === 0) && !receipts.some(r => r.trackingToken === t.token));

  const pendingQueriesCount = queriesList.filter(q => q.status === 'Pending').length;

  // Nick Names / Allocated Link List for quick filter bar
  const nickNameOptions = Array.from(
    new Map(
      tokens.map(t => [t.token, { token: t.token, name: t.name || 'Default Link', count: (t.receipts || []).length }])
    ).values()
  );

  // Filtered Tokens (for the Allocated Links Table)
  const filteredTokens = tokens.filter(t => {
    const tokenReceipts = receipts.filter(r => r.trackingToken === t.token);
    const isActive = (t.receipts && t.receipts.length > 0) || tokenReceipts.length > 0;

    // Status Filter (All / Active / Inactive)
    if (linkStatusFilter === 'active' && !isActive) return false;
    if (linkStatusFilter === 'inactive' && isActive) return false;

    // Allocated Link Name Filter
    if (selectedNickName) {
      const matchToken = t.token === selectedNickName;
      const matchName = (t.name || '').trim().toLowerCase() === selectedNickName.trim().toLowerCase();
      if (!matchToken && !matchName) return false;
    }

    // Marka Filter
    if (selectedMarkaFilter) {
      const mFilter = selectedMarkaFilter.toLowerCase();
      const matchName = (t.name || '').toLowerCase().includes(mFilter);
      const matchReceiptMarka = tokenReceipts.some(r => (r.marka || '').toLowerCase() === mFilter);
      if (!matchName && !matchReceiptMarka) return false;
    }

    // Receipt No Filter
    if (receiptNoFilter.trim()) {
      const rFilter = receiptNoFilter.trim().toLowerCase();
      const hasReceipt = (t.receipts || []).some(rn => rn.toLowerCase().includes(rFilter)) ||
        tokenReceipts.some(r => r.receiptNo.toLowerCase().includes(rFilter));
      if (!hasReceipt) return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (t.name || '').toLowerCase().includes(q);
      const matchToken = t.token.toLowerCase().includes(q);
      const matchReceipts = (t.receipts || []).some(rn => rn.toLowerCase().includes(q)) ||
        tokenReceipts.some(r =>
          r.receiptNo.toLowerCase().includes(q) ||
          (r.marka || '').toLowerCase().includes(q) ||
          (r.itemName || '').toLowerCase().includes(q)
        );
      if (!matchName && !matchToken && !matchReceipts) return false;
    }

    return true;
  });

  // Filtered Receipts (for the Detailed Receipts Table)
  const filteredReceipts = receipts.filter(r => {
    // 1. Nick Name / Allocated Link Focused Filter
    if (selectedNickName) {
      const matchToken = r.trackingToken === selectedNickName;
      const matchName = (r.trackingName || '').trim().toLowerCase() === selectedNickName.trim().toLowerCase();
      if (!matchToken && !matchName) {
        return false;
      }
    }

    // 2. Marka Filter
    if (selectedMarkaFilter) {
      if ((r.marka || '').trim().toLowerCase() !== selectedMarkaFilter.trim().toLowerCase()) {
        return false;
      }
    }

    // 3. Receipt No Filter
    if (receiptNoFilter.trim()) {
      if (!r.receiptNo.toLowerCase().includes(receiptNoFilter.trim().toLowerCase())) {
        return false;
      }
    }

    // 4. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.receiptNo?.toLowerCase().includes(q) ||
        r.marka?.toLowerCase().includes(q) ||
        r.itemName?.toLowerCase().includes(q) ||
        r.containerNo?.toLowerCase().includes(q) ||
        r.trackingToken?.toLowerCase().includes(q) ||
        r.trackingName?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
      );
    }

    return true;
  });

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

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Generate New Link</span>
            </button>

            <button
              onClick={() => setIsQueriesModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Customer Queries</span>
              {pendingQueriesCount > 0 && (
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                  {pendingQueriesCount} new
                </span>
              )}
            </button>

            <button
              onClick={() => setIsLinksManagerOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              <Tag className="w-4 h-4 text-emerald-400" />
              <span>Manage Links ({tokens.length})</span>
            </button>

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
              onClick={() => {
                loadData();
                loadQueries();
              }}
              className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl hover:bg-slate-50 transition"
              title="Refresh tracking data and queries"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real-time Link Generation & Allocation Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          {/* 1. Total Generated Links */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Total Links Generated</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Link2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900">{tokens.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Total public ETA tracking links created</div>
          </div>

          {/* 2. Active Links */}
          <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-sm hover:shadow transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">Active Links</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-emerald-700">{activeLinks.length}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Tracking live shipments ({receipts.length} receipts)</span>
            </div>
          </div>

          {/* 3. Generated but Not Active ("how manny link not active but genratated") */}
          <div className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-sm hover:shadow transition">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">Not Active / Empty</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-amber-700">{inactiveLinks.length}</div>
            <div className="text-[11px] text-amber-600 font-semibold mt-1">
              <span>Generated links with 0 receipts assigned</span>
            </div>
          </div>

          {/* 4. How Links Are Generated & Action */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-200">How Links Are Generated</span>
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <p className="text-[11px] text-blue-100 leading-snug">
                1. Auto-generated when mapping receipts by Marka.<br />
                2. Or pre-generate a custom link in advance.
              </p>
            </div>
            <div className="mt-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition shadow cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>➕ Generate New Link</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter & View Mode Controls Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6 space-y-3.5">
          {/* Top Bar: View Mode Switcher & Status Filter Tabs */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-100">
            {/* View Mode Tabs (Allocated Links vs Detailed Cargo Table) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600 mr-1">
                Display View:
              </span>
              <button
                type="button"
                onClick={() => setViewMode('links')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  viewMode === 'links'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Allocated Links Overview ({filteredTokens.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('receipts')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  viewMode === 'receipts'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Detailed Receipts Table ({filteredReceipts.length})</span>
              </button>
            </div>

            {/* Link Status Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Status:
              </span>
              <button
                type="button"
                onClick={() => setLinkStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  linkStatusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Links ({tokens.length})
              </button>
              <button
                type="button"
                onClick={() => setLinkStatusFilter('active')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  linkStatusFilter === 'active'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Active ({activeLinks.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setLinkStatusFilter('inactive')}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  linkStatusFilter === 'inactive'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Not Active / Generated ({inactiveLinks.length})</span>
              </button>
            </div>
          </div>

          {/* Bottom Bar: Filters by Allocated Link Name, Marka, and Receipt No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-center">
            {/* 1. Filter by Allocated Link Name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Filter by Allocated Link Name:
              </label>
              <select
                value={selectedNickName || ''}
                onChange={(e) => setSelectedNickName(e.target.value || null)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
              >
                <option value="">All Allocated Link Names</option>
                {tokens.map((t) => (
                  <option key={t.token} value={t.name || t.token}>
                    {t.name || 'Default Link'} ({(t.receipts || []).length} receipts)
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Filter by Marka */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Filter by Marka:
              </label>
              <select
                value={selectedMarkaFilter || ''}
                onChange={(e) => setSelectedMarkaFilter(e.target.value || null)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
              >
                <option value="">All Markas</option>
                {uniqueMarkas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Filter by Receipt No */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Filter by Receipt No:
              </label>
              <div className="relative">
                <Package className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. 260927017..."
                  value={receiptNoFilter}
                  onChange={(e) => setReceiptNoFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-mono text-slate-800"
                />
              </div>
            </div>

            {/* 4. General Search & Clear Filters */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Keyword Search:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search all columns..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
                {(selectedNickName || selectedMarkaFilter || receiptNoFilter || searchQuery || linkStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNickName(null);
                      setSelectedMarkaFilter(null);
                      setReceiptNoFilter('');
                      setSearchQuery('');
                      setLinkStatusFilter('all');
                    }}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer shrink-0"
                    title="Clear All Filters"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active Filter Indicators */}
          {(selectedNickName || selectedMarkaFilter || receiptNoFilter.trim() || searchQuery.trim()) && (
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-extrabold text-blue-900">Active Filters:</span>
              {selectedNickName && (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-bold">
                  Link: {selectedNickName}
                  <button onClick={() => setSelectedNickName(null)} className="cursor-pointer ml-1 hover:text-blue-950">×</button>
                </span>
              )}
              {selectedMarkaFilter && (
                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-bold">
                  Marka: {selectedMarkaFilter}
                  <button onClick={() => setSelectedMarkaFilter(null)} className="cursor-pointer ml-1 hover:text-purple-950">×</button>
                </span>
              )}
              {receiptNoFilter.trim() && (
                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold font-mono">
                  Receipt: {receiptNoFilter}
                  <button onClick={() => setReceiptNoFilter('')} className="cursor-pointer ml-1 hover:text-amber-950">×</button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 px-2.5 py-0.5 rounded-full font-bold">
                  &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery('')} className="cursor-pointer ml-1 hover:text-slate-950">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── VIEW A: ALLOCATED LINKS OVERVIEW TABLE (Default View) ── */}
        {viewMode === 'links' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-600" /> Allocated Links Manager
                </h3>
                <p className="text-[11px] text-slate-500">
                  Click on any Allocated Link Name to drill down into its cargo table and manage receipts.
                </p>
              </div>
              <div className="text-xs font-bold text-slate-600">
                Showing {filteredTokens.length} of {tokens.length} Link(s)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <th className="py-3.5 px-4">Allocated Link Name</th>
                    <th className="py-3.5 px-4">Public Tracking Link</th>
                    <th className="py-3.5 px-4 text-center">Tracked Receipts</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-400">
                        Loading allocated links...
                      </td>
                    </tr>
                  )}

                  {!loading && filteredTokens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-500">
                        No tracking links found matching filters. Click <strong>&quot;Generate New Link&quot;</strong> to create one!
                      </td>
                    </tr>
                  )}

                  {!loading && filteredTokens.map((t) => {
                    const tokenReceipts = receipts.filter(r => r.trackingToken === t.token);
                    const count = (t.receipts && t.receipts.length > 0) ? t.receipts.length : tokenReceipts.length;
                    const isActive = count > 0;

                    return (
                      <tr key={t.token} className="hover:bg-blue-50/40 transition">
                        {/* 1. Allocated Link Name (Clickable link to drill down into its cargo table) */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNickName(t.name || t.token);
                              setViewMode('receipts');
                            }}
                            className="text-left font-black text-sm text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5 cursor-pointer group"
                            title="Click to view detailed cargo table & manage receipts for this link"
                          >
                            <Tag className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
                            <span>{t.name || 'Default Link'}</span>
                          </button>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                            Token: {t.token}
                          </div>
                        </td>

                        {/* 2. Public Tracking Link */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-slate-700 font-semibold">
                              /track/{t.token}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyLink(t.token)}
                              title="Copy link URL"
                              className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`/track/${t.token}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open public tracking table"
                              className="p-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 transition cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`US INTERNATIONAL LOGISTICS 📦\nShipment Tracking Update\nMarka / Name: ${t.name || '-'}\nTrack live 24/7:\n${typeof window !== 'undefined' ? window.location.origin : ''}/track/${t.token}\n\nyou can track this via link 24 hrs`)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Share on WhatsApp"
                              className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* 3. Tracked Receipts */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNickName(t.name || t.token);
                              setViewMode('receipts');
                            }}
                            className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full text-xs transition cursor-pointer ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                            title="Click to view receipts"
                          >
                            <Package className="w-3 h-3" />
                            <span>{count} receipt{count === 1 ? '' : 's'}</span>
                          </button>
                        </td>

                        {/* 4. Status */}
                        <td className="py-3.5 px-4 text-center">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active Tracking</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                              <span>Generated (Idle)</span>
                            </span>
                          )}
                        </td>

                        {/* 5. Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNickName(t.name || t.token);
                                setViewMode('receipts');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer"
                              title="Go to detailed Cargo Table for this link"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Cargo Table</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  trackingTokenOption: 'existing',
                                  existingToken: t.token,
                                  trackingName: t.name || ''
                                }));
                                setAddMode('marka');
                                setIsAddOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition cursor-pointer"
                              title="Add more receipts to this link"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteLink(t.token, t.name)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                              title="Delete Allocated Link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VIEW B: DETAILED RECEIPTS CARGO TABLE ── */}
        {viewMode === 'receipts' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
            {/* Header / Breadcrumb Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNickName(null);
                    setViewMode('links');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-white border border-blue-300 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Allocated Links Overview</span>
                </button>
                <div className="font-black text-slate-800 text-sm">
                  Cargo Table {selectedNickName ? `for: ${selectedNickName}` : '(All Tracked Receipts)'}
                </div>
                <span className="bg-blue-100 text-blue-900 font-bold px-2.5 py-0.5 rounded-full text-xs">
                  {filteredReceipts.length} Receipt{filteredReceipts.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Bulk Actions for Selected Receipts */}
              {selectedReceiptIds.size > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-extrabold text-amber-900">
                    ✓ {selectedReceiptIds.size} Selected
                  </span>
                  <button
                    onClick={handleBulkDeleteReceipts}
                    disabled={deletingBulk}
                    className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded-lg transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingBulk ? 'Deleting...' : `Delete Selected (${selectedReceiptIds.size})`}</span>
                  </button>
                  <button
                    onClick={() => setSelectedReceiptIds(new Set())}
                    className="text-slate-600 hover:text-slate-900 font-semibold text-[11px] underline cursor-pointer ml-1"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 text-center w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAllReceipts}
                        className="cursor-pointer text-slate-500 hover:text-blue-600 transition"
                        title="Select / Deselect All Visible Receipts"
                      >
                        {selectedReceiptIds.size > 0 && selectedReceiptIds.size === filteredReceipts.length ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Receipt No.</th>
                    <th className="py-3 px-4">Marka</th>
                    <th className="py-3 px-4">Allocated Link Name</th>
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
                      <td colSpan={11} className="text-center py-10 text-slate-400">
                        Loading tracking records...
                      </td>
                    </tr>
                  )}

                  {!loading && filteredReceipts.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-12 text-slate-500">
                        No receipts found. Click <strong>&quot;Add / Map Receipts by Marka&quot;</strong> to map receipts!
                      </td>
                    </tr>
                  )}

                  {!loading && filteredReceipts.map((r) => (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        selectedReceiptIds.has(r.id) ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectReceipt(r.id)}
                          className="cursor-pointer text-slate-500 hover:text-blue-600 transition"
                        >
                          {selectedReceiptIds.has(r.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {r.receiptNo}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {r.marka || '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        {r.trackingName ? (
                          <button
                            type="button"
                            onClick={() => setSelectedNickName(r.trackingName || null)}
                            title="Click to show only receipts for this Nick Name"
                            className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full text-[11px] cursor-pointer transition"
                          >
                            <Tag className="w-3 h-3 text-blue-600" />
                            <span>{r.trackingName}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedNickName(r.trackingToken)}
                            title="Click to show only receipts for this tracking link"
                            className="text-slate-400 italic hover:text-slate-600 text-[11px] cursor-pointer underline"
                          >
                            Default Link
                          </button>
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
                            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition cursor-pointer"
                          >
                            <Copy className="w-3 h-3" /> Link
                          </button>
                          <button
                            onClick={() => copyMessage(r)}
                            title="Copy Customer Message (ends with: you can track this via link 24 hrs)"
                            className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-md transition cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-emerald-600" /> Msg
                          </button>
                          <a
                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`US INTERNATIONAL LOGISTICS 📦\nShipment Tracking Update\nReceipt No.: ${r.receiptNo}\nMarka: ${r.marka || r.trackingName || '-'}\nTrack Link: ${typeof window !== 'undefined' ? window.location.origin : ''}/track/${r.trackingToken}\n\nyou can track this via link 24 hrs`)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Share directly via WhatsApp"
                            className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md transition"
                          >
                            WA
                          </a>
                          <a
                            href={`/track/${r.trackingToken}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open public table & download JPG"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-md transition"
                          >
                            <ExternalLink className="w-3 h-3" /> Table / JPG
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
        )}

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
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700">Receipt No. *</label>
                        <span className="text-[10px] text-blue-600 font-bold">
                          {lookingUp ? '...' : '✨ Auto'}
                        </span>
                      </div>
                      <input
                        type="text"
                        list="dbReceiptsList"
                        required={addMode === 'single'}
                        placeholder="Receipt No..."
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
                      <label className="block font-bold text-slate-700 mb-1">Marka</label>
                      <input
                        type="text"
                        placeholder="e.g. VIP / SHANTI"
                        value={formData.marka}
                        onChange={(e) => setFormData({ ...formData, marka: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-600 font-semibold"
                      />
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

              <div className="grid grid-cols-3 gap-3">
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
                  <label className="block font-bold text-slate-700 mb-1">Marka</label>
                  <input
                    type="text"
                    value={editFormData.marka}
                    onChange={(e) => setEditFormData({ ...editFormData, marka: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none font-semibold"
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

      {/* ── CUSTOMER QUERIES MODAL ── */}
      {isQueriesModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <MessageSquare className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Customer Tracking Queries</h3>
                  <p className="text-[11px] text-indigo-200">
                    Incoming messages & questions submitted from public tracking links
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQueriesModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">
                  Total Queries: {queriesList.length} ({pendingQueriesCount} Pending Reply)
                </span>
                <button
                  type="button"
                  onClick={loadQueries}
                  className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingQueries ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {loadingQueries && (
                <div className="text-center py-8 text-slate-400">Loading queries...</div>
              )}

              {!loadingQueries && queriesList.length === 0 && (
                <div className="text-center py-12 text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No customer queries received yet. When a public user sends a message, it will show up here.
                </div>
              )}

              <div className="space-y-4">
                {queriesList.map((q) => (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border transition ${
                      q.status === 'Pending'
                        ? 'bg-amber-50/60 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded text-[11px] font-mono">
                          Receipt: {q.receiptNo}
                        </span>
                        {q.senderName && (
                          <span className="font-bold text-slate-800 text-[11px]">
                            from: {q.senderName} {q.senderPhone ? `(${q.senderPhone})` : ''}
                          </span>
                        )}
                        {q.marka && (
                          <span className="text-[10px] text-slate-500 font-semibold">
                            [{q.marka}]
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.status === 'Answered'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          }`}
                        >
                          {q.status === 'Answered' ? '✓ Replied' : '● Needs Reply'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuery(q.id)}
                          className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                          title="Delete Query"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Customer Message */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 text-slate-900 font-medium mb-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                        Customer Message:
                      </span>
                      {q.message}
                    </div>

                    {/* Dispatch Reply Box */}
                    {q.reply ? (
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-emerald-950 mb-2">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">
                          ✓ Dispatch Reply Sent:
                        </span>
                        <p className="font-semibold">{q.reply}</p>
                      </div>
                    ) : null}

                    {/* Reply Input Form */}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder={q.reply ? 'Update reply...' : 'Type dispatch reply for customer...'}
                        value={replyTextMap[q.id] || ''}
                        onChange={(e) =>
                          setReplyTextMap({ ...replyTextMap, [q.id]: e.target.value })
                        }
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-600 text-xs font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendReply(q.id)}
                        disabled={savingReplyId === q.id || !replyTextMap[q.id]?.trim()}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50 whitespace-nowrap cursor-pointer flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>{savingReplyId === q.id ? 'Sending...' : 'Reply'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ALLOCATED LINKS MANAGER MODAL ── */}
      {isLinksManagerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-blue-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <Tag className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Allocated Links Manager</h3>
                  <p className="text-[11px] text-blue-200">
                    Manage, filter, or delete one or more Allocated Tracking Link Names
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLinksManagerOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-bold text-slate-700">
                  Total Allocated Links: {tokens.length}
                </div>

                {selectedLinkTokens.size > 0 && (
                  <button
                    onClick={handleBulkDeleteLinks}
                    disabled={deletingLinks}
                    className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingLinks ? 'Deleting...' : `Delete Selected Links (${selectedLinkTokens.size})`}</span>
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {tokens.map((t) => {
                  const matchingReceiptsCount = receipts.filter(r => r.trackingToken === t.token).length;
                  return (
                    <div
                      key={t.token}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectLinkToken(t.token)}
                          className="cursor-pointer text-slate-500 hover:text-blue-600 transition"
                        >
                          {selectedLinkTokens.has(t.token) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm">
                              {t.name || 'Default Link'}
                            </span>
                            <span className="bg-blue-50 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-full text-[10px]">
                              {matchingReceiptsCount} receipt{matchingReceiptsCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                            Token: {t.token}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedNickName(t.name || t.token);
                            setIsLinksManagerOpen(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition cursor-pointer"
                        >
                          Filter Table
                        </button>

                        <a
                          href={`/track/${t.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                          title="Open Public Tracking Page"
                        >
                          <ExternalLink className="w-4 h-4 text-blue-600" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDeleteLink(t.token, t.name)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                          title="Delete This Allocated Link"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATE NEW TRACKING LINK MODAL ── */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <Link2 className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Generate New Tracking Link</h3>
                  <p className="text-[11px] text-blue-200">Pre-generate a public tracking link for a client or party</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateLink} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">
                  Allocated Link Name / Marka / Party Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ECG, USSI, ABC TRADERS"
                  value={newLinkNameInput}
                  onChange={(e) => setNewLinkNameInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:border-blue-600 focus:bg-white text-xs font-semibold"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This generates a dedicated tracking URL token. You can share it immediately or map receipts to it later.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generatingLink || !newLinkNameInput.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{generatingLink ? 'Generating...' : 'Generate Link'}</span>
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
