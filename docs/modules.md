# Modules and apps: how to use each

Per-module notes moved out of `README.md` on 2026-10-08 so the README stays about getting the project running: what each
part exposes, example requests, and how the driver app is put together. Open the section for the area you are working in.
Start-up steps (a service, a container, an environment variable, a seed command) still go in `README.md`.

## Identity (sign-in)

`identity` is the reference bounded context (M1.5) — OTP sign-in, Ed25519-signed access tokens,
refresh rotation with reuse detection, invite codes. Core exposes it as internal endpoints (see
`apps/core/src/modules/identity/interface/routes.ts`); `apps/driver-bff` (M1.6) is the public-
facing wrapper described below, and is how you should normally reach these:

| Route                                 | Does                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /identity/otp/request`          | `{ identifier, inviteCode? }` — sends a one-time code                         |
| `POST /identity/otp/verify`           | `{ identifier, code, inviteCode? }` — returns tokens                          |
| `POST /identity/token/refresh`        | `{ refreshToken }` — rotates, returns new tokens                              |
| `POST /identity/sessions/:id/revoke`  | Sign-out (needs `Authorization: Bearer <accessToken>` at the BFF — see below) |
| `GET /identity/.well-known/jwks.json` | The public key, for a BFF to verify tokens with                               |
| `POST /identity/devices`              | `{ pushToken }` — registers a driver's Expo push token (M6.2, see Alerts)     |

`identifier` is an email or a UK-ish phone number. `inviteCode` is required only the first time —
signing in with an identifier that has no Driver yet needs one. Generate one from
`apps/dashboard`'s "Invite codes" screen (WagonWise staff only, `POST /staff/invite-codes`) (or `POST /staff/invite-codes/batch` with `{ count }`, 1 to 50, for a group), or
seed one directly for local testing:

```bash
docker exec -it $(docker compose -f infra/docker/compose.yml ps -q postgres) \
  psql -U wagonwise -d wagonwise -c "insert into identity.invite_codes (code) values ('HEXHAM24');"
```

Locally, the one-time code is printed to the console, not sent anywhere (`ConsoleOtpSender` —
`apps/core/src/modules/identity/infrastructure/console-otp-sender.ts`, dev-only). A real SMS/email
adapter needs a provider account and is deferred until one is chosen.

Calling core directly (bypassing the BFF) needs `X-Internal-Key: local-dev-internal-key` on
every request except `/health` — core is not publicly exposed (design doc §2), and this header is
the BFF's job to add, not something an app or a curl-from-your-laptop test should normally send.

**Sign-in without an invite code, passwords, Google and Apple (2026-11-01, server only; plan in `docs/driver-sign-in-plan.md`).**
Two switches, both read in `config.ts`. `DRIVER_INVITE_REQUIRED` (default `true`): `false` lets a first sign-in through with no code
(`create-driver.ts`; a valid unused code typed anyway is still redeemed), on the existing `/identity/otp/*` routes too, so the **released app,
which sends no code when its box is empty, needs no update**. `DRIVER_PASSWORD_SIGN_IN` (default `false`) registers the routes below, which
`apps/driver-bff` forwards: `POST /identity/signup/request` and `/signup/confirm` (a code proves the email; the password is sent only with the
code, so nothing waits for a stranger's address; `AccountExists` if there is already a driver), `POST /identity/password/sign-in` then
`/password/verify` (a right password only sends a code; the code signs in; one `InvalidCredentials` for a wrong email or password, with a decoy
hash so it takes as long; five wrong passwords lock the account 15 minutes, `identity.driver_credentials`), `/password/reset/request` (always 200)
and `/reset/confirm` (new password, every other session ended), `PUT /identity/account/password` (a signed-in driver with an email and no
password adds one), and `POST /identity/social/sign-in` (`{ provider: 'google' | 'apple', idToken }`: `JoseIdTokenVerifier` checks signature,
issuer and audience against `GOOGLE_OAUTH_CLIENT_IDS` / `APPLE_CLIENT_IDS`; a returning driver is found by the provider's `sub`
(`identity.federated_identities`), otherwise a **confirmed** email joins the account with that email or makes a new one; no second factor,
since the provider has proved who they are). A driver who has a password is refused on the code-only routes (`PasswordRequired`), or the code
alone would walk round it. Passwords: scrypt (identity has its own copy of staff's hasher), 10 to 128 characters, no composition rules. The second
factor is an emailed code, so **the inbox is the real key** (it also resets the password). Phone-number drivers stay on text codes until they have
an email. A signed-in driver adds methods to the account they have (`account-links.ts`, under the gated `/identity/account/`):
`POST /identity/account/link/social` (a Google/Apple login; `AlreadyLinked` if it is on another account) and
`POST /identity/account/email/request` + `/confirm` (a phone-number account proves an email with a code, and the email replaces the
phone number as its identifier; the account keeps its id, so its data and company links stay). **`GET /identity/sign-in-options`** (2026-11-04, core and the driver BFF, no sign-in needed) answers `{ passwordSignIn, inviteRequired, google, apple }` from the switches above (a provider counts only when password sign-in is on and it has a client id), so the app shows only what will work. **The app now uses it** for the password screens (below); Google and Apple are not in the app yet (they need native modules and the owner's Google and Apple set-up).

## Routing (vehicle profiles)

`routing`'s first slice (M2.2) — CRUD for `VehicleProfile`, the height/width/length/weight a
driver's routes get planned against. Reachable two ways:

- **Through the BFF** (`apps/driver-bff`, M4.4 — how a real client should reach these): just
  `Authorization: Bearer <accessToken>` from the identity flow above. No `X-Internal-Key` — the
  BFF adds that on its own call to core.
- **Calling core directly**: the same internal-only rule as identity's (`X-Internal-Key:
local-dev-internal-key`), **plus** (M4.2) the same `Authorization: Bearer <accessToken>` — core
  verifies it itself and won't take a client-supplied driver id.

| Route                                  | Does                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| `POST /routing/vehicle-profiles`       | `{ name, dimensions }` — creates a profile           |
| `GET /routing/vehicle-profiles`        | Lists the authenticated driver's profiles            |
| `GET /routing/vehicle-profiles/:id`    | Fetches one                                          |
| `PUT /routing/vehicle-profiles/:id`    | `{ name, dimensions }` — replaces name/dimensions    |
| `DELETE /routing/vehicle-profiles/:id` | Deletes it                                           |
| `POST /routing/route-plans`            | `{ profileId, origin, destination }` — plans a route |

`dimensions` is `{ heightM, widthM, lengthM, grossWeightT, axleWeightT? }`, all positive numbers.
There is no `driverId` field on any request — core derives it from the verified access token's
`sub` claim (`host/driver-auth.ts`), never a value the caller supplies (decision 1). A token whose
driver doesn't own the profile in the URL gets the same 404 as a genuinely unknown id, not a 403
(docs/progress.md, decision 49) — unchanged by M4.2, just now enforced against the real driver
instead of a trusted field.

**Truck-aware routing (M2.3–M2.5):** `RoutingEngine`, behind a port, with a Valhalla adapter
(`apps/core/src/modules/routing/infrastructure/valhalla-routing-engine.ts`) that talks to the
`valhalla` compose service (see above) over plain HTTP. `VALHALLA_URL` (Configuration, above)
points at it. `POST /routing/route-plans` (`origin`/`destination` are `{ lat, lon }`) plans a
real route for one of the driver's vehicle profiles and returns `422` (not `404`/`400`) when the
vehicle genuinely can't get there. `avoidedRestrictions` and `hazardsOnRoute` are always `[]` for
now — the avoided-restriction explanation needs real OSM restriction data core doesn't ingest yet
(docs/progress.md, decision 54), and community-hazard avoidance needs the `hazards` module (M3).

**How a route is chosen and timed (2026-10-03):** two Valhalla calls per route. `/route` chooses
the road with no speed cap, then `/trace_route` walks that exact road with a 55 mph HGV cap to get
a realistic time. The cap is deliberately _not_ used when choosing, because it flattens the speed
difference between roads and was sending trucks along back roads instead of the A69 (the owner's
Hexham to Hebburn report). If a route can't be re-timed, its time is the uncapped time times 1.17.
Valhalla's default limits make that happen for any route over 200 km or 16,000 shape points
(`service_limits.trace` in its `valhalla.json`), so on the droplet raise `trace.max_distance` and
`trace.max_shape` (for example to 1,000,000 and 100,000); `docs/deployment-guide.md` has the step.

**Scottish low emission zones on Plan route (2026-11-11, stage 3 of charges routing, second part).** `domain/zones.ts` holds the four zones (name, outline pieces, penalty, enforcement day,
source, `checkedOn`); the outlines are `domain/scottish-lez-boundaries.ts`, made once by a script from the Improvement Service's "Low Emission Zones - Scotland" file (British National
Grid, October 2022, Open Government Licence v3.0, accuracy not stated by the publisher) converted to latitude and longitude with the Ordnance Survey's published method (checked against its
worked example) and thinned to 8 m. They were compared by eye with OpenStreetMap streets and landmarks, **not** with the councils' own maps. `zonesEntered` fills in any gap over 50 m
between a route's points (a straight road with a point each side of a small zone must not be missed) and lists the zones in the order met; `zonesForVehicle` turns that into
`charged` (Euro VI said no), `may-be-charged` (not said) or nothing (Euro VI). `previewRouteOptions` adds `zones` to each option from the route's own line, so the app needs no flag
(an older app ignores the field); the app shows one line per zone (`zoneLines`) and, once under the cards, the licence credit (`ZONE_CREDIT`). It never says a vehicle is compliant or
that a charge will be waived (exemptions exist). Penalties are national (Schedule 4 of the 2021 Regulations): £60, £120, £240, £480, £960, half off within 14 days, reset after 90 days.
The HGV standard in the regulations is Euro VI for diesel and Euro IV for petrol (categories N2 and N3).

**What a route costs, and the Cheapest label (2026-11-11, stage 4 of charges routing).** `buildRouteOptions(…, costs)` (`domain/route-option.ts`) adds `cost` to each option when the request has `costs: true`: `routeCostOf` is the fuel (`estimatedFuelCostGBP`) plus the tolls (each charge's `highGBP`) plus the zone charges (a penalty's first amount, a daily charge's high figure; a zone the vehicle has not said it avoids counts as charged), with `unpriced` true when a toll has no price here (an unnamed toll, or no figure) so the figures are a floor, and **no `totalGBP` without a fuel figure**. `markCheapest` adds the `cheapest` label to the route with the lowest total only when there are two or more routes, every one has a total and none is unpriced, and the cheapest beats the next by at least `MIN_CHEAPEST_MARGIN_GBP` (£2); otherwise it adds nothing. Only routes that already carry a label are compared, so the one marked can be planned again by that other label (`strategyForOption` ignores `cheapest`). The app (`costLine`, `cheapestLine` in `lib/route-option-text.ts`) shows "About £66.00 in all: £57.60 fuel and £8.40 in tolls and zone charges" on a route that has charges, and on the Cheapest card what it saves against the fastest and how much longer it takes. An app asks with `costs: true`; without it the options carry neither `cost` nor the label (an older app's label list would reject a new one). Not the toll choice in re-plans or the faster-route check, and not a search for a cheaper route by avoiding a zone.

**England and London on the same checks (2026-11-11).** The zone table (`domain/zones.ts`) now has twelve zones: the four Scottish ones (a **penalty** notice, `charge.kind: 'penalty'`) and Tyneside, Bradford, Sheffield, Birmingham, Bristol, Bath, Portsmouth and London (a **daily charge** for a lorry, `kind: 'daily'`, with `lowGBP` and `highGBP` because London's is £100, or £300 for one older than Euro IV). Their outlines are `domain/gb-zone-boundaries.ts`, made once from the owner's draft file (thinned to 8 m, 40 m for London; areas within 0.15%; London lost three pieces that thinned to a line), and the header there records each zone's publisher and licence. **Four have no stated licence (Tyneside, Bradford, Bath, Portsmouth) and were taken without the councils' permission, on the owner's decision of 2026-11-11**; Bath and Portsmouth were extracted from a council map PDF and a scanned plan, so they are about 10 to 25 m out. London's licence is unconfirmed, Birmingham's is CC-BY, Sheffield's and Bristol's are the Open Government Licence. If a council objects, delete its entry in both files. Rates: Bradford, Sheffield, Birmingham £50, Bristol and Bath £100, Portsmouth £50, read from each council's page through search summaries on 2026-11-11 (Tyneside's £50 for buses, coaches and HGVs was confirmed by the owner from the zone's own page on 2026-11-11). **Oxford's zero-emission pilot is left out:** its test is zero emission, so a Euro VI answer does not apply. An app asks for the new zones with `dailyZones: true` on the preview request; without it only the Scottish zones are named, in the old shape (an app released before this reads only a penalty). The wire shape of a zone is in `interface/zone-dto.ts`.

**Zones on the dispatcher's live map (2026-11-11).** `GET /staff/routing/low-emission-zones` (core `routing/interface/zone-routes.ts`, passed through the staff BFF) returns the four zones with their outlines
(`[latitude, longitude]` pairs), penalty, enforcement day and the licence credit (`ZONE_BOUNDARY_CREDIT`); any signed-in staff account, no company scoping, as for weather warnings. The dashboard fetches it
once (`api/zones.ts`), `FleetMap` outlines the zones in teal beneath the route and the vehicles (a click shows the name and penalty), and the Live trips page tests each vehicle's last position against the
outlines itself (`lib/zones.ts`: `zoneAt`, `zoneNote`). **Core does not look at where a vehicle is**, so nothing new is stored or shared: it uses the position the live map already shows. A vehicle inside
a zone gets a line in the list ("In the Glasgow Low Emission Zone…", or "Last seen in…" when its position is not live) and its map label says so. The line uses what the company has said about the vehicle's
Euro VI (`euroVI` on the fleet vehicle): marked Euro VI gives a quiet note, not Euro VI says a penalty applies, not stated says one may and to set it on the vehicle, and a viewer who cannot see
vehicles is told to check. It repeats what the company said and never calls a vehicle compliant. A tick box hides the zones; the credit shows under it. The twelve zones (see above) are all drawn, with a daily charge's wording for the English ones,
and no alert or email when a vehicle enters a zone (a possible next step).

**Euro VI on the vehicle (2026-11-10, stage 3 of charges routing, first part).** `euroVI?: boolean` on the shared `dimensions` (contracts `dimensionsSchema`), stored for a driver's own
profile (`routing.vehicle_profiles.euro_vi`) and a company vehicle (`fleet.vehicles.euro_vi`), migration 0088, and carried to a job's profile through `upsertVehicleProfile` like the top speed.
Three answers: true, false, and **absent for "don't know"**; the repositories treat only `null` as absent, so a "no" is kept. The driver app asks "Euro VI engine (optional)" with a Yes / No / Don't
know control (also with a preset); the dashboard vehicle **Edit** form has a select, and so does the add form (2026-11-11). **Nothing reads it yet**: it is for the zone check to come, where "don't know" must give "a
charge may apply", never "fine". It is not used for routing or timing.

**A vehicle's top speed (2026-11-10, driver feedback).** The 55 mph timing speed is the default; a vehicle can have its own, `topSpeedKph` on the shared
`dimensions` (contracts `dimensionsSchema`, 30 to 130 km/h, optional), so it is stored for both a driver's own profile (`routing.vehicle_profiles.top_speed_kph`) and a
company vehicle (`fleet.vehicles.top_speed_kph`, migration 0087), and a job's profile gets the company vehicle's through `upsertVehicleProfile`. `retime` uses
`dimensions.topSpeedKph ?? TOP_SPEED_KPH`, so it changes the **time** only; the road is still chosen with no cap. The driver app asks for it in mph (always mph, like the
signs; `SpeedInput` converts to km/h) in the vehicle form, for presets too, with a warning (not a block) when a lorry over 7.5 t is set above its 56 mph limiter. Staff set it in
the dashboard's vehicle **Edit** and **Add** forms (`lib/vehicle-speed.ts` holds the conversion and range). Not covered: the route planner's one-off vehicle (it has no speed box, so it is timed at 55 mph), and when a route
cannot be re-timed the fallback is still the uncapped time times 1.17, whatever the vehicle's speed.

**Golden-route tests (M2.6):** real requests against a real, tile-built Valhalla instance — not
part of `pnpm test`/`pnpm verify` (building tiles takes minutes, too slow for every push per
decision 13). Bring up `valhalla` (above) first, then:

```bash
pnpm test:golden
```

Runs nightly in CI (`.github/workflows/nightly-golden-routes.yml`), which downloads a fresh
extract each time so it also tests against Geofabrik's current data.

### Arrival time with traffic (2026-10-22)

`POST /routing/trips/:id/traffic` `{ position }` returns `{ enabled, extraMinutes, coverage }` for what is left of the route from that position (`application/get-trip-traffic.ts`): the traffic module's delay along it plus other drivers' congestion reports. The app (`use-trip-traffic.ts`, `lib/trip-traffic.ts`) adds it to the ETA only when traffic is on, at least half the route was read and the delay is 2 minutes or more. The answer also has `stretches` (`{ from, to, level: slow|heavy }`, fractions of the whole route) from the same flow readings (`congestionLevel` in `traffic/domain/traffic.ts`: under 70% of free-flow speed is slow, under 40% or closed is heavy), drawn over the route in amber or red by the app. They are as fine as the sampling (one reading per ~5 km, at most 30 per route), so a short jam inside a block is not shown. `TrafficService` now reports provider failures and the daily allowance running out through `onProblem` (logged as a warning by `compose-core.ts`, at most every 5 minutes for each kind): look for `live traffic: provider call failed or allowance used up` in core's logs to see whether TomTom is working.

### Speed limits on the trip screen (2026-10-21)

`GET /routing/route-plans/:id/speed-limits` (core, and the driver BFF forwards it) returns `{ zones: [{ from, to, limitMph? }], bridges: [{ from, to }] }`, with the zones' `from` and `to` as fractions of the route's length and the bridges' as the points (lat/lon) where each stretch of the route runs over a bridge starts and ends (read from Valhalla's `edge.bridge` and the matched shape; points, not fractions, because a fraction can be tens of metres out on a long route, more than a short bridge). **A low-bridge hazard on such a stretch is dropped** (`placeOnRoute` in `lib/on-route.ts` takes the bridges): a low-bridge restriction is on the road underneath, and the A69 over a bridge at Bardon Mill is not the driver's. A low bridge the route goes _under_ is unaffected. The answer also carries `wayIds`, the OpenStreetMap ways the route runs along (Valhalla `edge.way_id`), and a hazard from OpenStreetMap carries `osmWayId`, the way it is mapped on (the restricted road itself; stored as `way/123` in `hazards.reports.osm_id`, so 4,338 of the 4,691 imported ones have it; the 353 mapped on a point and every driver report have none). **`placeOnRoute` drops a hazard whose `osmWayId` is not among the route's `wayIds`**: it is on a road that crosses or joins the route (the A69 over a bridge, a weight limit on a side road at a junction), however close it is. That rule decides on its own for such a hazard (a limit on the bridge the route is itself on has that bridge's way among the route's, so it stays); the bridge rule above is the fallback for hazards with no way and for when the ways could not be read (`wayIds` empty: nothing is ruled out). Checked live on 2026-10-25: the one seeded low bridge within 40 m of the A69 at Bardon Mill is on a different way from every road of the route, and 60 of 60 sampled imported hazards had their way among the nearby roads in Valhalla's data. The app asks once per route (`use-route-speed-limits.ts`) and `speedLimitHere` (`lib/speed-limit.ts`) picks the zone for the driver's progress along the route; `SpeedLimitSignView` draws the sign bottom-left on the map.

- **Source:** Valhalla `trace_attributes` on the route's own line (`edge_walk`, `infrastructure/valhalla-speed-limits.ts`), read in pieces of at most 5,000 points or 50 km because Valhalla refuses a long trace. A piece that fails gives no zones (no sign there) and is not remembered; a full read is kept for a few recent routes.
- **Rules** (`domain/speed-zone.ts`), deliberately cautious: a limit held in the map is shown as a number rounded to a UK limit (20, 30, 40, 50...); a held 60 or 70 is shown as the **national speed limit** sign, because a lorry's own limit there differs and drivers know it; a motorway with no limit held is the national speed limit; **anything else shows nothing** (a lit town street with no sign looks the same as open road in the map data, so it is never guessed). Slip roads with no limit held show nothing.
- **Not checked against live data yet:** Valhalla's exact field names and what its UK data holds were written from its documentation, not tried against the production tiles. Check on a real route after deploy; if no signs show, look at what `/trace_attributes` returns first. The sign is a guide, never a legal statement, and says to check the signs.
- Speed cameras are separate: see "Speed cameras" below.

### Speed cameras on the trip screen (2026-10-21)

`apps/core/src/modules/cameras` holds `cameras.speed_cameras` (migration 0074; the app role can only read it): 3,458 fixed, average-speed and red-light camera points for England, Scotland and Wales, seeded once from OpenStreetMap by migration 0075 (`apps/core/scripts/fetch-osm-cameras.mjs`, one Overpass query; © OpenStreetMap contributors, ODbL, so the warning card shows the credit). Each keeps its `osm_id`; not refreshed. The map is **not complete** (roughly half of Britain's fixed cameras) and has **no mobile cameras**, so the warning is a courtesy and says nothing about being safe from enforcement.

- **The home map** (not navigating) gets cameras from `POST /cameras/nearby` (`cameras/interface/routes.ts`; core, driver BFF; `{ corridor, radiusM }`, at most 600 back), drawn with the cameras drivers marked and switched with the Cameras layer. The `/cameras/` prefix is behind the driver sign-in.
- **A route's own cameras have no route of their own here.** `routing` asks for a plan's cameras: `GET /routing/route-plans/:id/cameras` (core, forwarded by the driver BFF) decodes the plan's **full** line and asks `cameras.findNear` for those within 12 m (`CAMERA_ON_ROUTE_RADIUS_M`). The line must not be thinned and the radius must stay tight: a camera on the other carriageway of a dual road is 15 to 30 m away and is not the driver's. The map's `direction` tag is ignored because the conventions for it are not consistent.
- **Only on the route, only ahead:** hazards near the route are fetched within 750 m, but the trip screen draws and speaks about only those within 30 m of the route line that are still ahead of the driver (`lib/on-route.ts`: `placeOnRoute` once per route and set of hazards, `stillAhead` re-cut every 250 m). Before this a hazard on a parallel street in a town was drawn on the road and announced.
- **On the map:** each camera has a round purple marker (police badge for a mobile one), drawn by `route-map.tsx` from `lib/camera-markers.ts`, which joins the map-data cameras along the route with the camera hazards drivers marked (a map-data camera within 40 m of a fixed driver-marked one is dropped) and keeps camera hazards out of the hazard markers.
- **App:** `use-route-cameras.ts` asks once per route; `cameraOffsets` places each camera along the route once; `nextCameraAhead` picks the next one within 500 m of the driver's progress (nothing once off the route). `CameraWarningCard` shows it above the speed sign, bottom-left, and `use-camera-voice-warning.ts` says "Speed camera ahead" once per camera (muted with the rest of the guidance).

### A route past a weight limit (2026-11-08)

When no route exists for a vehicle's real weight, the preview (`previewRouteOptions`) tries once more with the weight limit ignored (`withoutWeightLimits`: 3.5 t, no axle weight; height, width and length are never relaxed) and marks every option `breaksWeightLimit`. Nothing changes when a normal route exists. The app shows a banner and a "Goes past a weight limit" line on each card, and a tap asks "Go anyway?" before anything is planned.

- **Only on purpose:** `POST /routing/route-plans` makes such a route only when the request carries `acceptWeightLimit: true`, the strict route is tried first, and the plan keeps `breaks_weight_limit` (migration 0086; the route overview shows the warning). A job's route, a re-plan or a mid-trip reroute never sets it, so they still say "no route" rather than quietly go past a limit.
- **What it cannot tell:** whether a signed limit allows access (many say "except for access"); Valhalla only reports that no route exists. It does not say which limit or where. Naming the road would need OpenStreetMap tags core does not hold.
- **Why:** a driver (vehicle "Tank") could not plan to Lloyd Maunder Road, Willand; OpenStreetMap has `maxweight=17` there, a lighter weight routed and a heavier one did not.

## Hazards

`hazards` (M3) — driver-reported obstructions (low bridges, weight/width limits, roadworks,
flooding…) that feed into routing's avoidance. Same reachability as routing's, above: through the
BFF with just a bearer token, or calling core directly with `X-Internal-Key` plus the token.

**Cameras drivers mark (2026-10-22):** two hazard types, `speed_camera` (a fixed camera: permanent, like a low bridge, until drivers dismiss it) and `mobile_camera` (a van or police speed check: **expires after 6 hours** unless another driver confirms it is still there, which renews it for another 6; `expiryWindowMs` in `domain/hazard-report.ts`). Both are advisory: never blocking, never avoided by routing. The driver app keeps them apart from hazards: a **Report a camera** button on the trip map (one tap on fixed or mobile, saved where the driver is, kept on the phone first like a hazard report; `report-camera-sheet.tsx`), not a choice on the hazard screen, and cameras are left out of the "hazards on this route" list and count (`withoutCameras`). They still go through voice report and the "still there?" prompt, show on the map with their own icons and are spoken as "Speed camera ahead" or "Mobile speed camera ahead" (`hazardWarningSpeech`). Separate from the OpenStreetMap camera positions in `cameras` (see Routing); a camera that is in both can be spoken twice, and nothing yet joins them.

| Route                               | Does                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /hazards/reports`             | `{ id, type, location, note?, measurement?, source }` — reports one                                                           |
| `POST /hazards/reports/:id/confirm` | "Still there" — increments confirmations                                                                                      |
| `POST /hazards/reports/:id/dismiss` | "Not there" — increments dismissals, auto-dismisses past a threshold                                                          |
| `POST /hazards/voice-reports/parse` | `{ transcript }` → `{ type, note?, measurement?, positionHint? }` — parses a spoken report (M7.1, see Voice reporting, below) |

`id` is client-generated (an offline-queue idempotency key — resubmitting the same `id` returns
the existing report unchanged, or merges into it, rather than duplicating). No `reporterId` field
(M4.3) — same reasoning as routing's `driverId`, core derives it from the access token. Confirm and
dismiss need a valid token too, but not any particular one — any authenticated driver may act on
any report (decision 63, no ownership check on community moderation).

## Voice reporting

`hazards` (M7.1) — the `HazardParser` port (design doc §7 step 3) turns a driver's spoken
transcript into a structured report. `POST /hazards/voice-reports/parse` is the first half only:
it classifies what was said, it doesn't file anything — the driver app still owns speaking the
summary back, listening for a yes/no, and only then calling `POST /hazards/reports` (above) with
`source: 'voice'`. Nothing resolves a spoken `positionHint` ("just past the roundabout") to a real
location in Phase 1; it's kept as free text, and the pin still uses the GPS position the app
captured when recording started.

**`AnthropicHazardParser`** (`infrastructure/anthropic-hazard-parser.ts`) is the real adapter —
hand-rolled HTTP to Anthropic's Messages API (no SDK, same precedent as `ValhallaRoutingEngine`/
`ExpoPushNotifier`), forcing a single tool call so the model's output is structured JSON rather
than prose to re-parse. The tool's `input` is still zod-validated before being trusted — a model
producing something that doesn't fit the schema is retried once, then falls back to
`{ type: 'other', note: <the raw transcript> }` (design doc §7 step 3, verbatim). A non-2xx
response or an unparseable body is a genuine infra fault and throws.

**`ANTHROPIC_API_KEY`** (Configuration, above) is unlike `EXPO_ACCESS_TOKEN` — Anthropic's API
genuinely requires a key. Unset wires `NullHazardParser` instead (always the `type: 'other'`
fallback, no network call), so `pnpm dev` keeps working with zero configuration; add the key to
get real parsing. Get one from [console.anthropic.com](https://console.anthropic.com/).

## Alerts

`platform/outbox-dispatcher.ts` (M6.1) — the transactional-outbox event dispatcher design doc §11
and decision 5 committed to before any module had an event to publish. Polls `outbox.events`
(`processed_at is null`, oldest first, `for update skip locked`) every `OUTBOX_POLL_INTERVAL_MS`,
runs every registered handler whose `eventType` matches, and records success per
`(event_id, handler_name)` in `outbox.handled` — the idempotency guard at-least-once delivery
needs (AGENTS.md rule 9: every handler must itself be idempotent, since a crash between a handler
running and its `outbox.handled` row being written means it may run again). A handler that keeps
throwing gets retried up to 5 attempts, then dead-lettered (marked processed without ever
succeeding) rather than retried forever.

**`composeCore` now wires the dispatcher with routing's real handlers** (`overrides.eventHandlers ??
routing.eventHandlers`, M6.4) — the empty-list default (M6.1) lasted until routing's reroute
subscriber below became the first real registrant. `drainOnce()` runs one pass synchronously, for
tests that don't want to wait on the poll interval.

**Hazards publishes events (M6.3)**: `reportHazard` and `confirmHazard` now raise
`HazardReported`/`HazardConfirmed` (`hazards/domain/events.ts`) through the outbox, in the same
transaction as the row itself (decision 4) — `PostgresHazardRepository.save()` takes an optional
third argument, `events`, and only opens a transaction at all when there's something to publish
alongside the row. An idempotent retry of an already-filed report raises nothing (the report
didn't change), and a nearby-duplicate merge raises `HazardConfirmed`, not `HazardReported` — from
an alerting subscriber's point of view, a merge and an explicit "still there" confirmation are the
same fact. Emitted for every hazard type, blocking or not — filtering to what's worth alerting on
is the future subscriber's job, not something hazards decides on its behalf. `HazardDismissed`/
`HazardExpired` (also in the design doc's event list) have no consumer yet and aren't emitted.

**Device push tokens (M6.2)**: `POST /identity/devices` (`{ pushToken }`, no `driverId` field —
the caller is whoever the access token says) registers or re-registers a driver's Expo push
token, upsert-keyed on `pushToken` itself rather than one-row-per-driver: reopening the app with
an unchanged token just refreshes `updated_at`, and the same physical device signing in as a
different driver reassigns the token rather than leaving it pointing at whoever registered it
first. Gated by the driver-auth hook on `/identity/devices/` specifically, not all of
`/identity/` — identity's other routes (OTP request/verify, token refresh, JWKS) are the
pre-token sign-in flow itself and can't require a token they don't have yet. `identity/api.ts`'s
facade also exposes `getPushTokensForDriver(driverId)` — the read-model port design doc §6 asks
for ("device tokens come from a read-model port onto Identity"), called directly by routing's
reroute subscriber below (M6.4).

**Routing's reroute subscriber (M6.4)**: `application/detect-reroute.ts`, registered against the
outbox dispatcher as two handlers — `routing.detect-reroute-on-hazard-reported` and
`-on-hazard-confirmed` — design doc §6's whole flow. On either event, it re-queries hazards'
`findAvoidanceCandidates([location], 30)` (never trusts the event payload's own `type`/
`measurement` fields — the same read-model call route planning already uses, so a hazard
dismissed or expired between publish and processing is naturally excluded). If it's still an
active blocking candidate, it finds affected trips/plans (`ActiveTripRepository.findActiveNear` +
`RoutePlanRepository.findRecentUnstartedNear`, both backed by a new PostGIS `geometry_geog`
column on `routing.route_plans`, migration 0009), filters through `applies()` (unchanged), skips
the reporter (`HazardReported` only — a merge-triggered `HazardConfirmed` has no single reporter
to exclude), checks the two guardrails (`routing.reroute_alerts`'s own `(hazard_id, subject_type,
subject_id)` unique index for "one alert per hazard per trip," a rolling-hour count for the
per-subject cap), requests a fresh route around a `bufferPoint` avoid-zone, persists it as a new
`RoutePlan`, and sends a push via `PushNotifier` to every token `getPushTokensForDriver` returns. A
mid-trip reroute plans from the trip's _plan_ origin, not a live position —
`ActiveTrip.lastPosition` stays unset for all of Phase 1 (no position-tracking endpoint exists
yet), a known, documented gap (`docs/progress.md`, M6.4 deviations).

**Real push delivery (M6.5)**: `infrastructure/expo-push-notifier.ts`'s `ExpoPushNotifier` is now
the wired `PushNotifier` default — hand-rolled HTTP against Expo's fixed `exp.host` push endpoint
(no client library, same precedent as `ValhallaRoutingEngine`), sending one `{ to, title, body,
data }` message per call and reading back Expo's ticket response. `EXPO_ACCESS_TOKEN`
(Configuration, above) is optional — Expo's push API works without one unless a project turns on
its "enhanced push security" setting. A per-ticket `status: 'error'` (most commonly a stale or
revoked token — `DeviceNotRegistered`) is logged and swallowed, not thrown: by the time a push is
sent, `detect-reroute.ts` has already persisted the `RerouteAlert`, and the idempotency guard means
a retried event would just skip that already-alerted subject rather than genuinely resend the push,
so throwing here would only abort the rest of that subject's token loop for no benefit.
`ConsolePushNotifier` (logs instead of sending) is still available as an explicit `pushNotifier`
override for tests or a local manual run that shouldn't reach Expo's real endpoint.

**End-to-end verification (M6.7)**: `apps/core/src/composition/reroute-end-to-end.test.ts` — a
real HTTP hazard report through the real outbox, dispatched by the real `OutboxDispatcher` into
routing's real reroute-detection handlers, across hazards, routing and identity together, wired
exactly as `composeCore` wires them in production (only Valhalla and `PushNotifier` are faked).
Found and fixed two real concurrency bugs in `platform/outbox-dispatcher.ts` that every prior unit
test had missed: `start()`'s `setInterval` had no guard against overlapping ticks, so a slow
handler could get claimed and run _concurrently_ with itself, and `stop()` didn't wait for an
in-flight drain before a caller (`compose-core.ts`'s `close()`) closed the database pool out from
under it. Both fixed; see `docs/progress.md`'s M6.7 decisions (88–90) for the full story.

## Driver BFF

`apps/driver-bff` (M1.6 identity; M4.4 routing + hazards) is the thin public-facing service a
driver app actually talks to — "BFFs contain no business rules" (AGENTS.md rule 10): it verifies
access tokens against core's JWKS, shapes nothing, and forwards everything else to core with
`X-Internal-Key`. Same routes as core's identity, routing and hazards endpoints (above), just
without ever needing `X-Internal-Key` yourself — the BFF adds it for you — and, for routing and
hazards, forwarding your own `Authorization: Bearer <accessToken>` unchanged, since core does its
own authoritative re-verification (design doc §9, "verify twice").

```bash
pnpm --filter @wagonwise/driver-bff dev   # port 3002 by default
curl http://127.0.0.1:3002/health
```

The one route the BFF does real business-adjacent work on: `POST /identity/sessions/:id/revoke`
requires `Authorization: Bearer <accessToken>`, verifies it against core's JWKS, and checks the
token's own session (`sid` claim) matches the `:id` in the URL — 401 with no token or a bad one,
403 if it's someone else's session, only then forwarded to core. That is what "the BFF can verify
tokens" is for, made concrete rather than just plumbing a header through. Every routing and
hazards route does the same local verify-then-forward (`auth/authenticate.ts`), just without a
second check on top — core alone decides ownership/authorization for those.

| Variable            | Default                  | Notes                                    |
| ------------------- | ------------------------ | ---------------------------------------- |
| `NODE_ENV`          | `development`            | Same enum as core                        |
| `HOST`              | `127.0.0.1`              |                                          |
| `PORT`              | `3002`                   |                                          |
| `LOG_LEVEL`         | `info`                   |                                          |
| `CORE_INTERNAL_URL` | `http://127.0.0.1:3001`  | Where core lives                         |
| `CORE_INTERNAL_KEY` | `local-dev-internal-key` | Must match one of core's `INTERNAL_KEYS` |

## Billing

`apps/core/src/modules/billing`: what WagonWise charges companies.

- **Billing details** (`billing.details`, migration 0039): trading name, address, billing email, payment details, VAT status and
  payment terms, one row seeded with `[bracketed]` placeholders. `placeholderFields()` lists fields still in brackets; invoice
  issuing must refuse while it is not empty. Edited on the dashboard's Billing details page.
- **Plans** (`billing.plans`, `billing.capacity_changes`, migration 0040): a price per vehicle in pence (default £10) and an
  effective-dated vehicle capacity. The capacity in force is the latest change whose day (UK time) has arrived; a company with
  none covers 0 vehicles. A change may start today or later, never in the past. Edited on the Plans page. Fleet refuses to create a
  vehicle beyond it (`CapacityReached`), through its `VehicleCapacity` port; jobs refuses a second live job on a vehicle (`VehicleBusy`).
- **Invoices** (`billing.invoices`, `invoice_lines`, `invoice_counter`, migration 0041): a month's invoice per company, drafted from its plan (`buildPlanLines`: the capacity on the 1st for the month, a mid-month rise pro rata, a fall next month), adjusted on the draft, then issued: numbered `INV-0001` in order with no gaps (the counter commits with the issue), WagonWise's details stamped, frozen. Refused while the billing details hold placeholders. Paid by hand; void keeps the number and frees the month. Printable page: `apps/dashboard/src/lib/invoice-print.ts`. No VAT calculation.
- **A company's own view** (`/staff/billing/my/plan`, `/my/invoices`, migration 0042): for staff with `manage_billing` only; the company is the caller's own and the work runs in its data scope, so Postgres refuses other companies' rows and any draft. Read only. WagonWise admins use the admin pages.
- Everything else under `/staff/billing/` is WagonWise-admin only.
- Pricing model and what is next: `docs/phase-3-scope.md`.

## Checks

`apps/core/src/modules/checks`: the driver's daily walk-round check.

- **Lists** (`checks.templates`, migration 0043): a company builds its own at `/staff/checks/...` (dashboard "Walk-round checks"),
  as a JSON set of questions (`domain/check-template.ts`), for all its vehicles or chosen ones. `manage_fleet` builds; any company
  staff read. Editing bumps `version`; removing archives. `domain/starter-template.ts` is the editable example list.
- **Doing a check** (migration 0044): the driver's door is `GET /checks/mine` (the lists for the vehicle on their current job, and
  whether each is done today by anyone), `POST /checks` (file a check; idempotent on its id) and
  `PUT /checks/:id/photos/:itemId` (a photo for a photo question, or a defect that asks for one). `domain/check.ts` evaluates the
  answers against the questions into defects and a result (clear, fix soon, do not drive); the check is stored with a copy of the
  questions it was answered against, and each defect becomes a row with a status for the office. Proof it works against real
  Postgres: `composition/checks-end-to-end.test.ts`.
- **Driver app** (`apps/driver-app`): `components/check-due-card.tsx` (Jobs tab and job screen) opens `app/check.tsx`; the pure logic is `lib/check-flow.ts` and `lib/check-due.ts`, the offline queue `db/check-queue.ts` with `lib/check-queue-flush.ts`. JavaScript only.
- **Office** (dashboard "Check results" and "Defects"): `application/office-checks.ts` and `interface/office-routes.ts`, reading through `OfficeCheckRepository`. Defects move open, seen, fixed, recording who and when (`manage_fleet` or `dispatch`); reading needs `manage_fleet`, `dispatch` or `view_reports`.
- **Rules** (`checks.settings`, migration 0046; `application/check-rules.ts`): per firm, both off by default: do the check before the job, and hold back a vehicle with an unfixed "do not drive" defect. Jobs asks `checks.jobStartVerdict` through its `JobStartGate` when a driver accepts an assigned job (`CheckRequired`, `VehicleNotFit`); a dispatcher is never held up.
- **Retention** (`checks.settings.retention_months`, migration 0047): the firm chooses (default 12 months, 1 to 120). The daily `prune-checks` task deletes older checks with their photos and defects, in **two tiers** (`retentionCutoffs` in `domain/settings.ts`, 2026-11-08): a check that found **nothing** goes at the firm's choice, and a check that found a **defect** goes at the firm's choice or **15 months, whichever is longer** (`DEFECT_RECORD_MONTHS`), and never while a defect is still open or only seen. The 15 months is DVSA's [Guide to maintaining roadworthiness](https://www.gov.uk/government/publications/guide-to-maintaining-roadworthiness/guide-to-maintaining-roadworthiness-commercial-goods-and-passenger-carrying-vehicles) (key point 5, section 3.1): drivers' defect reports and the repair details "must be kept for at least 15 months", safety inspection records too, and the guide says "must" is a direct legal requirement; reports with nothing wrong only have a recommendation of 3 months. Maintenance history, repairs and date changes are not deleted by any rule, which also meets it.
- To come: defects feeding maintenance (M4)
  (`docs/phase-3-scope.md`).
- **Finances** (`billing.costs`, migration 0048; `domain/finance.ts`, `application/finance.ts`): WagonWise's own costs, standing until changed or stopped (`planChange` splits a later change so earlier months keep their amount; `planStop` ends it the month before). The report (`GET /staff/billing/finance?month=`) sets twelve months of invoiced and received revenue (issued and paid invoices only) against the costs in force, with revenue by company and a look ahead. Admin only.

## Maintenance

`apps/core/src/modules/maintenance`: the things that fall due on a company's vehicles, which each firm names itself.

- **What it tracks** (`maintenance.item_types`, migration 0050): a name, an interval (days, weeks or months), a warning period, and
  all vehicles or chosen ones; archived rather than deleted. `domain/maintenance.ts` has `STARTER_ITEMS` (examples, not a standard).
- **Dates** (`maintenance.schedules`, `history`): when each item is next due on each vehicle. `markDone` records the work and moves
  the date on (`addInterval`; a month that lacks the day uses its last day); `setDueDate` enters or corrects one. `buildOverview`
  orders everything: overdue, due soon, no date, fine.
- **Permissions:** `manage_maintenance` changes anything; `manage_fleet`, `dispatch` and `view_reports` read. The migration gave the
  new privilege to every account that could manage users or vehicles.
- **Dashboard:** Maintenance page (what is due, and what the firm tracks) and a panel per vehicle on Vehicle profiles. Advisory only. **By vehicle (2026-11-03):** "What is due" is a line per vehicle (`lib/maintenance-by-vehicle.ts` groups the overview rows: worst status, counts, the most urgent item), with filters Needs attention / Overdue / All and counts; a vehicle opens in place (`DataTable` `expandedKey` + `renderDetail`) to its items, which `VehicleMaintenance` shows without its frame. There the date is edited where it stands (Save appears once changed), **Done today** is one press (`markDone` with today, next date by the usual interval), and "Done on another day" keeps the old form. No server change.
- **Reminders** (migration 0051; `domain/reminders.ts`, `application/reminders.ts`): an hourly task emails each person with `manage_maintenance` once a day from 7am UK, if something is overdue or due soon; they choose email or portal-only on the Maintenance page. The day is claimed in `reminder_log` before sending and released on failure. The people to tell are passed in (gathered with `companies.listFleetContacts`) because the run uses one data scope. Text messages are not offered yet.
- **Repairs** (migration 0052; `domain/repair.ts`, `application/repairs.ts`): a defect booked for fixing with a due date. Booking marks the defect seen; finishing can mark it fixed (releasing a held-back vehicle). The defect is reached only through the `DefectDirectory` port, filled in `compose-core.ts` from the checks facade (`findDefect`, `setDefectStatus`). One open repair per defect.
- **Import** (`application/import.ts`): sets next-due dates in bulk by registration and item name, row by row; the CSV is read in the dashboard (`lib/maintenance-import.ts`).
- **MOT and tax lookup** (`application/lookup.ts`, `domain/vehicle-lookup.ts`, `infrastructure/dvla-vehicle-enquiry.ts`): `POST /staff/maintenance/vehicles/:vehicleId/lookup` asks the DVLA Vehicle Enquiry Service for the vehicle's MOT and road tax dates by registration and matches them to the firm's own items by name (MOT, annual test; road tax, tax, VED). It saves nothing: the portal shows the dates and "Fill in these dates" uses the usual set-due-date call. Needs `manage_maintenance`. On when either source is set up (`vehicleLookupFor` in `compose-core.ts`): DVSA's MOT history API (`infrastructure/dvsa-mot-history.ts`: signs in with a client id and secret, keeps the hour-long token, sends the API key; takes the expiry of the latest passed test; includes HGVs, trailers and buses from 2018) for the MOT or annual test, and/or DVLA's vehicle record for the road tax; with both, `CombinedVehicleLookup` takes the MOT from DVSA and the tax from DVLA, so one being down does not spoil the other (`NotConfiguredVehicleLookup` with neither); the vehicle page response carries `lookupAvailable` so the button is hidden when off. DVSA says its history covers HGVs, but a real lorry's annual test record has not been tried: do that before telling customers. Tried on a car on 2026-10-23: expiry 2027-07-11, valid.
- **Check all vehicles** (`application/fleet-lookup.ts`): `POST /staff/maintenance/companies/:companyId/lookup` looks up every vehicle with a registration (three at a time, at most 60 a press; the rest are counted, not dropped quietly) and returns, per vehicle, what would change on the firm's MOT and tax items. It saves nothing. The portal's Maintenance page shows it as a list with a tick per change (all ticked to start), and "Fill in N selected" sends the ticked dates through the existing bulk import (`POST .../import`), so there is no new write path. `GET /staff/maintenance/lookup-status` says whether lookup is on, so the button is hidden when it is not. A manager presses it: nothing runs by itself, which is what the DVSA application said (one lookup per press, nothing in bulk or in the background). Needs `manage_maintenance`.
- **Text reminders (2026-10-26; migration 0078):** a company chooses how its reminders go (**Email**, **Text message** or **Both**) in "How your company is reminded" on the Maintenance page (`CompanyReminders`; `GET/PUT /staff/maintenance/companies/:companyId/reminder-settings`, needs `manage_maintenance`; `maintenance.reminder_settings`, email until chosen). Each person who books still chooses whether to be reminded at all ("Only show it in the portal" means no message of any kind), and adds their own UK mobile in "Your reminders" (`PUT /staff/maintenance/my-reminders` with `mobile`; saved as `+447...` in `reminder_preferences.mobile`; a landline or a non-UK number is refused with `InvalidMobile`; empty removes it). The run (`sendDueReminders`) sends one short text (under 160 characters: how many overdue and due soon, the company, "open the portal"), through `identity.sendText` (ClickSend, the sign-in account; `ClickSendTextSender`) by composition. **Nobody is missed:** a person with no mobile, a failed text, no text account (`canSendText` false), or a company past its **monthly limit of 100 texts** (`REMINDER_TEXTS_PER_MONTH`, counted per UK calendar month in `reminder_text_counts`) gets the email instead; **Both** sends both. One reminder a person a day whichever way. The page shows "N of 100 texts used this month" and warns when texts are not set up. The mobile is used for nothing else.

## Costing

`apps/core/src/modules/costing`: what a company's vehicles cost to run. First fuel (migration 0056); wages, running costs and the cost of a job build on it.

- **Fuel** (`application/fuel.ts`): `importFuel` checks each row (`domain/fuel.ts`), skips what is already held (`dedupeKeys`: the moment, registration, amount, litres and description, plus which of identical rows it is), matches each purchase to a vehicle by registration through the `VehicleDirectory` port (composition over `fleet`), and keeps a purchase that matches none (`vehicle_id` null). `rematchFuel` and `assignVehicle` fix those later; `undoImport` deletes an import and its purchases (`on delete cascade`).
- **Reading** (`listFuel`): totals by vehicle (`summariseByVehicle`: spend, litres, and pence a litre over purchases that gave litres), for a period given as two instants.
- **Who:** `manage_fleet` (or WagonWise) imports, matches and undoes; `view_reports` can also read. A dispatcher alone cannot.
- **Running costs and driver rates** (migration 0057; `domain/inputs.ts`, `application/inputs.ts`): a running cost is a monthly amount from a month until a month (or for ever), for a vehicle or, with none, the firm (an overhead). `planChange` updates in place from the first month and otherwise closes the old row the month before and starts a new one; `planStop` ends it the month before, or removes it if stopped from its first month. A driver rate applies from a day until the next one (`rateOn`). Only `manage_billing` (or WagonWise) reads or changes either. The drivers come from `fleet` and `identity` through the `DriverDirectory` port.
- **Job profit** (`domain/job-costs.ts`, `application/job-cost-report.ts`): `buildCostReport` for a UK month. `allocate` shares a cost across weights to the penny. Wages are hours at `rateOn` the delivery day; fuel and a vehicle's running costs are shared across its jobs by time (equally if none has any time); overheads and costs of vehicles with no job are reported, not put on a job; missing prices, rates, drivers and vehicles are noted, never guessed. Jobs come through the `JobDirectory` port. Needs `manage_billing`.
- **Outlook** (`domain/outlook.ts`, `application/outlook.ts`): `outlook` builds six months of actuals with `buildCostReport` (one read of the jobs, fuel, costs and rates for the whole stretch) and `buildOutlook` adds a three-month forecast: revenue, wages and fuel are the average of the last three complete months that had jobs; running costs and overheads are what is already entered for each month ahead (`isActiveIn`). No forecast without a complete month of jobs. The what-if sliders are in the dashboard (`lib/outlook.ts`) and save nothing.
- **Dashboard:** `pages/fleet/Fuel.tsx` and `lib/fuel-import.ts` (the CSV is read in the browser; the column choice is remembered per company in `localStorage`).

## Job notifications

`apps/core/src/modules/jobs`: telling a driver a job is theirs, and letting the office see and repeat it.

- **Sending** (`application/job-notices.ts`): `assignJob` takes an `announce` hook; the module fills it with `sendAssignmentNotice`, which asks a `DriverNotifier` (a port; composition builds `ExpoDriverNotifier` over `identity.getPushTokensForDriver`, or a test passes a fake as `overrides.driverNotifier`) and records the result. It never throws.
- **Recording** (migration 0053, columns on `jobs.jobs`, read and written by `PostgresJobNoticeRepository`, not through the `Job` aggregate): `notice_result` (`sent`, `no_device`, `failed`), `notice_devices`, `notice_attempts`, `notice_at`, `seen_at`. The first `GET /jobs/current` the driver makes while the job is still `assigned` sets `seen_at`.
- **Office:** `GET /staff/jobs/companies/:companyId/notices` (anyone in the company) and `POST /staff/jobs/:id/resend-notice` (`dispatch`; refused with 409 once the job is not `assigned`).
- **Driver app:** `use-reroute-notifications.ts` also handles `data.type === 'job_assigned'` (`lib/job-notification.ts`): refresh the current job, and open the Jobs tab on a tap.

## Driver hours sharing

The shared status also carries optional `breakMin`, `stretchMin` and `untilLimitMin` (migration 0059) so the dashboard's live map can put a sharing driver's breaks into their ETA (`lib/breaks-in-journey.ts`, mirroring the driver app's `planBreak`).

`apps/core/src/modules/hours`: a driver can share their live driving-hours status with a company they drive for. See `driver-hours-consent.md` for the wording and rules.

- **Tables** (migration 0054): `hours.settings` (the firm's switch, off by default), `hours.sharing` (a row while a driver shares with a company, with the wording version agreed to), `hours.status` (the latest status per driver and company).
- **The rule** (`application/hours.ts`): `reportStatus` stores nothing unless the driver is on a job (`ActiveJobs`, over `jobs`), the firm's switch is on and the driver is sharing; the company is the job's, never the phone's. `listStatuses` shows only sharing drivers who are on a job now and updated within 12 hours, and nothing at all when the firm's switch is off.
- **Removal:** stopping removes that company's status; the firm switching off removes the company's; finishing a shift (`DELETE /hours/status`) removes the driver's; account deletion removes it all (`eraseDriverData`, in the identity eraser); the hourly `prune-hours-status` task deletes anything 12 hours old.
- **Routes:** staff `GET/PUT /staff/hours/companies/:companyId/settings` (read: company staff; change: `manage_fleet`), `GET /staff/hours/companies/:companyId/status`; driver `GET /hours/sharing`, `PUT /hours/sharing/:companyId`, `PUT /hours/status`, `DELETE /hours/status`.
- **Driver app:** `state/hours-sharing-store.ts`, `hooks/use-share-hours.ts` (sends on change and every minute), `lib/hours-share.ts` (the payload and the consent wording), the Share section of the Driving hours screen, and a chip on the trip screen.

## SOS (2026-10-25)

`apps/core/src/modules/sos` (migration 0077, `sos.alerts`): a driver presses and holds a red button and the companies they drive for are told where they are. **WagonWise does not contact the emergency services, and the app says so on the SOS screen, next to a Call 999 button that is always there.**

- **Driver app:** a red **SOS** round button on the home map's button column and the trip screen's. It only opens the sheet (`components/sos-sheet.tsx`); nothing is sent until the driver **holds the red button for two seconds** inside it (a stray tap or a pocket cannot send it). Then the sheet shows the three words big with the nearest town (the position as numbers if what3words did not answer), who was told, **Call 999**, and **It was a mistake, or I'm all right** (cancels and tells the office). If it cannot reach WagonWise it says nobody was told, shows the position to read out, and offers Try again (same request id, so the office is never told twice).
- **Who is told** (`composition`, `situations.forDriver`): a driver on a job tells that job's company, with the vehicle (name and registration) and the job reference, if they are still an active member of it; otherwise every company they are an active member of. **A driver with no company stores and sends nothing**: the sheet just shows their three words to read out.
- **What the office gets:** one `sos.alerts` row per company with a copy of the driver's name, how they sign in (the number or email, to ring them), the vehicle, the job, the position, the three words and nearest town, and the time; an **email** to the company's dispatchers (everyone it has if none dispatch, so it never goes nowhere); and a **red strip above every portal page** (`SosBanner`, checked every 15 seconds while the portal is open) with the same, a map link, a link to ring the driver, and **Dealt with** for anyone who can dispatch. A cancel sends a follow-up email and takes the strip away. A failed email never fails the SOS: the alert is stored and shows in the portal.
- **The three words** are looked up with a 3-second limit (`what3words.wordsFor`, through composition); late or failed, the alert goes with the position only.
- **Routes:** driver `POST /sos/raise`, `POST /sos/cancel` (forwarded by the driver BFF); staff `GET /staff/sos?status=open|all`, `POST /staff/sos/:id/resolve` (forwarded by the staff BFF; list: any of the company's staff, resolve: `dispatch`; WagonWise staff have no company here and are not offered them).
- **Data:** row-level security: a company's staff and WagonWise see the company's rows; a driver sees and changes only their own, and can only add one for a company they are an active member of. Closed (resolved or cancelled) alerts are deleted after `JOB_POSITION_RETENTION_DAYS` (30) by `prune-closed-sos`; open ones stay until dealt with; account deletion removes a driver's alerts.
- **Not done:** an SMS to the office (core already has ClickSend for sign-in codes, so it is possible), resending the position while an SOS is open, and a driver-side "alerts you have sent" list.

## what3words (2026-10-25)

`what3words` module in core (`W3W_API_KEY`, optional, core only; unset means every lookup is `LookupUnavailable` and the app says it is not available). Two driver routes, forwarded by the driver BFF: `POST /what3words/to-location` (`{ words }` to `{ words, location, nearestPlace, country }`) and `POST /what3words/to-words` (`{ location }` to the same). Errors are tagged and have their own status: `InvalidWords` 400 (not exactly three words, checked before any lookup), `WordsNotFound` 404 (what3words' `BadWords`), `LookupUnavailable` 503 (no key, a refused key, the monthly allowance used up, an outage; logged once as `what3words lookup failed`). `parseWords` accepts `///Filled Count Soap`, `filled,count,soap` and so on and gives `filled.count.soap`.

- **No typeahead, no caching, no storage.** The Basic plan is 1,000 lookups a month, so the app looks up only when the driver taps Find (a mutation, never a query that refetches), and the module keeps nothing. what3words' autosuggest is not used.
- **Driver app:** _Where to?_ has a third way to set the destination, **3 words** (`WordsSearchField`): type, tap Find, and the destination is set with the nearest town beside it so a wrong word is plain to see.
- **Portal job form (2026-10-26):** each stop has a third location choice, **Three words** (`WordsField`, `hooks/use-words.ts`, `lib/words.ts`): name the stop, type the words (`///Filled Count Soap`, commas and spaces all work), press **Find** (one lookup; the answer is cached for the session, so Create job does not look up again) and the spot is shown with the nearest town. The job's stop gets that location and `///words` as its note, so the driver sees the words; **Save this location for next time** stores it with the words as its note. Core route `POST /staff/what3words/to-location` (any signed-in staff account; same answers and statuses as the driver's), forwarded by the staff BFF.
- Other modules use it through composition (`wordsFor(point)`, `locationOf(words)`), not by importing it (AGENTS.md rule 7). SOS uses `wordsFor`.
- Not done: _From_ by three words on the driver app's Where to?.

## Fuel prices (GOV.UK Fuel Finder) (2026-10-27)

`fuelprices` module in core: a client for the government's Fuel Finder public API and a use case that joins its two lists. **Our own copy, refreshed by a job (2026-10-27, migration 0079):** `fuelprices.stations`, `fuelprices.prices` and a one-row `fuelprices.refreshes`. **Drivers read it through `POST /fuel/nearby`** (2026-10-28, below), and the driver app shows it (2026-10-29, below). Settings (core only, never the BFFs or apps): `FUEL_FINDER_ID` and `FUEL_FINDER_SECRET`, **both or neither** (one alone stops the boot, naming the missing one), and `FUEL_FINDER_URL` (defaults to the live service; the test service is `https://test.fuel-finder.service.gov.uk/api/v1` and needs its own credentials). They come from the Fuel Finder developer portal (GOV.UK One Login). `FUEL_REFRESH_INTERVAL_MS` is how often the copy is replaced (default hourly, never under 10 minutes). Unset credentials: `refresh()` is `FuelSourceUnavailable`, no request is made and the job does not start.

- **The API, as checked live on 2026-10-27** (the official docs print none of these addresses; their `api.fuelfinder.service.gov.uk` example does not exist). Token: `POST {base}/oauth/generate_access_token`, form body `grant_type=client_credentials`, `client_id`, `client_secret`, `scope=fuelfinder.read`; the answer is `{ success, data: { access_token, expires_in, ... } }` and the token lasts an hour. Stations: `GET {base}/pfs?batch-number=N`. Prices: `GET {base}/pfs/fuel-prices?batch-number=N`. Both are a plain JSON array of 500 per batch from 1, ending with a 404 (about 17 batches, roughly 8,000 stations). **The two lists do not line up batch for batch**, so they are joined on `node_id`.
- **Limits:** 100 requests a minute and one at a time. The client sends one request at a time, at least 700 ms apart, waits out a 429 (`Retry-After`, up to three times) and renews a refused token once. A full refresh is about 34 requests.
- **Data:** stations have a name, brand, address, `latitude`/`longitude`, motorway and supermarket flags, closures and amenities. Fuels are `E10`, `E5`, `B7_STANDARD`, `B7_PREMIUM`, `B10`, `HVO` (**in capitals**; the docs show `B7_Standard`). Diesel for a lorry is `B7_STANDARD`. Prices are **pence per litre** (198.9 is £1.989). Many stations report rarely (785 of about 1,800 prices in one batch were over a week old), so anything shown must carry the price's age.
- **Cleaning:** a station with no position, or one outside the UK's bounding box, is dropped; so is a price for a grade we do not know, one outside 50 to 500 p (a retailer who typed pounds), or one with no readable date. **What is dropped is counted (2026-11-06):** `PriceTally` in the client tallies each price entry once, under the first reason it failed (unknown grade, implausible amount, no readable date), and names the unknown grades (top 10). `FuelSource.lastDroppedPrices()` returns the last fetch's counts, `refreshFuelPrices` passes them in its summary (`dropped`), and the refresh task logs them with the station and price counts, so "the retailer never sent diesel" can be told from "we dropped it". Prices for a station we never saw are dropped, and a repeated station and fuel keeps the newest price.
- **All or nothing:** any failure part-way (a refused sign-in, an outage, a batch that is not a list, no first batch) returns `FuelSourceUnavailable` and reports once through `onProblem`, never half the country. The secret is sent only in the token request body: not in a URL, a header or a log line.
- **The copy and the job:** `refresh-fuel-prices` is a periodic task in core (`PeriodicTasks`), run once at boot and then every `FUEL_REFRESH_INTERVAL_MS`, and only when both credentials are set. A refresh takes about 30 to 45 seconds and ends in one transaction: stations are upserted and the ones Fuel Finder no longer lists are deleted (their prices go with them, `on delete cascade`); prices are emptied and refilled; `refreshes` records when and how many. A reader sees the old copy until the commit and the new one after it, and a failure part-way leaves the old copy as it was. Stations carry `location geography(Point, 4326)` with a GiST index (`ST_DWithin`, in metres, as parking and cameras), and prices are `numeric(5,1)` pence per litre with `updated_at` (when the retailer reported it) beside an index on `(fuel_type, pence_per_litre)`.
- **Safeguards:** a refresh is refused (`SnapshotTooSmall`, logged as a warning, the last copy stays) when the answer has fewer than 500 stations or under half as many as are stored, since stations do not vanish by half between two refreshes; a failed fetch is refused the same way. **Prices are never deleted for being old**: the reader shows the age (`updated_at`) and decides. There is no company in these tables, so no row-level policy; the app role (what core runs as) can read and write the schema (migration 0079 grants it, and a test uses `set role wagonwise_app` to prove it).
- **Cheapest fuel near a point (2026-10-28):** `POST /fuel/nearby` (`fuelprices/interface/routes.ts`; core, forwarded unchanged by the driver BFF's `fuel-routes.ts`; the `/fuel/` prefix is behind the driver sign-in; contract `@wagonwise/contracts/fuel`). Body `{ centre, radiusM (up to 50 km), fuelType (default B7_STANDARD, the lorry grade), maxAgeDays?, limit (default 20, up to 50) }`; answer `{ fuelType, stations, withoutPrice, refreshedAt? }`, **cheapest first, nearer first on a tie**, each with its price in pence per litre, `priceUpdatedAt` (when the retailer reported it: the app must show the age), straight-line `distanceM`, address, brand, amenities and the motorway and supermarket flags. It reads our copy only; no request reaches Fuel Finder. Closed stations are never listed. **Typing slips are left out:** a price under 60% of the national median for that fuel (`MIN_SHARE_OF_MEDIAN`; the lowest real diesel seen was 72% of it) is dropped, because a cheapest-first list would send a driver to the one station whose retailer mistyped. High prices need no guard. **Old prices stay** unless the request sets `maxAgeDays`, since roughly a third of stations report rarely; deciding a default cut-off is an app choice. The median is a second small query (`percentile_cont` over about 8,000 rows) per request. **Stations with no usable price (2026-11-06):** `withoutPrice` lists, nearest first and at most 10 (`MAX_UNPRICED_FUEL_STATIONS`), the open stations in range that have no price for the fuel that passed the same two tests (`not exists` over `prices` with the typing-slip floor and the `maxAgeDays` cut-off), so a station that sells both fuels but has reported only one (or reported the other long ago) is shown as there, with no number, instead of missing. It never overlaps `stations`. Each is a station with no `pencePerLitre` or `priceUpdatedAt`; the field defaults to an empty list in the contract, so an app and a core that differ in version still work.
- **In the driver app (2026-10-29):** three pieces, all JavaScript (no native change, so they can go over the air). (1) **Map markers** on the home map, a dark slate square with a pump (`route-map.tsx` `fuelStations`, colour in `components/fuel-colour.ts`), the cheapest 50 diesel prices within the view, with a **Fuel** switch in the layers panel; a tap opens `FuelStationDrawer`. (2) **A list**, `app/nearby-fuel.tsx`, from the pump button on the home map: 30 km, 20 stations, **Cheapest or Closest** first (sorted on the phone, `lib/fuel-details.ts` `sortFuel`), the cheapest marked. (3) **Take me there** on both the drawer and every list row, through `useNavigateToPlace` (plans from the phone's position with the driving profile and opens the trip screen, as for parking). **Diesel or Petrol** (2026-10-31): one choice saved on the phone (`state/fuel-choice-store.ts`, default diesel), switched on the list screen and under the Fuel row of the map's layers panel (`components/fuel-choice-switch.tsx`), so the list, the pins and the drawer always show the same fuel. Diesel is `B7_STANDARD`, petrol is `E10` (`fuelTypeFor` in `lib/fuel-details.ts`); no server change, since the route already took any grade. **Prices reported in the last 30 days are asked for** (`FUEL_MAX_AGE_DAYS`; it was 7 days, the owner's decision of 2026-10-29, changed on 2026-11-06 after a station that had reported petrol this week and diesel ten days ago showed petrol and no diesel). Every price shows **when it was reported** ("Updated 3 hours ago", "Updated yesterday"), and one over a week old (`FUEL_STALE_AFTER_DAYS`) also says **May be out of date** (amber, on the list row and the drawer). **Nearby stations with no usable price** (`withoutPrice`) are listed under the priced ones as "No recent diesel price reported" with their distance, and the driver can still take me there; if none nearby has a price the screen says so and shows them alone. Each screen carries the source line and a note that Fuel Finder does not say whether a lorry fits the forecourt (it has no height, width or turning data, so the driver checks the entrance). Distance is straight-line; there are no drive times (parking times its five nearest by road; fuel does not yet). The query repeats every 10 minutes, since the server copy changes hourly. `POST /fuel/nearby 401` is in `.github/release/api-checks.txt`, so an over-the-air update waits for core to be deployed with the route.
- **One core instance:** Fuel Finder allows one request at a time per client, so two core instances refreshing together would collide. Today there is one; if core is ever scaled the task must run on one instance only.
- **Checked live (2026-10-27):** a real refresh into a fresh PostGIS stored 8,146 stations and 26,529 prices in about 30 seconds with no problems, a second refresh replaced them cleanly, and "cheapest diesel within 25 km of Hexham" used the spatial index.
- **Not confirmed:** the data licence and terms of use (only a general Open Government Licence line was found) and the test service's behaviour. Read the portal's terms before the prices appear in a product.

## Road and lane closures (National Highways) (2026-11-01)

`apps/core/src/modules/closures`: closures on the strategic road network (motorways and major A roads, **not** local roads),
copied from National Highways' Road and Lane Closures feed (v2.0, DATEX II 3.4, `GET https://api.data.nationalhighways.co.uk/roads/v2.0/closures`,
key in the `Ocp-Apim-Subscription-Key` header). Same shape as fuel prices: a job in core replaces our whole copy
(`closures.closures`, migration 0083) every ten minutes, and nothing a driver does ever reaches National Highways.

- **The feed:** one ~10 MB XML file rebuilt on every request (about 1.2 s; no ETag or Last-Modified, so it cannot be fetched "only if
  changed"); limit 10 requests a minute per key. Each record has the road, a direction, a line of lat/lon points, a start and an end
  (the whole window of the scheme, not which nights inside it), a status (`active`, `planned`, `suspended`), National Highways' own
  wording and a cause. `infrastructure/datex-closures-parser.ts` finds values by tag name, since the nesting varies from record to record.
- **What is kept:** `full` closures (`roadOrCarriagewayOrLaneManagementType` is `carriagewayClosures`: a whole carriageway, slip road or
  link road; always kept) and `lane` closures (lanes or the hard shoulder shut) only when they last 3 days or less
  (`MAX_LANE_CLOSURE_DAYS`; about half the feed's lane closures run for weeks to years and would bury the rest). Narrowed lanes, speed
  limits and records with no window or no line are dropped. On 2026-11-01 that was 350 of 500 records (222 full, 128 lane; 20 active).
  Full closures are mostly overnight (median about 10 hours).
- **Refresh:** `NationalHighwaysClient` tries the primary key and, if the service refuses it (401/403), the secondary. A failed fetch
  keeps the last copy; so does an empty answer when 10 or more are stored. Off unless `NATIONAL_HIGHWAYS_PRIMARY_KEY` is set.
- **API:** `POST /closures/nearby` `{ centre, radiusM (up to 50 km), withinDays (default 7), limit (default 50) }` (driver sign-in; the
  driver BFF forwards it). Matches by the closure's **line**, not its marker, so a long closure is near anyone along it. In force first,
  then the soonest to start. Suspended (paused) closures are never sent. Each answer carries when the copy was made.
- **App:** a hard-hat marker on the home map, red when the whole road is shut and amber when lanes are, under the "Road closures" layer;
  a tap opens `ClosureDrawer`: what National Highways says, what is shut, when (in force: until when and how long is left; planned: when
  it starts, ends and how long it lasts, in UK time), and the credit. A window over 48 hours carries a note that the road is not
  necessarily shut all of it. "In force now" follows National Highways' own status, not the dates.
- **Licence** (National Highways Transport Data Feeds Licence, based on OGL v2.0): commercial use allowed; the credit "Powered by National
  Highways' Transport Data Feeds" must be shown (the drawer does); free for now, with at least six months' notice before any charge;
  scraping is banned, and one request every ten minutes through the official API is the intended use.
- **Along a planned route (stage 2, 2026-11-02):** `POST /closures/along-route` `{ corridor (the decoded route line, up to 2000 points, as for
hazards), withinHours (default 48, max 168), limit (default 100) }`. Core only finds **candidates**: closures whose line comes within
  40 m of the route's line (`ROUTE_CANDIDATE_M`), not ended and starting within the look-ahead, each with its `lines`. The app decides which the
  route really runs along and when it gets there (`lib/closures-on-route.ts`; the driver can change the departure time, so the geometry is
  worked out once per route and only the timing again):
  - **Which carriageway.** The feed's lines are short chained pieces, each drawn in the direction of travel (the compass word in
    `direction` is not reliable: an "eastBound" slip road is described as northbound). A piece of closure matches the route if some
    segment of the route is within 25 m of it **and heads the same way, within 45 degrees**. The other carriageway is only about 30 m away, so
    distance alone cannot tell them apart; the heading does, and a road that crosses the route is turned well past 45 degrees.
  - **A slip road the route only passes.** A route on the main carriageway runs beside the start of a slip road with the same heading. A
    closure under 700 m (a slip or link road) counts only if the route runs along 80% of it, i.e. takes it; a longer one (a carriageway) if the
    route runs along at least 300 m of it, since a route that joins or leaves part-way still drives on the shut road.
  - **When.** The time to a point is taken in proportion to the distance. A closure counts if it is in force at any time from 30 minutes (and
    a tenth of the drive so far) before the driver reaches it to the same after they pass it. A window over 48 hours is "may be closed".
  - Checked on 2026-11-02 against real data: a real OpenStreetMap route (public OSRM) along the M56 eastbound matched the real closure and the
    westbound route did not; an M3 route passing 7 m from a closed slip road did not match, one that takes the slip road did.
  - **Screen:** the route overview has a "Road closures" part (only once closures have been fetched, so "None found" is never said about
    something nobody checked): up to two closures with a headline, "Closed until … · you reach it about …", and a tap for the drawer, hard-hat
    markers on the route map, and a red note when the route still goes through a whole road that is shut (stage 3 below goes round them first, so the note is for when it
    could not, or the driver set off later than the plan assumed).
- **Routing round full closures (stage 3, 2026-11-02):** `planRoute` (`routing/application/plan-route.ts`) goes round a closed road when there is a way. After the first route (and
  the hazard pass, if any) it asks `ClosureAvoidanceQuery` (routing's own port; the adapter wraps `closures.findAlongRoute`, the same candidate query as `/closures/along-route`)
  for closures along the route, works out which the route really runs along and which are shut when the driver would get there, and plans again with avoid zones. Going round one
  can lead through another, so it looks again at the new route, at most twice. **The matching is in core now as well as in the app** (`routing/domain/closure-on-route.ts`, the same
  rules and constants as `apps/driver-app/src/lib/closures-on-route.ts`; change both together or the screen and the route will disagree). What is avoided: `full` closures only (a lane
  closure leaves the road open) and not a scheme with a window over 48 hours (the road may be open: that is left to the warning). The time is when the plan is made (leaving now),
  with the same margins as the screen.
  - **The avoid zones** (`routing/domain/closure-avoid-zones.ts`) are thin boxes (10 m long, 6 m wide) laid along **the route's own line**, at the places it runs along the closure,
    every 100 m, and not within 60 m of either end. Not along National Highways' line: that is not exact enough to hit one carriageway when the other is 12 to 30 m away, while the
    route's line is the router's own road, so a zone on it is on the carriageway the route uses. Valhalla drops a whole road between two junctions that a zone touches, in both
    directions, so a zone on the other carriageway would shut the wrong one.
  - **Checked against real Valhalla** (2026-11-02, the local Northumberland tiles; `closure-avoidance.golden-test.ts`, part of `pnpm test:golden`): on the A1 north of Newcastle
    (carriageways 12 to 16 m apart) zones on the northbound carriageway sent the northbound route round and left the southbound route exactly as it was, with zones from 6 to 16 m
    wide. On the slip road off the A1 at Morpeth, zones within 20 m of its ends also shut the A1 itself, so the end inset: 40 m was enough, 60 is used.
  - **It never fails a plan.** If there is no way round (the router finds no route), the plan keeps the route through the closure and the screen's red note says so; a route that still
    runs along a closure is not said to have avoided it. When it did go round, the plan's `avoidedRestrictions` has "Road closure avoided: <National Highways' wording>", shown under
    "Restrictions avoided".
  - **Limits.** Valhalla refuses avoid areas with more than 10 km of edge in all, so closures get at most 100 zones between them (a zone has 32 m of edge, and hazards use some too),
    and one closure at most 40. The zone is flat, so a road that crosses over a closed motorway on a bridge, right at a zone, is shut too (rare: a zone is 10 m long). A driver who
    changes the departure time on the route screen is **not** planned again: the route is as made for leaving now, and the screen's own check (which does follow the time) warns if it
    goes through a closure at the new time. The faster-route offer (`check-faster-route`) refuses an alternative that goes through a shut road. The hazard-triggered reroute
    (`detect-reroute`) does not look at closures.

## Hazards from OpenStreetMap

`hazards.reports.source = 'osm'` marks the one-off starting set (migration 0072, from `apps/core/scripts/fetch-osm-hazards.mjs`; the rules for what is taken are at the top of that script). Each row has an `osm_id` (unique where set), the import reporter id, a measurement and no expiry. `findAwaitingReview` skips `osm` rows (a first-time import must not flood the moderation queue), and `hazards/api.ts` `findAvoidanceCandidates` skips the ones mapped on a road, because routing already reads those limits from the same OpenStreetMap data. **The 353 mapped as a point are passed to routing (2026-11-13):** Valhalla takes `maxheight` from ways only, so nothing else kept a lorry from under them. Each goes with `onRoadPoint`, and routing (`isOnRoute` in `routing/domain/reported-obstruction.ts`, used by the avoidance adapter) counts it only when the route's own line has that point within 3 m: the road under the bridge has it, a road crossing over does not. If the engine ever thinned its route line the point would be missed and the bridge only warned about, as before; this was not checked against the live router. Everything else treats them as ordinary hazards (map, spoken warnings, the route's hazard list, confirm and dismiss). © OpenStreetMap contributors (ODbL): the driver hazard card and the portal's Hazard reports page credit it.

## Tester sign-up (landing page)

`sites/landing/index.html` is a plain static page served at wagon-wise.co.uk (and www) by the DO `landing` static site. Its form
posts to `/signups` on the same host; the app-spec ingress sends `/signups` on those hosts to driver-bff (`signups-routes.ts`,
public, validates and forwards) and on to core's `signups` module (`POST /signups`, `POST /signups/remove`, and staff-only
`GET /staff/signups`, `DELETE /staff/signups/:id`). Table `signups.testers` is readable only in the platform scope. Honeypot
field `website`, daily cap 500. The dashboard's Testers page (`/admin/testers`) lists and exports it, and sends the standard test
invite: `POST /staff/signups/invite` (platform staff only; up to 50 ids and the Play opt-in link) makes a fresh `identity` invite code
per person (composition passes `identity.newInviteCode`/`sendEmail` in as the module's `invites` port), emails the text in
`signups/domain/invite-email.ts`, then records `invited_at`/`invite_code` (migration 0068). Someone already invited is skipped; a
failed email leaves them uninvited so it can be retried. The opt-in link is typed on the page and kept in that browser only.

The "out now" email (2026-11-01): once the app is in both stores, the same page has a second section that sends `signups/domain/launch-email.ts` (subject "WagonWise is out now on iPhone and Android") to the ticked testers: `POST /staff/signups/launch-email` (platform staff only; up to 50 ids, an App Store link and a Google Play link, both https only), then records `launch_emailed_at` (migration 0080). It is the first **HTML email** here: the mailer (`ResendMailer`, `identity.sendEmail(to, subject, text, html?)`) sends an optional `html` beside the plain text, which stays as the fallback. The HTML is table-based with inline styles (what mail apps and Outlook draw reliably), in the landing page's navy, blue and green, with the logo from `https://wagon-wise.co.uk/img/icon-192.png` (so that file must stay), a button for each store with its white mark beside it (`sites/landing/img/store-apple.png` and `store-play.png`, PNGs because mail apps do not draw SVG, so they too must stay on the site and need a landing deploy), three feature lines, and a footer saying why they got it, how to come off the list, and the company address. Anything typed (name, links) is escaped. It makes no invite code, someone already sent it is skipped, a failed send leaves them unmarked so it can be retried, and the invite and "out now" emails are independent (anyone can be sent either). The Google Play link is pre-filled from the package name (`com.wagonwise.driverapp`); the App Store link needs Apple's number for the app, so it is pasted (both kept in that browser only). The consent on the landing page is "emailing me about testing the app", so the email says it is the last one about testing.

Mistyped emails (2026-11-09): bounced sign-up emails (`name@gmail.comg`, `smith.ci.uk`) passed the old "has an @ and a dot" check. `packages/contracts/src/email-check.ts` (`checkEmail`) now answers `ok`, `suggest` (a likely slip such as gmial.com, gmail.co.uk, smith.ci.uk, .cm: ask "Did you mean…?" and let the person keep it) or `impossible` (an ending that is not in IANA's list, e.g. .comg or .con, with the likely fix when there is one). The landing pages ask before sending (`sites/landing/email-fix.js`, using `email-check.js`, a copy of the TypeScript made by `node sites/make-email-check.mjs`; a contracts test runs the same addresses through both); the driver app asks on sign-up, add email and code-only sign-in (`components/sign-in/use-email-review.tsx`); core turns away only `impossible` (`signUp`, `requestSignupCode`, `requestOtp`, `requestEmailAddition`), as `InvalidSignup`/`InvalidIdentifier`. The TLD list is a snapshot (version 2026110900): refresh it from https://data.iana.org/TLD/tlds-alpha-by-domain.txt now and then, then regenerate the landing copy. The same-provider list (gmail, hotmail…) is in the same file.

Search and sharing (2026-10-19): the page has a canonical address, Open Graph and Twitter tags, JSON-LD (organisation, website, software application, FAQ) and a visible FAQ whose text is the same as the FAQ in the JSON-LD (Google expects the two to match, so when one is edited change the other by hand). `robots.txt` and `sitemap.xml` sit next to `index.html`. Add a page to `sitemap.xml` when one is added. The share picture is `img/og-image.jpg`, remade with `sites/make-og-image.ps1`.

## App usage (admin)

`apps/core/src/modules/usage`: read-only. `GET /staff/usage` (platform staff only, checked in the route and the use case) runs in
the platform scope and reads counts across identity, companies, fleet, jobs, checks, routing and signups through
`PostgresUsageReader` (the read-model adapter, AGENTS.md rule 7). Dashboard page `/admin/usage`. Real-RLS test:
`composition/usage-end-to-end.test.ts`. **Funnel (2026-11-08):** the report has a `funnel` of different drivers at each stage (account,
signed in, chose a vehicle, planned a route, started a trip, started trips on two or more UK days), read from tables that
already exist, so the app sends nothing extra. Trips are deleted after `ROUTE_RETENTION_DAYS` (30), so the trip stages cover
that period. Counts only, and test accounts are included. **New drivers by day (2026-11-09):** `newDriversByDay` is, for each of the last
14 UK days, how many drivers joined (`identity.drivers.created_at`) and how many of them have chosen a vehicle, planned a route and
started a trip so far. It exists because the running totals in `funnel` move slowly: a day's new drivers are all on one version of the
app, so comparing days before and after a change shows whether it helped. The page leaves out the empty days before the first
driver joined.

## Sales notebook (admin, 2026-11-08)

`apps/core/src/modules/sales` (migration 0084): WagonWise's own list of the haulage firms being approached and a log of each
contact, for platform staff only. Tables `sales.prospects` and `sales.entries`, both readable only in the platform scope (the
same Row-Level Security as `signups.testers`); the dashboard page is `/admin/sales`, under Customers. **It records and sends
nothing:** no email, no message, no call (it can draft an email to copy; see Email drafts below). Routes (all `/staff/sales...`, core checks platform staff in the use case, the BFF
only passes them on): `GET` the whole list with every entry, `POST` and `PUT` and `DELETE /prospects`, `POST /prospects/:id/entries`,
`DELETE /entries/:id`, `POST /import`.

- **Stage** (`sales/domain/sales.ts`): not contacted, contacted, replied, conversation, demo, pilot, paying, then the two that end
  it, not interested and do not contact. A logged contact moves the stage by its result (`stageAfterEntry`): the pipeline only goes
  forward, a "no" or an opt-out always applies, and a firm that said no and then replies is back in. The owner can also set the stage.
- **Do not contact is for good.** A firm in that stage refuses a new entry, a move back, and deletion (`OptedOut`, 409); its other
  details can still be edited, so a phone number can be removed and the record kept as the reminder. The page asks first.
- **A log entry** has a date, how (phone, email, Facebook, in person), what came of it, **the one problem led with** (a short list,
  so the page can show which pitch gets replies) and a note. The firm's next step and its date are saved with the entry and replace
  the old ones. Names are unique in any case, so an import run twice adds nothing the second time.
- **The page's rules live in `dashboard/src/lib/sales.ts`** (pure, tested): the week's counts against the targets (each counts
  firms, not entries; a firm is "contacted" in the week of its first entry); **Do today** (a next step whose day has come, then
  one follow-up seven days after a first message with no reply, never a second); the contact hint on each firm (limited company:
  may email its mailbox, with who you are and an opt-out; sole trader or partnership: phone only; not checked: check Companies
  House first; about 100 lorries or more: wait for the finished product unless introduced); the pitch summary.
- **Import** reads a CSV in the browser (`readFirmsCsv`; columns found by heading, only Name needed; a "Contact details (public)"
  column is split into phone and mailbox) and sends up to 200 rows at a time. The server reads each cell leniently and never
  guesses the kind of business: only "Ltd" or "Limited" makes it a limited company. The firms are the owner's, not in the repo.
- **Email drafts (2026-11-13):** the list has an **Email** column (the firm's company mailbox, saved with Edit details; "Not recorded" when empty), and each open firm has **Draft an email** (`components/SalesEmailDrafts.tsx`, wording and rules in `lib/sales-email.ts`, pure and tested). It writes the first email, a listening invitation, the one-week and one-month follow-ups, and the after-a-demo email from what the firm already holds: who to ask for, the firm name, and the problem last led with (from the latest logged pitch). Every cold email says who you are, how you found them and how to say no; the founding terms are worded as the playbook has them. No draft for a firm in "do not contact" or a sole trader or partnership (the same rules as the contact hint). **Copy** or **Open in my email** (a `mailto:` link, so the owner reads and sends it from their own mail). It still sends nothing and logs nothing; the contact is logged by hand afterwards. The owner's phone number and the "stores are live" tick are remembered in this browser only. The wording is the owner's "Outreach messages" page, ported.
- Tests: `application/sales.test.ts` (in-memory), `composition/sales-end-to-end.test.ts` (real Postgres and RLS), and
  `dashboard/src/lib/sales.test.ts`.

## Audit pack (2026-11-08)

`apps/core/src/modules/audit` (no table of its own): one vehicle's walk-round checks, defects, repairs and maintenance for a period, in one report. `GET /staff/audit/vehicles/:vehicleId?from=&to=` (UK days, both optional: the last twelve months; refused if backwards or longer than 800 days). Dashboard page **Audit pack** under Compliance (`/fleet/audit-pack`): choose a vehicle and a period, read it on screen, **Print or save as PDF** (a new tab built like the invoice, `lib/audit-pack.ts`) or **Download as a spreadsheet** (the timeline, one line per event).

- **Who:** WagonWise staff, and company staff who may read check results (`manage_fleet`, `dispatch` or `view_reports`, the same rule as the Check results page). A company sees its own vehicles only: another company's vehicle is "not found", the same answer as one that does not exist.
- **Read-model adapter** (`PostgresAuditReader`, AGENTS.md rule 7, as `usage` does): reads `checks.checks`, `checks.defects`, `checks.defect_events`, `maintenance.repairs`, `maintenance.schedules`, `maintenance.history` and `maintenance.date_changes` with SQL in the caller's data scope (so Row-Level Security still applies) and returns the module's own types. Dates leave as text (`to_char`) so a day is the same day wherever the server runs; a timestamp is placed in a UK day with `Europe/London`. The vehicle, the driver names and the staff and company names come in as ports filled in `compose-core.ts` (fleet, identity, companies).
- **Names:** the read runs in the caller's scope; the staff and company names are looked up **after** it, because `companies` opens its own data scope and scopes do not nest. A driver is shown the way the portal shows them (name, else the sign-in); a person who has since left the company is "Someone no longer on the account", never a blank or a guess.
- **What is in it** (`domain/audit-pack.ts`, pure): the checks in the period; the defects found in it **and any older one still not fixed** (listed, but counted as "not fixed", not as "found in this period"); each defect with its repair; every maintenance item with where its date stands today; what was done in the period; and everything again as one **timeline**, oldest first.
- **The history behind it (migration 0085).** Every change of a defect's status writes a row to `checks.defect_events` (status, who, when) in the same transaction as the change (`PostgresOfficeCheckRepository.setDefectStatus`), so the pack shows each step: open, seen, fixed, reopened. Every due date entered or corrected by hand writes a row to `maintenance.date_changes` (item name as it was, the date before or none, the new date, who, when) from `setDueDate`, which the spreadsheet import and the MOT and tax fill-in also use; saving the **same** date records nothing, and recording work as done does not (it is in `maintenance.history`, with the next date it set). The migration gave each defect handled before it existed **one** starting row from its latest change, so earlier steps cannot be recovered; a defect with no rows shows its latest change (`statusSteps` in the dashboard, and the same fallback in `buildAuditPack`), and a corrected due date from before is not recorded at all. `REPORT_NOTES` says so on every copy. A check deleted by the firm's retention takes its defects and their history with it (cascade).
- **What it is not:** the notes on every copy say it shows the records as entered and is not a statement that the vehicle or operator meets any legal requirement. Do not describe it to a firm as compliance. **Retention (checked on GOV.UK, 2026-11-08):** DVSA's guide says defect reports and safety inspection records must be kept at least 15 months, so a check that found a defect is kept at least that long whatever the firm sets (see Checks, Retention). A check that found nothing goes at the firm's own choice (12 months unless changed), so a pack cannot show what has gone: its walk-round check list can have gaps for days older than that.
- Tests: `application/audit-pack.test.ts` (permissions, scopes, range, names, timeline), `composition/audit-end-to-end.test.ts` (real Postgres and RLS), `dashboard/src/lib/audit-pack.test.ts` (print page, spreadsheet, escaping, day and time wording). The history is also tested where it is written: `maintenance/application/maintenance.test.ts`, `composition/maintenance-end-to-end.test.ts`, `composition/repairs-end-to-end.test.ts`, and the migration's own backfill statement in `audit-end-to-end.test.ts`. **Days are written with month names set out in the code** (`dayText`, in core and in the dashboard): some Node and browser versions write September as "Sept" and some as "Sep", and one pack must read the same everywhere.

## Parking spots (portal)

`apps/core/src/modules/parking`: besides drivers' reports, WagonWise staff manage spots at `/admin/parking` (core routes under
`/staff/parking/spots`, platform staff only, `application/admin-parking.ts`). `parking.safe_parking_spots` has `source`, `osm_id` (unique, so an
import never doubles), `name`, `capacity` and eight nullable booleans (null = not known). Imported places are © OpenStreetMap
contributors (ODbL): the credit shows on the portal page and on the driver card, and rows keep `source = 'osm'`.

Drivers can **suggest changes** to a spot (name, HGV spaces, note, the eight facility answers) or say it is closed or gone, from "Suggest a
change" in the spot drawer (`components/parking-suggest-form.tsx`, `lib/parking-suggestion.ts`). `POST /parking/spots/:id/suggestions`
(driver sign-in; driver-bff validates and forwards) saves a row in `parking.spot_edit_suggestions` (migration 0069; one waiting per driver
per spot, a second replaces the first; at most 20 waiting per driver; values equal to what the spot already says are dropped). Nothing on
the map changes until platform staff approve it at the top of `/admin/parking` (`GET /staff/parking/suggestions`, `POST
.../:id/approve|reject`; the list never shows who suggested). Approve lays the changes over the spot; "gone" approved deletes the spot.
The home-screen "Mark safe parking" report also takes optional details (name, spaces, facilities): given as-is to a new spot, but filed as a suggestion when the report lands on a spot already on the map.
Deciding a suggestion deletes it, and `parking.eraseDriverData` (run on account deletion) removes a driver's waiting ones.

## Staff BFF

`apps/staff-bff` (P2-M1.9) is the dashboard's back end for staff accounts. It does the same
three jobs as the driver BFF, and nothing else:

- it checks request shapes against `@wagonwise/contracts`
- it verifies the staff access token against core's JWKS, refusing driver tokens
- it forwards to core's `/staff/*` routes with `X-Internal-Key`

Everything about who may do what is decided in core.

```bash
pnpm --filter @wagonwise/staff-bff dev   # port 3003 by default
curl http://127.0.0.1:3003/health
```

Same variables as the driver BFF (`NODE_ENV`, `HOST`, `PORT` (default `3003`), `LOG_LEVEL`,
`CORE_INTERNAL_URL`, `CORE_INTERNAL_KEY`), with the same defaults, plus `DASHBOARD_ORIGIN`
(default `http://localhost:5173`, the only browser origin it answers) and `TRUST_PROXY_HOPS`
(default `0`): how many proxies sit in front and add to `X-Forwarded-For`, so the sign-in rate
limit counts each real caller. Leave it `0` locally; `1` on DigitalOcean App Platform.

The whole dashboard talks to it, and only to it (P2-M1.12c: the driver sign-in is gone, and the
driver BFF answers no browser). Pages: `/staff/sign-in` (email, password, then the second
factor), `/join?token=…` (the invite link: set a password, pick a second factor, save the
recovery codes), `/staff/users` (invite, change privileges, remove) and `/staff/activity` (the
audit log), the fleet pages, and for WagonWise staff the admin pages (companies, invite codes,
hazard reports, driver accounts). The menu shows each person what their privileges allow; core
decides every request. Drivers are shown by the company's label, else the name the driver gave in the app, else their phone or email (`apps/dashboard/src/lib/driver-name.ts`; core: `identity.drivers.name`, `fleet.driver_links.label`, migration 0067). The staff guide (`/guide`, content in `apps/dashboard/src/lib/guide.ts`) sits behind the same sign-in, and each fleet and team page links to its section from the layout: when a page changes, change its section. Point the dashboard at it with `VITE_STAFF_BFF_URL` (default
`http://localhost:3003`). To try it locally, create the first WagonWise admin's invite with
`pnpm --filter @wagonwise/core staff:bootstrap --email you@example.com --name "You"
--dashboard-url http://localhost:5173` and open the link it prints (it refuses once a WagonWise
admin exists).

The Live trips page (P2-M6.2) shows vehicles on a job on a map. It opens on the whole of the UK, and
fits to the vehicles once one is on the road. It loads with no set-up, but then draws MapLibre's
keyless demo style: coloured country outlines with no roads or towns, so it looks nearly empty at
fleet scale. Set `VITE_MAPTILER_API_KEY` for a usable map; it switches the page to real MapTiler
street tiles. Set it in `apps/dashboard/.env` locally and as a `BUILD_TIME` variable on the
dashboard in DigitalOcean.

## Announcements (What's new)

**Notes to the drivers about what has changed in the app (2026-11-12, stage 1).** A new core module, `modules/announcements` (migration `0090_announcements.sql`, schema `announcements`; no company owns a row, so no row-level policy, as for closures). WagonWise staff write a note (a heading of up to 80 characters and a message of up to 600, one point to a line) on the portal's **What's new** page (`/admin/announcements`, Customers); core refuses anyone who is not platform staff (`createAnnouncement`, `listAnnouncements`, `deleteAnnouncement` take the `StaffCaller`), and a note can be taken back. Any signed-in driver reads the newest through `GET /announcements/latest` (driver BFF `announcements-routes.ts` forwards it; `/announcements/` is a driver-auth prefix in `host/build-app.ts`; always 200, `announcement: null` when there has never been one). The staff routes go through the staff BFF's table (`/staff/announcements`). In the app, `WhatsNewCard` (`components/whats-new-card.tsx`) on the **home screen only**, so it never interrupts a drive, shows the newest note once, closed only by **Got it** (`state/whats-new-store.ts` keeps the seen id in SecureStore; `hooks/use-whats-new.ts` asks at most every ten minutes). `shouldShowWhatsNew` (`lib/whats-new.ts`) shows nothing for a note already seen, one older than 14 days (a driver who installs later is not told about old changes), or while an update is waiting for a restart (the note may be about it). Contracts: `packages/contracts/src/announcements.ts`. **Sent as a notification too (stage 2, 2026-11-12).** The portal's publish form has an unticked "Also send it as a notification". `createAnnouncement` (`application/announcements.ts`) then sends the heading and the note's first point (cut to 140 characters, `pushMessageFor` in `domain/announcement.ts`) to every phone of every driver who has not opted out: the phones come from identity (`identity.listPushTargets()`, supplied as the `AnnouncementAudience` port by composition, rule 7), the opt-outs from `announcements.push_opt_outs` (migration `0091_announcement_push.sql`; a row means off; erased with the account through `eraseDriverData`). **Limits, on purpose:** a notification is refused (`PushTooSoon`, 429) with nothing saved if one went out in the last three days (`PUSH_COOLDOWN_MS`); nobody to tell sends nothing and does not use the limit up; a send that fails keeps the note, answers `pushFailed` and does not use the limit up; a sent notification cannot be taken back. The sender (`infrastructure/expo-announcement-pusher.ts`) batches 100 to a request, with **no sound, ordinary priority and the Android channel `news`** (created in `use-register-push-token.ts`), so it never rings on the road; the data carries `{ type: 'announcement', announcementId }`. In the app a driver turns them off on the More tab (**News from WagonWise**, `use-announcement-preference.ts`, `GET/PUT /announcements/preference` through the driver server, on by default); while the app is open a news notification goes to the tray with no banner and no sound, and tapping or receiving one only refreshes the note (`announcementIdFrom`, `use-reroute-notifications.ts`), with no navigation, so nobody on a trip is moved off it. **Gaps:** no scheduling; the note is plain text; the count is of phones the push service accepted, not of notifications read; nothing says how many drivers have them on before sending; the portal page has no component test (as for the other portal pages).

## Driver app

**A trip that survives a restart with no signal (2026-11-12).** The trip and its plan are kept on the phone (`db/saved-trip.ts`, one SQLite row; `hooks/use-trip-persistence.ts` saves when both stores hold a trip and plan, and clears when the trip goes, reacting only to changes so the stores starting empty never wipes it). The launch gate's `useResumeActiveTrip(accessToken, driverId)` (`api/use-active-trip.ts`) sends the outbox first (below), then asks the server; **only when the server cannot be reached** (no signal, a 5xx, a 401 because the sign-in has not refreshed yet) does it fall back to the saved trip, and only if `usableSavedTrip` (`lib/saved-trip.ts`) allows: it is this driver's (`trip.driverId`), under 24 hours old, not ended, and not one the driver ended offline. A server answer of "nothing in progress" clears it. **End trip and Arrived are queued, not lost:** `useEndTrip` and the new `useArriveAtStop` save to `db/trip-outbox.ts` (keyed by trip id; an arrival keeps the job id and status) when the failure is not permanent (`isPermanentRejection`, as for photos), and succeed so the screen leaves the trip. `syncTripOutbox` (`hooks/use-trip-outbox-flush.ts`; on opening, on returning to the foreground, and before `useStartTrip` and the resume check) sends the arrival then the end, oldest first, dropping one the server will always refuse (the job moved on, the trip is gone) so the queue is never stuck; the job screen shows a queued arrival's status meanwhile (`withPendingArrival` in `useCurrentJob`'s `select`, from `state/pending-arrivals-store.ts`). Ending a trip the server no longer has (`ActiveTripNotFound`, such as one brought back from the phone) just finishes locally. **The end time (2026-11-12):** the queued end keeps when the driver tapped (`endedAt` in `db/trip-outbox.ts`) and `POST /routing/trips/:id/end` now takes an optional body `{ endedAt }` (`endTripRequestSchema`; the driver BFF forwards it). `endTrip` in core keeps it between the trip's start and now (a wrong phone clock cannot put it before the trip began or in the future), and a trip that already has an end keeps it, so a retry cannot move it. With no body, as from an older app, the end is now, as before. **The arrival time (2026-11-13):** the arrival on the job is stamped with the tap time too. `POST /jobs/:id/status` takes an optional `at` (`advanceJobStatusRequestSchema`; the driver BFF forwards it) and the app sends it with the arrival, queued or not (the queued arrival uses the same `endedAt`). `advanceJobStatus` keeps it between the job's last step and now (`stampTime`), so a wrong phone clock cannot reorder the timeline or reach into the future. Only the driver's own route reads it: a dispatcher stepping a job on has the time of the click. No `at`, as from an older app, is now, as before. **Gaps:** Loaded, Delivered and the other job steps still need the server; and there is no screen-level test of the Arrived button (the hook and the pieces under it are tested). **The waiting notice (2026-11-12):** while anything is saved in the outbox, `WaitingForSignalNotice` (`components/waiting-for-signal-notice.tsx`) shows on the home screen and the job screen: "Your trip end is saved" or "Your arrival is saved. It will be sent when you have signal" (`waitingNotice` in `lib/saved-trip.ts`; several are counted), from `waiting` in `state/pending-arrivals-store.ts`, which `refreshPendingArrivals` keeps in step with the queue. **Send now** tries at once and says "Still no signal" if it stays saved; the notice goes by itself when the queue empties, and the What's new card moves up out of its way. **The "No signal" chip (2026-11-13):** `NoSignalChip` (home and trip screens) shows while the phone cannot reach WagonWise. `api/http.ts` feeds `state/connection-store.ts`: a fetch that throws before any answer means no signal, any answer (even a 5xx) means there is, so there is no network library. While offline, `use-connection-probe.ts` (mounted in `_layout.tsx`) asks `/app/version` every 15 seconds and on coming to the front, so the chip clears by itself.

**Route choice on an assigned job (2026-11-12).** Start and Set off on the job screen no longer plan one route and open the trip. `useJobNavigation` (`hooks/use-job-navigation.ts`) moves the job on (for Set off), finds the stop (`navigationTarget`), ends a trip left running for an earlier leg, and opens **`/job-route`** (`app/job-route.tsx`). That screen asks for the assigned vehicle's profile (`getNavigationProfile`, never one the driver picked), then for route options from where the driver is to the stop, with `loaded` from the Load switch and `tolls`, `dailyZones` and `costs` on, and shows them as the same cards a personal trip gets (`components/route-options-list.tsx`, now shared with Plan route). The vehicle and the stop cannot be changed there. Choosing a card plans with `strategyForOption` (a weight-limit route asks first, as on Plan route), a **Toll free** choice is remembered (`trip-tolls-store`) so the re-plan from here and the faster-route check keep avoiding tolls on a job too, and the overview and the trip follow. **Not built:** a company policy on tolls or a hill-sensitive load (the plan's change 2), the chosen route saved against the job (change 3; the app's Start still does not set the job's `routePlanId`, and whether the server links the trip another way was not checked). **Hazard counts (2026-11-13):** each card on the job's route choice now says how many known hazards are on that route, as Plan route does. Both screens use `useRouteOptionHazards` (`hooks/use-route-option-hazards.ts`), which asks along every route once there are routes, keeps only what is on a route itself (`placeOnRoute`) and leaves speed cameras out; the job screen shows the counts only, not markers on its map. Source: the other session's plan, `https://claude.ai/artifact/5upChodoCgUGkCx9TdeGaD`.

`apps/driver-app` (M5, in progress — M5.1 skeleton, M5.2 sign-in, M5.3 vehicle profiles, M5.4 plan
route, M5.5 route overview, M5.6 active trip, M5.7 report hazard + hazard detail, M5.8 offline
hazard queue, M5.9 feedback) — Expo + Expo Router, targeting both iOS and Android. No native
Xcode/Android Studio project is checked in;
Expo generates those on demand (`expo prebuild`, or transparently when EAS Build runs).

**Launch gate** (`app/index.tsx`), in order: sign in, the privacy screen (`needsConsent`), a trip in progress (resumed), the first-run walkthrough (`state/walkthrough-store.ts`, once per phone; reopened from More, "How it works"), then the map.

```bash
pnpm --filter @wagonwise/driver-app dev   # starts the Metro bundler
```

Then press `a` (Android) or `i` (iOS, macOS only) in that terminal, scan the QR code with the
Expo Go app on a physical phone, or run `pnpm --filter @wagonwise/driver-app android` / `ios`
directly. `pnpm dev` from the repo root now starts core, the driver BFF and the Expo dev server
together.

The app talks to the driver BFF via `src/config.ts`, the one place it reads `process.env`
(mirroring core's own `config.ts` rule) — no `.env` needed for either simulator:

| Platform         | Default BFF URL           | Why                                                         |
| ---------------- | ------------------------- | ----------------------------------------------------------- |
| Android emulator | `http://10.0.2.2:3002`    | The emulator's own alias for the host machine's `localhost` |
| iOS simulator    | `http://localhost:3002`   | The simulator shares the host's network namespace           |
| Physical device  | set `EXPO_PUBLIC_BFF_URL` | Needs the host machine's real LAN IP, e.g. `192.168.1.50`   |

Copy `apps/driver-app/.env.example` to `apps/driver-app/.env` to override it. `EXPO_PUBLIC_`-
prefixed variables are inlined into the JS bundle by Expo's own tooling; this one is also in
`turbo.json`'s `passThroughEnv` list, or `pnpm dev` would silently drop it.

**EAS Build** (`apps/driver-app/eas.json`) has `development`/`preview`/`production` profiles for
both platforms. The app is linked to the EAS project `scottkelly36/wagonwise-driver-app`, and the
Android package / iOS bundle id is `com.wagonwise.driverapp` (permanent once a build is uploaded
to Play or App Store Connect).

Store builds can't read your local `apps/driver-app/.env` (it's never uploaded), so the
`production` profile reads EAS's `production` environment variables instead. Set them once:

```bash
npm install -g eas-cli   # then open a new terminal; `npx eas-cli@latest` works without installing
eas login
cd apps/driver-app
eas env:create --environment production --name EXPO_PUBLIC_BFF_URL --value https://<driver-bff public URL> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_MAPTILER_API_KEY --value <key> --visibility plaintext
eas env:list --environment production   # check both are there
```

Without `EXPO_PUBLIC_BFF_URL` a store build points at the emulator address (`10.0.2.2`) and no
tester can connect. The MapTiler key ships inside the app, so treat it as public: restrict it and
cap its usage in MapTiler's dashboard. Then build with
`eas build --platform android --profile production`. The first `.aab` has to be uploaded to Play
Console's internal-testing track by hand; later ones can use `eas submit --platform android`.

**Versions and updates.** Two kinds of release:

| Change                                                                           | What to do                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| JavaScript only (screens, logic, text, styling) — most fixes                     | `eas update --channel production --environment production --message "…"`. No version bump, no new build, no Play upload. |
| Native (new/upgraded native package, `plugins` or permissions, Expo SDK upgrade) | Bump `version` in `app.config.ts`, `eas build --platform android --profile production`, upload the `.aab` to Play.       |

**Releases run themselves, on a label.** Merging to `main` publishes nothing. Adding the `release` label to a
pull request (before or after it merges) runs the "Driver app release" workflow: an over-the-air update for a
JavaScript-only change, or, when `version` is higher than at the last release, a Play internal-testing build. The
commands above remain for running by hand. How it decides, the secrets it needs and the server-route check are in
`docs/deployment-guide.md`, section 9.

- `version` follows semver **per store build** (1.0.1 fixes, 1.1.0 features, 2.0.0 major). An update
  can't change it — it's baked into the binary — so over-the-air fixes are identified by their
  `--message` in the Expo dashboard, not by a version number.
- The Android version code is incremented by EAS on every build (`autoIncrement`, remote version
  source); never set it by hand.
- `runtimeVersion` uses the `appVersion` policy (back from `fingerprint` as of 2026-10-02 — it
  hashed `node_modules` file paths, and pnpm shortens those paths differently on Windows than on
  EAS's Linux builders, so `eas update` run from a Windows machine computed a runtime version that
  never matched a build EAS had just produced, and updates silently never reached it): an update
  only reaches builds whose `version` matches exactly, so bump `version` on any native change
  (new/upgraded native package, `plugins`/permissions, Expo SDK upgrade) as the table above says,
  even though it's also the same string used for the store build number.
- Always pass `--environment production` to `eas update`. Without it the update bundles whatever
  is in your local `.env`, which may point at your own machine instead of the real server.
- Testers get an update the next time they fully close and reopen the app.

**Sign-in (M5.2)**: OTP over email/phone plus an invite code on first sign-in, matching identity's
own flow exactly (`/sign-in` → `/identity/otp/request` → `/identity/otp/verify`, through the BFF).
The refresh token and driver info are persisted in `expo-secure-store` (Keychain on iOS, Keystore
on Android); the access token itself is never persisted — a fresh one is fetched on every cold
start via `/identity/token/refresh`. Once signed in, a proactive refresh is scheduled ahead of the
access token's real 15-minute expiry, and re-checked whenever the app returns to the foreground
(`src/hooks/use-opportunistic-refresh.ts`) — the design doc's "never only on a 401," so a driver in
a dead zone on the A69 doesn't discover the expiry mid-trip. Sign out clears both stored values.

**Testing note**: `apps/driver-app`'s Jest config extends jest-expo's default
`transformIgnorePatterns` to also transpile `jose` (it ships ESM-only, no CJS build) — see the
comment in `apps/driver-app/jest.config.js` if a future ESM-only dependency hits the same
"Cannot use import statement outside a module" error. `packages/contracts`'s `package.json`
`exports` also gained a `"default"` condition alongside `"import"` for the same underlying
reason: Jest's own resolver doesn't request the `import` condition by default.

**Vehicle profiles (M5.3)**: `/profiles` (list), `/profiles/new` (create), `/profiles/[id]` (edit,
delete) — all through the BFF's `/routing/vehicle-profiles` routes with the signed-in driver's
bearer token, matching M4.2's contract exactly (no `driverId` field anywhere; the server derives
it from the token). Height is shown alongside its feet/inches conversion (`src/lib/units.ts`) per
AGENTS.md's UK-signage convention — width/length/weight stay metric-only, matching UK road
signage. Client-side validation mirrors core's own domain rule exactly (every measurement must be
a positive number) so a driver sees the same rejection before a network round trip, not a looser
one the server would reject anyway.

**Plan route (M5.4)**: `/plan-route` — a MapLibre map (`@maplibre/maplibre-react-native`), a
vehicle-profile picker, and tap-to-drop for origin/destination (no geocoding/text search yet — a
deliberate scope cut, decided with the user, not a gap found later). Origin defaults to the
device's current location (`expo-location`, foreground permission only) until a driver taps their
own point. Calls the BFF's `POST /routing/route-plans` and shows the resulting distance/duration
inline — the route line itself, hazards and avoided restrictions are M5.5's job (route overview
screen), not duplicated here.

Map tiles come from MapTiler (the user's choice over Stadia/self-hosting — the design doc named
both as candidates but never picked one). `EXPO_PUBLIC_MAPTILER_API_KEY` unset falls back to
MapLibre's own free, keyless demo style (`src/lib/map-style.ts`) so the screen renders a real map
with zero setup; get a real key at [cloud.maptiler.com](https://cloud.maptiler.com) before relying
on it beyond local dev. Copy `apps/driver-app/.env.example` to `.env` to set it.

**Loaded / Empty (2026-11-09):** (shown to drivers from 2026-11-09 as **Load type: Normal / Hill-sensitive**, because the real question is whether the load minds steep roads, not whether the lorry is full; the code still says loaded/empty) a **Load** switch above the Plan route button (`state/load-store.ts`, kept on the phone, Empty by default). Loaded sends
`loaded: true` with the route-options preview; when the server has height data each route card gains a hills line ("2.3 km of steep hill · highest point
328 m", `lib/route-option-text.ts`) and the gentlest route is labelled "Fewer hills" (planned with `strategy: 'gentle'`). With no height data the cards are as
for Empty and a line says the hill check is not available yet. Core's side and the evidence: `docs/loaded-routing-scope.md`. The setting is also used when a route is made
from where the lorry is now: **Re-plan from here**, the next stop of a job and a parking spot all plan with `strategy: 'gentle'` when Loaded (`lib/loaded-strategy.ts`),
and the **faster-route check** sends `loaded: true`, so core does not offer a quicker route that has more than 0.5 km more steep road than what is left of the
current one (`check-faster-route.ts`). **Not covered:** the reroute alert core sends by itself when a hazard is reported ahead (`detect-reroute.ts`) plans the new route
without knowing the vehicle is loaded, because the Load setting lives only on the phone; fixing that needs the setting stored with the trip (a migration).

**Toll prices on Plan route (2026-11-10, stage 2 of charges routing).** `valhalla-routing-engine.ts` reads each step's `toll` flag and keeps points on the tolled
stretches (`RouteResult.tollPoints`, thinned to at most 60, from `tollPointsOf`). `domain/tolls.ts` is the table of crossings (`TOLL_CROSSINGS`: name, where to look, a
tariff by gross weight and axles, a note, when to pay, source URL, `checkedOn`), `chargesOnRoute` names each crossing a tolled stretch is near and `priceFor`
prices it for the vehicle. The axle count is not held, so `possibleAxles` works out the options from the weight (two up to 7.5 t, either to 18 t, three or more above):
the price is a range when they differ and **absent when any option has no tariff** (a class was not read). `previewRouteOptions` adds `charges` to each option
when the app sent `tolls: true`, priced at the vehicle's real weight; the app shows "Toll: name, price" and when to pay (`tollLines`), and "Includes a toll" for a toll
not in the table. **Prices are read by hand** from each operator's page: open every `sourceUrl` and update `checkedOn` on a schedule (owner, 2026-11-11: read the Humber three-or-more-axles band, £15.00, and the Tyne Tunnel, £5.20 for a vehicle over 3.5 t, off the operators' pages; the Humber two-axle band, £5.00 for 3.5 to 7 t, was confirmed from the owner's copy of the operator's table too, which has no band for a two-axle vehicle over 7 t, so a 7.5 t rigid is shown the range between its two nearest bands, £5.00 to £15.00, on the owner's decision; and the Tyne Tunnel's £5.20 band for a vehicle over 3.5 t was confirmed against the operator's own page, tt2.co.uk, on 2026-11-11, where it is the only class above 3.5 t, so a lorry pays it).

**Mersey Tunnels and Tamar Bridge added (2026-11-12).** Both prices are the owner's copy of the operators' tables (Merseytravel's, valid from 1 April 2026: Class 3 two axles £7.20, Class 4 three or more £9.60, cash or card, about 17% less with T-FLOW; Tamar Crossings': over 3.5 t, two axles £7.30, three £12.00, four or more £16.50, half with a TamarTag), because the Merseytravel page returned a 403 to our fetch and the Tamar page we could read had no goods-vehicle table. The Mersey Tunnels are one row for Queensway and Kingsway (the direction charged was not stated, so none is claimed) and are priced by axles, so a 7.5 to 18 t lorry sees £7.20 to £9.60. The Tamar Bridge is charged **eastbound only** (Saltash into Plymouth, free the other way): the row has `oneWay` (`centreDeg` 90, `withinDeg` 75), and `chargesOnRoute` compares the bearing from the route's first to its last tolled point at the crossing, naming and pricing it only when that is within the window (and treating it as charged when the points cannot say, under 100 m apart). A westbound route still says "Includes a toll" if the engine flags one, but with no name or price, so it is never given the cost of the free direction. Only three axles versus four or more differs and we hold only "three or more", so a heavy lorry is shown £12.00 to £16.50. Not the Itchen Bridge (Southampton; the council's page would not load and a rise from £25 to £40 was only a proposal in what we found) or other small tolls.

**Tolls on Plan route (2026-11-09, stage 1 of charges routing).** Valhalla says whether a route has a toll (`summary.has_toll`, read into
`RouteResult.hasToll`, from OpenStreetMap tagging, so a hint and not a price). When the app sends `tolls: true` with the preview (this version always does; an
older app does not, because it cannot read a new label), each card whose route has one says **Includes a toll** (`tollLine`), and when any route has one core asks the
engine again with `avoidTolls` (Valhalla `use_tolls: 0`, a preference, not a ban) and adds the result as a **Toll free** card, or labels an existing card
"Toll free" when it is the same road (`application/toll-free-route.ts`, `withTolls` in `preview-route-options.ts`). Nothing is offered when the route that avoids
tolls still has one. Choosing it plans with `strategy: 'toll-free'`, and a hazard or closure re-plan keeps avoiding tolls. **Not covered yet:** which toll or what it costs
(no price, no "Cheapest" card: stage 2 onwards, `docs/charges-routing-scope.md`), clean-air zones, and job stops, which do not carry the choice.

**Euro VI link on the route cards (2026-11-11).** When a card's zone line says a charge may apply because the vehicle has not said whether it is Euro VI (`euroVIUnknown`), and a saved vehicle is selected, a "Say whether <vehicle> is Euro VI" button under the cards opens that vehicle's details (`/profiles/[id]`). A vehicle typed in by hand has no details to open, so no button.

**The toll choice carried on (2026-11-11, charges stage 4).** `avoidTolls` is now an optional field on the plan request and on the faster-route check (`avoidTolls` in `packages/contracts/src/routing.ts`),
and `plan-route.ts` applies it on every strategy and in every pass (`tollPreference`), so a re-plan from the middle of a drive keeps avoiding tolls however the first plan was made. The check asks the
engine for alternatives that avoid tolls and skips any candidate that still has one; an offer whose route has a toll says `hasToll: true` and the card says "This route includes a toll." The app remembers
which plans the driver chose as Toll free in memory (`state/trip-tolls-store.ts`, set in `planWith` when the strategy is `toll-free`), sends `avoidTolls: true` from `use-replan-from-here.ts` and
`use-faster-route.ts`, and carries the choice to the new plan on a re-plan or a Switch. Only the Toll free choice sets it: a route that merely has no toll was not chosen for that. **Gaps:** the server
itself cannot know the app's choice, so a reroute alert it raises (hazard or closure) re-plans without it; job stops and parking have no toll choice; an older app sends nothing and behaves as before.

**Not verified on a real map render** — beyond the disclosed gap every M5 task has had so far (no
Android SDK, no macOS on this machine), MapLibre specifically needs its own native module built
(`expo prebuild`/EAS Build), which this machine can't do either. Verified so far: `expo export`
for both platforms produces a real Hermes bundle that includes MapLibre's JS and its marker
assets (proof the library resolves and bundles, not that it renders) plus `expo-doctor` (21/21).
Treat the map screen as unverified-by-a-real-run until it's actually opened on a device or
simulator.

**Route overview (M5.5)**: `/route-overview` — the route line (decoded from Valhalla's polyline6
geometry, `src/lib/polyline.ts`, hand-rolled per AGENTS.md rule 6), distance/time, and
"restrictions avoided"/"hazards on this route" sections (both always empty right now —
`RoutePlan`'s `avoidedRestrictions`/`hazardsOnRoute` fields have been `[]` since M2.5/M3.5, a
documented backend gap, not a bug here). The just-planned route is held in a small in-memory
store (`src/state/current-route-plan-store.ts`), not re-fetched on this screen — `/plan-route`
and `/route-overview` share this one "current plan" slot instead. `GET /routing/route-plans/:id`
does exist now (M6.6), but only for the reroute prompt to fetch a _different_, brand-new plan by
the id a push notification carries — this store still isn't a cache keyed by id.

**Active trip (M5.6)**: "Start trip" (route overview) now really starts one —
`POST /routing/route-plans/:id/trip` — and lands on `/active-trip`: a live-following map
(`src/hooks/use-live-location.ts`, a continuous `expo-location` watch, foreground only), the
planned route's hazard list, and a real "End trip" button (`POST /routing/trips/:id/end`). The
started trip is held in another small in-memory store (`src/state/current-active-trip-store.ts`)
— same reasoning as the route-plan store: core deliberately has no `GET` to re-fetch a trip by,
so it doesn't survive an app relaunch mid-trip (a real, disclosed gap — see `docs/progress.md`).
The mic button is real speech capture as of M7.2 (see below); reroute prompts are wired since
M6.6.

**Report hazard + hazard detail (M5.7)**: a new `/report-hazard` (tap-to-drop a pin, an
eight-item plain-word type picker, optional note/measurement) and `/hazards/[id]` (what/when/
confirmations, real "Still there"/"Not there" actions). Closed a real gap left since M3: core had
a `HazardRepository.findById` but never exposed it over HTTP — `GET /hazards/reports/:id` now
does. Reachable in this app only by just having reported a hazard — there's no hazards-on-map
display anywhere yet to tap an existing pin from (a disclosed scope-down, not an oversight).

**Offline hazard queue (M5.8)**: reporting now writes to a local SQLite queue
(`expo-sqlite`, `src/db/hazard-queue.ts`) _before_ ever touching the network (design doc §5), then
tries to send immediately — if that fails (no connectivity), the report stays queued and the
screen shows "Saved — this will be sent automatically once you're back online" instead of an
error. `src/hooks/use-hazard-queue-flush.ts` (wired into the root layout, same "opportunistic, not
just one trigger" shape as `use-opportunistic-refresh.ts`, M5.2) retries the whole queue on
mount and whenever the app returns to the foreground, in order, stopping at the first failure —
trying items after a failure would only waste time on what's very likely the same offline
condition. The client-generated idempotency id (already in place since M5.7) is exactly what
makes this retry-safe: a report resent after a flaky connection never creates a duplicate.

**Proof of delivery (P2-M5.5b)**: at the delivery stop `/job` shows a "Proof of delivery" card with
a "Take photo" button (`src/hooks/use-proof-of-delivery.ts`, `expo-image-picker`). The photo is
saved to a second offline queue first (`src/db/proof-of-delivery-queue.ts`, one row per job — a
retake replaces it) and uploaded straight away if there's signal; otherwise
`use-proof-of-delivery-queue-flush.ts` retries on app start and every return to the foreground.
Unlike the hazard queue, a photo the server will never accept (4xx other than 401/408/429 — the job
was cancelled or reassigned) is dropped instead of blocking the queue. On a job the dispatcher
marked "Require proof of delivery", the Delivered button (and its voice equivalent) stays disabled
until the photo has reached the server. **This added a native dependency and the camera permission
(app `version` 1.0.1 → 1.1.0), so it needs a fresh `eas build` before it works on a device — an
`eas update` alone won't carry it.**

**Delivery signature**: set like the photo. A dispatcher ticks "Require receiver's signature" on a
job (`requiresSignature`, migration 0089); at the delivery stop `/job` shows a "Receiver's signature"
card whose "Get signature" opens `components/signature-pad.tsx`, where the receiver signs with a
finger and may type a name. The app has no drawing library (and none could be added over the air), so
the signature is kept as **strokes**: lists of `[x, y]` points in a 1000 x 500 box (`signatureStrokesSchema`
in the contract limits it to 60 strokes, 400 points in one and 2000 in all; `lib/signature.ts` thins
the points and fits it). The pad draws them as thin rotated Views. They go through the same kind of
offline queue as the photo (`db/signature-queue.ts`, one row per job, `lib/signature-flush.ts` reusing
`flushQueuedProofs`, `hooks/use-signature-queue-flush.ts`). Core: `POST /jobs/:id/signature` (driver
only, replaces the one for the delivery the driver is at), `GET /staff/jobs/:id/signature?stop=`
(anyone who can see the company's jobs; 404 `SignatureNotFound`), stored in `jobs.delivery_signatures`
(one row per job and stop, same RLS as the photo). `advanceJobStatus` refuses the step after a
delivery with `SignatureRequired` (409) when the job requires one and the stop has none, for any
actor, beside the photo check. A signature follows the **photo's retention** (`photo_retention_months`,
`pruneProofPhotos` deletes both) and the portal's Settings page says so. Portal: the checkbox on New
job, a Signature column with "View signature" (the strokes drawn as an SVG path,
`lib/signature-svg.ts`), signatures and the signer's name in both delivery records, Reports column and
"Signatures x of y" stat, and two CSV columns. **This is JavaScript only** (the driver app update goes
out over the air on the `release` label); core and the portal need deploying first, because an old
core ignores the field and an old app does not show the card.

**Feedback (M5.9)**: `/feedback` — a free-text note plus "Send", with app version
(`Constants.expoConfig.version`) and device info (RN's built-in `Platform.OS`/`Platform.Version`,
no new native dependency) attached automatically (`src/lib/app-info.ts`). Closed the last
"module doesn't exist yet" gap in this codebase: `feedback` had no domain/application/
infrastructure/interface layer, no migration and no BFF route until this task — the smallest
module in the repo (one aggregate, one use case, no cross-context reads or events), mirroring
`identity`'s own reference-module shape. Insert-only, no read endpoint — a one-way channel to the
developer, read via `psql` rather than back through the app.

**Reading feedback (2026-10-18):** WagonWise staff read it at `/admin/feedback` (`GET /staff/feedback?status=open|resolved|all`, `PUT /staff/feedback/:id/resolved`, platform staff only, `application/review-feedback.ts`). `feedback.notes.resolved_at` is set when resolved and cleared on reopen. The sender is shown as a name or sign-in address from `identity` through a `DriverLabels` port; the account id is never sent.

**Push registration + reroute prompt (M6.6)**: the app side of M6.2's device-token registration
and M6.5's real Expo push delivery. `src/hooks/use-register-push-token.ts` requests notification
permission and an Expo push token (`expo-notifications` + `expo-device`, both new dependencies)
whenever a driver is signed in, and upserts it via `POST /identity/devices`
(`src/api/identity.ts`'s `registerDevice`) — same "opportunistic, re-run costs nothing" shape as
`use-opportunistic-refresh.ts`/`use-hazard-queue-flush.ts`, since the server-side upsert is keyed
on the token itself (decision 71). Getting a real token needs an EAS project id
(`Constants.expoConfig.extra.eas.projectId`), which doesn't exist yet (M5.10's own pending EAS
setup) — this is an expected, silently-skipped outcome
(`src/lib/push-registration.ts`'s `obtainPushToken`, unit-tested directly), not an error, same as
a driver declining the permission prompt.

`src/hooks/use-reroute-notifications.ts` listens for both ways a driver can encounter a reroute
push (tapped from the tray, or arriving while the app's already open) and routes to
`/reroute/[id]` with the `newRoutePlanId` the push carries (`src/lib/reroute-notification.ts`
pulls it out of the payload). That screen is design doc §6's own instruction made real: "Opening
the notification shows old vs new route; driver accepts or keeps the original. Never switch
silently." It fetches the new plan with the new `GET /routing/route-plans/:id` (core + BFF,
driver-scoped like vehicle profiles — a driverId mismatch is `RoutePlanNotFound`, not a separate
403, same reasoning as decision 49), shows both routes on the map at once
(`RouteMap`'s new `alternateRouteLine` prop, a second coloured line) plus a distance/time
comparison, and two large buttons. Accepting just swaps the plan into
`current-route-plan-store` — no core call needed, since a reroute is always a brand-new,
independent `RoutePlan` (decision 79), not an edit to the one already in play.

**Not verified against a real push notification.** Same underlying gap as M6.5's own deviation:
no EAS project exists yet, so `obtainPushToken` has only ever exercised its `no-project-id`
branch for real. Everything downstream of a token existing — parsing the notification payload,
navigating to the prompt, fetching the new plan, the accept/keep swap — is covered by unit tests
and a live typecheck/lint/build, not a real device receiving a real push. Revisit once M5.10's
EAS project setup unblocks it.

**Voice capture (M7.2)**: the active-trip screen's mic button does real on-device speech
recognition (`expo-speech-recognition`, a new dependency with its own config plugin —
`microphonePermission`/`speechRecognitionPermission` strings in `app.config.ts`).
`src/lib/voice-capture-reducer.ts` is a pure state machine (`idle → starting → listening →
transcribed/no-speech/error`, plus `permission-denied`) driven by
`src/hooks/use-voice-report-capture.ts`, which wires the native module's `start`/`result`/`end`/
`error` events into it — same "pure logic, effects injected at the edge" split as
`push-registration.ts`, shaped as a reducer rather than one async function since a capture session
is a sequence of native events over time, not a single call-and-response.
`src/lib/voice-report-permission.ts`'s `obtainVoiceCapturePermission` mirrors `obtainPushToken`
almost exactly (check existing permission, request if needed, a denial is a value not a thrown
error). GPS position is captured at the moment recording starts (design doc §7 step 1, via the
existing `fetchCurrentLocation`) and carried alongside the transcript for M7.3.

**Voice report flow: parse, confirm, file (M7.3)**: `src/hooks/use-voice-hazard-report-flow.ts`
takes it the rest of the way — sends the transcript to M7.1's `POST /hazards/voice-reports/parse`,
speaks a summary back with `expo-speech` ("Low bridge, about 3.5 metres, here — save it?",
`src/lib/voice-report-summary.ts`), runs `useVoiceReportCapture` a _second_ time to listen for the
reply (`src/lib/yes-no-parser.ts` reads it as yes/no/unclear, word-boundary matched so "I **know**
where that is" is never misread as a "no"), then either files a real `source: 'voice'` report
through the exact same offline-first path the tap flow uses, or — on anything but a clear yes —
saves an unconfirmed draft to a new, separate local table (`src/db/voice-draft-queue.ts`'s
`voice_hazard_drafts`, deliberately not `hazard_queue`, since a draft must never be auto-sent the
way a confirmed queued report is). `src/lib/voice-report-flow-reducer.ts` is the pure state
machine driving the whole sequence (`idle → capturing-report → parsing → speaking-summary →
capturing-confirmation → filing → filed | queued`, plus `report-no-speech`/`draft-saved`/`error`),
unit-tested directly with no native mocking. A timed-out confirmation reuses the capture hook's
own `no-speech` outcome as design doc §7 step 4's "no answer within a few seconds," with no
separate timer needed.

**Saved-reports review (M7.4)**: `src/app/voice-drafts.tsx`, reachable from the home screen —
lists every unconfirmed draft (type, measurement, spoken position hint, the raw transcript, when
it was captured) with "Report it" / "Discard" actions. Filing reuses the exact offline-first path
every other report in this app follows and removes the draft as soon as it's _enqueued_, not once
it's actually sent — from that point it belongs to `hazard_queue`'s own retry story, not the
drafts table. A draft captured with no GPS fix falls back to the driver's current position
(reasonable here — this is explicitly a parked-use screen); if that's unavailable too, "Report it"
is disabled with a hint rather than failing silently. This closes M7's own task list
(M7.1-M7.4) — voice reporting is a complete feature in code, still pending real-device
verification.
