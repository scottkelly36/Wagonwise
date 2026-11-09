# Tolls and clean-air zones: routing that knows what a route will cost

Scoped 2026-11-09 from the owner's question while shipping the hill-sensitive option ("do we need to account for tolls and ULEZ at some point?"), and
a family haulier's wish for the usual choices on the route screen: shortest, fastest, easiest, economy. It follows the hills work
(`docs/loaded-routing-scope.md`): the driver is shown what each route does and chooses; a route is never switched silently. **Not started: no code
has been written.** The idea was already listed under "Routing that goes further" in `docs/phase-5-ideas.md`; this moves it up and gives it a design.

## What exists today (checked 2026-11-09)

- Nothing in core knows about charges. `estimateFuelCostGBP` (`domain/route-option.ts`) says "no tolls" in its own comment; it uses distance, the vehicle's
  fuel economy and a pump price, and is undefined when the driver has not given a fuel economy.
- The vehicle profile holds height, width, length, weight, axle weight and fuel economy. **It has no emissions (Euro) class**, which every clean-air rule
  depends on.
- Valhalla's truck costing accepts `use_tolls` (0 to 1; below 0.5 prefers to avoid tolls; default 0.5; **a preference, not a ban**, since some journeys
  need a toll). There is also an experimental hard exclusion, `exclude_tolls`, that only works if the server's config sets
  `service_limits.allow_hard_exclusions`, and Valhalla warns that with it "no path" is likely. Every route comes back with `summary.has_toll`, and each
  maneuver has a `toll` flag ([route API reference](https://valhalla.github.io/valhalla/api/route/api-reference/)). That tells us **that** a route has a
  toll, not **which** crossing or **what it costs**. It depends on OpenStreetMap tagging, so it is a hint to check, not proof.
- Valhalla knows nothing about clean-air or low emission zones. Our avoid-zone code (`exclude_polygons`) is limited to about 10 km of edge in all
  (`max_exclude_polygons_length`), so a big zone cannot be avoided that way (see "London" below).

## What matters for the owner's drivers

Not every charge is equal. For Hexham-based work, in rough order of how often it will matter (a first guess to confirm with the drivers):

1. **Scotland's low emission zones** in Edinburgh, Glasgow, Dundee and Aberdeen. They apply to every vehicle including HGVs, at Euro VI for diesel
   lorries, and are enforced (Glasgow from June 2023; Dundee, Aberdeen and Edinburgh from mid 2024). The penalty is a charge notice, not a ban at the
   boundary. Dundee is the owner's regular run. Sources: [lowemissionzones.scot](https://www.lowemissionzones.scot/),
   [Transport Scotland](https://www.traffic.gov.scot/greener-travel/what-are-low-emission-zones).
2. **Tyneside Clean Air Zone** (Newcastle and Gateshead; class C, so non-compliant HGVs pay a daily charge, and it is on the home patch) and the Tyne
   Tunnels toll. [GOV.UK: driving in a clean air zone](https://www.gov.uk/guidance/driving-in-a-clean-air-zone).
3. **The tolled crossings** a haulier meets further afield: Dartford (free-flow, paid online, a fine if missed), Humber Bridge, Mersey Gateway and the Mersey
   tunnels, Tamar Bridge, and the **M6 Toll**, which is the one that is also a time saver, so it is where "fastest" and "cheapest" disagree most.
4. **Other English clean air zones** (Bath, Birmingham, Bradford, Bristol, Portsmouth, Sheffield), occasional for this fleet.
5. **London.** For a heavy lorry the emissions rule is the **Low Emission Zone**, Euro VI across Greater London
   ([TfL](https://tfl.gov.uk/modes/driving/low-emission-zone/your-vehicle-and-lez); to be checked against TfL's current pages, since the coverage found was
   2019 to 2021, and whether the ULEZ also touches HGVs is not settled here). Separately, the **Direct Vision Standard** safety permit applies to lorries over
   12 t ([IOTA summary, 2021](https://www.iota.org.uk/blog/london-direct-vision-standard-safety-permit-enforcement-begins-1st-march-2021)); it is a permit the
   operator holds, not something a route can avoid. Greater London is too big to avoid by avoid-zones, so for London the app can only **warn**.

**Rates are not recorded here.** The figures found in secondary sources disagree (for example Birmingham at £50 or £100 a day, and the Tyne Tunnels), and
zones and classes change (one guide mentions Tyne Tunnel rates changing in May 2026, and the English zones' classes were reported differently by different sources). Build
stage 2 from each operator's own page, and record the date and the URL beside each figure.

## The design: show the charge on every route, offer a cheaper one, let the driver choose

Same shape as the hills work: look at the routes core already finds, check each against data, and put a plain line on the card. Unlike hills, **checking
for a charge costs almost nothing** (no extra routing), so the charge line is shown whenever there is one; only _finding a cheaper route_ does extra work.

1. **A charges table, in the domain** (pure TypeScript, tested; no npm dependency): each toll (name, the line or point where it is crossed, price by
   vehicle class, how it is paid) and each zone (name, polygon, required standard by vehicle type, daily charge or penalty, the date it applies from,
   source URL, and the date the figure was last checked). Kept as a data file in the repo, reviewed on a schedule, not fetched live.
2. **Route check.** From a route's geometry, which tolls does it cross and which zones does it enter? A toll is matched by geometry, with Valhalla's
   `has_toll` as a prompt to look; a zone by polygon intersection. The result is a list of charges for the route and a total.
3. **The vehicle.** A new optional **Euro class** on the vehicle profile (additive in `packages/contracts`, a migration to add the column; the app asks
   once, with "I don't know" allowed). When it is unknown the card says a charge **may** apply and names the zone: it never assumes the vehicle is
   compliant, and never claims it is ("you may be charged; check your vehicle"). The Direct Vision Standard is not modelled.
4. **Cheapest.** A route label beside Fastest, Shortest and Fewer hills: the lowest **total cost** among the routes found, where cost is fuel
   (`estimateFuelCostGBP`, as today) plus tolls plus zone charges the vehicle would pay. It is only offered when it saves a meaningful amount, and the card
   says what it costs in time ("£18 less, 24 min longer"). Without a fuel economy, cost is charges only, and the card says so. Finding it: re-plan with
   `use_tolls` low, and with thin avoid-zones on a small zone when it can be skirted; keep the cheapest of the candidates. Large zones (London) cannot be
   avoided, so they are shown, not dodged.
5. **What the driver sees.** A line on each card ("Includes the Dartford Crossing, about £x, pay online by midnight tomorrow"), and a **Cheapest** card when
   there is one. The existing **Load type** switch is untouched (it is about hills). Whether there should also be an "Avoid tolls" switch is an open
   decision below.
6. **Not only the preview.** The same check applies to re-plans, a job's next stop and the faster-route check (it should not offer a quicker route that
   adds a toll without saying so). Server-sent reroute alerts have the same gap as hills: the setting is on the phone.
7. **The job cost.** Charges the driver pays go into what a job made. First version: a charge line the firm or driver can see and edit on the job; later,
   filled from the route actually driven.

What it will not do: **know a charge that is not in the table**, promise a vehicle is compliant, handle permits and exemptions (a firm may hold a
discount or an exemption), or price a toll that depends on time of day (the M6 Toll) beyond a stated typical figure.

## Stages

1. **Show that a toll is on the route (small, no data table).** Read `summary.has_toll` from Valhalla and show "This route has a toll" on the card, and
   try `use_tolls` to offer a toll-free alternative. Quick to build and tells us whether drivers care. Needs the field added to the contract (additive).
2. **The charges table and prices.** Tolls first (crossings from operators' own pages), then the route check and the price line.
3. **Zones and the Euro class.** The vehicle field and migration, the zone polygons, the "may be charged" wording. Scotland and Tyneside first.
4. **Cheapest.** Cost scoring and the label, the faster-route check, re-plans. Test on real routes: Hexham to Dundee and Edinburgh, Newcastle to
   London, and a Humber crossing, with a few kept as golden routes.
5. **The job cost** and a review reminder for the data (a dated checklist, since rates and zones change).

## Open decisions (owner)

- **Start with stage 1?** It is cheap and answers whether drivers want more, before the data work in stages 2 and 3.
- **An "Avoid tolls" switch** (like Load type) or only the Cheapest card? A switch is quicker for a driver who never wants a toll; the card never hides a
  choice.
- **Who keeps the data right.** Rates and zones change a few times a year. A scheduled review and a "last checked" date on each figure is the plan; the
  owner decides whether that is acceptable or whether a paid data source is worth it later.
- **Whether to ask for the Euro class at all in the first version**, or only show the zone ("a low emission zone is on this route; Euro VI lorries are
  not charged") and let the driver judge.
