import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { isAdminAuthenticated } from '@/lib/auth';
import { runChinaWarehouseSync } from '@/lib/chinaSyncEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleChinaSync(req);
}

export async function POST(req: NextRequest) {
  return handleChinaSync(req);
}

async function handleChinaSync(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = CONFIG.CRON_SECRET;
  const querySecret = req.nextUrl?.searchParams?.get('secret');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const isAuthorized =
    isVercelCron ||
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    isAdminAuthenticated(req);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized cron execution' }, { status: 401 });
  }

  try {
    const daysBackParam = req.nextUrl?.searchParams?.get('days');
    const daysBack = daysBackParam ? parseInt(daysBackParam, 10) : 3;

    const result = await runChinaWarehouseSync({
      mode: 'sync',
      warehouse: 'ALL',
      daysBack,
    });

    return NextResponse.json({
      success: true,
      message: 'China Warehouse Auto-Sync Completed',
      data: result,
    });
  } catch (err: any) {
    console.error('[Cron China Sync] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'China Warehouse sync failed',
      },
      { status: 500 }
    );
  }
}
