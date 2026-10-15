import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { isDeveloperAuthenticated } from '@/lib/auth';
import { hashPassword } from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json(
        { error: 'Unauthorized. Developer Admin access required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { userId, newPassword } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return NextResponse.json(
        { error: 'New password must be at least 4 characters long.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const cleanPassword = newPassword.trim();
    user.passwordHash = hashPassword(cleanPassword);
    await user.save();

    return NextResponse.json({
      success: true,
      message: `Password for user "${user.username}" (${user.role}) has been reset successfully!`,
      username: user.username,
      role: user.role,
    });
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
