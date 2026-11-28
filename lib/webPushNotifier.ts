// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush = require('web-push');
import { connectToDatabase } from '@/lib/mongodb';
import ReceiptTracking from '@/models/ReceiptTracking';
import WebPushSubscription from '@/models/WebPushSubscription';
import Shipment from '@/models/Shipment';

// Configure Web Push VAPID credentials
function ensureVapidDetails(): boolean {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@usinternationallogistics.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[WebPushNotifier] VAPID keys not configured in environment.');
    return false;
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    return true;
  } catch (err: any) {
    console.error('[WebPushNotifier] Failed to configure VAPID details:', err?.message);
    return false;
  }
}

export interface ContainerPushPayload {
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
 * Dispatches Web Push Notifications to all subscribed devices for public tracking links
 * matching the updated container.
 *
 * STRICT DATA SECURITY:
 * Each tracking link receives ONLY its own receipts.
 * No customer can ever receive or see another customer's receipt numbers.
 */
export async function notifyWebPushOfContainerUpdate(payload: ContainerPushPayload): Promise<{
  notifiedCount: number;
  tokensCount: number;
}> {
  if (!ensureVapidDetails()) {
    return { notifiedCount: 0, tokensCount: 0 };
  }

  const cleanAlias = (payload.container || '').trim();
  if (!cleanAlias) return { notifiedCount: 0, tokensCount: 0 };

  try {
    await connectToDatabase();

    // 1. Find all receipt numbers in this container from Shipment
    const containerShipments = await Shipment.find({
      $or: [
        { container: new RegExp(`^${cleanAlias}$`, 'i') },
        ...(payload.containerNumber ? [{ containerNumber: new RegExp(`^${payload.containerNumber}$`, 'i') }] : []),
        ...(payload.blNumber ? [{ blNumber: payload.blNumber }] : []),
      ],
    }).select({ receipt: 1 }).lean();

    const receiptNos = Array.from(new Set(containerShipments.map((s: any) => s.receipt).filter(Boolean)));
    if (receiptNos.length === 0) return { notifiedCount: 0, tokensCount: 0 };

    // 2. Find all ReceiptTracking links that include any of these receipts
    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': { $in: receiptNos },
    }).select({ token: 1, name: 1, receipts: 1 }).lean();

    if (!trackingLinks || trackingLinks.length === 0) {
      return { notifiedCount: 0, tokensCount: 0 };
    }

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let tokensNotified = 0;

    for (const link of trackingLinks) {
      // Find ONLY the receipts belonging to this specific customer's link that match this container
      const matchingReceiptsForThisLink = (link.receipts || [])
        .map((r: any) => String(r.receiptNo || '').trim())
        .filter((rNo: string) => receiptNos.includes(rNo));

      if (matchingReceiptsForThisLink.length === 0) continue;

      // Find active push subscriptions for this customer link token
      const subscriptions = await WebPushSubscription.find({
        token: link.token,
        active: true,
      }).lean();

      if (!subscriptions || subscriptions.length === 0) continue;

      tokensNotified++;

      // Construct notification message strictly for this customer
      const clientName = link.name ? ` (${link.name})` : '';
      const receiptsSummary =
        matchingReceiptsForThisLink.length <= 3
          ? matchingReceiptsForThisLink.join(', ')
          : `${matchingReceiptsForThisLink.slice(0, 3).join(', ')} +${matchingReceiptsForThisLink.length - 3} more`;

      let etaChangeSummary = '';
      if (payload.newEta) {
        if (payload.oldEta && payload.oldEta !== payload.newEta) {
          etaChangeSummary = `ETA changed: ${payload.oldEta} ➔ ${payload.newEta}`;
        } else {
          etaChangeSummary = `New ETA: ${payload.newEta}`;
        }
      }

      if (payload.etaDaysShift) {
        etaChangeSummary += payload.etaDaysShift > 0
          ? ` (+${payload.etaDaysShift}d)`
          : ` (${payload.etaDaysShift}d)`;
      }

      const title = `🚢 Cargo Update: Container ${payload.container}`;
      const body = `${etaChangeSummary}\nReceipt(s): ${receiptsSummary}`;
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=eta&t=${Date.now()}`;

      const pushPayload = JSON.stringify({
        title,
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: trackingUrl,
        token: link.token,
        container: payload.container,
      });

      for (const sub of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          };

          await webpush.sendNotification(pushSubscription, pushPayload);
          totalNotified++;
        } catch (pushErr: any) {
          // If the endpoint is expired, gone (410), or invalid (404), mark inactive
          if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
            await WebPushSubscription.updateOne(
              { endpoint: sub.endpoint },
              { $set: { active: false } }
            ).catch(() => {});
          } else {
            console.warn(`[WebPushNotifier] Failed to send push to ${sub.endpoint}:`, pushErr?.message);
          }
        }
      }
    }

    return { notifiedCount: totalNotified, tokensCount: tokensNotified };
  } catch (err: any) {
    console.error('[WebPushNotifier] Error dispatching push updates:', err);
    return { notifiedCount: 0, tokensCount: 0 };
  }
}

export interface GoodsLoadedPushPayload {
  receiptNo: string;
  container: string;
  containerNumber?: string;
  quantity?: number | string;
  warehouse?: string;
  itemName?: string;
  eta?: string;
}

/**
 * Dispatches Web Push Notification when goods for a specific receipt are loaded into a container
 */
export async function notifyWebPushOfGoodsLoaded(payload: GoodsLoadedPushPayload): Promise<{
  notifiedCount: number;
  tokensCount: number;
}> {
  if (!ensureVapidDetails()) return { notifiedCount: 0, tokensCount: 0 };
  const cleanReceipt = (payload.receiptNo || '').trim();
  if (!cleanReceipt) return { notifiedCount: 0, tokensCount: 0 };

  try {
    await connectToDatabase();

    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': cleanReceipt,
    }).select({ token: 1, name: 1 }).lean();

    if (!trackingLinks || trackingLinks.length === 0) return { notifiedCount: 0, tokensCount: 0 };

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let tokensNotified = 0;

    for (const link of trackingLinks) {
      const subscriptions = await WebPushSubscription.find({
        token: link.token,
        active: true,
      }).lean();

      if (!subscriptions || subscriptions.length === 0) continue;
      tokensNotified++;

      const title = `📦 Goods Loaded: Receipt #${cleanReceipt}`;
      const qtyStr = payload.quantity ? `${payload.quantity} CTN ` : '';
      const whStr = payload.warehouse ? ` from ${payload.warehouse} WH` : '';
      const etaStr = payload.eta && payload.eta !== 'Pending' ? ` • ETA: ${payload.eta}` : '';
      const body = `Your goods (${qtyStr})have been loaded into Container ${payload.container}${whStr}.${etaStr}`;
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=loaded&t=${Date.now()}`;

      const pushPayload = JSON.stringify({
        title,
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: trackingUrl,
        token: link.token,
        container: payload.container,
        receiptNo: cleanReceipt,
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          }, pushPayload);
          totalNotified++;
        } catch (pushErr: any) {
          if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
            await WebPushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { active: false } }).catch(() => {});
          }
        }
      }
    }

    return { notifiedCount: totalNotified, tokensCount: tokensNotified };
  } catch (err: any) {
    console.error('[WebPushNotifier] Error dispatching goods loaded push:', err);
    return { notifiedCount: 0, tokensCount: 0 };
  }
}

export interface ContainerDeliveryPushPayload {
  container: string;
  containerNumber?: string;
  deliveryDate: string;
  receiptNos?: string[];
}

/**
 * Dispatches Web Push Notification when a container or its receipts are marked as delivered
 */
export async function notifyWebPushOfDelivery(payload: ContainerDeliveryPushPayload): Promise<{
  notifiedCount: number;
  tokensCount: number;
}> {
  if (!ensureVapidDetails()) return { notifiedCount: 0, tokensCount: 0 };
  const cleanAlias = (payload.container || '').trim();
  if (!cleanAlias) return { notifiedCount: 0, tokensCount: 0 };

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

    if (receiptNos.length === 0) return { notifiedCount: 0, tokensCount: 0 };

    const trackingLinks = await ReceiptTracking.find({
      'receipts.receiptNo': { $in: receiptNos },
    }).select({ token: 1, name: 1, receipts: 1 }).lean();

    if (!trackingLinks || trackingLinks.length === 0) return { notifiedCount: 0, tokensCount: 0 };

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    let totalNotified = 0;
    let tokensNotified = 0;

    for (const link of trackingLinks) {
      const matchingReceiptsForThisLink = (link.receipts || [])
        .map((r: any) => String(r.receiptNo || '').trim())
        .filter((rNo: string) => receiptNos.includes(rNo));

      if (matchingReceiptsForThisLink.length === 0) continue;

      const subscriptions = await WebPushSubscription.find({
        token: link.token,
        active: true,
      }).lean();

      if (!subscriptions || subscriptions.length === 0) continue;
      tokensNotified++;

      const receiptsStr = matchingReceiptsForThisLink.length <= 3
        ? matchingReceiptsForThisLink.join(', ')
        : `${matchingReceiptsForThisLink.slice(0, 3).join(', ')} +${matchingReceiptsForThisLink.length - 3} more`;

      const title = `✅ Cargo Delivered: Container ${cleanAlias}`;
      const body = `Receipt(s) [${receiptsStr}] marked as DELIVERED on ${payload.deliveryDate}. Tap to view live cargo status.`;
      const trackingUrl = `${appBaseUrl}/track/${link.token}?notif=loaded&t=${Date.now()}`;

      const pushPayload = JSON.stringify({
        title,
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: trackingUrl,
        token: link.token,
        container: cleanAlias,
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          }, pushPayload);
          totalNotified++;
        } catch (pushErr: any) {
          if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
            await WebPushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { active: false } }).catch(() => {});
          }
        }
      }
    }

    return { notifiedCount: totalNotified, tokensCount: tokensNotified };
  } catch (err: any) {
    console.error('[WebPushNotifier] Error dispatching delivery push:', err);
    return { notifiedCount: 0, tokensCount: 0 };
  }
}

/**
 * Sends a test Web Push notification to all active devices subscribed to this token
 */
export async function sendTestPushNotification(token: string): Promise<{ success: boolean; sentCount: number; message: string }> {
  if (!ensureVapidDetails()) {
    return { success: false, sentCount: 0, message: 'Push server keys not configured' };
  }

  try {
    await connectToDatabase();
    const subs = await WebPushSubscription.find({ token, active: true }).lean();
    if (!subs || subs.length === 0) {
      return { success: false, sentCount: 0, message: 'No active device subscriptions found for this link.' };
    }

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'https://cargotracker.usinternationallogistics.com';

    const testPayload = JSON.stringify({
      title: '🔔 Test Alert: US International Logistics',
      body: 'Screen push alerts are active on your device! You will receive live arrival and delivery updates.',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      url: `${appBaseUrl}/track/${token}?notif=test&t=${Date.now()}`,
      token,
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        }, testPayload);
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await WebPushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { active: false } }).catch(() => {});
        }
      }
    }

    return {
      success: sent > 0,
      sentCount: sent,
      message: sent > 0 ? `Test notification sent successfully to ${sent} device(s)!` : 'Could not deliver push notification to device.',
    };
  } catch (err: any) {
    return { success: false, sentCount: 0, message: err?.message || 'Error sending test push' };
  }
}

