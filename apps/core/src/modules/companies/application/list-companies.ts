import { ok, type Result } from '../../../shared/result.js';
import type { Company, DriverId } from '../domain/company.js';
import type { Forbidden } from '../domain/staff-policy.js';
import { requireCompanyAdmin } from './company-authorization.js';
import type { AdminDirectory } from './ports/admin-directory.js';
import type { CompanyRepository } from './ports/company-repository.js';

export interface ListCompaniesDeps {
  readonly repo: Pick<CompanyRepository, 'findAll'>;
  readonly admins: AdminDirectory;
}

/** Every company, for admins only; anyone else gets `Forbidden`, never learning whether any
 *  companies exist. */
export async function listCompanies(
  deps: ListCompaniesDeps,
  input: { readonly callerId: DriverId },
): Promise<Result<Company[], Forbidden>> {
  const allowed = await requireCompanyAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.repo.findAll());
}
