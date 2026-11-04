import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isSuperAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';

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

    // API tracking is permanently stopped - No API queries or automatic date changes
    const now = new Date();
    const user = getAuthenticatedUser(req);
    const modifiedBy = user?.username || 'admin';
    const modifiedByRole = user?.role || 'admin';

    const updateFields: Record<string, any> = {
      containerNumber: actualContainerNo.trim(),
      shippingLine: shippingLine.trim(),
      lastModifiedBy: modifiedBy,
      lastModifiedByRole: modifiedByRole,
    };

    if (cleanLoadingDate) {
      updateFields.loadingDate = cleanLoadingDate;
      updateFields.startDate = cleanLoadingDate;
    }

    // 2. Execute updateMany for all matching records with the target container alias
    const updateResult = await Shipment.updateMany(
      { container: container.trim() },
      {
        $set: updateFields,
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
      },
      { upsert: true, new: true }
    );

    // Record Edit Log for CUD operation
    await recordEditLog(req, {
      action: 'UPDATE',
      entityType: 'Container',
      entityId: container.trim(),
      description: `Mapped container alias '${container.trim()}' to actual container number '${actualContainerNo.trim()}' (${shippingLine.trim()})`,
      details: {
        container: container.trim(),
        containerNumber: actualContainerNo.trim(),
        shippingLine: shippingLine.trim(),
        loadingDate: cleanLoadingDate,
      },
      username: modifiedBy,
      role: modifiedByRole,
    });

    return NextResponse.json({
      success: true,
      message: `Updated ${updateResult.modifiedCount} shipment(s) container number mapping successfully`,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      loadingDate: cleanLoadingDate,
      syncedTracking: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update container' },
      { status: 500 }
    );
  }
}
