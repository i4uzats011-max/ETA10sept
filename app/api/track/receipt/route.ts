import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { translateToEnglish } from '@/lib/translate';
import { formatGlobalDate } from '@/lib/dateUtils';
import { calculateCommittedEta, getContainerForReceiptDate } from '@/lib/committedEtaHelper';

export const dynamic = 'force-dynamic';

function formatVolumeWithDecimals(vol: any): string {
  if (vol === null || vol === undefined || vol === '' || vol === 'N/A') return 'N/A';
  const clean = String(vol).replace(/cbm|m3/gi, '').trim();
  const n = parseFloat(clean);
  if (!isNaN(n)) {
    if (clean.includes('.')) {
      return clean;
    }
    return n.toFixed(2);
  }
  return clean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const receiptQuery = searchParams.get('receipt')?.trim();

  if (!receiptQuery) {
    return NextResponse.json({ error: 'Receipt parameter is required' }, { status: 400 });
  }

  const cartonsParam = searchParams.get('cartons')?.trim();

  try {
    await connectToDatabase();

    // Fetch all WarehouseReceipt documents matching this receipt number
    const matchingWhItems: any[] = await WarehouseReceipt.find({
      receipt: { $regex: new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).sort({ createdAt: -1 }).lean();

    const distinctWhNames = Array.from(new Set(matchingWhItems.map((w) => (w.warehouse || 'China Warehouse').trim())));

    let whItem: any = null;
    let selectedWarehouse: string = '';

    if (distinctWhNames.length > 1) {
      // Duplicate receipt across warehouses!
      // Must check cartons against China Warehouse Receipt (w.quantity)
      if (!cartonsParam) {
        return NextResponse.json({
          success: false,
          requiresCartonVerification: true,
          receipt: receiptQuery,
          warehouseCount: distinctWhNames.length,
          message: `Receipt #${receiptQuery} was found in multiple China warehouses. Please enter the number of cartons (CTN) printed on your warehouse receipt to verify your cargo.`,
        });
      }

      const parsedCartons = parseInt(cartonsParam, 10);
      if (isNaN(parsedCartons) || parsedCartons <= 0) {
        return NextResponse.json(
          { error: 'Please enter a valid positive carton count to verify your cargo.' },
          { status: 400 }
        );
      }

      // Match against China Warehouse Receipt quantity (pieces / carton count)
      whItem = matchingWhItems.find((w) => Number(w.quantity) === parsedCartons);

      if (!whItem) {
        return NextResponse.json(
          {
            error: `Carton count (${parsedCartons} CTN) does not match any China warehouse receipt for #${receiptQuery}. Please check your warehouse receipt slip.`,
            requiresCartonVerification: true,
            receipt: receiptQuery,
          },
          { status: 400 }
        );
      }

      selectedWarehouse = whItem.warehouse;
    } else {
      whItem = matchingWhItems[0] || null;
      if (whItem) selectedWarehouse = whItem.warehouse;
    }

    if (whItem) {
      whItem = {
        ...whItem,
        deliveryDate: whItem.deliveryDate ? (formatGlobalDate(whItem.deliveryDate) || whItem.deliveryDate) : '',
        isDelivered: Boolean(whItem.isDelivered || (whItem.status && whItem.status.toLowerCase().includes('deliver'))),
      };
    }

    // Now query shipments strictly for this specific warehouse / receipt
    let shipmentQuery: any;
    if (whItem) {
      shipmentQuery = {
        $or: [
          { receiptId: whItem._id },
          {
            receipt: { $regex: new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            warehouse: new RegExp(`^${(selectedWarehouse || whItem.warehouse || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          },
        ],
      };
    } else {
      shipmentQuery = {
        receipt: { $regex: new RegExp(`^${receiptQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      };
    }

    const rawShipments: any[] = await Shipment.find(shipmentQuery).sort({ uploadedAt: -1 }).lean();

    if ((!rawShipments || rawShipments.length === 0) && !whItem) {
      return NextResponse.json(
        { error: `No cargo record found for receipt number '${receiptQuery}'` },
        { status: 404 }
      );
    }

    if (!rawShipments || rawShipments.length === 0) {
      const whDate = whItem.date || whItem.createdAt;
      const fallbackEta = calculateCommittedEta(whDate);
      const fallbackFormattedEta = formatGlobalDate(fallbackEta) || fallbackEta;

      const dummyShipment = {
        id: String(whItem._id),
        receipt: receiptQuery,
        party: whItem.party || 'General Party',
        container: '', // User rule: if container not in db, do not show container no
        status: whItem.isDelivered ? 'Delivered' : 'In Transit',
        portDate: null,
        dateOfDelivery: whItem.isDelivered ? (whItem.deliveryDate || fallbackFormattedEta) : fallbackFormattedEta,
        expectedDeliveryDate: fallbackFormattedEta,
        eta: fallbackFormattedEta,
        deliveryDate: whItem.deliveryDate || '',
        isDelivered: Boolean(whItem.isDelivered),
        daysToDeliver: null,
        etaUpdatedAt: null,
        english: translateToEnglish(whItem.english || whItem.commodity || whItem.chinese),
        commodity: translateToEnglish(whItem.commodity || whItem.english || whItem.chinese),
        quantity: String(whItem.quantity || '0'),
        cartons: String(whItem.quantity || '0'),
        packets: String(whItem.quantity || '0'),
        originalTotalQuantity: whItem.quantity,
        isSplit: false,
        splitIndex: 1,
        weight: whItem.weight || 'N/A',
        volume: formatVolumeWithDecimals(whItem.volume),
        date: undefined,
        warehouse: whItem.warehouse || 'China Warehouse',
        warehouseEntry: undefined,
        packaging: whItem.packaging || 'N/A',
        mainMarka: whItem.mainMarka || '',
        subMarka: whItem.subMarka || '',
        items: whItem.items || [],
      };

      const sanitizedWhItem = { ...whItem };
      delete sanitizedWhItem.date;
      delete sanitizedWhItem.receiptDate;
      delete sanitizedWhItem.warehouseEntry;

      return NextResponse.json({
        success: true,
        count: 1,
        receipt: receiptQuery,
        data: dummyShipment,
        shipments: [dummyShipment],
        warehouseReceipt: sanitizedWhItem,
        status: 'In Transit',
      });
    }

    // Collect all container aliases to resolve confirmed ETA from Container fleet
    const containerAliases = Array.from(new Set(rawShipments.map((s) => s.container).filter(Boolean)));
    const containerDocs: any[] = await Container.find({
      $or: containerAliases.map((c) => ({
        container: new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-_\\s]?')}$`, 'i'),
      })),
    }).lean();

    const containerEtaMap = new Map<string, string>();
    containerDocs.forEach((c: any) => {
      const eta = (c.destinationDate && c.destinationDate !== 'N/A') ? c.destinationDate : c.eta;
      if (eta && eta !== 'N/A' && eta !== 'Pending') {
        containerEtaMap.set(c.container.toLowerCase().trim(), eta);
      }
    });

    // STRICT DATA MASKING & ENGLISH ONLY TRANSLATION: Omit containerNumber; Translate commodities to English ONLY
    const publicCargoDetails = await Promise.all(rawShipments.map(async (shipment) => {
      const cClean = (shipment.container || '').toLowerCase().trim();
      const directEta = containerEtaMap.get(cClean);
      const fallbackDoc = containerDocs.find((cd: any) =>
        cd.container.toLowerCase().replace(/[-\s]/g, '') === cClean.replace(/[-\s]/g, '')
      );
      const containerEta = directEta || fallbackDoc?.destinationDate || fallbackDoc?.eta || '';
      const rawCarrierEta = shipment.rawEta || fallbackDoc?.rawEta;

      const receiptDate = shipment.date || whItem?.date || shipment.createdAt || whItem?.createdAt;
      const committedFallbackEta = calculateCommittedEta(receiptDate);
      const fallbackContainer = await getContainerForReceiptDate(receiptDate);

      const resolvedEta = (shipment.eta && shipment.eta !== 'N/A' && shipment.eta !== 'Pending')
        ? shipment.eta
        : (containerEta || shipment.eta || committedFallbackEta);

      const rawPortDate = rawCarrierEta || shipment.rawEta || fallbackDoc?.rawEta || '';
      const formattedPortDate =
        rawPortDate && rawPortDate !== 'N/A' && rawPortDate !== 'Pending' && rawPortDate !== '—'
          ? (formatGlobalDate(rawPortDate) || rawPortDate)
          : '';

      const rawActualEta =
        (fallbackDoc?.destinationDate && fallbackDoc.destinationDate !== 'N/A' && fallbackDoc.destinationDate !== 'Pending')
          ? fallbackDoc.destinationDate
          : (resolvedEta && resolvedEta !== 'N/A' && resolvedEta !== 'Pending')
          ? resolvedEta
          : (shipment.destinationDate && shipment.destinationDate !== 'N/A' && shipment.destinationDate !== 'Pending')
          ? shipment.destinationDate
          : (rawPortDate && rawPortDate !== 'N/A' && rawPortDate !== 'Pending')
          ? rawPortDate
          : committedFallbackEta;

      const publicDeliveryDate = rawActualEta !== 'Pending' ? (formatGlobalDate(rawActualEta) || rawActualEta) : (formatGlobalDate(committedFallbackEta) || committedFallbackEta);

      const rawEtaUpdated =
        fallbackDoc?.etaUpdatedAt ||
        shipment.etaUpdatedAt ||
        fallbackDoc?.lastApiSync ||
        shipment.lastApiSync ||
        (publicDeliveryDate !== 'Pending'
          ? fallbackDoc?.updatedAt || shipment.updatedAt || shipment.uploadedAt
          : null);
      const etaUpdatedAt = rawEtaUpdated ? new Date(rawEtaUpdated).toISOString() : null;

      const isItemDelivered = Boolean(
        shipment.isDelivered ||
        (shipment.status && shipment.status.toLowerCase().includes('deliver')) ||
        fallbackDoc?.isDelivered ||
        (fallbackDoc?.status && fallbackDoc?.status.toLowerCase() === 'delivered') ||
        (shipment.deliveryDate && shipment.deliveryDate.trim() !== '') ||
        (fallbackDoc?.deliveryDate && fallbackDoc?.deliveryDate.trim() !== '')
      );

      const rawDeliveryDate = shipment.deliveryDate || fallbackDoc?.deliveryDate || whItem?.deliveryDate || '';
      const formattedDeliveryDate = rawDeliveryDate ? (formatGlobalDate(rawDeliveryDate) || rawDeliveryDate) : '';

      const hasRealContainer = Boolean(
        shipment.container &&
        shipment.container !== 'Unassigned' &&
        shipment.container !== 'Pending Allocation' &&
        shipment.container !== '-' &&
        !shipment.container.toLowerCase().includes('pending')
      );
      const finalContainer = hasRealContainer ? shipment.container : '';

      return {
        id: shipment._id,
        receipt: shipment.receipt,
        party: shipment.party || whItem?.party || 'General Party',
        container: finalContainer,
        status: isItemDelivered ? 'Delivered' : (shipment.status && shipment.status !== 'Planning' ? shipment.status : 'In Transit'),
        portDate: formattedPortDate || null,
        dateOfDelivery: isItemDelivered ? formattedDeliveryDate : publicDeliveryDate,
        expectedDeliveryDate: publicDeliveryDate,
        eta: publicDeliveryDate,
        deliveryDate: formattedDeliveryDate,
        isDelivered: isItemDelivered,
        daysToDeliver: shipment.daysToDeliver ?? fallbackDoc?.daysToDeliver ?? null,
        etaUpdatedAt: null,
        english: translateToEnglish(shipment.english || shipment.commodity || shipment.chinese),
        commodity: translateToEnglish(shipment.commodity || shipment.english || shipment.chinese),
        quantity: shipment.quantity || '0',
        cartons: shipment.quantity || '0',
        packets: shipment.quantity || '0',
        originalTotalQuantity: shipment.originalTotalQuantity || whItem?.quantity || shipment.quantity,
        isSplit: Boolean(shipment.isSplit),
        splitIndex: shipment.splitIndex || 1,
        weight: shipment.weight || 'N/A',
        volume: formatVolumeWithDecimals(shipment.volume),
        date: undefined,
        warehouse: shipment.warehouse || whItem?.warehouse || 'China Warehouse',
        warehouseEntry: undefined,
        packaging: shipment.packaging || 'N/A',
        mainMarka: shipment.mainMarka || '',
        subMarka: shipment.subMarka || '',
        items: whItem?.items || [],
      };
    }));

    const sanitizedWhItem = whItem ? { ...whItem } : null;
    if (sanitizedWhItem) {
      delete sanitizedWhItem.date;
      delete sanitizedWhItem.receiptDate;
      delete sanitizedWhItem.warehouseEntry;
      delete sanitizedWhItem.createdAt;
      delete sanitizedWhItem.uploadedAt;
      delete sanitizedWhItem.etaUpdatedAt;
      delete sanitizedWhItem.lastApiSync;
      if (Array.isArray(sanitizedWhItem.items)) {
        sanitizedWhItem.items = sanitizedWhItem.items.map((it: any) => {
          const cleanItem = { ...it };
          delete cleanItem.date;
          delete cleanItem.receiptDate;
          return cleanItem;
        });
      }
    }

    const payload = {
      success: true,
      count: publicCargoDetails.length,
      receipt: receiptQuery,
      // Provide both array `shipments` and primary `data` object for backwards compatibility
      data: publicCargoDetails[0],
      shipments: publicCargoDetails,
      warehouseReceipt: sanitizedWhItem,
    };

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'BYPASS', 'X-Cache-Priority': 'receipt-live' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve receipt details' },
      { status: 500 }
    );
  }
}
