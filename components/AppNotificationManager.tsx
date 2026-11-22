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
} from 'lucide-react';
import {
  NOTIFICATION_TONES,
  NotificationTone,
  playNotificationSound,
  requestAppStartupPermissions,
} from '@/lib/soundNotification';

interface ToastItem {
  id: string;
  title: string;
  body: string;
  actionUrl?: string;
  timestamp: string;
}

export default function AppNotificationManager() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTone, setCurrentTone] = useState<NotificationTone>('chime');
  const [isMuted, setIsMuted] = useState(false);
  const [permissionsState, setPermissionsState] = useState<{
    location: boolean;
    notification: boolean;
    asked: boolean;
  }>({ location: false, notification: false, asked: false });

  // On initial mount: request permissions and load preferences
  useEffect(() => {
    // 1. Load preferences
    const savedTone = (localStorage.getItem('CARGO_NOTIFICATION_TONE') as NotificationTone) || 'chime';
    const savedMuted = localStorage.getItem('CARGO_NOTIFICATION_MUTED') === 'true';
    setCurrentTone(savedTone);
    setIsMuted(savedMuted);

    // 2. Request startup permissions automatically
    const askPermissions = async () => {
      const res = await requestAppStartupPermissions();
      setPermissionsState({
        location: res.location,
        notification: res.notification,
        asked: true,
      });
    };

    // Slight delay to avoid browser popup blocking during initial paint
    const timer = setTimeout(() => {
      askPermissions();
    }, 800);

    // 3. Listen for in-app notification events
    const handleNotification = (e: any) => {
      const detail = e.detail as ToastItem;
      setToasts((prev) => [detail, ...prev.slice(0, 4)]);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 6000);
    };

    window.addEventListener('cargo:notification', handleNotification);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('cargo:notification', handleNotification);
    };
  }, []);

  const handleSelectTone = (tone: NotificationTone) => {
    setCurrentTone(tone);
    localStorage.setItem('CARGO_NOTIFICATION_TONE', tone);
    // Play sound preview
    playNotificationSound(tone);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    localStorage.setItem('CARGO_NOTIFICATION_MUTED', next ? 'true' : 'false');
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {/* Floating Notification & Sound Settings Button */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center space-x-2">
        <button
          onClick={() => setIsSettingsOpen(true)}
          title="Notification Ringtone & Permissions"
          className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-white rounded-full shadow-lg border border-slate-700 text-xs font-medium backdrop-blur-sm transition-all transform hover:scale-105"
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="hidden sm:inline">Ringtone</span>
        </button>
      </div>

      {/* In-App Toast Alert Banners (Top-Right) */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col space-y-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/95 border border-emerald-500/50 shadow-2xl rounded-xl p-3.5 text-white backdrop-blur-md animate-in slide-in-from-top-3 duration-200 transition-all flex items-start space-x-3"
          >
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg flex-shrink-0 mt-0.5">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-emerald-300 truncate">
                  {toast.title}
                </h4>
                <span className="text-[10px] text-slate-400 ml-2">
                  {toast.timestamp}
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-0.5 leading-relaxed break-words">
                {toast.body}
              </p>
              {toast.actionUrl && (
                <a
                  href={toast.actionUrl}
                  className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium mt-1.5 underline underline-offset-2"
                >
                  <span>देखें (View)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => handleDismissToast(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Ringtone & Permission Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 text-white shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    नोटिफिकेशन व रिंगटोन सेटिंग्स
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Customize alert sounds & mobile permissions
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mute Toggle */}
            <div className="mt-4 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
                <span className="text-xs font-medium">
                  {isMuted ? 'साउंड म्यूट है (Muted)' : 'साउंड चालू है (Sound Active)'}
                </span>
              </div>
              <button
                onClick={handleToggleMute}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isMuted
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>

            {/* Ringtone Selection */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                चुनें रिंगटोन (Select Notification Ringtone):
              </label>
              <div className="space-y-2">
                {NOTIFICATION_TONES.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTone(t.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      currentTone === t.id
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm'
                        : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          currentTone === t.id
                            ? 'border-emerald-400 bg-emerald-500'
                            : 'border-slate-500'
                        }`}
                      >
                        {currentTone === t.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{t.name}</p>
                        <p className="text-[10px] text-slate-400">{t.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playNotificationSound(t.id);
                      }}
                      className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 rounded-md text-emerald-400 font-medium transition-colors"
                    >
                      ▶ टेस्ट करें
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions Summary & Grant Button */}
            <div className="mt-5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-300 text-xs">
                सिस्टम परमिशन स्टेटस (Permissions):
              </p>
              <div className="flex items-center justify-between">
                <span>📍 लोकेशन परमिशन (GPS):</span>
                <span
                  className={
                    permissionsState.location ? 'text-emerald-400 font-medium' : 'text-amber-400'
                  }
                >
                  {permissionsState.location ? 'सक्रिय (Granted)' : 'अनुरोधित / डिफ़ॉल्ट'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>🔔 नोटिफिकेशन परमिशन:</span>
                <span
                  className={
                    permissionsState.notification ? 'text-emerald-400 font-medium' : 'text-amber-400'
                  }
                >
                  {permissionsState.notification ? 'सक्रिय (Granted)' : 'अनुरोधित / डिफ़ॉल्ट'}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const res = await requestAppStartupPermissions();
                  setPermissionsState({
                    location: res.location,
                    notification: res.notification,
                    asked: true,
                  });
                }}
                className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
              >
                परमिशंस पुनः मांगें (Re-request Permissions)
              </button>
            </div>

            <button
              onClick={() => setIsSettingsOpen(false)}
              className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
            >
              पूर्ण (Done)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
