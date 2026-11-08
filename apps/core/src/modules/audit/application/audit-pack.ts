import type { Clock } from '../../../shared/ports/clock.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  buildAuditPack,
  resolveRange,
  type AuditPack,
  type InvalidRange,
  type Names,
  type RawAuditData,
} from '../domain/audit-pack.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown vehicle, or one of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type NotFound = TaggedError<'NotFound'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

/** The records of one vehicle, read in whatever data scope the caller runs in. Implemented over the other contexts' tables. */
export interface AuditReader {
  collect(
    vehicleId: string,
    range: { readonly from: string; readonly to: string },
  ): Promise<RawAuditData>;
}

/** Supplied by composition over `fleet`. Read in the caller's data scope, so another company's vehicle is not found. */
export interface VehicleDirectory {
  find(vehicleId: string): Promise<{
    readonly id: string;
    readonly companyId: string;
    readonly name: string;
    readonly registration: string | undefined;
  } | null>;
}

/** Supplied by composition over `identity` and `companies`. */
export interface PeopleDirectory {
  /** A driver's name, or the sign-in the office already sees for them; `null` when neither is known. Read in the caller's scope. */
  driverLabel(driverId: string): Promise<string | null>;
  /**
   * The company's staff by id. Opens its own data scope, so it is called outside the caller's. Someone who has left is not in it.
   */
  staffNames(companyId: string): Promise<ReadonlyMap<string, string>>;
  /** The company's name. Opens its own data scope too, so it is called outside the caller's. */
  companyName(companyId: string): Promise<string | null>;
}

export interface AuditDeps {
  readonly reader: AuditReader;
  readonly vehicles: VehicleDirectory;
  readonly people: PeopleDirectory;
  readonly scopes: DataScopes;
  readonly clock: Clock;
}

export interface VehiclePack {
  readonly vehicle: {
    readonly id: string;
    readonly name: string;
    readonly registration: string | undefined;
    readonly company: string | undefined;
  };
  readonly pack: AuditPack;
}

/** The same people who may read a company's check results: fleet managers, dispatchers and anyone who sees reports. */
function canView(caller: StaffCaller): boolean {
  return (
    caller.kind === 'platform' ||
    ['manage_fleet', 'dispatch', 'view_reports'].some((p) => caller.privileges.includes(p))
  );
}

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

/**
 * One vehicle's checks, defects, repairs and maintenance for a range of UK days, with the people named and everything also set
 * out as one timeline. Read-only. A company's own staff see their vehicles only; WagonWise staff any.
 */
export async function getVehicleAuditPack(
  deps: AuditDeps,
  caller: StaffCaller,
  vehicleId: string,
  asked: { readonly from?: string | undefined; readonly to?: string | undefined },
): Promise<Result<VehiclePack, Forbidden | NotFound | InvalidRange>> {
  if (!canView(caller)) return err({ tag: 'Forbidden' });
  const now = deps.clock.now();
  const range = resolveRange(now, asked);
  if (!range.ok) return range;

  const read = await deps.scopes.run(scopeFor(caller), async () => {
    const vehicle = await deps.vehicles.find(vehicleId);
    if (vehicle === null) return null;
    if (caller.kind === 'fleet' && vehicle.companyId !== caller.companyId) return null;
    const raw = await deps.reader.collect(vehicleId, range.value);
    const driverIds = new Set([
      ...raw.checks.map((c) => c.driverId),
      ...raw.defects.map((d) => d.foundByDriverId),
    ]);
    const drivers = new Map<string, string>();
    for (const id of driverIds) {
      const label = await deps.people.driverLabel(id);
      if (label !== null) drivers.set(id, label);
    }
    return { vehicle, raw, drivers };
  });
  if (read === null) return err({ tag: 'NotFound' });

  const staff = await deps.people.staffNames(read.vehicle.companyId);
  const company = await deps.people.companyName(read.vehicle.companyId);
  const names: Names = {
    driver: (id) => read.drivers.get(id) ?? 'A driver',
    staff: (id) =>
      id === undefined ? undefined : (staff.get(id) ?? 'Someone no longer on the account'),
  };
  return ok({
    vehicle: {
      id: read.vehicle.id,
      name: read.vehicle.name,
      registration: read.vehicle.registration,
      company: company ?? undefined,
    },
    pack: buildAuditPack(read.raw, names, range.value, now),
  });
}
