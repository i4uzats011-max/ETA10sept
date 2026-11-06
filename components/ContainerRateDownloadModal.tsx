'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Search,
  Box,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  downloadReceiptWiseRateExcel,
  downloadContainerWiseRateExcel,
} from '@/lib/containerRateExport';

interface ContainerOption {
  container: string;
  containerNumber: string;
  shippingLine: string;
  receiptCount: number;
  ratesCount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialContainer?: string;
}

export default function ContainerRateDownloadModal({
  isOpen,
  onClose,
  initialContainer = '',
}: Props) {
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>(initialContainer || 'ALL');
  const [loadingList, setLoadingList] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialContainer) {
        setSelectedContainer(initialContainer);
      }
      setLoadingList(true);
      setErrorMsg(null);
      fetch('/api/admin/rates/receipt-wise')
        .then((res) => res.json())
        .then((data) => {
          if (data?.containersList) {
            setContainers(data.containersList);
          }
        })
        .catch((err) => {
          setErrorMsg(err.message || 'Failed to load container list');
        })
        .finally(() => {
          setLoadingList(false);
        });
    }
  }, [isOpen, initialContainer]);

  if (!isOpen) return null;

  const filteredContainers = containers.filter((c) => {
    if (!searchFilter) return true;
    const term = searchFilter.toLowerCase();
    return (
      c.container.toLowerCase().includes(term) ||
      (c.containerNumber && c.containerNumber.toLowerCase().includes(term)) ||
      (c.shippingLine && c.shippingLine.toLowerCase().includes(term))
    );
  });

  const activeContainerInfo = containers.find(
    (c) => c.container.toUpperCase() === selectedContainer.toUpperCase()
  );

  const handleDownloadReceiptWise = async () => {
    setDownloading(true);
    setErrorMsg(null);
    try {
      await downloadReceiptWiseRateExcel(selectedContainer);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to download receipt-wise rate list');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadFullManifest = async () => {
    setDownloading(true);
    setErrorMsg(null);
    try {
      await downloadContainerWiseRateExcel();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to download container rates');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                Download Rate List (Receipt-Wise)
              </h3>
              <p className="text-xs text-slate-500">
                Select container to download rates organized receipt-number wise
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Select Container */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>1. Select Container</span>
            <span className="text-[11px] font-normal text-slate-400">
              {containers.length} containers available
            </span>
          </label>

          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search container alias, carrier no..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Select Dropdown */}
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            disabled={loadingList}
            className="w-full p-2.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
          >
            <option value="ALL">★ All Containers (All Receipts Manifest)</option>
            {filteredContainers.map((c) => (
              <option key={c.container} value={c.container}>
                {c.container} {c.containerNumber ? `(${c.containerNumber})` : ''} - {c.shippingLine || 'MSC'} [{c.receiptCount} receipts{c.ratesCount ? `, ${c.ratesCount} rates` : ''}]
              </option>
            ))}
          </select>
        </div>

        {/* Selected Container Preview Badge */}
        {selectedContainer !== 'ALL' && activeContainerInfo && (
          <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 text-xs space-y-1">
            <div className="flex items-center justify-between font-bold text-indigo-900">
              <span>Container: {activeContainerInfo.container}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 font-mono">
                {activeContainerInfo.shippingLine || 'MSC'}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-2 pt-1">
              <div>Carrier No: <span className="font-mono font-semibold">{activeContainerInfo.containerNumber || 'N/A'}</span></div>
              <div>Receipts: <span className="font-bold text-slate-800">{activeContainerInfo.receiptCount}</span></div>
              <div>With Rate: <span className="font-bold text-emerald-700">{activeContainerInfo.ratesCount}</span></div>
              <div>Pending Rate: <span className="text-slate-500">{activeContainerInfo.receiptCount - activeContainerInfo.ratesCount}</span></div>
            </div>
          </div>
        )}

        {selectedContainer === 'ALL' && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            Export will include <strong>every receipt across all 150 containers</strong> with their individual saved rates, receipt numbers, shipper names, phone numbers, and cargo details.
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={handleDownloadReceiptWise}
            disabled={downloading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {downloading
                ? 'Generating Excel...'
                : selectedContainer !== 'ALL'
                ? `Download Receipt-Wise Rates for ${selectedContainer} (.xlsx)`
                : 'Download All Receipts Rate List (.xlsx)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadFullManifest}
            disabled={downloading}
            className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Download Two-Sheet Fleet Manifest (Containers + Receipts)</span>
          </button>
        </div>

        <div className="text-[11px] text-center text-slate-400">
          Strictly read-only export • Zero modifications to current database records
        </div>
      </div>
    </div>
  );
}
