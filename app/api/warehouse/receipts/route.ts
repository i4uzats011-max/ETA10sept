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
        { 'items.itemName': regex },
        { 'items.english': regex },
        { 'items.chinese': regex },
      ];
    }

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50000) : 20000;
    const receipts = await WarehouseReceipt.find(query)
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .lean();

    // Attach active container allocations to each receipt (Warehouse-Isolated)
    const receiptIds = receipts.map((r: any) => r._id);
    const receiptWarehousePairs = receipts.map((r: any) => ({
      receipt: r.receipt,
      warehouse: r.warehouse,
    }));

    const activeShipments = await Shipment.find({
      $or: [
        { receiptId: { $in: receiptIds } },
        ...receiptWarehousePairs.map((p: any) => ({
          receipt: new RegExp(`^${(p.receipt || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          warehouse: new RegExp(`^${(p.warehouse || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        })),
      ],
    })
      .select('receipt receiptId warehouse container containerNumber shippingLine quantity isDelivered deliveryDate status')
      .lean();

    const containerMapById = new Map<string, Array<{ container: string; containerNumber?: string; shippingLine?: string; quantity: string | number; warehouse?: string; isDelivered?: boolean; deliveryDate?: string; status?: string }>>();
    const containerMapByWarehouseAndNum = new Map<string, Array<{ container: string; containerNumber?: string; shippingLine?: string; quantity: string | number; warehouse?: string; isDelivered?: boolean; deliveryDate?: string; status?: string }>>();

    for (const s of activeShipments) {
      const entry = {
        container: s.container,
        containerNumber: s.containerNumber || '',
        shippingLine: s.shippingLine || 'MSC',
        quantity: s.quantity || '0',
        warehouse: s.warehouse || '',
        isDelivered: Boolean(s.isDelivered),
        deliveryDate: s.deliveryDate || '',
        status: s.status || '',
      };
      if (s.receiptId) {
        const idKey = String(s.receiptId);
        if (!containerMapById.has(idKey)) containerMapById.set(idKey, []);
        containerMapById.get(idKey)!.push(entry);
      }
      if (s.receipt && s.warehouse) {
        const compositeKey = `${s.warehouse.trim().toLowerCase()}___${s.receipt.trim().toUpperCase()}`;
        if (!containerMapByWarehouseAndNum.has(compositeKey)) containerMapByWarehouseAndNum.set(compositeKey, []);
        containerMapByWarehouseAndNum.get(compositeKey)!.push(entry);
      }
    }

    const enhancedReceipts = receipts.map((r: any) => {
      const idKey = String(r._id);
      const rWh = (r.warehouse || '').trim().toLowerCase();
      const compositeKey = `${rWh}___${(r.receipt || '').trim().toUpperCase()}`;

      let rawContainers = containerMapById.get(idKey);
      // Filter out any cross-warehouse contamination if rawContainers has mismatching warehouse
      if (rawContainers && rWh) {
        rawContainers = rawContainers.filter((c) => !c.warehouse || c.warehouse.trim().toLowerCase() === rWh);
      }
      const containers = (rawContainers && rawContainers.length > 0)
        ? rawContainers
        : (containerMapByWarehouseAndNum.get(compositeKey) || []);

      // Calculate actual loaded and delivered cartons from active shipments
      let actualLoaded = 0;
      let actualDelivered = 0;
      for (const c of containers) {
        const q = parseInt(String(c.quantity || 0), 10);
        if (!isNaN(q)) {
          actualLoaded += q;
          if (c.isDelivered) {
            actualDelivered += q;
          }
        }
      }

      const totalQty = r.quantity || 0;
      const hasContainers = containers.length > 0 && actualLoaded > 0;
      const loaded = hasContainers ? actualLoaded : 0;
      const remaining = Math.max(0, totalQty - loaded);

      let status = 'Received in Warehouse';
      let isDelivered = false;

      if (actualDelivered > 0) {
        // Some or all goods were delivered
        if (actualDelivered >= totalQty && totalQty > 0 && remaining === 0) {
          status = 'Delivered';
          isDelivered = true;
        } else {
          status = 'Partially Delivered';
          isDelivered = false;
        }
      } else if (hasContainers) {
        if (loaded >= totalQty && totalQty > 0) {
          status = 'Fully Loaded';
        } else {
          status = 'Partially Loaded';
        }
      }

      return {
        ...r,
        loadedQuantity: loaded,
        remainingQuantity: remaining,
        deliveredQuantity: actualDelivered,
        isDelivered,
        status,
        containers,
      };
    });

    // Also get distinct warehouse list to populate dropdown
    const distinctWarehouses = await WarehouseReceipt.distinct('warehouse');
    distinctWarehouses.sort();

    return NextResponse.json({
      success: true,
      count: enhancedReceipts.length,
      receipts: enhancedReceipts,
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

    // Process multiple items if provided
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const processedItems = rawItems
      .filter((it: any) => it && (it.itemName || it.commodity || it.english || it.quantity))
      .map((it: any) => {
        const rawName = String(it.itemName || it.commodity || it.english || '').trim();
        const { english: itEn, chinese: itCn } = translateCommodity(rawName);
        return {
          itemName: rawName,
          english: it.english || itEn,
          chinese: it.chinese || itCn,
          quantity: parseInt(String(it.quantity || 0), 10) || 0,
          packaging: translatePackaging(it.packaging || packaging || 'Carton'),
          weight: it.weight ? String(it.weight).trim() : '',
          volume: it.volume ? String(it.volume).trim() : '',
          mainMarka: it.mainMarka ? translateMark(it.mainMarka) : finalMainMark,
          subMarka: it.subMarka ? translateMark(it.subMarka) : finalSubMark,
        };
      });

    // If multiple items provided, auto-calculate total quantity and composite commodity string
    let effectiveQuantity = qtyNumber;
    let effectiveCommodity = finalEnglish;
    let effectiveChinese = finalChinese;

    if (processedItems.length > 0) {
      const itemsSum = processedItems.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
      if (itemsSum > 0) {
        effectiveQuantity = itemsSum;
      }
      if (!rawCommodity || rawCommodity === 'General Goods') {
        effectiveCommodity = processedItems.map((it: any) => `${it.itemName}${it.quantity ? ` (${it.quantity} CTN)` : ''}`).join(', ');
        effectiveChinese = processedItems.map((it: any) => it.chinese).filter(Boolean).join(', ');
      }
    }

    const targetId = rest.id || rest._id || body.id || body._id;
    const isEditMode = Boolean(targetId);

    // Check if receipt already exists in this warehouse (Receipt numbers must be unique warehouse-wise)
    const existingInSameWarehouse = await WarehouseReceipt.findOne({
      receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      warehouse: new RegExp(`^${cleanWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    const isExistingDifferentDoc = Boolean(existingInSameWarehouse && (!isEditMode || String(existingInSameWarehouse._id) !== String(targetId)));
    const shouldAppendStock = Boolean(existingInSameWarehouse && (body.appendStock || body.addFoundStock || body.allowAppend));

    if (isExistingDifferentDoc && !shouldAppendStock) {
      return NextResponse.json(
        {
          error: `Duplicate Receipt Error: Receipt #${cleanReceipt} already exists in ${cleanWarehouse}. Every warehouse must have strictly unique receipt numbers.`,
          isDuplicate: true,
          receipt: cleanReceipt,
          warehouse: cleanWarehouse,
          existingReceipt: {
            _id: existingInSameWarehouse!._id,
            receipt: existingInSameWarehouse!.receipt,
            warehouse: existingInSameWarehouse!.warehouse,
            quantity: existingInSameWarehouse!.quantity,
            loadedQuantity: existingInSameWarehouse!.loadedQuantity || 0,
            remainingQuantity: existingInSameWarehouse!.remainingQuantity || 0,
            status: existingInSameWarehouse!.status,
            isDelivered: Boolean(existingInSameWarehouse!.isDelivered),
            party: existingInSameWarehouse!.party,
          },
          canAppend: true,
        },
        { status: 400 }
      );
    }

    if (shouldAppendStock && existingInSameWarehouse) {
      // Staff is adjusting godown stock (can add positive or negative quantities, weights, volumes)
      const addedQty = effectiveQuantity;
      const newTotalQty = (existingInSameWarehouse.quantity || 0) + addedQty;

      // Recalculate mapped shipments
      const mappedShipments = await Shipment.find({
        $or: [
          { receiptId: existingInSameWarehouse._id },
          {
            receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            warehouse: new RegExp(`^${cleanWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          },
        ],
      });
      const actualLoaded = mappedShipments.reduce((sum, s) => sum + (parseInt(String(s.quantity || 0), 10) || 0), 0);
      const deliveredShipments = mappedShipments.filter((s) => Boolean(s.isDelivered));

      if (newTotalQty < actualLoaded) {
        return NextResponse.json(
          {
            error: `Cannot reduce total quantity (${newTotalQty} CTN) below already loaded quantity (${actualLoaded} CTN). At most you can reduce ${existingInSameWarehouse.quantity - actualLoaded} CTN.`,
          },
          { status: 400 }
        );
      }

      if (newTotalQty < 0) {
        return NextResponse.json(
          {
            error: `Total quantity cannot be negative (${newTotalQty} CTN).`,
          },
          { status: 400 }
        );
      }

      existingInSameWarehouse.quantity = newTotalQty;
      existingInSameWarehouse.loadedQuantity = actualLoaded;
      existingInSameWarehouse.remainingQuantity = Math.max(0, newTotalQty - actualLoaded);

      if (existingInSameWarehouse.remainingQuantity > 0) {
        existingInSameWarehouse.isDelivered = false;
        existingInSameWarehouse.status = deliveredShipments.length > 0 ? 'Partially Delivered' : (actualLoaded > 0 ? 'Partially Loaded' : 'Received in Warehouse');
        existingInSameWarehouse.stockstatus = deliveredShipments.length > 0 ? 'Partially Delivered' : (actualLoaded > 0 ? 'Partially Dispatched' : 'In Stock');
      } else {
        if (actualLoaded > 0 && deliveredShipments.length > 0 && deliveredShipments.length === mappedShipments.length) {
          existingInSameWarehouse.isDelivered = true;
          existingInSameWarehouse.status = 'Delivered';
          existingInSameWarehouse.stockstatus = 'Delivered';
        } else if (actualLoaded > 0) {
          existingInSameWarehouse.isDelivered = false;
          existingInSameWarehouse.status = 'Fully Loaded';
          existingInSameWarehouse.stockstatus = 'Dispatched';
        } else {
          existingInSameWarehouse.isDelivered = false;
          existingInSameWarehouse.status = 'Received in Warehouse';
          existingInSameWarehouse.stockstatus = 'In Stock';
        }
      }

      // Add or reduce weight (KG) and volume (CBM)
      const addedWeightNum = parseFloat(String(body.addedWeight !== undefined ? body.addedWeight : (body.weight || 0))) || 0;
      const addedVolumeNum = parseFloat(String(body.addedVolume !== undefined ? body.addedVolume : (body.volume || 0))) || 0;

      if (addedWeightNum !== 0) {
        const curWeightNum = parseFloat(String(existingInSameWarehouse.weight || 0)) || 0;
        const newWeightNum = Math.max(0, Math.round((curWeightNum + addedWeightNum) * 1000) / 1000);
        existingInSameWarehouse.weight = String(newWeightNum);
      }
      if (addedVolumeNum !== 0) {
        const curVolumeNum = parseFloat(String(existingInSameWarehouse.volume || 0)) || 0;
        const newVolumeNum = Math.max(0, Math.round((curVolumeNum + addedVolumeNum) * 1000) / 1000);
        existingInSameWarehouse.volume = String(newVolumeNum);
      }

      await existingInSameWarehouse.save();

      // Update all mapped shipments to isSplit: true and update originalTotalQuantity
      await Shipment.updateMany(
        {
          $or: [
            { receiptId: existingInSameWarehouse._id },
            {
              receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              warehouse: new RegExp(`^${cleanWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            },
          ],
        },
        {
          $set: {
            isSplit: true,
            originalTotalQuantity: String(newTotalQty),
          },
        }
      );

      // If user chose to immediately load the newly found packages into a container plan:
      if (loadIntoPlan && cleanPlan && addedQty > 0) {
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
          receiptId: existingInSameWarehouse._id,
          party: existingInSameWarehouse.party || 'General Party',
          container: cleanPlan,
          containerNumber: containerDoc.containerNumber || '',
          shippingLine: containerDoc.shippingLine || 'MSC',
          stockstatus: 'Dispatched',
          warehouse: cleanWarehouse,
          date: existingInSameWarehouse.date || new Date().toISOString().split('T')[0],
          quantity: String(addedQty),
          originalTotalQuantity: String(newTotalQty),
          isSplit: true,
          splitIndex: mappedShipments.length + 1,
          weight: rest.weight || existingInSameWarehouse.weight || '',
          volume: rest.volume || existingInSameWarehouse.volume || '',
          commodity: existingInSameWarehouse.commodity || finalEnglish,
          chinese: existingInSameWarehouse.chinese || finalChinese,
          english: existingInSameWarehouse.english || finalEnglish,
          packaging: existingInSameWarehouse.packaging || finalPackaging,
          subMarka: existingInSameWarehouse.subMarka || finalSubMark,
          mainMarka: existingInSameWarehouse.mainMarka || finalMainMark,
          shippedTo: 'Nhava Sheva / Mundra, India',
          status: 'Loaded',
          eta: containerDoc.eta || 'Pending',
          uploadedAt: new Date(),
        });

        existingInSameWarehouse.loadedQuantity += addedQty;
        existingInSameWarehouse.remainingQuantity = Math.max(0, newTotalQty - existingInSameWarehouse.loadedQuantity);
        if (existingInSameWarehouse.remainingQuantity === 0) {
          existingInSameWarehouse.status = deliveredShipments.length > 0 ? 'Partially Delivered' : 'Fully Loaded';
          existingInSameWarehouse.stockstatus = deliveredShipments.length > 0 ? 'Partially Delivered' : 'Dispatched';
        }
        await existingInSameWarehouse.save();

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

      indexSingleWarehouseReceipt(existingInSameWarehouse).catch(() => {});

      const parts: string[] = [];
      if (addedQty !== 0) {
        parts.push(addedQty > 0 ? `added ${addedQty} CTN` : `reduced ${Math.abs(addedQty)} CTN`);
      }
      if (addedWeightNum !== 0) {
        parts.push(addedWeightNum > 0 ? `added ${addedWeightNum} KG` : `reduced ${Math.abs(addedWeightNum)} KG`);
      }
      if (addedVolumeNum !== 0) {
        parts.push(addedVolumeNum > 0 ? `added ${addedVolumeNum} CBM` : `reduced ${Math.abs(addedVolumeNum)} CBM`);
      }
      const summaryMsg = parts.length > 0 ? parts.join(', ') : 'adjusted stock';

      return NextResponse.json({
        success: true,
        message: `Successfully ${summaryMsg} for Receipt #${cleanReceipt} in ${cleanWarehouse}. Total quantity is now ${newTotalQty} CTN (${existingInSameWarehouse.remainingQuantity} CTN ready in stock).`,
        receipt: existingInSameWarehouse,
        addedQuantity: addedQty,
        totalQuantity: newTotalQty,
      });
    }

    if (isEditMode) {
      const existing = await WarehouseReceipt.findById(targetId);
      if (existing) {
        const oldReceipt = existing.receipt;
        const oldWarehouse = existing.warehouse;

        // Fetch active mapped shipments to accurately recalculate actualLoaded and delivered quantity
        const mappedShipments = await Shipment.find({
          $or: [
            { receiptId: existing._id },
            {
              receipt: new RegExp(`^${oldReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              warehouse: new RegExp(`^${oldWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            },
          ],
        });
        const actualLoaded = mappedShipments.reduce((sum, s) => sum + (parseInt(String(s.quantity || 0), 10) || 0), 0);
        const deliveredShipments = mappedShipments.filter((s) => Boolean(s.isDelivered));
        const deliveredQty = deliveredShipments.reduce((sum, s) => sum + (parseInt(String(s.quantity || 0), 10) || 0), 0);

        existing.receipt = cleanReceipt;
        existing.warehouse = cleanWarehouse;
        existing.quantity = effectiveQuantity;
        existing.loadedQuantity = actualLoaded;
        existing.remainingQuantity = Math.max(0, effectiveQuantity - actualLoaded);

        // Lifecycle & Delivery Status Management:
        if (existing.remainingQuantity > 0) {
          existing.isDelivered = false;
          if (deliveredShipments.length > 0) {
            existing.status = 'Partially Delivered';
            existing.stockstatus = 'Partially Delivered';
          } else if (actualLoaded > 0) {
            existing.status = 'Partially Loaded';
            existing.stockstatus = 'Partially Dispatched';
          } else {
            existing.status = 'Received in Warehouse';
            existing.stockstatus = 'In Stock';
          }
        } else {
          // remainingQuantity === 0
          if (mappedShipments.length > 0 && deliveredShipments.length === mappedShipments.length && deliveredQty >= effectiveQuantity) {
            existing.isDelivered = true;
            existing.status = 'Delivered';
            existing.stockstatus = 'Delivered';
          } else if (deliveredShipments.length > 0) {
            existing.isDelivered = false;
            existing.status = 'Partially Delivered';
            existing.stockstatus = 'Partially Delivered';
          } else if (actualLoaded > 0) {
            existing.isDelivered = false;
            existing.status = 'Fully Loaded';
            existing.stockstatus = 'Dispatched';
          } else {
            existing.isDelivered = false;
            existing.status = 'Received in Warehouse';
            existing.stockstatus = 'In Stock';
          }
        }

        if (effectiveCommodity) {
          existing.commodity = effectiveCommodity;
          existing.english = effectiveCommodity;
          existing.chinese = effectiveChinese;
        }
        if (packaging !== undefined) existing.packaging = finalPackaging;
        if (mainMarka !== undefined) existing.mainMarka = finalMainMark;
        if (subMarka !== undefined) existing.subMarka = finalSubMark;
        if (processedItems.length > 0 || Array.isArray(body.items)) {
          existing.items = processedItems;
        }
        Object.assign(existing, rest);
        await existing.save();

        // Cascade update across all mapped Shipment records throughout the database
        const isSplitNow = mappedShipments.length > 1 || effectiveQuantity > actualLoaded;
        const shipmentUpdates: Record<string, any> = {
          receipt: cleanReceipt,
          warehouse: cleanWarehouse,
          commodity: existing.commodity,
          english: existing.english,
          chinese: existing.chinese,
          packaging: existing.packaging,
          mainMarka: existing.mainMarka,
          subMarka: existing.subMarka,
          isSplit: isSplitNow,
          originalTotalQuantity: String(effectiveQuantity),
        };
        if (existing.party !== undefined) shipmentUpdates.party = existing.party;
        if (existing.weight !== undefined) shipmentUpdates.weight = existing.weight;
        if (existing.volume !== undefined) shipmentUpdates.volume = existing.volume;

        const oldReceiptRegex = new RegExp(`^${oldReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const oldWhRegex = new RegExp(`^${oldWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const cascadeRes = await Shipment.updateMany(
          {
            $or: [
              { receiptId: existing._id },
              { receipt: oldReceiptRegex, warehouse: oldWhRegex },
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
    const initialLoaded = isPlanAllocation ? effectiveQuantity : 0;
    const initialRemaining = isPlanAllocation ? 0 : effectiveQuantity;
    const initialStatus = isPlanAllocation ? 'Fully Loaded' : 'Received';
    const initialStockStatus = isPlanAllocation ? 'Dispatched' : 'In Stock';

    const newReceipt = await WarehouseReceipt.create({
      receipt: cleanReceipt,
      warehouse: cleanWarehouse,
      quantity: effectiveQuantity,
      loadedQuantity: initialLoaded,
      remainingQuantity: initialRemaining,
      commodity: effectiveCommodity,
      chinese: effectiveChinese,
      english: effectiveCommodity,
      packaging: finalPackaging,
      mainMarka: finalMainMark,
      subMarka: finalSubMark,
      items: processedItems,
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
  const warehouse = searchParams.get('warehouse')?.trim();
  const unloadFirst = searchParams.get('unloadFirst') === 'true' || searchParams.get('force') === 'true';

  if (!id && !receipt) {
    return NextResponse.json({ error: 'Receipt ID or Receipt Number is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const query: Record<string, any> = id ? { _id: id } : { receipt: new RegExp(`^${receipt!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    if (!id && warehouse) {
      query.warehouse = new RegExp(`^${warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }
    const existing: any = await WarehouseReceipt.findOne(query);

    if (!existing) {
      return NextResponse.json({ error: 'Warehouse receipt not found' }, { status: 404 });
    }

    // Check if any goods from this receipt have already been loaded into containers (Scoped to this warehouse receipt)
    const rawLoadedShipments = await Shipment.find({
      $or: [
        { receiptId: existing._id },
        {
          receipt: new RegExp(`^${existing.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          warehouse: new RegExp(`^${(existing.warehouse || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        },
      ],
    }).lean();

    const loadedShipments = rawLoadedShipments.filter((s: any) => {
      if (s.warehouse && existing.warehouse) {
        return s.warehouse.trim().toLowerCase() === existing.warehouse.trim().toLowerCase();
      }
      return true;
    });

    const isLoaded = loadedShipments.length > 0;

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
