'use client';

import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  X,
  Clock,
  ArrowRight,
  RefreshCw,
  Info,
  Calendar,
  Anchor,
  MessageSquare,
} from 'lucide-react';

interface DateChangeItem {
  container: string;
  containerNumber: string;
  blNumber?: string;
  shippingLine: string;
  portName: string;
  isEtaChanged: boolean;
  oldEta: string;
  newEta: string;
  etaDaysShift: number | null;
  isPortDateChanged: boolean;
  oldPortDate: string;
  newPortDate: string;
  portDaysShift: number | null;
  remarks: string;
}

interface UploadResponse {
  success: boolean;
  message: string;
  totalRows: number;
  totalUpdated: number;
  skippedCount: number;
  hasDateChanges: boolean;
  dateChangesCount: number;
  dateChanges: DateChangeItem[];
  dateChangeReportText: string;
  warnings?: string[];
  updatedContainers?: string[];
}

interface BulkContainerUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BulkContainerUpdateModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkContainerUpdateModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);

  const [copiedReport, setCopiedReport] = useState(false);
  const [showFullTxtPreview, setShowFullTxtPreview] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // ── Step 1: Download Excel Template ──
  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch('/api/admin/containers/bulk-update-excel', {
        method: 'GET',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download container update Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Container_Update_Template_Undelivered_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(err?.message || 'Error downloading Excel template');
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Step 2: Handle File Selection ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
      setUploadResult(null);
    }
  };

  // ── Helper: Trigger .txt File Download ──
  const triggerTxtFileDownload = (reportText: string, filename?: string) => {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    a.download = filename || `Container_Date_Changes_${dateStr}_${timeStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ── Step 2: Upload Excel and Process ──
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/admin/containers/bulk-update-excel', {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error((data as any).error || 'Failed to update containers from Excel');
      }

      setUploadResult(data);

      // FOCUS: If any date change detected, automatically trigger .txt file download!
      if (data.hasDateChanges && data.dateChangeReportText) {
        triggerTxtFileDownload(data.dateChangeReportText);
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err?.message || 'Failed to process Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyReport = () => {
    if (!uploadResult?.dateChangeReportText) return;
    navigator.clipboard.writeText(uploadResult.dateChangeReportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const resetUploadState = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl my-auto overflow-hidden animate-fadeIn flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg sm:text-xl font-black tracking-tight">
                  Bulk Container Excel Update (एक्सेल द्वारा बल्क अपडेट)
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                  Two-Step Workflow
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Download pre-filled Excel template, enter new ETA Date, Port Date & Remarks, then upload.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition shrink-0"
            title="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6">
          {/* Focus Notification Banner */}
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start space-x-3">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-black text-[13px] text-amber-900">
                🎯 Date Change Focus (डेट चेंज ऑटो-डिटेक्शन व टेक्स्ट फाइल):
              </p>
              <p>
                If <strong>ANY</strong> container has its <strong>Port Date (rawEta)</strong> or{' '}
                <strong>ETA Date (Destination ETA)</strong> modified in the uploaded file, the system will{' '}
                <strong>automatically generate and download a detailed .txt audit file</strong> listing previous
                dates, new dates, and day differences (+/- days).
              </p>
            </div>
          </div>

          {/* ── STEP 1: DOWNLOAD EXCEL TEMPLATE ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                  1
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-black text-slate-900">
                      Download Undelivered Containers Template (अन-डिलीवर्ड कंटेनर एक्सेल)
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Undelivered Only
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes only active/undelivered containers. Delivered containers are excluded per policy and cannot be updated.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={isDownloading}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shrink-0 shadow-sm disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Undelivered Excel (.xlsx)</span>
                  </>
                )}
              </button>
            </div>

            {/* Template Column Structure Preview Pills */}
            <div className="pt-2 border-t border-slate-200/80">
              <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center space-x-1">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                <span>Columns included in downloaded Excel:</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  Container No.
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  Actual Container No.
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  Internal Container
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  BL No. (Blank if not set)
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  Shipping Line Company Name
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300">
                  👉 ETA Date [BLANK]
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300">
                  👉 Port Date [BLANK]
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300">
                  👉 Port Name [BLANK]
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300">
                  👉 Remarks [BLANK]
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold border border-slate-300">
                  Last ETA (Ref)
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold border border-slate-300">
                  Last Port Date (Ref)
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold border border-slate-300">
                  Current Port Name (Ref)
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold border border-slate-300">
                  Latest Remark (Ref)
                </span>
              </div>
            </div>

            {downloadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}
          </div>

          {/* ── STEP 2: UPLOAD FILLED EXCEL FILE ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                2
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Upload Updated Excel File (अपडेटेड फाइल अपलोड करें)
                </h4>
                <p className="text-xs text-slate-500">
                  Fill new values in the blank columns (ETA Date, Port Date, Port Name, Remarks) and upload.
                </p>
              </div>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 transition rounded-2xl p-5 text-center bg-white cursor-pointer relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-black text-slate-900">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {(selectedFile.size / 1024).toFixed(1)} KB • Ready to process
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-700">
                        Click or drag & drop updated Excel file here
                      </p>
                      <p className="text-[10px] text-slate-400">Supports .xlsx and .xls files</p>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-bold flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-1">
                {selectedFile && (
                  <button
                    type="button"
                    onClick={resetUploadState}
                    disabled={isUploading}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition"
                  >
                    Clear File
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center space-x-2 shadow-sm disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing & Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Upload & Apply Updates (अपडेट लागू करें)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ── UPLOAD RESULTS & DATE CHANGE .TXT REPORT ── */}
          {uploadResult && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden animate-fadeIn space-y-4 p-5 bg-white shadow-xs">
              {/* Overall Success Header */}
              <div
                className={`p-4 rounded-xl flex items-start space-x-3 ${
                  uploadResult.hasDateChanges
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-950'
                    : 'bg-blue-50 border border-blue-300 text-blue-950'
                }`}
              >
                <CheckCircle2
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    uploadResult.hasDateChanges ? 'text-emerald-600' : 'text-blue-600'
                  }`}
                />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-black">
                    {uploadResult.message}
                  </h4>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="bg-white/80 px-2.5 py-0.5 rounded-md border">
                      Total Rows: {uploadResult.totalRows}
                    </span>
                    <span className="bg-white/80 px-2.5 py-0.5 rounded-md border text-emerald-700">
                      Containers Updated: {uploadResult.totalUpdated}
                    </span>
                    {uploadResult.hasDateChanges ? (
                      <span className="bg-amber-100 px-2.5 py-0.5 rounded-md border border-amber-300 text-amber-900 font-black">
                        ⚡ Date Changes: {uploadResult.dateChangesCount} Container(s)
                      </span>
                    ) : (
                      <span className="bg-slate-100 px-2.5 py-0.5 rounded-md border text-slate-700">
                        Date Changes: 0 (No dates modified)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Notice if text file was auto-downloaded */}
              {uploadResult.hasDateChanges && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Audit Text File Generated:</strong> The .txt report was automatically downloaded to your downloads folder.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerTxtFileDownload(uploadResult.dateChangeReportText)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black shrink-0 transition flex items-center space-x-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .txt Again</span>
                  </button>
                </div>
              )}

              {/* Table of Date Changes */}
              {uploadResult.hasDateChanges && uploadResult.dateChanges.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Containers With Date Modifications ({uploadResult.dateChanges.length})</span>
                    </h5>
                    <button
                      type="button"
                      onClick={() => setShowFullTxtPreview((v) => !v)}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      {showFullTxtPreview ? 'Hide TXT Preview' : 'Show Full TXT Preview'}
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Container</th>
                          <th className="p-2.5">Carrier / Line</th>
                          <th className="p-2.5">Port Arrival Date (Vessel ETA)</th>
                          <th className="p-2.5">Destination ETA (Grace Date)</th>
                          <th className="p-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uploadResult.dateChanges.map((c, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 font-black text-slate-900">
                              <div>{c.container}</div>
                              {c.containerNumber && (
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {c.containerNumber}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-600 font-bold">
                              <div>{c.shippingLine || 'MSC'}</div>
                              <div className="text-[10px] text-slate-500">{c.portName}</div>
                            </td>
                            <td className="p-2.5">
                              {c.isPortDateChanged ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="line-through text-slate-400 font-mono text-[11px]">
                                      {c.oldPortDate || 'Not set'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-emerald-600" />
                                    <span className="font-bold text-emerald-700 font-mono text-[11px]">
                                      {c.newPortDate}
                                    </span>
                                  </div>
                                  {c.portDaysShift !== null && (
                                    <span
                                      className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded ${
                                        c.portDaysShift > 0
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                    >
                                      {c.portDaysShift > 0 ? `+${c.portDaysShift}d delay` : `${c.portDaysShift}d earlier`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-[11px]">
                                  {c.oldPortDate || 'Unchanged'}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {c.isEtaChanged ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="line-through text-slate-400 font-mono text-[11px]">
                                      {c.oldEta || 'Not set'}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-amber-600" />
                                    <span className="font-bold text-amber-700 font-mono text-[11px]">
                                      {c.newEta}
                                    </span>
                                  </div>
                                  {c.etaDaysShift !== null && (
                                    <span
                                      className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded ${
                                        c.etaDaysShift > 0
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {c.etaDaysShift > 0 ? `+${c.etaDaysShift}d extended` : `${c.etaDaysShift}d advanced`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-[11px]">
                                  {c.oldEta || 'Unchanged'}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-600 text-[11px] max-w-[180px] truncate">
                              {c.remarks || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expandable Monospace TXT Preview */}
              {uploadResult.hasDateChanges && showFullTxtPreview && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Generated Text File (.txt) Content:</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center space-x-1.5"
                    >
                      {copiedReport ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Report</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3.5 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono leading-relaxed overflow-x-auto max-h-60 border border-slate-800 select-all">
                    {uploadResult.dateChangeReportText}
                  </pre>
                </div>
              )}

              {/* Warnings (if any) */}
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-amber-900 flex items-center space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Upload Warnings:</span>
                  </span>
                  <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                    {uploadResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Direct MongoDB update • Public tracker &amp; Redis cache updated automatically
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
