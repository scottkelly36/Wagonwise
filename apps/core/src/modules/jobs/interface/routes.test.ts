import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Caller } from '../application/ports/caller-directory.js';
import { InMemoryJobRepository } from '../application/testing/in-memory-job-repository.js';
import { StubCallerDirectory } from '../application/testing/stub-caller-directory.js';
import type { StaffId } from '../domain/job.js';
import { registerJobsRoutes, type JobsRouteDeps } from './routes.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const STAFF_HEADER = 'x-test-staff-id';
const stops = [
  { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
];

const ADMIN_ID = makeId<'StaffId'>('admin');
const DISPATCHER_ID = makeId<'StaffId'>('dispatcher'); // companyA, dispatch
const VIEWER_ID = makeId<'StaffId'>('viewer'); // companyA, no privilege
const OUTSIDER_ID = makeId<'StaffId'>('outsider'); // companyB, dispatch

function buildApp(): {
  app: FastifyInstance;
  repo: InMemoryJobRepository;
  scopes: RecordingDataScopes;
} {
  const repo = new InMemoryJobRepository();
  const scopes = new RecordingDataScopes();
  const callers = new Map<StaffId, Caller>([
    [ADMIN_ID, { kind: 'platform' }],
    [
      DISPATCHER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: ['dispatch'] },
    ],
    [VIEWER_ID, { kind: 'fleet', companyId: makeId<'CompanyId'>(companyA), privileges: [] }],
    [
      OUTSIDER_ID,
      { kind: 'fleet', companyId: makeId<'CompanyId'>(companyB), privileges: ['dispatch'] },
    ],
  ]);
  const deps: JobsRouteDeps = {
    createJob: { repo, ids: new SequentialIdGenerator(), clock: new FakeClock() },
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
  registerJobsRoutes(app, deps);
  return { app, repo, scopes };
}

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
}

describe('POST /staff/jobs/companies/:companyId/jobs', () => {
  it('201s for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      companyId: companyA,
      reference: 'JOB-1',
      status: 'draft',
    });
  });

  it('201s for a dispatcher in their own company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(DISPATCHER_ID),
    });
    expect(response.statusCode).toBe(201);
  });

  it('403s staff without the dispatch privilege', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(VIEWER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('403s a dispatcher from a different company', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(OUTSIDER_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { nonsense: true },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s stops with no delivery', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops: [stops[0]] },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ tag: 'InvalidStops', reason: 'no_delivery' });
  });

  it("runs inside the caller's company scope (P2-M1.7)", async () => {
    const { app, scopes } = buildApp();
    await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${companyA}/jobs`,
      payload: { companyId: companyA, reference: 'JOB-1', stops },
      ...asStaff(DISPATCHER_ID),
    });
    expect(scopes.used).toEqual([{ kind: 'company', companyId: companyA }]);
  });
});
