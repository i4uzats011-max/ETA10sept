import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { calculateCommittedEta, getContainerForReceiptDate } from '@/lib/committedEtaHelper';

export interface ILivePublicReceipt {
  id?: string;
  marka: string;
  receiptNo: string;
  itemName: string;
  containerNo: string; // Public display: Container alias (never actual)
  actualContainerNo?: string; // Admin internal only
  cbm: string;
  weight: string;
  ctn: string;
  eta: string | null;
  deliveryDate?: string | null;
  markedDate?: string | null;
  status: string;
  remainDays: number | null;
  updatedAt?: string | Date;
  isSplit?: boolean;
  splitInfo?: string;
  adminNotes?: string;
}

// Strip shipping line names (e.g. COSCO, MSC, ONE, MAERSK, etc.) from public container display
export function cleanDisplayContainer(text?: string): string {
  if (!text) return 'In Transit';
  let cleaned = String(text)
    .replace(/\s*\(\s*(?:COSCO|MSC|MAERSK|CMA\s*CGM|EVERGREEN|ONE|HAPAG(?:-LLOYD)?|ZIM|HMM|YANG\s*MING|WAN\s*HAI|PIL|K\s*LINE|APL|OOCL|HYUNDAI|SEALAND)[^)]*\)/gi, '')
    .replace(/\s*\(\s*(?:shipping\s*line|line|carrier)[^)]*\)/gi, '')
    .replace(/\b(?:COSCO|MSC|MAERSK|CMA\s*CGM|EVERGREEN|ONE|HAPAG(?:-LLOYD)?|ZIM|HMM|YANG\s*MING|WAN\s*HAI|PIL|K\s*LINE|APL|OOCL|HYUNDAI|SEALAND)\b/gi, '')
    .trim();

  cleaned = cleaned.replace(/\s*\(\s*\)/g, '').trim();
  if (/^in[\s_-]*transit/i.test(cleaned)) {
    return 'In Transit';
  }
  return cleaned || 'In Transit';
}

export function cleanDisplayStatus(status?: string): string {
  if (!status) return 'In Transit';
  return String(status).replace(/\s*\([^)]*\)/g, '').trim() || 'In Transit';
}

export function parseEtaTimestamp(val?: string | null): number | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'n/a') return null;

  const currentYear = new Date().getFullYear();

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  const dmMatch = str.match(/^(\d{1,2})\s*[-/ ]?\s*([a-zA-Z]+)(?:\s*[-/ ,]?\s*(\d{2,4}))?$/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const mKey = dmMatch[2].toLowerCase();
    let year = dmMatch[3] ? parseInt(dmMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  const mdMatch = str.match(/^([a-zA-Z]+)\s*[-/ ]?\s*(\d{1,2})(?:[,\s]+(\d{2,4}))?$/);
  if (mdMatch) {
    const mKey = mdMatch[1].toLowerCase();
    const day = parseInt(mdMatch[2], 10);
    let year = mdMatch[3] ? parseInt(mdMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day, 12, 0, 0).getTime();
    }
  }

  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    if (d.getFullYear() === 2001 && !str.includes('2001')) {
      d.setFullYear(currentYear);
    }
    return d.getTime();
  }

  return null;
}

export function calculateRemainDays(etaString?: string | null): number | null {
  if (!etaString) return null;
  const ts = parseEtaTimestamp(etaString);
  if (ts === null) return null;
  const etaDate = new Date(ts);

  const now = new Date();
  const etaStart = new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate());
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = etaStart.getTime() - nowStart.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Resolves a list of linked receipt entries against LIVE database records:
 * - Shipment (loaded containers, split container loads, live ETA, status)
 * - Container (carrier container ETA, destinationDate, delivery status)
 * - WarehouseReceipt (item details, carton counts, remaining warehouse stock)
 *
 * Fully supports:
 * 1) One receipt loaded across multiple containers (e.g. 2 CTN Container A, 1 CTN Container B)
 * 2) Remaining cartons in warehouse (e.g. 2 CTN remain in warehouse -> 'In Warehouse (Not Loaded)')
 * 3) Multiple items on a single receipt (goodsItems / items array)
 * 4) 100% Live DB status sync: Any change to ETA, Container, Item Name, Weight, CTN, CBM, Marka, Status in the DB is instantly reflected.
 */
export async function resolveLiveReceiptsForTrackingDoc(
  trackingDoc: any,
  options: { includeAdminFields?: boolean } = {}
): Promise<ILivePublicReceipt[]> {
  if (!trackingDoc || !Array.isArray(trackingDoc.receipts) || trackingDoc.receipts.length === 0) {
    return [];
  }

  const defaultMarka = trackingDoc.name || '';
  const receiptEntries = trackingDoc.receipts;
  const receiptNos = Array.from(
    new Set(receiptEntries.map((r: any) => (r.receiptNo || '').trim()).filter(Boolean))
  );

  if (receiptNos.length === 0) {
    return [];
  }

  // 1. Fetch live Shipments for all receipt numbers in this link
  const liveShipments: any[] = await Shipment.find({
    receipt: { $in: receiptNos }
  }).lean();

  // 2. Fetch live WarehouseReceipts for all receipt numbers in this link
  const liveWhReceipts: any[] = await WarehouseReceipt.find({
    receipt: { $in: receiptNos }
  }).lean();

  // 3. Fetch live Containers for all unique container aliases across shipments
  const containerNames = Array.from(
    new Set(liveShipments.map((s: any) => (s.container || '').trim()).filter(Boolean))
  );
  const liveContainers: any[] = containerNames.length > 0
    ? await Container.find({ container: { $in: containerNames } }).lean()
    : [];

  // Build lookup maps
  const containerMap = new Map<string, any>();
  liveContainers.forEach((c: any) => {
    if (c.container) containerMap.set(c.container.toLowerCase().trim(), c);
  });

  const shipmentMap = new Map<string, any[]>();
  liveShipments.forEach((s: any) => {
    const rKey = (s.receipt || '').toLowerCase().trim();
    if (!shipmentMap.has(rKey)) shipmentMap.set(rKey, []);
    shipmentMap.get(rKey)!.push(s);
  });

  const whMap = new Map<string, any>();
  liveWhReceipts.forEach((w: any) => {
    const rKey = (w.receipt || '').toLowerCase().trim();
    whMap.set(rKey, w);
  });

  const resolvedList: ILivePublicReceipt[] = [];

  for (const entry of receiptEntries) {
    const rNo = (entry.receiptNo || '').trim();
    const rKey = rNo.toLowerCase();
    const rShipments = shipmentMap.get(rKey) || [];
    const whDoc = whMap.get(rKey);

    // Common Fallback / Master Marka
    const baseMarka =
      whDoc?.mainMarka ||
      whDoc?.subMarka ||
      whDoc?.party ||
      entry.marka ||
      defaultMarka ||
      '-';

    // =========================================================================
    // CASE A: Receipt has one or more Shipments loaded into container(s)
    // =========================================================================
    if (rShipments.length > 0) {
      const isSplitAcrossContainers = rShipments.length > 1;

      for (let sIdx = 0; sIdx < rShipments.length; sIdx++) {
        const s = rShipments[sIdx];
        const cDoc = containerMap.get((s.container || '').toLowerCase().trim());

        const receiptDate = s.date || whDoc?.date || s.createdAt || whDoc?.createdAt;

        // Live ETA resolution: Container ETA -> Shipment ETA -> Entry ETA -> Committed ETA (Receipt Date + 45 days)
        let liveEta =
          cDoc?.destinationDate ||
          cDoc?.eta ||
          s.destinationDate ||
          s.eta ||
          entry.eta ||
          null;

        if (!liveEta || liveEta === '-' || liveEta.toLowerCase() === 'pending' || liveEta.toLowerCase() === 'n/a') {
          liveEta = calculateCommittedEta(receiptDate);
        }

        // Live Delivery & Status Resolution
        const isDelivered = Boolean(
          cDoc?.isDelivered ||
          s.isDelivered ||
          (cDoc?.status && /deliver|arrived/i.test(cDoc.status)) ||
          (s.status && /deliver|arrived/i.test(s.status)) ||
          (entry.status && /deliver|arrived/i.test(entry.status))
        );

        const rawStatus = isDelivered
          ? 'Delivered'
          : cleanDisplayStatus(cDoc?.status || s.status || entry.status || 'In Transit');

        const markedDate =
          entry.deliveryDate ||
          entry.markedDate ||
          s.deliveryDate ||
          cDoc?.deliveryDate ||
          whDoc?.deliveryDate ||
          null;

        const effectiveDeliveryDate = isDelivered ? (markedDate || liveEta || null) : null;

        // Public Container No. (Never exposes carrier shipping line / actual container)
        let displayContainer = cleanDisplayContainer(s.container || entry.containerNo || 'In Transit');
        if (!displayContainer || displayContainer === 'In Transit' || displayContainer === 'Pending Allocation') {
          displayContainer = await getContainerForReceiptDate(receiptDate);
        }

        // Marka resolution (Live from Shipment or WarehouseReceipt)
        const rowMarka = s.mainMarka || s.subMarka || s.party || baseMarka;

        // Item Name resolution (Live from Shipment or WarehouseReceipt)
        const fallbackItemName =
          s.english ||
          s.commodity ||
          s.chinese ||
          (whDoc && (whDoc.english || whDoc.commodity || whDoc.chinese)) ||
          (whDoc?.items && whDoc.items[0]?.itemName) ||
          entry.itemName ||
          '-';

        const rowWeight = String(s.weight || entry.weight || '-');
        const rowCbm = String(s.volume || entry.cbm || '0');
        const rowCtn = String(s.quantity || entry.ctn || '0');
        const rowUpdatedAt = s.updatedAt || whDoc?.updatedAt || entry.updatedAt || trackingDoc.updatedAt;

        // Check if shipment itself has multi-items breakdown (goodsItems)
        if (Array.isArray(s.goodsItems) && s.goodsItems.length > 1) {
          for (let gIdx = 0; gIdx < s.goodsItems.length; gIdx++) {
            const gi = s.goodsItems[gIdx];
            resolvedList.push({
              id: `${entry.id || rNo}_ship_${sIdx}_item_${gIdx}`,
              marka: rowMarka,
              receiptNo: rNo,
              itemName: gi.name || fallbackItemName,
              containerNo: displayContainer,
              actualContainerNo: options.includeAdminFields ? (s.containerNumber || entry.actualContainerNo || '') : undefined,
              cbm: String(gi.cbm || rowCbm),
              weight: String(gi.weight || rowWeight),
              ctn: String(gi.ctn || rowCtn),
              eta: liveEta,
              deliveryDate: effectiveDeliveryDate,
              markedDate: markedDate,
              status: rawStatus,
              remainDays: isDelivered ? null : calculateRemainDays(liveEta),
              updatedAt: rowUpdatedAt,
              isSplit: isSplitAcrossContainers,
              splitInfo: isSplitAcrossContainers ? `Container ${sIdx + 1} of ${rShipments.length}` : undefined,
              adminNotes: options.includeAdminFields ? (s.remarks || entry.adminNotes || '') : undefined
            });
          }
        } else {
          resolvedList.push({
            id: `${entry.id || rNo}_ship_${sIdx}`,
            marka: rowMarka,
            receiptNo: rNo,
            itemName: fallbackItemName,
            containerNo: displayContainer,
            actualContainerNo: options.includeAdminFields ? (s.containerNumber || entry.actualContainerNo || '') : undefined,
            cbm: rowCbm,
            weight: rowWeight,
            ctn: rowCtn,
            eta: liveEta,
            deliveryDate: effectiveDeliveryDate,
            markedDate: markedDate,
            status: rawStatus,
            remainDays: isDelivered ? null : calculateRemainDays(liveEta),
            updatedAt: rowUpdatedAt,
            isSplit: isSplitAcrossContainers,
            splitInfo: isSplitAcrossContainers ? `Container ${sIdx + 1} of ${rShipments.length}` : undefined,
            adminNotes: options.includeAdminFields ? (s.remarks || entry.adminNotes || '') : undefined
          });
        }
      }

      // Check if this receipt still has remaining cartons in warehouse to load
      // E.g.: Total 5 CTN: 2 loaded in Cont A, 1 loaded in Cont B, 2 CTN REMAIN in warehouse
      if (whDoc) {
        const totalQty = typeof whDoc.quantity === 'number'
          ? whDoc.quantity
          : (parseFloat(String(whDoc.quantity || '0')) || 0);

        const loadedQty = typeof whDoc.loadedQuantity === 'number'
          ? whDoc.loadedQuantity
          : (parseFloat(String(whDoc.loadedQuantity || '0')) || 0);

        const remainingQty = typeof whDoc.remainingQuantity === 'number'
          ? whDoc.remainingQuantity
          : (totalQty - loadedQty);

        if (remainingQty > 0) {
          const whItemName =
            (whDoc.items && whDoc.items[0]?.itemName) ||
            whDoc.english ||
            whDoc.commodity ||
            whDoc.chinese ||
            entry.itemName ||
            '-';

          const whDate = whDoc.date || whDoc.createdAt;
          const fallbackContainer = await getContainerForReceiptDate(whDate);
          const fallbackEta = calculateCommittedEta(whDate);

          resolvedList.push({
            id: `${entry.id || rNo}_wh_remainder`,
            marka: baseMarka,
            receiptNo: rNo,
            itemName: whItemName,
            containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : fallbackContainer,
            actualContainerNo: options.includeAdminFields ? '' : undefined,
            cbm: String(whDoc.remainingVolume || whDoc.volume || '0'),
            weight: String(whDoc.remainingWeight || whDoc.weight || '-'),
            ctn: String(remainingQty),
            eta: fallbackEta,
            deliveryDate: null,
            markedDate: null,
            status: options.includeAdminFields ? (whDoc.status || 'Received in Warehouse') : 'In Transit',
            remainDays: calculateRemainDays(fallbackEta),
            updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
            isSplit: true,
            splitInfo: options.includeAdminFields
              ? `Remaining ${remainingQty} CTN to load in warehouse`
              : `Split Cargo (${remainingQty} CTN)`,
            adminNotes: options.includeAdminFields ? (whDoc.remarks || 'Remaining in warehouse') : undefined
          });
        }
      }
    }
    // =========================================================================
    // CASE B: Receipt exists in WarehouseReceipt, but not loaded yet into any container
    // =========================================================================
    else if (whDoc) {
      const whStatus = whDoc.status || 'Received in Warehouse';
      const isDelivered = /deliver/i.test(whStatus);
      const markedDate = whDoc.deliveryDate || entry.deliveryDate || null;
      const whDate = whDoc.date || whDoc.createdAt;
      const fallbackContainer = await getContainerForReceiptDate(whDate);
      const fallbackEta = calculateCommittedEta(whDate);

      // Multi-item check in warehouse receipt
      if (Array.isArray(whDoc.items) && whDoc.items.length > 1) {
        for (let wIdx = 0; wIdx < whDoc.items.length; wIdx++) {
          const it = whDoc.items[wIdx];
          resolvedList.push({
            id: `${entry.id || rNo}_wh_item_${wIdx}`,
            marka: it.mainMarka || it.subMarka || baseMarka,
            receiptNo: rNo,
            itemName: it.itemName || it.english || it.chinese || '-',
            containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : fallbackContainer,
            actualContainerNo: options.includeAdminFields ? '' : undefined,
            cbm: String(it.volume || whDoc.volume || '0'),
            weight: String(it.weight || whDoc.weight || '-'),
            ctn: String(it.quantity || whDoc.quantity || '0'),
            eta: fallbackEta,
            deliveryDate: isDelivered ? markedDate : null,
            markedDate: markedDate,
            status: options.includeAdminFields ? whStatus : (isDelivered ? 'Delivered' : 'In Transit'),
            remainDays: isDelivered ? null : calculateRemainDays(fallbackEta),
            updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
            adminNotes: options.includeAdminFields ? (it.remarks || whDoc.remarks || '') : undefined
          });
        }
      } else {
        const whItemName =
          (whDoc.items && whDoc.items[0]?.itemName) ||
          whDoc.english ||
          whDoc.commodity ||
          whDoc.chinese ||
          entry.itemName ||
          '-';

        resolvedList.push({
          id: `${entry.id || rNo}_wh_0`,
          marka: baseMarka,
          receiptNo: rNo,
          itemName: whItemName,
          containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : fallbackContainer,
          actualContainerNo: options.includeAdminFields ? '' : undefined,
          cbm: String(whDoc.volume || entry.cbm || '0'),
          weight: String(whDoc.weight || entry.weight || '-'),
          ctn: String(whDoc.quantity || entry.ctn || '0'),
          eta: fallbackEta,
          deliveryDate: isDelivered ? markedDate : null,
          markedDate: markedDate,
          status: options.includeAdminFields ? whStatus : (isDelivered ? 'Delivered' : 'In Transit'),
          remainDays: isDelivered ? null : calculateRemainDays(fallbackEta),
          updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
          adminNotes: options.includeAdminFields ? (whDoc.remarks || entry.adminNotes || '') : undefined
        });
      }
    }
    // =========================================================================
    // CASE C: Standalone Entry (Custom entry added directly via link manager)
    // =========================================================================
    else {
      const isDelivered = /deliver|arrived/i.test(entry.status || '');
      const markedDate = entry.deliveryDate || entry.markedDate || null;
      const refDate = entry.date || entry.createdAt || trackingDoc.createdAt;
      const fallbackContainer = await getContainerForReceiptDate(refDate);
      const fallbackEta = calculateCommittedEta(refDate);

      const hasContainer = entry.containerNo && entry.containerNo !== '-' && entry.containerNo !== 'Pending Allocation';
      const displayContainer = hasContainer ? cleanDisplayContainer(entry.containerNo) : (options.includeAdminFields ? 'In Warehouse (Not Loaded)' : fallbackContainer);
      const finalEta = entry.eta || fallbackEta;

      resolvedList.push({
        id: entry.id || rNo,
        marka: entry.marka || defaultMarka || '-',
        receiptNo: rNo || 'N/A',
        itemName: entry.itemName || '-',
        containerNo: displayContainer,
        actualContainerNo: options.includeAdminFields ? (entry.actualContainerNo || '') : undefined,
        cbm: entry.cbm || '0',
        weight: entry.weight || '-',
        ctn: entry.ctn || '0',
        eta: finalEta,
        deliveryDate: isDelivered ? (markedDate || finalEta || null) : null,
        markedDate: markedDate,
        status: isDelivered ? 'Delivered' : (options.includeAdminFields ? (entry.status || 'In Transit') : 'In Transit'),
        remainDays: isDelivered ? null : calculateRemainDays(finalEta),
        updatedAt: entry.updatedAt || trackingDoc.updatedAt,
        adminNotes: options.includeAdminFields ? (entry.adminNotes || '') : undefined
      });
    }
  }

  return resolvedList;
}
