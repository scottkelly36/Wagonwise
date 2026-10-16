// Metres per degree of latitude is near-constant; longitude shrinks with cos(latitude). Accurate enough for the size of a
// screen. (Not shared with `geo-distance.ts`, which takes its point type from the map component this file serves.)
const METRES_PER_DEGREE_LAT = 111_320;

interface Point {
  readonly lat: number;
  readonly lon: number;
}

function distanceMetres(a: Point, b: Point): number {
  const dx = (b.lon - a.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** What part of the map the driver is looking at, in terms the nearby queries understand. */
export interface MapView {
  readonly centre: { readonly lat: number; readonly lon: number };
  /** Far enough to reach every corner of the screen from the centre, capped at what the server accepts. */
  readonly radiusM: number;
  /** How wide the screen is on the ground, in kilometres. */
  readonly widthKm: number;
  /** Too wide to draw every marker without a mess (and a heavy query): the map asks the driver to zoom in instead. */
  readonly tooWide: boolean;
}

/** The server takes at most this radius for a nearby search. */
export const MAX_QUERY_RADIUS_M = 50_000;
/** Wider than this and markers are not loaded: zoom in to see them. */
export const MAX_VIEW_WIDTH_KM = 60;

/** `bounds` is [west, south, east, north], as the map reports it. */
export function viewFromBounds(bounds: readonly [number, number, number, number]): MapView {
  const [west, south, east, north] = bounds;
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  const widthKm = distanceMetres({ lat, lon: west }, { lat, lon: east }) / 1000;
  const diagonalM = distanceMetres({ lat: south, lon: west }, { lat: north, lon: east });
  return {
    centre: { lat, lon },
    radiusM: Math.min(MAX_QUERY_RADIUS_M, Math.max(500, Math.round(diagonalM / 2))),
    widthKm,
    tooWide: widthKm > MAX_VIEW_WIDTH_KM,
  };
}
