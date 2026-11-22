'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  Calendar,
  ChevronDown,
  ChevronUp,
  X,
  Key,
  Volume2,
  Send,
  Zap,
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
  const [activeTab, setActiveTab] = useState<'delivery' | 'eta' | 'bills' | 'requests'>('delivery');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // SECTION 1: ETA Containers
  const [etaContainers, setEtaContainers] = useState<ContainerETA[]>([]);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);
  const [containerCargo, setContainerCargo] = useState<Record<string, CargoItem[]>>({});
  const [loadingCargo, setLoadingCargo] = useState<Record<string, boolean>>({});

  // SECTION 2: Delivery & Available Receipts
  const [deliveryItems, setDeliveryItems] = useState<DeliveryReceipt[]>([]);

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

  const filteredDeliveryItems = useMemo(() => {
    if (!searchQuery.trim()) return deliveryItems;
    const q = searchQuery.toLowerCase();
    return deliveryItems.filter(
      (r) =>
        r.receipt.toLowerCase().includes(q) ||
        r.marka.toLowerCase().includes(q) ||
        r.container.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        r.salesStatus.toLowerCase().includes(q)
    );
  }, [deliveryItems, searchQuery]);

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
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
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

            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* 3 Main Sections Navigation Tabs (Google Sheet-like grid tabs) */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center space-x-1 overflow-x-auto border-t border-slate-800/80 pt-1">
          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'delivery'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>2. Delivery Section (Available to Deliver)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-emerald-500/20 text-emerald-300">
              {deliveryItems.filter((d) => d.salesStatus === 'Available to Deliver').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('eta')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'eta'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Ship className="w-4 h-4" />
            <span>1. ETA (Container List)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-blue-500/20 text-blue-300">
              {etaContainers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bills')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'bills'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. Billing Section (Generated Bills)</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-purple-500/20 text-purple-300">
              {bills.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'requests'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Pending Dispatch Requests</span>
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500/20 text-amber-300">
              {requests.filter((r) => r.status === 'Pending').length}
            </span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-5 flex-1 w-full">
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

        {/* SECTION 2: DELIVERY (DELIVERED CONTAINERS & AVAILABLE TO DELIVER) */}
        {activeTab === 'delivery' && (
          <div className="space-y-4">
            {/* Notification Alert Banner */}
            <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    डिलीवरी सेक्शन (Delivery Section): Available to Deliver Only
                  </h3>
                  <p className="text-xs text-slate-400">
                    केवल वही माल बिलिंग हेतु प्रोसेस किया जा सकता है जिसे सेल्स हेड द्वारा "Available to Deliver" मार्क किया गया है।
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-1 bg-emerald-900/60 text-emerald-300 rounded-lg font-mono font-bold">
                  {deliveryItems.filter((i) => i.salesStatus === 'Available to Deliver').length} Receipts Ready
                </span>
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
                      <th className="py-3 px-4">Sales Status</th>
                      <th className="py-3 px-4 text-right">Dispatch Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredDeliveryItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          No receipts available for delivery.
                        </td>
                      </tr>
                    ) : (
                      filteredDeliveryItems.map((r) => {
                        const isAvailable = r.salesStatus === 'Available to Deliver';
                        const isHold = r.salesStatus === 'Hold';

                        return (
                          <tr
                            key={r._id}
                            className={`transition ${
                              isAvailable
                                ? 'hover:bg-emerald-950/20 bg-slate-900/90'
                                : 'hover:bg-slate-800/40 opacity-70'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold text-white">
                              {r.receipt}
                            </td>
                            <td className="py-3 px-4 font-black text-emerald-400 text-sm">
                              {r.marka}
                            </td>
                            <td className="py-3 px-4 font-mono text-blue-300">
                              {r.container}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {r.party}
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {r.commodity || '—'}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-purple-300">
                              {r.remainingCartons} / {r.totalCartons} CTN
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                                  isAvailable
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                    : isHold
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {r.salesStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isAvailable ? (
                                <button
                                  onClick={() => handleOpenDispatchModal(r)}
                                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition transform hover:scale-105"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>गाड़ी में लोड / बिलिंग</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-500 italic">
                                  {isHold ? 'On Hold by Sales Head' : 'Awaiting Clearance'}
                                </span>
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
                    <th className="py-3 px-4">Marka</th>
                    <th className="py-3 px-4">Gaadi No (गाड़ी)</th>
                    <th className="py-3 px-4 text-center">CTN</th>
                    <th className="py-3 px-4">Place / Address</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Biller Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
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
                        <td className="py-3 px-4 font-black text-white">{req.marka || '—'}</td>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

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
                <span className="text-slate-500">Container:</span>{' '}
                <strong className="text-slate-300">{selectedReceipt.container}</strong>
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
