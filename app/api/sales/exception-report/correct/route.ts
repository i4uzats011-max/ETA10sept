import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isSalesHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';
import { parseMetricNumber } from '@/lib/metricUtils';
import { checkZeroDiscrepancy } from '@/lib/exceptionReport';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sales/exception-report/correct
 * 
 * STRICT ACCESS: Only Sales Head or Developer Admin can correct/alter entries.
 * Allows altering either:
 *  1. Warehouse Entry (WarehouseReceipt): Received CTN, CBM, and Weight.
 *  2. Loading Plan Entry (Shipment): Loaded CTN, CBM, and Weight.
 * 
 * Enforces Zero-Value Rule:
 *  (ctn === 0 && cbm === 0 && weight === 0) OR (ctn > 0 && cbm > 0 && weight > 0)
 */
export async function POST(req: NextRequest) {
  // Enforce Sales Head or Developer Admin authentication
  if (!isSalesHeadAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Only Sales Head or Developer Admin can alter warehouse or loading plan entries.' },
      { status: 403 }
    );
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();

    const {
      target, // 'WAREHOUSE' | 'LOADING_PLAN'
      receipt,
      container,
      warehouse,
      quantity,
      cbm,
      weight,
      notes,
    } = body;

    if (!receipt || !target) {
      return NextResponse.json(
        { error: 'Missing required parameters: target (WAREHOUSE | LOADING_PLAN) and receipt number are required.' },
        { status: 400 }
      );
    }

    const cleanReceipt = String(receipt).trim();
    const parsedQty = Math.max(0, parseInt(String(quantity ?? 0), 10) || 0);
    const parsedCbm = Math.max(0, parseMetricNumber(cbm));
    const parsedWeight = Math.max(0, parseMetricNumber(weight));

    // Enforce Zero-Discrepancy Rule on the updated values
    const zeroCheck = checkZeroDiscrepancy(parsedQty, parsedCbm, parsedWeight);
    if (zeroCheck.hasZeroException) {
      return NextResponse.json(
        {
          error: `Invalid Entry: ${zeroCheck.detail} All three parameters (CTN, CBM, and Weight) must either all be 0 or all have positive non-zero values.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();

    if (target === 'WAREHOUSE') {
      // 1. ALTER WAREHOUSE ENTRY (WarehouseReceipt)
      const whQuery: Record<string, any> = {
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      };
      if (warehouse && String(warehouse).trim() && String(warehouse).trim() !== 'ALL') {
        whQuery.warehouse = new RegExp(`^${String(warehouse).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      }

      const whDoc = await WarehouseReceipt.findOne(whQuery);
      if (!whDoc) {
        return NextResponse.json(
          { error: `Warehouse receipt '${cleanReceipt}' not found in database.` },
          { status: 404 }
        );
      }

      const oldValues = {
        quantity: whDoc.quantity,
        volume: whDoc.volume,
        weight: whDoc.weight,
        status: whDoc.status,
      };

      whDoc.quantity = parsedQty;
      whDoc.volume = parsedCbm > 0 ? String(parsedCbm) : '0';
      whDoc.weight = parsedWeight > 0 ? String(parsedWeight) : '0';

      const loadedQty = whDoc.loadedQuantity || 0;
      whDoc.remainingQuantity = Math.max(0, parsedQty - loadedQty);

      const loadedCbm = parseMetricNumber(whDoc.loadedVolume);
      whDoc.remainingVolume = String(Math.max(0, Number((parsedCbm - loadedCbm).toFixed(3))));

      const loadedWeight = parseMetricNumber(whDoc.loadedWeight);
      whDoc.remainingWeight = String(Math.max(0, Number((parsedWeight - loadedWeight).toFixed(2))));

      if (parsedQty > 0 && parsedQty === loadedQty) {
        whDoc.status = 'Fully Loaded';
      } else if (loadedQty > 0 && loadedQty < parsedQty) {
        whDoc.status = 'Partially Loaded';
      } else if (loadedQty === 0 && parsedQty > 0) {
        whDoc.status = 'Received in Warehouse';
      }

      if (notes) {
        whDoc.salesRemarks = notes;
        whDoc.salesRemarksUpdatedAt = now;
        whDoc.salesRemarksUpdatedBy = currentUser.username;
      }

      await whDoc.save();

      // Log in audit trail
      await recordEditLog(req, {
        action: 'UPDATE',
        entityType: 'WarehouseReceipt',
        entityId: String(whDoc._id),
        description: `Sales Head altered Warehouse Entry for Receipt ${cleanReceipt}: CTN=${parsedQty}, CBM=${parsedCbm}, Weight=${parsedWeight} kg`,
        details: {
          receipt: cleanReceipt,
          target: 'WAREHOUSE',
          oldValues,
          newValues: { quantity: parsedQty, cbm: parsedCbm, weight: parsedWeight },
          alteredBy: currentUser.username,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Warehouse entry for Receipt ${cleanReceipt} successfully updated!`,
        data: {
          receipt: whDoc.receipt,
          quantity: whDoc.quantity,
          volume: whDoc.volume,
          weight: whDoc.weight,
          remainingQuantity: whDoc.remainingQuantity,
        },
      });
    } else if (target === 'LOADING_PLAN') {
      // 2. ALTER LOADING PLAN ENTRY (Shipment)
      const sQuery: Record<string, any> = {
        $or: [
          { receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { receiptNumber: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      };

      if (container && String(container).trim() && String(container).trim() !== 'ALL') {
        const cRegex = new RegExp(`^${String(container).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        sQuery.$and = [{ $or: [{ container: cRegex }, { containerNumber: cRegex }] }];
      }

      const shipments = await Shipment.find(sQuery);
      if (!shipments || shipments.length === 0) {
        return NextResponse.json(
          { error: `Loading plan shipment for Receipt '${cleanReceipt}' not found.` },
          { status: 404 }
        );
      }

      const targetShipment = shipments[0];
      const oldShipment = {
        quantity: targetShipment.quantity,
        volume: targetShipment.volume,
        weight: targetShipment.weight,
      };

      targetShipment.quantity = String(parsedQty);
      targetShipment.volume = String(parsedCbm);
      targetShipment.weight = String(parsedWeight);
      if (notes) {
        targetShipment.remarks = notes;
      }

      await targetShipment.save();

      // Recalculate cumulative loaded metrics on WarehouseReceipt
      const allShipmentsForReceipt = await Shipment.find({
        $or: [
          { receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { receiptNumber: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      }).lean();

      let totalLoadedQty = 0;
      let totalLoadedCbm = 0;
      let totalLoadedWeight = 0;

      for (const sh of allShipmentsForReceipt) {
        totalLoadedQty += parseInt(String(sh.quantity || 0), 10) || 0;
        totalLoadedCbm = Number((totalLoadedCbm + parseMetricNumber(sh.volume)).toFixed(3));
        totalLoadedWeight = Number((totalLoadedWeight + parseMetricNumber(sh.weight)).toFixed(2));
      }

      const whDoc = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (whDoc) {
        whDoc.loadedQuantity = totalLoadedQty;
        whDoc.loadedVolume = String(totalLoadedCbm);
        whDoc.loadedWeight = String(totalLoadedWeight);
        whDoc.remainingQuantity = Math.max(0, (whDoc.quantity || 0) - totalLoadedQty);
        const whCbm = parseMetricNumber(whDoc.volume);
        whDoc.remainingVolume = String(Math.max(0, Number((whCbm - totalLoadedCbm).toFixed(3))));
        const whWeight = parseMetricNumber(whDoc.weight);
        whDoc.remainingWeight = String(Math.max(0, Number((whWeight - totalLoadedWeight).toFixed(2))));

        if (whDoc.quantity > 0 && whDoc.quantity === totalLoadedQty) {
          whDoc.status = 'Fully Loaded';
        } else if (totalLoadedQty > 0 && totalLoadedQty < (whDoc.quantity || 0)) {
          whDoc.status = 'Partially Loaded';
        }

        await whDoc.save();
      }

      // Recalculate Container totals if container specified
      const cAlias = targetShipment.container;
      if (cAlias) {
        const cShipments = await Shipment.find({ container: cAlias }).lean();
        let cQty = 0;
        let cCbm = 0;
        let cWeight = 0;

        for (const cs of cShipments) {
          cQty += parseInt(String(cs.quantity || 0), 10) || 0;
          cCbm = Number((cCbm + parseMetricNumber(cs.volume)).toFixed(3));
          cWeight = Number((cWeight + parseMetricNumber(cs.weight)).toFixed(2));
        }

        await Container.updateOne(
          { container: cAlias },
          {
            $set: {
              totalQuantity: cQty,
              totalVolume: cCbm,
              totalWeight: cWeight,
            },
          }
        );
      }

      // Log in audit trail
      await recordEditLog(req, {
        action: 'UPDATE',
        entityType: 'Shipment',
        entityId: String(targetShipment._id),
        description: `Sales Head altered Loading Plan Entry for Receipt ${cleanReceipt} in Container ${cAlias || 'N/A'}: CTN=${parsedQty}, CBM=${parsedCbm}, Weight=${parsedWeight} kg`,
        details: {
          receipt: cleanReceipt,
          target: 'LOADING_PLAN',
          container: cAlias,
          oldValues: oldShipment,
          newValues: { quantity: parsedQty, cbm: parsedCbm, weight: parsedWeight },
          alteredBy: currentUser.username,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Loading plan entry for Receipt ${cleanReceipt} (Container: ${cAlias || 'N/A'}) successfully updated!`,
        data: {
          receipt: targetShipment.receipt,
          container: targetShipment.container,
          quantity: targetShipment.quantity,
          volume: targetShipment.volume,
          weight: targetShipment.weight,
        },
      });
    } else {
      return NextResponse.json(
        { error: `Invalid target '${target}'. Target must be either 'WAREHOUSE' or 'LOADING_PLAN'.` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error altering exception entry:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error while altering exception entry.' },
      { status: 500 }
    );
  }
}
