import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import VisitorLog from '@/models/VisitorLog';
import { isDeveloperAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json({ error: 'Unauthorized. Developer Admin access required.' }, { status: 401 });
    }

    await connectToDatabase();

    const body = await req.json().catch(() => ({}));
    const { olderThanDays } = body;

    let filter: any = {};
    if (olderThanDays && Number(olderThanDays) > 0) {
      const cutoffDate = new Date(Date.now() - Number(olderThanDays) * 24 * 60 * 60 * 1000);
      filter = { createdAt: { $lt: cutoffDate } };
    }

    const result = await VisitorLog.deleteMany(filter);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} visitor log(s).`,
    });
  } catch (error: any) {
    console.error('Error clearing visitor logs:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
