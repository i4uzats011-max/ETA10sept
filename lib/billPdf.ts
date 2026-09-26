import jsPDF from 'jspdf';
import { getStateCode, getStateName } from '@/lib/states';

export interface BillLineItem {
  itemNo?: number;
  description: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface BillPdfData {
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
  cgst?: number;
  cgstAmount?: number;
  sgst?: number;
  sgstAmount?: number;
  taxType?: 'INTRA_STATE' | 'INTER_STATE';
  totalAmount?: number;
  rate?: number;

  // Multiple items support
  items?: BillLineItem[];

  // Cargo & Marka
  container?: string;
  containerNumber?: string;
  party?: string;
  mainMarka?: string;
  subMarka?: string;
  commodity?: string;
  warehouse?: string;

  // Seller Details (Billed By)
  sellerName?: string;
  sellerGstin?: string;
  sellerAddress?: string;
  sellerCity?: string;
  sellerPincode?: string;
  sellerState?: string;
  sellerStateCode?: string;
  sellerPhone?: string;
  sellerEmail?: string;

  // Purchaser Details (Billed To)
  purchaserName?: string;
  purchaserRegistrationType?: 'Registered' | 'Unregistered';
  purchaserGstin?: string;
  purchaserAddress?: string;
  purchaserState?: string;
  purchaserStateCode?: string;

  // Consignee (Ship to)
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeState?: string;
  consigneeStateCode?: string;

  // Buyer (Bill to)
  buyerName?: string;
  buyerAddress?: string;
  buyerGstin?: string;
  buyerState?: string;
  buyerStateCode?: string;

  // Dispatch & Vehicle Workflow
  deliveryAddressTitle?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  vehicleNumber?: string;
  isDispatched?: boolean;
  dispatchStatus?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  dispatchedAt?: string | Date;
  createdAt?: string | Date;

  // Extra Invoice Metadata
  eWayBillNo?: string;
  deliveryNote?: string;
  modeOfPayment?: string;
  referenceNo?: string;
  otherReferences?: string;
  buyerOrderNo?: string;
  buyerOrderDate?: string;
  dispatchDocNo?: string;
  deliveryNoteDate?: string;
  destination?: string;
  termsOfDelivery?: string;
}

/**
 * Format numbers according to the Indian Numbering System (e.g. 1,79,682.20)
 */
export function formatIndianNumber(num: number | undefined, decimals: number = 2): string {
  const val = Number(num) || 0;
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format Indian Currency with Rupee symbol (e.g. ₹ 2,12,025.00)
 */
export function formatIndianCurrency(amount: number | undefined): string {
  return 'Rs. ' + formatIndianNumber(amount, 2);
}

/**
 * Convert numbers to Indian English Words for Invoices
 * e.g. 212025 -> "INR Two Lakh Twelve Thousand Twenty Five Only"
 */
export function convertNumberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'INR Zero Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return twoDigits[n - 10];
    const rem = n % 10;
    return tens[Math.floor(n / 10)] + (rem > 0 ? ' ' + singleDigits[rem] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += singleDigits[hundred] + ' Hundred';
    }
    if (rest > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const rounded = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const crore = Math.floor(rupees / 10000000);
  let rem = rupees % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundreds = rem;

  const parts: string[] = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertTwoDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertTwoDigits(thousand) + ' Thousand');
  if (hundreds > 0) parts.push(convertThreeDigits(hundreds));

  let words = parts.filter(Boolean).join(' ');
  if (!words) words = 'Zero';

  let result = 'INR ' + words;
  if (paise > 0) {
    result += ' and ' + convertTwoDigits(paise) + ' paise';
  }
  result += ' Only';
  return result;
}

/**
 * Format date like 1-Aug-26
 */
function formatInvoiceDate(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB');
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

/**
 * Clean invoice number for display (e.g. NI/26-27/54 or BILL-260528007)
 */
function cleanInvoiceNumber(billNumber?: string, receipt?: string): string {
  if (!billNumber) return receipt || 'NI/26-27/01';
  return billNumber;
}

/**
 * Generate GST Tax Invoice PDF exactly matching the provided NORDEX INTERNATIONAL Tax Invoice template.
 */
export function generateBillPDF(bill: BillPdfData, autoDownload: boolean = true): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const xLeft = 10;
  const xRight = 200;
  const wTotal = 190;
  const xMid = 105;
  const yTop = 10;
  const yBottom = 258;

  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.25);

  // 1. Outer Box
  doc.rect(xLeft, yTop, wTotal, yBottom - yTop);

  // 2. Top Header: "Tax Invoice" centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Tax Invoice', 105, 14.5, { align: 'center' });

  // Horizontal line below title
  doc.line(xLeft, 16.5, xRight, 16.5);

  // Vertical line separating Left (Parties) and Right (Metadata Grid)
  doc.line(xMid, 16.5, xMid, 106);

  // ==========================================
  // LEFT COLUMN: SELLER, CONSIGNEE & BUYER
  // ==========================================
  const sName = (bill.sellerName || 'NORDEX INTERNATIONAL').trim();
  const sAddr = bill.sellerAddress || 'ground floor, house no. 371 plot no. 319\nBadli Road, Badli Sub Post Office, Badli,\nNew Delhi, North West Delhi, Delhi, 110042';
  const sGstin = bill.sellerGstin || '07AAIHH1727F1ZH';
  const sStateCode = getStateCode(bill.sellerStateCode || '07') || '07';
  const sState = getStateName(bill.sellerState || 'Delhi') || 'Delhi';
  const sEmail = bill.sellerEmail || 'NEWNORDEXINTERNATIONAL2025@GMAIL.COM';

  // Seller Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.text(sName.toUpperCase(), 12, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const sAddrLines = doc.splitTextToSize(sAddr, 90);
  doc.text(sAddrLines.slice(0, 3), 12, 25);

  doc.text(`GSTIN/UIN: ${sGstin}`, 12, 36.5);
  doc.text(`State Name : ${sState}, Code : ${sStateCode}`, 12, 40);
  if (sEmail) {
    doc.text(`E-Mail : ${sEmail.toUpperCase()}`, 12, 43.5);
  }

  // Line below Seller
  doc.line(xLeft, 46, xMid, 46);

  // Consignee (Ship to)
  const cName = (bill.consigneeName || bill.purchaserName || bill.party || '').trim();
  const cAddr = (bill.consigneeAddress || bill.deliveryAddress || bill.purchaserAddress || '').trim();
  const cGstin = (bill.consigneeGstin || bill.purchaserGstin || '').trim();
  const rawCState = bill.consigneeState || bill.purchaserState || bill.sellerState || 'Delhi';
  const cStateCode = getStateCode(bill.consigneeStateCode || bill.purchaserStateCode || rawCState) || '07';
  const cState = getStateName(rawCState) || 'Delhi';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Consignee (Ship to)', 12, 50);

  if (cName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text(cName.substring(0, 48), 12, 54.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  if (cAddr) {
    const cAddrLines = doc.splitTextToSize(cAddr, 90);
    doc.text(cAddrLines.slice(0, 3), 12, 58.5);
  }

  doc.text(`GSTIN/UIN : ${cGstin || 'URP'}`, 12, 69);
  doc.text(`State Name : ${cState}, Code : ${cStateCode}`, 12, 72.5);

  // Line below Consignee
  doc.line(xLeft, 76, xMid, 76);

  // Buyer (Bill to)
  const bName = (bill.buyerName || bill.purchaserName || cName).trim();
  const bAddr = (bill.buyerAddress || bill.purchaserAddress || cAddr).trim();
  const bGstin = (bill.buyerGstin || bill.purchaserGstin || cGstin).trim();
  const rawBState = bill.buyerState || bill.purchaserState || rawCState;
  const bStateCode = getStateCode(bill.buyerStateCode || bill.purchaserStateCode || rawBState) || cStateCode;
  const bState = getStateName(rawBState) || cState;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Buyer (Bill to)', 12, 80);

  if (bName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text(bName.substring(0, 48), 12, 84.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  if (bAddr) {
    const bAddrLines = doc.splitTextToSize(bAddr, 90);
    doc.text(bAddrLines.slice(0, 3), 12, 88.5);
  }

  doc.text(`GSTIN/UIN : ${bGstin || 'URP'}`, 12, 99);
  doc.text(`State Name : ${bState}, Code : ${bStateCode}`, 12, 102.5);

  // ==========================================
  // RIGHT COLUMN: INVOICE METADATA GRID
  // ==========================================
  const xMidRight = 152.5;

  // Sub-horizontal lines in Right Column
  doc.line(xMid, 27.5, xRight, 27.5);
  doc.line(xMid, 38.5, xRight, 38.5);
  doc.line(xMid, 49.5, xRight, 49.5);
  doc.line(xMid, 60.5, xRight, 60.5);
  doc.line(xMid, 71.5, xRight, 71.5);
  doc.line(xMid, 82.5, xRight, 82.5);

  // Vertical line dividing left/right cells in grid for Rows 2 to 6
  doc.line(xMidRight, 27.5, xMidRight, 82.5);

  // Vertical lines dividing Invoice No., e-Way Bill No., and Dated in Row 1
  // Cell 1: 105 to 129 (24mm) -> Invoice No.
  // Cell 2: 129 to 166 (37mm) -> e-Way Bill No. (spacious, never overlaps)
  // Cell 3: 166 to 200 (34mm) -> Dated
  doc.line(129, 16.5, 129, 27.5);
  doc.line(166, 16.5, 166, 27.5);

  const invNo = cleanInvoiceNumber(bill.billNumber, bill.receipt);
  const invDate = formatInvoiceDate(bill.createdAt || bill.deliveryDate);

  // Row 1: Invoice No. | e-Way Bill No. | Dated
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice No.', 107, 20.2);
  doc.text('e-Way Bill No.', 131, 20.2);
  doc.text('Dated', 168, 20.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(invNo, 107, 24.8);
  if (bill.eWayBillNo) {
    doc.text(String(bill.eWayBillNo).trim(), 131, 24.8);
  }
  doc.text(invDate, 168, 24.8);

  // Row 2: Delivery Note | Mode/Terms of Payment
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.text('Delivery Note', 107, 31);
  if (bill.deliveryNote) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.deliveryNote, 107, 35.5);
    doc.setFont('helvetica', 'normal');
  }

  doc.text('Mode/Terms of Payment', 154.5, 31);
  if (bill.modeOfPayment) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.modeOfPayment, 154.5, 35.5);
    doc.setFont('helvetica', 'normal');
  }

  // Row 3: Reference No. & Date. | Other References
  doc.text('Reference No. & Date.', 107, 42);
  if (bill.referenceNo) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.referenceNo, 107, 46.5);
    doc.setFont('helvetica', 'normal');
  }

  doc.text('Other References', 154.5, 42);
  if (bill.otherReferences) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.otherReferences, 154.5, 46.5);
    doc.setFont('helvetica', 'normal');
  }

  // Row 4: Buyer's Order No. | Dated
  doc.text("Buyer's Order No.", 107, 53);
  if (bill.buyerOrderNo) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.buyerOrderNo, 107, 57.5);
    doc.setFont('helvetica', 'normal');
  }

  doc.text('Dated', 154.5, 53);
  if (bill.buyerOrderDate) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.buyerOrderDate, 154.5, 57.5);
    doc.setFont('helvetica', 'normal');
  }

  // Row 5: Dispatch Doc No. | Delivery Note Date
  doc.text('Dispatch Doc No.', 107, 64);
  if (bill.dispatchDocNo) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.dispatchDocNo, 107, 68.5);
    doc.setFont('helvetica', 'normal');
  }

  doc.text('Delivery Note Date', 154.5, 64);
  if (bill.deliveryNoteDate) {
    doc.setFont('helvetica', 'bold');
    doc.text(bill.deliveryNoteDate, 154.5, 68.5);
    doc.setFont('helvetica', 'normal');
  }

  // Row 6: Dispatched through | Destination
  doc.text('Dispatched through', 107, 75);
  if (bill.vehicleNumber) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text(bill.vehicleNumber, 107, 79.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
  }

  doc.text('Destination', 154.5, 75);
  const destCity = bill.destination || bill.deliveryAddressTitle || bill.consigneeState || '';
  if (destCity) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text(destCity.substring(0, 24), 154.5, 79.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
  }

  // Row 7: Terms of Delivery
  doc.text('Terms of Delivery', 107, 86);
  if (bill.termsOfDelivery) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    const todLines = doc.splitTextToSize(bill.termsOfDelivery, 90);
    doc.text(todLines.slice(0, 3), 107, 90.5);
  }

  // ==========================================
  // MAIN LINE ITEMS TABLE
  // ==========================================
  const yTableTop = 106;
  const yTableHead = 113.5;
  const yTableBottom = 165;
  const yTableTotal = 172;

  // Horizontal line separating top section and table
  doc.line(xLeft, yTableTop, xRight, yTableTop);

  // Horizontal line below Table Header
  doc.line(xLeft, yTableHead, xRight, yTableHead);

  // Column X-coordinates
  const colX = {
    sl: 10,
    desc: 18,
    hsn: 96,
    qty: 118,
    rate: 144,
    per: 162,
    amt: 174,
    right: 200,
  };

  // Vertical column dividing lines for Table
  doc.line(colX.desc, yTableTop, colX.desc, yTableBottom);
  doc.line(colX.hsn, yTableTop, colX.hsn, yTableBottom);
  doc.line(colX.qty, yTableTop, colX.qty, yTableTotal);
  doc.line(colX.rate, yTableTop, colX.rate, yTableBottom);
  doc.line(colX.per, yTableTop, colX.per, yTableBottom);
  doc.line(colX.amt, yTableTop, colX.amt, yTableTotal);

  // Table Headers
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Sl', 14, 109.5, { align: 'center' });
  doc.text('No.', 14, 112.5, { align: 'center' });

  doc.text('Description of Goods', 20, 110.5);
  doc.text('HSN/SAC', 107, 110.5, { align: 'center' });
  doc.text('Quantity', 131, 110.5, { align: 'center' });
  doc.text('Rate', 153, 110.5, { align: 'center' });
  doc.text('per', 168, 110.5, { align: 'center' });
  doc.text('Amount', 187, 110.5, { align: 'center' });

  // -------------------------------------------------------------
  // Line Items Resolution
  // -------------------------------------------------------------
  const unit = (bill.billingUnit || 'PCS').toUpperCase();
  let lineItems: BillLineItem[] = [];

  if (Array.isArray(bill.items) && bill.items.length > 0) {
    lineItems = bill.items;
  } else {
    // Single item fallback
    let qtyVal = 0;
    if (unit === 'KG') {
      qtyVal = Number(bill.quantityKg) || 0;
    } else if (unit === 'CARTONS') {
      qtyVal = Number(bill.dispatchedCartons || bill.totalCartons) || 0;
    } else {
      qtyVal = Number(bill.quantityPcs) || Number(bill.quantityKg) || 0;
    }

    const taxableVal = Number(bill.taxableValue) || 0;
    const rateVal = Number(bill.rate) || (qtyVal > 0 ? taxableVal / qtyVal : 0);

    lineItems = [
      {
        itemNo: 1,
        description: (bill.commodity || 'COMMERCIAL GOODS').toUpperCase(),
        hsnCode: bill.hsnCode || '9997',
        quantity: qtyVal,
        unit: unit,
        rate: rateVal,
        amount: taxableVal,
      },
    ];
  }

  // Render Table Items
  let curY = 118;
  let totalQty = 0;
  let subtotalTaxable = 0;

  lineItems.forEach((item, idx) => {
    const itemNo = item.itemNo || idx + 1;
    const desc = (item.description || 'GOODS').toUpperCase();
    const hsn = item.hsnCode || '9997';
    const q = Number(item.quantity) || 0;
    const u = (item.unit || unit).toUpperCase();
    const r = Number(item.rate) || 0;
    const amt = Number(item.amount) || Number((q * r).toFixed(2));

    totalQty += q;
    subtotalTaxable += amt;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(itemNo), 14, curY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.text(desc.substring(0, 44), 20, curY);

    doc.setFont('helvetica', 'normal');
    doc.text(hsn, 107, curY, { align: 'center' });
    doc.text(`${formatIndianNumber(q, 0)} ${u}`, 142, curY, { align: 'right' });
    doc.text(formatIndianNumber(r, 2), 160, curY, { align: 'right' });
    doc.text(u, 168, curY, { align: 'center' });
    doc.text(formatIndianNumber(amt, 2), 198, curY, { align: 'right' });

    curY += 5.5;
  });

  // Subtotal Taxable Value in Amount column
  const subtotalFormatted = formatIndianNumber(subtotalTaxable, 2);
  const subtotalY = Math.max(curY + 2, 142);
  // Horizontal divider line in Amount column above subtotal
  doc.line(colX.amt, subtotalY - 4, xRight, subtotalY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(subtotalFormatted, 198, subtotalY, { align: 'right' });

  // Location-Wise Tax Determination (Delhi to Delhi -> CGST + SGST; Outside Delhi -> IGST)
  const isIntraState =
    cStateCode === '07' ||
    bStateCode === '07' ||
    cState.toLowerCase().includes('delhi') ||
    bState.toLowerCase().includes('delhi');

  const totalGstPct = Number(bill.igst) || 18;
  const halfGstPct = Number((totalGstPct / 2).toFixed(2));

  let cgstAmt = 0;
  let sgstAmt = 0;
  let igstAmt = 0;
  let totalTaxAmt = 0;

  if (isIntraState) {
    cgstAmt = Number((subtotalTaxable * (halfGstPct / 100)).toFixed(2));
    sgstAmt = Number((subtotalTaxable * (halfGstPct / 100)).toFixed(2));
    totalTaxAmt = Number((cgstAmt + sgstAmt).toFixed(2));
  } else {
    igstAmt = Number((subtotalTaxable * (totalGstPct / 100)).toFixed(2));
    totalTaxAmt = igstAmt;
  }
  const grandTotal = Number((subtotalTaxable + totalTaxAmt).toFixed(2));

  if (isIntraState) {
    // OUTPUT CGST Row
    const cgstRowY = subtotalY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text(`OUTPUT CGST ${halfGstPct}%`, 94, cgstRowY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${halfGstPct} %`, 168, cgstRowY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatIndianNumber(cgstAmt, 2), 198, cgstRowY, { align: 'right' });

    // OUTPUT SGST Row
    const sgstRowY = subtotalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text(`OUTPUT SGST ${halfGstPct}%`, 94, sgstRowY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${halfGstPct} %`, 168, sgstRowY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatIndianNumber(sgstAmt, 2), 198, sgstRowY, { align: 'right' });
  } else {
    // OUTPUT IGST Row
    const igstRowY = subtotalY + 5.5;
    doc.setFont('helvetica', 'bold');
    doc.text(`OUTPUT IGST ${totalGstPct}%`, 94, igstRowY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalGstPct} %`, 168, igstRowY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatIndianNumber(igstAmt, 2), 198, igstRowY, { align: 'right' });
  }

  // Line above Total row
  doc.line(xLeft, yTableBottom, xRight, yTableBottom);

  // Total Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Total', 94, 169.5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  const mainUnit = lineItems[0]?.unit || unit;
  doc.text(`${formatIndianNumber(totalQty, 0)} ${mainUnit}`, 142, 169.5, { align: 'right' });
  doc.text(formatIndianCurrency(grandTotal), 198, 169.5, { align: 'right' });

  // Line below Total row
  doc.line(xLeft, yTableTotal, xRight, yTableTotal);

  // ==========================================
  // AMOUNT CHARGEABLE IN WORDS SECTION
  // ==========================================
  const wordsY = 176;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Amount Chargeable (in words)', 12, wordsY);
  doc.text('E. & O.E', 198, wordsY, { align: 'right' });

  const totalWords = convertNumberToIndianWords(grandTotal);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(totalWords, 12, wordsY + 4.2);

  // Horizontal line below Amount in Words
  doc.line(xLeft, 182.5, xRight, 182.5);

  // ==========================================
  // TAX BREAKUP SUMMARY TABLE (HSN Aggregation)
  // ==========================================
  const yTaxHead = 182.5;
  const yTaxRow1 = 188;
  const yTaxEnd = 202;

  doc.line(xLeft, yTaxRow1, xRight, yTaxRow1);

  // Group items by HSN/SAC
  const hsnMap = new Map<string, number>();
  lineItems.forEach((it) => {
    const h = (it.hsnCode || bill.hsnCode || '9997').trim();
    const amt = Number(it.amount) || Number((it.quantity * it.rate).toFixed(2)) || 0;
    hsnMap.set(h, (hsnMap.get(h) || 0) + amt);
  });

  if (isIntraState) {
    // Columns for Intra-State: HSN(10-45) | Taxable(45-80) | Central Tax(80-120) | State Tax(120-160) | Total Tax(160-200)
    const tCol = {
      hsn: 10,
      taxVal: 45,
      cgst: 80,
      cgstAmt: 98,
      sgst: 120,
      sgstAmt: 138,
      totalTax: 160,
      right: 200,
    };

    doc.line(tCol.taxVal, yTaxHead, tCol.taxVal, yTaxEnd);
    doc.line(tCol.cgst, yTaxHead, tCol.cgst, yTaxEnd);
    doc.line(tCol.sgst, yTaxHead, tCol.sgst, yTaxEnd);
    doc.line(tCol.totalTax, yTaxHead, tCol.totalTax, yTaxEnd);

    // Sub-header lines for CGST & SGST Rate & Amount
    doc.line(tCol.cgst, 185.5, tCol.totalTax, 185.5);
    doc.line(tCol.cgstAmt, 185.5, tCol.cgstAmt, 197);
    doc.line(tCol.sgstAmt, 185.5, tCol.sgstAmt, 197);

    // Tax Headers
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text('HSN/SAC', 27.5, 185.5, { align: 'center' });
    doc.text('Taxable', 62.5, 184.5, { align: 'center' });
    doc.text('Value', 62.5, 187, { align: 'center' });

    doc.text('Central Tax', 100, 184.5, { align: 'center' });
    doc.text('Rate', 89, 187, { align: 'center' });
    doc.text('Amount', 109, 187, { align: 'center' });

    doc.text('State Tax', 140, 184.5, { align: 'center' });
    doc.text('Rate', 129, 187, { align: 'center' });
    doc.text('Amount', 149, 187, { align: 'center' });

    doc.text('Total', 180, 184.5, { align: 'center' });
    doc.text('Tax Amount', 180, 187, { align: 'center' });

    let curTaxY = 191.5;
    hsnMap.forEach((taxVal, hsnCode) => {
      const itemCgst = Number((taxVal * (halfGstPct / 100)).toFixed(2));
      const itemSgst = Number((taxVal * (halfGstPct / 100)).toFixed(2));
      const itemTot = Number((itemCgst + itemSgst).toFixed(2));

      doc.text(hsnCode, 27.5, curTaxY, { align: 'center' });
      doc.text(formatIndianNumber(taxVal, 2), 78, curTaxY, { align: 'right' });
      doc.text(`${halfGstPct}%`, 89, curTaxY, { align: 'center' });
      doc.text(formatIndianNumber(itemCgst, 2), 118, curTaxY, { align: 'right' });
      doc.text(`${halfGstPct}%`, 129, curTaxY, { align: 'center' });
      doc.text(formatIndianNumber(itemSgst, 2), 158, curTaxY, { align: 'right' });
      doc.text(formatIndianNumber(itemTot, 2), 198, curTaxY, { align: 'right' });
      curTaxY += 4.5;
    });

    // Tax Total Row
    doc.line(xLeft, 197, xRight, 197);
    doc.setFont('helvetica', 'bold');
    doc.text('Total', 40, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(subtotalTaxable, 2), 78, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(cgstAmt, 2), 118, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(sgstAmt, 2), 158, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(totalTaxAmt, 2), 198, 200.5, { align: 'right' });
  } else {
    // Columns for Inter-State: HSN(10-65) | Taxable(65-110) | IGST(110-165) | Total Tax(165-200)
    const tCol = {
      hsn: 10,
      taxVal: 65,
      igstRate: 110,
      igstAmt: 135,
      totalTax: 165,
      right: 200,
    };

    doc.line(tCol.taxVal, yTaxHead, tCol.taxVal, yTaxEnd);
    doc.line(tCol.igstRate, yTaxHead, tCol.igstRate, yTaxEnd);
    doc.line(tCol.totalTax, yTaxHead, tCol.totalTax, yTaxEnd);

    // Sub-header lines for IGST Rate & Amount
    doc.line(tCol.igstRate, 185.5, tCol.totalTax, 185.5);
    doc.line(tCol.igstAmt, 185.5, tCol.igstAmt, 197);

    // Tax Headers
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('HSN/SAC', 37.5, 185.5, { align: 'center' });
    doc.text('Taxable', 87.5, 184.5, { align: 'center' });
    doc.text('Value', 87.5, 187, { align: 'center' });

    doc.text('Integrated Tax', 137.5, 184.5, { align: 'center' });
    doc.text('Rate', 122.5, 187, { align: 'center' });
    doc.text('Amount', 150, 187, { align: 'center' });

    doc.text('Total', 182.5, 184.5, { align: 'center' });
    doc.text('Tax Amount', 182.5, 187, { align: 'center' });

    let curTaxY = 191.5;
    hsnMap.forEach((taxVal, hsnCode) => {
      const taxAmt = Number((taxVal * (totalGstPct / 100)).toFixed(2));
      doc.text(hsnCode, 37.5, curTaxY, { align: 'center' });
      doc.text(formatIndianNumber(taxVal, 2), 108, curTaxY, { align: 'right' });
      doc.text(`${totalGstPct}%`, 122.5, curTaxY, { align: 'center' });
      doc.text(formatIndianNumber(taxAmt, 2), 163, curTaxY, { align: 'right' });
      doc.text(formatIndianNumber(taxAmt, 2), 198, curTaxY, { align: 'right' });
      curTaxY += 4.5;
    });

    // Tax Total Row
    doc.line(xLeft, 197, xRight, 197);
    doc.setFont('helvetica', 'bold');
    doc.text('Total', 60, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(subtotalTaxable, 2), 108, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(igstAmt, 2), 163, 200.5, { align: 'right' });
    doc.text(formatIndianNumber(igstAmt, 2), 198, 200.5, { align: 'right' });
  }

  // Line below Tax Total
  doc.line(xLeft, yTaxEnd, xRight, yTaxEnd);

  // ==========================================
  // TAX AMOUNT IN WORDS SECTION
  // ==========================================
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const taxWords = convertNumberToIndianWords(totalTaxAmt);
  doc.text(`Tax Amount (in words) : ${taxWords}`, 12, 206.5);

  // Horizontal line below Tax in Words
  doc.line(xLeft, 209, xRight, 209);

  // ==========================================
  // DECLARATION & SIGNATORY SECTION
  // ==========================================
  doc.line(xMid, 209, xMid, yBottom);

  // Left side: Declaration
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Declaration', 12, 213.5);

  const declText =
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
  doc.setFontSize(6.8);
  const declLines = doc.splitTextToSize(declText, 90);
  doc.text(declLines, 12, 217);

  // Right side: Signatory
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`for ${sName}`, 198, 213.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Authorised Signatory', 198, 246, { align: 'right' });

  // ==========================================
  // FOOTER (OUTSIDE BOX)
  // ==========================================
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('This is a Computer Generated Invoice', 105, 264, { align: 'center' });

  if (autoDownload) {
    const filename = `Invoice_${invNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    doc.save(filename);
  }

  return doc;
}

/**
 * Consolidated / Multi-bill PDF for a Marka
 */
export function generateConsolidatedMarkaPDF(
  marka: string,
  bills: BillPdfData[],
  vehicleNumber?: string,
  deliveryAddress?: string
): jsPDF {
  const primaryBill = bills[0] || ({} as BillPdfData);

  // Combine line items from all bills
  const consolidatedItems: BillLineItem[] = [];
  let itemCounter = 1;

  bills.forEach((b) => {
    if (Array.isArray(b.items) && b.items.length > 0) {
      b.items.forEach((it) => {
        consolidatedItems.push({
          ...it,
          itemNo: itemCounter++,
        });
      });
    } else {
      const q =
        b.billingUnit === 'KG'
          ? Number(b.quantityKg) || 0
          : b.billingUnit === 'Cartons'
          ? Number(b.totalCartons) || 0
          : Number(b.quantityPcs) || Number(b.quantityKg) || 0;
      const tax = Number(b.taxableValue) || 0;
      const rate = q > 0 ? tax / q : 0;

      consolidatedItems.push({
        itemNo: itemCounter++,
        description: String(b.commodity || 'COMMERCIAL GOODS').toUpperCase(),
        hsnCode: String(b.hsnCode || '9997'),
        quantity: q,
        unit: (b.billingUnit || 'PCS').toUpperCase(),
        rate: rate,
        amount: tax,
      });
    }
  });

  const consolidatedBill: BillPdfData = {
    ...primaryBill,
    billNumber: `CONS-${marka}`,
    vehicleNumber: vehicleNumber || primaryBill.vehicleNumber || '',
    consigneeAddress: deliveryAddress || primaryBill.consigneeAddress || primaryBill.deliveryAddress,
    items: consolidatedItems,
  };

  return generateBillPDF(consolidatedBill, true);
}
