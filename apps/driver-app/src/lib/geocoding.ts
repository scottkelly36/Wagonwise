import type { MapPoint } from '../components/route-map';

export interface GeocodingResult {
  readonly placeName: string;
  readonly point: MapPoint;
}

interface MaptilerFeature {
  readonly place_name?: unknown;
  readonly center?: unknown;
}

interface MaptilerGeocodingResponse {
  readonly features?: readonly MaptilerFeature[];
}

/** Pure mapping from MapTiler's own response shape to this app's `GeocodingResult` — separated
 *  from the `fetch` call below so it's directly testable with a plain object, the same "pure
 *  logic, effects injected/isolated at the edge" split every other I/O-adjacent piece of this app
 *  uses. Drops any feature missing a name or a well-formed `[lon, lat]` centre rather than
 *  throwing — one malformed result from a third-party API shouldn't sink the whole search. */
export function parseGeocodingResponse(body: unknown): GeocodingResult[] {
  const response = body as MaptilerGeocodingResponse | null;
  if (response === null || !Array.isArray(response.features)) return [];

  const results: GeocodingResult[] = [];
  for (const feature of response.features) {
    const placeName = feature.place_name;
    const center = feature.center;
    if (
      typeof placeName !== 'string' ||
      !Array.isArray(center) ||
      center.length !== 2 ||
      typeof center[0] !== 'number' ||
      typeof center[1] !== 'number'
    ) {
      continue;
    }
    results.push({ placeName, point: { lon: center[0], lat: center[1] } });
  }
  return results;
}

/**
 * Address search (design decision, 2026-09-24: "drivers more than likely will have an address to
 * go to", not just a point they'd tap on a map) — MapTiler's own Geocoding API, called directly
 * from the client the same way the map style itself already is (`lib/map-style.ts`), since this
 * is read-only, keyless-of-anything-sensitive, and adding a BFF/core round trip for it would only
 * add latency to something that's meant to feel instant as a driver types. Biased towards Great
 * Britain and (loosely) towards the driver's current position — this app has no testers outside
 * the UK, and a nearer match is almost always the one a driver means.
 */
export async function searchAddress(
  query: string,
  apiKey: string,
  near: MapPoint | undefined,
): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({ key: apiKey, country: 'gb', limit: '5' });
  if (near !== undefined) {
    params.set('proximity', `${near.lon},${near.lat}`);
  }
  const response = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`MapTiler geocoding returned ${response.status}`);
  }
  const body: unknown = await response.json();
  return parseGeocodingResponse(body);
}
