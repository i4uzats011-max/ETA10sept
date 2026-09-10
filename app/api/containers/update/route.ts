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

    let cleanLoadingDate = (loadingDate || '').trim();

    // 1. Trigger API lookup to retrieve live carrier ETA and loading date
    let trackingInfo: any = null;
    try {
      trackingInfo = await fetchContainerTracking(
        actualContainerNo.trim(),
        shippingLine.trim()
      );
      // If API returns a live loading date, get it from the API
      if (trackingInfo?.loadingDate) {
        cleanLoadingDate = trackingInfo.loadingDate;
      }
    } catch (apiErr: any) {
      console.warn('Carrier API lookup warning:', apiErr?.message);
    }

    // If API could not search/find container and user did not enter loading date manually
    if (!cleanLoadingDate) {
      return NextResponse.json(
        { error: 'Carrier API could not find loading date for this container. Please enter the Loading Date manually.' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const now = new Date();

    const updateFields: Record<string, any> = {
      containerNumber: actualContainerNo.trim(),
      shippingLine: shippingLine.trim(),
      loadingDate: cleanLoadingDate,
      startDate: cleanLoadingDate,
    };

    if (trackingInfo) {
      updateFields.eta = trackingInfo.eta;
      updateFields.rawEta = trackingInfo.rawEta || '';
      updateFields.status = trackingInfo.status;
      updateFields.shippedFrom = trackingInfo.shippedFrom;
      updateFields.shippedTo = trackingInfo.shippedTo;
      updateFields.currentLocation = trackingInfo.currentLocation;
      updateFields.destinationDate = trackingInfo.destinationDate;
      updateFields.vesselName = trackingInfo.vesselName;
      updateFields.voyageNumber = trackingInfo.voyageNumber;
      updateFields.jsonCargoData = trackingInfo.dataDetails;
      updateFields.lastApiSync = now;
      updateFields.apiCalled = true;
    }

    // 2. Execute updateMany for all matching records with the target container alias
    const updateResult = await Shipment.updateMany(
      { container: container.trim() },
      {
        $set: updateFields,
        ...(trackingInfo ? { $inc: { apiCallCount: 1 } } : {}),
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: `No shipments found for container alias '${container}'` },
        { status: 404 }
      );
    }

    // 3. Update or insert into Container fleet collection
    await Container.findOneAndUpdate(
      { container: container.trim() },
      {
        $set: {
          container: container.trim(),
          ...updateFields,
          shipmentCount: updateResult.matchedCount,
          planStatus: 'Finalized',
          isFinalized: true,
        },
        ...(trackingInfo ? { $inc: { apiCallCount: 1 } } : {}),
        ...(trackingInfo
          ? {
              $push: {
                apiCallHistory: {
                  timestamp: now,
                  source: 'container_update',
                  eta: trackingInfo.eta,
                  status: trackingInfo.status,
                  loadingDate: cleanLoadingDate,
                },
              },
            }
          : {}),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: `Updated ${updateResult.modifiedCount} shipment(s) and synced container tracking`,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      loadingDate: cleanLoadingDate,
      syncedTracking: trackingInfo
        ? {
            eta: trackingInfo.eta,
            status: trackingInfo.status,
            shippedFrom: trackingInfo.shippedFrom,
            shippedTo: trackingInfo.shippedTo,
            currentLocation: trackingInfo.currentLocation,
            startDate: trackingInfo.startDate,
            loadingDate: cleanLoadingDate,
            destinationDate: trackingInfo.destinationDate,
            vesselName: trackingInfo.vesselName,
            voyageNumber: trackingInfo.voyageNumber,
            lastApiSync: now,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update container' },
      { status: 500 }
    );
  }
}
