import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';

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

    if (foundContainer) {
      containerAlias = foundContainer.container;
      etaStr = foundContainer.destinationDate || foundContainer.eta || 'Pending';
    } else {
      // 2. Fallback to Shipment records
      const shipment: any = await Shipment.findOne({ $or: orConditions }).sort({ uploadedAt: -1 }).lean();
      if (shipment) {
        containerAlias = shipment.container;
        etaStr = shipment.eta || 'Pending';
      }
    }

    if (!containerAlias) {
      return NextResponse.json(
        { error: `No container found matching '${containerQuery}'. Please check the container number and try again.` },
        { status: 404 }
      );
    }

    // STRICT DATA PRIVACY: Return ONLY container alias and ETA date.
    // ZERO JSONCargo API calls (strictly local MongoDB read).
    // NO date calculations, NO actual container number, NO shipping line.
    return NextResponse.json({
      success: true,
      container: containerAlias,
      eta: etaStr || 'Pending',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve container tracking' },
      { status: 500 }
    );
  }
}
