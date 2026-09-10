import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import SyncError from '@/models/SyncError';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import { fetchContainerTracking } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot trigger API sync' }, { status: 403 });
  }

  let publicAlias = '';
  let finalTrackingNumber = '';
  let carrierCompany = 'MSC';

  try {
    const body = await req.json();
    const { container, containerNumber, shippingLine } = body;

    const queryInput = (container || containerNumber || '').trim();

    if (!queryInput) {
      return NextResponse.json(
        { error: 'Please select a container alias (e.g., USI-01) or enter an actual container number' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Flexible regex search to match alias e.g. "USI-01" or "USI 01" or actual container number
    const escapedInput = queryInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fuzzyPattern = escapedInput.replace(/[-_\s]+/g, '[-_\\s]*');
    const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

    const sampleShipment: any = await Shipment.findOne({
      $or: [{ container: regex }, { containerNumber: regex }],
    }).lean();

    if (!sampleShipment && !containerNumber) {
      return NextResponse.json(
        { error: `No container record found in database for '${queryInput}'` },
        { status: 404 }
      );
    }

    publicAlias = sampleShipment?.container || queryInput;
    let actualContainerNumber = containerNumber?.trim() || sampleShipment?.containerNumber;
    carrierCompany = shippingLine?.trim() || sampleShipment?.shippingLine || 'MSC';

    // Check if the container number is still equal to the public alias (unmapped)
    if (!containerNumber && actualContainerNumber && actualContainerNumber.trim().toLowerCase() === publicAlias.trim().toLowerCase()) {
      return NextResponse.json({
        warning: true,
        message: `Public container alias '${publicAlias}' has not been mapped to an actual carrier container number (e.g. MSCU1234567) yet. Please use the 3-Column Container Update section above to map it.`,
        publicAlias,
        containerNumber: actualContainerNumber,
        shippingLine: carrierCompany,
      }, { status: 400 });
    }

    finalTrackingNumber = actualContainerNumber || queryInput;

    // Fast Lookup Preview Mode (Used by UI to check API loading date & ETA without writing to DB)
    if (body.lookupOnly) {
      try {
        const tracking = await fetchContainerTracking(finalTrackingNumber, carrierCompany);
        return NextResponse.json({
          success: true,
          lookupOnly: true,
          containerNumber: finalTrackingNumber,
          shippingLine: carrierCompany,
          loadingDate: tracking.loadingDate || tracking.startDate || '',
          startDate: tracking.startDate || tracking.loadingDate || '',
          eta: tracking.eta,
          rawEta: tracking.rawEta || '',
          status: tracking.status,
          shippedFrom: tracking.shippedFrom,
          shippedTo: tracking.shippedTo,
          vesselName: tracking.vesselName,
          voyageNumber: tracking.voyageNumber,
          dataDetails: tracking.dataDetails,
          message: tracking.loadingDate
            ? `Found in Carrier API: Loading Date is ${tracking.loadingDate}`
            : `Found in Carrier API (Status: ${tracking.status}), but departure/loading date is pending. Please enter loading date manually if known.`,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          notFound: true,
          containerNumber: finalTrackingNumber,
          shippingLine: carrierCompany,
          message: err?.message || 'Carrier API could not find or search this container. Please enter loading date manually.',
        });
      }
    }

    // Call JSONCargo API using server process.env.JSON_CARGO_API_KEY
    const tracking = await fetchContainerTracking(finalTrackingNumber, carrierCompany);
    const now = new Date();

    const dateUpdateFields: Record<string, any> = {};
    if (tracking.loadingDate) {
      dateUpdateFields.loadingDate = tracking.loadingDate;
      dateUpdateFields.startDate = tracking.loadingDate;
    } else if (tracking.startDate) {
      dateUpdateFields.startDate = tracking.startDate;
    }

    // Update all database shipments matching public alias or actual container number
    const updateResult = await Shipment.updateMany(
      {
        $or: [
          { container: regex },
          { containerNumber: finalTrackingNumber },
        ],
      },
      {
        $set: {
          eta: tracking.eta,
          rawEta: tracking.rawEta || '',
          status: tracking.status,
          shippedFrom: tracking.shippedFrom,
          shippedTo: tracking.shippedTo,
          currentLocation: tracking.currentLocation,
          ...dateUpdateFields,
          destinationDate: tracking.destinationDate,
          vesselName: tracking.vesselName,
          voyageNumber: tracking.voyageNumber,
          jsonCargoData: tracking.dataDetails,
          lastApiSync: now,
          apiCalled: true,
        },
        $inc: { apiCallCount: 1 },
      }
    );

    // Also persist all information provided by the API into dedicated Container collection
    await Container.findOneAndUpdate(
      { container: publicAlias },
      {
        $set: {
          container: publicAlias,
          containerNumber: finalTrackingNumber,
          shippingLine: carrierCompany,
          eta: tracking.eta,
          rawEta: tracking.rawEta || '',
          status: tracking.status,
          shippedFrom: tracking.shippedFrom,
          shippedTo: tracking.shippedTo,
          currentLocation: tracking.currentLocation,
          ...dateUpdateFields,
          destinationDate: tracking.destinationDate,
          vesselName: tracking.vesselName,
          voyageNumber: tracking.voyageNumber,
          jsonCargoData: tracking.dataDetails,
          shipmentCount: updateResult.matchedCount,
          lastApiSync: now,
          apiCalled: true,
        },
        $inc: { apiCallCount: 1 },
        $push: {
          apiCallHistory: {
            timestamp: now,
            source: 'manual_user',
            eta: tracking.eta,
            status: tracking.status,
            rawSummary: {
              shippedFrom: tracking.shippedFrom,
              shippedTo: tracking.shippedTo,
              location: tracking.currentLocation,
              vessel: tracking.vesselName,
              voyage: tracking.voyageNumber,
              loadingDate: tracking.loadingDate || null,
            },
          },
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully fetched live ETA & tracking via JSONCargo API for '${publicAlias}' (Actual: ${finalTrackingNumber}, Company: ${carrierCompany})`,
      publicAlias,
      containerNumber: finalTrackingNumber,
      shippingLine: carrierCompany,
      eta: tracking.eta,
      loadingDate: tracking.loadingDate || tracking.startDate || '',
      status: tracking.status,
      shippedFrom: tracking.shippedFrom,
      shippedTo: tracking.shippedTo,
      currentLocation: tracking.currentLocation,
      startDate: tracking.startDate,
      destinationDate: tracking.destinationDate,
      vesselName: tracking.vesselName,
      voyageNumber: tracking.voyageNumber,
      lastApiSync: now,
      updatedCount: updateResult.modifiedCount,
      dataDetails: tracking.dataDetails,
    });
  } catch (error: any) {
    // Record API sync failure to SyncError collection
    try {
      if (finalTrackingNumber || publicAlias) {
        await connectToDatabase();
        await SyncError.create({
          container: publicAlias || 'N/A',
          containerNumber: finalTrackingNumber || 'N/A',
          shippingLine: carrierCompany || 'MSC',
          errorMessage: error?.message || 'Manual JSONCargo ETA sync failed',
          source: 'manual',
        });
      }
    } catch (dbErr) {
      console.error('Failed to log SyncError to database:', dbErr);
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Manual JSONCargo ETA sync failed',
        canUpdateManually: true,
        container: publicAlias,
        containerNumber: finalTrackingNumber,
        shippingLine: carrierCompany,
      },
      { status: 400 }
    );
  }
}
