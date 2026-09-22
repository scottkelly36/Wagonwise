export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/**
 * An encoded polyline string (design doc §3: `geometry: GeoLine // encoded polyline`).
 * Specifically polyline6 (1e6 precision) — Valhalla's own default route-geometry encoding
 * (confirmed against a real response in M2.1) — so `RouteResult.geometry` from the Valhalla
 * adapter can be a direct passthrough with no decode/re-encode step.
 */
export type GeoLine = string;

/** A closed ring of points — first and last need not be repeated; adapters that need a closed
 *  ring (Valhalla's `exclude_polygons`) close it themselves. */
export interface GeoPolygon {
  readonly points: readonly GeoPoint[];
}
