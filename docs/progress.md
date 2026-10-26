# Progress

**Read this file first; it's deliberately short.** It holds current status, what's next, and what's still open.
Finished milestones' task breakdowns, decisions and deviations live in `docs/history/` (index at the bottom): open one
only when working in that area. The dated change log is `docs/history/log.md` (newest first; read its top ~40 lines;
older entries are in `docs/history/log-archive.md`).

**Keeping it short:** keep this file under ~150 lines. While a milestone is active, its breakdown and decisions go in
its own `docs/history/<milestone>.md` from the start, with a one-line summary and any still-open items here. When an
item closes, delete it from this file; the history file keeps the record. Dated entries go to `history/log.md`, not here.
Use bullets, not tables: a formatted table pads every cell with spaces, which costs tokens.

## Status (2026-10-26)

- **Phase 1** (M1 foundations, M2 routing, M3 hazards, M4 BFF and sign-in, M5 driver app, M6 alerts, M7 voice, M8 field-ready, M9
  route options and safe parking): done. Android is live (Play closed test, over-the-air updates). iOS waits on Apple.
- **Phase 2** (staff accounts, fleet, jobs, live map, moderation, reports, privacy, spoken directions): done 2026-10-08, plus
  follow-ups (saved places, weather warnings, stored locations, several stops per job, emailed staff invitations).
- **Phase 3** (`phase-3-scope.md`): built. Billing and invoices, Finances (WagonWise's own books), costing for a company (fuel
  card import, running costs, job costs, outlook), walk-round checks, maintenance (with MOT and tax lookup by registration),
  driver hours (clock, break planning, sharing with a company), Great Britain coverage, what3words on Where to?.
- **Built since, from field testing** (details in `history/log.md`): speed limits, cameras and traffic on the trip screen; hazards
  only when on the route and ahead, and not when on a road that crosses it; public places with a review screen, and Just me or My
  company when marking; SOS (hold a button, the company is told where you are); batch invite codes; iOS preparation.
- **Phase 4:** idea list only (`ideas.md`).

## Next up

1. **App stores** (owner, waiting). Apple: enrolment for WagonWise Ltd submitted 2026-10-24, being processed; then
   `deployment-guide.md` section 9c for the first TestFlight build (voice on iOS is untested). Google Play: the closed test runs
   with about 25 testers, and 12 or more must stay opted in for 14 days in a row before applying for production access.
2. **Before the pilot, no code:** privacy notice, DPA and DPIA need the photo retention wording, **SOS** (position, name and
   contact sent to the company on a button press, kept 30 days after it closes, deleted with the account; WagonWise does not
   contact the emergency services), **public places**, location sharing, and the processors (TomTom, what3words, DVSA); fill
   the `[brackets]` and get a solicitor to review; register with the ICO; the restriction audit around Hexham; turn on Resend
   failure alerts (the webhook is built); **rotate every production secret that was pasted into a chat** before launch
   (rotating `STAFF_SECRET_KEY` makes staff enrol again).
3. **Check on real devices** (none of these has been tried on a phone yet): hold-to-send SOS and its cancel, the portal strip and the
   email; 3 words on Where to?; Share with all drivers, Make private, Report, and the Reported places page; the A69 bridge and
   crossing-road fix; push notifications; voice with accents and cab noise.
4. **Small code left:** (what3words is on _Where to?_, SOS and the portal job form; _From_ by three words in the driver app is **not planned unless a driver asks**, owner 2026-10-26); road tax by registration is **parked** (DVLA is not taking new applications for its Vehicle Enquiry Service key and the API is in beta, as the owner found on 2026-10-26; tax dates stay a typed or imported date, and the code is ready if a key ever arrives) (MOT comes from DVSA,
   which is on); a tachograph source for driver hours (waits on what the pilot's lorries have). Unscheduled ideas in
   `ideas.md` (for example email and password sign-in for drivers) are not in this list.

**How the driver app ships now:** JavaScript-only changes go out over the air to the installed version (`runtimeVersion`
follows `version`, currently **1.2.1**: `eas update` is published for that version only, so a phone on an older build ignores
it). A native change (new package, plugin or permission) needs `version` bumped and a Play build. Both run from
`driver-app-release.yml`: the `release` label on a PR (the owner says when), or Run workflow with mode `update` or `build`.
Merging alone publishes nothing. Core and the portal go live before the app.

## Open items

- **Company:** WagonWise Ltd, company number 17530209, registered office 5 Portland Terrace, Hexham NE46 3DT. D-U-N-S is in hand
  (not recorded here). Still to do: ICO, a business bank account, the company details on the Billing details page.
- **Google Play quality warnings (release 1.2.1):** none blocks the closed test or production access, and none can be fixed over
  the air, so do them together in the next native build (bump `version` to 1.3.0): R8 shrinking (code optimisation under 25%,
  fix by February 2027; test maps and voice on a real phone), edge-to-edge deprecated APIs (a library, usually gone at the next Expo
  SDK), portrait lock (ignored on tablets from Android 16; low priority).
- **Keys that expire or cost:** the DVSA key is revoked if unused for 90 days and its secret expires every 2 years; what3words is
  1,000 lookups a month, used only when a driver taps Find or presses SOS.
- **Deferred, P2-M6.4c:** a reroute-alert indicator on the live map (needs reroute detection for company jobs). No Valhalla-backed
  check of the ETA and route preview.

## Open questions

- How complete is OSM restriction data on testers' routes around Hexham? Overrides exist (M8); the audit itself hasn't been done.
- Is on-device speech recognition good enough with local accents and cab noise? Only field-tested informally on Android.
- What do the pilot firm's lorries have for tachographs (needed before a tachograph source for driver hours)?

Decided 2026-09-21, revisit with testers: temporary hazard expiry 7 days; single unconfirmed reports visible immediately,
labelled "1 report, unconfirmed".

## Standing rules learned the hard way

- **Never run `doctl apps update --spec`.** It replaces the whole spec and wiped `core`'s `DATABASE_URL` once (2026-09-27).
  Deploy with `doctl apps create-deployment`. Migrations run automatically as a `PRE_DEPLOY` job (`docs/deployment-guide.md`).
- **Golden routes must be re-recorded after any routing-cost change** (e.g. the 55 mph cap, PR #38). Every nightly run prints
  `golden actual:` values; see `valhalla-routing-engine.golden-test.ts`.
- **Open every PR against main; never stack PRs.** A stacked PR merged into its base branch and never shipped (2026-10-22).

## Index: where the history went

Code comments cite "docs/progress.md, decision N" or "M6.4 deviations". Those live here (decision numbers in brackets):

- `history/foundations.md`: pre-coding decisions, architecture review, 2026-09-21 (1–14)
- `history/m1-foundations.md`: M1 (15–43); `history/m2-routing-core.md`: M2 and the pre-push hook (44–56); `history/m3-hazards-core.md`: M3 (57–70)
- `history/m4-driver-bff-auth.md`: M4; `history/m5-driver-app.md`: M5 (numbering restarts at 53, overlapping M2/M3; 53–64)
- `history/m6-alerts.md`: M6 (65–90); `history/m7-voice.md`: M7 (91–107); `history/m9-route-options-parking.md`: M9
- `history/environment-windows.md`: Windows dev-machine notes; `history/driver-app-redesign.md`: redesign and the Android safe-area fix
- `history/p2-m1-organisations-auth.md`, `p2-m2-driver-links.md`, `p2-m4-portal-jobs.md`, `p2-m5-driver-app-jobs.md`,
  `p2-m6-live-map.md`, `p2-m7-moderation.md`, `p2-m8-reports.md`, `p2-m10-spoken-directions.md`: Phase 2 by milestone;
  `phase-2-early-build.md`: Phase 2 as built early
- `history/saved-places.md`: saved places, public places, Just me or My company, the review screen
- `phase-3-scope.md`: Phase 3 scope, modules and what is built; `ideas.md`: field-testing ideas backlog
- `history/log.md`: the dated change log, newest first; `history/log-archive.md`: entries to 2026-10-15
