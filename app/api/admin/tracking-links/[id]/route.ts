import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';

export const dynamic = 'force-dynamic';

function calculateRemainDays(etaString?: string): number | null {
  if (!etaString) return null;
  const etaDate = new Date(etaString);
  if (isNaN(etaDate.getTime())) return null;

  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = etaStart.getTime() - nowStart.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

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

    const doc = await ReceiptTracking.findOne({ 'receipts.id': id });
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Receipt not found' }, { status: 404 });
    }

    const receiptIndex = doc.receipts.findIndex((r: any) => r.id === id);
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
      doc.name = trackingName.trim();
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

// DELETE: Delete a receipt from tracking link
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    const id = params.id;

    const doc = await ReceiptTracking.findOne({ 'receipts.id': id });
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Receipt not found' }, { status: 404 });
    }

    doc.receipts = doc.receipts.filter((r: any) => r.id !== id);

    if (doc.receipts.length === 0) {
      await ReceiptTracking.findByIdAndDelete(doc._id);
    } else {
      doc.updatedAt = new Date();
      await doc.save();
    }

    return NextResponse.json({ success: true, message: 'Receipt deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting receipt:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to delete receipt' },
      { status: 500 }
    );
  }
}
