# WagonWise (working name)

HGV-aware routing app with a live, driver-fed hazard layer. Drivers set their vehicle
dimensions, get routes that avoid restrictions they can't clear (low bridges, weight and
width limits), and report hazards for other drivers — hands-free by voice while driving,
tap-to-drop when parked.

Full design: `docs/phase-1-tech-design.md` — read it before starting any milestone.
Running status and decisions: `docs/progress.md`.
The name is not final ("Wide Load Watch" was the earlier name). Keep the product name in
one config constant so it's easy to change.

## Who it's for

- First testers: a small group of UK HGV drivers around Hexham, Northumberland,
  mostly in their 40s–50s. Rural roads, patchy mobile signal.
- Later: small-to-mid UK haulage firms (staff/control portal in Phase 2).
- UX must be simple enough that an experienced driver who isn't into tech finds it obvious.

## Current phase

Phase 1 — the free driver app. Build order is milestones M1–M8 in the tech design.
**Next up: M1 Foundations.**

Out of scope right now (don't build, don't scaffold): staff portal, dispatch, job
tracking, finance/maintenance, abnormal-load compliance. Domain events exist so those
can subscribe later.

## Stack

- TypeScript everywhere, strict mode
- Monorepo: pnpm workspaces + Turborepo
- `apps/core` — Fastify host, modular monolith, clean architecture
- `apps/driver-bff` — Fastify BFF for the driver app
- `apps/staff-bff` — Fastify BFF for the dashboard's staff accounts (P2-M1.9)
- `apps/driver-app` — Expo React Native, Expo Router, TanStack Query, Zustand, expo-sqlite
- `packages/contracts` — zod schemas + inferred types shared by app, BFF and core
- Postgres + PostGIS; Valhalla (self-hosted) for truck routing; MapLibre for maps
- Kysely for queries, raw SQL migrations (PostGIS types and GiST indexes need real SQL)
- Tests: Vitest; Testcontainers for Postgres/PostGIS and Valhalla integration tests

## Architecture rules (non-negotiable)

### Layering

1. **Clean architecture inside core:** `domain/` → `application/` → `infrastructure/` +
   `interface/`. Dependencies point inward only. Enforced by `pnpm arch` (dependency-cruiser) in CI,
   not by good intentions.
   **Layers live inside each module, not above them** — the rules match on this shape:
   `apps/core/src/modules/<context>/{api.ts,domain,application,infrastructure,interface}`,
   plus four sibling folders: `shared/` (pure kernel: `Result`, branded IDs, cross-cutting
   ports), `platform/` (adapters for those ports: system clock, UUIDs, the Postgres transaction),
   `host/` (the Fastify app builder, health route, error mapping) and `composition/`. Modules
   never import `platform/`, `host/` or `composition/`; `shared/` imports none of them. Don't
   add new top-level folders in core; if the shape must change, change the rules in
   `packages/architecture` in the same commit.
2. **Domain is pure TypeScript.** No imports from Fastify, database drivers, SDKs or
   `process.env` in `domain/` — and no npm dependencies at all beyond TypeScript itself.
3. **Every external thing sits behind a port.** A module's own ports (`RoutingEngine`,
   `HazardRepository`, `PushNotifier`, `HazardParser`, `OtpSender`, `FeedbackNotifier`) are
   defined in that module's `application/` and implemented in its `infrastructure/`. The
   cross-cutting ones no single module owns — `Clock`, `IdGenerator`, `UnitOfWork` — are defined
   in `shared/ports/` and implemented in `platform/`. Pure in-memory fakes for them live in
   `shared/testing/`; use cases are tested against fakes, never mocks.
4. **`process.env` is read in exactly one place:** `apps/core/src/config.ts`, zod-validated
   at boot. Everything else receives config as arguments.
5. **Wiring lives in `apps/core/src/composition/`** — one `createXModule(deps)` factory per
   context, returning that module's facade. Manual wiring, no DI container.

### Bounded contexts

6. **`identity`, `routing`, `hazards` and `feedback` are separate modules.** A module may
   only be imported through its facade (`<module>/api.ts`) — by another module, or by anything
   else (`composition/`, `host/`). Reaching into a module's `domain/`, `application/`,
   `infrastructure/` or `interface/` from outside it fails CI either way.
7. **Cross-context reads go through a read-model port owned by the _consuming_ context,**
   with its own types, translated by an adapter in that context's `infrastructure/`.
   Routing never sees a `HazardReport`; it sees its own `ReportedObstruction`.
8. **Cross-context reactions go through domain events** (outbox table in Postgres).
9. **Event delivery is at-least-once, so every handler must be idempotent**, guarded by
   `outbox.handled (event_id, handler_name)`. A push notification sent twice is a driver
   woken twice about the same bridge.

### Boundaries outward

10. **BFFs contain no business rules.** Auth _verification_, request shaping and DTO mapping
    only. The BFF can verify tokens; it cannot issue them — core holds the only signing key.
11. **Contracts live in `packages/contracts`** as zod schemas. Don't hand-write duplicate
    types across app/BFF/core.
12. Modular monolith — no microservices.

### Conventions

13. **Expected failures are values.** `Result<T, E>` with tagged domain errors
    (`{ tag: 'VehicleTooTall', limitM: 3.7 }`), mapped to HTTP status in one table in
    `interface/`. Bugs and infrastructure faults throw and are caught by Fastify.
14. **IDs are branded types**, mirrored as zod brands in `packages/contracts` so the brand
    survives parsing at the boundary.
15. **PostGIS filters candidates; the domain decides applicability.** Spatial queries find
    what's nearby. Whether a restriction applies to a given vehicle is a pure domain
    function with no database in the test.

## Safety rules for the domain (encode as tests)

- Community hazard reports can only make routing **more** cautious. Never loosen or
  override an official restriction.
- `applies(obstruction, dimensions)` in `routing/domain/` is the most safety-critical
  function in Phase 1. Pure, exhaustively unit tested, never reimplemented in SQL.
- Voice reports are never filed publicly without driver confirmation.
- Nothing on the "active trip" screen may require typing or small taps while moving.
- Never switch a driver's route silently — reroutes are offered, the driver accepts.
- Location history: only during active trips, short retention (UK GDPR).

## How I like to work

- I have limited time and work in short sessions, often reviewing rather than typing.
- Take **one well-scoped task at a time** (one use case, one adapter, one screen).
- Write tests alongside every use case — they're how I review quickly.
- Before larger changes, give a short plan and wait for my OK.
- At the end of each task, summarise what changed, how to run/test it, and anything
  you were unsure about.
- Anything needed to get the project running — a new service, container, env var, seed
  command — goes in `README.md` in the same task that introduces it. The README is the
  source of truth for start-up; a cold start must never need a step that is not written down.
- Keep `docs/progress.md` current with milestone status, what's next and what's still open,
  so the next session can pick up without re-explaining. **Keep it short (~150 lines):** a
  milestone's task breakdown, decisions and deviations go in its own `docs/history/<milestone>.md`;
  `progress.md` gets one line plus any still-open items, and loses them once they close.
  Field-testing ideas go in `docs/ideas.md`.
- UK English in user-facing text. Show bridge heights in metres and feet/inches.

## Tooling gotchas

- **On Windows, do not write files containing backslashes through a shell heredoc or a `node -e`
  script.** Paired backslashes get collapsed, so `E:\projects\wagonwise` becomes
  `E:projectswagonwise` and `\n` in a Windows path becomes a real newline, with no error. Use the
  file-editing tools for anything holding Windows paths or regex escapes, and grep the result.
  Keep shell commands under about 5 KB; longer ones fail with a quote-matching error before
  anything runs.
- **Relative imports in `apps/core` need a `.js` suffix** (`import { ok } from './result.js'`),
  even though the file is `.ts`. That is what `module: NodeNext` requires; the compiler, tsx,
  Vitest and dependency-cruiser all map it back to the `.ts` file.
- **A new config environment variable must be added to `passThroughEnv` on the `dev` task in
  `turbo.json`**, or `pnpm dev` silently ignores it: Turborepo strips undeclared variables.
- **pnpm 12 blocks dependency install scripts** unless listed under `allowBuilds` in
  `pnpm-workspace.yaml` (use `pnpm approve-builds`). It no longer reads a `pnpm` field in
  `package.json`.
- **Architecture checks must fail closed.** A check that cannot see something must fail, not
  pass: every rule in `packages/architecture` needs a fixture proving it fires, and a rule that
  has only ever been seen passing is untested.

## Useful commands

See [`README.md`](README.md) — it holds prerequisites, first-time set-up, the full command
table and troubleshooting, and it is kept current as milestones add steps. Day to day:

```bash
pnpm verify   # lint && typecheck && test && arch && format:check — also runs on every git push
```
