'use client';

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

/**
 * Triggers interactive inter-user notification with audio chime, haptic vibration, and on-screen toast
 */
export function triggerNotificationAlert(opts: {
  title: string;
  body: string;
  tone?: NotificationTone;
  actionUrl?: string;
}) {
  // 1. Play sound chime
  playNotificationSound(opts.tone);

  // 2. Browser native desktop / mobile notification if permitted
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(opts.title, {
          body: opts.body,
          icon: '/images/hero-ship.svg',
        });
      } catch (e) {
        // Fallback for sandboxed webviews
      }
    }
  }

  // 3. Dispatch in-app event for toast banner
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
 * Automatically prompts user on startup for:
 * 1. Location permission (Native GPS / Browser)
 * 2. Notification permission
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

  // 1. Request Notification Permission
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

  // 2. Request Location Permission via Geolocation
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
