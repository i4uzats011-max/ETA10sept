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

    // SECTION 2: DELIVERY (Delivered containers & receipts with 'Available to Deliver')
    if (section === 'delivery') {
      // Find delivered containers
      const deliveredContainers = await Container.find({ isDelivered: true })
        .select('container containerNumber deliveryDate status totalQuantity')
        .sort({ deliveryDate: -1 })
        .lean();

      // Find all warehouse receipts marked "Available to Deliver"
      const availableReceipts = await WarehouseReceipt.find({
        $or: [
          { salesStatus: 'Available to Deliver' },
          { isDelivered: true },
        ],
      })
        .select('receipt party warehouse date quantity loadedQuantity remainingQuantity weight volume commodity packaging mainMarka subMarka salesStatus salesPerson isDelivered deliveryDate phone partyPhone')
        .sort({ updatedAt: -1 })
        .limit(300)
        .lean();

      // Match each receipt with its container from Shipment if available
      const receiptNumbers = availableReceipts.map((r) => r.receipt).filter(Boolean);
      const matchingShipments = await Shipment.find({ receipt: { $in: receiptNumbers } })
        .select('receipt container containerNumber packages commodity english')
        .lean();

      const shipmentMap = new Map<string, any>();
      matchingShipments.forEach((s) => {
        shipmentMap.set(s.receipt, s);
      });

      const deliveryItems = availableReceipts.map((r) => {
        const sh = shipmentMap.get(r.receipt);
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
          salesStatus: r.salesStatus || (r.isDelivered ? 'Available to Deliver' : 'Normal'),
          isDelivered: Boolean(r.isDelivered),
          phone: r.phone || r.partyPhone || '',
        };
      });

      // Build distinct containers summary for dropdown
      const containerSummaryMap = new Map<string, { container: string; count: number; availableCount: number }>();
      deliveryItems.forEach((item) => {
        const c = item.container?.trim();
        if (c && c !== 'Unassigned') {
          const prev = containerSummaryMap.get(c) || { container: c, count: 0, availableCount: 0 };
          prev.count += 1;
          if (item.salesStatus === 'Available to Deliver') {
            prev.availableCount += 1;
          }
          containerSummaryMap.set(c, prev);
        }
      });
      const deliveryContainers = Array.from(containerSummaryMap.values()).sort((a, b) =>
        a.container.localeCompare(b.container)
      );

      return NextResponse.json({
        success: true,
        deliveredContainers,
        deliveryContainers,
        deliveryItems,
      });
    }

    // SECTION 3: BILLS (Bills generated for completed dispatches)
    if (section === 'bills') {
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

      // Create new DispatchRequest
      const newRequest = await DispatchRequest.create({
        receipt: String(receipt).trim(),
        container: String(container || '').trim(),
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

      wr.lastModifiedBy = currentUser.username;
      wr.lastModifiedByRole = currentUser.role;
      wr.updatedAt = new Date();
      await wr.save();

      // Also update matching Shipment
      if (isDelivered) {
        await Shipment.updateMany(
          { receipt: wr.receipt },
          { $set: { isDelivered: true, deliveryDate: todayStr } }
        );
      }

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
