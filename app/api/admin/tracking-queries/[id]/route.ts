import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';
import {
  isCustomerQueryAccessAuthorized,
  getAdminTokenFromRequest,
  verifyAdminToken,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT: Admin or Sales Head replies to query
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isCustomerQueryAccessAuthorized(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = params.id;
    const body = await req.json();
    const { reply, status } = body;

    await connectToDatabase();

    const query = await TrackingQuery.findById(id);
    if (!query) {
      return NextResponse.json({ success: false, message: 'Query not found' }, { status: 404 });
    }

    if (reply !== undefined) {
      query.reply = reply.trim();
      query.status = 'Answered';
      query.replyAt = new Date();
      if (body.repliedBy) {
        query.repliedBy = String(body.repliedBy).trim();
      }
    }
    if (status) {
      query.status = status;
      if (status === 'Answered' && !query.replyAt) {
        query.replyAt = new Date();
      }
    }

    await query.save();

    return NextResponse.json({
      success: true,
      message: 'Reply saved successfully',
      query: {
        id: query._id.toString(),
        token: query.token,
        receiptNo: query.receiptNo,
        message: query.message,
        reply: query.reply,
        replyAt: query.replyAt,
        repliedBy: query.repliedBy,
        status: query.status,
        createdAt: query.createdAt,
        updatedAt: query.updatedAt,
      }
    });
  } catch (error: any) {
    console.error('Error replying to query:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to update query' },
      { status: 500 }
    );
  }
}

// DELETE: Admin removes a query
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = getAdminTokenFromRequest(req);
  const payload = token ? verifyAdminToken(token) : null;
  if (!payload || !['developer', 'admin', 'sales_head'].includes(payload.role)) {
    return NextResponse.json({ success: false, message: 'Unauthorized: Admin or Sales Head access required' }, { status: 401 });
  }

  try {
    const id = params.id;
    await connectToDatabase();

    await TrackingQuery.findByIdAndDelete(id);

    return NextResponse.json({ success: true, message: 'Query deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting query:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to delete query' },
      { status: 500 }
    );
  }
}
