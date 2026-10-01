import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { calculatePublicDeliveryDate, formatGlobalDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

function buildContainerRegexes(input: string) {
  const clean = input.trim();
  const cleanEscaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = new RegExp(`^${cleanEscaped.replace(/[-\s]/g, '[-_\\s]?')}$`, 'i');

  const alphaNumericMatch = clean.match(/^([a-zA-Z]+)[-_\s]*0*(\d+)$/i);
  let zeroPaddedRegex: RegExp | null = null;
  if (alphaNumericMatch) {
    const prefix = alphaNumericMatch[1];
    const num = alphaNumericMatch[2];
    zeroPaddedRegex = new RegExp(`^${prefix}[-_\\s]*0*${num}$`, 'i');
  }
  return { normalized, zeroPaddedRegex, clean, cleanEscaped };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const containerQuery = searchParams.get('container')?.trim();

  if (!containerQuery) {
    return NextResponse.json({ error: 'Container parameter is required' }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const { normalized, zeroPaddedRegex, clean, cleanEscaped } = buildContainerRegexes(containerQuery);

    const orConditions: any[] = [
      { container: clean },
      { container: { $regex: normalized } },
    ];
    if (zeroPaddedRegex) {
      orConditions.push({ container: { $regex: zeroPaddedRegex } });
    }
    orConditions.push({ containerNumber: { $regex: new RegExp(`^${cleanEscaped}$`, 'i') } });

    // 1. Check Container fleet model first (Admin configured containers)
    const foundContainer: any = await Container.findOne({ $or: orConditions }).lean();

    let containerAlias = '';
    let etaStr = '';
    let foundShipment: any = null;

    if (foundContainer) {
      containerAlias = foundContainer.container;
      etaStr = foundContainer.destinationDate || foundContainer.eta || 'Pending';
    } else {
      // 2. Fallback to Shipment records
      foundShipment = await Shipment.findOne({ $or: orConditions }).sort({ uploadedAt: -1 }).lean();
      if (foundShipment) {
        containerAlias = foundShipment.container;
        etaStr = foundShipment.eta || 'Pending';
      }
    }

    if (!containerAlias) {
      return NextResponse.json(
        { error: `No container found matching '${containerQuery}'. Please check the container number and try again.` },
        { status: 404 }
      );
    }

    const target = foundContainer || foundShipment;
    const actualCarrierEta = target.rawEta;
    const clearanceEta = target.destinationDate || target.eta || '';
    const bufferDays = target.etaBufferDays ?? 10;
    // Per user requirement: Search by Container No. -> ETA = Actual Vessel ETA (Carrier) + 10d
    let publicEta = 'Pending';
    if (actualCarrierEta && actualCarrierEta !== 'N/A' && actualCarrierEta !== 'Pending') {
      publicEta = calculatePublicDeliveryDate(actualCarrierEta, 10);
    } else if (clearanceEta && clearanceEta !== 'N/A' && clearanceEta !== 'Pending') {
      publicEta = formatGlobalDate(clearanceEta);
    }

    let isDelivered = Boolean(
      target.isDelivered ||
      (target.status && target.status.toLowerCase().includes('deliver')) ||
      (target.deliveryDate && target.deliveryDate.trim() !== '')
    );
    let rawDeliveryDate = target.deliveryDate || '';

    if (!rawDeliveryDate && foundContainer) {
      const deliveredShipment = await Shipment.findOne({
        container: foundContainer.container,
        $or: [{ isDelivered: true }, { deliveryDate: { $exists: true, $nin: ['', null, 'N/A'] } }]
      }).lean();
      if (deliveredShipment) {
        isDelivered = true;
        rawDeliveryDate = (deliveredShipment as any).deliveryDate || '';
      }
    } else if (!rawDeliveryDate && foundShipment) {
      const contDoc = await Container.findOne({ container: foundShipment.container }).lean();
      if (contDoc?.deliveryDate || contDoc?.isDelivered) {
        isDelivered = true;
        rawDeliveryDate = contDoc.deliveryDate || '';
      }
    }

    const formattedDeliveryDate = rawDeliveryDate ? (formatGlobalDate(rawDeliveryDate) || rawDeliveryDate) : '';

    const rawEtaUpdated =
      target.etaUpdatedAt ||
      target.lastApiSync ||
      (publicEta !== 'Pending' ? target.updatedAt || target.uploadedAt : null);
    const etaUpdatedAt = rawEtaUpdated ? new Date(rawEtaUpdated).toISOString() : null;

    return NextResponse.json({
      success: true,
      container: target.container,
      eta: publicEta,
      deliveryDate: formattedDeliveryDate,
      dateOfDelivery: isDelivered ? formattedDeliveryDate : publicEta,
      isDelivered,
      status: isDelivered ? (target.status || 'Delivered') : 'In Transit',
      daysToDeliver: target.daysToDeliver ?? null,
      etaUpdatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
