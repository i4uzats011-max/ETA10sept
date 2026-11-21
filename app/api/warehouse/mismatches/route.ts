import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/lib/auth';
import ChinaSyncMismatch from '@/models/ChinaSyncMismatch';
import WarehouseReceipt from '@/models/WarehouseReceipt';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const searchParams = req.nextUrl.searchParams;
    const warehouse = searchParams.get('warehouse');
    const status = searchParams.get('status') || 'PENDING';
    const period = searchParams.get('period');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const query: any = {};
    if (warehouse && warehouse !== 'ALL') {
      query.warehouse = warehouse.toUpperCase();
    }
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (period && period !== 'ALL') {
      query.auditPeriod = period;
    }
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { receipt: new RegExp(q, 'i') },
        { diffSummary: new RegExp(q, 'i') },
        { 'portalData.mark': new RegExp(q, 'i') },
        { 'dbData.mainMarka': new RegExp(q, 'i') },
      ];
    }

    const [total, mismatches] = await Promise.all([
      ChinaSyncMismatch.countDocuments(query),
      ChinaSyncMismatch.find(query)
        .sort({ detectedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      mismatches,
    });
  } catch (err: any) {
    console.error('[API Mismatches GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    // Bulk Accept All China Values into DB
    if (body.bulkAction === 'ACCEPT_ALL_CHINA') {
      const pendingList = await ChinaSyncMismatch.find({ status: 'PENDING' });
      let updatedCount = 0;
      for (const m of pendingList) {
        const portal = m.portalData || {};
        const updateData: any = {};
        const existingReceipt = await WarehouseReceipt.findOne({ receipt: m.receipt, warehouse: m.warehouse });
        const loadedQty = existingReceipt ? Number(existingReceipt.loadedQuantity || 0) : 0;
        const portalQty = portal.actualQuantity !== undefined ? Number(portal.actualQuantity || 0) : undefined;

        if (portalQty !== undefined) {
          updateData.remainingQuantity = portalQty;
          updateData.quantity = loadedQty > 0 ? (portalQty + loadedQty) : portalQty;
        }
        if (portal.weight !== undefined) {
          if (loadedQty === 0) updateData.weight = portal.weight;
          updateData.remainingWeight = portal.weight;
        }
        if (portal.volume !== undefined) {
          if (loadedQty === 0) updateData.volume = portal.volume;
          updateData.remainingVolume = portal.volume;
        }
        if (portal.mark) updateData.mainMarka = portal.mark;

        await WarehouseReceipt.findOneAndUpdate(
          { receipt: m.receipt, warehouse: m.warehouse },
          {
            $set: {
              ...updateData,
              hasMismatch: false,
              isVerified: true,
              verifiedAt: new Date(),
            },
          }
        );
        m.status = 'RESOLVED';
        m.resolutionAction = 'ACCEPT_CHINA';
        m.resolvedAt = new Date();
        m.resolutionNotes = 'Bulk accepted China portal updated values';
        await m.save();
        updatedCount++;
      }
      return NextResponse.json({
        success: true,
        message: `Updated ${updatedCount} receipt(s) in DB with exact Chinese warehouse data!`,
        updatedCount,
      });
    }

    const { id, action, notes } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
    }

    const mismatch = await ChinaSyncMismatch.findById(id);
    if (!mismatch) {
      return NextResponse.json({ error: 'Mismatch record not found' }, { status: 404 });
    }

    if (action === 'ACCEPT_CHINA') {
      // Overwrite DB receipt with China portal numbers, respecting loaded quantity
      const portal = mismatch.portalData || {};
      const updateData: any = {};
      const existingReceipt = await WarehouseReceipt.findOne({ receipt: mismatch.receipt, warehouse: mismatch.warehouse });
      const loadedQty = existingReceipt ? Number(existingReceipt.loadedQuantity || 0) : 0;
      const portalQty = portal.actualQuantity !== undefined ? Number(portal.actualQuantity || 0) : undefined;

      if (portalQty !== undefined) {
        updateData.remainingQuantity = portalQty;
        updateData.quantity = loadedQty > 0 ? (portalQty + loadedQty) : portalQty;
      }
      if (portal.weight !== undefined) {
        if (loadedQty === 0) updateData.weight = portal.weight;
        updateData.remainingWeight = portal.weight;
      }
      if (portal.volume !== undefined) {
        if (loadedQty === 0) updateData.volume = portal.volume;
        updateData.remainingVolume = portal.volume;
      }
      if (portal.mark) {
        updateData.mainMarka = portal.mark;
      }

      await WarehouseReceipt.findOneAndUpdate(
        { receipt: mismatch.receipt, warehouse: mismatch.warehouse },
        {
          $set: {
            ...updateData,
            hasMismatch: false,
            isVerified: true,
            verifiedAt: new Date(),
          },
        }
      );

      mismatch.status = 'RESOLVED';
      mismatch.resolutionAction = 'ACCEPT_CHINA';
      mismatch.resolvedAt = new Date();
      mismatch.resolutionNotes = notes || 'Accepted China Portal updated values';
      await mismatch.save();

      return NextResponse.json({
        success: true,
        message: 'Accepted China Portal values and updated DB receipt',
        mismatch,
      });
    } else if (action === 'KEEP_DB') {
      // Keep DB as-is, mark mismatch as resolved
      await WarehouseReceipt.findOneAndUpdate(
        { receipt: mismatch.receipt, warehouse: mismatch.warehouse },
        {
          $set: {
            hasMismatch: false,
            isVerified: true,
            verifiedAt: new Date(),
          },
        }
      );

      mismatch.status = 'RESOLVED';
      mismatch.resolutionAction = 'KEEP_DB';
      mismatch.resolvedAt = new Date();
      mismatch.resolutionNotes = notes || 'Preserved local warehouse DB values';
      await mismatch.save();

      return NextResponse.json({
        success: true,
        message: 'Preserved DB values and resolved mismatch',
        mismatch,
      });
    } else if (action === 'IGNORE') {
      mismatch.status = 'IGNORED';
      mismatch.resolutionAction = 'MANUAL';
      mismatch.resolutionNotes = notes || 'Ignored by administrator';
      await mismatch.save();

      return NextResponse.json({
        success: true,
        message: 'Mismatch marked as ignored',
        mismatch,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Mismatches PATCH] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
