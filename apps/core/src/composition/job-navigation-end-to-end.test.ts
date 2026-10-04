import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { AccessTokenClaims, AccessTokenVerifier } from '../host/access-token-verifier.js';
import { createPool } from '../platform/db.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { composeCore, type Core } from './compose-core.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const fakeTokenSigner = {
  signAccessToken: () => Promise.resolve('unused-in-this-test'),
  signStaffAccessToken: () => Promise.resolve('unused-in-this-test'),
  publicJwk: () => Promise.resolve({ kty: 'OKP', crv: 'Ed25519', x: 'fake' }),
};

class MapAccessTokenVerifier implements AccessTokenVerifier {
  #claimsByToken = new Map<string, AccessTokenClaims>();

  register(token: string, driverId: string): void {
    this.#claimsByToken.set(token, { driverId, sessionId: `session-${driverId}` });
  }

  verify(token: string): Promise<AccessTokenClaims> {
    const claims = this.#claimsByToken.get(token);
    if (!claims) return Promise.reject(new Error('unknown test token'));
    return Promise.resolve(claims);
  }
}

// A one-point-per-step polyline6, enough for the route plan to be accepted.
function encodeValue(raw: number): string {
  let value = raw < 0 ? ~(raw << 1) : raw << 1;
  let output = '';
  while (value >= 0x20) {
    output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return output + String.fromCharCode(value + 63);
}
function encodePolyline(points: { lat: number; lon: number }[]): string {
  let output = '';
  let prevLat = 0;
  let prevLon = 0;
  for (const { lat, lon } of points) {
    const lat6 = Math.round(lat * 1e6);
    const lon6 = Math.round(lon * 1e6);
    output += encodeValue(lat6 - prevLat) + encodeValue(lon6 - prevLon);
    prevLat = lat6;
    prevLon = lon6;
  }
  return output;
}
const ROUTE = encodePolyline([
  { lat: 54.9, lon: -2.1 },
  { lat: 54.94, lon: -2.1 },
]);

const INTERNAL = { 'x-internal-key': 'local-dev-internal-key' };
const ACME = '11111111-1111-4111-8111-111111111111';
const VEHICLE = 'a0000000-0000-4000-8000-000000000001';
const JOB = 'b0000000-0000-4000-8000-000000000001';

/**
 * "Start" on a job (the driver app's automatic navigation): the driver is given a routing profile
 * built from the company vehicle the job is assigned to, and can plan a route with it. Through
 * `composeCore` as production wires it, connecting as the restricted `wagonwise_app` role so Row-
 * Level Security is in force, with only Valhalla faked. The point is the wiring between jobs, fleet
 * and routing, which no module's own tests cover.
 */
describe('job navigation profile — end to end', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let valhalla: Server;
  let valhallaUrl: string;
  let appUrl: string;
  let core: Core | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = createPool(container.getConnectionUri());
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appUrl = url.toString();

    valhalla = createServer((request, response) => {
      request.on('data', () => undefined);
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            trip: { summary: { time: 300, length: 4.4 }, legs: [{ shape: ROUTE }] },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => valhalla.listen(0, '127.0.0.1', resolve));
    const address = valhalla.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    valhallaUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    await ownerPool.end();
    await container.stop();
    await new Promise<void>((resolve, reject) => {
      valhalla.close((error) => (error ? reject(error) : resolve()));
    });
  });

  afterEach(async () => {
    await core?.close();
    core = undefined;
    await ownerPool.query('delete from routing.route_plans');
    await ownerPool.query('delete from routing.vehicle_profiles');
    await ownerPool.query('delete from jobs.jobs');
    await ownerPool.query('delete from fleet.vehicles');
    await ownerPool.query('delete from companies.companies');
    await ownerPool.query('delete from identity.drivers');
  });

  async function seed(status = 'accepted', vehicleId: string | null = VEHICLE) {
    const verifier = new MapAccessTokenVerifier();
    const driverId = randomUUID();
    const otherId = randomUUID();
    verifier.register('driver-token', driverId);
    verifier.register('other-token', otherId);
    for (const [id, who] of [
      [driverId, 'driver'],
      [otherId, 'other'],
    ] as const) {
      await ownerPool.query('insert into identity.drivers (id, identifier) values ($1, $2)', [
        id,
        `${who}-${id}@example.com`,
      ]);
    }
    await ownerPool.query(
      `insert into companies.companies (id, name, created_at) values ($1, 'Acme', now())`,
      [ACME],
    );
    await ownerPool.query(
      `insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
       values ($1, $2, 'Scania R450', 4, 2.55, 16.5, 44)`,
      [VEHICLE, ACME],
    );
    await ownerPool.query(
      `insert into jobs.jobs (id, company_id, reference, status, driver_id, vehicle_id, created_at)
       values ($1, $2, 'JOB-1', $3, $4, $5, now())`,
      [JOB, ACME, status, driverId, vehicleId],
    );
    core = composeCore(
      loadConfig({
        DATABASE_URL: container.getConnectionUri(),
        APP_DATABASE_URL: appUrl,
        VALHALLA_URL: valhallaUrl,
        LOG_LEVEL: 'silent',
      }),
      fakeTokenSigner,
      verifier,
      { clock: new FakeClock('2026-10-04T09:00:00.000Z') },
    );
    return { app: core.app, driverId };
  }

  const as = (token: string) => ({ ...INTERNAL, authorization: `Bearer ${token}` });
  const url = `/jobs/${JOB}/navigation-profile`;

  it('gives the driver a profile with the company vehicle’s measurements, and a route can be planned with it', async () => {
    const { app } = await seed();

    const response = await app.inject({ method: 'POST', url, headers: as('driver-token') });

    expect(response.statusCode).toBe(200);
    const { profileId, vehicleName } = response.json<{ profileId: string; vehicleName: string }>();
    expect(vehicleName).toBe('Scania R450');

    const list = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      headers: as('driver-token'),
    });
    const profiles = list.json<{ id: string; name: string; dimensions: object }[]>();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: profileId,
      name: 'Company: Scania R450',
      dimensions: { heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
    });

    const plan = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: {
        profileId,
        origin: { lat: 54.9, lon: -2.1 },
        destination: { lat: 54.94, lon: -2.1 },
      },
      headers: as('driver-token'),
    });
    expect(plan.statusCode).toBe(201);
  }, 30_000);

  it('is repeatable, and picks up a vehicle the dispatcher corrected since the last start', async () => {
    const { app } = await seed();
    const first = await app.inject({ method: 'POST', url, headers: as('driver-token') });
    await ownerPool.query('update fleet.vehicles set height_m = 4.3 where id = $1', [VEHICLE]);

    const second = await app.inject({ method: 'POST', url, headers: as('driver-token') });

    expect(second.json<{ profileId: string }>().profileId).toBe(
      first.json<{ profileId: string }>().profileId,
    );
    const { rows } = await ownerPool.query<{ height_m: number }>(
      'select height_m from routing.vehicle_profiles',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.height_m).toBe(4.3);
  }, 30_000);

  it('refuses a driver who is not on the job, a job not yet accepted, and a job with no vehicle', async () => {
    const { app } = await seed();
    const other = await app.inject({ method: 'POST', url, headers: as('other-token') });
    expect(other.statusCode).toBe(404);
    await ownerPool.query(`update jobs.jobs set status = 'assigned'`);
    const early = await app.inject({ method: 'POST', url, headers: as('driver-token') });
    expect(early.statusCode).toBe(409);
    await ownerPool.query(`update jobs.jobs set status = 'accepted', vehicle_id = null`);
    const noVehicle = await app.inject({ method: 'POST', url, headers: as('driver-token') });
    expect(noVehicle.statusCode).toBe(409);
    expect(noVehicle.json()).toMatchObject({ tag: 'NoVehicleAssigned' });
    const { rows } = await ownerPool.query('select 1 from routing.vehicle_profiles');
    expect(rows).toHaveLength(0);
  }, 30_000);
});
