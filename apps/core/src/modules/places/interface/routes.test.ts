import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import type { StaffCaller } from '../application/ports/directories.js';
import { InMemoryPlaceRepository } from '../application/testing/in-memory-place-repository.js';
import { registerPlacesRoutes } from './routes.js';

const acme = '11111111-1111-4111-8111-111111111111';
const beta = '22222222-2222-4222-8222-222222222222';
const PAT = 'driver-pat'; // drives for acme
const LEE = 'driver-lee'; // drives for beta
const placeId = '33333333-3333-4333-8333-333333333333';
const DRIVER_HEADER = 'x-test-driver-id';
const STAFF_HEADER = 'x-test-staff-id';

const staff: Record<string, StaffCaller> = {
  dispatcher: { kind: 'fleet', companyId: makeId<'CompanyId'>(acme), privileges: ['dispatch'] },
  viewer: { kind: 'fleet', companyId: makeId<'CompanyId'>(acme), privileges: [] },
  admin: { kind: 'platform' },
};

function buildApp(): { app: FastifyInstance; scopes: RecordingDataScopes } {
  const scopes = new RecordingDataScopes();
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driver = request.headers[DRIVER_HEADER];
    const staffId = request.headers[STAFF_HEADER];
    if (typeof driver === 'string') request.driverId = driver;
    if (typeof staffId === 'string') request.staffId = staffId;
    done();
  });
  registerPlacesRoutes(app, {
    places: {
      repo: new InMemoryPlaceRepository(),
      membership: {
        isActiveDriverOfCompany: (driver, company) =>
          Promise.resolve(
            (driver === PAT && company === acme) || (driver === LEE && company === beta),
          ),
      },
      clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    identities: { getIdentifier: (id) => Promise.resolve(`${id}@example.com`) },
    dataScopes: scopes,
  });
  return { app, scopes };
}

const asDriver = (id: string) => ({ headers: { [DRIVER_HEADER]: id } });
const asStaff = (id: string) => ({ headers: { [STAFF_HEADER]: id } });
const body = {
  id: placeId,
  companyId: acme,
  category: 'farm',
  name: 'Smith’s Farm',
  note: 'Gate on the left',
  location: { lat: 54.95, lon: -2.2 },
};

describe('the driver door: /places', () => {
  it('201s a place marked by a driver of the company, in their own data scope', async () => {
    const { app, scopes } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/places',
      payload: body,
      ...asDriver(PAT),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: placeId,
      name: 'Smith’s Farm',
      note: 'Gate on the left',
    });
    expect(scopes.used).toContainEqual({
      kind: 'driver',
      driverId: PAT,
      identifier: `${PAT}@example.com`,
    });
  });

  it('401s with no signed-in driver, 403s a driver of another company, 400s a bad body', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'POST', url: '/places', payload: body })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'POST', url: '/places', payload: body, ...asDriver(LEE) }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/places',
          payload: { nonsense: 1 },
          ...asDriver(PAT),
        })
      ).statusCode,
    ).toBe(400);
  });

  it('lists and finds near, for the company, and refuses another company', async () => {
    const { app } = buildApp();
    await app.inject({ method: 'POST', url: '/places', payload: body, ...asDriver(PAT) });
    const listed = await app.inject({
      method: 'POST',
      url: '/places/list',
      payload: { companyId: acme },
      ...asDriver(PAT),
    });
    expect(listed.json<{ places: unknown[] }>().places).toHaveLength(1);
    const near = await app.inject({
      method: 'POST',
      url: '/places/nearby',
      payload: { companyId: acme, location: { lat: 54.951, lon: -2.2 }, radiusM: 2000 },
      ...asDriver(PAT),
    });
    expect(near.json<{ places: unknown[] }>().places).toHaveLength(1);
    const refused = await app.inject({
      method: 'POST',
      url: '/places/list',
      payload: { companyId: acme },
      ...asDriver(LEE),
    });
    expect(refused.statusCode).toBe(403);
  });

  it('lets a colleague improve the note, and only the marker take it back', async () => {
    const { app } = buildApp();
    await app.inject({ method: 'POST', url: '/places', payload: body, ...asDriver(PAT) });
    const put = await app.inject({
      method: 'PUT',
      url: `/places/${placeId}`,
      payload: { note: 'Ask at the house' },
      ...asDriver(PAT),
    });
    expect(put.json()).toMatchObject({ note: 'Ask at the house' });
    expect(
      (await app.inject({ method: 'DELETE', url: `/places/${placeId}`, ...asDriver(LEE) }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/places/${placeId}`, ...asDriver(PAT) }))
        .statusCode,
    ).toBe(204);
  });
});

describe('the staff door: /staff/places', () => {
  it('lets any staff of the company list, and a WagonWise admin too', async () => {
    const { app } = buildApp();
    await app.inject({ method: 'POST', url: '/places', payload: body, ...asDriver(PAT) });
    for (const who of ['viewer', 'dispatcher', 'admin']) {
      const response = await app.inject({
        method: 'GET',
        url: `/staff/places/companies/${acme}/places`,
        ...asStaff(who),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ places: unknown[] }>().places).toHaveLength(1);
    }
  });

  it('403s a viewer who tries to change one, and lets a dispatcher edit and delete', async () => {
    const { app } = buildApp();
    await app.inject({ method: 'POST', url: '/places', payload: body, ...asDriver(PAT) });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/staff/places/${placeId}`,
          payload: { name: 'X' },
          ...asStaff('viewer'),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/staff/places/${placeId}`,
          payload: { name: 'Smith Farm (north gate)' },
          ...asStaff('dispatcher'),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/staff/places/${placeId}`,
          ...asStaff('dispatcher'),
        })
      ).statusCode,
    ).toBe(204);
  });

  it('401s with no staff token and 403s an unknown account', async () => {
    const { app } = buildApp();
    expect(
      (await app.inject({ method: 'GET', url: `/staff/places/companies/${acme}/places` }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/staff/places/companies/${acme}/places`,
          ...asStaff('nobody'),
        })
      ).statusCode,
    ).toBe(403);
  });
});
