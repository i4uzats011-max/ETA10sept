/**
 * Google Gemini AI Translation Engine for China Warehouse Commodities & Logistics Terms
 * High-performance, fault-tolerant translation with in-memory caching, fallback dictionary,
 * and comprehensive API usage logging for Developer Panel telemetry.
 */

import { translateCommodity, translatePackaging, hasChineseCharacters } from '@/lib/translate';
import { CONFIG } from '@/lib/config';
import ApiUsageLog from '@/models/ApiUsageLog';

const GEMINI_API_KEY = CONFIG.GEMINI_API_KEY;

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

// Gemini limits
export const GEMINI_LIMITS = {
  DAILY_REQUEST_LIMIT: 1500, // Google Gemini Flash Free Tier Daily Request Quota
  RPM_LIMIT: 15,             // Requests Per Minute Limit
  TPM_LIMIT: 1000000,        // Tokens Per Minute Limit
};

// In-memory cache for translated terms across invocations
const translationCache = new Map<string, string>();

/**
 * Record API Call in MongoDB ApiUsageLog (non-blocking safe background execution)
 */
async function recordGeminiApiLog(logData: {
  action: string;
  endpoint: string;
  model: string;
  status: 'success' | 'error' | 'fallback_dict';
  itemCount: number;
  tokensPrompt?: number;
  tokensResponse?: number;
  tokensTotal?: number;
  latencyMs: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const { connectToDatabase } = await import('@/lib/mongodb');
    await connectToDatabase();
    await ApiUsageLog.create({
      apiName: 'gemini',
      action: logData.action,
      endpoint: logData.endpoint,
      model: logData.model,
      status: logData.status,
      itemCount: logData.itemCount,
      tokensPrompt: logData.tokensPrompt || 0,
      tokensResponse: logData.tokensResponse || 0,
      tokensTotal: logData.tokensTotal || 0,
      latencyMs: logData.latencyMs,
      errorMessage: logData.errorMessage || '',
      metadata: logData.metadata || {},
    });
  } catch (logErr) {
    console.warn('[Gemini Translate] Failed to persist API usage log:', logErr);
  }
}

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

  const startTime = Date.now();
  let usedModel = PRIMARY_MODEL;
  let responseData: any = null;
  let callStatus: 'success' | 'error' | 'fallback_dict' = 'fallback_dict';
  let errorMsg = '';

  // Attempt translation via Gemini API
  try {
    const prompt = `You are a professional international logistics and customs expert.
Translate the following Chinese logistics commodity names, packaging types, delivery parties, and cargo remarks into clean, concise, standard English cargo terms.
Rules:
1. Return ONLY a valid JSON object where keys are the exact original Chinese strings and values are the English translations.
2. Translate standard items cleanly (e.g. "模具平台" -> "Mold platform", "汽车LED灯" -> "Car LED lights", "汽车启动电源" -> "Car jump starter", "硅胶套管" -> "Silicone sleeve", "撞钉，螺丝" -> "Rivets & Screws", "开关电源" -> "Switching power supply", "套筒" -> "Socket wrench sleeve", "接线端子" -> "Terminal connector", "隔音垫" -> "Sound insulation pad", "汽车功放机" -> "Car audio amplifier", "防水帽" -> "Waterproof cap", "拔叉螺丝" -> "Shift fork screw", "货拉拉" -> "Lalamove / Huolala", "明联电子" -> "Minglian Electronics", "周小姐" -> "Ms. Zhou").
3. Do not include markdown codeblocks, notes, or explanations.

Input JSON:
${JSON.stringify(uniqueToFetch)}`;

    // Try primary fast model
    try {
      usedModel = PRIMARY_MODEL;
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
        callStatus = 'success';
      } else {
        const errText = await resp.text().catch(() => '');
        errorMsg = `Status ${resp.status}: ${errText.slice(0, 200)}`;
      }
    } catch (primaryErr: any) {
      errorMsg = primaryErr?.message || String(primaryErr);
      console.warn(`[Gemini Translate] ${PRIMARY_MODEL} failed, attempting ${FALLBACK_MODEL}...`, primaryErr);
    }

    // Fallback to secondary model if primary didn't succeed
    if (!responseData) {
      try {
        usedModel = FALLBACK_MODEL;
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
          callStatus = 'success';
          errorMsg = '';
        } else {
          const errText2 = await resp2.text().catch(() => '');
          errorMsg += ` | Fallback ${resp2.status}: ${errText2.slice(0, 200)}`;
        }
      } catch (secondaryErr: any) {
        errorMsg += ` | Fallback Error: ${secondaryErr?.message || String(secondaryErr)}`;
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
  } catch (err: any) {
    callStatus = 'error';
    errorMsg = err?.message || String(err);
    console.error('[Gemini Translate] Error during AI translation batch:', err);
  }

  const durationMs = Date.now() - startTime;
  const usageMeta = responseData?.usageMetadata || {};
  const promptTokens = usageMeta.promptTokenCount || 0;
  const responseTokens = usageMeta.candidatesTokenCount || 0;
  const totalTokens = usageMeta.totalTokenCount || (promptTokens + responseTokens);

  // Record Telemetry
  recordGeminiApiLog({
    action: 'batch_translate',
    endpoint: `v1beta/models/${usedModel}:generateContent`,
    model: usedModel,
    status: callStatus,
    itemCount: uniqueToFetch.length,
    tokensPrompt: promptTokens,
    tokensResponse: responseTokens,
    tokensTotal: totalTokens,
    latencyMs: durationMs,
    errorMessage: errorMsg,
    metadata: {
      itemsSample: uniqueToFetch.slice(0, 5),
      successCount: Object.keys(result).length,
    },
  });

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

/**
 * Query Gemini API Usage & Telemetry Stats for Developer Panel
 */
export async function getGeminiApiTelemetry(): Promise<{
  configured: boolean;
  modelPrimary: string;
  modelFallback: string;
  callsToday: number;
  callsThisMonth: number;
  callsTotal: number;
  limitDaily: number;
  remainingDaily: number;
  usagePercentDaily: number;
  tokensToday: number;
  tokensTotal: number;
  avgLatencyMs: number;
  successRate: number;
  recentLogs: any[];
}> {
  const { connectToDatabase } = await import('@/lib/mongodb');
  await connectToDatabase();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [callsTodayCount, callsMonthCount, callsTotalCount, tokenAggToday, tokenAggTotal, recentLogs] = await Promise.all([
    ApiUsageLog.countDocuments({ apiName: 'gemini', createdAt: { $gte: startOfToday } }),
    ApiUsageLog.countDocuments({ apiName: 'gemini', createdAt: { $gte: startOfMonth } }),
    ApiUsageLog.countDocuments({ apiName: 'gemini' }),
    ApiUsageLog.aggregate([
      { $match: { apiName: 'gemini', createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, totalTokens: { $sum: '$tokensTotal' } } },
    ]),
    ApiUsageLog.aggregate([
      { $match: { apiName: 'gemini' } },
      { $group: { _id: null, totalTokens: { $sum: '$tokensTotal' }, avgLatency: { $avg: '$latencyMs' }, successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } } } },
    ]),
    ApiUsageLog.find({ apiName: 'gemini' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const limitDaily = GEMINI_LIMITS.DAILY_REQUEST_LIMIT;
  const remainingDaily = Math.max(0, limitDaily - callsTodayCount);
  const usagePercentDaily = Number(((callsTodayCount / limitDaily) * 100).toFixed(1));

  const tokensToday = tokenAggToday[0]?.totalTokens || 0;
  const tokensTotal = tokenAggTotal[0]?.totalTokens || 0;
  const avgLatencyMs = Math.round(tokenAggTotal[0]?.avgLatency || 0);
  const totalCalls = callsTotalCount || 0;
  const successCalls = tokenAggTotal[0]?.successCount || 0;
  const successRate = totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(1)) : 100;

  return {
    configured: Boolean(GEMINI_API_KEY && GEMINI_API_KEY.length > 10),
    modelPrimary: PRIMARY_MODEL,
    modelFallback: FALLBACK_MODEL,
    callsToday: callsTodayCount,
    callsThisMonth: callsMonthCount,
    callsTotal: callsTotalCount,
    limitDaily,
    remainingDaily,
    usagePercentDaily,
    tokensToday,
    tokensTotal,
    avgLatencyMs,
    successRate,
    recentLogs,
  };
}
