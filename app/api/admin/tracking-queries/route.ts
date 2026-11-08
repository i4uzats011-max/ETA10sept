import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';

export const dynamic = 'force-dynamic';

// GET all customer queries for admin
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const queries = await TrackingQuery.find({}).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      queries: queries.map((q: any) => ({
        id: q._id.toString(),
        token: q.token,
        receiptNo: q.receiptNo,
        marka: q.marka || '',
        senderName: q.senderName || '',
        senderPhone: q.senderPhone || '',
        message: q.message,
        reply: q.reply || '',
        status: q.status || 'Pending',
        createdAt: q.createdAt,
        updatedAt: q.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching admin tracking queries:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch customer queries' },
      { status: 500 }
    );
  }
}
