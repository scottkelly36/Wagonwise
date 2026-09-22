import { Platform } from 'react-native';

// The one place this app reads process.env (mirrors apps/core/src/config.ts's rule).
// EXPO_PUBLIC_-prefixed vars are inlined by Metro at bundle time; everything else here
// is a default so a cold start needs no .env, matching the rest of the monorepo.
function defaultBffUrl(): string {
  // The Android emulator's "localhost" is the emulated device itself, not the host
  // machine — 10.0.2.2 is the emulator's documented alias for the host's loopback.
  // The iOS simulator shares the host's network namespace, so plain localhost works.
  return Platform.OS === 'android' ? 'http://10.0.2.2:3002' : 'http://localhost:3002';
}

export interface AppConfig {
  bffUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    bffUrl: process.env.EXPO_PUBLIC_BFF_URL ?? defaultBffUrl(),
  };
}

export const config = loadConfig();
