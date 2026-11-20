import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { calculateCommittedEta, getContainerForReceiptDate } from '@/lib/committedEtaHelper';

export interface ILivePublicReceipt {
  id?: string;
  marka: string;
  receiptNo: string;
  warehouse?: string; // Origin warehouse e.g. "GZ", "YW"
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

export const GENERIC_MARKA_WORDS = new Set([
  'PARTY', 'GENERAL', 'GENERALPARTY', 'TRADERS', 'TRADING', 'ENTERPRISES',
  'ENTERPRISE', 'IMPEX', 'EXPORTS', 'IMPORTS', 'EXPORT', 'IMPORT',
  'PVT', 'LTD', 'LIMITED', 'CORP', 'CORPORATION', 'CO', 'COMPANY',
  'CARGO', 'LOGISTICS', 'INTERNATIONAL', 'INDIA', 'CHINA', 'WAREHOUSE'
]);

/**
 * Normalizes shipping mark string for resilient comparison.
 */
export function normalizeMarkaStr(str?: string): string {
  if (!str) return '';
  return String(str).toUpperCase().replace(/[\s\-_/\\,.]+/g, '').trim();
}

export function extractDistinctiveTokens(str?: string): string[] {
  if (!str) return [];
  const rawTokens = String(str).toUpperCase().split(/[\s,;/\\|_\-]+/).filter(Boolean);
  return rawTokens
    .map(t => t.replace(/[^A-Z0-9]/g, '').trim())
    .filter(t => t.length >= 2 && !GENERIC_MARKA_WORDS.has(t));
}

/**
 * Evaluates whether an item's shipping mark or party matches the target party/marka.
 * Avoids false-positive matches on common suffixes like 'TRADERS', 'PARTY', 'IMPEX'.
 */
export function isMarkaMatch(targetMarka?: string, itemMarka?: string): boolean {
  if (!targetMarka || !itemMarka) return false;
  const tNorm = normalizeMarkaStr(targetMarka);
  const mNorm = normalizeMarkaStr(itemMarka);
  if (!tNorm || !mNorm) return false;
  if (GENERIC_MARKA_WORDS.has(tNorm) || GENERIC_MARKA_WORDS.has(mNorm)) return false;
  if (tNorm === mNorm) return true;

  // 1. Composite / Delimited list check: e.g. 'SJT-720/1 / SJT-720/2' vs 'SJT-720/1'
  const tDelim = String(targetMarka).toUpperCase().split(/[,;|/]+/).map(normalizeMarkaStr).filter(Boolean);
  const mDelim = String(itemMarka).toUpperCase().split(/[,;|/]+/).map(normalizeMarkaStr).filter(Boolean);
  if (tDelim.some(t => !GENERIC_MARKA_WORDS.has(t) && mDelim.includes(t))) return true;

  // 2. Normalized prefix check for shipping mark codes (e.g. SJT720 vs SJT720A)
  if (tNorm.length >= 4 && mNorm.length >= 4) {
    if (tNorm.startsWith(mNorm) || mNorm.startsWith(tNorm)) {
      const diff = Math.abs(tNorm.length - mNorm.length);
      if (diff <= 2) return true;
    }
  }

  // 3. Distinctive words matching (excluding generic business terms like TRADERS, PARTY, IMPEX)
  const tTokens = extractDistinctiveTokens(targetMarka);
  const mTokens = extractDistinctiveTokens(itemMarka);
  if (tTokens.length === 0 || mTokens.length === 0) return false;

  const hasExactTokenMatch = tTokens.some(t => mTokens.some(m => t === m && t.length >= 3));
  if (hasExactTokenMatch) {
    if (tTokens.length >= 2 && mTokens.length >= 2) {
      const overlap = tTokens.filter(t => mTokens.includes(t)).length;
      return overlap >= Math.min(tTokens.length, mTokens.length);
    }
    return true;
  }

  return false;
}

/**
 * Resolves which WarehouseReceipt belongs to this tracking entry.
 * Transaction is unique by composite key: Receipt No. + Marka + Warehouse Name!
 * Matches by:
 * 1. entry.warehouseReceiptId
 * 2. entry.warehouse + entry.marka + entry.ctn
 * 3. entry.marka / trackingDoc.name matching w.mainMarka / w.subMarka / w.party
 * 4. Multi-factor scoring
 */
export function pickTargetWarehouseReceipt(
  entry: any,
  defaultMarka: string,
  whList: any[],
  shipmentsList: any[] = []
): any {
  if (!whList || whList.length === 0) return null;

  const entryWh = (entry.warehouse || '').toUpperCase().trim();
  const entryWhId = String(entry.warehouseReceiptId || '').trim();
  const explicitMarka = (entry.marka || '').toUpperCase().trim();
  const fallbackMarka = (defaultMarka || '').toUpperCase().trim();
  const entryCtn = parseFloat(String(entry.ctn || '0'));
  const entryContainer = (entry.containerNo || '').toUpperCase().trim();

  // 1. Direct match on warehouseReceiptId
  if (entryWhId) {
    const found = whList.find(w => String(w._id) === entryWhId);
    if (found) return found;
  }

  // Filter pool by warehouse if warehouse was explicitly specified
  let candidatePool = whList;
  if (entryWh) {
    candidatePool = whList.filter(w => (w.warehouse || '').toUpperCase().trim() === entryWh);
    // If an explicit warehouse was requested (e.g. GZ), but whList has none for that warehouse,
    // we MUST NOT blindly fall back to another warehouse (Rule 1: Never cross warehouses).
    if (candidatePool.length === 0) return null;
  }

  // 2. Match on Explicit Marka + CTN within candidatePool (Entry's own CTN & Marka take highest priority)
  if (explicitMarka && entryCtn > 0) {
    const matchBothAndCtn = candidatePool.find(w => {
      const wQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
      const wMarka = (w.mainMarka || w.subMarka || w.party || '').toUpperCase().trim();
      return isMarkaMatch(explicitMarka, wMarka) && wQty === entryCtn;
    });
    if (matchBothAndCtn) return matchBothAndCtn;
  }

  // 2b. Match by Carton count within candidatePool (CTN criteria basis: e.g. GZ: 229 CTN vs YW: 2 CTN)
  if (entryCtn > 0) {
    const matchCtn = candidatePool.find(w => {
      const wQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
      return wQty === entryCtn;
    });
    if (matchCtn) return matchCtn;
  }

  // 2c. Match warehouse + explicit marka
  if (explicitMarka) {
    const matchMarka = candidatePool.find(w => {
      const wMarka = (w.mainMarka || w.subMarka || w.party || '').toUpperCase().trim();
      return isMarkaMatch(explicitMarka, wMarka);
    });
    if (matchMarka) return matchMarka;
  }

  if (candidatePool.length === 1) return candidatePool[0];

  // 2d. Fallback Marka match (Link overall title) + CTN if multiple candidates remain
  if (fallbackMarka && entryCtn > 0) {
    const matchFallbackCtn = candidatePool.find(w => {
      const wQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
      const wMarka = (w.mainMarka || w.subMarka || w.party || '').toUpperCase().trim();
      return isMarkaMatch(fallbackMarka, wMarka) && wQty === entryCtn;
    });
    if (matchFallbackCtn) return matchFallbackCtn;
  }

  if (fallbackMarka) {
    const matchFallback = candidatePool.find(w => {
      const wMarka = (w.mainMarka || w.subMarka || w.party || '').toUpperCase().trim();
      return isMarkaMatch(fallbackMarka, wMarka);
    });
    if (matchFallback) return matchFallback;
  }

  // 3. Multi-factor scoring across candidatePool
  let bestScore = -1;
  let bestWh = candidatePool[0];
  const activeMarka = explicitMarka || fallbackMarka;

  for (const w of candidatePool) {
    let score = 0;
    const wMainMarka = (w.mainMarka || '').toUpperCase().trim();
    const wSubMarka = (w.subMarka || '').toUpperCase().trim();
    const wParty = (w.party || '').toUpperCase().trim();
    const wQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);

    // Exact or partial marka match
    if (activeMarka) {
      if (wMainMarka === activeMarka || wSubMarka === activeMarka || wParty === activeMarka) {
        score += 30;
      } else if (isMarkaMatch(activeMarka, wMainMarka) || isMarkaMatch(activeMarka, wSubMarka) || isMarkaMatch(activeMarka, wParty)) {
        score += 20;
      }
    }

    // Exact carton count match
    if (entryCtn > 0 && wQty === entryCtn) {
      score += 15;
    }

    // Check if any shipment for this warehouse matches the container
    if (entryContainer && shipmentsList.length > 0) {
      const containerMatched = shipmentsList.some((s: any) => {
        const sWhMatch = s.receiptId
          ? String(s.receiptId) === String(w._id)
          : (s.warehouse && s.warehouse.toUpperCase().trim() === (w.warehouse || '').toUpperCase().trim());
        const sCont = (s.container || '').toUpperCase().trim();
        return sWhMatch && sCont === entryContainer;
      });
      if (containerMatched) {
        score += 25;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestWh = w;
    }
  }

  return bestWh;
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

  const shipmentsByReceipt = new Map<string, any[]>();
  liveShipments.forEach((s: any) => {
    const rKey = (s.receipt || '').toLowerCase().trim();
    if (!shipmentsByReceipt.has(rKey)) shipmentsByReceipt.set(rKey, []);
    shipmentsByReceipt.get(rKey)!.push(s);
  });

  const whByReceipt = new Map<string, any[]>();
  liveWhReceipts.forEach((w: any) => {
    const rKey = (w.receipt || '').toLowerCase().trim();
    if (!whByReceipt.has(rKey)) whByReceipt.set(rKey, []);
    whByReceipt.get(rKey)!.push(w);
  });

  const resolvedList: ILivePublicReceipt[] = [];
  const seenShipmentKeys = new Set<string>();

  for (const entry of receiptEntries) {
    const rNo = (entry.receiptNo || '').trim();
    const rKey = rNo.toLowerCase();
    const whList = whByReceipt.get(rKey) || [];
    const allShipmentsForReceipt = shipmentsByReceipt.get(rKey) || [];

    // Target the specific warehouse receipt matching this tracking entry
    const whDoc = pickTargetWarehouseReceipt(entry, defaultMarka, whList, allShipmentsForReceipt);
    let targetWarehouse = (whDoc?.warehouse || entry.warehouse || '').toUpperCase().trim();
    // Rule: For multi-marka links, the receipt's own Marka or warehouse slip Marka takes precedence over link name
    const targetMarka = (entry.marka || whDoc?.mainMarka || whDoc?.subMarka || whDoc?.party || defaultMarka || '').toUpperCase().trim();
    let targetReceiptId = whDoc?._id ? String(whDoc._id) : (entry.warehouseReceiptId ? String(entry.warehouseReceiptId) : '');

    const entryCtnNum = parseFloat(String(entry.ctn || '0'));
    // If warehouse was not specified on entry or whDoc, infer strictly from shipments matching this receipt's CTN / Marka
    if (!targetWarehouse && allShipmentsForReceipt.length > 0) {
      // 1. Match both CTN criteria and Marka
      let sMatched = allShipmentsForReceipt.find((s: any) => {
        const sQty = parseFloat(String(s.quantity || s.originalTotalQuantity || '0')) || 0;
        const matchesCtn = entryCtnNum > 0 && sQty === entryCtnNum;
        const matchesMarka = targetMarka && isMarkaMatch(targetMarka, s.mainMarka || s.subMarka || s.party);
        return matchesCtn && matchesMarka;
      });
      // 2. Match CTN criteria basis (strictly separates GZ vs YW for same receipt no.)
      if (!sMatched && entryCtnNum > 0) {
        sMatched = allShipmentsForReceipt.find((s: any) => {
          const sQty = parseFloat(String(s.quantity || s.originalTotalQuantity || '0')) || 0;
          return sQty === entryCtnNum;
        });
      }
      // 3. Match Marka
      if (!sMatched && targetMarka) {
        sMatched = allShipmentsForReceipt.find((s: any) =>
          isMarkaMatch(targetMarka, s.mainMarka || s.subMarka || s.party)
        );
      }
      if (!sMatched && allShipmentsForReceipt.length > 0) {
        sMatched = allShipmentsForReceipt[0];
      }
      if (sMatched?.warehouse) {
        targetWarehouse = (sMatched.warehouse || '').toUpperCase().trim();
      }
      if (!targetReceiptId && sMatched?.receiptId) {
        targetReceiptId = String(sMatched.receiptId);
      }
    }

    // Filter shipments strictly for this warehouse receipt & party so different warehouses/parties never mix
    // Rule: Transaction is unique by composite key: Receipt No. + Marka + Warehouse Name!
    // NEVER SHOW OTHER WAREHOUSE SAME RECEIPT NO.
    let rShipments: any[] = allShipmentsForReceipt.filter((s: any) => {
      const sWh = (s.warehouse || '').toUpperCase().trim();
      // 1. Strict Warehouse match: GZ and YW never mix - NEVER show other warehouse
      if (targetWarehouse) {
        if (!sWh || sWh !== targetWarehouse) return false;
      }

      // 2. Exact receiptId match
      if (targetReceiptId && s.receiptId && String(s.receiptId) === targetReceiptId) return true;

      // 3. If shipment belongs to a different warehouse receipt in whList, don't hijack it
      if (s.receiptId && whDoc && String(s.receiptId) !== String(whDoc._id)) {
        return false;
      }
      if (s.receiptId && targetReceiptId && String(s.receiptId) !== targetReceiptId) {
        return false;
      }

      // 4. Marka match: Different parties must NEVER mix
      const sMainMarka = (s.mainMarka || '').toUpperCase().trim();
      const sSubMarka = (s.subMarka || '').toUpperCase().trim();
      const sParty = (s.party || '').toUpperCase().trim();
      const sHasMarka = Boolean(sMainMarka || sSubMarka || (sParty && sParty !== 'GENERAL PARTY'));

      if (targetMarka && sHasMarka) {
        const matchesMarka = isMarkaMatch(targetMarka, sMainMarka) ||
                             isMarkaMatch(targetMarka, sSubMarka) ||
                             isMarkaMatch(targetMarka, sParty);
        if (!matchesMarka) {
          // Explicitly belongs to a DIFFERENT party -> DO NOT MATCH!
          return false;
        }
      }

      // Fallback: must match targetWarehouse if specified
      if (targetWarehouse) {
        return sWh === targetWarehouse;
      }

      return !sWh;
    });

    // Common Fallback / Master Marka (entry.marka or warehouse slip marka takes precedence over default link name)
    const baseMarka =
      entry.marka ||
      whDoc?.mainMarka ||
      whDoc?.subMarka ||
      whDoc?.party ||
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

        // Live ETA resolution: Container ETA -> Shipment ETA -> Entry ETA
        let liveEta =
          cDoc?.destinationDate ||
          cDoc?.eta ||
          s.destinationDate ||
          s.eta ||
          entry.eta ||
          null;

        if (liveEta === '-' || liveEta?.toLowerCase() === 'pending' || liveEta?.toLowerCase() === 'n/a') {
          liveEta = null;
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
        // User rule: "if container no. not avail in any receipt no. in db then not show container no. only show eta in public link"
        const rawCont = (s.container || entry.containerNo || '').trim();
        const hasRealContainer = Boolean(
          rawCont &&
          rawCont !== '-' &&
          rawCont.toLowerCase() !== 'unassigned' &&
          rawCont.toLowerCase() !== 'in transit' &&
          !rawCont.toLowerCase().includes('pending') &&
          !rawCont.toLowerCase().includes('not loaded')
        );

        let displayContainer = '';
        if (hasRealContainer) {
          displayContainer = cleanDisplayContainer(rawCont);
        } else if (options.includeAdminFields) {
          displayContainer = 'In Warehouse (Not Loaded)';
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
            const shipItemKey = `${rKey}_${targetWarehouse}_${targetMarka}_${String(s._id || s.container)}_${s.quantity}_item_${gIdx}`;
            if (seenShipmentKeys.has(shipItemKey)) continue;
            seenShipmentKeys.add(shipItemKey);

            const gi = s.goodsItems[gIdx];
            resolvedList.push({
              id: `${entry.id || rNo}_ship_${sIdx}_item_${gIdx}`,
              marka: rowMarka,
              receiptNo: rNo,
              warehouse: whDoc?.warehouse || targetWarehouse || undefined,
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
          const shipKey = `${rKey}_${targetWarehouse}_${targetMarka}_${String(s._id || s.container)}_${s.quantity}`;
          if (!seenShipmentKeys.has(shipKey)) {
            seenShipmentKeys.add(shipKey);
            resolvedList.push({
              id: `${entry.id || rNo}_ship_${sIdx}`,
              marka: rowMarka,
              receiptNo: rNo,
              warehouse: whDoc?.warehouse || targetWarehouse || undefined,
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
      }

      // Check if this receipt still has remaining cartons in warehouse to load
      // E.g.: Total 34 CTN: 12 loaded in Cont 1, 12 loaded in Cont 2, 10 CTN REMAIN in warehouse
      // User rule: For public tracking link, partly loaded warehouse balance is hidden (show only in-transit portion).
      // Only included when options.includeAdminFields is true!
      if (whDoc && options.includeAdminFields) {
        const totalQty = typeof whDoc.quantity === 'number'
          ? whDoc.quantity
          : (parseFloat(String(whDoc.quantity || '0')) || 0);

        // Compute actual loaded quantity directly from the live shipments found for this receipt!
        const actualLoadedFromShipments = rShipments.reduce((sum: number, s: any) => {
          return sum + (parseFloat(String(s.quantity || '0')) || 0);
        }, 0);

        // Use actual shipments sum if shipments exist; fall back to whDoc.loadedQuantity only when no shipments exist
        const loadedQty = rShipments.length > 0
          ? actualLoadedFromShipments
          : (typeof whDoc.loadedQuantity === 'number'
              ? whDoc.loadedQuantity
              : (parseFloat(String(whDoc.loadedQuantity || '0')) || 0));

        const remainingQty = Math.max(0, totalQty - loadedQty);

        if (remainingQty > 0) {
          const whItemName =
            (whDoc.items && whDoc.items[0]?.itemName) ||
            whDoc.english ||
            whDoc.commodity ||
            whDoc.chinese ||
            entry.itemName ||
            '-';

          const fallbackEta = null; // Unloaded / warehouse estimated ETA removed

          const remainderKey = `${rKey}_${targetWarehouse}_${targetMarka}_wh_remainder`;
          if (!seenShipmentKeys.has(remainderKey)) {
            seenShipmentKeys.add(remainderKey);
            const whStatus = whDoc.status && !/deliver/i.test(whDoc.status) ? whDoc.status : 'Received in Warehouse';
            resolvedList.push({
              id: `${entry.id || rNo}_wh_remainder`,
              marka: baseMarka,
              receiptNo: rNo,
              warehouse: whDoc?.warehouse || targetWarehouse || undefined,
              itemName: whItemName,
              containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : '',
              actualContainerNo: options.includeAdminFields ? '' : undefined,
              cbm: String(whDoc.remainingVolume || whDoc.volume || '0'),
              weight: String(whDoc.remainingWeight || whDoc.weight || '-'),
              ctn: String(remainingQty),
              eta: fallbackEta,
              deliveryDate: null,
              markedDate: null,
              status: options.includeAdminFields ? (whDoc.status || 'Received in Warehouse') : whStatus,
              remainDays: null,
              updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
              isSplit: true,
              splitInfo: options.includeAdminFields
                ? `Remaining ${remainingQty} CTN to load in warehouse`
                : `In Warehouse (${remainingQty} CTN)`,
              adminNotes: options.includeAdminFields ? (whDoc.remarks || 'Remaining in warehouse') : undefined
            });
          }
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
      const fallbackEta = null; // Unloaded warehouse receipts do not show estimated ETA
      const publicStatus = isDelivered ? 'Delivered' : (cleanDisplayStatus(whStatus) || 'Received in Warehouse');

      // Multi-item check in warehouse receipt
      if (Array.isArray(whDoc.items) && whDoc.items.length > 1) {
        for (let wIdx = 0; wIdx < whDoc.items.length; wIdx++) {
          const whKey = `${rKey}_${targetWarehouse}_${targetMarka}_wh_item_${wIdx}`;
          if (seenShipmentKeys.has(whKey)) continue;
          seenShipmentKeys.add(whKey);

          const it = whDoc.items[wIdx];
          resolvedList.push({
            id: `${entry.id || rNo}_wh_item_${wIdx}`,
            marka: it.mainMarka || it.subMarka || baseMarka,
            receiptNo: rNo,
            warehouse: whDoc?.warehouse || targetWarehouse || undefined,
            itemName: it.itemName || it.english || it.chinese || '-',
            containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : '',
            actualContainerNo: options.includeAdminFields ? '' : undefined,
            cbm: String(it.volume || whDoc.volume || '0'),
            weight: String(it.weight || whDoc.weight || '-'),
            ctn: String(it.quantity || whDoc.quantity || '0'),
            eta: fallbackEta,
            deliveryDate: isDelivered ? markedDate : null,
            markedDate: markedDate,
            status: options.includeAdminFields ? whStatus : publicStatus,
            remainDays: null,
            updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
            adminNotes: options.includeAdminFields ? (it.remarks || whDoc.remarks || '') : undefined
          });
        }
      } else {
        const whKey = `${rKey}_${targetWarehouse}_${targetMarka}_wh_0`;
        if (!seenShipmentKeys.has(whKey)) {
          seenShipmentKeys.add(whKey);
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
            warehouse: whDoc?.warehouse || targetWarehouse || undefined,
            itemName: whItemName,
            containerNo: options.includeAdminFields ? 'In Warehouse (Not Loaded)' : '',
            actualContainerNo: options.includeAdminFields ? '' : undefined,
            cbm: String(whDoc.volume || entry.cbm || '0'),
            weight: String(whDoc.weight || entry.weight || '-'),
            ctn: String(whDoc.quantity || entry.ctn || '0'),
            eta: fallbackEta,
            deliveryDate: isDelivered ? markedDate : null,
            markedDate: markedDate,
            status: options.includeAdminFields ? whStatus : publicStatus,
            remainDays: null,
            updatedAt: whDoc.updatedAt || entry.updatedAt || trackingDoc.updatedAt,
            adminNotes: options.includeAdminFields ? (whDoc.remarks || entry.adminNotes || '') : undefined
          });
        }
      }
    }
    // =========================================================================
    // CASE C: Standalone Entry (Custom entry added directly via link manager)
    // =========================================================================
    else {
      const isDelivered = /deliver|arrived/i.test(entry.status || '');
      const markedDate = entry.deliveryDate || entry.markedDate || null;
      const refDate = entry.date || entry.createdAt || trackingDoc.createdAt;
      const fallbackEta = null; // Unloaded standalone entries without ETA do not calculate committed ETA

      const rawEntryCont = (entry.containerNo || '').trim();
      const hasContainer = Boolean(
        rawEntryCont &&
        rawEntryCont !== '-' &&
        rawEntryCont.toLowerCase() !== 'unassigned' &&
        rawEntryCont.toLowerCase() !== 'in transit' &&
        !rawEntryCont.toLowerCase().includes('pending') &&
        !rawEntryCont.toLowerCase().includes('not loaded')
      );
      const displayContainer = hasContainer
        ? cleanDisplayContainer(rawEntryCont)
        : (options.includeAdminFields ? 'In Warehouse (Not Loaded)' : '');
      const finalEta = entry.eta || fallbackEta;

      const entryKey = `${rKey}_${(entry.warehouse || '').toUpperCase()}_${targetMarka}_standalone_${entry.id || (entry.containerNo + '_' + entry.ctn)}`;
      if (!seenShipmentKeys.has(entryKey)) {
        seenShipmentKeys.add(entryKey);
        resolvedList.push({
          id: entry.id || rNo,
          marka: entry.marka || defaultMarka || '-',
          receiptNo: rNo || 'N/A',
          warehouse: entry.warehouse || undefined,
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
  }

  return resolvedList;
}
