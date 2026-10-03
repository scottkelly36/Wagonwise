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
const STAFF_HEADER = 'x-test-staff-id';
const ADMIN_STAFF_ID = makeId<'StaffId'>('admin-staff');

function buildApp(): {
  app: FastifyInstance;
  deps: HazardsRouteDeps;
  repo: InMemoryHazardRepository;
} {
  const repo = new InMemoryHazardRepository();
  const clock = new FakeClock(now);
  const ids = new SequentialIdGenerator();
  const admins = new StubAdminDirectory(new Set([ADMIN_STAFF_ID]));
  const deps: HazardsRouteDeps = {
    reportHazard: { repo, clock, ids },
    confirmHazard: { repo, clock, ids },
    dismissHazard: { repo },
    deleteHazard: { repo, admins },
    getHazard: { repo },
    listHazards: { repo, admins },
    parseVoiceReport: { parser: new StubHazardParser() },
    findNearbyHazards: { repo, clock },
    moderationQueue: { repo, admins },
    moderateHazard: { repo, admins, clock, ids },
    moderationDecisions: { repo, admins },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
    }
    done();
  });
  registerHazardsRoutes(app, deps);
  return { app, deps, repo };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
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

describe('DELETE /staff/hazard-reports/:id', () => {
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

  it('204s and actually removes the report for a WagonWise admin', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({
      method: 'DELETE',
      url: `/staff/hazard-reports/${id}`,
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({ method: 'GET', url: `/hazards/reports/${id}` });
    expect(getResponse.statusCode).toBe(404);
  });

  it('403s staff who are not WagonWise admins, leaving the report in place', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({
      method: 'DELETE',
      url: `/staff/hazard-reports/${id}`,
      ...asStaff('fleet-user-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });

    const getResponse = await app.inject({ method: 'GET', url: `/hazards/reports/${id}` });
    expect(getResponse.statusCode).toBe(200);
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const id = await createReport(app);

    const response = await app.inject({ method: 'DELETE', url: `/staff/hazard-reports/${id}` });
    expect(response.statusCode).toBe(401);
  });

  it('404s an unknown id for a WagonWise admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/staff/hazard-reports/22222222-2222-4222-8222-222222222222',
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'HazardReportNotFound' });
  });

  it('400s a non-UUID id for a WagonWise admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/staff/hazard-reports/not-a-uuid',
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /staff/hazard-reports', () => {
  it('200s with every report for a WagonWise admin', async () => {
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
      method: 'GET',
      url: '/staff/hazard-reports',
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ hazards: [{ type: 'low_bridge' }] });
  });

  it('403s staff who are not WagonWise admins', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/staff/hazard-reports',
      ...asStaff('fleet-user-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/staff/hazard-reports' });
    expect(response.statusCode).toBe(401);
  });
});

describe('moderation (P2-M7.1)', () => {
  const REPORT_ID = '11111111-1111-4111-8111-111111111111';
  const report = (overrides: Record<string, unknown> = {}) => ({
    id: makeId<'HazardReportId'>(REPORT_ID),
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'low_bridge' as const,
    location,
    source: 'tap' as const,
    confirmations: 0,
    dismissals: 0,
    status: 'active' as const,
    createdAt: now,
    ...overrides,
  });
  const moderate = (app: FastifyInstance, payload: unknown, staff = ADMIN_STAFF_ID as string) =>
    app.inject({
      method: 'POST',
      url: `/staff/hazard-reports/${REPORT_ID}/moderate`,
      payload: payload as object,
      ...asStaff(staff),
    });

  it('lists blocking and disputed reports in the queue, and not quiet advisory ones', async () => {
    const { app, repo } = buildApp();
    await repo.save(report());
    await repo.save(
      report({
        id: makeId<'HazardReportId'>('22222222-2222-4222-8222-222222222222'),
        type: 'tight_bend',
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/staff/hazard-reports/moderation-queue',
      ...asStaff(ADMIN_STAFF_ID),
    });

    expect(response.statusCode).toBe(200);
    const { items } = response.json<{ items: { hazard: { id: string }; reasons: string[] }[] }>();
    expect(items.map((i) => i.hazard.id)).toEqual([REPORT_ID]);
    expect(items[0]?.reasons).toEqual(['blocking_unreviewed']);
  });

  it('approving takes a report out of the queue and records who decided', async () => {
    const { app, repo } = buildApp();
    await repo.save(report());

    const response = await moderate(app, { action: 'approve', note: 'Checked on street view' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      action: 'approve',
      moderatorId: ADMIN_STAFF_ID,
      note: 'Checked on street view',
    });
    const queue = await app.inject({
      method: 'GET',
      url: '/staff/hazard-reports/moderation-queue',
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(queue.json()).toEqual({ items: [] });
    expect(repo.emittedEvents.map((e) => e.eventType)).toEqual(['HazardModerated']);
  });

  it('rejecting dismisses the report and the audit trail shows before and after', async () => {
    const { app, repo } = buildApp();
    await repo.save(report());

    expect((await moderate(app, { action: 'reject' })).statusCode).toBe(200);

    expect((await repo.findById(makeId<'HazardReportId'>(REPORT_ID)))?.status).toBe('dismissed');
    const trail = await app.inject({
      method: 'GET',
      url: `/staff/hazard-reports/${REPORT_ID}/decisions`,
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(trail.json()).toMatchObject({
      decisions: [
        { action: 'reject', before: { status: 'active' }, after: { status: 'dismissed' } },
      ],
    });
  });

  it('edits a measurement, and refuses one that is not positive', async () => {
    const { app, repo } = buildApp();
    await repo.save(report());

    const fixed = await moderate(app, {
      action: 'edit',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
    });
    expect(fixed.statusCode).toBe(200);
    expect((await repo.findById(makeId<'HazardReportId'>(REPORT_ID)))?.measurement?.value).toBe(
      3.5,
    );

    const bad = await moderate(app, {
      action: 'edit',
      measurement: { kind: 'height', value: -1, unit: 'm' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('is for WagonWise admins only, and says nothing about whether an id exists', async () => {
    const { app, repo } = buildApp();
    await repo.save(report());
    expect((await moderate(app, { action: 'reject' }, 'someone-else')).statusCode).toBe(403);
    expect((await repo.findById(makeId<'HazardReportId'>(REPORT_ID)))?.status).toBe('active');
    const unknown = await app.inject({
      method: 'POST',
      url: '/staff/hazard-reports/99999999-9999-4999-8999-999999999999/moderate',
      payload: { action: 'reject' },
      ...asStaff('someone-else'),
    });
    expect(unknown.statusCode).toBe(403);
    const queue = await app.inject({
      method: 'GET',
      url: '/staff/hazard-reports/moderation-queue',
      ...asStaff('someone-else'),
    });
    expect(queue.statusCode).toBe(403);
  });

  it('404s an unknown report for an admin, and 400s an unknown action', async () => {
    const { app } = buildApp();
    expect((await moderate(app, { action: 'approve' })).statusCode).toBe(404);
    expect((await moderate(app, { action: 'banish' })).statusCode).toBe(400);
  });
});
