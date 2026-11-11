# MapTiler usage: where it goes, and how to bring it down (scoped 2026-11-11)

**Status: scoped, nothing changed yet.** The owner reached 75% of the free tier a few days after launch and moved to MapTiler's Flex plan
(2026-11-11). This file says what in the code spends MapTiler requests, what to look at first, and the options in order of effort.
It was written from the code; **the usage numbers themselves are in MapTiler's dashboard, which nobody here can see**, so the order
below depends on what the split turns out to be.

## What spends requests

- **The map itself.** The driver app draws MapTiler's `streets-v2` vector style through MapLibre native
  (`lib/map-style.ts`, `components/route-map.tsx`). The portal's live map does the same in the browser (`FleetMap.tsx`).
  MapTiler counts a **request** for each tile and each other API call. It counts a cheaper **session** (one map load) only for its own
  SDK JS and Leaflet plugin; we use MapLibre directly, so every tile is a request (MapTiler's
  [sessions vs requests](https://docs.maptiler.com/guides/account/sessions-vs-requests/) page, read through a search summary).
- **Address search.** `lib/geocoding.ts` calls MapTiler's geocoding API directly from the phone, once for each pause in typing
  (400 ms debounce, three or more characters). Geocoding counts as requests too. Used by Where to? and both pickers on Plan route.
- **Fonts, sprites and the style file** come from MapTiler as well. Whether those count is not confirmed: check in the dashboard.
- **Not MapTiler:** the portal's postcode lookup (postcodes.io), routing (our own Valhalla), traffic (TomTom).

What is already in place: the phone keeps a **250 MB** map cache (`OfflineManager.setMaximumAmbientCacheSize`, `app/_layout.tsx`).
Eleven screens each create their own map (home, active trip, route overview, plan route, reroute, three report screens), so each opens
the style again.

## Look first (the owner, ten minutes, no code)

1. MapTiler Cloud, **Analytics**: split the month by **tile requests vs geocoding vs other**, and by day. A jump on the launch day
   (8 November) and after presets (9 November) would be expected.
2. Check the **referrer and user-agent** breakdown for anything that is not the app or the portal. **The key ships inside the app**
   (`EXPO_PUBLIC_MAPTILER_API_KEY`) and a native app cannot be locked to a web origin, so anyone who unpacks the app can use the quota.
3. Make **separate keys** for the driver app, the portal and development, so the split is visible from now on, and set a monthly
   **usage limit or alert** on each (MapTiler's [controlling expenses](https://docs.maptiler.com/guides/account/controlling-expenses/)
   page). A key change in the app is a build-time value, so it goes out with the next release, not over the air.
4. Confirm the Flex allowance and overage on the live pricing page. A third-party summary says Flex is $25 a month with 25,000 sessions
   and 500,000 requests, then $0.10 per 1,000 requests; **that was not read from MapTiler's own page** (it could not be reached from this
   session), so treat it as a guide only.

## Options, cheapest first

1. **Address search: fewer calls (code, JavaScript only, over the air, low risk).** Wait for a longer pause (about 700 ms) and four
   characters; remember the last results for the same text so deleting and retyping costs nothing; ask for fewer results (the field shows
   five); never search for text the driver just picked. If geocoding is a large share this is the quickest win. Likely saving: a guess
   until the split is known.
2. **The map while navigating (code, over the air, medium).** The trip map is tilted 45 degrees at zoom 16 (`NAV_PITCH_DEG`, `followZoom`),
   and a tilted view needs tiles out to the horizon. Less tilt, or one zoom level less, loads far fewer tiles on a long trip. This is a
   trade against how the map looks, so the owner should see it on a phone. MapLibre native also has settings for how far ahead to
   prefetch and for loading fewer tiles at a tilt; whether our library exposes them was **not checked**.
3. **Fewer maps opening (code, over the air, medium).** Keep one map alive across the screens that use the same view, so the style and
   tiles are not fetched again on each screen change. More work than it sounds, because the screens configure their map differently.
4. **Our own map tiles (a day or two to try, the lasting fix).** Build a Great Britain plus Ireland vector tile file with Planetiler
   from the same OpenStreetMap data the routing uses, and serve it ourselves (tileserver or Martin on a droplet, or a single PMTiles file
   behind a CDN), with our own style, fonts and sprites. MapTiler's per-request cost goes to nothing, and the key stops being something
   to steal. Costs: a droplet and bandwidth, the style needs finishing and testing in light and dark, glyph files must be hosted,
   and OpenStreetMap and style attribution must stay. **Not confirmed:** whether MapLibre native in our version reads PMTiles directly
   (a tile server over HTTP works either way). Worth a one-day spike once the split shows tiles are the bulk.
5. **Portal map (small).** The browser already caches tiles; only open the live map when the page is opened. Probably a small share.

## Suggested order

Do the **ten-minute look** and **option 1** now; they cost nothing or little and tell us what to do next. Decide on **option 4** from
the numbers. Ireland (`ireland-scope.md`) adds map and search use in a second country, so settle the plan before it launches.

Not verified: any MapTiler price or limit (the pricing page was not reachable from this session); how much of the use is tiles
against geocoding; whether style, sprite and font requests count; whether our MapLibre version supports PMTiles or the prefetch and
level-of-detail settings.
