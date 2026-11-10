import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking, { IReceiptEntry } from '@/models/ReceiptTracking';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { resolveLiveReceiptsForTrackingDoc, calculateRemainDays } from '@/lib/liveTrackingResolver';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET all tracking records for admin (resolved 100% LIVE against DB)
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const trackingDocs = await ReceiptTracking.find({}).sort({ updatedAt: -1 }).lean();

    const flattened = [];
    for (const doc of trackingDocs) {
      const liveList = await resolveLiveReceiptsForTrackingDoc(doc, { includeAdminFields: true });
      for (const r of liveList) {
        flattened.push({
          ...r,
          trackingToken: doc.token,
          trackingName: doc.name,
          docId: doc._id.toString()
        });
      }
    }

    // Also collect list of unique tracking tokens for linking dropdown
    const tokenList = trackingDocs.map((doc: any) => ({
      token: doc.token,
      name: doc.name,
      receipts: (doc.receipts || []).map((r: any) => r.receiptNo)
    }));

    return NextResponse.json(
      {
        success: true,
        receipts: flattened,
        tokens: tokenList
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store'
        }
      }
    );
  } catch (error: any) {
    console.error('Error fetching admin tracking links:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch receipts' },
      { status: 500 }
    );
  }
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const linkName = String(body.trackingName || body.marka || body.name || '').trim();
      if (!linkName) {
        return NextResponse.json({ success: false, message: 'Allocated Link Name is required.' }, { status: 400 });
      }

      // Check duplicate Allocated Link Name (case-insensitive exact match)
      const existingDoc = await ReceiptTracking.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(linkName)}$`, 'i') }
      }).lean();

      if (existingDoc) {
        return NextResponse.json({
          success: false,
          duplicate: true,
          message: `An Allocated Link named "${linkName}" already exists (token: ${existingDoc.token}). Allocated Link Name cannot be duplicate.`
        }, { status: 400 });
      }

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
          warehouse: String(it.warehouse || '').trim(),
          warehouseReceiptId: String(it.warehouseReceiptId || it.receiptId || '').trim(),
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
        warehouse: String(body.warehouse || '').trim(),
        warehouseReceiptId: String(body.warehouseReceiptId || body.receiptId || '').trim(),
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

    // Resolve warehouse codes and warehouseReceiptIds for entries if missing
    for (const entry of entriesToAdd) {
      if (!entry.warehouse || !entry.warehouseReceiptId) {
        const entryRegex = new RegExp(`^${escapeRegex(entry.receiptNo)}$`, 'i');
        const whItems: any[] = await WarehouseReceipt.find({ receipt: entryRegex }).lean();
        if (whItems.length > 0) {
          const entryCtnNum = parseFloat(String(entry.ctn || '0'));
          let matchedWh = whItems.find((w: any) => (parseFloat(String(w.quantity || '0')) || 0) === entryCtnNum);
          if (!matchedWh && whItems.length === 1) matchedWh = whItems[0];
          if (matchedWh) {
            if (!entry.warehouse) entry.warehouse = (matchedWh.warehouse || 'CHINA').toUpperCase().trim();
            if (!entry.warehouseReceiptId) entry.warehouseReceiptId = String(matchedWh._id);
            if (!entry.ctn && matchedWh.quantity) entry.ctn = String(matchedWh.quantity);
          }
        } else {
          const shipments: any[] = await Shipment.find({ receipt: entryRegex }).lean();
          if (shipments.length > 0) {
            if (!entry.warehouse) entry.warehouse = (shipments[0].warehouse || 'CHINA').toUpperCase().trim();
            if (shipments[0].receiptId && !entry.warehouseReceiptId) {
              entry.warehouseReceiptId = String(shipments[0].receiptId);
            }
          }
        }
      }
    }

    // Deduplicate entriesToAdd: if multiple rows represent the same receipt in the same warehouse, keep one
    const uniqueEntriesMap = new Map<string, IReceiptEntry>();
    for (const entry of entriesToAdd) {
      const uKey = `${entry.receiptNo.toLowerCase()}_${(entry.warehouse || '').toUpperCase()}`;
      if (!uniqueEntriesMap.has(uKey)) {
        uniqueEntriesMap.set(uKey, entry);
      }
    }
    entriesToAdd = Array.from(uniqueEntriesMap.values());

    // Check if any receipt is already linked to ANY public tracking link in the same warehouse
    if (!body.force) {
      const receiptNos = entriesToAdd.map(e => e.receiptNo);
      const allLinkedDocs: any[] = await ReceiptTracking.find({
        'receipts.receiptNo': { $in: receiptNos }
      }).lean();

      for (const entry of entriesToAdd) {
        const eWh = (entry.warehouse || '').toUpperCase().trim();

        for (const linkDoc of allLinkedDocs) {
          const match = (linkDoc.receipts || []).find((r: any) => {
            if (!r.receiptNo || r.receiptNo.trim().toLowerCase() !== entry.receiptNo.trim().toLowerCase()) return false;
            
            // 1. Exact warehouse receipt ID match
            if (entry.warehouseReceiptId && r.warehouseReceiptId) {
              return String(entry.warehouseReceiptId) === String(r.warehouseReceiptId);
            }

            const rWh = (r.warehouse || '').toUpperCase().trim();

            // 2. Both warehouses known:
            // Different China warehouses (e.g. GZ vs YW) -> different receipts, NOT a duplicate!
            if (eWh && rWh) {
              return eWh === rWh;
            }

            // 3. Fallback comparison by carton count if warehouse was undefined
            if (entry.ctn && r.ctn) {
              return String(entry.ctn).trim() === String(r.ctn).trim();
            }

            if (!eWh && !rWh) return true;
            return false;
          });

          if (match) {
            const originUrl = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://eta-usi.vercel.app';
            const detailsUrl = `${originUrl}/track/${linkDoc.token}`;
            const whLabel = entry.warehouse ? ` (${entry.warehouse} Warehouse)` : '';

            if (linkDoc.token === token) {
              return NextResponse.json({
                success: false,
                message: `Receipt #${entry.receiptNo}${whLabel} is already present in this tracking link. Find details here: ${detailsUrl}`,
                alreadyLinked: true,
                linkName: linkDoc.name || 'Current Tracking Link',
                linkToken: linkDoc.token,
                linkUrl: detailsUrl
              }, { status: 400 });
            } else {
              return NextResponse.json({
                success: false,
                message: `Receipt #${entry.receiptNo}${whLabel} cannot be linked again because it is already linked to public tracking link "${linkDoc.name || linkDoc.token}". Find details here: ${detailsUrl}`,
                alreadyLinked: true,
                linkName: linkDoc.name || linkDoc.token,
                linkToken: linkDoc.token,
                linkUrl: detailsUrl
              }, { status: 400 });
            }
          }
        }
      }
    }

    // Find if tracking doc exists for this token
    let trackingDoc = await ReceiptTracking.findOne({ token });

    if (trackingDoc) {
      // Append to existing link (Same link given to customer)
      trackingDoc.receipts.push(...entriesToAdd);
      if (trackingName && trackingName.trim()) {
        const cleanName = trackingName.trim();
        if (cleanName.toLowerCase() !== (trackingDoc.name || '').toLowerCase()) {
          // Check if ANOTHER link already has this name
          const duplicateDoc = await ReceiptTracking.findOne({
            token: { $ne: token },
            name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') }
          }).lean();
          if (duplicateDoc) {
            return NextResponse.json({
              success: false,
              duplicate: true,
              message: `An Allocated Link named "${cleanName}" already exists (token: ${duplicateDoc.token}). Allocated Link Name cannot be duplicate.`
            }, { status: 400 });
          }
        }
        trackingDoc.name = cleanName;
      }
      trackingDoc.updatedAt = new Date();
      await trackingDoc.save();
    } else {
      // Create new tracking doc
      const cleanName = (trackingName || '').trim();
      if (cleanName) {
        const duplicateDoc = await ReceiptTracking.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') }
        }).lean();
        if (duplicateDoc) {
          return NextResponse.json({
            success: false,
            duplicate: true,
            message: `An Allocated Link named "${cleanName}" already exists (token: ${duplicateDoc.token}). Allocated Link Name cannot be duplicate. Please use "Map to Existing Link" or enter a unique name.`
          }, { status: 400 });
        }
      }

      trackingDoc = await ReceiptTracking.create({
        token,
        name: cleanName,
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

    const cleanName = (name || '').trim();
    if (!cleanName) {
      return NextResponse.json({ success: false, message: 'Allocated Link Name cannot be empty.' }, { status: 400 });
    }

    // Check if ANOTHER link doc already uses this allocated name
    const duplicateDoc = await ReceiptTracking.findOne({
      token: { $ne: token },
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') }
    }).lean();

    if (duplicateDoc) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        message: `An Allocated Link named "${cleanName}" already exists (token: ${duplicateDoc.token}). Allocated Link Name cannot be duplicate.`
      }, { status: 400 });
    }

    doc.name = cleanName;
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

// DELETE: Bulk de-link receipts or delete tracking links (Never deletes underlying DB records)
export async function DELETE(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    // Case 1: Bulk de-link receipts by IDs: { receiptIds: string[] }
    if (Array.isArray(body.receiptIds) && body.receiptIds.length > 0) {
      const rawIds = body.receiptIds.map(String);
      const baseIds = rawIds.map((id: string) => id.split('_ship_')[0].split('_wh_')[0]);
      const allTargetIds = new Set([...rawIds, ...baseIds]);

      const docs = await ReceiptTracking.find({
        $or: [
          { 'receipts.id': { $in: Array.from(allTargetIds) } },
          { 'receipts.receiptNo': { $in: Array.from(allTargetIds) } }
        ]
      });

      let unlinkedCount = 0;

      for (const doc of docs) {
        const initialLen = doc.receipts.length;
        doc.receipts = doc.receipts.filter(
          (r: any) => !allTargetIds.has(String(r.id)) && !allTargetIds.has(String(r.receiptNo))
        );
        unlinkedCount += (initialLen - doc.receipts.length);

        // Keep the allocated link alive even if empty so customer's URL remains valid
        doc.updatedAt = new Date();
        await doc.save();
      }

      return NextResponse.json({
        success: true,
        message: `Successfully de-linked ${unlinkedCount} receipt(s) from tracking links. (Database records remain intact)`,
        deletedCount: unlinkedCount
      });
    }

    // Case 2: Bulk delete tracking links: { tokens: string[], deleteReceipts?: boolean }
    if (Array.isArray(body.tokens) && body.tokens.length > 0) {
      const tokensToDelete = body.tokens.map(String);
      const result = await ReceiptTracking.deleteMany({ token: { $in: tokensToDelete } });
      return NextResponse.json({
        success: true,
        message: `Successfully removed ${result.deletedCount} Allocated Link(s). (Underlying cargo & receipts safe)`,
        deletedCount: result.deletedCount
      });
    }

    // Case 3: Single tracking link delete: { token: string }
    if (body.token) {
      const result = await ReceiptTracking.deleteOne({ token: String(body.token).trim() });
      return NextResponse.json({
        success: true,
        message: 'Allocated Link removed successfully. (Underlying cargo & receipts safe)',
        deletedCount: result.deletedCount
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid delete parameters' }, { status: 400 });
  } catch (error: any) {
    console.error('Error during deletion:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to delete' },
      { status: 500 }
    );
  }
}
