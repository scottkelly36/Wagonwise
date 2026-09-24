import type { PushNotification, PushNotifier } from '../application/ports/push-notifier.js';

/**
 * Logs the notification instead of sending it. `ExpoPushNotifier` (M6.5) is the real, wired
 * default now — this stays available as an explicit `pushNotifier` override for tests or a local
 * manual run that shouldn't reach Expo's real endpoint, same role `FakePushNotifier` plays inside
 * `detect-reroute.test.ts` but for a manual `curl` session rather than an automated test.
 */
export class ConsolePushNotifier implements PushNotifier {
  send(pushToken: string, notification: PushNotification): Promise<void> {
    console.log(
      `[dev] push to ${pushToken}: ${notification.title} — ${notification.body} (newRoutePlanId=${notification.data.newRoutePlanId})`,
    );
    return Promise.resolve();
  }
}
