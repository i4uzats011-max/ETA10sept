'use client';

import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Save,
  PauseCircle,
  Truck,
  RotateCcw,
} from 'lucide-react';

export interface SalesHoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  receiptData: {
    receipt: string;
    warehouse: string;
    currentStatus?: 'Normal' | 'Available to Deliver' | 'Hold';
    currentHoldReason?: string;
  } | null;
}

export default function SalesHoldModal({
  isOpen,
  onClose,
  onSuccess,
  receiptData,
}: SalesHoldModalProps) {
  if (!isOpen || !receiptData) return null;

  const [status, setStatus] = useState<'Normal' | 'Available to Deliver' | 'Hold'>(
    receiptData.currentStatus || 'Normal'
  );
  const [holdReason, setHoldReason] = useState(receiptData.currentHoldReason || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const COMMON_HOLD_REASONS = [
    'Party Rate Dispute / Pending Rate Confirmation',
    'Old Outstanding Payment Balance Pending',
    'Consignee Requested Delivery Hold',
    'Documents / Invoice Under Verification',
    'Goods Measurement / CBM Verification Needed',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'Hold' && !holdReason.trim()) {
      setErrorMsg('Please enter a hold reason.');
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
          salesStatus: status,
          holdReason: status === 'Hold' ? holdReason.trim() : '',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update status');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while updating status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-300">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm tracking-wide">
              Sales Hold & Delivery Control
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-700 flex justify-between">
            <span>
              Receipt: <strong className="font-mono text-slate-900">{receiptData.receipt}</strong>
            </span>
            <span>
              Warehouse: <strong className="text-slate-900">{receiptData.warehouse}</strong>
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Cargo Status:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Normal */}
              <button
                type="button"
                onClick={() => setStatus('Normal')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition ${
                  status === 'Normal'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RotateCcw className="w-4 h-4 text-blue-600" />
                <span>Normal</span>
                <span className="text-[10px] font-normal text-slate-500">In Discussion</span>
              </button>

              {/* Available to Deliver */}
              <button
                type="button"
                onClick={() => setStatus('Available to Deliver')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition ${
                  status === 'Available to Deliver'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>Available</span>
                <span className="text-[10px] font-normal text-slate-500">Ready for Delivery</span>
              </button>

              {/* Hold */}
              <button
                type="button"
                onClick={() => setStatus('Hold')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition ${
                  status === 'Hold'
                    ? 'bg-rose-50 border-rose-600 text-rose-800 shadow-xs'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <PauseCircle className="w-4 h-4 text-rose-600" />
                <span>HOLD</span>
                <span className="text-[10px] font-normal text-slate-500">Hold Cargo</span>
              </button>
            </div>
          </div>

          {/* If Hold is selected, prompt for Hold Reason */}
          {status === 'Hold' && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-rose-800">
                Hold Reason *
              </label>
              <textarea
                rows={2}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="e.g. Payment pending, rate dispute, etc..."
                className="w-full px-3 py-2 text-xs border border-rose-300 rounded focus:ring-2 focus:ring-rose-500 focus:outline-none bg-rose-50/30"
                required
              />

              {/* Quick Reason Chips */}
              <div className="flex flex-wrap gap-1 mt-1">
                {COMMON_HOLD_REASONS.map((r, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHoldReason(r)}
                    className="text-[10px] bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 px-2 py-0.5 rounded border border-slate-200"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {errorMsg}
            </div>
          )}

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
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded shadow transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Updating...' : 'Save Status'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
