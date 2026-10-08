# Log, newest first

Every dated change, moved out of `docs/progress.md` on 2026-10-08 to keep that file short. Open it to find when or why
something changed, not to start work: `progress.md` has the current state. Add new entries at the top of the list.

- 2026-10-09: **walk-round checks, slice 2a: the server side of a driver doing a check (Phase 3 M5).** Migration 0044
  (`checks.checks`, `check_photos`, `defects`; driver and company Row-Level Security). A driver's `GET /checks/mine` (through the driver
  BFF) gives the lists for the vehicle on their current job and whether each is done today (by anyone: it is the vehicle's daily
  check). `POST /checks` files a completed check: the answers are checked against the list's questions (right kind, each once,
  required ones answered), defects are worked out (a flagged tick, the defect answer to a yes-or-no, a number outside its range), the
  result is the worst severity (clear, fix soon, do not drive), and the check is stored with a copy of the questions as they were.
  Sending the same id again returns the check already made. `PUT /checks/:id/photos/:itemId` adds or replaces a photo for a photo
  question or a defect that asks for one. Defects are rows with a status (open, acknowledged, fixed) for the office page to come.
  The driver must belong to the list's company; another company's driver gets "not found", as the database hides the list. The jobs
  facade gained `activeVehicleFor`. Tested end to end against real Postgres (`composition/checks-end-to-end.test.ts`). Not built:
  the driver app screen and offline queue (2b), and the office results and defects page, before-a-job setting and retention (3).
- 2026-10-09: **walk-round checks, slice 1: each company builds its own check lists (Phase 3 M5).** New `checks` module and migration
  0043 (`checks.templates`, company Row-Level Security). A list is an ordered set of questions held as one JSON document: tick or
  flag a defect, yes or no (one answer is the defect), a number (optional lowest and highest OK), a note, or a photo. Each question
  can be required, can ask for a photo of a defect, and can mark a defect "fix soon" or "do not drive". A list applies to all of the
  company's vehicles or only chosen ones (checked against the company's own vehicles through a `VehicleDirectory` port over fleet). A
  firm that wants no checks has no lists. Editing raises `version`; removing archives (past checks will keep a copy of the questions
  they were answered against). Built by `manage_fleet` (or WagonWise staff); anyone at the company can read. New dashboard page
  "Walk-round checks" with a builder, "start blank" or "from the example" (a typical daily list; editable, and the page says it is
  not complete and the firm is responsible for its checks). Drivers completing a check, the office results and defects inbox, and
  retention follow in later slices.
- 2026-10-09: **a company's own plan and invoices (Phase 3 item 0).** New "Plan and invoices" page for staff holding `manage_billing`
  (`GET /staff/billing/my/plan` and `/my/invoices`, through the staff BFF). Shows what the plan covers, what it costs a month, how many
  vehicles the company has set up against that ("you can add 2 more"), any scheduled change, and the issued, paid and cancelled invoices
  with Print or save as PDF. Never drafts. The company is the caller's own, never a parameter, and the work runs in that company's data
  scope. Migration 0042 lets a company read its own non-draft invoices and their lines (read only; Row-Level Security still refuses any
  write and every other company's rows). WagonWise admins use the admin pages, not these. Vehicle count comes from fleet
  (`countVehicles`) through a `VehicleCount` port; billing and fleet now reference each other through ports in composition (billing
  reads fleet's count lazily). The "plan full" message now tells company staff to ask WagonWise. Invoices are not emailed: the owner chose the portal alone (2026-10-09), which saves sending.
- 2026-10-09: **invoices (Phase 3 item 0).** `billing.invoices`, `billing.invoice_lines` and a gapless `billing.invoice_counter`
  (migration 0041), WagonWise-admin only through Row-Level Security. The dashboard's new Invoices page drafts a month's invoices for
  every company from its plan (capacity in force on the 1st, whole month; a mid-month rise is billed pro rata by days; a mid-month fall
  takes effect next month), lets an admin add a credit or one-off line or remove a line on a draft, then issues it: that gives the next
  number (`INV-0001`, in order, never reused), stamps WagonWise's billing details as they were that day, and freezes it. Issuing is
  refused while any billing detail still holds a `[placeholder]`, when the invoice has no lines, or when it totals less than nothing.
  Mark paid by hand; cancel (void) an issued unpaid invoice, which keeps its number and frees the month to be invoiced again. One live
  invoice per company per month (a partial unique index). Print or save as PDF opens a page in a new tab, as the delivery records do;
  a draft prints with DRAFT across it. Generating twice is safe: a company already invoiced for the month is skipped. No VAT is
  calculated (the VAT line prints the admin's text); the company's own view of its invoices, and emailing them, are not built.
- 2026-10-09: **plans, vehicle capacity and one live job per vehicle (Phase 3 item 0).** `billing.plans` (price per vehicle in pence,
  default £10) and `billing.capacity_changes` (effective-dated capacity), migration 0040, backfilled so each existing company starts
  with a capacity equal to its current vehicle count (at least 1). WagonWise admins set both on the dashboard's new Plans page; a
  capacity change takes effect from today or a later day, never a past one, so an earlier month's bill can't move. Fleet now refuses
  to create a vehicle beyond today's capacity (`CapacityReached`, 409; a company with no plan covers none), through a
  `VehicleCapacity` port supplied by composition over billing. Jobs now refuses to assign a vehicle already out on an active job
  (`VehicleBusy`, 409), so capacity bounds how many drivers can work at once. No unique index on that, unlike the per-driver one
  (0027): existing data may already hold two active jobs on a vehicle, and an index would fail the migration. A company can still
  delete and re-add vehicles within its capacity; that costs the same. Company-facing plan view, invoices and email are next.
- 2026-10-09: **billing details (Phase 3 item 0, first slice).** New `billing` module in core. `billing.details` (migration 0039) holds
  WagonWise's own trading name, address, billing email, payment details, VAT status and payment terms: one row, seeded with
  `[bracketed]` placeholders. WagonWise admins edit it on the dashboard's new Billing page (`GET`/`PUT /staff/billing/details`,
  through the staff BFF). Company staff get 403 and Row-Level Security hides the row from every scope but the platform's.
  `placeholderFields()` names fields still in brackets: invoice issuing (not built yet) must refuse while any remain. Not audited
  yet (stores `updated_by` and `updated_at` only). Pricing decided with the owner: bill the **vehicle capacity a company
  commits to**, changed month to month by an admin, not vehicles in use; price per vehicle overridable per company (default
  £10); invoices to be generated from the admin portal. Plan, capacity history, one-live-job-per-vehicle and invoices are next.
- 2026-10-08: **delivery records.** Jobs shows, for a delivered job, Internal and Customer copy buttons. Each opens a printable page in a
  new tab (the browser's Save as PDF) with the reference, each stop with arrival and finish times, and the delivery photos. The
  customer copy has nothing about the driver or vehicle and no driver instructions; the internal one adds the driver (the sign-in
  email or phone, the portal has no driver name), the vehicle, instructions and the status history. No GPS positions in either.
  Built in the browser from the existing photo requests: portal only, no core change. Lets a company keep proof after the photo's
  retention period.
- 2026-10-08: **delivery photo retention, chosen by the company.** `companies.companies.photo_retention_months` (migration 0038,
  default 12, 1 to 120). A manager (`manage_users`) or WagonWise staff sets it on the portal's new Settings page
  (`PUT /staff/companies/:id/settings`, audited as `company_settings_changed`, shown on Activity). A daily task in core
  (`prune-proof-photos`, every `POSITION_SWEEP_INTERVAL_MS`) deletes each company's photos older than its own setting; the job
  record stays, and Jobs shows "Photo removed (retention period)". Why: the company is the controller of its delivery
  records, so the number is its decision, not WagonWise's. Needs a core deploy (migration), then staff-bff and the dashboard.
  The privacy notice and DPA still need a line saying so.
- 2026-10-08: **jobs with several stops.** A job is an ordered list of stops, each a collection or a delivery (up to 20). The
  statuses are unchanged: the driver arrives at the current stop, finishes it (loaded, or delivered), and sets off for the next;
  finishing a delivery that is not the last leaves them loaded, and the job is delivered after the last stop. A job with one
  pickup and one delivery behaves as before. Core: `jobs.jobs.current_stop` (migration 0037, which also backfills jobs in
  flight), `nextStatus` and `nextStopFor` follow it, timeline entries carry `stopIndex`. Proof of delivery is per delivery stop
  (`jobs.proof_of_delivery` is keyed by job and stop; the photo attaches to the delivery the driver is at; each delivery stop
  of a job that needs proof needs its photo before it can be finished). Driver app: the job screen ticks finished stops and
  outlines the current one; cards and the status line say which stop (a job with more than two). Portal: the job form is a
  list of stops (type, stored location or new address, move up or down, remove, add); Jobs shows a photo per delivery stop;
  Live trips heads for the current stop. Needs a core deploy first (migration), then the dashboard, staff-bff and an OTA update.
- 2026-10-08: **stored locations.** A company keeps its customers and sites once. Places page: Add a location (name, type, postcode,
  note for drivers); drivers' marked gates and these are one list. Job form: each stop is a Stored location or a New address; a stored
  location fills in the name, map point and note; a new address has Save this location for next time (on by default). Portal
  only, no core change (the staff create endpoint already existed). Needs a dashboard deploy.
- 2026-10-08: **jobs with no pickup.** A job now needs only a delivery. The portal job form has Collect from: Add a pickup / No
  pickup (the choice is remembered). For a job with no pickup the driver goes accepted, then Loaded and ready (no navigation
  yet), then Set off as usual, planned from where they are; the portal says Accepted, not loaded yet. Core: `validateStops`
  no longer needs a pickup, `nextStatus` takes accepted straight to loaded when there is none. Needs a core deploy, the
  dashboard deploy and an OTA update. Stored company locations and a next-journey flow are still in docs/ideas.md.
- 2026-10-08: **weather warnings, staff invitation emails, live map fix, Resend fix.** (1) Met Office warnings (NSWWS via
  Weather DataHub, key `METOFFICE_API_KEY` on core): core polls every 5 minutes and keeps them in memory; the portal shows a
  banner and a toggleable layer on Live trips; the driver app shows a badge (weather icon on the warning colour) when a
  warning covers where they are. Nothing shows until a warning is issued. (2) Staff invitations are now emailed as a link
  through Resend when `DASHBOARD_URL` is set on core (the invite is still made, and the link still shown, if the email
  fails). (3) Live trips drew only a background: MapLibre 6's tile worker was missing from the production build; now
  bundled (`dashboard/src/lib/map-worker.ts`). (4) Email sign-in codes had stopped: the `wagon-wise.co.uk` domain was not
  verified in Resend, so the sandbox sender refused everyone but the account owner. Fixed by verifying the domain;
  recorded in the deployment guide.
- 2026-10-08: **saved places** (a farm's real gate, marked once, kept for future jobs). From the first drive and the owner's
  field test: a farm's postcode often lands somewhere other than its gate. A driver stands at the real entrance, taps
  _Mark this spot_, names it and adds a note ("gate on the left, tight turn"); it is saved where they stand. **Company
  drivers' places are shared with the whole company** (owner's call); **a driver with no company marks personal places** that
  only they see. Dispatchers can edit and remove the company's places in the dashboard (the _Places_ page, `dispatch`
  privilege), and when creating a job, entrances marked near a typed postcode are offered: choosing one sends the driver to
  the real spot and puts its note on the stop. In the driver app: a _Gates and entrances_ card on the job screen (places
  near the stop, with notes, and _Mark this spot_), a _Places_ list on the Saved tab, and green markers on the home and trip
  maps with a sheet to read or improve the note and _Take me there_. New `places` module and migration 0036 (row-level
  security: company staff and WagonWise admins by company; drivers by an active company link, or their own personal places).
  Core, both BFFs, dashboard and app. A personal place can be shared with a company the driver has joined; account deletion removes personal places. Core and BFF deploy first. See `history/saved-places.md`.

- 2026-10-08: **P2-M8 reports and CSV export.** A Reports page in the dashboard (needs `view_reports`; WagonWise admins see
  any company): pick a period (last 7 or 30 days, this or last month, custom dates), see a summary (jobs, delivered, on
  time against late, average accepted-to-delivered time, cancelled or failed, in progress, proof photos received) and the
  jobs, and download a CSV. Core `POST /staff/jobs/companies/:companyId/report` returns the rows with the driver and
  vehicle named, so a report reader needs no fleet access; staff-bff forwards it. Cells that start with a formula
  character are defused in the CSV. No migration. Core and staff-bff deploy needed. See `history/p2-m8-reports.md`.

- 2026-10-07: **UK-wide coverage, groundwork.** Target: Great Britain by the start of November (Northern Ireland left out
  for now). Code fixes done now: lines for "what is near this route" are sent as one text value, so a journey of
  tens of thousands of points can be planned (the old form broke at ~32,000 points); the app thins the route
  corridor to 1,500 points for hazards and parking. Added `infra/valhalla/build-gb-tiles.sh` (untested at national
  scale) and `deployment-guide.md` section 10 (build on a temporary 16 GB droplet, serve on ~8 GB, rebuild monthly).
  Still to do: the actual build and switch-over, wider golden routes, restriction checks on real routes, MapTiler
  plan limits. Core deploy needed for the line fix.

- 2026-10-07: **one-tap parking, with Undo; parking on the trip map.** The spoken yes/no for "Mark parking" is gone: it is
  filed at once, says "Parking marked", and shows Undo for 8 seconds (`DELETE /parking/spots/:id`, only the reporter's own
  spot; core, BFF and contracts). Found on the first drive: spots were saved but not seen, because the home map only
  looked 5 km around the driver and the trip screen drew no parking at all. The home map now looks 20 km out for
  parking, and the trip screen shows parking along the route (smaller markers, tap for details). Core deploy first.

- 2026-10-07: **field-test fixes** (first drive). (1) _Re-plan from here_ now plans from the live position and sends the
  direction of travel (`originHeadingDeg`, GPS course while moving): Valhalla gets a `heading` on the first location and a
  route that sets off that way is preferred, falling back to any route if none exists. The old trip is ended only once the
  new route exists. (2) The trip map is now **heading-up**: it turns to the direction of travel, tilts 45 degrees and
  keeps the position low on screen so most of it shows the road ahead; the camera follows the phone's own location
  natively (`trackUserLocation="course"`), and the position is a fixed arrow pointing up. (3) **Smoothness**: the trip
  screen now takes a fix every second (navigation accuracy) instead of every 3 s / 10 m, and the map no longer re-sends
  its route lines and hazard markers on every update. Core and app changes; core deploy first. **Not yet checked on a
  device: the camera tracking and the arrow placement.**

- 2026-10-07: **position is shared from Start, not from Accept.** The app now sends a driver's position to their company
  only while the job is in a tracked state AND the driver has tapped Start (a trip is running), and shows a "Your
  company can see your position" chip on the map and trip screens while it does (`isSharingPosition`). Core still
  accepts a position for any tracked status, as an upper limit. From the draft DPIA's risk 2. JS only.

- 2026-10-07: **real account deletion, and route retention.** Deleting an account now also deletes the driver's vehicle
  profiles, route plans, trips, reroute alerts and feedback, and ends their company links and removes unanswered
  invitations to their email or phone (`identity`'s `DriverDataEraser`, supplied by composition over routing, feedback
  and fleet). It erases first and scrubs the account last, so a failure part-way is simply retried. Reports they filed
  stay, linked only to the scrubbed account; job records stay with the company. Route plans and ended trips older than
  30 days (`ROUTE_RETENTION_DAYS`) are deleted by a timer. The consent and delete-account wording in the app now say
  exactly this (JS only). Core deploy needed; no migration.

- 2026-10-07: **P2-M9 documents drafted** (Docs artifacts, not in the repo): a privacy notice, a data processing
  agreement and a pilot onboarding checklist, plus a driver install guide. All written from what the system does today,
  with [brackets] for what only the owner can fill in (company details, transfer safeguards). They need a solicitor's
  review before signing. The privacy notice's last section lists where the system and the consent screen disagree.

- 2026-10-07: **housekeeping timers in core** (`platform/periodic-task.ts`, wired in `compose-core.ts`): hazards past their
  expiry are marked expired every 5 minutes (`HAZARD_EXPIRY_INTERVAL_MS`), and driver positions older than 30 days
  (`JOB_POSITION_RETENTION_DAYS`) are deleted hourly (`POSITION_SWEEP_INTERVAL_MS`) in the platform data scope. In
  process, no new infrastructure; both passes are safe to run twice, so a second core instance would do no harm. Closes
  the old "no expiry poller" and "no retention sweeper" open items.

- 2026-10-06: **app 1.2.1**: the Android microphone permission was missing from 1.1.0 and 1.2.0 (`expo-image-picker`'s
  `microphonePermission: false` made it block `RECORD_AUDIO`), so every voice feature said "no access". Fixed, and a
  denied microphone now says where to turn it on and offers an Open settings button. Over the air since: the map
  and trip-screen buttons restyled to the mock (smaller, 16 radius, no top Menu button), route options drawn on the
  map in their own colours before one is chosen, a parking marker details drawer, and a Nearby parking list with
  drive times and Take me there (no server change: it uses the route preview endpoint).

- 2026-10-04: driver app releases run on a **`release` label**. Merging to main publishes nothing; adding the label
  to a PR (before or after it merges) runs `driver-app-release.yml`: `eas update` for a JavaScript-only change
  (after waiting for the live server to have the routes the app needs, `.github/release/api-checks.txt`), or a Play
  internal-testing build when `version` is higher than at the last release. "Release" means main as it is now, measured
  against the `driver-app/production` tag (created, at `2bb0779`, along with the label). No staging copy, by choice.
  Rules are tested scripts (`pnpm test:ci-scripts`, in CI and `pnpm verify`). **Needs the owner's one-off setup:** the
  `EXPO_TOKEN` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secrets (`docs/deployment-guide.md` section 9). The redesign shipped as
  app 1.2.0 (2026-10-04), and the first `check`, `build` and `update` runs all passed.
- 2026-10-04: driver app redesign, to match the owner's mock: a Map / Jobs / Saved / More tab bar, a new
  Home (job card, round recentre and layers buttons, icon quick actions, a Where-to sheet), lifted
  cards and icons on every screen, a back button on pushed screens, and a deeper brand blue. Also
  fixes the Android navigation bar covering buttons at the bottom of screens (reported on a Galaxy
  S25 FE): every screen now uses the safe-area library's view. **Adds native code (icon library), so
  app version 1.2.0 and a Play build were needed (shipped), and it has been
  used on a real device. See `history/driver-app-redesign.md`.

- 2026-10-04: driver app **Start**: accept the job, tap Start, and the app plans a route for the
  assigned company vehicle (never a profile the driver picked) and opens the trip screen; **Set off**
  does the same to the delivery; the trip screen has the arrival button. New endpoint
  `POST /jobs/:id/navigation-profile` and migration 0034 (a driver may read only the vehicle on their
  own unfinished job), so **core must deploy before `eas update`**. No new job status. See
  `history/p2-m5-driver-app-jobs.md`.

- 2026-10-04: driver app checks for its job. The app asked for "my current job" once on opening
  and never again (no timer, no refresh on return, and push is still off), so a job assigned while
  the app was open did not appear until a full restart, and a failed check showed nothing. Now it
  checks every 20 s while a screen showing the job is open and straight away when the app comes
  back to the front, and Settings has a **My job** row (the job, "No job assigned right now", or
  "couldn't check", with Check again). JS only, shipped by `eas update` to the production channel
  (runtime 1.1.0).

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
  `history/p2-m6-live-map.md`. Positions older than 30 days are deleted by a timer in core (2026-10-07).
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
