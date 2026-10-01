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
| P2-M1 Orgs, roles, RLS, staff auth | In progress — P2-M1.12c done 2026-09-29  | `history/p2-m1-organisations-auth.md`  |
| P2-M2 Fleet (early slice)          | Vehicles + interim driver scopes, PR #48 | `history/p2-m1-organisations-auth.md`  |
| P2-M3 Jobs core (first slice)      | Job domain model + "create job" only     | below                                   |

## Next up

1. **P2-M1** (user's call 2026-09-28: start Phase 2 ahead of its entry criteria and before
   M8 is finished). Plan, decisions and task list in `history/p2-m1-organisations-auth.md`.
   P2-M1.1 (contracts), P2-M1.2 (permission rules), P2-M1.3 (migration 0020 + staff
   repositories), P2-M1.4 (password hashing, TOTP, text/email codes), P2-M1.5 (staff use
   cases), P2-M1.6 (staff tokens + core's `/staff/*` routes) and P2-M1.7 (RLS, `wagonwise_app`
   role, per-request transaction), P2-M1.8 (admin checks moved into the use cases) and P2-M1.9
   (`apps/staff-bff`), P2-M1.10 (dashboard staff sign-in, join, Users) and P2-M1.11 (audit
   log), P2-M1.12a (sign-in guessing limits), P2-M1.12b (`pnpm staff:bootstrap`) and P2-M1.12c
   (every dashboard page on the staff sign-in; driver admin flag and scopes dropped) done; next
   is 12d (required config, deploy). **Spec/docs prepped 2026-10-01**, not yet applied: `staff-
bff` and the dashboard (a static site, own subdomain `dashboard.wagon-wise.co.uk`) added to
   `infra/digitalocean/app-spec.yaml`, with `ingress.rules` path-routing `staff-bff` under
   `api.wagon-wise.co.uk/staff`; full runbook in `docs/deployment-guide.md` §4 step 9
   (unverified against the real app — `doctl` wasn't available in the environment that wrote
   it). **Deploy step still owed, needs a real `doctl`/DO console session:** apply the merged
   spec (never the raw file, §7 bug #4), give `wagonwise_app` a password and set
   `APP_DATABASE_URL` on `core`, set `staff-bff`'s `CORE_INTERNAL_KEY` secret, confirm both new
   components are healthy, then bootstrap the first admin (deployment guide step 8). Until then
   the deployed dashboard can't sign anyone in: 12c removed the driver sign-in.

## Open items (verified against the code 2026-09-28)

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
- `companies` module (own migration) and `Driver.companyId`.
- Admin screens: Companies, Driver Accounts (assign company), Invite
  Codes (generate/list), Hazard Reports (list/delete — replaced the driver app's delete button).

- **Fleet vehicles (PR #48, early P2-M2):** `fleet` module (company vehicles with dimensions,
  migration 0019), Vehicle Profiles page. Its interim driver `scopes` were replaced by staff
  privileges at P2-M1.12c (migration 0025 drops them).

- **Jobs — first slice of P2-M3 (2026-10-01):** `jobs` module (migration 0026), the `Job`/
  `JobStop`/`JobStatus` domain model from the design doc's §3 sketch, and the one "create job" use
  case (`POST /staff/jobs/companies/:companyId/jobs`) — a job starts `draft` with its stops, no
  driver/vehicle/route plan until dispatch assigns it. Gated by the `dispatch` privilege
  (`companies/domain/staff-account.ts`'s `PRIVILEGES`, defined since P2-M1 but unused until now).
  No list/get endpoint, no dashboard UI, no status transitions past `draft` — that's the rest of
  P2-M3 (dispatch use cases, events) and P2-M4 (portal job list/assign), not built yet.

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

- 2026-10-01: P2-M1.12d applied for real: `staff-bff` + the dashboard (static site) deployed on
  DigitalOcean App Platform, `api.wagon-wise.co.uk/staff/*` routing confirmed end-to-end (its own
  auth middleware responds), `wagonwise_app` given a password and `APP_DATABASE_URL`/
  `STAFF_SECRET_KEY` set on `core`. Two real bugs hit getting there, beyond the ones already in
  `docs/deployment-guide.md` §7: `APP_DATABASE_URL`'s `sslrootcert=/path/to/ca-certificate.crt`
  was a literal, unsubstituted placeholder (not a real file) — fixed by using the same
  `?sslmode=require`-only suffix as the working `DATABASE_URL`, then that hit
  `SELF_SIGNED_CERT_IN_CHAIN` (node-postgres doesn't skip CA verification for `sslmode=require`
  the way libpq does) — fixed with `sslmode=no-verify`. `dashboard.wagon-wise.co.uk`'s CNAME
  record didn't get created automatically when the domain was added to the app spec (unlike the
  original `api` domain) and needed adding by hand. Still open: `pnpm staff:bootstrap` (step 8)
  hasn't been run yet — no WagonWise admin exists on the deployed app.
- 2026-10-01: P2-M3 first slice: `jobs` module (migration 0026) — see "Phase 2" below.
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

| File                                  | Contents                                               | Decisions |
| ------------------------------------- | ------------------------------------------------------ | --------- |
| `history/foundations.md`              | Pre-coding decisions, architecture review (2026-09-21) | 1–14      |
| `history/m1-foundations.md`           | M1 breakdown, decisions, deviations                    | 15–43     |
| `history/m2-routing-core.md`          | M2, plus the pre-push verification hook                | 44–56     |
| `history/m3-hazards-core.md`          | M3                                                     | 57–70     |
| `history/m4-driver-bff-auth.md`       | M4 breakdown, and the old post-M4 "Next session" notes | —         |
| `history/m5-driver-app.md`            | M5 (its numbering restarts at 53, overlapping M2/M3)   | 53–64     |
| `history/m6-alerts.md`                | M6                                                     | 65–90     |
| `history/m7-voice.md`                 | M7                                                     | 91–107    |
| `history/m9-route-options-parking.md` | M9                                                     | —         |
| `history/environment-windows.md`      | Windows dev-machine notes, the 2026-09-21 reinstall    | —         |
| `history/p2-m1-organisations-auth.md` | P2-M1 breakdown, model, open decisions (active)        | —         |
| `ideas.md`                            | Field-testing ideas backlog (shipped and unscheduled)  | —         |
