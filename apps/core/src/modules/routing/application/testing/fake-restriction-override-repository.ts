import type { GeoPoint } from '../../domain/geo.js';
import type { RestrictionOverride } from '../../domain/restriction-override.js';
import type { RestrictionOverrideRepository } from '../ports/restriction-override-repository.js';

/** Configurable result + a log of every corridor asked about, mirroring `FakeHazardAvoidanceQuery`
 *  — no realistic distance filtering needed here for the same reason that one has none: callers
 *  set `.overrides` directly to whatever the test is asserting on. */
export class FakeRestrictionOverrideRepository implements RestrictionOverrideRepository {
  overrides: RestrictionOverride[] = [];
  readonly corridors: (readonly GeoPoint[])[] = [];

  findNearbyLine(points: readonly GeoPoint[]): Promise<RestrictionOverride[]> {
    this.corridors.push(points);
    return Promise.resolve(this.overrides);
  }
}
