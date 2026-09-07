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

    // Fetch all cargo packages assigned to this container alias
    const allShipments: any[] = await Shipment.find({
      container: { $regex: normalizedRegex },
    }).sort({ uploadedAt: -1 }).lean();

    const publicShipments = allShipments.map((s) => ({
      id: s._id,
      receipt: s.receipt,
      english: s.english || s.commodity || 'General Cargo',
      commodity: s.commodity || s.english || 'General Cargo',
      quantity: s.quantity || '0',
      weight: s.weight || 'N/A',
      volume: s.volume || 'N/A',
      warehouse: s.warehouse || 'China Warehouse',
      warehouseEntry: s.warehouseEntry || 'India Delivery Warehouse',
      date: s.date || 'N/A',
    }));

    // STRICT DATA PRIVACY: Return ONLY public alias, confirmed delivery ETA date, message, and cargo list.
    // ZERO JSONCargo API calls are made here (strictly local MongoDB read).
    // NO actual containerNumber (e.g. MSCU...), shippingLine, vessel, voyage, or raw carrier data is ever exposed!
    return NextResponse.json({
      success: true,
      container: containerAlias,
      eta: etaStr || 'N/A',
      destinationDate: shipment.destinationDate || etaStr || 'N/A',
      expectedDeliveryDate: formattedDate || etaStr || 'Pending',
      formattedArrivalMessage: message,
      daysRemaining,
      shipmentCount: publicShipments.length,
      shipments: publicShipments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
