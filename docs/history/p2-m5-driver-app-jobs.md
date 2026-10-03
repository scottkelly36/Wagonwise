# P2-M5: jobs in the driver app

Scoped 2026-10-02 from the Phase 2 tech design doc §5 ("Driver app additions") and P2-M3/M4's
own notes deferring "the driver's own endpoints and the driver-bff proxy" to this milestone.
Split into session-sized slices rather than one pass, matching the project's usual style
(`history/p2-m2-driver-links.md`).

| Slice | Scope                                                       | Status            |
| ----- | ----------------------------------------------------------- | ----------------- |
| M5.1  | Driver job routes (core) + driver-bff proxy, no app changes | Done — 2026-10-02 |
| M5.2  | Driver app: "my current job" screen, tap-to-advance         | Done — 2026-10-02 |
| M5.3  | Voice status updates ("loaded and leaving")                 | Done — 2026-10-02 |
| M5.4  | Geofence nudges (arrival confirm)                           | Done — 2026-10-02 |
| M5.5a | Proof of delivery: core + driver-bff + dashboard flag       | Done — 2026-10-03 |
| M5.5b | Proof of delivery: driver app camera + offline queue        | Done — 2026-10-03 |

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

## M5.2: "my current job" screen, tap-to-advance

**No tab bar to add it to.** The driver app isn't built around tabs — "map is the app" (decision,
2026-09-24): a driver lands on a full-screen map, and everything else sits behind the small
"Menu" icon. A literal "Jobs tab" doesn't fit that. Instead: a banner reading "On job {reference}
→" appears over the map on `/home` only while a job is active, opening `/job`; outside an assigned
job nothing job-shaped shows at all ("company vs personal," design doc §5).

**No store, unlike the active-trip pattern.** `current-active-trip-store.ts` exists because
`app/index.tsx`'s relaunch gate has to decide _before rendering_ whether to redirect straight back
into a trip — that decision needs the data eagerly, outside any one screen. A job doesn't gate any
navigation decision: `/home` always renders, and showing its banner (or not) is just what
`useCurrentJob()` returns on an ordinary TanStack Query cache, the same as `useNearbyHazards` or
any other read. So `api/jobs.ts` + `api/use-jobs.ts` is a plain query/mutation pair, no new
zustand store, and `app/index.tsx`'s gate is untouched.

**What this slice added:**

- `api/jobs.ts` / `api/jobs.test.ts`: `getCurrentJob` (`GET /jobs/current`), `advanceJobStatus`
  (`POST /jobs/:id/status`) — thin wrappers over `http.ts`, same shape as `api/fleet.ts`.
- `api/use-jobs.ts`: `useCurrentJob()` (query) and `useAdvanceJobStatus()` (mutation,
  invalidates the current-job query on success).
- `lib/job-status.ts`: `JOB_STATUS_LABELS` (plain words for the status line) and `NEXT_STEP` — the
  single next-step button's target status and label per current status. Design doc §5's sequence
  is "Arrived at pickup" → "Loaded" → "Set off" → "Arrived" → "Delivered"; it doesn't name a step
  for `assigned → accepted`, so that one step is labelled "Accept job." This table is presentation
  only — core's `advanceStatus` is what actually validates a transition either way.
- `lib/error-messages.ts`: `jobsErrorMessage` for `JobNotFound`/`InvalidTransition`.
- `app/job.tsx`: the screen — reference, status line, stops (kind, name, notes), and one button
  for the single next step (hidden once there's no next step, i.e. `delivered`). Redirects to
  `/home` if there's no current job (a stale deep link, or just-delivered elsewhere).
- `app/home.tsx`: the "On job {reference} →" banner, shown only while `useCurrentJob()` has data.

**Deliberately not done:** voice status updates (M5.3), geofence nudges (M5.4), proof of delivery
(M5.5), a "report a problem" (fail) action from this screen, multi-stop ordering or a map/route
view on the job screen itself (no `routePlanId` is ever set yet — routing a company job from the
vehicle's dimensions is a separate, not-yet-built change, design doc §5 step 2).

**Verified:** `pnpm --filter @wagonwise/driver-app typecheck/lint/test` green (338 tests, 3 new
files' worth). Not checked on a real device or simulator — same gap the rest of this app's UI work
has (`docs/progress.md`'s "Real-device gaps" note); typecheck, lint and the API-layer unit tests
are what this slice's verification actually covers.

## M5.3: voice status updates ("loaded and leaving")

**Which existing flow to copy, and why not the hazard one.** Two voice-report shapes already exist
in this app: the hazard flow parses a transcript via a _server_ endpoint (an LLM call — right for
something as open-ended as a hazard description, wrong for this); the quick-report flow (traffic/
parking) parses locally with a small hand-written matcher and no network round trip. A job only
ever has **one** legal next status at a time (`NEXT_STEP`), so there's nothing to disambiguate —
the quick-report shape is the correct template, just with an extra leading "capture what the
driver said" step in front of the confirm (parking's flow skips straight to confirming since it
has no input to capture at all).

**What this slice added:**

- `lib/job-status.ts`: `STEP_TRIGGER_WORDS` — a short, per-status, hand-written word list (same
  style as `yes-no-parser.ts`'s `YES_WORDS`/`NO_WORDS`), and `matchesJobStatusTrigger(transcript,
status)`, a pure word-boundary match against the current status's own words only. The same word
  ("arrived") appears under two different statuses here and that's fine — matching is never done
  against more than one status's list at once, so there is no ambiguity to resolve.
- `lib/job-status-voice-reducer.ts` / `.test.ts`: the pure state machine — capture the trigger
  phrase → (no match: "didn't catch that," retry by tapping again) → read the matched step back
  → capture yes/no → advance on yes. Only a clear "yes" advances anything; a "no," an unclear
  reply, or a capture failure all leave the job exactly where it was. No draft concept, unlike
  hazard reports — the tap button (M5.2) is always right there as a fallback, so a missed voice
  update costs nothing.
- `hooks/use-job-status-voice.ts`: wires `useVoiceReportCapture` (the same native speech-capture
  hook every voice flow in this app shares), `expo-speech` prompts, and `useAdvanceJobStatus` to
  the reducer — the same "effects at the edge, pure reducer tested directly" split as
  `use-quick-voice-report.ts`.
- `app/job.tsx`: a second button, "Report by voice," next to the tap-to-advance button, with a
  spoken-prompt footnote while confirming. Tapping the tap button is disabled while the voice flow
  is busy or listening, and vice versa, so the two can't race each other.

**Verified:** `pnpm --filter @wagonwise/driver-app typecheck/lint/test` green (354 tests — 22 new,
covering the matcher and the full reducer state machine). The hook itself isn't unit tested
directly, matching `use-quick-voice-report.ts`'s own precedent (the pure reducer carries the real
logic; the hook is thin wiring). Not checked on a real device — speech recognition accuracy with
genuine cab noise and local accents is an open question noted elsewhere in `docs/progress.md` and
can only really be answered by field testing, not unit tests.

## M5.4: geofence nudges (arrival confirm)

**Foreground polling, not `expo-location`'s background geofencing API.** No geofencing precedent
existed anywhere in this repo before this slice. The real choice was background geofencing (its
own permission prompt, works while the app is closed) vs. checking proximity against the position
`useLiveLocation` is already watching whenever the app's open (no extra permission, matches design
doc §9's stance of only using location the app is already tracking for something else). Chose the
latter: a driver is in the app checking the map while driving toward a stop anyway ("map is the
app"), and a prompt that only fires while the app's in the foreground is a smaller, more honest
ask than one that can wake the app up in the background for something this low-stakes.

**Which stops are even geofenced.** Design doc §5 names exactly two: "Arrived at pickup?" and
(implicitly) its delivery equivalent. Every other step in `NEXT_STEP` (accept, loaded, set off,
delivered) isn't tied to a specific point on the map, so only `accepted` (→ pickup) and `en_route`
(→ delivery) have an entry in `lib/job-arrival-geofence.ts`'s `ARRIVAL_STOP_KIND`.

**What this slice added:**

- `lib/geo-distance.ts` / `.test.ts`: `distanceMetres`, a plain two-point flat-plane distance (same
  approximation `route-progress.ts`'s `routeProgress` already uses). Not route-relative like
  `hazardsAheadWithinRange` — there's no route line to snap onto for a company job (no
  `routePlanId` is ever set yet).
- `lib/job-arrival-geofence.ts` / `.test.ts`: `arrivalNudgeFor`, the pure decision — given a job and
  a position, is the driver within `ARRIVAL_RADIUS_M` (200m, a placeholder pending field data, not
  a safety-critical value) of the relevant stop kind for the job's current status. Pulled out as a
  pure function specifically so the geofence decision is unit-tested without a live location watch
  or a mounted hook, same "extract the logic, leave the hook thin" split as `startWatchingPosition`
  in `use-live-location.ts`.
- `hooks/use-job-arrival-geofence.ts`: shows a native `Alert` ("Arrived at pickup?" / "Not yet" /
  "Yes") when `arrivalNudgeFor` says to, and advances the job on "Yes" — a native alert reaches the
  driver regardless of which screen they're on, unlike a screen-bound banner. Prompts at most once
  per job per status: declining or dismissing doesn't ask again for the same arrival, since the
  tap (M5.2) and voice (M5.3) buttons are always there as a fallback. Not unit tested directly
  (same precedent as the other voice/geofence hooks in this app — the pure function carries the
  logic).
- `app/home.tsx`: mounted the hook, passing it the already-fetched `useCurrentJob()` data and
  `useLiveLocation()` position — no new query or location watch. **Not** mounted on `/job`: `/home`
  is the screen a driver is actually looking at while driving, so that's where the check runs.

**Deliberately not done:** re-prompting after a decline (once dismissed, that arrival never asks
again — worth revisiting with field feedback, but needs more state than this slice warranted),
background geofencing for when the app isn't open, and any geofence around `at_pickup` → `loaded`
or `loaded` → `en_route` (design doc doesn't tie either to a location, and they aren't).

**Verified:** `pnpm --filter @wagonwise/driver-app typecheck/lint/test` green (364 tests — 10 new,
covering the distance function and the full geofence decision table). Not checked on a real
device — GPS accuracy and how close a stop's pin actually sits to where a driver parks are both
open questions that only field testing can answer; `ARRIVAL_RADIUS_M` is a first guess, not a
tuned value.

## M5.5a: proof of delivery — backend, proxy and the dispatcher's flag

Split in two like M5.1/M5.2: this slice is core + driver-bff + the dashboard checkbox; the driver
app's camera and offline queue (a new native dependency, `expo-image-picker`) is M5.5b.

**Decisions (user's calls, 2026-10-03):**

- **Photo, not signature.** Design doc §5 says "photo and/or signature"; a signature pad needs a
  drawing-canvas dependency this app doesn't have, so photo alone satisfies it.
- **Postgres `bytea`, not S3/DigitalOcean Spaces.** Object storage needs an account, bucket and
  keys that only the user can create, so it would block a feature with no real users yet. Same
  "zero-config default, swap the real provider in later" habit as `ConsoleOtpSender`/
  `NullHazardParser`. Revisit when photo volume, or a dashboard viewer for PODs, justifies it.
  No `FileStore` port yet either — one implementation, so no abstraction.
- **Optional to attach, but a job can require it.** Any driver can attach a photo to any job. A
  dispatcher can also tick "Require proof of delivery" when creating a job
  (`jobs.jobs.requires_proof_of_delivery`, default false).

**Enforcement is in core, not the app.** `advanceJobStatus` refuses `→ delivered` with
`ProofOfDeliveryRequired` (409) when the job requires proof and none has been attached — the same
"don't trust the client alone" stance as RLS. Consequence worth knowing: a required-proof job in a
dead zone can't be marked delivered until the photo has actually uploaded. That's what "required"
means; soften it if field use shows it's too strict.

**What this slice added:**

- `migrations/0031_jobs_proof_of_delivery.sql`: the flag column, and `jobs.proof_of_delivery`
  (one row per job, so retaking replaces; same "visible exactly when its job is" RLS as
  `job_stops`).
- `Job` gains `requiresProofOfDelivery` and a read-only `hasProofOfDelivery`, loaded in the same
  batched query as the stops (`PostgresJobRepository.#withStops`) — the photo bytes themselves are
  never loaded on a plain job read.
- `application/attach-proof-of-delivery.ts` + `POST /jobs/:id/proof-of-delivery` (base64 over JSON,
  204): driver-only — a staff actor is refused even for their own company's job.
- `bodyLimit` raised to 10 MiB in core and driver-bff (Fastify's 1 MiB default would reject a
  photo before it reached the route); the contract caps the base64 at 7,000,000 characters.
- Contracts: `requiresProofOfDelivery`/`hasProofOfDelivery` on `jobSchema`, the optional flag on
  `createJobRequestSchema`, `attachProofOfDeliveryRequestSchema`.
- driver-bff proxy route; dashboard Jobs page gets the checkbox and a "Proof of delivery" column
  ("—" / "Required — not yet received" / "Received"). The dashboard doesn't view the photo.

**Verified:** `pnpm verify` green (1026 core tests, including `ProofOfDeliveryRequired` at the use
case, over HTTP, and the Postgres round-trip incl. replace-on-retake), and the dashboard checked
live: checkbox and column render, a job created with it ticked shows "Required — not yet
received". Not exercised live end to end — nothing in the driver app can upload a photo yet (M5.5b).

**Not done:** the driver-app capture/queue (M5.5b); viewing a photo anywhere; signatures; an
S3-backed store.

## M5.5b: proof of delivery — the driver app's camera and offline queue

**Decisions:**

- **Photo is saved to the phone before it is uploaded.** A delivery drop is where signal is worst,
  and a required-proof job can't be marked delivered until the photo is on the server (M5.5a). So
  `takePhoto` enqueues first, then tries to upload; the queue is retried on app start and every
  return to the foreground (same opportunistic shape as `useHazardQueueFlush`, no NetInfo).
- **The base64 is stored in SQLite, not the camera's file path.** The OS can clear the picker's
  cache file before an upload ever succeeds. One row per job (`insert or replace`), because a job
  has one proof photo and core replaces on a retake.
- **A permanent rejection is dropped; everything else stays queued.** The hazard queue stops at any
  failure and would wedge forever on a report the server never takes. A photo is tied to a job that
  can disappear (cancelled, reassigned), so a 4xx other than 401/408/429 discards that photo and the
  pass carries on; network failures and 5xx stop the pass and keep the rest.
  `lib/proof-of-delivery-flush.ts`. The cost: a photo for a job cancelled before the upload landed is
  silently lost. Acceptable — there is no delivery left to prove.
- **Delivered is held back in the app too.** `isDeliveryBlockedByProof` disables the Delivered
  button _and_ the voice button while a required photo hasn't reached the server — a spoken
  "delivered" that core is certain to refuse would only say "couldn't save that". Core remains the
  enforcer. A photo still in the local queue deliberately does **not** unblock it, only the
  server's `hasProofOfDelivery` does.
- **The photo section only appears at `at_delivery`.** Optional photos are offered there too, not
  just on required jobs.
- **Size.** JPEG quality 0.5, no EXIF (it carries GPS — more location than the privacy rules want
  stored). `prepareProofPhoto` validates against the contract's own schema (including the
  7,000,000-character cap) before anything is queued, since a photo the server would reject would
  only be rejected again, permanently. No resize step (would need `expo-image-manipulator`); if very
  high-resolution phones trip the cap in the field, that is the next thing to add.

**What this slice added:** `expo-image-picker` (plugin in `app.config.ts`: camera permission text,
microphone prompt off; `version` 1.0.1 → 1.1.0 because it is a native change), `api/jobs.ts`
`attachProofOfDelivery`, `db/proof-of-delivery-queue.ts`, `lib/proof-of-delivery.ts` and
`lib/proof-of-delivery-flush.ts` (pure logic), `hooks/use-proof-of-delivery.ts` (camera + enqueue),
`hooks/use-proof-of-delivery-queue-flush.ts` (sync + mount in `_layout.tsx`), the `/job` card, and a
`ProofOfDeliveryRequired` message.

**Verified:** `pnpm --filter @wagonwise/driver-app typecheck/lint/test` green (386 tests, 22 new:
photo preparation, status/blocking rules, the flush including drop-and-continue, the SQLite queue
against an in-memory stand-in, the API call). `expo config` resolves with the plugin. **Not run on a
device**: it needs a new native build (`eas build`), and the camera, the permission prompt and a
real offline→online upload are all unexercised. The hooks aren't unit tested directly, same
precedent as the other device-bound hooks.

**Not done:** viewing a photo anywhere (dashboard or app); signatures; S3-backed storage; a visible
"photo lost" notice when a queued photo is discarded.

## Follow-up: dispatchers can view the photo (2026-10-03)

Closes the "dashboard doesn't view the photo" gap left by M5.5a/b.

- **Core:** `GET /staff/jobs/:id/proof-of-delivery` (`application/get-proof-of-delivery.ts`). Anyone
  who can see the company's jobs can see its photos — no privilege, same as the job list — and
  another company's job is `JobNotFound`, as for `getJob`. A visible job with no photo is the new
  `ProofOfDeliveryNotFound` (404). The photo is read on request only, never with the job list.
  Returned as base64 JSON, like the upload; `JobRepository.findProofOfDelivery` is the new port
  method (Postgres + in-memory), tested over HTTP and against real Postgres.
- **staff-bff:** one more forward in `dashboard-routes.ts`.
- **Dashboard:** the "Proof of delivery" column now says "Received" with a **View photo** button
  (also for jobs that didn't require one but got a photo). It opens a full-size overlay (Escape or
  a click outside closes it) with when it was taken. Fetched only when opened.
- **Content types are now restricted to `image/*`** in the contract, on upload and on the way
  back. The dashboard builds a `data:` URL from the stored type, so an arbitrary string there
  would be a way to serve a web page from it. The driver app already sends the camera's own type,
  and refuses a non-image locally.
- **Not done:** download, zoom, a photo history (a retake replaces), signatures, and photos in any
  email or report.
