import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ReduxProvider } from '@/store/ReduxProvider';

import VisitorTracker from '@/components/VisitorTracker';
import AppNotificationManager from '@/components/AppNotificationManager';

export const metadata: Metadata = {
  title: 'Cargo & Container Tracking Portal | US International Logistics',
  description: 'Real-time China to India container tracking, cargo manifest and logistics portal',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cargo Logistics Pro',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0b192c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased font-sans text-slate-900 bg-slate-950 min-h-screen selection:bg-red-500 selection:text-white overscroll-none touch-manipulation">
        <ReduxProvider>
          <VisitorTracker />
          <AppNotificationManager />
          {children}
        </ReduxProvider>
      </body>
    </html>
  );
}
