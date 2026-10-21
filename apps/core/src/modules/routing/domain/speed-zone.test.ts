import { describe, expect, it } from 'vitest';
import { joinZones, postedLimit, zonesFromEdges, type RoadEdge } from './speed-zone.js';

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
