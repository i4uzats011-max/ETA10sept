/**
 * Google Gemini AI Translation Engine for China Warehouse Commodities & Logistics Terms
 * High-performance, fault-tolerant translation with in-memory caching and fallback dictionary.
 */

import { translateCommodity, translatePackaging, hasChineseCharacters } from '@/lib/translate';
import { CONFIG } from '@/lib/config';

const GEMINI_API_KEY = CONFIG.GEMINI_API_KEY;

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

// In-memory cache for translated terms across invocations
const translationCache = new Map<string, string>();

/**
 * Batch translate a list of Chinese terms using Google Gemini Flash API.
 * Automatically deduplicates inputs and caches responses.
 */
export async function batchTranslateWithGemini(
  rawTexts: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!rawTexts || rawTexts.length === 0) return result;

  const toFetch: string[] = [];

  for (const raw of rawTexts) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    // If text does not contain Chinese characters, return it as-is
    if (!hasChineseCharacters(trimmed)) {
      result[trimmed] = trimmed;
      continue;
    }

    // Check in-memory cache first
    if (translationCache.has(trimmed)) {
      result[trimmed] = translationCache.get(trimmed)!;
      continue;
    }

    toFetch.push(trimmed);
  }

  const uniqueToFetch = Array.from(new Set(toFetch));
  if (uniqueToFetch.length === 0) {
    return result;
  }

  // Attempt translation via Gemini API
  try {
    const prompt = `You are a professional international logistics and customs expert.
Translate the following Chinese logistics commodity names, packaging types, and cargo remarks into clean, concise, standard English cargo terms.
Rules:
1. Return ONLY a valid JSON object where keys are the exact original Chinese strings and values are the English translations.
2. Translate standard items cleanly (e.g. "LED车灯" -> "LED headlights", "印刷版" -> "Printing plates", "木架" -> "Wooden frame", "纸箱" -> "Carton", "编织袋" -> "Woven bag").
3. Do not include markdown codeblocks, notes, or explanations.

Input JSON:
${JSON.stringify(uniqueToFetch)}`;

    let responseData: any = null;

    // Try primary fast model
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
          signal: AbortSignal.timeout(15000), // 15s timeout
        }
      );

      if (resp.ok) {
        responseData = await resp.json();
      }
    } catch (primaryErr) {
      console.warn(`[Gemini Translate] ${PRIMARY_MODEL} failed, attempting ${FALLBACK_MODEL}...`, primaryErr);
    }

    // Fallback to secondary model if primary didn't succeed
    if (!responseData) {
      try {
        const resp2 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
            signal: AbortSignal.timeout(15000),
          }
        );
        if (resp2.ok) {
          responseData = await resp2.json();
        }
      } catch (secondaryErr) {
        console.warn(`[Gemini Translate] ${FALLBACK_MODEL} also failed:`, secondaryErr);
      }
    }

    const rawJsonStr = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawJsonStr) {
      const parsedMap = JSON.parse(rawJsonStr);
      for (const [cn, en] of Object.entries(parsedMap)) {
        const cleanEn = String(en).trim();
        if (cleanEn) {
          translationCache.set(cn, cleanEn);
          result[cn] = cleanEn;
        }
      }
    }
  } catch (err) {
    console.error('[Gemini Translate] Error during AI translation batch:', err);
  }

  // For any remaining untranslated items, fallback to built-in dictionary
  for (const cn of uniqueToFetch) {
    if (!result[cn]) {
      const fallback = translateCommodity(cn).english;
      translationCache.set(cn, fallback);
      result[cn] = fallback;
    }
  }

  return result;
}

/**
 * Translate a single commodity description using Gemini with dictionary fallback.
 */
export async function translateWithGemini(text: string): Promise<string> {
  const clean = String(text || '').trim();
  if (!clean) return 'General Merchandise';
  if (!hasChineseCharacters(clean)) return clean;

  if (translationCache.has(clean)) {
    return translationCache.get(clean)!;
  }

  const map = await batchTranslateWithGemini([clean]);
  return map[clean] || translateCommodity(clean).english;
}

/**
 * Helper to produce both clean English and original Chinese commodity fields.
 */
export async function translateReceiptCommodity(
  chineseText?: string
): Promise<{ english: string; chinese: string }> {
  if (!chineseText || !chineseText.trim()) {
    return { english: 'General Merchandise', chinese: '' };
  }
  const clean = chineseText.trim();
  const isChinese = hasChineseCharacters(clean);
  const english = await translateWithGemini(clean);

  return {
    english: english || 'General Merchandise',
    chinese: isChinese ? clean : '',
  };
}

/**
 * Helper to translate packaging type with Gemini / dictionary.
 */
export async function translateReceiptPackaging(packagingText?: string): Promise<string> {
  if (!packagingText || !packagingText.trim()) return 'Carton';
  const clean = packagingText.trim();
  if (!hasChineseCharacters(clean)) return clean;

  const standard = translatePackaging(clean);
  if (standard && standard !== 'Carton') return standard;

  const aiTrans = await translateWithGemini(clean);
  return aiTrans || 'Carton';
}
