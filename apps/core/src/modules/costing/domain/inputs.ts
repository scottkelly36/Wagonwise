import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId, VehicleId } from './fuel.js';

export type RunningCostId = Id<'RunningCostId'>;
export type DriverRateId = Id<'DriverRateId'>;
export type DriverId = Id<'DriverId'>;

/** A month as `YYYY-MM`. */
export type MonthString = string;
/** A day as `YYYY-MM-DD`. */
export type DayString = string;

export const MAX_DESCRIPTION = 80;
/** £1,000,000 a month, in pence: a typing slip, not a cost. */
export const MAX_MONTHLY_PENCE = 100_000_000;
/** £500 an hour, in pence. */
export const MAX_HOURLY_PENCE = 50_000;

/**
 * A cost the firm carries every month from `fromMonth` until `toMonth` (or for ever, when that is absent): for one vehicle
 * (finance, insurance, road tax, a service plan) or, with no vehicle, for the firm as a whole (an overhead).
 */
export interface RunningCost {
  readonly id: RunningCostId;
  readonly companyId: CompanyId;
  readonly vehicleId: VehicleId | undefined;
  readonly description: string;
  readonly monthlyPence: number;
  readonly fromMonth: MonthString;
  readonly toMonth: MonthString | undefined;
}

export interface DriverRate {
  readonly id: DriverRateId;
  readonly companyId: CompanyId;
  readonly driverId: DriverId;
  readonly hourlyPence: number;
  readonly fromDay: DayString;
}

export interface InvalidRunningCost extends TaggedError<'InvalidRunningCost'> {
  readonly reason: 'description' | 'amount' | 'month';
}
export interface InvalidCostChange extends TaggedError<'InvalidCostChange'> {
  readonly reason: 'before_start' | 'after_end' | 'already_ended';
}
export interface InvalidRate extends TaggedError<'InvalidRate'> {
  readonly reason: 'amount' | 'day';
}

export const isMonth = (raw: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(raw);
export const isDay = (raw: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === raw;
};

const index = (month: MonthString): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};
const fromIndex = (i: number): MonthString =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const previousMonth = (month: MonthString): MonthString => fromIndex(index(month) - 1);

/** Whether the cost applies in that month. */
export const isActiveIn = (
  cost: Pick<RunningCost, 'fromMonth' | 'toMonth'>,
  month: MonthString,
): boolean => cost.fromMonth <= month && (cost.toMonth === undefined || cost.toMonth >= month);

/** Text trimmed, the amount a whole number of pence up to a sane limit, and a real month. */
export function validateRunningCost(input: {
  readonly description: string;
  readonly monthlyPence: number;
  readonly fromMonth: string;
}): Result<
  { description: string; monthlyPence: number; fromMonth: MonthString },
  InvalidRunningCost
> {
  const description = input.description.trim();
  if (description.length === 0 || description.length > MAX_DESCRIPTION) {
    return err({ tag: 'InvalidRunningCost', reason: 'description' });
  }
  if (
    !Number.isInteger(input.monthlyPence) ||
    input.monthlyPence < 0 ||
    input.monthlyPence > MAX_MONTHLY_PENCE
  ) {
    return err({ tag: 'InvalidRunningCost', reason: 'amount' });
  }
  if (!isMonth(input.fromMonth)) return err({ tag: 'InvalidRunningCost', reason: 'month' });
  return ok({ description, monthlyPence: input.monthlyPence, fromMonth: input.fromMonth });
}

export type CostChangePlan =
  | { readonly kind: 'update' }
  | { readonly kind: 'split'; readonly closeTo: MonthString; readonly newFrom: MonthString };

/**
 * How to change a cost from `fromMonth` on without rewriting the months before it: from the month it started, the row is
 * updated; from a later month the old row closes the month before and a new one carries on.
 */
export function planChange(
  cost: Pick<RunningCost, 'fromMonth' | 'toMonth'>,
  fromMonth: MonthString,
): Result<CostChangePlan, InvalidCostChange> {
  if (fromMonth < cost.fromMonth) return err({ tag: 'InvalidCostChange', reason: 'before_start' });
  if (cost.toMonth !== undefined && fromMonth > cost.toMonth) {
    return err({ tag: 'InvalidCostChange', reason: 'after_end' });
  }
  if (fromMonth === cost.fromMonth) return ok({ kind: 'update' });
  return ok({ kind: 'split', closeTo: previousMonth(fromMonth), newFrom: fromMonth });
}

export type CostStopPlan =
  { readonly kind: 'remove' } | { readonly kind: 'end'; readonly toMonth: MonthString };

/** How to stop a cost from `fromMonth` on: it last applies the month before. */
export function planStop(
  cost: Pick<RunningCost, 'fromMonth' | 'toMonth'>,
  fromMonth: MonthString,
): Result<CostStopPlan, InvalidCostChange> {
  if (cost.toMonth !== undefined && fromMonth > cost.toMonth) {
    return err({ tag: 'InvalidCostChange', reason: 'already_ended' });
  }
  if (fromMonth <= cost.fromMonth) return ok({ kind: 'remove' });
  return ok({ kind: 'end', toMonth: previousMonth(fromMonth) });
}

export function validateRate(input: {
  readonly hourlyPence: number;
  readonly fromDay: string;
}): Result<{ hourlyPence: number; fromDay: DayString }, InvalidRate> {
  if (
    !Number.isInteger(input.hourlyPence) ||
    input.hourlyPence < 1 ||
    input.hourlyPence > MAX_HOURLY_PENCE
  ) {
    return err({ tag: 'InvalidRate', reason: 'amount' });
  }
  if (!isDay(input.fromDay)) return err({ tag: 'InvalidRate', reason: 'day' });
  return ok({ hourlyPence: input.hourlyPence, fromDay: input.fromDay });
}

/** What a driver costs an hour on a day: the latest rate that has started by then, or `undefined` if none has. */
export function rateOn(
  rates: readonly Pick<DriverRate, 'driverId' | 'fromDay' | 'hourlyPence'>[],
  driverId: DriverId,
  day: DayString,
): number | undefined {
  let best: { fromDay: DayString; hourlyPence: number } | undefined;
  for (const r of rates) {
    if (r.driverId !== driverId || r.fromDay > day) continue;
    if (best === undefined || r.fromDay > best.fromDay) best = r;
  }
  return best?.hourlyPence;
}
