# Loaded or empty: routing that knows about hills

Scoped 2026-11-09 from driver feedback: "An option for loaded or empty would be helpful. Washington to Grangemouth it keeps trying to send me
via the A68. It is the quickest way, but not when fully loaded. That would be the A1." The owner chose to build a real loaded/empty option
rather than only a way to avoid a named road. **Not started: no code has been written.**

## What the engine can and cannot do (checked 2026-11-09)

- Valhalla's `truck` costing uses the vehicle's weight only for **legal** weight limits. It has **no hill or gradient setting**: `use_hills` exists
  for bicycle, scooter and pedestrian costing only ([route API reference](https://valhalla.github.io/valhalla/api/route/api-reference/)).
- Our tiles are built with `build_elevation=False` (`infra/docker/compose.yml`, `infra/valhalla/build-gb-tiles.sh`), so edges carry no grade.
  `valhalla.json` already names an `elevation` folder (`infra/docker/custom_files/valhalla.json`), and Valhalla's `/height` service reads
  that folder **at run time, independently of the tiles**. So heights can be added without rebuilding the tiles. (Not yet tried on our own server.)
- `use_highways` and `use_truck_route` do not bring the A1 in. They were tried on Valhalla's public demo server (same OpenStreetMap data, so
  our live times may differ a little; our own server could not be reached from the session).

Washington (NE37) to Grangemouth, 44 t artic, public demo server, three routes returned and none via the A1:

- 221 km, 226 min, A696 and A68. Highest point 418 m (Carter Bar), 2,769 m of climbing, steepest 500 m climb about 9.0%.
- 244 km, 237 min, A68 all the way. 3,573 m of climbing, steepest about 9.4%, about 4 km of 6%+ climbing.
- 300 km, 241 min, A69 and the M73.
- With a stop forced near Alnwick, the A1 route: 248 km, 260 min, **highest point 164 m, 2,371 m of climbing, steepest about 7.2%, 0.2 km of
  6%+**. So it is about 27 km and 34 min longer than the quickest, which is why it never wins on time, and why the engine will not pick it for us.

Heights came from the public server's `/height` with `range: true, resample_distance: 100`, graded over 500 m windows. SRTM heights are 90 m
cells with a vertical error of several metres, so a grade over less than about 400 m is noise, and the numbers are for comparing routes, not for
quoting as the gradient of a road.

## The design: choose among routes, scoring hills, when the vehicle is loaded

Not a patch to Valhalla (that is a C++ fork of its truck costing, a custom image to build and keep up to date, and a tile rebuild with elevation).
Instead core does what it already does for hazards and closures: plan, look at the route, put thin avoid zones on the part to dodge, plan again.

1. **Height service.** A new port method on `RoutingEngine`, `elevationProfile(geometry)`, backed by Valhalla `/height` (`range: true`). It returns
   distance-and-height pairs along the route. If the service is not set up or fails, the loaded option is simply not offered (the app says hill
   checking is unavailable); nothing else changes.
2. **Steepness, in the domain** (pure TypeScript, tested): from a profile, the total climb, the highest point, the steepest climb over a 500 m window,
   and the stretches at or above a limit. **Loaded** treats a sustained climb of about 6% or more as a stretch to avoid; **empty** keeps today's
   behaviour (hills are not scored). The thresholds are the first thing to tune on real routes.
3. **Planning when loaded.** Take the engine's candidate routes and score each. If the best has stretches over the limit, put avoid zones on the worst
   stretches (the closure code already builds "thin avoid zones on the route's own line": `closure-avoid-zones.ts`), re-plan, and score again, up to about
   four rounds. Stop when a route has no stretch over the limit, or nothing better turns up. A destination that can only be reached by a steep road is still
   reachable: if the avoid zones leave no route, fall back to the least steep route found and say so.
4. **What the driver sees.** On Plan route, a **Loaded / Empty** switch (remembered on the phone, like the units). When loaded, the options are labelled
   for hills as well as time: the quickest, and "Easier on a loaded vehicle" with what it costs ("+34 min, +27 km; highest point 164 m instead of 418 m;
   2 steep climbs instead of 6"). The driver still chooses. A route is never switched silently.
5. **Not only the preview.** The same score must apply when a trip is planned, and when a reroute or the faster-route check offers a different road, or a
   loaded driver would be sent up the A68 by a reroute.

What it will not do: use the real weight on the vehicle (the app only knows empty or loaded; a middle setting can come later), know about a steep road that
is not on any route it has tried, or be exact about a gradient (heights are coarse).

## Stages

1. **Core, no app change.** The port method and adapter, the steepness domain with tests, the avoid-and-replan loop, a `loaded` flag on the preview request,
   and the hill figures on each option (additive in `packages/contracts`, so an older app is unaffected). Unit tests with a fake engine, plus one check
   against the real service. It is off until heights are available on the server, so it can merge before stage 2.
2. **Server data (owner step, on the droplet).** Download SRTM tiles for Great Britain into the `elevation` folder (about 130 one-degree tiles; Valhalla's
   `valhalla_build_elevation --from_bbox=-9,49,2,61` fetches them) and make sure the `height` service limits in `valhalla.json` allow a long route. Disk and
   memory to be checked first (`deployment-guide.md`, section 10).
3. **Driver app.** The Loaded / Empty switch on Plan route and the hill lines on the option cards; the same setting used on reroute and the faster-route
   check. Over the air.
4. **Tune on real routes** with the owner's drivers: Washington to Grangemouth, Hexham to Hebburn, the Pennine crossings, Cumbria and the Welsh hills. Keep a
   few as golden routes (`test:golden`) so a later change cannot send a loaded lorry over Carter Bar again.
5. **Later, if it is not good enough:** a hill cost inside the engine (a fork of Valhalla's truck costing) and elevation built into the tiles. Only worth it if
   choosing among routes misses roads that matter.

## Open decisions (owner)

- The default for a new vehicle: **Empty** (today's behaviour) is the safe choice for nothing changing; **Loaded** is the safer one for a heavy lorry. A
  per-vehicle default can come later.
- The wording for drivers: "Loaded / Empty", or something plainer ("Fully loaded", "Empty or light").
- The disk and memory for the elevation data on the droplet (stage 2).
