# M4 Driver BFF + auth

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

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
