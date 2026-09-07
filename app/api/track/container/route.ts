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
    const etaStr = shipment.eta;

    let message = '';
    let daysRemaining: number | null = null;
    let formattedDate = '';
    let status = shipment.status || 'Pending';

    if (etaStr && etaStr !== 'N/A' && !isNaN(new Date(etaStr).getTime())) {
      const etaDate = new Date(etaStr);
      const today = new Date();
      // Normalize time to start of day for accurate diff
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(etaDate);
      targetDate.setHours(0, 0, 0, 0);

      const diffTime = targetDate.getTime() - today.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const dayName = etaDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dd = String(etaDate.getDate()).padStart(2, '0');
      const mm = String(etaDate.getMonth() + 1).padStart(2, '0');
      const yy = String(etaDate.getFullYear()).slice(-2);
      formattedDate = `${dd}/${mm}/${yy}`;

      if (daysRemaining > 0) {
        message = `${containerAlias} is arriving on ${dayName}, ${formattedDate} (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining from today).`;
      } else if (daysRemaining === 0) {
        message = `${containerAlias} is arriving today, ${dayName}, ${formattedDate}.`;
      } else {
        const absDays = Math.abs(daysRemaining);
        message = `${containerAlias} arrived on ${dayName}, ${formattedDate} (${absDays} ${absDays === 1 ? 'day' : 'days'} ago).`;
      }
    } else {
      message = `${containerAlias} ETA status is currently unconfirmed or pending.`;
    }

    // STRICT DATA PRIVACY: Return ONLY public alias and confirmed delivery ETA date.
    // ZERO JSONCargo API calls (strictly local MongoDB read).
    // NO actual container number (MSCU...), NO shipping line, and NO manifest packages.
    // Full cargo details are accessible only via Receipt Number search.
    return NextResponse.json({
      success: true,
      container: containerAlias,
      eta: etaStr || 'N/A',
      destinationDate: shipment.destinationDate || etaStr || 'N/A',
      expectedDeliveryDate: formattedDate || etaStr || 'Pending',
      formattedArrivalMessage: message,
      daysRemaining,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
