import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import ReceiptTracking from '@/models/ReceiptTracking';
import { isMarkaMatch } from '@/lib/liveTrackingResolver';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

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

      const rawShipments: any[] = await Shipment.find({
        $or: [
          { mainMarka: markaRegex },
          { subMarka: markaRegex },
          { party: markaRegex }
        ]
      }).sort({ date: -1 }).lean();

      const rawWhItems: any[] = await WarehouseReceipt.find({
        $or: [
          { mainMarka: markaRegex },
          { subMarka: markaRegex },
          { party: markaRegex }
        ]
      }).sort({ createdAt: -1 }).lean();

      // Filter strictly by isMarkaMatch so multi-token and partial matches align properly
      const shipments = rawShipments.filter((s: any) =>
        isMarkaMatch(markaQuery, s.mainMarka) ||
        isMarkaMatch(markaQuery, s.subMarka) ||
        isMarkaMatch(markaQuery, s.party)
      );

      const whItems = rawWhItems.filter((w: any) =>
        isMarkaMatch(markaQuery, w.mainMarka) ||
        isMarkaMatch(markaQuery, w.subMarka) ||
        isMarkaMatch(markaQuery, w.party)
      );

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

      // 2a. Process shipments (supports split containers)
      // Transaction is uniquely identified by: Receipt No. + Marka + Warehouse Name!
      shipments.forEach((s) => {
        const cDoc = containerMap.get((s.container || '').toLowerCase().trim());
        const liveEta = cDoc?.destinationDate || cDoc?.eta || s.destinationDate || s.eta || '';
        const liveStatus = cDoc?.isDelivered ? 'Delivered' : (s.isDelivered ? 'Delivered' : (cDoc?.status || s.status || 'In Transit'));
        const sWh = (s.warehouse || '').toUpperCase().trim();
        const sMarka = (s.mainMarka || s.subMarka || s.party || markaQuery).toUpperCase().trim();
        const uniqueKey = `${s.receipt}_${sWh}_${sMarka}_${s.container}_${s.quantity}`.toLowerCase();

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          receiptList.push({
            receiptNo: s.receipt,
            warehouse: s.warehouse || '',
            warehouseReceiptId: s.receiptId ? String(s.receiptId) : '',
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
        const wWh = (w.warehouse || '').toUpperCase().trim();
        const wMarka = (w.mainMarka || w.subMarka || w.party || markaQuery).toUpperCase().trim();

        const rShipments = (shipmentsByReceipt.get(rKey) || []).filter((s: any) => {
          const sWh = (s.warehouse || '').toUpperCase().trim();
          if (sWh && wWh && sWh !== wWh) return false;
          const sMarka = (s.mainMarka || s.subMarka || s.party || '').toUpperCase().trim();
          if (sMarka && wMarka && !isMarkaMatch(wMarka, sMarka)) return false;
          return true;
        });

        const totalQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
        const recordedLoaded = typeof w.loadedQuantity === 'number' ? w.loadedQuantity : (parseFloat(String(w.loadedQuantity || '0')) || 0);
        const actualLoaded = rShipments.reduce((sum: number, s: any) => sum + (parseFloat(String(s.quantity || '0')) || 0), 0);
        const loadedQty = rShipments.length > 0 ? actualLoaded : recordedLoaded;
        const remainingQty = Math.max(0, totalQty - loadedQty);

        if (rShipments.length === 0) {
          // Completely in warehouse
          const uniqueKey = `${w.receipt}_${wWh}_${wMarka}_warehouse`.toLowerCase();
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            receiptList.push({
              receiptNo: w.receipt,
              warehouse: w.warehouse || '',
              warehouseReceiptId: String(w._id),
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
          const uniqueKey = `${w.receipt}_${wWh}_${wMarka}_warehouse_remainder`.toLowerCase();
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            receiptList.push({
              receiptNo: w.receipt,
              warehouse: w.warehouse || '',
              warehouseReceiptId: String(w._id),
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

      // 2c. Check which receipts are already linked in ReceiptTracking
      // Transaction is matched by: Receipt No. + Warehouse + Marka
      const allLinkedDocs: any[] = await ReceiptTracking.find({}).lean();

      receiptList.forEach((it) => {
        let matchedDoc: any = null;
        for (const doc of allLinkedDocs) {
          const hasMatch = (doc.receipts || []).some((r: any) => {
            if ((r.receiptNo || '').trim().toLowerCase() !== it.receiptNo.trim().toLowerCase()) return false;
            const rWh = (r.warehouse || '').toUpperCase().trim();
            const itWh = (it.warehouse || '').toUpperCase().trim();
            if (rWh && itWh && rWh !== itWh) return false;
            const rMarka = (r.marka || doc.name || '').toUpperCase().trim();
            const itMarka = (it.marka || markaQuery).toUpperCase().trim();
            if (rMarka && itMarka && !isMarkaMatch(itMarka, rMarka)) return false;
            return true;
          });
          if (hasMatch) {
            matchedDoc = doc;
            break;
          }
        }
        it.isAlreadyLinked = Boolean(matchedDoc);
        it.linkedToken = matchedDoc ? matchedDoc.token : undefined;
        it.linkedName = matchedDoc ? (matchedDoc.name || matchedDoc.token) : undefined;
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
    const whItems: any[] = await WarehouseReceipt.find({ receipt: regex }).lean();
    const whItem: any = whItems[0] || null;

    if (shipments.length > 0 || whItems.length > 0) {
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

        // Match corresponding warehouse receipt
        const matchedWh = whItems.find((w: any) =>
          (s.receiptId && String(s.receiptId) === String(w._id)) ||
          ((s.warehouse || '').toUpperCase().trim() === (w.warehouse || '').toUpperCase().trim())
        );

        allSplitItems.push({
          receiptNo: s.receipt || receiptQuery,
          warehouse: s.warehouse || matchedWh?.warehouse || '',
          warehouseReceiptId: s.receiptId ? String(s.receiptId) : (matchedWh ? String(matchedWh._id) : ''),
          marka: s.mainMarka || s.subMarka || s.party || matchedWh?.mainMarka || whItem?.mainMarka || '',
          itemName: s.english || s.commodity || s.chinese || matchedWh?.english || whItem?.english || '',
          cbm: s.volume || '',
          ctn: String(s.quantity || ''),
          weight: s.weight || '',
          containerNo: s.container || '',
          actualContainerNo: s.containerNumber || '',
          eta: liveEta,
          status: liveStatus
        });
      }

      for (const w of whItems) {
        const totalQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
        const recordedLoaded = typeof w.loadedQuantity === 'number' ? w.loadedQuantity : (parseFloat(String(w.loadedQuantity || '0')) || 0);

        const wWh = (w.warehouse || '').toUpperCase().trim();
        const wMarka = (w.mainMarka || w.subMarka || w.party || '').toUpperCase().trim();

        const wShipments = shipments.filter((s: any) => {
          if (s.receiptId && String(s.receiptId) === String(w._id)) return true;
          const sWh = (s.warehouse || '').toUpperCase().trim();
          if (sWh && wWh && sWh !== wWh) return false;
          const sMarka = (s.mainMarka || s.subMarka || s.party || '').toUpperCase().trim();
          if (sMarka && wMarka && !isMarkaMatch(wMarka, sMarka)) return false;
          return true;
        });

        const actualLoaded = wShipments.reduce((sum: number, s: any) => sum + (parseFloat(String(s.quantity || '0')) || 0), 0);
        const loadedQty = wShipments.length > 0 ? actualLoaded : recordedLoaded;
        const remainingQty = Math.max(0, totalQty - loadedQty);

        if (wShipments.length === 0) {
          allSplitItems.push({
            receiptNo: w.receipt || receiptQuery,
            warehouse: w.warehouse || '',
            warehouseReceiptId: String(w._id),
            marka: w.mainMarka || w.subMarka || w.party || '',
            itemName: w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || '',
            cbm: w.volume || '',
            ctn: String(w.quantity || ''),
            weight: w.weight || '',
            containerNo: 'In Warehouse (Not Loaded)',
            actualContainerNo: '',
            eta: '',
            status: w.status || 'Received in Warehouse'
          });
        } else if (remainingQty > 0) {
          allSplitItems.push({
            receiptNo: w.receipt || receiptQuery,
            warehouse: w.warehouse || '',
            warehouseReceiptId: String(w._id),
            marka: w.mainMarka || w.subMarka || w.party || '',
            itemName: w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || '',
            cbm: String(w.remainingVolume || w.volume || ''),
            ctn: String(remainingQty),
            weight: String(w.remainingWeight || w.weight || ''),
            containerNo: 'In Warehouse (Not Loaded)',
            actualContainerNo: '',
            eta: '',
            status: w.status || 'Received in Warehouse'
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
