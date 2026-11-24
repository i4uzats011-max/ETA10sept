'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Boxes,
  Maximize2,
  Scale,
  Layers,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Warehouse,
  Ship,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface SalesExceptionReportProps {
  currentUser?: {
    username: string;
    role: string;
    name?: string;
  } | null;
}

export default function SalesExceptionReport({ currentUser }: SalesExceptionReportProps) {
  // Filters & State
  const [selectedContainer, setSelectedContainer] = useState('ALL');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Data State
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<{
    summary: any;
    containerSummaries: any[];
    items: any[];
    availableContainers: any[];
    availableWarehouses: string[];
  }>({
    summary: {
      totalContainers: 0,
      containersWithMismatches: 0,
      totalMismatches: 0,
      filteredMismatches: 0,
      totalMatched: 0,
      overallLoadedCartons: 0,
      overallReceivedCartons: 0,
      netCartonDiff: 0,
      overallLoadedCbm: 0,
      overallReceivedCbm: 0,
      netCbmDiff: 0,
      overallLoadedWeight: 0,
      overallReceivedWeight: 0,
      netWeightDiff: 0,
      excessCartons: 0,
      shortageCartons: 0,
      excessCbm: 0,
      shortageCbm: 0,
      excessWeight: 0,
      shortageWeight: 0,
      categoryCounts: {},
    },
    containerSummaries: [],
    items: [],
    availableContainers: [],
    availableWarehouses: [],
  });

  const [expandedContainerSummary, setExpandedContainerSummary] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Fetch Report Data from API
  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedContainer !== 'ALL') params.set('container', selectedContainer);
      if (selectedWarehouse !== 'ALL') params.set('warehouse', selectedWarehouse);
      if (selectedCategory !== 'ALL') params.set('category', selectedCategory);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/sales/exception-report?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch exception report');
      const data = await res.json();
      if (data.success) {
        setReportData(data);
      }
    } catch (err) {
      console.error('Error fetching exception report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedContainer, selectedWarehouse, selectedCategory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReport();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter items in memory if needed
  const displayItems = reportData.items || [];
  const summary = reportData.summary || {};

  // Export to Excel Handler
  const handleExportExcel = () => {
    if (displayItems.length === 0) {
      alert('No mismatch data available to export.');
      return;
    }

    setExportingExcel(true);
    try {
      const exportRows = displayItems.map((item, idx) => ({
        'S.No': idx + 1,
        'Container Alias': item.container,
        'Actual Container No': item.containerNumber || '—',
        'Carrier / Shipping Line': item.shippingLine,
        'Loading Date': item.loadingDate || '—',
        'Receipt No': item.receipt,
        'Party Name': item.party || '—',
        'Main Marka': item.mainMarka || '—',
        'Sub Marka': item.subMarka || '—',
        'Warehouse': item.warehouse,
        'Commodity': item.commodity,
        // Cartons
        'Received Cartons (CTN)': item.receivedCartons,
        'Loaded Cartons (CTN)': item.loadedCartons,
        'Carton Diff (Loaded - Received)': item.cartonDiff,
        'Carton Status': item.cartonStatus,
        // CBM
        'Received CBM (m³)': item.receivedCbm,
        'Loaded CBM (m³)': item.loadedCbm,
        'CBM Diff (Loaded - Received)': item.cbmDiff,
        'CBM Status': item.cbmStatus,
        // Weight
        'Received Weight (KG)': item.receivedWeight,
        'Loaded Weight (KG)': item.loadedWeight,
        'Weight Diff (Loaded - Received)': item.weightDiff,
        'Weight Status': item.weightStatus,
        // Category
        'Exception Category Group': item.categoryGroup,
        'Detailed Category Label': item.categoryLabel,
        'Summary': item.summary,
        'Sales Rate': item.salesRate || '—',
        'Sales Remarks': item.salesRemarks || '—',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);

      // Auto width calculation
      const colWidths = [
        { wch: 6 },  // S.No
        { wch: 16 }, // Container Alias
        { wch: 18 }, // Actual Container No
        { wch: 12 }, // Shipping Line
        { wch: 14 }, // Loading Date
        { wch: 15 }, // Receipt No
        { wch: 20 }, // Party Name
        { wch: 14 }, // Main Marka
        { wch: 12 }, // Sub Marka
        { wch: 15 }, // Warehouse
        { wch: 22 }, // Commodity
        { wch: 16 }, // Received CTN
        { wch: 16 }, // Loaded CTN
        { wch: 18 }, // Carton Diff
        { wch: 14 }, // Carton Status
        { wch: 16 }, // Received CBM
        { wch: 16 }, // Loaded CBM
        { wch: 18 }, // CBM Diff
        { wch: 14 }, // CBM Status
        { wch: 18 }, // Received Weight
        { wch: 18 }, // Loaded Weight
        { wch: 20 }, // Weight Diff
        { wch: 14 }, // Weight Status
        { wch: 32 }, // Exception Category Group
        { wch: 40 }, // Detailed Category Label
        { wch: 45 }, // Summary
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Exception Report');
      const filename = `SalesHead_Exception_Report_${selectedContainer}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Error exporting excel:', err);
      alert('Error downloading Excel file.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Helper for metric difference badge
  const renderDiffBadge = (diff: number, unit: string, decimals: number = 0) => {
    if (diff === 0) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          Match (0)
        </span>
      );
    }
    const formatted = decimals > 0 ? (diff > 0 ? `+${diff.toFixed(decimals)}` : diff.toFixed(decimals)) : (diff > 0 ? `+${diff}` : `${diff}`);
    if (diff > 0) {
      return (
        <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <TrendingUp className="w-3 h-3 text-amber-600 inline mr-0.5" />
          <span>{formatted} {unit} (Over)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
        <TrendingDown className="w-3 h-3 text-rose-600 inline mr-0.5" />
        <span>{formatted} {unit} (Short)</span>
      </span>
    );
  };

  // Category Color Badge Helper
  const renderCategoryBadge = (group: string, label: string) => {
    let colorClasses = 'bg-slate-100 text-slate-800 border-slate-300';
    if (group.includes('Carton Matched') || group.includes('Carton & Weight Matched') || group.includes('Carton & CBM Matched')) {
      colorClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    } else if (group.includes('CBM Matched') || group.includes('CBM & Weight Matched')) {
      colorClasses = 'bg-purple-50 text-purple-800 border-purple-200';
    } else if (group.includes('Weight Matched')) {
      colorClasses = 'bg-teal-50 text-teal-800 border-teal-200';
    } else if (group.includes('Multi-Metric')) {
      colorClasses = 'bg-rose-50 text-rose-800 border-rose-200';
    } else if (group.includes('Excess')) {
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (group.includes('Shortage')) {
      colorClasses = 'bg-red-50 text-red-800 border-red-200';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colorClasses}`}>
        <AlertTriangle className="w-3 h-3 mr-1 shrink-0 opacity-80" />
        <span className="truncate max-w-[280px]" title={label}>{label}</span>
      </span>
    );
  };

  // Categories count map from summary
  const categoryCounts = summary.categoryCounts || {};

  return (
    <div className="space-y-4 text-slate-800">
      {/* ─── 1. TOP HEADER BANNER ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-black tracking-tight text-white flex items-center space-x-2">
                  <span>Sales Head Exception Report</span>
                  <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-full font-mono font-normal">
                    Mismatch Tab
                  </span>
                </h1>
                <p className="text-xs text-slate-300">
                  Container Load Mismatches: <strong className="text-white">Total Loaded minus Total Received in Warehouse</strong> (Cartons, CBM & Weight).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-semibold text-white transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel || displayItems.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingExcel ? 'Exporting...' : 'Download Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* ─── 2. KPI METRIC SUMMARY CARDS ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-700/80">
          {/* Card 1: Total Mismatches */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Mismatched Receipts</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400">
              {summary.totalMismatches || 0}
              <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                ({summary.totalMatched || 0} matched excluded)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
              <span className="text-amber-300">Containers: {summary.containersWithMismatches || 0}</span>
              <span>/ Total: {summary.totalContainers || 0}</span>
            </div>
          </div>

          {/* Card 2: Cartons Mismatch */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Cartons Mismatch (CTN)</span>
              <Boxes className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-black">
              {summary.netCartonDiff > 0 ? (
                <span className="text-amber-400">+{summary.netCartonDiff} CTN</span>
              ) : summary.netCartonDiff < 0 ? (
                <span className="text-rose-400">{summary.netCartonDiff} CTN</span>
              ) : (
                <span className="text-emerald-400">0 Match</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
              <span className="text-emerald-300 font-mono">Rec: {summary.overallReceivedCartons || 0}</span>
              <span className="text-indigo-300 font-mono">Load: {summary.overallLoadedCartons || 0}</span>
            </div>
          </div>

          {/* Card 3: CBM Mismatch */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>CBM Mismatch (m³)</span>
              <Maximize2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-black">
              {summary.netCbmDiff > 0 ? (
                <span className="text-amber-400">+{summary.netCbmDiff} m³</span>
              ) : summary.netCbmDiff < 0 ? (
                <span className="text-rose-400">{summary.netCbmDiff} m³</span>
              ) : (
                <span className="text-emerald-400">0 Match</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
              <span className="text-emerald-300 font-mono">Rec: {Number((summary.overallReceivedCbm || 0).toFixed(2))}</span>
              <span className="text-purple-300 font-mono">Load: {Number((summary.overallLoadedCbm || 0).toFixed(2))}</span>
            </div>
          </div>

          {/* Card 4: Weight Mismatch */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Weight Mismatch (KG)</span>
              <Scale className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-xl font-black">
              {summary.netWeightDiff > 0 ? (
                <span className="text-amber-400">+{summary.netWeightDiff} kg</span>
              ) : summary.netWeightDiff < 0 ? (
                <span className="text-rose-400">{summary.netWeightDiff} kg</span>
              ) : (
                <span className="text-emerald-400">0 Match</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
              <span className="text-emerald-300 font-mono">Rec: {Number((summary.overallReceivedWeight || 0).toFixed(1))}</span>
              <span className="text-teal-300 font-mono">Load: {Number((summary.overallLoadedWeight || 0).toFixed(1))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. CATEGORY FILTER PILLS (Direct match for User Scenarios) ─── */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2">
        <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Exception Category Filters:</span>
          </span>
          <span className="text-[11px] text-slate-500 font-normal">
            {displayItems.length} mismatches shown
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <span>All Mismatches</span>
            <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
              {summary.totalMismatches || 0}
            </span>
          </button>

          {/* User Specific Scenario 1: Carton Matched, CBM/Weight Mismatch */}
          <button
            onClick={() => setSelectedCategory('Carton Matched, CBM/Weight Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'Carton Matched, CBM/Weight Mismatch'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
            }`}
          >
            <span>CTN Matched, CBM/Wt Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-indigo-200/60 rounded-full text-[10px]">
              {categoryCounts['Carton Matched, CBM/Weight Mismatch'] || 0}
            </span>
          </button>

          {/* User Specific Scenario 2: CBM Matched, Carton/Weight Mismatch */}
          <button
            onClick={() => setSelectedCategory('CBM Matched, Carton/Weight Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'CBM Matched, Carton/Weight Mismatch'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200'
            }`}
          >
            <span>CBM Matched, CTN/Wt Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-purple-200/60 rounded-full text-[10px]">
              {categoryCounts['CBM Matched, Carton/Weight Mismatch'] || 0}
            </span>
          </button>

          {/* User Specific Scenario 3: Weight Matched */}
          <button
            onClick={() => setSelectedCategory('Weight Matched, Carton/CBM Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'Weight Matched, Carton/CBM Mismatch'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'
            }`}
          >
            <span>Weight Matched, CTN/CBM Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-teal-200/60 rounded-full text-[10px]">
              {categoryCounts['Weight Matched, Carton/CBM Mismatch'] || 0}
            </span>
          </button>

          {/* Carton & Weight Matched, CBM Mismatch */}
          <button
            onClick={() => setSelectedCategory('Carton & Weight Matched, CBM Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'Carton & Weight Matched, CBM Mismatch'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            <span>CTN & Wt Matched, CBM Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-blue-200/60 rounded-full text-[10px]">
              {categoryCounts['Carton & Weight Matched, CBM Mismatch'] || 0}
            </span>
          </button>

          {/* Carton & CBM Matched, Weight Mismatch */}
          <button
            onClick={() => setSelectedCategory('Carton & CBM Matched, Weight Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'Carton & CBM Matched, Weight Mismatch'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200'
            }`}
          >
            <span>CTN & CBM Matched, Wt Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-sky-200/60 rounded-full text-[10px]">
              {categoryCounts['Carton & CBM Matched, Weight Mismatch'] || 0}
            </span>
          </button>

          {/* CBM & Weight Matched, Carton Mismatch */}
          <button
            onClick={() => setSelectedCategory('CBM & Weight Matched, Carton Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'CBM & Weight Matched, Carton Mismatch'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200'
            }`}
          >
            <span>CBM & Wt Matched, CTN Mismatch</span>
            <span className="ml-1 px-1.5 py-0.2 bg-cyan-200/60 rounded-full text-[10px]">
              {categoryCounts['CBM & Weight Matched, Carton Mismatch'] || 0}
            </span>
          </button>

          {/* Multi-Metric Discrepancy */}
          <button
            onClick={() => setSelectedCategory('Multi-Metric Mismatch')}
            className={`px-3 py-1 rounded-xl font-semibold transition flex items-center space-x-1.5 ${
              selectedCategory === 'Multi-Metric Mismatch'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
            }`}
          >
            <span>All Three Mismatched</span>
            <span className="ml-1 px-1.5 py-0.2 bg-rose-200/60 rounded-full text-[10px]">
              {categoryCounts['Multi-Metric Mismatch'] || 0}
            </span>
          </button>
        </div>
      </div>

      {/* ─── 4. SEARCH & SELECTION CONTROLS ─── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Container Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Select Container
            </label>
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Containers ({reportData.availableContainers.length})</option>
              {reportData.availableContainers.map((c) => (
                <option key={c.container} value={c.container}>
                  {c.container} {c.containerNumber ? `(${c.containerNumber})` : ''} — {c.mismatchCount} mismatches
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Origin Warehouse
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Warehouses</option>
              {reportData.availableWarehouses.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Search (Receipt, Party, Marka, Container)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by receipt no., container, party, or marka..."
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 5. CONTAINER SUMMARIES COLLAPSIBLE SECTION ─── */}
      {reportData.containerSummaries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandedContainerSummary(!expandedContainerSummary)}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-200 transition"
          >
            <div className="flex items-center space-x-2">
              <Ship className="w-4 h-4 text-indigo-600" />
              <span>Container Mismatch Summary ({reportData.containerSummaries.length} Containers Analyzed)</span>
            </div>
            <div className="flex items-center space-x-1 text-slate-500">
              <span>{expandedContainerSummary ? 'Hide' : 'Show'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedContainerSummary ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {expandedContainerSummary && (
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto">
              {reportData.containerSummaries.map((cs) => {
                const isSelected = selectedContainer === cs.container;
                return (
                  <div
                    key={cs.container}
                    onClick={() => setSelectedContainer(isSelected ? 'ALL' : cs.container)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-400'
                        : cs.mismatchCount > 0
                        ? 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/60'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                      <span className="font-mono text-indigo-700">{cs.container}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 rounded text-slate-700 font-mono">
                        {cs.containerNumber || 'No Carrier #'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1.5">
                      <span>{cs.warehouse} • {cs.loadingDate || 'No Date'}</span>
                      <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                        cs.mismatchCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {cs.mismatchCount} mismatches
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[10px] font-mono pt-1 border-t border-slate-200/60 text-slate-700">
                      <div>
                        <span className="text-slate-400 block">CTN Diff</span>
                        <span className={cs.netCartonDiff !== 0 ? 'text-amber-700 font-bold' : 'text-slate-600'}>
                          {cs.netCartonDiff > 0 ? `+${cs.netCartonDiff}` : cs.netCartonDiff}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">CBM Diff</span>
                        <span className={cs.netCbmDiff !== 0 ? 'text-purple-700 font-bold' : 'text-slate-600'}>
                          {cs.netCbmDiff > 0 ? `+${cs.netCbmDiff}` : cs.netCbmDiff}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Weight Diff</span>
                        <span className={cs.netWeightDiff !== 0 ? 'text-teal-700 font-bold' : 'text-slate-600'}>
                          {cs.netWeightDiff > 0 ? `+${cs.netWeightDiff}` : cs.netWeightDiff}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── 6. MISMATCH DETAILED TABLE ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs sm:text-sm font-bold tracking-wide">
              Exception Report Data Table (Only Mismatches — Fully Matched Excluded)
            </h2>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            {displayItems.length} records displayed
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
            <p className="text-xs font-semibold">Loading Exception Report...</p>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No Mismatches Found!</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All containers and receipts under selected filters are fully matched across Cartons, CBM, and Weight.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 text-[11px] uppercase tracking-wider font-bold border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Container</th>
                  <th className="py-2.5 px-3">Receipt No.</th>
                  <th className="py-2.5 px-3">Party & Marka</th>
                  <th className="py-2.5 px-3">Warehouse & Date</th>
                  <th className="py-2.5 px-3">
                    <span className="text-indigo-900 block font-bold">Carton Comparison (CTN)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Rec vs Load (Diff)</span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="text-purple-900 block font-bold">CBM Comparison (m³)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Rec vs Load (Diff)</span>
                  </th>
                  <th className="py-2.5 px-3">
                    <span className="text-teal-900 block font-bold">Weight Comparison (KG)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Rec vs Load (Diff)</span>
                  </th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Discrepancy Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayItems.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/80 transition group">
                    {/* Index */}
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Container */}
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      <div className="font-mono font-bold text-indigo-700">{item.container}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {item.containerNumber || '—'}
                      </div>
                    </td>

                    {/* Receipt */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {item.receipt}
                    </td>

                    {/* Party & Marka */}
                    <td className="py-2.5 px-3 max-w-[160px]">
                      <div className="font-medium text-slate-900 truncate" title={item.party}>
                        {item.party || 'General Party'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate" title={`${item.mainMarka} / ${item.subMarka}`}>
                        Marka: {item.mainMarka || '—'} {item.subMarka && item.subMarka !== '—' ? `(${item.subMarka})` : ''}
                      </div>
                    </td>

                    {/* Warehouse & Date */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 text-[11px]">
                      <div>{item.warehouse}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.loadingDate || '—'}</div>
                    </td>

                    {/* Cartons (Received vs Loaded & Diff) */}
                    <td className="py-2.5 px-3 font-mono">
                      <div className="text-slate-800 text-[11px]">
                        <span className="text-slate-500">Rec:</span> <strong className="text-slate-900">{item.receivedCartons}</strong>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="text-indigo-600">Load:</span> <strong className="text-indigo-900">{item.loadedCartons}</strong>
                      </div>
                      <div className="mt-0.5">
                        {renderDiffBadge(item.cartonDiff, 'CTN', 0)}
                      </div>
                    </td>

                    {/* CBM (Received vs Loaded & Diff) */}
                    <td className="py-2.5 px-3 font-mono">
                      <div className="text-slate-800 text-[11px]">
                        <span className="text-slate-500">Rec:</span> <strong className="text-slate-900">{Number(item.receivedCbm.toFixed(2))}</strong>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="text-purple-600">Load:</span> <strong className="text-purple-900">{Number(item.loadedCbm.toFixed(2))}</strong>
                      </div>
                      <div className="mt-0.5">
                        {renderDiffBadge(item.cbmDiff, 'm³', 2)}
                      </div>
                    </td>

                    {/* Weight (Received vs Loaded & Diff) */}
                    <td className="py-2.5 px-3 font-mono">
                      <div className="text-slate-800 text-[11px]">
                        <span className="text-slate-500">Rec:</span> <strong className="text-slate-900">{Number(item.receivedWeight.toFixed(1))}</strong>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="text-teal-600">Load:</span> <strong className="text-teal-900">{Number(item.loadedWeight.toFixed(1))}</strong>
                      </div>
                      <div className="mt-0.5">
                        {renderDiffBadge(item.weightDiff, 'kg', 1)}
                      </div>
                    </td>

                    {/* Category Badge */}
                    <td className="py-2.5 px-3">
                      {renderCategoryBadge(item.categoryGroup, item.categoryLabel)}
                    </td>

                    {/* Summary */}
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-[220px]">
                      <div className="truncate" title={item.summary}>
                        {item.summary}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
