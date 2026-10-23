import { err, ok, type Result } from '../../../shared/result.js';
import type {
  LookupNotFound,
  LookupUnavailable,
  VehicleDates,
  VehicleLookup,
} from '../application/ports/vehicle-lookup.js';

/**
 * Several sources asked at once and their answers joined: the MOT or annual test from the first that has one (DVSA, the
 * authority on tests), the road tax from the first that has one (DVLA). Listed in order of trust. One source being down or not
 * knowing the vehicle does not spoil what another found. If none answers, "not found" only if every source said so, otherwise
 * "unavailable" (try again later), so a busy service is never reported as a wrong registration.
 */
export class CombinedVehicleLookup implements VehicleLookup {
  readonly configured: boolean;

  constructor(private readonly sources: readonly VehicleLookup[]) {
    this.configured = sources.some((s) => s.configured);
  }

  async lookup(
    registration: string,
  ): Promise<Result<VehicleDates, LookupNotFound | LookupUnavailable>> {
    const asked = this.sources.filter((s) => s.configured);
    const results = await Promise.all(asked.map((s) => s.lookup(registration)));
    const found = results.flatMap((r) => (r.ok ? [r.value] : []));

    if (found.length === 0) {
      const everyoneSaidNotFound =
        results.length > 0 && results.every((r) => !r.ok && r.error.tag === 'LookupNotFound');
      return err({ tag: everyoneSaidNotFound ? 'LookupNotFound' : 'LookupUnavailable' });
    }

    const mot =
      found.find((d) => d.motExpiry !== undefined) ?? found.find((d) => d.motStatus !== undefined);
    const tax =
      found.find((d) => d.taxDue !== undefined) ?? found.find((d) => d.taxStatus !== undefined);
    return ok({
      motExpiry: mot?.motExpiry,
      motStatus: mot?.motStatus,
      taxDue: tax?.taxDue,
      taxStatus: tax?.taxStatus,
    });
  }
}
