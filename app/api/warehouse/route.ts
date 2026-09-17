import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated, isSuperAdminAuthenticated } from '@/lib/auth';
import { translateWarehouse } from '@/lib/translate';

export const dynamic = 'force-dynamic';

const DEFAULT_WAREHOUSES = [
  'Guangzhou Warehouse',
  'Yiwu Warehouse',
  'Ningbo Warehouse',
  'Shenzhen Warehouse',
  'Shanghai Warehouse',
  'Keqiao Warehouse',
];

// GET: List all China warehouses
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    // 1. Fetch warehouses from Warehouse collection
    const customWarehouses = await Warehouse.find({}).sort({ name: 1 }).lean();

    // 2. Fetch distinct warehouses currently used in Warehouse Receipts
    const receiptWarehouses = await WarehouseReceipt.distinct('warehouse');

    // 3. Merge, deduplicate, and sort
    const set = new Set<string>();
    DEFAULT_WAREHOUSES.forEach((w) => set.add(w));
    receiptWarehouses.forEach((w) => {
      if (w && typeof w === 'string' && w.trim()) set.add(w.trim());
    });
    customWarehouses.forEach((w: any) => {
      if (w.name && typeof w.name === 'string' && w.name.trim()) set.add(w.name.trim());
    });

    const sortedList = Array.from(set).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      success: true,
      warehouses: sortedList,
      details: customWarehouses,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch warehouses' },
      { status: 500 }
    );
  }
}

// POST: Create a new China Warehouse
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, city, address, contact } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Warehouse name is required' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const rawClean = name.trim();
    const translatedName = translateWarehouse(rawClean);

    // Check if warehouse already exists (case-insensitive)
    const existing = await Warehouse.findOne({
      name: new RegExp(`^${translatedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: `Warehouse '${existing.name}' is already registered and ready for use.`,
        warehouse: existing,
        alreadyExisted: true,
      });
    }

    const newWarehouse = await Warehouse.create({
      name: translatedName,
      code: code ? String(code).trim().toUpperCase() : '',
      city: city ? String(city).trim() : '',
      address: address ? String(address).trim() : '',
      contact: contact ? String(contact).trim() : '',
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Warehouse '${translatedName}' created successfully.`,
      warehouse: newWarehouse,
      alreadyExisted: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create warehouse' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a warehouse only if NO data is mapped to it
export async function DELETE(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Staff or Admin privileges required to delete a warehouse' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    let name = searchParams.get('name')?.trim();
    let id = searchParams.get('id')?.trim();

    if (!name && !id) {
      try {
        const body = await req.json();
        name = body.name?.trim();
        id = body.id?.trim();
      } catch {}
    }

    if (!name && !id) {
      return NextResponse.json({ error: 'Warehouse name or ID is required for deletion' }, { status: 400 });
    }

    await connectToDatabase();

    let targetWarehouse: any = null;
    if (id) {
      targetWarehouse = await Warehouse.findById(id);
    } else if (name) {
      targetWarehouse = await Warehouse.findOne({
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
    }

    const warehouseName = targetWarehouse?.name || name;
    const regexPattern = new RegExp(`^${warehouseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Check all data mapped to this warehouse: Receipts, Container plans, Shipments
    const receiptCount = await WarehouseReceipt.countDocuments({ warehouse: regexPattern });
    const containerCount = await Container.countDocuments({ warehouse: regexPattern });
    const shipmentCount = await Shipment.countDocuments({ warehouse: regexPattern });

    const totalMapped = receiptCount + containerCount + shipmentCount;

    if (totalMapped > 0) {
      const breakdown: string[] = [];
      if (receiptCount > 0) breakdown.push(`${receiptCount} warehouse receipt(s)`);
      if (containerCount > 0) breakdown.push(`${containerCount} container plan(s)`);
      if (shipmentCount > 0) breakdown.push(`${shipmentCount} shipment item(s)`);

      return NextResponse.json(
        {
          error: `Cannot delete warehouse '${warehouseName}': ${totalMapped} record(s) (${breakdown.join(
            ', '
          )}) are currently mapped to this warehouse. First delete all data related to this warehouse, then delete the warehouse.`,
          mappedCount: totalMapped,
          receiptCount,
          containerCount,
          shipmentCount,
        },
        { status: 400 }
      );
    }

    if (targetWarehouse) {
      await Warehouse.findByIdAndDelete(targetWarehouse._id);
    } else {
      await Warehouse.deleteOne({ name: regexPattern });
    }

    return NextResponse.json({
      success: true,
      message: `Warehouse '${warehouseName}' deleted successfully (zero data was mapped to it).`,
      warehouse: warehouseName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete warehouse' }, { status: 500 });
  }
}
