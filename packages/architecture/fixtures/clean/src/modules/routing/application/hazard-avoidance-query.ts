import type { ReportedObstruction } from '../domain/avoidance-policy';

export interface HazardAvoidanceQuery {
  activeNear(): Promise<ReportedObstruction[]>;
}
