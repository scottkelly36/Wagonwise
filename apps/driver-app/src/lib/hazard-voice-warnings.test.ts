import { hazardsAheadWithinRange } from './hazard-voice-warnings';

// A straight route along one latitude — routeProgress's own snap-to-line handles the geometry,
// so this only needs to vary longitude to move "along" the route.
const ROUTE_LINE: [number, number][] = [
  [0, 51],
  [0.02, 51],
];
const POSITION = { lat: 51, lon: 0.01 }; // roughly the midpoint

describe('hazardsAheadWithinRange', () => {
  it('includes a hazard ahead and within range', () => {
    const result = hazardsAheadWithinRange(
      ROUTE_LINE,
      POSITION,
      [{ id: 'close-ahead', location: { lat: 51, lon: 0.015 } }],
      500,
    );

    expect(result).toEqual(['close-ahead']);
  });

  it('excludes a hazard ahead but beyond range', () => {
    const result = hazardsAheadWithinRange(
      ROUTE_LINE,
      POSITION,
      [{ id: 'far-ahead', location: { lat: 51, lon: 0.02 } }],
      500,
    );

    expect(result).toEqual([]);
  });

  it('excludes a hazard already behind, even though it sits within range as a straight line', () => {
    const result = hazardsAheadWithinRange(
      ROUTE_LINE,
      POSITION,
      [{ id: 'behind', location: { lat: 51, lon: 0.005 } }],
      500,
    );

    expect(result).toEqual([]);
  });

  it('includes a hazard right at the driver’s own position', () => {
    const result = hazardsAheadWithinRange(
      ROUTE_LINE,
      POSITION,
      [{ id: 'here', location: POSITION }],
      500,
    );

    expect(result).toEqual(['here']);
  });

  it('filters a mix down to only the ones ahead and in range', () => {
    const result = hazardsAheadWithinRange(
      ROUTE_LINE,
      POSITION,
      [
        { id: 'close-ahead', location: { lat: 51, lon: 0.015 } },
        { id: 'far-ahead', location: { lat: 51, lon: 0.02 } },
        { id: 'behind', location: { lat: 51, lon: 0.005 } },
      ],
      500,
    );

    expect(result).toEqual(['close-ahead']);
  });

  it('returns an empty list for an empty hazard list', () => {
    expect(hazardsAheadWithinRange(ROUTE_LINE, POSITION, [], 500)).toEqual([]);
  });
});
