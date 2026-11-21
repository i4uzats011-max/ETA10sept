'use client';

import { Preferences } from '@capacitor/preferences';
import { Geolocation } from '@capacitor/geolocation';

const AUTH_TOKEN_KEY = 'CARGO_AUTH_PERSISTENT_TOKEN';
const USER_ROLE_KEY = 'CARGO_AUTH_USER_ROLE';
const USER_INFO_KEY = 'CARGO_AUTH_USER_INFO';

/**
 * Save login session to native device storage (survives app close / phone reboot)
 */
export async function saveMobileSession(token: string, role: string, user: any) {
  try {
    await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
    await Preferences.set({ key: USER_ROLE_KEY, value: role });
    await Preferences.set({ key: USER_INFO_KEY, value: JSON.stringify(user) });
  } catch (err) {
    console.warn('Preferences storage unavailable in pure browser context:', err);
  }
}

/**
 * Retrieve saved persistent mobile session
 */
export async function getSavedMobileSession(): Promise<{ token: string | null; role: string | null; user: any | null }> {
  try {
    const tokenRes = await Preferences.get({ key: AUTH_TOKEN_KEY });
    const roleRes = await Preferences.get({ key: USER_ROLE_KEY });
    const userRes = await Preferences.get({ key: USER_INFO_KEY });

    return {
      token: tokenRes.value,
      role: roleRes.value,
      user: userRes.value ? JSON.parse(userRes.value) : null,
    };
  } catch {
    return { token: null, role: null, user: null };
  }
}

/**
 * Clear mobile session on logout
 */
export async function clearMobileSession() {
  try {
    await Preferences.remove({ key: AUTH_TOKEN_KEY });
    await Preferences.remove({ key: USER_ROLE_KEY });
    await Preferences.remove({ key: USER_INFO_KEY });
  } catch (err) {
    console.warn('Error clearing preferences:', err);
  }
}

/**
 * Request and retrieve Live GPS Location (using Capacitor Geolocation plugin)
 */
export async function requestLiveGpsLocation(): Promise<{
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error?: string;
}> {
  try {
    // Check/request permissions
    const permStatus = await Geolocation.checkPermissions();
    if (permStatus.location !== 'granted') {
      const reqStatus = await Geolocation.requestPermissions();
      if (reqStatus.location !== 'granted') {
        return {
          latitude: null,
          longitude: null,
          accuracy: null,
          error: 'Location permission denied by user',
        };
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 3000,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch (err: any) {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      error: err.message || 'Unable to retrieve GPS coordinates',
    };
  }
}
