'use client';

import React, { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { closeDeliveryModal, markContainerDelivered } from '@/store/cargoMasterSlice';
import { formatGlobalDate, calculateDaysBetween } from '@/lib/dateUtils';
import { X, CheckCircle2, Calendar, Clock, AlertTriangle, Truck, RotateCcw } from 'lucide-react';

export default function MarkDeliveredModal() {
  const dispatch = useAppDispatch();
  const { isDeliveryModalOpen, activeContainerForDelivery, actionLoading } = useAppSelector(
    (state) => state.cargoMaster
  );

  const [deliveryDate, setDeliveryDate] = useState('');
  const [turnaroundDays, setTurnaroundDays] = useState<number | null>(null);
  const [containerShipments, setContainerShipments] = useState<any[]>([]);
  const [excludedReceipts, setExcludedReceipts] = useState<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (activeContainerForDelivery) {
      if (activeContainerForDelivery.deliveryDate) {
        setDeliveryDate(activeContainerForDelivery.deliveryDate);
      } else {
        setDeliveryDate(new Date().toISOString().slice(0, 10));
      }

      setLoadingItems(true);
      setExcludedReceipts(new Set());
      fetch('/api/loading-plan')
        .then((res) => res.json())
        .then((data) => {
          if (data?.plans) {
            const plan = data.plans.find(
              (p: any) =>
                p.container?.toLowerCase() === activeContainerForDelivery.container?.toLowerCase() ||
                (p.containerNumber && p.containerNumber?.toLowerCase() === activeContainerForDelivery.containerNumber?.toLowerCase())
            );
            if (plan?.items) {
              setContainerShipments(plan.items);
            } else {
              setContainerShipments([]);
            }
          }
        })
        .catch(() => setContainerShipments([]))
        .finally(() => setLoadingItems(false));
    }
  }, [activeContainerForDelivery]);

  // Recalculate live turnaround days when deliveryDate changes
  useEffect(() => {
    if (activeContainerForDelivery?.startDate && deliveryDate) {
      const days = calculateDaysBetween(activeContainerForDelivery.startDate, deliveryDate);
      setTurnaroundDays(days !== null && days >= 0 ? days : 0);
    } else {
      setTurnaroundDays(null);
    }
  }, [deliveryDate, activeContainerForDelivery]);

  if (!isDeliveryModalOpen || !activeContainerForDelivery) {
    return null;
  }

  const isAlreadyDelivered = Boolean(
    activeContainerForDelivery.isDelivered ||
    (activeContainerForDelivery.status && activeContainerForDelivery.status.toLowerCase().includes('deliver'))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryDate) {
      alert('Delivery Date is strictly mandatory.');
      return;
    }

    dispatch(
      markContainerDelivered({
        container: activeContainerForDelivery.container,
        deliveryDate,
        isDelivered: true,
        excludedReceipts: Array.from(excludedReceipts),
      })
    );
  };

  const handleRevert = () => {
    if (confirm(`Revert container ${activeContainerForDelivery.container} back to 'In Transit'?`)) {
      dispatch(
        markContainerDelivered({
          container: activeContainerForDelivery.container,
          deliveryDate: '',
          isDelivered: false,
        })
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-6 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg text-white tracking-tight">
                {isAlreadyDelivered ? 'Update Delivery Date' : 'Mark Container Delivered'}
              </h3>
              <p className="text-xs text-emerald-100">
                Container Alias: <strong className="font-mono text-white">{activeContainerForDelivery.container}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={() => dispatch(closeDeliveryModal())}
            disabled={actionLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Container Meta Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Actual Carrier No</span>
              <span className="font-mono font-bold text-slate-900">
                {activeContainerForDelivery.containerNumber || 'Unmapped'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Shipping Carrier Line</span>
              <span className="font-bold text-blue-700">
                {activeContainerForDelivery.shippingLine || 'MSC'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Loading Date (China)</span>
              <span className="font-semibold text-emerald-800">
                {formatGlobalDate(activeContainerForDelivery.startDate)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Destination Arrival ETA</span>
              <span className="font-semibold text-slate-700">
                {formatGlobalDate(activeContainerForDelivery.eta)}
              </span>
            </div>
          </div>

          {/* Cargo Manifest Checklist (Partial Delivery Exclusion) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Cargo Receipts in Container ({containerShipments.length})
              </label>
              <div className="space-x-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setExcludedReceipts(new Set())}
                  className="font-bold text-emerald-600 hover:text-emerald-700 underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const allR = containerShipments.map((i) => String(i.receipt).trim().toLowerCase());
                    setExcludedReceipts(new Set(allR));
                  }}
                  className="font-bold text-slate-500 hover:text-slate-700 underline"
                >
                  Exclude All
                </button>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-2xl p-2 space-y-1 bg-slate-50">
              {loadingItems ? (
                <p className="text-xs text-slate-400 p-2 italic text-center">Loading container items...</p>
              ) : containerShipments.length === 0 ? (
                <p className="text-xs text-slate-400 p-2 italic text-center">No individual cargo items found in loading plan.</p>
              ) : (
                containerShipments.map((item, idx) => {
                  const recKey = String(item.receipt || '').trim().toLowerCase();
                  const isExcluded = excludedReceipts.has(recKey);
                  return (
                    <div
                      key={item._id || `${item.receipt}-${idx}`}
                      onClick={() => {
                        setExcludedReceipts((prev) => {
                          const next = new Set(prev);
                          if (next.has(recKey)) next.delete(recKey);
                          else next.add(recKey);
                          return next;
                        });
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition border ${
                        isExcluded
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 cursor-pointer"
                        />
                        <div>
                          <span className="font-mono font-bold">{item.receipt}</span>
                          {item.commodity && (
                            <span className="ml-2 text-[11px] text-slate-500 truncate max-w-[120px] inline-block align-bottom">
                              ({item.commodity})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">{item.quantity} CTN</span>
                        {isExcluded ? (
                          <span className="ml-2 text-[10px] font-bold uppercase bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded">
                            Excluded
                          </span>
                        ) : (
                          <span className="ml-2 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                            Delivering
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Uncheck any receipt if only part of the container was delivered. Excluded receipts will remain in transit.
            </p>
          </div>

          {/* Date Picker Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Actual Container Delivery Date</span>
              </span>
              <span className="text-emerald-700 font-bold text-[10px]">* Mandatory</span>
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-emerald-300 font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              required
            />
            <p className="text-[11px] text-slate-400">
              Formatted globally as: <strong className="text-slate-800 font-mono">{formatGlobalDate(deliveryDate)}</strong>
            </p>
          </div>

          {/* Turnaround Days Calculation Preview */}
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wide block">
                  Calculated Days to Deliver (Turnaround)
                </span>
                <span className="text-xs text-emerald-900">
                  From {formatGlobalDate(activeContainerForDelivery.startDate)} to {formatGlobalDate(deliveryDate)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-emerald-700">
                {turnaroundDays !== null ? `${turnaroundDays}d` : '—'}
              </span>
              <span className="text-[10px] text-emerald-600 block font-semibold">Total Turnaround</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            ℹ️ Marking this container as delivered will update all associated shipments in the database, calculate turnaround days, and halt future API tracking calls.
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            {isAlreadyDelivered && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={actionLoading}
                className="w-full sm:w-auto px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition border border-rose-200 flex items-center justify-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert to In Transit</span>
              </button>
            )}

            <div className="flex items-center space-x-2 w-full sm:w-auto ml-auto">
              <button
                type="button"
                onClick={() => dispatch(closeDeliveryModal())}
                disabled={actionLoading}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={actionLoading || !deliveryDate}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving Delivery...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAlreadyDelivered ? 'Update Delivery Date' : 'Confirm & Mark Delivered'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
