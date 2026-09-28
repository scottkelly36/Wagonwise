import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryFleetVehicleRepository } from '../application/testing/in-memory-fleet-vehicle-repository.js';
import { StubCallerDirectory } from '../application/testing/stub-caller-directory.js';
import type { Caller } from '../application/ports/caller-directory.js';
import type { DriverId } from '../domain/vehicle.js';
import { registerFleetRoutes, type FleetRouteDeps } from './routes.js';

const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const DRIVER_HEADER = 'x-test-driver-id';

const ADMIN_ID = makeId<'DriverId'>('admin');
const FLEET_USER_ID = makeId<'DriverId'>('fleet-user'); // companyA, manage_fleet
const VIEWER_ID = makeId<'DriverId'>('viewer'); // companyA, no scope
const OUTSIDER_ID = makeId<'DriverId'>('outsider'); // companyB, manage_fleet

function buildApp(): {
  app: FastifyInstance;
  repo: InMemoryFleetVehicleRepository;
  scopes: RecordingDataScopes;
} {
  const repo = new InMemoryFleetVehicleRepository();
  const scopes = new RecordingDataScopes();
  const callers = new Map<DriverId, Caller>([
    [ADMIN_ID, { isAdmin: true, scopes: [] }],
    [
      FLEET_USER_ID,
      { isAdmin: false, companyId: makeId<'CompanyId'>(companyA), scopes: ['manage_fleet'] },
    ],
    [VIEWER_ID, { isAdmin: false, companyId: makeId<'CompanyId'>(companyA), scopes: [] }],
    [
      OUTSIDER_ID,
      { isAdmin: false, companyId: makeId<'CompanyId'>(companyB), scopes: ['manage_fleet'] },
    ],
  ]);
  const deps: FleetRouteDeps = {
    createFleetVehicle: { repo, ids: new SequentialIdGenerator() },
    updateFleetVehicle: { repo },
    deleteFleetVehicle: { repo },
    listFleetVehicles: { repo },
    vehicleRepo: repo,
    callerDirectory: new StubCallerDirectory(callers),
    dataScopes: scopes,
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
  registerFleetRoutes(app, deps);
  return { app, repo, scopes };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /fleet/companies/:companyId/vehicles', () => {
  it('201s for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ companyId: companyA, name: 'Big Wagon' });
  });

  it('201s for a fleet user with manage_fleet scope in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(FLEET_USER_ID),
    });
    expect(response.statusCode).toBe(201);
  });

  it('403s a viewer in the same company with no scope', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('403s a fleet user with the scope but a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { nonsense: true },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /fleet/companies/:companyId/vehicles', () => {
  it('200s for a viewer with no scope, in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${companyA}/vehicles`,
      ...asDriver(VIEWER_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ vehicles: [] });
  });

  it('403s a driver from a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${companyA}/vehicles`,
      ...asDriver(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /fleet/vehicles/:id', () => {
  async function createVehicle(app: FastifyInstance): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(ADMIN_ID),
    });
    return created.json<{ id: string }>().id;
  }

  it('200s for a fleet user with manage_fleet scope in the vehicle’s own company', async () => {
    const { app } = buildApp();
    const id = await createVehicle(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/fleet/vehicles/${id}`,
      payload: { name: 'Renamed', dimensions },
      ...asDriver(FLEET_USER_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Renamed' });
  });

  it('403s a driver from a different company', async () => {
    const { app } = buildApp();
    const id = await createVehicle(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/fleet/vehicles/${id}`,
      payload: { name: 'Renamed', dimensions },
      ...asDriver(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/fleet/vehicles/11111111-1111-4111-8111-111111111111',
      payload: { name: 'Renamed', dimensions },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /fleet/vehicles/:id', () => {
  it('204s for an admin, and the vehicle is actually gone', async () => {
    const { app, repo } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(ADMIN_ID),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/fleet/vehicles/${id}`,
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(204);
    expect(await repo.findById(makeId<'FleetVehicleId'>(id))).toBeNull();
  });

  it('403s a viewer with no scope', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asDriver(ADMIN_ID),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/fleet/vehicles/${id}`,
      ...asDriver(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Row-Level Security scope (P2-M1.7)', () => {
  it('runs an admin as platform and a fleet user as their own company', async () => {
    const { app, scopes } = buildApp();
    await app.inject({
      method: 'GET',
      url: `/fleet/companies/${companyA}/vehicles`,
      ...asDriver(ADMIN_ID),
    });
    await app.inject({
      method: 'GET',
      url: `/fleet/companies/${companyA}/vehicles`,
      ...asDriver(FLEET_USER_ID),
    });
    expect(scopes.used).toEqual([{ kind: 'platform' }, { kind: 'company', companyId: companyA }]);
  });

  it('never opens a scope for a request it refuses', async () => {
    const { app, scopes } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${companyA}/vehicles`,
      ...asDriver(OUTSIDER_ID),
    });
    expect(res.statusCode).toBe(403);
    expect(scopes.used).toEqual([]);
  });
});
