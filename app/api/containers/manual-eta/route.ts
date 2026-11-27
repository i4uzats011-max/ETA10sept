import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isSuperAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { addFilingBufferDays } from '@/lib/jsoncargo';
import { calculateDaysBetween, formatReceiptDate } from '@/lib/dateUtils';
import { invalidateContainerCache } from '@/lib/redis';
import { recordEditLog } from '@/lib/auditLog';
import { detectCarrierWithGemini, ensureShippingLineExists } from '@/lib/carrierDetector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Any change in data can only be made by Super Admin.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      container,
      newContainerAlias,
      containerNumber,
      blNumber,
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
      deliveryDate,
      isDelivered,
      newRemark,
      remarkDate,
      remarkText,
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

    const now = new Date();
    const user = getAuthenticatedUser(req);
    const modifiedBy = user?.username || 'admin';
    const modifiedByRole = user?.role || 'admin';

    const updateFields: any = {
      lastApiSync: null,
      etaUpdatedAt: now,
      lastModifiedBy: modifiedBy,
      lastModifiedByRole: modifiedByRole,
    };

    if (finalAlias) {
      updateFields.container = finalAlias;
    }
    if (finalContainerNo !== undefined) {
      updateFields.containerNumber = finalContainerNo;
    }
    if (blNumber !== undefined) {
      updateFields.blNumber = String(blNumber || '').trim().toUpperCase();
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

    const isMarkedDelivered = Boolean(
      isDelivered ||
      (status && status.toLowerCase().includes('deliver')) ||
      (deliveryDate && String(deliveryDate).trim())
    );

    if (isMarkedDelivered) {
      updateFields.isDelivered = true;
      updateFields.status = 'Delivered';
      const cleanDelivDate = deliveryDate ? formatReceiptDate(deliveryDate) : formatReceiptDate(new Date().toISOString().slice(0, 10));
      updateFields.deliveryDate = cleanDelivDate;

      // Calculate days to deliver if loading / start date is available
      const baseStart = inputLoading || updateFields.startDate || '';
      if (baseStart && cleanDelivDate) {
        const days = calculateDaysBetween(baseStart, cleanDelivDate);
        if (days !== null && days >= 0) {
          updateFields.daysToDeliver = days;
        }
      }
    } else if (isDelivered === false) {
      updateFields.isDelivered = false;
      updateFields.deliveryDate = '';
      updateFields.daysToDeliver = null;
    }

    // Build search condition for existing container / shipments
    const escapedQuery = queryInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fuzzyPattern = escapedQuery.replace(/[-_\s]+/g, '[-_\\s]*');
    const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

    // 1. Identify target containers and any linked siblings (by Container Number or B/L Number)
    const targetAliases = new Set<string>();
    if (queryInput) targetAliases.add(queryInput);
    if (finalAlias) targetAliases.add(finalAlias);

    const existingDocs: any[] = await Container.find({
      $or: [
        { container: regex },
        { container: effectiveTargetAlias },
        ...(finalContainerNo ? [{ containerNumber: finalContainerNo }] : []),
      ],
    }).lean();

    let resolvedActual = finalContainerNo;
    let resolvedBL = updateFields.blNumber;
    existingDocs.forEach((d) => {
      if (d.container) targetAliases.add(d.container);
      if (!resolvedActual && d.containerNumber) resolvedActual = d.containerNumber;
      if (!resolvedBL && d.blNumber) resolvedBL = d.blNumber;
    });

    // Auto-detect carrier using Gemini AI if container number or BL number available
    if (resolvedActual || resolvedBL) {
      if (!updateFields.shippingLine || updateFields.shippingLine === 'MSC') {
        try {
          const detected = await detectCarrierWithGemini(resolvedActual || '', updateFields.shippingLine, resolvedBL);
          if (detected.canonicalCode) {
            updateFields.shippingLine = detected.canonicalCode;
          }
          await ensureShippingLineExists(detected);
        } catch {}
      }
    }

    // Find all sibling containers linked by same Actual Container No. or same B/L No.
    const siblingQuery: any[] = [];
    if (resolvedActual) siblingQuery.push({ containerNumber: resolvedActual });
    if (resolvedBL) siblingQuery.push({ blNumber: resolvedBL });

    if (siblingQuery.length > 0) {
      const siblings: any[] = await Container.find({ $or: siblingQuery }).lean();
      siblings.forEach((s) => {
        if (s.container) targetAliases.add(s.container);
      });
    }

    const linkedContainerOrQuery: any[] = [
      { container: { $in: Array.from(targetAliases) } },
      { container: regex },
    ];
    if (resolvedActual) linkedContainerOrQuery.push({ containerNumber: resolvedActual });
    if (resolvedBL) linkedContainerOrQuery.push({ blNumber: resolvedBL });

    let updateResult = { matchedCount: 0, modifiedCount: 0 };

    if (!isNewContainer && queryInput) {
      // Execute updateMany for all shipment records associated with this container and linked siblings
      updateResult = await Shipment.updateMany(
        { $or: linkedContainerOrQuery },
        { $set: updateFields }
      );
    }

    // Also update or create the Container fleet document
    const containerSetFields: any = {
      ...updateFields,
      container: effectiveTargetAlias,
      containerNumber: finalContainerNo || resolvedActual || '',
      blNumber: updateFields.blNumber || resolvedBL || '',
    };

    if (updateResult.matchedCount > 0) {
      containerSetFields.shipmentCount = updateResult.matchedCount;
    }

    let remarkToPush: any = null;
    if (newRemark && newRemark.date && newRemark.remarks) {
      remarkToPush = {
        date: String(newRemark.date).trim(),
        remarks: String(newRemark.remarks).trim(),
        createdAt: new Date(),
        createdBy: 'Admin',
      };
    } else if (remarkDate && remarkText && String(remarkText).trim()) {
      remarkToPush = {
        date: String(remarkDate).trim(),
        remarks: String(remarkText).trim(),
        createdAt: new Date(),
        createdBy: 'Admin',
      };
    }

    const containerUpdateOps: any = {
      $set: containerSetFields,
      $setOnInsert: {
        warehouse: 'China Warehouse',
        planStatus: 'Planning',
        isFinalized: Boolean(finalContainerNo || resolvedActual),
        allottedActualAt: (finalContainerNo || resolvedActual) ? new Date() : null,
      },
    };

    if (remarkToPush) {
      containerUpdateOps.$push = { remarks: remarkToPush };
    }

    const savedContainer = await Container.findOneAndUpdate(
      {
        $or: [
          { container: regex },
          { container: effectiveTargetAlias },
          ...(finalContainerNo ? [{ containerNumber: finalContainerNo }] : []),
        ],
      },
      containerUpdateOps,
      { upsert: true, new: true }
    );

    // Also link and update all sibling containers sharing the same actual container number or B/L number
    if (resolvedActual || resolvedBL || targetAliases.size > 1) {
      const siblingUpdateFields: any = { ...updateFields };
      delete siblingUpdateFields.container; // Preserve each sibling's own unique plan alias

      await Container.updateMany(
        {
          _id: { $ne: savedContainer?._id },
          $or: linkedContainerOrQuery,
        },
        { $set: siblingUpdateFields }
      ).catch(() => {});
    }

    if (remarkToPush) {
      // Push day-wise remark to all linked sibling containers
      await Container.updateMany(
        {
          _id: { $ne: savedContainer?._id },
          $or: linkedContainerOrQuery,
        },
        { $push: { remarks: remarkToPush } }
      ).catch(() => {});

      await Shipment.updateMany(
        { $or: linkedContainerOrQuery },
        { $push: { containerRemarks: remarkToPush } }
      ).catch(() => {});
    }

    // Invalidate container cache memory upon status/ETA change
    await invalidateContainerCache(effectiveTargetAlias);
    if (finalContainerNo) {
      await invalidateContainerCache(finalContainerNo);
    }
    if (updateFields.blNumber) {
      await invalidateContainerCache(updateFields.blNumber);
    }

    // Record Edit Log for CUD operation
    await recordEditLog(req, {
      action: isNewContainer ? 'CREATE' : 'UPDATE',
      entityType: 'Container',
      entityId: effectiveTargetAlias,
      description: isNewContainer
        ? `Created container ${effectiveTargetAlias}`
        : `Updated container ${effectiveTargetAlias}`,
      details: {
        container: effectiveTargetAlias,
        containerNumber: finalContainerNo,
        blNumber: updateFields.blNumber || '',
        loadingDate: inputLoading,
        rawEta: inputActualEta,
        eta: inputGraceEta,
        status: updateFields.status,
      },
      username: modifiedBy,
      role: modifiedByRole,
    });

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
      etaUpdatedAt: now.toISOString(),
      updatedCount: updateResult.modifiedCount,
      remarks: savedContainer?.remarks || [],
    });
  } catch (error: any) {
    console.error('Error updating manual container ETA:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update manual ETA' },
      { status: 500 }
    );
  }
}

