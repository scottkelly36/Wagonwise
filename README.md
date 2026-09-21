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
| Docker Desktop | any     | M1.4        | Postgres/PostGIS + Valhalla; **not yet required** |

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

That's the whole set-up today. Verify it worked:

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
no environment variables to run locally — every one has a default (see below).

## Configuration

Core reads its environment in exactly one place, `apps/core/src/config.ts`, validated at boot.
An invalid value stops the process with a message naming every problem, rather than starting
half-configured.

| Variable    | Default       | Notes                                                        |
| ----------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development`, `test` or `production`                        |
| `HOST`      | `127.0.0.1`   | Use `0.0.0.0` inside a container                             |
| `PORT`      | `3001`        | 1–65535                                                      |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

```bash
PORT=4000 LOG_LEVEL=debug pnpm dev
```

More variables arrive with the milestones that need them (`DATABASE_URL` in M1.4). Each one
must also be added to `passThroughEnv` on the `dev` task in `turbo.json`, or `pnpm dev`
will ignore it.

## Everyday commands

| Command             | Does                                           |
| ------------------- | ---------------------------------------------- |
| `pnpm install`      | Install workspace dependencies                 |
| `pnpm dev`          | Run core with reload on change (port 3001)     |
| `pnpm lint`         | ESLint across every package, via Turborepo     |
| `pnpm typecheck`    | `tsc --noEmit` across every package            |
| `pnpm test`         | Vitest across every package                    |
| `pnpm build`        | Build every package                            |
| `pnpm arch`         | Architecture rules against `apps/` (see below) |
| `pnpm format`       | Prettier write                                 |
| `pnpm format:check` | Prettier check — this is what CI runs          |

Turborepo caches task results locally in `.turbo/`. If a task result looks stale,
`pnpm lint --force` (or any task) re-runs it ignoring the cache.

## Repo layout

```
apps/
  core/           core service — Fastify host, modular monolith   ✅ skeleton
  driver-bff/     Fastify BFF for the driver app                  (M1.6)
  driver-app/     Expo React Native app                           (M5)
packages/
  config/         shared tsconfig / ESLint / Prettier presets     ✅
  architecture/   dependency-cruiser rules + fixtures + tests     ✅
  contracts/      zod schemas + inferred types shared everywhere  (M1.6)
infra/
  docker/         compose for local Postgres/PostGIS + Valhalla   (M1.4)
  deploy/         hosting config                                  (later)
docs/
  phase-1-tech-design.md    the design — read before any milestone
  progress.md               milestone status and decisions log
```

Inside `apps/core/src` (the shape the architecture rules enforce):

```
shared/         pure kernel: Result, branded IDs, cross-cutting ports, test fakes
platform/       adapters for those ports: system clock, UUID generator
host/           Fastify app builder, health route, error handling
composition/    the one place that wires ports to adapters
config.ts       the one place that reads the environment
modules/        bounded contexts — none yet, identity arrives in M1.5
```

Only `packages/config`, `packages/architecture` and a skeleton `apps/core` exist so far. The rest arrive with the milestone shown.

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
