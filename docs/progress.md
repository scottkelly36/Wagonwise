# Progress

## Status

| Milestone            | Status            |
| -------------------- | ----------------- |
| M1 Foundations       | Done — 2026-09-22 |
| M2 Routing core      | Done — 2026-09-22 |
| M3 Hazards core      | In progress       |
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
| M3.4 | `interface/`: HTTP endpoints, wired into `composeCore`                                      | Not started       |
| M3.5 | `HazardAvoidanceQuery` read-model port + on-route PostGIS query, wired into `PlanRoute`     | Not started       |

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

## Next session

**M2 Routing core is done (M2.1–M2.6).** `VehicleProfile`, `RoutingEngine`, `applies()` and
`PlanRoute` are all real and verified against a live Valhalla instance; golden-route tests guard
the whole pipeline nightly. **M3 (Hazards core) is next** per the design doc's milestone table —
read `docs/phase-1-tech-design.md`'s hazards sections (§3, §5) before starting it, the same way
M2 started from a fresh read of §4.

Real gaps carried forward from M2, worth closing before drivers touch this for real:

- **No BFF wiring for routing** (M2.2) — `apps/driver-bff` has no routing routes yet.
- **`driverId` is a trusted plain field, no token-derived verification** (M2.2) — a real
  access-control gap, not just an unfinished nicety. Close before M4 exposes routing to real
  drivers.
- **No community-hazard avoidance** (M2.4/M2.5) — `PlanRoute` always calls `RoutingEngine` with
  `avoid: []`. M3 building `hazards` is what unblocks this: a `HazardAvoidanceQuery` read-model
  port in `routing/application/ports/`, an adapter in `routing/infrastructure/` calling
  `hazards/api.ts` and translating (design doc §3 — routing never sees a `HazardReport`), then
  `applies()` (M2.4, already built and tested) filters what it returns.
- **No `routing.restriction_overrides` ingestion** (M2.5, confirmed still separate in M2.6) — the
  avoided-restriction explanation's real blocker. Unscheduled; consider raising it as its own
  task once M3 is underway, since "what does OSM restriction data actually look like around
  Hexham" is a question M3's own hazard-reporting work may shed light on too (community reports
  are explicitly the long-term fix for gaps in this data, per design doc §4).

The open question "how complete is OSM restriction data on testers' actual routes around Hexham?"
(Open questions, above) is still unanswered — M2.6 deliberately didn't investigate it (see the
M2.6 decision above), so it's worth deciding when to actually pick it up rather than letting it
sit indefinitely.
