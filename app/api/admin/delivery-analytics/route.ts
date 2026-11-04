import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { parseReceiptDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

function diffDays(startDateStr?: string | null, endDateStr?: string | null): number | null {
  if (!startDateStr || !endDateStr) return null;
  const s = parseReceiptDate(startDateStr);
  const e = parseReceiptDate(endDateStr);
  if (!s || !e) return null;
  const diffMs = e.getTime() - s.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  // Filter out negative or extreme out-of-range dates
  return days >= 0 && days <= 365 ? days : null;
}

export interface MetricStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
}

function computeStats(values: number[]): MetricStats {
  if (!values || values.length === 0) {
    return { count: 0, avg: 0, min: 0, max: 0, std: 0 };
  }
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / count) * 10) / 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
  const std = Math.round(Math.sqrt(variance) * 10) / 10;
  return { count, avg, min, max, std };
}

export async function GET(req: NextRequest) {
  try {
    // Strictly READ-ONLY operations
    await connectToDatabase();

    // 1. Fetch delivered containers (strictly read-only)
    const deliveredContainers = await Container.find({
      $or: [
        { isDelivered: true },
        { deliveryDate: { $nin: ['', null, '—', 'N/A', 'In Transit', 'Pending'] } },
      ],
    })
      .select({
        container: 1,
        containerNumber: 1,
        shippingLine: 1,
        warehouse: 1,
        loadingDate: 1,
        startDate: 1,
        rawEta: 1,
        destinationDate: 1,
        eta: 1,
        deliveryDate: 1,
        daysToDeliver: 1,
        isDelivered: 1,
        totalCartons: 1,
        totalWeight: 1,
        totalVolume: 1,
      })
      .lean();

    // 2. Fetch delivered shipments (strictly read-only)
    const deliveredShipments = await Shipment.find({
      $or: [
        { isDelivered: true },
        { deliveryDate: { $nin: ['', null, '—', 'N/A', 'In Transit', 'Pending'] } },
      ],
    })
      .select({
        receipt: 1,
        container: 1,
        containerNumber: 1,
        shippingLine: 1,
        warehouse: 1,
        date: 1,
        loadingDate: 1,
        startDate: 1,
        rawEta: 1,
        destinationDate: 1,
        deliveryDate: 1,
        party: 1,
        commodity: 1,
        quantity: 1,
        weight: 1,
        volume: 1,
      })
      .lean();

    // 3. Process Container-level transit stages
    const overallContainerWhToDelivery: number[] = [];
    const overallContainerLoadingToPort: number[] = [];
    const overallContainerPortToDelivery: number[] = [];

    const carrierContainerMap: Record<
      string,
      {
        whToDelivery: number[];
        loadingToPort: number[];
        portToDelivery: number[];
        containers: any[];
      }
    > = {};

    const containerExportList = deliveredContainers.map((c: any) => {
      const carrier = (c.shippingLine || 'MSC').toUpperCase().trim();
      if (!carrierContainerMap[carrier]) {
        carrierContainerMap[carrier] = {
          whToDelivery: [],
          loadingToPort: [],
          portToDelivery: [],
          containers: [],
        };
      }

      const effectiveLoading = c.loadingDate || c.startDate || '';
      const effectivePort = c.rawEta || c.destinationDate || '';
      const effectiveDelivery = c.deliveryDate || '';

      const whToDel = diffDays(effectiveLoading, effectiveDelivery);
      const loadToPort = diffDays(effectiveLoading, effectivePort);
      const portToDel = diffDays(effectivePort, effectiveDelivery);

      if (whToDel !== null) {
        overallContainerWhToDelivery.push(whToDel);
        carrierContainerMap[carrier].whToDelivery.push(whToDel);
      }
      if (loadToPort !== null) {
        overallContainerLoadingToPort.push(loadToPort);
        carrierContainerMap[carrier].loadingToPort.push(loadToPort);
      }
      if (portToDel !== null) {
        overallContainerPortToDelivery.push(portToDel);
        carrierContainerMap[carrier].portToDelivery.push(portToDel);
      }

      const record = {
        container: c.container,
        containerNumber: c.containerNumber || '—',
        shippingLine: carrier,
        warehouse: c.warehouse || 'China Warehouse',
        loadingDate: effectiveLoading || '—',
        portDate: effectivePort || '—',
        deliveryDate: effectiveDelivery || '—',
        whToDeliveryDays: whToDel,
        loadingToPortDays: loadToPort,
        portToDeliveryDays: portToDel,
        totalCartons: c.totalCartons || 0,
        totalWeight: c.totalWeight || 0,
        totalVolume: c.totalVolume || 0,
      };

      carrierContainerMap[carrier].containers.push(record);
      return record;
    });

    // 4. Process Shipment-level transit stages (including Receipt Date to Delivery Date)
    const overallShipmentReceiptToDelivery: number[] = [];
    const overallShipmentWhToDelivery: number[] = [];
    const overallShipmentLoadingToPort: number[] = [];
    const overallShipmentPortToDelivery: number[] = [];

    const carrierShipmentMap: Record<
      string,
      {
        receiptToDelivery: number[];
        whToDelivery: number[];
        loadingToPort: number[];
        portToDelivery: number[];
        shipments: any[];
      }
    > = {};

    const shipmentExportList = deliveredShipments.map((s: any) => {
      const carrier = (s.shippingLine || 'MSC').toUpperCase().trim();
      if (!carrierShipmentMap[carrier]) {
        carrierShipmentMap[carrier] = {
          receiptToDelivery: [],
          whToDelivery: [],
          loadingToPort: [],
          portToDelivery: [],
          shipments: [],
        };
      }

      const receiptDate = s.date || '';
      const effectiveLoading = s.loadingDate || s.startDate || '';
      const effectivePort = s.rawEta || s.destinationDate || '';
      const effectiveDelivery = s.deliveryDate || '';

      const recToDel = diffDays(receiptDate, effectiveDelivery);
      const whToDel = diffDays(effectiveLoading, effectiveDelivery);
      const loadToPort = diffDays(effectiveLoading, effectivePort);
      const portToDel = diffDays(effectivePort, effectiveDelivery);

      if (recToDel !== null) {
        overallShipmentReceiptToDelivery.push(recToDel);
        carrierShipmentMap[carrier].receiptToDelivery.push(recToDel);
      }
      if (whToDel !== null) {
        overallShipmentWhToDelivery.push(whToDel);
        carrierShipmentMap[carrier].whToDelivery.push(whToDel);
      }
      if (loadToPort !== null) {
        overallShipmentLoadingToPort.push(loadToPort);
        carrierShipmentMap[carrier].loadingToPort.push(loadToPort);
      }
      if (portToDel !== null) {
        overallShipmentPortToDelivery.push(portToDel);
        carrierShipmentMap[carrier].portToDelivery.push(portToDel);
      }

      const record = {
        receipt: s.receipt,
        container: s.container,
        containerNumber: s.containerNumber || '—',
        shippingLine: carrier,
        warehouse: s.warehouse || '—',
        party: s.party || '—',
        commodity: s.commodity || '—',
        receiptDate: receiptDate || '—',
        loadingDate: effectiveLoading || '—',
        portDate: effectivePort || '—',
        deliveryDate: effectiveDelivery || '—',
        receiptToDeliveryDays: recToDel,
        whToDeliveryDays: whToDel,
        loadingToPortDays: loadToPort,
        portToDeliveryDays: portToDel,
      };

      carrierShipmentMap[carrier].shipments.push(record);
      return record;
    });

    // 5. Build unique carriers list
    const carrierSet = new Set<string>();
    Object.keys(carrierContainerMap).forEach((c) => carrierSet.add(c));
    Object.keys(carrierShipmentMap).forEach((c) => carrierSet.add(c));
    const allCarriers = Array.from(carrierSet).sort();

    // 6. Aggregate carrier-wise summary
    const carrierStats: Record<
      string,
      {
        containerCount: number;
        shipmentCount: number;
        whToDelivery: MetricStats;
        loadingToPort: MetricStats;
        portToDelivery: MetricStats;
        receiptToDelivery: MetricStats;
      }
    > = {};

    for (const c of allCarriers) {
      const cData = carrierContainerMap[c] || { whToDelivery: [], loadingToPort: [], portToDelivery: [], containers: [] };
      const sData = carrierShipmentMap[c] || { receiptToDelivery: [], whToDelivery: [], loadingToPort: [], portToDelivery: [], shipments: [] };

      carrierStats[c] = {
        containerCount: cData.containers.length,
        shipmentCount: sData.shipments.length,
        whToDelivery: computeStats(cData.whToDelivery.length > 0 ? cData.whToDelivery : sData.whToDelivery),
        loadingToPort: computeStats(cData.loadingToPort.length > 0 ? cData.loadingToPort : sData.loadingToPort),
        portToDelivery: computeStats(cData.portToDelivery.length > 0 ? cData.portToDelivery : sData.portToDelivery),
        receiptToDelivery: computeStats(sData.receiptToDelivery),
      };
    }

    // 7. Overall stats across entire fleet
    const overall = {
      containerCount: deliveredContainers.length,
      shipmentCount: deliveredShipments.length,
      whToDelivery: computeStats(overallContainerWhToDelivery),
      loadingToPort: computeStats(overallContainerLoadingToPort),
      portToDelivery: computeStats(overallContainerPortToDelivery),
      receiptToDelivery: computeStats(overallShipmentReceiptToDelivery),
    };

    return NextResponse.json({
      success: true,
      overall,
      carrierStats,
      allCarriers,
      containerList: containerExportList,
      shipmentList: shipmentExportList,
    });
  } catch (err: any) {
    console.error('Error in delivery-analytics API:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compute transit delivery analytics' },
      { status: 500 }
    );
  }
}
