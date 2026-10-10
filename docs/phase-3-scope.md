# Phase 3 scope (draft, 2026-10-08)

A draft to agree with the owner before building. The modules and their numbering come from the owner's whiteboard; the
order, sizes and "proof it works" are proposals. Update this file as decisions are made, and keep it short.

## Where Phase 3 stands (2026-10-09)

- **Built:** item 0 billing; M5 walk-round checks (each firm builds its own, with rules before a job and retention); M4 fleet
  maintenance (registration numbers, items and dates per vehicle, the `manage_maintenance` privilege, morning email reminders,
  defects into repair tasks, spreadsheet import); M1, M2 and M6 as WagonWise's own books (the Finances page).
- **Waiting on something from the owner:** M3 fuel card (a sample statement and the provider); M7 what3words (the key);
  M8 UK coverage (a customer outside Northumberland); M9 (what the pilot's lorries have; see below); text reminders (a text
  sender, mobile numbers, cost sign-off).
- **Client money (started 2026-10-09):** a customer and a price on each job; fuel card import; running costs per vehicle and for the firm, and what each driver costs an hour; and the cost and profit of a month's jobs by job, vehicle and customer (all built; costs are money-person only). and a look ahead (the last six months and a three-month guess with what-if sliders). The money board is done; what the first real firm shows is missing comes next.

## Principles (the owner's)

- **Small first companies at the end of Phase 3; no big companies until the end of Phase 4**, when it is a finished product
  to sell. Big fleets are approached only through people the owner knows.
- **Price:** £10 per vehicle per month at rollout (kept for founders), £15 target. The driver app stays free.
- **Rollout stages (whiteboard):** 1) 25 drivers using the app, 15 active; 2) 5 companies using it, small haulage; 3) 1 paying company; 4) 10 companies and the Play Store release. Phase 3 ends around stages 2 and 3.
- **Each module is proven with a real company before the next starts.** Each company chooses its own retention for what it
  stores (photos today; extend the same setting to new data).

## Order and why

| #   | Module                                    | What it is                                                                                                                                         | Needs from the owner                                                                       | Proof it works                                                      | Size |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---- |
| 0   | Billing basics (not on the board, add it) | Bill the vehicle capacity a company commits to (admin-set, changed month to month), not vehicles in use. Invoices generated from the admin portal. | How the first paying company wants to be billed; WagonWise's trading name and bank details | The first invoice is right without a spreadsheet                    | S    |
| M1  | Costing                                   | WagonWise's own running costs, entered once and carried on (built as the Finances page). A client's cost per vehicle and per job is not built      | Nothing for now; a client's own cost headings if one asks                                  | The owner trusts the monthly cost figure                            | M    |
| M2  | Revenue                                   | Revenue taken from the invoices WagonWise issues (built, Finances page). A client's revenue per job, rates and customers is not built              | How a pilot firm prices jobs and whether they invoice per job or load, if one asks         | The Finances figures match the invoices                             | M    |
| M3  | Fuel card CSV                             | Import a fuel card statement and match fuel to vehicles and jobs                                                                                   | A sample CSV and which card provider the pilot firm uses                                   | A month's fuel matches the card statement to the pound              | M    |
| M6  | Profit projection                         | Profit and a look-ahead on the Finances page (built, for WagonWise's own books). Per job and per vehicle needs the client-side M1 and M2           | Nothing new                                                                                | The owner trusts the number for a decision they were already making | M    |
| M5  | Driver walk-round checks                  | The daily vehicle check in the app, with photos and defects                                                                                        | The pilot firm's current check form                                                        | Drivers do it daily and a defect reaches the office the same day    | M-L  |
| M4  | Fleet maintenance                         | Service, MOT and inspection due dates per vehicle, reminders, defects from M5                                                                      | The pilot firm's inspection routine                                                        | Nothing due is missed for a month                                   | M    |
| M7  | what3words                                | Look up three words on the Where to? screen and the job form                                                                                       | The Basic plan key (£7.99 a month)                                                         | A driver finds a farm gate from three words                         | S-M  |
| M8  | UK coverage                               | National GB routing tiles                                                                                                                          | A customer outside the Northumberland tiles; the plan is in the deployment guide           | Routes work in a new county                                         | M-L  |
| M9  | Tachograph / driver hours                 | Driver-entered clock first (no connection), then a tachograph source: see "Driver hours and tachograph" below                                      | What the pilot firm's lorries and tachographs have, and their rule set                     | Break advice drivers use and trust                                  | L    |

## Suggested sequence

1. **The money chain first: 0, M1, M2, M3, M6.** It is what a paying company will ask about, and M1 feeds the income
   projections. M1 needs the owner's real running costs.
2. **Then the compliance chain: M5, then M4.** Walk-round checks create the defects that maintenance tracks.
3. **In parallel, only when asked:** M7 (when the key arrives) and M8 (when a customer needs another area).
4. **M9 starts as a cheap research spike now**, to learn what the pilot's lorries have, and is built last.

## Billing model (decided with the owner, 2026-10-09)

- **Bill the commitment, not the usage.** Each company has a vehicle capacity set by a WagonWise admin; the bill is capacity
  times a price per vehicle (default £10, overridable per company). Capacity is effective-dated so changing it never alters a
  past invoice. Creating a fleet vehicle beyond capacity is refused. Not per driver.
- **One live job per vehicle**, so capacity means something (a vehicle cannot carry several drivers' jobs at once).
- **Invoices are generated from the admin portal** (draft, review, issue, mark paid by hand; printable page that saves as a
  PDF). Issuing is refused while WagonWise's billing details still hold `[placeholders]`.
- **Built:** WagonWise's billing details (Billing details page); each company's price per vehicle and effective-dated
  capacity (Plans page), enforced when a vehicle is created; one live job per vehicle; invoices (draft, adjust, issue, mark paid,
  cancel, print as PDF); the company's own plan and invoices page (`manage_billing`). Billing basics (item 0) is done. Invoices are viewed in the company's portal and are not emailed (owner's call, 2026-10-09: saves sending; revisit if a company asks).

## Walk-round checks (M5), decided with the owner 2026-10-09

- **Each firm builds its own check lists**, because firms differ and some want none. Question types: tick or flag a defect, yes or
  no, a number, a note, a photo; per question: required, photo on defect, severity (fix soon or do not drive). Built by
  `manage_fleet`.
- **Decided defaults:** whether a check must be done before a job is a per-firm setting, off by default; a check is once per vehicle
  per day; defects go to an office inbox (open, acknowledged, fixed); the firm chooses how long records are kept.
- **Slices:** 1 the list builder (built); 2a the server side of a driver doing a check (built); 2b the driver app screen, offline
  with photos (built); 3a the office results page and defects inbox (built); 3b the before-a-job rules and gate (built); 3c retention (built, so M5 is done); 4 defects feeding maintenance (M4). The
  example list is not a standard and the app does not make a firm compliant.

## Finances (M1, M2 and M6 reframed), decided with the owner 2026-10-09

- The owner does not yet know the figures, so M1 and M2 became WagonWise's **own** books rather than a client's: an admin enters the running costs, revenue is taken from the invoices already issued, and M6's profit and look-ahead sit on the same page.
- **Costs are standing**: entered once, they carry on every month until changed or stopped. Changing the amount from a month keeps the earlier months as they were. Automating the entry (reading a bill, a recurring payment feed) is a later idea.
- **Built:** the Finances page (costs, revenue by month and by company, profit on invoiced and received, twelve months, look ahead). Per-vehicle and per-job costing for client companies is not built, and would follow only if a company asks.

## Fleet maintenance (M4), decided with the owner 2026-10-09

- **Dates and reminders per vehicle, built like the check lists:** each firm has its own list of things that fall due (MOT,
  6-weekly safety inspection, service, tachograph calibration, tail-lift, road tax...), a starter list to edit, a repeat interval
  and a warn-me-before period. Per vehicle: when last done or next due; "mark done" rolls it forward and keeps a history.
- **It lives on the vehicle profiles page** (a maintenance panel per vehicle), plus a Maintenance overview of what is overdue or due
  soon.
- **Who:** a new assignable privilege (`manage_maintenance`) so a manager can give it to whoever books vehicles in; managers keep it.
- **Reminders:** each person chooses how they are told (email or only the portal built; text to follow once there is a general text sender and a mobile number on file); the portal always shows what is due.
- **Advisory only for now:** an overdue item never stops a vehicle being sent out. Out of scope for now: mileage intervals, automatic
  MOT lookup by registration, certificate uploads.
- **Slices:** 1 registration on vehicle profiles (built); 2 items, the per-vehicle schedule, the Maintenance views and the `manage_maintenance` privilege (built); 3 the
  reminders with a notification preference (built); 4 defects into repair tasks (built); 5 a CSV import of dates for firms with many vehicles (built, so M4 is done).

## Cross-cutting

- **Privacy and legal:** every new kind of data (fuel card data, vehicle checks, defect photos) needs the privacy notice, DPIA
  and DPA updated, and an owner-set retention. The legal pack is written; a solicitor has not reviewed it yet.
- **Pricing and billing:** there is no billing system. Start with an invoice made by hand from the usage report (item 0).
- **Deploys:** core, the BFFs and the dashboard auto-deploy on merge; the app ships by `driver-app-release.yml` (OTA for
  JavaScript, a Play build for native changes such as camera or Bluetooth).

## Driver hours and tachograph (M9), outlined 2026-10-09

The aim is the owner's "smart break planning": the app knows how much legal driving time a driver has left, and plans the break
into the route (when it is needed, the best HGV parking before the limit, an ETA that includes it). The background and open
facts are in `ideas.md` (2026-10-08). It is built in two tracks, the first needing no connection to the vehicle.

**The rules to model are checked against current GOV.UK guidance before anything is built, per rule set** (GB domestic, assimilated
EU, AETR) **and per vehicle.** They are not copied from memory into code. The first pass covers the break after 4.5 hours of
driving (45 minutes, or 15 then 30), the daily driving limit (9 hours, 10 twice a week), the weekly and fortnightly limits, and
daily and weekly rest. A firm picks which rule set applies to each vehicle.

### Track A: driver-entered clock (no connection to the vehicle)

- The driver taps **Start shift** (and Break, Rest, Finish); the app also suggests a start from movement it already sees, which the
  driver confirms. Driving time is counted from the app's own movement and the driver can correct it.
- The screen shows driving time used, time to the next break, and the day's limit. Wording is advice only: the tachograph is the
  legal record and the driver is responsible. A number the app is unsure of is shown as unknown, never guessed: a wrong number is
  worse than none.
- Break planning on the route: when a break will fall due before the destination, the app offers HGV parking along the route
  before the limit (the existing nearby-parking search) with the drive time to each, and the ETA includes the break. Re-plan when
  traffic eats the time left.
- Dispatchers see each driver's status (driving, break soon, on break, time left) beside the job, if the driver has allowed it.
- A JavaScript-only change at first (over the air); core stores the shift state per driver so the portal can show it.
- **Why first:** it works for every lorry, old or new, and tests the idea with drivers and exercises routing and parking without
  any Bluetooth.

**Built so far (Track A):** the rules and the clock (`lib/driver-hours.ts`), the shift record on the phone, break planning on the trip screen (`lib/break-plan.ts`), weekly and fortnightly driving limits, and the Driving hours
screen in the More tab. Status sharing with the company is built. Still to build: weekly rest.

### Track B: Bluetooth to the tachograph (phone, Android only), scoped 2026-10-10

**Source:** Appendix 13 of Regulation 2016/799 (the ITS interface), as retained in GB law
(<https://www.legislation.gov.uk/eur/2016/799/annex/1/appendix/13>). Read through a summary on 2026-10-10: **the appendix and its
Annex 1 must be read in full before building**; every fact below is to be re-checked there.

What the specification says:

- **The interface is optional.** A tachograph may be fitted with it; the manufacturer is not required to. A unit that has it follows
  one standard, so one piece of code can read any maker's unit; a unit without it cannot be read this way at all.
- **Bluetooth Classic with the Serial Port Profile, Bluetooth 4.2 or later.** Not Bluetooth Low Energy. Android apps can use this;
  **iPhone apps cannot** (iOS does not let ordinary apps use Classic serial links). So the connection is **Android only**; iPhone
  drivers keep the manual clock.
- **Data:** more than 80 items. The useful ones are classed as personal and are given only with the driver's consent: working
  state, continuous driving time, cumulative break time, daily and weekly driving counters, time remaining until a rest, speed,
  position. Non-personal items are vehicle identity and calibration dates.
- **Pairing:** the driver pairs the phone with a PIN of at least 4 digits on the unit; paired devices go on a list of up to 64; three
  wrong attempts lock the pairing out for a growing time, and only an 8-digit code from the tachograph's maker clears a permanent
  lock. **Consent** is recorded in the tachograph when the driver first inserts their card; without it the personal data is withheld.
- The appendix says nothing about how an app presents the data, and sets no certification for apps.
- A separate specification, the **Remote HMI** (a transport protocol document on the Joint Research Centre's site), exists for smart
  tachograph V2; its PDF was unreadable to our tool. Read it before deciding whether it matters here.

What we would build (all behind the same Driving hours screen, so nothing the driver sees changes):

1. A parser and a **simulator** written from the specification, with tests, needing no hardware.
2. A connection screen in Driving hours (Android only): pair, give consent, status, disconnect. "Connected to tachograph" replaces
   the driver's own taps with the unit's working state and counters; the manual clock stays as the fallback and the only option on
   iPhone or an older unit.
3. A native change: a Bluetooth Classic package and permissions. **A version bump (1.3.0) and a Play build, not an over-the-air update.**
4. Real-unit testing before anyone relies on it. Pairing and data differ in practice between makers.

What to find out first:

- Which lorries the testing firm or driver actually has (analogue, digital, smart v1, smart v2) and whether the ITS interface is
  enabled on them. **How many GB lorries carry smart V2 units is unknown** (the EU mandate dates may not apply to GB-registered
  vehicles); ask real fleets.
- What their drivers carry (Android or iPhone).

Reading the driver card or downloading tachograph files for the office is a different thing (the office's legal duty to download
and keep data). Not in this scope.

### Track C: telematics integration (server to server), proposed 2026-10-10

Many of the firms this product is for **already have telematics** (Webfleet, Samsara, Microlise, Geotab and others), and those
systems already hold their drivers' tachograph and hours data, from the lorry's own unit (a box wired into the vehicle, often
reading the tachograph remotely) and from the driver card. Taking it from there instead of from the phone has real advantages:

- **Works on iPhone and Android, and on lorries with no Bluetooth tachograph**, because the telematics box does the reading.
- **No pairing or per-driver set-up** beyond the firm connecting its account once.
- It sits beside what the firm already trusts and pays for, and the firm is already the one holding this data.

Facts found on 2026-10-10 (from the providers' own pages, so marketing, not terms):

- Webfleet offers **TachoShare.connect**, an API for partners to read tachograph data stored in a customer's Webfleet account.
- Samsara advertises an open API and tachograph management with **live remaining driving hours**.
- Microlise advertises remote download of tachograph data.

What is **not** known and decides whether this is worthwhile:

- Whether each provider lets a small third party in (partner agreements, approval, cost), and whether the data is live (minutes) or
  only as fresh as the last remote download (could be a day).
- What each API returns: remaining time directly, or activities from which we would work it out.
- Which telematics the first firms actually use. Each provider is its own integration; start with one, the one the first firms use.

How it would fit: the firm connects its telematics account in the portal (a credential held by core, encrypted); core reads each
driver's hours and shows them in the portal and in the driver's app, replacing the driver-entered clock for that driver. The
driver's consent and the notice still apply, as the driver's working time is shown in a new place.

**Recommendation:** ask the testing driver and the first firms two questions (what tachograph units, and which telematics, if any).
If most use one telematics, Track C for that provider is likely to reach more drivers sooner than Bluetooth; Track B stays a
smaller, optional extra for Android drivers on smart V2 units. Both need the Track A screen and rules that already exist.

### Privacy and safeguards (both tracks)

The consent wording, the rules for sharing status with a company, the privacy-notice text and the questions for a solicitor are
in [`driver-hours-consent.md`](driver-hours-consent.md) (approved by the owner and built on 2026-10-09; a solicitor has not read it).

- This is personal data about working time. It needs the driver's clear consent and a plain answer to "can my employer see this"
  before a driver turns it on; the DPIA and privacy notice are updated first. Whether the office sees status at all is a firm
  setting, off by default, and the driver sees that it is on.
- Retention follows the firm-chosen setting used for checks.
- The app never says a driver is compliant, never blocks a job, and never overrides the tachograph.

### Order

1. Ask the pilot firm what their lorries and tachographs have, and which rule set each runs under (this is the one question).
2. Check the rules against GOV.UK and write them down as a table with the source for each.
3. Track A, in slices: the clock and rules with tests; the screen and shift controls; break planning with parking and the ETA;
   status to core and the portal.
4. Track B (Bluetooth) and Track C (telematics) only once the answer to step 1 says which is worth it; the order depends on what the first firms have.

## Goals for the end of Phase 3

- 5 companies using the app, 1 paying (aim for 2), at £10 per vehicle. Realistic income is small (about £80 to £200 a month);
  the point is proof, not revenue. The sales workbook and projections are with the owner (not in the repo).
- A company can see what a job cost, earned and made, from its own data.
- Checks and maintenance replace a paper or spreadsheet process for at least one company.

## Phase 4 on the board (not scoped)

M0 legal; M2 abnormal load checks; M3 survey checklist; M4 notifications, reading and tracking responses, sign-off; M5 movement
mode, deviation alerts, escort view; M6 movement records, shadow pilot; M7 TomTom congestion integration; M8 responsive
deviations. Phase 4 ends with the product ready for big fleets.

## Open questions for the owner

1. The real monthly running costs (hosting, maps, email and text, Valhalla, the owner's time) for M1.
2. Which pilot company, and which of walk-round checks or maintenance they would want first.
3. Which fuel card provider the pilot firm uses, and a sample CSV.
4. How the first paying company should be billed.
5. What tachographs the pilot firm's lorries have, and which rule set each runs under (for M9; see "Driver hours and tachograph").
