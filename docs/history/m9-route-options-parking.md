# M9 Route options & safe parking

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

## M9 task breakdown

Scoped 2026-09-27 from two field-testing suggestions (see "Ideas from field testing" above).
Ordered after M8 in the milestone table since neither needs the Phase 1 tech-design doc's own
scope (§12) revised — both are new capability on top of the existing routing/hazards/congestion
shape, not a change to it — but M8's own field-readiness work (store distribution, first driver
onboarded) isn't blocked on either and can still ship first.

| #    | Task                                                                                                            | Status            |
| ---- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| M9.1 | `packages/contracts`: `SafeParkingSpot` types                                                                   | Done — 2026-09-27 |
| M9.2 | Core: new `parking` module (report/list use cases, migration)                                                   | Done — 2026-09-27 |
| M9.3 | Driver-bff: parking routes                                                                                      | Done — 2026-09-27 |
| M9.4 | Driver-app: report a safe parking spot, map markers                                                             | Done — 2026-09-27 |
| M9.5 | `packages/contracts`: `RouteOption`/`RouteStrategy` types, optional `fuelConsumptionL100km` on `VehicleProfile` | Done — 2026-09-27 |
| M9.6 | Core: `PlanRoute` returns ranked alternatives (fastest/shortest)                                                | Done — 2026-09-27 |
| M9.7 | Core: rough estimated-fuel-cost per alternative                                                                 | Done — 2026-09-27 |
| M9.8 | Driver-app: vehicle profile screen — optional fuel consumption field                                            | Done — 2026-09-27 |
| M9.9 | Driver-app: route-choice screen (time/distance/est. cost per option)                                            | Done — 2026-09-27 |

**Safe parking spots (M9.1-M9.4): shipped 2026-09-27, as a new bounded context, not a reuse of
hazards or congestion.** Same reasoning as decision-log entry for congestion (2026-09-25/26,
above) — it's a genuinely different _kind_ of thing from both: unlike a `HazardReport` it isn't a
restriction or danger to route around, and unlike a congestion report it isn't a decaying
condition with a wait-time/expiry lifecycle. It's a persistent point of interest, closer to "a
driver vouched this spot is real and safe" with no expiry at all. Built exactly as scoped:

- `apps/core/src/modules/parking/**` — full four-layer module (`domain/safe-parking-spot.ts`,
  `application/{report-safe-parking-spot,find-nearby-parking}.ts` + tests, `infrastructure/
postgres-parking-repository.ts` + a real testcontainers test, `interface/routes.ts`), copied
  file-for-file off congestion's own shape (down to the duplicated `requireDriverId` helper and
  the per-module `infrastructure/testing/{apply-schema,db-for-tests}.ts` boilerplate — AGENTS.md
  rule 6, no cross-module sharing).
- `apps/core/migrations/0016_parking.sql`: `parking.safe_parking_spots` (point geography, reporter
  id, optional free-text `note` capped at 280 chars via `validateNote`, `reported_at`), one GiST
  index. No `MeasurementKind`/dimension check — this isn't a restriction, so `applies()` never
  touches it.
- No moderation/expiry in v1, as scoped — a driver-reported point stays until someone builds a
  dismiss/delete path for it (the hazards/congestion pattern exists to copy if bad reports turn
  out to be a real problem in testing).
- Wired into `composeCore` (own `parkingDb`, `createParkingModule`) and `build-app.ts`'s
  `DRIVER_AUTH_PREFIXES` (`/parking/`), `driver-bff/src/parking-routes.ts` (validate/authenticate/
  forward/relay, no business logic — AGENTS.md rule 10), and `packages/contracts/src/parking.ts`
  (own `package.json` export entry, mirroring `./congestion`).
- Driver-app: `api/parking.ts`/`use-parking.ts` (same mutation+90s-poll-query shape as congestion),
  `app/report-safe-parking-spot.tsx` (tap the map, optional note, no wait-minute chips — this
  isn't a decaying condition so there's nothing to estimate), and `route-map.tsx`'s third marker
  kind — `ParkingSpotMarker`, a square blue "P" pin, deliberately unlike hazards' square red/amber
  or congestion's round teal so a driver reads "a place" rather than a warning or a delay. Wired
  into `home.tsx` alongside the existing two report buttons (`reportButtonRow` gained
  `flexWrap: 'wrap'` for the third button on narrow screens).
- **Not** consumed by routing — surfacing safe-parking spots as a routing input (e.g. "route me
  via known safe parking") is explicitly out of scope until the break-suggestion idea (still in
  "Ideas from field testing," above) is scoped for real, since that's the feature that would
  actually consume it.
- **Verified**: `pnpm --filter @wagonwise/contracts test`, core's full suite including the real
  PostGIS testcontainers repository test (695 tests, 95 files), driver-bff (129 tests), driver-app
  (243 tests), `pnpm arch` (522 modules, 1847 dependencies, no violations), and lint — all green.
  Not run on a real device (same gap every driver-app milestone touching native map/location has
  hit); the map-marker rendering itself is unverified beyond MapLibre's own documented API, same
  caveat as hazards'/congestion's own markers.

**Route options (M9.5-M9.9): shipped 2026-09-27.** "Most economical" unblocked as a rough estimate,
not a real cost model — revised same day, on the user's own suggestion. The original plan (above,
now superseded) deferred "most economical" entirely for lack of a real fuel-cost model. The user's
own reframing: it doesn't need to be exact — a rough £-per-trip estimate, shown next to each
option's time and distance, lets the driver make the actual economical-vs-fast trade-off
themselves, rather than the app deciding for them which one label counts as "economical."

**Persistence design decision (asked of the user before implementing, since it's a real
architectural fork): preview all alternatives unpersisted, persist only the one the driver
picks.** `RoutePlan` has been an immutable, single-route row since decision 10 — no lifecycle,
never edited after creation — and trip-starting is keyed only off `RoutePlan.id`. The other option
(persist every alternative on the plan, let the driver change their mind up to trip-start) would
have touched `RoutePlan`'s schema, `start-trip.ts`, and `ActiveTrip`. The user picked the simpler
shape: nothing about `RoutePlan`, its DB schema, or trip-starting changed at all.

- **Two endpoints, one unpersisted.** `POST /routing/route-options/preview` (new
  `previewRouteOptions` use case) asks `RoutingEngine.routeAlternatives` for the primary route plus
  Valhalla's `alternates`, labels/costs them (`domain/route-option.ts`'s `buildRouteOptions`), and
  returns them without touching `RoutePlanRepository` at all. `POST /routing/route-plans` (the
  existing `planRoute`, unchanged in persisted shape) gained one optional field, `strategy:
'fastest' | 'shortest'` — omitted or `'fastest'` is exactly today's pre-M9 behaviour (calls
  `RoutingEngine.route()`, one request, no alternates); `'shortest'` calls `routeAlternatives`
  instead and picks the shortest-distance candidate before continuing hazard-avoidance exactly as
  before. A blocking hazard forcing a second pass always asks for one already-avoiding route —
  "shortest" doesn't survive a re-plan, an accepted edge case (safety-avoidance wins).
- **`RoutingEngine` gained `routeAlternatives`, not a flag on `route()`.** Every existing caller of
  `route()` wants exactly one result and shouldn't have to narrow an array; `planRoute`'s hazard-
  avoidance re-plan pass keeps calling `route()` unchanged. `ValhallaRoutingEngine.routeAlternatives`
  sends `alternates: 2` and merges Valhalla's `trip` + `alternates[].trip` into one array — Valhalla
  may return fewer than requested or none (its own documented caveat with `truck` costing), handled
  by `buildRouteOptions` working correctly on a single-candidate array too (labelled both "fastest"
  and "shortest").
- **Estimate, not a quote.** `estimateFuelCostGBP = distanceKm × (fuelConsumptionL100km / 100) ×
fuelPricePerLitreGBP` (`domain/route-option.ts`), applied identically in both `previewRouteOptions`
  and the persisted `RoutePlan.estimatedFuelCostGBP`. No tolls, no traffic, no real-time price feed.
- **`fuelConsumptionL100km` is optional on `VehicleProfile`** (own migration column, `double
precision` not `numeric` — same reasoning as the existing dimension columns, node-postgres
  returns `numeric` as a string) — sibling to `dimensions`, never reaches Valhalla's truck costing.
  A driver who hasn't set it just gets routes with no cost estimate; `validateFuelConsumption` is
  its own guard in `domain/vehicle-profile.ts`, not folded into `validateDimensions`.
- **Fuel price is one app-wide config constant** (`FUEL_PRICE_PER_LITRE_GBP`, default £1.60),
  not a live feed — a real-time pricing API is a real dependency this "rough estimate" doesn't
  justify; update the config default as prices actually move.
- **Driver-app flow**: `plan-route.tsx`'s "Plan route" button now triggers `previewRouteOptions`
  (creating a manual-entry profile first if needed, same as before) and shows a card per labelled
  option (time, distance, and `est. £X.XX fuel` when available) instead of planning immediately;
  tapping a card calls the real `planRoute` with that option's derived `strategy` and proceeds to
  `route-overview.tsx` exactly as before. `route-overview.tsx` shows the same fuel estimate on the
  committed plan. `VehicleProfileForm`/`vehicle-profile-form.ts` gained the optional fuel-consumption
  field (own `validateFuelConsumption`-mirroring zod check, not part of `dimensionsSchema`) —
  not exposed in plan-route's manual/quick-entry dimension fields, only on saved profiles, since
  that's the flow a driver revisits rather than a one-off.
- **Verified**: contracts (79 tests), core's full suite (97 files, including a real
  `ValhallaRoutingEngine.routeAlternatives` test against a local HTTP fake and the existing
  testcontainers repository tests), driver-bff (139 tests), driver-app (249 tests), `pnpm arch`
  (526 modules, no violations), and lint — all green. Not run against a real Valhalla instance with
  real alternate-route diversity, nor on a real device — same standing gaps as every other
  driver-app/routing milestone.
