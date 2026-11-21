import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.cargotracking',
  appName: 'Cargo Logistics Pro',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      '*',
      'localhost',
      '10.0.2.2',
    ],
  },
  plugins: {
    Geolocation: {
      // Configuration for Geolocation
    },
    Preferences: {
      // Persistent single sign-on login session
    },
  },
};

export default config;
