import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const receiptQuery = searchParams.get('receipt')?.trim();
  const listParam = searchParams.get('list');

  try {
    await connectToDatabase();

    // If requested, return distinct list of receipts for autocomplete dropdown
    if (listParam === 'true') {
      const shipmentReceipts = await Shipment.distinct('receipt');
      const whReceipts = await WarehouseReceipt.distinct('receipt');
      const allReceipts = Array.from(new Set([...shipmentReceipts, ...whReceipts]))
        .filter(Boolean)
        .slice(0, 200);
      return NextResponse.json({ success: true, receipts: allReceipts });
    }

    if (!receiptQuery) {
      return NextResponse.json({ success: false, message: 'Receipt query is required' }, { status: 400 });
    }

    const regex = new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // 1. Check Shipment collection (read-only query)
    const shipment: any = await Shipment.findOne({ receipt: regex }).lean();

    if (shipment) {
      return NextResponse.json({
        success: true,
        data: {
          receiptNo: shipment.receipt || receiptQuery,
          itemName: shipment.english || shipment.commodity || shipment.chinese || '',
          cbm: shipment.volume || '',
          ctn: String(shipment.quantity || ''),
          weight: shipment.weight || '',
          containerNo: shipment.container || '', // Container alias e.g. USI-01 (not actual)
          actualContainerNo: shipment.containerNumber || '', // Actual container number
          eta: shipment.destinationDate || shipment.eta || ''
        }
      });
    }

    // 2. Fallback to WarehouseReceipt collection (read-only query)
    const whItem: any = await WarehouseReceipt.findOne({ receipt: regex }).lean();

    if (whItem) {
      return NextResponse.json({
        success: true,
        data: {
          receiptNo: whItem.receipt || receiptQuery,
          itemName: whItem.english || whItem.commodity || whItem.chinese || (whItem.items && whItem.items[0]?.itemName) || '',
          cbm: whItem.volume || '',
          ctn: String(whItem.quantity || ''),
          weight: whItem.weight || '',
          containerNo: '',
          actualContainerNo: '',
          eta: ''
        }
      });
    }

    return NextResponse.json({
      success: false,
      message: `No existing database cargo record found for receipt #${receiptQuery}. You can enter details manually.`
    });
  } catch (error: any) {
    console.error('Lookup error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Error looking up receipt' },
      { status: 500 }
    );
  }
}
