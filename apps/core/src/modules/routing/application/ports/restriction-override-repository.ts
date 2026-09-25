import type { GeoPoint } from '../../domain/geo.js';
import type { RestrictionOverride } from '../../domain/restriction-override.js';

export interface RestrictionOverrideRepository {
  /** Overrides within `radiusM` of a corridor — a decoded route polyline, same shape as
   *  hazards' own `findNearbyLine` (`hazards/application/ports/hazard-repository.ts`). Degrades
   *  to a plain radius check for a single point. */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<RestrictionOverride[]>;
}
