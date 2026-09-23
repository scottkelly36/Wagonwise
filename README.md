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

| Variable               | Default                                                   | Notes                                                                                   |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`             | `development`                                             | `development`, `test` or `production`                                                   |
| `HOST`                 | `127.0.0.1`                                               | Use `0.0.0.0` inside a container                                                        |
| `PORT`                 | `3001`                                                    | 1–65535                                                                                 |
| `LOG_LEVEL`            | `info`                                                    | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                            |
| `DATABASE_URL`         | `postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise` | Matches `pnpm db:up`'s compose service; `postgres://` or `postgresql://`                |
| `IDENTITY_PRIVATE_KEY` | unset (fresh key each boot)                               | PEM, PKCS8, Ed25519 only — see Identity, below                                          |
| `INTERNAL_KEYS`        | `local-dev-internal-key`                                  | Comma-separated; a BFF must send one in `X-Internal-Key` on everything except `/health` |
| `VALHALLA_URL`         | `http://127.0.0.1:8002`                                   | Matches `infra/docker/compose.yml`'s `valhalla` service (see Routing, below)            |

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

`identifier` is an email or a UK-ish phone number. `inviteCode` is required only the first time —
signing in with an identifier that has no Driver yet needs one. There's no admin endpoint to
create invite codes yet (that's staff-portal territory, out of scope — AGENTS.md); seed one
directly for local testing:

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

| Route                               | Does                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `POST /hazards/reports`             | `{ id, type, location, note?, measurement?, source }` — reports one  |
| `POST /hazards/reports/:id/confirm` | "Still there" — increments confirmations                             |
| `POST /hazards/reports/:id/dismiss` | "Not there" — increments dismissals, auto-dismisses past a threshold |

`id` is client-generated (an offline-queue idempotency key — resubmitting the same `id` returns
the existing report unchanged, or merges into it, rather than duplicating). No `reporterId` field
(M4.3) — same reasoning as routing's `driverId`, core derives it from the access token. Confirm and
dismiss need a valid token too, but not any particular one — any authenticated driver may act on
any report (decision 63, no ownership check on community moderation).

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

## Driver app

`apps/driver-app` (M5, in progress — M5.1 skeleton, M5.2 sign-in) — Expo + Expo Router, targeting
both iOS and Android. No native Xcode/Android Studio project is checked in; Expo generates those
on demand (`expo prebuild`, or transparently when EAS Build runs).

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
both platforms, ready for TestFlight and Google Play internal testing (M5.10) — not yet linked to
a real Expo account/project (`eas login` + `eas init` are one-time, interactive steps only you can
do). **Not yet verified on a real simulator/device or Expo Go** — this machine has no Android SDK
and no macOS, so verification so far is `expo export --platform android|ios` (a real Metro bundle,
proves every import resolves and Hermes compiles it) plus `expo-doctor` (21/21 checks), not an
actual running app. Worth a real run on your phone via Expo Go before trusting the BFF connectivity
logic (`src/config.ts`) beyond what its unit tests cover.

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

## Repo layout

```
apps/
  core/           core service — Fastify host, modular monolith   ✅ identity wired end to end
  driver-bff/     Fastify BFF for the driver app                  ✅ identity, routing, hazards
  driver-app/     Expo React Native app, iOS + Android             🚧 M5.1 skeleton only
packages/
  config/         shared tsconfig / ESLint / Prettier presets     ✅
  architecture/   dependency-cruiser rules + fixtures + tests     ✅
  contracts/      zod schemas + inferred types shared everywhere  ✅ identity's shapes so far
infra/
  docker/         compose for local Postgres/PostGIS + Valhalla   ✅
  deploy/         hosting config                                  (later)
docs/
  phase-1-tech-design.md    the design — read before any milestone
  progress.md               milestone status and decisions log
```

Inside `apps/core/src` (the shape the architecture rules enforce):

```
shared/         pure kernel: Result, branded IDs, cross-cutting ports, test fakes
platform/       adapters for those ports: system clock, UUID generator, Postgres/Kysely, migrations
host/           Fastify app builder, health route, error handling
composition/    the one place that wires ports to adapters
config.ts       the one place that reads the environment
modules/        bounded contexts — identity (M1.5); routing, hazards, feedback not started
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

Everything listed above is real. `apps/driver-app` has only the M5.1 skeleton so far (a health
check screen, no real screens yet); core's `routing` and `hazards` modules are real from M2/M3,
`feedback` hasn't started.

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
