import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import { translateToEnglish } from '@/lib/translate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const receiptQuery = searchParams.get('receipt')?.trim();

  if (!receiptQuery) {
    return NextResponse.json({ error: 'Receipt parameter is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    // Perform case-insensitive search for receipt - returns ALL matching shipments across all containers
    const rawShipments: any[] = await Shipment.find({
      receipt: { $regex: new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ uploadedAt: -1 }).lean();

    if (!rawShipments || rawShipments.length === 0) {
      return NextResponse.json(
        { error: `No cargo record found for receipt number '${receiptQuery}'` },
        { status: 404 }
      );
    }

    // STRICT DATA MASKING & ENGLISH ONLY TRANSLATION: Omit containerNumber; Translate commodities to English ONLY
    const publicCargoDetails = rawShipments.map((shipment) => ({
      id: shipment._id,
      receipt: shipment.receipt,
      container: shipment.container, // Public Container Alias e.g. 'USI 01'
      english: translateToEnglish(shipment.english || shipment.commodity || shipment.chinese),
      chinese: translateToEnglish(shipment.chinese || shipment.commodity || shipment.english),
      commodity: translateToEnglish(shipment.commodity || shipment.english || shipment.chinese),
      quantity: shipment.quantity || '0',
      cartons: shipment.quantity || '0', // Explicit cartons count alias
      packets: shipment.quantity || '0', // Explicit packets count alias
      weight: shipment.weight || 'N/A',
      volume: shipment.volume || 'N/A',
      date: shipment.date || 'N/A',
      warehouseEntry: shipment.warehouseEntry || 'N/A',
      warehouse: shipment.warehouse || 'N/A',
      stockstatus: shipment.stockstatus || 'N/A',
      packaging: shipment.packaging || 'N/A',
      mainMarka: shipment.mainMarka || '',
      subMarka: shipment.subMarka || '',
      status: shipment.status || 'Pending',
      eta: shipment.eta || 'N/A',
      expectedDeliveryDate: shipment.eta || 'N/A',
    }));

    return NextResponse.json({
      success: true,
      count: publicCargoDetails.length,
      receipt: receiptQuery,
      // Provide both array `shipments` and primary `data` object for backwards compatibility
      data: publicCargoDetails[0],
      shipments: publicCargoDetails,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve receipt details' },
      { status: 500 }
    );
  }
}
