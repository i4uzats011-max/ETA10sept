import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ShippingLine, { DEFAULT_SHIPPING_LINES } from '@/models/ShippingLine';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isAnyAuthenticated, isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function escapeRegex(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// GET: List all shipping lines with container/shipment mapping counts
export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // 1. Check if shipping lines exist, seed defaults if empty
    const count = await ShippingLine.countDocuments();
    if (count === 0) {
      await ShippingLine.insertMany(
        DEFAULT_SHIPPING_LINES.map((item) => ({
          ...item,
          active: true,
        }))
      );
    }

    // 2. Fetch all shipping lines
    const lines = await ShippingLine.find().sort({ name: 1 }).lean();

    // 3. Fast aggregate mapped counts from containers and shipments
    const [containerAgg, shipmentAgg] = await Promise.all([
      Container.aggregate([
        { $match: { shippingLine: { $exists: true, $ne: '' } } },
        { $group: { _id: { $toUpper: '$shippingLine' }, count: { $sum: 1 } } },
      ]),
      Shipment.aggregate([
        { $match: { shippingLine: { $exists: true, $ne: '' } } },
        { $group: { _id: { $toUpper: '$shippingLine' }, count: { $sum: 1 } } },
      ]),
    ]);

    const containerMap = new Map<string, number>();
    containerAgg.forEach((item) => {
      if (item._id) containerMap.set(String(item._id).trim().toUpperCase(), item.count);
    });

    const shipmentMap = new Map<string, number>();
    shipmentAgg.forEach((item) => {
      if (item._id) shipmentMap.set(String(item._id).trim().toUpperCase(), item.count);
    });

    // Format list with mapping stats
    const enrichedLines = lines.map((line: any) => {
      const lineKey = String(line.name || '').trim().toUpperCase();
      const containerCount = containerMap.get(lineKey) || 0;
      const shipmentCount = shipmentMap.get(lineKey) || 0;
      const isMapped = containerCount > 0 || shipmentCount > 0;

      return {
        _id: String(line._id),
        name: line.name,
        displayName: line.displayName || line.name,
        prefix: line.prefix || '',
        website: line.website || '',
        notes: line.notes || '',
        active: line.active !== false,
        containerCount,
        shipmentCount,
        isMapped,
        createdAt: line.createdAt,
        updatedAt: line.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      shippingLines: enrichedLines,
      totalCount: enrichedLines.length,
    });
  } catch (error: any) {
    console.error('Error fetching shipping lines:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch shipping lines' },
      { status: 500 }
    );
  }
}

// POST: Add new shipping line company
export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Staff or Admin role required' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    const rawName = String(body.name || '').trim().toUpperCase();
    if (!rawName) {
      return NextResponse.json({ error: 'Shipping line code / name is required' }, { status: 400 });
    }

    // Clean name: replace spaces with underscores if needed, or uppercase
    const cleanName = rawName.replace(/\s+/g, '_');

    // Check if duplicate
    const existing = await ShippingLine.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Shipping line "${cleanName}" already exists.` },
        { status: 400 }
      );
    }

    const created = await ShippingLine.create({
      name: cleanName,
      displayName: String(body.displayName || cleanName).trim(),
      prefix: String(body.prefix || '').trim().toUpperCase(),
      website: String(body.website || '').trim(),
      notes: String(body.notes || '').trim(),
      active: body.active !== undefined ? Boolean(body.active) : true,
    });

    return NextResponse.json({
      success: true,
      message: `Shipping line "${cleanName}" created successfully!`,
      shippingLine: {
        _id: String(created._id),
        name: created.name,
        displayName: created.displayName,
        prefix: created.prefix,
        website: created.website,
        notes: created.notes,
        active: created.active,
        containerCount: 0,
        shipmentCount: 0,
        isMapped: false,
      },
    });
  } catch (error: any) {
    console.error('Error creating shipping line:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create shipping line' },
      { status: 500 }
    );
  }
}

// PUT: Edit existing shipping line company
export async function PUT(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Staff or Admin role required' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Shipping line ID is required' }, { status: 400 });
    }

    const currentLine = await ShippingLine.findById(id);
    if (!currentLine) {
      return NextResponse.json({ error: 'Shipping line not found' }, { status: 404 });
    }

    const newName = body.name ? String(body.name).trim().toUpperCase().replace(/\s+/g, '_') : currentLine.name;

    // Check duplicate if name is changing
    if (newName !== currentLine.name) {
      const conflict = await ShippingLine.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${escapeRegex(newName)}$`, 'i') },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `Shipping line "${newName}" already exists.` },
          { status: 400 }
        );
      }

      // Cascade update containers and shipments if old line was mapped
      await Promise.all([
        Container.updateMany(
          { shippingLine: { $regex: new RegExp(`^${escapeRegex(currentLine.name)}$`, 'i') } },
          { $set: { shippingLine: newName } }
        ),
        Shipment.updateMany(
          { shippingLine: { $regex: new RegExp(`^${escapeRegex(currentLine.name)}$`, 'i') } },
          { $set: { shippingLine: newName } }
        ),
      ]);
    }

    currentLine.name = newName;
    if (body.displayName !== undefined) currentLine.displayName = String(body.displayName).trim();
    if (body.prefix !== undefined) currentLine.prefix = String(body.prefix).trim().toUpperCase();
    if (body.website !== undefined) currentLine.website = String(body.website).trim();
    if (body.notes !== undefined) currentLine.notes = String(body.notes).trim();
    if (body.active !== undefined) currentLine.active = Boolean(body.active);

    await currentLine.save();

    // Recompute mapped counts
    const [containerCount, shipmentCount] = await Promise.all([
      Container.countDocuments({
        shippingLine: { $regex: new RegExp(`^${escapeRegex(currentLine.name)}$`, 'i') },
      }),
      Shipment.countDocuments({
        shippingLine: { $regex: new RegExp(`^${escapeRegex(currentLine.name)}$`, 'i') },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Shipping line "${currentLine.name}" updated successfully!`,
      shippingLine: {
        _id: String(currentLine._id),
        name: currentLine.name,
        displayName: currentLine.displayName,
        prefix: currentLine.prefix,
        website: currentLine.website,
        notes: currentLine.notes,
        active: currentLine.active,
        containerCount,
        shipmentCount,
        isMapped: containerCount > 0 || shipmentCount > 0,
      },
    });
  } catch (error: any) {
    console.error('Error updating shipping line:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update shipping line' },
      { status: 500 }
    );
  }
}

// DELETE: Delete shipping line company ONLY IF not mapped in any company/container
export async function DELETE(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Staff or Admin role required' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id')?.trim();

    if (!id) {
      return NextResponse.json({ error: 'Shipping line ID is required' }, { status: 400 });
    }

    const line = await ShippingLine.findById(id);
    if (!line) {
      return NextResponse.json({ error: 'Shipping line not found' }, { status: 404 });
    }

    // CHECK REFERENTIAL INTEGRITY:
    // User can delete ONLY IF user has not mapped that shipping line in any container / shipment / company
    const [containerCount, shipmentCount] = await Promise.all([
      Container.countDocuments({
        shippingLine: { $regex: new RegExp(`^${escapeRegex(line.name)}$`, 'i') },
      }),
      Shipment.countDocuments({
        shippingLine: { $regex: new RegExp(`^${escapeRegex(line.name)}$`, 'i') },
      }),
    ]);

    if (containerCount > 0 || shipmentCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete shipping line "${line.name}": It is currently mapped to ${containerCount} container(s) and ${shipmentCount} shipment record(s). Deletion is prohibited because this shipping line is in active use. You can only delete a shipping line if it is not mapped in any company or container.`,
          isMapped: true,
          containerCount,
          shipmentCount,
        },
        { status: 400 }
      );
    }

    // If completely unmapped, safe to delete!
    await ShippingLine.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: `Shipping line "${line.name}" deleted successfully!`,
      deletedId: id,
    });
  } catch (error: any) {
    console.error('Error deleting shipping line:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete shipping line' },
      { status: 500 }
    );
  }
}
