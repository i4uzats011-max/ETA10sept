import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

      // Look up containers for live ETA
      const containerAliases = Array.from(
        new Set(shipments.map((s) => (s.container || '').trim()).filter(Boolean))
      );
      const containers: any[] = containerAliases.length > 0
        ? await Container.find({ container: { $in: containerAliases } }).lean()
        : [];
      const containerMap = new Map<string, any>();
      containers.forEach((c) => {
        if (c.container) containerMap.set(c.container.toLowerCase().trim(), c);
      });

      const receiptList: any[] = [];
      const seenKeys = new Set<string>();

      // Group shipments by receipt
      const shipmentsByReceipt = new Map<string, any[]>();
      shipments.forEach((s) => {
        const rKey = (s.receipt || '').toLowerCase().trim();
        if (!shipmentsByReceipt.has(rKey)) shipmentsByReceipt.set(rKey, []);
        shipmentsByReceipt.get(rKey)!.push(s);
      });

      // Group WH receipts by receipt
      const whMap = new Map<string, any>();
      whItems.forEach((w) => {
        const rKey = (w.receipt || '').toLowerCase().trim();
        whMap.set(rKey, w);
      });

      // 2a. Process shipments (supports split containers)
      shipments.forEach((s) => {
        const cDoc = containerMap.get((s.container || '').toLowerCase().trim());
        const liveEta = cDoc?.destinationDate || cDoc?.eta || s.destinationDate || s.eta || '';
        const liveStatus = cDoc?.isDelivered ? 'Delivered' : (s.isDelivered ? 'Delivered' : (cDoc?.status || s.status || 'In Transit'));
        const uniqueKey = `${s.receipt}_${s.container}`.toLowerCase();

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          receiptList.push({
            receiptNo: s.receipt,
            marka: s.mainMarka || s.subMarka || s.party || markaQuery,
            itemName: s.english || s.commodity || s.chinese || '',
            cbm: s.volume || '0',
            ctn: String(s.quantity || '0'),
            weight: s.weight || '',
            containerNo: s.container || '',
            actualContainerNo: s.containerNumber || '',
            eta: liveEta,
            status: liveStatus,
            mainMarka: s.mainMarka || '',
            subMarka: s.subMarka || '',
            party: s.party || ''
          });
        }
      });

      // 2b. Check remaining warehouse stock or unloaded warehouse items
      whItems.forEach((w) => {
        const rKey = (w.receipt || '').toLowerCase().trim();
        const rShipments = shipmentsByReceipt.get(rKey) || [];

        const totalQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
        const loadedQty = typeof w.loadedQuantity === 'number' ? w.loadedQuantity : (parseFloat(String(w.loadedQuantity || '0')) || 0);
        const remainingQty = typeof w.remainingQuantity === 'number' ? w.remainingQuantity : (totalQty - loadedQty);

        if (rShipments.length === 0) {
          // Completely in warehouse
          const uniqueKey = `${w.receipt}_warehouse`.toLowerCase();
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            receiptList.push({
              receiptNo: w.receipt,
              marka: w.mainMarka || w.subMarka || w.party || markaQuery,
              itemName: w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || '',
              cbm: w.volume || '0',
              ctn: String(w.quantity || '0'),
              weight: w.weight || '',
              containerNo: 'In Warehouse (Not Loaded)',
              actualContainerNo: '',
              eta: '',
              status: w.status || 'Received in Warehouse',
              mainMarka: w.mainMarka || '',
              subMarka: w.subMarka || '',
              party: w.party || ''
            });
          }
        } else if (remainingQty > 0) {
          // Partially loaded, remaining stock in warehouse
          const uniqueKey = `${w.receipt}_warehouse_remainder`.toLowerCase();
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            receiptList.push({
              receiptNo: w.receipt,
              marka: w.mainMarka || w.subMarka || w.party || markaQuery,
              itemName: w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || '',
              cbm: String(w.remainingVolume || w.volume || '0'),
              ctn: String(remainingQty),
              weight: String(w.remainingWeight || w.weight || ''),
              containerNo: 'In Warehouse (Not Loaded)',
              actualContainerNo: '',
              eta: '',
              status: w.status || 'Received in Warehouse',
              mainMarka: w.mainMarka || '',
              subMarka: w.subMarka || '',
              party: w.party || ''
            });
          }
        }
      });

      return NextResponse.json({
        success: true,
        marka: markaQuery,
        count: receiptList.length,
        receipts: receiptList
      });
    }

    // 3. Return distinct list of receipts for autocomplete dropdown
    if (listParam === 'true') {
      const shipmentReceipts = await Shipment.distinct('receipt');
      const whReceipts = await WarehouseReceipt.distinct('receipt');
      const allReceipts = Array.from(new Set([...shipmentReceipts, ...whReceipts]))
        .filter(Boolean)
        .slice(0, 300);
      return NextResponse.json({ success: true, receipts: allReceipts });
    }

    // 4. Single receipt lookup (supports split loads across containers and warehouse remainder)
    if (!receiptQuery) {
      return NextResponse.json({ success: false, message: 'Receipt query or Marka query is required' }, { status: 400 });
    }

    const regex = new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const shipments: any[] = await Shipment.find({ receipt: regex }).lean();
    const whItem: any = await WarehouseReceipt.findOne({ receipt: regex }).lean();

    if (shipments.length > 0 || whItem) {
      // Look up container live ETA
      const containerAliases = Array.from(
        new Set(shipments.map((s) => (s.container || '').trim()).filter(Boolean))
      );
      const containers: any[] = containerAliases.length > 0
        ? await Container.find({ container: { $in: containerAliases } }).lean()
        : [];
      const containerMap = new Map<string, any>();
      containers.forEach((c) => {
        if (c.container) containerMap.set(c.container.toLowerCase().trim(), c);
      });

      const allSplitItems: any[] = [];

      for (const s of shipments) {
        const cDoc = containerMap.get((s.container || '').toLowerCase().trim());
        const liveEta = cDoc?.destinationDate || cDoc?.eta || s.destinationDate || s.eta || '';
        const liveStatus = cDoc?.isDelivered ? 'Delivered' : (s.isDelivered ? 'Delivered' : (cDoc?.status || s.status || 'In Transit'));

        allSplitItems.push({
          receiptNo: s.receipt || receiptQuery,
          marka: s.mainMarka || s.subMarka || s.party || whItem?.mainMarka || '',
          itemName: s.english || s.commodity || s.chinese || whItem?.english || '',
          cbm: s.volume || '',
          ctn: String(s.quantity || ''),
          weight: s.weight || '',
          containerNo: s.container || '',
          actualContainerNo: s.containerNumber || '',
          eta: liveEta,
          status: liveStatus
        });
      }

      if (whItem) {
        const totalQty = typeof whItem.quantity === 'number' ? whItem.quantity : (parseFloat(String(whItem.quantity || '0')) || 0);
        const loadedQty = typeof whItem.loadedQuantity === 'number' ? whItem.loadedQuantity : (parseFloat(String(whItem.loadedQuantity || '0')) || 0);
        const remainingQty = typeof whItem.remainingQuantity === 'number' ? whItem.remainingQuantity : (totalQty - loadedQty);

        if (shipments.length === 0) {
          allSplitItems.push({
            receiptNo: whItem.receipt || receiptQuery,
            marka: whItem.mainMarka || whItem.subMarka || whItem.party || '',
            itemName: whItem.english || whItem.commodity || whItem.chinese || (whItem.items && whItem.items[0]?.itemName) || '',
            cbm: whItem.volume || '',
            ctn: String(whItem.quantity || ''),
            weight: whItem.weight || '',
            containerNo: 'In Warehouse (Not Loaded)',
            actualContainerNo: '',
            eta: '',
            status: whItem.status || 'Received in Warehouse'
          });
        } else if (remainingQty > 0) {
          allSplitItems.push({
            receiptNo: whItem.receipt || receiptQuery,
            marka: whItem.mainMarka || whItem.subMarka || whItem.party || '',
            itemName: whItem.english || whItem.commodity || whItem.chinese || (whItem.items && whItem.items[0]?.itemName) || '',
            cbm: String(whItem.remainingVolume || whItem.volume || ''),
            ctn: String(remainingQty),
            weight: String(whItem.remainingWeight || whItem.weight || ''),
            containerNo: 'In Warehouse (Not Loaded)',
            actualContainerNo: '',
            eta: '',
            status: whItem.status || 'Received in Warehouse'
          });
        }
      }

      const primary = allSplitItems[0];
      return NextResponse.json({
        success: true,
        data: primary,
        items: allSplitItems,
        isSplit: allSplitItems.length > 1
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
