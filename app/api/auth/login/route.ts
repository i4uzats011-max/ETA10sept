import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken, UserRole } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import {
  verifyRolePassword,
  verifyPassword,
  hashPassword,
  isDefaultRolePassword,
  ALL_ROLES,
} from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, role: requestedRole } = body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return NextResponse.json({ error: 'Username is mandatory' }, { status: 400 });
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Permanently block developer2026
    if (password.trim() === 'developer2026') {
      return NextResponse.json(
        { error: 'The default passkey "developer2026" is permanently disabled. Please use your updated developer credentials.' },
        { status: 401 }
      );
    }

    await connectToDatabase();

    let authenticatedRole: UserRole | null = null;
    let authenticatedUser: { id?: string; username?: string; name?: string } | null = null;

    // Authenticate user with mandatory username and password
    const cleanUsername = username.trim().toLowerCase();
    const user = await User.findOne({ username: cleanUsername });

    if (user) {
      if (!user.isActive) {
        return NextResponse.json(
          { error: 'This user account has been deactivated. Please contact the Developer Admin.' },
          { status: 403 }
        );
      }

      let isMatch = verifyPassword(password, user.passwordHash);
      // Fallback for default developer password if unchanged
      if (!isMatch && user.role === 'developer') {
        isMatch = isDefaultRolePassword('developer', password);
      }

      if (isMatch) {
        authenticatedRole = user.role;
        authenticatedUser = {
          id: user._id.toString(),
          username: user.username,
          name: user.name,
        };

        // Update last login timestamp
        user.lastLoginAt = new Date();
        await user.save();
      } else {
        return NextResponse.json(
          { error: 'Invalid username or password.' },
          { status: 401 }
        );
      }
    } else {
      // Bootstrap / fallback check for role names entered as username
      const matchedRole = ALL_ROLES.find((r) => r === cleanUsername);
      if (matchedRole && (await verifyRolePassword(matchedRole, password))) {
        authenticatedRole = matchedRole;
        authenticatedUser = { username: cleanUsername, name: cleanUsername.toUpperCase() };
      } else {
        return NextResponse.json(
          { error: 'Invalid username or password.' },
          { status: 401 }
        );
      }
    }

    if (!authenticatedRole) {
      return NextResponse.json(
        {
          error: 'Invalid credentials. Please enter a valid Username & Password.',
        },
        { status: 401 }
      );
    }

    const token = signAdminToken(authenticatedRole, authenticatedUser || undefined);

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
      message: `Authenticated as ${roleName}${authenticatedUser?.username ? ` (${authenticatedUser.username})` : ''}`,
      role: authenticatedRole,
      user: authenticatedUser,
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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
