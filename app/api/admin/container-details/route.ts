import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const containerAlias = searchParams.get('container')?.trim();

  if (!containerAlias) {
    return NextResponse.json({ error: 'Container parameter required' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const regex = new RegExp(`^${containerAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const shipment: any = await Shipment.findOne({ container: regex }).lean();

    if (!shipment) {
      return NextResponse.json({ error: 'Container alias not found' }, { status: 404 });
    }

    return NextResponse.json({
      container: shipment.container,
      containerNumber: shipment.containerNumber,
      shippingLine: shipment.shippingLine || 'MSC',
      eta: shipment.eta || 'N/A',
      status: shipment.status || 'Pending',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch details' }, { status: 500 });
  }
}
