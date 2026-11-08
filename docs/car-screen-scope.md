# Android Auto and Apple CarPlay: scope

Scoped 2026-11-08, extended the same day with a feature-by-feature audit and a plan for testing. Drivers have asked for it, so the owner moved
it up the list (it was an idea in `phase-5-ideas.md`, section E). **Not started: no code has been written.** What was read is named below, and
what was not read or could not be confirmed is said so.

## What it is

Both systems put an app on the cab's screen. **Neither shows the phone app's screens.** Each has its own fixed layouts (templates), a map area the
app draws into, and strict limits on what a driver may touch while moving. So this is a second, much smaller interface over the same trip, not a
setting in the existing app. Nothing on it may need typing (`AGENTS.md`), and a route is never switched silently.

## What each platform requires

**Android Auto** ([navigation apps](https://developer.android.com/training/cars/apps/navigation), [quality requirements](https://developer.android.com/docs/quality-guidelines/car-app-quality)).
Nothing has to be requested from Google first, but the app is reviewed on Google Play against these:

- Declares the `NAVIGATION` category and the navigation templates (`NavigationTemplate`, `MapWithContentTemplate`).
- `NF-1` turn-by-turn directions; `NF-2` only map content on the map surface, with text directions, lane guidance and arrival time in the
  template's own parts (speed limit and road obstructions **may** be drawn in the map's safe area); `NF-3` a navigation notification for
  each turn; `NF-4` next-turn information sent to the car's instrument cluster; `NF-5` stay silent when another navigation app is guiding;
  **`NF-6` handle navigation requests from other apps** (so "navigate to..." from Google Assistant works); **`NF-7` a "test drive" mode
  that simulates driving**, which Google's reviewers use; `NF-9` if the car has a cluster display, map tiles only.
- `AC-1` any task in five screens or fewer; `DR-1` buttons answer in two seconds; `DR-2` and `DR-3` launch and load in ten seconds;
  `VC-1` Google Assistant voice commands; `DD-1` the navigation audio channel only for navigation instructions; `SA-1` no animation;
  `IU-1` no images except lane or junction guidance and pictures that help a driving decision; `EP-2` restore the previous state when
  relaunched; `VI-1` if the driver must use the phone, say to do it only when parked; `MR-1` and `TH-1` light and dark map and theme.
- List and row limits, and what a template may hold, were **not read**.

**Apple CarPlay** ([requesting entitlements](https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements.md),
[CPMapTemplate](https://developer.apple.com/documentation/carplay/cpmaptemplate.md),
[the simulator](https://developer.apple.com/documentation/carplay/using-the-carplay-simulator.md)):

- The entitlement `com.apple.developer.carplay-maps` must be **requested from Apple and granted** (criteria and timing unpublished; forum reports say
  navigation is hard to get). After it: a CarPlay capability on the App ID, a new provisioning profile, an entitlements file, and extra App Store review.
- The map template is an overlay on a **base view the app draws its map into**; CarPlay does not take touches on that view. The overlay
  has a navigation bar of up to two buttons each side, map buttons, trip previews with route choices, a navigation session with
  maneuvers and travel estimates, and navigation alerts. Only one overlay template shows at a time.
- The template stack's depth limit, list limits and the navigation-specific App Store rules are in Apple's CarPlay App Programming Guide,
  a very large PDF that could **not be read** here.

## Drawing our map on a car screen

- **Android:** MapLibre publishes an [Android Auto sample](https://github.com/maplibre/MapLibre-Android-Auto-Sample) (MIT, 29 stars, no
  releases). It renders a MapLibre `MapView` off-screen in texture mode and copies each frame to the car's surface through the Car App
  Library's surface callback. The sample itself calls this "not very efficient". It shows the map only: no navigation, no templates.
  **So a MapLibre map on Android Auto is possible; how smooth it is at navigation speed is not known.**
- **iOS:** nothing found about MapLibre on CarPlay. The map is a UIKit view in a window CarPlay provides, so it is plausible, but it is **unconfirmed**.
- **Libraries:** `@bradford-tech/expo-carplay` is an Expo module with a config plugin (Expo SDK 55 or later, which we are past; iOS only).
  It has the map template, trip previews, navigation sessions and search, but draws the map with **Apple's MapKit**, not MapLibre, and
  lists, alerts, points of interest and the cluster are "not yet implemented". `@g4rb4g3/react-native-carplay` covers both platforms but says Expo
  SDK 53 and has no Expo config plugin; the original `react-native-carplay` says "No Expo support due to Scenes". **Neither covers our needs
  as it stands**; expect small native modules of our own for the car side, written against each platform's API.

## What changes in the app itself (not just new screens)

1. **The app must work with the phone screen off.** Today location runs only while the app is on screen (`expo-location` foreground
   permission and `watchPositionAsync` in `use-live-location.ts`, with the screen kept awake on the trip screen). A car screen is used with the phone
   locked in a pocket or on a mount, so navigation needs **background location** (Android foreground service; iOS location background mode)
   and the JavaScript to start without any phone screen. This is the biggest technical risk and the part to prove first.
2. **It touches the privacy promise.** The notice and the sales text say a driver's position is shared with a firm only on one of its jobs **and the app
   is open**. Background operation changes that. It also needs Google Play's background-location declaration and Apple's background-mode
   disclosure, an update to `privacy-review.md`, the data-safety form and the privacy labels, and a wording change in the app's consent screen. Do not ship before that.
3. **A test-drive mode** (`NF-7`). The app has none (no simulated driving was found). It will also make every other test easier.
4. **Navigation requests from other apps and Assistant** (`NF-6`, `VC-1`): a navigation intent handler. On CarPlay, "go to..." by voice is Siri's, which a third-party map does not get by default (not confirmed).
5. **One source of truth for the trip.** The car side must read the same route, next turn, time and distance left and alerts as the phone,
   not rebuild them. Today that state lives in JavaScript (Zustand and hooks).
6. **Voice and sound:** spoken directions must use each platform's navigation audio channel and lower other audio. Android's rule `DD-1` says that
   channel is for navigation instructions only, so whether a hazard or camera warning counts is **to be checked with Google**; Apple's
   simulator cannot test audio behaviour.
7. **Speed and response:** a button answers in two seconds and the car app starts in ten (`DR-1` to `DR-3`), including a cold start from the car.

## Every feature, on the car screen

The rule used: a feature goes onto the car screen if a driver needs it **while driving or at a stop**, and if the platform's templates can hold it
safely. Typing, photos, forms and settings stay on the phone, by design: both platforms restrict them, and our own rule is that
nothing on the trip screen needs typing while moving.

**Goes onto both, as it is today**

- The route and the map: our map, drawn into the car's surface (see above), in light and dark.
- Turn banner and spoken directions; time, distance and arrival; the speed limit sign (drawn in the map's safe area on Android, `NF-2`).
- Hazard, closure, camera and traffic markers on the map; the "on the route and ahead" rule stays in the app's logic, not duplicated.
- Hazard warnings ahead, camera warnings and "is it still there?": an in-context alert with two buttons (Android `Alert`, CarPlay navigation alert).
- The faster-route offer: the same two buttons, **Switch** and **Keep current route**; never switched silently.
- A reroute because of a hazard: an alert, then the route preview.
- Route options before setting off (fastest and shortest, and the vehicle profile in use): trip previews with route choices on CarPlay, a route list with a map on Android.
- Nearby safe parking and nearby fuel with prices and their age, with drive times and "Take me there": a place list with the map on both.
- The next job stop, and the job's stops in order, with "Start navigating": a list on both.
- Break and driving-hours advice ("break due in 20 minutes, parking ahead"): an alert with a **Show parking** button.
- Weather warnings on the route: a short alert.
- Recent and saved places as a list of destinations to start navigating to.

**Goes on, with a design decision first**

- **Reporting a hazard or traffic by voice, or one tap.** Today it is hands-free voice. On the car screen the microphone and speech recognition
  are the platforms' to decide; a one-tap action with a short list needs checking against each platform's distraction rules. Not confirmed on either.
- **SOS.** It is hold-to-send on the phone, to avoid pressing it by accident, and a template button is a tap. Options: leave it on the phone
  and show where it is; or a two-step confirm on the car screen. It is a safety feature and the wording must never suggest it replaces calling 999 (`AGENTS.md`). **Owner's decision.**
- **Choosing the vehicle profile** before a route (height, width, weight decide the route): allowed only when parked, and the profile in use must be shown on the route preview.
- **Search** ("Where to?", including what3words): the platforms' search screens only take typing when parked. Voice by Assistant covers the rest. what3words typed on a car screen is awkward and probably phone-only.
- **Accepting or rejecting a job:** probably phone only at first, because it changes what a driver is told to do while moving.

**Stays on the phone, by design**

- Walk-round checks, and proof-of-delivery photos (camera; not while driving). The car screen can say "a check is due: do it on your phone when you are parked" (`VI-1`).
- Sign-in, consent, the walkthrough, feedback, joining a company, the update banner, and everything about the account.
- Editing vehicle profiles and saved places, marking a place, suggesting a safe parking spot, the shift clock's settings, sharing settings.
- If the driver is not signed in or has not consented, the car screen shows one message, "Open WagonWise on your phone", and nothing else.

## Testing and emulation

**Android Auto: the Desktop Head Unit, which runs on Windows** ([guide](https://developer.android.com/training/cars/testing/dhu)).

- **Here already:** the Android SDK, `adb`, the emulator and a Pixel 6 virtual device. **Missing:** the DHU itself (SDK Manager, package "Android Auto
  Desktop Head Unit Emulator", installed in `extras/google/auto/`) and the command-line tools. The Pixel 6 device uses an image **without** the Play Store
  (`PlayStore.enabled=false`), so Android Auto cannot be installed on it; the Play Store image is on disk but unused, so a new virtual device
  is needed. The guide describes testing with a real phone; an emulator with the Play Store is common practice but is not described on that page.
- **Connecting:** developer mode on the phone, the Android Auto app (signed in to Google Play, updated), then "Start head unit server" and
  `adb forward tcp:5277 tcp:5277`, then `desktop-head-unit.exe`; or USB accessory mode (`--usb`), which on Windows may need a WinUSB driver.
- **What it can do:** touch and rotary input; day and night; set location, speed, fuel and gear by command; `restrict all` to act as if driving;
  video focus, audio focus and navigation focus; a simulated instrument cluster and a cluster display; the microphone with recorded
  voice commands such as "navigate to home"; screenshots; and **scripts** (`./desktop-head-unit < script.txt`), so a repeatable check can run in a pipeline.
- **What it cannot show:** a real car's audio, microphone, screen quality, or a head unit's quirks. Google's checklist is meant to be run on the DHU.

**CarPlay: Apple's simulator, which needs a Mac** ([guide](https://developer.apple.com/documentation/carplay/using-the-carplay-simulator.md)).

- Xcode on a Mac: run the app in the iOS simulator, then **I/O, External Displays, CarPlay**. The window is 800 x 480 at 2x. For navigation apps,
  `defaults write com.apple.iphonesimulator CarPlayExtraOptions -bool YES` allows the sizes Apple recommends testing: 748 x 456, 768 x 1024
  portrait, 800 x 480 and 1920 x 720 at 3x.
- **There is no way to run it on this Windows machine.** Options: borrow or buy a Mac; rent a cloud Mac by the hour or day; or **EAS Simulator**
  (Expo's cloud iOS simulator, driven from here). The check on 2026-11-08 says it is **not enabled on this account** (a waiting list at
  `expo.dev/services/simulators`), and whether its screen can show the CarPlay window is **unknown**.
- Apple says the simulator will not show the app **without the entitlement**. Community posts say a simulator-only build with the entitlement key added works;
  that is unofficial and unconfirmed on current Xcode, and it would not work on a phone or a head unit, so it is for the spike only.
- Apple says not to rely on the simulator alone: it cannot test a **locked iPhone** (the normal way CarPlay is used), **Siri**, or **audio behaviour**.
  Apple recommends a real car or an aftermarket head unit, ideally wireless CarPlay so Xcode can debug it. That needs the entitlement, a real iPhone and a Mac.

**For our own checks, whichever platform:** the test-drive mode (`NF-7`) is also the way to test without driving: a recorded route played
back at a speed, with hazards, a faster route and a break coming up, so alerts, previews and background behaviour can be seen on the DHU or the simulator.

## Order

0. **Owner, now, no code: ask Apple for the navigation entitlement** (draft below). It is the one step with an unknown wait.
1. **Set up Android testing (owner's go-ahead for the downloads):** the DHU and a Play Store virtual device, or the owner's Android phone over USB.
2. **A spike on Android Auto, on a throwaway branch.** Answers, in this order: can the app keep navigating with the phone screen off (background location and
   JavaScript without a phone screen); can the MapLibre map be drawn on the car surface at navigation speed; how the trip state reaches the car service;
   can Expo carry it. _Done when:_ a go, go-with-changes or stop decision and the effort, written here. A custom build, not over the air.
3. **Build Android Auto** if the spike says go: test-drive mode, navigation intents, templates for the features above, Play review.
4. **CarPlay** once Apple has granted the entitlement **and a Mac is available**: the same features through CarPlay's templates.
5. Privacy notice, consent wording and store forms for background location go out **with** step 3, not after.

Both are native changes: `version` goes up and a Play build and an App Store build are needed. They should share one build with the other native
items waiting in `progress.md` (R8 shrinking, edge-to-edge, portrait lock; version 1.3.0).

## What to tell firms and drivers

"Planned, asked for, not available yet." No date until the spike is done. Do not say it works with a particular car or head unit, or that every feature will be on the car screen: some, like checks and photos, deliberately stay on the phone.

## To ask Apple (owner submits; WagonWise Ltd's developer account)

The form is behind Apple sign-in and was not read, so this is what it is likely to ask for, not its fields:

- **Team ID** `5FW3CVS33S`; **app** WagonWise; **bundle ID** `com.wagonwise.driverapp`;
  App Store page `https://apps.apple.com/gb/app/wagonwise-hgv-navigation/id6827935469`.
- **Category:** Navigation (`com.apple.developer.carplay-maps`).
- **What the app does, in a few lines:** turn-by-turn navigation for heavy goods vehicles in Great Britain. Routes are planned for the vehicle's
  real height, width, length and weight and avoid low bridges and weight and width limits; drivers' hazard reports and spoken warnings;
  safe lorry parking; jobs from the driver's company.
- **What the CarPlay screen would show:** the map, the next turn, distance and time left, short hazard alerts, nearby parking and fuel, and the next job stop. No typing; the
  driver starts a trip from recent places or their job.
- **Why CarPlay:** HGV drivers use a phone on a mount today; it is a common request from drivers.
- Say plainly that **it is a navigation app with its own routing engine**, not a map viewer or a point-of-interest finder (Apple's forum
  replies say those do not need the navigation entitlement, which is not what this is).

## Decisions for the owner

1. **Submit the Apple request now.**
2. **Go-ahead to download the Android testing tools** (the DHU, command-line tools, a Play Store virtual device image), and which to use: your Android phone over USB, or a virtual device (needs a Google sign-in for the Play Store).
3. **A Mac** for CarPlay: borrow, buy or rent. Needed before the CarPlay build is testable. Add to the waiting list for EAS Simulator meanwhile?
4. **The first version of the car screen:** the "goes onto both" list above, with voice hazard reporting, SOS, profile choice and job acceptance decided separately. Agreed?
5. **Background location:** agree that the spike tests it, and that the privacy notice, consent screen and store forms are updated with the release, not after.
