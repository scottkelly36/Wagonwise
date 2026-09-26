import { err, ok, type Result } from '../../../shared/result.js';
import type { HazardReportId } from '../domain/hazard-report.js';
import type { HazardReportNotFound } from './errors.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface DeleteHazardDeps {
  readonly repo: Pick<HazardRepository, 'findById' | 'deleteById'>;
}

export interface DeleteHazardInput {
  readonly id: HazardReportId;
}

export type DeleteHazardError = HazardReportNotFound;

/** True removal (field-testing request, 2026-09-26: "give my account the ability to remove
 *  hazards, I've been making some as tests") — distinct from `dismissHazard`, which only ever
 *  flips `status` and leaves the row. This use case has no notion of who's allowed to call it;
 *  the admin check happens in `interface/routes.ts`, the same separation authentication (401)
 *  already gets from every other use case here. */
export async function deleteHazard(
  deps: DeleteHazardDeps,
  input: DeleteHazardInput,
): Promise<Result<void, DeleteHazardError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'HazardReportNotFound' });
  }
  await deps.repo.deleteById(input.id);
  return ok(undefined);
}
