import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getContainerRegex(container: string) {
  const escaped = container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fuzzyPattern = escaped.replace(/[-_\s]+/g, '[-_\\s]*');
  return new RegExp(`^${fuzzyPattern}$`, 'i');
}

// GET: Retrieve container-wise remarks
export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const containerAlias = searchParams.get('container')?.trim();

  if (!containerAlias) {
    return NextResponse.json({ error: 'Container parameter is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const regex = getContainerRegex(containerAlias);

    const doc: any = await Container.findOne({
      $or: [{ container: regex }, { containerNumber: regex }],
    }).lean();

    if (doc) {
      return NextResponse.json({
        success: true,
        container: doc.container,
        remarks: doc.remarks || [],
      });
    }

    // Fallback to Shipment if not in Container fleet yet
    const shipmentDoc: any = await Shipment.findOne({
      $or: [{ container: regex }, { containerNumber: regex }],
    }).lean();

    return NextResponse.json({
      success: true,
      container: shipmentDoc?.container || containerAlias,
      remarks: shipmentDoc?.containerRemarks || [],
    });
  } catch (error: any) {
    console.error('Error fetching container remarks:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch container remarks' }, { status: 500 });
  }
}

// POST: Add new container-wise remark (date + status/remark text)
export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { container, date, remarks, createdBy } = body;

    const cleanContainer = (container || '').trim();
    const cleanDate = (date || '').trim();
    const cleanRemarks = (remarks || '').trim();

    if (!cleanContainer) {
      return NextResponse.json({ error: 'Container alias is required' }, { status: 400 });
    }

    if (!cleanDate) {
      return NextResponse.json({ error: 'Status / Remark date is required' }, { status: 400 });
    }

    if (!cleanRemarks) {
      return NextResponse.json({ error: 'Status / Remark text cannot be empty' }, { status: 400 });
    }

    await connectToDatabase();
    const regex = getContainerRegex(cleanContainer);

    const newRemark = {
      date: cleanDate,
      remarks: cleanRemarks,
      createdAt: new Date(),
      createdBy: createdBy || 'Admin',
    };

    // Upsert into Container fleet collection
    const updatedContainer: any = await Container.findOneAndUpdate(
      {
        $or: [{ container: regex }, { container: cleanContainer }],
      },
      {
        $push: { remarks: newRemark },
        $setOnInsert: {
          container: cleanContainer,
          containerNumber: '',
          shippingLine: 'MSC',
          status: 'In Transit',
          warehouse: 'China Warehouse',
          planStatus: 'Planning',
        },
      },
      { upsert: true, new: true }
    );

    // Also sync to Shipment records under this container
    await Shipment.updateMany(
      {
        $or: [{ container: regex }, { containerNumber: regex }],
      },
      {
        $push: { containerRemarks: newRemark },
      }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Remark recorded container-wise for '${cleanContainer}'!`,
      container: updatedContainer?.container || cleanContainer,
      remarks: updatedContainer?.remarks || [newRemark],
    });
  } catch (error: any) {
    console.error('Error adding container remark:', error);
    return NextResponse.json({ error: error?.message || 'Failed to add container remark' }, { status: 500 });
  }
}

// DELETE: Remove a container remark
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { container, remarkId } = body;

    const cleanContainer = (container || '').trim();
    if (!cleanContainer || !remarkId) {
      return NextResponse.json({ error: 'Container and remarkId are required' }, { status: 400 });
    }

    await connectToDatabase();
    const regex = getContainerRegex(cleanContainer);

    const updatedContainer: any = await Container.findOneAndUpdate(
      {
        $or: [{ container: regex }, { container: cleanContainer }],
      },
      {
        $pull: { remarks: { _id: remarkId } },
      },
      { new: true }
    );

    // Also remove from Shipment records
    await Shipment.updateMany(
      {
        $or: [{ container: regex }, { containerNumber: regex }],
      },
      {
        $pull: { containerRemarks: { _id: remarkId } },
      }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Container remark removed successfully',
      container: cleanContainer,
      remarks: updatedContainer?.remarks || [],
    });
  } catch (error: any) {
    console.error('Error deleting container remark:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete container remark' }, { status: 500 });
  }
}
