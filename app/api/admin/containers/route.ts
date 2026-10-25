import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import { isAdminAuthenticated } from '@/lib/auth';
import { cachedFetch } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Cache distinct containers list for 2 minutes to eliminate expensive scans
    const containers = await cachedFetch('admin:distinct_containers', 120, async () => {
      await connectToDatabase();
      const distinct = await Shipment.distinct('container');
      distinct.sort();
      return distinct;
    });

    return NextResponse.json({ containers });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch distinct containers' }, { status: 500 });
  }
}
