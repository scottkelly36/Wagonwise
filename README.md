# WagonWise (working name)

[![CI](https://github.com/scottkelly36/Wagonwise/actions/workflows/ci.yml/badge.svg)](https://github.com/scottkelly36/Wagonwise/actions/workflows/ci.yml)

HGV-aware routing with a live, driver-fed hazard layer. Drivers set their vehicle
dimensions, get routes that avoid restrictions they can't clear, and report hazards for
other drivers — by voice while driving, tap-to-drop when parked.

Phase 1 is the free driver app, in development. See
[`docs/phase-1-tech-design.md`](docs/phase-1-tech-design.md) for the full design and
[`docs/progress.md`](docs/progress.md) for current status.

> **This README is the single source of truth for getting the project running.**
> Every new set-up step — a service, a container, an environment variable, a seed
> command — gets added here as it lands, so a cold start never needs anything that
> isn't written down.

## Prerequisites

| Tool           | Version | Needed from | Notes                                             |
| -------------- | ------- | ----------- | ------------------------------------------------- |
| Node.js        | 24.x    | now         | Version pinned in `.nvmrc`                        |
| pnpm           | 12.5.1  | now         | Comes from corepack, see below — don't `npm i -g` |
| git            | any     | now         |                                                   |
| Docker Desktop | any     | M1.4        | Postgres/PostGIS + Valhalla                       |

pnpm is managed by corepack so everyone gets the version pinned in `package.json`'s
`packageManager` field:

```bash
corepack enable pnpm
```

## First-time setup

```bash
git clone <repo-url> wagonwise
cd wagonwise
corepack enable pnpm
pnpm install
```

Then bring up the database and apply migrations:

```bash
pnpm db:up
pnpm db:migrate
```

Verify everything worked (this also needs Postgres up, since the PostGIS integration tests run
per-PR, not nightly-only):

```bash
pnpm verify   # lint && typecheck && test && arch && format:check — the same checks CI runs
```

`pnpm install` also sets up a `pre-push` git hook (via `simple-git-hooks`, `package.json`'s
`"prepare"` script — no extra step) that runs `pnpm verify` before every `git push`, so a CI
failure over lint/formatting/tests never has to happen in the first place. Skip it just once with
`SKIP_SIMPLE_GIT_HOOKS=1 git push` if you ever need to push before fixing what it caught.

Then start everything (core on 3001, the driver BFF on 3002, the driver app's Metro bundler —
`pnpm dev` runs every app's `dev` script at once) and check both services answer:

```bash
pnpm dev
```

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3002/health
```

You should see `{"status":"ok","service":"core","product":"WagonWise","time":"…"}` and
`{"status":"ok","service":"driver-bff","time":"…"}`. Neither needs an environment variable to
run locally — every one has a default, the database default matches `pnpm db:up`'s compose
service, and the BFF's default `CORE_INTERNAL_KEY` matches core's default `INTERNAL_KEYS` out of
the box (see Configuration and Driver BFF, below).

## Configuration

Core reads its environment in exactly one place, `apps/core/src/config.ts`, validated at boot.
An invalid value stops the process with a message naming every problem, rather than starting
half-configured.

| Variable                  | Default                                                   | Notes                                                                                                  |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                | `development`                                             | `development`, `test` or `production`                                                                  |
| `HOST`                    | `127.0.0.1`                                               | Use `0.0.0.0` inside a container                                                                       |
| `PORT`                    | `3001`                                                    | 1–65535                                                                                                |
| `LOG_LEVEL`               | `info`                                                    | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                                           |
| `DATABASE_URL`            | `postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise` | Matches `pnpm db:up`'s compose service; `postgres://` or `postgresql://`                               |
| `APP_DATABASE_URL`        | unset (serve on `DATABASE_URL`)                           | The `wagonwise_app` role, subject to Row-Level Security; `DATABASE_URL` stays the owner for migrations |
| `IDENTITY_PRIVATE_KEY`    | unset (fresh key each boot)                               | PEM, PKCS8, Ed25519 only — see Identity, below                                                         |
| `STAFF_SECRET_KEY`        | unset (fresh key each boot)                               | Base64 of 32 random bytes (`openssl rand -base64 32`); encrypts staff authenticator secrets            |
| `INTERNAL_KEYS`           | `local-dev-internal-key`                                  | Comma-separated; a BFF must send one in `X-Internal-Key` on everything except `/health`                |
| `VALHALLA_URL`            | `http://127.0.0.1:8002`                                   | Matches `infra/docker/compose.yml`'s `valhalla` service (see Routing, below)                           |
| `EXPO_ACCESS_TOKEN`       | unset                                                     | Only needed if Expo's "enhanced push security" is turned on (see Alerts, below)                        |
| `ANTHROPIC_API_KEY`       | unset (falls back to `NullHazardParser`)                  | Needed for real voice-report parsing (see Voice reporting, below)                                      |
| `OUTBOX_POLL_INTERVAL_MS` | `2000`                                                    | How often the in-process outbox poller checks for pending events (see Alerts, below)                   |

```bash
PORT=4000 LOG_LEVEL=debug pnpm dev
```

Or copy `apps/core/.env.example` to `apps/core/.env` and edit it — `pnpm dev`, `pnpm start` and
`pnpm db:migrate` all load it if present (Node's `--env-file-if-exists`, no `dotenv` dependency
needed). `.env` is gitignored.

More variables arrive with the milestones that need them. Each one must also be added to
`passThroughEnv` on the `dev` task in `turbo.json`, or `pnpm dev` will ignore it.

## Everyday commands

| Command             | Does                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `pnpm install`      | Install workspace dependencies                                                |
| `pnpm dev`          | Run core (3001), the driver BFF (3002) and the driver app's Metro bundler     |
| `pnpm lint`         | ESLint across every package, via Turborepo                                    |
| `pnpm typecheck`    | `tsc --noEmit` across every package                                           |
| `pnpm test`         | Vitest across every package                                                   |
| `pnpm build`        | Build every package                                                           |
| `pnpm arch`         | Architecture rules against `apps/` (see below)                                |
| `pnpm format`       | Prettier write                                                                |
| `pnpm format:check` | Prettier check — this is what CI runs                                         |
| `pnpm verify`       | lint + typecheck + test + arch + format:check — also runs on every `git push` |
| `pnpm db:up`        | Start Postgres/PostGIS (docker compose), wait for it to be healthy            |
| `pnpm db:down`      | Stop it                                                                       |
| `pnpm db:migrate`   | Apply pending migrations from `apps/core/migrations/`                         |
| `pnpm db:reset`     | `db:down` + `db:up` + `db:migrate`, for when local data gets into a bad state |

Turborepo caches task results locally in `.turbo/`. If a task result looks stale,
`pnpm lint --force` (or any task) re-runs it ignoring the cache.

## Database

Local Postgres/PostGIS runs via docker compose (`infra/docker/compose.yml`), credentials
matching `DATABASE_URL`'s default so no `.env` is needed for local dev:

```bash
pnpm db:up       # start it, waits until healthy
pnpm db:migrate  # apply migrations/*.sql — safe to re-run, applies only what's new
pnpm db:down     # stop it (data persists in a named volume; `docker volume rm` to wipe it)
```

Migrations are raw SQL files in `apps/core/migrations/`, applied in filename order by
`apps/core/scripts/migrate.ts`, tracked in a `public.schema_migrations` table. Each file runs in
its own transaction — a failing statement rolls back that whole file and leaves it unrecorded,
so fixing it and re-running `pnpm db:migrate` picks it back up. Add a new migration as the next
zero-padded number (`0002_...sql`); never edit a migration that has already run anywhere.

`pnpm test` covers the migration runner and the Postgres `UnitOfWork` against a real, ephemeral
PostGIS container via Testcontainers — Docker must be running for `pnpm test` to pass, matching
the CI tiering decision that PostGIS integration tests run per-PR, not nightly-only.

Valhalla (self-hosted truck routing) is also in `infra/docker/compose.yml`, in its own
`valhalla` profile so `pnpm db:up` doesn't start it. Verified end to end in M2.1 against a real
Northumberland extract — a real truck-costed route through Hexham, and `exclude_polygons`
genuinely rerouting around an excluded area (this is how hazard avoidance will feed into
routing). To bring it up:

```bash
# 1. Download a county (or Great Britain) .osm.pbf extract from Geofabrik into
#    infra/docker/custom_files/ — the image reads *.pbf from, and writes tiles/config into,
#    this one directory (gitignored, never commit the extract):
#    https://download.geofabrik.de/europe/united-kingdom/england/northumberland-latest.osm.pbf

docker compose -f infra/docker/compose.yml --profile valhalla up -d valhalla
# First start builds tiles (a few minutes for a county-sized extract); later starts reuse them.
# Serves on http://localhost:8002 — GET /status confirms it's up.
```

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
`apps/dashboard`'s "Invite codes" screen (admin-only) via `POST /identity/invite-codes`, or seed
one directly for local testing:

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
`CORE_INTERNAL_URL`, `CORE_INTERNAL_KEY`, `DASHBOARD_ORIGIN`), with the same defaults, plus
`TRUST_PROXY_HOPS` (default `0`): how many proxies sit in front and add to `X-Forwarded-For`, so the
sign-in rate limit counts each real caller. Leave it `0` locally; `1` on DigitalOcean App Platform. The
dashboard's existing admin pages still go through the driver BFF, signed in as a driver, until
the staff sign-in replaces them (P2-M1.10, P2-M1.12).

The dashboard's staff pages (P2-M1.10) talk to it: `/staff/sign-in` (email, password, then the
second factor), `/join?token=…` (the invite link: set a password, pick a second factor, save the
recovery codes) and `/staff/users` (invite, change privileges, remove) and `/staff/activity` (the audit log). Point the dashboard at it
with `VITE_STAFF_BFF_URL` (default `http://localhost:3003`); `VITE_BFF_URL` stays the driver BFF
for the existing pages. To try it locally you need a first WagonWise staff account, which
arrives with the bootstrap step (P2-M1.12).

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

- `version` follows semver **per store build** (1.0.1 fixes, 1.1.0 features, 2.0.0 major). An update
  can't change it — it's baked into the binary — so over-the-air fixes are identified by their
  `--message` in the Expo dashboard, not by a version number.
- The Android version code is incremented by EAS on every build (`autoIncrement`, remote version
  source); never set it by hand.
- `runtimeVersion` uses the `fingerprint` policy: an update only reaches builds whose native code
  matches, so JavaScript that needs a new native module can't reach (and crash) an older build.
  An update published after a native change just isn't delivered to older builds, so if testers
  aren't seeing a fix, check whether it touched native code and needs a store build.
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

## Repo layout

```
apps/
  core/           core service — Fastify host, modular monolith   ✅ identity wired end to end
  driver-bff/     Fastify BFF for the driver app                  ✅ identity, routing, hazards, feedback
  driver-app/     Expo React Native app, iOS + Android             ✅ M5.1–M5.9, M6.6, M7.2–M7.4 done; M5.10 next
packages/
  config/         shared tsconfig / ESLint / Prettier presets     ✅
  architecture/   dependency-cruiser rules + fixtures + tests     ✅
  contracts/      zod schemas + inferred types shared everywhere  ✅ identity's shapes so far
infra/
  docker/         compose for local Postgres/PostGIS + Valhalla   ✅
  deploy/         hosting config                                  (later)
docs/
  phase-1-tech-design.md    the design — read before any milestone
  progress.md               status, what's next, open items — short; read first
  history/                  per-milestone decisions and deviations (archived detail)
  ideas.md                  field-testing ideas backlog
```

Inside `apps/core/src` (the shape the architecture rules enforce):

```
shared/         pure kernel: Result, branded IDs, cross-cutting ports, test fakes
platform/       adapters for those ports: system clock, UUID generator, Postgres/Kysely, migrations
host/           Fastify app builder, health route, error handling
composition/    the one place that wires ports to adapters
config.ts       the one place that reads the environment
modules/        bounded contexts — identity (M1.5), routing (M2.2), hazards (M3.1), feedback (M5.9)
```

Inside a module (`modules/identity/`, the pattern every future module follows):

```
api.ts             the module's only public surface — everything below is private to it
domain/            pure TS: Driver, Session, InviteCode, Otp; no I/O, no npm dependencies
application/        use cases (requestOtp, verifyOtp, refreshToken, revokeSession) and the
                    ports they need; testing/ holds in-memory fakes for each port
infrastructure/     real adapters: Postgres repositories, Ed25519 signing, crypto-random
                    generators, the (dev-only) console OTP sender
interface/          Fastify routes, request validation, the Result -> HTTP status table
```

`apps/core/migrations/` holds the raw-SQL migrations (see Database, above); `apps/core/scripts/`
holds small CLI entry points run via `tsx`, starting with `migrate.ts`.

`packages/contracts` is deliberately flat (no clean-architecture layering — it's schemas, not a
bounded context): `src/identity.ts` holds identity's request/response shapes, `src/brand.ts` the
zod-branded-ID helper. Unlike `packages/config`/`packages/architecture`, it has a real `build`
step (`tsc`, emitting real `.js`) — its `package.json` `exports` point at `dist/`, not `src/`,
because a plain compiled `node dist/main.js` (no TypeScript-aware loader) needs real files to
resolve, unlike `tsx`/Vitest during development. `turbo.json`'s existing `dependsOn: ["^build"]`
on `build`/`lint`/`typecheck`/`test` already builds it first automatically.

Everything listed above is real. `apps/driver-app` has sign-in, vehicle profiles, plan route,
route overview, active trip, report/view a hazard, send feedback, and push registration/reroute
prompting (M5.1–M5.9, M6.6) — real-device verification (M5.10), including a real device actually
receiving a push, hasn't happened yet. Core's `routing`, `hazards` and `feedback` modules are all
real now (M2/M3/M5.9).

## Conventions

Architecture rules are non-negotiable and listed in [`AGENTS.md`](AGENTS.md) — clean
architecture inside core, a pure domain layer, ports for everything external, bounded
contexts that only talk through facades and domain events. From M1.2 they're enforced in
CI by dependency-cruiser rather than by review.

Tooling worth knowing about before your first PR:

- **TypeScript is strict**, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals` and `noUnusedParameters`.
- **ESLint is type-checked** (`typescript-eslint` `recommendedTypeChecked`), so linting
  needs type information and is slower than syntax-only linting. `switch-exhaustiveness-check`
  is on, which matters because much of the domain is discriminated unions.
- **Prettier formats markdown too.** Run `pnpm format` before committing.

## Architecture enforcement

The rules in [`AGENTS.md`](AGENTS.md) are checked by machine, not by review.
`packages/architecture` holds the dependency-cruiser ruleset; `pnpm arch` runs it against
`apps/` and fails on any violation, and CI runs it on every PR.

What it enforces: dependencies point inward only (domain → application → infrastructure and
interface); the domain and `shared/` kernel import no npm packages and no Node builtins; a
module is reachable from another only through its `api.ts`; no circular imports; and no
unresolvable imports (fail closed — an import that can't be resolved would otherwise slip past
every purity rule).

**Adding or changing a rule** — every rule needs a fixture proving it fires. Add a
deliberately-broken example under `packages/architecture/fixtures/violations/`, add a row to
`src/architecture-rules.test.ts`, and `pnpm test` will fail if any rule has no fixture.

**A rule failing on real code** — fix the code, not the rule. If you genuinely believe the rule
is wrong, change it in `packages/architecture` in the same PR and say why.

## Troubleshooting

**`pnpm: command not found`** — run `corepack enable pnpm`. Don't install pnpm globally
with npm; the version would drift from the one pinned in `package.json`.

**Corepack asks to download pnpm on first use** — expected, it's fetching the pinned
version. Accept it.

**`PORT=… pnpm dev` is ignored** — Turborepo strips environment variables it hasn't been told
about. Add the variable to `passThroughEnv` on the `dev` task in `turbo.json`.

**`pnpm dev` fails with `Cannot find module '.../watch'`** — `tsx`'s `watch` subcommand must be
its _first_ argument (`tsx watch --flag file.ts`), not after another flag
(`tsx --flag watch file.ts` — tsx then reads `watch` as the entry file and `file.ts` as an
argument to it). Both `apps/*/package.json` `dev` scripts already have this the right way round;
if you add a new app's `dev` script, copy the existing form rather than writing it from scratch.

**A stray dev server holds a port after `pnpm dev` seemed to stop** — `tsx watch` runs your code
in a child process separate from the one `pnpm`/`turbo` started; killing the parent (e.g. closing
a terminal window, or a script that only stops the process it launched) doesn't always stop the
child. Find it with `Get-Process -Name node` and stop it, or free the port and try again.

**`ERR_PNPM_IGNORED_BUILDS` on install** — pnpm 12 blocks dependency install scripts by
default. If a new dependency legitimately needs one (esbuild does), run
`pnpm approve-builds <package> -y`, which records it under `allowBuilds` in
`pnpm-workspace.yaml`. Don't add a `pnpm` field to `package.json` — pnpm 12 no longer reads it.

**Windows line endings** — `.gitattributes` forces LF in every working copy, so this
should be handled. If you still see CRLF churn, run `git config core.autocrlf false` in
this repo and re-checkout with `git rm --cached -r . && git reset --hard`.

**`pnpm test` fails with a Testcontainers/Docker connection error** — Docker Desktop must be
running (`docker run --rm hello-world` to check). On Windows, also confirm Docker Desktop is
actually started, not just installed — it does not auto-start after a reboot by default.

**`pnpm db:migrate` can't connect** — `pnpm db:up` first, and give it a few seconds on a first
run (pulling the `postgis/postgis` image). `pnpm db:up` waits for the healthcheck, so if it
returned, Postgres is genuinely ready; a connection error after that usually means `DATABASE_URL`
was overridden to point somewhere else.

**A migration needs redoing** — never edit a migration file that has run anywhere real.
Write a new one that corrects it. Locally only, `pnpm db:reset` wipes and rebuilds from
scratch, but that drops all local data.
