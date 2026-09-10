import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import { calculateDaysBetween, formatReceiptDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { container, deliveryDate: rawDeliveryDate, isDelivered = true, excludedReceipts } = body;

    if (!container) {
      return NextResponse.json(
        { error: 'Container identifier is required' },
        { status: 400 }
      );
    }

    const cleanAlias = String(container).trim();

    // 1. If explicitly unmarking / reverting delivery status
    if (isDelivered === false) {
      const updated = await Container.findOneAndUpdate(
        { container: cleanAlias },
        {
          $set: {
            status: 'In Transit',
            deliveryDate: '',
            daysToDeliver: null,
            isDelivered: false,
          },
        },
        { new: true }
      );

      const shipUpdate = await Shipment.updateMany(
        { container: cleanAlias },
        {
          $set: {
            status: 'In Transit',
            deliveryDate: '',
            daysToDeliver: null,
            isDelivered: false,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: `Delivery status removed for container ${cleanAlias}. Reverted to In Transit.`,
        container: updated,
        updatedShipmentsCount: shipUpdate.modifiedCount,
      });
    }

    // Strict Rule: Delivery Date is strictly mandatory
    if (!rawDeliveryDate || !String(rawDeliveryDate).trim()) {
      return NextResponse.json(
        { error: 'Delivery Date is mandatory when marking container as delivered.' },
        { status: 400 }
      );
    }

    // 2. Format delivery date
    const formattedDelivery = formatReceiptDate(rawDeliveryDate);

    // 3. Look up container to calculate days to deliver
    let existing = await Container.findOne({ container: cleanAlias });

    let baseStartDate = existing?.startDate || existing?.loadingDate || '';

    // If container doesn't have departure date, lookup earliest receipt date from shipments
    if (!baseStartDate) {
      const earliestShipment = await Shipment.findOne({
        container: cleanAlias,
        date: { $exists: true, $nin: ['', null, 'N/A'] },
      }).sort({ date: 1 });

      if (earliestShipment?.date) {
        baseStartDate = earliestShipment.date;
      }
    }

    // Calculate turnaround days from loading/start date to delivery date
    let daysToDeliver: number | null = null;
    if (baseStartDate && formattedDelivery) {
      daysToDeliver = calculateDaysBetween(baseStartDate, formattedDelivery);
      if (daysToDeliver !== null && daysToDeliver < 0) {
        daysToDeliver = 0;
      }
    }

    // 4. Fetch all shipments under this container to evaluate partial exclusions
    const allShipments = await Shipment.find({ container: cleanAlias });
    const excludedReceiptsSet = new Set<string>(
      Array.isArray(excludedReceipts)
        ? excludedReceipts.map((r: any) => String(r).trim().toLowerCase()).filter(Boolean)
        : []
    );

    const toDeliverShipments = allShipments.filter(
      (s) => !excludedReceiptsSet.has(String(s.receipt || '').trim().toLowerCase())
    );
    const toExcludeShipments = allShipments.filter(
      (s) => excludedReceiptsSet.has(String(s.receipt || '').trim().toLowerCase())
    );

    if (allShipments.length > 0 && toDeliverShipments.length === 0) {
      return NextResponse.json(
        { error: 'All receipts in container were excluded. At least one receipt must be selected for delivery.' },
        { status: 400 }
      );
    }

    const isAllDelivered = toExcludeShipments.length === 0;

    // 5. Update Container record in MongoDB
    const updatedContainer = await Container.findOneAndUpdate(
      { container: cleanAlias },
      {
        $set: {
          status: isAllDelivered ? 'Delivered' : 'Partially Delivered',
          deliveryDate: formattedDelivery,
          daysToDeliver: daysToDeliver,
          isDelivered: isAllDelivered,
        },
      },
      { new: true, upsert: true }
    );

    // 6. Update shipments in MongoDB
    if (toDeliverShipments.length > 0) {
      const deliverIds = toDeliverShipments.map((s) => s._id);
      await Shipment.updateMany(
        { _id: { $in: deliverIds } },
        {
          $set: {
            status: 'Delivered',
            deliveryDate: formattedDelivery,
            daysToDeliver: daysToDeliver,
            isDelivered: true,
          },
        }
      );
    }

    if (toExcludeShipments.length > 0) {
      const excludeIds = toExcludeShipments.map((s) => s._id);
      await Shipment.updateMany(
        { _id: { $in: excludeIds } },
        {
          $set: {
            status: 'In Transit (Undelivered / Excluded)',
            deliveryDate: '',
            isDelivered: false,
          },
        }
      );
    }

    // 7. Update WarehouseReceipt collection
    const WarehouseReceipt = (await import('@/models/WarehouseReceipt')).default;
    const deliveredReceipts = Array.from(new Set(toDeliverShipments.map((s) => s.receipt).filter(Boolean)));
    for (const r of deliveredReceipts) {
      const undeliveredCount = await Shipment.countDocuments({
        receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        isDelivered: { $ne: true },
      });

      if (undeliveredCount === 0) {
        await WarehouseReceipt.findOneAndUpdate(
          { receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $set: {
              deliveryDate: formattedDelivery,
              isDelivered: true,
              status: 'Delivered',
              stockstatus: 'Delivered',
            },
          }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: isAllDelivered
        ? `Container '${cleanAlias}' marked as Delivered on ${formattedDelivery} (${
            daysToDeliver !== null ? `${daysToDeliver} days turnaround` : 'Delivery recorded'
          })`
        : `Container '${cleanAlias}' marked as Partially Delivered on ${formattedDelivery}. (${toDeliverShipments.length} delivered, ${toExcludeShipments.length} receipt items excluded).`,
      container: updatedContainer,
      updatedShipmentsCount: toDeliverShipments.length,
      excludedShipmentsCount: toExcludeShipments.length,
    });
  } catch (error: any) {
    console.error('Error in /api/containers/deliver:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update container delivery status' },
      { status: 500 }
    );
  }
}
