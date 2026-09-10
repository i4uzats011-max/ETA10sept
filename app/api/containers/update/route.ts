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
    const { container, actualContainerNo, shippingLine, loadingDate } = body;

    if (body.action === 'demap') {
      const targetAlias = (container || '').trim();
      if (!targetAlias) {
        return NextResponse.json({ error: 'Container alias is required to de-map actual container' }, { status: 400 });
      }

      await Shipment.updateMany(
        { container: targetAlias },
        {
          $set: {
            containerNumber: '',
            status: 'Planning',
          },
        }
      );

      const updatedContainer = await Container.findOneAndUpdate(
        { container: targetAlias },
        {
          $set: {
            containerNumber: '',
            allottedActualAt: null,
            planStatus: 'Planning',
            isFinalized: false,
          },
        },
        { new: true }
      );

      return NextResponse.json({
        success: true,
        message: `Successfully de-mapped actual container from '${targetAlias}'. The container is now unallotted.`,
        container: updatedContainer,
      });
    }

    if (!container || !actualContainerNo || !shippingLine) {
      return NextResponse.json(
        { error: 'Missing required parameters: container, actualContainerNo, and shippingLine are required' },
        { status: 400 }
      );
    }

    const cleanLoadingDate = (loadingDate || '').trim();
    if (!cleanLoadingDate) {
      return NextResponse.json(
        { error: 'Loading Date is mandatory when allotting actual carrier container number.' },
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
          loadingDate: cleanLoadingDate,
          startDate: cleanLoadingDate,
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
          rawEta: trackingInfo.rawEta || '',
          status: trackingInfo.status,
          shippedFrom: trackingInfo.shippedFrom,
          shippedTo: trackingInfo.shippedTo,
          currentLocation: trackingInfo.currentLocation,
          startDate: cleanLoadingDate || trackingInfo.startDate,
          loadingDate: cleanLoadingDate,
          destinationDate: trackingInfo.destinationDate,
          vesselName: trackingInfo.vesselName,
          voyageNumber: trackingInfo.voyageNumber,
          jsonCargoData: trackingInfo.dataDetails,
          lastApiSync: now,
          apiCalled: true,
        },
        $inc: { apiCallCount: 1 },
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
          loadingDate: cleanLoadingDate,
          startDate: cleanLoadingDate || trackingInfo.startDate,
          eta: trackingInfo.eta,
          rawEta: trackingInfo.rawEta || '',
          status: trackingInfo.status,
          shippedFrom: trackingInfo.shippedFrom,
          shippedTo: trackingInfo.shippedTo,
          currentLocation: trackingInfo.currentLocation,
          destinationDate: trackingInfo.destinationDate,
          vesselName: trackingInfo.vesselName,
          voyageNumber: trackingInfo.voyageNumber,
          jsonCargoData: trackingInfo.dataDetails,
          shipmentCount: updateResult.matchedCount,
          lastApiSync: now,
          apiCalled: true,
          planStatus: 'Finalized',
          isFinalized: true,
        },
        $inc: { apiCallCount: 1 },
        $push: {
          apiCallHistory: {
            timestamp: now,
            source: 'container_update',
            eta: trackingInfo.eta,
            status: trackingInfo.status,
          },
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
