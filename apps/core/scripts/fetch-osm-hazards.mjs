// One-off: fetch low bridges and weight-limited bridges in Great Britain from OpenStreetMap (via the public Overpass API) and
// write them as a seed migration, so the hazard layer starts with real restrictions rather than an empty map. Run by hand:
//
//   node apps/core/scripts/fetch-osm-hazards.mjs            writes the migration and a review file
//   node apps/core/scripts/fetch-osm-hazards.mjs --dry-run  only prints counts and samples
//
// Not run by the app or on a schedule. The data is © OpenStreetMap contributors, under the ODbL licence
// (https://www.openstreetmap.org/copyright): the app and the dashboard credit it wherever an imported hazard is shown, and each
// imported row keeps its OpenStreetMap id (`osm_id`) and `source = 'osm'`.
//
// Precision over quantity (a false warning teaches drivers to ignore the real ones). Only:
//   - low_bridge: a numeric `maxheight` between 3.0 m (below that is a car-park or path barrier) and 5.0 m on a short stretch of public road (or a node on it, or a height
//     restrictor barrier). Not "default", not car-park entrances, not gates, nothing private or closed to lorries.
//   - weight_limit: a numeric `maxweight` of 40 t or less on a bridge (a structural limit), short stretch only (250 m). Residential
//     weight limits are not taken: those are access rules the router already applies.
// Imperial values (10'6") are converted. Two of the same kind within 30 m (the two sides of a dual carriageway) become one, the
// lowest limit. Nothing outside Great Britain.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = fileURLToPath(new URL('../migrations/0072_seed_osm_hazards.sql', import.meta.url));
const REVIEW = fileURLToPath(new URL('./.osm-hazards-review.json', import.meta.url));
const CACHE = fileURLToPath(new URL('./.osm-hazards-cache/', import.meta.url));
// Only this server accepts the `out center bb tags` form; it is tried first and the others as a fallback.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AGENT = 'WagonWise-one-off-hazard-import/1.0 (https://wagon-wise.co.uk)';

// The one reporter every imported hazard belongs to (it is not a driver account; see migration 0071).
export const OSM_REPORTER_ID = '00000000-0000-4000-8000-0000000005a1';

const MIN_HEIGHT_M = 3.0; // lower is a car-park or path barrier, not a road a lorry could be on
const MAX_HEIGHT_M = 5.0;
const MIN_WEIGHT_T = 3;
const MAX_WEIGHT_T = 40;
const MAX_STRETCH_M = 250;
const MERGE_M = 30;

const ROADS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function query(bbox) {
  const b = bbox.join(',');
  return `[out:json][timeout:90];
(
  node["maxheight"~"^[0-9]"](${b});
  way["highway"]["maxheight"~"^[0-9]"](${b});
  node["maxweight"~"^[0-9]"](${b});
  way["highway"]["maxweight"~"^[0-9]"]["bridge"](${b});
);
out center bb tags;`;
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
          '120',
          '-A',
          AGENT,
          '--data-urlencode',
          `data=${query(bbox)}`,
          ENDPOINTS[(attempt - 1) % ENDPOINTS.length],
        ],
        { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 },
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

function inGreatBritain(lat, lon) {
  if (lon > 1.55 && lat < 51.1) return false; // France
  if (lat > 51.3 && lat < 55.25 && lon < -5.35) return false; // Ireland and Northern Ireland
  if (lat > 54 && lat < 54.45 && lon > -4.9 && lon < -4.3) return false; // Isle of Man
  return true;
}

/** A plain number of metres or tonnes, or feet and inches for a height. Anything else ("default", "none", a list) is undefined. */
export function parseMetres(raw) {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().toLowerCase();
  const metric = text.match(/^(\d+(?:\.\d+)?)\s*(m)?$/);
  if (metric) return Number(metric[1]);
  const imperial = text.match(
    /^(\d+)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|”|in|inches)?)?$/,
  );
  if (imperial)
    return Math.round((Number(imperial[1]) * 12 + Number(imperial[2] ?? 0)) * 0.0254 * 100) / 100;
  return undefined;
}

export function parseTonnes(raw) {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().toLowerCase();
  const m = text.match(/^(\d+(?:\.\d+)?)\s*(t|tonnes?)?$/);
  return m ? Number(m[1]) : undefined;
}

function stretchMetres(element) {
  const bb = element.bounds;
  if (!bb) return 0;
  const dLat = (bb.maxlat - bb.minlat) * 111_320;
  const dLon = (bb.maxlon - bb.minlon) * 111_320 * Math.cos((bb.minlat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

const closed = (tags) =>
  ['private', 'no', 'customers', 'permit', 'delivery'].includes(tags.access) ||
  tags.hgv === 'no' ||
  tags.motor_vehicle === 'no' ||
  tags.vehicle === 'no';

function toHazard(element) {
  const tags = element.tags ?? {};
  // `out center bb` gives a way its bounds; the middle of them is where it sits.
  const lat =
    element.lat ??
    element.center?.lat ??
    (element.bounds ? (element.bounds.minlat + element.bounds.maxlat) / 2 : undefined);
  const lon =
    element.lon ??
    element.center?.lon ??
    (element.bounds ? (element.bounds.minlon + element.bounds.maxlon) / 2 : undefined);
  if (lat === undefined || lon === undefined || !inGreatBritain(lat, lon)) return undefined;
  if (closed(tags)) return undefined;
  if (
    tags.amenity?.startsWith('parking') ||
    tags.barrier === 'gate' ||
    tags.barrier === 'lift_gate'
  )
    return undefined;
  if (tags['maxheight:conditional'] || tags['maxweight:conditional']) return undefined;
  if (element.type === 'way') {
    if (!ROADS.has(tags.highway)) return undefined;
    if (tags.covered === 'yes' && tags.bridge === undefined && tags.tunnel === undefined)
      return undefined; // car-park style covers
    if (stretchMetres(element) > MAX_STRETCH_M) return undefined;
  } else if (tags.amenity !== undefined && tags.amenity !== 'parking_entrance') {
    return undefined;
  }

  const name = (tags.name ?? tags.ref ?? '').trim().slice(0, 60);
  const osmId = `${element.type}/${element.id}`;

  const height = parseMetres(tags.maxheight);
  if (height !== undefined && height >= MIN_HEIGHT_M && height <= MAX_HEIGHT_M) {
    return { osmId, type: 'low_bridge', lat, lon, kind: 'height', value: height, unit: 'm', name };
  }
  const weight = parseTonnes(tags.maxweight);
  const isBridge =
    element.type === 'way'
      ? tags.bridge !== undefined && tags.bridge !== 'no'
      : tags.bridge === 'yes';
  if (
    weight !== undefined &&
    weight >= MIN_WEIGHT_T &&
    weight <= MAX_WEIGHT_T &&
    isBridge &&
    tags.highway !== 'residential'
  ) {
    return {
      osmId,
      type: 'weight_limit',
      lat,
      lon,
      kind: 'weight',
      value: weight,
      unit: 't',
      name,
    };
  }
  return undefined;
}

function metresBetween(a, b) {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Two of the same kind within MERGE_M are one: the lowest limit stays. */
function mergeNeighbours(hazards) {
  const kept = [];
  const sorted = [...hazards].sort((a, b) => a.value - b.value || a.osmId.localeCompare(b.osmId));
  for (const hazard of sorted) {
    if (!kept.some((k) => k.type === hazard.type && metresBetween(k, hazard) <= MERGE_M))
      kept.push(hazard);
  }
  return kept.sort((a, b) => a.osmId.localeCompare(b.osmId));
}

const sqlText = (v) => `'${String(v).replaceAll("'", "''")}'`;

function noteFor(h) {
  const limit = h.type === 'low_bridge' ? `Height limit ${h.value} m` : `Weight limit ${h.value} t`;
  return h.name === '' ? limit : `${limit} (${h.name})`;
}

// Only the 1 degree tiles that touch land in Great Britain (see fetch-osm-parking.mjs): for each southern edge, the first and
// last western edge to fetch.
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
  const found = new Map();
  const failed = [];
  let tiles = 0;
  for (let south = 49; south < 61; south += 1) {
    const [firstWest, lastWest] = LAND[south] ?? [-9, 1];
    for (let west = firstWest; west <= lastWest; west += 1) {
      const bbox = [south, west, south + 1, west + 1];
      const elements = fetchTile(bbox);
      if (elements === undefined) {
        failed.push(bbox);
        continue;
      }
      for (const element of elements) {
        const hazard = toHazard(element);
        if (hazard !== undefined) found.set(hazard.osmId, hazard);
      }
      tiles += 1;
      process.stderr.write(`\r${tiles} tiles, ${found.size} candidates`);
      await sleep(DRY_RUN ? 0 : 1500);
    }
  }
  process.stderr.write('\n');
  if (failed.length > 0) {
    console.error(
      `FAILED tiles (run again to fetch only these): ${failed.map((b) => b.join(',')).join(' | ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const hazards = mergeNeighbours([...found.values()]);
  const count = (type) => hazards.filter((h) => h.type === type).length;
  console.error(
    `${hazards.length} hazards: ${count('low_bridge')} low bridges, ${count('weight_limit')} weight limits`,
  );
  writeFileSync(REVIEW, JSON.stringify(hazards, null, 1));
  if (DRY_RUN) return;

  const rows = hazards.map(
    (h) =>
      `(gen_random_uuid(), '${OSM_REPORTER_ID}', '${h.type}', ST_SetSRID(ST_MakePoint(${h.lon}, ${h.lat}), 4326)::geography, ` +
      `${sqlText(noteFor(h))}, '${h.kind}', ${h.value}, '${h.unit}', 'osm', ${sqlText(h.osmId)}, 0, 0, 'active', null, now())`,
  );
  const header = `-- Starting set of hazards from OpenStreetMap (© OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright):
-- ${count('low_bridge')} low bridges (a numeric height limit of ${MIN_HEIGHT_M} to ${MAX_HEIGHT_M} m on a short stretch of public road) and
-- ${count('weight_limit')} weight-limited bridges (${MAX_WEIGHT_T} t or less) in Great Britain. Generated once by
-- apps/core/scripts/fetch-osm-hazards.mjs; not refreshed. They belong to one reporter that is not a driver
-- (${OSM_REPORTER_ID}), have source = 'osm', keep their OpenStreetMap id so none is inserted twice, and never expire.
-- Drivers can confirm or dismiss them like any hazard; staff can edit or delete them in the portal.

`;
  writeFileSync(
    OUT,
    `${header}insert into hazards.reports
  (id, reporter_id, type, location, note, measurement_kind, measurement_value, measurement_unit, source, osm_id,
   confirmations, dismissals, status, expires_at, created_at)
values
${rows.join(',\n')}
on conflict (osm_id) where osm_id is not null do nothing;
`,
  );
  console.error(`wrote ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
