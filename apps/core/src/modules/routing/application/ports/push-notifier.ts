export interface PushNotification {
  readonly title: string;
  readonly body: string;
  /** Carries the new route's id (design doc §6: "include the new route ID in the payload") so
   *  the driver app can open straight to the old-vs-new comparison screen. */
  readonly data: {
    readonly newRoutePlanId: string;
  };
}

/**
 * Delivers a push notification to one device token (design doc §6). Phase 1 has only a console
 * adapter for local dev (infrastructure/console-push-notifier.ts) — a real Expo Push HTTP
 * adapter is M6.5, deferred until then, same "module wires its own adapters, real one comes
 * later" precedent as identity's `OtpSender`.
 */
export interface PushNotifier {
  send(pushToken: string, notification: PushNotification): Promise<void>;
}
