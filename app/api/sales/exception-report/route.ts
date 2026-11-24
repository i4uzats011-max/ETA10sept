import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isSalesPersonOrHeadAuthenticated, isAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { evaluateMetricsMismatch, IExceptionEvaluation } from '@/lib/exceptionReport';
import { parseMetricNumber } from '@/lib/metricUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Allow Sales Head, Developer Admin, or Super Admin
  const isAuthorized = isSalesPersonOrHeadAuthenticated(req) || isAdminAuthenticated(req);
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized. Sales Head or Admin access required.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);

    const selectedContainer = searchParams.get('container')?.trim() || 'ALL';
    const selectedWarehouse = searchParams.get('warehouse')?.trim() || 'ALL';
    const selectedCategory = searchParams.get('category')?.trim() || 'ALL';
    const searchQuery = searchParams.get('search')?.trim().toLowerCase() || '';
    const onlyFinalized = searchParams.get('onlyFinalized') === 'true';

    // 1. Fetch all containers to build directory and container metadata map
    const containerDocs = await Container.find({})
      .select('container containerNumber shippingLine loadingDate startDate eta destinationDate status planStatus isFinalized totalQuantity totalWeight totalVolume warehouse shippedFrom shippedTo isDelivered')
      .sort({ loadingDate: -1, container: 1 })
      .lean();

    const containerMap = new Map<string, any>();
    containerDocs.forEach((c: any) => {
      if (c.container) {
        containerMap.set(c.container.toUpperCase().trim(), c);
      }
    });

    // 2. Build shipment query based on container and warehouse filter
    const shipmentQuery: Record<string, any> = {};

    if (selectedContainer !== 'ALL') {
      const containerRegex = new RegExp(`^${selectedContainer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      shipmentQuery.$or = [
        { container: containerRegex },
        { containerNumber: containerRegex },
      ];
    }

    if (selectedWarehouse !== 'ALL') {
      shipmentQuery.warehouse = new RegExp(`^${selectedWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }

    // 3. Fetch shipments (lean for speed)
    const shipments = await Shipment.find(shipmentQuery)
      .select('receipt container containerNumber warehouse date loadingDate quantity volume weight party mainMarka subMarka commodity english chinese packaging status rate remarks')
      .lean();

    if (shipments.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalContainers: containerDocs.length,
          containersWithMismatches: 0,
          totalMismatches: 0,
          totalMatched: 0,
          netCartonDiff: 0,
          netCbmDiff: 0,
          netWeightDiff: 0,
          excessCartons: 0,
          shortageCartons: 0,
          excessCbm: 0,
          shortageCbm: 0,
          excessWeight: 0,
          shortageWeight: 0,
          categoryCounts: {},
        },
        containerSummaries: [],
        items: [],
        availableContainers: containerDocs.map((c) => ({
          container: c.container,
          containerNumber: c.containerNumber || '',
          mismatchCount: 0,
          isFinalized: Boolean(c.isFinalized),
          planStatus: c.planStatus || 'Planning',
        })),
        availableWarehouses: Array.from(new Set(containerDocs.map((c) => c.warehouse).filter(Boolean))),
        message: 'No shipments found for current filter.',
      });
    }

    // 4. Fetch all matching warehouse receipts in one bulk query
    const receiptNumbers = Array.from(new Set(shipments.map((s: any) => (s.receipt || '').trim()).filter(Boolean)));
    const whReceipts = await WarehouseReceipt.find({
      receipt: { $in: receiptNumbers },
    })
      .select('receipt warehouse date quantity weight volume loadedQuantity loadedWeight loadedVolume remainingQuantity remainingWeight remainingVolume party mainMarka subMarka commodity english chinese status stockstatus salesPerson salesRate salesRemarks salesDiscrepancy')
      .lean();

    const whMap = new Map<string, any>();
    whReceipts.forEach((wh: any) => {
      const cleanR = (wh.receipt || '').toUpperCase().trim();
      whMap.set(cleanR, wh);
      const compoundKey = `${String(wh.warehouse || '').toLowerCase().trim()}___${cleanR}`;
      whMap.set(compoundKey, wh);
    });

    // 5. Aggregate Shipments by (container, receipt)
    interface IGroupedShipment {
      container: string;
      receipt: string;
      warehouse: string;
      party: string;
      mainMarka: string;
      subMarka: string;
      commodity: string;
      loadingDate: string;
      loadedQty: number;
      loadedCbm: number;
      loadedWeight: number;
      containerNumber: string;
      shippingLine: string;
      shipmentCount: number;
      rates: string[];
      remarks: string[];
    }

    const groupedMap = new Map<string, IGroupedShipment>();

    for (const s of shipments) {
      const cAlias = (s.container || '').toUpperCase().trim() || 'UNASSIGNED';
      const rNum = (s.receipt || '').trim();
      if (!rNum) continue;

      const groupKey = `${cAlias}___${rNum.toUpperCase()}`;
      const cDoc = containerMap.get(cAlias);
      const sQty = parseInt(String(s.quantity || 0), 10) || 0;
      const sCbm = parseMetricNumber(s.volume);
      const sWeight = parseMetricNumber(s.weight);

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          container: cAlias,
          receipt: rNum,
          warehouse: s.warehouse || cDoc?.warehouse || 'China Warehouse',
          party: s.party || '',
          mainMarka: s.mainMarka || '',
          subMarka: s.subMarka || '',
          commodity: s.english || s.commodity || '',
          loadingDate: s.loadingDate || cDoc?.loadingDate || s.date || '',
          loadedQty: sQty,
          loadedCbm: sCbm,
          loadedWeight: sWeight,
          containerNumber: cDoc?.containerNumber || s.containerNumber || '',
          shippingLine: cDoc?.shippingLine || s.shippingLine || 'MSC',
          shipmentCount: 1,
          rates: s.rate ? [s.rate] : [],
          remarks: s.remarks ? [s.remarks] : [],
        });
      } else {
        const existing = groupedMap.get(groupKey)!;
        existing.loadedQty += sQty;
        existing.loadedCbm = Number((existing.loadedCbm + sCbm).toFixed(3));
        existing.loadedWeight = Number((existing.loadedWeight + sWeight).toFixed(2));
        existing.shipmentCount += 1;
        if (!existing.party && s.party) existing.party = s.party;
        if (!existing.mainMarka && s.mainMarka) existing.mainMarka = s.mainMarka;
        if (!existing.subMarka && s.subMarka) existing.subMarka = s.subMarka;
        if (s.rate && !existing.rates.includes(s.rate)) existing.rates.push(s.rate);
        if (s.remarks && !existing.remarks.includes(s.remarks)) existing.remarks.push(s.remarks);
      }
    }

    // 6. Evaluate discrepancies for every grouped shipment against Warehouse Receipt
    const allEvaluatedItems: any[] = [];
    const containerStatsMap = new Map<string, {
      totalItems: number;
      mismatchCount: number;
      matchedCount: number;
      receivedCartons: number;
      loadedCartons: number;
      receivedCbm: number;
      loadedCbm: number;
      receivedWeight: number;
      loadedWeight: number;
      categories: Record<string, number>;
    }>();

    let totalExcessCartons = 0;
    let totalShortageCartons = 0;
    let totalExcessCbm = 0;
    let totalShortageCbm = 0;
    let totalExcessWeight = 0;
    let totalShortageWeight = 0;
    let overallLoadedCartons = 0;
    let overallReceivedCartons = 0;
    let overallLoadedCbm = 0;
    let overallReceivedCbm = 0;
    let overallLoadedWeight = 0;
    let overallReceivedWeight = 0;
    const globalCategoryCounts: Record<string, number> = {};

    for (const [groupKey, item] of groupedMap.entries()) {
      const cleanR = item.receipt.toUpperCase().trim();
      const compoundKey = `${item.warehouse.toLowerCase().trim()}___${cleanR}`;
      const wh = whMap.get(compoundKey) || whMap.get(cleanR);

      const receivedQty = wh ? parseInt(String(wh.quantity || 0), 10) || 0 : 0;
      const receivedCbm = wh ? parseMetricNumber(wh.volume) : 0;
      const receivedWeight = wh ? parseMetricNumber(wh.weight) : 0;

      const evalResult: IExceptionEvaluation = evaluateMetricsMismatch(
        receivedQty,
        item.loadedQty,
        receivedCbm,
        item.loadedCbm,
        receivedWeight,
        item.loadedWeight
      );

      // Track container stats
      if (!containerStatsMap.has(item.container)) {
        containerStatsMap.set(item.container, {
          totalItems: 0,
          mismatchCount: 0,
          matchedCount: 0,
          receivedCartons: 0,
          loadedCartons: 0,
          receivedCbm: 0,
          loadedCbm: 0,
          receivedWeight: 0,
          loadedWeight: 0,
          categories: {},
        });
      }

      const cStats = containerStatsMap.get(item.container)!;
      cStats.totalItems += 1;
      cStats.receivedCartons += receivedQty;
      cStats.loadedCartons += item.loadedQty;
      cStats.receivedCbm = Number((cStats.receivedCbm + receivedCbm).toFixed(3));
      cStats.loadedCbm = Number((cStats.loadedCbm + item.loadedCbm).toFixed(3));
      cStats.receivedWeight = Number((cStats.receivedWeight + receivedWeight).toFixed(2));
      cStats.loadedWeight = Number((cStats.loadedWeight + item.loadedWeight).toFixed(2));

      overallReceivedCartons += receivedQty;
      overallLoadedCartons += item.loadedQty;
      overallReceivedCbm = Number((overallReceivedCbm + receivedCbm).toFixed(3));
      overallLoadedCbm = Number((overallLoadedCbm + item.loadedCbm).toFixed(3));
      overallReceivedWeight = Number((overallReceivedWeight + receivedWeight).toFixed(2));
      overallLoadedWeight = Number((overallLoadedWeight + item.loadedWeight).toFixed(2));

      // STRICT USER RULE: Exclude fully matched items; display only mismatches in exception report.
      // If fully matched, count in matched stats but EXCLUDE from Exception Report items!
      if (evalResult.isFullyMatched) {
        cStats.matchedCount += 1;
        continue;
      }

      // Mismatch detected!
      cStats.mismatchCount += 1;
      const catKey = evalResult.categoryGroup || 'Multi-Metric Mismatch';
      cStats.categories[catKey] = (cStats.categories[catKey] || 0) + 1;
      globalCategoryCounts[catKey] = (globalCategoryCounts[catKey] || 0) + 1;

      // Track aggregate diffs
      if (evalResult.carton.diff > 0) totalExcessCartons += evalResult.carton.diff;
      if (evalResult.carton.diff < 0) totalShortageCartons += Math.abs(evalResult.carton.diff);

      if (evalResult.cbm.diff > 0) totalExcessCbm = Number((totalExcessCbm + evalResult.cbm.diff).toFixed(3));
      if (evalResult.cbm.diff < 0) totalShortageCbm = Number((totalShortageCbm + Math.abs(evalResult.cbm.diff)).toFixed(3));

      if (evalResult.weight.diff > 0) totalExcessWeight = Number((totalExcessWeight + evalResult.weight.diff).toFixed(2));
      if (evalResult.weight.diff < 0) totalShortageWeight = Number((totalShortageWeight + Math.abs(evalResult.weight.diff)).toFixed(2));

      const cDoc = containerMap.get(item.container);

      allEvaluatedItems.push({
        id: groupKey,
        container: item.container,
        containerNumber: item.containerNumber || cDoc?.containerNumber || '',
        shippingLine: item.shippingLine || cDoc?.shippingLine || 'MSC',
        isFinalized: Boolean(cDoc?.isFinalized),
        planStatus: cDoc?.planStatus || (cDoc?.containerNumber ? 'Finalized' : 'Planning'),
        receipt: item.receipt,
        warehouse: item.warehouse || wh?.warehouse || 'China Warehouse',
        loadingDate: item.loadingDate || cDoc?.loadingDate || wh?.date || '',
        party: item.party || wh?.party || 'General Party',
        mainMarka: item.mainMarka || wh?.mainMarka || '—',
        subMarka: item.subMarka || wh?.subMarka || '—',
        commodity: item.commodity || wh?.english || wh?.commodity || 'General Goods',
        salesPerson: wh?.salesPerson || '',
        salesRate: wh?.salesRate || (item.rates.length > 0 ? item.rates[0] : ''),
        salesRemarks: wh?.salesRemarks || (item.remarks.length > 0 ? item.remarks[0] : ''),
        // Carton metric
        receivedCartons: evalResult.carton.received,
        loadedCartons: evalResult.carton.loaded,
        cartonDiff: evalResult.carton.diff,
        cartonStatus: evalResult.carton.status,
        isCartonMatched: evalResult.carton.isMatched,
        // CBM metric
        receivedCbm: evalResult.cbm.received,
        loadedCbm: evalResult.cbm.loaded,
        cbmDiff: evalResult.cbm.diff,
        cbmStatus: evalResult.cbm.status,
        isCbmMatched: evalResult.cbm.isMatched,
        // Weight metric
        receivedWeight: evalResult.weight.received,
        loadedWeight: evalResult.weight.loaded,
        weightDiff: evalResult.weight.diff,
        weightStatus: evalResult.weight.status,
        isWeightMatched: evalResult.weight.isMatched,
        // Category metadata
        category: evalResult.category,
        categoryLabel: evalResult.categoryLabel,
        categoryGroup: evalResult.categoryGroup,
        summary: evalResult.summary,
        hasDiscrepancy: true,
      });
    }

    // 7. Filter mismatch items by Category and Search Query
    let filteredItems = allEvaluatedItems;

    if (selectedCategory !== 'ALL') {
      filteredItems = filteredItems.filter(
        (i) => i.categoryGroup === selectedCategory || i.category === selectedCategory
      );
    }

    if (searchQuery) {
      filteredItems = filteredItems.filter((i) => {
        return (
          (i.receipt && i.receipt.toLowerCase().includes(searchQuery)) ||
          (i.container && i.container.toLowerCase().includes(searchQuery)) ||
          (i.containerNumber && i.containerNumber.toLowerCase().includes(searchQuery)) ||
          (i.party && i.party.toLowerCase().includes(searchQuery)) ||
          (i.mainMarka && i.mainMarka.toLowerCase().includes(searchQuery)) ||
          (i.subMarka && i.subMarka.toLowerCase().includes(searchQuery)) ||
          (i.commodity && i.commodity.toLowerCase().includes(searchQuery)) ||
          (i.salesPerson && i.salesPerson.toLowerCase().includes(searchQuery))
        );
      });
    }

    // 8. Build container summary list
    const containerSummaries = Array.from(containerStatsMap.entries()).map(([cAlias, stats]) => {
      const cDoc = containerMap.get(cAlias);
      const netCtn = stats.loadedCartons - stats.receivedCartons;
      const netCbm = Number((stats.loadedCbm - stats.receivedCbm).toFixed(3));
      const netWeight = Number((stats.loadedWeight - stats.receivedWeight).toFixed(2));

      return {
        container: cAlias,
        containerNumber: cDoc?.containerNumber || '',
        shippingLine: cDoc?.shippingLine || 'MSC',
        warehouse: cDoc?.warehouse || 'China Warehouse',
        loadingDate: cDoc?.loadingDate || '',
        eta: cDoc?.destinationDate || cDoc?.eta || 'Pending',
        planStatus: cDoc?.planStatus || (cDoc?.containerNumber ? 'Finalized' : 'Planning'),
        isFinalized: Boolean(cDoc?.isFinalized),
        isDelivered: Boolean(cDoc?.isDelivered),
        totalItems: stats.totalItems,
        mismatchCount: stats.mismatchCount,
        matchedCount: stats.matchedCount,
        receivedCartons: stats.receivedCartons,
        loadedCartons: stats.loadedCartons,
        netCartonDiff: netCtn,
        receivedCbm: stats.receivedCbm,
        loadedCbm: stats.loadedCbm,
        netCbmDiff: netCbm,
        receivedWeight: stats.receivedWeight,
        loadedWeight: stats.loadedWeight,
        netWeightDiff: netWeight,
        hasDiscrepancies: stats.mismatchCount > 0,
        categories: stats.categories,
      };
    });

    // Sort container summaries so containers with mismatches appear on top
    containerSummaries.sort((a, b) => b.mismatchCount - a.mismatchCount);

    // List of available containers for dropdown
    const availableContainers = containerDocs.map((c) => {
      const stats = containerStatsMap.get(c.container.toUpperCase().trim());
      return {
        container: c.container,
        containerNumber: c.containerNumber || '',
        mismatchCount: stats?.mismatchCount || 0,
        matchedCount: stats?.matchedCount || 0,
        isFinalized: Boolean(c.isFinalized),
        planStatus: c.planStatus || 'Planning',
        loadingDate: c.loadingDate || '',
        shippingLine: c.shippingLine || 'MSC',
      };
    });

    // Available warehouses
    const availableWarehouses = Array.from(
      new Set(
        [
          ...containerDocs.map((c) => c.warehouse).filter(Boolean),
          ...shipments.map((s) => s.warehouse).filter(Boolean),
        ]
      )
    );

    const netCartonDiff = overallLoadedCartons - overallReceivedCartons;
    const netCbmDiff = Number((overallLoadedCbm - overallReceivedCbm).toFixed(3));
    const netWeightDiff = Number((overallLoadedWeight - overallReceivedWeight).toFixed(2));

    return NextResponse.json({
      success: true,
      summary: {
        totalContainers: containerDocs.length,
        containersWithMismatches: containerSummaries.filter((c) => c.mismatchCount > 0).length,
        totalMismatches: allEvaluatedItems.length,
        filteredMismatches: filteredItems.length,
        totalMatched: Array.from(containerStatsMap.values()).reduce((sum, s) => sum + s.matchedCount, 0),
        overallLoadedCartons,
        overallReceivedCartons,
        netCartonDiff,
        overallLoadedCbm,
        overallReceivedCbm,
        netCbmDiff,
        overallLoadedWeight,
        overallReceivedWeight,
        netWeightDiff,
        excessCartons: totalExcessCartons,
        shortageCartons: totalShortageCartons,
        excessCbm: totalExcessCbm,
        shortageCbm: totalShortageCbm,
        excessWeight: totalExcessWeight,
        shortageWeight: totalShortageWeight,
        categoryCounts: globalCategoryCounts,
      },
      containerSummaries,
      items: filteredItems,
      availableContainers,
      availableWarehouses,
    });
  } catch (error: any) {
    console.error('Exception Report API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate Exception Report' },
      { status: 500 }
    );
  }
}
