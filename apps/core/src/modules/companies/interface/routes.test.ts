import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryCompanyRepository } from '../application/testing/in-memory-company-repository.js';
import { StubAdminDirectory } from '../application/testing/stub-admin-directory.js';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './routes.js';

const ADMIN_DRIVER_ID = makeId<'DriverId'>('admin-driver');
const DRIVER_HEADER = 'x-test-driver-id';

function buildApp(): { app: FastifyInstance; repo: InMemoryCompanyRepository } {
  const repo = new InMemoryCompanyRepository();
  const clock = new FakeClock();
  const admins = new StubAdminDirectory(new Set([ADMIN_DRIVER_ID]));
  const deps: CompaniesRouteDeps = {
    createCompany: { repo, clock, admins },
    listCompanies: { repo, admins },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
  registerCompaniesRoutes(app, deps);
  return { app, repo };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /companies', () => {
  it('201s and returns the created company for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Acme Haulage' });
  });

  it('403s a non-admin driver, creating nothing', async () => {
    const { app, repo } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });
    expect(await repo.findAll()).toEqual([]);
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('400s an empty name for an admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: '' },
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /companies', () => {
  it('200s with every created company for an admin', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Haulage' },
      ...asDriver(ADMIN_DRIVER_ID),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      ...asDriver(ADMIN_DRIVER_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ companies: [{ name: 'Acme Haulage' }] });
  });

  it('403s a non-admin driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(403);
  });
});
