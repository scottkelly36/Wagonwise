// One-off: fetch lorry parking and service areas in Great Britain from OpenStreetMap (via the public Overpass API) and write
// them as a seed migration, so the app starts with a map of places to park. Run by hand, once:
//
//   node apps/core/scripts/fetch-osm-parking.mjs
//
// It is not run by the app or on a schedule. The data is © OpenStreetMap contributors, under the ODbL licence
// (https://www.openstreetmap.org/copyright): the app and the dashboard credit it wherever an imported spot is shown, and each
// imported row keeps its OpenStreetMap id (`osm_id`) and `source = 'osm'`.
//
// What is taken: `amenity=parking` marked for lorries (`hgv=designated`, or a lorry capacity), `highway=rest_area` and
// `highway=services`; never anything private or closed to the public. Ordinary car parks that merely allow lorries
// (`hgv=yes`) are left out, as there are thousands and they are not lorry parking.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../migrations/0061_seed_osm_parking.sql', import.meta.url));
// The public servers come and go: each attempt tries the next one.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
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

function toSpot(element) {
  const tags = element.tags ?? {};
  if (['private', 'no', 'customers', 'permit', 'delivery'].includes(tags.access)) return undefined;
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return undefined;

  const hgvCapacity = Number.parseInt(tags['capacity:hgv'] ?? '', 10);
  const isParking = tags.amenity === 'parking';
  if (isParking && tags.hgv !== 'designated' && !(hgvCapacity > 0)) return undefined;

  const kind =
    tags.highway === 'services'
      ? 'Service area'
      : tags.highway === 'rest_area'
        ? 'Rest area'
        : 'Lorry parking';
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

async function main() {
  const spots = new Map();
  let tiles = 0;
  const failed = [];
  for (let south = SOUTH; south < NORTH; south += 1) {
    for (let west = WEST; west < EAST; west += 1) {
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
      await sleep(1_500);
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
