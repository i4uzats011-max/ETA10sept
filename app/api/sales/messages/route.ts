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
