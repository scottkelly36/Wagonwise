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
- `apps/driver-app` — Expo React Native, Expo Router, TanStack Query, Zustand, expo-sqlite
- `packages/contracts` — zod schemas + inferred types shared by app, BFF and core
- Postgres + PostGIS; Valhalla (self-hosted) for truck routing; MapLibre for maps
- Kysely for queries, raw SQL migrations (PostGIS types and GiST indexes need real SQL)
- Tests: Vitest; Testcontainers for Postgres/PostGIS and Valhalla integration tests

## Architecture rules (non-negotiable)

### Layering

1. **Clean architecture inside core:** `domain/` → `application/` → `infrastructure/` +
   `interface/`. Dependencies point inward only. Enforced in CI by dependency-cruiser,
   not by good intentions.
2. **Domain is pure TypeScript.** No imports from Fastify, database drivers, SDKs or
   `process.env` in `domain/` — and no npm dependencies at all beyond TypeScript itself.
3. **Every external thing sits behind a port** defined in `application/` and implemented
   in `infrastructure/`: `RoutingEngine`, `HazardRepository`, `PushNotifier`,
   `HazardParser`, `OtpSender`, `FeedbackNotifier`, `Clock`, `IdGenerator`, `UnitOfWork`.
4. **`process.env` is read in exactly one place:** `apps/core/src/config.ts`, zod-validated
   at boot. Everything else receives config as arguments.
5. **Wiring lives in `apps/core/src/composition/`** — one `createXModule(deps)` factory per
   context, returning that module's facade. Manual wiring, no DI container.

### Bounded contexts

6. **`identity`, `routing`, `hazards` and `feedback` are separate modules.** A module may
   only be imported through its facade (`<module>/api.ts`). Reaching into another module's
   `domain/` or `application/` fails CI.
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
- Keep `docs/progress.md` current with milestone status and decisions made, so the
  next session can pick up without re-explaining.
- UK English in user-facing text. Show bridge heights in metres and feet/inches.

## Useful commands

See [`README.md`](README.md) — it holds prerequisites, first-time set-up, the full command
table and troubleshooting, and it is kept current as milestones add steps. Day to day:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```
