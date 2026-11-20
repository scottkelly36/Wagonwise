# Testing push notifications locally (Android emulator)

Written 2026-11-20 at the owner's request. **Finding first:** the app has no Firebase (FCM) set-up for Android. `app.config.ts` has no
`android.googleServicesFile`, and Expo's Android push tokens need one, so on Android `getExpoPushTokenAsync` most likely throws and
`obtainPushToken` (`lib/push-registration.ts`) swallows it as `reason: 'error'`. If so, **no Android phone has ever registered for
notifications**: the reroute push, "Still on your trip?" and What's new pushes reach iPhones only. Not proven: check it with step 1.

## 1. Check the live database (two minutes)

```sql
select count(*) as phones,
       count(*) filter (where push_token like 'ExponentPushToken%') as expo_tokens
from identity.devices;
```

Compare with how many drivers use Android (Play Console, Statistics). If the count is close to the number of iPhone users, Android
is not registering. The table does not store the platform, so this is a rough check.

## 2. On the emulator

1. Use an emulator image **with Google Play** (the Pixel 6 AVD in `apps/driver-app/store-assets/README.md` is one if it shows the Play
   Store); push does not work on a plain Android image.
2. Start the stack and the development build as in that README (steps 1 and 3), sign in, and allow notifications when asked.
3. Read the token: in Metro's log, or `select push_token, updated_at from identity.devices order by updated_at desc limit 5;` on the
   local database. **No new row after signing in = the Android token was not obtained** (the finding above).
4. If there is a token, send one by hand from a terminal on the same machine:

```bash
curl -H "Content-Type: application/json" -X POST https://exp.host/--/api/v2/push/send -d '{"to":"ExponentPushToken[PASTE]","title":"Test","body":"Hello from WagonWise"}'
```

A ticket with `"status":"ok"` and the notification on the emulator means delivery works. `InvalidCredentials` or
`MismatchSenderId` means Expo has no FCM key for the project.

## 3. Fixing Android (needs the owner's accounts, and a new store build)

1. Firebase console: create a project, add an Android app with the package `com.wagonwise.driverapp`, download `google-services.json`.
2. Put it in `apps/driver-app/` and add `googleServicesFile: './google-services.json'` under `android` in `app.config.ts`.
3. Firebase: Project settings, Service accounts, generate a private key (FCM V1). Upload it to Expo: `eas credentials`, Android,
   production, Google Service Account, "Push Notifications (FCM V1)". Never commit the key.
4. This changes the native app: bump `version` to 1.3.0 and release a store build (the `release` label does this when the version is
   higher). An over-the-air update cannot fix it.
5. Repeat step 2 on the new build, then on a real Android phone.

iPhone push uses Apple's key, which EAS manages on its own when it builds; test on a real iPhone (the iOS simulator cannot receive
remote pushes).
