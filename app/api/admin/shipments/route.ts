import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isStaffOrAdminAuthenticated, isSuperAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';
import { translateToEnglish, hasChineseCharacters } from '@/lib/translate';

export const dynamic = 'force-dynamic';

// GET: Returns data for Admin 1 and Admin 2 (Staff)
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const searchQuery = searchParams.get('search')?.trim();
  const fetchAll = searchParams.get('all') === 'true';
  const limitParam = searchParams.get('limit');

  try {
    await connectToDatabase();

    if (fetchAll) {
      const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100000) : 25000;
      const shipments = await Shipment.find({}).sort({ uploadedAt: -1 }).limit(limit);
      return NextResponse.json({ shipments, count: shipments.length });
    }

    // If search query is missing and not fetching all, return empty array for search-first admin mode
    if (!searchQuery) {
      return NextResponse.json({ shipments: [], count: 0, message: 'Search query or all=true required' });
    }

    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const shipments = await Shipment.find({
      $or: [
        { receipt: regex },
        { container: regex },
        { containerNumber: regex },
        { shippingLine: regex },
        { commodity: regex },
        { english: regex },
        { status: regex },
        { warehouseEntry: regex },
        { stockstatus: regex },
        { warehouse: regex },
        { mainMarka: regex },
        { subMarka: regex },
        { date: regex },
      ],
    }).sort({ uploadedAt: -1 }).limit(limitParam ? Math.min(parseInt(limitParam, 10), 100000) : 5000);

    return NextResponse.json({ shipments, count: shipments.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch shipments' }, { status: 500 });
  }
}

// Single-row edit (PUT) - SUPER ADMIN ONLY (Direct DB update, Zero API calls)
export async function PUT(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot modify data' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: 'Shipment ID is required for editing' }, { status: 400 });
    }

    await connectToDatabase();

    const existing = await Shipment.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    if (updateFields.eta !== undefined && updateFields.eta !== existing.eta) {
      updateFields.etaUpdatedAt = new Date();
    }

    // Auto-translate Chinese commodity name if provided or updated
    const rawCn = updateFields.chinese || (hasChineseCharacters(updateFields.commodity) ? updateFields.commodity : '');
    if (rawCn && hasChineseCharacters(rawCn)) {
      if (!updateFields.english || updateFields.english === 'General Merchandise' || hasChineseCharacters(updateFields.english)) {
        updateFields.english = translateToEnglish(rawCn);
      }
      if (!updateFields.chinese) {
        updateFields.chinese = rawCn;
      }
    }

    const authUser = getAuthenticatedUser(req);
    updateFields.lastModifiedBy = authUser.username;
    updateFields.lastModifiedByRole = authUser.role;

    if (updateFields.rate !== undefined) {
      updateFields['Overall / Receipt Freight Rate'] = String(updateFields.rate).trim();
    }

    // Direct database update: Zero external API calls during user edits
    const updated = await Shipment.findByIdAndUpdate(id, { $set: updateFields }, { new: true });

    // Sync "Overall / Receipt Freight Rate" receipt no. wise to WarehouseReceipt if updated
    if (updateFields.rate !== undefined && updated?.receipt) {
      const cleanRate = String(updateFields.rate).trim();
      await WarehouseReceipt.updateMany(
        { $or: [{ receipt: String(updated.receipt).trim() }, { receiptNumber: String(updated.receipt).trim() }] },
        { $set: { rate: cleanRate, 'Overall / Receipt Freight Rate': cleanRate } }
      );
    }

    await recordEditLog(req, {
      action: 'UPDATE',
      entityType: 'Shipment',
      entityId: String(id),
      description: `Updated cargo shipment ${updated?.receipt || id} (Container: ${updated?.container || 'N/A'})`,
      details: { id, receipt: updated?.receipt, container: updated?.container, updatedFields: Object.keys(updateFields) },
    });

    return NextResponse.json({ success: true, shipment: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update shipment' }, { status: 500 });
  }
}

// Single-row or batch delete (DELETE) - SUPER ADMIN ONLY
export async function DELETE(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot modify data' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const idFromQuery = searchParams.get('id');

    let idToDelete = idFromQuery;

    if (!idToDelete) {
      try {
        const body = await req.json();
        idToDelete = body.id;
      } catch {
        // Body reading optional
      }
    }

    if (!idToDelete) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 });
    }

    await connectToDatabase();

    const existingShipment = await Shipment.findById(idToDelete);
    if (!existingShipment) {
      return NextResponse.json({ error: 'Shipment record not found' }, { status: 404 });
    }

    const qtyToRestore = parseInt(String(existingShipment.quantity || 0), 10) || 0;
    if (existingShipment.receipt) {
      let whReceipt: any = null;
      if (existingShipment.receiptId) {
        whReceipt = await WarehouseReceipt.findById(existingShipment.receiptId);
      }
      if (!whReceipt) {
        const whFilter: any = {
          receipt: new RegExp(`^${existingShipment.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        };
        if (existingShipment.warehouse) {
          whFilter.warehouse = new RegExp(`^${existingShipment.warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        }
        whReceipt = await WarehouseReceipt.findOne(whFilter);
      }
      if (!whReceipt) {
        whReceipt = await WarehouseReceipt.findOne({
          receipt: new RegExp(`^${existingShipment.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });
      }
      if (whReceipt) {
        whReceipt.loadedQuantity = Math.max(0, (whReceipt.loadedQuantity || 0) - qtyToRestore);
        whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
        if (whReceipt.loadedQuantity <= 0) {
          whReceipt.status = 'Received in Warehouse';
          whReceipt.stockstatus = 'In Stock';
        } else {
          whReceipt.status = 'Partially Loaded';
          whReceipt.stockstatus = 'Partially Dispatched';
        }
        await whReceipt.save();
      }
    }

    if (existingShipment.container) {
      await Container.findOneAndUpdate(
        { container: existingShipment.container },
        {
          $inc: {
            shipmentCount: -1,
            totalQuantity: -qtyToRestore,
          },
        }
      );
    }

    const deleted = await Shipment.findByIdAndDelete(idToDelete);

    await recordEditLog(req, {
      action: 'DELETE',
      entityType: 'Shipment',
      entityId: String(idToDelete),
      description: `Deleted cargo shipment ${existingShipment.receipt} from container ${existingShipment.container || 'N/A'} (Restored ${qtyToRestore} ctns to warehouse)`,
      details: { id: idToDelete, receipt: existingShipment.receipt, container: existingShipment.container, quantity: qtyToRestore },
    });

    return NextResponse.json({ success: true, message: 'Shipment deleted successfully and warehouse stock restored.' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete shipment' }, { status: 500 });
  }
}

// Bulk Actions (POST) - SUPER ADMIN ONLY
export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot modify data' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, ids, updateData } = body;

    if (action === 'create') {
      const createData = body.shipment || body.data;
      if (!createData || !createData.container || !createData.receipt) {
        return NextResponse.json({ error: 'Receipt and Container are required for creating a shipment' }, { status: 400 });
      }

      const authUser = getAuthenticatedUser(req);
      const hasValidEta = createData.eta && createData.eta !== 'N/A' && createData.eta !== 'Pending';
      const created = await Shipment.create({
        ...createData,
        uploadedAt: new Date(),
        lastModifiedBy: authUser.username,
        lastModifiedByRole: authUser.role,
        eta: createData.eta || 'N/A',
        ...(hasValidEta ? { etaUpdatedAt: new Date() } : {}),
        status: createData.status || 'Pending',
      });

      if (createData.rate && created.receipt) {
        const cleanRate = String(createData.rate).trim();
        await WarehouseReceipt.updateMany(
          { $or: [{ receipt: String(created.receipt).trim() }, { receiptNumber: String(created.receipt).trim() }] },
          { $set: { rate: cleanRate, 'Overall / Receipt Freight Rate': cleanRate } }
        );
        await Shipment.findByIdAndUpdate(created._id, {
          $set: { 'Overall / Receipt Freight Rate': cleanRate },
        });
      }

      await recordEditLog(req, {
        action: 'CREATE',
        entityType: 'Shipment',
        entityId: String(created._id),
        description: `Created shipment for receipt ${created.receipt} in container ${created.container}`,
        details: { receipt: created.receipt, container: created.container, quantity: created.quantity },
      });

      return NextResponse.json({
        success: true,
        message: 'Shipment created successfully',
        shipment: created,
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No item IDs provided for bulk action' }, { status: 400 });
    }

    await connectToDatabase();

    if (action === 'bulk-delete') {
      const matchingShipments = await Shipment.find({ _id: { $in: ids } });

      // Restore stock in warehouse receipts and update container counts for each deleted shipment
      for (const s of matchingShipments) {
        const qtyToRestore = parseInt(String(s.quantity || 0), 10) || 0;
        if (s.receipt) {
          let whReceipt: any = null;
          if (s.receiptId) {
            whReceipt = await WarehouseReceipt.findById(s.receiptId);
          }
          if (!whReceipt) {
            const whFilter: any = {
              receipt: new RegExp(`^${s.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            };
            if (s.warehouse) {
              whFilter.warehouse = new RegExp(`^${s.warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            }
            whReceipt = await WarehouseReceipt.findOne(whFilter);
          }
          if (!whReceipt) {
            whReceipt = await WarehouseReceipt.findOne({
              receipt: new RegExp(`^${s.receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            });
          }
          if (whReceipt) {
            whReceipt.loadedQuantity = Math.max(0, (whReceipt.loadedQuantity || 0) - qtyToRestore);
            whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
            if (whReceipt.loadedQuantity <= 0) {
              whReceipt.status = 'Received in Warehouse';
              whReceipt.stockstatus = 'In Stock';
            } else {
              whReceipt.status = 'Partially Loaded';
              whReceipt.stockstatus = 'Partially Dispatched';
            }
            await whReceipt.save();
          }
        }

        if (s.container) {
          await Container.findOneAndUpdate(
            { container: s.container },
            {
              $inc: {
                shipmentCount: -1,
                totalQuantity: -qtyToRestore,
              },
            }
          );
        }
      }

      const result = await Shipment.deleteMany({ _id: { $in: ids } });

      await recordEditLog(req, {
        action: 'DELETE',
        entityType: 'Shipment',
        entityId: ids.slice(0, 10).join(', '),
        description: `Bulk deleted ${result.deletedCount} cargo shipment records and restored warehouse inventory`,
        details: { count: result.deletedCount, ids: ids.slice(0, 50) },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} record(s) and restored warehouse inventory stock`,
        count: result.deletedCount,
      });
    } else if (action === 'bulk-edit') {
      if (!updateData || typeof updateData !== 'object') {
        return NextResponse.json({ error: 'Missing updateData object for bulk edit' }, { status: 400 });
      }

      // Filter out empty string fields
      const cleanedUpdateData: Record<string, any> = {};
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined && updateData[key] !== null && updateData[key] !== '') {
          cleanedUpdateData[key] = updateData[key];
        }
      });

      if (cleanedUpdateData.eta !== undefined) {
        cleanedUpdateData.etaUpdatedAt = new Date();
      }

      const authUser = getAuthenticatedUser(req);
      cleanedUpdateData.lastModifiedBy = authUser.username;
      cleanedUpdateData.lastModifiedByRole = authUser.role;

      // Direct database update: Zero external API calls during bulk edits
      const result = await Shipment.updateMany(
        { _id: { $in: ids } },
        { $set: cleanedUpdateData }
      );

      await recordEditLog(req, {
        action: 'UPDATE',
        entityType: 'Shipment',
        entityId: ids.slice(0, 10).join(', '),
        description: `Bulk updated ${result.modifiedCount} cargo shipments (${Object.keys(cleanedUpdateData).filter(k => !k.startsWith('lastModified')).join(', ')})`,
        details: { count: result.modifiedCount, updatedFields: Object.keys(cleanedUpdateData) },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully updated ${result.modifiedCount} record(s)`,
        count: result.modifiedCount,
      });
    } else {
      return NextResponse.json({ error: "Invalid action. Expected 'create', 'bulk-delete', or 'bulk-edit'" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Bulk operation failed' }, { status: 500 });
  }
}
