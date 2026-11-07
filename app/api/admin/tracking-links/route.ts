import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking, { IReceiptEntry } from '@/models/ReceiptTracking';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';

export const dynamic = 'force-dynamic';

function calculateRemainDays(etaString?: string): number | null {
  if (!etaString) return null;
  const etaDate = new Date(etaString);
  if (isNaN(etaDate.getTime())) return null;

  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = etaStart.getTime() - nowStart.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// GET all tracking records for admin
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const trackingDocs = await ReceiptTracking.find({}).sort({ updatedAt: -1 }).lean();

    const flattened = trackingDocs.flatMap((doc: any) => {
      return (doc.receipts || []).map((r: any) => ({
        ...r,
        trackingToken: doc.token,
        trackingName: doc.name,
        docId: doc._id.toString(),
        remainDays: calculateRemainDays(r.eta)
      }));
    });

    // Also collect list of unique tracking tokens for linking dropdown
    const tokenList = trackingDocs.map((doc: any) => ({
      token: doc.token,
      name: doc.name,
      receipts: (doc.receipts || []).map((r: any) => r.receiptNo)
    }));

    return NextResponse.json({
      success: true,
      receipts: flattened,
      tokens: tokenList
    });
  } catch (error: any) {
    console.error('Error fetching admin tracking links:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch receipts' },
      { status: 500 }
    );
  }
}

// POST create a receipt or attach to existing link
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const {
      receiptNo,
      itemName,
      cbm,
      ctn,
      weight,
      containerNo,
      actualContainerNo,
      eta,
      adminNotes,
      trackingTokenOption, // 'new' or 'existing'
      existingToken,
      trackingName
    } = body;

    if (!receiptNo || !receiptNo.trim()) {
      return NextResponse.json({ success: false, message: 'Receipt No. is required' }, { status: 400 });
    }

    const cleanReceiptNo = receiptNo.trim();

    // Determine tracking token
    let token = '';
    if (trackingTokenOption === 'existing' && existingToken && existingToken.trim()) {
      token = existingToken.trim();
    } else {
      token = 'trk_' + crypto.randomBytes(6).toString('hex');
    }

    const newEntry: IReceiptEntry = {
      id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      receiptNo: cleanReceiptNo,
      itemName: (itemName || '').trim(),
      cbm: (cbm || '').trim(),
      ctn: (ctn || '').trim(),
      weight: (weight || '').trim(),
      containerNo: (containerNo || '').trim(), // Public display: Container No. (not actual)
      actualContainerNo: (actualContainerNo || '').trim(),
      eta: eta ? eta.trim() : '',
      adminNotes: (adminNotes || '').trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Find if tracking doc exists for this token
    let trackingDoc = await ReceiptTracking.findOne({ token });

    if (trackingDoc) {
      // Append to existing link
      trackingDoc.receipts.push(newEntry);
      if (trackingName && trackingName.trim()) {
        trackingDoc.name = trackingName.trim();
      }
      trackingDoc.updatedAt = new Date();
      await trackingDoc.save();
    } else {
      // Create new tracking doc
      trackingDoc = await ReceiptTracking.create({
        token,
        name: (trackingName || '').trim(),
        receipts: [newEntry]
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt added successfully.',
      receipt: {
        ...newEntry,
        trackingToken: token,
        remainDays: calculateRemainDays(newEntry.eta)
      }
    });
  } catch (error: any) {
    console.error('Error adding tracking receipt:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to save receipt' },
      { status: 500 }
    );
  }
}
