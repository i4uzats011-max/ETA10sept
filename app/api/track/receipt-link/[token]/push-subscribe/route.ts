import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import WebPushSubscription from '@/models/WebPushSubscription';
import { sendTestPushNotification } from '@/lib/webPushNotifier';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Token required' }, { status: 400 });
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    const isPushConfigured = Boolean(vapidPublicKey && process.env.VAPID_PRIVATE_KEY);

    await connectToDatabase();
    const doc = await ReceiptTracking.findOne({ token }).select({ _id: 1, name: 1 }).lean();
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found' }, { status: 404 });
    }

    const activeCount = await WebPushSubscription.countDocuments({ token, active: true });

    return NextResponse.json({
      success: true,
      vapidPublicKey,
      isPushConfigured,
      activeSubscribers: activeCount,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Token required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // Action: Send test push notification to this token's subscribed devices
    if (body.action === 'test') {
      const testRes = await sendTestPushNotification(token);
      return NextResponse.json(testRes);
    }

    const { subscription, userAgent = '', active = true } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { success: false, message: 'Invalid push subscription payload' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const doc = await ReceiptTracking.findOne({ token }).select({ _id: 1 }).lean();
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found' }, { status: 404 });
    }

    const endpoint = String(subscription.endpoint).trim();
    const p256dh = String(subscription.keys.p256dh).trim();
    const auth = String(subscription.keys.auth).trim();

    await WebPushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          token,
          endpoint,
          keys: { p256dh, auth },
          userAgent: String(userAgent || ''),
          active: Boolean(active),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: active ? 'Device successfully subscribed for live ETA push alerts!' : 'Push notifications disabled.',
    });
  } catch (err: any) {
    console.error('Error in push-subscribe POST:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    const body = await req.json().catch(() => ({}));
    const endpoint = (body.endpoint || '').trim();

    await connectToDatabase();

    if (endpoint) {
      await WebPushSubscription.updateMany({ endpoint }, { $set: { active: false } });
    } else if (token) {
      await WebPushSubscription.updateMany({ token }, { $set: { active: false } });
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
