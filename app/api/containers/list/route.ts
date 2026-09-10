import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function calculateDaysRemaining(dateStr?: string | null): number | null {
  if (!dateStr || dateStr === 'N/A' || isNaN(new Date(dateStr).getTime())) {
    return null;
  }
  const targetDate = new Date(dateStr);
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

    // 2. Also aggregate distinct container aliases from Shipment to guarantee newly uploaded containers appear immediately
    const distinctShipmentContainers = await Shipment.aggregate([
      {
        $match: {
          container: { $exists: true, $nin: ['', 'Default', null] },
        },
      },
      {
        $group: {
          _id: '$container',
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
          shipmentCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Merge shipment containers if not yet in Container collection
    for (const sc of distinctShipmentContainers) {
      const key = String(sc._id).toUpperCase();
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
          lastApiSync: sc.lastApiSync || null,
        });
      } else {
        // Update shipmentCount from live shipments if zero
        const existing = containerMap.get(key);
        if (!existing.shipmentCount || existing.shipmentCount === 0) {
          existing.shipmentCount = sc.shipmentCount;
        }
        if (!existing.rawEta && sc.rawEta) {
          existing.rawEta = sc.rawEta;
        }
      }
    }

    // 3. Format clean output list with strict privacy enforcement for public visitors
    const containers = Array.from(containerMap.values()).map((c) => {
      const isMappedWithActual = Boolean(c.containerNumber && c.containerNumber.trim().length > 0 && c.containerNumber.trim().toLowerCase() !== c.container.trim().toLowerCase());
      const destinationDate = isMappedWithActual ? (c.destinationDate || c.eta || 'Pending') : 'Pending';
      const daysRemaining = calculateDaysRemaining(destinationDate);

      return {
        container: c.container, // Public alias (e.g. "USI-01")
        containerNumber: isStaffOrAdmin ? (c.containerNumber || '') : undefined,
        isMappedWithActual,
        shippingLine: isStaffOrAdmin ? (c.shippingLine || 'MSC') : undefined,
        warehouse: c.warehouse || 'China Warehouse',
        shippedFrom: c.shippedFrom || 'Ningbo / Shanghai, China',
        shippedTo: c.shippedTo || 'Nhava Sheva / Mundra, India',
        currentLocation: isStaffOrAdmin ? (c.currentLocation || c.status || 'In Transit') : 'Scheduled Delivery',
        startDate: c.startDate || '',
        destinationDate: destinationDate,
        eta: destinationDate,
        rawEta: isStaffOrAdmin ? (c.rawEta || '') : undefined,
        status: isStaffOrAdmin ? (c.status || 'In Transit') : (c.status === 'Delivered' ? 'Delivered' : 'In Transit'),
        deliveryDate: c.deliveryDate || '',
        daysToDeliver: c.daysToDeliver ?? null,
        isDelivered: Boolean(c.isDelivered || (c.status && c.status.toLowerCase().includes('deliver'))),
        daysRemaining: daysRemaining,
        vesselName: isStaffOrAdmin ? (c.vesselName || '') : undefined,
        voyageNumber: isStaffOrAdmin ? (c.voyageNumber || '') : undefined,
        shipmentCount: c.shipmentCount || 0,
        apiCalled: Boolean(c.apiCalled || c.lastApiSync),
        apiCallCount: c.apiCallCount || 0,
        lastApiSync: isStaffOrAdmin ? (c.lastApiSync ? new Date(c.lastApiSync).toISOString() : null) : undefined,
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
