import { NextRequest, NextResponse } from 'next/server';
import {
  searchWarehouseReceiptsTypesense,
  searchContainersTypesense,
  searchUnifiedSuggestions,
  isTypesenseAvailable,
} from '@/lib/typesense';

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

  try {
    const typesenseActive = await isTypesenseAvailable();

    if (type === 'suggestions') {
      const data = await searchUnifiedSuggestions(q, limit);
      return NextResponse.json({
        success: true,
        query: q,
        typesenseActive,
        suggestions: data.suggestions,
      });
    }

    if (type === 'receipt') {
      // NOTE: Receipt numbers are confidential documents! Autocomplete and public fuzzy listing are disabled.
      return NextResponse.json({
        success: true,
        query: q,
        typesenseActive,
        count: 0,
        results: [],
        message: 'Receipt numbers are confidential documents. Autocomplete is disabled.',
      });
    }

    if (type === 'container') {
      const containers = await searchContainersTypesense(q, limit);
      return NextResponse.json({
        success: true,
        query: q,
        typesenseActive,
        count: containers.length,
        results: containers,
      });
    }

    // Default 'all': only return public containers (receipts are confidential documents)
    const containers = await searchContainersTypesense(q, limit);

    return NextResponse.json({
      success: true,
      query: q,
      typesenseActive,
      receipts: [],
      containers,
      total: containers.length,
    });
  } catch (err: any) {
    console.error('[Search API Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Search execution failed' },
      { status: 500 }
    );
  }
}
