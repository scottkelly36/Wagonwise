import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { FakeNavigationProfileProvisioner } from '../application/testing/fake-navigation-profile-provisioner.js';
import { InMemoryJobPositionRepository } from '../application/testing/in-memory-job-position-repository.js';
import { InMemoryJobRepository } from '../application/testing/in-memory-job-repository.js';
import type { DriverIdentityDirectory } from '../application/ports/directories.js';
import type { Job } from '../domain/job.js';
import { registerJobsDriverRoutes, type JobsDriverRouteDeps } from './driver-routes.js';

const DRIVER = makeId<'DriverId'>('driver-1');
const OTHER_DRIVER = makeId<'DriverId'>('driver-2');
const UNKNOWN_DRIVER = makeId<'DriverId'>('driver-ghost');
const COMPANY = makeId<'CompanyId'>('company-1');
const JOB_ID = makeId<'JobId'>('11111111-1111-4111-8111-111111111111');
const DRIVER_HEADER = 'x-test-driver-id';

class FakeDriverIdentities implements DriverIdentityDirectory {
  getIdentifier(driverId: string): Promise<string | null> {
    if (driverId === DRIVER) return Promise.resolve('driver@example.com');
    if (driverId === OTHER_DRIVER) return Promise.resolve('other@example.com');
    return Promise.resolve(null);
  }
}

function buildApp(): {
  app: FastifyInstance;
  repo: InMemoryJobRepository;
  positions: InMemoryJobPositionRepository;
  scopes: RecordingDataScopes;
} {
  const repo = new InMemoryJobRepository();
  const positions = new InMemoryJobPositionRepository(repo);
  const scopes = new RecordingDataScopes();
  const deps: JobsDriverRouteDeps = {
    currentJob: { repo },
    changeStatus: { repo, ids: new SequentialIdGenerator(), clock: new FakeClock() },
    attachProofOfDelivery: { repo },
    recordPosition: { repo, positions, clock: new FakeClock() },
    navigationProfile: { repo, profiles: new FakeNavigationProfileProvisioner() },
    identities: new FakeDriverIdentities(),
    dataScopes: scopes,
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') request.driverId = driverId;
    done();
  });
  registerJobsDriverRoutes(app, deps);
  return { app, repo, positions, scopes };
}

const asDriver = (driverId: string) => ({ headers: { [DRIVER_HEADER]: driverId } });

const JOB: Job = {
  id: JOB_ID,
  companyId: COMPANY,
  reference: 'JOB-1',
  stops: [],
  status: 'assigned',
  driverId: DRIVER,
  timeline: [{ status: 'assigned', at: new Date('2026-10-01T09:00:00.000Z') }],
  requiresProofOfDelivery: false,
  hasProofOfDelivery: false,
  currentStop: 0,
  proofStops: [],
};

const DELIVERY_STOP = {
  kind: 'delivery' as const,
  name: 'Port',
  location: { lat: 55.0, lon: -1.6 },
};

describe('GET /jobs/current', () => {
  it("200s with the driver's current job", async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const response = await app.inject({ method: 'GET', url: '/jobs/current', ...asDriver(DRIVER) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ job: { id: JOB_ID, status: 'assigned' } });
  });

  it('200s with null when the driver has no active job', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/jobs/current',
      ...asDriver(OTHER_DRIVER),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ job: null });
  });

  it('401s with no driver token, and 401s an unrecognised driver, without touching the repo', async () => {
    const { app } = buildApp();
    const noToken = await app.inject({ method: 'GET', url: '/jobs/current' });
    expect(noToken.statusCode).toBe(401);
    const unknown = await app.inject({
      method: 'GET',
      url: '/jobs/current',
      ...asDriver(UNKNOWN_DRIVER),
    });
    expect(unknown.statusCode).toBe(401);
  });

  it("runs in the driver's own data scope", async () => {
    const { app, scopes } = buildApp();
    await app.inject({ method: 'GET', url: '/jobs/current', ...asDriver(DRIVER) });
    expect(scopes.used).toEqual([
      { kind: 'driver', driverId: DRIVER, identifier: 'driver@example.com' },
    ]);
  });
});

describe('POST /jobs/:id/status', () => {
  it('200s and advances the job for the driver on it', async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'accepted' },
      ...asDriver(DRIVER),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'accepted' });
  });

  it("404s for a driver who isn't on the job", async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'accepted' },
      ...asDriver(OTHER_DRIVER),
    });
    expect(response.statusCode).toBe(404);
  });

  it('400s a bad id or body without touching the repo', async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const badId = await app.inject({
      method: 'POST',
      url: '/jobs/not-a-uuid/status',
      payload: { status: 'accepted' },
      ...asDriver(DRIVER),
    });
    const badBody = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'not-a-status' },
      ...asDriver(DRIVER),
    });
    expect([badId.statusCode, badBody.statusCode]).toEqual([400, 400]);
    expect((await repo.findById(JOB_ID))?.status).toBe('assigned');
  });
});

describe('POST /jobs/:id/proof-of-delivery', () => {
  it('204s and records the photo for the driver on it', async () => {
    const { app, repo } = buildApp();
    await repo.save({
      ...JOB,
      stops: [DELIVERY_STOP],
      status: 'at_delivery',
      requiresProofOfDelivery: true,
    });
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') },
      ...asDriver(DRIVER),
    });
    expect(response.statusCode).toBe(204);
    expect((await repo.findById(JOB_ID))?.hasProofOfDelivery).toBe(true);
    expect(repo.proofOfDelivery.get(JOB_ID)?.get(0)).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('lets the delivered step through once proof is attached, and refuses it before that', async () => {
    const { app, repo } = buildApp();
    await repo.save({
      ...JOB,
      stops: [DELIVERY_STOP],
      status: 'at_delivery',
      requiresProofOfDelivery: true,
    });
    const tooSoon = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'delivered' },
      ...asDriver(DRIVER),
    });
    expect(tooSoon.statusCode).toBe(409);
    expect(tooSoon.json()).toMatchObject({ tag: 'ProofOfDeliveryRequired' });

    await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') },
      ...asDriver(DRIVER),
    });
    const now = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'delivered' },
      ...asDriver(DRIVER),
    });
    expect(now.statusCode).toBe(200);
  });

  it("404s for a driver who isn't on the job", async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') },
      ...asDriver(OTHER_DRIVER),
    });
    expect(response.statusCode).toBe(404);
  });

  it('400s a blank content type or non-base64 data', async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const badContentType = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: '', dataBase64: 'YQ==' },
      ...asDriver(DRIVER),
    });
    const badData = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: 'not base64!!' },
      ...asDriver(DRIVER),
    });
    expect([badContentType.statusCode, badData.statusCode]).toEqual([400, 400]);
  });
});

describe('POST /jobs/:id/fail', () => {
  it('200s and fails the job for the driver on it', async () => {
    const { app, repo } = buildApp();
    await repo.save(JOB);
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/fail`,
      ...asDriver(DRIVER),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'failed' });
  });
});

describe('assign and cancel stay staff-only', () => {
  it('exposes no driver route for either', async () => {
    const { app } = buildApp();
    const assign = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/assign`,
      ...asDriver(DRIVER),
    });
    const cancel = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/cancel`,
      ...asDriver(DRIVER),
    });
    expect([assign.statusCode, cancel.statusCode]).toEqual([404, 404]);
  });
});

describe('POST /jobs/:id/position', () => {
  const position = { location: { lat: 54.97, lon: -2.1 } };
  const report = (app: FastifyInstance, driver: string, payload: unknown = position) =>
    app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/position`,
      payload: payload as object,
      ...asDriver(driver),
    });

  it('204s and stores the position while the job is being driven', async () => {
    const { app, repo, positions } = buildApp();
    await repo.save({ ...JOB, status: 'en_route' });
    expect((await report(app, DRIVER)).statusCode).toBe(204);
    expect(positions.recorded).toHaveLength(1);
    expect(positions.recorded[0]).toMatchObject({ jobId: JOB_ID, location: position.location });
  });

  it('refuses, and stores nothing, before the driver has accepted the job and after it ends', async () => {
    for (const status of ['assigned', 'delivered', 'cancelled'] as const) {
      const { app, repo, positions } = buildApp();
      await repo.save({ ...JOB, status });
      const response = await report(app, DRIVER);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ tag: 'NotTracking' });
      expect(positions.recorded).toHaveLength(0);
    }
  });

  it("404s for a driver who isn't on the job", async () => {
    const { app, repo, positions } = buildApp();
    await repo.save({ ...JOB, status: 'en_route' });
    expect((await report(app, OTHER_DRIVER)).statusCode).toBe(404);
    expect(positions.recorded).toHaveLength(0);
  });

  it('400s on coordinates that are not on Earth, and 401s without a driver', async () => {
    const { app, repo } = buildApp();
    await repo.save({ ...JOB, status: 'en_route' });
    expect((await report(app, DRIVER, { location: { lat: 91, lon: 0 } })).statusCode).toBe(400);
    expect((await report(app, DRIVER, { location: { lat: 0, lon: 181 } })).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/jobs/${JOB_ID}/position`,
          payload: position,
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe('POST /jobs/:id/navigation-profile', () => {
  const driving: Job = {
    ...JOB,
    status: 'accepted',
    vehicleId: makeId<'FleetVehicleId'>('vehicle-1'),
  };
  const url = `/jobs/${JOB_ID}/navigation-profile`;

  it('200s with the profile for the assigned vehicle, for the driver on the job', async () => {
    const { app, repo } = buildApp();
    await repo.save(driving);
    const response = await app.inject({ method: 'POST', url, ...asDriver(DRIVER) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      profileId: 'profile-driver-1-vehicle-1',
      vehicleName: 'Scania R450',
    });
  });

  it('409s before the job is accepted, and when no vehicle is assigned', async () => {
    const { app, repo } = buildApp();
    await repo.save({ ...driving, status: 'assigned' });
    const notYet = await app.inject({ method: 'POST', url, ...asDriver(DRIVER) });
    expect(notYet.statusCode).toBe(409);
    expect(notYet.json()).toMatchObject({ tag: 'NotTracking' });

    await repo.save({ ...driving, vehicleId: undefined });
    const noVehicle = await app.inject({ method: 'POST', url, ...asDriver(DRIVER) });
    expect(noVehicle.statusCode).toBe(409);
    expect(noVehicle.json()).toMatchObject({ tag: 'NoVehicleAssigned' });
  });

  it("404s for a driver who isn't on the job, and 401s without a driver", async () => {
    const { app, repo } = buildApp();
    await repo.save(driving);
    const other = await app.inject({ method: 'POST', url, ...asDriver(OTHER_DRIVER) });
    expect(other.statusCode).toBe(404);
    const anonymous = await app.inject({ method: 'POST', url });
    expect(anonymous.statusCode).toBe(401);
  });

  it('400s a bad job id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/jobs/not-a-uuid/navigation-profile',
      ...asDriver(DRIVER),
    });
    expect(response.statusCode).toBe(400);
  });
});
