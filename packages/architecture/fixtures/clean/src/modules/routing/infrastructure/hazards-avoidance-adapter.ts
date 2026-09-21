// Cross-context read: goes through the other module's facade and translates into
// routing's own type. This is the allowed shape (AGENTS.md rule 7).
import { listActive, type HazardRepository } from '../../hazards/api';
import type { HazardAvoidanceQuery } from '../application/hazard-avoidance-query';
import type { ReportedObstruction } from '../domain/avoidance-policy';

export function createHazardAvoidanceAdapter(repo: HazardRepository): HazardAvoidanceQuery {
  return {
    async activeNear(): Promise<ReportedObstruction[]> {
      const reports = await listActive(repo);
      return reports.map((r) => ({ id: r.id, limitM: r.heightLimitM }));
    },
  };
}
