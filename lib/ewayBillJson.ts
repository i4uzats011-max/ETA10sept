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
  hsnCode: number;
  quantity: number;
  qtyUnit: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonAdvol: number;
  taxableAmount: number;
}

export interface EWayBillEntryPayload {
  userGstin?: string;
  supplyType: 'O'; // Outward
  subSupplyType: '1'; // 1: Supply
  subSupplyDesc?: string;
  docType: 'INV'; // INV: Tax Invoice
  docNo: string; // Invoice / Bill Number
  docDate: string; // DD/MM/YYYY
  transType: number; // 1: Regular
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  fromPincode: number;
  actFromStateCode: number;
  fromStateCode: number;
  toGstin: string; // 'URP' for unregistered or 15-digit GSTIN
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: number;
  actToStateCode: number;
  toStateCode: number;
  transactionType: number;
  otherValue: number;
  totalValue: number; // Total Taxable Value
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  cessNonAdvolValue: number;
  totInvValue: number; // Grand Total Invoice Value
  transporterId: string;
  transporterName: string;
  transDocNo: string;
  transMode: string; // 1: Road
  transDistance: string; // in KM e.g. "20"
  transDocDate?: string;
  vehicleNo: string; // Vehicle Number (without spaces)
  vehicleType: string; // 'R': Regular
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
  const docNo = String(bill.billNumber || `BILL-${bill.receipt || Date.now().toString().slice(-6)}`).trim();
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
      const rawHsn = String(it.hsnCode || bill.hsnCode || '39269099').replace(/\D/g, '');
      const hsnCodeNum = parseInt(rawHsn, 10) || 39269099;
      const desc = String(it.description || bill.commodity || 'COMMERCIAL GOODS').trim().slice(0, 100);

      const itUnit = String(it.unit || bill.billingUnit || 'PCS').trim().toUpperCase();
      let qtyUnit = 'PCS';
      if (itUnit.includes('KG')) qtyUnit = 'KGS';
      else if (itUnit.includes('CTN') || itUnit.includes('CARTON')) qtyUnit = 'BOX';
      else if (itUnit.includes('BAG')) qtyUnit = 'BAG';
      else qtyUnit = 'PCS';

      return {
        itemNo: it.itemNo || idx + 1,
        productName: desc,
        productDesc: desc,
        hsnCode: hsnCodeNum,
        quantity: itQty,
        qtyUnit,
        cgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        sgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        igstRate: isDelhiIntra ? 0 : rawIgstRate,
        cessRate: 0,
        cessNonAdvol: 0,
        taxableAmount: itAmt,
      };
    });
  } else {
    const itQty = Number(bill.quantityPcs) || Number(bill.quantityKg) || Number(bill.totalCartons) || 1;
    const itAmt = Number(bill.taxableValue) || 0;
    const rawHsn = String(bill.hsnCode || '39269099').replace(/\D/g, '');
    const hsnCodeNum = parseInt(rawHsn, 10) || 39269099;
    const desc = String(bill.commodity || 'COMMERCIAL GOODS').trim().slice(0, 100);

    const bUnit = String(bill.billingUnit || 'PCS').trim().toUpperCase();
    let qtyUnit = 'PCS';
    if (bUnit.includes('KG')) qtyUnit = 'KGS';
    else if (bUnit.includes('CTN') || bUnit.includes('CARTON')) qtyUnit = 'BOX';
    else qtyUnit = 'PCS';

    itemList = [
      {
        itemNo: 1,
        productName: desc,
        productDesc: desc,
        hsnCode: hsnCodeNum,
        quantity: itQty,
        qtyUnit,
        cgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        sgstRate: isDelhiIntra ? Number((rawIgstRate / 2).toFixed(2)) : 0,
        igstRate: isDelhiIntra ? 0 : rawIgstRate,
        cessRate: 0,
        cessNonAdvol: 0,
        taxableAmount: itAmt,
      },
    ];
  }

  // Values calculation
  const totalTaxable = itemList.reduce((acc, it) => acc + (it.taxableAmount || 0), 0) || Number(bill.taxableValue || 0);
  const cgstVal = isDelhiIntra ? Number(((totalTaxable * (rawIgstRate / 2)) / 100).toFixed(2)) : 0;
  const sgstVal = isDelhiIntra ? Number(((totalTaxable * (rawIgstRate / 2)) / 100).toFixed(2)) : 0;
  const igstVal = isDelhiIntra ? 0 : Number(((totalTaxable * rawIgstRate) / 100).toFixed(2));
  const totalInvoiceVal = Number((totalTaxable + cgstVal + sgstVal + igstVal).toFixed(2)) || Number(bill.totalAmount || 0);

  const cleanVehicleNo = formatVehicleNumber(bill.vehicleNumber);

  return {
    userGstin: fromGstin,
    supplyType: 'O',
    subSupplyType: '1',
    subSupplyDesc: '',
    docType: 'INV',
    docNo: docNo.slice(0, 16),
    docDate,
    transType: 1,
    fromGstin,
    fromTrdName,
    fromAddr1: sellerAddr.addr1,
    fromAddr2: sellerAddr.addr2,
    fromPlace: sellerAddr.place,
    fromPincode,
    actFromStateCode: fromStateCode,
    fromStateCode,
    toGstin,
    toTrdName,
    toAddr1: toAddr.addr1,
    toAddr2: toAddr.addr2,
    toPlace: toAddr.place,
    toPincode,
    actToStateCode: toStateCode,
    toStateCode,
    transactionType: 1,
    otherValue: 0,
    totalValue: Number(totalTaxable.toFixed(2)),
    cgstValue: cgstVal,
    sgstValue: sgstVal,
    igstValue: igstVal,
    cessValue: 0,
    cessNonAdvolValue: 0,
    totInvValue: totalInvoiceVal,
    transporterId: '',
    transporterName: '',
    transDocNo: '',
    transMode: '1', // 1: Road
    transDistance: '20', // Default within 20km for Delhi
    vehicleNo: cleanVehicleNo,
    vehicleType: 'R',
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
    version: '1.0.0421',
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
