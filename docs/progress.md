# Progress

## Status

| Milestone            | Status            |
| -------------------- | ----------------- |
| M1 Foundations       | Done — 2026-09-22 |
| M2 Routing core      | Done — 2026-09-22 |
| M3 Hazards core      | Done — 2026-09-22 |
| M4 Driver BFF + auth | Done — 2026-09-22 |
| M5 Driver app        | In progress       |
| M6 Alerts            | Not started       |
| M7 Voice             | Not started       |
| M8 Field-ready       | Not started       |

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
| M5.6  | Active trip screen (no voice/reroute yet — M6/M7)                                                                    | Not started       |
| M5.7  | Report hazard (tap) + hazard detail                                                                                  | Not started       |
| M5.8  | Offline hazard queue (expo-sqlite)                                                                                   | Not started       |
| M5.9  | Feedback screen                                                                                                      | Not started       |
| M5.10 | Real-device/simulator verification both platforms; EAS Build → TestFlight + Play internal                            | Not started       |

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
