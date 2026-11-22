'use client';

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation } from '@capacitor/geolocation';

export type NotificationTone = 'chime' | 'bell' | 'digital' | 'whistle' | 'marimba';

export const NOTIFICATION_TONES: { id: NotificationTone; name: string; description: string }[] = [
  { id: 'chime', name: 'Crystal Chime (डिफ़ॉल्ट चाइम)', description: 'Two-tone bright harmonious chime' },
  { id: 'bell', name: 'Desk Bell (घंटी)', description: 'Clear resonance metallic bell' },
  { id: 'digital', name: 'Digital Beep (डिजिटल बीप)', description: 'Fast futuristic alert beeps' },
  { id: 'whistle', name: 'Alert Whistle (सीटी)', description: 'Smooth melodic frequency sweep' },
  { id: 'marimba', name: 'Soft Marimba (सॉफ्ट मरिम्बा)', description: 'Warm acoustic tri-tone' },
];

/**
 * Synthesizes audio tones using HTML5 Web Audio API (zero network lag, works 100% offline)
 */
export function playNotificationSound(customTone?: NotificationTone): void {
  if (typeof window === 'undefined') return;

  try {
    const isMuted = localStorage.getItem('CARGO_NOTIFICATION_MUTED') === 'true';
    if (isMuted) return;

    const tone = customTone || (localStorage.getItem('CARGO_NOTIFICATION_TONE') as NotificationTone) || 'chime';
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (tone === 'chime') {
      // Harmonic two-tone chime (880Hz A5 -> 1320Hz E6)
      playTone(ctx, 880, now, 0.35, 'sine');
      playTone(ctx, 1320, now + 0.12, 0.45, 'triangle');
    } else if (tone === 'bell') {
      // Metallic desk bell with harmonics
      playTone(ctx, 1046.5, now, 0.8, 'sine'); // C6
      playTone(ctx, 2093.0, now, 0.5, 'sine'); // C7 harmonic
    } else if (tone === 'digital') {
      // 3 rapid digital beeps
      playTone(ctx, 1200, now, 0.08, 'square');
      playTone(ctx, 1200, now + 0.1, 0.08, 'square');
      playTone(ctx, 1500, now + 0.2, 0.12, 'square');
    } else if (tone === 'whistle') {
      // Frequency sweep whistle
      playSweep(ctx, 800, 1600, now, 0.35);
    } else if (tone === 'marimba') {
      // Warm acoustic tri-tone
      playTone(ctx, 523.25, now, 0.3, 'sine'); // C5
      playTone(ctx, 659.25, now + 0.1, 0.3, 'sine'); // E5
      playTone(ctx, 783.99, now + 0.2, 0.4, 'sine'); // G5
    }

    // Phone haptic vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([120, 60, 120]);
    }
  } catch (err) {
    console.warn('Audio synthesis note:', err);
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSweep(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  startTime: number,
  duration: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

let isListenerRegistered = false;

/**
 * Initializes Android notification channel and tap action listener
 * so clicking the notification in the phone's notification drawer brings the app to the front and navigates
 */
export async function initNotificationListeners(): Promise<void> {
  if (typeof window === 'undefined' || isListenerRegistered) return;
  isListenerRegistered = true;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Create High-Priority Notification Channel for Android
      await LocalNotifications.createChannel({
        id: 'cargo_alerts',
        name: 'Cargo & Logistics Urgent Alerts',
        description: 'Instant notification alerts for Dispatch, Billing, and Live Field Tracking',
        importance: 5, // MAX importance - pops up as heads-up banner on phone
        visibility: 1, // VISIBILITY_PUBLIC
        vibration: true,
        lights: true,
        lightColor: '#10b981',
      });

      // 2. Register tap listener: when user clicks notification in status bar, open app & redirect
      await LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        const actionUrl = notificationAction.notification.extra?.actionUrl;
        if (actionUrl && typeof window !== 'undefined') {
          if (window.location.pathname !== actionUrl) {
            window.location.href = actionUrl;
          }
        }
      });
    } catch (e) {
      console.warn('Notification channel & listener init note:', e);
    }
  }
}

/**
 * Triggers interactive inter-user notification with audio chime, haptic vibration,
 * native mobile system notification, and on-screen toast
 */
export async function triggerNotificationAlert(opts: {
  title: string;
  body: string;
  tone?: NotificationTone;
  actionUrl?: string;
}) {
  // 1. Play sound chime & haptic vibration
  playNotificationSound(opts.tone);

  // 2. Mobile App Native Notification (Capacitor LocalNotifications)
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        await initNotificationListeners();
        await LocalNotifications.schedule({
          notifications: [
            {
              title: opts.title,
              body: opts.body,
              id: Math.floor(Date.now() % 100000),
              schedule: { at: new Date(Date.now() + 100) },
              channelId: 'cargo_alerts',
              smallIcon: 'ic_launcher',
              extra: { actionUrl: opts.actionUrl || '/' },
            },
          ],
        });
      }
    } catch (e) {
      console.warn('Native notification schedule note:', e);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    // 3. Desktop / Browser notification fallback
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(opts.title, {
          body: opts.body,
          icon: '/images/hero-ship.svg',
        });
        notif.onclick = () => {
          window.focus();
          if (opts.actionUrl) {
            window.location.href = opts.actionUrl;
          }
        };
      } catch (e) {
        // Fallback for sandboxed webviews
      }
    }
  }

  // 4. Dispatch in-app event for UI toast banner
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cargo:notification', {
        detail: {
          id: Date.now().toString(),
          title: opts.title,
          body: opts.body,
          actionUrl: opts.actionUrl,
          timestamp: new Date().toLocaleTimeString(),
        },
      })
    );
  }
}

/**
 * Checks current permission status for Notification and Location
 */
export async function checkAppPermissionsStatus(): Promise<{
  location: boolean;
  notification: boolean;
}> {
  let location = false;
  let notification = false;

  if (typeof window === 'undefined') {
    return { location: false, notification: false };
  }

  // 1. Check Capacitor Native Permissions
  if (Capacitor.isNativePlatform()) {
    try {
      const locPerm = await Geolocation.checkPermissions();
      location = locPerm.location === 'granted';
    } catch {}

    try {
      const notifPerm = await LocalNotifications.checkPermissions();
      notification = notifPerm.display === 'granted';
    } catch {}

    return { location, notification };
  }

  // 2. Check Browser Permissions
  if ('Notification' in window) {
    notification = Notification.permission === 'granted';
  }

  if ('permissions' in navigator && navigator.permissions?.query) {
    try {
      const locStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      location = locStatus.state === 'granted';
    } catch {}
  }

  return { location, notification };
}

/**
 * Automatically prompts user on app installation/startup for:
 * 1. Location permission (Capacitor Geolocation / GPS)
 * 2. Notification permission (Capacitor LocalNotifications / Browser)
 */
export async function requestAppStartupPermissions(): Promise<{
  location: boolean;
  notification: boolean;
}> {
  let locationGranted = false;
  let notificationGranted = false;

  if (typeof window === 'undefined') {
    return { location: false, notification: false };
  }

  // 1. Handle Native Capacitor Platform
  if (Capacitor.isNativePlatform()) {
    // Request Notification permission
    try {
      const notifCheck = await LocalNotifications.checkPermissions();
      if (notifCheck.display !== 'granted') {
        const notifReq = await LocalNotifications.requestPermissions();
        notificationGranted = notifReq.display === 'granted';
      } else {
        notificationGranted = true;
      }
    } catch (err) {
      console.warn('Native notification permission note:', err);
    }

    // Request Location permission
    try {
      const locCheck = await Geolocation.checkPermissions();
      if (locCheck.location !== 'granted') {
        const locReq = await Geolocation.requestPermissions();
        locationGranted = locReq.location === 'granted';
      } else {
        locationGranted = true;
      }
    } catch (err) {
      console.warn('Native location permission note:', err);
    }

    return { location: locationGranted, notification: notificationGranted };
  }

  // 2. Handle Web Browser Platform
  // Request Notification Permission
  if ('Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        const res = await Notification.requestPermission();
        notificationGranted = res === 'granted';
      } else {
        notificationGranted = Notification.permission === 'granted';
      }
    } catch {
      // Ignore
    }
  }

  // Request Location Permission via Geolocation
  if ('geolocation' in navigator) {
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            locationGranted = true;
            resolve();
          },
          () => {
            resolve();
          },
          { timeout: 5000, enableHighAccuracy: false }
        );
      });
    } catch {
      // Ignore
    }
  }

  return { location: locationGranted, notification: notificationGranted };
}
