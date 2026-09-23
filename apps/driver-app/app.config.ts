import type { ExpoConfig } from 'expo/config';

import { PRODUCT_NAME } from './src/product';

// Dynamic config (not app.json) specifically so the native app name can be driven by
// the same PRODUCT_NAME constant the in-app UI uses (AGENTS.md: one config constant).
const config: ExpoConfig = {
  name: PRODUCT_NAME,
  slug: 'wagonwise-driver-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'wagonwise',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.wagonwise.driverapp',
    supportsTablet: false,
  },
  android: {
    package: 'com.wagonwise.driverapp',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
