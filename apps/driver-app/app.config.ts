import type { ExpoConfig } from 'expo/config';

import { PRODUCT_NAME } from './src/product';

// Dynamic config (not app.json) specifically so the native app name can be driven by
// the same PRODUCT_NAME constant the in-app UI uses (AGENTS.md: one config constant).
const config: ExpoConfig = {
  name: PRODUCT_NAME,
  slug: 'wagonwise-driver-app',
  // Store-build version, bumped by hand on each `eas build` (README: "Versions and updates").
  // OTA updates can't change it — it's baked into the binary.
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'wagonwise',
  userInterfaceStyle: 'automatic',
  owner: 'scottkelly36',
  // EAS Update (OTA): JS-only changes push straight to installed builds without a new
  // native build/reinstall — added 2026-09-25 so the post-weekend bug-fix pass doesn't have
  // to go through EAS Build's slow free-tier queue for every fix. Free-tier MAU limits
  // (1,000/month) comfortably cover Phase 1's test group.
  // "appVersion" (back from "fingerprint" as of 2026-10-02): fingerprint hashes node_modules
  // file paths, and pnpm shortens those paths differently on Windows than on EAS's Linux
  // builders (path-length limits) — same dependencies, different hash, so `eas update` run from
  // this Windows machine kept computing a runtime version that didn't match the build EAS had
  // just produced, silently dropping every update. `appVersion` ties compatibility to the
  // `version` string above instead, which is identical everywhere `eas` runs. Trade-off: bump
  // `version` by hand on any native change (new/upgraded native package, `plugins`, SDK upgrade),
  // same as the table in README.md already says to do.
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
      backgroundColor: '#111A27',
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
    '@react-native-community/datetimepicker',
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
