import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Caller } from '../application/ports/caller-directory.js';
import {
  InMemoryDriverDirectory,
  InMemoryVehicleDirectory,
} from '../application/testing/in-memory-directories.js';
import { InMemoryJobPositionRepository } from '../application/testing/in-memory-job-position-repository.js';
import { InMemoryJobRepository } from '../application/testing/in-memory-job-repository.js';
import { StubCallerDirectory } from '../application/testing/stub-caller-directory.js';
import type { StaffId } from '../domain/job.js';
import { registerJobsRoutes, type JobsRouteDeps } from './routes.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const STAFF_HEADER = 'x-test-staff-id';
const DRIVER_A = 'driver-a';
const VEHICLE_A = 'vehicle-a';
const stops = [
  { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
];

const ADMIN_ID = makeId<'StaffId'>('admin');
const DISPATCHER_ID = makeId<'StaffId'>('dispatcher'); // companyA, dispatch
const VIEWER_ID = makeId<'StaffId'>('viewer'); // companyA, no privilege
const OUTSIDER_ID = makeId<'StaffId'>('outsider'); // companyB, dispatch

function buildApp(): {
  app: FastifyInstance;
  repo: InMemoryJobRepository;
  positions: InMemoryJobPositionRepository;
  scopes: RecordingDataScopes;
} {
  const repo = new InMemoryJobRepository();
  const positions = new InMemoryJobPositionRepository(repo);
  const scopes = new RecordingDataScopes();
  const callers = new Map<StaffId, Caller>([
    [ADMIN_ID, { kind: 'platform' }],
    [
      DISPATCHER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: ['dispatch'] },
    ],
    [VIEWER_ID, { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: [] }],
    [
      OUTSIDER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyB), privileges: ['dispatch'] },
    ],
  ]);
  const ids = new SequentialIdGenerator();
  const clock = new FakeClock();
  const deps: JobsRouteDeps = {
    createJob: { repo, ids, clock },
    assignJob: {
      repo,
      drivers: new InMemoryDriverDirectory(
        new Map([[makeId<'DriverId'>(DRIVER_A), makeId<'CompanyId'>(companyA)]]),
      ),
      vehicles: new InMemoryVehicleDirectory(
        new Map([[makeId<'FleetVehicleId'>(VEHICLE_A), makeId<'CompanyId'>(companyA)]]),
      ),
      ids,
      clock,
    },
    changeStatus: { repo, ids, clock },
    listJobs: { repo },
    getJob: { repo },
    getProofOfDelivery: { repo },
    listPositions: { positions },
    callerDirectory: new StubCallerDirectory(callers),
    dataScopes: scopes,
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
    }
    done();
  });
  registerJobsRoutes(app, deps);
  return { app, repo, positions, scopes };
}

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
}

describe('POST /staff/jobs/companies/:companyId/jobs', () => {
  it('201s for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      companyId: companyA,
      reference: 'JOB-1',
      status: 'draft',
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
    });
  });

  it('carries requiresProofOfDelivery through when set', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-POD', stops, requiresProofOfDelivery: true },
      ...asStaff(ADMIN_ID),
    });
    expect(response.json()).toMatchObject({ requiresProofOfDelivery: true });
  });

  it('201s for a dispatcher in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(DISPATCHER_ID),
    });
    expect(response.statusCode).toBe(201);
  });

  it('403s staff without the dispatch privilege', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('403s a dispatcher from a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { nonsense: true },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s stops with no delivery', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops: [stops[0]] },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ tag: 'InvalidStops', reason: 'no_delivery' });
  });

  it("runs inside the caller's company scope (P2-M1.7)", async () => {
    const { app, scopes } = buildApp();
    await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(DISPATCHER_ID),
    });
    expect(scopes.used).toEqual([{ kind: 'company', companyId: companyA }]);
  });
});

async function createDraft(app: FastifyInstance): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: `/staff/jobs/companies/${companyA}/jobs`,
    payload: { companyId: companyA, reference: 'JOB-1', stops },
    ...asStaff(DISPATCHER_ID),
  });
  return created.json<{ id: string }>().id;
}

describe('dispatching a job', () => {
  it('assigns, then steps through to delivered, each step kept on the timeline', async () => {
    const { app } = buildApp();
    const id = await createDraft(app);

    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: DRIVER_A, vehicleId: VEHICLE_A },
      ...asStaff(DISPATCHER_ID),
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json()).toMatchObject({ status: 'assigned', driverId: DRIVER_A });

    for (const status of [
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ]) {
      const r = await app.inject({
        method: 'POST',
        url: `/staff/jobs/${id}/status`,
        payload: { status, position: { lat: 54.9, lon: -2.1 } },
        ...asStaff(DISPATCHER_ID),
      });
      expect(r.statusCode).toBe(200);
    }
    const job = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}`,
      ...asStaff(DISPATCHER_ID),
    });
    expect(job.json<{ timeline: unknown[] }>().timeline).toHaveLength(8);
  });

  it('409s a skipped step and a driver who is busy', async () => {
    const { app } = buildApp();
    const first = await createDraft(app);
    const second = await createDraft(app);
    const assign = (id: string) =>
      app.inject({
        method: 'POST',
        url: `/staff/jobs/${id}/assign`,
        payload: { driverId: DRIVER_A, vehicleId: VEHICLE_A },
        ...asStaff(DISPATCHER_ID),
      });
    expect((await assign(first)).statusCode).toBe(200);
    const busy = await assign(second);
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ tag: 'DriverBusy' });

    const skip = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${first}/status`,
      payload: { status: 'loaded' },
      ...asStaff(DISPATCHER_ID),
    });
    expect(skip.statusCode).toBe(409);
  });

  it("404s another company's job, 403s a viewer, and cancels", async () => {
    const { app } = buildApp();
    const id = await createDraft(app);
    const get = (staff: string) =>
      app.inject({ method: 'GET', url: `/staff/jobs/${id}`, ...asStaff(staff) });
    expect((await get(OUTSIDER_ID)).statusCode).toBe(404);
    expect((await get(VIEWER_ID)).statusCode).toBe(200);

    const cancel = (staff: string) =>
      app.inject({ method: 'POST', url: `/staff/jobs/${id}/cancel`, ...asStaff(staff) });
    expect((await cancel(VIEWER_ID)).statusCode).toBe(403);
    const done = await cancel(DISPATCHER_ID);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'cancelled' });
  });

  it('lists a company’s jobs, and 403s staff from another company', async () => {
    const { app } = buildApp();
    await createDraft(app);
    const list = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      ...asStaff(VIEWER_ID),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ jobs: unknown[] }>().jobs).toHaveLength(1);
    const other = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      ...asStaff(OUTSIDER_ID),
    });
    expect(other.statusCode).toBe(403);
  });
});

describe('GET /staff/jobs/:id/proof-of-delivery', () => {
  const photo = { contentType: 'image/jpeg', data: Buffer.from('a delivery photo') };

  it('returns the photo to staff in the job’s company, with no privilege needed', async () => {
    const { app, repo } = buildApp();
    const id = await createDraft(app);
    await repo.saveProofOfDelivery(makeId<'JobId'>(id), photo);

    const response = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}/proof-of-delivery`,
      ...asStaff(VIEWER_ID),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      contentType: 'image/jpeg',
      dataBase64: photo.data.toString('base64'),
    });
    expect(Number.isNaN(Date.parse(response.json<{ capturedAt: string }>().capturedAt))).toBe(
      false,
    );
  });

  it('404s when no photo has been attached', async () => {
    const { app } = buildApp();
    const id = await createDraft(app);
    const response = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}/proof-of-delivery`,
      ...asStaff(DISPATCHER_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'ProofOfDeliveryNotFound' });
  });

  it('404s as JobNotFound for staff from another company, so ids can’t be probed', async () => {
    const { app, repo } = buildApp();
    const id = await createDraft(app);
    await repo.saveProofOfDelivery(makeId<'JobId'>(id), photo);
    const response = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}/proof-of-delivery`,
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'JobNotFound' });
  });

  it('401s without a signed-in staff member and 400s on a malformed id', async () => {
    const { app } = buildApp();
    const id = await createDraft(app);
    expect(
      (await app.inject({ method: 'GET', url: `/staff/jobs/${id}/proof-of-delivery` })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/staff/jobs/not-a-uuid/proof-of-delivery',
          ...asStaff(ADMIN_ID),
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('GET /staff/jobs/companies/:companyId/positions', () => {
  const list = (app: FastifyInstance, staff: string) =>
    app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${companyA}/positions`,
      ...asStaff(staff),
    });

  it('lists the latest position of each job being driven, to anyone in the company', async () => {
    const { app, repo, positions } = buildApp();
    const id = makeId<'JobId'>(await createDraft(app));
    const job = await repo.findById(id);
    await repo.save({ ...job!, status: 'en_route' });
    await positions.record({
      jobId: id,
      location: { lat: 54.9, lon: -2.1 },
      recordedAt: new Date('2026-10-03T10:00:00Z'),
    });
    await positions.record({
      jobId: id,
      location: { lat: 54.95, lon: -2.05 },
      recordedAt: new Date('2026-10-03T10:01:00Z'),
    });

    const response = await list(app, VIEWER_ID);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      positions: [
        { jobId: id, location: { lat: 54.95, lon: -2.05 }, recordedAt: '2026-10-03T10:01:00.000Z' },
      ],
    });
  });

  it('leaves out a job that is no longer being driven', async () => {
    const { app, repo, positions } = buildApp();
    const id = makeId<'JobId'>(await createDraft(app));
    const job = await repo.findById(id);
    await repo.save({ ...job!, status: 'delivered' });
    await positions.record({
      jobId: id,
      location: { lat: 54.9, lon: -2.1 },
      recordedAt: new Date(),
    });
    expect((await list(app, VIEWER_ID)).json()).toEqual({ positions: [] });
  });

  it('403s staff from another company', async () => {
    const { app } = buildApp();
    expect((await list(app, OUTSIDER_ID)).statusCode).toBe(403);
  });
});
