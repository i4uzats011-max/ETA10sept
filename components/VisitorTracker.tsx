'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function VisitorTracker() {
  const pathname = usePathname();
  const lastLoggedRef = useRef<{ path: string; timestamp: number }>({ path: '', timestamp: 0 });

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;

    // Throttle duplicate page hits within 3 seconds for the same route
    const now = Date.now();
    if (lastLoggedRef.current.path === pathname && now - lastLoggedRef.current.timestamp < 3000) {
      return;
    }
    lastLoggedRef.current = { path: pathname, timestamp: now };

    try {
      // 1. Get or create persistent visitorId
      let visitorId = localStorage.getItem('__trk_vid');
      if (!visitorId) {
        visitorId = 'v_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        try {
          localStorage.setItem('__trk_vid', visitorId);
        } catch {
          // LocalStorage might be disabled in private browsing
        }
      }

      // 2. Track visit count / session count
      let sessionCount = 1;
      try {
        const storedCount = localStorage.getItem('__trk_vcount');
        sessionCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;
        localStorage.setItem('__trk_vcount', sessionCount.toString());
      } catch {
        // Ignore storage exceptions
      }

      // 3. Collect client screen & hardware details
      const screenWidth = window.screen?.width || 0;
      const screenHeight = window.screen?.height || 0;
      const screenResolution = screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : '';

      const viewport = window.innerWidth && window.innerHeight ? `${window.innerWidth}x${window.innerHeight}` : '';
      const devicePixelRatio = window.devicePixelRatio || 1;

      let orientation = '';
      if (window.screen?.orientation?.type) {
        orientation = window.screen.orientation.type.includes('portrait') ? 'portrait' : 'landscape';
      } else if (window.innerHeight > window.innerWidth) {
        orientation = 'portrait';
      } else {
        orientation = 'landscape';
      }

      const touchSupport = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
      const maxTouchPoints = navigator.maxTouchPoints || 0;

      // Network connection type if available
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      const networkEffectiveType = conn?.effectiveType || '';

      const language = navigator.language || '';
      let clientTimezone = '';
      try {
        clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
        // Ignore timezone lookup failure
      }

      const referrer = document.referrer || 'Direct';

      const payload = {
        visitorId,
        sessionCount,
        path: pathname || '/',
        referrer,
        screenResolution,
        viewport,
        devicePixelRatio,
        orientation,
        touchSupport,
        maxTouchPoints,
        networkEffectiveType,
        language,
        clientTimezone,
      };

      // 4. Send tracking beacon
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/visitors/log', blob);
      } else {
        fetch('/api/visitors/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {
          // Fail silently
        });
      }
    } catch {
      // Fail silently to never impact user browsing
    }
  }, [pathname]);

  return null;
}
