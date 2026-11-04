import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Strictly READ-ONLY query
    await connectToDatabase();

    // 1. Fetch all containers
    const containers = await Container.find({})
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
        isDelivered: 1,
        status: 1,
      })
      .sort({ container: 1 })
      .lean();

    // 2. Fetch all shipments with cargo & rate details
    const shipments = await Shipment.find({})
      .select({
        receipt: 1,
        container: 1,
        containerNumber: 1,
        shippingLine: 1,
        warehouse: 1,
        party: 1,
        phone: 1,
        partyPhone: 1,
        rate: 1,
        'Overall / Receipt Freight Rate': 1,
        rateFixed: 1,
        totalCost: 1,
        cost: 1,
        quantity: 1,
        weight: 1,
        volume: 1,
        commodity: 1,
        english: 1,
        mainMarka: 1,
        subMarka: 1,
        goodsItems: 1,
        messageSent: 1,
        messageSentDate: 1,
        date: 1,
        loadingDate: 1,
        rawEta: 1,
        destinationDate: 1,
        deliveryDate: 1,
        status: 1,
      })
      .sort({ receipt: 1 })
      .lean();

    // Also fetch WarehouseReceipt rates to merge if shipment rate was empty
    const receiptsWithRates = await WarehouseReceipt.find({
      rate: { $exists: true, $nin: ['', null] },
    })
      .select({ receipt: 1, rate: 1, rateFixed: 1, totalCost: 1 })
      .lean();

    const whRateMap = new Map<string, { rate: string; rateFixed?: boolean; totalCost?: any }>();
    receiptsWithRates.forEach((wr: any) => {
      if (wr.receipt) {
        whRateMap.set(wr.receipt.trim().toLowerCase(), {
          rate: wr.rate,
          rateFixed: wr.rateFixed,
          totalCost: wr.totalCost,
        });
      }
    });

    // Group shipments by container alias
    const containerShipmentMap = new Map<string, any[]>();

    shipments.forEach((s: any) => {
      const cAlias = (s.container || 'UNASSIGNED').trim().toUpperCase();
      if (!containerShipmentMap.has(cAlias)) {
        containerShipmentMap.set(cAlias, []);
      }

      // Check fallback rate from WarehouseReceipt if shipment rate is empty
      const recKey = (s.receipt || '').trim().toLowerCase();
      let effectiveRate = s.rate || '';
      let effectiveRateFixed = s.rateFixed || false;
      let effectiveTotalCost = s.totalCost || s.cost || '';

      if (!effectiveRate && whRateMap.has(recKey)) {
        const whR = whRateMap.get(recKey)!;
        effectiveRate = whR.rate || '';
        effectiveRateFixed = effectiveRateFixed || Boolean(whR.rateFixed);
        if (!effectiveTotalCost) effectiveTotalCost = whR.totalCost || '';
      }

      containerShipmentMap.get(cAlias)!.push({
        ...s,
        effectiveRate,
        effectiveRateFixed,
        effectiveTotalCost,
      });
    });

    // Build container-wise rate summary list
    const containerRateSummary: any[] = [];
    const allDetailedRows: any[] = [];

    // Ensure all containers are represented
    const allAliases = new Set<string>();
    containers.forEach((c: any) => allAliases.add(c.container.trim().toUpperCase()));
    containerShipmentMap.forEach((_, alias) => allAliases.add(alias));

    const sortedAliases = Array.from(allAliases).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    for (const alias of sortedAliases) {
      const containerInfo = containers.find(
        (c: any) => c.container.trim().toUpperCase() === alias
      );
      const items = containerShipmentMap.get(alias) || [];

      let totalCtn = 0;
      let totalWt = 0;
      let totalVol = 0;
      let totalCostNum = 0;

      const rateSet = new Set<string>();
      let withRateCount = 0;
      let fixedRateCount = 0;

      items.forEach((item: any) => {
        const q = parseInt(String(item.quantity || 0).replace(/[^\d]/g, ''), 10) || 0;
        const w = parseFloat(String(item.weight || 0).replace(/[^\d.]/g, '')) || 0;
        const v = parseFloat(String(item.volume || 0).replace(/[^\d.]/g, '')) || 0;
        const cst = parseFloat(String(item.effectiveTotalCost || 0).replace(/[^\d.]/g, '')) || 0;

        totalCtn += q;
        totalWt += w;
        totalVol += v;
        totalCostNum += cst;

        const rVal = (item.effectiveRate || '').trim();
        if (rVal) {
          rateSet.add(rVal);
          withRateCount++;
        }
        if (item.effectiveRateFixed) {
          fixedRateCount++;
        }

        // Add to detailed manifest
        allDetailedRows.push({
          container: alias,
          containerNumber: containerInfo?.containerNumber || item.containerNumber || '—',
          shippingLine: containerInfo?.shippingLine || item.shippingLine || 'MSC',
          warehouse: item.warehouse || containerInfo?.warehouse || '—',
          receipt: item.receipt,
          party: item.party || '—',
          phone: item.phone || item.partyPhone || '—',
          mainMarka: item.mainMarka || '—',
          subMarka: item.subMarka || '—',
          commodity: item.english || item.commodity || '—',
          quantity: q,
          weight: Math.round(w * 100) / 100,
          volume: Math.round(v * 1000) / 1000,
          rate: rVal || 'Not Set',
          rateFixed: item.effectiveRateFixed ? 'Yes' : 'No',
          totalCost: cst > 0 ? cst : (item.effectiveTotalCost || '—'),
          goodsBreakdown: Array.isArray(item.goodsItems) && item.goodsItems.length > 0
            ? item.goodsItems.map((gi: any) => `${gi.name || 'Item'}: ${gi.rate || 'No rate'} (${gi.rateUnit || 'CTN'})`).join('; ')
            : '—',
          messageSent: item.messageSent ? 'Sent' : 'Pending',
          messageSentDate: item.messageSentDate || '—',
          loadingDate: item.loadingDate || containerInfo?.loadingDate || '—',
          portDate: item.rawEta || containerInfo?.rawEta || '—',
          deliveryDate: item.deliveryDate || containerInfo?.deliveryDate || '—',
        });
      });

      const ratesFound = Array.from(rateSet).sort();

      containerRateSummary.push({
        container: alias,
        containerNumber: containerInfo?.containerNumber || (items[0]?.containerNumber || '—'),
        shippingLine: containerInfo?.shippingLine || (items[0]?.shippingLine || 'MSC'),
        warehouse: containerInfo?.warehouse || (items[0]?.warehouse || 'China Warehouse'),
        loadingDate: containerInfo?.loadingDate || containerInfo?.startDate || (items[0]?.loadingDate || '—'),
        portDate: containerInfo?.rawEta || containerInfo?.destinationDate || (items[0]?.rawEta || '—'),
        deliveryDate: containerInfo?.deliveryDate || (items[0]?.deliveryDate || '—'),
        status: containerInfo?.status || (items[0]?.status || 'In Transit'),
        isDelivered: Boolean(containerInfo?.isDelivered),
        receiptCount: items.length,
        totalCartons: totalCtn,
        totalWeight: Math.round(totalWt * 100) / 100,
        totalVolume: Math.round(totalVol * 1000) / 1000,
        ratesFound: ratesFound.length > 0 ? ratesFound.join(', ') : 'None',
        ratesCount: ratesFound.length,
        receiptsWithRate: withRateCount,
        receiptsWithoutRate: items.length - withRateCount,
        rateFixedCount: fixedRateCount,
        totalCost: Math.round(totalCostNum * 100) / 100,
      });
    }

    return NextResponse.json({
      success: true,
      summary: containerRateSummary,
      details: allDetailedRows,
      totalContainers: containerRateSummary.length,
      totalShipments: allDetailedRows.length,
    });
  } catch (error: any) {
    console.error('Error fetching container-wise rates:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch container-wise rates' },
      { status: 500 }
    );
  }
}
