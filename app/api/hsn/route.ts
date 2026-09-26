import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ItemHsn from '@/models/ItemHsn';
import { findHsnSuggestions, inferHsnByItemName, MASTER_HSN_CATALOG } from '@/lib/hsnCatalog';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || searchParams.get('query')?.trim() || '';

    const suggestions: any[] = [];
    const seenHsn = new Set<string>();

    // 1. Search in user-saved / auto-learned MongoDB database
    if (query) {
      const cleanUpper = query.toUpperCase();
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      const dbMatches = await ItemHsn.find({
        $or: [
          { itemName: regex },
          { hsnCode: new RegExp(`^${escaped}`) },
          { description: regex },
        ],
      })
        .sort({ usageCount: -1, updatedAt: -1 })
        .limit(10)
        .lean();

      for (const item of dbMatches) {
        suggestions.push({
          hsnCode: item.hsnCode,
          itemName: item.itemName,
          category: item.category || 'User Saved',
          gstRate: item.gstRate || 18,
          description: item.description || '',
          source: item.source || 'user_saved',
          isUserSaved: true,
        });
        seenHsn.add(item.hsnCode);
      }
    }

    // 2. Search in Master HSN Catalog
    const catalogMatches = findHsnSuggestions(query);
    for (const catItem of catalogMatches) {
      if (!seenHsn.has(catItem.hsnCode)) {
        suggestions.push({
          hsnCode: catItem.hsnCode,
          itemName: catItem.itemName,
          category: catItem.category,
          gstRate: catItem.gstRate,
          description: catItem.description,
          source: 'catalog',
          isUserSaved: false,
        });
        seenHsn.add(catItem.hsnCode);
      }
    }

    // 3. Single best inference if query was provided
    const bestInference = query ? inferHsnByItemName(query) : null;

    return NextResponse.json({
      success: true,
      query,
      suggestions: suggestions.slice(0, 15),
      inferredHsn: bestInference?.hsnCode || null,
    });
  } catch (error: any) {
    console.error('Error fetching HSN suggestions:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch HSN suggestions' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { itemName, hsnCode, description, category, gstRate, source } = body;

    const cleanItemName = String(itemName || '').trim().toUpperCase();
    const cleanHsn = String(hsnCode || '').trim();

    if (!cleanItemName || !cleanHsn) {
      return NextResponse.json(
        { error: 'Item Name and HSN Code are required to link' },
        { status: 400 }
      );
    }

    const updated = await ItemHsn.findOneAndUpdate(
      { itemName: cleanItemName },
      {
        $set: {
          hsnCode: cleanHsn,
          description: (description || '').trim(),
          category: (category || 'General Cargo').trim(),
          gstRate: typeof gstRate === 'number' ? gstRate : 18,
          source: source || 'user_saved',
        },
        $inc: { usageCount: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      success: true,
      message: `HSN ${cleanHsn} successfully linked to "${cleanItemName}"`,
      itemHsn: updated,
    });
  } catch (error: any) {
    console.error('Error linking Item to HSN:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to link item and HSN' },
      { status: 500 }
    );
  }
}
