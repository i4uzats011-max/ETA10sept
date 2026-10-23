import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Warehouse from '@/models/Warehouse';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated, isSuperAdminAuthenticated } from '@/lib/auth';
import { translateWarehouse } from '@/lib/translate';
import { deleteSingleWarehouseReceipt } from '@/lib/typesense';

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

    // 3. Merge, deduplicate (strictly case-insensitive: YW = yw = Yw = yW), and sort
    const canonicalMap = new Map<string, string>(); // lowerKey -> canonical
    customWarehouses.forEach((w: any) => {
      if (w.name && typeof w.name === 'string' && w.name.trim()) {
        const key = w.name.trim().toLowerCase();
        if (!canonicalMap.has(key)) {
          canonicalMap.set(key, w.name.trim());
        }
      }
    });
    receiptWarehouses.forEach((w) => {
      if (w && typeof w === 'string' && w.trim()) {
        const key = w.trim().toLowerCase();
        if (!canonicalMap.has(key)) {
          canonicalMap.set(key, w.trim());
        }
      }
    });

    // Only populate defaults if database is completely empty (fresh initialization)
    if (canonicalMap.size === 0) {
      DEFAULT_WAREHOUSES.forEach((w) => canonicalMap.set(w.toLowerCase(), w));
    }

    const sortedList = Array.from(canonicalMap.values()).sort((a, b) => a.localeCompare(b));

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

// POST: Create a new China Warehouse (strictly prevents duplicates: YW = yw = Yw = yW)
export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Any change in data can only be made by Super Admin.' },
      { status: 403 }
    );
  }

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

    // Check if warehouse already exists (strictly case-insensitive: YW = yw = Yw = yW)
    const escapedPattern = new RegExp(`^${translatedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existingInWh = await Warehouse.findOne({ name: escapedPattern });
    const existingInReceipt = await WarehouseReceipt.findOne({ warehouse: escapedPattern });

    if (existingInWh || existingInReceipt) {
      const existingName = existingInWh?.name || existingInReceipt?.warehouse || translatedName;
      return NextResponse.json(
        {
          success: false,
          error: `Warehouse '${existingName}' already exists. Duplicate warehouses (e.g. YW = yw = Yw) are not allowed.`,
          alreadyExisted: true,
          existingName,
        },
        { status: 400 }
      );
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

// PUT: Edit / Rename / Merge a China Warehouse
export async function PUT(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Any change in data can only be made by Super Admin.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { oldName, newName, code, city, address, contact, mergeWithExisting } = body;

    if (!oldName || !oldName.trim()) {
      return NextResponse.json({ error: 'Current warehouse name (oldName) is required' }, { status: 400 });
    }
    if (!newName || !newName.trim()) {
      return NextResponse.json({ error: 'New warehouse name is required' }, { status: 400 });
    }

    await connectToDatabase();

    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    const oldRegex = new RegExp(`^${cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const newRegex = new RegExp(`^${cleanNew.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    if (cleanOld.toLowerCase() === cleanNew.toLowerCase()) {
      // Just update metadata (code, city, address, contact)
      await Warehouse.findOneAndUpdate(
        { name: oldRegex },
        {
          $set: {
            code: code !== undefined ? String(code).trim().toUpperCase() : undefined,
            city: city !== undefined ? String(city).trim() : undefined,
            address: address !== undefined ? String(address).trim() : undefined,
            contact: contact !== undefined ? String(contact).trim() : undefined,
          },
        }
      );
      return NextResponse.json({ success: true, message: `Warehouse '${cleanOld}' details updated successfully.` });
    }

    // Check if new name already exists case-insensitively
    const existingNew = await Warehouse.findOne({ name: newRegex });
    const existingNewInReceipts = await WarehouseReceipt.findOne({ warehouse: newRegex });

    if (!mergeWithExisting && (existingNew || existingNewInReceipts)) {
      return NextResponse.json(
        {
          success: false,
          error: `Warehouse '${existingNew?.name || cleanNew}' already exists (YW = yw = Yw are identical). Cannot rename to an existing warehouse. Use Merge option if you wish to combine them.`,
        },
        { status: 400 }
      );
    }

    // If merging or renaming: update all receipts, container plans, and shipments
    await WarehouseReceipt.updateMany({ warehouse: oldRegex }, { $set: { warehouse: cleanNew } });
    await Shipment.updateMany({ warehouse: oldRegex }, { $set: { warehouse: cleanNew } });
    await Container.updateMany({ warehouse: oldRegex }, { $set: { warehouse: cleanNew } });

    // Update or remove old Warehouse collection entry
    if (mergeWithExisting) {
      await Warehouse.deleteOne({ name: oldRegex });
    } else {
      await Warehouse.findOneAndUpdate(
        { name: oldRegex },
        {
          $set: {
            name: cleanNew,
            code: code ? String(code).trim().toUpperCase() : undefined,
            city: city ? String(city).trim() : undefined,
            address: address ? String(address).trim() : undefined,
            contact: contact ? String(contact).trim() : undefined,
          },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      message: mergeWithExisting
        ? `Warehouse '${cleanOld}' successfully merged into '${cleanNew}'.`
        : `Warehouse '${cleanOld}' successfully renamed to '${cleanNew}'.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update warehouse' }, { status: 500 });
  }
}

// DELETE: Delete a warehouse ONLY if NO data exists in that warehouse
export async function DELETE(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: Any change in data can only be made by Super Admin.' },
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

    // Strict rule: A user can ONLY delete a warehouse if ZERO data exists in that warehouse!
    if (totalMapped > 0) {
      const breakdown: string[] = [];
      if (receiptCount > 0) breakdown.push(`${receiptCount} warehouse receipt(s)`);
      if (containerCount > 0) breakdown.push(`${containerCount} container plan(s)`);
      if (shipmentCount > 0) breakdown.push(`${shipmentCount} shipment item(s)`);

      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete warehouse '${warehouseName}': ${totalMapped} record(s) (${breakdown.join(
            ', '
          )}) currently exist in this warehouse. A warehouse can only be deleted if there is NO data in it. Please transfer the goods to another warehouse first using 'Transfer Goods'.`,
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
