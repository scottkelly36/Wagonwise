import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryCompanyRepository } from '../application/testing/in-memory-company-repository.js';
import { StubAdminDirectory } from '../application/testing/stub-admin-directory.js';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './routes.js';

const ADMIN_STAFF_ID = makeId<'StaffId'>('admin-staff');
const STAFF_HEADER = 'x-test-staff-id';

function buildApp(): { app: FastifyInstance; repo: InMemoryCompanyRepository } {
  const repo = new InMemoryCompanyRepository();
  const clock = new FakeClock();
  const admins = new StubAdminDirectory(new Set([ADMIN_STAFF_ID]));
  const deps: CompaniesRouteDeps = {
    createCompany: { repo, clock, admins },
    listCompanies: { repo, admins },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
    }
    done();
  });
  registerCompaniesRoutes(app, deps);
  return { app, repo };
}

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
}

describe('POST /staff/companies', () => {
  it('201s and returns the created company for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Acme Haulage' });
  });

  it('403s a staff member who is not a WagonWise admin, creating nothing', async () => {
    const { app, repo } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asStaff('fleet-user-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });
    expect(await repo.findAll()).toEqual([]);
  });

  it('401s with no signed-in staff member', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s an empty name for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: '' },
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /staff/companies', () => {
  it('200s with every created company for an admin', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asStaff(ADMIN_STAFF_ID),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/staff/companies',
      ...asStaff(ADMIN_STAFF_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ companies: [{ name: 'Acme Haulage' }] });
  });

  it('403s a staff member who is not a WagonWise admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/staff/companies',
      ...asStaff('fleet-user-1'),
    });
    expect(response.statusCode).toBe(403);
  });
});
