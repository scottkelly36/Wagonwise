import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import type { Company, CompanyId } from '../domain/company.js';
import type { StaffId } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import { requireCompanyAdmin } from './company-authorization.js';
import type { AdminDirectory } from './ports/admin-directory.js';
import type { CompanyRepository } from './ports/company-repository.js';

export interface CreateCompanyDeps {
  readonly repo: Pick<CompanyRepository, 'save'>;
  readonly clock: Clock;
  readonly admins: AdminDirectory;
}

export interface CreateCompanyInput {
  readonly callerId: StaffId;
  readonly id: CompanyId;
  readonly name: string;
}

/** Admins only (`company-authorization.ts`). Beyond that, no domain rule but "the name isn't
 *  blank," already enforced by contracts' `createCompanyRequestSchema` before this runs. Not
 *  idempotent on `id` the way a driver's own report is (decision 62's offline-queue reasoning) —
 *  an admin creating the same company twice by mistake just gets two rows; nothing here needs to
 *  detect or merge that yet. */
export async function createCompany(
  deps: CreateCompanyDeps,
  input: CreateCompanyInput,
): Promise<Result<Company, Forbidden>> {
  const allowed = await requireCompanyAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  const company: Company = {
    id: input.id,
    name: input.name,
    createdAt: deps.clock.now(),
  };
  await deps.repo.save(company);
  return ok(company);
}
