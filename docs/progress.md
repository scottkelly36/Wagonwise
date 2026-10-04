# Progress

**Read this file first; it's deliberately short.** It holds current status, what's next, and
what's still open. Finished milestones' task breakdowns, decisions and deviations live in
`docs/history/` (index at the bottom) — open one only when working in that area.

**Keeping it short:** keep this file under ~150 lines. While a milestone is active, its breakdown
and decisions go in its own `docs/history/<milestone>.md` from the start, with a one-line
summary and any still-open items here. When an item closes, delete it from this file; the
history file keeps the record.

## Status

| Milestone                          | Status                                   | Detail                                 |
| ---------------------------------- | ---------------------------------------- | -------------------------------------- |
| M1 Foundations                     | Done — 2026-09-22                        | `history/m1-foundations.md`            |
| M2 Routing core                    | Done — 2026-09-22                        | `history/m2-routing-core.md`           |
| M3 Hazards core                    | Done — 2026-09-22                        | `history/m3-hazards-core.md`           |
| M4 Driver BFF + auth               | Done — 2026-09-22                        | `history/m4-driver-bff-auth.md`        |
| M5 Driver app                      | In progress — only M5.10 left            | `history/m5-driver-app.md`             |
| M6 Alerts                          | Done — 2026-09-24                        | `history/m6-alerts.md`                 |
| M7 Voice                           | Done — 2026-09-24                        | `history/m7-voice.md`                  |
| M8 Field-ready                     | In progress — partly shipped 2026-09-25  | below (no breakdown written yet)       |
| M9 Route options & safe parking    | Done — 2026-09-27                        | `history/m9-route-options-parking.md`  |
| Phase 2 / `apps/dashboard`         | Started early — admin scaffolding only   | below, and the Phase 2 tech design doc |
| P2-M1 Orgs, roles, RLS, staff auth | Done — 2026-10-01                        | `history/p2-m1-organisations-auth.md`  |
| P2-M2 Fleet                        | Done — 2026-10-02                        | `history/p2-m2-driver-links.md`        |
| P2-M3 Jobs core                    | Done — 2026-10-02                        | below                                  |
| P2-M4 Jobs in the portal           | Done — 2026-10-02                        | `history/p2-m4-portal-jobs.md`         |
| P2-M5 Jobs in the driver app       | Code-complete 2026-10-03 — needs a build | `history/p2-m5-driver-app-jobs.md`     |
| P2-M6 Live fleet map               | Done — 2026-10-03 (M6.4c deferred)       | `history/p2-m6-live-map.md`            |

## Next up

1. **P2-M5 is code-complete (2026-10-03).** M5.5b added the driver app's "Take photo" card at the
   delivery stop and an offline upload queue. It brings a new native dependency
   (`expo-image-picker`) and the camera permission, so app `version` is now 1.1.0 and it **needs a
   fresh `eas build`** before it works on a device (`eas update` won't carry it). Not yet run on a
   real device. See
   `history/p2-m5-driver-app-jobs.md`. Not built yet in Phase 2: dispatch, live
   map, moderation, reports.

## Open items (verified against the code 2026-09-28)

- **Deferred, P2-M6.4c**: a reroute-alert indicator on the live map. Needs reroute detection written
  for company jobs first (it only exists for Phase 1 trips). Revisit if the pilot firm wants it.
  Also open from M6: no retention sweeper for `jobs.job_positions` (same decision as the hazard
  expiry poller), and no Valhalla-backed check of the ETA and route preview yet.
- **M5.10**: Android real-device run done 2026-09-25. iOS real-device run and EAS Build →
  TestFlight + Play internal still open, blocked on the Apple/Google developer accounts.
- **M8 Field-ready**: shipped 2026-09-25 (commit `6f8fa52`, never written up here at the time):
  consent gate (`POST /identity/consent`), delete account (`DELETE /identity/account`),
  migration 0011, and the curated `routing.restriction_overrides` mechanism (migration 0010),
  applied in `plan-route.ts` through `applies()`. Still open: the actual test-area restriction
  audit (entering override data for testers' routes), store distribution (same block as M5.10),
  and onboarding the first driver.
- **No hazard expiry poller.** `expireHazards` exists and is tested, but nothing runs it on a
  schedule. Routing is safe regardless (`isExpired()` is checked live), but expired hazards still
  show as `active` on the map. Needs a "how often, run where" decision.
- **Real-device gaps**: voice reporting (M7) hasn't been tested on iOS, and accent/cab-noise
  accuracy is still the biggest unknown. Map markers (hazards, congestion, parking) have only
  been checked against MapLibre's docs.
- **Push notifications** need an EAS project id, so they're deferred with M5.10.
- **P2-M2.7** (driver app "join a company" screens) is code-complete and JS-only but not yet
  shipped via `eas update` or checked on a real device.

## Open questions

| Question                                                                      | Status                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| How complete is OSM restriction data on testers' actual routes around Hexham? | Open. Overrides mechanism exists (M8); the audit itself hasn't been done |
| On-device speech recognition good enough with local accents and cab noise?    | Open. Only field-tested informally on Android                            |
| iOS, Android or both for the first testers?                                   | Resolved at M5: both                                                     |

Decided 2026-09-21, revisit with testers: temporary hazard expiry 7 days; single unconfirmed
reports visible immediately, labelled "1 report, unconfirmed".

## Phase 2 (staff / control portal)

Plan: the [Phase 2 tech design doc](https://claude.ai/artifact/LK2oYrVSwotj7E8W9tXykD)
(milestones P2-M1 … P2-M9, decision log). Built early, ahead of its sequencing, because an admin
surface was needed straight away:

- `apps/dashboard` (Vite + React). Since P2-M1.12c it uses staff accounts only (email,
  password, second factor) through `apps/staff-bff`.
- `companies` module (own migration).
- Admin screens: Companies, Invite Codes (generate/list), Hazard Reports (list/delete —
  replaced the driver app's delete button).

- **Fleet vehicles (PR #48, early P2-M2):** `fleet` module (company vehicles with dimensions,
  migration 0019), Vehicle Profiles page. Its interim driver `scopes` were replaced by staff
  privileges at P2-M1.12c (migration 0025 drops them).

- **Driver links (P2-M2.1-2.8, done 2026-10-02):** `fleet.driver_links` + `fleet.company_codes`
  (migration 0028) — a driver joins a company by invite or company code, staff approve, and a
  driver can be active with several companies at once. Staff routes + the dashboard's Drivers
  page (M2.6), driver app screens (M2.7), and the cut-over (M2.8: jobs reads active links
  instead of the old single `drivers.company_id`, which migration 0029 then drops, along with
  the driver-accounts admin screen). See `history/p2-m2-driver-links.md`.

- **Jobs — P2-M3 (done 2026-10-02):** `jobs` module (migrations 0026-0027). The `Job` model with a
  forward-only status machine (draft → assigned → accepted → at pickup → loaded → en route → at
  delivery → delivered, plus cancel and fail), and create / list / get / assign / advance /
  cancel / fail as use cases and staff routes under `/staff/jobs/*` (gated by the `dispatch`
  privilege). A driver can be on one active job at a time (checked in `assignJob`, and backed by a
  partial unique index). `JobCreated`, `JobAssigned`, `JobStatusChanged`, `JobCompleted` and
  `JobCancelled` go to the outbox; nothing handles them yet (the push to the driver is M5).
  Driver and vehicle must belong to the job's company, read through jobs' own directory ports
  (driver via `fleet.driver_links`' active status, since P2-M2.8; originally the single
  `drivers.company_id`). Deliberately **not** in M3: route planning from the vehicle's dimensions on assign
  (routing only plans from a driver's own profile today, so it needs a routing change, still not
  done), the driver's own endpoints and the driver-bff proxy (M5). `composition/jobs-dispatch-end-to-end.test.ts`
  runs the whole flow as `wagonwise_app` under real RLS and `DataScopes`.

- **Jobs in the portal — P2-M4 (done 2026-10-02):** the dashboard's new Jobs page
  (`pages/fleet/Jobs.tsx`) — list, create (one pickup + one delivery stop), assign a driver and
  vehicle, cancel — over five new staff-bff forwards onto P2-M3's existing routes. Anyone at the
  company can see the list; creating, assigning and cancelling need `dispatch`. See
  `history/p2-m4-portal-jobs.md`. Not done: route preview before assigning (design doc §5 step 2,
  needs the routing change noted above), multi-stop jobs, a job detail/status-timeline view.

Staff accounts, RLS, staff auth + 2FA are P2-M1 (above). Not built: the rest of Phase 2 (dispatch,
live map, moderation, reports).

## Standing rules learned the hard way

- **Never run `doctl apps update --spec`.** It replaces the whole spec and wiped `core`'s
  `DATABASE_URL` once (2026-09-27). Deploy with `doctl apps create-deployment`. Migrations run
  automatically as a `PRE_DEPLOY` job (`docs/deployment-guide.md`, bug #4).
- **Golden routes must be re-recorded after any routing-cost change** (e.g. the 55 mph cap, PR
  #38). Every nightly run prints `golden actual:` values; see
  `valhalla-routing-engine.golden-test.ts`.

## Recent log

- 2026-10-04: database pools now have an error handler. CI failed once on a dashboard-only PR with
  two "unhandled errors" (`terminating connection due to administrator command`, from
  `row-level-security.test.ts`) although every test passed. node-postgres re-emits an idle
  connection's failure on the pool, and with no listener Node treats it as an uncaught exception.
  The production pool (`platform/db.ts` `createPool`) had the same gap, so a database restart or
  dropped idle connection could have crashed core. `attachPoolErrorHandler` logs it and carries on;
  the composition tests that build their own pools use it too. Test-only pools inside modules
  (`*/infrastructure/testing/db-for-tests.ts`) still have none: modules may not import `platform/`.

- 2026-10-04: dashboard company pickers. WagonWise staff choose a company by name from a dropdown
  (`CompanySelect`) when inviting a user, and in the company filters on Users and Activity, instead of
  pasting a company id. The Users "Account" column shows the company name. Jobs, Drivers and Vehicles
  already had a dropdown. Dashboard only; not checked against a live backend.

- 2026-10-04: dashboard on a phone, and owners who also drive. Under 800 px the menu is a drawer
  opened from a button in the top bar; under 700 px each list row becomes a labelled card (sorting
  moves to a dropdown), Assign and Cancel are full-width, Live trips stacks map over list, and
  controls are at least 44 px with 16 px text. Drivers page gains "Add me as a driver" for fleet
  staff: it invites their own email through the existing invite route (no backend change). The
  owner still accepts it in the driver app, because accepting needs their driver account, which is
  separate from their staff sign-in and may not exist yet (a first app sign-in needs an invite
  code from WagonWise). They show as "(you)" in the Assign list. Not done: one sign-in for both
  accounts. Checked on a throwaway page at 375 px wide with mock data, not against a live backend.

- 2026-10-04: dashboard polish, from the owner's first look. Create forms (invite a user, Jobs,
  Vehicles, Companies, invite a driver) no longer just disable their button: it stays clickable and
  each missing or wrong field gets a message under it, with the first one focused. The Jobs form is a
  labelled grid, so the postcode look-up line no longer shifts things. Every list is now one shared
  `DataTable`: sortable headers that stay pinned while rows scroll, search, paging past 25 rows, and
  round edit and delete buttons. Live trips opens on the whole of the UK and says when no vehicle is on
  the road. The "cream square" on Live trips is the keyless demo map, which has no roads: it needs
  `VITE_MAPTILER_API_KEY`, still not set. Dashboard only, no backend change. Not looked at against a
  live backend (only a throwaway page with mock data).

- 2026-10-03: P2-M7.2 done: reporter trust (derived from approved, rejected and dismissed reports;
  new reporters are neutral) and the routing hold. A blocking report is now ignored by routing only
  if its reporter has a poor record AND it has no measurement, no confirmations and no moderator
  approval. The "major road" condition was dropped (no road class in core). The moderation queue
  shows trust and which reports are held back. This is the only place routing got less cautious. See
  `history/p2-m7-moderation.md`.
- 2026-10-03: routing now chooses the road with no speed cap and times it with the 55 mph cap
  (`/route` then `/trace_route`). The cap was making trucks take back roads instead of the A69, found
  from the owner's Hexham to Hebburn report; width was not the cause. Golden routes re-recorded and a
  Heddon-on-the-Wall regression test added. Needs the droplet's Valhalla trace limits raised for
  routes over 200 km (`docs/deployment-guide.md` section 8). Check Hexham to Hebburn after deploy.
- 2026-10-03: vehicle profile form warns (never blocks) about figures unusual for a UK lorry: width
  over 2.6 m, height over 4.95 m, length over 18.75 m, weight over 44 t, axle over 11.5 t. Prompted
  by a Hexham to Hebburn route on back roads from a test profile with a 4 m width, which routing
  treats literally. JS-only, so `eas update`. Cause of that route not yet confirmed; see the routing
  note in `docs/ideas.md`.
- 2026-10-03: P2-M7.1 done: the hazard moderation queue. WagonWise staff see new blocking-type and
  disputed reports on a new **Moderation** page and can approve, reject, edit or set permanent/
  temporary, each recorded with who and what changed (migration 0033). Routing is unchanged. M7.2
  (see above) followed. See `history/p2-m7-moderation.md`.
- 2026-10-03: P2-M6.4b done: on the Jobs page, choosing a vehicle for a draft job now shows how far
  and how long the job is for that vehicle, or that it has no route (`POST /staff/jobs/:id/route-preview`).
  Advice only; assigning is not blocked. Not yet checked against a real Valhalla. Only the reroute
  indicator (M6.4c) is left in M6. See `history/p2-m6-live-map.md`.
- 2026-10-03: P2-M6.4a done: route estimates for company jobs. `routing.estimateRoute`,
  `fleet.getVehicleDimensions`, a cached `JobRouteEstimator` in jobs, `GET .../etas`, and the Live
  trips list now shows each vehicle's journey time and arrival, with its route drawn on the map.
  Not yet checked against a real Valhalla. Route preview on assign (b) and a reroute indicator (c)
  remain. See `history/p2-m6-live-map.md`.
- 2026-10-03: P2-M6.3 done, narrower than the design doc: the Live trips list shows each vehicle's
  straight-line distance to its next stop. ETA and the reroute-alert indicator moved to a new M6.4
  (route planning for jobs): they need a planned route per company job, which doesn't exist yet and
  is also the parked "route preview". See `history/p2-m6-live-map.md`.
- 2026-10-03: P2-M6.2 done: the dashboard's Live trips page, a MapLibre map plus a list of jobs on
  the road with driver, vehicle, next stop and "last seen" (polling every 10 s, not the design
  doc's SSE). Set `VITE_MAPTILER_API_KEY` on the dashboard in DigitalOcean for real map tiles. See
  `history/p2-m6-live-map.md`.
- 2026-10-03: P2-M6.1 done: the driver app reports position every 30 s while a job is on the road
  (foreground only, no background permission), core stores it (`jobs.job_positions`, migration 0032) and serves the latest per job to staff. Built narrow on purpose after the owner's warning
  about Apple blocking an employer's tracking app; privacy and review notes in
  `history/p2-m6-live-map.md`. No retention sweeper yet.
- 2026-10-03: dispatchers can now view the proof-of-delivery photo: `GET /staff/jobs/:id/proof-of-
delivery` in core, a staff-bff forward, and a "View photo" overlay on the dashboard's Jobs page.
  Upload content types are restricted to `image/*`. No driver-app native change. A production
  `eas build` of app 1.1.0 (versionCode 5) was started the same day. See
  `history/p2-m5-driver-app-jobs.md`.
- 2026-10-03: dashboard Jobs form takes a **postcode** per stop instead of latitude/longitude
  (dispatchers don't have coordinates). Looked up in the browser against postcodes.io (free, no
  key), with the resolved place shown under the field. what3words not done: it needs a paid API key
  and account. See `history/p2-m4-portal-jobs.md`.
- 2026-10-03: P2-M5.5b done: proof of delivery, driver app half (camera button at the delivery stop,
  offline photo queue keyed by job, "Delivered" held back while a required photo hasn't reached the
  server). New native dependency, so app `version` 1.1.0 and a fresh `eas build` is needed. Closes
  P2-M5 in code. See `history/p2-m5-driver-app-jobs.md`.
- 2026-10-03: P2-M5.5a done: proof of delivery, backend half (migration 0031, a "requires proof"
  flag set at job creation, driver-only photo upload route, `ProofOfDeliveryRequired` enforced in
  core at `→ delivered`, dashboard checkbox + column). Photo bytes live in Postgres for now; S3
  deferred. See `history/p2-m5-driver-app-jobs.md`.
- 2026-10-02: P2-M5.4 done: `/home` prompts an arrival confirm (native alert, foreground-only,
  reusing the position already watched for the map) once the driver's near the job's next stop —
  the driver still confirms; nothing advances on its own. See
  `history/p2-m5-driver-app-jobs.md`.
- 2026-10-02: P2-M5.3 done: hands-free voice status updates on the job screen ("loaded and
  leaving" → spoken confirm → advance), matching local word lists against the one legal next step
  rather than a server parse call. See `history/p2-m5-driver-app-jobs.md`.
- 2026-10-02: P2-M5.2 done: the driver app's "my current job" screen (reference, status, stops,
  one button for the single next step) and a banner on the home map while a job is active. No new
  store — unlike the active-trip pattern, a job doesn't gate any navigation decision, so it's a
  plain TanStack Query hook. See `history/p2-m5-driver-app-jobs.md`.
- 2026-10-02: P2-M5.1 done: driver job routes in core (`GET /jobs/current`,
  `POST /jobs/:id/status`, `POST /jobs/:id/fail`) and the driver-bff proxy. Needed its own
  migration (0030) — `jobs.jobs`'s RLS policy had no driver predicate yet, so a request in the
  `driver` data scope would have seen zero rows despite the application layer already permitting
  it. See `history/p2-m5-driver-app-jobs.md`.
- 2026-10-02: P2-M4 done: the dashboard's Jobs page (list/create/assign/cancel) and the
  staff-bff forwards onto P2-M3's `/staff/jobs/*` routes. See `history/p2-m4-portal-jobs.md`.
- 2026-10-02: P2-M2.8 closes out P2-M2: jobs' driver directory reads `fleet.driver_links`
  (active status) instead of `identity.drivers.company_id`; migration 0029 drops that column;
  the dashboard's Driver Accounts screen, `GET`/`PATCH /staff/drivers...`, and everything that
  only existed to serve them are deleted; the RLS safety test's `identity.drivers` exception is
  gone. See `history/p2-m2-driver-links.md`'s M2.8 notes.
- 2026-10-02: P2-M2.7: driver app screens for joining a company — "My companies" (invitations,
  requests, active, each with their action) and "Join a company" (enter a code), reached from
  Settings. JS-only; see `history/p2-m2-driver-links.md`'s M2.7 notes. Not yet shipped by
  `eas update` or checked on a real device.
- 2026-10-02: P2-M2.6: staff routes (invite, approve/decline/remove, the company code) and the
  dashboard's **Drivers** page, finishing the driver-links slice of P2-M2 (M2.1-2.6). See
  `history/p2-m2-driver-links.md`'s M2.6 notes.
- 2026-10-01: P2-M1.12d applied for real: `staff-bff` + the dashboard (static site) deployed on
  DigitalOcean App Platform, `wagonwise_app` given a password and `APP_DATABASE_URL`/
  `STAFF_SECRET_KEY` set on `core`. Five real bugs hit getting there, beyond the ones already in
  `docs/deployment-guide.md` §7: `APP_DATABASE_URL`'s `sslrootcert=/path/to/ca-certificate.crt`
  was a literal, unsubstituted placeholder (not a real file) — fixed by using the same
  `?sslmode=require`-only suffix as the working `DATABASE_URL`, then that hit
  `SELF_SIGNED_CERT_IN_CHAIN` (node-postgres doesn't skip CA verification for `sslmode=require`
  the way libpq does) — fixed with `sslmode=no-verify`. `dashboard.wagon-wise.co.uk`'s CNAME
  record didn't get created automatically when the domain was added to the app spec (unlike the
  original `api` domain) and needed adding by hand. The dashboard (a client-side React Router
  SPA) 404ed on every route but `/` when hit directly — DigitalOcean's static site hosting needs
  an explicit fallback for unmatched paths — fixed via the component's Custom Pages setting
  (Catchall → `index.html`, now also in `infra/digitalocean/app-spec.yaml`'s `static_sites` entry
  so it survives the next full spec apply). And **every staff-bff call from the dashboard 404ed**
  (`VITE_STAFF_BFF_URL` was set to `https://api.wagon-wise.co.uk/staff`, but `api/staff.ts`
  already prefixes every call with `/staff` itself, matching how staff-bff's own routes are
  registered — the ingress rule's `preserve_path_prefix` forwards that prefix through unchanged, so
  the extra one doubled it to `/staff/staff/...`; found via the join flow's "something went
  wrong", confirmed in `staff-bff`'s runtime logs) — fixed to the bare origin, in both the live
  env var and the checked-in spec/deployment-guide. This would have broken staff sign-in too, not
  just joining. A fifth bug was a real code defect, not a deploy-config one: confirming a staff
  enrolment 500'd with `no transactions inside DataScopes.run: it is already one` —
  `PostgresStaffRecoveryCodeRepository.replaceAll` opened its own `db.transaction()` while already
  running inside `confirmStaffEnrolment`'s `DataScopes.run` scope, which rejects a nested one on
  purpose (`platform/postgres-data-scopes.ts`). Fixed by dropping the inner transaction — the
  scope's own already gives the delete+insert the same atomicity. No unit or integration test
  caught this: the repository's own test calls it directly against the plain owner connection
  (never inside a scope), and `confirmStaffEnrolment` itself has no test at all — a real coverage
  gap, since the module-boundary rules (`companies` can't import `platform/`) make a tightly-
  scoped regression test awkward; closing it properly needs either an end-to-end test through the
  real HTTP route (like `composition/reroute-end-to-end.test.ts`) or a rule relaxation, neither
  done yet. `pnpm staff:bootstrap` (step 8) run for real after the fix: the first WagonWise admin
  signed in through the dashboard successfully. **P2-M1 is done.**
- 2026-10-02: P2-M3 finished: assign, status machine, cancel/fail, list/get, events, one active job
  per driver — see "Phase 2" below. 2026-10-01: its first slice (model + create job).
- 2026-09-28: active-trip screen gains one-tap voice **Traffic** and **Mark parking** buttons
  beside the hazard mic (spoken question/read-back, files only on a spoken "yes", declines are
  discarded, no offline queue). JS-only, so it ships by `eas update`. "Report parking" renamed
  "Mark parking" everywhere. Fixed voice hazard reports always being saved as drafts, even after
  a clear "yes" (the flow read the report's own transcript as the yes/no reply).
- 2026-09-28: fixed the nightly golden-routes job (red since the 55 mph cap). Split this file
  (was 287 KB / ~3,700 lines) into `docs/history/` and `docs/ideas.md`.
- 2026-09-27: M9 shipped (safe parking spots, route options with fuel-cost estimates). Dashboard
  hazard admin. Automated migrations on deploy. 55 mph HGV cap.
- 2026-09-26: `apps/dashboard` started. Admin-only hazard delete. Light/dark toggle. Spoken
  hazard-ahead warnings.
- 2026-09-25: crowd-sourced congestion reports. M8 consent/delete-account/restriction overrides.

## Index — where the history went

Code comments cite "docs/progress.md, decision N" or "M6.4 deviations". Those now live here:

| File                                  | Contents                                                            | Decisions |
| ------------------------------------- | ------------------------------------------------------------------- | --------- |
| `history/foundations.md`              | Pre-coding decisions, architecture review (2026-09-21)              | 1–14      |
| `history/m1-foundations.md`           | M1 breakdown, decisions, deviations                                 | 15–43     |
| `history/m2-routing-core.md`          | M2, plus the pre-push verification hook                             | 44–56     |
| `history/m3-hazards-core.md`          | M3                                                                  | 57–70     |
| `history/m4-driver-bff-auth.md`       | M4 breakdown, and the old post-M4 "Next session" notes              | —         |
| `history/m5-driver-app.md`            | M5 (its numbering restarts at 53, overlapping M2/M3)                | 53–64     |
| `history/m6-alerts.md`                | M6                                                                  | 65–90     |
| `history/m7-voice.md`                 | M7                                                                  | 91–107    |
| `history/m9-route-options-parking.md` | M9                                                                  | —         |
| `history/environment-windows.md`      | Windows dev-machine notes, the 2026-09-21 reinstall                 | —         |
| `history/p2-m1-organisations-auth.md` | P2-M1 breakdown, model, open decisions                              | —         |
| `history/p2-m2-driver-links.md`       | P2-M2 driver links: plan and decisions (active)                     | —         |
| `history/p2-m4-portal-jobs.md`        | P2-M4: jobs in the portal                                           | —         |
| `history/p2-m5-driver-app-jobs.md`    | P2-M5: jobs in the driver app (active)                              | —         |
| `history/p2-m7-moderation.md`         | P2-M7: hazard moderation and trust scoring (active)                 | —         |
| `history/p2-m6-live-map.md`           | P2-M6: live fleet map, and the tracking/store-review notes (active) | —         |
| `ideas.md`                            | Field-testing ideas backlog (shipped and unscheduled)               | —         |
