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

interface ICandidateSlip {
  source: 'warehouse' | 'shipment' | 'receipt_tracking';
  receiptNo: string;
  warehouse: string; // e.g. "GZ", "YW"
  warehouseReceiptId: string;
  totalCtn: number;
  matchedWh: any | null;
  matchedShipments: any[];
  marka: string;
  itemName: string;
  cbm: string;
  weight: string;
  containerNo: string;
  eta: string;
  status: string;
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
    const requestedWarehouse = String(body.warehouse || body.selectedWarehouse || '').trim();

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

    // 2. Search database for this receipt across China warehouses
    const receiptRegex = new RegExp(`^${inputReceiptNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

    const matchingWhItems: any[] = await WarehouseReceipt.find({ receipt: receiptRegex }).lean();
    const allShipments: any[] = await Shipment.find({ receipt: receiptRegex }).lean();

    const candidates: ICandidateSlip[] = [];

    // 2a. Candidates from WarehouseReceipt
    for (const w of matchingWhItems) {
      const whCode = (w.warehouse || 'CHINA').toUpperCase().trim();
      const whCtn = normalizeCarton(w.quantity) ?? 0;
      const wIdStr = String(w._id);

      const relatedShipments = allShipments.filter((s: any) =>
        (s.receiptId && String(s.receiptId) === wIdStr) ||
        ((s.warehouse || '').toUpperCase().trim() === whCode)
      );

      const primaryShipment = relatedShipments[0] || null;

      candidates.push({
        source: 'warehouse',
        receiptNo: w.receipt || inputReceiptNo,
        warehouse: whCode,
        warehouseReceiptId: wIdStr,
        totalCtn: whCtn,
        matchedWh: w,
        matchedShipments: relatedShipments,
        marka: String(w.mainMarka || w.subMarka || primaryShipment?.mainMarka || primaryShipment?.subMarka || trackingDoc.name || '').trim(),
        itemName: String(w.english || w.commodity || w.chinese || (w.items && w.items[0]?.itemName) || primaryShipment?.english || primaryShipment?.commodity || '').trim(),
        cbm: String(w.volume || primaryShipment?.volume || '0').trim(),
        weight: String(w.weight || primaryShipment?.weight || '-').trim(),
        containerNo: String(primaryShipment?.container || 'In Warehouse (Not Loaded)').trim(),
        eta: String(primaryShipment?.destinationDate || primaryShipment?.eta || '').trim(),
        status: String(primaryShipment?.status || 'Received in Warehouse').trim()
      });
    }

    // 2b. Candidates from Shipment not covered by WarehouseReceipt
    const coveredWhIds = new Set(matchingWhItems.map(w => String(w._id)));
    const remainingShipments = allShipments.filter(s => !s.receiptId || !coveredWhIds.has(String(s.receiptId)));

    if (remainingShipments.length > 0) {
      const shipmentsByWh = new Map<string, any[]>();
      remainingShipments.forEach((s: any) => {
        const whKey = (s.warehouse || 'CHINA').toUpperCase().trim();
        if (!shipmentsByWh.has(whKey)) shipmentsByWh.set(whKey, []);
        shipmentsByWh.get(whKey)!.push(s);
      });

      for (const [whKey, sList] of shipmentsByWh.entries()) {
        const sumQty = sList.reduce((acc: number, s: any) => acc + (normalizeCarton(s.quantity) || 0), 0);
        const origQty = normalizeCarton(sList[0]?.originalTotalQuantity);
        const totalCtn = origQty !== null && origQty > 0 ? origQty : sumQty;
        const first = sList[0];

        candidates.push({
          source: 'shipment',
          receiptNo: first.receipt || inputReceiptNo,
          warehouse: whKey,
          warehouseReceiptId: first.receiptId ? String(first.receiptId) : '',
          totalCtn: totalCtn,
          matchedWh: null,
          matchedShipments: sList,
          marka: String(first.mainMarka || first.subMarka || trackingDoc.name || '').trim(),
          itemName: String(first.english || first.commodity || first.chinese || '').trim(),
          cbm: String(first.volume || '0').trim(),
          weight: String(first.weight || '-').trim(),
          containerNo: String(first.container || 'In Warehouse (Not Loaded)').trim(),
          eta: String(first.destinationDate || first.eta || '').trim(),
          status: String(first.status || 'In Transit').trim()
        });
      }
    }

    // 2c. Fallback: check existing tracking documents in ReceiptTracking
    if (candidates.length === 0) {
      const existingDoc: any = await ReceiptTracking.findOne({ 'receipts.receiptNo': receiptRegex }).lean();
      if (existingDoc && Array.isArray(existingDoc.receipts)) {
        const found = existingDoc.receipts.find(
          (r: any) => r.receiptNo && r.receiptNo.toLowerCase() === inputReceiptNo.toLowerCase()
        );
        if (found) {
          candidates.push({
            source: 'receipt_tracking',
            receiptNo: found.receiptNo,
            warehouse: (found.warehouse || 'CHINA').toUpperCase().trim(),
            warehouseReceiptId: found.warehouseReceiptId || '',
            totalCtn: normalizeCarton(found.ctn) ?? 0,
            matchedWh: null,
            matchedShipments: [],
            marka: found.marka || trackingDoc.name || '',
            itemName: found.itemName || '',
            cbm: found.cbm || '0',
            weight: found.weight || '-',
            containerNo: found.containerNo || 'In Warehouse (Not Loaded)',
            eta: found.eta || '',
            status: found.status || 'In Transit'
          });
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        message: `Receipt #${inputReceiptNo} was not found in warehouse records. Please check the receipt number on your warehouse slip.`
      }, { status: 404 });
    }

    // 3. Verify CTN against candidate warehouse slips
    const ctnMatchedCandidates = candidates.filter(c => c.totalCtn === inputCtnNum);

    // 3a. No warehouse slip matches the input CTN
    if (ctnMatchedCandidates.length === 0) {
      const hints = candidates.map(c => `${c.warehouse} (${c.totalCtn} CTN)`).join(', ');
      return NextResponse.json({
        success: false,
        message: candidates.length > 1
          ? `Receipt #${inputReceiptNo} exists in warehouse records with different carton counts: ${hints}. Your entered carton count (${inputCtn} CTN) does not match. Please enter the exact total cartons received as per your warehouse slip.`
          : `Verification failed: Carton count (${inputCtn} CTN) does not match total packages received in warehouse for Receipt #${inputReceiptNo} (${candidates[0].totalCtn} CTN). Please enter total cartons received as per your warehouse slip.`
      }, { status: 400 });
    }

    // 3b. Determine the chosen candidate slip
    let chosenCandidate: ICandidateSlip;

    if (ctnMatchedCandidates.length === 1) {
      // Exactly one warehouse matches this Receipt No. + CTN (e.g. GZ: 4 CTN vs YW: 5 CTN -> input 4 CTN picks GZ automatically)
      chosenCandidate = ctnMatchedCandidates[0];
    } else {
      // Multiple warehouses have the SAME receipt number AND the SAME carton count (e.g. GZ: 4 CTN and YW: 4 CTN)
      // Check if user already submitted a warehouse selection
      if (requestedWarehouse) {
        const matchedByWh = ctnMatchedCandidates.find(
          c => c.warehouse.toUpperCase().trim() === requestedWarehouse.toUpperCase().trim()
        );
        if (!matchedByWh) {
          const availableList = ctnMatchedCandidates.map(c => c.warehouse).join(', ');
          return NextResponse.json({
            success: false,
            message: `Selected warehouse "${requestedWarehouse}" is not valid. Available warehouses for Receipt #${inputReceiptNo} (${inputCtnNum} CTN) are: ${availableList}.`
          }, { status: 400 });
        }
        chosenCandidate = matchedByWh;
      } else {
        // Return requireWarehouseSelect to prompt user to select the warehouse
        return NextResponse.json({
          success: false,
          requireWarehouseSelect: true,
          availableWarehouses: ctnMatchedCandidates.map(c => ({
            code: c.warehouse,
            name: c.warehouse === 'GZ' ? 'Guangzhou (GZ)' : c.warehouse === 'YW' ? 'Yiwu (YW)' : `${c.warehouse} Warehouse`,
            ctn: c.totalCtn,
            marka: c.marka || '-'
          })),
          message: `Receipt #${inputReceiptNo} with ${inputCtnNum} CTN exists in multiple warehouses (${ctnMatchedCandidates.map(c => c.warehouse).join(' & ')}). Please select your warehouse slip to link.`
        }, { status: 400 });
      }
    }

    const targetWarehouse = chosenCandidate.warehouse;
    const targetWhId = chosenCandidate.warehouseReceiptId;
    const totalWarehouseCtnNum = chosenCandidate.totalCtn;

    // 4. GLOBAL LINK RESTRICTION:
    // Rule: If any receipt no. is linked to any public link, it CANNOT be linked again if found in the SAME warehouse.
    // BUT the same receipt no. in a DIFFERENT warehouse CAN be linked because they are different slips!
    const allLinkedDocs: any[] = await ReceiptTracking.find({
      'receipts.receiptNo': receiptRegex
    }).lean();

    for (const linkDoc of allLinkedDocs) {
      const matchingEntry = (linkDoc.receipts || []).find((r: any) => {
        if (!r.receiptNo || r.receiptNo.trim().toLowerCase() !== inputReceiptNo.toLowerCase()) return false;

        // 1. If MongoDB warehouse receipt IDs exist on both, exact check
        if (targetWhId && r.warehouseReceiptId) {
          return String(r.warehouseReceiptId) === String(targetWhId);
        }

        const newWh = targetWarehouse.toUpperCase().trim();
        let existWh = (r.warehouse || '').toUpperCase().trim();

        // 2. If existing entry doesn't have warehouse set, resolve from matching slips
        if (!existWh && matchingWhItems && matchingWhItems.length > 0) {
          const existCtnNum = normalizeCarton(r.ctn);
          const existMarka = (r.marka || '').toUpperCase().trim();
          const resolvedDoc = matchingWhItems.find((w: any) => {
            const wQty = normalizeCarton(w.quantity);
            if (existCtnNum !== null && wQty !== null && wQty === existCtnNum) return true;
            const wMainMarka = (w.mainMarka || '').toUpperCase().trim();
            const wParty = (w.party || '').toUpperCase().trim();
            if (existMarka && (wMainMarka === existMarka || wParty === existMarka)) return true;
            return false;
          });
          if (resolvedDoc?.warehouse) {
            existWh = resolvedDoc.warehouse.toUpperCase().trim();
          }
        }

        // 3. Compare warehouses:
        // Different warehouses (e.g. GZ vs YW) -> DIFFERENT RECEIPTS (ALLOWED, NOT a duplicate)!
        if (newWh && existWh) {
          return newWh === existWh;
        }

        // 4. If warehouse could not be determined, but carton count differs across slips
        if (candidates.length > 1) {
          const entryCtnNum = normalizeCarton(r.ctn);
          if (totalWarehouseCtnNum !== null && entryCtnNum !== null && totalWarehouseCtnNum !== entryCtnNum) {
            // Different carton counts corresponding to different warehouse slips -> not duplicate
            return false;
          }
        }

        // 5. Default fallback (single warehouse receipt exists)
        return true;
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
            message: `Receipt #${inputReceiptNo}${whLabel} cannot be linked again because it is already linked to public tracking link "${linkDoc.name || linkDoc.token}". Find details here: ${detailsUrl}`,
            alreadyLinked: true,
            linkName: linkDoc.name || linkDoc.token,
            linkToken: linkDoc.token,
            linkUrl: detailsUrl
          }, { status: 400 });
        }
      }
    }

    // 5. Verification passed: save with explicit warehouse code and receipt identifier
    const newEntry: IReceiptEntry = {
      id: "rec_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      receiptNo: chosenCandidate.receiptNo || inputReceiptNo,
      warehouse: targetWarehouse,
      warehouseReceiptId: targetWhId,
      marka: chosenCandidate.marka || trackingDoc.name || "",
      itemName: chosenCandidate.itemName || "",
      cbm: chosenCandidate.cbm || "0",
      ctn: String(totalWarehouseCtnNum),
      weight: chosenCandidate.weight || "-",
      containerNo: chosenCandidate.containerNo || "In Warehouse (Not Loaded)",
      actualContainerNo: "",
      eta: chosenCandidate.eta || "",
      status: chosenCandidate.status || "In Transit",
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
