# P2-M6: live fleet map

Scoped 2026-10-03 from the Phase 2 tech design doc §6. Sliced like P2-M5.

| Slice | Scope                                                             | Status            |
| ----- | ----------------------------------------------------------------- | ----------------- |
| M6.1  | Driver app reports position during a job; core stores + serves it | Done — 2026-10-03 |
| M6.2  | staff-bff SSE stream + the map on the dashboard's Live trips page | Not started       |
| M6.3  | ETA, "last seen" ageing, reroute-alert indicator                  | Not started       |

## Privacy and store review (read before touching tracking)

The owner's note (2026-10-03): a previous employer's app was blocked by Apple over live tracking
of something similar. Apple (and Play) object to tracking the user doesn't know about, tracking
that runs when it isn't needed, and background tracking without a clear justification. So M6 is
deliberately the narrowest version that works:

- **Foreground only, "When In Use" permission only.** No `Always` permission, no
  `UIBackgroundModes: location`, no background task. When the app is closed or the phone is
  locked the map shows "last seen", not a position. Adding background tracking later is a
  separate decision: it needs the `Always` prompt, a background-mode justification in review, and
  Play's prominent-disclosure rules. Don't add it without revisiting this section.
- **Only while the job is on the road.** Core refuses (`NotTracking`, 409) a position unless the job
  is `accepted`..`at_delivery`, so this is enforced on the server and not just by the app. Not when
  `assigned` (the driver hasn't taken it), not once delivered/cancelled/failed.
- **The driver is told, three times.** First-run consent screen (a paragraph about company jobs);
  the iOS permission prompt text (`app.config.ts`'s `locationWhenInUsePermission`, native, ships
  with the next build); and a line on the job screen whenever tracking is on
  ("Your company can see where you are while this job is on the road").
- **Server clock, ranges checked, RLS on the table** (`jobs.job_positions`, migration 0032).

Checklist for the first App Store submission: App Privacy "nutrition label" must declare precise
location, linked to the user, used for app functionality (and shared with the user's employer);
the privacy policy must say the same; the review notes should explain that tracking is
foreground-only, only during an accepted company job, and disclosed in the app. A test job and
company login for the reviewer will probably be needed to see it.

## M6.1: what was added

- **Core:** `POST /jobs/:id/position` (driver, 204) and `GET /staff/jobs/companies/:companyId/positions`
  (anyone who can see the company's jobs; the newest position per job that is on the road).
  `jobs.job_positions` (migration 0032), `JobPositionRepository` (Postgres + in-memory),
  `recordJobPosition` / `listJobPositions`, `isTracked` in the job domain.
- **driver-bff / staff-bff:** a forward each.
- **Driver app:** `useJobPositionReporting`, mounted on `/home` beside the arrival geofence. Reuses
  the position `useLiveLocation` already watches (no second watch, no extra permission). Sends every
  30 s from a timer, not on each update, so a parked driver still shows as there. A failed report is
  skipped: a late position is worthless, so there is no queue.
- **Tests:** HTTP routes both sides, the Postgres query against a real database, and RLS (a driver
  can write positions only for their own job; each company sees only its own).

## Open

- **No retention sweeper.** Rows are meant to be short-lived (design doc §9: ~30 days) but nothing
  deletes them yet — the same "how often, run where" decision as the hazard expiry poller (see
  `progress.md`). Until then positions accumulate at one row per 30 s per driven job.
- **iOS purpose string and consent paragraph** are changed but unshipped: they need the next native
  build (app `version` bump) and, for the consent screen, `eas update`.
- The driver cannot decline sharing while keeping the job. Today accepting a job is accepting
  tracking for it; if a firm's drivers object, a per-driver switch is the place to start.
