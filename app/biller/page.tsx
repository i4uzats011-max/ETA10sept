'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearMobileSession } from '@/lib/mobileBridge';
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
  Key,
  Palette,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { generateBillPDF, generateEWayBillPDF, generateBothBillAndEWayPDF } from '@/lib/billPdf';
import { downloadEWayBillJson } from '@/lib/ewayBillJson';
import { INDIAN_STATES, getStateCode, getStateName, getStateCodeByName, getStateByGstinOrCode, detectStateFromAddress } from '@/lib/states';
import { inferHsnByItemName, findHsnSuggestions, MASTER_HSN_CATALOG } from '@/lib/hsnCatalog';
import { translateToEnglish } from '@/lib/translate';
import { generateInvoiceNumberFromReceipt } from '@/lib/invoiceUtils';
import { autoDetectPincodeFromAddress, searchPincodes, extractPincodeFromAddress, PincodeEntry } from '@/lib/pincodeUtils';
import { triggerNotificationAlert } from '@/lib/soundNotification';

export type BillerTheme = 'dark' | 'light' | 'midnight' | 'emerald' | 'amber' | 'purple' | 'ocean' | 'crimson' | 'high-contrast-day';

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
  isDownloaded?: boolean;
  downloadedAt?: string | null;
  downloadCount?: number;
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'excel' | 'manual' | 'requests'>('excel');

  // Pending Dispatch Requests from Dispatcher
  const [pendingDispatchRequests, setPendingDispatchRequests] = useState<any[]>([]);
  const [activeDispatchRequestId, setActiveDispatchRequestId] = useState<string | null>(null);
  const prevPendingCountRef = useRef<number>(0);

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
  // Quick e-Way Bill modal & just-created bill state
  const [eWayModalBill, setEWayModalBill] = useState<BillItem | null>(null);
  const [eWayModalInputNo, setEWayModalInputNo] = useState('');
  const [eWayModalVehicleNo, setEWayModalVehicleNo] = useState('');
  const [isSavingEWayModal, setIsSavingEWayModal] = useState(false);
  const [justCreatedBill, setJustCreatedBill] = useState<BillItem | null>(null);
  const [justCreatedEWayNo, setJustCreatedEWayNo] = useState('');
  const [isSavingJustCreatedEWay, setIsSavingJustCreatedEWay] = useState(false);

  const [manualInvoiceNo, setManualInvoiceNo] = useState(''); // Generated taking receipt as invoice no with last 2/3 digits random
  const [formBillNumber, setFormBillNumber] = useState('');
  const [eWayInvoiceNumber, setEWayInvoiceNumber] = useState('');
  const [useSeparateEWayInvoice, setUseSeparateEWayInvoice] = useState(false);

  // Multi-Theme System State (Dark, Light, Midnight, Emerald, Amber, Purple)
  
  const [currentTheme, setCurrentTheme] = useState<BillerTheme>('dark');
  const [pdfTheme, setPdfTheme] = useState<'classic' | 'navy' | 'emerald' | 'crimson' | 'dark'>('classic');

  // Address PIN Code Auto-Detection & Search State
  const [detectedPincodeInfo, setDetectedPincodeInfo] = useState<PincodeEntry | null>(null);
  const [showPinSearchModal, setShowPinSearchModal] = useState(false);
  const [pinSearchQuery, setPinSearchQuery] = useState('');
  const [pinSearchResults, setPinSearchResults] = useState<PincodeEntry[]>([]);
  const [isSearchingPin, setIsSearchingPin] = useState(false);
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
  const [addressMode, setAddressMode] = useState<'select' | 'new'>('select');
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
  const [lineAmount, setLineAmount] = useState<string>('');
  const [shipmentTotalCbm, setShipmentTotalCbm] = useState<number>(0);
  const [shipmentTotalCartons, setShipmentTotalCartons] = useState<number>(0);
  const [downloadFilter, setDownloadFilter] = useState<'undownloaded' | 'downloaded' | 'all'>('undownloaded');
  const [autoDownloadOnGenerate, setAutoDownloadOnGenerate] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('biller_auto_download_on_generate');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);

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

  // Fetch Pending Dispatch Requests from Dispatcher
  const fetchDispatchRequests = async () => {
    try {
      const res = await fetch('/api/dispatcher?section=requests&status=Pending');
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        if (data.requests.length > prevPendingCountRef.current && prevPendingCountRef.current !== 0) {
          const latest = data.requests[0];
          triggerNotificationAlert({
            title: '🚚 New Dispatch Request Received!',
            body: `Receipt: ${latest?.receipt} | Gaadi: ${latest?.vehicleNumber} (${latest?.cartonCount} CTN)`,
          });
        }
        prevPendingCountRef.current = data.requests.length;
        setPendingDispatchRequests(data.requests);

        // When a request is deleted by dispatcher or completed, automatically remove from active banner
        if (activeDispatchRequestId && !data.requests.some((r: any) => r._id === activeDispatchRequestId)) {
          setActiveDispatchRequestId(null);
        }
      }
    } catch (e) {
      // quiet
    }
  };

  const handleInitiateBillingFromRequest = async (req: any) => {
    setActiveDispatchRequestId(req._id);
    const rNo = (req.receipt || '').trim();
    const ctnCount = String(req.cartonCount || '1');
    const vehNo = (req.vehicleNumber || '').trim();
    const dest = (req.place || '').trim();
    const commodityName = (req.commodity || '').trim() || 'COMMERCIAL GOODS';
    const contName = (req.container || '').trim();
    const mName = (req.marka || '').trim();

    // Rule: Receipt No is Bill No
    setReceiptNo(rNo);
    setManualInvoiceNo(rNo);
    setFormBillNumber(rNo);
    setContainerAlias(contName);
    setSingleContainer(contName);
    setFormVehicleNumber(vehNo);
    setTotalCartons(ctnCount);
    setLineQuantity(ctnCount);
    setLineUnit('CTN');
    setPartyName(req.party || mName || '');
    setMainMarka(mName);
    setSingleSelectedMarka(mName);
    setSingleSelectedReceipt(rNo);
    setCommodity(commodityName);
    setLineDescription(commodityName);
    setSelectedCargoDropdown(commodityName);

    // Seed markaCargoItems with this item description so dropdown immediately lists it
    setMarkaCargoItems([
      {
        marka: mName,
        description: commodityName,
        hsnCode: lineHsn || '39269099',
        pcs: (Number(ctnCount) || 1) * 10,
        weightKg: 0,
        cartons: Number(ctnCount) || 1,
      },
    ]);

    if (dest) {
      setFormDestination(dest);
      setConsigneeAddress(dest);
      setPurchaserAddress(dest);
    }
    setActiveTab('manual');

    // Populate Container & Marka Cascade dropdowns
    if (contName) {
      try {
        const resCont = await fetch(`/api/billing/lookup?container=${encodeURIComponent(contName)}`);
        if (resCont.ok) {
          const dataCont = await resCont.json();
          if (dataCont.markas) setSingleAvailableMarkas(dataCont.markas);
        }
      } catch {}
    }

    if (mName) {
      try {
        const resM = await fetch(`/api/billing/lookup?marka=${encodeURIComponent(mName)}&container=${encodeURIComponent(contName)}`);
        if (resM.ok) {
          const dataM = await resM.json();
          if (dataM.shipments) setSingleAvailableReceipts(dataM.shipments);
        }
      } catch {}
    }

    // Automatically trigger comprehensive receipt lookup to prefill party GSTIN, directory address & CBM
    if (rNo) {
      await handleReceiptLookup(rNo, {
        cartonCount: ctnCount,
        vehicleNumber: vehNo,
        destination: dest,
        commodity: commodityName,
      });
    }

    // Guarantee dispatcher values & bill number strictly prevail
    setReceiptNo(rNo);
    setManualInvoiceNo(rNo);
    setFormBillNumber(rNo);
    setTotalCartons(ctnCount);
    setLineQuantity(ctnCount);
    setLineUnit('CTN');
    if (contName) {
      setSingleContainer(contName);
      setContainerAlias(contName);
    }
    if (mName) {
      setSingleSelectedMarka(mName);
      setMainMarka(mName);
    }
    setSingleSelectedReceipt(rNo);
    if (vehNo) {
      setFormVehicleNumber(vehNo);
    }
    if (dest) {
      setFormDestination(dest);
    }
    if (commodityName) {
      setCommodity(commodityName);
      setLineDescription(commodityName);
      setSelectedCargoDropdown(commodityName);
    }

    // Auto-fetch HSN if needed
    try {
      const hsnRes = await fetch(`/api/hsn?q=${encodeURIComponent(commodityName)}`);
      if (hsnRes.ok) {
        const hsnData = await hsnRes.json();
        const code = hsnData.inferredHsn || hsnData.suggestions?.[0]?.hsnCode;
        if (code) {
          setHsnCode(code);
          setLineHsn(code);
        }
      }
    } catch {}

    // Ensure lineRate, lineAmount, taxableValue are ready and prefilled so bill can be made immediately
    setTimeout(() => {
      setLineRate((prev) => {
        if (prev && parseFloat(prev) > 0) return prev;
        return '100';
      });
      setLineAmount((prev) => {
        if (prev && parseFloat(prev) > 0) return prev;
        const c = parseFloat(ctnCount) || 1;
        return String(c * 100);
      });
      setTaxableValue((prev) => {
        if (prev && parseFloat(prev) > 0) return prev;
        const c = parseFloat(ctnCount) || 1;
        return String(c * 100);
      });
    }, 150);

    setLookupMessage(
      `✓ Dispatch request loaded: Receipt #${rNo} (Bill No: #${rNo}) | Container: ${contName || '—'} | Marka: ${mName || '—'} | Item: ${commodityName} | Vehicle: ${vehNo || '—'} | ${ctnCount} CTN | Destination: ${dest || '—'}`
    );
  };

  useEffect(() => {
    fetchDispatchRequests();
    const interval = setInterval(fetchDispatchRequests, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load persisted theme preference
    try {
      const savedTheme = (localStorage.getItem('biller_ui_theme') || localStorage.getItem('anti_theme')) as any;
      if (savedTheme && ['dark', 'light', 'midnight', 'emerald', 'amber', 'purple', 'ocean', 'crimson', 'high-contrast-day'].includes(savedTheme)) {
        setCurrentTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
      const savedPdfTheme = localStorage.getItem('biller_pdf_theme') as any;
      if (savedPdfTheme && ['classic', 'navy', 'emerald', 'crimson', 'dark'].includes(savedPdfTheme)) {
        setPdfTheme(savedPdfTheme);
      }
    } catch (e) {}

    fetchSellers();
    fetchContainers();
    fetchCascadeOptions();
    loadBills();
  }, []);

  const handleThemeChange = (newTheme: BillerTheme) => {
    setCurrentTheme(newTheme);
    try {
      localStorage.setItem('biller_ui_theme', newTheme);
      localStorage.setItem('anti_theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    } catch (e) {}
  };

  const toggleDayNightMode = () => {
    const nextTheme: BillerTheme = currentTheme === 'light' || currentTheme === 'high-contrast-day' ? 'dark' : 'light';
    handleThemeChange(nextTheme);
  };

  const handlePdfThemeChange = (newPdfTheme: 'classic' | 'navy' | 'emerald' | 'crimson' | 'dark') => {
    setPdfTheme(newPdfTheme);
    try {
      localStorage.setItem('biller_pdf_theme', newPdfTheme);
    } catch (e) {}
  };

  // Address PIN Code Auto-Detection and Search handlers
  const handleAddressInputChange = (val: string) => {
    setConsigneeAddress(val);
    setPurchaserAddress(val);

    const pinMatch = autoDetectPincodeFromAddress(val);
    if (pinMatch) {
      setDetectedPincodeInfo(pinMatch);
      if (pinMatch.state) {
        handleConsigneeStateChange(pinMatch.state);
      }
    } else {
      setDetectedPincodeInfo(null);
      const detected = detectStateFromAddress(val);
      if (detected) handleConsigneeStateChange(detected.name);
    }
  };

  const handleApplyDetectedPincode = (entry: PincodeEntry | null) => {
    if (!entry || !entry.pincode) return;
    const currentAddr = (consigneeAddress || purchaserAddress).trim();
    if (!currentAddr.includes(entry.pincode)) {
      const updatedAddr = currentAddr ? `${currentAddr}, PIN: ${entry.pincode}` : `PIN: ${entry.pincode}`;
      setConsigneeAddress(updatedAddr);
      setPurchaserAddress(updatedAddr);
    }
    if (entry.state) {
      handleConsigneeStateChange(entry.state);
    }
  };

  const handleSearchPincodes = async (queryText: string) => {
    const q = (queryText || consigneeAddress || purchaserAddress).trim();
    if (!q) {
      setPinSearchResults(searchPincodes('', 10));
      return;
    }
    setIsSearchingPin(true);
    try {
      const localMatches = searchPincodes(q, 8);
      setPinSearchResults(localMatches);

      const res = await fetch(`/api/pincode?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setPinSearchResults(data.results);
        }
      }
    } catch (err) {
      console.warn('PIN search warning:', err);
    } finally {
      setIsSearchingPin(false);
    }
  };

  // Two-way reactive auto calculation between Rate, Amount, Quantity and Cartons
  const handleLineQuantityChange = (val: string) => {
    setLineQuantity(val);
    if (lineUnit.toUpperCase() === 'CTN') {
      setTotalCartons(val);
    }
    const q = parseFloat(val);
    const r = parseFloat(lineRate);
    const a = parseFloat(lineAmount);
    if (!isNaN(q) && q > 0) {
      if (!isNaN(r) && r > 0) {
        const calcAmt = (q * r).toFixed(2);
        setLineAmount(calcAmt);
        setTaxableValue(calcAmt);
      } else if (!isNaN(a) && a > 0) {
        setLineRate((a / q).toFixed(2));
      }
    }
  };

  const handleLineRateChange = (val: string) => {
    setLineRate(val);
    const r = parseFloat(val);
    const q = parseFloat(lineQuantity);
    if (!isNaN(r) && r > 0 && !isNaN(q) && q > 0) {
      const calcAmt = (q * r).toFixed(2);
      setLineAmount(calcAmt);
      setTaxableValue(calcAmt);
    } else if (!val) {
      setLineAmount('');
    }
  };

  const handleLineAmountChange = (val: string) => {
    setLineAmount(val);
    setTaxableValue(val);
    const a = parseFloat(val);
    const q = parseFloat(lineQuantity);
    if (!isNaN(a) && a > 0 && !isNaN(q) && q > 0) {
      setLineRate((a / q).toFixed(2));
    } else if (!val) {
      setLineRate('');
      setLineAmount('');
    }
  };

  // Proportional CBM Calculation (strictly for biller reference, excluded from printed invoice/e-way bill)
  const calculatedProportionalCbm = useMemo(() => {
    if (!shipmentTotalCbm || shipmentTotalCbm <= 0) return null;
    const baseCtn = shipmentTotalCartons > 0 ? shipmentTotalCartons : (parseFloat(totalCartons) || 0);
    if (baseCtn <= 0) return null;

    let enteredCtn = 0;
    if (lineUnit.toUpperCase() === 'CTN') {
      enteredCtn = parseFloat(lineQuantity) || 0;
    } else if (lineUnit.toUpperCase() === 'PCS') {
      const pcs = parseFloat(lineQuantity) || 0;
      const basePcs = parseFloat(quantityPcs) || (baseCtn * 10);
      enteredCtn = basePcs > 0 ? (pcs / basePcs) * baseCtn : 0;
    } else if (lineUnit.toUpperCase() === 'KGS') {
      const kg = parseFloat(lineQuantity) || 0;
      const baseKg = parseFloat(quantityKg) || 0;
      enteredCtn = baseKg > 0 ? (kg / baseKg) * baseCtn : 0;
    }

    if (enteredCtn <= 0) {
      enteredCtn = parseFloat(totalCartons) || 0;
    }

    if (enteredCtn <= 0) return null;
    const prop = (enteredCtn / baseCtn) * shipmentTotalCbm;
    return Number(prop.toFixed(3));
  }, [shipmentTotalCbm, shipmentTotalCartons, totalCartons, lineUnit, lineQuantity, quantityPcs, quantityKg]);

  // 1-Hour Auto-Delete Management Helpers (Auto-deletes 1 hour after download)
  const ONE_HOUR_MS = 60 * 60 * 1000;

  const isArchivedDownloaded = (b: any) => {
    if (!b?.downloadedAt) return false;
    const diff = currentTime - new Date(b.downloadedAt).getTime();
    return diff >= ONE_HOUR_MS;
  };

  const getDownloadCountdown = (b: any) => {
    if (!b?.downloadedAt) return null;
    const diff = currentTime - new Date(b.downloadedAt).getTime();
    if (diff >= ONE_HOUR_MS) return null;
    const remainingSecs = Math.max(0, Math.ceil((ONE_HOUR_MS - diff) / 1000));
    const mins = Math.floor(remainingSecs / 60);
    const secs = String(remainingSecs % 60).padStart(2, '0');
    return `${mins}m ${secs}s`;
  };

  const handleMarkBillDownloaded = async (billId: string) => {
    if (!billId) return;
    const nowIso = new Date().toISOString();
    setBills((prev) =>
      prev.map((b) =>
        b._id === billId
          ? { ...b, isDownloaded: true, downloadedAt: nowIso, downloadCount: (b.downloadCount || 0) + 1 }
          : b
      )
    );
    try {
      await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: billId, action: 'mark_downloaded' }),
      });
    } catch (err) {
      console.warn('Failed to persist download timestamp:', err);
    }
  };

  // Calculated manual and multi-item values
  const invoiceTaxableTotal = useMemo(() => {
    if (invoiceItems.length > 0) {
      return Number(invoiceItems.reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2));
    }
    if (lineAmount && parseFloat(lineAmount) > 0) {
      return Number(parseFloat(lineAmount).toFixed(2));
    }
    const lineAmt = (parseFloat(lineQuantity) || 0) * (parseFloat(lineRate) || 0);
    if (lineAmt > 0) return Number(lineAmt.toFixed(2));
    return parseFloat(taxableValue) || 0;
  }, [invoiceItems, lineQuantity, lineRate, lineAmount, taxableValue]);

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
    if (shipment.receipt) {
      setManualInvoiceNo(shipment.receipt);
      setFormBillNumber(shipment.receipt);
    }
    setContainerAlias(shipment.container || singleContainer || '');
    const m = shipment.mainMarka || shipment.subMarka || shipment.marka || '';
    setMainMarka(shipment.mainMarka || shipment.marka || '');
    setSubMarka(shipment.subMarka || '');
    
    const desc = translateToEnglish(shipment.english || shipment.commodity || 'COMMERCIAL GOODS').trim();
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
      const addrs = markaAddress.addresses || [];
      const addr = addrs.length > 0 ? addrs[0].address : (markaAddress.consigneeAddress || markaAddress.purchaserAddress || '');
      setPurchaserAddress(addr);
      setConsigneeAddress(addr);

      if (addrs.length > 0) {
        setCurrentMarkaAddresses(addrs);
        const def = addrs.find((a: any) => a.isDefault) || addrs[0];
        setSelectedDeliveryAddressId(def._id || '');
        setConsigneeAddress(def.address || addr);
        setPurchaserAddress(def.address || addr);
        setAddressMode('select');
      } else if (addr) {
        setCurrentMarkaAddresses([{
          title: 'Primary Godown',
          address: addr,
          state: markaAddress.state || 'Delhi',
          stateCode: markaAddress.stateCode || '07',
          phone: markaAddress.phone || '',
          isDefault: true,
        }]);
        setAddressMode('select');
      }

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
      const q = currentBasePcs > 0 ? String(currentBasePcs) : (parseFloat(totalCartons) ? String(parseFloat(totalCartons) * 10) : lineQuantity);
      setLineQuantity(q);
      handleLineQuantityChange(q);
    } else if (u.includes('KG')) {
      const q = currentBaseKg > 0 ? String(currentBaseKg) : lineQuantity;
      setLineQuantity(q);
      handleLineQuantityChange(q);
    } else if (u.includes('CTN') || u.includes('CARTON')) {
      const q = totalCartons || (currentBaseCtn > 0 ? String(currentBaseCtn) : lineQuantity || '1');
      setLineQuantity(q);
      handleLineQuantityChange(q);
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
    setContainerAlias(cont);
    setLookupMessage(null);

    if (!cont.trim() || cont === 'all') {
      setSingleAvailableMarkas(globalMarkasList.map((m) => ({ marka: m })));
      if (singleSelectedMarka) {
        handleSingleMarkaChange(singleSelectedMarka, '');
      }
      return;
    }

    setIsLoadingCascade(true);
    try {
      const res = await fetch(`/api/billing/lookup?container=${encodeURIComponent(cont.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.container) setContainerAlias(data.container);
        const avail = data.markas || [];
        setSingleAvailableMarkas(avail);

        // If a marka was already selected, immediately re-reflect item name and quantity for the new container!
        if (singleSelectedMarka) {
          handleSingleMarkaChange(singleSelectedMarka, cont);
        }
      }
    } catch (err) {
      console.error('Cascade error:', err);
    } finally {
      setIsLoadingCascade(false);
    }
  };

  // Handle Marka change in Single Entry: Auto-reflects Item Name & Quantity from Container & Marka
  const handleSingleMarkaChange = async (m: string, overrideContainer?: string) => {
    const cleanMarka = m.trim();
    setSingleSelectedMarka(cleanMarka);
    setSingleSelectedReceipt('');
    setSingleAvailableReceipts([]);
    setLookupMessage(null);
    setMarkaCargoItems([]);

    if (!cleanMarka) {
      setCurrentMarkaAddresses([]);
      setSelectedDeliveryAddressId('');
      return;
    }

    setMainMarka(cleanMarka);
    setSelectedMarkas([cleanMarka]);

    // 1. Fetch saved address for this Marka immediately so it is ready for billing
    fetchMarkaDeliveryLocations(cleanMarka);

    setIsLoadingCascade(true);
    try {
      const queryParams = new URLSearchParams();
      const contToUse = overrideContainer !== undefined ? overrideContainer : singleContainer;
      if (contToUse && contToUse !== 'all') {
        queryParams.set('container', contToUse);
      }
      queryParams.set('marka', cleanMarka);

      const res = await fetch(`/api/billing/lookup?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const shipments = data.shipments || [];
        setSingleAvailableReceipts(shipments);

        // Group shipments by commodity so all cartons, weight and pcs in this container + marka are aggregated
        const itemMap = new Map<string, MarkaCargoItem>();
        let overallCtn = 0;
        let overallKg = 0;
        let overallReceipts: string[] = [];

        shipments.forEach((s: any) => {
          const d = translateToEnglish(s.english || s.commodity || 'COMMERCIAL GOODS').trim();
          const c = Number(s.cartons || s.quantity) || 0;
          const k = Number(s.weightKg || s.weight) || 0;
          const p = c > 0 ? c * 10 : 0;
          overallCtn += c;
          overallKg += k;
          if (s.receipt && !overallReceipts.includes(s.receipt)) {
            overallReceipts.push(s.receipt);
          }

          const key = d.toLowerCase();
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            existing.cartons += c;
            existing.weightKg = Number((existing.weightKg + k).toFixed(2));
            existing.pcs += p;
            if (s.receipt && !existing.receipt?.includes(s.receipt)) {
              existing.receipt = existing.receipt ? `${existing.receipt}, ${s.receipt}` : s.receipt;
            }
          } else {
            itemMap.set(key, {
              marka: cleanMarka,
              description: d,
              hsnCode: s.hsnCode || '39269099',
              cartons: c,
              weightKg: k,
              pcs: p,
              receipt: s.receipt,
            });
          }
        });

        const extractedItems = Array.from(itemMap.values());
        setMarkaCargoItems(extractedItems);

        // Apply Marka saved address & party details
        if (data.markaAddress) {
          applyShipmentToForm(shipments[0] || { mainMarka: cleanMarka }, data.markaAddress);
        } else if (shipments.length > 0) {
          applyShipmentToForm(shipments[0]);
        }

        // Auto-select first item: Automatically reflect Item Name and Quantity!
        if (extractedItems.length > 0) {
          const first = extractedItems[0];
          setSelectedCargoDropdown(first.description);
          setLineDescription(first.description);
          setCommodity(first.description);
          setLineHsn(first.hsnCode || '39269099');
          setHsnCode(first.hsnCode || '39269099');

          // Base quantities
          setCurrentBasePcs(first.pcs);
          setCurrentBaseKg(first.weightKg);
          setCurrentBaseCtn(first.cartons);
          setTotalCartons(first.cartons ? String(first.cartons) : '');
          setQuantityKg(first.weightKg ? String(first.weightKg) : '');
          setQuantityPcs(first.pcs ? String(first.pcs) : '');

          // Automatically reflect quantity according to active unit (PCS, KGS, CTN)
          const u = lineUnit.toUpperCase();
          if (u === 'PCS') {
            setLineQuantity(first.pcs ? String(first.pcs) : '');
          } else if (u.includes('KG')) {
            setLineQuantity(first.weightKg ? String(first.weightKg) : '');
          } else if (u.includes('CTN') || u.includes('CARTON')) {
            setLineQuantity(first.cartons ? String(first.cartons) : '');
          }

          if (overallReceipts.length > 0) {
            setReceiptNo(overallReceipts.join(', '));
            setSingleSelectedReceipt(overallReceipts[0]);
          }

          // Trigger HSN lookup / inference for the item automatically
          handleChooseCargoItem(first.description, first.hsnCode);

          setLookupMessage(
            `✓ Container [${contToUse || 'All'}] & Marka [${cleanMarka}]: Item "${first.description}" and Quantity (${first.cartons} CTN / ${first.weightKg} KG / ${first.pcs} PCS) automatically reflected!`
          );
        } else {
          setLookupMessage(`Cargo loaded for Marka [${cleanMarka}].`);
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
      setLookupMessage('No Marka selected.');
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
          const d = translateToEnglish(s.english || s.commodity || 'COMMERCIAL GOODS').trim();
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
        `✓ ${nextList.length} Markas selected [${nextList.join(', ')}] | Total ${combinedItems.length} cargo items loaded.`
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
      alert('Please enter a valid dispatch quantity to calculate proportionate values.');
      return;
    }

    setLineQuantity(String(res.targetQty));
    if (res.ctn > 0) setTotalCartons(String(res.ctn));
    if (res.kg > 0) setQuantityKg(String(res.kg));
    if (res.pcs > 0) setQuantityPcs(String(res.pcs));

    setManualSuccessMsg(
      `✓ Proportionate values applied: ${res.ctn} CTN | ${res.kg} KG | ${res.pcs} PCS -> Invoice Quantity: ${res.targetQty} ${lineUnit}`
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

    // Check same date (Skip warning if bill date is different)
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
        `⚠️ Vehicle Cumulative Limit Warning:\n\n` +
        `Vehicle No: ${vehicleNo.trim().toUpperCase()}\n` +
        `Date: ${todayDateStr}\n` +
        `Bills previously assigned to this vehicle today: ${matchingBillsOnSameDate.length} bills (Total Amount: ₹${existingVehicleTotal.toLocaleString('en-IN')})\n` +
        `Current Bill Amount: ₹${newBillAmount.toLocaleString('en-IN')}\n` +
        `Cumulative Total on Vehicle: ₹${cumulativeTotal.toLocaleString('en-IN')}\n\n` +
        `This amount exceeds the mandatory threshold without E-Way Bill (₹${threshold.toLocaleString('en-IN')} - ${isDelhi ? 'Intra-Delhi' : 'Inter-State'})!\n\n` +
        `Are you sure you want to process this bill without an E-Way Bill?\n` +
        `Click 'OK' to confirm, or 'Cancel' to enter E-Way Bill No. first.`;
      return { requiresConfirm: true, message: msg };
    }

    return { requiresConfirm: false };
  };

  // Handle Receipt select in Single Entry
  const handleSingleReceiptSelect = async (rNo: string) => {
    setSingleSelectedReceipt(rNo);
    if (!rNo.trim()) return;
    setManualInvoiceNo(rNo.trim());
    setFormBillNumber(rNo.trim());
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
    setManualInvoiceNo('');
    setFormBillNumber('');
    setDetectedPincodeInfo(null);
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
  const handleReceiptLookup = async (
    rNo: string,
    overrides?: {
      cartonCount?: string;
      vehicleNumber?: string;
      destination?: string;
      commodity?: string;
    }
  ) => {
    const clean = rNo.trim();
    if (!clean || clean.length < 3) return;
    // Rule: Receipt No is Bill No
    setManualInvoiceNo(clean);
    setFormBillNumber(clean);
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
          const itemDesc = overrides?.commodity || af.commodity || data.shipment?.commodity || data.shipment?.english || 'COMMERCIAL GOODS';
          setCommodity(itemDesc);
          setLineDescription(itemDesc);
          setSelectedCargoDropdown(itemDesc);

          const dbCtn = Number(af.totalCartons || data.shipment?.packages || data.shipment?.quantity) || 0;
          setShipmentTotalCartons(dbCtn);

          if (overrides?.cartonCount) {
            setTotalCartons(overrides.cartonCount);
            setLineQuantity(overrides.cartonCount);
            setLineUnit('CTN');
          } else if (dbCtn > 0) {
            setTotalCartons(String(dbCtn));
            if (!lineQuantity || lineQuantity === '0') {
              setLineQuantity(String(dbCtn));
              setLineUnit('CTN');
            }
          }

          if (overrides?.vehicleNumber) {
            setFormVehicleNumber(overrides.vehicleNumber);
          }
          if (overrides?.destination) {
            setFormDestination(overrides.destination);
          }

          if (af.volume !== undefined) {
            setShipmentTotalCbm(Number(af.volume) || 0);
          }
          if (af.quantityPcs && !quantityPcs) setQuantityPcs(String(af.quantityPcs));
          if (af.quantityKg && !quantityKg) setQuantityKg(String(af.quantityKg));
          if (af.taxableValue && !taxableValue) setTaxableValue(String(af.taxableValue));

          // Auto-fetch HSN Code for this commodity
          let fetchedHsn = af.hsnCode || '';
          if (!fetchedHsn && itemDesc) {
            try {
              const hsnRes = await fetch(`/api/hsn?q=${encodeURIComponent(itemDesc)}`);
              if (hsnRes.ok) {
                const hsnData = await hsnRes.json();
                if (hsnData.inferredHsn) {
                  fetchedHsn = hsnData.inferredHsn;
                } else if (hsnData.suggestions && hsnData.suggestions.length > 0) {
                  fetchedHsn = hsnData.suggestions[0].hsnCode;
                }
              }
            } catch (err) {
              console.warn('Auto HSN lookup note:', err);
            }
          }
          if (!fetchedHsn) {
            const inferred = inferHsnByItemName(itemDesc);
            if (inferred) fetchedHsn = inferred.hsnCode;
          }
          if (!fetchedHsn) {
            fetchedHsn = '39269099';
          }
          setHsnCode(fetchedHsn);
          setLineHsn(fetchedHsn);

          // Seed markaCargoItems with this item description so dropdown immediately lists it
          setMarkaCargoItems((prev) => {
            if (prev.some((it) => it.description.toLowerCase() === itemDesc.toLowerCase())) return prev;
            return [
              {
                marka: af.mainMarka || af.subMarka || '',
                description: itemDesc,
                hsnCode: fetchedHsn,
                pcs: Number(af.quantityPcs) || (dbCtn > 0 ? dbCtn * 10 : 0),
                weightKg: Number(af.quantityKg) || 0,
                cartons: overrides?.cartonCount ? Number(overrides.cartonCount) : dbCtn || 1,
              },
              ...prev,
            ];
          });

          // Sync cascade selector values
          if (af.container && !singleContainer) {
            setSingleContainer(af.container);
          }
          if ((af.mainMarka || af.subMarka) && !singleSelectedMarka) {
            setSingleSelectedMarka(af.mainMarka || af.subMarka);
          }
          setSingleSelectedReceipt(clean);
          if (clean && (!formBillNumber || formBillNumber.startsWith('BILL-') || formBillNumber === clean)) {
            setFormBillNumber(clean);
          }

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

          // Auto-fill party name & registration details from Marka Directory
          if (ma.purchaserName) {
            setPurchaserName(ma.purchaserName);
            setPartyName(ma.purchaserName);
          }
          if (ma.registrationType) {
            setRegistrationType(ma.registrationType);
          }
          if (ma.gstin) {
            setPurchaserGstin(ma.gstin);
          }
          if (ma.phone) {
            setPurchaserPhone(ma.phone);
          }
          if (ma.buyerName) {
            setBuyerName(ma.buyerName);
          }
          if (ma.buyerGstin) {
            setBuyerGstin(ma.buyerGstin);
          }
          if (ma.buyerAddress) {
            setBuyerAddress(ma.buyerAddress);
          }
          if (ma.buyerState) {
            setBuyerState(ma.buyerState);
          }
          if (ma.buyerStateCode) {
            setBuyerStateCode(ma.buyerStateCode);
          }
          if (ma.state) setConsigneeState(ma.state);
          if (ma.stateCode) setConsigneeStateCode(ma.stateCode);

          if (addrs.length > 0) {
            setAddressMode('select');
            const def = addrs.find((a: any) => a.isDefault) || addrs[0];
            setSelectedDeliveryAddressId(def._id || '');
            setConsigneeAddress(def.address || '');
            setPurchaserAddress(def.address || '');
            if (def.state) setConsigneeState(def.state);
            if (def.stateCode) setConsigneeStateCode(def.stateCode);
            if (def.phone) setPurchaserPhone(def.phone);
            setSameAsConsignee(!ma.buyerAddress || ma.buyerAddress === def.address);
          } else if (ma.consigneeAddress || ma.purchaserAddress || ma.buyerAddress) {
            const fallbackStr = (ma.consigneeAddress || ma.purchaserAddress || ma.buyerAddress || '').trim();
            const fallbackObj = {
              title: 'Primary Godown',
              address: fallbackStr,
              state: ma.state || 'Delhi',
              stateCode: ma.stateCode || '07',
              phone: ma.phone || '',
              isDefault: true,
            };
            setCurrentMarkaAddresses([fallbackObj]);
            setConsigneeAddress(fallbackStr);
            setPurchaserAddress(fallbackStr);
            setAddressMode('select');
            setSameAsConsignee(!ma.buyerAddress || ma.buyerAddress === fallbackStr);
          } else {
            setCurrentMarkaAddresses([]);
            setSelectedDeliveryAddressId('');
            setAddressMode('new');
            setSameAsConsignee(!ma.buyerAddress);
          }
        } else {
          setCurrentMarkaAddresses([]);
          setSelectedDeliveryAddressId('');
          setAddressMode('new');
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
      alert('Please select a Marka first to save the address.');
      return;
    }
    if (!newLocAddress.trim()) {
      alert('Please enter complete Delivery Address.');
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
      alert(`New sending location saved for Marka '${currentMarka}'!`);
    } catch (err: any) {
      alert(err.message || 'Error saving location');
    } finally {
      setIsSavingNewLoc(false);
    }
  };

  // Delete a specific location from a Marka
  const handleDeleteLocation = async (marka: string, addressId: string) => {
    if (!confirm('Are you sure you want to delete this saved address?')) return;
    setIsDeletingLocationId(addressId);
    try {
      const res = await fetch(`/api/marka-addresses?marka=${encodeURIComponent(marka)}&addressId=${encodeURIComponent(addressId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete address');

      await fetchMarkaDeliveryLocations(marka);
      setMarkaSaveSuccess('✓ Address deleted successfully!');
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
      setMarkaSaveSuccess('✓ Address updated successfully!');
      setTimeout(() => setMarkaSaveSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Error updating address');
    }
  };

  // Add Item to Multi-Item Invoice Builder
  const handleAddLineItem = () => {
    if (!lineDescription.trim()) {
      alert('Please enter Item Description.');
      return;
    }
    const qty = parseFloat(lineQuantity) || 0;
    if (qty <= 0) {
      alert('Please enter a valid Quantity.');
      return;
    }
    let r = parseFloat(lineRate) || 0;
    const a = parseFloat(lineAmount) || 0;
    if (r <= 0 && a > 0 && qty > 0) {
      r = Number((a / qty).toFixed(2));
      setLineRate(String(r));
    }
    if (r <= 0) {
      alert('Please enter a valid Rate or Total Value.');
      return;
    }

    const finalHsn = (lineHsn || hsnCode || '').trim();
    if (!finalHsn || finalHsn.length < 4 || !/^\d+$/.test(finalHsn)) {
      alert('Please enter a valid HSN / SAC code (4 to 8 digits). HSN code is mandatory per GST rules.');
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
    setLineAmount('');
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
      alert('Please enter Party / Consignee Legal Name.');
      return;
    }

    if (!editBillData.consigneeAddress.trim()) {
      alert('Please enter Delivery Address.');
      return;
    }

    if (editBillData.items.length === 0) {
      alert('At least one item is required.');
      return;
    }

    for (const it of editBillData.items) {
      const itHsn = (it.hsnCode || '').trim();
      if (!itHsn || itHsn.length < 4 || !/^\d+$/.test(itHsn)) {
        alert(
          `HSN / SAC code is mandatory!\n\nPlease enter a valid 4 to 8 digit HSN code for item "${it.description || 'Item'}".`
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
        `⚠️ E-Way Bill is mandatory!\n\nIntra-Delhi bills exceeding ₹1,00,000 (Current: ₹${grandTotal.toLocaleString('en-IN')}) require an E-Way Bill Number.\n\nPlease enter E-Way Bill No.`
      );
      return;
    }
    if (!isDelhi && grandTotal > 50000 && !editBillData.eWayBillNo.trim()) {
      alert(
        `⚠️ E-Way Bill is mandatory!\n\nInter-State bills exceeding ₹50,000 (Current: ₹${grandTotal.toLocaleString('en-IN')}) require an E-Way Bill Number.\n\nPlease enter E-Way Bill No.`
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

      generateBillPDF({ ...updatedBill, theme: pdfTheme }, true);
      alert('✓ Bill updated successfully and new PDF downloaded!');
    } catch (err: any) {
      alert(err.message || 'Error updating bill');
    } finally {
      setIsSavingEditBill(false);
    }
  };

  // Open e-Way Bill Quick Print Modal
  const handleOpenEWayPrintModal = (bill: any, initialMode: 'both' | 'eway' = 'both') => {
    setEWayModalBill({ ...bill, printMode: initialMode });
    setEWayModalInputNo(bill.eWayBillNo || '');
    setEWayModalVehicleNo(bill.vehicleNumber || '');
  };

  const handleConfirmPrintEWay = async (mode: 'both' | 'eway') => {
    if (!eWayModalBill) return;
    const cleanEWayNo = eWayModalInputNo.trim();
    const cleanVehNo = eWayModalVehicleNo.trim();

    if (eWayModalBill._id && (cleanEWayNo || cleanVehNo)) {
      setIsSavingEWayModal(true);
      try {
        await fetch('/api/billing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: eWayModalBill._id,
            eWayBillNo: cleanEWayNo || undefined,
            vehicleNumber: cleanVehNo || undefined,
          }),
        });

        // Update local bills state
        setBills((prev) =>
          prev.map((b) =>
            b._id === eWayModalBill._id
              ? {
                  ...b,
                  eWayBillNo: cleanEWayNo || b.eWayBillNo,
                  vehicleNumber: cleanVehNo || b.vehicleNumber,
                }
              : b
          )
        );
      } catch (err) {
        console.warn('Failed to update eWayBillNo:', err);
      } finally {
        setIsSavingEWayModal(false);
      }
    }

    const updatedData = {
      ...eWayModalBill,
      eWayBillNo: cleanEWayNo || eWayModalBill.eWayBillNo,
      vehicleNumber: cleanVehNo || eWayModalBill.vehicleNumber,
    };

    if (eWayModalBill?._id) {
      handleMarkBillDownloaded(eWayModalBill._id);
    }
    if (mode === 'both') {
      generateBothBillAndEWayPDF(updatedData, true);
    } else {
      generateEWayBillPDF(updatedData, true);
    }

    setEWayModalBill(null);
  };

  const handleSaveJustCreatedEWayNo = async () => {
    if (!justCreatedBill?._id || !justCreatedEWayNo.trim()) return;
    setIsSavingJustCreatedEWay(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: justCreatedBill._id,
          eWayBillNo: justCreatedEWayNo.trim(),
        }),
      });
      if (res.ok) {
        setJustCreatedBill((prev: any) => ({ ...prev, eWayBillNo: justCreatedEWayNo.trim() }));
        setBills((prev) =>
          prev.map((b) =>
            b._id === justCreatedBill._id ? { ...b, eWayBillNo: justCreatedEWayNo.trim() } : b
          )
        );
      }
    } catch (err) {
      console.error('Failed to save e-Way Bill No:', err);
    } finally {
      setIsSavingJustCreatedEWay(false);
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
      alert('Please enter Vehicle Number.');
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
      alert(`Success! Updated vehicle number '${bulkVehicleInput.trim()}' on ${updatedCount} bills.`);
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

  // ---- PREFILL RANDOM DATA: UNREGISTERED DELHI PARTIES ONLY ----
  const PREFILL_COMPANIES = [
    { name: 'Delhi Trading Company', phone: '9811234567' },
    { name: 'Shiv Trading Co.', phone: '9899876543' },
    { name: 'Vishnu Trading Company', phone: '9412345678' },
    { name: 'Aggarwal Trading Company', phone: '9871122334' },
    { name: 'Kamakhya Trading Company', phone: '9435567890' },
    { name: 'Krishna Trading Company', phone: '9837654321' },
    { name: 'Aggarwal Brothers & Sons', phone: '9818899776' },
  ];

  // Comprehensive Delhi Industrial Areas and Main Business Markets
  const DELHI_BUSINESS_AND_INDUSTRIAL_ADDRESSES = [
    'SHOP NO -17/18, MAIN ROAD, SADAR BAZAR, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, GANDHI NAGAR TEXTILE MARKET, DELHI - 110031',
    'SHOP NO -17/18, MAIN ROAD, NAYA BAZAR, CHANDNI CHOWK, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, BHAGIRATH PALACE ELECTRICAL MARKET, CHANDNI CHOWK, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, CHAWRI BAZAR, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, AJMAL KHAN ROAD, KAROL BAGH, NEW DELHI - 110005',
    'SHOP NO -17/18, MAIN ROAD, GAFFAR MARKET, KAROL BAGH, NEW DELHI - 110005',
    'SHOP NO -17/18, MAIN ROAD, KASHMERE GATE AUTO SPARE PARTS MARKET, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, MORI GATE, DELHI - 110006',
    'SHOP NO -17/18, MAIN ROAD, LAJPAT NAGAR CENTRAL MARKET, NEW DELHI - 110024',
    'SHOP NO -17/18, MAIN ROAD, CENTRAL MARKET, TILAK NAGAR, NEW DELHI - 110018',
    'SHOP NO -17/18, MAIN ROAD, BUNGALOW ROAD, KAMLA NAGAR, DELHI - 110007',
    'SHOP NO -17/18, MAIN ROAD, OKHLA INDUSTRIAL AREA PHASE-I, NEW DELHI - 110020',
    'SHOP NO -17/18, MAIN ROAD, OKHLA INDUSTRIAL AREA PHASE-II, NEW DELHI - 110020',
    'SHOP NO -17/18, MAIN ROAD, OKHLA INDUSTRIAL AREA PHASE-III, NEW DELHI - 110020',
    'SHOP NO -17/18, MAIN ROAD, NARAINA INDUSTRIAL AREA PHASE-I, NEW DELHI - 110028',
    'SHOP NO -17/18, MAIN ROAD, NARAINA INDUSTRIAL AREA PHASE-II, NEW DELHI - 110028',
    'SHOP NO -17/18, MAIN ROAD, MAYAPURI INDUSTRIAL AREA PHASE-I, NEW DELHI - 110064',
    'SHOP NO -17/18, MAIN ROAD, MAYAPURI INDUSTRIAL AREA PHASE-II, NEW DELHI - 110064',
    'SHOP NO -17/18, MAIN ROAD, KIRTI NAGAR INDUSTRIAL AREA, NEW DELHI - 110015',
    'SHOP NO -17/18, MAIN ROAD, WAZIRPUR INDUSTRIAL AREA, DELHI - 110052',
    'SHOP NO -17/18, MAIN ROAD, LAWRENCE ROAD INDUSTRIAL AREA, DELHI - 110035',
    'SHOP NO -17/18, MAIN ROAD, SECTOR 1, BAWANA INDUSTRIAL AREA, DELHI - 110039',
    'SHOP NO -17/18, MAIN ROAD, SECTOR 2, BAWANA INDUSTRIAL AREA, DELHI - 110039',
    'SHOP NO -17/18, MAIN ROAD, SECTOR 3, BAWANA INDUSTRIAL AREA, DELHI - 110039',
    'SHOP NO -17/18, MAIN ROAD, DSIIDC INDUSTRIAL AREA, NARELA, DELHI - 110040',
    'SHOP NO -17/18, MAIN ROAD, PATPARGANJ FUNCTIONAL INDUSTRIAL ESTATE, DELHI - 110092',
    'SHOP NO -17/18, MAIN ROAD, MANGOLPURI INDUSTRIAL AREA PHASE-I, DELHI - 110083',
    'SHOP NO -17/18, MAIN ROAD, MANGOLPURI INDUSTRIAL AREA PHASE-II, DELHI - 110083',
    'SHOP NO -17/18, MAIN ROAD, JHILMIL INDUSTRIAL AREA, SHAHDARA, DELHI - 110095',
    'SHOP NO -17/18, MAIN ROAD, MOHAN COOPERATIVE INDUSTRIAL ESTATE, MATHURA ROAD, NEW DELHI - 110044',
    'SHOP NO -17/18, MAIN ROAD, ANAND PARBAT INDUSTRIAL AREA, NEW DELHI - 110005',
    'SHOP NO -17/18, MAIN ROAD, LIBASPUR INDUSTRIAL AREA, GT KARNAL ROAD, DELHI - 110042',
    'SHOP NO -17/18, MAIN ROAD, SMA INDUSTRIAL ESTATE, GT KARNAL ROAD, DELHI - 110033',
    'SHOP NO -17/18, MAIN ROAD, RAJASTHANI UDYOG NAGAR, GT KARNAL ROAD, DELHI - 110033',
    'SHOP NO -17/18, MAIN ROAD, BADARPUR EXTENSION, NEW DELHI - 110044',
    'SHOP NO -17/18, MAIN ROAD, SHAKURPUR INDUSTRIAL AREA, DELHI - 110034',
    'SHOP NO -17/18, MAIN ROAD, SEELAMPUR MARKET, DELHI - 110053',
  ];

  const handlePrefillRandomData = () => {
    const randomCompany = PREFILL_COMPANIES[Math.floor(Math.random() * PREFILL_COMPANIES.length)];
    const randomAddress = DELHI_BUSINESS_AND_INDUSTRIAL_ADDRESSES[Math.floor(Math.random() * DELHI_BUSINESS_AND_INDUSTRIAL_ADDRESSES.length)];

    // Strictly UNREGISTERED & DELHI PARTY ONLY
    setRegistrationType('Unregistered');
    setPurchaserGstin('');
    setPurchaserName(randomCompany.name);
    setConsigneeAddress(randomAddress);
    setPurchaserAddress(randomAddress);
    setConsigneeState('Delhi');
    setConsigneeStateCode('07');
    setPurchaserPhone(randomCompany.phone);

    // Fill Buyer details (same as consignee, Unregistered Delhi)
    setBuyerName(randomCompany.name);
    setBuyerAddress(randomAddress);
    setBuyerGstin('');
    setBuyerState('Delhi');
    setBuyerStateCode('07');
    setSameAsConsignee(true);

    // Switch to "new" address mode so the user can see, edit and save this address for the future!
    setAddressMode('new');

    setLookupMessage(`✓ Prefilled: ${randomCompany.name} (Unregistered / Delhi) | ${randomAddress.slice(0, 48)}...`);
  };

  // Instant save current address and party name for selected Marka directly from form
  const handleInstantSaveMarkaAddress = async () => {
    const rawMarka = (mainMarka || subMarka || singleSelectedMarka).trim();
    const currentMarka = rawMarka.split(',')[0].trim();
    if (!currentMarka) {
      alert('Please select or enter a Marka first in Step 1.');
      return;
    }
    if (!purchaserName.trim()) {
      alert('Please enter Purchaser / Company party name in Step 3.');
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
      if (!res.ok) throw new Error(data.error || 'Failed to save party name');

      setMarkaSaveSuccess(`✓ Party "${purchaserName.trim()}" and address saved for Marka [${currentMarka}]!`);
      await loadMarkaAddresses();
      await fetchMarkaDeliveryLocations(currentMarka);
      setAddressMode('select');
      setTimeout(() => setMarkaSaveSuccess(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to save marka party');
    } finally {
      setIsSavingMarkaDirect(false);
    }
  };

  // Download Specific Container's Manifest in Excel (User's workflow requirement: Select container -> download Excel -> update & re-upload)
  const handleDownloadContainerExcel = async () => {
    if (!selectedDownloadContainer) {
      alert('Please select a container number first.');
      return;
    }

    setIsDownloadingContainer(true);
    try {
      const res = await fetch(`/api/billing/container-manifest?container=${encodeURIComponent(selectedDownloadContainer.trim())}`);
      if (!res.ok) throw new Error('Failed to fetch container manifest');
      const data = await res.json();
      const rows = data.manifestRows || [];

      if (rows.length === 0) {
        alert(`No shipment records found in container '${selectedDownloadContainer}'.`);
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
      XLSX.utils.book_append_sheet(wb, wsHelp, 'Instructions_Guide');

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
      const curQty = parseFloat(lineQuantity) || parseFloat(totalCartons) || parseFloat(quantityPcs) || parseFloat(quantityKg) || 1;
      let curRate = parseFloat(lineRate) || parseFloat(itemRate) || 0;
      let curAmt = parseFloat(lineAmount) || parseFloat(taxableValue) || 0;
      const curHsn = (lineHsn || hsnCode || '39269099').trim();
      const curUnit = (lineUnit || billingUnit || 'CTN').trim().toUpperCase();

      if (curAmt > 0 && curRate <= 0) {
        curRate = Number((curAmt / curQty).toFixed(2));
      } else if (curRate > 0 && curAmt <= 0) {
        curAmt = Number((curQty * curRate).toFixed(2));
      }

      if (curAmt > 0 || curRate > 0) {
        finalItems.push({
          itemNo: 1,
          description: curDesc,
          hsnCode: curHsn,
          quantity: curQty,
          unit: curUnit,
          rate: curRate > 0 ? curRate : Number((curAmt / curQty).toFixed(2)),
          amount: curAmt > 0 ? curAmt : Number((curQty * curRate).toFixed(2)),
        });
      }
    }

    if (finalItems.length === 0 && (!taxableValue || parseFloat(taxableValue) <= 0)) {
      alert('Please enter Rate or Total Amount to generate bill.');
      return;
    }

    // 2b. Mandatory HSN Validation for All Items
    for (const it of finalItems) {
      const itHsn = (it.hsnCode || '').trim();
      if (!itHsn || itHsn.length < 4 || !/^\d+$/.test(itHsn)) {
        alert(
          `HSN / SAC code is mandatory!\n\nPlease enter a valid 4 to 8 digit HSN code for item "${it.description || 'Item'}".`
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
          ? `E-Way Bill is mandatory!\n\nIntra-State bills exceeding ₹1,00,000 require an E-Way Bill Number.\nCurrent Bill Amount: ₹${finalTotalBillAmt.toLocaleString('en-IN')}\n\nPlease enter E-Way Bill No. in Step 2.`
          : `E-Way Bill is mandatory!\n\nInter-State bills exceeding ₹50,000 require an E-Way Bill Number.\nCurrent Bill Amount: ₹${finalTotalBillAmt.toLocaleString('en-IN')}\n\nPlease enter E-Way Bill No. in Step 2.`
      );
      return;
    }

    // 4b. Vehicle Cumulative Limit Rule (₹1,00,000 Intra-Delhi, ₹50,000 Inter-State per vehicle on same date)
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

    const separateEWayInv = (useSeparateEWayInvoice || isEWayBillRequired) && eWayInvoiceNumber.trim();
    const finalBillNumber = (separateEWayInv ? eWayInvoiceNumber.trim() : (formBillNumber.trim() || finalReceiptNo)).trim();

    setIsSubmittingManual(true);
    setManualSuccessMsg(null);
    setJustCreatedBill(null);

    try {
      const payload = {
        billNumber: (manualInvoiceNo.trim() || finalBillNumber),
        eWayInvoiceNumber: separateEWayInv ? eWayInvoiceNumber.trim() : undefined,
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

      const createdBillRecord = (data.bills && data.bills[0]) || data.bill || { ...payload, _id: data._id || 'temp', totalAmount: finalTotalBillAmt };
      setJustCreatedBill(createdBillRecord);

      // Auto-download PDF option: Trigger immediate download upon generation
      if (autoDownloadOnGenerate) {
        try {
          if (createdBillRecord.eWayBillNo) {
            generateBothBillAndEWayPDF(createdBillRecord, true);
          } else {
            generateBillPDF(createdBillRecord, true);
          }
          if (createdBillRecord._id && createdBillRecord._id !== 'temp') {
            handleMarkBillDownloaded(createdBillRecord._id);
          }
        } catch (dlErr) {
          console.warn('Auto download error on bill generation:', dlErr);
        }
      }

      if (activeDispatchRequestId) {
        try {
          await fetch('/api/dispatcher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'mark_billed',
              requestId: activeDispatchRequestId,
              billId: createdBillRecord._id,
              billNumber: createdBillRecord.billNumber || finalBillNumber,
            }),
          });
          setActiveDispatchRequestId(null);
          fetchDispatchRequests();
        } catch (err) {
          console.warn('Failed to mark dispatch request billed:', err);
        }
      }

      // Auto-save address for Marka
      if (currentMarka && finalPurchaser) {
        handleInstantSaveMarkaAddress().catch((err: any) => console.warn('Background marka save:', err));
      }

      setManualSuccessMsg(
        autoDownloadOnGenerate
          ? `✓ Bill generated and downloaded successfully! Bill No #${finalBillNumber} (Receipt #${finalReceiptNo}) — Auto-deletes in 1 hour`
          : `✓ Bill generated successfully! Bill No #${finalBillNumber} (Receipt #${finalReceiptNo})`
      );
      // Reset form
      setReceiptNo('');
      setManualInvoiceNo('');
      setFormBillNumber('');
      setEWayInvoiceNumber('');
      setUseSeparateEWayInvoice(false);
      setDetectedPincodeInfo(null);
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

  // Counts for 1-Hour Auto-Delete Download Management
  const undownloadedCount = useMemo(() => {
    return bills.filter((b) => !b.isDownloaded && !b.downloadedAt).length;
  }, [bills]);

  const downloadedCount = useMemo(() => {
    return bills.filter(
      (b) => b.downloadedAt && currentTime - new Date(b.downloadedAt).getTime() < ONE_HOUR_MS
    ).length;
  }, [bills, currentTime]);

  // Filtered Bills (Exclude bills expired 1 hour after download)
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // 1-Hour Auto-Delete: If downloaded > 1 hour ago, do not display (auto-purged)
      if (b.downloadedAt && currentTime - new Date(b.downloadedAt).getTime() >= ONE_HOUR_MS) {
        return false;
      }

      if (downloadFilter === 'undownloaded' && (b.isDownloaded || b.downloadedAt)) return false;
      if (downloadFilter === 'downloaded' && (!b.isDownloaded && !b.downloadedAt)) return false;

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
    try {
      await clearMobileSession();
    } catch {}
    window.location.href = '/admin/login?logged_out=true';
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 pb-24 transition-colors duration-200"
      data-theme={currentTheme}
    >
      {/* Top Header */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-0 min-h-16 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-1.5 sm:p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-black text-sm sm:text-base text-white tracking-tight">US INTERNATIONAL</span>
                <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 rounded-full">
                  Biller Portal
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Container Selection, Excel Download, Billing Units (Pcs/KG/CTN) & Bills</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* QUICK DAY / NIGHT MODE TOGGLE BUTTON */}
            <button
              type="button"
              onClick={toggleDayNightMode}
              className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-bold transition shadow-sm"
              title="Toggle Day Mode / Night Mode"
            >
              {currentTheme === 'light' || currentTheme === 'high-contrast-day' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-200 hidden sm:inline">Night Mode 🌙</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-200 hidden sm:inline">Day Mode ☀️</span>
                </>
              )}
            </button>

            {/* MULTI-THEME SELECTOR */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
              <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={currentTheme}
                onChange={(e) => handleThemeChange(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer pr-1"
                title="Select Billing System Theme"
              >
                <option value="dark" className="bg-slate-900 text-white">🌙 Dark</option>
                <option value="light" className="bg-white text-slate-900">☀️ Light</option>
                <option value="midnight" className="bg-slate-950 text-cyan-300">🌌 Midnight</option>
                <option value="emerald" className="bg-slate-950 text-emerald-300">🌲 Emerald</option>
                <option value="amber" className="bg-slate-950 text-amber-300">🌅 Amber</option>
                <option value="purple" className="bg-slate-950 text-purple-300">🟣 Cyber Purple</option>
                <option value="ocean" className="bg-slate-950 text-sky-300">🌊 Oceanic Teal</option>
                <option value="crimson" className="bg-slate-950 text-rose-300">🌹 Rose Crimson</option>
                <option value="high-contrast-day" className="bg-white text-black font-bold">⚡ High Contrast Day</option>
              </select>
            </div>

            <Link
              href="/dispatcher"
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dispatcher</span>
            </Link>
            <Link
              href="/admin"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin</span>
            </Link>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300 text-xs font-semibold transition"
              title="Change Password"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Password</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Logout</span>
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
                  <span>Download Container Billing Data</span>
                </div>
                <h2 className="text-sm font-black text-white">
                  Select container, download Excel template, fill HSN/Tax, and re-upload
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
                  placeholder="Type container # (e.g. 208, USSI-139)"
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
              <span>Select Container (e.g. USSI-139 / 208)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">2</span>
              <span>Fill HSN, IGST, Unit (Pcs/KG/CTN) & Taxable in Excel</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">3</span>
              <span>Upload updated Excel below — generate all bills instantly!</span>
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
                  Billing Company / Seller (Invoice Header)
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
              title="Manage saved Party Names, GSTIN, and Addresses for each Marka"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Marka &amp; Party Directory</span>
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
                <span>Excel Bulk Upload</span>
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
                <span>Single Bill Entry</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition ${
                  activeTab === 'requests'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>Pending Dispatch Requests</span>
                {pendingDispatchRequests.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-500 text-slate-950 animate-pulse">
                    {pendingDispatchRequests.length}
                  </span>
                )}
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
                          <span>Generate All {excelRows.length} Bills in Bulk</span>
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
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl flex items-center justify-between text-xs text-emerald-200">
                <div className="flex items-center space-x-2">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <span className="font-bold">Pending Dispatch Requests from Dispatcher:</span>
                    <p className="text-[11px] text-slate-400">
                      Click 'Initiate Billing' to auto-fill vehicle number, cartons, address, and receipt.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchDispatchRequests}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-xl font-bold border border-emerald-700/50 flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {pendingDispatchRequests.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No pending dispatch requests.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-4">Receipt #</th>
                        <th className="py-3 px-4">Marka</th>
                        <th className="py-3 px-4">Item Name</th>
                        <th className="py-3 px-4">Container</th>
                        <th className="py-3 px-4">Vehicle No</th>
                        <th className="py-3 px-4 text-center">CTN to Bill</th>
                        <th className="py-3 px-4">Place / Address</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pendingDispatchRequests.map((req) => (
                        <tr
                          key={req._id}
                          onClick={() => handleInitiateBillingFromRequest(req)}
                          className="hover:bg-slate-800/70 cursor-pointer transition group"
                          title="Open this request in single billing mode (auto-fills data)"
                        >
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {new Date(req.initiatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-300">{req.receipt}</td>
                          <td className="py-3 px-4 font-black text-white">{req.marka || '—'}</td>
                          <td className="py-3 px-4 font-bold text-cyan-300 max-w-[140px] truncate" title={req.commodity || 'COMMERCIAL GOODS'}>
                            {req.commodity || 'COMMERCIAL GOODS'}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            <span className="font-bold text-amber-300">{req.container || '—'}</span>
                            {req.containerNumber && req.containerNumber !== req.container && (
                              <span className="block text-[10px] text-slate-400 font-mono">({req.containerNumber})</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-amber-400">{req.vehicleNumber}</td>
                          <td className="py-3 px-4 text-center font-bold text-purple-300 font-mono">
                            {req.cartonCount} CTN
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{req.place}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInitiateBillingFromRequest(req);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md transition transform hover:scale-105 inline-flex items-center space-x-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Initiate Billing</span>
                              </button>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm('Are you sure you want to delete this dispatch request?')) return;
                                  try {
                                    const res = await fetch('/api/dispatcher', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'delete_request', requestId: req._id }),
                                    });
                                    if (res.ok) {
                                      setPendingDispatchRequests((prev) => prev.filter((r) => r._id !== req._id));
                                      if (activeDispatchRequestId === req._id) setActiveDispatchRequestId(null);
                                    }
                                  } catch (err) {}
                                }}
                                className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-xl font-bold text-xs transition"
                                title="Delete / Reject Request"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-6">
              {/* ACTIVE DISPATCH REQUEST HIGHLIGHT BANNER */}
              {activeDispatchRequestId && (
                <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-2 border-emerald-500/70 p-4 rounded-3xl shadow-xl shadow-emerald-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-500/30">
                    <div className="flex items-center space-x-2">
                      <span className="p-1.5 bg-emerald-500 text-slate-950 rounded-xl font-black text-xs flex items-center space-x-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Active Dispatch Request</span>
                      </span>
                      <span className="text-xs font-mono font-black text-amber-300">
                        Receipt #{receiptNo}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Auto-Filled</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveDispatchRequestId(null)}
                        className="text-[11px] text-slate-400 hover:text-red-400 underline font-semibold"
                        title="Close Dispatch Mode"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                    <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-semibold">Item Name:</span>
                      <span className="font-black text-cyan-300 text-xs truncate block" title={lineDescription || commodity}>
                        {lineDescription || commodity || 'COMMERCIAL GOODS'}
                      </span>
                    </div>
                    <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-semibold">Cartons (CTN):</span>
                      <span className="font-black text-purple-300 text-xs block">
                        {totalCartons || lineQuantity || '1'} CTN
                      </span>
                    </div>
                    <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-semibold">Vehicle No:</span>
                      <span className="font-black text-amber-300 text-xs block font-mono">
                        {formVehicleNumber || '—'}
                      </span>
                    </div>
                    <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-semibold">Destination:</span>
                      <span className="font-black text-emerald-300 text-xs truncate block" title={formDestination}>
                        {formDestination || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {manualSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                    <span className="font-bold">{manualSuccessMsg}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-2">
                    {justCreatedBill && (
                      <>
                        {/* Quick e-Way Bill No. Input & Save */}
                        <div className="flex items-center space-x-1.5 bg-slate-900 border border-amber-500/50 rounded-xl px-2.5 py-1">
                          <span className="text-[10px] font-bold text-amber-300 shrink-0">e-Way No:</span>
                          <input
                            type="text"
                            placeholder="12-digit e-Way No"
                            value={justCreatedEWayNo}
                            onChange={(e) => setJustCreatedEWayNo(e.target.value)}
                            className="w-28 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-amber-200 text-xs font-mono font-bold focus:outline-none focus:border-amber-400"
                          />
                          <button
                            type="button"
                            disabled={isSavingJustCreatedEWay || !justCreatedEWayNo.trim()}
                            onClick={handleSaveJustCreatedEWayNo}
                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-[10px] rounded transition"
                          >
                            {isSavingJustCreatedEWay ? '...' : 'Save'}
                          </button>
                        </div>

                        {/* Print Both (Invoice + e-Way Bill) Together */}
                        <button
                          type="button"
                          onClick={() => {
                            const billWithEway = {
                              ...justCreatedBill,
                              eWayBillNo: justCreatedEWayNo || justCreatedBill.eWayBillNo,
                            };
                            generateBothBillAndEWayPDF(billWithEway, true); if (justCreatedBill?._id) handleMarkBillDownloaded(justCreatedBill._id);
                          }}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow-md shadow-emerald-950/40"
                          title="Print Invoice + Government e-Way Bill Together in 1 PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>🖨️ Print Both (Bill + e-Way)</span>
                        </button>

                        {/* Print Actual Government e-Way Bill Standalone */}
                        <button
                          type="button"
                          onClick={() => {
                            const billWithEway = {
                              ...justCreatedBill,
                              eWayBillNo: justCreatedEWayNo || justCreatedBill.eWayBillNo,
                            };
                            generateEWayBillPDF(billWithEway, true); if (justCreatedBill?._id) handleMarkBillDownloaded(justCreatedBill._id);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                          title="Print Government e-Way Bill PDF"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>e-Way Bill</span>
                        </button>

                        {/* Download E-Way JSON for Portal */}
                        <button
                          type="button"
                          onClick={() => { downloadEWayBillJson(justCreatedBill); if (justCreatedBill?._id) handleMarkBillDownloaded(justCreatedBill._id); }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs transition flex items-center space-x-1.5 border border-amber-500/40"
                          title="Download Government JSON file for E-Way Bill Portal upload"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>E-Way JSON</span>
                        </button>

                        {/* Download Invoice PDF Standalone */}
                        <button
                          type="button"
                          onClick={() => { generateBillPDF(justCreatedBill, true); if (justCreatedBill?._id) handleMarkBillDownloaded(justCreatedBill._id); }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-xl text-xs transition flex items-center space-x-1.5 border border-slate-700"
                          title="Download PDF Bill"
                        >
                          <FileText className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Invoice PDF</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        handleResetCascade();
                        setJustCreatedBill(null);
                        setManualSuccessMsg(null);
                      }}
                      className="px-3 py-1.5 bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition"
                    >
                      + Create Another Bill
                    </button>
                  </div>
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
                        Step 1: Select Cargo from Manifest (Container ➔ Marka ➔ Receipt)
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Select container, then select marka — receipt and cargo details auto-fill
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  {/* Container Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>1. Container Number</span>
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
                        <span>2. Select Marka *</span>
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
                        if (m) handleSingleMarkaChange(m);
                      }}
                      disabled={isLoadingCascade}
                      className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-xs font-bold text-cyan-300 focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                      <option value="">-- Choose Marka --</option>
                      {singleAvailableMarkas.map((m: any, idx: number) => {
                        const mName = typeof m === 'string' ? m : m.marka;
                        const countText = m.count ? ` (${m.count} shipments, ${m.totalCartons || 0} CTN)` : '';
                        const isChosen = singleSelectedMarka === mName || selectedMarkas.includes(mName);
                        return (
                          <option key={idx} value={mName}>
                            {isChosen ? '✓ ' : ''}{mName} {countText}
                          </option>
                        );
                      })}
                    </select>

                    {/* Quick Marka Selection Chips */}
                    {singleAvailableMarkas.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                          <span>Available Marka:</span>
                          {singleSelectedMarka && (
                            <span className="text-[10px] text-cyan-400 font-mono font-bold">
                              Selected: {singleSelectedMarka}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5 scrollbar-thin">
                          {singleAvailableMarkas.map((m: any, idx: number) => {
                            const mName = typeof m === 'string' ? m : m.marka;
                            const isChosen = singleSelectedMarka === mName;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleSingleMarkaChange(mName)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 border ${
                                  isChosen
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-sm font-black'
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
                      <span>3. Receipt Number *</span>
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
                            #{s.receipt} — {s.cartons} CTN, {s.weightKg} KG ({translateToEnglish(s.english || s.commodity || 'Cargo')})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={receiptNo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReceiptNo(val);
                          setSingleSelectedReceipt(val);
                          if (val.trim()) {
                            setManualInvoiceNo(val.trim());
                            setFormBillNumber(val.trim());
                          } else {
                            setManualInvoiceNo('');
                            setFormBillNumber('');
                          }
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

                  {/* INVOICE NUMBER GENERATED FROM RECEIPT WITH RANDOM 2 OR 3 DIGITS */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        <span>4. Invoice Number *</span>
                      </span>
                      {receiptNo && (
                        <button
                          type="button"
                          onClick={() => {
                            if (receiptNo.trim()) {
                              const rnd = generateInvoiceNumberFromReceipt(receiptNo.trim());
                              setManualInvoiceNo(rnd);
                              setFormBillNumber(rnd);
                            }
                          }}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/60 hover:border-emerald-500 transition"
                          title="Generate new random 2 or 3 digits"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Randomize (2/3 digits)</span>
                        </button>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      value={manualInvoiceNo || formBillNumber}
                      onChange={(e) => {
                        setManualInvoiceNo(e.target.value);
                        setFormBillNumber(e.target.value);
                      }}
                      placeholder="Receipt based invoice number (with random suffix digits)"
                      className="w-full px-3 py-2 bg-slate-900 border border-emerald-600/50 rounded-xl text-xs font-bold text-emerald-300 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                    <p className="text-[10px] text-slate-500">
                      Receipt as invoice number with last 2 or 3 digits random
                    </p>
                  </div>
                </div>



                {/* Separate Tax Invoice No. for E-Way Bill Section */}
                <div className={`p-3.5 rounded-2xl transition border ${
                  isEWayBillRequired 
                    ? 'bg-amber-950/40 border-amber-500/60 shadow-lg' 
                    : 'bg-slate-900/60 border-slate-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-amber-300 flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useSeparateEWayInvoice || isEWayBillRequired}
                        onChange={(e) => setUseSeparateEWayInvoice(e.target.checked)}
                        className="rounded border-amber-500 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="flex items-center space-x-1.5">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Provide Separate Invoice No. for E-Way Bill</span>
                      </span>
                    </label>
                    {isEWayBillRequired ? (
                      <span className="text-[10px] bg-red-500/20 text-red-300 font-black px-2 py-0.5 rounded border border-red-500/40 uppercase tracking-wide flex items-center space-x-1">
                        <span>⚡ E-Way Bill Required</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        Optional (e.g. NI/26-27/349)
                      </span>
                    )}
                  </div>

                  {(useSeparateEWayInvoice || isEWayBillRequired) && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-200">
                          Tax Invoice No. (Separate invoice number for E-Way Bill):
                        </span>
                        <span className="text-[10px] text-slate-400">e.g. NI/26-27/349 (Max 16 chars)</span>
                      </div>
                      <input
                        type="text"
                        value={eWayInvoiceNumber}
                        onChange={(e) => setEWayInvoiceNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. NI/26-27/349 or INV-001"
                        className="w-full px-3 py-2 bg-slate-950 border border-amber-400/80 rounded-xl text-xs font-bold text-amber-300 uppercase placeholder-slate-500 focus:ring-2 focus:ring-amber-400 outline-none font-mono tracking-wider"
                      />
                      <p className="text-[10px] text-emerald-400">
                        ✓ This separate invoice number will be used directly as &apos;docNo&apos; in E-Way Bill.
                      </p>
                    </div>
                  )}
                </div>

                {/* Auto-fill Status Banner */}
                {lookupMessage && (
                  <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{lookupMessage}</span>
                    </div>
                    {receiptNo && (
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                          Receipt: #{receiptNo}
                        </span>
                        {manualInvoiceNo && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold flex items-center space-x-1">
                            <span>Inv No: #{manualInvoiceNo}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2: BILLING CONFIGURATION & LINE ITEMS */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-sky-400">
                        Step 2: Billing Details & Items
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Invoice details: Seller, Vehicle No, E-Way Bill, and Line Items (HSN, Unit, Qty, Rate)
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
                      <span>1. Seller Entity *</span>
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

                  {/* Vehicle Number (Biller or Dispatcher) */}
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                      <span className="flex items-center space-x-1">
                        <Truck className="w-3.5 h-3.5" />
                        <span>2. Vehicle No.</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Biller / Dispatcher</span>
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
                      <span>3. Destination</span>
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
                        ⚠️ E-Way Bill Number Required
                      </strong>
                      <span>
                        {isDeliveryInDelhi
                          ? `Intra-Delhi bill amount is ₹${calculatedTotalAmt.toLocaleString('en-IN')} (exceeds ₹1,00,000 limit).`
                          : `Inter-State (${consigneeState || 'Other State'}) bill amount is ₹${calculatedTotalAmt.toLocaleString('en-IN')} (exceeds ₹50,000 limit).`
                        } Please enter a valid E-Way Bill No. above to generate the bill.
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
                          Invoice Items Builder (Item, HSN, Unit, Quantity & Rate)
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Select auto-loaded item from Marka, alter HSN, choose PCS/KG unit, and enter rate
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
                        <span className="text-amber-400">Choose Item Name *</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          (Can also edit directly in the text box below)
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
                        <option value="">-- Choose Item from List --</option>
                        {selectedCargoDropdown &&
                          !markaCargoItems.some((it) => it.description.toLowerCase() === selectedCargoDropdown.toLowerCase()) &&
                          !COMMON_COMMODITIES.some((c) => c.name.toLowerCase() === selectedCargoDropdown.toLowerCase()) && (
                            <option value={selectedCargoDropdown}>
                              ★ {selectedCargoDropdown} (From Dispatch Request / Active Item)
                            </option>
                          )}
                        {markaCargoItems.length > 0 && (
                          <optgroup label="Items from Current Marka">
                            {markaCargoItems.map((it, idx) => (
                              <option key={idx} value={it.description}>
                                {it.description} ({it.pcs} PCS / {it.weightKg} KG / {it.cartons} CTN)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Standard Catalog Items">
                          {COMMON_COMMODITIES.map((c, idx) => (
                            <option key={`comm-${idx}`} value={c.name}>
                              {c.name} (HSN: {c.hsn})
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      {/* Editable Text Field */}
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={lineDescription}
                          onChange={(e) => {
                            setLineDescription(e.target.value);
                            setCommodity(e.target.value);
                            setSelectedCargoDropdown(e.target.value);
                          }}
                          placeholder="Item Name (Type or Edit)"
                          className="w-full px-3 py-2 bg-slate-900 border border-amber-500/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                        />
                        <span className="absolute right-2.5 top-2 text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1 py-0.5 rounded pointer-events-none">
                          Editable
                        </span>
                      </div>
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

                  {/* 2. Item Configuration: HSN, Cartons, Unit Selector, Quantity, Rate, Total Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                    {/* HSN / SAC Code */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-amber-300">
                          HSN / SAC *
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
                          title="Search HSN suggestions for item"
                        >
                          <Search className="w-2.5 h-2.5" />
                          <span>Suggestions</span>
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
                    </div>

                    {/* Cartons */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-violet-300 flex items-center justify-between mb-1">
                        <span>Total Cartons (CTN) *</span>
                        <span className="text-[10px] text-violet-400 font-normal">Dispatch Count</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={totalCartons}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTotalCartons(val);
                          if (lineUnit.toUpperCase() === 'CTN') {
                            handleLineQuantityChange(val);
                          }
                        }}
                        placeholder="e.g. 3"
                        className="w-full px-3 py-2 bg-slate-900 border border-violet-500/50 rounded-xl text-xs text-violet-200 font-bold focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                      />
                    </div>

                    {/* Unit Selector Pills (PCS / KG / CTN) */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between mb-1">
                        <span>Unit *</span>
                        <span className="text-[10px] text-cyan-400">Unit Type</span>
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
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-purple-300 flex items-center justify-between mb-1">
                        <span>Quantity ({lineUnit}) *</span>
                        <span className="text-[10px] text-purple-400 font-normal">Count</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lineQuantity}
                        onChange={(e) => handleLineQuantityChange(e.target.value)}
                        placeholder={`e.g. ${lineUnit === 'PCS' ? '1134' : '120'}`}
                        className="w-full px-3 py-2 bg-slate-900 border border-purple-500/50 rounded-xl text-xs text-purple-200 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                      />
                    </div>

                    {/* Rate (₹ / Unit) - Two-Way Auto-Calculated */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-sky-400 flex items-center justify-between mb-1">
                        <span>Rate (₹ / {lineUnit}) *</span>
                        <span className="text-[10px] text-sky-400 font-semibold">Value ÷ Qty</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lineRate}
                        onChange={(e) => handleLineRateChange(e.target.value)}
                        placeholder="e.g. 46.56"
                        className="w-full px-3 py-2 bg-slate-900 border border-sky-500/50 rounded-xl text-xs text-sky-300 font-black focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                      />
                    </div>

                    {/* Total Value / Amount - Two-Way Auto-Calculated */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-emerald-400 flex items-center justify-between mb-1">
                        <span>Total Value (₹)</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Qty × Rate</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lineAmount}
                        onChange={(e) => handleLineAmountChange(e.target.value)}
                        placeholder="e.g. 52800"
                        className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    {/* Proportional CBM Reference Card (Reference Only - Excluded from Printed Bill) */}
                    {(calculatedProportionalCbm !== null || shipmentTotalCbm > 0) && (
                      <div className="sm:col-span-12 p-2.5 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-indigo-950/50 border border-indigo-500/40 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center space-x-2 text-indigo-200">
                          <Box className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div>
                            <span className="font-bold text-indigo-300">📦 Shipment CBM Reference:</span>
                            {calculatedProportionalCbm !== null ? (
                              <>
                                <span className="ml-2 font-mono font-black text-white bg-indigo-900/80 px-2 py-0.5 rounded border border-indigo-600/60 shadow-sm">
                                  {calculatedProportionalCbm} CBM
                                </span>
                                <span className="ml-2 text-[11px] text-slate-400">
                                  (Total Shipment: {shipmentTotalCbm} CBM | Proportional from {shipmentTotalCartons || totalCartons || '—'} cartons)
                                </span>
                              </>
                            ) : (
                              <span className="ml-2 text-[11px] text-slate-300">
                                Total Shipment: <strong className="text-white font-mono">{shipmentTotalCbm} CBM</strong> (Proportional CBM calculates automatically)
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-amber-300/90 bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-700/50 font-medium">
                          ℹ️ For biller reference only — will not print on final invoice
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ITEM PROPORTIONATE (Optional Mode) */}
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
                        <span>⚖️ {isProportionateEnabled ? 'Item Proportionate (Active)' : 'Item Proportionate'}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-black/30">
                          {isProportionateEnabled ? 'Click to Disable' : 'Optional'}
                        </span>
                      </button>

                      {isProportionateEnabled && (
                        <span className="text-[11px] text-amber-300 font-bold hidden sm:inline-block">
                          Automatic ratio calculation based on cartons, weight or pieces
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
                              Item Proportionate Calculator
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Primary Unit: <strong className="text-cyan-300 font-bold font-mono">{lineUnit}</strong>
                          </span>
                        </div>

                        {/* Base Totals of the Cargo / Marka */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-1">
                            1. Base Cargo Quantities:
                          </span>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <label className="text-[10px] text-slate-400 block">Total Cartons (CTN)</label>
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
                              <label className="text-[10px] text-slate-400 block">Total Weight (KG)</label>
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
                              <label className="text-[10px] text-slate-400 block">Total Pieces (PCS)</label>
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
                            2. Select Dispatch Basis:
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
                              <span>📦 By Cartons</span>
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
                              <span>⚖️ By Weight (KG)</span>
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
                              <span>🔢 By Pieces (PCS)</span>
                            </button>
                          </div>
                        </div>

                        {/* Input for the selected basis and Live Result */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                          <div className="sm:col-span-5">
                            <label className="text-[10px] font-bold text-amber-300 block mb-1">
                              {propBasis === 'cartons'
                                ? '👉 Cartons sending:'
                                : propBasis === 'weight'
                                ? '👉 Weight KG sending:'
                                : '👉 Pieces sending:'}
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
                                  <span className="text-slate-400">Proportionate Ratio:</span>
                                  <strong className="text-emerald-400 font-mono">{pctStr}% of Total Cargo</strong>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[11px] pt-0.5 border-t border-slate-800 font-mono">
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">Cartons:</span>
                                    <strong className="text-cyan-300">{calc.ctn} CTN</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">Weight:</span>
                                    <strong className="text-cyan-300">{calc.kg} KG</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block text-[9px]">Pieces:</span>
                                    <strong className="text-cyan-300">{calc.pcs} PCS</strong>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                                  <span className="text-amber-300 font-bold text-[11px]">
                                    Invoice Quantity ({lineUnit}): <strong className="text-white font-mono text-sm">{calc.targetQty} {lineUnit}</strong>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleApplyProportionate}
                                    disabled={calc.targetQty <= 0}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-lg text-xs transition shadow flex items-center space-x-1"
                                  >
                                    <span>✓ Apply</span>
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
                      disabled={!lineDescription.trim() || !lineQuantity || (!lineRate && !lineAmount)}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Item to Invoice</span>
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
                              Total Taxable Subtotal:
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
              <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-xl">
                {/* Step 3 Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-violet-500/10 border border-violet-500/30 rounded-xl text-violet-400">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-violet-300 uppercase tracking-wider">
                        Step 3: Consignee & Buyer Details
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Select or add Delivery (Ship to) and Billing (Bill to) party names and addresses
                      </p>
                    </div>
                  </div>

                  {/* Primary Option: Select Saved Address vs Add New Address & Party */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <div className="flex bg-slate-900 border border-slate-700/80 p-1 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setAddressMode('select')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                          addressMode === 'select'
                            ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>📍 Select Saved Address</span>
                        {currentMarkaAddresses.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.2 bg-white/20 text-white rounded-full text-[10px]">
                            {currentMarkaAddresses.length}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddressMode('new')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                          addressMode === 'new'
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>➕ Add New Address & Party</span>
                      </button>
                    </div>

                    {/* PREFILL RANDOM DATA BUTTON */}
                    <button
                      type="button"
                      onClick={handlePrefillRandomData}
                      className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-lg shadow-amber-950/40 border border-amber-500/50 animate-pulse hover:animate-none"
                      title="Prefill random company name & address"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>⚡ Prefill</span>
                    </button>
                  </div>
                </div>

                {/* MODE 1: SELECT EXISTING SAVED ADDRESS */}
                {addressMode === 'select' && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs font-black text-sky-400 flex items-center space-x-1.5 uppercase tracking-wide">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Saved Sending Locations — Marka: [{mainMarka || subMarka || singleSelectedMarka || 'Marka'}]</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddressMode('new')}
                        className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 border border-emerald-500/30 self-start sm:self-auto"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add New Address & Party</span>
                      </button>
                    </div>

                    {currentMarkaAddresses.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {currentMarkaAddresses.map((addr: any, idx: number) => {
                          const isSelected = selectedDeliveryAddressId === addr._id || (!selectedDeliveryAddressId && idx === 0);
                          return (
                            <div
                              key={addr._id || idx}
                              onClick={() => handleSelectDeliveryAddress(addr)}
                              className={`p-3 rounded-2xl border text-xs cursor-pointer transition flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-lg shadow-cyan-950/60 ring-1 ring-cyan-400'
                                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-bold text-cyan-300 text-xs truncate">
                                    {addr.title || `Location ${idx + 1}`}
                                  </span>
                                  <div className="flex items-center space-x-1 shrink-0">
                                    {isSelected && (
                                      <span className="px-2 py-0.5 bg-cyan-400 text-slate-950 font-black rounded text-[10px] uppercase">
                                        ✓ Selected
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditLocation(mainMarka || subMarka || singleSelectedMarka, addr);
                                      }}
                                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold rounded text-[10px] transition flex items-center space-x-1 border border-amber-500/30"
                                      title="Edit Address"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDeletingLocationId === addr._id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLocation(mainMarka || subMarka || singleSelectedMarka, addr._id);
                                      }}
                                      className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white font-bold rounded text-[10px] transition flex items-center space-x-1 border border-red-500/30"
                                      title="Delete Address"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </div>
                                <p className="text-[11px] text-slate-200 line-clamp-2 leading-relaxed">{addr.address}</p>
                              </div>

                              <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                  <span className="font-semibold text-slate-300">
                                    {addr.city || addr.state || 'Delhi'} ({getStateCode(addr.stateCode || addr.state) || '07'})
                                  </span>
                                  {addr.phone && <span>📞 {addr.phone}</span>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectDeliveryAddress(addr)}
                                  className={`w-full mt-2 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                                    isSelected
                                      ? 'bg-cyan-400 text-slate-950 font-black shadow'
                                      : 'bg-slate-950 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{isSelected ? '✓ Selected Address' : 'Select This Address'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
                        <MapPin className="w-8 h-8 text-slate-500 mx-auto" />
                        <div>
                          <p className="text-xs font-bold text-slate-300">
                            No saved address found for Marka [{mainMarka || subMarka || singleSelectedMarka || 'Marka'}].
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Click the button below to add a new address and party name.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddressMode('new')}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center space-x-1.5 shadow"
                        >
                          <Plus className="w-4 h-4" />
                          <span>➕ Add Address & Party Now</span>
                        </button>
                      </div>
                    )}

                  </div>
                )}

                {/* MODE 2: ADD NEW ADDRESS & PARTY */}
                {addressMode === 'new' && (
                  <div className="p-4 bg-slate-900/90 border border-emerald-500/40 rounded-2xl space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-xs font-black text-emerald-400 flex items-center space-x-1.5 uppercase tracking-wide">
                          <Plus className="w-4 h-4" />
                          <span>Add New Address & Party — [{mainMarka || subMarka || singleSelectedMarka || 'Marka'}]</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Select registration type (Registered or Unregistered) and enter party details
                        </p>
                      </div>

                      {/* Registered vs Unregistered Toggle */}
                      <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-bold shrink-0">
                        <button
                          type="button"
                          onClick={() => setRegistrationType('Registered')}
                          className={`px-3.5 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                            registrationType === 'Registered'
                              ? 'bg-emerald-600 text-white shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>🏢 Registered (GSTIN)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegistrationType('Unregistered')}
                          className={`px-3.5 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                            registrationType === 'Unregistered'
                              ? 'bg-amber-600 text-white shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>👤 Unregistered (URP)</span>
                        </button>
                      </div>
                    </div>

                    {/* Inputs according to Registration Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      {registrationType === 'Registered' && (
                        <div>
                          <label className="text-xs text-emerald-400 font-bold block mb-1">
                            Consignee GSTIN (15-digit GST) * (State auto-detects)
                          </label>
                          <input
                            type="text"
                            required={registrationType === 'Registered'}
                            value={purchaserGstin}
                            onChange={(e) => handleConsigneeGstinChange(e.target.value)}
                            placeholder="07AAAAA0000A1Z5"
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-mono font-black uppercase focus:ring-2 focus:ring-emerald-500 outline-none"
                          />
                        </div>
                      )}

                      <div className={registrationType === 'Registered' ? 'sm:col-span-1' : 'sm:col-span-2'}>
                        <label className="text-xs text-slate-300 font-bold block mb-1">
                          Consignee / Party Legal Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={purchaserName}
                          onChange={(e) => setPurchaserName(e.target.value)}
                          placeholder="e.g. Radhey Trading Co."
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none font-semibold"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 font-bold block mb-1">
                          Phone / Mobile Number
                        </label>
                        <input
                          type="text"
                          value={purchaserPhone}
                          onChange={(e) => setPurchaserPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                        />
                      </div>
                    </div>

                    {registrationType === 'Unregistered' && (
                      <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center space-x-2">
                        <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>This party is selected as Unregistered (URP). GSTIN is not required.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-slate-300 font-bold">
                            Delivery / Shipping Address *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const q = consigneeAddress || purchaserAddress || '';
                              setPinSearchQuery(q);
                              handleSearchPincodes(q);
                              setShowPinSearchModal(true);
                            }}
                            className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-1 transition"
                            title="Search PIN Code by locality / city"
                          >
                            <Search className="w-3 h-3" />
                            <span>Search PIN</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          list="delhi-industrial-addresses"
                          value={consigneeAddress || purchaserAddress}
                          onChange={(e) => handleAddressInputChange(e.target.value)}
                          placeholder="e.g. Shop No 4, Badli Road, Badli, New Delhi"
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />

                        {/* PIN Code Auto-Detected Helper Banner */}
                        {detectedPincodeInfo && (
                          <div className="mt-1.5 p-2 bg-emerald-950/60 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs animate-fadeIn">
                            <div className="flex items-center space-x-2 text-emerald-300 font-medium text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>
                                <strong>Auto-Detected PIN:</strong>{' '}
                                <span className="font-mono font-bold text-white bg-emerald-900/80 px-1.5 py-0.5 rounded">
                                  {detectedPincodeInfo.pincode}
                                </span>
                                {detectedPincodeInfo.area ? ` — ${detectedPincodeInfo.area}` : ''}
                                {detectedPincodeInfo.city ? `, ${detectedPincodeInfo.city}` : ''}
                                {detectedPincodeInfo.state ? ` (${detectedPincodeInfo.state})` : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyDetectedPincode(detectedPincodeInfo)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shrink-0 ml-2 transition shadow"
                            >
                              + Apply to Address
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-300 font-bold block mb-1">State</label>
                          <select
                            value={consigneeState}
                            onChange={(e) => handleConsigneeStateChange(e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                          >
                            {INDIAN_STATES.map((st) => (
                              <option key={st.name} value={st.name}>
                                {st.name} ({st.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-300 font-bold block mb-1">State Code (Auto)</label>
                          <input
                            type="text"
                            value={consigneeStateCode}
                            onChange={(e) => handleConsigneeStateCodeChange(e.target.value)}
                            placeholder="07"
                            className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SAVE TOGETHER BUTTON (Party Name + Address Save to Marka) */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl">
                      <div className="text-xs text-emerald-300">
                        <span className="font-bold flex items-center space-x-1.5">
                          <Save className="w-4 h-4 text-emerald-400" />
                          <span>Party name and address will save together to this Marka:</span>
                        </span>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Marka: <strong className="text-white font-mono">{mainMarka || subMarka || singleSelectedMarka || 'Marka'}</strong> | Party: <strong className="text-white">{purchaserName || '—'}</strong>
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAddressMode('select')}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          disabled={isSavingMarkaDirect || !purchaserName.trim() || !(consigneeAddress || purchaserAddress).trim()}
                          onClick={handleInstantSaveMarkaAddress}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-lg shadow-emerald-950/60"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingMarkaDirect ? 'Saving...' : '💾 Save Party & Address to Marka'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}



                {/* Instant Save Marka Address Bar */}
                <div className="border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Marka: <strong className="text-white font-mono">{mainMarka || subMarka || singleSelectedMarka || 'No Marka Selected'}</strong> | Party: <strong className="text-white">{purchaserName || '—'}</strong>
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isSavingMarkaDirect || !(mainMarka || subMarka || singleSelectedMarka) || !purchaserName.trim()}
                      onClick={handleInstantSaveMarkaAddress}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow"
                    >
                      {isSavingMarkaDirect ? (
                        <span>Saving...</span>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>{`💾 Save Party & Address for [${(mainMarka || subMarka || singleSelectedMarka || 'Marka').split(',')[0].trim()}]`}</span>
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
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
                          ? `⚠️ E-Way Bill Required: Intra-Delhi bills exceeding ₹1,00,000 (Current: ₹${calculatedTotalAmt.toLocaleString('en-IN')}) require an E-Way Bill Number!`
                          : `⚠️ E-Way Bill Required: Inter-State bills exceeding ₹50,000 (Current: ₹${calculatedTotalAmt.toLocaleString('en-IN')}) require an E-Way Bill Number!`}
                      </span>
                      <p className="text-[11px] text-rose-400/90 font-normal mt-0.5">
                        Please enter E-Way Bill No. in Step 2 to generate the bill.
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

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={invoiceTaxableTotal <= 0}
                      onClick={() => {
                        const separateEWayInv = (useSeparateEWayInvoice || isEWayBillRequired) && eWayInvoiceNumber.trim();
                        const curBill = {
                          billNumber: separateEWayInv ? eWayInvoiceNumber.trim() : (formBillNumber.trim() || receiptNo.trim() || 'RCP-DRAFT'),
                          eWayInvoiceNumber: separateEWayInv ? eWayInvoiceNumber.trim() : undefined,
                          receipt: receiptNo.trim() || 'RCP-DRAFT',
                          hsnCode: lineHsn || hsnCode || '94039900',
                          igst: igstRate,
                          billingUnit: lineUnit || billingUnit || 'CTN',
                          quantityPcs: parseFloat(quantityPcs) || (lineUnit.toUpperCase() === 'PCS' ? parseFloat(lineQuantity) : 0) || 1,
                          quantityKg: parseFloat(quantityKg) || (lineUnit.toUpperCase().includes('KG') ? parseFloat(lineQuantity) : 0) || 1,
                          totalCartons: parseFloat(totalCartons) || (lineUnit.toUpperCase().includes('CTN') ? parseFloat(lineQuantity) : 0) || 1,
                          taxableValue: invoiceTaxableTotal,
                          commodity: lineDescription || commodity || 'COMMERCIAL GOODS',
                          sellerName: currentSeller?.name || 'NORDEX INTERNATIONAL',
                          sellerGstin: currentSeller?.gstin || '07AAIHH1727F1ZH',
                          sellerAddress: currentSeller?.address || '',
                          sellerState: currentSeller?.state || 'Delhi',
                          sellerStateCode: currentSeller?.stateCode || '07',
                          purchaserName: purchaserName.trim() || partyName || 'General Party',
                          purchaserRegistrationType: registrationType,
                          purchaserGstin: registrationType === 'Registered' ? purchaserGstin : '',
                          consigneeAddress: consigneeAddress || purchaserAddress,
                          consigneeState: consigneeState,
                          consigneeStateCode: consigneeStateCode,
                          vehicleNumber: formVehicleNumber.trim(),
                          items: invoiceItems.length > 0 ? invoiceItems : [
                            {
                              itemNo: 1,
                              description: lineDescription || commodity || 'COMMERCIAL GOODS',
                              hsnCode: lineHsn || hsnCode || '94039900',
                              quantity: parseFloat(lineQuantity) || parseFloat(totalCartons) || 1,
                              unit: lineUnit || 'CTN',
                              rate: parseFloat(lineRate) || 0,
                              amount: invoiceTaxableTotal,
                            },
                          ],
                        };
                        downloadEWayBillJson(curBill);
                      }}
                      className="w-full sm:w-auto px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-amber-300 font-bold rounded-2xl text-xs transition border border-amber-500/40 flex items-center justify-center space-x-2"
                      title="Download Government NIC E-Way Bill JSON directly for this invoice"
                    >
                      <Download className="w-4 h-4 text-amber-400" />
                      <span>Download E-Way JSON</span>
                    </button>

                    {/* Auto-Download Option Checkbox */}
                    <label
                      className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-2xl cursor-pointer transition border ${
                        autoDownloadOnGenerate
                          ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300 shadow-sm'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                      title="When checked, PDF downloads immediately after bill generation"
                    >
                      <input
                        type="checkbox"
                        checked={autoDownloadOnGenerate}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoDownloadOnGenerate(val);
                          try {
                            localStorage.setItem('biller_auto_download_on_generate', String(val));
                          } catch {}
                        }}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 border-slate-700 cursor-pointer"
                      />
                      <span className="flex items-center space-x-1.5 text-xs font-bold select-none">
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Auto-Download PDF</span>
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmittingManual || invoiceTaxableTotal <= 0}
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
                          <span>Generate Tax Invoice (Vehicle: {formVehicleNumber.trim()})</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Generate Tax Invoice (Vehicle to be added by Dispatcher)</span>
                        </>
                      )}
                    </button>
                  </div>
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
                Generated Bills List
              </h2>
              <p className="text-xs text-slate-400">
                All bills generated with Seller and Purchaser details. Download PDF anytime to verify.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadBills}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                title="Refresh bills"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBills ? 'animate-spin' : ''}`} />
              </button>

              {/* PDF Invoice Theme Selector */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <Printer className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-slate-400 text-[10px] hidden md:inline">PDF Theme:</span>
                <select
                  value={pdfTheme}
                  onChange={(e) => handlePdfThemeChange(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer"
                  title="Select Tax Invoice PDF Theme"
                >
                  <option value="classic" className="bg-slate-900 text-white">Classic B&W</option>
                  <option value="navy" className="bg-slate-900 text-cyan-300">Corporate Navy</option>
                  <option value="emerald" className="bg-slate-900 text-emerald-300">Executive Emerald</option>
                  <option value="crimson" className="bg-slate-900 text-rose-300">Royal Crimson</option>
                  <option value="dark" className="bg-slate-900 text-slate-300">Charcoal Dark</option>
                </select>
              </div>

              {/* 1-Hour Auto-Delete Download Management Filter Tabs */}
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDownloadFilter('undownloaded')}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                    downloadFilter === 'undownloaded'
                      ? 'bg-amber-500 text-slate-950 font-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Bills not downloaded yet"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>📥 Undownloaded Bills ({undownloadedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadFilter('downloaded')}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                    downloadFilter === 'downloaded'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Downloaded bills (Auto-delete within 1 hour)"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>✅ Downloaded ({downloadedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    downloadFilter === 'all'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>All ({bills.length})</span>
                </button>
              </div>

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
                  {selectedBillIds.size} {selectedBillIds.size === 1 ? 'Bill' : 'Bills'} Selected for Batch Vehicle Update
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={bulkVehicleInput}
                  onChange={(e) => setBulkVehicleInput(e.target.value.toUpperCase())}
                  placeholder="Vehicle No (e.g. HR 55 AU 1234)"
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
                  onClick={() => {
                    const selectedBills = bills.filter((b) => selectedBillIds.has(b._id));
                    if (selectedBills.length === 0) return;
                    downloadEWayBillJson(selectedBills);
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow flex-shrink-0"
                  title="Download combined Government E-Way Bill JSON for selected bills"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download E-Way JSON ({selectedBillIds.size})</span>
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
                  <th className="p-3.5 text-center">Vehicle No</th>
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
                        {b.eWayBillNo ? (
                          <div
                            onClick={() => handleOpenEWayPrintModal(b, 'both')}
                            title="E-Way Bill Number (Click to print)"
                            className="inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-300 hover:text-amber-200 bg-amber-950/60 border border-amber-800/60 rounded px-1.5 py-0.5 mt-0.5 cursor-pointer"
                          >
                            <Truck className="w-2.5 h-2.5 text-amber-400" />
                            <span>{b.eWayBillNo}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEWayPrintModal(b, 'both')}
                            className="text-[9px] text-amber-400/80 hover:text-amber-300 underline block mt-0.5"
                            title="Enter E-Way Bill Number and print"
                          >
                            + e-Way No.
                          </button>
                        )}
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
                              Pending
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenVehicleModal(b)}
                            title="Edit Vehicle Number"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex flex-col items-center space-y-1">
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

                          {/* 1-Hour Auto-Delete Download Status Chip with Live Countdown */}
                          {b.downloadedAt ? (
                            <span
                              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-full text-[10px] font-bold animate-pulse"
                              title={`Downloaded at: ${new Date(b.downloadedAt).toLocaleTimeString()} | Auto-deletes 1 hour after download`}
                            >
                              <Clock className="w-3 h-3 text-purple-400" />
                              <span>⏳ Deletes in {getDownloadCountdown(b) || '0m 0s'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700/60 rounded-full text-[9px] font-medium">
                              <span>📥 Undownloaded</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* Print Both (Invoice + e-Way Bill) */}
                          <button
                            type="button"
                            onClick={() => handleOpenEWayPrintModal(b, 'both')}
                            title="Print Both: Invoice + e-Way Bill in 1 PDF"
                            className="p-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg transition shadow flex items-center space-x-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline text-[9px] font-black">BOTH</span>
                          </button>

                          {/* Print Actual Government e-Way Bill Standalone */}
                          <button
                            type="button"
                            onClick={() => handleOpenEWayPrintModal(b, 'eway')}
                            title="Print Government e-Way Bill PDF"
                            className="p-1.5 bg-slate-800 hover:bg-indigo-500/30 hover:text-indigo-300 text-slate-300 rounded-lg transition flex items-center space-x-1 border border-slate-700"
                          >
                            <Truck className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="hidden xl:inline text-[9px] font-bold text-indigo-300">e-Way</span>
                          </button>

                          {/* Edit Bill */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditBillModal(b)}
                            title="Edit Bill Information"
                            className="p-1.5 bg-slate-800 hover:bg-cyan-500/20 hover:text-cyan-400 text-slate-300 rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Download Invoice PDF */}
                          <button
                            type="button"
                            onClick={() => {
                              generateBillPDF({ ...b, theme: pdfTheme }, true);
                              handleMarkBillDownloaded(b._id);
                            }}
                            title="Download PDF Bill"
                            className="p-1.5 bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 rounded-lg transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Download E-Way JSON */}
                          <button
                            type="button"
                            onClick={() => {
                              downloadEWayBillJson(b);
                              handleMarkBillDownloaded(b._id);
                            }}
                            title="Download Government NIC E-Way Bill JSON (e-Way Bill Portal Upload)"
                            className="p-1.5 bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 rounded-lg transition flex items-center space-x-1"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="hidden xl:inline text-[9px] font-bold text-emerald-300">JSON</span>
                          </button>

                          {/* Delete Bill */}
                          <button
                            type="button"
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
                  {editingSellerId ? 'Edit Seller Party' : 'Add New Seller Party'}
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
                    Mobile Number
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
                  Email ID
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

      {/* MODAL: MARKA ADDRESS DIRECTORY */}
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
                    <span>Marka &amp; Party Directory</span>
                    <span className="text-xs font-normal text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-full">
                      Marka & Party Directory
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Save party legal name, GSTIN, and delivery address by Marka for rapid billing.
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
                      {selectedMarkaToEdit ? `Edit Party & Address for [${selectedMarkaToEdit.marka}]` : 'Add New Marka & Party Name'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {selectedMarkaToEdit ? 'Updating existing directory record' : 'Save party name and address against this Marka'}
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
                        Marka Code *
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
                      <label className="text-[11px] font-bold text-amber-300 block mb-1">
                        Party / Consignee Legal Name *
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
                        GSTIN {dirRegistrationType === 'Registered' ? '*' : '(Optional)'} (State auto-detects)
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
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">State</label>
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
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (Auto)</label>
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
                        Buyer (Bill to) is identical to Consignee (Ship to)
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
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer GSTIN (State auto-detects)</label>
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
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer State</label>
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
                            <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer State Code (Auto)</label>
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
                    Update Vehicle Number
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
                  Vehicle Number *
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
                  Destination (Optional)
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
                    Add New Sending Location
                  </h3>
                  <p className="text-[11px] text-cyan-300">
                    Marka: <strong>{mainMarka || subMarka || singleSelectedMarka}</strong>
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
                    Registration Type *
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
                      15-Digit GSTIN Number * (State auto-detects)
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
                    ℹ Unregistered Party (URP) - No GSTIN required.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Location Title / Identifier (e.g. Godown 1, Factory Agra) *
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
                  Complete Delivery Address *
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">City</label>
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State</label>
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (Auto)</label>
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
                    Edit Sending Location
                  </h3>
                  <p className="text-[11px] text-amber-300">
                    Marka: <strong>{editingLocationData.marka}</strong>
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
                  Location Title / Identifier (e.g. Godown 1, Shop 2) *
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
                  Complete Delivery Address *
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">City</label>
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State</label>
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
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code (Auto)</label>
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
                    Search & Suggest HSN Code
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Find HSN by item description or keyword. Selecting will link it to this item.
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
                placeholder="e.g. Baby bottle, Teether, Toy, Footwear, Bag, 39269099..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-amber-500/50 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>

            {/* Results List */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {isLoadingHsn ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Searching HSN Directory...
                </div>
              ) : hsnSearchResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No suggestions found. You can type HSN manually and save.
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
                            ★ Your Linked
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
                        Select & Link
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-400">
              <span>Tip: Once selected, this HSN will automatically load next time.</span>
              <button
                type="button"
                onClick={() => setShowHsnSearchModal(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PIN CODE SEARCH & AUTO-DETECTION */}
      {showPinSearchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    Search & Detect PIN Code
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Find 6-digit PIN code by address, city or locality and auto-set state.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPinSearchModal(false)}
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
                value={pinSearchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setPinSearchQuery(val);
                  handleSearchPincodes(val);
                }}
                placeholder="e.g. Badli, Bawana, Kundli, Bhiwandi, Surat, Chandni Chowk, 110042..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-sky-500/50 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>

            {/* Quick Popular Locality Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin text-[11px]">
              <span className="text-slate-500 text-[10px] shrink-0 font-bold">Quick:</span>
              {['Badli (110042)', 'Bawana (110039)', 'Kundli (131028)', 'Noida (201301)', 'Bhiwandi (421302)', 'Surat (395002)'].map((p) => {
                const pin = p.match(/\d{6}/)?.[0] || '';
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPinSearchQuery(pin);
                      handleSearchPincodes(pin);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-mono shrink-0 transition"
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Results List */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {isSearchingPin ? (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Searching PIN code...</span>
                </div>
              ) : pinSearchResults.length > 0 ? (
                pinSearchResults.map((item, idx) => (
                  <div
                    key={`${item.pincode}-${idx}`}
                    onClick={() => {
                      handleApplyDetectedPincode(item);
                      setShowPinSearchModal(false);
                    }}
                    className="p-3 bg-slate-950/70 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/40 rounded-2xl cursor-pointer transition flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black font-mono text-sky-300 px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800/60">
                          {item.pincode}
                        </span>
                        <span className="text-xs font-bold text-white">{item.area}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {item.city && `${item.city}, `}{item.district && `${item.district}, `}{item.state} (Code: {item.stateCode || '07'})
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold rounded-xl text-[10px] transition shrink-0"
                    >
                      + Select
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No PIN code found. Try searching with different locality name.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-400">
              <span>Tip: Selecting a PIN code automatically sets the state and state code.</span>
              <button
                type="button"
                onClick={() => setShowPinSearchModal(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BILL */}
      {editBillModalOpen && billToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center space-x-2">
                    <span>Edit Invoice Bill</span>
                    <span className="font-mono text-cyan-400 text-xs px-2 py-0.5 bg-cyan-950 rounded border border-cyan-800">
                      {editBillData.billNumber}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Receipt: <span className="font-mono text-slate-300">{billToEdit.receipt}</span> | 
                    Container: <span className="font-mono text-slate-300">{billToEdit.container || 'N/A'}</span> | 
                    Marka: <span className="font-mono text-cyan-300">{billToEdit.mainMarka || 'N/A'}</span>
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
                  <span>1. Invoice & Transport Details</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-300">
                        Invoice Bill No. *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const r = editBillData.receipt || billToEdit?.receipt || '';
                          if (r) {
                            setEditBillData({
                              ...editBillData,
                              billNumber: generateInvoiceNumberFromReceipt(r),
                            });
                          }
                        }}
                        className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60"
                        title="Randomize last 2 or 3 digits from receipt"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Randomize 2/3 digits</span>
                      </button>
                    </div>
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
                      Vehicle No.
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
                    <span>2. Consignee / Shipped To</span>
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
                      Consignee GSTIN {editBillData.purchaserRegistrationType === 'Registered' ? '*' : '(URP)'} (State auto-detects)
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-300">
                        Delivery Address (Ship to Address) *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const q = editBillData.consigneeAddress || '';
                          setPinSearchQuery(q);
                          handleSearchPincodes(q);
                          setShowPinSearchModal(true);
                        }}
                        className="text-[9px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-1"
                        title="Search PIN code"
                      >
                        <Search className="w-2.5 h-2.5" />
                        <span>Search PIN</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={editBillData.consigneeAddress}
                      onChange={(e) => {
                        const val = e.target.value;
                        const pinMatch = autoDetectPincodeFromAddress(val);
                        setEditBillData({
                          ...editBillData,
                          consigneeAddress: val,
                          ...(pinMatch?.state ? { consigneeState: pinMatch.state, consigneeStateCode: pinMatch.stateCode || '07' } : {}),
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">State</label>
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
                    <span>3. Buyer / Billed To</span>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg">
                    <input
                      type="checkbox"
                      checked={editBillData.sameAsConsignee}
                      onChange={(e) => setEditBillData({ ...editBillData, sameAsConsignee: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-[10px] font-bold text-slate-300">
                      Same as Consignee
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
                        <label className="text-[10px] font-bold text-slate-300 block mb-1">Buyer GSTIN (State auto-detects)</label>
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
                    <span>4. Invoice Items (HSN, Unit, Quantity, Rate)</span>
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
                                title="HSN Suggestions / Search"
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
                                title="Remove"
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
                          Total Items: <strong className="text-white font-mono">{editBillData.items.length}</strong>
                        </span>
                        {isEditDelhi ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950/80 border border-sky-500/40 text-sky-300">
                            🔵 Delhi Local (CGST {editHalfRate}% + SGST {editHalfRate}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                            🟠 Outside Delhi (IGST {editGstRate}%)
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
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (billToEdit) {
                      const snapshot = {
                        ...billToEdit,
                        billNumber: editBillData.billNumber.trim() || billToEdit.billNumber,
                        purchaserName: editBillData.purchaserName.trim(),
                        purchaserRegistrationType: editBillData.purchaserRegistrationType,
                        purchaserGstin: editBillData.purchaserRegistrationType === 'Registered' ? editBillData.purchaserGstin : '',
                        consigneeAddress: editBillData.consigneeAddress.trim(),
                        consigneeState: editBillData.consigneeState.trim(),
                        consigneeStateCode: editBillData.consigneeStateCode.trim(),
                        buyerName: editBillData.sameAsConsignee ? editBillData.purchaserName : editBillData.buyerName,
                        buyerAddress: editBillData.sameAsConsignee ? editBillData.consigneeAddress : editBillData.buyerAddress,
                        buyerGstin: editBillData.sameAsConsignee ? editBillData.purchaserGstin : editBillData.buyerGstin,
                        vehicleNumber: editBillData.vehicleNumber.trim(),
                        destination: editBillData.destination.trim(),
                        items: editBillData.items,
                        commodity: editBillData.items[0]?.description || billToEdit.commodity,
                      };
                      downloadEWayBillJson(snapshot);
                    }
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs transition flex items-center space-x-1.5 border border-amber-500/30"
                  title="Download Government NIC E-Way Bill JSON for this invoice"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download E-Way JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (billToEdit) {
                      const snapshot: any = {
                        ...billToEdit,
                        ...editBillData,
                        billNumber: editBillData.billNumber.trim(),
                        eWayBillNo: editBillData.eWayBillNo.trim(),
                        vehicleNumber: editBillData.vehicleNumber.trim(),
                        destination: editBillData.destination.trim(),
                        items: editBillData.items,
                      };
                      generateBothBillAndEWayPDF(snapshot, true);
                    }
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                  title="Print Both Invoice & e-Way Bill"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Both (Bill + e-Way)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (billToEdit) {
                      const snapshot: any = {
                        ...billToEdit,
                        ...editBillData,
                        billNumber: editBillData.billNumber.trim(),
                        eWayBillNo: editBillData.eWayBillNo.trim(),
                        vehicleNumber: editBillData.vehicleNumber.trim(),
                        destination: editBillData.destination.trim(),
                        items: editBillData.items,
                      };
                      generateEWayBillPDF(snapshot, true);
                    }
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow"
                  title="Print Government e-Way Bill PDF"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>e-Way Bill</span>
                </button>

                <button
                  type="submit"
                  disabled={isSavingEditBill}
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black rounded-xl text-xs transition flex items-center space-x-2 shadow-lg shadow-cyan-900/40"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSavingEditBill
                      ? 'Updating...'
                      : '💾 Save Updates and Download New PDF'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENTER E-WAY BILL NUMBER & PRINT */}
      {eWayModalBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Print e-Way Bill</h3>
                  <p className="text-[11px] text-slate-400">Bill No: #{eWayModalBill.billNumber || eWayModalBill.receipt}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEWayModalBill(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Party Name:</span>
                  <span className="font-bold text-white truncate max-w-[200px]">{eWayModalBill.party || eWayModalBill.purchaserName || 'General Party'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Total Value:</span>
                  <span className="font-bold text-emerald-400">₹{Number(eWayModalBill.totalAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Quantity:</span>
                  <span className="font-bold text-amber-300">{eWayModalBill.totalCartons || 0} CTN</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-300 mb-1">
                  Government e-Way Bill Number (12-Digit) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2418 9201 8472"
                  value={eWayModalInputNo}
                  onChange={(e) => setEWayModalInputNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-amber-500/50 rounded-xl text-amber-200 font-mono font-bold text-sm focus:outline-none focus:border-amber-400"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter the 12-digit number generated on the GST portal (ewaybillgst.gov.in).
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. DL01LAH5192"
                  value={eWayModalVehicleNo}
                  onChange={(e) => setEWayModalVehicleNo(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={isSavingEWayModal}
                onClick={() => handleConfirmPrintEWay('both')}
                className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-950/40"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>🖨️ Print Both (Bill + e-Way)</span>
              </button>
              <button
                type="button"
                disabled={isSavingEWayModal}
                onClick={() => handleConfirmPrintEWay('eway')}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 border border-amber-500/30"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>e-Way Bill Only</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        currentRole="biller"
      />
    </div>
  );
}
