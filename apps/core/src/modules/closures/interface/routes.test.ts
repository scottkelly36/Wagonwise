import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { closure } from '../application/testing/closure-fixtures.js';
import { InMemoryClosureRepository } from '../application/testing/in-memory-closure-repository.js';
import { registerClosureRoutes } from './routes.js';

function buildApp() {
  const repo = new InMemoryClosureRepository();
  repo.refreshedAt = new Date('2026-11-01T19:55:00.000Z');
  repo.closures = [
    closure({ id: 'tonight' }),
    closure({
      id: 'now',
      status: 'active',
      startsAt: new Date('2026-11-01T19:00:00.000Z'),
      endsAt: new Date('2026-11-02T06:00:00.000Z'),
      kind: 'lane',
      lanesClosed: 2,
    }),
    closure({ id: 'paused', status: 'suspended' }),
  ];
  const app = Fastify();
  registerClosureRoutes(app, { repo, clock: new FakeClock('2026-11-01T20:00:00.000Z') });
  return app;
}

const body = { centre: { lat: 53.36, lon: -2.3 }, radiusM: 5000 };

describe('POST /closures/nearby', () => {
  it('answers with the closures near the point, in force first, as the contract describes', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/closures/nearby',
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    const json = response.json<{
      closures: {
        id: string;
        status: string;
        kind: string;
        lanesClosed: number;
        distanceM: number;
      }[];
      refreshedAt: string;
    }>();
    expect(json.closures.map((c) => [c.id, c.status, c.kind, c.lanesClosed])).toEqual([
      ['now', 'active', 'lane', 2],
      ['tonight', 'planned', 'full', 0],
    ]);
    expect(Number.isInteger(json.closures[0]?.distanceM)).toBe(true);
    expect(json.refreshedAt).toBe('2026-11-01T19:55:00.000Z');
    expect(response.json()).toMatchObject({
      closures: [
        {
          road: 'M56',
          direction: 'eastBound',
          description: 'M56 eastbound jct 7 to 6 carriageway closure',
          startsAt: '2026-11-01T19:00:00.000Z',
          endsAt: '2026-11-02T06:00:00.000Z',
          location: { lat: 53.36, lon: -2.3 },
        },
        {},
      ],
    });
  });

  it('answers with an empty list and no refresh time before the first fetch', async () => {
    const app = Fastify();
    registerClosureRoutes(app, {
      repo: new InMemoryClosureRepository(),
      clock: new FakeClock('2026-11-01T20:00:00.000Z'),
    });
    const response = await app.inject({ method: 'POST', url: '/closures/nearby', payload: body });
    expect(response.json()).toEqual({ closures: [] });
  });

  it('400s a request that is not valid, including a radius beyond 50 km', async () => {
    const app = buildApp();
    expect(
      (await app.inject({ method: 'POST', url: '/closures/nearby', payload: {} })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/closures/nearby',
          payload: { ...body, radiusM: 60_000 },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('POST /closures/along-route', () => {
  // A route that runs along the fixture closure's line.
  const corridor = [
    { lat: 53.35, lon: -2.31 },
    { lat: 53.36, lon: -2.3 },
    { lat: 53.37, lon: -2.29 },
  ];

  it('answers with the closures along the route, each with its lines and no distance', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/closures/along-route',
      payload: { corridor },
    });
    expect(response.statusCode).toBe(200);
    const json = response.json<{
      closures: { id: string; lines: { lat: number; lon: number }[][]; distanceM?: number }[];
      refreshedAt: string;
    }>();
    expect(json.closures.map((c) => c.id)).toEqual(['now', 'tonight']);
    expect(json.closures[1]?.lines).toEqual([
      [
        { lat: 53.35, lon: -2.31 },
        { lat: 53.36, lon: -2.3 },
        { lat: 53.37, lon: -2.29 },
      ],
    ]);
    expect(json.closures[1]).not.toHaveProperty('distanceM');
    expect(json.refreshedAt).toBe('2026-11-01T19:55:00.000Z');
  });

  it('leaves out a closure on another road, one that starts beyond the look-ahead, and a paused one', async () => {
    const app = Fastify();
    const repo = new InMemoryClosureRepository();
    repo.closures = [
      closure({
        id: 'elsewhere',
        lines: [
          [
            { lat: 52.0, lon: -1.0 },
            { lat: 52.01, lon: -1.0 },
          ],
        ],
      }),
      closure({ id: 'far-off', startsAt: new Date('2026-11-05T22:00:00.000Z') }),
      closure({ id: 'paused', status: 'suspended' }),
      closure({ id: 'tonight' }),
    ];
    registerClosureRoutes(app, { repo, clock: new FakeClock('2026-11-01T20:00:00.000Z') });
    const response = await app.inject({
      method: 'POST',
      url: '/closures/along-route',
      payload: { corridor, withinHours: 48 },
    });
    expect(response.json<{ closures: { id: string }[] }>().closures.map((c) => c.id)).toEqual([
      'tonight',
    ]);
  });

  it('400s an empty route or a look-ahead beyond a week', async () => {
    const app = buildApp();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/closures/along-route',
          payload: { corridor: [] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/closures/along-route',
          payload: { corridor, withinHours: 200 },
        })
      ).statusCode,
    ).toBe(400);
  });
});
