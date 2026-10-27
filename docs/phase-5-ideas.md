# Phase 5: ideas (draft, not scoped)

**Status:** a starting list for the owner to cut down, not a plan. Phase 4 ends with the product ready for big fleets
(`phase-3-scope.md`, "Phase 4 on the board"). Phase 5 is what comes after the first big fleets say yes: make it dependable
as a business, fit it into how big firms already work, and go deeper on the driver's day. Nothing here is built. Items that
are already recorded elsewhere point at where.

## The whiteboard (2026-10-14): Phase 5 to 6

What the owner wrote up for "Plan phase 5-6", with where each item is covered below.

| On the board                                 | Covered in                                                    |
| -------------------------------------------- | ------------------------------------------------------------- |
| SNAP, TRAVIS, Park Your Truck (parking)      | Ask 1                                                         |
| SNAP API integration: book services          | Ask 1 (SNAP's network also covers washes and depots)          |
| Telematics integration, possible?            | Ask 3                                                         |
| Price telematics                             | Ask 3, "Price it first"                                       |
| Haulage requests?, payment links             | Ask 5                                                         |
| Better routing                               | Theme D                                                       |
| Staff portal improvements                    | Ask 4, with a way to find the features                        |
| Drivers scores (portal)                      | Ask 6                                                         |
| Responsive deviations (red, from Phase 4 M8) | Phase 4 on the board in `phase-3-scope.md`; not repeated here |

## The owner's asks (2026-10-13)

Five things the owner wants in Phase 5. Research below is from public pages on 2026-10-13 and has not been tried; check each
against the provider's own terms before building.

### 1. Buy parking from inside WagonWise (SNAP)

- **What SNAP is:** a UK and European truck parking and payment network (about 53 Moto services in the UK, plus truck stops
  such as Ashford International). Fleets pay on a SNAP account.
- **What its API offers** (its integrations page): vehicles (keep fleet vehicle data in step), transactions (reserve parking
  in real time, link a booking to a vehicle, pull booking and transaction data in) and network (real-time location data for
  parking, washes and depots). It says it is built for fleets, service partners and technology providers.
- **Not stated publicly:** who can apply, cost, whether a partner programme or revenue share exists, and how payment works for
  a driver who has no SNAP account. All of that needs a conversation: the page has a "Talk to an expert" form.
- **Shape if built:** SNAP sites show on the parking map with a "Book" button; a booking is tied to the job and vehicle; the
  fleet manager sees bookings and costs in the portal (and in job cost). Drivers without a firm account are a separate,
  harder question (they would pay themselves).
- **Next step (no code):** contact SNAP, ask for partner API access and terms, and ask whether a small app can join.
- **Alternatives (checked 2026-10-13, public pages only; none confirmed for pricing or approval):**
  - **TRAVIS (yourtravis.com):** the clearest alternative. A public developer portal lists 11 APIs, including Locations,
    Booking, Vehicle, Transaction, Fuel Card and Travis Pay, split between carriers and service providers. It says it covers
    "across Europe" (750+ locations in 16 countries, also bookable through LKW.APP and Happy Trucker); UK sites are not
    confirmed on the portal. Access, sandbox and pricing are not stated. Radius fuel card holders already book through it,
    which suggests UK sites exist.
  - **Bosch Secure Truck Parking:** high-security UK truck stops, bookable inside Webfleet. A fleet-software integration, not an
    open API. Useful mainly if the first big fleet already uses Webfleet.
  - **PTV Truck Parking Europe:** a reservation platform that can connect to any operator's booking system. Ask PTV about
    terms; no public API found.
  - **Park Safe (new, July 2026):** a UK platform from a Lancashire haulier (McMurrays) where hauliers rent out their spare
    secure spaces. UK only and very new; no API details found. Worth a call to see if it wants to be listed.
  - **Park Your Truck (park-your-truck.com):** on the whiteboard. A Dealroom profile says it turns unused land near
    highways into bookable, fenced and monitored truck parking, with a booking platform and app, subsidiaries in the UK, Spain,
    Italy and France, and over 20,000 spaces in Europe. I found nothing from the company itself, so UK sites, any API and
    terms are all unconfirmed. Add it to the same five questions.
  - **Not useful for booking:** Parkopedia (no HGV or UK truck-bay API found), Trucker Path (US and Canada only), Park4Night
    (community map, no API found). MWayBuddy and Truck Parking Europe are information only.
  - **Money (unknown):** no provider's public pages mention commission, a referral fee or what API access costs. Platforms like
    these usually earn from a cut of each booking paid by the parking site, sometimes shared with the app that sent it, plus
    fees on the fleet side. Do not assume WagonWise earns anything.
  - **Rule (owner, 2026-10-13): ask about cost and return before any code, and link before integrating.**
    1. First, email SNAP and TRAVIS (and Park Safe) with five questions: is API access free and are there partner fees; do you
       pay partners a commission or referral fee per booking; is there a minimum volume or contract; can a small app apply;
       which UK sites does the API cover.
    2. Then start with a link, not an integration: show their sites on our parking map with a "Book with …" button that opens
       their app or site. Very little to build, no ongoing API cost.
    3. Build in-app booking only if it is free to connect and pays a commission, or is free and clearly something drivers use.
       Without a return, it stays a link.
  - **Fit:** SNAP is the biggest UK network (Moto and truck stops); TRAVIS is the best-documented API. They are not exclusive,
    so the design should put booking behind a port with one adapter each, like the TomTom client. Ask both for terms before
    choosing which to build first.

### 2. Fuel prices near the driver (GOV.UK Fuel Finder)

- **What it is:** the government's Fuel Finder service, live since early 2026. Retailers must report price changes (published
  within 30 minutes), and the data covers each petrol station: prices by fuel type, address, operator and brand, amenities,
  opening hours and update times.
- **Access:** an API with OAuth 2.0 (client credentials), through the developer portal, which needs a GOV.UK One Login. There is
  also a CSV, refreshed twice a day. The GOV.UK page says app developers are intended users.
- **Not confirmed:** cost, rate limits, the licence for the data itself, whether diesel is a named fuel type, and whether each
  site has coordinates (the page speaks of addresses). Check on the portal before designing.
- **Shape if built:** a server-side job in core copies the prices (nearby queries need our own copy, and the key stays on the
  server); the app shows the cheapest diesel near the route or the destination; the portal's Fuel page can compare what drivers
  paid with the local price. HGV-suitable sites (room for a truck, a pump a lorry can use) are not in this data, so filter or
  flag them from our own parking data and driver reports.

### 3. Telematics

- **Reality:** there is no single feed. Providers (Webfleet, Geotab, Samsara and others) each have their own API, and access
  usually comes through the customer's account, or a reseller in Geotab's case. Truck makers' data (the FMS standard) normally
  arrives through a telematics provider, not directly.
- **Shape if built:** one adapter per provider behind a port in core (like the TomTom client): position, ignition, odometer
  and, where offered, tachograph hours and fuel level. Start with the one provider the first big fleet already has; the
  answer to "what telematics do you run?" decides which.
- **Why it matters here:** driver hours and live position without the driver having the app open, and odometer for
  maintenance dates.
- **Price it first (on the board):** before any adapter, find out what each provider charges for API access and who pays: the
  fleet through its own account, or WagonWise as a partner. Ask Webfleet, Geotab (through a reseller) and Samsara for partner
  terms, the same way as for parking. A feature that costs more per vehicle than the £10 WagonWise charges is a drain.

### 4. Expand the staff portal

Candidates, to be cut by what firms ask for: a calendar or board view for jobs; bulk job import; customers and contacts as
their own records; documents per vehicle and driver (insurance, licence checks, expiry dates); driver licence and CPC
reminders; trailer records; a message to a driver from a job; exports and scheduled reports; per-depot views; a read-only
customer link to track a delivery. The staff guide (`/guide`) grows with each page.

**When no features come to mind (the owner, 2026-10-14):** the portal is thin, and the right list comes from watching, not
guessing. Ways to find it:

- Sit with the pilot firm's dispatcher for an hour and write down every time they leave the portal for a spreadsheet, a phone
  call or a message.
- Read the App usage page (`/admin/usage`) to see which pages are used and which never are.
- Ask each tester one question: "What did you do outside WagonWise today that you wish it did?"
- Use the tester feedback inbox, and the staff guide's gaps (a task with no page to do it on).
- Look at what big fleets already pay for, from the prospects workbook (names of the systems they use).

Start with the three most asked-for, build them small, and put each in the guide.

### 5. A haulage marketplace (advertise jobs)

- **The idea:** firms post loads or spare capacity; hauliers see and take them.
- **Why it is different from the rest of WagonWise:** it needs two sides at once (enough loads and enough trucks in the same
  places), so it starts empty, and it has legal and money questions the app does not: who is liable for the load and the
  delivery, goods-in-transit insurance, operator licences, payment and late payment, and disputes. Established load boards
  already exist, so it needs a reason to win (for example, loads that arrive already priced and routed for the truck, with
  the hours and parking considered).
- **A smaller first step:** let a firm share a job with a set list of trusted hauliers (subcontractors it already uses), with
  the job flowing into the other firm's WagonWise. That tests demand and the legal side without an open marketplace.
- **When (the owner, 2026-10-27): much later,** once there are many more operators on the books. People post jobs, or approach
  the firms that have opted in to receive them, and WagonWise takes a cut of the contract amount paid by the poster (the
  owner's example: an £8,000 job at 5% or 10%).
- **The fee, with numbers (an illustration, not data):** £8,000 is £400 at 5% and £800 at 10%. To earn £50,000 a year it takes
  about £1 million of contracts at 5% (125 jobs of £8,000) or £500,000 at 10% (about 63 jobs). £8,000 is a large contract; most
  single loads are far smaller, so the fee on a typical job is a lot less. The poster paying the fee on top is clearest; taking
  it out of the haulier's price will not be welcome.
- **What others charge (first look, 2026-10-27, public pages only):** the UK freight exchanges (Returnloads, Haulage Exchange,
  TimoCom, Trans.eu) appear to earn from subscriptions: the one price found was Returnloads at £29.50 a month, from an old blog
  post, and the rest give no price. A percentage of the contract is different, and no UK broker commission data was found. US
  evidence (analyst estimates, not filings): digital freight marketplaces run on thin margins, often single digits and about 1%
  on some large shippers; a 2018 benchmark put traditional brokers' gross margin at about 12 to 13%, and one analysis says a broker
  doing the calling and paperwork by hand needs 15 to 20%. So 5 to 10% for software-only matching is plausible, at the upper end
  for a digital platform.
- **The hard parts:**
  - **Leakage:** once two firms are matched they can deal directly and skip the fee. The defence is value after the match: the
    job flows into WagonWise (tracking, proof of delivery, hours, checks, invoicing), so staying is easier than leaving.
  - **Both sides at once:** it starts empty (above).
  - **Trust and fraud:** fake carriers and fake jobs are a known freight problem. WagonWise holds the public operator licence
    register, which helps verify an operator; insurance certificates would be the other check.
  - **Payment:** hauliers are often paid late (one report gives a large logistics firm an average of 72 days), and government
    late-payment reform is reported to be on the way (the bill's name and status vary between sources: check). WagonWise holding
    the money would need a regulated payment provider.
  - **Liability and tax:** who is responsible for the load, goods-in-transit cover, whether WagonWise acts as agent or principal,
    and VAT on the fee once WagonWise is registered. A solicitor reads the terms before any design.
- **Order of doing it:** 1) the smaller first step above, with no fee (it makes the portal stickier); 2) an opt-in directory of
  firms that accept offers; 3) open posting with a fee, only when there are enough firms and real demand, starting low. Do not
  plan revenue on it.
- **Still not researched:** UK broker margins and current exchange prices (ask each provider's sales team), subcontractor payment
  protection, and the legal position (a solicitor).
- **Haulage requests and payment links (on the board):** a firm posts a request, a haulier accepts, and a payment link settles
  it. A payment link means a payments provider (a card or bank payment service) holding money between two firms. That adds
  regulation and fees, and who is the merchant matters (WagonWise, or each firm). Skip payments in the first version: let the
  firms settle between themselves, as they do now, and add payment links only if firms ask for them.

### 6. Driver scores in the portal (the owner, red on the board)

- **The idea:** a score for each driver in the portal, so a firm can see how they are doing.
- **What it could be built from today:** on-time delivery, checks done, defects reported, jobs completed. Safer-driving signals
  (harsh braking, speeding) need telematics, so they wait for ask 3.
- **Care needed:** scoring drivers is monitoring of workers. It needs its own DPIA entry, plain wording to drivers about what
  is scored, and a rule that a score is never the only reason for discipline. A mistaken or unfair score is a real harm, and a
  big fleet's union or drivers' representative may well ask to see how it works. Keep the first version to simple facts the
  driver can see for themselves (jobs done, checks done), not a single number.
- **Open question:** does the firm want a score, or a list of events it can look at? The second is simpler and safer.

### 7. Breakdown help: garages and mechanics near the driver (the owner, 2026-10-26)

- **The idea:** a driver is a long way from base with a problem. The app shows mechanics, tyre fitters and recovery firms near
  them, with a call button, so they are not searching on a phone at the roadside. Some firms have in-house mechanics or a
  breakdown contract, but for a driver stuck far from home it saves time.
- **Where it goes (owner's decision):** a separate **Breakdown help** button inside the SOS sheet, which already has the driver's
  position and three words. SOS stays for emergencies: holding the red button still alerts the office, and Call 999 stays. The
  breakdown button is a different action: it sends nothing and needs no hold.
- **What it can reuse:** the `parking` module's pattern (OpenStreetMap import with `source` and `osm_id`, driver suggestions, staff
  approval); SOS and what3words for the position; "navigate there" for a fixed garage; the maintenance and costing modules to
  record the repair.
- **Stages (rough, one developer):**
  - **0. The company's own numbers (a few days):** a company sets its breakdown contacts in the portal (insurer or recovery
    contract, preferred garage) and the app shows them first. Many firms already have a contract, so this comes before any
    public list.
  - **1. The list (1 to 1.5 weeks):** nearest garages with a call button, "navigate there", services (tyres, trailers, recovery,
    mobile engineer, 24 hours) and a "last confirmed" date. Seeded from OpenStreetMap's `shop=truck_repair` and drivers'
    suggestions, and approved by staff. The tag exists but the Great Britain count has not been checked: run a count first.
  - **2. Garages claim a listing (3 to 4 weeks):** a verified badge, a service area for mobile engineers, opening hours, and a
    small garage login. Billing would reuse the billing module if it can bill a second kind of customer: check.
  - **3. A breakdown in the portal (3 to 5 weeks):** the driver taps "I've broken down", the dispatcher sees it, picks a garage
    and approves the cost, and it links to the vehicle's maintenance record and the job cost.
- **Earning from it (all small):** a monthly fee from a garage for a verified listing and a profile; a flat fee per call-out the
  driver confirms ("Did they help?", because a tap on Call does not prove a call happened); and the fleet-side value, which is
  probably the best return because it makes the portal harder to leave. **Skip "paid through us":** WagonWise holding the payment
  brings payment-services regulation, disputes over the work, VAT and liability. Breakdowns that need outside help are rare: if 1
  driver in 10 of 3,000 needed one a year that is about 300 call-outs, and at a £20 fee about £6,000 a year (an illustration, not
  data). Garages will not pay much until the app has scale.
- **Rules:** show "listed, not endorsed" and never promise cover or availability; share the driver's position with a garage only
  when they tap; a paying garage never pushes a nearer one down the list; link to official motorway breakdown guidance (check its
  wording first).
- **Competition:** truck makers run their own 24-hour roadside services (Mercedes-Benz Trucks, MAN Mobile24), RAC has commercial
  cover, and there are independent mobile mechanics. I found no single national directory, which does not prove there is not one.
  The list helps owner-drivers, small firms and a driver stuck far from home.
- **Next step (no code):** count `shop=truck_repair` in the North East and Cumbria, ring 10 to 20 garages to ask whether they want
  to be listed, and decide the Stage 0 fields.

### 8. Earning from the free driver app (the owner, 2026-10-26)

- **The aim:** the driver app stays free, with no ads. Small partner earnings should cover running costs that grow with use (map,
  routing, text and what3words fees, data feeds), so the portal's money is profit. A target to test, not a promise: with
  placeholder numbers 3,000 active drivers earn about £1,300 a month, about 3% of what the portal would earn from a similar number
  of vehicles. Set it against the real monthly bill when partners give real terms.
- **Ground rules:** nothing commercial on the active trip screen or while moving; safety information (hazards, restrictions,
  routes) is never ranked or hidden for a partner; every partner link is labelled and says WagonWise may earn a commission; no
  driver data goes to a partner without a tap; one quiet row, no pop-ups or push messages; nothing regulated (insurance, credit)
  until a solicitor has looked (insurance for firms in the portal is ask 9); link before integrating (the 13 October rule in
  ask 1).
- **Start with two, as links:** pre-booked truck parking (ask 1) and a "Need a bed?" hotel link on the break plan. A hotel
  affiliate pays a share of the booking site's own commission (one third-party source says up to about 40% at the top volume
  tier; not checked against the booking site's terms).
- **Later:** truck stop food, showers and washes; fuel offers after the fuel price feature (ask 2); Driver CPC training; gear such as
  dash cams and tyres; breakdown help (ask 7). Fuel cards, telematics and tyres are firm-side purchases, so the portal is the better
  place for those referrals.
- **Not:** display or video ads, selling or sharing location or contact data, pay-to-rank in parking, fuel or routes, lead selling,
  or insurance and credit offers (in the driver app; the portal case is ask 9).
- **Money is unknown until asked:** no partner publishes a commission for parking, fuel cards or Driver CPC. Send the five
  questions in ask 1 to SNAP, TRAVIS and Park Safe (add Bosch and Park Your Truck), and the equivalent to two hotel affiliate
  networks. Apple and Google payment rules mostly cover digital goods; hotels and parking are real-world services, but check the
  current wording before submitting.

### 9. Insurance renewal sponsor in the portal (the owner, 2026-10-27)

- **The idea:** a firm's insurance renews once a year, and the portal already holds the expiry dates (ask 3 and the document
  expiry theme). Eight weeks before expiry, one quiet row on the vehicle or firm page: "Insurance renews on 14 March. Get quotes
  from our partner [broker]." The link goes to a haulage broker. A firm-side referral in the portal, so it does not touch the
  free, no-ads driver app (ask 8).
- **Who pays:** a specialist haulage broker, not a consumer comparison site. Go Compare and similar sites sell car and home
  cover; haulage and fleet insurance (hire and reward, goods in transit) is mostly quoted by hand through brokers.
- **The fee: a flat sum a year, not a percentage (the owner's choice).** The broker pays a fixed amount up front for one labelled
  sponsor slot, so the cash is certain and the broker can budget. No sales to track and no firm data passed on, which also keeps
  it nearer advertising than arranging insurance (a solicitor to confirm). Tier it by the vehicles on the portal, on a one-year
  term with a review and an exit if the numbers fall well short. An optional bonus per policy placed can wait: it brings back the
  tracking and the regulation questions.
- **Rough numbers (unchecked guesses; the owner thinks they may be well off).** Premiums quoted by broker and comparison sites run
  about £1,500 to £3,000 per HGV a year, and up to £3,500 to £6,500 for an artic with goods in transit. Fleet broker commission
  has no solid UK figure found: 7.5 to 10% on large fleets (a forum), 10 to 20% (a pricing directory), 10% for motor fleet (an
  Irish insurer, 2020). At about £3,000 a vehicle and 10%, that is roughly £300 a vehicle a year to the broker. If 100 firms see
  the link and 10% switch, the broker gets about £30,000 a year of recurring commission, so it might pay 10 to 30% of that for
  the exposure: about £3,000 to £9,000 a year. Little at 10 firms, worth asking at 100. Compare the portal itself at £180 a
  vehicle a year. A broker with a high conversion rate would find a fixed fee cheap; one with a low rate would walk.
- **Rules:** label it as a paid sponsor, never as advice or "best price"; one sponsor per category (that is what makes the slot
  worth buying, and it means choosing one broker for everyone, another point for the solicitor); the expiry reminder works with or
  without a sponsor, and "renew with your own broker" is always there; nothing about a firm goes to the broker without their tap.
- **Regulation:** arranging or advising on insurance is FCA-regulated. A plain, labelled link or flat-fee advertisement is the
  usual unregulated route, but this is not checked. A solicitor decides before anything is built (the ask 8 rule).
- **When:** after the portal tracks insurance documents and expiry dates (already a Phase 5 theme), and once there are enough
  firms for a broker to care. Nothing built.
- **Next step (no code):** ask two or three haulage brokers whether they would pay a fixed yearly fee for a sponsor slot, how
  much, how many firms or vehicles they would want to see first, and whether they would also pay per policy placed.

## Themes

### A. Run it as a business

The things a paying fleet assumes are there.

- **Staging and production split.** Deferred until there are paying customers or auto-deploy is wired up. Phase 5 is when it
  stops being optional: a big firm should never be the test for a migration.
- **Backups with a tested restore, alerts and a status page.** Failure alerts on email and text, database restore drilled
  once, uptime watched from outside.
- **Taking payment.** Invoices are issued and paid by hand today (`modules.md`, Billing). Card or Direct Debit, VAT, and
  reminders for late payment.
- **Support.** A shared inbox, a response promise, an in-app "contact support", and the staff guide kept current (`/guide`).
- **Paperwork.** Terms of service, a DPA template customers can sign without a solicitor each time, an ICO registration, and
  rotated secrets (`project-rotate-secrets-before-launch`).

### B. Fit into a big fleet

- **Single sign-on** (Microsoft and Google work accounts) and a limit on who can see which depot or team.
- **Depots and teams:** privileges that apply to a group of vehicles and drivers, not the whole company.
- **Bulk import and export:** jobs, drivers and vehicles from a spreadsheet; every page's data out as CSV (some pages have it).
- **An API and webhooks** so a transport management system can create jobs and hear when they are delivered.
- **Several companies under one owner** (a group with subsidiaries).
- **Audit export** and a data retention page beyond photos.

### C. Vehicle data instead of typing it in

The two open tracks from the driver hours work (`phase-3-scope.md`, "Driver hours and tachograph"):

- **Tachograph and telematics:** read hours and position from the vehicle (Bluetooth or a telematics provider), so the hours
  clock is the real one. Which provider comes from what the first big fleets use.
- **Fuel card feeds** instead of statement uploads (fuel is a CSV import today). Nearby pump prices are in "The owner's asks".
- **Maintenance text reminders** (the one part of M4 left over).

### D. Routing that goes further

- **UK-wide** routing is the Phase 3/launch job. After it: Ireland and the near continent only if a customer drives there.
- **Live traffic in the engine,** so the first route is already right and the faster-route offer is the exception
  (`faster-route-scope.md`, later phases).
- **Charges on the route:** clean air and low emission zones, tolls, and the cost of them in the job cost.
- **Vehicle detail beyond height, width, length and weight:** axle weights, trailers, ADR (dangerous goods) rules.
- **Delivery time windows:** arrive-by times, and a warning when the plan will miss one.
- **Parking availability:** parking shows capacity today, not free spaces (feedback from testers, 2026-10-13). Live spaces
  need a data source (a truck stop's sensors, or driver reports like "full"), so this starts as driver reports.
- **Order several stops for the driver** (work out the best order, not only follow the given one).

### E. The driver app, further

- **iOS** (blocked on the Apple account and company registration, `progress.md`, M5.10).
- **Android Auto and Apple CarPlay,** so the app is on the cab screen rather than a phone on a mount.
- **Offline maps** for the gaps in signal.
- **Other languages** (many drivers read Polish or Romanian better than English). Spoken directions in more languages.
- **Automatic light and dark by sunrise and sunset** (open, `ideas.md`).
- **Accessibility pass** (large text, contrast, screen readers).

### F. The data other drivers rely on

- **Hazard quality:** a trust score per report, so one wrong report counts for less than five agreeing ones; clearer expiry.
- **Public sources joined in:** National Highways' sensor data (WebTRIS, `ideas.md`), roadworks feeds, and bridge strike data.
- **Moderation at volume:** tools, so one person can keep reports clean when there are thousands.
- **Partner parking:** truck stops and depots confirming their own details (opening times, price, spaces).

## How to choose

Rough order, to argue with:

1. **A (run it as a business)** first. Nothing else matters if a big customer hits an outage with no one to tell.
2. **B (big fleet fit)** next, driven by what the first big fleet asks for. Single sign-on and the API are the usual asks.
3. **C and D** after that, in the order the first fleets' vehicles and routes demand. Tachograph work waits on the answer to
   "what do their tachographs have?"
4. **E and F** run alongside, in small pieces, because drivers feel them most and they need no sales conversation.

## Questions for the owner

1. Which of the big firms on the list says yes first, and what do they ask for before signing?
2. Is Android Auto and CarPlay a must for big fleets, or a nice extra?
3. Do any customers drive outside Great Britain?
4. How should a large fleet be billed (invoice, Direct Debit, annual contract)?
5. Is the aim of Phase 5 to grow the number of firms or to go deeper with the first few? The order above changes if it is the first.
