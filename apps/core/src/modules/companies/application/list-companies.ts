import { ok, type Result } from '../../../shared/result.js';
import type { AccountState } from '../domain/account-state.js';
import type { Company } from '../domain/company.js';
import type { StaffId } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import { requireCompanyAdmin } from './company-authorization.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';
import type { AdminDirectory } from './ports/admin-directory.js';
import type { CompanyRepository } from './ports/company-repository.js';

export interface ListCompaniesDeps {
  readonly repo: Pick<CompanyRepository, 'findAll'>;
  readonly states: Pick<AccountStateRepository, 'getAll'>;
  readonly admins: AdminDirectory;
}

export interface CompanyWithState {
  readonly company: Company;
  /** Null only if the state could not be found, which a company always has. */
  readonly state: AccountState | null;
}

/** Every company with its account state, for admins only; anyone else gets Forbidden, never learning
 *  whether any companies exist. */
export async function listCompanies(
  deps: ListCompaniesDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<CompanyWithState[], Forbidden>> {
  const allowed = await requireCompanyAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  const [companies, states] = await Promise.all([deps.repo.findAll(), deps.states.getAll()]);
  const byCompany = new Map(states.map((state) => [state.companyId, state]));
  return ok(companies.map((company) => ({ company, state: byCompany.get(company.id) ?? null })));
}
