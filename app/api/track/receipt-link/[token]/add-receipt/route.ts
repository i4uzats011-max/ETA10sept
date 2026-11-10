import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking, { IReceiptEntry } from '@/models/ReceiptTracking';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { calculateRemainDays } from '@/lib/liveTrackingResolver';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeCarton(val: any): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).replace(/[^0-9.]/g, '');
  if (!str) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// POST: Public user self-adds a receipt with verification of Receipt No. and Total CTN Received in Warehouse
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    const body = await req.json();
    const inputReceiptNo = String(body.receiptNo || body.receipt || '').trim();
    const inputCtn = body.ctn !== undefined ? body.ctn : body.quantity;

    if (!inputReceiptNo) {
      return NextResponse.json({ success: false, message: 'Receipt No. is required' }, { status: 400 });
    }
    if (inputCtn === undefined || inputCtn === null || String(inputCtn).trim() === '') {
      return NextResponse.json({
        success: false,
        message: 'Total Received Carton Count (CTN received in warehouse) is required for verification'
      }, { status: 400 });
    }

    const inputCtnNum = normalizeCarton(inputCtn);
    if (inputCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: 'Please enter a valid numeric Carton Count (CTN)'
      }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Verify tracking link exists
    const trackingDoc = await ReceiptTracking.findOne({ token });
    if (!trackingDoc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found or expired' }, { status: 404 });
    }

    // 2. Verified receipt uniqueness checked globally after warehouse & CTN verification

    // 3. Search database for this receipt across China warehouses
    const receiptRegex = new RegExp(`^${inputReceiptNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

    const matchingWhItems: any[] = await WarehouseReceipt.find({ receipt: receiptRegex }).lean();
    const allShipments: any[] = await Shipment.find({ receipt: receiptRegex }).lean();

    let matchedWh: any = null;
    let matchedShipment: any = null;
    let targetWarehouse = "";
    let targetWhId = "";
    let totalWarehouseCtnNum: number | null = null;
    let recordSource = "";

    // If receipt exists in warehouse receipts, find the specific warehouse matching this carton count
    if (matchingWhItems.length > 0) {
      matchedWh = matchingWhItems.find((w: any) => normalizeCarton(w.quantity) === inputCtnNum);
      if (!matchedWh && matchingWhItems.length === 1) {
        matchedWh = matchingWhItems[0];
      }

      if (matchedWh) {
        totalWarehouseCtnNum = normalizeCarton(matchedWh.quantity);
        targetWarehouse = matchedWh.warehouse || "";
        targetWhId = String(matchedWh._id);
        recordSource = "warehouse";

        // Find corresponding shipment for this specific warehouse if loaded
        matchedShipment = allShipments.find((s: any) =>
          (s.receiptId && String(s.receiptId) === targetWhId) ||
          (s.warehouse && targetWarehouse && s.warehouse.toUpperCase().trim() === targetWarehouse.toUpperCase().trim())
        );
      }
    }

    // If not found in warehouse receipts, check shipments grouped by warehouse
    if (!matchedWh && allShipments.length > 0) {
      const shipmentsByWh = new Map<string, any[]>();
      allShipments.forEach((s: any) => {
        const whKey = (s.warehouse || "DEFAULT").toUpperCase().trim();
        if (!shipmentsByWh.has(whKey)) shipmentsByWh.set(whKey, []);
        shipmentsByWh.get(whKey)!.push(s);
      });

      for (const [whKey, sList] of shipmentsByWh.entries()) {
        const sumQty = sList.reduce((acc: number, s: any) => acc + (normalizeCarton(s.quantity) || 0), 0);
        const origQty = normalizeCarton(sList[0]?.originalTotalQuantity);
        if (origQty === inputCtnNum || sumQty === inputCtnNum) {
          matchedShipment = sList[0];
          targetWarehouse = matchedShipment.warehouse || "";
          totalWarehouseCtnNum = origQty !== null && origQty > 0 ? origQty : sumQty;
          recordSource = "shipment";
          break;
        }
      }

      if (!matchedShipment) {
        matchedShipment = allShipments[0];
        targetWarehouse = matchedShipment.warehouse || "";
        const origQty = normalizeCarton(matchedShipment.originalTotalQuantity);
        totalWarehouseCtnNum = origQty !== null && origQty > 0 ? origQty : normalizeCarton(matchedShipment.quantity);
        recordSource = "shipment";
      }
    }

    // Fallback: check existing tracking documents in ReceiptTracking
    if (!matchedWh && !matchedShipment) {
      const existingDoc: any = await ReceiptTracking.findOne({ "receipts.receiptNo": receiptRegex }).lean();
      if (existingDoc && Array.isArray(existingDoc.receipts)) {
        const found = existingDoc.receipts.find(
          (r: any) => r.receiptNo && r.receiptNo.toLowerCase() === inputReceiptNo.toLowerCase()
        );
        if (found) {
          targetWarehouse = found.warehouse || "";
          targetWhId = found.warehouseReceiptId || "";
          totalWarehouseCtnNum = normalizeCarton(found.ctn);
          recordSource = "receipt_tracking";
        }
      }
    }

    if ((!matchedWh && !matchedShipment && recordSource !== "receipt_tracking") || totalWarehouseCtnNum === null) {
      return NextResponse.json({
        success: false,
        message: `Receipt #${inputReceiptNo} was not found in warehouse records. Please check the receipt number on your warehouse slip.`
      }, { status: 404 });
    }

    // 4. Verify CTN matches TOTAL CTN RECEIVED IN WAREHOUSE
    if (totalWarehouseCtnNum !== inputCtnNum) {
      const warehouseHints = matchingWhItems.map((w: any) => `${w.warehouse || "Warehouse"} (${w.quantity} CTN)`).join(", ");
      return NextResponse.json({
        success: false,
        message: matchingWhItems.length > 1
          ? `Receipt #${inputReceiptNo} exists in multiple warehouses: ${warehouseHints}. Carton count (${inputCtn} CTN) does not match. Please enter the exact total cartons received as per your slip.`
          : `Verification failed: Carton count (${inputCtn} CTN) does not match total packages received in warehouse for Receipt #${inputReceiptNo} (${totalWarehouseCtnNum} CTN). Please enter total cartons received as per your slip.`
      }, { status: 400 });
    }

    // 4.5. GLOBAL LINK RESTRICTION: A receipt cannot be added again to ANY public tracking link
    const allLinkedDocs: any[] = await ReceiptTracking.find({
      'receipts.receiptNo': receiptRegex
    }).lean();

    for (const linkDoc of allLinkedDocs) {
      const matchingEntry = (linkDoc.receipts || []).find((r: any) => {
        if (!r.receiptNo || r.receiptNo.trim().toLowerCase() !== inputReceiptNo.toLowerCase()) return false;

        // If warehouseReceiptId exists on both, exact match
        if (targetWhId && r.warehouseReceiptId) {
          return String(r.warehouseReceiptId) === String(targetWhId);
        }

        // If warehouse code exists on both, match by warehouse
        if (targetWarehouse && r.warehouse) {
          return r.warehouse.toUpperCase().trim() === targetWarehouse.toUpperCase().trim();
        }

        // If CTN is recorded on existing entry, match if same carton count
        if (totalWarehouseCtnNum !== null && r.ctn) {
          const entryCtnNum = normalizeCarton(r.ctn);
          if (entryCtnNum !== null && entryCtnNum === totalWarehouseCtnNum) return true;
        }

        // If no warehouse disambiguation exists on either, treat as same receipt
        if (!targetWarehouse && !r.warehouse) return true;

        return false;
      });

      if (matchingEntry) {
        const originUrl = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://eta-usi.vercel.app';
        const detailsUrl = `${originUrl}/track/${linkDoc.token}`;
        const whLabel = targetWarehouse ? ` (${targetWarehouse} Warehouse)` : '';

        if (linkDoc.token === token) {
          return NextResponse.json({
            success: false,
            message: `Receipt #${inputReceiptNo}${whLabel} is already present in this tracking link. Find details here: ${detailsUrl}`,
            alreadyLinked: true,
            linkName: linkDoc.name || 'Current Tracking Link',
            linkToken: linkDoc.token,
            linkUrl: detailsUrl
          }, { status: 400 });
        } else {
          return NextResponse.json({
            success: false,
            message: `This receipt cannot be added to any public link because it is already added to tracking link "${linkDoc.name || linkDoc.token}". Find details here: ${detailsUrl}`,
            alreadyLinked: true,
            linkName: linkDoc.name || linkDoc.token,
            linkToken: linkDoc.token,
            linkUrl: detailsUrl
          }, { status: 400 });
        }
      }
    }

    // 5. Verification passed: save with explicit warehouse code and receipt identifier
    const chosen = matchedWh || matchedShipment || {};
    const newEntry: IReceiptEntry = {
      id: "rec_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      receiptNo: chosen.receipt || chosen.receiptNo || inputReceiptNo,
      warehouse: targetWarehouse,
      warehouseReceiptId: targetWhId,
      marka: String(matchedWh?.mainMarka || matchedWh?.subMarka || matchedShipment?.mainMarka || matchedShipment?.subMarka || trackingDoc.name || "").trim(),
      itemName: String(matchedWh?.english || matchedWh?.commodity || matchedWh?.chinese || (matchedWh?.items && matchedWh.items[0]?.itemName) || matchedShipment?.english || matchedShipment?.commodity || chosen.itemName || "").trim(),
      cbm: String(matchedWh?.volume || matchedShipment?.volume || chosen.cbm || "").trim(),
      ctn: String(totalWarehouseCtnNum),
      weight: String(matchedWh?.weight || matchedShipment?.weight || chosen.weight || "").trim(),
      containerNo: String(matchedShipment?.container || chosen.containerNo || "In Warehouse (Not Loaded)").trim(),
      actualContainerNo: "",
      eta: String(matchedShipment?.destinationDate || matchedShipment?.eta || chosen.eta || "").trim(),
      status: String(matchedShipment?.status || (matchedWh ? "Received in Warehouse" : chosen.status || "In Transit")).trim(),
      adminNotes: `Self-added by customer for ${targetWarehouse || "China"} Warehouse (${totalWarehouseCtnNum} CTN)`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    trackingDoc.receipts.push(newEntry);
    trackingDoc.updatedAt = new Date();
    await trackingDoc.save();

    const whDisplayLabel = targetWarehouse ? `${targetWarehouse} Warehouse` : "Warehouse";
    return NextResponse.json({
      success: true,
      message: `✓ Receipt #${newEntry.receiptNo} (${newEntry.ctn} CTN) verified & linked from ${whDisplayLabel}!`,
      receipt: {
        marka: newEntry.marka || trackingDoc.name || '-',
        receiptNo: newEntry.receiptNo,
        itemName: newEntry.itemName || '-',
        containerNo: newEntry.containerNo || 'Pending Allocation',
        cbm: newEntry.cbm || '0',
        weight: newEntry.weight || '-',
        ctn: newEntry.ctn || '0',
        eta: newEntry.eta || null,
        status: newEntry.status,
        remainDays: calculateRemainDays(newEntry.eta)
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });

  } catch (error: any) {
    console.error('Error adding receipt via public tracking link:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error adding receipt' },
      { status: 500 }
    );
  }
}
