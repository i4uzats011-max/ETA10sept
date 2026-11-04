'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Filter,
  CheckCircle2,
  Trash2,
  Edit3,
  PlusCircle,
  Clock,
  User as UserIcon,
  Shield,
  Layers,
  ChevronDown,
  ChevronRight,
  Database,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export interface EditLogItem {
  _id: string;
  username: string;
  role: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId: string;
  description: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

export default function EditLogViewer() {
  const [logs, setLogs] = useState<EditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      params.set('limit', '150');
      if (selectedAction !== 'ALL') params.set('action', selectedAction);
      if (selectedEntity !== 'ALL') params.set('entityType', selectedEntity);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/admin/edit-logs?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load edit logs');
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err: any) {
      console.error('Error fetching edit logs:', err);
      setError(err?.message || 'Failed to load edit logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAction, selectedEntity, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  // Distinct entity types present in logs
  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.entityType) set.add(l.entityType);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Counts
  const counts = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    logs.forEach((l) => {
      if (l.action === 'CREATE') creates++;
      else if (l.action === 'UPDATE') updates++;
      else if (l.action === 'DELETE') deletes++;
    });
    return { total: logs.length, creates, updates, deletes };
  }, [logs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <PlusCircle className="w-3 h-3 mr-1 text-emerald-600" />
            CREATE
          </span>
        );
      case 'UPDATE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Edit3 className="w-3 h-3 mr-1 text-blue-600" />
            UPDATE
          </span>
        );
      case 'DELETE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <Trash2 className="w-3 h-3 mr-1 text-rose-600" />
            DELETE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
            {action}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    const r = (role || '').toLowerCase();
    let bg = 'bg-slate-100 text-slate-700 border-slate-200';
    if (r === 'developer') bg = 'bg-purple-100 text-purple-800 border-purple-200';
    else if (r === 'admin') bg = 'bg-indigo-100 text-indigo-800 border-indigo-200';
    else if (r === 'staff') bg = 'bg-cyan-100 text-cyan-800 border-cyan-200';
    else if (r === 'biller') bg = 'bg-amber-100 text-amber-800 border-amber-200';
    else if (r === 'dispatcher') bg = 'bg-emerald-100 text-emerald-800 border-emerald-200';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border ${bg}`}>
        {role || 'user'}
      </span>
    );
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── HEADER ── */}
      <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                User Edit Logs & Audit Trail
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Live Audit Active
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every user CUD (Create, Update, Delete) operation is permanently marked with user credentials, IP, and timestamp.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh Logs
          </button>
        </div>
      </div>

      {/* ── METRIC TILES ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/70 border-b border-slate-200">
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Recorded Logs</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{counts.total}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Creates (C)</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{counts.creates}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-blue-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Updates (U)</div>
          <div className="text-xl font-extrabold text-blue-700 mt-1">{counts.updates}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-rose-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Deletions (D)</div>
          <div className="text-xl font-extrabold text-rose-700 mt-1">{counts.deletes}</div>
        </div>
      </div>

      {/* ── FILTER CONTROLS ── */}
      <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by username, entity ID (e.g. USSI-139), or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
          />
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Action:</span>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        {/* Entity Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Entity:</span>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="px-2.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Entities</option>
            <option value="Container">Container</option>
            <option value="Shipment">Shipment</option>
            <option value="Bill">Bill</option>
            <option value="WarehouseReceipt">WarehouseReceipt</option>
            <option value="Warehouse">Warehouse</option>
            <option value="User">User</option>
            <option value="ShippingLine">ShippingLine</option>
            <option value="MarkaAddress">MarkaAddress</option>
            <option value="Seller">Seller</option>
            <option value="ItemHsn">ItemHsn</option>
            {entityTypes
              .filter(
                (et) =>
                  ![
                    'Container',
                    'Shipment',
                    'Bill',
                    'WarehouseReceipt',
                    'Warehouse',
                    'User',
                    'ShippingLine',
                    'MarkaAddress',
                    'Seller',
                    'ItemHsn',
                  ].includes(et)
              )
              .map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* ── ERROR ALERT ── */}
      {error && (
        <div className="p-4 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── LOGS TABLE ── */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">Loading edit logs from database...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No edit logs found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchTerm || selectedAction !== 'ALL' || selectedEntity !== 'ALL'
                ? 'Try clearing your search filters to view recorded logs.'
                : 'Future Create, Update, or Delete operations made by users will appear here automatically.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp (IST)</th>
                <th className="py-3 px-4">User & Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Entity ID</th>
                <th className="py-3 px-4">Change Description</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log._id;
                const hasDetails = log.details && Object.keys(log.details).length > 0;

                return (
                  <React.Fragment key={log._id}>
                    <tr
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        isExpanded ? 'bg-indigo-50/30' : ''
                      }`}
                      onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] uppercase">
                            {log.username ? log.username.slice(0, 2) : 'US'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-tight">
                              {log.username || 'System'}
                            </div>
                            <div className="mt-0.5">{getRoleBadge(log.role)}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-700">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-mono border border-slate-200">
                          {log.entityType}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-800 font-bold max-w-[150px] truncate" title={log.entityId}>
                        {log.entityId || 'N/A'}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-medium max-w-[320px] truncate" title={log.description}>
                        {log.description}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hasDetails ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedLogId(isExpanded ? null : log._id);
                            }}
                            className="inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                          >
                            {isExpanded ? (
                              <>
                                <span>Hide</span>
                                <ChevronDown className="w-3 h-3 ml-1" />
                              </>
                            ) : (
                              <>
                                <span>View</span>
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-t border-b border-indigo-100">
                        <td colSpan={7} className="p-4">
                          <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-2xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                              <div className="text-[11px] font-bold text-slate-700 flex items-center space-x-1.5">
                                <Database className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Detailed Audit Snapshot</span>
                              </div>
                              <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-mono">
                                {log.ip && <span>IP: {log.ip}</span>}
                                {log.userAgent && (
                                  <span className="max-w-[200px] truncate" title={log.userAgent}>
                                    Device: {log.userAgent}
                                  </span>
                                )}
                              </div>
                            </div>
                            <pre className="text-[11px] font-mono text-slate-800 bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto max-h-60">
                              {JSON.stringify(log.details || {}, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing <span className="font-bold text-slate-700">{logs.length}</span> audit trail records
        </div>
        <div className="text-[11px] text-slate-400 font-medium">
          Zero-API Mode • Database Audit Log Trail Active
        </div>
      </div>
    </div>
  );
}
