import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { getAdminTokenFromRequest, verifyAdminToken, isDeveloperAuthenticated } from '@/lib/auth';
import { hashPassword } from '@/lib/passwordManager';

export const dynamic = 'force-dynamic';

// Seed initial developer if DB has no developer user yet
async function ensureInitialDeveloper() {
  const existingDev = await User.findOne({ role: 'developer' });
  if (!existingDev) {
    const devPass =
      process.env.DEV_ADMIN_PASSWORD || process.env.DEVELOPER_PASSWORD || 'Hello$1256';
    await User.create({
      username: 'developer',
      name: 'Lead Developer',
      passwordHash: hashPassword(devPass),
      role: 'developer',
      isActive: true,
      createdBy: 'system',
    });
  }
}

// 1. GET: List all users
export async function GET(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json(
        { error: 'Unauthorized. Developer Admin access required.' },
        { status: 401 }
      );
    }

    await connectToDatabase();
    await ensureInitialDeveloper();

    const users = await User.find({})
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

// 2. POST: Create a new user
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
    const creator = payload?.username || payload?.role || 'developer';

    const body = await req.json();
    const { username, name, password, role } = body;

    // Validation
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters long.' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const validUsernameRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!validUsernameRegex.test(cleanUsername)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers, underscores, dashes, and periods.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.trim().length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters long.' },
        { status: 400 }
      );
    }

    const allowedRoles = ['admin', 'staff', 'biller', 'dispatcher', 'developer'];
    if (!role || !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role "${role}". Must be one of: ${allowedRoles.join(', ')}` },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Check uniqueness
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return NextResponse.json(
        { error: `Username "${cleanUsername}" is already taken. Please choose another.` },
        { status: 400 }
      );
    }

    const hashedPassword = hashPassword(password.trim());

    const newUser = await User.create({
      username: cleanUsername,
      name: (name || '').trim(),
      passwordHash: hashedPassword,
      role,
      isActive: true,
      createdBy: creator,
    });

    const userObj = newUser.toObject();
    delete (userObj as any).passwordHash;

    return NextResponse.json(
      {
        success: true,
        message: `User "${cleanUsername}" created successfully with role "${role}"!`,
        user: userObj,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

// 3. PUT: Update user (role, name, active status)
export async function PUT(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json(
        { error: 'Unauthorized. Developer Admin access required.' },
        { status: 401 }
      );
    }

    const token = getAdminTokenFromRequest(req);
    const payload = token ? verifyAdminToken(token) : null;

    const body = await req.json();
    const { userId, role, name, isActive } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Role assignment
    if (role !== undefined) {
      const allowedRoles = ['admin', 'staff', 'biller', 'dispatcher', 'developer'];
      if (!allowedRoles.includes(role)) {
        return NextResponse.json(
          { error: `Invalid role "${role}". Must be one of: ${allowedRoles.join(', ')}` },
          { status: 400 }
        );
      }

      // If demoting a developer, ensure there is at least one other active developer
      if (user.role === 'developer' && role !== 'developer') {
        const otherDevCount = await User.countDocuments({
          _id: { $ne: user._id },
          role: 'developer',
          isActive: true,
        });
        if (otherDevCount === 0) {
          return NextResponse.json(
            { error: 'Cannot change role: There must be at least one active Developer account in the system.' },
            { status: 400 }
          );
        }
      }

      user.role = role;
    }

    // Name update
    if (name !== undefined) {
      user.name = String(name).trim();
    }

    // Active status toggle
    if (isActive !== undefined) {
      const nextActive = Boolean(isActive);

      // Prevent deactivating own account
      if (!nextActive && payload?.userId === user._id.toString()) {
        return NextResponse.json(
          { error: 'You cannot deactivate your own currently active account.' },
          { status: 400 }
        );
      }

      // Prevent deactivating the only active developer
      if (!nextActive && user.role === 'developer') {
        const otherDevCount = await User.countDocuments({
          _id: { $ne: user._id },
          role: 'developer',
          isActive: true,
        });
        if (otherDevCount === 0) {
          return NextResponse.json(
            { error: 'Cannot deactivate the only active Developer account in the system.' },
            { status: 400 }
          );
        }
      }

      user.isActive = nextActive;
    }

    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).passwordHash;

    return NextResponse.json({
      success: true,
      message: `User "${user.username}" updated successfully!`,
      user: userObj,
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

// 4. DELETE: Delete a user
export async function DELETE(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json(
        { error: 'Unauthorized. Developer Admin access required.' },
        { status: 401 }
      );
    }

    const token = getAdminTokenFromRequest(req);
    const payload = token ? verifyAdminToken(token) : null;

    const { searchParams } = new URL(req.url);
    const userIdFromQuery = searchParams.get('id');

    let userId = userIdFromQuery;
    if (!userId) {
      try {
        const body = await req.json();
        userId = body.userId;
      } catch {
        // no body
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required to delete.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Prevent deleting own account
    if (payload?.userId === user._id.toString() || payload?.username === user.username) {
      return NextResponse.json(
        { error: 'You cannot delete your own logged-in account.' },
        { status: 400 }
      );
    }

    // Prevent deleting the last developer
    if (user.role === 'developer') {
      const devCount = await User.countDocuments({ role: 'developer' });
      if (devCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the only Developer account in the system.' },
          { status: 400 }
        );
      }
    }

    await User.findByIdAndDelete(userId);

    return NextResponse.json({
      success: true,
      message: `User "${user.username}" has been deleted permanently.`,
      deletedUserId: userId,
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
