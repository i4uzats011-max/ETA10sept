import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isOperationsHeadAuthenticated, isStaffOrAdminAuthenticated } from '@/lib/auth';
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
  // Accessible by Operations Head, Developer, Admin, and Staff
  if (!isOperationsHeadAuthenticated(req) && !isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const containerQuery = searchParams.get('container')?.trim();

    // If single container details requested (for Container-Wise Drill-down like Sales Head)
    if (containerQuery) {
      const escaped = containerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cRegex = new RegExp(`^${escaped}$`, 'i');

      const containerDoc: any = await Container.findOne({
        $or: [{ container: cRegex }, { containerNumber: cRegex }]
      }).lean();

      // Fetch all shipments inside this container
      const shipments: any[] = await Shipment.find({
        $or: [{ container: cRegex }, { containerNumber: cRegex }]
      }).sort({ date: -1 }).lean();

      // Fetch warehouse receipts for matched receipt numbers
      const receiptNos = Array.from(new Set(shipments.map(s => s.receipt).filter(Boolean)));
      const whReceipts: any[] = receiptNos.length > 0
        ? await WarehouseReceipt.find({ receipt: { $in: receiptNos } }).lean()
        : [];

      const whMap = new Map<string, any>();
      whReceipts.forEach(w => {
        if (w.receipt) whMap.set(String(w.receipt).toLowerCase().trim(), w);
      });

      const items = shipments.map((s, idx) => {
        const wh = whMap.get(String(s.receipt || '').toLowerCase().trim());
        return {
          idx: idx + 1,
          receipt: s.receipt || wh?.receipt || '—',
          date: s.date || wh?.date || '—',
          warehouse: s.warehouse || wh?.warehouse || '—',
          container: s.container || containerDoc?.container || containerQuery,
          containerNumber: s.containerNumber || containerDoc?.containerNumber || '',
          mainMarka: s.mainMarka || wh?.mainMarka || '',
          subMarka: s.subMarka || wh?.subMarka || '',
          party: s.party || wh?.party || '',
          commodity: s.english || s.commodity || wh?.english || wh?.commodity || wh?.chinese || '—',
          quantity: s.quantity || wh?.quantity || 0,
          weight: s.weight || wh?.weight || '0',
          volume: s.volume || wh?.volume || '0',
          rate: wh?.rate || '—',
          salesPerson: wh?.salesPerson || '—',
          salesRemarks: wh?.salesRemarks || wh?.remarks || '—',
          status: s.status || wh?.status || 'In Transit',
        };
      });

      return NextResponse.json({
        success: true,
        container: containerDoc?.container || containerQuery,
        containerDetails: containerDoc || null,
        items,
        totalItems: items.length
      });
    }

    // Default: Fetch all containers with full fleet metrics & remarks
    const storedContainers = await Container.find({})
      .sort({ container: 1 })
      .lean();

    const containerMap = new Map<string, any>();
    for (const c of storedContainers) {
      containerMap.set(c.container.toUpperCase(), c);
    }

    // Aggregate cargo metrics from Shipment
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
          containerRemarks: { $first: '$containerRemarks' },
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
          status: sc.status || 'In Transit',
          vesselName: sc.vesselName || '',
          voyageNumber: sc.voyageNumber || '',
          shipmentCount: sc.shipmentCount || 0,
          totalCartons: cartons,
          totalWeight: roundedWeight,
          totalVolume: roundedVolume,
          remarks: sc.containerRemarks || [],
        });
      } else {
        const existing = containerMap.get(key);
        existing.totalCartons = cartons;
        existing.totalWeight = roundedWeight;
        existing.totalVolume = roundedVolume;
        existing.shipmentCount = sc.shipmentCount || existing.shipmentCount || 0;
        if (!existing.rawEta && sc.rawEta) existing.rawEta = sc.rawEta;
        if ((!existing.remarks || existing.remarks.length === 0) && sc.containerRemarks) {
          existing.remarks = sc.containerRemarks;
        }
      }
    }

    const containers = Array.from(containerMap.values()).map((c) => {
      const rawPortDate = (c.rawEta && c.rawEta !== 'N/A' && c.rawEta !== 'Pending' && c.rawEta !== '—')
        ? c.rawEta
        : (c.portDate || '');
      const portDate = rawPortDate ? (formatGlobalDate(rawPortDate) || rawPortDate) : '—';

      const effectiveEta = c.destinationDate || c.eta || '';
      const etaDisplay = effectiveEta && effectiveEta !== 'Pending' && effectiveEta !== 'N/A'
        ? (formatGlobalDate(effectiveEta) || effectiveEta)
        : (rawPortDate ? (formatGlobalDate(rawPortDate) || rawPortDate) : 'Pending');

      const isDelivered = Boolean(
        c.isDelivered ||
        (c.deliveryDate && c.deliveryDate.trim() && c.deliveryDate !== '—' && c.deliveryDate !== 'N/A') ||
        (c.status && c.status.toLowerCase().trim() === 'delivered')
      );

      const daysRemaining = calculateDaysRemaining(effectiveEta || c.rawEta || '');
      const etaBucket = getEtaBucket(daysRemaining, isDelivered);

      // Extract Chronological Remarks & Latest Remark ("SHOW LAST STATUS")
      const remarksList = Array.isArray(c.remarks) ? c.remarks : [];
      const latestRemark = remarksList.length > 0 ? remarksList[remarksList.length - 1] : null;

      return {
        container: c.container,
        containerNumber: c.containerNumber || '—',
        blNumber: c.blNumber || '—',
        shippingLine: c.shippingLine || 'MSC',
        status: isDelivered ? 'Delivered' : (c.status || 'In Transit'),
        portName: c.shippedTo || c.shippedFrom || 'Nhava Sheva / Mundra, India',
        shippedFrom: c.shippedFrom || 'China Port',
        shippedTo: c.shippedTo || 'India Port',
        destination: c.shippedTo || 'Nhava Sheva / Mundra, India',
        portDate: portDate,
        eta: etaDisplay,
        rawEta: c.rawEta || '',
        loadingDate: c.loadingDate || c.startDate || '—',
        deliveryDate: c.deliveryDate || '',
        isDelivered,
        daysRemaining,
        etaBucket,
        latestRemark: latestRemark ? {
          date: latestRemark.date || '',
          remarks: latestRemark.remarks || '',
          createdBy: latestRemark.createdBy || 'Admin',
          createdAt: latestRemark.createdAt || null
        } : null,
        remarks: remarksList.map((r: any) => ({
          date: r.date || '',
          remarks: r.remarks || '',
          createdBy: r.createdBy || 'Admin',
          createdAt: r.createdAt || null
        })),
        totalCartons: c.totalCartons || c.totalQuantity || 0,
        totalVolume: c.totalVolume || '0',
        totalWeight: c.totalWeight || '0',
        shipmentCount: c.shipmentCount || 0,
        vesselName: c.vesselName || '',
        voyageNumber: c.voyageNumber || '',
        warehouse: c.warehouse || 'China Warehouse'
      };
    });

    // Sort alphabetically by container name
    containers.sort((a, b) => a.container.localeCompare(b.container, undefined, { numeric: true }));

    return NextResponse.json({
      success: true,
      count: containers.length,
      containers,
    });
  } catch (error: any) {
    console.error('Error fetching operations containers:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
