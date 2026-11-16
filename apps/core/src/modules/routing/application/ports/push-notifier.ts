export interface PushNotification {
  readonly title: string;
  readonly body: string;
  /** What the app acts on. A reroute carries the new route's id (design doc §6: "include the new route ID in the payload") so
   *  the app can open straight to the old-vs-new comparison; a trip reminder carries `type: 'trip-reminder'` and the trip's id. */
  readonly data: Readonly<Record<string, string>>;
  /** Not an alert: ordinary priority, on the app's quiet Android channel (`news`, no sound), so it never rings in the cab.
   *  Unset for a reroute, which is meant to be heard. */
  readonly quiet?: boolean;
}

/**
 * Delivers a push notification to one device token (design doc §6). `ExpoPushNotifier`
 * (infrastructure/expo-push-notifier.ts) is the real, wired adapter (M6.5); `ConsolePushNotifier`
 * remains available as an explicit override for tests or a local manual run.
 */
export interface PushNotifier {
  send(pushToken: string, notification: PushNotification): Promise<void>;
}
