import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest, verifyAdminToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const isDev = payload.role === 'developer';
  const hasAdminGrant = isDev ? true : Boolean(payload.adminAccessGranted);

  return NextResponse.json({
    authenticated: true,
    role: payload.role || 'staff',
    username: payload.username || null,
    name: payload.name || null,
    userId: payload.userId || null,
    adminAccessGranted: hasAdminGrant,
  });
}
