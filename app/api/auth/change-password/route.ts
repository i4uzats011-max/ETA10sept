import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest, verifyAdminToken, UserRole } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import {
  verifyRolePassword,
  setRolePassword,
  getAllRolesStatus,
  getRoleDisplayName,
  hashPassword,
  ALL_ROLES,
} from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAdminToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const canManageAll = payload.role === 'developer';

    if (canManageAll) {
      const roles = await getAllRolesStatus();
      return NextResponse.json({
        authenticated: true,
        role: payload.role,
        roleName: getRoleDisplayName(payload.role),
        canManageAll: true,
        roles,
      });
    }

    return NextResponse.json({
      authenticated: true,
      role: payload.role,
      roleName: getRoleDisplayName(payload.role),
      canManageAll: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAdminToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const callerRole = payload.role;
    const body = await req.json();
    const { action, currentPassword, newPassword, targetRole } = body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return NextResponse.json(
        { error: 'New password must be at least 4 characters long.' },
        { status: 400 }
      );
    }

    const cleanNewPassword = newPassword.trim();

    // Mode: Admin/Developer changing another role's password ("assinroal able change any one passwrod")
    if (action === 'change_any' || (targetRole && targetRole !== callerRole)) {
      if (callerRole !== 'developer') {
        return NextResponse.json(
          { error: 'Access denied. Only the Developer can change or reset passwords for other roles.' },
          { status: 403 }
        );
      }

      const roleToChange = (targetRole as UserRole) || callerRole;
      if (!ALL_ROLES.includes(roleToChange)) {
        return NextResponse.json(
          { error: `Invalid role "${roleToChange}". Must be one of: ${ALL_ROLES.join(', ')}` },
          { status: 400 }
        );
      }

      await setRolePassword(roleToChange, cleanNewPassword, callerRole);

      // Also sync User collection in MongoDB for this role
      try {
        await connectToDatabase();
        const usersToSync = await User.find({ role: roleToChange });
        for (const u of usersToSync) {
          u.passwordHash = hashPassword(cleanNewPassword);
          await u.save();
        }
      } catch (err) {
        console.warn('Could not sync User model:', err);
      }

      return NextResponse.json({
        success: true,
        message: `Password for ${getRoleDisplayName(roleToChange)} has been updated successfully!`,
        targetRole: roleToChange,
      });
    }

    // Mode: Any user changing their own password ("self password")
    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json(
        { error: 'Current password is required to change your self password.' },
        { status: 400 }
      );
    }

    const isCurrentValid = await verifyRolePassword(callerRole, currentPassword);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect. Please verify and try again.' },
        { status: 400 }
      );
    }

    await setRolePassword(callerRole, cleanNewPassword, callerRole);

    // Also sync User collection in MongoDB for caller
    try {
      await connectToDatabase();
      let callerUser = null;
      if (payload.userId) {
        callerUser = await User.findById(payload.userId);
      }
      if (!callerUser && payload.username) {
        callerUser = await User.findOne({ username: payload.username });
      }
      if (!callerUser) {
        callerUser = await User.findOne({ role: callerRole });
      }
      if (callerUser) {
        callerUser.passwordHash = hashPassword(cleanNewPassword);
        await callerUser.save();
      }
    } catch (err) {
      console.warn('Could not sync User model for self change:', err);
    }

    return NextResponse.json({
      success: true,
      message: `Your password (${getRoleDisplayName(callerRole)}) has been changed successfully!`,
      targetRole: callerRole,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
