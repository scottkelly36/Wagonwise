import { err, ok, type Result } from '../../../shared/result.js';
import type { HazardReport, HazardReportId } from '../domain/hazard-report.js';
import type { HazardReportNotFound } from './errors.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface GetHazardDeps {
  readonly repo: HazardRepository;
}

export interface GetHazardInput {
  readonly id: HazardReportId;
}

export type GetHazardError = HazardReportNotFound;

/** No ownership check — same reasoning as confirm/dismiss (decision 63): a hazard report is
 *  community data, visible to any authenticated driver, not scoped to its reporter. */
export async function getHazard(
  deps: GetHazardDeps,
  input: GetHazardInput,
): Promise<Result<HazardReport, GetHazardError>> {
  const report = await deps.repo.findById(input.id);
  if (!report) {
    return err({ tag: 'HazardReportNotFound' });
  }
  return ok(report);
}
