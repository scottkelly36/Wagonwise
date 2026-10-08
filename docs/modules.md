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
`apps/dashboard`'s "Invite codes" screen (WagonWise staff only, `POST /staff/invite-codes`), or
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

**Golden-route tests (M2.6):** real requests against a real, tile-built Valhalla instance — not
part of `pnpm test`/`pnpm verify` (building tiles takes minutes, too slow for every push per
decision 13). Bring up `valhalla` (above) first, then:

```bash
pnpm test:golden
```

Runs nightly in CI (`.github/workflows/nightly-golden-routes.yml`), which downloads a fresh
extract each time so it also tests against Geofabrik's current data.

## Hazards

`hazards` (M3) — driver-reported obstructions (low bridges, weight/width limits, roadworks,
flooding…) that feed into routing's avoidance. Same reachability as routing's, above: through the
BFF with just a bearer token, or calling core directly with `X-Internal-Key` plus the token.

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

`apps/core/src/modules/billing`: what WagonWise charges companies. So far, WagonWise's own billing details
(`billing.details`, migration 0039): trading name, address, billing email, payment details, VAT status and payment terms, one
row seeded with `[bracketed]` placeholders. WagonWise admins edit it on the dashboard's Billing page
(`/staff/billing/details`); company staff are refused and Row-Level Security hides the row from every scope but the platform's.
`placeholderFields()` lists fields still in brackets; invoice issuing must refuse while it is not empty. Pricing model and what
is next: `docs/phase-3-scope.md`.

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
decides every request. Point the dashboard at it with `VITE_STAFF_BFF_URL` (default
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

## Driver app

`apps/driver-app` (M5, in progress — M5.1 skeleton, M5.2 sign-in, M5.3 vehicle profiles, M5.4 plan
route, M5.5 route overview, M5.6 active trip, M5.7 report hazard + hazard detail, M5.8 offline
hazard queue, M5.9 feedback) — Expo + Expo Router, targeting both iOS and Android. No native
Xcode/Android Studio project is checked in;
Expo generates those on demand (`expo prebuild`, or transparently when EAS Build runs).

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

**Feedback (M5.9)**: `/feedback` — a free-text note plus "Send", with app version
(`Constants.expoConfig.version`) and device info (RN's built-in `Platform.OS`/`Platform.Version`,
no new native dependency) attached automatically (`src/lib/app-info.ts`). Closed the last
"module doesn't exist yet" gap in this codebase: `feedback` had no domain/application/
infrastructure/interface layer, no migration and no BFF route until this task — the smallest
module in the repo (one aggregate, one use case, no cross-context reads or events), mirroring
`identity`'s own reference-module shape. Insert-only, no read endpoint — a one-way channel to the
developer, read via `psql` rather than back through the app.

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
