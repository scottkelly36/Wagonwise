export type WarningLevel = 'yellow' | 'amber' | 'red';
export type WarningKind =
  'wind' | 'rain' | 'snow' | 'ice' | 'fog' | 'thunderstorm' | 'heat' | 'other';

/** GeoJSON MultiPolygon coordinates: polygons → rings → [lon, lat]. */
export type MultiPolygon = readonly (readonly (readonly (readonly [number, number])[])[])[];

export interface WeatherWarning {
  readonly id: string;
  readonly level: WarningLevel;
  readonly kinds: readonly WarningKind[];
  readonly headline: string;
  readonly details: string | undefined;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly areas: readonly string[];
  readonly area: MultiPolygon;
}

/** How far ahead a warning is shown before it starts. */
export const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a warning is in force at `now` or starts within the next 24 hours. */
export function isCurrentOrUpcoming(warning: WeatherWarning, now: Date): boolean {
  return (
    warning.validTo.getTime() > now.getTime() &&
    warning.validFrom.getTime() <= now.getTime() + UPCOMING_WINDOW_MS
  );
}

function inRing(ring: readonly (readonly [number, number])[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as readonly [number, number];
    const [xj, yj] = ring[j] as readonly [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether a point lies inside an area: inside a polygon's outline and outside its holes. */
export function areaContains(area: MultiPolygon, point: { lat: number; lon: number }): boolean {
  return area.some((polygon) => {
    const [outline, ...holes] = polygon;
    if (outline === undefined || !inRing(outline, point.lon, point.lat)) return false;
    return !holes.some((hole) => inRing(hole, point.lon, point.lat));
  });
}

const LEVEL_ORDER: Record<WarningLevel, number> = { yellow: 0, amber: 1, red: 2 };

/** Most severe first, then soonest to start. */
export function bySeverity(a: WeatherWarning, b: WeatherWarning): number {
  return (
    LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || a.validFrom.getTime() - b.validFrom.getTime()
  );
}
