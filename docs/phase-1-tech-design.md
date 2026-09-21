# WagonWise (working name) — Phase 1 Tech Design

Originally drafted as "Wide Load Watch". Source of truth for Phase 1 decisions.
Last revised 2026-09-21 (architecture review before M1).

## 1. Goals, scope & non-goals

**Goal:** a real driver app, on real roads, that a small group of HGV drivers around Hexham can use day to day for a month-plus of testing — proving that restriction-aware routing plus a shared, driver-fed hazard layer is genuinely useful in the cab.

**In scope for Phase 1**

- Driver sign-in and one or more saved vehicle profiles (height, width, length, gross weight, axle weight).
- Real HGV-aware routing on UK road data, avoiding restrictions the vehicle can't clear, with an explanation of what was avoided.
- Hazard reporting two ways: tap-to-drop on the map (when stationary) and hands-free voice (while driving).
- Hazards shared across all drivers via a backend, shown on the map and flagged when they sit on a planned route.
- Push notification when a new hazard appears on a route a driver has planned or is actively driving, with a suggested reroute.
- Offline tolerance for rural dead zones: reports queue on the device and send when signal returns.
- A simple in-app feedback channel so testers can send notes straight to you.

**Out of scope (later phases)**

- Staff/control portal, dispatch, job tracking (Phase 2).
- Finance, maintenance, profitability (Phase 3).
- Abnormal-load compliance and ESDAL-style notification (Phase 4).
- Full turn-by-turn navigation with lane guidance — Phase 1 plans and displays a route and follows the driver's position on it; drivers keep using their judgement and existing knowledge.
- Trust/reputation scoring for hazards beyond basic confirm/dismiss (small tester group doesn't need it yet).

## 2. System architecture

Same pattern as your day job: one core service as the source of truth, a thin BFF per client, TypeScript throughout.

```
Driver app (React Native / Expo)
        │  HTTPS + push
        ▼
Driver BFF (Fastify)  ── token verification, request shaping, app-specific DTOs
        │  internal HTTP over private networking (typed contract + X-Internal-Key)
        ▼
Core service (Fastify host, modular monolith)
  ├─ domain/          pure TS: entities, value objects, rules, events
  ├─ application/     use cases + ports
  ├─ infrastructure/  Postgres/PostGIS, routing engine, push, LLM, storage
  ├─ interface/       HTTP routes the BFFs call
  └─ composition/     module factories, manual wiring
        │
        ├─ Postgres + PostGIS
        ├─ Valhalla (self-hosted routing engine)
        ├─ Push provider (Expo Push → APNs/FCM)
        └─ LLM API (voice report parsing)
```

**Monorepo layout** (pnpm workspaces + Turborepo):

```
apps/
  core/           core service
  driver-bff/     Fastify BFF for the driver app
  driver-app/     Expo React Native app
packages/
  contracts/      zod schemas + inferred types shared across BFF/app/core
  config/         eslint, tsconfig, prettier presets
infra/
  docker/         compose for local Postgres/PostGIS + Valhalla
  deploy/         hosting config
```

`packages/domain/` is deliberately not created in Phase 1 — extract only if core's domain outgrows the app, and not before.

**Key rules** (full list in `CLAUDE.md`)

- The domain layer imports nothing from Fastify, Postgres or any SDK — only plain TypeScript, with no npm dependencies. Everything external sits behind a port in the application layer, implemented by an adapter in infrastructure.
- BFFs contain no business rules. They verify tokens and reshape responses; they never decide anything.
- Contracts between app, BFF and core are zod schemas in `packages/contracts`, so validation and types come from one place.
- Modular monolith, not microservices: one deployable core with separate modules per bounded context. Split only if a real reason appears later.

**Service-to-service auth.** Core is not publicly exposed. The BFF reaches it over the platform's private network, and core additionally verifies an `X-Internal-Key` header with a constant-time compare. Config accepts two valid keys simultaneously so keys rotate without downtime. mTLS is the better long-term answer and isn't worth the certificate management at this scale; because verification sits in one Fastify plugin, upgrading later is a single file.

## 3. Domain model & bounded contexts

Four modules in Phase 1, each its own module inside core. They talk through domain events and read-model ports, never by reaching into each other's internals.

| Context      | Owns                                         | Key aggregates / value objects                                       |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------- |
| **Identity** | Drivers, sessions, devices, invite codes     | `Driver`, `Device` (push token), `Session`, `InviteCode`             |
| **Routing**  | Vehicle profiles, route plans, active trips  | `VehicleProfile`, `RoutePlan`, `ActiveTrip`, `Dimensions`, `GeoLine` |
| **Hazards**  | Hazard reports and their lifecycle           | `HazardReport`, `HazardType`, `HazardStatus`, `GeoPoint`             |
| **Feedback** | Tester notes from the in-app feedback screen | `FeedbackNote`                                                       |

Feedback is a small supporting module rather than part of Identity — "tester note about the app" has nothing to do with identity's language, and folding it in would be the first crack in that context.

**Core types (sketch)**

```ts
// Routing
type Dimensions = {
  heightM: number;
  widthM: number;
  lengthM: number;
  grossWeightT: number;
  axleWeightT?: number;
};

interface VehicleProfile {
  id: VehicleProfileId;
  driverId: DriverId;
  name: string;
  dimensions: Dimensions;
}

interface RoutePlan {
  id: RoutePlanId;
  driverId: DriverId;
  profileId: VehicleProfileId;
  origin: GeoPoint;
  destination: GeoPoint;
  geometry: GeoLine; // encoded polyline
  distanceKm: number;
  durationMin: number;
  avoidedRestrictions: AvoidedRestriction[];
  hazardsOnRoute: HazardReportId[];
  createdAt: Date;
}

interface ActiveTrip {
  id: ActiveTripId;
  routePlanId: RoutePlanId;
  startedAt: Date;
  lastPosition?: GeoPoint;
  endedAt?: Date;
}

// Hazards
type HazardType =
  | 'low_bridge'
  | 'weight_limit'
  | 'width_restriction'
  | 'tight_bend'
  | 'roadworks'
  | 'flooding'
  | 'no_hgv'
  | 'other';
type HazardStatus = 'active' | 'expired' | 'dismissed';

interface HazardReport {
  id: HazardReportId;
  reporterId: DriverId;
  type: HazardType;
  location: GeoPoint;
  note?: string;
  measurement?: { kind: 'height' | 'width' | 'weight'; value: number; unit: 'm' | 't' };
  source: 'tap' | 'voice';
  confirmations: number;
  dismissals: number;
  status: HazardStatus;
  expiresAt?: Date;
  createdAt: Date;
}
```

`RoutePlan` is immutable — there is no plan lifecycle in Phase 1 (see section 6).

**Cross-context reads**

Three reads cross a boundary: routing needs active hazards to build avoid polygons, the alerting subscriber needs device push tokens, and hazard merge needs a nearby-candidate lookup. Events don't serve queries, so each is a **read-model port owned by the consuming context**, with its own types:

```ts
// routing/application/ports/hazard-avoidance.ts
export interface ReportedObstruction {
  id: string; // opaque to routing
  kind: 'height' | 'width' | 'weight' | 'prohibition';
  limit?: number; // metres or tonnes
  zone: GeoPolygon;
}
export interface HazardAvoidanceQuery {
  activeNear(corridor: GeoLine): Promise<ReportedObstruction[]>;
}
```

The adapter in `routing/infrastructure/` calls the hazards facade (`hazards/api.ts`) and translates. Routing never imports a `HazardReport`, `HazardType` or `HazardStatus`.

Note what `activeNear` does _not_ take: `Dimensions`. Whether a reported 3.5m bridge matters to a 4.2m vehicle is a routing rule about vehicles, not a hazards rule — so hazards returns candidates and a pure domain function filters them:

```ts
// routing/domain/avoidance-policy.ts — pure, no I/O
export function applies(o: ReportedObstruction, d: Dimensions): boolean;
```

This is the most safety-critical function in Phase 1, and this shape makes it a fast unit test with no database and no routing engine.

**Domain rules worth encoding early**

- Temporary hazard types (roadworks, flooding) get a default expiry of 7 days unless re-confirmed; permanent types (low bridge, weight limit) don't expire automatically.
- A hazard with enough dismissals relative to confirmations moves to `dismissed` — simple thresholds for now, proper trust scoring in Phase 2.
- A measurement on a hazard ("bridge looked like 3.5m") is advisory and never loosens an official restriction — it can only make routing more cautious.

**Domain events**

- `HazardReported`, `HazardConfirmed`, `HazardDismissed`, `HazardExpired`
- `RoutePlanned`, `TripStarted`, `TripEnded`

Published through a transactional outbox (section 11), so nothing is lost on a crash and Phase 2/3 modules can subscribe later without touching routing or hazard code.

## 4. Routing engine & map data

**Choice: Valhalla (self-hosted), behind a `RoutingEngine` port.**

- Valhalla has a truck costing model that takes vehicle height, width, length, weight and axle load per request, so every driver's profile can be passed at query time — no separate graph per vehicle.
- It supports excluding areas at request time, which is how community hazards feed into routing (see section 5).
- GraphHopper is the fallback; because it sits behind the same port, switching later only means writing a new adapter.

```ts
interface RoutingEngine {
  route(req: {
    origin: GeoPoint;
    destination: GeoPoint;
    dimensions: Dimensions;
    avoid: GeoPolygon[];
  }): Promise<RouteResult>;
}
```

**Map data**

- OpenStreetMap extract for Great Britain (Geofabrik), rebuilt into Valhalla tiles on a schedule — weekly is plenty for Phase 1.
- Known gap: rural Northumberland restriction tags (maxheight, maxweight, maxwidth) may be incomplete. Mitigations, in order:
  1. Audit the test area before launch — check the main routes your testers actually drive and list missing or wrong restrictions.
  2. Fix them upstream in OSM where you're confident (benefits everyone, and the next weekly rebuild picks them up).
  3. Keep a local overrides table of restrictions you know about but haven't pushed to OSM, applied as avoid areas at query time.
- Driver hazard reports are the long-term fix for this gap — that's the whole product thesis.

**Map display**

- MapLibre (open source) in the app via `@maplibre/maplibre-react-native`.
- Vector tiles from a hosted provider for Phase 1 (MapTiler, Stadia or similar) to avoid running a tile server; revisit self-hosting (e.g. Protomaps PMTiles) if costs grow.

**Route explanation**

To tell the driver _what was avoided_, core runs two queries: one with the vehicle's dimensions and one without. Restricted OSM ways along the unrestricted route that the vehicle can't clear become `avoidedRestrictions` ("Avoided Styford Bridge — 3.7m limit"). Cheap, and exactly the explanation testers found useful in the prototype.

## 5. Hazard reporting, sync & on-route detection

**Reporting flow**

1. Driver reports via tap (map position) or voice (current GPS position).
2. App assigns a client-generated UUID and stores it locally first (offline queue).
3. Queue flushes to the BFF when online; the UUID makes submission idempotent, so retries never create duplicates.
4. Core validates, stores, emits `HazardReported`.

**Sync to other drivers**

- App fetches hazards for its current map viewport / route corridor via a bounding-box query, with an `updatedSince` cursor so it only pulls changes.
- Polling every 60–120 seconds while the app is open is fine for Phase 1; push handles the urgent case (section 6). Websockets aren't needed yet.
- Nearby duplicate reports (same type within ~50m in the last 24h) are merged into one hazard with an extra confirmation rather than stacked as separate pins. The repository finds candidates spatially; the domain decides whether they merge.

**Confirm / dismiss**

- When a driver passes a hazard, the app can offer a one-tap "Still there?" prompt — only when stationary or via voice, never a tap prompt while moving.

**On-route detection (PostGIS)**

- Route geometry stored as a `LineString`; hazards as `Point`.
- Hazards on a route: `ST_DWithin(hazard.location, route.geometry, 30 metres)` on geography types, backed by a GiST index.
- PostGIS filters candidates; `applies()` in the routing domain decides relevance to the vehicle. The height comparison never goes into SQL.

**How hazards affect routing**

- Blocking types (low bridge, weight limit, width restriction, no HGV) become small avoid polygons passed to Valhalla when they're active and `applies()` returns true for the vehicle (a reported 3.5m bridge only avoided if the vehicle is taller than that; no measurement means avoid for all).
- Advisory types (tight bend, roadworks, flooding) are shown and flagged on the route but don't force a reroute in Phase 1 — the driver decides.

## 6. Push notifications & reroute alerts

**Trigger:** a `HazardReported` (or `HazardConfirmed`) event for a blocking hazard.

**Flow**

1. A subscriber in the Routing module queries `ActiveTrip`s, plus `RoutePlan`s created in the last 6 hours that haven't started a trip, whose geometry is within 30m of the new hazard (same PostGIS query as section 5, reversed).
2. Filter to vehicles actually affected, via `applies()`.
3. For each affected trip, request a fresh route from the driver's last known position with the new avoid polygon.
4. Send push via a `PushNotifier` port (Expo Push adapter to APNs/FCM): "Low bridge reported ahead on your route. Tap for new route." Include the new route ID in the payload. Device tokens come from a read-model port onto Identity.
5. Opening the notification shows old vs new route; driver accepts or keeps the original. Never switch silently.

**Why a 6-hour window rather than a plan lifecycle:** "upcoming route plan" would need a status field or a `plannedFor` timestamp and a lifecycle to maintain, to serve a behaviour no tester has exhibited yet. A creation-time window is no extra state and almost certainly right at MVP scale — testers plan and drive within the hour. If they turn out to plan the night before, add `plannedFor` then.

**Guardrails**

- Don't notify the driver who made the report.
- Rate-limit: one alert per hazard per trip, and a cap per trip per hour.
- The handler is idempotent (section 11) — at-least-once delivery must not mean two notifications.
- Notifications must be glanceable — short, and paired with an optional spoken alert so drivers don't need to read the screen while moving.
- Background location for active trips needs clear permission prompts on iOS/Android; send position updates at a modest interval (e.g. every 30–60s) to save battery and data.

## 7. Hands-free voice reporting

**Principle:** voice is the primary way to report while driving; tapping is for when parked. The driver should never need to look at or touch the screen to file a report on the move.

**Flow**

1. **Start** — one large mic button, plus a hardware/Bluetooth media-button trigger if feasible (steering-wheel button via car Bluetooth) so no screen touch is needed at all. Capture GPS position and heading at the moment the report starts.
2. **Transcribe** — on-device speech recognition first (iOS/Android native recognisers via an Expo module); fall back to a server-side speech-to-text API if on-device quality proves poor with regional accents and cab noise. Test this early with your actual drivers.
3. **Parse** — core sends the transcript to an LLM through a `HazardParser` port and asks for strict JSON matching a zod schema: `{ type, note, measurement?, positionHint? }`. Invalid output is rejected and retried once, then falls back to type `other` with the raw transcript as the note.
4. **Confirm** — the app _speaks_ back a short summary ("Low bridge, about 3.5 metres, here — save it?") and listens for yes/no. No answer within a few seconds means it's saved as an unconfirmed draft for review later when parked, not filed publicly.
5. **Locate** — position hints like "just past the roundabout" are stored as text in Phase 1; the pin uses the GPS position at the start of the report. Snapping to the likely road ahead is a later improvement.

**Why confirm-before-filing matters:** a misheard report that silently becomes a public hazard is worse than no report. Confirmation keeps data quality up and gives testers confidence the app heard them right.

**Cost/safety notes**

- LLM calls are small (a sentence in, a short JSON object out) — pennies at Phase 1 volumes.
- Keep the transcript with the report for debugging parse quality during testing; review for privacy before any wider rollout.

## 8. Driver app (React Native)

**Stack:** Expo (managed workflow with dev builds), TypeScript, Expo Router, TanStack Query for server state, a small local store (Zustand) for UI state, SQLite (expo-sqlite) for the offline hazard queue and cached hazards.

**Screens**

| Screen              | Purpose                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sign in             | Phone number or email one-time code, plus invite code on first use                                          |
| Vehicle profiles    | Create/edit/select profiles; large number inputs, metres and tonnes with feet/inches shown alongside height |
| Plan route          | Origin (defaults to current location) + destination search; profile picker                                  |
| Route overview      | Map with route line, hazards, avoided restrictions, distance/time; Start trip                               |
| Active trip         | Map following position, big mic button, upcoming hazards list, reroute prompts                              |
| Report hazard (tap) | Type picker, optional note/measurement, drop pin — parked use                                               |
| Hazard detail       | What, when, confirmations; Confirm / Not there                                                              |
| Feedback            | Free-text notes to you, with app version and device info attached                                           |

**Design principles for your tester group (40s–50s drivers)**

- Big tap targets (minimum ~56px), large type, high contrast, readable in sunlight and at night.
- Plain words: "Low bridge", "Too heavy for this road" — not "restriction", "profile", "costing".
- Show bridge heights in both metres and feet/inches — UK signage and driver habit use both.
- Every action while moving is voice or a single large button; nothing requires typing on the move.
- Clear, honest wording that this is a planning aid and the driver's judgement and road signs always come first.
- The app refreshes its access token opportunistically, never only on a 401 — otherwise it discovers the expiry in a dead zone on the A69.

**Distribution for testing:** TestFlight (iOS) and Google Play internal testing (Android) via EAS Build, with EAS Update for quick fixes without a full store release.

## 9. Data storage, auth, privacy & safety

**Database:** Postgres + PostGIS, with a schema per module (`identity`, `routing`, `hazards`, `feedback`) plus an `outbox` schema for domain events. Kysely for queries; migrations as raw SQL, because PostGIS geography columns and GiST indexes are clearer written directly than expressed through a generator.

**Core tables (Phase 1)**

- `identity.drivers`, `identity.devices`, `identity.otp_codes`, `identity.sessions`, `identity.invite_codes`
- `routing.vehicle_profiles`, `routing.route_plans` (geometry `LineString`), `routing.active_trips`, `routing.trip_positions` (sampled), `routing.restriction_overrides`
- `hazards.reports` (location `Point`, GiST index), `hazards.votes` (confirm/dismiss per driver)
- `feedback.notes`
- `outbox.events`, `outbox.handled` (`event_id`, `handler_name` — the idempotency guard)

**Auth**

Core issues, the BFF verifies. Core's identity module owns every decision — is this OTP valid and unexpired, has this invite code been redeemed, may this driver have a session, is this refresh token genuine or a replay. It exposes internal endpoints: `POST /identity/otp/request`, `POST /identity/otp/verify` returning `{ accessToken, refreshToken, driver }`, `POST /identity/token/refresh`, `POST /identity/sessions/:id/revoke`. OTP delivery sits behind an `OtpSender` port in core, with SMS and email adapters.

- **Asymmetric signing (Ed25519).** Core holds the private key; the BFF gets the public key from core's JWKS endpoint and caches it. The BFF can verify tokens and is physically incapable of minting one, which makes "BFFs contain no business rules" a property of the system rather than a convention to police. A shared HMAC secret would behave identically today and end with a BFF quietly issuing its own tokens in eight months.
- **Verify twice.** The BFF verifies locally to fail fast; it forwards the original token to core, and **core derives `driverId` from the token signature, never from a header or body field the BFF supplied.** A signature check costs microseconds and means a BFF bug can't become an authorisation hole.
- **Lifetimes.** Access token 15 minutes, claims limited to `sub` (DriverId), `sid` (session id), `iat`, `exp` — no email, no vehicle data. Refresh token 60–90 days, rotating on each use, with reuse detection: a second use of a rotated token revokes the whole session chain. Long refresh lifetimes matter here — a driver must never be bounced to a sign-in screen mid-trip.
- **Sessions** are stored in `identity.sessions` with the refresh token **hashed, never raw**, plus device id, issued/last-used timestamps and `revoked_at`. This is also what makes account deletion actually terminate access.
- **Known trade-off:** revoking an access token isn't instant — a revoked session stays usable until the current 15-minute window closes. Refresh revocation is immediate, so the blast radius is one short window. Checking session state in Postgres on every request would remove that gap and remove the point of using JWTs.
- Tester access by invite code for Phase 1, so the app isn't open to the public while you're still iterating.

**Privacy (UK GDPR)**

- Location history is personal data. Store trip positions only during active trips, keep them short-term (e.g. 30 days) for debugging, then delete or aggregate.
- Hazard reports are shown without the reporter's name to other drivers.
- Simple privacy notice and consent screen at first launch; a way for a tester to delete their account and data.

**Safety & liability**

- Clear in-app and terms wording: planning aid only; road signs, official restrictions and the driver's judgement always take priority.
- Community reports can only make routing _more_ cautious, never override an official restriction.
- No interaction on the move beyond voice and single large buttons.
- Worth a short conversation with an insurer/solicitor before moving past the friendly tester group — cheaper now than after something goes wrong.

## 10. Infrastructure, hosting, costs, testing & observability

**Hosting (keep it boring and cheap)**

- **Core + driver BFF:** containers on a simple PaaS (Railway, Render or Fly.io) — two services, one region (London), core on private networking only.
- **Postgres + PostGIS:** managed instance from the same provider or a dedicated Postgres host that supports PostGIS.
- **Valhalla:** its own container/VM. The Great Britain graph needs a machine with a few GB of RAM and disk for tiles; build tiles in CI or a scheduled job and deploy the finished tiles rather than building on the live box.
- **Local dev:** docker compose with Postgres/PostGIS and Valhalla loaded with a Northumberland-only extract for fast rebuilds.

**Rough monthly running cost at Phase 1 scale** (under ~30 drivers): roughly £40–£120/month across hosting, database, Valhalla box, map tiles (often within free tiers at this volume), SMS codes and LLM calls. Apple developer account is ~£79/year; Google Play is a one-off ~£20. Treat these as ballpark and check current pricing when you sign up.

**Testing**

- **Domain:** fast unit tests on pure TS — `applies()`, restriction rules, hazard expiry, merge/dismiss thresholds.
- **Application:** use-case tests with in-memory fakes for every port, including an in-memory `UnitOfWork`.
- **Infrastructure:** integration tests against real Postgres/PostGIS via Testcontainers.
- **Contract:** zod schemas shared across app/BFF/core catch drift at compile time.
- **Golden routes:** a handful of real Hexham-area journeys with known restrictions, re-run on every map rebuild to catch regressions ("a 4.2m vehicle must never route under X bridge").
- **Architecture:** dependency-cruiser fails the build on any inward-pointing violation or cross-module import that bypasses a facade.
- **Field testing:** the actual drivers, with the in-app feedback screen.

**CI tiering** — building Valhalla tiles per-PR would make CI slow enough that you'd start skipping it, which is worse than not having it:

| Tier           | Runs              | Contains                                                                    |
| -------------- | ----------------- | --------------------------------------------------------------------------- |
| Per PR         | every push        | lint, typecheck, architecture tests, unit, application, PostGIS integration |
| Nightly        | scheduled         | Valhalla golden routes against a prebuilt tile image tagged by extract date |
| On map rebuild | weekly tile build | full golden-route suite; a failure blocks promoting the new tiles           |

**Observability**

- Structured logs (pino, which Fastify uses already) with request IDs across BFF to core.
- Error tracking in app and services (e.g. Sentry).
- A handful of numbers you check weekly: active testers, routes planned, hazards reported (tap vs voice), voice parse failures, reroute alerts sent vs accepted, outbox dead-letter count.

**CI/CD:** GitHub Actions — lint, typecheck, test on every PR; deploy core/BFF on merge to main; EAS Build for app releases.

## 11. Implementation conventions

Decided before M1 so they don't have to be retrofitted across eight use cases.

**Transactions.** Aggregates accumulate events internally and expose `pullDomainEvents()`; `repository.save(aggregate)` writes the rows _and_ the outbox entries in one transaction. Most use cases therefore carry no transactional ceremony at all. A `UnitOfWork` port exists only for genuinely multi-aggregate operations — hazard merge touches two, ending a trip touches trip plus positions:

```ts
export interface UnitOfWork {
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
```

The in-memory fake for application tests is about ten lines.

**Outbox dispatch.** An in-process poller inside core, every second:

```sql
SELECT * FROM outbox.events WHERE processed_at IS NULL AND attempts < 5
ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20
```

`SKIP LOCKED` means this stays correct if core ever runs more than one instance. Delivery is at-least-once, so **every handler must be idempotent**, guarded by the `outbox.handled (event_id, handler_name)` primary key — an already-handled event is skipped, not re-run. Exponential backoff on failure, dead-letter after five attempts. The poller is startable/stoppable by config so tests aren't racing it, and exposes `drainOnce()` for deterministic integration tests.

**Errors.** `Result<T, E>` for expected failures, exceptions for bugs and infrastructure faults:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Hand-rolled in `domain/shared` (about twenty lines) rather than pulling in `neverthrow`, so the domain keeps zero dependencies and rule 2 stays trivially checkable. Domain errors are a discriminated union of tagged objects; `interface/` maps tags to HTTP status in exactly one table, so a new failure mode breaks compilation there instead of silently returning a 500.

**IDs.** Branded types in `domain/shared`, mirrored as zod brands in `packages/contracts` so the brand survives parsing at the boundary rather than being erased on the way in.

**Config.** One zod-validated object built in `apps/core/src/config.ts` at boot. `process.env` appears nowhere else.

**Composition.** `apps/core/src/composition/` holds a `createXModule(deps)` factory per context returning that module's facade. Manual wiring, no DI container — with four modules a container costs more than it saves and hides exactly the dependency directions the architecture is trying to keep visible.

## 12. Build plan, milestones & open questions

Agent-assisted, built in small pockets of time. Each milestone ends with something you can actually run.

| #   | Milestone         | Done when                                                                                                                                                                                           | Est.    |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M1  | Foundations       | Monorepo, CI with architecture tests, docker compose (Postgres/PostGIS + Valhalla with Northumberland extract), `identity` wired end to end as the reference module, one vertical slice BFF to core | 1 wk    |
| M2  | Routing core      | `VehicleProfile` + `PlanRoute` use case, Valhalla adapter, `applies()` fully tested, avoided-restriction explanation, golden-route tests passing                                                    | 2–3 wks |
| M3  | Hazards core      | Report/confirm/dismiss/expire use cases, PostGIS on-route query, hazards feeding avoid polygons via the read-model port                                                                             | 1–2 wks |
| M4  | Driver BFF + auth | OTP sign-in, invite codes, sessions + refresh rotation, all driver endpoints behind contracts                                                                                                       | 1 wk    |
| M5  | Driver app        | Profiles, plan route, route overview, active trip, tap reporting, offline queue, feedback screen                                                                                                    | 2–3 wks |
| M6  | Alerts            | Active-trip tracking, reroute-on-new-hazard, push notifications, idempotent handlers                                                                                                                | 1–2 wks |
| M7  | Voice             | Mic flow, transcription, LLM parsing, spoken confirm                                                                                                                                                | 1–2 wks |
| M8  | Field-ready       | Test-area restriction audit, privacy/terms screens, TestFlight + Play internal testing, first driver onboarded                                                                                      | 1–2 wks |

**Total:** roughly 10–16 weeks. M7 (voice) can slip to a fast-follow update if needed, but it should land before the wider tester group starts, since it's the safe way to report while driving.

**M1 contains the skeleton that proves the rules, not a full scaffold:**

1. pnpm workspaces + Turborepo, `packages/config` presets, strict TS everywhere.
2. `apps/core` with **one** context (`identity`) fully wired through all four layers, a composition root, and `Clock` / `IdGenerator` / `UnitOfWork` ports with real and fake implementations.
3. Architecture tests in CI (dependency-cruiser) — this is what makes rules 1–9 real rather than aspirational.
4. `infra/docker/compose.yml` — Postgres/PostGIS + Valhalla with the Northumberland extract, one documented command.
5. Migration tooling and the first migration: schemas, `outbox.events`, `outbox.handled`.
6. GitHub Actions per-PR tier.
7. One thin vertical slice end to end (health check through core, called by the BFF) so the wiring is proven before M2 adds behaviour.

**Tips for working with agents on this**

- `CLAUDE.md` and this doc live in the repo so every session starts with context.
- Hand off one use case or one adapter at a time; review the diff against the domain rules above.
- Ask for tests alongside every use case — they're your fastest review tool when time is short.

**Open questions, with deadlines**

| Question                                                        | Needed by        | Note                                                               |
| --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| How complete is OSM restriction data on testers' actual routes? | before M2 ends   | Decides how much the overrides table matters                       |
| iOS, Android or both for first testers?                         | before M5 starts | Changes what you build and test                                    |
| On-device speech quality with local accents and cab noise?      | before M7        | De-risk cheaply now: record two drivers on a phone in a moving cab |
| Default expiry for temporary hazards                            | decided          | 7 days; ask testers once they're using it                          |
| Should single unconfirmed reports be visible immediately?       | decided          | Yes, labelled "1 report, unconfirmed"                              |

The last two are guesses, and guessing costs nothing with thirty users and a direct line to all of them.
