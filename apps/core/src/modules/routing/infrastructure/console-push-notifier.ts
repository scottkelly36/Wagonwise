import type { PushNotification, PushNotifier } from '../application/ports/push-notifier.js';

/**
 * Local-dev-only: logs the notification instead of sending it. A real Expo Push HTTP adapter is
 * M6.5 — this is what `pnpm dev` wires until then, same precedent as identity's
 * `ConsoleOtpSender`, never what a deployment should use.
 */
export class ConsolePushNotifier implements PushNotifier {
  send(pushToken: string, notification: PushNotification): Promise<void> {
    console.log(
      `[dev] push to ${pushToken}: ${notification.title} — ${notification.body} (newRoutePlanId=${notification.data.newRoutePlanId})`,
    );
    return Promise.resolve();
  }
}
