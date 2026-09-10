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
    let dateOfDelivery = 'Pending';

    if (clearanceEta && clearanceEta !== 'N/A' && clearanceEta !== 'Pending') {
      dateOfDelivery = formatGlobalDate(clearanceEta);
    } else if (actualCarrierEta && actualCarrierEta !== 'N/A' && actualCarrierEta !== 'Pending') {
      dateOfDelivery = calculatePublicDeliveryDate(actualCarrierEta, bufferDays);
    }

    // Public tracking security: Users cannot see actual container no., status, or destination.
    // They can ONLY see date of delivery (ETA + 10 days) and internal container alias.
    return NextResponse.json({
      success: true,
      container: target.container,
      dateOfDelivery,
      eta: dateOfDelivery, // Backwards compatibility for UI fields
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
