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
        rawEta: c.rawEta || '',
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
          rawEta: i.rawEta || c.rawEta || '',
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
        return NextResponse.json(
          {
            error: `Receipt '${cleanReceipt}' has not been received in China warehouse stock yet. Goods must be received in warehouse inventory before they can be loaded into a container plan.`,
          },
          { status: 400 }
        );
      }

      if (!whReceipt.quantity || whReceipt.quantity <= 0) {
        return NextResponse.json(
          {
            error: `Cannot load cargo: No goods were received in China warehouse for receipt '${cleanReceipt}' (Received Quantity: 0). A container cannot be loaded without received goods.`,
          },
          { status: 400 }
        );
      }

      const availableQty = whReceipt.remainingQuantity !== undefined ? whReceipt.remainingQuantity : (whReceipt.quantity - (whReceipt.loadedQuantity || 0));

      if (availableQty <= 0) {
        return NextResponse.json(
          {
            error: `Receipt '${cleanReceipt}' is already fully loaded (${whReceipt.loadedQuantity} of ${whReceipt.quantity} CTN loaded). No remaining stock in China warehouse to load.`,
          },
          { status: 400 }
        );
      }

      if (qtyToLoad > availableQty) {
        return NextResponse.json(
          {
            error: `Strict Rule Violation: You cannot load more goods than received in China warehouse. Requested ${qtyToLoad} units, but only ${availableQty} units are remaining in stock for receipt '${cleanReceipt}' (Total received: ${whReceipt.quantity}, already loaded: ${whReceipt.loadedQuantity || 0}).`,
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

      // Strict Rule: Loading Date is mandatory when allotting actual carrier container
      if (!cleanLoadingDate) {
        return NextResponse.json(
          { error: 'Loading Date is mandatory when allotting actual carrier container number.' },
          { status: 400 }
        );
      }

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Loading plan '${cleanAlias}' not found` }, { status: 404 });
      }

      // Enforce Rule: A container cannot be finalized/loaded without received goods
      const loadedCargoCount = await Shipment.countDocuments({
        container: targetContainer.container,
      });

      if (loadedCargoCount === 0) {
        return NextResponse.json(
          {
            error: `Cannot load or finalize container '${cleanAlias}': No received goods have been loaded into this container. You cannot load any container without first receiving goods and allocating them into the container plan.`,
          },
          { status: 400 }
        );
      }

      let trackingEta = targetContainer.eta || 'Pending';
      let trackingRawEta = targetContainer.rawEta || '';
      let trackingStatus = 'In Transit';
      let trackingDetails: any = null;

      // If autoSync requested and container number provided, fetch live carrier ETA
      if (autoSync && cleanNum) {
        try {
          const tracking = await fetchContainerTracking(cleanNum, cleanCarrier);
          if (tracking.eta && tracking.eta !== 'N/A') {
            trackingEta = tracking.eta;
          }
          if (tracking.rawEta) {
            trackingRawEta = tracking.rawEta;
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
      targetContainer.loadingDate = cleanLoadingDate;
      targetContainer.startDate = cleanLoadingDate;
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
      if (trackingRawEta) {
        targetContainer.rawEta = trackingRawEta;
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
        loadingDate: cleanLoadingDate,
        startDate: cleanLoadingDate,
      };
      if (cleanShippedTo) {
        updateShipmentPayload.shippedTo = cleanShippedTo;
      }
      if (trackingEta && trackingEta !== 'Pending') {
        updateShipmentPayload.eta = trackingEta;
        updateShipmentPayload.destinationDate = trackingEta;
      }
      if (trackingRawEta) {
        updateShipmentPayload.rawEta = trackingRawEta;
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
        message: `Plan '${cleanAlias}' finalized. Allotted actual container '${cleanNum}' (${cleanCarrier}) loaded on ${cleanLoadingDate} across ${updateResult.modifiedCount} cargo items.`,
        plan: targetContainer,
      });
    }

    // ----------------------------------------------------
    // Action 5: Mark Container / Shipments as Delivered
    // ----------------------------------------------------
    if (action === 'mark-delivered') {
      const { container, deliveryDate, excludedReceipts } = body;
      const cleanAlias = (container || '').trim();
      const cleanDeliveryDate = (deliveryDate || '').trim();

      if (!cleanAlias) {
        return NextResponse.json({ error: 'Container identifier is required' }, { status: 400 });
      }

      // Strict Rule: Delivery Date is mandatory when marking cargo delivered
      if (!cleanDeliveryDate) {
        return NextResponse.json(
          { error: 'Delivery Date is mandatory when marking container / cargo as delivered.' },
          { status: 400 }
        );
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

      // Fetch all cargo shipments loaded in this container
      const containerShipments = await Shipment.find({ container: targetContainer.container });
      if (containerShipments.length === 0) {
        return NextResponse.json({ error: `No cargo shipments found in container '${targetContainer.container}' to deliver.` }, { status: 400 });
      }

      // Handle Excluded Receipts (Partial Delivery Exclusion)
      const excludedReceiptsSet = new Set<string>(
        Array.isArray(excludedReceipts)
          ? excludedReceipts.map((r: any) => String(r).trim().toLowerCase()).filter(Boolean)
          : []
      );

      const toDeliverShipments = containerShipments.filter(
        (s) => !excludedReceiptsSet.has(String(s.receipt || '').trim().toLowerCase())
      );
      const toExcludeShipments = containerShipments.filter(
        (s) => excludedReceiptsSet.has(String(s.receipt || '').trim().toLowerCase())
      );

      if (toDeliverShipments.length === 0) {
        return NextResponse.json(
          { error: 'All cargo receipts were excluded. At least one receipt must be selected for delivery.' },
          { status: 400 }
        );
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

      const isAllDelivered = toExcludeShipments.length === 0;

      // Update Container
      targetContainer.deliveryDate = cleanDeliveryDate;
      targetContainer.daysToDeliver = daysToDeliver;
      targetContainer.isDelivered = isAllDelivered;
      targetContainer.status = isAllDelivered ? 'Delivered' : 'Partially Delivered';
      targetContainer.planStatus = isAllDelivered ? 'Delivered' : 'Partially Delivered';
      await targetContainer.save();

      // Update Delivered Shipments
      const deliverIds = toDeliverShipments.map((s) => s._id);
      await Shipment.updateMany(
        { _id: { $in: deliverIds } },
        {
          $set: {
            deliveryDate: cleanDeliveryDate,
            daysToDeliver,
            isDelivered: true,
            status: 'Delivered',
          },
        }
      );

      // If any shipments were excluded, ensure they remain in transit / pending
      if (toExcludeShipments.length > 0) {
        const excludeIds = toExcludeShipments.map((s) => s._id);
        await Shipment.updateMany(
          { _id: { $in: excludeIds } },
          {
            $set: {
              deliveryDate: '',
              isDelivered: false,
              status: 'In Transit (Undelivered / Excluded)',
            },
          }
        );
      }

      // Update WarehouseReceipt records for delivered receipts
      const deliveredReceipts = Array.from(new Set(toDeliverShipments.map((s) => s.receipt).filter(Boolean)));
      for (const r of deliveredReceipts) {
        // Check if any split of this receipt is still undelivered
        const undeliveredCount = await Shipment.countDocuments({
          receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          isDelivered: { $ne: true },
        });

        if (undeliveredCount === 0) {
          await WarehouseReceipt.findOneAndUpdate(
            { receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            {
              $set: {
                deliveryDate: cleanDeliveryDate,
                isDelivered: true,
                status: 'Delivered',
                stockstatus: 'Delivered',
              },
            }
          );
        } else {
          await WarehouseReceipt.findOneAndUpdate(
            { receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            {
              $set: {
                status: 'Partially Delivered',
                stockstatus: 'Partially Delivered',
              },
            }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: isAllDelivered
          ? `Container '${targetContainer.container}' completely marked as DELIVERED on ${cleanDeliveryDate}${daysToDeliver !== null ? ` (${daysToDeliver} days turnaround)` : ''}.`
          : `Container '${targetContainer.container}' marked as PARTIALLY DELIVERED on ${cleanDeliveryDate}. (${toDeliverShipments.length} items delivered, ${toExcludeShipments.length} receipt items excluded and kept in transit).`,
        plan: targetContainer,
        deliveredCount: toDeliverShipments.length,
        excludedCount: toExcludeShipments.length,
      });
    }

    // ----------------------------------------------------
    // Action 6: De-map Actual Carrier Container from Plan
    // ----------------------------------------------------
    if (action === 'demap-actual') {
      const { container } = body;
      const cleanAlias = (container || '').trim();

      if (!cleanAlias) {
        return NextResponse.json({ error: 'Container identifier is required to de-map actual container' }, { status: 400 });
      }

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Container plan '${cleanAlias}' not found` }, { status: 404 });
      }

      const previousActual = targetContainer.containerNumber;

      targetContainer.containerNumber = '';
      targetContainer.allottedActualAt = null;
      targetContainer.planStatus = 'Planning';
      targetContainer.isFinalized = false;
      targetContainer.status = 'Planning';
      await targetContainer.save();

      // Update all shipment records under this internal container
      await Shipment.updateMany(
        { container: targetContainer.container },
        {
          $set: {
            containerNumber: '',
            status: 'Planning',
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: `Successfully de-mapped actual carrier container '${previousActual || 'Unassigned'}' from internal container '${cleanAlias}'. The container is now unallotted.`,
        plan: targetContainer,
      });
    }

    // ----------------------------------------------------
    // Action 6b: Alter Container Identifier / Actual No / Carrier Across Entire Database
    // ----------------------------------------------------
    if (action === 'alter-container') {
      const {
        oldContainer,
        newContainer,
        containerNumber,
        shippingLine,
        warehouse,
        loadingDate,
        shippedTo,
        autoSync,
      } = body;

      const cleanOldAlias = (oldContainer || '').trim();
      if (!cleanOldAlias) {
        return NextResponse.json({ error: 'Original container alias is required' }, { status: 400 });
      }

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanOldAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Container '${cleanOldAlias}' not found` }, { status: 404 });
      }

      const cleanNewAlias = (newContainer || '').trim().toUpperCase();
      const isRenamingAlias = cleanNewAlias && cleanNewAlias !== targetContainer.container.toUpperCase();

      if (isRenamingAlias) {
        const conflict = await Container.findOne({
          container: new RegExp(`^${cleanNewAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
        if (conflict) {
          return NextResponse.json(
            { error: `Container alias '${cleanNewAlias}' already exists. Please choose a different unique identifier.` },
            { status: 400 }
          );
        }
      }

      const finalAlias = isRenamingAlias ? cleanNewAlias : targetContainer.container;
      const cleanCarrierNum = containerNumber !== undefined ? String(containerNumber).trim() : targetContainer.containerNumber;
      const cleanShippingLine = shippingLine !== undefined ? String(shippingLine).trim() : targetContainer.shippingLine;
      const cleanWarehouse = warehouse !== undefined ? String(warehouse).trim() : targetContainer.warehouse;
      const cleanLoadingDate = loadingDate !== undefined ? String(loadingDate).trim() : targetContainer.loadingDate;
      const cleanShippedTo = shippedTo !== undefined ? String(shippedTo).trim() : targetContainer.shippedTo;

      // Strict Rule: Loading Date is mandatory when assigning an actual carrier container number
      if (cleanCarrierNum && !cleanLoadingDate) {
        return NextResponse.json(
          { error: 'Loading Date is mandatory when assigning an actual carrier container number.' },
          { status: 400 }
        );
      }

      // Update Container document
      targetContainer.container = finalAlias;
      targetContainer.planNumber = finalAlias;
      targetContainer.containerNumber = cleanCarrierNum;
      targetContainer.shippingLine = cleanShippingLine || 'MSC';
      if (cleanWarehouse) {
        targetContainer.warehouse = cleanWarehouse;
        targetContainer.shippedFrom = `${cleanWarehouse}, China`;
      }
      if (cleanLoadingDate) targetContainer.loadingDate = cleanLoadingDate;
      if (cleanShippedTo) targetContainer.shippedTo = cleanShippedTo;

      // If carrier container changed/set and autoSync requested
      if (autoSync && cleanCarrierNum) {
        try {
          const tracking = await fetchContainerTracking(cleanCarrierNum, cleanShippingLine || 'MSC');
          if (tracking.eta && tracking.eta !== 'N/A') {
            targetContainer.eta = tracking.eta;
            targetContainer.destinationDate = tracking.destinationDate;
            targetContainer.rawEta = tracking.rawEta || '';
            targetContainer.status = tracking.status;
            targetContainer.currentLocation = tracking.currentLocation;
            targetContainer.vesselName = tracking.vesselName;
            targetContainer.voyageNumber = tracking.voyageNumber;
            targetContainer.jsonCargoData = tracking.dataDetails;
            targetContainer.lastApiSync = new Date();
            targetContainer.apiCalled = true;
            targetContainer.apiCallCount = (targetContainer.apiCallCount || 0) + 1;
            targetContainer.apiCallHistory = targetContainer.apiCallHistory || [];
            targetContainer.apiCallHistory.push({
              timestamp: new Date(),
              source: 'alter_container_sync',
              eta: tracking.eta,
              status: tracking.status,
            });
          }
        } catch (e: any) {
          console.warn('Auto sync on alter container failed:', e?.message);
        }
      }

      if (cleanCarrierNum) {
        targetContainer.isFinalized = true;
        targetContainer.planStatus = targetContainer.status === 'Delivered' ? 'Delivered' : 'Finalized';
      }

      await targetContainer.save();

      // Update ALL shipments in Shipment collection across the entire database
      const shipmentUpdatePayload: Record<string, any> = {
        container: finalAlias,
        containerNumber: cleanCarrierNum,
        shippingLine: cleanShippingLine || 'MSC',
      };
      if (cleanWarehouse) shipmentUpdatePayload.warehouse = cleanWarehouse;
      if (cleanLoadingDate) shipmentUpdatePayload.loadingDate = cleanLoadingDate;
      if (cleanShippedTo) shipmentUpdatePayload.shippedTo = cleanShippedTo;
      if (targetContainer.eta && targetContainer.eta !== 'Pending') {
        shipmentUpdatePayload.eta = targetContainer.eta;
        shipmentUpdatePayload.destinationDate = targetContainer.destinationDate || targetContainer.eta;
      }
      if (targetContainer.rawEta) shipmentUpdatePayload.rawEta = targetContainer.rawEta;
      if (targetContainer.status && targetContainer.status !== 'Planning') {
        shipmentUpdatePayload.status = targetContainer.status;
      }
      if (targetContainer.apiCalled) shipmentUpdatePayload.apiCalled = true;

      const shipmentsUpdated = await Shipment.updateMany(
        { container: new RegExp(`^${cleanOldAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { $set: shipmentUpdatePayload }
      );

      // Update SyncError collection if any records exist
      try {
        const SyncError = (await import('@/models/SyncError')).default;
        await SyncError.updateMany(
          { container: new RegExp(`^${cleanOldAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { $set: { container: finalAlias } }
        );
      } catch {}

      return NextResponse.json({
        success: true,
        message: `Container successfully updated to '${finalAlias}' (Actual: ${cleanCarrierNum || 'Unassigned'}) across Container record and ${shipmentsUpdated.modifiedCount} shipment(s).`,
        plan: targetContainer,
        modifiedShipments: shipmentsUpdated.modifiedCount,
      });
    }

    // ----------------------------------------------------
    // Action 7: Delete Loading Plan / Container (With Strict Integrity Rules)
    // ----------------------------------------------------
    if (action === 'delete-plan') {
      const { container } = body;
      const cleanAlias = (container || '').trim();

      if (!cleanAlias) {
        return NextResponse.json({ error: 'Container identifier is required for deletion' }, { status: 400 });
      }

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!targetContainer) {
        return NextResponse.json({ error: `Container plan '${cleanAlias}' not found` }, { status: 404 });
      }

      // Rule: If container has any loaded cargo items, all mapped loaded items must be deleted/de-allocated first
      const shipmentsCount = await Shipment.countDocuments({
        container: targetContainer.container,
      });

      if (shipmentsCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete container '${cleanAlias}': It still contains ${shipmentsCount} loaded cargo item(s) mapped to it. Under system integrity rules, all loaded/planned cargo items in this container must be deleted/de-allocated first before deleting this container.`,
            hasShipments: true,
            shipmentsCount,
          },
          { status: 400 }
        );
      }

      // All loaded items cleared -> delete container cleanly
      await Container.findByIdAndDelete(targetContainer._id);

      // Clean up SyncError collection if any records exist
      try {
        const SyncError = (await import('@/models/SyncError')).default;
        await SyncError.deleteMany({
          container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: `Container '${cleanAlias}' has been successfully deleted.`,
        deletedContainer: cleanAlias,
      });
    }

    return NextResponse.json({ error: `Invalid action '${action}'` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Loading plan operation failed' }, { status: 500 });
  }
}

// DELETE: HTTP DELETE endpoint supporting query params ?container=...
export async function DELETE(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    let container = searchParams.get('container')?.trim();

    if (!container) {
      try {
        const body = await req.json();
        container = body.container?.trim();
      } catch {}
    }

    if (!container) {
      return NextResponse.json({ error: 'Container alias is required for deletion' }, { status: 400 });
    }

    await connectToDatabase();

    const targetContainer = await Container.findOne({
      container: new RegExp(`^${container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!targetContainer) {
      return NextResponse.json({ error: `Container plan '${container}' not found` }, { status: 404 });
    }

    // Rule: If container has any loaded cargo items, all mapped loaded items must be deleted/de-allocated first
    const shipmentsCount = await Shipment.countDocuments({
      container: targetContainer.container,
    });

    if (shipmentsCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete container '${container}': It still contains ${shipmentsCount} loaded cargo item(s) mapped to it. Under system integrity rules, all loaded/planned cargo items in this container must be deleted/de-allocated first before deleting this container.`,
          hasShipments: true,
          shipmentsCount,
        },
        { status: 400 }
      );
    }

    // All loaded items cleared -> delete container cleanly
    await Container.findByIdAndDelete(targetContainer._id);

    // Clean up SyncError collection if any records exist
    try {
      const SyncError = (await import('@/models/SyncError')).default;
      await SyncError.deleteMany({
        container: new RegExp(`^${container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Container '${container}' has been successfully deleted.`,
      deletedContainer: container,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete container' }, { status: 500 });
  }
}
