import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { createCompany } from './create-company.js';

describe('createCompany', () => {
  it('creates and persists a company', async () => {
    const repo = new InMemoryCompanyRepository();
    const clock = new FakeClock();
    const company = await createCompany(
      { repo, clock },
      { id: makeId<'CompanyId'>('company-1'), name: 'Acme Haulage' },
    );

    expect(company).toEqual({
      id: makeId<'CompanyId'>('company-1'),
      name: 'Acme Haulage',
      createdAt: clock.now(),
    });
    expect(await repo.findAll()).toEqual([company]);
  });
});
