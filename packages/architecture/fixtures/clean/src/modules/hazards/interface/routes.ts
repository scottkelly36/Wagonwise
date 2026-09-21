import { listActive, type HazardRepository } from '../application/list-active';

export function makeRoutes(repo: HazardRepository) {
  return () => listActive(repo);
}
