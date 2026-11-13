import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createLocalAccessTokenVerifier } from '../host/access-token-verifier.js';
import { createTokenSigner } from '../modules/identity/api.js';
import type { TokenSigner } from '../modules/identity/api.js';
import { createPool } from '../platform/db.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { composeCore, type Core } from './compose-core.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const INTERNAL = { 'x-internal-key': 'local-dev-internal-key' };

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const VEHICLE = 'a0000000-0000-4000-8000-000000000001';

/** A tiny photo: the bytes are only checked for being valid base64 and an allowed type. */
const PHOTO_BASE64 = Buffer.from('not-really-a-jpeg-but-bytes').toString('base64');

const stops = [
  { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
];

/**
 * The path a firm sees in a demo, through the whole of core as `main.ts` builds it: a dispatcher
 * makes a job and assigns a driver and a vehicle, the driver's phone sees it and works it through to
 * a delivery photo, and the office sees where it is and that it is done. Real signed tokens through
 * the real access checks, real Postgres as the restricted `wagonwise_app` role (Row-Level Security
 * on), nothing faked but the route estimate (Valhalla) and the push to the phone. The module tests
 * cover each step alone with a stand-in sign-in; this is the one that breaks if the wiring between
 * the modules, or the token checks in front of them, break.
 */
describe('the demo path, end to end (whole core, real tokens, real RLS)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let valhalla: Server;
  let core: Core;
  let signer: TokenSigner;
  let pushes: { driverId: string; jobId: string }[];

  const staffA = randomUUID();
  const staffB = randomUUID();
  const driverA = randomUUID();
  const driverB = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = createPool(container.getConnectionUri());
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    const appUrl = new URL(container.getConnectionUri());
    appUrl.username = 'wagonwise_app';
    appUrl.password = 'app-password';

    // Valhalla stand-in: every route is five minutes and four kilometres.
    valhalla = createServer((request, response) => {
      request.on('data', () => undefined);
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            trip: { summary: { time: 300, length: 4 }, legs: [{ shape: '_p~iF~ps|U' }] },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => valhalla.listen(0, '127.0.0.1', resolve));
    const address = valhalla.address();
    if (address === null || typeof address === 'string') throw new Error('no address');

    // Two companies; a dispatcher in each; a driver in each, each linked to their own company.
    await ownerPool.query(
      `insert into companies.companies (id, name, created_at) values ($1, 'Acme', now()), ($2, 'Beta', now())`,
      [ACME, BETA],
    );
    for (const [id, company, name] of [
      [staffA, ACME, 'acme'],
      [staffB, BETA, 'beta'],
    ] as const) {
      await ownerPool.query(
        `insert into companies.staff_accounts
           (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
         values ($1, 'fleet', $2, $3, $4, '["dispatch","view_reports","manage_fleet"]'::jsonb, now(), 'x', 'email')`,
        [id, company, `${name}@example.com`, `${name} dispatcher`],
      );
    }
    for (const [id, company, link] of [
      [driverA, ACME, 'f1000000-0000-4000-8000-000000000001'],
      [driverB, BETA, 'f1000000-0000-4000-8000-000000000002'],
    ] as const) {
      await ownerPool.query('insert into identity.drivers (id, identifier) values ($1, $2)', [
        id,
        `driver-${id}@example.com`,
      ]);
      await ownerPool.query(
        `insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
         values ($1, $2, $3, 'active', now(), now())`,
        [link, company, id],
      );
    }
    await ownerPool.query(
      `insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
       values ($1, $2, 'Scania R450', 4, 2.55, 16.5, 44)`,
      [VEHICLE, ACME],
    );

    signer = await createTokenSigner(undefined);
    pushes = [];
    core = composeCore(
      loadConfig({
        DATABASE_URL: container.getConnectionUri(),
        APP_DATABASE_URL: appUrl.toString(),
        VALHALLA_URL: `http://127.0.0.1:${address.port}`,
        LOG_LEVEL: 'silent',
      }),
      signer,
      await createLocalAccessTokenVerifier(await signer.publicJwk()),
      {
        clock: new FakeClock('2026-11-13T09:00:00.000Z'),
        driverNotifier: {
          notify: (driverId, message) => {
            pushes.push({ driverId, jobId: message.data.jobId });
            return Promise.resolve({ devices: 1, accepted: 1 });
          },
        },
      },
    );
  }, 120_000);

  afterAll(async () => {
    await core.close();
    await ownerPool.end();
    await container.stop();
    await new Promise<void>((resolve, reject) => {
      valhalla.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const staffToken = async (staffId: string) =>
    signer.signStaffAccessToken({ staffId, sessionId: randomUUID() });
  const driverToken = async (driverId: string) =>
    signer.signAccessToken({ driverId: driverId as never, sessionId: randomUUID() as never });
  const bearer = (token: string) => ({ ...INTERNAL, authorization: `Bearer ${token}` });

  async function createAndAssign(reference: string) {
    const dispatcher = bearer(await staffToken(staffA));
    const created = await core.app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference, stops, requiresProofOfDelivery: true },
      headers: dispatcher,
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    const assigned = await core.app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: driverA, vehicleId: VEHICLE },
      headers: dispatcher,
    });
    expect(assigned.statusCode).toBe(200);
    return { id, dispatcher };
  }

  it('takes a job from the dispatcher to the driver and through to a delivery photo, and the office sees it done', async () => {
    const { id, dispatcher } = await createAndAssign('DEMO-1');
    const driver = bearer(await driverToken(driverA));

    // The driver's phone was told, and sees the job when it asks.
    expect(pushes).toContainEqual({ driverId: driverA, jobId: id });
    const current = await core.app.inject({ method: 'GET', url: '/jobs/current', headers: driver });
    expect(current.json<{ job: { id: string; status: string } | null }>().job).toMatchObject({
      id,
      status: 'assigned',
    });

    const advance = (status: string) =>
      core.app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status },
        headers: driver,
      });
    for (const status of ['accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery']) {
      expect((await advance(status)).statusCode).toBe(200);
    }

    // The firm asked for a photo, so it cannot be delivered without one.
    expect((await advance('delivered')).statusCode).toBe(409);
    const photo = await core.app.inject({
      method: 'POST',
      url: `/jobs/${id}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: PHOTO_BASE64 },
      headers: driver,
    });
    expect(photo.statusCode).toBe(204);
    const delivered = await advance('delivered');
    expect(delivered.statusCode).toBe(200);
    expect(delivered.json()).toMatchObject({ status: 'delivered' });

    // The office sees it delivered, with every step on the timeline, and can open the photo.
    const seen = await core.app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}`,
      headers: dispatcher,
    });
    expect(seen.json()).toMatchObject({ id, status: 'delivered', driverId: driverA });
    expect(seen.json<{ timeline: { status: string }[] }>().timeline.map((t) => t.status)).toEqual([
      'draft',
      'assigned',
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ]);
    const list = await core.app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      headers: dispatcher,
    });
    expect(list.json<{ jobs: { id: string; status: string }[] }>().jobs).toContainEqual(
      expect.objectContaining({ id, status: 'delivered' }),
    );
    const proof = await core.app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}/proof-of-delivery?stop=1`,
      headers: dispatcher,
    });
    expect(proof.statusCode).toBe(200);
    expect(proof.json()).toMatchObject({ contentType: 'image/jpeg', dataBase64: PHOTO_BASE64 });
  }, 60_000);

  it('shows the office where a driver on the road is, and how long they have to go', async () => {
    const { id, dispatcher } = await createAndAssign('DEMO-LIVE');
    const driver = bearer(await driverToken(driverA));
    const position = { location: { lat: 54.97, lon: -2.0 } };
    const send = () =>
      core.app.inject({
        method: 'POST',
        url: `/jobs/${id}/position`,
        payload: position,
        headers: driver,
      });

    // Nothing is stored until the driver has accepted and is on the way.
    expect((await send()).statusCode).toBe(409);
    for (const status of ['accepted', 'at_pickup', 'loaded', 'en_route']) {
      await core.app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status },
        headers: driver,
      });
    }
    expect((await send()).statusCode).toBe(204);

    const positions = await core.app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/positions`,
      headers: dispatcher,
    });
    expect(
      positions.json<{ positions: { jobId: string }[] }>().positions.map((p) => p.jobId),
    ).toContain(id);
    const etas = await core.app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/etas`,
      headers: dispatcher,
    });
    expect(etas.statusCode).toBe(200);
    expect(etas.json<{ etas: { jobId: string; durationMin: number }[] }>().etas).toContainEqual(
      expect.objectContaining({ jobId: id, durationMin: 5 }),
    );

    // A driver can be on one job at a time: cancel this one so the next test can use the same driver.
    const cancelled = await core.app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/cancel`,
      headers: dispatcher,
    });
    expect(cancelled.statusCode).toBe(200);
  }, 60_000);

  it('keeps every request behind its own kind of token, and one company out of another’s jobs', async () => {
    const { id } = await createAndAssign('DEMO-ACCESS');
    const staffOfA = await staffToken(staffA);
    const staffOfB = await staffToken(staffB);
    const driverOfA = await driverToken(driverA);
    const driverOfB = await driverToken(driverB);
    const get = (url: string, headers: Record<string, string>) =>
      core.app.inject({ method: 'GET', url, headers });

    // No token, a made-up one, and the wrong kind of token are all turned away.
    expect((await get(`/staff/jobs/${id}`, INTERNAL)).statusCode).toBe(401);
    expect((await get(`/staff/jobs/${id}`, bearer('not-a-token'))).statusCode).toBe(401);
    expect((await get(`/staff/jobs/${id}`, bearer(driverOfA))).statusCode).toBe(401);
    expect((await get('/jobs/current', INTERNAL)).statusCode).toBe(401);
    expect((await get('/jobs/current', bearer(staffOfA))).statusCode).toBe(401);
    // And the server's own key is needed as well, so a stolen token alone is not enough.
    expect(
      (await get(`/staff/jobs/${id}`, { authorization: `Bearer ${staffOfA}` })).statusCode,
    ).toBeGreaterThanOrEqual(401);

    // Another company's dispatcher cannot see the job, list the company's jobs or assign it.
    expect((await get(`/staff/jobs/${id}`, bearer(staffOfB))).statusCode).toBe(404);
    expect((await get(`/staff/jobs/companies/${ACME}/jobs`, bearer(staffOfB))).statusCode).toBe(
      403,
    );
    const takeOver = await core.app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: driverB, vehicleId: VEHICLE },
      headers: bearer(staffOfB),
    });
    expect(takeOver.statusCode).toBeGreaterThanOrEqual(403);

    // Another company's driver finds no job of theirs, and cannot move this one.
    const theirs = await get('/jobs/current', bearer(driverOfB));
    expect(theirs.json()).toEqual({ job: null });
    const move = await core.app.inject({
      method: 'POST',
      url: `/jobs/${id}/status`,
      payload: { status: 'accepted' },
      headers: bearer(driverOfB),
    });
    expect(move.statusCode).toBe(404);

    // The job is untouched by all of that.
    const still = await get(`/staff/jobs/${id}`, bearer(staffOfA));
    expect(still.json()).toMatchObject({ status: 'assigned', driverId: driverA });
    // Free the driver for the next test.
    await core.app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/cancel`,
      headers: bearer(staffOfA),
    });
  }, 60_000);

  it('turns a walk-round check with a defect into a defect the office can see and work through', async () => {
    const dispatcher = bearer(await staffToken(staffA));
    const list = {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'Tractor unit',
      appliesTo: 'all',
      vehicleIds: [],
      items: [
        {
          id: 'tyres',
          kind: 'pass_fail',
          label: 'Tyres',
          required: true,
          severity: 'do_not_drive',
          photoOnDefect: false,
        },
        { id: 'notes', kind: 'note', label: 'Anything else?', required: false },
      ],
    };
    const built = await core.app.inject({
      method: 'POST',
      url: `/staff/checks/companies/${ACME}/templates`,
      payload: list,
      headers: dispatcher,
    });
    expect(built.statusCode).toBe(201);

    // The driver has to be on a job with the vehicle before the app offers its check.
    await createAndAssign('DEMO-CHECK');
    const driver = bearer(await driverToken(driverA));
    const filed = await core.app.inject({
      method: 'POST',
      url: '/checks',
      payload: {
        id: 'cccccccc-0000-4000-8000-000000000001',
        templateId: list.id,
        vehicleId: VEHICLE,
        answers: [{ itemId: 'tyres', value: 'defect', note: 'Nearside front is bald' }],
      },
      headers: driver,
    });
    expect(filed.statusCode).toBeLessThan(300);

    // The office sees the defect, with the driver's note, and works it to fixed.
    const defects = (status = '') =>
      core.app.inject({
        method: 'GET',
        url: `/staff/checks/companies/${ACME}/defects${status}`,
        headers: dispatcher,
      });
    const open = (await defects()).json<{ defects: { id: string; status: string }[] }>().defects;
    expect(open).toHaveLength(1);
    expect(JSON.stringify(open[0])).toContain('Nearside front is bald');
    const id = open[0]?.id as string;
    for (const status of ['acknowledged', 'fixed']) {
      const moved = await core.app.inject({
        method: 'PUT',
        url: `/staff/checks/defects/${id}/status`,
        payload: { status },
        headers: dispatcher,
      });
      expect(moved.statusCode).toBe(200);
    }
    expect((await defects()).json<{ defects: unknown[] }>().defects).toHaveLength(0);
    expect((await defects('?status=fixed')).json<{ defects: unknown[] }>().defects).toHaveLength(1);

    // Another company's office sees none of it.
    const rival = await core.app.inject({
      method: 'GET',
      url: `/staff/checks/companies/${ACME}/defects`,
      headers: bearer(await staffToken(staffB)),
    });
    expect(rival.statusCode).toBe(403);
  }, 60_000);
});
