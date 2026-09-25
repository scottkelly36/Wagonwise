import { routeProgress } from './route-progress';

// A straight two-segment route along the equator (lat 0), so metres-per-degree-longitude
// equals metres-per-degree-latitude exactly (cos(0) = 1) — makes the expected distances easy
// to reason about: each degree of longitude is 111,320 m, so the whole route is 222,640 m.
const ROUTE: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
];
const TOTAL_METRES = 222_640;

describe('routeProgress', () => {
  it('is 100% remaining at the origin', () => {
    const progress = routeProgress(ROUTE, { lat: 0, lon: 0 });
    expect(progress.traveledMetres).toBeCloseTo(0);
    expect(progress.remainingFraction).toBeCloseTo(1);
  });

  it('is 0% remaining at the destination', () => {
    const progress = routeProgress(ROUTE, { lat: 0, lon: 2 });
    expect(progress.remainingMetres).toBeCloseTo(0);
    expect(progress.remainingFraction).toBeCloseTo(0);
  });

  it('is 75% remaining halfway along the first segment', () => {
    const progress = routeProgress(ROUTE, { lat: 0, lon: 0.5 });
    expect(progress.traveledMetres).toBeCloseTo(TOTAL_METRES * 0.25, 5);
    expect(progress.remainingFraction).toBeCloseTo(0.75, 2);
  });

  it('is 25% remaining halfway along the second segment', () => {
    const progress = routeProgress(ROUTE, { lat: 0, lon: 1.5 });
    expect(progress.remainingFraction).toBeCloseTo(0.25, 2);
  });

  it('snaps a laterally-offset position onto the route rather than jumping to a vertex', () => {
    // Just off to the side of the midpoint, not on the line itself — a live GPS fix never
    // lands exactly on the route.
    const onLine = routeProgress(ROUTE, { lat: 0, lon: 0.5 });
    const offLine = routeProgress(ROUTE, { lat: 0.0005, lon: 0.5 });
    expect(offLine.remainingFraction).toBeCloseTo(onLine.remainingFraction, 2);
  });

  it('never reports more than the total distance travelled, even past the destination', () => {
    const progress = routeProgress(ROUTE, { lat: 0, lon: 5 });
    expect(progress.remainingMetres).toBe(0);
    expect(progress.remainingFraction).toBe(0);
  });

  it('returns zeros for a degenerate route rather than throwing', () => {
    expect(routeProgress([], { lat: 0, lon: 0 })).toEqual({
      traveledMetres: 0,
      remainingMetres: 0,
      totalMetres: 0,
      remainingFraction: 0,
    });
    expect(routeProgress([[0, 0]], { lat: 0, lon: 0 })).toEqual({
      traveledMetres: 0,
      remainingMetres: 0,
      totalMetres: 0,
      remainingFraction: 0,
    });
  });
});
