import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryCongestionRepository } from '../application/testing/in-memory-congestion-repository.js';
import { registerCongestionRoutes, type CongestionRouteDeps } from './routes.js';

const location = { lat: 54.9707, lon: -2.1013 };
const now = new Date('2026-06-15T08:00:00.000Z');

// Same stand-in as hazards' routes.test.ts: `reporterId` comes from `request.driverId`
// (host/driver-auth.ts's hook), never a body field — a plain test header stands in for that hook
// here, since driver-auth.test.ts already exercises the hook itself against real verification.
const DRIVER_HEADER = 'x-test-driver-id';
const ADMIN = 'staff-admin';

function buildApp(): { app: FastifyInstance; deps: CongestionRouteDeps } {
  const repo = new InMemoryCongestionRepository();
  const clock = new FakeClock(now);
  const deps: CongestionRouteDeps = {
    reportCongestion: { repo, clock },
    findNearbyCongestion: { repo, clock },
    admin: { repo, clock },
    callerDirectory: {
      getCaller: (id) => Promise.resolve(id === ADMIN ? { kind: 'platform' } : null),
    },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    const staffId = request.headers['x-test-staff-id'];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
    }
    done();
  });
  registerCongestionRoutes(app, deps);
  return { app, deps };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /congestion/reports', () => {
  it('200s and returns the created report', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        location,
        estimatedWaitMinutes: 15,
      },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reporterId: 'driver-1',
      estimatedWaitMinutes: 15,
    });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        location,
        estimatedWaitMinutes: 15,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a wait time caught by the zod schema before the use case runs', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { id: '11111111-1111-4111-8111-111111111111', location, estimatedWaitMinutes: 0 },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /congestion/reports/nearby', () => {
  it('200s with reports near a single point', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        location,
        estimatedWaitMinutes: 15,
      },
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ reports: [{ estimatedWaitMinutes: 15 }] });
  });

  it('omits a report outside the radius', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        location,
        estimatedWaitMinutes: 15,
      },
      ...asDriver('driver-1'),
    });

    const farAway = { lat: location.lat + 5, lon: location.lon + 5 };
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [farAway], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reports: [] });
  });

  it('400s an empty corridor', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a non-positive radius', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [location], radiusM: 0 },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('staff congestion routes', () => {
  const staff = { headers: { 'x-test-staff-id': ADMIN } };
  const report = (app: FastifyInstance, id: string, wait: number) =>
    app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { id, location, estimatedWaitMinutes: wait },
      ...asDriver('driver-1'),
    });
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('lists reports without the reporter, removes one, and clears none that are still running', async () => {
    const { app } = buildApp();
    await report(app, A, 20);
    await report(app, B, 45);

    const listed = await app.inject({ method: 'GET', url: '/staff/congestion/reports', ...staff });
    expect(listed.statusCode).toBe(200);
    const body = listed.json<{
      total: number;
      active: number;
      reports: { id: string; active: boolean; estimatedWaitMinutes: number }[];
    }>();
    expect([body.total, body.active]).toEqual([2, 2]);
    expect(body.reports.map((r) => r.estimatedWaitMinutes).sort()).toEqual([20, 45]);
    expect(JSON.stringify(body)).not.toContain('driver-1');

    const cleared = await app.inject({
      method: 'POST',
      url: '/staff/congestion/reports/clear-expired',
      ...staff,
    });
    expect(cleared.json()).toEqual({ removed: 0 });

    expect(
      (await app.inject({ method: 'DELETE', url: `/staff/congestion/reports/${A}`, ...staff }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `/staff/congestion/reports/${A}`, ...staff }))
        .statusCode,
    ).toBe(404);
    const after = await app.inject({ method: 'GET', url: '/staff/congestion/reports', ...staff });
    expect(after.json<{ total: number }>().total).toBe(1);
  });

  it('401s with no staff sign-in, 403s anyone but WagonWise staff, and 400s a bad id', async () => {
    const { app } = buildApp();
    const other = { headers: { 'x-test-staff-id': 'someone' } };
    for (const [method, url] of [
      ['GET', '/staff/congestion/reports'],
      ['DELETE', `/staff/congestion/reports/${A}`],
      ['POST', '/staff/congestion/reports/clear-expired'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, ...other })).statusCode).toBe(403);
    }
    expect(
      (await app.inject({ method: 'DELETE', url: '/staff/congestion/reports/nope', ...staff }))
        .statusCode,
    ).toBe(400);
  });
});
