/**
 * Carrier Tracking URLs Directory
 * Direct links to official ocean carrier tracking websites / portals
 */

export interface CarrierTrackingInfo {
  name: string;
  trackingUrl: string;
  buildQueryUrl?: (containerNumber: string) => string;
}

const CARRIER_TRACKING_MAP: Record<string, CarrierTrackingInfo> = {
  MSC: {
    name: 'MSC (Mediterranean Shipping Company)',
    trackingUrl: 'https://www.msc.com/en/track-a-shipment',
    buildQueryUrl: (c) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${encodeURIComponent(c)}`,
  },
  MAERSK: {
    name: 'A.P. Moller - Maersk',
    trackingUrl: 'https://www.maersk.com/tracking/',
    buildQueryUrl: (c) => `https://www.maersk.com/tracking/${encodeURIComponent(c)}`,
  },
  CMA_CGM: {
    name: 'CMA CGM Group',
    trackingUrl: 'https://www.cma-cgm.com/ebusiness/tracking',
    buildQueryUrl: (c) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${encodeURIComponent(c)}`,
  },
  'CMA CGM': {
    name: 'CMA CGM Group',
    trackingUrl: 'https://www.cma-cgm.com/ebusiness/tracking',
    buildQueryUrl: (c) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${encodeURIComponent(c)}`,
  },
  COSCO: {
    name: 'COSCO SHIPPING Lines',
    trackingUrl: 'https://lines.coscoshipping.com/home/cargotracking',
    buildQueryUrl: (c) => `https://lines.coscoshipping.com/home/cargotracking/cargoTrackingByContainer?containerNo=${encodeURIComponent(c)}`,
  },
  HAPAG_LLOYD: {
    name: 'Hapag-Lloyd',
    trackingUrl: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    buildQueryUrl: (c) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${encodeURIComponent(c)}`,
  },
  'HAPAG-LLOYD': {
    name: 'Hapag-Lloyd',
    trackingUrl: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html',
    buildQueryUrl: (c) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${encodeURIComponent(c)}`,
  },
  ONE: {
    name: 'Ocean Network Express (ONE)',
    trackingUrl: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking',
    buildQueryUrl: (c) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrac-field=${encodeURIComponent(c)}`,
  },
  EVERGREEN: {
    name: 'Evergreen Marine Corp',
    trackingUrl: 'https://www.shipmentlink.com/servlet/TTrk_Tracking',
    buildQueryUrl: (c) => `https://www.shipmentlink.com/servlet/TTrk_Tracking?quick_type=container&quick_no=${encodeURIComponent(c)}`,
  },
  YANG_MING: {
    name: 'Yang Ming Marine Transport',
    trackingUrl: 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx',
    buildQueryUrl: () => 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx',
  },
  'YANG MING': {
    name: 'Yang Ming Marine Transport',
    trackingUrl: 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx',
    buildQueryUrl: () => 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx',
  },
  HMM: {
    name: 'Hyundai Merchant Marine (HMM)',
    trackingUrl: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp',
    buildQueryUrl: (c) => `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?type=1&number=${encodeURIComponent(c)}`,
  },
  HYUNDAI: {
    name: 'Hyundai Merchant Marine (HMM)',
    trackingUrl: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp',
    buildQueryUrl: (c) => `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?type=1&number=${encodeURIComponent(c)}`,
  },
  ZIM: {
    name: 'ZIM Integrated Shipping Services',
    trackingUrl: 'https://www.zim.com/tools/track-a-shipment',
    buildQueryUrl: (c) => `https://www.zim.com/tools/track-a-shipment?consignmentno=${encodeURIComponent(c)}`,
  },
  PIL: {
    name: 'Pacific International Lines (PIL)',
    trackingUrl: 'https://www.pilship.com/en-our-track-and-trace/120.html',
    buildQueryUrl: (c) => `https://www.pilship.com/en-our-track-and-trace/120.html?ref=${encodeURIComponent(c)}`,
  },
  WAN_HAI: {
    name: 'Wan Hai Lines',
    trackingUrl: 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml',
    buildQueryUrl: () => 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml',
  },
  'WAN HAI': {
    name: 'Wan Hai Lines',
    trackingUrl: 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml',
    buildQueryUrl: () => 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml',
  },
  OOCL: {
    name: 'Orient Overseas Container Line (OOCL)',
    trackingUrl: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx',
    buildQueryUrl: (c) => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?AN=${encodeURIComponent(c)}`,
  },
  SITC: {
    name: 'SITC Container Lines',
    trackingUrl: 'http://www.sitcline.com/',
  },
  KMTC: {
    name: 'Korea Marine Transport (KMTC)',
    trackingUrl: 'https://www.ekmtc.com/',
  },
  'TS LINES': {
    name: 'TS Lines',
    trackingUrl: 'https://www.tslines.com/',
  },
  TS_LINES: {
    name: 'TS Lines',
    trackingUrl: 'https://www.tslines.com/',
  },
};

/**
 * Returns the direct official tracking website URL for a shipping line.
 * If containerNumber is provided, deep-links directly into the carrier's query portal where possible.
 */
export function getCarrierTrackingUrl(
  shippingLine?: string,
  containerNumber?: string,
  customWebsite?: string
): string {
  const lineKey = (shippingLine || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  const rawKey = (shippingLine || '').trim().toUpperCase();
  const cleanContainer = (containerNumber || '').trim();

  const carrier = CARRIER_TRACKING_MAP[lineKey] || CARRIER_TRACKING_MAP[rawKey];

  if (carrier) {
    if (cleanContainer && carrier.buildQueryUrl) {
      return carrier.buildQueryUrl(cleanContainer);
    }
    return carrier.trackingUrl;
  }

  // If a custom website was provided in the database (e.g. from ShippingLineManager)
  if (customWebsite && customWebsite.trim()) {
    let site = customWebsite.trim();
    if (!/^https?:\/\//i.test(site)) {
      site = `https://${site}`;
    }
    return site;
  }

  // Universal fallback: Track-Trace or Carrier search
  if (cleanContainer) {
    return `https://www.track-trace.com/container?number=${encodeURIComponent(cleanContainer)}`;
  }

  if (shippingLine && shippingLine.trim()) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${shippingLine.trim()} container tracking website`)}`;
  }

  return 'https://www.track-trace.com/container';
}
