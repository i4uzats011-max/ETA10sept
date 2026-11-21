import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import DailyTask from '@/models/DailyTask';
import SalesMessage from '@/models/SalesMessage';
import { isSalesPersonOrHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

// GET: Fetch sales records on-demand with multi-select (NO EAGER LOADING)
export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);
  const isSalesPersonOnly = currentUser.role === 'sales_person';

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'warehouse_date'; // 'warehouse_date' | 'container' | 'marka'

    // Multi-select query params (comma-separated or single)
    const rawWarehouses = searchParams.get('warehouses') || searchParams.get('warehouse');
    const rawDates = searchParams.get('dates') || searchParams.get('date');
    const rawContainers = searchParams.get('containers') || searchParams.get('container');
    const markaSearch = searchParams.get('marka')?.trim();
    const salesPersonFilter = searchParams.get('salesPerson')?.trim();

    const warehouseList = rawWarehouses
      ? rawWarehouses.split(',').map((w) => w.trim()).filter(Boolean)
      : [];
    const dateList = rawDates
      ? rawDates.split(',').map((d) => d.trim()).filter(Boolean)
      : [];
    const containerList = rawContainers
      ? rawContainers.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    // STRICT RULE: NO PRELOADING
    if (
      mode === 'warehouse_date' &&
      (warehouseList.length === 0 || dateList.length === 0)
    ) {
      return NextResponse.json({
        success: true,
        receipts: [],
        total: 0,
        message: 'No data preloaded. Please select Warehouse(s) and Date(s) to load receipts.',
      });
    }

    if (mode === 'container' && containerList.length === 0) {
      return NextResponse.json({
        success: true,
        receipts: [],
        total: 0,
        message: 'No data preloaded. Please select Container(s) / Loading Plan(s) to load cargo items.',
      });
    }

    if (mode === 'marka' && !markaSearch) {
      return NextResponse.json({
        success: true,
        receipts: [],
        total: 0,
        message: 'No data preloaded. Please type Marka to search.',
      });
    }

    let rawReceipts: any[] = [];
    let containerInfoMap: Map<string, { container: string; containerNumber?: string; loadingDate?: string }> = new Map();

    if (mode === 'container') {
      // 1. Multi-container lookup
      const containerRegexes = containerList.map(
        (c) => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      );

      const shipments = await Shipment.find({
        $or: [
          { container: { $in: containerRegexes } },
          { containerNumber: { $in: containerRegexes } },
        ],
      }).lean();

      const receiptNumbers = shipments.map((s: any) => s.receipt).filter(Boolean);
      const whReceipts = await WarehouseReceipt.find({
        receipt: { $in: receiptNumbers },
      }).lean();

      const whMap = new Map<string, any>();
      whReceipts.forEach((r: any) => whMap.set(r.receipt, r));

      const containerDocs = await Container.find({
        $or: [
          { container: { $in: containerRegexes } },
          { containerNumber: { $in: containerRegexes } },
        ],
      }).lean();

      const cDocMap = new Map<string, any>();
      containerDocs.forEach((cd: any) => {
        if (cd.container) cDocMap.set(cd.container.toLowerCase(), cd);
        if (cd.containerNumber) cDocMap.set(cd.containerNumber.toLowerCase(), cd);
      });

      rawReceipts = shipments.map((s: any) => {
        const wh = whMap.get(s.receipt) || {};
        const cDoc = cDocMap.get((s.container || '').toLowerCase()) || cDocMap.get((s.containerNumber || '').toLowerCase());
        return {
          _id: s._id,
          receipt: s.receipt,
          date: s.date || wh.date || '',
          warehouse: s.warehouse || wh.warehouse || '',
          container: s.container || (cDoc ? cDoc.container : ''),
          containerNumber: s.containerNumber || (cDoc ? cDoc.containerNumber : ''),
          loadingDate: s.loadingDate || (cDoc ? cDoc.loadingDate : ''),
          mainMarka: s.mainMarka || wh.mainMarka || '',
          subMarka: s.subMarka || wh.subMarka || '',
          commodity: s.english || s.commodity || wh.english || wh.commodity || '',
          chinese: s.chinese || wh.chinese || '',
          volume: s.volume || wh.volume || '',
          weight: s.weight || wh.weight || '',
          quantity: s.quantity || wh.quantity || 0,
          rate: (s as any)['Overall / Receipt Freight Rate'] || s.salesRate || s.rate || (wh as any)['Overall / Receipt Freight Rate'] || wh.salesRate || wh.rate || '',
          salesPerson: s.salesPerson || wh.salesPerson || '',
          salesPersonUsername: s.salesPersonUsername || wh.salesPersonUsername || '',
          salesRemarks: s.salesRemarks || wh.salesRemarks || '', // STRICT: blank unless Sales Head typed
          salesStatus: s.salesStatus || wh.salesStatus || 'Normal',
          holdReason: s.holdReason || wh.holdReason || '',
          salesDiscrepancy: s.salesDiscrepancy || wh.salesDiscrepancy || null,
          party: s.party || wh.party || '',
        };
      });
    } else {
      // mode === 'warehouse_date' or mode === 'marka'
      const query: Record<string, any> = {};

      if (warehouseList.length > 0 && !warehouseList.includes('ALL')) {
        const whRegexes = warehouseList.map(
          (w) => new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        );
        query.warehouse = { $in: whRegexes };
      }

      if (dateList.length > 0) {
        query.date = { $in: dateList };
      }

      if (markaSearch) {
        const markaRegex = new RegExp(markaSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ mainMarka: markaRegex }, { subMarka: markaRegex }, { party: markaRegex }];
      }

      const receipts = await WarehouseReceipt.find(query)
        .sort({ receipt: 1 })
        .lean();

      // Find mapped container/shipment for these receipts
      const receiptNums = receipts.map((r: any) => r.receipt).filter(Boolean);
      const mappedShipments = await Shipment.find({
        receipt: { $in: receiptNums },
      })
        .select('receipt container containerNumber loadingDate salesRate salesPerson salesRemarks salesStatus holdReason salesDiscrepancy')
        .lean();

      mappedShipments.forEach((s: any) => {
        if (s.receipt) {
          containerInfoMap.set(s.receipt, {
            container: s.container || '',
            containerNumber: s.containerNumber || '',
            loadingDate: s.loadingDate || '',
          });
        }
      });

      rawReceipts = receipts.map((r: any) => {
        const cInfo = containerInfoMap.get(r.receipt);
        return {
          _id: r._id,
          receipt: r.receipt,
          date: r.date || '',
          warehouse: r.warehouse || '',
          container: cInfo?.container || '',
          containerNumber: cInfo?.containerNumber || '',
          loadingDate: cInfo?.loadingDate || '',
          mainMarka: r.mainMarka || '',
          subMarka: r.subMarka || '',
          commodity: r.english || r.commodity || '',
          chinese: r.chinese || '',
          volume: r.volume || '',
          weight: r.weight || '',
          quantity: r.quantity || 0,
          rate: (r as any)['Overall / Receipt Freight Rate'] || r.salesRate || r.rate || '',
          salesPerson: r.salesPerson || '',
          salesPersonUsername: r.salesPersonUsername || '',
          salesRemarks: r.salesRemarks || '', // STRICT: blank unless entered by Sales Head
          salesStatus: r.salesStatus || 'Normal',
          holdReason: r.holdReason || '',
          salesDiscrepancy: r.salesDiscrepancy || null,
          party: r.party || '',
        };
      });
    }

    // Role-based filtering for sales_person (Replica view)
    let filteredReceipts = rawReceipts;
    if (isSalesPersonOnly) {
      const myUsername = (currentUser.username || '').toLowerCase();
      const myName = (currentUser.name || '').toLowerCase();
      filteredReceipts = rawReceipts.filter((r) => {
        const spUsername = (r.salesPersonUsername || '').toLowerCase();
        const spName = (r.salesPerson || '').toLowerCase();
        return spUsername === myUsername || spName === myName || (myName && spName.includes(myName));
      });
    } else if (salesPersonFilter && salesPersonFilter !== 'ALL') {
      const target = salesPersonFilter.toLowerCase();
      filteredReceipts = rawReceipts.filter((r) => {
        return (
          (r.salesPerson || '').toLowerCase() === target ||
          (r.salesPersonUsername || '').toLowerCase() === target
        );
      });
    }

    return NextResponse.json({
      success: true,
      receipts: filteredReceipts,
      total: filteredReceipts.length,
      mode,
      warehouses: warehouseList,
      dates: dateList,
      containers: containerList,
    });
  } catch (error: any) {
    console.error('Error fetching sales receipts:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// PATCH: Sales Head updates Rate, Sales Person, Remarks, Hold/Delivery Status, or Discrepancy
export async function PATCH(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const {
      receipt,
      warehouse,
      rate,
      salesPerson,
      salesPersonUsername,
      remarks,
      salesStatus,
      holdReason,
      discrepancyRequest, // { actualCbm, actualWeight, actualCtn, remarks }
    } = body;

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt number is required' }, { status: 400 });
    }

    // Find the warehouse receipt
    const cleanReceipt = receipt.trim();
    const whQuery: Record<string, any> = {
      receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    };
    if (warehouse && warehouse.trim()) {
      whQuery.warehouse = new RegExp(`^${warehouse.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }

    const whDoc = await WarehouseReceipt.findOne(whQuery);
    if (!whDoc) {
      return NextResponse.json({ error: `Receipt ${receipt} not found` }, { status: 404 });
    }

    // NOTE: Core warehouse fields (receipt, quantity, volume, weight, commodity, warehouse) CANNOT be directly changed here!
    // They can ONLY be updated if Admin approves a discrepancy request.

    const updates: Record<string, any> = {};

    if (rate !== undefined) {
      const cleanRate = String(rate).trim();
      updates.salesRate = cleanRate;
      updates.rate = cleanRate;
      updates['Overall / Receipt Freight Rate'] = cleanRate;
    }
    if (salesPerson !== undefined) {
      updates.salesPerson = String(salesPerson).trim();
    }
    if (salesPersonUsername !== undefined) {
      updates.salesPersonUsername = String(salesPersonUsername).trim();
    }
    if (remarks !== undefined) {
      updates.salesRemarks = String(remarks).trim();
    }
    if (salesStatus !== undefined && ['Normal', 'Available to Deliver', 'Hold'].includes(salesStatus)) {
      updates.salesStatus = salesStatus;
      updates.holdUpdatedAt = new Date();
      updates.holdUpdatedBy = currentUser.username;
      if (salesStatus === 'Hold') {
        updates.holdReason = holdReason ? String(holdReason).trim() : 'Placed on Hold by Sales Head';
      } else {
        updates.holdReason = '';
      }
    }

    // Handle Discrepancy Flag ("Data Entry Wrong")
    let discrepancyCreated = false;
    if (discrepancyRequest && typeof discrepancyRequest === 'object') {
      const discPayload = {
        hasDiscrepancy: true,
        actualCbm: discrepancyRequest.actualCbm || '',
        actualWeight: discrepancyRequest.actualWeight || '',
        actualCtn: discrepancyRequest.actualCtn !== undefined ? Number(discrepancyRequest.actualCtn) : whDoc.quantity,
        remarks: discrepancyRequest.remarks || 'Flagged as incorrect by sales team',
        reportedBy: currentUser.username,
        reportedAt: new Date(),
        status: 'Pending',
      };
      updates.salesDiscrepancy = discPayload;
      discrepancyCreated = true;

      // 1. Create High-Priority DailyTask for Warehouse Keeper & Admin
      try {
        await DailyTask.create({
          title: `[DATA ENTRY WRONG] Receipt ${cleanReceipt}`,
          description: `Discrepancy flagged by ${currentUser.name || currentUser.username} (${currentUser.role}). Warehouse Entry: CBM ${whDoc.volume}, Wt ${whDoc.weight}, CTN ${whDoc.quantity}. Claimed Actual: CBM ${discPayload.actualCbm}, Wt ${discPayload.actualWeight}, CTN ${discPayload.actualCtn}. Reason: ${discPayload.remarks}. Admin approval required to alter master records.`,
          dueDate: new Date(),
          isCompleted: false,
          priority: 'HIGH',
          source: 'COMPLIANCE',
        });
      } catch (taskErr) {
        console.error('Failed to create discrepancy DailyTask:', taskErr);
      }

      // 2. Post alert into SalesMessage two-way chat thread
      try {
        await SalesMessage.create({
          receiptNo: cleanReceipt,
          senderUsername: currentUser.username,
          senderName: currentUser.name || currentUser.username,
          senderRole: currentUser.role,
          recipientUsername: 'all',
          message: `⚠️ [Data Entry Discrepancy Reported] Act CBM: ${discPayload.actualCbm || 'N/A'}, Act Wt: ${discPayload.actualWeight || 'N/A'}, Act CTN: ${discPayload.actualCtn || 'N/A'}. Note: ${discPayload.remarks}`,
          type: 'discrepancy',
          metadata: discPayload,
        });
      } catch (msgErr) {
        console.error('Failed to log discrepancy chat message:', msgErr);
      }
    }

    // Apply updates to WarehouseReceipt
    await WarehouseReceipt.updateOne({ _id: whDoc._id }, { $set: updates });

    // Also synchronize to mapped Shipment(s)
    await Shipment.updateMany(
      { receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { $set: updates }
    );

    // Record audit log
    await recordEditLog(req, {
      username: currentUser.username,
      role: currentUser.role,
      action: 'UPDATE',
      entityType: 'WarehouseReceipt',
      entityId: cleanReceipt,
      description: `Sales update on Receipt ${cleanReceipt}: Rate=${updates.salesRate || 'unchanged'}, Status=${updates.salesStatus || 'unchanged'}, Person=${updates.salesPerson || 'unchanged'}, Discrepancy=${discrepancyCreated ? 'Flagged' : 'None'}`,
      details: updates,
    });

    return NextResponse.json({
      success: true,
      message: discrepancyCreated
        ? 'Discrepancy request submitted for Admin verification and sales data updated successfully.'
        : 'Sales data updated successfully.',
      updates,
    });
  } catch (error: any) {
    console.error('Error updating sales receipt:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
