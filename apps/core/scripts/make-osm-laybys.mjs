// One-off, run by hand after fetch-osm-parking.mjs has filled its tile cache (scripts/.osm-cache): turns the roadside lay-bys in
// those tiles into a seed migration, so the map has a "Lay-bys" layer. Not run by the app or on a schedule.
//
//   node apps/core/scripts/make-osm-laybys.mjs
//
// What is taken: `highway=rest_area` in Great Britain. These are lay-bys and picnic stops; nothing in OpenStreetMap says they suit
// a lorry, so they are stored as `kind = 'layby'`, shown as their own layer, never offered as break parking, and credited to
// OpenStreetMap (© OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright).
//
// Left out: anything private or closed to the public, `hgv=no`, outside Great Britain, a named place whose name does not look like
// a lay-by (OpenStreetMap has things like "The Library" tagged this way), and any within 150 m of a place already imported by
// 0061 (a service area is sometimes also mapped as a rest area).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CACHE = fileURLToPath(new URL('./.osm-cache/', import.meta.url));
const SERVICES = fileURLToPath(new URL('../migrations/0061_seed_osm_parking.sql', import.meta.url));
const OUT = fileURLToPath(new URL('../migrations/0064_seed_osm_laybys.sql', import.meta.url));

// Rough boxes for what the tiles cover besides Great Britain.
function inGreatBritain(lat, lon) {
  if (lon > 1.55 && lat < 51.1) return false; // France
  if (lat > 51.3 && lat < 55.25 && lon < -5.35) return false; // Ireland and Northern Ireland
  if (lat > 54 && lat < 54.45 && lon > -4.9 && lon < -4.3) return false; // Isle of Man
  return true;
}

const LAYBY_NAME =
  /lay-?by|rest|park|picnic|view|stop|services|stopping|pull-?in|turn-?out|passing/i;

const elements = new Map();
for (const file of readdirSync(CACHE)) {
  for (const e of JSON.parse(readFileSync(`${CACHE}${file}`, 'utf8')))
    elements.set(`${e.type}/${e.id}`, e);
}

const known = [
  ...readFileSync(SERVICES, 'utf8').matchAll(/ST_MakePoint\(([-\d.]+), ([-\d.]+)\)/g),
].map((m) => ({
  lon: Number(m[1]),
  lat: Number(m[2]),
}));

const near = (a, b, metres) => {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon) <= metres;
};

const kept = [];
for (const [osmId, e] of [...elements].sort(([a], [b]) => a.localeCompare(b))) {
  const tags = e.tags ?? {};
  if (tags.highway !== 'rest_area') continue;
  if (['private', 'no', 'customers', 'permit', 'delivery'].includes(tags.access)) continue;
  if (tags.hgv === 'no') continue;
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined || lon === undefined || !inGreatBritain(lat, lon)) continue;
  const name = (tags.name ?? '').trim().slice(0, 120);
  if (name !== '' && !LAYBY_NAME.test(name)) continue;
  const point = { lat, lon };
  if (known.some((k) => near(k, point, 150))) continue;
  // Two lay-bys opposite each other, or an area and its point, are one place on the map.
  if (kept.some((k) => near(k, point, 60))) continue;
  kept.push({
    osmId,
    lat,
    lon,
    name: name === '' ? undefined : name,
    capacity:
      Number.parseInt(tags.capacity ?? '', 10) > 0 ? Number.parseInt(tags.capacity, 10) : undefined,
    toilets: tags.toilets === 'yes' ? true : undefined,
    lit: tags.lit === 'yes' ? true : undefined,
  });
}

const lit = (v) =>
  v === undefined ? 'null' : typeof v === 'string' ? `'${v.replaceAll("'", "''")}'` : String(v);
const rows = kept.map(
  (s) =>
    `(gen_random_uuid(), null, 'osm', 'layby', ${lit(s.osmId)}, ST_SetSRID(ST_MakePoint(${s.lon}, ${s.lat}), 4326)::geography, ` +
    `${lit(s.name)}, 'Lay-by', ${lit(s.capacity)}, ${lit(s.toilets)}, ${lit(s.lit)}, now(), now())`,
);
const statements = [];
for (let i = 0; i < rows.length; i += 200) {
  statements.push(`insert into parking.safe_parking_spots
  (id, reporter_id, source, kind, osm_id, location, name, note, capacity, toilets, lit, reported_at, last_reported_at)
values
${rows.slice(i, i + 200).join(',\n')}
on conflict (osm_id) where osm_id is not null do nothing;`);
}
const header = `-- Roadside lay-bys in Great Britain from OpenStreetMap (© OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright).
-- Generated once by apps/core/scripts/make-osm-laybys.mjs from the tiles fetch-osm-parking.mjs saved; not refreshed. Stored as
-- kind = 'layby': nothing in OpenStreetMap says these suit a lorry, so the map shows them as their own layer and they are never
-- offered as break parking. Each keeps its OpenStreetMap id so it is never inserted twice. Staff can edit or delete any of them.
`;
writeFileSync(OUT, `${header}\n${statements.join('\n\n')}\n`);
console.log(
  `Wrote ${kept.length} lay-bys (from ${[...elements.values()].filter((e) => e.tags?.highway === 'rest_area').length} tagged rest areas) to ${OUT}`,
);
