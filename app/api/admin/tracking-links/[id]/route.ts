import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import { calculateRemainDays } from '@/lib/liveTrackingResolver';

export const dynamic = 'force-dynamic';

// PUT: Update receipt details & ETA
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    const id = params.id;
    const body = await req.json();

    const {
      receiptNo,
      marka,
      itemName,
      cbm,
      ctn,
      weight,
      containerNo,
      actualContainerNo,
      eta,
      status,
      adminNotes,
      trackingName
    } = body;

    const baseId = id.split('_ship_')[0].split('_wh_')[0];
    const doc = await ReceiptTracking.findOne({
      $or: [
        { 'receipts.id': id },
        { 'receipts.id': baseId },
        { 'receipts.receiptNo': id },
        { 'receipts.receiptNo': baseId }
      ]
    });

    if (!doc) {
      return NextResponse.json({ success: false, message: 'Receipt not found' }, { status: 404 });
    }

    const receiptIndex = doc.receipts.findIndex(
      (r: any) => r.id === id || r.id === baseId || r.receiptNo === id || r.receiptNo === baseId
    );
    if (receiptIndex === -1) {
      return NextResponse.json({ success: false, message: 'Receipt not found' }, { status: 404 });
    }

    const current = doc.receipts[receiptIndex];

    const effectiveStatus = status !== undefined ? status.trim() : (current.status || 'In Transit');
    const isNowDelivered = effectiveStatus.toLowerCase().includes('deliver') || effectiveStatus.toLowerCase().includes('arrived');
    const newDeliveryDate = body.deliveryDate !== undefined ? String(body.deliveryDate).trim() : (current.deliveryDate || (isNowDelivered ? new Date().toISOString().slice(0, 10) : ''));
    const newMarkedDate = body.markedDate !== undefined ? String(body.markedDate).trim() : (current.markedDate || (isNowDelivered ? new Date().toISOString().slice(0, 10) : ''));

    doc.receipts[receiptIndex] = {
      ...current,
      receiptNo: receiptNo !== undefined ? receiptNo.trim() : current.receiptNo,
      warehouse: body.warehouse !== undefined ? String(body.warehouse).trim() : current.warehouse,
      warehouseReceiptId: body.warehouseReceiptId !== undefined ? String(body.warehouseReceiptId).trim() : current.warehouseReceiptId,
      marka: marka !== undefined ? marka.trim() : (current.marka || doc.name || ''),
      itemName: itemName !== undefined ? itemName.trim() : current.itemName,
      cbm: cbm !== undefined ? cbm.trim() : current.cbm,
      ctn: ctn !== undefined ? ctn.trim() : current.ctn,
      weight: weight !== undefined ? weight.trim() : current.weight,
      containerNo: containerNo !== undefined ? containerNo.trim() : current.containerNo,
      actualContainerNo: actualContainerNo !== undefined ? actualContainerNo.trim() : current.actualContainerNo,
      eta: eta !== undefined ? eta.trim() : current.eta,
      deliveryDate: newDeliveryDate,
      markedDate: newMarkedDate,
      status: effectiveStatus,
      adminNotes: adminNotes !== undefined ? adminNotes.trim() : current.adminNotes,
      updatedAt: new Date()
    };

    if (trackingName !== undefined && trackingName.trim()) {
      const cleanName = trackingName.trim();
      if (cleanName.toLowerCase() !== (doc.name || '').toLowerCase()) {
        const duplicateDoc = await ReceiptTracking.findOne({
          token: { $ne: doc.token },
          name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean();
        if (duplicateDoc) {
          return NextResponse.json({
            success: false,
            duplicate: true,
            message: `An Allocated Link named "${cleanName}" already exists (token: ${duplicateDoc.token}). Allocated Link Name cannot be duplicate.`
          }, { status: 400 });
        }
      }
      doc.name = cleanName;
    }

    doc.updatedAt = new Date();
    await doc.save();

    return NextResponse.json({
      success: true,
      message: 'Receipt and ETA updated successfully.',
      receipt: {
        ...doc.receipts[receiptIndex],
        trackingToken: doc.token,
        remainDays: calculateRemainDays(doc.receipts[receiptIndex].eta)
      }
    });
  } catch (error: any) {
    console.error('Error updating receipt:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to update receipt' },
      { status: 500 }
    );
  }
}

// DELETE: De-link a receipt from tracking link (Never deletes underlying DB records)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    const id = params.id;

    const baseId = id.split('_ship_')[0].split('_wh_')[0];
    const doc = await ReceiptTracking.findOne({
      $or: [
        { 'receipts.id': id },
        { 'receipts.id': baseId },
        { 'receipts.receiptNo': id },
        { 'receipts.receiptNo': baseId }
      ]
    });

    if (!doc) {
      return NextResponse.json({ success: false, message: 'Receipt not found in tracking links' }, { status: 404 });
    }

    doc.receipts = doc.receipts.filter(
      (r: any) => r.id !== id && r.id !== baseId && r.receiptNo !== id && r.receiptNo !== baseId
    );

    // Keep the tracking document alive so the customer's link URL stays valid
    doc.updatedAt = new Date();
    await doc.save();

    return NextResponse.json({
      success: true,
      message: `Receipt de-linked successfully from tracking link. (Database records remain intact)`
    });
  } catch (error: any) {
    console.error('Error de-linking receipt:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to de-link receipt' },
      { status: 500 }
    );
  }
}
