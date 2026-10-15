import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken, UserRole } from '@/lib/auth';
import { verifyRolePassword, ALL_ROLES } from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, role: requestedRole } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    let authenticatedRole: UserRole | null = null;

    // If explicit role is provided in request
    if (requestedRole && ALL_ROLES.includes(requestedRole as UserRole)) {
      const match = await verifyRolePassword(requestedRole as UserRole, password);
      if (match) {
        authenticatedRole = requestedRole as UserRole;
      }
    }

    // If not authenticated yet, check in priority order:
    // developer -> admin -> staff -> biller -> dispatcher
    if (!authenticatedRole) {
      const checkOrder: UserRole[] = ['developer', 'admin', 'staff', 'biller', 'dispatcher'];
      for (const r of checkOrder) {
        const match = await verifyRolePassword(r, password);
        if (match) {
          authenticatedRole = r;
          break;
        }
      }
    }

    if (!authenticatedRole) {
      return NextResponse.json(
        {
          error:
            'Invalid password. Please enter valid Developer Admin, Super Admin, Employee, Biller, or Dispatcher credentials.',
        },
        { status: 401 }
      );
    }

    const token = signAdminToken(authenticatedRole);

    let redirectTo = '/admin';
    let roleName = 'Super Admin';
    if (authenticatedRole === 'developer') {
      redirectTo = '/admin/visitors';
      roleName = 'Developer Admin';
    } else if (authenticatedRole === 'staff') {
      redirectTo = '/admin/view';
      roleName = 'Internal Employee';
    } else if (authenticatedRole === 'biller') {
      redirectTo = '/biller';
      roleName = 'Biller';
    } else if (authenticatedRole === 'dispatcher') {
      redirectTo = '/dispatcher';
      roleName = 'Dispatcher';
    }

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${roleName}`,
      role: authenticatedRole,
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
