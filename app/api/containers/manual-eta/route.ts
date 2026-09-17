import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isAdminAuthenticated } from '@/lib/auth';
import { addFilingBufferDays } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: You must be logged in as an administrator or staff member to modify container data.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      container,
      newContainerAlias,
      containerNumber,
      loadingDate,
      startDate,
      rawEta,
      manualEta,
      destinationDate,
      etaBufferDays = 7,
      status,
      applyFilingBuffer,
      shippedFrom,
      shippedTo,
      shippingLine,
      isNewContainer = false,
    } = body;

    const queryInput = (container || '').trim();
    const finalAlias = (newContainerAlias || container || '').trim();
    const finalContainerNo = (containerNumber || '').trim();

    if (!queryInput && !finalAlias && !finalContainerNo) {
      return NextResponse.json(
        { error: 'Please specify a Container Alias or Actual Container Number' },
        { status: 400 }
      );
    }

    const effectiveTargetAlias = finalAlias || queryInput || finalContainerNo;
    const inputActualEta = (rawEta || '').trim();
    let inputGraceEta = (destinationDate || manualEta || '').trim();
    const inputLoading = (loadingDate || startDate || '').trim();

    // If actual ETA provided with filing buffer, but user didn't specify manual grace date, auto-calculate
    if (inputActualEta && !inputGraceEta && applyFilingBuffer) {
      inputGraceEta = addFilingBufferDays(inputActualEta, Number(etaBufferDays) || 7);
    } else if (!inputGraceEta && inputActualEta) {
      inputGraceEta = inputActualEta;
    }

    await connectToDatabase();

    const updateFields: any = {
      lastApiSync: null,
    };

    if (finalAlias) {
      updateFields.container = finalAlias;
    }
    if (finalContainerNo !== undefined) {
      updateFields.containerNumber = finalContainerNo;
    }
    if (inputLoading) {
      updateFields.loadingDate = inputLoading;
      updateFields.startDate = inputLoading;
    }
    if (inputActualEta) {
      updateFields.rawEta = inputActualEta;
    }
    if (inputGraceEta) {
      updateFields.destinationDate = inputGraceEta;
      updateFields.eta = inputGraceEta;
    }
    if (etaBufferDays !== undefined) {
      updateFields.etaBufferDays = Number(etaBufferDays) || 7;
    }
    if (status && status.trim()) {
      updateFields.status = status.trim();
    }
    if (shippedFrom && shippedFrom.trim()) {
      updateFields.shippedFrom = shippedFrom.trim();
    }
    if (shippedTo && shippedTo.trim()) {
      updateFields.shippedTo = shippedTo.trim();
    }
    if (shippingLine && shippingLine.trim()) {
      updateFields.shippingLine = shippingLine.trim();
    }

    // Build search condition for existing container / shipments
    const escapedQuery = queryInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fuzzyPattern = escapedQuery.replace(/[-_\s]+/g, '[-_\\s]*');
    const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

    let updateResult = { matchedCount: 0, modifiedCount: 0 };

    if (!isNewContainer && queryInput) {
      // Execute updateMany for all shipment records associated with this container
      updateResult = await Shipment.updateMany(
        {
          $or: [
            { container: regex },
            { containerNumber: regex },
          ],
        },
        {
          $set: updateFields,
        }
      );
    }

    // Also update or create the Container fleet document
    const containerSetFields: any = {
      ...updateFields,
      container: effectiveTargetAlias,
      containerNumber: finalContainerNo,
    };

    if (updateResult.matchedCount > 0) {
      containerSetFields.shipmentCount = updateResult.matchedCount;
    }

    const savedContainer = await Container.findOneAndUpdate(
      {
        $or: [
          { container: regex },
          { container: effectiveTargetAlias },
          ...(finalContainerNo ? [{ containerNumber: finalContainerNo }] : []),
        ],
      },
      {
        $set: containerSetFields,
        $setOnInsert: {
          warehouse: 'China Warehouse',
          planStatus: 'Planning',
          isFinalized: Boolean(finalContainerNo),
          allottedActualAt: finalContainerNo ? new Date() : null,
        },
      },
      { upsert: true, new: true }
    );

    const message = isNewContainer
      ? `Successfully registered new container '${effectiveTargetAlias}' (${finalContainerNo || 'No Carrier Number'}) in fleet.`
      : updateResult.matchedCount > 0
      ? `Successfully updated details and dates for container '${effectiveTargetAlias}' across ${updateResult.modifiedCount} shipment receipt(s)!`
      : `Successfully saved details for container '${effectiveTargetAlias}' in fleet master directory.`;

    return NextResponse.json({
      success: true,
      message,
      container: effectiveTargetAlias,
      containerNumber: finalContainerNo,
      actualEta: inputActualEta || savedContainer?.rawEta || undefined,
      graceDate: inputGraceEta || savedContainer?.destinationDate || undefined,
      destinationDate: inputGraceEta || savedContainer?.destinationDate || undefined,
      startDate: inputLoading || savedContainer?.startDate || undefined,
      shippedTo: updateFields.shippedTo || savedContainer?.shippedTo || undefined,
      status: updateFields.status || savedContainer?.status || 'In Transit',
      updatedCount: updateResult.modifiedCount,
    });
  } catch (error: any) {
    console.error('Error updating manual container ETA:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update manual ETA' },
      { status: 500 }
    );
  }
}

