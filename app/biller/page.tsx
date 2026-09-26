'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  FileText,
  Trash2,
  RefreshCw,
  LogOut,
  Layers,
  Box,
  Truck,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Building2,
  UserCheck,
  Plus,
  Ship,
  HelpCircle,
  MapPin,
  Edit3,
  Phone,
  Mail,
  Save,
  ListPlus,
  CheckSquare,
  Square,
  AlertTriangle,
  Scale,
  Calculator,
} from 'lucide-react';
import { generateBillPDF } from '@/lib/billPdf';
import { INDIAN_STATES, getStateCode, getStateName, getStateCodeByName, getStateByGstinOrCode, detectStateFromAddress } from '@/lib/states';
import { inferHsnByItemName, findHsnSuggestions, MASTER_HSN_CATALOG } from '@/lib/hsnCatalog';

export interface FormLineItem {
  itemNo: number;
  description: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface MarkaCargoItem {
  marka?: string;
  description: string;
  hsnCode?: string;
  cartons: number;
  weightKg: number;
  pcs: number;
  receipt?: string;
}

interface SellerItem {
  _id: string;
  name: string;
  gstin?: string;
  pan?: string;
  address: string;
  city?: string;
  state: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  isDefault: boolean;
}

interface BillItem {
  _id: string;
  billNumber: string;
  receipt: string;
  hsnCode: string;
  igst: number;
  quantityPcs: number;
  quantityKg: number;
  totalCartons?: number;
  dispatchedCartons?: number;
  remainingCartons?: number;
  billingUnit?: 'Pcs' | 'KG' | 'Cartons';
  taxableValue: number;
  igstAmount: number;
  totalAmount: number;
  container?: string;
  containerNumber?: string;
  party?: string;
  mainMarka?: string;
  subMarka?: string;
  commodity?: string;
  warehouse?: string;

  sellerId?: string;
  sellerName?: string;
  sellerGstin?: string;
  sellerAddress?: string;
  sellerCity?: string;
  sellerPincode?: string;
  sellerState?: string;
  sellerStateCode?: string;
  sellerPhone?: string;
  sellerEmail?: string;

  purchaserName?: string;
  purchaserRegistrationType?: 'Registered' | 'Unregistered';
  purchaserGstin?: string;
  purchaserAddress?: string;
  purchaserState?: string;
  purchaserStateCode?: string;

  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeState?: string;
  consigneeStateCode?: string;

  buyerName?: string;
  buyerAddress?: string;
  buyerGstin?: string;
  buyerState?: string;
  buyerStateCode?: string;

  rate?: number;

  items?: any[];
  eWayBillNo?: string;
  destination?: string;
  deliveryAddressTitle?: string;

  vehicleNumber?: string;
  isDispatched: boolean;
  dispatchStatus: string;
  deliveryDate?: string;
  deliveryTime?: string;
  createdAt: string;
}

const COMMON_COMMODITIES = [
  { name: 'TEETHER & PACIFIER', hsn: '39269099' },
  { name: 'NAIL GROOMING SET', hsn: '82141090' },
  { name: 'SILICONE BIBS', hsn: '39269099' },
  { name: 'MUSLIM BIBS', hsn: '62092090' },
  { name: 'BABY FEEDING BOTTLE', hsn: '39269099' },
  { name: 'BABY WIPES', hsn: '33079090' },
  { name: 'PLASTIC TOYS', hsn: '95030030' },
  { name: 'BABY STROLLER', hsn: '87150000' },
  { name: 'COMMERCIAL GOODS', hsn: '9997' },
];

export default function BillerPortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel');

  // Bills list state
  const [bills, setBills] = useState<BillItem[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'dispatched'>('all');

  // Container-Wise Download for Billing
  const [containersList, setContainersList] = useState<any[]>([]);
  const [selectedDownloadContainer, setSelectedDownloadContainer] = useState<string>('');
  const [isDownloadingContainer, setIsDownloadingContainer] = useState(false);

  // Seller Parties State
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [editingSellerId, setEditingSellerId] = useState<string | null>(null);
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerGstin, setNewSellerGstin] = useState('');
  const [newSellerAddress, setNewSellerAddress] = useState('');
  const [newSellerCity, setNewSellerCity] = useState('');
  const [newSellerPincode, setNewSellerPincode] = useState('');
  const [newSellerState, setNewSellerState] = useState('Delhi');
  const [newSellerStateCode, setNewSellerStateCode] = useState('07');
  const [newSellerPhone, setNewSellerPhone] = useState('');
  const [newSellerEmail, setNewSellerEmail] = useState('');
  const [isSavingSeller, setIsSavingSeller] = useState(false);

  // Marka Directory State
  const [showMarkaModal, setShowMarkaModal] = useState(false);
  const [markaList, setMarkaList] = useState<any[]>([]);
  const [isLoadingMarkas, setIsLoadingMarkas] = useState(false);
  const [markaSearchTerm, setMarkaSearchTerm] = useState('');
  const [selectedMarkaToEdit, setSelectedMarkaToEdit] = useState<any | null>(null);

  const [dirMarkaName, setDirMarkaName] = useState('');
  const [dirPurchaserName, setDirPurchaserName] = useState('');
  const [dirRegistrationType, setDirRegistrationType] = useState<'Registered' | 'Unregistered'>('Registered');
  const [dirGstin, setDirGstin] = useState('');
  const [dirConsigneeAddress, setDirConsigneeAddress] = useState('');
  const [dirState, setDirState] = useState('Uttar Pradesh');
  const [dirStateCode, setDirStateCode] = useState('09');
  const [dirPhone, setDirPhone] = useState('');
  const [dirEmail, setDirEmail] = useState('');
  const [dirBuyerName, setDirBuyerName] = useState('');
  const [dirBuyerAddress, setDirBuyerAddress] = useState('');
  const [dirBuyerGstin, setDirBuyerGstin] = useState('');
  const [dirBuyerState, setDirBuyerState] = useState('Uttar Pradesh');
  const [dirBuyerStateCode, setDirBuyerStateCode] = useState('09');
  const [dirSameAsConsignee, setDirSameAsConsignee] = useState(true);
  const [isSavingDirMarka, setIsSavingDirMarka] = useState(false);

  // Manual Form State
  const [receiptNo, setReceiptNo] = useState('');
  const [hsnCode, setHsnCode] = useState('9997');
  const [igstRate, setIgstRate] = useState<number>(18);
  const [billingUnit, setBillingUnit] = useState<'Pcs' | 'KG' | 'Cartons'>('KG');
  const [totalCartons, setTotalCartons] = useState<string>('');
  const [quantityPcs, setQuantityPcs] = useState<string>('');
  const [quantityKg, setQuantityKg] = useState<string>('');
  const [taxableValue, setTaxableValue] = useState<string>('');
  const [itemRate, setItemRate] = useState<string>('');
  const [partyName, setPartyName] = useState('');
  const [mainMarka, setMainMarka] = useState('');
  const [subMarka, setSubMarka] = useState('');
  const [containerAlias, setContainerAlias] = useState('');
  const [commodity, setCommodity] = useState('');

  // Purchaser / Consignee & Buyer Details State (Manual Form)
  const [purchaserName, setPurchaserName] = useState('');
  const [registrationType, setRegistrationType] = useState<'Registered' | 'Unregistered'>('Registered');
  const [purchaserGstin, setPurchaserGstin] = useState('');
  const [purchaserAddress, setPurchaserAddress] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneeState, setConsigneeState] = useState('Delhi');
  const [consigneeStateCode, setConsigneeStateCode] = useState('07');
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerGstin, setBuyerGstin] = useState('');
  const [buyerState, setBuyerState] = useState('Delhi');
  const [buyerStateCode, setBuyerStateCode] = useState('07');
  const [sameAsConsignee, setSameAsConsignee] = useState(true);
  const [purchaserPhone, setPurchaserPhone] = useState('');
  const [isSavingMarkaDirect, setIsSavingMarkaDirect] = useState(false);
  const [markaSaveSuccess, setMarkaSaveSuccess] = useState<string | null>(null);

  // Edit Specific Marka Address Modal state
  const [showEditLocationModal, setShowEditLocationModal] = useState(false);
  const [editingLocationData, setEditingLocationData] = useState<{
    marka: string;
    addressId: string;
    title: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    pincode: string;
    contactPerson: string;
    phone: string;
  } | null>(null);
  const [isDeletingLocationId, setIsDeletingLocationId] = useState<string | null>(null);

  // Multi-Item Invoice Builder State
  const [invoiceItems, setInvoiceItems] = useState<FormLineItem[]>([]);
  const [lineDescription, setLineDescription] = useState('');
  const [lineHsn, setLineHsn] = useState('39269099');
  const [lineQuantity, setLineQuantity] = useState('');
  const [lineUnit, setLineUnit] = useState('PCS');
  const [lineRate, setLineRate] = useState('');

  // Marka Auto-Loaded Cargo Items & Base Quantities
  const [markaCargoItems, setMarkaCargoItems] = useState<MarkaCargoItem[]>([]);
  const [selectedCargoDropdown, setSelectedCargoDropdown] = useState<string>('');
  const [currentBasePcs, setCurrentBasePcs] = useState<number>(0);
  const [currentBaseKg, setCurrentBaseKg] = useState<number>(0);
  const [currentBaseCtn, setCurrentBaseCtn] = useState<number>(0);

  // Item Proportionate (Optional Calculation Mode)
  const [isProportionateEnabled, setIsProportionateEnabled] = useState<boolean>(false);
  const [propBaseCartons, setPropBaseCartons] = useState<string>('');
  const [propBaseWeightKg, setPropBaseWeightKg] = useState<string>('');
  const [propBasePcs, setPropBasePcs] = useState<string>('');
  const [propBasis, setPropBasis] = useState<'cartons' | 'weight' | 'pcs'>('cartons');
  const [propInputValue, setPropInputValue] = useState<string>('');

  // Vehicle Number & Delivery details in manual form
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formEWayBillNo, setFormEWayBillNo] = useState('');

  // Marka Multiple Addresses (Sending / Dispatch Locations)
  const [currentMarkaAddresses, setCurrentMarkaAddresses] = useState<any[]>([]);
  const [selectedDeliveryAddressId, setSelectedDeliveryAddressId] = useState<string>('');
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocTitle, setNewLocTitle] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocCity, setNewLocCity] = useState('');
  const [newLocState, setNewLocState] = useState('Delhi');
  const [newLocStateCode, setNewLocStateCode] = useState('07');
  const [newLocPincode, setNewLocPincode] = useState('');
  const [newLocContactPerson, setNewLocContactPerson] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');
  const [newLocRegType, setNewLocRegType] = useState<'Registered' | 'Unregistered'>('Registered');
  const [newLocGstin, setNewLocGstin] = useState('');
  const [isSavingNewLoc, setIsSavingNewLoc] = useState(false);

  // Quick Vehicle Number Update Modal (Bills Table)
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [targetBillForVehicle, setTargetBillForVehicle] = useState<BillItem | null>(null);
  const [quickVehicleInput, setQuickVehicleInput] = useState('');
  const [quickDestInput, setQuickDestInput] = useState('');
  const [isSavingQuickVehicle, setIsSavingQuickVehicle] = useState(false);

  // Batch Selection & Bulk Vehicle Number Update
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [bulkVehicleInput, setBulkVehicleInput] = useState('');
  const [isBulkUpdatingVehicle, setIsBulkUpdatingVehicle] = useState(false);

  // Single Entry Cascade Selector State
  const [singleContainer, setSingleContainer] = useState<string>('');
  const [singleAvailableMarkas, setSingleAvailableMarkas] = useState<any[]>([]);
  const [singleSelectedMarka, setSingleSelectedMarka] = useState<string>('');
  const [selectedMarkas, setSelectedMarkas] = useState<string[]>([]);
  const [singleAvailableReceipts, setSingleAvailableReceipts] = useState<any[]>([]);
  const [singleSelectedReceipt, setSingleSelectedReceipt] = useState<string>('');
  const [globalMarkasList, setGlobalMarkasList] = useState<string[]>([]);
  const [isLoadingCascade, setIsLoadingCascade] = useState(false);

  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);

  // HSN Search & Suggestion Modal State
  const [showHsnSearchModal, setShowHsnSearchModal] = useState(false);
  const [hsnSearchQuery, setHsnSearchQuery] = useState('');
  const [hsnSearchResults, setHsnSearchResults] = useState<any[]>([]);
  const [isLoadingHsn, setIsLoadingHsn] = useState(false);
  const [targetHsnSetter, setTargetHsnSetter] = useState<((hsn: string, itemName?: string) => void) | null>(null);

  // Edit Bill Modal State
  const [editBillModalOpen, setEditBillModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<BillItem | null>(null);
  const [editBillData, setEditBillData] = useState<any>({
    billNumber: '',
    receipt: '',
    purchaserName: '',
    purchaserRegistrationType: 'Registered' as 'Registered' | 'Unregistered',
    purchaserGstin: '',
    consigneeAddress: '',
    consigneeState: 'Delhi',
    consigneeStateCode: '07',
    sameAsConsignee: true,
    buyerName: '',
    buyerGstin: '',
    buyerAddress: '',
    buyerState: 'Delhi',
    buyerStateCode: '07',
    vehicleNumber: '',
    destination: '',
    eWayBillNo: '',
    billingUnit: 'PCS',
    rate: 0,
    items: [] as FormLineItem[],
  });
  const [isSavingEditBill, setIsSavingEditBill] = useState(false);

  // Excel Bulk Upload State
  const [excelRows, setExcelRows] = useState<any[]>([]);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const [bulkStatusMsg, setBulkStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Sellers
  const fetchSellers = async () => {
    try {
      const res = await fetch('/api/sellers');
      if (res.ok) {
        const data = await res.json();
        const sellerList = data.sellers || [];
        setSellers(sellerList);
        if (sellerList.length > 0 && !selectedSellerId) {
          const nordex = sellerList.find((s: SellerItem) => s.name.toUpperCase().includes('NORDEX'));
          const def = nordex || sellerList.find((s: SellerItem) => s.isDefault) || sellerList[0];
          setSelectedSellerId(def._id);
        }
      }
    } catch (err) {
      console.error('Failed to load sellers:', err);
    }
  };

  // Load Containers
  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/billing/container-manifest');
      if (res.ok) {
        const data = await res.json();
        setContainersList(data.containers || []);
        if (data.containers && data.containers.length > 0 && !selectedDownloadContainer) {
          setSelectedDownloadContainer(data.containers[0].container);
        }
      }
    } catch (err) {
      console.error('Failed to load containers:', err);
    }
  };

  // Load Global Markas for cascade
  const fetchCascadeOptions = async () => {
    try {
      const res = await fetch('/api/billing/lookup?options=1');
      if (res.ok) {
        const data = await res.json();
        if (data.markas) {
          setGlobalMarkasList(data.markas);
          setSingleAvailableMarkas(data.markas.map((m: string) => ({ marka: m })));
        }
      }
    } catch (err) {
      console.error('Failed to load cascade options:', err);
    }
  };

  // Active Seller Object
  const currentSeller = useMemo(() => {
    return sellers.find((s) => s._id === selectedSellerId) || sellers[0] || null;
  }, [sellers, selectedSellerId]);

  // Load Bills
  const loadBills = async () => {
    setIsLoadingBills(true);
    try {
      const res = await fetch('/api/billing?limit=250');
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
      }
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      setIsLoadingBills(false);
    }
  };

  useEffect(() => {
    fetchSellers();
    fetchContainers();
    fetchCascadeOptions();
    loadBills();
  }, []);

  // Calculated manual and multi-item values
  const invoiceTaxableTotal = useMemo(() => {
    if (invoiceItems.length > 0) {
      return Number(invoiceItems.reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2));
    }
    const lineAmt = (parseFloat(lineQuantity) || 0) * (parseFloat(lineRate) || 0);
    if (lineAmt > 0) return Number(lineAmt.toFixed(2));
    return parseFloat(taxableValue) || 0;
  }, [invoiceItems, lineQuantity, lineRate, taxableValue]);

  // Destination State Check: Outside Delhi vs Delhi local
  const isDeliveryInDelhi = useMemo(() => {
    const state = (consigneeState || buyerState || '').toLowerCase();
    const code = (consigneeStateCode || buyerStateCode || '').trim();
    return state.includes('delhi') || code === '07';
  }, [consigneeState, buyerState, consigneeStateCode, buyerStateCode]);

  const totalGstRate = useMemo(() => Number(igstRate) || 18, [igstRate]);
  const halfGstRate = useMemo(() => Number((totalGstRate / 2).toFixed(2)), [totalGstRate]);

  const calculatedCgstAmt = useMemo(() => {
    if (!isDeliveryInDelhi) return 0;
    return Number(((invoiceTaxableTotal * halfGstRate) / 100).toFixed(2));
  }, [invoiceTaxableTotal, halfGstRate, isDeliveryInDelhi]);

  const calculatedSgstAmt = useMemo(() => {
    if (!isDeliveryInDelhi) return 0;
    return Number(((invoiceTaxableTotal * halfGstRate) / 100).toFixed(2));
  }, [invoiceTaxableTotal, halfGstRate, isDeliveryInDelhi]);

  const calculatedIgstAmt = useMemo(() => {
    if (isDeliveryInDelhi) return 0;
    return Number(((invoiceTaxableTotal * totalGstRate) / 100).toFixed(2));
  }, [invoiceTaxableTotal, totalGstRate, isDeliveryInDelhi]);

  const calculatedTotalAmt = useMemo(() => {
    if (isDeliveryInDelhi) {
      return Number((invoiceTaxableTotal + calculatedCgstAmt + calculatedSgstAmt).toFixed(2));
    }
    return Number((invoiceTaxableTotal + calculatedIgstAmt).toFixed(2));
  }, [invoiceTaxableTotal, calculatedCgstAmt, calculatedSgstAmt, calculatedIgstAmt, isDeliveryInDelhi]);

  // E-Way Bill Rule:
  // Outside Delhi: > ₹50,000 strictly requires E-Way Bill
  // Intra-Delhi: > ₹1,00,000 strictly requires E-Way Bill
  const eWayBillThreshold = isDeliveryInDelhi ? 100000 : 50000;
  const isEWayBillRequired = calculatedTotalAmt > eWayBillThreshold;
  const isEWayBillMissing = isEWayBillRequired && !formEWayBillNo.trim();

  // Apply shipment object to manual form
  const applyShipmentToForm = (shipment: any, markaAddress?: any) => {
    setReceiptNo(shipment.receipt || '');
    setContainerAlias(shipment.container || singleContainer || '');
    const m = shipment.mainMarka || shipment.subMarka || shipment.marka || '';
    setMainMarka(shipment.mainMarka || shipment.marka || '');
    setSubMarka(shipment.subMarka || '');
    
    const desc = (shipment.commodity || shipment.english || 'COMMERCIAL GOODS').trim();
    setCommodity(desc);
    setLineDescription(desc);
    setLineHsn(shipment.hsnCode || '39269099');

    const ctn = Number(shipment.cartons || shipment.quantity) || 0;
    const kg = Number(shipment.weightKg || shipment.weight) || 0;
    const pcs = ctn > 0 ? ctn * 10 : 0;

    setCurrentBasePcs(pcs);
    setCurrentBaseKg(kg);
    setCurrentBaseCtn(ctn);

    setTotalCartons(ctn ? String(ctn) : '');
    setQuantityKg(kg ? String(kg) : '');
    setQuantityPcs(pcs ? String(pcs) : '');
    setPartyName(shipment.party || '');

    // Auto-fill line quantity based on active unit
    const u = lineUnit.toUpperCase();
    if (u === 'PCS') {
      setLineQuantity(pcs ? String(pcs) : '');
    } else if (u.includes('KG')) {
      setLineQuantity(kg ? String(kg) : '');
    } else if (u.includes('CTN') || u.includes('CARTON')) {
      setLineQuantity(ctn ? String(ctn) : '');
    }

    if (m) {
      fetchMarkaDeliveryLocations(m);
    }

    // Purchaser & Consignee & Buyer details
    if (markaAddress) {
      const pName = markaAddress.purchaserName || shipment.party || '';
      setPurchaserName(pName);
      setRegistrationType(markaAddress.registrationType || 'Registered');
      setPurchaserGstin(markaAddress.gstin || '');
      const addr = markaAddress.addresses && markaAddress.addresses.length > 0 ? markaAddress.addresses[0].address : '';
      setPurchaserAddress(addr);
      const rawCState = markaAddress.state || 'Delhi';
      const cStName = getStateName(rawCState) || 'Delhi';
      const cStCode = getStateCode(markaAddress.stateCode || rawCState) || '07';
      setConsigneeState(cStName);
      setConsigneeStateCode(cStCode);
      setPurchaserPhone(markaAddress.phone || (markaAddress.addresses?.[0]?.phone || ''));

      setBuyerName(markaAddress.buyerName || pName);
      setBuyerAddress(markaAddress.buyerAddress || addr);
      setBuyerGstin(markaAddress.buyerGstin || markaAddress.gstin || '');
      const rawBState = markaAddress.buyerState || rawCState;
      const bStName = getStateName(rawBState) || cStName;
      const bStCode = getStateCode(markaAddress.buyerStateCode || rawBState) || cStCode;
      setBuyerState(bStName);
      setBuyerStateCode(bStCode);
      setSameAsConsignee(!markaAddress.buyerAddress || markaAddress.buyerAddress === addr);
    } else {
      setPurchaserName(shipment.party || '');
      setBuyerName(shipment.party || '');
    }

    setLookupMessage(
      `✓ Cargo Selected: Marka [${m}] | Item [${desc}] | ${ctn} Cartons | ${kg} KG | ${pcs} PCS`
    );
  };

  // Unit Selection Handler: Auto-fills quantity and keeps it alterable/editable
  const handleSelectUnit = (unit: string) => {
    setLineUnit(unit);
    const u = unit.toUpperCase();
    if (u === 'PCS') {
      setLineQuantity(currentBasePcs > 0 ? String(currentBasePcs) : lineQuantity);
    } else if (u.includes('KG')) {
      setLineQuantity(currentBaseKg > 0 ? String(currentBaseKg) : lineQuantity);
    } else if (u.includes('CTN') || u.includes('CARTON')) {
      setLineQuantity(currentBaseCtn > 0 ? String(currentBaseCtn) : lineQuantity);
    }
  };

  // HSN Search & Suggestion Handlers
  const handleSearchHsn = async (q: string) => {
    setHsnSearchQuery(q);
    setIsLoadingHsn(true);
    try {
      const res = await fetch(`/api/hsn?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setHsnSearchResults(data.suggestions || []);
      }
    } catch (err) {
      console.error('HSN search error:', err);
    } finally {
      setIsLoadingHsn(false);
    }
  };

  const openHsnModal = (initialQuery: string, onSelect: (hsn: string, itemName?: string) => void) => {
    const q = initialQuery.trim();
    setHsnSearchQuery(q);
    setTargetHsnSetter(() => onSelect);
    setShowHsnSearchModal(true);
    handleSearchHsn(q);
  };

  const handleSelectHsnSuggestion = async (s: any) => {
    if (targetHsnSetter) {
      targetHsnSetter(s.hsnCode, s.itemName);
    }

    const itemToLink = lineDescription || hsnSearchQuery || s.itemName;
    if (itemToLink && s.hsnCode) {
      try {
        await fetch('/api/hsn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: itemToLink,
            hsnCode: s.hsnCode,
            description: s.description || s.itemName,
            gstRate: s.gstRate || 18,
            category: s.category || 'General Cargo',
          }),
        });
      } catch (err) {
        console.warn('Auto linking failed non-critically:', err);
      }
    }

    setShowHsnSearchModal(false);
  };

  // Item Selection Handler: Auto-fills name, HSN and quantities, while keeping name and HSN editable
  const handleChooseCargoItem = async (itemDesc: string, customHsn?: string) => {
    setSelectedCargoDropdown(itemDesc);
    setLineDescription(itemDesc);
    setCommodity(itemDesc);
    if (customHsn) {
      setLineHsn(customHsn);
      setHsnCode(customHsn);
    } else if (itemDesc.trim()) {
      // Auto-fetch HSN based on nature of item or previously saved mappings!
      try {
        const res = await fetch(`/api/hsn?q=${encodeURIComponent(itemDesc.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions && data.suggestions.length > 0) {
            const best = data.suggestions[0];
            setLineHsn(best.hsnCode);
            setHsnCode(best.hsnCode);
          } else {
            const inferred = inferHsnByItemName(itemDesc);
            if (inferred) {
              setLineHsn(inferred.hsnCode);
              setHsnCode(inferred.hsnCode);
            }
          }
        }
      } catch (err) {
        const inferred = inferHsnByItemName(itemDesc);
        if (inferred) {
          setLineHsn(inferred.hsnCode);
          setHsnCode(inferred.hsnCode);
        }
      }
    }

    const found = markaCargoItems.find(
      (it) => it.description.trim().toLowerCase() === itemDesc.trim().toLowerCase()
    );
    if (found) {
      setCurrentBasePcs(found.pcs);
      setCurrentBaseKg(found.weightKg);
      setCurrentBaseCtn(found.cartons);
      if (found.receipt) {
        setReceiptNo(found.receipt);
        setSingleSelectedReceipt(found.receipt);
      }
      const u = lineUnit.toUpperCase();
      if (u === 'PCS') {
        setLineQuantity(found.pcs ? String(found.pcs) : '');
      } else if (u.includes('KG')) {
        setLineQuantity(found.weightKg ? String(found.weightKg) : '');
      } else if (u.includes('CTN') || u.includes('CARTON')) {
        setLineQuantity(found.cartons ? String(found.cartons) : '');
      }
    }
  };

  // Handle Container change in Single Entry
  const handleSingleContainerChange = async (cont: string) => {
    setSingleContainer(cont);
    setSingleSelectedMarka('');
    setSingleSelectedReceipt('');
    setSingleAvailableReceipts([]);
    setContainerAlias(cont);
    setLookupMessage(null);

    if (!cont.trim() || cont === 'all') {
      setSingleAvailableMarkas(globalMarkasList.map((m) => ({ marka: m })));
      return;
    }

    setIsLoadingCascade(true);
    try {
      const res = await fetch(`/api/billing/lookup?container=${encodeURIComponent(cont.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.container) setContainerAlias(data.container);
        setSingleAvailableMarkas(data.markas || []);
      }
    } catch (err) {
      console.error('Cascade error:', err);
    } finally {
      setIsLoadingCascade(false);
    }
  };

  // Handle Marka change in Single Entry
  const handleSingleMarkaChange = async (m: string) => {
    setSingleSelectedMarka(m);
    setSingleSelectedReceipt('');
    setSingleAvailableReceipts([]);
    setLookupMessage(null);
    setMarkaCargoItems([]);

    if (!m.trim()) {
      setCurrentMarkaAddresses([]);
      setSelectedDeliveryAddressId('');
      return;
    }

    setMainMarka(m.trim());
    fetchMarkaDeliveryLocations(m.trim());

    setIsLoadingCascade(true);
    try {
      const queryParams = new URLSearchParams();
      if (singleContainer && singleContainer !== 'all') {
        queryParams.set('container', singleContainer);
      }
      queryParams.set('marka', m.trim());

      const res = await fetch(`/api/billing/lookup?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const shipments = data.shipments || [];
        setSingleAvailableReceipts(shipments);

        // Extract all cargo items for this Marka
        const extractedItems: MarkaCargoItem[] = shipments.map((s: any) => {
          const d = (s.commodity || s.english || 'COMMERCIAL GOODS').trim();
          const c = Number(s.cartons || s.quantity) || 0;
          const k = Number(s.weightKg || s.weight) || 0;
          const p = c > 0 ? c * 10 : 0;
          return {
            description: d,
            hsnCode: '39269099',
            cartons: c,
            weightKg: k,
            pcs: p,
            receipt: s.receipt,
          };
        });
        setMarkaCargoItems(extractedItems);

        // Apply Marka delivery address
        if (data.markaAddress) {
          applyShipmentToForm(shipments[0] || { mainMarka: m }, data.markaAddress);
        } else if (shipments.length > 0) {
          applyShipmentToForm(shipments[0]);
        }

        // Auto-select first item and auto-fill quantities
        if (extractedItems.length > 0) {
          const first = extractedItems[0];
          setSelectedCargoDropdown(first.description);
          setLineDescription(first.description);
          setCommodity(first.description);
          setLineHsn(first.hsnCode || '39269099');
          setHsnCode(first.hsnCode || '39269099');
          setCurrentBasePcs(first.pcs);
          setCurrentBaseKg(first.weightKg);
          setCurrentBaseCtn(first.cartons);

          // Auto-fill quantity according to active unit
          const u = lineUnit.toUpperCase();
          if (u === 'PCS') {
            setLineQuantity(first.pcs ? String(first.pcs) : '');
          } else if (u.includes('KG')) {
            setLineQuantity(first.weightKg ? String(first.weightKg) : '');
          } else if (u.includes('CTN') || u.includes('CARTON')) {
            setLineQuantity(first.cartons ? String(first.cartons) : '');
          }

          if (first.receipt) {
            setReceiptNo(first.receipt);
            setSingleSelectedReceipt(first.receipt);
          }

          setLookupMessage(
            `✓ Marka [${m}] चुनी गई: आइटम [${first.description}] और क्वांटिटी (${first.pcs} PCS / ${first.weightKg} KG) ऑटो-लोड हो गई है।`
          );
        } else {
          setLookupMessage(`Marka [${m}] के लिए कार्गो शिपमेंट मिला।`);
        }
      }
    } catch (err) {
      console.error('Marka cascade error:', err);
    } finally {
      setIsLoadingCascade(false);
    }
  };

  // Toggle Marka for Multi-Marka Billing (Allows selecting multiple markas to make a consolidated bill)
  const handleToggleMarka = async (mName: string) => {
    const clean = mName.trim();
    if (!clean) return;

    let nextList: string[];
    if (selectedMarkas.includes(clean)) {
      nextList = selectedMarkas.filter((m) => m !== clean);
    } else {
      nextList = [...selectedMarkas, clean];
    }
    setSelectedMarkas(nextList);

    if (nextList.length === 0) {
      setSingleSelectedMarka('');
      setMainMarka('');
      setMarkaCargoItems([]);
      setSingleAvailableReceipts([]);
      setCurrentMarkaAddresses([]);
      setSelectedDeliveryAddressId('');
      setLookupMessage('कोई मार्का सेलेक्ट नहीं है।');
      return;
    }

    const primaryMarka = nextList[0];
    setSingleSelectedMarka(nextList[nextList.length - 1]);
    setMainMarka(nextList.join(', '));
    fetchMarkaDeliveryLocations(primaryMarka);

    setIsLoadingCascade(true);
    try {
      const promises = nextList.map(async (m) => {
        const queryParams = new URLSearchParams();
        if (singleContainer && singleContainer !== 'all') {
          queryParams.set('container', singleContainer);
        }
        queryParams.set('marka', m);
        const res = await fetch(`/api/billing/lookup?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          return { marka: m, shipments: data.shipments || [], markaAddress: data.markaAddress };
        }
        return { marka: m, shipments: [], markaAddress: null };
      });

      const results = await Promise.all(promises);
      const combinedShipments: any[] = [];
      const combinedItems: MarkaCargoItem[] = [];

      results.forEach((r) => {
        r.shipments.forEach((s: any) => {
          combinedShipments.push(s);
          const d = (s.commodity || s.english || 'COMMERCIAL GOODS').trim();
          const c = Number(s.cartons || s.quantity) || 0;
          const k = Number(s.weightKg || s.weight) || 0;
          const p = c > 0 ? c * 10 : 0;
          combinedItems.push({
            marka: r.marka,
            description: nextList.length > 1 ? `[${r.marka}] ${d}` : d,
            hsnCode: s.hsnCode || '39269099',
            cartons: c,
            weightKg: k,
            pcs: p,
            receipt: s.receipt,
          });
        });
      });

      setSingleAvailableReceipts(combinedShipments);
      setMarkaCargoItems(combinedItems);

      // Apply address from first result that has one
      const foundAddrResult = results.find((r) => r.markaAddress);
      if (foundAddrResult?.markaAddress) {
        applyShipmentToForm(foundAddrResult.shipments[0] || { mainMarka: nextList.join(', ') }, foundAddrResult.markaAddress);
      } else if (combinedShipments.length > 0) {
        applyShipmentToForm(combinedShipments[0]);
      }

      if (combinedItems.length > 0) {
        const first = combinedItems[0];
        setSelectedCargoDropdown(first.description);
        setLineDescription(first.description);
        setCommodity(first.description);
        setLineHsn(first.hsnCode || '39269099');
        setHsnCode(first.hsnCode || '39269099');
        setCurrentBasePcs(first.pcs);
        setCurrentBaseKg(first.weightKg);
        setCurrentBaseCtn(first.cartons);
        const u = lineUnit.toUpperCase();
        if (u === 'PCS') setLineQuantity(first.pcs ? String(first.pcs) : '');
        else if (u.includes('KG')) setLineQuantity(first.weightKg ? String(first.weightKg) : '');
        else if (u.includes('CTN') || u.includes('CARTON')) setLineQuantity(first.cartons ? String(first.cartons) : '');
        if (first.receipt) {
          setReceiptNo(first.receipt);
          setSingleSelectedReceipt(first.receipt);
        }
      }

      setLookupMessage(
        `✓ ${nextList.length} मार्का सेलेक्ट किए गए [${nextList.join(', ')}] | कुल ${combinedItems.length} कार्गो आइटम लोड हुए।`
      );
    } catch (err) {
      console.error('Multi-marka error:', err);
    } finally {
      setIsLoadingCascade(false);
    }
  };

  // State & GSTIN Change Handlers for Consignee and Buyer
  const handleConsigneeStateChange = (st: string) => {
    const name = getStateName(st) || st;
    const code = getStateCode(st) || getStateCode(name) || '07';
    setConsigneeState(name);
    setConsigneeStateCode(code);
    if (sameAsConsignee) {
      setBuyerState(name);
      setBuyerStateCode(code);
    }
  };

  const handleConsigneeStateCodeChange = (cd: string) => {
    const clean = cd.trim();
    setConsigneeStateCode(clean);
    const name = getStateName(clean);
    if (name && name !== clean) {
      setConsigneeState(name);
      if (sameAsConsignee) {
        setBuyerState(name);
        setBuyerStateCode(clean);
      }
    }
  };

  const handleConsigneeGstinChange = (gst: string) => {
    const upper = gst.toUpperCase();
    setPurchaserGstin(upper);
    if (upper.length >= 2) {
      const stObj = getStateByGstinOrCode(upper);
      if (stObj) {
        setConsigneeState(stObj.name);
        setConsigneeStateCode(stObj.code);
        if (sameAsConsignee) {
          setBuyerState(stObj.name);
          setBuyerStateCode(stObj.code);
        }
      }
    }
  };

  const handleBuyerStateChange = (st: string) => {
    const name = getStateName(st) || st;
    const code = getStateCode(st) || getStateCode(name) || '07';
    setBuyerState(name);
    setBuyerStateCode(code);
  };

  const handleBuyerStateCodeChange = (cd: string) => {
    const clean = cd.trim();
    setBuyerStateCode(clean);
    const name = getStateName(clean);
    if (name && name !== clean) {
      setBuyerState(name);
    }
  };

  const handleBuyerGstinChange = (gst: string) => {
    const upper = gst.toUpperCase();
    setBuyerGstin(upper);
    if (upper.length >= 2) {
      const stObj = getStateByGstinOrCode(upper);
      if (stObj) {
        setBuyerState(stObj.name);
        setBuyerStateCode(stObj.code);
      }
    }
  };

  // Item Proportionate Calculation Logic
  const calculateProportionate = () => {
    const baseCtn = parseFloat(propBaseCartons) || currentBaseCtn || parseFloat(totalCartons) || 0;
    const baseKg = parseFloat(propBaseWeightKg) || currentBaseKg || parseFloat(quantityKg) || 0;
    const basePcs = parseFloat(propBasePcs) || currentBasePcs || parseFloat(quantityPcs) || 0;

    const inputNum = parseFloat(propInputValue) || 0;
    if (inputNum <= 0) {
      return { ratio: 0, ctn: 0, kg: 0, pcs: 0, targetQty: 0, baseCtn, baseKg, basePcs };
    }

    let ratio = 0;
    if (propBasis === 'cartons') {
      ratio = baseCtn > 0 ? inputNum / baseCtn : 0;
    } else if (propBasis === 'weight') {
      ratio = baseKg > 0 ? inputNum / baseKg : 0;
    } else if (propBasis === 'pcs') {
      ratio = basePcs > 0 ? inputNum / basePcs : 0;
    }

    const calcCtn = propBasis === 'cartons' ? inputNum : Number((ratio * baseCtn).toFixed(2));
    const calcKg = propBasis === 'weight' ? inputNum : Number((ratio * baseKg).toFixed(2));
    const calcPcs = propBasis === 'pcs' ? Math.round(inputNum) : Math.round(ratio * basePcs);

    // Target Quantity for current active lineUnit
    const u = lineUnit.toUpperCase();
    let targetQty = 0;
    if (u === 'PCS') {
      targetQty = calcPcs > 0 ? calcPcs : calcKg;
    } else if (u.includes('KG')) {
      targetQty = calcKg > 0 ? calcKg : calcPcs;
    } else if (u.includes('CTN') || u.includes('CARTON')) {
      targetQty = calcCtn;
    } else {
      targetQty = calcPcs || calcKg || calcCtn;
    }

    return {
      ratio,
      ctn: calcCtn,
      kg: calcKg,
      pcs: calcPcs,
      targetQty,
      baseCtn,
      baseKg,
      basePcs,
    };
  };

  const handleApplyProportionate = () => {
    const res = calculateProportionate();
    if (res.targetQty <= 0) {
      alert('कृपया मान्य डिस्पैच संख्या दर्ज करें ताकि प्रोपोर्शनेट मान निकाला जा सके।');
      return;
    }

    setLineQuantity(String(res.targetQty));
    if (res.ctn > 0) setTotalCartons(String(res.ctn));
    if (res.kg > 0) setQuantityKg(String(res.kg));
    if (res.pcs > 0) setQuantityPcs(String(res.pcs));

    setManualSuccessMsg(
      `✓ प्रोपोर्शनेट वैल्यू लागू हो गई: ${res.ctn} कार्टन | ${res.kg} KG | ${res.pcs} PCS -> इनवॉइस क्वांटिटी: ${res.targetQty} ${lineUnit}`
    );
    setTimeout(() => setManualSuccessMsg(null), 4500);
  };



  // Per-vehicle cumulative value check on the same date
  const checkVehicleCumulativeLimit = (
    vehicleNo: string,
    newBillAmount: number,
    isDelhi: boolean,
    currentEWayBill: string,
    targetBillDate?: string
  ): { requiresConfirm: boolean; message?: string } => {
    const cleanVeh = vehicleNo.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanVeh) return { requiresConfirm: false };

    // If E-Way bill number is provided, statutory rule is complied with
    if (currentEWayBill.trim()) return { requiresConfirm: false };

    const threshold = isDelhi ? 100000 : 50000;

    // Check same date ("या बिल का डेट अलग हो तो ये वॉर्निंग न दिखाए")
    const todayDateStr = targetBillDate || new Date().toISOString().split('T')[0];

    const matchingBillsOnSameDate = bills.filter((b) => {
      if (!b.vehicleNumber) return false;
      const bVeh = b.vehicleNumber.trim().toUpperCase().replace(/\s+/g, '');
      if (bVeh !== cleanVeh) return false;

      // Extract date string YYYY-MM-DD
      const bDate = b.createdAt ? new Date(b.createdAt).toISOString().split('T')[0] : '';
      return bDate === todayDateStr;
    });

    const existingVehicleTotal = matchingBillsOnSameDate.reduce(
      (sum, b) => sum + (Number(b.totalAmount) || 0),
      0
    );
    const cumulativeTotal = existingVehicleTotal + newBillAmount;

    if (cumulativeTotal > threshold) {
      const msg =
        `⚠️ गाड़ी दैनिक लिमिट चेतावनी (Vehicle Cumulative Limit Warning):\n\n` +
        `गाड़ी नंबर: ${vehicleNo.trim().toUpperCase()}\n` +
        `दिनांक (Date): ${todayDateStr}\n` +
        `इस गाड़ी में आज पहले से अलॉट बिल: ${matchingBillsOnSameDate.length} बिल (कुल राशि: ₹${existingVehicleTotal.toLocaleString('en-IN')})\n` +
        `वर्तमान बिल राशि: ₹${newBillAmount.toLocaleString('en-IN')}\n` +
        `गाड़ी में कुल संचयी माल (Cumulative Total): ₹${cumulativeTotal.toLocaleString('en-IN')}\n\n` +
        `यह राशि बिना E-Way Bill की निर्धारित सीमा (₹${threshold.toLocaleString('en-IN')} - ${isDelhi ? 'Intra-Delhi' : 'Inter-State'}) से अधिक है!\n\n` +
        `क्या आप वाकई इस गाड़ी में बिना E-Way Bill के यह बिल प्रोसेस करना चाहते हैं?\n` +
        `'OK' दबाकर पुष्टि (Confirm) करें, अथवा 'Cancel' करके पहले E-Way Bill No. दर्ज करें।`;
      return { requiresConfirm: true, message: msg };
    }

    return { requiresConfirm: false };
  };

  // Handle Receipt select in Single Entry
  const handleSingleReceiptSelect = async (rNo: string) => {
    setSingleSelectedReceipt(rNo);
    if (!rNo.trim()) return;
    await handleReceiptLookup(rNo);
  };

  // Reset cascade
  const handleResetCascade = () => {
    setSingleContainer('');
    setSingleSelectedMarka('');
    setSelectedMarkas([]);
    setSingleSelectedReceipt('');
    setSingleAvailableReceipts([]);
    setSingleAvailableMarkas(globalMarkasList.map((m) => ({ marka: m })));
    setReceiptNo('');
    setTotalCartons('');
    setQuantityPcs('');
    setQuantityKg('');
    setHsnCode('9997');
    setTaxableValue('');
    setItemRate('');
    setPartyName('');
    setMainMarka('');
    setSubMarka('');
    setContainerAlias('');
    setCommodity('');
    setPurchaserName('');
    setPurchaserGstin('');
    setPurchaserAddress('');
    setConsigneeAddress('');
    setConsigneeState('Uttar Pradesh');
    setConsigneeStateCode('09');
    setPurchaserPhone('');
    setBuyerName('');
    setBuyerAddress('');
    setBuyerGstin('');
    setBuyerState('Uttar Pradesh');
    setBuyerStateCode('09');
    setSameAsConsignee(true);
    setLookupMessage(null);

    // Multi-item and Vehicle resets
    setInvoiceItems([]);
    setLineDescription('');
    setLineHsn('9997');
    setLineQuantity('');
    setLineRate('');
    setFormVehicleNumber('');
    setFormDestination('');
    setFormEWayBillNo('');
    setCurrentMarkaAddresses([]);
    setSelectedDeliveryAddressId('');
  };

  // Quick lookup when typing receipt
  const handleReceiptLookup = async (rNo: string) => {
    const clean = rNo.trim();
    if (!clean || clean.length < 3) return;
    setIsLookingUp(true);
    setLookupMessage(null);

    try {
      const res = await fetch(`/api/billing/lookup?receipt=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.autoFill) {
          const af = data.autoFill;
          setContainerAlias(af.container || '');
          setPartyName(af.party || '');
          setMainMarka(af.mainMarka || '');
          setSubMarka(af.subMarka || '');
          setCommodity(af.commodity || '');
          if (af.totalCartons || data.shipment?.quantity) {
            setTotalCartons(String(af.totalCartons || data.shipment.quantity));
          }
          if (af.quantityPcs && !quantityPcs) setQuantityPcs(String(af.quantityPcs));
          if (af.quantityKg && !quantityKg) setQuantityKg(String(af.quantityKg));
          if (af.hsnCode && !hsnCode) setHsnCode(af.hsnCode);
          if (af.taxableValue && !taxableValue) setTaxableValue(String(af.taxableValue));

          // Sync cascade selector values
          if (af.container && !singleContainer) {
            setSingleContainer(af.container);
          }
          if ((af.mainMarka || af.subMarka) && !singleSelectedMarka) {
            setSingleSelectedMarka(af.mainMarka || af.subMarka);
          }
          setSingleSelectedReceipt(clean);

          // Now lookup Marka Purchaser details from directory
          const m = af.mainMarka || af.subMarka;
          if (m) {
            const mRes = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(m)}`);
            if (mRes.ok) {
              const mData = await mRes.json();
              if (mData.markaAddress) {
                const ma = mData.markaAddress;
                setPurchaserName(ma.purchaserName || af.party || '');
                setRegistrationType(ma.registrationType || 'Registered');
                setPurchaserGstin(ma.gstin || '');
                const addrs = ma.addresses || [];
                setCurrentMarkaAddresses(addrs);
                const addr = addrs.length > 0 ? addrs[0].address : '';
                if (addrs.length > 0) {
                  setSelectedDeliveryAddressId(addrs[0]._id || '');
                }
                setPurchaserAddress(addr);
                setConsigneeAddress(addr);
                setConsigneeState(ma.state || 'Uttar Pradesh');
                setConsigneeStateCode(ma.stateCode || '09');
                setPurchaserPhone(ma.phone || (ma.addresses?.[0]?.phone || ''));

                setBuyerName(ma.buyerName || ma.purchaserName || af.party || '');
                setBuyerAddress(ma.buyerAddress || addr);
                setBuyerGstin(ma.buyerGstin || ma.gstin || '');
                setBuyerState(ma.buyerState || ma.state || 'Uttar Pradesh');
                setBuyerStateCode(ma.buyerStateCode || ma.stateCode || '09');
                setSameAsConsignee(!ma.buyerAddress || ma.buyerAddress === addr);
              } else {
                setPurchaserName(af.party || '');
                setCurrentMarkaAddresses([]);
                setSelectedDeliveryAddressId('');
              }
            }
          } else {
            setPurchaserName(af.party || '');
            setCurrentMarkaAddresses([]);
            setSelectedDeliveryAddressId('');
          }

          setLookupMessage(`✓ Matched cargo: Marka [${m || 'Marked'}] | Item [${af.commodity || 'Goods'}]`);
        }
      } else {
        setLookupMessage('ℹ New receipt (no prior container shipment matched yet)');
      }
    } catch (err) {
      console.error('Lookup error:', err);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Fetch multiple sending/delivery locations for a Marka
  const fetchMarkaDeliveryLocations = async (markaName: string) => {
    if (!markaName.trim()) {
      setCurrentMarkaAddresses([]);
      setSelectedDeliveryAddressId('');
      return;
    }
    try {
      const res = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(markaName.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.markaAddress) {
          const ma = data.markaAddress;
          const addrs = ma.addresses || [];
          setCurrentMarkaAddresses(addrs);
          if (addrs.length > 0) {
            const def = addrs.find((a: any) => a.isDefault) || addrs[0];
            setSelectedDeliveryAddressId(def._id || '');
            setConsigneeAddress(def.address || '');
            if (def.state || ma.state) setConsigneeState(def.state || ma.state);
            if (def.stateCode || ma.stateCode) setConsigneeStateCode(def.stateCode || ma.stateCode);
            if (def.phone || ma.phone) setPurchaserPhone(def.phone || ma.phone);
          }
        } else {
          setCurrentMarkaAddresses([]);
          setSelectedDeliveryAddressId('');
        }
      }
    } catch (err) {
      console.error('Failed to load marka locations:', err);
    }
  };

  // Select a specific sending/delivery address for the bill
  const handleSelectDeliveryAddress = (addr: any) => {
    setSelectedDeliveryAddressId(addr._id || '');
    setConsigneeAddress(addr.address || '');
    if (addr.state) setConsigneeState(addr.state);
    if (addr.stateCode) setConsigneeStateCode(addr.stateCode);
    if (addr.phone) setPurchaserPhone(addr.phone);
  };

  // Save new sending location for the selected Marka
  const handleSaveNewLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMarka = (mainMarka || subMarka || singleSelectedMarka).trim();
    if (!currentMarka) {
      alert('कृपया पहले एक मार्का (Marka) चुनें जिसके लिए पता सेव करना है।');
      return;
    }
    if (!newLocAddress.trim()) {
      alert('कृपया पूरा डिलीवरी पता (Address) दर्ज करें।');
      return;
    }

    setIsSavingNewLoc(true);
    try {
      const finalRegType = newLocRegType;
      const finalGst = finalRegType === 'Registered' ? newLocGstin.trim().toUpperCase() : '';

      const payload = {
        marka: currentMarka,
        purchaserName: purchaserName.trim() || currentMarka,
        registrationType: finalRegType,
        gstin: finalGst,
        address: {
          title: (newLocTitle.trim() || `Location ${currentMarkaAddresses.length + 1}`).trim(),
          address: newLocAddress.trim(),
          city: newLocCity.trim(),
          state: newLocState.trim(),
          stateCode: newLocStateCode.trim(),
          pincode: newLocPincode.trim(),
          contactPerson: newLocContactPerson.trim(),
          phone: newLocPhone.trim(),
          isDefault: currentMarkaAddresses.length === 0,
        },
      };

      const res = await fetch('/api/marka-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save sending location');

      const updatedAddrs = data.markaAddress?.addresses || [];
      setCurrentMarkaAddresses(updatedAddrs);
      const newest = updatedAddrs[updatedAddrs.length - 1];
      if (newest) {
        setSelectedDeliveryAddressId(newest._id || '');
        setConsigneeAddress(newest.address || '');
        if (newest.state) setConsigneeState(newest.state);
        if (newest.stateCode) setConsigneeStateCode(newest.stateCode);
        if (newest.phone) setPurchaserPhone(newest.phone);
        setRegistrationType(finalRegType);
        if (finalGst) setPurchaserGstin(finalGst);
      }

      setShowAddLocationModal(false);
      setNewLocTitle('');
      setNewLocAddress('');
      setNewLocCity('');
      setNewLocState('Delhi');
      setNewLocStateCode('07');
      setNewLocPincode('');
      setNewLocContactPerson('');
      setNewLocPhone('');
      setNewLocRegType('Registered');
      setNewLocGstin('');
      alert(`मार्का '${currentMarka}' के लिए नया सेंडिंग लोकेशन सेव हो गया!`);
    } catch (err: any) {
      alert(err.message || 'Error saving location');
    } finally {
      setIsSavingNewLoc(false);
    }
  };

  // Delete a specific location from a Marka
  const handleDeleteLocation = async (marka: string, addressId: string) => {
    if (!confirm('क्या आप वाकई इस सहेजे गए पते को हटाना चाहते हैं?')) return;
    setIsDeletingLocationId(addressId);
    try {
      const res = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(marka)}&addressId=${encodeURIComponent(addressId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete address');

      await fetchMarkaDeliveryLocations(marka);
      setMarkaSaveSuccess('✓ पता सफलतापूर्वक हटा दिया गया!');
      setTimeout(() => setMarkaSaveSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Error deleting address');
    } finally {
      setIsDeletingLocationId(null);
    }
  };

  // Open Edit Location Modal
  const handleOpenEditLocation = (marka: string, addr: any) => {
    const stName = getStateName(addr.state || consigneeState) || 'Delhi';
    const stCode = getStateCode(addr.stateCode || consigneeStateCode || stName) || '07';
    setEditingLocationData({
      marka,
      addressId: addr._id,
      title: addr.title || 'Godown',
      address: addr.address || '',
      city: addr.city || '',
      state: stName,
      stateCode: stCode,
      pincode: addr.pincode || '',
      contactPerson: addr.contactPerson || purchaserName || '',
      phone: addr.phone || purchaserPhone || '',
    });
    setShowEditLocationModal(true);
  };

  // Save Edited Location
  const handleSaveEditedLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocationData) return;
    try {
      const payload = {
        marka: editingLocationData.marka,
        addressId: editingLocationData.addressId,
        title: editingLocationData.title.trim(),
        address: editingLocationData.address.trim(),
        city: editingLocationData.city.trim(),
        state: editingLocationData.state.trim(),
        pincode: editingLocationData.pincode.trim(),
        contactPerson: editingLocationData.contactPerson.trim(),
        phone: editingLocationData.phone.trim(),
      };

      const res = await fetch('/api/marka-addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update address');

      setShowEditLocationModal(false);
      setEditingLocationData(null);
      await fetchMarkaDeliveryLocations(editingLocationData.marka);
      setConsigneeAddress(payload.address);
      setConsigneeState(payload.state);
      setConsigneeStateCode(getStateCode(payload.state) || '07');
      if (payload.phone) setPurchaserPhone(payload.phone);
      setMarkaSaveSuccess('✓ पता सफलतापूर्वक अपडेट हो गया!');
      setTimeout(() => setMarkaSaveSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Error updating address');
    }
  };

  // Add Item to Multi-Item Invoice Builder
  const handleAddLineItem = () => {
    if (!lineDescription.trim()) {
      alert('कृपया आइटम का नाम / विवरण (Item Description) डालें');
      return;
    }
    const qty = parseFloat(lineQuantity) || 0;
    if (qty <= 0) {
      alert('कृपया मान्य क्वांटिटी (Quantity) डालें');
      return;
    }
    const r = parseFloat(lineRate) || 0;
    if (r <= 0) {
      alert('कृपया मान्य दर (Rate ₹) डालें');
      return;
    }

    const finalHsn = (lineHsn || hsnCode || '').trim();
    if (!finalHsn || finalHsn.length < 4 || !/^\d+$/.test(finalHsn)) {
      alert('कृपया एक मान्य HSN / SAC कोड (कम से कम 4 से 8 अंक) अवश्य दर्ज करें। GST नियमानुसार HSN कोड अनिवार्य (Mandatory) है।');
      return;
    }

    const amt = Number((qty * r).toFixed(2));
    const newItem: FormLineItem = {
      itemNo: invoiceItems.length + 1,
      description: lineDescription.trim(),
      hsnCode: finalHsn,
      quantity: qty,
      unit: lineUnit.trim().toUpperCase() || 'PCS',
      rate: r,
      amount: amt,
    };

    const updated = [...invoiceItems, newItem];
    setInvoiceItems(updated);

    const totalTaxable = updated.reduce((acc, it) => acc + it.amount, 0);
    setTaxableValue(totalTaxable.toFixed(2));

    if (!commodity.trim()) setCommodity(newItem.description);
    if (!hsnCode.trim() || hsnCode === '9997') setHsnCode(newItem.hsnCode);

    // Auto-link item to HSN in persistent database
    if (newItem.description && newItem.hsnCode) {
      fetch('/api/hsn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: newItem.description,
          hsnCode: newItem.hsnCode,
          description: newItem.description,
          gstRate: igstRate || 18,
        }),
      }).catch((e) => console.warn('Background HSN link error:', e));
    }

    setLineDescription('');
    setLineQuantity('');
    setLineRate('');
  };

  // Remove Item from Multi-Item Invoice Builder
  const handleRemoveLineItem = (index: number) => {
    const updated = invoiceItems.filter((_, i) => i !== index).map((it, idx) => ({ ...it, itemNo: idx + 1 }));
    setInvoiceItems(updated);
    if (updated.length > 0) {
      const totalTaxable = updated.reduce((acc, it) => acc + it.amount, 0);
      setTaxableValue(totalTaxable.toFixed(2));
    }
  };

  // Open Edit Bill Modal with existing bill details
  const handleOpenEditBillModal = (bill: BillItem) => {
    setBillToEdit(bill);

    let existingItems: FormLineItem[] = [];
    if (Array.isArray(bill.items) && bill.items.length > 0) {
      existingItems = bill.items.map((it: any, idx: number) => ({
        itemNo: it.itemNo || idx + 1,
        description: it.description || bill.commodity || 'Goods',
        hsnCode: it.hsnCode || bill.hsnCode || '39269099',
        quantity: Number(it.quantity) || bill.quantityPcs || bill.quantityKg || 1,
        unit: it.unit || bill.billingUnit || 'PCS',
        rate: Number(it.rate) || bill.rate || 0,
        amount: Number(it.amount) || Number((it.quantity || 1) * (it.rate || 0)) || bill.taxableValue || 0,
      }));
    } else {
      existingItems = [
        {
          itemNo: 1,
          description: bill.commodity || 'Commercial Goods',
          hsnCode: bill.hsnCode || '39269099',
          quantity: bill.billingUnit === 'KG' ? (bill.quantityKg || 1) : (bill.quantityPcs || 1),
          unit: bill.billingUnit || 'PCS',
          rate: bill.rate || 0,
          amount: bill.taxableValue || 0,
        },
      ];
    }

    const isConsigneeEqualBuyer =
      Boolean((bill.consigneeAddress || bill.purchaserAddress) &&
      (bill.consigneeAddress || bill.purchaserAddress) === bill.buyerAddress &&
      bill.consigneeState === bill.buyerState);

    setEditBillData({
      billNumber: bill.billNumber || '',
      receipt: bill.receipt || '',
      purchaserName: bill.consigneeName || bill.purchaserName || bill.party || '',
      purchaserRegistrationType: (bill.purchaserRegistrationType || (bill.consigneeGstin || bill.purchaserGstin ? 'Registered' : 'Unregistered')) as 'Registered' | 'Unregistered',
      purchaserGstin: bill.consigneeGstin || bill.purchaserGstin || '',
      consigneeAddress: bill.consigneeAddress || bill.purchaserAddress || '',
      consigneeState: bill.consigneeState || bill.purchaserState || 'Delhi',
      consigneeStateCode: bill.consigneeStateCode || bill.purchaserStateCode || '07',
      sameAsConsignee: isConsigneeEqualBuyer,
      buyerName: bill.buyerName || bill.consigneeName || bill.purchaserName || bill.party || '',
      buyerGstin: bill.buyerGstin || bill.consigneeGstin || bill.purchaserGstin || '',
      buyerAddress: bill.buyerAddress || bill.consigneeAddress || bill.purchaserAddress || '',
      buyerState: bill.buyerState || bill.consigneeState || 'Delhi',
      buyerStateCode: bill.buyerStateCode || bill.consigneeStateCode || '07',
      vehicleNumber: bill.vehicleNumber || '',
      destination: bill.destination || '',
      eWayBillNo: bill.eWayBillNo || '',
      billingUnit: bill.billingUnit || 'PCS',
      rate: bill.rate || 0,
      items: existingItems,
    });
    setEditBillModalOpen(true);
  };

  const handleEditBillAddItem = () => {
    setEditBillData((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          itemNo: prev.items.length + 1,
          description: '',
          hsnCode: '39269099',
          quantity: 1,
          unit: 'PCS',
          rate: 0,
          amount: 0,
        },
      ],
    }));
  };

  const handleEditBillRemoveItem = (idx: number) => {
    setEditBillData((prev: any) => {
      const nextItems = prev.items.filter((_: any, i: number) => i !== idx).map((it: any, i: number) => ({
        ...it,
        itemNo: i + 1,
      }));
      return { ...prev, items: nextItems };
    });
  };

  const handleEditBillUpdateItem = (idx: number, field: keyof FormLineItem, val: any) => {
    setEditBillData((prev: any) => {
      const nextItems = [...prev.items];
      const cur = { ...nextItems[idx], [field]: val };
      if (field === 'quantity' || field === 'rate') {
        const q = field === 'quantity' ? parseFloat(val) || 0 : cur.quantity;
        const r = field === 'rate' ? parseFloat(val) || 0 : cur.rate;
        cur.amount = Number((q * r).toFixed(2));
      }
      nextItems[idx] = cur;
      return { ...prev, items: nextItems };
    });
  };

  const handleSaveEditedBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billToEdit) return;

    if (!editBillData.purchaserName.trim()) {
      alert('कृपया पार्टी / कंसाइनी का नाम (Party Legal Name) दर्ज करें।');
      return;
    }

    if (!editBillData.consigneeAddress.trim()) {
      alert('कृपया डिलीवरी का पता (Delivery Address) दर्ज करें।');
      return;
    }

    if (editBillData.items.length === 0) {
      alert('कम से कम एक आइटम होना अनिवार्य है।');
      return;
    }

    for (const it of editBillData.items) {
      const itHsn = (it.hsnCode || '').trim();
      if (!itHsn || itHsn.length < 4 || !/^\d+$/.test(itHsn)) {
        alert(
          `HSN / SAC कोड अनिवार्य (Mandatory) है!\n\nआइटम "${it.description || 'Item'}" के लिए मान्य 4 से 8 अंकों का HSN कोड अवश्य दर्ज करें।`
        );
        return;
      }
    }

    const totalTaxable = editBillData.items.reduce(
      (sum: number, it: FormLineItem) => sum + (Number(it.amount) || 0),
      0
    );
    const igstRate = billToEdit.igst || 18;
    const igstAmt = Number(((totalTaxable * igstRate) / 100).toFixed(2));
    const grandTotal = Number((totalTaxable + igstAmt).toFixed(2));

    const finalDestState = (editBillData.consigneeState || editBillData.buyerState || '').toLowerCase();
    const finalDestCode = (editBillData.consigneeStateCode || editBillData.buyerStateCode || '').trim();
    const isDelhi = finalDestState.includes('delhi') || finalDestCode === '07';

    if (isDelhi && grandTotal > 100000 && !editBillData.eWayBillNo.trim()) {
      alert(
        `⚠️ ई-वे बिल अनिवार्य है!\n\nदिल्ली के भीतर (Intra-Delhi) कुल राशि ₹${grandTotal.toLocaleString('en-IN')} (सीमा ₹1,00,000 से अधिक) होने पर E-Way Bill Number अनिवार्य है।\n\nकृपया E-Way Bill No. भरें।`
      );
      return;
    }
    if (!isDelhi && grandTotal > 50000 && !editBillData.eWayBillNo.trim()) {
      alert(
        `⚠️ ई-वे बिल अनिवार्य है!\n\nआउटसाइड दिल्ली (Inter-State) के लिए कुल राशि ₹${grandTotal.toLocaleString('en-IN')} (सीमा ₹50,000 से अधिक) होने पर E-Way Bill Number अनिवार्य है।\n\nकृपया E-Way Bill No. भरें।`
      );
      return;
    }

    if (editBillData.vehicleNumber.trim()) {
      const vehCheck = checkVehicleCumulativeLimit(
        editBillData.vehicleNumber,
        grandTotal,
        isDelhi,
        editBillData.eWayBillNo,
        billToEdit.createdAt ? new Date(billToEdit.createdAt).toISOString().split('T')[0] : undefined
      );
      if (vehCheck.requiresConfirm) {
        const proceed = window.confirm(vehCheck.message);
        if (!proceed) return;
      }
    }

    setIsSavingEditBill(true);
    try {
      const finalBuyerAddr = editBillData.sameAsConsignee ? editBillData.consigneeAddress : editBillData.buyerAddress;
      const finalBuyerName = editBillData.sameAsConsignee ? editBillData.purchaserName : editBillData.buyerName;
      const finalBuyerGstin = editBillData.sameAsConsignee
        ? editBillData.purchaserRegistrationType === 'Registered'
          ? editBillData.purchaserGstin
          : ''
        : editBillData.buyerGstin;
      const finalBuyerState = editBillData.sameAsConsignee ? editBillData.consigneeState : editBillData.buyerState;
      const finalBuyerStateCode = editBillData.sameAsConsignee ? editBillData.consigneeStateCode : editBillData.buyerStateCode;

      const payload = {
        id: billToEdit._id,
        billNumber: editBillData.billNumber.trim() || billToEdit.billNumber,
        purchaserName: editBillData.purchaserName.trim(),
        purchaserRegistrationType: editBillData.purchaserRegistrationType,
        purchaserGstin: editBillData.purchaserRegistrationType === 'Registered' ? editBillData.purchaserGstin.trim().toUpperCase() : '',
        purchaserAddress: editBillData.consigneeAddress.trim(),
        consigneeName: editBillData.purchaserName.trim(),
        consigneeAddress: editBillData.consigneeAddress.trim(),
        consigneeGstin: editBillData.purchaserRegistrationType === 'Registered' ? editBillData.purchaserGstin.trim().toUpperCase() : '',
        consigneeState: editBillData.consigneeState.trim(),
        consigneeStateCode: editBillData.consigneeStateCode.trim(),
        buyerName: finalBuyerName.trim(),
        buyerGstin: finalBuyerGstin.trim().toUpperCase(),
        buyerAddress: finalBuyerAddr.trim(),
        buyerState: finalBuyerState.trim(),
        buyerStateCode: finalBuyerStateCode.trim(),
        vehicleNumber: editBillData.vehicleNumber.trim().toUpperCase(),
        destination: editBillData.destination.trim().toUpperCase(),
        eWayBillNo: editBillData.eWayBillNo.trim(),
        items: editBillData.items,
        hsnCode: editBillData.items[0]?.hsnCode || billToEdit.hsnCode || '',
        commodity: editBillData.items[0]?.description || billToEdit.commodity || '',
        taxableValue: totalTaxable,
        igstAmount: igstAmt,
        totalAmount: grandTotal,
      };

      const res = await fetch('/api/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update bill');

      const updatedBill = data.bill || { ...billToEdit, ...payload };
      setBills((prev) => prev.map((b) => (b._id === billToEdit._id ? updatedBill : b)));
      setEditBillModalOpen(false);
      setBillToEdit(null);

      generateBillPDF(updatedBill, true);
      alert('✓ बिल सफलतापूर्वक अपडेट (संशोधित) कर दिया गया है और नया PDF डाउनलोड हो गया है!');
    } catch (err: any) {
      alert(err.message || 'Error updating bill');
    } finally {
      setIsSavingEditBill(false);
    }
  };

  // Open quick vehicle modal
  const handleOpenVehicleModal = (bill: BillItem) => {
    setTargetBillForVehicle(bill);
    setQuickVehicleInput(bill.vehicleNumber || '');
    setQuickDestInput(bill.destination || '');
    setVehicleModalOpen(true);
  };

  // Save quick vehicle modal
  const handleSaveQuickVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBillForVehicle) return;

    const targetState = (targetBillForVehicle.consigneeState || targetBillForVehicle.buyerState || '').toLowerCase();
    const targetCode = (targetBillForVehicle.consigneeStateCode || targetBillForVehicle.buyerStateCode || '').trim();
    const isDelhiTarget = targetState.includes('delhi') || targetCode === '07';
    const vehCheck = checkVehicleCumulativeLimit(
      quickVehicleInput,
      Number(targetBillForVehicle.totalAmount) || 0,
      isDelhiTarget,
      targetBillForVehicle.eWayBillNo || '',
      targetBillForVehicle.createdAt ? new Date(targetBillForVehicle.createdAt).toISOString().split('T')[0] : undefined
    );
    if (vehCheck.requiresConfirm) {
      const proceed = window.confirm(vehCheck.message);
      if (!proceed) return;
    }

    setIsSavingQuickVehicle(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetBillForVehicle._id,
          vehicleNumber: quickVehicleInput.trim(),
          destination: quickDestInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update vehicle number');

      setBills((prev) =>
        prev.map((b) =>
          b._id === targetBillForVehicle._id
            ? { ...b, vehicleNumber: quickVehicleInput.trim(), destination: quickDestInput.trim() || b.destination }
            : b
        )
      );
      setVehicleModalOpen(false);
      setTargetBillForVehicle(null);
    } catch (err: any) {
      alert(err.message || 'Error updating vehicle number');
    } finally {
      setIsSavingQuickVehicle(false);
    }
  };

  // Bulk update vehicle number for selected bills
  const handleBulkUpdateVehicle = async () => {
    if (selectedBillIds.size === 0) return;
    if (!bulkVehicleInput.trim()) {
      alert('कृपया गाड़ी नंबर (Vehicle Number) दर्ज करें।');
      return;
    }

    const selectedList = bills.filter((b) => selectedBillIds.has(b._id));
    const batchTotal = selectedList.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const anyOutsideDelhi = selectedList.some((b) => {
      const st = (b.consigneeState || b.buyerState || '').toLowerCase();
      const cd = (b.consigneeStateCode || b.buyerStateCode || '').trim();
      return !st.includes('delhi') && cd !== '07';
    });
    const vehCheck = checkVehicleCumulativeLimit(
      bulkVehicleInput,
      batchTotal,
      !anyOutsideDelhi,
      ''
    );
    if (vehCheck.requiresConfirm) {
      const proceed = window.confirm(vehCheck.message);
      if (!proceed) return;
    }
    setIsBulkUpdatingVehicle(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billIds: Array.from(selectedBillIds),
          vehicleNumber: bulkVehicleInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to bulk update vehicle number');

      const updatedCount = selectedBillIds.size;
      setBills((prev) =>
        prev.map((b) =>
          selectedBillIds.has(b._id) ? { ...b, vehicleNumber: bulkVehicleInput.trim() } : b
        )
      );
      setSelectedBillIds(new Set());
      setBulkVehicleInput('');
      alert(`सफलता! ${updatedCount} बिलों में गाड़ी नंबर '${bulkVehicleInput.trim()}' अपडेट हो गया है।`);
    } catch (err: any) {
      alert(err.message || 'Error in bulk update');
    } finally {
      setIsBulkUpdatingVehicle(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedBillIds.size === filteredBills.length && filteredBills.length > 0) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(filteredBills.map((b) => b._id)));
    }
  };

  const handleToggleBillSelect = (id: string) => {
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Seller management modal actions
  const openNewSellerModal = () => {
    setEditingSellerId(null);
    setNewSellerName('');
    setNewSellerGstin('');
    setNewSellerAddress('');
    setNewSellerCity('');
    setNewSellerPincode('');
    setNewSellerState('Delhi');
    setNewSellerStateCode('07');
    setNewSellerPhone('');
    setNewSellerEmail('');
    setShowSellerModal(true);
  };

  const openEditSellerModal = (s: SellerItem) => {
    setEditingSellerId(s._id);
    setNewSellerName(s.name);
    setNewSellerGstin(s.gstin || '');
    setNewSellerAddress(s.address);
    setNewSellerCity(s.city || '');
    setNewSellerPincode(s.pincode || '');
    setNewSellerState(s.state || 'Delhi');
    setNewSellerStateCode(s.stateCode || '07');
    setNewSellerPhone(s.phone || '');
    setNewSellerEmail(s.email || '');
    setShowSellerModal(true);
  };

  const handleDeleteSeller = async (id: string) => {
    if (sellers.length <= 1) {
      alert('At least one billing company must remain in the system.');
      return;
    }
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
      const res = await fetch(`/api/sellers?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchSellers();
      }
    } catch (err) {
      console.error('Failed to delete seller:', err);
    }
  };

  const handleSaveSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerName.trim() || !newSellerAddress.trim()) {
      alert('Company Name and Address are required');
      return;
    }

    setIsSavingSeller(true);
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingSellerId || undefined,
          name: newSellerName.trim(),
          gstin: newSellerGstin.trim().toUpperCase(),
          address: newSellerAddress.trim(),
          city: newSellerCity.trim(),
          pincode: newSellerPincode.trim(),
          state: newSellerState.trim(),
          stateCode: newSellerStateCode.trim(),
          phone: newSellerPhone.trim(),
          email: newSellerEmail.trim(),
          isDefault: sellers.length === 0 || editingSellerId === selectedSellerId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save seller');

      await fetchSellers();
      if (data.seller) {
        setSelectedSellerId(data.seller._id);
      }
      setShowSellerModal(false);
      setEditingSellerId(null);
    } catch (err: any) {
      alert(err.message || 'Error saving seller');
    } finally {
      setIsSavingSeller(false);
    }
  };

  // Marka Directory Management Actions
  const loadMarkaAddresses = async () => {
    setIsLoadingMarkas(true);
    try {
      const res = await fetch('/api/marka-addresses');
      if (res.ok) {
        const data = await res.json();
        setMarkaList(data.markas || []);
      }
    } catch (err) {
      console.error('Failed to load marka addresses:', err);
    } finally {
      setIsLoadingMarkas(false);
    }
  };

  const openMarkaModal = () => {
    loadMarkaAddresses();
    resetMarkaForm();
    setShowMarkaModal(true);
  };

  const resetMarkaForm = () => {
    setSelectedMarkaToEdit(null);
    setDirMarkaName('');
    setDirPurchaserName('');
    setDirRegistrationType('Registered');
    setDirGstin('');
    setDirConsigneeAddress('');
    setDirState('Uttar Pradesh');
    setDirStateCode('09');
    setDirPhone('');
    setDirEmail('');
    setDirBuyerName('');
    setDirBuyerAddress('');
    setDirBuyerGstin('');
    setDirBuyerState('Uttar Pradesh');
    setDirBuyerStateCode('09');
    setDirSameAsConsignee(true);
  };

  const selectMarkaForEditing = (m: any) => {
    setSelectedMarkaToEdit(m);
    setDirMarkaName(m.marka);
    setDirPurchaserName(m.purchaserName || '');
    setDirRegistrationType(m.registrationType || 'Registered');
    setDirGstin(m.gstin || '');
    const addr = m.addresses?.[0]?.address || '';
    setDirConsigneeAddress(addr);
    setDirState(m.state || 'Uttar Pradesh');
    setDirStateCode(m.stateCode || '09');
    setDirPhone(m.phone || (m.addresses?.[0]?.phone || ''));
    setDirEmail(m.email || '');
    setDirBuyerName(m.buyerName || m.purchaserName || '');
    setDirBuyerAddress(m.buyerAddress || addr);
    setDirBuyerGstin(m.buyerGstin || m.gstin || '');
    setDirBuyerState(m.buyerState || m.state || 'Uttar Pradesh');
    setDirBuyerStateCode(m.buyerStateCode || m.stateCode || '09');
    setDirSameAsConsignee(!m.buyerAddress || m.buyerAddress === addr);
  };

  const handleSaveDirMarka = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirMarkaName.trim() || !dirPurchaserName.trim()) {
      alert('Marka name and Purchaser/Company name are required');
      return;
    }
    setIsSavingDirMarka(true);
    try {
      const finalBuyerAddr = dirSameAsConsignee ? dirConsigneeAddress : dirBuyerAddress;
      const finalBuyerGstin = dirSameAsConsignee ? dirGstin : dirBuyerGstin;
      const finalBuyerState = dirSameAsConsignee ? dirState : dirBuyerState;
      const finalBuyerStateCode = dirSameAsConsignee ? dirStateCode : dirBuyerStateCode;

      const payload = {
        marka: dirMarkaName.trim(),
        purchaserName: dirPurchaserName.trim(),
        registrationType: dirRegistrationType,
        gstin: dirRegistrationType === 'Registered' ? dirGstin.trim().toUpperCase() : '',
        state: dirState.trim(),
        stateCode: dirStateCode.trim(),
        phone: dirPhone.trim(),
        email: dirEmail.trim(),
        consigneeAddress: dirConsigneeAddress.trim(),
        buyerName: (dirBuyerName || dirPurchaserName).trim(),
        buyerAddress: finalBuyerAddr.trim(),
        buyerGstin: (finalBuyerGstin || '').trim().toUpperCase(),
        buyerState: finalBuyerState.trim(),
        buyerStateCode: finalBuyerStateCode.trim(),
      };

      const res = await fetch('/api/marka-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Marka address');

      await loadMarkaAddresses();
      alert(`Marka '${dirMarkaName}' address saved successfully!`);
      resetMarkaForm();
    } catch (err: any) {
      alert(err.message || 'Error saving marka address');
    } finally {
      setIsSavingDirMarka(false);
    }
  };

  const handleDeleteMarkaRecord = async (mName: string) => {
    if (!confirm(`Are you sure you want to delete Marka '${mName}' from directory?`)) return;
    try {
      const res = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(mName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      await loadMarkaAddresses();
      if (selectedMarkaToEdit?.marka === mName) {
        resetMarkaForm();
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting marka');
    }
  };

  // Instant save current address for selected Marka directly from form
  const handleInstantSaveMarkaAddress = async () => {
    const currentMarka = (mainMarka || subMarka || singleSelectedMarka).trim();
    if (!currentMarka) {
      alert('Please select or enter a Marka first in Step 1.');
      return;
    }
    if (!purchaserName.trim()) {
      alert('Please enter Purchaser / Company name in Step 3.');
      return;
    }

    setIsSavingMarkaDirect(true);
    setMarkaSaveSuccess(null);
    try {
      const finalBuyerAddr = sameAsConsignee ? (consigneeAddress || purchaserAddress) : buyerAddress;
      const finalBuyerGstin = sameAsConsignee ? purchaserGstin : buyerGstin;
      const finalBuyerState = sameAsConsignee ? consigneeState : buyerState;
      const finalBuyerStateCode = sameAsConsignee ? consigneeStateCode : buyerStateCode;

      const payload = {
        marka: currentMarka,
        purchaserName: purchaserName.trim(),
        registrationType,
        gstin: registrationType === 'Registered' ? purchaserGstin.trim().toUpperCase() : '',
        state: consigneeState.trim(),
        stateCode: consigneeStateCode.trim(),
        phone: purchaserPhone.trim(),
        consigneeAddress: (consigneeAddress || purchaserAddress).trim(),
        buyerName: (buyerName || purchaserName).trim(),
        buyerAddress: finalBuyerAddr.trim(),
        buyerGstin: (finalBuyerGstin || '').trim().toUpperCase(),
        buyerState: finalBuyerState.trim(),
        buyerStateCode: finalBuyerStateCode.trim(),
      };

      const res = await fetch('/api/marka-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save address');

      setMarkaSaveSuccess(`✓ Address permanently saved for Marka "${currentMarka}"!`);
      setTimeout(() => setMarkaSaveSuccess(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to save marka address');
    } finally {
      setIsSavingMarkaDirect(false);
    }
  };

  // Download Specific Container's Manifest in Excel (User's workflow requirement: Select container -> download Excel -> update & re-upload)
  const handleDownloadContainerExcel = async () => {
    if (!selectedDownloadContainer) {
      alert('कृपया पहले कंटेनर नंबर सेलेक्ट करें।');
      return;
    }

    setIsDownloadingContainer(true);
    try {
      const res = await fetch(`/api/billing/container-manifest?container=${encodeURIComponent(selectedDownloadContainer.trim())}`);
      if (!res.ok) throw new Error('Failed to fetch container manifest');
      const data = await res.json();
      const rows = data.manifestRows || [];

      if (rows.length === 0) {
        alert(`कंटेनर '${selectedDownloadContainer}' में कोई शिपमेंट रिकॉर्ड नहीं मिला।`);
        return;
      }

      const exportData = rows.map((r: any) => ({
        'Sr. No.': r.srNo,
        'Container': r.container,
        'Receipt No.': r.receipt,
        'Main Marka': r.mainMarka,
        'Sub Marka': r.subMarka,
        'Party / Purchaser': r.party,
        'Commodity': r.commodity,
        'Cartons (CTN)': r.cartons,
        'Billing Unit (Pcs/KG/Cartons)': r.billingUnit || 'Pcs',
        'HSN Code': r.hsnCode || '',
        'IGST (%)': r.igst || 18,
        'Quantity pcs': r.quantityPcs || '',
        'Quantity kg': r.quantityKg || r.weightKg || '',
        'Taxable Value': r.taxableValue || '',
        'Purchaser Name': r.party || '',
        'Purchaser Registration (Registered/Unregistered)': 'Registered',
        'Purchaser GSTIN': '',
        'Seller Name': currentSeller?.name || 'US INTERNATIONAL LOGISTICS',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 8 },  // Sr
        { wch: 16 }, // Container
        { wch: 16 }, // Receipt No
        { wch: 16 }, // Main Marka
        { wch: 16 }, // Sub Marka
        { wch: 22 }, // Party
        { wch: 24 }, // Commodity
        { wch: 14 }, // Cartons
        { wch: 28 }, // Billing Unit
        { wch: 14 }, // HSN Code
        { wch: 10 }, // IGST %
        { wch: 14 }, // Quantity pcs
        { wch: 14 }, // Quantity kg
        { wch: 16 }, // Taxable Value
        { wch: 22 }, // Purchaser Name
        { wch: 26 }, // Purchaser Registration
        { wch: 18 }, // Purchaser GSTIN
        { wch: 26 }, // Seller Name
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Billing_Manifest');

      // Add Instructions Sheet
      const instructions = [
        { 'Step': '1. Container Manifest', 'Details': `Container ${selectedDownloadContainer} manifest generated with ${rows.length} shipments.` },
        { 'Step': '2. Billing Unit Decision', 'Details': 'Choose "Pcs", "KG", or "Cartons" in column "Billing Unit". Biller decides which unit will be billed!' },
        { 'Step': '3. Cartons & Quantity', 'Details': 'Dispatcher will only enter Cartons. Quantity (Pcs/KG) will be automatically calculated proportionately.' },
        { 'Step': '4. HSN & Taxable Value', 'Details': 'Enter HSN Code, IGST % (default 18), and Taxable Value in Rupees.' },
        { 'Step': '5. Purchaser Details', 'Details': 'For Registered parties enter 15-digit GSTIN. For Unregistered leave blank.' },
        { 'Step': '6. Upload to Generate', 'Details': 'Upload this updated Excel back in Biller Portal to generate all bills without vehicle numbers!' },
      ];
      const wsHelp = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, wsHelp, 'Instructions_गाइड');

      const safeName = selectedDownloadContainer.replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(wb, `Container_${safeName}_Billing_Manifest.xlsx`);
    } catch (err: any) {
      alert(err.message || 'Error downloading container data');
    } finally {
      setIsDownloadingContainer(false);
    }
  };

  // Submit Single Bill
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Determine Receipt Number (or generate reference if empty)
    const finalReceiptNo = receiptNo.trim() || `RCP-${Date.now().toString().slice(-6)}`;

    // 2. Prepare items list (auto-construct from form inputs if table is empty)
    let finalItems: FormLineItem[] = [...invoiceItems];
    if (finalItems.length === 0) {
      const curDesc = (lineDescription || commodity || 'COMMERCIAL GOODS').trim();
      const curQty = parseFloat(lineQuantity) || parseFloat(quantityPcs) || parseFloat(quantityKg) || parseFloat(totalCartons) || 0;
      const curRate = parseFloat(lineRate) || parseFloat(itemRate) || 0;
      const curHsn = (lineHsn || hsnCode || '39269099').trim();
      const curUnit = (lineUnit || billingUnit || 'PCS').trim().toUpperCase();

      if (curQty > 0) {
        const curAmt = parseFloat(taxableValue) || Number((curQty * curRate).toFixed(2));
        finalItems.push({
          itemNo: 1,
          description: curDesc,
          hsnCode: curHsn,
          quantity: curQty,
          unit: curUnit,
          rate: curRate,
          amount: curAmt,
        });
      }
    }

    if (finalItems.length === 0 && (!taxableValue || parseFloat(taxableValue) <= 0)) {
      alert('कृपया कम से कम एक आइटम का नाम, क्वांटिटी (Quantity) और रेट (Rate) दर्ज करें।');
      return;
    }

    // 2b. Mandatory HSN Validation for All Items
    for (const it of finalItems) {
      const itHsn = (it.hsnCode || '').trim();
      if (!itHsn || itHsn.length < 4 || !/^\d+$/.test(itHsn)) {
        alert(
          `HSN / SAC कोड अनिवार्य (Mandatory) है!\n\nआइटम "${it.description || 'Item'}" के लिए मान्य 4 से 8 अंकों का HSN कोड अवश्य दर्ज करें।`
        );
        return;
      }
    }

    // 3. Taxable and Gross Total Calculations
    const finalTaxable = finalItems.length > 0
      ? Number(finalItems.reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2))
      : (parseFloat(taxableValue) || 0);

    const finalIgstRate = Number(igstRate) || 18;
    const finalIgstAmt = Number((finalTaxable * (finalIgstRate / 100)).toFixed(2));
    const finalTotalBillAmt = Number((finalTaxable + finalIgstAmt).toFixed(2));

    // 4. Statutory E-Way Bill Rule:
    // Outside Delhi (> ₹50,000) strictly requires E-Way Bill
    // Delhi Local (> ₹1,00,000) strictly requires E-Way Bill
    const destState = (consigneeState || buyerState || '').toLowerCase();
    const destCode = (consigneeStateCode || buyerStateCode || '').trim();
    const isDestDelhi = destState.includes('delhi') || destCode === '07';
    const eWayThreshold = isDestDelhi ? 100000 : 50000;

    if (finalTotalBillAmt > eWayThreshold && !formEWayBillNo.trim()) {
      alert(
        isDestDelhi
          ? `ई-वे बिल (E-Way Bill) अनिवार्य है!\n\nदिल्ली के अंदर (Intra-State) कुल बिल राशि ₹1,00,000 से अधिक होने पर E-Way Bill Number अनिवार्य है।\nवर्तमान बिल राशि: ₹${finalTotalBillAmt.toLocaleString('en-IN')}\n\nकृपया Step 2 में E-Way Bill No. दर्ज करें।`
          : `ई-वे बिल (E-Way Bill) अनिवार्य है!\n\nदिल्ली से बाहर (Inter-State) कुल बिल राशि ₹50,000 से अधिक होने पर E-Way Bill Number अनिवार्य है।\nवर्तमान बिल राशि: ₹${finalTotalBillAmt.toLocaleString('en-IN')}\n\nकृपया Step 2 में E-Way Bill No. दर्ज करें।`
      );
      return;
    }

    // 4b. Vehicle Cumulative Limit Rule (एक गाड़ी में ₹1,00,000 दिल्ली में और ₹50,000 बाहर - Same Date)
    if (formVehicleNumber.trim()) {
      const vehCheck = checkVehicleCumulativeLimit(
        formVehicleNumber,
        finalTotalBillAmt,
        isDestDelhi,
        formEWayBillNo
      );
      if (vehCheck.requiresConfirm) {
        const proceed = window.confirm(vehCheck.message);
        if (!proceed) {
          return;
        }
      }
    }

    // 5. Party & Address details
    const currentMarka = (mainMarka || subMarka || singleSelectedMarka).trim();
    const finalPurchaser = (purchaserName || partyName || currentMarka || 'General Party').trim();
    const finalConsigneeAddr = (consigneeAddress || purchaserAddress).trim();
    const finalBuyerAddr = (sameAsConsignee ? finalConsigneeAddr : buyerAddress || finalConsigneeAddr).trim();
    const finalBuyerName = (sameAsConsignee ? finalPurchaser : buyerName || finalPurchaser).trim();
    const finalBuyerGstin = (sameAsConsignee ? (registrationType === 'Registered' ? purchaserGstin : '') : (buyerGstin || purchaserGstin || '')).trim().toUpperCase();

    setIsSubmittingManual(true);
    setManualSuccessMsg(null);

    try {
      const payload = {
        receipt: finalReceiptNo,
        hsnCode: (finalItems[0]?.hsnCode || lineHsn || hsnCode || '39269099').trim(),
        igst: finalIgstRate,
        billingUnit: finalItems[0]?.unit || lineUnit || billingUnit || 'PCS',
        totalCartons: parseFloat(totalCartons) || (finalItems.find((i) => i.unit.includes('CTN'))?.quantity || 0),
        quantityPcs: parseFloat(quantityPcs) || finalItems.filter((i) => i.unit.includes('PC')).reduce((s, i) => s + i.quantity, 0),
        quantityKg: parseFloat(quantityKg) || finalItems.filter((i) => i.unit.includes('KG')).reduce((s, i) => s + i.quantity, 0),
        taxableValue: finalTaxable,
        party: finalPurchaser,
        mainMarka: currentMarka || 'GENERAL',
        subMarka: subMarka.trim(),
        container: (containerAlias || singleContainer).trim(),
        commodity: finalItems[0]?.description || commodity.trim() || 'COMMERCIAL GOODS',

        // Seller party
        sellerId: currentSeller?._id || '',
        sellerName: currentSeller?.name || 'NORDEX INTERNATIONAL',
        sellerGstin: currentSeller?.gstin || '',
        sellerAddress: currentSeller?.address || '',
        sellerCity: currentSeller?.city || '',
        sellerPincode: currentSeller?.pincode || '',
        sellerState: currentSeller?.state || 'Delhi',
        sellerStateCode: currentSeller?.stateCode || '07',
        sellerPhone: currentSeller?.phone || '',
        sellerEmail: currentSeller?.email || '',

        // Purchaser & Consignee (Ship to)
        purchaserName: finalPurchaser,
        purchaserRegistrationType: registrationType,
        purchaserGstin: registrationType === 'Registered' ? purchaserGstin.trim().toUpperCase() : '',
        purchaserAddress: finalConsigneeAddr,
        consigneeName: finalPurchaser,
        consigneeAddress: finalConsigneeAddr,
        consigneeGstin: registrationType === 'Registered' ? purchaserGstin.trim().toUpperCase() : '',
        consigneeState: consigneeState.trim() || 'Delhi',
        consigneeStateCode: consigneeStateCode.trim() || '07',

        // Buyer (Bill to)
        buyerName: finalBuyerName,
        buyerAddress: finalBuyerAddr,
        buyerGstin: finalBuyerGstin,
        buyerState: (sameAsConsignee ? consigneeState : buyerState || consigneeState).trim() || 'Delhi',
        buyerStateCode: (sameAsConsignee ? consigneeStateCode : buyerStateCode || consigneeStateCode).trim() || '07',

        rate: finalItems[0]?.rate || parseFloat(itemRate) || 0,

        // Line items
        items: finalItems,

        // Vehicle and delivery details
        vehicleNumber: formVehicleNumber.trim() || undefined,
        destination: formDestination.trim() || undefined,
        eWayBillNo: formEWayBillNo.trim() || undefined,
      };

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create bill');

      // Auto-save address for Marka
      if (currentMarka && finalPurchaser) {
        handleInstantSaveMarkaAddress().catch((err: any) => console.warn('Background marka save:', err));
      }

      setManualSuccessMsg(`✓ बिल सफलतापूर्वक बन गया! Receipt #${finalReceiptNo}`);
      // Reset form
      setReceiptNo('');
      setHsnCode('39269099');
      setTotalCartons('');
      setQuantityPcs('');
      setQuantityKg('');
      setTaxableValue('');
      setItemRate('');
      setPartyName('');
      setMainMarka('');
      setSubMarka('');
      setSelectedMarkas([]);
      setSingleSelectedMarka('');
      setContainerAlias('');
      setCommodity('');
      setPurchaserName('');
      setPurchaserGstin('');
      setPurchaserAddress('');
      setConsigneeAddress('');
      setBuyerName('');
      setBuyerAddress('');
      setBuyerGstin('');
      setPurchaserPhone('');
      setInvoiceItems([]);
      setLineDescription('');
      setLineHsn('39269099');
      setLineQuantity('');
      setLineRate('');
      setFormVehicleNumber('');
      setFormDestination('');
      setFormEWayBillNo('');
      setLookupMessage(null);

      await loadBills();
    } catch (err: any) {
      alert(err?.message || 'Error generating bill');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'Sr. No.': 1,
        'Container': 'USSI-139',
        'Receipt No.': '260528007',
        'Main Marka': '',
        'Sub Marka': 'HA-AGG',
        'Party / Purchaser': 'General Party',
        'Commodity': 'Motorcycle chain',
        'Cartons (CTN)': 160,
        'Billing Unit (Pcs/KG/Cartons)': 'Pcs',
        'HSN Code': '94054900',
        'IGST (%)': 18,
        'Quantity pcs': 2318,
        'Quantity kg': 3847,
        'Taxable Value': 281637,
      },
      {
        'Sr. No.': 2,
        'Container': 'USSI-145',
        'Receipt No.': '260626013',
        'Main Marka': '',
        'Sub Marka': 'GTC-SD-1BLK',
        'Party / Purchaser': 'General Party',
        'Commodity': 'Electronics',
        'Cartons (CTN)': 100,
        'Billing Unit (Pcs/KG/Cartons)': 'Cartons',
        'HSN Code': '85444299',
        'IGST (%)': 18,
        'Quantity pcs': 7727,
        'Quantity kg': 1580,
        'Taxable Value': 51360.23,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Billing_Template');
    XLSX.writeFile(wb, 'USI_Biller_Template.xlsx');
  };

  // Handle Excel File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    setBulkStatusMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          setBulkStatusMsg({ type: 'error', text: 'Excel sheet is empty.' });
          setIsParsingExcel(false);
          return;
        }

        const normalized = rows.map((r, idx) => {
          const getVal = (candidates: string[]) => {
            for (const key of Object.keys(r)) {
              const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const c of candidates) {
                if (cleanKey === c.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                  return r[key];
                }
              }
            }
            return '';
          };

          const receipt = String(getVal(['receipt no', 'receeipt no', 'receipt', 'bill no', 'receiptno'])).trim();
          const container = String(getVal(['container', 'containerno', 'container alias'])).trim();
          const mainMarka = String(getVal(['main marka', 'mainmarka', 'marka'])).trim();
          const subMarka = String(getVal(['sub marka', 'submarka'])).trim();
          const party = String(getVal(['party / purchaser', 'party', 'purchaser', 'consignee'])).trim();
          const commodity = String(getVal(['commodity', 'english', 'description', 'goods', 'item name', 'item description'])).trim();
          const hsnCode = String(getVal(['hsn code', 'hsn', 'hsncode'])).trim();
          const igst = Number(getVal(['igst', 'igst %', 'tax rate'])) || 18;

          const cartons = Number(getVal(['cartons (ctn)', 'cartons', 'ctn', 'quantity'])) || 0;
          const rawUnit = String(getVal(['billing unit (pcs/kg/cartons)', 'billing unit', 'unit', 'per', 'uom'])).trim().toLowerCase();
          const bUnit: 'Pcs' | 'KG' | 'Cartons' = rawUnit.includes('kg') ? 'KG' : rawUnit.includes('carton') || rawUnit.includes('ctn') ? 'Cartons' : 'Pcs';

          const pcs = Number(getVal(['quantity pcs', 'quntity pcs', 'pcs'])) || 0;
          const kg = Number(getVal(['quantity kg', 'weight kg', 'weight', 'kg', 'gross weight'])) || 0;
          const taxable = Number(getVal(['taxable', 'taxable value', 'amount', 'taxable amt'])) || 0;
          const rate = Number(getVal(['rate', 'item rate', 'price', 'unit rate', 'unit price'])) || 0;
          const vehicleNumber = String(getVal(['vehicle no', 'vehicle number', 'vehicle', 'truck no', 'gadi no', 'lorry no', 'gaadi no'])).trim();
          const destination = String(getVal(['destination', 'dest', 'place of supply'])).trim();

          const igstAmt = Number((taxable * (igst / 100)).toFixed(2));
          const total = Number((taxable + igstAmt).toFixed(2));

          return {
            srNo: idx + 1,
            receipt,
            container,
            mainMarka,
            subMarka,
            party,
            commodity,
            cartons,
            billingUnit: bUnit,
            hsnCode,
            igst,
            rate,
            vehicleNumber,
            destination,
            quantityPcs: pcs,
            quantityKg: kg,
            taxableValue: taxable,
            igstAmount: igstAmt,
            totalAmount: total,
            isValid: Boolean(receipt),
          };
        });

        setExcelRows(normalized);
        setBulkStatusMsg({
          type: 'success',
          text: `Parsed ${normalized.length} rows from file. Ready to generate bills!`,
        });
      } catch (err: any) {
        setBulkStatusMsg({ type: 'error', text: `Failed to parse Excel: ${err?.message}` });
      } finally {
        setIsParsingExcel(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit Bulk Bills from Parsed Excel
  const handleBulkSubmit = async () => {
    if (excelRows.length === 0) return;

    setIsUploadingBulk(true);
    setBulkStatusMsg(null);

    try {
      // Group rows by receipt so multi-item rows are grouped into a single bill with items[]
      const groupedMap = new Map<string, any[]>();
      for (const r of excelRows) {
        if (!groupedMap.has(r.receipt)) {
          groupedMap.set(r.receipt, []);
        }
        groupedMap.get(r.receipt)!.push(r);
      }

      const payload = Array.from(groupedMap.entries()).map(([receipt, rows]) => {
        const primary = rows[0];
        const isMultiItem = rows.length > 1;
        const totalTaxable = rows.reduce((sum, r) => sum + (Number(r.taxableValue) || 0), 0);
        const totalPcs = rows.reduce((sum, r) => sum + (Number(r.quantityPcs) || 0), 0);
        const totalKg = rows.reduce((sum, r) => sum + (Number(r.quantityKg) || 0), 0);
        const totalCtns = rows.reduce((sum, r) => sum + (Number(r.cartons) || 0), 0);

        const items = rows.map((r, idx) => ({
          itemNo: idx + 1,
          description: r.commodity || `Item ${idx + 1}`,
          hsnCode: r.hsnCode || primary.hsnCode || '9997',
          quantity: r.quantityPcs || r.quantityKg || r.cartons || 1,
          unit: r.billingUnit || primary.billingUnit || 'Pcs',
          rate: r.rate || (r.taxableValue && (r.quantityPcs || r.quantityKg || r.cartons) ? Number((r.taxableValue / (r.quantityPcs || r.quantityKg || r.cartons)).toFixed(2)) : 0),
          amount: Number(r.taxableValue) || 0,
        }));

        return {
          receipt,
          container: primary.container,
          mainMarka: primary.mainMarka,
          subMarka: primary.subMarka,
          party: primary.party,
          commodity: isMultiItem ? rows.map((r) => r.commodity).filter(Boolean).join(', ') : primary.commodity,
          hsnCode: primary.hsnCode,
          igst: primary.igst,
          billingUnit: primary.billingUnit || 'Pcs',
          totalCartons: totalCtns || primary.cartons || 0,
          quantityPcs: totalPcs || primary.quantityPcs,
          quantityKg: totalKg || primary.quantityKg,
          taxableValue: totalTaxable || primary.taxableValue,
          rate: primary.rate || 0,
          vehicleNumber: primary.vehicleNumber || undefined,
          destination: primary.destination || undefined,
          items: isMultiItem ? items : undefined,

          // Apply selected seller
          sellerId: currentSeller?._id || '',
          sellerName: currentSeller?.name || 'NORDEX INTERNATIONAL',
          sellerGstin: currentSeller?.gstin || '',
          sellerAddress: currentSeller?.address || '',
          sellerCity: currentSeller?.city || '',
          sellerPincode: currentSeller?.pincode || '',
          sellerState: currentSeller?.state || 'Delhi',
          sellerStateCode: currentSeller?.stateCode || '07',
          sellerPhone: currentSeller?.phone || '',
          sellerEmail: currentSeller?.email || '',
        };
      });

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk generation failed');

      setBulkStatusMsg({
        type: 'success',
        text: `Success! ${data.processedCount || payload.length} bills generated with Seller '${currentSeller?.name || 'NORDEX INTERNATIONAL'}'.`,
      });

      setExcelRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadBills();
    } catch (err: any) {
      setBulkStatusMsg({ type: 'error', text: err?.message || 'Failed to submit bulk bills' });
    } finally {
      setIsUploadingBulk(false);
    }
  };

  // Delete Bill
  const handleDeleteBill = async (id: string, rNo: string) => {
    if (!confirm(`Are you sure you want to delete bill for Receipt #${rNo}?`)) return;

    try {
      const res = await fetch(`/api/billing?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBills((prev) => prev.filter((b) => b._id !== id));
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (statusFilter === 'pending' && b.isDispatched) return false;
      if (statusFilter === 'dispatched' && !b.isDispatched) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.receipt.toLowerCase().includes(q) ||
        b.billNumber.toLowerCase().includes(q) ||
        (b.party && b.party.toLowerCase().includes(q)) ||
        (b.purchaserName && b.purchaserName.toLowerCase().includes(q)) ||
        (b.sellerName && b.sellerName.toLowerCase().includes(q)) ||
        (b.mainMarka && b.mainMarka.toLowerCase().includes(q)) ||
        (b.subMarka && b.subMarka.toLowerCase().includes(q)) ||
        (b.container && b.container.toLowerCase().includes(q)) ||
        (b.hsnCode && b.hsnCode.toLowerCase().includes(q)) ||
        (b.vehicleNumber && b.vehicleNumber.toLowerCase().includes(q))
      );
    });
  }, [bills, searchQuery, statusFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalPcs = 0;
    let totalKg = 0;
    let totalTaxable = 0;
    let pendingCount = 0;

    for (const b of bills) {
      totalPcs += Number(b.quantityPcs) || 0;
      totalKg += Number(b.quantityKg) || 0;
      totalTaxable += Number(b.taxableValue) || 0;
      if (!b.isDispatched) pendingCount++;
    }

    return {
      totalBills: bills.length,
      pendingCount,
      totalPcs,
      totalKg,
      totalTaxable,
    };
  }, [bills]);

  // Handle Logout
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Top Header */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-base text-white tracking-tight">US INTERNATIONAL</span>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 rounded-full">
                  Biller Portal (बिलर)
                </span>
              </div>
              <p className="text-xs text-slate-400">Container Selection, Excel Download, Billing Units (Pcs/KG/CTN) & Bills</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href="/dispatcher"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dispatcher View</span>
            </Link>
            <Link
              href="/admin"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
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
        {/* CONTAINER SELECTION & EXCEL DOWNLOAD CARD (User Workflow Feature) */}
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
                <Ship className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                  <span>कंटेनर डेटा डाउनलोड करें (Container Billing Workflow)</span>
                </div>
                <h2 className="text-sm font-black text-white">
                  कंटेनर चुनें, उसका डेटा एक्सेल में डाउनलोड करें, HSN/Tax भरकर वापस अपलोड करें
                </h2>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  list="biller-containers-list"
                  value={selectedDownloadContainer}
                  onChange={(e) => setSelectedDownloadContainer(e.target.value)}
                  placeholder="कंटेनर नं. टाइप करें (e.g. 208, USSI-139)"
                  className="w-48 sm:w-56 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-amber-500/50 text-xs font-black text-amber-300 placeholder-slate-500 focus:ring-2 focus:ring-amber-500 outline-none uppercase"
                />
                <datalist id="biller-containers-list">
                  {containersList.map((c) => (
                    <option key={c.container} value={c.container}>
                      {c.container} ({c.shipmentCount || 0} shipments)
                    </option>
                  ))}
                </datalist>
              </div>

              <select
                value={selectedDownloadContainer}
                onChange={(e) => setSelectedDownloadContainer(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-300 focus:ring-2 focus:ring-amber-500 outline-none max-w-[180px]"
              >
                <option value="">-- Choose Container --</option>
                {containersList.map((c) => (
                  <option key={c.container} value={c.container}>
                    {c.container} ({c.shipmentCount || 0} Shipments)
                  </option>
                ))}
              </select>

              <button
                onClick={handleDownloadContainerExcel}
                disabled={isDownloadingContainer || !selectedDownloadContainer.trim()}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloadingContainer ? 'Preparing Excel...' : 'Download Container Excel'}</span>
              </button>
            </div>
          </div>

          {/* Quick Container Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[11px] text-slate-500 font-semibold flex-shrink-0">Recent Containers:</span>
            {containersList.slice(0, 7).map((c) => (
              <button
                key={c.container}
                onClick={() => setSelectedDownloadContainer(c.container)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex-shrink-0 ${
                  selectedDownloadContainer.toLowerCase() === c.container.toLowerCase()
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                {c.container}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">1</span>
              <span>कंटेनर सेलेक्ट करें (जैसे USSI-139 / 208)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">2</span>
              <span>एक्सेल में HSN, IGST, Unit (Pcs/KG/CTN) व Taxable भरें</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">3</span>
              <span>अपडेटेड एक्सेल नीचे अपलोड करें — तुरंत सारे बिल जनरेट!</span>
            </div>
          </div>
        </div>

        {/* SELLER PARTY SELECTION & MANAGER BAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-2xl text-sky-400 mt-0.5">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Billing Company / Seller (सेलर पार्टी - इनवॉइस हेडर)
                </span>
                {currentSeller?.isDefault && (
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 font-bold px-2 py-0.5 rounded-full border border-sky-500/30">
                    Default
                  </span>
                )}
              </div>

              <div className="text-base font-black text-white flex flex-wrap items-center gap-2 mt-0.5">
                <span>{currentSeller?.name || 'Loading Sellers...'}</span>
                {currentSeller?.gstin && (
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-800/40">
                    GSTIN: {currentSeller.gstin}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 mt-1">
                {currentSeller?.address || 'Address'}
                {currentSeller?.city ? `, ${currentSeller.city}` : ''}
                {currentSeller?.state ? `, ${currentSeller.state}` : ''}
                {currentSeller?.pincode ? ` - ${currentSeller.pincode}` : ''}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                {currentSeller?.phone && (
                  <span className="flex items-center space-x-1 text-slate-300">
                    <Phone className="w-3 h-3 text-sky-400" />
                    <span>{currentSeller.phone}</span>
                  </span>
                )}
                {currentSeller?.email && (
                  <span className="flex items-center space-x-1 text-slate-300">
                    <Mail className="w-3 h-3 text-sky-400" />
                    <span>{currentSeller.email}</span>
                  </span>
                )}
                {currentSeller?.stateCode && (
                  <span className="text-slate-400 font-mono">
                    State Code: {currentSeller.stateCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSellerId}
              onChange={(e) => setSelectedSellerId(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {sellers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} {s.gstin ? `(${s.gstin})` : ''} {s.isDefault ? '★' : ''}
                </option>
              ))}
            </select>

            {currentSeller && (
              <button
                type="button"
                onClick={() => openEditSellerModal(currentSeller)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                title="Edit current company details"
              >
                <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                <span>Edit Company</span>
              </button>
            )}

            <button
              type="button"
              onClick={openNewSellerModal}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-sky-950/30"
              title="Add a new billing company"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Company</span>
            </button>

            <button
              type="button"
              onClick={openMarkaModal}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow-lg shadow-amber-950/40"
              title="Manage saved Consignee and Buyer addresses for each Marka"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>मार्का एड्रेस डायरेक्टरी (Marka Addresses)</span>
            </button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Total Bills</span>
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{metrics.totalBills}</div>
            <span className="text-[11px] text-slate-500">Receipts processed</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Awaiting Dispatch</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">{metrics.pendingCount}</div>
            <span className="text-[11px] text-slate-500">Without vehicle no.</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Total Pieces</span>
              <Box className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300">{metrics.totalPcs.toLocaleString('en-IN')}</div>
            <span className="text-[11px] text-slate-500">Quantity (Pcs)</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Total Weight (KG)</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black text-cyan-300">{metrics.totalKg.toLocaleString('en-IN')}</div>
            <span className="text-[11px] text-slate-500">Quantity (KG)</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Taxable Total</span>
              <span className="text-emerald-400 font-bold">₹</span>
            </div>
            <div className="text-xl font-black text-emerald-400 truncate">
              ₹{metrics.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-slate-500">Taxable amount</span>
          </div>
        </div>

        {/* Action Tabs: Excel Bulk Upload vs Single Manual Entry */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('excel')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition ${
                  activeTab === 'excel'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>एक्सेल बल्क बिलिंग (Excel Bulk Upload)</span>
              </button>

              <button
                onClick={() => setActiveTab('manual')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition ${
                  activeTab === 'manual'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>सिंगल बिल एंट्री (Single Entry)</span>
              </button>
            </div>

            {activeTab === 'excel' && (
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Blank Sample Template (.xlsx)</span>
              </button>
            )}
          </div>

          {/* TAB 1: EXCEL BULK UPLOAD */}
          {activeTab === 'excel' && (
            <div className="space-y-6">
              <div className="p-4 bg-sky-950/40 border border-sky-800/50 rounded-2xl text-xs text-sky-200 flex items-center justify-between">
                <div>
                  <strong className="text-white">Active Billing Entity:</strong> {currentSeller?.name} (GSTIN: {currentSeller?.gstin || 'URP'})
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    All bills generated in this batch will be billed from this seller party.
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-sky-500/20 text-sky-300 rounded-lg font-bold text-[11px]">
                  Billed By {currentSeller?.name?.split(' ')[0]}
                </span>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-3xl p-8 text-center transition bg-slate-950/50">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                  id="excel-file-input"
                />
                <label
                  htmlFor="excel-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-3"
                >
                  <div className="p-4 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/30 shadow-inner">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      Click to choose updated Excel file or drag & drop here
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload the container manifest you downloaded and edited, or any custom sheet
                    </p>
                  </div>
                  <span className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition border border-slate-700">
                    Browse File (.xlsx, .csv)
                  </span>
                </label>
              </div>

              {/* Status Message */}
              {bulkStatusMsg && (
                <div
                  className={`p-4 rounded-2xl text-xs font-semibold flex items-center space-x-2.5 ${
                    bulkStatusMsg.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/60 border border-red-800 text-red-300'
                  }`}
                >
                  {bulkStatusMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{bulkStatusMsg.text}</span>
                </div>
              )}

              {/* Preview Table if rows parsed */}
              {excelRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-300">
                      Preview of Uploaded Data ({excelRows.length} Rows):
                    </div>
                    <button
                      onClick={handleBulkSubmit}
                      disabled={isUploadingBulk}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-950/40 flex items-center space-x-2 disabled:opacity-50"
                    >
                      {isUploadingBulk ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Generating Bulk Bills...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Generate All {excelRows.length} Bills in Bulk (सारे बिल जनरेट करें)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-950 text-slate-400 sticky top-0">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">Receipt No.</th>
                          <th className="p-3">Marka</th>
                          <th className="p-3 text-center">Unit</th>
                          <th className="p-3 text-center">Cartons</th>
                          <th className="p-3">HSN Code</th>
                          <th className="p-3 text-center">IGST</th>
                          <th className="p-3 text-right">Qty (Pcs)</th>
                          <th className="p-3 text-right">Qty (KG)</th>
                          <th className="p-3 text-right">Taxable</th>
                          <th className="p-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                        {excelRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-800/40">
                            <td className="p-3 text-slate-500">{r.srNo}</td>
                            <td className="p-3 font-bold text-white">{r.receipt}</td>
                            <td className="p-3 font-bold text-cyan-300">{r.mainMarka || r.subMarka || '—'}</td>
                            <td className="p-3 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-300">
                                {r.billingUnit || 'Pcs'}
                              </span>
                            </td>
                            <td className="p-3 text-center text-slate-300">{r.cartons} CTN</td>
                            <td className="p-3 text-slate-300">{r.hsnCode || 'N/A'}</td>
                            <td className="p-3 text-center text-slate-300">{r.igst}%</td>
                            <td className="p-3 text-right text-purple-300 font-semibold">{r.quantityPcs.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-cyan-300 font-semibold">{r.quantityKg.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-emerald-400 font-semibold">₹{r.taxableValue.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right text-white font-bold">₹{r.totalAmount.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL SINGLE ENTRY */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-6">
              {manualSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{manualSuccessMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCascade}
                    className="px-3 py-1 bg-emerald-800/60 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition"
                  >
                    + Create Another Bill
                  </button>
                </div>
              )}

              {/* STEP 1: CARGO CASCADE SELECTION (Container -> Marka -> Receipt) */}
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                      <Ship className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                        Step 1: Select Cargo from Manifest (कार्गो चुनें: Container ➔ Marka ➔ Receipt)
                      </div>
                      <p className="text-[11px] text-slate-400">
                        कंटेनर चुनें, फिर मार्का चुनें — रिसीट और कार्गो डिटेल्स अपने-आप भर जाएंगी
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetCascade}
                    className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center space-x-1 transition self-start sm:self-auto"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Clear / Reset Selection</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Container Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>1. Container (कंटेनर नंबर)</span>
                      {singleContainer && (
                        <span className="text-[10px] text-amber-400 font-mono">Selected: {singleContainer}</span>
                      )}
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        list="single-containers-list"
                        value={singleContainer}
                        onChange={(e) => handleSingleContainerChange(e.target.value)}
                        placeholder="Type (e.g. 208, USSI-139)"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-amber-300 font-bold uppercase focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                      <datalist id="single-containers-list">
                        {containersList.map((c) => (
                          <option key={c.container} value={c.container}>
                            {c.container} ({c.shipmentCount || 0} shipments)
                          </option>
                        ))}
                      </datalist>
                      <select
                        value={singleContainer}
                        onChange={(e) => handleSingleContainerChange(e.target.value)}
                        className="px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-amber-500 outline-none max-w-[130px]"
                      >
                        <option value="">All Containers</option>
                        {containersList.map((c) => (
                          <option key={c.container} value={c.container}>
                            {c.container}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quick chips for top containers */}
                    <div className="flex items-center space-x-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-thin">
                      {containersList.slice(0, 5).map((c) => (
                        <button
                          key={c.container}
                          type="button"
                          onClick={() => handleSingleContainerChange(c.container)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex-shrink-0 ${
                            singleContainer.toLowerCase() === c.container.toLowerCase()
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {c.container}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Marka Selector & Multi-Marka Picker */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                        <span>2. Marka (मार्का चुनें) *</span>
                        {selectedMarkas.length > 1 && (
                          <span className="px-1.5 py-0.2 bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-bold rounded text-[10px]">
                            {selectedMarkas.length} Multi-Selected
                          </span>
                        )}
                      </label>
                      {selectedMarkas.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMarkas([]);
                            setSingleSelectedMarka('');
                            setMainMarka('');
                            setMarkaCargoItems([]);
                          }}
                          className="text-[10px] text-slate-400 hover:text-red-400 underline"
                        >
                          Clear ({selectedMarkas.length})
                        </button>
                      )}
                    </div>

                    <select
                      value={singleSelectedMarka}
                      onChange={(e) => {
                        const m = e.target.value;
                        if (m) handleToggleMarka(m);
                      }}
                      disabled={isLoadingCascade}
                      className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-xs font-bold text-cyan-300 focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                      <option value="">-- मार्का चुनें / जोड़ें (Choose or Add Marka) --</option>
                      {singleAvailableMarkas.map((m: any, idx: number) => {
                        const mName = typeof m === 'string' ? m : m.marka;
                        const countText = m.count ? ` (${m.count} shipments, ${m.totalCartons || 0} CTN)` : '';
                        const isChosen = selectedMarkas.includes(mName);
                        return (
                          <option key={idx} value={mName}>
                            {isChosen ? '✓ ' : ''}{mName} {countText}
                          </option>
                        );
                      })}
                    </select>

                    {/* Quick Multi-Marka Selection Chips */}
                    {singleAvailableMarkas.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                          <span>मल्टीपल मार्का सेलेक्ट करें:</span>
                          <span className="text-[10px] text-cyan-400">
                            {selectedMarkas.length} मार्का चुने गए
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5 scrollbar-thin">
                          {singleAvailableMarkas.map((m: any, idx: number) => {
                            const mName = typeof m === 'string' ? m : m.marka;
                            const isChosen = selectedMarkas.includes(mName);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleToggleMarka(mName)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 border ${
                                  isChosen
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-sm'
                                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <span>{isChosen ? '✓' : '+'}</span>
                                <span className="font-mono">{mName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Receipt Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>3. Receipt No. (रिसीट नंबर) *</span>
                      {isLookingUp && (
                        <span className="text-[10px] text-amber-400 animate-pulse">Looking up...</span>
                      )}
                    </label>
                    {singleAvailableReceipts.length > 1 ? (
                      <select
                        value={singleSelectedReceipt}
                        onChange={(e) => handleSingleReceiptSelect(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-purple-500/50 rounded-xl text-xs font-bold text-purple-200 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="">-- Choose from {singleAvailableReceipts.length} Receipts --</option>
                        {singleAvailableReceipts.map((s: any) => (
                          <option key={s.receipt} value={s.receipt}>
                            #{s.receipt} — {s.cartons} CTN, {s.weightKg} KG ({s.commodity || 'Cargo'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={receiptNo}
                        onChange={(e) => {
                          setReceiptNo(e.target.value);
                          setSingleSelectedReceipt(e.target.value);
                        }}
                        onBlur={() => handleReceiptLookup(receiptNo)}
                        placeholder="e.g. 260528007"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                      />
                    )}
                    <p className="text-[10px] text-slate-500">
                      Auto-filled when Marka is picked, or type receipt directly
                    </p>
                  </div>
                </div>

                {/* Auto-fill Status Banner */}
                {lookupMessage && (
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{lookupMessage}</span>
                    </div>
                    {receiptNo && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                        Receipt: #{receiptNo}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2: BILLING CONFIGURATION & LINE ITEMS (बिलिंग कॉन्फ़िगरेशन व वस्तुएं) */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-sky-400">
                        Step 2: Billing Details & Items (बिलिंग डिटेल्स & वस्तुएं)
                      </div>
                      <p className="text-[11px] text-slate-400">
                        रेफरेंस इनवॉइस फॉर्मेट: सेलर, गाड़ी नंबर, ई-वे बिल और वस्तुएं (Item, HSN, Unit, Quantity, Rate)
                      </p>
                    </div>
                  </div>

                  {/* E-Way Bill Requirement Indicator */}
                  <div className="flex items-center space-x-2">
                    {isEWayBillMissing ? (
                      <span className="px-3 py-1 bg-red-950/80 border border-red-500/60 text-red-300 font-bold rounded-xl text-[11px] animate-pulse flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span>E-Way Bill Mandatory ({isDeliveryInDelhi ? 'Delhi > ₹1L' : 'Outside Delhi > ₹50k'})</span>
                      </span>
                    ) : formEWayBillNo.trim() ? (
                      <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-bold rounded-xl text-[11px] flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>E-Way Bill: {formEWayBillNo.trim()}</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-900 border border-slate-800 text-slate-400 font-medium rounded-xl text-[11px]">
                        E-Way Bill Optional ({isDeliveryInDelhi ? 'Under ₹1,00,000' : 'Under ₹50,000'})
                      </span>
                    )}
                  </div>
                </div>

                {/* Grid 1: Seller Party, Vehicle Number, Destination, E-Way Bill No. */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                  {/* Seller Party */}
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-bold text-sky-300 flex items-center justify-between">
                      <span>1. Seller Entity (सेलर पार्टी) *</span>
                      {currentSeller?.gstin && (
                        <span className="text-[10px] text-slate-400 font-mono">{currentSeller.gstin}</span>
                      )}
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={selectedSellerId}
                        onChange={(e) => setSelectedSellerId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        {sellers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name} {s.isDefault ? '★' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowSellerModal(true)}
                        className="px-2 py-2 bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white rounded-xl text-xs font-bold transition flex-shrink-0"
                        title="Add New Seller Company"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Vehicle Number (गाड़ी नंबर - Biller or Dispatcher) */}
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                      <span className="flex items-center space-x-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>2. गाड़ी नंबर (Vehicle No.)</span>
                      </span>
                      <span className="text-[10px] text-slate-400">बिलर / डिस्पैचर</span>
                    </label>
                    <input
                      type="text"
                      value={formVehicleNumber}
                      onChange={(e) => setFormVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. DL 01 AB 1234"
                      className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  {/* Destination */}
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>3. Destination (गंतव्य)</span>
                      <span className="text-[10px] text-slate-400">Delivery City</span>
                    </label>
                    <input
                      type="text"
                      value={formDestination}
                      onChange={(e) => setFormDestination(e.target.value.toUpperCase())}
                      placeholder="e.g. GUWAHATI / DELHI"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* e-Way Bill No. */}
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-bold text-amber-300 flex items-center justify-between">
                      <span>4. e-Way Bill No.</span>
                      {isEWayBillRequired && (
                        <span className="text-[10px] text-red-400 font-black uppercase tracking-wider">
                          * MANDATORY
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formEWayBillNo}
                      onChange={(e) => setFormEWayBillNo(e.target.value)}
                      placeholder="e.g. 751656900676"
                      className={`w-full px-3 py-2 bg-slate-900 rounded-xl text-xs font-mono font-bold tracking-wider focus:outline-none focus:ring-2 ${
                        isEWayBillMissing
                          ? 'border-2 border-red-500 text-red-200 focus:ring-red-500'
                          : 'border border-slate-700 text-white focus:ring-amber-500'
                      }`}
                    />
                  </div>
                </div>

                {/* E-Way Bill Rule Alert Banner */}
                {isEWayBillMissing && (
                  <div className="p-3 bg-red-950/70 border border-red-500/60 rounded-2xl flex items-center space-x-2.5 text-xs text-red-200">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div>
                      <strong className="block text-red-300 font-black">
                        ⚠️ ई-वे बिल अनिवार्य है (E-Way Bill Number Required)
                      </strong>
                      <span>
                        {isDeliveryInDelhi
                          ? `दिल्ली के भीतर कुल बिल राशि ₹${calculatedTotalAmt.toLocaleString('en-IN')} (सीमा ₹1,00,000 से अधिक) है।`
                          : `आउटसाइड दिल्ली (${consigneeState || 'Other State'}) के लिए कुल बिल राशि ₹${calculatedTotalAmt.toLocaleString('en-IN')} (सीमा ₹50,000 से अधिक) है।`
                        } कृपया ऊपर दिए गए बॉक्स में वैध E-Way Bill No. दर्ज करें, तभी बिल जेनरेट होगा।
                      </span>
                    </div>
                  </div>
                )}

                {/* Section B: Line Items Builder (Item Name Selection, HSN, Quantity, Unit, Rate) */}
                <div className="p-4 bg-slate-900/90 border border-amber-500/40 rounded-2xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div className="flex items-center space-x-2">
                      <ListPlus className="w-5 h-5 text-amber-400" />
                      <div>
                        <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                          Invoice Items Builder (आइटम चुनें, HSN, PCS/KG क्वांटिटी व दर)
                        </div>
                        <p className="text-[11px] text-slate-400">
                          मार्का से ऑटो-लोड हुआ आइटम चुनें या बदलें, HSN ऑल्टर करें, PCS/KG क्वांटिटी चुनें व दर भरें
                        </p>
                      </div>
                    </div>

                    {invoiceItems.length > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                        {invoiceItems.length} Items Added to Bill
                      </span>
                    )}
                  </div>

                  {/* 1. Item Name Selection: Dropdown + Quick Chips */}
                  <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center space-x-1.5">
                        <span className="text-amber-400">आइटम नेम चूज़ करें (Choose Item Name) *</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          (चूज़ करने के बाद नीचे टेक्स्ट बॉक्स में बदल भी सकते हैं)
                        </span>
                      </label>
                      {markaCargoItems.length > 0 && (
                        <span className="text-[10px] text-cyan-400 font-semibold">
                          {markaCargoItems.length} Cargo Items in Marka [{mainMarka || singleSelectedMarka}]
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Dropdown Selector */}
                      <select
                        value={selectedCargoDropdown}
                        onChange={(e) => handleChooseCargoItem(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-xs font-bold text-cyan-300 focus:ring-2 focus:ring-cyan-500 outline-none"
                      >
                        <option value="">-- चूज़ करें आइटम (Choose Item from List) --</option>
                        {markaCargoItems.length > 0 && (
                          <optgroup label="इस मार्का के तहत उपलब्ध आइटम्स (From Current Marka)">
                            {markaCargoItems.map((it, idx) => (
                              <option key={idx} value={it.description}>
                                {it.description} ({it.pcs} PCS / {it.weightKg} KG / {it.cartons} CTN)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="स्टैंडर्ड कैटलॉग आइटम्स (Standard Invoice Items)">
                          {COMMON_COMMODITIES.map((c, idx) => (
                            <option key={`comm-${idx}`} value={c.name}>
                              {c.name} (HSN: {c.hsn})
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      {/* Editable Text Field */}
                      <input
                        type="text"
                        value={lineDescription}
                        onChange={(e) => setLineDescription(e.target.value)}
                        placeholder="चूज़ करने के बाद यहाँ से बदल सकते हैं (Edit / Customize Description)"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                      />
                    </div>

                    {/* Quick Chips for Items in Marka */}
                    {markaCargoItems.length > 0 && (
                      <div className="flex items-center space-x-1.5 overflow-x-auto pt-1 scrollbar-thin">
                        <span className="text-[10px] text-slate-500 shrink-0">Quick Pick:</span>
                        {markaCargoItems.map((it, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleChooseCargoItem(it.description, it.hsnCode)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition shrink-0 ${
                              lineDescription.toLowerCase() === it.description.toLowerCase()
                                ? 'bg-cyan-500 text-slate-950 font-black'
                                : 'bg-slate-800 text-cyan-300 hover:bg-slate-700'
                            }`}
                          >
                            + {it.description} ({it.pcs} PCS)
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Item Configuration: HSN, Unit Selector, Quantity, Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                    {/* HSN / SAC Code */}
                    <div className="sm:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-amber-300">
                          HSN / SAC कोड *
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            openHsnModal(lineDescription || 'Goods', (hsn) => {
                              setLineHsn(hsn);
                              setHsnCode(hsn);
                            })
                          }
                          className="px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 rounded text-[9px] font-black transition flex items-center space-x-1"
                          title="आइटम के अनुसार HSN सर्च करें या सुझाव देखें"
                        >
                          <Search className="w-2.5 h-2.5" />
                          <span>🔍 HSN सुझाव / सर्च</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={lineHsn}
                        onChange={(e) => {
                          setLineHsn(e.target.value);
                          setHsnCode(e.target.value);
                        }}
                        placeholder="e.g. 39269099"
                        className="w-full px-3 py-2 bg-slate-900 border border-amber-500/50 rounded-xl text-xs text-amber-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      {/* Live HSN Suggestion Chips */}
                      {lineDescription.trim() && (
                        <div className="flex items-center space-x-1 overflow-x-auto pt-1.5 scrollbar-thin">
                          <span className="text-[9px] text-amber-400 font-bold shrink-0">सुझाव:</span>
                          {findHsnSuggestions(lineDescription).slice(0, 3).map((sug, sIdx) => (
                            <button
                              key={`sug-${sIdx}`}
                              type="button"
                              onClick={() => {
                                setLineHsn(sug.hsnCode);
                                setHsnCode(sug.hsnCode);
                                if (sug.gstRate) setIgstRate(sug.gstRate);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[9px] border font-mono transition shrink-0 ${
                                lineHsn === sug.hsnCode
                                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                                  : 'bg-slate-950 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                              }`}
                              title={sug.description}
                            >
                              {sug.hsnCode} ({sug.gstRate}%)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Unit Selector Pills (PCS / KG / CTN) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between mb-1">
                        <span>यूनिट (Unit) *</span>
                        <span className="text-[10px] text-cyan-400">ऑटो-फिल मात्रा</span>
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['PCS', 'KGS', 'CTN'] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => handleSelectUnit(u)}
                            className={`py-2 px-1 rounded-xl text-xs font-black transition flex items-center justify-center ${
                              lineUnit.toUpperCase() === u
                                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            {u === 'PCS' ? 'PCS' : u === 'KGS' ? 'KG' : 'CTN'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quantity (Auto-filled on unit select, completely alterable) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-purple-300 flex items-center justify-between mb-1">
                        <span>क्वांटिटी ({lineUnit}) *</span>
                        <span className="text-[10px] text-purple-400 font-normal">बदल सकते हैं</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lineQuantity}
                        onChange={(e) => setLineQuantity(e.target.value)}
                        placeholder={`e.g. ${lineUnit === 'PCS' ? '1134' : '120'}`}
                        className="w-full px-3 py-2 bg-slate-900 border border-purple-500/50 rounded-xl text-xs text-purple-200 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                      />
                    </div>

                    {/* Rate (₹ / Unit) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-sky-400 flex items-center justify-between mb-1">
                        <span>दर (Rate ₹ / {lineUnit}) *</span>
                        <span className="text-[10px] text-sky-400 font-semibold">प्रति यूनिट</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lineRate}
                        onChange={(e) => setLineRate(e.target.value)}
                        placeholder="e.g. 46.56"
                        className="w-full px-3 py-2 bg-slate-900 border border-sky-500/50 rounded-xl text-xs text-sky-300 font-black focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* ITEM PROPORTIONATE (आइटम प्रोपोर्शनेट - ऑप्शनल मोड) */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const nextState = !isProportionateEnabled;
                          setIsProportionateEnabled(nextState);
                          if (nextState) {
                            if (!propBaseCartons) setPropBaseCartons(String(currentBaseCtn || parseFloat(totalCartons) || ''));
                            if (!propBaseWeightKg) setPropBaseWeightKg(String(currentBaseKg || parseFloat(quantityKg) || ''));
                            if (!propBasePcs) setPropBasePcs(String(currentBasePcs || parseFloat(quantityPcs) || ''));
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 border shadow-sm ${
                          isProportionateEnabled
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : 'bg-slate-900/90 text-amber-300 hover:text-white border-amber-500/40 hover:bg-slate-800'
                        }`}
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>⚖️ {isProportionateEnabled ? 'आइटम प्रोपोर्शनेट सक्रिय (ON)' : 'आइटम प्रोपोर्शनेट करें (Item Proportionate)'}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-black/30">
                          {isProportionateEnabled ? 'क्लिक करके बंद करें' : 'वैकल्पिक / Optional'}
                        </span>
                      </button>

                      {isProportionateEnabled && (
                        <span className="text-[11px] text-amber-300 font-bold hidden sm:inline-block">
                          कार्टन, वजन या पीसेस के आधार पर स्वचालित अनुपात गणना
                        </span>
                      )}
                    </div>

                    {/* EXPANDABLE PROPORTIONATE CALCULATOR PANEL */}
                    {isProportionateEnabled && (
                      <div className="mt-2.5 p-3.5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-cyan-950/40 border border-amber-500/50 rounded-2xl space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
                          <div className="flex items-center space-x-2">
                            <Calculator className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-black text-amber-300">
                              आइटम प्रोपोर्शनेट कैलकुलेटर (Item Proportionate Calculator)
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            प्राइमरी यूनिट: <strong className="text-cyan-300 font-bold font-mono">{lineUnit}</strong>
                          </span>
                        </div>

                        {/* Base Totals of the Cargo / Marka */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-1">
                            1. माल का कुल बेस स्टॉक (Base Cargo Quantities):
                          </span>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <label className="text-[10px] text-slate-400 block">कुल कार्टन (Total CTN)</label>
                              <input
                                type="number"
                                step="any"
                                value={propBaseCartons}
                                onChange={(e) => setPropBaseCartons(e.target.value)}
                                placeholder="e.g. 50"
                                className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                              />
                            </div>
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <label className="text-[10px] text-slate-400 block">कुल वजन (Total KG)</label>
                              <input
                                type="number"
                                step="any"
                                value={propBaseWeightKg}
                                onChange={(e) => setPropBaseWeightKg(e.target.value)}
                                placeholder="e.g. 1000"
                                className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                              />
                            </div>
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <label className="text-[10px] text-slate-400 block">कुल पीसेस (Total PCS)</label>
                              <input
                                type="number"
                                step="any"
                                value={propBasePcs}
                                onChange={(e) => setPropBasePcs(e.target.value)}
                                placeholder="e.g. 5000"
                                className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Selection of Basis: By Cartons, By Pieces, By Weight */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-1">
                            2. किस आधार पर डिस्पैच कर रहे हैं? (Select Dispatch Basis):
                          </span>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setPropBasis('cartons')}
                              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 border ${
                                propBasis === 'cartons'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <span>📦 कार्टन अनुसार</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPropBasis('weight')}
                              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 border ${
                                propBasis === 'weight'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <span>⚖️ वजन (KG) अनुसार</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPropBasis('pcs')}
                              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 border ${
                                propBasis === 'pcs'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <span>🔢 पीसेस (PCS) अनुसार</span>
                            </button>
                          </div>
                        </div>

                        {/* Input for the selected basis and Live Result */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                          <div className="sm:col-span-5">
                            <label className="text-[10px] font-bold text-amber-300 block mb-1">
                              {propBasis === 'cartons'
                                ? '👉 भेजे जाने वाले कार्टन (Enter Cartons sending):'
                                : propBasis === 'weight'
                                ? '👉 भेजा जाने वाला वजन KG (Enter Weight KG sending):'
                                : '👉 भेजे जाने वाले पीसेस (Enter Pieces sending):'}
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={propInputValue}
                              onChange={(e) => setPropInputValue(e.target.value)}
                              placeholder={propBasis === 'cartons' ? 'e.g. 5' : propBasis === 'weight' ? 'e.g. 100' : 'e.g. 600'}
                              className="w-full px-3 py-2 bg-slate-950 border border-amber-500/60 rounded-xl text-white font-mono font-bold text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                          </div>

                          {/* Calculation Preview Box */}
                          {(() => {
                            const calc = calculateProportionate();
                            const pctStr = (calc.ratio * 100).toFixed(1);
                            return (
                              <div className="sm:col-span-7 bg-slate-950/90 border border-emerald-500/40 p-2.5 rounded-xl text-xs space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400">प्रोपोर्शनेट अनुपात:</span>
                                  <strong className="text-emerald-400 font-mono">{pctStr}% of Total Cargo</strong>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[11px] pt-0.5 border-t border-slate-800 font-mono">
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">कार्टन:</span>
                                    <strong className="text-cyan-300">{calc.ctn} CTN</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">वजन:</span>
                                    <strong className="text-cyan-300">{calc.kg} KG</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">पीसेस:</span>
                                    <strong className="text-cyan-300">{calc.pcs} PCS</strong>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                                  <span className="text-amber-300 font-bold text-[11px]">
                                    इनवॉइस मात्रा ({lineUnit}): <strong className="text-white font-mono text-sm">{calc.targetQty} {lineUnit}</strong>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleApplyProportionate}
                                    disabled={calc.targetQty <= 0}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-lg text-xs transition shadow flex items-center space-x-1"
                                  >
                                    <span>✓ लागू करें (Apply)</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Add Button & Calculated Item Subtotal */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-800">
                    <div className="text-xs text-slate-400">
                      Amount for this item:{' '}
                      <strong className="text-emerald-400 font-mono text-sm">
                        ₹
                        {(
                          (parseFloat(lineQuantity) || 0) * (parseFloat(lineRate) || 0)
                        ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddLineItem}
                      disabled={!lineDescription.trim() || !lineQuantity || !lineRate}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Item to Invoice (आइटम जोड़ें)</span>
                    </button>
                  </div>

                  {/* Added Items Table */}
                  {invoiceItems.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-800 mt-2">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="p-2.5 text-center w-12">Sl No.</th>
                            <th className="p-2.5">Description of Goods</th>
                            <th className="p-2.5">HSN/SAC</th>
                            <th className="p-2.5 text-right">Quantity</th>
                            <th className="p-2.5 text-center">Unit</th>
                            <th className="p-2.5 text-right">Rate (₹)</th>
                            <th className="p-2.5 text-right">Amount (₹)</th>
                            <th className="p-2.5 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-950/60 font-semibold">
                          {invoiceItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2.5 text-center text-slate-500 font-mono">{item.itemNo}</td>
                              <td className="p-2.5 font-bold text-white">{item.description}</td>
                              <td className="p-2.5 text-amber-300 font-mono">{item.hsnCode}</td>
                              <td className="p-2.5 text-right text-purple-300 font-mono">
                                {item.quantity.toLocaleString('en-IN')}
                              </td>
                              <td className="p-2.5 text-center text-slate-300 font-mono">{item.unit}</td>
                              <td className="p-2.5 text-right text-sky-300 font-mono">
                                ₹{item.rate.toFixed(2)}
                              </td>
                              <td className="p-2.5 text-right text-emerald-400 font-bold font-mono">
                                ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLineItem(idx)}
                                  className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition"
                                  title="Remove Item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-950 text-slate-200 border-t border-slate-800">
                          <tr>
                            <td colSpan={6} className="p-2.5 text-right font-black text-slate-400">
                              Total Taxable Subtotal (कुल योग):
                            </td>
                            <td className="p-2.5 text-right font-black text-emerald-400 text-sm font-mono">
                              ₹
                              {invoiceItems
                                .reduce((acc, it) => acc + it.amount, 0)
                                .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 3: CONSIGNEE (SHIP TO) & BUYER (BILL TO) DETAILS */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-violet-500/10 border border-violet-500/30 rounded-xl text-violet-400">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-violet-300 uppercase tracking-wider">
                        Step 3: Consignee & Buyer Details (कंसाइनी & बायर पार्टी विवरण)
                      </div>
                      <p className="text-[11px] text-slate-400">
                        PDF इनवॉइस के अनुसार: Consignee (Ship to) और Buyer (Bill to) पते
                      </p>
                    </div>
                  </div>

                  {/* Registered vs Unregistered Toggle */}
                  <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setRegistrationType('Registered')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        registrationType === 'Registered'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Registered (GSTIN)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegistrationType('Unregistered')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        registrationType === 'Unregistered'
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Unregistered (URP)
                    </button>
                  </div>
                </div>

                {/* Consignee (Ship to) Section */}
                <div className="space-y-3">
                  <div className="text-xs font-black text-sky-400 flex items-center space-x-1.5 uppercase tracking-wide">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Consignee / Shipped To (जहाँ माल डिलीवर होगा)</span>
                  </div>

                  {/* Marka-Wise Sending / Delivery Locations Selector */}
                  {(mainMarka || subMarka || singleSelectedMarka) && (
                    <div className="p-3.5 bg-slate-900/80 border border-cyan-500/40 rounded-2xl space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-cyan-300">
                              Marka-Wise Sending Locations (मार्का के सेंडिंग पते) — [{mainMarka || subMarka || singleSelectedMarka}]
                            </span>
                            <p className="text-[10px] text-slate-400">
                              एक मार्का में एक से ज़्यादा पते सेव कर सकते हैं। क्लिक करके तुरंत सेलेक्ट करें।
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNewLocTitle('');
                            setNewLocAddress('');
                            setNewLocCity('');
                            setNewLocState(consigneeState || 'Delhi');
                            setNewLocStateCode(consigneeStateCode || '07');
                            setNewLocPincode('');
                            setNewLocContactPerson(purchaserName || '');
                            setNewLocPhone(purchaserPhone || '');
                            setShowAddLocationModal(true);
                          }}
                          className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 self-start sm:self-auto shadow"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add New Sending Address (नया पता जोड़ें)</span>
                        </button>
                      </div>

                      {currentMarkaAddresses.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                          {currentMarkaAddresses.map((addr: any, idx: number) => {
                            const isSelected = selectedDeliveryAddressId === addr._id || (!selectedDeliveryAddressId && idx === 0);
                            return (
                              <div
                                key={addr._id || idx}
                                onClick={() => handleSelectDeliveryAddress(addr)}
                                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between ${
                                  isSelected
                                    ? 'bg-cyan-950/70 border-cyan-400 text-white shadow-md shadow-cyan-950/50'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-cyan-300 text-[11px] truncate">
                                      {addr.title || `Location ${idx + 1}`}
                                    </span>
                                    <div className="flex items-center space-x-1 shrink-0">
                                      {isSelected && (
                                        <span className="px-1.5 py-0.5 bg-cyan-500 text-slate-950 font-black rounded text-[9px]">
                                          चयनित
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenEditLocation(mainMarka || subMarka || singleSelectedMarka, addr);
                                        }}
                                        className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold rounded text-[10px] transition flex items-center space-x-1 border border-amber-500/30"
                                        title="एड्रेस एडिट करें (Edit Address)"
                                      >
                                        <Edit3 className="w-2.5 h-2.5" />
                                        <span>एडिट</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isDeletingLocationId === addr._id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteLocation(mainMarka || subMarka || singleSelectedMarka, addr._id);
                                        }}
                                        className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white font-bold rounded text-[10px] transition flex items-center space-x-1 border border-red-500/30"
                                        title="एड्रेस डिलीट करें (Delete Address)"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                        <span>डिलीट</span>
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-slate-200 line-clamp-2">{addr.address}</p>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between border-t border-slate-800/80 pt-1">
                                  <span className="font-semibold text-slate-300">{addr.city || addr.state || 'Delhi'} ({getStateCode(addr.stateCode || addr.state) || '07'})</span>
                                  {addr.phone && <span>📞 {addr.phone}</span>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectDeliveryAddress(addr)}
                                  className={`w-full mt-2 py-1 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                                    isSelected
                                      ? 'bg-cyan-500 text-slate-950 font-black'
                                      : 'bg-slate-900 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>{isSelected ? '✓ यह पता चुना हुआ है (Selected)' : 'इस पते पर डिस्पैच करें (Select)'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          इस मार्का के लिए कोई पूर्व-सहेजा गया पता नहीं मिला। नीचे पता भरें या "+ Add New Sending Address" दबाएँ।
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="text-xs text-slate-300 font-bold block mb-1">
                        Consignee / Party Legal Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={purchaserName}
                        onChange={(e) => setPurchaserName(e.target.value)}
                        placeholder="e.g. Radhey Trading Co."
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none font-semibold"
                      />
                    </div>

                    {registrationType === 'Registered' ? (
                      <div>
                        <label className="text-xs text-emerald-400 font-bold block mb-1">
                          Consignee GSTIN (15-digit GST) * (राज्य स्वतः सेट होगा)
                        </label>
                        <input
                          type="text"
                          required={registrationType === 'Registered'}
                          value={purchaserGstin}
                          onChange={(e) => handleConsigneeGstinChange(e.target.value)}
                          placeholder="07AAAAA0000A1Z5"
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-mono font-black uppercase focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-amber-400 font-bold block mb-1">
                          Registration Status
                        </label>
                        <div className="px-3.5 py-2.5 bg-slate-900 border border-amber-500/30 rounded-xl text-xs text-amber-300 font-semibold flex items-center justify-between">
                          <span>Unregistered Party (URP)</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 rounded font-mono">URP</span>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-slate-300 font-bold block mb-1">
                        Consignee Phone / Mobile
                      </label>
                      <input
                        type="text"
                        value={purchaserPhone}
                        onChange={(e) => setPurchaserPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-300 font-bold block mb-1">
                        Consignee Delivery Address (Ship to Address)
                      </label>
                      <input
                        type="text"
                        value={consigneeAddress || purchaserAddress}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConsigneeAddress(val);
                          setPurchaserAddress(val);
                          const detected = detectStateFromAddress(val);
                          if (detected) {
                            handleConsigneeStateChange(detected.name);
                          }
                        }}
                        placeholder="e.g. Shop No 4, Main Bazar, Agra"
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-300 font-bold block mb-1">State (राज्य)</label>
                        <select
                          value={consigneeState}
                          onChange={(e) => handleConsigneeStateChange(e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                        >
                          {INDIAN_STATES.map((st) => (
                            <option key={st.name} value={st.name}>
                              {st.name} ({st.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-300 font-bold block mb-1">State Code (ऑटो)</label>
                        <input
                          type="text"
                          value={consigneeStateCode}
                          onChange={(e) => handleConsigneeStateCodeChange(e.target.value)}
                          placeholder="07"
                          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* MARKA ADDRESS CONTROLS TOOLBAR: ADD, CHANGE / UPDATE, DELETE */}
                  {(mainMarka || subMarka || singleSelectedMarka) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/90 border border-cyan-500/30 rounded-2xl">
                      <div className="flex items-center space-x-1.5">
                        <MapPin className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-cyan-300">
                          डिस्पैच पता प्रबंधन (Marka Delivery Actions):
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 1. Add New Location */}
                        <button
                          type="button"
                          onClick={() => {
                            setNewLocTitle('');
                            setNewLocAddress('');
                            setNewLocCity('');
                            setNewLocState(consigneeState || 'Delhi');
                            setNewLocStateCode(consigneeStateCode || '07');
                            setNewLocPincode('');
                            setNewLocContactPerson(purchaserName || '');
                            setNewLocPhone(purchaserPhone || '');
                            setShowAddLocationModal(true);
                          }}
                          className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 border border-cyan-500/40 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ नया पता जोड़ें (Add Location)</span>
                        </button>

                        {/* 2. Change / Save / Update to Marka */}
                        <button
                          type="button"
                          disabled={isSavingMarkaDirect}
                          onClick={handleInstantSaveMarkaAddress}
                          className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 border border-emerald-500/40 shadow-sm"
                          title="इस फॉर्म में भरे गए पते को मार्का में सुरक्षित / अपडेट करें"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingMarkaDirect ? 'सेव हो रहा है...' : '💾 यह पता मार्का में सेव / बदलें (Update Address)'}</span>
                        </button>

                        {/* 3. Delete Selected Location */}
                        {selectedDeliveryAddressId && (
                          <button
                            type="button"
                            onClick={() => {
                              const m = mainMarka || subMarka || singleSelectedMarka;
                              if (m && selectedDeliveryAddressId) {
                                handleDeleteLocation(m, selectedDeliveryAddressId);
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 border border-red-500/30 shadow-sm"
                            title="चयनित पते को इस मार्का से हटाएं"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>🗑️ यह पता हटाएं (Delete)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Buyer (Bill to) Toggle & Fields */}
                <div className="border-t border-slate-800/80 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black text-amber-400 flex items-center space-x-1.5 uppercase tracking-wide">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Buyer / Billed To (जिसके नाम इनवॉइस बिल बनेगा)</span>
                    </div>

                    <label className="flex items-center space-x-2 cursor-pointer bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-800 transition">
                      <input
                        type="checkbox"
                        checked={sameAsConsignee}
                        onChange={(e) => setSameAsConsignee(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-300">
                        Same as Consignee (Ship to) / सेम खरीदार
                      </span>
                    </label>
                  </div>

                  {!sameAsConsignee && (
                    <div className="space-y-3 p-3.5 bg-slate-900/50 border border-slate-800 rounded-2xl">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-xs text-slate-300 font-bold block mb-1">
                            Buyer Legal Name
                          </label>
                          <input
                            type="text"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            placeholder="Buyer company / person name"
                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-300 font-bold block mb-1">
                            Buyer GSTIN / URP (राज्य स्वतः सेट होगा)
                          </label>
                          <input
                            type="text"
                            value={buyerGstin}
                            onChange={(e) => handleBuyerGstinChange(e.target.value)}
                            placeholder="Buyer 15-digit GSTIN"
                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div className="sm:col-span-2">
                          <label className="text-xs text-slate-300 font-bold block mb-1">
                            Buyer Billing Address
                          </label>
                          <input
                            type="text"
                            value={buyerAddress}
                            onChange={(e) => setBuyerAddress(e.target.value)}
                            placeholder="Buyer office / registered address"
                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-300 font-bold block mb-1">Buyer State (राज्य)</label>
                            <select
                              value={buyerState}
                              onChange={(e) => handleBuyerStateChange(e.target.value)}
                              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                            >
                              {INDIAN_STATES.map((st) => (
                                <option key={st.name} value={st.name}>
                                  {st.name} ({st.code})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-300 font-bold block mb-1">State Code (ऑटो)</label>
                            <input
                              type="text"
                              value={buyerStateCode}
                              onChange={(e) => setBuyerStateCode(e.target.value)}
                              placeholder="09"
                              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instant Save Marka Address Bar */}
                <div className="border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      मार्का: <strong className="text-white font-mono">{mainMarka || subMarka || singleSelectedMarka || 'कोई मार्का नहीं चुना'}</strong> के लिए पता सेव करें।
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isSavingMarkaDirect || !(mainMarka || subMarka || singleSelectedMarka)}
                      onClick={handleInstantSaveMarkaAddress}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow"
                    >
                      {isSavingMarkaDirect ? (
                        <span>Saving Address...</span>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Address for Marka [{mainMarka || subMarka || singleSelectedMarka || 'Marka'}]</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={openMarkaModal}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                    >
                      Directory
                    </button>
                  </div>
                </div>

                {markaSaveSuccess && (
                  <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{markaSaveSuccess}</span>
                  </div>
                )}
              </div>

              {/* STEP 4: CALCULATED SUMMARY BOX & GENERATE BUTTON */}
              <div className="flex flex-col space-y-3 bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl">
                {isEWayBillMissing && (
                  <div className="w-full text-xs text-rose-300 font-bold bg-rose-950/80 border border-rose-500/60 rounded-2xl p-3 flex items-start space-x-2.5 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <span>
                        {isDeliveryInDelhi
                          ? `⚠️ ई-वे बिल आवश्यक: दिल्ली के अंदर कुल बिल राशि ₹1,00,000 से अधिक (वर्तमान: ₹${calculatedTotalAmt.toLocaleString('en-IN')}) होने पर E-Way Bill Number दर्ज करना अनिवार्य है!`
                          : `⚠️ ई-वे बिल आवश्यक: दिल्ली से बाहर (Inter-State) कुल बिल राशि ₹50,000 से अधिक (वर्तमान: ₹${calculatedTotalAmt.toLocaleString('en-IN')}) होने पर E-Way Bill Number दर्ज करना अनिवार्य है!`}
                      </span>
                      <p className="text-[11px] text-rose-400/90 font-normal mt-0.5">
                        कृपया Step 2 में E-Way Bill No. भरें ताकि बिल जनरेट हो सके।
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-6 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Taxable Amount:</span>
                      <span className="font-black text-white text-base">
                        ₹{invoiceTaxableTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {isDeliveryInDelhi ? (
                      <div className="flex items-center space-x-3 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-sky-500/30">
                        <div>
                          <span className="text-sky-300 block text-[10px] font-bold">CGST ({halfGstRate}%):</span>
                          <span className="font-black text-sky-400 text-sm">
                            ₹{calculatedCgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="border-l border-slate-700 pl-3">
                          <span className="text-sky-300 block text-[10px] font-bold">SGST ({halfGstRate}%):</span>
                          <span className="font-black text-sky-400 text-sm">
                            ₹{calculatedSgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-bold self-center">
                          Intra-Delhi
                        </span>
                      </div>
                    ) : (
                      <div className="bg-slate-900/90 px-3 py-1.5 rounded-xl border border-amber-500/30">
                        <div className="flex items-center space-x-2">
                          <span className="text-amber-300 block text-[10px] font-bold">IGST ({totalGstRate}%):</span>
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                            Outside Delhi
                          </span>
                        </div>
                        <span className="font-black text-amber-400 text-sm">
                          ₹{calculatedIgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div className="border-l border-slate-800 pl-4">
                      <span className="text-slate-400 block text-[11px]">Total Invoice Amount:</span>
                      <span className="font-black text-emerald-400 text-lg">
                        ₹{calculatedTotalAmt.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingManual || isEWayBillMissing || invoiceTaxableTotal <= 0}
                    className="w-full sm:w-auto px-7 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isSubmittingManual ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Generating Bill...</span>
                      </>
                    ) : formVehicleNumber.trim() ? (
                      <>
                        <Truck className="w-4 h-4" />
                        <span>Generate Tax Invoice (गाड़ी नं: {formVehicleNumber.trim()})</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Generate Tax Invoice (गाड़ी नं. बाद में डिस्पैचर द्वारा डाला जाएगा)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Generated Bills Dashboard / Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white">
                Generated Bills List (सारे जनरेटेड बिल्स)
              </h2>
              <p className="text-xs text-slate-400">
                All bills generated with Seller and Purchaser details. Download PDF anytime to verify.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={loadBills}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="Refresh bills"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBills ? 'animate-spin' : ''}`} />
              </button>

              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({bills.length})
                </button>
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'pending' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Awaiting Dispatch ({metrics.pendingCount})
                </button>
                <button
                  onClick={() => setStatusFilter('dispatched')}
                  className={`px-3 py-1 rounded-lg transition ${
                    statusFilter === 'dispatched' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Dispatched ({bills.length - metrics.pendingCount})
                </button>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Receipt No, Bill No, Marka, Purchaser, Seller, Container..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Bulk Vehicle Update Bar (Appears when bills are selected) */}
          {selectedBillIds.size > 0 && (
            <div className="p-3.5 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border border-amber-500/50 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-fadeIn shadow-lg">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-300">
                <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {selectedBillIds.size} {selectedBillIds.size === 1 ? 'Bill' : 'Bills'} Selected for Batch Vehicle Update (गाड़ी नंबर अपडेट)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={bulkVehicleInput}
                  onChange={(e) => setBulkVehicleInput(e.target.value.toUpperCase())}
                  placeholder="गाड़ी नंबर (e.g. HR 55 AU 1234)"
                  className="px-3.5 py-1.5 bg-slate-950 border border-amber-500/60 rounded-xl text-xs font-black text-amber-300 uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 w-full sm:w-60 font-mono"
                />
                <button
                  type="button"
                  disabled={isBulkUpdatingVehicle || !bulkVehicleInput.trim()}
                  onClick={handleBulkUpdateVehicle}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition flex-shrink-0 shadow"
                >
                  {isBulkUpdatingVehicle ? 'Saving...' : 'Set Vehicle No'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBillIds(new Set())}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Bills Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-3.5 text-center w-10">
                    <input
                      type="checkbox"
                      checked={selectedBillIds.size === filteredBills.length && filteredBills.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                      title="Select / Deselect All"
                    />
                  </th>
                  <th className="p-3.5">Bill / Receipt</th>
                  <th className="p-3.5">Marka</th>
                  <th className="p-3.5 text-center">Unit</th>
                  <th className="p-3.5 text-center">Cartons</th>
                  <th className="p-3.5">Seller (Billed By)</th>
                  <th className="p-3.5">Purchaser (Billed To)</th>
                  <th className="p-3.5 text-right">Pcs</th>
                  <th className="p-3.5 text-right">KG</th>
                  <th className="p-3.5 text-right">Taxable (₹)</th>
                  <th className="p-3.5 text-right">Total (₹)</th>
                  <th className="p-3.5 text-center">गाड़ी नंबर</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {isLoadingBills ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-500">
                      <div className="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <p>Loading generated bills...</p>
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-500">
                      No bills found. Select a container above to download its manifest, or use manual entry.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => (
                    <tr key={b._id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedBillIds.has(b._id)}
                          onChange={() => handleToggleBillSelect(b._id)}
                          className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-white">{b.receipt}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{b.billNumber}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold text-cyan-300">
                          {b.mainMarka || b.subMarka || '—'}
                        </span>
                        {b.container && <div className="text-[10px] text-slate-500">{b.container}</div>}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-300">
                          {b.billingUnit || 'Pcs'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-300">
                        {b.totalCartons || '—'} CTN
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-sky-300 truncate max-w-[120px]">
                          {b.sellerName || 'US Logistics'}
                        </div>
                        {b.sellerGstin && <div className="text-[10px] text-slate-500 font-mono">{b.sellerGstin}</div>}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-violet-300 truncate max-w-[130px]">
                          {b.purchaserName || b.party || 'General Party'}
                        </div>
                        {b.purchaserRegistrationType === 'Unregistered' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                            URP
                          </span>
                        ) : b.purchaserGstin ? (
                          <span className="text-[10px] text-emerald-400 font-mono">{b.purchaserGstin}</span>
                        ) : null}
                      </td>
                      <td className="p-3.5 text-right text-purple-300 font-semibold">
                        {Number(b.quantityPcs || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-right text-cyan-300 font-semibold">
                        {Number(b.quantityKg || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-right text-emerald-400 font-semibold">
                        ₹{Number(b.taxableValue || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-right text-white font-bold">
                        ₹{Number(b.totalAmount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="inline-flex items-center justify-center space-x-1">
                          {b.vehicleNumber ? (
                            <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded font-bold text-[11px] font-mono">
                              {b.vehicleNumber}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-950/50 border border-amber-800/60 text-amber-400 rounded text-[11px]">
                              Pending (बाकी)
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenVehicleModal(b)}
                            title="गाड़ी नंबर अपडेट करें (Edit Vehicle No)"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        {b.isDispatched ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Dispatched</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>Generated</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleOpenEditBillModal(b)}
                            title="बिल की जानकारी बदलें / एडिट करें (Edit Bill)"
                            className="p-1.5 bg-slate-800 hover:bg-cyan-500/20 hover:text-cyan-400 text-slate-300 rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => generateBillPDF(b, true)}
                            title="Download PDF Bill"
                            className="p-1.5 bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 rounded-lg transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBill(b._id, b.receipt)}
                            title="Delete Bill"
                            className="p-1.5 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL: ADD / EDIT SELLER PARTIES */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-black text-white">
                  {editingSellerId ? 'Edit Seller Party (सेलर पार्टी संपादित करें)' : 'Add New Seller Party (सेलर पार्टी जोड़ें)'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowSellerModal(false);
                  setEditingSellerId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSeller} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Company / Seller Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSellerName}
                  onChange={(e) => setNewSellerName(e.target.value)}
                  placeholder="e.g. SHOKEEN ROOFING INDIA"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    GSTIN (15-Digit GST Number)
                  </label>
                  <input
                    type="text"
                    value={newSellerGstin}
                    onChange={(e) => setNewSellerGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 07AAIFS1314B1ZU"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Mobile Number (मोबाइल नं.)
                  </label>
                  <input
                    type="text"
                    value={newSellerPhone}
                    onChange={(e) => setNewSellerPhone(e.target.value)}
                    placeholder="e.g. 9811223344"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Email ID (ईमेल आईडी)
                </label>
                <input
                  type="email"
                  value={newSellerEmail}
                  onChange={(e) => setNewSellerEmail(e.target.value)}
                  placeholder="e.g. accounts@shokeenroofing.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Company Address *
                </label>
                <input
                  type="text"
                  required
                  value={newSellerAddress}
                  onChange={(e) => setNewSellerAddress(e.target.value)}
                  placeholder="Plot No 22, Ph-1 Mayapuri Industrial Area"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">City</label>
                  <input
                    type="text"
                    value={newSellerCity}
                    onChange={(e) => setNewSellerCity(e.target.value)}
                    placeholder="New Delhi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Pincode</label>
                  <input
                    type="text"
                    value={newSellerPincode}
                    onChange={(e) => setNewSellerPincode(e.target.value)}
                    placeholder="110064"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State</label>
                  <input
                    type="text"
                    value={newSellerState}
                    onChange={(e) => setNewSellerState(e.target.value)}
                    placeholder="Delhi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code</label>
                  <input
                    type="text"
                    value={newSellerStateCode}
                    onChange={(e) => setNewSellerStateCode(e.target.value)}
                    placeholder="07"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                {editingSellerId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteSeller(editingSellerId)}
                    className="px-3 py-2 bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Company</span>
                  </button>
                ) : <div />}

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSellerModal(false);
                      setEditingSellerId(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSeller}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow"
                  >
                    {isSavingSeller ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{editingSellerId ? 'Update Seller Party' : 'Save Seller Party'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MARKA ADDRESS DIRECTORY (मार्का एड्रेस डायरेक्टरी) */}
      {showMarkaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center space-x-2">
                    <span>Marka Address Directory</span>
                    <span className="text-xs font-normal text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-full">
                      मार्का एड्रेस डायरेक्टरी
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    प्रत्येक मार्का (Marka) के लिए खरीदार और डिलीवरी एड्रेस स्थायी रूप से सेव करें।
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={resetMarkaForm}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Marka</span>
                </button>
                <button
                  onClick={() => setShowMarkaModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content: Split view */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 overflow-y-auto pr-1 flex-1">
              {/* Left Column: List of Saved Markas */}
              <div className="md:col-span-5 flex flex-col space-y-3 border-r border-slate-800/80 pr-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={markaSearchTerm}
                    onChange={(e) => setMarkaSearchTerm(e.target.value)}
                    placeholder="Search Marka / Party / GSTIN..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-1">
                  <span>Saved Records ({markaList.length})</span>
                  {isLoadingMarkas && <span className="text-amber-400 animate-pulse">Loading...</span>}
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
                  {markaList
                    .filter((m) => {
                      if (!markaSearchTerm.trim()) return true;
                      const q = markaSearchTerm.toLowerCase();
                      return (
                        m.marka?.toLowerCase().includes(q) ||
                        m.purchaserName?.toLowerCase().includes(q) ||
                        m.gstin?.toLowerCase().includes(q) ||
                        m.state?.toLowerCase().includes(q)
                      );
                    })
                    .map((m) => {
                      const isSelected = selectedMarkaToEdit?.marka === m.marka;
                      return (
                        <div
                          key={m.marka}
                          onClick={() => selectMarkaForEditing(m)}
                          className={`p-3 rounded-2xl border cursor-pointer transition ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500/50 shadow-md'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-amber-300 text-sm">
                              {m.marka}
                            </span>
                            <div className="flex items-center space-x-1.5">
                              {m.gstin ? (
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                                  {m.gstin}
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                  URP
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMarkaRecord(m.marka);
                                }}
                                className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                                title="Delete this Marka"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="text-xs font-bold text-white mt-1 truncate">
                            {m.purchaserName || 'No Name'}
                          </div>

                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {m.addresses?.[0]?.address || 'No address set'}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-800/50">
                            <span>{m.state || 'Uttar Pradesh'} ({m.stateCode || '09'})</span>
                            {m.phone && <span className="font-mono text-slate-400">{m.phone}</span>}
                          </div>
                        </div>
                      );
                    })}

                  {markaList.length === 0 && !isLoadingMarkas && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No saved Marka addresses yet. Add one using the form!
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Form to Add/Edit Marka Address */}
              <div className="md:col-span-7 flex flex-col space-y-3">
                <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-xs font-black text-white block">
                      {selectedMarkaToEdit ? `Edit Address for [${selectedMarkaToEdit.marka}]` : 'Add New Marka Address'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {selectedMarkaToEdit ? 'Updating existing directory record' : 'Fill details to add to directory'}
                    </span>
                  </div>
                  {selectedMarkaToEdit && (
                    <button
                      type="button"
                      onClick={resetMarkaForm}
                      className="text-xs font-bold text-amber-400 hover:underline"
                    >
                      Clear / Create New
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveDirMarka} className="space-y-3 text-xs">
                  {/* Marka & Registration Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-amber-300 block mb-1">
                        Marka Code (मार्का) *
                      </label>
                      <input
                        type="text"
                        required
                        value={dirMarkaName}
                        onChange={(e) => setDirMarkaName(e.target.value.toUpperCase())}
                        placeholder="e.g. K-10, SUNNY, AGRA"
                        className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-xl text-amber-300 font-mono font-black uppercase text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Registration Type
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setDirRegistrationType('Registered')}
                          className={`py-1 text-center font-bold rounded-lg transition ${
                            dirRegistrationType === 'Registered'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Registered
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirRegistrationType('Unregistered')}
                          className={`py-1 text-center font-bold rounded-lg transition ${
                            dirRegistrationType === 'Unregistered'
                              ? 'bg-amber-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          URP (Unregistered)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Purchaser / Consignee Name & GSTIN */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Purchaser / Consignee Legal Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={dirPurchaserName}
                        onChange={(e) => setDirPurchaserName(e.target.value)}
                        placeholder="e.g. Radhey Trading Co."
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        GSTIN {dirRegistrationType === 'Registered' ? '*' : '(Optional)'} (राज्य स्वतः सेट होगा)
                      </label>
                      <input
                        type="text"
                        value={dirGstin}
                        onChange={(e) => {
                          const upper = e.target.value.toUpperCase();
                          setDirGstin(upper);
                          if (upper.length >= 2) {
                            const stObj = getStateByGstinOrCode(upper);
                            if (stObj) {
                              setDirState(stObj.name);
                              setDirStateCode(stObj.code);
                            }
                          }
                        }}
                        placeholder="07AAAAA0000A1Z5"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase"
                      />
                    </div>
                  </div>

                  {/* Consignee Phone & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Phone / Mobile
                      </label>
                      <input
                        type="text"
                        value={dirPhone}
                        onChange={(e) => setDirPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={dirEmail}
                        onChange={(e) => setDirEmail(e.target.value)}
                        placeholder="e.g. contact@party.com"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Consignee (Ship to) Address */}
                  <div>
                    <label className="text-[11px] font-bold text-sky-300 block mb-1">
                      Consignee Delivery Address (Ship to) *
                    </label>
                    <input
                      type="text"
                      required
                      value={dirConsigneeAddress}
                      onChange={(e) => setDirConsigneeAddress(e.target.value)}
                      placeholder="e.g. Shop No 4, Main Market, Agra"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">State (राज्य)</label>
                      <select
                        value={dirState}
                        onChange={(e) => {
                          const st = e.target.value;
                          setDirState(st);
                          const code = getStateCodeByName(st);
                          if (code) setDirStateCode(code);
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st.name} value={st.name}>
                            {st.name} ({st.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (ऑटो)</label>
                      <input
                        type="text"
                        value={dirStateCode}
                        onChange={(e) => setDirStateCode(e.target.value)}
                        placeholder="09"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Buyer (Bill to) Toggle */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="checkbox"
                        checked={dirSameAsConsignee}
                        onChange={(e) => setDirSameAsConsignee(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-300">
                        Buyer (Bill to) is identical to Consignee (Ship to) / सेम खरीदार
                      </span>
                    </label>

                    {!dirSameAsConsignee && (
                      <div className="space-y-2.5 p-3 bg-slate-950/80 border border-slate-800 rounded-2xl">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer Name</label>
                            <input
                              type="text"
                              value={dirBuyerName}
                              onChange={(e) => setDirBuyerName(e.target.value)}
                              placeholder="Buyer legal name"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer GSTIN (राज्य स्वतः सेट होगा)</label>
                            <input
                              type="text"
                              value={dirBuyerGstin}
                              onChange={(e) => {
                                const upper = e.target.value.toUpperCase();
                                setDirBuyerGstin(upper);
                                if (upper.length >= 2) {
                                  const stObj = getStateByGstinOrCode(upper);
                                  if (stObj) {
                                    setDirBuyerState(stObj.name);
                                    setDirBuyerStateCode(stObj.code);
                                  }
                                }
                              }}
                              placeholder="Buyer GSTIN"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono uppercase text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer Billing Address</label>
                          <input
                            type="text"
                            value={dirBuyerAddress}
                            onChange={(e) => setDirBuyerAddress(e.target.value)}
                            placeholder="Buyer office address"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer State (राज्य)</label>
                            <select
                              value={dirBuyerState}
                              onChange={(e) => {
                                const st = e.target.value;
                                setDirBuyerState(st);
                                const code = getStateCodeByName(st);
                                if (code) setDirBuyerStateCode(code);
                              }}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs"
                            >
                              {INDIAN_STATES.map((st) => (
                                <option key={st.name} value={st.name}>
                                  {st.name} ({st.code})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer State Code (ऑटो)</label>
                            <input
                              type="text"
                              value={dirBuyerStateCode}
                              onChange={(e) => setDirBuyerStateCode(e.target.value)}
                              placeholder="09"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-amber-300 font-mono text-xs font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowMarkaModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingDirMarka}
                      className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow-lg shadow-amber-950/40"
                    >
                      {isSavingDirMarka ? (
                        <span>Saving...</span>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>{selectedMarkaToEdit ? 'Update Marka Address' : 'Save Marka Address'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK UPDATE VEHICLE NUMBER */}
      {vehicleModalOpen && targetBillForVehicle && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    गाड़ी नंबर अपडेट करें (Update Vehicle No)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Receipt #{targetBillForVehicle.receipt} | Bill: {targetBillForVehicle.billNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setVehicleModalOpen(false);
                  setTargetBillForVehicle(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickVehicle} className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  गाड़ी नंबर (Vehicle Number) *
                </label>
                <input
                  type="text"
                  required
                  value={quickVehicleInput}
                  onChange={(e) => setQuickVehicleInput(e.target.value.toUpperCase())}
                  placeholder="e.g. HR 55 AU 1234 or DL 1L AA 1234"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/50 rounded-xl text-amber-300 font-black uppercase text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  गंतव्य / Destination (Optional)
                </label>
                <input
                  type="text"
                  value={quickDestInput}
                  onChange={(e) => setQuickDestInput(e.target.value.toUpperCase())}
                  placeholder="e.g. DELHI, AGRA, JAIPUR"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white uppercase text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setVehicleModalOpen(false);
                    setTargetBillForVehicle(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickVehicle || !quickVehicleInput.trim()}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                >
                  {isSavingQuickVehicle ? <span>Saving...</span> : <span>Save Vehicle No</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW SENDING LOCATION FOR MARKA */}
      {showAddLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    नया सेंडिंग पता जोड़ें (Add Sending Location)
                  </h3>
                  <p className="text-[11px] text-cyan-300">
                    मार्का: <strong>{mainMarka || subMarka || singleSelectedMarka}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddLocationModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewLocation} className="space-y-3 text-xs">
              {/* Registration Type & GSTIN right in the address modal */}
              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300">
                    पार्टी रजिस्ट्रेशन (Registration Type) *
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setNewLocRegType('Registered')}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        newLocRegType === 'Registered' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Registered (GSTIN)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewLocRegType('Unregistered');
                        setNewLocGstin('');
                      }}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${
                        newLocRegType === 'Unregistered' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Unregistered (URP)
                    </button>
                  </div>
                </div>

                {newLocRegType === 'Registered' ? (
                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 block mb-1">
                      15-Digit GSTIN Number * (राज्य कोड स्वतः पहचानेगा)
                    </label>
                    <input
                      type="text"
                      required={newLocRegType === 'Registered'}
                      value={newLocGstin}
                      onChange={(e) => {
                        const upper = e.target.value.toUpperCase();
                        setNewLocGstin(upper);
                        if (upper.length >= 2) {
                          const stObj = getStateByGstinOrCode(upper);
                          if (stObj) {
                            setNewLocState(stObj.name);
                            setNewLocStateCode(stObj.code);
                          }
                        }
                      }}
                      placeholder="e.g. 07AAAAA0000A1Z5"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-emerald-500/50 rounded-xl text-emerald-300 font-mono font-bold uppercase text-xs"
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-400/90 italic">
                    ℹ गैर-पंजीकृत पार्टी (URP) - कोई GSTIN दर्ज करने की आवश्यकता नहीं है।
                  </p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  लोकेशन का नाम / पहचान (e.g. Godown 1, Factory Agra) *
                </label>
                <input
                  type="text"
                  required
                  value={newLocTitle}
                  onChange={(e) => setNewLocTitle(e.target.value)}
                  placeholder="e.g. Godown 2 - Sanjay Place"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  पूरा डिलीवरी पता (Full Address) *
                </label>
                <textarea
                  required
                  rows={2}
                  value={newLocAddress}
                  onChange={(e) => setNewLocAddress(e.target.value)}
                  placeholder="Shop / Plot No, Street, Landmark..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">City / शहर</label>
                  <input
                    type="text"
                    value={newLocCity}
                    onChange={(e) => setNewLocCity(e.target.value)}
                    placeholder="e.g. Agra / Delhi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Pincode</label>
                  <input
                    type="text"
                    value={newLocPincode}
                    onChange={(e) => setNewLocPincode(e.target.value)}
                    placeholder="e.g. 282002"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State (राज्य)</label>
                  <select
                    value={newLocState}
                    onChange={(e) => {
                      const st = e.target.value;
                      setNewLocState(st);
                      const code = getStateCodeByName(st);
                      if (code) setNewLocStateCode(code);
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st.name} value={st.name}>
                        {st.name} ({st.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (ऑटोमैटिक)</label>
                  <input
                    type="text"
                    value={newLocStateCode}
                    onChange={(e) => setNewLocStateCode(e.target.value)}
                    placeholder="07"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newLocContactPerson}
                    onChange={(e) => setNewLocContactPerson(e.target.value)}
                    placeholder="Contact person name"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Phone / Mobile</label>
                  <input
                    type="text"
                    value={newLocPhone}
                    onChange={(e) => setNewLocPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLocationModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNewLoc}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                >
                  {isSavingNewLoc ? <span>Saving...</span> : <span>Save Address to Marka</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SENDING LOCATION FOR MARKA */}
      {showEditLocationModal && editingLocationData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    पता एडिट करें (Edit Sending Location)
                  </h3>
                  <p className="text-[11px] text-amber-300">
                    मार्का: <strong>{editingLocationData.marka}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEditLocationModal(false);
                  setEditingLocationData(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedLocation} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  लोकेशन का नाम / पहचान (e.g. Godown 1, Shop 2) *
                </label>
                <input
                  type="text"
                  required
                  value={editingLocationData.title}
                  onChange={(e) =>
                    setEditingLocationData({ ...editingLocationData, title: e.target.value })
                  }
                  placeholder="e.g. Godown 2 - Sanjay Place"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  पूरा डिलीवरी पता (Full Address) *
                </label>
                <textarea
                  required
                  rows={2}
                  value={editingLocationData.address}
                  onChange={(e) =>
                    setEditingLocationData({ ...editingLocationData, address: e.target.value })
                  }
                  placeholder="Shop / Plot No, Street, Landmark..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">City / शहर</label>
                  <input
                    type="text"
                    value={editingLocationData.city}
                    onChange={(e) =>
                      setEditingLocationData({ ...editingLocationData, city: e.target.value })
                    }
                    placeholder="e.g. Agra / Delhi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Pincode</label>
                  <input
                    type="text"
                    value={editingLocationData.pincode}
                    onChange={(e) =>
                      setEditingLocationData({ ...editingLocationData, pincode: e.target.value })
                    }
                    placeholder="e.g. 282002"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State (राज्य)</label>
                  <select
                    value={editingLocationData.state}
                    onChange={(e) => {
                      const st = e.target.value;
                      const code = getStateCode(st) || '07';
                      setEditingLocationData({
                        ...editingLocationData,
                        state: st,
                        stateCode: code,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st.name} value={st.name}>
                        {st.name} ({st.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (ऑटोमैटिक)</label>
                  <input
                    type="text"
                    value={editingLocationData.stateCode}
                    onChange={(e) =>
                      setEditingLocationData({ ...editingLocationData, stateCode: e.target.value })
                    }
                    placeholder="07"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editingLocationData.contactPerson}
                    onChange={(e) =>
                      setEditingLocationData({ ...editingLocationData, contactPerson: e.target.value })
                    }
                    placeholder="Contact person name"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Phone / Mobile</label>
                  <input
                    type="text"
                    value={editingLocationData.phone}
                    onChange={(e) =>
                      setEditingLocationData({ ...editingLocationData, phone: e.target.value })
                    }
                    placeholder="Phone number"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditLocationModal(false);
                    setEditingLocationData(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <span>Update Address</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HSN SEARCH & AUTO-SUGGESTION */}
      {showHsnSearchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Search className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    HSN कोड खोजें व सुझाव चुनें (Search & Suggest HSN)
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    आइटम के नाम या कीवर्ड से HSN ढूँढें। चुनने पर वह इस आइटम के साथ हमेशा के लिए लिंक हो जाएगा।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHsnSearchModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={hsnSearchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setHsnSearchQuery(val);
                  handleSearchHsn(val);
                }}
                placeholder="उदा. Baby bottle, Teether, Toy, Footwear, Bag, 39269099..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-amber-500/50 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>

            {/* Results List */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {isLoadingHsn ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  खोज रहे हैं... (Searching HSN Directory)...
                </div>
              ) : hsnSearchResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  कोई सुझाव नहीं मिला। आप मैन्युअली HSN टाइप करके सेव कर सकते हैं।
                </div>
              ) : (
                hsnSearchResults.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectHsnSuggestion(s)}
                    className="p-2.5 bg-slate-950/60 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/60 rounded-xl cursor-pointer transition flex items-center justify-between group"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-amber-300 text-xs px-2 py-0.5 bg-amber-500/10 rounded border border-amber-500/30">
                          {s.hsnCode}
                        </span>
                        <span className="font-bold text-white text-xs">{s.itemName}</span>
                        {s.isUserSaved && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-bold">
                            ★ आपका लिंक्ड
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1">{s.description}</p>
                    </div>

                    <div className="flex items-center space-x-2 text-right shrink-0">
                      <span className="text-[10px] text-sky-400 font-mono font-bold">
                        IGST {s.gstRate}%
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-amber-500 group-hover:bg-amber-400 text-slate-950 font-black text-[10px] rounded-lg transition"
                      >
                        चुनें & लिंक करें
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-400">
              <span>सुझाव: एक बार चुनने पर अगली बार यह HSN स्वतः लोड होगा।</span>
              <button
                type="button"
                onClick={() => setShowHsnSearchModal(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg font-bold"
              >
                बंद करें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BILL (बिल की जानकारी बदलें / संशोधित करें) */}
      {editBillModalOpen && billToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center space-x-2">
                    <span>बिल एडिट / संशोधन करें (Edit Invoice Bill)</span>
                    <span className="font-mono text-cyan-400 text-xs px-2 py-0.5 bg-cyan-950 rounded border border-cyan-800">
                      {editBillData.billNumber}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    रसीद: <span className="font-mono text-slate-300">{billToEdit.receipt}</span> | 
                    कंटेनर: <span className="font-mono text-slate-300">{billToEdit.container || 'N/A'}</span> | 
                    मार्का: <span className="font-mono text-cyan-300">{billToEdit.mainMarka || 'N/A'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditBillModalOpen(false);
                  setBillToEdit(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBill} className="space-y-4 text-xs">
              {/* Row 1: Bill Number, Vehicle Number, E-Way Bill Number, Destination */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="text-[11px] font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Truck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. इनवॉइस व वाहन ट्रांसपोर्ट विवरण (Invoice & Transport Details)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Invoice Bill No. *
                    </label>
                    <input
                      type="text"
                      required
                      value={editBillData.billNumber}
                      onChange={(e) => setEditBillData({ ...editBillData, billNumber: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 block mb-1">
                      गाड़ी नंबर (Vehicle No.)
                    </label>
                    <input
                      type="text"
                      value={editBillData.vehicleNumber}
                      onChange={(e) => setEditBillData({ ...editBillData, vehicleNumber: e.target.value.toUpperCase() })}
                      placeholder="e.g. DL 01 AB 1234"
                      className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/50 rounded-xl text-emerald-300 font-mono font-bold uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-amber-300 block mb-1">
                      e-Way Bill No.
                    </label>
                    <input
                      type="text"
                      value={editBillData.eWayBillNo}
                      onChange={(e) => setEditBillData({ ...editBillData, eWayBillNo: e.target.value })}
                      placeholder="12-digit e-Way Bill"
                      className="w-full px-3 py-2 bg-slate-900 border border-amber-500/50 rounded-xl text-amber-200 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Destination City
                    </label>
                    <input
                      type="text"
                      value={editBillData.destination}
                      onChange={(e) => setEditBillData({ ...editBillData, destination: e.target.value.toUpperCase() })}
                      placeholder="e.g. GUWAHATI"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white uppercase font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Consignee (Ship to) Party Details */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>2. Consignee / Shipped To (जिसके पते पर माल भेजा जा रहा है)</span>
                  </div>

                  {/* Registered vs Unregistered toggle */}
                  <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setEditBillData({ ...editBillData, purchaserRegistrationType: 'Registered' })}
                      className={`px-2.5 py-1 rounded transition ${
                        editBillData.purchaserRegistrationType === 'Registered'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Registered (GSTIN)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditBillData({
                          ...editBillData,
                          purchaserRegistrationType: 'Unregistered',
                          purchaserGstin: '',
                        })
                      }
                      className={`px-2.5 py-1 rounded transition ${
                        editBillData.purchaserRegistrationType === 'Unregistered'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Unregistered (URP)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Consignee / Party Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editBillData.purchaserName}
                      onChange={(e) => setEditBillData({ ...editBillData, purchaserName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 block mb-1">
                      Consignee GSTIN {editBillData.purchaserRegistrationType === 'Registered' ? '*' : '(URP)'} (राज्य स्वतः सेट होगा)
                    </label>
                    <input
                      type="text"
                      disabled={editBillData.purchaserRegistrationType === 'Unregistered'}
                      value={editBillData.purchaserGstin}
                      onChange={(e) => {
                        const upper = e.target.value.toUpperCase();
                        const next = { ...editBillData, purchaserGstin: upper };
                        if (upper.length >= 2) {
                          const stObj = getStateByGstinOrCode(upper);
                          if (stObj) {
                            next.consigneeState = stObj.name;
                            next.consigneeStateCode = stObj.code;
                          }
                        }
                        setEditBillData(next);
                      }}
                      placeholder="07AAAAA0000A1Z5"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-emerald-300 font-mono font-bold uppercase disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-300 block mb-1">
                      Delivery Address (Ship to Address) *
                    </label>
                    <input
                      type="text"
                      required
                      value={editBillData.consigneeAddress}
                      onChange={(e) => setEditBillData({ ...editBillData, consigneeAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">State (राज्य)</label>
                      <select
                        value={editBillData.consigneeState}
                        onChange={(e) => {
                          const st = e.target.value;
                          const code = getStateCodeByName(st) || editBillData.consigneeStateCode;
                          setEditBillData({ ...editBillData, consigneeState: st, consigneeStateCode: code });
                        }}
                        className="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs"
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st.name} value={st.name}>
                            {st.name} ({st.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">State Code</label>
                      <input
                        type="text"
                        value={editBillData.consigneeStateCode}
                        onChange={(e) => setEditBillData({ ...editBillData, consigneeStateCode: e.target.value })}
                        className="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-amber-300 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Buyer (Bill to) Party Details */}
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>3. Buyer / Billed To (जिसके नाम इनवॉइस बनेगा)</span>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg">
                    <input
                      type="checkbox"
                      checked={editBillData.sameAsConsignee}
                      onChange={(e) => setEditBillData({ ...editBillData, sameAsConsignee: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-[10px] font-bold text-slate-300">
                      Same as Consignee / सेम खरीदार
                    </span>
                  </label>
                </div>

                {!editBillData.sameAsConsignee && (
                  <div className="space-y-3 pt-1 border-t border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer Legal Name</label>
                        <input
                          type="text"
                          value={editBillData.buyerName}
                          onChange={(e) => setEditBillData({ ...editBillData, buyerName: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer GSTIN (राज्य स्वतः सेट होगा)</label>
                        <input
                          type="text"
                          value={editBillData.buyerGstin}
                          onChange={(e) => {
                            const upper = e.target.value.toUpperCase();
                            const next = { ...editBillData, buyerGstin: upper };
                            if (upper.length >= 2) {
                              const stObj = getStateByGstinOrCode(upper);
                              if (stObj) {
                                next.buyerState = stObj.name;
                                next.buyerStateCode = stObj.code;
                              }
                            }
                            setEditBillData(next);
                          }}
                          placeholder="Buyer GSTIN"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono uppercase"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer Billing Address</label>
                        <input
                          type="text"
                          value={editBillData.buyerAddress}
                          onChange={(e) => setEditBillData({ ...editBillData, buyerAddress: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer State</label>
                          <select
                            value={editBillData.buyerState}
                            onChange={(e) => {
                              const st = e.target.value;
                              const code = getStateCodeByName(st) || editBillData.buyerStateCode;
                              setEditBillData({ ...editBillData, buyerState: st, buyerStateCode: code });
                            }}
                            className="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs"
                          >
                            {INDIAN_STATES.map((st) => (
                              <option key={st.name} value={st.name}>
                                {st.name} ({st.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-300 block mb-1">State Code</label>
                          <input
                            type="text"
                            value={editBillData.buyerStateCode}
                            onChange={(e) => setEditBillData({ ...editBillData, buyerStateCode: e.target.value })}
                            className="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-amber-300 font-mono font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 4: Items Table (Add, Remove, Edit Description, HSN, Quantity, Unit, Rate) */}
              <div className="p-3.5 bg-slate-950/70 border border-amber-500/40 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <ListPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>4. इनवॉइस वस्तुएं (Invoice Items: HSN, Unit, Quantity, Rate)</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleEditBillAddItem}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[10px] transition flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Add Item Row</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px]">
                      <tr>
                        <th className="p-2 text-center w-8">#</th>
                        <th className="p-2">Description of Goods</th>
                        <th className="p-2 w-44">HSN / SAC</th>
                        <th className="p-2 w-24">Quantity</th>
                        <th className="p-2 w-20">Unit</th>
                        <th className="p-2 w-24">Rate (₹)</th>
                        <th className="p-2 w-28 text-right">Amount (₹)</th>
                        <th className="p-2 text-center w-8">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/80 font-medium">
                      {editBillData.items.map((it: FormLineItem, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              required
                              value={it.description}
                              onChange={(e) => handleEditBillUpdateItem(idx, 'description', e.target.value)}
                              placeholder="Item Name"
                              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                required
                                value={it.hsnCode}
                                onChange={(e) => handleEditBillUpdateItem(idx, 'hsnCode', e.target.value)}
                                placeholder="HSN"
                                className="w-full px-2 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-amber-200 font-mono text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  openHsnModal(it.description || 'Goods', (selectedHsn) => {
                                    handleEditBillUpdateItem(idx, 'hsnCode', selectedHsn);
                                  })
                                }
                                className="px-1.5 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 rounded-lg text-[10px] font-bold transition shrink-0"
                                title="HSN सुझाव / सर्च"
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="any"
                              required
                              value={it.quantity}
                              onChange={(e) => handleEditBillUpdateItem(idx, 'quantity', e.target.value)}
                              className="w-full px-2 py-1.5 bg-slate-900 border border-purple-500/40 rounded-lg text-purple-200 font-mono text-xs font-bold"
                            />
                          </td>
                          <td className="p-1.5">
                            <select
                              value={it.unit}
                              onChange={(e) => handleEditBillUpdateItem(idx, 'unit', e.target.value)}
                              className="w-full px-1.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-bold"
                            >
                              <option value="PCS">PCS</option>
                              <option value="KGS">KG</option>
                              <option value="CTN">CTN</option>
                            </select>
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="any"
                              required
                              value={it.rate}
                              onChange={(e) => handleEditBillUpdateItem(idx, 'rate', e.target.value)}
                              className="w-full px-2 py-1.5 bg-slate-900 border border-sky-500/40 rounded-lg text-sky-200 font-mono text-xs font-bold"
                            />
                          </td>
                          <td className="p-2 text-right font-mono text-emerald-400 font-bold">
                            ₹{(Number(it.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 text-center">
                            {editBillData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleEditBillRemoveItem(idx)}
                                className="p-1 text-slate-500 hover:text-red-400 rounded transition"
                                title="हटाएं"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                {(() => {
                  const editTaxable = editBillData.items.reduce((s: number, it: FormLineItem) => s + (Number(it.amount) || 0), 0);
                  const isEditDelhi =
                    editBillData.consigneeStateCode === '07' ||
                    editBillData.buyerStateCode === '07' ||
                    (editBillData.consigneeState || '').toLowerCase().includes('delhi') ||
                    (editBillData.buyerState || '').toLowerCase().includes('delhi');
                  const editGstRate = Number(billToEdit?.igst) || 18;
                  const editHalfRate = Number((editGstRate / 2).toFixed(2));
                  const editCgst = isEditDelhi ? Number(((editTaxable * editHalfRate) / 100).toFixed(2)) : 0;
                  const editSgst = isEditDelhi ? Number(((editTaxable * editHalfRate) / 100).toFixed(2)) : 0;
                  const editIgst = !isEditDelhi ? Number(((editTaxable * editGstRate) / 100).toFixed(2)) : 0;
                  const editTotal = isEditDelhi ? Number((editTaxable + editCgst + editSgst).toFixed(2)) : Number((editTaxable + editIgst).toFixed(2));

                  return (
                    <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 text-[11px]">
                          कुल आइटम्स: <strong className="text-white font-mono">{editBillData.items.length}</strong>
                        </span>
                        {isEditDelhi ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950/80 border border-sky-500/40 text-sky-300">
                            🔵 दिल्ली लोकल (CGST {editHalfRate}% + SGST {editHalfRate}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                            🟠 आउटसाइड दिल्ली (IGST {editGstRate}%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Taxable Value</span>
                          <strong className="text-white font-mono text-xs">
                            ₹{editTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                        {isEditDelhi ? (
                          <>
                            <div>
                              <span className="text-sky-400 text-[10px] block">CGST {editHalfRate}%</span>
                              <strong className="text-sky-300 font-mono text-xs">
                                ₹{editCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </strong>
                            </div>
                            <div>
                              <span className="text-sky-400 text-[10px] block">SGST {editHalfRate}%</span>
                              <strong className="text-sky-300 font-mono text-xs">
                                ₹{editSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </strong>
                            </div>
                          </>
                        ) : (
                          <div>
                            <span className="text-amber-400 text-[10px] block">IGST {editGstRate}%</span>
                            <strong className="text-amber-300 font-mono text-xs">
                              ₹{editIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </div>
                        )}
                        <div className="border-l border-slate-700 pl-3">
                          <span className="text-emerald-400 font-bold text-[10px] block">Grand Total</span>
                          <strong className="text-emerald-300 font-mono text-sm font-black">
                            ₹{editTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditBillModalOpen(false);
                    setBillToEdit(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditBill}
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black rounded-xl text-xs transition flex items-center space-x-2 shadow-lg shadow-cyan-900/40"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSavingEditBill
                      ? 'अपडेट हो रहा है...'
                      : '💾 संशोधन सेव करें और नया PDF डाउनलोड करें'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
