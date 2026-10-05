import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import { parseReceiptDate, getEtaBucket, formatGlobalDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

function calculateDaysRemaining(dateStr?: string | null): number | null {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'Pending' || dateStr === '—') {
    return null;
  }
  const targetDate = parseReceiptDate(dateStr) || new Date(dateStr);
  if (!targetDate || isNaN(targetDate.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const isStaffOrAdmin = isStaffOrAdminAuthenticated(req);

    // 1. Fetch saved records from dedicated Container collection
    const projection: any = {
      jsonCargoData: 0,
      __v: 0,
    };
    if (!isStaffOrAdmin) {
      projection.containerNumber = 0; // Strictly mask for public visitors
    }

    const storedContainers = await Container.find({}, projection)
      .sort({ container: 1 })
      .lean();

    // Map by alias for quick lookup/merge
    const containerMap = new Map<string, any>();
    for (const c of storedContainers) {
      containerMap.set(c.container.toUpperCase(), c);
    }

    // 2. Aggregate live cargo metrics (CTN cartons, weight KGS, volume CBM, item count) per container from Shipment
    const distinctShipmentContainers = await Shipment.aggregate([
      {
        $match: {
          container: { $exists: true, $nin: ['', 'Default', null] },
        },
      },
      {
        $group: {
          _id: '$container',
          items: {
            $push: {
              quantity: '$quantity',
              weight: '$weight',
              volume: '$volume',
            },
          },
          shippedFrom: { $first: '$shippedFrom' },
          shippedTo: { $first: '$shippedTo' },
          currentLocation: { $first: '$currentLocation' },
          startDate: { $first: '$startDate' },
          destinationDate: { $first: '$destinationDate' },
          eta: { $first: '$eta' },
          rawEta: { $first: '$rawEta' },
          status: { $first: '$status' },
          vesselName: { $first: '$vesselName' },
          voyageNumber: { $first: '$voyageNumber' },
          lastApiSync: { $first: '$lastApiSync' },
          etaUpdatedAt: { $first: '$etaUpdatedAt' },
          updatedAt: { $first: '$updatedAt' },
          shipmentCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    for (const sc of distinctShipmentContainers) {
      let cartons = 0;
      let weight = 0;
      let volume = 0;
      if (Array.isArray(sc.items)) {
        for (const it of sc.items) {
          const q = parseInt(String(it.quantity || 0).replace(/[^\d]/g, ''), 10) || 0;
          const w = parseFloat(String(it.weight || 0).replace(/[^\d.]/g, '')) || 0;
          const v = parseFloat(String(it.volume || 0).replace(/[^\d.]/g, '')) || 0;
          cartons += q;
          weight += w;
          volume += v;
        }
      }
      const key = String(sc._id).toUpperCase().trim();
      const roundedWeight = Math.round(weight * 100) / 100;
      const roundedVolume = Math.round(volume * 1000) / 1000;

      if (!containerMap.has(key)) {
        containerMap.set(key, {
          container: sc._id,
          shippedFrom: sc.shippedFrom || 'Ningbo / Shanghai, China',
          shippedTo: sc.shippedTo || 'Nhava Sheva / Mundra, India',
          currentLocation: sc.currentLocation || sc.status || 'In Transit',
          startDate: sc.startDate || '',
          destinationDate: sc.destinationDate || sc.eta || '',
          eta: sc.eta || 'N/A',
          rawEta: sc.rawEta || '',
          status: sc.status || 'Pending',
          vesselName: sc.vesselName || '',
          voyageNumber: sc.voyageNumber || '',
          shipmentCount: sc.shipmentCount || 0,
          totalCartons: cartons,
          totalWeight: roundedWeight,
          totalVolume: roundedVolume,
          lastApiSync: sc.lastApiSync || null,
          etaUpdatedAt: sc.etaUpdatedAt || null,
          updatedAt: sc.updatedAt || null,
        });
      } else {
        const existing = containerMap.get(key);
        existing.totalCartons = cartons;
        existing.totalWeight = roundedWeight;
        existing.totalVolume = roundedVolume;
        existing.shipmentCount = sc.shipmentCount || existing.shipmentCount || 0;
        if (!existing.rawEta && sc.rawEta) existing.rawEta = sc.rawEta;
        if (!existing.etaUpdatedAt && sc.etaUpdatedAt) existing.etaUpdatedAt = sc.etaUpdatedAt;
      }
    }

    // 3. Format clean output list with strict privacy enforcement for public visitors
    const containers = Array.from(containerMap.values()).map((c) => {
      const isMappedWithActual = Boolean(
        c.containerNumber &&
          c.containerNumber.trim().length > 0 &&
          c.containerNumber.trim().toLowerCase() !== c.container.trim().toLowerCase()
      );

      const rawPortDate = (c.rawEta && c.rawEta !== 'N/A' && c.rawEta !== 'Pending' && c.rawEta !== '—') ? c.rawEta : '';
      const portDate = rawPortDate ? (formatGlobalDate(rawPortDate) || rawPortDate) : undefined;

      const effectiveGraceDate = c.destinationDate || c.eta || '';
      // Two arrival dates: Port Date (vessel arrival at port) and ETA Date (destination ETA).
      // DO NOT add three days or any buffer: show the actual ETA date directly.
      const rawActualEta =
        effectiveGraceDate && effectiveGraceDate !== 'Pending' && effectiveGraceDate !== 'N/A'
          ? effectiveGraceDate
          : (c.eta && c.eta !== 'N/A' && c.eta !== 'Pending')
          ? c.eta
          : rawPortDate || 'Pending';

      const publicEtaDate = rawActualEta !== 'Pending' ? (formatGlobalDate(rawActualEta) || rawActualEta) : 'Pending';

      const destinationDate = isStaffOrAdmin
        ? (effectiveGraceDate || 'Pending')
        : publicEtaDate;

      const isDelivered = Boolean(
        c.isDelivered ||
          (c.deliveryDate && c.deliveryDate.trim() && c.deliveryDate !== '—' && c.deliveryDate !== 'N/A' && c.deliveryDate !== 'In Transit') ||
          (c.status && c.status.toLowerCase().trim() === 'delivered')
      );

      // Days remaining calculated based on destination ETA date, fallback to rawEta
      const targetEtaForDays = (isStaffOrAdmin ? effectiveGraceDate : publicEtaDate) || c.rawEta || '';
      const daysRemaining = calculateDaysRemaining(targetEtaForDays);
      const actualDaysRemaining = calculateDaysRemaining(c.rawEta);
      const etaBucket = getEtaBucket(daysRemaining, isDelivered);

      const hasValidEta = destinationDate && destinationDate !== 'N/A' && destinationDate !== 'Pending';
      const rawEtaUpdated = c.etaUpdatedAt || c.lastApiSync || (hasValidEta ? c.updatedAt : null);
      const etaUpdatedAt = rawEtaUpdated ? new Date(rawEtaUpdated).toISOString() : null;

      return {
        container: c.container, // Public alias (e.g. "USI-01")
        containerNumber: isStaffOrAdmin ? (c.containerNumber || '') : undefined,
        isMappedWithActual,
        shippingLine: isStaffOrAdmin ? (c.shippingLine || 'MSC') : undefined,
        warehouse: c.warehouse || 'China Warehouse',
        shippedFrom: c.shippedFrom || 'Ningbo / Shanghai, China',
        shippedTo: c.shippedTo || 'Nhava Sheva / Mundra, India',
        currentLocation: isStaffOrAdmin ? (c.currentLocation || c.status || 'In Transit') : 'Scheduled Delivery',
        startDate: isStaffOrAdmin ? (c.startDate || c.loadingDate || '') : undefined,
        loadingDate: isStaffOrAdmin ? (c.loadingDate || c.startDate || '') : undefined,
        portDate: portDate,
        destinationDate: destinationDate,
        eta: destinationDate,
        rawEta: isStaffOrAdmin ? (c.rawEta || '') : undefined,
        etaBufferDays: c.etaBufferDays ?? 7,
        status: isStaffOrAdmin ? (c.status || 'In Transit') : (isDelivered ? 'Delivered' : 'In Transit'),
        deliveryDate: c.deliveryDate || '',
        daysToDeliver: c.daysToDeliver ?? null,
        isDelivered,
        daysRemaining,
        actualDaysRemaining: isStaffOrAdmin ? actualDaysRemaining : undefined,
        etaBucket,
        vesselName: isStaffOrAdmin ? (c.vesselName || '') : undefined,
        shipmentCount: c.shipmentCount || 0,
        totalCartons: c.totalCartons || 0,
        totalWeight: c.totalWeight || 0,
        totalVolume: c.totalVolume || 0,
        apiCallCount: c.apiCallCount || 0,
        lastApiSync: isStaffOrAdmin ? (c.lastApiSync ? new Date(c.lastApiSync).toISOString() : null) : undefined,
        etaUpdatedAt: isStaffOrAdmin ? etaUpdatedAt : undefined,
      };
    });

    // Sort alphabetically by container alias
    containers.sort((a, b) => a.container.localeCompare(b.container, undefined, { numeric: true }));

    return NextResponse.json({
      success: true,
      count: containers.length,
      containers,
    });
  } catch (error: any) {
    console.error('Error fetching container list:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch container directory' },
      { status: 500 }
    );
  }
}
