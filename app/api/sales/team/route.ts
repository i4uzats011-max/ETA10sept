import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isSalesHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { hashPassword } from '@/lib/passwordManager';
import { recordEditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

// GET: List all sales team members
export async function GET(req: NextRequest) {
  if (!isSalesHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized. Only Sales Head / Admin can access team management.' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const teamMembers = await User.find({ role: 'sales_person' })
      .select('_id name username phone email plainPasswordView isActive lastLoginAt createdAt salesNotes')
      .sort({ createdAt: -1 })
      .lean();

    // Aggregate assigned receipts count per salesperson
    const memberCounts = await WarehouseReceipt.aggregate([
      { $match: { salesPerson: { $exists: true, $ne: '' } } },
      { $group: { _id: '$salesPerson', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    memberCounts.forEach((m: any) => {
      if (m._id) countMap.set(String(m._id).toLowerCase(), m.count);
    });

    const enrichedMembers = teamMembers.map((member: any) => {
      const nameKey = (member.name || '').toLowerCase();
      const userKey = (member.username || '').toLowerCase();
      const assignedCount = countMap.get(nameKey) || countMap.get(userKey) || 0;

      return {
        ...member,
        assignedCount,
      };
    });

    return NextResponse.json({
      success: true,
      team: enrichedMembers,
      total: enrichedMembers.length,
    });
  } catch (error: any) {
    console.error('Error fetching sales team:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Create a new sales team member
export async function POST(req: NextRequest) {
  if (!isSalesHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized. Only Sales Head / Admin can create team members.' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { name, username, password, phone, email, salesNotes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Sales person full name is mandatory.' }, { status: 400 });
    }

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username (User ID) is mandatory.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.trim().length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = phone ? String(phone).trim() : '';
    const cleanEmail = email ? String(email).trim() : '';

    // Check if username already exists
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return NextResponse.json({ error: `Username "${cleanUsername}" is already taken. Please choose another.` }, { status: 400 });
    }

    const passwordHash = hashPassword(password.trim());

    const newUser = await User.create({
      name: cleanName,
      username: cleanUsername,
      passwordHash,
      plainPasswordView: password.trim(),
      role: 'sales_person',
      phone: cleanPhone,
      email: cleanEmail,
      salesNotes: salesNotes ? String(salesNotes).trim() : '',
      isActive: true,
      createdBy: currentUser.username,
      adminAccessGranted: false,
    });

    // Generate Shareable WhatsApp Invite Snippet
    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const loginUrl = `${proto}://${host}/admin/login`;

    const shareableInvite = `👋 *Hello ${cleanName}!*
Here are your credentials for the *US International Logistics Sales Portal*:

🌐 *Portal Link:* ${loginUrl}
👤 *User ID:* ${cleanUsername}
🔑 *Password:* ${password.trim()}

Please log in to review your assigned cargo, freight rates, remarks, and update communications with the Sales Head.`;

    await recordEditLog(req, {
      username: currentUser.username,
      role: currentUser.role,
      action: 'CREATE',
      entityType: 'User',
      entityId: cleanUsername,
      description: `Created Sales Person account for ${cleanName} (${cleanUsername})`,
    });

    return NextResponse.json({
      success: true,
      message: `Sales Person "${cleanName}" created successfully.`,
      user: {
        _id: newUser._id,
        name: cleanName,
        username: cleanUsername,
        phone: cleanPhone,
        role: 'sales_person',
        isActive: true,
        plainPasswordView: password.trim(),
      },
      loginUrl,
      shareableInvite,
    });
  } catch (error: any) {
    console.error('Error creating sales team member:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// PATCH: Toggle active status or update password
export async function PATCH(req: NextRequest) {
  if (!isSalesHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { userId, username, isActive, newPassword, phone, name } = body;

    const query = userId ? { _id: userId } : { username: String(username).toLowerCase() };
    const user = await User.findOne(query);

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (user.role !== 'sales_person' && currentUser.role === 'sales_head') {
      return NextResponse.json({ error: 'Sales Head can only manage Sales Person accounts.' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (typeof isActive === 'boolean') {
      updates.isActive = isActive;
    }
    if (newPassword && typeof newPassword === 'string' && newPassword.trim().length >= 4) {
      updates.passwordHash = hashPassword(newPassword.trim());
      updates.plainPasswordView = newPassword.trim();
    }
    if (phone !== undefined) {
      updates.phone = String(phone).trim();
    }
    if (name !== undefined && name.trim()) {
      updates.name = String(name).trim();
    }

    updates.lastModifiedBy = currentUser.username;
    updates.lastModifiedByRole = currentUser.role;

    await User.updateOne({ _id: user._id }, { $set: updates });

    await recordEditLog(req, {
      username: currentUser.username,
      role: currentUser.role,
      action: 'UPDATE',
      entityType: 'User',
      entityId: user.username,
      description: `Updated Sales Person account for ${user.username}`,
    });

    return NextResponse.json({
      success: true,
      message: 'Sales team member updated successfully.',
    });
  } catch (error: any) {
    console.error('Error updating sales team member:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// DELETE: Remove sales team member
export async function DELETE(req: NextRequest) {
  if (!isSalesHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('id');
    const username = searchParams.get('username')?.trim().toLowerCase();

    const query = userId ? { _id: userId } : { username };
    const user = await User.findOne(query);

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (user.role !== 'sales_person') {
      return NextResponse.json({ error: 'Can only delete Sales Person accounts.' }, { status: 403 });
    }

    await User.deleteOne({ _id: user._id });

    return NextResponse.json({
      success: true,
      message: `Sales member ${user.name || user.username} deleted.`,
    });
  } catch (error: any) {
    console.error('Error deleting sales team member:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
