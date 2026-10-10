# Log, newest first

Every dated change, moved out of `docs/progress.md` on 2026-10-08 to keep that file short. Open it to find when or why
something changed, not to start work: `progress.md` has the current state. Add new entries at the top of the list.

- 2026-10-10: **tachograph connection scoped (docs only).** Track B (Bluetooth) rewritten from Appendix 13 of Regulation 2016/799: the ITS interface
  is optional, Bluetooth Classic with the Serial Port Profile (so Android only, not iPhone), personal data only with the driver's
  consent and a PIN pairing; needs a native change (version 1.3.0, Play build). New Track C: read hours from the firm's own telematics
  (Webfleet TachoShare.connect, Samsara, Microlise and others), which would work on any phone and on older lorries. Nothing built;
  both wait on what the first firms' lorries and telematics are.
- 2026-10-10: **parking card: green and grey.** The driver app's parking card now always shows the seven facilities (toilets, showers, shop, food, fuel, lit, secure): green when the spot is known to have it, grey when it does not or nobody has said, with a line saying so; Paid or Free is shown in words when known. Grey deliberately does not separate a known "no" from "not known".
- 2026-10-10: **parking spots: a portal page, and what a driver wants to know.** New **Parking spots** page (Content, WagonWise staff only) and
  `GET/POST /staff/parking/spots`, `PUT/DELETE /staff/parking/spots/:id`: search by name or note, filter by source, add a spot
  (latitude, longitude pasted from a map), edit, and delete any spot. Spots now carry `source` (driver, admin, osm), an optional
  name, lorry capacity, and eight facts that are yes, no or not known (paid, toilets, showers, shop, food, fuel, lit, secure) (migration
  0060; a driver's spot has a reporter, the others none). The driver app's parking card shows the name, where it came from, spaces,
  and the facilities known to be there (never a "no", never a guess), with the OpenStreetMap credit on imported ones. A one-off
  starting set from OpenStreetMap is produced by `apps/core/scripts/fetch-osm-parking.mjs` into migration 0061 (lorry parking
  `hgv=designated` or with a lorry capacity, `highway=rest_area`, `highway=services`; nothing private; not refreshed). Drivers cannot
  yet add facilities themselves.
- 2026-10-09: **driving-hours clock on the navigation screen.** A small clock above the report buttons on the trip screen (`components/hours-quick-bar.tsx`) shows what the driver is doing and the driving left (amber under 30 minutes, or an invitation to start when no shift is on). One tap opens four large buttons (Driving, Other work, Break, Rest, plus Finish for now); one tap changes it and closes it. Same store and rules as More > Driving hours; no typing, no leaving the map.
- 2026-10-09: **arrival times with breaks.** (1) Driver app: the route overview shows "ETA 14:35 with a break" (or "N breaks") for a
  driver whose shift is on and who is leaving now, and says when a rest is needed first (`planForShift` in `lib/break-plan.ts`). (2)
  Portal: the live map's ETA for a driver who shares their hours adds the breaks they will need ("+ a break"), or says the driver needs a
  rest before arriving. For this the shared status now also carries three optional numbers (migration 0059, `hours.status`:
  `break_min`, `stretch_min`, `until_limit_min`: the rule's break length and allowed stretch, and the driving left before a rest). An
  older app sends none, and then nothing is added. The office ignores a status older than 15 minutes. The sharing consent wording
  (version 1) is unchanged: it already says "roughly how much driving time you have left"; the solicitor review should see these three
  figures. Only the break rule is modelled, as in the trip screen.
- 2026-10-09: **GitHub Actions minutes.** The free allowance ran out (about 1,500 minutes used in a week). CI now runs on pull requests only (not again on main after a merge) and can be run by hand; the driver app release workflow no longer waits on a CI run on main, and runs only when a pull request carrying the `release` label merges or is labelled after merging, checking that pull request own CI run. Pull requests that do not carry the label skip the release job, so cost nothing.
- 2026-10-09: **app usage page for WagonWise admin.** New **App usage** page (Customers, WagonWise staff only) and
  `GET /staff/usage`, from a read-only core module `usage` (no table of its own; one SQL read-model adapter). It shows drivers and
  office staff by when they last used the app (last day, week, month, never signed in), firms and how many were used this week,
  phones registered for alerts, trips running now, people waiting to test, trips per day (14 days), jobs created and delivered
  and vehicle checks per week (8 weeks), and a table of firms (drivers, vehicles, office staff, jobs this month, last used).
  Counts only: no driver is named. "Used" is the last time a session was signed in or renewed, so it lags a little for someone
  who keeps the app open. App version and Android/iPhone split are not stored, so are not shown.
- 2026-10-09: **tester sign-up landing page.** A one-page site (`sites/landing/index.html`, no build) at wagon-wise.co.uk where
  drivers and firms leave an email to test the app: email, optional name, "driver / fleet / both / other", optional company and
  fleet size, and a ticked consent box. It posts same-origin to `/signups`, which the DO ingress sends to driver-bff (so no
  CORS is opened on the API); driver-bff forwards to core's new `signups` module (migration 0058, schema `signups`, platform
  scope only under RLS). Abuse controls: a hidden trap field, an address already held answers the same and changes nothing, and
  a cap of 500 sign-ups a day. A "Remove my email" form (`POST /signups/remove`, always 204) lets people take themselves off
  (unverified, so anyone who knows an address could remove it: accepted). Dashboard: **Testers** page (Customers, WagonWise
  staff only) with count, search, remove, and a spreadsheet download. No contact address is published on the page.
- 2026-10-09: **projections: a look ahead (Phase 3 M6 for a client).** New **Looking ahead** page (Costs and profit) and
  `GET /staff/costing/companies/:companyId/outlook?month=` (needs `manage_billing`). It shows the last six months of what came in and
  what it cost (the current month last, marked "so far") and a **three-month guess** (`domain/outlook.ts`, with tests). **How the guess
  is made, plainly:** revenue, wages and fuel are each the average of the **last three complete months that had jobs** (they move
  with how much work there is); vehicle running costs and overheads are **what the firm already pays in each month ahead**, taken from
  the costs entered (so a cost stopped or started is reflected, and they are not averaged). The month in progress is shown but not used.
  It says which months it is built from, shows the revenue a typical month ahead needs to break even, and **does not invent a
  forecast** when no complete month has a delivered job. Three **what-if sliders** (revenue, fuel price, driver cost, each plus or
  minus 30% in steps of 5) recompute the next three months in the browser; **nothing is saved**. Each month is worked out the same
  way as Job profit, from one read of the jobs, fuel, costs and rates for the whole six months. No migration. Deploy core, staff-bff
  and dashboard together. **This finishes the money board: price and customer on jobs, fuel import, running costs and pay, job profit,
  and the look ahead.**
- 2026-10-09: **job profit: what each job cost and made (Phase 3 M1 and M2 for a client, costing per job).** New **Job profit** page under a new menu section
  **Costs and profit** (Fuel, Running costs and pay, Job profit), and `GET /staff/costing/companies/:companyId/job-costs?month=YYYY-MM`
  (needs `manage_billing`, as it shows wages). For a month it shows revenue, wages, fuel, vehicle running costs, overheads and the
  profit after all of them, then by job, by vehicle and by customer. **How it is worked out** (all in `domain/job-costs.ts`, with tests):
  a job belongs to the UK month it was delivered in, and its time runs from the driver accepting it to delivery; **wages** are that
  time at the driver's rate on the delivery day; **fuel** bought for a vehicle that month and its **running costs** for the month are
  shared across the vehicle's jobs by their time, **to the penny** (largest-remainder allocation, so a vehicle's jobs together carry
  exactly what it cost); a vehicle that did no job carries nothing on any job and its costs show on its own line and as "not covered by
  a job"; **overheads** are not put on any job. **Nothing is guessed:** a job with no price has no profit, a driver with no rate adds
  no wages and the job says so, a job with no vehicle gets no fuel, and the page lists what is missing and where to fix it. The
  month is London time (summer time handled). Jobs reach costing through a `JobDirectory` port (composition over a new
  `deliveredBetween` on the jobs facade). No migration. Deploy core, staff-bff and dashboard together.
- 2026-10-09: **costing inputs: running costs and what drivers cost an hour (Phase 3 M1 for a client, step 2 of costing per job).**
  Migration 0057 (`costing.running_costs`, `costing.driver_rates`, under Row-Level Security) and a **Costs** page (Operations). **Running
  costs** are a monthly amount for one vehicle (finance, insurance, road tax, a service plan) or, with no vehicle, for the firm (an
  overhead: office, software, the yard). Like the standing costs on the Finances page, a cost is entered once and carries on until
  changed or stopped; **changing it from a later month closes the old row the month before and starts a new one, so earlier months keep
  what they had** (stopped from its first month, it is removed). **Driver pay** is what each driver costs the firm an hour, from a day
  on; a rate applies until the next starts, so a pay rise never changes the cost of work already done. Drivers never see it. **Only
  `manage_billing` (the firm's money person) or WagonWise can see or change either**, because wages are private: a fleet manager
  without it cannot. This is the data entry; the cost of a job comes next. **The model decided for that report (change any of it):** a
  job's time is from the driver accepting it to delivery; wages are that time times the rate in force the day it was delivered; fuel
  and a vehicle's running costs are spread over that vehicle's jobs in the month by their share of job time (so a vehicle's jobs
  together carry all of its costs for the month); overheads are not added to a job, they are shown on their own. A driver or vehicle
  with no rate or cost simply adds nothing. Deploy core, staff-bff and dashboard together; the migration runs with core.
- 2026-10-09: **fuel card import (Phase 3 M3), the first of costing.** Migration 0056 (`costing.fuel_imports`, `costing.fuel_transactions`,
  under Row-Level Security) and a new core module `costing`. On the new **Fuel** page (Operations) a manager imports a statement from
  any fuel card provider as CSV and tells the page which column is the date, the registration, the amount, and optionally the time,
  litres and product or site; it guesses from the headings and remembers the choice for next time (on that browser). The dashboard
  reads the file (UK dates like 31/10/2026, ISO dates, amounts like £1,234.56, credits as negatives or brackets), skips and reports
  rows it cannot read, and sends the rest (up to 2,000 a go; longer files go in pieces). Core matches each purchase to a vehicle by
  **registration** (spaces and case ignored; two vehicles with one registration are not guessed at) and **keeps a purchase that matches
  none**, so the money is not lost: **Needs matching** lists them, **Match again** matches those whose registration has since been
  added, and each can be matched by hand. **Sending the same statement twice adds nothing twice** (a dedupe key of the moment,
  registration, amount, litres and description plus which of identical rows it is, so two genuine identical purchases in one file both
  stay). A whole import can be undone. The page shows spend, litres, average price a litre and fuel by vehicle for this month, last
  month or the last 30 days. Managers (`manage_fleet`) import and match; `view_reports` can look; a dispatcher alone cannot (fuel is
  the firm's cost). No new privilege. No per-job fuel yet: matching fuel to the jobs a vehicle did is part of costing per job, next.
  Deploy core, staff-bff and dashboard together; the migration runs with core.
- 2026-10-09: **revenue, first slice: a customer and a price on each job (Phase 3 M2, a client's own revenue).** Migration 0055 (`customer`
  text, `price_pence` on `jobs.jobs`). A dispatcher can write who a job is for (free text, with the firm's earlier customers offered as
  suggestions so a name is spelt the same each time) and an agreed price in pounds and pence, when creating it or any time after
  (`PUT /staff/jobs/:id/commercial`, needs `dispatch`; the Jobs page has **Customer and price**), since a price is often agreed, or
  corrected, late. Both are the firm's own business: **a driver never sees them** (`jobDto`, the driver's view, has no money in it; a test
  checks the driver's job leaks neither) and staff see them only if they can dispatch or read reports (`staffJobDto`). The jobs report
  gains Customer and Price columns (in the CSV too) and a **Revenue** figure: the price of jobs delivered in the period, counted when
  delivered, with how many delivered jobs have no price so a gap is visible; plus **Revenue by customer** and **by vehicle**. A price
  is in whole pence, up to £1,000,000, as a guard against a typing slip. No rate cards, no invoicing a client and no per-job cost yet:
  costing is next, then projections. Deploy core, staff-bff and dashboard together; the migration runs with core.
- 2026-10-09: **dashboard menu: Reports moved into Operations.** It sat on its own as a lone link between sections and looked odd. It now lives
  under Operations (Jobs, Live trips, Drivers, Places, Reports), which has five links and so folds like the other long sections. The only
  standalone link left is Overview.
- 2026-10-09: **dashboard home (clean-up step 3).** **Overview** is now everyone's landing page (sign-in used to send managers to a "TODO"
  page and admins to Users). Built from calls the other pages already make, so no new backend; a part the person has no privilege for is
  not asked for, and one that fails simply leaves its part out. **A company's staff** see four tiles (unassigned jobs and how many are due
  today; assigned jobs the driver has not opened, with the longest wait; "do not drive" defects not fixed; maintenance overdue and due
  soon), then **On the road now** (job, driver and vehicle, ETA, and late jobs with how late; sharing drivers with under half an hour of
  driving left) and **Compliance today** (walk-round checks done against the vehicles, open defects, overdue repairs, vehicles against
  the plan, driver requests waiting). **WagonWise staff** see this month's invoiced, costs, profit and drafts to issue, a six-month
  revenue and costs chart, and what needs action (hazard reports to review, invoices issued and not paid). A tile is amber or red only
  when there is something to do, and links to the page that deals with it. `lib/home.ts` holds the sums, with tests; no data model,
  route or privilege changed. Not there yet: congestion reports, companies over plan capacity, and any per-job money (that comes with
  revenue and costing).
- 2026-10-09: **dashboard buttons and colour tokens (clean-up step 2).** Every button used to be the big blue. Now a plain button is the quiet
  one (white, outlined), and the page's main action is blue: any form's submit button, or one marked `.btn-primary` (for example Add
  one, Assign, Issue invoice, Download CSV, Import them). Others got a variant: `.btn-confirm` soft green for saying yes to something
  safe (Mark done, Approve, Mark as paid, Mark fixed), `.btn-caution` soft amber for something to think twice about (Send notification
  again, Cancel a repair or invoice, Remove a list or item, Stop a cost, Regenerate code), and `.btn-danger` red outline for deleting
  (Delete draft, Remove entry). The colours are tokens in `styles/theme.css` (`--btn-*`, `--warning`, `--danger`, `--border`,
  `--text-muted`), and the four hex values pasted most often into pages (red, grey, border, amber) now use them. LiveTrips, the
  maintenance status colours and the printable delivery record keep their hex on purpose (map and print contexts). No behaviour
  changed. Next: the home dashboard.
- 2026-10-09: **dashboard menu regrouped and folding (clean-up step 1).** The sidebar was one 11-link "Fleet" list plus a 9-link admin list. Now:
  a standalone **Overview**; **Operations** (Jobs, Live trips, Drivers, Places); **Compliance** (Walk-round checks, Check results,
  Defects, Maintenance, Vehicle profiles); **Reports** as a plain link; **Your team**; and for WagonWise staff **Customers**, **Money**
  and **Content** (moderation and the report queues). `lib/nav.ts` has the rule: a section with more than 4 links folds; when the whole
  menu has more than 12 links every section of two or more folds (so a WagonWise admin gets a short menu); a section of one link
  is just the link. Only one folded section is open at a time, the one holding the current page opens by itself, and clicking a heading
  overrides that until the next page. Each area carries a quiet colour (a dot by the heading and the edge of the current link):
  blue operations, teal compliance, violet money, slate team and admin. No page, route or privilege changed. Next: button variants and
  colour tokens, then the home dashboard.
- 2026-10-09: **driving hours: sharing a driver's status with their company (Phase 3 M9, built to `driver-hours-consent.md`, approved by
  the owner).** Migration 0054 (`hours.settings`, `hours.sharing`, `hours.status`, all under Row-Level Security; a driver may read the
  firm's switch only for a company they are an active member of). New core module `hours`. **Two switches, both off by default:** a
  manager (`manage_fleet`) switches it on for the firm (Checks page), and each driver chooses per company in Driving hours, shown the
  agreed wording first (the version they agreed to is stored). The app sends the driver's status (driving, other work or on a break, and
  whole minutes of driving left before a break or limit) when it changes and once a minute; **core decides the company** (the one the
  driver's job is for) and stores nothing unless the driver is on a job, the firm has it on and the driver is sharing. Only the latest
  status is kept (replaced on each update). The live map shows "Driving, about 1h 20m of driving left before a break" for sharing
  drivers on a job, in red under 30 minutes. Stopping sharing, finishing a shift, the firm switching it off, or deleting the account
  removes the status at once; an old one is hidden when the job ends and deleted after 12 hours by the hourly clean-up. The driver sees a
  "Sharing your driving status with X" chip on the Driving hours and trip screens. The driver BFF forwards four routes and the staff BFF
  three. No SMS or history. Deploy core, driver-bff, staff-bff and dashboard together; the app change goes out over the air.
- 2026-10-09: **push notification when a job is assigned, and a resend from the portal.** Migration 0053 (five columns on `jobs.jobs`:
  how the notice went, to how many phones, how many tries, when, and when the driver first opened the job). Assigning a job now pushes
  "New job assigned: JOB-1: Hexham depot" to every phone the driver has registered (Expo push, through the new `ExpoDriverNotifier`
  over identity's registered devices; jobs never reaches into identity). A push that cannot go never undoes the assignment: it is
  recorded as `no_device` (no phone registered), `failed` (the push service refused or was down) or `sent` (at least one phone
  accepted it). The Jobs page shows it under the status of each assigned job ("Notified at 09:05 (1 phone), not opened yet", or "No
  phone registered for notifications"), refreshed every 30 seconds, in amber until the driver opens the job; **Send notification
  again** (needs `dispatch`) tries once more. "Opened" is when the driver's app first fetches the job. A push being accepted is not proof
  it was read, so the page says "not opened yet" rather than "delivered". Resend is refused once the driver has accepted. In the
  driver app a notification refreshes their job straight away, and tapping it opens the Jobs tab (JavaScript only, so over the air once
  core and the driver BFF are deployed; the BFF needs no change). No text-message fallback: a driver with no phone registered has to open
  the app once while signed in, which registers it. Deploy core, staff-bff and dashboard together.
- 2026-10-09: **driving hours: consent and privacy drafted, not built.** `docs/driver-hours-consent.md` sets out what would be shared
  with a driver's company (live status and driving time left, on a job only; no history), the rules the build must follow (off at
  both the firm and the driver, per company; withdraw at any time; no consequence for saying no; latest status only, gone after
  12 hours or on withdrawal), the driver and firm wording, text for the privacy notice, DPIA points for the company, and the main
  question for a solicitor: whether consent is the right basis between an employer and a driver. For the owner to approve first.
- 2026-10-09: **driving hours, weekly and fortnightly limits (Phase 3 M9, Track A third slice).** Driver app only, JavaScript only
  (over the air). Under the EU/assimilated rules the clock now counts driving this week (a fixed week, Monday 00:00 to Sunday
  24:00 on the phone's clock) against 56 hours, and this and last week against 90 hours (GOV.UK: "56 hours in a week", "90 hours in
  any 2 consecutive weeks"). Whichever of the day, week or fortnight comes first is the limit the countdown and the break planning
  use, and the Driving hours screen names it and shows the week's totals. **GOV.UK does not define a week on any page we could
  reach, so the Monday to Sunday week is from the regulation; re-read it before relying on it.** GB domestic rules have no weekly
  limit on the GOV.UK page, so none is counted there. Not counted yet: weekly rest, reduced daily rests, GB domestic duty time.
  The 15 days kept on the phone cover this week and last. Next: status to core and the portal, which needs the driver's consent
  wording and the privacy notice, DPIA and DPA changes first.
- 2026-10-09: **driving hours, break planning on the route (Phase 3 M9, Track A second slice).** Driver app only, JavaScript only
  (over the air). While the driving-hours clock is running and a trip is active, the trip screen works out whether the route runs
  past the time the driver has (`lib/break-plan.ts`): if so a card says **Break needed in 1h 20m** (or **Rest needed before you
  arrive** when the day's driving limit comes first), the ETA card reads "with break" and moves by the break (45 minutes each, a
  second break on a long route), and the reported safe parking spots beside the route (within 3 km, ahead of the driver, before
  the limit, the one nearest the limit first) are listed with the driving time to each; tapping one opens it on the map. A driver
  who has not started the clock sees none of this. It only advises, and uses only the break rule and daily limit already in the
  clock; weekly limits are still not counted. Nothing new is sent anywhere. Next: weekly limits, then status to core and the
  portal (which needs the driver's consent and the privacy changes first).
- 2026-10-09: **driving hours, Track A first slice (Phase 3 M9): a driver-entered clock.** Driver app only, JavaScript only, so it
  ships over the air once merged and the release label is used. More tab, **Driving hours**: the driver taps Driving, Other work,
  Break or Rest (and Finish for now), and the screen counts down the driving left before the next break or the day's limit,
  turning red under 30 minutes. The rules are in `lib/driver-hours.ts`, with the GOV.UK pages they were checked against on
  2026-10-09: assimilated EU (9 hours a day, 10 allowed twice a week, a break of 45 minutes after 4h 30m driving, also taken as 15
  then 30, 9 hours' rest starts a new day) and GB domestic (10 hours driving; no break countdown, as the GOV.UK page gives none
  for goods vehicles). The 15 + 30 split is from the regulation and not that page, so re-read it before relying on it. Time not
  recorded counts as a rest, so a driver who stops tapping is never told they have time they do not. The app plans on 9 hours
  unless the driver says a 10-hour day is unused. **Not counted yet:** weekly and fortnightly limits, weekly rest, GB domestic
  duty time. The record stays on the phone (SecureStore, 15 days, with a Clear button) and nothing is sent to core, so no
  privacy change is needed yet; that changes with the slice that shows status to the office. `state/shift-store.ts` has a
  `source: 'manual'` field where a tachograph source will plug in. Next: break planning on the route (parking before the limit,
  ETA with the break), then status to core and the portal.
- 2026-10-09: **maintenance, slice 5: import dates from a spreadsheet (Phase 3 M4, so M4 is done).** No migration. On the
  Maintenance page, whoever has `manage_maintenance` picks a CSV: a Registration column then a column per thing tracked (`MOT`,
  `Tail lift`), or rows of Registration / Item / Due date; UK dates (31/01/2027) are read. The dashboard parses the file and shows how
  many dates it read; on confirming, core matches vehicles by registration (spaces and case ignored) and items by name and sets
  each date (`POST /staff/maintenance/companies/:companyId/import`, up to 500 rows a go; bigger files go in chunks). Every row
  stands alone: a row that cannot go in (unknown or duplicated registration, unknown item, item not for that vehicle, unreadable date)
  is listed, the rest still go in, and sending the file again is harmless. Another company's registrations are never found.
- 2026-10-09: **maintenance, slice 4: defects into repair tasks (Phase 3 M4).** Migration 0052 (`maintenance.repairs`, one open
  repair per defect, company-scoped by Row-Level Security). Whoever has `manage_maintenance` books a repair for a defect from the
  Defects page, with a due date (today or later); that marks the defect seen. On the Maintenance page's new **Repairs** tab they
  mark it done (optionally with a note, and a tick, on by default, that marks the defect fixed too, which releases a vehicle a firm
  holds back for a "do not drive" defect) or cancel one booked in error. An overdue repair is shown in red; it is advisory like the
  rest of maintenance. Booking twice returns the repair already booked. The defect stays in `checks`: maintenance reaches it only
  through a `DefectDirectory` port that composition fills from new `findDefect` / `setDefectStatus` methods on the checks facade
  (the caller's right to book is checked in maintenance, so a booker needs no checks privilege). The new staff-bff forwards are four
  routes. Deploy core, staff-bff and dashboard together; the migration runs with core.
- 2026-10-09: **maintenance, slice 3: the morning reminder (Phase 3 M4).** Migration 0051 (`maintenance.reminder_preferences`,
  `reminder_log`). Each person with `manage_maintenance` is emailed once a day, from 7am UK time, when something is overdue or due
  soon in their company: overdue first, then due soon, each with the vehicle and registration and how late or soon, and a link to
  the Maintenance page (when `DASHBOARD_URL` is set). Nothing is sent on a quiet day, and an item with no date is not a reminder. A
  person chooses for themselves on the Maintenance page, **Your reminders**: email each morning (the default until they choose) or
  only the portal. Others (dispatchers, viewers) are not emailed. The task (`maintenance-reminders`) runs hourly; a person's day
  is **claimed in the database before the email goes and given back if sending fails**, so nobody gets two in a day and a failure
  is retried on the next pass. The people to tell are gathered first (`companies.listFleetContacts`, each in its own scope), then the
  run works in the platform scope, because scopes cannot nest. Tested on real Postgres (one a day however often it runs, the choice
  honoured the next morning, retry after a failed send, 06:30 UK held back and 07:00 sent, other companies not emailed).
  **Text messages are not offered yet**: there is no general text sender (texts only carry sign-in codes), a staff account has a
  mobile number only if it signs in by text, and each message costs; the channel type and the choice are built so text can be
  added. Not built: defects into repair tasks (slice 4), a CSV import (slice 5).
- 2026-10-09: **maintenance, slice 2: what a firm tracks, and when it is due on each vehicle (Phase 3 M4).** Migration 0050 (new
  `maintenance` schema: `item_types`, `schedules`, `history`; company Row-Level Security). Each firm keeps **its own list** of things
  that fall due (name, repeats every N days, weeks or months, warn N days before, all vehicles or chosen ones), from "Add one" or "Add
  the usual examples" (MOT yearly, safety inspection 6-weekly, service 6-monthly, tachograph calibration 2-yearly, tail-lift
  6-monthly, road tax yearly: examples to edit, not a standard). Per vehicle and item: when it is next due; **Mark done** records the
  day, a note and who, keeps it in the vehicle's history, and moves the next date on by the interval (or to a date given, so an MOT
  renewed early keeps its date); a month interval that lands on a day that does not exist uses the last day of the month. Status is
  overdue, due soon (within the warning period), fine, or no date yet; the Maintenance page lists everything most urgent first
  ("Only what needs attention" by default) and any vehicle opens its panel, also reached from a **Maintenance** button on Vehicle
  profiles. A new assignable privilege **`manage_maintenance`** keeps the dates and the list; seeing needs it or manage_fleet,
  dispatch or view_reports. The migration gives it to every fleet account (and pending invite) that holds manage_users or
  manage_fleet, so no manager loses the ability (tested on real data: dispatchers and viewers do not get it). Advisory only: an overdue
  item never stops a vehicle. Not built yet: the notification preference and the reminders (slice 3), defects into repair tasks
  (slice 4), a CSV import (slice 5).
- 2026-10-09: **registration number on vehicle profiles (Phase 3 M4, slice 1).** Migration 0049 (`fleet.vehicles.registration`,
  optional, kept tidy: capitals, no spaces, dashes or dots, 2 to 8 letters and digits; unique within a company by a partial index,
  so two companies may each have the same plate). The Vehicle profiles page gains a Registration field when adding a vehicle, a
  Registration column, and an **Edit** panel (name, registration, measurements), which the page did not have before. Core refuses a
  registration another vehicle in the company has (`RegistrationTaken`, 409) or one that is not 2 to 8 letters and digits
  (`InvalidRegistration`, 400); on an update, leaving it out keeps it and sending it blank clears it. It is the key the rest of
  maintenance hangs on, and what a later automatic MOT lookup would use.
- 2026-10-09: **Finances page: WagonWise's own costs against what companies are invoiced (Phase 3 M1, M2 and M6, reframed by the
  owner).** Migration 0048 (`billing.costs`, platform-only Row-Level Security). An admin enters what it costs to run WagonWise on the
  new **Finances** page (types: hosting, maps and routing, email and text, software and tools, wages or your time, other; amounts ex
  VAT). A cost is **standing**: it applies from its first month and carries on every month until changed or stopped, so most are
  entered once. Changing the amount from a later month ends the old entry the month before and starts a new one, so earlier months
  keep what they had and a past month's profit never moves; stopping ends it the month before; a one-off is a single month; "remove
  entry" is for a mistake. Revenue comes from the invoices already in the system: **invoiced** is issued and paid invoices (never
  drafts or cancelled ones) by the month they are for, **received** is those marked paid. The page shows the month's figures, its
  costs, revenue by company, profit on both measures (invoiced is the headline), twelve months side by side, and a look ahead (today's
  plans against the costs standing this month, with the break-even number of vehicles). Per-vehicle and per-job costing for client
  companies (the original M1 and M2) are not built and would only follow if a company asks.
- 2026-10-09: **walk-round checks, slice 3c: retention (Phase 3 M5 complete).** Migration 0047 (`checks.settings.retention_months`,
  default 12, 1 to 120). The firm chooses how long its check records are kept ("Keep check records for" on the Walk-round checks page,
  `manage_fleet`), as it is the controller of them. A daily task (`prune-checks`, same interval as the other cleanups) deletes each
  company's checks older than its own retention (12 months if it never chose), with their photos and defects (cascade). A check with
  a defect still open or only seen is kept until the office marks the defect fixed, so an unresolved fault is never lost to the
  clock. The PUT settings call may leave `retentionMonths` out to keep what is set; a value outside 1 to 120 whole months is refused.
  Tested on real Postgres (old check and photos go, recent kept, open and seen defects kept until fixed, other companies untouched).
  The privacy notice, DPA and DPIA need the new data (daily checks, defect photos) and the firm-chosen retention added; they are held
  outside the repo, so that is on the owner's list in `progress.md`.
- 2026-10-09: **walk-round checks, slice 3b: rules about sending a vehicle out (Phase 3 M5).** Migration 0046 (`checks.settings`; and a
  driver may now read their company's settings and defects). Two rules per firm, both off by default, set by a fleet manager on the
  Walk-round checks page: **do the check before the job** (a driver cannot accept a job until every list for the vehicle is done
  today, by anyone) and **hold back a vehicle with a "do not drive" defect** (not sent out until the office marks the defect fixed;
  "seen" is not fixed). They apply when a driver accepts an assigned job (`assigned` to `accepted`): jobs' `advanceJobStatus` asks a
  `JobStartGate`, supplied by composition over `checks.jobStartVerdict`, and returns `CheckRequired` or `VehicleNotFit` (409). A
  dispatcher moving a job for a driver is never held up, and the gate is only wired into the driver's door. A vehicle with no lists
  has nothing to do, so a firm that turns the rule on before building a list is not locked out; a vehicle with an open do-not-drive
  defect comes before a missing check, because doing the check does not make it safe. The driver app says "Do your daily check
  first" or "This vehicle has a defect marked do not drive. Tell your office" (also when "Start" tries to accept the job). Tested
  end to end on real Postgres, including that a driver's own database view can see the rules and the open defects (a missing policy
  would have silently let everything through). Not built: retention, defects feeding maintenance.
- 2026-10-09: **walk-round checks, slice 3a: the office sees results and works through defects (Phase 3 M5).** Migration 0045
  (`checks.defects.status_changed_by`). Dashboard: **Check results** lists the checks drivers have done (today, 7 or 30 days) with
  vehicle, list, the driver's sign-in, result and defect count, and opens any one in full: the questions as they were when it was
  done (not as the list reads now), the answers, each defect with its status, and the photos, fetched only when asked for.
  **Defects** lists what checks found, "do not drive" first, with a filter (still to deal with, open, seen, fixed); fleet managers and
  dispatchers mark each one seen, fixed, or reopen it, recording who and when. Seeing needs `manage_fleet`, `dispatch` or
  `view_reports`; changing a defect needs `manage_fleet` or `dispatch`. Another company's checks are "not found". Core routes under
  `/staff/checks/companies/:id/results`, `/staff/checks/results/:id` (+ `/photos/:itemId`), `/staff/checks/companies/:id/defects`,
  `PUT /staff/checks/defects/:id/status`. Tested end to end on real Postgres. Not built: retention (and its cleanup), the "must be
  done before a job" setting and gate, defects feeding maintenance.
- 2026-10-09: **walk-round checks, slice 2b: the driver app screen (Phase 3 M5).** A "Daily check due" card appears on the Jobs tab and
  the job screen while the vehicle on the driver's current job has a list still to do (nothing shows for a firm with no lists, or
  once they are done). It opens `/check`: the questions as big buttons (OK or Defect, Yes or No, a number, a note, a photo), a
  defect asks "What is wrong?" and, where the list wants it, for a photo. Finishing saves the check and its photos to the phone first
  (`db/check-queue.ts`, SQLite) and sends them when there is signal (`hooks/use-check-queue-flush.ts`, on start and on coming back to
  the app, same shape as the proof-of-delivery queue): the check, then each photo; a rejection the server will never accept drops
  just that item, anything else retries. The driver is told the result straight away from the phone's own working: clear, fix soon,
  or "Do not drive this vehicle... tell your office now". The last lists the server gave are kept on the phone so a check can start
  offline, and a check finished offline counts as done ("waiting to send") rather than being asked for again. JavaScript only, so
  it ships over the air with no new Play build, but only after core and the driver BFF with slice 2a are deployed.
  Not built: saving a half-finished check if the app is closed, the office results page and defects inbox, the "must be done before a
  job" setting, retention.
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
