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
    // 1. Capacitor native persistent storage
    await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
    await Preferences.set({ key: USER_ROLE_KEY, value: role });
    await Preferences.set({ key: USER_INFO_KEY, value: JSON.stringify(user) });

    // 2. LocalStorage backup
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(USER_ROLE_KEY, role);
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      // Also ensure cookie exists with 30-day maxAge
      document.cookie = `admin_token=${token}; path=/; max-age=2592000; SameSite=Lax`;
    }
  } catch (err) {
    console.warn('Preferences storage note:', err);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(USER_ROLE_KEY, role);
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    }
  }
}

/**
 * Retrieve saved persistent mobile session
 */
export async function getSavedMobileSession(): Promise<{ token: string | null; role: string | null; user: any | null }> {
  try {
    let token: string | null = null;
    let role: string | null = null;
    let user: any = null;

    // 1. Try native preferences
    try {
      const tokenRes = await Preferences.get({ key: AUTH_TOKEN_KEY });
      const roleRes = await Preferences.get({ key: USER_ROLE_KEY });
      const userRes = await Preferences.get({ key: USER_INFO_KEY });
      token = tokenRes.value;
      role = roleRes.value;
      user = userRes.value ? JSON.parse(userRes.value) : null;
    } catch {}

    // 2. Fallback to localStorage if preferences returned null
    if (!token && typeof window !== 'undefined') {
      token = localStorage.getItem(AUTH_TOKEN_KEY);
      role = localStorage.getItem(USER_ROLE_KEY);
      const userStr = localStorage.getItem(USER_INFO_KEY);
      user = userStr ? JSON.parse(userStr) : null;
    }

    // If token found in storage, ensure cookie is actively set so all fetch calls authenticate
    if (token && typeof document !== 'undefined') {
      if (!document.cookie.includes('admin_token=')) {
        document.cookie = `admin_token=${token}; path=/; max-age=2592000; SameSite=Lax`;
      }
    }

    return { token, role, user };
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_ROLE_KEY);
      localStorage.removeItem(USER_INFO_KEY);
      document.cookie = 'admin_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
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
