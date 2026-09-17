import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Bill from '@/models/Bill';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isAnyAuthenticated } from '@/lib/auth';
import { formatReceiptDate, calculateDaysBetween } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    const {
      billIds,
      marka,
      vehicleNumber,
      deliveryDate,
      deliveryTime,
      remarks,
      deliveryAddressTitle,
      deliveryAddress,
      deliveryPhone,
      dispatchedCartons,
    } = body;

    const cleanVehicle = String(vehicleNumber || '').trim();
    if (!cleanVehicle) {
      return NextResponse.json(
        { error: 'Vehicle number (गाड़ी नंबर) is required to dispatch goods.' },
        { status: 400 }
      );
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const formattedDate = formatReceiptDate(deliveryDate || todayIso);
    const formattedTime =
      deliveryTime ||
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Determine target bills
    let targetQuery: any = {};
    if (Array.isArray(billIds) && billIds.length > 0) {
      targetQuery._id = { $in: billIds };
    } else if (marka) {
      const markaRegex = new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      targetQuery.$or = [{ mainMarka: markaRegex }, { subMarka: markaRegex }];
    } else {
      return NextResponse.json(
        { error: 'Please specify bill IDs or a Marka to dispatch.' },
        { status: 400 }
      );
    }

    // 1. Fetch matching bills
    const billsToDispatch = await Bill.find(targetQuery);
    if (billsToDispatch.length === 0) {
      return NextResponse.json(
        { error: 'No bills found matching the selection criteria.' },
        { status: 404 }
      );
    }

    const billIdsList = billsToDispatch.map((b) => b._id);
    const receiptNumbers = Array.from(
      new Set(billsToDispatch.map((b) => String(b.receipt || '').trim()).filter(Boolean))
    );

    const totalCartonsSum = billsToDispatch.reduce((sum, b) => sum + (b.totalCartons || 0), 0);
    const overallRatio =
      typeof dispatchedCartons === 'number' && dispatchedCartons > 0 && totalCartonsSum > 0
        ? Math.min(1, dispatchedCartons / totalCartonsSum)
        : 1;

    // 2. Update Bill documents
    for (const bill of billsToDispatch) {
      bill.vehicleNumber = cleanVehicle;
      bill.isDispatched = true;
      bill.dispatchStatus = 'Delivered';
      bill.dispatchedAt = new Date();
      bill.deliveryDate = formattedDate;
      bill.deliveryTime = formattedTime;
      if (deliveryAddress) bill.deliveryAddress = deliveryAddress;
      if (deliveryAddressTitle) bill.deliveryAddressTitle = deliveryAddressTitle;
      if (deliveryPhone) bill.deliveryPhone = deliveryPhone;
      bill.dispatchedBy = 'dispatcher';
      bill.dispatchRemarks = remarks || 'Dispatched via vehicle (माल डिस्पैच्ड)';

      if (typeof dispatchedCartons === 'number' && dispatchedCartons > 0) {
        if (billsToDispatch.length === 1) {
          bill.dispatchedCartons = dispatchedCartons;
        } else {
          bill.dispatchedCartons = Math.round((bill.totalCartons || 0) * overallRatio);
        }
        if (bill.totalCartons && bill.totalCartons > 0) {
          bill.remainingCartons = Math.max(0, bill.totalCartons - bill.dispatchedCartons);
        }
      } else if (bill.totalCartons && (!bill.dispatchedCartons || bill.dispatchedCartons === 0)) {
        bill.dispatchedCartons = bill.totalCartons;
        bill.remainingCartons = 0;
      }

      await bill.save();
    }

    // 3. Update matching Shipment documents
    const affectedContainersSet = new Set<string>();
    for (const rec of receiptNumbers) {
      const recRegex = new RegExp(`^${rec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const shipments = await Shipment.find({ receipt: recRegex });

      for (const ship of shipments) {
        if (ship.container) {
          affectedContainersSet.add(ship.container);
        }

        let daysToDeliver: number | null = null;
        const startDate = ship.date || ship.loadingDate || '';
        if (startDate && formattedDate) {
          daysToDeliver = calculateDaysBetween(startDate, formattedDate);
          if (daysToDeliver !== null && daysToDeliver < 0) daysToDeliver = 0;
        }

        ship.isDelivered = true;
        ship.deliveryDate = formattedDate;
        ship.status = 'Delivered';
        ship.stockstatus = 'Dispatched';
        if (daysToDeliver !== null) ship.daysToDeliver = daysToDeliver;
        await ship.save();
      }

      // Also update WarehouseReceipt if exists
      const whReceipt = await WarehouseReceipt.findOne({ receipt: recRegex });
      if (whReceipt) {
        whReceipt.isDelivered = true;
        whReceipt.deliveryDate = formattedDate;
        whReceipt.status = 'Delivered';
        whReceipt.stockstatus = 'Delivered';
        await whReceipt.save();
      }
    }

    // 4. Update Container records
    const updatedContainers: string[] = [];
    for (const containerAlias of Array.from(affectedContainersSet)) {
      if (!containerAlias) continue;
      const totalShipments = await Shipment.countDocuments({ container: containerAlias });
      const undeliveredShipments = await Shipment.countDocuments({
        container: containerAlias,
        isDelivered: { $ne: true },
      });

      const isAllDelivered = undeliveredShipments === 0;
      const cont = await Container.findOne({ container: containerAlias });

      if (cont) {
        let contDays: number | null = null;
        const contStart = cont.startDate || cont.loadingDate || '';
        if (contStart && formattedDate) {
          contDays = calculateDaysBetween(contStart, formattedDate);
          if (contDays !== null && contDays < 0) contDays = 0;
        }

        cont.isDelivered = isAllDelivered;
        cont.status = isAllDelivered ? 'Delivered' : 'Partially Delivered';
        cont.deliveryDate = formattedDate;
        if (contDays !== null) cont.daysToDeliver = contDays;
        await cont.save();
        updatedContainers.push(containerAlias);
      }
    }

    // Fetch updated bills to return
    const updatedBills = await Bill.find({ _id: { $in: billIdsList } });

    return NextResponse.json({
      success: true,
      message: `Successfully marked ${updatedBills.length} bills as Dispatched / Delivered with Vehicle '${cleanVehicle}'.`,
      dispatchedCount: updatedBills.length,
      vehicleNumber: cleanVehicle,
      deliveryDate: formattedDate,
      deliveryTime: formattedTime,
      updatedContainers,
      bills: updatedBills,
    });
  } catch (error: any) {
    console.error('Error in dispatch route:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to dispatch bills' },
      { status: 500 }
    );
  }
}
