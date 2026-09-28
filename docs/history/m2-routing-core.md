# M2 Routing core

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

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
