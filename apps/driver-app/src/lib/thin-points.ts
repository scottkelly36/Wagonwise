/**
 * At most `max` points from `points`, evenly spaced and always keeping the first and last. The
 * nearby-parking request takes a corridor of up to 2000 points, and a long route has more than that.
 * Dropping points widens the gaps a little, which a search radius of a kilometre easily covers.
 */
export function thinPoints<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  if (max < 2) return points.length > 0 ? [points[0] as T] : [];
  const result: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) result.push(points[Math.round(i * step)] as T);
  return result;
}
