import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cargo & Container Tracking Portal',
  description: 'Real-time container tracking and cargo management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased font-sans text-slate-900 bg-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
