import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffCaller } from '../application/ports.js';
import { InMemorySosRepository } from '../application/testing/in-memory-sos-repository.js';
import { registerSosRoutes } from './routes.js';

const acme = '11111111-1111-4111-8111-111111111111';
const beta = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
const DRIVER_HEADER = 'x-test-driver-id';
const STAFF_HEADER = 'x-test-staff-id';

const staff: Record<string, StaffCaller> = {
  dispatcher: { kind: 'fleet', companyId: makeId<'CompanyId'>(acme), privileges: ['dispatch'] },
  viewer: { kind: 'fleet', companyId: makeId<'CompanyId'>(acme), privileges: [] },
  other: { kind: 'fleet', companyId: makeId<'CompanyId'>(beta), privileges: ['dispatch'] },
  admin: { kind: 'platform' },
};

function buildApp(options: { linked?: boolean } = {}) {
  const scopes = new RecordingDataScopes();
  const sent: { to: string; subject: string }[] = [];
  const app: FastifyInstance = Fastify();
  app.addHook('onRequest', (req, _reply, done) => {
    const driver = req.headers[DRIVER_HEADER];
    const staffId = req.headers[STAFF_HEADER];
    if (typeof driver === 'string') req.driverId = driver;
    if (typeof staffId === 'string') req.staffId = staffId;
    done();
  });
  registerSosRoutes(app, {
    sos: {
      repo: new InMemorySosRepository(),
      clock: new FakeClock('2026-10-25T10:00:00.000Z'),
      ids: new SequentialIdGenerator(),
      situations: {
        forDriver: () =>
          Promise.resolve({
            name: 'Pat Smith',
            contact: '+447700900123',
            companies:
              options.linked === false
                ? []
                : [{ id: makeId<'CompanyId'>(acme), name: 'Acme Haulage', jobReference: 'JOB-77' }],
          }),
      },
      words: {
        wordsFor: () => Promise.resolve({ words: 'filled.count.soap', nearestPlace: 'Hexham' }),
      },
    },
    mail: {
      contacts: {
        forCompany: () =>
          Promise.resolve([{ name: 'Dee', email: 'dee@acme.test', privileges: ['dispatch'] }]),
      },
      mailer: {
        send: (to, subject) => {
          sent.push({ to, subject });
          return Promise.resolve();
        },
      },
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    identities: { getIdentifier: (id) => Promise.resolve(`${id}@example.com`) },
    dataScopes: scopes,
  });
  return { app, scopes, sent };
}

const driver = { headers: { [DRIVER_HEADER]: 'driver-pat' } };
const asStaff = (id: string) => ({ headers: { [STAFF_HEADER]: id } });
const body = { requestId: request, location: { lat: 54.97, lon: -2.1 } };

describe('POST /sos/raise', () => {
  it('tells the company, emails the office after the driver’s scope has closed, and answers with the words and who was told', async () => {
    const { app, scopes, sent } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/sos/raise',
      payload: body,
      ...driver,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      requestId: request,
      location: { lat: 54.97, lon: -2.1 },
      words: 'filled.count.soap',
      nearestPlace: 'Hexham',
      notified: [{ companyId: acme, name: 'Acme Haulage' }],
    });
    expect(scopes.used).toContainEqual({
      kind: 'driver',
      driverId: 'driver-pat',
      identifier: 'driver-pat@example.com',
    });
    expect(sent).toEqual([{ to: 'dee@acme.test', subject: 'SOS: Pat Smith' }]);
  });

  it('says nobody was told for a driver with no company, and sends no email', async () => {
    const { app, sent } = buildApp({ linked: false });
    const response = await app.inject({
      method: 'POST',
      url: '/sos/raise',
      payload: body,
      ...driver,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ words: 'filled.count.soap', notified: [] });
    expect(sent).toEqual([]);
  });

  it('does not email twice when the app retries the same press', async () => {
    const { app, sent } = buildApp();
    await app.inject({ method: 'POST', url: '/sos/raise', payload: body, ...driver });
    const again = await app.inject({ method: 'POST', url: '/sos/raise', payload: body, ...driver });
    expect(again.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('401s with no signed-in driver and 400s a bad body', async () => {
    const { app } = buildApp();
    expect(
      (await app.inject({ method: 'POST', url: '/sos/raise', payload: body })).statusCode,
    ).toBe(401);
    for (const payload of [
      {},
      { requestId: 'x', location: body.location },
      { requestId: request, location: { lat: 200, lon: 0 } },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/sos/raise', payload, ...driver })).statusCode,
      ).toBe(400);
    }
  });
});

describe('POST /sos/cancel', () => {
  it('cancels and tells the office, and 401s with no driver', async () => {
    const { app, sent } = buildApp();
    await app.inject({ method: 'POST', url: '/sos/raise', payload: body, ...driver });
    const response = await app.inject({
      method: 'POST',
      url: '/sos/cancel',
      payload: { requestId: request },
      ...driver,
    });
    expect(response.statusCode).toBe(204);
    expect(sent.map((m) => m.subject)).toEqual(['SOS: Pat Smith', 'SOS cancelled: Pat Smith']);
    expect(
      (await app.inject({ method: 'POST', url: '/sos/cancel', payload: { requestId: request } }))
        .statusCode,
    ).toBe(401);
  });
});

describe('the office: /staff/sos', () => {
  async function withAnAlert() {
    const built = buildApp();
    await built.app.inject({ method: 'POST', url: '/sos/raise', payload: body, ...driver });
    return built;
  }

  it('lists the company’s open alerts with what the office was told, in the company’s scope', async () => {
    const { app, scopes } = await withAnAlert();
    const response = await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('viewer') });
    expect(response.statusCode).toBe(200);
    const { alerts } = response.json<{ alerts: Record<string, unknown>[] }>();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      status: 'open',
      driverName: 'Pat Smith',
      driverContact: '+447700900123',
      jobReference: 'JOB-77',
      words: 'filled.count.soap',
    });
    expect(scopes.used).toContainEqual({ kind: 'company', companyId: acme });
    // Another company sees none of it; WagonWise staff have no company here.
    const theirs = await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('other') });
    expect(theirs.json()).toEqual({ alerts: [] });
    expect(
      (await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('admin') })).statusCode,
    ).toBe(403);
  });

  it('lets a dispatcher mark it dealt with (204), refuses a viewer (403) and another company (404)', async () => {
    const { app } = await withAnAlert();
    const list = await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('viewer') });
    const id = list.json<{ alerts: { id: string }[] }>().alerts[0]!.id;
    const resolve = (who: string) =>
      app.inject({ method: 'POST', url: `/staff/sos/${id}/resolve`, ...asStaff(who) });
    expect((await resolve('viewer')).statusCode).toBe(403);
    expect((await resolve('other')).statusCode).toBe(404);
    expect((await resolve('dispatcher')).statusCode).toBe(204);
    const open = await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('viewer') });
    expect(open.json()).toEqual({ alerts: [] });
    const all = await app.inject({
      method: 'GET',
      url: '/staff/sos?status=all',
      ...asStaff('viewer'),
    });
    expect(all.json<{ alerts: { status: string }[] }>().alerts[0]?.status).toBe('resolved');
  });

  it('401s with no staff account and 403s an unknown one', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'GET', url: '/staff/sos' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/staff/sos', ...asStaff('nobody') })).statusCode,
    ).toBe(403);
  });
});
