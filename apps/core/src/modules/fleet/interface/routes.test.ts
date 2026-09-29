import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryFleetVehicleRepository } from '../application/testing/in-memory-fleet-vehicle-repository.js';
import { StubCallerDirectory } from '../application/testing/stub-caller-directory.js';
import type { Caller } from '../application/ports/caller-directory.js';
import type { StaffId } from '../domain/vehicle.js';
import { registerFleetRoutes, type FleetRouteDeps } from './routes.js';

const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const STAFF_HEADER = 'x-test-staff-id';

const ADMIN_ID = makeId<'StaffId'>('admin');
const FLEET_USER_ID = makeId<'StaffId'>('fleet-user'); // companyA, manage_fleet
const VIEWER_ID = makeId<'StaffId'>('viewer'); // companyA, no scope
const OUTSIDER_ID = makeId<'StaffId'>('outsider'); // companyB, manage_fleet

function buildApp(): {
  app: FastifyInstance;
  repo: InMemoryFleetVehicleRepository;
  scopes: RecordingDataScopes;
} {
  const repo = new InMemoryFleetVehicleRepository();
  const scopes = new RecordingDataScopes();
  const callers = new Map<StaffId, Caller>([
    [ADMIN_ID, { kind: 'platform' }],
    [
      FLEET_USER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: ['manage_fleet'] },
    ],
    [VIEWER_ID, { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: [] }],
    [
      OUTSIDER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyB), privileges: ['manage_fleet'] },
    ],
  ]);
  const deps: FleetRouteDeps = {
    createFleetVehicle: { repo, ids: new SequentialIdGenerator() },
    updateFleetVehicle: { repo },
    deleteFleetVehicle: { repo },
    listFleetVehicles: { repo },

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
  registerFleetRoutes(app, deps);
  return { app, repo, scopes };
}

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
}

describe('POST /staff/fleet/companies/:companyId/vehicles', () => {
  it('201s for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ companyId: companyA, name: 'Big Wagon' });
  });

  it('201s for a fleet user with the manage_fleet privilege in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(FLEET_USER_ID),
    });
    expect(response.statusCode).toBe(201);
  });

  it('403s a viewer in the same company with no scope', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('403s a fleet user with the scope but a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { nonsense: true },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /staff/fleet/companies/:companyId/vehicles', () => {
  it('200s for a viewer with no scope, in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      ...asStaff(VIEWER_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ vehicles: [] });
  });

  it('403s staff from a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /staff/fleet/vehicles/:id', () => {
  async function createVehicle(app: FastifyInstance): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(ADMIN_ID),
    });
    return created.json<{ id: string }>().id;
  }

  it('200s for a fleet user with the manage_fleet privilege in the vehicle’s own company', async () => {
    const { app } = buildApp();
    const id = await createVehicle(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/staff/fleet/vehicles/${id}`,
      payload: { name: 'Renamed', dimensions },
      ...asStaff(FLEET_USER_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Renamed' });
  });

  it("404s staff from a different company, same as an unknown id (P2-M1.8: ids can't be probed)", async () => {
    const { app } = buildApp();
    const id = await createVehicle(app);

    const response = await app.inject({
      method: 'PUT',
      url: `/staff/fleet/vehicles/${id}`,
      payload: { name: 'Renamed', dimensions },
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'FleetVehicleNotFound' });
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/fleet/vehicles/11111111-1111-4111-8111-111111111111',
      payload: { name: 'Renamed', dimensions },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /staff/fleet/vehicles/:id', () => {
  it('204s for an admin, and the vehicle is actually gone', async () => {
    const { app, repo } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(ADMIN_ID),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/staff/fleet/vehicles/${id}`,
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(204);
    expect(await repo.findById(makeId<'FleetVehicleId'>(id))).toBeNull();
  });

  it('403s a viewer with no scope', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      payload: { companyId: companyA, name: 'Big Wagon', dimensions },
      ...asStaff(ADMIN_ID),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/staff/fleet/vehicles/${id}`,
      ...asStaff(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Row-Level Security scope (P2-M1.7)', () => {
  it('runs an admin as platform and a fleet user as their own company', async () => {
    const { app, scopes } = buildApp();
    await app.inject({
      method: 'GET',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      ...asStaff(ADMIN_ID),
    });
    await app.inject({
      method: 'GET',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      ...asStaff(FLEET_USER_ID),
    });
    expect(scopes.used).toEqual([{ kind: 'platform' }, { kind: 'company', companyId: companyA }]);
  });

  it("runs a refused request in the caller's own company scope, never the target's", async () => {
    const { app, scopes } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/staff/fleet/companies/${companyA}/vehicles`,
      ...asStaff(OUTSIDER_ID),
    });
    expect(res.statusCode).toBe(403);
    expect(scopes.used).toEqual([{ kind: 'company', companyId: companyB }]);
  });
});
