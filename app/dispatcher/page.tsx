'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Download,
  Printer,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Box,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  User,
  Phone,
  Building,
  ChevronDown,
  Calculator,
  Percent,
  X,
} from 'lucide-react';
import { generateBillPDF, generateConsolidatedMarkaPDF, BillPdfData } from '@/lib/billPdf';

interface BillItem extends BillPdfData {
  _id: string;
  billNumber: string;
  receipt: string;
  hsnCode?: string;
  igst?: number;
  quantityPcs?: number;
  quantityKg?: number;
  totalCartons?: number;
  dispatchedCartons?: number;
  remainingCartons?: number;
  billingUnit?: 'Pcs' | 'KG' | 'Cartons';
  taxableValue?: number;
  igstAmount?: number;
  totalAmount?: number;
  container?: string;
  containerNumber?: string;
  party?: string;
  mainMarka?: string;
  subMarka?: string;
  commodity?: string;
  warehouse?: string;
  vehicleNumber?: string;
  isDispatched: boolean;
  dispatchStatus: string;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryAddressTitle?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  dispatchedAt?: string;
  createdAt?: string;
}

interface MarkaSummary {
  marka: string;
  totalBills: number;
  pendingBills: number;
  dispatchedBills: number;
  totalPcs: number;
  totalKg: number;
  totalCartons: number;
  dispatchedCartons: number;
  remainingCartons: number;
  totalTaxable: number;
  grandTotal: number;
  containers: string[];
  vehicles: string[];
  billingUnits?: string[];
}

interface ContainerItem {
  _id: string;
  container: string;
  containerNumber?: string;
  status?: string;
  shipmentCount?: number;
  isDelivered?: boolean;
}

interface DeliveryAddress {
  _id?: string;
  title: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  contactPerson?: string;
  phone?: string;
  isDefault?: boolean;
}

interface MarkaAddressRecord {
  _id?: string;
  marka: string;
  purchaserName?: string;
  registrationType?: 'Registered' | 'Unregistered';
  gstin?: string;
  pan?: string;
  state?: string;
  stateCode?: string;
  addresses: DeliveryAddress[];
}

export default function DispatcherPortalPage() {
  const router = useRouter();

  // Data lists
  const [bills, setBills] = useState<BillItem[]>([]);
  const [markas, setMarkas] = useState<MarkaSummary[]>([]);
  const [containersList, setContainersList] = useState<ContainerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Workflow Filters
  const [selectedContainer, setSelectedContainer] = useState<string>('all');
  const [selectedMarka, setSelectedMarka] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'dispatched'>('pending');

  // Dispatch Form State
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [dispatchedCartonsInput, setDispatchedCartonsInput] = useState<number | ''>('');
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dispatchTime, setDispatchTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const [remarks, setRemarks] = useState('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);

  // Marka Addresses & Purchaser State
  const [markaRecord, setMarkaRecord] = useState<MarkaAddressRecord | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  // Add / Edit Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<DeliveryAddress>({
    title: '',
    address: '',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '',
    contactPerson: '',
    phone: '',
    isDefault: false,
  });
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // Fetch Containers
  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/billing/container-manifest');
      if (res.ok) {
        const data = await res.json();
        setContainersList(data.containers || []);
      }
    } catch (e) {
      console.error('Failed to load containers:', e);
    }
  };

  // Fetch Markas and Bills (optionally filtered by container)
  const fetchData = async (containerVal = selectedContainer) => {
    setIsLoading(true);
    try {
      const containerParam = containerVal && containerVal !== 'all' ? `&container=${encodeURIComponent(containerVal)}` : '';
      const markasParam = containerVal && containerVal !== 'all' ? `?container=${encodeURIComponent(containerVal)}` : '';

      const [billsRes, markasRes] = await Promise.all([
        fetch(`/api/billing?limit=300${containerParam}`),
        fetch(`/api/billing/markas${markasParam}`),
      ]);

      if (billsRes.ok) {
        const data = await billsRes.json();
        setBills(data.bills || []);
      }
      if (markasRes.ok) {
        const mData = await markasRes.json();
        setMarkas(mData.markas || []);
      }
    } catch (err) {
      console.error('Failed to load dispatcher data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Marka Delivery Addresses
  const fetchMarkaAddresses = async (markaName: string) => {
    if (!markaName || markaName === 'all') {
      setMarkaRecord(null);
      setSelectedAddressId('');
      return;
    }

    setIsLoadingAddress(true);
    try {
      const res = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(markaName)}`);
      if (res.ok) {
        const data = await res.json();
        const rec: MarkaAddressRecord | null = data.markaAddress;
        setMarkaRecord(rec);

        // Auto select default address or first address
        if (rec && rec.addresses && rec.addresses.length > 0) {
          const defaultAddr = rec.addresses.find((a) => a.isDefault) || rec.addresses[0];
          setSelectedAddressId(defaultAddr._id || '');
        } else {
          setSelectedAddressId('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch marka addresses:', err);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    fetchData('all');
  }, []);

  // Handle Container Change
  const handleSelectContainer = (cName: string) => {
    setSelectedContainer(cName);
    setSelectedMarka('all');
    setSelectedBillIds(new Set());
    setMarkaRecord(null);
    setSelectedAddressId('');
    setDispatchedCartonsInput('');
    setDispatchSuccessMsg(null);
    fetchData(cName);
  };

  // Handle Marka Change
  const handleSelectMarka = (mName: string) => {
    setSelectedMarka(mName);
    setDispatchSuccessMsg(null);

    if (mName !== 'all') {
      // Auto select all matching pending bills for this marka
      const matchingPending = bills.filter(
        (b) =>
          !b.isDispatched &&
          ((b.mainMarka && b.mainMarka.toLowerCase() === mName.toLowerCase()) ||
            (b.subMarka && b.subMarka.toLowerCase() === mName.toLowerCase()))
      );
      setSelectedBillIds(new Set(matchingPending.map((b) => b._id)));

      // Auto populate cartons to dispatch from pending total
      const totalCartons = matchingPending.reduce((sum, b) => sum + (b.totalCartons || 0), 0);
      setDispatchedCartonsInput(totalCartons > 0 ? totalCartons : '');

      // Fetch addresses for this marka
      fetchMarkaAddresses(mName);
    } else {
      setSelectedBillIds(new Set());
      setMarkaRecord(null);
      setSelectedAddressId('');
      setDispatchedCartonsInput('');
    }
  };

  // Toggle Single Bill Selection
  const toggleSelectBill = (id: string) => {
    const next = new Set(selectedBillIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBillIds(next);

    // Recalculate default cartons for selected bills
    const selectedList = bills.filter((b) => next.has(b._id));
    const sumCtn = selectedList.reduce((sum, b) => sum + (b.totalCartons || 0), 0);
    setDispatchedCartonsInput(sumCtn > 0 ? sumCtn : '');

    // If all selected bills belong to same marka and no marka selected, load its addresses
    const uniqueMarkas = Array.from(new Set(selectedList.map((b) => b.mainMarka || b.subMarka).filter(Boolean)));
    if (uniqueMarkas.length === 1 && selectedMarka === 'all') {
      fetchMarkaAddresses(uniqueMarkas[0] as string);
    }
  };

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Container filter
      if (selectedContainer !== 'all') {
        const matchesCont = b.container && b.container.toLowerCase().includes(selectedContainer.toLowerCase());
        if (!matchesCont) return false;
      }

      // Marka filter
      if (selectedMarka !== 'all') {
        const matchesMain = b.mainMarka && b.mainMarka.toLowerCase() === selectedMarka.toLowerCase();
        const matchesSub = b.subMarka && b.subMarka.toLowerCase() === selectedMarka.toLowerCase();
        if (!matchesMain && !matchesSub) return false;
      }

      // Status filter
      if (statusFilter === 'pending' && b.isDispatched) return false;
      if (statusFilter === 'dispatched' && !b.isDispatched) return false;

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.receipt.toLowerCase().includes(q) ||
        b.billNumber.toLowerCase().includes(q) ||
        (b.mainMarka && b.mainMarka.toLowerCase().includes(q)) ||
        (b.subMarka && b.subMarka.toLowerCase().includes(q)) ||
        (b.container && b.container.toLowerCase().includes(q)) ||
        (b.party && b.party.toLowerCase().includes(q)) ||
        (b.vehicleNumber && b.vehicleNumber.toLowerCase().includes(q))
      );
    });
  }, [bills, selectedContainer, selectedMarka, statusFilter, searchQuery]);

  // Select / Deselect All Filtered
  const toggleSelectAllFiltered = () => {
    if (selectedBillIds.size === filteredBills.length && filteredBills.length > 0) {
      setSelectedBillIds(new Set());
      setDispatchedCartonsInput('');
    } else {
      const allIds = new Set(filteredBills.map((b) => b._id));
      setSelectedBillIds(allIds);
      const sumCtn = filteredBills.reduce((sum, b) => sum + (b.totalCartons || 0), 0);
      setDispatchedCartonsInput(sumCtn > 0 ? sumCtn : '');
    }
  };

  // Selected Bills Details & Proportionate Calculations
  const selectedBillsData = useMemo(() => {
    const list = bills.filter((b) => selectedBillIds.has(b._id));
    const totalPcs = list.reduce((sum, b) => sum + (b.quantityPcs || 0), 0);
    const totalKg = list.reduce((sum, b) => sum + (b.quantityKg || 0), 0);
    const totalCartons = list.reduce((sum, b) => sum + (b.totalCartons || 0), 0);
    const totalTaxable = list.reduce((sum, b) => sum + (b.taxableValue || 0), 0);
    const totalIgst = list.reduce((sum, b) => sum + (b.igstAmount || 0), 0);
    const grandTotal = list.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // Primary billing unit chosen by biller (Pcs, KG, Cartons)
    const billingUnits = Array.from(new Set(list.map((b) => b.billingUnit || 'Pcs')));
    const primaryUnit = billingUnits[0] || 'Pcs';

    // Proportionate ratio based on cartons input
    let ratio = 1;
    const dispCtn = typeof dispatchedCartonsInput === 'number' ? dispatchedCartonsInput : totalCartons;
    if (totalCartons > 0 && dispCtn > 0) {
      ratio = Math.min(1, dispCtn / totalCartons);
    }

    const proportionatePcs = Math.round(totalPcs * ratio);
    const proportionateKg = Number((totalKg * ratio).toFixed(2));
    const proportionateTaxable = Number((totalTaxable * ratio).toFixed(2));
    const proportionateIgst = Number((totalIgst * ratio).toFixed(2));
    const proportionateTotal = Number((grandTotal * ratio).toFixed(2));

    return {
      list,
      totalPcs,
      totalKg,
      totalCartons,
      totalTaxable,
      totalIgst,
      grandTotal,
      primaryUnit,
      ratio,
      dispCtn,
      proportionatePcs,
      proportionateKg,
      proportionateTaxable,
      proportionateIgst,
      proportionateTotal,
      isPartial: ratio < 0.999 && totalCartons > 0,
    };
  }, [bills, selectedBillIds, dispatchedCartonsInput]);

  // Selected Address Details
  const activeAddress = useMemo(() => {
    if (!markaRecord || !markaRecord.addresses) return null;
    return markaRecord.addresses.find((a) => a._id === selectedAddressId) || markaRecord.addresses[0] || null;
  }, [markaRecord, selectedAddressId]);

  // Action: Save New or Edited Address
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveMarka = selectedMarka !== 'all' ? selectedMarka : markaRecord?.marka;
    if (!effectiveMarka) {
      alert('कृपया पहले एक मार्का (Marka) चुनें जिसके अंदर एड्रेस सेव करना है।');
      return;
    }

    if (!addressForm.address.trim()) {
      alert('कृपया पूरा डिलीवरी पता (Address) दर्ज करें।');
      return;
    }

    setIsSavingAddress(true);
    try {
      if (editingAddressId) {
        // Edit existing address
        const res = await fetch('/api/marka-addresses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marka: effectiveMarka,
            addressId: editingAddressId,
            ...addressForm,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update address');
        setMarkaRecord(data.markaAddress);
      } else {
        // Add new address
        const res = await fetch('/api/marka-addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marka: effectiveMarka,
            address: addressForm,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add address');
        setMarkaRecord(data.markaAddress);
        if (data.markaAddress?.addresses?.length > 0) {
          const lastAddr = data.markaAddress.addresses[data.markaAddress.addresses.length - 1];
          setSelectedAddressId(lastAddr._id || '');
        }
      }

      setShowAddressModal(false);
      setEditingAddressId(null);
      setAddressForm({
        title: '',
        address: '',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '',
        contactPerson: '',
        phone: '',
        isDefault: false,
      });
    } catch (err: any) {
      alert(err.message || 'Error saving address');
    } finally {
      setIsSavingAddress(false);
    }
  };

  // Action: Delete Address
  const handleDeleteAddress = async (addrId: string) => {
    const effectiveMarka = selectedMarka !== 'all' ? selectedMarka : markaRecord?.marka;
    if (!effectiveMarka || !addrId) return;

    if (!confirm('क्या आप वाकई यह डिलीवरी एड्रेस हटाना चाहते हैं?')) return;

    try {
      const res = await fetch(
        `/api/marka-addresses?marka=${encodeURIComponent(effectiveMarka)}&addressId=${encodeURIComponent(addrId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete address');
      setMarkaRecord(data.markaAddress);
      if (selectedAddressId === addrId) {
        setSelectedAddressId(data.markaAddress?.addresses?.[0]?._id || '');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting address');
    }
  };

  // Open Edit Modal
  const openEditModal = (addr: DeliveryAddress) => {
    setEditingAddressId(addr._id || null);
    setAddressForm({
      title: addr.title || '',
      address: addr.address || '',
      city: addr.city || 'Delhi',
      state: addr.state || 'Delhi',
      pincode: addr.pincode || '',
      contactPerson: addr.contactPerson || '',
      phone: addr.phone || '',
      isDefault: Boolean(addr.isDefault),
    });
    setShowAddressModal(true);
  };

  // Action 1: Regenerate PDF with Vehicle Number, Address, and Proportionate Cartons
  const handleRegeneratePDF = (targetBill?: BillItem) => {
    const vNo = vehicleNumber.trim();
    if (!vNo) {
      alert('कृपया पहले गाड़ी नंबर (Vehicle Number) डालें ताकि पीडीएफ में गाड़ी नंबर दिख सके।');
      return;
    }

    const formattedDeliveryAddress = activeAddress
      ? `${activeAddress.title ? `[${activeAddress.title}] ` : ''}${activeAddress.address}, ${activeAddress.city || ''} ${activeAddress.state || ''} ${activeAddress.pincode ? `- ${activeAddress.pincode}` : ''}`
      : undefined;

    if (targetBill) {
      // Regenerate for a single specific bill
      const bRatio =
        typeof dispatchedCartonsInput === 'number' && targetBill.totalCartons && targetBill.totalCartons > 0
          ? Math.min(1, dispatchedCartonsInput / targetBill.totalCartons)
          : 1;

      const updatedData: BillPdfData = {
        ...targetBill,
        vehicleNumber: vNo,
        isDispatched: true,
        deliveryDate: dispatchDate,
        deliveryTime: dispatchTime,
        deliveryAddressTitle: activeAddress?.title,
        deliveryAddress: formattedDeliveryAddress || targetBill.deliveryAddress,
        deliveryPhone: activeAddress?.phone || targetBill.deliveryPhone,
        totalCartons: targetBill.totalCartons,
        dispatchedCartons: typeof dispatchedCartonsInput === 'number' ? dispatchedCartonsInput : targetBill.totalCartons,
        billingUnit: targetBill.billingUnit || 'Pcs',
        quantityPcs: bRatio < 1 ? Math.round((targetBill.quantityPcs || 0) * bRatio) : targetBill.quantityPcs,
        quantityKg: bRatio < 1 ? Number(((targetBill.quantityKg || 0) * bRatio).toFixed(2)) : targetBill.quantityKg,
        taxableValue: bRatio < 1 ? Number(((targetBill.taxableValue || 0) * bRatio).toFixed(2)) : targetBill.taxableValue,
      };
      generateBillPDF(updatedData, true);
      return;
    }

    const selectedList = selectedBillsData.list;
    if (selectedList.length === 0) {
      alert('कृपया कम से कम एक बिल चुनें या बिल लिस्ट में से पीडीएफ डाउनलोड करें।');
      return;
    }

    if (selectedList.length === 1) {
      const b = selectedList[0];
      const updatedData: BillPdfData = {
        ...b,
        vehicleNumber: vNo,
        isDispatched: true,
        deliveryDate: dispatchDate,
        deliveryTime: dispatchTime,
        deliveryAddressTitle: activeAddress?.title,
        deliveryAddress: formattedDeliveryAddress || b.deliveryAddress,
        deliveryPhone: activeAddress?.phone || b.deliveryPhone,
        totalCartons: b.totalCartons,
        dispatchedCartons: selectedBillsData.dispCtn,
        billingUnit: b.billingUnit || 'Pcs',
        quantityPcs: selectedBillsData.proportionatePcs,
        quantityKg: selectedBillsData.proportionateKg,
        taxableValue: selectedBillsData.proportionateTaxable,
      };
      generateBillPDF(updatedData, true);
    } else {
      // Consolidated Marka PDF
      const markaLabel = selectedMarka !== 'all' ? selectedMarka : 'MULTI_MARKA';
      const updatedList: BillPdfData[] = selectedList.map((b) => {
        const itemRatio = selectedBillsData.ratio;
        return {
          ...b,
          vehicleNumber: vNo,
          isDispatched: true,
          deliveryDate: dispatchDate,
          deliveryTime: dispatchTime,
          deliveryAddressTitle: activeAddress?.title,
          deliveryAddress: formattedDeliveryAddress || b.deliveryAddress,
          deliveryPhone: activeAddress?.phone || b.deliveryPhone,
          totalCartons: b.totalCartons,
          dispatchedCartons: Math.round((b.totalCartons || 0) * itemRatio),
          billingUnit: b.billingUnit || 'Pcs',
          quantityPcs: itemRatio < 1 ? Math.round((b.quantityPcs || 0) * itemRatio) : b.quantityPcs,
          quantityKg: itemRatio < 1 ? Number(((b.quantityKg || 0) * itemRatio).toFixed(2)) : b.quantityKg,
          taxableValue: itemRatio < 1 ? Number(((b.taxableValue || 0) * itemRatio).toFixed(2)) : b.taxableValue,
        };
      });
      generateConsolidatedMarkaPDF(markaLabel, updatedList, vNo, formattedDeliveryAddress);
    }
  };

  // Action 2: "दिस माल इस डिस्पैच्ड" (Mark as Dispatched & Record Date/Time)
  const handleMarkAsDispatched = async () => {
    const vNo = vehicleNumber.trim();
    if (!vNo) {
      alert('गाड़ी नंबर (Vehicle Number) दर्ज करना अनिवार्य है।');
      return;
    }

    const targetIds = Array.from(selectedBillIds);
    if (targetIds.length === 0) {
      alert('कृपया जिन बिल्स का माल डिस्पैच करना है, उन्हें चेकबॉक्स से सेलेक्ट करें।');
      return;
    }

    setIsSubmittingDispatch(true);
    setDispatchSuccessMsg(null);

    const formattedDeliveryAddress = activeAddress
      ? `${activeAddress.title ? `[${activeAddress.title}] ` : ''}${activeAddress.address}, ${activeAddress.city || ''} ${activeAddress.state || ''} ${activeAddress.pincode ? `- ${activeAddress.pincode}` : ''}`
      : undefined;

    try {
      const res = await fetch('/api/billing/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billIds: targetIds,
          vehicleNumber: vNo,
          deliveryDate: dispatchDate,
          deliveryTime: dispatchTime,
          remarks: remarks.trim(),
          deliveryAddressTitle: activeAddress?.title,
          deliveryAddress: formattedDeliveryAddress,
          deliveryPhone: activeAddress?.phone,
          dispatchedCartons: typeof dispatchedCartonsInput === 'number' ? dispatchedCartonsInput : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch bills');

      const cartonText = typeof dispatchedCartonsInput === 'number' ? ` (${dispatchedCartonsInput} Cartons)` : '';
      setDispatchSuccessMsg(
        `✓ सफलता! ${data.dispatchedCount} बिलों का माल गाड़ी नंबर '${vNo}'${cartonText} के साथ डिस्पैच मार्क हो गया है। कंटेनर डिलीवरी डेटा अपडेट हो गया है!`
      );

      // Offer to auto-download regenerated PDF
      if (confirm('माल डिस्पैच हो गया है! क्या आप रीजेनरेटेड डिस्पैच पीडीएफ डाउनलोड करना चाहते हैं?')) {
        handleRegeneratePDF();
      }

      // Reset selection and refresh
      setSelectedBillIds(new Set());
      setVehicleNumber('');
      setRemarks('');
      setDispatchedCartonsInput('');
      await fetchData(selectedContainer);
    } catch (err: any) {
      alert(err?.message || 'Error marking as dispatched');
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    let pendingCount = 0;
    let dispatchedCount = 0;
    let totalCartons = 0;
    for (const b of bills) {
      if (b.isDispatched) dispatchedCount++;
      else pendingCount++;
      totalCartons += b.totalCartons || 0;
    }
    return {
      total: bills.length,
      pending: pendingCount,
      dispatched: dispatchedCount,
      markasCount: markas.length,
      totalCartons,
    };
  }, [bills, markas]);

  // Handle Logout
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top Header */}
      <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-base text-white tracking-tight">US INTERNATIONAL</span>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 rounded-full">
                  Dispatcher Portal (डिस्पैचर)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Container $\rightarrow$ Marka $\rightarrow$ Vehicle Allotment $\rightarrow$ Cartons Proportionate & Multi-Address
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href="/biller"
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>Biller View</span>
            </Link>
            <Link
              href="/admin"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin</span>
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* KPI Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Ready for Dispatch</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">{metrics.pending}</div>
            <span className="text-[11px] text-slate-500">Awaiting गाड़ी नंबर</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Dispatched Cargo</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{metrics.dispatched}</div>
            <span className="text-[11px] text-slate-500">Delivered via Vehicle</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Markas in Scope</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black text-cyan-300">{metrics.markasCount}</div>
            <span className="text-[11px] text-slate-500">Shipping marks</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Total Packaging Cartons</span>
              <Box className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300">{metrics.totalCartons.toLocaleString('en-IN')} CTN</div>
            <span className="text-[11px] text-slate-500">Packaging Cartons</span>
          </div>
        </div>

        {/* STEP 1: CONTAINER SELECTOR (कंटेनर नंबर चुनें) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                <Box className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Step 1: कंटेनर नंबर चुनें (Select Container)
                </h2>
                <p className="text-[11px] text-slate-400">
                  डिस्पैचर पहले कंटेनर चुनेगा ताकि केवल उसी कंटेनर के मार्का दिखाई दें
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  list="dispatcher-containers-list"
                  value={selectedContainer === 'all' ? '' : selectedContainer}
                  onChange={(e) => handleSelectContainer(e.target.value || 'all')}
                  placeholder="कंटेनर नं. टाइप करें (e.g. 208)"
                  className="w-44 sm:w-52 px-3 py-2 rounded-xl bg-slate-950 border border-blue-500/50 text-xs font-black text-blue-300 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                />
                <datalist id="dispatcher-containers-list">
                  <option value="all">All Containers</option>
                  {containersList.map((c) => (
                    <option key={c.container} value={c.container}>
                      {c.container} ({c.shipmentCount || 0} shipments)
                    </option>
                  ))}
                </datalist>
              </div>

              <select
                value={selectedContainer}
                onChange={(e) => handleSelectContainer(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[200px]"
              >
                <option value="all">📦 All Containers (सभी)</option>
                {containersList.map((c) => (
                  <option key={c._id || c.container} value={c.container}>
                    {c.container} {c.containerNumber ? `(${c.containerNumber})` : ''} - {c.shipmentCount || 0} shipments
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Container Buttons */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => handleSelectContainer('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1 flex-shrink-0 ${
                selectedContainer === 'all'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <span>All Containers</span>
            </button>

            {containersList.slice(0, 8).map((c) => (
              <button
                key={c._id || c.container}
                onClick={() => handleSelectContainer(c.container)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1 flex-shrink-0 ${
                  selectedContainer.toLowerCase() === c.container.toLowerCase()
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50'
                }`}
              >
                <span>{c.container}</span>
                {c.isDelivered ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Delivered" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="In Transit / Port" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2: MARKA SELECTOR (मार्का चुनें) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                <Layers className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Step 2: मार्का चुनें (Select Marka)
                </h2>
                <p className="text-[11px] text-slate-400">
                  डिस्पैचर मार्का समझता है। मार्का चुनते ही उसके सारे पेंडिंग बिल्स और कार्टून सेलेक्ट हो जाएंगे।
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400">{markas.length} Available Markas</span>
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => handleSelectMarka('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 flex-shrink-0 ${
                selectedMarka === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>All Markas</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/40 text-slate-200">
                {bills.length}
              </span>
            </button>

            {markas.map((m) => {
              const isSelected = selectedMarka.toLowerCase() === m.marka.toLowerCase();
              return (
                <button
                  key={m.marka}
                  onClick={() => handleSelectMarka(m.marka)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 flex-shrink-0 ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
                  }`}
                >
                  <span className="font-extrabold">{m.marka}</span>
                  {m.remainingCartons > 0 && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-slate-950 text-emerald-400' : 'bg-purple-950 text-purple-300 border border-purple-700/50'
                      }`}
                      title="Remaining Cartons"
                    >
                      {m.remainingCartons} CTN
                    </span>
                  )}
                  {m.pendingBills > 0 && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-slate-950 text-amber-300' : 'bg-amber-500 text-slate-950'
                      }`}
                      title="Pending Bills"
                    >
                      {m.pendingBills} Bills
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 3 & 4: DISPATCH CONTROL + CARTON PROPORTIONATE + MULTI-ADDRESS MANAGER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLUMNS: VEHICLE & CARTON PROPORTIONATE CALCULATION */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Truck className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Step 3: गाड़ी नंबर & कार्टून संख्या (Vehicle Allotment & Cartons Proportionate)
                </h2>
                <p className="text-[11px] text-slate-400">
                  गाड़ी नंबर और कार्टून डालें - सिस्टम बिलर द्वारा तय यूनिट (Pcs/KG/Cartons) के अनुसार अनुपातिक कैलकुलेशन करेगा
                </p>
              </div>
            </div>

            {dispatchSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs font-semibold flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                <span>{dispatchSuccessMsg}</span>
              </div>
            )}

            {/* Inputs Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Vehicle Number Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                  <span>गाड़ी नंबर (Vehicle Number) *</span>
                  <span className="text-[10px] text-slate-400">e.g. DL 1AA 1234</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="HR 55 AB 1234"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-black uppercase tracking-wider"
                  />
                  <Truck className="w-4 h-4 text-emerald-500 absolute left-3.5 top-3" />
                </div>
              </div>

              {/* Cartons to Dispatch Input (कार्टून संख्या) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center justify-between">
                  <span>कार्टून संख्या (Cartons to Dispatch) *</span>
                  <span className="text-[10px] text-slate-400">
                    Total: {selectedBillsData.totalCartons} CTN
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={selectedBillsData.totalCartons || undefined}
                    value={dispatchedCartonsInput}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setDispatchedCartonsInput(isNaN(val as number) ? '' : val);
                    }}
                    placeholder={selectedBillsData.totalCartons ? String(selectedBillsData.totalCartons) : '0'}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-purple-800/60 text-purple-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-black"
                  />
                  <Box className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" />
                </div>
              </div>

              {/* Dispatch Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  तारीख (Dispatch Date)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold"
                  />
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              {/* Dispatch Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  समय (Dispatch Time)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={dispatchTime}
                    onChange={(e) => setDispatchTime(e.target.value)}
                    placeholder="11:45 AM"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold"
                  />
                  <Clock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              {/* Remarks / Driver Notes */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  रिमार्क्स (Driver / Dispatch Notes)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Direct delivery to client godown via GT Road"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                />
              </div>
            </div>

            {/* LIVE PROPORTIONATE CALCULATION PANEL */}
            {selectedBillsData.list.length > 0 && (
              <div className="bg-slate-950/90 border border-purple-900/50 rounded-2xl p-4 space-y-3.5 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-900/30 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Calculator className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-black text-purple-200 uppercase tracking-wider">
                      कार्टून अनुपातिक कैलकुलेटर (Proportionate Preview)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-purple-950 border border-purple-600 text-purple-200">
                      ★ Biller Unit: {selectedBillsData.primaryUnit}
                    </span>
                    {selectedBillsData.isPartial ? (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-amber-950 border border-amber-700 text-amber-300 flex items-center space-x-1">
                        <Percent className="w-3 h-3" />
                        <span>Partial ({(selectedBillsData.ratio * 100).toFixed(1)}%)</span>
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-950 border border-emerald-700 text-emerald-300">
                        Full Dispatch (100%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Biller's Unit Decision Banner */}
                <div className="p-3 rounded-xl border text-xs space-y-1 bg-slate-900 border-slate-800">
                  <div className="flex items-center space-x-1.5 text-cyan-300 font-black text-[11px] uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>बिलर का निर्णय (Biller's Decision on Unit):</span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-relaxed pl-5">
                    {selectedBillsData.primaryUnit === 'Cartons' && (
                      <p>
                        🎯 <strong>कार्टून यूनिट (Billed in Cartons):</strong> बिलर ने इस माल का बिल <strong>कार्टून</strong> में तय किया है। डिस्पैचर ने <strong>{selectedBillsData.dispCtn} कार्टून</strong> दर्ज किए हैं। बिल मुख्य रूप से कार्टून संख्या पर जारी होगा।
                      </p>
                    )}
                    {selectedBillsData.primaryUnit === 'Pcs' && (
                      <p>
                        🎯 <strong>पीस यूनिट (Billed in Pieces):</strong> बिलर ने इस माल का बिल <strong>पीस</strong> में तय किया है। डिस्पैचर ने केवल कार्टून डाले (<strong>{selectedBillsData.dispCtn} CTN</strong>) $\rightarrow$ कुल {selectedBillsData.totalCartons} कार्टून के अनुपात ({(selectedBillsData.ratio * 100).toFixed(1)}%) से <strong>{selectedBillsData.proportionatePcs.toLocaleString('en-IN')} पीस</strong> का बिल स्वतः तैयार होगा।
                      </p>
                    )}
                    {selectedBillsData.primaryUnit === 'KG' && (
                      <p>
                        🎯 <strong>वजन यूनिट (Billed in KG):</strong> बिलर ने इस माल का बिल <strong>वजन (KG)</strong> में तय किया है। डिस्पैचर ने केवल कार्टून डाले (<strong>{selectedBillsData.dispCtn} CTN</strong>) $\rightarrow$ कुल {selectedBillsData.totalCartons} कार्टून के अनुपात ({(selectedBillsData.ratio * 100).toFixed(1)}%) से <strong>{selectedBillsData.proportionateKg.toLocaleString('en-IN')} KG</strong> का बिल स्वतः तैयार होगा।
                      </p>
                    )}
                  </div>
                </div>

                {/* 4 Cards Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className={`p-2.5 rounded-xl border ${selectedBillsData.primaryUnit === 'Cartons' ? 'bg-purple-950/40 border-purple-600 ring-1 ring-purple-500' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center justify-between text-slate-400 text-[10px] mb-0.5">
                      <span>Cartons (कार्टून)</span>
                      {selectedBillsData.primaryUnit === 'Cartons' && <span className="text-[9px] font-black text-purple-400">★ Main</span>}
                    </div>
                    <span className="font-black text-purple-300 text-sm">
                      {selectedBillsData.dispCtn} / {selectedBillsData.totalCartons} CTN
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5">डिस्पैचर इनपुट</span>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${selectedBillsData.primaryUnit === 'Pcs' ? 'bg-purple-950/40 border-purple-600 ring-1 ring-purple-500' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center justify-between text-slate-400 text-[10px] mb-0.5">
                      <span>Pieces (पीस)</span>
                      {selectedBillsData.primaryUnit === 'Pcs' && <span className="text-[9px] font-black text-cyan-400">★ Main</span>}
                    </div>
                    <span className="font-black text-purple-200 text-sm">
                      {selectedBillsData.proportionatePcs.toLocaleString('en-IN')} Pcs
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5">कुल: {selectedBillsData.totalPcs.toLocaleString('en-IN')}</span>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${selectedBillsData.primaryUnit === 'KG' ? 'bg-purple-950/40 border-purple-600 ring-1 ring-purple-500' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="flex items-center justify-between text-slate-400 text-[10px] mb-0.5">
                      <span>Weight (वजन)</span>
                      {selectedBillsData.primaryUnit === 'KG' && <span className="text-[9px] font-black text-cyan-400">★ Main</span>}
                    </div>
                    <span className="font-black text-cyan-300 text-sm">
                      {selectedBillsData.proportionateKg.toLocaleString('en-IN')} KG
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5">कुल: {selectedBillsData.totalKg.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="p-2.5 rounded-xl border bg-slate-900 border-slate-800">
                    <span className="text-slate-400 block text-[10px] mb-0.5">Taxable (₹ राशि)</span>
                    <span className="font-black text-emerald-400 text-sm">
                      ₹{selectedBillsData.proportionateTaxable.toLocaleString('en-IN')}
                    </span>
                    <span className="block text-[9px] text-slate-500 mt-0.5">कुल: ₹{selectedBillsData.totalTaxable.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-950 border border-slate-800/80 rounded-2xl p-4 gap-3">
              <div className="text-xs text-slate-400">
                Selected Bills:{' '}
                <span className="font-bold text-white text-sm">{selectedBillIds.size}</span>
                {selectedMarka !== 'all' && (
                  <span className="ml-2 text-cyan-400">
                    (Marka: <strong className="text-white">{selectedMarka}</strong>)
                  </span>
                )}
                {activeAddress && (
                  <span className="ml-2 text-emerald-400">
                    (Address: <strong className="text-white">{activeAddress.title || 'Selected'}</strong>)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                {/* Button 1: REGENERATE PDF */}
                <button
                  type="button"
                  onClick={() => handleRegeneratePDF()}
                  disabled={!vehicleNumber.trim() || selectedBillIds.size === 0}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold rounded-xl text-xs transition shadow-lg flex items-center justify-center space-x-2 disabled:opacity-40"
                >
                  <Printer className="w-4 h-4" />
                  <span>रीजेनरेट पीडीएफ (Regenerate PDF)</span>
                </button>

                {/* Button 2: MARK AS DISPATCHED */}
                <button
                  type="button"
                  onClick={handleMarkAsDispatched}
                  disabled={isSubmittingDispatch || !vehicleNumber.trim() || selectedBillIds.size === 0}
                  className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 disabled:opacity-40"
                >
                  {isSubmittingDispatch ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating Container & Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>दिस माल इस डिस्पैच्ड (Mark as Dispatched)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT 1 COLUMN: MULTIPLE DELIVERY ADDRESSES MANAGER FOR MARKA */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">
                      Step 4: डिलीवरी एड्रेस (Delivery Addresses)
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      मार्का के अंदर मल्टीपल एड्रेस जोड़ें, एडिट या डिलीट करें
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingAddressId(null);
                    setAddressForm({
                      title: '',
                      address: '',
                      city: 'Delhi',
                      state: 'Delhi',
                      pincode: '',
                      contactPerson: '',
                      phone: '',
                      isDefault: false,
                    });
                    setShowAddressModal(true);
                  }}
                  className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Address</span>
                </button>
              </div>

              {/* Purchaser Details Info Card */}
              {markaRecord ? (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      Purchaser / Party
                    </span>
                    <span
                      className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                        markaRecord.registrationType === 'Unregistered'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                      }`}
                    >
                      {markaRecord.registrationType === 'Unregistered' ? 'URP (Unregistered)' : 'Registered Party'}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">
                    {markaRecord.purchaserName || markaRecord.marka}
                  </div>
                  {markaRecord.gstin && (
                    <div className="text-[11px] text-slate-400 font-mono">
                      GSTIN: <span className="text-slate-200">{markaRecord.gstin}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400">
                    State: <span className="text-slate-200">{markaRecord.state || 'Delhi'}</span>
                  </div>
                </div>
              ) : selectedMarka !== 'all' ? (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400">
                  Loading purchaser details for {selectedMarka}...
                </div>
              ) : (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400">
                  Select a Marka above to view and manage delivery addresses.
                </div>
              )}

              {/* Address List */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {isLoadingAddress ? (
                  <div className="p-4 text-center text-xs text-slate-500">Loading addresses...</div>
                ) : !markaRecord || !markaRecord.addresses || markaRecord.addresses.length === 0 ? (
                  <div className="p-4 bg-slate-950/50 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500 space-y-2">
                    <MapPin className="w-6 h-6 text-slate-600 mx-auto" />
                    <p>No delivery address added yet for this Marka.</p>
                    <button
                      type="button"
                      onClick={() => setShowAddressModal(true)}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                    >
                      + Add Delivery Address Now
                    </button>
                  </div>
                ) : (
                  markaRecord.addresses.map((addr) => {
                    const isSelected = selectedAddressId === addr._id;
                    return (
                      <div
                        key={addr._id}
                        onClick={() => setSelectedAddressId(addr._id || '')}
                        className={`p-3 rounded-2xl border cursor-pointer transition relative space-y-1 text-xs ${
                          isSelected
                            ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="selectedAddress"
                              checked={isSelected}
                              onChange={() => setSelectedAddressId(addr._id || '')}
                              className="text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="font-black text-white">{addr.title || 'Delivery Godown'}</span>
                            {addr.isDefault && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-bold">
                                Default
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditModal(addr)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded"
                              title="Edit Address"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(addr._id || '')}
                              className="p-1 hover:bg-red-950/50 text-slate-400 hover:text-red-400 rounded"
                              title="Delete Address"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-slate-300 pl-5 text-[11px] leading-relaxed">{addr.address}</p>
                        <div className="pl-5 text-[10px] text-slate-500 flex flex-wrap gap-2">
                          {addr.city && <span>City: {addr.city}</span>}
                          {addr.state && <span>State: {addr.state}</span>}
                          {addr.phone && <span>Ph: {addr.phone}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Address Selection Preview Note */}
            {activeAddress && (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-[11px] text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span className="truncate">
                  Destination: <strong>{activeAddress.title}</strong> ({activeAddress.city || 'Delhi'})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* STEP 5: BILLS LIST & TRACKER TABLE */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white flex items-center space-x-2">
                <span>Step 5: माल डिस्पैच लिस्ट (Bills & Delivery Tracker)</span>
                {selectedContainer !== 'all' && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs font-bold">
                    Container: {selectedContainer}
                  </span>
                )}
                {selectedMarka !== 'all' && (
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full text-xs font-bold">
                    Marka: {selectedMarka}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Select bills to allot vehicle number, regenerate PDF, or confirm delivery.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchData(selectedContainer)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="Refresh bills"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'pending'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pending ({metrics.pending})
                </button>
                <button
                  onClick={() => setStatusFilter('dispatched')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'dispatched'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Dispatched ({metrics.dispatched})
                </button>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'all'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({metrics.total})
                </button>
              </div>
            </div>
          </div>

          {/* Search bar & Select All toggle */}
          <div className="flex items-center space-x-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Receipt, Marka, Container, Vehicle..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={toggleSelectAllFiltered}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition border border-slate-700 flex items-center space-x-1.5"
            >
              {selectedBillIds.size === filteredBills.length && filteredBills.length > 0 ? (
                <>
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-slate-400" />
                  <span>Select All ({filteredBills.length})</span>
                </>
              )}
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-3.5 text-center w-10">Select</th>
                  <th className="p-3.5">Receipt / Bill</th>
                  <th className="p-3.5">Marka (मार्का)</th>
                  <th className="p-3.5">Container</th>
                  <th className="p-3.5">Packaging (Cartons)</th>
                  <th className="p-3.5 text-center">Unit</th>
                  <th className="p-3.5 text-right">Pcs</th>
                  <th className="p-3.5 text-right">KG</th>
                  <th className="p-3.5 text-right">Taxable (₹)</th>
                  <th className="p-3.5 text-center">गाड़ी नंबर (Vehicle)</th>
                  <th className="p-3.5 text-center">Delivery / Dispatch Info</th>
                  <th className="p-3.5 text-center">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-slate-500">
                      <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <p>Loading cargo dispatch records...</p>
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-slate-500">
                      No matching cargo bills found for the selected container and filters.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => {
                    const isSelected = selectedBillIds.has(b._id);
                    return (
                      <tr
                        key={b._id}
                        onClick={() => toggleSelectBill(b._id)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectBill(b._id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                          />
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-white">{b.receipt}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{b.billNumber}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-cyan-300">
                            {b.mainMarka || b.subMarka || '—'}
                          </span>
                          {b.party && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{b.party}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-300 font-medium">{b.container || '—'}</td>
                        <td className="p-3.5 text-purple-300 font-semibold">
                          {b.dispatchedCartons ? (
                            <span>
                              {b.dispatchedCartons} / {b.totalCartons || b.dispatchedCartons} CTN
                            </span>
                          ) : (
                            <span>{b.totalCartons || 0} CTN</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {b.billingUnit || 'Pcs'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right text-purple-200 font-semibold">
                          {Number(b.quantityPcs || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3.5 text-right text-cyan-300 font-semibold">
                          {Number(b.quantityKg || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3.5 text-right text-emerald-400 font-semibold">
                          ₹{Number(b.taxableValue || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3.5 text-center">
                          {b.vehicleNumber ? (
                            <span className="px-2.5 py-1 bg-emerald-950 border border-emerald-700 text-emerald-300 rounded-lg font-black text-xs">
                              {b.vehicleNumber}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-950/40 border border-amber-800/40 text-amber-400 rounded text-[10px]">
                              Pending Vehicle
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          {b.isDispatched ? (
                            <div>
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-black">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>दिस माल इस डिस्पैच्ड</span>
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {b.deliveryDate} {b.deliveryTime || ''}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-bold">
                              <Clock className="w-3 h-3" />
                              <span>Ready for Dispatch</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleRegeneratePDF(b)}
                            title="Regenerate & Download PDF with Vehicle No."
                            className="p-1.5 bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-300 rounded-lg transition"
                          >
                            <Download className="w-3.5 h-3.5" />
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
      </main>

      {/* ADD / EDIT DELIVERY ADDRESS MODAL */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <MapPin className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                  {selectedMarka !== 'all' && (
                    <span className="ml-2 text-cyan-400 font-normal">({selectedMarka})</span>
                  )}
                </h3>
              </div>
              <button
                onClick={() => setShowAddressModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold uppercase text-[10px]">
                  Address Title / Godown Name *
                </label>
                <input
                  type="text"
                  required
                  value={addressForm.title}
                  onChange={(e) => setAddressForm({ ...addressForm, title: e.target.value })}
                  placeholder="e.g. Main Godown / Branch 2 / Store 5"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold uppercase text-[10px]">Full Address *</label>
                <textarea
                  rows={2}
                  required
                  value={addressForm.address}
                  onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                  placeholder="e.g. Plot No 42, Gali No 3, Mayapuri Industrial Area Phase 2"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold uppercase text-[10px]">City</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    placeholder="Delhi"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold uppercase text-[10px]">State</label>
                  <input
                    type="text"
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    placeholder="Delhi"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold uppercase text-[10px]">Pincode</label>
                  <input
                    type="text"
                    value={addressForm.pincode}
                    onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                    placeholder="110064"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold uppercase text-[10px]">Phone Number</label>
                  <input
                    type="text"
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold uppercase text-[10px]">Contact Person</label>
                <input
                  type="text"
                  value={addressForm.contactPerson}
                  onChange={(e) => setAddressForm({ ...addressForm, contactPerson: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                  className="rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-slate-300 text-[11px] font-semibold">
                  Set as default delivery address for this Marka
                </span>
              </label>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAddress}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSavingAddress ? (
                    <span>Saving...</span>
                  ) : (
                    <span>{editingAddressId ? 'Update Address' : 'Save Address'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
