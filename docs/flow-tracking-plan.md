# Flow tracking: a plan

Written 2026-11-17 at the owner's request, for approval before anything is built. **Nothing is built.** The aim is to see how drivers move
through planning a route and taking a trip, step by step, so the first-trip redesign (the design canvas from the same day) can be judged
against today's screens rather than guessed at.

## Why the usage page is not enough

The admin usage page (`modules.md`, "App usage") works its funnel out from what is saved: a vehicle profile exists, a route plan exists, a
trip exists. It cannot see which screen a driver gave up on, how long a step took, which way they picked a place, or how a trip ended. Those
are the questions the redesign raises.

## The rules it keeps

- **First party only.** Events go to WagonWise's own core and database, as everything else does. No analytics SDK, no third party, nothing
  to add to the list of processors. The app has none today; this keeps it that way.
- **Steps and fixed choices, never content.** An event is a step name from a fixed list and, where there is one, a choice from a fixed list
  (`what3words`, `hill_sensitive`). **Never** a position, an address, a postcode, search text, three words, a name or a free-text note. The
  allowed values are zod enums in `packages/contracts` (rule 11), so anything else is refused at the driver server, not just discouraged.
- **Anonymous (owner, 2026-11-17).** No driver id, account or device id is stored. Each event carries a random session id, made in memory
  when the app opens and thrown away when it closes, so the steps of one sitting can be joined and nothing more.
- **Short retention (owner, 2026-11-17): at most 90 days,** deleted by an hourly sweep, like route plans and positions.
- **Told in the privacy notice, with an opt-out.** No consent is asked: the basis is legitimate interests (improving the app), stated in the
  privacy notice drivers already see. A switch on the More tab, on by default ("Help improve WagonWise: share which screens you use. No
  locations."), turns it off. Check the ICO's current guidance on analytics before release (PECR as amended by the Data (Use and Access)
  Act 2025 allows this kind of analytics without consent where people are told and can object; not checked against the Act's text here).

## What is recorded

One table, `usage.flow_events` (migration: the next free number when built, 0095 today): `id`, `session_id` (random, made in memory when the
app opens), `event`, `choice` (nullable), `app_version`, `platform`, `at`. **No driver id.** No row-level policy: written by core and read
only by platform staff through the usage page, like the rest of `usage`. The driver server needs a signed-in driver to accept events (so
strangers cannot fill the table), but does not pass on who it was.

Events, by area. Names stay the same when the redesign replaces a screen, so before and after line up:

- **Getting started:** `walkthrough_step` (choice: 1 to 5), `walkthrough_skipped`, `home_card_tapped` (redesign), `plan_opened` (choice:
  `where_to`, `home_card`, `saved_place`, `replan`, `job`).
- **Vehicle and load:** `vehicle_prompt_shown`, `vehicle_chosen` (choice: the preset's id, `own_sizes` or `existing`), `load_chosen`
  (choice: `normal`, `hill_sensitive`).
- **Places:** `start_chosen` (choice: `my_position`, `search`, `what3words`, `map`, `saved_place`, `yard`), `destination_chosen` (choice:
  `search`, `what3words`, `map`, `saved_place`, `sample`).
- **Route:** `route_options_shown` (choice: how many, 1 to 6), `route_option_picked` (choice: the card's kind, such as `fastest` or
  `toll_free`), `route_shown`, `trip_started` (choice: `personal`, `job`).
- **Ending:** `trip_ended` (choice: `end_button`, `arrival_prompt`, `arrived_job`, `replan`, `offline_queue`), `reminder_opened` (a tap on the
  "Still on your trip?" notification). Two come from core itself, not the app: `trip_reminder_sent` and `trip_auto_ended` (the 24-hour sweep).

Leaving a step is not an event: a driver who reaches `destination_chosen` and has no `route_shown` in that session gave up there. That is
cheaper and more honest than guessing at "abandoned".

## How it is sent

- **App:** `lib/flow-events.ts` holds a small queue in memory, saved to SQLite (as the trip outbox is), and sends it in one request every
  minute, when the app goes to the background, and on opening. At most 50 events a request; anything older than a day is dropped unsent.
  Sending never blocks a screen and a failure is silent. Nothing is sent while the opt-out is on.
- **Driver server:** `POST /usage/flow-events`, checked against the contract enums, forwarded to core. Rate limited like the other routes.
- **Core:** the `usage` module gains its first write: `recordFlowEvents` (a use case with a repository port, tested against a fake) and the
  retention sweep. Its reads stay as they are.

## What the owner sees

A **Flows** section on the admin usage page (`/admin/usage`):

- **The setup steps as a funnel:** sittings (sessions) reaching each step this week, and the share that carry on to the next. Sittings,
  not drivers: a driver who plans twice counts twice. Whether drivers come back is still on the existing usage page.
- **Time per step:** the median seconds between one step and the next, so a step people stall on stands out.
- **Choice splits:** how starts and destinations are picked, Normal against Hill-sensitive, presets against own sizes, sample routes tried.
- **How trips end:** button, arrival prompt, reminder, or the server's 24-hour cut-off.
- **By app version,** so a release with the redesign can be compared with the one before.

## Privacy work that goes with it

- Privacy notice: one paragraph ("which screens you use and the choices you make on them, such as how you picked a place; never where you
  were, and not linked to your account") with the 90 days, the basis (legitimate interests) and the opt-out. `privacy-review.md` and the
  DPIA get a row; being anonymous keeps both short.
- Google Play data safety: "App activity: app interactions", collected, not shared, for analytics, optional (the opt-out).
- Apple: "Usage data: product interaction", **not linked** to the user, for analytics. **Not tracking** in Apple's sense (no third party,
  no advertising), so the label's "Not tracking" stays true.

## Order of work

1. **Core and contracts:** the table, the use case, the sweep, the driver server route, and tests (unit, Postgres, real RLS end to end).
   Live on merge; nothing sends yet.
2. **App:** the queue and the events for today's screens, and the opt-out switch. JavaScript only, so it goes out over the air with the
   `release` label. **Ship this before the redesign** so there is a "before".
3. **Usage page:** the Flows section.
4. **Redesign:** each new screen sends its events as it is built.

Steps 1 to 3 are medium in size. The privacy notice and store forms change before step 2 is released.

## Decided (owner, 2026-11-17)

- **Told in the privacy notice, not asked:** legitimate interests, with the opt-out switch on the More tab.
- **At most 90 days.**
- **Anonymous:** a session id only, no link to the driver or the account.
