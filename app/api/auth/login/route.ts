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

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    await connectToDatabase();

    let authenticatedRole: UserRole | null = null;
    let authenticatedUser: { id?: string; username?: string; name?: string } | null = null;

    // CASE 1: Username is provided (User account login)
    if (username && typeof username === 'string' && username.trim().length > 0) {
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
    }

    // CASE 2: No username provided (Legacy passkey login)
    if (!authenticatedRole) {
      // 1. Check if password matches a developer user in DB
      const devUsers = await User.find({ role: 'developer', isActive: true });
      for (const dev of devUsers) {
        if (verifyPassword(password, dev.passwordHash)) {
          authenticatedRole = 'developer';
          authenticatedUser = {
            id: dev._id.toString(),
            username: dev.username,
            name: dev.name,
          };
          dev.lastLoginAt = new Date();
          await dev.save();
          break;
        }
      }

      // 2. Check if explicit role requested matches
      if (!authenticatedRole && requestedRole && ALL_ROLES.includes(requestedRole as UserRole)) {
        const match = await verifyRolePassword(requestedRole as UserRole, password);
        if (match) {
          authenticatedRole = requestedRole as UserRole;
        }
      }

      // 3. Check role credentials in priority order: developer -> admin -> staff -> biller -> dispatcher
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

      // 4. Fallback check: Did user type their personal password into the passkey box?
      if (!authenticatedRole) {
        const activeUsers = await User.find({ isActive: true }).limit(50);
        for (const u of activeUsers) {
          if (verifyPassword(password, u.passwordHash)) {
            authenticatedRole = u.role;
            authenticatedUser = {
              id: u._id.toString(),
              username: u.username,
              name: u.name,
            };
            u.lastLoginAt = new Date();
            await u.save();
            break;
          }
        }
      }
    }

    if (!authenticatedRole) {
      return NextResponse.json(
        {
          error:
            'Invalid credentials. Please enter a valid Username & Password or role passkey.',
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
