import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import { translateWarehouse } from '@/lib/translate';
import { indexSingleWarehouseReceipt } from '@/lib/typesense';

export const dynamic = 'force-dynamic';

// POST: Transfer goods (all or selected receipts) from one China warehouse to another
export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Any change in data can only be made by Super Admin.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { fromWarehouse, toWarehouse, receipts, transferAll = false } = body;

    if (!fromWarehouse || typeof fromWarehouse !== 'string' || !fromWarehouse.trim()) {
      return NextResponse.json({ error: 'Source warehouse (fromWarehouse) is required.' }, { status: 400 });
    }
    if (!toWarehouse || typeof toWarehouse !== 'string' || !toWarehouse.trim()) {
      return NextResponse.json({ error: 'Destination warehouse (toWarehouse) is required.' }, { status: 400 });
    }

    const cleanFrom = fromWarehouse.trim();
    const cleanTo = translateWarehouse(toWarehouse.trim());

    // Strict Case-Insensitive Check: YW = yw = Yw = yW
    if (cleanFrom.toLowerCase() === cleanTo.toLowerCase()) {
      return NextResponse.json(
        {
          error: `Source warehouse '${cleanFrom}' and destination warehouse '${cleanTo}' are identical (YW = yw = Yw). Please choose a different destination warehouse to transfer goods.`,
        },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const fromRegex = new RegExp(`^${cleanFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const toRegex = new RegExp(`^${cleanTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Ensure destination warehouse is canonically recorded in Warehouse collection
    let destWarehouse = await Warehouse.findOne({ name: toRegex });
    if (!destWarehouse) {
      destWarehouse = await Warehouse.create({
        name: cleanTo,
        createdAt: new Date(),
      });
    }
    const canonicalDestination = destWarehouse.name;

    // Build filter for receipts to transfer
    const filter: Record<string, any> = { warehouse: fromRegex };
    if (!transferAll && Array.isArray(receipts) && receipts.length > 0) {
      const cleanReceipts = receipts.map((r: any) => String(r).trim()).filter(Boolean);
      filter.receipt = { $in: cleanReceipts };
    }

    // Identify affected receipts
    const receiptsToTransfer = await WarehouseReceipt.find(filter).lean();
    if (receiptsToTransfer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No receipts found in warehouse '${cleanFrom}' matching the transfer criteria.`,
        },
        { status: 404 }
      );
    }

    const transferredReceiptNumbers = receiptsToTransfer.map((r: any) => r.receipt);

    // 1. Update Warehouse Receipts
    const receiptResult = await WarehouseReceipt.updateMany(
      { receipt: { $in: transferredReceiptNumbers } },
      { $set: { warehouse: canonicalDestination } }
    );

    // 2. Update linked Cargo Shipments
    await Shipment.updateMany(
      { receipt: { $in: transferredReceiptNumbers } },
      { $set: { warehouse: canonicalDestination } }
    );

    // 3. If transferring all receipts from warehouse, update container plans if any
    if (transferAll || filter.receipt === undefined) {
      await Container.updateMany(
        { warehouse: fromRegex },
        { $set: { warehouse: canonicalDestination } }
      );
    }

    // 4. Update Typesense full-text search index asynchronously
    try {
      const updatedReceiptDocs = await WarehouseReceipt.find({
        receipt: { $in: transferredReceiptNumbers },
      }).lean();
      for (const doc of updatedReceiptDocs) {
        await indexSingleWarehouseReceipt(doc);
      }
    } catch (tsErr) {
      console.warn('[Typesense] Non-blocking index sync notice during goods transfer:', tsErr);
    }

    // Count remaining items in source warehouse
    const remainingInFrom = await WarehouseReceipt.countDocuments({ warehouse: fromRegex });

    return NextResponse.json({
      success: true,
      transferredCount: transferredReceiptNumbers.length,
      fromWarehouse: cleanFrom,
      toWarehouse: canonicalDestination,
      remainingInFrom,
      message: `Successfully transferred ${transferredReceiptNumbers.length} cargo item(s) from '${cleanFrom}' to '${canonicalDestination}'. ${remainingInFrom} item(s) remaining in '${cleanFrom}'.`,
    });
  } catch (error: any) {
    console.error('Warehouse goods transfer error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to transfer goods between warehouses' },
      { status: 500 }
    );
  }
}
