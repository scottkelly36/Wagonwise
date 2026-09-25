import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { AVOID_ZONE_HALF_WIDTH_M } from './geo.js';
import {
  describeAvoidedOverride,
  toReportedObstruction,
  type RestrictionOverride,
} from './restriction-override.js';

function override(overrides: Partial<RestrictionOverride> = {}): RestrictionOverride {
  return {
    id: makeId<'RestrictionOverrideId'>('11111111-1111-4111-8111-111111111111'),
    kind: 'height',
    limit: 3.8,
    location: { lat: 54.9698, lon: -2.1013 },
    note: 'Styford Bridge',
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('toReportedObstruction', () => {
  it('buffers the point into a zone the same width as a hazard’s own avoid area', () => {
    const obstruction = toReportedObstruction(override());
    expect(obstruction.id).toBe(override().id);
    expect(obstruction.kind).toBe('height');
    expect(obstruction.limit).toBe(3.8);
    expect(obstruction.zone.points).toHaveLength(4);

    const lats = obstruction.zone.points.map((p) => p.lat);
    const spreadM = (Math.max(...lats) - Math.min(...lats)) * 111_320;
    expect(spreadM).toBeCloseTo(AVOID_ZONE_HALF_WIDTH_M * 2, 0);
  });

  it('omits limit on the obstruction when the override has none', () => {
    const obstruction = toReportedObstruction(override({ limit: undefined }));
    expect(obstruction.limit).toBeUndefined();
  });
});

describe('describeAvoidedOverride', () => {
  it('uses the note and limit when both are present', () => {
    expect(describeAvoidedOverride(override())).toEqual({
      description: 'Avoided Styford Bridge — 3.8m limit',
    });
  });

  it('uses tonnes for a weight override', () => {
    expect(describeAvoidedOverride(override({ kind: 'weight', limit: 32 }))).toEqual({
      description: 'Avoided Styford Bridge — 32t limit',
    });
  });

  it('omits the limit clause when there is none', () => {
    expect(describeAvoidedOverride(override({ limit: undefined }))).toEqual({
      description: 'Avoided Styford Bridge',
    });
  });

  it('falls back to a generic label per kind when there’s no note', () => {
    expect(describeAvoidedOverride(override({ note: undefined }))).toEqual({
      description: 'Avoided a low bridge — 3.8m limit',
    });
    expect(
      describeAvoidedOverride(override({ kind: 'prohibition', limit: undefined, note: undefined })),
    ).toEqual({ description: 'Avoided a road closed to HGVs' });
  });
});
