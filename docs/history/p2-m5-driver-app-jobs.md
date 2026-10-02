# P2-M5: jobs in the driver app

Scoped 2026-10-02 from the Phase 2 tech design doc §5 ("Driver app additions") and P2-M3/M4's
own notes deferring "the driver's own endpoints and the driver-bff proxy" to this milestone.
Split into session-sized slices rather than one pass, matching the project's usual style
(`history/p2-m2-driver-links.md`).

| Slice | Scope                                                       | Status            |
| ----- | ----------------------------------------------------------- | ----------------- |
| M5.1  | Driver job routes (core) + driver-bff proxy, no app changes | Done — 2026-10-02 |
| M5.2  | Driver app: "my current job" screen, tap-to-advance         | Not started       |
| M5.3  | Voice status updates ("loaded and leaving")                 | Not started       |
| M5.4  | Geofence nudges (arrival confirm)                           | Not started       |
| M5.5  | Proof of delivery (photo/signature)                         | Not started       |

## M5.1: driver job routes + driver-bff proxy

**What was already there:** `jobs/application/change-job-status.ts`'s `advanceJobStatus`/`failJob`
already accepted a `{ kind: 'driver', driverId }` actor and enforced the right rules
(`authorization.ts`'s `canAdvance`/`canSeeJob`) — built with this milestone in mind, so no
application-layer change was needed for status changes. `JobRepository.findActiveForDriver`
already existed too. What was missing was everything connecting a driver's own request to that —
routes, a data scope, and the RLS to back it.

**The real gap, found by research before starting:** `jobs.jobs`' Row-Level Security policy
(0026_jobs.sql) only knew about `company`/`platform` scopes. A request run in the `driver` scope
(same scope fleet's own driver routes use, P2-M2.5) would have seen zero rows, even though the
application layer already permitted it — the second of RLS's "two layers of protection" (design
doc §4) wasn't there yet.

**What this slice added:**

- `migrations/0030_jobs_driver_rls.sql`: adds `or driver_id = public.rls_driver_id()` to
  `jobs.jobs`'s policy, reusing the function `0028_fleet_driver_links.sql` already defined for
  exactly this purpose. No new session variable or `DataScopes` machinery.
- `jobs/application/ports/directories.ts`: a `DriverIdentityDirectory` port (same shape as
  fleet's own), for resolving a driver's identifier — needed by the `driver` data scope, not by
  jobs' own authorization (which only needs `driverId`).
- `jobs/application/list-jobs.ts`: `getCurrentJob` — a thin wrapper over
  `findActiveForDriver`, since the existing `getJob`/`listJobs` take a `Caller` (staff-shaped),
  not the `JobActor` union, and can't be reused for a driver caller. No authorization check
  needed here: RLS already scopes the row.
- `jobs/interface/dto.ts`: `jobDto` extracted out of `routes.ts` so both the staff and driver
  route files produce the same shape.
- `jobs/interface/driver-routes.ts`: `GET /jobs/current`, `POST /jobs/:id/status`,
  `POST /jobs/:id/fail` — the `asDriver` helper is fleet's own driver-routes pattern verbatim
  (401 without a driver token, run in the `driver` data scope). Deliberately **no** `/assign` or
  `/cancel` driver route — those stay dispatcher-only; a driver hitting them gets a 404 (no route
  registered), not a 403.
- `host/build-app.ts`: `/jobs/` added to `DRIVER_AUTH_PREFIXES`, so `request.driverId` is
  populated for these routes the same way it is for `/fleet/`.
- `packages/contracts/src/jobs.ts`: `currentJobResponseSchema` (`{ job: JobDto | null }`) — every
  other schema needed (`advanceJobStatusRequestSchema`, `failJobRequestSchema`,
  `jobIdParamsSchema`) was already actor-agnostic and reusable as-is.
- `apps/driver-bff/src/jobs-routes.ts`: proxies the three routes, same shape as `fleet-routes.ts`.

**Verified:** `pnpm verify` green (1016 core tests, including a new `jobs driver scope (migration
0030)` block in `composition/row-level-security.test.ts` proving the RLS predicate against real
Postgres, and a new "the driver on the job" case in
`composition/jobs-dispatch-end-to-end.test.ts` exercising create → assign → driver-advance → RLS
refusing another driver → no route for assign/cancel, all through the real HTTP routes and real
`DataScopes`). The migration was also applied to the local dev database directly, cleanly.

**Not done, deliberately:** anything in `apps/driver-app` — no Jobs tab, no screen, no store. The
design doc's "Jobs tab: today's **and upcoming** jobs" (plural) isn't backed by the domain model
either way: a driver can only ever have one active job (`ACTIVE_STATUSES`/`DriverBusy`), so M5.2's
screen will show "my current job," not a list — worth a decision-log entry once that slice starts,
not a correction to the design doc itself.
