import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Pure formatting, testable without RN's `Platform` module — the same split every
 *  I/O-adjacent piece of this app uses. */
export function formatDeviceInfo(os: string, osVersion: string | number): string {
  return `${os} ${osVersion}`;
}

/** `app.config.ts`'s own `version` field, read back at runtime — 'unknown' only if Expo's own
 *  config resolution genuinely failed, not a case a normal build can reach. */
export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

export function getDeviceInfo(): string {
  return formatDeviceInfo(Platform.OS, Platform.Version);
}
