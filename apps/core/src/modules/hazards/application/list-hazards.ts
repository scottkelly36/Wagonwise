import type { HazardReport } from '../domain/hazard-report.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface ListHazardsDeps {
  readonly repo: Pick<HazardRepository, 'findAll'>;
}

/** The dashboard's Hazard reports admin screen's own read (2026-09-27) — every report, any
 *  status, admin-gated at the interface layer. */
export async function listHazards(deps: ListHazardsDeps): Promise<HazardReport[]> {
  return deps.repo.findAll();
}
