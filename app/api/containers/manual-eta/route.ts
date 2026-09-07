import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import { addFilingBufferDays } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Read-only employee accounts cannot modify container data. Changes must be made by Super Admin.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      container,
      containerNumber,
      loadingDate,
      startDate,
      manualEta,
      destinationDate,
      status,
      applyFilingBuffer,
      shippedFrom,
      shippedTo,
      shippingLine,
    } = body;

    const queryInput = (container || containerNumber || '').trim();

    if (!queryInput) {
      return NextResponse.json(
        { error: 'Please select or enter a container identifier' },
        { status: 400 }
      );
    }

    const inputEta = (manualEta || destinationDate || '').trim();
    const inputLoading = (loadingDate || startDate || '').trim();

    if (!inputEta && !inputLoading && !status) {
      return NextResponse.json(
        { error: 'Please specify at least a Loading Date from China, ETA date, or Status' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Regex for fuzzy alias matching e.g. "USI-01" or "USI 01" or container number
    const escapedInput = queryInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fuzzyPattern = escapedInput.replace(/[-_\s]+/g, '[-_\\s]*');
    const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

    const updateFields: any = {
      lastApiSync: null,
    };

    if (inputLoading) {
      updateFields.startDate = inputLoading;
    }

    let finalEta = inputEta;
    if (inputEta) {
      if (applyFilingBuffer) {
        finalEta = addFilingBufferDays(inputEta, 7);
      }
      updateFields.eta = finalEta;
      updateFields.destinationDate = finalEta;
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

    // Execute updateMany for ALL shipment records & receipts associated with this container
    const updateResult = await Shipment.updateMany(
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

    // Also update or upsert Container fleet document
    const containerSetFields: any = {
      ...updateFields,
      container: queryInput,
    };
    if (updateResult.matchedCount > 0) {
      containerSetFields.shipmentCount = updateResult.matchedCount;
    }

    await Container.findOneAndUpdate(
      { $or: [{ container: regex }, { containerNumber: regex }] },
      {
        $set: containerSetFields,
      },
      { upsert: true, new: true }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: `No shipments found matching container '${queryInput}'` },
        { status: 404 }
      );
    }

    const finalStatus = updateFields.status || 'Updated';

    return NextResponse.json({
      success: true,
      message: `Successfully updated manual dates for all ${updateResult.modifiedCount} receipt(s) associated with container '${queryInput}'`,
      container: queryInput,
      eta: finalEta || undefined,
      startDate: inputLoading || undefined,
      status: finalStatus,
      updatedCount: updateResult.modifiedCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update manual ETA' },
      { status: 500 }
    );
  }
}
