import { describe, expect, it } from 'vitest';
import {
  bridgesFromShape,
  joinBridges,
  irishLimitKph,
  joinWayIds,
  joinZones,
  postedLimit,
  zonesFromEdges,
  wayIdsFromEdges,
  type RoadEdge,
} from './speed-zone.js';

const edge = (kph: number | string | undefined, extra: Partial<RoadEdge> = {}): RoadEdge => ({
  length: 1,
  speedLimitKph: kph,
  roadClass: 'primary',
  use: 'road',
  ...extra,
});

describe('postedLimit', () => {
  it('turns the map limit back into the mph on the sign', () => {
    expect(postedLimit(edge(32))).toBe(20);
    expect(postedLimit(edge(48))).toBe(30);
    expect(postedLimit(edge(64))).toBe(40);
    expect(postedLimit(edge(80))).toBe(50);
  });

  it('shows 60 and 70 as the national speed limit, not as a number a lorry may not do', () => {
    expect(postedLimit(edge(96))).toBe('national');
    expect(postedLimit(edge(112))).toBe('national');
  });

  it('is the national speed limit on a motorway with no limit held, and nothing elsewhere', () => {
    expect(postedLimit(edge(undefined, { roadClass: 'motorway' }))).toBe('national');
    expect(postedLimit(edge('unlimited', { roadClass: 'motorway' }))).toBe('national');
    expect(postedLimit(edge(undefined, { roadClass: 'trunk' }))).toBeUndefined();
    expect(postedLimit(edge(0, { roadClass: 'primary' }))).toBeUndefined();
  });

  it('shows nothing on a slip road with no limit held', () => {
    expect(postedLimit(edge(undefined, { roadClass: 'motorway', use: 'ramp' }))).toBeUndefined();
  });

  it('still shows a limit that is held on a slip road or at roadworks', () => {
    expect(postedLimit(edge(80, { roadClass: 'motorway' }))).toBe(50);
  });

  it('shows nothing for an absurd limit', () => {
    expect(postedLimit(edge(3))).toBeUndefined();
  });
});

describe('zonesFromEdges', () => {
  it('places zones as fractions of the span, joins neighbours that match and leaves gaps where nothing is known', () => {
    const zones = zonesFromEdges([
      edge(48),
      edge(48),
      edge(undefined),
      edge(112, { roadClass: 'motorway' }),
    ]);
    expect(zones).toEqual([
      { from: 0, to: 0.5, limitMph: 30 },
      { from: 0.75, to: 1 },
    ]);
  });

  it('weights sections by the length used', () => {
    expect(zonesFromEdges([edge(48, { length: 3 }), edge(80, { length: 1 })])).toEqual([
      { from: 0, to: 0.75, limitMph: 30 },
      { from: 0.75, to: 1, limitMph: 50 },
    ]);
  });

  it('fits a piece of a longer route into its own span', () => {
    expect(zonesFromEdges([edge(48), edge(80)], 0.5, 1)).toEqual([
      { from: 0.5, to: 0.75, limitMph: 30 },
      { from: 0.75, to: 1, limitMph: 50 },
    ]);
  });

  it('gives nothing for no sections', () => {
    expect(zonesFromEdges([])).toEqual([]);
    expect(zonesFromEdges([edge(48, { length: 0 })])).toEqual([]);
  });
});

describe('joinZones', () => {
  it('joins zones that meet and match, and keeps others apart', () => {
    expect(
      joinZones([
        { from: 0, to: 0.5, limitMph: 30 },
        { from: 0.5, to: 0.7, limitMph: 30 },
        { from: 0.7, to: 0.9 },
        { from: 0.95, to: 1 },
      ]),
    ).toEqual([
      { from: 0, to: 0.7, limitMph: 30 },
      { from: 0.7, to: 0.9 },
      { from: 0.95, to: 1 },
    ]);
  });
});

// A route running due east along the equator, one point every 0.001 degrees.
const shape = Array.from({ length: 10 }, (_, i) => ({ lat: 0, lon: i * 0.001 }));
const bridgeEdge = (bridge: boolean, beginShapeIndex: number, endShapeIndex: number) => ({
  bridge,
  beginShapeIndex,
  endShapeIndex,
});

describe('bridgesFromShape', () => {
  it('gives the points where each bridge starts and ends, joining sections that meet', () => {
    const bridges = bridgesFromShape(
      [
        bridgeEdge(false, 0, 3),
        bridgeEdge(true, 3, 4),
        bridgeEdge(true, 4, 6),
        bridgeEdge(false, 6, 9),
      ],
      shape,
    );
    expect(bridges).toEqual([{ from: shape[3]!, to: shape[6]! }]);
  });

  it('keeps separate bridges apart', () => {
    const bridges = bridgesFromShape(
      [bridgeEdge(true, 0, 2), bridgeEdge(false, 2, 5), bridgeEdge(true, 5, 7)],
      shape,
    );
    expect(bridges).toEqual([
      { from: shape[0]!, to: shape[2]! },
      { from: shape[5]!, to: shape[7]! },
    ]);
  });

  it('gives nothing for a route with no bridge, and skips a section whose points are not known', () => {
    expect(bridgesFromShape([bridgeEdge(false, 0, 9)], shape)).toEqual([]);
    expect(bridgesFromShape([bridgeEdge(true, 0, 99)], shape)).toEqual([]);
    expect(bridgesFromShape([bridgeEdge(true, -1, -1)], shape)).toEqual([]);
    expect(bridgesFromShape([], shape)).toEqual([]);
  });
});

describe('joinBridges', () => {
  it('joins stretches that meet and keeps others apart', () => {
    expect(
      joinBridges([
        { from: shape[1]!, to: shape[2]! },
        { from: shape[2]!, to: shape[3]! },
        { from: shape[6]!, to: shape[7]! },
      ]),
    ).toEqual([
      { from: shape[1]!, to: shape[3]! },
      { from: shape[6]!, to: shape[7]! },
    ]);
  });
});

describe('wayIdsFromEdges', () => {
  it('lists each road once, in the order the route meets it, ignoring sections with no way', () => {
    expect(
      wayIdsFromEdges([
        { wayId: 30 },
        { wayId: 10 },
        { wayId: 30 },
        {},
        { wayId: 'x' },
        { wayId: 0 },
        { wayId: 20 },
      ]),
    ).toEqual([30, 10, 20]);
  });
});

describe('joinWayIds', () => {
  it('joins the roads of several pieces, a road met in two pieces only once', () => {
    expect(joinWayIds([[1, 2], [], [2, 3]])).toEqual([1, 2, 3]);
  });
});

describe('the Republic of Ireland', () => {
  const irish = (kph: number | string | undefined, extra: Partial<RoadEdge> = {}): RoadEdge =>
    edge(kph, { country: 'IE', ...extra });
  const british = (kph: number | string | undefined): RoadEdge => edge(kph, { country: 'GB' });

  it('shows a posted limit as it is in km/h, never converted to mph (80 km/h is not 50)', () => {
    expect(irishLimitKph(irish(80))).toBe(80);
    expect(irishLimitKph(irish(50))).toBe(50);
    expect(irishLimitKph(irish(100))).toBe(100);
    expect(irishLimitKph(irish(120))).toBe(120);
    expect(zonesFromEdges([irish(80)])).toEqual([{ from: 0, to: 1, limitKph: 80 }]);
  });

  it('never shows the national speed limit disc, which does not exist there, even for 100 and 120', () => {
    const zones = zonesFromEdges([irish(100), irish(120)]);
    expect(zones).toHaveLength(2);
    expect(zones.every((z) => z.limitKph !== undefined && z.limitMph === undefined)).toBe(true);
  });

  it('shows nothing for a road with no limit in the map, a motorway included', () => {
    expect(zonesFromEdges([irish(undefined, { roadClass: 'motorway' })])).toEqual([]);
    expect(zonesFromEdges([irish('unlimited', { roadClass: 'motorway' })])).toEqual([]);
    expect(zonesFromEdges([irish(0)])).toEqual([]);
  });

  it('shows nothing for a number that is not a limit Ireland posts', () => {
    expect(irishLimitKph(irish(65))).toBeUndefined();
    expect(irishLimitKph(irish(7))).toBeUndefined();
    expect(irishLimitKph(irish(200))).toBeUndefined();
  });

  it('keeps Northern Ireland and Great Britain in mph, and a section with no country as before', () => {
    // 48 km/h is the map's 30 mph and 80 km/h its 50 mph: the same numbers mean something else in the Republic.
    expect(zonesFromEdges([british(48)])).toEqual([{ from: 0, to: 1, limitMph: 30 }]);
    expect(zonesFromEdges([british(80)])).toEqual([{ from: 0, to: 1, limitMph: 50 }]);
    expect(zonesFromEdges([edge(80)])).toEqual([{ from: 0, to: 1, limitMph: 50 }]);
  });

  it('joins equal neighbours, but not a limit in km/h with the same number in mph', () => {
    const zones = zonesFromEdges([irish(80), irish(80), british(80)]);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ limitKph: 80 });
    expect(zones[1]).toMatchObject({ limitMph: 50 });
    expect(
      joinZones([
        { from: 0, to: 0.5, limitKph: 80 },
        { from: 0.5, to: 1, limitKph: 80 },
      ]),
    ).toEqual([{ from: 0, to: 1, limitKph: 80 }]);
    expect(
      joinZones([
        { from: 0, to: 0.5, limitKph: 50 },
        { from: 0.5, to: 1, limitMph: 50 },
      ]),
    ).toHaveLength(2);
  });

  it('goes from km/h to mph at the border on one route', () => {
    const zones = zonesFromEdges([irish(100), irish(80), british(97), british(48)]);
    expect(zones.map((z) => z.limitKph ?? z.limitMph ?? 'national')).toEqual([
      100,
      80,
      'national',
      30,
    ]);
    expect(zones[1]).toHaveProperty('limitKph');
    expect(zones[3]).toHaveProperty('limitMph');
  });
});
