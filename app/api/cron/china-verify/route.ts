import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { isAdminAuthenticated } from '@/lib/auth';
import { runChinaWarehouseSync, SyncMode } from '@/lib/chinaSyncEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleChinaVerify(req);
}

export async function POST(req: NextRequest) {
  return handleChinaVerify(req);
}

async function handleChinaVerify(req: NextRequest) {
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
    const type = req.nextUrl?.searchParams?.get('type') || 'daily';
    let mode: SyncMode = 'verify_24h';
    let daysBack = 2;

    if (type === 'sunday') {
      mode = 'audit_sunday';
      daysBack = 7;
    } else if (type === 'month') {
      mode = 'audit_month';
      daysBack = 30;
    }

    const result = await runChinaWarehouseSync({
      mode,
      warehouse: 'ALL',
      daysBack,
    });

    return NextResponse.json({
      success: true,
      message: `China Warehouse ${mode} verification finished`,
      data: result,
    });
  } catch (err: any) {
    console.error('[Cron China Verify] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'China Warehouse verify failed',
      },
      { status: 500 }
    );
  }
}
