# WagonWise (working name)

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
pnpm lint && pnpm typecheck && pnpm test && pnpm arch && pnpm format:check
```

Then start the core service and check it answers:

```bash
pnpm dev
```

```bash
curl http://127.0.0.1:3001/health
```

You should see `{"status":"ok","service":"core","product":"WagonWise","time":"…"}`. Core needs
no environment variables to run locally — every one has a default, and the database default
matches `pnpm db:up`'s compose service (see below).

## Configuration

Core reads its environment in exactly one place, `apps/core/src/config.ts`, validated at boot.
An invalid value stops the process with a message naming every problem, rather than starting
half-configured.

| Variable               | Default                                                   | Notes                                                                    |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`             | `development`                                             | `development`, `test` or `production`                                    |
| `HOST`                 | `127.0.0.1`                                               | Use `0.0.0.0` inside a container                                         |
| `PORT`                 | `3001`                                                    | 1–65535                                                                  |
| `LOG_LEVEL`            | `info`                                                    | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`             |
| `DATABASE_URL`         | `postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise` | Matches `pnpm db:up`'s compose service; `postgres://` or `postgresql://` |
| `IDENTITY_PRIVATE_KEY` | unset (fresh key each boot)                               | PEM, PKCS8, Ed25519 only — see Identity, below                           |

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
| `pnpm dev`          | Run core with reload on change (port 3001)                                    |
| `pnpm lint`         | ESLint across every package, via Turborepo                                    |
| `pnpm typecheck`    | `tsc --noEmit` across every package                                           |
| `pnpm test`         | Vitest across every package                                                   |
| `pnpm build`        | Build every package                                                           |
| `pnpm arch`         | Architecture rules against `apps/` (see below)                                |
| `pnpm format`       | Prettier write                                                                |
| `pnpm format:check` | Prettier check — this is what CI runs                                         |
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

Valhalla (self-hosted truck routing, needed from M2) is also in `infra/docker/compose.yml` but
not started by `pnpm db:up` — see the comment in that file for bringing it up once you have a
map extract. Not required for M1.4.

## Identity (sign-in)

`identity` is the reference bounded context (M1.5) — OTP sign-in, Ed25519-signed access tokens,
refresh rotation with reuse detection, invite codes. Endpoints (all on core directly; there is no
BFF yet — see `apps/core/src/modules/identity/interface/routes.ts`):

| Route                                 | Does                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| `POST /identity/otp/request`          | `{ identifier, inviteCode? }` — sends a one-time code |
| `POST /identity/otp/verify`           | `{ identifier, code, inviteCode? }` — returns tokens  |
| `POST /identity/token/refresh`        | `{ refreshToken }` — rotates, returns new tokens      |
| `POST /identity/sessions/:id/revoke`  | Sign-out                                              |
| `GET /identity/.well-known/jwks.json` | The public key, for a BFF to verify tokens with       |

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

## Repo layout

```
apps/
  core/           core service — Fastify host, modular monolith   ✅ identity wired end to end
  driver-bff/     Fastify BFF for the driver app                  (M1.6)
  driver-app/     Expo React Native app                           (M5)
packages/
  config/         shared tsconfig / ESLint / Prettier presets     ✅
  architecture/   dependency-cruiser rules + fixtures + tests     ✅
  contracts/      zod schemas + inferred types shared everywhere  (M1.6)
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

Only `packages/config`, `packages/architecture`, `infra/docker` and `apps/core` (with a database
layer and the identity module) exist so far. The rest arrive with the milestone shown.

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
