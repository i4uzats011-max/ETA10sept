'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { clearMobileSession } from '@/lib/mobileBridge';
import Link from 'next/link';
import {
  Truck,
  Ship,
  CheckCircle2,
  Clock,
  Search,
  Download,
  FileText,
  RefreshCw,
  LogOut,
  FileSpreadsheet,
  Box,
  Layers,
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
  Key,
  Volume2,
  Send,
  Zap,
  ShieldCheck,
  Trash2,
  Lock,
  AlertTriangle,
  Boxes,
  Warehouse,
  PackageCheck,
  PackageX,
  ShieldAlert,
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { generateBillPDF } from '@/lib/billPdf';
import { triggerNotificationAlert } from '@/lib/soundNotification';

interface ContainerETA {
  _id?: string;
  container: string;
  containerNumber?: string;
  eta?: string;
  loadingDate?: string;
  status?: string;
  currentLocation?: string;
  totalQuantity?: number;
  totalWeight?: string;
  totalVolume?: string;
  isDelivered?: boolean;
}

interface CargoItem {
  _id?: string;
  receipt: string;
  mainMarka?: string;
  subMarka?: string;
  party?: string;
  commodity?: string;
  packages: number;
  weight?: string;
  volume?: string;
  salesStatus?: 'Normal' | 'Available to Deliver' | 'Hold';
  salesRate?: string;
  salesRemarks?: string;
  remainingQuantity?: number;
}

interface DeliveryReceipt {
  _id: string;
  receipt: string;
  container: string;
  containerNumber?: string;
  marka: string;
  subMarka?: string;
  party: string;
  commodity: string;
  totalCartons: number;
  remainingCartons: number;
  weight?: string;
  volume?: string;
  salesStatus: 'Normal' | 'Available to Deliver' | 'Hold';
  holdReason?: string;
  isHold?: boolean;
  goodsReceivedStatus?: 'full' | 'partial' | 'not_received';
  receivedQuantity?: number;
  goodsReceivedRemarks?: string;
  goodsReceivedAt?: string;
  goodsReceivedBy?: string;
  unloadStatus?: 'fully_sent' | 'partly_sent' | 'not_in_container' | 'stored_in_warehouse';
  sentQuantity?: number;
  warehouseQuantity?: number;
  unloadRemarks?: string;
  unloadedAt?: string;
  unloadedBy?: string;
  isDelivered: boolean;
  phone?: string;
}

interface DispatchBill {
  _id: string;
  billNumber: string;
  receipt: string;
  container?: string;
  party?: string;
  mainMarka?: string;
  subMarka?: string;
  commodity?: string;
  totalAmount?: number;
  taxableValue?: number;
  igstAmount?: number;
  vehicleNumber?: string;
  totalCartons?: number;
  dispatchedCartons?: number;
  remainingCartons?: number;
  isDispatched?: boolean;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryAddress?: string;
  eWayBillNo?: string;
  createdAt?: string;
}

interface DispatchRequestItem {
  _id: string;
  receipt: string;
  container: string;
  containerNumber?: string;
  marka?: string;
  party?: string;
  commodity?: string;
  vehicleNumber: string;
  cartonCount: number;
  totalCartons?: number;
  place: string;
  status: 'Pending' | 'Billed' | 'Completed' | 'Cancelled';
  initiatedBy: string;
  initiatedByName?: string;
  initiatedAt: string;
  billerUsername?: string;
  billNumber?: string;
  billedAt?: string;
  remarks?: string;
}

export default function DispatcherPortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'delivery' | 'unload' | 'warehouse_stock' | 'requests' | 'bills' | 'eta'>('delivery');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [containerSearchInput, setContainerSearchInput] = useState('');
  const [goodsContainerSearchInput, setGoodsContainerSearchInput] = useState('');
  const [selectedGoodsContainer, setSelectedGoodsContainer] = useState('');

  // Container Unload Verification Modal State (4 Statuses: Not In Container, Partly Sent, Fully Sent, Stored in Warehouse)
  const [unloadModalOpen, setUnloadModalOpen] = useState(false);
  const [unloadReceipt, setUnloadReceipt] = useState<DeliveryReceipt | null>(null);
  const [unloadStatusChoice, setUnloadStatusChoice] = useState<'fully_sent' | 'partly_sent' | 'not_in_container' | 'stored_in_warehouse'>('fully_sent');
  const [unloadSentQuantity, setUnloadSentQuantity] = useState<number | ''>('');
  const [unloadRemarks, setUnloadRemarks] = useState('');
  const [unloadSubmitting, setUnloadSubmitting] = useState(false);
  const [unloadSuccessMsg, setUnloadSuccessMsg] = useState<string | null>(null);

  // SECTION 1: ETA Containers
  const [etaContainers, setEtaContainers] = useState<ContainerETA[]>([]);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);
  const [containerCargo, setContainerCargo] = useState<Record<string, CargoItem[]>>({});
  const [loadingCargo, setLoadingCargo] = useState<Record<string, boolean>>({});

  // SECTION 2: Delivery & Available Receipts
  const [deliveryItems, setDeliveryItems] = useState<DeliveryReceipt[]>([]);
  const [selectedDeliveryContainer, setSelectedDeliveryContainer] = useState<string>('');

  // Day-End Delivery Status Modal State (Goods Received by Party)
  const [dayEndModalOpen, setDayEndModalOpen] = useState(false);
  const [dayEndReceipt, setDayEndReceipt] = useState<DeliveryReceipt | null>(null);
  const [receivedType, setReceivedType] = useState<'full' | 'partial' | 'not_received'>('full');
  const [receivedQuantity, setReceivedQuantity] = useState<number | ''>('');
  const [dayEndRemarks, setDayEndRemarks] = useState('');
  const [dayEndSubmitting, setDayEndSubmitting] = useState(false);
  const [dayEndSuccessMsg, setDayEndSuccessMsg] = useState<string | null>(null);

  // Container Close Modal State
  const [containerCloseModalOpen, setContainerCloseModalOpen] = useState(false);
  const [containerCloseReceipts, setContainerCloseReceipts] = useState<any[]>([]);
  const [containerCloseSubmitting, setContainerCloseSubmitting] = useState(false);
  const [containerCloseSuccessMsg, setContainerCloseSuccessMsg] = useState<string | null>(null);

  // Dispatch Action Modal State
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<DeliveryReceipt | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [cartonCount, setCartonCount] = useState<number | ''>('');
  const [placeAddress, setPlaceAddress] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Self-Billing Modal State
  const [selfBillModalOpen, setSelfBillModalOpen] = useState(false);
  const [selfBillTaxable, setSelfBillTaxable] = useState<number>(2000);
  const [selfBillIgst, setSelfBillIgst] = useState<number>(18);

  // SECTION 3: Bills
  const [bills, setBills] = useState<DispatchBill[]>([]);

  // Requests
  const [requests, setRequests] = useState<DispatchRequestItem[]>([]);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch ETA containers
      const etaRes = await fetch('/api/dispatcher?section=eta');
      const etaData = await etaRes.json();
      if (etaData.success) setEtaContainers(etaData.containers || []);

      // Fetch Delivery items
      const delivRes = await fetch('/api/dispatcher?section=delivery');
      const delivData = await delivRes.json();
      if (delivData.success) {
        setDeliveryItems(delivData.deliveryItems || []);
      }

      // Fetch Bills
      const billsRes = await fetch('/api/dispatcher?section=bills');
      const billsData = await billsRes.json();
      if (billsData.success) setBills(billsData.bills || []);

      // Fetch Requests
      const reqRes = await fetch('/api/dispatcher?section=requests');
      const reqData = await reqRes.json();
      if (reqData.success) setRequests(reqData.requests || []);
    } catch (e) {
      console.error('Failed to fetch dispatcher data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh requests every 10s
    const timer = setInterval(async () => {
      try {
        const reqRes = await fetch('/api/dispatcher?section=requests');
        const reqData = await reqRes.json();
        if (reqData.success) setRequests(reqData.requests || []);
      } catch (e) {
        // quiet
      }
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Lazy load cargo for container
  const handleToggleContainerCargo = async (containerAlias: string) => {
    if (expandedContainer === containerAlias) {
      setExpandedContainer(null);
      return;
    }
    setExpandedContainer(containerAlias);

    if (!containerCargo[containerAlias]) {
      setLoadingCargo((prev) => ({ ...prev, [containerAlias]: true }));
      try {
        const res = await fetch(`/api/dispatcher?section=container_cargo&container=${encodeURIComponent(containerAlias)}`);
        const data = await res.json();
        if (data.success) {
          setContainerCargo((prev) => ({ ...prev, [containerAlias]: data.cargo || [] }));
        }
      } catch (e) {
        console.error('Failed to load cargo:', e);
      } finally {
        setLoadingCargo((prev) => ({ ...prev, [containerAlias]: false }));
      }
    }
  };

  // Open Dispatch Modal for Receipt
  const handleOpenDispatchModal = (receipt: DeliveryReceipt) => {
    setSelectedReceipt(receipt);
    setVehicleNumber('');
    setCartonCount(receipt.remainingCartons > 0 ? receipt.remainingCartons : receipt.totalCartons);
    setPlaceAddress('');
    setRemarks('');
    setActionSuccessMsg(null);
    setDispatchModalOpen(true);
  };

  // Submit "Initiate for Billing" (बिलिंग के लिए भेजें)
  const handleInitiateBilling = async () => {
    if (!selectedReceipt) return;
    if (!vehicleNumber.trim()) {
      alert('कृपया गाड़ी नंबर (Gaadi Number) दर्ज करें।');
      return;
    }
    if (!cartonCount || Number(cartonCount) <= 0) {
      alert('कृपया सही कार्टून संख्या (Carton Count) दर्ज करें।');
      return;
    }
    if (!placeAddress.trim()) {
      alert('कृपया डिलीवरी का स्थान / पता (Place / Address) दर्ज करें।');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate_billing',
          receipt: selectedReceipt.receipt,
          container: selectedReceipt.container,
          containerNumber: selectedReceipt.containerNumber || selectedReceipt.container || '',
          marka: selectedReceipt.marka,
          party: selectedReceipt.party,
          commodity: selectedReceipt.commodity,
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          cartonCount: Number(cartonCount),
          totalCartons: selectedReceipt.totalCartons,
          place: placeAddress.trim(),
          remarks: remarks.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate billing');

      // Trigger instant sound chime
      triggerNotificationAlert({
        title: '🚚 Dispatch Request Sent to Biller',
        body: `Receipt ${selectedReceipt.receipt} -> Gaadi: ${vehicleNumber.trim().toUpperCase()} (${cartonCount} CTN)`,
      });

      setActionSuccessMsg(`✓ सफलता! रसीद ${selectedReceipt.receipt} हेतु बिलिंग अनुरोध बिलर को भेज दिया गया है।`);
      setTimeout(() => {
        setDispatchModalOpen(false);
        fetchData();
        setActiveTab('requests');
      }, 1200);
    } catch (e: any) {
      alert(e?.message || 'Error initiating billing');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Dispatch Request (डिस्पैचर अपनी रिक्वेस्ट डिलीट कर सकता है)
  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm('क्या आप वाकई इस डिस्पैच अनुरोध को डिलीट करना चाहते हैं? (Are you sure you want to delete this dispatch request?)')) {
      return;
    }
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_request',
          requestId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((r) => r._id !== requestId));
        alert('✓ डिस्पैच अनुरोध सफलतापूर्वक डिलीट कर दिया गया है।');
      } else {
        alert(data.error || 'डिस्पैच अनुरोध डिलीट करने में विफल।');
      }
    } catch (e: any) {
      alert(e?.message || 'Error deleting request');
    }
  };

  // Submit Self-Billing (खुद से बिलिंग बनाएँ)
  const handleSelfBill = async () => {
    if (!selectedReceipt) return;
    if (!vehicleNumber.trim()) {
      alert('गाड़ी नंबर दर्ज करना अनिवार्य है।');
      return;
    }
    if (!cartonCount || Number(cartonCount) <= 0) {
      alert('कार्टून संख्या दर्ज करें।');
      return;
    }
    if (!placeAddress.trim()) {
      alert('डिलीवरी स्थान / पता दर्ज करें।');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'self_bill',
          receipt: selectedReceipt.receipt,
          container: selectedReceipt.container,
          marka: selectedReceipt.marka,
          party: selectedReceipt.party,
          commodity: selectedReceipt.commodity,
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          cartonCount: Number(cartonCount),
          place: placeAddress.trim(),
          taxableValue: selfBillTaxable,
          igstRate: selfBillIgst,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to self bill');

      triggerNotificationAlert({
        title: '🧾 Self-Bill Created Successfully',
        body: `Bill #${data.bill?.billNumber} generated for ${selectedReceipt.receipt}`,
      });

      alert(`✓ बिल सफलतापूर्वक तैयार हो गया है! बिल नंबर: ${data.bill?.billNumber}`);
      setSelfBillModalOpen(false);
      setDispatchModalOpen(false);
      fetchData();
      setActiveTab('bills');
    } catch (e: any) {
      alert(e?.message || 'Error creating self bill');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered views based on search
  const filteredEtaContainers = useMemo(() => {
    if (!searchQuery.trim()) return etaContainers;
    const q = searchQuery.toLowerCase();
    return etaContainers.filter(
      (c) =>
        c.container.toLowerCase().includes(q) ||
        (c.containerNumber && c.containerNumber.toLowerCase().includes(q)) ||
        (c.status && c.status.toLowerCase().includes(q))
    );
  }, [etaContainers, searchQuery]);

  // Distinct Containers in Delivery with Available Receipts count
  const deliveryContainers = useMemo(() => {
    const map = new Map<string, { container: string; count: number; availableCount: number }>();
    deliveryItems.forEach((item) => {
      const c = item.container?.trim();
      if (c && c !== 'Unassigned') {
        const existing = map.get(c) || { container: c, count: 0, availableCount: 0 };
        existing.count += 1;
        if (item.salesStatus === 'Available to Deliver' && !item.isHold) {
          existing.availableCount += 1;
        }
        map.set(c, existing);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.container.localeCompare(b.container));
  }, [deliveryItems]);

  // Matching containers filtered by search input (Clean Search without cluttered buttons)
  const matchingDeliveryContainers = useMemo(() => {
    if (!containerSearchInput.trim()) return deliveryContainers;
    const q = containerSearchInput.toLowerCase().trim();
    return deliveryContainers.filter((c) => c.container.toLowerCase().includes(q));
  }, [deliveryContainers, containerSearchInput]);

  const matchingGoodsContainers = useMemo(() => {
    if (!goodsContainerSearchInput.trim()) return deliveryContainers;
    const q = goodsContainerSearchInput.toLowerCase().trim();
    return deliveryContainers.filter((c) => c.container.toLowerCase().includes(q));
  }, [deliveryContainers, goodsContainerSearchInput]);

  // Delivery Items filtered strictly by Selected Container (Receipts do NOT auto-populate)
  const filteredDeliveryItems = useMemo(() => {
    // If no container selected, strictly do NOT auto-populate receipts
    if (!selectedDeliveryContainer) return [];

    const containerItems = deliveryItems.filter(
      (r) => r.container === selectedDeliveryContainer
    );

    if (!searchQuery.trim()) return containerItems;
    const q = searchQuery.toLowerCase();
    return containerItems.filter(
      (r) =>
        r.receipt.toLowerCase().includes(q) ||
        r.marka.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        (r.commodity && r.commodity.toLowerCase().includes(q)) ||
        r.salesStatus.toLowerCase().includes(q)
    );
  }, [deliveryItems, selectedDeliveryContainer, searchQuery]);

  // Goods Received Items filtered by selected goods container
  const filteredGoodsItems = useMemo(() => {
    const target = selectedGoodsContainer || selectedDeliveryContainer;
    if (!target) return [];

    const containerItems = deliveryItems.filter((r) => r.container === target);
    if (!searchQuery.trim()) return containerItems;
    const q = searchQuery.toLowerCase();
    return containerItems.filter(
      (r) =>
        r.receipt.toLowerCase().includes(q) ||
        r.marka.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        (r.commodity && r.commodity.toLowerCase().includes(q))
    );
  }, [deliveryItems, selectedGoodsContainer, selectedDeliveryContainer, searchQuery]);

  // Warehouse Stock Items (माल जो partly sent हुआ या warehouse में रखा गया)
  const warehouseStockItems = useMemo(() => {
    const list = deliveryItems.filter(
      (r) =>
        (r.warehouseQuantity !== undefined && r.warehouseQuantity > 0) ||
        (r.unloadStatus === 'partly_sent' && (r.warehouseQuantity || 0) > 0) ||
        (r.unloadStatus === 'stored_in_warehouse' && r.remainingCartons > 0)
    );
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (r) =>
        r.receipt.toLowerCase().includes(q) ||
        r.marka.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        (r.commodity && r.commodity.toLowerCase().includes(q)) ||
        (r.container && r.container.toLowerCase().includes(q))
    );
  }, [deliveryItems, searchQuery]);

  // Open Unload Verification Modal (4 Statuses)
  const handleOpenUnloadModal = (receipt: DeliveryReceipt) => {
    setUnloadReceipt(receipt);
    setUnloadStatusChoice(receipt.unloadStatus || 'fully_sent');
    setUnloadSentQuantity(
      receipt.sentQuantity && receipt.sentQuantity > 0
        ? receipt.sentQuantity
        : receipt.remainingCartons > 0
        ? receipt.remainingCartons
        : receipt.totalCartons
    );
    setUnloadRemarks(receipt.unloadRemarks || '');
    setUnloadSuccessMsg(null);
    setUnloadModalOpen(true);
  };

  // Submit Unload Verification Status
  const handleSubmitUnloadStatus = async () => {
    if (!unloadReceipt) return;

    if (unloadStatusChoice === 'partly_sent') {
      const q = Number(unloadSentQuantity);
      if (isNaN(q) || q <= 0) {
        alert('कृपया भेजे गए कार्टून संख्या (Quantity Sent) सही दर्ज करें।');
        return;
      }
      const totalMax = unloadReceipt.totalCartons || unloadReceipt.remainingCartons || 0;
      if (q > totalMax) {
        alert(`भेजी गई कार्टून संख्या कुल कार्टून (${totalMax} CTN) से अधिक नहीं हो सकती।`);
        return;
      }
    }

    setUnloadSubmitting(true);
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_unload_status',
          receipt: unloadReceipt.receipt,
          unloadStatus: unloadStatusChoice,
          sentQuantity: unloadStatusChoice === 'partly_sent' ? Number(unloadSentQuantity) : undefined,
          remarks: unloadRemarks.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update unload status');

      // Update local state immediately
      setDeliveryItems((prev) =>
        prev.map((item) => {
          if (item.receipt === unloadReceipt.receipt) {
            return {
              ...item,
              unloadStatus: unloadStatusChoice,
              sentQuantity: data.sentQuantity ?? item.sentQuantity,
              warehouseQuantity: data.warehouseQuantity ?? item.warehouseQuantity,
              remainingCartons: data.remainingQuantity ?? item.remainingCartons,
              isDelivered: data.isDelivered ?? item.isDelivered,
              goodsReceivedStatus:
                unloadStatusChoice === 'fully_sent'
                  ? 'full'
                  : unloadStatusChoice === 'partly_sent'
                  ? 'partial'
                  : 'not_received',
              unloadRemarks: unloadRemarks.trim(),
            };
          }
          return item;
        })
      );

      triggerNotificationAlert({
        title: '📦 Container Unload Status Updated',
        body: `Receipt ${unloadReceipt.receipt}: ${
          unloadStatusChoice === 'fully_sent'
            ? 'Fully Sent (Delivered)'
            : unloadStatusChoice === 'partly_sent'
            ? `${unloadSentQuantity} Sent | ${data.warehouseQuantity} in Warehouse`
            : unloadStatusChoice === 'not_in_container'
            ? 'Shortage: Not In Container'
            : 'Stored in Warehouse'
        }`,
      });

      setUnloadSuccessMsg(data.message || 'सफलतापूर्वक अपडेट हो गया।');
      setTimeout(() => {
        setUnloadModalOpen(false);
        fetchData();
      }, 1200);
    } catch (e: any) {
      alert(e?.message || 'Error updating unload status');
    } finally {
      setUnloadSubmitting(false);
    }
  };

  // Day-End Status Handlers
  const handleOpenDayEndModal = (receipt: DeliveryReceipt) => {
    setDayEndReceipt(receipt);
    setReceivedType('full');
    setReceivedQuantity(receipt.remainingCartons > 0 ? receipt.remainingCartons : receipt.totalCartons);
    setDayEndRemarks('');
    setDayEndSuccessMsg(null);
    setDayEndModalOpen(true);
  };

  // Open Container Close & Stock Reconciliation Modal
  const handleOpenContainerCloseModal = () => {
    if (!selectedDeliveryContainer) {
      alert('कृपया पहले कंटेनर चुनें।');
      return;
    }
    setContainerCloseReceipts(
      filteredDeliveryItems.map((r) => ({
        receipt: r.receipt,
        marka: r.marka,
        party: r.party,
        commodity: r.commodity || 'General Cargo',
        totalCartons: r.totalCartons,
        remainingCartons: r.remainingCartons,
        stockDestination: 'party',
        deliveryStatus: r.remainingCartons === 0 ? 'fully_delivered' : 'fully_delivered',
        deliveredQuantity: r.remainingCartons > 0 ? r.remainingCartons : r.totalCartons,
        goodsReceivedByParty: true,
        remarks: '',
      }))
    );
    setContainerCloseSuccessMsg(null);
    setContainerCloseModalOpen(true);
  };

  const handleUpdateCloseReceiptItem = (index: number, field: string, value: any) => {
    setContainerCloseReceipts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmitContainerClose = async () => {
    if (!selectedDeliveryContainer) return;
    setContainerCloseSubmitting(true);
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_container_stock',
          container: selectedDeliveryContainer,
          receipts: containerCloseReceipts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to close container');

      triggerNotificationAlert({
        title: '🔒 Container Closed & Stock Updated',
        body: `Container ${selectedDeliveryContainer}: ${data.updatedCount} receipts updated`,
      });

      setContainerCloseSuccessMsg(data.message || 'कंटेनर सफलतापूर्वक क्लोज़ हो गया।');
      setTimeout(() => {
        setContainerCloseModalOpen(false);
        fetchData();
      }, 1400);
    } catch (e: any) {
      alert(e?.message || 'Error closing container');
    } finally {
      setContainerCloseSubmitting(false);
    }
  };

  const handleSubmitDayEnd = async () => {
    if (!dayEndReceipt) return;

    if (receivedType === 'partial') {
      const q = Number(receivedQuantity);
      if (isNaN(q) || q <= 0) {
        alert('कृपया प्राप्त कार्टून संख्या (Quantity Received) सही दर्ज करें।');
        return;
      }
      const maxCtn = dayEndReceipt.remainingCartons > 0 ? dayEndReceipt.remainingCartons : dayEndReceipt.totalCartons;
      if (q > maxCtn) {
        alert(`प्राप्त कार्टून संख्या कुल शेष संख्या (${maxCtn} CTN) से अधिक नहीं हो सकती।`);
        return;
      }
    }

    setDayEndSubmitting(true);
    try {
      const res = await fetch('/api/dispatcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_goods_received',
          receipt: dayEndReceipt.receipt,
          receivedType,
          receivedQuantity: receivedType === 'partial' ? Number(receivedQuantity) : undefined,
          remarks: dayEndRemarks.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update day-end delivery status');

      // Update local state immediately
      setDeliveryItems((prev) =>
        prev.map((item) => {
          if (item.receipt === dayEndReceipt.receipt) {
            return {
              ...item,
              remainingCartons: data.remainingQuantity ?? item.remainingCartons,
              isDelivered: data.isDelivered ?? item.isDelivered,
              goodsReceivedStatus: receivedType,
              receivedQuantity:
                receivedType === 'partial'
                  ? Number(receivedQuantity)
                  : receivedType === 'full'
                  ? item.totalCartons
                  : 0,
              goodsReceivedRemarks: dayEndRemarks.trim(),
            };
          }
          return item;
        })
      );

      triggerNotificationAlert({
        title: '📦 Day-End Goods Received Updated',
        body: `Receipt ${dayEndReceipt.receipt}: ${
          receivedType === 'full' ? 'Full Delivered' : `${receivedQuantity} CTN Received`
        }`,
      });

      setDayEndSuccessMsg(data.message || 'सफलतापूर्वक अपडेट हो गया।');
      setTimeout(() => {
        setDayEndModalOpen(false);
        fetchData();
      }, 1200);
    } catch (e: any) {
      alert(e?.message || 'Error updating status');
    } finally {
      setDayEndSubmitting(false);
    }
  };

  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase();
    return bills.filter(
      (b) =>
        b.billNumber.toLowerCase().includes(q) ||
        b.receipt.toLowerCase().includes(q) ||
        (b.mainMarka && b.mainMarka.toLowerCase().includes(q)) ||
        (b.vehicleNumber && b.vehicleNumber.toLowerCase().includes(q)) ||
        (b.party && b.party.toLowerCase().includes(q))
    );
  }, [bills, searchQuery]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    try {
      await clearMobileSession();
    } catch {}
    window.location.href = '/admin/login?logged_out=true';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-sm sm:text-base text-white tracking-tight">US INTERNATIONAL</span>
                <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 rounded-full">
                  Dispatcher Portal (डिस्पैचर)
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">
                ETA In-Transit Cargo $\rightarrow$ Available to Deliver Dispatches $\rightarrow$ Live Biller Sync
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                triggerNotificationAlert({
                  title: '🔔 Sound Test Alert',
                  body: 'Inter-user live notification bell is working perfectly!',
                });
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition"
              title="Test Notification Sound & Vibration"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-xs font-semibold transition"
              title="Change Password"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Password</span>
            </button>

            <Link
              href="/biller"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Biller</span>
            </Link>

            <Link
              href="/admin"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Admin</span>
            </Link>

            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Main Sections Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center space-x-1 overflow-x-auto border-t border-slate-800/80 pt-1">
          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'delivery'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>1. डिस्पैच एवं बिलिंग (Dispatch)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-emerald-500/20 text-emerald-300">
              {deliveryItems.filter((d) => d.salesStatus === 'Available to Deliver' && !d.isHold).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('unload')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'unload'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4 text-cyan-400" />
            <span>2. कंटेनर अनलोडिंग (Unload: 4 Statuses)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-cyan-500/20 text-cyan-300">
              {deliveryItems.filter((d) => d.unloadStatus).length} / {deliveryItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('warehouse_stock')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'warehouse_stock'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Warehouse className="w-4 h-4 text-purple-400" />
            <span>3. गोदाम स्टॉक (Warehouse Stock)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-purple-500/20 text-purple-300">
              {deliveryItems.reduce((sum, r) => sum + (r.warehouseQuantity || 0), 0)} CTN
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'requests'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>4. पेंडिंग अनुरोध (Requests)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500/20 text-amber-300">
              {requests.filter((r) => r.status === 'Pending').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bills')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'bills'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>5. बिलिंग इनवॉइस (Bills)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-indigo-500/20 text-indigo-300">
              {bills.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('eta')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'eta'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Ship className="w-4 h-4" />
            <span>6. कंटेनर ETA (In-Transit)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-blue-500/20 text-blue-300">
              {etaContainers.length}
            </span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-5 flex-1 w-full">
        {/* KPI Dashboard Quick Metrics Banner (उच्च गुणवत्ता सारांश आँकड़े) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Delivered Containers</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-white">{deliveryContainers.length}</strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Cargo Items</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-cyan-300">{deliveryItems.length}</strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
              <Warehouse className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Warehouse Stock</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-purple-300">
                {deliveryItems.reduce((sum, r) => sum + (r.warehouseQuantity || 0), 0)} CTN
              </strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Partly Sent (आंशिक)</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-amber-300">
                {deliveryItems.filter((r) => r.unloadStatus === 'partly_sent').length}
              </strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
              <PackageX className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Not In Container</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-rose-400">
                {deliveryItems.filter((r) => r.unloadStatus === 'not_in_container').length}
              </strong>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Pending Requests</span>
              <strong className="text-sm sm:text-base font-mono font-bold text-blue-300">
                {requests.filter((r) => r.status === 'Pending').length}
              </strong>
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Container, Receipt, Marka, Party, or Vehicle Number..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* SECTION 1: ETA (CONTAINER LIST - IN TRANSIT) */}
        {activeTab === 'eta' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Ship className="w-5 h-5 text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    Section 1: ETA - In-Transit Containers
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Click any container row to expand and lazy-load its underlying cargo items
                  </p>
                </div>
              </div>
              <span className="text-xs text-blue-400 font-mono font-bold">
                {filteredEtaContainers.length} Containers In Transit
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Container Alias</th>
                    <th className="py-3 px-4">Loading Date</th>
                    <th className="py-3 px-4">Port / ETA</th>
                    <th className="py-3 px-4">Carrier Status</th>
                    <th className="py-3 px-4 text-center">Packages</th>
                    <th className="py-3 px-4">Weight / Volume</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredEtaContainers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No in-transit containers found.
                      </td>
                    </tr>
                  ) : (
                    filteredEtaContainers.map((c) => {
                      const isExpanded = expandedContainer === c.container;
                      const cargoList = containerCargo[c.container] || [];
                      const isLoadingCargo = loadingCargo[c.container];

                      return (
                        <tr key={c.container} className="contents">
                          <tr
                            onClick={() => handleToggleContainerCargo(c.container)}
                            className="hover:bg-slate-800/50 cursor-pointer transition"
                          >
                            <td className="py-3 px-4 font-black text-white flex items-center space-x-2">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-blue-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                              )}
                              <span className="text-blue-300 font-mono text-sm">{c.container}</span>
                              {c.containerNumber && (
                                <span className="text-[10px] text-slate-500 font-mono">({c.containerNumber})</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span>{c.loadingDate || '—'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-bold text-amber-400">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span>{c.eta || 'Awaiting Port ETA'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-950 text-blue-300 border border-blue-800/60">
                                {c.status || 'In Transit'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-purple-300 font-mono">
                              {c.totalQuantity ? `${c.totalQuantity} CTN` : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                              {c.totalWeight || '—'} / {c.totalVolume || '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleContainerCargo(c.container);
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-lg text-[11px] font-semibold"
                              >
                                {isExpanded ? 'Hide Cargo' : 'View Cargo'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Container Cargo Items */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-slate-950/90 p-4 border-y border-blue-900/40">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <Box className="w-4 h-4 text-blue-400" />
                                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                                        Cargo inside Container {c.container}
                                      </h4>
                                    </div>
                                    {isLoadingCargo && (
                                      <div className="flex items-center space-x-2 text-xs text-blue-400">
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Lazy loading items...</span>
                                      </div>
                                    )}
                                  </div>

                                  {!isLoadingCargo && cargoList.length === 0 ? (
                                    <p className="text-xs text-slate-500 py-3 text-center">
                                      No cargo items loaded in this container manifest yet.
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                                      <table className="w-full text-left text-xs bg-slate-900/60">
                                        <thead>
                                          <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                                            <th className="py-2 px-3">Receipt #</th>
                                            <th className="py-2 px-3">Marka</th>
                                            <th className="py-2 px-3">Party / Client</th>
                                            <th className="py-2 px-3">Commodity</th>
                                            <th className="py-2 px-3 text-center">Cartons</th>
                                            <th className="py-2 px-3">Weight / CBM</th>
                                            <th className="py-2 px-3">Sales Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 font-sans">
                                          {cargoList.map((cargo, idx) => (
                                            <tr key={cargo._id || idx} className="hover:bg-slate-800/40">
                                              <td className="py-2 px-3 font-mono font-bold text-blue-300">
                                                {cargo.receipt}
                                              </td>
                                              <td className="py-2 px-3 font-black text-white">{cargo.mainMarka || '—'}</td>
                                              <td className="py-2 px-3 text-slate-300">{cargo.party || '—'}</td>
                                              <td className="py-2 px-3 text-slate-400">{cargo.commodity || '—'}</td>
                                              <td className="py-2 px-3 text-center font-bold text-purple-300 font-mono">
                                                {cargo.packages} CTN
                                              </td>
                                              <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                                {cargo.weight || '—'} / {cargo.volume || '—'}
                                              </td>
                                              <td className="py-2 px-3">
                                                <span
                                                  className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                                    cargo.salesStatus === 'Available to Deliver'
                                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                                      : cargo.salesStatus === 'Hold'
                                                      ? 'bg-red-950 text-red-300 border border-red-700'
                                                      : 'bg-slate-800 text-slate-300'
                                                  }`}
                                                >
                                                  {cargo.salesStatus || 'Normal'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 1: DELIVERY & DISPATCH TO BILLER (DELIVERED CONTAINERS & AVAILABLE TO DELIVER) */}
        {activeTab === 'delivery' && (
          <div className="space-y-4">
            {/* 1. CLEAN CONTAINER SEARCH & SELECTOR (No cluttered button wall) */}
            <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>कंटेनर नंबर खोजें व चुनें (Search & Select Container)</span>
                      <span className="text-red-400 font-bold">*</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      एडमिन द्वारा डिलीवर मार्क किए गए कंटेनर यहाँ दिखते हैं। कंटेनर टाइप करके या ड्रॉपडाउन से चुनें।
                    </p>
                  </div>
                </div>

                {selectedDeliveryContainer && (
                  <button
                    onClick={() => {
                      setSelectedDeliveryContainer('');
                      setContainerSearchInput('');
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center space-x-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>कंटेनर बदलें (Change Container)</span>
                  </button>
                )}
              </div>

              {/* Clean Container Search Input & Dropdown in Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Search Input Filter */}
                <div className="relative">
                  <Search className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={containerSearchInput}
                    onChange={(e) => setContainerSearchInput(e.target.value)}
                    placeholder="🔍 कंटेनर नंबर टाइप करें (Type container #, e.g. USSI-271)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {containerSearchInput && (
                    <button
                      type="button"
                      onClick={() => setContainerSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Dropdown populated by search */}
                <select
                  value={selectedDeliveryContainer}
                  onChange={(e) => {
                    setSelectedDeliveryContainer(e.target.value);
                    if (e.target.value) setContainerSearchInput(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">
                    -- कृपया कंटेनर नंबर चुनें ({matchingDeliveryContainers.length} कंटेनर उपलब्ध) --
                  </option>
                  {matchingDeliveryContainers.map((c) => (
                    <option key={c.container} value={c.container}>
                      📦 {c.container} — ({c.availableCount} Available to Deliver / {c.count} Total Receipts)
                    </option>
                  ))}
                </select>
              </div>

              {containerSearchInput && matchingDeliveryContainers.length === 0 && (
                <p className="text-xs text-amber-400 pt-1">
                  ⚠️ "{containerSearchInput}" नाम से कोई डिलीवर कंटेनर नहीं मिला।
                </p>
              )}
            </div>

            {/* 2. STATE A: NO CONTAINER SELECTED -> SHOW PROMPT */}
            {!selectedDeliveryContainer ? (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
                  <Truck className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white">
                  कंटेनर नंबर का चयन करें (Please Select a Container)
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  डिलीवरी और बिलिंग हेतु रसीदें देखने के लिए ऊपर दिए गए सर्च बॉक्स या मेनू से कंटेनर नंबर चुनें।
                </p>
                <div className="pt-2 text-[11px] text-slate-500 italic">
                  (Type container number in the box above to filter and select)
                </div>
              </div>
            ) : (
              /* 3. STATE B: CONTAINER SELECTED -> SHOW RECEIPTS WITH STRICT HOLD CHECK & SEND TO BILLER */
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Selected Container Summary Header */}
                <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>चयनित कंटेनर (Selected Container):</span>
                        <span className="font-mono text-emerald-400">{selectedDeliveryContainer}</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        गाड़ी लोड करें और बिलिंग हेतु बिलर को अनुरोध भेजें। होल्ड माल का डिस्पैच स्वतः लॉक रहेगा।
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 bg-emerald-900/60 text-emerald-300 rounded-lg font-mono font-bold">
                      {filteredDeliveryItems.length} Receipts
                    </span>
                    <span className="px-2.5 py-1 bg-purple-900/60 text-purple-300 rounded-lg font-mono font-bold">
                      {filteredDeliveryItems.reduce(
                        (sum, r) => sum + (r.remainingCartons > 0 ? r.remainingCartons : r.totalCartons || 0),
                        0
                      )}{' '}
                      CTN Available
                    </span>
                    {filteredDeliveryItems.filter((r) => r.isHold || r.salesStatus === 'Hold').length > 0 && (
                      <span className="px-2.5 py-1 bg-red-950 text-red-300 border border-red-700 rounded-lg font-mono font-bold flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span>
                          {filteredDeliveryItems.filter((r) => r.isHold || r.salesStatus === 'Hold').length} HOLD
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Delivery Items Grid */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-3 px-4">Receipt #</th>
                          <th className="py-3 px-4">Marka</th>
                          <th className="py-3 px-4">Container</th>
                          <th className="py-3 px-4">Party</th>
                          <th className="py-3 px-4">Commodity</th>
                          <th className="py-3 px-4 text-center">Remaining CTN</th>
                          <th className="py-3 px-4">Sales / Hold Status</th>
                          <th className="py-3 px-4 text-right">एक्शन (Action)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredDeliveryItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-500">
                              इस कंटेनर में कोई रसीद डिलीवरी हेतु उपलब्ध नहीं है।
                            </td>
                          </tr>
                        ) : (
                          filteredDeliveryItems.map((r) => {
                            const isAvailable = r.salesStatus === 'Available to Deliver';
                            const isHold = r.isHold || r.salesStatus === 'Hold';
                            const isFullyDelivered = r.isDelivered || r.remainingCartons === 0;

                            return (
                              <tr
                                key={r._id}
                                className={`transition ${
                                  isHold
                                    ? 'bg-red-950/20 hover:bg-red-950/30'
                                    : isFullyDelivered
                                    ? 'bg-slate-950/40 opacity-60'
                                    : isAvailable
                                    ? 'hover:bg-emerald-950/20 bg-slate-900/90'
                                    : 'hover:bg-slate-800/40 opacity-75'
                                }`}
                              >
                                <td className="py-3 px-4 font-mono font-bold text-white">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-blue-300 font-mono font-bold text-sm">
                                      {r.receipt}
                                    </span>
                                  </div>
                                  {r.phone && (
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      📞 {r.phone}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-black text-emerald-400 text-sm">
                                  {r.marka}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-300">
                                  {r.container}
                                </td>
                                <td className="py-3 px-4 text-slate-200 font-medium">
                                  {r.party}
                                </td>
                                <td className="py-3 px-4 text-slate-400">
                                  {r.commodity || '—'}
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-purple-300">
                                  {r.remainingCartons} / {r.totalCartons} CTN
                                </td>
                                <td className="py-3 px-4">
                                  {isHold ? (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-black rounded-lg bg-red-950 text-red-300 border border-red-700 shadow-sm">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        <span>⛔ HOLD (होल्ड पर है)</span>
                                      </span>
                                      {r.holdReason && (
                                        <span className="block text-[10px] text-red-400 font-medium max-w-[150px] truncate" title={r.holdReason}>
                                          कारण: {r.holdReason}
                                        </span>
                                      )}
                                    </div>
                                  ) : isFullyDelivered ? (
                                    <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                      ✓ Delivered
                                    </span>
                                  ) : isAvailable ? (
                                    <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                      🟢 Available to Deliver
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-800 text-slate-400">
                                      {r.salesStatus}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {isHold ? (
                                    <button
                                      disabled
                                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-950/70 border border-red-800 text-red-400 rounded-xl font-bold text-xs cursor-not-allowed opacity-80"
                                      title={r.holdReason ? `होल्ड कारण: ${r.holdReason}` : 'यह माल होल्ड पर है। डिस्पैच नहीं हो सकता।'}
                                    >
                                      <Lock className="w-3.5 h-3.5 text-red-400" />
                                      <span>⛔ होल्ड (Locked)</span>
                                    </button>
                                  ) : isFullyDelivered ? (
                                    <span className="inline-flex items-center space-x-1 text-slate-400 text-xs font-semibold px-2.5 py-1">
                                      <span>✓ डिस्पैच पूर्ण</span>
                                    </span>
                                  ) : (
                                    <div className="flex items-center justify-end space-x-2">
                                      <button
                                        onClick={() => handleOpenDispatchModal(r)}
                                        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl font-black text-xs shadow-md shadow-emerald-600/30 transition transform hover:scale-105"
                                        title="गाड़ी नंबर व पता डालकर बिलर को रिक्वेस्ट भेजें"
                                      >
                                        <Truck className="w-3.5 h-3.5" />
                                        <span>🚚 बिलिंग अनुरोध भेजें</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedReceipt(r);
                                          setSelfBillModalOpen(true);
                                        }}
                                        className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs border border-slate-700 transition"
                                        title="सीधे बिलिंग तैयार करें"
                                      >
                                        स्वयं बिल
                                      </button>
                                    </div>
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
          </div>
        )}

        {/* SECTION 2: CONTAINER UNLOAD VERIFICATION (4 STATUSES: FULLY SENT, PARTLY SENT, NOT IN CONTAINER, STORED IN WAREHOUSE) */}
        {activeTab === 'unload' && (
          <div className="space-y-4">
            {/* Container Selector Card */}
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>कंटेनर अनलोडिंग व माल सत्यापन (Unload & Verify: 4 Statuses)</span>
                      <span className="text-cyan-400 font-bold">*</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      कंटेनर खोलने पर माल का भौतिक सत्यापन करें: Fully Sent, Partly Sent (बाकी वेयरहाउस में), Not In Container, या Stored in Warehouse।
                    </p>
                  </div>
                </div>

                {selectedGoodsContainer && (
                  <button
                    onClick={() => {
                      setSelectedGoodsContainer('');
                      setGoodsContainerSearchInput('');
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center space-x-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>कंटेनर बदलें (Change Container)</span>
                  </button>
                )}
              </div>

              {/* Clean Search Input & Dropdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="relative">
                  <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={goodsContainerSearchInput}
                    onChange={(e) => setGoodsContainerSearchInput(e.target.value)}
                    placeholder="🔍 कंटेनर नंबर टाइप करें (Type container #, e.g. USSI-271)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  {goodsContainerSearchInput && (
                    <button
                      type="button"
                      onClick={() => setGoodsContainerSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <select
                  value={selectedGoodsContainer}
                  onChange={(e) => {
                    setSelectedGoodsContainer(e.target.value);
                    if (e.target.value) setGoodsContainerSearchInput(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-cyan-500/50 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">
                    -- कृपया कंटेनर नंबर चुनें ({matchingGoodsContainers.length} कंटेनर उपलब्ध) --
                  </option>
                  {matchingGoodsContainers.map((c) => (
                    <option key={c.container} value={c.container}>
                      📦 {c.container} — ({c.count} रसीदें)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Prompt if no container selected */}
            {!selectedGoodsContainer ? (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-cyan-500/10 text-cyan-400 rounded-2xl flex items-center justify-center">
                  <Boxes className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white">
                  कंटेनर नंबर का चयन करें (Please Select a Container)
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  कंटेनर अनलोडिंग और 4-स्टेटस भौतिक सत्यापन (Fully Sent, Partly Sent, Not In Container, Stored in Warehouse) हेतु ऊपर से कंटेनर चुनें।
                </p>
              </div>
            ) : (
              /* Items Grid for Container Unloading */
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Summary Header */}
                <div className="bg-cyan-950/40 border border-cyan-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>कंटेनर अनलोडिंग सत्यापन:</span>
                        <span className="font-mono text-cyan-400">{selectedGoodsContainer}</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        प्रत्येक रसीद का भौतिक मिलान करें। आंशिक भेजा गया माल शेष वेयरहाउस में दर्ज होगा।
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="px-2.5 py-1 bg-cyan-900/60 text-cyan-300 rounded-lg font-mono font-bold">
                      {filteredGoodsItems.length} Receipts
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-700 rounded-lg font-mono font-bold">
                      {filteredGoodsItems.filter((r) => r.unloadStatus === 'fully_sent').length} Fully Sent
                    </span>
                    <span className="px-2.5 py-1 bg-amber-950 text-amber-300 border border-amber-700 rounded-lg font-mono font-bold">
                      {filteredGoodsItems.filter((r) => r.unloadStatus === 'partly_sent').length} Partly Sent
                    </span>
                    <span className="px-2.5 py-1 bg-rose-950 text-rose-300 border border-rose-700 rounded-lg font-mono font-bold">
                      {filteredGoodsItems.filter((r) => r.unloadStatus === 'not_in_container').length} Not In Container
                    </span>
                    <span className="px-2.5 py-1 bg-purple-950 text-purple-300 border border-purple-700 rounded-lg font-mono font-bold">
                      {filteredGoodsItems.filter((r) => r.unloadStatus === 'stored_in_warehouse').length} In Warehouse
                    </span>
                  </div>
                </div>

                {/* Unload Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="py-3 px-4">Receipt #</th>
                          <th className="py-3 px-4">Marka</th>
                          <th className="py-3 px-4">Party</th>
                          <th className="py-3 px-4">Commodity</th>
                          <th className="py-3 px-4 text-center">अपेक्षित कार्टून</th>
                          <th className="py-3 px-4">अनलोड व डिस्पैच सत्यापन स्थिति</th>
                          <th className="py-3 px-4 text-right">एक्शन (Action)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredGoodsItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-500">
                              इस कंटेनर में कोई रसीद नहीं मिली।
                            </td>
                          </tr>
                        ) : (
                          filteredGoodsItems.map((r) => {
                            const unStatus = r.unloadStatus;
                            return (
                              <tr key={r._id} className="hover:bg-slate-800/40 transition">
                                <td className="py-3 px-4 font-mono font-bold text-white">
                                  <span className="text-blue-300 font-mono font-bold text-sm">
                                    {r.receipt}
                                  </span>
                                  {r.phone && (
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      📞 {r.phone}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-black text-emerald-400 text-sm">
                                  {r.marka}
                                </td>
                                <td className="py-3 px-4 text-slate-200 font-medium">
                                  {r.party}
                                </td>
                                <td className="py-3 px-4 text-slate-400">
                                  {r.commodity || '—'}
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-slate-300">
                                  {r.totalCartons} CTN
                                </td>
                                <td className="py-3 px-4">
                                  {unStatus === 'fully_sent' ? (
                                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>🟢 Fully Sent (पूर्णतः भेजा गया - {r.totalCartons} CTN)</span>
                                    </span>
                                  ) : unStatus === 'partly_sent' ? (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-950 text-amber-300 border border-amber-700">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                        <span>🟡 Partly Sent ({r.sentQuantity} CTN भेजा)</span>
                                      </span>
                                      <span className="block text-[11px] text-purple-300 font-mono bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-md">
                                        🏢 वेयरहाउस स्टॉक: <strong>{r.warehouseQuantity ?? Math.max(0, r.totalCartons - (r.sentQuantity || 0))} CTN</strong>
                                      </span>
                                    </div>
                                  ) : unStatus === 'not_in_container' ? (
                                    <div className="space-y-0.5">
                                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-950 text-rose-300 border border-rose-700 animate-pulse">
                                        <PackageX className="w-3.5 h-3.5 text-rose-400" />
                                        <span>🔴 Not In Container (कंटेनर में नहीं मिला)</span>
                                      </span>
                                      <span className="block text-[10px] text-rose-400">
                                        ⚠️ मैनिफ़ेस्ट में था पर अनलोडिंग में भौतिक रूप से नहीं निकला
                                      </span>
                                    </div>
                                  ) : unStatus === 'stored_in_warehouse' ? (
                                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-950 text-purple-300 border border-purple-700">
                                      <Warehouse className="w-3.5 h-3.5 text-purple-400" />
                                      <span>🏢 Stored in Warehouse ({r.warehouseQuantity || r.totalCartons} CTN वेयरहाउस में जमा)</span>
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-400 inline-flex items-center space-x-1">
                                      <Clock className="w-3 h-3" />
                                      <span>⏳ Unverified (सत्यापन लंबित)</span>
                                    </span>
                                  )}
                                  {r.unloadRemarks && (
                                    <span className="block text-[10px] text-slate-400 mt-1 max-w-[200px] truncate" title={r.unloadRemarks}>
                                      रिमार्क्स: {r.unloadRemarks}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleOpenUnloadModal(r)}
                                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold text-xs shadow-md shadow-cyan-600/30 transition transform hover:scale-105"
                                    title="कंटेनर अनलोडिंग सत्यापन दर्ज करें (Fully Sent, Partly Sent, Not In Container, Stored in Warehouse)"
                                  >
                                    <PackageCheck className="w-3.5 h-3.5" />
                                    <span>सत्यापन दर्ज करें</span>
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
          </div>
        )}

        {/* SECTION 3: WAREHOUSE STOCK (गोदाम स्टॉक - AVAILABLE TO DISPATCH FROM WAREHOUSE) */}
        {activeTab === 'warehouse_stock' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Warehouse Stock Header Card */}
            <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl">
                  <Warehouse className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>गोदाम स्टॉक (Indian Warehouse Stock - Ready to Dispatch)</span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    कंटेनर अनलोडिंग के दौरान Partly Sent माल का शेष हिस्सा व वेयरहाउस में जमा माल यहाँ दिखेगा।
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <span className="px-3 py-1.5 bg-purple-900/60 text-purple-200 rounded-xl font-mono font-bold border border-purple-700/60">
                  {warehouseStockItems.length} Receipts in Stock
                </span>
                <span className="px-3 py-1.5 bg-emerald-900/60 text-emerald-200 rounded-xl font-mono font-bold border border-emerald-700/60">
                  {warehouseStockItems.reduce(
                    (sum, r) => sum + (r.warehouseQuantity || r.remainingCartons || 0),
                    0
                  )}{' '}
                  CTN Total
                </span>
              </div>
            </div>

            {/* Warehouse Stock Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Marka</th>
                      <th className="py-3 px-4">Container</th>
                      <th className="py-3 px-4">Party</th>
                      <th className="py-3 px-4">Commodity</th>
                      <th className="py-3 px-4 text-center">मूल कुल CTN</th>
                      <th className="py-3 px-4 text-center bg-purple-950/40 text-purple-300">
                        गोदाम में उपलब्ध स्टॉक
                      </th>
                      <th className="py-3 px-4">अनलोड स्थिति</th>
                      <th className="py-3 px-4 text-right">एक्शन (Action)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {warehouseStockItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          गोदाम में वर्तमान में कोई शेष स्टॉक नहीं है। सभी माल पूर्णतः भेजा जा चुका है।
                        </td>
                      </tr>
                    ) : (
                      warehouseStockItems.map((r) => {
                        const availableWhStock = r.warehouseQuantity || r.remainingCartons || 0;
                        const isHold = r.isHold || r.salesStatus === 'Hold';

                        return (
                          <tr key={r._id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono font-bold text-white">
                              <span className="text-blue-300 font-mono font-bold text-sm">
                                {r.receipt}
                              </span>
                              {r.phone && (
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  📞 {r.phone}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-black text-emerald-400 text-sm">
                              {r.marka}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {r.container}
                            </td>
                            <td className="py-3 px-4 text-slate-200 font-medium">
                              {r.party}
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {r.commodity || '—'}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-400">
                              {r.totalCartons} CTN
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-purple-300 text-sm bg-purple-950/20">
                              {availableWhStock} CTN
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-950 text-purple-300 border border-purple-800/60 inline-flex items-center space-x-1">
                                <Warehouse className="w-3 h-3 text-purple-400" />
                                <span>
                                  {r.unloadStatus === 'partly_sent'
                                    ? `Partly Sent (${r.sentQuantity} भेजा / ${availableWhStock} स्टॉक)`
                                    : 'Stored in Warehouse'}
                                </span>
                              </span>
                              {r.unloadRemarks && (
                                <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]" title={r.unloadRemarks}>
                                  नोट: {r.unloadRemarks}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isHold ? (
                                <button
                                  disabled
                                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-950/70 border border-red-800 text-red-400 rounded-xl font-bold text-xs cursor-not-allowed opacity-80"
                                  title="यह माल होल्ड पर है।"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>⛔ होल्ड</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleOpenDispatchModal({
                                      ...r,
                                      remainingCartons: availableWhStock,
                                      totalCartons: availableWhStock,
                                    })
                                  }
                                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl font-black text-xs shadow-md shadow-emerald-600/30 transition transform hover:scale-105"
                                  title="गोदाम से गाड़ी लोड करें और बिलर को अनुरोध भेजें"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>🚚 बिलिंग अनुरोध भेजें</span>
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

        {/* SECTION 3: BILLS (GENERATED BILLS & DOWNLOAD PDF) */}
        {activeTab === 'bills' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    Section 3: Bills & Invoices Generated by Biller
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Download and print official tax bills, e-way bill details, and vehicle delivery sheets
                  </p>
                </div>
              </div>
              <span className="text-xs text-purple-400 font-mono font-bold">
                {filteredBills.length} Bills Total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Bill #</th>
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Marka</th>
                    <th className="py-3 px-4">Vehicle No (गाड़ी)</th>
                    <th className="py-3 px-4">Delivery Address (Place)</th>
                    <th className="py-3 px-4 text-center">Cartons</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">PDF Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No bills generated yet.
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => (
                      <tr key={b._id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-purple-300">
                          {b.billNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{b.receipt}</td>
                        <td className="py-3 px-4 font-black text-white">{b.mainMarka || '—'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {b.vehicleNumber || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-300 max-w-xs truncate" title={b.deliveryAddress}>
                          {b.deliveryAddress || '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-purple-300">
                          {b.dispatchedCartons || b.totalCartons || '—'} CTN
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          ₹{b.totalAmount ? b.totalAmount.toLocaleString('en-IN') : '0'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              generateBillPDF({
                                billNumber: b.billNumber,
                                receipt: b.receipt,
                                totalAmount: b.totalAmount,
                                vehicleNumber: b.vehicleNumber,
                                party: b.party,
                                mainMarka: b.mainMarka,
                                container: b.container,
                                totalCartons: b.totalCartons,
                                dispatchedCartons: b.dispatchedCartons,
                                deliveryAddress: b.deliveryAddress,
                              });
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white rounded-lg font-semibold text-xs border border-purple-500/40 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
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

        {/* SECTION 4: DISPATCH REQUESTS (PENDING & COMPLETED) */}
        {activeTab === 'requests' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                    Live Dispatch Requests (डिस्पैच अनुरोध स्थिति)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Real-time status of dispatch requests initiated to the biller
                  </p>
                </div>
              </div>
              <span className="text-xs text-amber-400 font-mono font-bold">
                {requests.length} Total Requests
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Container / No.</th>
                    <th className="py-3 px-4">Marka</th>
                    <th className="py-3 px-4">Item / Commodity</th>
                    <th className="py-3 px-4">Gaadi No (गाड़ी)</th>
                    <th className="py-3 px-4 text-center">CTN</th>
                    <th className="py-3 px-4">Place / Address</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Biller Action</th>
                    <th className="py-3 px-4 text-right">एक्शन (Action)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-500">
                        No dispatch requests initiated yet.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req._id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          {new Date(req.initiatedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-300">{req.receipt}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          <span className="font-bold text-amber-300">{req.container || '—'}</span>
                          {req.containerNumber && req.containerNumber !== req.container && (
                            <span className="block text-[10px] text-slate-400 font-mono">({req.containerNumber})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-black text-white">{req.marka || '—'}</td>
                        <td className="py-3 px-4 font-bold text-cyan-300 max-w-[150px] truncate" title={req.commodity || 'COMMERCIAL GOODS'}>
                          {req.commodity || 'COMMERCIAL GOODS'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">{req.vehicleNumber}</td>
                        <td className="py-3 px-4 text-center font-bold text-purple-300 font-mono">
                          {req.cartonCount} CTN
                        </td>
                        <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{req.place}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              req.status === 'Pending'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {req.status === 'Pending' ? 'Pending at Biller' : `Billed (${req.billNumber || 'Done'})`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {req.billerUsername ? `Processed by @${req.billerUsername}` : 'Awaiting Biller'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRequest(req._id)}
                            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-lg font-bold text-[11px] border border-red-500/40 transition flex items-center space-x-1 ml-auto"
                            title="इस डिस्पैच अनुरोध को डिलीट करें"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>डिलीट</span>
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
      </main>

            {/* CONTAINER CLOSE & STOCK RECONCILIATION MODAL */}
      {containerCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>🔒 कंटेनर क्लोज़ व स्टॉक रीकंसाइलेशन</span>
                    <span className="font-mono text-amber-400">({selectedDeliveryContainer})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    क्लोज़ करते समय प्रत्येक स्टॉक को अपडेट करें कि वह वेयरहाउस में गया या सीधा पार्टी के पास गया।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContainerCloseModalOpen(false)}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Items List */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {containerCloseSuccessMsg && (
                <div className="p-3.5 bg-emerald-950/70 border border-emerald-500 rounded-2xl text-emerald-300 text-xs font-bold animate-in fade-in">
                  {containerCloseSuccessMsg}
                </div>
              )}

              <div className="space-y-3">
                {containerCloseReceipts.map((item, idx) => (
                  <div
                    key={item.receipt}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-850 pb-2.5 gap-2">
                      <div className="flex items-center space-x-3">
                        <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 font-mono font-bold rounded-lg text-sm">
                          {item.receipt}
                        </span>
                        <span className="font-black text-emerald-400 text-sm">{item.marka}</span>
                        <span className="text-slate-300 font-medium">{item.party}</span>
                      </div>
                      <div className="text-right text-[11px] font-mono text-purple-300">
                        कुल/शेष: <strong>{item.remainingCartons} / {item.totalCartons} CTN</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Destination: Party vs Warehouse */}
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          1. माल कहाँ गया? (Destination)
                        </label>
                        <div className="flex items-center space-x-3">
                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={'dest-' + idx}
                              checked={item.stockDestination === 'party'}
                              onChange={() => handleUpdateCloseReceiptItem(idx, 'stockDestination', 'party')}
                              className="text-emerald-500 focus:ring-0"
                            />
                            <span className="text-xs font-semibold text-emerald-300">सीधा पार्टी (Direct Party)</span>
                          </label>
                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={'dest-' + idx}
                              checked={item.stockDestination === 'warehouse'}
                              onChange={() => handleUpdateCloseReceiptItem(idx, 'stockDestination', 'warehouse')}
                              className="text-blue-500 focus:ring-0"
                            />
                            <span className="text-xs font-semibold text-blue-300">वेयरहाउस (Warehouse)</span>
                          </label>
                        </div>
                      </div>

                      {/* Delivery Status: Fully vs Partly vs Undelivered */}
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          2. डिलीवरी स्थिति (Delivery Status)
                        </label>
                        <select
                          value={item.deliveryStatus}
                          onChange={(e) => handleUpdateCloseReceiptItem(idx, 'deliveryStatus', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold outline-none focus:border-amber-500"
                        >
                          <option value="fully_delivered">🟢 Fully Delivered (पूर्ण प्राप्त)</option>
                          <option value="partly_delivered">🟡 Partly Delivered (आंशिक प्राप्त)</option>
                          <option value="undelivered">⚪ Undelivered (अनडिलीवर / शेष)</option>
                        </select>
                      </div>

                      {/* Goods Received Confirmation Tag */}
                      <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          3. पार्टी माल प्राप्ति (Goods Received)
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer pt-0.5">
                          <input
                            type="checkbox"
                            checked={item.goodsReceivedByParty}
                            onChange={(e) => handleUpdateCloseReceiptItem(idx, 'goodsReceivedByParty', e.target.checked)}
                            className="rounded text-emerald-500 focus:ring-0 w-4 h-4"
                          />
                          <span className={item.goodsReceivedByParty ? 'text-emerald-400 font-bold text-xs' : 'text-slate-400 text-xs'}>
                            {item.goodsReceivedByParty ? '✓ Goods Received by Party' : 'Goods Received Not by Party'}
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* If Partly Delivered: Quantity Input Required */}
                    {item.deliveryStatus === 'partly_delivered' && (
                      <div className="p-2.5 bg-amber-950/30 border border-amber-500/40 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
                        <span className="text-[11px] font-bold text-amber-300">
                          👉 प्राप्त कार्टून संख्या दर्ज करें (Enter Delivered Cartons):
                        </span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min={1}
                            max={item.remainingCartons > 0 ? item.remainingCartons : item.totalCartons}
                            value={item.deliveredQuantity}
                            onChange={(e) => handleUpdateCloseReceiptItem(idx, 'deliveredQuantity', e.target.value ? Number(e.target.value) : '')}
                            className="w-28 px-2.5 py-1 bg-slate-950 border border-amber-500/60 rounded-lg text-amber-200 font-mono font-bold text-xs outline-none"
                            placeholder="Cartons"
                          />
                          <span className="text-[10px] text-slate-400 font-mono">
                            शेष: {Math.max(0, (item.remainingCartons > 0 ? item.remainingCartons : item.totalCartons) - Number(item.deliveredQuantity || 0))} CTN
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setContainerCloseModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs border border-slate-700 transition"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                onClick={handleSubmitContainerClose}
                disabled={containerCloseSubmitting}
                className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-900/40 flex items-center space-x-2 transition transform active:scale-95"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{containerCloseSubmitting ? 'क्लोज़ हो रहा है...' : 'कंटेनर क्लोज़ व स्टॉक अपडेट करें'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DAY-END GOODS RECEIVED MODAL */}
      {dayEndModalOpen && dayEndReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-blue-500/50 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    दिन का अंत: माल प्राप्ति पुष्टि (Day-End Goods Received)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    पार्टी को माल प्राप्त हुआ या नहीं व मात्रा दर्ज करें
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDayEndModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Summary Info Card */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Receipt No:</span>{' '}
                <strong className="text-blue-300 font-mono">{dayEndReceipt.receipt}</strong>
              </div>
              <div>
                <span className="text-slate-500">Marka:</span>{' '}
                <strong className="text-emerald-400">{dayEndReceipt.marka}</strong>
              </div>
              <div>
                <span className="text-slate-500">Party:</span>{' '}
                <strong className="text-slate-200">{dayEndReceipt.party}</strong>
              </div>
              <div>
                <span className="text-slate-500">Available CTN:</span>{' '}
                <strong className="text-purple-300 font-mono">
                  {dayEndReceipt.remainingCartons > 0 ? dayEndReceipt.remainingCartons : dayEndReceipt.totalCartons} CTN
                </strong>
              </div>
            </div>

            {/* Selection: Full vs Partial */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                माल प्राप्ति की स्थिति चुनें (Select Received Status):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Full Option */}
                <label
                  onClick={() => setReceivedType('full')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    receivedType === 'full'
                      ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="receivedType"
                    checked={receivedType === 'full'}
                    onChange={() => setReceivedType('full')}
                    className="mt-1 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-emerald-300">
                      🟢 पूरा प्राप्त (Full)
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      सभी कार्टून पूर्णतः प्राप्त (0 शेष)
                    </span>
                  </div>
                </label>

                {/* Partial Option */}
                <label
                  onClick={() => setReceivedType('partial')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    receivedType === 'partial'
                      ? 'bg-amber-950/50 border-amber-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="receivedType"
                    checked={receivedType === 'partial'}
                    onChange={() => setReceivedType('partial')}
                    className="mt-1 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-amber-300">
                      🟡 आंशिक प्राप्त (Partial)
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      कुछ कार्टून प्राप्त (मात्रा दर्ज करें)
                    </span>
                  </div>
                </label>

                {/* Not Received Option */}
                <label
                  onClick={() => setReceivedType('not_received')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    receivedType === 'not_received'
                      ? 'bg-red-950/50 border-red-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="receivedType"
                    checked={receivedType === 'not_received'}
                    onChange={() => setReceivedType('not_received')}
                    className="mt-1 text-red-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-red-300">
                      🔴 प्राप्त नहीं हुआ (None)
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      पार्टी को माल अभी तक नहीं मिला
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* If Partial: Enter Quantity */}
            {receivedType === 'partial' && (
              <div className="p-3.5 bg-amber-950/20 border border-amber-500/40 rounded-2xl space-y-2 animate-in fade-in duration-150">
                <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
                  <span>प्राप्त कार्टून संख्या दर्ज करें (Enter Quantity Received):</span>
                  <span className="text-[11px] font-mono font-normal text-slate-400">
                    Max: {dayEndReceipt.remainingCartons > 0 ? dayEndReceipt.remainingCartons : dayEndReceipt.totalCartons} CTN
                  </span>
                </label>
                <input
                  type="number"
                  value={receivedQuantity}
                  onChange={(e) => setReceivedQuantity(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 5"
                  min={1}
                  max={dayEndReceipt.remainingCartons > 0 ? dayEndReceipt.remainingCartons : dayEndReceipt.totalCartons}
                  className="w-full bg-slate-950 border border-amber-500/60 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-amber-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                {Number(receivedQuantity) > 0 && (
                  <div className="text-[11px] text-slate-300 flex items-center justify-between font-mono bg-slate-950 p-2 rounded-lg">
                    <span>
                      प्राप्त (Received): <strong className="text-amber-400">{receivedQuantity} CTN</strong>
                    </span>
                    <span>
                      शेष (Remaining):{' '}
                      <strong className="text-purple-400">
                        {Math.max(
                          0,
                          (dayEndReceipt.remainingCartons > 0
                            ? dayEndReceipt.remainingCartons
                            : dayEndReceipt.totalCartons) - Number(receivedQuantity)
                        )}{' '}
                        CTN
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Remarks */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">रिमार्क्स (Optional Remarks / Notes):</label>
              <textarea
                value={dayEndRemarks}
                onChange={(e) => setDayEndRemarks(e.target.value)}
                placeholder="e.g. बाकी माल कल डिलीवरी होगा, पार्टी की दुकान बंद थी..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {dayEndSuccessMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500 rounded-xl text-emerald-300 text-xs font-bold animate-in fade-in">
                {dayEndSuccessMsg}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2.5 pt-2">
              <button
                onClick={handleSubmitDayEnd}
                disabled={dayEndSubmitting}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{dayEndSubmitting ? 'सेव हो रहा है...' : 'स्थिति सेव करें (Save Delivery Status)'}</span>
              </button>
              <button
                onClick={() => setDayEndModalOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs border border-slate-700 transition"
              >
                रद्द करें (Cancel)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTAINER UNLOAD VERIFICATION MODAL (4 STATUSES) */}
      {unloadModalOpen && unloadReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl space-y-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <Boxes className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    कंटेनर अनलोडिंग एवं भौतिक सत्यापन (Unload Verification)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    कंटेनर खोलने पर माल की वास्तविक प्राप्ति स्थिति दर्ज करें
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUnloadModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Receipt No:</span>{' '}
                <strong className="text-blue-300 font-mono">{unloadReceipt.receipt}</strong>
              </div>
              <div>
                <span className="text-slate-500">Marka:</span>{' '}
                <strong className="text-emerald-400">{unloadReceipt.marka}</strong>
              </div>
              <div>
                <span className="text-slate-500">Party:</span>{' '}
                <strong className="text-slate-200">{unloadReceipt.party}</strong>
              </div>
              <div>
                <span className="text-slate-500">Container:</span>{' '}
                <strong className="text-cyan-300 font-mono">{unloadReceipt.container}</strong>
              </div>
              <div>
                <span className="text-slate-500">Manifest Total:</span>{' '}
                <strong className="text-purple-300 font-mono">{unloadReceipt.totalCartons} CTN</strong>
              </div>
              <div>
                <span className="text-slate-500">Commodity:</span>{' '}
                <strong className="text-slate-300">{unloadReceipt.commodity || '—'}</strong>
              </div>
            </div>

            {/* Selection: 4 Statuses */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                वास्तविक स्थिति चुनें (Select Real Physical Status):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Fully Sent */}
                <label
                  onClick={() => setUnloadStatusChoice('fully_sent')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    unloadStatusChoice === 'fully_sent'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md shadow-emerald-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="unloadStatusChoice"
                    checked={unloadStatusChoice === 'fully_sent'}
                    onChange={() => setUnloadStatusChoice('fully_sent')}
                    className="mt-1 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-emerald-300 flex items-center space-x-1">
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>🟢 Fully Sent (पूर्णतः भेजा)</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      सभी {unloadReceipt.totalCartons} कार्टून सीधे पार्टी को रवाना
                    </span>
                  </div>
                </label>

                {/* 2. Partly Sent */}
                <label
                  onClick={() => setUnloadStatusChoice('partly_sent')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    unloadStatusChoice === 'partly_sent'
                      ? 'bg-amber-950/60 border-amber-500 text-white shadow-md shadow-amber-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="unloadStatusChoice"
                    checked={unloadStatusChoice === 'partly_sent'}
                    onChange={() => setUnloadStatusChoice('partly_sent')}
                    className="mt-1 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-amber-300 flex items-center space-x-1">
                      <Truck className="w-3.5 h-3.5" />
                      <span>🟡 Partly Sent (आंशिक भेजा)</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      कुछ कार्टून पार्टी को, बाकी गोदाम स्टॉक में
                    </span>
                  </div>
                </label>

                {/* 3. Not In Container */}
                <label
                  onClick={() => setUnloadStatusChoice('not_in_container')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    unloadStatusChoice === 'not_in_container'
                      ? 'bg-red-950/60 border-red-500 text-white shadow-md shadow-red-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="unloadStatusChoice"
                    checked={unloadStatusChoice === 'not_in_container'}
                    onChange={() => setUnloadStatusChoice('not_in_container')}
                    className="mt-1 text-red-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-red-300 flex items-center space-x-1">
                      <PackageX className="w-3.5 h-3.5" />
                      <span>🔴 Not In Container</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      कंटेनर में माल नहीं मिला (शॉर्टेज / Missing)
                    </span>
                  </div>
                </label>

                {/* 4. Stored in Warehouse */}
                <label
                  onClick={() => setUnloadStatusChoice('stored_in_warehouse')}
                  className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition ${
                    unloadStatusChoice === 'stored_in_warehouse'
                      ? 'bg-purple-950/60 border-purple-500 text-white shadow-md shadow-purple-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="unloadStatusChoice"
                    checked={unloadStatusChoice === 'stored_in_warehouse'}
                    onChange={() => setUnloadStatusChoice('stored_in_warehouse')}
                    className="mt-1 text-purple-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold block text-purple-300 flex items-center space-x-1">
                      <Warehouse className="w-3.5 h-3.5" />
                      <span>🏢 Stored in Warehouse</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      पूरा माल भारतीय गोदाम स्टॉक में जमा
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* If Partly Sent: Quantity Sent Input + Live Preview */}
            {unloadStatusChoice === 'partly_sent' && (
              <div className="p-3.5 bg-amber-950/25 border border-amber-500/50 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    पार्टी को भेजे गए कार्टून दर्ज करें (Sent Quantity):
                  </label>
                  <span className="text-[11px] font-mono font-semibold text-slate-400">
                    Max: {unloadReceipt.totalCartons} CTN
                  </span>
                </div>
                <input
                  type="number"
                  value={unloadSentQuantity}
                  onChange={(e) => setUnloadSentQuantity(e.target.value ? Number(e.target.value) : '')}
                  placeholder={`1 से ${unloadReceipt.totalCartons} के बीच कार्टून दर्ज करें`}
                  min={1}
                  max={unloadReceipt.totalCartons}
                  className="w-full bg-slate-950 border border-amber-500/60 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-amber-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                {Number(unloadSentQuantity) > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                    <div className="text-amber-400">
                      🚚 पार्टी को रवाना: <strong>{unloadSentQuantity} CTN</strong>
                    </div>
                    <div className="text-purple-400 text-right">
                      🏢 गोदाम स्टॉक में जमा:{' '}
                      <strong className="text-emerald-400">
                        {Math.max(0, unloadReceipt.totalCartons - Number(unloadSentQuantity))} CTN
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shortage Warning if Not In Container */}
            {unloadStatusChoice === 'not_in_container' && (
              <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-2xl flex items-start space-x-2 text-xs text-red-300">
                <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <span>
                  सावधानी: यह रसीद &quot;Not In Container (Shortage)&quot; चिह्नित होगी और एडमिन/चाइना वेयरहाउस को सूचित किया जाएगा कि यह माल कंटेनर में नहीं मिला।
                </span>
              </div>
            )}

            {/* Remarks */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">रिमार्क्स (Optional Remarks / Notes):</label>
              <textarea
                value={unloadRemarks}
                onChange={(e) => setUnloadRemarks(e.target.value)}
                placeholder="e.g. 5 कार्टून डैमेज थे, बाकी माल सही सलामत गोदाम में रखा गया..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {unloadSuccessMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500 rounded-xl text-emerald-300 text-xs font-bold animate-in fade-in">
                {unloadSuccessMsg}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2.5 pt-2">
              <button
                onClick={handleSubmitUnloadStatus}
                disabled={unloadSubmitting}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-slate-950 rounded-xl font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{unloadSubmitting ? 'सहेज रहे हैं...' : 'स्थिति सहेजें (Save Unload Status)'}</span>
              </button>
              <button
                onClick={() => setUnloadModalOpen(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs border border-slate-700 transition"
              >
                रद्द करें (Cancel)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPATCH ACTION MODAL */}
      {dispatchModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  गाड़ी लोड & बिलिंग फॉर्म (Initiate Dispatch)
                </h3>
              </div>
              <button
                onClick={() => setDispatchModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Summary Info Card */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Receipt No:</span>{' '}
                <strong className="text-blue-300 font-mono">{selectedReceipt.receipt}</strong>
              </div>
              <div>
                <span className="text-slate-500">Marka:</span>{' '}
                <strong className="text-emerald-400">{selectedReceipt.marka}</strong>
              </div>
              <div>
                <span className="text-slate-500">Container / No:</span>{' '}
                <strong className="text-amber-300 font-mono">
                  {selectedReceipt.container}
                  {selectedReceipt.containerNumber && selectedReceipt.containerNumber !== selectedReceipt.container
                    ? ` (${selectedReceipt.containerNumber})`
                    : ''}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Item (वस्तु):</span>{' '}
                <strong className="text-cyan-300 truncate block">{selectedReceipt.commodity || 'Goods'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Available CTN:</span>{' '}
                <strong className="text-purple-300 font-mono">
                  {selectedReceipt.remainingCartons} CTN
                </strong>
              </div>
            </div>

            {/* Input 1: Gaadi Number */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                <span>1. गाड़ी नंबर (Vehicle / Gaadi Number)</span>
                <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. DL 1AA 1234 / HR 26 B 9999"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-amber-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            {/* Input 2: Carton Count */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                <span>2. कार्टून संख्या (Carton Count to Dispatch)</span>
                <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={cartonCount}
                onChange={(e) => setCartonCount(e.target.value ? Number(e.target.value) : '')}
                placeholder="Enter Cartons"
                max={selectedReceipt.remainingCartons || selectedReceipt.totalCartons}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-purple-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Input 3: Place / Address */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                <span>3. डिलीवरी का स्थान / पता (Place / Destination Address)</span>
                <span className="text-red-400">*</span>
              </label>
              <textarea
                value={placeAddress}
                onChange={(e) => setPlaceAddress(e.target.value)}
                placeholder="e.g. Gandhi Nagar, Delhi / Sadar Bazar, Delhi"
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Remarks (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">रिमार्क्स (Optional Notes)</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Driver phone, payment terms..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            {actionSuccessMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500 rounded-xl text-emerald-300 text-xs font-bold">
                {actionSuccessMsg}
              </div>
            )}

            {/* Action Buttons: 1) Initiate for Billing, 2) Self-Billing Option */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleInitiateBilling}
                disabled={submitting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>बिलिंग के लिए भेजें (Send to Biller)</span>
              </button>

              <button
                onClick={() => setSelfBillModalOpen(true)}
                disabled={submitting}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center justify-center space-x-2"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>खुद से बिलिंग बनाएँ (Self-Bill)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELF-BILLING MODAL */}
      {selfBillModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-purple-400">
                <Zap className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold text-white">डिस्पैचर सेल्फ-बिलिंग (Self-Bill)</h3>
              </div>
              <button
                onClick={() => setSelfBillModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              यह विकल्प डिस्पैचर को बिना बिलर की प्रतीक्षा किए तुरंत डायरेक्ट जीएसटी इनवॉइस जेनरेट करने की अनुमति देता है।
            </p>

            <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
              <div>
                <label className="text-slate-400 font-semibold block mb-1">
                  Taxable Value (कर योग्य मूल्य ₹):
                </label>
                <input
                  type="number"
                  value={selfBillTaxable}
                  onChange={(e) => setSelfBillTaxable(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold block mb-1">
                  IGST Rate (%):
                </label>
                <select
                  value={selfBillIgst}
                  onChange={(e) => setSelfBillIgst(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
                >
                  <option value={18}>18% IGST</option>
                  <option value={12}>12% IGST</option>
                  <option value={5}>5% IGST</option>
                  <option value={28}>28% IGST</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm">
                <span className="text-slate-400">Grand Total:</span>
                <span className="text-emerald-400 font-mono">
                  ₹{(selfBillTaxable + (selfBillTaxable * selfBillIgst) / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <button
              onClick={handleSelfBill}
              disabled={submitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-purple-600/30 transition flex items-center justify-center space-x-2"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>तुरंत बिल तैयार करें & माल डिस्पैच करें</span>
            </button>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
