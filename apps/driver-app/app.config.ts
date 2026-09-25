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
  owner: 'scottkelly36',
  // EAS Update (OTA): JS-only changes push straight to installed builds without a new
  // native build/reinstall — added 2026-09-25 so the post-weekend bug-fix pass doesn't have
  // to go through EAS Build's slow free-tier queue for every fix. "appVersion" ties runtime
  // compatibility to `version` above, not to every individual native change, matching the
  // free-tier MAU limits (1,000/month) comfortably covering Phase 1's test group.
  updates: {
    url: 'https://u.expo.dev/5b6314ae-4cb1-4b28-aa7c-fad17e503c14',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    eas: {
      // M5.10: the EAS project this app builds under (`eas init --account scottkelly36`).
      // Needed for real Expo push tokens (M6.6's `obtainPushToken`) and for EAS builds/updates.
      projectId: '5b6314ae-4cb1-4b28-aa7c-fad17e503c14',
    },
  },
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
    'expo-sqlite',
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'WagonWise uses your location to set your starting point when planning a route.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-notifications',
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'WagonWise uses the microphone to hear your spoken hazard reports.',
        speechRecognitionPermission:
          'WagonWise uses speech recognition to turn what you say into a hazard report.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
