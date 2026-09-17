'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchCargoFleet,
  openDeliveryModal,
  markContainerDelivered,
  ContainerMasterItem,
  setSearchTerm,
  setStatusFilter,
  setCarrierFilter,
} from '@/store/cargoMasterSlice';
import { formatGlobalDate } from '@/lib/dateUtils';
import CargoMasterChart from './CargoMasterChart';
import MarkDeliveredModal from './MarkDeliveredModal';
import * as XLSX from 'xlsx';
import {
  Search,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  BarChart3,
  Copy,
  Check,
  Zap,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Unlink,
  RotateCcw,
} from 'lucide-react';

interface CargoMasterTableProps {
  onEditDates?: (containerAlias: string) => void;
  onSyncApi?: (containerAlias: string) => void;
  isStaffOnly?: boolean;
}

export default function CargoMasterTable({
  onEditDates,
  onSyncApi,
  isStaffOnly = false,
}: CargoMasterTableProps) {
  const dispatch = useAppDispatch();
  const { items, loading, error, searchTerm, statusFilter, carrierFilter, actionMessage } =
    useAppSelector((state) => state.cargoMaster);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [showCharts, setShowCharts] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Show ALL information columns in table format by default per user requirement
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    container: true,
    containerNumber: true,
    shippingLine: true,
    warehouse: true,
    startDate: true,
    rawEta: true,
    eta: true,
    deliveryDate: true,
    daysToDeliver: true,
    status: true,
    shippedFrom: true,
    shippedTo: true,
    currentLocation: true,
    vesselVoyage: true,
    shipmentCount: true,
    lastApiSync: true,
    apiProtection: true,
    actions: true,
  });

  const [apiStats, setApiStats] = useState<any | null>(null);
  const [syncingContainer, setSyncingContainer] = useState<string | null>(null);

  const fetchTableApiStats = async () => {
    try {
      const res = await fetch('/api/admin/jsoncargo-stats');
      if (res.ok) {
        const d = await res.json();
        if (!d.error) setApiStats(d);
      }
    } catch {}
  };

  useEffect(() => {
    dispatch(fetchCargoFleet());
    fetchTableApiStats();
  }, [dispatch]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Distinct carrier lines for filter dropdown
  const carrierOptions = useMemo(() => {
    const lines = new Set<string>();
    items.forEach((c) => {
      if (c.shippingLine) lines.add(c.shippingLine.toUpperCase());
    });
    return Array.from(lines).sort();
  }, [items]);

  // ETA Buckets dynamic counts
  const bucketCounts = useMemo(() => {
    let late = 0;
    let within2Days = 0;
    let twoToSeven = 0;
    let sevenToFifteen = 0;
    let moreThanFifteen = 0;
    let delivered = 0;
    const all = items.length;

    items.forEach((c) => {
      const isDelivered = Boolean(
        c.isDelivered ||
          (c.status &&
            (c.status.toLowerCase().includes('deliver') ||
              c.status.toLowerCase().includes('arrived') ||
              c.status.toLowerCase().includes('reached')))
      );
      if (isDelivered) {
        delivered++;
      } else if (c.daysRemaining !== null && c.daysRemaining !== undefined) {
        if (c.daysRemaining < 0) late++;
        else if (c.daysRemaining <= 2) within2Days++;
        else if (c.daysRemaining <= 7) twoToSeven++;
        else if (c.daysRemaining <= 15) sevenToFifteen++;
        else moreThanFifteen++;
      }
    });

    return { late, within2Days, twoToSeven, sevenToFifteen, moreThanFifteen, delivered, all };
  }, [items]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    const list = items.filter((c) => {
      // 1. Status Tab / ETA Bucket filter
      const isDelivered = Boolean(
        c.isDelivered ||
          (c.status &&
            (c.status.toLowerCase().includes('deliver') ||
              c.status.toLowerCase().includes('arrived') ||
              c.status.toLowerCase().includes('reached')))
      );
      const days = c.daysRemaining;

      if (statusFilter === 'within-2-days') {
        if (isDelivered || days === null || days === undefined || days < 0 || days > 2) return false;
      } else if (statusFilter === '2-to-7-days') {
        if (isDelivered || days === null || days === undefined || days <= 2 || days > 7) return false;
      } else if (statusFilter === '7-to-15-days') {
        if (isDelivered || days === null || days === undefined || days <= 7 || days > 15) return false;
      } else if (statusFilter === 'more-than-15-days') {
        if (isDelivered || days === null || days === undefined || days <= 15) return false;
      } else if (statusFilter === 'late') {
        if (isDelivered || days === null || days === undefined || days >= 0) return false;
      } else if (statusFilter === 'delivered') {
        if (!isDelivered) return false;
      } else if (statusFilter === 'in-transit') {
        if (isDelivered || (days !== null && days !== undefined && days < 0)) return false;
      }

      // 2. Carrier filter
      if (carrierFilter !== 'ALL' && c.shippingLine?.toUpperCase() !== carrierFilter) {
        return false;
      }

      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchAlias = c.container.toLowerCase().includes(q);
        const matchNo = (c.containerNumber || '').toLowerCase().includes(q);
        const matchLine = (c.shippingLine || '').toLowerCase().includes(q);
        const matchStatus = (c.status || '').toLowerCase().includes(q);
        const matchPort = (c.shippedTo || '').toLowerCase().includes(q);
        return matchAlias || matchNo || matchLine || matchStatus || matchPort;
      }

      return true;
    });

    // Date-wise sorting for delivered / reached destination containers (newest first)
    if (statusFilter === 'delivered') {
      return [...list].sort((a, b) => {
        const dateA = new Date(a.deliveryDate || a.destinationDate || a.eta || a.startDate || 0).getTime();
        const dateB = new Date(b.deliveryDate || b.destinationDate || b.eta || b.startDate || 0).getTime();
        return dateB - dateA;
      });
    }

    return list;
  }, [items, statusFilter, carrierFilter, searchTerm]);

  // Handle De-mapping Actual Carrier Container from internal container
  const handleDemapActual = async (containerAlias: string) => {
    if (!confirm(`Are you sure you want to de-map the actual carrier container from '${containerAlias}'? This will unassign the carrier container and reset the plan status to Planning.`)) {
      return;
    }
    try {
      const res = await fetch('/api/loading-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'demap-actual', container: containerAlias }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to de-map actual container');
      alert(data.message || `Successfully de-mapped actual container from '${containerAlias}'.`);
      dispatch(fetchCargoFleet());
    } catch (err: any) {
      alert(err.message || 'De-map error');
    }
  };

  // Handle Deleting Container Plan (with automatic carton restore to warehouse stock)
  const handleDeleteContainer = async (c: ContainerMasterItem) => {
    const hasItems = Boolean(c.shipmentCount && c.shipmentCount > 0);
    const confirmMsg = hasItems
      ? `Container '${c.container}' contains ${c.shipmentCount} loaded cargo item(s).\n\nDeleting this wrong loading plan will automatically UNLOAD all items and return their cartons back to China Warehouse Stock (In Stock).\n\nAre you sure you want to proceed and delete this plan?`
      : `Are you sure you want to delete container plan '${c.container}'? This action cannot be undone.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await fetch(`/api/loading-plan?container=${encodeURIComponent(c.container)}&unloadFirst=${hasItems}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete container');
      alert(data.message || `Successfully deleted container '${c.container}'.`);
      dispatch(fetchCargoFleet());
    } catch (err: any) {
      alert(err.message || 'Delete error');
    }
  };

  // Handle Reverting Delivered Container back to Undelivered (In Transit)
  const handleUnmarkDeliverRow = async (c: ContainerMasterItem) => {
    if (
      !confirm(
        `Are you sure you want to revert container '${c.container}' back to Undelivered (In Transit)?\n\nThis will clear the delivery date and restore its cargo status to In Transit.`
      )
    ) {
      return;
    }
    try {
      await dispatch(
        markContainerDelivered({ container: c.container, isDelivered: false })
      ).unwrap();
      dispatch(setStatusFilter('in-transit'));
      alert(`Container '${c.container}' has been reverted to Undelivered (In Transit).`);
      dispatch(fetchCargoFleet());
    } catch (err: any) {
      alert(err || 'Failed to revert delivery status');
    }
  };

  // Handle Direct API Status & ETA Sync
  const handleSyncContainer = async (containerAlias: string, containerNumber?: string, shippingLine?: string) => {
    if (!containerNumber || !containerNumber.trim()) {
      alert(`Container '${containerAlias}' does not have an actual carrier container number allotted yet.`);
      return;
    }
    setSyncingContainer(containerAlias);
    try {
      const res = await fetch('/api/containers/sync-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerNumber: containerNumber.trim(),
          shippingLine: shippingLine || 'MSC',
          forceRefresh: true,
          planContainer: containerAlias,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync carrier status');
      alert(`Status updated successfully for '${containerAlias}' (${containerNumber}).\nStatus: ${data.status || 'In Transit'}\nETA: ${data.eta || 'Updated'}`);
      dispatch(fetchCargoFleet());
      if (data.apiStats) {
        setApiStats(data.apiStats);
      } else {
        fetchTableApiStats();
      }
    } catch (err: any) {
      alert(err.message || 'API sync failed');
    } finally {
      setSyncingContainer(null);
    }
  };


  // Define Columns using TanStack React Table
  const columns = useMemo<ColumnDef<ContainerMasterItem>[]>(() => {
    return [
      {
        accessorKey: 'container',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center space-x-1 font-bold text-slate-700 hover:text-blue-600"
          >
            <span>Container Alias</span>
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center space-x-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                row.original.isDelivered ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
            ></div>
            <strong className="font-mono font-bold text-sm text-slate-900">
              {row.original.container}
            </strong>
          </div>
        ),
      },
      {
        accessorKey: 'containerNumber',
        header: 'Actual Container No',
        cell: ({ row }) => {
          const num = row.original.containerNumber;
          if (!num) return <span className="text-slate-400 text-xs italic">Unmapped</span>;
          const isCopied = copiedId === `cn-${row.original.container}`;
          return (
            <div className="flex items-center space-x-1.5 font-mono text-xs">
              <span className="font-bold text-indigo-950 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                {num}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(num, `cn-${row.original.container}`)}
                className="text-slate-400 hover:text-indigo-600 p-0.5 transition"
                title="Copy container number"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'shippingLine',
        header: 'Shipping Line',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
            {row.original.shippingLine || 'MSC'}
          </span>
        ),
      },
      {
        accessorKey: 'warehouse',
        header: 'Warehouse (Origin)',
        cell: ({ row }) => (
          <span className="font-semibold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
            {row.original.warehouse || 'China Warehouse'}
          </span>
        ),
      },
      {
        accessorKey: 'startDate',
        header: 'Loading Date (China)',
        cell: ({ row }) => {
          const date = row.original.startDate;
          if (!date) return <span className="text-slate-400 text-xs italic">—</span>;
          return (
            <span className="font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs">
              {formatGlobalDate(date)}
            </span>
          );
        },
      },
      {
        accessorKey: 'rawEta',
        header: 'Actual Vessel ETA (Carrier)',
        cell: ({ row }) => {
          const rawEta = row.original.rawEta;
          if (!rawEta || rawEta === 'N/A' || rawEta === 'Pending') {
            return (
              <span className="text-slate-400 text-xs italic">
                Pending API
              </span>
            );
          }
          return (
            <div className="space-y-0.5">
              <span className="font-bold font-mono text-xs text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                {formatGlobalDate(rawEta)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'eta',
        header: 'Clearance ETA (+10d)',
        cell: ({ row }) => {
          const eta = row.original.eta;
          if (!eta || eta === 'N/A' || eta === 'Pending') {
            return (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium border border-amber-200">
                Pending Actual Mapping
              </span>
            );
          }
          return (
            <div className="space-y-0.5">
              <span className="font-bold font-mono text-xs text-slate-950 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                {formatGlobalDate(eta)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'deliveryDate',
        header: 'Delivery Date',
        cell: ({ row }) => {
          const dDate = row.original.deliveryDate;
          const isDelivered = Boolean(
            row.original.isDelivered ||
            (row.original.status && row.original.status.toLowerCase().includes('deliver'))
          );

          if (isDelivered && dDate) {
            return (
              <span className="inline-flex items-center space-x-1 font-mono font-bold text-xs text-emerald-900 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{formatGlobalDate(dDate)}</span>
              </span>
            );
          }
          return <span className="text-slate-400 text-xs font-medium">In Transit</span>;
        },
      },
      {
        accessorKey: 'daysToDeliver',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center space-x-1 font-bold text-slate-700 hover:text-blue-600"
          >
            <span>Days to Deliver</span>
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
          </button>
        ),
        cell: ({ row }) => {
          const isDelivered = Boolean(
            row.original.isDelivered ||
            (row.original.status && row.original.status.toLowerCase().includes('deliver'))
          );
          const daysToDeliver = row.original.daysToDeliver;
          const daysRemaining = row.original.daysRemaining;

          if (isDelivered) {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ {daysToDeliver !== null ? `${daysToDeliver}d turnaround` : 'Delivered'}
              </span>
            );
          }

          if (daysRemaining !== null && daysRemaining !== undefined) {
            if (daysRemaining < 0) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                  🚨 Late +{Math.abs(daysRemaining)}d
                </span>
              );
            }
            if (daysRemaining === 0) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                  ⚡ Arriving Today
                </span>
              );
            }
            if (daysRemaining === 1) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                  ⚡ Tomorrow (1d)
                </span>
              );
            }
            if (daysRemaining === 2) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                  ⚡ In 2 days
                </span>
              );
            }
            if (daysRemaining <= 7) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
                  🚢 In {daysRemaining} days (2-7d)
                </span>
              );
            }
            if (daysRemaining <= 15) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                  🌊 In {daysRemaining} days (7-15d)
                </span>
              );
            }
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300">
                🌐 In {daysRemaining} days (&gt;15d)
              </span>
            );
          }

          return <span className="text-slate-400 text-xs">—</span>;
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status || 'In Transit';
          const isDelivered = Boolean(
            row.original.isDelivered || status.toLowerCase().includes('deliver')
          );
          const isDestinationReached = Boolean(
            status.toLowerCase().includes('destination') ||
              status.toLowerCase().includes('arrived') ||
              status.toLowerCase().includes('reached')
          );

          if (isDestinationReached && !isDelivered) {
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-900 border border-teal-300">
                Container reached to the final destination
              </span>
            );
          }

          return (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isDelivered
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {isDelivered ? 'Delivered' : status}
            </span>
          );
        },
      },
      {
        accessorKey: 'shippedFrom',
        header: 'Shipped From',
        cell: ({ row }) => (
          <span className="font-semibold text-xs text-slate-700 truncate max-w-[150px]" title={row.original.shippedFrom || 'China'}>
            {row.original.shippedFrom || 'China Port / WH'}
          </span>
        ),
      },
      {
        accessorKey: 'shippedTo',
        header: 'Destination Port',
        cell: ({ row }) => (
          <span className="font-bold text-xs text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md truncate max-w-[170px] inline-block" title={row.original.shippedTo || 'Nhava Sheva / Mundra, India'}>
            {row.original.shippedTo || 'Nhava Sheva / Mundra, India'}
          </span>
        ),
      },
      {
        accessorKey: 'currentLocation',
        header: 'Current Location',
        cell: ({ row }) => (
          <span className="text-xs text-slate-700 truncate max-w-[150px] inline-block font-medium" title={row.original.currentLocation || 'In Transit'}>
            {row.original.currentLocation || 'In Transit'}
          </span>
        ),
      },
      {
        id: 'vesselVoyage',
        header: 'Vessel / Voyage',
        cell: ({ row }) => {
          const vessel = row.original.vesselName;
          const voyage = row.original.voyageNumber;
          if (!vessel && !voyage) return <span className="text-slate-400 text-xs italic">—</span>;
          return (
            <div className="text-xs space-y-0.5 whitespace-nowrap">
              <div className="font-bold text-slate-800">{vessel || 'Vessel TBA'}</div>
              {voyage && <div className="text-[10px] font-mono text-slate-500">Voy: {voyage}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: 'shipmentCount',
        header: 'Packages',
        cell: ({ row }) => (
          <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
            {row.original.shipmentCount ?? 0}
          </span>
        ),
      },
      {
        accessorKey: 'lastApiSync',
        header: 'Last API Call',
        cell: ({ row }) => {
          const syncTime = row.original.lastApiSync;
          if (!syncTime) return <span className="text-slate-400 text-xs italic">Never</span>;
          return (
            <div className="text-[11px] whitespace-nowrap text-slate-600 font-mono">
              {new Date(syncTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          );
        },
      },
      {
        id: 'apiProtection',
        header: 'Protection Status',
        cell: ({ row }) => {
          const isProtected = Boolean(row.original.apiCalled || row.original.lastApiSync);
          if (isProtected) {
            return (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title="API ETA called: Protected from deletion permanently">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>Protected</span>
              </span>
            );
          }
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Pending API
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Quick Actions',
        cell: ({ row }) => {
          const c = row.original;
          const isDelivered = Boolean(
            c.isDelivered || (c.status && c.status.toLowerCase().includes('deliver'))
          );
          const hasActualContainer = Boolean(c.containerNumber && c.containerNumber.trim().length > 0 && c.containerNumber.trim().toLowerCase() !== c.container.trim().toLowerCase());
          const isApiProtected = Boolean(c.apiCalled || c.lastApiSync);

          return (
            <div className="inline-flex items-center space-x-1.5 whitespace-nowrap">
              {/* Edit Dates & Details / Correct Container */}
              {onEditDates && (
                <button
                  type="button"
                  onClick={() => onEditDates(c.container)}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs"
                  title="Manual Date Entry & Container Correction"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Edit Dates</span>
                </button>
              )}

              {/* Click to view full logistics details for this container */}
              <button
                type="button"
                onClick={() => {
                  alert(
                    `Logistics Details for Container: ${c.container}\n\n` +
                    `• Actual Carrier Container No: ${c.containerNumber || 'Unmapped'}\n` +
                    `• Shipping Line: ${c.shippingLine || 'MSC'}\n` +
                    `• Warehouse: ${c.warehouse || 'China Warehouse'}\n` +
                    `• Source (Origin Port): ${c.shippedFrom || 'China Port'}\n` +
                    `• Destination Port: ${c.shippedTo || 'Nhava Sheva / Mundra, India'}\n` +
                    `• Current Status: ${c.status || 'In Transit'}\n` +
                    `• Current Location: ${c.currentLocation || 'In Transit'}\n` +
                    `• Vessel: ${c.vesselName || 'TBA'} | Voyage: ${c.voyageNumber || 'TBA'}\n` +
                    `• Loading Date: ${c.startDate ? formatGlobalDate(c.startDate) : 'Pending'}\n` +
                    `• Actual Vessel ETA (Carrier): ${c.rawEta ? formatGlobalDate(c.rawEta) : 'Pending API'}\n` +
                    `• Clearance ETA (+10d): ${c.eta ? formatGlobalDate(c.eta) : 'Pending'}\n` +
                    `• Final Delivery Date: ${c.deliveryDate ? formatGlobalDate(c.deliveryDate) : 'In Transit'}\n` +
                    `• API Protection: ${isApiProtected ? 'Protected (Never Deleted)' : 'Normal'}`
                  );
                }}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                title="Click to view full logistics details"
              >
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                <span>Logistics</span>
              </button>

              <button
                type="button"
                onClick={() => dispatch(openDeliveryModal(c))}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-xs ${
                  isDelivered
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title={isDelivered ? 'Edit Delivery Date' : 'Mark Container Delivered'}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{isDelivered ? 'Edit' : 'Deliver'}</span>
              </button>

              {isDelivered && (
                <button
                  type="button"
                  onClick={() => handleUnmarkDeliverRow(c)}
                  className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                  title="Mistake correction: Revert container back to Undelivered (In Transit)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Undeliver</span>
                </button>
              )}

              {!isDelivered && hasActualContainer && (
                <button
                  type="button"
                  onClick={() =>
                    onSyncApi
                      ? onSyncApi(c.container)
                      : handleSyncContainer(c.container, c.containerNumber, c.shippingLine)
                  }
                  disabled={syncingContainer === c.container}
                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                  title="Manual API Sync (Immediate carrier tracking & ETA status update)"
                >
                  <Zap className={`w-3.5 h-3.5 text-indigo-600 ${syncingContainer === c.container ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              )}

              {/* De-map Actual Container Button (if allotted) */}
              {hasActualContainer && !isDelivered && (
                <button
                  type="button"
                  onClick={() => handleDemapActual(c.container)}
                  className="px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                  title="De-map actual carrier container from this internal container"
                >
                  <Unlink className="w-3.5 h-3.5 text-orange-600" />
                  <span>De-map</span>
                </button>
              )}

              {/* Delete Container Plan */}
              {!isStaffOnly && (
                <button
                  type="button"
                  onClick={() => handleDeleteContainer(c)}
                  className={`p-1 rounded-lg border text-xs transition ${
                    c.shipmentCount && c.shipmentCount > 0
                      ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                      : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                  }`}
                  title={
                    c.shipmentCount && c.shipmentCount > 0
                      ? `Delete wrong loading plan (${c.shipmentCount} items will be safely returned to China warehouse stock)`
                      : 'Delete Container Plan'
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        },
      },
    ];
  }, [copiedId, dispatch, onEditDates, onSyncApi, isStaffOnly, syncingContainer]);

  // Master Logistics Columns Reveal State
  const isLogisticsRevealed = Boolean(
    columnVisibility.containerNumber ||
    columnVisibility.shippingLine ||
    columnVisibility.shippedFrom ||
    columnVisibility.shippedTo ||
    columnVisibility.status
  );

  const handleToggleAllLogistics = () => {
    const nextVal = !isLogisticsRevealed;
    setColumnVisibility({
      containerNumber: nextVal,
      shippingLine: nextVal,
      shippedFrom: nextVal,
      shippedTo: nextVal,
      status: nextVal,
    });
  };

  // TanStack React Table Instance
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  // Export Table Data to Excel (.xlsx) - Supports active bucket or all buckets
  const exportToExcel = (exportAllBuckets: boolean = false) => {
    const today = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    const formatRow = (c: ContainerMasterItem) => {
      const isDelivered = Boolean(
        c.isDelivered ||
          (c.status &&
            (c.status.toLowerCase().includes('deliver') ||
              c.status.toLowerCase().includes('arrived') ||
              c.status.toLowerCase().includes('reached')))
      );
      let bucketLabel = 'Pending';
      if (isDelivered) bucketLabel = 'Delivered';
      else if (c.daysRemaining !== null && c.daysRemaining !== undefined) {
        if (c.daysRemaining < 0) bucketLabel = `Late (${Math.abs(c.daysRemaining)}d ago)`;
        else if (c.daysRemaining <= 2) bucketLabel = `Within 2 Days (${c.daysRemaining}d)`;
        else if (c.daysRemaining <= 7) bucketLabel = `2 to 7 Days (${c.daysRemaining}d)`;
        else if (c.daysRemaining <= 15) bucketLabel = `7 to 15 Days (${c.daysRemaining}d)`;
        else bucketLabel = `> 15 Days (${c.daysRemaining}d)`;
      }

      return {
        'Container Alias': c.container,
        'Actual Container No': c.containerNumber || 'Unmapped',
        'Shipping Line': c.shippingLine || 'MSC',
        'Destination Port': c.shippedTo || 'India Port',
        'Origin Port': c.shippedFrom || 'China Port',
        'Loading Date (China)': c.startDate || c.loadingDate ? formatGlobalDate(c.startDate || c.loadingDate) : '—',
        'Actual Port Arrival Date (Actual ETA)': c.rawEta ? formatGlobalDate(c.rawEta) : 'Pending',
        'Grace / Clearance Delivery Date': c.destinationDate || c.eta ? formatGlobalDate(c.destinationDate || c.eta) : 'Pending',
        'Days Remaining (Countdown)': c.daysRemaining !== null && c.daysRemaining !== undefined ? (c.daysRemaining < 0 ? `Late by ${Math.abs(c.daysRemaining)} days` : `${c.daysRemaining} days`) : '—',
        'ETA Bucket Category': bucketLabel,
        'Delivery Date': c.deliveryDate ? formatGlobalDate(c.deliveryDate) : (isDelivered ? 'Delivered' : 'In Transit'),
        'Cargo Status': c.status || 'In Transit',
        'Packages / Cartons': c.shipmentCount || 0,
      };
    };

    if (exportAllBuckets) {
      // Create separate sheet for each bucket
      const bucketDefinitions = [
        { name: '1-2 Days (Today)', filter: (c: ContainerMasterItem) => !c.isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining >= 0 && c.daysRemaining <= 2 },
        { name: '2 to 7 Days', filter: (c: ContainerMasterItem) => !c.isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining > 2 && c.daysRemaining <= 7 },
        { name: '7 to 15 Days', filter: (c: ContainerMasterItem) => !c.isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining > 7 && c.daysRemaining <= 15 },
        { name: 'More Than 15 Days', filter: (c: ContainerMasterItem) => !c.isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining > 15 },
        { name: 'Late Containers', filter: (c: ContainerMasterItem) => !c.isDelivered && c.daysRemaining !== null && c.daysRemaining !== undefined && c.daysRemaining < 0 },
        { name: 'Delivered', filter: (c: ContainerMasterItem) => Boolean(c.isDelivered || (c.status && c.status.toLowerCase().includes('deliver'))) },
        { name: 'All Containers', filter: () => true },
      ];

      bucketDefinitions.forEach((b) => {
        const rows = items.filter(b.filter).map(formatRow);
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'No Containers': 'No containers in this category' }]);
        XLSX.utils.book_append_sheet(wb, ws, b.name);
      });

      XLSX.writeFile(wb, `All_ETA_Buckets_Fleet_${today}.xlsx`);
    } else {
      const rows = filteredData.map(formatRow);
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'No Containers': 'No containers found matching active filter' }]);
      const sheetName = String(statusFilter).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 31) || 'Filtered_Fleet';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `ETA_${sheetName}_${today}.xlsx`);
    }
  };

  return (
    <div className="space-y-6">
      <MarkDeliveredModal />

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* Analytics Chart Toggle & Chart Display */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
              Fleet Delivery Analytics &amp; JS Charts
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowCharts((v) => !v)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
          >
            {showCharts ? 'Hide Charts ▲' : 'Show Charts ▼'}
          </button>
        </div>

        {showCharts && <CargoMasterChart containers={items} />}
      </div>

      {/* Master Table Container */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden space-y-4">
        {/* Table Toolbar */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">Cargo Master Fleet Table</h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[11px]">
                  {filteredData.length} records
                </span>
                {apiStats && (
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                      apiStats.status === 'invalid_key'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : (apiStats.remainingCalls ?? apiStats.requests_available ?? 0) < 50
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : (apiStats.remainingCalls ?? apiStats.requests_available ?? 0) < 150
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                    title={
                      apiStats.status === 'invalid_key'
                        ? `JSONCargo API Key Error: ${apiStats.error || 'Key invalid or rejected by JSONCargo'}`
                        : `JSONCargo Carrier API Quota: ${apiStats.usedCalls ?? apiStats.requests_made ?? 0} used / ${apiStats.totalCalls ?? apiStats.requests_total ?? 1000} total (Plan: ${apiStats.plan || 'Standard'})`
                    }
                  >
                    <Zap className={`w-3 h-3 ${apiStats.status === 'invalid_key' ? 'text-rose-500' : 'text-amber-500 fill-amber-400'}`} />
                    <span>
                      {apiStats.status === 'invalid_key'
                        ? '0 API Syncs Left (Key Error)'
                        : `${apiStats.remainingCalls ?? apiStats.requests_available ?? 0} API Syncs Left`}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage carrier actual container numbers, shipping lines, China departure, and delivery turnaround dates.
              </p>
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-center">
              {/* Master Logistics Toggle (Carrier No, Line, Source, Dest, Status) */}
              <button
                type="button"
                onClick={handleToggleAllLogistics}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm border ${
                  isLogisticsRevealed
                    ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-950'
                }`}
                title="Carrier container number, shipping line, source, destination, and current status are hidden by default. Click to toggle."
              >
                {isLogisticsRevealed ? (
                  <>
                    <EyeOff className="w-4 h-4 text-amber-700" />
                    <span>Hide Logistics (5 Columns)</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-amber-400" />
                    <span>Click to Reveal Logistics (Carrier, Line, Source, Dest, Status)</span>
                  </>
                )}
              </button>

              {/* Dual Download Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => exportToExcel(false)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs transition flex items-center space-x-1 shadow-xs"
                  title="Download active container list matching current filter"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Active List</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportToExcel(true)}
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-xl font-bold text-xs transition flex items-center space-x-1 shadow-xs"
                  title="Download all ETA bucket lists in separate Excel sheets (Within 2 Days, 2-7d, 7-15d, >15d, Late, Delivered)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download All Buckets (.xlsx)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => dispatch(fetchCargoFleet())}
                disabled={loading}
                className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition"
                title="Refresh fleet"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Bar: 5 ETA Tracking Buckets + Carrier Dropdown + Search */}
          <div className="flex flex-col gap-3 pt-2">
            {/* ETA Tracking Buckets Console */}
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600 overflow-x-auto border border-slate-200 shadow-2xs">
              {[
                { id: 'all', label: 'All Containers', count: bucketCounts.all, badgeClass: 'bg-slate-200 text-slate-800' },
                { id: 'within-2-days', label: '⚡ 1 to 2 Days (Today)', count: bucketCounts.within2Days, badgeClass: 'bg-amber-200 text-amber-900' },
                { id: '2-to-7-days', label: '🚢 2 to 7 Days', count: bucketCounts.twoToSeven, badgeClass: 'bg-blue-200 text-blue-900' },
                { id: '7-to-15-days', label: '🌊 7 to 15 Days', count: bucketCounts.sevenToFifteen, badgeClass: 'bg-indigo-200 text-indigo-900' },
                { id: 'more-than-15-days', label: '🌐 > 15 Days', count: bucketCounts.moreThanFifteen, badgeClass: 'bg-purple-200 text-purple-900' },
                { id: 'late', label: '🚨 Late Containers', count: bucketCounts.late, badgeClass: 'bg-rose-200 text-rose-900' },
                { id: 'delivered', label: '✓ Delivered', count: bucketCounts.delivered, badgeClass: 'bg-emerald-200 text-emerald-900' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => dispatch(setStatusFilter(tab.id as any))}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center space-x-1.5 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm font-black ring-2 ring-blue-500'
                      : 'hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${tab.badgeClass}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              {/* Shipping Line Dropdown Filter */}
              <select
                value={carrierFilter}
                onChange={(e) => dispatch(setCarrierFilter(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
              >
                <option value="ALL">All Shipping Lines</option>
                {carrierOptions.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>

              {/* Instant Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => dispatch(setSearchTerm(e.target.value))}
                  placeholder="Search container / carrier / line..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Sensitive Columns Toggle Bar (Hidden by Default) */}
          <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-200 text-xs">
            <div className="flex items-center space-x-1 text-slate-500 font-bold uppercase text-[10px] tracking-wider shrink-0">
              <Lock className="w-3 h-3 text-amber-600" />
              <span>Hidden by default:</span>
            </div>

            <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(columnVisibility.containerNumber)}
                onChange={(e) =>
                  setColumnVisibility((prev) => ({ ...prev, containerNumber: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
              />
              <span className="font-semibold text-slate-700">Carrier Container</span>
            </label>

            <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(columnVisibility.shippingLine)}
                onChange={(e) =>
                  setColumnVisibility((prev) => ({ ...prev, shippingLine: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
              />
              <span className="font-semibold text-slate-700">Shipping Line</span>
            </label>

            <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(columnVisibility.shippedFrom)}
                onChange={(e) =>
                  setColumnVisibility((prev) => ({ ...prev, shippedFrom: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
              />
              <span className="font-semibold text-slate-700">Source (Origin)</span>
            </label>

            <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(columnVisibility.shippedTo)}
                onChange={(e) =>
                  setColumnVisibility((prev) => ({ ...prev, shippedTo: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
              />
              <span className="font-semibold text-slate-700">Destination</span>
            </label>

            <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(columnVisibility.status)}
                onChange={(e) =>
                  setColumnVisibility((prev) => ({ ...prev, status: e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
              />
              <span className="font-semibold text-slate-700">Current Status</span>
            </label>
          </div>
        </div>

        {/* TanStack Table Element */}
        <div className="overflow-x-auto">
          {loading && items.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-semibold">Loading Cargo Master Table...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Truck className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No matching containers found</p>
              <p className="text-xs">Try adjusting your filters or search keywords</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="bg-slate-100/90 text-slate-700 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200"
                  >
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="py-3 px-4">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <span>
              Showing Page <strong>{table.getState().pagination.pageIndex + 1}</strong> of{' '}
              <strong>{table.getPageCount() || 1}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>Total {filteredData.length} records</span>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="px-2 py-1 border border-slate-200 rounded-lg bg-white font-medium text-xs text-slate-800"
            >
              {[10, 15, 25, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  Show {pageSize} rows
                </option>
              ))}
            </select>

            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition"
            >
              Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
