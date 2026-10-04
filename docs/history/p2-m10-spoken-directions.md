# P2-M10: spoken turn-by-turn directions

Added 2026-10-04 at the owner's request: turns read aloud like Google Maps. This moves turn-by-turn
from the "maybe phase 3" idea in `ideas.md` into Phase 2.

## What was built

- **Server.** Valhalla's `/route` already returns maneuvers; they were being thrown away. The
  routing engine now asks for `language: en-GB`, `units: kilometers` and maps each maneuver to a
  `Maneuver` (`domain/maneuver.ts`: kind, text, speech, street names, length, `beginShapeIndex`,
  roundabout exit). They are stored on the immutable route plan as `route_plans.maneuvers` jsonb
  (migration 0035, default `[]`) and returned on the plan. Plans made before this have none, so the
  app says nothing for them.
- **Contracts.** `routePlanSchema.maneuvers` defaults to `[]`, so an app talking to an older core
  still parses.
- **App** (`apps/driver-app`):
  - `lib/uk-distance.ts`: yards and miles for speech and for the turn card. Valhalla's en-GB wording
    says "feet", so the distance is composed in the app and the engine's distance-free
    `verbal_pre_transition_instruction` is used as the `speech`.
  - `lib/turn-guidance.ts`: pure logic. Which turn is next, how far, off-route distance and what to
    say. Announcement tiers 1 mile, half a mile, 300 yards, then the turn itself (about 60 m). A tier
    is only used if it fits within 80% of the previous leg, so close turns are not announced on top
    of each other. Silent kinds: depart, straight, roundabout exit. Arrival is spoken once, close in.
  - `lib/route-progress.ts`: the snap to the route now searches a window around where the driver last
    was, so loops and roundabouts do not jump the driver along the route. It falls back to the whole
    route if the driver is over 150 m from the windowed result.
  - `hooks/use-turn-guidance.ts`, `use-turn-announcements.ts` (expo-speech, en-GB), `use-replan-from-here.ts`.
  - `components/turn-banner.tsx` at the top of the trip screen, with a mute toggle
    (`state/guidance-store.ts`, remembered on the phone).

## Decisions

- **Off route is tap only.** After 3 fixes in a row more than 60 m from the route the banner changes
  to "Re-plan from here". The app never re-plans by itself: a surprise route mid-drive is worse than
  an old one. Turn announcements stop while off route.
- **Hazard warnings win.** Turn announcements are muted while a voice report is listening/speaking.
  An early heads-up is dropped if something is already being spoken; the turn itself cuts in.
- **Units.** UK roads: yards under 800 yd, then quarter miles, then whole miles.
- Tested against a real recorded Valhalla response (Hexham to Hebburn, 30 maneuvers including
  roundabouts): the route is "driven" every ~25 m, each announceable turn is spoken at least once,
  none twice, never "feet", arrival last.

## Rollout

Deploy core first (migration 0035 and the maneuvers), then the app. An app update before core works
but is silent, since the plans have no maneuvers.

## Not done

- Lane guidance, junction images, speed limits, and rerouting for traffic.
- Adjustable announcement distances (constants in `turn-guidance.ts`).
- Real-device drive test (done only against the recorded route).
