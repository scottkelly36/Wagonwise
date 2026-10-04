# Driver app redesign (2026-10-04)

The owner shared a mock (a Google-Maps-style home: job card, round map buttons, quick-action cards,
a "Where to?" sheet, a Map / Jobs / Saved / More tab bar) and asked for every screen to move towards
it. Done in one branch, in parts. **Needs a new store build (app 1.2.0): it adds native code.**

## Decisions (owner)

- **Proper icons, so a new build.** `@expo/vector-icons` (Material Community Icons) and `expo-font`,
  with the `expo-font` plugin in `app.config.ts`. `version` is now **1.2.0**. The runtime version
  follows `version`, so `eas update` publishes for 1.2.0 phones only, and 1.1.0 phones keep receiving
  updates published from a branch that does not include this one.
- **The mock is the goal for every screen**, not just the map.
- **Saved places is a later feature** (`docs/ideas.md`). The Saved tab holds saved voice reports for now.

## What changed

- **Android system bar fix.** Every screen imported React Native's own `SafeAreaView`, which does
  nothing on Android under edge-to-edge, so the navigation bar covered bottom buttons (reported on a
  Galaxy S25 FE). All 21 now use `react-native-safe-area-context`'s. Map screens go edge to edge and
  pad their sheets by the bottom inset; the tab bar adds its own.
- **Tabs** (`app/(tabs)/`): Map (`home`), Jobs, Saved (the old voice-drafts screen), More (the old
  Settings). The route group does not change URLs, so `/home` and every `router.push` still work;
  `/settings` and `/voice-drafts` are gone.
- **Home:** the job card (truck badge, "On job X", the stop it is heading for), a Menu shortcut,
  round recentre and layers buttons (layers toggles hazards, traffic and parking on the map), quick
  action cards with icons, and the "Where to?" sheet.
- **Map follow mode.** Home used to force the camera onto the position on every fix (panning was
  overridden, and there was no way back). It now follows `currentPosition` like the trip screen, with
  `RouteMap`'s new `ref.recenter()`, `followZoom` and `onFollowingChange`.
- **Jobs tab:** the current job as a card, or "No job assigned right now" with Check again.
- **Design language** (`theme/colors.ts`, `theme/tokens.ts`, `components/ui/`): lifted cards with soft
  shadows, large radii, pale-blue icon badges, 60-64 px pill buttons, a `ScreenHeader` with a round
  Back button (stack screens have no system header, and an iPhone has no hardware back), `MapSheet`
  for the report screens, `Icon`, `RoundButton`, `ActionCard`, `JobCard`.
- **The brand blue is deeper, with white text** (`accent` `#00A4FE` to `#1A73E8`, `textOnAccent` to
  white): the old pairing was dark text on bright blue, and the mock is white on a deeper blue.
  Only ever used behind buttons, so it changed in one place.
- Screens restyled: home, jobs, saved, more, job, trip, plan route, route overview, the three report
  screens (hazard type chips now carry icons), hazard detail and its drawer, reroute prompt, vehicle
  profiles (list, add, edit), companies (list, join), feedback, consent, sign-in.

## Not done

- **Not seen on a device.** There is no emulator here. Checked: types, lint, 430 unit tests, and that
  the whole app bundles for Android with the icon font included. The first real look needs a build.
- The tab bar has no underline under the active tab (the mock does).
- The drag handle on the "Where to?" sheet is decorative; the sheet does not expand.
- Dark mode is kept (the driver's own choice) and uses a slate card colour; it has had less thought
  than light, and is worth a look at night.
- No turn-by-turn guidance, saved places, or a job list (one active job at a time).
