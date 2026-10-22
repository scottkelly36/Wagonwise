export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** How fast traffic is moving on the road at a point, against how fast it moves when the road is clear. */
export interface FlowReading {
  readonly currentSpeedKph: number;
  readonly freeFlowSpeedKph: number;
  /** The road is shut. */
  readonly closed: boolean;
}

export type IncidentKind = 'accident' | 'closure' | 'roadworks' | 'jam' | 'hazard' | 'other';

export interface TrafficIncident {
  readonly id: string;
  readonly kind: IncidentKind;
  readonly location: GeoPoint;
  readonly description: string | undefined;
  /** Delay the provider puts on the incident, in seconds; undefined when it gives none. */
  readonly delaySeconds: number | undefined;
}

export interface BoundingBox {
  readonly minLat: number;
  readonly minLon: number;
  readonly maxLat: number;
  readonly maxLon: number;
}

/** Extra seconds to cover `lengthM` at the current speed instead of the free-flow speed. Never negative:
 *  traffic faster than free flow is not a saving we plan on. A closure is an incident, not a delay figure,
 *  so it adds nothing here. */
export function extraSeconds(reading: FlowReading, lengthM: number): number {
  if (reading.closed || reading.currentSpeedKph <= 0 || reading.freeFlowSpeedKph <= 0) return 0;
  const current = lengthM / (reading.currentSpeedKph / 3.6);
  const free = lengthM / (reading.freeFlowSpeedKph / 3.6);
  return Math.max(0, current - free);
}

/** How badly traffic is held up on a stretch: `slow` is a clear slowdown, `heavy` is near standstill or a closed road. */
export type CongestionLevel = 'slow' | 'heavy';

/** A stretch of a route, measured from its start, where traffic is held up. */
export interface TrafficStretch {
  readonly fromM: number;
  readonly toM: number;
  readonly level: CongestionLevel;
}

/** Below this share of the free-flow speed it is a slowdown, and below the second it is heavy. Chosen so a lorry at its own
 *  limit on a clear road (well under a car's free-flow speed) is not painted as a jam. */
const SLOW_BELOW = 0.7;
const HEAVY_BELOW = 0.4;

/** Whether a reading shows a slowdown worth showing the driver, and how bad. */
export function congestionLevel(reading: FlowReading): CongestionLevel | undefined {
  if (reading.closed) return 'heavy';
  if (reading.currentSpeedKph <= 0 || reading.freeFlowSpeedKph <= 0) return undefined;
  const share = reading.currentSpeedKph / reading.freeFlowSpeedKph;
  if (share < HEAVY_BELOW) return 'heavy';
  if (share < SLOW_BELOW) return 'slow';
  return undefined;
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface RouteSample {
  readonly point: GeoPoint;
  /** Length of the stretch this sample stands for, from it to the next sample (or the end). */
  readonly lengthM: number;
}

/** Points along a line about `spacingM` apart, always including the first. */
export function sampleAlong(line: readonly GeoPoint[], spacingM: number): RouteSample[] {
  const first = line[0];
  if (first === undefined) return [];
  const samples: { point: GeoPoint; lengthM: number }[] = [{ point: first, lengthM: 0 }];
  let sinceLast = 0;
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1] as GeoPoint;
    const cur = line[i] as GeoPoint;
    const step = distanceM(prev, cur);
    sinceLast += step;
    (samples[samples.length - 1] as { lengthM: number }).lengthM += step;
    if (sinceLast >= spacingM && i < line.length - 1) {
      samples.push({ point: cur, lengthM: 0 });
      sinceLast = 0;
    }
  }
  return samples;
}

/** Snaps a point to a grid of 0.005 degrees (about 500 m), so nearby requests share one provider call. */
export function snapToGrid(point: GeoPoint): GeoPoint {
  const snap = (v: number): number => Number((Math.round(v / 0.005) * 0.005).toFixed(3));
  return { lat: snap(point.lat), lon: snap(point.lon) };
}
