# Progress

## Status

| Milestone            | Status                       |
| -------------------- | ---------------------------- |
| M1 Foundations       | In progress — M1.1–M1.2 done |
| M2 Routing core      | Not started                  |
| M3 Hazards core      | Not started                  |
| M4 Driver BFF + auth | Not started                  |
| M5 Driver app        | Not started                  |
| M6 Alerts            | Not started                  |
| M7 Voice             | Not started                  |
| M8 Field-ready       | Not started                  |

## Decisions made before coding (from planning)

- Architecture mirrors day-job pattern: one core service (source of truth) + thin BFF per client.
- Clean architecture + DDD; modular monolith with `identity`, `routing`, `hazards` contexts.
- Valhalla for truck routing behind a `RoutingEngine` port; GraphHopper as fallback.
- Hands-free voice reporting is essential (primary way to report while driving), with
  confirm-before-filing. Tap-to-drop stays for parked use.
- Phase 0 (sample-network prototype) is done; skipping straight to real maps.
- Working name WagonWise (not final — trademark/domain checks pending).

## Decisions from architecture review (2026-09-21)

Taken before M1 so they don't have to be retrofitted. Full detail in
`docs/phase-1-tech-design.md`; the enforceable ones are rules in `CLAUDE.md`.

1. **Auth: core issues, BFF verifies.** Ed25519 asymmetric signing — core holds the private
   key, BFF reads the public key from core's JWKS. The BFF is physically unable to mint a
   token, so "BFFs contain no business rules" is a property of the system, not a convention.
   Access token 15 min, refresh 60–90 days with rotation and reuse detection. Core derives
   `driverId` from the token signature, never from a BFF-supplied field.
2. **Cross-context reads use a read-model port owned by the consuming context**, with its
   own types, translated by an adapter in that context's `infrastructure/`. Routing never
   sees a `HazardReport`. Enforced by dependency-cruiser in CI.
3. **`applies(obstruction, dimensions)` is a pure routing-domain function.** PostGIS filters
   candidates spatially; the domain decides whether a restriction affects a given vehicle.
   The height comparison never goes into SQL. Most safety-critical function in Phase 1.
4. **Transactions:** aggregates collect events, `repository.save()` writes rows + outbox in
   one transaction. A `UnitOfWork` port exists only for multi-aggregate operations.
5. **Outbox dispatch:** in-process poller, `FOR UPDATE SKIP LOCKED`, at-least-once delivery.
   Every handler idempotent, guarded by `outbox.handled (event_id, handler_name)`.
   Backoff, dead-letter after 5 attempts, `drainOnce()` for tests.
6. **Errors:** hand-rolled `Result<T, E>` for expected failures (keeps domain dependency-free),
   exceptions for bugs and infra faults. Tagged domain errors mapped to HTTP in one table.
7. **Branded ID types**, mirrored as zod brands in `packages/contracts`.
8. **Config read in one place** (`apps/core/src/config.ts`, zod-validated). Manual composition
   root per module, no DI container.
9. **Feedback is its own small module**; invite codes belong to Identity.
10. **No RoutePlan lifecycle in Phase 1.** Alerts cover active trips plus plans created in the
    last 6 hours. Add `plannedFor` only if testers actually plan the night before.
11. **Service-to-service auth:** private networking plus a rotatable `X-Internal-Key` with
    constant-time compare. Two valid keys accepted at once. mTLS deferred.
12. **Persistence:** Kysely for queries, raw SQL migrations (PostGIS geography + GiST indexes).
13. **CI tiering:** per-PR runs lint/typecheck/architecture/unit/application/PostGIS;
    Valhalla golden routes run nightly and on map rebuild against prebuilt tiles.
14. **Schema additions:** `identity.sessions`, `identity.invite_codes`, `feedback.notes`,
    `outbox.handled`.

## Open questions

| Question                                                                      | Needed by                     |
| ----------------------------------------------------------------------------- | ----------------------------- |
| How complete is OSM restriction data on testers' actual routes around Hexham? | before M2 ends                |
| iOS, Android or both for the first testers?                                   | before M5 starts              |
| On-device speech recognition good enough with local accents and cab noise?    | before M7 (cheap to test now) |

Decided 2026-09-21, revisit with testers: temporary hazard expiry 7 days; single unconfirmed
reports visible immediately, labelled "1 report, unconfirmed".

## M1 task breakdown

| #    | Task                                 | Status                |
| ---- | ------------------------------------ | --------------------- |
| M1.1 | Monorepo skeleton                    | Done — 2026-09-21     |
| M1.2 | Architecture enforcement             | Done — 2026-09-21     |
| M1.3 | Core skeleton + shared kernel        | Next                  |
| M1.4 | Database, migrations, docker compose | Not started — blocked |
| M1.5 | `identity` as reference module       | Not started           |
| M1.6 | `driver-bff` + vertical slice        | Not started           |
| M1.7 | CI (GitHub Actions per-PR tier)      | Not started           |

**M1.1 delivered:** pnpm workspace (`apps/*`, `packages/*`) with Turborepo, git repo,
`packages/config` holding the shared tsconfig base, ESLint flat config and Prettier config.
Turbo telemetry disabled. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm format:check`
all run clean.

**M1.4 is blocked on Docker Desktop** not being installed on this machine. Nothing before
M1.4 depends on it.

**M1.2 delivered:** `packages/architecture` — a dependency-cruiser ruleset with eight rules,
a clean reference fixture, nine deliberately-broken fixtures (at least one per rule), and a test asserting each
violating fixture trips _exactly_ its own rule (and that every rule has a fixture). `pnpm arch`
runs the rules against `apps/`; it exits 1 on a violation and 0 on clean code, both verified
against the real path, not just the fixtures.

Three defects were found and fixed while building it, all of the "fails open" kind:

1. `exclude: node_modules` deleted the edge from the graph, so the npm-purity rules could never
   see a domain file importing `zod`. Fixed with `doNotFollow` only. Mutation-tested: putting it
   back fails exactly the two npm-purity tests.
2. Packages not declared in a `package.json` are classed `npm-no-pkg` / `npm-unknown`, not `npm`,
   so the rule missed them. It now covers every npm classification.
3. An import that cannot be resolved is classed `unknown` and matched nothing, so a domain file
   importing a missing package passed every check. New `no-unresolvable` rule fails closed.

Also: the fixtures' stub `node_modules/zod` were being dropped by `.gitignore`, which would have
made CI fail on a fresh clone while passing locally. Re-included explicitly.

## Decisions from M1.2

15. **Layers live inside each module**, not above them:
    `apps/core/src/modules/<context>/{api.ts,domain,application,infrastructure,interface}` plus
    `src/shared/` and `src/composition/`. The rules need this shape to tell "same module" from
    "other module". Recorded in AGENTS.md rule 1 and the design doc's §2 diagram, which previously
    drew the layers directly under core.
16. **Rule numbers in AGENTS.md are stable identifiers** — the dependency-cruiser rule comments and
    the design doc cite them. Add new rules at the end; don't renumber.
17. **Architecture checks fail closed.** A check that can't see something must fail, not pass.

## Environment notes

- Node 24.21, git 2.55 present. pnpm 12.5.1 via corepack (`corepack enable pnpm`).
- pnpm 12 blocks install scripts by default; allowed ones are listed under `allowBuilds` in
  `pnpm-workspace.yaml` (currently esbuild). The `pnpm` field in package.json is no longer read.
- Docker not installed yet — needed from M1.4 onwards (Postgres/PostGIS + Valhalla).

## Next session

M1.3 — core skeleton and shared kernel: Fastify host, zod-validated `config.ts`, `shared/` with
`Result` and branded IDs, `Clock` / `IdGenerator` / `UnitOfWork` ports with real and fake
implementations, the composition root, and a health route. `pnpm arch` starts checking real code
from here, so the first thing to confirm is that it passes on what M1.3 writes.
