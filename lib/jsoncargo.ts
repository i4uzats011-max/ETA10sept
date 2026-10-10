export interface JSONCargoContainerData {
  container_id?: string;
  container_type?: string;
  container_status?: string;
  shipping_line_name?: string;
  shipping_line_id?: string;
  tare?: number;
  shipped_from?: string;
  shipped_from_terminal?: string;
  shipped_to?: string;
  shipped_to_terminal?: string;
  atd_origin?: string;
  eta_final_destination?: string;
  last_location?: string;
  last_location_terminal?: string;
  next_location?: string;
  next_location_terminal?: string;
  atd_last_location?: string;
  eta_next_destination?: string;
  timestamp_of_last_location?: string;
  last_movement_timestamp?: string;
  loading_port?: string;
  discharging_port?: string;
  customs_clearance?: string;
  bill_of_lading?: string;
  last_vessel_name?: string;
  last_voyage_number?: string;
  current_vessel_name?: string;
  current_voyage_number?: string;
  last_updated?: string;
  [key: string]: any;
}

export interface ApiKeyStats {
  plan?: string;
  requests_total?: number;
  requests_made?: number;
  requests_available?: number;
  totalCalls?: number;
  usedCalls?: number;
  remainingCalls?: number;
  status?: 'configured' | 'invalid_key' | 'not_configured' | 'error';
  error?: string;
  keyMasked?: string;
}

export const SHIPPING_LINE_MAP: Record<string, string> = {
  // MSC (Mediterranean Shipping Company) - Code: 0015
  'MSC': 'MSC',
  'MSCU': 'MSC',
  'MEDU': 'MSC',
  'MSMU': 'MSC',
  'MSTU': 'MSC',
  'MEDITERRANEAN SHIPPING COMPANY': 'MSC',

  // MAERSK (A.P. Moller - Maersk) - Code: 0010
  'MAERSK': 'MAERSK',
  'MAEU': 'MAERSK',
  'MSKU': 'MAERSK',
  'MSFU': 'MAERSK',
  'MRAU': 'MAERSK',
  'A.P. MOLLER - MAERSK': 'MAERSK',
  'A.P. MOLLER MAERSK': 'MAERSK',

  // HAPAG_LLOYD (Hapag-Lloyd) - Code: 0011
  'HAPAG_LLOYD': 'HAPAG_LLOYD',
  'HAPAG-LLOYD': 'HAPAG_LLOYD',
  'HAPAG': 'HAPAG_LLOYD',
  'HLCU': 'HAPAG_LLOYD',
  'HLXU': 'HAPAG_LLOYD',

  // HMM (Hyundai Merchant Marine) - Code: 0012
  'HMM': 'HMM',
  'HYUNDAI': 'HMM',
  'HYUNDAI MERCHANT MARINE': 'HMM',
  'HDMU': 'HMM',
  'HMMU': 'HMM',
  'KOCU': 'HMM',
  'CAIU': 'HMM',
  'CLKU': 'HMM',
  'GAOU': 'HMM',
  'ROEU': 'HMM',
  'TGBU': 'HMM',

  // ONE (Ocean Network Express) - Code: 0013
  'ONE': 'ONE',
  'ONEU': 'ONE',
  'NYKU': 'ONE',
  'MOLU': 'ONE',
  'KLINE': 'ONE',
  'KLFU': 'ONE',
  'OCEAN NETWORK EXPRESS': 'ONE',

  // EVERGREEN (Evergreen Marine Corp) - Code: 0014
  'EVERGREEN': 'EVERGREEN',
  'EMCU': 'EVERGREEN',
  'EISU': 'EVERGREEN',
  'EGHU': 'EVERGREEN',
  'UGMU': 'EVERGREEN',
  'EVERGREEN MARINE CORP': 'EVERGREEN',

  // CMA_CGM (CMA CGM) - Code: 0016
  'CMA_CGM': 'CMA_CGM',
  'CMA CGM': 'CMA_CGM',
  'CMAU': 'CMA_CGM',
  'APZU': 'CMA_CGM',
  'ECXU': 'CMA_CGM',
  'CGMU': 'CMA_CGM',
  'CMA': 'CMA_CGM',

  // COSCO (COSCO SHIPPING Lines Co) - Code: 0017
  'COSCO': 'COSCO',
  'COSU': 'COSCO',
  'CBHU': 'COSCO',
  'CCLU': 'COSCO',
  'CSQU': 'COSCO',
  'COSCO SHIPPING LINES CO': 'COSCO',

  // ZIM (Zim Integrated Shipping Services) - Code: 0018
  'ZIM': 'ZIM',
  'ZIMU': 'ZIM',
  'ZCSU': 'ZIM',
  'ZIM INTEGRATED SHIPPING SERVICES': 'ZIM',

  // YANG_MING (Yang Ming Marine Transport) - Code: 0019
  'YANG_MING': 'YANG_MING',
  'YANG MING': 'YANG_MING',
  'YMLU': 'YANG_MING',
  'YMCU': 'YANG_MING',

  // PIL (Pacific International Lines) - Code: 0020
  'PIL': 'PIL',
  'PILU': 'PIL',
  'PCIU': 'PIL',
  'PACIFIC INTERNATIONAL LINES': 'PIL',

  'DEFAULT': 'MSC',
};

export function normalizeShippingLineParam(shippingLineInput: string = 'MSC', containerNumber?: string): string {
  // If container number provided, check if first 4 chars auto-detect a specific carrier
  if (containerNumber) {
    const cleanNum = containerNumber.trim().toUpperCase();
    const prefix = cleanNum.slice(0, 4);
    if (SHIPPING_LINE_MAP[prefix]) {
      return SHIPPING_LINE_MAP[prefix];
    }
  }

  if (!shippingLineInput) return 'MSC';
  const cleanInput = shippingLineInput.trim().toUpperCase();
  if (SHIPPING_LINE_MAP[cleanInput]) {
    return SHIPPING_LINE_MAP[cleanInput];
  }

  const prefix = cleanInput.slice(0, 4);
  if (SHIPPING_LINE_MAP[prefix]) {
    return SHIPPING_LINE_MAP[prefix];
  }

  return cleanInput.replace(/[-\s]/g, '_') || 'MSC';
}

export function shouldSyncContainer(
  lastApiSync: Date | null | undefined,
  eta: string | undefined,
  currentDate: Date = new Date(),
  status?: string | undefined,
  rawEta?: string | undefined
): boolean {
  // If container has arrived at final destination, reached port, or is delivered/customs cleared,
  // automated ETA tracking halts completely
  if (status) {
    const s = status.toLowerCase();
    if (
      s.includes('delivered') ||
      s.includes('custom clear') ||
      s.includes('completed') ||
      s.includes('reached') ||
      s.includes('final destination') ||
      s.includes('arrived') ||
      s.includes('discharged')
    ) {
      return false;
    }
  }

  // Always sync if never synced
  if (!lastApiSync) {
    return true;
  }

  // Determine actual carrier ETA date (rawEta preferred over buffered clearance eta)
  // Per user rule: Sync schedule is calculated based on actual vessel ETA date, NOT buffered +10 days
  const etaStringToUse = rawEta || eta;
  let daysUntilEta: number | null = null;

  if (etaStringToUse && etaStringToUse !== 'N/A' && etaStringToUse !== 'Pending') {
    const dateMatch = String(etaStringToUse).match(/\d{4}-\d{2}-\d{2}/);
    let baseDate: Date | null = null;
    if (dateMatch) {
      baseDate = new Date(dateMatch[0]);
    } else if (!isNaN(new Date(etaStringToUse).getTime())) {
      baseDate = new Date(etaStringToUse);
    }
    if (baseDate && !isNaN(baseDate.getTime())) {
      const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      const etaDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
      daysUntilEta = Math.round((etaDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const requiredIntervalDays = getRequiredSyncIntervalDays(daysUntilEta);
  const daysSinceLastSync = (currentDate.getTime() - new Date(lastApiSync).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastSync >= requiredIntervalDays;
}

/**
 * Stepped carrier sync frequency schedule based on days to actual carrier ETA:
 * - 1d to 7d (and overdue / <=0d): Check daily (1 day interval)
 * - 8d to 12d: Check 1 time in 2 days (2 days interval)
 * - 13d to 20d: Check 1 time in 5 days (5 days interval)
 * - 21d to 30d (20d-30d): Check 1 time in 7 days (7 days interval)
 * - 30+ days: Check 1 time in 10 days (10 days interval)
 */
export function getRequiredSyncIntervalDays(daysUntilEta: number | null | undefined): number {
  if (daysUntilEta === null || daysUntilEta === undefined) return 1.0;
  if (daysUntilEta <= 7) return 1.0;
  if (daysUntilEta <= 12) return 2.0;
  if (daysUntilEta <= 20) return 5.0;
  if (daysUntilEta <= 30) return 7.0;
  return 10.0;
}

/**
 * Adds clearance procedure buffer days to any base ETA date (default +10 days for customs clearance procedure).
 */
export function addFilingBufferDays(etaDateInput: string | Date, daysToAdd: number = 10): string {
  const dateMatch = String(etaDateInput).match(/\d{4}-\d{2}-\d{2}/);
  let baseDate: Date | null = null;
  
  if (dateMatch) {
    baseDate = new Date(dateMatch[0]);
  } else if (!isNaN(new Date(etaDateInput).getTime())) {
    baseDate = new Date(etaDateInput);
  }

  if (!baseDate || isNaN(baseDate.getTime())) {
    return 'N/A';
  }

  // Add clearance procedure buffer days (+10 days)
  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extracts loading / origin departure date from JSON Cargo API response.
 * Inspects atd_origin, loading_date, departure_date, gate_in_date, and tracking events.
 */
export function extractLoadingDateFromApi(dataObj: any): string {
  if (!dataObj) return '';

  const candidates = [
    dataObj.loading_date,
    dataObj.load_date,
    dataObj.atd_origin,
    dataObj.date_of_loading,
    dataObj.departure_date,
    dataObj.atd,
    dataObj.gate_in_date,
    dataObj.atd_last_location,
    dataObj.start_date,
  ];

  for (const cand of candidates) {
    if (cand && (typeof cand === 'string' || typeof cand === 'number' || cand instanceof Date)) {
      const match = String(cand).match(/\d{4}-\d{2}-\d{2}/);
      if (match) return match[0];
      const parsed = new Date(cand);
      if (!isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }

  // Scan events or milestones if available
  const events = dataObj.events || dataObj.timeline || dataObj.movements || dataObj.milestones || dataObj.container_events;
  if (Array.isArray(events)) {
    const loadEvent = events.find((ev: any) => {
      const desc = String(ev.event_description || ev.description || ev.name || ev.event || ev.status || ev.activity || '').toLowerCase();
      const code = String(ev.event_code || ev.code || '').toLowerCase();
      return (
        desc.includes('loaded') ||
        desc.includes('loading') ||
        desc.includes('departure') ||
        desc.includes('departed') ||
        desc.includes('gate in') ||
        code.includes('load') ||
        code.includes('dept')
      );
    });

    if (loadEvent) {
      const evDate = loadEvent.timestamp || loadEvent.date || loadEvent.actual_time || loadEvent.event_date || loadEvent.created_at;
      if (evDate) {
        const match = String(evDate).match(/\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
        const parsed = new Date(evDate);
        if (!isNaN(parsed.getTime())) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, '0');
          const dd = String(parsed.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      }
    }
  }

  return '';
}

export interface ContainerTrackingResult {
  eta: string;
  rawEta?: string;
  status: string;
  shippedFrom: string;
  shippedTo: string;
  currentLocation: string;
  startDate: string;
  loadingDate?: string;
  destinationDate: string;
  vesselName: string;
  voyageNumber: string;
  dataDetails: JSONCargoContainerData | null;
  rawResponse?: any;
}

export async function fetchContainerTracking(
  containerNumber: string,
  shippingLineInput: string = 'MSC'
): Promise<ContainerTrackingResult> {
  const cleanNum = (containerNumber || '').trim().toUpperCase();
  const carrierName = (shippingLineInput || 'MSC').trim();

  let loadingDate = '';
  let existingEta = '';
  let existingStatus = 'In Transit';
  let shippedFrom = 'Ningbo / Shanghai, China';
  let shippedTo = 'Nhava Sheva / Mundra, India';
  let vesselName = '';
  let voyageNumber = '';

  try {
    const { connectToDatabase } = await import('@/lib/mongodb');
    await connectToDatabase();
    const Container = (await import('@/models/Container')).default;
    const Shipment = (await import('@/models/Shipment')).default;

    const regex = new RegExp(`^${cleanNum.replace(/[-_\s]+/g, '[-_\\s]*')}$`, 'i');
    const containerDoc: any = await Container.findOne({
      $or: [{ containerNumber: regex }, { container: regex }],
    }).lean();

    const shipmentDoc: any = containerDoc || await Shipment.findOne({
      $or: [{ containerNumber: regex }, { container: regex }],
    }).lean();

    if (shipmentDoc) {
      if (!loadingDate) loadingDate = shipmentDoc.loadingDate || shipmentDoc.startDate || '';
      if (shipmentDoc.eta && shipmentDoc.eta !== 'N/A' && shipmentDoc.eta !== 'Pending') {
        existingEta = shipmentDoc.eta;
      }
      if (shipmentDoc.status) existingStatus = shipmentDoc.status;
      if (shipmentDoc.shippedFrom) shippedFrom = shipmentDoc.shippedFrom;
      if (shipmentDoc.shippedTo) shippedTo = shipmentDoc.shippedTo;
      if (shipmentDoc.vesselName) vesselName = shipmentDoc.vesselName;
      if (shipmentDoc.voyageNumber) voyageNumber = shipmentDoc.voyageNumber;
    }
  } catch (dbErr) {
    // silent db fallback
  }

  // Calculate ETA based on loading date if available (20 days sea voyage + 10 days clearance = 30 days total)
  let calculatedEta = existingEta || 'Pending';
  let rawCarrierEta = '';

  if (loadingDate) {
    const dateMatch = String(loadingDate).match(/\d{4}-\d{2}-\d{2}/);
    let baseDate: Date | null = null;
    if (dateMatch) {
      baseDate = new Date(dateMatch[0]);
    } else if (!isNaN(new Date(loadingDate).getTime())) {
      baseDate = new Date(loadingDate);
    }

    if (baseDate && !isNaN(baseDate.getTime())) {
      // 20 days sea voyage
      const seaArrival = new Date(baseDate.getTime());
      seaArrival.setUTCDate(seaArrival.getUTCDate() + 20);
      const yyyy = seaArrival.getUTCFullYear();
      const mm = String(seaArrival.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(seaArrival.getUTCDate()).padStart(2, '0');
      rawCarrierEta = `${yyyy}-${mm}-${dd}`;

      // Final clearance delivery ETA (+10 days clearance procedure)
      calculatedEta = addFilingBufferDays(seaArrival, 10);
    }
  }

  const finalStatus = existingStatus || (loadingDate ? 'In Transit' : 'Planning');
  const currentLocation = loadingDate ? `At Sea (${carrierName})` : 'In Transit';

  const mockData: JSONCargoContainerData = {
    container_id: cleanNum,
    container_status: finalStatus,
    shipping_line_name: carrierName,
    eta_final_destination: calculatedEta,
    raw_carrier_eta: rawCarrierEta || calculatedEta,
    clearance_eta: calculatedEta,
    shipped_from: shippedFrom,
    shipped_to: shippedTo,
    last_location: currentLocation,
    atd_origin: loadingDate || undefined,
    loading_date: loadingDate || undefined,
    current_vessel_name: vesselName || undefined,
    current_voyage_number: voyageNumber || undefined,
    last_updated: new Date().toISOString(),
  };

  return {
    eta: calculatedEta,
    rawEta: rawCarrierEta || calculatedEta,
    status: finalStatus,
    shippedFrom,
    shippedTo,
    currentLocation,
    startDate: loadingDate,
    loadingDate,
    destinationDate: calculatedEta,
    vesselName,
    voyageNumber,
    dataDetails: mockData,
  };
}

export async function fetchApiKeyStats(overrideKey?: string): Promise<ApiKeyStats> {
  return {
    status: 'configured',
    plan: 'Direct System Mode (Zero External API)',
    requests_total: 10000,
    requests_made: 0,
    requests_available: 10000,
    totalCalls: 10000,
    usedCalls: 0,
    remainingCalls: 10000,
    keyMasked: 'Direct Engine Active',
  };
}
