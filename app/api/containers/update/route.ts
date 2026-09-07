import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import { fetchContainerTracking } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot modify containers' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { container, actualContainerNo, shippingLine } = body;

    if (!container || !actualContainerNo || !shippingLine) {
      return NextResponse.json(
        { error: 'Missing required parameters: container, actualContainerNo, and shippingLine are required' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // 1. Execute updateMany for all matching records with the target container alias
    const updateResult = await Shipment.updateMany(
      { container: container.trim() },
      {
        $set: {
          containerNumber: actualContainerNo.trim(),
          shippingLine: shippingLine.trim(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: `No shipments found for container alias '${container}'` },
        { status: 404 }
      );
    }

    // 2. Immediately trigger an initial API sync to fetch ETA and status
    const trackingInfo = await fetchContainerTracking(
      actualContainerNo.trim(),
      shippingLine.trim()
    );

    const now = new Date();

    // 3. Update ETA, status, route details, and lastApiSync for all matching records
    await Shipment.updateMany(
      { container: container.trim() },
      {
        $set: {
          eta: trackingInfo.eta,
          status: trackingInfo.status,
          shippedFrom: trackingInfo.shippedFrom,
          shippedTo: trackingInfo.shippedTo,
          currentLocation: trackingInfo.currentLocation,
          startDate: trackingInfo.startDate,
          destinationDate: trackingInfo.destinationDate,
          vesselName: trackingInfo.vesselName,
          voyageNumber: trackingInfo.voyageNumber,
          jsonCargoData: trackingInfo.dataDetails,
          lastApiSync: now,
        },
      }
    );

    // 4. Update or insert into Container fleet collection
    await Container.findOneAndUpdate(
      { container: container.trim() },
      {
        $set: {
          container: container.trim(),
          containerNumber: actualContainerNo.trim(),
          shippingLine: shippingLine.trim(),
          eta: trackingInfo.eta,
          status: trackingInfo.status,
          shippedFrom: trackingInfo.shippedFrom,
          shippedTo: trackingInfo.shippedTo,
          currentLocation: trackingInfo.currentLocation,
          startDate: trackingInfo.startDate,
          destinationDate: trackingInfo.destinationDate,
          vesselName: trackingInfo.vesselName,
          voyageNumber: trackingInfo.voyageNumber,
          jsonCargoData: trackingInfo.dataDetails,
          shipmentCount: updateResult.matchedCount,
          lastApiSync: now,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: `Updated ${updateResult.modifiedCount} shipment(s) and synced tracking info`,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      syncedTracking: {
        eta: trackingInfo.eta,
        status: trackingInfo.status,
        shippedFrom: trackingInfo.shippedFrom,
        shippedTo: trackingInfo.shippedTo,
        currentLocation: trackingInfo.currentLocation,
        startDate: trackingInfo.startDate,
        destinationDate: trackingInfo.destinationDate,
        vesselName: trackingInfo.vesselName,
        voyageNumber: trackingInfo.voyageNumber,
        lastApiSync: now,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update container' },
      { status: 500 }
    );
  }
}
