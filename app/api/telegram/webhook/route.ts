import { NextRequest, NextResponse } from 'next/server';
import { processTelegramUpdate } from '@/lib/telegramBotCore';
import { sendTelegramMessage } from '@/lib/telegramNotifier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Empty payload' }, { status: 400 });
    }

    // Check if this is a test message action
    const searchParams = req.nextUrl.searchParams;
    if (searchParams.get('action') === 'test') {
      const { chatId, message } = body;
      if (!chatId) {
        return NextResponse.json({ ok: false, error: 'chatId required' }, { status: 400 });
      }
      const testRes = await sendTelegramMessage(
        chatId,
        message || '🔔 *Test Notification from US International Logistics Cargo Bot*!\nYour alerts are working perfectly.'
      );
      return NextResponse.json(testRes);
    }

    // Process Telegram webhook update
    const result = await processTelegramUpdate(body);
    return NextResponse.json({ ok: true, handled: result.handled });
  } catch (err: any) {
    console.error('[TelegramWebhook] Error:', err);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'Hell_agent28N26_bot';

    if (!botToken) {
      return NextResponse.json({
        ok: false,
        configured: false,
        message: 'TELEGRAM_BOT_TOKEN not configured in .env',
      });
    }

    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');

    // Action: Set Webhook
    if (action === 'setWebhook') {
      const webhookUrl = searchParams.get('url');
      if (!webhookUrl) {
        return NextResponse.json({ ok: false, error: 'url param required for setWebhook' }, { status: 400 });
      }
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return NextResponse.json({ ok: true, data });
    }

    // Action: Delete Webhook (for switching to polling)
    if (action === 'deleteWebhook') {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
      const data = await res.json();
      return NextResponse.json({ ok: true, data });
    }

    // Fetch live bot and webhook info from Telegram
    const [meRes, whRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()).catch((e) => ({ error: e.message })),
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) => r.json()).catch((e) => ({ error: e.message })),
    ]);

    return NextResponse.json({
      ok: true,
      configured: true,
      botUsername,
      botInfo: meRes.result || meRes,
      webhookInfo: whRes.result || whRes,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
