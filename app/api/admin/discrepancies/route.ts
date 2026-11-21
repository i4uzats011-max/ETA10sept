import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import DailyTask from '@/models/DailyTask';
import SalesMessage from '@/models/SalesMessage';
import { isAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

// GET: Admin views all discrepancy requests flagged by sales head/team
export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'Pending'; // 'Pending' | 'Approved' | 'Rejected' | 'All'

    const query: Record<string, any> = {
      'salesDiscrepancy.hasDiscrepancy': true,
    };

    if (status !== 'All') {
      query['salesDiscrepancy.status'] = status;
    }

    const receipts = await WarehouseReceipt.find(query)
      .select('receipt warehouse date volume weight quantity commodity mainMarka salesDiscrepancy salesPerson salesRemarks')
      .sort({ 'salesDiscrepancy.reportedAt': -1 })
      .lean();

    return NextResponse.json({
      success: true,
      discrepancies: receipts,
      total: receipts.length,
    });
  } catch (error: any) {
    console.error('Error fetching discrepancies:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// PATCH: Admin approves or rejects discrepancy request
// ONLY Admin can modify the actual CBM, Weight, or CTN in the database!
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized. Only Admin can alter warehouse database records.' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { receipt, action, adminNotes } = body; // action: 'APPROVE' | 'REJECT'

    if (!receipt || !action || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'Receipt and valid action (APPROVE/REJECT) are required.' }, { status: 400 });
    }

    const cleanReceipt = receipt.trim();
    const receiptDoc = await WarehouseReceipt.findOne({
      receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!receiptDoc) {
      return NextResponse.json({ error: `Receipt ${receipt} not found.` }, { status: 404 });
    }

    const disc = receiptDoc.salesDiscrepancy;
    if (!disc || !disc.hasDiscrepancy) {
      return NextResponse.json({ error: 'No discrepancy request exists for this receipt.' }, { status: 400 });
    }

    if (action === 'APPROVE') {
      // Admin alters core warehouse data according to verified actuals
      const oldValues = {
        volume: receiptDoc.volume,
        weight: receiptDoc.weight,
        quantity: receiptDoc.quantity,
      };

      const newVolume = disc.actualCbm !== undefined && disc.actualCbm !== '' ? String(disc.actualCbm) : receiptDoc.volume;
      const newWeight = disc.actualWeight !== undefined && disc.actualWeight !== '' ? String(disc.actualWeight) : receiptDoc.weight;
      const newQty = disc.actualCtn !== undefined && disc.actualCtn !== '' ? Number(disc.actualCtn) : receiptDoc.quantity;

      // Update WarehouseReceipt core fields
      receiptDoc.volume = newVolume;
      receiptDoc.weight = newWeight;
      receiptDoc.quantity = newQty;
      receiptDoc.salesDiscrepancy.status = 'Approved';
      receiptDoc.salesDiscrepancy.adminNotes = adminNotes || 'Approved by Admin';
      receiptDoc.salesDiscrepancy.resolvedAt = new Date();
      receiptDoc.salesDiscrepancy.resolvedBy = currentUser.username;
      await receiptDoc.save();

      // Synchronize to mapped shipments
      await Shipment.updateMany(
        { receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        {
          $set: {
            volume: newVolume,
            weight: newWeight,
            quantity: String(newQty),
            'salesDiscrepancy.status': 'Approved',
            'salesDiscrepancy.adminNotes': adminNotes || 'Approved by Admin',
            'salesDiscrepancy.resolvedAt': new Date(),
            'salesDiscrepancy.resolvedBy': currentUser.username,
          },
        }
      );

      // Complete any associated DailyTask
      await DailyTask.updateMany(
        {
          title: new RegExp(`Receipt ${cleanReceipt}`, 'i'),
          source: 'COMPLIANCE',
          isCompleted: false,
        },
        {
          $set: {
            isCompleted: true,
            completedAt: new Date(),
          },
        }
      );

      // Post confirmation into SalesMessage chat thread
      await SalesMessage.create({
        receiptNo: cleanReceipt,
        senderUsername: currentUser.username,
        senderName: currentUser.name || 'Admin',
        senderRole: 'admin',
        recipientUsername: 'all',
        message: `✅ [Discrepancy Approved by Admin] Master cargo records updated: CBM changed from ${oldValues.volume} to ${newVolume}, Weight from ${oldValues.weight} to ${newWeight}, CTN from ${oldValues.quantity} to ${newQty}.`,
        type: 'text',
      });

      // Record audit log
      await recordEditLog({
        username: currentUser.username,
        role: currentUser.role,
        action: 'UPDATE',
        entityType: 'WarehouseReceipt',
        entityId: cleanReceipt,
        description: `Admin approved data entry correction on Receipt ${cleanReceipt}. Updated Volume: ${oldValues.volume} -> ${newVolume}, Weight: ${oldValues.weight} -> ${newWeight}, Quantity: ${oldValues.quantity} -> ${newQty}`,
        details: { oldValues, newValues: { volume: newVolume, weight: newWeight, quantity: newQty }, adminNotes },
      });

      return NextResponse.json({
        success: true,
        message: `Discrepancy approved. Warehouse database records for Receipt ${cleanReceipt} have been altered by Admin.`,
      });
    } else {
      // REJECT action
      receiptDoc.salesDiscrepancy.status = 'Rejected';
      receiptDoc.salesDiscrepancy.adminNotes = adminNotes || 'Rejected after verification in warehouse';
      receiptDoc.salesDiscrepancy.resolvedAt = new Date();
      receiptDoc.salesDiscrepancy.resolvedBy = currentUser.username;
      await receiptDoc.save();

      await Shipment.updateMany(
        { receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        {
          $set: {
            'salesDiscrepancy.status': 'Rejected',
            'salesDiscrepancy.adminNotes': adminNotes || 'Rejected after verification in warehouse',
            'salesDiscrepancy.resolvedAt': new Date(),
            'salesDiscrepancy.resolvedBy': currentUser.username,
          },
        }
      );

      // Complete DailyTask with rejected note
      await DailyTask.updateMany(
        {
          title: new RegExp(`Receipt ${cleanReceipt}`, 'i'),
          source: 'COMPLIANCE',
          isCompleted: false,
        },
        {
          $set: {
            isCompleted: true,
            completedAt: new Date(),
          },
        }
      );

      await SalesMessage.create({
        receiptNo: cleanReceipt,
        senderUsername: currentUser.username,
        senderName: currentUser.name || 'Admin',
        senderRole: 'admin',
        recipientUsername: 'all',
        message: `❌ [Discrepancy Request Rejected by Admin] Note: ${adminNotes || 'Original warehouse measurement re-verified and found correct.'}`,
        type: 'text',
      });

      return NextResponse.json({
        success: true,
        message: `Discrepancy request for Receipt ${cleanReceipt} was rejected. Original warehouse data preserved.`,
      });
    }
  } catch (error: any) {
    console.error('Error reviewing discrepancy:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
