import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  totalAmount?: number;
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
  sellerState?: string;
  sellerStateCode?: string;

  // Purchaser Details (Billed To)
  purchaserName?: string;
  purchaserRegistrationType?: 'Registered' | 'Unregistered';
  purchaserGstin?: string;
  purchaserAddress?: string;

  // Dispatch Delivery Address (Ship To)
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
}

function formatCurrency(amount: number | undefined): string {
  const val = Number(amount) || 0;
  return 'Rs. ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateBillPDF(bill: BillPdfData, autoDownload: boolean = true): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;

  const isDispatched = Boolean(bill.isDispatched || bill.vehicleNumber);
  const vehicle = bill.vehicleNumber?.trim() || '';

  // 1. Navy Blue Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 30, 'F');

  // Brand Name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const sellerTitle = bill.sellerName || 'US INTERNATIONAL LOGISTICS';
  doc.text(sellerTitle.toUpperCase(), 14, 11);

  // Subtitle
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('China to India Freight & Cargo Forwarding | Custom Clearance & Inland Transit', 14, 17);
  const sellerAddressHeader = bill.sellerAddress ? `${bill.sellerAddress} | GSTIN: ${bill.sellerGstin || 'URP'}` : 'Phone: +91 9355456060 | Email: info@usinternationallogistics.com';
  doc.text(sellerAddressHeader.substring(0, 100), 14, 23);

  // Status Badge in Header
  if (isDispatched) {
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.roundedRect(pageWidth - 62, 7, 48, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DISPATCHED / DELIVERED', pageWidth - 60, 13);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    const dispTime = bill.deliveryTime ? ` @ ${bill.deliveryTime}` : '';
    doc.text(`${bill.deliveryDate || 'Dispatched'}${dispTime}`, pageWidth - 60, 18);
  } else {
    doc.setFillColor(245, 158, 11); // amber-500
    doc.roundedRect(pageWidth - 62, 7, 48, 14, 2, 2, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('AWAITING DISPATCH', pageWidth - 58, 13);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('No Vehicle Assigned', pageWidth - 58, 18);
  }

  // Accent Line
  doc.setFillColor(isDispatched ? 16 : 220, isDispatched ? 185 : 38, isDispatched ? 129 : 38);
  doc.rect(0, 30, pageWidth, 1.5, 'F');

  // Document Title & Bar
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const title = isDispatched
    ? 'TAX INVOICE & DISPATCH DELIVERY CHALLAN'
    : 'TAX INVOICE / CARGO BILL (PRE-DISPATCH)';
  doc.text(title, 14, 38);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const genDate = bill.createdAt ? new Date(bill.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  doc.text(`Invoice No: ${bill.billNumber}   |   Date: ${genDate}   |   Receipt: ${bill.receipt}   |   Container: ${bill.container || 'N/A'}`, 14, 43);

  // 3 Boxes Layout: Seller (Billed By), Purchaser (Billed To), Delivery (Ship To)
  const boxY = 46;
  const boxHeight = 44;
  const colWidth = 59;

  // Box 1: SELLER (Billed By)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, boxY, colWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(2, 132, 199); // sky-600
  doc.text('SELLER / BILLED BY:', 17, boxY + 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text((bill.sellerName || 'US INTERNATIONAL LOGISTICS').substring(0, 30), 17, boxY + 12);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const sAddress = bill.sellerAddress || 'Mayapuri Industrial Area, New Delhi';
  doc.text(doc.splitTextToSize(sAddress, colWidth - 6), 17, boxY + 17);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`GSTIN: ${bill.sellerGstin || '07AAACU1234F1Z9'}`, 17, boxY + 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`State: ${bill.sellerState || 'Delhi'} (${bill.sellerStateCode || '07'})`, 17, boxY + 38);

  // Box 2: PURCHASER (Billed To)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14 + colWidth + 2.5, boxY, colWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(124, 58, 237); // violet-600
  doc.text('PURCHASER / BILLED TO:', 14 + colWidth + 5.5, boxY + 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const pName = bill.purchaserName || bill.party || 'General Party';
  doc.text(pName.substring(0, 30), 14 + colWidth + 5.5, boxY + 12);

  // Registration Badge
  const isReg = bill.purchaserRegistrationType !== 'Unregistered' && Boolean(bill.purchaserGstin);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  if (isReg) {
    doc.setTextColor(5, 150, 105);
    doc.text(`REGISTERED PARTY`, 14 + colWidth + 5.5, boxY + 17);
    doc.setTextColor(15, 23, 42);
    doc.text(`GSTIN: ${bill.purchaserGstin}`, 14 + colWidth + 5.5, boxY + 22);
  } else {
    doc.setTextColor(217, 119, 6);
    doc.text(`UNREGISTERED PARTY (URP)`, 14 + colWidth + 5.5, boxY + 17);
  }

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const pAddress = bill.purchaserAddress || 'Address on file';
  doc.text(doc.splitTextToSize(pAddress, colWidth - 6), 14 + colWidth + 5.5, boxY + 27);

  // Box 3: MARKA & DELIVERY DESTINATION (Ship To)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14 + (colWidth + 2.5) * 2, boxY, colWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text('MARKA & DESTINATION (SHIP TO):', 14 + (colWidth + 2.5) * 2 + 3, boxY + 6);

  // Marka highlight pill
  const markaText = bill.mainMarka || bill.subMarka || 'UNMARKED';
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(14 + (colWidth + 2.5) * 2 + 3, boxY + 9, colWidth - 6, 7, 1, 1, 'FD');
  doc.setTextColor(4, 120, 87);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`MARKA: ${markaText}`, 14 + (colWidth + 2.5) * 2 + 5, boxY + 14);

  // Selected delivery address
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const dTitle = bill.deliveryAddressTitle ? `[${bill.deliveryAddressTitle}] ` : '';
  const dAddr = bill.deliveryAddress ? `${dTitle}${bill.deliveryAddress}` : 'Destination set by Dispatcher';
  doc.text(doc.splitTextToSize(dAddr, colWidth - 6), 14 + (colWidth + 2.5) * 2 + 3, boxY + 20);

  // Vehicle Number highlight box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  if (vehicle) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(14 + (colWidth + 2.5) * 2 + 3, boxY + 32, colWidth - 6, 8, 1, 1, 'FD');
    doc.setTextColor(4, 120, 87);
    doc.text(`VEHICLE: ${vehicle}`, 14 + (colWidth + 2.5) * 2 + 5, boxY + 37.5);
  } else {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(14 + (colWidth + 2.5) * 2 + 3, boxY + 32, colWidth - 6, 8, 1, 1, 'FD');
    doc.setTextColor(180, 83, 9);
    doc.text('VEHICLE: PENDING (बाकी)', 14 + (colWidth + 2.5) * 2 + 5, boxY + 37.5);
  }

  // 4. Line Items Table (as requested in screenshot + KG column)
  const headers = [
    'Sr.',
    'Receipt No.',
    'Description / Commodity',
    'HSN Code',
    'IGST %',
    'Qty (Pcs)',
    'Qty (KG)',
    'Taxable (Rs.)',
    'IGST Amt (Rs.)',
    'Total (Rs.)',
  ];

  const igstPct = Number(bill.igst) || 18;
  const taxable = Number(bill.taxableValue) || 0;
  const igstAmt = Number(bill.igstAmount) || taxable * (igstPct / 100);
  const total = Number(bill.totalAmount) || taxable + igstAmt;

  const rows = [
    [
      '1',
      String(bill.receipt || '-'),
      String(bill.commodity || 'Commercial Cargo').substring(0, 25),
      String(bill.hsnCode || 'N/A'),
      `${igstPct}%`,
      Number(bill.quantityPcs || 0).toLocaleString('en-IN'),
      Number(bill.quantityKg || 0).toLocaleString('en-IN'),
      taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      igstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      total.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ],
  ];

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: boxY + boxHeight + 4,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'left', cellWidth: 32 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 22 },
      8: { halign: 'right', cellWidth: 16 },
      9: { halign: 'right', cellWidth: 16 },
    },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 135;

  // 5. Total Calculation Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(pageWidth - 92, finalY + 4, 78, 38, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Taxable Subtotal:', pageWidth - 88, finalY + 11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(taxable), pageWidth - 18, finalY + 11, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`IGST (${igstPct}%):`, pageWidth - 88, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(igstAmt), pageWidth - 18, finalY + 18, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 88, finalY + 22, pageWidth - 18, finalY + 22);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', pageWidth - 88, finalY + 29);
  doc.setTextColor(185, 28, 28);
  doc.text(formatCurrency(total), pageWidth - 18, finalY + 29, { align: 'right' });

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  const cartonSummary = bill.dispatchedCartons
    ? `${bill.dispatchedCartons}${bill.totalCartons ? `/${bill.totalCartons}` : ''} CTN`
    : bill.totalCartons
    ? `${bill.totalCartons} CTN`
    : '';
  const unitsSummary = [
    `${bill.quantityPcs || 0} Pcs`,
    `${bill.quantityKg || 0} KG`,
    cartonSummary,
  ].filter(Boolean).join(' | ');
  doc.text(`Total Units: ${unitsSummary}`, pageWidth - 88, finalY + 36);

  // 6. Left Note / Instructions Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, finalY + 4, 98, 38, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Dispatch & Delivery Notice:', 18, finalY + 11);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`1. Billing Unit: ${bill.billingUnit || 'Pcs'} | Delivery transit under customs terms.`, 18, finalY + 17);
  if (vehicle) {
    const ctnDisp = bill.dispatchedCartons ? ` | Cartons Dispatched: ${bill.dispatchedCartons} CTN` : '';
    doc.text(`2. Transport Vehicle: ${vehicle}${ctnDisp}`, 18, finalY + 23);
    doc.text('3. This bill confirms authorized delivery dispatch ("दिस माल इस डिस्पैच्ड").', 18, finalY + 29);
  } else {
    doc.text('2. Vehicle pending. Bill generated for customs & client verification.', 18, finalY + 23);
    doc.text('3. Dispatch authorization pending vehicle allotment.', 18, finalY + 29);
  }
  doc.text('4. Inquiries: +91 9355456060 | info@usinternationallogistics.com', 18, finalY + 35);

  // 7. Signatures Section
  const sigY = finalY + 48;
  doc.setDrawColor(203, 213, 225);

  doc.line(18, sigY + 16, 68, sigY + 16);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Biller Signatory', 18, sigY + 20);

  doc.line(78, sigY + 16, 128, sigY + 16);
  doc.text(`Dispatcher (${vehicle || 'Vehicle'})`, 78, sigY + 20);
  if (vehicle && isDispatched) {
    doc.setTextColor(16, 185, 129);
    doc.setFont('helvetica', 'bold');
    doc.text('DISPATCH VERIFIED ✓', 78, sigY + 14);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
  }

  doc.line(138, sigY + 16, 188, sigY + 16);
  doc.text("Receiver's Signature & Stamp", 138, sigY + 20);

  // Footer
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Computer-generated tax invoice & logistics slip issued by US International Logistics.', 14, 285);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - 14, 285, { align: 'right' });

  if (autoDownload) {
    const filename = `${bill.billNumber || 'Bill'}_${markaText}_${bill.receipt || 'Cargo'}.pdf`;
    doc.save(filename);
  }

  return doc;
}

// Consolidated / Multi-bill PDF for a Marka
export function generateConsolidatedMarkaPDF(marka: string, bills: BillPdfData[], vehicleNumber?: string, deliveryAddress?: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const primarySeller = bills[0]?.sellerName || 'US INTERNATIONAL LOGISTICS';
  doc.text(primarySeller.toUpperCase(), 14, 11);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Consolidated Marka Cargo Manifest & Delivery Slip', 14, 17);
  doc.text('Phone: +91 9355456060 | Email: info@usinternationallogistics.com', 14, 22);

  const vehicle = vehicleNumber || bills[0]?.vehicleNumber || '';
  doc.setFillColor(vehicle ? 16 : 220, vehicle ? 185 : 38, vehicle ? 129 : 38);
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  // Title Box
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`CONSOLIDATED MARKA DISPATCH - MARKA: ${marka.toUpperCase()}`, 14, 37);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Total Receipts: ${bills.length}   |   Generated: ${new Date().toLocaleString('en-IN')}`, 14, 42);

  // Summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 46, 182, 22, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Marka (मार्का):', 18, 53);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(marka, 42, 53);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Vehicle (गाड़ी नंबर):', 100, 53);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(vehicle ? 5 : 185, vehicle ? 150 : 28, vehicle ? 105 : 28);
  doc.text(vehicle || 'Pending Dispatch', 135, 53);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Purchaser / Party:', 18, 61);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(bills[0]?.purchaserName || bills[0]?.party || 'General Party'), 42, 61);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Delivery Destination:', 100, 61);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const destText = deliveryAddress || bills[0]?.deliveryAddress || 'Marka Godown';
  doc.text(destText.substring(0, 38), 135, 61);

  // Table
  const headers = [
    '#',
    'Receipt No.',
    'HSN Code',
    'Container',
    'Commodity',
    'Pcs',
    'KG',
    'Taxable (Rs.)',
    'Total (Rs.)',
  ];

  let totalPcs = 0;
  let totalKg = 0;
  let totalTaxable = 0;
  let grandTotal = 0;

  const rows = bills.map((b, idx) => {
    const pcs = Number(b.quantityPcs) || 0;
    const kg = Number(b.quantityKg) || 0;
    const taxable = Number(b.taxableValue) || 0;
    const total = Number(b.totalAmount) || taxable * 1.18;

    totalPcs += pcs;
    totalKg += kg;
    totalTaxable += taxable;
    grandTotal += total;

    return [
      String(idx + 1),
      String(b.receipt || '-'),
      String(b.hsnCode || 'N/A'),
      String(b.container || '-'),
      String(b.commodity || 'Goods').substring(0, 20),
      pcs.toLocaleString('en-IN'),
      kg.toLocaleString('en-IN'),
      taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      total.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ];
  });

  // Add summary row
  rows.push([
    '',
    'TOTAL',
    '',
    '',
    `${bills.length} Items`,
    totalPcs.toLocaleString('en-IN'),
    totalKg.toLocaleString('en-IN'),
    totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 72,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'left', cellWidth: 32 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'right', cellWidth: 23 },
      8: { halign: 'right', cellWidth: 23 },
    },
    styles: { fontSize: 7, cellPadding: 2.2 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  // Signatures
  const sigY = Math.min(finalY + 20, 250);
  doc.line(18, sigY + 16, 68, sigY + 16);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Biller Signatory', 18, sigY + 20);

  doc.line(78, sigY + 16, 128, sigY + 16);
  doc.text(`Dispatcher (${vehicle || 'Vehicle'})`, 78, sigY + 20);

  doc.line(138, sigY + 16, 188, sigY + 16);
  doc.text('Receiver Sign & Stamp', 138, sigY + 20);

  doc.save(`Marka_${marka}_Consolidated_Bills.pdf`);
  return doc;
}
