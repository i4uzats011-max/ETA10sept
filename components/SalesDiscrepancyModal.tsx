'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Save,
  Info,
} from 'lucide-react';

export interface SalesDiscrepancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receiptData: {
    receipt: string;
    warehouse: string;
    volume: string;
    weight: string;
    quantity: number | string;
    commodity?: string;
    mainMarka?: string;
    existingDiscrepancy?: any;
  } | null;
}

export default function SalesDiscrepancyModal({
  isOpen,
  onClose,
  onSuccess,
  receiptData,
}: SalesDiscrepancyModalProps) {
  if (!isOpen || !receiptData) return null;

  const existing = receiptData.existingDiscrepancy;
  const [actualCbm, setActualCbm] = useState(existing?.actualCbm || '');
  const [actualWeight, setActualWeight] = useState(existing?.actualWeight || '');
  const [actualCtn, setActualCtn] = useState(existing?.actualCtn || receiptData.quantity || '');
  const [remarks, setRemarks] = useState(existing?.remarks || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      setErrorMsg('कृपया कारण (Remarks) लिखें कि डेटा एंट्री में क्या गलत है।');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/sales/receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: receiptData.receipt,
          warehouse: receiptData.warehouse,
          discrepancyRequest: {
            actualCbm: actualCbm.trim(),
            actualWeight: actualWeight.trim(),
            actualCtn: actualCtn ? Number(actualCtn) : undefined,
            remarks: remarks.trim(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit discrepancy request');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while saving discrepancy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-amber-300">
        {/* Header */}
        <div className="bg-amber-500 text-white px-5 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-100" />
            <h3 className="font-bold text-sm tracking-wide">
              Data Entry Wrong (डेटा एंट्री गलत रिपोर्ट करें)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Important Rule Notice */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-xs text-amber-900 flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">डेटा सुरक्षा नियम (Data Integrity Rule):</p>
              <p className="mt-0.5 text-amber-800">
                सेल्स हेड या टीम मास्टर डेटाबेस सीधे एडिट नहीं कर सकते। आपकी यह रिक्वेस्ट एडमिन एवं वेयरहाउस कीपर के टास्क/मैसेज में जाएगी। एडमिन के अप्रूवल के बाद ही डेटाबेस में वैल्यू अपडेट होगी।
              </p>
            </div>
          </div>

          {/* Current Warehouse Entry Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs grid grid-cols-2 gap-2 text-slate-700">
            <div>
              <span className="text-slate-500 block text-[11px]">Receipt No.:</span>
              <strong className="font-mono text-slate-900">{receiptData.receipt}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Warehouse:</span>
              <strong className="text-slate-900">{receiptData.warehouse}</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Current CBM:</span>
              <span className="font-medium text-slate-900">{receiptData.volume || '0'} CBM</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Current Weight:</span>
              <span className="font-medium text-slate-900">{receiptData.weight || '0'} KG</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block text-[11px]">Item / Commodity:</span>
              <span className="text-slate-900">{receiptData.commodity || 'N/A'}</span>
            </div>
          </div>

          {/* Existing Status Indicator */}
          {existing?.hasDiscrepancy && (
            <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
              <span>
                स्थिति: <strong>{existing.status || 'Pending'}</strong> (Reported by: {existing.reportedBy})
              </span>
              {existing.status === 'Approved' ? (
                <span className="text-emerald-700 font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> <span>Approved by Admin</span>
                </span>
              ) : (
                <span className="text-amber-700 font-medium flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5" /> <span>Under Review</span>
                </span>
              )}
            </div>
          )}

          {/* Actual Values Input */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual CBM (सही CBM)
              </label>
              <input
                type="text"
                value={actualCbm}
                onChange={(e) => setActualCbm(e.target.value)}
                placeholder="e.g. 1.85"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual Wt (सही वजन KG)
              </label>
              <input
                type="text"
                value={actualWeight}
                onChange={(e) => setActualWeight(e.target.value)}
                placeholder="e.g. 350"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual CTN (कार्टन)
              </label>
              <input
                type="number"
                value={actualCtn}
                onChange={(e) => setActualCtn(e.target.value)}
                placeholder="CTN count"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Discrepancy Reason / Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Discrepancy Details / Remarks (कारण व विवरण) *
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="उदाहरण: पार्टी ने पैकिंग लिस्ट भेजी है जिसमें 1.8 CBM है, वेयरहाउस में 2.4 CBM गलत चढ़ गया है। कृपया री-मेजर करें।"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 focus:outline-none"
              required
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Submitting...' : 'Submit to Admin for Correction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
