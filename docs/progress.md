# Progress

**Read this file first; it's deliberately short.** It holds current status, what's next, and what's still open.
Finished milestones' task breakdowns, decisions and deviations live in `docs/history/` (index at the bottom): open one
only when working in that area. The dated change log is `docs/history/log.md` (newest first; read its top ~40 lines;
older entries are in `docs/history/log-archive.md`).

**Keeping it short:** keep this file under ~150 lines. While a milestone is active, its breakdown and decisions go in
its own `docs/history/<milestone>.md` from the start, with a one-line summary and any still-open items here. When an
item closes, delete it from this file; the history file keeps the record. Dated entries go to `history/log.md`, not here.
Use bullets, not tables: a formatted table pads every cell with spaces, which costs tokens.

## Status (2026-11-11)

- **Live.** The driver app (free, no ads) has been on the App Store and Google Play since **8 November 2026**. The fleet portal is
  £15 per vehicle per month; launch offer £10 per vehicle, fixed for three years, first firms three months free (`sales-playbook.md`).
  Company: WagonWise Ltd, no. 17530209, registered office 5 Portland Terrace, Hexham NE46 3DT; support@wagon-wise.co.uk.
- **First 24 hours** (the owner's screenshot of the usage page): 293 accounts, 293 signed in, 178 chose a vehicle, 132 planned a
  route, 95 started a trip, 10 came back on a second day. The vehicle step was the drop, which is why presets were built.
- **What the product is:** driver app (routing for the vehicle's size and weight, hazards, parking, fuel, hours, checks, SOS, jobs)
  and a staff portal (fleet, jobs and proof of delivery, live map, checks, maintenance, reports, costing, billing, sales page).
  Phases 1 to 3 are built (`phase-3-scope.md`); module notes are in `modules.md`.
- **Shipped 8 to 11 November** (details in `history/log.md`): the usage page ("Where drivers get to", new drivers by day); vehicle
  **presets** beside Metres and Feet & inches (Add a vehicle and the route planner); Share sends both store links; **Load type**
  Normal / Hill-sensitive; **tolls** named with a price on route cards and a Toll free card (five crossings); a **top speed** on a
  vehicle; a steadier map when stopped; **Euro VI** yes / no / don't know on a vehicle (stored, nothing reads it yet); the Hauliers
  page comparison with a tracker box; and **the receiver's signature**, required per job like the photo (vector strokes, kept
  under the photo's retention). The app was released with the `release` label after the signature merged (2026-11-11), and the owner took a signature end to end on a phone;
  whether the portal's signature viewer and reports are deployed was not checked.
- **Done by the owner, 2026-11-11 (owner's word):** ICO registration, a business bank account, production secrets that were pasted
  into chat rotated, the landing site deployed (new privacy wording and the comparison table), Play production access, the Ross
  Silcock email sent, the Facebook posts made, and the reply to Apple on case 23398599 (CPManeuver mock-ups) sent.

## Next up (in order)

1. **Ireland, this weekend if the gate passes** (owner, 2026-11-11; `ireland-scope.md`). One routing build covers Northern Ireland and the Republic, but the Republic must not go live until speed limits show in km/h (today an 80 km/h limit would show as 50) and the Dublin lorry rules are tested. If either fails, switch on Northern Ireland only. The tile build and swap need the owner's DigitalOcean access.
2. **MapTiler usage: put off** (owner, 2026-11-11; `map-usage-scope.md`). On Flex since 11 November; the first count was 5,260 requests, about 97% map tiles and 3% address search, so the quick fix (fewer search calls) would not help. Set a usage alert and separate keys for the app and the portal, then re-check once a full day is counted. Own map tiles are the lasting fix if the tile count grows.
3. **Check on a real phone** (the owner's word, 2026-11-11: **tried and working** are toll prices on a card, the steadier map, Hill-sensitive
   showing the A1, top speed changing an arrival time, the Euro VI control on the vehicle form, and a signature). **Still untried:** presets
   (Add a vehicle and Plan route), Share on iPhone and Android, a signature with no signal. Then read the usage page's "New drivers, by the
   day they joined" to see whether presets lifted the share choosing a vehicle (compare the days after 9 November with before).
4. **Pilot firms.** The Sales page (Admin, Sales) is the notebook: log every contact there. Price and offer: `sales-playbook.md`.
   Ask the first firms what they need: the portal is to be shaped by them (jobs, loaded and delivered, where drivers are).
5. **Loaded routing: tune it.** The A1 now shows when Hill-sensitive (owner, 2026-11-11), so the heights work. What is left is judging the
   trade: an earlier Hexham to Dundee check offered a 43-mile detour as "Fewer hills", so the steepness thresholds may want tuning once a few
   more real runs are seen. `loaded-routing-scope.md`.
6. **Charges, stages 3 and 4** (`charges-routing-scope.md`). Zones: the vehicle field, Scotland, seven English zones and London are built, on cards and on the live map
   (2026-11-11; four of the boundaries have no stated licence, the owner's call). Next a total and a Cheapest card. Toll prices and zone rates need a dated review.
7. **FORS-style records** (`fors-scope.md`, idea only): documents with expiry dates and an infringement log first. Never claim a firm is compliant.
8. **Driver sign-in without invite codes** (`driver-sign-in-plan.md`): server, driver BFF and password screens are built behind switches;
   Google and Apple sign-in need a store build and the owner's set-up. Nothing is switched on.
9. **Next native build (1.3.0)**, which also carries the Play quality fixes below, and Android Auto if it goes ahead.
10. **Small code left:** an iPhone Rate row (opens the App Store review page; the Rate row is Android only); road tax by registration is
    **parked** (DVLA is not taking new Vehicle Enquiry Service keys); a tachograph source for driver hours waits on the pilot's lorries.
    Unscheduled ideas are in `ideas.md` and `phase-5-ideas.md`.

**How the driver app ships:** JavaScript-only changes go out over the air to the installed version (`runtimeVersion` follows
`version`, currently **1.2.1**: `eas update` is published for that version only, so a phone on an older build ignores it). A native
change (new package, plugin or permission) needs `version` bumped and a Play build. Both run from `driver-app-release.yml`: the
`release` label on a PR (the owner says when; adding it after the merge releases main as it is), or Run workflow with mode `update` or
`build`. Merging alone publishes nothing. **Core, the servers and the portal go live before the app.**

## Open items

- **Waiting on Apple:** the CarPlay navigation entitlement (requested 2026-11-08; Apple's follow-up, case 23398599, was answered 2026-11-11 with
  CPManeuver mock-ups). Nothing to build until they reply. Scope and findings: `car-screen-scope.md`.
- **Privacy documents:** keep `privacy-review.md` and the Play and Apple data forms in step with the notice; the signature row and the
  "photos and signatures" wording are new (2026-11-11). Update the DPA and DPIA from `privacy-review.md`; fill any `[brackets]`; the
  restriction audit around Hexham; turn on Resend failure alerts (the webhook is built).
- **Background location would change the privacy promise** (today position is shared only while the app is open), if Android Auto
  or CarPlay needs it. See `car-screen-scope.md`.
- **Google Play quality warnings (release 1.2.1):** none blocks anything, and none can be fixed over the air, so do them in the next
  native build (1.3.0): R8 shrinking (fix by February 2027; test maps and voice on a real phone), edge-to-edge deprecated APIs (a
  library, usually gone at the next Expo SDK), portrait lock (ignored on tablets from Android 16; low priority).
- **Keys that expire or cost:** the DVSA key is revoked if unused for 90 days and its secret expires every 2 years; what3words is 1,000
  lookups a month, used only when a driver taps Find or presses SOS. Fuel prices (GOV.UK Fuel Finder) are refreshed hourly by a job in
  core: run **one core instance only**, read the data licence and terms, and show each price's age.
- **Deferred, P2-M6.4c:** a reroute-alert indicator on the live map (needs reroute detection for company jobs).

## Open questions

- How complete is OSM restriction data on testers' routes around Hexham? Overrides exist (M8); the audit itself hasn't been done.
- Is on-device speech recognition good enough with local accents and cab noise? Only field-tested informally on Android.
- What do the pilot firm's lorries have for tachographs (needed before a tachograph source for driver hours)?
- Do the five preset sizes suit real drivers? They are at or above the common height for each class; watch for feedback.

Decided 2026-09-21, revisit with testers: temporary hazard expiry 7 days; single unconfirmed reports visible immediately,
labelled "1 report, unconfirmed".

## Standing rules learned the hard way

- **Never run `doctl apps update --spec`.** It replaces the whole spec and wiped `core`'s `DATABASE_URL` once (2026-09-27).
  Deploy with `doctl apps create-deployment`. Migrations run automatically as a `PRE_DEPLOY` job (`docs/deployment-guide.md`).
- **Golden routes must be re-recorded after any routing-cost change** (e.g. the 55 mph cap, PR #38). Every nightly run prints
  `golden actual:` values; see `valhalla-routing-engine.golden-test.ts`.
- **Open every PR against main; never stack PRs.** A stacked PR merged into its base branch and never shipped (2026-10-22).
- **Two PRs adding a migration at once collide on the number** (0088 was taken by Euro VI while signatures were in review). Check
  `apps/core/migrations` on main before numbering, and add the file to the lists in `run-migrations.test.ts`.
- **The portal's typecheck is `tsc -b`, which checks test files too**; a quick `tsc --noEmit` in `apps/dashboard` does not. Run `pnpm typecheck`
  (or `npx tsc -b --noEmit` there) before pushing a change to a shared contract.

## Index: where the history went

Code comments cite "docs/progress.md, decision N" or "M6.4 deviations". Those live here (decision numbers in brackets):

- `history/foundations.md`: pre-coding decisions, architecture review, 2026-09-21 (1–14)
- `history/m1-foundations.md`: M1 (15–43); `history/m2-routing-core.md`: M2 and the pre-push hook (44–56); `history/m3-hazards-core.md`: M3 (57–70)
- `history/m4-driver-bff-auth.md`: M4; `history/m5-driver-app.md`: M5 (numbering restarts at 53, overlapping M2/M3; 53–64)
- `history/m6-alerts.md`: M6 (65–90); `history/m7-voice.md`: M7 (91–107); `history/m9-route-options-parking.md`: M9
- `history/p2-m1-organisations-auth.md`, `p2-m2-driver-links.md`, `p2-m4-portal-jobs.md`, `p2-m5-driver-app-jobs.md`,
  `p2-m6-live-map.md`, `p2-m7-moderation.md`, `p2-m8-reports.md`, `p2-m10-spoken-directions.md`: Phase 2 by milestone
- `history/saved-places.md`: saved places, public places, Just me or My company, the review screen
- `phase-3-scope.md`: Phase 3 scope, modules and what is built; `ideas.md`: field-testing ideas backlog
- `history/deployment-first-deploy.md`: the first deployment (2026-09-25) and the four bugs found getting there
- `history/log.md`: the dated change log, newest first; `history/log-archive.md`: entries to 2026-10-15 (the faster-route check, built 2026-10-10, is in here)
- Removed 2026-11-11 (still in git history): the Windows dev-machine notes, the 2026-10-04 app redesign note, the early Phase 2 build summary, and the faster-route scope.
