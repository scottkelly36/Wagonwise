# Faster-route suggestions while driving: scope

Scoped 2026-10-10, from the owner's request: while a driver is navigating, if congestion makes the current route slow and a clearly
quicker one exists, offer it, the way Google Maps does, and **let the driver choose**: keep the current route or switch. Nothing here
is built yet.

## What exists today

- **Reroute alerts for hazards only.** When a hazard is reported or confirmed, core re-plans around it and sends a push notification
  ("A low bridge was reported ahead on your route. Tap for a new route") to drivers on a matching active trip, and to anyone with a
  recent plan they have not started (`routing/application/detect-reroute.ts`). It is limited to 3 alerts per trip per hour. The driver
  app has a screen that shows the old and the new route (`app/reroute/[id].tsx`).
- **Route options before setting off:** fastest and shortest, from the routing engine's alternatives (`preview-route-options.ts`).
- **Congestion reports are not used by the router.** A driver can report traffic (a pin with a wait in minutes). It shows on the map
  and expires, but neither the ETA nor route planning looks at it.
- **The routing engine (Valhalla) has no live traffic.** Its times are free-flow. So re-planning from where the driver is now gives
  the same answer as the route they are on, and it would never find something "quicker because of congestion". This is the core
  problem: a faster route needs the time **with traffic** for both the current route and the alternative.

## Ways to know the time with traffic

**A. Crowd reports only (what we already have).** Treat each live congestion report on or near the rest of the route as extra delay
on the current route (its wait in minutes). Ask the router for a route that avoids that spot (the engine already takes avoid areas,
as hazards use) and compare. Suggest the alternative when it beats current time plus the reported wait.

- Can be built now, costs nothing, and uses a mechanism we already trust.
- Only works where drivers report. In the test area, with a handful of testers, it will rarely fire. It gets better as drivers use it.

**B. A traffic data provider (TomTom, HERE or similar).** Gives the time with traffic and incidents. Two ways to use it:
(B1) read incidents and flow along the rest of the route to estimate the delay, then avoid them with our own router;
(B2) ask the provider's truck-routing service how long a route takes with traffic. **Either way the route itself still comes from our
own HGV-aware router**, using the provider for time only, so a route is never chosen that ignores the vehicle's height, weight or
length.

- Real coverage everywhere, not only where drivers report.
- Costs money at scale and needs an account and key (owner action). The free allowances I remember are about 2,500 requests a day
  for TomTom and about 250,000 a month for HERE; **I have not checked these, nor whether the terms allow this use. Check before
  committing.**
- Sends a driver's route to a third party, so the privacy notice and the data-protection assessment need an update first.

**C. Feed live traffic into the routing engine.** Valhalla can take live speed data, but it needs a pipeline that turns a provider's
flow data into the engine's own road segments. The best answer in the long run (every route would be traffic-aware, including
planning), and the most work. Not a first step.

**Not Google's routing as the source of the route.** Its routes do not know a lorry's dimensions, so it could send an HGV under a low
bridge, and its terms restrict mixing its data with other maps (to verify). If it is ever used, it would be for time only.

## How it should behave (the same whichever way the time is found)

- **Only while navigating, and only offers.** Never switches by itself. A quiet card, not a full-screen takeover.
- **When it looks:** every few minutes while the app is in front, and when a new congestion report appears near the rest of the route.
  Not in the last few minutes of the trip, and not while the driver is stopped on a break.
- **When it speaks up:** the alternative must save at least the larger of 5 minutes and 10% of the time left, and must be **allowed for
  this vehicle**: the same restrictions and hazard avoidance as normal planning. Traffic only chooses between routes that are
  already safe. It can never make a route less cautious (the rule that community reports only make routing more careful still holds).
- **The card:** "Faster route: saves 8 minutes" with the two routes drawn on the map, **Switch** and **Keep current route**. It goes
  away by itself after about a minute (that is not a change of route). Optional spoken cue, off unless the driver wants it.
- **No nagging:** after "Keep", the same alternative is not offered again; at most one suggestion every 10 minutes and 3 an hour
  (the same style of limit hazard alerts use). A driver can turn faster-route suggestions off.
- **When they switch:** the trip, ETA, break planning and the company's view all follow the new route.

## Phases

1. **Crowd-based (option A).** A server check for the active trip (core owns the route and the reports), the card in the app,
   limits, the setting. Reuses the reroute screen and the avoid-area mechanism. Low risk, and it proves the experience before any
   money is spent. About a week of work.
2. **Provider traffic (option B).** A short spike first: does the provider's truck routing accept the vehicle's dimensions, what does
   it cost for our volume, and do the terms allow it. Then add it behind the same card and rules.
3. **Live traffic in the engine (option C),** if the product grows to need traffic-aware planning everywhere.

## Decisions needed

1. Start with the crowd-based version, or go straight to a provider? (I would start with the crowd version: it can be built and
   tested now, and it shows how drivers react to being offered a choice.)
2. Provider and budget, if a provider is wanted: TomTom, HERE, or another.
3. The thresholds (5 minutes and 10%, one suggestion per 10 minutes), and whether a spoken cue is wanted.
4. Whether the weak coverage of crowd reports in the test area is acceptable for a first release.

## Risks

- **False positives annoy.** A suggestion that is wrong, or comes and goes, teaches drivers to ignore it. Hence the thresholds, the
  cooldowns, and showing the saving honestly.
- **Stale reports.** A congestion report has an expiry; the router should only count live ones.
- **Alternatives from the engine can be poor,** and the code notes the engine's alternatives ignore avoid areas, so a candidate
  must be re-checked against the avoid areas and the vehicle before it is offered.
- **Data and battery:** a check every few minutes is small, but it should not run when the screen is off or the driver has no signal.
