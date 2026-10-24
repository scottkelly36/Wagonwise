import { ON_ROUTE_M, placeOnRoute, stillAhead } from './on-route';

// A route running due east along the equator: 0.01 degrees is about 1,113 m, so the vertices are 0, 1.1, 2.2 and 3.3 km along.
const route: [number, number][] = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
  [0.03, 0],
];

// About 11 m of latitude per 0.0001 degrees.
const at = (id: string, lon: number, lat = 0) => ({ id, location: { lat, lon } });

describe('placeOnRoute', () => {
  it('keeps what is on the route, with how far along it is, and drops what is on the next street over', () => {
    const placed = placeOnRoute(route, [
      at('on', 0.005),
      at('near', 0.015, 0.0002), // about 22 m off: the width of the road
      at('beside', 0.012, 0.0008), // about 90 m off: another street
      at('far', 0.02, 0.006), // about 670 m off, inside the old 750 m corridor
    ]);
    expect(placed.map((p) => p.item.id)).toEqual(['on', 'near']);
    expect(placed[0]!.offsetM).toBeCloseTo(556, -1);
    expect(placed[1]!.offsetM).toBeCloseTo(1670, -1);
  });

  it('drops a low bridge where the route runs over a bridge, but not one it goes under', () => {
    const bridge = { from: { lat: 0, lon: 0.012 }, to: { lat: 0, lon: 0.014 } };
    const lowBridge = (id: string, lon: number) => ({ ...at(id, lon), type: 'low_bridge' });
    const placed = placeOnRoute(
      route,
      [
        lowBridge('over', 0.013),
        lowBridge('under', 0.02),
        { ...at('pothole', 0.013), type: 'pothole' },
      ],
      [bridge],
    );
    expect(placed.map((p) => p.item.id)).toEqual(['under', 'pothole']);
  });

  it('uses a lateral limit of the width of a road', () => {
    expect(ON_ROUTE_M).toBe(30);
  });

  it('is empty for no items', () => {
    expect(placeOnRoute(route, [])).toEqual([]);
  });
});

describe('stillAhead', () => {
  const placed = placeOnRoute(route, [at('a', 0.005), at('b', 0.015), at('c', 0.025)]);

  it('keeps what is ahead and drops what is behind', () => {
    expect(stillAhead(placed, 1_000).map((i) => i.id)).toEqual(['b', 'c']);
    expect(stillAhead(placed, 0).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(stillAhead(placed, 3_000).map((i) => i.id)).toEqual([]);
  });

  it('still counts something the driver is only just passing', () => {
    // The first is 556 m along; a driver at 570 m is 14 m past it.
    expect(stillAhead(placed, 570).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(stillAhead(placed, 620).map((i) => i.id)).toEqual(['b', 'c']);
  });
});
