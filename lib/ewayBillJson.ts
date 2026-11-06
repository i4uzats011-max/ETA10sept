/**
 * Government of India - National Informatics Centre (NIC)
 * Official E-Way Bill Bulk Generation JSON Schema Builder
 * Standard format for bulk upload on https://ewaybillgst.gov.in
 */

import { getStateCode } from './states';

export interface EWayBillItemPayload {
  itemNo: number;
  productName: string;
  productDesc: string;
  hsnCode: string | number;
  quantity: number;
  qtyUnit: string;
  taxableAmount: number;
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonAdvol: number;
}

export interface EWayBillEntryPayload {
  userGstin?: string;
  supplyType: 'O'; // Outward
  subSupplyType: number; // 1: Supply (NIC standard integer)
  subSupplyDesc?: string;
  docType: 'INV'; // INV: Tax Invoice
  docNo: string; // Invoice / Bill Number (e.g. NI/26-27/349)
  docDate: string; // DD/MM/YYYY
  transType: number; // 1: Regular
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  actualFromStateCode: number; // 7 for Delhi
  fromPincode: number; // e.g. 110042
  fromStateCode: number; // 7 for Delhi
  toGstin: string; // 'URP' for unregistered or 15-digit GSTIN
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: number; // e.g. 110036
  actualToStateCode: number; // 7 for Delhi
  toStateCode: number; // 7 for Delhi
  totalValue: number; // Total Taxable Value
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  TotNonAdvolVal: number; // 0
  OthValue: number; // 0
  totInvValue: number; // Grand Total Invoice Value
  transMode: number; // 1: Road (integer)
  transDistance: number; // 0 (or in KM)
  transporterName: string;
  transporterId: string;
  transDocNo: string;
  transDocDate: string;
  vehicleNo: string; // e.g. "DL01LAH5192"
  vehicleType: string; // 'R' if vehicleNo is present, else ''
  mainHsnCode: string; // e.g. "94039900"
  itemList: EWayBillItemPayload[];
}

export interface EWayBillJsonContainer {
  version: string;
  billLists: EWayBillEntryPayload[];
}

/**
 * Format a Date or date string to DD/MM/YYYY for the E-Way Bill portal
 */
export function formatEWayBillDate(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Extract 6-digit Indian PIN code from address string
 */
export function extractPincode(address?: string, fallback: number = 110006): number {
  if (!address) return fallback;
  const match = address.match(/\b([1-9][0-9]{5})\b/);
  if (match) {
    const pin = parseInt(match[1], 10);
    if (!isNaN(pin)) return pin;
  }
  return fallback;
}

/**
 * Split an address into addr1 and addr2 for NIC portal character limits
 */
export function splitAddress(fullAddress?: string): { addr1: string; addr2: string; place: string } {
  if (!fullAddress || !fullAddress.trim()) {
    return {
      addr1: 'SHOP NO -17/18, MAIN ROAD',
      addr2: 'SADAR BAZAR',
      place: 'DELHI',
    };
  }

  const clean = fullAddress.trim().replace(/\s+/g, ' ');
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);

  let place = 'DELHI';
  // Try to find locality or city
  for (let i = parts.length - 1; i >= 0; i--) {
    const pt = parts[i].toUpperCase();
    if (pt.includes('DELHI') || pt.includes('NEW DELHI')) {
      place = 'DELHI';
      break;
    } else if (pt.length >= 3 && !/^\d+$/.test(pt)) {
      place = pt.slice(0, 50);
      break;
    }
  }

  if (parts.length === 1) {
    return {
      addr1: parts[0].slice(0, 100),
      addr2: '',
      place,
    };
  }

  const mid = Math.ceil(parts.length / 2);
  const addr1 = parts.slice(0, mid).join(', ').slice(0, 100);
  const addr2 = parts.slice(mid).join(', ').slice(0, 100);

  return { addr1, addr2, place };
}

/**
 * Clean and format vehicle number for NIC portal (must not contain spaces or special chars)
 */
export function formatVehicleNumber(vNo?: string): string {
  if (!vNo) return '';
  return vNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Transform a BillItem or bill object into an NIC Government-compliant E-Way Bill entry
 */
export function convertBillToEWayEntry(bill: any): EWayBillEntryPayload {
  // Use separate E-Way invoice number if provided, else invoiceNumber, else billNumber, else receipt
  const rawDocNo = bill.eWayInvoiceNumber || bill.invoiceNumber || bill.billNumber || bill.receipt || Date.now().toString().slice(-6);
  const docNo = String(rawDocNo).trim();
  const docDate = formatEWayBillDate(bill.createdAt || new Date());

  // Supplier / Seller Details
  const fromGstin = (bill.sellerGstin || '07AABCD1234E1Z5').trim().toUpperCase();
  const fromTrdName = (bill.sellerName || 'NORDEX INTERNATIONAL').trim().slice(0, 100);
  const sellerAddr = splitAddress(bill.sellerAddress || 'SHOP NO 1, MAIN ROAD, SADAR BAZAR, DELHI - 110006');
  const fromPincode = bill.sellerPincode ? parseInt(bill.sellerPincode, 10) || 110006 : extractPincode(bill.sellerAddress, 110006);
  const fromStateCode = parseInt(getStateCode(bill.sellerStateCode || bill.sellerState || 'Delhi') || '7', 10);

  // Recipient / Consignee Details
  const isUnregistered =
    bill.purchaserRegistrationType === 'Unregistered' ||
    !bill.purchaserGstin ||
    bill.purchaserGstin.trim().toUpperCase() === 'URP';

  const toGstin = isUnregistered ? 'URP' : String(bill.purchaserGstin || bill.consigneeGstin).trim().toUpperCase();
  const toTrdName = String(bill.purchaserName || bill.consigneeName || bill.party || 'General Party').trim().slice(0, 100);
  const consigneeAddrFull = bill.consigneeAddress || bill.purchaserAddress || bill.buyerAddress || 'SHOP NO -17/18, MAIN ROAD, SADAR BAZAR, DELHI - 110006';
  const toAddr = splitAddress(consigneeAddrFull);
  const toPincode = extractPincode(consigneeAddrFull, 110006);
  const toStateCode = parseInt(
    getStateCode(bill.consigneeStateCode || bill.consigneeState || bill.buyerState || 'Delhi') || '7',
    10
  );

  const isDelhiIntra = fromStateCode === toStateCode;

  // Items List
  const items: any[] = Array.isArray(bill.items) && bill.items.length > 0 ? bill.items : [];
  const rawIgstRate = Number(bill.igst) || 18;

  let itemList: EWayBillItemPayload[] = [];

  if (items.length > 0) {
    itemList = items.map((it: any, idx: number) => {
      const itQty = Number(it.quantity) || 1;
      const itRate = Number(it.rate) || 0;
      const itAmt = Number(it.amount) || Number((itQty * itRate).toFixed(2)) || 0;
      const rawHsn = String(it.hsnCode || bill.hsnCode || '94039900').replace(/\D/g, '');
      const desc = String(it.description || bill.commodity || 'COMMERCIAL GOODS').trim().slice(0, 100);

      const itUnit = String(it.unit || bill.billingUnit || 'CTN').trim().toUpperCase();
      let qtyUnit = 'PCS';
      if (itUnit.includes('KG')) qtyUnit = 'KGS';
      else if (itUnit.includes('CTN') || itUnit.includes('CARTON')) qtyUnit = 'CTN';
      else if (itUnit.includes('BOX')) qtyUnit = 'BOX';
      else if (itUnit.includes('BAG')) qtyUnit = 'BAG';
      else qtyUnit = 'PCS';

      return {
        itemNo: it.itemNo || idx + 1,
        productName: desc,
        productDesc: 'Other',
        hsnCode: rawHsn,
        quantity: itQty,
        qtyUnit,
        taxableAmount: itAmt,
        sgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        cgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        igstRate: isDelhiIntra ? 0 : rawIgstRate,
        cessRate: 0,
        cessNonAdvol: 0,
      };
    });
  } else {
    const itQty = Number(bill.quantityPcs) || Number(bill.quantityKg) || Number(bill.totalCartons) || 1;
    const itAmt = Number(bill.taxableValue) || 0;
    const rawHsn = String(bill.hsnCode || '94039900').replace(/\D/g, '');
    const desc = String(bill.commodity || 'COMMERCIAL GOODS').trim().slice(0, 100);

    const bUnit = String(bill.billingUnit || 'CTN').trim().toUpperCase();
    let qtyUnit = 'PCS';
    if (bUnit.includes('KG')) qtyUnit = 'KGS';
    else if (bUnit.includes('CTN') || bUnit.includes('CARTON')) qtyUnit = 'CTN';
    else if (bUnit.includes('BOX')) qtyUnit = 'BOX';
    else if (bUnit.includes('BAG')) qtyUnit = 'BAG';
    else qtyUnit = 'PCS';

    itemList = [
      {
        itemNo: 1,
        productName: desc,
        productDesc: 'Other',
        hsnCode: rawHsn,
        quantity: itQty,
        qtyUnit,
        taxableAmount: itAmt,
        sgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        cgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        igstRate: isDelhiIntra ? 0 : rawIgstRate,
        cessRate: 0,
        cessNonAdvol: 0,
      },
    ];
  }

  // Values calculation
  const totalTaxable = itemList.reduce((acc, it) => acc + (it.taxableAmount || 0), 0) || Number(bill.taxableValue || 0);
  const cgstVal = isDelhiIntra ? Number(((totalTaxable * (rawIgstRate / 2)) / 100).toFixed(2)) : 0;
  const sgstVal = isDelhiIntra ? Number(((totalTaxable * (rawIgstRate / 2)) / 100).toFixed(2)) : 0;
  const igstVal = isDelhiIntra ? 0 : Number(((totalTaxable * rawIgstRate) / 100).toFixed(2));
  const totalInvoiceVal = Number((totalTaxable + cgstVal + sgstVal + igstVal).toFixed(2)) || Number(bill.totalAmount || 0);

  // Vehicle and Part-B / Transporter resolution
  const cleanVehicleNo = formatVehicleNumber(bill.vehicleNumber);
  const hasVehicle = Boolean(cleanVehicleNo && cleanVehicleNo.length >= 4);

  // Resolution of PIN code for Seller (North West Delhi / Badli defaults to 110042)
  let resolvedFromPincode = bill.sellerPincode ? parseInt(bill.sellerPincode, 10) : extractPincode(bill.sellerAddress, 110042);
  if (!resolvedFromPincode || (resolvedFromPincode === 110006 && String(bill.sellerAddress || '').toLowerCase().includes('badli'))) {
    resolvedFromPincode = 110042;
  }

  const mainHsnCode = String(itemList[0]?.hsnCode || bill.hsnCode || '94039900').replace(/\D/g, '');

  return {
    userGstin: fromGstin,
    supplyType: 'O',
    subSupplyType: 1, // Official NIC integer
    subSupplyDesc: '',
    docType: 'INV',
    docNo: docNo.slice(0, 16),
    docDate,
    transType: 1,
    fromGstin,
    fromTrdName,
    fromAddr1: (bill.sellerAddress || 'ground floor, house no. 371 plot no. 319, Badli Road, Badli Sub Post Office, Badli, New Delhi').trim().slice(0, 120),
    fromAddr2: String(resolvedFromPincode),
    fromPlace: '',
    actualFromStateCode: fromStateCode,
    fromPincode: resolvedFromPincode,
    fromStateCode,
    toGstin,
    toTrdName,
    toAddr1: (consigneeAddrFull || 'SHOP NO.17/18 MAIN ROAD, Delhi').trim().slice(0, 120),
    toAddr2: '',
    toPlace: '',
    toPincode,
    actualToStateCode: toStateCode,
    toStateCode,
    totalValue: Number(totalTaxable.toFixed(2)),
    cgstValue: cgstVal,
    sgstValue: sgstVal,
    igstValue: igstVal,
    cessValue: 0,
    TotNonAdvolVal: 0,
    OthValue: 0,
    totInvValue: totalInvoiceVal,
    transMode: 1, // Road (integer)
    transDistance: parseInt(String(bill.distance || bill.transDistance || '0'), 10) || 0,
    transporterName: hasVehicle ? '' : (bill.transporterName || fromTrdName || 'Self').trim(),
    transporterId: hasVehicle ? '' : (bill.transporterId || fromGstin || '').trim(),
    transDocNo: '',
    transDocDate: '',
    vehicleNo: cleanVehicleNo,
    vehicleType: hasVehicle ? 'R' : '',
    mainHsnCode,
    itemList,
  };
}

/**
 * Builds standard Government E-Way Bill JSON structure for single or multiple bills
 */
export function buildEWayBillJson(bills: any | any[]): EWayBillJsonContainer {
  const billArray = Array.isArray(bills) ? bills : [bills];
  const entries = billArray.filter(Boolean).map(convertBillToEWayEntry);

  return {
    version: '1.0.0621',
    billLists: entries,
  };
}

/**
 * Downloads the Government-compliant E-Way Bill JSON file directly to user's computer
 */
export function downloadEWayBillJson(bills: any | any[], customFilename?: string): void {
  const container = buildEWayBillJson(bills);
  const jsonString = JSON.stringify(container, null, 2);

  let filename = customFilename;
  if (!filename) {
    if (Array.isArray(bills) && bills.length > 1) {
      filename = `ewaybill_bulk_${bills.length}_invoices.json`;
    } else {
      const first = Array.isArray(bills) ? bills[0] : bills;
      const doc = first?.billNumber || first?.receipt || 'invoice';
      filename = `ewaybill_${String(doc).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    }
  }

  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
