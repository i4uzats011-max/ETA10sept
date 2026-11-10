import Shipment from '@/models/Shipment';
import Container from '@/models/Container';

/**
 * Calculates committed ETA as Receipt Date + 45 Days.
 * Strictly in-memory calculation; NEVER writes or saves to DB.
 */
export function calculateCommittedEta(receiptDateInput?: string | Date | null): string {
  let baseDate: Date;

  if (receiptDateInput) {
    if (receiptDateInput instanceof Date) {
      baseDate = isNaN(receiptDateInput.getTime()) ? new Date() : receiptDateInput;
    } else {
      const str = String(receiptDateInput).trim();
      // Match YYYY-MM-DD
      const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (ymd) {
        baseDate = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0);
      } else {
        const d = new Date(str);
        baseDate = isNaN(d.getTime()) ? new Date() : d;
      }
    }
  } else {
    baseDate = new Date();
  }

  // Add 45 calendar days
  const etaDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 45, 12, 0, 0);
  const yyyy = etaDate.getFullYear();
  const mm = String(etaDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etaDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// In-memory cache for container lookups by date
const containerDateCache = new Map<string, { value: string; timestamp: number }>();

/**
 * Finds the container that was loaded on/around the receipt date, and returns container + 1.
 * Example: If container loaded around that receipt date was USSI-338 -> returns USSI-339.
 * If receipt date is earlier (e.g. June 2026 USSI-260) -> returns USSI-261.
 * Strictly in-memory calculation; NEVER writes or saves to DB.
 */
export async function getContainerForReceiptDate(receiptDateInput?: string | Date | null): Promise<string> {
  let targetDateStr = '';
  if (receiptDateInput) {
    if (typeof receiptDateInput === 'string') {
      const m = receiptDateInput.match(/\d{4}-\d{2}-\d{2}/);
      if (m) targetDateStr = m[0];
    } else if (receiptDateInput instanceof Date && !isNaN(receiptDateInput.getTime())) {
      targetDateStr = receiptDateInput.toISOString().slice(0, 10);
    }
  }

  const cacheKey = targetDateStr || 'LATEST';
  const cached = containerDateCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 120000) { // 2 min cache
    return cached.value;
  }

  try {
    let matchedShipment: any = null;

    if (targetDateStr) {
      // User rule: "CONTAINER NO. IS RECEPT DATE KA BAD JUST LOAD CONAINER NO. + 1"
      // Find the container loaded on or immediately after this receipt date
      matchedShipment = await Shipment.findOne({
        date: { $gte: targetDateStr, $ne: '' },
        container: { $regex: /^(USSI|USI)[-_ ]*\d+/i }
      })
        .sort({ date: 1, createdAt: 1 })
        .select('container date')
        .lean();
    }

    // Fallback: If no shipment on or after this date (e.g. very recent receipt), find the latest container loaded in DB
    if (!matchedShipment) {
      matchedShipment = await Shipment.findOne({
        container: { $regex: /^(USSI|USI)[-_ ]*\d+/i }
      })
        .sort({ date: -1, createdAt: -1 })
        .select('container date')
        .lean();
    }

    if (matchedShipment && matchedShipment.container) {
      const m = String(matchedShipment.container).match(/^(USSI|USI)[-_ ]*0*(\d+)$/i);
      if (m) {
        const prefix = m[1].toUpperCase();
        const num = parseInt(m[2], 10);
        const nextContainer = `${prefix}-${num + 1}`;
        containerDateCache.set(cacheKey, { value: nextContainer, timestamp: now });
        return nextContainer;
      }
    }

    // Absolute fallback
    const defaultNext = 'USSI-339';
    containerDateCache.set(cacheKey, { value: defaultNext, timestamp: now });
    return defaultNext;
  } catch (err) {
    return 'USSI-339';
  }
}

/**
 * Resolves live public display ETA, container number, and status:
 * - If ETA is present in DB, uses DB ETA.
 * - If ETA is NOT present in DB, dynamically computes Receipt Date + 45 days.
 * - If Container is not loaded yet, dynamically computes Container loaded on that date + 1.
 * - Public customer sees genuine In Transit status and container/ETA.
 * - NEVER modifies or saves any data into the database!
 */
export async function resolveFallbackEtaAndContainer(params: {
  receiptDate?: string | Date | null;
  existingEta?: string | null;
  existingContainer?: string | null;
  existingStatus?: string | null;
  isDelivered?: boolean;
}): Promise<{
  eta: string;
  containerNo: string;
  status: string;
  isDummyFallback: boolean;
}> {
  const isDeliv = Boolean(params.isDelivered || (params.existingStatus && /deliver/i.test(params.existingStatus)));

  const hasDbEta = Boolean(
    params.existingEta &&
    params.existingEta !== '-' &&
    params.existingEta !== 'Pending' &&
    params.existingEta !== 'N/A' &&
    params.existingEta !== 'Pending Schedule'
  );

  const isContainerAllocated = Boolean(
    params.existingContainer &&
    params.existingContainer !== '-' &&
    params.existingContainer !== 'Pending Allocation' &&
    !params.existingContainer.toLowerCase().includes('not loaded') &&
    !params.existingContainer.toLowerCase().includes('in warehouse')
  );

  let finalEta = hasDbEta ? params.existingEta! : calculateCommittedEta(params.receiptDate);
  let finalContainer = isContainerAllocated ? params.existingContainer! : await getContainerForReceiptDate(params.receiptDate);
  let finalStatus = isDeliv ? 'Delivered' : (params.existingStatus && !params.existingStatus.toLowerCase().includes('warehouse') ? params.existingStatus : 'In Transit');

  return {
    eta: finalEta,
    containerNo: finalContainer,
    status: finalStatus,
    isDummyFallback: !hasDbEta || !isContainerAllocated
  };
}
