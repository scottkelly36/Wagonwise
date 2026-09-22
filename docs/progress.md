# Progress

## Status

| Milestone            | Status                       |
| -------------------- | ---------------------------- |
| M1 Foundations       | In progress — M1.1–M1.5 done |
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

| #    | Task                                 | Status            |
| ---- | ------------------------------------ | ----------------- |
| M1.1 | Monorepo skeleton                    | Done — 2026-09-21 |
| M1.2 | Architecture enforcement             | Done — 2026-09-21 |
| M1.3 | Core skeleton + shared kernel        | Done — 2026-09-21 |
| M1.4 | Database, migrations, docker compose | Done — 2026-09-22 |
| M1.5 | `identity` as reference module       | Done — 2026-09-22 |
| M1.6 | `driver-bff` + vertical slice        | Next              |
| M1.7 | CI (GitHub Actions per-PR tier)      | Not started       |

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

- **`packages/contracts` doesn't exist yet** — identity's request bodies are validated with zod
  schemas defined inline in `interface/routes.ts`, marked as core-only until M1.6 introduces the
  shared package. Expect to delete these and import from `packages/contracts` instead.
- **No real SMS/email `OtpSender`.** Needs a provider decision (Twilio? AWS SNS? Vonage?) and an
  account — worth raising before M4 (Driver BFF + auth) needs testers to actually receive codes
  on real phones with patchy Hexham signal.
- **No invite-code-issuing endpoint or admin tooling.** Seed via SQL for now (README). Revisit
  if manually running `psql` for every tester becomes annoying before a staff portal exists.
- **The invite-code-redemption race is a thrown exception, not a `Result`.** If two `verifyOtp`
  calls for the same brand-new invite code land within the same narrow window, the loser gets an
  unstructured 500 rather than a clean domain error — accepted as vanishingly unlikely at Phase
  1's under-30-testers scale, not engineered around.
- **`X-Internal-Key` service-to-service auth (decision 11) is not wired.** Identity's routes are
  reachable by anything that can reach core's port; nothing enforces "only the BFF calls this"
  yet, because there is no BFF and no network boundary to defend. Comes with M1.6/M4.

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

**M1.6 — `driver-bff` + vertical slice.** A new app, `apps/driver-bff`: a thin Fastify service
that verifies access tokens against identity's JWKS (decision 1 — the BFF can verify, it cannot
mint) and forwards to core over `X-Internal-Key`-secured private networking (decision 11, not
wired yet — this is where it gets wired). `packages/contracts`: zod schemas for identity's
request/response shapes, replacing the inline ones in `apps/core/src/modules/identity/interface/
routes.ts` (M1.5 deviations, above) — the first real use of "shared across app/BFF/core" rather
than a promise about it. One vertical slice end to end (driver app or curl → BFF → core → real
Postgres) proves the wiring before M2 adds routing behaviour. Then **M1.7** (CI) closes out M1
Foundations.
