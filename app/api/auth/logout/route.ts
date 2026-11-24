import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out' });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    expires: new Date(0),
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  });
  return response;
}
