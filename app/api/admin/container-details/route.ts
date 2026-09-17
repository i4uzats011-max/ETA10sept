import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
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
    const escaped = containerAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fuzzyPattern = escaped.replace(/[-_\s]+/g, '[-_\\s]*');
    const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

    // 1. Check Container fleet model first
    let doc: any = await Container.findOne({
      $or: [{ container: regex }, { containerNumber: regex }],
    }).lean();

    // 2. Fallback to Shipment records if not found in Container
    if (!doc) {
      doc = await Shipment.findOne({
        $or: [{ container: regex }, { containerNumber: regex }],
      }).lean();
    }

    if (!doc) {
      return NextResponse.json({ error: 'Container alias not found' }, { status: 404 });
    }

    return NextResponse.json({
      container: doc.container,
      containerNumber: doc.containerNumber || '',
      shippingLine: doc.shippingLine || 'MSC',
      shippedFrom: doc.shippedFrom || 'Ningbo / Shanghai, China',
      shippedTo: doc.shippedTo || 'Nhava Sheva / Mundra, India',
      startDate: doc.startDate || doc.loadingDate || '',
      loadingDate: doc.loadingDate || doc.startDate || '',
      rawEta: doc.rawEta || '',
      destinationDate: doc.destinationDate || doc.eta || '',
      eta: doc.destinationDate || doc.eta || 'N/A',
      etaBufferDays: doc.etaBufferDays ?? 7,
      status: doc.status || 'In Transit',
      isDelivered: Boolean(doc.isDelivered),
      shipmentCount: doc.shipmentCount || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch details' }, { status: 500 });
  }
}

