import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, ItemTypeId, VehicleId } from '../domain/maintenance.js';
import { suggestDates, type DateSuggestion } from '../domain/vehicle-lookup.js';
import { canManage, type Forbidden } from './item-types.js';
import type { LookupDeps, LookupNotConfigured } from './lookup.js';
import type { StaffCaller } from './ports/directories.js';
import type { VehicleDates } from './ports/vehicle-lookup.js';

/** The most vehicles one press looks up. A bigger fleet is checked in more than one go (the rest are counted, not dropped quietly). */
export const MAX_FLEET_LOOKUPS = 60;
/** Lookups in flight at once: a few at a time is quick and gentle on the services. */
const CONCURRENCY = 3;

export interface FleetLookupRow extends VehicleDates {
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  readonly registration: string;
  /** `checked`: the record answered. `not_found`: it has no such registration. `unavailable`: it could not be reached. */
  readonly outcome: 'checked' | 'not_found' | 'unavailable';
  /** Dates that differ from what is held, for the firm's own MOT and tax items. Nothing is saved until the firm takes them. */
  readonly suggestions: readonly DateSuggestion[];
}

export interface FleetLookupResult {
  readonly rows: readonly FleetLookupRow[];
  /** Vehicles with no registration saved, which cannot be looked up. */
  readonly withoutRegistration: number;
  /** Vehicles with a registration beyond `MAX_FLEET_LOOKUPS`, left for another press. */
  readonly notChecked: number;
}

/** Runs `work` over `items` with at most `limit` at a time, keeping the results in the order of the items. */
async function inBatches<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Asks the vehicle records about every vehicle of the company that has a registration, and matches the answers to the firm's
 * own MOT and tax items. It saves nothing: the portal shows what would change, and the manager takes what they want through the
 * usual bulk import. A manager presses it; nothing runs by itself. Needs `manage_maintenance`, as filling the dates in does.
 */
export async function lookupFleetDates(
  deps: LookupDeps,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<FleetLookupResult, Forbidden | LookupNotConfigured>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  if (!deps.lookup.configured) return err({ tag: 'LookupNotConfigured' });

  const [vehicles, items, schedules] = await Promise.all([
    deps.vehicles.listForCompany(companyId),
    deps.items.listForCompany(companyId),
    deps.schedules.listForCompany(companyId),
  ]);
  const due = new Map<string, string>(
    schedules.map((s) => [`${s.vehicleId}|${s.itemTypeId}`, s.dueDate]),
  );
  const withRegistration = vehicles.filter((v) => (v.registration ?? '').trim() !== '');
  const toCheck = withRegistration.slice(0, MAX_FLEET_LOOKUPS);

  const rows = await inBatches(toCheck, CONCURRENCY, async (vehicle): Promise<FleetLookupRow> => {
    const registration = (vehicle.registration ?? '').trim();
    const base = { vehicleId: vehicle.id, vehicleName: vehicle.name, registration };
    const found = await deps.lookup.lookup(registration);
    if (!found.ok) {
      return {
        ...base,
        outcome: found.error.tag === 'LookupNotFound' ? 'not_found' : 'unavailable',
        suggestions: [],
      };
    }
    return {
      ...base,
      ...found.value,
      outcome: 'checked',
      suggestions: suggestDates(items, vehicle.id, found.value, (id: ItemTypeId) =>
        due.get(`${vehicle.id}|${id}`),
      ),
    };
  });

  return ok({
    rows,
    withoutRegistration: vehicles.length - withRegistration.length,
    notChecked: withRegistration.length - toCheck.length,
  });
}
