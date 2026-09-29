import { err, ok, type Result } from '../../../shared/result.js';
import type { DriverId, HazardReportId } from '../domain/hazard-report.js';
import { requireHazardAdmin, type Forbidden } from './authorization.js';
import type { HazardReportNotFound } from './errors.js';
import type { AdminDirectory } from './ports/admin-directory.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface DeleteHazardDeps {
  readonly repo: Pick<HazardRepository, 'findById' | 'deleteById'>;
  readonly admins: AdminDirectory;
}

export interface DeleteHazardInput {
  readonly callerId: DriverId;
  readonly id: HazardReportId;
}

export type DeleteHazardError = Forbidden | HazardReportNotFound;

/** True removal (field-testing request, 2026-09-26: "give my account the ability to remove
 *  hazards, I've been making some as tests") — distinct from `dismissHazard`, which only ever
 *  flips `status` and leaves the row. Admins only (`authorization.ts`, P2-M1.8), checked before
 *  the report is looked up so a non-admin can't tell whether an id exists. */
export async function deleteHazard(
  deps: DeleteHazardDeps,
  input: DeleteHazardInput,
): Promise<Result<void, DeleteHazardError>> {
  const allowed = await requireHazardAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'HazardReportNotFound' });
  }
  await deps.repo.deleteById(input.id);
  return ok(undefined);
}
