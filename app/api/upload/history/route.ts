import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import UploadHistory from '@/models/UploadHistory';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import { deleteSingleWarehouseReceipt } from '@/lib/typesense';

export const dynamic = 'force-dynamic';

// GET: Fetch Upload Tracking History
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const warehouse = searchParams.get('warehouse')?.trim();
    const uploadType = searchParams.get('type')?.trim();
    const status = searchParams.get('status')?.trim();

    const query: Record<string, any> = {};
    if (warehouse && warehouse !== 'ALL') {
      query.warehouse = new RegExp(`^${warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }
    if (uploadType && (uploadType === 'stock' || uploadType === 'plan')) {
      query.uploadType = uploadType;
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const history = await UploadHistory.find(query)
      .sort({ uploadedAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch upload history' }, { status: 500 });
  }
}

// DELETE: Delete / Rollback an Upload Batch
export async function DELETE(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    let uploadId = searchParams.get('id')?.trim() || searchParams.get('uploadId')?.trim();

    if (!uploadId) {
      try {
        const body = await req.json();
        uploadId = body.id?.trim() || body.uploadId?.trim();
      } catch {}
    }

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required for deletion' }, { status: 400 });
    }

    const uploadRecord = await UploadHistory.findOne({
      $or: [{ uploadId }, { _id: uploadId.match(/^[0-9a-fA-F]{24}$/) ? uploadId : null }],
    });

    if (!uploadRecord) {
      return NextResponse.json({ error: `Upload record '${uploadId}' not found` }, { status: 404 });
    }

    if (uploadRecord.status === 'Deleted') {
      return NextResponse.json(
        { error: `Upload batch '${uploadRecord.fileName}' has already been deleted and rolled back.` },
        { status: 400 }
      );
    }

    // ── CASE A: DELETE WAREHOUSE STOCK UPLOAD ──
    if (uploadRecord.uploadType === 'stock') {
      // Find all receipts associated with this batch
      let matchingReceipts = await WarehouseReceipt.find({
        $or: [
          { uploadBatchId: uploadRecord.uploadId },
          { receipt: { $in: uploadRecord.receipts || [] }, warehouse: uploadRecord.warehouse },
        ],
      });

      if (matchingReceipts.length === 0) {
        // Nothing in DB, just mark upload as deleted
        uploadRecord.status = 'Deleted';
        uploadRecord.deletedAt = new Date();
        await uploadRecord.save();
        return NextResponse.json({
          success: true,
          message: `Upload tracking record '${uploadRecord.fileName}' marked as deleted (no active records found in stock).`,
        });
      }

      // Check if any of these receipts have been planned/loaded into containers
      const receiptNumbers = matchingReceipts.map((r) => r.receipt);
      const loadedShipments = await Shipment.find({
        receipt: { $in: receiptNumbers },
      }).lean();

      const allocatedMap = new Map<string, string[]>();
      matchingReceipts.forEach((r) => {
        if (r.loadedQuantity && r.loadedQuantity > 0) {
          if (!allocatedMap.has(r.receipt)) allocatedMap.set(r.receipt, []);
        }
      });
      loadedShipments.forEach((s: any) => {
        if (s.receipt) {
          if (!allocatedMap.has(s.receipt)) allocatedMap.set(s.receipt, []);
          if (s.container && !allocatedMap.get(s.receipt)!.includes(s.container)) {
            allocatedMap.get(s.receipt)!.push(s.container);
          }
        }
      });

      if (allocatedMap.size > 0) {
        const allocatedList = Array.from(allocatedMap.keys());
        const containerNames = Array.from(
          new Set(Array.from(allocatedMap.values()).flat().filter(Boolean))
        );
        return NextResponse.json(
          {
            error: `Cannot delete upload: ${allocatedList.length} receipt(s) (${allocatedList.slice(0, 5).join(', ')}${allocatedList.length > 5 ? ` +${allocatedList.length - 5} more` : ''}) are currently loaded in container plan(s) (${containerNames.join(', ')}). Under system integrity rules, first delete or deallocate these loaded cargo items from the container loading plans, then you can delete this upload.`,
            isLoaded: true,
            allocatedReceipts: allocatedList,
            containers: containerNames,
          },
          { status: 400 }
        );
      }

      // Delete the receipts
      const deleteIds = matchingReceipts.map((r) => r._id);
      await WarehouseReceipt.deleteMany({ _id: { $in: deleteIds } });

      // Async delete from Typesense
      deleteIds.forEach((id) => {
        deleteSingleWarehouseReceipt(String(id)).catch(() => {});
      });

      uploadRecord.status = 'Deleted';
      uploadRecord.deletedAt = new Date();
      await uploadRecord.save();

      return NextResponse.json({
        success: true,
        message: `Successfully deleted upload '${uploadRecord.fileName}'. Removed ${deleteIds.length} warehouse receipt(s) from China stock.`,
        deletedCount: deleteIds.length,
        uploadId: uploadRecord.uploadId,
      });
    }

    // ── CASE B: DELETE LOADING PLAN UPLOAD ──
    if (uploadRecord.uploadType === 'plan') {
      const matchingShipments = await Shipment.find({
        $or: [
          { uploadBatchId: uploadRecord.uploadId },
          {
            container: uploadRecord.targetContainer,
            receipt: { $in: uploadRecord.receipts || [] },
          },
        ],
      });

      if (matchingShipments.length === 0) {
        uploadRecord.status = 'Deleted';
        uploadRecord.deletedAt = new Date();
        await uploadRecord.save();
        return NextResponse.json({
          success: true,
          message: `Upload tracking record '${uploadRecord.fileName}' marked as deleted (no active allocations found).`,
        });
      }

      // Restore quantities in WarehouseReceipt
      const affectedContainers = new Set<string>();
      for (const s of matchingShipments) {
        if (s.container) affectedContainers.add(s.container);
        const qtyToRestore = parseInt(String(s.quantity || 0), 10) || 0;
        const receiptNum = s.receipt;

        const whReceipt = await WarehouseReceipt.findOne({
          receipt: new RegExp(`^${receiptNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });

        if (whReceipt) {
          whReceipt.loadedQuantity = Math.max(0, (whReceipt.loadedQuantity || 0) - qtyToRestore);
          whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
          if (whReceipt.loadedQuantity <= 0) {
            whReceipt.status = 'Received';
            whReceipt.stockstatus = 'In Stock';
          } else {
            whReceipt.status = 'Partially Loaded';
            whReceipt.stockstatus = 'Partially Dispatched';
          }
          await whReceipt.save();
        }
      }

      const shipmentIds = matchingShipments.map((s) => s._id);
      await Shipment.deleteMany({ _id: { $in: shipmentIds } });

      // Recalculate container totals
      for (const cAlias of affectedContainers) {
        const totalQty = await Shipment.aggregate([
          { $match: { container: cAlias } },
          { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$quantity', '0'] } } }, count: { $sum: 1 } } },
        ]);
        const newTotal = totalQty.length > 0 ? totalQty[0].total : 0;
        const newCount = totalQty.length > 0 ? totalQty[0].count : 0;

        await Container.updateOne(
          { container: cAlias },
          { $set: { totalQuantity: newTotal, shipmentCount: newCount } }
        );
      }

      uploadRecord.status = 'Deleted';
      uploadRecord.deletedAt = new Date();
      await uploadRecord.save();

      return NextResponse.json({
        success: true,
        message: `Successfully deleted loading plan upload '${uploadRecord.fileName}'. Removed ${shipmentIds.length} cargo allocation(s) and restored warehouse inventory.`,
        deletedCount: shipmentIds.length,
        uploadId: uploadRecord.uploadId,
      });
    }

    return NextResponse.json({ error: 'Unknown upload type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete upload' }, { status: 500 });
  }
}
