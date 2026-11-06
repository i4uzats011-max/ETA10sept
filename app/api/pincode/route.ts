import { NextRequest, NextResponse } from 'next/server';
import { searchPincodes, autoDetectPincodeFromAddress, extractPincodeFromAddress, POPULAR_PINCODES } from '@/lib/pincodeUtils';
import { getStateCode } from '@/lib/states';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';
    const address = searchParams.get('address')?.trim() || '';

    // If an address is passed directly for auto-detection
    if (address) {
      const detected = autoDetectPincodeFromAddress(address);
      const explicitPin = extractPincodeFromAddress(address);
      return NextResponse.json({
        success: true,
        detectedPincode: detected?.pincode || explicitPin || null,
        detectedEntry: detected,
        matches: searchPincodes(address, 6),
      });
    }

    if (!query) {
      return NextResponse.json({
        success: true,
        results: POPULAR_PINCODES.slice(0, 10),
      });
    }

    // 1. Search in local high-speed dictionary
    let results = searchPincodes(query, 10);

    // 2. If fewer than 2 results and query has sufficient length, query Postal Pincode API as fallback
    if (results.length < 2 && query.length >= 3) {
      try {
        const isNumeric = /^\d{3,6}$/.test(query);
        const url = isNumeric
          ? `https://api.postalpincode.in/pincode/${encodeURIComponent(query)}`
          : `https://api.postalpincode.in/postoffice/${encodeURIComponent(query.split(/[\s,]+/)[0])}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const apiRes = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (apiRes.ok) {
          const data = await apiRes.json();
          if (Array.isArray(data) && data[0]?.Status === 'Success' && Array.isArray(data[0]?.PostOffice)) {
            const apiEntries = data[0].PostOffice.slice(0, 6).map((po: any) => ({
              pincode: po.Pincode,
              area: po.Name,
              city: po.District || po.Block || '',
              district: po.District || '',
              state: po.State || '',
              stateCode: getStateCode(po.State || '') || '07',
            }));
            results = [...results, ...apiEntries];
          }
        }
      } catch (e) {
        // Fallback silently if offline or API slow
      }
    }

    return NextResponse.json({
      success: true,
      query,
      results,
    });
  } catch (error: any) {
    console.error('Pincode search error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to search PIN codes' },
      { status: 500 }
    );
  }
}
