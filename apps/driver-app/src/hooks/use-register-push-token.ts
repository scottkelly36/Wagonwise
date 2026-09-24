import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerDevice } from '../api/identity';
import { obtainPushToken } from '../lib/push-registration';
import { useAuthStore } from '../state/auth-store';

/**
 * Registers this device's Expo push token with core (M6.2's `POST /identity/devices`) whenever a
 * driver is signed in — the app side of M6.5's already-real `ExpoPushNotifier`. Runs once per
 * sign-in rather than only at sign-in time: `registerDevice` is a plain upsert keyed by the token
 * itself (decision 71), so re-running costs nothing and also covers the "a different driver signs
 * in on the same phone" reassignment case M6.2 built for.
 *
 * A push simulator has no real push capability (`Device.isDevice` is false) and a plain Expo Go
 * install has no EAS project id configured yet (docs/progress.md, M5.10/M6.5's own deviation) —
 * both are expected, silent no-ops here, not errors, since neither is something a driver caused
 * or can fix from inside the app.
 */
export function useRegisterPushToken(): void {
  const state = useAuthStore((s) => s.state);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    if (!Device.isDevice) return;
    const { accessToken } = state;

    async function registerNow(): Promise<void> {
      if (registeredRef.current) return;
      registeredRef.current = true;
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }
        const result = await obtainPushToken({
          getPermissionsAsync: Notifications.getPermissionsAsync,
          requestPermissionsAsync: Notifications.requestPermissionsAsync,
          getExpoPushTokenAsync: Notifications.getExpoPushTokenAsync,
          projectId: Constants.expoConfig?.extra?.eas?.projectId as string | undefined,
        });
        if (result.ok) {
          await registerDevice(accessToken, result.token);
        }
      } catch {
        // Registration failing (a network blip, a dead BFF) shouldn't ever block the rest of the
        // app — the next sign-in or app restart tries again, same "best-effort, not load-bearing"
        // shape as useHazardQueueFlush.
      } finally {
        registeredRef.current = false;
      }
    }

    void registerNow();
  }, [state]);
}
