import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import { resolveLiveReceiptsForTrackingDoc } from '@/lib/liveTrackingResolver';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Tracking token required' },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );
    }

    await connectToDatabase();

    const trackingDoc = await ReceiptTracking.findOne({ token }).lean();
    if (!trackingDoc || !trackingDoc.receipts || trackingDoc.receipts.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No shipment found for this tracking link.' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );
    }

    // Resolve 100% LIVE DB data across Shipment, Container, and WarehouseReceipt
    const publicReceipts = await resolveLiveReceiptsForTrackingDoc(trackingDoc, {
      includeAdminFields: false
    });

    return NextResponse.json(
      {
        success: true,
        token: trackingDoc.token,
        name: trackingDoc.name || undefined,
        count: publicReceipts.length,
        receipts: publicReceipts
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store'
        }
      }
    );
  } catch (error: any) {
    console.error('Error fetching public tracking link:', error);
    return NextResponse.json(
      { success: false, message: 'Server error retrieving tracking details' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}
