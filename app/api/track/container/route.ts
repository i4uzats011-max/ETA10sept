import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const containerQuery = searchParams.get('container')?.trim();

  if (!containerQuery) {
    return NextResponse.json({ error: 'Container parameter is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const cleanEscaped = containerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizedRegex = new RegExp(`^${cleanEscaped.replace(/[-\s]/g, '[-_\\s]?')}$`, 'i');

    // Find any shipment record matching public container alias (with space/hyphen flexibility) OR actual container number
    const shipment: any = await Shipment.findOne({
      $or: [
        { container: { $regex: normalizedRegex } },
        { containerNumber: { $regex: new RegExp(`^${cleanEscaped}$`, 'i') } },
      ],
    }).sort({ uploadedAt: -1 }).lean();

    if (!shipment) {
      return NextResponse.json(
        { error: `No container record found for '${containerQuery}'` },
        { status: 404 }
      );
    }

    const containerAlias = shipment.container;
    const etaStr = shipment.eta || 'N/A';

    // STRICT DATA PRIVACY: Return ONLY container alias and ETA date.
    // ZERO JSONCargo API calls (strictly local MongoDB read).
    // NO date calculations, NO actual container number, NO shipping line.
    return NextResponse.json({
      success: true,
      container: containerAlias,
      eta: etaStr,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
