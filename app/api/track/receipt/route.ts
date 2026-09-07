import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { translateToEnglish } from '@/lib/translate';

export const dynamic = 'force-dynamic';

function formatVolumeWithDecimals(vol: any): string {
  if (vol === null || vol === undefined || vol === '' || vol === 'N/A') return 'N/A';
  const clean = String(vol).replace(/cbm|m3/gi, '').trim();
  const n = parseFloat(clean);
  if (!isNaN(n)) {
    if (clean.includes('.')) {
      return clean;
    }
    return n.toFixed(2);
  }
  return clean;
}

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

    // Collect all container aliases to resolve confirmed ETA from Container fleet
    const containerAliases = Array.from(new Set(rawShipments.map((s) => s.container).filter(Boolean)));
    const containerDocs: any[] = await Container.find({
      $or: containerAliases.map((c) => ({
        container: new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-_\\s]?')}$`, 'i'),
      })),
    }).lean();

    const containerEtaMap = new Map<string, string>();
    containerDocs.forEach((c: any) => {
      const eta = (c.destinationDate && c.destinationDate !== 'N/A') ? c.destinationDate : c.eta;
      if (eta && eta !== 'N/A' && eta !== 'Pending') {
        containerEtaMap.set(c.container.toLowerCase().trim(), eta);
      }
    });

    // STRICT DATA MASKING & ENGLISH ONLY TRANSLATION: Omit containerNumber; Translate commodities to English ONLY
    const publicCargoDetails = rawShipments.map((shipment) => {
      const cClean = (shipment.container || '').toLowerCase().trim();
      const directEta = containerEtaMap.get(cClean);
      const fallbackDoc = containerDocs.find((cd: any) =>
        cd.container.toLowerCase().replace(/[-\s]/g, '') === cClean.replace(/[-\s]/g, '')
      );
      const containerEta = directEta || fallbackDoc?.destinationDate || fallbackDoc?.eta || '';

      const resolvedEta = (shipment.eta && shipment.eta !== 'N/A' && shipment.eta !== 'Pending')
        ? shipment.eta
        : (containerEta || shipment.eta || 'Pending');

      // Async backfill if shipment was missing ETA
      if ((!shipment.eta || shipment.eta === 'N/A' || shipment.eta === 'Pending') && resolvedEta && resolvedEta !== 'Pending') {
        Shipment.updateOne({ _id: shipment._id }, { $set: { eta: resolvedEta } }).exec().catch(() => {});
      }

      return {
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
        volume: formatVolumeWithDecimals(shipment.volume),
        date: shipment.date || 'N/A',
        warehouseEntry: shipment.warehouseEntry || 'N/A',
        warehouse: shipment.warehouse || 'N/A',
        stockstatus: shipment.stockstatus || 'N/A',
        packaging: shipment.packaging || 'N/A',
        mainMarka: shipment.mainMarka || '',
        subMarka: shipment.subMarka || '',
        status: shipment.status || 'In Transit',
        eta: resolvedEta,
        expectedDeliveryDate: resolvedEta,
      };
    });

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
