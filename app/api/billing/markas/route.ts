import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Bill from '@/models/Bill';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const container = searchParams.get('container')?.trim();

    // Aggregation pipeline to group bills by mainMarka or subMarka
    const pipeline: any[] = [];

    if (container && container !== 'all') {
      pipeline.push({
        $match: {
          container: new RegExp(`^${container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        },
      });
    }

    pipeline.push(
      {
        $project: {
          marka: {
            $cond: [
              { $and: [{ $ne: ['$mainMarka', ''] }, { $ne: ['$mainMarka', null] }] },
              '$mainMarka',
              {
                $cond: [
                  { $and: [{ $ne: ['$subMarka', ''] }, { $ne: ['$subMarka', null] }] },
                  '$subMarka',
                  'UNMARKED',
                ],
              },
            ],
          },
          isDispatched: 1,
          container: 1,
          quantityPcs: 1,
          quantityKg: 1,
          totalCartons: 1,
          dispatchedCartons: 1,
          remainingCartons: 1,
          billingUnit: 1,
          taxableValue: 1,
          totalAmount: 1,
          receipt: 1,
          vehicleNumber: 1,
        },
      },
      {
        $group: {
          _id: '$marka',
          totalBills: { $sum: 1 },
          pendingBills: {
            $sum: { $cond: [{ $eq: ['$isDispatched', false] }, 1, 0] },
          },
          dispatchedBills: {
            $sum: { $cond: [{ $eq: ['$isDispatched', true] }, 1, 0] },
          },
          totalPcs: { $sum: '$quantityPcs' },
          totalKg: { $sum: '$quantityKg' },
          totalCartons: { $sum: '$totalCartons' },
          dispatchedCartons: { $sum: '$dispatchedCartons' },
          totalTaxable: { $sum: '$taxableValue' },
          grandTotal: { $sum: '$totalAmount' },
          containers: { $addToSet: '$container' },
          vehicles: { $addToSet: '$vehicleNumber' },
          billingUnits: { $addToSet: '$billingUnit' },
        },
      },
      { $sort: { pendingBills: -1, _id: 1 } }
    );

    const markas = await Bill.aggregate(pipeline as any);

    return NextResponse.json({
      success: true,
      markas: markas.map((m) => ({
        marka: m._id,
        totalBills: m.totalBills,
        pendingBills: m.pendingBills,
        dispatchedBills: m.dispatchedBills,
        totalPcs: m.totalPcs,
        totalKg: m.totalKg,
        totalCartons: m.totalCartons || 0,
        dispatchedCartons: m.dispatchedCartons || 0,
        remainingCartons: Math.max(0, (m.totalCartons || 0) - (m.dispatchedCartons || 0)),
        totalTaxable: m.totalTaxable,
        grandTotal: m.grandTotal,
        containers: m.containers.filter(Boolean),
        vehicles: m.vehicles.filter(Boolean),
        billingUnits: m.billingUnits.filter(Boolean),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching markas:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch markas' }, { status: 500 });
  }
}
