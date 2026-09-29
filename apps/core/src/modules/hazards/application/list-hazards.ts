import { ok, type Result } from '../../../shared/result.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { requireHazardAdmin, type Forbidden } from './authorization.js';
import type { AdminDirectory, StaffId } from './ports/admin-directory.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface ListHazardsDeps {
  readonly repo: Pick<HazardRepository, 'findAll'>;
  readonly admins: AdminDirectory;
}

/** The dashboard's Hazard reports admin screen's own read (2026-09-27) — every report, any
 *  status. Admins only (`authorization.ts`); anyone else gets `Forbidden`, never a partial list. */
export async function listHazards(
  deps: ListHazardsDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<HazardReport[], Forbidden>> {
  const allowed = await requireHazardAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.repo.findAll());
}
