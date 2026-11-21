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

// GET: Fetch sales records on-demand (NO EAGER LOADING)
export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);
  const isSalesPersonOnly = currentUser.role === 'sales_person';

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'warehouse_date'; // 'warehouse_date' | 'container'
    const warehouse = searchParams.get('warehouse')?.trim();
    const date = searchParams.get('date')?.trim();
    const container = searchParams.get('container')?.trim();
    const salesPersonFilter = searchParams.get('salesPerson')?.trim();

    // NO PRELOADING: If criteria not specified, return empty list
    if (mode === 'warehouse_date' && (!warehouse || !date)) {
      return NextResponse.json({
        success: true,
        receipts: [],
        total: 0,
        message: 'No data preloaded. Please select a Warehouse and Date to load receipts.',
      });
    }

    if (mode === 'container' && !container) {
      return NextResponse.json({
        success: true,
        receipts: [],
        total: 0,
        message: 'No data preloaded. Please select a Loading Plan / Container to load cargo items.',
      });
    }

    let rawReceipts: any[] = [];
    let containerInfoMap: Map<string, { container: string; containerNumber?: string; loadingDate?: string }> = new Map();

    if (mode === 'container') {
      // 1. Fetch shipments inside selected container
      const containerRegex = new RegExp(`^${container!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const shipments = await Shipment.find({
        $or: [
          { container: containerRegex },
          { containerNumber: containerRegex },
        ],
      }).lean();

      const receiptNumbers = shipments.map((s: any) => s.receipt).filter(Boolean);
      const whReceipts = await WarehouseReceipt.find({
        receipt: { $in: receiptNumbers },
      }).lean();

      const whMap = new Map<string, any>();
      whReceipts.forEach((r: any) => whMap.set(r.receipt, r));

      // Container metadata from container collection
      const containerDoc = await Container.findOne({
        $or: [{ container: containerRegex }, { containerNumber: containerRegex }],
      }).lean();

      rawReceipts = shipments.map((s: any) => {
        const wh = whMap.get(s.receipt) || {};
        return {
          _id: s._id,
          receipt: s.receipt,
          date: s.date || wh.date || '',
          warehouse: s.warehouse || wh.warehouse || '',
          container: s.container || container,
          containerNumber: s.containerNumber || (containerDoc ? (containerDoc as any).containerNumber : ''),
          loadingDate: s.loadingDate || (containerDoc ? (containerDoc as any).loadingDate : ''),
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
          salesRemarks: s.salesRemarks || wh.salesRemarks || s.remarks || wh.remarks || '',
          salesStatus: s.salesStatus || wh.salesStatus || 'Normal',
          holdReason: s.holdReason || wh.holdReason || '',
          salesDiscrepancy: s.salesDiscrepancy || wh.salesDiscrepancy || null,
          party: s.party || wh.party || '',
        };
      });
    } else {
      // mode === 'warehouse_date'
      const query: Record<string, any> = {};
      if (warehouse && warehouse !== 'ALL') {
        query.warehouse = new RegExp(`^${warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      }
      if (date) {
        query.date = date;
      }

      const receipts = await WarehouseReceipt.find(query)
        .sort({ receipt: 1 })
        .lean();

      // Find mapped container/shipment for these receipts
      const receiptNums = receipts.map((r: any) => r.receipt).filter(Boolean);
      const mappedShipments = await Shipment.find({
        receipt: { $in: receiptNums },
      }).select('receipt container containerNumber loadingDate salesRate salesPerson salesRemarks salesStatus holdReason salesDiscrepancy').lean();

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
          salesRemarks: r.salesRemarks || r.remarks || '',
          salesStatus: r.salesStatus || 'Normal',
          holdReason: r.holdReason || '',
          salesDiscrepancy: r.salesDiscrepancy || null,
          party: r.party || '',
        };
      });
    }

    // Role-based filtering for sales_person
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
      warehouse: warehouse || '',
      date: date || '',
      container: container || '',
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
      // append/set remarks
      if (!whDoc.remarks) {
        updates.remarks = String(remarks).trim();
      }
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
    await recordEditLog({
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
