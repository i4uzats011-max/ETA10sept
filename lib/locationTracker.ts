'use client';

import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface LiveLocationData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  updatedAt: string;
  isTracking: boolean;
  error?: string | null;
}

let watchId: string | number | null = null;
let lastPingTime = 0;

let currentLocation: LiveLocationData = {
  latitude: null,
  longitude: null,
  accuracy: null,
  speed: null,
  heading: null,
  updatedAt: '',
  isTracking: false,
  error: null,
};

/**
 * Start active live location tracking (runs continuously in foreground / background)
 */
export async function startLiveLocationTracking(onUpdate?: (data: LiveLocationData) => void): Promise<LiveLocationData> {
  if (typeof window === 'undefined') return currentLocation;

  currentLocation.isTracking = true;

  const handleCoords = async (coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number | null;
    heading?: number | null;
  }) => {
    currentLocation = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy || null,
      speed: coords.speed ?? null,
      heading: coords.heading ?? null,
      updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isTracking: true,
      error: null,
    };

    // Save to local storage for instant retrieval across pages
    try {
      localStorage.setItem('CARGO_LIVE_GPS', JSON.stringify(currentLocation));
    } catch {}

    // Dispatch custom event for UI components
    window.dispatchEvent(new CustomEvent('cargo:location-update', { detail: currentLocation }));

    if (onUpdate) onUpdate(currentLocation);

    // Throttle server sync: ping at most once every 15 seconds
    const now = Date.now();
    if (now - lastPingTime > 15000) {
      lastPingTime = now;
      try {
        const vehicleNumber = localStorage.getItem('CARGO_ACTIVE_VEHICLE') || undefined;
        fetch('/api/location/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading,
            platform: Capacitor.getPlatform(),
            vehicleNumber,
          }),
        }).catch(() => {});
      } catch {}
    }
  };

  if (Capacitor.isNativePlatform()) {
    try {
      // Check and request permissions
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          currentLocation.error = 'Location permission denied';
          return currentLocation;
        }
      }

      // Initial quick location
      try {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        handleCoords(pos.coords);
      } catch {}

      // Continuous watch
      watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        },
        (position, err) => {
          if (position?.coords) {
            handleCoords(position.coords);
          } else if (err) {
            currentLocation.error = err.message || 'GPS Signal Search...';
          }
        }
      );
    } catch (e: any) {
      currentLocation.error = e?.message || 'Failed to start GPS tracking';
    }
  } else if ('geolocation' in navigator) {
    // Browser fallback
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => handleCoords(pos.coords),
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );

      watchId = navigator.geolocation.watchPosition(
        (pos) => handleCoords(pos.coords),
        (err) => { currentLocation.error = err.message; },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (e: any) {
      currentLocation.error = e?.message;
    }
  }

  return currentLocation;
}

/**
 * Get the latest known live location
 */
export function getLatestLiveLocation(): LiveLocationData {
  if (typeof window !== 'undefined' && !currentLocation.latitude) {
    try {
      const saved = localStorage.getItem('CARGO_LIVE_GPS');
      if (saved) {
        currentLocation = JSON.parse(saved);
      }
    } catch {}
  }
  return currentLocation;
}
