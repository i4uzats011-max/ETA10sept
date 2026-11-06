import { NextRequest, NextResponse } from 'next/server';
import translate from '@iamtraction/google-translate';

// Server-side in-memory translation cache (preserves API quota & provides sub-millisecond response)
const liveCache = new Map<string, string>();

/**
 * Live Google Translate API Endpoint
 * Translates Chinese to English (or any specified language pair) in real-time
 * without modifying any database records.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, texts, from = 'zh-CN', to = 'en' } = body;

    // 1. Single text translation
    if (typeof text === 'string') {
      const clean = text.trim();
      if (!clean) {
        return NextResponse.json({
          success: true,
          original: text,
          translated: '',
          provider: 'Google Translate'
        });
      }

      const cacheKey = `${from}:${to}:${clean}`;
      if (liveCache.has(cacheKey)) {
        return NextResponse.json({
          success: true,
          original: text,
          translated: liveCache.get(cacheKey),
          cached: true,
          provider: 'Google Translate'
        });
      }

      const res = await translate(clean, { from, to });
      liveCache.set(cacheKey, res.text);

      return NextResponse.json({
        success: true,
        original: text,
        translated: res.text,
        cached: false,
        provider: 'Google Translate'
      });
    }

    // 2. Batch array translation
    if (Array.isArray(texts)) {
      const results = await Promise.all(
        texts.map(async (itemText: string) => {
          const clean = String(itemText || '').trim();
          if (!clean) {
            return { original: itemText, translated: '' };
          }

          const cacheKey = `${from}:${to}:${clean}`;
          if (liveCache.has(cacheKey)) {
            return {
              original: itemText,
              translated: liveCache.get(cacheKey),
              cached: true
            };
          }

          try {
            const res = await translate(clean, { from, to });
            liveCache.set(cacheKey, res.text);
            return {
              original: itemText,
              translated: res.text,
              cached: false
            };
          } catch (err: any) {
            return {
              original: itemText,
              translated: clean,
              error: err?.message || 'Translation failed'
            };
          }
        })
      );

      return NextResponse.json({
        success: true,
        results,
        provider: 'Google Translate'
      });
    }

    return NextResponse.json(
      { error: 'Invalid payload: provide "text" (string) or "texts" (array of strings)' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Live translation failed' },
      { status: 500 }
    );
  }
}
