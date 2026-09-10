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
  error?: string;
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
  const apiKey = process.env.JSON_CARGO_API_KEY;
  const shippingLineCode = normalizeShippingLineParam(shippingLineInput, containerNumber);

  const url = `http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(
    containerNumber.trim()
  )}?shipping_line=${encodeURIComponent(shippingLineCode)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey || '',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const resData = await res.json();
      const dataObj: JSONCargoContainerData = resData?.data || resData;

      const rawEta =
        dataObj?.eta_final_destination ||
        dataObj?.eta_next_destination ||
        dataObj?.customs_clearance ||
        dataObj?.last_movement_timestamp ||
        dataObj?.timestamp_of_last_location ||
        dataObj?.atd_last_location ||
        dataObj?.atd_origin ||
        dataObj?.eta ||
        dataObj?.estimated_arrival;

      const rawStatus =
        dataObj?.container_status ||
        dataObj?.status ||
        dataObj?.current_status ||
        (dataObj?.last_location ? `Location: ${dataObj.last_location}` : 'In Transit');

      // Check if container has reached final destination or arrived at port
      const statusLower = String(rawStatus || '').toLowerCase();
      const locLower = String(dataObj?.last_location || '').toLowerCase();
      const isDestinationReached =
        statusLower.includes('arrived') ||
        statusLower.includes('discharge') ||
        statusLower.includes('destination') ||
        statusLower.includes('delivered') ||
        statusLower.includes('customs clear') ||
        locLower.includes('destination') ||
        locLower.includes('discharged');

      const finalStatus = isDestinationReached
        ? 'Container reached to the final destination'
        : rawStatus;

      let formattedEta = 'N/A';
      let normalizedRawEta = '';
      if (rawEta) {
        const dateMatch = String(rawEta).match(/\d{4}-\d{2}-\d{2}/);
        let baseDate: Date | null = null;
        if (dateMatch) {
          baseDate = new Date(dateMatch[0]);
        } else if (!isNaN(new Date(rawEta).getTime())) {
          baseDate = new Date(rawEta);
        }

        if (baseDate && !isNaN(baseDate.getTime())) {
          const yyyy = baseDate.getFullYear();
          const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
          const dd = String(baseDate.getDate()).padStart(2, '0');
          normalizedRawEta = `${yyyy}-${mm}-${dd}`;

          // Clearance Delivery ETA: Actual Carrier Vessel ETA + 10 days clearance procedure
          formattedEta = addFilingBufferDays(baseDate, 10);
        } else {
          normalizedRawEta = String(rawEta);
          formattedEta = String(rawEta);
        }
      }

      const shippedFrom = dataObj?.shipped_from || dataObj?.loading_port || 'Ningbo / Shanghai, China';
      const shippedTo = dataObj?.shipped_to || dataObj?.discharging_port || 'Nhava Sheva / Mundra, India';
      const currentLocation = dataObj?.last_location || (dataObj?.next_location ? `Approaching ${dataObj.next_location}` : finalStatus || 'In Transit');
      const apiLoadingDate = extractLoadingDateFromApi(dataObj);
      const startDate = apiLoadingDate || dataObj?.atd_origin || dataObj?.atd_last_location || '';
      const vesselName = dataObj?.current_vessel_name || dataObj?.last_vessel_name || '';
      const voyageNumber = dataObj?.current_voyage_number || dataObj?.last_voyage_number || '';

      return {
        eta: formattedEta,
        rawEta: normalizedRawEta || (rawEta ? String(rawEta) : ''),
        status: finalStatus,
        shippedFrom,
        shippedTo,
        currentLocation,
        startDate,
        loadingDate: apiLoadingDate || startDate || '',
        destinationDate: formattedEta,
        vesselName,
        voyageNumber,
        dataDetails: {
          ...dataObj,
          loading_date: apiLoadingDate || startDate || null,
          eta_final_destination: formattedEta,
          raw_carrier_eta: normalizedRawEta || rawEta || null,
          clearance_eta: formattedEta,
          shipped_from: shippedFrom,
          shipped_to: shippedTo,
          last_location: currentLocation,
          current_vessel_name: vesselName,
          current_voyage_number: voyageNumber,
          container_status: finalStatus,
        },
        rawResponse: resData,
      };
    } else {
      let errDetail = `HTTP ${res.status}: ${res.statusText || 'Carrier API response error'}`;
      try {
        const errJson = await res.json();
        if (errJson?.error || errJson?.message) {
          errDetail = errJson.error || errJson.message;
        }
      } catch (_) {}
      throw new Error(`Carrier ${shippingLineCode} API error: ${errDetail}`);
    }
  } catch (error: any) {
    console.warn(`JSONCargo API call error for ${containerNumber} (${shippingLineCode}):`, error?.message || error);

    // Only allow mock data if explicitly enabled via environment variable
    if (process.env.MOCK_CARGO_FALLBACK === 'true') {
      const baseMock = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days away
      const rawMockEta = baseMock.toISOString().slice(0, 10);
      const clearanceMockEta = addFilingBufferDays(rawMockEta, 10);
      const mockStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const mockData: JSONCargoContainerData = {
        container_id: containerNumber.trim(),
        container_status: `In Transit (${shippingLineCode})`,
        shipping_line_name: shippingLineCode,
        eta_final_destination: clearanceMockEta,
        raw_carrier_eta: rawMockEta,
        shipped_from: 'Ningbo / Shanghai, China',
        shippedTo: 'Nhava Sheva / Mundra, India',
        last_location: 'In Transit (Singapore Strait / Malacca)',
        atd_origin: mockStartDate,
        loading_date: mockStartDate,
        current_vessel_name: 'MSC LORETTA',
        current_voyage_number: '2508W',
        last_updated: new Date().toISOString(),
      };

      return {
        eta: clearanceMockEta,
        rawEta: rawMockEta,
        status: `In Transit (${shippingLineCode})`,
        shippedFrom: 'Ningbo / Shanghai, China',
        shippedTo: 'Nhava Sheva / Mundra, India',
        currentLocation: 'In Transit (Singapore Strait / Malacca)',
        startDate: mockStartDate,
        loadingDate: mockStartDate,
        destinationDate: clearanceMockEta,
        vesselName: 'MSC LORETTA',
        voyageNumber: '2508W',
        dataDetails: mockData,
      };
    }

    throw error;
  }
}

export async function fetchApiKeyStats(): Promise<ApiKeyStats> {
  const apiKey = process.env.JSON_CARGO_API_KEY;
  if (!apiKey) return { error: 'JSON_CARGO_API_KEY not configured' };

  try {
    const res = await fetch('http://api.jsoncargo.com/api/v1/api_key/stats', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return data?.data || data;
    } else {
      return { error: `API stats error: ${res.status}` };
    }
  } catch (err: any) {
    return { error: err?.message || 'Failed to fetch API stats' };
  }
}
