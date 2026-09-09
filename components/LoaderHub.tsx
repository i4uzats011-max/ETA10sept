'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchWarehouseReceipts,
  fetchLoadingPlans,
  createLoadingPlan,
  allocateReceiptSplit,
  deallocateItem,
  finalizeAndAllotContainer,
  markContainerDelivered,
  setSelectedWarehouse,
  setStatusFilter,
  setSearchTerm,
  setActivePlan,
  openSplitModal,
  closeSplitModal,
  openAllotModal,
  closeAllotModal,
  clearActionMessage,
  WarehouseReceiptItem,
  LoadingPlanItem,
} from '@/store/loadingPlanSlice';
import {
  Warehouse,
  Boxes,
  Truck,
  Plus,
  Split,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  RefreshCw,
  X,
  Package,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Trash2,
  Layers,
  MapPin,
  Calendar,
  Anchor,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatGlobalDate } from '@/lib/dateUtils';
import { translateCommodity, translatePackaging, translateWarehouse, translateMark } from '@/lib/translate';

const SHIPPING_CARRIERS = [
  'MSC',
  'MAERSK',
  'CMA_CGM',
  'HAPAG_LLOYD',
  'COSCO',
  'ONE',
  'EVERGREEN',
  'YANG_MING',
  'HMM',
  'ZIM',
  'PIL',
];

const DEFAULT_CHINA_WAREHOUSES = [
  'ALL',
  'Guangzhou Warehouse',
  'Yiwu Warehouse',
  'Ningbo Warehouse',
  'Shenzhen Warehouse',
  'Shanghai Warehouse',
  'Keqiao Warehouse',
];

export default function LoaderHub() {
  const dispatch = useAppDispatch();
  const {
    warehouseReceipts,
    loadingPlans,
    loading,
    error,
    selectedWarehouse,
    statusFilter,
    searchTerm,
    activePlan,
    isSplitModalOpen,
    activeReceiptForSplit,
    targetContainerForSplit,
    isAllotModalOpen,
    activePlanForAllot,
    actionLoading,
    actionMessage,
  } = useAppSelector((state) => state.loadingPlan);

  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'plans'>('stock');

  // Local state for Create Plan modal
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [newPlanAlias, setNewPlanAlias] = useState('');
  const [newPlanWarehouse, setNewPlanWarehouse] = useState('Guangzhou Warehouse');

  // Local state for Split modal inputs
  const [selectedPlanForAllocation, setSelectedPlanForAllocation] = useState('');
  const [splitQuantityInput, setSplitQuantityInput] = useState<number | ''>('');
  const [splitWeightInput, setSplitWeightInput] = useState('');
  const [splitVolumeInput, setSplitVolumeInput] = useState('');

  // Local state for Allot modal inputs
  const [actualContainerNoInput, setActualContainerNoInput] = useState('');
  const [allotCarrierInput, setAllotCarrierInput] = useState('MSC');
  const [loadingDateInput, setLoadingDateInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('Nhava Sheva / Mundra, India');
  const [autoSyncEtaChecked, setAutoSyncEtaChecked] = useState(true);

  // Local state for Inward Goods Receipt (Direct Entry from Party)
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveReceipt, setReceiveReceipt] = useState('');
  const [receiveParty, setReceiveParty] = useState('');
  const [receiveWarehouse, setReceiveWarehouse] = useState('Guangzhou Warehouse');
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiveQuantity, setReceiveQuantity] = useState<number | ''>('');
  const [receiveCommodity, setReceiveCommodity] = useState('');
  const [receiveWeight, setReceiveWeight] = useState('');
  const [receiveVolume, setReceiveVolume] = useState('');
  const [receiveMainMark, setReceiveMainMark] = useState('');
  const [receiveSubMark, setReceiveSubMark] = useState('');

  // Local state for Mark Delivered modal
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [planToDeliver, setPlanToDeliver] = useState<LoadingPlanItem | null>(null);
  const [deliveryDateInput, setDeliveryDateInput] = useState(new Date().toISOString().split('T')[0]);

  // Local state for Chinese Excel Import Modal
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelUploadWarehouse, setExcelUploadWarehouse] = useState('Guangzhou Warehouse');
  const [excelPreviewRows, setExcelPreviewRows] = useState<any[]>([]);
  const [excelTotalRows, setExcelTotalRows] = useState(0);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [excelUploadStatus, setExcelUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live translation of commodity entered in Chinese
  const liveTranslation = useMemo(() => {
    return translateCommodity(receiveCommodity);
  }, [receiveCommodity]);

  // Initial load
  useEffect(() => {
    dispatch(fetchWarehouseReceipts());
    dispatch(fetchLoadingPlans());
  }, [dispatch]);

  // Available warehouse list dynamically aggregated from receipts + defaults
  const availableWarehouses = useMemo(() => {
    const set = new Set<string>(DEFAULT_CHINA_WAREHOUSES);
    warehouseReceipts.forEach((r) => {
      if (r.warehouse) set.add(r.warehouse);
    });
    return Array.from(set);
  }, [warehouseReceipts]);

  // Filtered Warehouse Stock
  const filteredReceipts = useMemo(() => {
    return warehouseReceipts.filter((r) => {
      // Warehouse filter
      if (selectedWarehouse !== 'ALL' && r.warehouse?.toLowerCase() !== selectedWarehouse.toLowerCase()) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const matchReceipt = r.receipt?.toLowerCase().includes(s);
        const matchCommodity = r.commodity?.toLowerCase().includes(s);
        const matchChinese = r.chinese?.toLowerCase().includes(s);
        const matchEnglish = r.english?.toLowerCase().includes(s);
        const matchMainMark = r.mainMarka?.toLowerCase().includes(s);
        const matchSubMark = r.subMarka?.toLowerCase().includes(s);
        if (!matchReceipt && !matchCommodity && !matchChinese && !matchEnglish && !matchMainMark && !matchSubMark) {
          return false;
        }
      }
      return true;
    });
  }, [warehouseReceipts, selectedWarehouse, statusFilter, searchTerm]);

  // Stock summary metrics
  const metrics = useMemo(() => {
    let totalInward = 0;
    let totalLoaded = 0;
    let totalRemaining = 0;
    warehouseReceipts.forEach((r) => {
      totalInward += r.quantity || 0;
      totalLoaded += r.loadedQuantity || 0;
      totalRemaining += r.remainingQuantity !== undefined ? r.remainingQuantity : (r.quantity || 0) - (r.loadedQuantity || 0);
    });
    return {
      receiptCount: warehouseReceipts.length,
      totalInward,
      totalLoaded,
      totalRemaining,
      planCount: loadingPlans.length,
    };
  }, [warehouseReceipts, loadingPlans]);

  // Handle open split modal
  const handleOpenSplit = (receipt: WarehouseReceiptItem) => {
    dispatch(openSplitModal({ receipt, targetContainer: targetContainerForSplit }));
    const avail = receipt.remainingQuantity !== undefined ? receipt.remainingQuantity : receipt.quantity - (receipt.loadedQuantity || 0);
    setSplitQuantityInput(avail > 0 ? avail : 1);
    setSplitWeightInput('');
    setSplitVolumeInput('');
    if (loadingPlans.length > 0 && !selectedPlanForAllocation) {
      setSelectedPlanForAllocation(loadingPlans[0].container);
    }
  };

  // Submit split & load
  const handleConfirmSplitAndLoad = async () => {
    if (!activeReceiptForSplit || !selectedPlanForAllocation) return;
    const qty = Number(splitQuantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity greater than 0');
      return;
    }

    const res = await dispatch(
      allocateReceiptSplit({
        receipt: activeReceiptForSplit.receipt,
        container: selectedPlanForAllocation,
        quantityToLoad: qty,
        weightToLoad: splitWeightInput,
        volumeToLoad: splitVolumeInput,
      })
    );

    if (allocateReceiptSplit.fulfilled.match(res)) {
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
    }
  };

  // Submit create loading plan
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanAlias.trim()) return;

    const res = await dispatch(
      createLoadingPlan({
        container: newPlanAlias.trim().toUpperCase(),
        warehouse: newPlanWarehouse,
      })
    );

    if (createLoadingPlan.fulfilled.match(res)) {
      setNewPlanAlias('');
      setIsCreatePlanOpen(false);
      dispatch(fetchLoadingPlans());
    }
  };

  // Open Allot Modal
  const handleOpenAllotModal = (plan: LoadingPlanItem) => {
    dispatch(openAllotModal(plan));
    setActualContainerNoInput(plan.containerNumber || '');
    setAllotCarrierInput(plan.shippingLine || 'MSC');
    setLoadingDateInput(plan.loadingDate || new Date().toISOString().split('T')[0]);
    setDestinationInput(plan.shippedTo || 'Nhava Sheva / Mundra, India');
  };

  // Submit Allot Actual Container
  const handleConfirmAllotContainer = async () => {
    if (!activePlanForAllot) return;
    if (!actualContainerNoInput.trim()) {
      alert('Please enter the actual carrier container number (e.g. MSCU1234567)');
      return;
    }

    const res = await dispatch(
      finalizeAndAllotContainer({
        container: activePlanForAllot.container,
        containerNumber: actualContainerNoInput.trim().toUpperCase(),
        shippingLine: allotCarrierInput,
        loadingDate: loadingDateInput,
        shippedTo: destinationInput,
        autoSync: autoSyncEtaChecked,
      })
    );

    if (finalizeAndAllotContainer.fulfilled.match(res)) {
      dispatch(fetchLoadingPlans());
    }
  };

  // Submit Inward Goods Receipt (Direct Entry from Party)
  const handleReceiveGoodsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveReceipt.trim()) {
      alert('Receipt number is required');
      return;
    }
    const qty = Number(receiveQuantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid positive quantity');
      return;
    }

    try {
      const res = await fetch('/api/warehouse/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: receiveReceipt.trim(),
          party: receiveParty.trim() || 'General Party',
          warehouse: receiveWarehouse,
          date: receiveDate,
          quantity: qty,
          commodity: receiveCommodity.trim() || liveTranslation.english,
          chinese: liveTranslation.chinese,
          english: liveTranslation.english,
          weight: receiveWeight.trim(),
          volume: receiveVolume.trim(),
          mainMarka: receiveMainMark.trim(),
          subMarka: receiveSubMark.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record received goods');

      setIsReceiveModalOpen(false);
      setReceiveReceipt('');
      setReceiveParty('');
      setReceiveCommodity('');
      setReceiveQuantity('');
      setReceiveWeight('');
      setReceiveVolume('');
      setReceiveMainMark('');
      setReceiveSubMark('');
      dispatch(fetchWarehouseReceipts());
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Open Deliver Modal
  const handleOpenDeliverModal = (plan: LoadingPlanItem) => {
    setPlanToDeliver(plan);
    setDeliveryDateInput(plan.deliveryDate || new Date().toISOString().split('T')[0]);
    setIsDeliverModalOpen(true);
  };

  // Confirm Mark Delivered
  const handleConfirmDeliver = async () => {
    if (!planToDeliver) return;
    const res = await dispatch(
      markContainerDelivered({
        container: planToDeliver.container,
        deliveryDate: deliveryDateInput,
      })
    );

    if (markContainerDelivered.fulfilled.match(res)) {
      setIsDeliverModalOpen(false);
      setPlanToDeliver(null);
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
    }
  };

  // Chinese Excel File Select & Live Translation Preview
  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setExcelUploadStatus(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setExcelTotalRows(rows.length);

      // Generate preview for first 5 rows with live translation
      const preview = rows.slice(0, 5).map((row, idx) => {
        const rKey = Object.keys(row).find((k) => /receipt|单号|收据|单据/i.test(k));
        const pKey = Object.keys(row).find((k) => /party|客户|货主|shipper|发货人/i.test(k));
        const cKey = Object.keys(row).find((k) => /commodity|品名|货物|goods|item|中文|货名/i.test(k));
        const qKey = Object.keys(row).find((k) => /qty|quantity|件数|数量|箱数|件/i.test(k));
        const pkgKey = Object.keys(row).find((k) => /pack|pkg|包装/i.test(k));
        const whKey = Object.keys(row).find((k) => /warehouse|仓库|仓位/i.test(k));

        const rawComm = cKey ? String(row[cKey] || '') : '';
        const trans = translateCommodity(rawComm);
        const rawPkg = pkgKey ? String(row[pkgKey] || '') : '';
        const transPkg = translatePackaging(rawPkg);
        const rawWh = whKey ? String(row[whKey] || '') : '';
        const transWh = translateWarehouse(rawWh);

        return {
          idx: idx + 1,
          receipt: rKey ? String(row[rKey] || '') : `Auto-REC-${idx + 1}`,
          party: pKey ? String(row[pKey] || '') : 'General Party',
          chineseCommodity: rawComm,
          englishCommodity: trans.english,
          qty: qKey ? String(row[qKey] || '') : '1',
          packaging: transPkg,
          warehouse: transWh,
        };
      });

      setExcelPreviewRows(preview);
    } catch (err: any) {
      setExcelUploadStatus({ type: 'error', message: err?.message || 'Failed to read Excel file' });
    }
  };

  // Upload and Ingest Chinese Excel into DB
  const handleConfirmExcelUpload = async () => {
    if (!excelFile) return;
    setIsUploadingExcel(true);
    setExcelUploadStatus(null);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      formData.append('warehouse', excelUploadWarehouse);
      formData.append('mode', 'append');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload Excel file');
      }

      setExcelUploadStatus({
        type: 'success',
        message: data.message || `Successfully imported and translated records into China Warehouse Stock!`,
      });

      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());

      setTimeout(() => {
        setIsExcelUploadOpen(false);
        setExcelFile(null);
        setExcelPreviewRows([]);
        setExcelTotalRows(0);
        setExcelUploadStatus(null);
      }, 1500);
    } catch (err: any) {
      setExcelUploadStatus({ type: 'error', message: err?.message || 'Upload error' });
    } finally {
      setIsUploadingExcel(false);
    }
  };

  // Deallocate item
  const handleDeallocateItem = async (shipmentId: string) => {
    if (!confirm('Are you sure you want to remove this item from the container and return the quantity to warehouse stock?')) {
      return;
    }
    const res = await dispatch(deallocateItem({ shipmentId }));
    if (deallocateItem.fulfilled.match(res)) {
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner & Action Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-sm transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-red-50 border border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center space-x-3">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="text-sm font-semibold">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => dispatch(clearActionMessage())}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Cards Header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Inward Receipts</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.receiptCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Across China Warehouses</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Cartons Inward</span>
            <Boxes className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-900">{metrics.totalInward} <span className="text-xs font-semibold text-slate-400">CTN</span></div>
          <div className="text-[11px] text-slate-400 mt-1">Gross Inward Volume</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Loaded in Containers</span>
            <Truck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{metrics.totalLoaded} <span className="text-xs font-semibold text-slate-400">CTN</span></div>
          <div className="text-[11px] text-slate-400 mt-1">Allocated to Plans</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Remaining Stock</span>
            <Warehouse className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{metrics.totalRemaining} <span className="text-xs font-semibold text-slate-400">CTN</span></div>
          <div className="text-[11px] text-slate-400 mt-1">Awaiting Container Loading</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Active Loading Plans</span>
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-900">{metrics.planCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Internal Containers</div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSubTab('stock')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'stock'
                ? 'bg-red-600 text-white shadow-md shadow-red-200'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Warehouse className="w-4 h-4" />
            <span>1. China Warehouse Stock ({filteredReceipts.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('plans')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'plans'
                ? 'bg-red-600 text-white shadow-md shadow-red-200'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>2. Loading Plans & Allotments ({loadingPlans.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              dispatch(fetchWarehouseReceipts());
              dispatch(fetchLoadingPlans());
            }}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsExcelUploadOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-200" />
            <span>Import Chinese Excel</span>
          </button>

          <button
            onClick={() => setIsReceiveModalOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4 text-emerald-200" />
            <span>Receive Goods (China WH)</span>
          </button>

          <button
            onClick={() => setIsCreatePlanOpen(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4 text-red-400" />
            <span>New Loading Plan</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CHINA WAREHOUSE INWARD STOCK */}
      {activeSubTab === 'stock' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Warehouse Filter */}
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedWarehouse}
                  onChange={(e) => dispatch(setSelectedWarehouse(e.target.value))}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {availableWarehouses.map((w) => (
                    <option key={w} value={w}>
                      {w === 'ALL' ? 'All China Warehouses' : w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-1">
                {(['all', 'Received', 'Partially Loaded', 'Fully Loaded'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => dispatch(setStatusFilter(st))}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statusFilter === st
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st === 'all' ? 'All Status' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Receipt, Commodity, Marka..."
                value={searchTerm}
                onChange={(e) => dispatch(setSearchTerm(e.target.value))}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Receipts Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-3">Party / Shipper</th>
                    <th className="py-3 px-3">Warehouse</th>
                    <th className="py-3 px-3">Received Date</th>
                    <th className="py-3 px-3 text-center">Total Inward</th>
                    <th className="py-3 px-3 text-center">Loaded</th>
                    <th className="py-3 px-3 text-center">Remaining Stock</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Commodity / Chinese</th>
                    <th className="py-3 px-3">Marks</th>
                    <th className="py-3 px-4 text-right">Loader Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 italic">
                        No warehouse receipts matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((r) => {
                      const avail = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
                      const isComplete = avail === 0;

                      return (
                        <tr key={r._id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                            {r.receipt}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {r.party || 'General Party'}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            <span className="inline-flex items-center space-x-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>{r.warehouse || 'China Warehouse'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                            {formatGlobalDate(r.date) || r.date || 'N/A'}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-800">
                            {r.quantity} CTN
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-emerald-600">
                            {r.loadedQuantity || 0} CTN
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                                avail > 0
                                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {avail} CTN
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                r.status === 'Fully Loaded'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.status === 'Partially Loaded'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {r.status === 'Fully Loaded' && <CheckCircle2 className="w-2.5 h-2.5" />}
                              {r.status === 'Partially Loaded' && <Split className="w-2.5 h-2.5" />}
                              {r.status === 'Received' && <Clock className="w-2.5 h-2.5" />}
                              <span>{r.status}</span>
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[200px] truncate" title={r.english || r.commodity || ''}>
                            <div className="truncate font-semibold">{r.english || r.commodity || 'General Goods'}</div>
                            {r.chinese && <div className="text-[10px] text-slate-400 truncate">{r.chinese}</div>}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                            {[r.mainMarka ? `M:${r.mainMarka}` : '', r.subMarka ? `S:${r.subMarka}` : '']
                              .filter(Boolean)
                              .join(' ') || '-'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenSplit(r)}
                              disabled={isComplete}
                              className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-bold transition shadow-sm ${
                                isComplete
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                              }`}
                            >
                              <Split className="w-3.5 h-3.5" />
                              <span>Split & Load</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: LOADING PLANS & INTERNAL CONTAINERS */}
      {activeSubTab === 'plans' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loadingPlans.map((plan) => {
              const isSelected = activePlan?.container === plan.container;
              return (
                <div
                  key={plan.container}
                  onClick={() => dispatch(setActivePlan(plan))}
                  className={`bg-white rounded-2xl border p-5 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-black text-sm">
                        {plan.container.slice(0, 3)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-900 font-mono">{plan.container}</h4>
                        <span className="text-[11px] text-slate-400">{plan.warehouse || 'China Warehouse'}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        plan.isFinalized
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {plan.isFinalized ? 'Finalized' : 'Planning'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Actual Carrier No:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {plan.containerNumber ? (
                          <span className="text-red-600">{plan.containerNumber} ({plan.shippingLine})</span>
                        ) : (
                          <span className="text-slate-400 italic">Not Allotted Yet</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Cartons:</span>
                      <span className="font-bold text-slate-900">{plan.totalQuantity || 0} CTN</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Shipments Loaded:</span>
                      <span className="font-bold text-slate-900">{plan.shipmentCount || 0} items</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Loading Date:</span>
                      <span className="font-semibold text-slate-800">
                        {formatGlobalDate(plan.loadingDate) || plan.loadingDate || 'Pending'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Destination:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[160px]" title={plan.shippedTo || 'Nhava Sheva / Mundra, India'}>
                        {plan.shippedTo || 'Nhava Sheva / Mundra, India'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Carrier ETA:</span>
                      <span className="font-bold text-emerald-700">{formatGlobalDate(plan.eta) || plan.eta || 'Pending'}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-slate-400">Status:</span>
                      {plan.isDelivered ? (
                        <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-black">
                          DELIVERED ({formatGlobalDate(plan.deliveryDate) || plan.deliveryDate || 'Done'}{plan.daysToDeliver !== null && plan.daysToDeliver !== undefined ? ` • ${plan.daysToDeliver}d` : ''})
                        </span>
                      ) : (
                        <span className="text-slate-800 font-bold">{plan.status || 'Pending'}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAllotModal(plan);
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Anchor className="w-3 h-3 text-red-400" />
                      <span>{plan.containerNumber ? 'Edit Actual No' : 'Allot Actual No'}</span>
                    </button>

                    {plan.containerNumber && !plan.isDelivered && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeliverModal(plan);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-200" />
                        <span>Mark Delivered</span>
                      </button>
                    )}

                    <button
                      onClick={() => dispatch(setActivePlan(plan))}
                      className="text-xs font-bold text-red-600 hover:underline inline-flex items-center space-x-0.5 ml-auto"
                    >
                      <span>Manifest</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Selected Plan Manifest */}
          {activePlan && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-black text-slate-900 font-mono">
                      Manifest for {activePlan.container}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                        activePlan.isDelivered
                          ? 'bg-emerald-100 text-emerald-800'
                          : activePlan.isFinalized
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {activePlan.isDelivered ? 'Delivered' : activePlan.isFinalized ? 'Finalized Plan' : 'In Planning'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Origin Warehouse: {activePlan.warehouse || 'China Warehouse'} | Loaded Cargo: {activePlan.totalQuantity || 0} CTN across {activePlan.shipmentCount || 0} items | Destination: {activePlan.shippedTo || 'Nhava Sheva / Mundra, India'}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenAllotModal(activePlan)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
                  >
                    <Anchor className="w-4 h-4" />
                    <span>{activePlan.containerNumber ? 'Update Actual Carrier No' : 'Finalize & Allot Actual Container'}</span>
                  </button>
                  {activePlan.containerNumber && !activePlan.isDelivered && (
                    <button
                      onClick={() => handleOpenDeliverModal(activePlan)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Mark Delivered</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Receipt #</th>
                      <th className="py-2.5 px-3">Party / Shipper</th>
                      <th className="py-2.5 px-3 text-center">Loaded Qty</th>
                      <th className="py-2.5 px-3 text-center">Split Status</th>
                      <th className="py-2.5 px-3">Commodity</th>
                      <th className="py-2.5 px-3">Marks</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {!activePlan.items || activePlan.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                          No cargo allocated into this container yet. Go to the "China Warehouse Stock" tab to split & load items.
                        </td>
                      </tr>
                    ) : (
                      activePlan.items.map((item, idx) => (
                        <tr key={item._id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold font-mono text-slate-900">
                            {item.receipt}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {item.party || 'General Party'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-emerald-600">
                            {item.quantity} CTN
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.isSplit ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                <Split className="w-2.5 h-2.5" />
                                <span>Split Part #{item.splitIndex || 1} (of {item.originalTotalQuantity} CTN)</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Full Load</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <span className="font-semibold">{item.english || item.commodity || 'Cargo'}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {[item.mainMarka ? `M:${item.mainMarka}` : '', item.subMarka ? `S:${item.subMarka}` : '']
                              .filter(Boolean)
                              .join(' ') || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleDeallocateItem(item._id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                              title="Remove item and return quantity to warehouse stock"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: QUANTITY SPLITTING & LOADING MODAL */}
      {isSplitModalOpen && activeReceiptForSplit && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Split className="w-5 h-5 text-red-500" />
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Split & Load Cargo into Container
                </h3>
              </div>
              <button
                onClick={() => dispatch(closeSplitModal())}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Receipt Summary Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Receipt #</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{activeReceiptForSplit.receipt}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">China Warehouse</span>
                  <span className="font-bold text-slate-700 text-xs">{activeReceiptForSplit.warehouse || 'China Warehouse'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Commodity</span>
                  <span className="font-semibold text-slate-800 text-xs truncate max-w-[220px]">
                    {activeReceiptForSplit.english || activeReceiptForSplit.commodity}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Total Inward: <strong className="text-slate-900">{activeReceiptForSplit.quantity} CTN</strong></span>
                  <span className="text-emerald-600 font-bold">Remaining Available: {activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity - (activeReceiptForSplit.loadedQuantity || 0)} CTN</span>
                </div>
              </div>

              {/* Target Loading Plan Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Select Target Loading Plan / Internal Container
                </label>
                {loadingPlans.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    No loading plans exist yet. Please create a loading plan first.
                  </div>
                ) : (
                  <select
                    value={selectedPlanForAllocation}
                    onChange={(e) => setSelectedPlanForAllocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {loadingPlans.map((p) => (
                      <option key={p.container} value={p.container}>
                        {p.container} ({p.warehouse || 'China WH'}) — {p.totalQuantity || 0} CTN currently loaded
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quantity to Load (Split) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Quantity to Load in this Container (CTN)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Max: {activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity}
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity}
                  value={splitQuantityInput}
                  onChange={(e) => setSplitQuantityInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Enter cartons quantity to load"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  You can split this receipt across as many containers as needed. The remaining balance stays in warehouse stock.
                </p>
              </div>

              {/* Optional Weight & Volume */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Weight (KG)</label>
                  <input
                    type="text"
                    value={splitWeightInput}
                    onChange={(e) => setSplitWeightInput(e.target.value)}
                    placeholder="e.g. 250"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Volume (CBM)</label>
                  <input
                    type="text"
                    value={splitVolumeInput}
                    onChange={(e) => setSplitVolumeInput(e.target.value)}
                    placeholder="e.g. 3.5"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => dispatch(closeSplitModal())}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSplitAndLoad}
                  disabled={actionLoading || !selectedPlanForAllocation}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {actionLoading ? (
                    <span>Allocating...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Load into Container</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ALLOT ACTUAL CONTAINER MODAL */}
      {isAllotModalOpen && activePlanForAllot && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Anchor className="w-5 h-5 text-red-500" />
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Finalize & Allot Actual Container
                </h3>
              </div>
              <button
                onClick={() => dispatch(closeAllotModal())}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Loading Plan:</span>
                  <span className="font-mono font-bold text-slate-900">{activePlanForAllot.container}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Origin Warehouse:</span>
                  <span className="font-bold text-slate-700">{activePlanForAllot.warehouse || 'China Warehouse'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Cargo Count:</span>
                  <span className="font-bold text-emerald-600">{activePlanForAllot.totalQuantity || 0} Cartons ({activePlanForAllot.shipmentCount || 0} lines)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Actual Carrier Container Number
                </label>
                <input
                  type="text"
                  value={actualContainerNoInput}
                  onChange={(e) => setActualContainerNoInput(e.target.value.toUpperCase())}
                  placeholder="e.g. MSCU1234567"
                  className="w-full px-3 py-2 font-mono text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter the real ISO carrier container number provided by the shipping line.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Shipping Carrier / Line
                </label>
                <select
                  value={allotCarrierInput}
                  onChange={(e) => setAllotCarrierInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {SHIPPING_CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Container Loading Date
                </label>
                <input
                  type="date"
                  value={loadingDateInput}
                  onChange={(e) => setLoadingDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Destination Port / Location
                </label>
                <input
                  type="text"
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  placeholder="e.g. Nhava Sheva / Mundra, India"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="autoSyncEta"
                  checked={autoSyncEtaChecked}
                  onChange={(e) => setAutoSyncEtaChecked(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-0"
                />
                <label htmlFor="autoSyncEta" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Auto-fetch live carrier ETA via JSONCargo API immediately
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => dispatch(closeAllotModal())}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAllotContainer}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {actionLoading ? (
                    <span>Allotting & Syncing...</span>
                  ) : (
                    <>
                      <Anchor className="w-4 h-4" />
                      <span>Confirm & Finalize Plan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE LOADING PLAN (INTERNAL CONTAINER) */}
      {isCreatePlanOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Plus className="w-5 h-5 text-red-500" />
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Create New Loading Plan
                </h3>
              </div>
              <button
                onClick={() => setIsCreatePlanOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Plan / Internal Container Alias
                </label>
                <input
                  type="text"
                  value={newPlanAlias}
                  onChange={(e) => setNewPlanAlias(e.target.value.toUpperCase())}
                  placeholder="e.g. USI-05 or LP-2026-01"
                  required
                  className="w-full px-3 py-2 font-mono text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  This internal alias is visible to loaders during planning and to public customers for tracking.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  China Origin Loading Warehouse
                </label>
                <select
                  value={newPlanWarehouse}
                  onChange={(e) => setNewPlanWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {availableWarehouses
                    .filter((w) => w !== 'ALL')
                    .map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatePlanOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionLoading || !newPlanAlias.trim()}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {actionLoading ? <span>Creating...</span> : <span>Initialize Loading Plan</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RECEIVE GOODS FROM PARTY (CHINA WAREHOUSE INWARD) */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center space-x-2.5">
                <Package className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">
                    Receive Goods from Party
                  </h3>
                  <p className="text-[11px] text-slate-400">China Warehouse Inward Stock Entry</p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReceiveGoodsSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Receipt # (Unique)*
                  </label>
                  <input
                    type="text"
                    value={receiveReceipt}
                    onChange={(e) => setReceiveReceipt(e.target.value.toUpperCase())}
                    placeholder="e.g. REC-8801"
                    required
                    className="w-full px-3 py-2 font-mono text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Party / Shipper Name*
                  </label>
                  <input
                    type="text"
                    value={receiveParty}
                    onChange={(e) => setReceiveParty(e.target.value)}
                    placeholder="e.g. Yiwu Star Trading / Alex"
                    required
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    China Warehouse
                  </label>
                  <select
                    value={receiveWarehouse}
                    onChange={(e) => setReceiveWarehouse(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {availableWarehouses
                      .filter((w) => w !== 'ALL')
                      .map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Receipt Date
                  </label>
                  <input
                    type="date"
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Quantity / Cartons (CTN)*
                </label>
                <input
                  type="number"
                  min={1}
                  value={receiveQuantity}
                  onChange={(e) => setReceiveQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Total packages received e.g. 100"
                  required
                  className="w-full px-3 py-2 font-mono text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Chinese Commodity with Live Translation */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Commodity Name (Chinese or English)
                </label>
                <input
                  type="text"
                  value={receiveCommodity}
                  onChange={(e) => setReceiveCommodity(e.target.value)}
                  placeholder="e.g. 运动鞋 (Sports Shoes) or 箱包 (Bags)"
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                {receiveCommodity.trim() && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center justify-between">
                    <span className="text-emerald-800 font-medium">
                      Auto English Translation: <strong>{liveTranslation.english}</strong>
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-full">
                      Translated
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Weight (KG)</label>
                  <input
                    type="text"
                    value={receiveWeight}
                    onChange={(e) => setReceiveWeight(e.target.value)}
                    placeholder="e.g. 1200"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Volume (CBM)</label>
                  <input
                    type="text"
                    value={receiveVolume}
                    onChange={(e) => setReceiveVolume(e.target.value)}
                    placeholder="e.g. 8.4"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Main Mark (Marka)</label>
                  <input
                    type="text"
                    value={receiveMainMark}
                    onChange={(e) => setReceiveMainMark(e.target.value)}
                    placeholder="e.g. USI / DEL"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Sub Mark</label>
                  <input
                    type="text"
                    value={receiveSubMark}
                    onChange={(e) => setReceiveSubMark(e.target.value)}
                    placeholder="e.g. 1-100"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionLoading || !receiveReceipt.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Inward Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: MARK DELIVERED MODAL */}
      {isDeliverModalOpen && planToDeliver && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm uppercase tracking-wider">
                  Mark Container Delivered
                </h3>
              </div>
              <button
                onClick={() => setIsDeliverModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Container Plan:</span>
                  <span className="font-mono font-bold text-slate-900">{planToDeliver.container}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Carrier Container:</span>
                  <span className="font-mono font-bold text-red-600">{planToDeliver.containerNumber || 'N/A'} ({planToDeliver.shippingLine})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Destination:</span>
                  <span className="font-bold text-slate-700">{planToDeliver.shippedTo || 'Nhava Sheva / Mundra, India'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Loaded Cargo:</span>
                  <span className="font-bold text-slate-900">{planToDeliver.totalQuantity || 0} CTN ({planToDeliver.shipmentCount || 0} shipments)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Loading Date:</span>
                  <span className="font-bold text-slate-700">{formatGlobalDate(planToDeliver.loadingDate) || planToDeliver.loadingDate || 'N/A'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Actual Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDateInput}
                  onChange={(e) => setDeliveryDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Marking as delivered will calculate transit turnaround days and update tracking status across public tracking and admin views.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeliverModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDeliver}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {actionLoading ? (
                    <span>Updating...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Delivery</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: IMPORT CHINESE EXCEL / CSV WITH LIVE TRANSLATION */}
      {isExcelUploadOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">
                    Upload China Warehouse Excel / CSV
                  </h3>
                  <p className="text-[11px] text-indigo-200">
                    Auto-Translates Chinese Commodity, Packaging & Warehouse Words into English
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsExcelUploadOpen(false);
                  setExcelFile(null);
                  setExcelPreviewRows([]);
                  setExcelUploadStatus(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Feedback Alert */}
              {excelUploadStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                    excelUploadStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {excelUploadStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{excelUploadStatus.message}</span>
                </div>
              )}

              {/* Target Warehouse Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Target China Warehouse (Default if missing in sheet)
                </label>
                <select
                  value={excelUploadWarehouse}
                  onChange={(e) => setExcelUploadWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {availableWarehouses
                    .filter((w) => w !== 'ALL')
                    .map((wh) => (
                      <option key={wh} value={wh}>
                        {wh}
                      </option>
                    ))}
                </select>
              </div>

              {/* File Dropzone */}
              {!excelFile ? (
                <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition bg-indigo-50/30 hover:bg-indigo-50/60 relative group">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleExcelFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Choose or Drop Chinese Warehouse File (.xlsx / .xls / .csv)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Supports pure Chinese headers (如: 单号, 客户, 品名, 件数, 包装, 仓库, 唛头)
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      ✓ Instant Chinese-to-English translation before saving
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Selected File Bar */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center space-x-2 truncate">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">{excelFile.name}</span>
                      <span className="text-slate-400 font-mono">({excelTotalRows} records)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExcelFile(null);
                        setExcelPreviewRows([]);
                        setExcelUploadStatus(null);
                      }}
                      className="text-red-500 hover:underline font-bold text-[11px] ml-2 shrink-0"
                    >
                      Change File
                    </button>
                  </div>

                  {/* Live Translation Preview */}
                  {excelPreviewRows.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Live Translation Preview (First {excelPreviewRows.length} rows):
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Chinese ➔ Clean English
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white text-xs shadow-inner">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="p-2">Receipt</th>
                              <th className="p-2">Party</th>
                              <th className="p-2">Original Chinese</th>
                              <th className="p-2 text-emerald-800 bg-emerald-50/50">Translated English</th>
                              <th className="p-2">Qty / Pkg</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px]">
                            {excelPreviewRows.map((r) => (
                              <tr key={r.idx} className="hover:bg-slate-50">
                                <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {r.receipt}
                                </td>
                                <td className="p-2 text-slate-600 whitespace-nowrap">{r.party}</td>
                                <td className="p-2 font-medium text-slate-500 max-w-[120px] truncate">
                                  {r.chineseCommodity || '—'}
                                </td>
                                <td className="p-2 font-bold text-emerald-800 bg-emerald-50/30 max-w-[180px] truncate">
                                  {r.englishCommodity}
                                </td>
                                <td className="p-2 whitespace-nowrap text-slate-600">
                                  <strong>{r.qty}</strong> {r.packaging}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                {excelTotalRows > 0 ? `${excelTotalRows} receipts will be added to China WH Stock` : 'Select a file to begin'}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsExcelUploadOpen(false);
                    setExcelFile(null);
                    setExcelPreviewRows([]);
                    setExcelUploadStatus(null);
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExcelUpload}
                  disabled={!excelFile || isUploadingExcel}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isUploadingExcel ? (
                    <span>Translating & Ingesting...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Translate & Save in DB</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
