import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    const expectedAdminPassword = process.env.ADMIN_PASSWORD || 'superadmin123';
    const expectedEmployeePassword = process.env.EADMIN_PASSWORD || 'admin123';

    let role: 'admin' | 'staff' | null = null;

    if (password === expectedAdminPassword) {
      role = 'admin';
    } else if (
      password === expectedEmployeePassword ||
      password === process.env.STAFF_PASSWORD ||
      password === process.env.ADMIN2_PASSWORD
    ) {
      role = 'staff';
    }

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid password. Please enter valid Super Admin or Employee Admin credentials.' },
        { status: 401 }
      );
    }

    const token = signAdminToken(role);

    const redirectTo = role === 'admin' ? '/admin' : '/admin/view';

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${role === 'admin' ? 'Super Admin' : 'Internal Employee (Admin 2)'}`,
      role,
      redirectTo,
    });

    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
