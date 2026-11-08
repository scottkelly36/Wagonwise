# Android Auto and Apple CarPlay: scope

Scoped 2026-11-08. Drivers have asked for it, so the owner moved it up the list (it was an idea in `phase-5-ideas.md`, section E).
**Not started.** This file is what was found out and the order to do it in; no code has been written.

## What it is

Both systems put an app on the cab's screen. **Neither shows the phone app's screens.** Each has its own fixed layouts (templates), a
map area the app draws into, and strict limits on what a driver may touch while moving. So this is a second, much smaller interface
over the same trip, not a setting in the existing app. It would show the map, the next turn, the distance and time left, and a hazard
alert, and let the driver start a trip to a recent place or the job's next stop. Nothing on it may need typing (`AGENTS.md`: nothing on
the active trip screen may require typing or small taps while moving), and a route is never switched silently.

## What is known (read on 2026-11-08, from the platforms' own pages)

**Android Auto** ([navigation apps with the Car App Library](https://developer.android.com/training/cars/apps/navigation)):

- A navigation app declares the `androidx.car.app.category.NAVIGATION` category on a `CarAppService` and the
  `androidx.car.app.NAVIGATION_TEMPLATES` permission, and uses the `NavigationTemplate` and `MapWithContentTemplate`.
- It must report the trip to the car (`NavigationManager`: started, ended, updated steps), show turn-by-turn in a navigation
  notification, ask for audio focus as navigation guidance (`USAGE_ASSISTANCE_NAVIGATION_GUIDANCE`) so its voice plays over the car
  speakers, and accept navigation intents (quality requirement `NF-6`).
- **To be accepted on Google Play** it must simulate a trip when the car asks (`onAutoDriveEnabled`), so a reviewer can test without driving.
- The page names no permission to ask Google for first. Android Auto can be tried on a computer with Google's Desktop Head Unit (DHU).

**Apple CarPlay** ([requesting CarPlay entitlements](https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements.md)):

- A navigation app must **request the entitlement** (`com.apple.developer.carplay-maps`) at Apple's
  [CarPlay contact form](https://developer.apple.com/contact/carplay) and agree to the CarPlay Entitlement Addendum. "Apple reviews each
  application using predefined criteria" and, if it passes, adds the entitlement to the developer account. The criteria and the time
  it takes are **not published**. Developers on the [Apple forums](https://developer.apple.com/forums/thread/795410) report that the
  navigation one is hard to get, but those are anecdotes.
- After that: a CarPlay capability on the App ID, a new provisioning profile, an entitlements file, and **extra App Store review
  guidelines** for CarPlay apps. Apple's CarPlay App Programming Guide (a large PDF) was not read.

**React Native** (the app is Expo and React Native): the main library, [react-native-carplay](https://github.com/birkir/react-native-carplay),
covers both platforms, but its page says **"No Expo support due to Scenes"**, Android Auto support is **"still in beta"**, and it does not
say how a map is drawn on the car's screen. That last point is the core of the work: the phone's map is MapLibre, and the car's screen
needs the map drawn into a surface the car supplies.

## What is not known

1. **Whether Apple will grant the navigation entitlement**, and how long it takes. Nothing here can speed it up, so it starts first.
2. Whether Apple's criteria say anything about lorry or commercial-vehicle routing. Not found.
3. **How to draw the MapLibre map on each car screen** from this app, and whether the library does it.
4. **Whether Expo can carry it.** CarPlay needs a second app "scene"; the library says Expo cannot. A custom Expo config plugin may do it, or the native projects may have to be kept in the repo, which changes how the app is built and shipped.
5. On Android, whether the app's JavaScript is running when the car starts the app with no phone screen showing (the car app runs as a service). The trip state (a Zustand store in JavaScript) has to reach it.

## What does not change

Routing, hazards, speed limits and cameras, the faster-route offer and the spoken directions all stay as they are. The car screen is a view
over the same trip: route, next manoeuvre, time and distance left, and alerts.

## Order

0. **Owner, now, no code: ask Apple for the navigation entitlement** (details below). It is the one step with an unknown wait, so it goes first.
1. **A spike on Android Auto, on a throwaway branch.** Android Auto first because it needs no permission from Google to start and can be tried on a computer
   with the DHU. Questions to answer: can the app draw its map on the car surface, how the trip state reaches the car service, and whether
   Expo can carry it. _Done when:_ a decision (go, go with changes, or stop) and an estimate, written down here. This is a custom
   build, not an over-the-air update.
2. **Build Android Auto** if the spike says go, ending with Google Play's review (including the simulated trip).
3. **CarPlay**, once Apple has granted the entitlement.

Both are **native changes**: `version` goes up and a Play build and an App Store build are needed, not an over-the-air update. They
should share one build with the other native items waiting in `progress.md` (R8 shrinking, edge-to-edge, portrait lock; version 1.3.0).

## What to tell firms and drivers

"Planned, asked for, not available yet." No date until the spike is done. Do not say it works with a particular car or head unit; that is not known.

## To ask Apple (owner submits; WagonWise Ltd's developer account)

The form is behind Apple sign-in and was not read, so this is what it is likely to ask for, not its fields:

- **Team ID** `5FW3CVS33S`; **app** WagonWise; **bundle ID** `com.wagonwise.driverapp`;
  App Store page `https://apps.apple.com/gb/app/wagonwise-hgv-navigation/id6827935469`.
- **Category:** Navigation (`com.apple.developer.carplay-maps`).
- **What the app does, in a few lines:** turn-by-turn navigation for heavy goods vehicles in Great Britain. Routes are planned for the vehicle's
  real height, width, length and weight and avoid low bridges and weight and width limits; drivers' hazard reports and spoken warnings;
  safe lorry parking; jobs from the driver's company.
- **What the CarPlay screen would show:** the map, the next turn, distance and time left, and a short hazard alert. No typing; the
  driver starts a trip from recent places or their job.
- **Why CarPlay:** HGV drivers use a phone on a mount today; it is the most common request from drivers.
- Say plainly that **it is a navigation app with its own routing engine**, not a map viewer or a point-of-interest finder (Apple's forum
  replies say those do not need the navigation entitlement, which is not what this is).

## Decisions for the owner

1. Start with Android Auto for the spike (recommended), and CarPlay after Apple answers?
2. Put both into the next native build (1.3.0) with the Play quality fixes?
3. Submit the Apple request now.
