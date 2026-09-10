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
  deleteWarehouseReceipt,
  bulkDeleteWarehouseReceipts,
  bulkEditWarehouseReceipts,
  editSingleWarehouseReceipt,
  setSelectedWarehouse,
  setStatusFilter,
  setSearchTerm,
  setActivePlan,
  openSplitModal,
  closeSplitModal,
  openAllotModal,
  closeAllotModal,
  clearActionMessage,
  demapActualContainer,
  alterContainer,
  deleteLoadingPlan,
  deleteWarehouse,
  updateWarehouse,
  unloadContainer,
  fetchUploadHistory,
  deleteUploadBatch,
  WarehouseReceiptItem,
  LoadingPlanItem,
  UploadHistoryItem,
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
  ArrowDownLeft,
  ShieldCheck,
  ChevronRight,
  Trash2,
  Layers,
  MapPin,
  Calendar,
  Anchor,
  FileSpreadsheet,
  Upload,
  Pencil,
  CheckSquare,
  Square,
  Check,
  SlidersHorizontal,
  History,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
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

// No hardcoded warehouses; user creates and manages China warehouses dynamically
const DEFAULT_CHINA_WAREHOUSES: string[] = ['ALL'];

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
    uploadHistory,
    uploadHistoryLoading,
  } = useAppSelector((state) => state.loadingPlan);

  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'plans' | 'uploads'>('stock');

  // Local state for Create Plan modal
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [newPlanAlias, setNewPlanAlias] = useState('');
  const [newPlanWarehouse, setNewPlanWarehouse] = useState('');

  // Local state for Split modal inputs
  const [selectedPlanForAllocation, setSelectedPlanForAllocation] = useState('');
  const [splitQuantityInput, setSplitQuantityInput] = useState<number | ''>('');
  const [splitWeightInput, setSplitWeightInput] = useState('');
  const [splitVolumeInput, setSplitVolumeInput] = useState('');

  // Local state for Allot modal inputs
  const [allotSelectedContainer, setAllotSelectedContainer] = useState('');
  const [actualContainerNoInput, setActualContainerNoInput] = useState('');
  const [allotCarrierInput, setAllotCarrierInput] = useState('MSC');
  const [loadingDateInput, setLoadingDateInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('Nhava Sheva / Mundra, India');
  const [autoSyncEtaChecked, setAutoSyncEtaChecked] = useState(true);

  // Local state for Inward Goods Receipt (Direct Entry from Party)
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveReceipt, setReceiveReceipt] = useState('');
  const [receiveParty, setReceiveParty] = useState('');
  const [receiveWarehouse, setReceiveWarehouse] = useState('');
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiveQuantity, setReceiveQuantity] = useState<number | ''>('');
  const [receiveCommodity, setReceiveCommodity] = useState('');
  const [receiveWeight, setReceiveWeight] = useState('');
  const [receiveVolume, setReceiveVolume] = useState('');
  const [receiveMainMark, setReceiveMainMark] = useState('');
  const [receiveSubMark, setReceiveSubMark] = useState('');
  const [receivePackaging, setReceivePackaging] = useState('Carton');
  const [receiveWarehouseEntry, setReceiveWarehouseEntry] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveAssignToPlan, setReceiveAssignToPlan] = useState(false);
  const [receiveLoadingPlan, setReceiveLoadingPlan] = useState('');
  const [isReceivingGoods, setIsReceivingGoods] = useState(false);

  // Local state for Alter / Rename Container Database-Wide
  const [isAlterContainerOpen, setIsAlterContainerOpen] = useState(false);
  const [containerToAlter, setContainerToAlter] = useState<LoadingPlanItem | null>(null);
  const [alterContainerAlias, setAlterContainerAlias] = useState('');
  const [alterActualNumber, setAlterActualNumber] = useState('');
  const [alterShippingLine, setAlterShippingLine] = useState('MSC');
  const [alterWarehouse, setAlterWarehouse] = useState('');
  const [alterLoadingDate, setAlterLoadingDate] = useState('');
  const [alterShippedTo, setAlterShippedTo] = useState('Nhava Sheva / Mundra, India');
  const [alterAutoSync, setAlterAutoSync] = useState(true);
  const [alterEtaBufferDays, setAlterEtaBufferDays] = useState<number>(10);
  const [isSubmittingAlter, setIsSubmittingAlter] = useState(false);

  // Local state for Container-Wise Cargo Loading (Container-wise planning only)
  const [isContainerWiseLoadOpen, setIsContainerWiseLoadOpen] = useState(false);
  const [containerWisePlan, setContainerWisePlan] = useState<LoadingPlanItem | null>(null);
  const [containerWiseReceiptId, setContainerWiseReceiptId] = useState('');
  const [containerWiseQuantity, setContainerWiseQuantity] = useState<number | ''>('');
  const [containerWiseWeight, setContainerWiseWeight] = useState('');
  const [containerWiseVolume, setContainerWiseVolume] = useState('');
  const [isContainerWiseLoading, setIsContainerWiseLoading] = useState(false);

  // Local state for Mark Delivered modal
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [planToDeliver, setPlanToDeliver] = useState<LoadingPlanItem | null>(null);
  const [deliveryDateInput, setDeliveryDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [excludedReceiptsForDelivery, setExcludedReceiptsForDelivery] = useState<Set<string>>(new Set());

  // Filter and Search for Loading Plans tab (including date-wise sorting for delivered)
  const [planFilterStatus, setPlanFilterStatus] = useState<'all' | 'active' | 'delivered'>('all');
  const [planSearchQuery, setPlanSearchQuery] = useState('');

  // Local state for Chinese Excel Import Modal
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [excelUploadType, setExcelUploadType] = useState<'stock' | 'plan'>('stock');
  const [excelTargetContainer, setExcelTargetContainer] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelUploadWarehouse, setExcelUploadWarehouse] = useState('');
  const [excelPreviewRows, setExcelPreviewRows] = useState<any[]>([]);
  const [excelTotalRows, setExcelTotalRows] = useState(0);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [excelUploadStatus, setExcelUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [excelUploadResult, setExcelUploadResult] = useState<{
    savedCount: number;
    duplicateCount: number;
    duplicates: Array<{ receipt: string; warehouse?: string; row?: number; reason: string }>;
    missingCount: number;
    missingDetails: Array<{ row: number; reason: string }>;
    uploadId?: string;
    message: string;
  } | null>(null);

  // Upload Tracking & Deletion History State
  const [uploadSearchTerm, setUploadSearchTerm] = useState('');
  const [uploadTypeFilter, setUploadTypeFilter] = useState<'all' | 'stock' | 'plan'>('all');
  const [selectedDuplicatesModal, setSelectedDuplicatesModal] = useState<UploadHistoryItem | null>(null);

  // Live Carrier API Lookup State for Loading Date & ETA
  const [isLookingUpApi, setIsLookingUpApi] = useState(false);
  const [apiLookupStatus, setApiLookupStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    loadingDate?: string;
  } | null>(null);
  const [isLookingUpAlterApi, setIsLookingUpAlterApi] = useState(false);
  const [alterApiLookupStatus, setAlterApiLookupStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    loadingDate?: string;
  } | null>(null);

  // Process-Wise Deletion & Unload States
  const [receiptToUnmarkAndDelete, setReceiptToUnmarkAndDelete] = useState<{
    receipt: WarehouseReceiptItem;
    containers: Array<{ container: string; containerNumber?: string; quantity: number; shippingLine?: string }>;
  } | null>(null);
  const [containerToUnloadAndDelete, setContainerToUnloadAndDelete] = useState<LoadingPlanItem | null>(null);
  const [containerToUnloadGoods, setContainerToUnloadGoods] = useState<LoadingPlanItem | null>(null);
  const [warehouseToDeleteWithReceipts, setWarehouseToDeleteWithReceipts] = useState<{
    warehouse: string;
    count: number;
  } | null>(null);
  const [isDeletingProcess, setIsDeletingProcess] = useState(false);

  // Edit Warehouse Mode (rename vs merge into existing warehouse)
  const [editWarehouseMode, setEditWarehouseMode] = useState<'rename' | 'merge'>('rename');
  const [editWarehouseTargetMerge, setEditWarehouseTargetMerge] = useState('');

  // Multi-Selection State for China Warehouse Stock
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(new Set());

  // Bulk Delete Modal State
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [forceBulkDelete, setForceBulkDelete] = useState(false);

  // Bulk Edit Modal State
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditWarehouse, setBulkEditWarehouse] = useState('');
  const [bulkEditParty, setBulkEditParty] = useState('');
  const [bulkEditDate, setBulkEditDate] = useState('');
  const [bulkEditPackaging, setBulkEditPackaging] = useState('');
  const [bulkEditCommodity, setBulkEditCommodity] = useState('');
  const [bulkEditMainMark, setBulkEditMainMark] = useState('');
  const [bulkEditSubMark, setBulkEditSubMark] = useState('');
  const [bulkEditNotes, setBulkEditNotes] = useState('');
  const [bulkFieldsToUpdate, setBulkFieldsToUpdate] = useState<Record<string, boolean>>({
    warehouse: false,
    party: false,
    date: false,
    packaging: false,
    commodity: false,
    marks: false,
    notes: false,
  });

  // Single Edit Modal State
  const [isSingleEditOpen, setIsSingleEditOpen] = useState(false);
  const [editingReceiptItem, setEditingReceiptItem] = useState<WarehouseReceiptItem | null>(null);
  const [editReceiptNumber, setEditReceiptNumber] = useState('');
  const [editParty, setEditParty] = useState('');
  const [singleEditWarehouse, setSingleEditWarehouse] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editQuantity, setEditQuantity] = useState<number | ''>('');
  const [editCommodity, setEditCommodity] = useState('');
  const [editPackaging, setEditPackaging] = useState('Carton');
  const [editMainMark, setEditMainMark] = useState('');
  const [editSubMark, setEditSubMark] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Dynamic China Warehouse Management
  const [dynamicWarehouses, setDynamicWarehouses] = useState<string[]>([]);
  const [isAddWarehouseModalOpen, setIsAddWarehouseModalOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseCity, setNewWarehouseCity] = useState('');
  const [newWarehouseCode, setNewWarehouseCode] = useState('');
  const [isCreatingWarehouse, setIsCreatingWarehouse] = useState(false);
  const [warehouseModalContext, setWarehouseModalContext] = useState<'filter' | 'receive' | 'plan' | 'excel' | 'alter' | 'bulkEdit' | 'singleEdit'>('filter');

  // Real-time duplicate receipt detection warehouse-wise
  const receiveReceiptDuplicate = useMemo(() => {
    if (!receiveReceipt.trim() || !receiveWarehouse.trim()) return null;
    const cleanRec = receiveReceipt.trim().toLowerCase();
    const cleanWh = receiveWarehouse.trim().toLowerCase();
    return warehouseReceipts.find(
      (r) => (r.receipt || '').trim().toLowerCase() === cleanRec && (r.warehouse || '').trim().toLowerCase() === cleanWh
    );
  }, [receiveReceipt, receiveWarehouse, warehouseReceipts]);

  const singleEditReceiptDuplicate = useMemo(() => {
    if (!editReceiptNumber.trim() || !singleEditWarehouse.trim() || !editingReceiptItem) return null;
    const cleanR = editReceiptNumber.trim().toLowerCase();
    const cleanW = singleEditWarehouse.trim().toLowerCase();
    const curId = String(editingReceiptItem._id || (editingReceiptItem as any).id || '');
    return warehouseReceipts.find(
      (r) =>
        (r.receipt || '').trim().toLowerCase() === cleanR &&
        (r.warehouse || '').trim().toLowerCase() === cleanW &&
        String(r._id || (r as any).id || '') !== curId
    );
  }, [editReceiptNumber, singleEditWarehouse, editingReceiptItem, warehouseReceipts]);

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouse');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.warehouses)) {
          setDynamicWarehouses(data.warehouses);
        }
      }
    } catch (err) {
      console.warn('Failed to load warehouses:', err);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    dispatch(fetchUploadHistory());
  }, [dispatch]);

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) {
      alert('Warehouse name is required');
      return;
    }
    setIsCreatingWarehouse(true);
    try {
      const res = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWarehouseName.trim(),
          city: newWarehouseCity.trim(),
          code: newWarehouseCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create warehouse');

      const createdName = data.warehouse?.name || newWarehouseName.trim();
      setDynamicWarehouses((prev) => Array.from(new Set([...prev, createdName])));

      if (warehouseModalContext === 'receive') {
        setReceiveWarehouse(createdName);
      } else if (warehouseModalContext === 'plan') {
        setNewPlanWarehouse(createdName);
      } else if (warehouseModalContext === 'excel') {
        setExcelUploadWarehouse(createdName);
      } else if (warehouseModalContext === 'alter') {
        setAlterWarehouse(createdName);
      } else if (warehouseModalContext === 'bulkEdit') {
        setBulkEditWarehouse(createdName);
      } else if (warehouseModalContext === 'singleEdit') {
        setSingleEditWarehouse(createdName);
      } else {
        dispatch(setSelectedWarehouse(createdName));
      }

      setNewWarehouseName('');
      setNewWarehouseCity('');
      setNewWarehouseCode('');
      setIsAddWarehouseModalOpen(false);
      fetchWarehouses();
    } catch (err: any) {
      alert(err.message || 'Failed to create warehouse');
    } finally {
      setIsCreatingWarehouse(false);
    }
  };

  // Delete Warehouse with Process-Wise Validation
  const handleDeleteWarehouse = async (targetWh?: string | React.MouseEvent) => {
    const whToDelete = typeof targetWh === 'string' && targetWh ? targetWh : selectedWarehouse;
    if (!whToDelete || whToDelete === 'ALL') {
      alert('Please select a specific warehouse to delete.');
      return;
    }

    const inWh = warehouseReceipts.filter((r) => (r.warehouse || '').toLowerCase() === whToDelete.toLowerCase());
    if (inWh.length > 0) {
      setWarehouseToDeleteWithReceipts({ warehouse: whToDelete, count: inWh.length });
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete warehouse '${whToDelete}'?\n\nThis warehouse currently has 0 receipts mapped to it.`
      )
    ) {
      return;
    }
    const res = await dispatch(deleteWarehouse({ name: whToDelete }));
    if (deleteWarehouse.fulfilled.match(res)) {
      alert(res.payload?.message || `Warehouse '${whToDelete}' deleted successfully.`);
      fetchWarehouses();
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
      if (isEditWarehouseOpen) setIsEditWarehouseOpen(false);
    } else {
      alert((res.payload as string) || `Cannot delete warehouse '${whToDelete}'.`);
    }
  };

  const handleConfirmDeleteWarehouseWithReceipts = async () => {
    if (!warehouseToDeleteWithReceipts) return;
    setIsDeletingProcess(true);
    try {
      const res = await dispatch(
        deleteWarehouse({ name: warehouseToDeleteWithReceipts.warehouse, deleteAllReceiptsFirst: true })
      );
      if (deleteWarehouse.fulfilled.match(res)) {
        alert(res.payload?.message || `Warehouse '${warehouseToDeleteWithReceipts.warehouse}' and its receipts deleted successfully.`);
        setWarehouseToDeleteWithReceipts(null);
        fetchWarehouses();
        dispatch(fetchWarehouseReceipts());
        dispatch(fetchLoadingPlans());
        if (isEditWarehouseOpen) setIsEditWarehouseOpen(false);
      } else {
        alert((res.payload as string) || 'Failed to delete warehouse.');
      }
    } finally {
      setIsDeletingProcess(false);
    }
  };

  // Edit / Rename / Merge Warehouse Handlers
  const [isEditWarehouseOpen, setIsEditWarehouseOpen] = useState(false);
  const [editWarehouseOldName, setEditWarehouseOldName] = useState('');
  const [editWarehouseNewName, setEditWarehouseNewName] = useState('');
  const [editWarehouseCity, setEditWarehouseCity] = useState('');
  const [editWarehouseCode, setEditWarehouseCode] = useState('');
  const [isSubmittingEditWarehouse, setIsSubmittingEditWarehouse] = useState(false);

  const handleOpenEditWarehouse = () => {
    if (!selectedWarehouse || selectedWarehouse === 'ALL') {
      alert('Please select a specific warehouse from the dropdown to edit its name.');
      return;
    }
    setEditWarehouseOldName(selectedWarehouse);
    setEditWarehouseNewName(selectedWarehouse);
    setEditWarehouseCity('');
    setEditWarehouseCode('');
    setEditWarehouseMode('rename');
    setEditWarehouseTargetMerge('');
    setIsEditWarehouseOpen(true);
  };

  const handleEditWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editWarehouseMode === 'merge') {
      if (!editWarehouseTargetMerge.trim()) {
        alert('Please select an existing warehouse to merge into.');
        return;
      }
      if (editWarehouseTargetMerge.trim().toLowerCase() === editWarehouseOldName.trim().toLowerCase()) {
        alert('Cannot merge warehouse into itself. Please select a different existing warehouse.');
        return;
      }
      if (
        !confirm(
          `Are you sure you want to merge '${editWarehouseOldName}' into '${editWarehouseTargetMerge}'?\n\nAll receipts, containers, and shipments mapped to '${editWarehouseOldName}' will be moved to '${editWarehouseTargetMerge}', and '${editWarehouseOldName}' will be removed.`
        )
      ) {
        return;
      }
      setIsSubmittingEditWarehouse(true);
      try {
        const res = await dispatch(
          updateWarehouse({
            oldName: editWarehouseOldName,
            newName: editWarehouseTargetMerge.trim(),
            mergeWithExisting: true,
          })
        );
        if (updateWarehouse.fulfilled.match(res)) {
          alert(res.payload?.message || `Warehouse merged into '${editWarehouseTargetMerge.trim()}' successfully.`);
          setIsEditWarehouseOpen(false);
          fetchWarehouses();
          dispatch(fetchWarehouseReceipts());
          dispatch(fetchLoadingPlans());
        } else {
          alert((res.payload as string) || 'Failed to merge warehouse');
        }
      } finally {
        setIsSubmittingEditWarehouse(false);
      }
      return;
    }

    // Rename mode
    if (!editWarehouseNewName.trim()) {
      alert('New warehouse name is required.');
      return;
    }
    setIsSubmittingEditWarehouse(true);
    try {
      const res = await dispatch(
        updateWarehouse({
          oldName: editWarehouseOldName,
          newName: editWarehouseNewName.trim(),
          city: editWarehouseCity.trim(),
          code: editWarehouseCode.trim(),
        })
      );
      if (updateWarehouse.fulfilled.match(res)) {
        alert(res.payload?.message || `Warehouse renamed to '${editWarehouseNewName.trim()}' successfully.`);
        setIsEditWarehouseOpen(false);
        fetchWarehouses();
        dispatch(fetchWarehouseReceipts());
        dispatch(fetchLoadingPlans());
      } else {
        alert((res.payload as string) || 'Failed to update warehouse');
      }
    } finally {
      setIsSubmittingEditWarehouse(false);
    }
  };

  // Manual Goods Received Entry Handler (Direct Form Input, Not Via Excel Uploading)
  const handleReceiveGoodsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
    if (userWhs.length === 0) {
      alert('Cannot enter received goods until at least one China warehouse is created. Please create a warehouse first.');
      setWarehouseModalContext('receive');
      setIsAddWarehouseModalOpen(true);
      return;
    }
    if (!receiveReceipt.trim()) {
      alert('Receipt number is strictly mandatory. Goods cannot be received without a receipt number (रिसीट नंबर अनिवार्य है).');
      return;
    }
    if (!receiveDate.trim()) {
      alert('Receipt date is strictly mandatory. Goods cannot be received without a receipt date (रिसीट डेट अनिवार्य है).');
      return;
    }
    if (!receiveWarehouse.trim() || receiveWarehouse === 'ALL') {
      alert('Please select a valid China warehouse.');
      return;
    }
    const qtyNum = typeof receiveQuantity === 'number' ? receiveQuantity : parseInt(String(receiveQuantity || 0), 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert('Quantity must be a positive number greater than 0');
      return;
    }

    if (receiveAssignToPlan && !receiveLoadingPlan.trim()) {
      alert('Loading Plan Number (Internal Container Number) is mandatory when loading goods into a plan.');
      return;
    }

    const cleanRec = receiveReceipt.trim().toLowerCase();
    const cleanWh = receiveWarehouse.trim().toLowerCase();
    const isDup = warehouseReceipts.some(
      (r) => (r.receipt || '').trim().toLowerCase() === cleanRec && (r.warehouse || '').trim().toLowerCase() === cleanWh
    );
    if (isDup) {
      alert(`Duplicate Receipt Error: Receipt #${receiveReceipt.trim()} already exists in warehouse '${receiveWarehouse.trim()}'.\n\nEvery warehouse must have strictly unique receipt numbers. Duplicate entries are rejected.`);
      return;
    }

    setIsReceivingGoods(true);
    try {
      const res = await fetch('/api/warehouse/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: receiveReceipt.trim(),
          party: receiveParty.trim(),
          warehouse: receiveWarehouse.trim(),
          date: receiveDate.trim(),
          warehouseEntry: receiveWarehouseEntry.trim(),
          quantity: qtyNum,
          commodity: receiveCommodity.trim(),
          packaging: receivePackaging.trim() || 'Carton',
          mainMarka: receiveMainMark.trim(),
          subMarka: receiveSubMark.trim(),
          weight: receiveWeight.trim(),
          volume: receiveVolume.trim(),
          notes: receiveNotes.trim(),
          loadIntoPlan: receiveAssignToPlan,
          loadingPlan: receiveAssignToPlan ? receiveLoadingPlan.trim().toUpperCase() : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save received goods');

      setIsReceiveModalOpen(false);
      setReceiveReceipt('');
      setReceiveParty('');
      setReceiveQuantity('');
      setReceiveCommodity('');
      setReceiveWeight('');
      setReceiveVolume('');
      setReceiveMainMark('');
      setReceiveSubMark('');
      setReceiveWarehouseEntry('');
      setReceiveNotes('');
      setReceiveAssignToPlan(false);
      setReceiveLoadingPlan('');
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
      alert(data.message || `Receipt '${receiveReceipt.trim()}' successfully recorded in ${receiveWarehouse}`);
    } catch (err: any) {
      alert(err.message || 'Failed to record received goods');
    } finally {
      setIsReceivingGoods(false);
    }
  };

  // Alter / Rename Container Database-Wide Handlers
  const handleOpenAlterModal = (plan: LoadingPlanItem) => {
    setContainerToAlter(plan);
    setAlterContainerAlias(plan.container);
    setAlterActualNumber(plan.containerNumber || '');
    setAlterShippingLine(plan.shippingLine || 'MSC');
    setAlterWarehouse(plan.warehouse || '');
    setAlterLoadingDate(plan.loadingDate || '');
    setAlterShippedTo(plan.shippedTo || 'Nhava Sheva / Mundra, India');
    setAlterEtaBufferDays(plan.etaBufferDays !== undefined ? plan.etaBufferDays : 10);
    setAlterAutoSync(true);
    setAlterApiLookupStatus(null);
    setIsLookingUpAlterApi(false);
    setIsAlterContainerOpen(true);
  };

  const handleAlterContainerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!containerToAlter) return;
    if (!alterContainerAlias.trim()) {
      alert('Container alias / identifier is required');
      return;
    }
    if (alterActualNumber.trim() && !alterLoadingDate.trim()) {
      alert('Loading Date is strictly mandatory when assigning an actual carrier container number.');
      return;
    }
    setIsSubmittingAlter(true);
    try {
      const res = await dispatch(
        alterContainer({
          oldContainer: containerToAlter.container,
          newContainer: alterContainerAlias.trim().toUpperCase(),
          containerNumber: alterActualNumber.trim(),
          shippingLine: alterShippingLine.trim(),
          warehouse: alterWarehouse.trim(),
          loadingDate: alterLoadingDate.trim(),
          shippedTo: alterShippedTo.trim(),
          autoSync: alterAutoSync,
          etaBufferDays: alterEtaBufferDays,
        })
      );
      if (alterContainer.fulfilled.match(res)) {
        setIsAlterContainerOpen(false);
        setContainerToAlter(null);
        dispatch(fetchLoadingPlans());
        dispatch(fetchWarehouseReceipts());
      }
    } finally {
      setIsSubmittingAlter(false);
    }
  };

  // De-map Actual Container from Plan Handler
  const handleDemapActual = async (plan: LoadingPlanItem) => {
    if (
      !confirm(
        `Are you sure you want to de-map carrier container '${plan.containerNumber}' from plan '${plan.container}'?\n\nThe container will be unallotted and return to Planning status.`
      )
    ) {
      return;
    }
    await dispatch(demapActualContainer({ container: plan.container }));
    dispatch(fetchLoadingPlans());
  };

  // Delete Loading Plan / Container Handler with Process Rule
  const handleDeletePlan = async (plan: LoadingPlanItem) => {
    if ((plan.shipmentCount && plan.shipmentCount > 0) || (plan.totalQuantity && plan.totalQuantity > 0)) {
      setContainerToUnloadAndDelete(plan);
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete container plan '${plan.container}'?\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }
    const res = await dispatch(deleteLoadingPlan({ container: plan.container }));
    if (deleteLoadingPlan.fulfilled.match(res)) {
      alert(res.payload?.message || `Container '${plan.container}' deleted successfully.`);
      dispatch(fetchLoadingPlans());
    } else {
      alert((res.payload as string) || `Failed to delete container '${plan.container}'.`);
    }
  };

  const handleConfirmUnloadAndDeleteContainer = async () => {
    if (!containerToUnloadAndDelete) return;
    setIsDeletingProcess(true);
    try {
      const res = await dispatch(
        deleteLoadingPlan({ container: containerToUnloadAndDelete.container, unloadFirst: true })
      );
      if (deleteLoadingPlan.fulfilled.match(res)) {
        alert(res.payload?.message || `Container '${containerToUnloadAndDelete.container}' unloaded and deleted.`);
        setContainerToUnloadAndDelete(null);
        dispatch(fetchLoadingPlans());
        dispatch(fetchWarehouseReceipts());
      } else {
        alert((res.payload as string) || 'Failed to delete container.');
      }
    } finally {
      setIsDeletingProcess(false);
    }
  };

  // Unload All Cargo items from container back to China Warehouse stock
  const handleUnloadAllCargo = async (plan: LoadingPlanItem) => {
    if (
      !confirm(
        `Are you sure you want to unload ALL cargo items from container '${plan.container}'?\n\nAll ${plan.totalQuantity || 0} cartons will be restored back to available China Warehouse stock. The container itself will remain active.`
      )
    ) {
      return;
    }
    const res = await dispatch(unloadContainer({ container: plan.container }));
    if (unloadContainer.fulfilled.match(res)) {
      alert(res.payload?.message || `All cargo unloaded from container '${plan.container}'.`);
      setContainerToUnloadGoods(null);
      dispatch(fetchLoadingPlans());
      dispatch(fetchWarehouseReceipts());
    } else {
      alert((res.payload as string) || 'Failed to unload cargo from container.');
    }
  };

  // Warehouse receipts that have remaining stock available to load container-wise
  const availableReceiptsWithStock = useMemo(() => {
    return warehouseReceipts.filter((r) => {
      const remaining = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
      return remaining > 0;
    });
  }, [warehouseReceipts]);

  // Currently selected receipt in Container-Wise load modal
  const selectedContainerWiseReceipt = useMemo(() => {
    if (!containerWiseReceiptId) return availableReceiptsWithStock[0] || null;
    return (
      availableReceiptsWithStock.find((r) => (r._id || r.receipt) === containerWiseReceiptId) ||
      availableReceiptsWithStock[0] ||
      null
    );
  }, [containerWiseReceiptId, availableReceiptsWithStock]);

  // Open Container-Wise Load Modal
  const handleOpenContainerWiseLoad = (plan: LoadingPlanItem) => {
    setContainerWisePlan(plan);
    const firstStock = availableReceiptsWithStock[0];
    if (firstStock) {
      setContainerWiseReceiptId(firstStock._id || firstStock.receipt);
      const rem =
        firstStock.remainingQuantity !== undefined
          ? firstStock.remainingQuantity
          : firstStock.quantity - (firstStock.loadedQuantity || 0);
      setContainerWiseQuantity(rem > 0 ? rem : '');
      setContainerWiseWeight(firstStock.weight || '');
      setContainerWiseVolume(firstStock.volume || '');
    } else {
      setContainerWiseReceiptId('');
      setContainerWiseQuantity('');
      setContainerWiseWeight('');
      setContainerWiseVolume('');
    }
    setIsContainerWiseLoadOpen(true);
  };

  // Submit Container-Wise Cargo Allocation
  const handleContainerWiseLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!containerWisePlan) return;
    if (!selectedContainerWiseReceipt) {
      alert('No received goods selected with available warehouse stock.');
      return;
    }
    const qtyNum =
      typeof containerWiseQuantity === 'number'
        ? containerWiseQuantity
        : parseInt(String(containerWiseQuantity || 0), 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert('Please enter a valid positive quantity greater than 0.');
      return;
    }
    const maxAvail =
      selectedContainerWiseReceipt.remainingQuantity !== undefined
        ? selectedContainerWiseReceipt.remainingQuantity
        : selectedContainerWiseReceipt.quantity - (selectedContainerWiseReceipt.loadedQuantity || 0);

    if (qtyNum > maxAvail) {
      alert(
        `Cannot load ${qtyNum} units: Exceeds received warehouse stock (${maxAvail} remaining). You cannot load more goods than received.`
      );
      return;
    }

    setIsContainerWiseLoading(true);
    try {
      const res = await dispatch(
        allocateReceiptSplit({
          receipt: selectedContainerWiseReceipt.receipt,
          container: containerWisePlan.container,
          quantityToLoad: qtyNum,
          weightToLoad: containerWiseWeight.trim(),
          volumeToLoad: containerWiseVolume.trim(),
        })
      );
      if (allocateReceiptSplit.fulfilled.match(res)) {
        setIsContainerWiseLoadOpen(false);
        setContainerWisePlan(null);
        dispatch(fetchLoadingPlans());
        dispatch(fetchWarehouseReceipts());
      }
    } finally {
      setIsContainerWiseLoading(false);
    }
  };

  // Live translation of commodity entered in Chinese
  const liveTranslation = useMemo(() => {
    return translateCommodity(receiveCommodity);
  }, [receiveCommodity]);

  // Initial load
  useEffect(() => {
    dispatch(fetchWarehouseReceipts());
    dispatch(fetchLoadingPlans());
  }, [dispatch]);

  // Available warehouse list dynamically aggregated from user-created warehouses (API) + existing receipts
  const availableWarehouses = useMemo(() => {
    const set = new Set<string>(['ALL']);
    dynamicWarehouses.forEach((w) => {
      if (w && typeof w === 'string' && w.trim()) set.add(w.trim());
    });
    warehouseReceipts.forEach((r) => {
      if (r.warehouse && typeof r.warehouse === 'string' && r.warehouse.trim()) {
        set.add(r.warehouse.trim());
      }
    });
    return Array.from(set);
  }, [warehouseReceipts, dynamicWarehouses]);

  // Synchronize initial selections to first user warehouse when available
  useEffect(() => {
    const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
    if (userWhs.length > 0) {
      const firstWh = userWhs[0];
      setNewPlanWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
      setReceiveWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
      setAlterWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
      setExcelUploadWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
      setBulkEditWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
      setSingleEditWarehouse((prev) => (prev && userWhs.includes(prev) ? prev : firstWh));
    }
  }, [availableWarehouses]);

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

  // Filtered and Date-Sorted Loading Plans (including dedicated view for Delivered containers)
  const filteredLoadingPlans = useMemo(() => {
    let list = [...loadingPlans];

    if (planFilterStatus === 'active') {
      list = list.filter((p) => !p.isDelivered && !(p.status && p.status.toLowerCase().includes('deliver')));
    } else if (planFilterStatus === 'delivered') {
      list = list.filter(
        (p) =>
          p.isDelivered ||
          (p.status &&
            (p.status.toLowerCase().includes('deliver') ||
              p.status.toLowerCase().includes('destination') ||
              p.status.toLowerCase().includes('arrived') ||
              p.status.toLowerCase().includes('reached')))
      );
      // Date-wise sorting (newest delivery/loading date first)
      list.sort((a, b) => {
        const dA = new Date(a.deliveryDate || a.loadingDate || 0).getTime();
        const dB = new Date(b.deliveryDate || b.loadingDate || 0).getTime();
        return dB - dA;
      });
    }

    if (planSearchQuery.trim()) {
      const q = planSearchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.container.toLowerCase().includes(q) ||
          (p.containerNumber || '').toLowerCase().includes(q) ||
          (p.warehouse || '').toLowerCase().includes(q) ||
          (p.shippingLine || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [loadingPlans, planFilterStatus, planSearchQuery]);

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

  // Delete Warehouse Receipt with Process Rule
  const handleDeleteReceipt = async (receiptItem: WarehouseReceiptItem) => {
    if (receiptItem.loadedQuantity && receiptItem.loadedQuantity > 0) {
      const loadedContainers: Array<{ container: string; containerNumber?: string; quantity: number; shippingLine?: string }> = [];
      for (const plan of loadingPlans) {
        const matching = plan.items?.filter((i) => i.receipt?.toLowerCase() === receiptItem.receipt.toLowerCase()) || [];
        for (const m of matching) {
          loadedContainers.push({
            container: plan.container,
            containerNumber: plan.containerNumber,
            quantity: Number(m.quantity) || 0,
            shippingLine: plan.shippingLine,
          });
        }
      }
      setReceiptToUnmarkAndDelete({ receipt: receiptItem, containers: loadedContainers });
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete receipt '${receiptItem.receipt}' from China warehouse stock?\n\nThis action cannot be undone.`
    );
    if (!confirmDelete) return;

    const res = await dispatch(deleteWarehouseReceipt({ id: receiptItem._id }));
    if (deleteWarehouseReceipt.fulfilled.match(res)) {
      alert(res.payload?.message || `Warehouse receipt '${receiptItem.receipt}' deleted successfully.`);
      dispatch(fetchWarehouseReceipts());
    } else {
      alert((res.payload as string) || `Failed to delete receipt '${receiptItem.receipt}'.`);
    }
  };

  const handleConfirmUnmarkAndDeleteReceipt = async () => {
    if (!receiptToUnmarkAndDelete) return;
    setIsDeletingProcess(true);
    try {
      const res = await dispatch(
        deleteWarehouseReceipt({ id: receiptToUnmarkAndDelete.receipt._id, unloadFirst: true })
      );
      if (deleteWarehouseReceipt.fulfilled.match(res)) {
        alert(res.payload?.message || `Receipt #${receiptToUnmarkAndDelete.receipt.receipt} unmarked from container(s) and deleted successfully.`);
        setReceiptToUnmarkAndDelete(null);
        dispatch(fetchWarehouseReceipts());
        dispatch(fetchLoadingPlans());
      } else {
        alert((res.payload as string) || 'Failed to delete receipt.');
      }
    } finally {
      setIsDeletingProcess(false);
    }
  };

  // Submit split & load with strict limits and warning confirmation
  const handleConfirmSplitAndLoad = async () => {
    if (!activeReceiptForSplit || !selectedPlanForAllocation) return;
    const qty = Number(splitQuantityInput);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity greater than 0');
      return;
    }

    const avail = activeReceiptForSplit.remainingQuantity !== undefined
      ? activeReceiptForSplit.remainingQuantity
      : activeReceiptForSplit.quantity - (activeReceiptForSplit.loadedQuantity || 0);

    // 1. Strict validation: Cannot load more than received/remaining in warehouse
    if (qty > avail) {
      alert(
        `ERROR: Cannot load ${qty} units!\n\nOnly ${avail} units remain in warehouse for receipt '${activeReceiptForSplit.receipt}' (Total received: ${activeReceiptForSplit.quantity}, Already loaded: ${activeReceiptForSplit.loadedQuantity || 0}).`
      );
      return;
    }

    // 2. Loading less quantity triggers split warning & user confirmation
    if (qty < avail) {
      const remainingAfter = avail - qty;
      const ok = window.confirm(
        `WARNING: Loading Less Goods (Split Cargo)\n\n` +
        `You are loading ${qty} units out of ${avail} available units for Receipt '${activeReceiptForSplit.receipt}'.\n\n` +
        `This will SPLIT the cargo. The remaining ${remainingAfter} units will stay in warehouse stock to be loaded into another container.\n\n` +
        `Do you confirm this split? Click OK to proceed.`
      );
      if (!ok) return;
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
    const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
    if (userWhs.length === 0) {
      alert('Cannot create loading plan until at least one China warehouse is created. Please create a warehouse first.');
      setWarehouseModalContext('plan');
      setIsAddWarehouseModalOpen(true);
      return;
    }
    if (!newPlanWarehouse.trim() || newPlanWarehouse === 'ALL') {
      alert('Please create and select a valid China warehouse.');
      return;
    }

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
  const handleOpenAllotModal = (plan?: LoadingPlanItem) => {
    const targetPlan = plan || (loadingPlans.length > 0 ? loadingPlans[0] : null);
    if (!targetPlan) {
      alert('No loading plans found in system. Please create a loading plan first.');
      return;
    }
    dispatch(openAllotModal(targetPlan));
    setAllotSelectedContainer(targetPlan.container);
    setActualContainerNoInput(targetPlan.containerNumber || '');
    setAllotCarrierInput(targetPlan.shippingLine || 'MSC');
    setLoadingDateInput(targetPlan.loadingDate || new Date().toISOString().split('T')[0]);
    setDestinationInput(targetPlan.shippedTo || 'Nhava Sheva / Mundra, India');
    setApiLookupStatus(null);
    setIsLookingUpApi(false);
  };

  // Live Carrier API Lookup for Allot Modal (Fetches Loading Date & Live ETA)
  const handleLookupAllotContainer = async () => {
    const contNo = actualContainerNoInput.trim().toUpperCase();
    if (!contNo) {
      alert('Please enter an actual carrier container number first (e.g. MSCU1234567)');
      return;
    }
    setIsLookingUpApi(true);
    setApiLookupStatus(null);
    try {
      const res = await fetch('/api/containers/sync-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerNumber: contNo,
          shippingLine: allotCarrierInput,
          lookupOnly: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.loadingDate) {
        setLoadingDateInput(data.loadingDate);
        if (data.shippedTo && (!destinationInput || destinationInput.includes('Nhava Sheva'))) {
          setDestinationInput(data.shippedTo);
        }
        setApiLookupStatus({
          type: 'success',
          message: `✓ Retrieved from Carrier API: Loading Date is ${data.loadingDate} (ETA: ${data.eta || 'N/A'}, Status: ${data.status})`,
          loadingDate: data.loadingDate,
        });
      } else if (data.success && !data.loadingDate) {
        setApiLookupStatus({
          type: 'warning',
          message: `Container found in API (${data.status}), but departure/loading date is pending in carrier system. Please enter the Loading Date manually below.`,
        });
      } else {
        setApiLookupStatus({
          type: 'warning',
          message: `Carrier API could not search container '${contNo}'. Please enter the Loading Date manually below.`,
        });
      }
    } catch (err: any) {
      setApiLookupStatus({
        type: 'warning',
        message: `API search could not reach carrier (${err?.message || 'Error'}). Please enter the Loading Date manually below.`,
      });
    } finally {
      setIsLookingUpApi(false);
    }
  };

  // Live Carrier API Lookup for Alter Modal
  const handleLookupAlterContainer = async () => {
    const contNo = alterActualNumber.trim().toUpperCase();
    if (!contNo) {
      alert('Please enter an actual carrier container number first (e.g. MSCU1234567)');
      return;
    }
    setIsLookingUpAlterApi(true);
    setAlterApiLookupStatus(null);
    try {
      const res = await fetch('/api/containers/sync-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerNumber: contNo,
          shippingLine: alterShippingLine,
          lookupOnly: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.loadingDate) {
        setAlterLoadingDate(data.loadingDate);
        if (data.shippedTo && (!alterShippedTo || alterShippedTo.includes('Nhava Sheva'))) {
          setAlterShippedTo(data.shippedTo);
        }
        setAlterApiLookupStatus({
          type: 'success',
          message: `✓ Retrieved from Carrier API: Loading Date is ${data.loadingDate} (ETA: ${data.eta || 'N/A'}, Status: ${data.status})`,
          loadingDate: data.loadingDate,
        });
      } else if (data.success && !data.loadingDate) {
        setAlterApiLookupStatus({
          type: 'warning',
          message: `Container found in API (${data.status}), but departure/loading date is pending in carrier system. Please enter the Loading Date manually below.`,
        });
      } else {
        setAlterApiLookupStatus({
          type: 'warning',
          message: `Carrier API could not search container '${contNo}'. Please enter the Loading Date manually below.`,
        });
      }
    } catch (err: any) {
      setAlterApiLookupStatus({
        type: 'warning',
        message: `API search could not reach carrier (${err?.message || 'Error'}). Please enter the Loading Date manually below.`,
      });
    } finally {
      setIsLookingUpAlterApi(false);
    }
  };

  // Submit Allot Actual Container
  const handleConfirmAllotContainer = async () => {
    const targetPlanContainer = allotSelectedContainer || activePlanForAllot?.container;
    if (!targetPlanContainer) {
      alert('Internal container selection is mandatory. Please select an internal container first.');
      return;
    }
    if (!actualContainerNoInput.trim()) {
      alert('Please enter the actual carrier container number (e.g. MSCU1234567)');
      return;
    }
    if (!loadingDateInput.trim()) {
      alert('Loading Date is strictly mandatory when allotting actual carrier container number.');
      return;
    }

    const res = await dispatch(
      finalizeAndAllotContainer({
        container: targetPlanContainer,
        containerNumber: actualContainerNoInput.trim().toUpperCase(),
        shippingLine: allotCarrierInput,
        loadingDate: loadingDateInput.trim(),
        shippedTo: destinationInput,
        autoSync: autoSyncEtaChecked,
      })
    );

    if (finalizeAndAllotContainer.fulfilled.match(res)) {
      dispatch(fetchLoadingPlans());
    }
  };

  // Open Deliver Modal
  const handleOpenDeliverModal = (plan: LoadingPlanItem) => {
    setPlanToDeliver(plan);
    setDeliveryDateInput(plan.deliveryDate || new Date().toISOString().split('T')[0]);
    setExcludedReceiptsForDelivery(new Set());
    setIsDeliverModalOpen(true);
  };

  // Confirm Mark Delivered
  const handleConfirmDeliver = async () => {
    if (!planToDeliver) return;
    if (!deliveryDateInput.trim()) {
      alert('Delivery Date is strictly mandatory when marking container delivered.');
      return;
    }
    const res = await dispatch(
      markContainerDelivered({
        container: planToDeliver.container,
        deliveryDate: deliveryDateInput.trim(),
        excludedReceipts: Array.from(excludedReceiptsForDelivery),
      })
    );

    if (markContainerDelivered.fulfilled.match(res)) {
      setIsDeliverModalOpen(false);
      setPlanToDeliver(null);
      setExcludedReceiptsForDelivery(new Set());
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

    const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
    if (userWhs.length === 0) {
      alert('No China warehouse found in system. You cannot upload goods or plans until at least one warehouse is created. Please create a warehouse first.');
      return;
    }

    if (!excelUploadWarehouse || excelUploadWarehouse.trim() === '' || excelUploadWarehouse === 'ALL') {
      alert('Selecting a China Warehouse is strictly mandatory while uploading. Please select or create a warehouse first.');
      return;
    }

    if (excelUploadType === 'plan' && !excelTargetContainer.trim()) {
      alert('Internal Loading Plan (Internal Container Number) is strictly mandatory when uploading a loading plan.');
      return;
    }

    setIsUploadingExcel(true);
    setExcelUploadStatus(null);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      formData.append('warehouse', excelUploadWarehouse);
      formData.append('mode', 'append');
      formData.append('uploadType', excelUploadType);
      if (excelUploadType === 'plan') {
        formData.append('targetContainer', excelTargetContainer.trim().toUpperCase());
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload Excel file');
      }

      // Handle split warning confirmation for planning list upload
      if (data.requiresConfirmation) {
        const splitCount = data.splitWarnings?.length || 0;
        const confirmMsg =
          `WARNING: Loading Less Goods (Split Cargo)\n\n` +
          `The uploaded planning list is loading less goods than received in warehouse for ${splitCount} receipt(s).\n` +
          `These receipts will be SPLIT across containers, and remaining stock will stay in China warehouse inventory.\n\n` +
          `Do you want to confirm splitting these goods? Click OK to proceed.`;
        const ok = window.confirm(confirmMsg);
        if (!ok) {
          setIsUploadingExcel(false);
          return;
        }

        // Re-submit with confirmSplit: true
        const confirmedFormData = new FormData();
        confirmedFormData.append('file', excelFile);
        confirmedFormData.append('warehouse', excelUploadWarehouse);
        confirmedFormData.append('mode', 'append');
        confirmedFormData.append('confirmSplit', 'true');
        confirmedFormData.append('uploadType', excelUploadType);
        if (excelUploadType === 'plan') {
          confirmedFormData.append('targetContainer', excelTargetContainer.trim().toUpperCase());
        }

        const confirmedRes = await fetch('/api/upload', {
          method: 'POST',
          body: confirmedFormData,
        });

        const confirmedData = await confirmedRes.json();
        if (!confirmedRes.ok) {
          throw new Error(confirmedData.error || 'Failed to upload Excel file');
        }

        dispatch(fetchWarehouseReceipts());
        dispatch(fetchLoadingPlans());
        dispatch(fetchUploadHistory());

        if ((confirmedData.duplicateCount && confirmedData.duplicateCount > 0) || (confirmedData.missingCount && confirmedData.missingCount > 0)) {
          setExcelUploadResult({
            savedCount: confirmedData.savedCount || 0,
            duplicateCount: confirmedData.duplicateCount || 0,
            duplicates: confirmedData.duplicates || [],
            missingCount: confirmedData.missingCount || 0,
            missingDetails: confirmedData.missingDetails || [],
            uploadId: confirmedData.uploadId,
            message: confirmedData.message || '',
          });
          setExcelUploadStatus({
            type: confirmedData.savedCount > 0 ? 'success' : 'error',
            message: confirmedData.message || 'Upload completed with duplicates / missing records.',
          });
          return;
        }

        setExcelUploadStatus({
          type: 'success',
          message: confirmedData.message || `Successfully processed and split loading plans!`,
        });

        setTimeout(() => {
          setIsExcelUploadOpen(false);
          setExcelFile(null);
          setExcelPreviewRows([]);
          setExcelTotalRows(0);
          setExcelUploadType('stock');
          setExcelTargetContainer('');
          setExcelUploadStatus(null);
          setExcelUploadResult(null);
        }, 1500);
        return;
      }

      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
      dispatch(fetchUploadHistory());

      if ((data.duplicateCount && data.duplicateCount > 0) || (data.missingCount && data.missingCount > 0)) {
        setExcelUploadResult({
          savedCount: data.savedCount || 0,
          duplicateCount: data.duplicateCount || 0,
          duplicates: data.duplicates || [],
          missingCount: data.missingCount || 0,
          missingDetails: data.missingDetails || [],
          uploadId: data.uploadId,
          message: data.message || '',
        });
        setExcelUploadStatus({
          type: data.savedCount > 0 ? 'success' : 'error',
          message: data.message || 'Upload completed with duplicates / missing records.',
        });
        return;
      }

      setExcelUploadStatus({
        type: 'success',
        message: data.message || `Successfully imported and translated records into China Warehouse Stock!`,
      });

      setTimeout(() => {
        setIsExcelUploadOpen(false);
        setExcelFile(null);
        setExcelPreviewRows([]);
        setExcelTotalRows(0);
        setExcelUploadType('stock');
        setExcelTargetContainer('');
        setExcelUploadStatus(null);
        setExcelUploadResult(null);
      }, 1500);
    } catch (err: any) {
      setExcelUploadStatus({ type: 'error', message: err?.message || 'Upload error' });
    } finally {
      setIsUploadingExcel(false);
    }
  };

  // Deallocate / Delete entry from container loading plan straightaway
  const handleDeallocateItem = async (shipmentId: string) => {
    if (!confirm('Delete entry from loading plan? This cargo entry will be deleted from the container plan immediately and returned to available warehouse stock.')) {
      return;
    }
    const res = await dispatch(deallocateItem({ shipmentId }));
    if (deallocateItem.fulfilled.match(res)) {
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
    }
  };

  // Selected Receipt Objects
  const selectedReceiptObjects = useMemo(() => {
    return warehouseReceipts.filter((r) => selectedReceiptIds.has(r._id || r.receipt));
  }, [warehouseReceipts, selectedReceiptIds]);

  const selectedWithLoadedCargo = useMemo(() => {
    return selectedReceiptObjects.filter((r) => r.loadedQuantity && r.loadedQuantity > 0);
  }, [selectedReceiptObjects]);

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedReceiptIds.size === filteredReceipts.length && filteredReceipts.length > 0) {
      setSelectedReceiptIds(new Set());
    } else {
      const allIds = new Set<string>();
      filteredReceipts.forEach((r) => allIds.add(r._id || r.receipt));
      setSelectedReceiptIds(allIds);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedReceiptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk Delete
  const handleBulkDeleteSubmit = async () => {
    const ids = Array.from(selectedReceiptIds);
    if (ids.length === 0) return;

    const res = await dispatch(
      bulkDeleteWarehouseReceipts({
        ids,
        force: forceBulkDelete,
      })
    );

    if (bulkDeleteWarehouseReceipts.fulfilled.match(res)) {
      setSelectedReceiptIds(new Set());
      setIsBulkDeleteOpen(false);
      setForceBulkDelete(false);
      dispatch(fetchWarehouseReceipts());
      dispatch(fetchLoadingPlans());
    }
  };

  // Bulk Edit
  const handleBulkEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Array.from(selectedReceiptIds);
    if (ids.length === 0) return;

    const updates: Partial<WarehouseReceiptItem> = {};
    if (bulkFieldsToUpdate.warehouse && bulkEditWarehouse) updates.warehouse = bulkEditWarehouse;
    if (bulkFieldsToUpdate.party && bulkEditParty) updates.party = bulkEditParty;
    if (bulkFieldsToUpdate.date && bulkEditDate) updates.date = bulkEditDate;
    if (bulkFieldsToUpdate.packaging && bulkEditPackaging) updates.packaging = bulkEditPackaging;
    if (bulkFieldsToUpdate.commodity && bulkEditCommodity) updates.commodity = bulkEditCommodity;
    if (bulkFieldsToUpdate.marks) {
      if (bulkEditMainMark !== undefined) updates.mainMarka = bulkEditMainMark;
      if (bulkEditSubMark !== undefined) updates.subMarka = bulkEditSubMark;
    }
    if (bulkFieldsToUpdate.notes && bulkEditNotes) updates.notes = bulkEditNotes;

    const selectedKeys = Object.entries(bulkFieldsToUpdate).filter(([_, v]) => v);
    if (selectedKeys.length === 0) {
      alert('Please check at least one field checkbox to apply bulk updates.');
      return;
    }

    const res = await dispatch(
      bulkEditWarehouseReceipts({
        ids,
        updates,
      })
    );

    if (bulkEditWarehouseReceipts.fulfilled.match(res)) {
      setSelectedReceiptIds(new Set());
      setIsBulkEditOpen(false);
      dispatch(fetchWarehouseReceipts());
    }
  };

  // Single Edit
  const handleOpenSingleEdit = (r: WarehouseReceiptItem) => {
    setEditingReceiptItem(r);
    setEditReceiptNumber(r.receipt);
    setEditParty(r.party || '');
    setSingleEditWarehouse(r.warehouse || '');
    setEditDate(r.date || '');
    setEditQuantity(r.quantity);
    setEditCommodity(r.chinese || r.english || r.commodity || '');
    setEditPackaging(r.packaging || 'Carton');
    setEditMainMark(r.mainMarka || '');
    setEditSubMark(r.subMarka || '');
    setEditWeight(r.weight || '');
    setEditVolume(r.volume || '');
    setEditNotes(r.notes || '');
    setIsSingleEditOpen(true);
  };

  const handleSingleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReceiptNumber.trim()) {
      alert('Receipt number is required');
      return;
    }

    const targetId = editingReceiptItem?._id || (editingReceiptItem as any)?.id;
    const cleanR = editReceiptNumber.trim().toLowerCase();
    const cleanW = singleEditWarehouse.trim().toLowerCase();
    const isDup = warehouseReceipts.some(
      (r) =>
        (r.receipt || '').trim().toLowerCase() === cleanR &&
        (r.warehouse || '').trim().toLowerCase() === cleanW &&
        String(r._id || (r as any).id || '') !== String(targetId)
    );
    if (isDup) {
      alert(`Duplicate Receipt Error: Receipt #${editReceiptNumber.trim()} already exists in warehouse '${singleEditWarehouse.trim()}'.\n\nEvery warehouse must have strictly unique receipt numbers. Duplicate entries are rejected.`);
      return;
    }

    const res = await dispatch(
      editSingleWarehouseReceipt({
        id: targetId,
        _id: targetId,
        receipt: editReceiptNumber.trim(),
        party: editParty.trim(),
        warehouse: singleEditWarehouse.trim(),
        date: editDate.trim(),
        quantity: typeof editQuantity === 'number' ? editQuantity : parseInt(String(editQuantity || 0), 10),
        commodity: editCommodity.trim(),
        packaging: editPackaging.trim(),
        mainMarka: editMainMark.trim(),
        subMarka: editSubMark.trim(),
        weight: editWeight.trim(),
        volume: editVolume.trim(),
        notes: editNotes.trim(),
      } as any)
    );

    if (editSingleWarehouseReceipt.fulfilled.match(res)) {
      alert(`Receipt #${editReceiptNumber.trim()} updated successfully.`);
      setIsSingleEditOpen(false);
      setEditingReceiptItem(null);
      dispatch(fetchWarehouseReceipts());
    } else {
      alert((res.payload as string) || 'Failed to update warehouse receipt');
    }
  };

  const [receiptSorting, setReceiptSorting] = useState<SortingState>([]);

  // TanStack Columns for China Warehouse Stock Receipts
  const receiptColumns = useMemo<ColumnDef<WarehouseReceiptItem>[]>(() => {
    return [
      {
        id: 'select',
        header: () => (
          <div className="text-center w-8">
            <input
              type="checkbox"
              checked={filteredReceipts.length > 0 && selectedReceiptIds.size === filteredReceipts.length}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded text-red-600 cursor-pointer accent-red-600"
              title="Select All"
            />
          </div>
        ),
        cell: ({ row }) => {
          const r = row.original;
          const isSelected = selectedReceiptIds.has(r._id || r.receipt);
          return (
            <div className="text-center w-8">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleSelectRow(r._id || r.receipt)}
                className="w-4 h-4 rounded text-red-600 cursor-pointer accent-red-600"
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'receipt',
        header: 'Receipt #',
        cell: ({ row }) => (
          <span className="font-bold text-slate-900 font-mono">
            {row.original.receipt}
          </span>
        ),
      },
      {
        accessorKey: 'party',
        header: 'Party / Shipper',
        cell: ({ row }) => (
          <span className="font-semibold text-slate-800">
            {row.original.party || 'General Party'}
          </span>
        ),
      },
      {
        accessorKey: 'warehouse',
        header: 'Warehouse',
        cell: ({ row }) => (
          <span className="inline-flex items-center space-x-1 text-slate-600">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>{row.original.warehouse || 'China Warehouse'}</span>
          </span>
        ),
      },
      {
        accessorKey: 'date',
        header: 'Received Date',
        cell: ({ row }) => (
          <span className="text-slate-500 whitespace-nowrap">
            {formatGlobalDate(row.original.date) || row.original.date || 'N/A'}
          </span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: () => <div className="text-center">Total Inward</div>,
        cell: ({ row }) => (
          <div className="text-center font-bold text-slate-800">
            {row.original.quantity} CTN
          </div>
        ),
      },
      {
        accessorKey: 'loadedQuantity',
        header: () => <div className="text-center">Loaded</div>,
        cell: ({ row }) => (
          <div className="text-center font-semibold text-emerald-600">
            {row.original.loadedQuantity || 0} CTN
          </div>
        ),
      },
      {
        id: 'remainingQuantity',
        header: () => <div className="text-center">Remaining Stock</div>,
        cell: ({ row }) => {
          const r = row.original;
          const avail = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
          return (
            <div className="text-center">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                  avail > 0
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {avail} CTN
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const r = row.original;
          return (
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
          );
        },
      },
      {
        id: 'commodity',
        header: 'Commodity / Chinese',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-slate-700 max-w-[200px] truncate" title={r.english || r.commodity || ''}>
              <div className="truncate font-semibold">{r.english || r.commodity || 'General Goods'}</div>
              {r.chinese && <div className="text-[10px] text-slate-400 truncate">{r.chinese}</div>}
            </div>
          );
        },
      },
      {
        id: 'marks',
        header: 'Marks',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="text-slate-500 font-mono text-[11px]">
              {[r.mainMarka ? `M:${r.mainMarka}` : '', r.subMarka ? `S:${r.subMarka}` : '']
                .filter(Boolean)
                .join(' ') || '-'}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Loader Action</div>,
        cell: ({ row }) => {
          const r = row.original;
          const avail = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
          const isComplete = avail === 0;

          return (
            <div className="inline-flex items-center space-x-1.5 justify-end w-full">
              <button
                type="button"
                onClick={() => handleOpenSingleEdit(r)}
                title="Edit warehouse receipt details"
                className="inline-flex items-center p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleOpenSplit(r)}
                disabled={isComplete}
                title={isComplete ? 'Fully loaded into containers' : 'Split and allocate cargo into container plan'}
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm ${
                  isComplete
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>

              <button
                onClick={() => handleDeleteReceipt(r)}
                title="Delete wrong receipt from warehouse stock"
                className="inline-flex items-center p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        },
      },
    ];
  }, [filteredReceipts, selectedReceiptIds]);

  // TanStack Columns for Active Plan Manifest Items
  const manifestColumns = useMemo<ColumnDef<any>[]>(() => {
    return [
      {
        id: 'index',
        header: '#',
        cell: ({ row }) => <span className="text-slate-400">{row.index + 1}</span>,
      },
      {
        accessorKey: 'receipt',
        header: 'Receipt #',
        cell: ({ row }) => (
          <span className="font-bold font-mono text-slate-900">{row.original.receipt}</span>
        ),
      },
      {
        accessorKey: 'party',
        header: 'Party / Shipper',
        cell: ({ row }) => (
          <span className="font-semibold text-slate-800">{row.original.party || 'General Party'}</span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: () => <div className="text-center">Loaded Qty</div>,
        cell: ({ row }) => (
          <span className="text-center font-bold text-emerald-600 block">{row.original.quantity} CTN</span>
        ),
      },
      {
        id: 'isSplit',
        header: () => <div className="text-center">Split Status</div>,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="text-center">
              {item.isSplit ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                  <Split className="w-2.5 h-2.5" />
                  <span>Split Part #{item.splitIndex || 1} (of {item.originalTotalQuantity} CTN)</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Full Load</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'commodity',
        header: 'Commodity',
        cell: ({ row }) => (
          <span className="font-semibold text-slate-700">{row.original.english || row.original.commodity || 'Cargo'}</span>
        ),
      },
      {
        id: 'marks',
        header: 'Marks',
        cell: ({ row }) => (
          <span className="text-slate-500 font-mono text-[11px]">
            {[row.original.mainMarka ? `M:${row.original.mainMarka}` : '', row.original.subMarka ? `S:${row.original.subMarka}` : '']
              .filter(Boolean)
              .join(' ') || '-'}
          </span>
        ),
      },
      {
        id: 'action',
        header: () => <div className="text-right">Action</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <button
              onClick={() => handleDeallocateItem(row.original._id)}
              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
              title="Remove item and return quantity to warehouse stock"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ];
  }, []);

  // TanStack Table Instances
  const receiptsTable = useReactTable({
    data: filteredReceipts,
    columns: receiptColumns,
    state: {
      sorting: receiptSorting,
    },
    onSortingChange: setReceiptSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  const manifestTable = useReactTable({
    data: activePlan?.items || [],
    columns: manifestColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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

          <button
            onClick={() => setActiveSubTab('uploads')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'uploads'
                ? 'bg-red-600 text-white shadow-md shadow-red-200'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>3. Upload Tracking Records ({uploadHistory.filter((u) => u.status === 'Active').length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              dispatch(fetchWarehouseReceipts());
              dispatch(fetchLoadingPlans());
              dispatch(fetchUploadHistory());
            }}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
              if (userWhs.length === 0) {
                alert('No China warehouse found! You cannot upload goods or plans until at least one China warehouse is created. Please create a warehouse first.');
                setWarehouseModalContext('excel');
                setIsAddWarehouseModalOpen(true);
                return;
              }
              if (!excelUploadWarehouse || excelUploadWarehouse === 'ALL') {
                setExcelUploadWarehouse(userWhs[0]);
              }
              setIsExcelUploadOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-200" />
            <span>Import Chinese Excel</span>
          </button>

          <button
            onClick={() => {
              const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
              if (userWhs.length === 0) {
                alert('No China warehouse found! You cannot enter received goods until at least one China warehouse is created. Please create a warehouse first.');
                setWarehouseModalContext('receive');
                setIsAddWarehouseModalOpen(true);
                return;
              }
              if (!receiveWarehouse || receiveWarehouse === 'ALL') {
                setReceiveWarehouse(userWhs[0]);
              }
              setIsReceiveModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4 text-emerald-200" />
            <span>Receive Goods (China WH)</span>
          </button>

          <button
            onClick={() => {
              const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
              if (userWhs.length === 0) {
                alert('No China warehouse found! You cannot create a loading plan until at least one China warehouse is created. Please create a warehouse first.');
                setWarehouseModalContext('plan');
                setIsAddWarehouseModalOpen(true);
                return;
              }
              if (!newPlanWarehouse || newPlanWarehouse === 'ALL') {
                setNewPlanWarehouse(userWhs[0]);
              }
              setIsCreatePlanOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4 text-red-400" />
            <span>New Loading Plan</span>
          </button>

          {loadingPlans.length > 0 && (
            <button
              onClick={() => handleOpenAllotModal()}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md transition"
              title="Allot actual ISO carrier container number into an internal container plan"
            >
              <Anchor className="w-4 h-4 text-white" />
              <span>Allot Actual Container</span>
            </button>
          )}
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

                <button
                  type="button"
                  onClick={() => {
                    setWarehouseModalContext('filter');
                    setIsAddWarehouseModalOpen(true);
                  }}
                  className="px-2 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-600 transition flex items-center space-x-1"
                  title="Create new China warehouse if not found in list"
                >
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span>+ Warehouse</span>
                </button>

                {selectedWarehouse !== 'ALL' && (
                  <button
                    type="button"
                    onClick={handleOpenEditWarehouse}
                    disabled={actionLoading}
                    className="px-2 py-1.5 text-xs font-bold rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition flex items-center space-x-1"
                    title={`Edit name of warehouse '${selectedWarehouse}'`}
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit WH</span>
                  </button>
                )}

                {selectedWarehouse !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteWarehouse()}
                    disabled={actionLoading}
                    className="px-2 py-1.5 text-xs font-bold rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition flex items-center space-x-1"
                    title={`Delete warehouse '${selectedWarehouse}' (Only allowed if ZERO data is mapped)`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Delete WH</span>
                  </button>
                )}
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

          {/* Bulk Selection Action Bar */}
          {selectedReceiptIds.size > 0 && (
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg border border-slate-800 animate-fadeIn">
              <div className="flex items-center space-x-3">
                <span className="bg-red-600 text-white font-mono font-black text-xs px-2.5 py-1 rounded-lg">
                  {selectedReceiptIds.size} Selected
                </span>
                <span className="text-xs text-slate-300 font-medium">
                  China warehouse stock receipts selected for batch actions
                </span>
                {selectedWithLoadedCargo.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md">
                    ⚠️ {selectedWithLoadedCargo.length} item(s) have container allocations
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBulkEditOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <Pencil className="w-3.5 h-3.5 text-blue-200" />
                  <span>Bulk Edit ({selectedReceiptIds.size})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForceBulkDelete(false);
                    setIsBulkDeleteOpen(true);
                  }}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-200" />
                  <span>Bulk Delete ({selectedReceiptIds.size})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedReceiptIds(new Set())}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition border border-slate-700"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Receipts Table (Powered by @tanstack/react-table) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  {receiptsTable.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider border-b border-slate-800"
                    >
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="py-3 px-3">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {receiptsTable.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={receiptColumns.length} className="py-12 text-center text-slate-400 italic">
                        No warehouse receipts matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    receiptsTable.getRowModel().rows.map((row) => {
                      const isSelected = selectedReceiptIds.has(row.original._id || row.original.receipt);
                      return (
                        <tr
                          key={row.id}
                          className={`transition ${
                            isSelected ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="py-3 px-3">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* TanStack Table Pagination */}
            {receiptsTable.getPageCount() > 1 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="text-slate-500 font-medium">
                  Showing{' '}
                  <strong className="text-slate-900">
                    {receiptsTable.getState().pagination.pageIndex * receiptsTable.getState().pagination.pageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-slate-900">
                    {Math.min(
                      (receiptsTable.getState().pagination.pageIndex + 1) * receiptsTable.getState().pagination.pageSize,
                      filteredReceipts.length
                    )}
                  </strong>{' '}
                  of <strong className="text-slate-900">{filteredReceipts.length}</strong> receipts
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => receiptsTable.previousPage()}
                    disabled={!receiptsTable.getCanPreviousPage()}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <span className="font-bold text-slate-700 px-2">
                    Page {receiptsTable.getState().pagination.pageIndex + 1} of {receiptsTable.getPageCount()}
                  </span>
                  <button
                    type="button"
                    onClick={() => receiptsTable.nextPage()}
                    disabled={!receiptsTable.getCanNextPage()}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: LOADING PLANS & INTERNAL CONTAINERS */}
      {activeSubTab === 'plans' && (
        <div className="space-y-6">
          {/* Plans Filter Tabs & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setPlanFilterStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  planFilterStatus === 'all'
                    ? 'bg-slate-900 text-white shadow-sm font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Plans ({loadingPlans.length})
              </button>
              <button
                type="button"
                onClick={() => setPlanFilterStatus('active')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  planFilterStatus === 'active'
                    ? 'bg-blue-600 text-white shadow-sm font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active / In Transit (
                {loadingPlans.filter((p) => !p.isDelivered && !(p.status && p.status.toLowerCase().includes('deliver'))).length}
                )
              </button>
              <button
                type="button"
                onClick={() => setPlanFilterStatus('delivered')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center space-x-1.5 ${
                  planFilterStatus === 'delivered'
                    ? 'bg-emerald-600 text-white shadow-sm font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Delivered / Reached Destination (
                  {
                    loadingPlans.filter(
                      (p) =>
                        p.isDelivered ||
                        (p.status &&
                          (p.status.toLowerCase().includes('deliver') ||
                            p.status.toLowerCase().includes('destination') ||
                            p.status.toLowerCase().includes('arrived') ||
                            p.status.toLowerCase().includes('reached')))
                    ).length
                  }
                  )
                </span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={planSearchQuery}
                onChange={(e) => setPlanSearchQuery(e.target.value)}
                placeholder="Search plan / carrier container..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {filteredLoadingPlans.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              No container plans found matching your filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredLoadingPlans.map((plan) => {
                const isSelected = activePlan?.container === plan.container;
                const isArrived = Boolean(
                  plan.status &&
                    (plan.status.toLowerCase().includes('destination') ||
                      plan.status.toLowerCase().includes('arrived') ||
                      plan.status.toLowerCase().includes('reached'))
                );
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
                          plan.isDelivered
                            ? 'bg-emerald-100 text-emerald-800'
                            : isArrived
                            ? 'bg-teal-100 text-teal-800'
                            : plan.isFinalized
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {plan.isDelivered ? 'Delivered' : isArrived ? 'Arrived' : plan.isFinalized ? 'Finalized' : 'Planning'}
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
                        <span className="text-slate-400">Actual Vessel ETA:</span>
                        <span className="font-bold text-sky-700 font-mono text-xs">
                          {plan.rawEta ? (formatGlobalDate(plan.rawEta) || plan.rawEta) : 'Pending API'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">Clearance ETA (+10d):</span>
                        <span className="font-bold text-emerald-700 font-mono text-xs">
                          {plan.eta ? (formatGlobalDate(plan.eta) || plan.eta) : 'Pending'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                        <span className="text-slate-400">Status:</span>
                        {plan.isDelivered ? (
                          <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-black">
                            DELIVERED ({formatGlobalDate(plan.deliveryDate) || plan.deliveryDate || 'Done'}{plan.daysToDeliver !== null && plan.daysToDeliver !== undefined ? ` • ${plan.daysToDeliver}d` : ''})
                          </span>
                        ) : isArrived ? (
                          <span className="text-teal-900 bg-teal-100 px-2 py-0.5 rounded-full text-[10px] font-black border border-teal-300">
                            Container reached to the final destination
                          </span>
                        ) : (
                          <span className="text-slate-800 font-bold">{plan.status || 'Pending'}</span>
                        )}
                      </div>
                    </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAllotModal(plan);
                      }}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                    >
                      <Anchor className="w-3 h-3 text-red-400" />
                      <span>{plan.containerNumber ? 'Edit Actual No' : 'Allot Actual No'}</span>
                    </button>

                    {!plan.isDelivered && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenContainerWiseLoad(plan);
                        }}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1 shadow-sm"
                        title={`Load received goods directly into ${plan.container} (Container-wise planning)`}
                      >
                        <Plus className="w-3 h-3 text-emerald-200" />
                        <span>Load Goods</span>
                      </button>
                    )}

                    {!plan.isDelivered && ((plan.shipmentCount && plan.shipmentCount > 0) || (plan.totalQuantity && plan.totalQuantity > 0)) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setContainerToUnloadGoods(plan);
                        }}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[11px] font-bold transition flex items-center space-x-1 shadow-sm"
                        title={`Unload cargo goods from ${plan.container} (restore back to warehouse stock)`}
                      >
                        <ArrowDownLeft className="w-3 h-3 text-amber-600" />
                        <span>Unload Goods</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAlterModal(plan);
                      }}
                      className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                      title="Alter container alias, actual container number, carrier, or warehouse database-wide"
                    >
                      <Pencil className="w-3 h-3 text-blue-600" />
                      <span>Alter</span>
                    </button>

                    {plan.containerNumber && !plan.isDelivered && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDemapActual(plan);
                        }}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                        title="De-map actual carrier container so plan returns to Planning"
                      >
                        <X className="w-3 h-3 text-amber-600" />
                        <span>De-map</span>
                      </button>
                    )}

                    {plan.containerNumber && !plan.isDelivered && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeliverModal(plan);
                        }}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-200" />
                        <span>Deliver</span>
                      </button>
                    )}

                    {!plan.isDelivered && ((plan.shipmentCount || 0) > 0 || (plan.totalQuantity || 0) > 0) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setContainerToUnloadGoods(plan);
                        }}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                        title="Unload goods from container back to China warehouse stock"
                      >
                        <ArrowDownLeft className="w-3 h-3 text-amber-600" />
                        <span>Unload</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlan(plan);
                      }}
                      className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                      title="Delete plan (Strict rules: blocked if actual container allotted, API called, or goods loaded)"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                      <span>Delete</span>
                    </button>

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
        )}

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
                  <div className="flex items-center space-x-3 mt-1.5 text-xs flex-wrap gap-y-1">
                    <span className="text-slate-500">
                      Actual Vessel ETA: <strong className="text-sky-700 font-mono font-bold">{activePlan.rawEta ? (formatGlobalDate(activePlan.rawEta) || activePlan.rawEta) : 'Pending API'}</strong>
                    </span>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <span className="text-slate-500">
                      Clearance Delivery ETA (+{activePlan.etaBufferDays !== undefined ? activePlan.etaBufferDays : 10}d): <strong className="text-emerald-700 font-mono font-bold">{activePlan.destinationDate ? (formatGlobalDate(activePlan.destinationDate) || activePlan.destinationDate) : activePlan.eta ? (formatGlobalDate(activePlan.eta) || activePlan.eta) : 'Pending'}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                  {!activePlan.isDelivered && (
                    <button
                      onClick={() => handleOpenContainerWiseLoad(activePlan)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
                      title={`Load received warehouse goods directly into ${activePlan.container} (Container-wise planning)`}
                    >
                      <Plus className="w-4 h-4 text-emerald-200" />
                      <span>+ Load Goods into {activePlan.container}</span>
                    </button>
                  )}

                  {!activePlan.isDelivered && ((activePlan.shipmentCount || 0) > 0 || (activePlan.totalQuantity || 0) > 0) && (
                    <button
                      onClick={() => handleUnloadAllCargo(activePlan)}
                      className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                      title={`Unload all loaded cargo goods from ${activePlan.container} back to China Warehouse stock`}
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 text-amber-600" />
                      <span>⚡ Unload All Cargo to Stock</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleOpenAllotModal(activePlan)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
                  >
                    <Anchor className="w-4 h-4 text-red-400" />
                    <span>{activePlan.containerNumber ? 'Edit Actual No' : 'Allot Actual No'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenAlterModal(activePlan)}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                    title="Alter container alias, actual container number, carrier, or warehouse database-wide"
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    <span>Alter Container</span>
                  </button>

                  {activePlan.containerNumber && !activePlan.isDelivered && (
                    <button
                      onClick={() => handleDemapActual(activePlan)}
                      className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                      title="De-map actual carrier container so plan returns to Planning"
                    >
                      <X className="w-3.5 h-3.5 text-amber-600" />
                      <span>De-map Actual</span>
                    </button>
                  )}

                  {activePlan.containerNumber && !activePlan.isDelivered && (
                    <button
                      onClick={() => handleOpenDeliverModal(activePlan)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Mark Delivered</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDeletePlan(activePlan)}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                    title="Delete plan (Strict rules apply)"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Delete Plan</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    {manifestTable.getHeaderGroups().map((headerGroup) => (
                      <tr
                        key={headerGroup.id}
                        className="bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200"
                      >
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="py-2.5 px-3">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {manifestTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={manifestColumns.length} className="py-8 text-center text-slate-400 italic">
                          No cargo allocated into this container yet. Go to the &quot;China Warehouse Stock&quot; tab to split &amp; load items.
                        </td>
                      </tr>
                    ) : (
                      manifestTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="py-2.5 px-3">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
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

      {/* SUB-TAB 3: UPLOAD TRACKING & ROLLBACK HISTORY */}
      {activeSubTab === 'uploads' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Top Info & Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search file, batch, warehouse, receipt..."
                  value={uploadSearchTerm}
                  onChange={(e) => setUploadSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-64"
                />
              </div>

              {/* Type Filter */}
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setUploadTypeFilter('all')}
                  className={`px-3 py-1 rounded-lg transition ${
                    uploadTypeFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({uploadHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUploadTypeFilter('stock')}
                  className={`px-3 py-1 rounded-lg transition ${
                    uploadTypeFilter === 'stock'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📦 Stock ({uploadHistory.filter((u) => u.uploadType === 'stock').length})
                </button>
                <button
                  type="button"
                  onClick={() => setUploadTypeFilter('plan')}
                  className={`px-3 py-1 rounded-lg transition ${
                    uploadTypeFilter === 'plan'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🚢 Plans ({uploadHistory.filter((u) => u.uploadType === 'plan').length})
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-500">
                {uploadHistory.filter((u) => u.status === 'Active').length} Active Batches
              </span>
              <button
                type="button"
                onClick={() => dispatch(fetchUploadHistory())}
                disabled={uploadHistoryLoading}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${uploadHistoryLoading ? 'animate-spin text-red-600' : ''}`} />
                <span>Refresh History</span>
              </button>
            </div>
          </div>

          {/* Upload History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Uploaded At</th>
                    <th className="py-3 px-4">Batch ID</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Upload Type</th>
                    <th className="py-3 px-4">Warehouse / Container</th>
                    <th className="py-3 px-4 text-center">Saved Unique</th>
                    <th className="py-3 px-4 text-center">Duplicates Skipped</th>
                    <th className="py-3 px-4 text-center">Missing Skipped</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadHistory.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-sm">No upload records found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          When you upload China warehouse stock or loading plan Excel/CSV files, full tracking records will appear here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    uploadHistory
                      .filter((u) => {
                        if (uploadTypeFilter !== 'all' && u.uploadType !== uploadTypeFilter) return false;
                        if (!uploadSearchTerm.trim()) return true;
                        const term = uploadSearchTerm.toLowerCase();
                        return (
                          u.uploadId?.toLowerCase().includes(term) ||
                          u.fileName?.toLowerCase().includes(term) ||
                          u.warehouse?.toLowerCase().includes(term) ||
                          u.targetContainer?.toLowerCase().includes(term) ||
                          (u.receipts && u.receipts.some((r) => r.toLowerCase().includes(term)))
                        );
                      })
                      .map((u) => {
                        const isDeleted = u.status === 'Deleted';
                        return (
                          <tr
                            key={u.uploadId}
                            className={`hover:bg-slate-50 transition ${isDeleted ? 'opacity-60 bg-slate-50/50' : ''}`}
                          >
                            {/* Uploaded At */}
                            <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                              <div>{new Date(u.uploadedAt).toLocaleDateString()}</div>
                              <div className="text-[10px] text-slate-400">{new Date(u.uploadedAt).toLocaleTimeString()}</div>
                            </td>

                            {/* Batch ID */}
                            <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700">
                                {u.uploadId}
                              </span>
                            </td>

                            {/* File Name */}
                            <td className="py-3 px-4 font-medium text-slate-900 max-w-[220px]">
                              <div className="flex items-center space-x-1.5 truncate">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span className="truncate font-semibold" title={u.fileName}>
                                  {u.fileName}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Total: {u.totalRowsInFile || (u.savedCount + (u.duplicateCount || 0) + (u.missingCount || 0))} rows
                              </span>
                            </td>

                            {/* Upload Type */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              {u.uploadType === 'stock' ? (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Boxes className="w-3 h-3 text-emerald-600" />
                                  <span>Warehouse Stock</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  <Truck className="w-3 h-3 text-indigo-600" />
                                  <span>Loading Plan</span>
                                </span>
                              )}
                            </td>

                            {/* Warehouse / Container */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{u.warehouse || '—'}</div>
                              {u.targetContainer && (
                                <div className="text-[10px] font-mono text-indigo-600">
                                  Internal Cont: {u.targetContainer}
                                </div>
                              )}
                            </td>

                            {/* Saved Unique */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                                {u.savedCount}
                              </span>
                            </td>

                            {/* Duplicates Skipped */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {u.duplicateCount && u.duplicateCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDuplicatesModal(u)}
                                  className="font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-xs transition inline-flex items-center space-x-1"
                                  title="Click to view duplicate receipts list"
                                >
                                  <span>{u.duplicateCount}</span>
                                  <span className="underline text-[10px]">View</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">0</span>
                              )}
                            </td>

                            {/* Missing Skipped */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {u.missingCount && u.missingCount > 0 ? (
                                <span className="font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-xs" title={`${u.missingCount} rows missing receipt or date`}>
                                  {u.missingCount}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">0</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {isDeleted ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  Rolled Back
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Active
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              {isDeleted ? (
                                <span className="text-[10px] text-slate-400">
                                  {u.deletedAt ? `Deleted ${new Date(u.deletedAt).toLocaleDateString()}` : 'Deleted'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const confirmMsg =
                                      u.uploadType === 'stock'
                                        ? `Are you sure you want to delete and rollback upload batch "${u.fileName}" (${u.uploadId})?\n\n• All ${u.savedCount} receipts created by this upload will be removed from China warehouse stock.\n• Any receipt already allocated into a loading plan will be safely protected.\n\nThis action cannot be undone.`
                                        : `Are you sure you want to delete and rollback upload batch "${u.fileName}" (${u.uploadId})?\n\n• All shipments loaded by this upload into container "${u.targetContainer}" will be removed.\n• Allocated quantities will be returned to warehouse stock.\n\nThis action cannot be undone.`;

                                    if (!window.confirm(confirmMsg)) return;

                                    try {
                                      const resultAction = await dispatch(deleteUploadBatch({ uploadId: u.uploadId }));
                                      if (deleteUploadBatch.fulfilled.match(resultAction)) {
                                        alert(resultAction.payload?.message || 'Upload batch rolled back successfully!');
                                      } else {
                                        alert(resultAction.error?.message || 'Failed to rollback upload batch');
                                      }
                                    } catch (err: any) {
                                      alert(err?.message || 'Rollback error');
                                    }
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 rounded-lg transition inline-flex items-center space-x-1"
                                  title="Delete this upload and rollback its records"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete Upload</span>
                                </button>
                              )}
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
                  value={splitQuantityInput}
                  onChange={(e) => setSplitQuantityInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full px-3 py-2 text-sm font-black rounded-xl border focus:outline-none focus:ring-2 ${
                    Number(splitQuantityInput) > (activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity)
                      ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-500'
                      : 'border-slate-300 focus:ring-red-500'
                  }`}
                  placeholder="Enter cartons quantity to load"
                />

                {Number(splitQuantityInput) > (activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity) && (
                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-start space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>Error: Cannot load {Number(splitQuantityInput)} CTN! Only {activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity} CTN remain in warehouse stock.</span>
                  </div>
                )}

                {Number(splitQuantityInput) > 0 && Number(splitQuantityInput) < (activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity) && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-start space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-amber-900">Notice: Splitting Cargo Quantity</span>
                      Loading {Number(splitQuantityInput)} CTN will leave {(activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity) - Number(splitQuantityInput)} CTN in warehouse stock. You will be prompted to confirm this split on submit.
                    </div>
                  </div>
                )}

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
                  disabled={
                    actionLoading ||
                    !selectedPlanForAllocation ||
                    !splitQuantityInput ||
                    Number(splitQuantityInput) <= 0 ||
                    Number(splitQuantityInput) > (activeReceiptForSplit.remainingQuantity !== undefined ? activeReceiptForSplit.remainingQuantity : activeReceiptForSplit.quantity)
                  }
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
              {/* Internal Container Selector (Mandatory) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Select Internal Container / Plan</span>
                  <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                </label>
                <select
                  value={allotSelectedContainer || activePlanForAllot.container}
                  onChange={(e) => {
                    const cName = e.target.value;
                    setAllotSelectedContainer(cName);
                    const found = loadingPlans.find((p) => p.container === cName);
                    if (found) {
                      setActualContainerNoInput(found.containerNumber || '');
                      setAllotCarrierInput(found.shippingLine || 'MSC');
                      setLoadingDateInput(found.loadingDate || new Date().toISOString().split('T')[0]);
                      setDestinationInput(found.shippedTo || 'Nhava Sheva / Mundra, India');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-bold font-mono rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {loadingPlans.map((p) => (
                    <option key={p.container} value={p.container}>
                      {p.container} {p.containerNumber ? `[${p.containerNumber}]` : ''} - {p.warehouse || 'China Warehouse'} ({p.totalQuantity || 0} CTN)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Selecting the internal container is mandatory to allot the actual carrier container number.
                </p>
              </div>

              {/* Internal Container Summary */}
              {(() => {
                const curPlan = loadingPlans.find((p) => p.container === (allotSelectedContainer || activePlanForAllot.container)) || activePlanForAllot;
                return (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Origin Warehouse:</span>
                      <span className="font-bold text-slate-800">{curPlan.warehouse || 'China Warehouse'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Loaded Cargo:</span>
                      <span className="font-bold text-emerald-600">{curPlan.totalQuantity || 0} Cartons ({curPlan.shipmentCount || 0} items)</span>
                    </div>
                    {curPlan.containerNumber && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Current Carrier Container:</span>
                        <span className="font-bold font-mono text-red-600">{curPlan.containerNumber} ({curPlan.shippingLine || 'MSC'})</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Actual Carrier Container Number
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={actualContainerNoInput}
                    onChange={(e) => setActualContainerNoInput(e.target.value.toUpperCase())}
                    placeholder="e.g. MSCU1234567"
                    className="flex-1 px-3 py-2 font-mono text-sm font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleLookupAllotContainer}
                    disabled={isLookingUpApi || !actualContainerNoInput.trim()}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center space-x-1.5 shrink-0"
                    title="Fetch loading date and live ETA from JSONCargo API"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLookingUpApi ? 'animate-spin text-white' : ''}`} />
                    <span>{isLookingUpApi ? 'Searching...' : '⚡ Search API'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter container number and click <strong>'⚡ Search API'</strong> to fetch Loading Date & ETA from Carrier API.
                </p>
              </div>

              {/* Live API Lookup Status Alert */}
              {apiLookupStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-start space-x-2 animate-fadeIn ${
                    apiLookupStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-300'
                  }`}
                >
                  {apiLookupStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span>{apiLookupStatus.message}</span>
                  </div>
                </div>
              )}

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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Container Loading Date</span>
                  <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                </label>
                <input
                  type="date"
                  required
                  value={loadingDateInput}
                  onChange={(e) => setLoadingDateInput(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-bold rounded-xl border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    apiLookupStatus && apiLookupStatus.type === 'warning'
                      ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                      : 'border-slate-300'
                  }`}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {apiLookupStatus?.loadingDate
                    ? `✓ Populated from JSON Cargo API: ${apiLookupStatus.loadingDate} (you can edit if needed)`
                    : 'If API does not find the container, please enter the Loading Date manually.'}
                </p>
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    China Origin Loading Warehouse
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setWarehouseModalContext('plan');
                      setIsAddWarehouseModalOpen(true);
                    }}
                    className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ New Warehouse</span>
                  </button>
                </div>
                <select
                  value={newPlanWarehouse}
                  onChange={(e) => setNewPlanWarehouse(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                    <option value="" disabled>
                      No warehouses created yet — Click '+ New Warehouse' above
                    </option>
                  ) : (
                    availableWarehouses
                      .filter((w) => w !== 'ALL')
                      .map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))
                  )}
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
                  disabled={
                    actionLoading ||
                    !newPlanAlias.trim() ||
                    availableWarehouses.filter((w) => w !== 'ALL').length === 0 ||
                    !newPlanWarehouse ||
                    newPlanWarehouse === 'ALL'
                  }
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {actionLoading ? <span>Creating...</span> : <span>Initialize Loading Plan</span>}
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

              {/* Receipt Items Checklist (Partial Delivery Exclusion) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Cargo Manifest / Receipts ({planToDeliver.items?.length || 0})
                  </label>
                  <div className="space-x-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setExcludedReceiptsForDelivery(new Set())}
                      className="font-bold text-emerald-600 hover:text-emerald-700 underline"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const allRecs = (planToDeliver.items || []).map((i) => String(i.receipt).trim().toLowerCase());
                        setExcludedReceiptsForDelivery(new Set(allRecs));
                      }}
                      className="font-bold text-slate-500 hover:text-slate-700 underline"
                    >
                      Exclude All
                    </button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-2xl p-2 space-y-1 bg-slate-50">
                  {(!planToDeliver.items || planToDeliver.items.length === 0) ? (
                    <p className="text-xs text-slate-400 p-2 italic text-center">No individual cargo items loaded.</p>
                  ) : (
                    planToDeliver.items.map((item, idx) => {
                      const recKey = String(item.receipt || '').trim().toLowerCase();
                      const isExcluded = excludedReceiptsForDelivery.has(recKey);
                      return (
                        <div
                          key={item._id || `${item.receipt}-${idx}`}
                          onClick={() => {
                            setExcludedReceiptsForDelivery((prev) => {
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
                <p className="text-[11px] text-slate-400 mt-1">
                  Uncheck any receipt if only part of the container was delivered. Excluded receipts will remain in transit.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Actual Delivery Date</span>
                  <span className="text-emerald-700 font-bold text-[10px]">* Mandatory</span>
                </label>
                <input
                  type="date"
                  required
                  value={deliveryDateInput}
                  onChange={(e) => setDeliveryDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-emerald-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  setExcelUploadResult(null);
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

              {/* Rich Upload Results View (Shown when upload finishes with duplicates or missing rows) */}
              {excelUploadResult ? (
                <div className="space-y-4 animate-fadeIn">
                  {/* Results Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Saved Unique</span>
                      <div className="text-2xl font-black text-emerald-800 mt-1">{excelUploadResult.savedCount}</div>
                      <span className="text-[10px] text-emerald-600">Successfully Ingested</span>
                    </div>
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Duplicates Skipped</span>
                      <div className="text-2xl font-black text-amber-800 mt-1">{excelUploadResult.duplicateCount}</div>
                      <span className="text-[10px] text-amber-600">Already in DB / File</span>
                    </div>
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-center">
                      <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Missing Skipped</span>
                      <div className="text-2xl font-black text-red-800 mt-1">{excelUploadResult.missingCount}</div>
                      <span className="text-[10px] text-red-600">No Receipt / Date</span>
                    </div>
                  </div>

                  {/* Batch Tracking ID */}
                  {excelUploadResult.uploadId && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Tracking Batch ID:</span>
                      <span className="font-mono font-bold text-slate-800">{excelUploadResult.uploadId}</span>
                    </div>
                  )}

                  {/* Duplicates List */}
                  {excelUploadResult.duplicates && excelUploadResult.duplicates.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-amber-900 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Duplicate Receipts Found ({excelUploadResult.duplicates.length}):</span>
                      </span>
                      <div className="max-h-44 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/40 text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-amber-100/60 text-[10px] uppercase font-bold text-amber-800 border-b border-amber-200 sticky top-0">
                            <tr>
                              <th className="p-2">Receipt #</th>
                              <th className="p-2 text-center">Row in File</th>
                              <th className="p-2">Reason / Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100 text-[11px]">
                            {excelUploadResult.duplicates.map((d, i) => (
                              <tr key={i} className="hover:bg-amber-100/40">
                                <td className="p-2 font-mono font-bold text-slate-900">{d.receipt}</td>
                                <td className="p-2 text-center font-mono text-slate-500">{d.row ? `Row ${d.row}` : '—'}</td>
                                <td className="p-2 text-slate-700">{d.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Missing Mandatory Fields List */}
                  {excelUploadResult.missingDetails && excelUploadResult.missingDetails.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-red-900 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span>Rows Missing Mandatory Fields ({excelUploadResult.missingDetails.length}):</span>
                      </span>
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-red-200 bg-red-50/40 text-xs p-2 space-y-1">
                        {excelUploadResult.missingDetails.map((m, i) => (
                          <div key={i} className="text-[11px] text-red-700 flex items-center justify-between border-b border-red-100 pb-1 last:border-0 last:pb-0">
                            <span className="font-mono font-bold">Row {m.row}</span>
                            <span>{m.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Upload Type Selector (Warehouse Stock vs Container Loading Plan) */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Select Upload Purpose
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setExcelUploadType('stock')}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition text-center ${
                          excelUploadType === 'stock'
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📦 Receive Goods (Warehouse Stock)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcelUploadType('plan')}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition text-center ${
                          excelUploadType === 'plan'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🚢 Loading Plan (Container Cargo)
                      </button>
                    </div>
                  </div>

                  {/* Internal Container / Loading Plan Number (Mandatory for Loading Plan) */}
                  {excelUploadType === 'plan' && (
                    <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-1.5 animate-fadeIn">
                      <label className="block text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center justify-between">
                        <span>Internal Loading Plan / Container Number</span>
                        <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                      </label>
                      <input
                        type="text"
                        list="excel-plans-list"
                        required
                        placeholder="Select or enter internal container number (e.g. USI-01)"
                        value={excelTargetContainer}
                        onChange={(e) => setExcelTargetContainer(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 text-xs font-mono font-bold uppercase rounded-xl border border-indigo-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <datalist id="excel-plans-list">
                        {loadingPlans.map((p) => (
                          <option key={p.container} value={p.container}>
                            {p.container} {p.containerNumber ? `(${p.containerNumber})` : ''} - {p.warehouse || 'China Warehouse'}
                          </option>
                        ))}
                      </datalist>
                      <p className="text-[11px] text-indigo-800">
                        Mandatory rule: When uploading a loading plan, the Internal Container Number must be selected or provided.
                      </p>
                    </div>
                  )}

                  {/* Target Warehouse Selector (Mandatory) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1">
                        <span>Target China Warehouse</span>
                        <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseModalContext('excel');
                          setIsAddWarehouseModalOpen(true);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ New Warehouse</span>
                      </button>
                    </div>
                    <select
                      value={excelUploadWarehouse}
                      onChange={(e) => setExcelUploadWarehouse(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                        <option value="" disabled>
                          No warehouses created yet — Click '+ New Warehouse' above
                        </option>
                      ) : (
                        availableWarehouses
                          .filter((w) => w !== 'ALL')
                          .map((wh) => (
                            <option key={wh} value={wh}>
                              {wh}
                            </option>
                          ))
                      )}
                    </select>
                  </div>

                  {availableWarehouses.filter((w) => w !== 'ALL').length === 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-start space-x-2 text-amber-900 text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-bold">No Warehouse Found:</span> You cannot upload goods or loading plans until at least one China warehouse is created.
                        <button
                          type="button"
                          onClick={() => {
                            setWarehouseModalContext('excel');
                            setIsAddWarehouseModalOpen(true);
                          }}
                          className="block mt-1 font-bold text-indigo-700 underline"
                        >
                          Click here to create a China warehouse now
                        </button>
                      </div>
                    </div>
                  )}

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
                            setExcelUploadResult(null);
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
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              {excelUploadResult ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExcelUploadOpen(false);
                      setExcelFile(null);
                      setExcelPreviewRows([]);
                      setExcelUploadStatus(null);
                      setExcelUploadResult(null);
                      setActiveSubTab('uploads');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center space-x-1.5"
                  >
                    <History className="w-4 h-4 text-slate-600" />
                    <span>View in Upload Tracking</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExcelUploadOpen(false);
                      setExcelFile(null);
                      setExcelPreviewRows([]);
                      setExcelUploadStatus(null);
                      setExcelUploadResult(null);
                    }}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[11px] text-slate-500">
                    {excelTotalRows > 0
                      ? excelUploadType === 'plan'
                        ? `${excelTotalRows} cargo entries will be loaded into Container '${excelTargetContainer || '...'}'`
                        : `${excelTotalRows} receipts will be added to China WH Stock`
                      : 'Select a file to begin'}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsExcelUploadOpen(false);
                        setExcelFile(null);
                        setExcelPreviewRows([]);
                        setExcelUploadType('stock');
                        setExcelTargetContainer('');
                        setExcelUploadStatus(null);
                        setExcelUploadResult(null);
                      }}
                      className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmExcelUpload}
                      disabled={
                        !excelFile ||
                        isUploadingExcel ||
                        availableWarehouses.filter((w) => w !== 'ALL').length === 0 ||
                        !excelUploadWarehouse ||
                        excelUploadWarehouse === 'ALL' ||
                        (excelUploadType === 'plan' && !excelTargetContainer.trim())
                      }
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      {isUploadingExcel ? (
                        <span>Translating & Ingesting...</span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{excelUploadType === 'plan' ? 'Process & Load into Container' : 'Translate & Save in DB'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW DUPLICATES LIST */}
      {selectedDuplicatesModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="p-5 bg-amber-500 text-slate-950 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <AlertCircle className="w-5 h-5 text-slate-950" />
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">
                    Duplicate Receipts ({selectedDuplicatesModal.duplicateCount})
                  </h3>
                  <p className="text-[11px] text-slate-900 font-medium">
                    Batch: {selectedDuplicatesModal.uploadId} • File: {selectedDuplicatesModal.fileName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDuplicatesModal(null)}
                className="text-slate-800 hover:text-black p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              <p className="text-xs text-slate-600">
                These receipt numbers already existed in China Warehouse stock or appeared multiple times in the uploaded file. To prevent duplicate entries, they were skipped while all unique records were saved.
              </p>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Receipt #</th>
                      <th className="p-2.5 text-center">Row in File</th>
                      <th className="p-2.5">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDuplicatesModal.duplicates && selectedDuplicatesModal.duplicates.length > 0 ? (
                      selectedDuplicatesModal.duplicates.map((dup, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">{dup.receipt}</td>
                          <td className="p-2.5 text-center text-slate-500 font-mono">{dup.row ? `Row ${dup.row}` : '—'}</td>
                          <td className="p-2.5 text-slate-600">{dup.reason}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-400">
                          No duplicate records detailed.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDuplicatesModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BULK EDIT WAREHOUSE RECEIPTS ── */}
      {isBulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-600 rounded-xl text-white">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Bulk Edit Warehouse Receipts
                  </h3>
                  <span className="text-xs text-blue-300 font-medium">
                    Updating {selectedReceiptIds.size} selected receipt(s) in China WH Stock
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkEditOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleBulkEditSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl text-xs text-blue-900">
                <p className="font-bold flex items-center space-x-1.5">
                  <span>ℹ️ Check the checkbox for only the fields you wish to update in bulk:</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedReceiptObjects.map((r) => (
                    <span
                      key={r._id || r.receipt}
                      className="bg-white text-slate-800 font-mono text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200"
                    >
                      {r.receipt}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {/* 1. Warehouse */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkFieldsToUpdate.warehouse}
                        onChange={(e) =>
                          setBulkFieldsToUpdate((prev) => ({ ...prev, warehouse: e.target.checked }))
                        }
                        className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                      />
                      <span>Update Receiving China Warehouse</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseModalContext('bulkEdit');
                        setIsAddWarehouseModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ New</span>
                    </button>
                  </div>
                  {bulkFieldsToUpdate.warehouse && (
                    <select
                      value={bulkEditWarehouse}
                      onChange={(e) => setBulkEditWarehouse(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                      {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                        <option value="" disabled>
                          No warehouses created yet — Click '+ New' above
                        </option>
                      ) : (
                        availableWarehouses
                          .filter((w) => w !== 'ALL')
                          .map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))
                      )}
                    </select>
                  )}
                </div>

                {/* 2. Party / Shipper Name */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.party}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, party: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Party / Shipper Name</span>
                  </label>
                  {bulkFieldsToUpdate.party && (
                    <input
                      type="text"
                      placeholder="e.g. ABC Trading Co. / Client Name"
                      value={bulkEditParty}
                      onChange={(e) => setBulkEditParty(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                {/* 3. Received Date */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.date}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, date: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Goods Received Date</span>
                  </label>
                  {bulkFieldsToUpdate.date && (
                    <input
                      type="date"
                      value={bulkEditDate}
                      onChange={(e) => setBulkEditDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                {/* 4. Packaging Type */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.packaging}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, packaging: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Packaging Type</span>
                  </label>
                  {bulkFieldsToUpdate.packaging && (
                    <input
                      type="text"
                      placeholder="e.g. Carton, Wooden Box, Pallet, Bag"
                      value={bulkEditPackaging}
                      onChange={(e) => setBulkEditPackaging(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                {/* 5. Commodity / Item Description */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.commodity}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, commodity: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Commodity Description (Supports Chinese with Auto-Translation)</span>
                  </label>
                  {bulkFieldsToUpdate.commodity && (
                    <input
                      type="text"
                      placeholder="e.g. 塑料玩具 / Plastic Toys / Hardware Fittings"
                      value={bulkEditCommodity}
                      onChange={(e) => setBulkEditCommodity(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                {/* 6. Cargo Marks */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.marks}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, marks: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Cargo Marks (Main Mark & Sub Mark)</span>
                  </label>
                  {bulkFieldsToUpdate.marks && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <input
                        type="text"
                        placeholder="★ Main Mark (e.g. USI/MUM)"
                        value={bulkEditMainMark}
                        onChange={(e) => setBulkEditMainMark(e.target.value)}
                        className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <input
                        type="text"
                        placeholder="◆ Sub Mark (e.g. 01/50)"
                        value={bulkEditSubMark}
                        onChange={(e) => setBulkEditSubMark(e.target.value)}
                        className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* 7. Notes */}
                <div className="p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 bg-slate-50/50">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkFieldsToUpdate.notes}
                      onChange={(e) =>
                        setBulkFieldsToUpdate((prev) => ({ ...prev, notes: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Update Notes / Remarks</span>
                  </label>
                  {bulkFieldsToUpdate.notes && (
                    <textarea
                      rows={2}
                      placeholder="Warehouse notes, party contact, or handling instructions..."
                      value={bulkEditNotes}
                      onChange={(e) => setBulkEditNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <span>Applying Updates...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save & Apply Bulk Updates</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: BULK DELETE CONFIRMATION ── */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-6 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/20 rounded-xl text-white">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Bulk Delete Warehouse Receipts
                  </h3>
                  <span className="text-xs text-red-100 font-medium">
                    Permanent deletion of {selectedReceiptIds.size} receipt(s)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-950 font-bold font-mono">
                  {selectedReceiptIds.size}
                </strong>{' '}
                warehouse receipt(s) from China warehouse inward stock?
              </p>

              <div className="max-h-32 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-1.5">
                {selectedReceiptObjects.map((r) => (
                  <span
                    key={r._id || r.receipt}
                    className="bg-white text-slate-900 font-mono text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200"
                  >
                    {r.receipt} ({r.quantity} CTN)
                  </span>
                ))}
              </div>

              {selectedWithLoadedCargo.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl space-y-2 text-xs text-amber-950">
                  <div className="flex items-center space-x-2 font-bold text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Warning: Cargo Already Allocated to Containers</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <strong>{selectedWithLoadedCargo.length}</strong> of the selected receipts have cargo cartons already loaded into internal container plans:
                  </p>
                  <ul className="list-disc list-inside text-[11px] font-mono text-amber-900 font-semibold space-y-0.5 max-h-20 overflow-y-auto">
                    {selectedWithLoadedCargo.map((r) => (
                      <li key={r._id || r.receipt}>
                        Receipt {r.receipt} — {r.loadedQuantity} CTN loaded
                      </li>
                    ))}
                  </ul>

                  <label className="flex items-start space-x-2 pt-2 border-t border-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceBulkDelete}
                      onChange={(e) => setForceBulkDelete(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-red-600 accent-red-600"
                    />
                    <span className="font-bold text-red-800">
                      I confirm force deletion: Roll back and remove these cartons from container loading plans.
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteSubmit}
                  disabled={actionLoading || (selectedWithLoadedCargo.length > 0 && !forceBulkDelete)}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirm Bulk Delete ({selectedReceiptIds.size})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: SINGLE RECEIPT EDIT ── */}
      {isSingleEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-600 rounded-xl text-white">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Edit Warehouse Receipt
                  </h3>
                  <span className="text-xs text-blue-300 font-mono font-bold">
                    Receipt: {editReceiptNumber}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSingleEditOpen(false);
                  setEditingReceiptItem(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSingleEditSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Receipt Number</label>
                  <input
                    type="text"
                    value={editReceiptNumber}
                    disabled
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 font-mono font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Party / Shipper</label>
                  <input
                    type="text"
                    value={editParty}
                    onChange={(e) => setEditParty(e.target.value)}
                    placeholder="Party Name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">China Warehouse</label>
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseModalContext('singleEdit');
                        setIsAddWarehouseModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ New</span>
                    </button>
                  </div>
                  <select
                    value={singleEditWarehouse}
                    onChange={(e) => setSingleEditWarehouse(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                      <option value="" disabled>
                        No warehouses created yet — Click '+ New' above
                      </option>
                    ) : (
                      availableWarehouses
                        .filter((w) => w !== 'ALL')
                        .map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))
                    )}
                  </select>
                  {singleEditReceiptDuplicate && (
                    <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-1.5 text-red-700 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Duplicate Receipt Error:</span> Receipt #{editReceiptNumber} already exists in {singleEditWarehouse}. Every warehouse must have strictly unique receipt numbers.
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Received Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Total Inward Quantity (CTN)
                  </label>
                  <input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Packaging</label>
                  <input
                    type="text"
                    value={editPackaging}
                    onChange={(e) => setEditPackaging(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Commodity / Item Description (Supports Chinese)
                  </label>
                  <input
                    type="text"
                    value={editCommodity}
                    onChange={(e) => setEditCommodity(e.target.value)}
                    placeholder="Enter commodity description..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">★ Main Mark</label>
                  <input
                    type="text"
                    value={editMainMark}
                    onChange={(e) => setEditMainMark(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-mono font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">◆ Sub Mark</label>
                  <input
                    type="text"
                    value={editSubMark}
                    onChange={(e) => setEditSubMark(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 font-mono font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Gross Weight</label>
                  <input
                    type="text"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    placeholder="e.g. 520 KG"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Volume (CBM)</label>
                  <input
                    type="text"
                    value={editVolume}
                    onChange={(e) => setEditVolume(e.target.value)}
                    placeholder="e.g. 2.45"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Notes / Warehouse Remarks</label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Optional remarks..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsSingleEditOpen(false);
                    setEditingReceiptItem(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !!singleEditReceiptDuplicate}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <span>Saving Changes...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Warehouse Modal */}
      {isAddWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center">
                  <Warehouse className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Register New China Warehouse</h3>
                  <p className="text-[11px] text-slate-400">Add an operational receiving facility on the fly</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddWarehouseModalOpen(false)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouse} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Warehouse Name*
                </label>
                <input
                  type="text"
                  value={newWarehouseName}
                  onChange={(e) => setNewWarehouseName(e.target.value)}
                  placeholder="e.g. Qingdao Warehouse or Shantou Logistics Hub"
                  required
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Must be unique. Will automatically appear across all receiving and planning menus.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    City / Province
                  </label>
                  <input
                    type="text"
                    value={newWarehouseCity}
                    onChange={(e) => setNewWarehouseCity(e.target.value)}
                    placeholder="e.g. Qingdao, Shandong"
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Warehouse Code
                  </label>
                  <input
                    type="text"
                    value={newWarehouseCode}
                    onChange={(e) => setNewWarehouseCode(e.target.value.toUpperCase())}
                    placeholder="e.g. QD-01"
                    className="w-full px-3 py-2 font-mono text-xs font-bold uppercase rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddWarehouseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWarehouse || !newWarehouseName.trim()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isCreatingWarehouse ? (
                    <span>Registering...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Create Warehouse</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit China Warehouse Modal */}
      {isEditWarehouseOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Edit China Warehouse</h3>
                  <p className="text-[11px] text-blue-200">Rename warehouse and update facility details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditWarehouseOpen(false)}
                className="text-white/80 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setEditWarehouseMode('rename')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                  editWarehouseMode === 'rename'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Rename Warehouse
              </button>
              <button
                type="button"
                onClick={() => setEditWarehouseMode('merge')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                  editWarehouseMode === 'merge'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Merge into Existing Warehouse
              </button>
            </div>

            <form onSubmit={handleEditWarehouseSubmit} className="p-6 space-y-4">
              {editWarehouseMode === 'rename' ? (
                <>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                    ℹ️ <strong>Database Synchronization:</strong> Renaming this warehouse will automatically update all receipts, container plans, and shipments currently mapped to <span className="font-bold">{editWarehouseOldName}</span> database-wide.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Warehouse Name *
                    </label>
                    <input
                      type="text"
                      value={editWarehouseNewName}
                      onChange={(e) => setEditWarehouseNewName(e.target.value)}
                      placeholder="e.g. Qingdao Logistics Hub"
                      required
                      className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        City / Province
                      </label>
                      <input
                        type="text"
                        value={editWarehouseCity}
                        onChange={(e) => setEditWarehouseCity(e.target.value)}
                        placeholder="e.g. Qingdao, Shandong"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Warehouse Code
                      </label>
                      <input
                        type="text"
                        value={editWarehouseCode}
                        onChange={(e) => setEditWarehouseCode(e.target.value.toUpperCase())}
                        placeholder="e.g. QD-01"
                        className="w-full px-3 py-2 font-mono text-xs font-bold uppercase rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 leading-relaxed">
                    🔀 <strong>Merge / Reassign Warehouse:</strong> Move all receipts, container plans, and cargo shipments from <span className="font-bold">{editWarehouseOldName}</span> into an existing China warehouse. Once migrated, <span className="font-bold">{editWarehouseOldName}</span> will be deleted automatically.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Select Existing Warehouse to Merge Into *
                    </label>
                    <select
                      value={editWarehouseTargetMerge}
                      onChange={(e) => setEditWarehouseTargetMerge(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="" disabled>-- Select Existing Destination Warehouse --</option>
                      {availableWarehouses
                        .filter((w) => w !== 'ALL' && w.toLowerCase() !== editWarehouseOldName.toLowerCase())
                        .map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      All receipts, container plans, and cargo items will be transferred to this warehouse.
                    </p>
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDeleteWarehouse(editWarehouseOldName)}
                  disabled={isSubmittingEditWarehouse}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition flex items-center space-x-1.5"
                  title={`Delete warehouse '${editWarehouseOldName}' (strict validation applies)`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Delete Warehouse</span>
                </button>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditWarehouseOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isSubmittingEditWarehouse ||
                      (editWarehouseMode === 'rename' ? !editWarehouseNewName.trim() : !editWarehouseTargetMerge.trim())
                    }
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {isSubmittingEditWarehouse ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>{editWarehouseMode === 'merge' ? 'Merge All Data' : 'Save Changes'}</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: MANUAL GOODS RECEIVED IN WAREHOUSE (DIRECT ENTRY, NO EXCEL) ── */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="p-6 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/20 rounded-xl text-white">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Manual Goods Received Entry
                  </h3>
                  <span className="text-xs text-emerald-100 font-medium">
                    Direct warehouse stock entry (No Excel file upload required)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiveModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveGoodsSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Receipt Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Receipt # / Inward Bill *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RCP-2026-001 or YIWU-8821"
                    value={receiveReceipt}
                    onChange={(e) => setReceiveReceipt(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                  {receiveReceiptDuplicate && (
                    <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-1.5 text-red-700 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Duplicate Receipt Error:</span> Receipt #{receiveReceipt.trim()} already exists in {receiveWarehouse}. Every warehouse must have strictly unique receipt numbers.
                      </div>
                    </div>
                  )}
                </div>

                {/* Warehouse */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                      <span>Origin China Warehouse</span>
                      <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseModalContext('receive');
                        setIsAddWarehouseModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ New Warehouse</span>
                    </button>
                  </div>
                  <select
                    value={receiveWarehouse}
                    onChange={(e) => setReceiveWarehouse(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  >
                    {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                      <option value="" disabled>
                        No warehouses created yet — Click '+ New Warehouse' above
                      </option>
                    ) : (
                      <>
                        <option value="" disabled>
                          -- Select China Warehouse --
                        </option>
                        {availableWarehouses
                          .filter((w) => w !== 'ALL')
                          .map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                      </>
                    )}
                  </select>
                </div>

                {availableWarehouses.filter((w) => w !== 'ALL').length === 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-start space-x-2 text-amber-900 text-xs md:col-span-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-bold">No Warehouse Found:</span> You cannot enter received goods until at least one China warehouse is created.
                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseModalContext('receive');
                          setIsAddWarehouseModalOpen(true);
                        }}
                        className="block mt-1 font-bold text-emerald-800 underline"
                      >
                        Click here to create a China warehouse now
                      </button>
                    </div>
                  </div>
                )}

                {/* Shipper / Party */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Party / Shipper / Supplier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Yiwu Trade Co. or General Shipper"
                    value={receiveParty}
                    onChange={(e) => setReceiveParty(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Warehouse Entry Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Warehouse Entry Record #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ENT-0091"
                    value={receiveWarehouseEntry}
                    onChange={(e) => setReceiveWarehouseEntry(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Received Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Date Received *
                  </label>
                  <input
                    type="date"
                    required
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Total Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Total Quantity (Cartons / Packages) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 50"
                    value={receiveQuantity}
                    onChange={(e) => setReceiveQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Packaging Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Packaging Type
                  </label>
                  <select
                    value={receivePackaging}
                    onChange={(e) => setReceivePackaging(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  >
                    <option value="Carton">Carton (箱)</option>
                    <option value="Wooden Box">Wooden Box (木箱)</option>
                    <option value="Pallet">Pallet (托盘)</option>
                    <option value="Bag">Bag (袋)</option>
                    <option value="Roll">Roll (卷)</option>
                    <option value="Bundle">Bundle (捆)</option>
                    <option value="Drum">Drum (桶)</option>
                  </select>
                </div>

                {/* Gross Weight */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Gross Weight
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 450 KG"
                    value={receiveWeight}
                    onChange={(e) => setReceiveWeight(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Volume (CBM) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Total Volume (CBM)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2.45 CBM"
                    value={receiveVolume}
                    onChange={(e) => setReceiveVolume(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Commodity Description */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Commodity Description (Supports Chinese / Auto-Translate)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 塑料玩具 / Plastic Toys / Hardware"
                    value={receiveCommodity}
                    onChange={(e) => setReceiveCommodity(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                  {liveTranslation.english && liveTranslation.english !== receiveCommodity && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                      Translation preview: {liveTranslation.english} {liveTranslation.chinese ? `(${liveTranslation.chinese})` : ''}
                    </p>
                  )}
                </div>

                {/* Main Marka */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    ★ Main Marka
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. USI/MUM"
                    value={receiveMainMark}
                    onChange={(e) => setReceiveMainMark(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Sub Marka */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    ◆ Sub Marka
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 01/50"
                    value={receiveSubMark}
                    onChange={(e) => setReceiveSubMark(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Notes / Remarks */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Warehouse Remarks / Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional handling notes, batch numbers, or supplier contacts..."
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Direct Container / Loading Plan Allocation */}
                <div className="md:col-span-2 p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={receiveAssignToPlan}
                        onChange={(e) => setReceiveAssignToPlan(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                      />
                      <span className="text-xs font-bold text-slate-900">
                        Directly Load into Container / Loading Plan
                      </span>
                    </label>
                    {receiveAssignToPlan && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm">
                        Internal Container Mandatory
                      </span>
                    )}
                  </div>

                  {receiveAssignToPlan && (
                    <div className="pt-2 border-t border-emerald-200/60 animate-fadeIn space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center justify-between">
                        <span>Loading Plan Number (Internal Container Number)</span>
                        <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>
                      </label>
                      <input
                        type="text"
                        list="manual-plans-list"
                        required={receiveAssignToPlan}
                        placeholder="Select or type internal plan (e.g. USI-01, PLAN-01)"
                        value={receiveLoadingPlan}
                        onChange={(e) => setReceiveLoadingPlan(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 text-xs font-mono font-bold uppercase rounded-xl border border-emerald-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <datalist id="manual-plans-list">
                        {loadingPlans.map((p) => (
                          <option key={p.container} value={p.container}>
                            {p.container} {p.containerNumber ? `(${p.containerNumber})` : ''} - {p.warehouse || 'China Warehouse'}
                          </option>
                        ))}
                      </datalist>
                      <p className="text-[11px] text-emerald-800">
                        Mandatory rule: Providing the Internal Container Number is mandatory when allocating directly to a loading plan.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsReceiveModalOpen(false);
                    setReceiveAssignToPlan(false);
                    setReceiveLoadingPlan('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isReceivingGoods ||
                    availableWarehouses.filter((w) => w !== 'ALL').length === 0 ||
                    !receiveWarehouse.trim() ||
                    receiveWarehouse === 'ALL' ||
                    !!receiveReceiptDuplicate ||
                    !receiveReceipt.trim() ||
                    (receiveAssignToPlan && !receiveLoadingPlan.trim())
                  }
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isReceivingGoods ? (
                    <span>Saving Inward Goods...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>{receiveAssignToPlan ? 'Record & Load into Plan' : 'Record Inward Stock'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ALTER / RENAME CONTAINER DATABASE-WIDE ── */}
      {isAlterContainerOpen && containerToAlter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
            <div className="p-6 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/20 rounded-xl text-white">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Alter / Rename Container Database-Wide
                  </h3>
                  <span className="text-xs text-blue-100 font-medium">
                    Propagate alias, carrier, or actual container changes across all collections
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAlterContainerOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAlterContainerSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                ℹ️ <strong>Database Synchronization Rule:</strong> If you rename the container identifier (e.g. from <span className="font-mono font-bold">{containerToAlter.container}</span> to another name) or update the actual carrier container number, the system will automatically update the Container fleet master and <strong>all matching shipment manifest items</strong> in the database.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Internal Container Alias */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Internal Container Alias *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. USSI-01, USI-02"
                    value={alterContainerAlias}
                    onChange={(e) => setAlterContainerAlias(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 uppercase"
                  />
                  <span className="text-[10px] text-slate-400">Originally: {containerToAlter.container}</span>
                </div>

                {/* Actual Carrier Container Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Actual Carrier Container No
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="e.g. MSCU1234567"
                      value={alterActualNumber}
                      onChange={(e) => setAlterActualNumber(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 uppercase"
                    />
                    <button
                      type="button"
                      onClick={handleLookupAlterContainer}
                      disabled={isLookingUpAlterApi || !alterActualNumber.trim()}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50 flex items-center space-x-1.5 shrink-0"
                      title="Fetch loading date and live ETA from JSONCargo API"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLookingUpAlterApi ? 'animate-spin text-white' : ''}`} />
                      <span>{isLookingUpAlterApi ? 'Searching...' : '⚡ Search API'}</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400">Carrier tracking number (click '⚡ Search API' to prefill loading date & ETA)</span>
                </div>

                {/* Carrier Line */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Shipping Carrier
                  </label>
                  <select
                    value={alterShippingLine}
                    onChange={(e) => setAlterShippingLine(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900"
                  >
                    {SHIPPING_CARRIERS.map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Alter API Status Alert Banner */}
                {alterApiLookupStatus && (
                  <div
                    className={`md:col-span-2 p-3 rounded-xl text-xs font-semibold flex items-start space-x-2 animate-fadeIn ${
                      alterApiLookupStatus.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {alterApiLookupStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <span>{alterApiLookupStatus.message}</span>
                    </div>
                  </div>
                )}

                {/* Warehouse */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Loading Warehouse
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseModalContext('alter');
                        setIsAddWarehouseModalOpen(true);
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ New</span>
                    </button>
                  </div>
                  <select
                    value={alterWarehouse}
                    onChange={(e) => setAlterWarehouse(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900"
                  >
                    {availableWarehouses.filter((w) => w !== 'ALL').length === 0 ? (
                      <option value="" disabled>
                        No warehouses created yet — Click '+ New' above
                      </option>
                    ) : (
                      availableWarehouses
                        .filter((w) => w !== 'ALL')
                        .map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))
                    )}
                  </select>
                </div>

                {/* Loading Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Loading Date</span>
                    {alterActualNumber.trim() && <span className="text-red-600 font-bold text-[10px]">* Mandatory</span>}
                  </label>
                  <input
                    type="date"
                    required={!!alterActualNumber.trim()}
                    value={alterLoadingDate}
                    onChange={(e) => setAlterLoadingDate(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 ${
                      alterApiLookupStatus && alterApiLookupStatus.type === 'warning'
                        ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                        : 'border-slate-200 bg-slate-50 focus:bg-white'
                    }`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {alterApiLookupStatus?.loadingDate
                      ? `✓ Populated from JSON Cargo API: ${alterApiLookupStatus.loadingDate}`
                      : 'If API does not find the container, please enter the Loading Date manually.'}
                  </p>
                </div>

                {/* Destination */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Destination Port
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Nhava Sheva / Mundra, India"
                    value={alterShippedTo}
                    onChange={(e) => setAlterShippedTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Public ETA Delivery Buffer */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Public Delivery Buffer (Days)</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Default: +10 Days</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={alterEtaBufferDays}
                    onChange={(e) => setAlterEtaBufferDays(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Public portal shows Carrier ETA + {alterEtaBufferDays} buffer days.
                  </p>
                </div>
              </div>

              {/* Auto Sync Checkbox */}
              {alterActualNumber.trim() && (
                <div className="pt-2">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alterAutoSync}
                      onChange={(e) => setAlterAutoSync(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                    />
                    <span>Automatically call Carrier API to fetch live ETA & tracking</span>
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsAlterContainerOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAlter}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSubmittingAlter ? (
                    <span>Updating Database...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Update Container Across Database</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONTAINER-WISE CARGO LOADING (CONTAINER-WISE PLANNING ONLY) ── */}
      {isContainerWiseLoadOpen && containerWisePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
            <div className="p-6 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-white/20 rounded-xl text-white">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white font-mono">
                    Load Cargo into {containerWisePlan.container}
                  </h3>
                  <span className="text-xs text-emerald-100 font-medium">
                    Container-Wise Planning: Direct allocation from received China warehouse stock
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsContainerWiseLoadOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleContainerWiseLoadSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Container Summary Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Target Container: </span>
                  <strong className="text-emerald-950 font-black font-mono text-sm">{containerWisePlan.container}</strong>
                  {containerWisePlan.containerNumber && (
                    <span className="text-slate-600 ml-1.5 font-mono">({containerWisePlan.containerNumber})</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Origin Warehouse: </span>
                  <strong className="text-slate-800">{containerWisePlan.warehouse || 'China Warehouse'}</strong>
                </div>
                <div className="w-full pt-1 border-t border-emerald-200/60 flex justify-between text-[11px] text-emerald-900">
                  <span>Currently Loaded: <strong>{containerWisePlan.totalQuantity || 0} CTN</strong> ({containerWisePlan.shipmentCount || 0} items)</span>
                  <span>Destination: <strong>{containerWisePlan.shippedTo || 'Nhava Sheva / Mundra, India'}</strong></span>
                </div>
              </div>

              {availableReceiptsWithStock.length === 0 ? (
                <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                  <h4 className="text-sm font-bold text-amber-900">No Received Stock Available</h4>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    There are currently no warehouse receipts with remaining received stock in China warehouses.
                    Under system integrity rules, you cannot load any container without first receiving goods.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsContainerWiseLoadOpen(false);
                      const userWhs = availableWarehouses.filter((w) => w !== 'ALL');
                      if (userWhs.length === 0) {
                        alert('No China warehouse found! You cannot enter received goods until at least one China warehouse is created. Please create a warehouse first.');
                        setWarehouseModalContext('receive');
                        setIsAddWarehouseModalOpen(true);
                        return;
                      }
                      if (!receiveWarehouse || receiveWarehouse === 'ALL') {
                        setReceiveWarehouse(userWhs[0]);
                      }
                      setIsReceiveModalOpen(true);
                    }}
                    className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    + Record Received Goods First
                  </button>
                </div>
              ) : (
                <>
                  {/* Select Received Warehouse Stock */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Select Received Goods from Warehouse Stock *
                    </label>
                    <select
                      value={containerWiseReceiptId}
                      onChange={(e) => {
                        const rId = e.target.value;
                        setContainerWiseReceiptId(rId);
                        const r = availableReceiptsWithStock.find((x) => (x._id || x.receipt) === rId);
                        if (r) {
                          const rem = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
                          setContainerWiseQuantity(rem > 0 ? rem : '');
                          setContainerWiseWeight(r.weight || '');
                          setContainerWiseVolume(r.volume || '');
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    >
                      {availableReceiptsWithStock.map((r) => {
                        const rem = r.remainingQuantity !== undefined ? r.remainingQuantity : r.quantity - (r.loadedQuantity || 0);
                        return (
                          <option key={r._id || r.receipt} value={r._id || r.receipt}>
                            Receipt #{r.receipt} | {r.party || 'General'} | {r.english || r.commodity || 'Goods'} ({rem} CTN available in {r.warehouse})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Selected Receipt Stock Card */}
                  {selectedContainerWiseReceipt && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Receipt Number:</span>
                        <span className="font-mono font-black text-slate-900 text-sm">#{selectedContainerWiseReceipt.receipt}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Shipper / Party:</span>
                        <span className="font-bold text-slate-800">{selectedContainerWiseReceipt.party || 'General Party'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Commodity Description:</span>
                        <span className="font-bold text-slate-800 truncate max-w-[240px]">
                          {selectedContainerWiseReceipt.english || selectedContainerWiseReceipt.commodity || 'Goods'}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Received</span>
                          <strong className="text-slate-900 text-xs">{selectedContainerWiseReceipt.quantity} CTN</strong>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Already Loaded</span>
                          <strong className="text-slate-600 text-xs">{selectedContainerWiseReceipt.loadedQuantity || 0} CTN</strong>
                        </div>
                        <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                          <span className="text-[10px] text-emerald-700 font-bold uppercase block">Available Stock</span>
                          <strong className="text-emerald-700 text-xs">
                            {selectedContainerWiseReceipt.remainingQuantity !== undefined
                              ? selectedContainerWiseReceipt.remainingQuantity
                              : selectedContainerWiseReceipt.quantity - (selectedContainerWiseReceipt.loadedQuantity || 0)} CTN
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quantity to Load into this Container */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Quantity to Load into {containerWisePlan.container} (CTN) *
                      </label>
                      {selectedContainerWiseReceipt && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          Max available: {selectedContainerWiseReceipt.remainingQuantity !== undefined ? selectedContainerWiseReceipt.remainingQuantity : selectedContainerWiseReceipt.quantity} CTN
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={
                        selectedContainerWiseReceipt
                          ? selectedContainerWiseReceipt.remainingQuantity !== undefined
                            ? selectedContainerWiseReceipt.remainingQuantity
                            : selectedContainerWiseReceipt.quantity
                          : undefined
                      }
                      required
                      placeholder="e.g. 25"
                      value={containerWiseQuantity}
                      onChange={(e) =>
                        setContainerWiseQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                      }
                      className={`w-full px-3 py-2 text-sm font-black rounded-xl border focus:outline-none focus:ring-2 ${
                        selectedContainerWiseReceipt &&
                        Number(containerWiseQuantity) >
                          (selectedContainerWiseReceipt.remainingQuantity !== undefined
                            ? selectedContainerWiseReceipt.remainingQuantity
                            : selectedContainerWiseReceipt.quantity)
                          ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-500'
                          : 'border-slate-300 bg-white text-slate-900 focus:ring-emerald-500'
                      }`}
                    />
                    {selectedContainerWiseReceipt &&
                      Number(containerWiseQuantity) >
                        (selectedContainerWiseReceipt.remainingQuantity !== undefined
                          ? selectedContainerWiseReceipt.remainingQuantity
                          : selectedContainerWiseReceipt.quantity) && (
                        <p className="text-[11px] text-red-600 font-bold mt-1">
                          ⚠️ Strict Rule: You cannot load more goods than received in China warehouse.
                        </p>
                      )}
                  </div>

                  {/* Weight and Volume */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Gross Weight (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 250 KG"
                        value={containerWiseWeight}
                        onChange={(e) => setContainerWiseWeight(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Volume CBM (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1.25 CBM"
                        value={containerWiseVolume}
                        onChange={(e) => setContainerWiseVolume(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsContainerWiseLoadOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        isContainerWiseLoading ||
                        !containerWiseQuantity ||
                        (selectedContainerWiseReceipt &&
                          Number(containerWiseQuantity) >
                            (selectedContainerWiseReceipt.remainingQuantity !== undefined
                              ? selectedContainerWiseReceipt.remainingQuantity
                              : selectedContainerWiseReceipt.quantity))
                      }
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      {isContainerWiseLoading ? (
                        <span>Allocating to Container...</span>
                      ) : (
                        <>
                          <Boxes className="w-4 h-4" />
                          <span>Load into {containerWisePlan.container}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 1: PROCESS-WISE RECEIPT DELETION (UNMARK LOADED GOODS FIRST) ── */}
      {receiptToUnmarkAndDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-red-900 to-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-600/40 border border-red-500/50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Process Integrity: Loaded Receipt Deletion</h3>
                  <p className="text-[11px] text-red-200">Goods are currently allocated inside container(s)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptToUnmarkAndDelete(null)}
                className="text-white/80 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 leading-relaxed">
                ⚠️ <strong>Integrity Rule:</strong> Receipt <strong className="font-mono">#{receiptToUnmarkAndDelete.receipt.receipt}</strong> ({receiptToUnmarkAndDelete.receipt.quantity} CTN total) is currently loaded inside container loading plans. You cannot delete a receipt until it is unmarked / unloaded from all containers.
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Currently Loaded In:
                </p>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Container Plan</th>
                        <th className="p-2.5">Carrier / No</th>
                        <th className="p-2.5 text-right">Loaded Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {receiptToUnmarkAndDelete.containers.map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">{c.container}</td>
                          <td className="p-2.5 font-mono text-slate-600">
                            {c.containerNumber ? `${c.containerNumber} (${c.shippingLine || 'MSC'})` : 'In Planning'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">{c.quantity} CTN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold">Automated Process Action:</span> Clicking &ldquo;Unmark &amp; Delete&rdquo; will automatically unmark / remove this cargo from the container(s), restore the container counts, and delete the receipt entry from the system.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setReceiptToUnmarkAndDelete(null)}
                  disabled={isDeletingProcess}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnmarkAndDeleteReceipt}
                  disabled={isDeletingProcess}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isDeletingProcess ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Unmarking &amp; Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Unmark from Containers &amp; Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: PROCESS-WISE CONTAINER DELETION (UNLOAD ALL CARGO FIRST) ── */}
      {containerToUnloadAndDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-red-900 to-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-600/40 border border-red-500/50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Process Integrity: Container Deletion</h3>
                  <p className="text-[11px] text-red-200">Container contains loaded cargo goods</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContainerToUnloadAndDelete(null)}
                className="text-white/80 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 leading-relaxed">
                ⚠️ <strong>Integrity Rule:</strong> Container plan <strong className="font-mono">{containerToUnloadAndDelete.container}</strong> currently holds <strong className="font-bold">{containerToUnloadAndDelete.totalQuantity || 0} CTN</strong> across <strong className="font-bold">{containerToUnloadAndDelete.shipmentCount || 0} cargo items</strong>. Under system integrity rules, you must unload the container before deleting it.
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold">Safe Unload &amp; Delete:</span> Clicking &ldquo;Unload Cargo &amp; Delete Container&rdquo; will restore all {containerToUnloadAndDelete.totalQuantity || 0} cartons back to China Warehouse stock as available items, and then delete the container plan.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setContainerToUnloadAndDelete(null)}
                  disabled={isDeletingProcess}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnloadAndDeleteContainer}
                  disabled={isDeletingProcess}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isDeletingProcess ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Unloading &amp; Deleting...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>⚡ Unload Cargo to Stock &amp; Delete Container</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: DIRECT LOAD & UNLOAD GOODS FROM CONTAINER ── */}
      {containerToUnloadGoods && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-amber-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-amber-900 to-orange-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-600/40 border border-amber-500/50 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Unload Goods: {containerToUnloadGoods.container}</h3>
                  <p className="text-[11px] text-amber-200">
                    Carrier: {containerToUnloadGoods.containerNumber || 'Planning'} ({containerToUnloadGoods.shippingLine || 'MSC'}) | Loaded: {containerToUnloadGoods.totalQuantity || 0} CTN
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContainerToUnloadGoods(null)}
                className="text-white/80 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-center justify-between">
                <span>
                  Unload individual items back to warehouse stock, or click <strong>Unload All Cargo</strong> to restore all goods into China Warehouse stock at once.
                </span>
                <button
                  type="button"
                  onClick={() => handleUnloadAllCargo(containerToUnloadGoods)}
                  className="ml-3 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-sm shrink-0 transition flex items-center space-x-1"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>⚡ Unload All Cargo</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Receipt #</th>
                      <th className="p-2.5">Shipper / Party</th>
                      <th className="p-2.5">Commodity</th>
                      <th className="p-2.5 text-center">Cartons</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(() => {
                      const livePlan = loadingPlans.find((p) => p.container === containerToUnloadGoods.container) || containerToUnloadGoods;
                      const items = livePlan.items || [];
                      if (items.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400 font-semibold">
                              No cargo items currently loaded in this container.
                            </td>
                          </tr>
                        );
                      }
                      return items.map((item) => (
                        <tr key={item._id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">#{item.receipt}</td>
                          <td className="p-2.5 font-bold text-slate-800">{item.party || 'General'}</td>
                          <td className="p-2.5 text-slate-600 truncate max-w-[180px]">
                            {item.english || item.commodity || 'Goods'}
                          </td>
                          <td className="p-2.5 text-center font-black text-slate-900">{item.quantity} CTN</td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await handleDeallocateItem(item._id);
                              }}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition inline-flex items-center space-x-1"
                              title="Unload this cargo item back to warehouse stock"
                            >
                              <ArrowDownLeft className="w-3 h-3 text-amber-600" />
                              <span>Unload Item</span>
                            </button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setContainerToUnloadGoods(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setContainerToUnloadGoods(null);
                  handleOpenContainerWiseLoad(containerToUnloadGoods);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Load More Goods</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: PROCESS-WISE WAREHOUSE DELETION (RECEIPTS EXIST) ── */}
      {warehouseToDeleteWithReceipts && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-fadeIn">
            <div className="p-5 bg-gradient-to-r from-red-900 to-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-600/40 border border-red-500/50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-200" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Process Integrity: Warehouse Deletion</h3>
                  <p className="text-[11px] text-red-200">Receipt records are mapped to this warehouse</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWarehouseToDeleteWithReceipts(null)}
                className="text-white/80 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 leading-relaxed">
                ⚠️ <strong>Integrity Rule:</strong> Warehouse <strong className="font-bold">{warehouseToDeleteWithReceipts.warehouse}</strong> currently contains <strong className="font-bold">{warehouseToDeleteWithReceipts.count} receipt entry/entries</strong>. Under system integrity rules, you cannot delete a warehouse while receipt entries exist.
              </div>

              <div className="space-y-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                  <strong className="text-slate-900">Option A: Review or Delete Receipts First</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Filter by this warehouse in China Warehouse Stock to review, edit, or delete receipts individually.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  <strong className="text-amber-950">Option B: Automated Process Cascade</strong>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Unmark all loaded goods from container plans, delete all {warehouseToDeleteWithReceipts.count} receipts, and delete this warehouse.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWarehouseToDeleteWithReceipts(null)}
                  disabled={isDeletingProcess}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch(setSelectedWarehouse(warehouseToDeleteWithReceipts.warehouse));
                      setWarehouseToDeleteWithReceipts(null);
                    }}
                    disabled={isDeletingProcess}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    View Receipts in Stock
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteWarehouseWithReceipts}
                    disabled={isDeletingProcess}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {isDeletingProcess ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deleting All...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete All Receipts &amp; Warehouse</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
