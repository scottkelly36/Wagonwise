// One-off: fetch speed and red-light camera positions in Great Britain from OpenStreetMap (via the public Overpass API) and write
// them as a seed migration, so the trip screen can warn a driver of a camera ahead. Run by hand:
//
//   node apps/core/scripts/fetch-osm-cameras.mjs            writes the migration and a review file
//   node apps/core/scripts/fetch-osm-cameras.mjs --dry-run  only prints counts and samples
//
// Not run by the app or on a schedule. The data is © OpenStreetMap contributors, under the ODbL licence
// (https://www.openstreetmap.org/copyright): the app credits it, and each row keeps its OpenStreetMap id (`osm_id`).
//
// Precision over quantity (a false warning teaches drivers to ignore the real ones). Only fixed camera points:
//   - `highway=speed_camera`, or `enforcement=maxspeed | average_speed | maxspeed_average | traffic_signals` on a node.
//   - kind: 'red_light' for traffic_signals enforcement, 'average' for the average-speed kinds, otherwise 'fixed'.
//   - Not `disused:` or `abandoned:` ones (those tags are different keys, so they are never matched), not `access=no`-style.
// Two of the same kind within 8 m are one. Nothing outside Great Britain. Mobile cameras are not in the map data.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = fileURLToPath(
  new URL('../migrations/0075_seed_osm_speed_cameras.sql', import.meta.url),
);
const REVIEW = fileURLToPath(new URL('./.osm-cameras-review.json', import.meta.url));
const CACHE = fileURLToPath(new URL('./.osm-cameras-cache/', import.meta.url));
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AGENT = 'WagonWise-one-off-camera-import/1.0 (https://wagon-wise.co.uk)';
const MERGE_M = 8;

// One query for the whole country: the camera tags are indexed, so this is far cheaper than the height and weight searches
// that need tiling. England, Scotland and Wales only (not Northern Ireland, the Isle of Man or the Channel Islands).
const QUERY = `[out:json][timeout:180];
(area["ISO3166-2"="GB-ENG"];area["ISO3166-2"="GB-SCT"];area["ISO3166-2"="GB-WLS"];)->.gb;
(
  node["highway"="speed_camera"](area.gb);
  node["enforcement"~"^(maxspeed|average_speed|maxspeed_average|traffic_signals)$"](area.gb);
);
out body;`;

function fetchAll() {
  const file = `${CACHE}gb.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const body = execFileSync(
        'curl',
        [
          '-sS',
          '--fail',
          '-m',
          '240',
          '-A',
          AGENT,
          '--data-urlencode',
          `data=${QUERY}`,
          ENDPOINTS[(attempt - 1) % ENDPOINTS.length],
        ],
        { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 },
      );
      const json = JSON.parse(body);
      if (json.remark && /timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(file, JSON.stringify(json.elements ?? []));
      return json.elements ?? [];
    } catch (error) {
      console.error(`attempt ${attempt}: ${String(error.message).split(/\r?\n/)[0].slice(0, 120)}`);
      execFileSync('sleep', [String(Math.min(attempt * 10, 60))]);
    }
  }
  return undefined;
}

function inGreatBritain(lat, lon) {
  if (lon > 1.55 && lat < 51.1) return false; // France
  if (lat > 51.3 && lat < 55.25 && lon < -5.35) return false; // Ireland and Northern Ireland
  if (lat > 54 && lat < 54.45 && lon > -4.9 && lon < -4.3) return false; // Isle of Man
  return true;
}

/** `30 mph` -> 30. Only a value that says mph is taken: a bare number in the map would be km/h. */
export function parseMph(raw) {
  if (typeof raw !== 'string') return undefined;
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{2})\s*mph$/);
  if (!m) return undefined;
  const mph = Number(m[1]);
  return mph >= 20 && mph <= 70 && mph % 5 === 0 ? mph : undefined;
}

export function kindOf(tags) {
  if (tags.enforcement === 'traffic_signals') return 'red_light';
  if (tags.enforcement === 'average_speed' || tags.enforcement === 'maxspeed_average')
    return 'average';
  return 'fixed';
}

export function toCamera(element) {
  if (element.type !== 'node' || element.lat === undefined || element.lon === undefined)
    return undefined;
  if (!inGreatBritain(element.lat, element.lon)) return undefined;
  const tags = element.tags ?? {};
  const isCamera =
    tags.highway === 'speed_camera' ||
    ['maxspeed', 'average_speed', 'maxspeed_average', 'traffic_signals'].includes(tags.enforcement);
  if (!isCamera) return undefined;
  return {
    osmId: `node/${element.id}`,
    lat: element.lat,
    lon: element.lon,
    kind: kindOf(tags),
    maxspeedMph: parseMph(tags.maxspeed),
  };
}

function metresBetween(a, b) {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Two of the same kind within MERGE_M are one. */
export function mergeNeighbours(cameras) {
  const kept = [];
  for (const camera of [...cameras].sort((a, b) => a.osmId.localeCompare(b.osmId))) {
    if (!kept.some((k) => k.kind === camera.kind && metresBetween(k, camera) <= MERGE_M))
      kept.push(camera);
  }
  return kept;
}

async function main() {
  const elements = fetchAll();
  if (elements === undefined) {
    console.error('Could not fetch the cameras; run again.');
    process.exitCode = 1;
    return;
  }
  const found = new Map();
  for (const element of elements) {
    const camera = toCamera(element);
    if (camera !== undefined) found.set(camera.osmId, camera);
  }

  const cameras = mergeNeighbours([...found.values()]).sort((a, b) =>
    a.osmId.localeCompare(b.osmId),
  );
  const count = (kind) => cameras.filter((c) => c.kind === kind).length;
  console.error(
    `${cameras.length} cameras: ${count('fixed')} fixed, ${count('average')} average speed, ${count('red_light')} red light`,
  );
  writeFileSync(REVIEW, JSON.stringify(cameras, null, 1));
  if (DRY_RUN) return;

  const rows = cameras.map(
    (c) =>
      `(gen_random_uuid(), 'node/${c.osmId.split('/')[1]}', ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)::geography, '${c.kind}', ${c.maxspeedMph ?? 'null'})`,
  );
  const header = `-- Starting set of camera positions from OpenStreetMap (© OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright):
-- ${count('fixed')} fixed speed cameras, ${count('average')} average-speed cameras and ${count('red_light')} red-light cameras in Great
-- Britain. Generated once by apps/core/scripts/fetch-osm-cameras.mjs; not refreshed. Each keeps its OpenStreetMap id so none is
-- inserted twice. Mobile cameras are not in the map data, and the map is not complete: the app says so.

`;
  writeFileSync(
    OUT,
    `${header}insert into cameras.speed_cameras (id, osm_id, location, kind, maxspeed_mph)
values
${rows.join(',\n')}
on conflict (osm_id) do nothing;
`,
  );
  console.error(`wrote ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
