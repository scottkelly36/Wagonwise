# Phase 5: ideas (draft, not scoped)

**Status:** a starting list for the owner to cut down, not a plan. Phase 4 ends with the product ready for big fleets
(`phase-3-scope.md`, "Phase 4 on the board"). Phase 5 is what comes after the first big fleets say yes: make it dependable
as a business, fit it into how big firms already work, and go deeper on the driver's day. Nothing here is built. Items that
are already recorded elsewhere point at where.

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
  - **Not useful for booking:** Parkopedia (no HGV or UK truck-bay API found), Trucker Path (US and Canada only), Park4Night
    (community map, no API found). MWayBuddy and Truck Parking Europe are information only.
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

### 4. Expand the staff portal

Candidates, to be cut by what firms ask for: a calendar or board view for jobs; bulk job import; customers and contacts as
their own records; documents per vehicle and driver (insurance, licence checks, expiry dates); driver licence and CPC
reminders; trailer records; a message to a driver from a job; exports and scheduled reports; per-depot views; a read-only
customer link to track a delivery. The staff guide (`/guide`) grows with each page.

### 5. A haulage marketplace (advertise jobs)

- **The idea:** firms post loads or spare capacity; hauliers see and take them.
- **Why it is different from the rest of WagonWise:** it needs two sides at once (enough loads and enough trucks in the same
  places), so it starts empty, and it has legal and money questions the app does not: who is liable for the load and the
  delivery, goods-in-transit insurance, operator licences, payment and late payment, and disputes. Established load boards
  already exist, so it needs a reason to win (for example, loads that arrive already priced and routed for the truck, with
  the hours and parking considered).
- **A smaller first step:** let a firm share a job with a set list of trusted hauliers (subcontractors it already uses), with
  the job flowing into the other firm's WagonWise. That tests demand and the legal side without an open marketplace.
- **Not researched yet.** Needs a look at existing load boards, and a solicitor, before any design.

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
