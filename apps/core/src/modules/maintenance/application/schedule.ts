import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  addInterval,
  appliesToVehicle,
  buildOverview,
  ukDay,
  validateDay,
  MAX_NOTE,
  type CompanyId,
  type DayString,
  type HistoryEntry,
  type InvalidDay,
  type ItemType,
  type ItemTypeId,
  type OverviewRow,
  type Schedule,
  type StaffId,
  type VehicleId,
} from '../domain/maintenance.js';
import { canManage, canView, type Forbidden, type ItemNotFound } from './item-types.js';
import type { StaffCaller, VehicleDirectory } from './ports/directories.js';
import type { ItemTypeRepository } from './ports/item-type-repository.js';
import type { ScheduleRepository } from './ports/schedule-repository.js';

export type VehicleNotFound = TaggedError<'VehicleNotFound'>;
/** The item does not apply to that vehicle (it is only for other vehicles). */
export type ItemNotForVehicle = TaggedError<'ItemNotForVehicle'>;
export interface InvalidWork extends TaggedError<'InvalidWork'> {
  readonly reason: 'done_in_future' | 'next_not_after_done' | 'note_too_long';
}

export interface ScheduleDeps {
  readonly items: ItemTypeRepository;
  readonly schedules: ScheduleRepository;
  readonly vehicles: VehicleDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Everything tracked across the company's vehicles, most urgent first. */
export async function maintenanceOverview(
  deps: ScheduleDeps,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<OverviewRow[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  const [itemTypes, vehicles, schedules] = await Promise.all([
    deps.items.listForCompany(companyId),
    deps.vehicles.listForCompany(companyId),
    deps.schedules.listForCompany(companyId),
  ]);
  return ok(buildOverview({ itemTypes, vehicles, schedules, today: ukDay(deps.clock.now()) }));
}

/** One vehicle's items, with what was done to it, newest first. */
export async function vehicleMaintenance(
  deps: ScheduleDeps,
  caller: StaffCaller,
  vehicleId: VehicleId,
): Promise<Result<{ rows: OverviewRow[]; history: HistoryEntry[] }, Forbidden | VehicleNotFound>> {
  const vehicle = await deps.vehicles.find(vehicleId);
  if (vehicle === null || !seesCompany(caller, vehicle.companyId)) {
    return err({ tag: 'VehicleNotFound' });
  }
  if (!canView(caller, vehicle.companyId)) return err({ tag: 'Forbidden' });
  const [itemTypes, schedules, history] = await Promise.all([
    deps.items.listForCompany(vehicle.companyId),
    deps.schedules.listForVehicle(vehicleId),
    deps.schedules.listHistory(vehicleId),
  ]);
  const rows = buildOverview({
    itemTypes,
    vehicles: [vehicle],
    schedules,
    today: ukDay(deps.clock.now()),
  });
  return ok({ rows, history });
}

/** A company's staff know their own company's vehicles exist, whatever their privileges; others know nothing. */
function seesCompany(caller: StaffCaller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

type TargetError = Forbidden | VehicleNotFound | ItemNotFound | ItemNotForVehicle;

async function target(
  deps: ScheduleDeps,
  caller: StaffCaller,
  vehicleId: VehicleId,
  itemTypeId: ItemTypeId,
): Promise<Result<{ companyId: CompanyId; item: ItemType }, TargetError>> {
  const vehicle = await deps.vehicles.find(vehicleId);
  if (vehicle === null || !seesCompany(caller, vehicle.companyId)) {
    return err({ tag: 'VehicleNotFound' });
  }
  const item = await deps.items.findById(itemTypeId);
  if (item === null || item.archivedAt !== undefined || item.companyId !== vehicle.companyId) {
    return err({ tag: 'ItemNotFound' });
  }
  if (!canManage(caller, vehicle.companyId)) return err({ tag: 'Forbidden' });
  if (!appliesToVehicle(item, vehicleId)) return err({ tag: 'ItemNotForVehicle' });
  return ok({ companyId: vehicle.companyId, item });
}

/**
 * Sets when the item is next due on the vehicle: the first time a date is entered, or a correction. What was last done
 * is kept. To record the work itself, with its date and a note, use `markDone`.
 */
export async function setDueDate(
  deps: ScheduleDeps,
  caller: StaffCaller,
  staffId: StaffId,
  vehicleId: VehicleId,
  itemTypeId: ItemTypeId,
  rawDueDate: string,
): Promise<Result<Schedule, TargetError | InvalidDay>> {
  const found = await target(deps, caller, vehicleId, itemTypeId);
  if (!found.ok) return found;
  const due = validateDay(rawDueDate);
  if (!due.ok) return due;
  const before = await deps.schedules.find(vehicleId, itemTypeId);
  const schedule: Schedule = {
    vehicleId,
    itemTypeId,
    dueDate: due.value,
    lastDone: before?.lastDone,
  };
  await deps.schedules.upsert(found.value.companyId, schedule, staffId, deps.clock.now());
  return ok(schedule);
}

export interface MarkDoneInput {
  /** The day the work was done; today if left out. Never a day to come. */
  readonly doneOn?: string | undefined;
  /** When it is next due; the item's interval after `doneOn` if left out. */
  readonly nextDue?: string | undefined;
  readonly note?: string | undefined;
}

/**
 * Records that the item was done on the vehicle. It is kept in the history, and the next due date moves on: to `nextDue`
 * if given (an MOT renewed early keeps its date, say), otherwise the item's interval after the day it was done.
 */
export async function markDone(
  deps: ScheduleDeps,
  caller: StaffCaller,
  staffId: StaffId,
  vehicleId: VehicleId,
  itemTypeId: ItemTypeId,
  input: MarkDoneInput,
): Promise<Result<Schedule, TargetError | InvalidDay | InvalidWork>> {
  const found = await target(deps, caller, vehicleId, itemTypeId);
  if (!found.ok) return found;
  const today = ukDay(deps.clock.now());

  const doneOn = input.doneOn === undefined ? ok<DayString>(today) : validateDay(input.doneOn);
  if (!doneOn.ok) return doneOn;
  if (doneOn.value > today) return err({ tag: 'InvalidWork', reason: 'done_in_future' });

  const { item } = found.value;
  const nextDue =
    input.nextDue === undefined
      ? ok<DayString>(addInterval(doneOn.value, item.intervalValue, item.intervalUnit))
      : validateDay(input.nextDue);
  if (!nextDue.ok) return nextDue;
  if (nextDue.value <= doneOn.value)
    return err({ tag: 'InvalidWork', reason: 'next_not_after_done' });

  const note = input.note?.trim();
  if (note !== undefined && note.length > MAX_NOTE) {
    return err({ tag: 'InvalidWork', reason: 'note_too_long' });
  }

  const now = deps.clock.now();
  const schedule: Schedule = {
    vehicleId,
    itemTypeId,
    dueDate: nextDue.value,
    lastDone: doneOn.value,
  };
  await deps.schedules.addHistory(found.value.companyId, {
    id: deps.ids.newId(),
    vehicleId,
    itemTypeId,
    itemName: item.name,
    doneOn: doneOn.value,
    nextDue: nextDue.value,
    note: note === '' ? undefined : note,
    doneBy: staffId,
    recordedAt: now,
  });
  await deps.schedules.upsert(found.value.companyId, schedule, staffId, now);
  return ok(schedule);
}
