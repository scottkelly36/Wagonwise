# Progress

## Status

| Milestone            | Status            |
| -------------------- | ----------------- |
| M1 Foundations       | Done — 2026-09-22 |
| M2 Routing core      | In progress       |
| M3 Hazards core      | Not started       |
| M4 Driver BFF + auth | Not started       |
| M5 Driver app        | Not started       |
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

| #    | Task                                                   | Status            |
| ---- | ------------------------------------------------------ | ----------------- |
| M2.1 | Verify Valhalla against a real extract                 | Done — 2026-09-22 |
| M2.2 | `routing` module skeleton + `VehicleProfile`           | Done — 2026-09-22 |
| M2.3 | `RoutingEngine` port + Valhalla adapter                | Not started       |
| M2.4 | `applies(obstruction, dimensions)`                     | Not started       |
| M2.5 | `PlanRoute` use case + avoided-restriction explanation | Not started       |
| M2.6 | Golden-route tests                                     | Not started       |

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

## Environment notes

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

## Next session

**M2.1 and M2.2 are done — Valhalla is verified against real tiles, and `VehicleProfile` CRUD is
live in core. M2.3 (`RoutingEngine` port + Valhalla adapter) is next.** The adapter has a real
running Valhalla instance to build against now (M2.1), not a stub: translate `Dimensions` into
Valhalla's truck costing params (height/width/length/weight/axle_load — already proven to work
in M2.1's smoke test) and `GeoPolygon[]` into `exclude_polygons` (also already proven to force a
real detour). After that: M2.4 (`applies()`, the safety-critical one — pure, exhaustively tested,
no I/O), M2.5 (`PlanRoute` use case + the avoided-restriction explanation from design doc §4's
two-query diff, which will finally give `VehicleProfile` a consumer beyond CRUD), M2.6
(golden-route tests, run nightly per the CI tiering decision). Two real gaps from M2.2 worth
closing before drivers touch this for real: no BFF wiring for routing yet, and `driverId` is a
trusted plain field with no token-derived verification (both recorded as M2.2 deviations, above;
the latter is a real access-control gap, not just an unfinished nicety — close it before M4
exposes routing to real drivers). The open question "how complete is OSM restriction data on
testers' actual routes around Hexham?" (Open questions, above) is worth revisiting once M2.4/M2.6
are testing against real restriction tags in this same extract.
