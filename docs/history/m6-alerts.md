# M6 Alerts

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

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
