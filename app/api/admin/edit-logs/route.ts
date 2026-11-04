import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import EditLog from '@/models/EditLog';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const search = searchParams.get('search')?.trim();

    const query: any = {};
    if (action) query.action = action.toUpperCase();
    if (entityType) query.entityType = entityType;
    if (search) {
      query.$or = [
        { entityId: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const logs = await EditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const total = await EditLog.countDocuments(query);

    return NextResponse.json({
      success: true,
      total,
      limit,
      logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch edit logs' },
      { status: 500 }
    );
  }
}
