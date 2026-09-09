import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import {
  translateCommodity,
  translatePackaging,
  translateWarehouse,
  translateMark,
} from '@/lib/translate';

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
    const { receipt, warehouse, quantity, commodity, packaging, mainMarka, subMarka, ...rest } = body;

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt number is required' }, { status: 400 });
    }

    await connectToDatabase();

    const cleanReceipt = receipt.trim();
    const cleanWarehouse = translateWarehouse(warehouse || 'China Warehouse');
    const qtyNumber = parseInt(String(quantity || 0), 10) || 0;

    // Chinese to English translation
    const rawCommodity = commodity ? String(commodity).trim() : '';
    const { english: translatedEnglish, chinese: translatedChinese } = translateCommodity(rawCommodity);
    const finalEnglish = rest.english || translatedEnglish;
    const finalChinese = rest.chinese || translatedChinese;
    const finalPackaging = translatePackaging(packaging);
    const finalMainMark = translateMark(mainMarka);
    const finalSubMark = translateMark(subMarka);

    // Check if receipt exists
    const existing = await WarehouseReceipt.findOne({ receipt: cleanReceipt });
    if (existing) {
      // Update fields
      existing.warehouse = cleanWarehouse || existing.warehouse;
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

      return NextResponse.json({
        success: true,
        message: `Warehouse receipt '${cleanReceipt}' updated successfully`,
        receipt: existing,
      });
    }

    // Create new
    const newReceipt = await WarehouseReceipt.create({
      receipt: cleanReceipt,
      warehouse: cleanWarehouse,
      quantity: qtyNumber,
      loadedQuantity: 0,
      remainingQuantity: qtyNumber,
      commodity: finalEnglish,
      chinese: finalChinese,
      english: finalEnglish,
      packaging: finalPackaging,
      mainMarka: finalMainMark,
      subMarka: finalSubMark,
      status: 'Received',
      stockstatus: 'In Stock',
      uploadedAt: new Date(),
      ...rest,
    });

    return NextResponse.json({
      success: true,
      message: `Warehouse receipt '${cleanReceipt}' created successfully in ${cleanWarehouse}`,
      receipt: newReceipt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save warehouse receipt' }, { status: 500 });
  }
}
