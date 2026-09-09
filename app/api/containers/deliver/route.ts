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
    const { container, deliveryDate: rawDeliveryDate, isDelivered = true } = body;

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

    // 2. Format delivery date (defaults to today if omitted)
    let formattedDelivery = '';
    if (rawDeliveryDate) {
      formattedDelivery = formatReceiptDate(rawDeliveryDate);
    } else {
      formattedDelivery = new Date().toISOString().slice(0, 10);
    }

    // 3. Look up container to calculate days to deliver
    let existing = await Container.findOne({ container: cleanAlias });

    let baseStartDate = existing?.startDate || '';

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

    // 4. Update Container record in MongoDB
    const updatedContainer = await Container.findOneAndUpdate(
      { container: cleanAlias },
      {
        $set: {
          status: 'Delivered',
          deliveryDate: formattedDelivery,
          daysToDeliver: daysToDeliver,
          isDelivered: true,
        },
      },
      { new: true, upsert: true }
    );

    // 5. Update all underlying shipments in MongoDB
    const shipmentUpdateResult = await Shipment.updateMany(
      { container: cleanAlias },
      {
        $set: {
          status: 'Delivered',
          deliveryDate: formattedDelivery,
          daysToDeliver: daysToDeliver,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: `Container '${cleanAlias}' marked as Delivered on ${formattedDelivery} (${
        daysToDeliver !== null ? `${daysToDeliver} days turnaround` : 'Delivery recorded'
      })`,
      container: updatedContainer,
      updatedShipmentsCount: shipmentUpdateResult.modifiedCount,
    });
  } catch (error: any) {
    console.error('Error in /api/containers/deliver:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update container delivery status' },
      { status: 500 }
    );
  }
}
