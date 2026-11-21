import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import SalesMessage from '@/models/SalesMessage';
import { isSalesPersonOrHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);

  try {
    await connectToDatabase();

    // Query messages: either to 'all' or to/from current user
    const query: Record<string, any> = {
      $or: [
        { recipientUsername: 'all' },
        { recipientUsername: currentUser.username },
        { senderUsername: currentUser.username },
      ],
    };

    // Get the latest 100 messages sorted by newest first
    const rawMessages = await SalesMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Group receipt-wise
    const receiptMap = new Map<string, {
      receiptNo: string;
      container?: string;
      latestMessage: string;
      senderName: string;
      senderRole: string;
      senderUsername: string;
      createdAt: Date;
      unreadCount: number;
      totalMessages: number;
    }>();

    for (const msg of rawMessages) {
      const rec = msg.receiptNo || 'General';
      if (!receiptMap.has(rec)) {
        receiptMap.set(rec, {
          receiptNo: rec,
          container: msg.container || '',
          latestMessage: msg.message,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          senderUsername: msg.senderUsername,
          createdAt: msg.createdAt,
          unreadCount: (!msg.isRead && msg.senderUsername !== currentUser.username) ? 1 : 0,
          totalMessages: 1,
        });
      } else {
        const item = receiptMap.get(rec)!;
        item.totalMessages += 1;
        if (!msg.isRead && msg.senderUsername !== currentUser.username) {
          item.unreadCount += 1;
        }
      }
    }

    const notifications = Array.from(receiptMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalUnread = notifications.reduce((sum, n) => sum + n.unreadCount, 0);

    return NextResponse.json({
      success: true,
      notifications,
      totalUnread,
      totalThreads: notifications.length,
    });
  } catch (error: any) {
    console.error('Error fetching sales notifications:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Mark receipt notifications as read
export async function POST(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { receiptNo } = body;

    if (receiptNo) {
      await SalesMessage.updateMany(
        { receiptNo },
        { $set: { isRead: true } }
      );
    } else {
      await SalesMessage.updateMany({}, { $set: { isRead: true } });
    }

    return NextResponse.json({ success: true, message: 'Marked as read' });
  } catch (error: any) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
