import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Warehouse from '@/models/Warehouse';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import {
  translateCommodity,
  translatePackaging,
  translateWarehouse,
  translateMark,
} from '@/lib/translate';
import { indexSingleWarehouseReceipt, deleteSingleWarehouseReceipt } from '@/lib/typesense';

export const dynamic = 'force-dynamic';

// GET: Fetch China Warehouse Inward Receipts
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get('warehouse')?.trim();
  const status = searchParams.get('status')?.trim();
  const search = searchParams.get('search')?.trim();
  const limitParam = searchParams.get('limit');

  try {
    await connectToDatabase();

    const query: Record<string, any> = {};

    if (warehouse && warehouse !== 'ALL') {
      query.warehouse = new RegExp(`^${warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { receipt: regex },
        { warehouse: regex },
        { warehouseEntry: regex },
        { commodity: regex },
        { chinese: regex },
        { english: regex },
        { mainMarka: regex },
        { subMarka: regex },
      ];
    }

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10000) : 500;
    const receipts = await WarehouseReceipt.find(query)
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .lean();

    // Also get distinct warehouse list to populate dropdown
    const distinctWarehouses = await WarehouseReceipt.distinct('warehouse');
    distinctWarehouses.sort();

    return NextResponse.json({
      success: true,
      count: receipts.length,
      receipts,
      warehouses: distinctWarehouses.filter(Boolean),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch warehouse receipts' }, { status: 500 });
  }
}

// POST: Create or Edit Warehouse Inward Receipt
export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { receipt, warehouse, quantity, commodity, packaging, mainMarka, subMarka, loadIntoPlan, loadingPlan, ...rest } = body;

    if (!receipt || !String(receipt).trim()) {
      return NextResponse.json({ error: 'Receipt number is mandatory. An entry cannot be created without a receipt number.' }, { status: 400 });
    }

    if (!body.date || !String(body.date).trim()) {
      return NextResponse.json({ error: 'Receipt Date is mandatory. An entry cannot be created without a receipt date.' }, { status: 400 });
    }

    if (!warehouse || !String(warehouse).trim() || String(warehouse).trim() === 'ALL') {
      return NextResponse.json(
        { error: 'China Warehouse selection is strictly mandatory. You cannot enter received goods until a warehouse is created and selected.' },
        { status: 400 }
      );
    }

    const cleanPlan = loadingPlan ? String(loadingPlan).trim().toUpperCase() : '';
    if (loadIntoPlan && !cleanPlan) {
      return NextResponse.json(
        { error: 'Loading Plan Number (Internal Container Number) is mandatory when loading goods into a plan.' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const totalWarehouses = await Warehouse.countDocuments();
    if (totalWarehouses === 0) {
      return NextResponse.json(
        { error: 'No warehouse found in system. You cannot enter received goods until at least one China warehouse is created. Please create a warehouse first.' },
        { status: 400 }
      );
    }

    const cleanReceipt = receipt.trim();
    const cleanWarehouse = translateWarehouse(warehouse.trim());
    const qtyNumber = parseInt(String(quantity || 0), 10) || 0;

    // Verify warehouse exists in Warehouse collection
    const whDoc = await Warehouse.findOne({
      name: new RegExp(`^${cleanWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (!whDoc) {
      return NextResponse.json(
        { error: `Warehouse '${cleanWarehouse}' does not exist in the system. Please create the warehouse first before receiving goods.` },
        { status: 400 }
      );
    }

    // Chinese to English translation
    const rawCommodity = commodity ? String(commodity).trim() : '';
    const { english: translatedEnglish, chinese: translatedChinese } = translateCommodity(rawCommodity);
    const finalEnglish = rest.english || translatedEnglish;
    const finalChinese = rest.chinese || translatedChinese;
    const finalPackaging = translatePackaging(packaging);
    const finalMainMark = translateMark(mainMarka);
    const finalSubMark = translateMark(subMarka);

    const targetId = rest.id || rest._id || body.id || body._id;
    const isEditMode = Boolean(targetId);

    // Check if receipt already exists in this warehouse (Receipt numbers must be unique warehouse-wise)
    const existingInSameWarehouse = await WarehouseReceipt.findOne({
      receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      warehouse: new RegExp(`^${cleanWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (existingInSameWarehouse && (!isEditMode || String(existingInSameWarehouse._id) !== String(targetId))) {
      return NextResponse.json(
        {
          error: `Duplicate Receipt Error: Receipt #${cleanReceipt} already exists in ${cleanWarehouse}. Every warehouse must have strictly unique receipt numbers.`,
          isDuplicate: true,
          receipt: cleanReceipt,
          warehouse: cleanWarehouse,
        },
        { status: 400 }
      );
    }

    if (isEditMode) {
      const existing = await WarehouseReceipt.findById(targetId);
      if (existing) {
        const oldReceipt = existing.receipt;
        const oldWarehouse = existing.warehouse;

        existing.receipt = cleanReceipt;
        existing.warehouse = cleanWarehouse;
        if (quantity !== undefined) {
          existing.quantity = qtyNumber;
          existing.remainingQuantity = Math.max(0, qtyNumber - (existing.loadedQuantity || 0));
        }
        if (commodity !== undefined) {
          existing.commodity = finalEnglish;
          existing.english = finalEnglish;
          existing.chinese = finalChinese;
        }
        if (packaging !== undefined) existing.packaging = finalPackaging;
        if (mainMarka !== undefined) existing.mainMarka = finalMainMark;
        if (subMarka !== undefined) existing.subMarka = finalSubMark;
        Object.assign(existing, rest);
        await existing.save();

        // Cascade update across all mapped Shipment records throughout the database
        const shipmentUpdates: Record<string, any> = {
          receipt: cleanReceipt,
          warehouse: cleanWarehouse,
          commodity: existing.commodity,
          english: existing.english,
          chinese: existing.chinese,
          packaging: existing.packaging,
          mainMarka: existing.mainMarka,
          subMarka: existing.subMarka,
        };
        if (existing.party !== undefined) shipmentUpdates.party = existing.party;
        if (existing.quantity !== undefined) shipmentUpdates.originalTotalQuantity = String(existing.quantity);
        if (existing.weight !== undefined) shipmentUpdates.weight = existing.weight;
        if (existing.volume !== undefined) shipmentUpdates.volume = existing.volume;

        const oldReceiptRegex = new RegExp(`^${oldReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const cascadeRes = await Shipment.updateMany(
          {
            $or: [
              { receiptId: existing._id },
              { receipt: oldReceiptRegex },
            ],
          },
          { $set: shipmentUpdates }
        );

        indexSingleWarehouseReceipt(existing).catch(() => {});

        return NextResponse.json({
          success: true,
          message: `Warehouse receipt '${cleanReceipt}' updated successfully in ${cleanWarehouse}.${cascadeRes.modifiedCount > 0 ? ` Cascaded updates across ${cascadeRes.modifiedCount} mapped shipment(s).` : ''}`,
          receipt: existing,
          cascadedShipments: cascadeRes.modifiedCount,
        });
      }
    }

    // Create new
    const isPlanAllocation = Boolean(loadIntoPlan && cleanPlan);
    const initialLoaded = isPlanAllocation ? qtyNumber : 0;
    const initialRemaining = isPlanAllocation ? 0 : qtyNumber;
    const initialStatus = isPlanAllocation ? 'Fully Loaded' : 'Received';
    const initialStockStatus = isPlanAllocation ? 'Dispatched' : 'In Stock';

    const newReceipt = await WarehouseReceipt.create({
      receipt: cleanReceipt,
      warehouse: cleanWarehouse,
      quantity: qtyNumber,
      loadedQuantity: initialLoaded,
      remainingQuantity: initialRemaining,
      commodity: finalEnglish,
      chinese: finalChinese,
      english: finalEnglish,
      packaging: finalPackaging,
      mainMarka: finalMainMark,
      subMarka: finalSubMark,
      status: initialStatus,
      stockstatus: initialStockStatus,
      uploadedAt: new Date(),
      ...rest,
    });

    if (isPlanAllocation) {
      let containerDoc = await Container.findOne({ container: cleanPlan });
      if (!containerDoc) {
        containerDoc = await Container.create({
          container: cleanPlan,
          planNumber: cleanPlan,
          containerNumber: '',
          shippingLine: 'MSC',
          warehouse: cleanWarehouse,
          planStatus: 'Planning',
          isFinalized: false,
          shippedFrom: `${cleanWarehouse}, China`,
          shippedTo: 'Nhava Sheva / Mundra, India',
          status: 'Planning',
          eta: 'Pending',
          totalQuantity: 0,
          shipmentCount: 0,
        });
      }

      await Shipment.create({
        receipt: cleanReceipt,
        receiptId: newReceipt._id,
        party: newReceipt.party || 'General Party',
        container: cleanPlan,
        containerNumber: containerDoc.containerNumber || '',
        shippingLine: containerDoc.shippingLine || 'MSC',
        stockstatus: 'Dispatched',
        warehouse: cleanWarehouse,
        date: newReceipt.date || new Date().toISOString().split('T')[0],
        quantity: String(qtyNumber),
        weight: newReceipt.weight || '',
        volume: newReceipt.volume || '',
        commodity: finalEnglish,
        chinese: finalChinese,
        english: finalEnglish,
        packaging: finalPackaging,
        subMarka: finalSubMark,
        mainMarka: finalMainMark,
        shippedTo: 'Nhava Sheva / Mundra, India',
        status: 'Pending',
        eta: containerDoc.eta || 'Pending',
        uploadedAt: new Date(),
      });

      const totalQty = await Shipment.aggregate([
        { $match: { container: cleanPlan } },
        { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$quantity', '0'] } } }, count: { $sum: 1 } } },
      ]);
      if (totalQty.length > 0) {
        await Container.updateOne(
          { container: cleanPlan },
          { $set: { totalQuantity: totalQty[0].total, shipmentCount: totalQty[0].count } }
        );
      }
    }

    // Async index to Typesense
    indexSingleWarehouseReceipt(newReceipt).catch(() => {});

    return NextResponse.json({
      success: true,
      message: isPlanAllocation
        ? `Warehouse receipt '${cleanReceipt}' created and loaded into Plan '${cleanPlan}' in ${cleanWarehouse}`
        : `Warehouse receipt '${cleanReceipt}' created successfully in ${cleanWarehouse}`,
      receipt: newReceipt,
    });
  } catch (error: any) {
    if (error?.code === 11000 || (error?.message && error.message.includes('E11000 duplicate key error'))) {
      return NextResponse.json(
        {
          error: `Duplicate Receipt Error: A receipt with this number already exists in this warehouse. Every warehouse must have strictly unique receipt numbers.`,
          isDuplicate: true,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error?.message || 'Failed to save warehouse receipt' }, { status: 500 });
  }
}

// DELETE: Delete Wrongly Uploaded Warehouse Receipt
export async function DELETE(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id')?.trim();
  const receipt = searchParams.get('receipt')?.trim();
  const unloadFirst = searchParams.get('unloadFirst') === 'true' || searchParams.get('force') === 'true';

  if (!id && !receipt) {
    return NextResponse.json({ error: 'Receipt ID or Receipt Number is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const query: Record<string, any> = id ? { _id: id } : { receipt: new RegExp(`^${receipt!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    const existing: any = await WarehouseReceipt.findOne(query);

    if (!existing) {
      return NextResponse.json({ error: 'Warehouse receipt not found' }, { status: 404 });
    }

    // Check if any goods from this receipt have already been loaded and planned into containers
    const loadedShipments = await Shipment.find({
      receipt: new RegExp(`^${existing.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }).lean();

    const isLoaded = (existing.loadedQuantity && existing.loadedQuantity > 0) || loadedShipments.length > 0;

    if (isLoaded && unloadFirst) {
      // Process Rule: Unmark and unload this receipt from all mapped container plans
      for (const s of loadedShipments) {
        const qty = parseInt(String(s.quantity || 0), 10) || 0;
        if (s.container) {
          await Container.findOneAndUpdate(
            { container: s.container },
            {
              $inc: {
                shipmentCount: -1,
                totalQuantity: -qty,
              },
            }
          );
        }
        await Shipment.findByIdAndDelete(s._id);
      }
    } else if (isLoaded) {
      const containers = Array.from(new Set(loadedShipments.map((s: any) => s.container).filter(Boolean)));
      const containerDetails = containers.map((c) => {
        const matchingShipments = loadedShipments.filter((s: any) => s.container === c);
        const ctn = matchingShipments.reduce((sum: number, s: any) => sum + (parseInt(String(s.quantity || 0), 10) || 0), 0);
        return {
          container: c,
          quantity: ctn,
          carrierContainerNumber: matchingShipments[0]?.containerNumber || '',
          shippingLine: matchingShipments[0]?.shippingLine || '',
        };
      });
      const containerText = containers.length > 0 ? containers.join(', ') : 'container plan(s)';
      const cartonsLoaded = existing.loadedQuantity || loadedShipments.reduce((sum: number, s: any) => sum + (parseInt(s.quantity, 10) || 0), 0);

      return NextResponse.json(
        {
          error: `Cannot delete received goods record '${existing.receipt}': ${cartonsLoaded} carton(s) are currently loaded and mapped in ${containerText}. Under process rules, this cargo must be unmarked/unloaded from the container(s) before it can be deleted from the software.`,
          isLoaded: true,
          loadedQuantity: cartonsLoaded,
          containers,
          containerDetails,
        },
        { status: 400 }
      );
    }

    await WarehouseReceipt.findByIdAndDelete(existing._id);

    // Async delete from Typesense
    deleteSingleWarehouseReceipt(String(existing._id)).catch(() => {});

    return NextResponse.json({
      success: true,
      message: isLoaded && unloadFirst
        ? `Successfully unmarked/unloaded receipt '${existing.receipt}' from container(s) and deleted entry from software.`
        : `Warehouse receipt '${existing.receipt}' deleted successfully.`,
      receipt: existing.receipt,
      unloadedFirst: Boolean(isLoaded && unloadFirst),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete warehouse receipt' }, { status: 500 });
  }
}
