import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import type { StaffCaller } from '../application/ports/directories.js';
import { InMemoryBillingDetailsRepository } from '../application/testing/in-memory-billing-details-repository.js';
import { registerBillingRoutes } from './routes.js';

const STAFF_HEADER = 'x-test-staff-id';

const staff: Record<string, StaffCaller> = {
  admin: { kind: 'platform' },
  manager: {
    kind: 'fleet',
    companyId: '11111111-1111-4111-8111-111111111111',
    privileges: ['manage_users', 'dispatch', 'view_reports'],
  },
};

function buildApp(): { app: FastifyInstance; scopes: RecordingDataScopes } {
  const scopes = new RecordingDataScopes();
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') request.staffId = staffId;
    done();
  });
  registerBillingRoutes(app, {
    billing: {
      repo: new InMemoryBillingDetailsRepository(),
      clock: new FakeClock('2026-10-09T09:00:00.000Z'),
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    dataScopes: scopes,
  });
  return { app, scopes };
}

const as = (id: string) => ({ headers: { [STAFF_HEADER]: id } });
const real = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

describe('/staff/billing/details', () => {
  it('shows an admin the details, in the platform scope, with every placeholder named', async () => {
    const { app, scopes } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/staff/billing/details',
      ...as('admin'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ placeholders: string[] }>().placeholders).toHaveLength(6);
    expect(scopes.used).toEqual([{ kind: 'platform' }]);
  });

  it('lets an admin save, and then reports no placeholders', async () => {
    const { app } = buildApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('admin'),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ ...real, placeholders: [] });
    const get = await app.inject({ method: 'GET', url: '/staff/billing/details', ...as('admin') });
    expect(get.json()).toMatchObject({ tradingName: 'WagonWise Ltd', placeholders: [] });
  });

  it('refuses a company manager for reading and writing, without opening any data scope', async () => {
    const { app, scopes } = buildApp();
    const get = await app.inject({
      method: 'GET',
      url: '/staff/billing/details',
      ...as('manager'),
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('manager'),
    });
    expect(get.statusCode).toBe(403);
    expect(put.statusCode).toBe(403);
    expect(scopes.used).toEqual([]);
  });

  it('401s with no staff token and 403s an unknown account', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'GET', url: '/staff/billing/details' })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/staff/billing/details', ...as('nobody') }))
        .statusCode,
    ).toBe(403);
  });

  it('400s a body with a missing or empty field', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: { ...real, address: '' },
      ...as('admin'),
    });
    expect(response.statusCode).toBe(400);
  });
});
