import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking, { IReceiptEntry } from '@/models/ReceiptTracking';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { calculateRemainDays } from '@/lib/liveTrackingResolver';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeCarton(val: any): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).replace(/[^0-9.]/g, '');
  if (!str) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// POST: Public user self-adds a receipt with verification of Receipt No. and Total CTN Received in Warehouse
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    const body = await req.json();
    const inputReceiptNo = String(body.receiptNo || body.receipt || '').trim();
    const inputCtn = body.ctn !== undefined ? body.ctn : body.quantity;

    if (!inputReceiptNo) {
      return NextResponse.json({ success: false, message: 'Receipt No. is required' }, { status: 400 });
    }
    if (inputCtn === undefined || inputCtn === null || String(inputCtn).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Total Received Carton Count (CTN received in warehouse) is required for verification'
      }, { status: 400 });
    }

    const inputCtnNum = normalizeCarton(inputCtn);
    if (inputCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: 'Please enter a valid numeric Carton Count (CTN)'
      }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Verify tracking link exists
    const trackingDoc = await ReceiptTracking.findOne({ token });
    if (!trackingDoc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found or expired' }, { status: 404 });
    }

    // 2. Check if receipt already exists in this tracking link
    const alreadyExists = (trackingDoc.receipts || []).some(
      (r: any) => r.receiptNo && r.receiptNo.trim().toLowerCase() === inputReceiptNo.toLowerCase()
    );
    if (alreadyExists) {
      return NextResponse.json({
        success: false,
        message: `Receipt #${inputReceiptNo} is already present in this tracking link.`
      }, { status: 400 });
    }

    // 3. Search database for this receipt (WarehouseReceipt has total received CTN in warehouse)
    const receiptRegex = new RegExp(`^${inputReceiptNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const whItem: any = await WarehouseReceipt.findOne({ receipt: receiptRegex }).lean();
    const shipments: any[] = await Shipment.find({ receipt: receiptRegex }).lean();

    let matchedRecord: any = null;
    let totalWarehouseCtnNum: number | null = null;
    let recordSource = '';

    if (whItem) {
      matchedRecord = whItem;
      recordSource = 'warehouse';
      totalWarehouseCtnNum = normalizeCarton(whItem.quantity);
    }

    if (shipments.length > 0) {
      if (!matchedRecord) {
        matchedRecord = shipments[0];
        recordSource = 'shipment';
      }
      // Check original total quantity or sum across split shipments
      const origQty = normalizeCarton(shipments[0]?.originalTotalQuantity);
      if (origQty !== null && origQty > 0) {
        if (totalWarehouseCtnNum === null) totalWarehouseCtnNum = origQty;
      } else if (totalWarehouseCtnNum === null) {
        const sumQty = shipments.reduce((acc, s) => acc + (normalizeCarton(s.quantity) || 0), 0);
        if (sumQty > 0) totalWarehouseCtnNum = sumQty;
      }
    }

    // Fallback: check existing tracking documents in ReceiptTracking
    if (!matchedRecord) {
      const existingDoc: any = await ReceiptTracking.findOne({ 'receipts.receiptNo': receiptRegex }).lean();
      if (existingDoc && Array.isArray(existingDoc.receipts)) {
        const found = existingDoc.receipts.find(
          (r: any) => r.receiptNo && r.receiptNo.toLowerCase() === inputReceiptNo.toLowerCase()
        );
        if (found) {
          matchedRecord = found;
          recordSource = 'receipt_tracking';
          totalWarehouseCtnNum = normalizeCarton(found.ctn);
        }
      }
    }

    if (!matchedRecord || totalWarehouseCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: `Receipt #${inputReceiptNo} was not found in shipment records. Please verify the receipt number on your warehouse slip.`
      }, { status: 404 });
    }

    // 4. Verify CTN matches TOTAL CTN RECEIVED IN WAREHOUSE
    if (totalWarehouseCtnNum !== inputCtnNum) {
      return NextResponse.json({
        success: false,
        message: `Verification failed: Carton count (${inputCtn} CTN) does not match total packages received in warehouse for Receipt #${inputReceiptNo}. Please enter the total CTN received as per your warehouse slip.`
      }, { status: 400 });
    }

    // 5. Verification passed: both receipt and total CTN are verified
    const newEntry: IReceiptEntry = {
      id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      receiptNo: matchedRecord.receipt || matchedRecord.receiptNo || inputReceiptNo,
      marka: String(matchedRecord.mainMarka || matchedRecord.subMarka || matchedRecord.marka || trackingDoc.name || '').trim(),
      itemName: String(matchedRecord.english || matchedRecord.commodity || matchedRecord.chinese || matchedRecord.itemName || (matchedRecord.items && matchedRecord.items[0]?.itemName) || '').trim(),
      cbm: String(matchedRecord.volume || matchedRecord.cbm || '').trim(),
      ctn: String(totalWarehouseCtnNum),
      weight: String(matchedRecord.weight || '').trim(),
      containerNo: String(matchedRecord.container || matchedRecord.containerNo || 'In Warehouse (Not Loaded)').trim(),
      actualContainerNo: '',
      eta: String(matchedRecord.destinationDate || matchedRecord.eta || '').trim(),
      status: String(matchedRecord.status || (recordSource === 'warehouse' ? 'Received in Warehouse' : 'In Transit')).trim(),
      adminNotes: 'Self-added by customer via tracking link with verified warehouse total CTN',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    trackingDoc.receipts.push(newEntry);
    trackingDoc.updatedAt = new Date();
    await trackingDoc.save();

    return NextResponse.json({
      success: true,
      message: `✓ Receipt #${newEntry.receiptNo} (Total ${newEntry.ctn} CTN in Warehouse) verified & linked successfully!`,
      receipt: {
        marka: newEntry.marka || trackingDoc.name || '-',
        receiptNo: newEntry.receiptNo,
        itemName: newEntry.itemName || '-',
        containerNo: newEntry.containerNo || 'Pending Allocation',
        cbm: newEntry.cbm || '0',
        weight: newEntry.weight || '-',
        ctn: newEntry.ctn || '0',
        eta: newEntry.eta || null,
        status: newEntry.status,
        remainDays: calculateRemainDays(newEntry.eta)
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });

  } catch (error: any) {
    console.error('Error adding receipt via public tracking link:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error adding receipt' },
      { status: 500 }
    );
  }
}
