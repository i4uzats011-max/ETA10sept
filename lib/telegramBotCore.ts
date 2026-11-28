import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import { sendTelegramMessage } from '@/lib/telegramNotifier';

/**
 * Handles incoming Telegram update (from Webhook or Long Polling)
 */
export async function processTelegramUpdate(update: any): Promise<{ handled: boolean; reply?: string }> {
  try {
    const message = update.message || update.edited_message;
    if (!message) return { handled: false };

    const chatId = message.chat?.id;
    if (!chatId) return { handled: false };

    const text = (message.text || '').trim();
    const from = message.from || {};
    const firstName = from.first_name || 'Customer';
    const username = from.username ? `@${from.username}` : '';

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    // ── Command: /start [token] ──────────────────────────────────────────────
    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const rawToken = parts[1] ? parts[1].trim() : '';
      const cleanToken = rawToken.replace(/^start=/i, '').trim();

      if (cleanToken) {
        await connectToDatabase();
        const doc = await ReceiptTracking.findOne({ token: cleanToken });

        if (!doc) {
          const notFoundText = [
            `⚠️ *Tracking Link Not Found*`,
            ``,
            `We could not find an active cargo tracking link for token: \`${cleanToken}\`.`,
            `Please open your cargo tracking page and click *'Start Bot on Telegram'* again.`,
            ``,
            `Your Telegram Chat ID: \`${chatId}\``,
          ].join('\n');
          await sendTelegramMessage(chatId, notFoundText);
          return { handled: true, reply: notFoundText };
        }

        if (!doc.telegramSubscribers) {
          doc.telegramSubscribers = [];
        }

        const strChatId = String(chatId);
        const existingSub = doc.telegramSubscribers.find(
          (s: any) => String(s.chatId) === strChatId || (s.username && s.username === username)
        );

        if (existingSub) {
          existingSub.active = true;
          existingSub.chatId = strChatId;
          if (from.username) existingSub.username = from.username;
        } else {
          doc.telegramSubscribers.push({
            chatId: strChatId,
            username: from.username || '',
            active: true,
            subscribedAt: new Date(),
          });
        }

        await doc.save();

        const receiptsList = (doc.receipts || []).map((r: any) => r.receiptNo).filter(Boolean);
        const trackingUrl = `${appBaseUrl}/track/${doc.token}?notif=eta`;

        const welcomeText = [
          `🎉 *TELEGRAM ALERTS ACTIVATED!*`,
          ``,
          `Hello *${firstName}*,`,
          `You have successfully subscribed to live cargo alerts for:`,
          `👤 *Party / Link*: *${doc.name || 'Your Cargo'}*`,
          receiptsList.length > 0 ? `🧾 *Registered Receipt(s)*: \`${receiptsList.join(', ')}\`` : null,
          ``,
          `🔔 *Automatic Alerts Enabled*:`,
          `• Instant notification when container arrival / ETA date changes`,
          `• Real-time alert when your goods are loaded into a container`,
          `• Delivery alert when your container is delivered`,
          ``,
          `🔗 [Tap Here to Open Live Cargo Tracking](${trackingUrl})`,
          ``,
          `_You will now receive all updates directly in this chat!_`,
        ].filter(Boolean).join('\n');

        await sendTelegramMessage(chatId, welcomeText);
        return { handled: true, reply: welcomeText };
      } else {
        // /start without token
        const greetingText = [
          `👋 *Welcome to US International Logistics Cargo Bot!*`,
          ``,
          `Hello *${firstName}*,`,
          `This bot delivers real-time notifications for your cargo shipments.`,
          ``,
          `*To connect this bot to your shipments:*`,
          `1️⃣ Open your personal Cargo Tracking link in your web browser.`,
          `2️⃣ Click on the *'Telegram Alerts'* button.`,
          `3️⃣ Tap *'Start Bot on Telegram'* to link your chat automatically!`,
          ``,
          `📌 *Your Telegram Chat ID*: \`${chatId}\``,
          ``,
          `_If you have your tracking link token, you can also send:_ \`/start <token>\``,
        ].join('\n');

        await sendTelegramMessage(chatId, greetingText);
        return { handled: true, reply: greetingText };
      }
    }

    // ── Command: /status ─────────────────────────────────────────────────────
    if (text.startsWith('/status')) {
      await connectToDatabase();
      const strChatId = String(chatId);
      const docs = await ReceiptTracking.find({
        'telegramSubscribers.chatId': strChatId,
        'telegramSubscribers.active': true,
      }).lean();

      if (!docs || docs.length === 0) {
        const noSubText = [
          `ℹ️ *No Active Cargo Subscriptions Found*`,
          ``,
          `You are not currently subscribed to any tracking links.`,
          `Please open your tracking link in your browser and click *'Start Bot on Telegram'*.`,
          ``,
          `Your Telegram Chat ID: \`${chatId}\``,
        ].join('\n');
        await sendTelegramMessage(chatId, noSubText);
        return { handled: true, reply: noSubText };
      }

      const statusLines = [
        `📋 *YOUR ACTIVE CARGO SUBSCRIPTIONS* (${docs.length})`,
        ``,
      ];

      for (const d of docs) {
        const receipts = (d.receipts || []).map((r: any) => r.receiptNo).join(', ');
        statusLines.push(`• *${d.name}* (${d.token})`);
        if (receipts) statusLines.push(`  Receipts: \`${receipts}\``);
        statusLines.push(`  🔗 [View Tracking](${appBaseUrl}/track/${d.token}?notif=eta)`);
        statusLines.push(``);
      }

      await sendTelegramMessage(chatId, statusLines.join('\n'));
      return { handled: true };
    }

    // ── Command: /myid ───────────────────────────────────────────────────────
    if (text.startsWith('/myid') || text.startsWith('/id')) {
      const idText = `🆔 *Your Telegram Chat ID*: \`${chatId}\``;
      await sendTelegramMessage(chatId, idText);
      return { handled: true, reply: idText };
    }

    // ── Command: /help ───────────────────────────────────────────────────────
    if (text.startsWith('/help')) {
      const helpText = [
        `🤖 *US INTERNATIONAL LOGISTICS BOT COMMANDS*`,
        ``,
        `• \`/start <token>\` - Link and activate alerts for your tracking link`,
        `• \`/status\` - View all your linked cargo subscriptions`,
        `• \`/myid\` - View your Telegram Chat ID`,
        `• \`/help\` - Show this help message`,
        ``,
        `For support, contact admin@usinternationallogistics.com`,
      ].join('\n');
      await sendTelegramMessage(chatId, helpText);
      return { handled: true, reply: helpText };
    }

    // Default polite response for any other message
    const defaultReply = [
      `👋 Hello *${firstName}*!`,
      ``,
      `I am the *US International Logistics Alert Bot*.`,
      `To receive alerts for your cargo, open your tracking link in your browser and tap *'Start Bot on Telegram'*.`,
      ``,
      `📌 *Your Chat ID*: \`${chatId}\``,
      `Type \`/help\` to see available commands.`,
    ].join('\n');
    await sendTelegramMessage(chatId, defaultReply);
    return { handled: true, reply: defaultReply };
  } catch (err: any) {
    console.error('[TelegramBotCore] Error processing update:', err);
    return { handled: false };
  }
}
