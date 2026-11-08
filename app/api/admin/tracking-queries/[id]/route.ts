import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';

export const dynamic = 'force-dynamic';

// PUT: Admin replies to query
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    }
    if (status) {
      query.status = status;
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
        status: query.status,
        updatedAt: query.updatedAt
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
