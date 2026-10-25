import { NextRequest, NextResponse } from 'next/server';
import {
  searchWarehouseReceiptsTypesense,
  searchContainersTypesense,
  searchUnifiedSuggestions,
  isTypesenseAvailable,
} from '@/lib/typesense';
import { getCache, setCache } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const type = searchParams.get('type') || 'all'; // 'receipt' | 'container' | 'suggestions' | 'all'
  const limit = parseInt(searchParams.get('limit') || '15', 10);

  if (!q) {
    return NextResponse.json({
      success: true,
      query: '',
      results: [],
      suggestions: [],
      typesenseActive: await isTypesenseAvailable(),
    });
  }

  // Priority Public Search Redis Cache Key
  const cacheKey = `public:search:${type}:${limit}:${q.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  try {
    // 1. High-Priority Redis / Memory Cache Check (Instant sub-millisecond response)
    const cachedResponse = await getCache<any>(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse, {
        headers: { 'X-Cache': 'HIT', 'X-Cache-Priority': 'public-search' },
      });
    }

    const typesenseActive = await isTypesenseAvailable();
    let responsePayload: any = null;

    if (type === 'suggestions') {
      const data = await searchUnifiedSuggestions(q, limit);
      responsePayload = {
        success: true,
        query: q,
        typesenseActive,
        suggestions: data.suggestions,
      };
    } else if (type === 'receipt') {
      // NOTE: Receipt numbers are confidential documents! Autocomplete and public fuzzy listing are disabled.
      responsePayload = {
        success: true,
        query: q,
        typesenseActive,
        count: 0,
        results: [],
        message: 'Receipt numbers are confidential documents. Autocomplete is disabled.',
      };
    } else if (type === 'container') {
      const containers = await searchContainersTypesense(q, limit);
      responsePayload = {
        success: true,
        query: q,
        typesenseActive,
        count: containers.length,
        results: containers,
      };
    } else {
      // Default 'all': only return public containers (receipts are confidential documents)
      const containers = await searchContainersTypesense(q, limit);
      responsePayload = {
        success: true,
        query: q,
        typesenseActive,
        receipts: [],
        containers,
        total: containers.length,
      };
    }

    // 2. Save to Priority Redis Cache with 5-minute TTL (300 seconds)
    await setCache(cacheKey, responsePayload, 300);

    return NextResponse.json(responsePayload, {
      headers: { 'X-Cache': 'MISS', 'X-Cache-Priority': 'public-search' },
    });
  } catch (err: any) {
    console.error('[Search API Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Search execution failed' },
      { status: 500 }
    );
  }
}
