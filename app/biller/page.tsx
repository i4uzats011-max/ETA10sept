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
} from 'lucide-react';
import { generateBillPDF } from '@/lib/billPdf';

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

  purchaserName?: string;
  purchaserRegistrationType?: 'Registered' | 'Unregistered';
  purchaserGstin?: string;
  purchaserAddress?: string;

  vehicleNumber?: string;
  isDispatched: boolean;
  dispatchStatus: string;
  deliveryDate?: string;
  deliveryTime?: string;
  createdAt: string;
}

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
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerGstin, setNewSellerGstin] = useState('');
  const [newSellerAddress, setNewSellerAddress] = useState('');
  const [newSellerState, setNewSellerState] = useState('Delhi');
  const [newSellerStateCode, setNewSellerStateCode] = useState('07');
  const [isSavingSeller, setIsSavingSeller] = useState(false);

  // Manual Form State
  const [receiptNo, setReceiptNo] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [igstRate, setIgstRate] = useState<number>(18);
  const [billingUnit, setBillingUnit] = useState<'Pcs' | 'KG' | 'Cartons'>('Pcs');
  const [totalCartons, setTotalCartons] = useState<string>('');
  const [quantityPcs, setQuantityPcs] = useState<string>('');
  const [quantityKg, setQuantityKg] = useState<string>('');
  const [taxableValue, setTaxableValue] = useState<string>('');
  const [partyName, setPartyName] = useState('');
  const [mainMarka, setMainMarka] = useState('');
  const [subMarka, setSubMarka] = useState('');
  const [containerAlias, setContainerAlias] = useState('');
  const [commodity, setCommodity] = useState('');

  // Purchaser Details State
  const [purchaserName, setPurchaserName] = useState('');
  const [registrationType, setRegistrationType] = useState<'Registered' | 'Unregistered'>('Registered');
  const [purchaserGstin, setPurchaserGstin] = useState('');
  const [purchaserAddress, setPurchaserAddress] = useState('');

  // Single Entry Cascade Selector State
  const [singleContainer, setSingleContainer] = useState<string>('');
  const [singleAvailableMarkas, setSingleAvailableMarkas] = useState<any[]>([]);
  const [singleSelectedMarka, setSingleSelectedMarka] = useState<string>('');
  const [singleAvailableReceipts, setSingleAvailableReceipts] = useState<any[]>([]);
  const [singleSelectedReceipt, setSingleSelectedReceipt] = useState<string>('');
  const [globalMarkasList, setGlobalMarkasList] = useState<string[]>([]);
  const [isLoadingCascade, setIsLoadingCascade] = useState(false);

  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);

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
        setSellers(data.sellers || []);
        if (data.sellers && data.sellers.length > 0 && !selectedSellerId) {
          const def = data.sellers.find((s: SellerItem) => s.isDefault) || data.sellers[0];
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

  // Calculated manual values
  const calculatedIgstAmt = useMemo(() => {
    const val = parseFloat(taxableValue) || 0;
    const rate = Number(igstRate) || 18;
    return Number((val * (rate / 100)).toFixed(2));
  }, [taxableValue, igstRate]);

  const calculatedTotalAmt = useMemo(() => {
    const val = parseFloat(taxableValue) || 0;
    return Number((val + calculatedIgstAmt).toFixed(2));
  }, [taxableValue, calculatedIgstAmt]);

  // Apply shipment object to manual form
  const applyShipmentToForm = (shipment: any, markaAddress?: any) => {
    setReceiptNo(shipment.receipt || '');
    setContainerAlias(shipment.container || singleContainer || '');
    setMainMarka(shipment.mainMarka || shipment.marka || '');
    setSubMarka(shipment.subMarka || '');
    setCommodity(shipment.commodity || '');
    setTotalCartons(shipment.cartons ? String(shipment.cartons) : '');
    setQuantityKg(shipment.weightKg ? String(shipment.weightKg) : '');
    setQuantityPcs(shipment.cartons ? String(shipment.cartons * 10) : '');
    setPartyName(shipment.party || '');

    // Purchaser details
    if (markaAddress) {
      setPurchaserName(markaAddress.purchaserName || shipment.party || '');
      setRegistrationType(markaAddress.registrationType || 'Registered');
      setPurchaserGstin(markaAddress.gstin || '');
      if (markaAddress.addresses && markaAddress.addresses.length > 0) {
        setPurchaserAddress(markaAddress.addresses[0].address || '');
      }
    } else {
      setPurchaserName(shipment.party || '');
    }

    setLookupMessage(
      `✓ Auto-filled from Manifest: Container [${shipment.container}] | Marka [${shipment.mainMarka || shipment.subMarka || shipment.marka}] | ${shipment.cartons || 0} Cartons | ${shipment.weightKg || 0} KG`
    );
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

    if (!m.trim()) return;

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

        if (shipments.length === 1) {
          const s = shipments[0];
          setSingleSelectedReceipt(s.receipt);
          applyShipmentToForm(s, data.markaAddress);
        } else if (shipments.length > 1) {
          setLookupMessage(`Found ${shipments.length} receipts for Marka "${m}". Please select a receipt below.`);
        } else {
          setLookupMessage(`No shipments found for Marka "${m}".`);
        }
      }
    } catch (err) {
      console.error('Marka cascade error:', err);
    } finally {
      setIsLoadingCascade(false);
    }
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
    setSingleSelectedReceipt('');
    setSingleAvailableReceipts([]);
    setSingleAvailableMarkas(globalMarkasList.map((m) => ({ marka: m })));
    setReceiptNo('');
    setTotalCartons('');
    setQuantityPcs('');
    setQuantityKg('');
    setHsnCode('');
    setTaxableValue('');
    setPartyName('');
    setMainMarka('');
    setSubMarka('');
    setContainerAlias('');
    setCommodity('');
    setPurchaserName('');
    setPurchaserGstin('');
    setPurchaserAddress('');
    setLookupMessage(null);
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
                if (ma.addresses && ma.addresses.length > 0) {
                  setPurchaserAddress(ma.addresses[0].address);
                }
              } else {
                setPurchaserName(af.party || '');
              }
            }
          } else {
            setPurchaserName(af.party || '');
          }

          setLookupMessage(`✓ Matched cargo in Container: ${af.container || 'Recorded'}`);
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

  // Add New Seller Party
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
          name: newSellerName.trim(),
          gstin: newSellerGstin.trim().toUpperCase(),
          address: newSellerAddress.trim(),
          state: newSellerState.trim(),
          stateCode: newSellerStateCode.trim(),
          isDefault: sellers.length === 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save seller');

      await fetchSellers();
      if (data.seller) {
        setSelectedSellerId(data.seller._id);
      }
      setShowSellerModal(false);
      setNewSellerName('');
      setNewSellerGstin('');
      setNewSellerAddress('');
    } catch (err: any) {
      alert(err.message || 'Error saving seller');
    } finally {
      setIsSavingSeller(false);
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
    if (!receiptNo.trim()) return;

    setIsSubmittingManual(true);
    setManualSuccessMsg(null);

    try {
      const payload = {
        receipt: receiptNo.trim(),
        hsnCode: hsnCode.trim(),
        igst: Number(igstRate) || 18,
        billingUnit: billingUnit,
        totalCartons: parseFloat(totalCartons) || 0,
        quantityPcs: parseFloat(quantityPcs) || 0,
        quantityKg: parseFloat(quantityKg) || 0,
        taxableValue: parseFloat(taxableValue) || 0,
        party: partyName.trim(),
        mainMarka: mainMarka.trim(),
        subMarka: subMarka.trim(),
        container: containerAlias.trim(),
        commodity: commodity.trim(),

        // Seller party
        sellerId: currentSeller?._id || '',
        sellerName: currentSeller?.name || 'US INTERNATIONAL LOGISTICS',
        sellerGstin: currentSeller?.gstin || '',
        sellerAddress: currentSeller?.address || '',
        sellerState: currentSeller?.state || 'Delhi',
        sellerStateCode: currentSeller?.stateCode || '07',

        // Purchaser
        purchaserName: purchaserName.trim() || partyName.trim() || 'General Party',
        purchaserRegistrationType: registrationType,
        purchaserGstin: registrationType === 'Registered' ? purchaserGstin.trim().toUpperCase() : '',
        purchaserAddress: purchaserAddress.trim(),
      };

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create bill');

      setManualSuccessMsg(`Bill generated successfully for Receipt #${receiptNo}!`);
      // Reset form
      setReceiptNo('');
      setHsnCode('');
      setTotalCartons('');
      setQuantityPcs('');
      setQuantityKg('');
      setTaxableValue('');
      setPartyName('');
      setMainMarka('');
      setSubMarka('');
      setContainerAlias('');
      setCommodity('');
      setPurchaserName('');
      setPurchaserGstin('');
      setPurchaserAddress('');
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
          const commodity = String(getVal(['commodity', 'english', 'description', 'goods'])).trim();
          const hsnCode = String(getVal(['hsn code', 'hsn', 'hsncode'])).trim();
          const igst = Number(getVal(['igst', 'igst %', 'tax rate'])) || 18;

          const cartons = Number(getVal(['cartons (ctn)', 'cartons', 'ctn', 'quantity'])) || 0;
          const rawUnit = String(getVal(['billing unit (pcs/kg/cartons)', 'billing unit', 'unit'])).trim().toLowerCase();
          const bUnit: 'Pcs' | 'KG' | 'Cartons' = rawUnit.includes('kg') ? 'KG' : rawUnit.includes('carton') || rawUnit.includes('ctn') ? 'Cartons' : 'Pcs';

          const pcs = Number(getVal(['quantity pcs', 'quntity pcs', 'pcs'])) || 0;
          const kg = Number(getVal(['quantity kg', 'weight kg', 'weight', 'kg', 'gross weight'])) || 0;
          const taxable = Number(getVal(['taxable', 'taxable value', 'amount', 'taxable amt'])) || 0;

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
      const payload = excelRows.map((r) => ({
        receipt: r.receipt,
        container: r.container,
        mainMarka: r.mainMarka,
        subMarka: r.subMarka,
        party: r.party,
        commodity: r.commodity,
        hsnCode: r.hsnCode,
        igst: r.igst,
        billingUnit: r.billingUnit || 'Pcs',
        totalCartons: r.cartons || 0,
        quantityPcs: r.quantityPcs,
        quantityKg: r.quantityKg,
        taxableValue: r.taxableValue,

        // Apply selected seller
        sellerId: currentSeller?._id || '',
        sellerName: currentSeller?.name || 'US INTERNATIONAL LOGISTICS',
        sellerGstin: currentSeller?.gstin || '',
        sellerAddress: currentSeller?.address || '',
        sellerState: currentSeller?.state || 'Delhi',
        sellerStateCode: currentSeller?.stateCode || '07',
      }));

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk generation failed');

      setBulkStatusMsg({
        type: 'success',
        text: `Success! ${data.processedCount || excelRows.length} bills generated with Seller '${currentSeller?.name || 'US Logistics'}'.`,
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
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-2xl text-sky-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Billing Company / Seller Party (सेलर पार्टी चुनें)
              </div>
              <div className="text-base font-black text-white flex items-center space-x-2">
                <span>{currentSeller?.name || 'Loading Sellers...'}</span>
                {currentSeller?.gstin && (
                  <span className="text-[11px] font-mono text-slate-400 font-normal">
                    (GSTIN: {currentSeller.gstin})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {currentSeller?.address || 'Mayapuri Industrial Area, New Delhi'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <select
              value={selectedSellerId}
              onChange={(e) => setSelectedSellerId(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white focus:ring-2 focus:ring-sky-500 outline-none"
            >
              {sellers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} {s.gstin ? `(${s.gstin})` : ''} {s.isDefault ? '★ Default' : ''}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowSellerModal(true)}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-sky-950/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add / Manage Sellers</span>
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

                  {/* Marka Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>2. Marka (मार्का चुनें) *</span>
                      {singleAvailableMarkas.length > 0 && (
                        <span className="text-[10px] text-cyan-400">
                          {singleAvailableMarkas.length} Markas available
                        </span>
                      )}
                    </label>
                    <select
                      value={singleSelectedMarka}
                      onChange={(e) => handleSingleMarkaChange(e.target.value)}
                      disabled={isLoadingCascade}
                      className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-xs font-bold text-cyan-300 focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                      <option value="">-- मार्का चुनें (Choose Marka) --</option>
                      {singleAvailableMarkas.map((m: any, idx: number) => {
                        const mName = typeof m === 'string' ? m : m.marka;
                        const countText = m.count ? ` (${m.count} shipments, ${m.totalCartons || 0} CTN)` : '';
                        return (
                          <option key={idx} value={mName}>
                            {mName} {countText}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      {singleContainer
                        ? `Showing markas inside container ${singleContainer}`
                        : 'Showing all markas in system'}
                    </p>
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

              {/* STEP 2: MANDATORY DETAILS & BILLING CONFIGURATION (FILLED MANUALLY) */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
                  <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-sky-400">
                      Step 2: Mandatory Details & Billing Configuration (अनिवार्य डिटेल्स - मैन्युअल भरें)
                    </div>
                    <p className="text-[11px] text-slate-400">
                      सेलर पार्टी, बिलिंग यूनिट, HSN कोड और टैक्सेबल वैल्यू मैन्युअल भरें
                    </p>
                  </div>
                </div>

                {/* Row A: Seller Party Selection & Billing Unit */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Seller Party Selection */}
                  <div className="space-y-1.5 p-3.5 bg-slate-900/60 border border-sky-500/30 rounded-2xl">
                    <label className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Seller Party / Billing Entity (सेलर चुनें) *</span>
                      {currentSeller?.gstin && (
                        <span className="text-[10px] text-slate-400 font-mono">GSTIN: {currentSeller.gstin}</span>
                      )}
                    </label>
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedSellerId}
                        onChange={(e) => setSelectedSellerId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        {sellers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name} {s.gstin ? `(${s.gstin})` : ''} {s.isDefault ? '★' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowSellerModal(true)}
                        className="px-2.5 py-2 bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 flex-shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {currentSeller?.address || 'Mayapuri Industrial Area, New Delhi'}
                    </p>
                  </div>

                  {/* Billing Unit Selection */}
                  <div className="space-y-1.5 p-3.5 bg-slate-900/60 border border-amber-500/30 rounded-2xl">
                    <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Billing Unit (बिलिंग यूनिट तय करें) *</span>
                      <span className="text-[10px] text-slate-400">Decided by Biller</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      {(['Pcs', 'KG', 'Cartons'] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setBillingUnit(unit)}
                          className={`py-2 px-2 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1 ${
                            billingUnit === unit
                              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          <span>{unit === 'Pcs' ? 'Pieces' : unit === 'KG' ? 'KG (वजन)' : 'Cartons'}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {billingUnit === 'Pcs' && '✓ प्राथमिक बिलिंग पीस (Pcs) में होगी।'}
                      {billingUnit === 'KG' && '✓ प्राथमिक बिलिंग वजन/किलोग्राम (KG) में होगी।'}
                      {billingUnit === 'Cartons' && '✓ प्राथमिक बिलिंग कार्टून (Cartons) में होगी।'}
                    </p>
                  </div>
                </div>

                {/* Row B: Mandatory HSN, Taxable Value, and IGST Rate */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* HSN Code */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white flex items-center justify-between">
                      <span>HSN Code (एचएसएन कोड) *</span>
                      <span className="text-[10px] text-amber-400 font-semibold">Mandatory (अनिवार्य)</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      placeholder="e.g. 94054900"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
                    />
                  </div>

                  {/* Taxable Value */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                      <span>Taxable Value (टैक्सेबल वैल्यू ₹) *</span>
                      <span className="text-[10px] text-emerald-400 font-semibold">Mandatory (अनिवार्य)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={taxableValue}
                      onChange={(e) => setTaxableValue(e.target.value)}
                      placeholder="e.g. 281637"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/50 text-emerald-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-black"
                    />
                  </div>

                  {/* IGST Rate */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      IGST Rate (%)
                    </label>
                    <select
                      value={igstRate}
                      onChange={(e) => setIgstRate(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
                    >
                      <option value={18}>18% (Standard IGST)</option>
                      <option value={12}>12%</option>
                      <option value={5}>5%</option>
                      <option value={28}>28%</option>
                      <option value={0}>0% (Exempt)</option>
                    </select>
                  </div>
                </div>

                {/* Row C: Cargo Packaging & Quantities (Auto-filled, editable) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-800/80">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      Total Cartons (कुल कार्टून)
                    </label>
                    <input
                      type="number"
                      value={totalCartons}
                      onChange={(e) => setTotalCartons(e.target.value)}
                      placeholder="Cartons"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-purple-300 block mb-1">
                      Quantity (Pieces)
                    </label>
                    <input
                      type="number"
                      value={quantityPcs}
                      onChange={(e) => setQuantityPcs(e.target.value)}
                      placeholder="Pieces"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-purple-200 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-cyan-300 block mb-1">
                      Quantity (KG Weight)
                    </label>
                    <input
                      type="number"
                      value={quantityKg}
                      onChange={(e) => setQuantityKg(e.target.value)}
                      placeholder="Weight KG"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-cyan-200 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      Commodity / Item
                    </label>
                    <input
                      type="text"
                      value={commodity}
                      onChange={(e) => setCommodity(e.target.value)}
                      placeholder="Goods description"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 3: PURCHASER DETAILS (MANUALLY ENTERED / EDITABLE) */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-violet-500/10 border border-violet-500/30 rounded-xl text-violet-400">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-violet-300 uppercase tracking-wider">
                        Step 3: Purchaser Details (खरीदार की डिटेल - मैन्युअल भरें / एडिट करें)
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Registered (जीएसटी नंबर के साथ) या Unregistered (URP) पार्टी
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="text-xs text-slate-300 font-bold block mb-1">Purchaser Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={purchaserName}
                      onChange={(e) => setPurchaserName(e.target.value)}
                      placeholder="e.g. Radhey Trading Co."
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 outline-none font-semibold"
                    />
                  </div>

                  {registrationType === 'Registered' ? (
                    <div>
                      <label className="text-xs text-emerald-400 font-bold block mb-1">
                        Purchaser GSTIN (15-digit GST) *
                      </label>
                      <input
                        type="text"
                        required={registrationType === 'Registered'}
                        value={purchaserGstin}
                        onChange={(e) => setPurchaserGstin(e.target.value.toUpperCase())}
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
                    <label className="text-xs text-slate-300 font-bold block mb-1">Purchaser Billing Address</label>
                    <input
                      type="text"
                      value={purchaserAddress}
                      onChange={(e) => setPurchaserAddress(e.target.value)}
                      placeholder="e.g. Shop No 4, Chandni Chowk, Delhi"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 4: CALCULATED SUMMARY BOX & GENERATE BUTTON */}
              <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-950 border border-slate-800 rounded-3xl p-5 gap-4 shadow-xl">
                <div className="flex items-center space-x-6 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Taxable Amount:</span>
                    <span className="font-black text-white text-base">
                      ₹{parseFloat(taxableValue || '0').toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">IGST ({igstRate}%):</span>
                    <span className="font-black text-amber-400 text-base">
                      ₹{calculatedIgstAmt.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-slate-400 block text-[11px]">Total Invoice Amount:</span>
                    <span className="font-black text-emerald-400 text-lg">
                      ₹{calculatedTotalAmt.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingManual || !receiptNo.trim() || !hsnCode.trim() || !taxableValue.trim()}
                  className="w-full sm:w-auto px-7 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isSubmittingManual ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Generating Bill...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Generate Bill (Without Vehicle No.)</span>
                    </>
                  )}
                </button>
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

          {/* Bills Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
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
                    <td colSpan={13} className="p-8 text-center text-slate-500">
                      <div className="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <p>Loading generated bills...</p>
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-slate-500">
                      No bills found. Select a container above to download its manifest, or use manual entry.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => (
                    <tr key={b._id} className="hover:bg-slate-800/40 transition">
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
                        {b.vehicleNumber ? (
                          <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded font-bold text-[11px]">
                            {b.vehicleNumber}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950/50 border border-amber-800/60 text-amber-400 rounded text-[11px]">
                            Pending (बाकी)
                          </span>
                        )}
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

      {/* MODAL: ADD / MANAGE SELLER PARTIES */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-black text-white">Add New Seller Party (सेलर पार्टी जोड़ें)</h3>
              </div>
              <button
                onClick={() => setShowSellerModal(false)}
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
                  placeholder="e.g. US Freight Lines Pvt Ltd"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  GSTIN (15-Digit GST Number)
                </label>
                <input
                  type="text"
                  value={newSellerGstin}
                  onChange={(e) => setNewSellerGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 07AAACU1234F1Z9"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase"
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
                  placeholder="Plot No 22, Transport Nagar, Delhi"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State</label>
                  <input
                    type="text"
                    value={newSellerState}
                    onChange={(e) => setNewSellerState(e.target.value)}
                    placeholder="Delhi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">State Code</label>
                  <input
                    type="text"
                    value={newSellerStateCode}
                    onChange={(e) => setNewSellerStateCode(e.target.value)}
                    placeholder="07"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSellerModal(false)}
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
                      <span>Save Seller Party</span>
                    </>
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
