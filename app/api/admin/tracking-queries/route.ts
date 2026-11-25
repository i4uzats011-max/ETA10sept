import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import { isCustomerQueryAccessAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET all customer queries for admin and sales head
export async function GET(req: NextRequest) {
  if (!isCustomerQueryAccessAuthorized(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const queries = await TrackingQuery.find({}).sort({ createdAt: -1 }).lean();

    const receiptNos = Array.from(
      new Set(queries.map((q: any) => String(q.receiptNo || '').trim()).filter(Boolean))
    );

    const [whReceipts, shipments] = await Promise.all([
      WarehouseReceipt.find({ receipt: { $in: receiptNos } })
        .select('receipt english commodity warehouse quantity remainingQuantity weight volume party')
        .lean(),
      Shipment.find({ receipt: { $in: receiptNos } })
        .select('receipt container status actualEta graceDate party')
        .lean(),
    ]);

    const whMap = new Map<string, any>();
    whReceipts.forEach((r: any) => {
      if (r.receipt) whMap.set(String(r.receipt).toLowerCase(), r);
    });

    const shMap = new Map<string, any>();
    shipments.forEach((s: any) => {
      if (s.receipt) shMap.set(String(s.receipt).toLowerCase(), s);
    });

    return NextResponse.json({
      success: true,
      queries: queries.map((q: any) => {
        const rcKey = String(q.receiptNo || '').toLowerCase();
        const wh = whMap.get(rcKey);
        const sh = shMap.get(rcKey);

        return {
          id: q._id.toString(),
          token: q.token,
          receiptNo: q.receiptNo,
          marka: q.marka || '',
          senderName: q.senderName || '',
          senderPhone: q.senderPhone || '',
          message: q.message,
          reply: q.reply || '',
          status: q.status || 'Pending',
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          commodity: wh?.english || wh?.commodity || '',
          warehouse: wh?.warehouse || '',
          container: sh?.container || '',
          shipmentStatus: sh?.status || '',
          eta: sh?.actualEta || sh?.graceDate || null,
          party: wh?.party || sh?.party || '',
          quantity: wh?.quantity || null,
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching admin tracking queries:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch customer queries' },
      { status: 500 }
    );
  }
}
