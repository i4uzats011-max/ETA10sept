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
 * Helper to fit text within a max width by slightly reducing font size if needed
 */
function drawFittedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseFontSize: number,
  align: 'left' | 'center' | 'right' = 'left'
) {
  let fontSize = baseFontSize;
  doc.setFontSize(fontSize);
  while (doc.getTextWidth(text) > maxWidth && fontSize > 6) {
    fontSize -= 0.3;
    doc.setFontSize(fontSize);
  }
  doc.text(text, x, y, { align });
  doc.setFontSize(baseFontSize);
}

/**
 * Generate GST Tax Invoice PDF exactly matching the provided NORDEX INTERNATIONAL Tax Invoice template,
 * with enhanced bold typography, larger readable sizes, and zero overlapping.
 */
export function generateBillPDF(bill: BillPdfData, autoDownload: boolean = true): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const xLeft = 10;
  const xRight = 200;
  const wTotal = 190;
  const xMid = 105;
  const yTop = 10;
  const yBottom = 280;

  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // 1. Outer Box
  doc.rect(xLeft, yTop, wTotal, yBottom - yTop);

  // 2. Top Header: "Tax Invoice" centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('Tax Invoice', 105, 15.5, { align: 'center' });

  // Horizontal line below title
  const yHeaderBottom = 18;
  doc.line(xLeft, yHeaderBottom, xRight, yHeaderBottom);

  // Top section bottom (where Main Line Items Table begins)
  const yTableTop = 117;

  // Vertical line separating Left (Parties) and Right (Metadata Grid)
  doc.line(xMid, yHeaderBottom, xMid, yTableTop);

  // ==========================================
  // LEFT COLUMN: SELLER, CONSIGNEE & BUYER
  // ==========================================
  const sName = (bill.sellerName || 'NORDEX INTERNATIONAL').trim();
  const sAddr =
    bill.sellerAddress ||
    'ground floor, house no. 371 plot no. 319\nBadli Road, Badli Sub Post Office, Badli,\nNew Delhi, North West Delhi, Delhi, 110042';
  const sGstin = bill.sellerGstin || '07AAIHH1727F1ZH';
  const sStateCode = getStateCode(bill.sellerStateCode || '07') || '07';
  const sState = getStateName(bill.sellerState || 'Delhi') || 'Delhi';
  const sEmail = bill.sellerEmail || 'NEWNORDEXINTERNATIONAL2025@GMAIL.COM';

  // --- 1. Seller Details (y = 18 to 51) ---
  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, sName.toUpperCase(), 12, 23, 91, 10, 'left');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const sAddrLines = doc.splitTextToSize(sAddr, 91).slice(0, 3);
  let sCurY = 27.2;
  sAddrLines.forEach((line: string) => {
    doc.text(line, 12, sCurY);
    sCurY += 3.6;
  });

  const sMetaY = Math.max(sCurY + 0.8, 38.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.text(`GSTIN/UIN : ${sGstin}`, 12, sMetaY);
  doc.text(`State Name : ${sState}, Code : ${sStateCode}`, 12, sMetaY + 4);
  if (sEmail) {
    drawFittedText(doc, `E-Mail : ${sEmail.toUpperCase()}`, 12, sMetaY + 8, 91, 8, 'left');
  }

  // Line below Seller
  const ySellerBottom = 51;
  doc.line(xLeft, ySellerBottom, xMid, ySellerBottom);

  // --- 2. Consignee (Ship to) (y = 51 to 84) ---
  const cName = (bill.consigneeName || bill.purchaserName || bill.party || '').trim();
  const cAddr = (bill.consigneeAddress || bill.deliveryAddress || bill.purchaserAddress || '').trim();
  const cGstin = (bill.consigneeGstin || bill.purchaserGstin || '').trim();
  const rawCState = bill.consigneeState || bill.purchaserState || bill.sellerState || 'Delhi';
  const cStateCode = getStateCode(bill.consigneeStateCode || bill.purchaserStateCode || rawCState) || '07';
  const cState = getStateName(rawCState) || 'Delhi';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Consignee (Ship to)', 12, 55);

  if (cName) {
    doc.setFont('helvetica', 'bold');
    drawFittedText(doc, cName.toUpperCase(), 12, 59.5, 91, 9.2, 'left');
  }

  let cCurY = 63.8;
  if (cAddr) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const cAddrLines = doc.splitTextToSize(cAddr, 91).slice(0, 3);
    cAddrLines.forEach((line: string) => {
      doc.text(line, 12, cCurY);
      cCurY += 3.6;
    });
  }

  const cMetaY = Math.max(cCurY + 0.8, 75);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.text(`GSTIN/UIN : ${cGstin || 'URP'}`, 12, cMetaY);
  doc.text(`State Name : ${cState}, Code : ${cStateCode}`, 12, cMetaY + 4);

  // Line below Consignee
  const yConsigneeBottom = 84;
  doc.line(xLeft, yConsigneeBottom, xMid, yConsigneeBottom);

  // --- 3. Buyer (Bill to) (y = 84 to 117) ---
  const bName = (bill.buyerName || bill.purchaserName || cName).trim();
  const bAddr = (bill.buyerAddress || bill.purchaserAddress || cAddr).trim();
  const bGstin = (bill.buyerGstin || bill.purchaserGstin || cGstin).trim();
  const rawBState = bill.buyerState || bill.purchaserState || rawCState;
  const bStateCode = getStateCode(bill.buyerStateCode || bill.purchaserStateCode || rawBState) || cStateCode;
  const bState = getStateName(rawBState) || cState;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Buyer (Bill to)', 12, 88);

  if (bName) {
    doc.setFont('helvetica', 'bold');
    drawFittedText(doc, bName.toUpperCase(), 12, 92.5, 91, 9.2, 'left');
  }

  let bCurY = 96.8;
  if (bAddr) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const bAddrLines = doc.splitTextToSize(bAddr, 91).slice(0, 3);
    bAddrLines.forEach((line: string) => {
      doc.text(line, 12, bCurY);
      bCurY += 3.6;
    });
  }

  const bMetaY = Math.max(bCurY + 0.8, 108);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.text(`GSTIN/UIN : ${bGstin || 'URP'}`, 12, bMetaY);
  doc.text(`State Name : ${bState}, Code : ${bStateCode}`, 12, bMetaY + 4);

  // ==========================================
  // RIGHT COLUMN: INVOICE METADATA GRID
  // ==========================================
  const xMidRight = 152.5;

  // Sub-horizontal lines in Right Column (6 rows of 12.5mm + Terms of Delivery)
  const rRow1 = 30.5;
  const rRow2 = 43;
  const rRow3 = 55.5;
  const rRow4 = 68;
  const rRow5 = 80.5;
  const rRow6 = 93;

  doc.line(xMid, rRow1, xRight, rRow1);
  doc.line(xMid, rRow2, xRight, rRow2);
  doc.line(xMid, rRow3, xRight, rRow3);
  doc.line(xMid, rRow4, xRight, rRow4);
  doc.line(xMid, rRow5, xRight, rRow5);
  doc.line(xMid, rRow6, xRight, rRow6);

  // Vertical line dividing left/right cells in grid for Rows 2 to 6
  doc.line(xMidRight, rRow1, xMidRight, rRow6);

  // Vertical lines dividing Invoice No., e-Way Bill No., and Dated in Row 1
  // Cell 1: 105 to 135 (30mm) -> Invoice No.
  // Cell 2: 135 to 171 (36mm) -> e-Way Bill No.
  // Cell 3: 171 to 200 (29mm) -> Dated
  doc.line(135, yHeaderBottom, 135, rRow1);
  doc.line(171, yHeaderBottom, 171, rRow1);

  const invNo = cleanInvoiceNumber(bill.billNumber, bill.receipt);
  const invDate = formatInvoiceDate(bill.createdAt || bill.deliveryDate);

  // Row 1: Invoice No. | e-Way Bill No. | Dated
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.text('Invoice No.', 107, 22.2);
  doc.text('e-Way Bill No.', 137, 22.2);
  doc.text('Dated', 173, 22.2);

  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, invNo, 107, 27.8, 26, 8.5, 'left');
  if (bill.eWayBillNo) {
    drawFittedText(doc, String(bill.eWayBillNo).trim(), 137, 27.8, 32, 8.5, 'left');
  }
  drawFittedText(doc, invDate, 173, 27.8, 25, 8.5, 'left');

  // Row 2: Delivery Note | Mode/Terms of Payment
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.text('Delivery Note', 107, 34.8);
  if (bill.deliveryNote) {
    drawFittedText(doc, bill.deliveryNote, 107, 40.2, 43, 8.2, 'left');
  }

  doc.setFontSize(7.4);
  doc.text('Mode/Terms of Payment', 154.5, 34.8);
  if (bill.modeOfPayment) {
    drawFittedText(doc, bill.modeOfPayment, 154.5, 40.2, 43, 8.2, 'left');
  }

  // Row 3: Reference No. & Date. | Other References
  doc.setFontSize(7.4);
  doc.text('Reference No. & Date.', 107, 47.3);
  if (bill.referenceNo) {
    drawFittedText(doc, bill.referenceNo, 107, 52.7, 43, 8.2, 'left');
  }

  doc.setFontSize(7.4);
  doc.text('Other References', 154.5, 47.3);
  if (bill.otherReferences) {
    drawFittedText(doc, bill.otherReferences, 154.5, 52.7, 43, 8.2, 'left');
  }

  // Row 4: Buyer's Order No. | Dated
  doc.setFontSize(7.4);
  doc.text("Buyer's Order No.", 107, 59.8);
  if (bill.buyerOrderNo) {
    drawFittedText(doc, bill.buyerOrderNo, 107, 65.2, 43, 8.2, 'left');
  }

  doc.setFontSize(7.4);
  doc.text('Dated', 154.5, 59.8);
  if (bill.buyerOrderDate) {
    drawFittedText(doc, bill.buyerOrderDate, 154.5, 65.2, 43, 8.2, 'left');
  }

  // Row 5: Dispatch Doc No. | Delivery Note Date
  doc.setFontSize(7.4);
  doc.text('Dispatch Doc No.', 107, 72.3);
  if (bill.dispatchDocNo) {
    drawFittedText(doc, bill.dispatchDocNo, 107, 77.7, 43, 8.2, 'left');
  }

  doc.setFontSize(7.4);
  doc.text('Delivery Note Date', 154.5, 72.3);
  if (bill.deliveryNoteDate) {
    drawFittedText(doc, bill.deliveryNoteDate, 154.5, 77.7, 43, 8.2, 'left');
  }

  // Row 6: Dispatched through | Destination
  doc.setFontSize(7.4);
  doc.text('Dispatched through', 107, 84.8);
  if (bill.vehicleNumber) {
    drawFittedText(doc, bill.vehicleNumber.toUpperCase(), 107, 90.4, 43, 8.8, 'left');
  }

  doc.setFontSize(7.4);
  doc.text('Destination', 154.5, 84.8);
  const destCity = bill.destination || bill.deliveryAddressTitle || bill.consigneeState || '';
  if (destCity) {
    drawFittedText(doc, destCity.toUpperCase(), 154.5, 90.4, 43, 8.6, 'left');
  }

  // Row 7: Terms of Delivery
  doc.setFontSize(7.4);
  doc.text('Terms of Delivery', 107, 97.5);
  if (bill.termsOfDelivery) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const todLines = doc.splitTextToSize(bill.termsOfDelivery, 90);
    doc.text(todLines.slice(0, 3), 107, 102.5);
  }

  // ==========================================
  // MAIN LINE ITEMS TABLE
  // ==========================================
  const yTableHead = 126;

  // Horizontal line separating top section and table
  doc.line(xLeft, yTableTop, xRight, yTableTop);

  // Horizontal line below Table Header
  doc.line(xLeft, yTableHead, xRight, yTableHead);

  // Column X-coordinates (spacious layout to prevent any overlapping)
  // sl: 10-18 (8mm) | desc: 18-90 (72mm) | hsn: 90-112 (22mm) | qty: 112-139 (27mm) | rate: 139-157 (18mm) | per: 157-170 (13mm) | amt: 170-200 (30mm)
  const colX = {
    sl: 10,
    desc: 18,
    hsn: 90,
    qty: 112,
    rate: 139,
    per: 157,
    amt: 170,
    right: 200,
  };

  // Table Headers (All Bold & Larger)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('Sl', 14, 120.8, { align: 'center' });
  doc.text('No.', 14, 124.4, { align: 'center' });

  doc.text('Description of Goods', 20, 122.6);
  doc.text('HSN/SAC', 101, 122.6, { align: 'center' });
  doc.text('Quantity', 125.5, 122.6, { align: 'center' });
  doc.text('Rate', 148, 122.6, { align: 'center' });
  doc.text('per', 163.5, 122.6, { align: 'center' });
  doc.text('Amount', 185, 122.6, { align: 'center' });

  // -------------------------------------------------------------
  // Line Items Resolution
  // -------------------------------------------------------------
  const unit = (bill.billingUnit || 'PCS').toUpperCase();
  let lineItems: BillLineItem[] = [];

  if (Array.isArray(bill.items) && bill.items.length > 0) {
    lineItems = bill.items;
  } else {
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

  // Render Table Items (All Bold & Larger Size, with automatic multi-line wrapping for long descriptions)
  let curY = 132;
  let totalQty = 0;
  let subtotalTaxable = 0;

  lineItems.forEach((item, idx) => {
    const itemNo = item.itemNo || idx + 1;
    const desc = (item.description || 'GOODS').toUpperCase();
    const hsn = item.hsnCode || '9997';
    const q = Number(item.quantity) || 0;
    const rawU = (item.unit || unit).toUpperCase();
    const uDisplay = rawU === 'CARTONS' ? 'CTN' : rawU;
    const r = Number(item.rate) || 0;
    const amt = Number(item.amount) || Number((q * r).toFixed(2));

    totalQty += q;
    subtotalTaxable += amt;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(String(itemNo), 14, curY, { align: 'center' });

    // Wrap description cleanly within the Description column (69mm max width)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(desc, 69).slice(0, 2);
    descLines.forEach((dLine: string, dIdx: number) => {
      doc.text(dLine, 19.5, curY + dIdx * 4);
    });

    doc.setFont('helvetica', 'bold');
    drawFittedText(doc, hsn, 101, curY, 20, 8.8, 'center');
    drawFittedText(doc, `${formatIndianNumber(q, 0)} ${uDisplay}`, 137.5, curY, 24, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(r, 2), 155.5, curY, 15.5, 8.8, 'right');
    drawFittedText(doc, uDisplay, 163.5, curY, 11, 8.4, 'center');
    drawFittedText(doc, formatIndianNumber(amt, 2), 198.5, curY, 27, 9, 'right');

    curY += Math.max(descLines.length * 4 + 2.5, 6.5);
  });

  // Subtotal Taxable Value in Amount column
  const subtotalFormatted = formatIndianNumber(subtotalTaxable, 2);
  const subtotalY = Math.max(curY + 2.5, 154);

  // Horizontal divider line in Amount column above subtotal
  doc.line(colX.amt, subtotalY - 4.5, xRight, subtotalY - 4.5);

  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, subtotalFormatted, 198.5, subtotalY, 27, 9, 'right');

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

  let afterTaxRowY = subtotalY + 14;
  if (isIntraState) {
    // OUTPUT CGST Row
    const cgstRowY = subtotalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(`OUTPUT CGST ${halfGstPct}%`, 88, cgstRowY, { align: 'right' });
    doc.text(`${halfGstPct} %`, 163.5, cgstRowY, { align: 'center' });
    drawFittedText(doc, formatIndianNumber(cgstAmt, 2), 198.5, cgstRowY, 27, 9, 'right');

    // OUTPUT SGST Row
    const sgstRowY = subtotalY + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(`OUTPUT SGST ${halfGstPct}%`, 88, sgstRowY, { align: 'right' });
    doc.text(`${halfGstPct} %`, 163.5, sgstRowY, { align: 'center' });
    drawFittedText(doc, formatIndianNumber(sgstAmt, 2), 198.5, sgstRowY, 27, 9, 'right');
    afterTaxRowY = sgstRowY + 4.5;
  } else {
    // OUTPUT IGST Row
    const igstRowY = subtotalY + 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(`OUTPUT IGST ${totalGstPct}%`, 88, igstRowY, { align: 'right' });
    doc.text(`${totalGstPct} %`, 163.5, igstRowY, { align: 'center' });
    drawFittedText(doc, formatIndianNumber(igstAmt, 2), 198.5, igstRowY, 27, 9, 'right');
    afterTaxRowY = igstRowY + 5;
  }

  const yTableBottom = Math.max(178, afterTaxRowY);
  const yTableTotal = yTableBottom + 8;

  // Vertical column dividing lines for Main Table
  doc.line(colX.desc, yTableTop, colX.desc, yTableBottom);
  doc.line(colX.hsn, yTableTop, colX.hsn, yTableBottom);
  doc.line(colX.qty, yTableTop, colX.qty, yTableTotal);
  doc.line(colX.rate, yTableTop, colX.rate, yTableBottom);
  doc.line(colX.per, yTableTop, colX.per, yTableBottom);
  doc.line(colX.amt, yTableTop, colX.amt, yTableTotal);

  // Line above Total row
  doc.line(xLeft, yTableBottom, xRight, yTableBottom);

  // Total Row (Bold & Larger)
  const yTotalText = yTableBottom + 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Total', 88, yTotalText, { align: 'right' });

  const rawMainUnit = (lineItems[0]?.unit || unit).toUpperCase();
  const mainUnitDisplay = rawMainUnit === 'CARTONS' ? 'CTN' : rawMainUnit;
  drawFittedText(doc, `${formatIndianNumber(totalQty, 0)} ${mainUnitDisplay}`, 137.5, yTotalText, 24, 9, 'right');
  drawFittedText(doc, formatIndianCurrency(grandTotal), 198.5, yTotalText, 27.5, 9.2, 'right');

  // Line below Total row
  doc.line(xLeft, yTableTotal, xRight, yTableTotal);

  // ==========================================
  // AMOUNT CHARGEABLE IN WORDS SECTION
  // ==========================================
  const wordsY = yTableTotal + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.text('Amount Chargeable (in words)', 12, wordsY);
  doc.text('E. & O.E', 198, wordsY, { align: 'right' });

  const totalWords = convertNumberToIndianWords(grandTotal);
  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, totalWords, 12, wordsY + 5, 186, 9, 'left');

  // Horizontal line below Amount in Words
  const yTaxHead = wordsY + 8;
  doc.line(xLeft, yTaxHead, xRight, yTaxHead);

  // ==========================================
  // TAX BREAKUP SUMMARY TABLE (HSN Aggregation)
  // ==========================================
  // Spacious 11mm tall 2-row header so 'Taxable Value', 'Rate', 'Amount', etc. never overlap!
  const yTaxSubSplit = yTaxHead + 5.5;
  const yTaxRow1 = yTaxHead + 11;

  doc.line(xLeft, yTaxRow1, xRight, yTaxRow1);

  // Group items by HSN/SAC
  const hsnMap = new Map<string, number>();
  lineItems.forEach((it) => {
    const h = (it.hsnCode || bill.hsnCode || '9997').trim();
    const amt = Number(it.amount) || Number((it.quantity * it.rate).toFixed(2)) || 0;
    hsnMap.set(h, (hsnMap.get(h) || 0) + amt);
  });

  const hsnCount = Math.max(hsnMap.size, 1);
  const yTaxTotalTop = yTaxRow1 + hsnCount * 6 + 1;
  const yTaxEnd = yTaxTotalTop + 6.5;

  if (isIntraState) {
    // Columns for Intra-State:
    // HSN(10-40) | Taxable Value(40-78) | Central Tax(78-120: Rate 78-94, Amt 94-120) | State Tax(120-162: Rate 120-136, Amt 136-162) | Total Tax(162-200)
    const tCol = {
      hsn: 10,
      taxVal: 40,
      cgst: 78,
      cgstAmt: 94,
      sgst: 120,
      sgstAmt: 136,
      totalTax: 162,
      right: 200,
    };

    doc.line(tCol.taxVal, yTaxHead, tCol.taxVal, yTaxEnd);
    doc.line(tCol.cgst, yTaxHead, tCol.cgst, yTaxEnd);
    doc.line(tCol.sgst, yTaxHead, tCol.sgst, yTaxEnd);
    doc.line(tCol.totalTax, yTaxHead, tCol.totalTax, yTaxEnd);

    // Sub-header lines for CGST & SGST Rate & Amount
    doc.line(tCol.cgst, yTaxSubSplit, tCol.totalTax, yTaxSubSplit);
    doc.line(tCol.cgstAmt, yTaxSubSplit, tCol.cgstAmt, yTaxEnd);
    doc.line(tCol.sgstAmt, yTaxSubSplit, tCol.sgstAmt, yTaxEnd);

    // Tax Headers (All Bold & Properly Spaced)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('HSN/SAC', 25, yTaxHead + 6.5, { align: 'center' });
    doc.text('Taxable', 59, yTaxHead + 4.2, { align: 'center' });
    doc.text('Value', 59, yTaxHead + 9, { align: 'center' });

    doc.text('Central Tax', 99, yTaxHead + 4, { align: 'center' });
    doc.text('Rate', 86, yTaxHead + 9.2, { align: 'center' });
    doc.text('Amount', 107, yTaxHead + 9.2, { align: 'center' });

    doc.text('State Tax', 141, yTaxHead + 4, { align: 'center' });
    doc.text('Rate', 128, yTaxHead + 9.2, { align: 'center' });
    doc.text('Amount', 149, yTaxHead + 9.2, { align: 'center' });

    doc.text('Total', 181, yTaxHead + 4.2, { align: 'center' });
    doc.text('Tax Amount', 181, yTaxHead + 9, { align: 'center' });

    let curTaxY = yTaxRow1 + 4.5;
    doc.setFont('helvetica', 'bold');
    hsnMap.forEach((taxVal, hsnCode) => {
      const itemCgst = Number((taxVal * (halfGstPct / 100)).toFixed(2));
      const itemSgst = Number((taxVal * (halfGstPct / 100)).toFixed(2));
      const itemTot = Number((itemCgst + itemSgst).toFixed(2));

      drawFittedText(doc, hsnCode, 25, curTaxY, 28, 8.5, 'center');
      drawFittedText(doc, formatIndianNumber(taxVal, 2), 76.5, curTaxY, 35, 8.5, 'right');
      drawFittedText(doc, `${halfGstPct}%`, 86, curTaxY, 14, 8.3, 'center');
      drawFittedText(doc, formatIndianNumber(itemCgst, 2), 118.5, curTaxY, 23, 8.5, 'right');
      drawFittedText(doc, `${halfGstPct}%`, 128, curTaxY, 14, 8.3, 'center');
      drawFittedText(doc, formatIndianNumber(itemSgst, 2), 160.5, curTaxY, 23, 8.5, 'right');
      drawFittedText(doc, formatIndianNumber(itemTot, 2), 198.5, curTaxY, 35, 8.5, 'right');
      curTaxY += 6;
    });

    // Tax Total Row
    doc.line(xLeft, yTaxTotalTop, xRight, yTaxTotalTop);
    const yTaxTotalText = yTaxTotalTop + 4.6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text('Total', 38, yTaxTotalText, { align: 'right' });
    drawFittedText(doc, formatIndianNumber(subtotalTaxable, 2), 76.5, yTaxTotalText, 35, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(cgstAmt, 2), 118.5, yTaxTotalText, 23, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(sgstAmt, 2), 160.5, yTaxTotalText, 23, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(totalTaxAmt, 2), 198.5, yTaxTotalText, 35, 8.8, 'right');
  } else {
    // Columns for Inter-State:
    // HSN(10-55) | Taxable Value(55-102) | Integrated Tax(102-156: Rate 102-122, Amt 122-156) | Total Tax(156-200)
    const tCol = {
      hsn: 10,
      taxVal: 55,
      igstRate: 102,
      igstAmt: 122,
      totalTax: 156,
      right: 200,
    };

    doc.line(tCol.taxVal, yTaxHead, tCol.taxVal, yTaxEnd);
    doc.line(tCol.igstRate, yTaxHead, tCol.igstRate, yTaxEnd);
    doc.line(tCol.totalTax, yTaxHead, tCol.totalTax, yTaxEnd);

    // Sub-header lines for IGST Rate & Amount
    doc.line(tCol.igstRate, yTaxSubSplit, tCol.totalTax, yTaxSubSplit);
    doc.line(tCol.igstAmt, yTaxSubSplit, tCol.igstAmt, yTaxEnd);

    // Tax Headers (All Bold & Properly Spaced)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text('HSN/SAC', 32.5, yTaxHead + 6.5, { align: 'center' });
    doc.text('Taxable', 78.5, yTaxHead + 4.2, { align: 'center' });
    doc.text('Value', 78.5, yTaxHead + 9, { align: 'center' });

    doc.text('Integrated Tax', 129, yTaxHead + 4, { align: 'center' });
    doc.text('Rate', 112, yTaxHead + 9.2, { align: 'center' });
    doc.text('Amount', 139, yTaxHead + 9.2, { align: 'center' });

    doc.text('Total', 178, yTaxHead + 4.2, { align: 'center' });
    doc.text('Tax Amount', 178, yTaxHead + 9, { align: 'center' });

    let curTaxY = yTaxRow1 + 4.5;
    doc.setFont('helvetica', 'bold');
    hsnMap.forEach((taxVal, hsnCode) => {
      const taxAmt = Number((taxVal * (totalGstPct / 100)).toFixed(2));
      drawFittedText(doc, hsnCode, 32.5, curTaxY, 42, 8.6, 'center');
      drawFittedText(doc, formatIndianNumber(taxVal, 2), 100.5, curTaxY, 43, 8.6, 'right');
      drawFittedText(doc, `${totalGstPct}%`, 112, curTaxY, 18, 8.5, 'center');
      drawFittedText(doc, formatIndianNumber(taxAmt, 2), 154.5, curTaxY, 30, 8.6, 'right');
      drawFittedText(doc, formatIndianNumber(taxAmt, 2), 198.5, curTaxY, 40, 8.6, 'right');
      curTaxY += 6;
    });

    // Tax Total Row
    doc.line(xLeft, yTaxTotalTop, xRight, yTaxTotalTop);
    const yTaxTotalText = yTaxTotalTop + 4.6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text('Total', 53, yTaxTotalText, { align: 'right' });
    drawFittedText(doc, formatIndianNumber(subtotalTaxable, 2), 100.5, yTaxTotalText, 43, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(igstAmt, 2), 154.5, yTaxTotalText, 30, 8.8, 'right');
    drawFittedText(doc, formatIndianNumber(igstAmt, 2), 198.5, yTaxTotalText, 40, 8.8, 'right');
  }

  // Line below Tax Total
  doc.line(xLeft, yTaxEnd, xRight, yTaxEnd);

  // ==========================================
  // TAX AMOUNT IN WORDS SECTION
  // ==========================================
  const yTaxWordsText = yTaxEnd + 5;
  const taxWords = convertNumberToIndianWords(totalTaxAmt);
  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, `Tax Amount (in words) : ${taxWords}`, 12, yTaxWordsText, 186, 8.5, 'left');

  // Horizontal line below Tax in Words
  const yDeclTop = yTaxEnd + 8;
  doc.line(xLeft, yDeclTop, xRight, yDeclTop);

  // ==========================================
  // DECLARATION & SIGNATORY SECTION
  // ==========================================
  doc.line(xMid, yDeclTop, xMid, yBottom);

  // Left side: Declaration
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('Declaration', 12, yDeclTop + 5);

  const declText =
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const declLines = doc.splitTextToSize(declText, 90);
  doc.text(declLines, 12, yDeclTop + 9.5);

  // Right side: Signatory
  doc.setFont('helvetica', 'bold');
  drawFittedText(doc, `for ${sName.toUpperCase()}`, 198, yDeclTop + 5.5, 90, 9, 'right');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Authorised Signatory', 198, yBottom - 5, { align: 'right' });

  // ==========================================
  // FOOTER (OUTSIDE BOX)
  // ==========================================
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold');
  doc.text('This is a Computer Generated Invoice', 105, yBottom + 5, { align: 'center' });

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
