import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  STARTER_ITEMS,
  validateItemType,
  type CompanyId,
  type InvalidItemType,
  type ItemType,
  type ItemTypeId,
  type ItemTypeInput,
  type VehicleId,
} from '../domain/maintenance.js';
import type { StaffCaller, VehicleDirectory } from './ports/directories.js';
import type { ItemTypeRepository } from './ports/item-type-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown id, or an item of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type ItemNotFound = TaggedError<'ItemNotFound'>;
export type VehicleNotInCompany = TaggedError<'VehicleNotInCompany'>;

export interface ItemTypeDeps {
  readonly items: ItemTypeRepository;
  readonly vehicles: VehicleDirectory;
  readonly clock: Clock;
}

/** Whoever looks after the fleet or the day may see what is tracked, and anyone who sees reports. */
export function canView(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId &&
      ['manage_maintenance', 'manage_fleet', 'dispatch', 'view_reports'].some((p) =>
        caller.privileges.includes(p),
      ))
  );
}

/** Keeping the dates is for those given `manage_maintenance` (managers have it); WagonWise staff can for any company. */
export function canManage(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('manage_maintenance'))
  );
}

export async function listItemTypes(
  deps: Pick<ItemTypeDeps, 'items'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<ItemType[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.items.listForCompany(companyId));
}

/** The example items (MOT, safety inspection, service...), to start from. Nothing is stored until the firm saves them. */
export function starterItemTypes(): ItemTypeInput[] {
  return STARTER_ITEMS.map((s) => ({ ...s, vehicleIds: [] }));
}

async function vehiclesAreTheirs(
  deps: Pick<ItemTypeDeps, 'vehicles'>,
  companyId: CompanyId,
  ids: readonly VehicleId[],
): Promise<boolean> {
  if (ids.length === 0) return true;
  const own = new Set((await deps.vehicles.listForCompany(companyId)).map((v) => v.id));
  return ids.every((id) => own.has(id));
}

export async function createItemType(
  deps: ItemTypeDeps,
  caller: StaffCaller,
  input: ItemTypeInput & { readonly id: ItemTypeId; readonly companyId: CompanyId },
): Promise<Result<ItemType, Forbidden | InvalidItemType | VehicleNotInCompany>> {
  if (!canManage(caller, input.companyId)) return err({ tag: 'Forbidden' });
  const valid = validateItemType(input);
  if (!valid.ok) return valid;
  if (!(await vehiclesAreTheirs(deps, input.companyId, valid.value.vehicleIds))) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  // A retry after a dropped connection sends the same id: it returns the item already made.
  const existing = await deps.items.findById(input.id);
  if (existing !== null && existing.companyId === input.companyId) return ok(existing);
  if (existing !== null) return err({ tag: 'Forbidden' });

  const now = deps.clock.now();
  const item: ItemType = {
    id: input.id,
    companyId: input.companyId,
    ...valid.value,
    archivedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await deps.items.save(item);
  return ok(item);
}

export async function updateItemType(
  deps: ItemTypeDeps,
  caller: StaffCaller,
  id: ItemTypeId,
  input: ItemTypeInput,
): Promise<Result<ItemType, Forbidden | ItemNotFound | InvalidItemType | VehicleNotInCompany>> {
  const existing = await deps.items.findById(id);
  if (
    existing === null ||
    existing.archivedAt !== undefined ||
    !canView(caller, existing.companyId)
  ) {
    return err({ tag: 'ItemNotFound' });
  }
  if (!canManage(caller, existing.companyId)) return err({ tag: 'Forbidden' });
  const valid = validateItemType(input);
  if (!valid.ok) return valid;
  if (!(await vehiclesAreTheirs(deps, existing.companyId, valid.value.vehicleIds))) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  const updated: ItemType = { ...existing, ...valid.value, updatedAt: deps.clock.now() };
  await deps.items.save(updated);
  return ok(updated);
}

/** Hides an item. It is not deleted: what was recorded against it keeps its meaning. */
export async function archiveItemType(
  deps: Pick<ItemTypeDeps, 'items' | 'clock'>,
  caller: StaffCaller,
  id: ItemTypeId,
): Promise<Result<void, Forbidden | ItemNotFound>> {
  const existing = await deps.items.findById(id);
  if (
    existing === null ||
    existing.archivedAt !== undefined ||
    !canView(caller, existing.companyId)
  ) {
    return err({ tag: 'ItemNotFound' });
  }
  if (!canManage(caller, existing.companyId)) return err({ tag: 'Forbidden' });
  await deps.items.save({ ...existing, archivedAt: deps.clock.now() });
  return ok(undefined);
}
