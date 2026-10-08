# Ideas from field testing

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

Things worth building later, raised while actually using the app rather than planning it —
not attached to a milestone yet.

- **2026-10-03: routing quality, and Google-Maps-style route choice (cause found 2026-10-03, see below).** The owner
  planned Hexham to Hebburn and got back roads instead of the A69 and the A1, which makes no sense
  for a lorry. Aim: understand how routing really behaves, then offer several routes to pick from
  like Google Maps. **Nothing here is verified yet**; these are the first things to check, roughly
  in order of likelihood:

1. **Map coverage (now unlikely).** The live Valhalla covers Northumberland, Tyne and Wear and Cumbria (expanded 2026-09-26, `docs/deployment-guide.md`), so Hexham and Hebburn are both inside it. Still worth ruling out: confirm the tiles were rebuilt after the expansion, and that the A69 and A1 are in them.
2. **Costing.** The request is `truck` costing with only a 55 mph `top_speed` cap
   (`valhalla-routing-engine.ts`). No highway preference is set, so Valhalla's own defaults decide
   how much it favours A-roads and dual carriageways. Valhalla has options for this
   (`use_highways`, `use_trucks`, etc.). Tune against real routes, and re-record the golden
   routes afterwards (`progress.md`, standing rules).
3. **Restrictions and hazards.** A real height, weight or width restriction (or a driver-reported
   hazard) on the A-road would push the route off it correctly. If the dashboard or app shows
   "avoided restrictions" for that route, that is the answer. Check the route plan's
   `avoidedRestrictions` and the hazards near the A69 and A1.
4. **The two alternatives that exist already.** M9 offers fastest and shortest (with fuel cost).
   "Shortest" is a likely source of back-road routes if that was the one picked.
   First step when picking this up: reproduce the exact request against the deployed Valhalla, look
   at the primary and alternate routes and their geometry, and compare against a UK-wide extract
   locally. A proper multi-route picker (more alternatives, each labelled by what makes it
   different, shown on the map) comes after the cause is known, so it isn't built on top of a bad
   base route.

- **2026-10-03: what3words for job stops (not scheduled).** Raised right after the Jobs form
  moved from latitude/longitude to postcodes (`history/p2-m4-portal-jobs.md`): a postcode is no
  help for a farm gate, a quarry, a field entrance or a big yard where the right gate matters, and
  a what3words address (`filled.count.soap`) pins a 3 m square. Shape if built: a stop's location
  input accepts either a postcode or three words; the dashboard's `lib/postcodes.ts` +
  `hooks/use-postcode.ts` are the pattern to copy (live hint showing the resolved place, resolve
  again at submit). **Blocked on the owner:** what3words' API needs an account and a key, and its
  terms/pricing for commercial use should be read before committing to it. Put the key on the
  server side (a `staff-bff` route that does the lookup, key read only in that app's `config.ts`
  and added to `passThroughEnv` in `turbo.json`), not in the browser bundle like the keyless
  postcodes.io call. The same lookup could serve the driver app's destination search later. Alternatives
  if the cost or licence is a problem: a map pin picker (Phase 2 design doc), or MapTiler address
  search, which the driver app already has a key for.

- **2026-09-26: admin-only hazard delete — shipped same day.** Field-testing request: "give my
  account the ability to remove hazards, I've been making some as tests." Dismiss ("not there")
  already existed and already hides a hazard from every driver-facing query — but it's a soft
  status flip, not removal, and the row (and its "not there" outcome) could still be seen or
  reversed. The user's own call, after considering a server-config allowlist: a real `isAdmin`
  boolean on the driver record (migration 0012), not an env var — survives independently of
  deployment config. `identity.isDriverAdmin(driverId)` is the read-model hazards' new
  `AdminDirectory` port wraps (`hazards/infrastructure/identity-admin-directory.ts`, AGENTS.md
  rule 7 — hazards never imports identity's `Driver` type). `DELETE /hazards/reports/:id` (core,
  proxied unchanged through the BFF) is gated to admins only, unlike confirm/dismiss's decision
  63 ("no ownership check at all") — a true delete is a different, unrecoverable kind of action.
  The driver-app's "Delete report" button initially just showed for every driver — shipped that
  way same day, then hidden client-side later the same day (`isAdmin` added to `driverSchema`/
  the sign-in response, checked at each call site) once the user asked for it, on top of the
  server enforcing the same thing regardless. No self-service way to grant admin — it's set
  directly in the database, once, for whichever account needs it.

- **2026-09-25: text-to-speech for navigation — hazard-ahead half shipped 2026-09-26.** Split in
  two when scoped: spoken turn-by-turn directions, and a spoken warning as a hazard on the route
  approaches. The user's own call at the time: warnings now, turn-by-turn "maybe phase 3" (later brought into Phase 2 as P2-M10, see below) — full turn-by-turn
  needs live maneuver detection off the route geometry, which is a sat-nav's job this app doesn't
  need to duplicate, whereas a hazard warning is novel to this app (a sat-nav has no idea about a
  driver-reported low bridge) and cheap given what M7.3 already built.
  `lib/hazard-voice-warnings.ts`'s `hazardsAheadWithinRange` is route-relative (via
  `route-progress.ts`'s own nearest-point-on-line snap for both the driver and each hazard), not
  straight-line, so a hazard just passed never re-triggers just because it's still close as the
  crow flies. `hooks/use-hazard-voice-warnings.ts` speaks each qualifying hazard once (500m ahead,
  `expo-speech`, reusing the same dependency M7.3's confirm-out-loud step already added — no new
  native module), tracked in a `Set` that lives for one `active-trip.tsx` mount, i.e. one trip.
  Muted while the voice hazard-report flow is itself listening or speaking, so a warning never
  talks over that. Complements M7's voice _input_ (speech-to-text for reporting) with voice
  _output_. **Turn-by-turn directions: shipped 2026-10-04 as P2-M10** (`docs/history/p2-m10-spoken-directions.md`). The server stores Valhalla's maneuvers on the plan; the app speaks them in yards and miles, with a turn card, mute toggle and a tap-only "Re-plan from here".
- **2026-09-25: break suggestions** — UK HGV drivers have a statutory break requirement (45
  minutes after 4.5 hours' driving, tachograph rules), so a spoken nudge ("your break's due in
  15 minutes, there's a layby 5 minutes ahead") could genuinely help, not just be a nice-to-have.
  The user's own read: **this is a big feature**, not a quick add — it needs real drive-time
  tracking against the actual regulation (not just elapsed trip time), and a layby/food-stop POI
  data source the app doesn't have at all yet (OSM has some coverage — `highway=rest_area`,
  `amenity=parking`, `amenity=restaurant`/`cafe`/`fast_food` — but nothing's been checked for
  completeness around the test area). Would likely reuse whatever voice-output mechanism the
  text-to-speech idea above ends up using.
- **2026-09-25: congestion tracking — refined 2026-09-26 (twice), crowd-sourced half shipped
  2026-09-27 (PR #35).** The user's own framing:
  country roads in the test area rarely see real traffic, but a congested motorway can add a lot
  to a journey, so this matters more for the A1-type corridors than the rural roads M2's routing
  already focuses on. Two options discussed, and the user's own sequencing for them:
  - **Crowd-sourced first** (the near-term plan) — marked with an estimated wait time, that
    times out on its own. **Second refinement, same day**: the user's own question — should
    this be its own thing, separate from hazards, to keep hazards clean? Yes. It's a genuinely
    different _kind_ of thing from a `HazardReport` — a decaying road condition with its own
    wait-time/short-expiry lifecycle, not a persistent point obstruction a vehicle's dimensions
    get checked against (`applies()`/`isBlocking()`, the safety-critical domain function, has
    nothing to do with congestion at all). Folding it into `HazardReport` as a fourth
    `MeasurementKind` plus a type-specific expiry would loosen that domain model with fields only
    one type ever uses. Recommendation: a separate bounded context (own domain/application/
    infrastructure/interface, own migration, own map-marker style and list, consumed by routing
    and the driver-app the same read-model-port way hazards already is) — real new plumbing
    rather than reusing hazards' pipeline wholesale, but it keeps hazards' restriction logic
    untouched and gives congestion room to grow its own rules (WebTRIS ingestion, a different
    lifecycle) without hazards code having to care. **Shipped as scoped**: `packages/contracts/src/congestion.ts`,
    `apps/core/src/modules/congestion/**` (own bounded context, migration `0013_congestion.sql`),
    `apps/driver-bff/src/congestion-routes.ts`, and the driver-app half — `api/congestion.ts`/
    `use-congestion.ts`, `app/report-congestion.tsx`, teal `CongestionMarker` pins on the map,
    and a "Report traffic" button on `home.tsx`. Crowd-sourced, self-expiring reports, exactly the
    near-term half above — no WebTRIS ingestion yet.
  - **National Highways' WebTRIS API second** — confirmed genuinely free, no API key or
    registration (`webtris.nationalhighways.co.uk/api/v1.0/...`, JSON), covers England's
    strategic road network (motorways + major A-roads, including the A1 corridor near the test
    area). The user's own framing this session: couple it in _after_ the crowd-sourced half
    exists, as a second source feeding the same warnings rather than a replacement — it's
    point-based sensor data (speed/flow at fixed monitoring sites), not a route overlay, so using
    it means translating "sensor X reads slow" into "this stretch of the driver's planned route
    is congested," real work but on an already-confirmed real data source rather than a guess.
    No design or scoping done yet on either half — still just sequenced.
- **2026-09-25: light and dark mode — manual half shipped 2026-09-26.** The driver app was
  dark-only (every screen's colours hardcoded, e.g. `home.tsx`/`consent.tsx`'s `#0B1220`
  background). Scoped down to a manual toggle first (user's choice when asked): `theme/colors.ts`
  holds a `ThemeColors` token set with `darkColors`/`lightColors` palettes (`darkColors` is
  exactly the old hardcoded values, so switching to "dark" changes nothing anyone's seen);
  `state/theme-store.ts` is a zustand store persisted via SecureStore (same mechanism as
  `auth-store.ts`'s cached `DriverInfo` — no new dependency for one string), restored at boot in
  `_layout.tsx` alongside auth, and feeds both the app's own screens and expo-router's
  `ThemeProvider`/`StatusBar`. A "Dark"/"Light" toggle lives in `settings.tsx`. Every screen and
  shared component migrated from a static `StyleSheet.create` to a `createStyles(colors)`
  function called through `useMemo`. Deliberately left unthemed: `components/route-map.tsx`
  (MapLibre tiles and pin/hazard-marker colours don't repaint for an app-chrome switch) and a
  handful of floating map-overlay buttons (`home.tsx`'s menu/hazard buttons, `active-trip.tsx`'s
  mic overlay) that need to stay legible against the map's own imagery regardless of theme.
  **Still open, not attempted**: automatic sunrise/sunset switching — needs the driver's location
  (already available via `useCurrentLocation()`) and a sun-times calculation (a small library like
  `suncalc`, or a free sunrise-sunset API), recomputed as the driver moves and as days pass, not
  fixed once at app start. No design or scoping done on that half yet.
- **2026-09-27: migrations run automatically on deploy (PR #36/#37).** Ad hoc, off the back of a
  deploy where a new migration needed a manual `pnpm db:migrate` first — automated it with a DO
  App Platform `PRE_DEPLOY` job (`infra/digitalocean/app-spec.yaml`'s `jobs: [{ name: migrate,
kind: PRE_DEPLOY, run_command: "pnpm --filter @wagonwise/core run db:migrate" }]`), so a deploy
  can't ship code against a schema it hasn't migrated yet. Documented in
  `docs/deployment-guide.md` as bug #4, alongside a real incident this surfaced: `doctl apps
update --spec` (used once to add the job) wiped `core`'s App-Level `DATABASE_URL`, since the
  checked-in spec has no top-level `envs:` (no secrets are committed) — no real outage (the old
  container kept serving while the new one crash-looped), fixed by restoring the var via the DO
  console and redeploying with `doctl apps create-deployment` instead. **Rule going forward: never
  run `doctl apps update --spec` directly again** — it's a full-spec replace, not a patch.
- **2026-09-27: HGV top speed capped at 55mph in Valhalla (PR #38).** Question raised during
  field testing: does Valhalla account for HGV-specific speed limits at all? Researched directly
  against Valhalla's own `lua/graph.lua` — confirmed `maxspeed:hgv` is used only when the OSM way
  actually carries that tag, with no country-default fallback, so routes over untagged roads (most
  of them) were being timed at the full driveable speed, not a realistic truck speed. The user's
  own call once that was known: cap at 55mph (`top_speed: 88` kph in
  `valhalla-routing-engine.ts`'s truck `costing_options`) as a flat middle ground between
  motorway and A-road speeds, rather than building per-road-class HGV defaults.
- **2026-09-26/27: the business-facing "second product" (`apps/dashboard`) started for real —
  see the [Phase 2 tech design doc](https://claude.ai/artifact/LK2oYrVSwotj7E8W9tXykD) for the
  full plan and its decision log.** Built ahead of that doc's own sequencing, since an admin
  surface was needed immediately: a Vite+React app (companies, driver accounts + invite codes,
  hazard-report admin, all real and wired to real core endpoints), reusing driver OTP sign-in
  gated on `driver.isAdmin`. This also let the hazard-delete admin action (2026-09-26's entry,
  above) move from an `isAdmin`-gated button inside the driver app to the dashboard, where it now
  belongs — the driver app's own delete button, `useDeleteHazard`, and the `isAdmin` field on
  `DriverInfo` were removed once the dashboard replacement existed (2026-09-27). Also proposed,
  not yet built: a 3-tier permission model (WagonWise staff / company-scoped Fleet users with
  settable privileges / Drivers as their own linked account type) to replace the bare `isAdmin`
  flag once Fleet users exist — see the Phase 2 doc's decision log for the full shape and the
  pushback given on it.
- **2026-09-27: driver-marked safe parking (laybys etc.) — scoped into M9, same day.** Raised as
  its own thing, not the break-suggestion layby POI idea above: a driver-sourced "safe to park
  here" marker, not a break-timing nudge. See M9 task breakdown below for the scoped shape.
- **2026-09-27: route choice — multiple options (shortest / fastest / most economical) — scoped
  into M9, same day.** See M9 task breakdown below for the scoped shape, including why "most
  economical" is deferred.
  **Diagnostic, run on the Valhalla droplet** (core reaches it over a private address, so it cannot
  be queried from outside): the same Hexham to Hebburn request three ways, listing the roads used.
  A truck route that avoids the A69 and A1 while the car route uses them points at the truck
  costing or a restriction; a car route that also avoids them points at the data; a truck route
  that uses them once the 55 mph cap is removed points at that cap.

  **Cause found (2026-10-03), against the local Northumberland Valhalla:** the 55 mph `top_speed`
  cap, not the vehicle width (a 4 m width made no difference to the road chosen). Sent to `/route`,
  the cap flattens the speed difference between roads, so a faster A-road loses its edge: Hexham to
  Heddon-on-the-Wall went A68 + the Military Road (B6318), 25.7 km, instead of the A69, 24.1 km, and
  the A69 route was quicker even when timed with the same cap. Raising the cap to 96 or 105 km/h did not reliably fix it, and neither did
  setting `use_highways`. Fix: choose the route with no cap, then time that road with
  the cap via `/trace_route` (`valhalla-routing-engine.ts`). For the future route
  picker: judge the alternatives and "shortest" on the same fair footing. Not yet re-checked
  on the real Hexham to Hebburn route, because the local tiles stop at the Northumberland border.

- **2026-10-04: saved places (not scheduled).** From the redesign mock's Saved tab: places a driver
  routes to often (home, the depot, a regular delivery), saved by name and started with one tap from
  Where to? The tab holds saved voice reports until this exists. Needs a store (local first, or synced
  with the account so it follows a driver to a new phone), a way to save a place from a search result
  or the map, and a decision on whether a company can push shared places (depots) to its drivers.

- **2026-10-07: email and password sign-in instead of one-time codes (not scheduled).** Raised by the owner after
  a sign-in failure during the pilot set-up: one-time codes depend on two outside services (Resend for email,
  ClickSend for text) both working, and on the person receiving the message, which has already caused confusion.
  Email plus password would drop that dependency. It needs a password store (hashing, reset by email, which still
  needs Resend), so it is a real piece of work. For now the codes stay; the sign-in screen now says what kind of
  failure it was.

- **2026-10-08: what3words lookup, and a simpler Where to? screen (next month).** Owner's call: both wait until
  next month. what3words needs the Basic plan (£7.99 a month, 1,000 conversions; the free plan has no
  convert-to-coordinates), a key kept on core as `WHAT3WORDS_API_KEY` and optional, and a core lookup that
  caches converted addresses (check their terms on caching first). Alongside it, the Where to? screen can be
  simpler than the two text boxes plus two buttons it has now. Idea: **From** and **To** each get a small
  switch between the ways of setting it. From defaults to "My position" and says so, so a driver only changes it
  when they want to; To is a postcode, an address, what3words, a saved place or a map pin. A driver can then tap
  Start for From and type a postcode for To, or the other way round, and only sees the one input they chose
  instead of every option at once. **Update 2026-10-08: the From/To switches are built, without what3words** (From: My position / Search / Map; To: Search / Map; a driver sees only the input they chose). what3words then needs only a third option on each switch, a lookup in core and a key.

- **2026-10-08: Phase 3 goal, driver hours aware navigation ("smart break planning").** Raised by the owner. Idea:
  the app knows how much legal driving time a driver has left, and plans the break into the route: it says when a
  break is needed, offers the best HGV parking before the limit with the time to reach it, and gives an ETA that
  includes the break. Dispatchers see each driver's status (driving, break soon, on break, time remaining) next to
  their job on the live map. We already have most of the other half: HGV routing, parking with drive times
  (nearby-parking), traffic, jobs and the live map. What is new is the driver-hours state, the rules, and putting a
  required break into the ETA and the route.

  **Rules to model (check each against current GOV.UK guidance before building; they differ between GB domestic,
  assimilated EU and AETR rules, and by vehicle):** the break of 45 minutes (or 15 + 30) after 4.5 hours of driving,
  the daily driving limit (9 hours, 10 twice a week), weekly and fortnightly limits, and daily and weekly rest.

  **Where the data comes from, and what is not yet known** (the notes the owner pasted from ChatGPT are a pitch, not
  a spec; none of it is verified here):
  - A smart tachograph has a Bluetooth interface (the "ITS interface") meant for outside apps, but only newer
    smart tachographs have it, only certain data goes over it, the driver has to enable pairing, and it differs by
    manufacturer. Whether it gives "time remaining", or only driver activity from which the app works that out
    itself, is the first thing to find out. Many pilot-fleet lorries may be older, with no such interface.
  - Bluetooth from the app is a native change: a new package and permissions, so a Play build rather than an OTA
    update, and iOS adds its own limits.
  - It is personal data about working time. It needs the driver's clear consent and an update to the DPIA and
    privacy notice, and a plain answer to "can my employer see this" before a driver turns it on.
  - The app can only advise. The tachograph remains the legal record and the driver remains responsible; the screen
    wording must not read as a compliance guarantee, and a wrong number is worse than none.
    **Suggested order:** (1) find out what the pilot firm's lorries actually have, and read the ITS interface
    specification for the data it exposes; (2) build the break-planning experience first on a driver-entered or
    estimated clock (a "start my shift" timer fed by the movement we already see), because that tests the idea
    with drivers and exercises the routing and parking without any Bluetooth; (3) add the tachograph source behind
    the same screen; (4) send the status to core and show it in the portal; (5) put the break into the ETA and the
    route, including re-planning when traffic eats the time left. Pricing is a business decision and is not recorded
    here.
