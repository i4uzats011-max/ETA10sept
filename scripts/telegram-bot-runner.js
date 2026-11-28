#!/usr/bin/env node
/**
 * US INTERNATIONAL LOGISTICS - Telegram Bot Runner (Long Polling)
 *
 * Runs the Telegram bot in background polling mode.
 * Handles /start <token> commands from customers, saving their Telegram Chat ID
 * to MongoDB, and dispatching real-time notifications.
 *
 * Usage:
 *   node --env-file=.env scripts/telegram-bot-runner.js
 *   npm run telegram:bot
 */

const mongoose = require('mongoose');
const path = require('path');

// Ensure environment variables are loaded
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const fs = require('fs');
    const envFile = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  } catch (e) {}
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || 'cargo_tracker_v2';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://cargotracker.usinternationallogistics.com';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in environment or .env file.');
  process.exit(1);
}

// Minimal Mongo Schema for ReceiptTracking
const ReceiptTrackingSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  name: { type: String },
  receipts: [{ receiptNo: String, warehouse: String }],
  telegramSubscribers: [{
    chatId: String,
    username: String,
    phone: String,
    active: { type: Boolean, default: true },
    subscribedAt: { type: Date, default: Date.now }
  }]
}, { strict: false, collection: 'receipttrackings' });

let ReceiptTracking;

async function sendTelegramMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`[TelegramBot] Error sending message to ${chatId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat?.id;
  if (!chatId) return;

  const text = (msg.text || '').trim();
  const from = msg.from || {};
  const firstName = from.first_name || 'Customer';
  const username = from.username ? `@${from.username}` : '';

  console.log(`[TelegramBot] Received message from ${firstName} (${username || chatId}): "${text}"`);

  // /start [token]
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const rawToken = parts[1] ? parts[1].trim() : '';
    const cleanToken = rawToken.replace(/^start=/i, '').trim();

    if (cleanToken) {
      const doc = await ReceiptTracking.findOne({ token: cleanToken });

      if (!doc) {
        const notFoundText = [
          `⚠️ *Cargo Tracking Link Not Found*`,
          ``,
          `We could not find an active cargo link for: \`${cleanToken}\`.`,
          `Please open your tracking link in your browser and click *'Start Bot on Telegram'* again.`,
          ``,
          `Your Telegram Chat ID: \`${chatId}\``,
        ].join('\n');
        await sendTelegramMessage(chatId, notFoundText);
        return;
      }

      if (!doc.telegramSubscribers) {
        doc.telegramSubscribers = [];
      }

      const strChatId = String(chatId);
      const existing = doc.telegramSubscribers.find(
        (s) => String(s.chatId) === strChatId || (s.username && s.username === username)
      );

      if (existing) {
        existing.active = true;
        existing.chatId = strChatId;
        if (from.username) existing.username = from.username;
      } else {
        doc.telegramSubscribers.push({
          chatId: strChatId,
          username: from.username || '',
          active: true,
          subscribedAt: new Date(),
        });
      }

      await doc.save();
      console.log(`[TelegramBot] ✅ Successfully linked Chat ID ${chatId} (${firstName}) to tracking link: ${doc.name} (${cleanToken})`);

      const receiptsList = (doc.receipts || []).map((r) => r.receiptNo).filter(Boolean);
      const trackingUrl = `${APP_URL}/track/${doc.token}?notif=eta`;

      const welcomeText = [
        `🎉 *TELEGRAM ALERTS ACTIVATED!*`,
        ``,
        `Hello *${firstName}*,`,
        `You have successfully subscribed to live cargo alerts for:`,
        `👤 *Party / Link*: *${doc.name || 'Your Cargo'}*`,
        receiptsList.length > 0 ? `🧾 *Registered Receipt(s)*: \`${receiptsList.join(', ')}\`` : null,
        ``,
        `🔔 *Automatic Alerts Enabled*:`,
        `• Instant alert when container arrival / ETA date changes`,
        `• Real-time notification when your cargo is loaded into a container`,
        `• Delivery alert when your container is delivered`,
        ``,
        `🔗 [Tap Here to View Live Cargo Tracking](${trackingUrl})`,
        ``,
        `_You will now receive all updates directly in this chat!_`,
      ].filter(Boolean).join('\n');

      await sendTelegramMessage(chatId, welcomeText);
      return;
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
      return;
    }
  }

  // /status
  if (text.startsWith('/status')) {
    const strChatId = String(chatId);
    const docs = await ReceiptTracking.find({
      'telegramSubscribers.chatId': strChatId,
      'telegramSubscribers.active': true,
    }).lean();

    if (!docs || docs.length === 0) {
      await sendTelegramMessage(
        chatId,
        `ℹ️ *No Active Subscriptions Found*\nYou are not currently subscribed to any tracking links.\nYour Chat ID: \`${chatId}\``
      );
      return;
    }

    const lines = [`📋 *YOUR ACTIVE CARGO SUBSCRIPTIONS* (${docs.length})\n`];
    for (const d of docs) {
      const receipts = (d.receipts || []).map((r) => r.receiptNo).join(', ');
      lines.push(`• *${d.name}* (\`${d.token}\`)`);
      if (receipts) lines.push(`  Receipts: \`${receipts}\``);
      lines.push(`  🔗 [View Tracking](${APP_URL}/track/${d.token}?notif=eta)\n`);
    }

    await sendTelegramMessage(chatId, lines.join('\n'));
    return;
  }

  // /myid
  if (text.startsWith('/myid') || text.startsWith('/id')) {
    await sendTelegramMessage(chatId, `🆔 *Your Telegram Chat ID*: \`${chatId}\``);
    return;
  }

  // /help
  if (text.startsWith('/help')) {
    const help = [
      `🤖 *US INTERNATIONAL LOGISTICS BOT COMMANDS*`,
      ``,
      `• \`/start <token>\` - Link and activate alerts for your tracking link`,
      `• \`/status\` - View all your linked cargo subscriptions`,
      `• \`/myid\` - View your Telegram Chat ID`,
      `• \`/help\` - Show this help message`,
    ].join('\n');
    await sendTelegramMessage(chatId, help);
    return;
  }

  // Default polite response
  const def = [
    `👋 Hello *${firstName}*!`,
    ``,
    `I am the *US International Logistics Cargo Bot*.`,
    `To receive alerts for your shipments, open your cargo tracking link in your browser and tap *'Start Bot on Telegram'*.`,
    ``,
    `📌 *Your Chat ID*: \`${chatId}\``,
  ].join('\n');
  await sendTelegramMessage(chatId, def);
}

async function connectWithRetry() {
  while (true) {
    try {
      console.log('🚀 Connecting to MongoDB...');
      await mongoose.connect(MONGO_URI, { dbName: MONGO_DB, serverSelectionTimeoutMS: 15000 });
      console.log('✅ Connected to MongoDB.');
      break;
    } catch (err) {
      console.error('❌ MongoDB connection error:', err.message, '- Retrying in 5s...');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  await connectWithRetry();
  ReceiptTracking = mongoose.models.ReceiptTracking || mongoose.model('ReceiptTracking', ReceiptTrackingSchema);

  // Check Bot Info
  const meRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`).then((r) => r.json());
  if (!meRes.ok) {
    console.error('❌ Failed to authenticate with Telegram:', meRes.description);
    process.exit(1);
  }
  console.log(`🤖 Telegram Bot Active: @${meRes.result.username} (${meRes.result.first_name})`);

  // Remove any conflicting webhook so long-polling works smoothly
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
  console.log('📡 Long polling mode initialized. Listening for messages...');

  let offset = 0;

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=20`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await handleUpdate(update).catch((err) => {
            console.error('[TelegramBot] Error handling update:', err);
          });
        }
      } else if (!data.ok) {
        console.warn('[TelegramBot] getUpdates error:', data.description);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (pollErr) {
      console.warn('[TelegramBot] Polling connection error:', pollErr.message);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

main().catch((err) => {
  console.error('[TelegramBot] Fatal runner error:', err);
  process.exit(1);
});
