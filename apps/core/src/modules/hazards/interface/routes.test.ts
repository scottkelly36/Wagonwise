import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryHazardRepository } from '../application/testing/in-memory-hazard-repository.js';
import { StubAdminDirectory } from '../application/testing/stub-admin-directory.js';
import { StubHazardParser } from '../application/testing/stub-hazard-parser.js';
import { registerHazardsRoutes, type HazardsRouteDeps } from './routes.js';

const location = { lat: 54.9707, lon: -2.1013 };
const now = new Date('2026-06-15T08:00:00.000Z');

// `reporterId` comes from `request.driverId` (host/driver-auth.ts's hook, M4.3), never a body
// field. This suite isn't exercising that hook — driver-auth.test.ts already does, against real
// verification — so it stands in for it with a trivial one keyed off a plain test header.
const DRIVER_HEADER = 'x-test-driver-id';
const ADMIN_DRIVER_ID = makeId<'DriverId'>('admin-driver');

function buildApp(): { app: FastifyInstance; deps: HazardsRouteDeps } {
  const repo = new InMemoryHazardRepository();
  const clock = new FakeClock(now);
  const ids = new SequentialIdGenerator();
  const deps: HazardsRouteDeps = {
    reportHazard: { repo, clock, ids },
    confirmHazard: { repo, clock, ids },
    dismissHazard: { repo },
    deleteHazard: { repo },
    adminDirectory: new StubAdminDirectory(new Set([ADMIN_DRIVER_ID])),
    getHazard: { repo },
    parseVoiceReport: { parser: new StubHazardParser() },
    findNearbyHazards: { repo, clock },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
  registerHazardsRoutes(app, deps);
  return { app, deps };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /hazards/reports', () => {
  it('200s and returns the created report', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reporterId: 'driver-1',
      type: 'low_bridge',
      status: 'active',
      confirmations: 0,
    });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('is idempotent on id — resubmitting returns the same report, 200', async () => {
    const { app } = buildApp();
    const payload = {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'low_bridge',
      location,
      source: 'tap',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload,
      ...asDriver('driver-1'),
    });
    const second = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload,
      ...asDriver('driver-1'),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s an invalid measurement caught by the zod schema before the use case runs', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        measurement: { kind: 'height', value: 0, unit: 'm' },
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /hazards/reports/nearby', () => {
  it('200s with hazards near a single point', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ hazards: [{ type: 'low_bridge' }] });
  });

  it('omits a hazard outside the radius', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });

    const farAway = { lat: location.lat + 5, lon: location.lon + 5 };
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [farAway], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hazards: [] });
  });

  it('omits a dismissed hazard', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();
    for (let i = 0; i < 3; i += 1) {
      await app.inject({ method: 'POST', url: `/hazards/reports/${id}/dismiss` });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hazards: [] });
  });

  it('accepts several points, as a route corridor', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'flooding',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: {
        corridor: [
          { lat: location.lat - 0.01, lon: location.lon - 0.01 },
          location,
          { lat: location.lat + 0.01, lon: location.lon + 0.01 },
        ],
        radiusM: 500,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ hazards: [{ type: 'flooding' }] });
  });

  it('400s an empty corridor', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a non-positive radius', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [location], radiusM: 0 },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /hazards/voice-reports/parse', () => {
  it('200s with the parser output for a well-formed transcript', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: { transcript: 'low bridge just past the roundabout' },
    });
    expect(response.statusCode).toBe(200);
    // StubHazardParser's default: whatever the real `type: 'other'` fallback returns.
    expect(response.json()).toEqual({
      type: 'other',
      note: 'low bridge just past the roundabout',
    });
  });

  it('400s a missing transcript', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s an empty transcript', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: { transcript: '' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /hazards/reports/:id', () => {
  it('200s the report for a known id', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({ method: 'GET', url: `/hazards/reports/${id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, type: 'low_bridge', status: 'active' });
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/hazards/reports/22222222-2222-4222-8222-222222222222',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'HazardReportNotFound' });
  });

  it('400s a non-UUID id', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/hazards/reports/not-a-uuid' });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /hazards/reports/:id/confirm', () => {
  it('200s and returns the report with confirmations incremented', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({ method: 'POST', url: `/hazards/reports/${id}/confirm` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ confirmations: 1 });
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/22222222-2222-4222-8222-222222222222/confirm',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'HazardReportNotFound' });
  });

  it('400s a non-UUID id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/not-a-uuid/confirm',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /hazards/reports/:id/dismiss', () => {
  it('200s and returns the report with dismissals incremented', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({ method: 'POST', url: `/hazards/reports/${id}/dismiss` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dismissals: 1 });
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/22222222-2222-4222-8222-222222222222/dismiss',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'HazardReportNotFound' });
  });
});

describe('DELETE /hazards/reports/:id', () => {
  async function createReport(app: FastifyInstance): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'low_bridge',
        location,
        source: 'tap',
      },
      ...asDriver('driver-1'),
    });
    return created.json<{ id: string }>().id;
  }

  it('204s and actually removes the report for an admin', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({
      method: 'DELETE',
      url: `/hazards/reports/${id}`,
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({ method: 'GET', url: `/hazards/reports/${id}` });
    expect(getResponse.statusCode).toBe(404);
  });

  it('403s a non-admin driver, leaving the report in place', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({
      method: 'DELETE',
      url: `/hazards/reports/${id}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });

    const getResponse = await app.inject({ method: 'GET', url: `/hazards/reports/${id}` });
    expect(getResponse.statusCode).toBe(200);
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({ method: 'DELETE', url: `/hazards/reports/${id}` });
    expect(response.statusCode).toBe(401);
  });

  it('404s an unknown id for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/hazards/reports/22222222-2222-4222-8222-222222222222',
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'HazardReportNotFound' });
  });

  it('400s a non-UUID id for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/hazards/reports/not-a-uuid',
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});
