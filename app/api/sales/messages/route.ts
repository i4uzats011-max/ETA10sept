import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import SalesMessage from '@/models/SalesMessage';
import { isSalesPersonOrHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: Fetch messages for a receipt thread or direct communication
export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const receiptNo = searchParams.get('receiptNo')?.trim();
    const partner = searchParams.get('partner')?.trim().toLowerCase(); // other party username

    const query: Record<string, any> = {};

    if (receiptNo) {
      query.receiptNo = receiptNo;
    } else if (partner) {
      // Direct two-way chat between current user and partner
      query.$or = [
        { senderUsername: currentUser.username, recipientUsername: partner },
        { senderUsername: partner, recipientUsername: currentUser.username },
        { recipientUsername: 'all' },
      ];
    } else {
      // General team communication
      query.$or = [
        { recipientUsername: 'all' },
        { senderUsername: currentUser.username },
        { recipientUsername: currentUser.username },
      ];
    }

    const messages = await SalesMessage.find(query)
      .sort({ createdAt: 1 })
      .limit(150)
      .lean();

    return NextResponse.json({
      success: true,
      messages,
      total: messages.length,
      currentUser: {
        username: currentUser.username,
        role: currentUser.role,
        name: currentUser.name || currentUser.username,
      },
    });
  } catch (error: any) {
    console.error('Error fetching sales messages:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Send new message in WhatsApp-style two-way chat
export async function POST(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { receiptNo, container, message, recipientUsername, type, metadata } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
    }

    const newMsg = await SalesMessage.create({
      receiptNo: receiptNo ? String(receiptNo).trim() : '',
      container: container ? String(container).trim() : '',
      senderUsername: currentUser.username,
      senderName: currentUser.name || currentUser.username,
      senderRole: currentUser.role,
      recipientUsername: recipientUsername ? String(recipientUsername).trim() : 'all',
      message: message.trim(),
      type: type || 'text',
      metadata: metadata || null,
      isRead: false,
      isDeleted: false,
    });

    return NextResponse.json({
      success: true,
      message: newMsg,
    });
  } catch (error: any) {
    console.error('Error sending sales message:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// PATCH: Edit message within 24 hours of sending (WhatsApp style)
export async function PATCH(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const body = await req.json();
    const { id, message } = body;

    if (!id) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Updated message content is required' }, { status: 400 });
    }

    const msg = await SalesMessage.findById(id);
    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (msg.isDeleted) {
      return NextResponse.json({ error: 'Cannot edit a deleted message' }, { status: 400 });
    }

    // Permission check: only original sender, sales_head, or developer can edit
    const isSender = msg.senderUsername.toLowerCase() === currentUser.username.toLowerCase();
    const isHeadOrDev = ['sales_head', 'developer'].includes(currentUser.role);
    if (!isSender && !isHeadOrDev) {
      return NextResponse.json({ error: 'You are not authorized to edit this message' }, { status: 403 });
    }

    // 24-Hour window verification
    const msgAgeMs = Date.now() - new Date(msg.createdAt).getTime();
    const maxAgeMs = 24 * 60 * 60 * 1000;
    if (msgAgeMs > maxAgeMs) {
      return NextResponse.json(
        { error: 'Messages can only be edited within 24 hours of being sent.' },
        { status: 400 }
      );
    }

    if (!msg.originalMessage) {
      msg.originalMessage = msg.message;
    }
    msg.message = message.trim();
    msg.isEdited = true;
    msg.editedBy = currentUser.name || currentUser.username;
    msg.editedAt = new Date();
    await msg.save();

    return NextResponse.json({
      success: true,
      message: msg,
    });
  } catch (error: any) {
    console.error('Error editing message:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// DELETE: Delete a message within 24 hours of sending (WhatsApp style)
export async function DELETE(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('id');

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const msg = await SalesMessage.findById(messageId);
    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Permission check: only sender, sales_head, or developer can delete
    const isSender = msg.senderUsername.toLowerCase() === currentUser.username.toLowerCase();
    const isHeadOrDev = ['sales_head', 'developer'].includes(currentUser.role);
    if (!isSender && !isHeadOrDev) {
      return NextResponse.json({ error: 'You are not authorized to delete this message' }, { status: 403 });
    }

    // 24-Hour window verification
    const msgAgeMs = Date.now() - new Date(msg.createdAt).getTime();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    if (msgAgeMs > maxAgeMs) {
      return NextResponse.json(
        { error: 'Messages can only be deleted within 24 hours of being sent.' },
        { status: 400 }
      );
    }

    const deleterLabel = currentUser.name || currentUser.username;
    msg.originalMessage = msg.message;
    msg.isDeleted = true;
    msg.deletedBy = deleterLabel;
    msg.deletedAt = new Date();
    msg.message = `This message was deleted by ${deleterLabel}`;
    await msg.save();

    return NextResponse.json({
      success: true,
      message: msg,
      notificationText: `This message was deleted by ${deleterLabel}`,
    });
  } catch (error: any) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
