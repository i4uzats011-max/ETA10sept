'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Volume2,
  VolumeX,
  MapPin,
  CheckCircle,
  X,
  Radio,
  Settings,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Navigation,
  Send,
  Trash2,
  Compass,
} from 'lucide-react';
import {
  NOTIFICATION_TONES,
  NotificationTone,
  playNotificationSound,
  requestAppStartupPermissions,
  triggerNotificationAlert,
} from '@/lib/soundNotification';
import { startLiveLocationTracking, LiveLocationData } from '@/lib/locationTracker';

interface ToastItem {
  id: string;
  title: string;
  body: string;
  actionUrl?: string;
  timestamp: string;
  read?: boolean;
}

export default function AppNotificationManager() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<ToastItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isGpsModalOpen, setIsGpsModalOpen] = useState(false);
  const [currentTone, setCurrentTone] = useState<NotificationTone>('chime');
  const [isMuted, setIsMuted] = useState(false);
  const [permissionsState, setPermissionsState] = useState<{
    location: boolean;
    notification: boolean;
    asked: boolean;
  }>({ location: false, notification: false, asked: false });
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  // Live Location State
  const [liveLocation, setLiveLocation] = useState<LiveLocationData>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    heading: null,
    updatedAt: '',
    isTracking: false,
    error: null,
  });

  // On initial mount: request permissions, start live tracking, and listen for events
  useEffect(() => {
    // 1. Load preferences & history
    const savedTone = (localStorage.getItem('CARGO_NOTIFICATION_TONE') as NotificationTone) || 'chime';
    const savedMuted = localStorage.getItem('CARGO_NOTIFICATION_MUTED') === 'true';
    setCurrentTone(savedTone);
    setIsMuted(savedMuted);

    try {
      const savedHistory = localStorage.getItem('CARGO_NOTIF_HISTORY');
      if (savedHistory) {
        setNotificationHistory(JSON.parse(savedHistory));
      }
    } catch {}

    // 2. Request startup permissions and start continuous live GPS tracking
    const initAppServices = async () => {
      try {
        const res = await requestAppStartupPermissions();
        setPermissionsState({
          location: res.location,
          notification: res.notification,
          asked: true,
        });

        // Start active live GPS location tracking
        const loc = await startLiveLocationTracking((data) => {
          setLiveLocation(data);
        });
        setLiveLocation(loc);

        // Show banner only if either permission is still missing
        const isDismissed = sessionStorage.getItem('CARGO_PERM_BANNER_DISMISSED') === 'true';
        if ((!res.location || !res.notification) && !isDismissed) {
          setShowPermissionBanner(true);
        }
      } catch (e) {
        console.warn('App startup services note:', e);
      }
    };

    const timer = setTimeout(initAppServices, 800);

    // 3. Listen for live location updates from other parts of the app
    const handleLocationUpdate = (e: any) => {
      if (e.detail) setLiveLocation(e.detail);
    };
    window.addEventListener('cargo:location-update', handleLocationUpdate);

    // 4. Listen for in-app notification events
    const handleNotification = (e: any) => {
      const detail = e.detail as ToastItem;
      const enrichedItem: ToastItem = {
        ...detail,
        id: detail.id || String(Date.now()),
        timestamp: detail.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };

      setToasts((prev) => [enrichedItem, ...prev.slice(0, 3)]);
      setNotificationHistory((prev) => {
        const updated = [enrichedItem, ...prev.slice(0, 49)];
        try {
          localStorage.setItem('CARGO_NOTIF_HISTORY', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // Auto dismiss on-screen banner after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== enrichedItem.id));
      }, 5000);
    };

    window.addEventListener('cargo:notification', handleNotification);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('cargo:location-update', handleLocationUpdate);
      window.removeEventListener('cargo:notification', handleNotification);
    };
  }, []);

  const handleSelectTone = (tone: NotificationTone) => {
    setCurrentTone(tone);
    localStorage.setItem('CARGO_NOTIFICATION_TONE', tone);
    playNotificationSound(tone);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    localStorage.setItem('CARGO_NOTIFICATION_MUTED', next ? 'true' : 'false');
  };

  const handleTestNotification = async () => {
    await triggerNotificationAlert({
      title: '🚚 Cargo Logistics Test Alert',
      body: `Live GPS: ${liveLocation.latitude ? `${liveLocation.latitude.toFixed(4)}°, ${liveLocation.longitude?.toFixed(4)}°` : 'Searching Signal'} | Ringtone: ${currentTone}`,
      tone: currentTone,
    });
  };

  const handleClearHistory = () => {
    setNotificationHistory([]);
    try {
      localStorage.removeItem('CARGO_NOTIF_HISTORY');
    } catch {}
  };

  const unreadCount = notificationHistory.filter((n) => !n.read).length;

  return (
    <>
      {/* Floating Mobile Live Status Dock (Top Right) */}
      <div className="fixed top-3 right-3 z-[9990] flex items-center space-x-2">
        {/* Live GPS Tracker Pill */}
        <button
          type="button"
          onClick={() => setIsGpsModalOpen(true)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold backdrop-blur-md shadow-lg border transition-all active:scale-95 ${
            liveLocation.latitude
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80'
              : 'bg-slate-900/80 border-slate-700/60 text-slate-400 hover:bg-slate-800'
          }`}
          title="लाइव GPS लोकेशन ट्रैकिंग देखें"
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                liveLocation.latitude ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                liveLocation.latitude ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <Navigation className="w-3 h-3 text-emerald-400" />
          <span className="font-mono text-[10px] hidden sm:inline">
            {liveLocation.latitude
              ? `${liveLocation.latitude.toFixed(2)}°, ${liveLocation.longitude?.toFixed(2)}°`
              : 'GPS...'}
          </span>
          <span className="sm:hidden text-[10px]">GPS</span>
        </button>

        {/* Notification Center Bell Button */}
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="relative p-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-white rounded-full shadow-lg backdrop-blur-md transition-all active:scale-95"
          title="नोटिफिकेशन सेंटर (Notification Center)"
        >
          <Bell className="w-4 h-4 text-amber-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white shadow">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Startup / Installation Permission Request Banner */}
      {showPermissionBanner && (!permissionsState.location || !permissionsState.notification) && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[9998] max-w-md bg-slate-900/95 border border-emerald-500/60 rounded-2xl p-4 text-white shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <Smartphone className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-emerald-300">
                  📱 ऐप अनुमतियाँ (App Permissions Required)
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  बेहतर डिलीवरी ट्रैकिंग व लाइव नोटिफिकेशन के लिए GPS व सूचना अनुमति चालू करें।
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowPermissionBanner(false);
                sessionStorage.setItem('CARGO_PERM_BANNER_DISMISSED', 'true');
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3.5 flex items-center space-x-2">
            <button
              onClick={async () => {
                const res = await requestAppStartupPermissions();
                setPermissionsState({
                  location: res.location,
                  notification: res.notification,
                  asked: true,
                });
                if (res.location) {
                  startLiveLocationTracking((data) => setLiveLocation(data));
                }
                if (res.location && res.notification) {
                  setShowPermissionBanner(false);
                }
              }}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center space-x-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>अनुमतियाँ चालू करें (Allow Permissions)</span>
            </button>
          </div>
        </div>
      )}

      {/* On-Screen Toast Banners */}
      <div className="fixed top-14 right-3 z-[9995] flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/95 border border-amber-500/50 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md text-white animate-in slide-in-from-top-3 duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2.5">
                <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg shrink-0 mt-0.5">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-amber-300">{toast.title}</h5>
                  <p className="text-[11px] text-slate-300 mt-0.5">{toast.body}</p>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">{toast.timestamp}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* GPS Live Tracking Modal */}
      {isGpsModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl max-w-md w-full p-5 text-white shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-emerald-300">
                    📍 लाइव GPS लोकेशन ट्रैकिंग (Live GPS Tracking)
                  </h3>
                  <p className="text-[10px] text-slate-400">लगातार सक्रिय बैकग्राउंड लोकेशन ट्रैकिंग</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGpsModalOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {liveLocation.latitude ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Latitude (अक्षांश):</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {liveLocation.latitude.toFixed(6)}° N
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Longitude (देशांतर):</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {liveLocation.longitude?.toFixed(6)}° E
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">GPS Accuracy (सटीकता):</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      ±{liveLocation.accuracy ? Math.round(liveLocation.accuracy) : 5} मीटर (Meters)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">अंतिम अपडेट (Updated):</span>
                    <span className="font-mono font-bold text-cyan-300 text-xs">
                      {liveLocation.updatedAt || 'सक्रिय'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <a
                    href={`https://www.google.com/maps?q=${liveLocation.latitude},${liveLocation.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center space-x-1.5 shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Google Maps पर देखें</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${liveLocation.latitude},${liveLocation.longitude}`);
                      alert('✓ GPS Coordinates Copied!');
                    }}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p>GPS सिग्नल खोजा जा रहा है...</p>
                <p className="text-[10px] text-slate-500">सुनिश्चित करें कि फोन की लोकेशन / GPS सर्विस चालू है।</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Polished Slide-Over Notification Center Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col text-white shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm text-white">नोटिफिकेशन सेंटर (Notifications)</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions & Settings Bar */}
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs gap-2">
              <button
                type="button"
                onClick={handleTestNotification}
                className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-[11px] font-bold flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>🔔 टेस्ट नोटिफिकेशन भेजें</span>
              </button>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`p-1.5 rounded-lg border text-xs font-bold flex items-center space-x-1 ${
                    isMuted
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                  title={isMuted ? 'ध्वनि चालू करें' : 'म्यूट करें'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span className="text-[10px]">{isMuted ? 'Muted' : 'Sound ON'}</span>
                </button>
                {notificationHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition"
                    title="सभी नोटिफिकेशन साफ़ करें"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Notification History List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {notificationHistory.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                  <Bell className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
                  <p>कोई नया नोटिफिकेशन नहीं है।</p>
                  <p className="text-[11px] text-slate-600">
                    'टेस्ट नोटिफिकेशन भेजें' पर क्लिक करके आवाज़ और सिस्टम अलर्ट जाँचें।
                  </p>
                </div>
              ) : (
                notificationHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-1 hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 text-xs">{item.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{item.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-300">{item.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Tone Selector Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs">
              <span className="text-[10px] text-slate-400 block mb-1.5 font-bold">रिंगटोन टोन (Ringtone Tone):</span>
              <div className="grid grid-cols-3 gap-1">
                {NOTIFICATION_TONES.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTone(t.id)}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition ${
                      currentTone === t.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {t.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
