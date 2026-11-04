import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  // Authorization check: Bearer CRON_SECRET, x-vercel-cron header, ?secret= query, or Admin session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'cron_secret_bearer_token_998877';
  const querySecret = req.nextUrl?.searchParams?.get('secret');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const isCronAuthorized =
    isVercelCron ||
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret;
  const isAdmin = isAdminAuthenticated(req);

  if (!isCronAuthorized && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized cron execution' }, { status: 401 });
  }

  // Automatic API tracking is stopped for all containers per system configuration
  return NextResponse.json({
    success: true,
    message: 'Automatic API tracking has been stopped for all containers.',
    timestamp: new Date().toISOString(),
    syncedCount: 0,
    skippedCount: 0,
    totalContainers: 0,
    apiTrackingStopped: true,
  });
}
