import { NextRequest, NextResponse } from 'next/server';
import { fetchApiKeyStats } from '@/lib/jsoncargo';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await fetchApiKeyStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch API stats' },
      { status: 500 }
    );
  }
}
