import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import { sendTelegramMessage } from '@/lib/telegramNotifier';

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

    await connectToDatabase();
    const doc = await ReceiptTracking.findOne({ token }).lean();

    if (!doc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found' }, { status: 404 });
    }

    const subscribers = (doc.telegramSubscribers || []).map((s: any) => ({
      phoneMasked: s.phone ? `${s.phone.slice(0, 3)}****${s.phone.slice(-3)}` : '',
      active: Boolean(s.active),
      username: s.username || '',
      hasChatId: Boolean(s.chatId),
    }));

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'USIntlCargoBot';
    const isBotConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);

    return NextResponse.json({
      success: true,
      subscribers,
      isSubscribed: subscribers.some((s: any) => s.active),
      botUsername,
      botUrl: `https://t.me/${botUsername}?start=${token}`,
      isBotConfigured,
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
    const { phone, enabled = true, username, chatId } = body;

    const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '').trim();

    if (enabled && !cleanPhone && !chatId && !username) {
      return NextResponse.json(
        { success: false, message: 'Please provide a valid Mobile Number or Telegram handle' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const doc = await ReceiptTracking.findOne({ token });

    if (!doc) {
      return NextResponse.json({ success: false, message: 'Tracking link not found' }, { status: 404 });
    }

    // Action: Test alert to linked chats
    if (body.action === 'test') {
      const activeSubs = (doc.telegramSubscribers || []).filter((s: any) => s.active && s.chatId);
      if (activeSubs.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No active Telegram Chat linked yet. Please click "Start Bot on Telegram" and tap START in Telegram first.',
        });
      }
      let sentCount = 0;
      for (const sub of activeSubs) {
        if (!sub.chatId) continue;
        const testRes = await sendTelegramMessage(
          sub.chatId,
          `🔔 *Test Notification from US International Logistics*\n\nYour Telegram live alerts for *${doc.name}* are working perfectly! You will receive instant notifications whenever container ETA or delivery changes.`
        );
        if (testRes.success) sentCount++;
      }
      return NextResponse.json({
        success: true,
        message: `Test alert sent successfully to ${sentCount} linked Telegram device(s)! Check your Telegram app.`,
      });
    }

    if (!doc.telegramSubscribers) {
      doc.telegramSubscribers = [];
    }

    if (!enabled) {
      // Unsubscribe all or matching phone
      if (cleanPhone) {
        doc.telegramSubscribers.forEach((s: any) => {
          if (s.phone === cleanPhone) s.active = false;
        });
      } else {
        doc.telegramSubscribers.forEach((s: any) => {
          s.active = false;
        });
      }
    } else {
      // Upsert subscriber
      const existing = doc.telegramSubscribers.find(
        (s: any) => (cleanPhone && s.phone === cleanPhone) || (chatId && s.chatId === chatId)
      );

      if (existing) {
        existing.active = true;
        if (cleanPhone) existing.phone = cleanPhone;
        if (username) existing.username = username;
        if (chatId) existing.chatId = chatId;
        existing.subscribedAt = new Date();
      } else {
        doc.telegramSubscribers.push({
          phone: cleanPhone,
          chatId: chatId || '',
          username: username || '',
          subscribedAt: new Date(),
          active: true,
        });
      }

      // If chatId is available, send welcome message immediately
      if (chatId) {
        const welcomeText = [
          `✅ *TELEGRAM NOTIFICATIONS ACTIVATED!*`,
          ``,
          `Hello! You have successfully subscribed to instant live alerts for *${doc.name || 'Your Cargo'}*.`,
          `We will notify you immediately on Telegram whenever your cargo ETA, Port Arrival Date, or status changes.`,
        ].join('\n');
        await sendTelegramMessage(chatId, welcomeText);
      }
    }

    await doc.save();

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'USIntlCargoBot';
    const botUrl = `https://t.me/${botUsername}?start=${token}`;

    return NextResponse.json({
      success: true,
      message: enabled
        ? 'Telegram notification preference saved successfully!'
        : 'Telegram notifications have been paused.',
      enabled,
      botUsername,
      botUrl,
      isBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    });
  } catch (err: any) {
    console.error('Error saving Telegram subscription:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
