// One-off: fetch lorry parking and service areas in Great Britain from OpenStreetMap (via the public Overpass API) and write
// them as a seed migration, so the app starts with a map of places to park. Run by hand, once:
//
//   node apps/core/scripts/fetch-osm-parking.mjs
//
// It is not run by the app or on a schedule. The data is © OpenStreetMap contributors, under the ODbL licence
// (https://www.openstreetmap.org/copyright): the app and the dashboard credit it wherever an imported spot is shown, and each
// imported row keeps its OpenStreetMap id (`osm_id`) and `source = 'osm'`.
//
// What is taken, with precision over quantity (a driver sent to a depot or a picnic lay-by is worse than a missing place):
//   - `amenity=parking` marked for lorries (`hgv=designated`, or a lorry capacity).
//   - `highway=services` only when it is plainly a motorway or truck service area: run by a known service-area operator, marked
//     for lorries (`hgv=yes`), or named "... Services" and not a "Service Station" (a petrol station) or a forecourt. In OpenStreetMap
//     this tag is also used loosely for depots, petrol stations and car parks, which are left out.
//   - `highway=rest_area` is NOT taken: it is mostly unnamed lay-bys and picnic stops with nothing to say they suit a lorry.
// Never anything private or closed to the public, never `hgv=no`, and nothing outside Great Britain (the tiles also cover
// Ireland, the Isle of Man and France). Ordinary car parks that merely allow lorries (`hgv=yes`) are left out.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../migrations/0061_seed_osm_parking.sql', import.meta.url));
// The public servers come and go: each attempt tries the next one.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
// Each tile that succeeds is kept here, so a run that stops can be started again and only fetch what is missing.
const CACHE = fileURLToPath(new URL('./.osm-cache/', import.meta.url));
const AGENT = 'WagonWise-one-off-parking-import/1.0 (https://wagon-wise.co.uk)';

// Great Britain, in 1 degree tiles so each query is small enough for the public server.
const SOUTH = 49;
const NORTH = 61;
const WEST = -9;
const EAST = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function query(bbox) {
  const b = bbox.join(',');
  return `[out:json][timeout:60];
(
  nwr["amenity"="parking"]["hgv"="designated"](${b});
  nwr["amenity"="parking"]["capacity:hgv"](${b});
  nwr["highway"="rest_area"](${b});
  nwr["highway"="services"](${b});
);
out center tags;`;
}

// curl rather than Node's fetch: the public server is sometimes slow to accept a connection, which fetch gives up on after 10 seconds.
function fetchTile(bbox) {
  const file = `${CACHE}${bbox.join('_')}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const elements = fetchTileFromServer(bbox);
  if (elements !== undefined) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(elements));
  }
  return elements;
}

function fetchTileFromServer(bbox) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const body = execFileSync(
        'curl',
        [
          '-sS',
          '--fail',
          '-m',
          '100',
          '-A',
          AGENT,
          '-H',
          'Accept: */*',
          '--data-urlencode',
          `data=${query(bbox)}`,
          ENDPOINTS[(attempt - 1) % ENDPOINTS.length],
        ],
        { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
      );
      const json = JSON.parse(body);
      if (json.remark && /timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      return json.elements ?? [];
    } catch (error) {
      const why = String(error.message).split(/\r?\n/)[0].slice(0, 120);
      console.error(`tile ${bbox.join(',')} attempt ${attempt}: ${why}`);
      if (attempt === 8) return undefined;
    }
    execFileSync('sleep', [String(Math.min(attempt * 5, 30))]);
  }
  return undefined;
}

const yes = (v) => (v === 'yes' ? true : undefined);

// Operators of motorway and truck service areas.
const SERVICE_OPERATORS =
  /\b(moto|welcome break|roadchef|extra(msa)?|westmorland|onroute|exelby|first motorway|applegreen)\b/i;

// The tiles also cover places that are not Great Britain; leave those out with a rough box for each.
function inGreatBritain(lat, lon) {
  if (lon > 1.55 && lat < 51.1) return false; // France
  if (lat > 51.3 && lat < 55.25 && lon < -5.35) return false; // Ireland and Northern Ireland
  if (lat > 54 && lat < 54.45 && lon > -4.9 && lon < -4.3) return false; // Isle of Man
  return true;
}

function isServiceArea(tags) {
  if (tags.hgv === 'no') return false;
  if (tags.amenity === 'fuel') return false;
  const label = `${tags.name ?? ''} ${tags.operator ?? ''} ${tags.brand ?? ''}`;
  if (SERVICE_OPERATORS.test(label)) return true;
  if (tags.hgv === 'yes' || tags.hgv === 'designated') return true;
  const name = tags.name ?? '';
  return (
    /\bservices\b/i.test(name) &&
    !/service station|forecourt|garage/i.test(name) &&
    tags.toilets === 'yes'
  );
}

function toSpot(element) {
  const tags = element.tags ?? {};
  if (['private', 'no', 'customers', 'permit', 'delivery'].includes(tags.access)) return undefined;
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return undefined;

  if (!inGreatBritain(lat, lon)) return undefined;
  if (tags.hgv === 'no') return undefined;
  const hgvCapacity = Number.parseInt(tags['capacity:hgv'] ?? '', 10);
  if (tags.highway === 'services') {
    if (!isServiceArea(tags)) return undefined;
  } else if (tags.amenity === 'parking') {
    if (tags.hgv !== 'designated' && !(hgvCapacity > 0)) return undefined;
  } else {
    return undefined;
  }

  const kind = tags.highway === 'services' ? 'Service area' : 'Lorry parking';
  const name = (tags.name ?? tags.operator ?? '').trim().slice(0, 120) || undefined;
  const fee = tags.fee === 'yes' ? true : tags.fee === 'no' ? false : undefined;
  const capacity = Number.isInteger(hgvCapacity) && hgvCapacity > 0 ? hgvCapacity : undefined;
  return {
    osmId: `${element.type}/${element.id}`,
    lat,
    lon,
    name,
    note: kind,
    capacity,
    paid: fee,
    toilets: yes(tags.toilets),
    showers: yes(tags.shower),
    lit: yes(tags.lit),
    secure: tags.supervised === 'yes' || tags.surveillance === 'yes' ? true : undefined,
  };
}

const lit = (v) =>
  v === undefined ? 'null' : typeof v === 'string' ? `'${v.replaceAll("'", "''")}'` : String(v);

// Only the 1 degree tiles that touch land in Great Britain (the rest is sea, and a query for it only wastes the server's time):
// for each southern edge, the first and last western edge to fetch. Loose on purpose; a tile with no land just returns nothing.
const LAND = {
  49: [-7, -7],
  50: [-6, 1],
  51: [-6, 1],
  52: [-5, 1],
  53: [-5, 0],
  54: [-4, -1],
  55: [-6, -1],
  56: [-7, -2],
  57: [-8, -2],
  58: [-7, -2],
  59: [-4, -2],
  60: [-2, -1],
};

async function main() {
  const spots = new Map();
  let tiles = 0;
  const failed = [];
  for (let south = SOUTH; south < NORTH; south += 1) {
    const [firstWest, lastWest] = LAND[south] ?? [WEST, EAST - 1];
    for (let west = firstWest; west <= lastWest; west += 1) {
      const bbox = [south, west, Math.min(south + 1, NORTH), Math.min(west + 1, EAST)];
      const elements = fetchTile(bbox);
      if (elements === undefined) {
        failed.push(bbox);
        continue;
      }
      for (const element of elements) {
        const spot = toSpot(element);
        if (spot !== undefined) spots.set(spot.osmId, spot);
      }
      tiles += 1;
      if (tiles % 10 === 0) console.log(`${tiles} tiles, ${spots.size} places so far`);
      await sleep(3_000);
    }
  }

  for (let round = 1; round <= 3 && failed.length > 0; round += 1) {
    console.log(`Trying ${failed.length} missed tiles again (round ${round})`);
    await sleep(30_000);
    for (const bbox of failed.splice(0)) {
      const elements = fetchTile(bbox);
      if (elements === undefined) {
        failed.push(bbox);
        continue;
      }
      for (const element of elements) {
        const spot = toSpot(element);
        if (spot !== undefined) spots.set(spot.osmId, spot);
      }
      await sleep(3_000);
    }
  }

  if (failed.length > 0) {
    console.error(`${failed.length} tiles could not be fetched; nothing written. Run it again.`);
    process.exit(1);
  }

  // A service area is often mapped as both an area and a point: drop a place that sits within 250 m of another with the
  // same name (or no name and the same kind).
  const kept = [];
  for (const spot of [...spots.values()].sort((a, b) => a.osmId.localeCompare(b.osmId))) {
    const near = kept.some(
      (k) =>
        k.name === spot.name &&
        k.note === spot.note &&
        Math.abs(k.lat - spot.lat) < 0.0025 &&
        Math.abs(k.lon - spot.lon) < 0.004,
    );
    if (!near) kept.push(spot);
  }

  const header = `-- Starting set of lorry parking and service areas in Great Britain, from OpenStreetMap (© OpenStreetMap contributors,
-- ODbL, https://www.openstreetmap.org/copyright). Generated once by apps/core/scripts/fetch-osm-parking.mjs; not refreshed.
-- Each row keeps its OpenStreetMap id so it is never inserted twice, and source = 'osm' so it is never mistaken for a
-- driver's report. WagonWise staff can edit or delete any of them from the dashboard.
`;
  const rows = kept.map(
    (s) =>
      `(gen_random_uuid(), null, 'osm', ${lit(s.osmId)}, ST_SetSRID(ST_MakePoint(${s.lon}, ${s.lat}), 4326)::geography, ` +
      `${lit(s.name)}, ${lit(s.note)}, ${lit(s.capacity)}, ${lit(s.paid)}, ${lit(s.toilets)}, ${lit(s.showers)}, ` +
      `${lit(s.lit)}, ${lit(s.secure)}, now())`,
  );
  const statements = [];
  for (let i = 0; i < rows.length; i += 200) {
    statements.push(
      `insert into parking.safe_parking_spots
  (id, reporter_id, source, osm_id, location, name, note, capacity, paid, toilets, showers, lit, secure, reported_at)
values
${rows.slice(i, i + 200).join(',\n')}
on conflict (osm_id) where osm_id is not null do nothing;`,
    );
  }
  writeFileSync(OUT, `${header}\n${statements.join('\n\n')}\n`);
  console.log(
    `Wrote ${kept.length} places (from ${spots.size} before removing duplicates) to ${OUT}`,
  );
}

await main();
