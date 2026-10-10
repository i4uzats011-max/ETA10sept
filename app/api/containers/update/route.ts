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

    await connectToDatabase();

    let cleanLoadingDate = (loadingDate || '').trim();
    if (!cleanLoadingDate) {
      const existing: any = await Container.findOne({ container: container.trim() }).lean();
      if (existing?.loadingDate || existing?.startDate) {
        cleanLoadingDate = existing.loadingDate || existing.startDate;
      }
    }

    // Retrieve local tracking details
    let trackingInfo: any = null;
    try {
      trackingInfo = await fetchContainerTracking(
        actualContainerNo.trim(),
        shippingLine.trim()
      );
    } catch {
      // silent
    }

    const now = new Date();

    const updateFields: Record<string, any> = {
      containerNumber: actualContainerNo.trim(),
      shippingLine: shippingLine.trim(),
    };

    if (cleanLoadingDate) {
      updateFields.loadingDate = cleanLoadingDate;
      updateFields.startDate = cleanLoadingDate;
    }

    if (trackingInfo) {
      if (trackingInfo.eta && trackingInfo.eta !== 'Pending') {
        updateFields.eta = trackingInfo.eta;
        updateFields.destinationDate = trackingInfo.destinationDate;
      }
      if (trackingInfo.rawEta) updateFields.rawEta = trackingInfo.rawEta;
      if (trackingInfo.status) updateFields.status = trackingInfo.status;
      if (trackingInfo.shippedFrom) updateFields.shippedFrom = trackingInfo.shippedFrom;
      if (trackingInfo.shippedTo) updateFields.shippedTo = trackingInfo.shippedTo;
      if (trackingInfo.currentLocation) updateFields.currentLocation = trackingInfo.currentLocation;
      if (trackingInfo.vesselName) updateFields.vesselName = trackingInfo.vesselName;
      if (trackingInfo.voyageNumber) updateFields.voyageNumber = trackingInfo.voyageNumber;
      updateFields.jsonCargoData = trackingInfo.dataDetails;
      updateFields.lastApiSync = now;
      updateFields.etaUpdatedAt = now;
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
            etaUpdatedAt: now,
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
