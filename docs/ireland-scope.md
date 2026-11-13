# Ireland: scope (2026-11-11)

**Status: speed limits in km/h built (2026-11-13, see `modules.md`, "Speed limits on the trip screen"); the rest scoped, nothing built.** The owner wants it live this weekend (14 and 15 November). This file says what "Ireland" means for
the product, what breaks if the routing tiles are simply switched over, what must be done first, and what can wait. Written from the
code and docs; web facts are named with their source and **marked where they were not checked against the original**.

## Two countries, not one

- **Northern Ireland** is in the UK: speed limits in mph, UK law and data protection, pounds. It is **not covered today, on purpose**
  (`deployment-guide.md` section 10; a golden test asserts there is no route there). The Great Britain extract does not include it.
- **The Republic of Ireland**: speed limits in **km/h**, EU law (GDPR with no UK carve-out, EU drivers' hours rules), euro, Eircodes,
  Irish vehicle testing (NCT and the commercial CVRT) in place of the MOT.
- One extract covers both: Geofabrik's Ireland and Northern Ireland file (about 333 MB, against about 2.1 to 2.2 GB for Great
  Britain; sizes from a search summary of Geofabrik's page, **not downloaded**; the session cannot reach Geofabrik).

## What happens if the tiles are only rebuilt (do not do this alone)

- **Speed limits would be wrong in the Republic.** Core converts every limit to mph and rounds to the UK's steps (`speed-zone.ts`):
  an 80 km/h limit shows as **50**, 100 km/h becomes the **national speed limit** disc (which does not exist in Ireland), 120 km/h
  the same. The app's rule is "a wrong number is worse than none", so this must be fixed before the Republic is on.
- Address search is restricted to Great Britain (`country: 'gb'` in `lib/geocoding.ts`), so an Irish address finds nothing.
- Hazard, parking, lay-by and camera data exist only for Great Britain (the seed scripts exclude Ireland with a box). Not wrong, just empty.
- Weather warnings (Met Office) cover Northern Ireland but not the Republic; fuel prices (GOV.UK Fuel Finder) are Great Britain only.
  Both stay empty, without an error.

## Must do first

1. **Routing tiles for the island, in the same graph.** Change `infra/valhalla/build-gb-tiles.sh` to take both extracts (the gis-ops image
   takes several URLs in `tile_urls`, or merge with `osmium merge`), build on a temporary 16 GB / 8 vCPU droplet as on 2026-10-16
   (`deployment-guide.md` section 10, a few hours and a few pounds), copy across, swap, restart, keep the old directory for rollback.
   Keep the live `valhalla.json` (it carries the raised trace limits). Check the serving droplet's disk and memory for the larger graph.
   **A single graph joins the islands by ferry.** Holyhead to Dublin becomes a route; ferry times come from the map, not a timetable.
   The app already knows a `ferry` manoeuvre; decide whether to allow, label ("Includes a ferry") or refuse such routes.
   Then **height data** for the hill check needs the tiles for Ireland too (`deployment-guide.md` section 11), or the check says
   it is unavailable there.
2. **Speed limits in the right unit.** Core must know which side of the border an edge is on (Valhalla was built with admin data:
   whether trace output gives a country per edge is **not checked**; a simplified border polygon is the fallback, wrong only within a
   few hundred metres of the line). Republic: send km/h (a new field beside `limitMph`, so an old app still works) and **show no
   sign where there is no limit in the map**, never the national disc. The app shows the number as posted. Northern Ireland stays in mph.
   Irish limits for lorries are not the posted limit: an HGV over 3.5 t is limited to 90 km/h on motorways and 80 km/h elsewhere
   (a search summary of the [Road Traffic (Ordinary Speed Limits) Regulations](https://www.irishstatutebook.ie/2005/en/si/0009.html) and
   the RSA's guidance; **confirm against the current regulation**). Showing the posted number with the usual "check the signs"
   wording is consistent with how Great Britain works.
3. **Address search for Ireland.** `country` takes a list in MapTiler's geocoder (**confirm**): `gb,ie`. Test an Eircode and a
   few rural townlands, which is how many Irish addresses are written.
4. **Lorry restrictions, tested on real routes.** Routing trusts OpenStreetMap tags. Republic of Ireland maximum height is 4.65 m
   (Garda notice, 2013, via a search summary), and Dublin has a **city-centre ban on lorries with five or more axles from 07:00 to
   19:00 with a permit system** (older sources; **check the current rule with Dublin City Council**). Drive these in the app before
   release and write down what it does: Dublin Port to the M50, the Port Tunnel, a 5-axle artic to a city-centre address, a 4.8 m
   vehicle on a motorway. Add them to the golden routes, and change the "does not route in Northern Ireland" test.
5. **Words.** The app, both store listings, the landing page, the sales pages and the privacy notice say "Great Britain" or "UK".
   Change those only when the tiles are live. Wording for the Republic needs the solicitor (below).

## Do soon after, not blocking

- **Tolls.** The engine reports tolled stretches anywhere, so an Irish toll will say "Includes a toll" but without a price. The named
  table (`routing/domain/tolls.ts`) has Great Britain crossings only; the M50 (eFlow, barrier-free), the Dublin Port Tunnel and the
  concession motorways would need reading from the operators' own pages, as for the British five.
- **Seed data.** Run the existing OpenStreetMap scripts for the island (`fetch-osm-parking.mjs`, `fetch-osm-hazards.mjs`,
  `fetch-osm-cameras.mjs`, `make-osm-laybys.mjs`): each excludes Ireland with a rough box today. Cameras: Irish speed vans are mobile and
  not in the map, as in Great Britain.
- **Presets and warnings.** The five preset sizes and the dimension warnings are written for UK lorries (the 4.95 m "taller than almost
  any" message). Height 4.65 m is the Irish ceiling, so a 4.95 m vehicle would never be legal there. Add the Irish maximums.
- **Phone numbers.** `identity/domain/identifier.ts` knows UK numbers only; a test already uses a +353 number, so check it is kept as
  written. Sign-in is by email, so this is small.
- **Hours.** The shift clock has `gb_domestic` and `assimilated_eu` rule sets; Ireland uses the EU rules, so the second applies. Check the wording.
- **Portal.** Postcodes lookup is postcodes.io (UK only); an Irish depot needs an address search or a map pin. Maintenance dates say MOT;
  the Irish tests are different. Billing is in pounds (VAT treatment for Irish firms is the accountant's call).
- **Fuel, weather.** No official free source known for fuel prices; Met Éireann's warnings could be added beside the Met Office's.

## Legal and business questions for the owner (not code)

- **Data protection.** Offering the app to people in the EU while WagonWise is a UK company may need an **EU representative** under the
  GDPR (Article 27) and updated wording on the privacy notice and the Play and Apple data forms. This is the solicitor's question;
  it has not been researched here.
- **Store availability** (Ireland in the Play and App Store country lists), the store description, and whether the portal is sold in euros.
- **Sales:** who the first Irish firms would be. Irish hauliers use different dates and tests for compliance records.

## Plan for the weekend

- **Before Saturday (me, no server access needed):** the speed unit change (core, contract, app), address search countries, the new
  golden routes and Irish test list, the tile build script for both extracts, the Irish seed script changes, an updated runbook. All
  over-the-air safe except the contract change, which core ships first.
- **Saturday (owner, a droplet):** build the combined tiles, swap, restart, run the golden routes. Needs the DigitalOcean access this
  session does not have.
- **Sunday:** drive the Irish test list on a phone, decide the ferry and Dublin wording, then release.
- **Gate:** if the speed fix or the lorry-restriction tests do not pass, switch on **Northern Ireland only** (mph, UK law, no new
  legal questions) and leave the Republic for the week after. The map data is the same job either way.

Not verified: the Geofabrik file size and name; Valhalla's per-edge country field; MapTiler's `country` list; every Irish rule above
(speed limits, height, Dublin cordon, Article 27); whether Valhalla honours Dublin's restrictions from the map data.
