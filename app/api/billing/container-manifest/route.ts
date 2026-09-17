import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
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
    const containerQuery = searchParams.get('container')?.trim();

    // If no specific container requested, return list of all active containers with shipment counts
    if (!containerQuery) {
      const allContainers = await Container.find()
        .sort({ createdAt: -1 })
        .select('container containerNumber status shipmentCount isDelivered loadingDate startDate')
        .lean();

      return NextResponse.json({ success: true, containers: allContainers });
    }

    // Match container by alias or partial number (e.g. '208' matches 'USSI-208', 'USI-208')
    const cleanEscaped = containerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const containerDoc = await Container.findOne({
      $or: [
        { container: new RegExp(`^${cleanEscaped}$`, 'i') },
        { container: new RegExp(cleanEscaped, 'i') },
        { containerNumber: new RegExp(`^${cleanEscaped}$`, 'i') },
      ],
    }).lean();

    const targetContainerAlias = containerDoc ? (containerDoc as any).container : containerQuery;

    // Fetch all shipments in this container
    const shipments = await Shipment.find({
      container: new RegExp(`^${targetContainerAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .sort({ receipt: 1 })
      .lean();

    // Fetch existing bills for these receipts to merge any existing billing details
    const receiptList = shipments.map((s) => s.receipt).filter(Boolean);
    const existingBills = await Bill.find({ receipt: { $in: receiptList } }).lean();
    const billsByReceipt = new Map<string, any>();
    existingBills.forEach((b) => billsByReceipt.set(b.receipt, b));

    // Prepare container billing rows
    const manifestRows = shipments.map((s, idx) => {
      const b = billsByReceipt.get(s.receipt);
      const cartonsNum = Number(s.quantity) || 0;
      const weightNum = Number(s.weight) || 0;

      return {
        srNo: idx + 1,
        container: s.container || targetContainerAlias,
        receipt: s.receipt,
        mainMarka: s.mainMarka || '',
        subMarka: s.subMarka || '',
        party: s.party || 'General Party',
        commodity: s.commodity || s.english || 'Commercial Cargo',
        cartons: cartonsNum,
        weightKg: weightNum,
        hsnCode: b?.hsnCode || '',
        igst: b?.igst || 18,
        billingUnit: b?.billingUnit || 'Pcs',
        quantityPcs: b?.quantityPcs || (cartonsNum > 0 ? cartonsNum * 10 : 0),
        quantityKg: b?.quantityKg || weightNum,
        taxableValue: b?.taxableValue || 0,
        totalAmount: b?.totalAmount || 0,
        isBilled: Boolean(b),
        vehicleNumber: b?.vehicleNumber || '',
        isDispatched: Boolean(b?.isDispatched),
      };
    });

    return NextResponse.json({
      success: true,
      container: targetContainerAlias,
      containerDoc,
      totalShipments: shipments.length,
      manifestRows,
    });
  } catch (error: any) {
    console.error('Error in container manifest:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch container manifest' }, { status: 500 });
  }
}
