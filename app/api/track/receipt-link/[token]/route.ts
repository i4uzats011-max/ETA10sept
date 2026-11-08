import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';

export const dynamic = 'force-dynamic';

function parseEtaTimestamp(val?: string | null): number | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'n/a') return null;

  const currentYear = new Date().getFullYear();

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  const dmMatch = str.match(/^(\d{1,2})\s*[-/ ]?\s*([a-zA-Z]+)(?:\s*[-/ ,]?\s*(\d{2,4}))?$/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const mKey = dmMatch[2].toLowerCase();
    let year = dmMatch[3] ? parseInt(dmMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  const mdMatch = str.match(/^([a-zA-Z]+)\s*[-/ ]?\s*(\d{1,2})(?:[,\s]+(\d{2,4}))?$/);
  if (mdMatch) {
    const mKey = mdMatch[1].toLowerCase();
    const day = parseInt(mdMatch[2], 10);
    let year = mdMatch[3] ? parseInt(mdMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    if (d.getFullYear() === 2001 && !str.includes('2001')) {
      d.setFullYear(currentYear);
    }
    return d.getTime();
  }

  return null;
}

function calculateRemainDays(etaString?: string): number | null {
  if (!etaString) return null;
  const ts = parseEtaTimestamp(etaString);
  if (ts === null) return null;
  const etaDate = new Date(ts);

  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = etaStart.getTime() - nowStart.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    await connectToDatabase();

    const trackingDoc = await ReceiptTracking.findOne({ token }).lean();
    if (!trackingDoc || !trackingDoc.receipts || trackingDoc.receipts.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No shipment found for this tracking link.' },
        { status: 404 }
      );
    }

    // STRICT SANITIZATION: Only the allowed public fields and nothing else
    // Specifically: Marka, Receipt No., Item Name, Container No. (not actual), CBM, Weight, CTN, ETA, remainDays, status
    const publicReceipts = trackingDoc.receipts.map((r: any) => ({
      marka: r.marka || trackingDoc.name || '-',
      receiptNo: r.receiptNo || 'N/A',
      itemName: r.itemName || '-',
      containerNo: r.containerNo || 'N/A', // Container No. (not actual)
      cbm: r.cbm || '0',
      weight: r.weight || '-',
      ctn: r.ctn || '0',
      eta: r.eta || null,
      status: r.status || 'In Transit',
      remainDays: calculateRemainDays(r.eta),
      updatedAt: r.updatedAt || trackingDoc.updatedAt
    }));

    return NextResponse.json({
      success: true,
      token: trackingDoc.token,
      name: trackingDoc.name || undefined,
      count: publicReceipts.length,
      receipts: publicReceipts
    });
  } catch (error: any) {
    console.error('Error fetching public tracking link:', error);
    return NextResponse.json(
      { success: false, message: 'Server error retrieving tracking details' },
      { status: 500 }
    );
  }
}
