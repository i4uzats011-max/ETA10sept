import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated, isSuperAdminAuthenticated, getAdminTokenFromRequest } from '@/lib/auth';
import { translateWarehouse } from '@/lib/translate';

export const dynamic = 'force-dynamic';

// No predefined warehouses; all warehouses are created dynamically by the user
const DEFAULT_WAREHOUSES: string[] = [];

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

// PUT: Edit / Rename a China Warehouse and propagate database-wide
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { oldName, newName, code, city, address, contact } = body;

    if (!oldName || typeof oldName !== 'string' || !oldName.trim()) {
      return NextResponse.json({ error: 'Current warehouse name (oldName) is required' }, { status: 400 });
    }
    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return NextResponse.json({ error: 'New warehouse name (newName) is required' }, { status: 400 });
    }

    await connectToDatabase();

    const cleanOld = oldName.trim();
    const cleanNew = translateWarehouse(newName.trim());

    // Check if newName already exists under another document
    if (cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
      const collision = await Warehouse.findOne({
        name: new RegExp(`^${cleanNew.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (collision) {
        return NextResponse.json(
          { error: `Cannot rename warehouse to '${cleanNew}': A warehouse with that name already exists.` },
          { status: 400 }
        );
      }
    }

    const oldPattern = new RegExp(`^${cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // 1. Update or upsert in Warehouse collection
    let updatedWarehouse = await Warehouse.findOneAndUpdate(
      { name: oldPattern },
      {
        $set: {
          name: cleanNew,
          ...(code !== undefined ? { code: String(code).trim().toUpperCase() } : {}),
          ...(city !== undefined ? { city: String(city).trim() } : {}),
          ...(address !== undefined ? { address: String(address).trim() } : {}),
          ...(contact !== undefined ? { contact: String(contact).trim() } : {}),
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedWarehouse) {
      updatedWarehouse = await Warehouse.create({
        name: cleanNew,
        code: code ? String(code).trim().toUpperCase() : '',
        city: city ? String(city).trim() : '',
        address: address ? String(address).trim() : '',
        contact: contact ? String(contact).trim() : '',
        createdAt: new Date(),
      });
    }

    // 2. Cascade rename across all mapped collections database-wide:
    // - WarehouseReceipt
    const receiptRes = await WarehouseReceipt.updateMany(
      { warehouse: oldPattern },
      { $set: { warehouse: cleanNew } }
    );
    // - Container
    const containerRes = await Container.updateMany(
      { warehouse: oldPattern },
      { $set: { warehouse: cleanNew } }
    );
    // - Shipment
    const shipmentRes = await Shipment.updateMany(
      { warehouse: oldPattern },
      { $set: { warehouse: cleanNew } }
    );

    return NextResponse.json({
      success: true,
      message: `Warehouse successfully updated to '${cleanNew}'. Database synchronized across ${receiptRes.modifiedCount} receipt(s), ${containerRes.modifiedCount} container plan(s), and ${shipmentRes.modifiedCount} shipment(s).`,
      warehouse: updatedWarehouse,
      oldName: cleanOld,
      newName: cleanNew,
      updatedCounts: {
        receipts: receiptRes.modifiedCount,
        containers: containerRes.modifiedCount,
        shipments: shipmentRes.modifiedCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update warehouse' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a warehouse only if NO data is mapped to it
export async function DELETE(req: NextRequest) {
  const token = getAdminTokenFromRequest(req);
  if (token && !isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Valid Staff or Admin privileges required to delete a warehouse' },
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
          error: `Cannot delete warehouse '${warehouseName}': ${receiptCount} received goods record(s) (along with ${containerCount} container plan(s) and ${shipmentCount} shipment item(s)) still exist in this warehouse. Under system rules, all received goods inside this warehouse must be deleted first before deleting the warehouse.`,
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
