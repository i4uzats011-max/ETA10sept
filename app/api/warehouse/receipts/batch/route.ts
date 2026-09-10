import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import {
  translateCommodity,
  translatePackaging,
  translateWarehouse,
  translateMark,
} from '@/lib/translate';
import { deleteSingleWarehouseReceipt, indexSingleWarehouseReceipt } from '@/lib/typesense';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, ids, receipts, updates, force } = body;

    await connectToDatabase();

    // ── 1. BULK DELETE ──
    if (action === 'bulk-delete') {
      if ((!ids || ids.length === 0) && (!receipts || receipts.length === 0)) {
        return NextResponse.json(
          { error: 'No receipt IDs or numbers provided for deletion.' },
          { status: 400 }
        );
      }

      const query: Record<string, any> = {};
      if (ids && ids.length > 0) {
        query._id = { $in: ids };
      } else if (receipts && receipts.length > 0) {
        query.receipt = { $in: receipts };
      }

      const matchingReceipts = await WarehouseReceipt.find(query);
      if (matchingReceipts.length === 0) {
        return NextResponse.json(
          { error: 'No matching warehouse receipts found to delete.' },
          { status: 404 }
        );
      }

      // Check for allocated/loaded cargo in plans
      const receiptNumbers = matchingReceipts.map((r) => r.receipt);
      const loadedShipments = await Shipment.find({
        receipt: { $in: receiptNumbers },
      }).lean();

      const allocatedReceiptSet = new Set<string>();
      matchingReceipts.forEach((r) => {
        if (r.loadedQuantity && r.loadedQuantity > 0) allocatedReceiptSet.add(r.receipt);
      });
      loadedShipments.forEach((s) => {
        if (s.receipt) allocatedReceiptSet.add(s.receipt);
      });

      if (allocatedReceiptSet.size > 0) {
        const allocatedList = Array.from(allocatedReceiptSet);
        return NextResponse.json(
          {
            error: `Cannot delete: ${allocatedList.length} of the selected receipt(s) (${allocatedList.join(', ')}) are currently loaded and planned in container(s). Under system integrity rules, goods loaded in a plan cannot be deleted from received goods list. First delete/de-allocate them from the planned list, then delete them from received goods.`,
            isLoaded: true,
            allocatedReceipts: allocatedList,
          },
          { status: 400 }
        );
      }

      const deletedIds = matchingReceipts.map((r) => r._id);
      const deletedNumbers = matchingReceipts.map((r) => r.receipt);

      await WarehouseReceipt.deleteMany({ _id: { $in: deletedIds } });

      // Async remove from Typesense
      deletedIds.forEach((delId) => {
        deleteSingleWarehouseReceipt(String(delId)).catch(() => {});
      });

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${deletedIds.length} warehouse receipt(s) from China stock.`,
        deletedCount: deletedIds.length,
        deletedReceipts: deletedNumbers,
      });
    }

    // ── 2. BULK EDIT ──
    if (action === 'bulk-edit') {
      if ((!ids || ids.length === 0) && (!receipts || receipts.length === 0)) {
        return NextResponse.json(
          { error: 'No receipt IDs or numbers provided for bulk edit.' },
          { status: 400 }
        );
      }

      if (!updates || Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: 'No update fields provided.' },
          { status: 400 }
        );
      }

      const query: Record<string, any> = {};
      if (ids && ids.length > 0) {
        query._id = { $in: ids };
      } else if (receipts && receipts.length > 0) {
        query.receipt = { $in: receipts };
      }

      const matchingReceipts = await WarehouseReceipt.find(query);
      if (matchingReceipts.length === 0) {
        return NextResponse.json(
          { error: 'No matching warehouse receipts found to edit.' },
          { status: 404 }
        );
      }

      // Prepare translation and clean updates
      const preparedUpdates: Record<string, any> = {};

      if (updates.warehouse !== undefined && updates.warehouse.trim() !== '') {
        preparedUpdates.warehouse = translateWarehouse(updates.warehouse.trim());
      }
      if (updates.party !== undefined) {
        preparedUpdates.party = updates.party.trim();
      }
      if (updates.date !== undefined && updates.date.trim() !== '') {
        preparedUpdates.date = updates.date.trim();
      }
      if (updates.packaging !== undefined && updates.packaging.trim() !== '') {
        preparedUpdates.packaging = translatePackaging(updates.packaging.trim());
      }
      if (updates.commodity !== undefined && updates.commodity.trim() !== '') {
        const { english, chinese } = translateCommodity(updates.commodity.trim());
        preparedUpdates.commodity = english;
        preparedUpdates.english = english;
        preparedUpdates.chinese = chinese;
      }
      if (updates.english !== undefined && updates.english.trim() !== '') {
        preparedUpdates.english = updates.english.trim();
        if (!preparedUpdates.commodity) preparedUpdates.commodity = updates.english.trim();
      }
      if (updates.mainMarka !== undefined) {
        preparedUpdates.mainMarka = translateMark(updates.mainMarka.trim());
      }
      if (updates.subMarka !== undefined) {
        preparedUpdates.subMarka = translateMark(updates.subMarka.trim());
      }
      if (updates.weight !== undefined && updates.weight.trim() !== '') {
        preparedUpdates.weight = updates.weight.trim();
      }
      if (updates.volume !== undefined && updates.volume.trim() !== '') {
        preparedUpdates.volume = updates.volume.trim();
      }
      if (updates.notes !== undefined) {
        preparedUpdates.notes = updates.notes.trim();
      }

      if (Object.keys(preparedUpdates).length === 0) {
        return NextResponse.json(
          { error: 'No valid fields provided to update.' },
          { status: 400 }
        );
      }

      if (preparedUpdates.warehouse) {
        const targetWhRegex = new RegExp(`^${preparedUpdates.warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const receiptNumbers = matchingReceipts.map((r) => r.receipt);
        const matchingIds = matchingReceipts.map((r) => r._id);
        const colliding = await WarehouseReceipt.find({
          receipt: { $in: receiptNumbers },
          warehouse: targetWhRegex,
          _id: { $nin: matchingIds },
        }).lean();

        if (colliding.length > 0) {
          const collidingNumbers = Array.from(new Set(colliding.map((c: any) => c.receipt)));
          return NextResponse.json(
            {
              error: `Duplicate Receipt Error: Cannot move selected receipt(s) to '${preparedUpdates.warehouse}' because ${collidingNumbers.length} receipt(s) (${collidingNumbers.join(', ')}) already exist in '${preparedUpdates.warehouse}'. Every warehouse must have strictly unique receipt numbers.`,
              isDuplicate: true,
              collidingReceipts: collidingNumbers,
            },
            { status: 400 }
          );
        }
      }

      preparedUpdates.updatedAt = new Date();

      // Perform update on WarehouseReceipt documents
      await WarehouseReceipt.updateMany(query, { $set: preparedUpdates });

      // If commodity, marks, party, or warehouse were changed, also propagate to any active Shipment records
      const shipmentUpdates: Record<string, any> = {};
      if (preparedUpdates.party !== undefined) shipmentUpdates.party = preparedUpdates.party;
      if (preparedUpdates.commodity !== undefined) shipmentUpdates.commodity = preparedUpdates.commodity;
      if (preparedUpdates.english !== undefined) shipmentUpdates.english = preparedUpdates.english;
      if (preparedUpdates.chinese !== undefined) shipmentUpdates.chinese = preparedUpdates.chinese;
      if (preparedUpdates.mainMarka !== undefined) shipmentUpdates.mainMarka = preparedUpdates.mainMarka;
      if (preparedUpdates.subMarka !== undefined) shipmentUpdates.subMarka = preparedUpdates.subMarka;
      if (preparedUpdates.packaging !== undefined) shipmentUpdates.packaging = preparedUpdates.packaging;
      if (preparedUpdates.warehouse !== undefined) shipmentUpdates.warehouse = preparedUpdates.warehouse;

      if (Object.keys(shipmentUpdates).length > 0) {
        const receiptNumbers = matchingReceipts.map((r) => r.receipt);
        await Shipment.updateMany(
          { receipt: { $in: receiptNumbers } },
          { $set: shipmentUpdates }
        );
      }

      const updatedReceipts = await WarehouseReceipt.find(query).lean();

      // Async index updated receipts to Typesense
      updatedReceipts.forEach((r) => {
        indexSingleWarehouseReceipt(r).catch(() => {});
      });

      return NextResponse.json({
        success: true,
        message: `Successfully updated ${matchingReceipts.length} warehouse receipt(s).`,
        count: matchingReceipts.length,
        receipts: updatedReceipts,
      });
    }

    return NextResponse.json(
      { error: `Invalid action '${action}'. Expected 'bulk-delete' or 'bulk-edit'.` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to process bulk operation' },
      { status: 500 }
    );
  }
}
