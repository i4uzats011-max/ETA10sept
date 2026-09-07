import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import SyncError from '@/models/SyncError';
import { isStaffOrAdminAuthenticated, isSuperAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all sync errors that occurred within the last 7 days (1 week)
    const recentErrors = await SyncError.find({
      createdAt: { $gte: oneWeekAgo },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Group errors by shipping company
    const carrierGroupMap: Record<
      string,
      {
        shippingLine: string;
        failureCount: number;
        affectedContainers: Set<string>;
        lastFailedAt: Date;
        latestError: string;
        sources: Set<string>;
      }
    > = {};

    // Group errors by unique container
    const containerFailureMap: Record<
      string,
      {
        container: string;
        containerNumber: string;
        shippingLine: string;
        failureCount: number;
        latestError: string;
        lastFailedAt: Date;
        source: string;
      }
    > = {};

    recentErrors.forEach((err: any) => {
      const line = (err.shippingLine || 'MSC').toUpperCase();
      const cntrKey = err.container || err.containerNumber || 'Unknown';

      // Carrier grouping
      if (!carrierGroupMap[line]) {
        carrierGroupMap[line] = {
          shippingLine: line,
          failureCount: 0,
          affectedContainers: new Set(),
          lastFailedAt: err.createdAt,
          latestError: err.errorMessage || 'Sync failed',
          sources: new Set(),
        };
      }
      carrierGroupMap[line].failureCount++;
      if (err.container) carrierGroupMap[line].affectedContainers.add(err.container);
      if (err.containerNumber) carrierGroupMap[line].affectedContainers.add(err.containerNumber);
      if (err.source) carrierGroupMap[line].sources.add(err.source);
      if (new Date(err.createdAt) > new Date(carrierGroupMap[line].lastFailedAt)) {
        carrierGroupMap[line].lastFailedAt = err.createdAt;
        carrierGroupMap[line].latestError = err.errorMessage || 'Sync failed';
      }

      // Container grouping
      if (!containerFailureMap[cntrKey]) {
        containerFailureMap[cntrKey] = {
          container: err.container || '',
          containerNumber: err.containerNumber || '',
          shippingLine: line,
          failureCount: 0,
          latestError: err.errorMessage || 'Sync failed',
          lastFailedAt: err.createdAt,
          source: err.source || 'manual',
        };
      }
      containerFailureMap[cntrKey].failureCount++;
      if (new Date(err.createdAt) > new Date(containerFailureMap[cntrKey].lastFailedAt)) {
        containerFailureMap[cntrKey].lastFailedAt = err.createdAt;
        containerFailureMap[cntrKey].latestError = err.errorMessage || 'Sync failed';
        containerFailureMap[cntrKey].source = err.source || 'manual';
      }
    });

    // ── CARRIER OUTAGE ALERTS (> 5 failures for the same carrier within 1 week) ──
    const carrierOutageAlerts = Object.values(carrierGroupMap)
      .filter((group) => group.failureCount > 5)
      .map((group) => ({
        shippingLine: group.shippingLine,
        failureCount: group.failureCount,
        affectedContainers: Array.from(group.affectedContainers),
        affectedCount: group.affectedContainers.size,
        lastFailedAt: group.lastFailedAt,
        latestError: group.latestError,
        sources: Array.from(group.sources),
        thresholdExceeded: true,
        threshold: 5,
        timeframe: '7 days (1 week)',
        advice: `Carrier Outage Detected: ${group.shippingLine} container sync has failed ${group.failureCount} times in the past 7 days (>5 threshold). Please contact ${group.shippingLine} sales/tech support or JSONCargo team to resolve carrier integration.`,
      }))
      .sort((a, b) => b.failureCount - a.failureCount);

    // Distinct list of containers that failed sync in the last 7 days
    const failedSyncList = Object.values(containerFailureMap)
      .map((c) => ({
        ...c,
        canUpdateManually: true,
      }))
      .sort((a, b) => new Date(b.lastFailedAt).getTime() - new Date(a.lastFailedAt).getTime());

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      timeframeWindow: '7 days',
      totalErrorsInWindow: recentErrors.length,
      carrierOutageAlerts,
      carrierOutageCount: carrierOutageAlerts.length,
      failedSyncList,
      failedSyncCount: failedSyncList.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch carrier sync alerts' },
      { status: 500 }
    );
  }
}

// Clear or dismiss sync errors (Super Admin only)
export async function DELETE(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const shippingLine = searchParams.get('shippingLine');
    const container = searchParams.get('container');

    await connectToDatabase();

    const query: any = {};
    if (shippingLine) query.shippingLine = shippingLine.toUpperCase();
    if (container) query.$or = [{ container }, { containerNumber: container }];

    const deleteResult = await SyncError.deleteMany(query);

    return NextResponse.json({
      success: true,
      message: `Cleared ${deleteResult.deletedCount} sync error records`,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to clear sync errors' },
      { status: 500 }
    );
  }
}
