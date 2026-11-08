import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking, { IReceiptEntry } from '@/models/ReceiptTracking';

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

// GET all tracking records for admin
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const trackingDocs = await ReceiptTracking.find({}).sort({ updatedAt: -1 }).lean();

    const flattened = trackingDocs.flatMap((doc: any) => {
      return (doc.receipts || []).map((r: any) => ({
        ...r,
        trackingToken: doc.token,
        trackingName: doc.name,
        docId: doc._id.toString(),
        remainDays: calculateRemainDays(r.eta)
      }));
    });

    // Also collect list of unique tracking tokens for linking dropdown
    const tokenList = trackingDocs.map((doc: any) => ({
      token: doc.token,
      name: doc.name,
      receipts: (doc.receipts || []).map((r: any) => r.receiptNo)
    }));

    return NextResponse.json({
      success: true,
      receipts: flattened,
      tokens: tokenList
    });
  } catch (error: any) {
    console.error('Error fetching admin tracking links:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch receipts' },
      { status: 500 }
    );
  }
}

// POST create receipt(s) or attach to existing link (supports single or multiple items)
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const {
      trackingTokenOption, // 'new' or 'existing'
      existingToken,
      trackingName
    } = body;

    // Determine tracking token
    let token = '';
    if (trackingTokenOption === 'existing' && existingToken && existingToken.trim()) {
      token = existingToken.trim();
    } else {
      token = 'trk_' + crypto.randomBytes(6).toString('hex');
    }

    // Support generating a new link in advance (empty/unlinked)
    if (body.action === 'generate_link') {
      const linkName = String(body.trackingName || body.marka || body.name || 'New Link').trim();
      const generatedToken = 'trk_' + crypto.randomBytes(6).toString('hex');
      const newDoc = await ReceiptTracking.create({
        token: generatedToken,
        name: linkName,
        receipts: []
      });
      return NextResponse.json({
        success: true,
        message: `Tracking link "${linkName}" generated successfully.`,
        token: newDoc.token,
        name: newDoc.name
      });
    }

    let entriesToAdd: IReceiptEntry[] = [];

    // Support 1: Multiple items provided
    if (Array.isArray(body.items) && body.items.length > 0) {
      entriesToAdd = body.items.map((it: any, i: number) => {
        const rNo = String(it.receiptNo || it.receipt || '').trim();
        const etaVal = it.eta ? String(it.eta).trim() : (it.destinationDate ? String(it.destinationDate).trim() : '');
        const markaVal = String(it.marka || it.mainMarka || it.subMarka || trackingName || '').trim();
        return {
          id: 'rec_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000),
          receiptNo: rNo,
          marka: markaVal,
          itemName: String(it.itemName || it.english || it.commodity || '').trim(),
          cbm: String(it.cbm || it.volume || '').trim(),
          ctn: String(it.ctn || it.quantity || '').trim(),
          weight: String(it.weight || '').trim(),
          containerNo: String(it.containerNo || it.container || '').trim(), // Container No. (not actual)
          actualContainerNo: String(it.actualContainerNo || it.containerNumber || '').trim(),
          eta: etaVal,
          status: String(it.status || 'In Transit').trim(),
          adminNotes: String(it.adminNotes || '').trim(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }).filter((e: IReceiptEntry) => Boolean(e.receiptNo));
    } 
    // Support 2: Single item provided
    else if (body.receiptNo && body.receiptNo.trim()) {
      entriesToAdd.push({
        id: 'rec_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        receiptNo: body.receiptNo.trim(),
        marka: String(body.marka || trackingName || '').trim(),
        itemName: (body.itemName || '').trim(),
        cbm: (body.cbm || '').trim(),
        ctn: (body.ctn || '').trim(),
        weight: (body.weight || '').trim(),
        containerNo: (body.containerNo || '').trim(), // Container No. (not actual)
        actualContainerNo: (body.actualContainerNo || '').trim(),
        eta: body.eta ? body.eta.trim() : '',
        status: String(body.status || 'In Transit').trim(),
        adminNotes: (body.adminNotes || '').trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (entriesToAdd.length === 0) {
      return NextResponse.json({ success: false, message: 'At least one valid receipt is required.' }, { status: 400 });
    }

    // Find if tracking doc exists for this token
    let trackingDoc = await ReceiptTracking.findOne({ token });

    if (trackingDoc) {
      // Append to existing link (Same link given to customer)
      trackingDoc.receipts.push(...entriesToAdd);
      if (trackingName && trackingName.trim()) {
        trackingDoc.name = trackingName.trim();
      }
      trackingDoc.updatedAt = new Date();
      await trackingDoc.save();
    } else {
      // Create new tracking doc
      trackingDoc = await ReceiptTracking.create({
        token,
        name: (trackingName || '').trim(),
        receipts: entriesToAdd
      });
    }

    return NextResponse.json({
      success: true,
      message: `${entriesToAdd.length} receipt(s) saved to tracking link.`,
      trackingToken: token,
      count: entriesToAdd.length,
      receipts: entriesToAdd.map(e => ({
        ...e,
        trackingToken: token,
        remainDays: calculateRemainDays(e.eta)
      }))
    });
  } catch (error: any) {
    console.error('Error adding tracking receipt:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to save receipt' },
      { status: 500 }
    );
  }
}

// PATCH: Rename Allocated Link Name
export async function PATCH(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { token, name } = body;

    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    const doc = await ReceiptTracking.findOne({ token });
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found' }, { status: 404 });
    }

    doc.name = (name || '').trim();
    doc.updatedAt = new Date();
    await doc.save();

    return NextResponse.json({
      success: true,
      message: 'Allocated Link Name updated successfully',
      token: doc.token,
      name: doc.name
    });
  } catch (error: any) {
    console.error('Error updating link name:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to update link name' },
      { status: 500 }
    );
  }
}

// DELETE: Bulk delete receipts or bulk delete tracking links
export async function DELETE(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    // Case 1: Bulk delete receipts by IDs: { receiptIds: string[] }
    if (Array.isArray(body.receiptIds) && body.receiptIds.length > 0) {
      const idsToDelete = new Set(body.receiptIds.map(String));
      const docs = await ReceiptTracking.find({ 'receipts.id': { $in: Array.from(idsToDelete) } });
      let deletedCount = 0;

      for (const doc of docs) {
        const initialLen = doc.receipts.length;
        doc.receipts = doc.receipts.filter((r: any) => !idsToDelete.has(String(r.id)));
        deletedCount += (initialLen - doc.receipts.length);

        if (doc.receipts.length === 0) {
          await ReceiptTracking.findByIdAndDelete(doc._id);
        } else {
          doc.updatedAt = new Date();
          await doc.save();
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${deletedCount} receipt(s).`,
        deletedCount
      });
    }

    // Case 2: Bulk delete tracking links: { tokens: string[], deleteReceipts?: boolean }
    if (Array.isArray(body.tokens) && body.tokens.length > 0) {
      const tokensToDelete = body.tokens.map(String);
      const result = await ReceiptTracking.deleteMany({ token: { $in: tokensToDelete } });
      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} Allocated Link(s).`,
        deletedCount: result.deletedCount
      });
    }

    // Case 3: Single tracking link delete: { token: string }
    if (body.token) {
      const result = await ReceiptTracking.deleteOne({ token: String(body.token).trim() });
      return NextResponse.json({
        success: true,
        message: 'Allocated Link deleted successfully.',
        deletedCount: result.deletedCount
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid delete parameters' }, { status: 400 });
  } catch (error: any) {
    console.error('Error during bulk deletion:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to delete' },
      { status: 500 }
    );
  }
}
