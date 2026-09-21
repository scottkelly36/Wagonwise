import type { HazardReport } from '../domain/hazard-report';

export interface HazardRepository {
  listActive(): Promise<HazardReport[]>;
}

export async function listActive(repo: HazardRepository): Promise<HazardReport[]> {
  return repo.listActive();
}
