import { routeVertexOffsets } from './route-progress';

type LonLat = [lon: number, lat: number];

export interface CongestionLine {
  readonly coordinates: LonLat[];
  readonly level: 'slow' | 'heavy';
}

/** The point `metres` along the route, between the vertices either side of it. */
function pointAt(
  routeLine: readonly LonLat[],
  offsets: readonly number[],
  metres: number,
  segment: number,
): LonLat {
  const a = routeLine[segment]!;
  const b = routeLine[segment + 1]!;
  const length = offsets[segment + 1]! - offsets[segment]!;
  const t = length <= 0 ? 0 : (metres - offsets[segment]!) / length;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * The part of the route between two fractions of its length (0 to 1), as a line of its own. The fractions are measured the way
 * the app measures the route, so a stretch the server placed by proportion lands on the same road here.
 */
export function sliceRoute(routeLine: readonly LonLat[], from: number, to: number): LonLat[] {
  if (routeLine.length < 2) return [];
  const offsets = routeVertexOffsets(routeLine);
  const total = offsets[offsets.length - 1]!;
  const start = Math.max(0, Math.min(1, from)) * total;
  const end = Math.max(0, Math.min(1, to)) * total;
  if (total <= 0 || end <= start) return [];

  // The segment (vertex i to i + 1) each end falls in.
  const segmentOf = (metres: number): number => {
    let i = 0;
    while (i < routeLine.length - 2 && offsets[i + 1]! < metres) i++;
    return i;
  };
  const first = segmentOf(start);
  const last = segmentOf(end);
  const out: LonLat[] = [pointAt(routeLine, offsets, start, first)];
  for (let i = first + 1; i <= last; i++) out.push(routeLine[i]!);
  out.push(pointAt(routeLine, offsets, end, last));
  return out;
}

/** The congested stretches ahead, each cut out of the route line, for drawing over it in their own colour. */
export function congestionLines(
  routeLine: readonly LonLat[] | undefined,
  stretches: readonly { from: number; to: number; level: 'slow' | 'heavy' }[],
): CongestionLine[] {
  if (routeLine === undefined) return [];
  return stretches.flatMap((s) => {
    const coordinates = sliceRoute(routeLine, s.from, s.to);
    return coordinates.length >= 2 ? [{ coordinates, level: s.level }] : [];
  });
}
