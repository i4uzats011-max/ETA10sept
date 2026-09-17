import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Bill from '@/models/Bill';
import MarkaAddress from '@/models/MarkaAddress';
import Container from '@/models/Container';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const receipt = searchParams.get('receipt')?.trim();
    const container = searchParams.get('container')?.trim();
    const marka = searchParams.get('marka')?.trim();
    const options = searchParams.get('options');

    // 1. Return global options (list of active containers and distinct markas)
    if (options === 'true' || options === '1') {
      const distinctContainers = await Shipment.distinct('container');
      const mainMarkas = await Shipment.distinct('mainMarka');
      const subMarkas = await Shipment.distinct('subMarka');

      const allMarkas = Array.from(
        new Set(
          [...mainMarkas, ...subMarkas]
            .filter((m) => Boolean(m && typeof m === 'string' && m.trim()))
            .map((m) => m.trim())
        )
      ).sort();

      return NextResponse.json({
        success: true,
        containers: distinctContainers.filter(Boolean).sort(),
        markas: allMarkas,
      });
    }

    // 2. Lookup by Container (with or without Marka)
    if (container) {
      const cleanEscaped = container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const containerDoc = await Container.findOne({
        $or: [
          { container: new RegExp(`^${cleanEscaped}$`, 'i') },
          { container: new RegExp(cleanEscaped, 'i') },
          { containerNumber: new RegExp(`^${cleanEscaped}$`, 'i') },
        ],
      }).lean();

      const targetContainer = containerDoc ? (containerDoc as any).container : container;
      const containerRegex = new RegExp(`^${targetContainer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

      const query: any = { container: containerRegex };

      if (marka && marka !== 'all') {
        const markaRegex = new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        query.$or = [{ mainMarka: markaRegex }, { subMarka: markaRegex }];
      }

      const shipments = await Shipment.find(query)
        .sort({ receipt: 1 })
        .select('receipt container containerNumber party mainMarka subMarka commodity english quantity weight warehouse')
        .lean();

      // Aggregate markas in this container
      const markaMap = new Map<string, { marka: string; count: number; totalCartons: number; receipts: string[] }>();
      shipments.forEach((s: any) => {
        const m = (s.mainMarka || s.subMarka || 'UNMARKED').trim();
        if (!markaMap.has(m)) {
          markaMap.set(m, { marka: m, count: 0, totalCartons: 0, receipts: [] });
        }
        const item = markaMap.get(m)!;
        item.count += 1;
        item.totalCartons += Number(s.quantity) || 0;
        if (s.receipt) item.receipts.push(s.receipt);
      });

      let markaAddress: any = null;
      if (marka && marka !== 'all') {
        markaAddress = await MarkaAddress.findOne({
          marka: new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).lean();
      }

      return NextResponse.json({
        success: true,
        container: targetContainer,
        markas: Array.from(markaMap.values()),
        shipments: shipments.map((s: any) => ({
          receipt: s.receipt,
          container: s.container,
          mainMarka: s.mainMarka || '',
          subMarka: s.subMarka || '',
          marka: s.mainMarka || s.subMarka || '',
          party: s.party || '',
          commodity: s.commodity || s.english || 'Commercial Cargo',
          cartons: Number(s.quantity) || 0,
          weightKg: Number(s.weight) || 0,
          warehouse: s.warehouse || '',
        })),
        markaAddress: markaAddress || null,
      });
    }

    // 3. Lookup by Marka across all containers
    if (marka && !receipt) {
      const markaRegex = new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const shipments = await Shipment.find({
        $or: [{ mainMarka: markaRegex }, { subMarka: markaRegex }],
      })
        .sort({ receipt: 1 })
        .select('receipt container containerNumber party mainMarka subMarka commodity english quantity weight warehouse')
        .lean();

      const markaAddress = await MarkaAddress.findOne({
        marka: markaRegex,
      }).lean();

      return NextResponse.json({
        success: true,
        marka,
        totalShipments: shipments.length,
        shipments: shipments.map((s: any) => ({
          receipt: s.receipt,
          container: s.container,
          mainMarka: s.mainMarka || '',
          subMarka: s.subMarka || '',
          marka: s.mainMarka || s.subMarka || '',
          party: s.party || '',
          commodity: s.commodity || s.english || 'Commercial Cargo',
          cartons: Number(s.quantity) || 0,
          weightKg: Number(s.weight) || 0,
          warehouse: s.warehouse || '',
        })),
        markaAddress: markaAddress || null,
      });
    }

    // 4. Lookup by specific Receipt
    if (receipt) {
      const shipment = await Shipment.findOne({
        receipt: new RegExp(`^${receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      const existingBill = await Bill.findOne({
        receipt: new RegExp(`^${receipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      if (!shipment && !existingBill) {
        return NextResponse.json({ found: false, message: 'Receipt not found in database' }, { status: 404 });
      }

      const activeMarka =
        (shipment as any)?.mainMarka ||
        (shipment as any)?.subMarka ||
        (existingBill as any)?.mainMarka ||
        (existingBill as any)?.subMarka ||
        '';

      let markaAddress: any = null;
      if (activeMarka) {
        markaAddress = await MarkaAddress.findOne({
          marka: new RegExp(`^${activeMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).lean();
      }

      const cartonsNum = Number((shipment as any)?.quantity) || (existingBill as any)?.totalCartons || 0;
      const weightNum = Number((shipment as any)?.weight) || (existingBill as any)?.quantityKg || 0;

      return NextResponse.json({
        found: true,
        shipment: shipment || null,
        existingBill: existingBill || null,
        markaAddress: markaAddress || null,
        autoFill: {
          receipt: (shipment as any)?.receipt || (existingBill as any)?.receipt || receipt,
          container: (shipment as any)?.container || (existingBill as any)?.container || '',
          containerNumber: (shipment as any)?.containerNumber || (existingBill as any)?.containerNumber || '',
          party: (shipment as any)?.party || (existingBill as any)?.party || '',
          mainMarka: (shipment as any)?.mainMarka || (existingBill as any)?.mainMarka || '',
          subMarka: (shipment as any)?.subMarka || (existingBill as any)?.subMarka || '',
          commodity:
            (shipment as any)?.commodity || (shipment as any)?.english || (existingBill as any)?.commodity || 'Commercial Cargo',
          totalCartons: cartonsNum,
          quantityPcs: (existingBill as any)?.quantityPcs || (cartonsNum > 0 ? cartonsNum * 10 : 0),
          quantityKg: weightNum,
          hsnCode: (existingBill as any)?.hsnCode || '',
          igst: (existingBill as any)?.igst || 18,
          billingUnit: (existingBill as any)?.billingUnit || 'Pcs',
          taxableValue: (existingBill as any)?.taxableValue || 0,
          warehouse: (shipment as any)?.warehouse || (existingBill as any)?.warehouse || '',
          vehicleNumber: (existingBill as any)?.vehicleNumber || '',
          isDispatched: Boolean((existingBill as any)?.isDispatched),

          // Purchaser details from Marka Directory or existing bill
          purchaserName:
            markaAddress?.purchaserName ||
            (existingBill as any)?.purchaserName ||
            (shipment as any)?.party ||
            '',
          purchaserRegistrationType:
            markaAddress?.registrationType || (existingBill as any)?.purchaserRegistrationType || 'Registered',
          purchaserGstin: markaAddress?.gstin || (existingBill as any)?.purchaserGstin || '',
          purchaserAddress:
            markaAddress?.addresses?.[0]?.address || (existingBill as any)?.purchaserAddress || '',
        },
      });
    }

    return NextResponse.json({ error: 'Please provide container, marka, or receipt parameter' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in lookup:', error);
    return NextResponse.json({ error: error?.message || 'Lookup failed' }, { status: 500 });
  }
}

