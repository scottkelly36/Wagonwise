import type { HazardRepository } from '../application/list-active';
import type { HazardReport } from '../domain/hazard-report';

export class PostgresHazardRepository implements HazardRepository {
  listActive(): Promise<HazardReport[]> {
    return Promise.resolve([]);
  }
}
