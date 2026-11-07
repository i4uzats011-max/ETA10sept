import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';

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

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    await connectToDatabase();

    const trackingDoc = await ReceiptTracking.findOne({ token }).lean();
    if (!trackingDoc || !trackingDoc.receipts || trackingDoc.receipts.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No shipment found for this tracking link.' },
        { status: 404 }
      );
    }

    // STRICT SANITIZATION: Only the allowed public fields and nothing else
    const publicReceipts = trackingDoc.receipts.map((r: any) => ({
      receiptNo: r.receiptNo || 'N/A',
      itemName: r.itemName || '-',
      cbm: r.cbm || '0',
      ctn: r.ctn || '0',
      weight: r.weight || '-',
      containerNo: r.containerNo || 'N/A', // Container No. (not actual)
      eta: r.eta || null,
      status: r.status || 'In Transit',
      remainDays: calculateRemainDays(r.eta),
      updatedAt: r.updatedAt || trackingDoc.updatedAt
    }));

    return NextResponse.json({
      success: true,
      token: trackingDoc.token,
      name: trackingDoc.name || undefined,
      count: publicReceipts.length,
      receipts: publicReceipts
    });
  } catch (error: any) {
    console.error('Error fetching public tracking link:', error);
    return NextResponse.json(
      { success: false, message: 'Server error retrieving tracking details' },
      { status: 500 }
    );
  }
}
