import type { Clock } from '../../../shared/ports/clock.js';
import type { Company, CompanyId } from '../domain/company.js';
import type { CompanyRepository } from './ports/company-repository.js';

export interface CreateCompanyDeps {
  readonly repo: Pick<CompanyRepository, 'save'>;
  readonly clock: Clock;
}

export interface CreateCompanyInput {
  readonly id: CompanyId;
  readonly name: string;
}

/** No `Result`/error type — unlike hazards' or congestion's own report use cases, there is no
 *  domain rule beyond "the name isn't blank," already enforced by contracts'
 *  `createCompanyRequestSchema` before this ever runs. Not idempotent on `id` the way a driver's
 *  own report is (decision 62's offline-queue reasoning) — an admin creating the same company
 *  twice by mistake just gets two rows; nothing here needs to detect or merge that yet. */
export async function createCompany(
  deps: CreateCompanyDeps,
  input: CreateCompanyInput,
): Promise<Company> {
  const company: Company = {
    id: input.id,
    name: input.name,
    createdAt: deps.clock.now(),
  };
  await deps.repo.save(company);
  return company;
}
