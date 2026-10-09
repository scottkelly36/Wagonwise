import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type ItemTypeId = Id<'MaintenanceItemId'>;
// maintenance owns its own CompanyId, StaffId and FleetVehicleId (same brand names as every module's copy, so a value
// another module makes is usable here via makeId() without importing across the boundary).
export type CompanyId = Id<'CompanyId'>;
export type StaffId = Id<'StaffId'>;
export type VehicleId = Id<'FleetVehicleId'>;

/** A calendar day as `YYYY-MM-DD`, in UK time. */
export type DayString = string;

export const MAX_NAME = 80;
export const MAX_NOTE = 500;
export const MAX_INTERVAL = 1200;
export const MAX_WARN_DAYS = 365;

export type IntervalUnit = 'days' | 'weeks' | 'months';
export const INTERVAL_UNITS: readonly IntervalUnit[] = ['days', 'weeks', 'months'];

/**
 * One thing that falls due on a company's vehicles, which the firm names itself: MOT, a safety inspection, a service,
 * a tachograph calibration. It repeats at an interval, warns a number of days before it is due, and applies to all of
 * the company's vehicles or only chosen ones. A removed one is archived, not deleted, so the history stays.
 */
export interface ItemType {
  readonly id: ItemTypeId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly intervalValue: number;
  readonly intervalUnit: IntervalUnit;
  /** From this many days before it is due, the item shows as due soon. */
  readonly warnDays: number;
  readonly appliesTo: 'all' | 'selected';
  readonly vehicleIds: readonly VehicleId[];
  readonly archivedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ItemTypeInput {
  readonly name: string;
  readonly intervalValue: number;
  readonly intervalUnit: IntervalUnit;
  readonly warnDays: number;
  readonly appliesTo: 'all' | 'selected';
  readonly vehicleIds: readonly VehicleId[];
}

export interface InvalidItemType extends TaggedError<'InvalidItemType'> {
  readonly reason: 'name' | 'interval' | 'warn_days' | 'no_vehicles_selected';
}

/** Trims the name and refuses an item that makes no sense: no name, an interval that is not a whole number of days,
 *  weeks or months, or a warning period that is negative or a year long. */
export function validateItemType(input: ItemTypeInput): Result<ItemTypeInput, InvalidItemType> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > MAX_NAME)
    return err({ tag: 'InvalidItemType', reason: 'name' });
  if (
    !INTERVAL_UNITS.includes(input.intervalUnit) ||
    !Number.isInteger(input.intervalValue) ||
    input.intervalValue < 1 ||
    input.intervalValue > MAX_INTERVAL
  ) {
    return err({ tag: 'InvalidItemType', reason: 'interval' });
  }
  if (!Number.isInteger(input.warnDays) || input.warnDays < 0 || input.warnDays > MAX_WARN_DAYS) {
    return err({ tag: 'InvalidItemType', reason: 'warn_days' });
  }
  if (input.appliesTo === 'selected' && input.vehicleIds.length === 0) {
    return err({ tag: 'InvalidItemType', reason: 'no_vehicles_selected' });
  }
  return ok({
    ...input,
    name,
    vehicleIds: input.appliesTo === 'all' ? [] : [...new Set(input.vehicleIds)],
  });
}

export function appliesToVehicle(
  item: Pick<ItemType, 'appliesTo' | 'vehicleIds'>,
  vehicleId: VehicleId,
): boolean {
  return item.appliesTo === 'all' || item.vehicleIds.includes(vehicleId);
}

// --- days -------------------------------------------------------------------------------------

export type InvalidDay = TaggedError<'InvalidDay'>;

/** A real calendar day (`2026-02-30` is not). */
export function validateDay(raw: string): Result<DayString, InvalidDay> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return err({ tag: 'InvalidDay' });
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw
    ? err({ tag: 'InvalidDay' })
    : ok(raw);
}

/** The UK calendar day an instant falls on. (billing and checks keep their own copies; modules share no code.) */
export function ukDay(at: Date): DayString {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const MS_PER_DAY = 86_400_000;
const toDate = (day: DayString): Date => new Date(`${day}T00:00:00.000Z`);

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DayString, to: DayString): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / MS_PER_DAY);
}

/**
 * `day` plus an interval. Months keep the day of the month, except that a day that does not exist in the later month
 * becomes that month's last day (31 January plus a month is 28 February), so a 12-month item stays on its date.
 */
export function addInterval(day: DayString, value: number, unit: IntervalUnit): DayString {
  const date = toDate(day);
  if (unit === 'days' || unit === 'weeks') {
    date.setUTCDate(date.getUTCDate() + (unit === 'weeks' ? value * 7 : value));
    return date.toISOString().slice(0, 10);
  }
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + value);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, lastDay));
  return date.toISOString().slice(0, 10);
}

// --- status -----------------------------------------------------------------------------------

/** overdue: the date has passed. due_soon: within the warning period. ok: further off. no_date: none entered yet. */
export type Status = 'overdue' | 'due_soon' | 'ok' | 'no_date';

export function statusOf(
  dueDate: DayString | undefined,
  today: DayString,
  warnDays: number,
): Status {
  if (dueDate === undefined) return 'no_date';
  const left = daysBetween(today, dueDate);
  if (left < 0) return 'overdue';
  return left <= warnDays ? 'due_soon' : 'ok';
}

/** What is known of one item on one vehicle: when it is next due, and when it was last done. */
export interface Schedule {
  readonly vehicleId: VehicleId;
  readonly itemTypeId: ItemTypeId;
  readonly dueDate: DayString;
  readonly lastDone: DayString | undefined;
}

/** One time an item was done on a vehicle, kept as it was said then (the item's name may change later). */
export interface HistoryEntry {
  readonly id: string;
  readonly vehicleId: VehicleId;
  readonly itemTypeId: ItemTypeId;
  readonly itemName: string;
  readonly doneOn: DayString;
  /** The next due date it set. */
  readonly nextDue: DayString;
  readonly note: string | undefined;
  readonly doneBy: StaffId | undefined;
  readonly recordedAt: Date;
}

export interface VehicleSummary {
  readonly id: VehicleId;
  readonly name: string;
  readonly registration: string | undefined;
}

export interface OverviewRow {
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  readonly registration: string | undefined;
  readonly itemTypeId: ItemTypeId;
  readonly itemName: string;
  readonly dueDate: DayString | undefined;
  readonly lastDone: DayString | undefined;
  readonly status: Status;
  /** Days until due (negative once overdue); absent when there is no date. */
  readonly daysUntil: number | undefined;
}

const RANK: Record<Status, number> = { overdue: 0, due_soon: 1, no_date: 2, ok: 3 };

/**
 * Every vehicle with every item that applies to it, most urgent first: overdue (the most overdue first), then due soon
 * (soonest first), then those with no date entered yet, then those that are fine (soonest first).
 */
export function buildOverview(input: {
  readonly itemTypes: readonly ItemType[];
  readonly vehicles: readonly VehicleSummary[];
  readonly schedules: readonly Schedule[];
  readonly today: DayString;
}): OverviewRow[] {
  const rows: OverviewRow[] = [];
  for (const item of input.itemTypes) {
    if (item.archivedAt !== undefined) continue;
    for (const vehicle of input.vehicles) {
      if (!appliesToVehicle(item, vehicle.id)) continue;
      const schedule = input.schedules.find(
        (s) => s.vehicleId === vehicle.id && s.itemTypeId === item.id,
      );
      const dueDate = schedule?.dueDate;
      rows.push({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        registration: vehicle.registration,
        itemTypeId: item.id,
        itemName: item.name,
        dueDate,
        lastDone: schedule?.lastDone,
        status: statusOf(dueDate, input.today, item.warnDays),
        daysUntil: dueDate === undefined ? undefined : daysBetween(input.today, dueDate),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.daysUntil ?? 0) - (b.daysUntil ?? 0) ||
      a.vehicleName.localeCompare(b.vehicleName) ||
      a.itemName.localeCompare(b.itemName),
  );
}

// --- the example list ---------------------------------------------------------------------------

/**
 * Examples to start from, not a standard and not complete. A firm edits them, and is responsible for what its own
 * vehicles need and how often.
 */
export const STARTER_ITEMS: readonly Omit<ItemTypeInput, 'vehicleIds'>[] = [
  { name: 'MOT', intervalValue: 12, intervalUnit: 'months', warnDays: 28, appliesTo: 'all' },
  {
    name: 'Safety inspection',
    intervalValue: 6,
    intervalUnit: 'weeks',
    warnDays: 7,
    appliesTo: 'all',
  },
  { name: 'Service', intervalValue: 6, intervalUnit: 'months', warnDays: 28, appliesTo: 'all' },
  {
    name: 'Tachograph calibration',
    intervalValue: 24,
    intervalUnit: 'months',
    warnDays: 56,
    appliesTo: 'all',
  },
  {
    name: 'Tail-lift examination',
    intervalValue: 6,
    intervalUnit: 'months',
    warnDays: 28,
    appliesTo: 'all',
  },
  { name: 'Road tax', intervalValue: 12, intervalUnit: 'months', warnDays: 28, appliesTo: 'all' },
];
