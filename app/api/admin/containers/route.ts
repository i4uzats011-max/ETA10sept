import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const distinctContainers = await Shipment.distinct('container');
    distinctContainers.sort();

    return NextResponse.json({ containers: distinctContainers });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch distinct containers' }, { status: 500 });
  }
}
