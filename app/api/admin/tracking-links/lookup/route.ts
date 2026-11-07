import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const receiptQuery = searchParams.get('receipt')?.trim();
  const listParam = searchParams.get('list');
  const markasParam = searchParams.get('markas');
  const markaQuery = searchParams.get('marka')?.trim();

  try {
    await connectToDatabase();

    // 1. If requested, return distinct list of Markas for autocomplete dropdown
    if (markasParam === 'true') {
      const shipMarks = await Shipment.distinct('mainMarka');
      const shipSubMarks = await Shipment.distinct('subMarka');
      const whMarks = await WarehouseReceipt.distinct('mainMarka');
      const whSubMarks = await WarehouseReceipt.distinct('subMarka');
      const allMarks = Array.from(new Set([...shipMarks, ...shipSubMarks, ...whMarks, ...whSubMarks]))
        .filter(Boolean)
        .sort();
      return NextResponse.json({ success: true, markas: allMarks });
    }

    // 2. If requested, lookup all receipts by Marka (Main Mark, Sub Mark, or Party)
    if (markaQuery) {
      const markaRegex = new RegExp(`^${markaQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

      const shipments: any[] = await Shipment.find({
        $or: [
          { mainMarka: markaRegex },
          { subMarka: markaRegex },
          { party: markaRegex }
        ]
      }).sort({ date: -1 }).lean();

      const whItems: any[] = await WarehouseReceipt.find({
        $or: [
          { mainMarka: markaRegex },
          { subMarka: markaRegex },
          { party: markaRegex }
        ]
      }).sort({ createdAt: -1 }).lean();

      // Combine and deduplicate by receipt number
      const receiptMap = new Map<string, any>();

      shipments.forEach((s) => {
        if (s.receipt && !receiptMap.has(s.receipt)) {
          receiptMap.set(s.receipt, {
            receiptNo: s.receipt,
            itemName: s.english || s.commodity || s.chinese || '',
            cbm: s.volume || '',
            ctn: String(s.quantity || ''),
            weight: s.weight || '',
            containerNo: s.container || '', // Container alias (not actual)
            actualContainerNo: s.containerNumber || '',
            eta: s.destinationDate || s.eta || '',
            status: s.status || 'In Transit',
            mainMarka: s.mainMarka || '',
            subMarka: s.subMarka || '',
            party: s.party || ''
          });
        }
      });

      whItems.forEach((w) => {
        if (w.receipt && !receiptMap.has(w.receipt)) {
          receiptMap.set(w.receipt, {
            receiptNo: w.receipt,
            itemName: w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || '',
            cbm: w.volume || '',
            ctn: String(w.quantity || ''),
            weight: w.weight || '',
            containerNo: '',
            actualContainerNo: '',
            eta: '',
            status: w.status || 'Received in Warehouse',
            mainMarka: w.mainMarka || '',
            subMarka: w.subMarka || '',
            party: w.party || ''
          });
        }
      });

      return NextResponse.json({
        success: true,
        marka: markaQuery,
        count: receiptMap.size,
        receipts: Array.from(receiptMap.values())
      });
    }

    // 3. Return distinct list of receipts for autocomplete dropdown
    if (listParam === 'true') {
      const shipmentReceipts = await Shipment.distinct('receipt');
      const whReceipts = await WarehouseReceipt.distinct('receipt');
      const allReceipts = Array.from(new Set([...shipmentReceipts, ...whReceipts]))
        .filter(Boolean)
        .slice(0, 200);
      return NextResponse.json({ success: true, receipts: allReceipts });
    }

    // 4. Single receipt lookup
    if (!receiptQuery) {
      return NextResponse.json({ success: false, message: 'Receipt query or Marka query is required' }, { status: 400 });
    }

    const regex = new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Check Shipment collection (read-only query)
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
          eta: shipment.destinationDate || shipment.eta || '',
          status: shipment.status || 'In Transit'
        }
      });
    }

    // Fallback to WarehouseReceipt collection (read-only query)
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
          eta: '',
          status: whItem.status || 'Received in Warehouse'
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
