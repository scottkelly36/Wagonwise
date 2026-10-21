import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { VehicleId } from '../domain/maintenance.js';
import { suggestDates, type DateSuggestion } from '../domain/vehicle-lookup.js';
import { canManage, type Forbidden } from './item-types.js';
import type { StaffCaller } from './ports/directories.js';
import type {
  LookupNotFound,
  LookupUnavailable,
  VehicleDates,
  VehicleLookup,
} from './ports/vehicle-lookup.js';
import type { ScheduleDeps, VehicleNotFound } from './schedule.js';

/** No key has been set, so the lookup is off. */
export type LookupNotConfigured = TaggedError<'LookupNotConfigured'>;
/** The vehicle has no registration on file to look up. */
export type NoRegistration = TaggedError<'NoRegistration'>;

export interface LookupDeps extends ScheduleDeps {
  readonly lookup: VehicleLookup;
}

export interface LookupOutcome extends VehicleDates {
  readonly registration: string;
  /** Dates that differ from what is held, for the firm's own MOT and tax items. Nothing is saved until the firm takes them. */
  readonly suggestions: readonly DateSuggestion[];
}

/**
 * Asks the vehicle record for the vehicle's MOT and road tax dates and matches them to the firm's own items. It saves
 * nothing: the portal shows the dates and the person fills them in with the usual "set due date" call. Needs
 * `manage_maintenance`, as filling the dates in does.
 */
export async function lookupVehicleDates(
  deps: LookupDeps,
  caller: StaffCaller,
  vehicleId: VehicleId,
): Promise<
  Result<
    LookupOutcome,
    | Forbidden
    | VehicleNotFound
    | LookupNotConfigured
    | NoRegistration
    | LookupNotFound
    | LookupUnavailable
  >
> {
  const vehicle = await deps.vehicles.find(vehicleId);
  if (vehicle === null || (caller.kind === 'fleet' && caller.companyId !== vehicle.companyId)) {
    return err({ tag: 'VehicleNotFound' });
  }
  if (!canManage(caller, vehicle.companyId)) return err({ tag: 'Forbidden' });
  if (!deps.lookup.configured) return err({ tag: 'LookupNotConfigured' });
  const registration = vehicle.registration?.trim();
  if (registration === undefined || registration === '') return err({ tag: 'NoRegistration' });

  const found = await deps.lookup.lookup(registration);
  if (!found.ok) return found;

  const [items, schedules] = await Promise.all([
    deps.items.listForCompany(vehicle.companyId),
    deps.schedules.listForVehicle(vehicleId),
  ]);
  const due = new Map(schedules.map((s) => [s.itemTypeId, s.dueDate]));
  return ok({
    registration,
    ...found.value,
    suggestions: suggestDates(items, vehicleId, found.value, (id) => due.get(id)),
  });
}
