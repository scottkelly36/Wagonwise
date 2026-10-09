# Progress

**Read this file first; it's deliberately short.** It holds current status, what's next, and what's still open.
Finished milestones' task breakdowns, decisions and deviations live in `docs/history/` (index at the bottom): open one
only when working in that area. The dated change log is `docs/history/log.md`.

**Keeping it short:** keep this file under ~150 lines. While a milestone is active, its breakdown and decisions go in
its own `docs/history/<milestone>.md` from the start, with a one-line summary and any still-open items here. When an
item closes, delete it from this file; the history file keeps the record. Dated entries go to `history/log.md`, not here.

## Status

| Milestone                                                                                                                                                               | Status                                                                                                                                                            | Detail                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Phase 1: M1 foundations, M2 routing, M3 hazards, M4 BFF + sign-in                                                                                                       | Done, September 2026                                                                                                                                              | `history/m1…m4*.md`                                  |
| M5 driver app                                                                                                                                                           | Done on Android. iOS (TestFlight) blocked on an Apple developer account (M5.10)                                                                                   | `history/m5-driver-app.md`                           |
| M6 alerts, M7 voice, M9 route options and safe parking                                                                                                                  | Done, September 2026                                                                                                                                              | `history/m6…m9*.md`                                  |
| M8 field-ready (consent, delete account, restriction overrides)                                                                                                         | Shipped 2026-09-25. The restriction audit and onboarding are still open                                                                                           | `history/log.md`                                     |
| Phase 2: P2-M1 to P2-M10 (staff accounts, fleet, jobs, live map, moderation, reports, privacy, spoken directions)                                                       | Done 2026-10-08                                                                                                                                                   | `history/p2-m*.md`, `history/phase-2-early-build.md` |
| Phase 2 follow-ups, 2026-10-08: saved places, weather warnings, optional pickup, stored locations, several stops per job, emailed staff invitations, Where to? redesign | Built; deploy and device checks pending                                                                                                                           | `history/log.md`, `history/saved-places.md`          |
| Phase 3                                                                                                                                                                 | Scoped, not started: see `phase-3-scope.md` (money chain M1 to M6 first, then walk-round checks and maintenance; what3words, UK coverage and tachograph as asked) | `phase-3-scope.md`, `ideas.md`                       |
| Phase 4                                                                                                                                                                 | Idea list only (the owner's board)                                                                                                                                | `ideas.md`                                           |

## Next up

1. **Finish the deploy** (a driver is live, so pick a gap between jobs). Core is deployed (2026-10-08, with migration
   0037; `DASHBOARD_URL` must be set on it for staff invitations to be emailed). Still to deploy: driver-bff, staff-bff and the
   dashboard. The app update (`driver-app-release.yml`, mode `update`) was published after core; the new app reads the
   job's current stop from core, so it must never go out before core.
2. **Check on real devices:** a multi-stop job with proof required (each delivery needs its own photo); a job in flight and an
   old delivered job's photo after the migration; spoken directions; the map turning with the phone when stopped; one-tap
   parking with Undo; saved places and stored locations; the first real Met Office warning (portal and app); an email
   sign-in code to an address that is not the Resend account owner's.
3. **Before the pilot, no code:** add the photo retention wording (each company chooses, default 12 months) to the privacy
   notice and DPA; register with the ICO; fill the
   `[brackets]` in the privacy notice, DPA and DPIA and get a solicitor to review them; the restriction audit around Hexham;
   turn on failure alerts in Resend.
4. **Phase 3 has started** (`phase-3-scope.md`). Done: item 0, billing (details, plans and capacity, one live job per vehicle,
   invoices viewed in the portal; migrations 0039 to 0042); M5, walk-round checks (each company builds its own lists, drivers do
   them in the app, the office sees results and defects, optional rules before a job, retention; migrations 0043 to 0047; the app
   change is JavaScript only, so an over-the-air update sent after core and the driver BFF are deployed); and the Finances page
   (WagonWise's own costs against invoiced revenue; migration 0048). After the deploy: check the Plans page (each company starts
   with its current vehicle count), enter WagonWise's running costs on the Finances page, and fill the `[placeholders]` on the
   Billing details page before the first real invoice. M4 maintenance: registration numbers and the per-vehicle schedule are built (migrations 0049, 0050; enter your vehicles' dates on the Maintenance page), and the morning email reminder (migration 0051; set `DASHBOARD_URL` so it can link to the portal); defects into repair tasks (migration 0052; book from Defects, finish on the Maintenance Repairs tab) are built, a CSV import is next. Also add the walk-round check records (daily checks, defect photos) and the
   firm-chosen retention to the privacy notice, DPA and DPIA. Still to get: what the pilot firm's lorries and tachographs have,
   and for the later modules a fuel card sample (M3) and the what3words key (M7).

**How the driver app ships now:** JavaScript-only changes go out over the air to the installed version (`runtimeVersion`
follows `version`, currently **1.2.1**: `eas update` is published for that version only, so a phone on an older build
ignores it). A native change (new package, plugin or permission) needs `version` bumped and a Play build. Both run from
`driver-app-release.yml`: the `release` label on a PR, or Run workflow with mode `update` or `build`. Merging alone
publishes nothing.

## Open items

- **Deferred, P2-M6.4c:** a reroute-alert indicator on the live map. Needs reroute detection written for company jobs first.
  Revisit if the pilot firm wants it. Also open from M6: no Valhalla-backed check of the ETA and route preview.
- **iOS:** TestFlight and store distribution are blocked on an Apple developer account. Voice on iOS is untested.
- **Real-device gaps:** accent and cab-noise accuracy of voice is the biggest unknown; push notifications have not been
  tested on a device.
- **Deferred on purpose:** what3words (needs the Basic plan key; it is P3 M7 on the board), national GB tiles (plan in
  `ideas.md` and the deployment guide).

## Open questions

| Question                                                                         | Status                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| How complete is OSM restriction data on testers' actual routes around Hexham?    | Open. Overrides mechanism exists (M8); the audit itself hasn't been done |
| On-device speech recognition good enough with local accents and cab noise?       | Open. Only field-tested informally on Android                            |
| What do the pilot firm's lorries have for tachographs (needed for driver hours)? | Open. Find out before scoping the driver-hours feature                   |

Decided 2026-09-21, revisit with testers: temporary hazard expiry 7 days; single unconfirmed reports visible
immediately, labelled "1 report, unconfirmed".

## Standing rules learned the hard way

- **Never run `doctl apps update --spec`.** It replaces the whole spec and wiped `core`'s
  `DATABASE_URL` once (2026-09-27). Deploy with `doctl apps create-deployment`. Migrations run
  automatically as a `PRE_DEPLOY` job (`docs/deployment-guide.md`, bug #4).
- **Golden routes must be re-recorded after any routing-cost change** (e.g. the 55 mph cap, PR
  #38). Every nightly run prints `golden actual:` values; see
  `valhalla-routing-engine.golden-test.ts`.

## Index — where the history went

Code comments cite "docs/progress.md, decision N" or "M6.4 deviations". Those now live here:

| File                                  | Contents                                                                | Decisions |
| ------------------------------------- | ----------------------------------------------------------------------- | --------- |
| `history/foundations.md`              | Pre-coding decisions, architecture review (2026-09-21)                  | 1–14      |
| `history/m1-foundations.md`           | M1 breakdown, decisions, deviations                                     | 15–43     |
| `history/m2-routing-core.md`          | M2, plus the pre-push verification hook                                 | 44–56     |
| `history/m3-hazards-core.md`          | M3                                                                      | 57–70     |
| `history/m4-driver-bff-auth.md`       | M4 breakdown, and the old post-M4 "Next session" notes                  | —         |
| `history/m5-driver-app.md`            | M5 (its numbering restarts at 53, overlapping M2/M3)                    | 53–64     |
| `history/m6-alerts.md`                | M6                                                                      | 65–90     |
| `history/m7-voice.md`                 | M7                                                                      | 91–107    |
| `history/m9-route-options-parking.md` | M9                                                                      | —         |
| `history/environment-windows.md`      | Windows dev-machine notes, the 2026-09-21 reinstall                     | —         |
| `history/p2-m1-organisations-auth.md` | P2-M1 breakdown, model, open decisions                                  | —         |
| `history/p2-m2-driver-links.md`       | P2-M2 driver links: plan and decisions (active)                         | —         |
| `history/p2-m4-portal-jobs.md`        | P2-M4: jobs in the portal                                               | —         |
| `history/p2-m5-driver-app-jobs.md`    | P2-M5: jobs in the driver app (active)                                  | —         |
| `history/p2-m7-moderation.md`         | P2-M7: hazard moderation and trust scoring (active)                     | —         |
| `history/p2-m6-live-map.md`           | P2-M6: live fleet map, and the tracking/store-review notes (active)     | —         |
| `history/driver-app-redesign.md`      | Driver app redesign to the owner's mock, and the Android safe-area fix  | —         |
| `history/p2-m8-reports.md`            | P2-M8: reports and CSV export                                           | —         |
| `history/p2-m10-spoken-directions.md` | P2-M10: spoken turn-by-turn directions                                  | —         |
| `phase-3-scope.md`                    | Phase 3 scope: modules, order, proof, open questions (draft)            | —         |
| `history/phase-2-early-build.md`      | Phase 2 as built early: dashboard, fleet, jobs core, jobs in the portal | —         |
| `history/saved-places.md`             | Saved places: a farm's real gate, company-wide, with notes              | —         |
| `history/log.md`                      | The dated change log, newest first (moved out of this file)             | —         |
| `ideas.md`                            | Field-testing ideas backlog (shipped and unscheduled)                   | —         |
