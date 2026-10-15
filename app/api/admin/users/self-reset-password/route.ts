import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import {
  getAdminTokenFromRequest,
  verifyAdminToken,
  isDeveloperAuthenticated,
  signAdminToken,
} from '@/lib/auth';
import {
  hashPassword,
  verifyPassword,
  setRolePassword,
  isDefaultRolePassword,
} from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json(
        { error: 'Unauthorized. Developer Admin access required.' },
        { status: 401 }
      );
    }

    const token = getAdminTokenFromRequest(req);
    const payload = token ? verifyAdminToken(token) : null;
    if (!payload) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return NextResponse.json(
        { error: 'New password must be at least 4 characters long.' },
        { status: 400 }
      );
    }

    const cleanNewPassword = newPassword.trim();
    await connectToDatabase();

    // Find developer user record
    let user = null;
    if (payload.userId) {
      user = await User.findById(payload.userId);
    }
    if (!user && payload.username) {
      user = await User.findOne({ username: payload.username });
    }
    if (!user) {
      user = await User.findOne({ role: 'developer' });
    }

    // Verify current password if user exists and currentPassword was supplied
    if (currentPassword) {
      let isCurrentValid = false;
      if (user && user.passwordHash) {
        isCurrentValid = verifyPassword(currentPassword, user.passwordHash);
      }
      if (!isCurrentValid) {
        isCurrentValid = isDefaultRolePassword('developer', currentPassword);
      }

      if (!isCurrentValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect. Please verify and try again.' },
          { status: 400 }
        );
      }
    }

    const newHashed = hashPassword(cleanNewPassword);

    if (user) {
      user.passwordHash = newHashed;
      await user.save();
    } else {
      user = await User.create({
        username: payload.username || 'developer',
        name: payload.name || 'Lead Developer',
        passwordHash: newHashed,
        role: 'developer',
        isActive: true,
        createdBy: 'self',
      });
    }

    // Also sync RoleCredential for role 'developer'
    try {
      await setRolePassword('developer', cleanNewPassword, user.username || 'developer');
    } catch (e) {
      console.warn('Could not sync RoleCredential for developer:', e);
    }

    // Issue updated token
    const newToken = signAdminToken('developer', {
      id: user._id.toString(),
      username: user.username,
      name: user.name,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Developer password reset successfully!',
      username: user.username,
    });

    response.cookies.set('admin_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Error in developer self password reset:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
