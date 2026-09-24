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
 * Delivers a push notification to one device token (design doc §6). `ExpoPushNotifier`
 * (infrastructure/expo-push-notifier.ts) is the real, wired adapter (M6.5); `ConsolePushNotifier`
 * remains available as an explicit override for tests or a local manual run.
 */
export interface PushNotifier {
  send(pushToken: string, notification: PushNotification): Promise<void>;
}
