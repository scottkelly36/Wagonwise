# P2-M6: live fleet map

Scoped 2026-10-03 from the Phase 2 tech design doc §6. Sliced like P2-M5.

| Slice | Scope                                                             | Status            |
| ----- | ----------------------------------------------------------------- | ----------------- |
| M6.1  | Driver app reports position during a job; core stores + serves it | Done — 2026-10-03 |
| M6.2  | The map on the dashboard's Live trips page (polling, not SSE)     | Done — 2026-10-03 |
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

On the owner's note about the earlier app Apple blocked (2026-10-03): the objection was a tracker that
did nothing else and could not be switched off. This app does other things, tracks only during an
accepted job with the app open, and the driver is told; the remaining similarity is that a driver
cannot refuse tracking for a job they accept (they can still revoke location permission in the
phone's settings, and the app keeps working without it). That is the first thing to soften if a
reviewer pushes back.

## M6.2: the map

- **Polling, not server-sent events** (a deviation from design doc §6). A browser `EventSource` can't
  send the `Authorization` header these routes need, and drivers only report every 30 s, so a push
  stream wouldn't show anything fresher than polling every 10 s. Revisit if the dashboard ever
  needs sub-second updates, or if many firms make the polling load matter.
- **Live trips page** (`pages/fleet/LiveTrips.tsx`): a MapLibre map (`components/FleetMap.tsx`) and a
  list of the company's jobs that are on the road (`accepted` to `at_delivery`). Per job: reference,
  driver and vehicle (when the viewer holds `dispatch`, same gate as the Jobs page), status, the stop
  it is heading for, and **last seen**: green under 2 min, amber under 10, grey after
  (`lib/live-map.ts`, tested). Selecting a job centres the map and shows its pickup and delivery. A
  job with no position yet is listed as "No position yet".
- **"Last seen" matters** because positions only arrive while the driver's app is open (M6.1), so the
  page says so rather than letting a stale dot look live.
- **Loaded lazily** (MapLibre is about 1 MB): the rest of the dashboard's bundle is unchanged.
- **Map tiles:** `VITE_MAPTILER_API_KEY` (build time) or MapLibre's keyless demo style (country
  outlines only). The driver app's MapTiler key can be reused; restrict it to the dashboard's
  origin in MapTiler.
- **Dev note:** `vite.config.ts` excludes `maplibre-gl` from dependency pre-bundling, or its worker
  fails to load in `pnpm dev` ("Worker failed to load"). Clear `node_modules/.vite` after changing it.
- **Verified:** typecheck, lint, tests (41 in the dashboard) and the production build (the worker is
  emitted as its own file). The map component rendered and marker selection worked in the browser
  pane against sample data. **Not** seen with real positions: that needs a driver on a job with the
  app, and the key set for real tiles.
- **Not done:** ETA, the reroute-alert indicator, trails (M6.3), route lines on the map.
