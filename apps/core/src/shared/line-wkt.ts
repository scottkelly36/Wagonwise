/**
 * A line through `points` as one text value Postgres reads with `ST_GeogFromText`, instead of a
 * `ST_MakePoint(...)` call (two bound values each) per point.
 *
 * Postgres allows 65,535 bound values in one query, so building the line from separate points broke
 * at about 32,000 points. A route across Britain has far more than that (the engine returns one
 * every few metres), so planning a long journey failed outright. One text value has no such limit.
 *
 * The numbers are written out by this function, never taken as text, so there is nothing to inject.
 */
export function lineWkt(points: readonly { readonly lat: number; readonly lon: number }[]): string {
  const coordinates = points.map((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      throw new Error('lineWkt: a point has a non-finite coordinate');
    }
    return `${p.lon} ${p.lat}`;
  });
  return `SRID=4326;LINESTRING(${coordinates.join(',')})`;
}
