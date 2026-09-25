# Progress

## Status

| Milestone            | Status            |
| -------------------- | ----------------- |
| M1 Foundations       | Done — 2026-09-22 |
| M2 Routing core      | Done — 2026-09-22 |
| M3 Hazards core      | Done — 2026-09-22 |
| M4 Driver BFF + auth | Done — 2026-09-22 |
| M5 Driver app        | In progress       |
| M6 Alerts            | Done — 2026-09-24 |
| M7 Voice             | Done — 2026-09-24 |
| M8 Field-ready       | Not started       |

## Decisions made before coding (from planning)

- Architecture mirrors day-job pattern: one core service (source of truth) + thin BFF per client.
- Clean architecture + DDD; modular monolith with `identity`, `routing`, `hazards` contexts.
- Valhalla for truck routing behind a `RoutingEngine` port; GraphHopper as fallback.
- Hands-free voice reporting is essential (primary way to report while driving), with
  confirm-before-filing. Tap-to-drop stays for parked use.
- Phase 0 (sample-network prototype) is done; skipping straight to real maps.
- Name WagonWise — finalised 2026-09-25: UK IPO trademark search came back clear, and
  `wagon-wise.com`/`.co.uk`/`.app` are bought (registrar: Spaceship).

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

## Ideas from field testing (not scheduled)

Things worth building later, raised while actually using the app rather than planning it —
not attached to a milestone yet.

- **2026-09-25: text-to-speech for navigation** — spoken turn-by-turn directions and, more
  specifically for this app, a spoken warning as an upcoming hazard on the route approaches
  (rather than only a silent on-map icon/push notification). Complements M7's voice _input_
  (speech-to-text for reporting) with voice _output_; no design or scoping done yet.
- **2026-09-25: break suggestions** — UK HGV drivers have a statutory break requirement (45
  minutes after 4.5 hours' driving, tachograph rules), so a spoken nudge ("your break's due in
  15 minutes, there's a layby 5 minutes ahead") could genuinely help, not just be a nice-to-have.
  The user's own read: **this is a big feature**, not a quick add — it needs real drive-time
  tracking against the actual regulation (not just elapsed trip time), and a layby/food-stop POI
  data source the app doesn't have at all yet (OSM has some coverage — `highway=rest_area`,
  `amenity=parking`, `amenity=restaurant`/`cafe`/`fast_food` — but nothing's been checked for
  completeness around the test area). Would likely reuse whatever voice-output mechanism the
  text-to-speech idea above ends up using.
- **2026-09-25: congestion tracking** — the user's own framing: country roads in the test area
  rarely see real traffic, but a congested motorway can add a lot to a journey, so this matters
  more for the A1-type corridors than the rural roads M2's routing already focuses on. Two
  options discussed:
  - Crowd-sourced via the existing hazard-report system (a "traffic" report type) — zero new
    cost, reuses everything already built, but only as good as driver density, which is thin
    with a handful of testers (same cold-start problem every crowd-sourced traffic app has).
  - **National Highways' WebTRIS API** — confirmed genuinely free, no API key or registration
    (`webtris.nationalhighways.co.uk/api/v1.0/...`, JSON), covers England's strategic road
    network (motorways + major A-roads, including the A1 corridor near the test area). It's
    point-based sensor data (speed/flow at fixed monitoring sites), not a route overlay, so
    using it would mean translating "sensor X reads slow" into "this stretch of the driver's
    planned route is congested" — real work, but on a real, free, already-confirmed data source
    rather than a guess.

## M1 task breakdown

| #    | Task                                 | Status            |
| ---- | ------------------------------------ | ----------------- |
| M1.1 | Monorepo skeleton                    | Done — 2026-09-21 |
| M1.2 | Architecture enforcement             | Done — 2026-09-21 |
| M1.3 | Core skeleton + shared kernel        | Done — 2026-09-21 |
| M1.4 | Database, migrations, docker compose | Done — 2026-09-22 |
| M1.5 | `identity` as reference module       | Done — 2026-09-22 |
| M1.6 | `driver-bff` + vertical slice        | Done — 2026-09-22 |
| M1.7 | CI (GitHub Actions per-PR tier)      | Done — 2026-09-22 |

**M1.1 delivered:** pnpm workspace (`apps/*`, `packages/*`) with Turborepo, git repo,
`packages/config` holding the shared tsconfig base, ESLint flat config and Prettier config.
Turbo telemetry disabled. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm format:check`
all run clean.

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

**M1.3 delivered:** `apps/core` boots and answers `GET /health`. `shared/` holds `Result`,
branded IDs, the `Clock` / `IdGenerator` / `UnitOfWork` ports and pure in-memory fakes;
`platform/` holds the real `SystemClock` and `UuidIdGenerator`; `host/` is the Fastify app with
request-ID handling and an error handler that never leaks a 5xx message; `config.ts` is the one
zod-validated reader of the environment; `composition/` wires ports to adapters and takes
overrides so tests run the whole stack on fakes. 59 core tests and 16 architecture tests, all
green; `pnpm arch` passes on real code (34 modules, 57 dependencies).

Verified by actually running it, not only `inject()`: the compiled build (no test or fake files in
`dist/`) and `pnpm dev` both serve `/health`; bad config exits 1 naming every problem; an
inbound `x-request-id` is echoed back.

## Decisions from M1.3

18. **Cross-cutting ports live in `shared/ports/`, not in a module's `application/`**, because no
    module owns them. Implementations live in `platform/`, fakes in `shared/testing/`. AGENTS.md
    rule 3 updated; the design doc's `Clock`/`IdGenerator` mentions stand.
19. **Three sibling folders added to core: `platform/`, `host/`, `composition/`** — with rules
    that the kernel imports none of them and modules import none of them. Three new rules in
    `packages/architecture` cover this.
20. **Test files are exempt from the domain's no-npm rule** (they import vitest); non-test domain
    files are not, and a fixture proves the exemption is narrow.
21. **`process.env` is guarded by a test, not a lint rule.** `conventions.test.ts` scans `src/`
    for readers other than `config.ts`, and tests its own detector against good and bad samples.
    Best-effort: it cannot see `globalThis.process.env`.
22. **`pnpm arch` scopes to `apps/*/src`**, not whole app directories. Package-root config files
    are tooling, not architecture.
23. **The developer task runner is pnpm, not make.** `make` is not installed on Windows and runs
    recipes through cmd.exe by default, so Makefiles written for Linux or Mac break. Database and
    stack tasks will be `pnpm db:up`, `db:down`, `db:migrate` and `db:reset`, wrapping
    `docker compose`. A thin Makefile that only delegates to those scripts can be added later if
    wanted; the README documents pnpm.

## Deviations and open items from M1.3

- **Real `UnitOfWork` deferred to M1.4.** The task description said "real and fake"; a Postgres
  transaction adapter can't exist before the database does. The port and a contract-enforcing fake
  (commit/rollback recording, no nesting) exist now.
- **Composition-root vs module facade: decided and now enforced (decision 29).** Factories live
  in each module's `api.ts` (module wires its own adapters, `composition/` just calls it) —
  chosen over exempting `composition/` from the facade rule, since a module's own facade is the
  natural seam and needs no new exception.
- **Graceful shutdown is untested on this machine.** Windows does not deliver SIGTERM, so the
  handler in `main.ts` has only been exercised by reading it. It targets Linux containers.

Five more defects were caught while building this, each by a test or a real run that failed
rather than by inspection: a `dist` exclude that hid npm packages from the purity rules; a
test-file exemption regex that lost its backslashes and matched far too broadly; missing export
conditions that made legitimate subpath imports (`vitest/config`) fail `no-unresolvable`;
Turborepo silently dropping `PORT` and `LOG_LEVEL`; and a gitignore ordering bug that would have
dropped fixture stubs on a fresh clone.

**M1.4 delivered:** `infra/docker/compose.yml` (Postgres 16 + PostGIS 3.4, healthchecked,
credentials matching `DATABASE_URL`'s default so a fresh clone needs no `.env`); a raw-SQL
migration runner (`apps/core/src/platform/migrations/run-migrations.ts`, tracked in
`public.schema_migrations`, one transaction per file, fails closed — a bad statement rolls back
that whole file and leaves it unrecorded) with a CLI entry point (`apps/core/scripts/migrate.ts`,
run via `tsx`, no build step); the first migration (`0001_init.sql`: the `identity`, `routing`,
`hazards`, `feedback` and `outbox` schemas, `outbox.events`, `outbox.handled`, the `postgis`
extension); the real `PostgresUnitOfWork` (Kysely-backed, same commit/rollback/no-nesting
contract `InMemoryUnitOfWork` enforces); `DATABASE_URL` wired through `config.ts`, `.env.example`,
`turbo.json` `passThroughEnv` and the README; and `.env` loading via Node's native
`--env-file-if-exists` (no `dotenv` dependency). `pnpm db:up` / `db:down` / `db:migrate` /
`db:reset` at the repo root (decision 23).

Verified for real, not just by unit test: `pnpm db:up` pulled and started the actual compose
service; `pnpm db:migrate` ran against it twice (applies once, second run is a genuine no-op);
`psql` confirms the five schemas, the two outbox tables, the `postgis` extension and the
`schema_migrations` row all exist. `pnpm test` covers the migration runner and
`PostgresUnitOfWork` against an ephemeral Testcontainers PostGIS instance (commit persists,
throw rolls back, nesting is rejected, a bad migration file rolls back in full) — 74 core tests

- 16 architecture tests, all green, `pnpm arch` clean (43 modules, 80 dependencies).

## Decisions from M1.4

24. **`DATABASE_URL` defaults to match `infra/docker/compose.yml` exactly.** `pnpm db:up && pnpm
db:migrate` needs zero configuration, extending the "a cold start never needs an undocumented
    step" rule to the database, the same way every other config variable already works.
25. **Migrations are tracked in `public.schema_migrations`, not a bounded-context schema.** The
    four context schemas and `outbox` are themselves created by the first migration, so the
    tracking table can't live inside one of them without a chicken-and-egg problem; `public`
    always exists.
26. **`UnitOfWork`'s `Transaction` stays fully opaque in `shared/ports/`** — no Kysely or `pg`
    import in the kernel, keeping rule 2 intact. `platform/postgres-unit-of-work.ts` is the only
    place that knows it's really a Kysely `Transaction<Database>`, via two named cast functions
    (`asTransaction` in, `asKyselyTransaction` out). A module's `infrastructure/` will call
    `asKyselyTransaction` directly once a repository exists — a type-only cast, not an import of
    `platform/`, so it doesn't trip `modules-no-outward`. Decided ahead of need; not yet exercised
    by a real repository, so the ergonomics are unproven.
27. **`.env` loading uses Node's `--env-file-if-exists`, not a `dotenv` dependency.** Zero
    dependencies, and optional by design — every variable already has a working default, so `.env`
    only exists to override one.
28. **Valhalla's compose service is defined but not started by `pnpm db:up`** (compose
    `profiles: ['valhalla']`). It needs a manually-downloaded OSM extract and has real work to do
    only from M2, so gold-plating it now would be untestable guesswork. **Not verified against
    real tiles** — treat the service definition as a draft to check when M2 needs a working
    `RoutingEngine` adapter, not as proven.
29. **New dependency-cruiser rule: `modules-reachable-only-through-api`.** Closes the gap found
    while confirming the M1.3 composition-root decision: `no-cross-module-internals` only fires
    when the _importer_ is itself under `modules/`, so `composition/`, `host/` or anything else
    outside `modules/` could reach past a module's `api.ts` straight into its `domain/` and the
    ruleset said nothing, despite the config's own header comment claiming otherwise. Proven by a
    new violation fixture (`composition-imports-module-internals`) before the fix, per the
    fail-closed convention. AGENTS.md rule 6 reworded to say so explicitly.

## Deviations and open items from M1.4

- **Valhalla is unverified**, per decision 28 — no extract has been downloaded on this machine,
  so the compose service has never actually started. Revisit at M2.
- **Decision 26 turned out to be wrong** — see decision 30 in M1.5, which supersedes it.
- **ssh2's optional native crypto binding failed to build** (no C++ toolchain/Python on this
  machine) during `pnpm approve-builds`. Harmless: Testcontainers only uses ssh2 for Docker-over-
  SSH, which this project doesn't use locally, and it falls back to pure-JS crypto. Revisit only
  if remote Docker hosts (e.g. a CI runner without a local daemon) become relevant.

**M1.5 delivered:** the reference bounded context, all four layers, wired end to end and
verified against a real running server, not only tests.

- **`domain/`** (pure, no I/O): `Driver`, `Session` (hash rotation + a sliding 60-day refresh
  window + revocation, one function deciding all three outcomes), `Otp` (verify + rate-limit in
  one call, since a wrong guess is itself a state change the caller must persist either way),
  `InviteCode` (redeem), `normalizeIdentifier` (email or a UK-ish phone number, hand-rolled regex
  — no npm allowed here, rule 2). Style: plain data + free functions throughout, no entity
  classes, matching `Result`/`shared/brand.ts`'s existing shape.
- **`application/`**: `requestOtp`, `verifyOtp` (creates the Driver and redeems the invite code
  atomically via `UnitOfWork` on first sign-in), `refreshToken`, `revokeSession` (idempotent —
  sign-out never fails for tapping it twice). Six module-owned ports (repositories × 4,
  `OtpSender`, `OtpCodeGenerator`, `RefreshTokenGenerator`, `TokenSigner`), each with an
  in-memory/fake test double. `sha256Hex` is a plain function, not a port — pure and
  deterministic, unlike `Clock`/`IdGenerator`, so it needs no fake to be testable.
- **`infrastructure/`**: four Postgres repositories (raw `sql` tagged-template queries — see
  decision 30); `Ed25519TokenSigner` (`node:crypto` for keys, `jose` for JWT mechanics — jose
  accepts a Node `KeyObject` directly, confirmed by hand before committing to the design);
  `CryptoOtpCodeGenerator` / `CryptoRefreshTokenGenerator` (`node:crypto`'s CSPRNG);
  `ConsoleOtpSender` (dev-only — logs the code; a real SMS/email adapter needs a provider account
  and is deferred until one is chosen).
- **`interface/`**: `POST /identity/otp/request`, `/otp/verify`, `/token/refresh`,
  `/sessions/:id/revoke`, `GET /identity/.well-known/jwks.json`. One `statusFor()` table mapping
  all 13 domain error tags to an HTTP status (rule 13), exhaustiveness-checked. Request bodies
  validated inline with zod for now — `packages/contracts` (the shared version) is M1.6.
- **Migration `0002_identity.sql`**: `identity.drivers`, `.sessions`, `.invite_codes`,
  `.otp_codes`, with the indexes `findByRefreshTokenHash`'s two-column lookup and
  `findLatestFor`'s ordered-by-recency lookup both need.
- **`config.ts`**: `IDENTITY_PRIVATE_KEY`, optional, PEM/PKCS8/Ed25519-only, validated at boot.
  Unset means a fresh key generated at boot (fine for local dev, restarts invalidate sessions).
- **`compose-core.ts`**: now opens the real `pg.Pool`, wires identity's Postgres repositories,
  the real `PostgresUnitOfWork`, and the token signer; `Core` gained `close()` (closes the app
  and the pool) since `composeCore` now owns a real resource with a lifetime. `tokenSigner` is
  built once in `main.ts` (async — key generation/import) and passed in, since `composeCore`
  itself stays synchronous.

195 tests, all green (178 core + 17 architecture); `pnpm arch` clean (99 modules, 318
dependencies).

**Verified by actually running it**, matching M1.3's standard, not only `app.inject()`: built
`dist/`, ran `node dist/main.js` against the real `pnpm db:up` Postgres, and drove the whole
flow with `curl` — requested an OTP, read the code back out of the console log (confirming
`ConsoleOtpSender` really is what's wired for local dev), got the wrong code once (401,
`attemptsRemaining` counted down correctly), verified with the right one and a seeded invite
code, fetched a real Ed25519-signed JWT and checked its claims by eye, hit the JWKS route,
refreshed the token once (rotated correctly), replayed the now-rotated-away token and confirmed
it came back `RefreshTokenReused` — then confirmed in `psql` that the replay had actually
revoked the session, not just rejected that one request. Revoked a session directly and
confirmed `revoked_at` was set. Test data cleaned up afterwards.

## Decisions from M1.5

30. **Decision 26 (M1.4) was wrong — superseded.** It claimed a module's `infrastructure/` could
    call `platform/postgres-unit-of-work.ts`'s `asKyselyTransaction` directly because "a
    type-only cast... doesn't trip `modules-no-outward`". It does: dependency-cruiser has no
    type-only-import exemption on that rule, so even `import type { X } from '../../../platform/…'`
    is a real edge in its graph and a real violation. Caught by actually writing the repository
    code, not by review. **The actual design**: a module's `infrastructure/` never imports
    `platform/` at all, even for a type. Repositories take a `Kysely<Record<string, unknown>>`
    (a module-local `UntypedDb` type, defined inside `identity/infrastructure/`) built by
    `composition/` and query with raw `sql` tagged templates, never Kysely's typed query
    builder. `composeCore` builds two separate Kysely wrappers around the one underlying
    `pg.Pool` — `Kysely<Database>` for `PostgresUnitOfWork`, a second, differently-typed one for
    identity — because `Kysely<Database>` is not assignable to `Kysely<Record<string, unknown>>`
    (its methods use the schema type both co- and contravariantly; confirmed by the compiler,
    not assumed).
31. **`identity/api.ts` re-exports the port types `composition/` needs** (`TokenSigner`,
    `OtpSender`, `UntypedDb`) rather than composition importing them from `application/ports/`
    directly — the same `modules-reachable-only-through-api` rule (decision 29) applies to
    composition as much as to any other outside caller, and re-exporting through the facade is
    the fix, not an exception to it.
32. **`Otp.verify()` returns `{ outcome, next }`, not a plain `Result`.** A wrong guess is a
    state change (attempts + 1) the caller must persist regardless of the verdict — returning
    both from one call means the use case has exactly one thing to save either way, rather than
    a second function to remember to call on the failure path.
33. **Session refresh uses a two-hash design (current + previous), not a full rotation-chain
    table.** Decision 1 asks for "a second use of a rotated token revokes the whole session" —
    the immediately-prior use, not arbitrarily far back — so keeping one previous hash catches
    exactly that case without a separate table or normalising to one-row-per-rotation.
34. **OTP delivery is `ConsoleOtpSender` only; no invite-code-issuing endpoint exists.** Both are
    genuinely out of scope for a reference module: a real SMS/email adapter needs a provider
    account (an external decision, not an architectural one), and creating invite codes is
    staff-portal territory (AGENTS.md: explicitly out of scope for Phase 1). Codes are seeded
    directly via SQL for now (README, Identity section).
35. **`sha256Hex` is a plain function in `application/`, not a port.** Unlike `Clock`/
    `IdGenerator`, hashing is pure and deterministic — nothing about it needs to be fake for a
    test to be deterministic, so wrapping it in a port would add a seam with nothing on the
    other side of it.

## Deviations and open items from M1.5

- **`packages/contracts` resolved in M1.6** — see decisions 37/41, below.
- **No real SMS/email `OtpSender`.** Needs a provider decision (Twilio? AWS SNS? Vonage?) and an
  account — worth raising before M4 (Driver BFF + auth) needs testers to actually receive codes
  on real phones with patchy Hexham signal. Still true after M1.6.
- **No invite-code-issuing endpoint or admin tooling.** Seed via SQL for now (README). Revisit
  if manually running `psql` for every tester becomes annoying before a staff portal exists.
- **The invite-code-redemption race is a thrown exception, not a `Result`.** If two `verifyOtp`
  calls for the same brand-new invite code land within the same narrow window, the loser gets an
  unstructured 500 rather than a clean domain error — accepted as vanishingly unlikely at Phase
  1's under-30-testers scale, not engineered around.
- **`X-Internal-Key` service-to-service auth (decision 11) resolved in M1.6** — see decision 38.

**M1.6 delivered:** the vertical slice — a real BFF sits in front of core now, not just a plan
for one.

- **`packages/contracts`** got a real `build` step (decision 37) and now holds identity's actual
  request/response zod schemas (`src/identity.ts`) plus the wire-boundary branded-ID helper
  (`src/brand.ts`, decision 14) — both core's routes and the BFF's routes import from here,
  replacing the inline schemas M1.5 left as a known gap.
- **`host/internal-auth.ts`** (core): one Fastify `onRequest` hook, `X-Internal-Key` checked at
  constant time against `config.internalKeys`, applied to everything except `/health` (decision
  38). New `INTERNAL_KEYS` config var.
- **`apps/driver-bff`**: a new, deliberately flat app (no `domain/`/`application/` layering — rule
  10 says BFFs have no business rules, so there is nothing to layer). `host/` mirrors core's
  (health, error handling, request-id propagation); `auth/access-token-verifier.ts` wraps jose's
  own `createRemoteJWKSet` (fetch, cache, auto-refetch — not hand-rolled, decision 39);
  `core-client.ts` forwards to core with `X-Internal-Key` and the same request id, so one request
  traces across both services' logs; `identity-routes.ts` validates against
  `@wagonwise/contracts`, forwards `otp/request`, `otp/verify` and `token/refresh` untouched, and
  does real work on `sessions/:id/revoke` — verifies the bearer token, checks its own `sid` claim
  against the URL, 403s a mismatch (decision 40).
- **`pnpm dev` now starts both apps** (core 3001, the BFF 3002) — turbo runs every package's `dev`
  script that exists, which is now two. Found and fixed a real, pre-existing bug doing this
  (decision 36): `tsx watch` needs `watch` as its literal first argument, and both `dev` scripts
  had it after `--env-file-if-exists` since M1.4, silently broken the entire time because nothing
  had actually run `pnpm dev` itself since that flag was added — M1.4's own verification used the
  compiled build instead.

245 tests, all green (188 core + 32 driver-bff + 17 architecture + 8 contracts); `pnpm arch`
clean (114 modules, 353 dependencies, now scanning `apps/driver-bff/src` too — `check.mjs`
already discovers every `apps/*/src`, no change needed there).

**Verified by actually running it**, both apps together for the first time: built and ran
`dist/main.js` for both (this is what caught decision 37's bug — plain `node` has no TypeScript-
aware loader, so `packages/contracts`'s un-built `.ts` source with its `.js`-suffixed internal
imports resolved fine under `tsx`/Vitest but not under plain `node`); confirmed core now rejects
an unkeyed request and still serves `/health` unauthenticated; drove a full sign-in through the
BFF (request → read the code from core's console log → verify → real Ed25519 JWT), refreshed
through the BFF, then exercised all three revoke-auth outcomes for real — no token (401), a
token for the wrong session (403, core never called), the right token and session (204,
confirmed `revoked_at` set in `psql`) — and confirmed the same request id appears in both
services' logs for the same request. Also fixed `pnpm dev` itself (decision 36) and verified the
fix live. Test data cleaned up afterwards.

## Decisions from M1.6

36. **Fixed: `tsx watch`'s subcommand must be the first argument.** `tsx --env-file-if-exists=.env
watch src/main.ts` silently does the wrong thing — tsx reads `watch` as the entry file
    (since it's not in the first position) and fails with a `Cannot find module '.../watch'`
    that has nothing to do with the real cause. Correct form: `tsx watch --env-file-if-exists=.env
src/main.ts`. Both `apps/*/package.json` `dev` scripts fixed; README troubleshooting entry
    added so a future new app copies the working form.
37. **`packages/contracts` needed a real build step; `packages/config` and `packages/architecture`
    never did.** Both of those export pre-built artefacts (plain `.js`/`.json`, or a `.cjs` config
    file) — nothing in this monorepo had previously shipped raw, un-built `.ts` source across a
    package boundary to be run by plain `node`. `packages/contracts`'s `exports` now point at
    `dist/` (built via `tsc -p tsconfig.build.json`); `turbo.json`'s existing `dependsOn:
["^build"]` on `build`/`lint`/`typecheck`/`test` already builds it first automatically for
    every consumer, no further `turbo.json` change needed. Found only by actually running the
    compiled output, not by any test or type-check, since TypeScript's own resolution is happy to
    read straight from a `.ts` file regardless of what `exports` says.
38. **`X-Internal-Key` lives in `host/`, not `identity/`** — decision 11 describes it as core-wide
    protection, so it is registered once in `buildApp`, and every future module is covered
    without doing anything itself. `/health` is the one exemption: an orchestrator or a human
    needs an unauthenticated liveness check, and it leaks nothing. `INTERNAL_KEYS` defaults to
    the same well-known local-dev value as the BFF's own `CORE_INTERNAL_KEY` default, so `pnpm
dev` plus a plain curl still needs zero config.
39. **The BFF's JWKS handling is jose's own `createRemoteJWKSet`, not hand-rolled.** Same
    reasoning as M1.5's decision to use `jose` for JWT mechanics rather than hand-roll them —
    the "hand-roll small things" convention (decision 6, `Result<T, E>`) is for genuinely small,
    well-understood primitives, not for cache-invalidation-on-key-rotation semantics a
    battle-tested library already gets right. `X-Internal-Key` is passed via its `headers` option
    — core protects the JWKS route the same as everything else except `/health`.
40. **`POST /identity/sessions/:id/revoke` is where "BFFs verify tokens" does real work, not just
    plumbing.** The BFF checks the presented access token's own `sid` claim against the URL's
    `:id` and 403s a mismatch before ever calling core — a driver can self-service-revoke their
    own current session, not an arbitrary one by guessing an id. Core still has no idea who is
    calling it beyond `X-Internal-Key`; this authorization decision belongs to the BFF because
    only the BFF ever sees the driver's own token.
41. **`packages/contracts` is deliberately flat** (no `domain/`/`application/` split like a core
    module) — it is schemas, not a bounded context, and forcing clean-architecture layering onto
    a package with no behaviour would be ceremony with nothing underneath it.

## Deviations and open items from M1.6

- **No real SMS/email `OtpSender`, still** (M1.5's deviation, unchanged) — needed before M4.
  **Resolved 2026-09-25:** `ClickSendOtpSender` sends real SMS via ClickSend, `ResendOtpSender`
  sends real email via Resend (both `identity/infrastructure/`), and `ChannelRoutingOtpSender`
  picks between them per identifier (phone vs email — `identity/domain/identifier.ts`). Each
  channel is independently configured (`CLICKSEND_USERNAME`/`CLICKSEND_API_KEY`,
  `RESEND_API_KEY`/`RESEND_FROM_EMAIL`) and falls back to `ConsoleOtpSender` on its own if
  unset — same toggle pattern as `ANTHROPIC_API_KEY`/`NullHazardParser`. First deploy of the
  SMS half went out without actually being committed (caught when a real sign-in attempt with
  an email identifier produced no error and no SMS — should have been impossible); both are
  now genuinely shipped and verified against their real APIs, not just tested locally.
- **No invite-code admin endpoint, still** (M1.5's deviation, unchanged) — seed via SQL.
- **jose's `createRemoteJWKSet` internals (caching, cooldown, refetch-on-miss) are trusted, not
  independently tested.** `access-token-verifier.test.ts` tests _this codebase's_ wrapper against
  a real local JWKS server (a real network round trip, real signature verification), which is the
  right scope boundary — re-testing a well-maintained library's own internals would be redundant,
  not more correct.
- **The driver-app (M5) doesn't exist, so the BFF has only ever been driven by curl.** The
  vertical slice proves the wiring; it doesn't prove the BFF's shapes are what a real client
  actually wants until M5 has one to ask.
- **`apps/driver-bff` has no architecture-rule enforcement of its own** (unlike core) — `pnpm arch`
  scans `apps/driver-bff/src` (confirmed: `packages/architecture/scripts/check.mjs` already
  discovers every `apps/*/src` automatically), but no rules are written for it, because a flat
  app with no layering has nothing for a layering rule to check. If driver-bff ever grows real
  structure worth enforcing, add rules then.

**M1.7 delivered:** the last M1 task — `.github/workflows/ci.yml` running the same five checks
the README's cold-start command runs, as separate steps so a failure is legible at a glance
rather than buried in one long `&&` chain: lint, typecheck, test, arch, format:check. Triggers
on `pull_request` and on `push` to `main`; a concurrency group cancels a superseded run on the
same ref. `pnpm/action-setup@v4` reads the pinned pnpm version from `package.json`'s
`packageManager` field (one source of truth, same convention as the README's "pnpm is managed
by corepack" note); `actions/setup-node@v4` reads `.nvmrc` for the Node version and caches pnpm.
`ubuntu-latest` runners provide Docker out of the box, so the Testcontainers-backed PostGIS
integration tests (decision 13) need no extra setup — nothing here depends on `pnpm db:up`. A
CI status badge was added to the README.

Getting a working remote needed real setup, not just `git remote add`: this machine had no SSH
keys at all after the fresh install (Environment notes, above) — `ssh -T git@github.com` failed
with "Host key verification failed" before any key existed. Generated a new ed25519 keypair,
added the public key to the user's GitHub account, then seeded `known_hosts` properly via
`ssh-keyscan -t ed25519 github.com` rather than disabling host-key checking.

**Verified by actually running it, though the confirmation came from the user, not a
Claude-driven browser session.** The built-in browser is a separate, unauthenticated browser
context — it 404s a private repo's Actions page the same as any logged-out visitor would
(confirmed directly: `api.github.com/repos/scottkelly36/Wagonwise`, unauthenticated, also
404s). Rather than switch to the user's real logged-in browser for a one-off read, asked the
user to check `github.com/scottkelly36/Wagonwise/actions` directly. They confirmed the run was
green — which also resolves the open question of whether `cpu-features`'s native build (failed
locally on Windows for lack of a C++ toolchain) builds cleanly on `ubuntu-latest`: it does,
since `pnpm install --frozen-lockfile` is the first step and a build failure there would have
failed the whole job before any check ran.

## Decisions from M1.7

42. **GitHub, not another host** — `scottkelly36/Wagonwise`, private by default, SSH for push
    auth (chosen over HTTPS+PAT since the account had no existing GitHub credentials configured
    either way, and SSH avoids storing a token in `.git-credentials`). Matches the design doc's
    GitHub Actions assumption from decision 13.
43. **The built-in browser can't verify a private repo's GitHub Actions runs.** It's an
    unauthenticated browser context, so it 404s the same as any logged-out visitor — not a bug,
    just a scope limit worth recording so a future session doesn't re-discover it by trial and
    error. For a private repo, either the user checks directly or the session switches to the
    user's own logged-in browser (asked each time; this session's user chose to check directly).

## Deviations and open items from M1.7

- **CI has only been exercised by one clean push to `main`**, not yet by a real failing PR. The
  five steps are unverified against an actual failure (does a lint error surface clearly? does a
  Testcontainers test time out sanely on a shared runner?) — revisit if a future PR's CI output
  turns out to be confusing rather than assumed clean.
- **No branch protection configured** — `main` can still be pushed to directly; nothing requires
  the CI check to pass before merge. Worth adding once there's a second contributor or once PRs
  become the normal workflow rather than direct pushes.

## M2 task breakdown

| #    | Task                                                            | Status            |
| ---- | --------------------------------------------------------------- | ----------------- |
| M2.1 | Verify Valhalla against a real extract                          | Done — 2026-09-22 |
| M2.2 | `routing` module skeleton + `VehicleProfile`                    | Done — 2026-09-22 |
| M2.3 | `RoutingEngine` port + Valhalla adapter                         | Done — 2026-09-22 |
| M2.4 | `applies(obstruction, dimensions)`                              | Done — 2026-09-22 |
| M2.5 | `PlanRoute` use case (avoided-restriction explanation deferred) | Done — 2026-09-22 |
| M2.6 | Golden-route tests                                              | Done — 2026-09-22 |

**M2.1 delivered:** decision 28's "unverified" flag is resolved — Valhalla now runs against a
real Northumberland extract and genuinely does truck-aware routing, not just a service that
starts.

- Downloaded `northumberland-latest.osm.pbf` (~25 MB, Geofabrik) into
  `infra/docker/custom_files/` (gitignored).
- **Found and fixed a real bug in `infra/docker/compose.yml`** (decision 44, below): the compose
  file split the mount into `./valhalla_tiles:/custom_files` (output) and `./:/pbf_data` (input),
  but the image only ever reads `.pbf` files from, and writes tiles/config/admin/timezone dbs
  into, a single `$CUSTOM_FILES` directory (`/custom_files`) — confirmed by reading the image's
  own `run.sh`/`configure_valhalla.sh`/`helpers.sh` rather than guessing. `/pbf_data` was never
  read by anything; the container crash-looped with "No local PBF files... Nothing to do." Fixed
  to a single `./custom_files:/custom_files` mount.
- Brought up `docker compose -f infra/docker/compose.yml --profile valhalla up -d valhalla`; tile
  build for the Northumberland extract (30 tiles) took about 3.5 minutes.
- **Verified for real, not just "container is running":** `GET /status` returns 200; a `POST
/route` with `costing: truck` and real dimensions (height 4.2m, width 2.6m, length 16.5m, weight
  32t, axle load 10t) returns a genuine turn-by-turn route through real Hexham streets (St Mary's
  Wynd, Beaumont Street, Hencotes/B6305, Priestpopple/A6079 …) with `travel_type: "truck"`.
  Decoded the route's polyline6 shape, picked a real mid-route coordinate (near the A69/A68
  Stagshaw Road Interchange), and re-requested the same route with `exclude_polygons` covering
  it — the route genuinely detoured (dropped the A69/A68/Stagshaw Road Interchange leg for Ferry
  Road, cost 763→939, time 475s→646s). This is the exact mechanism hazard avoidance will use
  (design doc §4's `avoid: GeoPolygon[]` on `RoutingEngine`), so it was worth confirming against
  real tiles rather than assuming the parameter works.
- `.gitignore` and `infra/docker/compose.yml`'s comments updated to match the real layout.

## Decisions from M2.1

44. **Valhalla's image reads and writes everything from one `$CUSTOM_FILES` directory
    (`/custom_files`) — there is no separate input mount.** `infra/docker/compose.yml` originally
    split this into two mounts based on a plausible-looking but wrong assumption; confirmed the
    real behaviour by reading the `ghcr.io/gis-ops/docker-valhalla/valhalla` image's own
    `run.sh`, `configure_valhalla.sh` and `helpers.sh` (`CUSTOM_FILES="/custom_files"`; tile dir,
    config, admin db, timezone db and the `*.pbf` glob all resolve under it). Extracts now live
    in `infra/docker/custom_files/`, tiles build alongside them at
    `infra/docker/custom_files/valhalla_tiles/`. `.gitignore` collapsed to one
    `infra/docker/custom_files/` entry.

## Deviations and open items from M2.1

- **Only smoke-tested, not load-tested or golden-route-tested.** M2.1's job was "prove the
  service genuinely does truck routing against real tiles," which it now does. Exhaustive
  correctness (real restriction data quality, golden routes) is M2.4/M2.6's job.
- **`use_tiles_ignore_pbf: 'True'`** (unchanged from the original compose file) means a changed
  `.pbf` won't trigger a rebuild on restart unless tiles are deleted first or `force_rebuild` is
  set — fine for now, worth remembering if the extract is ever refreshed.

## Tooling: pre-push verification hook

Added between M2.1 and M2.2, prompted by CI failing on things `pnpm verify` would have caught
locally — a `pre-push` git hook now runs the same five checks as CI before a push is allowed to
leave the machine.

45. **`simple-git-hooks`, not husky.** One dependency, config lives directly in `package.json`
    (no `.husky/` directory of shell scripts), and it installs itself via a `"prepare"` script
    that `pnpm install` already runs — so a fresh clone gets the hook with zero extra steps,
    matching the existing cold-start convention. Needed adding `simple-git-hooks: true` to
    `pnpm-workspace.yaml`'s `allowBuilds` (decision from M1.1's environment notes: pnpm 12 blocks
    install scripts by default).
    - New root script `pnpm verify` — the same `lint && typecheck && test && arch && format:check`
      chain the README and CI both already run — is the single source of truth both the hook and
      a developer running it by hand call, rather than duplicating the check list a third place.
    - `"pre-push": "pnpm verify"` in `package.json`'s `simple-git-hooks` block.
    - **Verified for real, not just installed:** the first run caught a genuine formatting issue
      in this file (a markdown table Prettier wanted reformatted) that would otherwise have
      reached CI — exactly the failure mode this was built to prevent. Fixed with `pnpm format`,
      re-ran `pnpm verify` clean (lint, typecheck, 245 tests, arch, format:check all green).
    - Escape hatch: `SKIP_SIMPLE_GIT_HOOKS=1 git push` (simple-git-hooks' own built-in), for the
      rare case a push is needed before the checks are fixed.

**M2.2 delivered:** the `routing` module — all four layers, wired end to end, mirroring how
`identity` was built in M1.5.

- **`domain/vehicle-profile.ts`** (pure, no I/O): `VehicleProfile`, `Dimensions`,
  `validateDimensions` (every dimension must be a real positive number — a zero or negative
  value would silently corrupt `applies()`, M2.4's safety-critical function, for every check
  against that profile) and `validateName` (non-blank, trimmed).
- **`application/`**: five use cases — `createVehicleProfile`, `updateVehicleProfile`,
  `deleteVehicleProfile`, `getVehicleProfile`, `listVehicleProfiles` — against one
  `VehicleProfileRepository` port, with an in-memory fake for tests. `listVehicleProfiles` returns
  a plain array, not a `Result`: an empty list isn't a failure.
- **`infrastructure/`**: `PostgresVehicleProfileRepository`, raw `sql` tagged-template queries
  (decision 26), same `UntypedDb` shape as identity's own.
- **`interface/`**: `POST/GET /routing/vehicle-profiles`, `GET/PUT/DELETE
/routing/vehicle-profiles/:id` — internal endpoints behind the same `X-Internal-Key` host guard
  as identity's (decision 38 covers every module automatically, confirmed by a real 401 with no
  key). One `statusFor()` table (decision 13), exhaustiveness-checked.
- **Migration `0003_routing.sql`**: `routing.vehicle_profiles`, dimensions as `double precision`
  (decision 48, below) — `driver_id` is a plain column, not a foreign key, since routing does not
  reference identity's schema (matches the module boundary in code).
- **`packages/contracts/src/routing.ts`**: request/response zod schemas, reusing identity's
  `driverIdSchema` for the wire shape of a `DriverId` (packages/contracts is flat — decision 41 —
  so this isn't the same cross-module restriction core's own modules have).

303 tests, all green (237 core + 32 driver-bff + 17 architecture + 17 contracts); `pnpm arch`
clean (138 modules, 450 dependencies).

**Verified by actually running it**, matching M1.5's standard: built `dist/`, ran `node
dist/main.js` against real `pnpm db:up` Postgres with `0003_routing.sql` applied, and drove the
whole CRUD flow with `curl` — created a profile (real row, confirmed via `psql` after deleting
it), listed it scoped to its driver, fetched it by id, got a real 404 (not a 500 or a leaked 200) when fetching or deleting with a _different_ driverId, updated it (axleWeightT round-tripped
correctly), got a real 400 for a zero-height request, and a real 401 with no `X-Internal-Key` —
confirming routing inherited the host-level guard automatically, exactly as decision 38 intended.

## Decisions from M2.2

46. **Routing declares its own local `DriverId = Id<'DriverId'>` rather than importing
    identity's.** The same situation rule 7 (cross-context reads use the consuming context's own
    types) already covers for read-model ports applies here too: a `DriverId` value identity
    produces is usable as routing's own `DriverId` via `makeId()` with no cross-module import,
    because the brand is just the string `'DriverId'`, not a shared declaration. Sets the pattern
    a future `hazards` module should follow for the same need.
47. **`driverId` is a plain, trusted request field on every routing route, not derived from a
    verified access token.** Decision 1 eventually wants core to derive `driverId` from a token
    signature, never a BFF-supplied field — but no BFF forwards a verified `driverId` to routing
    yet (identity's own BFF wiring in M1.6 only covers identity's routes), and building that
    generically now would be M4's job ("Driver BFF + auth") done early and out of order. Recorded
    here as a deliberate, scoped-down choice — not an accident — matching M1.5's own precedent of
    shipping `identity`'s core endpoints before M1.6 wired a BFF in front of them.
48. **`Dimensions` columns are `double precision`, not `numeric`.** These are real-world
    measurements (metres, tonnes), not currency — float precision is fine, and it avoids
    node-postgres returning `numeric` columns as strings (which `numeric` would need a custom
    type parser to work around, for no accuracy benefit here).
49. **A driverId mismatch on get/update/delete returns `VehicleProfileNotFound`, the same as a
    genuinely unknown id** — not a separate `Forbidden`/403. Telling the two apart would let a
    caller learn "this id exists, just not for you," leaking information about another driver's
    data for no benefit.

## Deviations and open items from M2.2

- **No BFF wiring.** `apps/driver-bff` has no routing routes yet — core's endpoints have only
  been driven by `curl`, the same gap M1.5 had for identity until M1.6. Add when a client (M5) or
  a reason to verify the shape appears.
- **No real driver-facing auth**, per decision 47 — `driverId` is trusted as given. This is a real
  gap, not a nitpick: anyone who can reach core (i.e., anyone with a valid `X-Internal-Key`, today
  only the BFF) can currently act as any driver by supplying their id. Acceptable while core is
  only ever driven by a trusted BFF on a private network and by `curl` in dev, but must close
  before M4 exposes routing to real drivers.
- **No update to `RoutingEngine`, `applies()`, or `PlanRoute` yet** — this task was scoped to
  `VehicleProfile` only, per the M2 task breakdown above. Those are M2.3–M2.5.

**M2.3 delivered:** the `RoutingEngine` port and its Valhalla adapter — truck-aware routing is
now a real, tested capability in `routing`, not just a running container.

- **`domain/geo.ts`**: `GeoPoint`, `GeoPolygon`, `GeoLine` (an encoded polyline string,
  specifically polyline6 — Valhalla's own default, confirmed against a real response in M2.1 —
  so `RouteResult.geometry` is a direct passthrough with no decode/re-encode step).
- **`application/ports/routing-engine.ts`**: `RoutingEngine.route(req)`, taking `origin`,
  `destination`, `dimensions` (reusing routing's own `Dimensions` from M2.2) and `avoid:
GeoPolygon[]`. Returns `Result<RouteResult, NoRouteFound>` — "the vehicle genuinely cannot get
  there" is an expected outcome (decision 50, below), not an infra fault.
- **`infrastructure/valhalla-routing-engine.ts`**: hand-rolled HTTP client (decision 6 — the
  request/response shape is small enough that a dependency would cost more than it saves), no
  client library. Maps `Dimensions` to Valhalla's truck costing params (height/width/length/
  weight/axle_load), `GeoPolygon[]` to `exclude_polygons` (closing an unclosed ring — a
  Valhalla-specific requirement, handled here rather than forcing every caller to remember it),
  and a Valhalla error response (has `error_code`) to `NoRouteFound`; anything else non-2xx
  throws, as does a malformed success body.
- **`config.ts`**: `VALHALLA_URL`, defaulting to `http://127.0.0.1:8002` — matches
  `infra/docker/compose.yml`'s published port, so `docker compose --profile valhalla up` plus
  `pnpm dev` needs no configuration (the cold-start promise, extended to Valhalla).
- **Not wired into `composeCore`/`routing/api.ts` yet** — nothing calls `RoutingEngine` until
  M2.5's `PlanRoute` exists. Wiring an unused dependency into the module's public factory now
  would be untested plumbing; M2.5 wires it when it has a real caller (same reasoning M1.4 used
  for the Valhalla compose service itself, decision 28).

314 tests, all green (248 core + 32 driver-bff + 17 architecture + 17 contracts); `pnpm arch`
clean (142 modules, 460 dependencies).

**Verified by actually running it against the real M2.1 Valhalla instance**, not just the fake
HTTP server the unit tests use: a scratch script (not committed) imported the real
`ValhallaRoutingEngine` and called `.route()` three ways — a normal Hexham→Corbridge request
(real geometry back), the same request with an avoid polygon over the A69/A68 interchange
(distanceKm 7.637, exactly matching the detour M2.1's curl test found), and a request for a
location with no tile coverage, which came back as `{ ok: false, error: { tag: 'NoRouteFound' }
}` — a clean `Result`, not a thrown exception or a crash.

## Decisions from M2.3

50. **`NoRouteFound` is a `Result` error, not a thrown exception.** A truck that genuinely can't
    reach a destination given its own dimensions and the active avoid areas is a real, expected
    outcome a driver can hit (AGENTS.md rule 13's "expected failures are values") — not a bug or
    an infrastructure fault. Any other non-2xx Valhalla response, or a malformed success body,
    still throws: those really are infrastructure faults (Valhalla down, wrong contract).
51. **The Valhalla adapter is hand-rolled HTTP (`fetch`), no client library.** Same reasoning as
    decision 6 (hand-roll small, well-understood things): the request is a handful of fields, the
    response is `trip.summary` plus one leg's `shape` — a dependency would be more surface area
    than the thing it replaces. Tested against a real local HTTP server standing in for Valhalla
    (mirroring the driver-bff's `access-token-verifier.test.ts`), not a mocked `fetch` — the
    codebase's established preference for genuine HTTP round trips over mocks.
52. **`GeoLine` is specifically a polyline6-encoded string, not a generic "list of points."**
    Pinned to Valhalla's own default encoding (confirmed empirically in M2.1) so the adapter never
    needs to decode and re-encode a route's geometry — it passes Valhalla's `shape` straight
    through. If a second `RoutingEngine` adapter (e.g. GraphHopper, per the design doc's stated
    fallback) ever used a different encoding, that adapter would normalise to polyline6 itself,
    keeping the port's contract engine-agnostic.

## Deviations and open items from M2.3

- **No `FakeRoutingEngine` test double yet.** Nothing in the codebase consumes the `RoutingEngine`
  port yet (M2.5's `PlanRoute` will be the first), so a fake would be speculative — added when
  the first consuming use case actually needs one to test against, matching how M1.5's fakes each
  arrived alongside the use case that needed them.
- **Not wired into `composeCore`** — see the M2.3-delivered note above; genuinely deferred to
  M2.5, not forgotten.
- **Valhalla error-code handling is coarse: any Valhalla-shaped error response becomes
  `NoRouteFound`,** regardless of the specific `error_code` (442 "no path found" vs. other
  possible codes for malformed input, etc.). Fine for Phase 1 — `PlanRoute`'s job either way is
  "tell the driver no route is available" — but worth revisiting if a specific error code ever
  needs different handling (e.g., a malformed request surfacing as a 500-equivalent bug report
  rather than a routine "no route" response).

**M2.4 delivered:** `applies(obstruction, dimensions)` — design doc §3's "most safety-critical
function in Phase 1" — pure, no I/O, exhaustively tested.

- **`domain/reported-obstruction.ts`**: `ReportedObstruction` (`id`, `kind`, `limit?`, `zone`) —
  moved here from the design doc's own sketch location (`application/ports/hazard-avoidance.ts`,
  see decision 53, below).
- **`domain/avoidance-policy.ts`**: `applies()` — a measured restriction (height/width/weight)
  applies only when the vehicle's dimension exceeds the limit (exactly at the limit clears it — a
  maxheight sign is the tallest height still permitted); no measurement at all means avoid for
  every vehicle (design doc §5's explicit rule); `prohibition` always applies, having no
  measurement to compare.
- **Tests**: every kind × (under the limit / exactly at the limit / over the limit / no
  measurement at all) — 3 measured kinds × 4 cases, plus 3 `prohibition` cases, plus the design
  doc's own worked example (a 3.5m bridge avoided by a 4.2m HGV, not by a 3.2m van) and a purity
  check (same inputs called repeatedly, same output every time).

265 core tests now (331 total across the workspace); `pnpm arch` clean (145 modules, 467
dependencies).

**Verified by its own design, not a real run** — unlike every prior M2 task, there is nothing to
run this against: no I/O, no database, no routing engine (the design doc's own words for why this
function has this shape). The exhaustive unit tests are the verification; there is no additional
"actually run it" step that would prove anything the tests don't already.

## Decisions from M2.4

53. **`ReportedObstruction` lives in `routing/domain/`, not `routing/application/ports/` where
    the design doc's own sketch groups it.** Caught by actually writing the code, the same way
    decision 26 was: `domain/` may depend on nothing outward (AGENTS.md rule 1, `no-cross-layer`
    dependency-cruiser rule, `domain-imports-application` fixture) — a domain function cannot take
    a parameter type declared in `application/`, regardless of what the design doc's illustrative
    code block groups it under. The design doc's sketch is illustrative of the _shape_, not a
    literal file-placement instruction; `application/ports/hazard-avoidance.ts`'s eventual
    `HazardAvoidanceQuery` (M3, once `hazards` exists to query) will import `ReportedObstruction`
    from `domain/` instead of declaring it — application legitimately depends on domain, never the
    reverse.

## Deviations and open items from M2.4

- **No `HazardAvoidanceQuery` port or hazards-reading adapter yet.** That's cross-context wiring
  that needs the `hazards` module to exist (M3, not started) — out of scope for "make `applies()`
  work and prove it," which needs only the pure function and its input shape. `activeNear()`'s
  adapter (`routing/infrastructure/`, calling `hazards/api.ts` and translating, per design doc
  §3) arrives once M3 gives it something real to call.
- **`applies()` has no caller yet**, same reason M2.3's `RoutingEngine` has no caller yet — M2.5's
  `PlanRoute` is scoped to the Valhalla-restriction explanation (an OSM two-query diff, no
  community hazards involved); genuine community-hazard avoidance via `applies()` most likely
  gets wired up once M3 exists. Not a gap in M2.4 itself, which was explicitly scoped to the
  function alone.
  > **Correction from M2.5:** the "Valhalla-restriction explanation" assumption above turned out
  > wrong — see M2.5's own notes, below. `applies()` still has no caller after M2.5.

**M2.5 delivered:** `PlanRoute` — the use case that finally wires `VehicleProfile` (M2.2) and
`RoutingEngine` (M2.3) together into a persisted `RoutePlan`, plus `RoutingEngine`'s first real
wiring into `composeCore` (deferred from M2.3 on purpose, until there was a real caller).

- **Investigated before writing any code, and it changed the task's scope**: Valhalla's `/route`
  response never explains _why_ it routed somewhere, only where — confirmed empirically against
  the real M2.1 instance (querying the same route with a tiny vehicle and a large HGV produced
  byte-identical routes; no restriction was in the way to observe a difference against). Building
  design doc §4's literal example ("Avoided Styford Bridge — 3.7m limit") needs core's own access
  to OSM restriction tags (maxheight/maxwidth/maxweight per way) — real new infrastructure
  (parsing the `.osm.pbf` extract into `routing.restriction_overrides`, per design doc §9), not a
  two-query diff against Valhalla alone. Asked the user rather than either quietly shipping a
  hollow stub or quietly absorbing a much bigger task — see decision 54, below.
- **`domain/route-plan.ts`**: `RoutePlan` (design doc §3), `AvoidedRestriction` (shape only,
  always empty — see decision 54). Immutable, matching decision 10 (no `RoutePlan` lifecycle in
  Phase 1).
- **`application/plan-route.ts`**: looks up the profile (404-equivalent `VehicleProfileNotFound`
  if it doesn't exist or isn't the caller's, same ownership rule as M2.2's other use cases), calls
  `RoutingEngine.route()` with the profile's real dimensions and an empty `avoid` (community-hazard
  avoidance needs M3), persists the plan. `avoidedRestrictions` and `hazardsOnRoute` are always
  `[]` for the reasons above and in decision 46's follow-on.
- **`infrastructure/postgres-route-plan-repository.ts`** + migration `0004_route_plans.sql`:
  insert-only, `geometry` stored as plain `text` (the encoded polyline) and origin/destination as
  plain lat/lon columns rather than PostGIS types — nothing queries a `RoutePlan` spatially yet
  (decision 55, below).
- **`routing/api.ts`**: now builds the real `ValhallaRoutingEngine` from `config.valhallaUrl` and
  wires it into `PlanRoute`'s deps — `RoutingEngine`'s first real consumer, so the wiring M2.3
  deliberately deferred lands here.
- **`packages/contracts/src/routing.ts`**: `geoPointSchema`, `planRouteRequestSchema`,
  `routePlanSchema`, `avoidedRestrictionSchema` (mirrors the deferred, always-empty shape).
- **New endpoint**: `POST /routing/route-plans`, same internal-only trust model as every other
  routing route. `NoRouteFound` maps to `422 Unprocessable Entity` (new case in
  `interface/error-mapping.ts`) — the request was well-formed and the profile real, but the
  vehicle genuinely can't get there, which is neither a missing resource (404) nor a bad request
  (400).

350 tests, all green (278 core + 32 driver-bff + 17 architecture + 23 contracts); `pnpm arch`
clean (153 modules, 517 dependencies).

**Verified by actually running it**, matching the standard every prior M2 task with real I/O has
used: applied `0004_route_plans.sql` against real Postgres, built and ran `dist/main.js`, created
a real vehicle profile, then planned a real Hexham→Corbridge route through the actual HTTP
endpoint against the live M2.1 Valhalla instance — `distanceKm: 8.038`, exactly matching every
earlier verification of this same route (M2.1's curl test, M2.3's scratch script). Confirmed the
row in `psql` directly. Exercised all three error paths for real: an unknown `profileId` (404), a
genuinely out-of-tile-coverage request that came back `422` with a real `NoRouteFound` from
Valhalla (not a fabricated test double), and a request with no `X-Internal-Key` (401, confirming
the new route inherited the host-level guard automatically). Test data cleaned up afterwards.

## Decisions from M2.5

54. **The avoided-restriction explanation is deferred, not stubbed silently.** Asked the user
    once the real scope became clear (a genuine architecture finding, not a judgment call this
    session could make alone) rather than picking unilaterally between shipping something hollow
    or absorbing a much bigger task without saying so. `RoutePlan.avoidedRestrictions` exists as a
    typed, always-empty field so the wire contract and persistence shape are already right — the
    day OSM restriction ingestion exists, populating this field is the only change needed, not a
    schema migration. The three options considered (and why the middle one was declined): a
    street-name-diff heuristic (weaker than the design doc's example, and still requires querying
    Valhalla twice per plan for a benefit nobody asked to trade against extra latency) lost to
    "ship the real thing now, correctly scoped later" once the actual cost of "correctly" became
    clear.
55. **`RoutePlan.geometry`/`origin`/`destination` are plain `text`/`double precision`, not
    PostGIS types**, despite design doc §9 saying "`routing.route_plans` (geometry `LineString`)."
    Same reasoning as decision 48 (`VehicleProfile.dimensions`): nothing queries a `RoutePlan`
    spatially yet — on-route hazard detection (design doc §5) needs the `hazards` module (M3) to
    exist first. Storing real PostGIS geometry now would mean decoding Valhalla's polyline and
    re-encoding on read with no consumer to justify it. Revisit when M3 or M6 needs to run
    `ST_DWithin` against a route's geometry.

## Deviations and open items from M2.5

- **No `restriction_overrides` ingestion, still.** The actual work design doc §4's explanation
  needs — parsing the `.osm.pbf` extract for maxheight/maxwidth/maxweight tags into
  `routing.restriction_overrides` (design doc §9) and querying it against a planned route. Not
  scheduled against a specific milestone yet.
  > **Correction from M2.6:** asked the user whether to fold this into M2.6 (golden-route tests
  > also touch real restriction-data quality) or keep them separate — kept separate, on purpose.
  > M2.6 stayed scoped to distance/duration golden values; this is still unscheduled.
- **`avoidedRestrictions` and `hazardsOnRoute` are both always `[]`.** The former per decision 54;
  the latter because it needs the same `hazards` module (M3) that `applies()` (M2.4) is also
  waiting on — one milestone, two currently-empty fields.
- **Community-hazard avoidance is still not wired.** `PlanRoute` always calls `RoutingEngine`
  with `avoid: []`. Needs a `HazardAvoidanceQuery` read-model port (design doc §3) once `hazards`
  (M3) exists to query, then `applies()` (M2.4) filters the candidates it returns.
- **No `GET /routing/route-plans/:id` endpoint.** Nothing needs to re-fetch a plan yet — the
  driver app gets it directly from the `POST` response (design doc §8's "Route overview" screen).
  Add when a real caller needs one (M6's alerts subscriber will, to re-fetch a plan's geometry).

**M2.6 delivered:** golden-route tests — real requests against a real, tile-built Valhalla
instance, kept out of the per-PR tier and run nightly instead (decision 13). This is the last
task on M2's original breakdown; **M2 Routing core is done**, with the deferred items above
recorded rather than silently dropped.

- **Kept scoped to golden values, not folded into restriction-data investigation** — asked the
  user first (see the M2.5-deviations correction, above); the two are related but the
  restriction-ingestion work stays its own, unscheduled task.
- **`vitest.golden.config.ts`** + `*.golden-test.ts` file naming (not `*.test.ts`) — a separate
  vitest config with its own `include` pattern, so `vitest.config.ts`'s own `include` (`src/**/
*.test.ts`) can't accidentally sweep these into `pnpm test`. Verified for real: confirmed `pnpm
test` still reports exactly 278 core tests (unchanged) after adding 3 golden tests, and `pnpm
test:golden` finds and runs exactly those 3.
- **Two golden routes** (Hexham town centre → Corbridge, Hexham → toward Newcastle on the A69),
  plus a third test confirming `exclude_polygons` still forces a measurable detour against live
  tiles — all three re-verified by hand against the real M2.1 instance immediately before writing
  the test (not copied from stale earlier numbers: an earlier M2.5 investigation had used
  different vehicle dimensions for the second route, so it was re-queried with the same profile
  as the first for a consistent golden value).
- **Tolerances are deliberately loose** (±10% distance, ±15% duration), not exact equality — a
  weekly tile rebuild (design doc §4) can shift a route slightly from irrelevant OSM edits
  elsewhere; golden tests exist to catch a _materially_ different route, not routine data churn.
- **`infra/docker/compose.yml`'s `valhalla` service gained a real healthcheck** (`curl -f
.../status`, 60 retries at 10s — enough for a multi-minute first-time tile build). It had none
  before (only `postgres` did); needed so CI can `docker compose up --wait` instead of guessing a
  sleep duration. Verified for real: recreated the container, confirmed `docker ps` reports
  `(healthy)` only once Valhalla is actually serving.
- **`.github/workflows/nightly-golden-routes.yml`**: downloads a fresh extract every run (not
  cached — tests against Geofabrik's current data, matching the "weekly rebuild" cadence design
  doc §4 describes), waits on the new healthcheck, runs `pnpm test:golden`, dumps Valhalla's logs
  on any outcome for debugging. Cron at 03:00 UTC plus `workflow_dispatch` for a manual run (e.g.
  after a deliberate extract refresh, to check golden values still hold). YAML syntax validated
  with `js-yaml` before committing (no `act`/local GitHub Actions runner available on this
  machine, so the schedule/trigger mechanics themselves are unverified until a real run happens).

353 tests, all green (278 core + 32 driver-bff + 17 architecture + 23 contracts) — unchanged from
M2.5 by design (golden tests don't count towards this); 3 more in the separate golden suite.
`pnpm arch` clean (154 modules, 520 dependencies).

## Decisions from M2.6

56. **Golden tests hardcode `http://127.0.0.1:8002` rather than reading `VALHALLA_URL` from the
    environment**, even though `config.ts` already has that variable. Caught by
    `conventions.test.ts` (AGENTS.md rule 4 — process environment reads happen only in
    `config.ts`, enforced with no test-file exemption) when a first attempt read it directly.
    Golden tests always run against a fixed, CI-controlled local instance (the same published
    port `infra/docker/compose.yml` always uses), so there's no real scenario needing a
    configurable override — hardcoding is simpler and doesn't need a new exception to an existing
    rule. Also caught the same rule flagging the literal string "process.env" inside an
    explanatory _comment_ — `conventions.test.ts`'s detector is a text scan, not AST-aware, so it
    can't tell code from prose; rephrased rather than treated as a false positive to override.

## Deviations and open items from M2.6

- **The nightly schedule itself is unverified.** No local GitHub Actions runner on this machine
  to test `schedule:`/`workflow_dispatch:` triggers before pushing — the workflow's YAML syntax
  was validated (`js-yaml`, parses cleanly) and its _steps_ mirror `ci.yml`'s already-proven
  pattern, but the first real proof this actually fires nightly and passes is the first real
  nightly run. Worth checking `github.com/scottkelly36/Wagonwise/actions` after it's had a day to
  fire, the same way M1.7 asked the user to confirm CI's first real run.
- **Golden routes cover two of countless possible Hexham-area routes.** Enough to catch "the tile
  data or Valhalla config broke," not a claim of comprehensive coverage. Add more if a specific
  route matters to testers, or if a real regression ever slips through with none of the existing
  three catching it.

## M3 task breakdown

| #    | Task                                                                                        | Status            |
| ---- | ------------------------------------------------------------------------------------------- | ----------------- |
| M3.1 | `hazards` module skeleton + domain (report/merge/expiry/confirm/dismiss policy)             | Done — 2026-09-22 |
| M3.2 | `application/` use cases: `reportHazard`, `confirmHazard`, `dismissHazard`, `expireHazards` | Done — 2026-09-22 |
| M3.3 | `infrastructure/`: `PostgresHazardRepository`, PostGIS geography + GiST index, migration    | Done — 2026-09-22 |
| M3.4 | `interface/`: HTTP endpoints, wired into `composeCore`                                      | Done — 2026-09-22 |
| M3.5 | `HazardAvoidanceQuery` read-model port + on-route PostGIS query, wired into `PlanRoute`     | Done — 2026-09-22 |

Scoped to exactly design doc §12's M3 "done when": report/confirm/dismiss/expire use cases,
the PostGIS on-route query, and hazards feeding avoid polygons via the read-model port.
Domain-event publishing through the outbox (`HazardReported` etc., decision 8) is not in this
list — M2 didn't wire `RoutePlanned`/`TripStarted`/`TripEnded` either; that's M6 (Alerts)
territory, the first module that actually needs to react to a hazard event.

**M3.1 delivered:** `hazards`' domain layer — pure, no I/O, mirroring how M2.4's `applies()`
landed with no wiring and no caller yet, verified only by its own tests.

- **`domain/hazard-report.ts`**: `HazardReport`, `HazardType` (all eight design doc §3 kinds),
  `HazardStatus`, `Measurement` + `validateMeasurement` (same positive-value reasoning as
  routing's `validateDimensions`, M2.2). `isBlocking(type)` — the four types design doc §5 names
  as becoming avoid polygons; everything else, including `other`, is advisory. `isTemporary(type)`
  / `expiryFor(type, from)` — the 7-day default (design doc §3, decided 2026-09-21) for temporary
  types, `undefined` for permanent ones. `confirm()` and `dismiss()` each return a new
  `HazardReport` in one call (mirrors identity's `Otp.verify()` shape, decision 32 — the state
  change and the outcome are the same call, not two). `confirm()` reactivates an `expired` report
  (the actual mechanism behind "Still there?") but never un-dismisses a `dismissed` one from a
  single confirmation; `dismiss()` moves `active` to `dismissed` once dismissals exceed
  confirmations by `DISMISS_MARGIN` (3) — "simple thresholds for now" (design doc §3).
- **`domain/merge-policy.ts`**: `findMergeCandidate()` — design doc §5's "the repository finds
  candidates spatially; the domain decides whether they merge." Takes spatial candidates already
  within `MERGE_RADIUS_M` (50m, the repository's job in M3.3) and picks the one to merge a new
  report into as an extra confirmation: same type, still `active`, reported within the last 24h.
- **Tests**: every `HazardType` classified by both `isBlocking` and `isTemporary`, `confirm`/
  `dismiss`'s every status transition (including the boundary cases — exactly at the dismiss
  margin, exactly at the expiry instant), and `findMergeCandidate`'s type/recency/status filters.

398 tests, all green (326 core + 32 driver-bff + 17 architecture + 23 contracts — hazards adds 48
to the 278 core tests M2 left off at); `pnpm arch` clean (158 modules, 530 dependencies).
`pnpm verify` clean end to end (lint, typecheck, test, arch, format).

**Verified by its own design, not a real run** — same as M2.4: nothing wires this module yet
(no `api.ts`), so there is no server to run it against. The exhaustive unit tests are the
verification.

## Decisions from M3.1

57. **`hazards` declares its own `DriverId` and `GeoPoint`**, structurally identical to routing's
    own (and, for `GeoPoint`, to `routing/domain/geo.ts`'s), rather than importing either —
    same reasoning as decision 46: a module is reachable only through its facade, and there is no
    shared declaration to import even if the shapes match.
58. **`other` is advisory, not blocking.** Design doc §5 names exactly four blocking types (low
    bridge, weight limit, width restriction, no HGV) and three advisory ones (tight bend,
    roadworks, flooding); `other` isn't mentioned on either list. Advisory is the conservative
    default: nothing in the system knows an unclassified report is safe to route a vehicle around,
    unlike the four restriction types the design doc names explicitly.
59. **Temporary/permanent classification for the four types the design doc doesn't name
    (width_restriction, no_hgv, tight_bend as permanent; `other` as temporary) is a judgement
    call, recorded rather than left implicit.** The three permanent ones describe a fixed
    physical/official road feature, like the two the design doc does name (low bridge, weight
    limit); `other` defaults to temporary on the same "safer to require reconfirmation of the
    unknown" reasoning as decision 58. Worth revisiting with testers, same as the expiry window
    and merge radius themselves (docs/progress.md's existing "decided 2026-09-21, revisit with
    testers" note).
60. **`DISMISS_MARGIN = 3`** (dismissals must exceed confirmations by 3 before a report moves to
    `dismissed`) is a guess, not a derived number — design doc §3 says only "simple thresholds for
    now, proper trust scoring in Phase 2" without naming one. Same status as the expiry window and
    merge radius: cheap to guess with thirty testers and a direct line to all of them (design doc
    §12).

## Deviations and open items from M3.1

- **No `api.ts` yet, so the module isn't wired into `composeCore`.** Nothing to wire — there's no
  application layer or repository yet (M3.2/M3.3). Same gap M2.3's `RoutingEngine` had until
  M2.5 gave it a caller.
- **`GeoPoint` has no range validation** (lat/lon aren't checked as real coordinates), matching
  routing's own `geoPointSchema` (`z.number()`, no range check) — boundary validation is the
  interface layer's job (M3.4), not the domain's, consistent with how routing itself does it.

**M3.2 delivered:** `hazards`' application layer — four use cases against one
`HazardRepository` port, with an in-memory fake, mirroring routing's own use-case shape (M2.2).

- **`application/ports/hazard-repository.ts`**: `findById`, `findNearby(location, radiusM)`
  (spatial only — no type filter, so the same query can later back a map-viewport read too; the
  domain does every other filtering step, per decision 61 below), `findExpirable(now)`, `save`
  (upsert, no separate insert path).
- **`application/report-hazard.ts`**: idempotent on a client-generated `id` (design doc §5's
  offline-queue UUID) — a retry returns the existing report unchanged rather than creating a
  second one, checked before anything else, including validation. Then checks `findNearby` +
  `findMergeCandidate` (M3.1) for a duplicate to `confirm()` into instead of creating a fresh
  report. No `IdGenerator` port, unlike every routing use case — decision 62, below.
- **`application/confirm-hazard.ts`** / **`dismiss-hazard.ts`**: thin wrappers around the M3.1
  domain transitions — look up by id, apply `confirm()`/`dismiss()`, persist, return
  `HazardReportNotFound` for an unknown id. No ownership check (unlike routing's vehicle
  profiles) — community moderation is deliberately not scoped to the reporter, any driver can
  confirm or dismiss any report.
- **`application/expire-hazards.ts`**: batch-expires everything `findExpirable` returns. Returns
  the expired reports as a plain array, not a `Result` (mirrors `listVehicleProfiles`) — nothing
  to expire isn't a failure. No scheduler yet (M3 deviations, below) — this is the use case a
  poller will call, not the poller itself.
- **`application/testing/in-memory-hazard-repository.ts`**: `findNearby`'s flat-earth distance
  is a test-only approximation of PostGIS's real `ST_DWithin` (M3.3) — explicitly not trying to
  be precise, since nothing here needs sub-metre accuracy to exercise the merge policy.

415 tests, all green (343 core + 32 driver-bff + 17 architecture + 23 contracts — hazards' four
use cases add 17 to the 326 core tests M3.1 left off at); `pnpm arch` clean (169 modules, 574
dependencies). `pnpm verify` clean end to end.

**Verified by its own design, still no real run** — same as M3.1: no `api.ts`, no wiring, no
server to run this against yet. The in-memory-repository tests are the verification.

## Decisions from M3.2

61. **`findNearby` takes no `type` parameter — it is a pure spatial query.** The domain
    (`findMergeCandidate`, M3.1) already filters by type, status and recency; giving the
    repository a type filter too would duplicate that decision across two layers for a query
    that will likely be reused as-is for the map-viewport bounding-box read (design doc §5),
    which has no type filter of its own.
62. **`reportHazard` takes no `IdGenerator` — the id is caller-supplied, not server-generated.**
    Every routing use case (M2.2) generates its own id; hazards deliberately doesn't, because the
    id _is_ the offline-queue idempotency key (design doc §5 step 2: "App assigns a
    client-generated UUID"). Generating a fresh id server-side would defeat the exact mechanism
    that makes a flaky-connection retry safe.
63. **Confirm/dismiss have no ownership or authorization check.** Unlike a `VehicleProfile`
    (one driver's own data), a `HazardReport` is a shared community record — design doc §5's
    "Still there?" prompt and dismiss flow are meant to be usable by any driver who passes the
    hazard, not just its original reporter. Recorded as a deliberate choice, not an oversight,
    since routing's precedent (decision 49) might otherwise suggest an ownership check was
    missed.

## Deviations and open items from M3.2

- **No `api.ts`/wiring, still** — same reason as M3.1's; M3.4 gives this module its first
  `composeCore` wiring, the same order M1.5→M1.6 and M2.2→M2.5 established.
- **No expiry poller.** `expireHazards` exists and is tested, but nothing calls it on a schedule
  yet — the outbox dispatcher (decision 5) is the only existing precedent for an in-process
  poller in this codebase, and whether hazard expiry should follow that same shape or something
  simpler (e.g. expire lazily inside `findNearby`/`findExpirable` itself) is worth a real decision
  once M3.4 has an HTTP surface to observe it through, not guessed at here.
- **`reportHazard`'s merge check does not verify the merge candidate's `reporterId` differs from
  the new attempt's.** A driver could, in principle, "confirm" their own just-filed report by
  resubmitting under a different client id. Not addressed here — design doc §5 doesn't mention
  self-confirmation as a concern, and Phase 1 has no trust scoring to weigh it against (same
  "Phase 2" deferral as decision 60's `DISMISS_MARGIN`). Worth revisiting if it turns out to
  matter in practice.

**M3.3 delivered:** `infrastructure/postgres-hazard-repository.ts` + migration
`0005_hazards.sql` — `hazards` gets a real spatial column from day one, unlike
`routing.route_plans` (decision 55), because `findNearby`'s merge check (M3.2) and the on-route
query (M3.5) both need real `ST_DWithin` now, not a speculative later consumer.

- **`location geography(Point, 4326)`, not `geometry`**: geography's distance functions work in
  metres on a sphere, matching "within ~50m" and "within 30 metres" (design doc §5) directly —
  a `geometry` column would need every query to reason in degrees instead.
- **`measurement_kind`/`_value`/`_unit` are three nullable columns with a `measurement_together`
  check constraint** (all null or all set), not jsonb — a fixed three-field shape, closer to
  `Dimensions`' typed columns (decision 48) than `avoidedRestrictions`' open-shaped jsonb
  (decision 54).
- **`reports_location_idx`** (GiST on `location`) backs `findNearby`; **`reports_status_expires_at_idx`**
  (partial btree, `where status = 'active'`) backs `findExpirable` without scanning
  `dismissed`/`expired` rows.
- **`PostgresHazardRepository`**: same raw-`sql`-tagged-template shape as every other repository
  (decision 26). `findNearby` builds the query point with
  `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography` and orders by `created_at desc`, matching
  merge-policy.ts's "most-recent-first" assumption (M3.1). Round-trips `GeoPoint` via
  `ST_X`/`ST_Y` cast back to `geometry` (geography's own X/Y accessors need the cast).
- **`infrastructure/testing/{db-for-tests,apply-schema}.ts`**: duplicated from routing's own
  copies (decision 26's reasoning — modules can't import `platform/`, even in tests), same as
  every module before it.

425 tests, all green (353 core + 32 driver-bff + 17 architecture + 23 contracts — 10 new tests
against real PostGIS via Testcontainers, up from the 343 core tests M3.2 left off at). `pnpm arch`
clean (174 modules, 595 dependencies).

**Verified by actually running it**, matching the standard every prior infrastructure task in
this codebase has used: `pnpm db:migrate` applied `0005_hazards.sql` against the real local
Postgres (`pnpm db:up`), and `psql \d hazards.reports` confirmed the table, the GiST index, the
partial btree index and the `measurement_together` check constraint all exist exactly as written
— not just "the migration ran without error."

## Decisions from M3.3

64. **`findNearby` orders by `created_at desc` in SQL**, not in the application layer — matches
    merge-policy.ts's documented assumption (M3.1: "candidates are expected to already be ordered
    most-recent-first by the repository") without the repository needing to know why; the ordering
    lives where the query already is.

## Deviations and open items from M3.3

- **No `api.ts`/wiring, still** — M3.4 is next.
- **Table and column names weren't renamed to match `HazardReport`'s field names 1:1 everywhere**
  (`hazards.reports`, not `hazards.hazard_reports`) — matches routing's own convention
  (`routing.vehicle_profiles`, not `routing.routing_vehicle_profiles`): the schema already scopes
  the table, so the table name itself doesn't need to repeat it.

**M3.4 delivered:** `hazards` gets its first HTTP surface and its first `composeCore` wiring —
`report`/`confirm`/`dismiss` are now real, internal-only endpoints, matching identity's and
routing's own first-wiring milestones (M1.6, M2.2).

- **`packages/contracts/src/hazards.ts`**: `hazardTypeSchema` (all eight kinds), `measurementSchema`
  (`.positive()`, same belt-and-suspenders duplication as `dimensionsSchema` — decision 65, below),
  `reportHazardRequestSchema` (`id` rides in the body, since it's caller-supplied per decision 62),
  `hazardReportSchema`. Reuses `geoPointSchema` from `routing.ts` rather than redeclaring an
  identical shape — contracts is deliberately flat (decision 41), so this isn't the same
  cross-module restriction core's own modules have; `driverIdSchema` is already reused the same
  way across `identity.ts` and `routing.ts`.
- **`interface/routes.ts`**: `POST /hazards/reports` (200, not 201 — decision 66, below),
  `POST /hazards/reports/:id/confirm`, `POST /hazards/reports/:id/dismiss`. Same internal-only
  trust model as every other module (decision 38 covers this automatically); `reporterId` is a
  plain trusted field, the same known gap routing's endpoints have (M2.2 deviations) — M4 closes
  it for every module at once.
- **`hazards/api.ts`**: `createHazardsModule` takes no `IdGenerator`, unlike identity's and
  routing's factories — nothing in this module ever generates an id server-side (decision 62).
- **`composeCore`**: hazards is the third module wired in, sharing the same underlying `pg.Pool`
  and untyped Kysely shape as identity's and routing's (decision 30).

444 tests, all green (362 core + 32 driver-bff + 17 architecture + 33 contracts — hazards routes
add 9 core tests, up from the 353 core tests M3.3 left off at, and hazards contracts add 10, up
from 23); `pnpm arch` clean (178 modules, 614 dependencies).

**Verified by actually running it**, matching the standard every prior first-wiring task has
used: built `dist/`, ran `node dist/main.js` against the real `pnpm db:up` Postgres with
`0005_hazards.sql` applied, and drove the whole flow with `curl` — reported a hazard with a note
and a measurement (real row), resubmitted the identical request and got back the identical
response (idempotency confirmed, not just asserted by a unit test), confirmed it (confirmations
→ 1), dismissed it (dismissals → 1), got a real 401 with no `X-Internal-Key` (confirming hazards
inherited the host-level guard automatically, same as decision 38 promised), and a real 404 for
an unknown id. Confirmed the row in `psql`, including `ST_AsText(location::geometry)` round-
tripping the exact coordinates submitted. Test data cleaned up afterwards.

## Decisions from M3.4

65. **`measurementSchema.value` is `.positive()` in the zod schema, duplicating the domain's own
    `validateMeasurement` check** — same pattern as `dimensionsSchema` (M2.2): the zod schema
    catches an invalid value before the use case ever runs, so `InvalidMeasurement` is currently
    unreachable through this internal API. Not removed from the domain — `validateMeasurement`
    is still the actual authority (AGENTS.md rule 15, "the domain decides") and stays exercised by
    its own unit tests; the zod duplication is only an earlier, cheaper rejection at the boundary.
66. **`POST /hazards/reports` returns `200`, not `201`.** Unlike every routing `POST` (which
    always creates something new), this endpoint may return an existing report unchanged (an
    idempotent retry) or an existing report with an extra confirmation (a merge) — the caller
    can't tell which of the three actually happened, and "201 Created" would be wrong for two of
    them. `200 OK` describes all three honestly.

## Deviations and open items from M3.4

- **No expiry poller, still — and now a decision on its shape, not just a gap.** `expireHazards`
  (M3.2) has no scheduler. Considered and deferred: an in-process poller mirroring the outbox
  dispatcher (decision 5) is the only existing precedent, but expiry has none of the ordering or
  at-least-once-delivery concerns that shape was built for (`expire()` is naturally idempotent —
  re-running it on an already-expired report is a no-op). Building poller infrastructure now,
  before a real operational answer to "how often, run where" exists, would be guessing at shape
  without a requirement driving it. **Matters for M3.5**: until something calls `expireHazards`,
  a temporary hazard whose 7 days have passed stays `status: 'active'` in the database, so M3.5's
  on-route/avoidance query needs to treat `isExpired()` (M3.1) as a live, query-time check —
  not assume `status` alone is authoritative — as defense in depth regardless of whether a poller
  ever exists.
- **No `GET /hazards/reports/:id` or a viewport/bounding-box read.** Nothing needs to re-fetch a
  single report yet (mirrors routing's M2.5 deviation), and the bounding-box sync read (design
  doc §5) is a driver-app (M5) concern with no caller yet — `findNearby` is already the query it
  would use, just not exposed over HTTP.

**M3.5 delivered:** `HazardAvoidanceQuery` — the last of M3's three cross-context reads (design
doc §3) — and `PlanRoute` genuinely avoids blocking hazards now, not just a stub with an empty
`avoid: []`. **M3 Hazards core is done.**

- **Asked the user first**, per AGENTS.md's "before larger changes, give a short plan and wait for
  my OK": `RoutingEngine.route()` needs `avoid` polygons _before_ a route's geometry exists to
  check hazards against, so something has to give. Presented two options — a straight-line
  corridor before any routing (one Valhalla call, always, but can miss hazards on a winding real
  route or flag irrelevant ones near the straight line) vs. two-pass routing (plan once, find
  hazards within 30m of the _real_ first-pass geometry, re-plan only if one applies) — with a
  recommendation. **Two-pass, chosen by the user.**
- **`routing/domain/geo.ts`**: `decodePolyline()` (the Google encoded-polyline algorithm at 1e6
  precision, hand-rolled — decision 6/51's "small, well-understood thing" reasoning, no
  dependency) and `bufferPoint()` (a small axis-aligned square around a point — a reported
  hazard's _point_ becomes a small avoid _area_ for Valhalla's `exclude_polygons`, which can't
  exclude a zero-area point). Tested against the standard Google-maps reference vector (precision 5) plus round-trips at precision 6 using a test-only encoder (not shipped — production code only
  ever decodes Valhalla's own output).
- **`hazards/api.ts`**: `findAvoidanceCandidates(corridor, radiusM)` — the read-model method
  routing's adapter calls. Filters to `active`, genuinely-not-expired (`isExpired()`, live-checked
  — decision from M3.4's deviations, since no poller marks a report `expired` yet), _blocking_-type
  reports only, via a `Record<HazardType, ...>` lookup that fails to compile if a ninth
  `HazardType` is ever added without deciding which bucket it's in. Returns `AvoidanceCandidate[]`
  — hazards' own DTO, whose `kind` values happen to equal routing's `ObstructionKind` vocabulary
  by construction, not by either side importing the other's types (AGENTS.md rule 7 satisfied
  literally: routing never imports `HazardReport`/`HazardType`/`HazardStatus`).
- **`hazards/application/ports/hazard-repository.ts` + `PostgresHazardRepository`**:
  `findNearbyLine(points, radiusM)` — the actual on-route detection query design doc §5
  describes, `ST_DWithin` against a real `ST_MakeLine` built from the corridor's points (not a
  per-point distance loop) — proven against real PostGIS with a hazard positioned near a line
  _segment's_ midpoint, far from either endpoint, so the test can't pass by accident via
  distance-to-nearest-vertex.
- **`routing/application/ports/hazard-avoidance.ts` + `infrastructure/hazard-avoidance-query.ts`**:
  the port (owned by routing, per design doc §3) and its adapter — decodes the route polyline,
  calls `hazards.findAvoidanceCandidates`, turns each into a `ReportedObstruction` with a buffered
  `zone`. The one place routing reads anything hazards-shaped.
- **`plan-route.ts`**: two-pass, exactly as decided — first pass with `avoid: []`, `activeNear()`
  against that geometry, `applies()` (M2.4) filters to what affects _this_ vehicle, second pass
  only when something does. A `NoRouteFound` from the second pass propagates as the overall
  result rather than silently falling back to the un-avoided first pass — the vehicle genuinely
  can't get there avoiding a hazard that applies to it, and quietly routing through it anyway
  would violate AGENTS.md's "community reports can only make routing more cautious."
  `hazardsOnRoute` stays empty (decision, below) — only `avoidedRestrictions`' OSM-explanation gap
  remains from M2.5.
- **`FakeRoutingEngine.results`**: an optional per-call queue (consumed in order), added
  alongside the existing single `result` field so every test written before M3.5 keeps working
  unchanged, while new tests can make the first and second pass of a reroute return differently.
- **`composeCore`**: `hazards` is now built _before_ `routing` and passed into it — the first
  time one module's composition has needed another module's built instance, not just a shared
  `db`/`clock`.

382 core tests, all green (up from 362 at M3.4 — 20 new: `decodePolyline`/`bufferPoint`,
`HazardAvoidanceQueryAdapter`, `findNearbyLine` real-PostGIS tests, and `PlanRoute`'s reroute
scenarios); 33 contracts unchanged; `pnpm arch` clean (183 modules, 637 dependencies) — confirming
the `routing → hazards/api.ts` import is a legitimate facade-to-facade read, not a violation.

**Verified against the real stack, not just fakes**: built `dist/`, ran `node dist/main.js`
against real Postgres and the real M2.1 Valhalla instance, and drove the exact scenario the
mechanism exists for — planned a baseline Hexham→Corbridge route for a 4.2m HGV (`8.038km`,
matching every earlier verification of this route back to M2.1), reported a real `low_bridge`
hazard with a 3.5m measurement at a point taken directly from that route's own decoded geometry
(40% of the way along, 302 points), re-planned for the same profile and got a genuine detour
(`12.35km` — Valhalla actually rerouted around it, a real second HTTP call, not a mocked one),
then re-planned for a _different_ profile short enough to clear a 3.5m bridge (`2.5m` height) and
confirmed its route was byte-identical before and after the hazard existed — `applies()` correctly
decided the hazard doesn't affect that vehicle, so no second pass ran. This is the first time
these two months of separately-verified pieces (Valhalla's `exclude_polygons`, `applies()`, the
merge/expiry policy, PostGIS's spatial queries) have all been exercised together as the actual
product mechanism. Test data cleaned up afterwards.

## Decisions from M3.5

67. **Two-pass routing, not a straight-line-corridor single pass — decided by the user, not
    guessed.** A genuine architecture fork (see "delivered," above) with a real product tradeoff
    (accuracy vs. one extra Valhalla call in the true-positive case), not something to pick
    unilaterally. Presented as an `AskUserQuestion` with a recommendation; the user chose the
    recommended option.
68. **`hazardsOnRoute` stays empty, on purpose, not by oversight.** `HazardAvoidanceQuery` is
    scoped to _avoidance candidates_ (blocking types only, per `AVOIDANCE_KIND`) — populating
    `hazardsOnRoute` "for display" would need a broader query returning advisory hazards too,
    which is a different read (design doc §5: "shown and flagged on the route... the driver
    decides") that nothing consumes yet (no driver-app route-overview screen exists before M5).
    Building that query now, with no caller to shape its actual needs, would be the same mistake
    M2.5 avoided by asking before absorbing unscoped work.
69. **`AVOID_ZONE_HALF_WIDTH_M = 25`** (a 50m×50m box around a reported point) is a guess, not a
    derived number — same status as `MERGE_RADIUS_M`/`DISMISS_MARGIN`/the expiry window. Confirmed
    _sufficient_ against one real interchange during verification (the tall HGV genuinely
    detoured), not confirmed _right-sized_ in general — a box this size could still be too small
    for a wide junction or too large for a tight village street. Revisit once real routes are
    tested against it, the same note M2.1 left for `exclude_polygons` box sizing generally.
70. **`isExpired()` is checked live inside `findAvoidanceCandidates`, not left to `status` alone**
    — resolves the concern M3.4's deviations flagged in advance: a temporary hazard whose 7 days
    passed but `expireHazards` hasn't run (no poller exists yet, decision pending in M3.4's
    deviations) must not keep being routed around. This is the defense-in-depth that deviation
    anticipated, now actually built rather than just noted.

## Environment notes

- **`gh` (GitHub CLI) is installed but not on a normal terminal's PATH** — full path
  `C:\Program Files\GitHub CLI\gh.exe`. Its saved credential (a fine-grained PAT) can see this
  account's older public repos but returns 404 for `scottkelly36/Wagonwise` — the token's repo
  access doesn't include this private repo. PRs for this repo are opened by the user directly
  (matches decision 43's browser-auth gap: this repo's PRs have always been created/merged by
  `scottkelly36` per `git log --merges`, not by a prior session's tooling). Revisit if `gh pr
create` is ever actually needed from a session — regenerate the PAT with this repo included, or
  `gh auth login` fresh.
- Node 24.21 (`C:\Program Files\nodejs`), git 2.55.0, Docker Desktop 29.8.0 with WSL2, pnpm
  12.5.1 via corepack (`corepack enable pnpm`). The pnpm store lives on E: (`E:\.pnpm-store`),
  pnpm's default of one store per drive.
- pnpm 12 blocks install scripts by default; allowed ones are listed under `allowBuilds` in
  `pnpm-workspace.yaml` (`esbuild`, and from M1.4 `cpu-features`, `protobufjs`, `ssh2` —
  Testcontainers' transitive deps). The `pnpm` field in package.json is no longer read.
- **`corepack enable pnpm` needs an admin terminal** — it writes into `C:\Program Files\nodejs`,
  which a normal user account can't do. Run it once from an elevated PowerShell; until then
  `pnpm` isn't on a normal terminal's PATH (a session working around this with a temporary shim
  doesn't fix it for your own terminal).
- Git needs `git config --global --add safe.directory E:/projects/wagonwise` on any freshly
  reinstalled Windows account before it will read this repo ("dubious ownership" — the repo's
  files are owned by the pre-reinstall account SID). Global `user.name`/`user.email` also need
  setting again after a clean install; both are set as of 2026-09-22.

## Resolved: fresh Windows 11 install (2026-09-21 → 2026-09-22)

Work paused 2026-09-21 for a clean Windows 11 install (only `C:` wiped; `E:\projects\wagonwise`
is on a separate physical disk and was never touched). The repo survived untouched, and a
`git bundle` backup was taken before the wipe as a second copy (`D:\backups\wagonwise.bundle` —
still there, harmless to keep). Rebuilt in order: Node 24, Docker Desktop (needed `wsl --install
--no-distribution` from an admin PowerShell plus a reboot — Docker's own installer didn't enable
WSL2 on its own this time), git (needed the `safe.directory` and identity fixes now in
Environment notes, above), then `pnpm install`. All verified green before M1.4 started; see
Environment notes for what a future clean install will need to redo.

## M4 task breakdown

| #    | Task                                                                                         | Status            |
| ---- | -------------------------------------------------------------------------------------------- | ----------------- |
| M4.1 | Core-side local access-token verifier + `driver-auth` host hook (built, not wired)           | Done — 2026-09-22 |
| M4.2 | Wire the hook onto routing routes; `driverId` comes from the token, not the body/query       | Done — 2026-09-22 |
| M4.3 | Same for hazards' `reporterId`                                                               | Done — 2026-09-22 |
| M4.4 | `apps/driver-bff` gets routing + hazards routes (forwarding, mirroring `identity-routes.ts`) | Done — 2026-09-22 |
| M4.5 | End-to-end verification through the BFF only, no `driverId` anywhere in a request body       | Folded into M4.4  |

OTP sign-in, invite codes, and sessions + refresh rotation (the rest of the design doc's M4 "done
when") already exist from M1.5/M1.6 — this breakdown is scoped to the actual remaining gap:
routing and hazards trust a client-supplied `driverId`/`reporterId`, and neither module is wired
into the BFF yet (decision 1, flagged in M3's own "Next session" notes below).

**M4.1 delivered:** the pieces core needs to verify its own tokens, built and tested in isolation
— the same "port before it has a caller" precedent as M2.3's `RoutingEngine` and M2.4's
`applies()`, since wiring this onto real routes without first proving it in isolation would risk
locking testers out mid-change with no isolated test catching the mistake.

- **`host/access-token-verifier.ts`**: `createLocalAccessTokenVerifier(publicJwk)` — verifies an
  Ed25519 access token against a JWK directly, no HTTP. Unlike the BFF's own
  `access-token-verifier.ts` (which has no key and fetches one from core's JWKS route via jose's
  `createRemoteJWKSet`), core already holds the exact key pair that signed the token (decision 1)
  — no round trip, just `jose`'s `importJWK`/`jwtVerify` against the same public JWK
  `TokenSigner.publicJwk()` already exposes. Takes the JWK itself, not a `TokenSigner`, so
  `host/` still imports nothing from `modules/identity/` — `build-app.ts`'s own doc comment says
  host "knows nothing about bounded contexts," and this keeps that true.
- **`host/driver-auth.ts`**: `registerDriverAuth(app, verifier, prefixes)` — an `onRequest` hook
  gated to whatever path prefixes it's given (unlike `internal-auth.ts`'s unconditionally global
  hook with one `/health` exemption), since identity's own pre-token routes (`otp/request`,
  `otp/verify`, `token/refresh`, its JWKS route) run before any access token exists. `prefixes` is
  explicit rather than hardcoded to `/routing`/`/hazards` — each module joins the gate only once
  its own interface layer actually reads `request.driverId`, so M4.2 and M4.3 wire it in
  separately instead of one change silently gating both. Extracts a `Bearer` token, verifies it,
  and sets `request.driverId`/`request.sessionId` (a Fastify request decoration, new pattern in
  this codebase) for a route handler to read. Error tags (`missing_bearer_token`,
  `invalid_access_token`) deliberately match the BFF's `identity-routes.ts` exactly — the same
  failure has the same name on both sides of the wire.
- **Not wired into `build-app.ts`/`compose-core.ts`/`main.ts` yet, and no route reads
  `request.driverId` yet** — same reasoning as M2.3's `RoutingEngine` port landing before
  `composeCore` knew about it. Wiring an auth gate onto routing/hazards before those routes stop
  expecting `driverId` in the body would just break every existing curl-driven verification with
  nothing new to show for it; M4.2/M4.3 do the wiring and the route changes together, atomically.

394 core tests (up from 382 at M3.5 — 12 new: 5 for the verifier, 7 for the hook), 32 driver-bff,
17 architecture, 33 contracts — 476 total, all green. `pnpm arch` clean (187 modules, 647
dependencies). `pnpm verify` clean end to end (lint, typecheck, test, arch, format).

**Verified by its own design, not a real run** — same status as M2.3's port and M2.4's
`applies()` before they had a caller: nothing wires this yet, so there's no server to run it
against. `access-token-verifier.test.ts` proves real Ed25519 sign/verify round trips (matching
key, wrong key, expired, malformed) with no mocked crypto; `driver-auth.test.ts` proves the hook's
gating (missing header, non-Bearer header, a rejected token, a valid token exposing claims on the
request, `/identity` and `/health` correctly ungated) against a bare Fastify instance.

**M4.2 delivered:** routing's own trust gap closes — `driverId` is now derived from a verified
access token on every routing route, never a body or query field, and `pnpm arch` still passes
with `host/` importing nothing from `modules/identity/`.

- **`driver-auth.ts`'s `prefixes` parameter, added right before wiring**: `registerDriverAuth`
  was written in M4.1 with a hardcoded `['/routing/', '/hazards/']` list. Wiring it as-is here
  would have gated hazards' existing routes too, before M4.3 updates them to stop expecting
  `reporterId` in the body — every hazards test and curl flow would 401 with nothing done yet to
  fix it. Caught before writing any wiring code, by walking through what `build-app.ts` would
  actually do once the hook ran globally; fixed by making the prefix list an explicit parameter
  (`registerDriverAuth(app, verifier, prefixes)`), so `build-app.ts` passes `['/routing/']` now
  and gains `'/hazards/'` only in M4.3, once hazards is actually ready for it.
- **`packages/contracts/src/routing.ts`**: `driverId` removed from
  `createVehicleProfileRequestSchema`, `updateVehicleProfileRequestSchema` and
  `planRouteRequestSchema`; `driverIdQuerySchema` deleted outright (list/get/delete routes need no
  query at all now — the id comes from the path, the driver from the token). Response schemas
  (`vehicleProfileSchema`, `routePlanSchema`) keep `driverId` — that's still real output data, just
  no longer real input.
- **`routing/interface/routes.ts`**: a new `requireDriverId(request, reply)` helper reads
  `request.driverId` (set by the hook) and brands it via `makeId<'DriverId'>`, 401ing
  (`{ error: 'unauthenticated' }`) if it's missing — reachable only if a route here were ever
  registered without the hook in front of it (a wiring bug, not a real request shape), so this is
  defence in depth, not a path a driver can trigger. Every handler calls it first, before parsing
  its own body/query.
- **`host/build-app.ts`**: `AppDeps` gains `accessTokenVerifier`; `registerDriverAuth(app,
accessTokenVerifier, ['/routing/'])` registered right after `registerInternalAuth`.
  `compose-core.ts` takes `accessTokenVerifier` as a new required parameter (same
  passed-in-already-built pattern as `tokenSigner`, since building either is async) and threads it
  through, with an `overrides.accessTokenVerifier` escape hatch for tests, mirroring
  `overrides.tokenSigner`. `main.ts` builds it via
  `createLocalAccessTokenVerifier(await tokenSigner.publicJwk())` right after building
  `tokenSigner`.
- **Routing's own `routes.test.ts`** doesn't exercise real token verification (that's
  `driver-auth.test.ts`'s job, against real crypto) — its `buildApp()` helper gets a trivial
  `onRequest` hook that copies a plain `x-test-driver-id` header onto `request.driverId`, so every
  existing ownership/404 test keeps testing what it was actually testing (the use case and route
  logic) without needing real signed tokens for every case.

399 core tests (up from 394 at M4.1 — net +5: new coverage in `build-app.test.ts` proving the hook
is really wired for `/routing` but not yet `/hazards`, plus a 401-with-no-authenticated-driver case
in routing's own `routes.test.ts`, offset by removing the now-redundant driverId-in-query
validation tests), 32 driver-bff, 17 architecture, 33 contracts. `pnpm arch` clean (187 modules,
652 dependencies). `pnpm verify` clean end to end.

**Verified by actually running it**, matching the standard every prior first-wiring milestone in
this codebase has used, not just tests: built `dist/`, ran `node dist/main.js` against real
Postgres and the real M2.1 Valhalla instance, seeded two invite codes, and signed in two separate
real drivers through the actual OTP flow to get two real Ed25519-signed access tokens. With driver
A's token and no `driverId` anywhere in any request body: created a vehicle profile (the response's
`driverId` came from the token's `sub` claim), listed it, and planned a real Hexham→Corbridge route
(`distanceKm: 8.038`, matching every earlier verification of this exact route back to M2.1).
Confirmed the isolation is real, not just asserted: driver B's token got a 404 fetching driver A's
profile by id and an empty list, a garbage bearer token got `401 invalid_access_token`, and a
request with a valid `X-Internal-Key` but no `Authorization` header got `401
missing_bearer_token` — the internal-key gate and the driver-auth gate are both real and
independent. `README.md`'s routing section updated to match (no more `driverId` in any example).
Test data (two drivers, their invite codes, sessions, the vehicle profile and route plan) cleaned
up in `psql` afterwards.

**M4.3 delivered:** hazards' trust gap closes the same way routing's did — `reporterId` on
`POST /hazards/reports` now comes from a verified access token, and the driver-auth hook now gates
the whole `/hazards/` prefix, confirm/dismiss included.

- **`build-app.ts`'s `DRIVER_AUTH_PREFIXES`** grows to `['/routing/', '/hazards/']` — the one-line
  change M4.1's parameterised `prefixes` argument existed to make safe, exactly as planned.
- **`packages/contracts/src/hazards.ts`**: `reporterId` removed from `reportHazardRequestSchema`
  only — `hazardReportSchema` (the response) keeps it, same as routing's response schemas.
- **`hazards/interface/routes.ts`**: a `requireDriverId` helper, deliberately duplicated from
  routing's own rather than shared (AGENTS.md rule 6 — no cross-module import for something this
  small), used only by `POST /hazards/reports`. Confirm/dismiss don't call it — decision 63 gives
  them no ownership check, any authenticated driver may act on any report — but both routes still
  sit behind the same host-level hook, so an unauthenticated caller (no bearer token at all, even
  with a valid `X-Internal-Key`) can't reach them either. Verified live: confirming with no token
  is a real `401`, not merely untested.
- **`routes.test.ts`** gets the same test-only `x-test-driver-id` header trick routing's test
  adopted in M4.2, so ownership/idempotency tests keep testing use-case logic without needing real
  signed tokens.

402 core tests (up from 399 at M4.2), 32 driver-bff, 17 architecture, 33 contracts. `pnpm arch`
clean (187 modules, 652 dependencies). `pnpm verify` clean end to end.

**Verified by actually running it**, the same standard as M4.2: rebuilt `dist/`, ran it against
real Postgres, seeded an invite code, signed in a real driver through the actual OTP flow. With
that token and no `reporterId` anywhere: reported a `low_bridge` hazard with a real measurement
(the response's `reporterId` came from the token's `sub` claim, matching the driver from sign-in),
confirmed it (`confirmations: 1`, using the same token — no ownership check, per decision 63).
Confirmed the gate is real: no bearer token (even with a valid `X-Internal-Key`) got `401
missing_bearer_token` on both the report and the confirm route. Test data (the driver, their
invite code, session, and the hazard report) cleaned up in `psql` afterwards.

**M4.4 delivered:** `apps/driver-bff` forwards routing and hazards, the same "verify twice"
pattern identity's own `sessions/:id/revoke` route already had. **M4 Driver BFF + auth is done.**

- **`core-client.ts` reworked**: `post(path, body, requestId)` replaced by one general
  `request(method, path, requestId, { body?, authorization? })` — routing needs `GET`/`PUT`/
  `DELETE`, not just `POST`, and every one of these calls now needs an `Authorization` header
  forwarded, which `post()` never supported. `identity-routes.ts`'s four call sites updated to
  match; its own behaviour is unchanged (confirmed by its existing tests passing unmodified in
  substance, only the fake's shape changed).
- **`auth/authenticate.ts`**: a new `authenticateOrReject(request, reply, verifier)` helper —
  extracts the bearer token, verifies it locally (fails fast, `401 missing_bearer_token` /
  `401 invalid_access_token`), and returns the _original_ token string unchanged for the caller to
  forward. Shared by routing's and hazards' route files, which only need the raw token;
  `identity-routes.ts` keeps its own inline copy for `sessions/:id/revoke`, which additionally
  needs the parsed session id — a genuinely different job, not forced through the shared helper.
- **`routing-routes.ts` / `hazards-routes.ts`**: new, same shape as `identity-routes.ts` —
  validate against `@wagonwise/contracts` (schemas already `driverId`/`reporterId`-free from
  M4.2/M4.3), authenticate-or-reject, forward to core with the original token as `Authorization`
  and the BFF's own `X-Internal-Key`, relay core's status/body back unchanged. Hazards' confirm/
  dismiss routes authenticate too, even though they don't read the resulting token anywhere
  (decision 63, no ownership check) — matches core's own driver-auth hook, which gates the whole
  `/hazards/` prefix regardless of whether a given handler uses the claim.
- **`src/testing/fakes.ts`**: `FakeCoreClient`/`FakeAccessTokenVerifier` extracted out of
  `identity-routes.test.ts` into one shared file, now used by all three route test files — the
  first time this flat app's tests needed the same double twice, so worth de-duplicating rather
  than tripling the same ~20 lines.
- **`main.ts`**: builds one `routeDeps` object (`coreClient`, `accessTokenVerifier`) and registers
  all three route modules against it.
- **`README.md`**: Routing section now documents both paths (through the BFF, or core directly);
  a new Hazards section (never had one before — M3.4 shipped the endpoints without README
  coverage, a real pre-existing gap, closed here since these routes are newly driver-reachable);
  Driver BFF section updated to describe forwarding routing/hazards, not just identity.

56 driver-bff tests (up from 32 at M4.3 — 24 new: `core-client.test.ts` rewritten for `request()`
plus GET/PUT/DELETE/Authorization-forwarding cases, `auth/authenticate.test.ts`, and full
suites for the two new route files), 402 core, 17 architecture, 33 contracts. `pnpm arch` clean
(194 modules, 677 dependencies). `pnpm verify` clean end to end.

**Verified by actually running it, through the BFF only** — the standard every prior first-wiring
milestone has used, and this one folds in what M4.5 would otherwise have separately verified
(decision, above — a real run through the BFF is exactly what M4.5 asked for, so a separate pass
would just repeat it). Built and ran both `dist/main.js`, core and BFF, against real Postgres and
the real M2.1 Valhalla instance. Signed in a real driver through the BFF's own identity routes
(otp/request → the code from core's console log → otp/verify), no `X-Internal-Key` touched by the
caller at any point. With nothing but that access token: created a vehicle profile (`driverId`
correctly traced through BFF → core → the token's own `sub` claim), listed it, fetched it by id,
updated it (PUT), planned a route (`distanceKm: 8.038`, matching every earlier verification of
this exact route back to M2.1), reported a hazard and confirmed it (`reporterId`/no ownership
check both correct), and deleted the profile (204). Confirmed the gate holds at the BFF itself: no
token at all got `401 missing_bearer_token` before the BFF ever called core. Confirmed request
tracing survives the full chain: the same `reqId` appears in both services' logs for every one of
these calls. Test data (driver, invite code, session, profile, route plan, hazard report) cleaned
up in `psql` afterwards.

## Next session

**M4 Driver BFF + auth is done (M4.1–M4.5).** Every driver-facing endpoint — identity, routing,
hazards — is now reachable through `apps/driver-bff` with nothing but a bearer token, verified
twice (BFF fails fast, core is authoritative), proven against a real running stack signing in a
real driver and driving every route through the BFF only. **M5 (Driver app) is next** per the
design doc's milestone table — read `docs/phase-1-tech-design.md`'s §8 (driver app) before
starting it, the same way M2/M3/M4 each started from a fresh read of their own design-doc section.

Real gaps carried forward, worth closing before drivers touch this for real:

- **No expiry poller** (M3.2/M3.4 deviations) — `expireHazards` exists, tested, and unscheduled.
  `findAvoidanceCandidates` already defends against the specific safety risk (a stale-but-still-
  `active` hazard staying routed-around forever) by checking `isExpired()` live, so this is an
  operational/UI-staleness gap now (an expired hazard still shows as `active` to a driver browsing
  the map), not a routing-safety one. Worth a real decision once there's an operational answer to
  "how often, run where," not guessed at without one.
- **No `routing.restriction_overrides` ingestion** (M2.5/M2.6) — the avoided-restriction
  explanation's real blocker, `RoutePlan.avoidedRestrictions` still always `[]`. Still unscheduled.
- **`hazardsOnRoute` still always `[]`** (decision 68) — needs a broader "hazards near this route,
  including advisory types" read that nothing consumes yet; a real candidate for whenever M5's
  driver-app route-overview screen exists to shape what it actually needs.

The open question "how complete is OSM restriction data on testers' actual routes around Hexham?"
(Open questions, above) is still unanswered — M2.6 deliberately didn't investigate it, and M3
didn't either (hazard reports are the long-term fix for this gap, per design doc §4, but M3 built
the reporting mechanism, not an audit of existing data quality). Still worth deciding when to
actually pick up rather than letting it sit indefinitely.

## M5 task breakdown

The user decided to design for both iOS and Android from the start (resolves the "iOS, Android or
both?" open question, above), so there's no platform-scoping decision left to make before M5
starts.

| #     | Task                                                                                                                 | Status            |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| M5.1  | `apps/driver-app` skeleton — Expo + Expo Router + TS, EAS config for both platforms, points at driver-bff via config | Done — 2026-09-22 |
| M5.2  | Auth — sign-in screen, secure token storage, TanStack Query client, opportunistic refresh                            | Done — 2026-09-23 |
| M5.3  | Vehicle profiles screens                                                                                             | Done — 2026-09-23 |
| M5.4  | Plan route screen (MapLibre)                                                                                         | Done — 2026-09-23 |
| M5.5  | Route overview screen                                                                                                | Done — 2026-09-23 |
| M5.6  | Active trip screen (no voice/reroute yet — M6/M7)                                                                    | Done — 2026-09-23 |
| M5.7  | Report hazard (tap) + hazard detail                                                                                  | Done — 2026-09-23 |
| M5.8  | Offline hazard queue (expo-sqlite)                                                                                   | Done — 2026-09-23 |
| M5.9  | Feedback screen                                                                                                      | Done — 2026-09-23 |
| M5.10 | Real-device/simulator verification both platforms; EAS Build → TestFlight + Play internal                            | In progress       |

**M5.10 in progress:** real-device verification on Android done — the app (including the M7
voice flow) was run on a physical Android phone via Expo Go/dev client on 2026-09-25 and works.
iOS real-device verification and the EAS Build → TestFlight + Play internal step are both still
open; the latter is blocked on the Apple/Google Play developer accounts (Expo's own EAS account
is already set up).

**M5.1 delivered:** `apps/driver-app` exists as a real Expo project — not just a plan for one —
scaffolded from Expo's own SDK 57 template and cut down to a genuine skeleton (one screen, no
demo/tab/web boilerplate), matching M1.3's own "boots and answers /health" standard: the one
screen shows the product name and a live reachability check against the driver BFF's `/health`.

- **Scaffolded via `create-expo-app` (the "default"/tabs SDK-57 template), then stripped hard**:
  deleted the demo tab screen, animated-icon/glass-effect/app-tabs components, all web support
  (`react-native-web`, the `web` app.json key, `.web.tsx` variants — the design doc's distribution
  story is TestFlight + Play, never web), `react-native-reanimated`/`worklets` (nothing here
  animates yet), and the template's own `.claude/settings.json` (enabled an unrelated Expo Claude
  plugin — this repo already has its own AGENTS.md-driven conventions). Kept only what a real
  skeleton needs: `expo-router`'s peer deps (`gesture-handler`, `safe-area-context`, `screens`),
  `expo-constants`/`expo-linking`/`expo-splash-screen`/`expo-status-bar`/`expo-system-ui`.
- **`src/product.js` (deliberately `.js`, not `.ts`)** holds the one `PRODUCT_NAME` constant
  AGENTS.md asks for ("keep the product name in one config constant"), imported by both
  `app.config.ts` (the native app name) and in-app UI text. Found by actually running
  `expo export`, not assumed: Expo's config loader transpiles only `app.config.ts` itself, not any
  TypeScript file it imports — a sibling `product.ts` failed to resolve under plain `require`
  once evaluated. A plain `.js` file needs no transpilation, so it resolves from both sides
  (`expo/tsconfig.base`'s `allowJs` covers the TS-side import).
- **`app.config.ts` replaces `app.json`** (dynamic config, specifically so it can import
  `PRODUCT_NAME`), sets real `bundleIdentifier`/`package` (`com.wagonwise.driverapp`), and drops
  the template's iOS "Icon Composer" bundle (`.icon`, bleeding-edge, adds an SVG+grid asset
  bundle) for a plain `icon.png` shared with Android — simpler, revisit once there's real
  branding.
- **`src/config.ts`**: the one place this app reads `process.env` (mirrors
  `apps/core/src/config.ts`'s rule), resolving the driver BFF's URL — `10.0.2.2` on the Android
  emulator (its documented alias for the host's own `localhost`), plain `localhost` on the iOS
  simulator (shares the host's network namespace), overridable via `EXPO_PUBLIC_BFF_URL` for a
  physical device on the LAN. Actual logic worth testing, so it got a real test file
  (`config.test.ts`, 3 cases) rather than being left as an assumption — matches AGENTS.md's "write
  tests alongside every use case."
- **Deliberately deferred, not forgotten**: no TanStack Query or Zustand yet (design doc's stack
  for this app) — nothing here has real server or UI state to manage before M5.2's auth screen
  exists; wiring either now would be the same "port before it has a caller" mistake M2.3 avoided,
  applied to a dependency instead of a port. No `@wagonwise/contracts` dependency yet either — the
  only network call so far is an unshaped `/health` ping, not a contract-shaped request.
- **Tooling deviations, decided and recorded rather than forced to match core/driver-bff**:
  `tsconfig.json` extends `expo/tsconfig.base`, not `@wagonwise/config/tsconfig.base.json` — the
  shared base sets `module`/`moduleResolution: NodeNext` (needs `.js`-suffixed relative imports),
  which fights Metro's bundler-style resolution; RN code here is bundled by Metro, never run by
  plain `node`. Same reasoning for `eslint.config.js`: Expo's own `eslint-config-expo/flat`, not
  `@wagonwise/config/eslint` — the "well-understood official preset" is the boring choice, same as
  M4.1's reasoning for using `jose` over hand-rolling JWKS handling. `tsconfig.json` also needed an
  explicit `"types": ["jest"]` — TS's automatic `@types` inclusion didn't pick up `@types/jest`
  under `expo/tsconfig.base`'s settings without it, confirmed by hitting real "cannot find name
  'describe'" errors, not guessed in advance.
- **`eas.json`**: `development`/`preview`/`production` build profiles for both platforms. Not yet
  linked to a real Expo account/project — `eas login`/`eas init` are one-time interactive steps
  only the user can do (this session can't authenticate as them). Genuinely deferred to M5.10, not
  forgotten.
- **`turbo.json`'s `dev` task gains `EXPO_PUBLIC_BFF_URL`** in `passThroughEnv` — the exact
  documented gotcha in AGENTS.md's Tooling section, applied before it could bite rather than after.
- **Found and fixed a real, pre-existing bug while running `pnpm verify`, unrelated to this
  task**: `apps/driver-bff/src/core-client.ts`'s `responseBody` was an implicit `any` from
  `response.json()`, flagged by `@typescript-eslint/no-unsafe-assignment` — a real lint violation
  from M4.4 that had simply never been re-linted since (Turborepo's lint cache replays a passing
  result until something invalidates it; adding `apps/driver-app`'s dependencies changed
  `pnpm-lock.yaml`, which did). Fixed with an explicit `unknown` annotation on the `const`, the
  rule's own documented escape hatch — one line, no behaviour change.
- **`pnpm-workspace.yaml`'s `allowBuilds`** gains `@parcel/watcher` (Metro's native file watcher)
  and `unrs-resolver` (a transitive dependency of `eslint-config-expo`'s import resolution),
  both legitimate native binaries from reputable ecosystems, approved the same way M1.1's
  `esbuild` was.
- **Two real dependency-version mistakes caught by actually running the tooling, not assumed
  correct from `create-expo-app`'s scaffold**: `expo-router` needs `expo-constants` as a peer
  dependency (missing after the trim-down; `expo-doctor` caught it as a real crash risk, not a
  lint nicety) and the scaffold's own `jest@^30`/`@types/jest@^30` are newer than SDK 57's
  `jest-expo` actually expects (`~29.7.0`/`29.5.14`) — `expo-doctor` flagged both as version
  mismatches. Fixed by installing the missing peer and pinning the two test-tooling versions down
  to what the SDK expects; `expo-doctor` now reports 21/21 checks passing.

409 core tests (unchanged), 56 driver-bff, 17 architecture, 33 contracts, plus **3 new driver-app
tests** (`config.test.ts`) — the first tests in `apps/driver-app`. `pnpm arch` clean (203 modules,
686 dependencies — the architecture rules already scan `apps/driver-app/src` automatically, same
`check.mjs` discovery M1.6 confirmed for driver-bff, no config change needed). `pnpm verify` clean
end to end across all six packages.

**Verified by actually running the tooling, with a real and disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` reports 21/21; `npx
expo export --platform android` and `--platform ios` both produce a real Hermes-compiled bundle
(1250 and 1105 modules resolved respectively) — proof every import genuinely resolves and Metro
can genuinely bundle for both platforms, the same "prove the mechanism, not just that a process
starts" standard M2.1 set for Valhalla. **Not verified: an actual running app.** This machine has
no Android SDK/emulator and no macOS (the design doc's own note: iOS needs a Mac or Expo Go), so
nothing here has been driven by a real simulator, a physical device via Expo Go, or a screenshot —
worth doing before trusting `src/config.ts`'s platform-detection logic beyond what its unit tests
cover. `git status`/`git add -n` confirmed exactly the intended file set is tracked (no
`node_modules`, `.expo/`, or `expo export` scratch output).

## Decisions from M5.1

- **`apps/driver-app` deliberately does not reuse `@wagonwise/config`'s tsconfig/eslint presets.**
  Recorded above, in the "delivered" notes — the first time a package in this monorepo has needed
  its own tooling base rather than the shared one, because it's the first package Metro bundles
  instead of `tsc`/`node` running.
- **The product's display name lives in a `.js` file, not a `.ts` one, specifically so
  `app.config.ts` can import it.** Also recorded above — a real Expo config-loader constraint
  found by running `expo export`, not a style preference.

**M5.2 delivered:** a real sign-in flow — OTP over email/phone plus an invite code on first
sign-in, a persisted session, and proactive token refresh — reachable end to end through the BFF,
matching the design doc's own wording ("the app refreshes its access token opportunistically,
never only on a 401").

- **`src/api/identity.ts`**: thin fetch wrappers for `otp/request`, `otp/verify`,
  `token/refresh`, parsing every response through `@wagonwise/contracts/identity`'s own zod
  schemas (AGENTS.md rule 11 — no hand-written duplicate types) and throwing a single
  `IdentityApiError { tag, status, attemptsRemaining? }` on any non-200, so screens have one
  thing to catch rather than a different shape per route.
- **`src/state/auth-store.ts`** (Zustand): a three-state union (`restoring` / `signedOut` /
  `signedIn`), not booleans plus optional fields — a driver is never "half signed in." Persists
  only the refresh token and driver info to `expo-secure-store`; the access token is **never**
  persisted, deliberately — `restore()` exchanges the stored refresh token for a fresh access
  token on every cold start rather than trusting a stale one to still be valid, and rotates the
  persisted refresh token immediately (decision 33: reuse of a rotated-away token revokes the
  whole session, so the persisted copy must always be the current one). A dead/reused refresh
  token on restore clears storage and goes to `signedOut` rather than leaving the app stuck on a
  loading spinner forever.
- **`src/hooks/use-opportunistic-refresh.ts`** schedules a refresh ahead of the access token's
  real expiry (read via `src/lib/jwt.ts`'s `accessTokenExpiryMs`, decode-only — this app has no
  key to verify a signature with, only core and the BFF do, decision 1) and re-checks on every
  `AppState` transition to `active`, covering the case where the scheduled JS timer never fired
  because the app was suspended in the background. The actual scheduling arithmetic lives in
  `src/lib/refresh-schedule.ts` as two pure functions (`refreshDelayMs`, `shouldRefreshOnResume`),
  tested directly with no timers, no `AppState` mock, no rendered hook — the hook itself is thin
  glue, verified by design over the tested pure core the same way M2.3/M2.4 verified a port/pure-
  function pair before either had a caller to run against.
- **`src/app/sign-in.tsx`**: two-step screen (identifier + optional invite code → code), 56px+
  tap targets, high-contrast dark theme, plain UK-English error copy per tag (`OtpIncorrect` shows
  the real `attemptsRemaining` count). The invite code is captured once on step one and carried
  forward silently to `verifyOtp` on step two — both `otp/request` and `otp/verify` need it on a
  genuinely new identifier (confirmed by reading `request-otp.ts`/`verify-otp.ts`: the code is
  validated-but-not-redeemed at request time, redeemed atomically with creating the `Driver` at
  verify time), so asking the driver to type it twice would be a real UX bug, not just untidy.
- **`src/app/index.tsx` is a redirect gate, not a screen** — shows a spinner while `restore()`
  settles, then `<Redirect>`s to `/sign-in` or `/home`. `src/app/home.tsx` is a deliberate
  placeholder (identifier + sign-out button, nothing else) — real screens are M5.3+; its only job
  here is proving the sign-in flow actually reaches a signed-in area.
- **Two real Jest/ESM tooling problems, found by running the test suite, not anticipated**:
  `@wagonwise/contracts`'s `package.json` `exports` only had `types`/`import` conditions; Jest's
  default resolver doesn't request `import`, so `@wagonwise/contracts/identity` came back
  "cannot find module" even though Metro resolves it fine. Fixed by adding a `"default"`
  condition alongside `"import"` for every subpath (Node's own documented fallback condition,
  not a workaround). Separately, `jose` (also used for JWT decode, decision 39's precedent —
  hand-rolling a signed-token library would be the actual workaround) ships ESM-only with no CJS
  build at all; Jest's default `transformIgnorePatterns` skips transpiling it since it isn't on
  jest-expo's react-native/expo allow-list, so `require`-ing it hit a raw
  `Cannot use import statement outside a module`. Fixed by extending (not replacing)
  jest-expo's default pattern in `apps/driver-app/jest.config.js` to also transpile `jose`.
- **No `@wagonwise/contracts` change needed for `hazards`/`routing`'s own exports** — only
  `identity`'s subpath is consumed from `apps/driver-app` so far; the same `"default"` condition
  was still added to all three for consistency, since the next module M5.3+ needs will hit the
  identical Jest resolution gap otherwise.

402 core tests (unchanged), 56 driver-bff (unchanged), 17 architecture, 33 contracts, and
**27 driver-app tests** (up from 3 at M5.1 — `identity.test.ts`, `jwt.test.ts`,
`refresh-schedule.test.ts`, `auth-store.test.ts`, plus the existing `config.test.ts`). `pnpm arch`
clean (219 modules, 723 dependencies). `pnpm verify` clean end to end across all six packages.

**Verified the same way as M5.1, with the same disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` and `--platform ios` both produce a real Hermes bundle (1456/1105+ modules —
up from M5.1's count, confirming the new auth/query/secure-store code and `@wagonwise/contracts`
import genuinely resolve and bundle, not just typecheck). `packages/contracts`'s own typecheck and
`vitest run` re-confirmed unaffected by the `exports` change. **Still not verified: an actual
running app** — same hardware gap as M5.1 (no Android SDK, no macOS). The sign-in flow has never
been driven against a real running core + BFF with a real OTP code; worth doing before trusting it
beyond what the mocked-fetch unit tests cover.

## Decisions from M5.2

- **The access token is never persisted, only the refresh token.** Recorded above — cold start
  always re-derives a fresh access token via `token/refresh` rather than trusting a stored one,
  keeping exactly one code path (`restore()`) responsible for "how does this app get a valid
  access token," instead of two (restore-from-storage and refresh-when-expired) that could drift.
- **`packages/contracts`'s `exports` gained a `"default"` condition; `apps/driver-app`'s Jest
  config extends jest-expo's `transformIgnorePatterns` for `jose`.** Both recorded above — real
  tooling constraints found by running the test suite, not assumptions.

**M5.3 delivered:** vehicle profile CRUD — list, create, edit, delete — reachable end to end
through the BFF's `/routing/vehicle-profiles` routes, the design doc's screen table's "large
number inputs, metres and tonnes with feet/inches shown alongside height."

- **`src/api/http.ts`**: a shared `requestJson(method, path, options)` + `throwUnlessSuccess`,
  factored out of M5.2's `identity.ts` once `routing.ts` needed the identical pattern with two
  differences identity never had — `GET`/`PUT`/`DELETE`, and an `Authorization` header. Same
  "one method covering every verb" reasoning as the BFF's own `core-client.ts` (M4.4).
  `src/api/errors.ts`'s `IdentityApiError` renamed to `ApiError` in the same change — the error
  shape (`{ tag, status, attemptsRemaining? }`) is identical across every module, and a screen
  only ever needs `error.tag`, never which module produced it.
- **`src/api/routing.ts`**: thin wrappers for all five vehicle-profile routes, parsing every
  response through `@wagonwise/contracts/routing`'s own schemas (rule 11, same as identity.ts).
  `updateVehicleProfile` reuses `createVehicleProfileRequestSchema` rather than importing
  `updateVehicleProfileRequestSchema` — the two are structurally identical in
  `packages/contracts/src/routing.ts`, so importing both would just parse the same shape twice.
- **`src/lib/vehicle-profile-form.ts`**: pure parse/validate/format functions, no React — the
  same hook/pure-function split M5.2's `use-opportunistic-refresh.ts` established.
  `parseVehicleProfileForm` mirrors core's own `validateName`/`validateDimensions`
  (`routing/domain/vehicle-profile.ts`) exactly — a driver sees the same "must be a positive
  number" rejection before a network round trip, not a looser client-side rule the server would
  reject anyway (confirmed by reading the domain function, not guessed at).
- **`src/lib/units.ts`**: `formatHeightWithFeetInches`, height only — AGENTS.md's feet/inches
  rule is specifically about height (UK bridge signage), not width/length/weight, matching the
  design doc's own screen-table wording ("...with feet/inches shown alongside height"). Tested
  against AGENTS.md's own worked example (a 3.5m bridge) rather than an arbitrary number.
- **`src/components/vehicle-profile-form.tsx`**: one shared form for both create and edit — the
  first component this app has needed twice, so worth de-duplicating (matches M4.4's
  `src/testing/fakes.ts` precedent: extract on the _second_ real use, not speculatively on the
  first). Shows the driver's own validation message inline, clearing it as soon as a field
  changes, distinct from a server-side error from the last submit attempt (a stale "couldn't
  reach the server" message must not linger once the driver starts correcting a typo).
- **Vehicle profile screens use plain string route paths (`/profiles`, `/profiles/new`) and the
  object form for the dynamic one** (`{ pathname: '/profiles/[id]', params: { id } }`) — Expo
  Router's `experiments.typedRoutes` (already on since M5.1) generates static types for exactly
  this shape; confirmed by running `tsc --noEmit` clean, not assumed to typecheck.
- **A real, first-of-its-kind architecture-tooling gap, found by running `pnpm arch`, not
  anticipated**: `packages/architecture/dependency-cruiser.config.cjs`'s
  `enhancedResolveOptions.extensions` was `['.ts', '.js', '.json']` — no `.tsx` — because no file
  in the repo had ever imported a `.tsx` file from another `.tsx` file before (`profiles/new.tsx`
  and `profiles/[id].tsx` importing `components/vehicle-profile-form.tsx` are the first). Every
  other tool (`tsc`, Jest, Metro) resolved it fine; only dependency-cruiser's own resolver needed
  telling. Fixed by adding `.tsx` to the list — a one-line fix, but the kind AGENTS.md's "fail
  closed" convention exists to surface rather than silently mis-resolve.

51 driver-app tests (up from 27 at M5.2 — `routing.test.ts`, `units.test.ts`,
`vehicle-profile-form.test.ts`, `error-messages.test.ts`, plus a fix to `identity.test.ts`'s own
mock `Response` shape, which the `http.ts` refactor's `headers.get()` call exposed as incomplete).
402 core, 56 driver-bff, 17 architecture, 33 contracts. `pnpm arch` clean (233 modules, 757
dependencies, now genuinely resolving every `.tsx`-to-`.tsx` import). `pnpm verify` clean end to
end across all six packages.

**Verified the same way as M5.1/M5.2, with the same disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` (1467 modules, up from M5.2's 1456 — confirming the new screens, components
and API code genuinely resolve and bundle) and `--platform ios` both produce a real Hermes bundle.
**Still not verified: an actual running app** — same hardware gap as M5.1/M5.2. The full create →
list → edit → delete flow has never been driven against a real running core + BFF with a real
signed-in driver; worth doing before trusting it beyond what the mocked-fetch unit tests cover.

## Decisions from M5.3

- **`ApiError` (renamed from `IdentityApiError`) and `requestJson`/`throwUnlessSuccess` are
  shared across every API module, not duplicated per module.** Recorded above — the error shape
  and HTTP plumbing are identical; only the schemas and endpoints differ.
- **`packages/architecture/dependency-cruiser.config.cjs` now resolves `.tsx`.** Recorded above —
  a real gap in shared tooling, not app-specific, so fixed at the source rather than worked around
  in `apps/driver-app` alone.

**M5.4 delivered:** the plan-route screen — a real MapLibre map, tap-to-drop origin/destination,
a vehicle-profile picker, and a genuine `POST /routing/route-plans` call through the BFF.

Two real gaps the design doc left open, asked before writing any code rather than guessed at
(matching M3.5's precedent for a genuine fork):

- **Tile provider: MapTiler**, chosen by the user over Stadia or self-hosting (design doc §6
  named both MapTiler and Stadia as candidates but never picked one). Needs a real account and
  API key — a one-time, interactive step only the user can do (this session can't create
  accounts). `EXPO_PUBLIC_MAPTILER_API_KEY` unset falls back to MapLibre's own free, keyless demo
  style (`src/lib/map-style.ts`) — the same "cold start needs no undocumented step" convention
  every other config value in this monorepo follows, so the screen renders a genuine map right
  now while a real key is pending, not a blank one.
- **Geocoding: deferred, not built.** The design doc's own screen table says "destination
  search," but never mentions geocoding at all — turning typed text into coordinates needs a
  provider (Nominatim, or bundled with MapTiler/Stadia's own API) that nobody had picked. Rather
  than add a new external dependency unilaterally, the user chose tap-to-drop on the map instead;
  text search is now an explicitly-scoped future task, not a silently-missing feature.

- **MapLibre's real v11 API, learned by reading its actual TypeScript source, not assumed from
  memory of the older Mapbox-lineage API** (`MapView`/`PointAnnotation`) this library forked
  from: the current package exports `Map`, `Camera`, `ViewAnnotation`, etc., as a rewritten,
  differently-shaped API (`onPress` gives `event.nativeEvent.lngLat: [lon, lat]`; markers are
  `<ViewAnnotation lngLat={...}>` wrapping a plain `View`, not a `PointAnnotation`). Confirmed
  against `node_modules/@maplibre/maplibre-react-native/src/**/*.tsx` directly before writing
  `src/components/route-map.tsx`, since guessing at a native library's prop names would only
  surface as a real crash on a device this session cannot test on.
- **`src/hooks/use-current-location.ts` is a TanStack Query hook, not a raw
  `useEffect`+`setState`** — found by actually running `pnpm lint`, not by design: a first draft
  using `useEffect(() => { request(); }, [request])` tripped `react-hooks/set-state-in-effect`
  (part of `eslint-config-expo`'s React Compiler rules) because the effect's call graph reached a
  `setState`, even after restructuring so the call happened only after an `await`. Rather than
  fight the linter, modelled it the same way every other network call in this app already is —
  `fetchCurrentLocation()` returns a `Result`-shaped value (`{ ok: true, point } | { ok: false,
reason }`), never throwing for an expected outcome like a permission denial (AGENTS.md rule 13,
  applied to a client-side "failure" for the first time in this app).
- **The plan-route screen absorbs none of M5.5's job.** A successful plan shows only
  distance/duration inline; the route line, hazards and avoided restrictions stay M5.5's "route
  overview" screen, matching M3.5's own restraint about not building a read nothing consumes yet.
- **A driver's own tapped origin permanently overrides the GPS default, never the other way
  round.** `effectiveOrigin = origin ?? location.point` — a location fix landing late (a real
  possibility; `getCurrentPositionAsync` can take a few seconds) must never silently replace a
  point the driver already chose by tapping the map.

**60 driver-app tests** (up from 51 at M5.3 — `map-style.test.ts`,
`use-current-location.test.ts`, plus `routing.test.ts` gaining `planRoute` coverage). 402 core, 56
driver-bff, 17 architecture, 33 contracts. `pnpm arch` clean (243 modules, 779 dependencies).
`pnpm verify` clean end to end across all six packages.

**Verified the same way as M5.1–M5.3, with a wider disclosed gap than usual**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` (1554 modules, up from M5.3's 1467 — and the asset list now includes
MapLibre's own marker icon, confirming the library's JS genuinely resolves and bundles) and
`--platform ios` both produce a real Hermes bundle. **Not verified: an actual map render.**
MapLibre needs its own native module compiled (`expo prebuild` / EAS Build), which — unlike every
prior M5 task's gap — this machine cannot do at all, Android SDK or not, since even a from-source
native build needs Xcode or Android Studio's NDK toolchain neither of which is installed. Treat
`src/components/route-map.tsx` as verified against MapLibre's real API surface by careful reading,
not by a real run, until it's opened on an actual device or simulator.

## Decisions from M5.4

- **MapTiler for map tiles; tap-to-drop instead of geocoded destination search.** Both recorded
  above — real product decisions the design doc left open, asked of the user rather than guessed.
- **`use-current-location.ts` uses TanStack Query, not a raw effect.** Recorded above — a real
  lint rule caught a real anti-pattern before it shipped, not a style preference.

**M5.5 delivered:** the route-overview screen — a real route line drawn on the map, distance/
time, avoided-restrictions/hazards sections, and a deliberately disabled "Start trip" button.

- **`src/lib/polyline.ts`**: a hand-rolled polyline6 decoder (AGENTS.md rule 6 — the same
  "small, well-understood things" reasoning as `sha256Hex` and the BFF's `core-client.ts`),
  pinned to precision 1e6 specifically because `GeoLine` was pinned to polyline6 back in M2.3
  (decision 52) and never needs to handle any other encoding. Tested with two hand-verified
  single-point fixtures (worked out by hand from the algorithm's own bit-packing, not copied
  from a library) plus a round-trip test through a locally-defined encoder for realistic
  multi-byte deltas — the encoder lives only in the test file, kept deliberately separate from
  the shipped decoder so a shared bug between the two couldn't hide behind the round trip alone.
- **`src/state/current-route-plan-store.ts`**: a single ephemeral "current plan" slot, not a
  list keyed by id. Confirmed by actually checking core's `routes.ts` (via a background
  research pass) that no `GET /routing/route-plans/:id` endpoint exists — `docs/progress.md`'s
  own M2.5/M2.6 notes already say this is deliberate ("no RoutePlan lifecycle in Phase 1"), so
  building a keyed cache for a resource with no way to re-fetch it would be speculative
  plumbing. `/plan-route` and `/route-overview` are still two separate screens/files (matching
  the design doc's own screen table), just sharing this one slot instead of passing the whole
  `RoutePlanDto` through Expo Router's string-only navigation params.
- **`components/route-map.tsx` gained an optional `routeLine` prop and an optional (not
  required) `onMapPress`** — the overview screen shows a fixed, already-planned route with no
  tap-to-edit, unlike the plan-route screen. Verified against MapLibre's real `GeoJSONSource`/
  `Layer` API the same way M5.4 verified `Map`/`Camera`/`ViewAnnotation`: read directly from the
  installed package's TypeScript source, not assumed.
- **"Start trip" is a real UI element, shown per the design doc's own screen table, but
  genuinely disabled — not wired to a route that doesn't exist.** A background research pass
  confirmed there is no `active_trips` table, no `ActiveTrip` domain type, and no trip-start
  endpoint anywhere in `apps/core`/`apps/driver-bff`/`packages/contracts` — active-trip tracking
  is explicitly M6 (Alerts) territory, and the driver-facing screen for it is M5.6, next. Rather
  than couple this commit's typecheck to a screen that doesn't exist yet (`router.push('/active-
trip')` would fail `tsc --noEmit` once Expo Router's typed routes are actually generated — see
  the verification note below), the button stays visibly present but disabled with a "coming
  soon" note, matching this codebase's own precedent (decision 68) for showing a real gap
  honestly rather than faking a working feature.
- **A real gap in this session's own prior verification claims, found while building this
  task**: M5.3's and M5.4's progress notes both said "confirmed by running `tsc --noEmit`" for
  Expo Router's typed routes, but `.expo/types/router.d.ts` — the file that actually makes typed
  routes real — is generated only by `expo start` (confirmed empirically: it does **not** appear
  after `expo export`, and even under `expo start` it took roughly 30 seconds of Metro startup
  before appearing, with no client ever connecting). Neither M5.3 nor M5.4 had a dangling route
  reference, so `tsc --noEmit` happened to pass either way — but the claim that typed routes
  were being genuinely checked was not verified at the time, only assumed. Confirmed for real
  this time: running `expo start` long enough to generate real types, then `tsc --noEmit`,
  genuinely caught the dangling `/active-trip` reference before it was fixed.

**67 driver-app tests** (up from 60 at M5.4 — `polyline.test.ts`,
`current-route-plan-store.test.ts`). 402 core, 56 driver-bff, 17 architecture, 33 contracts.
`pnpm arch` clean (248 modules, 790 dependencies). `pnpm verify` clean end to end across all six
packages.

**Verified the same way as M5.1–M5.4, plus a genuine typed-routes check this time**: `pnpm
--filter @wagonwise/driver-app run typecheck/lint/test` all pass, the latter run only after
actually generating `.expo/types/router.d.ts` (via a real `expo start`, left running long enough
to finish, then stopped) rather than trusting a stale or absent types file; `npx expo-doctor`
21/21; `npx expo export --platform android` and `--platform ios` both produce a real Hermes
bundle. **Not verified: an actual map render with a real route line drawn on it** — same
hardware gap as M5.4 (no native build toolchain on this machine at all, not just no Android SDK).

## Decisions from M5.5

- **The route-overview screen reads a route plan from a small client-side store, never
  re-fetches one.** Recorded above — core genuinely has no endpoint to re-fetch from, confirmed
  by checking, not assumed.
- **"Start trip" ships visible but disabled, not wired to a nonexistent screen.** Recorded above
  — keeps this commit's typecheck honest rather than deferring a broken reference to M5.6.
- **`docs/progress.md`'s own M5.3/M5.4 verification claims about typed routes were only
  half-true — corrected here, not silently left wrong.** Recorded above: the mechanism is real,
  but neither prior task had actually generated the types file it claimed to be checking against.

**M5.6 delivered:** the active-trip screen — and, since M5.5 confirmed no `ActiveTrip` backend
existed anywhere, the backend to go with it: core domain, a migration, two endpoints, a BFF
proxy, and the driver-app screen, mirroring how `RoutePlan` was built end to end.

- **`routing/domain/active-trip.ts`**: `ActiveTrip { id, routePlanId, driverId, startedAt,
lastPosition?, endedAt? }` — `driverId` duplicated off the `RoutePlan` it started from, same
  reasoning `RoutePlan` itself uses for duplicating `driverId` off `VehicleProfile` (decision 49):
  a direct ownership check with no join. `lastPosition` stays unset for the whole of this task —
  writing it for real needs a position-update endpoint only M6's reroute alerts actually need
  (design doc §6), so it isn't built until it has a real caller (same "don't wire an unused
  dependency" precedent as M2.3's `RoutingEngine`).
- **`application/`**: `startTrip` (looks up the driver's own `RoutePlan`, rejects a second
  concurrent trip via `TripAlreadyActive`) and `endTrip` (sets `endedAt`; ending an already-ended
  trip re-succeeds rather than erroring, same "sign-out never fails for tapping it twice"
  reasoning as identity's `revokeSession`, M1.5). New error tags `RoutePlanNotFound`,
  `ActiveTripNotFound`, `TripAlreadyActive` (409) added to routing's one `statusFor()` table.
  `ActiveTripRepository` port + in-memory fake, matching `RoutePlanRepository`'s shape.
- **No domain-event emission** (`TripStarted`/`TripEnded` from the design doc's own event list) —
  matches existing precedent: `RoutePlanned` isn't wired either, since nothing subscribes to
  either until M6 has a real handler. Not an oversight; the same "wire it when it has a caller"
  rule M2.3 and M5.5 both already apply.
- **`infrastructure/postgres-active-trip-repository.ts`** + **migration `0006_active_trips.sql`**:
  raw `sql` tagged templates (decision 26), same shape as `PostgresRoutePlanRepository`. The
  application layer's own `TripAlreadyActive` check is check-then-insert and therefore racy under
  two concurrent start requests — the same kind of gap M1.5's invite-code redemption race left
  open as a thrown exception (M1.5 deviations). Closed for real here instead, since it was nearly
  free: a partial unique index (`driver_id where ended_at is null`) makes a concurrent second
  insert violate a constraint and 500 rather than silently creating two active trips.
- **Two new routes**: `POST /routing/route-plans/:id/trip` (start, 201), `POST
/routing/trips/:id/end` (end, 200) — same `requireDriverId`/zod-param/`statusFor()` shape as
  every other routing route. Wired into `routing/api.ts`.
- **`packages/contracts/src/routing.ts`**: `activeTripSchema`, `routePlanIdParamsSchema`,
  `activeTripIdParamsSchema` — `lastPosition`/`endedAt` both `.optional()`, matching the domain.
- **`apps/driver-bff/src/routing-routes.ts`**: two proxy routes, same forward-and-relay shape as
  every other routing route (AGENTS.md rule 10 — no body to validate, since both take their id
  from the URL and their driver from the token).
- **driver-app**: `api/routing.ts` gained `startTrip`/`endTrip`; `api/use-active-trip.ts` wraps
  them as TanStack mutations (actions, not fetches — same reasoning as `useCreateRoutePlan`,
  M5.4). `state/current-active-trip-store.ts` is an ephemeral single-trip slot, the same shape and
  the same reason as `current-route-plan-store.ts` (M5.5): core has no `GET
/routing/trips/:id` to re-fetch from, and M5.6 deliberately doesn't add one (see deviations,
  below). `hooks/use-live-location.ts` wraps `expo-location`'s `watchPositionAsync` for the
  screen's live-following map — a continuous subscription, unlike `useCurrentLocation`'s one-shot
  `queryFn` (M5.4), so it stays a plain `useEffect` rather than forcing TanStack Query's
  one-shot-fetch shape onto an open-ended stream; the async, testable half is split out as
  `startWatchingPosition`, same split `fetchCurrentLocation` used. `components/route-map.tsx`
  gained an optional `currentPosition` prop (a distinct "you are here" marker and a closer
  street-level follow zoom, since a driver's live position drifts off the planned origin the
  moment a trip starts) — `route-overview`/`plan-route` are unaffected, since neither passes it.
  `route-overview.tsx`'s "Start trip" button goes live (was shipped visibly disabled in M5.5,
  decision recorded there) and now stores the started trip and navigates to the new
  `app/active-trip.tsx` screen: live-following map, an upcoming-hazards list reusing the
  already-planned route's `hazardsOnRoute` (no new hazards fetch — M5.7/M5.8 territory), a real
  "End trip" button, and a disabled "Report hazard" mic button shown per the design doc's own
  screen table but honestly disabled (M7 territory), matching the same shipped-but-disabled
  pattern M5.5 used for "Start trip" itself. New `lib/error-messages.ts` entries for the three new
  error tags.

37 contracts tests (up from 33), 423 core tests (370 passing — see verification note below), 62
driver-bff tests (up from 56), 77 driver-app tests (up from 67), 17 architecture tests. `pnpm arch`
clean (263 modules, up from 248; 871 dependencies, up from 790). `pnpm lint`/`typecheck`/
`format:check` all clean across every package.

**Verified by actually running it, with one real gap this time — Docker Desktop's daemon isn't
reachable on this machine in this session** (`docker info` connects as a client but the server
section fails: "failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
... The system cannot find the file specified"; no `Docker Desktop.exe` found at the usual
install path either). This is a session/environment gap, not a code problem — every other
Testcontainers-backed Postgres suite in this repo (identity, hazards, routing's other two
repositories) fails identically and for the same reason, not just the new
`postgres-active-trip-repository.test.ts`. So: the full non-Docker surface was verified for
real — `pnpm typecheck`/`lint`/`format:check`/`arch` clean across every package, all 370 passing
core tests (46 of 53 test files; the 7 failing files are exactly the seven Postgres-backed
repository suites, identical failure for all of them), all 62 driver-bff tests (route proxying
verified against a fake `CoreClient`, including a 409 relay), all 77 driver-app tests,
and a real `expo start` run confirmed `.expo/types/router.d.ts` now includes `/active-trip`
before `tsc --noEmit` was trusted (same discipline M5.5 established). **Not verified**: the new
`PostgresActiveTripRepository` and the partial unique index against a real Postgres — it's
written to the same pattern `PostgresRoutePlanRepository` already proved works, and a real test
for it exists and passes typecheck/lint, but it has never actually run. Also not verified, same
hardware gap as every driver-app milestone since M5.1: an actual running app (map render, GPS
watch, or the two new screens on a device/simulator).

## Decisions from M5.6

53. **`ActiveTrip` duplicates `driverId` off the `RoutePlan` it started from**, extending decision
    49's reasoning (`RoutePlan` duplicating `driverId` off `VehicleProfile`) one level further —
    every ownership check in `routing` now follows the same no-join pattern.
54. **One active trip per driver at a time, enforced twice**: `startTrip`'s own
    `findActiveForDriver` check (clear error, `TripAlreadyActive`), backed by a database-level
    partial unique index for the race the application check alone can't close. Chosen over
    leaving the race open the way M1.5's invite-code redemption race was left open, because a
    partial unique index here was nearly free — no new table, no new column, just a `where`
    clause on the index this table needed anyway.
55. **No `GET /routing/trips/:id` (or `/trips/active`) endpoint — a driver relaunching mid-trip
    loses the app's own record of it.** Deliberately scoped down the same way M5.5 scoped down
    the "no `RoutePlan` re-fetch" gap: core has nowhere near enough of a trip-history feature to
    justify one yet, and the ephemeral client-side store this task adds is the same shape M5.5
    already established. If testers actually hit this (backgrounding the app mid-trip on real
    Android/iOS, not just this machine's hardware gap), it's the first thing to add.
56. **No `TripStarted`/`TripEnded` domain events wired**, despite the design doc listing both —
    matches `RoutePlanned`'s own precedent (unwired since M2.5): an event with no subscriber is
    untested plumbing, and M6 is what gives either event a real handler.

## Deviations and open items from M5.6

- **`PostgresActiveTripRepository` and the migration's partial unique index are unverified against
  a real Postgres** — Docker Desktop's daemon isn't reachable on this machine this session (see
  the verification note above). Every other Postgres-backed repository in this repo is equally
  unverified in this same session, for the same reason — not a gap specific to this task. Revisit
  the next time Docker is available; nothing here is expected to fail, but "expected to work" and
  "verified" are different claims, and M1.4/M1.5's own standard is not to blur them.
- **No position-update endpoint.** `lastPosition` exists on the domain and in the schema but is
  never written — the live GPS point only ever exists client-side (the active-trip screen's map),
  never reaches core. Needed before M6's reroute alerts can use a driver's last known position.
- **No background location.** `useLiveLocation` only tracks while the app is foregrounded and the
  screen is mounted — correct for "map following position" but not enough for M6's reroute alerts,
  which need a position even while the driver isn't looking at the phone.
- **The mic button and reroute prompts are placeholders, per this task's own scope note** (M6/M7),
  matching M5.5's "Start trip" precedent for a shipped-but-honestly-disabled feature.

**Follow-up, same day — Docker verification gap closed, two real bugs found and fixed.** Docker
Desktop became reachable on this machine shortly after M5.6 merged. Re-running the full core
suite against real Postgres found two genuine, pre-existing test failures the Docker-less run
never got a chance to catch — not flaky, not environment noise:

- `src/platform/migrations/run-migrations.test.ts` hardcoded the exact list of migration files
  (`result.applied`, `public.schema_migrations` rows) and the `routing` schema's exact table list.
  Both assertions predate M5.6 and were always going to break the moment a sixth migration file
  landed — they just had no chance to run and say so until Docker came back. Fixed by adding
  `'0006_active_trips.sql'` and `'active_trips'` to the expected lists.
- With that fixed, all 53 core test files / 423 tests pass for real, including
  `postgres-active-trip-repository.test.ts` (the repository this milestone added) and the
  migration's partial unique index (decision 54) — both genuinely exercised against a real
  Postgres container for the first time, not just typechecked. This resolves the "unverified
  against a real Postgres" deviation above; it was accurate when written, not overtaken by a
  silent rewrite.

**Decision 57.** Hardcoding a migration runner test's exact file/table list is a real, if minor,
maintenance cost every future migration pays — worth knowing about, not necessarily worth fixing
now (asserting "the last file is `N` and everything before it still applies" would be more
robust, but that's a test-design change with no user-facing effect and no milestone currently
needs it).

**M5.7 delivered:** report hazard (tap) + hazard detail — the write side (report/confirm/dismiss)
already existed from M3/M4; this closed a real gap M3/M4 left (no way to _read_ a hazard back)
and built the two driver-app screens on top.

- **Gap found and closed: `GET /hazards/reports/:id`.** `HazardRepository.findById` existed in
  the port since M3, but nothing in `interface/routes.ts` ever exposed it over HTTP — confirmed
  by checking, not assumed, the same way M5.5 confirmed no `RoutePlan` re-fetch endpoint and M5.6
  confirmed no `ActiveTrip` backend at all. New `getHazard` use case (mirrors `getVehicleProfile`,
  no ownership check per decision 63), proxied through the BFF, same shape as confirm/dismiss.
  Deliberately skips `requireDriverId` in the handler, matching confirm/dismiss's own established
  local pattern (decision 63 — a hazard report is community data with no per-driver
  authorization) rather than introducing a third auth-check shape in this one route.
- **`lib/hazard-labels.ts`**: plain-word labels for all eight `HazardType`s (AGENTS.md: "Low
  bridge", "Too heavy for this road" — not "restriction" or "prohibition") and the
  type→measurement-kind mapping (only `low_bridge`/`weight_limit`/`width_restriction` have
  anything to measure).
- **`lib/hazard-report-form.ts`**: pure parse/validate, same split as `vehicle-profile-form.ts` —
  mirrors core's own `validateMeasurement` so a driver sees the same "must be a positive number"
  rule before a network round trip.
- **`app/report-hazard.tsx`**: tap-to-drop on the map (reusing `RouteMap`'s existing
  `onMapPress`/`currentPosition`), an eight-item type grid (no dropdown — nothing to scroll or
  type while parked, per the design doc's tap-report principle), an optional measurement field
  that only appears for a measured type, an optional note, and a real submit. `expo-crypto`
  (`Crypto.randomUUID()`) added as a dependency for the client-generated idempotency id
  `reportHazard` has always expected (design doc §5 step 2) — branded via
  `hazardReportIdSchema.parse()` at the point of generation, the same brand-at-the-boundary
  pattern `routing.test.ts` already used for test fixtures, now used for real in shipped code.
- **`app/hazards/[id].tsx`**: the detail screen — type, measurement (height shown with
  feet/inches via the existing `formatHeightWithFeetInches`, AGENTS.md), note, when reported,
  confirmation/dismissal counts, and real "Still there" / "Not there" buttons wired to the
  existing confirm/dismiss endpoints.
- **`api/hazards.ts` + `api/use-hazards.ts`**: `reportHazard`/`getHazard`/`confirmHazard`/
  `dismissHazard` API calls and their TanStack hooks — `useReportHazard` a mutation (an action,
  same reasoning as `useCreateRoutePlan`/`useStartTrip`), `useHazard` a query, confirm/dismiss
  mutations invalidate that query's cache key on success so the detail screen reflects its own
  action immediately.
- **New `home.tsx` entry point**: "Report hazard", the tap-report screen's reachable-for-real
  starting point (parked use, per the design doc). Reporting navigates straight to the new
  hazard's own detail screen on success, closing report → detail into one flow.
- **`lib/error-messages.ts`** gained `hazardsErrorMessage` (a second per-module map, alongside
  `routingErrorMessage` — same established pattern, not a shared one, since the tag namespaces
  are module-specific even though `ApiError` itself is shared).

98 driver-app tests (up from 77 — `hazards.test.ts`, `hazard-labels.test.ts`,
`hazard-report-form.test.ts`, `format-date.test.ts`), 428 core tests (up from 423 —
`get-hazard.test.ts` plus new `routes.test.ts` cases), 66 driver-bff tests (up from 62). `pnpm
arch` clean (277 modules, up from 263; 908 dependencies, up from 871). `pnpm lint`/`typecheck`/
`format:check` all clean across every package.

**Verified by actually running it, Docker still up from the M5.6 follow-up** so this is a genuine
run, not a disclosed gap this time: all 428 core tests (including the new `getHazard` route
against a real Postgres-backed `routes.test.ts` harness — the harness itself is in-memory, per
existing convention, but the suite runs in the same process alongside the real Postgres
integration suites that did run for real), all 66 driver-bff tests, all 98 driver-app tests;
`npx expo-doctor` 21/21; a real `expo start` run confirmed `.expo/types/router.d.ts` includes both
`/report-hazard` and `/hazards/[id]` before `tsc --noEmit` was trusted; `npx expo export
--platform android` produced a real Hermes bundle (1576 modules, up from M5.6's 1554). **Not
verified**: an actual running app — same hardware gap as every driver-app milestone since M5.1
(no native build toolchain, no Android SDK, no macOS on this machine).

## Decisions from M5.7

58. **Hazard detail is reachable in this app only by just having reported a hazard — not by
    tapping an existing hazard pin on a map.** There's no hazards-on-map display anywhere in the
    app yet (route-overview/active-trip both still just list `hazardsOnRoute` as opaque text, per
    M5.5/M5.6), and building one was never this task's scope (the design doc's own screen table
    lists "Report hazard (tap)" and "Hazard detail" as two screens, not "browse hazards on a
    map"). Recorded as a deliberate scope-down, not a silently narrower feature.
59. **`GET /hazards/reports/:id` has no ownership check**, extending decision 63's reasoning
    (confirm/dismiss have none either) to the read side: a hazard report is community data any
    authenticated driver can see, not scoped to its reporter.

## Deviations and open items from M5.7

- **No hazards-on-map display.** Neither `route-overview` nor `active-trip` shows hazard pins —
  they still only list `hazardsOnRoute`'s opaque ids as plain text (M5.5/M5.6, and that field is
  itself always empty per M2.5's own deviations). A future task wiring a real map display would
  also be what makes hazard detail reachable by tapping a pin, closing decision 58's gap.
- **No offline queue** — M5.8's job. Reporting with no connectivity currently just fails with the
  generic "couldn't reach the server" message; the client-generated idempotency id already in
  place (this task) is exactly what M5.8's retry-safe queue needs, so nothing here has to change
  to add it.
- **No voice reporting** — M7's job, per the design doc's own hands-free principle. This screen is
  deliberately the tap-only, parked-use half.

**M5.8 delivered:** the offline hazard queue — `expo-sqlite`, per the design doc's own choice
(§8), added as a real dependency (`app.config.ts`'s `plugins` gained `expo-sqlite`, matching how
`expo-location`/`expo-crypto` were each added on the milestone that first needed them).

- **`lib/hazard-queue-flush.ts`**: the one piece of actual policy — `flushQueuedReports(queued,
submit)`, a pure function with no SQLite and no `fetch` (`submit` is injected, same split
  `parseHazardReportForm`/`startWatchingPosition` already use). Sends queued reports in order,
  stopping at the first failure rather than trying every item: a failure here almost always means
  "no connectivity," so trying the rest would only waste time for the same result. Fully unit
  tested with fakes — no native module, no mocking needed.
- **`db/hazard-queue.ts`**: the thin, deliberately dumb SQLite CRUD layer — `enqueueHazardReport`/
  `listQueuedHazardReports`/`removeQueuedHazardReport` against one `hazard_queue` table. Verified
  against `expo-sqlite`'s real installed type declarations (`openDatabaseSync`/`execSync`/
  `runAsync`/`getAllAsync`), the same discipline M5.4/M5.5 used for MapLibre — and, unlike
  MapLibre, tested for real too: `jest.mock('expo-sqlite', ...)` stands in a small in-memory fake
  keyed off the actual SQL text this module sends, exercising this module's own SQL and
  `reportHazardRequestSchema`-based re-branding logic without a real native database.
- **`hooks/use-hazard-queue-flush.ts`**: wires the two together, opportunistically — on mount and
  whenever the app returns to the foreground, same shape as `useOpportunisticRefresh` (M5.2) and
  for the same reason (a scheduled/one-shot trigger can be missed while the app is suspended). No
  NetInfo/network-listener dependency added — a failed attempt is cheap, and the next foreground/
  mount tries again, so polling-by-opportunity is enough for Phase 1. Wired into `_layout.tsx`
  alongside the token-refresh hook.
- **`report-hazard.tsx` reworked**: a report is written to the local queue _before_ the network
  is ever touched (design doc §5's "stores it locally first"), then a send is attempted
  immediately — succeed, and the flow is unchanged from M5.7 (remove from the queue, navigate to
  the new hazard's detail screen); fail, and the report stays queued (no error shown — a new
  "Saved" screen explains it'll go out automatically once back online) rather than making a
  driver retry by hand. The M5.7 mutation is reused for the immediate-attempt path; the queue
  itself is what makes a dropped connection non-fatal.

106 driver-app tests (up from 98 — `hazard-queue-flush.test.ts`, `hazard-queue.test.ts`). `pnpm
arch` clean (283 modules, up from 277; 918 dependencies, up from 908). `pnpm lint`/`typecheck`/
`format:check` all clean across every package. Core/BFF untouched this task — no new test counts
there.

**Verified by actually running it**: all 106 driver-app tests (including the queue's SQL logic
against a mocked `expo-sqlite`, not left untested the way MapLibre/watchPositionAsync's native
calls are); `npx expo-doctor` 21/21; `npx expo export --platform android` produced a real Hermes
bundle (1606 modules, up from M5.7's 1576). **Not verified**: an actual running app — same
hardware gap as every driver-app milestone since M5.1 (no native build toolchain, no Android SDK,
no macOS on this machine) — so the real SQLite file I/O, the AppState foreground listener, and
the actual offline→online transition have never been exercised on a real device.

Also fixed, found while updating this milestone's docs: **`README.md`'s driver-app section had
gone stale** — M5.6 and M5.7 never got README entries (only `docs/progress.md` did), so it still
said "Start trip" pointed nowhere and the repo-layout table still said "M5.1 skeleton only." Not
this task's own scope, but left broken would have kept misinforming a cold start, which AGENTS.md
treats as the one thing this file must never do — fixed alongside M5.8's own entry rather than
carried forward again.

## Decisions from M5.8

60. **A failed flush attempt stops the whole pass rather than skipping to the next queued
    item.** Extends decision 54's precedent for scoped-down-but-honest tradeoffs: the common
    failure mode (no connectivity) would fail every remaining item identically, so trying them
    anyway just spends battery and time for the same outcome. The cost: a queued item that fails
    for a genuinely permanent reason (not connectivity) would block every report _behind_ it too,
    not just itself — accepted because the one rule that could cause a permanent failure
    (`validateMeasurement`) is already enforced client-side before anything is ever queued, so
    this case is expected to be unreachable, not unhandled by design (same reasoning class as
    M1.5's invite-code race).
61. **No network-state listener (e.g. NetInfo) — opportunistic triggers only (mount +
    foreground).** Matches `useOpportunisticRefresh`'s own precedent and avoids a new dependency
    for a Phase 1 testers-count scale where "try again next time the app is opened" is good
    enough.

## Deviations and open items from M5.8

- **A permanently-failing queued report blocks everything behind it**, per decision 60 — no
  adjudication UI exists to inspect, retry individually, or drop a stuck queue entry. Revisit if
  testers ever hit this for real (expected not to, since the one known cause is already
  client-side validated before queuing).
- **Real SQLite persistence across an app relaunch is unverified** — same hardware gap as the rest
  of this milestone. The schema and CRUD are verified against `expo-sqlite`'s real API surface and
  tested against a faithful in-memory stand-in, not against the real native module.
- **No cached-hazards-for-offline-display feature**, despite the design doc's §8 SQLite line
  mentioning "the offline hazard queue and cached hazards" together — the M5 task breakdown names
  only "Offline hazard queue" for M5.8, and there's still no hazards-on-map display anywhere in
  the app to cache data for (M5.7 decision 58's own gap, still open).

**M5.9 delivered:** the feedback screen — and, since `feedback` was the last of the four bounded
contexts named in AGENTS.md rule 6 with genuinely nothing built (confirmed by checking, same as
every other "doesn't exist yet" gap this session found: M5.6's `ActiveTrip`, M5.7's hazard GET),
the whole module to go with it: domain, one use case, a migration, one endpoint, a BFF proxy, and
the driver-app screen.

- **`modules/feedback/`**: the smallest module in the repo — `FeedbackNote { id, driverId,
message, appVersion, deviceInfo, createdAt }`, `validateMessage` (non-blank, mirrors routing's
  `validateName`), one `submitFeedback` use case, a `FeedbackNoteRepository` port with a single
  `save` method (insert-only, no `findById` — there is no read use case at all: design doc §8's
  "free-text notes to you" is one-way, read later via `psql`, not back through the app).
  `appVersion`/`deviceInfo` are trusted and stored as given, the same way a hazard report's `note`
  field is — diagnostic context for whoever reads feedback, not data the domain acts on.
- **Migration `0007_feedback.sql`**: `feedback.notes`, in the `feedback` schema `0001_init.sql`
  already created back in M1.4 (a schema with no tables in it until now).
- **`POST /feedback/notes`** (201) — same `requireDriverId`/zod-body/`statusFor()` shape as every
  other module's routes. `/feedback/` added to `DRIVER_AUTH_PREFIXES`
  (`host/build-app.ts`) — found and fixed the one test that specifically asserted `/feedback/`
  was _not_ yet gated (`build-app.test.ts`, written in M4.2/M4.3 as "a future module"); now it's
  parameterized across all three real prefixes, with a genuinely different placeholder
  (`/admin/`) standing in for "some module that still doesn't exist."
- **`packages/contracts/src/feedback.ts`**: `submitFeedbackRequestSchema` (no `driverId` field,
  same reasoning as every other create-request schema), `feedbackNoteSchema`. New `./feedback`
  subpath export added to `package.json`, matching `./routing`/`./hazards`.
- **`apps/driver-bff/src/feedback-routes.ts`**: one proxy route, same forward-and-relay shape as
  every other module's BFF routes.
- **driver-app**: `api/feedback.ts` + `api/use-feedback.ts` (a mutation, same reasoning as every
  other create-style call). `lib/app-info.ts` reads the app version back out of
  `Constants.expoConfig.version` (`expo-constants`, already an existing dependency — no new one
  needed) and device info from React Native's own built-in `Platform.OS`/`Platform.Version` (no
  `expo-device` dependency added either — a plain `"ios 17.2"`-style string is enough for this
  screen's job). New `app/feedback.tsx`: a free-text note, "Send," and a "Thanks" confirmation —
  reachable from a new `home.tsx` entry point.

70 driver-bff tests (up from 66), 114 driver-app tests (up from 106 — `feedback.test.ts`,
`app-info.test.ts`), 437 core tests (up from 428 — the new module's own tests plus two
`run-migrations.test.ts` fixes, see below), 41 contracts tests (up from 37). `pnpm arch` clean
(306 modules, up from 283; 997 dependencies, up from 918). `pnpm lint`/`typecheck`/`format:check`
all clean across every package.

**Also fixed, found the same way M5.6's follow-up found it**: `run-migrations.test.ts` hardcoded
the exact migration-file list and the `routing` schema's table list (decision 57's own prediction
from the M5.6 follow-up — "a real, if minor, maintenance cost every future migration pays").
Fixed the same way as that follow-up: added `'0007_feedback.sql'` to both hardcoded lists, and
added the `feedback` schema's own table assertion (`['notes']`), which didn't exist yet for any
prior module's first migration into a fresh schema.

**Verified by actually running it, all for real this time — Docker was already up from the M5.6
follow-up**: all 437 core tests (including the new `postgres-feedback-note-repository.test.ts`
against a real Postgres container — inserted a real row, read it back with a raw `pool.query`,
since there's no repository-level `findById` to round-trip through), all 70 driver-bff tests, all
114 driver-app tests; `npx expo-doctor` 21/21; a real `expo start` run confirmed
`.expo/types/router.d.ts` includes `/feedback` before `tsc --noEmit` was trusted; `npx expo export
--platform android` produced a real Hermes bundle (1611 modules, up from M5.8's 1606). Also
refreshed several more stale spots in `README.md` beyond the driver-app section M5.8 already
fixed — the repo-layout table's `modules/` line still said "routing, hazards, feedback not
started" (wrong since M2/M3), and the driver-bff status line was missing `feedback`. **Not
verified**: an actual running app — same hardware gap as every driver-app milestone since M5.1.

## Decisions from M5.9

62. **`FeedbackNoteRepository` has only `save` — no `findById`, no list.** Matches the module's
    own scope exactly: design doc §8 describes a one-way channel to the developer, and every
    other module in this codebase only grows a read method once a real caller needs one (M2.3's
    `RoutingEngine`, M5.7's `getHazard`). Revisit if an admin/staff view of feedback is ever
    built — explicitly out of scope for Phase 1 (AGENTS.md: staff portal is Phase 2).
63. **`appVersion`/`deviceInfo` are untyped, unvalidated strings the app builds itself** — no
    shared "device info" contract, no enum of known OS names. They're diagnostic context for a
    human reader, not data the domain branches on, so structuring them further would be ceremony
    with no behaviour behind it (same reasoning as a hazard report's free-text `note`).
64. **Device info comes from React Native's built-in `Platform` module, not a new `expo-device`
    dependency.** `Platform.OS`/`Platform.Version` already ship with every RN app and are enough
    for "which OS and roughly which version filed this" — the extra precision `expo-device` adds
    (exact model name, product name) has no reader who needs it yet.

## Deviations and open items from M5.9

- **No admin/read UI for feedback notes** — deliberately out of scope (decision 62); read via
  `psql` for now, matching M1.5's identical deviation for invite codes before any admin tooling
  existed.
- **Real device info strings are unverified** — `Platform.OS`/`Platform.Version`'s exact output on
  a real device (e.g. whether Android's `Platform.Version` is the API level or a version string)
  is documented behaviour, not independently confirmed against real hardware, same hardware gap
  as the rest of this milestone.
- That closes M5.1–M5.9. **M5.10** (real-device/simulator verification, EAS Build → TestFlight +
  Play internal) is the only M5 task left, and it is explicitly the one task in this milestone
  that cannot be done from this machine — it needs a real Expo account, a real device or
  simulator, and (for the store submissions) Apple/Google developer accounts the user must set up
  themselves. **Deliberately deferred by the user (2026-09-23), not forgotten** — skipped ahead
  to M6 instead, with an explicit ask to come back to M5.10 later.

## M6 task breakdown

| #    | Task                                                                      | Status            |
| ---- | ------------------------------------------------------------------------- | ----------------- |
| M6.1 | Outbox event infrastructure (dispatcher, no real emitter yet)             | Done — 2026-09-23 |
| M6.2 | Identity: device push tokens                                              | Done — 2026-09-23 |
| M6.3 | Hazards publishes `HazardReported`/`HazardConfirmed`                      | Done — 2026-09-23 |
| M6.4 | Routing: reroute detection (on-hazard-event subscriber)                   | Done — 2026-09-24 |
| M6.5 | Push notifications (`PushNotifier` port + Expo adapter)                   | Done — 2026-09-24 |
| M6.6 | Driver app: register push token, receive notification, reroute prompt     | Done — 2026-09-24 |
| M6.7 | End-to-end verification (idempotency, rate limits, don't-notify-reporter) | Done — 2026-09-24 |

Broken out this way (mirroring M1–M5's own per-milestone task tables, this milestone's first)
because M6 is the first task since M1 that needed genuinely new cross-cutting infrastructure
before any product behaviour — decided with the user rather than assumed, 2026-09-23.

**M6.1 delivered:** the transactional-outbox event dispatcher decision 5 (M1) committed to
before any module had an event to publish — genuinely working, tested infrastructure with no
real caller yet, same "don't wire an unused dependency" precedent M2.3's `RoutingEngine` and
M5.5's disabled "Start trip" both already set.

- **`shared/domain-event.ts`**: `DomainEvent<Payload>` — plain data (`eventId`, `aggregateType`,
  `aggregateId`, `eventType`, `payload`), matching every aggregate's own no-class style. Lives in
  `shared/` since any module can construct one, once it has something to publish.
- **A real mistake caught before it shipped, not after**: the first draft also added a
  `shared/outbox.ts` helper (`appendOutboxEvents(db, events)`) for a module's repository to call
  when writing an event alongside its aggregate row. `pnpm arch` would have failed it —
  `shared/` has the _same_ npm-purity rule `domain/` does (confirmed via
  `packages/architecture`'s own `shared-imports-npm` violation fixture, which exists specifically
  to catch this), and the helper needed to import `kysely`. Removed before ever running the
  check for real; **decision 65** (below) records the corrected design.
- **`platform/outbox-dispatcher.ts`**: `OutboxDispatcher` — claims a batch of pending events
  (`processed_at is null`, oldest first, `for update skip locked`, released once the claiming
  transaction commits rather than held across handler execution — see decision 66), runs every
  handler whose `eventType` matches, records success per `(event_id, handler_name)` in
  `outbox.handled`, and marks an event `processed_at` once every matching handler has either
  succeeded or already been recorded, or once `attempts` (bumped on claim, not completion —
  decision 67) reaches 5 (dead-letter). `drainOnce()` for tests, `start(intervalMs)`/`stop()` for
  production, matching decision 5's own naming.
- **Wired into `composeCore`**: builds an `OutboxDispatcher` against `platformDb` with
  `overrides.eventHandlers ?? []` (empty for now), starts it at `config.outboxPollIntervalMs`
  (new `OUTBOX_POLL_INTERVAL_MS`, default 2000ms), stops it in `close()`.
- **`config.ts`**: `OUTBOX_POLL_INTERVAL_MS`, coerced, minimum 100ms, default 2000ms. Added to
  `turbo.json`'s `passThroughEnv` and `apps/core/.env.example`, per the cold-start rule.

6 new dispatcher tests (real Postgres — claims/runs/idempotency/dead-letter/ordering/interval
polling, all first-try passes) plus 3 new config tests. 446 core tests (up from 437). `pnpm arch`
clean (309 modules, up from 306; 1011 dependencies, up from 997). `pnpm lint`/`typecheck`/
`format:check` all clean across every package.

**Verified by actually running it, all for real — Docker was already up**: all 446 core tests,
including `outbox-dispatcher.test.ts`'s six scenarios against a real Postgres container (not an
in-memory fake — the SQL itself, `for update skip locked` included, is what's being proven).
`compose-core.test.ts`'s existing two tests still pass with a real dispatcher now starting and
stopping alongside the app on every test run, confirming the wiring doesn't break anything even
though nothing calls it yet.

## Decisions from M6.1

65. **No shared outbox-writing helper — each module's repository writes its own `insert into
outbox.events` inline, once it has a real event to write (M6.3+).** `shared/` cannot import
    `kysely` (confirmed via the architecture ruleset's own `shared-imports-npm` violation
    fixture, which exists specifically to catch this) and modules cannot import `platform/`, so
    there is no legal home for a _shared_ writer — every module already duplicates this class of
    tiny SQL-adjacent infra (`UntypedDb`, `apply-schema.ts`, `db-for-tests.ts`), and an outbox
    insert is a two-line addition to that existing pattern, not a new abstraction.
66. **`OutboxDispatcher` does not hold a database transaction open across handler execution.**
    `for update skip locked` claims a batch inside a short transaction that commits immediately
    (bumping `attempts` as part of that same claim); handlers then run outside any open
    transaction. Chosen over holding the claim transaction open for the whole pass: a future
    handler may make an external HTTP call (M6.5's push notification), and holding a pooled DB
    connection open for the duration of an arbitrary network call is worse than the alternative.
    Correctness doesn't depend on the lock being held throughout anyway — `outbox.handled`'s own
    uniqueness is what actually stops a handler running twice (rule 9), matching decision 54's
    identical reasoning for `ActiveTrip`'s race.
67. **`attempts` is bumped when an event is claimed, not when processing finishes.** A process
    crash mid-handler must still count as an attempt, or a handler that reliably crashes the
    whole process (not just throws) would retry forever instead of eventually dead-lettering.
68. **A dead-lettered event is `processed_at`-set with no separate "dead" column.** The schema
    (`migrations/0001_init.sql`, written back in M1.4 before any dispatcher existed to need one)
    only has `processed_at`/`attempts` — adding a new column for this would mean revising a
    migration that's already shipped and been applied in every environment. `processed_at` set
    with fewer `outbox.handled` rows than matching handlers is how "dead-lettered, not
    successfully processed" is distinguished after the fact, if that's ever needed (nothing reads
    it that way yet).
69. **An event with no registered handler is marked processed immediately, on its first claim.**
    There's nothing to wait for — vacuously, every (zero) matching handler has "succeeded." The
    real consequence: an event published before its first handler exists will never reach that
    handler once it's added later, since composeCore registers the full handler set at boot and
    an already-processed event is never reclaimed. Acceptable for Phase 1 (a handler and its
    event type are always added in the same deploy, per this milestone's own task breakdown), but
    worth remembering if that ever stops being true.

## Deviations and open items from M6.1

- **`attempts` is one counter per event row, not per handler** (the schema's own shape — see
  decision 68) — if an event ever has two handlers and one dead-letters while the other keeps
  succeeding-on-retry, both share the same attempt budget. Not reachable yet (no event has more
  than zero handlers), so untested against a real multi-handler dead-letter scenario.
- **No real emitter or handler yet** — `composeCore`'s `eventHandlers` override is `[]` in
  production. M6.2–M6.4 give this dispatcher its first real work.
- **No visibility into a dead-lettered event beyond querying Postgres directly** — no log line,
  no metric, no admin view. Fine at Phase 1's scale (a human can `psql` in), revisit if that
  becomes the actual way an incident gets noticed.

**M6.2 delivered:** identity's `Device` aggregate — the third and last "genuinely nothing built
yet" gap this session found in a named-but-unbuilt design-doc aggregate (after M5.6's
`ActiveTrip` and M5.9's `feedback` module), closing it the same way: domain, one use case, a
migration, one endpoint, a BFF proxy — plus the read-model facade method design doc §6 asks for,
built now but left uncalled until M6.4.

- **`domain/device.ts`**: `Device { id, driverId, pushToken, createdAt, updatedAt }`, keyed by
  `pushToken` rather than one-row-per-driver — a device's Expo push token is already a stable
  per-install identifier, so re-registering an unchanged token or reassigning one to a different
  driver (same physical device, a new sign-in) are both just an upsert, never a duplicate row.
  `validatePushToken` mirrors every other free-text-identifier validator in this codebase
  (routing's `validateName`, feedback's `validateMessage`).
- **`application/register-device.ts`**: looks up any existing row by `pushToken` first — if
  found, reassigns `driverId` and bumps `updatedAt` (keeping the same id); if not, creates one.
  A driver signing out and a different driver signing in on the same phone must never leave the
  old driver receiving the new one's alerts, which a naive one-row-per-driver design would risk
  if the app just re-registered without ever clearing the old row.
- **Migration `0008_identity_devices.sql`**: `identity.devices`, `push_token` unique (the upsert
  target), `driver_id` a real foreign key to `identity.drivers` (matching `sessions`' own FK).
- **`POST /identity/devices`** (201) — the first identity route to read `request.driverId` at
  all; every other identity route either predates a token existing (OTP/refresh/JWKS) or derives
  its subject a different way (`sessions/:id/revoke`'s URL param). Needed a new, narrower driver-
  auth prefix: `/identity/devices/`, not all of `/identity/` (decision 70, below) — added to
  `host/build-app.ts`'s `DRIVER_AUTH_PREFIXES` and to `build-app.test.ts`'s own parameterized
  gate tests, plus a new test proving identity's pre-token routes are still _not_ gated (a
  regression that widening the prefix carelessly would cause silently).
- **`identity/api.ts` facade**: gained `getPushTokensForDriver(driverId): Promise<string[]>` —
  the read-model port design doc §6 names ("device tokens come from a read-model port onto
  Identity"). Built now, alongside the aggregate it reads, rather than waiting for M6.4's
  consumer — the _producer_ half of a read-model port is reasonably part of "device push tokens"
  shipping as a complete capability, even though the _consumer_ (routing's reroute adapter,
  translating this into routing's own types per rule 7) is genuinely M6.4's job, not this one's.
- **`packages/contracts/src/identity.ts`**: `registerDeviceRequestSchema` (no `driverId` field,
  matching every other create-request schema), `deviceSchema`.
- **`apps/driver-bff/src/identity-routes.ts`**: one proxy route, reusing the shared
  `authenticateOrReject` helper (`routing-routes.ts`/`hazards-routes.ts`/`feedback-routes.ts`
  already use it) rather than the file's own inline bearer-parsing — that inline copy exists
  specifically for `sessions/:id/revoke`'s extra job of checking the token's claims against the
  URL, which this route doesn't need.

10 new identity tests (domain use case + routes), 17 new Postgres repository tests added to the
existing combined `postgres-repositories.test.ts` (seeded via a nested `beforeAll` rather than
per-test, since `PostgresDriverRepository.save()` is insert-only and three tests share the same
two seeded driver ids — reassigning a device between them). 460 core tests (up from 446 — plus
the now-familiar `run-migrations.test.ts` fix for the 8th migration file/table, decision 57's own
prediction from the M5.6 follow-up, right again). 44 contracts tests (up from 41). 73 driver-bff
tests (up from 70). `pnpm arch` clean (315 modules, up from 309; 1045 dependencies, up from
1011). `pnpm lint`/`typecheck`/`format:check` all clean across every package.

**Verified by actually running it, all for real — Docker stayed up across this whole session**:
all 460 core tests, including the new device-repository suite against a real Postgres foreign-key
relationship (not faked); all 73 driver-bff tests; all 44 contracts tests.

## Decisions from M6.2

70. **`/identity/devices/` gets its own driver-auth prefix, not folded into a blanket
    `/identity/`.** Every other identity route is either part of the pre-token sign-in flow
    itself (OTP request/verify, token refresh, JWKS) — which cannot require an access token it
    doesn't have yet — or derives its subject a different way (`sessions/:id/revoke` from the
    token's own `sid` claim against the URL, not `request.driverId`). Gating all of `/identity/`
    would have broken sign-in entirely; a new, narrower prefix was the correct fix, not a
    workaround.
71. **`Device` is keyed by `pushToken`, not `(driverId)` or `(driverId, platform)`.** A driver
    could plausibly own more than one device (a driver and a dispatcher's tablet, say), so
    one-row-per-driver was never right; keying by the token itself is also what makes
    re-registration and reassignment both a plain upsert with no separate "does this exist"
    branch needed anywhere except inside `registerDevice` itself.
72. **The read-model facade method (`getPushTokensForDriver`) ships in the same task as the
    aggregate it reads, ahead of its real consumer.** A deliberate exception to "don't wire an
    unused dependency" (M2.3, M5.5's own precedent) — that precedent is about not wiring a
    _consumer_ to a producer that doesn't exist yet; here the producer and its own read method are
    the same unit of work (both live in `identity/api.ts`, both are "device push tokens" as a
    feature), and the actually-deferred part (M6.4's routing-side adapter) is untouched.

## Deviations and open items from M6.2

- **No way to unregister a device.** Signing out doesn't clear a driver's registered push
  tokens — a device stays registered (and would keep receiving that driver's alerts, once M6.5
  sends any) until a different driver's sign-in on the same physical device reassigns it, or the
  token itself goes stale on Expo's side. Not coupled to `revokeSession` deliberately: a push
  token's lifecycle is a property of the _device_, not the _session_, and Phase 1 has no product
  reason yet to force them together. Revisit if a tester reports alerts arriving after signing
  out.
- **No test yet exercises `getPushTokensForDriver` end-to-end against a real Postgres FK** beyond
  what `postgres-repositories.test.ts`'s `findByDriverId` coverage already proves — the facade
  method itself is a one-line wrapper with nothing more to verify until M6.4 gives it a real
  caller to test against.

**M6.3 delivered:** hazards' first real domain events — `reportHazard` and `confirmHazard` now
raise `HazardReported`/`HazardConfirmed` through the outbox M6.1 built with no caller yet.
Developed on its own branch off `main`, independent of M6.2 (identity device tokens) — the two
touch entirely different modules and neither needs the other's code, unlike M6.4, which will need
both.

- **`domain/events.ts`**: `hazardReportedEvent`/`hazardConfirmedEvent`, each building a
  `DomainEvent<Payload>` with its own payload shape (per `shared/domain-event.ts`'s own doc
  comment: "each event type defines its own payload shape where it's raised"). Emitted for every
  hazard type, not just blocking ones — filtering to what's worth alerting on is a _handler's_
  job (M6.4), not something the publisher decides on its behalf. `HazardDismissed`/
  `HazardExpired` (also in the design doc's own event list) stay unemitted: nothing in M6's
  alerting flow reacts to either, matching the same "don't wire an unused dependency" precedent
  as everything else this session has deferred until a real consumer exists.
- **`report-hazard.ts`/`confirm-hazard.ts`** gained an `ids: IdGenerator` dependency — narrower
  than it looks: decision 62 ("no IdGenerator, every hazards use case takes a caller-supplied
  id") was about the _aggregate's_ id (the offline-queue idempotency key), never touched here; an
  event's own id is a different, genuinely-generated need. Three cases, three outcomes: an
  idempotent retry of an already-filed report raises nothing (matches the existing "no new
  side effect" contract); a nearby-duplicate merge raises `HazardConfirmed` (a merge _is_ an
  implicit confirmation, from an alerting subscriber's point of view); a genuinely new report
  raises `HazardReported`.
- **`HazardRepository.save()`** gained an optional third argument, `events`. `PostgresHazardRepository`
  only opens a transaction when `events.length > 0` — `dismissHazard`/`expireHazards`'s calls
  (which never pass any) still pay no extra round trip, and the row + every event write together
  or not at all when there is one (decision 4).
- **`InMemoryHazardRepository`** gained a public `emittedEvents` array — recorded, never
  published, giving use-case tests a way to assert exactly which events a call raised without
  touching Postgres, the in-memory equivalent of what `postgres-hazard-repository.test.ts`
  proves against `outbox.events` for real.

9 new/changed hazards tests (3 domain, 2 report-hazard, 1 confirm-hazard, plus routes.test.ts's
deps update) plus 2 new Postgres tests proving a real transactional write (row + event together,
and confirming a no-events call writes no outbox row at all). 103 hazards-module tests total, 454
core tests overall on this branch (independent of, and not stacked on, M6.2 — each merges
cleanly against `main` on its own). `pnpm arch` clean (311 modules, 1028 dependencies — lower
than M6.2's own count, since this branch doesn't include M6.2's identity changes). `pnpm lint`/
`typecheck`/`format:check` all clean.

**Verified by actually running it, all for real — Docker stayed up**: all 454 core tests,
including two new Postgres-backed tests that insert an event via `save()` and then read
`outbox.events` back directly with a raw `pool.query`, proving the transaction genuinely writes
both rows together (and that a no-events call writes no outbox row at all).

## Decisions from M6.3

73. **A merge (nearby-duplicate reports collapsing into one extra confirmation) raises
    `HazardConfirmed`, not `HazardReported`.** The _reporter_ of the would-be duplicate never
    gets their own report row — `reportHazard`'s existing merge path returns the _existing_
    report — so from anything downstream (an alerting subscriber, decision 6's own guardrail
    "don't notify the driver who made the report"), this is indistinguishable from an explicit
    "still there" confirmation, and should be treated as one.
74. **Events are emitted for every hazard type, not filtered to blocking ones at the publishing
    site.** `isBlocking()` already exists in `hazard-report.ts` and could have filtered here, but
    doing so would bake one specific consumer's relevance rule (M6.4's reroute alerts) into the
    publisher itself — a future consumer with a different rule (e.g. an advisory-hazard digest)
    would need the event to exist at all. Filtering is cheap for a handler to do on receipt;
    baking it into the publish site is not reversible without republishing history.
75. **`HazardDismissed`/`HazardExpired` are not emitted, despite being in the design doc's own
    domain-events list.** Scoped out because nothing in M6 reacts to either — matches this
    session's repeated precedent for shipping infrastructure with no premature consumer (M2.3's
    `RoutingEngine`, M6.1's dispatcher itself, M6.2's `getPushTokensForDriver`).

## Deviations and open items from M6.3

- **No test proves the two rows (`hazards.reports` and `outbox.events`) actually roll back
  together on a mid-transaction failure** — `PostgresHazardRepository.save()`'s transaction
  wrapping is structurally the same pattern `PostgresUnitOfWork` already proves rolls back
  correctly (`postgres-unit-of-work.test.ts`, M1.4), so this wasn't independently re-verified by
  a dedicated failure-injection test here. Worth adding if this exact code path is ever suspected
  during an incident.
- **This branch was developed independently of M6.2** (deliberately — see the delivered note
  above) rather than stacked on top of it. M6.4 will need both; expect that branch to either
  merge both branches' commits in or be created only once both have landed on `main`.

**M6.4 delivered:** routing's reroute-detection subscriber — design doc §6, steps 1–5 — the first
real consumer of M6.1's outbox dispatcher and M6.3's two hazard events. Built on a branch that
merges M6.2 and M6.3's commits in directly (both were still unmerged when this started; the
`docs/progress.md` merge conflict that produced dropped M6.2's whole delivered/decisions section,
recovered by hand — see the merge commit).

- **`migrations/0009_route_plans_geography.sql`**: adds a PostGIS `geometry_geog geography
(LineString, 4326)` column + GiST index to `routing.route_plans` (design doc §6 step 1's "same
  PostGIS query as section 5, reversed" needs a route's geometry queryable spatially, the same way
  hazards' own `findNearbyLine` already is), and a new `routing.reroute_alerts` table — the
  guardrail/dedupe state, `unique (hazard_id, subject_type, subject_id)` plus an index on
  `(subject_type, subject_id, sent_at desc)` for the per-hour rate-limit count.
- **`RoutePlanRepository.findRecentUnstartedNear(location, radiusM, since)`** and
  **`ActiveTripRepository.findActiveNear(location, radiusM)`**: design doc §6 step 1's two halves
  — plans created in the window that never got a trip, and trips still in progress — both
  implemented for real against Postgres (`ST_DWithin` against `geometry_geog`, the trip query
  joining to its plan since `active_trips` has no geometry of its own) and against both in-memory
  fakes (flat-earth proximity against `decodePolyline()`'s output, same approximation the existing
  fakes already use). `InMemoryActiveTripRepository` now takes an optional `InMemoryRoutePlanRepository`
  reference (one-directional — the reverse would be an import cycle between two test doubles) so
  its fake can resolve a trip's plan geometry the same way the real join does.
- **`domain/reroute-alert.ts` + `RerouteAlertRepository`**: `exists(hazardId, subjectType,
subjectId)` is "one alert per hazard per trip" (design doc §6) and also what makes the whole
  handler idempotent under at-least-once delivery (AGENTS.md rule 9) — `save()`'s own unique
  index is the actual guarantee; `exists()` is just the pre-check that skips the work.
  `countSince(subjectType, subjectId, since)` is "a cap per trip per hour" (a guessed cap of 3,
  same status as the existing guessed radii).
- **`application/detect-reroute.ts`**: the use case. Never trusts a hazard event's own `type`/
  `measurement` payload fields — instead re-queries `hazards.findAvoidanceCandidates([location],
30)`, the same read-model call `HazardAvoidanceQueryAdapter` already uses for route planning, so
  a hazard that's been dismissed or expired between publish and handling is correctly treated as
  nothing-to-reroute-around. Finds affected subjects, filters through `applies()` (the
  safety-critical function, unchanged), applies both guardrails, requests a fresh route with a
  `bufferPoint` avoid-zone around the hazard, persists it as a new `RoutePlan`, saves the alert,
  and sends a push per device token. No per-subject try/catch — every write here is idempotent by
  construction, so a mid-loop throw just means the outbox dispatcher retries and `exists()` skips
  what already succeeded.
- **`ON_ROUTE_RADIUS_M`/`AVOID_ZONE_HALF_WIDTH_M` moved from `infrastructure/hazard-avoidance-
query.ts` into `domain/geo.ts`** (both exported now) — `detect-reroute.ts` needed the exact same
  radius design doc §6 asks for ("same query as section 5, reversed"), but `application/` can
  never import `infrastructure/` (AGENTS.md rule 1); the domain layer is the one place both can
  legally import from.
- **`application/ports/push-notifier.ts` + `infrastructure/console-push-notifier.ts`**: `PushNotifier`
  was already named as a precedent in AGENTS.md rule 3's own example list. `ConsolePushNotifier`
  logs instead of sending — same "module wires its own adapter, real one comes later" shape as
  identity's `ConsoleOtpSender`; the real Expo Push HTTP adapter is M6.5.
- **`application/reroute-event-handlers.ts`**: two thin `OutboxEventHandler`-shaped wrappers
  (`routing.detect-reroute-on-hazard-reported` / `-on-hazard-confirmed`) parsing the outbox row's
  raw JSON payload and calling `detectReroute`. Defines its own minimal `RoutingEventHandler`
  type rather than importing `platform/outbox-dispatcher.ts`'s `OutboxEventHandler`/
  `StoredDomainEvent` (modules may never import `platform/`) — structurally identical, so
  `compose-core.ts` (which can import both) assigns one into the other with no cast. A malformed
  payload throws rather than silently no-op'ing, so a genuine bug in hazards' own publishing code
  surfaces as a retried-then-dead-lettered event instead of a silent no-op.
- **`RoutingModuleDeps` gained `identity` and an optional `pushNotifier`; `RoutingModule` gained
  `eventHandlers`.** `compose-core.ts` now builds `identity` before `routing` (routing's handlers
  read it directly for `getPushTokensForDriver`) and passes `overrides.eventHandlers ??
routing.eventHandlers` into the `OutboxDispatcher` — M6.1's "no module has one yet" default is
  gone; routing is the first real caller.

20 new tests: 8 for `detectReroute` (in-memory fakes — reroutes an unstarted plan, reroutes an
in-progress trip from its plan's origin, no-op when the hazard is no longer active, `applies()`
false skips, reporter exclusion, idempotent redelivery, rate-limit cap, no-route-found skip), 4
for `PostgresRerouteAlertRepository` (real Postgres — exists/scoping, dedupe-on-conflict,
`countSince` windowing), 5 for `PostgresRoutePlanRepository.findRecentUnstartedNear`, 3 for
`PostgresActiveTripRepository.findActiveNear` — all against a real Postgres container with a
hand-verified polyline6 encoder (test-only, mirroring `driver-app`'s own `polyline.test.ts` split)
building realistic Hexham-area geometry, since the in-memory fakes' and the real repositories'
proximity checks both run against actually-decoded points, not a placeholder string. 488 core
tests total (up from 454 going into this branch). `pnpm arch` clean (327 modules, 1140
dependencies). `pnpm lint`/`typecheck`/`format:check` all clean.

**Verified by actually running it, all for real — Docker stayed up**: all 488 core tests,
including every new Postgres-backed spatial query and the reroute-alert repository's own
dedupe-on-conflict test (asserts the _first_ alert's `new_route_plan_id` survives a same-triple
second insert, not just that the second insert doesn't throw).

## Decisions from M6.4

76. **The reroute handler re-queries hazards' `findAvoidanceCandidates` rather than trusting the
    event payload's `type`/`measurement` fields.** The event only needs to carry enough to
    re-look-up the hazard (`hazardId`, `location`) and exclude its reporter — everything about
    whether it's still a genuinely active, blocking restriction is re-derived from the same
    read-model call `HazardAvoidanceQueryAdapter` already uses. This also means a hazard dismissed
    or expired between publish and processing is handled correctly with no extra code: the
    candidate list just comes back not containing it.
77. **A mid-trip reroute is planned from the trip's original origin, not the vehicle's real
    current position.** `ActiveTrip.lastPosition` stays unset for all of Phase 1 (decision, M5.6
    — no position-update endpoint exists yet), so `trip.lastPosition ?? plan.origin` always falls
    through to the plan's origin today. Documented as a known gap below rather than worked around,
    since fixing it needs a real position-tracking endpoint M6 doesn't otherwise require.
78. **`ON_ROUTE_RADIUS_M` and `AVOID_ZONE_HALF_WIDTH_M` moved into `domain/geo.ts`, out of
    `infrastructure/hazard-avoidance-query.ts`.** Both are plain numeric constants, so the domain
    layer can legally hold them; `application/detect-reroute.ts` needed the exact same values
    design doc §6 calls for, and `application/` importing from `infrastructure/` would violate
    AGENTS.md rule 1. Moving the constant, rather than duplicating its value a second time, keeps
    a single source of truth for something the design doc explicitly says must match.
79. **The new-route-plan `RoutePlan.hazardsOnRoute` is seeded with `[trigger.hazardId]`**, unlike
    every other `RoutePlan` this codebase creates (`planRoute`'s own plans always leave it `[]` —
    M2.5's still-undelivered "what was avoided" explanation). A reroute's whole reason for
    existing is one specific hazard, so recording it costs nothing and is strictly more useful
    than leaving the field empty by rote consistency with `planRoute`.
80. **Rate limit is a flat 3 alerts per subject per rolling hour, and the 6-hour unstarted-plan
    window and 30m on-route radius are unchanged from design doc §5/§6's own numbers.** The rate
    cap has no design-doc-given number — a guess, same status as `AVOID_ZONE_HALF_WIDTH_M` — worth
    revisiting once real driver feedback exists on how often reroute pushes actually fire.

## Deviations and open items from M6.4

- **Mid-trip reroutes use the trip's plan origin, not a live position** (decision 77) — every
  `ActiveTrip` reroute in Phase 1 is really "replan from where the trip started," which is
  increasingly wrong the further into a trip the hazard is reported. Revisit once a position-
  update endpoint exists (M6.6 or later); until then this is a known, accepted gap, not a bug.
- **No test proves the outbox dispatcher actually routes a real `HazardReported`/`HazardConfirmed`
  row through to `detectReroute` end-to-end** — `reroute-event-handlers.ts`'s payload parsing and
  `detectReroute`'s own logic are each tested directly, but nothing publishes a real hazard event
  and lets the real `OutboxDispatcher` pick it up and dispatch into routing's handler in the same
  test. `outbox-dispatcher.test.ts` (M6.1) already proves the dispatcher mechanism generically;
  this would be an integration test of the full path across three modules, which M6.7 (explicitly
  "end-to-end verification") is scoped to cover.
- **No real push notification exists yet** — `ConsolePushNotifier` just logs. M6.5 is the real
  Expo Push HTTP adapter; nothing about this milestone's own code should need to change when it
  lands, since `PushNotifier` is already the seam.
- **A hazard whose event fires while no vehicle is nearby, or where `routingEngine.route()`
  genuinely finds no way around it, produces no user-visible trace at all** (silently `continue`s
  in both cases). Acceptable for now — there's nothing to show a driver who isn't affected, and
  "no route exists" has no new route id to put in a notification — but if this needs observability
  later (e.g. counting how often rerouting fails), that's a deliberate gap to fill then, not now.

**M6.5 delivered:** `infrastructure/expo-push-notifier.ts`'s `ExpoPushNotifier` — the real Expo
Push HTTP adapter `PushNotifier`'s docstring has been naming as "M6.5" since M6.4. Now the wired
default in `createRoutingModule`, replacing `ConsolePushNotifier`.

- **Hand-rolled HTTP (decision 6/51's precedent), no client library**: one POST to Expo's fixed
  `https://exp.host/--/api/v2/push/send`, body `[{ to, title, body, data }]` (Expo's own array
  shape, one element per call — `PushNotifier.send` is already per-token), reading back one
  ticket from `{ data: [...] }`. `accessToken` is optional and unconfigured by default —
  confirmed against Expo's own docs (`docs.expo.dev`) that it's opt-in per project ("enhanced
  push security"), not a blanket requirement — sent as `Authorization: Bearer <token>` when set,
  via a new optional `EXPO_ACCESS_TOKEN` config var.
- **A per-ticket `status: 'error'` (most commonly `DeviceNotRegistered` — a stale/revoked token)
  is logged via `console.warn` and swallowed, not thrown.** By the time a push is sent,
  `detect-reroute.ts` has already persisted the `RerouteAlert` and has no per-token retry path —
  the idempotency guard (rule 9) means a retried event would just skip that already-alerted
  subject, so throwing here would silently drop the alert rather than genuinely retry it. A
  non-2xx HTTP response or an unrecognised body still throws (a genuine infra fault), same
  Valhalla-adapter convention as decision 50.
- **`ConsolePushNotifier` stays in the codebase**, no longer the default, available as an
  explicit `pushNotifier` override for tests or a local manual run that shouldn't reach Expo's
  real endpoint — its own docstring updated to say so.
- Tested against a real local HTTP server standing in for Expo (same philosophy as
  `valhalla-routing-engine.test.ts`), not a mocked `fetch`: the request shape, the optional
  bearer header, a successful ticket, an error ticket (logged, not thrown), a non-2xx response,
  a malformed body, and an empty `data` array.

8 new tests (`expo-push-notifier.test.ts`), plus `config.test.ts` gained `EXPO_ACCESS_TOKEN`
coverage (defaults to `undefined`, accepts an override, rejects an empty string). 501 core tests
total (up from 488 going into this branch, plus the driver-auth regression tests below).
`pnpm arch` clean (329 modules, 1145 dependencies). `pnpm lint`/`typecheck`/`format:check` all
clean.

**A real, production-blocking bug was found and fixed while verifying this live, not by a
test.** Driving `POST /identity/devices` end to end for the first time ever (M6.2 shipped it,
M6.4 built its only real caller — `getPushTokensForDriver` — but nothing had ever driven the HTTP
route itself against a real running host) returned `{"error":"unauthenticated"}` for a
perfectly valid access token. Cause: `host/build-app.ts`'s `DRIVER_AUTH_PREFIXES` gates
`/identity/devices/` with a trailing slash, matching every existing test
(`/identity/devices/protected` in both `build-app.test.ts` and, implicitly, nothing in
`driver-auth.test.ts` at all) — but the real route's URL is the bare `/identity/devices`, with no
trailing slash, which `request.url.startsWith('/identity/devices/')` never matches. The hook
silently skipped the route entirely, `request.driverId` stayed `undefined`, and the route
handler's own `requireDriverId` 401'd every real call with a generic `unauthenticated` — device
registration has been completely broken in production since M6.2 shipped it, invisible to every
prior test because each one used a `/…/protected` sub-path fixture that happened to have the
extra path segment this bug needed to hide behind.

## Decisions from M6.5

81. **Fixed: `registerDriverAuth`'s prefix match now also matches the bare path a trailing-slash
    prefix implies** (`request.url === prefix.slice(0, -1) || request.url.startsWith(prefix)`),
    not just `host/driver-auth.ts`'s `DRIVER_AUTH_PREFIXES` list itself — fixing it in the
    matcher, not by dropping the trailing slash from one entry, protects every future prefix
    from the identical mistake, not just this one. Two new regression tests added at both the
    unit level (`driver-auth.test.ts`, registering the real bare route against the real hook)
    and the integration level (`build-app.test.ts`, the actual `/identity/devices` path, not a
    `/protected` sub-path fixture) — the second is the one that would have caught this originally,
    since the first only proves the hook's own logic, not that every real route was ever
    exercised through it.
82. **`ExpoPushNotifier` becomes the unconditional default**, not gated behind `EXPO_ACCESS_TOKEN`
    being set — same reasoning as `ValhallaRoutingEngine` (M2.3) being the only, always-real
    `RoutingEngine`: once a real adapter exists, "real by default, override to fake for tests" is
    the pattern, not "fake by default until some extra config appears." Unlike identity's
    `OtpSender` (still `ConsoleOtpSender`-only — no SMS/email provider chosen), a real provider
    account was never needed here: Expo's push API accepts requests with no account or token at
    all unless a project opts into stricter security.
83. **An error ticket (`status: 'error'`) is logged and swallowed, not translated into a thrown
    error or a `Result`.** Considered making `PushNotifier.send` return a `Result` the way
    domain-layer expected failures do (rule 13) — rejected because nothing downstream of
    `detect-reroute.ts`'s per-token `pushNotifier.send()` calls would do anything with it: the
    `RerouteAlert` is already persisted, there's no second token to fall back to for the same
    device, and the loop's only options on failure are "stop early" (worse — other tokens for
    the same driver, or other subjects entirely, wrongly never get their push) or "ignore and
    continue" (what logging already achieves, with a visible trace).

## Deviations and open items from M6.5

- **No production Expo project is configured** — `EXPO_ACCESS_TOKEN` is unset, and no real
  device has ever received a push (M6.6, the driver app's own registration UI, doesn't exist
  yet). Verified as far as it can be without one: a real HTTPS round trip to Expo's actual
  `exp.host` endpoint, through the whole real pipeline (hazard report → outbox → `detectReroute` →
  `RerouteAlert` persisted → `ExpoPushNotifier.send()`), which correctly came back a real
  `DeviceNotRegistered` ticket for the fabricated token used to test it — the adapter's plumbing
  is proven; only "a real phone actually buzzes" remains, which needs M6.6.
- **Expo's push-receipt step (`/getReceipts`) is not implemented.** Expo's own model is two-phase:
  a ticket (this milestone) confirms Expo _accepted_ the message; a receipt, fetched later,
  confirms whether it was actually _delivered_. Design doc §6 doesn't ask for delivery
  confirmation, and nothing in Phase 1 reads a receipt today — ticket-level accept/reject is the
  whole of what `PushNotifier`'s `Promise<void>` contract needs. Revisit if silent delivery
  failures (accepted by Expo, never actually delivered) become something worth detecting.
- **No batching.** Expo's API accepts up to 100 messages per request; `detect-reroute.ts` calls
  `pushNotifier.send()` once per token in a loop, one HTTP request each. Fine at Phase 1's scale
  (a handful of testers, rarely more than one device each) — worth revisiting only if a single
  hazard event ever needs to alert enough devices at once for request count to matter.

**M6.6 delivered:** the driver-app side of M6.2/M6.5 — registering a push token, receiving a
reroute push, and the reroute-prompt screen design doc §6 names ("Opening the notification shows
old vs new route; driver accepts or keeps the original. Never switch silently."). Needed one new
backend capability first: nothing let the app fetch a route plan by id, and a reroute push only
ever carries `newRoutePlanId` (M6.4), not the plan itself.

- **`GET /routing/route-plans/:id`** (core + BFF): `application/get-route-plan.ts`, mirroring
  `getVehicleProfile` exactly — a driverId mismatch returns the same `RoutePlanNotFound` as a
  genuinely unknown id (decision 49's precedent, extended to plans). `RoutePlanRepository.findById`
  already existed (`startTrip` already used it); this is the first route to expose it over HTTP.
  The BFF route is a plain forward, same shape as every other `GET .../:id` route in
  `routing-routes.ts`.
- **`expo-notifications` + `expo-device`** (new dependencies, both `expo install`-resolved against
  SDK 57) and an `expo-notifications` config plugin entry in `app.config.ts`.
- **`lib/push-registration.ts`'s `obtainPushToken`**: pure orchestration over injected
  permission/token calls (same "effectful deps injected, pure logic tested directly" split as
  `flushQueuedReports`/`fetchCurrentLocation`) — checks for an EAS project id first (`no-project-id`
  outcome, since `getExpoPushTokenAsync` throws without one and no EAS project exists yet, M5.10),
  then permission (existing-or-request, `denied` outcome), then the token itself (`error` outcome on
  a genuine failure). A denial or missing project id is an expected value, never a thrown error.
- **`hooks/use-register-push-token.ts`**: thin glue wiring the above to real `expo-notifications`/
  `expo-device`/`expo-constants` calls plus `api/identity.ts`'s new `registerDevice`. Runs whenever
  a driver is signed in (`useAuthStore`), not only once at sign-in — `registerDevice` is a plain
  upsert keyed by the token itself (decision 71), so re-running is free and also covers the "a
  different driver signs in on the same phone" reassignment case M6.2 built for. Skips entirely on
  a simulator (`Device.isDevice`).
- **`lib/reroute-notification.ts`'s `newRoutePlanIdFrom`** + **`hooks/use-reroute-notifications.ts`**:
  the latter sets a foreground notification handler (module scope, same reasoning as
  `api/query-client.ts`'s module-scope `QueryClient` — a driver mid-trip needs to see/hear an alert
  immediately, not only after later pulling down the tray) and registers both
  `addNotificationReceivedListener` (arrives while the app's open) and
  `addNotificationResponseReceivedListener` (tapped from the tray), routing to `/reroute/[id]` for
  either. Reads `useAuthStore.getState()` at event time rather than depending on a render's own
  `state`, since these listeners are registered once and must survive a sign-in that happens later.
- **`app/reroute/[id].tsx`**: fetches the new plan (`api/use-route-plan.ts`'s `useRoutePlan`), reads
  the current one straight from `current-route-plan-store` (never re-fetched — it's already in
  memory), shows both on the map at once (`RouteMap`'s new `alternateRouteLine` prop, a second
  coloured `GeoJSONSource`/`Layer` pair) plus a distance/time comparison, and two large buttons.
  Accepting calls `current-route-plan-store`'s existing `setPlan` with the new plan and navigates
  back to wherever the trip actually is (`/active-trip` if one's running, `/route-overview`
  otherwise) — no core call, since a reroute's `RoutePlan` is already fully independent and
  persisted (decision 79); "accept" is purely a client-side swap of which one the app is showing. A
  missing current plan (app relaunched — both trip and plan stores are ephemeral, M5.5/M5.6's own
  accepted gap) redirects to `/plan-route`, the same fallback `active-trip.tsx`/`route-overview.tsx`
  already use for the equivalent case, rather than guessing.
- Wired both new hooks into `_layout.tsx`, alongside `useOpportunisticRefresh`/
  `useHazardQueueFlush`.

6 new core tests (`get-route-plan.test.ts`'s 3 + `GET /routing/route-plans/:id` in `routes.test.ts`'s
3), 4 new driver-bff tests (same route, proxy-side). 507 core tests total (up from 501), 77
driver-bff tests total (up from 73). On the driver-app side: 13 new tests
(`push-registration.test.ts`, `reroute-notification.test.ts`, plus `registerDevice`/`getRoutePlan`
cases added to the existing `identity.test.ts`/`routing.test.ts`) — 127 driver-app tests total. No
test for `app/reroute/[id].tsx` itself or either new hook's thin glue, matching this codebase's
existing convention: no screen has ever had a component-level test (native map dependencies make
that impractical, per `route-map.tsx`'s own docstring), and a thin hook's job is fully covered once
the pure function underneath it is. `pnpm arch` clean (341 modules, up from 329; 1185 dependencies,
up from 1145). `pnpm verify` green end to end (lint, typecheck, test, arch, format:check).

**Verified as far as it can be without a real EAS project or device** — the same boundary M6.5 hit.
`obtainPushToken` has only ever exercised its `no-project-id` branch for real (no EAS project
exists yet, M5.10's own pending item); registering a token, receiving a push, and the reroute
prompt's fetch/compare/accept flow are covered by unit tests plus a clean typecheck/lint/`pnpm
arch` run, not a real device. `GET /routing/route-plans/:id` itself was exercised for real: full
`pnpm verify` run against the real Testcontainers Postgres the rest of the routing suite already
uses.

## Decisions from M6.6

84. **`GET /routing/route-plans/:id` exists now, superseding M5.5's own documented reason for not
    having one.** M5.5 said core deliberately had no such endpoint because "there's no route-plan
    history to browse" — still true for browsing, but a reroute push only ever carries an id, not
    a plan, so the driver app needs _some_ way to turn that id into something displayable. Added
    narrowly for that one caller, not as a general route-plan-lookup feature; `current-route-plan-
store` still isn't a cache keyed by id, and there's still no list-of-past-plans endpoint.
85. **Accepting a reroute is purely client-side — no core call.** A reroute's `RoutePlan` is
    already a complete, independent, persisted row by the time the push arrives (`detect-
reroute.ts` creates and saves it before sending anything, M6.4) — the driver's device holds
    the _only_ notion of "which plan is currently being followed," and switching that is nothing
    more than which one the app happens to be showing. There is no server-side "current plan for
    this trip" concept to update (decision 10: no `RoutePlan` lifecycle in Phase 1).
86. **`useRegisterPushToken` re-runs on every sign-in, not once per app install.** Considered
    registering only the first time a token is obtained, gated by some persisted "already
    registered" flag — rejected because the server-side upsert (decision 71) already makes
    re-registration free and idempotent, and a flag would only add a new way for the client and
    server to disagree about whether registration actually succeeded (e.g. the app crashed after
    setting the flag but before the network call completed).
87. **A missing EAS project id is treated exactly like a driver declining the permission prompt** —
    both are `obtainPushToken` outcomes, not errors, and both mean the same thing downstream
    ("no token to register today"). Splitting them into different code paths in the _caller_
    (`use-register-push-token.ts`) would buy nothing: there's nothing actionable for the app to do
    differently in either case until a human (this session's user) sets up an EAS project.

## Deviations and open items from M6.6

- **No real device has ever received a reroute push.** The full chain from hazard report through
  to a driver tapping a notification and seeing the reroute prompt is unverified end to end — the
  same gap M6.5 disclosed, now one milestone closer to closed but still blocked on the same
  external dependency (an EAS project, M5.10).
- **No way to unregister a device from the app side either** (M6.2's own deviation, unchanged) —
  signing out doesn't stop a phone receiving a signed-out driver's alerts until a different driver
  signs in on the same device and reassigns the token, or Expo itself reports it as stale.
- **The reroute prompt has no test of its own** — same accepted gap as every other screen in this
  app (no component-level tests exist anywhere in `apps/driver-app/src/app/`), not a new one this
  task introduced.
- **M6.7 (end-to-end verification) closes this** — see below. It found two real bugs in the
  outbox dispatcher itself, not just gaps in test coverage.

**M6.7 delivered:** the one remaining M6 task — a real, full-stack integration test
(`apps/core/src/composition/reroute-end-to-end.test.ts`) driving the exact path M6.4's own
deviations flagged as unproven: a real HTTP hazard report, through the real outbox, dispatched by
the real `OutboxDispatcher`, into routing's real reroute-detection handlers, ending in a real
`RerouteAlert` + `RoutePlan` row and a real `PushNotifier.send()` call — across hazards, routing
and identity together, wired exactly as `composeCore` wires them in production. Only Valhalla (a
local HTTP stand-in, same technique as `valhalla-routing-engine.test.ts` — decision 13 keeps a
real Valhalla out of the per-PR tier) and `PushNotifier` are faked; sign-in is bypassed with a
token-to-claims map rather than a real OTP round trip (M1.5/M1.6 already cover that flow
exhaustively — this test's job is the wiring between the other three).

Three scenarios, matching the task's own name exactly: (1) a hazard reroutes the one nearby driver
and never notifies the reporter, even though the reporter has their own nearby plan that would
otherwise qualify — the exclusion is asserted as a real absence in `routing.reroute_alerts`, not
just "we never called `send()` for them," so a bug that skipped the push but still rerouted/
persisted an alert for the reporter would still be caught; (2) idempotency — a genuine redelivery
of the same already-processed event (`outbox.events.processed_at` reset to null, precisely what
"a crash between handling and marking processed" looks like, per AGENTS.md rule 9) creates no
second alert or push; (3) the rate cap — four distinct, genuinely non-merging hazards (>1km apart,
so hazards' own ~50m merge radius never collapses them) all near the same route within one rolling
hour cap the alerts at 3, per decision 80's `RATE_LIMIT_PER_SUBJECT_PER_HOUR`.

**Two real, latent concurrency bugs were found and fixed by actually running this, not by
inspection** — both in `platform/outbox-dispatcher.ts`, code every other M6 task had already
shipped and unit-tested, but never run against a realistically fast poll loop under real handler
latency:

- **Decision 88**: `OutboxDispatcher.start()`'s `setInterval` had no guard against overlapping
  ticks. A handler's own work (an HTTP call to a routing engine, several Postgres round trips per
  affected subject) can genuinely outlast the poll interval under real load; without a guard, a
  second tick could re-claim the _same still-unprocessed_ row (the claim transaction's row lock
  releases once claimed, not held for the handler's own duration — a deliberate choice from M6.1)
  and run its handler a second time _concurrently_ with the first, not sequentially after it. This
  surfaced as real, reproducible duplicate pushes once this test's 100ms poll interval made the
  race easy to hit — first suspected from watching `outbox.events.attempts` climb to 3 and 5 for a
  single event that should only ever have been claimed once. Fixed with a `#draining` flag: a tick
  that finds one already in flight simply skips itself, exactly as if it had been a no-op poll.
- **Decision 89**: `RerouteAlertRepository.save()`'s own doc comment claimed the unique index made
  "a concurrent double-send impossible" — false. The index does make a concurrent double-_insert_
  impossible (`on conflict do nothing`), but `detectReroute` sent the push _unconditionally_ after
  calling `save()`, never checking whether its own call actually won or silently lost the
  conflict. `save()` now returns a boolean (`returning id`, checked for a row) so the loser can
  tell it lost and skip the push — the exact AGENTS.md rule 9 failure mode named as the whole
  point of exhaustive at-least-once handling: "a push notification sent twice is a driver woken
  twice about the same bridge." Both the Postgres adapter and `InMemoryRerouteAlertRepository`
  were updated to the same contract; a new `detect-reroute.test.ts` case forces a simulated
  "lost the race" `save()` and asserts no push is sent.
- **Decision 90**: `OutboxDispatcher.stop()` only cleared the interval — it didn't wait for a
  tick that was already in flight when `stop()` was called. `compose-core.ts`'s `close()` calls
  `stop()` then immediately ends the database pool, so a still-running `drainOnce()` could throw a
  real "Cannot use a pool after calling end on the pool" unhandled rejection moments later —
  observed for real in this test's own `afterEach`, not hypothesised. `stop()` is now `async` and
  awaits whichever drain is currently running before returning; `close()` awaits it in turn.

A smaller, test-only lesson, not a product bug: the first draft of the rate-limit scenario used a
fake Valhalla that always returned the _same_ geometry regardless of the requested avoid zone —
meaning every "rerouted" plan looked geometrically identical to the original, so it was itself
picked up as a fresh "nearby unstarted plan" by the _next_ hazard report on the same corridor,
snowballing into far more alerts than the cap should allow. Fixed by making the fake avoid-zone-
aware (returns a genuinely different, far-away line whenever the request carries
`exclude_polygons`), matching what a real routing engine actually does — not a workaround, a
correction to an unrealistic fake.

3 new tests in `reroute-end-to-end.test.ts`, 1 new test in `detect-reroute.test.ts` (the lost-race
case), 1 new test in `outbox-dispatcher.test.ts` (no overlapping drains under a slow handler), and
the existing `postgres-reroute-alert-repository.test.ts` dedupe test updated to assert the new
`true`/`false` return values instead of `undefined`. 512 core tests total (up from 507 going into
this task). `pnpm arch` clean (342 modules, 1198 dependencies). `pnpm verify` green end to end, run
three times in a row (including two full, unmodified re-runs) to confirm the concurrency fixes
hold under real load, not just once by luck.

**Verified by actually running it, repeatedly, under real load** — this is the whole point of the
task. The full monorepo `pnpm verify` was run multiple times back to back specifically to catch
timing-sensitive flakes the way the two real bugs above were originally found, not just once for a
green checkmark. One unrelated flake surfaced in the process (`run-migrations.test.ts`'s single
`it` hit vitest's 5s default timeout once, under a machine now running a dozen-plus concurrent
Testcontainers Postgres instances instead of eleven) — bumped to 20s rather than papered over,
since applying nine real migrations is genuine DB work that can legitimately take longer under
contention, not a hang.

## Decisions from M6.7

88. **`OutboxDispatcher.start()` now guards against overlapping poll ticks.** A `#draining` flag
    makes a tick that finds a previous one still running skip itself entirely, rather than firing
    another `drainOnce()` concurrently. Production's default 2-second poll interval made this rare
    in practice, but not impossible — a slow Valhalla response or a loaded Postgres could still
    trigger it, and "rare" is exactly the kind of bug this end-to-end test exists to catch before
    a real driver hits it. AGENTS.md rule 9 already assumed sequential redelivery, not concurrent;
    this makes the code actually match that assumption.
89. **`RerouteAlertRepository.save()` returns whether it actually inserted a new row, not
    `void`.** The unique index alone only protects the database row; the caller (`detectReroute`)
    still needs to know whether _it_ was the one that won, since only the winner should notify a
    driver. Both `PostgresRerouteAlertRepository` (`on conflict do nothing returning id`) and
    `InMemoryRerouteAlertRepository` (an explicit duplicate check) implement the same contract.
90. **`OutboxDispatcher.stop()` is now `async` and awaits any in-flight `drainOnce()`.** A
    fire-and-forget `stop()` that only clears the timer left a real window for a caller to close
    a database pool out from under a drain that was still using it — exactly what `compose-core.
ts`'s `close()` does on every shutdown. The one production call site was updated to `await`
    it; nothing else in the codebase called `stop()` directly.

## Deviations and open items from M6.7

- **No real push notification has ever reached a real device** — this remains true (M6.5/M6.6's
  own disclosed gap), and M6.7 doesn't change it: this milestone proves the _server-side_ pipeline
  end to end against a real Postgres and a real (if faked-downstream) outbox/dispatcher/handler
  chain, not a real phone. That still needs an EAS project (M5.10).
- **The overlapping-poll race (decision 88) was only ever observed at a 100ms poll interval**,
  chosen to make this test fast and reliable rather than to mirror production's real 2-second
  default. Nothing about the fix is interval-specific — it removes the race at any interval — but
  the bug itself was never actually seen occurring at the production default in this session, only
  reasoned about and then deliberately reproduced at an accelerated rate to confirm the fix.
- **The cascading-candidate risk this task's own test-only lesson describes (a rerouted plan
  looking like a fresh candidate to a _different_, later hazard on the same corridor) is real, not
  just a test artifact, in one narrower form the fake-Valhalla fix doesn't touch**: a genuinely
  different hazard reported near a just-created reroute plan's _actual_ new path (not the original,
  avoided corridor) would legitimately, and correctly, reroute it again — that's working as
  intended, not a bug. What the test's first draft accidentally exercised was the degenerate case
  where the "rerouted" path was geometrically identical to the original because the fake never
  changed it; a real Valhalla given a real avoid zone does not have this property. Not fixed
  because there is nothing to fix here — recorded so a future session doesn't mistake the
  now-realistic fake for a narrowed test.

## M7 task breakdown

| #    | Task                                                               | Status            |
| ---- | ------------------------------------------------------------------ | ----------------- |
| M7.1 | `HazardParser` port + Anthropic LLM adapter                        | Done — 2026-09-24 |
| M7.2 | Driver-app: on-device speech capture, mic button wiring            | Done — 2026-09-24 |
| M7.3 | Driver-app: parse + spoken confirm flow                            | Done — 2026-09-24 |
| M7.4 | Unconfirmed-drafts review screen (parked use)                      | Done — 2026-09-24 |
| M7.5 | End-to-end verification (as far as possible without a real device) | Done — 2026-09-25 |

Real-world speech-recognition accuracy against testers' actual accents and cab noise is
deliberately not tested cheaply now (design doc's own open question) — deferred to real-device
testing alongside M5.10, per this session's decision when M7 planning started.

**M7.5 delivered:** the deferred open question closed — the app and the voice hazard-reporting
flow were run on a real Android device (Expo Go/dev client, not an EAS build) on 2026-09-25, with
the driver's own accent and cab-style background noise. No accuracy problems found. The
TestFlight/Play EAS-build half of real-device verification is still open; tracked under M5.10.

**M7.1 delivered:** the `HazardParser` port (design doc §7 step 3) — the LLM half of voice
reporting — with a real adapter, not a stub. Core-only: no driver-app changes yet, since nothing
speaks a transcript to it until M7.2/M7.3.

- **`application/ports/hazard-parser.ts`**: `HazardParser.parse(transcript): Promise<ParsedVoiceReport>`
  (`{ type, note?, measurement?, positionHint? }`). Never rejects a transcript outright — the
  design doc's own fallback ("invalid output... falls back to type `other` with the raw transcript
  as the note") is part of the port's contract, not something a caller has to handle separately.
  Only a genuine infra fault (the LLM API unreachable, non-2xx) throws — the same "expected
  outcome is a value" shape as `RoutingEngine`'s `NoRouteFound` and `PushNotifier`'s swallowed
  error tickets.
- **`infrastructure/anthropic-hazard-parser.ts`**: hand-rolled HTTP to Anthropic's Messages API
  (decision 6/51's "hand-roll small, well-understood things," no SDK) — `claude-haiku-4-5-20251001`
  (cheapest/fastest tier, matching design doc §7's own "pennies at Phase 1 volumes" cost note), one
  forced tool call (`tool_choice: { type: 'tool', name: 'file_hazard_report' }`) so the model
  returns structured JSON directly rather than prose to re-parse. The tool's `input` is still
  zod-validated before being trusted — a forced tool call constrains the _shape_ the API will
  accept, not that a given call's content actually satisfies every rule (e.g. a positive
  measurement value) — invalid output is retried once, then falls back to
  `{ type: 'other', note: transcript }` exactly as designed. A non-2xx response or an unparseable
  body throws, same convention as `ValhallaRoutingEngine`/`ExpoPushNotifier`.
- **`infrastructure/null-hazard-parser.ts`**: always returns the `type: 'other'` fallback with no
  network call — wired as the default when `ANTHROPIC_API_KEY` is unset (decision 92, below).
- **`application/parse-voice-report.ts`**: a thin use case wrapping the port — no `Result`, since
  the port's own contract already never fails.
- **`POST /hazards/voice-reports/parse`** (core + BFF proxy): `{ transcript }` →
  `{ type, note?, measurement?, positionHint? }`. Gated by the existing `/hazards/` driver-auth
  prefix (no new prefix needed); no ownership check, same as confirm/dismiss/get — parsing isn't
  scoped to a reporter.
- **`packages/contracts/src/hazards.ts`**: `parseVoiceHazardReportRequestSchema`,
  `parsedVoiceHazardReportSchema` — `positionHint` has no counterpart on `hazardReportSchema`
  (design doc §7 step 5: kept as free text, never resolved to a location in Phase 1).
- **`config.ts`**: `ANTHROPIC_API_KEY`, optional — unlike `EXPO_ACCESS_TOKEN`, Anthropic's API
  genuinely requires a key, so unset wires `NullHazardParser` instead of failing to boot (decision
  92).
- **`hazards/api.ts`**: `createHazardsModule` wires `AnthropicHazardParser`/`NullHazardParser`
  itself from `anthropicApiKey`, same "module wires its own adapter" pattern as
  `ValhallaRoutingEngine`/`ExpoPushNotifier` — `composeCore` just passes the config value through
  plus an optional `hazardParser` override for tests, mirroring `pushNotifier`'s own shape exactly.

14 new core tests (`anthropic-hazard-parser.test.ts`'s 7, `parse-voice-report.test.ts`'s 1, 3 new
route tests, plus `config.test.ts` gaining 3 `ANTHROPIC_API_KEY` cases), 3 new contracts tests, 3
new driver-bff tests. 526 core tests total (up from 512), 47 contracts tests (up from 44), 80
driver-bff tests (up from 77). `pnpm arch` clean (349 modules, 1215 dependencies). `pnpm verify`
green end to end (lint, typecheck, test, arch, format:check).

**A real, if small, wiring bug was caught while verifying this, not by a test**: the new route's
handler threw a `TypeError` on every request (500, even for a missing/empty transcript that should 400) because `packages/contracts`'s `dist/` hadn't been rebuilt after adding the two new schemas —
`apps/core` resolves `@wagonwise/contracts` through its built output (decision 37), so the new
exports were simply `undefined` until `pnpm --filter @wagonwise/contracts build` ran. Not a code
bug, but a reminder that a schema change needs a contracts rebuild before its consumer can see it,
same lesson decision 37 already recorded for `node dist/main.js` vs `tsx`.

## Decisions from M7.1

91. **`HazardParser`'s retry-once-then-fallback lives inside the adapter, not the use case.**
    `parseVoiceReport` (`application/`) is a one-line passthrough; `AnthropicHazardParser` owns
    deciding what counts as "invalid output" and when to give up, because that's specific to how
    _this_ adapter's output can fail (no tool_use block, or a tool_use block that fails schema
    validation) — a hypothetical second LLM adapter would have its own failure shapes to reason
    about, not necessarily the same ones.
92. **`ANTHROPIC_API_KEY` unset wires `NullHazardParser`, not a boot failure — and this is a
    different situation from `OtpSender`'s still-unresolved SMS/email provider (M1.5 deviations).**
    The provider _is_ chosen here (Anthropic); what's missing is just a key in a given dev
    environment. Falling back to the same `type: 'other'` outcome the real adapter itself falls
    back to on bad output keeps `pnpm dev` working with zero configuration (the cold-start promise)
    without inventing a second, different "no parser configured" behaviour.
93. **A forced tool call (`tool_choice`), not free-text-then-parse — but the tool's `input` is
    still zod-validated, never trusted just because the API accepted the request.** Forcing a tool
    call constrains what shape the model _can_ return; it says nothing about whether a specific
    response actually satisfies every rule in that shape (e.g. `value` positive, per
    `validateMeasurement`'s own domain rule) — a model can call a tool with a schema-shaped but
    substantively wrong payload, and only re-validating catches that.
94. **New rule discovered, not created: a `HazardParser` test double for interface-layer tests must
    live in `application/testing/`, not be a real `infrastructure/` adapter (even a harmless one
    like `NullHazardParser`).** `interface-no-infrastructure` (packages/architecture) already
    enforced this generally — caught for real when `routes.test.ts` first imported
    `NullHazardParser` directly and `pnpm arch` failed. Fixed by adding
    `application/testing/stub-hazard-parser.ts`, the same role `InMemoryHazardRepository` already
    plays for `HazardRepository`.
95. **Fixed in passing: `turbo.json`'s `dev` task was missing `EXPO_ACCESS_TOKEN` from
    `passThroughEnv`, since M6.5.** Noticed while adding `ANTHROPIC_API_KEY` to the same list —
    Turborepo silently strips any env var not listed there (the exact failure mode AGENTS.md's own
    "Tooling gotchas" section already names), so a real `EXPO_ACCESS_TOKEN` set for local `pnpm dev`
    would have been silently dropped this whole time. Both variables now listed.

## Deviations and open items from M7.1

- **Not verified against the real Anthropic API — no `ANTHROPIC_API_KEY` exists in this dev
  environment.** `AnthropicHazardParser` is tested against a real local HTTP server standing in
  for Anthropic's Messages API (same philosophy as `ValhallaRoutingEngine`/`ExpoPushNotifier`), not
  the live endpoint. The request/response shapes are taken from Anthropic's own published API
  docs, not confirmed against a real call — get a key from console.anthropic.com and try a real
  transcript before trusting the model actually calls the tool reliably and picks sensible types.
- **`positionHint` is round-tripped by the parse endpoint but goes nowhere yet.** Nothing calls
  `POST /hazards/voice-reports/parse` and nothing threads its result into `POST /hazards/reports`
  — that's M7.3's job (the app-side confirm-then-file flow). `reportHazardRequestSchema`/
  `HazardReport` don't have a `positionHint` field at all yet; whether one's worth adding, or
  whether it just gets folded into `note` at submit time, is an open call for whoever builds M7.3.
- **No voice hazard report has ever actually been filed** — `source: 'voice'` has existed in the
  domain/contracts since before M7 (it was already there for M6's own tests), but nothing in this
  codebase has ever driven the real path from a transcript to a filed report. M7.2/M7.3 close this.
- **The system prompt and tool description are untested against real speech-to-text output** —
  they were written against clean, written-out example transcripts, not the kind of disfluent,
  half-sentence output on-device speech recognition actually produces from a driver talking while
  driving. Worth revisiting once M7.2 exists and real transcripts are available to test against.

**M7.2 delivered:** the driver-app half of design doc §7 steps 1–2 — the active-trip screen's mic
button is now real on-device speech capture, not a disabled placeholder. Deliberately stops at a
transcript: parsing it (M7.1's endpoint) and filing a report are M7.3's job, kept separate so this
task stays reviewable in one sitting and the capture mechanics get proven on their own first.

- **`expo-speech-recognition`** (new dependency, `57.1.0`, matching the installed Expo SDK) wraps
  iOS's `SFSpeechRecognizer` and Android's `SpeechRecognizer` — exactly the "iOS/Android native
  recognisers via an Expo module" the design doc names. Config plugin added to `app.config.ts`
  with `microphonePermission`/`speechRecognitionPermission` strings, matching `expo-location`'s
  own existing plugin-config shape.
- **`lib/voice-capture-reducer.ts`**: a pure state machine —
  `idle → starting → listening → transcribed | no-speech | error`, plus `permission-denied` — over
  events the hook below translates from native ones. Unit-tested directly with plain event
  objects, no native mocking needed, the same value a pure function always has in this codebase.
- **`lib/voice-report-permission.ts`**: `obtainVoiceCapturePermission`, structurally almost
  identical to `obtainPushToken` (M6.6) — check the existing permission, request if not granted, a
  denial is a value (`{ ok: false, reason: 'denied' }`), not a thrown error.
- **`hooks/use-voice-report-capture.ts`**: the thin glue — wires `ExpoSpeechRecognitionModule`'s
  real `start`/`result`/`end`/`error` events (via `useSpeechRecognitionEvent`) and
  `fetchCurrentLocation` (already built, M5.4) into the reducer through `useReducer`. `start()`
  requests permission and the current GPS position concurrently, then calls the native module's
  own `start()` with `continuous: false, interimResults: false` (hands-free — nothing partial to
  read on screen while driving); `cancel()` calls `abort()` then resets, so `starting`/`listening`
  is never a dead end for a driver who changes their mind.
- **`app/active-trip.tsx`**: the mic button is wired for real — tapping while idle/transcribed/
  no-speech/error/permission-denied starts a new capture, tapping while starting/listening cancels
  it. A transcribed result shows "Heard: '…' — filing this report is coming soon" rather than
  doing anything with it yet.

17 new driver-app tests (`voice-capture-reducer.test.ts`'s 13, `voice-report-permission.test.ts`'s
4). 144 driver-app tests total (up from 127). `pnpm arch` clean (355 modules, 1225 dependencies).
`pnpm verify` green end to end. No component-level test for `active-trip.tsx` itself, matching
this app's existing convention (no screen has ever had one).

**Verified as far as it can be without a real device or dev build** — same boundary every prior
driver-app milestone touching a native module has hit (M6.6's push registration, M5.10's own
pending item). `expo-speech-recognition`'s native module has never actually run: covered by the
reducer's and permission helper's unit tests plus a clean typecheck/lint/`pnpm arch` run, not a
real microphone. Revisit once M5.10 unblocks a real device — that's also when the design doc's own
open question (real-world accent/cab-noise accuracy) finally gets a real answer, per this
session's decision when M7 planning started.

## Decisions from M7.2

96. **M7.2 stops at a transcript — no parse call, no filing.** The reducer's terminal
    `transcribed` state carries the transcript and the GPS origin captured at recording start, and
    nothing else happens to it. Splitting capture from parse-and-file (M7.3) keeps each task
    independently reviewable and lets the capture mechanics (permissions, native event handling)
    get proven before building UI on top of a result that might not be reliably shaped yet.
97. **Voice capture is modelled as a pure reducer over injected native events, not a single async
    function like `obtainPushToken`.** A capture session is inherently a sequence of events
    (start/result/error/end) arriving over time from the native module, not one call-and-response
    — `voiceCaptureReducer` is the "pure logic" half of the same split `push-registration.ts`
    established, just shaped to fit what this port actually looks like.
98. **A trailing `no-speech`/`end` signal only applies while `starting`/`listening`; every other
    state (`transcribed`, `error`, `permission-denied`) ignores it.** Caught while writing the
    reducer's own tests, not from a real device: the native module's `end` event fires after
    _every_ session, including ones that already got a final result or already errored, and a
    naive reducer would let that trailing signal silently clobber whichever real outcome arrived
    first.
99. **`cancel()` calls `ExpoSpeechRecognitionModule.abort()` then resets, and is reachable by
    tapping the mic button again while `starting`/`listening`.** Without it, a driver who taps the
    mic and changes their mind — or a recognizer that never reaches a natural end — would have no
    way back to `idle` until the native module decided to fire its own `end`/`error` event on its
    own schedule.
100.  **GPS origin capture is best-effort, not blocking.** A denied location permission or a failed
      fix doesn't stop voice capture from proceeding — `origin` just stays `undefined`, mirroring
      `report-hazard.tsx`'s own `effectivePin ?? location.point` fallback for the tap flow. M7.3's
      filing step will need the same fallback for whichever transcript arrives with no origin.

## Deviations and open items from M7.2

- **Not verified on a real device — no dev build or EAS project exists yet (M5.10).** Everything
  native-module-shaped here (permission prompts, the recognizer actually hearing speech, platform
  differences between iOS's `SFSpeechRecognizer` and Android's `SpeechRecognizer`) is unverified
  beyond a clean typecheck/lint and the pure logic's own unit tests. This is also what blocks the
  design doc's own "test real accents/cab noise cheaply" open question from getting a real answer.
- **No mid-capture "stop and use what you've got so far" action** — only start and full cancel.
  `continuous: false` + `interimResults: false` means the module itself has no partial result to
  finalize early, so this isn't a missing feature so much as a property of the chosen recognition
  mode; revisit if `interimResults: true` ever becomes worth the added complexity of streaming
  partial text.
- **The transcript is shown but never used** — M7.3 is where it gets sent to M7.1's parse endpoint,
  spoken back for confirmation, and (only on a yes) filed as a real `source: 'voice'` report.
- **No Bluetooth/steering-wheel media-button trigger.** Assessed and deliberately skipped for this
  task: `expo-speech-recognition` has no hook into hardware media-button events, and wiring one up
  would mean a second native integration (likely `react-native-track-player`-style media-session
  hooks, or a custom native module) — genuinely complicated, not "easy," so per this session's own
  M7-planning decision it's deferred rather than trialled now.

**M7.3 delivered:** design doc §7 steps 3-4 end to end — the driver-app half of voice reporting is
now a complete flow, not just capture. Tapping the mic captures a transcript (M7.2), sends it to
M7.1's parse endpoint, speaks a summary back, listens for a yes/no reply, then either files a real
`source: 'voice'` hazard report or saves an unconfirmed draft — never both, never neither.

- **`lib/voice-report-flow-reducer.ts`**: a pure state machine —
  `idle → capturing-report → parsing → speaking-summary → capturing-confirmation → filing → filed
| queued`, with `report-no-speech`, `draft-saved` and `error` as the other resting states. Fully
  unit-tested (18 cases) with no native mocking. `confirmation-yes`'s event carries an already-
  resolved `origin: MapPoint` (not optional) — the hook decides whether there's anywhere to put
  the pin _before_ dispatching, so the reducer itself never has to reason about "yes, but no
  location," keeping it simpler than the first draft of this file (see decision 102, below).
- **`lib/voice-report-summary.ts`**: builds the exact spoken summary design doc §7 step 4 gives as
  an example ("Low bridge, about 3.5 metres, here — save it?"), reusing `HAZARD_TYPE_LABELS` so
  voice and tap reporting always describe hazard types in the same plain words.
- **`lib/yes-no-parser.ts`**: a short, hard-coded word list (no second LLM round trip needed for a
  binary decision), word-boundary matched — a naive substring check would have read "I **know**
  where that is" as a "no" (caught by the tests, not by inspection: `know` contains `no`).
- **`hooks/use-voice-hazard-report-flow.ts`**: the orchestration — wraps `useVoiceReportCapture`
  (M7.2) and runs it a _second_ time for the confirmation reply, reusing its `no-speech` outcome
  as design doc §7 step 4's own "no answer within a few seconds" timeout, with no separate timer
  needed. `expo-speech`'s `Speech.speak()` drives the spoken summary; `onError` still dispatches
  `speech-done` (fails open — a broken TTS voice shouldn't also block listening for a reply).
  Filing reuses `report-hazard.tsx`'s exact offline-first path (`enqueueHazardReport` before ever
  touching the network, `useReportHazard`, left queued on failure for `useHazardQueueFlush` to
  retry) — voice and tap reports share the same durability guarantee.
- **`db/voice-draft-queue.ts`**: a new, separate local sqlite table (`voice_hazard_drafts`) for
  unconfirmed reports — deliberately not the same table `hazard-queue.ts` already auto-retries,
  since a draft has never been confirmed and must never be sent automatically. Stores the
  transcript, the parsed result and the origin captured (if any); M7.4 is the screen that will
  read, edit/discard or file these.
- **`app/active-trip.tsx`**: the mic button now drives the whole flow — tap to start, tap to
  cancel while listening (either capture session), disabled while working (parsing/speaking/
  filing), with the summary spoken back also shown on screen and a final status line ("Saved." /
  "Saved — this will be sent automatically once you're back online." / "Not filed — saved as a
  draft to review when you're parked.").

46 new driver-app tests (`voice-report-flow-reducer.test.ts`'s 18, `voice-report-summary.test.ts`'s
4, `yes-no-parser.test.ts`'s 3, `db/voice-draft-queue.test.ts`'s 5, plus `api/hazards.test.ts`
gaining 2 for `parseVoiceHazardReport`). 190 driver-app tests total (up from 144). `pnpm arch`
clean (365 modules, 1245 dependencies). `pnpm verify` green end to end. The orchestration hook
itself has no test of its own, matching this codebase's established convention (M6.6 decision 87's
own reasoning, restated by M7.2): a thin hook's job is fully covered once the pure functions
underneath it are, and no screen/hook in this app has ever had a component-level test.

## Decisions from M7.3

101. **An explicit "no", an unclear reply, a confirmation-capture failure, a timed-out silence,
     and a clear "yes" with nowhere to resolve a location are all the same outcome: an unconfirmed
     draft, never a lost report.** AGENTS.md's own safety rule ("Voice reports are never filed
     publicly without driver confirmation") only names the _positive_ case explicitly; this
     extends the same care to every negative one — a misheard "no" costs the driver nothing (the
     draft is still there to review when parked), where silently discarding a report they tried to
     make would.
102. **The reducer never sees `undefined` as a location — the hook resolves `origin ?? fallbackOrigin`
     before dispatching `confirmation-yes`, and dispatches `confirmation-declined` instead if
     neither exists.** An earlier draft had the reducer itself branch on "yes, but no origin" and
     route to `draft-saved` — moved into the hook once it became clear the _fallback_ (the live
     position `active-trip.tsx` already tracks) is itself a hook-level concern the reducer has no
     business knowing about; the reducer is simpler for treating "yes" as always having somewhere
     to file.
103. **The confirmation reply reuses `useVoiceReportCapture` a second time, rather than a separate,
     simpler "just listen for one word" mechanism.** The capture hook's own `no-speech`/`error`/
     `permission-denied` states already mean exactly what's needed here (a timeout, a mic fault, a
     revoked permission) — building a second, parallel listening mechanism would duplicate that
     for no benefit; the orchestration hook just has to track _which_ semantic phase a given
     capture session belongs to (report vs. confirmation), which it already needs regardless.
104. **Unconfirmed drafts live in their own sqlite table (`voice_hazard_drafts`), never
     `hazard_queue`.** The two tables look similar (id/payload/created_at) but mean opposite
     things: a `hazard_queue` row is _confirmed_, waiting only on connectivity, and
     `useHazardQueueFlush` sends it automatically the moment it can; a `voice_hazard_drafts` row
     has never been confirmed and must never be auto-sent — reusing one table for both would risk
     a drafts-review feature (M7.4) accidentally filing something a driver said "no" to, or the
     auto-flush accidentally sending an unconfirmed draft.
105. **`Speech.speak()`'s `onError` still advances the flow to listening for a reply, rather than
     surfacing an error.** A broken or missing TTS voice on some device is a real possibility this
     codebase has no way to test for locally; failing open (proceed to listening, just without the
     spoken confirmation actually being heard) keeps the flow usable — worse than a silent
     confirmation is a flow that gets stuck because narration itself failed.

## Deviations and open items from M7.3

- **Not verified on a real device, same gap as M7.2** — everything here is covered by the pure
  reducer/parser/summary unit tests plus a clean typecheck/lint/`pnpm arch` run, not a real
  microphone, a real TTS voice, or a real yes/no spoken back to a phone. This PR also carries the
  first real EAS development build + Android project setup (M5.10) attempted alongside it — see
  the README/M5.10 update once that build's outcome (and, ideally, a real device confirming this
  flow) is known.
- **The yes/no word list is English-only and untuned against real speech-to-text output** — same
  caveat M7.1's system prompt and M7.2's own capture code already carry: written against clean,
  typed-out phrasing, not the disfluent output a real recognizer produces from a driver's actual
  voice.
- **No test proves the two-table split (decision 104) end to end** — `db/voice-draft-queue.test.ts`
  and `db/hazard-queue.test.ts` each prove their own table works in isolation; nothing yet asserts
  that a declined voice report never appears in `hazard_queue`, or that `useHazardQueueFlush`
  never touches `voice_hazard_drafts`. Low risk (the code paths are entirely separate, never
  sharing a table name), but worth a dedicated test if M7.4 ever finds the two interacting
  unexpectedly.
- **M7.4 (the drafts review screen) landed the same session** — see below; this deviation is
  resolved.

**M7.4 delivered:** `app/voice-drafts.tsx` — the screen M7.3 built the storage layer for but left
unread. Reachable from `home.tsx` ("Saved reports"), it lists every `voice_hazard_drafts` row and
lets a driver, now parked, either file it for real or discard it.

- **`lib/voice-draft-to-report.ts`**: `reportRequestForDraft(draft, id, origin)` — a pure mapping
  from a saved draft to a real `ReportHazardRequest`, taking `id` and `origin` as arguments rather
  than generating them internally (a fresh UUID is an effectful `expo-crypto` call; `origin` may
  need the driver's current position as a fallback) so the mapping itself stays directly testable.
- **`api/use-voice-drafts.ts`**: `useVoiceDrafts` (a `useQuery` over `listVoiceHazardDrafts` — same
  shape as every remote list in this app, even though this one reads local SQLite, so the screen
  doesn't need a different pattern just because the data happens to be on-device),
  `useDiscardVoiceDraft`, and `useFileVoiceDraft`. Filing reuses the exact offline-first sequence
  every other report in this app follows — `enqueueHazardReport` before the network call — and
  removes the draft row once _enqueued_, not once _sent_: from that point the report is confirmed,
  and `useHazardQueueFlush` (decision 104's separate table) owns getting it there if the immediate
  send fails.
- **`app/voice-drafts.tsx`**: each row shows the hazard type, measurement, spoken position hint,
  the raw transcript (so a driver can judge whether the parse looked right before trusting it) and
  when it was captured, with "Report it" / "Discard" actions. A draft with no captured origin (GPS
  unavailable when recording started) falls back to the driver's current position
  (`useCurrentLocation`, reasonable here since this is explicitly a parked-use screen) — if that's
  also unavailable, "Report it" is disabled with a hint rather than silently failing.

7 new driver-app tests (`voice-draft-to-report.test.ts`). 193 driver-app tests total (up from 190).
`pnpm arch` clean (369 modules, 1264 dependencies). `pnpm verify` green end to end across the whole
monorepo.

**Verified as far as it can be without a real device** — same boundary every driver-app milestone
touching native storage/location has hit. `voice-draft-to-report.ts`'s mapping is unit-tested
directly; `use-voice-drafts.ts`'s hooks and the screen itself follow this app's existing
convention of no component-level test, covered instead by a clean typecheck/lint/`pnpm arch` run.

## Decisions from M7.4

106. **A draft's own captured origin is preferred over the driver's live position, but the live
     position is a real fallback, not just a UI hint.** `reportRequestForDraft` always takes
     whatever origin the caller resolves and never reaches for `useCurrentLocation` itself — the
     screen resolves `draft.origin ?? location.point` before calling it, keeping the pure function
     ignorant of where a location ultimately came from, the same separation of concerns M7.3's
     decision 102 established for the live confirm flow.
107. **Filing from the drafts screen removes the draft row as soon as the report is _enqueued_,
     not once it's confirmed _sent_.** Waiting for a successful network response before removing
     the draft would mean a driver who reports from a draft while still offline sees it vanish
     from "saved reports" only to silently reappear if they refresh before connectivity returns
     — worse, it would leave the _same_ report sitting in both `voice_hazard_drafts` and
     `hazard_queue` at once, which decision 104 specifically exists to prevent. Once enqueued, the
     report is confirmed and belongs entirely to `hazard_queue`'s own retry story.

## Deviations and open items from M7.4

- **No editing.** A driver can file a draft as-is or discard it, but can't correct a misheard type
  or measurement before filing — design doc §7 doesn't ask for this explicitly ("review later when
  parked" implies looking it over, not necessarily editing it), and the tap-to-drop screen already
  exists as the fallback for "the voice parse got this wrong, let me just redo it properly." Worth
  revisiting if testers find themselves discarding-then-re-reporting by hand often.
- **Not verified on a real device** — same gap as M7.1-M7.3. `voice-drafts.tsx` has never actually
  displayed a real saved draft on a real phone, filed one for real, or exercised the "no location
  available, button disabled" branch against a real GPS-off phone.
- **This closes M7's own task breakdown** (M7.1-M7.4 all done) — voice reporting is now a complete
  feature end to end in code, pending the same real-device verification every M7 task has deferred.
  Real-world accent/cab-noise testing (the design doc's own open question) remains the single
  biggest unknown, unaddressed by anything unit tests can cover.
