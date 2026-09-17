import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Bill from '@/models/Bill';
import Shipment from '@/models/Shipment';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search')?.trim() || '';
    const marka = searchParams.get('marka')?.trim() || '';
    const container = searchParams.get('container')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const query: any = {};

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { receipt: regex },
        { billNumber: regex },
        { party: regex },
        { hsnCode: regex },
        { vehicleNumber: regex },
        { mainMarka: regex },
        { subMarka: regex },
        { container: regex },
      ];
    }

    if (marka) {
      const markaRegex = new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      query.$or = [{ mainMarka: markaRegex }, { subMarka: markaRegex }];
    }

    if (container) {
      query.container = new RegExp(container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (status === 'pending') {
      query.isDispatched = false;
    } else if (status === 'dispatched' || status === 'delivered') {
      query.isDispatched = true;
    }

    const totalCount = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      bills,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error: any) {
    console.error('Error fetching bills:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch bills' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    // Support both single bill object or array of bills (bulk upload)
    const items: any[] = Array.isArray(body) ? body : Array.isArray(body.bills) ? body.bills : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: 'No bill records provided' }, { status: 400 });
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawReceipt = String(item.receipt || item['Receipt No.'] || item['Receeipt No.'] || item.receiptNo || '').trim();

      if (!rawReceipt) {
        errors.push({ index: i, error: 'Receipt number is required' });
        continue;
      }

      const hsnCode = String(item.hsnCode || item['HSN Code'] || item.hsn || '').trim();
      const igst = Number(item.igst || item.IGST || 18);
      const quantityPcs = Number(item.quantityPcs || item['Quantity pcs'] || item['Quntity pcs'] || item.pcs || 0);
      const quantityKg = Number(item.quantityKg || item['Quantity kg'] || item['Weight kg'] || item.kg || 0);
      const taxableValue = Number(item.taxableValue || item['Taxable'] || item.taxable || 0);

      // Attempt to look up existing shipment details by receipt
      const shipment = await Shipment.findOne({
        receipt: new RegExp(`^${rawReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      // Cartons and billing unit
      const totalCartons = Number(item.totalCartons || item.cartons || item['Cartons'] || item['Cartons (CTN)'] || (shipment as any)?.quantity || 0);
      const rawUnit = String(item.billingUnit || item['Billing Unit'] || 'Pcs').trim().toLowerCase();
      const billingUnit: 'Pcs' | 'KG' | 'Cartons' = rawUnit.includes('kg') ? 'KG' : rawUnit.includes('carton') || rawUnit.includes('ctn') ? 'Cartons' : 'Pcs';

      const igstAmount = Number((taxableValue * (igst / 100)).toFixed(2));
      const totalAmount = Number((taxableValue + igstAmount).toFixed(2));

      const container = item.container || (shipment as any)?.container || '';
      const containerNumber = item.containerNumber || (shipment as any)?.containerNumber || '';
      const party = item.party || (shipment as any)?.party || 'General Party';
      const mainMarka = item.mainMarka || (shipment as any)?.mainMarka || '';
      const subMarka = item.subMarka || (shipment as any)?.subMarka || '';
      const commodity = item.commodity || (shipment as any)?.commodity || (shipment as any)?.english || 'Commercial Cargo';
      const warehouse = item.warehouse || (shipment as any)?.warehouse || '';
      const loadingDate = item.loadingDate || (shipment as any)?.loadingDate || '';
      const eta = item.eta || (shipment as any)?.eta || '';

      const billNumber = item.billNumber || `BILL-${rawReceipt}`;

      // Seller Resolution: check if seller provided or fallback to default
      const Seller = (await import('@/models/Seller')).default;
      let sellerName = item.sellerName || '';
      let sellerGstin = item.sellerGstin || '';
      let sellerAddress = item.sellerAddress || '';
      let sellerState = item.sellerState || '';
      let sellerStateCode = item.sellerStateCode || '';
      let sellerId = item.sellerId || '';

      if (!sellerName) {
        const defSeller: any = (await Seller.findOne({ isDefault: true }).lean()) || (await Seller.findOne().lean());
        if (defSeller) {
          sellerId = defSeller._id.toString();
          sellerName = defSeller.name;
          sellerGstin = defSeller.gstin || '';
          sellerAddress = defSeller.address;
          sellerState = defSeller.state;
          sellerStateCode = defSeller.stateCode || '';
        }
      }

      // Purchaser Resolution (Registered or Unregistered)
      const effectiveMarka = mainMarka || subMarka || '';
      const MarkaAddress = (await import('@/models/MarkaAddress')).default;
      let existingMarkaRecord = effectiveMarka
        ? await MarkaAddress.findOne({
            marka: new RegExp(`^${effectiveMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          })
        : null;

      const purchaserName = item.purchaserName || existingMarkaRecord?.purchaserName || party || 'General Party';
      const purchaserRegistrationType = item.purchaserRegistrationType || existingMarkaRecord?.registrationType || 'Registered';
      const purchaserGstin = (item.purchaserGstin !== undefined ? item.purchaserGstin : existingMarkaRecord?.gstin) || '';
      const purchaserAddress = item.purchaserAddress || existingMarkaRecord?.addresses?.[0]?.address || '';

      // Auto-save/sync Marka Purchaser directory if Marka is present
      if (effectiveMarka) {
        if (!existingMarkaRecord) {
          existingMarkaRecord = await MarkaAddress.create({
            marka: effectiveMarka,
            purchaserName,
            registrationType: purchaserRegistrationType,
            gstin: purchaserGstin,
            state: 'Delhi',
            addresses: purchaserAddress
              ? [
                  {
                    title: 'Primary Godown',
                    address: purchaserAddress,
                    state: 'Delhi',
                    isDefault: true,
                  },
                ]
              : [],
          });
        } else {
          let modified = false;
          if (item.purchaserName && existingMarkaRecord.purchaserName !== item.purchaserName) {
            existingMarkaRecord.purchaserName = item.purchaserName;
            modified = true;
          }
          if (item.purchaserRegistrationType && existingMarkaRecord.registrationType !== item.purchaserRegistrationType) {
            existingMarkaRecord.registrationType = item.purchaserRegistrationType;
            modified = true;
          }
          if (item.purchaserGstin && existingMarkaRecord.gstin !== item.purchaserGstin) {
            existingMarkaRecord.gstin = item.purchaserGstin;
            modified = true;
          }
          if (item.purchaserAddress && existingMarkaRecord.addresses.length === 0) {
            existingMarkaRecord.addresses.push({
              title: 'Primary Godown',
              address: item.purchaserAddress,
              state: 'Delhi',
              isDefault: true,
            });
            modified = true;
          }
          if (modified) await existingMarkaRecord.save();
        }
      }

      // Upsert bill: if bill for this receipt already exists, update billing details without wiping vehicleNumber if already dispatched
      const existingBill = await Bill.findOne({
        $or: [{ receipt: rawReceipt }, { billNumber }],
      });

      if (existingBill) {
        existingBill.receipt = rawReceipt;
        existingBill.hsnCode = hsnCode || existingBill.hsnCode;
        existingBill.igst = igst;
        existingBill.quantityPcs = quantityPcs || existingBill.quantityPcs;
        existingBill.quantityKg = quantityKg || existingBill.quantityKg;
        existingBill.taxableValue = taxableValue || existingBill.taxableValue;
        existingBill.igstAmount = igstAmount;
        existingBill.totalAmount = totalAmount;

        if (container) existingBill.container = container;
        if (containerNumber) existingBill.containerNumber = containerNumber;
        if (party) existingBill.party = party;
        if (mainMarka) existingBill.mainMarka = mainMarka;
        if (subMarka) existingBill.subMarka = subMarka;
        if (commodity) existingBill.commodity = commodity;
        if (warehouse) existingBill.warehouse = warehouse;
        if (totalCartons) {
          existingBill.totalCartons = totalCartons;
          existingBill.remainingCartons = Math.max(0, totalCartons - (existingBill.dispatchedCartons || 0));
        }
        if (billingUnit) existingBill.billingUnit = billingUnit;

        // Seller
        existingBill.sellerId = sellerId;
        existingBill.sellerName = sellerName;
        existingBill.sellerGstin = sellerGstin;
        existingBill.sellerAddress = sellerAddress;
        existingBill.sellerState = sellerState;
        existingBill.sellerStateCode = sellerStateCode;

        // Purchaser
        existingBill.purchaserName = purchaserName;
        existingBill.purchaserRegistrationType = purchaserRegistrationType;
        existingBill.purchaserGstin = purchaserGstin;
        existingBill.purchaserAddress = purchaserAddress;

        await existingBill.save();
        results.push(existingBill);
      } else {
        const newBill = await Bill.create({
          billNumber,
          receipt: rawReceipt,
          hsnCode,
          igst,
          quantityPcs,
          quantityKg,
          totalCartons,
          dispatchedCartons: 0,
          remainingCartons: totalCartons,
          billingUnit,
          taxableValue,
          igstAmount,
          totalAmount,
          container,
          containerNumber,
          party,
          mainMarka,
          subMarka,
          commodity,
          warehouse,
          loadingDate,
          eta,
          sellerId,
          sellerName,
          sellerGstin,
          sellerAddress,
          sellerState,
          sellerStateCode,
          purchaserName,
          purchaserRegistrationType,
          purchaserGstin,
          purchaserAddress,
          vehicleNumber: '', // initially without vehicle number as requested
          isDispatched: false,
          dispatchStatus: 'Pending Dispatch',
        });
        results.push(newBill);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${results.length} bills${errors.length ? ` (${errors.length} failed)` : ''}`,
      processedCount: results.length,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      bills: results,
    });
  } catch (error: any) {
    console.error('Error creating bills:', error);
    return NextResponse.json({ error: error?.message || 'Failed to generate bills' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }

    await Bill.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting bill:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete bill' }, { status: 500 });
  }
}
