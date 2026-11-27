/**
 * Intelligent Carrier Detection Engine powered by Google Gemini AI
 * Identifies official Ocean Shipping Lines from ISO 6346 Container Numbers & BIC prefixes,
 * updates Container/Shipment records, and auto-registers new Shipping Lines in the database.
 */

import { CONFIG } from '@/lib/config';
import ApiUsageLog from '@/models/ApiUsageLog';

const GEMINI_API_KEY = CONFIG.GEMINI_API_KEY;
const MODEL = 'gemini-3.5-flash-lite';

export interface CarrierDetectionResult {
  containerNumber: string;
  prefix: string;
  canonicalCode: string;   // e.g. 'CMA_CGM', 'OOCL', 'COSCO', 'MSC', 'MAERSK', 'HMM', 'ONE', 'HAPAG_LLOYD', 'WAN_HAI'
  displayName: string;     // e.g. 'CMA CGM Group'
  website: string;         // e.g. 'https://www.cma-cgm.com/ebusiness/tracking'
  isLeasingBox?: boolean;
  leasingOwner?: string;   // e.g. 'Seaco Global', 'Beacon Intermodal', 'Textainer'
  confidence?: 'high' | 'medium';
}

// Built-in verified knowledge base for instant zero-latency mapping of common prefixes
export const VERIFIED_PREFIX_MAP: Record<string, { code: string; name: string; website: string }> = {
  // MSC (Mediterranean Shipping Company)
  'MSCU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },
  'MEDU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },
  'MSMU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },
  'MSTU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },

  // MAERSK
  'MAEU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'MSKU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'MSFU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'MRAU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'MRSU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'MRKU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'SUDU': { code: 'MAERSK', name: 'Hamburg Süd / Maersk', website: 'https://www.maersk.com/tracking/' },

  // CMA CGM
  'CMAU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'APZU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'ECXU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'CGMU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'ECMU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'APHU': { code: 'CMA_CGM', name: 'APL / CMA CGM', website: 'https://www.cma-cgm.com/ebusiness/tracking' },

  // COSCO SHIPPING
  'COSU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'CBHU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'CCLU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'CSQU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'CSGU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'CSNU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },

  // OOCL (Orient Overseas Container Line)
  'OOLU': { code: 'OOCL', name: 'Orient Overseas Container Line', website: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  'OOCU': { code: 'OOCL', name: 'Orient Overseas Container Line', website: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },

  // HAPAG-LLOYD
  'HLCU': { code: 'HAPAG_LLOYD', name: 'Hapag-Lloyd', website: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html' },
  'HLXU': { code: 'HAPAG_LLOYD', name: 'Hapag-Lloyd', website: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html' },

  // ONE (Ocean Network Express)
  'ONEU': { code: 'ONE', name: 'Ocean Network Express', website: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'NYKU': { code: 'ONE', name: 'Ocean Network Express', website: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'MOLU': { code: 'ONE', name: 'Ocean Network Express', website: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'KLFU': { code: 'ONE', name: 'Ocean Network Express', website: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },

  // EVERGREEN
  'EMCU': { code: 'EVERGREEN', name: 'Evergreen Marine Corp', website: 'https://www.shipmentlink.com/servlet/TTrk_Tracking' },
  'EISU': { code: 'EVERGREEN', name: 'Evergreen Marine Corp', website: 'https://www.shipmentlink.com/servlet/TTrk_Tracking' },
  'EGHU': { code: 'EVERGREEN', name: 'Evergreen Marine Corp', website: 'https://www.shipmentlink.com/servlet/TTrk_Tracking' },
  'UGMU': { code: 'EVERGREEN', name: 'Evergreen Marine Corp', website: 'https://www.shipmentlink.com/servlet/TTrk_Tracking' },

  // HMM (Hyundai Merchant Marine)
  'HDMU': { code: 'HMM', name: 'Hyundai Merchant Marine', website: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp' },
  'HMMU': { code: 'HMM', name: 'Hyundai Merchant Marine', website: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp' },
  'KOCU': { code: 'HMM', name: 'Hyundai Merchant Marine', website: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp' },

  // YANG MING
  'YMLU': { code: 'YANG_MING', name: 'Yang Ming Marine Transport', website: 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx' },
  'YMCU': { code: 'YANG_MING', name: 'Yang Ming Marine Transport', website: 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx' },

  // ZIM
  'ZIMU': { code: 'ZIM', name: 'Zim Integrated Shipping Services', website: 'https://www.zim.com/tools/track-a-shipment' },
  'ZCSU': { code: 'ZIM', name: 'Zim Integrated Shipping Services', website: 'https://www.zim.com/tools/track-a-shipment' },

  // PIL
  'PILU': { code: 'PIL', name: 'Pacific International Lines', website: 'https://www.pilship.com/en-our-track-and-trace/120.html' },
  'PCIU': { code: 'PIL', name: 'Pacific International Lines', website: 'https://www.pilship.com/en-our-track-and-trace/120.html' },

  // WAN HAI
  'WHLU': { code: 'WAN_HAI', name: 'Wan Hai Lines Ltd', website: 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml' },

  // SITC
  'SITU': { code: 'SITC', name: 'SITC Container Lines', website: 'http://www.sitcline.com/' },

  // KMTC
  'KMTC': { code: 'KMTC', name: 'Korea Marine Transport', website: 'https://www.ekmtc.com/' },

  // TS LINES
  'TSEU': { code: 'TS_LINES', name: 'TS Lines', website: 'https://www.tslines.com/' },
};

// Built-in verified Master Bill of Lading (B/L) prefix map
export const VERIFIED_BL_PREFIX_MAP: Record<string, { code: string; name: string; website: string }> = {
  'COAU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'COSU': { code: 'COSCO', name: 'COSCO SHIPPING Lines Co', website: 'https://lines.coscoshipping.com/home/cargotracking' },
  'MEDU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },
  'MSCU': { code: 'MSC', name: 'Mediterranean Shipping Company', website: 'https://www.msc.com/en/track-a-shipment' },
  'GGZ':  { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'CMAU': { code: 'CMA_CGM', name: 'CMA CGM Group', website: 'https://www.cma-cgm.com/ebusiness/tracking' },
  'MAEU': { code: 'MAERSK', name: 'A.P. Moller - Maersk', website: 'https://www.maersk.com/tracking/' },
  'ONEY': { code: 'ONE', name: 'Ocean Network Express', website: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking' },
  'EGLV': { code: 'EVERGREEN', name: 'Evergreen Marine Corp', website: 'https://www.shipmentlink.com/servlet/TTrk_Tracking' },
  'OOLU': { code: 'OOCL', name: 'Orient Overseas Container Line', website: 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx' },
  'HLCU': { code: 'HAPAG_LLOYD', name: 'Hapag-Lloyd', website: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html' },
  'HDMU': { code: 'HMM', name: 'Hyundai Merchant Marine', website: 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp' },
  'WHLU': { code: 'WAN_HAI', name: 'Wan Hai Lines Ltd', website: 'https://www.wanhai.com/views/cargoTracking/cargoTracking.xhtml' },
};

/**
 * Identify carrier for a single container number and/or B/L number using Gemini AI with BIC & B/L prefix resolution
 */
export async function detectCarrierWithGemini(
  containerNumber: string,
  existingCarrier?: string,
  blNumber?: string
): Promise<CarrierDetectionResult> {
  const clean = String(containerNumber || '').trim().toUpperCase();
  const cleanBL = String(blNumber || '').trim().toUpperCase();
  const prefixMatch = clean.match(/^[A-Z]{4}/);
  const prefix = prefixMatch ? prefixMatch[0] : '';

  // 1. Check verified B/L prefix first if provided
  if (cleanBL) {
    for (const [blPre, known] of Object.entries(VERIFIED_BL_PREFIX_MAP)) {
      if (cleanBL.startsWith(blPre)) {
        return {
          containerNumber: clean,
          prefix,
          canonicalCode: known.code,
          displayName: known.name,
          website: known.website,
          confidence: 'high',
        };
      }
    }
  }

  // 2. Quick check in verified container prefix dictionary
  if (prefix && VERIFIED_PREFIX_MAP[prefix]) {
    const known = VERIFIED_PREFIX_MAP[prefix];
    return {
      containerNumber: clean,
      prefix,
      canonicalCode: known.code,
      displayName: known.name,
      website: known.website,
      confidence: 'high',
    };
  }

  // Call Gemini API for smart prefix and carrier disambiguation
  const startTime = Date.now();
  try {
    const prompt = `You are a world-class maritime container tracking, B/L, and ISO 6346 BIC registry expert.
Given:
- ISO container number: "${clean}" (prefix "${prefix}")
- Bill of Lading (B/L) number: "${cleanBL || 'Not provided'}"
- Existing assigned carrier: "${existingCarrier || 'None'}"

Identify the true official Ocean Shipping Line or Container Operating Carrier company using whichever of container number or B/L number is available and most reliable.
Note: Some containers are leased from container leasing companies (such as Seaco GESU/SEGU, Beacon BEAU/BMOU, Textainer TCKU/TCLU/TXGU, Florens FSCU/FFAU, Triton TRHU/TGHU, CAI CAJU/CAAU, Touax TLLU, Triton TCNU/TIIU). For leased containers:
- If an existing assigned carrier is valid, retain that carrier and confirm it.
- If no existing carrier or if assigned as a generic default (like MSC), determine the most standard shipping line operating this box on China-to-India maritime lanes, or the leasing owner's primary commercial line.
Return strictly a valid JSON object with:
{
  "canonicalCode": "UPPERCASE_CODE", // e.g. "CMA_CGM", "COSCO", "MSC", "MAERSK", "HMM", "OOCL", "ONE", "HAPAG_LLOYD", "SEACO", "BEACON", "WAN_HAI", "SITC"
  "displayName": "Official Full Company Name", // e.g. "CMA CGM Group" or "Seaco Global / Ocean Network Express"
  "website": "https://carrier-official-tracking-url",
  "isLeasingBox": true or false,
  "leasingOwner": "Name of leasing company if applicable"
}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      const data = await resp.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      // Record log in ApiUsageLog
      const promptTokens = data?.usageMetadata?.promptTokenCount || 0;
      const candidateTokens = data?.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data?.usageMetadata?.totalTokenCount || (promptTokens + candidateTokens);

      try {
        const { connectToDatabase } = await import('@/lib/mongodb');
        await connectToDatabase();
        await ApiUsageLog.create({
          apiName: 'gemini',
          action: 'detect_carrier',
          endpoint: `models/${MODEL}:generateContent`,
          model: MODEL,
          status: 'success',
          itemCount: 1,
          tokensPrompt: promptTokens,
          tokensResponse: candidateTokens,
          tokensTotal: totalTokens,
          latencyMs,
          metadata: { containerNumber: clean, detectedCarrier: parsed.canonicalCode },
        });
      } catch {}

      return {
        containerNumber: clean,
        prefix,
        canonicalCode: (parsed.canonicalCode || existingCarrier || 'MSC').toUpperCase().replace(/[-\s]/g, '_'),
        displayName: parsed.displayName || parsed.canonicalCode,
        website: parsed.website || 'https://www.track-trace.com/container',
        isLeasingBox: parsed.isLeasingBox,
        leasingOwner: parsed.leasingOwner,
        confidence: 'high',
      };
    }
  } catch (err: any) {
    console.warn(`[Carrier Detect] Gemini call failed for ${clean}:`, err?.message);
  }

  // Fallback
  return {
    containerNumber: clean,
    prefix,
    canonicalCode: existingCarrier || 'MSC',
    displayName: existingCarrier || 'Mediterranean Shipping Company',
    website: 'https://www.msc.com/en/track-a-shipment',
    confidence: 'medium',
  };
}

/**
 * Batch detect and verify carriers for multiple containers using Gemini AI
 */
export async function batchDetectCarriersWithGemini(
  containers: Array<{ containerNumber: string; existingCarrier?: string }>
): Promise<Record<string, CarrierDetectionResult>> {
  const results: Record<string, CarrierDetectionResult> = {};
  if (!containers || containers.length === 0) return results;

  const toFetchWithGemini: Array<{ containerNumber: string; existingCarrier?: string; prefix: string }> = [];

  // Check known map first
  for (const item of containers) {
    const clean = String(item.containerNumber || '').trim().toUpperCase();
    if (!clean) continue;
    const prefixMatch = clean.match(/^[A-Z]{4}/);
    const prefix = prefixMatch ? prefixMatch[0] : '';

    if (prefix && VERIFIED_PREFIX_MAP[prefix]) {
      const known = VERIFIED_PREFIX_MAP[prefix];
      results[clean] = {
        containerNumber: clean,
        prefix,
        canonicalCode: known.code,
        displayName: known.name,
        website: known.website,
        confidence: 'high',
      };
    } else {
      toFetchWithGemini.push({ containerNumber: clean, existingCarrier: item.existingCarrier, prefix });
    }
  }

  if (toFetchWithGemini.length === 0) {
    return results;
  }

  // Batch query Gemini for unknown / leasing prefixes
  const startTime = Date.now();
  try {
    const prompt = `You are a maritime shipping line and container fleet expert.
For each of these container numbers and their 4-letter BIC prefixes, identify the correct Ocean Shipping Line / Operating Carrier Company Name.
Input:
${JSON.stringify(toFetchWithGemini.map((c) => ({ container: c.containerNumber, prefix: c.prefix, currentCarrier: c.existingCarrier })))}

Rules:
1. For carrier-owned boxes (e.g. CMAU -> CMA CGM, OOLU -> OOCL, COSU -> COSCO, MSCU -> MSC, MAEU/MRSU/SUDU -> Maersk, ONEU -> ONE, HDMU -> HMM), accurately assign the shipping line.
2. For leasing boxes (e.g. FFAU, BEAU, TCKU, TLLU, SEGU, FCIU, DFSU, TCLU, TIIU, TGHU, TXGU):
   - If currentCarrier is already a specific major carrier (like CMA_CGM, COSCO, MAERSK, HMM, HAPAG-LLOYD) and not a generic default, retain and confirm that carrier.
   - If currentCarrier is 'MSC' but the box is typically chartered or leased by another carrier on China-India routes, specify the most appropriate carrier or owner.
3. Return strictly a JSON object where keys are the container numbers and values are:
   {
     "canonicalCode": "CODE_IN_UPPERCASE",
     "displayName": "Full Company Name",
     "website": "https://official-tracking-url"
   }`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      const data = await resp.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      const promptTokens = data?.usageMetadata?.promptTokenCount || 0;
      const candidateTokens = data?.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data?.usageMetadata?.totalTokenCount || (promptTokens + candidateTokens);

      try {
        const { connectToDatabase } = await import('@/lib/mongodb');
        await connectToDatabase();
        await ApiUsageLog.create({
          apiName: 'gemini',
          action: 'batch_detect_carriers',
          endpoint: `models/${MODEL}:generateContent`,
          model: MODEL,
          status: 'success',
          itemCount: toFetchWithGemini.length,
          tokensPrompt: promptTokens,
          tokensResponse: candidateTokens,
          tokensTotal: totalTokens,
          latencyMs,
          metadata: { batchSize: toFetchWithGemini.length },
        });
      } catch {}

      for (const item of toFetchWithGemini) {
        const detected = parsed[item.containerNumber] || parsed[item.prefix];
        if (detected) {
          results[item.containerNumber] = {
            containerNumber: item.containerNumber,
            prefix: item.prefix,
            canonicalCode: String(detected.canonicalCode || item.existingCarrier || 'MSC').toUpperCase().replace(/[-\s]/g, '_'),
            displayName: detected.displayName || detected.canonicalCode,
            website: detected.website || 'https://www.track-trace.com/container',
            confidence: 'high',
          };
        } else {
          results[item.containerNumber] = {
            containerNumber: item.containerNumber,
            prefix: item.prefix,
            canonicalCode: item.existingCarrier || 'MSC',
            displayName: item.existingCarrier || 'Mediterranean Shipping Company',
            website: 'https://www.msc.com/en/track-a-shipment',
            confidence: 'medium',
          };
        }
      }
      return results;
    }
  } catch (err: any) {
    console.warn('[Carrier Detect] Batch Gemini call failed:', err?.message);
  }

  // Fallback to existing
  for (const item of toFetchWithGemini) {
    results[item.containerNumber] = {
      containerNumber: item.containerNumber,
      prefix: item.prefix,
      canonicalCode: item.existingCarrier || 'MSC',
      displayName: item.existingCarrier || 'Mediterranean Shipping Company',
      website: 'https://www.msc.com/en/track-a-shipment',
      confidence: 'medium',
    };
  }

  return results;
}

/**
 * Ensures a shipping line is registered in the MongoDB ShippingLine collection.
 * If not present, creates it with active: true and website tracking link.
 */
export async function ensureShippingLineExists(carrierData: {
  canonicalCode: string;
  displayName: string;
  prefix?: string;
  website?: string;
}): Promise<void> {
  try {
    const { connectToDatabase } = await import('@/lib/mongodb');
    await connectToDatabase();
    const ShippingLine = (await import('@/models/ShippingLine')).default;

    const code = carrierData.canonicalCode.trim().toUpperCase();
    if (!code) return;

    const existing = await ShippingLine.findOne({ name: code });
    if (!existing) {
      await ShippingLine.create({
        name: code,
        displayName: carrierData.displayName || code,
        prefix: carrierData.prefix || '',
        website: carrierData.website || '',
        active: true,
      });
      console.log(`[ShippingLine] Auto-registered new carrier in DB: ${code} (${carrierData.displayName})`);
    } else {
      // Append prefix if not in prefix list
      if (carrierData.prefix && existing.prefix && !existing.prefix.includes(carrierData.prefix)) {
        existing.prefix = `${existing.prefix}, ${carrierData.prefix}`;
        if (!existing.website && carrierData.website) {
          existing.website = carrierData.website;
        }
        await existing.save();
      }
    }
  } catch (err: any) {
    console.warn('[ShippingLine] ensureShippingLineExists error:', err?.message);
  }
}
