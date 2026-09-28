# M3 Hazards core

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

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
