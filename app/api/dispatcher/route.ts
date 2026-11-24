import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Bill from '@/models/Bill';
import Seller from '@/models/Seller';
import DispatchRequest from '@/models/DispatchRequest';
import { isAnyAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { generateInvoiceNumberFromReceipt } from '@/lib/invoiceUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section') || 'eta';

    // SECTION 1: ETA (Container List - In-Transit)
    if (section === 'eta') {
      const containers = await Container.find({
        $or: [
          { isDelivered: { $ne: true } },
          { isDelivered: false },
          { isDelivered: { $exists: false } },
        ],
      })
        .select('container containerNumber eta loadingDate status currentLocation shippedFrom shippedTo totalQuantity totalWeight totalVolume isDelivered')
        .sort({ loadingDate: -1, eta: -1 })
        .lean();

      return NextResponse.json({ success: true, containers });
    }

    // Lazy load cargo for a single container on-demand
    if (section === 'container_cargo') {
      const containerAlias = searchParams.get('container')?.trim();
      if (!containerAlias) {
        return NextResponse.json({ error: 'Container alias is required' }, { status: 400 });
      }

      const cleanRegex = new RegExp(`^${containerAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const shipments = await Shipment.find({
        $or: [{ container: cleanRegex }, { containerNumber: cleanRegex }],
      })
        .select('receipt mainMarka subMarka party commodity packages weight volume isDelivered status')
        .lean();

      // Look up salesStatus from WarehouseReceipt for each receipt
      const receiptsList = shipments.map((s) => s.receipt).filter(Boolean);
      const whReceipts = await WarehouseReceipt.find({ receipt: { $in: receiptsList } })
        .select('receipt salesStatus salesRate salesRemarks isDelivered remainingQuantity')
        .lean();
      
      const statusMap = new Map<string, any>();
      whReceipts.forEach((wr) => {
        statusMap.set(wr.receipt, wr);
      });

      const cargoItems = shipments.map((s) => {
        const wr = statusMap.get(s.receipt);
        return {
          ...s,
          salesStatus: wr?.salesStatus || 'Normal',
          salesRate: wr?.salesRate || '',
          salesRemarks: wr?.salesRemarks || '',
          remainingQuantity: wr?.remainingQuantity ?? s.packages,
        };
      });

      return NextResponse.json({ success: true, cargo: cargoItems });
    }

    // SECTION 2: DELIVERY (Delivered containers & receipts with 'Available to Deliver' or 'Hold')
    if (section === 'delivery') {
      const containerFilter = searchParams.get('container')?.trim();

      // Find delivered containers marked by Admin
      const deliveredContainers = await Container.find({ isDelivered: true })
        .select('container containerNumber deliveryDate status totalQuantity')
        .sort({ deliveryDate: -1 })
        .lean();

      // Find all warehouse receipts marked "Available to Deliver", "Hold", or delivered
      const availableReceipts = await WarehouseReceipt.find({
        $or: [
          { salesStatus: 'Available to Deliver' },
          { salesStatus: 'Hold' },
          { isDelivered: true },
        ],
      })
        .select('receipt party warehouse date quantity loadedQuantity remainingQuantity weight volume commodity packaging mainMarka subMarka salesStatus salesPerson isDelivered deliveryDate phone partyPhone holdReason goodsReceivedStatus receivedQuantity goodsReceivedRemarks goodsReceivedAt goodsReceivedBy unloadStatus sentQuantity warehouseQuantity unloadRemarks unloadedAt unloadedBy')
        .sort({ updatedAt: -1 })
        .limit(400)
        .lean();

      // Match each receipt with its container from Shipment if available
      const receiptNumbers = availableReceipts.map((r) => r.receipt).filter(Boolean);
      const matchingShipments = await Shipment.find({ receipt: { $in: receiptNumbers } })
        .select('receipt container containerNumber packages commodity english salesStatus holdReason unloadStatus sentQuantity warehouseQuantity unloadRemarks unloadedAt unloadedBy')
        .lean();

      const shipmentMap = new Map<string, any>();
      matchingShipments.forEach((s) => {
        shipmentMap.set(s.receipt, s);
      });

      const deliveryItems = availableReceipts.map((r) => {
        const sh = shipmentMap.get(r.receipt);
        const sStatus = r.salesStatus || sh?.salesStatus || (r.isDelivered ? 'Available to Deliver' : 'Normal');
        const hReason = r.holdReason || sh?.holdReason || '';
        const unStatus = (r as any).unloadStatus || sh?.unloadStatus || undefined;
        const sQty = (r as any).sentQuantity ?? sh?.sentQuantity ?? 0;
        const wQty = (r as any).warehouseQuantity ?? sh?.warehouseQuantity ?? 0;
        return {
          _id: r._id,
          receipt: r.receipt,
          container: sh?.container || 'Unassigned',
          containerNumber: sh?.containerNumber || '',
          marka: r.mainMarka || '',
          subMarka: r.subMarka || '',
          party: r.party || '',
          commodity: r.commodity || sh?.commodity || sh?.english || 'Commercial Cargo',
          totalCartons: r.quantity || sh?.packages || 0,
          remainingCartons: r.remainingQuantity ?? r.quantity ?? 0,
          weight: r.weight || '',
          volume: r.volume || '',
          salesStatus: sStatus,
          holdReason: hReason,
          isHold: sStatus === 'Hold',
          goodsReceivedStatus: (r as any).goodsReceivedStatus || (r.isDelivered ? 'full' : undefined),
          receivedQuantity: (r as any).receivedQuantity || 0,
          goodsReceivedRemarks: (r as any).goodsReceivedRemarks || '',
          goodsReceivedAt: (r as any).goodsReceivedAt || null,
          goodsReceivedBy: (r as any).goodsReceivedBy || '',
          unloadStatus: unStatus,
          sentQuantity: sQty,
          warehouseQuantity: wQty,
          unloadRemarks: (r as any).unloadRemarks || sh?.unloadRemarks || '',
          unloadedAt: (r as any).unloadedAt || sh?.unloadedAt || null,
          unloadedBy: (r as any).unloadedBy || sh?.unloadedBy || '',
          isDelivered: Boolean(r.isDelivered),
          phone: r.phone || r.partyPhone || '',
        };
      });

      // Build distinct containers summary for dropdown
      const containerSummaryMap = new Map<string, { container: string; count: number; availableCount: number }>();

      // Seed with all delivered containers marked by Admin
      deliveredContainers.forEach((dc: any) => {
        const c = (dc.container || dc.containerNumber || '').trim();
        if (c) {
          containerSummaryMap.set(c, { container: c, count: 0, availableCount: 0 });
        }
      });

      deliveryItems.forEach((item) => {
        const c = item.container?.trim();
        if (c && c !== 'Unassigned') {
          const prev = containerSummaryMap.get(c) || { container: c, count: 0, availableCount: 0 };
          prev.count += 1;
          if (item.salesStatus === 'Available to Deliver' && !item.isHold) {
            prev.availableCount += 1;
          }
          containerSummaryMap.set(c, prev);
        }
      });

      const deliveryContainers = Array.from(containerSummaryMap.values()).sort((a, b) =>
        a.container.localeCompare(b.container)
      );

      // Filter deliveryItems if specific container requested
      let filteredItems = deliveryItems;
      if (containerFilter && containerFilter !== 'all') {
        const rgx = new RegExp(`^${containerFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        filteredItems = deliveryItems.filter((it) => rgx.test(it.container) || rgx.test(it.containerNumber));
      }

      return NextResponse.json({
        success: true,
        deliveredContainers,
        deliveryContainers,
        deliveryItems: filteredItems,
      });
    }

    // SECTION 3: BILLS (Bills generated for completed dispatches)
    if (section === 'bills') {
      // 1-hour Auto-Delete: Delete bills that were generated and downloaded > 1 hour ago
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      try {
        await Bill.deleteMany({
          isDownloaded: true,
          downloadedAt: { $exists: true, $ne: null, $lte: oneHourAgo },
        });
      } catch (purgeErr) {
        console.warn('Bill 1-hour purge note in dispatcher:', purgeErr);
      }

      const bills = await Bill.find()
        .select('billNumber receipt container party mainMarka subMarka commodity totalAmount taxableValue igstAmount vehicleNumber totalCartons dispatchedCartons remainingCartons isDispatched deliveryDate deliveryTime deliveryAddress createdAt eWayBillNo')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      return NextResponse.json({ success: true, bills });
    }

    // DISPATCH REQUESTS (Pending or completed requests)
    if (section === 'requests') {
      const statusFilter = searchParams.get('status')?.trim();
      const query: any = {};
      if (statusFilter && statusFilter !== 'all') {
        query.status = statusFilter;
      }

      const requests = await DispatchRequest.find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      return NextResponse.json({ success: true, requests });
    }

    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in Dispatcher API GET:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { action } = body;

    // ACTION: INITIATE FOR BILLING (बिलिंग के लिए भेजें)
    if (action === 'initiate_billing') {
      const {
        receipt,
        container,
        containerNumber,
        marka,
        party,
        commodity,
        vehicleNumber,
        cartonCount,
        totalCartons,
        place,
        remarks,
      } = body;

      if (!receipt || !vehicleNumber || !cartonCount || !place) {
        return NextResponse.json(
          { error: 'Receipt, Gaadi Number, Carton Count, and Place/Address are mandatory.' },
          { status: 400 }
        );
      }

      const ctn = Number(cartonCount);
      if (isNaN(ctn) || ctn <= 0) {
        return NextResponse.json({ error: 'Carton count must be a positive number.' }, { status: 400 });
      }

      // HOLD CHECK: Check if item is on Hold
      const wrCheck = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() }).lean();
      const shCheck = await Shipment.findOne({ receipt: String(receipt).trim() }).lean();
      const isHold = (wrCheck as any)?.salesStatus === 'Hold' || (shCheck as any)?.salesStatus === 'Hold';
      if (isHold) {
        const reason = (wrCheck as any)?.holdReason || (shCheck as any)?.holdReason || 'Put on hold by Sales/Admin';
        return NextResponse.json(
          { error: `यह माल होल्ड पर है (${reason})। होल्ड माल का डिस्पैच या बिलिंग नहीं की जा सकती।` },
          { status: 400 }
        );
      }

      // Resolve Container & Container Number
      let resolvedContainer = String(container || '').trim();
      let resolvedContainerNumber = String(containerNumber || '').trim();

      if (!resolvedContainer || !resolvedContainerNumber) {
        try {
          const sh = await Shipment.findOne({ receipt: String(receipt).trim() }).select('container containerNumber').lean();
          if (sh) {
            if (!resolvedContainer && (sh as any).container) resolvedContainer = (sh as any).container;
            if (!resolvedContainerNumber && (sh as any).containerNumber) resolvedContainerNumber = (sh as any).containerNumber;
          }
          if (!resolvedContainerNumber && resolvedContainer) {
            const contDoc = await Container.findOne({ container: resolvedContainer }).select('containerNumber').lean();
            if (contDoc && (contDoc as any).containerNumber) resolvedContainerNumber = (contDoc as any).containerNumber;
          }
        } catch {}
      }

      // Ensure commodity is never blank
      let resolvedCommodity = String(commodity || '').trim();
      if (!resolvedCommodity) {
        try {
          const sh = await Shipment.findOne({ receipt: String(receipt).trim() }).select('commodity english').lean();
          resolvedCommodity = (sh as any)?.commodity || (sh as any)?.english || '';
          if (!resolvedCommodity) {
            const wr = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() }).select('commodity').lean();
            resolvedCommodity = (wr as any)?.commodity || '';
          }
        } catch {}
      }
      if (!resolvedCommodity) resolvedCommodity = 'COMMERCIAL GOODS';

      // Create new DispatchRequest with Container Number marked
      const newRequest = await DispatchRequest.create({
        receipt: String(receipt).trim(),
        container: resolvedContainer,
        containerNumber: resolvedContainerNumber,
        marka: String(marka || '').trim(),
        party: String(party || '').trim(),
        commodity: resolvedCommodity,
        vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
        cartonCount: ctn,
        totalCartons: Number(totalCartons) || ctn,
        place: String(place).trim(),
        status: 'Pending',
        initiatedBy: currentUser.username,
        initiatedByName: currentUser.name || currentUser.username,
        initiatedAt: new Date(),
        remarks: String(remarks || '').trim(),
      });

      return NextResponse.json({
        success: true,
        message: 'Dispatch request sent to Biller successfully.',
        request: newRequest,
      });
    }

    // ACTION: SELF BILL (Dispatcher creates billing directly - खुद से बिलिंग बनाएँ)
    if (action === 'self_bill') {
      const {
        receipt,
        container,
        marka,
        party,
        commodity,
        vehicleNumber,
        cartonCount,
        place,
        taxableValue,
        igstRate,
      } = body;

      if (!receipt || !vehicleNumber || !cartonCount || !place) {
        return NextResponse.json(
          { error: 'Receipt, Gaadi Number, Carton Count, and Place are required for self-billing.' },
          { status: 400 }
        );
      }

      // HOLD CHECK: Check if item is on Hold
      const wrCheckSelf = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() }).lean();
      const shCheckSelf = await Shipment.findOne({ receipt: String(receipt).trim() }).lean();
      const isHoldSelf = (wrCheckSelf as any)?.salesStatus === 'Hold' || (shCheckSelf as any)?.salesStatus === 'Hold';
      if (isHoldSelf) {
        const reason = (wrCheckSelf as any)?.holdReason || (shCheckSelf as any)?.holdReason || 'Put on hold by Sales/Admin';
        return NextResponse.json(
          { error: `यह माल होल्ड पर है (${reason})। होल्ड माल का डिस्पैच या बिलिंग नहीं की जा सकती।` },
          { status: 400 }
        );
      }

      const ctn = Number(cartonCount);
      const taxVal = Number(taxableValue) || 1000;
      const igstPct = Number(igstRate) || 18;
      const igstAmt = Number(((taxVal * igstPct) / 100).toFixed(2));
      const grandTotal = Number((taxVal + igstAmt).toFixed(2));

      // Auto generate invoice number
      const billNumber = generateInvoiceNumberFromReceipt(String(receipt).trim());

      // Fetch default seller
      const defaultSeller: any = await Seller.findOne({ isDefault: true }).lean();

      const newBill = await Bill.create({
        billNumber,
        receipt: String(receipt).trim(),
        container: String(container || '').trim(),
        party: String(party || '').trim(),
        mainMarka: String(marka || '').trim(),
        commodity: String(commodity || 'General Cargo').trim(),
        hsnCode: '996511',
        billingUnit: 'Cartons',
        totalCartons: ctn,
        dispatchedCartons: ctn,
        remainingCartons: 0,
        taxableValue: taxVal,
        igst: igstPct,
        igstAmount: igstAmt,
        totalAmount: grandTotal,
        vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
        deliveryAddress: String(place).trim(),
        isDispatched: true,
        dispatchStatus: 'Dispatched',
        deliveryDate: new Date().toISOString().slice(0, 10),
        deliveryTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        sellerName: defaultSeller?.name || 'US INTERNATIONAL',
        sellerGstin: defaultSeller?.gstin || '',
        sellerAddress: defaultSeller?.address || 'Delhi, India',
        purchaserName: party || marka || 'Purchaser',
        items: [
          {
            itemNo: 1,
            description: commodity || 'General Cargo',
            hsnCode: '996511',
            quantity: ctn,
            unit: 'Cartons',
            rate: Math.round(taxVal / ctn),
            amount: taxVal,
          },
        ],
      });

      // Also record DispatchRequest as Completed
      const completedRequest = await DispatchRequest.create({
        receipt: String(receipt).trim(),
        container: String(container || '').trim(),
        marka: String(marka || '').trim(),
        party: String(party || '').trim(),
        commodity: String(commodity || '').trim(),
        vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
        cartonCount: ctn,
        totalCartons: ctn,
        place: String(place).trim(),
        status: 'Billed',
        billId: String(newBill._id),
        billNumber: newBill.billNumber,
        billerUsername: currentUser.username,
        billedAt: new Date(),
        initiatedBy: currentUser.username,
        initiatedByName: currentUser.name || currentUser.username,
        initiatedAt: new Date(),
      });

      return NextResponse.json({
        success: true,
        message: 'Self-bill generated successfully.',
        bill: newBill,
        request: completedRequest,
      });
    }

    // ACTION: COMPLETE / MARK BILLED (Called by Biller)
    if (action === 'mark_billed') {
      const { requestId, billId, billNumber } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reqDoc = await DispatchRequest.findById(requestId);
      if (!reqDoc) {
        return NextResponse.json({ error: 'Dispatch request not found' }, { status: 404 });
      }

      reqDoc.status = 'Billed';
      reqDoc.billerUsername = currentUser.username;
      reqDoc.billId = billId || '';
      reqDoc.billNumber = billNumber || '';
      reqDoc.billedAt = new Date();
      await reqDoc.save();

      return NextResponse.json({
        success: true,
        message: 'Request marked as billed.',
        request: reqDoc,
      });
    }

    // ACTION: DELETE DISPATCH REQUEST (डिस्पैचर अपनी रिक्वेस्ट डिलीट कर सकता है)
    if (action === 'delete_request') {
      const { requestId } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reqToDelete = await DispatchRequest.findById(requestId);
      if (!reqToDelete) {
        return NextResponse.json({ error: 'Dispatch request not found' }, { status: 404 });
      }

      await DispatchRequest.findByIdAndDelete(requestId);

      return NextResponse.json({
        success: true,
        message: 'डिस्पैच अनुरोध सफलतापूर्वक डिलीट कर दिया गया है। (Dispatch request deleted successfully.)',
      });
    }

    // ACTION: MARK CONTAINER UNLOAD STATUS (कंटेनर अनलोडिंग स्थिति: Not In Container, Partly Sent, Fully Sent, Stored in Warehouse)
    if (action === 'mark_unload_status') {
      const {
        receipt,
        unloadStatus, // 'fully_sent' | 'partly_sent' | 'not_in_container' | 'stored_in_warehouse'
        sentQuantity, // cartons sent to party
        remarks,
      } = body;

      if (!receipt || !unloadStatus) {
        return NextResponse.json({ error: 'Receipt number and unloadStatus are required.' }, { status: 400 });
      }

      const wr = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() });
      if (!wr) {
        return NextResponse.json({ error: 'Warehouse receipt not found.' }, { status: 404 });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const totalQty = wr.quantity || 0;
      let sent = 0;
      let inWarehouse = 0;
      let isDelivered = false;

      if (unloadStatus === 'fully_sent') {
        sent = totalQty;
        inWarehouse = 0;
        isDelivered = true;
        wr.remainingQuantity = 0;
        wr.isDelivered = true;
        wr.status = 'Delivered';
        wr.stockstatus = 'Delivered';
        wr.goodsReceivedStatus = 'full';
        wr.receivedQuantity = totalQty;
        wr.deliveryDate = todayStr;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Unload] Fully Sent: All ${totalQty} CTN dispatched directly to party${remarks ? ': ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      } else if (unloadStatus === 'partly_sent') {
        sent = Number(sentQuantity) || 0;
        if (sent <= 0 || sent > totalQty) {
          return NextResponse.json(
            { error: `भेजे गए कार्टून 1 से ${totalQty} के बीच होने चाहिए।` },
            { status: 400 }
          );
        }
        inWarehouse = Math.max(0, totalQty - sent);
        isDelivered = inWarehouse === 0;
        wr.remainingQuantity = inWarehouse;
        wr.isDelivered = isDelivered;
        wr.status = isDelivered ? 'Delivered' : 'Partially Delivered';
        wr.stockstatus = inWarehouse > 0 ? 'In Stock (Warehouse)' : 'Delivered';
        wr.goodsReceivedStatus = 'partial';
        wr.receivedQuantity = sent;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Unload] Partly Sent: ${sent} CTN sent to party | ${inWarehouse} CTN moved to Indian Warehouse Stock${remarks ? ' - ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      } else if (unloadStatus === 'not_in_container') {
        sent = 0;
        inWarehouse = 0;
        isDelivered = false;
        wr.remainingQuantity = totalQty; // preserved for records
        wr.goodsReceivedStatus = 'not_received';
        wr.receivedQuantity = 0;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Unload SHORTAGE] Not In Container: Listed in manifest but physically missing from container!${remarks ? ' Notes: ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      } else if (unloadStatus === 'stored_in_warehouse') {
        sent = 0;
        inWarehouse = totalQty;
        isDelivered = false;
        wr.remainingQuantity = totalQty;
        wr.status = 'Received in Warehouse';
        wr.stockstatus = 'In Stock';
        wr.goodsReceivedStatus = 'not_received';
        wr.receivedQuantity = 0;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Unload] Stored in Warehouse: All ${totalQty} CTN unloaded & securely stored in warehouse${remarks ? ': ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      }

      wr.unloadStatus = unloadStatus;
      wr.sentQuantity = sent;
      wr.warehouseQuantity = inWarehouse;
      wr.unloadRemarks = String(remarks || '').trim();
      wr.unloadedAt = new Date();
      wr.unloadedBy = currentUser.username;
      wr.lastModifiedBy = currentUser.username;
      wr.lastModifiedByRole = currentUser.role;
      wr.updatedAt = new Date();
      await wr.save();

      // Update matching Shipment
      await Shipment.updateMany(
        { receipt: wr.receipt },
        {
          $set: {
            unloadStatus,
            sentQuantity: sent,
            warehouseQuantity: inWarehouse,
            unloadRemarks: wr.unloadRemarks,
            unloadedAt: wr.unloadedAt,
            unloadedBy: wr.unloadedBy,
            goodsReceivedStatus: wr.goodsReceivedStatus,
            receivedQuantity: sent,
            isDelivered,
            deliveryDate: isDelivered ? todayStr : undefined,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message:
          unloadStatus === 'fully_sent'
            ? `✓ रसीद ${wr.receipt}: पूरा माल (${sent} CTN) भेजा गया।`
            : unloadStatus === 'partly_sent'
            ? `✓ रसीद ${wr.receipt}: ${sent} CTN भेजा गया, शेष ${inWarehouse} CTN वेयरहाउस में जमा।`
            : unloadStatus === 'not_in_container'
            ? `⚠️ रसीद ${wr.receipt}: कंटेनर में नहीं मिला (Shortage दर्ज कर ली गई है)।`
            : `✓ रसीद ${wr.receipt}: पूरा माल (${inWarehouse} CTN) वेयरहाउस में जमा।`,
        unloadStatus,
        sentQuantity: sent,
        warehouseQuantity: inWarehouse,
        remainingQuantity: wr.remainingQuantity,
        isDelivered,
      });
    }

    // ACTION: MARK GOODS RECEIVED BY PARTY (दिन के अंत में माल प्राप्ति स्थिति - Full / Not Full / Partial)
    if (action === 'mark_goods_received') {
      const {
        receipt,
        receivedType, // 'full' | 'partial' | 'not_received'
        receivedQuantity, // cartons received (for partial)
        remarks,
      } = body;

      if (!receipt) {
        return NextResponse.json({ error: 'Receipt number is required' }, { status: 400 });
      }

      const wr = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() });
      if (!wr) {
        return NextResponse.json({ error: 'Warehouse receipt not found' }, { status: 404 });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const currentRemaining = wr.remainingQuantity ?? wr.quantity ?? 0;
      let newRemaining = currentRemaining;
      let isDelivered = false;

      if (receivedType === 'full') {
        newRemaining = 0;
        isDelivered = true;
        wr.remainingQuantity = 0;
        wr.isDelivered = true;
        wr.status = 'Delivered';
        wr.stockstatus = 'Delivered';
        wr.deliveryDate = todayStr;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Day-End] Full Delivery Received by Party${remarks ? ': ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      } else if (receivedType === 'partial') {
        const receivedCtn = Number(receivedQuantity) || 0;
        if (receivedCtn <= 0) {
          return NextResponse.json(
            { error: 'Please enter a valid received quantity greater than 0.' },
            { status: 400 }
          );
        }
        newRemaining = Math.max(0, currentRemaining - receivedCtn);
        isDelivered = newRemaining === 0;
        wr.remainingQuantity = newRemaining;
        wr.isDelivered = isDelivered;
        wr.status = isDelivered ? 'Delivered' : 'Partially Delivered';
        wr.stockstatus = isDelivered ? 'Delivered' : 'Partially Delivered';
        wr.deliveryDate = todayStr;
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Day-End] Partial Received: ${receivedCtn} CTN received (${newRemaining} CTN remaining)${remarks ? ' - ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      } else if (receivedType === 'not_received') {
        wr.remarks = [
          wr.remarks,
          `[${todayStr} Day-End] Goods Not Received by Party${remarks ? ': ' + remarks : ''}`,
        ].filter(Boolean).join(' | ');
      }

      wr.goodsReceivedStatus = receivedType;
      wr.receivedQuantity = receivedType === 'partial' ? Number(receivedQuantity) : (receivedType === 'full' ? (Number(wr.quantity) || currentRemaining) : 0);
      wr.goodsReceivedRemarks = String(remarks || '').trim();
      wr.goodsReceivedAt = new Date();
      wr.goodsReceivedBy = currentUser.username;
      wr.lastModifiedBy = currentUser.username;
      wr.lastModifiedByRole = currentUser.role;
      wr.updatedAt = new Date();
      await wr.save();

      // Also update matching Shipment
      await Shipment.updateMany(
        { receipt: wr.receipt },
        {
          $set: {
            goodsReceivedStatus: receivedType,
            receivedQuantity: wr.receivedQuantity,
            goodsReceivedRemarks: wr.goodsReceivedRemarks,
            goodsReceivedAt: wr.goodsReceivedAt,
            goodsReceivedBy: wr.goodsReceivedBy,
            isDelivered,
            deliveryDate: isDelivered ? todayStr : undefined,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message:
          receivedType === 'full'
            ? `✓ रसीद ${wr.receipt} को पूर्ण प्राप्त (Full Delivered) मार्क कर दिया गया है।`
            : receivedType === 'partial'
            ? `✓ रसीद ${wr.receipt} को आंशिक प्राप्त (${Number(receivedQuantity)} CTN) मार्क किया गया। शेष: ${newRemaining} CTN`
            : `✓ रसीद ${wr.receipt} की माल प्राप्ति स्थिति अपडेट कर दी गई।`,
        receipt: wr.receipt,
        remainingQuantity: newRemaining,
        isDelivered,
        status: wr.status,
      });
    }

    // ACTION: CLOSE CONTAINER & UPDATE STOCK (कंटेनर क्लोज़ व स्टॉक रीकंसाइलेशन)
    if (action === 'close_container_stock') {
      const { container, containerNumber, receipts } = body;
      if (!container && !containerNumber) {
        return NextResponse.json({ error: 'Container alias or number is required' }, { status: 400 });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const updatedReceiptResults: any[] = [];

      if (Array.isArray(receipts)) {
        for (const item of receipts) {
          const {
            receipt,
            stockDestination, // 'party' | 'warehouse'
            deliveryStatus,   // 'fully_delivered' | 'partly_delivered' | 'undelivered'
            deliveredQuantity, // number (for partly delivered)
            goodsReceivedByParty, // boolean (true = received by party, false = not received)
            remarks,
          } = item;

          if (!receipt) continue;
          const wr = await WarehouseReceipt.findOne({ receipt: String(receipt).trim() });
          if (!wr) continue;

          const currentRemaining = wr.remainingQuantity ?? wr.quantity ?? 0;
          let newRemaining = currentRemaining;
          let isDelivered = false;

          if (deliveryStatus === 'fully_delivered') {
            newRemaining = 0;
            isDelivered = true;
            wr.remainingQuantity = 0;
            wr.isDelivered = true;
            wr.status = 'Delivered';
            wr.stockstatus = 'Delivered';
            wr.deliveryDate = todayStr;
          } else if (deliveryStatus === 'partly_delivered') {
            const deliveredCtn = Number(deliveredQuantity) || 0;
            newRemaining = Math.max(0, currentRemaining - deliveredCtn);
            isDelivered = newRemaining === 0;
            wr.remainingQuantity = newRemaining;
            wr.isDelivered = isDelivered;
            wr.status = isDelivered ? 'Delivered' : 'Partially Delivered';
            wr.stockstatus = isDelivered ? 'Delivered' : 'Partially Delivered';
            wr.deliveryDate = todayStr;
          } else if (deliveryStatus === 'undelivered') {
            isDelivered = false;
            wr.status = 'Partially Loaded';
          }

          const goodsTag = goodsReceivedByParty ? 'Goods Received by Party' : 'Goods Received Not by Party';
          const destTag = stockDestination === 'party' ? 'Direct to Party' : 'Sent to Warehouse';

          wr.remarks = [
            wr.remarks,
            `[Container Close ${container || containerNumber}] ${destTag} | ${goodsTag}${remarks ? ': ' + remarks : ''}`,
          ].filter(Boolean).join(' | ');

          wr.lastModifiedBy = currentUser.username;
          wr.lastModifiedByRole = currentUser.role;
          wr.updatedAt = new Date();
          await wr.save();

          if (isDelivered) {
            await Shipment.updateMany(
              { receipt: wr.receipt },
              { $set: { isDelivered: true, deliveryDate: todayStr } }
            );
          }

          updatedReceiptResults.push({
            receipt: wr.receipt,
            remainingQuantity: newRemaining,
            isDelivered,
            destination: destTag,
            goodsReceived: goodsTag,
          });
        }
      }

      const cleanContainer = String(container || containerNumber).trim();
      await Container.updateMany(
        { $or: [{ container: cleanContainer }, { containerNumber: cleanContainer }] },
        {
          $set: {
            isDelivered: true,
            status: 'Delivered',
            deliveryDate: todayStr,
          },
          $push: {
            remarks: {
              date: todayStr,
              remarks: `Container Closed & Stock Reconciled by ${currentUser.username} (${updatedReceiptResults.length} receipts updated)`,
              createdAt: new Date(),
              createdBy: currentUser.username,
            },
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: `✓ कंटेनर ${cleanContainer} सफलतापूर्वक क्लोज़ हो गया और सभी स्टॉक अपडेट हो गए।`,
        updatedCount: updatedReceiptResults.length,
        receipts: updatedReceiptResults,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in Dispatcher API POST:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get('id') || searchParams.get('requestId');
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const reqToDelete = await DispatchRequest.findById(requestId);
    if (!reqToDelete) {
      return NextResponse.json({ error: 'Dispatch request not found.' }, { status: 404 });
    }

    await DispatchRequest.findByIdAndDelete(requestId);

    return NextResponse.json({
      success: true,
      message: 'डिस्पैच अनुरोध सफलतापूर्वक डिलीट कर दिया गया है। (Dispatch request deleted successfully.)',
    });
  } catch (error: any) {
    console.error('Error in Dispatcher API DELETE:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
