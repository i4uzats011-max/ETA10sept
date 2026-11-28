import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';

interface ContainerUpdatePayload {
  container: string;
  containerNumber?: string;
  blNumber?: string;
  shippingLine?: string;
  portName?: string;
  loadingDate?: string;
  oldEta?: string;
  newEta?: string;
  etaDaysShift?: number | null;
  oldPortDate?: string;
  newPortDate?: string;
  portDaysShift?: number | null;
  remarks?: string;
}

/**
 * Sends a message via Telegram Bot API
 */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<{ success: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn('[TelegramNotifier] TELEGRAM_BOT_TOKEN not configured in .env. Alert logged in queue.');
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured in environment' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
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
    if (!res.ok || !data.ok) {
      console.error(`[TelegramNotifier] Failed to send message to ${chatId}:`, data?.description);
      return { success: false, error: data?.description || 'Telegram API error' };
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[TelegramNotifier] Error sending Telegram message to ${chatId}:`, err?.message);
    return { success: false, error: err?.message };
  }
}

/**
 * Finds all public tracking links associated with a container and notifies subscribers
 */
export async function notifySubscribersOfContainerUpdate(payload: ContainerUpdatePayload): Promise<{
  notifiedCount: number;
  subscribersCount: number;
}> {
  try {
    await connectToDatabase();

    const cleanAlias = (payload.container || '').trim();
    if (!cleanAlias) return { notifiedCount: 0, subscribersCount: 0 };

    // 1. Find all receipt numbers in this container from Shipment
    const containerShipments = await Shipment.find({
      $or: [
        { container: new RegExp(`^${cleanAlias}$`, 'i') },
        ...(payload.containerNumber ? [{ containerNumber: new RegExp(`^${payload.containerNumber}$`, 'i') }] : []),
        ...(payload.blNumber ? [{ blNumber: payload.blNumber }] : []),
      ],
    }).select({ receipt: 1 }).lean();

    const receiptNos = Array.from(new Set(containerShipments.map((s: any) => s.receipt).filter(Boolean)));
    if (receiptNos.length === 0) return { notifiedCount: 0, subscribersCount: 0 };

    // 2. Find all ReceiptTracking links that include any of these receipts
    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': { $in: receiptNos },
      'telegramSubscribers.active': true,
    }).lean();

    if (!trackingLinks || trackingLinks.length === 0) {
      return { notifiedCount: 0, subscribersCount: 0 };
    }

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let totalSubscribers = 0;

    for (const link of trackingLinks) {
      const subscribers = (link.telegramSubscribers || []).filter((s: any) => s.active && s.chatId);
      if (subscribers.length === 0) continue;

      // Strict Data Isolation: ensure we only message if this specific customer's link owns matching receipts
      const matchingReceiptsForThisLink = (link.receipts || [])
        .map((r: any) => String(r.receiptNo || '').trim())
        .filter((rNo: string) => receiptNos.includes(rNo));

      if (matchingReceiptsForThisLink.length === 0) continue;

      const linkName = link.name || 'Your Cargo Tracking';
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=eta`;

      let shiftInfo = '';
      if (payload.etaDaysShift !== null && payload.etaDaysShift !== undefined && payload.etaDaysShift !== 0) {
        shiftInfo = payload.etaDaysShift > 0
          ? ` *(Extended by +${payload.etaDaysShift} days)*`
          : ` *(Advanced by ${payload.etaDaysShift} days)*`;
      }

      let portShiftInfo = '';
      if (payload.portDaysShift !== null && payload.portDaysShift !== undefined && payload.portDaysShift !== 0) {
        portShiftInfo = payload.portDaysShift > 0
          ? ` *(Delayed by +${payload.portDaysShift} days)*`
          : ` *(Arriving ${payload.portDaysShift} days earlier)*`;
      }

      // Build Telegram Markdown message
      const message = [
        `🚢 *US INTERNATIONAL LOGISTICS*`,
        `🔔 *LIVE CARGO UPDATE NOTIFICATION*`,
        ``,
        `👤 *Client Link*: ${linkName}`,
        `🧾 *Your Shipment Receipt(s)*: \`${matchingReceiptsForThisLink.join(', ')}\``,
        `📦 *Container*: \`${payload.container}\`${payload.containerNumber ? ` (\`${payload.containerNumber}\`)` : ''}`,
        payload.blNumber ? `📄 *B/L No*: \`${payload.blNumber}\`` : null,
        payload.shippingLine ? `🏢 *Carrier Line*: ${payload.shippingLine}` : null,
        payload.portName ? `⚓ *Destination Port*: ${payload.portName}` : null,
        ``,
        payload.newEta ? `📅 *New Destination ETA*: *${payload.newEta}*${shiftInfo}` : null,
        payload.newPortDate ? `🌊 *Vessel Port Arrival*: *${payload.newPortDate}*${portShiftInfo}` : null,
        payload.loadingDate ? `🚛 *Loading Date*: ${payload.loadingDate}` : null,
        payload.remarks ? `📝 *Latest Status*: _${payload.remarks}_` : null,
        ``,
        `🔗 [Click Here to View Live Cargo Tracking](${trackingUrl})`,
        ``,
        `_You received this automated notification because you subscribed on your tracking page._`,
      ].filter(Boolean).join('\n');

      for (const sub of subscribers) {
        if (!sub.chatId) continue;
        totalSubscribers++;
        const sendRes = await sendTelegramMessage(sub.chatId, message);
        if (sendRes.success) {
          totalNotified++;
        }
      }
    }

    return { notifiedCount: totalNotified, subscribersCount: totalSubscribers };
  } catch (err: any) {
    console.error('[TelegramNotifier] Error in notifySubscribersOfContainerUpdate:', err);
    return { notifiedCount: 0, subscribersCount: 0 };
  }
}

export interface GoodsLoadedTelegramPayload {
  receiptNo: string;
  container: string;
  containerNumber?: string;
  quantity?: number | string;
  warehouse?: string;
  itemName?: string;
  eta?: string;
}

/**
 * Sends Telegram notification when goods for a specific receipt are loaded into a container
 */
export async function notifyTelegramOfGoodsLoaded(payload: GoodsLoadedTelegramPayload): Promise<{
  notifiedCount: number;
  subscribersCount: number;
}> {
  const cleanReceipt = (payload.receiptNo || '').trim();
  if (!cleanReceipt) return { notifiedCount: 0, subscribersCount: 0 };

  try {
    await connectToDatabase();

    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': cleanReceipt,
      'telegramSubscribers.active': true,
    }).lean();

    if (!trackingLinks || trackingLinks.length === 0) return { notifiedCount: 0, subscribersCount: 0 };

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let totalSubscribers = 0;

    for (const link of trackingLinks) {
      const subscribers = (link.telegramSubscribers || []).filter((s: any) => s.active && s.chatId);
      if (subscribers.length === 0) continue;

      const linkName = link.name || 'Your Cargo Tracking';
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=loaded`;

      const message = [
        `🚢 *US INTERNATIONAL LOGISTICS*`,
        `📦 *GOODS LOADED NOTIFICATION*`,
        ``,
        `👤 *Client Link*: ${linkName}`,
        `🧾 *Receipt Number*: \`${cleanReceipt}\``,
        `📦 *Container*: \`${payload.container}\`${payload.containerNumber ? ` (\`${payload.containerNumber}\`)` : ''}`,
        payload.warehouse ? `🏢 *Origin Warehouse*: ${payload.warehouse} WH` : null,
        payload.quantity ? `📦 *Quantity Loaded*: *${payload.quantity} CTN*` : null,
        payload.itemName ? `🏷️ *Item*: ${payload.itemName}` : null,
        payload.eta && payload.eta !== 'Pending' ? `📅 *Estimated Arrival (ETA)*: *${payload.eta}*` : null,
        ``,
        `🔗 [Click Here to View Live Cargo Tracking](${trackingUrl})`,
        ``,
        `_You received this automated notification because you subscribed on your tracking page._`,
      ].filter(Boolean).join('\n');

      for (const sub of subscribers) {
        if (!sub.chatId) continue;
        totalSubscribers++;
        const sendRes = await sendTelegramMessage(sub.chatId, message);
        if (sendRes.success) {
          totalNotified++;
        }
      }
    }

    return { notifiedCount: totalNotified, subscribersCount: totalSubscribers };
  } catch (err: any) {
    console.error('[TelegramNotifier] Error in notifyTelegramOfGoodsLoaded:', err);
    return { notifiedCount: 0, subscribersCount: 0 };
  }
}

export interface ContainerDeliveryTelegramPayload {
  container: string;
  containerNumber?: string;
  deliveryDate: string;
  receiptNos?: string[];
}

/**
 * Sends Telegram notification when a container or its receipts are marked as delivered
 */
export async function notifyTelegramOfDelivery(payload: ContainerDeliveryTelegramPayload): Promise<{
  notifiedCount: number;
  subscribersCount: number;
}> {
  const cleanAlias = (payload.container || '').trim();
  if (!cleanAlias) return { notifiedCount: 0, subscribersCount: 0 };

  try {
    await connectToDatabase();

    let receiptNos = payload.receiptNos && payload.receiptNos.length > 0
      ? payload.receiptNos
      : [];

    if (receiptNos.length === 0) {
      const containerShipments = await Shipment.find({
        $or: [
          { container: new RegExp(`^${cleanAlias}$`, 'i') },
          ...(payload.containerNumber ? [{ containerNumber: new RegExp(`^${payload.containerNumber}$`, 'i') }] : []),
        ],
      }).select({ receipt: 1 }).lean();
      receiptNos = Array.from(new Set(containerShipments.map((s: any) => s.receipt).filter(Boolean)));
    }

    if (receiptNos.length === 0) return { notifiedCount: 0, subscribersCount: 0 };

    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': { $in: receiptNos },
      'telegramSubscribers.active': true,
    }).lean();

    if (!trackingLinks || trackingLinks.length === 0) return { notifiedCount: 0, subscribersCount: 0 };

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let totalSubscribers = 0;

    for (const link of trackingLinks) {
      const matchingReceiptsForThisLink = (link.receipts || [])
        .map((r: any) => String(r.receiptNo || '').trim())
        .filter((rNo: string) => receiptNos.includes(rNo));

      if (matchingReceiptsForThisLink.length === 0) continue;

      const subscribers = (link.telegramSubscribers || []).filter((s: any) => s.active && s.chatId);
      if (subscribers.length === 0) continue;

      const linkName = link.name || 'Your Cargo Tracking';
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=delivered`;

      const message = [
        `🚢 *US INTERNATIONAL LOGISTICS*`,
        `✅ *CARGO DELIVERED NOTIFICATION*`,
        ``,
        `👤 *Client Link*: ${linkName}`,
        `🧾 *Your Delivered Receipt(s)*: \`${matchingReceiptsForThisLink.join(', ')}\``,
        `📦 *Container*: \`${cleanAlias}\`${payload.containerNumber ? ` (\`${payload.containerNumber}\`)` : ''}`,
        `📅 *Delivery Date*: *${payload.deliveryDate}*`,
        `📦 *Status*: *Delivered & Completed*`,
        ``,
        `🔗 [Click Here to View Live Cargo Tracking](${trackingUrl})`,
        ``,
        `_You received this automated notification because you subscribed on your tracking page._`,
      ].filter(Boolean).join('\n');

      for (const sub of subscribers) {
        if (!sub.chatId) continue;
        totalSubscribers++;
        const sendRes = await sendTelegramMessage(sub.chatId, message);
        if (sendRes.success) {
          totalNotified++;
        }
      }
    }

    return { notifiedCount: totalNotified, subscribersCount: totalSubscribers };
  } catch (err: any) {
    console.error('[TelegramNotifier] Error in notifyTelegramOfDelivery:', err);
    return { notifiedCount: 0, subscribersCount: 0 };
  }
}
