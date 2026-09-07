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
  status?: string | undefined
): boolean {
  // If container is already delivered or customs cleared, skip API call
  if (status) {
    const s = status.toLowerCase();
    if (s.includes('delivered') || s.includes('custom clear') || s.includes('completed')) {
      return false;
    }
  }

  // Always sync if never synced or ETA is missing/invalid
  if (!lastApiSync || !eta || eta === 'N/A' || isNaN(new Date(eta).getTime())) {
    return true;
  }

  const etaDate = new Date(eta);
  const daysUntilEta = Math.ceil((etaDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceLastSync = (currentDate.getTime() - new Date(lastApiSync).getTime()) / (1000 * 60 * 60 * 24);

  // Smart interval schedule based on ETA proximity:
  // ETA 1-5 days away → sync daily (every 1 day)
  if (daysUntilEta >= 1 && daysUntilEta <= 5) {
    return daysSinceLastSync >= 1;
  }
  // ETA 5-11 days away → sync every 2 days
  if (daysUntilEta > 5 && daysUntilEta <= 11) {
    return daysSinceLastSync >= 2;
  }
  // ETA 11-17 days away → sync every 5 days
  if (daysUntilEta > 11 && daysUntilEta <= 17) {
    return daysSinceLastSync >= 5;
  }
  // ETA 17-25 days away → sync every 7 days
  if (daysUntilEta > 17 && daysUntilEta <= 25) {
    return daysSinceLastSync >= 7;
  }
  // ETA more than 25 days away → sync every 10 days
  return daysSinceLastSync >= 10;
}

/**
 * Adds 7 days filing buffer to any base ETA date.
 */
export function addFilingBufferDays(etaDateInput: string | Date, daysToAdd: number = 7): string {
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

  // Add filing buffer days (default +7 days)
  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

export interface ContainerTrackingResult {
  eta: string;
  status: string;
  shippedFrom: string;
  shippedTo: string;
  currentLocation: string;
  startDate: string;
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

      let formattedEta = 'N/A';
      if (rawEta) {
        formattedEta = addFilingBufferDays(rawEta, 7);
      }

      const shippedFrom = dataObj?.shipped_from || dataObj?.loading_port || 'Ningbo / Shanghai, China';
      const shippedTo = dataObj?.shipped_to || dataObj?.discharging_port || 'Nhava Sheva / Mundra, India';
      const currentLocation = dataObj?.last_location || (dataObj?.next_location ? `Approaching ${dataObj.next_location}` : rawStatus || 'In Transit');
      const startDate = dataObj?.atd_origin || dataObj?.atd_last_location || '';
      const vesselName = dataObj?.current_vessel_name || dataObj?.last_vessel_name || '';
      const voyageNumber = dataObj?.current_voyage_number || dataObj?.last_voyage_number || '';

      return {
        eta: formattedEta,
        status: rawStatus,
        shippedFrom,
        shippedTo,
        currentLocation,
        startDate,
        destinationDate: formattedEta,
        vesselName,
        voyageNumber,
        dataDetails: {
          ...dataObj,
          eta_final_destination: formattedEta,
          shipped_from: shippedFrom,
          shipped_to: shippedTo,
          last_location: currentLocation,
          current_vessel_name: vesselName,
          current_voyage_number: voyageNumber,
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
      const baseMock = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const mockEtaWithBuffer = addFilingBufferDays(baseMock, 7);
      const mockStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const mockData: JSONCargoContainerData = {
        container_id: containerNumber.trim(),
        container_status: `In Transit (${shippingLineCode})`,
        shipping_line_name: shippingLineCode,
        eta_final_destination: mockEtaWithBuffer,
        shipped_from: 'Ningbo / Shanghai, China',
        shipped_to: 'Nhava Sheva / Mundra, India',
        last_location: 'In Transit (Singapore Strait / Malacca)',
        atd_origin: mockStartDate,
        current_vessel_name: 'MSC LORETTA',
        current_voyage_number: '2508W',
        last_updated: new Date().toISOString(),
      };

      return {
        eta: mockEtaWithBuffer,
        status: `In Transit (${shippingLineCode})`,
        shippedFrom: 'Ningbo / Shanghai, China',
        shippedTo: 'Nhava Sheva / Mundra, India',
        currentLocation: 'In Transit (Singapore Strait / Malacca)',
        startDate: mockStartDate,
        destinationDate: mockEtaWithBuffer,
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
