import { describe, expect, it } from 'vitest';
import type { Closure, ClosuresAlongRoute } from '../../closures/api.js';
import { encodePolyline } from '../application/testing/encode-polyline.js';
import { ClosureAvoidanceQueryAdapter } from './closure-avoidance-query.js';

const refreshedAt = new Date('2026-11-02T19:00:00.000Z');

function closure(overrides: Partial<Closure> = {}): Closure {
  return {
    id: 'c1',
    situationId: 's1',
    kind: 'full',
    status: 'planned',
    road: 'A1',
    direction: 'northBound',
    description: 'A1 northbound carriageway closure',
    locationText: 'between J1 and J2',
    cause: 'roadworks',
    startsAt: new Date('2026-11-02T20:00:00.000Z'),
    endsAt: new Date('2026-11-03T06:00:00.000Z'),
    lanesClosed: 0,
    position: { lat: 55.01, lon: -1.6 },
    lines: [
      [
        { lat: 55.01, lon: -1.6 },
        { lat: 55.02, lon: -1.6 },
      ],
    ],
    updatedAt: new Date('2026-11-02T18:00:00.000Z'),
    ...overrides,
  };
}

describe('ClosureAvoidanceQueryAdapter', () => {
  it('asks closures about the route’s own points and the look-ahead, and keeps only what routing needs', async () => {
    const asked: unknown[] = [];
    const adapter = new ClosureAvoidanceQueryAdapter({
      findAlongRoute: (input): Promise<ClosuresAlongRoute> => {
        asked.push(input);
        return Promise.resolve({ closures: [closure()], refreshedAt });
      },
    });
    const route = [
      { lat: 55.0, lon: -1.6 },
      { lat: 55.03, lon: -1.6 },
    ];

    const found = await adapter.alongRoute(encodePolyline(route), 3);

    expect(asked).toEqual([{ corridor: route, withinHours: 3, limit: 100 }]);
    expect(found).toEqual([
      {
        id: 'c1',
        kind: 'full',
        description: 'A1 northbound carriageway closure',
        startsAt: new Date('2026-11-02T20:00:00.000Z'),
        endsAt: new Date('2026-11-03T06:00:00.000Z'),
        position: { lat: 55.01, lon: -1.6 },
        lines: [
          [
            { lat: 55.01, lon: -1.6 },
            { lat: 55.02, lon: -1.6 },
          ],
        ],
      },
    ]);
  });

  it('has nothing for a route with no closures along it', async () => {
    const adapter = new ClosureAvoidanceQueryAdapter({
      findAlongRoute: () => Promise.resolve({ closures: [], refreshedAt: undefined }),
    });
    expect(await adapter.alongRoute(encodePolyline([{ lat: 55, lon: -1.6 }]), 1)).toEqual([]);
  });
});
