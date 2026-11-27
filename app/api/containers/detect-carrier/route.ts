import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import ShippingLine from '@/models/ShippingLine';
import { detectCarrierWithGemini, batchDetectCarriersWithGemini, ensureShippingLineExists } from '@/lib/carrierDetector';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/containers/detect-carrier?containerNumber=GESU6221024
 * Returns carrier information identified by Gemini AI.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const containerNumber = (searchParams.get('containerNumber') || '').trim();
  const blNumber = (searchParams.get('blNumber') || '').trim();

  if (!containerNumber && !blNumber) {
    return NextResponse.json({ error: 'Either containerNumber or blNumber is required' }, { status: 400 });
  }

  try {
    const result = await detectCarrierWithGemini(containerNumber, undefined, blNumber);
    await ensureShippingLineExists(result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to detect carrier' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/containers/detect-carrier
 * Body: { fixDatabase: boolean }
 * Batch checks all containers in MongoDB, corrects any mismatched shipping lines using Gemini AI,
 * updates Container and Shipment collections, and ensures every detected carrier is registered in ShippingLine collection.
 */
export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // 1. Fetch all containers
    const containers = await Container.find().lean();
    if (!containers || containers.length === 0) {
      return NextResponse.json({ success: true, message: 'No containers to process', updatedCount: 0 });
    }

    // 2. Prepare container list with actual container numbers
    const listToProcess = containers
      .map((c: any) => ({
        containerId: String(c._id),
        alias: c.container,
        containerNumber: (c.containerNumber || '').trim(),
        existingCarrier: c.shippingLine || '',
      }))
      .filter((c) => c.containerNumber && c.containerNumber.length >= 8);

    // 3. Batch detect via Gemini AI
    const detectedMap = await batchDetectCarriersWithGemini(
      listToProcess.map((c) => ({
        containerNumber: c.containerNumber,
        existingCarrier: c.existingCarrier,
      }))
    );

    let updatedCount = 0;
    const correctionLogs: any[] = [];

    // 4. Update MongoDB records and ShippingLine registry
    for (const item of listToProcess) {
      const detected = detectedMap[item.containerNumber];
      if (!detected) continue;

      // Auto-register shipping line in ShippingLine collection
      await ensureShippingLineExists(detected);

      // Check if carrier needs correction
      const currentNorm = (item.existingCarrier || '').toUpperCase().replace(/[-\s]/g, '_');
      const detectedNorm = detected.canonicalCode.toUpperCase().replace(/[-\s]/g, '_');

      if (!currentNorm || currentNorm !== detectedNorm) {
        // Update Container
        await Container.updateOne(
          { _id: item.containerId },
          { $set: { shippingLine: detected.canonicalCode } }
        );

        // Update all related Shipments
        const regexNum = new RegExp(`^${item.containerNumber.replace(/[-_\s]+/g, '[-_\\s]*')}$`, 'i');
        const regexAlias = item.alias ? new RegExp(`^${item.alias.replace(/[-_\s]+/g, '[-_\\s]*')}$`, 'i') : null;

        const shipmentFilter = regexAlias
          ? { $or: [{ containerNumber: regexNum }, { container: regexNum }, { container: regexAlias }] }
          : { $or: [{ containerNumber: regexNum }, { container: regexNum }] };

        await Shipment.updateMany(shipmentFilter, {
          $set: { shippingLine: detected.canonicalCode },
        });

        updatedCount++;
        correctionLogs.push({
          alias: item.alias,
          containerNumber: item.containerNumber,
          oldCarrier: item.existingCarrier,
          correctedCarrier: detected.canonicalCode,
          displayName: detected.displayName,
          website: detected.website,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${listToProcess.length} containers. Corrected ${updatedCount} carrier mappings.`,
      updatedCount,
      corrections: correctionLogs,
    });
  } catch (err: any) {
    console.error('Batch carrier detection error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to batch process carrier detection' },
      { status: 500 }
    );
  }
}
