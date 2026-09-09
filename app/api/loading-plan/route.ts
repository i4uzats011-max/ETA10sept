import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import { fetchContainerTracking } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';

// GET: Fetch loading plans and their manifest items
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // Fetch all containers / loading plans
    const containers = await Container.find({}).sort({ updatedAt: -1, container: 1 }).lean();

    // Fetch all shipments grouped by container
    const containerAliases = containers.map((c) => c.container);
    const shipments = await Shipment.find({
      container: { $in: containerAliases },
    })
      .sort({ createdAt: -1 })
      .lean();

    const shipmentMap = new Map<string, any[]>();
    for (const s of shipments) {
      const key = (s.container || '').toUpperCase().trim();
      if (!shipmentMap.has(key)) shipmentMap.set(key, []);
      shipmentMap.get(key)!.push(s);
    }

    const plans = containers.map((c: any) => {
      const key = (c.container || '').toUpperCase().trim();
      const items = shipmentMap.get(key) || [];

      let totalQty = 0;
      for (const item of items) {
        const q = parseInt(String(item.quantity || 0), 10);
        if (!isNaN(q)) totalQty += q;
      }

      return {
        _id: c._id,
        container: c.container, // Internal container alias / plan number
        containerNumber: c.containerNumber || '',
        shippingLine: c.shippingLine || 'MSC',
        warehouse: c.warehouse || 'China Warehouse',
        planStatus: c.planStatus || (c.containerNumber ? 'Finalized' : 'Planning'),
        isFinalized: Boolean(c.isFinalized || (c.containerNumber && c.containerNumber.trim().length > 0)),
        finalizedAt: c.finalizedAt,
        allottedActualAt: c.allottedActualAt,
        loadingDate: c.loadingDate || '',
        shippedTo: c.shippedTo || 'Nhava Sheva / Mundra, India',
        deliveryDate: c.deliveryDate || '',
        daysToDeliver: c.daysToDeliver !== undefined ? c.daysToDeliver : null,
        isDelivered: Boolean(c.isDelivered),
        eta: c.destinationDate || c.eta || 'Pending',
        destinationDate: c.destinationDate || c.eta || 'N/A',
        status: c.status || 'Pending',
        shipmentCount: items.length,
        totalQuantity: totalQty || c.totalQuantity || 0,
        totalWeight: c.totalWeight || '',
        totalVolume: c.totalVolume || '',
        items: items.map((i: any) => ({
          _id: i._id,
          receipt: i.receipt,
          party: i.party || '',
          container: i.container,
          containerNumber: i.containerNumber,
          shippingLine: i.shippingLine,
          quantity: i.quantity,
          originalTotalQuantity: i.originalTotalQuantity || i.quantity,
          isSplit: Boolean(i.isSplit),
          splitIndex: i.splitIndex || 1,
          weight: i.weight,
          volume: i.volume,
          commodity: i.commodity,
          chinese: i.chinese,
          english: i.english,
          packaging: i.packaging,
          mainMarka: i.mainMarka,
          subMarka: i.subMarka,
          warehouse: i.warehouse,
          date: i.date,
          loadingDate: i.loadingDate || c.loadingDate || '',
          deliveryDate: i.deliveryDate || c.deliveryDate || '',
          daysToDeliver: i.daysToDeliver !== undefined ? i.daysToDeliver : null,
          isDelivered: Boolean(i.isDelivered),
          eta: i.eta,
          status: i.status,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch loading plans' }, { status: 500 });
  }
}

// POST: Execute Loading Plan Actions
export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    await connectToDatabase();

    // ----------------------------------------------------
    // Action 1: Create Loading Plan (Internal Container)
    // ----------------------------------------------------
    if (action === 'create-plan') {
      const { container, warehouse, notes } = body;
      const cleanContainer = (container || '').trim().toUpperCase();

      if (!cleanContainer) {
        return NextResponse.json({ error: 'Internal Container / Plan identifier is required' }, { status: 400 });
      }

      const existing = await Container.findOne({
        container: new RegExp(`^${cleanContainer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (existing) {
        return NextResponse.json(
          { error: `A loading plan or container with alias '${cleanContainer}' already exists` },
          { status: 400 }
        );
      }

      const cleanWarehouse = (warehouse || 'China Warehouse').trim();

      const newPlan = await Container.create({
        container: cleanContainer,
        planNumber: cleanContainer,
        containerNumber: '',
        shippingLine: 'MSC',
        warehouse: cleanWarehouse,
        planStatus: 'Planning',
        isFinalized: false,
        shippedFrom: `${cleanWarehouse}, China`,
        shippedTo: 'Nhava Sheva / Mundra, India',
        currentLocation: `Planned at ${cleanWarehouse}`,
        status: 'Planning',
        eta: 'Pending',
        destinationDate: 'N/A',
        totalQuantity: 0,
        shipmentCount: 0,
      });

      return NextResponse.json({
        success: true,
        message: `Loading plan '${cleanContainer}' initialized for ${cleanWarehouse}`,
        plan: newPlan,
      });
    }

    // ----------------------------------------------------
    // Action 2: Split and Allocate Cargo into Container
    // ----------------------------------------------------
    if (action === 'allocate-split') {
      const { receipt, container, quantityToLoad, weightToLoad, volumeToLoad } = body;
      const cleanReceipt = (receipt || '').trim();
      const cleanContainer = (container || '').trim();
      const qtyToLoad = parseInt(String(quantityToLoad), 10);

      if (!cleanReceipt || !cleanContainer) {
        return NextResponse.json({ error: 'Receipt and Container alias are required' }, { status: 400 });
      }

      if (isNaN(qtyToLoad) || qtyToLoad <= 0) {
        return NextResponse.json({ error: 'Quantity to load must be a positive number greater than 0' }, { status: 400 });
      }

      // 1. Fetch Target Loading Plan / Container
      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanContainer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Loading plan / container '${cleanContainer}' not found` }, { status: 404 });
      }

      // 2. Fetch Warehouse Receipt Stock
      let whReceipt = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!whReceipt) {
        // Auto-create receipt if it didn't exist in WarehouseReceipt yet
        whReceipt = await WarehouseReceipt.create({
          receipt: cleanReceipt,
          warehouse: targetContainer.warehouse || 'China Warehouse',
          quantity: qtyToLoad,
          loadedQuantity: 0,
          remainingQuantity: qtyToLoad,
          status: 'Received',
          stockstatus: 'In Stock',
          uploadedAt: new Date(),
        });
      }

      const availableQty = whReceipt.remainingQuantity !== undefined ? whReceipt.remainingQuantity : (whReceipt.quantity - (whReceipt.loadedQuantity || 0));

      if (qtyToLoad > availableQty) {
        return NextResponse.json(
          {
            error: `Cannot load ${qtyToLoad} units. Only ${availableQty} units remaining in warehouse for receipt '${cleanReceipt}'`,
          },
          { status: 400 }
        );
      }

      // Count existing split items for this receipt
      const existingSplitsCount = await Shipment.countDocuments({
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      const isSplitOperation = qtyToLoad < whReceipt.quantity || existingSplitsCount > 0;

      // 3. Create Shipment allocation record
      const newShipment = await Shipment.create({
        receipt: whReceipt.receipt,
        receiptId: whReceipt._id,
        container: targetContainer.container,
        containerNumber: targetContainer.containerNumber || '',
        shippingLine: targetContainer.shippingLine || 'MSC',
        quantity: String(qtyToLoad),
        originalTotalQuantity: String(whReceipt.quantity),
        isSplit: isSplitOperation,
        splitIndex: existingSplitsCount + 1,
        weight: weightToLoad || whReceipt.weight || '',
        volume: volumeToLoad || whReceipt.volume || '',
        commodity: whReceipt.commodity || '',
        chinese: whReceipt.chinese || '',
        english: whReceipt.english || '',
        packaging: whReceipt.packaging || '',
        mainMarka: whReceipt.mainMarka || '',
        subMarka: whReceipt.subMarka || '',
        warehouse: whReceipt.warehouse || targetContainer.warehouse || 'China Warehouse',
        warehouseEntry: whReceipt.warehouseEntry || '',
        date: whReceipt.date || '',
        eta: targetContainer.destinationDate || targetContainer.eta || 'Pending',
        status: targetContainer.status || 'Planning',
        uploadedAt: new Date(),
      });

      // 4. Update Warehouse Receipt loaded & remaining quantities
      whReceipt.loadedQuantity = (whReceipt.loadedQuantity || 0) + qtyToLoad;
      whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
      if (whReceipt.remainingQuantity === 0) {
        whReceipt.status = 'Fully Loaded';
        whReceipt.stockstatus = 'Dispatched';
      } else {
        whReceipt.status = 'Partially Loaded';
        whReceipt.stockstatus = 'Partially Dispatched';
      }
      await whReceipt.save();

      // 5. Update Container shipment count & total quantity
      targetContainer.shipmentCount = (targetContainer.shipmentCount || 0) + 1;
      targetContainer.totalQuantity = (targetContainer.totalQuantity || 0) + qtyToLoad;
      await targetContainer.save();

      return NextResponse.json({
        success: true,
        message: `Loaded ${qtyToLoad} units of receipt '${whReceipt.receipt}' into ${targetContainer.container}. (${whReceipt.remainingQuantity} remaining in warehouse)`,
        shipment: newShipment,
        receipt: whReceipt,
      });
    }

    // ----------------------------------------------------
    // Action 3: Deallocate Cargo from Loading Plan
    // ----------------------------------------------------
    if (action === 'deallocate') {
      const { shipmentId } = body;
      if (!shipmentId) {
        return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 });
      }

      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        return NextResponse.json({ error: 'Shipment allocation record not found' }, { status: 404 });
      }

      const qtyRestored = parseInt(String(shipment.quantity || 0), 10) || 0;
      const receiptNum = shipment.receipt;
      const containerAlias = shipment.container;

      // Restore quantity in Warehouse Receipt
      const whReceipt = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${receiptNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (whReceipt) {
        whReceipt.loadedQuantity = Math.max(0, (whReceipt.loadedQuantity || 0) - qtyRestored);
        whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
        if (whReceipt.loadedQuantity <= 0) {
          whReceipt.status = 'Received';
          whReceipt.stockstatus = 'In Stock';
        } else {
          whReceipt.status = 'Partially Loaded';
          whReceipt.stockstatus = 'Partially Dispatched';
        }
        await whReceipt.save();
      }

      // Update Container count
      await Container.findOneAndUpdate(
        { container: containerAlias },
        {
          $inc: {
            shipmentCount: -1,
            totalQuantity: -qtyRestored,
          },
        }
      );

      // Delete the Shipment allocation record
      await Shipment.findByIdAndDelete(shipmentId);

      return NextResponse.json({
        success: true,
        message: `Removed ${qtyRestored} units of '${receiptNum}' from ${containerAlias}. Restored to warehouse stock.`,
        receipt: whReceipt,
      });
    }

    // ----------------------------------------------------
    // Action 4: Finalize Plan & Allot Actual Container
    // ----------------------------------------------------
    if (action === 'finalize-and-allot') {
      const { container, containerNumber, shippingLine, loadingDate, shippedTo, autoSync } = body;
      const cleanAlias = (container || '').trim();
      const cleanNum = (containerNumber || '').trim();
      const cleanCarrier = (shippingLine || 'MSC').trim();
      const cleanLoadingDate = (loadingDate || '').trim();
      const cleanShippedTo = (shippedTo || '').trim();

      if (!cleanAlias) {
        return NextResponse.json({ error: 'Internal Container alias is required' }, { status: 400 });
      }

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Loading plan '${cleanAlias}' not found` }, { status: 404 });
      }

      let trackingEta = targetContainer.eta || 'Pending';
      let trackingStatus = 'In Transit';
      let trackingDetails: any = null;

      // If autoSync requested and container number provided, fetch live carrier ETA
      if (autoSync && cleanNum) {
        try {
          const tracking = await fetchContainerTracking(cleanNum, cleanCarrier);
          if (tracking.eta && tracking.eta !== 'N/A') {
            trackingEta = tracking.eta;
          }
          if (tracking.status) {
            trackingStatus = tracking.status;
          }
          trackingDetails = tracking.dataDetails;
        } catch {
          // Fallback gracefully without breaking allotment
        }
      }

      const now = new Date();

      targetContainer.containerNumber = cleanNum;
      targetContainer.shippingLine = cleanCarrier;
      if (cleanLoadingDate) {
        targetContainer.loadingDate = cleanLoadingDate;
        targetContainer.startDate = cleanLoadingDate;
      }
      if (cleanShippedTo) {
        targetContainer.shippedTo = cleanShippedTo;
      }
      targetContainer.planStatus = 'Finalized';
      targetContainer.isFinalized = true;
      targetContainer.finalizedAt = targetContainer.finalizedAt || now;
      targetContainer.allottedActualAt = now;
      targetContainer.status = trackingStatus;
      if (trackingEta && trackingEta !== 'Pending') {
        targetContainer.eta = trackingEta;
        targetContainer.destinationDate = trackingEta;
      }
      if (trackingDetails) {
        targetContainer.jsonCargoData = trackingDetails;
        targetContainer.lastApiSync = now;
      }
      await targetContainer.save();

      // Update all shipment items under this container
      const updateShipmentPayload: Record<string, any> = {
        containerNumber: cleanNum,
        shippingLine: cleanCarrier,
        status: trackingStatus,
      };
      if (cleanLoadingDate) {
        updateShipmentPayload.loadingDate = cleanLoadingDate;
        updateShipmentPayload.startDate = cleanLoadingDate;
      }
      if (cleanShippedTo) {
        updateShipmentPayload.shippedTo = cleanShippedTo;
      }
      if (trackingEta && trackingEta !== 'Pending') {
        updateShipmentPayload.eta = trackingEta;
        updateShipmentPayload.destinationDate = trackingEta;
      }
      if (trackingDetails) {
        updateShipmentPayload.jsonCargoData = trackingDetails;
        updateShipmentPayload.lastApiSync = now;
      }

      const updateResult = await Shipment.updateMany(
        { container: targetContainer.container },
        { $set: updateShipmentPayload }
      );

      return NextResponse.json({
        success: true,
        message: `Plan '${cleanAlias}' finalized. Allotted actual container '${cleanNum}' (${cleanCarrier})${cleanLoadingDate ? ` loaded on ${cleanLoadingDate}` : ''} across ${updateResult.modifiedCount} cargo items.`,
        plan: targetContainer,
      });
    }

    // ----------------------------------------------------
    // Action 5: Mark Container / Shipments as Delivered
    // ----------------------------------------------------
    if (action === 'mark-delivered') {
      const { container, deliveryDate } = body;
      const cleanAlias = (container || '').trim();
      const cleanDeliveryDate = (deliveryDate || new Date().toISOString().split('T')[0]).trim();

      if (!cleanAlias) {
        return NextResponse.json({ error: 'Container identifier is required' }, { status: 400 });
      }

      const targetContainer = await Container.findOne({
        $or: [
          { container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { containerNumber: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Container '${cleanAlias}' not found` }, { status: 404 });
      }

      // Calculate days to deliver
      let daysToDeliver: number | null = null;
      const originDateStr = targetContainer.loadingDate || targetContainer.startDate || targetContainer.createdAt;
      if (originDateStr && cleanDeliveryDate) {
        try {
          const dOrigin = new Date(originDateStr).getTime();
          const dDelivery = new Date(cleanDeliveryDate).getTime();
          if (!isNaN(dOrigin) && !isNaN(dDelivery) && dDelivery >= dOrigin) {
            daysToDeliver = Math.round((dDelivery - dOrigin) / (1000 * 60 * 60 * 24));
          }
        } catch {
          // ignore calculation error
        }
      }

      targetContainer.deliveryDate = cleanDeliveryDate;
      targetContainer.daysToDeliver = daysToDeliver;
      targetContainer.isDelivered = true;
      targetContainer.status = 'Delivered';
      targetContainer.planStatus = 'Delivered';
      await targetContainer.save();

      // Update all shipments under this container
      await Shipment.updateMany(
        { container: targetContainer.container },
        {
          $set: {
            deliveryDate: cleanDeliveryDate,
            daysToDeliver,
            isDelivered: true,
            status: 'Delivered',
          },
        }
      );

      // Find all receipts affected and update WarehouseReceipt
      const affectedShipments = await Shipment.find({ container: targetContainer.container }).lean();
      const affectedReceipts = Array.from(new Set(affectedShipments.map((s) => s.receipt).filter(Boolean)));
      for (const r of affectedReceipts) {
        await WarehouseReceipt.findOneAndUpdate(
          { receipt: r },
          {
            $set: {
              deliveryDate: cleanDeliveryDate,
              isDelivered: true,
              status: 'Delivered',
              stockstatus: 'Delivered',
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Container '${targetContainer.container}' marked as DELIVERED on ${cleanDeliveryDate}${daysToDeliver !== null ? ` (${daysToDeliver} days turnaround)` : ''}.`,
        plan: targetContainer,
      });
    }

    return NextResponse.json({ error: `Invalid action '${action}'` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Loading plan operation failed' }, { status: 500 });
  }
}
