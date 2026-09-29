import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { StubAdminDirectory } from './testing/stub-admin-directory.js';
import { createCompany } from './create-company.js';
import { listCompanies } from './list-companies.js';

const ADMIN = makeId<'StaffId'>('admin');
const DRIVER = makeId<'StaffId'>('fleet-user');

function setUp() {
  return {
    repo: new InMemoryCompanyRepository(),
    clock: new FakeClock(),
    admins: new StubAdminDirectory(new Set([ADMIN])),
  };
}

describe('createCompany', () => {
  it('creates and persists a company for an admin', async () => {
    const deps = setUp();
    const result = await createCompany(deps, {
      callerId: ADMIN,
      id: makeId<'CompanyId'>('company-1'),
      name: 'Acme Haulage',
    });

    const company = {
      id: makeId<'CompanyId'>('company-1'),
      name: 'Acme Haulage',
      createdAt: deps.clock.now(),
    };
    expect(result).toEqual({ ok: true, value: company });
    expect(await deps.repo.findAll()).toEqual([company]);
  });

  it('refuses a non-admin, creating nothing', async () => {
    const deps = setUp();
    const result = await createCompany(deps, {
      callerId: DRIVER,
      id: makeId<'CompanyId'>('company-1'),
      name: 'Acme Haulage',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect(await deps.repo.findAll()).toEqual([]);
  });
});

describe('listCompanies', () => {
  it('lists every company for an admin, and refuses anyone else', async () => {
    const deps = setUp();
    await createCompany(deps, { callerId: ADMIN, id: makeId<'CompanyId'>('c-1'), name: 'Acme' });

    const forAdmin = await listCompanies(deps, { callerId: ADMIN });
    expect(forAdmin.ok && forAdmin.value.map((c) => c.name)).toEqual(['Acme']);
    expect(await listCompanies(deps, { callerId: DRIVER })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
