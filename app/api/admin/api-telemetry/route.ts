import { NextRequest, NextResponse } from 'next/server';
import { isDeveloperAuthenticated } from '@/lib/auth';
import { getGeminiApiTelemetry } from '@/lib/geminiTranslate';
import { fetchApiKeyStats } from '@/lib/jsoncargo';
import { connectToDatabase } from '@/lib/mongodb';
import ApiUsageLog from '@/models/ApiUsageLog';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // STRICT RULE: Only Developer accounts have access to Developer Telemetry & API Usage
  if (!isDeveloperAuthenticated(req)) {
    return NextResponse.json(
      { error: 'Forbidden: API telemetry and usage metrics are strictly restricted to the Developer Console.' },
      { status: 403 }
    );
  }

  try {
    await connectToDatabase();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Fetch Google Gemini AI Telemetry
    const geminiTelemetry = await getGeminiApiTelemetry();

    // 2. Fetch Container Tracking API Telemetry
    const jsonCargoStats = await fetchApiKeyStats();
    const trackingCallsInDb = await Container.aggregate([
      { $group: { _id: null, totalCalls: { $sum: '$apiCallCount' }, trackedCount: { $sum: { $cond: ['$apiCalled', 1, 0] } } } },
    ]);
    const totalTrackingCallsUsed = trackingCallsInDb[0]?.totalCalls || 0;

    // 3. Fetch China Warehouse Portal Sync Telemetry
    const chinaSyncCallsToday = await ApiUsageLog.countDocuments({
      apiName: 'china_warehouse',
      createdAt: { $gte: startOfToday },
    });
    const chinaSyncCallsTotal = await ApiUsageLog.countDocuments({
      apiName: 'china_warehouse',
    });
    const totalStockCount = await WarehouseReceipt.countDocuments();

    // 4. Summary of all plugged-in APIs
    const pluginApis = [
      {
        id: 'gemini',
        name: 'Google Gemini AI Engine',
        category: 'AI Translation & NLP',
        status: geminiTelemetry.configured ? 'active' : 'not_configured',
        models: [geminiTelemetry.modelPrimary, geminiTelemetry.modelFallback],
        dailyLimit: geminiTelemetry.limitDaily,
        callsToday: geminiTelemetry.callsToday,
        remainingToday: geminiTelemetry.remainingDaily,
        usagePercent: geminiTelemetry.usagePercentDaily,
        tokensToday: geminiTelemetry.tokensToday,
        tokensTotal: geminiTelemetry.tokensTotal,
        callsTotal: geminiTelemetry.callsTotal,
        avgLatencyMs: geminiTelemetry.avgLatencyMs,
        successRate: geminiTelemetry.successRate,
        description: 'Translates Chinese commodity names, packaging, delivery parties, and logistics remarks into standard English.',
      },
      {
        id: 'china_warehouse',
        name: 'China Warehouse Portal (zg.kuaisongkj.com)',
        category: 'Automated Ingestion Scraper',
        status: 'active',
        endpoints: ['GZ (RS-21)', 'YW (AS-14)', 'YW-55 (YW-55)'],
        dailyLimit: 5000,
        callsToday: chinaSyncCallsToday,
        remainingToday: Math.max(0, 5000 - chinaSyncCallsToday),
        usagePercent: Number(((chinaSyncCallsToday / 5000) * 100).toFixed(1)),
        callsTotal: chinaSyncCallsTotal,
        totalInventoryCount: totalStockCount,
        description: 'Automated scraping and session synchronization with Kuaisong China logistics portals for warehouse receipt inventory.',
      },
      {
        id: 'jsoncargo',
        name: 'Ocean Carrier Tracking Engine (JSONCargo)',
        category: 'Container Tracking & Maritime ETA',
        status: jsonCargoStats.status === 'configured' ? 'active' : 'idle',
        plan: jsonCargoStats.plan || 'Direct Container Engine',
        dailyLimit: jsonCargoStats.requests_total || 10000,
        callsToday: totalTrackingCallsUsed,
        remainingToday: Math.max(0, (jsonCargoStats.requests_total || 10000) - totalTrackingCallsUsed),
        usagePercent: Number(((totalTrackingCallsUsed / (jsonCargoStats.requests_total || 10000)) * 100).toFixed(1)),
        callsTotal: totalTrackingCallsUsed,
        description: 'Fetches ocean shipping line container tracking milestones, vessel names, voyages, and destination ETAs.',
      },
      {
        id: 'typesense',
        name: 'Typesense Search Engine',
        category: 'In-Memory Fast Search',
        status: 'active',
        dailyLimit: 100000,
        callsToday: totalStockCount,
        remainingToday: Math.max(0, 100000 - totalStockCount),
        usagePercent: Number(((totalStockCount / 100000) * 100).toFixed(1)),
        callsTotal: totalStockCount,
        description: 'Sub-millisecond typo-tolerant full-text search indexing for China warehouse receipts and shipment containers.',
      },
    ];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pluginsCount: pluginApis.length,
      pluginApis,
      gemini: geminiTelemetry,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch API telemetry' },
      { status: 500 }
    );
  }
}
