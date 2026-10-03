import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerDashboardRoutes } from './dashboard-routes.js';
import { FakeCoreClient, FakeStaffTokenVerifier } from './testing/fakes.js';

const STAFF_TOKEN = 'a-staff-token';
const AUTH = { authorization: `Bearer ${STAFF_TOKEN}` };
const ACME = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const DIMENSIONS = { heightM: 4, widthM: 2.5, lengthM: 16, grossWeightT: 44 };
const VEHICLE = { name: 'Unit 1', dimensions: DIMENSIONS };
const PICKUP = { kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } };
const DELIVERY = { kind: 'delivery', name: 'Site', location: { lat: 55.0, lon: -1.9 } };
const JOB = { companyId: ACME, reference: 'J-1', stops: [PICKUP, DELIVERY] };

function buildApp(): { app: FastifyInstance; core: FakeCoreClient } {
  const core = new FakeCoreClient();
  const verifier = new FakeStaffTokenVerifier();
  verifier.claimsByToken.set(STAFF_TOKEN, { staffId: ID, sessionId: 'session-1' });
  const app = Fastify();
  registerDashboardRoutes(app, { coreClient: core, staffTokenVerifier: verifier });
  return { app, core };
}

const VALID = [
  ['GET', '/staff/companies', undefined],
  ['POST', '/staff/companies', { id: ACME, name: 'Acme' }],
  ['GET', '/staff/invite-codes', undefined],
  ['POST', '/staff/invite-codes', undefined],
  ['GET', '/staff/hazard-reports', undefined],
  ['DELETE', `/staff/hazard-reports/${ID}`, undefined],
  ['GET', `/staff/fleet/companies/${ACME}/vehicles`, undefined],
  ['POST', `/staff/fleet/companies/${ACME}/vehicles`, { ...VEHICLE, companyId: ACME }],
  ['PUT', `/staff/fleet/vehicles/${ID}`, VEHICLE],
  ['DELETE', `/staff/fleet/vehicles/${ID}`, undefined],
  ['GET', `/staff/fleet/companies/${ACME}/driver-links`, undefined],
  ['POST', `/staff/fleet/companies/${ACME}/driver-links`, { identifier: 'pat@example.com' }],
  ['POST', `/staff/fleet/driver-links/${ID}/approve`, undefined],
  ['POST', `/staff/fleet/driver-links/${ID}/decline`, undefined],
  ['POST', `/staff/fleet/driver-links/${ID}/remove`, undefined],
  ['GET', `/staff/fleet/companies/${ACME}/code`, undefined],
  ['POST', `/staff/fleet/companies/${ACME}/code/regenerate`, undefined],
  ['GET', `/staff/jobs/companies/${ACME}/jobs`, undefined],
  ['POST', `/staff/jobs/companies/${ACME}/jobs`, JOB],
  ['GET', `/staff/jobs/companies/${ACME}/positions`, undefined],
  ['GET', '/staff/hazard-reports/moderation-queue', undefined],
  ['POST', `/staff/hazard-reports/${ID}/moderate`, { action: 'reject' }],
  ['GET', `/staff/hazard-reports/${ID}/decisions`, undefined],
  ['GET', `/staff/jobs/companies/${ACME}/etas`, undefined],
  ['GET', `/staff/jobs/${ID}`, undefined],
  ['GET', `/staff/jobs/${ID}/proof-of-delivery`, undefined],
  ['POST', `/staff/jobs/${ID}/route-preview`, { vehicleId: 'vehicle-1' }],
  ['POST', `/staff/jobs/${ID}/assign`, { driverId: 'driver-1', vehicleId: 'vehicle-1' }],
  ['POST', `/staff/jobs/${ID}/cancel`, undefined],
] as const;

describe('the moved dashboard pages (P2-M1.12c)', () => {
  it.each(VALID)(
    '%s %s forwards to the same core path with the token, relaying core as it is',
    async (method, url, payload) => {
      const { app, core } = buildApp();
      core.nextResponse = { status: 403, body: { tag: 'Forbidden', requestId: 'x' } };

      const res = await app.inject({
        method,
        url,
        headers: AUTH,
        ...(payload === undefined ? {} : { payload }),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ tag: 'Forbidden', requestId: 'x' });
      expect(core.calls).toHaveLength(1);
      expect(core.calls[0]).toMatchObject({
        method,
        path: url,
        authorization: `Bearer ${STAFF_TOKEN}`,
      });
      if (payload !== undefined) expect(core.calls[0]?.body).toEqual(payload);
    },
  );

  it.each(VALID)(
    '%s %s 401s without a valid staff token, never calling core',
    async (method, url) => {
      const { app, core } = buildApp();
      const missing = await app.inject({ method, url });
      expect(missing.statusCode).toBe(401);
      const forged = await app.inject({ method, url, headers: { authorization: 'Bearer forged' } });
      expect(forged.statusCode).toBe(401);
      expect(core.calls).toEqual([]);
    },
  );

  it.each([
    ['DELETE', '/staff/hazard-reports/1', undefined],
    ['GET', '/staff/fleet/companies/acme/vehicles', undefined],
    ['POST', `/staff/fleet/companies/${ACME}/vehicles`, { companyId: ACME, name: 'No sizes' }],
    ['POST', `/staff/fleet/companies/${ACME}/driver-links`, { identifier: '' }],
    ['POST', '/staff/fleet/driver-links/not-a-uuid/approve', undefined],
    [
      'PUT',
      `/staff/fleet/vehicles/${ID}`,
      { ...VEHICLE, dimensions: { ...DIMENSIONS, heightM: -1 } },
    ],
    ['POST', '/staff/companies', { name: 'No id' }],
    ['GET', '/staff/jobs/companies/acme/jobs', undefined],
    ['POST', `/staff/jobs/companies/${ACME}/jobs`, { ...JOB, stops: [] }],
    ['POST', '/staff/jobs/not-a-uuid/assign', undefined],
  ] as const)('%s %s 400s a bad id or body without calling core', async (method, url, payload) => {
    const { app, core } = buildApp();
    const res = await app.inject({
      method,
      url,
      headers: AUTH,
      ...(payload === undefined ? {} : { payload }),
    });
    expect(res.statusCode).toBe(400);
    expect(core.calls).toEqual([]);
  });
});
