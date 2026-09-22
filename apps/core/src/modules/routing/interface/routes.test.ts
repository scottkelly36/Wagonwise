import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryVehicleProfileRepository } from '../application/testing/in-memory-vehicle-profile-repository.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './routes.js';

const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

function buildApp(): { app: FastifyInstance; deps: RoutingRouteDeps } {
  const repo = new InMemoryVehicleProfileRepository();
  const ids = new SequentialIdGenerator();
  const deps: RoutingRouteDeps = {
    createVehicleProfile: { repo, ids },
    updateVehicleProfile: { repo },
    deleteVehicleProfile: { repo },
    getVehicleProfile: { repo },
    listVehicleProfiles: { repo },
  };
  const app = Fastify();
  registerRoutingRoutes(app, deps);
  return { app, deps };
}

describe('POST /routing/vehicle-profiles', () => {
  let app: FastifyInstance;
  beforeEach(() => ({ app } = buildApp()));

  it('201s and returns the created profile', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Big Wagon', dimensions },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ driverId: 'driver-1', name: 'Big Wagon', dimensions });
  });

  it('400s a malformed body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { nonsense: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s invalid dimensions caught by the zod schema before the use case runs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: {
        driverId: 'driver-1',
        name: 'Big Wagon',
        dimensions: { ...dimensions, heightM: 0 },
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /routing/vehicle-profiles', () => {
  it('200s the list scoped to the given driverId', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Mine', dimensions },
    });
    await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-2', name: 'Someone else’s', dimensions },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles?driverId=driver-1',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ name: string }[]>();
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe('Mine');
  });

  it('400s a missing driverId', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/routing/vehicle-profiles' });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /routing/vehicle-profiles/:id', () => {
  it('200s the profile for its owner', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Big Wagon', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: `/routing/vehicle-profiles/${id}?driverId=driver-1`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Big Wagon' });
  });

  it('404s when the driverId does not match the owner', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Big Wagon', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: `/routing/vehicle-profiles/${id}?driverId=driver-2`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'VehicleProfileNotFound' });
  });

  it('400s a non-UUID id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles/not-a-uuid?driverId=driver-1',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /routing/vehicle-profiles/:id', () => {
  it('200s and returns the updated profile', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Original', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'PUT',
      url: `/routing/vehicle-profiles/${id}`,
      payload: {
        driverId: 'driver-1',
        name: 'Renamed',
        dimensions: { ...dimensions, heightM: 3.9 },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Renamed' });
  });

  it('404s when updating a profile owned by a different driver', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Original', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'PUT',
      url: `/routing/vehicle-profiles/${id}`,
      payload: { driverId: 'driver-2', name: 'Renamed', dimensions },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /routing/vehicle-profiles/:id', () => {
  it('204s and the profile is gone', async () => {
    const { app, deps } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Big Wagon', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/routing/vehicle-profiles/${id}?driverId=driver-1`,
    });
    expect(response.statusCode).toBe(204);
    expect(await deps.getVehicleProfile.repo.findById(makeId<'VehicleProfileId'>(id))).toBeNull();
  });

  it('404s when deleting a profile owned by a different driver', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { driverId: 'driver-1', name: 'Big Wagon', dimensions },
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/routing/vehicle-profiles/${id}?driverId=driver-2`,
    });
    expect(response.statusCode).toBe(404);
  });
});
