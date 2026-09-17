import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    const expectedAdminPassword = process.env.ADMIN_PASSWORD || 'Afsana1234';
    const expectedEmployeePassword = process.env.EADMIN_PASSWORD || 'Afsana4321';
    const expectedBillerPassword = process.env.BILLER_PASSWORD || 'biller123';
    const expectedDispatcherPassword = process.env.DISPATCHER_PASSWORD || 'dispatch123';

    let role: 'admin' | 'staff' | 'biller' | 'dispatcher' | null = null;

    if (password === expectedAdminPassword) {
      role = 'admin';
    } else if (
      password === expectedEmployeePassword ||
      password === process.env.STAFF_PASSWORD ||
      password === process.env.ADMIN2_PASSWORD
    ) {
      role = 'staff';
    } else if (password === expectedBillerPassword) {
      role = 'biller';
    } else if (password === expectedDispatcherPassword) {
      role = 'dispatcher';
    }

    if (!role) {
      return NextResponse.json(
        { error: 'Invalid password. Please enter valid Super Admin, Employee, Biller, or Dispatcher credentials.' },
        { status: 401 }
      );
    }

    const token = signAdminToken(role);

    let redirectTo = '/admin';
    let roleName = 'Super Admin';
    if (role === 'staff') {
      redirectTo = '/admin/view';
      roleName = 'Internal Employee';
    } else if (role === 'biller') {
      redirectTo = '/biller';
      roleName = 'Biller';
    } else if (role === 'dispatcher') {
      redirectTo = '/dispatcher';
      roleName = 'Dispatcher';
    }

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${roleName}`,
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
